
// SalesforceService.js - Handles all Salesforce API interactions
class SalesforceService {
  constructor(apiBaseUrl) {
    this.apiBaseUrl = apiBaseUrl || '/api';
    console.log('SalesforceService initialized with API URL:', this.apiBaseUrl);
  }

  // Singleton pattern implementation
  static getInstance(apiBaseUrl) {
    if (!SalesforceService.instance) {
      SalesforceService.instance = new SalesforceService(apiBaseUrl);
    }
    return SalesforceService.instance;
  }

  // Check if client configuration exists in localStorage
  hasClientConfig() {
    const clientId = localStorage.getItem('SF_CLIENT_ID');
    const redirectUri = localStorage.getItem('SF_REDIRECT_URI');
    return !!(clientId && redirectUri);
  }

  // Get authentication data from local storage
  getAuthData() {
    try {
      const accessToken = localStorage.getItem('SF_ACCESS_TOKEN');
      const instanceUrl = localStorage.getItem('SF_INSTANCE_URL');
  

      if (!accessToken || !instanceUrl) {
        return null;
      }

      return {
        accessToken,
        instanceUrl,
       
      };
    } catch (error) {
      console.error('Error retrieving auth data:', error);
      return null;
    }
  }

  // Store authentication data in local storage
  storeAuthData(authData) {
    if (!authData || !authData.accessToken || !authData.instanceUrl) {
      console.error('Invalid auth data provided:', authData);
      return false;
    }

    try {
      localStorage.setItem('SF_ACCESS_TOKEN', authData.accessToken);
      localStorage.setItem('SF_INSTANCE_URL', authData.instanceUrl);
      return true;
    } catch (error) {
      console.error('Error storing auth data:', error);
      return false;
    }
  }

  // Clear authentication data from local storage
  clearAuthData() {
    try {
      localStorage.removeItem('SF_ACCESS_TOKEN');
      localStorage.removeItem('SF_INSTANCE_URL');
      return true;
    } catch (error) {
      console.error('Error clearing auth data:', error);
      return false;
    }
  }

  // Initialize OAuth flow with implicit grant
  async initializeAuth() {
    try {
      const clientId = localStorage.getItem('SF_CLIENT_ID');
      const redirectUri = localStorage.getItem('SF_REDIRECT_URI');
      const loginUrl = localStorage.getItem('SF_LOGIN_URL') || 'https://login.salesforce.com';

      if (!clientId || !redirectUri) {
        throw new Error('Salesforce client configuration missing. Please configure it first.');
      }

      // Construct the authorization URL for implicit flow
      const authUrl = `${loginUrl}/services/oauth2/authorize?response_type=token&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
      
      console.log('Opening Salesforce authentication URL:', authUrl);

      // Open the authorization URL in a popup window
      const authWindow = window.open(authUrl, 'SalesforceAuth', 'width=600,height=700');
      
      if (!authWindow) {
        throw new Error('Popup blocked! Please allow popups for this site.');
      }

      return new Promise((resolve, reject) => {
        // Handle timeout (5 minutes)
        const timeout = setTimeout(() => {
          reject(new Error('Authentication timed out. Please try again.'));
        }, 300000);

        // Listen for messages from the popup window
        const messageHandler = (event) => {
          if (event.data && (event.data.access_token || event.data.error)) {
            clearTimeout(timeout);
            window.removeEventListener('message', messageHandler);
            
            console.log('Message received from authentication window:', event.data);
            
            if (event.data.error) {
              reject(new Error(`Authentication error: ${event.data.error}`));
            } else {
              resolve(event.data);
            }
          }
        };

        window.addEventListener('message', messageHandler);
      });
    } catch (error) {
      console.error('Error initializing authentication:', error);
      throw error;
    }
  }

  // Validate token through proxy
  async isTokenValid() {
    try {
      const authData = this.getAuthData();
      if (!authData || !authData.instanceUrl || !authData.accessToken) {
        return false;
      }
      
      // Use the proxy to avoid CORS issues
      const response = await fetch(`${this.apiBaseUrl}/salesforce/userinfo?accessToken=${encodeURIComponent(authData.accessToken)}&instanceUrl=${encodeURIComponent(authData.instanceUrl)}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Token validation failed');
      }
      
      return true;
    } catch (error) {
      console.error("Token validation error:", error);
      return false;
    }
  }

  // Check connection status and get user info
  async checkConnection() {
    try {
      const authData = this.getAuthData();
      if (!authData) {
        return { connected: false, message: 'Not authenticated with Salesforce' };
      }

      const isValid = await this.isTokenValid();
      
      if (!isValid) {
        return { connected: false, message: 'Authentication expired or invalid' };
      }

      // Get user info through the proxy
      try {
        const response = await fetch(`${this.apiBaseUrl}/salesforce/userinfo?accessToken=${encodeURIComponent(authData.accessToken)}&instanceUrl=${encodeURIComponent(authData.instanceUrl)}`);
        
        if (response.ok) {
          const userInfo = await response.json();
          return { 
            connected: true,
            userInfo: {
              id: userInfo.user_id,
              name: userInfo.name,
              email: userInfo.email,
              organization_id: userInfo.organization_id
            }
          };
        }
      } catch (infoError) {
        console.warn('Could not retrieve user info:', infoError);
      }

      // Return basic connection status if user info retrieval fails
      return { connected: true };
    } catch (error) {
      console.error('Connection check error:', error);
      return { connected: false, message: error.message };
    }
  }

// Logout from Salesforce
async logout() {
  try {
    const authData = this.getAuthData();
    if (!authData) {
      return { success: true, message: 'Already logged out' };
    }

    // Clear local auth data
    this.clearAuthData();

    return { success: true, message: 'Logged out successfully' };
  } catch (error) {
    console.error('Logout error:', error);
    return { success: false, message: error.message };
  }
}

  // Transfer a lead to Salesforce using direct-lead-transfer endpoint
  async transferLead(leadData, attachments = []) {
    try {
      if (!leadData) {
        throw new Error('No lead data provided');
      }

      const authData = this.getAuthData();
      if (!authData) {
        throw new Error('Not authenticated with Salesforce');
      }

      // Use the specialized direct-lead-transfer endpoint
      const response = await fetch(`${this.apiBaseUrl}/direct-lead-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: authData.accessToken,
          instanceUrl: authData.instanceUrl,
          leadData: leadData,
          attachments: attachments
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Lead transfer error:', errorData);
        throw new Error(errorData.message || 'Failed to transfer lead');
      }

      const result = await response.json();
      return result; // { success, leadId, status, message, attachmentsTransferred }
    } catch (error) {
      console.error('Lead transfer error:', error);
      throw error;
    }
  }
}


export default SalesforceService;