const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Express application
const app = express();
const PORT = process.env.PORT || 3000;

// Standard middleware
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(compression());

// Middleware for logging requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// CORS configuration
app.use(cors({
  origin: [
    // Development origins
    'http://127.0.0.1:5504',
    'http://localhost:5504',
    'https://delightful-desert-016e2a610.4.azurestaticapps.net', 
    'https://lsapisfsamples.convey.de',
	  'https://brave-bush-0041ef403.6.azurestaticapps.net',
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
const SF_CLIENT_ID = process.env.SF_CLIENT_ID;
const SF_CLIENT_SECRET = process.env.SF_CLIENT_SECRET;
const SF_REDIRECT_URI = process.env.SF_REDIRECT_URI || 'http://localhost:3000/api/oauth2/callback';
const SF_LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

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
      { path: '/api/salesforce/leads', method: 'POST', description: 'Create lead in Salesforce' },
      { path: '/api/salesforce/userinfo', method: 'GET', description: 'Get Salesforce user information' },
      { path: '/api/direct-lead-transfer', method: 'POST', description: 'Transfer lead with attachments to Salesforce' }
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
    
    // Get user info to display in the callback page
    const userInfoResponse = await fetch(`${instance_url}/services/oauth2/userinfo`, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });
    
    const userInfo = await userInfoResponse.json();
    
    // Return success page - instead of storing tokens on server, we pass them to the client
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
          <script>
            // Pass tokens back to opener window
            window.onload = function() {
              if (window.opener) {
                window.opener.postMessage({
                  type: 'salesforce-auth-success',
                  accessToken: "${access_token}",
                  refreshToken: "${refresh_token}",
                  instanceUrl: "${instance_url}",
                  userInfo: ${JSON.stringify(userInfo)}
                }, '*');
                
                setTimeout(function() {
                  window.close();
                }, 3000);
              }
            };
          </script>
        </head>
        <body>
          <div class="success-container">
            <h2>Authentication Successful!</h2>
            <p>You are now connected to Salesforce as ${userInfo.name}.</p>
            <p>This window will close automatically.</p>
          </div>
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
        </head>
        <body>
          <div class="error-container">
            <h2>Authentication Failed</h2>
            <p>An error occurred while connecting to Salesforce.</p>
            <p>Error: ${error.message}</p>
            <p>Please close this window and try again.</p>
          </div>
        </body>
      </html>
    `);
  }
});

/* LEAD CREATION & TRANSFER ROUTES */

// Endpoint to create a lead in Salesforce
app.post('/api/salesforce/leads', async (req, res) => {
  const { leadData, accessToken, instanceUrl } = req.body;

  console.log('Request received to create a lead');
  console.log('Token present:', !!accessToken);
  console.log('Instance URL:', instanceUrl);
  
  if (!accessToken || !instanceUrl || !leadData) {
    console.log('Missing data:', {
      hasToken: !!accessToken,
      hasInstanceUrl: !!instanceUrl,
      hasLeadData: !!leadData
    });

    return res.status(400).json({ 
      success: false, 
      message: 'Missing data (token, instance URL, or lead data)' 
    });
  }
  
  try {
    // Ensure the token is decoded (in case it is URL-encoded)
    const decodedToken = decodeURIComponent(accessToken);

    // Creating the lead in Salesforce
    console.log('Attempting to create lead in Salesforce');
    const sfUrl = `${instanceUrl}/services/data/v59.0/sobjects/Lead`;

    const response = await fetch(sfUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${decodedToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(leadData)
    });

    const result = await response.json();
    console.log('Salesforce response status:', response.status);
    console.log('Salesforce response:', JSON.stringify(result, null, 2));
    
    if (response.ok) {
      return res.json({
        success: true,
        id: result.id,
        message: 'Lead successfully created'
      });
    } else {
      return res.status(response.status).json({
        success: false,
        errors: result,
        message: 'Error creating the lead'
      });
    }
  } catch (error) {
    console.error('Error creating the lead:', error);
    return res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`
    });
  }
});

