import SalesforceService from "../services/SalesforceService.js";

/**
 * Controller for Salesforce Configuration modal
 * This singleton class manages the Salesforce configuration modal
 */
class SalesforceConfigController {
  constructor() {
    this.modal = document.getElementById('salesforceConfigModal');
    this.closeBtn = document.getElementById('closeSfConfigModal');
    this.saveBtn = document.getElementById('saveSfConfigBtn');
    this.resetBtn = document.getElementById('resetConfigBtn');
    this.statusMsg = document.getElementById('sf-config-status');
    
    // Form fields
    this.clientIdField = document.getElementById('sf-client-id');
    this.clientSecretField = document.getElementById('sf-client-secret');
    this.loginUrlField = document.getElementById('sf-login-url');
    this.redirectUriField = document.getElementById('sf-redirect-uri');
    
    // Default callback URL element
    this.defaultCallbackUrl = document.getElementById('default-callback-url');
    
    this.initEventListeners();
    this.loadSavedConfig();
  }

  /**
   * Get singleton instance of the controller
   * @returns {SalesforceConfigController} Singleton instance
   */
  static getInstance() {
    if (!SalesforceConfigController.instance) {
      SalesforceConfigController.instance = new SalesforceConfigController();
    }
    return SalesforceConfigController.instance;
  }

