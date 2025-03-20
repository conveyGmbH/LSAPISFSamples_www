const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jsforce = require('jsforce');
const dotenv = require('dotenv');
const path = require('path');

// Detection Environment
const isProduction = process.env.NODE_ENV === 'production';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
app.use(cors({
  origin: [
    'https://delightful-desert-016e2a610.4.azurestaticapps.net', 
    'http://localhost:3000',
    'http://127.0.0.1:5504'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control', 'X-Session-Token']
}));

// OAuth2 configuration
const SF_CLIENT_ID = process.env.SF_CLIENT_ID;
const SF_CLIENT_SECRET = process.env.SF_CLIENT_SECRET;
const SF_REDIRECT_URI = 'https://lsapisamplesbackend-bhesadgtbja4dmgq.germanywestcentral-01.azurewebsites.net/api/oauth2/callback';
  // : 'http://localhost:3000/api/oauth2/callback';
const SF_LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

// Session token storage
const tokenStore = new Map();

// API router
const apiRouter = express.Router();

// Welcome Page Server
app.get('/', (req, res) => {
  const serverInfo = {
    status: 'online',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())} seconds`,
    endpoints: [
      { path: '/api/salesforce/auth', method: 'GET', description: 'Get Salesforce authentication URL 2000' },
      { path: '/api/oauth2/callback', method: 'GET', description: 'OAuth2 callback for Salesforce' },
      { path: '/api/direct-lead-transfer', method: 'POST', description: 'Transfer lead to Salesforce' }
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


// Get authentication URL
apiRouter.get('/salesforce/auth', (req, res) => {
  try {
    
    console.log('Current environment:', process.env.NODE_ENV || 'development');
    console.log('Using redirect URI:', SF_REDIRECT_URI);
    console.log('Generating auth URL...');

    const authUrl = `${SF_LOGIN_URL}/services/oauth2/authorize?response_type=code&client_id=${SF_CLIENT_ID}&redirect_uri=${encodeURIComponent(SF_REDIRECT_URI)}&scope=api%20id%20web%20refresh_token`;
    
    console.log('Auth URL generated:', authUrl);
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
          </style>
        </head>
        <body>
          <div class="success-container">
            <h2>Authentication Successful!</h2>
            <p>You are now connected to Salesforce as ${userInfo.username}.</p>
            <p>This window will close automatically.</p>
          </div>
          <script>
            // Pass token to parent window
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'salesforce-auth-success', 
                userInfo: ${JSON.stringify(userInfo)},
                sessionToken: "${sessionToken}"
              }, '*');
              
              // Close window after a short delay
              setTimeout(function() {
                window.close();
              }, 2000);
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


// Add this endpoint in server.js in the apiRouter section

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
  
  // Optional: Check if session is older than 1 hour
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



// Direct lead transfer endpoint - improved for demo
apiRouter.post('/direct-lead-transfer', async (req, res) => {
  const { sessionToken, leadData } = req.body;
  
  console.log('==== DIRECT LEAD TRANSFER (DEMO VERSION) ====');
  console.log('Session Token:', sessionToken ? 'present' : 'absent');
  
  if (!sessionToken || !tokenStore.has(sessionToken)) {
    console.error('Invalid or missing session token');
    return res.status(401).json({
      success: false,
      message: 'Invalid session. Please reconnect to Salesforce.'
    });
  }
  
  if (!leadData) {
    console.error('Missing lead data');
    return res.status(400).json({
      success: false,
      message: 'Lead data missing.'
    });
  }
  
  try {
    const session = tokenStore.get(sessionToken);
    
    // Create Salesforce connection
    const conn = new jsforce.Connection({
      instanceUrl: session.instanceUrl,
      accessToken: session.accessToken
    });
    
    // Basic check for duplicate lead by email
    if (leadData.Email) {
      try {
        console.log('Checking for duplicate by email:', leadData.Email);
        const query = `SELECT Id, Name FROM Lead WHERE Email = '${leadData.Email.replace(/'/g, "\\'")}' LIMIT 1`;
        const result = await conn.query(query);
        
        if (result.records.length > 0) {
          console.log('Duplicate lead found by email:', result.records[0].Id);
          return res.status(409).json({
            success: false,
            message: `A lead with this email already exists in Salesforce (ID: ${result.records[0].Id})`,
            duplicateId: result.records[0].Id
          });
        }
      } catch (dupError) {
        console.error('Error checking for duplicate:', dupError);
        // Continue with transfer if duplicate check fails
      }
    }
    
    // Prepare lead data for Salesforce - with improved validation
    console.log('Preparing lead data...');
    const sfLeadData = {
      FirstName: leadData.FirstName || '',
      LastName: leadData.LastName || 'Unknown',
      Company: leadData.Company || 'Unknown',
      Email: leadData.Email || '',
      Phone: leadData.Phone || '',
      MobilePhone: leadData.MobilePhone || '',
      Title: leadData.Title || '',
      Industry: leadData.Industry || '',
      Description: leadData.Description || '',
      LeadSource: 'LeadSuccess API'
    };

    // Function to clean field values before sending to Salesforce
    const cleanField = (value) => {
      if (!value || value === 'N/A' || value === 'undefined' || value === 'null') {
        return ''; // Empty string is safer than null for Salesforce
      }
      return value;
    };

    // Add address fields only if they have valid values
    if (leadData.Street) sfLeadData.Street = cleanField(leadData.Street);
    if (leadData.City) sfLeadData.City = cleanField(leadData.City);
    if (leadData.PostalCode) sfLeadData.PostalCode = cleanField(leadData.PostalCode);

    // Special handling for Country field to avoid validation errors
    if (leadData.Country && leadData.Country !== 'N/A') {
      // List of valid countries (simplified example for demo)
      const validCountries = ['US', 'CA', 'FR', 'DE', 'UK', 'ES', 'IT', 'JP', 'AU', 'BR'];
      
      // Check if country is in the list of valid countries
      if (validCountries.includes(leadData.Country)) {
        sfLeadData.Country = leadData.Country;
      } else {
        // Leave empty rather than setting a potentially invalid value
        console.log(`Country value "${leadData.Country}" might be invalid, leaving empty`);
      }
    }

    // Deliberately omit State/Province to avoid validation errors
    
    // Create the lead in Salesforce
    console.log('Creating lead in Salesforce...');
    try {
      const result = await conn.sobject('Lead').create(sfLeadData);
      
      if (result.success) {
        console.log('Lead created successfully, ID:', result.id);
        return res.json({
          success: true,
          leadId: result.id,
          status: 'Transferred',
          message: 'Lead successfully transferred to Salesforce'
        });
      } else {
        console.error('Lead creation failed:', result.errors);
        return res.status(400).json({
          success: false,
          message: `Failed to create lead: ${result.errors.join(', ')}`
        });
      }
    } catch (sfError) {
      // Simplified error handling for demo
      console.error('Salesforce API error:', sfError.message);
      return res.status(400).json({
        success: false,
        message: `Salesforce error: ${sfError.message}`
      });
    }
  } catch (error) {
    console.error('Error during lead transfer:', error);
    return res.status(500).json({
      success: false,
      message: `Error: ${error.message}`
    });
  }
});


// Endpoint simple 
apiRouter.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    service: 'leadSuccess-api'
  });
});

apiRouter.get('/', (req, res) => {
  res.status(200).send("LeadSuccess API Server is running. See /api/health for details.");
});

// Mount API router
app.use('/api', apiRouter);

// Start server
app.listen(PORT, () => {
  console.log(` http://localhost:${PORT}`);
});