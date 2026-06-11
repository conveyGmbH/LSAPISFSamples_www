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
const connectionStore = require('./connectionStore');

const app = express();
const port = process.env.PORT || 3000;


function determineEnvironmentAndConfig() {
    const isProd = process.env.NODE_ENV === 'production';
    const hostname = process.env.HOSTNAME || process.env.WEBSITE_HOSTNAME || '';
    const port = process.env.PORT || 3000;

    const isAzure = Boolean(process.env.WEBSITE_HOSTNAME || process.env.WEBSITE_SITE_NAME);
    const isProductionHost = hostname.includes('convey.de') ||
                           hostname.includes('azurewebsites.net') ||
                           hostname.includes('azurestaticapps.net') ||
                           isAzure;

    // NOTE: do NOT treat "port !== 3000" as production — the local dev backend
    // runs on 3001 (Next uses 3000), and that heuristic forced the production
    // redirect URI, sending the OAuth callback to Azure instead of localhost.
    // Rely on NODE_ENV and real Azure/host detection instead.
    // Boolean() so the value is never `undefined` (|| returns the last falsy
    // operand, which would otherwise drop isProduction from JSON responses).
    const isProduction = Boolean(isProd || isProductionHost);

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
    'http://localhost:3001',
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

    // Only provide oauth2 config when we have a refreshToken — otherwise jsforce
    // will attempt an automatic token refresh and fail with "No refresh token found"
    const connOptions = {
        accessToken: sessionData.accessToken,
        refreshToken: sessionData.refreshToken,
        instanceUrl: sessionData.instanceUrl
    };
    if (sessionData.refreshToken) {
        connOptions.oauth2 = {
            clientId: clientId,
            clientSecret: clientSecret,
            redirectUri: config.salesforce.redirectUri,
            loginUrl: loginUrl
        };
    }

    const conn = new jsforce.Connection(connOptions);

    conn.on('refresh', (accessToken, res) => {
        console.log('Token refreshed for session:', sessionData._sessionId || sessionData.organizationId);
        sessionData.accessToken = accessToken;
        const key = sessionData._sessionId || sessionData.organizationId;
        connections.set(key, {
            ...sessionData,
            connection: conn,
            lastRefresh: new Date()
        });
        // Persist the refreshed access token so it survives a restart
        connectionStore.saveSessions(connections);
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
    // Persist so the session survives a server restart (no re-OAuth needed)
    connectionStore.saveSessions(connections);
    return conn;
}

function getConnection(sessionId) {
    // Never resolve a missing or shared-bucket key — that would let a user without
    // a valid isolation key fall into someone else's (or a shared 'default') connection.
    if (!sessionId || sessionId === 'default') return null;
    const connData = connections.get(sessionId);
    return connData ? connData.connection : null;
}

// Resolve a connection by trying the candidate keys a caller might present, in
// order, returning the first that maps to a stored connection. This keeps BOTH
// clients working:
//  - LSPortalNext sends X-Org-Id = ls_<MitarbeiterID> (its isolation key)
//  - the WinJS portal sends X-Org-Id = the Salesforce orgId AND
//    X-Session-Token = the express sessionID the connection was stored under
// We never accept a missing/'default' key (no shared bucket).
function resolveConnectionKey(req) {
    const candidates = [
        req.headers['x-org-id'],
        req.headers['x-session-token'],
        req.session && req.session.currentOrgId,
        req.sessionID,
    ];
    for (const key of candidates) {
        if (key && key !== 'default' && connections.has(key)) return key;
    }
    return null;
}

function getConnectionForReq(req) {
    return getConnection(resolveConnectionKey(req));
}

function getUserInfo(sessionId) {
    const connData = connections.get(sessionId);
    return connData ? connData.userInfo : null;
}

function removeConnection(sessionId) {
    connections.delete(sessionId);
    // Keep the persisted file in sync with the in-memory map
    connectionStore.saveSessions(connections);
}

/**
 * Re-hydrate the connections map from disk on startup, rebuilding live jsforce
 * Connection objects from the persisted token data.
 */
async function restoreConnections() {
    const sessions = await connectionStore.loadSessions();
    let restored = 0;
    for (const [key, sessionData] of Object.entries(sessions)) {
        try {
            const conn = createConnection(sessionData);
            connections.set(key, {
                ...sessionData,
                connection: conn,
                connectedAt: new Date(),
                lastRefresh: new Date(),
            });
            restored++;
        } catch (err) {
            console.error(`Failed to restore connection ${key}:`, err.message);
        }
    }
    if (restored) console.log(`♻️  Restored ${restored} Salesforce connection(s) from disk`);
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
    // Per-user isolation: the app sends X-Org-Id = ls_<MitarbeiterID>, which is the
    // key the connection was stored under. Prefer it so each user only ever resolves
    // their own SF connection. X-Session-Token / sessionID are accepted as fallbacks
    // for older callers. Returns null when no identifying key is present — callers
    // MUST treat null as "not connected" rather than sharing a 'default' bucket.
    return (
        req.headers['x-org-id'] ||
        req.headers['x-session-token'] ||
        req.session.currentOrgId ||
        req.sessionID ||
        null
    );
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

    // Phone, email, website, field length — all intentionally left to Salesforce validation
    // SF returns explicit error codes (INVALID_EMAIL_ADDRESS, STRING_TOO_LONG, etc.) that are surfaced to the user

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
            state: state,
            prompt: 'login'
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

// Dedup cache for OAuth codes — prevents double-exchange on browser prefetch / double redirect
const _usedOAuthCodes = new Map(); // code → timestamp
const _OAUTH_CODE_TTL = 30_000; // 30s
setInterval(() => {
    const cutoff = Date.now() - _OAUTH_CODE_TTL;
    for (const [k, v] of _usedOAuthCodes) if (v < cutoff) _usedOAuthCodes.delete(k);
}, 60_000);

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

        if (_usedOAuthCodes.has(code)) {
            console.log('OAuth code already used — ignoring duplicate callback');
            return res.send('<script>window.close();</script>');
        }
        _usedOAuthCodes.set(code, Date.now());

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

        // Index by the per-user isolation key (orgId = ls_<MitarbeiterID> sent by the
        // app), so each LeadSuccess user owns exactly one SF connection and can never
        // resolve another user's. Fall back to sessionID only if no key was supplied.
        const connectionKey = (orgId && orgId !== 'default') ? orgId : req.sessionID;
        storeConnection(sessionData, connectionKey);

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
                            sessionToken: '${req.sessionID}',
                            userInfo: ${JSON.stringify(fullUserInfo)},
                            accessToken: '${conn.accessToken}',
                            instanceUrl: '${conn.instanceUrl}',
                            refreshToken: '${conn.refreshToken || ''}'
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
            state: state,
            prompt: 'login'
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
            state: state,
            prompt: 'login'
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

// Login with username/password credentials (for Postman / API clients that can't do OAuth popup)
app.post('/api/salesforce/login', async (req, res) => {
    const { accessToken, instanceUrl, organizationId, userId } = req.body;

    if (!accessToken || !instanceUrl) {
        return res.status(400).json({ message: 'accessToken and instanceUrl are required' });
    }

    try {
        const sessionData = {
            accessToken,
            instanceUrl,
            organizationId: organizationId || 'unknown',
            userInfo: { id: userId, organizationId: organizationId || 'unknown' }
        };

        // Store under the per-user isolation key (ls_<MitarbeiterID>) the app sends,
        // so a later check/leads call resolves THIS user's connection.
        const loginKey = req.headers['x-org-id'] || organizationId || req.sessionID;
        storeConnection(sessionData, loginKey);
        req.session.authenticated = true;
        req.session.currentOrgId = organizationId || 'unknown';

        console.log(`✅ Manual login via /api/salesforce/login — session: ${req.sessionID}`);
        res.json({ success: true, message: 'Connected', sessionId: req.sessionID });
    } catch (error) {
        console.error('Login failed:', error);
        res.status(500).json({ message: 'Login failed', error: error.message });
    }
});

app.post('/api/salesforce/refresh', async (req, res) => {
    const { refreshToken, organizationId } = req.body;
    if (!refreshToken) {
        return res.status(400).json({ message: 'refreshToken is required' });
    }
    try {
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: config.salesforce.clientId,
            client_secret: config.salesforce.clientSecret
        });
        const sfRes = await fetch(`${config.salesforce.loginUrl}/services/oauth2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        if (!sfRes.ok) {
            const err = await sfRes.text();
            console.error('SF refresh token error:', err);
            return res.status(401).json({ message: 'Refresh token invalid or expired' });
        }
        const tokens = await sfRes.json();
        const sessionData = {
            accessToken: tokens.access_token,
            // Salesforce only returns a new refresh_token when rotation is on;
            // otherwise keep reusing the one the client sent so the stored
            // connection can auto-refresh again later.
            refreshToken: tokens.refresh_token || refreshToken,
            instanceUrl: tokens.instance_url,
            organizationId: organizationId || 'unknown',
            userInfo: { organizationId: organizationId || 'unknown' }
        };
        // Store under the per-user isolation key (ls_<MitarbeiterID>) so the
        // refreshed connection is the one this user's later calls resolve.
        const refreshKey = req.headers['x-org-id'] || organizationId || req.sessionID;
        storeConnection(sessionData, refreshKey);
        req.session.authenticated = true;
        req.session.currentOrgId = refreshKey;
        console.log(`✅ Token refreshed via /api/salesforce/refresh — key: ${refreshKey}`);
        res.json({
            success: true,
            sessionId: req.sessionID,
            accessToken: tokens.access_token,
            instanceUrl: tokens.instance_url,
            // Included only if refresh token rotation is enabled in SF Connected App
            ...(tokens.refresh_token && { refreshToken: tokens.refresh_token })
        });
    } catch (error) {
        console.error('Refresh failed:', error);
        res.status(500).json({ message: 'Refresh failed', error: error.message });
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
            const conn = getConnectionForReq(req);

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
                    const connData = connections.get(resolveConnectionKey(req));
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
        const userInfo = getUserInfo(resolveConnectionKey(req));

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
        const conn = getConnectionForReq(req);

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
        const conn = getConnectionForReq(req);

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

app.post('/api/logout', async (req, res) => {
    try {
        // Resolve the real stored key (works for both the portal's sessionID-keyed
        // connections and the app's ls_<id> isolation key).
        const key = resolveConnectionKey(req);

        // Revoke the token on Salesforce so the OAuth grant is fully invalidated —
        // otherwise the refresh token stays valid and a silent re-auth is possible.
        // Best-effort: never let a revoke failure block the local logout.
        if (key) {
            const connData = connections.get(key);
            const tokenToRevoke = connData && (connData.refreshToken || connData.accessToken);
            const instanceUrl = connData && connData.instanceUrl;
            const loginUrl = (connData && connData.loginUrl) || config.salesforce.loginUrl;
            if (tokenToRevoke) {
                const revokeBase = instanceUrl || loginUrl;
                try {
                    await fetch(`${revokeBase}/services/oauth2/revoke`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({ token: tokenToRevoke }).toString()
                    });
                    console.log(`🔒 Revoked Salesforce token for key: ${key}`);
                } catch (revokeErr) {
                    console.warn('Salesforce token revoke failed (continuing logout):', revokeErr.message);
                }
            }
            removeConnection(key);
        }

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
        const conn = getConnectionForReq(req);

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
        const conn = getConnectionForReq(req);

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
        const conn = getConnectionForReq(req);

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
        const conn = getConnectionForReq(req);

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

// --- GET files linked to a lead ---
app.get('/api/leads/:id/files', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn  = getConnectionForReq(req);
        if (!conn) return res.status(401).json({ message: 'Not connected to Salesforce' });

        const { id } = req.params;

        // Query ContentDocumentLinks for this lead, then join ContentVersion metadata
        const soql = `SELECT ContentDocumentId, ContentDocument.LatestPublishedVersionId,
                             ContentDocument.Title, ContentDocument.FileType,
                             ContentDocument.ContentSize, ContentDocument.CreatedDate
                      FROM ContentDocumentLink
                      WHERE LinkedEntityId = '${id}'
                      ORDER BY ContentDocument.CreatedDate DESC`;

        const result = await conn.query(soql);
        const files  = (result.records || []).map(r => ({
            contentDocumentId:        r.ContentDocumentId,
            contentVersionId:         r.ContentDocument?.LatestPublishedVersionId,
            title:                    r.ContentDocument?.Title       || 'Untitled',
            fileType:                 r.ContentDocument?.FileType    || '',
            size:                     r.ContentDocument?.ContentSize || 0,
            createdDate:              r.ContentDocument?.CreatedDate || null
        }));

        res.json({ files });
    } catch (error) {
        console.error('Failed to fetch lead files:', error);
        res.status(500).json({ message: 'Failed to fetch lead files', error: error.message });
    }
});

// --- GET file counts for multiple leads (batch) ---
app.post('/api/leads/files/counts', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn  = getConnectionForReq(req);
        if (!conn) return res.status(401).json({ message: 'Not connected to Salesforce' });

        const { leadIds } = req.body;
        if (!Array.isArray(leadIds) || leadIds.length === 0) return res.json({ counts: {} });

        // SF SOQL: count ContentDocumentLinks grouped by LinkedEntityId
        const idList = leadIds.map(id => `'${id}'`).join(',');
        const soql = `SELECT LinkedEntityId, COUNT(ContentDocumentId) cnt
                      FROM ContentDocumentLink
                      WHERE LinkedEntityId IN (${idList})
                      GROUP BY LinkedEntityId`;

        const result = await conn.query(soql);
        const counts = {};
        (result.records || []).forEach(r => { counts[r.LinkedEntityId] = r.cnt; });

        res.json({ counts });
    } catch (error) {
        console.error('Failed to fetch file counts:', error);
        res.status(500).json({ message: 'Failed to fetch file counts', error: error.message });
    }
});

// --- Download a ContentVersion (base64) ---
app.get('/api/files/:contentVersionId/download', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn  = getConnectionForReq(req);
        if (!conn) return res.status(401).json({ message: 'Not connected to Salesforce' });

        const { contentVersionId } = req.params;

        // Fetch metadata + VersionData (base64)
        const cv = await conn.sobject('ContentVersion').retrieve(contentVersionId, ['Title', 'FileType', 'ContentSize', 'VersionData']);

        // VersionData is a URL to the file body in jsforce — fetch it
        const fileUrl = `${conn.instanceUrl}${cv.VersionData}`;
        const fileRes = await fetch(fileUrl, {
            headers: { 'Authorization': `Bearer ${conn.accessToken}` }
        });
        if (!fileRes.ok) throw new Error(`SF file fetch failed: HTTP ${fileRes.status}`);

        const buffer = await fileRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeMap = {
            PDF: 'application/pdf', PNG: 'image/png', JPG: 'image/jpeg',
            JPEG: 'image/jpeg', GIF: 'image/gif', SVG: 'image/svg+xml',
            TXT: 'text/plain', CSV: 'text/csv', DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            MP4: 'video/mp4', MP3: 'audio/mpeg'
        };
        const mimeType = mimeMap[(cv.FileType || '').toUpperCase()] || 'application/octet-stream';

        res.json({
            title:    cv.Title,
            fileType: cv.FileType,
            mimeType,
            size:     cv.ContentSize,
            base64
        });
    } catch (error) {
        console.error('Failed to download file:', error);
        res.status(500).json({ message: 'Failed to download file', error: error.message });
    }
});

// --- DELETE all files linked to a lead ---
app.delete('/api/leads/:id/files', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn  = getConnectionForReq(req);
        if (!conn) return res.status(401).json({ message: 'Not connected to Salesforce' });

        const { id } = req.params;

        // Get all ContentDocument IDs linked to this lead
        const soql = `SELECT ContentDocumentId FROM ContentDocumentLink WHERE LinkedEntityId = '${id}'`;
        const result = await conn.query(soql);
        const ids = (result.records || []).map(r => r.ContentDocumentId);

        if (ids.length === 0) return res.json({ success: true, deleted: 0 });

        // Batch delete via composite (max 200 per SF limit)
        const deleteResults = await conn.sobject('ContentDocument').delete(ids);
        const deleted = Array.isArray(deleteResults)
            ? deleteResults.filter(r => r.success).length
            : (deleteResults.success ? 1 : 0);

        res.json({ success: true, deleted, total: ids.length });
    } catch (error) {
        console.error('Failed to delete lead files:', error);
        res.status(500).json({ message: 'Failed to delete lead files', error: error.message });
    }
});

// --- DELETE a single ContentDocument (file) ---
app.delete('/api/files/:contentDocumentId', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn  = getConnectionForReq(req);
        if (!conn) return res.status(401).json({ message: 'Not connected to Salesforce' });

        const { contentDocumentId } = req.params;
        const result = await conn.sobject('ContentDocument').delete(contentDocumentId);
        if (result.success) {
            res.json({ success: true, id: contentDocumentId });
        } else {
            throw new Error('Delete failed: ' + JSON.stringify(result.errors));
        }
    } catch (error) {
        console.error('Failed to delete file:', error);
        res.status(500).json({ message: 'Failed to delete file', error: error.message });
    }
});

// --- DEV-ONLY: clean up Salesforce File Storage (ContentDocuments linked to Leads) ---
// Guarded by dev mode. GET = dry-run (count + size). DELETE = actually remove.
// Frees File Storage when an org hits its quota (the lead transfer attaches files).
function requireDevMode(req, res, next) {
    if (config.environment.isProduction) {
        return res.status(403).json({ message: 'Dev-mode only endpoint' });
    }
    next();
}

// Collect ContentDocument ids. scope='leads' → only files linked to a Lead;
// scope='all' → every ContentDocument in the org (dev clean-up of File Storage).
async function collectDocIds(conn, scope) {
    if (scope === 'all') {
        const docs = await conn.query('SELECT Id FROM ContentDocument LIMIT 10000');
        return (docs.records || []).map(r => r.Id);
    }
    // scope 'leads' (default): Leads → their ContentDocumentLinks → ContentDocumentIds
    const docIds = new Set();
    const leads = await conn.query('SELECT Id FROM Lead LIMIT 2000');
    const leadIds = (leads.records || []).map(r => r.Id);
    for (let i = 0; i < leadIds.length; i += 200) {
        const inList = leadIds.slice(i, i + 200).map(id => `'${id}'`).join(',');
        if (!inList) continue;
        const links = await conn.query(
            `SELECT ContentDocumentId FROM ContentDocumentLink WHERE LinkedEntityId IN (${inList})`
        );
        (links.records || []).forEach(l => docIds.add(l.ContentDocumentId));
    }
    return [...docIds];
}

async function sumDocBytes(conn, ids) {
    let totalBytes = 0;
    for (let i = 0; i < ids.length; i += 200) {
        const inList = ids.slice(i, i + 200).map(id => `'${id}'`).join(',');
        if (!inList) continue;
        const cd = await conn.query(`SELECT ContentSize FROM ContentDocument WHERE Id IN (${inList})`);
        (cd.records || []).forEach(r => { totalBytes += (r.ContentSize || 0); });
    }
    return totalBytes;
}

// Dry-run: how many files + total bytes. ?scope=all to count every file in the org.
app.get('/api/salesforce/files/cleanup', requireDevMode, async (req, res) => {
    try {
        const conn = getConnectionForReq(req);
        if (!conn) return res.status(401).json({ message: 'Not connected to Salesforce' });

        const scope = req.query.scope === 'all' ? 'all' : 'leads';
        const ids = await collectDocIds(conn, scope);
        const totalBytes = await sumDocBytes(conn, ids);
        res.json({ scope, count: ids.length, totalBytes, totalMB: +(totalBytes / 1048576).toFixed(1) });
    } catch (error) {
        console.error('File cleanup dry-run failed:', error);
        res.status(500).json({ message: 'Dry-run failed', error: error.message });
    }
});

// Delete: remove ContentDocuments (irreversible in SF). ?scope=all for every file.
app.delete('/api/salesforce/files/cleanup', requireDevMode, async (req, res) => {
    try {
        const conn = getConnectionForReq(req);
        if (!conn) return res.status(401).json({ message: 'Not connected to Salesforce' });

        const scope = req.query.scope === 'all' ? 'all' : 'leads';
        const ids = await collectDocIds(conn, scope);
        if (ids.length === 0) return res.json({ success: true, deleted: 0, total: 0, scope });

        // Use the Composite sObjects Collections API with allOrNone=false — same call
        // that works in Postman: DELETE /composite/sobjects?ids=...&allOrNone=false.
        // It deletes up to 200 per call and keeps going past individual failures
        // (e.g. the asset file that throws DEPENDENCY_EXISTS).
        const apiVersion = conn.version || '56.0';
        let deleted = 0;
        const errors = [];
        const deletedIds = [];
        for (let i = 0; i < ids.length; i += 200) {
            const chunk = ids.slice(i, i + 200);
            const url = `/services/data/v${apiVersion}/composite/sobjects?ids=${chunk.join(',')}&allOrNone=false`;
            const results = await conn.request({ method: 'DELETE', url });
            (Array.isArray(results) ? results : [results]).forEach(r => {
                if (r.success) { deleted++; if (r.id) deletedIds.push(r.id); }
                else errors.push(r.errors);
            });
        }

        // CRITICAL: a normal delete moves records to the Recycle Bin, where they STILL
        // count against File Storage (~15 days). Hard-delete them to free space now.
        let purged = 0;
        for (let i = 0; i < deletedIds.length; i += 200) {
            const chunk = deletedIds.slice(i, i + 200);
            try {
                await conn.soap.emptyRecycleBin(chunk);
                purged += chunk.length;
            } catch (e) {
                console.warn('emptyRecycleBin failed for a chunk:', e.message);
            }
        }

        console.log(`🧹 Dev cleanup (${scope}): deleted ${deleted}/${ids.length}, purged ${purged} from recycle bin`);
        res.json({ success: true, deleted, purged, total: ids.length, scope, errors: errors.slice(0, 5) });
    } catch (error) {
        console.error('File cleanup failed:', error);
        res.status(500).json({ message: 'Cleanup failed', error: error.message });
    }
});

// DEV-ONLY: purge already-deleted ContentDocuments still sitting in the Recycle Bin
// (they keep counting against File Storage until hard-deleted). scanAll finds them.
app.delete('/api/salesforce/files/recyclebin', requireDevMode, async (req, res) => {
    try {
        const conn = getConnectionForReq(req);
        if (!conn) return res.status(401).json({ message: 'Not connected to Salesforce' });

        // scanAll:true includes deleted/archived records (the recycle bin)
        const result = await conn.query(
            'SELECT Id FROM ContentDocument WHERE IsDeleted = true',
            { scanAll: true }
        );
        const ids = (result.records || []).map(r => r.Id);
        if (ids.length === 0) return res.json({ success: true, purged: 0 });

        let purged = 0;
        const errors = [];
        for (let i = 0; i < ids.length; i += 200) {
            const chunk = ids.slice(i, i + 200);
            try {
                await conn.soap.emptyRecycleBin(chunk);
                purged += chunk.length;
            } catch (e) {
                errors.push(e.message);
            }
        }
        console.log(`🗑️  Purged ${purged}/${ids.length} ContentDocuments from recycle bin`);
        res.json({ success: true, purged, total: ids.length, errors: errors.slice(0, 5) });
    } catch (error) {
        console.error('Recycle bin purge failed:', error);
        res.status(500).json({ message: 'Purge failed', error: error.message });
    }
});

app.post('/api/salesforce/fields/check', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn = getConnectionForReq(req);

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
        const conn = getConnectionForReq(req);

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
        const conn = getConnectionForReq(req);

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


app.post('/api/salesforce/leads', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn = getConnectionForReq(req);

        if (!conn) {
            return res.status(401).json({ message: 'Not connected to Salesforce' });
        }

        const { leadData, attachments = [], externalIdField } = req.body;

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

        // Validation removed — let Salesforce return native errors (REQUIRED_FIELD_MISSING, etc.)

        // --- UPSERT MODE: if externalIdField is provided and has a value in leadData ---
        // This supports UPDATE of existing SF leads via a custom External ID field (e.g. LS_LeadId__c)
        const externalIdValue = externalIdField ? processedLeadData[externalIdField] : null;
        const isUpsertMode = !!(externalIdField && externalIdValue);

        let leadId;
        let isUpdate = false;

        if (isUpsertMode) {
            // UPSERT: Create or update based on External ID field
            console.log(`🔄 UPSERT mode: using ${externalIdField} = ${externalIdValue}`);

            // Remove the external ID field from the data to avoid SF duplicate field error
            const upsertData = { ...processedLeadData };
            // SF upsert requires the external ID field value in the upsert call, not in the record body
            delete upsertData[externalIdField];

            const upsertResult = await conn.sobject('Lead').upsert(
                { ...upsertData, [externalIdField]: externalIdValue },
                externalIdField
            );

            const result = Array.isArray(upsertResult) ? upsertResult[0] : upsertResult;

            if (!result.success) {
                let errorMessage = 'Failed to upsert lead in Salesforce';
                if (result.errors && result.errors.length > 0) {
                    errorMessage = result.errors.map(e => e.message || JSON.stringify(e)).join(' | ');
                }
                console.error('SF upsert failed (422):', errorMessage);
                return res.status(422).json({ success: false, message: errorMessage });
            }

            leadId = result.id;
            isUpdate = !result.created;
            console.log(`✅ Lead ${isUpdate ? 'updated' : 'created'} via upsert: ${leadId}`);

        } else {
            // CREATE MODE: Check for duplicates first, then create
            const lastName = (processedLeadData.LastName || '').replace(/'/g, "\\'");
            const company = (processedLeadData.Company || '').replace(/'/g, "\\'");
            const duplicateQuery = `
                SELECT Id, FirstName, LastName, Company, Email
                FROM Lead
                WHERE LastName = '${lastName}'
                AND Company = '${company}'
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

            // Create the lead
            const leadResult = await conn.sobject('Lead').create(processedLeadData);

            if (!leadResult.success) {
                // Check for SF duplicate rule (DUPLICATES_DETECTED)
                const isDuplicate = leadResult.errors && leadResult.errors.some(
                    e => e.statusCode === 'DUPLICATES_DETECTED' || e.errorCode === 'DUPLICATES_DETECTED'
                );
                if (isDuplicate) {
                    return res.status(409).json({
                        message: 'Duplicate lead detected by Salesforce'
                    });
                }

                // All other Salesforce errors (REQUIRED_FIELD_MISSING, STORAGE_LIMIT_EXCEEDED,
                // INVALID_EMAIL_ADDRESS, INVALID_FIELD, etc.) are business errors — return 422
                // so the client marks the lead as "failed" without logging a server crash.
                let errorMessage = 'Failed to create lead in Salesforce';
                if (leadResult.errors && Array.isArray(leadResult.errors) && leadResult.errors.length > 0) {
                    errorMessage = leadResult.errors.map(e => e.message || JSON.stringify(e)).join(' | ');
                }
                console.error('SF create failed (422):', errorMessage);
                return res.status(422).json({ success: false, message: errorMessage });
            }

            leadId = leadResult.id;
            console.log(`✅ Lead created with ID: ${leadId}`);
        }

        // Handle attachments
        let attachmentResults = [];
        if (attachments && attachments.length > 0) {
            console.log(`📎 Processing ${attachments.length} attachment(s)`);

            for (const attachment of attachments) {
                const fileName = attachment.filename || attachment.Name || 'Untitled';
                try {
                    // Support both old format (filename/content) and new format (Name/Body)
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
            isUpdate: isUpdate || false,
            message: isUpdate ? 'Lead successfully updated in Salesforce' : 'Lead successfully created in Salesforce',
            leadData: processedLeadData,
            attachments: attachmentResults
        };

        if (attachmentResults.length > 0) {
            const successCount = attachmentResults.filter(r => r.success).length;
            response.attachmentSummary = `${successCount}/${attachmentResults.length} attachments transferred`;
        }

        console.log(`🎉 Transfer complete for lead: ${leadId} (${isUpdate ? 'updated' : 'created'})`);
        res.json(response);

    } catch (error) {
        console.error('Lead transfer failed:', error);

        let errorMessage = error.message || 'Unknown error';
        if (error.errors && Array.isArray(error.errors)) {
            errorMessage += ': ' + error.errors.map(e => e.message || JSON.stringify(e)).join('; ');
        }

        // Salesforce validation errors (REQUIRED_FIELD_MISSING, INVALID_EMAIL_ADDRESS, etc.)
        // are business errors — return 422 so the client marks the lead as "failed", not a server crash
        const sfValidationCodes = [
            'REQUIRED_FIELD_MISSING', 'INVALID_EMAIL_ADDRESS', 'STRING_TOO_LONG',
            'FIELD_CUSTOM_VALIDATION_EXCEPTION', 'INVALID_FIELD', 'FIELD_INTEGRITY_EXCEPTION',
            'DUPLICATE_VALUE', 'STORAGE_LIMIT_EXCEEDED', 'ENTITY_IS_DELETED',
            'UNABLE_TO_LOCK_ROW', 'INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY'
        ];
        const isSfValidationError =
            sfValidationCodes.includes(error.errorCode) ||
            sfValidationCodes.includes(error.name) ||
            (error.fields && Array.isArray(error.fields) && error.fields.length > 0) ||
            (typeof error.message === 'string' && error.message.toLowerCase().includes('storage limit'));

        const statusCode = isSfValidationError ? 422 : 500;

        res.status(statusCode).json({
            success: false,
            message: errorMessage,
            sfErrors: error.fields ? [{ message: errorMessage, fields: error.fields }] : undefined,
            error: errorMessage
        });
    }
});


app.post('/api/salesforce/leads/prepare', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn = getConnectionForReq(req);

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
        const conn = getConnectionForReq(req);

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

        const conn = getConnectionForReq(req);
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
        connections: connections.size,
        // Exposed for OAuth debugging — the redirect_uri the backend sends to Salesforce
        redirectUri: config.salesforce.redirectUri,
        // Server-of-truth for dev/prod. Frontend gates dev-only tools on this.
        isProduction: config.environment.isProduction
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

// --- ANALYTICS ROUTES ---

app.get('/api/salesforce/analytics/overview', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn = getConnectionForReq(req);
        if (!conn) return res.status(401).json({ message: 'Not connected to Salesforce' });

        const [totalRes, newRes, convertedRes, unreadRes] = await Promise.all([
            conn.query('SELECT COUNT(Id) cnt FROM Lead'),
            conn.query('SELECT COUNT(Id) cnt FROM Lead WHERE CreatedDate = LAST_N_DAYS:7'),
            conn.query("SELECT COUNT(Id) cnt FROM Lead WHERE Status = 'Closed - Converted'"),
            conn.query('SELECT COUNT(Id) cnt FROM Lead WHERE IsUnreadByOwner = true')
        ]);

        const total = totalRes.records[0].cnt;
        const newLast7Days = newRes.records[0].cnt;
        const converted = convertedRes.records[0].cnt;
        const unread = unreadRes.records[0].cnt;

        res.json({
            total,
            newLast7Days,
            converted,
            unread,
            conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0
        });
    } catch (error) {
        console.error('Analytics overview failed:', error);
        res.status(500).json({ message: 'Analytics failed', error: error.message });
    }
});

app.get('/api/salesforce/analytics/by-status', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn = getConnectionForReq(req);
        if (!conn) return res.status(401).json({ message: 'Not connected to Salesforce' });

        const result = await conn.query('SELECT Status, COUNT(Id) cnt FROM Lead GROUP BY Status ORDER BY COUNT(Id) DESC');
        res.json(result.records.map(r => ({ status: r.Status || 'Unknown', count: r.cnt })));
    } catch (error) {
        console.error('Analytics by-status failed:', error);
        res.status(500).json({ message: 'Analytics failed', error: error.message });
    }
});

