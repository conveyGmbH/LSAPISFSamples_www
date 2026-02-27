const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const jsforce = require('jsforce');
const path = require('path');
require('dotenv').config();

const { transferLeadWithAutoFieldCreation } = require('./leadTransferService');
const fieldConfigStorage = require('./fieldConfigStorage');
const leadTransferStatusService = require('./leadTransferStatusService');

const app = express();
const port = process.env.PORT || 3000;


function determineEnvironmentAndConfig() {
    const isProd = process.env.NODE_ENV === 'production';
    const hostname = process.env.HOSTNAME || process.env.WEBSITE_HOSTNAME || '';
    const port = process.env.PORT || 3000;

    const isAzure = process.env.WEBSITE_HOSTNAME || process.env.WEBSITE_SITE_NAME;
    const isProductionHost = hostname.includes('convey.de') ||
                           hostname.includes('azurewebsites.net') ||
                           hostname.includes('azurestaticapps.net') ||
                           isAzure;

    const isProduction = isProd || isProductionHost || port !== 3000;

    let redirectUri;
    if (isProduction) {
        redirectUri = process.env.SF_REDIRECT_URI_PRODUCTION || 'https://lsapisfbackend.convey.de/oauth/callback';
    } else {
        redirectUri = process.env.SF_REDIRECT_URI_DEV || `http://localhost:${port}/oauth/callback`;
    }

    console.log(`Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`Hostname: ${hostname}`);
    console.log(`Port: ${port}`);
    console.log(`Azure: ${isAzure ? 'Yes' : 'No'}`);
    console.log(`OAuth Redirect URI: ${redirectUri}`);

    return {
        isProduction,
        redirectUri
    };
}

const envConfig = determineEnvironmentAndConfig();

const config = {
    environment: {
        isProduction: envConfig.isProduction
    },
    salesforce: {
        clientId: process.env.SF_CLIENT_ID || null,
        clientSecret: process.env.SF_CLIENT_SECRET || null,
        redirectUri: envConfig.redirectUri,
        loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com'
    },
    session: {
        secret: process.env.SESSION_SECRET || 'your_super_secret_session_key_change_this_in_production_123450000',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: envConfig.isProduction,
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            sameSite: envConfig.isProduction ? 'none' : 'lax', 
            domain: envConfig.isProduction ? undefined : 'localhost' 
        }
    }
};

if (!config.salesforce.clientId || !config.salesforce.clientSecret) {
    console.log('No default Salesforce credentials - clients will provide their own credentials');
}

const allowedOrigins = [
    'http://127.0.0.1:5504',
    'http://localhost:5504',
    'http://localhost:3000',
    'https://leadsuccess.convey.de/apisflsm/',
    'https://leadsuccess.convey.de',
    'https://lsapisfsamples.convey.de',
    'https://lstest.convey.de',
    'https://lsapisfbackend.convey.de',
    'https://deimos.convey.de',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else if (process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control', 'X-Session-Token', 'X-Org-Id']
}));
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(session(config.session));

// Homepage must be before static files middleware
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});
app.use(express.static(path.join(__dirname, '../')));

// --- SALESFORCE CONNECTION MANAGER ---

const connections = new Map();

function createConnection(sessionData) {
    const clientId = sessionData.clientId || config.salesforce.clientId;
    const clientSecret = sessionData.clientSecret || config.salesforce.clientSecret;
    const loginUrl = sessionData.loginUrl || config.salesforce.loginUrl;

    const conn = new jsforce.Connection({
        oauth2: {
            clientId: clientId,
            clientSecret: clientSecret,
            redirectUri: config.salesforce.redirectUri,
            loginUrl: loginUrl
        },
        accessToken: sessionData.accessToken,
        refreshToken: sessionData.refreshToken,
        instanceUrl: sessionData.instanceUrl
    });

    conn.on('refresh', (accessToken, res) => {
        console.log('Token refreshed for session:', sessionData._sessionId || sessionData.organizationId);
        sessionData.accessToken = accessToken;
        const key = sessionData._sessionId || sessionData.organizationId;
        connections.set(key, {
            ...sessionData,
            connection: conn,
            lastRefresh: new Date()
        });
    });

    return conn;
}

function storeConnection(sessionData, sessionId) {
    const key = sessionId || sessionData.organizationId;
    sessionData._sessionId = key; // Used by the token refresh handler
    const conn = createConnection(sessionData);
    connections.set(key, {
        ...sessionData,
        connection: conn,
        connectedAt: new Date(),
        lastRefresh: new Date()
    });
    console.log(`Stored connection for session: ${key} (org: ${sessionData.organizationId})`);
    return conn;
}

function getConnection(sessionId) {
    const connData = connections.get(sessionId);
    return connData ? connData.connection : null;
}

function getUserInfo(sessionId) {
    const connData = connections.get(sessionId);
    return connData ? connData.userInfo : null;
}

function removeConnection(sessionId) {
    connections.delete(sessionId);
}

// --- UTILITY FUNCTIONS ---

function generateState() {
    return crypto.randomBytes(32).toString('hex');
}

function validateStateCode(codes) {
    const usCodes = [
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
        'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
        'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
        'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
        'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
    ];
    return codes.filter(code => usCodes.includes(code.toUpperCase()));
}

function getCurrentOrgId(req) {
    // Use sessionID as the connection key — isolates each user session on the server
    return req.sessionID || req.headers['x-org-id'] || req.session.currentOrgId || 'default';
}

function validateAndFixLeadData(leadData) {
    const errors = [];
    const warnings = [];
    const fixedData = { ...leadData };

    if (!fixedData.LastName || !fixedData.LastName.trim()) {
        errors.push('LastName is required and cannot be empty');
    }

    if (!fixedData.Company || !fixedData.Company.trim()) {
        errors.push('Company is required and cannot be empty');
    }

    if (fixedData.Email) {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(fixedData.Email)) {
            warnings.push(`Invalid email format: ${fixedData.Email}`);
            delete fixedData.Email;
        }
    }

    ['Phone', 'MobilePhone', 'Fax'].forEach(phoneField => {
        if (fixedData[phoneField]) {
            const originalPhone = fixedData[phoneField];
            const cleanPhone = originalPhone.replace(/[^\d\+\-\(\)\s]/g, '');
            if (cleanPhone !== originalPhone) {
                warnings.push(`Cleaned phone number ${phoneField}: ${originalPhone} → ${cleanPhone}`);
                fixedData[phoneField] = cleanPhone;
            }
        }
    });

    if (fixedData.Website) {
        let website = fixedData.Website.trim();
        if (website && !website.match(/^https?:\/\//)) {
            website = 'https://' + website;
            warnings.push(`Added https:// to website: ${fixedData.Website} → ${website}`);
            fixedData.Website = website;
        }
    }

    const salesforceFieldLimits = {
        FirstName: 40,
        LastName: 80,
        Company: 255,
        Title: 128,
        Email: 80,
        Phone: 40,
        MobilePhone: 40,
        Fax: 40,
        Website: 255,
        Street: 255,
        City: 40,
        PostalCode: 20,
        Country: 80,
        State: 80,
        Description: 32000
    };

    Object.keys(salesforceFieldLimits).forEach(fieldName => {
        if (fixedData[fieldName] && typeof fixedData[fieldName] === 'string') {
            const maxLength = salesforceFieldLimits[fieldName];
            if (fixedData[fieldName].length > maxLength) {
                const truncated = fixedData[fieldName].substring(0, maxLength);
                warnings.push(`Truncated ${fieldName} (${fixedData[fieldName].length} → ${maxLength} chars)`);
                fixedData[fieldName] = truncated;
            }
        }
    });

    const invalidLeadFields = ['Suffix', 'MiddleName', 'SalesArea', 'Department'];
    invalidLeadFields.forEach(fieldName => {
        if (fixedData.hasOwnProperty(fieldName)) {
            warnings.push(`Removed invalid Lead field: ${fieldName}`);
            delete fixedData[fieldName];
        }
    });

    const numericFields = ['AnnualRevenue', 'NumberOfEmployees'];
    numericFields.forEach(fieldName => {
        if (fixedData.hasOwnProperty(fieldName)) {
            const value = fixedData[fieldName];
            if (value !== null && value !== undefined && value !== '') {
                const numValue = Number(value);
                if (!isNaN(numValue)) {
                    fixedData[fieldName] = numValue;
                } else {
                    warnings.push(`Removed invalid numeric value for ${fieldName}: ${value}`);
                    delete fixedData[fieldName];
                }
            } else {
                delete fixedData[fieldName];
            }
        }
    });

    const integerFields = ['Latitude', 'Longitude'];
    integerFields.forEach(fieldName => {
        if (fixedData.hasOwnProperty(fieldName)) {
            const value = fixedData[fieldName];
            if (value !== null && value !== undefined && value !== '') {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    fixedData[fieldName] = numValue;
                } else {
                    delete fixedData[fieldName];
                }
            } else {
                delete fixedData[fieldName];
            }
        }
    });

    console.log('Filtered lead data:', fixedData);

    return {
        data: fixedData,
        errors,
        warnings
    };
}

