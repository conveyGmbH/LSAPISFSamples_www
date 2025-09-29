import { appConfig } from "../config/salesforceConfig.js";
import ApiService from "../services/apiService.js";


// Enhanced connection persistence manager

class ConnectionPersistenceManager {
  static CONNECTION_KEY = 'sf_connection_status';
  static USER_INFO_KEY = 'sf_user_info';
  static CONNECTED_AT_KEY = 'sf_connected_at';
  static CONNECTION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours


  static saveConnection(userInfo) {
    try {
      const orgId = localStorage.getItem('orgId') || 'default';
      const connectionData = {
        status: 'connected',
        userInfo: userInfo,
        orgId: orgId,
        connectedAt: Date.now(),
        expiresAt: Date.now() + this.CONNECTION_TIMEOUT
      };

      localStorage.setItem(this.CONNECTION_KEY, 'connected');
      localStorage.setItem(this.USER_INFO_KEY, JSON.stringify(connectionData));
      localStorage.setItem(this.CONNECTED_AT_KEY, Date.now().toString());

      console.log(`💾 Connection saved to localStorage for org ${orgId}:`, userInfo.display_name || userInfo.username);

      this.syncPendingModifications();

      return true;
    } catch (error) {
      console.error('Failed to save connection:', error);
      return false;
    }
  }

  // Sync pending lead modifications when Salesforce connection is restored
   static syncPendingModifications() {
    try {
      const eventId = sessionStorage.getItem('selectedEventId');
      if (!eventId) return;

      const storageKey = `lead_edits_${eventId}`;
      const pendingEdits = localStorage.getItem(storageKey);

      if (pendingEdits) {
        const editData = JSON.parse(pendingEdits);
        const changesCount = Object.keys(editData.changes || {}).length;

        if (changesCount > 0) {
          console.log(`Found ${changesCount} pending lead modifications to sync`);
        }
      }
    } catch (error) {
      console.error('Failed to sync pending modifications:', error);
    }
  }

  static loadConnection() {
    try {
      const status = localStorage.getItem(this.CONNECTION_KEY);
      const userInfoStr = localStorage.getItem(this.USER_INFO_KEY);
      const connectedAt = localStorage.getItem(this.CONNECTED_AT_KEY);

      if (status !== 'connected' || !userInfoStr || !connectedAt) {
        return null;
      }

      const connectionData = JSON.parse(userInfoStr);
      const connectionAge = Date.now() - parseInt(connectedAt);

      if (connectionAge > this.CONNECTION_TIMEOUT) {
        console.log('Connection expired, clearing...');
        this.clearConnection();
        return null;
      }

      return connectionData;
    } catch (error) {
      console.error('Failed to load connection:', error);
      this.clearConnection();
      return null;
    }
  }

  static clearConnection() {
    try {
      const orgId = localStorage.getItem('orgId') || 'default';
      localStorage.removeItem(this.CONNECTION_KEY);
      localStorage.removeItem(this.USER_INFO_KEY);
      localStorage.removeItem(this.CONNECTED_AT_KEY);
      // Keep orgId for next connection attempt
      console.log(`Connection cleared from localStorage for org ${orgId}`);
      return true;
    } catch (error) {
      console.error('Failed to clear connection:', error);
      return false;
    }
  }

  static isConnected() {
    const connection = this.loadConnection();
    return connection !== null;
  }

  static getUserInfo() {
    const connection = this.loadConnection();
    return connection ? connection.userInfo : null;
  }
}


// Global variables
let selectedLeadData = null;
let leadSource = null;
let isTransferInProgress = false;

// Enhanced field mapping system variables
let isLabelEditMode = false;
let fieldMappingConfig = {};


// Clean up old localStorage entries for lead data
 
function cleanupOldLeadData() {
  try {
    const prefix = 'selectedLeadData_';
    const leadDataKeys = [];

    // Find all EventId-specific lead data keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        leadDataKeys.push(key);
      }
    }

    // Sort by last modified (or keep by insertion order)
    if (leadDataKeys.length > 10) {
      const keysToRemove = leadDataKeys.slice(0, leadDataKeys.length - 10);
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        console.log(`Cleaned up old lead data: ${key}`);
      });
    }
  } catch (error) {
    console.warn('Error during localStorage cleanup:', error);
  }
}


// Enhanced connection check with proper persistence 
async function checkSalesforceConnectionWithPersistence() {
  try {
    // First, try to restore from localStorage
    const savedConnection = ConnectionPersistenceManager.loadConnection();
    
    if (savedConnection && savedConnection.userInfo) {
      console.log('Attempting to restore connection from localStorage...');
      
      // Temporarily update UI with saved connection
      updateConnectionStatus("connecting", "Restoring connection...");
      updateUserProfile(savedConnection.userInfo);
      
      // Enable buttons temporarily while verifying
      const transferBtn = document.getElementById('transferToSalesforceBtn');
      const dashboardButton = document.getElementById('dashboardButton');
      
      if (transferBtn) {
        transferBtn.disabled = false;
        transferBtn.classList.remove('disabled');
        transferBtn.title = 'Transfer lead to Salesforce';
      }
      
      if (dashboardButton) {
        dashboardButton.style.display = 'inline-flex';
        dashboardButton.disabled = false;
      }
    }

    // Verify connection with server
    updateConnectionStatus("connecting", "Verifying connection...");

    const orgId = localStorage.getItem('orgId') || 'default';
    const response = await fetch(`${appConfig.apiBaseUrl}/user`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Org-Id': orgId
      }
    });

    if (response.ok) {
      const responseData = await response.json();
      const userInfo = responseData.userInfo || responseData;

      // Store SF TOKENS for direct API calls
      if (responseData.tokens) {
        console.log('Storing Salesforce tokens for direct API access');
        localStorage.setItem('sf_access_token', responseData.tokens.access_token);
        localStorage.setItem('sf_instance_url', responseData.tokens.instance_url);
        console.log('Tokens stored successfully');
      }

      // Save the verified connection and update orgId if different
      if (userInfo.organization_id && userInfo.organization_id !== orgId) {
        localStorage.setItem('orgId', userInfo.organization_id);
      }
      ConnectionPersistenceManager.saveConnection(userInfo);

      // Update UI with verified connection
      updateConnectionStatus("connected",
        `Connected as ${userInfo.display_name || userInfo.username}`,
        userInfo);

      console.log('Salesforce connection verified and persisted');
      
    } else if (response.status === 401) {
      // 401 is expected when not authenticated
      console.log('Not authenticated with Salesforce');
      ConnectionPersistenceManager.clearConnection();
      updateConnectionStatus("not-connected", "Not connected to Salesforce");
      
    } else {
      // Other errors should be logged
      console.error("Unexpected response status:", response.status);
      ConnectionPersistenceManager.clearConnection();
      updateConnectionStatus("not-connected", "Connection error");
    }
    
  } catch (error) {
    console.error("Connection check error:", error);
    ConnectionPersistenceManager.clearConnection();
    updateConnectionStatus("not-connected", "Connection error");
  }
}

// check Instant Connection
 
function checkInstantConnection() {
  const persistedConnection = ConnectionPersistenceManager.loadConnection();

  if (persistedConnection?.userInfo &&
      persistedConnection.status === 'connected' &&
      persistedConnection.expiresAt > Date.now()) {


    // Update orgId immediately
    if (persistedConnection.orgId && persistedConnection.orgId !== 'default') {
      localStorage.setItem('orgId', persistedConnection.orgId);
    }

    // Return connection data like sessionStorage.getItem('credentials')
    return {
      isConnected: true,
      userInfo: persistedConnection.userInfo,
      orgId: persistedConnection.orgId
    };
  }

  return { isConnected: false };
}

// Function to clean N/A values from all inputs
function cleanNAValuesFromInputs() {
  console.log("🧹 Cleaning N/A values from all inputs...");

  // Get all input elements
  const allInputs = document.querySelectorAll('input, textarea, select');
  let cleanedCount = 0;

  allInputs.forEach(input => {
    if (input.value && (input.value.trim() === 'N/A' || input.value.trim() === 'n/a')) {
      input.value = '';
      cleanedCount++;
    }
  });

  console.log(`✨ Cleaned ${cleanedCount} inputs with N/A values`);
}

// Initialize controller when DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Enhanced Lead Transfer System with Salesforce validation loaded");

  const instantConnection = checkInstantConnection();
  if (instantConnection.isConnected) {

    // Immediately show connected state
    updateConnectionStatus("connected",
      `Connected as ${instantConnection.userInfo.display_name || instantConnection.userInfo.username}`,
      instantConnection.userInfo);

    displayUserInfo({
      name: instantConnection.userInfo.display_name || instantConnection.userInfo.username,
      email: instantConnection.userInfo.username,
      organization_id: instantConnection.userInfo.organization_id
    });
  }

  // Clean up old localStorage entries on startup
  cleanupOldLeadData();

  // Initialize Salesforce field mapping services
  window.salesforceFieldMapper = new SalesforceFieldMapper();
  window.fieldRenderer = new FieldRenderer(window.salesforceFieldMapper);

  
  // Initialize enhanced field mapping system
  await initializeEnhancedSystem();

  // Initialize button listeners
  initializeButtonListeners();

  // Load lead data
  loadLeadData();

  // Initialize SmartFieldManager with real API service AFTER loadLeadData
  const eventId = sessionStorage.getItem('selectedEventId');
  const serverName = sessionStorage.getItem('serverName');
  const apiName = sessionStorage.getItem('apiName');

  if (eventId && serverName && apiName) {
    window.smartFieldManager = new SmartFieldManager(eventId, serverName, apiName);
    await window.smartFieldManager.initialize();
    console.log('SmartFieldManager initialized with real database API');
  } else {
    console.warn('Missing configuration for SmartFieldManager:', {
      hasEventId: !!eventId,
      hasServerName: !!serverName,
      hasApiName: !!apiName
    });
  }

  // Check Salesforce connection with persistence
  await checkSalesforceConnectionWithPersistence();

  // Check Salesforce connection on page load for persistence
  await checkSalesforceConnection();

  // Add required styles
  addRequiredStyles();
});


/* Initialize button event listeners
 */
function initializeButtonListeners() {
  // Connect/Disconnect buttons
  document.getElementById('connectSalesforceBtn')?.addEventListener('click', handleConnectClick);
  document.getElementById('disconnectSalesforceBtn')?.addEventListener('click', handleDisconnectClick);

  // Navigation buttons with optional chaining
  document.getElementById('backButton')?.addEventListener('click', () => {
    const source = sessionStorage.getItem('selectedLeadSource') || 'Lead';
    if (source === 'LeadReport') {
      window.location.href = 'displayLsLeadReport.html';
    } else {
      window.location.href = 'displayLsLead.html';
    }
  });

  document.getElementById('dashboardButton')?.addEventListener('click', () => {
    window.location.href = 'displayDashboard.html';
  });

  // Transfer button
  const transferBtn = document.getElementById('transferToSalesforceBtn');
  if (transferBtn) {
    transferBtn.addEventListener('click', handleTransferButtonClick);
    // Enable transfer button - backend will handle connection check
    transferBtn.disabled = false;
    transferBtn.classList.remove('disabled');
    transferBtn.title = 'Transfer lead to Salesforce';
  }

  // Initially hide dashboard button - will be shown when connected
  const dashboardButton = document.getElementById('dashboardButton');
  if (dashboardButton) {
    dashboardButton.style.display = 'none';
    dashboardButton.disabled = true;
  }
}

/* Collect current values from all input fields on the page
 * @returns {Object} Current lead data from inputs
 */
function collectCurrentLeadData() {
  const currentData = {};

  // Find all field inputs with field data
  const fieldInputs = document.querySelectorAll('input.field-input, select.field-input, textarea.field-input, input[data-field-name], input[data-field]');

  fieldInputs.forEach(input => {
    // Get field name from various possible sources
    let fieldName = input.dataset.fieldName || input.dataset.field || input.name || input.id;

    // Clean up fieldName
    if (fieldName && fieldName !== 'undefined' && fieldName !== '') {
      let value = getInputValue(input);

      // Convert N/A values to empty strings
      if (value === 'N/A' || value === 'n/a') {
        value = '';
      }

      // Include all values, even empty ones for modified fields
      currentData[fieldName] = value || '';

      console.log(`📝 Field ${fieldName}: "${value}" (from ${input.tagName})`);
    }
  });

  console.log('🔄 Collected current lead data from inputs:', currentData);

  // Start with original data and override with current values
  const mergedData = { ...selectedLeadData };

  // Override only the fields that have current values
  Object.keys(currentData).forEach(fieldName => {
    mergedData[fieldName] = currentData[fieldName];
  });

  console.log('📋 Final merged data:', mergedData);

  // Apply field filtering for only active fields
  return filterConfiguredFields(mergedData);
}

/* Display user information in the interface
 * @param {Object} userInfo - User information from Salesforce
 */
function displayUserInfo(userInfo) {
  let userInfoContainer = document.getElementById("salesforceUserInfo");
  
  if (!userInfoContainer) {
    const connectionStatus = document.querySelector(".sf-connection-status");
    if (!connectionStatus) return;
    
    userInfoContainer = document.createElement("div");
    userInfoContainer.id = "salesforceUserInfo";
    userInfoContainer.className = "user-info-container";
    
    // Insert after connection status
    connectionStatus.parentNode.insertBefore(userInfoContainer, connectionStatus.nextSibling);
  }

  // Display user information
  userInfoContainer.innerHTML = `
    <div class="user-info">
      <div class="user-name">${userInfo.name}</div>
      <div class="user-email">${userInfo.email}</div>
      <div class="user-org">Org ID: ${userInfo.organization_id}</div>
    </div>
  `;
}


