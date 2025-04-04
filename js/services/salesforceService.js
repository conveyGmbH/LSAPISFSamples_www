import { appConfig } from "../config/salesforceConfig.js";

class SalesforceService {
  constructor() {
    this.apiBaseUrl = appConfig.apiBaseUrl;
    this.sessionToken = localStorage.getItem('sf_session_token') || null;

    console.log('SalesforceService initialized with API URL:', this.apiBaseUrl);

  }

  /* Check Salesforce connection status */
  async checkConnection() {
    try {
      console.log('Checking Salesforce connection status...');

      const response = await fetch(`${this.apiBaseUrl}/salesforce/connection-status`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Session-Token': this.sessionToken || ''
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const status = await response.json();
      console.log('Connection status:', status.connected ? 'Connected' : 'Not connected');

      return status;
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
   * Set session token after successful authentication
   * @param {string} token - Session token
   */
  setSessionToken(token) {
    this.sessionToken = token;
    if (token) {
      localStorage.setItem('sf_session_token', token);
      console.log('Session token saved:', token.substring(0, 6) + '...');
    } else {
      localStorage.removeItem('sf_session_token');
      console.log('Session token cleared');
    }
  }

  /**
   * Transfer a lead to Salesforce with enhanced debugging
   */
  async transferLead(leadData) {
    try {

      if (!this.sessionToken) {
        console.error("Error: No session token available");
        throw new Error('Not connected to Salesforce. Please connect first.');
      }

      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Session-Token': this.sessionToken
        },
        body: JSON.stringify(leadData)
      };

      try {
        const response = await fetch(`${this.apiBaseUrl}/salesforce/transfer-lead`, requestOptions);

        let resultData;

        try {
          const responseText = await response.text();
          console.log('Response text:', responseText);
          
          try {
            resultData = JSON.parse(responseText);
            console.log('JSON response parsed:', resultData);
          } catch (parseError) {
            console.error('JSON parsing error:', parseError);
            throw new Error(`Non-JSON response: ${responseText}`);
          }
        } catch (textError) {
          console.error('Error reading response text:', textError);
          throw new Error('Unable to read server response');
        }
        
        if (!response.ok) {
          console.error('Non-OK HTTP response:', response.status, resultData);
          
          // If session expired, remove token
          if (response.status === 401) {
            console.log('Session expired, removing token');
            this.setSessionToken(null);
          }
          
          throw new Error(resultData.message || `HTTP error: ${response.status}`);
        }
        
        console.log('Transfer successful:', resultData);
        return resultData;
      } catch (fetchError) {
        console.error('Fetch error:', fetchError);
        throw fetchError;
      }
    } catch (error) {
      console.error('Error in transferLead:', error);
      console.error('Stack trace:', error.stack);
      throw error;
    } finally {
      console.log('===== END TRANSFERLEAD =====');
    }
  }

  /**
   * Logout from Salesforce
   * @returns {Promise<Object>} Logout result
   */
  async logout() {
    try {
      console.log('Logging out from Salesforce...');
      
      if (!this.sessionToken) {
        return { success: true, message: 'Already logged out' };
      }
      
      const response = await fetch(`${this.apiBaseUrl}/salesforce/logout`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Session-Token': this.sessionToken
        }
      });
      
      // Remove session token
      this.setSessionToken(null);
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Logout error:', error);
      // Even in case of error, remove local token
      this.setSessionToken(null);
      throw error;
    }
  }
}

export default SalesforceService;