app.get('/api/salesforce/analytics/by-source', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn = getConnectionForReq(req);
        if (!conn) return res.status(401).json({ message: 'Not connected to Salesforce' });

        const result = await conn.query('SELECT LeadSource, COUNT(Id) cnt FROM Lead GROUP BY LeadSource ORDER BY COUNT(Id) DESC');
        res.json(result.records.map(r => ({ source: r.LeadSource || 'Unknown', count: r.cnt })));
    } catch (error) {
        console.error('Analytics by-source failed:', error);
        res.status(500).json({ message: 'Analytics failed', error: error.message });
    }
});

app.get('/api/salesforce/analytics/timeline', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn = getConnectionForReq(req);
        if (!conn) return res.status(401).json({ message: 'Not connected to Salesforce' });

        const days = parseInt(req.query.days) || 30;
        const result = await conn.query(
            `SELECT DAY_ONLY(CreatedDate) day, COUNT(Id) cnt FROM Lead WHERE CreatedDate = LAST_N_DAYS:${days} GROUP BY DAY_ONLY(CreatedDate) ORDER BY DAY_ONLY(CreatedDate) ASC`
        );
        res.json(result.records.map(r => ({ date: r.day, count: r.cnt })));
    } catch (error) {
        console.error('Analytics timeline failed:', error);
        res.status(500).json({ message: 'Analytics failed', error: error.message });
    }
});