// Handle transfer button click
async function handleTransferButtonClick() {
  console.log("Transfer button clicked");
  if (isTransferInProgress) return;
  console.log("=== STARTING LEAD TRANSFER ===");

  const transferBtn = document.getElementById("transferToSalesforceBtn");
  const transferResults = document.getElementById("transferResults");
  const transferStatus = document.getElementById("transferStatus");

  // Connection will be checked by backend during transfer
  console.log('Starting lead transfer via backend...');

  if (!selectedLeadData) {
    showError("No lead data available for transfer.");
    return;
  }

  // Professional pre-transfer validation
  console.log(' Running pre-transfer validation...');

  // Run comprehensive Salesforce validation
  if (window.salesforceFieldMapper) {
    const validationResult = window.salesforceFieldMapper.validateLeadData(selectedLeadData);

    if (!validationResult.isValid) {
      console.error('Salesforce validation failed:', validationResult.errors);

      // Display validation errors to user
      const errorFields = Object.keys(validationResult.errors);
      const errorMessages = errorFields.map(fieldName => {
        const fieldLabel = formatFieldLabel(fieldName);
        const fieldErrors = validationResult.errors[fieldName];
        return `${fieldLabel}: ${fieldErrors.join(', ')}`;
      });

      showError(`Cannot transfer lead. Please fix the following issues:\n${errorMessages.join('\n')}`);

      // Highlight problematic fields in UI
      errorFields.forEach(fieldName => {
        const fieldElement = document.querySelector(`[data-field-name="${fieldName}"]`);
        if (fieldElement) {
          fieldElement.classList.add('validation-error');
          const inputElement = fieldElement.querySelector('.field-input');
          if (inputElement) {
            inputElement.classList.add('validation-error');
          }
        }
      });

      return;
    } else {
      console.log(' Salesforce validation passed');
    }
  }

  // Validate required fields (legacy validation as fallback)
  const requiredFields = ['LastName', 'Company'];
  const missingRequired = [];

  requiredFields.forEach(field => {
    if (!selectedLeadData[field] || !selectedLeadData[field].trim()) {
      missingRequired.push(formatFieldLabel(field));
    }
  });

  if (missingRequired.length > 0) {
    showError(`Cannot transfer lead. Missing required fields: ${missingRequired.join(', ')}`);
    return;
  }

  // Validate data integrity
  const dataValidation = validateBusinessLogic();
  if (!dataValidation.isValid) {
    showError(`Cannot transfer lead. Data validation failed: ${dataValidation.errors.join('; ')}`);
    return;
  }

  // Helper function to check if field has meaningful content
  const hasValidContent = (value) => {
    if (!value) return false;
    const trimmed = value.trim();
    return trimmed && trimmed !== 'N/A' && trimmed !== 'null' && trimmed !== 'undefined' && trimmed !== '';
  };

  // Check for potential data quality issues
  const qualityWarnings = [];

  if (!hasValidContent(selectedLeadData.Email)) {
    qualityWarnings.push('No email address provided');
  }

  if (!hasValidContent(selectedLeadData.Phone) && !hasValidContent(selectedLeadData.MobilePhone)) {
    qualityWarnings.push('No phone number provided');
  }

  if (!hasValidContent(selectedLeadData.Title)) {
    qualityWarnings.push('No job title provided');
  }

  if (qualityWarnings.length > 0) {
    // Show warning but don't block transfer
    const warningMessage = `Data quality notice: ${qualityWarnings.join(', ')}. Lead will still be transferred.`;
    showError(warningMessage);

    // Give user time to read the warning
    setTimeout(() => {}, 3000);
  }

  console.log(' Pre-transfer validation passed!');

  // Collect current values from inputs instead of using original data
  const configuredLeadData = collectCurrentLeadData();

  isTransferInProgress = true;
  transferBtn.disabled = true;
  transferBtn.innerHTML = `
    <div class="spinner"></div>
    Transferring to Salesforce...
  `;

  // Hide transfer results initially to avoid confusion
  transferResults.style.display = "none";

  try {
    // Clear previous results and show transfer results section
    transferResults.style.display = "block";
    transferStatus.innerHTML = ""; // Clear previous content

    transferStatus.innerHTML = `
      <div class="transfer-pending">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        Transferring lead to Salesforce...
      </div>
    `;

    // Save current field configuration to database before transfer
    transferStatus.innerHTML = `
      <div class="transfer-pending">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        Saving field configuration...
      </div>
    `;


    // Prepare attachments if present
    const attachments = await fetchAttachments(selectedLeadData.AttachmentIdList);

    // Update status for transfer phase
    transferStatus.innerHTML = `
      <div class="transfer-pending">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        Transferring lead to Salesforce...
      </div>
    `;

    // Transfer the lead directly to Salesforce using stored tokens
    const response = await transferLeadDirectlyToSalesforce(configuredLeadData, attachments);

    if (!response.ok) {
      const errorData = await response.json();

      // Handle specific error types
      if (response.status === 409) {
        // Duplicate lead found
        transferStatus.innerHTML = `
          <div class="status-warning">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Duplicate Lead Detected
          </div>
          <div class="status-details">
            <p><strong>Message:</strong> ${errorData.message}</p>
            <p><strong>Existing Lead ID:</strong> ${errorData.salesforceId}</p>
            ${errorData.existingLead ? `<p><strong>Existing Lead:</strong> ${errorData.existingLead.name} (${errorData.existingLead.email}) - ${errorData.existingLead.company}</p>` : ''}
          </div>
        `;
        return;
      } else if (response.status === 400) {
        // Validation errors
        const errorsList = errorData.errors ? errorData.errors.map(err => `<li>${err}</li>`).join('') : '';
        const warningsList = errorData.warnings ? errorData.warnings.map(warn => `<li>${warn}</li>`).join('') : '';

        transferStatus.innerHTML = `
          <div class="status-error">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            Validation Failed
          </div>
          <div class="status-details">
            <p><strong>Message:</strong> ${errorData.message}</p>
            ${errorsList ? `<div><strong>Errors:</strong><ul style="margin: 5px 0 0 20px;">${errorsList}</ul></div>` : ''}
            ${warningsList ? `<div><strong>Warnings:</strong><ul style="margin: 5px 0 0 20px;">${warningsList}</ul></div>` : ''}
          </div>
        `;
        return;
      }

      throw new Error(errorData.message || 'Failed to transfer lead');
    }

    const result = await response.json();

    // Show success message
    let attachmentStatus = "";
    if (attachments.length > 0) {
      attachmentStatus = `<p><strong>Attachments:</strong> ${result.attachmentsTransferred || attachments.length}/${attachments.length} transferred</p>`;
    }

    let duplicateWarning = "";
    if (result.duplicateWarning) {
      duplicateWarning = `
        <div class="status-warning" style="margin-top: 10px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <strong>Duplicate Warning:</strong> ${result.duplicateWarning.message}
            <br><small>Existing lead: ${result.duplicateWarning.existingLead.name} (${result.duplicateWarning.existingLead.email}) - ${result.duplicateWarning.existingLead.company}</small>
          </div>
        </div>
      `;
    }

    let validationWarnings = "";
    if (result.validationWarnings && result.validationWarnings.length > 0) {
      const warningsList = result.validationWarnings.map(warning => `<li>${warning}</li>`).join('');
      validationWarnings = `
        <div class="status-info" style="margin-top: 10px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <div>
            <strong>Salesforce Validation Notes:</strong>
            <ul style="margin: 5px 0 0 20px; padding: 0;">${warningsList}</ul>
          </div>
        </div>
      `;
    }

    transferStatus.innerHTML = `
      <div class="status-success">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        Lead successfully transferred to Salesforce
      </div>
      <div class="status-details">
        <p><strong>Salesforce ID:</strong> ${result.leadId}</p>
        <p><strong>Status:</strong> ${result.status}</p>
        <p><strong>Message:</strong> ${result.message || "Success"}</p>
        ${attachmentStatus}
      </div>
      ${duplicateWarning}
      ${validationWarnings}
    `;

  } catch (error) {
    console.error("Transfer error:", error);

    // Clear previous content and show error
    transferResults.style.display = "block";
    transferStatus.innerHTML = ""; // Clear previous content

    transferStatus.innerHTML = `
      <div class="status-error">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        Transfer failed: ${error.message || "Unknown error"}
      </div>
    `;
  } finally {
    // Reset button state
    isTransferInProgress = false;
    transferBtn.disabled = false;
    transferBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 5v14M19 12l-7 7-7-7"/>
      </svg>
      Transfer to Salesforce
    `;
  }
}

/* Handle disconnect button click */
async function handleDisconnectClick() {
  try {

    if (typeof showLogoutModal === 'function') {

      window.actualDisconnectFunction = () => {
        performDisconnect();
      };
      showLogoutModal();
    } else {

      if (confirm("Are you sure you want to disconnect from Salesforce?")) {
        performDisconnect();
      }
    }
  } catch (error) {
    console.error("Error during disconnect process:", error);
    showError("Failed to disconnect from Salesforce");
  }
}

// Perform the actual disconnect logic
function performDisconnect() {
  try {
    ConnectionPersistenceManager.clearConnection();
    localStorage.removeItem('orgId');
  } catch (error) {
  }

  // Step 2: Clear legacy localStorage (compatibility)
  try {
    localStorage.removeItem('SF_ACCESS_TOKEN');
    localStorage.removeItem('SF_INSTANCE_URL');
    localStorage.removeItem('sf_connection_status');
    localStorage.removeItem('sf_user_info');
  } catch (error) {
    console.warn("Error clearing legacy data:", error);
  }

  // Step 3: Update UI
  try {
    updateConnectionStatus("not-connected", "Not connected to Salesforce");
    console.log("UI updated to disconnected state");
  } catch (error) {
    console.warn("Error updating UI:", error);
  }

  // Step 3.1: Disable transfer button
  try {
    const transferBtn = document.getElementById('transferToSalesforceBtn');
    if (transferBtn) {
      transferBtn.disabled = true;
      transferBtn.classList.add('disabled');
      transferBtn.title = 'Please connect to Salesforce first';
      console.log("Transfer button disabled");
    }
  } catch (error) {
    console.warn("Error disabling transfer button:", error);
  }

  // Step 4: Clear user info display (optional)
  try {
    const userInfoContainer = document.getElementById("salesforceUserInfo");
    if (userInfoContainer) {
      userInfoContainer.innerHTML = "";
      userInfoContainer.style.display = "none";
      console.log(" User info display cleared");
    }
  } catch (error) {
    console.warn("Error clearing user info display:", error);
  }

  // Step 5: Clear server session (optional, async)
  try {
    fetch(`${appConfig.apiBaseUrl}/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    }).then(response => {
      if (response.ok) {
        console.log("Server session cleared");
      } else {
        console.warn("Failed to clear server session");
      }
    }).catch(error => {
      console.warn("Error clearing server session:", error);
    });
  } catch (error) {
    console.warn("Error initiating server logout:", error);
  }

  // Final step: Show success message
  console.log("=== SALESFORCE LOGOUT ===");

  showSuccess("Successfully disconnected from Salesforce");
}

// Handle connect button click
async function handleConnectClick() {
  try {
    // Save orgId for persistence (default to 'default' for single-org setup)
    const orgId = 'default';
    localStorage.setItem('orgId', orgId);

    // Update UI to show connecting state
    updateConnectionStatus("connecting", "Connecting to Salesforce...");

    // Open Salesforce OAuth in a popup - direct to auth endpoint
    const authUrl = `${appConfig.apiBaseUrl.replace('/api', '/auth/salesforce')}?orgId=${encodeURIComponent(orgId)}`;
    const popup = window.open(authUrl, 'salesforce-auth', 'width=600,height=700,scrollbars=yes,resizable=yes');

    // Check if popup was blocked
    if (!popup) {
      throw new Error("Popup was blocked. Please allow popups for this site.");
    }

    // Listen for OAuth success message from popup
    const messageListener = (event) => {
      if (event.data && event.data.type === 'SALESFORCE_AUTH_SUCCESS') {
        console.log(' OAuth success message received:', event.data);

        // Update orgId with the real organization ID
        const realOrgId = event.data.orgId;
        localStorage.setItem('orgId', realOrgId);
        console.log(`ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Updated orgId from 'default' to '${realOrgId}'`);

        // Close popup and check connection
        popup.close();
        clearInterval(checkClosed);
        window.removeEventListener('message', messageListener);

        // Check if authentication was successful
        checkAuthenticationStatus();
      }
    };

    window.addEventListener('message', messageListener);

    // Wait for authentication to complete
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', messageListener);
        // Check if authentication was successful
        checkAuthenticationStatus();
      }
    }, 1000);

  } catch (error) {
    console.error("Connection error:", error);
    showError("Failed to connect: " + error.message);
    updateConnectionStatus("not-connected", "Connection failed");
  }
}

// Filter fields based on configuration and apply custom field mappings
function filterConfiguredFields(leadData) {
    const filteredData = {};

    // Required fields that must always be included regardless of configuration
    const requiredFields = ['LastName', 'Company'];

    // Read-only system fields that should be excluded from transfer
    const systemFields = [
        'Id', 'CreatedDate', 'LastModifiedDate', 'CreatedById', 'LastModifiedById',
        'DeviceId', 'DeviceRecordId', 'RequestBarcode', 'EventId', 'SystemModstamp',
        'AttachmentIdList', 'IsReviewed', 'StatusMessage'
    ];

    console.log('Filtering lead data for transfer...');
    console.log('Original lead data keys:', Object.keys(leadData));

    // First, filter fields based on configuration
    const tempFilteredData = {};
    for (const [fieldName, value] of Object.entries(leadData)) {
        // Always exclude system fields
        if (systemFields.includes(fieldName)) {
            console.log(`Excluding system field: ${fieldName}`);
            continue;
        }

        // Always include required fields
        if (requiredFields.includes(fieldName)) {
            console.log(`Including required field: ${fieldName} = ${value}`);
            tempFilteredData[fieldName] = value;
            continue;
        }

        // Check if field is active in configuration
        const isFieldActive = window.fieldMappingService?.isFieldActive(fieldName);

        console.log(`Field ${fieldName}: active = ${isFieldActive}, value = ${value}`);

        // Only include fields that are explicitly active or undefined (default active)
        if (isFieldActive !== false) {
            // Include active fields, even with null/empty values
            tempFilteredData[fieldName] = value || null;
            console.log(`Including active field: ${fieldName}`);
        } else {
            console.log(`Excluding inactive field: ${fieldName}`);
        }
    }

    // Apply Salesforce transformations and field mappings
    if (window.salesforceFieldMapper && window.salesforceFieldMapper.transformForSalesforce) {
        const { transformed: salesforceData, excluded } = window.salesforceFieldMapper.transformForSalesforce(tempFilteredData);
        console.log('Applied Salesforce field transformations');
        console.log('Excluded fields:', excluded);
        Object.assign(filteredData, salesforceData);
    } else if (window.fieldMappingService?.mapFieldNamesForSalesforce) {
        // Legacy field mapping fallback
        const mappedData = window.fieldMappingService.mapFieldNamesForSalesforce(tempFilteredData);
        console.log('Applied legacy custom field mappings for Salesforce');
        Object.assign(filteredData, mappedData);
    } else {
        // Fallback: use original field names
        Object.assign(filteredData, tempFilteredData);
    }

    console.log('Final filtered data keys for transfer:', Object.keys(filteredData));
    console.log('Total fields being transferred:', Object.keys(filteredData).length);

    return filteredData;
}


/**
 * Check authentication status after popup closes
 */
async function checkAuthenticationStatus() {
  await checkSalesforceConnection();
}

// Check Salesforce connection by calling server endpoint

async function checkSalesforceConnection() {
  try {
    console.log('Checking Salesforce connection status...');

    // First check if we have valid persisted connection data
    const persistedConnection = ConnectionPersistenceManager.loadConnection();

    //  INSTANT UI RESTORATION - No server call, immediate response
    if (persistedConnection?.userInfo && persistedConnection.status === 'connected') {
      console.log('Found persisted connection data, checking validity...', {
        user: persistedConnection.userInfo.display_name,
        orgId: persistedConnection.orgId,
        connectedAt: new Date(persistedConnection.connectedAt).toLocaleString(),
        expiresAt: new Date(persistedConnection.expiresAt).toLocaleString()
      });

      // Check if connection hasn't expired (24 hours)
      if (persistedConnection.expiresAt > Date.now()) {
        console.log('Persisted connection valid - INSTANT UI restore!');

        // Update orgId from persisted data
        if (persistedConnection.orgId && persistedConnection.orgId !== 'default') {
          localStorage.setItem('orgId', persistedConnection.orgId);
        }

        // INSTANT UI RESTORATION - Show as connected immediately
        updateConnectionStatus("connected",
          `Connected as ${persistedConnection.userInfo.display_name || persistedConnection.userInfo.username} (verifying...)`,
          persistedConnection.userInfo);

        displayUserInfo({
          name: persistedConnection.userInfo.display_name || persistedConnection.userInfo.username,
          email: persistedConnection.userInfo.username,
          organization_id: persistedConnection.userInfo.organization_id
        });

        // Enable buttons immediately
        const transferBtn = document.getElementById('transferToSalesforceBtn');
        const dashboardButton = document.getElementById('dashboardButton');
        const authNotice = document.getElementById('auth-required-notice');

        if (transferBtn) {
          transferBtn.disabled = false;
          transferBtn.classList.remove('disabled');
          transferBtn.title = 'Transfer lead to Salesforce';
        }

        if (dashboardButton) {
          dashboardButton.style.display = 'inline-flex';
          dashboardButton.disabled = false;
        }

        if (authNotice) {
          authNotice.style.display = 'none';
        }

      } else {
        ConnectionPersistenceManager.clearConnection();
      }
    } else {
      console.log('No valid persisted connection found');
    }

    // Background server verification (won't override UI if already restored)
    const wasInstantlyRestored = persistedConnection?.userInfo && persistedConnection.status === 'connected' && persistedConnection.expiresAt > Date.now();

    if (!wasInstantlyRestored) {
      updateConnectionStatus("connecting", "Verifying connection...");
    }

    const orgId = localStorage.getItem('orgId') || 'default';
    console.log(`${wasInstantlyRestored ? 'Background' : 'Initial'} server verification with orgId: ${orgId}`);
    const response = await fetch(`${appConfig.apiBaseUrl}/salesforce/check`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Org-Id': orgId
      }
    });

    if (response.ok) {
      const responseData = await response.json();
      const userInfo = responseData.userInfo || responseData;
      console.log('Server connection verified:', userInfo.display_name);

      // 🔑 STORE SALESFORCE TOKENS for direct API calls
      if (responseData.tokens) {
        console.log('💾 Storing Salesforce tokens for direct API access');
        localStorage.setItem('sf_access_token', responseData.tokens.access_token);
        localStorage.setItem('sf_instance_url', responseData.tokens.instance_url);
        console.log('✅ Tokens stored successfully');
      }

      // Save the verified connection and update orgId if different
      if (userInfo.organization_id && userInfo.organization_id !== orgId) {
        localStorage.setItem('orgId', userInfo.organization_id);
        console.log(`Updated orgId: ${orgId} organization_id ${userInfo.organization_id}`);
      }
      ConnectionPersistenceManager.saveConnection(userInfo);

      if (wasInstantlyRestored) {
        // Just quietly update the status to remove "(verifying...)"
        console.log('Background verification complete - updating status silently');
        updateConnectionStatus("connected",
          `Connected as ${userInfo.display_name || userInfo.username}`,
          userInfo);
      } else {
        // Full UI update for new connections
        updateConnectionStatus("connected",
          `Connected as ${userInfo.display_name || userInfo.username}`,
          userInfo);

        displayUserInfo({
          name: userInfo.display_name || userInfo.username,
          email: userInfo.username,
          organization_id: userInfo.organization_id
        });
      }

    } else if (response.status === 401) {
      ConnectionPersistenceManager.clearConnection();
      updateConnectionStatus("not-connected", "Not connected to Salesforce");

    } else {
      console.error(" Unexpected response status:", response.status);
      ConnectionPersistenceManager.clearConnection();
      updateConnectionStatus("not-connected", "Connection error");
    }
  } catch (error) {
    console.error(" Connection check error:", error);
    ConnectionPersistenceManager.clearConnection();
    updateConnectionStatus("not-connected", "Connection error");
  }
}


