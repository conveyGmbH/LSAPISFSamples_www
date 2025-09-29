const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const jsforce = require('jsforce');
const path = require('path');
require('dotenv').config();

// Import new service modules
const salesforceService = require('./salesforce');
const { authMiddleware, setupOrgMiddleware } = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 3000;


// ENVIRONMENT DETECTION AND CONFIGURATION
function determineEnvironmentAndConfig() {
    const isProd = process.env.NODE_ENV === 'production';
    const hostname = process.env.HOSTNAME || '';

    // Auto-detect production environment based on hostname patterns
    const isProductionHost = hostname.includes('convey.de') ||
                           hostname.includes('azurewebsites.net') ||
                           hostname.includes('azurestaticapps.net');

    const isProduction = isProd || isProductionHost;

    // Determine redirect URI based on environment
    let redirectUri;
    if (isProduction) {
        redirectUri = process.env.SF_REDIRECT_URI_PRODUCTION || 'https://lsapisfsamples.convey.de/oauth-callback.html';
    } else {
        redirectUri = process.env.SF_REDIRECT_URI_DEV || `http://localhost:${port}/oauth/callback`;
    }

    console.log(`🌍 Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`🔗 OAuth Redirect URI: ${redirectUri}`);

    return {
        isProduction,
        redirectUri
    };
}

const envConfig = determineEnvironmentAndConfig();

// CONFIGURATION
const config = {
    environment: {
        isProduction: envConfig.isProduction
    },
    salesforce: {
        clientId: process.env.SF_CLIENT_ID,
        clientSecret: process.env.SF_CLIENT_SECRET,
        redirectUri: envConfig.redirectUri,
        loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com'
    },
    session: {
        secret: process.env.SESSION_SECRET || 'your_super_secret_session_key_change_this_in_production_123450000',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: envConfig.isProduction, // Secure cookies in production
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    }
};

// Validate required environment variables
if (!config.salesforce.clientId || !config.salesforce.clientSecret) {
    console.error('❌ Missing required Salesforce credentials. Please check your .env file.');
    process.exit(1);
}

app.use(cors({
  origin: function (origin, callback) {
    
    // Allow requests from specific origins
    const allowedOrigins = [
    // Development origins
    'http://127.0.0.1:5504',
    'http://localhost:5504', 
    'http://localhost:3000', 
    'https://leadsuccess.convey.de/apisflsm/',
    'https://leadsuccess.convey.de',    
  
    // Production origins
    'https://delightful-desert-016e2a610.4.azurestaticapps.net',
    'https://brave-bush-0041ef403.6.azurestaticapps.net',
    'https://lsapisfsamples.convey.de',
    'https://lsapisfbackend.convey.de'
  ]; 

  if(!origin) return callback(null, true);

  if(allowedOrigins.includes(origin)){
    callback(null, true);
  }else{
    if(process.env.NODE_ENV === 'development'){
      callback(null, true)}
      else{
      callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control', 'X-Session-Token', 'X-Org-Id']
}));
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(session(config.session));

// Static files
app.use(express.static(path.join(__dirname, '../')));

// ============================================================================
// SALESFORCE CONNECTION MANAGER
// ============================================================================

const connections = new Map(); // orgId -> connection data

function createConnection(sessionData) {
    const conn = new jsforce.Connection({
        oauth2: {
            clientId: config.salesforce.clientId,
            clientSecret: config.salesforce.clientSecret,
            redirectUri: config.salesforce.redirectUri,
            loginUrl: config.salesforce.loginUrl
        },
        accessToken: sessionData.accessToken,
        refreshToken: sessionData.refreshToken,
        instanceUrl: sessionData.instanceUrl
    });

    // Auto-refresh token
    conn.on('refresh', (accessToken, res) => {
        console.log('🔄 Token refreshed for org:', sessionData.organizationId);
        sessionData.accessToken = accessToken;
        connections.set(sessionData.organizationId, {
            ...sessionData,
            connection: conn,
            lastRefresh: new Date()
        });
    });

    return conn;
}

function storeConnection(sessionData) {
    const conn = createConnection(sessionData);
    connections.set(sessionData.organizationId, {
        ...sessionData,
        connection: conn,
        connectedAt: new Date(),
        lastRefresh: new Date()
    });
    console.log(`Stored connection for org: ${sessionData.organizationId}`);
    return conn;
}

function getConnection(orgId) {
    const connData = connections.get(orgId);
    return connData ? connData.connection : null;
}

function getUserInfo(orgId) {
    const connData = connections.get(orgId);
    return connData ? connData.userInfo : null;
}

function removeConnection(orgId) {
    connections.delete(orgId);
    console.log(`🗑️ Removed connection for org: ${orgId}`);
}

// UTILITY FUNCTIONS

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
    return req.headers['x-org-id'] || req.session.currentOrgId || 'default';
}

function validateAndFixLeadData(leadData) {
    const errors = [];
    const warnings = [];
    const fixedData = { ...leadData };

    // Validate and fix required fields
    if (!fixedData.LastName || !fixedData.LastName.trim()) {
        errors.push('LastName is required and cannot be empty');
    }

    if (!fixedData.Company || !fixedData.Company.trim()) {
        errors.push('Company is required and cannot be empty');
    }

    // Validate and fix email format
    if (fixedData.Email) {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(fixedData.Email)) {
            warnings.push(`Invalid email format: ${fixedData.Email}`);
            // Don't include invalid email
            delete fixedData.Email;
        }
    }

    // Validate and fix phone numbers (remove non-numeric characters except +)
    ['Phone', 'MobilePhone', 'Fax'].forEach(phoneField => {
        if (fixedData[phoneField]) {
            const originalPhone = fixedData[phoneField];
            // Keep only digits, +, spaces, and common separators
            const cleanPhone = originalPhone.replace(/[^\d\+\-\(\)\s]/g, '');
            if (cleanPhone !== originalPhone) {
                warnings.push(`Cleaned phone number ${phoneField}: ${originalPhone} → ${cleanPhone}`);
                fixedData[phoneField] = cleanPhone;
            }
        }
    });

    // Validate and fix website URL
    if (fixedData.Website) {
        let website = fixedData.Website.trim();
        if (website && !website.match(/^https?:\/\//)) {
            website = 'https://' + website;
            warnings.push(`Added https:// to website: ${fixedData.Website} → ${website}`);
            fixedData.Website = website;
        }
    }

    // Validate Salesforce-specific field constraints
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

    // Filter out invalid fields for Lead object but keep valid empty fields
    const invalidLeadFields = ['Suffix', 'MiddleName', 'SalesArea', 'Department'];
    invalidLeadFields.forEach(fieldName => {
        if (fixedData.hasOwnProperty(fieldName)) {
            warnings.push(`Removed invalid Lead field: ${fieldName}`);
            delete fixedData[fieldName];
        }
    });

    console.log('Filtered lead data:', fixedData);

    return {
        data: fixedData,
        errors,
        warnings
    };
}