// --- AUTHENTICATION ROUTES ---

app.get('/auth/salesforce', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'auth-start.html'));
});

app.get('/auth/salesforce/redirect', (req, res) => {
    try {
        const orgId = req.query.orgId || 'default';
        const clientId = req.query.clientId || config.salesforce.clientId;
        const clientSecret = req.query.clientSecret || config.salesforce.clientSecret;
        const loginUrl = req.query.loginUrl || config.salesforce.loginUrl;

        if (!clientId || !clientSecret) {
            console.error('No credentials available - neither from query params nor from environment');
            return res.status(400).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Configuration Error</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body {
                            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: #333;
                        }
                        .container {
                            max-width: 480px;
                            width: 90%;
                            background: rgba(255, 255, 255, 0.95);
                            backdrop-filter: blur(20px);
                            border-radius: 24px;
                            padding: 40px;
                            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
                            text-align: center;
                        }
                        .error-icon {
                            width: 80px;
                            height: 80px;
                            margin: 0 auto 24px;
                            background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        }
                        .error-icon svg {
                            width: 40px;
                            height: 40px;
                            color: white;
                        }
                        h2 {
                            font-size: 28px;
                            font-weight: 700;
                            margin-bottom: 16px;
                            color: #D97706;
                        }
                        p {
                            color: #92400E;
                            margin-bottom: 12px;
                            line-height: 1.6;
                            font-size: 16px;
                        }
                        button {
                            background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
                            color: white;
                            border: none;
                            padding: 12px 32px;
                            border-radius: 12px;
                            font-size: 16px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: transform 0.2s;
                            margin-top: 16px;
                        }
                        button:hover {
                            transform: scale(1.05);
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="error-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                <line x1="12" y1="9" x2="12" y2="13"/>
                                <line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                        </div>
                        <h2>Configuration Error</h2>
                        <p>Salesforce Client ID and Client Secret are required.</p>
                        <p>Please configure SF_CLIENT_ID and SF_CLIENT_SECRET in your environment variables.</p>
                        <button onclick="window.close()">Close Window</button>
                    </div>
                    <script>setTimeout(() => window.close(), 5000);</script>
                </body>
                </html>
            `);
        }

        const state = `${generateState()}:${orgId}`;
        req.session.oauthState = state;

        req.session.clientCredentials = {
            clientId,
            clientSecret,
            loginUrl
        };

        const oauth2 = new jsforce.OAuth2({
            clientId: clientId,
            clientSecret: clientSecret,
            redirectUri: config.salesforce.redirectUri,
            loginUrl: loginUrl
        });

        const authUrl = oauth2.getAuthorizationUrl({
            scope: 'api refresh_token',
            state: state
        });
        res.redirect(authUrl);

    } catch (error) {
        console.error('OAuth initiation failed:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Authentication Error</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #333;
                    }
                    .container {
                        max-width: 480px;
                        width: 90%;
                        background: rgba(255, 255, 255, 0.95);
                        backdrop-filter: blur(20px);
                        border-radius: 24px;
                        padding: 40px;
                        box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
                        text-align: center;
                    }
                    .error-icon {
                        width: 80px;
                        height: 80px;
                        margin: 0 auto 24px;
                        background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .error-icon svg {
                        width: 40px;
                        height: 40px;
                        color: white;
                    }
                    h2 {
                        font-size: 28px;
                        font-weight: 700;
                        margin-bottom: 16px;
                        color: #DC2626;
                    }
                    p {
                        color: #B91C1C;
                        margin-bottom: 12px;
                        line-height: 1.6;
                        font-size: 16px;
                    }
                    .error-message {
                        background: rgba(239, 68, 68, 0.1);
                        border-radius: 12px;
                        padding: 16px;
                        margin: 20px 0;
                        font-family: monospace;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="error-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="15" y1="9" x2="9" y2="15"/>
                            <line x1="9" y1="9" x2="15" y2="15"/>
                        </svg>
                    </div>
                    <h2>Authentication Error</h2>
                    <div class="error-message">
                        <p>${error.message}</p>
                    </div>
                    <p>This window will close automatically...</p>
                </div>
                <script>setTimeout(() => window.close(), 3000);</script>
            </body>
            </html>
        `);
    }
});

// OAuth callback
app.get('/oauth/callback', async (req, res) => {

    try {
        const { code, state, error } = req.query;

        if (error) {
            console.log('OAuth error from Salesforce:', error);
            throw new Error(`OAuth error: ${error}`);
        }

        if (!code) {
            console.log('No authorization code received');
            throw new Error('No authorization code received');
        }

        if (!state) {
            console.log('State parameter is missing');
            throw new Error('Invalid state parameter - missing state');
        }

        const orgId = state.includes(':') ? state.split(':')[1] : 'default';
        
        const clientId = config.salesforce.clientId;
        const clientSecret = config.salesforce.clientSecret;
        const loginUrl = config.salesforce.loginUrl;

        if (!clientId || !clientSecret) {
            console.log('Client credentials not found');
            throw new Error('Client credentials not found in session');
        }

        const oauth2 = new jsforce.OAuth2({
            clientId: clientId,
            clientSecret: clientSecret,
            redirectUri: config.salesforce.redirectUri,
            loginUrl: loginUrl
        });


        const conn = new jsforce.Connection({ oauth2 });
        const userInfo = await conn.authorize(code);

        let fullUserInfo = userInfo;
        try {
            const userQuery = await conn.query(`SELECT Id, Username, Name, Email FROM User WHERE Id = '${userInfo.id}'`);
            const orgQuery = await conn.query(`SELECT Id, Name FROM Organization WHERE Id = '${userInfo.organizationId}'`);

            if (userQuery.records.length > 0) {
                const user = userQuery.records[0];
                const org = orgQuery.records.length > 0 ? orgQuery.records[0] : null;

                fullUserInfo = {
                    ...userInfo,
                    username: user.Username,
                    display_name: user.Name,
                    email: user.Email,
                    organization_name: org ? org.Name : `Org ${userInfo.organizationId}`
                };
            }
        } catch (apiError) {
            console.log('Could not fetch detailed user info, using basic info:', apiError.message);
        }

        const sessionData = {
            accessToken: conn.accessToken,
            refreshToken: conn.refreshToken,
            instanceUrl: conn.instanceUrl,
            organizationId: userInfo.organizationId,
            userId: userInfo.id,
            userInfo: fullUserInfo,
            clientId: clientId,
            clientSecret: clientSecret,
            loginUrl: loginUrl,
            stateOrgId: orgId
        };

        req.session.salesforce = sessionData;
        req.session.currentOrgId = orgId;
        req.session.authenticated = true;

        // Index by sessionID — each user session gets its own isolated SF connection
        storeConnection(sessionData, req.sessionID);

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Authentication Successful</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                        background: #f5f5f5;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        margin: 0;
                        padding: 20px;
                    }
                    .container {
                        background: white;
                        border-radius: 8px;
                        padding: 40px;
                        max-width: 400px;
                        width: 100%;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        text-align: center;
                    }
                    .icon {
                        font-size: 48px;
                        margin-bottom: 20px;
                    }
                    h2 {
                        color: #059669;
                        margin: 0 0 16px 0;
                        font-size: 20px;
                    }
                    .info-box {
                        background: #f0fdf4;
                        border: 1px solid #bbf7d0;
                        border-radius: 4px;
                        padding: 16px;
                        margin: 16px 0;
                        font-size: 14px;
                    }
                    .info-box p {
                        margin: 8px 0;
                        color: #166534;
                    }
                    p {
                        color: #666;
                        margin: 8px 0;
                        font-size: 14px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">✅</div>
                    <h2>Authentication Successful!</h2>
                    <div class="info-box">
                        <p><strong>${fullUserInfo.display_name || fullUserInfo.username || 'User'}</strong></p>
                        <p>${fullUserInfo.organization_name || 'Your Organization'}</p>
                    </div>
                    <p>This window will close automatically...</p>
                </div>
                <script>
                    if (window.opener) {
                        window.opener.postMessage({
                            type: 'SALESFORCE_AUTH_SUCCESS',
                            orgId: '${userInfo.organizationId}',
                            userInfo: ${JSON.stringify(fullUserInfo)}
                        }, '*');
                    }
                    setTimeout(() => window.close(), 2000);
                </script>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('OAuth callback failed:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Authentication Failed</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                        background: #f5f5f5;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        margin: 0;
                        padding: 20px;
                    }
                    .container {
                        background: white;
                        border-radius: 8px;
                        padding: 40px;
                        max-width: 400px;
                        width: 100%;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        text-align: center;
                    }
                    .icon {
                        font-size: 48px;
                        margin-bottom: 20px;
                    }
                    h2 {
                        color: #dc2626;
                        margin: 0 0 16px 0;
                        font-size: 20px;
                    }
                    .error-box {
                        background: #fee;
                        border: 1px solid #fcc;
                        border-radius: 4px;
                        padding: 12px;
                        margin: 16px 0;
                        font-size: 14px;
                        color: #c00;
                    }
                    p {
                        color: #666;
                        margin: 8px 0;
                        font-size: 14px;
                    }
                    button {
                        background: #dc2626;
                        color: white;
                        border: none;
                        padding: 10px 24px;
                        border-radius: 4px;
                        font-size: 14px;
                        cursor: pointer;
                        margin-top: 16px;
                    }
                    button:hover {
                        background: #b91c1c;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">❌</div>
                    <h2>Authentication Failed</h2>
                    <div class="error-box">${error.message}</div>
                    <p>Please close this window and try again.</p>
                    <button onclick="window.close()">Close Window</button>
                </div>
                <script>
                    setTimeout(() => window.close(), 5000);
                </script>
            </body>
            </html>
        `);
    }
});

// --- API ROUTES ---
app.get('/api/salesforce/auth', (req, res) => {
    try {
        const clientId = req.query.clientId || config.salesforce.clientId;
        const clientSecret = req.query.clientSecret || config.salesforce.clientSecret;
        const loginUrl = req.query.loginUrl || config.salesforce.loginUrl;
        const orgId = req.query.orgId; // Optional orgId for multi-org support

        if (!clientId || !clientSecret) {
            return res.status(400).json({
                message: 'Salesforce Client ID and Client Secret are required',
                hint: 'Provide clientId and clientSecret as query parameters'
            });
        }

        const randomState = generateState();

        const state = orgId ? `${randomState}:${orgId}` : randomState;
        req.session.oauthState = randomState;
        req.session.clientCredentials = {
            clientId,
            clientSecret,
            loginUrl,
            orgId: orgId || 'default'
        };

        const oauth2 = new jsforce.OAuth2({
            clientId: clientId,
            clientSecret: clientSecret,
            redirectUri: config.salesforce.redirectUri,
            loginUrl: loginUrl
        });

        const authUrl = oauth2.getAuthorizationUrl({
            scope: 'api refresh_token',
            state: state
        });

        console.log(`🔗 Generated auth URL (GET) - orgId: ${orgId || 'default'}`);
        res.json({
            authUrl,
            orgId: orgId || 'default'
        });

    } catch (error) {
        console.error('Failed to generate auth URL:', error);
        res.status(500).json({ message: 'Failed to generate auth URL' });
    }
});

app.post('/api/salesforce/auth', (req, res) => {
    console.log('\n========================================');
    console.log('📨 POST /api/salesforce/auth - Request received');
    console.log('========================================');

    try {
        const { clientId, clientSecret, loginUrl, orgId } = req.body;

        console.log('📋 Request body:', {
            clientId: clientId ? `${clientId.substring(0, 20)}...` : 'missing',
            clientSecret: clientSecret ? '***HIDDEN***' : 'missing',
            loginUrl: loginUrl || 'using default',
            orgId: orgId || 'not provided (will use "default")'
        });

        if (!clientId || !clientSecret) {
            console.log('Missing credentials');
            return res.status(400).json({
                message: 'Salesforce Client ID and Client Secret are required',
                hint: 'Provide clientId and clientSecret in request body'
            });
        }

        const randomState = generateState();
        // Include orgId in state for multi-org support (format: "randomState:orgId")
        const orgIdentifier = orgId || 'default';
        const state = `${randomState}:${orgIdentifier}`;

        console.log('🔐 Generated state parameter:');
        console.log('   - Random part:', randomState.substring(0, 16) + '...');
        console.log('   - OrgId:', orgIdentifier);
        console.log('   - Full state:', `${randomState.substring(0, 16)}...:${orgIdentifier}`);

        req.session.oauthState = randomState; // Store only random part for validation

        // Store credentials in session for callback
        req.session.clientCredentials = {
            clientId,
            clientSecret,
            loginUrl: loginUrl || config.salesforce.loginUrl,
            orgId: orgIdentifier
        };

        const oauth2 = new jsforce.OAuth2({
            clientId: clientId,
            clientSecret: clientSecret,
            redirectUri: config.salesforce.redirectUri,
            loginUrl: loginUrl || config.salesforce.loginUrl
        });

        const authUrl = oauth2.getAuthorizationUrl({
            scope: 'api refresh_token',
            state: state
        });

        console.log('✅ Auth URL generated successfully');
        console.log('🔗 Redirect URI:', config.salesforce.redirectUri);
        console.log('🌐 Login URL:', loginUrl || config.salesforce.loginUrl);
        console.log('🎯 State format:', state.includes(':') ? 'Multi-org (state:orgId)' : 'Legacy (state only)');
        console.log('========================================\n');

        res.json({ authUrl, orgId: orgIdentifier });

    } catch (error) {
        console.error('Failed to generate auth URL:', error);
        console.log('========================================\n');
        res.status(500).json({ message: 'Failed to generate auth URL' });
    }
});

app.get('/api/salesforce/check', async (req, res) => {
    console.log('\n========================================');
    console.log('🔍 GET /api/salesforce/check - Checking connection');
    console.log('========================================');

    try {
        // Use sessionID to look up this user's connection
        const orgId = getCurrentOrgId(req);

        console.log('📋 Request info:');
        console.log('   - Session key:', orgId);

        // Check if connection exists in local connections Map
        try {
            console.log('🔎 Looking for connection in local Map...');
            const conn = getConnection(orgId);

            if (!conn) {
                throw new Error('Connection object is null');
            }

            console.log('✅ Connection found!');
            console.log('   - Connection type:', typeof conn);
            console.log('   - Has identity method:', typeof conn.identity);
            console.log('   - Access token present:', !!conn.accessToken);
            console.log('   - Instance URL:', conn.instanceUrl);
            console.log('Verifying connection with identity call...');

            // Verify connection is valid by calling identity
            let identity;
            try {
                identity = await conn.identity();
            } catch (identityError) {
                console.error('Identity call failed:', identityError.message);
                // If identity fails, still return connection info if we have accessToken
                if (conn.accessToken && conn.instanceUrl) {
                    console.log('Using cached connection info (identity call failed but tokens exist)');
                    const connData = connections.get(orgId);
                    if (connData && connData.userInfo) {
                        return res.json({
                            connected: true,
                            userInfo: connData.userInfo,
                            tokens: {
                                access_token: conn.accessToken,
                                instance_url: conn.instanceUrl
                            }
                        });
                    }
                }
                throw identityError;
            }

            console.log('✅ Identity verified successfully');

            // Extract user info from identity response
            const userInfo = {
                username: identity.username,
                display_name: identity.display_name,
                organization_name: identity.organization_name || 'Unknown Org',
                organization_id: identity.organization_id,
                user_id: identity.user_id
            };

            console.log('👤 User info:');
            console.log('   - Username:', userInfo.username);
            console.log('   - Display name:', userInfo.display_name);
            console.log('   - Organization:', userInfo.organization_name);
            console.log('   - Org ID:', userInfo.organization_id);
            console.log('========================================\n');

            res.json({
                connected: true,
                userInfo: userInfo,
                // Add tokens for direct API calls
                tokens: {
                    access_token: conn.accessToken,
                    instance_url: conn.instanceUrl
                }
            });

        } catch (connError) {
            console.log('Connection not found or invalid:', connError.message);
            console.log('========================================\n');

            // Connection doesn't exist or is invalid
            return res.status(401).json({
                connected: false,
                message: `No valid Salesforce connection for org: ${orgId}`
            });
        }

    } catch (error) {
        console.error('Connection check failed:', error);
        console.log('========================================\n');

        res.status(500).json({
            connected: false,
            message: 'Connection check failed',
            error: error.message
        });
    }
});

app.get('/api/salesforce/userinfo', (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const userInfo = getUserInfo(orgId);

        if (!userInfo || !req.session.authenticated) {
            return res.status(401).json({ message: 'Not authenticated' });
        }

        res.json({
            username: userInfo.username,
            display_name: userInfo.display_name,
            organization_name: userInfo.organization_name,
            organization_id: userInfo.organizationId,
            user_id: userInfo.id
        });

    } catch (error) {
        console.error('User info failed:', error);
        res.status(500).json({ message: 'Failed to get user info' });
    }
});

app.post('/api/salesforce/refresh', async (req, res) => {
    console.log('\n========================================');
    console.log('POST /api/salesforce/refresh - Refreshing token');
    console.log('========================================');

    try {
        const orgId = req.headers['x-org-id'] || req.body.orgId || 'default';

        console.log('📋 Request info:');
        console.log('   - OrgId from header:', req.headers['x-org-id'] || 'not provided');
        console.log('   - OrgId from body:', req.body.orgId || 'not provided');
        console.log('   - Using orgId:', orgId);

        // Get existing connection from local Map (supports both default and Salesforce orgId)
        console.log('🔎 Looking for existing connection in local Map...');
        const conn = getConnection(orgId);

        if (!conn || !conn.refreshToken) {
            console.log('No refresh token found for org:', orgId);
            console.log('========================================\n');
            return res.status(401).json({
                success: false,
                message: 'No refresh token available. Please re-authenticate.'
            });
        }

        console.log('✅ Connection found with refresh token');
        console.log('   - Refresh token:', conn.refreshToken.substring(0, 20) + '...');

        // Use jsforce to refresh the token
        try {
            console.log('Calling Salesforce to refresh token...');
            await conn.oauth2.refreshToken(conn.refreshToken);

            console.log('✅ Token refreshed successfully!');
            console.log('   - New access token:', conn.accessToken.substring(0, 20) + '...');
            console.log('   - Instance URL:', conn.instanceUrl);
            console.log('========================================\n');

            res.json({
                success: true,
                message: 'Token refreshed successfully',
                tokens: {
                    access_token: conn.accessToken,
                    instance_url: conn.instanceUrl
                }
            });

        } catch (refreshError) {
            console.error('Token refresh failed:', refreshError.message);
            console.log('🗑️  Clearing invalid connection for org:', orgId);
            console.log('========================================\n');

            // If refresh fails, clear the connection from local Map
            connections.delete(orgId);

            return res.status(401).json({
                success: false,
                message: 'Token refresh failed. Please re-authenticate.',
                error: refreshError.message
            });
        }

    } catch (error) {
        console.error('Refresh endpoint error:', error);
        console.log('========================================\n');
        res.status(500).json({
            success: false,
            message: 'Failed to refresh token',
            error: error.message
        });
    }
});

app.get('/api/user', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn = getConnection(orgId);

        if (!conn) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'No active Salesforce connection'
            });
        }

        const info = await conn.identity();

        console.log('🔍 Returning user info via jsforce:', {
            username: info.username,
            display_name: info.display_name,
            organization_id: info.organization_id
        });

        res.json({
            username: info.username,
            display_name: info.display_name,
            organization_name: info.organization_name || `Org: ${info.organization_id}`,
            organization_id: info.organization_id,
            user_id: info.user_id
        });

    } catch (error) {
        console.error('User info failed:', error);
        res.status(500).json({
            error: 'Authentication error',
            message: error.message
        });
    }
});

app.post('/api/logout', (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        removeConnection(orgId);

        req.session.destroy(err => {
            if (err) {
                console.error('Session destroy failed:', err);
                return res.status(500).json({ message: 'Logout failed' });
            }
            res.json({ message: 'Logged out successfully' });
        });

    } catch (error) {
        console.error('Logout failed:', error);
        res.status(500).json({ message: 'Logout failed' });
    }
});

app.get('/api/leads', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn = getConnection(orgId);

        if (!conn) {
            return res.status(401).json({ message: 'Not connected to Salesforce' });
        }

        const query = `
            SELECT Id, FirstName, LastName, Company, Email, Phone, Title, State,
                   Status, LeadSource, CreatedDate, IsUnreadByOwner, Owner.Name
            FROM Lead
            ORDER BY CreatedDate DESC
            LIMIT 1000
        `;

        const result = await conn.query(query);
        console.log(`📊 Retrieved ${result.records.length} leads from Salesforce`);
        res.json(result.records);

    } catch (error) {
        console.error('Failed to fetch leads:', error);
        res.status(500).json({ message: 'Failed to fetch leads', error: error.message });
    }
});

app.post('/api/leads', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn = getConnection(orgId);

        if (!conn) {
            return res.status(401).json({ message: 'Not connected to Salesforce' });
        }

        const leadData = req.body;

        // Validate required fields
        if (!leadData.LastName || !leadData.Company) {
            return res.status(400).json({
                message: 'Last Name and Company are required fields'
            });
        }

        // Check for duplicates
        const duplicateQuery = `
            SELECT Id, FirstName, LastName, Company, Email
            FROM Lead
            WHERE LastName = '${leadData.LastName.replace(/'/g, "\\'")}'
            AND Company = '${leadData.Company.replace(/'/g, "\\'")}'
            LIMIT 1
        `;

        const duplicateResult = await conn.query(duplicateQuery);

        if (duplicateResult.records.length > 0) {
            const existing = duplicateResult.records[0];
            return res.status(409).json({
                message: 'Duplicate lead found',
                existing: {
                    Id: existing.Id,
                    name: `${existing.FirstName || ''} ${existing.LastName}`.trim(),
                    company: existing.Company,
                    email: existing.Email
                }
            });
        }

        // Validate state if provided
        if (leadData.State) {
            const validStates = validateStateCode([leadData.State]);
            if (validStates.length === 0) {
                leadData.Street = leadData.Street ?
                    `${leadData.Street}, ${leadData.State}` :
                    leadData.State;
                delete leadData.State;
            } else {
                leadData.State = validStates[0].toUpperCase();
            }
        }

        // Create lead
        const result = await conn.sobject('Lead').create(leadData);

        if (result.success) {
            console.log(` Lead created successfully: ${result.id}`);
            res.json({
                success: true,
                id: result.id,
                message: 'Lead created successfully'
            });
        } else {
            throw new Error('Failed to create lead: ' + JSON.stringify(result.errors));
        }

    } catch (error) {
        console.error('Failed to create lead:', error);
        res.status(500).json({
            message: 'Failed to create lead',
            error: error.message
        });
    }
});

app.put('/api/leads/:id', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn = getConnection(orgId);

        if (!conn) {
            return res.status(401).json({ message: 'Not connected to Salesforce' });
        }

        const { id } = req.params;
        const leadData = req.body;

        // Validate required fields
        if (!leadData.LastName || !leadData.Company) {
            return res.status(400).json({
                message: 'Last Name and Company are required fields'
            });
        }

        // Validate state if provided
        if (leadData.State) {
            const validStates = validateStateCode([leadData.State]);
            if (validStates.length === 0) {
                leadData.Street = leadData.Street ?
                    `${leadData.Street}, ${leadData.State}` :
                    leadData.State;
                delete leadData.State;
            } else {
                leadData.State = validStates[0].toUpperCase();
            }
        }

        // Update lead
        const result = await conn.sobject('Lead').update({
            Id: id,
            ...leadData
        });

        if (result.success) {
            console.log(`✅ Lead updated successfully: ${id}`);
            res.json({
                success: true,
                id: id,
                message: 'Lead updated successfully'
            });
        } else {
            throw new Error('Failed to update lead: ' + JSON.stringify(result.errors));
        }

    } catch (error) {
        console.error('Failed to update lead:', error);
        res.status(500).json({
            message: 'Failed to update lead',
            error: error.message
        });
    }
});

app.delete('/api/leads/:id', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn = getConnection(orgId);

        if (!conn) {
            return res.status(401).json({ message: 'Not connected to Salesforce' });
        }

        const { id } = req.params;

        // Delete lead
        const result = await conn.sobject('Lead').delete(id);

        if (result.success) {
            console.log(`✅ Lead deleted successfully: ${id}`);
            res.json({
                success: true,
                id: id,
                message: 'Lead deleted successfully'
            });
        } else {
            throw new Error('Failed to delete lead: ' + JSON.stringify(result.errors));
        }

    } catch (error) {
        console.error('Failed to delete lead:', error);
        res.status(500).json({
            message: 'Failed to delete lead',
            error: error.message
        });
    }
});

app.post('/api/salesforce/fields/check', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn = getConnection(orgId);

        if (!conn) {
            return res.status(401).json({ message: 'Not connected to Salesforce' });
        }

        const { fieldNames } = req.body;

        if (!fieldNames || !Array.isArray(fieldNames)) {
            return res.status(400).json({ message: 'fieldNames array is required' });
        }

        console.log(`🔍 Checking ${fieldNames.length} fields in Salesforce Lead object`);

        // Describe Lead object to get all fields
        const leadMetadata = await conn.sobject('Lead').describe();

        // Create a map of field names (both with and without __c suffix)
        const existingFieldsMap = new Map();
        leadMetadata.fields.forEach(f => {
            existingFieldsMap.set(f.name, f);
            // Also store without __c suffix for easier lookup
            const baseName = f.name.replace(/__c$/i, '');
            existingFieldsMap.set(baseName, f);
        });

        // Check which fields exist and which don't
        const results = {
            existing: [],
            missing: []
        };

        fieldNames.forEach(fieldName => {
            const baseName = fieldName.replace(/__c$/i, '');

            // Check both exact match and base name match
            if (existingFieldsMap.has(fieldName) || existingFieldsMap.has(baseName)) {
                results.existing.push(fieldName);
                console.log(`✅ Field exists: ${fieldName}`);
            } else {
                results.missing.push(fieldName);
                console.log(`Field missing: ${fieldName}`);
            }
        });

        console.log(`✅ Found ${results.existing.length} existing fields, ${results.missing.length} missing fields`);

        res.json({
            success: true,
            existing: results.existing,
            missing: results.missing
        });

    } catch (error) {
        console.error('Failed to check fields:', error);
        res.status(500).json({
            message: 'Failed to check fields',
            error: error.message
        });
    }
});

app.post('/api/salesforce/fields/create', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn = getConnection(orgId);

        if (!conn) {
            return res.status(401).json({ message: 'Not connected to Salesforce' });
        }

        const { fields } = req.body;

        if (!fields || !Array.isArray(fields)) {
            return res.status(400).json({ message: 'fields array is required' });
        }

        console.log(`🛠️  Creating ${fields.length} custom fields in Salesforce`);

        const results = {
            created: [],
            failed: []
        };

        // Create each custom field using Metadata API
        for (const field of fields) {
            try {
                const { apiName, label } = field;

                // Create custom field metadata
                // For Metadata API, FullName should be just the field name for custom fields
                // Format: FieldName__c (not Lead.FieldName__c)
                const customField = {
                    fullName: `Lead.${apiName}`,  // Object.FieldName format for Salesforce
                    label: label || apiName.replace(/__c$/, '').replace(/_/g, ' '),
                    type: 'Text',
                    length: 255,
                    required: false,
                    externalId: false,
                    unique: false
                };

                console.log(`Creating field: Lead.${apiName} (${customField.label})`);

                const result = await conn.metadata.create('CustomField', [customField]);

                // Result is an array when passing array to create()
                const fieldResult = Array.isArray(result) ? result[0] : result;

                if (fieldResult.success) {
                    results.created.push({
                        apiName,
                        label: customField.label,
                        success: true
                    });
                    console.log(`✅ Field created: ${apiName}`);
                } else {
                    results.failed.push({
                        apiName,
                        label: customField.label,
                        error: fieldResult.errors ? JSON.stringify(fieldResult.errors) : 'Unknown error'
                    });
                    console.error(`Field creation failed: ${apiName}`, fieldResult.errors);
                }

            } catch (fieldError) {
                results.failed.push({
                    apiName: field.apiName,
                    label: field.label,
                    error: fieldError.message
                });
                console.error(`Field creation error: ${field.apiName}`, fieldError);
            }
        }

        console.log(`📊 Field creation results: ${results.created.length} created, ${results.failed.length} failed`);

        res.json({
            success: results.failed.length === 0,
            created: results.created,
            failed: results.failed,
            message: `Created ${results.created.length} field(s), ${results.failed.length} failed`
        });

    } catch (error) {
        console.error('Failed to create custom fields:', error);
        res.status(500).json({
            message: 'Failed to create custom fields',
            error: error.message
        });
    }
});

app.post('/api/leads/check-duplicate', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn = getConnection(orgId);

        if (!conn) {
            return res.status(401).json({ message: 'Not connected to Salesforce' });
        }

        const { FirstName, LastName, Company, Email } = req.body;

        if (!LastName || !Company) {
            return res.status(400).json({ message: 'LastName and Company are required' });
        }

        // Build SOQL query to find potential duplicates
        let whereConditions = [];

        // Check by name and company
        whereConditions.push(`(LastName = '${LastName.replace(/'/g, "\\'")}' AND Company = '${Company.replace(/'/g, "\\'")}')`);

        // Check by email if provided
        if (Email) {
            whereConditions.push(`Email = '${Email.replace(/'/g, "\\'")}'`);
        }

        const duplicateQuery = `
            SELECT Id, FirstName, LastName, Company, Email, Name
            FROM Lead
            WHERE ${whereConditions.join(' OR ')}
            LIMIT 10
        `;

        const duplicateResult = await conn.query(duplicateQuery);

        if (duplicateResult.records.length > 0) {
            res.json({
                hasDuplicates: true,
                duplicates: duplicateResult.records.map(record => ({
                    Id: record.Id,
                    Name: record.Name || `${record.FirstName || ''} ${record.LastName}`.trim(),
                    Company: record.Company,
                    Email: record.Email
                }))
            });
        } else {
            res.json({
                hasDuplicates: false,
                duplicates: []
            });
        }

    } catch (error) {
        console.error('Duplicate check failed:', error);
        res.status(500).json({
            message: 'Failed to check for duplicates',
            error: error.message
        });
    }
});