/**
 * Afficher les données de lead avec système d'édition inline
 */
function displayLeadData(data) {
    
    const leadDataContainer = document.getElementById("leadData");
    if (!leadDataContainer) {
        console.error('Lead data container not found');
        return;
    }

    leadDataContainer.innerHTML = "";

    if (!data || Object.keys(data).length === 0) {
        leadDataContainer.innerHTML = '<div class="no-data">No lead data available</div>';
        return;
    }

    // Traiter les données avec les labels personnalisés
    const processedData = window.fieldMappingService?.applyCustomLabels(data) || 
        Object.fromEntries(Object.entries(data).map(([key, value]) => [key, { 
            value, 
            label: formatFieldLabel(key), 
            active: true 
        }]));

    // Créer la grille d'informations
    const infoGrid = document.createElement("div");
    infoGrid.className = "lead-info-grid";

    // Filtrer et afficher les champs selon leur statut
    const filterValue = document.getElementById('field-display-filter')?.value || 'all';
    
    Object.keys(processedData).forEach((fieldName) => {
        const fieldInfo = processedData[fieldName];

        // Appliquer le filtre
        if (filterValue === 'active' && !fieldInfo.active) return;
        if (filterValue === 'inactive' && fieldInfo.active) return;

        // Exclure les champs système
        if (isSystemField(fieldName)) return;

        const fieldElement = createFieldElement(fieldName, fieldInfo);
        infoGrid.appendChild(fieldElement);
    });

    leadDataContainer.appendChild(infoGrid);

    // Mettre à jour les statistiques
    setTimeout(() => updateFieldStats(), 100);

    // Clean N/A values from all inputs after data is displayed
    setTimeout(() => cleanNAValuesFromInputs(), 200);
}


function isSystemField(fieldName) {
    const systemFields = [
        '__metadata', 'KontaktViewId', 'Id', 'CreatedDate', 'LastModifiedDate', 
        'CreatedById', 'LastModifiedById', 'SystemModstamp', 'DeviceId', 
        'DeviceRecordId', 'EventId', 'RequestBarcode', 'StatusMessage'
    ];
    return systemFields.includes(fieldName);
}



// 3.  fonction principale pour créer un élément de champ
function createFieldElement(fieldName, fieldInfo) {
    const fieldElement = document.createElement("div");
    fieldElement.className = `lead-field ${fieldInfo.active ? '' : 'field-inactive'}`;
    fieldElement.dataset.fieldName = fieldName;

    // Configuration Salesforce pour le champ
    const salesforceConfig = getSalesforceFieldConfig(fieldName);
    
    // Header du champ
    const fieldHeader = createFieldHeader(fieldName, fieldInfo.label, salesforceConfig);
    
    // Contenu du champ avec logique d'édition
    const fieldContent = createFieldContent(fieldName, fieldInfo.value, salesforceConfig);
    
    // Footer avec toggle actif/inactif
    const fieldFooter = createFieldFooter(fieldName, fieldInfo.active);

    fieldElement.appendChild(fieldHeader);
    fieldElement.appendChild(fieldContent);
    fieldElement.appendChild(fieldFooter);

    return fieldElement;
}

// 4. Créer le header du champ
function createFieldHeader(fieldName, label, config) {
    const header = document.createElement("div");
    header.className = "field-header";

    const labelContainer = document.createElement("div");
    labelContainer.className = "field-label-container";

    const labelText = document.createElement("span");
    labelText.className = "field-label";
    labelText.textContent = label;

    // Ajouter indicateur requis
    if (config.required) {
        labelText.innerHTML += ' <span class="required-indicator">*</span>';
    }

    const apiName = document.createElement("div");
    apiName.className = "field-api-name";
    apiName.textContent = `${fieldName} (${config.type})`;

    labelContainer.appendChild(labelText);
    labelContainer.appendChild(apiName);

    // Container pour les actions à droite
    const actionsContainer = document.createElement("div");
    actionsContainer.className = "field-actions-container";

    // Ajouter indicateur READ-ONLY pour les champs non éditables (à droite)
    const readOnlyFields = [
        'Id', 'CreatedDate', 'LastModifiedDate', 'CreatedById', 'LastModifiedById',
        'RequestBarcode', 'AttachmentIdList', 'DeviceRecordId', 'DeviceId',
        'EventId', 'SystemModstamp'
    ];

    if (readOnlyFields.includes(fieldName)) {
        const readOnlyIndicator = document.createElement("span");
        readOnlyIndicator.className = "read-only-indicator";
        readOnlyIndicator.innerHTML = '🔒 READ-ONLY';
        actionsContainer.appendChild(readOnlyIndicator);
    }

    // Bouton d'édition du label
    const editLabelBtn = document.createElement("button");
    editLabelBtn.className = "edit-label-btn";
    editLabelBtn.innerHTML = '✏️';
    editLabelBtn.title = 'Edit field label';
    editLabelBtn.onclick = () => openEditLabelModal(fieldName);
    actionsContainer.appendChild(editLabelBtn);

    header.appendChild(labelContainer);
    header.appendChild(actionsContainer);

    return header;
}

function createFieldContent(fieldName, value, config) {
    const content = document.createElement("div");
    content.className = "field-content";

    const displayContainer = createDisplayWithEditIcon(fieldName, value, config);
    content.appendChild(displayContainer);

    const errorElement = document.createElement("div");
    errorElement.className = "field-error";
    errorElement.id = `error-${fieldName}`;
    content.appendChild(errorElement);

    return content;
}

// Créer un input selon le type Salesforce
function createSalesforceInput(fieldName, value, config) {
    let input;
    
    switch (config.type) {
        case 'Picklist':
            input = createPicklistInput(fieldName, value, config);
            break;
        case 'Email':
            input = createEmailInput(fieldName, value);
            break;
        case 'Phone':
            input = createPhoneInput(fieldName, value);
            break;
        case 'Url':
            input = createUrlInput(fieldName, value);
            break;
        case 'TextArea':
        case 'LongTextArea':
            input = createTextAreaInput(fieldName, value, config);
            break;
        case 'Checkbox':
            input = createCheckboxInput(fieldName, value);
            break;
        case 'DateTime':
            input = createTextInput(fieldName, value, config);
            break;
        default:
            input = createTextInput(fieldName, value, config);
    }

    input.className += ' field-input';
    input.dataset.fieldName = fieldName;
    
    // ✅ ESSENTIEL: Ajouter les événements de sauvegarde
    addSaveEvents(input, fieldName);
    
    return input;
}



function createPicklistInput(fieldName, value, config) {
    const select = document.createElement('select');
    select.className = 'field-input';
    
    // Options selon le champ
    const options = getPicklistOptions(fieldName);
    
    // Option vide si pas requis
    if (!config.required) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-- Select --';
        select.appendChild(emptyOption);
    }
    
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option;
        optionElement.textContent = option;
        if (value === option) {
            optionElement.selected = true;
        }
        select.appendChild(optionElement);
    });
    
    return select;
}

function createEmailInput(fieldName, value) {
    const input = document.createElement('input');
    input.type = 'email';
    input.className = 'field-input';
    input.value = value || '';
    input.placeholder = 'email@example.com';
    addSaveEvents(input, fieldName);
    return input;
}

function createPhoneInput(fieldName, value) {
    const input = document.createElement('input');
    input.type = 'tel';
    input.className = 'field-input';
    input.value = value || '';
    input.placeholder = '+49 123 456789';
    addSaveEvents(input, fieldName);
    return input;
}

function createTextAreaInput(fieldName, value, config) {
    const textarea = document.createElement('textarea');
    textarea.className = 'field-input';
    textarea.value = value || '';
    textarea.rows = config.type === 'LongTextArea' ? 6 : 3;
    textarea.placeholder = `Enter ${fieldName}`;
    return textarea;
}

function createCheckboxInput(fieldName, value) {
    const container = document.createElement('div');
    container.className = 'checkbox-container field-input';
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value === true || value === 1 || value === '1';
    
    const label = document.createElement('label');
    label.textContent = 'Yes';
    
    container.appendChild(input);
    container.appendChild(label);
    
    return container;
}

function createTextInput(fieldName, value, config) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'field-input';
    input.value = value || '';
    input.placeholder = `Enter ${fieldName}`;
    
    if (config.maxLength) {
        input.maxLength = config.maxLength;
    }
    
    return input;
}

function isAlwaysEditable(fieldName) {
    const alwaysEditable = [
        'Description', 'Title', 'Department', 'Industry', 'SalesArea'
    ];
    return alwaysEditable.includes(fieldName);
}


function createFieldFooter(fieldName, isActive) {
    const footer = document.createElement("div");
    footer.className = "field-footer";
    
    const toggleContainer = document.createElement("label");
    toggleContainer.className = "toggle-switch";
    
    const toggleInput = document.createElement("input");
    toggleInput.type = "checkbox";
    toggleInput.checked = isActive !== false;
    toggleInput.addEventListener('change', () => {
        toggleFieldActive(fieldName, toggleInput.checked);
    });
    
    const slider = document.createElement("span");
    slider.className = "slider";
    
    toggleContainer.appendChild(toggleInput);
    toggleContainer.appendChild(slider);
    
    const statusText = document.createElement("span");
    statusText.className = "field-status";
    statusText.textContent = isActive !== false ? "Active" : "Inactive";
    
    footer.appendChild(toggleContainer);
    footer.appendChild(statusText);
    
    return footer;
}

function addRequiredStyles() {
    if (document.getElementById('lead-editing-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'lead-editing-styles';
    style.textContent = `
        .lead-field {
            border: 1px solid #e5e5e5;
            border-radius: 8px;
            padding: 16px;
            background: white;
            margin-bottom: 16px;
            transition: all 0.2s ease;
        }
        
        .lead-field.field-saved {
            border-color: #10b981;
            box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.1);
            animation: saveFlash 0.5s ease;
        }
        
        @keyframes saveFlash {
            0% { background-color: rgba(16, 185, 129, 0.1); }
            100% { background-color: white; }
        }
        
        .field-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 12px;
        }
        
        .field-label {
            font-weight: 600;
            color: #1f2937;
            font-size: 14px;
        }
        
        .required-indicator {
            color: #ef4444;
            font-weight: bold;
        }
        
        .field-api-name {
            font-size: 12px;
            color: #6b7280;
            margin-top: 2px;
        }
        
        .edit-label-btn {
            background: none;
            border: none;
            cursor: pointer;
            opacity: 0.7;
            transition: opacity 0.2s;
            padding: 4px;
            border-radius: 4px;
        }
        
        .edit-label-btn:hover {
            opacity: 1;
            background: #f3f4f6;
        }
        
        .field-content {
            margin-bottom: 12px;
        }
        
        .field-display-container {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .field-display-value {
            flex: 1;
            padding: 8px 12px;
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            min-height: 20px;
        }
        
        .field-edit-icon {
            background: none;
            border: none;
            cursor: pointer;
            opacity: 0.7;
            transition: all 0.2s;
            padding: 6px;
            border-radius: 4px;
        }
        
        .field-edit-icon:hover {
            opacity: 1;
            background: #f3f4f6;
        }
        
        .field-input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
            transition: border-color 0.2s;
            box-sizing: border-box;
        }
        
        .field-input:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        
        .field-error {
            color: #ef4444;
            font-size: 12px;
            margin-top: 4px;
            display: none;
        }
        
        .field-error.show {
            display: block;
        }
        
        .checkbox-container {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 0;
        }
        
        .lead-info-grid {
            display: grid;
            gap: 16px;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        }
    `;
    
    document.head.appendChild(style);
}


// Configuration Salesforce étendue pour Lead + LeadReport

function getSalesforceFieldConfig(fieldName) {
    if (fieldName.match(/^(Question|Answers|Text)\d{2}$/)) {
        if (fieldName.startsWith('Question') || fieldName.startsWith('Answers')) {
            return { type: 'Text', required: false, maxLength: 255 };
        } else {
            return { type: 'LongTextArea', required: false };
        }
    }
    
    // Configuration standard pour Lead
    const configs = {
        'Salutation': { type: 'Picklist', required: false },
        'FirstName': { type: 'Text', required: false, maxLength: 40 },
        'LastName': { type: 'Text', required: true, maxLength: 80 },
        'Company': { type: 'Text', required: true, maxLength: 255 },
        'Email': { type: 'Email', required: false },
        'Phone': { type: 'Phone', required: false },
        'MobilePhone': { type: 'Phone', required: false },
        'Fax': { type: 'Phone', required: false },
        'Website': { type: 'Url', required: false },
        'Title': { type: 'Text', required: false, maxLength: 128 },
        'Description': { type: 'LongTextArea', required: false },
        'Industry': { type: 'Picklist', required: false },
        'Department': { type: 'Text', required: false, maxLength: 80 },
        'Street': { type: 'TextArea', required: false },
        'City': { type: 'Text', required: false, maxLength: 40 },
        'State': { type: 'Text', required: false, maxLength: 80 },
        'Country': { type: 'Text', required: false, maxLength: 80 },
        'PostalCode': { type: 'Text', required: false, maxLength: 20 },
        'CountryCode': { type: 'Picklist', required: false },
        'IsReviewed': { type: 'Checkbox', required: false },
        'SalesArea': { type: 'Text', required: false, maxLength: 255 },
        'Suffix': { type: 'Text', required: false, maxLength: 40 },
        'MiddleName': { type: 'Text', required: false, maxLength: 40 }
    };
    
    return configs[fieldName] || { type: 'Text', required: false };
}

function getPicklistOptions(fieldName) {
    const options = {
        'Salutation': ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.'],
        'Industry': [
            'Agriculture', 'Banking', 'Biotechnology', 'Chemicals', 'Communications',
            'Construction', 'Consulting', 'Education', 'Electronics', 'Energy',
            'Engineering', 'Entertainment', 'Finance', 'Healthcare', 'Insurance',
            'Manufacturing', 'Media', 'Technology', 'Transportation', 'Other'
        ],
        'CountryCode': ['DE', 'US', 'GB', 'FR', 'IT', 'ES', 'NL', 'BE', 'CH', 'AT']
    };
    
    return options[fieldName] || [];
}

// Gestion des événements et sauvegarde
function addSaveEvents(input, fieldName) {
    // Sauvegarde lors du changement de valeur
    input.addEventListener('change', () => {
        const value = getInputValue(input);
        console.log(`💾 Field ${fieldName} changed to:`, value);
        saveFieldValue(fieldName, value);
    });
    
    // Sauvegarde lors de la perte de focus
    input.addEventListener('blur', () => {
        const value = getInputValue(input);
        saveFieldValue(fieldName, value);
    });
    
    // Validation en temps réel
    input.addEventListener('input', () => {
        const value = getInputValue(input);
        validateField(fieldName, value);
    });
}


/**
 * Transfer lead directly to Salesforce using stored tokens
 * @param {Object} leadData - Lead data to transfer
 * @param {Array} attachments - Attachments array
 * @returns {Object} Response-like object
 */
async function transferLeadDirectlyToSalesforce(leadData, attachments) {
  try {
    console.log('Transferring lead via backend to Salesforce...');
    console.log('Lead data:', leadData);
    console.log('Attachments count:', attachments.length);

    // Get current API base URL from config
    const appConfig = window.salesforceConfig || { apiBaseUrl: 'http://localhost:3000/api' };

    // Prepare lead data for backend API
    const salesforceLeadData = {
      LastName: leadData.LastName,
      FirstName: leadData.FirstName || null,
      Company: leadData.Company,
      Title: leadData.Title || null,
      Phone: leadData.Phone || null,
      MobilePhone: leadData.MobilePhone || null,
      Fax: leadData.Fax || null,
      Email: leadData.Email || null,
      Website: leadData.Website || null,
      Street: leadData.Street || null,
      City: leadData.City || null,
      State: leadData.State || null,
      PostalCode: leadData.PostalCode || null,
      Country: leadData.Country || null,
      CountryCode: leadData.CountryCode || null,
      Description: leadData.Description || null,
      Industry: leadData.Industry || null,
      Salutation: leadData.Salutation || null,
      Department__c: leadData.Department || null,
    };

    // Remove null/empty values
    Object.keys(salesforceLeadData).forEach(key => {
      if (salesforceLeadData[key] === null || salesforceLeadData[key] === '' || salesforceLeadData[key] === 'N/A') {
        delete salesforceLeadData[key];
      }
    });

    console.log('Transfer payload:', salesforceLeadData);

    // Make call to backend API which handles Salesforce transfer
    const apiUrl = `${appConfig.apiBaseUrl}/salesforce/leads`;
    console.log('Making API call to backend:', apiUrl);

    // Prepare payload for backend API
    const payload = {
      leadData: salesforceLeadData,
      attachments: attachments
    };

    const salesforceResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    console.log('API Response status:', salesforceResponse.status, salesforceResponse.statusText);

    if (!salesforceResponse.ok) {
      const errorData = await salesforceResponse.json();
      console.error('Backend API error:', errorData);

      // Return response-like object with error info
      return {
        ok: false,
        status: salesforceResponse.status,
        json: async () => errorData
      };
    }

    const result = await salesforceResponse.json();
    console.log('Lead transferred via backend:', result);

    // Return a response-like object compatible with existing code
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: result.success,
        leadId: result.salesforceId,
        message: result.message || 'Lead transferred successfully',
        attachmentsTransferred: result.attachments ? result.attachments.filter(a => a.success).length : 0,
        duplicateWarning: result.duplicateWarning || null,
        status: result.success ? 'success' : 'failed',
        validationWarnings: result.validationWarnings || []
      })
    };

  } catch (error) {
    console.error('Direct transfer error:', error);

    // Return error response compatible with existing code
    return {
      ok: false,
      status: 500,
      json: async () => ({
        success: false,
        message: error.message
      })
    };
  }
}

