
class SalesforceService {
  constructor() {
    this.baseUrl = '/salesforce-api'; 
    this.isConnected = false;
    this.userInfo = null;
  }

 
  async initAuth() {
    try {
      const response = await fetch(`${this.baseUrl}/auth`);
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

 
  async checkConnection() {
    try {
      const response = await fetch(`${this.baseUrl}/connection-status`);
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

 
  async validateLeadData(leadData) {
    try {
      const response = await fetch(`${this.baseUrl}/validate-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(leadData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Validation failed: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Lead validation failed:', error);
      throw error;
    }
  }

  
  async transferLead(leadData) {
    try {
      const response = await fetch(`${this.baseUrl}/transfer-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(leadData),
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

  
  async getTransferStatus(transferId) {
    try {
      const response = await fetch(`${this.baseUrl}/transfer-status/${transferId}`);
      if (!response.ok) {
        throw new Error(`Failed to get transfer status: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to get transfer status:', error);
      throw error;
    }
  }
}

export default SalesforceService;