let leadObjectFieldsCache = null;
let leadObjectFieldsCacheTimestamp = 0;
const LEAD_FIELDS_CACHE_TTL = 60 * 60 * 1000;

async function fetchLeadObjectFields(conn) {
    const now = Date.now();
    if (leadObjectFieldsCache && (now - leadObjectFieldsCacheTimestamp) < LEAD_FIELDS_CACHE_TTL) {
        return leadObjectFieldsCache;
    }
    try {
        const metadata = await conn.describe('Lead');
        const fields = metadata.fields.map(f => f.name);
        leadObjectFieldsCache = new Set(fields);
        leadObjectFieldsCacheTimestamp = now;
        console.log(`Fetched ${fields.length} Lead object fields from Salesforce metadata`);
        return leadObjectFieldsCache;
    } catch (error) {
        console.error('Failed to fetch Lead object fields metadata:', error);
        return null;
    }
}

app.post('/api/salesforce/leads', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn = getConnection(orgId);

        if (!conn) {
            return res.status(401).json({ message: 'Not connected to Salesforce' });
        }

        const { leadData, attachments = [] } = req.body;

        console.log('📝 Creating lead with data:', leadData);

        const processedLeadData = {};

        Object.keys(leadData).forEach(field => {
            const value = leadData[field];
            const isQuestionAnswerTextField = /^(Question|Answers|Text)\d{2}(__c)?$/.test(field);

            if (isQuestionAnswerTextField) {
                processedLeadData[field] = value !== undefined ? value : null;
            } else {
                if (value !== null && value !== undefined) {
                    processedLeadData[field] = value;
                }
            }
        });

        const validationResults = validateAndFixLeadData(processedLeadData);
        let validatedLeadData = validationResults.data;

        if (validationResults.errors.length > 0) {
            return res.status(400).json({
                message: 'Lead data validation failed',
                error: validationResults.errors.join('; '),
                errors: validationResults.errors,
                warnings: validationResults.warnings
            });
        }

        let validLeadFields = await fetchLeadObjectFields(conn);

        let unknownFields = [];
        if (validLeadFields) {
            unknownFields = Object.keys(validatedLeadData).filter(field => !validLeadFields.has(field));

            // Invalidate cache and retry if unknown fields found (may have been created recently)
            if (unknownFields.length > 0) {
                console.log(`Found ${unknownFields.length} unknown field(s), refreshing SF metadata cache...`);
                leadObjectFieldsCache = null;
                leadObjectFieldsCacheTimestamp = 0;
                validLeadFields = await fetchLeadObjectFields(conn);

                if (validLeadFields) {
                    unknownFields = Object.keys(validatedLeadData).filter(field => !validLeadFields.has(field));
                }
            }

            if (unknownFields.length > 0) {
                console.error(`Field(s) not found in Salesforce: ${unknownFields.join(', ')}`);

                const boldFields = unknownFields.map(f => `<strong>${f}</strong>`).join(', ');

                const errorMessage = [
                    `The following fields do not exist in Salesforce: ${boldFields}`,
                    '',
                    'Please ensure field names match exactly as they appear in Salesforce.',
                    '',
                    'Important notes:',
                    '• Field names are case-sensitive',
                    '• Custom fields must end with __c (e.g., MyField__c)',
                    '• Spaces in field names are not allowed (use underscores instead)',
                    '• Standard field names must match exactly (e.g., "Department" not "Department New")',
                    '',
                    'Documentation: https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/custom_fields.htm'
                ].join('\n');

                return res.status(400).json({
                    success: false,
                    message: errorMessage,
                    missingFields: unknownFields,
                    error: 'MISSING_FIELDS'
                });
            }
        } else {
            console.warn('Skipping Lead field filtering due to metadata fetch failure');
        }

        // Check for duplicates
        const duplicateQuery = `
            SELECT Id, FirstName, LastName, Company, Email
            FROM Lead
            WHERE LastName = '${validatedLeadData.LastName.replace(/'/g, "\\'")}'
            AND Company = '${validatedLeadData.Company.replace(/'/g, "\\'")}'
            LIMIT 1
        `;

        const duplicateResult = await conn.query(duplicateQuery);

        if (duplicateResult.records.length > 0) {
            const existing = duplicateResult.records[0];
            return res.status(409).json({
                message: 'Duplicate lead found',
                salesforceId: existing.Id,
                existingLead: {
                    name: `${existing.FirstName || ''} ${existing.LastName}`.trim(),
                    company: existing.Company,
                    email: existing.Email
                }
            });
        }

        // Validate and fix state
        if (validatedLeadData.State) {
            const validStates = validateStateCode([validatedLeadData.State]);
            if (validStates.length === 0) {
                validatedLeadData.Street = validatedLeadData.Street ?
                    `${validatedLeadData.Street}, ${validatedLeadData.State}` :
                    validatedLeadData.State;
                delete validatedLeadData.State;
                console.log(`Invalid state moved to Street field: ${validatedLeadData.Street}`);
            } else {
                validatedLeadData.State = validStates[0].toUpperCase();
            }
        }

        // Create the lead
        const leadResult = await conn.sobject('Lead').create(validatedLeadData);

        if (!leadResult.success) {
            // Include detailed Salesforce errors if available
            let detailedError = 'Failed to create lead in Salesforce';
            let missingFields = [];

            if (leadResult.errors && Array.isArray(leadResult.errors) && leadResult.errors.length > 0) {
                // Check for missing field errors
                leadResult.errors.forEach(err => {
                    const errorMsg = err.message || JSON.stringify(err);

                    // Detect missing field errors
                    if (errorMsg.includes('No such column') || errorMsg.includes('Invalid field') ||
                        errorMsg.includes('does not exist') || errorMsg.includes('INVALID_FIELD')) {

                        // Extract field name from error message
                        const fieldMatch = errorMsg.match(/['"]?(\w+__c)['"]?/) || errorMsg.match(/column ['"](\w+)['"]/);
                        if (fieldMatch && fieldMatch[1]) {
                            missingFields.push(fieldMatch[1]);
                        }
                    }
                });

                if (missingFields.length > 0) {
                    detailedError = `Custom field(s) not found in Salesforce: ${missingFields.join(', ')}.\n\n` +
                                   `Please create these custom fields in your Salesforce org before transferring leads, or deactivate them in the field configuration.`;
                } else {
                    detailedError += ':\n' + leadResult.errors.map(e => e.message || JSON.stringify(e)).join('\n');
                }
            } else {
                detailedError += ': ' + JSON.stringify(leadResult.errors);
            }

            throw new Error(detailedError);
        }

        const leadId = leadResult.id;
        console.log(` Lead created with ID: ${leadId}`);

        // Handle attachments
        let attachmentResults = [];
        if (attachments && attachments.length > 0) {
            console.log(`📎 Processing ${attachments.length} attachment(s)`);

            for (const attachment of attachments) {
                try {
                    // Support both old format (filename/content) and new format (Name/Body)
                    const fileName = attachment.filename || attachment.Name || 'Untitled';
                    const fileContent = attachment.content || attachment.Body;

                    const contentVersion = {
                        Title: fileName,
                        PathOnClient: fileName,
                        VersionData: fileContent,
                        FirstPublishLocationId: leadId
                    };

                    const attachResult = await conn.sobject('ContentVersion').create(contentVersion);

                    if (attachResult.success) {
                        attachmentResults.push({
                            filename: fileName,
                            salesforceId: attachResult.id,
                            success: true
                        });
                        console.log(`✅ Attachment uploaded: ${fileName}`);
                    } else {
                        attachmentResults.push({
                            filename: fileName,
                            success: false,
                            error: JSON.stringify(attachResult.errors)
                        });
                    }
                } catch (attachError) {
                    console.error(`Attachment upload failed for ${fileName}:`, attachError);
                    attachmentResults.push({
                        filename: fileName,
                        success: false,
                        error: attachError.message
                    });
                }
            }
        }

        // Prepare response
        const response = {
            success: true,
            salesforceId: leadId,
            message: 'Lead successfully transferred to Salesforce',
            leadData: validatedLeadData,
            validationWarnings: validationResults.warnings,
            attachments: attachmentResults
        };

        if (attachmentResults.length > 0) {
            const successCount = attachmentResults.filter(r => r.success).length;
            response.attachmentSummary = `${successCount}/${attachmentResults.length} attachments transferred`;
        }

        console.log(`🎉 Transfer complete for lead: ${leadId}`);
        res.json(response);

    } catch (error) {
        console.error('Lead transfer failed:', error);

        // Include detailed error info if available
        let errorMessage = error.message || 'Unknown error';
        if (error.errors && Array.isArray(error.errors)) {
            errorMessage += ': ' + error.errors.map(e => e.message || JSON.stringify(e)).join('; ');
        }
        res.status(500).json({
            success: false,
            message: errorMessage,  // Send detailed error message to frontend
            error: errorMessage
        });
    }
});