// Endpoint to get user information from Salesforce
app.get('/api/salesforce/userinfo', async (req, res) => {
  const authorization = req.headers.authorization;
  const instanceUrl = req.query.instance_url;

   // Extract the token from the header if it's in the format "Bearer <token>"
   let token = authorization;
   if (authorization && authorization.startsWith('Bearer ')) {
     token = authorization.substring(7);  // Remove "Bearer " from the beginning
   }

   // Decode the token in case it is URL-encoded
  const decodedToken = token ? decodeURIComponent(token) : null;

  if (!decodedToken || !instanceUrl) {
    return res.status(400).json({ error: 'Access token and instance URL are required' });
  }

  try {
    const response = await fetch(`${instanceUrl}/services/oauth2/userinfo`, {
      method: 'GET',
      headers: {
        'Authorization':  `Bearer ${decodedToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Salesforce error: ${response.status}`);
    }
    
    const userData = await response.json();
    res.json(userData);
  } catch (error) {
    console.error('Error while retrieving user information:', error);
    res.status(500).json({ error: error.message });
  }
});

// Direct lead transfer endpoint with attachments
apiRouter.post('/direct-lead-transfer', async (req, res) => {
  const { accessToken, instanceUrl, leadData, attachments } = req.body;
  
  console.log('Token present:', !!accessToken);
  console.log('Instance URL:', !!instanceUrl);
  console.log('Attachments count:', attachments ? attachments.length : '0');
  console.log('Session Token:', sessionToken ? 'present' : 'absent');
  
  if (!accessToken || !instanceUrl) {
    console.error('Missing authentication data');
    return res.status(401).json({
      success: false,
      message: 'Missing authentication data. Please connect to Salesforce.'
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
    // Ensure token is decoded
    const decodedToken = decodeURIComponent(accessToken);
    
    // Basic check for duplicate lead by email
    if (leadData.Email) {
      try {
        console.log('Checking for duplicate by email:', leadData.Email);
        
        const queryResponse = await fetch(`${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(`SELECT Id, Name FROM Lead WHERE Email = '${leadData.Email.replace(/'/g, "\\'")}'`)}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${decodedToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (queryResponse.ok) {
          const queryResult = await queryResponse.json();
          
          if (queryResult.records && queryResult.records.length > 0) {
            console.log('Duplicate lead found by email:', queryResult.records[0].Id);
            return res.status(409).json({
              success: false,
              message: `A lead with this email already exists in Salesforce (ID: ${queryResult.records[0].Id})`,
              duplicateId: queryResult.records[0].Id
            });
          }
        }
      } catch (dupError) {
        console.error('Error checking for duplicate:', dupError);
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
    if (leadData.Country) sfLeadData.Country = cleanField(leadData.Country);
    if (leadData.State) sfLeadData.State = cleanField(leadData.State);
    

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

   
    // Create the lead in Salesforce
    console.log('Creating lead in Salesforce...');
    
    const leadResponse = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Lead`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${decodedToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(sfLeadData)
    });
    
    if (!leadResponse.ok) {
      const leadError = await leadResponse.json();
      console.error('Lead creation failed:', leadError);
      return res.status(leadResponse.status).json({
        success: false,
        message: `Failed to create lead: ${leadError[0]?.message || JSON.stringify(leadError)}`,
        errors: leadError
      });
    }
    
    const leadResult = await leadResponse.json();
    const leadId = leadResult.id;
    console.log('Lead created successfully, ID:', leadId);
    
    // Process attachments if available
    let attachmentsTransferred = 0;
    let attachmentErrors = [];
    
    if (attachments && attachments.length > 0) {
      console.log(`Processing ${attachments.length} attachments for lead ${leadId}`);
      
      for (const attachment of attachments) {
        try {
          // Create ContentVersion record in Salesforce
          const contentVersionData = {
            Title: attachment.Name,
            PathOnClient: attachment.Name,
            VersionData: attachment.Body,
            ContentLocation: 'S', // S for Salesforce, E for External
            FirstPublishLocationId: leadId // Link to the Lead record
          };
          
          const attachmentResponse = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/ContentVersion`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${decodedToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(contentVersionData)
          });
          
          const attachmentResult = await attachmentResponse.json();
          
          if (attachmentResponse.ok) {
            attachmentsTransferred++;
            console.log(`Attachment '${attachment.Name}' created, ID: ${attachmentResult.id}`);
          } else {
            console.error(`Attachment creation failed: ${JSON.stringify(attachmentResult)}`);
            attachmentErrors.push(`Failed to upload ${attachment.Name}: ${attachmentResult[0]?.message || 'Unknown error'}`);
          }
        } catch (attachErr) {
          console.error(`Error creating attachment '${attachment.Name}':`, attachErr);
          attachmentErrors.push(`Error with ${attachment.Name}: ${attachErr.message}`);
        }
      }
    }
    
    return res.json({
      success: true,
      leadId: leadId,
      status: 'Transferred',
      message: 'Lead successfully transferred to Salesforce',
      attachmentsTransferred,
      attachmentErrors: attachmentErrors.length > 0 ? attachmentErrors : undefined
    });
  } catch (error) {
    console.error('Error during lead transfer:', error);
    return res.status(500).json({
      success: false,
      message: `Error: ${error.message}`
    });
  }
});

/* UTILITY ROUTES */

// Health check endpoint
apiRouter.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    service: 'leadSuccess-api'
  });
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