/**
 * Transform null values from API to appropriate defaults
 * @param {Object} data - Lead data with potential null values
 * @returns {Object} Transformed data with defaults
 */
function transformNullValues(data) {
    const transformed = { ...data };

    // Define default values for common fields
    const defaultValues = {
        Email: '',  // Empty string instead of null for email
        FirstName: '',
        LastName: '',
        Company: '',
        Phone: '',
        MobilePhone: '',
        Street: '',
        City: '',
        PostalCode: '',
        Country: '',
        CountryCode: '',
        State: '',
        Title: '',
        Description: '',
        Website: '',
        Fax: '',
        Industry: '',
        Salutation: '',
        Department: ''
    };

    // Transform null values and N/A values to defaults
    Object.keys(defaultValues).forEach(field => {
        if (transformed[field] === null ||
            transformed[field] === undefined ||
            transformed[field] === 'N/A' ||
            transformed[field] === 'n/a') {
            transformed[field] = defaultValues[field];
            console.log(`Transformed ${field}: null/N/A → "${defaultValues[field]}"`);
        }
    });

    // Also check all fields for N/A values, not just the predefined ones
    Object.keys(transformed).forEach(field => {
        if (transformed[field] === 'N/A' || transformed[field] === 'n/a') {
            transformed[field] = '';
            console.log(`🧹 Cleaned ${field}: N/A → empty string`);
        }
    });

    return transformed;
}

/**
 * Load and display lead data from session storage with proper error handling
 */
async function loadLeadData() {
    try {
        const leadDataStr = sessionStorage.getItem("selectedLeadData");
        const eventId = sessionStorage.getItem("selectedEventId");
        leadSource = sessionStorage.getItem("selectedLeadSource");

        // Validate required data
        if (!leadDataStr || !leadSource) {
            showError("No lead data found. Please select a lead first.");
            setTimeout(() => {
                window.location.href = leadSource === "LeadReport"
                    ? "displayLsLeadReport.html"
                    : "displayLsLead.html";
            }, 2000);
            return;
        }

        // Parse lead data
        selectedLeadData = JSON.parse(leadDataStr);

        // Transform null values to appropriate defaults
        selectedLeadData = transformNullValues(selectedLeadData);

        // Load and merge field updates from LS_FieldMappings database
        let dataWasUpdated = false;
        if (eventId) {
            try {
                console.log(`Loading saved field values from LS_FieldMappings for EventId: ${eventId}`);

                // Create temporary SmartFieldManager to access saved field values
                const serverName = sessionStorage.getItem('serverName');
                const apiName = sessionStorage.getItem('apiName');

                if (serverName && apiName) {
                    const tempFieldManager = new SmartFieldManager(eventId, serverName, apiName);
                    const existingConfig = await tempFieldManager.loadExistingConfigData();

                    if (existingConfig && existingConfig.configData && existingConfig.configData.fieldValues) {
                        const savedFieldValues = existingConfig.configData.fieldValues;
                        console.log(` Found saved field values in LS_FieldMappings for EventId: ${eventId}`);
                        console.log('Â Saved field values:', savedFieldValues);

                        // Merge saved field values with original data
                        Object.assign(selectedLeadData, savedFieldValues);

                        console.log('ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Data merged with saved field values from LS_FieldMappings');
                        console.log('ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Final data sample:', {
                            Title: selectedLeadData.Title,
                            FirstName: selectedLeadData.FirstName,
                            LastName: selectedLeadData.LastName,
                            Email: selectedLeadData.Email
                        });

                        // Mark that data was updated from DB
                        dataWasUpdated = true;
                    } else {
                        console.log(`No saved field values found in LS_FieldMappings for EventId: ${eventId}`);
                    }
                } else {
                    console.warn(' Missing serverName or apiName for loading field values');
                }
            } catch (error) {
                console.warn(' Error loading field values from LS_FieldMappings, trying localStorage fallback:', error.message);

                try {
                    const storageKey = `selectedLeadData_${eventId}`;
                    const savedData = localStorage.getItem(storageKey);
                    if (savedData) {
                        const parsedData = JSON.parse(savedData);
                        console.log(`Â¦ Found saved data in localStorage for EventId: ${eventId}`);

                        // Merge only the updated fields, keep original structure
                        Object.keys(parsedData).forEach(key => {
                            if (parsedData[key] !== selectedLeadData[key]) {
                                selectedLeadData[key] = parsedData[key];
                            }
                        });

                        console.log(' Data merged from localStorage fallback');

                        // Mark that data was updated from localStorage
                        dataWasUpdated = true;
                    } else {
                        console.log(`Â­ No localStorage backup found for EventId: ${eventId}`);
                    }
                } catch (localError) {
                    console.warn(' Error loading from localStorage fallback:', localError);
                }
            }
        } else {
            console.log(' No EventId available for loading field updates');
        }

        console.log(' Available data:', {
            hasFieldMappingService: !!window.fieldMappingService,
            eventId: eventId,
            leadDataKeys: Object.keys(selectedLeadData).slice(0, 10)
        });


        if (window.fieldMappingService && eventId) {
            window.fieldMappingService.setCurrentEventId(eventId);
            console.log(' Event ID set in FieldMappingService:', eventId);
        } else {
            console.log('Missing requirements for field mapping:', {
                hasService: !!window.fieldMappingService,
                hasEventId: !!eventId
            });
        }
        
        // Update source display
        const leadSourceElement = document.getElementById("leadSource");
        if (leadSourceElement) {
            leadSourceElement.textContent = leadSource === "LeadReport" ? "Lead Report" : "Lead";
        }

        // Initialize field mapping service if available and WAIT for it before displaying data
        if (window.fieldMappingService && typeof window.fieldMappingService.initializeFields === 'function') {
            try {
                console.log('DEBUG RELOAD: Initializing field mapping service with API...');

                // Add timeout to prevent infinite loading
                const initPromise = window.fieldMappingService.initializeFields(selectedLeadData, eventId);

                if (initPromise && typeof initPromise.then === 'function') {
                    // It's a Promise, wait for it with timeout
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Field mapping initialization timeout')), 10000)
                    );

                    await Promise.race([initPromise, timeoutPromise]);
                    console.log('Field mappings loaded from API successfully');
                } else {
                    // It's synchronous, just continue
                    console.log('Field mappings initialized synchronously');
                }

            } catch (apiError) {
                console.error('Failed to load field mappings from API:', apiError);
                // Continue with local/default configuration
                console.log('Falling back to local configuration');

                // Ensure basic field mapping is available
                if (window.fieldMappingService.initializeFields) {
                    try {
                        window.fieldMappingService.initializeFields(selectedLeadData);
                    } catch (fallbackError) {
                        console.error('Even fallback initialization failed:', fallbackError);
                    }
                }
            }
        } else {
            console.warn('Field mapping service not available or initializeFields method missing');
        }

        // Display lead data AFTER field mappings are loaded
        // This ensures custom labels and configurations are applied correctly
        if (dataWasUpdated) {
            console.log('Displaying lead data with merged field updates...');
        } else {
            console.log('Displaying lead data with original API data...');
        }
        displayLeadData(selectedLeadData);

        // Load any previously saved local changes (priority over API/database data)
        loadSavedChanges();

        // Stats will be updated after displayLeadData completes

        displayAttachmentsPreview();


    } catch (error) {
        console.error("Error loading lead data:", error);
        showError("Error loading lead data: " + error.message);
        
        // Fallback: try to display what we can
        if (selectedLeadData) {
            try {
                displayLeadData(selectedLeadData);
                // Stats will be updated after displayLeadData completes
            } catch (displayError) {
                console.error("Failed to display lead data:", displayError);
            }
        }
    }
}

/**
 * Create an enhanced field element with management controls
 * @param {string} fieldName - Field API name
 * @param {Object} fieldInfo - Field information including value, label, and active status
 * @returns {HTMLElement} Enhanced field element
 */

// function createEnhancedFieldElement(fieldName, fieldInfo) {
//     const fieldElement = document.createElement("div");
//     fieldElement.className = `lead-field salesforce-enhanced ${fieldInfo.active ? '' : 'field-inactive'}`;
//     fieldElement.dataset.fieldName = fieldName;

//     const fieldConfig = window.fieldMappingService?.getFieldConfig(fieldName) || { active: true };
//     const salesforceConfig = window.salesforceFieldMapper?.getFieldConfig(fieldName) || {};

//     // Header avec le bouton edit et les badges Salesforce
//     const fieldHeader = document.createElement("div");
//     fieldHeader.className = "field-header";

//     const labelContainer = document.createElement("div");
//     labelContainer.className = "field-label-container";

//     const labelText = document.createElement("span");
//     labelText.className = "field-label";
//     labelText.textContent = fieldInfo.label;

//     // Ajouter l'indicateur de type Salesforce
//     if (salesforceConfig.required) {
//         labelText.innerHTML += ' <span class="required-indicator">*</span>';
//     }

//     const apiNameElement = document.createElement("div");
//     apiNameElement.className = "field-api-name";
//     apiNameElement.textContent = `${fieldName} (${salesforceConfig.type || 'Text'})`;

//     labelContainer.appendChild(labelText);
//     labelContainer.appendChild(apiNameElement);

//     // Bouton edit ÃƒÆ’Ã†â€™  droite
//     const editLabelBtn = document.createElement("button");
//     editLabelBtn.className = "icon-btn edit-label-btn";
//     editLabelBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
//     editLabelBtn.addEventListener('click', (e) => {
//         e.stopPropagation();
//         openEditLabelModal(fieldName);
//     });

//     fieldHeader.appendChild(labelContainer);
//     fieldHeader.appendChild(editLabelBtn);

//     // Conteneur pour la valeur avec rendu Salesforce
//     const fieldContent = document.createElement("div");
//     fieldContent.className = "field-content";

//     const valueElement = document.createElement("div");
//     valueElement.className = "field-value";
//     valueElement.textContent = fieldInfo.value || "N/A";

//     // Create Salesforce-aware input for edit mode
//     let inputElement;
//     if (window.fieldRenderer) {
//         inputElement = window.fieldRenderer.createFieldInput(fieldName, fieldInfo.value || "", false);
//     } else {
//         // Fallback to generic input if Salesforce services not loaded
//         inputElement = createInputElement(fieldName, fieldInfo.value || "");
//     }

//     // Ensure the input has the correct class for edit mode functions
//     inputElement.classList.add('field-input');

//     // Determine display mode based on field value
//     const isDirectlyEditable = isFieldDirectlyEditable(fieldName, fieldInfo.value);

//     if (isDirectlyEditable) {
//       // Show input directly for empty/null fields
//       inputElement.style.display = "block";
//       valueElement.style.display = "none";
//       inputElement.placeholder = `Enter ${fieldName}`;

//       // Add auto-save event listeners
//       inputElement.addEventListener('blur', () => {
//         saveFieldValue(fieldName, inputElement.value);
//       });

//       inputElement.addEventListener('keydown', (e) => {
//         if (e.key === 'Enter') {
//           e.preventDefault();
//           saveFieldValue(fieldName, inputElement.value);
//           inputElement.blur(); // Remove focus
//         }
//       });

//     } else {
//       // Show value with edit icon for non-empty fields
//       inputElement.style.display = "none";
//       valueElement.style.display = "block";
//     }

//     // Add error message element
//     const errorElement = document.createElement("div");
//     errorElement.className = "field-error";
//     errorElement.id = `error-${fieldName}`;

//     // Field footer with toggle switch
//     const fieldFooter = document.createElement("div");
//     fieldFooter.className = "field-footer";
    
//     const toggleContainer = document.createElement("label");
//     toggleContainer.className = "toggle-switch";
    
//     const toggleInput = document.createElement("input");
//     toggleInput.type = "checkbox";
//     toggleInput.className = "field-toggle";
//     toggleInput.checked = fieldConfig.active !== false;
//     toggleInput.addEventListener('change', () => {
//         toggleFieldActive(fieldName, toggleInput.checked);
//     });
    
//     const toggleSlider = document.createElement("span");
//     toggleSlider.className = "slider";
    
//     toggleContainer.appendChild(toggleInput);
//     toggleContainer.appendChild(toggleSlider);
    
//     const statusText = document.createElement("span");
//     statusText.className = "field-status";
//     statusText.textContent = fieldConfig.active !== false ? "Active" : "Inactive";
    
//     fieldFooter.appendChild(toggleContainer);
//     fieldFooter.appendChild(statusText);

//     // Ajouter les indicateurs de statut Salesforce
//     if (window.fieldRenderer) {
//         const statusIndicator = window.fieldRenderer.createFieldStatusIndicator(fieldName);
//         fieldContent.appendChild(statusIndicator);
//     }

//     // Create container for value and edit icon
//     const valueContainer = document.createElement('div');
//     valueContainer.className = 'field-value-container';

//     valueContainer.appendChild(valueElement);

//     // Add edit icon for non-empty fields
//     if (!isDirectlyEditable) {
//       const editIcon = createEditIcon(fieldName);
//       valueContainer.appendChild(editIcon);
//     }

//     fieldContent.appendChild(valueContainer);
//     fieldContent.appendChild(inputElement);
//     fieldContent.appendChild(errorElement);

//     fieldElement.appendChild(fieldHeader);
//     fieldElement.appendChild(fieldContent);
//     fieldElement.appendChild(fieldFooter);

//     return fieldElement;
// }



/**
 * Create input element for edit mode
 * @param {string} fieldName - Field name
 * @param {string} value - Field value
 * @returns {HTMLElement} Input element
 */
// function createInputElement(fieldName, value) {
//   const readOnlyFields = [
//     "Id",
//     "CreatedDate",
//     "LastModifiedDate",
//     "CreatedById",
//     "LastModifiedById",
//     "DeviceId",
//     "DeviceRecordId",
//     "RequestBarcode",
//     "EventId",
//     "SystemModstamp",
//     "AttachmentIdList",
//     "IsReviewed",
//     "StatusMessage",
//   ];

//   // Define editable fields with professional validation rules
//   const editableFields = {
//     // Personal Information
//     Salutation: {
//       type: "select",
//       options: ["Mr.", "Ms.", "Mrs.", "Dr.", "Prof.", "Sir", "Madam"],
//       maxLength: 40,
//     },
//     FirstName: { type: "text", maxLength: 40 },
//     MiddleName: { type: "text", maxLength: 40 },
//     LastName: { type: "text", maxLength: 80, required: true },
//     Suffix: { type: "text", maxLength: 40 },