  /**
   * Initialize event listeners
   */
  initEventListeners() {
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.closeModal());
    }
    
    // Close when clicking outside modal
    window.addEventListener('click', (event) => {
      if (event.target === this.modal) {
        this.closeModal();
      }
    });
    
    // Save configuration
    if (this.saveBtn) {
      this.saveBtn.addEventListener('click', () => this.saveConfig());
    }
    
    // Reset configuration
    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', () => this.resetConfig());
    }
    
    // Set up "Configure Salesforce" button in the header
    const configBtn = document.getElementById('sfConfigButton');
    if (configBtn) {
      configBtn.addEventListener('click', () => this.openModal());
    }
    
    // Also set up any "Configure Now" buttons that might be added dynamically
    document.addEventListener('click', (event) => {
      if (event.target.id === 'configureNowBtn' ||  event.target.id === 'openConfigBtn') {
        this.openModal();
      }
    });
  }

  /**
   * Open the modal
   */
  openModal() {
    console.log('Opening Salesforce configuration modal...');
    if (this.modal) {
      this.modal.style.display = 'block';
      this.loadSavedConfig();
      this.updateDefaultCallbackUrl();
    } else {
      console.error('Modal element not found');
    }
  }

  /**
   * Close the modal
   */
  closeModal() {
    if (this.modal) {
      this.modal.style.display = 'none';
    }
  }

  /**
   * Load saved configuration from localStorage
   */
  loadSavedConfig() {
    try {
      // Get individual values for better compatibility
      const clientId = localStorage.getItem('SF_CLIENT_ID');
      const clientSecret = localStorage.getItem('SF_CLIENT_SECRET');
      const redirectUri = localStorage.getItem('SF_REDIRECT_URI');
      const loginUrl = localStorage.getItem('SF_LOGIN_URL') || 'https://login.salesforce.com';
      
      // Set form values if they exist
      if (this.clientIdField) this.clientIdField.value = clientId || '';
      if (this.clientSecretField) this.clientSecretField.value = clientSecret || '';
      if (this.redirectUriField) this.redirectUriField.value = redirectUri || '';
      if (this.loginUrlField) this.loginUrlField.value = loginUrl;
      
      this.validateFields();
    } catch (error) {
      console.error('Error loading saved config:', error);
      this.showStatus('Error loading configuration', 'error');
    }
  }

  /**
   * Update default callback URL based on environment
   */
  updateDefaultCallbackUrl() {
    if (this.defaultCallbackUrl) {
      // Determine callback URL based on configuration
      let callbackUrl;
      const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
      if (isLocalDev) {
        // In local development, use HTML page directly
        callbackUrl = `${window.location.protocol}//${window.location.hostname}:${window.location.port}/oauth-callback.html`;
      } else {
        // In production, use complete URL
        callbackUrl = `${window.location.origin}/oauth-callback.html`;
      }

      this.defaultCallbackUrl.textContent = callbackUrl;

      // Auto-fill if no value
      if (this.redirectUriField && !this.redirectUriField.value) {
        this.redirectUriField.value = callbackUrl;
      }

      console.log('Default callback URL:', callbackUrl);
    }
  }

  /* Validate form fields */
  validateFields() {
    let valid = true;
    
    // Client ID is required
    if (this.clientIdField) {
      if (!this.clientIdField.value.trim()) {
        this.clientIdField.classList.add('error');
        valid = false;
      } else {
        this.clientIdField.classList.remove('error');
      }
    }
    
    // Redirect URI is required
    if (this.redirectUriField) {
      if (!this.redirectUriField.value.trim()) {
        this.redirectUriField.classList.add('error');
        valid = false;
      } else if (!this.redirectUriField.value.startsWith('http')) {
        this.redirectUriField.classList.add('warning');
      } else {
        this.redirectUriField.classList.remove('error', 'warning');
      }
    }
    
    return valid;
  }

  /* Save configuration to localStorage */
  async saveConfig() {
    if (!this.validateFields()) {
      this.showStatus('Please fill in required fields', 'error');
      return;
    }
    
    try {
      // Check if form elements exist before accessing their value
      const clientId = this.clientIdField ? this.clientIdField.value.trim() : '';

      // Client Secret is optional for implicit flow
      const clientSecret = this.clientSecretField ? this.clientSecretField.value.trim() : '';
      const redirectUri = this.redirectUriField ? this.redirectUriField.value.trim() : '';
      const loginUrl = this.loginUrlField ? this.loginUrlField.value : 'https://login.salesforce.com';
      
      // Check Client ID format (should be long enough)
      if (clientId.length < 10) {
        this.showStatus('Client ID appears invalid (too short)', 'error');
        if (this.clientIdField) this.clientIdField.classList.add('error');
        return;
      }

      // Check that redirect URI is well-formed
      if (!redirectUri.startsWith('http')) {
        this.showStatus('Redirect URI must start with http:// or https://', 'error');
        if (this.redirectUriField) this.redirectUriField.classList.add('error');
        return;
      }

      // Show progress message
      this.showStatus('Saving configuration...', 'progress');

      // Save to localStorage
      localStorage.setItem('SF_CLIENT_ID', clientId);
      localStorage.setItem('SF_CLIENT_SECRET', clientSecret);
      localStorage.setItem('SF_REDIRECT_URI', redirectUri);
      localStorage.setItem('SF_LOGIN_URL', loginUrl);
      
      // Show success message
      this.showStatus('Configuration saved successfully!', 'success');
      
      // Update connection status indicator if possible
      try {
        const salesforceService = SalesforceService.getInstance();
        const sfConnectionStatus = document.querySelector('.sf-connection-status');
        if (sfConnectionStatus) {
          const statusIndicator = sfConnectionStatus.querySelector('.status-indicator');
          const statusText = sfConnectionStatus.querySelector('span');
          
          if (statusIndicator && statusText) {
            statusIndicator.className = 'status-indicator connecting';
            statusText.textContent = 'Checking Salesforce connection...';
          }
        }
      } catch (error) {
        console.warn('Unable to update connection status:', error);
      }
      
      // Close modal after a short delay
      setTimeout(() => {
        this.closeModal();
        
        // Reload page to apply changes
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error('Error saving configuration:', error);
      this.showStatus('Error saving configuration', 'error');
    }
  }

  /* Reset configuration */
  resetConfig() {
    try {
      localStorage.removeItem('SF_CLIENT_ID');
      localStorage.removeItem('SF_CLIENT_SECRET');
      localStorage.removeItem('SF_REDIRECT_URI');
      localStorage.removeItem('SF_LOGIN_URL');

      // Also clear authentication data
      localStorage.removeItem('SF_ACCESS_TOKEN');
      localStorage.removeItem('SF_INSTANCE_URL');
      localStorage.removeItem('SF_CLIENT_SECRET');
      
      // Clear form fields
      if (this.clientIdField) this.clientIdField.value = '';
      if (this.clientSecretField) this.clientSecretField.value = '';
      if (this.redirectUriField) this.redirectUriField.value = '';
      if (this.loginUrlField) this.loginUrlField.value = 'https://login.salesforce.com';
      
      this.showStatus('Configuration reset', 'success');
    } catch (error) {
      console.error('Error resetting config:', error);
      this.showStatus('Error resetting configuration', 'error');
    }
  }

  /**
   * Show status message
   * @param {string} message - Message to display
   * @param {string} type - Message type (success, error, progress)
   */
  showStatus(message, type = 'success') {
    if (this.statusMsg) {
      this.statusMsg.textContent = message;
      this.statusMsg.className = 'status-message';
      this.statusMsg.classList.add(`status-${type}`);
      
      // Clear message after 5 seconds for success/error, keep for progress
      if (type !== 'progress') {
        setTimeout(() => {
          this.statusMsg.textContent = '';
          this.statusMsg.className = 'status-message';
        }, 5000);
      }
    }
  }
}

export default SalesforceConfigController;