app.post('/api/salesforce/leads/prepare', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn = getConnection(orgId);

        if (!conn) {
            return res.status(401).json({ message: 'Not connected to Salesforce' });
        }

        const { leadData } = req.body;

        if (!leadData) {
            return res.status(400).json({ message: 'leadData is required' });
        }

        console.log('🔍 Preparing lead transfer - checking fields...');

        // Get active fields for this client
        const activeFields = fieldConfigStorage.getActiveFields(orgId);
        console.log(`📋 Client has ${activeFields.length} active fields configured`);

        // Use the new service to check and create fields (with active fields filter)
        const result = await transferLeadWithAutoFieldCreation(conn, leadData, activeFields);

        res.json(result);

    } catch (error) {
        console.error('Lead preparation failed:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to prepare lead transfer',
            error: error.message
        });
    }
});

app.get('/api/salesforce/field-config', (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);

        if (!orgId) {
            return res.status(401).json({ message: 'Not connected to Salesforce' });
        }

        const config = fieldConfigStorage.getFieldConfig(orgId);
        res.json(config);

    } catch (error) {
        console.error('Failed to get field config:', error);
        res.status(500).json({ message: 'Failed to get field configuration', error: error.message });
    }
});

app.post('/api/salesforce/field-config', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);

        if (!orgId) {
            return res.status(401).json({ message: 'Not connected to Salesforce' });
        }

        const { activeFields, customLabels } = req.body;

        if (!activeFields || !Array.isArray(activeFields)) {
            return res.status(400).json({ message: 'activeFields array is required' });
        }

        const config = await fieldConfigStorage.setFieldConfig(orgId, activeFields, customLabels);

        res.json({
            success: true,
            message: `Field configuration saved for ${activeFields.length} active fields`,
            config
        });

    } catch (error) {
        console.error('Failed to set field config:', error);
        res.status(500).json({ message: 'Failed to save field configuration', error: error.message });
    }
});

