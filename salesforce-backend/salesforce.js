//backend/salesforce.js

const jsforce = require('jsforce');

class SalesforceService {
  constructor() {
    this.connections = new Map();
  }

  // OAuth2 connection for a specific org
  async connectToOrg(orgId, clientId, clientSecret, redirectUri, refreshToken, instanceUrl, accessToken) {
    try {
      const conn = new jsforce.Connection({
        oauth2: {
          clientId,
          clientSecret,
          redirectUri
        },
        instanceUrl,
        accessToken,
        refreshToken
      });
      
      this.connections.set(orgId, conn);
      return conn;
    } catch (error) {
      console.error(`Failed to connect to org ${orgId}:`, error);
      throw error;
    }
  }

  // Get connection for specific org
  getConnection(orgId) {
    const conn = this.connections.get(orgId);
    if (!conn) {
      throw new Error(`No connection found for org: ${orgId}`);
    }
    return conn;
  }

  // Lead CRUD operations
  async createLead(orgId, leadData) {
    const conn = this.getConnection(orgId);
    return await conn.sobject('Lead').create(leadData);
  }

  async getLeads(orgId, limit = 100) {
    const conn = this.getConnection(orgId);
    const query = `SELECT Id, FirstName, LastName, Company, Email, Status FROM Lead LIMIT ${limit}`;
    const result = await conn.query(query);
    return result.records;
  }

  async updateLead(orgId, leadId, leadData) {
    const conn = this.getConnection(orgId);
    return await conn.sobject('Lead').update({
      Id: leadId,
      ...leadData
    });
  }

  async deleteLead(orgId, leadId) {
    const conn = this.getConnection(orgId);
    return await conn.sobject('Lead').delete(leadId);
  }

  // Generate OAuth2 authorization URL
  getAuthUrl(clientId, redirectUri, state) {
    const oauth2 = new jsforce.OAuth2({
      clientId,
      redirectUri,
      loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com'
    });
    
    return oauth2.getAuthorizationUrl({
      scope: 'api refresh_token',
      state
    });
  }

  // Exchange authorization code for tokens
  async getAccessToken(clientId, clientSecret, redirectUri, code) {
    const oauth2 = new jsforce.OAuth2({
      clientId,
      clientSecret,
      redirectUri,
      loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com'
    });

    const conn = new jsforce.Connection({ oauth2 });
    const userInfo = await conn.authorize(code);
    
    return {
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      instanceUrl: conn.instanceUrl,
      userInfo
    };
  }
}

module.exports = new SalesforceService();