// AUTHENTICATION ROUTES

// Start OAuth flow
app.get('/auth/salesforce', (req, res) => {
    try {
        const orgId = req.query.orgId || 'default';
        const state = `${generateState()}:${orgId}`;
        req.session.oauthState = state;

        const oauth2 = new jsforce.OAuth2({
            clientId: config.salesforce.clientId,
            clientSecret: config.salesforce.clientSecret,
            redirectUri: config.salesforce.redirectUri,
            loginUrl: config.salesforce.loginUrl
        });

        const authUrl = oauth2.getAuthorizationUrl({
            scope: 'api refresh_token',
            state: state
        });

        console.log('🔗 Redirecting to Salesforce OAuth:', authUrl);
        res.redirect(authUrl);

    } catch (error) {
        console.error('❌ OAuth initiation failed:', error);
        res.status(500).send(`
            <html><body>
                <h2>Authentication Error</h2>
                <p>Failed to start authentication: ${error.message}</p>
                <script>window.close();</script>
            </body></html>
        `);
    }
});

// OAuth callback
app.get('/oauth/callback', async (req, res) => {
    try {
        const { code, state, error } = req.query;

        if (error) {
            throw new Error(`OAuth error: ${error}`);
        }

        if (!code) {
            throw new Error('No authorization code received');
        }

        if (state !== req.session.oauthState) {
            throw new Error('Invalid state parameter');
        }

        // Extract orgId from state (format: "randomState:orgId")
        const orgId = state.includes(':') ? state.split(':')[1] : 'default';

        const oauth2 = new jsforce.OAuth2({
            clientId: config.salesforce.clientId,
            clientSecret: config.salesforce.clientSecret,
            redirectUri: config.salesforce.redirectUri,
            loginUrl: config.salesforce.loginUrl
        });

        // Exchange code for tokens
        const conn = new jsforce.Connection({ oauth2 });
        const userInfo = await conn.authorize(code);

        console.log(' OAuth successful for user:', userInfo.id);

        // Get detailed user info from Salesforce API
        let fullUserInfo = userInfo;
        try {
            // Query current user details
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
            console.log('⚠️ Could not fetch detailed user info, using basic info:', apiError.message);
        }

        // Store session data
        const sessionData = {
            accessToken: conn.accessToken,
            refreshToken: conn.refreshToken,
            instanceUrl: conn.instanceUrl,
            organizationId: userInfo.organizationId,
            userId: userInfo.id,
            userInfo: fullUserInfo
        };

        // Store in session and connection manager
        req.session.salesforce = sessionData;
        req.session.currentOrgId = userInfo.organizationId;
        req.session.authenticated = true;
        storeConnection(sessionData);

        // Also store in the new multi-org service for better persistence
        try {
            await salesforceService.connectToOrg(
                userInfo.organizationId,
                config.salesforce.clientId,
                config.salesforce.clientSecret,
                config.salesforce.redirectUri,
                conn.refreshToken,
                conn.instanceUrl,
                conn.accessToken
            );
            console.log(`✅ Multi-org connection stored for org: ${userInfo.organizationId}`);
        } catch (multiOrgError) {
            console.warn('⚠️ Failed to store multi-org connection:', multiOrgError.message);
        }

        res.send(`
            <html>
                <head><title>Authentication Successful</title></head>
                <body style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
                    <h2 style="color: #0176D3;"> Authentication Successful!</h2>
                    <p>Welcome, ${fullUserInfo.display_name || fullUserInfo.username || 'User'}</p>
                    <p>Organization: ${fullUserInfo.organization_name || 'Your Organization'}</p>
                    <p>This window will close automatically...</p>
                    <script>
                        // Send organization ID to parent window
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
        console.error('❌ OAuth callback failed:', error);
        res.status(500).send(`
            <html>
                <head><title>Authentication Failed</title></head>
                <body style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
                    <h2 style="color: #EA001E;">❌ Authentication Failed</h2>
                    <p>Error: ${error.message}</p>
                    <button onclick="window.close()">Close Window</button>
                </body>
            </html>
        `);
    }
});

// API ROUTES

// NEW MULTI-ORG AUTHENTICATION API ROUTES
// =======================================================================

// Setup new organization connection
app.post('/api/orgs/setup', setupOrgMiddleware, (req, res) => {
    res.json({
        success: true,
        message: `Organization ${req.orgId} connected successfully`,
        orgId: req.orgId
    });
});

// Get connection info for specific org
app.get('/api/orgs/:orgId/info', authMiddleware, async (req, res) => {
    try {
        const orgId = req.params.orgId;
        const userInfo = await req.sfConnection.identity();

        res.json({
            success: true,
            orgId: orgId,
            userInfo: {
                id: userInfo.id,
                username: userInfo.username,
                display_name: userInfo.display_name,
                organization_id: userInfo.organization_id,
                organization_name: userInfo.organization_name
            }
        });
    } catch (error) {
        console.error('Error getting org info:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get org info',
            message: error.message
        });
    }
});

// Create lead using multi-org authentication
app.post('/api/orgs/:orgId/leads', authMiddleware, async (req, res) => {
    try {
        const orgId = req.params.orgId;
        const leadData = req.body;

        console.log(`Creating lead for org ${orgId}:`, leadData);

        const result = await salesforceService.createLead(orgId, leadData);

        res.json({
            success: true,
            orgId: orgId,
            leadId: result.id,
            message: 'Lead created successfully'
        });
    } catch (error) {
        console.error('Error creating lead:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create lead',
            message: error.message
        });
    }
});

// Get leads using multi-org authentication
app.get('/api/orgs/:orgId/leads', authMiddleware, async (req, res) => {
    try {
        const orgId = req.params.orgId;
        const limit = req.query.limit || 100;

        const leads = await salesforceService.getLeads(orgId, limit);

        res.json({
            success: true,
            orgId: orgId,
            leads: leads,
            count: leads.length
        });
    } catch (error) {
        console.error('Error fetching leads:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch leads',
            message: error.message
        });
    }
});

// Update lead using multi-org authentication
app.patch('/api/orgs/:orgId/leads/:leadId', authMiddleware, async (req, res) => {
    try {
        const { orgId, leadId } = req.params;
        const leadData = req.body;

        const result = await salesforceService.updateLead(orgId, leadId, leadData);

        res.json({
            success: true,
            orgId: orgId,
            leadId: leadId,
            result: result,
            message: 'Lead updated successfully'
        });
    } catch (error) {
        console.error('Error updating lead:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update lead',
            message: error.message
        });
    }
});

// Delete lead using multi-org authentication
app.delete('/api/orgs/:orgId/leads/:leadId', authMiddleware, async (req, res) => {
    try {
        const { orgId, leadId } = req.params;

        const result = await salesforceService.deleteLead(orgId, leadId);

        res.json({
            success: true,
            orgId: orgId,
            leadId: leadId,
            result: result,
            message: 'Lead deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting lead:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete lead',
            message: error.message
        });
    }
});

// Check duplicate leads using multi-org authentication
app.post('/api/orgs/:orgId/leads/check-duplicate', authMiddleware, async (req, res) => {
    try {
        const orgId = req.params.orgId;
        const { FirstName, LastName, Company, Email } = req.body;

        if (!LastName || !Company) {
            return res.status(400).json({
                success: false,
                message: 'LastName and Company are required'
            });
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

        const duplicateResult = await req.sfConnection.query(duplicateQuery);

        if (duplicateResult.records.length > 0) {
            res.json({
                success: true,
                orgId: orgId,
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
                success: true,
                orgId: orgId,
                hasDuplicates: false,
                duplicates: []
            });
        }

    } catch (error) {
        console.error('Duplicate check error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check for duplicates',
            message: error.message
        });
    }
});

// =======================================================================
// LEGACY API ROUTES (for backward compatibility)
// =======================================================================

// Get Salesforce auth URL
app.get('/api/salesforce/auth', (req, res) => {
    try {
        const state = generateState();
        req.session.oauthState = state;

        const oauth2 = new jsforce.OAuth2({
            clientId: config.salesforce.clientId,
            clientSecret: config.salesforce.clientSecret,
            redirectUri: config.salesforce.redirectUri,
            loginUrl: config.salesforce.loginUrl
        });

        const authUrl = oauth2.getAuthorizationUrl({
            scope: 'api refresh_token',
            state: state
        });

        res.json({ authUrl });

    } catch (error) {
        console.error('❌ Failed to generate auth URL:', error);
        res.status(500).json({ message: 'Failed to generate auth URL' });
    }
});

// Check Salesforce connection status
app.get('/api/salesforce/check', (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        const userInfo = getUserInfo(orgId);
        const conn = getConnection(orgId);

        if (!userInfo || !conn || !req.session.authenticated) {
            return res.status(401).json({
                connected: false,
                message: 'Not connected to Salesforce'
            });
        }

        res.json({
            connected: true,
            userInfo: {
                username: userInfo.username,
                display_name: userInfo.display_name,
                organization_name: userInfo.organization_name,
                organization_id: userInfo.organizationId,
                user_id: userInfo.id
            },
            // Add tokens for direct API calls
            tokens: {
                access_token: req.session.salesforce?.accessToken,
                instance_url: req.session.salesforce?.instanceUrl
            }
        });

    } catch (error) {
        console.error('❌ Connection check failed:', error);
        res.status(500).json({
            connected: false,
            message: 'Connection check failed'
        });
    }
});

// Get user info
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
        console.error('❌ User info failed:', error);
        res.status(500).json({ message: 'Failed to get user info' });
    }
});

// Check authentication status - Using new authMiddleware
app.get('/api/user', authMiddleware, async (req, res) => {
    try {
        // authMiddleware provides req.sfConnection and req.orgId
        const info = await req.sfConnection.identity();

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
        console.error('❌ User info failed:', error);
        res.status(500).json({
            error: 'Authentication error',
            message: error.message
        });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    try {
        const orgId = getCurrentOrgId(req);
        removeConnection(orgId);

        req.session.destroy(err => {
            if (err) {
                console.error('❌ Session destroy failed:', err);
                return res.status(500).json({ message: 'Logout failed' });
            }
            res.json({ message: 'Logged out successfully' });
        });

    } catch (error) {
        console.error('❌ Logout failed:', error);
        res.status(500).json({ message: 'Logout failed' });
    }
});

// Get all leads
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
        console.error('❌ Failed to fetch leads:', error);
        res.status(500).json({ message: 'Failed to fetch leads', error: error.message });
    }
});

// Create new lead
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
            WHERE LastName = '${cleanLeadData.LastName.replace(/'/g, "\\'")}'
            AND Company = '${cleanLeadData.Company.replace(/'/g, "\\'")}'
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
        console.error('❌ Failed to create lead:', error);
        res.status(500).json({
            message: 'Failed to create lead',
            error: error.message
        });
    }
});

// Check for duplicate leads
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
        console.error('❌ Duplicate check failed:', error);
        res.status(500).json({
            message: 'Failed to check for duplicates',
            error: error.message
        });
    }
});

// Transfer lead with attachments
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
            if (value !== null && value !== undefined) {
                processedLeadData[field] = value;
            }
        });

        
        const validationResults = validateAndFixLeadData(processedLeadData);
        const validatedLeadData = validationResults.data;

        // Check for blocking validation errors
        if (validationResults.errors.length > 0) {
            return res.status(400).json({
                message: 'Lead data validation failed',
                errors: validationResults.errors,
                warnings: validationResults.warnings
            });
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
                console.log(`⚠️ Invalid state moved to Street field: ${validatedLeadData.Street}`);
            } else {
                validatedLeadData.State = validStates[0].toUpperCase();
            }
        }

        // Create the lead
        const leadResult = await conn.sobject('Lead').create(validatedLeadData);

        if (!leadResult.success) {
            throw new Error('Failed to create lead: ' + JSON.stringify(leadResult.errors));
        }

        const leadId = leadResult.id;
        console.log(` Lead created with ID: ${leadId}`);

        // Handle attachments
        let attachmentResults = [];
        if (attachments && attachments.length > 0) {
            console.log(`📎 Processing ${attachments.length} attachment(s)`);

            for (const attachment of attachments) {
                try {
                    const contentVersion = {
                        Title: attachment.filename,
                        PathOnClient: attachment.filename,
                        VersionData: attachment.content,
                        FirstPublishLocationId: leadId
                    };

                    const attachResult = await conn.sobject('ContentVersion').create(contentVersion);

                    if (attachResult.success) {
                        attachmentResults.push({
                            filename: attachment.filename,
                            salesforceId: attachResult.id,
                            success: true
                        });
                        console.log(` Attachment uploaded: ${attachment.filename}`);
                    } else {
                        attachmentResults.push({
                            filename: attachment.filename,
                            success: false,
                            error: JSON.stringify(attachResult.errors)
                        });
                    }
                } catch (attachError) {
                    console.error(`❌ Attachment upload failed for ${attachment.filename}:`, attachError);
                    attachmentResults.push({
                        filename: attachment.filename,
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
        console.error('❌ Lead transfer failed:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to transfer lead to Salesforce',
            error: error.message
        });
    }
});


// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        connections: connections.size
    });
});





// STATIC ROUTES


// Serve main pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

app.get('/displayLeadTransfer', (req, res) => {
    res.sendFile(path.join(__dirname, '../pages/displayLeadTransfer.html'));
});

app.get('/displayDashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../pages/displayDashboard.html'));
});

// DASHBOARD API ENDPOINTS

// Get dashboard summary statistics
app.get('/api/dashboard/summary', async (req, res) => {
    try {
        if (!req.session.connectionData) {
            return res.status(401).json({
                success: false,
                error: 'Not authenticated with Salesforce'
            });
        }

        const conn = new jsforce.Connection({
            instanceUrl: req.session.connectionData.instance_url,
            accessToken: req.session.connectionData.access_token
        });

        // Query lead statistics
        const leadStats = await conn.query(`
            SELECT Status, COUNT(Id) recordCount
            FROM Lead
            WHERE CreatedDate = LAST_N_DAYS:30
            GROUP BY Status
        `);

        // Get total leads count
        const totalLeadsResult = await conn.query(`
            SELECT COUNT(Id) totalLeads
            FROM Lead
            WHERE CreatedDate = LAST_N_DAYS:30
        `);

        const totalLeads = totalLeadsResult.records[0]?.totalLeads || 0;

        // Process status counts
        const statusCounts = {};
        let qualifiedCount = 0;
        let workingCount = 0;
        let newCount = 0;

        leadStats.records.forEach(record => {
            const status = record.Status;
            const count = record.recordCount;
            statusCounts[status] = count;

            // Categorize into dashboard metrics
            if (status === 'Qualified') {
                qualifiedCount += count;
            } else if (['Working - Contacted', 'Working'].includes(status)) {
                workingCount += count;
            } else if (['New', 'Open - Not Contacted'].includes(status)) {
                newCount += count;
            }
        });

        console.log('📊 Dashboard summary:', {
            totalLeads,
            qualified: qualifiedCount,
            working: workingCount,
            new: newCount,
            statusBreakdown: statusCounts
        });

        res.json({
            success: true,
            data: {
                totalLeads: totalLeads,
                qualified: qualifiedCount,
                working: workingCount,
                new: newCount,
                statusBreakdown: statusCounts
            }
        });

    } catch (error) {
        console.error('❌ Dashboard summary error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch dashboard summary',
            details: error.message
        });
    }
});

// Get recent leads for dashboard table
app.get('/api/dashboard/leads', async (req, res) => {
    try {
        if (!req.session.connectionData) {
            return res.status(401).json({
                success: false,
                error: 'Not authenticated with Salesforce'
            });
        }

        const limit = req.query.limit || 20;
        const offset = req.query.offset || 0;

        const conn = new jsforce.Connection({
            instanceUrl: req.session.connectionData.instance_url,
            accessToken: req.session.connectionData.access_token
        });

        // Query recent leads with essential fields
        const leadsResult = await conn.query(`
            SELECT Id, Name, FirstName, LastName, Company, Email, Phone,
                   MobilePhone, State, Status, CreatedDate, LastModifiedDate
            FROM Lead
            WHERE CreatedDate = LAST_N_DAYS:30
            ORDER BY CreatedDate DESC
            LIMIT ${limit} OFFSET ${offset}
        `);

        // Format leads data for dashboard
        const formattedLeads = leadsResult.records.map(lead => ({
            id: lead.Id,
            name: lead.Name || `${lead.FirstName || ''} ${lead.LastName || ''}`.trim(),
            company: lead.Company,
            email: lead.Email,
            phone: lead.Phone || lead.MobilePhone,
            state: lead.State,
            status: lead.Status,
            createdDate: lead.CreatedDate,
            lastModifiedDate: lead.LastModifiedDate
        }));

        console.log(`📊 Retrieved ${formattedLeads.length} leads for dashboard`);

        res.json({
            success: true,
            data: {
                leads: formattedLeads,
                totalRecords: leadsResult.totalSize || formattedLeads.length,
                hasMore: leadsResult.done === false
            }
        });

    } catch (error) {
        console.error('❌ Dashboard leads error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch dashboard leads',
            details: error.message
        });
    }
});


// LEAD FIELD UPDATES API


const fs = require('fs').promises;
const leadUpdatesFile = path.join(__dirname, 'lead-field-updates.json');

// Helper function to load lead field updates
async function loadLeadUpdates() {
    try {
        const data = await fs.readFile(leadUpdatesFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // File doesn't exist or is invalid, return empty object
        return {};
    }
}

// Helper function to save lead field updates
async function saveLeadUpdates(updates) {
    try {
        await fs.writeFile(leadUpdatesFile, JSON.stringify(updates, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving lead updates:', error);
        return false;
    }
}

// GET lead field updates for a specific EventId
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
        console.error('❌ Error loading lead field updates:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading field updates',
            error: error.message
        });
    }
});

// POST save lead field updates for a specific EventId
app.post('/api/lead-field-updates', async (req, res) => {
    try {
        const { eventId, fieldUpdates } = req.body;

        if (!eventId) {
            return res.status(400).json({
                success: false,
                message: 'EventId is required'
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
        console.error('❌ Error saving lead field updates:', error);
        res.status(500).json({
            success: false,
            message: 'Error saving field updates',
            error: error.message
        });
    }
});

// DELETE lead field updates for a specific EventId
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
        console.error('❌ Error deleting lead field updates:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting field updates',
            error: error.message
        });
    }
});

// ERROR HANDLING
app.use((req, res, next) => {
    res.status(404).json({
        message: 'Route not found',
        path: req.path,
        method: req.method
    });
});

app.use((error, req, res, next) => {
    res.status(500).json({
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});


// SERVER STARTUP

app.listen(port, () => {
    console.log('\n🚀 Salesforce Lead Manager Backend');
    console.log('=====================================');
    console.log(`🌐 Server running on: http://localhost:${port}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔑 Client ID: ${config.salesforce.clientId ? ' Configured' : '❌ Missing'}`);
    console.log(`🔐 Client Secret: ${config.salesforce.clientSecret ? ' Configured' : '❌ Missing'}`);
    console.log(`🔄 Redirect URI: ${config.salesforce.redirectUri}`);
    console.log(`🏢 Salesforce URL: ${config.salesforce.loginUrl}`);
    console.log('=====================================');
    console.log(' Available Routes:');
    console.log('  🔐 GET  /auth/salesforce     - Start OAuth flow');
    console.log('  🔐 GET  /oauth/callback      - OAuth callback');
    console.log('');
    console.log(' NEW MULTI-ORG API ROUTES:');
    console.log('  🏢 POST /api/orgs/setup     - Setup organization connection');
    console.log('  📋 GET  /api/orgs/:orgId/info - Get organization info');
    console.log('  📊 GET  /api/orgs/:orgId/leads - Get leads for org');
    console.log('  ➕ POST /api/orgs/:orgId/leads - Create lead in org');
    console.log('  📝 PATCH /api/orgs/:orgId/leads/:id - Update lead in org');
    console.log('  🗑️ DELETE /api/orgs/:orgId/leads/:id - Delete lead in org');
    console.log('  🔍 POST /api/orgs/:orgId/leads/check-duplicate - Check duplicates in org');
    console.log('');
    console.log(' LEGACY API ROUTES:');
    console.log('  🔗 GET  /api/salesforce/auth - Get auth URL');
    console.log('  🔍 GET  /api/salesforce/check - Check connection status');
    console.log('   GET  /api/salesforce/userinfo - Get user info');
    console.log('  👤 GET  /api/user           - Get user info');
    console.log('  🚪 POST /api/logout         - Logout');
    console.log('  📊 GET  /api/leads          - Get all leads');
    console.log('  ➕ POST /api/leads          - Create new lead');
    console.log('  📤 POST /api/salesforce/leads - Transfer lead with attachments');
    console.log('  ❤️  GET  /api/health        - Health check');
    console.log('  🏠 GET  /                   - Home page');
    console.log('  📄 GET  /displayLeadTransfer - Lead transfer page');
    console.log('  📊 GET  /displayDashboard   - Dashboard page');
    console.log('  📊 GET  /api/dashboard/summary - Dashboard statistics');
    console.log('  📊 GET  /api/dashboard/leads - Recent leads data');
    console.log('=====================================\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down server...');
    process.exit(0);
});