// ========================================
// LEAD TRANSFER STATUS ENDPOINTS
// ========================================

app.get('/api/leads/transfer-status/:leadId', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        if (!orgId) {
            return res.status(401).json({ message: 'Not connected to Salesforce' });
        }

        const { leadId } = req.params;
        const conn = getConnection(orgId);

        const enhancedStatus = await leadTransferStatusService.getEnhancedLeadStatus(conn, orgId, leadId);

        res.json(enhancedStatus);
    } catch (error) {
        console.error('Failed to get lead status:', error);
        res.status(500).json({ message: 'Failed to get lead status', error: error.message });
    }
});

app.post('/api/leads/transfer-status/batch', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        if (!orgId) {
            return res.status(401).json({ message: 'Not connected to Salesforce' });
        }

        const { leadIds } = req.body;

        if (!Array.isArray(leadIds)) {
            return res.status(400).json({ message: 'leadIds must be an array' });
        }

        const conn = getConnection(orgId);
        const enhancedStatuses = {};

        for (const leadId of leadIds) {
            enhancedStatuses[leadId] = await leadTransferStatusService.getEnhancedLeadStatus(conn, orgId, leadId);
        }

        res.json(enhancedStatuses);
    } catch (error) {
        console.error('Failed to get batch statuses:', error);
        res.status(500).json({ message: 'Failed to get batch statuses', error: error.message });
    }
});

