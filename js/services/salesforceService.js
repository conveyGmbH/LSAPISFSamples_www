import { appConfig } from "../config/salesforceConfig.js";

// Service to manage interactions with Salesforce API 

class SalesforceService {
  constructor() {
    this.apiBaseUrl = appConfig.apiBaseUrl;
        // Initialize by loading authentication data from localStorage
        this.authData = this.getStoredAuthData();
        console.log('SalesforceService initialized with API URL:', this.apiBaseUrl);
  }

  /**
   * Retrieve stored authentication data
   * @returns {Object|null} Authentication data or null if unavailable
   */

  getStoredAuthData() {
    try {
      const authDataStr = localStorage.getItem('sf_auth_data');
      if (authDataStr) {
        return JSON.parse(authDataStr);
      }

      // Compatibility with the old format (sf_session_token)
      const oldToken = localStorage.getItem('sf_session_token');
      if (oldToken) {
        console.log('Using legacy token format');
        return {
          accessToken: oldToken,
          instanceUrl: localStorage.getItem('sf_instance_url') || appConfig.salesforce.defaultInstanceUrl,
          timestamp: Date.now()
        };
      }
      return null;
    } catch (error) {
      console.error('Error parsing stored auth data:', error);
      return null;
    }
  }

  /**
   * Store authentication data
   * @param {Object} authData - Authentication data
   */
  storeAuthData(authData) {
    if (authData) {
      localStorage.setItem('sf_auth_data', JSON.stringify(authData));

      // Clean up old data if it exists
      localStorage.removeItem('sf_session_token');
      localStorage.removeItem('sf_instance_url');

      this.authData = authData;
      console.log('Auth data stored successfully');
    } else {
      localStorage.removeItem('sf_auth_data');
      localStorage.removeItem('sf_session_token');
      localStorage.removeItem('sf_instance_url');

      this.authData = null;
      console.log('Auth data cleared');
    }
  }

  /**
   * Check if authentication data is still valid
   * @returns {Promise<boolean>} True if authentication is valid
   */
  async isAuthValid() {
    try {
      if (!this.authData || !this.authData.accessToken || !this.authData.instanceUrl) {
        return false;
      }

      // Verify token validity by retrieving user info
      const response = await fetch(`${this.authData.instanceUrl}/services/oauth2/userinfo`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.authData.accessToken}`
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Authentication validation error:', error);
      return false;
    }
  }

  /**
   * Check Salesforce connection status
   * @returns {Promise<Object>} Connection status
   */
  async checkConnection() {
    try {
      console.log('Checking Salesforce connection status...');

      if (!this.authData) {
        return { connected: false, message: 'No authentication data available' };
      }

      const isValid = await this.isAuthValid();

      if (!isValid) {
        // Clean up invalid data
        this.storeAuthData(null);
        return { connected: false, message: 'Authentication expired or invalid' };
      }

      return {
        connected: true,
        message: 'Connected to Salesforce',
        userInfo: this.authData.userInfo
      };
    } catch (error) {
      console.error('Connection check error:', error);
      return { connected: false, error: error.message };
    }
  }

  /**
   * Get Salesforce authentication URL
   * @returns {Promise<string>} Authentication URL
   */
  async getAuthUrl() {
    try {
      console.log('Requesting Salesforce auth URL...');
      const response = await fetch(`${this.apiBaseUrl}/salesforce/auth`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data = await response.json();
      console.log('Auth URL received');
      return data.authUrl;
    } catch (error) {
      console.error('Error getting auth URL:', error);
      throw error;
    }
  }

  /**
   * Process authentication completion
   * @param {Object} authResult - Authentication result
   * @returns {Object} Stored authentication data
   */
  handleAuthSuccess(authResult) {
    const authData = {
      accessToken: authResult.accessToken,
      refreshToken: authResult.refreshToken,
      instanceUrl: authResult.instanceUrl,
      userInfo: authResult.userInfo,
      timestamp: Date.now()
    };

    this.storeAuthData(authData);
    return authData;
  }

  /**
   * Transfer a lead to Salesforce
   * @param {Object} leadData - Lead data to transfer
   * @param {Array} attachments - Attachments to transfer
   * @returns {Promise<Object>} Transfer result
   */
  async transferLead(leadData, attachments = []) {
    try {
      console.log('Transferring lead to Salesforce...');

      if (!this.authData || !this.authData.accessToken) {
        throw new Error('Not connected to Salesforce. Please connect first.');
      }

      // Prepare data for the API
      const requestBody = {
        accessToken: this.authData.accessToken,
        instanceUrl: this.authData.instanceUrl,
        leadData: leadData,
        attachments: attachments
      };

      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      };

      const response = await fetch(`${this.apiBaseUrl}/direct-lead-transfer`, requestOptions);

      let resultData;
      try {
        resultData = await response.json();
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        const text = await response.text();
        throw new Error(`Invalid response: ${text}`);
      }

      if (!response.ok) {
        // Clean up expired authentication data
        if (response.status === 401) {
          this.storeAuthData(null);
        }

        throw new Error(resultData.message || `HTTP error: ${response.status}`);
      }

      console.log('Transfer successful:', resultData);
      return resultData;
    } catch (error) {
      console.error('Error in transferLead:', error);
      throw error;
    }
  }

  // Log out from Salesforce
  logout() {
    console.log('Logging out from Salesforce...');
    this.storeAuthData(null);
    return { success: true, message: 'Logged out successfully' };
  }
}

export default SalesforceService;