//     // Contact Information
//     Email: {
//       type: "email",
//       maxLength: 128,
//       pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
//     },
//     Phone: { type: "tel", maxLength: 40 },
//     MobilePhone: { type: "tel", maxLength: 40 },
//     Fax: { type: "tel", maxLength: 40 },
//     Website: { type: "url", maxLength: 255 },

//     // Company Information
//     Company: { type: "text", maxLength: 255, required: true },
//     Title: { type: "text", maxLength: 128 },
//     Industry: {
//       type: "select",
//       options: [
//         "Agriculture",
//         "Apparel",
//         "Banking",
//         "Biotechnology",
//         "Chemicals",
//         "Communications",
//         "Construction",
//         "Consulting",
//         "Education",
//         "Electronics",
//         "Energy",
//         "Engineering",
//         "Entertainment",
//         "Environmental",
//         "Finance",
//         "Food & Beverage",
//         "Government",
//         "Healthcare",
//         "Hospitality",
//         "Insurance",
//         "Machinery",
//         "Manufacturing",
       
//       ],
//       maxLength: 40,
//     },
//     Department: { type: "text", maxLength: 80 },

//     // Address Information
//     Street: { type: "text", maxLength: 255 },
//     City: { type: "text", maxLength: 40 },
//     State: { type: "text", maxLength: 80 },
//     PostalCode: {
//       type: "text",
//       maxLength: 20,
//       pattern: "^[A-Za-z0-9\\s\\-]{3,20}$",
//     },
//     Country: { type: "text", maxLength: 80 },
//     CountryCode: {
//       type: "select",
//       options: [
//         "US",
//         "CA",
//         "GB",
//         "DE",
//         "FR",
//         "IT",
//         "ES",
//         "NL",
//         "BE",
//         "AT",
//         "CH",
//         "SE",
//         "NO",
//         "DK",
//         "FI",
//         "AU",
//         "NZ",
//         "JP",
//         "CN",
//         "IN",
//         "BR",
//         "MX",
//         "AR",
//       ],
//       maxLength: 2,
//     },

//     // Business Information
//     SalesArea: { type: "text", maxLength: 80 },
//     Description: { type: "textarea", maxLength: 32000, rows: 4 },
//   };

//   // Check if field is read-only
//   if (readOnlyFields.includes(fieldName)) {
//     const input = document.createElement("input");
//     input.type = "text";
//     input.value = value || "";
//     input.disabled = true;
//     input.className = "field-input read-only";
//     input.title = "This field cannot be modified";
//     return input;
//   }

//   const fieldConfig = editableFields[fieldName];
//   if (!fieldConfig) {
//     // Unknown field, make it read-only
//     const input = document.createElement("input");
//     input.type = "text";
//     input.value = value || "";
//     input.disabled = true;
//     input.className = "field-input read-only";
//     input.title = "This field is not editable";
//     return input;
//   }

//   let input;

//   if (fieldConfig.type === "select") {
//     // Create select dropdown
//     input = document.createElement("select");
//     input.className = "field-input field-select";

//     // Add empty option if not required
//     if (!fieldConfig.required) {
//       const emptyOption = document.createElement("option");
//       emptyOption.value = "";
//       emptyOption.textContent = "-- Select --";
//       input.appendChild(emptyOption);
//     }

//     // Add options
//     fieldConfig.options.forEach((optionValue) => {
//       const option = document.createElement("option");
//       option.value = optionValue;
//       option.textContent = optionValue;
//       if (value === optionValue) {
//         option.selected = true;
//       }
//       input.appendChild(option);
//     });
//   } else if (fieldConfig.type === "textarea") {
//     // Create textarea
//     input = document.createElement("textarea");
//     input.value = value || "";
//     input.rows = fieldConfig.rows || 3;
//     input.className = "field-input field-textarea";
//   } else {
//     // Create input field
//     input = document.createElement("input");
//     input.type = fieldConfig.type;
//     input.value = value || "";
//     input.className = "field-input";

//     // Add pattern validation if specified
//     if (fieldConfig.pattern) {
//       input.pattern = fieldConfig.pattern;
//     }
//   }

//   input.name = fieldName;

//   // Set maxLength for text inputs and textareas
//   if (fieldConfig.maxLength && fieldConfig.type !== "select") {
//     input.maxLength = fieldConfig.maxLength;
//   }

//   // Set required attribute
//   if (fieldConfig.required) {
//     input.required = true;
//     input.setAttribute("aria-required", "true");
//   }

//   // Add professional validation and auto-save on input
//   input.addEventListener("input", (e) => {
//     validateField(fieldName, e.target.value);
//     // Auto-save during typing (debounced)
//     if (window.smartFieldManager) {
//       window.smartFieldManager.queueFieldSave(fieldName, e.target.value);
//     }
//   });

//   input.addEventListener("blur", async (e) => {
//     const isValid = validateField(fieldName, e.target.value);
//     if (isValid && window.smartFieldManager) {
//       // Immediate save when user leaves field
//       await window.smartFieldManager.saveFieldImmediate(
//         fieldName,
//         e.target.value
//       );
//     }
//   });

//   input.addEventListener("change", async (e) => {
//     const isValid = validateField(fieldName, e.target.value);
//     if (isValid && window.smartFieldManager) {
//       // Immediate save for select dropdowns
//       await window.smartFieldManager.saveFieldImmediate(fieldName, e.target.value);
//     }
//   });
//   return input;
// }

/**
 * Format field label for display
 * @param {string} fieldName - Field name
 * @returns {string} Formatted label
 */
function formatFieldLabel(fieldName) {
  const labelMap = {
    // Personal Information
    'FirstName': 'First Name',
    'MiddleName': 'Middle Name',
    'LastName': 'Last Name',
    'Salutation': 'Salutation',
    'Suffix': 'Suffix',

    // Contact Information
    'Email': 'Email Address',
    'Phone': 'Phone Number',
    'MobilePhone': 'Mobile Phone',
    'Fax': 'Fax Number',
    'Website': 'Website',

    // Company Information
    'Company': 'Company Name',
    'Title': 'Job Title',
    'Industry': 'Industry',
    'Department': 'Department',

    // Address Information
    'Street': 'Street Address',
    'City': 'City',
    'State': 'State/Province',
    'PostalCode': 'Postal Code',
    'Country': 'Country',
    'CountryCode': 'Country Code',

    // Business Information
    'SalesArea': 'Sales Area',
    'Description': 'Description',

    // System Fields (Read-only)
    'Id': 'Lead ID',
    'CreatedDate': 'Created Date',
    'LastModifiedDate': 'Last Modified Date',
    'CreatedById': 'Created By ID',
    'LastModifiedById': 'Last Modified By ID',
    'SystemModstamp': 'System Modified',
    'DeviceId': 'Device ID',
    'DeviceRecordId': 'Device Record ID',
    'RequestBarcode': 'Request Barcode',
    'EventId': 'Event ID',
    'AttachmentIdList': 'Attachments',
    'IsReviewed': 'Reviewed Status',
    'StatusMessage': 'Status Message'
  };

  return labelMap[fieldName] || (fieldName ? fieldName.replace(/([A-Z])/g, ' $1').trim() : 'Unknown Field');
}


/**
 * Show edit action buttons
 */

/**
 * Determine if a field should be directly editable based on its value
 * @param {string} fieldName - The field name
 * @param {*} fieldValue - The field value
 * @returns {boolean} True if field should be directly editable
 */
function isFieldDirectlyEditable(fieldName, fieldValue) {
  // Read-only system fields that users should never edit
  const readOnlyFields = [
    'Id', 'CreatedDate', 'LastModifiedDate', 'CreatedById', 'LastModifiedById',
    'RequestBarcode', 'AttachmentIdList', 'DeviceRecordId', 'DeviceId',
    'EventId', 'SystemModstamp'
  ];

  if (readOnlyFields.includes(fieldName)) {
    return false; // Never editable
  }

  // Empty, null, or N/A fields are directly editable
  if (!fieldValue ||
      fieldValue === null ||
      fieldValue === 'null' ||
      fieldValue === 'N/A' ||
      fieldValue === '' ||
      fieldValue === 'undefined') {
    return true;
  }

  // Fields that should always be editable regardless of value
  const alwaysEditableFields = ['Description', 'Title', 'Department', 'Industry'];
  if (alwaysEditableFields.includes(fieldName)) {
    return true;
  }

  return false;
}

/**
 * Create an edit icon for non-empty fields
 * @param {string} fieldName - The field name
 * @returns {HTMLElement} Edit icon element
 */
// function createEditIcon(fieldName) {
//   const editIcon = document.createElement('button');
//   editIcon.className = 'field-edit-icon';
//   editIcon.title = `Edit ${fieldName}`;
//   editIcon.innerHTML = `
//     <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
//       <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
//       <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
//     </svg>
//   `;

//   editIcon.addEventListener('click', (e) => {
//     e.preventDefault();
//     e.stopPropagation();
//     toggleFieldEdit(fieldName);
//   });

//   return editIcon;
// }

/**
 * Basculer vers le mode édition - Remplace l'affichage par un input
 * @param {string} fieldName - The field name
 * @param {*} currentValue - Current field value
 * @param {Object} config - Field configuration
 */
function switchToEditMode(fieldName, currentValue, config) {
    console.log(`🎯 Switching to edit mode for ${fieldName}`);

    const fieldElement = document.querySelector(`[data-field-name="${fieldName}"]`);
    if (!fieldElement) return;

    const content = fieldElement.querySelector('.field-content');
    const displayContainer = content.querySelector('.field-value-container');

    if (!displayContainer) return;

    // Créer l'input de remplacement
    const input = createSalesforceInput(fieldName, currentValue, config);

    // Remplacer l'affichage par l'input
    content.replaceChild(input, displayContainer);

    // Focus sur l'input
    setTimeout(() => input.focus(), 100);

    // Fonction pour revenir au mode affichage
    const exitEditMode = () => {
        const newValue = getInputValue(input);
        saveFieldValue(fieldName, newValue); // Sauvegarder avant de sortir
        const newDisplayContainer = createDisplayWithEditIcon(fieldName, newValue, config);
        content.replaceChild(newDisplayContainer, input);
    };

    // Événements pour sortir du mode édition
    input.addEventListener('blur', exitEditMode, { once: true });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            exitEditMode();
        }
        if (e.key === 'Escape') {
            input.value = currentValue; // Restaurer la valeur originale
            exitEditMode();
        }
    });
}

/**
 * Vérifier si un champ est en lecture seule (système)
 */
function isReadOnlyField(fieldName) {
    const readOnlyFields = [
        // Champs système Salesforce
        'Id', 'CreatedDate', 'LastModifiedDate', 'SystemModstamp',
        'CreatedById', 'LastModifiedById', 'IsDeleted',

        // Champs Lead système
        'OwnerId', 'ConvertedAccountId', 'ConvertedContactId', 'ConvertedOpportunityId',
        'ConvertedDate', 'IsConverted', 'IsUnreadByOwner',

        // Champs système métadonnées
        '__metadata', 'KontaktViewId', 'DeviceId', 'DeviceRecordId',
        'EventId', 'RequestBarcode', 'StatusMessage',

        // Champs audit système
        'CurrencyIsoCode', 'RecordTypeId', 'MasterRecordId'
    ];
    return readOnlyFields.includes(fieldName);
}

/**
 * Créer un affichage avec icône d'édition
 */
function createDisplayWithEditIcon(fieldName, value, config) {
    const container = document.createElement("div");
    container.className = "field-value-container";

    // Vérifier si le champ est en lecture seule
    const isReadOnly = isReadOnlyField(fieldName);

    // Valeur affichée
    const displayValue = document.createElement("div");
    displayValue.className = "field-value";
    displayValue.textContent = formatDisplayValue(value, config);

    container.appendChild(displayValue);

    // Si le champ n'est pas en lecture seule, ajouter l'icône d'édition
    if (!isReadOnly) {
        // Icône d'édition
        const editIcon = document.createElement("button");
        editIcon.className = "field-edit-icon";
        editIcon.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
        `;
        editIcon.title = `Edit ${fieldName}`;
        editIcon.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            switchToEditMode(fieldName, value, config);
        });

        container.appendChild(editIcon);
    } else {
        // Indicateur de lecture seule
        const readOnlyIndicator = document.createElement("span");
        readOnlyIndicator.className = "read-only-indicator";
        readOnlyIndicator.textContent = "READ-ONLY";
        readOnlyIndicator.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <circle cx="12" cy="16" r="1"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            READ-ONLY
        `;
        container.appendChild(readOnlyIndicator);
    }

    return container;
}

/**
 * Formater la valeur d'affichage
 */
function formatDisplayValue(value, config) {
    if (!value || value === null || value === 'null' || value === '') {
        return 'N/A';
    }

    switch (config.type) {
        case 'DateTime':
            if (value.includes('/Date(')) {
                const timestamp = parseInt(value.match(/\d+/)[0]);
                return new Date(timestamp).toLocaleDateString();
            }
            return new Date(value).toLocaleDateString();
        case 'Checkbox':
            return value === true || value === 1 || value === '1' ? 'Yes' : 'No';
        default:
            return value.toString();
    }
}

/**
 * Obtenir la valeur d'un input selon son type
 */
function getInputValue(input) {
    if (input.type === 'checkbox') {
        return input.checked;
    } else if (input.tagName === 'SELECT') {
        return input.value;
    } else if (input.querySelector && input.querySelector('input[type="checkbox"]')) {
        // Pour les checkbox containers
        return input.querySelector('input[type="checkbox"]').checked;
    } else {
        return input.value;
    }
}

/**
 * Toggle edit mode for a specific field (LEGACY - à remplacer par switchToEditMode)
 * @param {string} fieldName - The field name to toggle
 */
function toggleFieldEdit(fieldName) {
  const field = document.querySelector(`[data-field-name="${fieldName}"]`);
  if (!field) return;

  const valueElement = field.querySelector('.field-value');
  const inputElement = field.querySelector('.field-input');
  const editIcon = field.querySelector('.field-edit-icon');

  if (!valueElement || !inputElement) return;

  // Check if currently in edit mode
  const isInEditMode = inputElement.classList.contains('editing');

  if (!isInEditMode) {
    // Switch to edit mode
    inputElement.classList.add('editing');
    valueElement.style.display = 'none';
    inputElement.style.display = 'block';
    if (editIcon) editIcon.style.display = 'none';

    // Set current value and focus
    inputElement.value = selectedLeadData[fieldName] || '';
    setTimeout(() => inputElement.focus(), 100); // Delay focus to ensure visibility

    // Add event listener to save on blur/enter
    const saveOnBlur = () => {
      saveFieldValue(fieldName, inputElement.value);
      exitEditMode();
    };

    const exitEditMode = () => {
      inputElement.classList.remove('editing');
      valueElement.style.display = 'block';
      inputElement.style.display = 'none';
      if (editIcon) editIcon.style.display = 'inline-block';
    };

    inputElement.addEventListener('blur', saveOnBlur, { once: true });
    inputElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveOnBlur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        inputElement.value = selectedLeadData[fieldName] || '';
        exitEditMode();
      }
    }, { once: true });

  } else {
    // Switch back to display mode
    inputElement.classList.remove('editing');
    valueElement.style.display = 'block';
    inputElement.style.display = 'none';
    if (editIcon) editIcon.style.display = 'inline-block';
  }
}


/**
 * Validate field value based on field type and requirements
 * @param {string} fieldName - The field name
 * @param {string} value - The field value
 * @returns {Object} Validation result with isValid and error message
 */
function validateFieldValue(fieldName, value) {
    const result = { isValid: true, error: null };

    // Email validation
    if (fieldName === 'Email' && value && value.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value.trim())) {
            result.isValid = false;
            result.error = 'Please enter a valid email address';
        }
    }

    // Phone validation (basic)
    if ((fieldName === 'Phone' || fieldName === 'MobilePhone') && value && value.trim()) {
        const phoneRegex = /^[\d\s\-\+\(\)\.]{10,}$/;
        if (!phoneRegex.test(value.trim())) {
            result.isValid = false;
            result.error = 'Please enter a valid phone number (at least 10 digits)';
        }
    }

    // Required fields validation
    const requiredFields = ['LastName', 'Email'];
    if (requiredFields.includes(fieldName) && (!value || !value.trim())) {
        result.isValid = false;
        result.error = 'This field is required';
    }

    // Postal code validation
    if (fieldName === 'PostalCode' && value && value.trim()) {
        const postalRegex = /^[\d\s\-A-Za-z]{3,}$/;
        if (!postalRegex.test(value.trim())) {
            result.isValid = false;
            result.error = 'Please enter a valid postal code';
        }
    }

    return result;
}