app.post('/api/leads/transfer-status', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        if (!orgId) {
            return res.status(401).json({ message: 'Not connected to Salesforce' });
        }

        const { leadId, status, salesforceId, errorMessage } = req.body;

        if (!leadId || !status) {
            return res.status(400).json({ message: 'leadId and status are required' });
        }

        if (!['Success', 'Failed', 'Pending'].includes(status)) {
            return res.status(400).json({ message: 'status must be Success, Failed, or Pending' });
        }

        const savedStatus = await leadTransferStatusService.setLeadStatus(orgId, leadId, {
            status,
            salesforceId,
            errorMessage
        });

        res.json({
            success: true,
            message: 'Transfer status saved',
            data: savedStatus
        });

    } catch (error) {
        console.error('Failed to set lead status:', error);
        res.status(500).json({ message: 'Failed to save transfer status', error: error.message });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy server run',
        timestamp: new Date().toISOString(),
        connections: connections.size
    });
});


app.get('/displayLeadTransfer', (req, res) => {
    res.sendFile(path.join(__dirname, '../pages/displayLeadTransfer.html'));
});


// --- LEAD FIELD UPDATES ---

const fs = require('fs').promises;
const leadUpdatesFile = path.join(__dirname, 'lead-field-updates.json');

async function loadLeadUpdates() {
    try {
        const data = await fs.readFile(leadUpdatesFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // File doesn't exist or is invalid, return empty object
        return {};
    }
}

async function saveLeadUpdates(updates) {
    try {
        await fs.writeFile(leadUpdatesFile, JSON.stringify(updates, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving lead updates:', error);
        return false;
    }
}

app.get('/api/lead-field-updates/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;

        const allUpdates = await loadLeadUpdates();
        const eventUpdates = allUpdates[eventId] || {};

        console.log(` Found ${Object.keys(eventUpdates).length} field updates for EventId: ${eventId}`);
        res.json({
            success: true,
            eventId: eventId,
            updates: eventUpdates,
            count: Object.keys(eventUpdates).length
        });
    } catch (error) {
        console.error('Error loading lead field updates:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading field updates',
            error: error.message
        });
    }
});

