class SalesforceService {
  constructor() {
    this.baseUrl = 'http://localhost:3000/api'; 
    this.isConnected = false;
    this.userInfo = null;
  }

  /**
   * Initialize the connection to Salesforce
   * @returns {Promise<string>} Salesforce authentication URL
   */
  async getAuthUrl() {
    try {
      const response = await fetch(`${this.baseUrl}/salesforce/auth`);
      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.statusText}`);
      }
      const data = await response.json();
      return data.authUrl;
    } catch (error) {
      console.error('Failed to initialize authentication:', error);
      throw error;
    }
  }

  /**
   * Check Salesforce connection status
   * @returns {Promise<Object>} Connection information
   */
  async checkConnection() {
    try {
      const response = await fetch(`${this.baseUrl}/salesforce/connection-status`, {
        credentials: 'include' // Important to send cookies
      });
      if (!response.ok) {
        throw new Error(`Connection check failed: ${response.statusText}`);
      }
      const data = await response.json();
      this.isConnected = data.connected;
      this.userInfo = data.userInfo;
      return data;
    } catch (error) {
      console.error('Failed to check connection:', error);
      this.isConnected = false;
      this.userInfo = null;
      throw error;
    }
  }



  /**
   * Transfer a lead to Salesforce
   * @param {Object} leadData The lead data to transfer
   * @returns {Promise<Object>} Transfer result
   */
  async transferLead(leadData) {
    try {
      const response = await fetch(`${this.baseUrl}/salesforce/transfer-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(leadData),
        credentials: 'include' // Important to send cookies
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Transfer failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Lead transfer failed:', error);
      throw error;
    }
  }

  /**
   * Logout from Salesforce
   * @returns {Promise<Object>} Logout result
   */
  async logout() {
    try {
      const response = await fetch(`${this.baseUrl}/salesforce/logout`, {
        method: 'POST',
        credentials: 'include' // Important to send cookies
      });

      if (!response.ok) {
        throw new Error(`Logout failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  }
}

export default SalesforceService;
