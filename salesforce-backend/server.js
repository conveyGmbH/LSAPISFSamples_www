/**
 * LeadSuccess API Server
 * Handles Salesforce OAuth authentication and data transfer
 */

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jsforce = require('jsforce');
const compression = require('compression');
const dotenv = require('dotenv');
const fetch = require('node-fetch');

// Load environment variables
dotenv.config();

// Initialize Express application
const app = express();
const PORT = process.env.PORT || 3000;


// Standard middleware
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(cookieParser());
app.use(compression());

// CORS configuration
app.use(cors({
  origin: [
    // Development origins
    'http://127.0.0.1:5504',
    'http://localhost:5504',
    'http://localhost:3000',
    // Production origins
    'https://delightful-desert-016e2a610.4.azurestaticapps.net',
    'https://brave-bush-0041ef403.6.azurestaticapps.net'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control', 'X-Session-Token']
}));

/* SALESFORCE CONFIGURATION */

// OAuth2 configuration
const SF_CLIENT_ID = process.env.SF_CLIENT_ID;
const SF_CLIENT_SECRET = process.env.SF_CLIENT_SECRET;
const SF_REDIRECT_URI = 'https://lsapisamplesbackend-bhesadgtbja4dmgq.germanywestcentral-01.azurewebsites.net/api/oauth2/callback';
const SF_LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

// In-memory token storage 
const tokenStore = new Map();


/* API ROUTER SETUP */
const apiRouter = express.Router();


/* WELCOME PAGE SERVER */
app.get('/', (req, res) => {
  const serverInfo = {
    status: 'online',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())} seconds`,
    endpoints: [
      { path: '/api/salesforce/auth', method: 'GET', description: 'Get Salesforce authentication URL' },
      { path: '/api/oauth2/callback', method: 'GET', description: 'OAuth2 callback for Salesforce' },
      { path: '/api/salesforce/test-token', method: 'GET', description: 'Test Salesforce token validity' },
      { path: '/api/salesforce/token-details', method: 'GET', description: 'Get Salesforce token details' },
      { path: '/api/debug/token-info', method: 'GET', description: 'Debug token information (dev only)' },
      { path: '/api/direct-lead-transfer', method: 'POST', description: 'Transfer lead to Salesforce' },
      { path: '/api/attachment', method: 'POST', description: 'Transfer attachment to Salesforce' },
      { path: '/api/salesforce/upload-file', method: 'POST', description: 'Upload file using ContentVersion' }
    ]
  };

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>LeadSuccess API Status</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        h1 {
          color: #0078d4;
          border-bottom: 1px solid #eaeaea;
          padding-bottom: 10px;
        }
        .status-card {
          background-color: #f9f9f9;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .status-indicator {
          display: inline-block;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          margin-right: 8px;
        }
        .status-online {
          background-color: #5cb85c;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th, td {
          text-align: left;
          padding: 12px;
          border-bottom: 1px solid #ddd;
        }
        th {
          background-color: #f2f2f2;
        }
        .api-path {
          font-family: monospace;
          background-color: #f5f5f5;
          padding: 2px 4px;
          border-radius: 4px;
        }
        .http-method {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
          color: white;
          background-color: #0078d4;
        }
      </style>
    </head>
    <body>
      <h1>LeadSuccess API Status</h1>
      
      <div class="status-card">
        <h2>
          <span class="status-indicator status-online"></span>
          Server Status: ${serverInfo.status}
        </h2>
        <p><strong>Version:</strong> ${serverInfo.version}</p>
        <p><strong>Environment:</strong> ${serverInfo.environment}</p>
        <p><strong>Server Time:</strong> ${new Date(serverInfo.timestamp).toLocaleString()}</p>
        <p><strong>Uptime:</strong> ${serverInfo.uptime}</p>
      </div>
      
      <h2>Available Endpoints</h2>
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th>Path</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          ${serverInfo.endpoints.map(endpoint => `
            <tr>
              <td><span class="http-method">${endpoint.method}</span></td>
              <td><span class="api-path">${endpoint.path}</span></td>
              <td>${endpoint.description}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `);
});


/* AUTHENTICATION ROUTES */

// Get authentication URL
apiRouter.get('/salesforce/auth', (req, res) => {
  try {
    const authUrl = `${SF_LOGIN_URL}/services/oauth2/authorize?response_type=code&client_id=${SF_CLIENT_ID}&redirect_uri=${encodeURIComponent(SF_REDIRECT_URI)}&scope=api%20id%20web%20refresh_token`;
    res.json({ authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

// OAuth2 callback
apiRouter.get('/oauth2/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    console.error('Authorization code missing');
    return res.status(400).send('Authorization code missing');
  }
  
  try {
    console.log('Received auth code, exchanging for token...');
    
    // Exchange code for token directly with Salesforce API
    const tokenResponse = await fetch(`${SF_LOGIN_URL}/services/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `grant_type=authorization_code&client_id=${SF_CLIENT_ID}&client_secret=${SF_CLIENT_SECRET}&redirect_uri=${encodeURIComponent(SF_REDIRECT_URI)}&code=${code}`
    });
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenResponse.ok || tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error || 'Token exchange failed');
    }
    
    console.log('Token obtained successfully');
    
    const { access_token, refresh_token, instance_url } = tokenData;
    
    // Create a JSForce connection to get user info
    const conn = new jsforce.Connection({
      instanceUrl: instance_url,
      accessToken: access_token
    });
    
    // Get user information
    const userInfo = await conn.identity();
    console.log('User identified:', userInfo.username);
    
    // Generate a session token
    const sessionToken = Date.now().toString(36) + Math.random().toString(36).substring(2);
    
    // Store session information
    tokenStore.set(sessionToken, {
      accessToken: access_token,
      refreshToken: refresh_token,
      instanceUrl: instance_url,
      userInfo,
      timestamp: Date.now()
    });
    
    // Return success page
    res.send(`
      <html>
        <head>
          <title>Authentication Successful</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 40px 20px;
              background-color: #f4f7f9;
            }
            .success-container {
              max-width: 500px;
              margin: 0 auto;
              background-color: white;
              border-radius: 8px;
              padding: 30px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h2 {
              color: #2e844a;
              margin-bottom: 20px;
            }
            p {
              color: #54698d;
              margin-bottom: 15px;
              line-height: 1.5;
            }
            .token-info {
              text-align: left;
              background-color: #f5f5f5;
              padding: 15px;
              border-radius: 5px;
              margin-top: 20px;
              font-family: monospace;
              font-size: 12px;
              overflow-wrap: break-word;
            }
          </style>
        </head>
        <body>
          <div class="success-container">
            <h2>Authentication Successful!</h2>
            <p>You are now connected to Salesforce as ${userInfo.username}.</p>
            <p>This window will close automatically.</p>
            
            <!-- DEVELOPMENT ONLY: Remove this section in production -->
            <div class="token-info">
              <p><strong>Session Token:</strong> ${sessionToken}</p>
              <p><strong>Access Token:</strong> ${access_token.substring(0, 10)}...</p>
              <p><strong>Instance URL:</strong> ${instance_url}</p>
            </div>
          </div>
          <script>
            // Pass token to parent window
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'salesforce-auth-success', 
                userInfo: ${JSON.stringify({
                  ...userInfo,
                  // Only include partial token for debugging
                  accessToken: access_token.substring(0, 10) + '...',
                  instanceUrl: instance_url
                })},
                sessionToken: "${sessionToken}"
              }, '*');
              
              // Close window after a short delay
              setTimeout(function() {
                window.close();
              }, 5000); // 5 seconds delay to see the token info
            } else {
              document.body.innerHTML += '<p>Window opener not available. Please close this window manually.</p>';
            }
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send(`
      <html>
        <head>
          <title>Authentication Failed</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 40px 20px;
              background-color: #f4f7f9;
            }
            .error-container {
              max-width: 500px;
              margin: 0 auto;
              background-color: white;
              border-radius: 8px;
              padding: 30px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h2 {
              color: #c23934;
              margin-bottom: 20px;
            }
            p {
              color: #54698d;
              margin-bottom: 15px;
              line-height: 1.5;
            }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h2>Authentication Failed</h2>
            <p>An error occurred while connecting to Salesforce.</p>
            <p>Error: ${error.message}</p>
            <p>Please close this window and try again.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'salesforce-auth-error', 
                error: ${JSON.stringify(error.message)}
              }, '*');
              
              setTimeout(function() {
                window.close();
              }, 5000);
            }
          </script>
        </body>
      </html>
    `);
  }
});


/* TOKEN VERIFICATION & DEBUGGING ROUTES */

// Session check endpoint - verify if token is still valid
apiRouter.get('/salesforce/session-check', (req, res) => {
  const sessionToken = req.headers['x-session-token'];
  
  if (!sessionToken || !tokenStore.has(sessionToken)) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session'
    });
  }
  
  // Get session data to check if it's expired
  const session = tokenStore.get(sessionToken);
  const now = Date.now();
  
  // Check if session is older than 1 hour
  if (now - session.timestamp > 3600000) {
    // Remove expired session
    tokenStore.delete(sessionToken);
    return res.status(401).json({
      success: false,
      message: 'Session expired'
    });
  }
  
  // Session is valid
  return res.json({
    success: true,
    message: 'Session valid'
  });
});

// Test token endpoint
apiRouter.get('/salesforce/test-token', async (req, res) => {
  const sessionToken = req.headers['x-session-token'];
  
  if (!sessionToken || !tokenStore.has(sessionToken)) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
  
  try {
    const session = tokenStore.get(sessionToken);
    
    // Create a Salesforce connection
    const conn = new jsforce.Connection({
      instanceUrl: session.instanceUrl,
      accessToken: session.accessToken
    });
    
    // Test connection by getting user info
    const userInfo = await conn.identity();
    
    // Return session and user info
    return res.json({
      success: true,
      message: 'Token valid',
      userInfo: userInfo,
      session: {
        instanceUrl: session.instanceUrl,
        accessToken: session.accessToken.substring(0, 10) + '...' // Mask for security
      }
    });
  } catch (error) {
    console.error('Token test error:', error);
    return res.status(500).json({
      success: false,
      message: `Error testing token: ${error.message}`
    });
  }
});

// Get token details
apiRouter.get('/salesforce/token-details', (req, res) => {
  const sessionToken = req.headers['x-session-token'];
  
  if (!sessionToken || !tokenStore.has(sessionToken)) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
  
  const session = tokenStore.get(sessionToken);
  
  // Return non-sensitive details only
  return res.json({
    success: true,
    tokenDetails: {
      instanceUrl: session.instanceUrl,
      userInfo: session.userInfo,
      timestamp: session.timestamp,
      expires: new Date(session.timestamp + 3600000).toISOString()
    }
  });
});

// Debug token info (DEVELOPMENT ONLY) - Remove in production
apiRouter.get('/debug/token-info', (req, res) => {
  const sessionToken = req.headers['x-session-token'];
  
  if (!sessionToken || !tokenStore.has(sessionToken)) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
  
  // Get complete session info
  const session = tokenStore.get(sessionToken);
  
  // WARNING: This exposes the complete access token!
  return res.json({
    success: true,
    debug: true,
    warning: "This endpoint exposes sensitive data. Do not use in production.",
    tokenInfo: {
      sessionToken: sessionToken,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken ? "present" : "absent",
      instanceUrl: session.instanceUrl,
      userInfo: session.userInfo,
      timestamp: session.timestamp,
      created: new Date(session.timestamp).toISOString(),
      expires: new Date(session.timestamp + 3600000).toISOString()
    }
  });
});


/* SF DATA TRANSFER ROUTES  */

// Attachment transfer endpoint
apiRouter.post('/attachment', async (req, res) => {
  console.log('Transfer attachment endpoint called');
  
  try {
    const { sessionToken, leadId, attachment } = req.body;
    
    // Log request details
    console.log(`Received attachment transfer request for lead: ${leadId}`);
    console.log(`Attachment name: ${attachment?.Name || 'unnamed'}`);
    console.log(`Session token present: ${!!sessionToken}`);
    
    // Validate required parameters
    if (!leadId) {
      console.error('Missing leadId in request');
      return res.status(400).json({
        success: false,
        message: 'Missing leadId parameter.'
      });
    }
    
    if (!attachment || !attachment.Name || !attachment.Body) {
      console.error('Missing or invalid attachment data');
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid attachment data. Name and Body are required.'
      });
    }
    
    // Session token validation
    if (!sessionToken || !tokenStore.has(sessionToken)) {
      console.error('Invalid or missing session token');
      return res.status(401).json({
        success: false,
        message: 'Invalid session. Please reconnect to Salesforce.'
      });
    }
    
    const session = tokenStore.get(sessionToken);
    
    // Create Salesforce connection
    const conn = new jsforce.Connection({
      instanceUrl: session.instanceUrl,
      accessToken: session.accessToken
    });
    
    console.log('Using authenticated Salesforce connection');
    
    // Create the attachment in Salesforce
    console.log('Creating attachment in Salesforce');
    const attachmentResult = await conn.sobject('Attachment').create({
      Name: attachment.Name,
      Body: attachment.Body,
      ContentType: attachment.ContentType || 'application/octet-stream',
      ParentId: leadId
    });
    
    console.log('Salesforce attachment creation result:', attachmentResult);
    
    if (attachmentResult.success) {
      return res.json({
        success: true,
        attachmentId: attachmentResult.id,
        message: `Attachment ${attachment.Name} successfully transferred`
      });
    } else {
      console.error('Salesforce error:', attachmentResult.errors);
      return res.status(400).json({
        success: false,
        message: `Failed to create attachment: ${attachmentResult.errors.join(', ')}`
      });
    }
  } catch (error) {
    console.error('Error processing attachment transfer:', error);
    return res.status(500).json({
      success: false,
      message: `Error: ${error.message}`
    });
  }
});

/*UTILITY ROUTES */

// Health check endpoint
apiRouter.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    service: 'leadSuccess-api'
  });
});

// Simple test route
apiRouter.get('/test', (req, res) => {
  res.json({ message: 'API route is working!' });
});

// Root API route
apiRouter.get('/', (req, res) => {
  res.status(200).send("LeadSuccess API Server is running. See /api/health for details.");
});


/* Mount API router */
app.use('/api', apiRouter);

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`API base path: /api`);
});