/**
 * Show field validation error
 * @param {string} fieldName - The field name
 * @param {string} errorMessage - The error message
 */
function showFieldError(fieldName, errorMessage) {
    const fieldContainer = document.querySelector(`[data-field-name="${fieldName}"]`);
    if (!fieldContainer) return;

    // Remove existing error
    const existingError = fieldContainer.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }

    // Add error styling to input
    const input = fieldContainer.querySelector('.field-input');
    if (input) {
        input.classList.add('error');
    }

    // Create error message element
    const errorElement = document.createElement('div');
    errorElement.className = 'field-error show';
    errorElement.textContent = errorMessage;
    fieldContainer.appendChild(errorElement);

    // Auto-remove error after 5 seconds
    setTimeout(() => {
        if (errorElement.parentNode) {
            errorElement.remove();
        }
        if (input) {
            input.classList.remove('error');
        }
    }, 5000);
}

/**
 * Clear field validation error
 * @param {string} fieldName - The field name
 */
function clearFieldError(fieldName) {
    const fieldContainer = document.querySelector(`[data-field-name="${fieldName}"]`);
    if (!fieldContainer) return;

    const errorElement = fieldContainer.querySelector('.field-error');
    if (errorElement) {
        errorElement.remove();
    }

    const input = fieldContainer.querySelector('.field-input');
    if (input) {
        input.classList.remove('error');
    }
}

function saveFieldValue(fieldName, value) {
    console.log(`💾 Saving field ${fieldName}: "${value}"`);

    // Validate field value first
    const validation = validateFieldValue(fieldName, value);
    if (!validation.isValid) {
        showFieldError(fieldName, validation.error);
        return false; // Don't save invalid values
    }

    // Clear any existing errors
    clearFieldError(fieldName);

    // Mettre à jour les données globales
    selectedLeadData[fieldName] = value;
    
    // Sauvegarder dans localStorage pour persistence
    try {
        const eventId = sessionStorage.getItem('selectedEventId') || 'default';
        const storageKey = `lead_edits_${eventId}`;
        
        let savedData = {};
        const existing = localStorage.getItem(storageKey);
        if (existing) {
            savedData = JSON.parse(existing);
        }
        
        if (!savedData.changes) savedData.changes = {};
        savedData.changes[fieldName] = value;
        savedData.leadData = selectedLeadData;
        savedData.timestamp = new Date().toISOString();
        savedData.eventId = eventId;
        
        localStorage.setItem(storageKey, JSON.stringify(savedData));
        
        console.log(`✅ Field ${fieldName} saved locally for event ${eventId}`);
        
        // Indicateur visuel de sauvegarde
        showFieldSaveIndicator(fieldName);
        
    } catch (error) {
        console.error(`❌ Error saving field ${fieldName}:`, error);
    }
}

function showFieldSaveIndicator(fieldName) {
    const fieldElement = document.querySelector(`[data-field-name="${fieldName}"]`);
    if (fieldElement) {
        fieldElement.classList.add('field-saved');
        setTimeout(() => {
            fieldElement.classList.remove('field-saved');
        }, 1000);
    }
}


/**
 * Show brief success indicator for a field
 * @param {string} fieldName - The field name
 */
function showFieldSuccess(fieldName) {
  const field = document.querySelector(`[data-field-name="${fieldName}"]`);
  if (field) {
    field.classList.add('field-saved');
    setTimeout(() => {
      field.classList.remove('field-saved');
    }, 1000);
  }
}

/**
 * Save changes locally to sessionStorage/localStorage
 */

/**
 * Load previously saved changes from localStorage/sessionStorage
 */
function loadSavedChanges() {
  console.log(' Loading previously saved changes...');

  try {
    const eventId = sessionStorage.getItem('selectedEventId') || 'default';
    const storageKey = `lead_edits_${eventId}`;

    // Try sessionStorage first (current session), then localStorage (persistent)
    let savedData = null;

    // Check sessionStorage first
    const sessionData = sessionStorage.getItem(storageKey);
    if (sessionData) {
      savedData = JSON.parse(sessionData);
      console.log('📦 Found saved data in sessionStorage');
    } else {
      // Check localStorage
      const localData = localStorage.getItem(storageKey);
      if (localData) {
        savedData = JSON.parse(localData);
        console.log('💾 Found saved data in localStorage');
      }
    }

    if (savedData && savedData.leadData) {
      console.log('📄 Loading saved lead data:', savedData.changes);

      // Merge saved data with current selectedLeadData
      Object.assign(selectedLeadData, savedData.leadData);

      // Show notification about loaded data
      if (savedData.changes && Object.keys(savedData.changes).length > 0) {
        const changeCount = Object.keys(savedData.changes).length;
        const changeText = changeCount === 1 ? 'change' : 'changes';
        const timeAgo = savedData.timestamp ? formatTimeAgo(savedData.timestamp) : 'recently';

        showSuccess(`📋 Loaded ${changeCount} previously saved ${changeText} from ${timeAgo}`);
      }

      // Re-render the lead fields with saved data
      if (typeof renderLeadFields === 'function') {
        renderLeadFields(selectedLeadData);
      }

      return true;
    } else {
      console.log('ℹ️ No saved changes found');
      return false;
    }

  } catch (error) {
    console.warn('⚠️ Error loading saved changes:', error);
    return false;
  }
}

/**
 * Format timestamp to human readable "time ago"
 */
function formatTimeAgo(timestamp) {
  try {
    const now = new Date();
    const saved = new Date(timestamp);
    const diffMs = now - saved;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    return saved.toLocaleDateString();
  } catch (error) {
    return 'previously';
  }
}

/**
 * Clear saved changes for current EventId
 */
function clearSavedChanges() {
  console.log('🗑️ Clearing saved changes...');

  try {
    const eventId = sessionStorage.getItem('selectedEventId') || 'default';
    const storageKey = `lead_edits_${eventId}`;

    // Clear from both storages
    sessionStorage.removeItem(storageKey);
    localStorage.removeItem(storageKey);

    console.log('✅ Saved changes cleared');
    return true;
  } catch (error) {
    console.warn('⚠️ Error clearing saved changes:', error);
    return false;
  }
}

/**
 * Validate individual field
 * @param {string} fieldName - Field name
 * @param {string} value - Field value
 * @returns {boolean} Is valid
 */
function validateField(fieldName, value) {
  const errorElement = document.getElementById(`error-${fieldName}`);
  const inputElement = document.querySelector(`input[name="${fieldName}"], textarea[name="${fieldName}"], select[name="${fieldName}"]`);

  let isValid = true;
  let errorMessage = '';
  const trimmedValue = value ? value.trim() : '';

  // Required field validation
  const requiredFields = ['LastName', 'Company'];
  if (requiredFields.includes(fieldName) && !trimmedValue) {
    isValid = false;
    errorMessage = `${formatFieldLabel(fieldName)} is required`;
  }

  // Helper function to check if field has meaningful content
  const hasValidContent = (value) => {
    if (!value) return false;
    const trimmed = value.trim();
    return trimmed && trimmed !== 'N/A' && trimmed !== 'null' && trimmed !== 'undefined' && trimmed !== '';
  };

  // Skip validation for empty/placeholder optional fields
  if (!hasValidContent(value) && !requiredFields.includes(fieldName)) {
    // Clear any previous errors for empty optional fields
    if (errorElement) {
      errorElement.classList.remove('show');
      errorElement.textContent = '';
    }
    if (inputElement) {
      inputElement.classList.remove('error');
    }
    return true;
  }

  // Field-specific validation
  switch (fieldName) {
    case 'Email':
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedValue)) {
        isValid = false;
        errorMessage = 'Please enter a valid email address (e.g., user@example.com)';
      }
      break;

    case 'Phone':
    case 'MobilePhone':
    case 'Fax':
      const phoneRegex = /^[\+]?[\d\s\-\(\)\.]{7,20}$/;
      if (!phoneRegex.test(trimmedValue)) {
        isValid = false;
        errorMessage = 'Please enter a valid phone number (7-20 digits with optional formatting)';
      }
      break;

    case 'Website':
      try {
        const url = trimmedValue.startsWith('http') ? trimmedValue : `https://${trimmedValue}`;
        new URL(url);
        // Additional check for valid domain format
        if (!url.includes('.') || url.length < 8) {
          throw new Error('Invalid domain');
        }
      } catch {
        isValid = false;
        errorMessage = 'Please enter a valid website URL (e.g., www.example.com)';
      }
      break;

    case 'PostalCode':
      const postalRegex = /^[A-Za-z0-9\s\-]{3,20}$/;
      if (!postalRegex.test(trimmedValue)) {
        isValid = false;
        errorMessage = 'Please enter a valid postal code (3-20 characters)';
      }
      break;

    case 'FirstName':
    case 'LastName':
    case 'MiddleName':
      const nameRegex = /^[A-Za-z\s\'\-\.]{1,40}$/;
      if (!nameRegex.test(trimmedValue)) {
        isValid = false;
        errorMessage = 'Names can only contain letters, spaces, apostrophes, hyphens, and periods';
      }
      break;

    case 'Company':
      if (trimmedValue.length < 2) {
        isValid = false;
        errorMessage = 'Company name must be at least 2 characters long';
      } else if (trimmedValue.length > 255) {
        isValid = false;
        errorMessage = 'Company name cannot exceed 255 characters';
      }
      break;

    case 'Title':
      if (trimmedValue.length > 128) {
        isValid = false;
        errorMessage = 'Job title cannot exceed 128 characters';
      }
      break;

    case 'Street':
      if (trimmedValue.length > 255) {
        isValid = false;
        errorMessage = 'Street address cannot exceed 255 characters';
      }
      break;

    case 'City':
      const cityRegex = /^[A-Za-z\s\'\-\.]{1,40}$/;
      if (!cityRegex.test(trimmedValue)) {
        isValid = false;
        errorMessage = 'City name can only contain letters, spaces, apostrophes, hyphens, and periods';
      }
      break;

    case 'State':
      if (trimmedValue.length > 80) {
        isValid = false;
        errorMessage = 'State/Province cannot exceed 80 characters';
      }
      break;

    case 'Country':
      const countryRegex = /^[A-Za-z\s\'\-\.]{1,80}$/;
      if (!countryRegex.test(trimmedValue)) {
        isValid = false;
        errorMessage = 'Country name can only contain letters, spaces, apostrophes, hyphens, and periods';
      }
      break;

    case 'CountryCode':
      const countryCodeRegex = /^[A-Z]{2}$/;
      if (!countryCodeRegex.test(trimmedValue.toUpperCase())) {
        isValid = false;
        errorMessage = 'Country code must be 2 uppercase letters (e.g., US, DE, GB)';
      }
      break;

    case 'Department':
    case 'SalesArea':
      if (trimmedValue.length > 80) {
        isValid = false;
        errorMessage = `${formatFieldLabel(fieldName)} cannot exceed 80 characters`;
      }
      break;

    case 'Description':
      if (trimmedValue.length > 32000) {
        isValid = false;
        errorMessage = 'Description cannot exceed 32,000 characters';
      }
      break;

    case 'Suffix':
      const suffixRegex = /^[A-Za-z\.]{1,10}$/;
      if (!suffixRegex.test(trimmedValue)) {
        isValid = false;
        errorMessage = 'Suffix can only contain letters and periods (e.g., Jr., Sr., PhD)';
      }
      break;
  }

  // Update UI based on validation
  if (errorElement) {
    if (isValid) {
      errorElement.classList.remove('show');
      errorElement.textContent = '';
    } else {
      errorElement.classList.add('show');
      errorElement.textContent = errorMessage;
    }
  }

  if (inputElement) {
    if (isValid) {
      inputElement.classList.remove('error');
    } else {
      inputElement.classList.add('error');
    }
  }

  return isValid;
}







/**
 * Validate business logic and data consistency
 * @returns {Object} Validation result with isValid flag and errors array
 */
function validateBusinessLogic() {
  const errors = [];
  let isValid = true;

  // Ensure basic lead data integrity
  if (!selectedLeadData.LastName || !selectedLeadData.LastName.trim()) {
    errors.push('Last Name is required for lead creation');
    isValid = false;
  }

  if (!selectedLeadData.Company || !selectedLeadData.Company.trim()) {
    errors.push('Company Name is required for lead creation');
    isValid = false;
  }

  // Helper function to check if field has meaningful content
  const hasValidContent = (value) => {
    if (!value) return false;
    const trimmed = value.trim();
    return trimmed && trimmed !== 'N/A' && trimmed !== 'null' && trimmed !== 'undefined' && trimmed !== '';
  };

  // Validate email if provided and not placeholder
  if (hasValidContent(selectedLeadData.Email)) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(selectedLeadData.Email.trim())) {
      errors.push('Email address format is invalid');
      isValid = false;
    }
  }

  // Validate phone numbers if provided and not placeholder
  ['Phone', 'MobilePhone', 'Fax'].forEach(phoneField => {
    if (hasValidContent(selectedLeadData[phoneField])) {
      const phoneValue = selectedLeadData[phoneField].trim();
      // Clean phone number for validation (remove formatting)
      const cleanPhone = phoneValue.replace(/[\s\-\(\)\.]/g, '');
      if (cleanPhone.length < 7 || cleanPhone.length > 20) {
        errors.push(`${formatFieldLabel(phoneField)} must contain 7-20 digits`);
        isValid = false;
      }
    }
  });

  // Validate country code consistency (only if both have meaningful content)
  if (hasValidContent(selectedLeadData.CountryCode) && hasValidContent(selectedLeadData.Country)) {
    const countryMappings = {
      'US': ['United States', 'USA', 'America'],
      'DE': ['Germany', 'Deutschland'],
      'GB': ['United Kingdom', 'UK', 'Britain'],
      'FR': ['France'],
      'CA': ['Canada']
    };

    const countryCode = selectedLeadData.CountryCode.toUpperCase();
    const country = selectedLeadData.Country.toLowerCase();

    if (countryMappings[countryCode]) {
      const validCountries = countryMappings[countryCode].map(c => c.toLowerCase());
      if (!validCountries.some(validCountry => country.includes(validCountry))) {
        console.warn(`ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡ ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Country code ${countryCode} may not match country ${selectedLeadData.Country}`);
      }
    }
  }

  return { isValid, errors };
}

/**
 * Check for duplicate leads
 * @returns {boolean} Has duplicates
 */
async function checkForDuplicates() {
  try {
    const response = await fetch(`${appConfig.apiBaseUrl}/leads/check-duplicate`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        FirstName: selectedLeadData.FirstName,
        LastName: selectedLeadData.LastName,
        Company: selectedLeadData.Company,
        Email: selectedLeadData.Email
      })
    });

    if (response.ok) {
      const result = await response.json();
      if (result.hasDuplicates) {
        showDuplicateWarning(result.duplicates);
        return true;
      }
    }
  } catch (error) {
    console.log('Could not check for duplicates:', error);
  }

  return false;
}

/**
 * Show duplicate warning
 * @param {Array} duplicates - Array of duplicate leads
 */
function showDuplicateWarning(duplicates) {
  let warningDiv = document.querySelector('.duplicate-warning');
  if (!warningDiv) {
    warningDiv = document.createElement('div');
    warningDiv.className = 'duplicate-warning';

    const leadGrid = document.querySelector('.lead-info-grid');
    if (leadGrid) {
      leadGrid.parentNode.insertBefore(warningDiv, leadGrid.nextSibling);
    }
  }

  const duplicatesList = duplicates.map(dup =>
    `<div class="duplicate-details">
      <strong>${dup.Name}</strong> at ${dup.Company}
      ${dup.Email ? `- ${dup.Email}` : ''}
    </div>`
  ).join('');

  warningDiv.innerHTML = `
    <h4>ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡ ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Potential Duplicate Detected</h4>
    <p>Similar leads already exist in Salesforce:</p>
    ${duplicatesList}
    <p>Please verify this is not a duplicate before proceeding.</p>
  `;
}

/**
 * Display attachments preview
 */
