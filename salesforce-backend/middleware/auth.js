const salesforceService = require('../salesforce');

// Middleware to verify Salesforce authentication
const authMiddleware = async (req, res, next) => {
  try {
    // Get org ID from headers or query params
    const orgId = req.headers['x-org-id'] || req.query.orgId || 'default';
    
    // Check if we have a valid connection for this org
    try {
      const conn = salesforceService.getConnection(orgId);
      
      // Test the connection by making a simple query
      await conn.identity();
      
      // Add org info to request
      req.orgId = orgId;
      req.sfConnection = conn;
      
      next();
    } catch (error) {
      // Connection doesn't exist or is invalid
      return res.status(401).json({
        error: 'Unauthorized',
        message: `No valid Salesforce connection for org: ${orgId}`,
        orgId
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      error: 'Authentication error',
      message: error.message
    });
  }
};

// Middleware to handle multi-org setup
const setupOrgMiddleware = async (req, res, next) => {
  const { orgId, clientId, clientSecret, redirectUri, refreshToken, instanceUrl } = req.body;
  
  try {
    await salesforceService.connectToOrg(
      orgId,
      clientId,
      clientSecret,
      redirectUri,
      refreshToken,
      instanceUrl
    );
    
    req.orgId = orgId;
    next();
  } catch (error) {
    console.error('Org setup error:', error);
    res.status(400).json({
      error: 'Failed to setup org connection',
      message: error.message
    });
  }
};

module.exports = {
  authMiddleware,
  setupOrgMiddleware
};