app.get('/api/salesforce/leads/recent', async (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const conn = getConnectionForReq(req);
        if (!conn) return res.status(401).json({ message: 'Not connected to Salesforce' });

        const limit = parseInt(req.query.limit) || 50;

        // Non-queryable field types that SOQL cannot select
        const NON_QUERYABLE_TYPES = new Set(['address', 'location', 'base64']);
        // Fields that cause query issues even if "queryable"
        const FIELD_BLACKLIST = new Set(['attributes', 'CleanStatus']);

        // Describe Lead to get all available fields dynamically
        const meta = await conn.sobject('Lead').describe();
        const allFields = meta.fields
            .filter(f => f.name !== 'attributes'
                && !NON_QUERYABLE_TYPES.has(f.type)
                && !FIELD_BLACKLIST.has(f.name)
            )
            .map(f => f.name);

        // Always ensure Name + identification fields are present
        const priorityFields = ['Id', 'FirstName', 'LastName', 'Company', 'Email', 'Status', 'LeadSource', 'CreatedDate', 'LS_LeadId__c'];
        const orderedFields = [
            ...priorityFields.filter(f => allFields.includes(f)),
            ...allFields.filter(f => !priorityFields.includes(f))
        ];

        const soql = `SELECT ${orderedFields.join(', ')} FROM Lead ORDER BY CreatedDate DESC LIMIT ${limit}`;
        const result = await conn.query(soql);

        // Return records + field metadata so the client knows what columns to render
        const fieldMeta = orderedFields.map(name => {
            const f = meta.fields.find(x => x.name === name);
            return { name, label: f?.label || name, type: f?.type || 'string' };
        });

        res.json({ records: result.records, fields: orderedFields, fieldMeta });
    } catch (error) {
        console.error('Recent leads failed:', error);
        res.status(500).json({ message: 'Failed to fetch recent leads', error: error.message });
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

// Re-hydrate persisted Salesforce sessions so a restart doesn't force re-OAuth
restoreConnections().catch(error => {
    console.error('Failed to restore Salesforce connections:', error);
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