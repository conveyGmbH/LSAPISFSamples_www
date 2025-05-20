const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path'); 

// Load environment variables (only general config, no Salesforce variables)
dotenv.config();

const app = express();
const PORT = 3000;

// General environment configuration
const config = {
  FRONTEND_URL: process.env.FRONTEND_DEV_URL || process.env.FRONTEND_PROD_URL,
  BACKEND_URL: process.env.BACKEND_DEV_URL || process.env.BACKEND_PROD_URL
};

// Standard middleware
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(compression());

// Serve static files (including oauth-callback.html)
app.use(express.static(path.join(__dirname, 'public')));

// CORS configuration
app.use(cors({
  origin: [
    // Development origins
    'http://127.0.0.1:5504', // local frontend
    'http://localhost:5504', // local frontend
    'http://localhost:3000', // local backend
    // Production origins
    'https://delightful-desert-016e2a610.4.azurestaticapps.net',
    'https://brave-bush-0041ef403.6.azurestaticapps.net',
    'https://lsapisfsamples.convey.de',
    'https://lsapisfbackend.convey.de'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control', 'X-Session-Token']
}));

// Logging middleware for all requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  
  // Log important headers
  console.log('  Origin:', req.headers.origin);
  console.log('  Content-Type:', req.headers['content-type']);
  
  // Log the body for POST/PUT requests but mask sensitive information
  if ((req.method === 'POST' || req.method === 'PUT') && req.body) {
    const sanitizedBody = { ...req.body };
    // Mask sensitive information
    if (sanitizedBody.clientConfig?.SF_CLIENT_SECRET) {
      sanitizedBody.clientConfig.SF_CLIENT_SECRET = '***SECRET***';
    }
    if (sanitizedBody.accessToken) {
      sanitizedBody.accessToken = '***TOKEN***';
    }
    console.log('  Body:', JSON.stringify(sanitizedBody));
  }
  
  // Capture the response for logging
  const originalSend = res.send;
  res.send = function(body) {
    console.log(`[${timestamp}] Response ${res.statusCode}`);
    // Don't log response bodies that are too large
    if (typeof body === 'string' && body.length < 1000) {
      console.log('  Response Body:', body);
    } else {
      console.log('  Response Body: [Content too large to display]');
    }
    return originalSend.call(this, body);
  };
  
  next();
});

// CORS preflight for Salesforce userinfo endpoint
// This is necessary for the Salesforce userinfo endpoint to work correctly
app.use('/api/salesforce/userinfo', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://lsapisfsamples.convey.de');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Cache-Control, X-Session-Token');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

/* API ROUTER SETUP */
const apiRouter = express.Router();

// Generate Salesforce authentication URL using client-provided credentials
apiRouter.post('/salesforce/auth', (req, res) => {
  const clientConfig = req.body;

  if (!clientConfig || !clientConfig.SF_CLIENT_ID || !clientConfig.SF_REDIRECT_URI) {
    return res.status(400).json({ error: 'Missing required Salesforce credentials. Please enter them first.' });
  }

  const SF_LOGIN_URL = clientConfig.SF_LOGIN_URL || 'https://login.salesforce.com';
  const authUrl = `${SF_LOGIN_URL}/services/oauth2/authorize?response_type=code&client_id=${clientConfig.SF_CLIENT_ID}&redirect_uri=${encodeURIComponent(clientConfig.SF_REDIRECT_URI)}&scope=api%20id%20web%20refresh_token`;

  res.json({ authUrl });
});

// Route for oauth-callback.html (for implicit flow)
app.get('/oauth-callback.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'oauth-callback.html'));
});

// OAuth2 callback (for authorization flow)
apiRouter.get('/oauth2/callback', (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Authorization code missing');
  }

  res.send(`
    <script>
      window.onload = function() {
        if (window.opener) {
          window.opener.postMessage({ type: 'salesforce-auth-code', code: "${code}" }, '*');
          setTimeout(() => window.close(), 3000);
        }
      };
    </script>
    <h1>Authentication Successful!</h1>
    <p>You can close this window.</p>
  `);
});