app.post('/v1/test', async (req, res) => {
    try {
        const { eventId, fieldUpdates } = req.body;

        if (!eventId) {
            return res.status(400).json({
                success: false,
                message: 'EventId is required 111'
            });
        }

        if (!fieldUpdates || typeof fieldUpdates !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'fieldUpdates object is required'
            });
        }

        console.log(`💾 Saving field updates for EventId: ${eventId}`);
        console.log(` Updates to save:`, fieldUpdates);

        // Load existing updates
        const allUpdates = await loadLeadUpdates();

        // Merge with existing updates for this EventId
        if (!allUpdates[eventId]) {
            allUpdates[eventId] = {};
        }

        // Update fields with new values
        Object.assign(allUpdates[eventId], fieldUpdates);

        // Save back to file
        const saved = await saveLeadUpdates(allUpdates);

        if (saved) {
            console.log(` Successfully saved ${Object.keys(fieldUpdates).length} field updates for EventId: ${eventId}`);
            res.json({
                success: true,
                message: 'Field updates saved successfully',
                eventId: eventId,
                updatedFields: Object.keys(fieldUpdates),
                totalUpdatesForEvent: Object.keys(allUpdates[eventId]).length
            });
        } else {
            throw new Error('Failed to save updates to file');
        }
    } catch (error) {
        console.error('Error saving lead field updates:', error);
        res.status(500).json({
            success: false,
            message: 'Error saving field updates',
            error: error.message
        });
    }
});