async function displayAttachmentsPreview() {
  // Check if lead has attachments
  if (!selectedLeadData || !selectedLeadData.AttachmentIdList) {
    return;
  }

  const attachmentIds = selectedLeadData.AttachmentIdList.split(",").filter(
    (id) => id.trim() !== ""
  );
  
  if (attachmentIds.length === 0) {
    return;
  }

  // Create or get attachments preview container
  let attachmentsPreviewContainer = document.getElementById("attachmentsPreview");
  if (!attachmentsPreviewContainer) {
    const leadDataContainer = document.getElementById("leadData");

    attachmentsPreviewContainer = document.createElement("div");
    attachmentsPreviewContainer.id = "attachmentsPreview";
    attachmentsPreviewContainer.className = "attachments-preview";

    // Add title
    const title = document.createElement("h4");
// Continuing with displayAttachmentsPreview function
    title.textContent = "Attachments to Transfer";
    attachmentsPreviewContainer.appendChild(title);

    // Create attachments list
    const attachmentsList = document.createElement("ul");
    attachmentsList.className = "attachments-list";
    attachmentsList.id = "attachmentsList";
    attachmentsPreviewContainer.appendChild(attachmentsList);

    // Insert after lead data
    leadDataContainer.parentNode.insertBefore(
      attachmentsPreviewContainer,
      leadDataContainer.nextSibling
    );
  }

  const attachmentsList = document.getElementById("attachmentsList");
  attachmentsList.innerHTML = '<li class="loading">Loading attachments...</li>';

  // Create API service
  const serverName = sessionStorage.getItem("serverName");
  const apiName = sessionStorage.getItem("apiName");
  const apiService = new ApiService(serverName, apiName);

  // Retrieve attachments
  const attachmentPromises = attachmentIds.map(async (attachmentId) => {
    try {
      const endpoint = `LS_AttachmentById?Id=%27${encodeURIComponent(
        attachmentId
      )}%27&$format=json`;
      const data = await apiService.request("GET", endpoint);

      let attachmentData = null;
      if (data && data.d && data.d.results && data.d.results.length > 0) {
        attachmentData = data.d.results[0];
      } else if (data && data.d) {
        attachmentData = data.d;
      }

      return attachmentData;
    } catch (error) {
      console.error(`Error retrieving attachment ${attachmentId}:`, error);
      return null;
    }
  });

  // Wait for all attachments
  const attachments = await Promise.all(attachmentPromises);
  const validAttachments = attachments.filter((a) => a && a.Name);

  if (validAttachments.length === 0) {
    attachmentsList.innerHTML = '<li class="no-data">No attachments available</li>';
    return;
  }

  // Clear list
  attachmentsList.innerHTML = "";

  // Add each attachment to the list
  validAttachments.forEach((attachment) => {
    const listItem = document.createElement("li");
    listItem.className = "attachment-item";

    // Icon based on file type
    const icon = getFileIcon(attachment.ContentType, attachment.Name);

    // File size
    const fileSize = attachment.BodyLength
      ? formatFileSize(attachment.BodyLength)
      : "N/A";

    listItem.innerHTML = `
      <div class="attachment-icon">${icon}</div>
      <div class="attachment-details">
        <div class="attachment-name">${attachment.Name}</div>
        <div class="attachment-meta">
          <span class="attachment-type">${
            attachment.ContentType || "Not specified"
          }</span>
          <span class="attachment-size">${fileSize}</span>
        </div>
      </div>
    `;

    attachmentsList.appendChild(listItem);
  });

  // Add summary
  const existingSummary = attachmentsPreviewContainer.querySelector(
    ".attachments-summary"
  );
  if (!existingSummary) {
    const summary = document.createElement("div");
    summary.className = "attachments-summary";
    summary.textContent = `${validAttachments.length} file(s) will be transferred with this lead`;
    attachmentsPreviewContainer.appendChild(summary);
  }
}

/**
 * Get file icon based on content type or extension
 * @param {string} contentType - File content type
 * @param {string} filename - File name
 * @returns {string} HTML SVG icon
 */
function getFileIcon(contentType, filename) {
  let iconSvg = "";

  if (!contentType && filename) {
    // Determine type based on file extension
    const extension = filename.split(".").pop().toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "bmp", "svg"].includes(extension)) {
      contentType = "image";
    } else if (["pdf"].includes(extension)) {
      contentType = "application/pdf";
    } else if (["doc", "docx"].includes(extension)) {
      contentType = "word";
    } else if (["xls", "xlsx"].includes(extension)) {
      contentType = "excel";
    }
  }

  if (contentType) {
    if (contentType.startsWith("image/") || contentType === "image") {
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    } else if (contentType === "application/pdf") {
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2-2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
    } else {
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2-2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;
    }
  }

  return iconSvg;
}

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Fetch attachments for a lead
 * @param {string} attachmentIdList - Comma-separated list of attachment IDs
 * @returns {Promise<Array>} Attachments
 */
async function fetchAttachments(attachmentIdList) {
  if (!attachmentIdList) {
    return [];
  }

  const attachmentIds = attachmentIdList.split(",").filter((id) => id.trim() !== "");
    
  if (attachmentIds.length === 0) {
    return [];
  }

  const transferStatus = document.getElementById("transferStatus");

  // Add attachments progress section
  transferStatus.innerHTML += `
    <div class="attachment-section">
      <h4>Preparing Attachments</h4>
      <div id="attachment-progress">0/${attachmentIds.length} prepared</div>
      <div id="attachment-list"></div>
    </div>
  `;

  const attachmentList = document.getElementById("attachment-list");
  const progressElement = document.getElementById("attachment-progress");

  // Create API service
  const serverName = sessionStorage.getItem("serverName");
  const apiName = sessionStorage.getItem("apiName");
  const apiService = new ApiService(serverName, apiName);

  // Retrieve attachments
  const attachments = [];

  for (let i = 0; i < attachmentIds.length; i++) {
    const attachmentId = attachmentIds[i];

    // Show status for current attachment
    const itemId = `attachment-${i}`;
    attachmentList.innerHTML += `
      <div id="${itemId}" class="attachment-item pending">
        <span class="attachment-name">Attachment ${i + 1}</span>
        <span class="attachment-status">Retrieving...</span>
      </div>
    `;

    try {
      // Retrieve attachment data
      const endpoint = `LS_AttachmentById?Id=%27${encodeURIComponent(
        attachmentId
      )}%27&$format=json`;
      const data = await apiService.request("GET", endpoint);

      let attachmentData = null;
      if (data && data.d && data.d.results && data.d.results.length > 0) {
        attachmentData = data.d.results[0];
      } else if (data && data.d) {
        attachmentData = data.d;
      }

      if (attachmentData && attachmentData.Body) {

        const itemElement = document.getElementById(itemId);

        if (itemElement) {
          itemElement.className = "attachment-item success";
          itemElement.querySelector(".attachment-name").textContent = attachmentData.Name || `Attachment ${i + 1}`;
          itemElement.querySelector(".attachment-status").textContent = " Ready for transfer";
        }

        // Detect file type and process accordingly 
        const fileName = attachmentData.Name || '';
        const extension = fileName.split('.').pop().toLowerCase();
        const isSVG = extension === 'svg' || attachmentData.ContentType === 'image/svg+xml';
        
        let processedBody = attachmentData.Body;
        let finalContentType = attachmentData.ContentType;

        // Process SVG files differently
        if (isSVG) {
          console.log('Processing SVG file:', fileName);
          
          try {
            if (attachmentData.Body.length > 0) {
              const testDecode = atob(attachmentData.Body.replace(/\s+/g, ''));
              
              if (testDecode.includes('<svg') || testDecode.includes('<?xml')) {
                processedBody = attachmentData.Body.replace(/\s+/g, '');
                console.log('SVG: Valid Base64 detected');
              } else {
                throw new Error('Base64 does not contain SVG content');
              }
            }
          } catch (decodeError) {
            if (attachmentData.Body.includes('<svg') || attachmentData.Body.includes('<?xml')) {
              console.log('SVG: Raw XML detected, encoding to Base64');
              processedBody = btoa(decodeURIComponent(encodeURIComponent(attachmentData.Body)));
            } else {
              console.error('SVG: Unable to process - neither valid Base64 nor XML:', fileName);
              processedBody = attachmentData.Body.replace(/\s+/g, '');
            }
          }
          
          finalContentType = 'image/svg+xml';
        } else {
          // Clean up Base64 string by removing whitespace
          processedBody = attachmentData.Body.replace(/\s+/g, '');

          if (!finalContentType) {
            const mimeTypes = {
              'pdf': 'application/pdf',
              'jpg': 'image/jpeg',
              'jpeg': 'image/jpeg',
              'png': 'image/png',
              'gif': 'image/gif',
              'txt': 'text/plain',
              'doc': 'application/msword',
              'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            };
            finalContentType = mimeTypes[extension] || 'application/octet-stream';
          }
        }

        console.log(`Attachment processed: ${fileName}`, {
          originalBodyLength: attachmentData.Body.length,
          processedBodyLength: processedBody.length,
          contentType: finalContentType,
          isSVG: isSVG
        });

        attachments.push({
          Name: fileName,
          Body: processedBody,
          ContentType: finalContentType,
        });
      }
      else {
        const itemElement = document.getElementById(itemId);
        if (itemElement) {
          itemElement.className = "attachment-item failure";
          itemElement.querySelector(".attachment-status").textContent =
            "No attachment data found";
        }
      }
    } catch (error) {
      console.error(`Error retrieving attachment ${attachmentId}:`, error);

      const itemElement = document.getElementById(itemId);
      if (itemElement) {
        itemElement.className = "attachment-item failure";
        itemElement.querySelector(
          ".attachment-status"
        ).textContent = `Error: ${error.message}`;
      }
    }

    // Update progress
    if (progressElement) {
      progressElement.textContent = `${i + 1}/${attachmentIds.length} prepared`;
    }
  }


  return attachments;
}



function updateConnectionStatus(status, message, userInfo = null) {
    console.log(`Connection status: ${status} - ${message}`, userInfo);

    const transferBtn = document.getElementById('transferToSalesforceBtn');
    const dashboardButton = document.getElementById('dashboardButton');
    const authNotice = document.getElementById('auth-required-notice');

    if (status === 'connected' && userInfo) {
        // Save connection with persistence
        ConnectionPersistenceManager.saveConnection(userInfo);
        updateUserProfile(userInfo);

        // Enable transfer button
        if (transferBtn) {
            transferBtn.disabled = false;
            transferBtn.classList.remove('disabled');
            transferBtn.title = 'Transfer lead to Salesforce';
        }

        // Show dashboard button ONLY when connected to Salesforce
        if (dashboardButton) {
            dashboardButton.style.display = 'inline-flex';
            dashboardButton.disabled = false;
            dashboardButton.title = 'View Salesforce Dashboard';
        }

        if (authNotice) authNotice.style.display = 'none';

    } else {
        // Clear persistent connection when disconnected
        ConnectionPersistenceManager.clearConnection();
        clearUserProfile();

        if (transferBtn) {
            transferBtn.disabled = true;
            transferBtn.classList.add('disabled');
            transferBtn.title = 'Please connect to Salesforce first';
        }

        // Hide dashboard button when not connected to Salesforce
        if (dashboardButton) {
            dashboardButton.style.display = 'none';
            dashboardButton.disabled = true;
        }

        if (authNotice) authNotice.style.display = 'flex';
    }
}


/**
 * Update user profile information in the status banner
 * @param {Object} userInfo - User information from Salesforce
 */
function updateUserProfile(userInfo) {
    const profileSection = document.getElementById('sf-profile-section');
    const connectBtn = document.getElementById('connectSalesforceBtn');
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profileOrg = document.getElementById('profileOrg');

    if (!profileSection || !connectBtn) return;

    // Hide connect button and show profile
    connectBtn.style.display = 'none';
    profileSection.style.display = 'flex';

    // Update profile information
    if (profileName && userInfo.display_name) {
        profileName.textContent = `Welcome, ${userInfo.display_name}`;
    }
    
    if (profileEmail && userInfo.username) {
        profileEmail.textContent = userInfo.username;
    }
    
    if (profileOrg && userInfo.organization_name) {
        profileOrg.textContent = userInfo.organization_name;
    }

    console.log('User profile updated:', userInfo);
}

/**
 * Clear user profile display
 */
function clearUserProfile() {
    const profileSection = document.getElementById('sf-profile-section');
    const connectBtn = document.getElementById('connectSalesforceBtn');
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profileOrg = document.getElementById('profileOrg');

    if (!profileSection || !connectBtn) return;

    // Show connect button and hide profile
    connectBtn.style.display = 'inline-flex';
    profileSection.style.display = 'none';

    // Clear profile information
    if (profileName) profileName.textContent = 'Welcome';
    if (profileEmail) profileEmail.textContent = 'Not connected';
    if (profileOrg) profileOrg.textContent = '';
}

// Add the missing showSuccess function
function showSuccess(message) {
  const errorElement = document.getElementById("errorMessage");
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = "block";
    errorElement.style.backgroundColor = "#28a745"; // Green for success
    
    setTimeout(() => {
      errorElement.style.display = "none";
      errorElement.style.backgroundColor = "#dc3545";
    }, 5000);
  } else {
    console.log("Success:", message);
    alert(message);
  }
}

/**
 * Show error message
 * @param {string} message - Error message
 */
function showError(message) {
  const errorElement = document.getElementById("errorMessage");
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = "block";

    setTimeout(() => {
      errorElement.style.display = "none";
    }, 5000);
  } else {
    console.error("Error element not found:", message);
    alert(message);
  }
}

/**
 * Enhanced field management functions
 */

function toggleLabelEditMode() {
  isLabelEditMode = !isLabelEditMode;

  const toggleBtn = document.getElementById('toggle-label-edit');
  const editLabelBtns = document.querySelectorAll('.edit-label-btn');

  if (isLabelEditMode) {
    toggleBtn.classList.add('active');
    toggleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"></path></svg> Done Editing';
    editLabelBtns.forEach(btn => btn.style.display = 'inline-flex');
    showSuccess('Label edit mode enabled. Click the edit icon next to any field label to customize it.');
  } else {
    toggleBtn.classList.remove('active');
    toggleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit Labels';
    editLabelBtns.forEach(btn => btn.style.display = 'none');
    saveCustomLabel();
  }
}


// Toggle field active/inactive status
async function toggleFieldActive(fieldName, isActive) {
    console.log(`Toggling field ${fieldName} to ${isActive ? 'active' : 'inactive'}`);

    if (!window.fieldMappingService) {
        console.error('Field mapping service not available');
        return;
    }

    try {
        // Update the field configuration with API sync
        await window.fieldMappingService.setFieldConfig(fieldName, { active: isActive });

        // Update the UI element
        const fieldElement = document.querySelector(`[data-field-name="${fieldName}"]`);
        if (fieldElement) {
            fieldElement.classList.toggle('field-inactive', !isActive);

            const statusText = fieldElement.querySelector('.field-status');
            if (statusText) {
                statusText.textContent = isActive ? "Active" : "Inactive";
            }
        }

        // Update statistics
        updateFieldStats();

        // Show success message
        const fieldLabel = window.fieldMappingService.formatFieldLabel(fieldName);
        showSuccess(`Field "${fieldLabel}" ${isActive ? 'activated' : 'deactivated'} and synced`);

    } catch (error) {
        console.error('Failed to toggle field:', error);
        showError('Failed to update field status: ' + error.message);
    }
}



// Handle field filter changes
function handleFieldFilterChange(event) {
    const filterValue = event.target.value;
    console.log(`Field filter changed to: ${filterValue}`);

    if (selectedLeadData) {
        displayLeadData(selectedLeadData);
    }

    // Update statistics after filtering
    updateFieldStats();
}


