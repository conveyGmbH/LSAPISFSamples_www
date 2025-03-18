// server.js - Node.js Express Backend
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jsforce = require('jsforce');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cookieParser());  // Important pour gérer les cookies
app.use(express.urlencoded({ extended: true }));

// Cors Config
app.use(cors({
  origin: ['http://127.0.0.1:5504'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'] 
}));

// OAuth2 configuration
const oauth2 = new jsforce.OAuth2({
  loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
  clientId: process.env.SF_CLIENT_ID,
  clientSecret: process.env.SF_CLIENT_SECRET,
  redirectUri: process.env.SF_REDIRECT_URI || 'http://localhost:3000/api/oauth2/callback'
});

// Create API router
const apiRouter = express.Router();

// Get authentication URL
apiRouter.get('/salesforce/auth', (req, res) => {
  try {
    console.log('Generating auth URL with redirect URI:', oauth2.redirectUri);
    const authUrl = oauth2.getAuthorizationUrl({
      scope: 'api id web refresh_token',
      prompt: 'login consent'
    });
    console.log('Generated authUrl:', authUrl);
    
    res.json({ authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

// OAuth callback
apiRouter.get('/oauth2/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).send('Authorization code missing');
  }
  
  try {
    console.log('Received auth code, attempting to authorize');
    
    // Exchange code for token
    const conn = new jsforce.Connection({ oauth2 });
    const userInfo = await conn.authorize(code);
    
    console.log('Authorization successful, user:', userInfo.display_name || userInfo.name);
    
    // Set cookies (clé de votre solution qui fonctionne)
    res.cookie('salesforce_access_token', conn.accessToken, {
      httpOnly: true,
      secure: false,
      maxAge: 2 * 60 * 60 * 1000, // 2 hours
      domain: '127.0.0.1',
      sameSite: 'lax'
    });

    res.cookie('salesforce_instance_url', conn.instanceUrl, {
      httpOnly: true,
      secure: false,
      maxAge: 2 * 60 * 60 * 1000, // 2 hours
      domain: '127.0.0.1',
      sameSite: 'lax'
    });

    if (conn.refreshToken) {
      res.cookie('salesforce_refresh_token', conn.refreshToken, {
        httpOnly: true,
        secure: false,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        domain: '127.0.0.1',
        sameSite: 'lax'
      });
    }
    
    // Close the window with a success message
    res.send(`
      <html>
        <body>
          <h2>Authentication successful!</h2>
          <p>You can close this window and return to the application.</p>
          <script>
            // Dispatch event to parent window if possible
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'salesforce-auth-success', 
                userInfo: ${JSON.stringify(userInfo)}
              }, '*');
            }
            // Close window after a short delay
            setTimeout(function() {
              window.close();
            }, 3000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send(`
      <html>
        <body>
          <h2>Authentication failed</h2>
          <p>Error: ${error.message}</p>
          <p>Please close this window and try again.</p>
          <script>
            setTimeout(function() {
              window.close();
            }, 5000);
          </script>
        </body>
      </html>
    `);
  }
});

// Check connection status
apiRouter.get('/salesforce/connection-status', (req, res) => {
  // Vérifier la connexion via cookies au lieu de session
  const accessToken = req.cookies.salesforce_access_token;
  const instanceUrl = req.cookies.salesforce_instance_url;
  
  console.log("connection", accessToken)
  if (!accessToken || !instanceUrl) {
    console.log('Connection status: Not connected (no cookies)');
    return res.json({ connected: false });
  }
  
  // Create connection with existing access token to verify
  const conn = new jsforce.Connection({
    instanceUrl: instanceUrl,
    accessToken: accessToken
  });
  
  // Optionally, you can verify the token is still valid
  conn.identity((err, userInfo) => {
    if (err) {
      console.log('Connection status: Token invalid or expired');
      return res.json({ connected: false });
    }
    
    console.log('Connection status: Connected as', userInfo.display_name || userInfo.name);
    res.json({ connected: !!accessToken });
  });
});

// server.js - Avant la route POST
apiRouter.options('/salesforce/transfer-lead', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5504');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.status(200).send();
});

// Transfer lead to Salesforce
apiRouter.post('/salesforce/transfer-lead', async (req, res) => {

  const leadData = req.body;
  const accessToken = req.cookies.salesforce_access_token;
  const instanceUrl = req.cookies.salesforce_instance_url;
  
  if (!accessToken || !instanceUrl) {
    console.log('Transfer attempted without connection');
    return res.status(401).json({ 
      success: false, 
      message: 'Not authenticated with Salesforce. Please connect first.' 
    });
  }
  
  if (!leadData) {
    console.log('Transfer attempted without lead data');
    return res.status(400).json({ 
      success: false, 
      message: 'No lead data provided.' 
    });
  }
  
  try {
    console.log('Transferring lead:', leadData.FirstName, leadData.LastName);
    // Create connection with cookie credentials
    const conn = new jsforce.Connection({
      instanceUrl: instanceUrl,
      accessToken: accessToken
    });
    
    // Prepare lead data for Salesforce
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
      Street: leadData.Street || '',
      City: leadData.City || '',
      State: leadData.State || '',
      PostalCode: leadData.PostalCode || '',
      Country: leadData.Country || '',
      // Add any custom fields that you need to map
      LeadSource: 'LeadSuccess API',
      External_Id__c: leadData.Id || ''
    };
    
    // Create lead in Salesforce
    const result = await conn.sobject('Lead').create(sfLeadData);
    
    if (result.success) {
      console.log('Lead transferred successfully, SF ID:', result.id);
      res.json({
        success: true,
        leadId: result.id,
        status: 'Transferred',
        message: 'Lead successfully transferred to Salesforce'
      });
    } else {
      console.error('Lead transfer error:', result.errors);
      res.status(400).json({
        success: false,
        message: `Failed to create lead: ${result.errors.join(', ')}`
      });
    }
  } catch (error) {
    console.error('Lead transfer error:', error);
    
    // Handle token expiration
    if (error.errorCode === 'INVALID_SESSION_ID') {
      // Clear cookies
      res.clearCookie('salesforce_access_token');
      res.clearCookie('salesforce_instance_url');
      
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please reconnect to Salesforce.',
        errorCode: 'SESSION_EXPIRED'
      });
    }
    
    res.status(500).json({
      success: false,
      message: `Error transferring lead: ${error.message}`
    });
  }
});

// Logout from Salesforce
apiRouter.post('/salesforce/logout', async (req, res) => {
  // Simplement supprimer les cookies
  res.clearCookie('salesforce_access_token');
  res.clearCookie('salesforce_instance_url');
  res.clearCookie('salesforce_refresh_token');
  
  res.json({ 
    success: true, 
    message: 'Successfully logged out from Salesforce' 
  });
});

// Mount API router
app.use('/api', apiRouter);

// Start server
app.listen(PORT, () => {
  console.log(`Salesforce API server running on http://localhost:${PORT}`);
  console.log(`Callback URL configured as: ${oauth2.redirectUri}`);
});