app.delete('/api/lead-field-updates/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;
        console.log(`Deleting field updates for EventId: ${eventId}`);

        const allUpdates = await loadLeadUpdates();

        if (allUpdates[eventId]) {
            delete allUpdates[eventId];
            const saved = await saveLeadUpdates(allUpdates);

            if (saved) {
                console.log(` Successfully deleted field updates for EventId: ${eventId}`);
                res.json({
                    success: true,
                    message: 'Field updates deleted successfully',
                    eventId: eventId
                });
            } else {
                throw new Error('Failed to save updates after deletion');
            }
        } else {
            res.json({
                success: true,
                message: 'No field updates found for this EventId',
                eventId: eventId
            });
        }
    } catch (error) {
        console.error('Error deleting lead field updates:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting field updates',
            error: error.message
        });
    }
});

// --- ERROR HANDLING ---

app.use((req, res, next) => {
    res.status(404).json({
        message: 'Route not found',
        path: req.path,
        method: req.method
    });
});

app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        message: 'Internal server error',
        error: error.message || 'Something went wrong',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
});


// --- SERVER STARTUP ---

app.set('views', path.join(__dirname, 'views'));
fieldConfigStorage.initializeStorage().then(() => {
    console.log('✅ Field configuration storage initialized');
}).catch(error => {
    console.error('Failed to initialize field configuration storage:', error);
});

app.listen(port, () => {
    console.log('\n🚀 Salesforce Lead Manager Backend');
    console.log('=====================================');
    console.log(`🌐 Server: http://localhost:${port}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 OAuth: ${config.salesforce.clientId ? '✅ Configured' : '❌ Missing'}`);
    console.log('=====================================');
    console.log('Key Routes:');
    console.log('  🏠 /                        - Backend homepage');
    console.log('  🔐 /auth/salesforce         - OAuth flow');
    console.log('  📤 /api/salesforce/transfer - Transfer leads');
    console.log('  ❤️  /api/health             - Health check');
    console.log('=====================================\n');
});

process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down server...');
    process.exit(0);
});