// Exchange authorization code for access token using client-provided credentials
apiRouter.post('/salesforce/token', async (req, res) => {
  const { code, clientConfig } = req.body;

  if (!code || !clientConfig || !clientConfig.SF_CLIENT_ID || !clientConfig.SF_CLIENT_SECRET || !clientConfig.SF_REDIRECT_URI) {
    console.error('Invalid token request:', { 
      hasCode: !!code, 
      hasClientConfig: !!clientConfig, 
      clientId: clientConfig?.SF_CLIENT_ID ? 'provided' : 'missing',
      clientSecret: clientConfig?.SF_CLIENT_SECRET ? 'provided' : 'missing',
      redirectUri: clientConfig?.SF_REDIRECT_URI || 'missing'
    });
    return res.status(400).json({ error: 'Invalid request. Missing required fields.' });
  }

  try {
    const SF_LOGIN_URL = clientConfig.SF_LOGIN_URL || 'https://login.salesforce.com';
    const tokenUrl = `${SF_LOGIN_URL}/services/oauth2/token`;
    
    console.log('Exchanging code for token with Salesforce:', {
      tokenUrl,
      clientId: clientConfig.SF_CLIENT_ID,
      redirectUri: clientConfig.SF_REDIRECT_URI
    });

    const tokenRequest = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientConfig.SF_CLIENT_ID,
      client_secret: clientConfig.SF_CLIENT_SECRET,
      redirect_uri: clientConfig.SF_REDIRECT_URI,
      code: code
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenRequest
    });

    const responseText = await response.text();
    let tokenData;
    
    try {
      tokenData = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse token response as JSON:', responseText);
      return res.status(500).json({ error: 'Invalid response from Salesforce' });
    }

    if (!response.ok) {
      console.error('Token exchange failed:', tokenData);
      throw new Error(tokenData.error_description || 'Failed to exchange token');
    }

    console.log('Token exchange successful, fetching user info...');
    const userInfoResponse = await fetch(`${tokenData.instance_url}/services/oauth2/userinfo`, {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });

    const userInfo = await userInfoResponse.json();
    console.log('User info retrieved:', {
      name: userInfo.name,
      email: userInfo.email,
      organization_id: userInfo.organization_id
    });

    res.json({ ...tokenData, userInfo });
  } catch (error) {
    console.error('Token exchange error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* -------------------- LEAD CREATION -------------------- */

// Create lead using client-provided credentials
apiRouter.post('/salesforce/leads', async (req, res) => {
  const { leadData, accessToken, instanceUrl } = req.body;

  if (!accessToken || !instanceUrl || !leadData) {
    return res.status(400).json({ error: 'Missing required data: accessToken, instanceUrl, or leadData.' });
  }

  try {
    const response = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Lead`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(leadData)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result[0]?.message || 'Failed to create lead');
    }

    res.json({ success: true, id: result.id });
  } catch (error) {
    console.error('Lead creation error:', error);
    res.status(500).json({ error: error.message });
  }
});


// Direct lead transfer endpoint with attachments
apiRouter.post('/direct-lead-transfer', async (req, res) => {
  const { accessToken, instanceUrl, leadData, attachments } = req.body;
  
  console.log('Token present:', !!accessToken);
  console.log('Instance URL:', !!instanceUrl);
  console.log('Attachments count:', attachments ? attachments.length : '0');
  
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
    if (leadData.Country) sfLeadData.Country = cleanField(leadData.Country);
    if (leadData.State) sfLeadData.State = cleanField(leadData.State);
    
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

// Add endpoint for user info retrieval
apiRouter.get('/salesforce/userinfo', async (req, res) => {
  const { accessToken, instanceUrl } = req.query;
  
  if (!accessToken || !instanceUrl) {
    return res.status(400).json({ error: 'Access token and instance URL required' });
  }
  
  try {
    const response = await fetch(`${instanceUrl}/services/oauth2/userinfo`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      throw new Error(`Salesforce error: ${response.status}`);
    }
    
    const userData = await response.json();
    res.json(userData);
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ error: error.message });
  }
});



/* -------------------- UTILITY ROUTES -------------------- */

// Health check endpoint
apiRouter.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: Date.now(), service: 'leadSuccess-api' });
  console.log("Health check endpoint accessed");
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
  console.log(`API base path: /api`);
  console.log(`OAuth callback: ${config.BACKEND_URL || `http://localhost:${PORT}`}/oauth-callback.html`);
});