// Download configuration
function downloadConfiguration() {
    try {
        const exportData = window.fieldMappingService.exportConfiguration();
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        const timestamp = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `salesforce-field-config-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        closeModals();
        showSuccess('Configuration exported successfully!');

    } catch (error) {
        console.error('Export failed:', error);
        showError('Failed to export configuration');
    }
}

// Close modals function
function closeModals() {
    const modals = document.querySelectorAll('.config-modal-overlay');
    modals.forEach(modal => {
        modal.style.display = 'none';
        modal.style.visibility = 'hidden';
        modal.style.opacity = '0';
    });
}

// Close specific modal by ID
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        modal.style.visibility = 'hidden';
        modal.style.opacity = '0';
    }
}

// Setup modal event listeners
function setupModalEventListeners() {
    // Close buttons
    document.querySelectorAll('.config-modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.config-modal-overlay');
            if (modal) {
                closeModal(modal.id);
            }
        });
    });

    // Cancel buttons
    document.querySelectorAll('.config-btn.cancel-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.config-modal-overlay');
            if (modal) {
                closeModal(modal.id);
            }
        });
    });

    // Click outside to close
    document.querySelectorAll('.config-modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModals();
        }
    });
}

// Save configuration functions
function saveFieldMappingConfig() {
  try {
    localStorage.setItem('salesforce_field_mapping', JSON.stringify(fieldMappingConfig));
    console.log('Field mapping configuration saved');
  } catch (error) {
    console.error('Failed to save field mapping configuration:', error);
    showError('Failed to save field configuration');
  }
}


// Initialize the enhanced field mapping system
async function initializeEnhancedSystem() {
    try {
        // Initialize field mapping service
        window.fieldMappingService = new window.FieldMappingService();

        // Create enhanced UI controls
        createAdvancedControlPanel();

        // Initialize modal event listeners
        setupModalEventListeners();

        document.getElementById('save-custom-label')?.addEventListener('click', saveCustomLabel);
        document.getElementById('confirm-export')?.addEventListener('click', downloadConfiguration);

         // Update statistics
        updateFieldStats();

    } catch (error) {
        console.error('Failed to initialize enhanced system:', error);
        showError('Failed to initialize field mapping system');
    }
}



// Open edit label modal
function openEditLabelModal(fieldName) {
    const modal = document.getElementById('edit-label-modal');
    const apiNameInput = document.getElementById('edit-field-api-name');
    const labelInput = document.getElementById('edit-field-custom-label');

     if (!modal || !apiNameInput || !labelInput) {
        console.error('Modal elements not found');
        return;
    }

      // Populate modal fields
    apiNameInput.value = fieldName;
    labelInput.value = window.fieldMappingService?.customLabels[fieldName] || '';


    // Show modal with proper display
    modal.style.display = 'flex';

      // Focus on input after a short delay
    setTimeout(() => labelInput.focus(), 100);



    if (modal && apiNameInput && labelInput) {
        apiNameInput.value = fieldName;
        labelInput.value = window.fieldMappingService?.customLabels[fieldName] || '';

        // Show modal with proper display
        modal.style.display = 'flex';
        modal.style.visibility = 'visible';
        modal.style.opacity = '1';
        modal.style.zIndex = '1000';

        // Force reflow to ensure styles are applied
        modal.offsetHeight;

        console.log('Modal should be visible now. Current styles:', {
            display: modal.style.display,
            visibility: modal.style.visibility,
            opacity: modal.style.opacity,
            zIndex: modal.style.zIndex
        });

        // Focus sur le champ de texte
        setTimeout(() => {
            labelInput.focus();
        }, 100);
    } else {
        console.error('Modal elements not found:', {
            modal: !!modal,
            apiNameInput: !!apiNameInput,
            labelInput: !!labelInput
        });

        // Fallback: create modal if it doesn't exist
        if (!modal) {
            createEditLabelModal(fieldName);
        }
    }
}

// Close edit label modal
function closeEditLabelModal() {
    const modal = document.getElementById('edit-label-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}


/**
 * Save custom label from modal
 */
async function saveCustomLabel() {
    const fieldNameInput = document.getElementById('edit-field-api-name');
    const customLabelInput = document.getElementById('edit-field-custom-label');

    if (!fieldNameInput || !customLabelInput) {
        showError('Modal form elements not found');
        return;
    }

    const fieldName = fieldNameInput.value;
    const customLabel = customLabelInput.value.trim();

    if (!customLabel) {
        showError('Please enter a custom label');
        customLabelInput.focus();
        return;
    }

    if (!window.fieldMappingService) {
        showError('Field mapping service not available');
        return;
    }

    try {
        // Show loading in modal
        const saveBtn = document.getElementById('save-custom-label-btn') || 
                       document.querySelector('.btn-confirm[onclick*="saveCustomLabel"]');
        const originalText = saveBtn.innerHTML;
        
        saveBtn.disabled = true;
        saveBtn.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" style="animation: spin 1s linear infinite;">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="31.416" stroke-dashoffset="31.416">
                        <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite"/>
                        <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416" repeatCount="indefinite"/>
                    </circle>
                </svg>
                <span>Validating & Saving...</span>
            </div>
        `;

        // Save with API sync
        await window.fieldMappingService.setCustomLabel(fieldName, customLabel);

        // Update UI immediately
        const fieldElement = document.querySelector(`[data-field-name="${fieldName}"]`);
        if (fieldElement) {
            const labelElement = fieldElement.querySelector('.field-label');
            if (labelElement) {
                labelElement.textContent = customLabel;
            }
        }

        // Close modal
        closeEditLabelModal();

        // Show success message
        showSuccess(`Label updated and saved to server for ${fieldName}`);

        // Refresh display
        if (selectedLeadData) {
            displayLeadData(selectedLeadData);
        }

        // Restore button
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;

    } catch (error) {
        console.error('Error saving custom label:', error);
        showError('Failed to save custom label: ' + error.message);
        
        // Restore button
        const saveBtn = document.getElementById('save-custom-label-btn') || 
                       document.querySelector('.btn-confirm[onclick*="saveCustomLabel"]');
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}



// Create edit label modal if it doesn't exist
function createEditLabelModal(fieldName) {
    // Remove existing modal if any
    const existingModal = document.getElementById('edit-label-modal');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'edit-label-modal';
    modal.className = 'config-modal-overlay';
    modal.style.display = 'flex';

    modal.innerHTML = `
        <div class="config-modal-content">
            <div class="config-modal-header">
                <h3>Edit Field Label</h3>
                <button class="config-modal-close">&times;</button>
            </div>
            <div class="config-modal-body">
                <div class="form-group">
                    <label>API Field Name</label>
                    <input type="text" id="edit-field-api-name" class="form-input" readonly value="${fieldName}">
                </div>
                <div class="form-group">
                    <label>Custom Label</label>
                    <input type="text" id="edit-field-custom-label" class="form-input" placeholder="Enter custom label" value="${window.fieldMappingService?.customLabels[fieldName] || ''}">
                </div>
            </div>
            <div class="config-modal-footer">
                <button class="config-btn cancel-btn">Cancel</button>
                <button class="config-btn export-btn" id="save-custom-label">Save Label</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Add event listeners
    modal.querySelector('.config-modal-close').addEventListener('click', () => {
        modal.remove();
    });

    modal.querySelector('.cancel-btn').addEventListener('click', () => {
        modal.remove();
    });

    modal.querySelector('#save-custom-label').addEventListener('click', (e) => {
        e.preventDefault();
        if (saveCustomLabel()) {
            modal.remove();
        }
    });

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    // Focus on input
    setTimeout(() => {
        const labelInput = modal.querySelector('#edit-field-custom-label');
        if (labelInput) {
            labelInput.focus();
        }
    }, 100);
}


function createAdvancedControlPanel() {
    const leadPreview = document.querySelector('.lead-preview');
    if (!leadPreview) return;

    let controlPanel = document.getElementById('advanced-control-panel');
    if (!controlPanel) {
        controlPanel = document.createElement('div');
        controlPanel.id = 'advanced-control-panel';
        controlPanel.className = 'advanced-control-panel';
        
        // Updated design without Edit Labels button
        controlPanel.innerHTML = `
            <div class="control-panel-header">
                <h3>Field Management Controls</h3>
                <div class="control-actions">
                    <select id="field-display-filter" class="field-filter-dropdown">
                        <option value="all">All Fields</option>
                        <option value="active">Active Fields Only</option>
                        <option value="inactive">Inactive Fields Only</option>
                    </select>

                    <button id="export-config-btn" class="control-btn export-btn" title="Save & Export Configuration">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-15"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        Save Configuration
                    </button>
                </div>
            </div>

            <div class="field-stats">
                <div class="stat-card">
                    <span class="stat-value" id="active-field-count">0</span>
                    <span class="stat-label">Active</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value" id="inactive-field-count">0</span>
                    <span class="stat-label">Inactive</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value" id="total-field-count">0</span>
                    <span class="stat-label">Total</span>
                </div>
            </div>
        `;

        leadPreview.parentNode.insertBefore(controlPanel, leadPreview);
    }

    // Event listeners
    const filterDropdown = document.getElementById('field-display-filter');
    const exportConfigBtn = document.getElementById('export-config-btn');

    if (filterDropdown) {
        filterDropdown.addEventListener('change', handleFieldFilterChange);
    }

    if (exportConfigBtn) {
        exportConfigBtn.addEventListener('click', saveAndExportConfiguration);
    }
}



function updateFieldStats() {
    // Compter UNIQUEMENT les champs visibles sur cette page
    const visibleFields = document.querySelectorAll('.lead-field');
    const activeFields = document.querySelectorAll('.lead-field:not(.field-inactive)');
    const inactiveFields = document.querySelectorAll('.lead-field.field-inactive');

    const total = visibleFields.length;
    const active = activeFields.length;
    const inactive = inactiveFields.length;

    console.log('Field statistics (VISIBLE FIELDS ONLY):', {
        total,
        active,
        inactive,
        source: 'DOM visible fields'
    });

  

    // 3) Mets a jour les compteurs (tous les duplicats)
    updateStatCounter('total-field-count', total);
    updateStatCounter('active-field-count', active);
    updateStatCounter('inactive-field-count', inactive);

    return { total, active, inactive };
}

// Update stat counters (all elements with same ID)
function updateStatCounter(elementId, newValue) {
    // Find ALL elements with this ID (fixes collision issue)
    const elements = document.querySelectorAll(`[id="${elementId}"]`);

    if (elements.length === 0) {
        console.warn(`No elements found with ID: ${elementId}`);
        return;
    }

    console.log(`Updating ${elements.length} element(s) with ID ${elementId}: ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬  ${newValue}`);

    // Update all elements with this ID (no animations)
    elements.forEach(element => {
        // Determine if we need prefix format based on element structure
        const parent = element.parentElement;
        const hasStatLabel = parent && parent.querySelector('.stat-label');

        if (hasStatLabel) {
            element.textContent = newValue;
        } else {
            // Legacy structure: format with prefix
            const prefix = elementId.includes('total') ? 'Total' :
                          elementId.includes('active') ? 'Active' :
                          elementId.includes('inactive') ? 'Inactive' : '';
            element.textContent = prefix ? `${prefix}: ${newValue}` : newValue;
        }
    });
}

async function saveAndExportConfiguration() {
    const exportBtn = document.getElementById('export-config-btn');
    if (!exportBtn) return;
    
    // Store original button content BEFORE any modifications
    const originalHTML = exportBtn.innerHTML;
    
    try {
        // Get event ID with multiple fallback strategies
        let eventId = sessionStorage.getItem('selectedEventId');
        
        if (!eventId && window.fieldMappingService) {
            eventId = window.fieldMappingService.getCurrentEventId();
        }
        
        if (!eventId) {
            console.error('No event ID found in:', {
                sessionStorage: sessionStorage.getItem('selectedEventId'),
                fieldMappingService: window.fieldMappingService?.currentEventId,
                allSessionKeys: Object.keys(sessionStorage)
            });
            
            showError('No event selected for configuration save. Please refresh the page and select a lead again.');
            return;
        }

        if (!window.fieldMappingService) {
            showError('Field mapping service not available. Please refresh the page.');
            return;
        }

        // Ensure event ID is set in service
        window.fieldMappingService.setCurrentEventId(eventId);

        // Show loading state
        exportBtn.disabled = true;
        exportBtn.innerHTML = `
            <svg class="spinner" width="16" height="16" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/>
            </svg>
            Saving to Database...
        `;

        console.log('Starting configuration save to database with event ID:', eventId);

        // Use FieldMappingService to save to database
        const success = await window.fieldMappingService.bulkSaveToDatabase();
        
        if (!success) {
            throw new Error('Failed to save configuration to database');
        }

        // Show success message with detailed info
        updateFieldStats(); // Refresh stats
        const configuredFields = window.fieldMappingService.fieldConfig.config.fields?.length || 0;
        const activeFields = window.fieldMappingService.fieldConfig.config.fields?.filter(f => f.active !== false).length || 0;
        const customLabelsCount = Object.keys(window.fieldMappingService.customLabels || {}).length;

        showSuccess(
            `Configuration saved to database successfully!
            Event ID: ${eventId}.
            ${configuredFields} fields configured,
            ${activeFields} active, ${customLabelsCount} custom labels.`
        );

        console.log('Configuration save completed:', {
            eventId: eventId,
            databaseSave: true,
            configuredFields: configuredFields,
            activeFields: activeFields,
            customLabelsCount: customLabelsCount
        });

    } catch (error) {
        console.error('Configuration save failed:', error);
        showError(`Failed to save configuration: ${error.message}`);
    } finally {
        // Always restore button state
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.innerHTML = originalHTML;
        }
    }
}



window.openEditLabelModal = openEditLabelModal;
window.closeEditLabelModal = closeEditLabelModal;
window.saveCustomLabel = saveCustomLabel;
window.showLogoutModal = showLogoutModal;
window.closeLogoutModal = closeLogoutModal;
window.confirmLogout = confirmLogout;



// Make functions globally accessible for professional production use
window.leadTransferController = {
  handleTransferButtonClick,
  showError,
  updateConnectionStatus,
  validateField,
  validateBusinessLogic,
  checkForDuplicates,
  // Enhanced field management functions
  toggleFieldActive,
  toggleLabelEditMode,
  handleFieldFilterChange,
  initializeEnhancedSystem,
  saveFieldMappingConfig,
  downloadConfiguration,
  // Local save functions
  loadSavedChanges,
  clearSavedChanges,
  // Direct edit functions
  isFieldDirectlyEditable,
  toggleFieldEdit,
  saveFieldValue
};

// ===== SYSTÈME D'ÉDITION AVEC DEUX ICÔNES ET API FETCH =====


/**
 * Fetch les dernières données depuis l'API avant d'éditer
 */
async function fetchLatestDataBeforeEdit(fieldName, currentValue, config) {
    try {
        // Afficher un indicateur de chargement
        showLoadingIndicator(fieldName, 'Fetching latest data...');

        // Récupérer l'EventId depuis le sessionStorage
        const eventId = sessionStorage.getItem('selectedEventId');
        if (!eventId) {
            throw new Error('No EventId found');
        }

        // Construire l'URL de l'API selon l'environnement
        const apiBaseUrl = appConfig.apiBaseUrl;
        const apiUrl = `${apiBaseUrl}/leads/${eventId}`;

        console.log(`📡 Fetching data from: ${apiUrl}`);

        // Faire l'appel API
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`);
        }

        const latestData = await response.json();
        console.log('✅ Latest data fetched successfully:', latestData);

        // Mettre à jour la valeur avec les données fraîches
        const latestValue = latestData[fieldName] || currentValue;

        // Masquer l'indicateur de chargement
        hideLoadingIndicator(fieldName);

        // Maintenant, passer en mode édition avec les données fraîches
        switchToEditMode(fieldName, latestValue, config);

    } catch (error) {
        console.error('❌ Error fetching latest data:', error);

        // Masquer l'indicateur de chargement
        hideLoadingIndicator(fieldName);

        // Afficher une notification d'erreur
        showErrorNotification(`Failed to fetch latest data: ${error.message}`);

        // Continuer avec la valeur actuelle
        switchToEditMode(fieldName, currentValue, config);
    }
}

/**
 * Afficher un indicateur de chargement sur un champ
 */
function showLoadingIndicator(fieldName, message = 'Loading...') {
    const fieldElement = document.querySelector(`[data-field-name="${fieldName}"]`);
    if (fieldElement) {
        const existingIndicator = fieldElement.querySelector('.loading-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }

        const indicator = document.createElement('div');
        indicator.className = 'loading-indicator';
        indicator.innerHTML = `
            <div class="spinner"></div>
            <span>${message}</span>
        `;
        fieldElement.appendChild(indicator);
    }
}

/**
 * Masquer l'indicateur de chargement
 */
function hideLoadingIndicator(fieldName) {
    const fieldElement = document.querySelector(`[data-field-name="${fieldName}"]`);
    if (fieldElement) {
        const indicator = fieldElement.querySelector('.loading-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
}

/**
 * Afficher une notification d'erreur
 */
function showErrorNotification(message) {
    // Créer ou réutiliser le container de notifications
    let notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        notificationContainer.className = 'notification-container';
        document.body.appendChild(notificationContainer);
    }

    // Créer la notification d'erreur
    const notification = document.createElement('div');
    notification.className = 'notification notification-error';
    notification.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <span>${message}</span>
        <button class="notification-close">&times;</button>
    `;

    const closeButton = notification.querySelector('.notification-close');
    closeButton.addEventListener('click', () => {
        notification.remove();
    });

    notificationContainer.appendChild(notification);

    // Auto-remove après 5 secondes
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}




// Export functions that other modules might use
export default {
  handleTransferButtonClick,
  showError,
  updateConnectionStatus,
  loadSavedChanges,
  clearSavedChanges,
  isFieldDirectlyEditable,
  toggleFieldEdit,
  saveFieldValue,
  createDisplayWithEditIcon,
  fetchLatestDataBeforeEdit
};