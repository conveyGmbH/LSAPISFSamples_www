// Standard imports
import { appConfig } from "../config/salesforceConfig.js";
import ApiService from "../services/apiService.js";
import { formatDate } from "../utils/helper.js";


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
// Global variable for lead data - accessible from all functions
window.selectedLeadData = null;
let leadSource = null;
let isTransferInProgress = false;
let isLabelEditMode = false;
let fieldMappingConfig = {};


function cleanupOldLeadData() {
  try {
    const prefix = 'window.selectedLeadData_';
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
      });
    }
  } catch (error) {
    console.warn('Error during localStorage cleanup:', error);
  }
}

// check Instant Connection 
function checkInstantConnection() {
  const persistedConnection = ConnectionPersistenceManager.loadConnection();

  if (persistedConnection?.userInfo &&
      persistedConnection.status === 'connected' &&
      persistedConnection.expiresAt > Date.now()) {

    if (persistedConnection.orgId && persistedConnection.orgId !== 'default') {
      localStorage.setItem('orgId', persistedConnection.orgId);
    }
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
  const allInputs = document.querySelectorAll('input, textarea, select');
  let cleanedCount = 0;

  allInputs.forEach(input => {
    if (input.value && (input.value.trim() === 'N/A' || input.value.trim() === 'n/a')) {
      input.value = '';
      cleanedCount++;
    }
  }); 
}

// Initialize controller when DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
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

  // Display userName in header
  displayUserName();

  await checkSalesforceConnection();

  // Add required styles
  addRequiredStyles();
});


/* Initialize button event listeners
 */
function initializeButtonListeners() {
  // Connect/Disconnect buttons
  document.getElementById('connectButton')?.addEventListener('click', handleConnectClick);
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
    // Keep button disabled until backend connection is verified
    transferBtn.disabled = true;
    transferBtn.classList.add('disabled');
    transferBtn.title = 'Please connect to Salesforce first';
  }

  // Initially hide dashboard button - will be shown when connected
  const dashboardButton = document.getElementById('dashboardButton');
  if (dashboardButton) {
    dashboardButton.style.display = 'none';
    dashboardButton.disabled = true;
  }

  // Edit Label Modal buttons
  const closeEditLabelBtn = document.getElementById('close-edit-label-modal');
  const cancelEditLabelBtn = document.getElementById('cancel-edit-label-btn');
  const saveEditLabelBtn = document.getElementById('save-edit-label-btn');

  if (closeEditLabelBtn) {
    closeEditLabelBtn.addEventListener('click', closeEditLabelModal);
  }
  if (cancelEditLabelBtn) {
    cancelEditLabelBtn.addEventListener('click', closeEditLabelModal);
  }
  if (saveEditLabelBtn) {
    saveEditLabelBtn.addEventListener('click', saveCustomLabel);
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
  const mergedData = { ...window.selectedLeadData };

  // Override only the fields that have current values
  Object.keys(currentData).forEach(fieldName => {
    mergedData[fieldName] = currentData[fieldName];
  });

  console.log('📋 Final merged data:', mergedData);

  return mergedData;
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


/**
 * Check for duplicate leads in Salesforce
 * @param {Object} leadData - Lead data to check
 * @returns {Promise<Object>} Object with hasDuplicates flag and duplicates array
 */
async function checkForDuplicates(leadData) {
  try {
    const searchCriteria = [];

    // Search by email if provided
    if (leadData.Email && leadData.Email.trim()) {
      searchCriteria.push(`Email = '${leadData.Email.trim()}'`);
    }

    // Search by lastname + company if provided
    if (leadData.LastName && leadData.Company) {
      searchCriteria.push(`(LastName = '${leadData.LastName.trim()}' AND Company = '${leadData.Company.trim()}')`);
    }

    if (searchCriteria.length === 0) {
      return { hasDuplicates: false, duplicates: [] };
    }

    // Use the existing duplicate check endpoint
    const response = await fetch('http://localhost:3000/api/leads/check-duplicate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Org-Id': 'default'
      },
      credentials: 'include',
      body: JSON.stringify({
        LastName: leadData.LastName,
        Company: leadData.Company,
        Email: leadData.Email
      })
    });

    if (!response.ok) {
      // If endpoint not available, skip duplicate check
      console.warn('⚠️ Duplicate check endpoint not available, skipping...');
      return { hasDuplicates: false, duplicates: [] };
    }

    const result = await response.json();

    // The endpoint returns { duplicate: true/false, existing: {...} }
    if (result.duplicate && result.existing) {
      return {
        hasDuplicates: true,
        duplicates: [{
          Id: result.existing.Id,
          Name: `${result.existing.FirstName || ''} ${result.existing.LastName}`.trim(),
          Email: result.existing.Email,
          Company: result.existing.Company
        }]
      };
    }

    return { hasDuplicates: false, duplicates: [] };

  } catch (error) {
    console.error('⚠️ Error checking for duplicates:', error);
    // Don't block the transfer if duplicate check fails
    return { hasDuplicates: false, duplicates: [] };
  }
}

// Handle transfer button click
/**
 * Update Transfer button state based on active fields
 */
function updateTransferButtonState() {
    const transferBtn = document.getElementById('transferToSalesforceBtn');
    if (!transferBtn) return;

    // Check connection state
    const isConnected = !transferBtn.classList.contains('disabled');

    if (!isConnected) {
        // Keep disabled if not connected
        transferBtn.disabled = true;
        transferBtn.title = 'Please connect to Salesforce first';
        return;
    }

    // Count active fields from window.selectedLeadData (single source of truth)
    if (!window.selectedLeadData) {
        transferBtn.disabled = true;
        transferBtn.title = 'No lead data loaded';
        transferBtn.style.opacity = '0.5';
        transferBtn.style.cursor = 'not-allowed';
        return;
    }

    // System/metadata fields to exclude
    const excludedFields = new Set([
        'Id', 'CreatedDate', 'LastModifiedDate', 'CreatedById', 'LastModifiedById',
        'SystemModstamp', 'IsDeleted', 'AttachmentIdList', 'EventID', 'EVENTID',
        'apiEndpoint', 'credentials', 'serverName', 'apiName', '__metadata', 'KontaktViewId'
    ]);

    // Process data with labels
    const processedData = window.fieldMappingService?.applyCustomLabels(window.selectedLeadData) ||
        Object.fromEntries(Object.entries(window.selectedLeadData).map(([key, value]) => [key, {
            value,
            label: formatFieldLabel(key),
            active: true
        }]));

    let activeFieldCount = 0;

    // Count ONLY active fields with values
    Object.keys(processedData).forEach(fieldName => {
        // Skip excluded fields
        if (excludedFields.has(fieldName)) return;

        const fieldInfo = processedData[fieldName];

        // Skip if no value
        const value = typeof fieldInfo === 'object' ? fieldInfo.value : fieldInfo;
        if (!value || value.trim() === '' || value === 'N/A') return;

        // Check if field is active
        const isActive = typeof fieldInfo === 'object' ? (fieldInfo.active !== false) : true;

        if (isActive) {
            activeFieldCount++;
        }
    });

    // Update button state
    if (activeFieldCount === 0) {
        transferBtn.disabled = true;
        transferBtn.classList.add('no-active-fields');
        transferBtn.title = 'No active fields to transfer. Please activate some fields first.';
        transferBtn.style.opacity = '0.5';
        transferBtn.style.cursor = 'not-allowed';
    } else {
        transferBtn.disabled = false;
        transferBtn.classList.remove('no-active-fields');
        transferBtn.title = `Transfer ${activeFieldCount} active field${activeFieldCount > 1 ? 's' : ''} to Salesforce`;
        transferBtn.style.opacity = '1';
        transferBtn.style.cursor = 'pointer';
    }

    console.log(`🔄 Transfer button updated: ${activeFieldCount} active fields with values`);
}

// Initialize toggle change listeners
 
function initializeToggleListeners() {
    // Listen for all checkbox changes
    document.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox' && (e.target.id?.endsWith('-toggle') || e.target.closest('.field-row, .field-container'))) {
            updateTransferButtonState();
        }
    });

    console.log('✅ Toggle listeners initialized');
}


function collectActiveFieldsOnly() {
    const leadData = {};
    const fieldsList = [];
    const labels = {};

    // System/metadata fields to exclude (not transferable to Salesforce)
    const excludedFields = new Set([
        'Id', 'CreatedDate', 'LastModifiedDate', 'CreatedById', 'LastModifiedById',
        'SystemModstamp', 'IsDeleted', 'MasterRecordId', 'LastActivityDate',
        'LastViewedDate', 'LastReferencedDate', 'Jigsaw', 'JigsawContactId',
        'CleanStatus', 'CompanyDunsNumber', 'DandbCompanyId', 'EmailBouncedReason',
        'EmailBouncedDate', 'IndividualId', 'apiEndpoint', 'credentials',
        'serverName', 'apiName', 'AttachmentIdList', 'EventID'
    ]);

    // Get all field elements from the DOM
    const fieldElements = document.querySelectorAll('.field-row, .field-container');

    console.log(`📋 Found ${fieldElements.length} field elements in DOM`);

    fieldElements.forEach(fieldElement => {
        // Get field name from data attribute
        const fieldName = fieldElement.dataset.fieldName || fieldElement.dataset.field;

        if (!fieldName) return;

        // Skip excluded/system fields
        if (excludedFields.has(fieldName)) {
            return;
        }

        // Check if field is active (toggle is checked)
        const toggleInput = fieldElement.querySelector('input[type="checkbox"][id$="-toggle"]');
        const isActive = toggleInput ? toggleInput.checked : true; // Default to true if no toggle

        if (!isActive) {
            console.log(`⏭️  Skipping inactive field: ${fieldName}`);
            return;
        }

        // Get the field value
        const valueInput = fieldElement.querySelector('.field-input, input, select, textarea');

        if (valueInput) {
            const value = getInputValue(valueInput);

            if (value && value.trim() !== '' && value !== 'N/A') {
                leadData[fieldName] = value.trim();
                fieldsList.push(fieldName);

                // Get label from the field header or use formatted name
                const labelElement = fieldElement.querySelector('.field-label, .field-name');
                const label = labelElement?.textContent?.trim() ||
                             window.fieldMappingService?.formatFieldLabel(fieldName) ||
                             formatFieldLabel(fieldName);

                labels[fieldName] = label;

                console.log(`✅ Active field: ${fieldName} = "${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"`);
            }
        }
    });

    console.log(`✅ Collected ${fieldsList.length} Salesforce-valid active fields with values`);

    // Validation: ensure required fields are present
    if (!leadData.LastName && !leadData.Company) {
        console.warn('⚠️  No required fields found. Falling back to collectCurrentLeadData()');
        // Fallback to old method if new method fails
        const fallbackData = collectCurrentLeadData();
        return {
            leadData: fallbackData,
            fieldsList: Object.keys(fallbackData),
            labels: Object.fromEntries(
                Object.keys(fallbackData).map(f => [f, formatFieldLabel(f)])
            )
        };
    }

    return { leadData, fieldsList, labels };
}

/**
 * Check which fields exist in Salesforce
 * @param {Array} fieldNames - Array of field API names to check
 * @returns {Promise<Object>} { existing, missing }
 */
async function checkMissingFields(fieldNames) {
    try {
        const response = await fetch('http://localhost:3000/api/salesforce/fields/check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Org-Id': 'default'
            },
            credentials: 'include',
            body: JSON.stringify({ fieldNames })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to check fields in Salesforce');
        }

        return await response.json();
    } catch (error) {
        console.error('❌ Error checking fields:', error);
        throw error;
    }
}

/**
 * Show modal to confirm creation of missing custom fields
 * @param {Array} missingFields - Array of field API names
 * @param {Object} labels - Map of fieldName to label
 * @returns {Promise<boolean>} true if user wants to create, false to skip
 */
function showMissingFieldsModal(missingFields, labels) {
    return new Promise((resolve) => {
        const modal = document.getElementById('missing-fields-modal');
        const list = document.getElementById('missing-fields-list');
        const createBtn = document.getElementById('create-fields-btn');
        const skipBtn = document.getElementById('skip-field-creation-btn');
        const closeBtn = document.getElementById('close-missing-fields-modal');

        // Build list of missing fields with labels
        list.innerHTML = missingFields.map(fieldName => `
            <div style="display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid #E5E7EB; align-items: center;">
                <div>
                    <div style="font-weight: 600; color: #1F2937; margin-bottom: 4px;">${labels[fieldName] || fieldName}</div>
                    <div style="font-size: 12px; color: #6B7280; font-family: monospace;">${fieldName}</div>
                </div>
                <div style="background: #EFF6FF; color: #1E40AF; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 500; white-space: nowrap;">
                    Text (255)
                </div>
            </div>
        `).join('');

        // Show modal
        modal.style.display = 'flex';

        // Handle create
        const handleCreate = () => {
            modal.style.display = 'none';
            createBtn.removeEventListener('click', handleCreate);
            skipBtn.removeEventListener('click', handleSkip);
            closeBtn?.removeEventListener('click', handleClose);
            resolve(true);
        };

        // Handle skip
        const handleSkip = () => {
            modal.style.display = 'none';
            createBtn.removeEventListener('click', handleCreate);
            skipBtn.removeEventListener('click', handleSkip);
            closeBtn?.removeEventListener('click', handleClose);
            resolve(false);
        };

        // Handle close (same as skip)
        const handleClose = () => {
            modal.style.display = 'none';
            createBtn.removeEventListener('click', handleCreate);
            skipBtn.removeEventListener('click', handleSkip);
            closeBtn?.removeEventListener('click', handleClose);
            resolve(false);
        };

        createBtn.addEventListener('click', handleCreate);
        skipBtn.addEventListener('click', handleSkip);
        closeBtn?.addEventListener('click', handleClose);
    });
}

/**
 * Create custom fields in Salesforce
 * @param {Array} missingFields - Array of field API names
 * @param {Object} labels - Map of fieldName to label
 * @returns {Promise<Object>} Creation results
 */
async function createCustomFields(missingFields, labels) {
    const fields = missingFields.map(apiName => ({
        apiName,
        label: labels[apiName] || apiName.replace(/__c$/, '').replace(/_/g, ' ')
    }));

    try {
        const response = await fetch('http://localhost:3000/api/salesforce/fields/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Org-Id': 'default'
            },
            credentials: 'include',
            body: JSON.stringify({ fields })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to create custom fields');
        }

        return await response.json();
    } catch (error) {
        console.error('❌ Error creating fields:', error);
        throw error;
    }
}

/**
 * Show modern toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duration in ms (default 4000)
 */
function showModernToast(message, type = 'info', duration = 4000) {
    // Create container if it doesn't exist
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            align-items: center;
        `;
        document.body.appendChild(container);
    }

    const icons = {
        success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
        error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
        warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    };

    const colors = {
        success: { bg: '#10B981', border: '#059669' },
        error: { bg: '#EF4444', border: '#DC2626' },
        warning: { bg: '#F59E0B', border: '#D97706' },
        info: { bg: '#3B82F6', border: '#2563EB' }
    };

    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${colors[type].bg};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06);
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        font-weight: 500;
        animation: slideDown 0.3s ease-out;
        border: 2px solid ${colors[type].border};
        min-width: 300px;
        max-width: 500px;
    `;

    toast.innerHTML = `
        <div style="flex-shrink: 0;">${icons[type]}</div>
        <div style="flex: 1;">${message}</div>
    `;

    container.appendChild(toast);

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideDown {
            from { transform: translateY(-100px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideUp {
            from { transform: translateY(0); opacity: 1; }
            to { transform: translateY(-100px); opacity: 0; }
        }
    `;
    if (!document.querySelector('#toast-animations')) {
        style.id = 'toast-animations';
        document.head.appendChild(style);
    }

    // Remove after duration
    setTimeout(() => {
        toast.style.animation = 'slideUp 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Show modern duplicate modal
 * @param {Array} duplicates - Array of duplicate leads
 * @returns {Promise<boolean>} true to proceed, false to cancel
 */
function showDuplicateModal(duplicates) {
    return new Promise((resolve) => {
        const modal = document.getElementById('duplicateModal');
        if (!modal) {
            // Fallback to confirm dialog
            const message = duplicates.map(dup =>
                `${dup.Name} (${dup.Email || dup.Company})`
            ).join('\n');
            resolve(confirm(`⚠️ Potential duplicate lead(s) found:\n\n${message}\n\nCreate anyway?`));
            return;
        }

        // Use existing duplicate modal
        modal.style.display = 'block';

        const proceedBtn = modal.querySelector('.proceed-btn');
        const cancelBtn = modal.querySelector('.cancel-btn');

        const handleProceed = () => {
            modal.style.display = 'none';
            resolve(true);
        };

        const handleCancel = () => {
            modal.style.display = 'none';
            resolve(false);
        };

        proceedBtn?.addEventListener('click', handleProceed, { once: true });
        cancelBtn?.addEventListener('click', handleCancel, { once: true });
    });
}

// ============================================================================
// TRANSFER BUTTON HANDLER 
// ============================================================================

async function handleTransferButtonClick() {
  console.log("Transfer button clicked");
  if (isTransferInProgress) return;
  console.log("=== STARTING ENHANCED LEAD TRANSFER ===");

  const transferBtn = document.getElementById("transferToSalesforceBtn");
  const transferResults = document.getElementById("transferResults");
  const transferStatus = document.getElementById("transferStatus");

  try {
    // ========== PHASE 1: Collect ONLY Active Fields ==========
    console.log('📋 Phase 1: Collecting active fields only...');
    const { leadData, fieldsList, labels } = collectActiveFieldsOnly();

    if (!leadData || Object.keys(leadData).length === 0) {
      showModernToast("No active fields with values to transfer", 'warning');
      return;
    }

    console.log(`✅ Collected ${fieldsList.length} active fields`);

    // ========== PHASE 2: Validate Required Fields ==========
    console.log('📋 Phase 2: Validating required fields...');
    if (!leadData.LastName || !leadData.Company) {
      showModernToast('Last Name and Company are required fields', 'error');
      return;
    }

    // ========== PHASE 3: Check Missing Custom Fields ==========
    console.log('📋 Phase 3: Checking for missing custom fields in Salesforce...');
    showModernToast('Checking fields in Salesforce...', 'info', 2000);

    const fieldCheck = await checkMissingFields(fieldsList);
    console.log(`✅ Existing fields: ${fieldCheck.existing.length}`);
    console.log(`❌ Missing fields: ${fieldCheck.missing.length}`);

    // ========== PHASE 4: Handle Missing Custom Fields (Auto-create without confirmation) ==========
    if (fieldCheck.missing.length > 0) {
      console.log(`⚠️ Found ${fieldCheck.missing.length} missing custom fields - creating automatically...`);

      // Auto-create the fields without modal confirmation
      console.log('🛠️  Creating custom fields automatically...');
      showModernToast(`Creating ${fieldCheck.missing.length} custom field(s)...`, 'info');

      const createResult = await createCustomFields(
        fieldCheck.missing,
        labels
      );

      if (createResult.failed.length > 0) {
        showModernToast(
          `Failed to create ${createResult.failed.length} field(s). Check console for details.`,
          'error',
          6000
        );
        console.error('❌ Failed to create fields:', createResult.failed);
      }

      if (createResult.created.length > 0) {
        showModernToast(
          `✅ Created ${createResult.created.length} custom field(s) successfully!`,
          'success',
          5000
        );
        console.log('✅ Created fields:', createResult.created);
      }

      // Wait a moment for Salesforce to process the field creation
      if (createResult.created.length > 0) {
        showModernToast('Waiting for Salesforce to process new fields...', 'info', 3000);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // ========== PHASE 5: Check for Duplicates (Auto-proceed without confirmation) ==========
    console.log('📋 Phase 5: Checking for duplicate leads...');
    showModernToast('Checking for duplicates...', 'info', 2000);

    const duplicateCheck = await checkForDuplicates(leadData);
    if (duplicateCheck.hasDuplicates) {
      console.log(`⚠️ Found ${duplicateCheck.duplicates.length} potential duplicate(s) - proceeding anyway...`);
      showModernToast(`Found ${duplicateCheck.duplicates.length} duplicate(s) - creating anyway...`, 'warning', 3000);
    }

    // ========== PHASE 6: Transfer Lead to Salesforce ==========
    console.log('📋 Phase 6: Transferring lead to Salesforce...');

    isTransferInProgress = true;
    transferBtn.disabled = true;
    transferBtn.innerHTML = `
      <div class="spinner"></div>
      Transferring to Salesforce...
    `;

    showModernToast('Transferring lead to Salesforce...', 'info', 3000);

    // Show transfer status UI
    transferResults.style.display = "block";
    transferStatus.innerHTML = `
      <div class="transfer-pending">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        Transferring lead to Salesforce...
      </div>
    `;

    // Prepare attachments if present
    const attachmentIds = leadData.AttachmentIdList || window.selectedLeadData?.AttachmentIdList;
    const attachments = await fetchAttachments(attachmentIds);

    // IMPORTANT: Transfer ONLY active fields (leadData), NOT merged data
    console.log('📤 Transferring active fields only:', Object.keys(leadData));
    const response = await transferLeadDirectlyToSalesforce(leadData, attachments);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Transfer failed');
    }

    const result = await response.json();

    // Success!
    transferStatus.innerHTML = `
      <div class="status-success">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Lead transferred successfully to Salesforce!
      </div>
    `;

    showModernToast('✅ Lead transferred successfully!', 'success', 5000);
    console.log('✅ Transfer complete:', result);

  } catch (error) {
    console.error('❌ Transfer failed:', error);

    transferStatus.innerHTML = `
      <div class="status-error">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        Transfer failed: ${error.message}
      </div>
    `;

    showModernToast(`❌ Transfer failed: ${error.message}`, 'error', 6000);

  } finally {
    isTransferInProgress = false;
    transferBtn.disabled = false;
    transferBtn.innerHTML = `Transfer to Salesforce`;
  }
}


// DISCONNECT & CONNECT HANDLERS

/* Handle disconnect button click */
async function handleDisconnectClick() {
  try {

    if (typeof showLogoutModal === 'function') {

      window.actualDisconnectFunction = () => {
        performDisconnect();
      };
      showLogoutModal();
    } else {
      // Show modern disconnect modal
      showDisconnectModal(() => {
        performDisconnect();
      });
    }
  } catch (error) {
    console.error("Error during disconnect process:", error);
    showError("Failed to disconnect from Salesforce");
  }
}

/**
 * Show disconnect confirmation modal
 */
function showDisconnectModal(onConfirm) {
  const modal = document.getElementById('disconnect-modal');
  if (!modal) {
    console.error('Disconnect modal not found');
    return;
  }

  modal.classList.add('show');

  const closeBtn = document.getElementById('close-disconnect-modal');
  const cancelBtn = document.getElementById('cancel-disconnect-btn');
  const confirmBtn = document.getElementById('confirm-disconnect-btn');

  const closeModal = () => {
    modal.classList.remove('show');
  };

  if (closeBtn) closeBtn.onclick = closeModal;
  if (cancelBtn) cancelBtn.onclick = closeModal;
  if (confirmBtn) {
    confirmBtn.onclick = () => {
      closeModal();
      if (onConfirm) onConfirm();
    };
  }

  // Close on outside click
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
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

    // Open Salesforce OAuth popup - user will select environment there
    const authUrl = `${appConfig.apiBaseUrl.replace('/api', '/auth/salesforce')}?orgId=${encodeURIComponent(orgId)}`;
    const popup = window.open(authUrl, 'salesforce-auth', 'width=500,height=650,scrollbars=no,resizable=no');

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

    // MODIFICATION CLIENT: Ne plus exclure les champs - afficher TOUS les champs
    // Les champs système ci-dessous seront affichés mais marqués comme READ-ONLY dans l'UI
    // Ils seront exclus uniquement lors du POST vers Salesforce
    const systemFieldsToExcludeFromTransfer = [
        '__metadata', 'KontaktViewId', 'Id', 'CreatedDate', 'LastModifiedDate',
        'DeviceId', 'DeviceRecordId', 'RequestBarcode', 'EventId', 'SystemModstamp',
        'AttachmentIdList', 'IsReviewed', 'StatusMessage'
    ];

    console.log('Filtering lead data for transfer...');
    console.log('Original lead data keys:', Object.keys(leadData));

    // MODIFICATION CLIENT: Inclure TOUS les champs (même vides/null)
    const tempFilteredData = {};
    for (const [fieldName, value] of Object.entries(leadData)) {
        // Exclure uniquement les métadonnées techniques (__metadata, KontaktViewId)
        if (fieldName === '__metadata' || fieldName === 'KontaktViewId') {
            console.log(`Excluding metadata field: ${fieldName}`);
            continue;
        }

        // Inclure TOUS les autres champs (même avec valeur null)
        // Les champs système seront exclus plus tard lors du POST vers SF
        const isFieldActive = window.fieldMappingService?.isFieldActive(fieldName);

        // Inclure le champ si actif OU si pas de configuration (défaut = actif)
        if (isFieldActive !== false) {
            tempFilteredData[fieldName] = value !== undefined ? value : null;
            console.log(`Including field: ${fieldName} = ${value}`);
        } else {
            console.log(`Excluding inactive field: ${fieldName}`);
        }
    }

    // Apply Salesforce transformations and field mappings
    console.log('🔍 Checking available field mapping services:', {
        hasSalesforceFieldMapper: !!window.salesforceFieldMapper,
        hasFieldMappingService: !!window.fieldMappingService,
        hasMapFieldNamesMethod: !!window.fieldMappingService?.mapFieldNamesForSalesforce
    });

    if (window.salesforceFieldMapper && window.salesforceFieldMapper.transformForSalesforce) {
        console.log('Using salesforceFieldMapper.transformForSalesforce');
        const { transformed: salesforceData, excluded } = window.salesforceFieldMapper.transformForSalesforce(tempFilteredData);
        console.log('Applied Salesforce field transformations');
        console.log('Excluded fields:', excluded);
        Object.assign(filteredData, salesforceData);
    } else if (window.fieldMappingService?.mapFieldNamesForSalesforce) {
        // MODIFICATION CLIENT: Utiliser le mapping customLabel
        console.log('✅ Using fieldMappingService.mapFieldNamesForSalesforce');
        console.log('Custom labels available:', window.fieldMappingService.customLabels);
        const mappedData = window.fieldMappingService.mapFieldNamesForSalesforce(tempFilteredData);
        console.log('📋 Mapped data result:', mappedData);
        Object.assign(filteredData, mappedData);
    } else {
        // Fallback: use original field names
        console.log('⚠️ No field mapping service available - using original field names');
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

    //  CONDITIONAL UI RESTORATION - Show user info but DO NOT enable transfer button
    if (persistedConnection?.userInfo && persistedConnection.status === 'connected') {
      console.log('Found persisted connection data, checking validity...', {
        user: persistedConnection.userInfo.display_name,
        orgId: persistedConnection.orgId,
        connectedAt: new Date(persistedConnection.connectedAt).toLocaleString(),
        expiresAt: new Date(persistedConnection.expiresAt).toLocaleString()
      });

      // Check if connection hasn't expired (24 hours)
      if (persistedConnection.expiresAt > Date.now()) {
        console.log('Persisted connection found - verifying with backend before enabling buttons');

        // Update orgId from persisted data
        if (persistedConnection.orgId && persistedConnection.orgId !== 'default') {
          localStorage.setItem('orgId', persistedConnection.orgId);
        }

        // Show user info but indicate verification is in progress
        updateConnectionStatus("connecting",
          `Verifying connection for ${persistedConnection.userInfo.display_name || persistedConnection.userInfo.username}...`,
          persistedConnection.userInfo);

        displayUserInfo({
          name: persistedConnection.userInfo.display_name || persistedConnection.userInfo.username,
          email: persistedConnection.userInfo.username,
          organization_id: persistedConnection.userInfo.organization_id
        });

        // Keep buttons disabled until backend verification completes
        const transferBtn = document.getElementById('transferToSalesforceBtn');
        const dashboardButton = document.getElementById('dashboardButton');
        const authNotice = document.getElementById('auth-required-notice');

        if (transferBtn) {
          transferBtn.disabled = true;
          transferBtn.classList.add('disabled');
          transferBtn.title = 'Verifying connection with Salesforce...';
        }

        if (dashboardButton) {
          dashboardButton.style.display = 'none';
          dashboardButton.disabled = true;
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
    const emptyState = document.getElementById("empty-state");

    if (!leadDataContainer) {
        console.error('Lead data container not found');
        return;
    }

    leadDataContainer.innerHTML = "";

    if (!data || Object.keys(data).length === 0) {
        leadDataContainer.innerHTML = '<div class="no-data">No lead data available</div>';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    // Hide empty state when lead is loaded
    if (emptyState) emptyState.style.display = 'none';

    // Update lead info header
    updateLeadInfoHeader(data);

    // Traiter les données avec les labels personnalisés
    const processedData = window.fieldMappingService?.applyCustomLabels(data) ||
        Object.fromEntries(Object.entries(data).map(([key, value]) => [key, {
            value,
            label: formatFieldLabel(key),
            active: true
        }]));

    // Filtrer et afficher les champs selon leur statut - IMPORTANT: lire depuis localStorage
    const filterValue = localStorage.getItem('field-display-filter') || 'all';
    console.log(`📋 displayLeadData() applying filter: ${filterValue}`);

    let rowsGenerated = 0;

    Object.keys(processedData).forEach((fieldName) => {
        const fieldInfo = processedData[fieldName];

        // Exclure les champs système de l'affichage (ne peuvent pas être transférés à SF)
        if (isSystemField(fieldName)) return;

        // Exclure les métadonnées techniques
        if (fieldName === '__metadata' || fieldName === 'KontaktViewId') return;

        // Appliquer le filtre - utilise la même logique que generateCardView
        const isActive = fieldInfo.active !== false;
        if (filterValue === 'active' && !isActive) return;  // Affiche seulement les actifs
        if (filterValue === 'inactive' && isActive) return;  // Affiche seulement les inactifs

        const fieldRow = createFieldTableRow(fieldName, fieldInfo);
        leadDataContainer.appendChild(fieldRow);
        rowsGenerated++;
    });

    // Show message if no rows match filter
    if (rowsGenerated === 0) {
        const noResultsMsg = filterValue === 'active'
            ? 'No active fields to display'
            : filterValue === 'inactive'
            ? 'No inactive fields to display'
            : 'No fields to display';
        leadDataContainer.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500 py-8">${noResultsMsg}</td></tr>`;
    }

    console.log(`✅ Generated ${rowsGenerated} rows with filter: ${filterValue}`);

    // Mettre à jour les statistiques (use V2 if available)
    // Increased delay to ensure DOM is fully rendered
    setTimeout(() => {
        if (typeof window.updateFieldStats === 'function') {
            window.updateFieldStats();
        } else {
            updateFieldStats();
        }
    }, 300);

    // Clean N/A values from all inputs after data is displayed
    setTimeout(() => cleanNAValuesFromInputs(), 200);

    // Initialize toggle listeners (only once)
    if (!window.toggleListenersInitialized) {
        initializeToggleListeners();
        window.toggleListenersInitialized = true;
    }

    // Update transfer button state based on active fields
    setTimeout(() => updateTransferButtonState(), 300);
}


function isSystemField(fieldName) {
    const systemFields = [
        '__metadata', 'KontaktViewId', 'Id', 'CreatedDate', 'LastModifiedDate',
        'CreatedById', 'LastModifiedById', 'SystemModstamp', 'DeviceId',
        'DeviceRecordId', 'EventId', 'RequestBarcode', 'StatusMessage'
    ];
    return systemFields.includes(fieldName);
}

/**
 * Update lead information header
 */
function updateLeadInfoHeader(data) {
    const header = document.getElementById('lead-info-header');
    if (!header) return;

    const source = 'Lead Report'; // You can make this dynamic if needed
    const leadId = data.Id || data.EventId || 'Unknown';
    const createdDate = data.CreatedDate ? formatDate(data.CreatedDate) : 'Unknown';
    const isActive = true; // You can determine this from data if needed

    header.innerHTML = `
        <div class="flex items-center text-sm text-gray-600 mb-2">
            <span class="mr-2">Source: ${source}</span>
            <span class="mr-2">•</span>
            <span>ID: ${leadId}</span>
        </div>
        <div class="flex items-center">
            <span class="px-2 py-1 ${isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'} text-xs font-medium rounded mr-2">
                ${isActive ? 'Active' : 'Inactive'}
            </span>
            <span class="text-sm text-gray-600">Created: ${createdDate}</span>
        </div>
    `;

    header.style.display = 'block';
}

/**
 * Create a table row for a field (ListView)
 */
function createFieldTableRow(fieldName, fieldInfo) {
    const row = document.createElement('tr');
    const activeClass = fieldInfo.active ? 'active' : 'inactive';
    row.className = `table-row hover:bg-gray-50 field-row ${activeClass} ${!fieldInfo.active ? 'opacity-50 bg-gray-100' : ''}`;
    row.dataset.fieldName = fieldName;

    const salesforceConfig = getSalesforceFieldConfig(fieldName);
    const isRequired = salesforceConfig?.required || false;
    const displayValue = fieldInfo.value || '<span class="text-gray-400 italic">No value</span>';

    // Get custom Salesforce field name if it exists
    const customFieldName = window.fieldMappingService?.customLabels?.[fieldName] || '';

    row.innerHTML = `
        <td class="px-4 py-3 whitespace-nowrap">
            <div class="flex items-center justify-between">
                <div class="flex-1">
                    <div class="flex items-center">
                        <span class="text-sm font-medium text-gray-900">${fieldInfo.label || fieldName}</span>
                        ${isRequired ? '<span class="ml-1 text-red-500">*</span>' : ''}
                    </div>
                    <div class="flex items-center mt-1 text-xs">
                        <span class="text-gray-500 font-mono">API: ${fieldName}</span>
                        ${customFieldName ? `<span class="mx-2 text-gray-400">→</span><span class="text-green-600 font-mono font-semibold">SF: ${customFieldName}</span>` : ''}
                    </div>
                </div>
                <button class="edit-label-btn text-gray-400 hover:text-green-600 ml-2" title="Edit Salesforce field mapping">
                    <i class="fas fa-tag text-xs"></i>
                </button>
            </div>
        </td>
        <td class="px-4 py-3">
            <span class="text-sm text-gray-900 field-value">${displayValue}</span>
        </td>
        <td class="px-4 py-3 whitespace-nowrap">
            <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${fieldInfo.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                ${fieldInfo.active ? 'Active' : 'Inactive'}
            </span>
        </td>
        <td class="px-4 py-3 whitespace-nowrap text-sm font-medium">
            <button class="edit-field-btn text-blue-600 hover:text-blue-900 mr-3">
                <i class="fas fa-edit mr-1"></i> Edit
            </button>
            <label class="toggle-switch inline-block align-middle">
                <input id="${fieldName}-toggle" type="checkbox" ${fieldInfo.active ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </td>
    `;

    // Add event listeners
    const toggle = row.querySelector('input[type="checkbox"]');
    const editBtn = row.querySelector('.edit-field-btn');
    const editLabelBtn = row.querySelector('.edit-label-btn');

    // Edit label button - opens label editing modal
    if (editLabelBtn) {
        editLabelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditLabelModal(fieldName);
        });
    }

    toggle.addEventListener('change', async () => {
        const isChecked = toggle.checked;

        // Safety: Prevent saving system fields
        if (isSystemField(fieldName)) {
            console.warn(`⚠️ Cannot modify system field: ${fieldName}`);
            toggle.checked = !isChecked; // Revert
            return;
        }

        fieldInfo.active = isChecked;

        // Update in-memory data
        if (window.selectedLeadData && window.selectedLeadData[fieldName]) {
            if (typeof window.selectedLeadData[fieldName] === 'object') {
                window.selectedLeadData[fieldName].active = isChecked;
            }
        }

        // Save to FieldMappingService (only for non-system fields)
        if (window.fieldMappingService) {
            try {
                await window.fieldMappingService.setFieldConfig(fieldName, { active: isChecked });
            } catch (error) {
                console.error(`Failed to save ${fieldName}:`, error);
                // Revert on error
                toggle.checked = !isChecked;
                fieldInfo.active = !isChecked;
                return;
            }
        }

        // Update row styling and classes
        if (isChecked) {
            row.classList.remove('opacity-50', 'bg-gray-100', 'inactive');
            row.classList.add('active');
        } else {
            row.classList.add('opacity-50', 'bg-gray-100', 'inactive');
            row.classList.remove('active');
        }

        // Re-render to update status badge
        const statusBadge = row.querySelector('.px-2');
        statusBadge.className = `px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${isChecked ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`;
        statusBadge.textContent = isChecked ? 'Active' : 'Inactive';

        // Sync with CardView if exists
        syncToggleWithCardView(fieldName, isChecked);

        // Update stats and transfer button
        updateFieldStats();
        updateTransferButtonState();
    });

    // Add edit button listener - Opens inline editing or modal
    editBtn.addEventListener('click', () => {
        // Option 1: Use the V2 modal (if available)
        if (typeof window.openEditModal === 'function') {
            window.openEditModal(fieldName, fieldInfo.label || fieldName, fieldInfo.value);
        } else {
            // Option 2: Make the value cell editable inline
            const valueCell = row.querySelector('.field-value');
            const currentValue = fieldInfo.value || '';

            // Create input
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentValue;
            input.className = 'w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500';

            // Replace text with input
            valueCell.innerHTML = '';
            valueCell.appendChild(input);
            input.focus();
            input.select();

            // Save on blur or enter
            const saveEdit = () => {
                const newValue = input.value;
                fieldInfo.value = newValue;
                valueCell.innerHTML = `<span class="text-sm text-gray-900">${newValue || '<span class="text-gray-400 italic">No value</span>'}</span>`;

                // Trigger field save logic if available
                if (typeof window.saveFieldValue === 'function') {
                    window.saveFieldValue(fieldName, newValue);
                }
            };

            input.addEventListener('blur', saveEdit);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    saveEdit();
                } else if (e.key === 'Escape') {
                    valueCell.innerHTML = `<span class="text-sm text-gray-900">${currentValue || '<span class="text-gray-400 italic">No value</span>'}</span>`;
                }
            });
        }
    });

    return row;
}

// 3.  fonction principale pour créer un élément de champ (kept for CardView)
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
        'Industry': { type: 'Text', required: false, maxLength: 40 }, // MODIFICATION CLIENT: Changé de Picklist à Text pour accepter toutes les valeurs
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

   

    let salesforceLeadData = {};

    // Vérifier si fieldMappingService est disponible
    if (window.fieldMappingService && window.fieldMappingService.mapFieldNamesForSalesforce) {
      console.log('✅ FieldMappingService found!');
      console.log('Custom labels:', window.fieldMappingService.customLabels);

      // Appliquer le mapping directement
      salesforceLeadData = window.fieldMappingService.mapFieldNamesForSalesforce(leadData);
      console.log('✅ Field mapping applied successfully!');
      console.log('Mapped data:', salesforceLeadData);
    } else {
      console.warn('⚠️ FieldMappingService not available - using original field names');
      // Filtrer manuellement les champs système
      const systemFields = ['__metadata', 'KontaktViewId', 'Id', 'CreatedDate', 'LastModifiedDate',
        'CreatedById', 'LastModifiedById', 'DeviceId', 'DeviceRecordId', 'RequestBarcode',
        'EventId', 'SystemModstamp', 'AttachmentIdList', 'IsReviewed', 'StatusMessage'];

      Object.keys(leadData).forEach(key => {
        if (!systemFields.includes(key)) {
          salesforceLeadData[key] = leadData[key];
        }
      });
    }

    console.log('📊 Mapping summary:', {
      originalFieldCount: Object.keys(leadData).length,
      mappedFieldCount: Object.keys(salesforceLeadData).length,
      mappedFields: Object.keys(salesforceLeadData)
    });

    // MODIFICATION CLIENT: Les champs Question/Answer/Text sont maintenant envoyés directement
    // avec leurs noms mappés (Question01__c, Answer01__c, etc.) grâce à filterConfiguredFields()
    // Ce code legacy est conservé en commentaire au cas où vous souhaitez l'ancienne logique
    // qui ajoutait tout dans le champ Description
    /*
    if (leadSource === "LeadReport") {
      console.log('Source is LeadReport - checking for Question/Answer/Text fields...');

      const questionsAndAnswers = [];
      let activeQACount = 0;

      for (let i = 1; i <= 50; i++) {
        const questionNum = i.toString().padStart(2, '0');
        const questionField = `Question${questionNum}`;
        const answersField = `Answers${questionNum}`;
        const textField = `Text${questionNum}`;

        const hasQuestion = leadData[questionField] && leadData[questionField].trim() !== '' && leadData[questionField] !== 'N/A';
        const hasAnswers = leadData[answersField] && leadData[answersField].trim() !== '' && leadData[answersField] !== 'N/A';
        const hasText = leadData[textField] && leadData[textField].trim() !== '' && leadData[textField] !== 'N/A';

        if (hasQuestion || hasAnswers || hasText) {
          activeQACount++;
          const qaSection = [];

          if (hasQuestion) {
            qaSection.push(`Q${i}: ${leadData[questionField]}`);
          }
          if (hasAnswers) {
            qaSection.push(`A${i}: ${leadData[answersField]}`);
          }
          if (hasText) {
            qaSection.push(`Text${i}: ${leadData[textField]}`);
          }

          questionsAndAnswers.push(qaSection.join('\n'));
        }
      }

      if (questionsAndAnswers.length > 0) {
        const qaContent = '\n\n=== Questions & Answers ===\n' + questionsAndAnswers.join('\n\n');

        if (salesforceLeadData.Description) {
          salesforceLeadData.Description += qaContent;
        } else {
          salesforceLeadData.Description = qaContent.trim();
        }

        console.log(`✅ Added ${activeQACount} Q&A groups to Description field`);
      } else {
        console.log('ℹ️ No active Q&A fields found in LeadReport');
      }
    }
    */
    console.log('ℹ️ Question/Answer fields are now sent as individual mapped fields (e.g., Question01__c)');

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

    // Get orgId for authentication in production cross-origin requests
    const orgId = localStorage.getItem('orgId') || 'default';

    // Prepare payload for backend API
    const payload = {
      leadData: salesforceLeadData,
      attachments: attachments
    };

    const salesforceResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Org-Id': orgId
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
 * Display userName from sessionStorage in the page header
 */
function displayUserName() {
    const userName = sessionStorage.getItem("userName");
    const userNameDisplay = document.getElementById("userNameDisplay");

    if (userNameDisplay && userName) {
        userNameDisplay.textContent = userName;
    }
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
        window.selectedLeadData = JSON.parse(leadDataStr);

        // Transform null values to appropriate defaults
        window.selectedLeadData = transformNullValues(window.selectedLeadData);

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
                        Object.assign(window.selectedLeadData, savedFieldValues);

                        console.log('ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Data merged with saved field values from LS_FieldMappings');
                        console.log('ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Final data sample:', {
                            Title: window.selectedLeadData.Title,
                            FirstName: window.selectedLeadData.FirstName,
                            LastName: window.selectedLeadData.LastName,
                            Email: window.selectedLeadData.Email
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
                    const storageKey = `window.selectedLeadData_${eventId}`;
                    const savedData = localStorage.getItem(storageKey);
                    if (savedData) {
                        const parsedData = JSON.parse(savedData);
                        console.log(`Â¦ Found saved data in localStorage for EventId: ${eventId}`);

                        // Merge only the updated fields, keep original structure
                        Object.keys(parsedData).forEach(key => {
                            if (parsedData[key] !== window.selectedLeadData[key]) {
                                window.selectedLeadData[key] = parsedData[key];
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
            leadDataKeys: Object.keys(window.selectedLeadData).slice(0, 10)
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
                const initPromise = window.fieldMappingService.initializeFields(window.selectedLeadData, eventId);

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
                        window.fieldMappingService.initializeFields(window.selectedLeadData);
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
        displayLeadData(window.selectedLeadData);

        // Load any previously saved local changes (priority over API/database data)
        loadSavedChanges();

        // Stats will be updated after displayLeadData completes

        displayAttachmentsPreview();


    } catch (error) {
        console.error("Error loading lead data:", error);
        showError("Error loading lead data: " + error.message);
        
        // Fallback: try to display what we can
        if (window.selectedLeadData) {
            try {
                displayLeadData(window.selectedLeadData);
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
        'CurrencyIsoCode', 'RecordTypeId', 'MasterRecordId',

        // Champs spéciaux non éditables
        'AttachmentIdList', 'EVENTID'
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
        return '';
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
    inputElement.value = window.selectedLeadData[fieldName] || '';
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
        inputElement.value = window.selectedLeadData[fieldName] || '';
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

    // Phone validation removed per user request

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
    window.selectedLeadData[fieldName] = value;
    
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
        savedData.leadData = window.selectedLeadData;
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

      // Merge saved data with current window.selectedLeadData
      Object.assign(window.selectedLeadData, savedData.leadData);

      // Show notification about loaded data
      if (savedData.changes && Object.keys(savedData.changes).length > 0) {
        const changeCount = Object.keys(savedData.changes).length;
        const changeText = changeCount === 1 ? 'change' : 'changes';
        const timeAgo = savedData.timestamp ? formatTimeAgo(savedData.timestamp) : 'recently';

        showSuccess(`📋 Loaded ${changeCount} previously saved ${changeText} from ${timeAgo}`);
      }

      // Re-render the lead fields with saved data
      if (typeof renderLeadFields === 'function') {
        renderLeadFields(window.selectedLeadData);
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
  if (!window.selectedLeadData.LastName || !window.selectedLeadData.LastName.trim()) {
    errors.push('Last Name is required for lead creation');
    isValid = false;
  }

  if (!window.selectedLeadData.Company || !window.selectedLeadData.Company.trim()) {
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
  if (hasValidContent(window.selectedLeadData.Email)) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(window.selectedLeadData.Email.trim())) {
      errors.push('Email address format is invalid');
      isValid = false;
    }
  }

  // Phone number validation removed per user request

  // Validate country code consistency (only if both have meaningful content)
  if (hasValidContent(window.selectedLeadData.CountryCode) && hasValidContent(window.selectedLeadData.Country)) {
    const countryMappings = {
      'US': ['United States', 'USA', 'America'],
      'DE': ['Germany', 'Deutschland'],
      'GB': ['United Kingdom', 'UK', 'Britain'],
      'FR': ['France'],
      'CA': ['Canada']
    };

    const countryCode = window.selectedLeadData.CountryCode.toUpperCase();
    const country = window.selectedLeadData.Country.toLowerCase();

    if (countryMappings[countryCode]) {
      const validCountries = countryMappings[countryCode].map(c => c.toLowerCase());
      if (!validCountries.some(validCountry => country.includes(validCountry))) {
        console.warn(`ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡ ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Country code ${countryCode} may not match country ${window.selectedLeadData.Country}`);
      }
    }
  }

  return { isValid, errors };
}

// Duplicate function removed - using new implementation above


/**
 * Display attachments preview
 */
async function displayAttachmentsPreview() {
  // Check if lead has attachments
  if (!window.selectedLeadData || !window.selectedLeadData.AttachmentIdList) {
    return;
  }

  const attachmentIds = window.selectedLeadData.AttachmentIdList.split(",").filter(
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
      : "Unknown size";

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
      <button class="view-attachment-btn" data-attachment-id="${attachment.Id}" title="View file">
        <i class="fas fa-eye"></i>
      </button>
    `;

    // Add click handler for view button
    const viewBtn = listItem.querySelector('.view-attachment-btn');
    viewBtn.addEventListener('click', () => showAttachmentPreview(attachment));

    attachmentsList.appendChild(listItem);
  });

  // Update summary count
  const summarySpan = attachmentsPreviewContainer.querySelector('.attachments-summary .font-medium');
  if (summarySpan) {
    summarySpan.textContent = `${validAttachments.length} file(s)`;
  }

  // Show attachments container
  attachmentsPreviewContainer.style.display = 'block';
}

/**
 * Get file icon based on content type or extension
 * @param {string} contentType - File content type
 * @param {string} filename - File name
 * @returns {string} HTML SVG icon
 */
function getFileIcon(contentType, filename) {
  if (!contentType && filename) {
    // Determine type based on file extension
    const extension = filename.split(".").pop().toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "bmp"].includes(extension)) {
      contentType = "image";
    } else if (["svg"].includes(extension)) {
      contentType = "image/svg+xml";
    } else if (["pdf"].includes(extension)) {
      contentType = "application/pdf";
    } else if (["doc", "docx"].includes(extension)) {
      contentType = "word";
    } else if (["xls", "xlsx"].includes(extension)) {
      contentType = "excel";
    }
  }

  // Return Font Awesome icon HTML with colored background
  if (contentType) {
    if (contentType.startsWith("image/") || contentType === "image") {
      return '<div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-green-500"><i class="fas fa-image"></i></div>';
    } else if (contentType === "image/svg+xml") {
      return '<div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-500"><i class="fas fa-image"></i></div>';
    } else if (contentType === "application/pdf") {
      return '<div class="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center text-red-500"><i class="fas fa-file-pdf"></i></div>';
    } else if (contentType === "word") {
      return '<div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-500"><i class="fas fa-file-word"></i></div>';
    } else if (contentType === "excel") {
      return '<div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-green-500"><i class="fas fa-file-excel"></i></div>';
    } else {
      return '<div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500"><i class="fas fa-file"></i></div>';
    }
  }

  return '<div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500"><i class="fas fa-file"></i></div>';
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

/**
 * Show attachment preview in modal
 * @param {Object} attachment - Attachment data
 */
function showAttachmentPreview(attachment) {
  const modal = document.getElementById('attachment-preview-modal');
  const modalTitle = document.getElementById('attachment-modal-title');
  const modalBody = document.getElementById('attachment-modal-body');
  const closeBtn = document.getElementById('close-attachment-modal');

  if (!modal || !modalTitle || !modalBody) {
    console.error('Attachment preview modal not found');
    return;
  }

  // Set title
  modalTitle.textContent = attachment.Name;

  // Clear previous content
  modalBody.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin text-2xl text-blue-500"></i><p class="mt-2 text-gray-600">Loading...</p></div>';

  // Show modal
  modal.classList.add('show');
  modal.style.display = 'flex';

  // Determine content type
  const contentType = attachment.ContentType || '';
  const fileName = attachment.Name || '';
  const extension = fileName.split('.').pop().toLowerCase();

  // Process and display based on type
  if (contentType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'svg', 'bmp'].includes(extension)) {
    // Image preview
    const imgSrc = attachment.Body ? `data:${contentType || 'image/jpeg'};base64,${attachment.Body}` : '';
    modalBody.innerHTML = `
      <div class="flex flex-col items-center">
        <img src="${imgSrc}" alt="${fileName}" style="max-width: 500px; max-height: 400px; object-fit: contain;" class="rounded-lg shadow-lg">
        <div class="mt-3 text-center">
          <p class="text-xs text-gray-600">${fileName}</p>
          <p class="text-xs text-gray-500">${formatFileSize(attachment.BodyLength)}</p>
        </div>
      </div>
    `;
  } else if (contentType === 'application/pdf' || extension === 'pdf') {
    // PDF preview
    const pdfSrc = attachment.Body ? `data:application/pdf;base64,${attachment.Body}` : '';
    modalBody.innerHTML = `
      <div class="flex flex-col items-center">
        <iframe src="${pdfSrc}" style="width: 600px; height: 500px;" class="border rounded-lg"></iframe>
        <div class="mt-3 text-center">
          <p class="text-xs text-gray-600">${fileName}</p>
          <p class="text-xs text-gray-500">${formatFileSize(attachment.BodyLength)}</p>
        </div>
      </div>
    `;
  } else {
    // Unsupported type - show download option
    modalBody.innerHTML = `
      <div class="text-center py-6">
        <i class="fas fa-file text-4xl text-gray-300 mb-3"></i>
        <p class="text-sm font-medium text-gray-700 mb-2">${fileName}</p>
        <p class="text-xs text-gray-500 mb-2">Preview not available for this file type</p>
        <p class="text-xs text-gray-600 mb-1">Type: ${contentType || 'Unknown'}</p>
        <p class="text-xs text-gray-600">Size: ${formatFileSize(attachment.BodyLength)}</p>
      </div>
    `;
  }

  // Close modal handler
  const closeModal = () => {
    modal.classList.remove('show');
    modal.style.display = 'none';
  };

  closeBtn.onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
}

function updateConnectionStatus(status, message, userInfo = null) {
    console.log(`Connection status: ${status} - ${message}`, userInfo);

    const transferBtn = document.getElementById('transferToSalesforceBtn');
    const dashboardButton = document.getElementById('dashboardButton');
    const authNotice = document.getElementById('auth-required-notice');
    const connectButton = document.getElementById('connectButton');

    if (status === 'connected' && userInfo) {
        // Save connection with persistence
        ConnectionPersistenceManager.saveConnection(userInfo);
        updateUserProfile(userInfo);

        // Update sidebar profile (V2 UI)
        if (typeof window.updateUserProfileSidebar === 'function') {
            window.updateUserProfileSidebar();
        }

        // Update API status indicator (V2 UI)
        if (typeof window.updateAPIStatus === 'function') {
            window.updateAPIStatus();
        }

        // Hide Connect button when connected
        if (connectButton) {
            connectButton.style.display = 'none';
        }

        // Enable transfer button ONLY if there are active fields
        if (transferBtn) {
            transferBtn.classList.remove('disabled');
            // Don't enable yet - updateTransferButtonState() will check for active fields
            setTimeout(() => updateTransferButtonState(), 300);
        }

        // Dashboard button enabled - ready with OAuth integration
        if (dashboardButton) {
            dashboardButton.style.display = 'inline-flex';
            dashboardButton.disabled = false;
            dashboardButton.title = 'Open Lead Dashboard';
        }

        if (authNotice) authNotice.style.display = 'none';

    } else {
        // Clear persistent connection when disconnected
        ConnectionPersistenceManager.clearConnection();
        clearUserProfile();

        // Update sidebar profile (V2 UI)
        if (typeof window.updateUserProfileSidebar === 'function') {
            window.updateUserProfileSidebar();
        }

        // Update API status indicator (V2 UI)
        if (typeof window.updateAPIStatus === 'function') {
            window.updateAPIStatus();
        }

        // Show Connect button when not connected
        if (connectButton) {
            connectButton.style.display = 'flex';
        }

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

        // Update statistics (use V2 if available)
        if (typeof window.updateFieldStats === 'function') {
            window.updateFieldStats();
        } else {
            updateFieldStats();
        }

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

    if (window.selectedLeadData) {
        displayLeadData(window.selectedLeadData);
    }

    // Update statistics after filtering (use V2 if available)
    if (typeof window.updateFieldStats === 'function') {
        window.updateFieldStats();
    } else {
        updateFieldStats();
    }

    // Update transfer button state based on visible active fields
    setTimeout(() => updateTransferButtonState(), 100);
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

         // Update statistics (use V2 if available)
        if (typeof window.updateFieldStats === 'function') {
            window.updateFieldStats();
        } else {
            updateFieldStats();
        }

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

    // MODIFICATION CLIENT: Validation du format du label
    // Le label doit être un nom de champ Salesforce valide (pas d'espaces)
    const hasSpaces = /\s/.test(customLabel);
    if (hasSpaces) {
        showError('❌ Invalid field name: Spaces are not allowed.\n\nExamples of valid names:\n• Company__c\n• Question01__c\n• CustomField__c\n\nExamples of invalid names:\n• Company Name (has space)\n• Job title new (has spaces)');
        customLabelInput.focus();
        customLabelInput.select();
        return;
    }

    // Vérifier que c'est un nom de champ SF valide
    const isValidSFFieldName = /^[a-zA-Z][a-zA-Z0-9_]*(__c|__C)?$/.test(customLabel);
    if (!isValidSFFieldName) {
        showError('❌ Invalid Salesforce field name format.\n\nField names must:\n• Start with a letter\n• Contain only letters, numbers, and underscores\n• End with __c for custom fields\n\nExamples: Company, Title, Question01__c, CustomField__c');
        customLabelInput.focus();
        customLabelInput.select();
        return;
    }

    // MODIFICATION CLIENT: Vérifier que les champs standards ne sont pas renommés avec __c
    const standardLeadFields = [
        'FirstName', 'LastName', 'Email', 'Phone', 'MobilePhone', 'Fax', 'Company',
        'Title', 'Street', 'City', 'State', 'PostalCode', 'Country', 'CountryCode',
        'Salutation', 'Website', 'Description', 'Industry', 'Department'
    ];

    // Vérifier si on essaie de mapper un champ standard vers un nom avec __c
    if (standardLeadFields.includes(fieldName) && customLabel.endsWith('__c')) {
        showError(`❌ Warning: "${fieldName}" is a STANDARD Salesforce field.\n\nYou are trying to map it to "${customLabel}" which is a CUSTOM field name.\n\n💡 Solution:\n• Keep the standard name: "${fieldName}"\n• OR create a custom field "${customLabel}" in Salesforce first\n\nStandard fields should NOT have __c suffix.`);
        customLabelInput.focus();
        customLabelInput.select();
        return;
    }

    // Vérifier si on essaie de mapper vers un champ standard mal orthographié
    const customLabelLower = customLabel.toLowerCase();
    const similarStandard = standardLeadFields.find(sf => sf.toLowerCase() === customLabelLower);
    if (similarStandard && similarStandard !== customLabel) {
        const shouldCorrect = confirm(`⚠️ Did you mean "${similarStandard}"?\n\nYou entered: "${customLabel}"\nStandard field: "${similarStandard}"\n\nClick OK to use the correct standard field name, or Cancel to keep your entry.`);
        if (shouldCorrect) {
            customLabelInput.value = similarStandard;
            return;
        }
    }

    if (!window.fieldMappingService) {
        showError('Field mapping service not available');
        return;
    }

    try {
        // Show loading in modal
        const saveBtn = document.getElementById('save-edit-label-btn') ||
                       document.getElementById('save-custom-label-btn') ||
                       document.querySelector('.btn-confirm[onclick*="saveCustomLabel"]');

        if (!saveBtn) {
            console.error('Save button not found');
        }

        const originalText = saveBtn ? saveBtn.innerHTML : '';

        if (saveBtn) {
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
        }

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
        if (window.selectedLeadData) {
            displayLeadData(window.selectedLeadData);
        }

        // Restore button
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }

    } catch (error) {
        console.error('Error saving custom label:', error);
        showError('Failed to save custom label: ' + error.message);

        // Restore button
        const saveBtn = document.getElementById('save-edit-label-btn') ||
                       document.getElementById('save-custom-label-btn') ||
                       document.querySelector('.btn-confirm[onclick*="saveCustomLabel"]');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    }
}



/**
 * Show error modal when a Salesforce field doesn't exist
 * @param {string} fieldName - The field name that doesn't exist in Salesforce
 */
function showFieldErrorModal(fieldName) {
    // Remove existing modal if any
    const existingModal = document.getElementById('field-error-modal');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'field-error-modal';
    modal.className = 'config-modal-overlay';
    modal.style.display = 'flex';

    modal.innerHTML = `
        <div class="config-modal-content" style="max-width: 600px;">
            <div class="config-modal-header" style="background: #fee; border-bottom: 2px solid #fcc;">
                <h3 style="color: #c00;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 8px;">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    Salesforce Field Not Found
                </h3>
                <button class="config-modal-close" onclick="document.getElementById('field-error-modal').remove()">&times;</button>
            </div>
            <div class="config-modal-body">
                <p style="font-size: 16px; margin-bottom: 16px;">
                    The field <code style="background: #fee; padding: 4px 8px; border-radius: 4px; color: #c00; font-weight: bold;">${fieldName}</code> does not exist in your Salesforce Lead object.
                </p>

                <div style="background: #fff3cd; padding: 16px; border-left: 4px solid #ffc107; border-radius: 4px; margin-top: 16px;">
                    <strong style="display: flex; align-items: center; margin-bottom: 12px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="16" x2="12" y2="12"/>
                            <line x1="12" y1="8" x2="12.01" y2="8"/>
                        </svg>
                        Solutions:
                    </strong>
                    <ol style="margin: 0; padding-left: 20px; line-height: 1.8;">
                        <li><strong>Create the field in Salesforce:</strong><br>
                            Go to Setup → Object Manager → Lead → Fields & Relationships → New Field<br>
                            Create a field named <code>${fieldName}</code>
                        </li>
                        <li><strong>Change the field mapping:</strong><br>
                            Edit the field label to use an existing Salesforce field name
                        </li>
                        <li><strong>Disable the field:</strong><br>
                            Mark the field as inactive so it won't be sent to Salesforce
                        </li>
                    </ol>
                </div>
            </div>
            <div class="config-modal-footer">
                <button class="btn-secondary" onclick="document.getElementById('field-error-modal').remove()">Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
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



// ===== ANCIENNE FONCTION updateFieldStats() SUPPRIMÉE =====
// Remplacée par updateFieldStats() dans la section V2 UI ENHANCEMENTS
// (anciennement lignes 5158-5239)

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
        // Refresh stats (use V2 if available)
        if (typeof window.updateFieldStats === 'function') {
            window.updateFieldStats();
        } else {
            updateFieldStats();
        }
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
// Logout modal functions (optional, can be implemented later)
// window.showLogoutModal = showLogoutModal;
// window.closeLogoutModal = closeLogoutModal;
// window.confirmLogout = confirmLogout;



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


async function fetchLatestDataBeforeEdit(fieldName, currentValue, config) {
    try {
        showLoadingIndicator(fieldName, 'Fetching latest data...');

        const eventId = sessionStorage.getItem('selectedEventId');
        if (!eventId) {
            throw new Error('No EventId found');
        }

      
        const apiBaseUrl = appConfig.apiBaseUrl;
        const apiUrl = `${apiBaseUrl}/leads/${eventId}`;


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


function showErrorNotification(message) {
    let notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        notificationContainer.className = 'notification-container';
        document.body.appendChild(notificationContainer);
    }

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

    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}


// ========================================
// V2 UI ENHANCEMENTS
// ========================================

// View state management
let currentView = 'list'; // 'list' or 'card'

/**
 * Initialize V2 UI enhancements
 */
function initializeV2UI() {
    console.log('🎨 Initializing V2 UI enhancements...');

    // Initialize filter dropdown with saved value
    initializeFilterDropdown();

    setupViewToggle();
    setupFilterButtons();
    setupBulkActions();
    setupUserProfileUpdates();
    setupAPIStatusIndicator();
    setupStatsCardsClickHandlers();
    setupDisconnectButton();
    setupFieldRowsObserver();
}

/**
 * Initialize hidden filter dropdown with saved value
 */
function initializeFilterDropdown() {
    const savedFilter = localStorage.getItem('field-display-filter') || 'all';
    let dropdown = document.getElementById('field-display-filter');
    if (!dropdown) {
        dropdown = document.createElement('select');
        dropdown.id = 'field-display-filter';
        dropdown.style.display = 'none';
        document.body.appendChild(dropdown);
    }
    dropdown.value = savedFilter;
    console.log(`🔍 Filter initialized to: ${savedFilter}`);
}

// Apply filter to both List and Card views 
function applyFilterToAllViews(filterValue) {
    console.log(`🔄 Applying filter "${filterValue}" to all views`);

    // Save filter
    localStorage.setItem('field-display-filter', filterValue);

    // Update filter buttons UI
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.classList.remove('active', 'text-blue-600', 'border-blue-600');
        btn.classList.add('text-gray-600', 'border-transparent');

        if (btn.dataset.filter === filterValue) {
            btn.classList.remove('text-gray-600', 'border-transparent');
            btn.classList.add('active', 'text-blue-600', 'border-blue-600');
        }
    });

    // Update hidden dropdown
    let dropdown = document.getElementById('field-display-filter');
    if (!dropdown) {
        dropdown = document.createElement('select');
        dropdown.id = 'field-display-filter';
        dropdown.style.display = 'none';
        document.body.appendChild(dropdown);
    }
    dropdown.value = filterValue;

    // Apply filter based on current view
    if (currentView === 'list') {
        // Re-render list view with filter
        if (window.selectedLeadData && typeof displayLeadData === 'function') {
            displayLeadData(window.selectedLeadData);
        }
    } else {
        // Regenerate card view with filter
        generateCardView();
    }

    // Update summary text
    updateFieldsSummary(filterValue);

    // Update stats and transfer button
    setTimeout(() => {
        updateFieldStats();
        if (typeof updateTransferButtonState === 'function') updateTransferButtonState();
    }, 200);
}

/**
 * Update fields summary text
 */
function updateFieldsSummary(filterValue) {
    const summaryElement = document.getElementById('fields-summary');
    if (!summaryElement) return;

    const summaries = {
        'all': 'Showing all fields',
        'active': 'Showing active fields only',
        'inactive': 'Showing inactive fields only'
    };

    summaryElement.textContent = summaries[filterValue] || 'Showing all fields';
}

/**
 * Setup filter buttons (All/Active/Inactive)
 */
function setupFilterButtons() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    if (filterButtons.length === 0) return;

    // Restore last filter from localStorage and apply it
    const savedFilter = localStorage.getItem('field-display-filter') || 'all';
    setTimeout(() => applyFilterToAllViews(savedFilter), 100);

    // Add click listeners to all filter buttons
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const filterValue = btn.dataset.filter;
            applyFilterToAllViews(filterValue);
        });
    });
}

/**
 * Setup view toggle (List/Card)
 */
function setupViewToggle() {
    const listViewBtn = document.getElementById('listViewBtn');
    const cardViewBtn = document.getElementById('cardViewBtn');
    const listContainer = document.getElementById('list-view-container');
    const cardContainer = document.getElementById('card-view-container');

    if (!listViewBtn || !cardViewBtn) return;

    listViewBtn.addEventListener('click', () => {
        currentView = 'list';
        listViewBtn.classList.add('active');
        cardViewBtn.classList.remove('active');
        listContainer.style.display = 'block';
        cardContainer.style.display = 'none';

        // Apply current filter to list view
        const currentFilter = localStorage.getItem('field-display-filter') || 'all';
        if (window.selectedLeadData && typeof displayLeadData === 'function') {
            displayLeadData(window.selectedLeadData);
        }
        console.log('📋 Switched to ListView with filter:', currentFilter);
    });

    cardViewBtn.addEventListener('click', () => {
        currentView = 'card';
        cardViewBtn.classList.add('active');
        listViewBtn.classList.remove('active');
        listContainer.style.display = 'none';
        cardContainer.style.display = 'grid';

        // Apply current filter to card view
        generateCardView();
        console.log('🎴 Switched to CardView with filter:', localStorage.getItem('field-display-filter') || 'all');
    });
}

/**
 * Generate Card View from lead data with filter applied
 */
function generateCardView() {
    const cardContainer = document.getElementById('card-view-container');
    if (!cardContainer || !window.selectedLeadData) {
        console.warn('⚠️ CardView: container ou data manquant');
        return;
    }

    // Get current filter
    const filterValue = localStorage.getItem('field-display-filter') || 'all';
    console.log(`🎴 Generating CardView with filter: "${filterValue}"`);

    cardContainer.innerHTML = '';

    // Process data with labels
    const processedData = window.fieldMappingService?.applyCustomLabels(window.selectedLeadData) ||
        Object.fromEntries(Object.entries(window.selectedLeadData).map(([key, value]) => [key, {
            value,
            label: formatFieldLabel(key),
            active: true
        }]));

    let cardsGenerated = 0;

    Object.keys(processedData).forEach((fieldName) => {
        const fieldInfo = processedData[fieldName];

        // Skip system fields
        if (isSystemField(fieldName)) return;
        if (fieldName === '__metadata' || fieldName === 'KontaktViewId') return;

        // Apply filter
        const isActive = fieldInfo.active !== false;
        if (filterValue === 'active' && !isActive) return;
        if (filterValue === 'inactive' && isActive) return;

        // Get Salesforce config for required fields
        const salesforceConfig = getSalesforceFieldConfig(fieldName);
        const isRequired = salesforceConfig?.required || false;

        const card = createFieldCard(fieldName, fieldInfo.label || fieldName, fieldInfo.value || '', isActive, isRequired);
        cardContainer.appendChild(card);
        cardsGenerated++;
    });

    // Show message if no cards match filter
    if (cardsGenerated === 0) {
        const noResultsMsg = filterValue === 'active'
            ? 'No active fields to display'
            : filterValue === 'inactive'
            ? 'No inactive fields to display'
            : 'No fields to display';
        cardContainer.innerHTML = `<div class="col-span-full text-center text-gray-500 py-8">${noResultsMsg}</div>`;
    }

    console.log(`✅ Generated ${cardsGenerated} cards with filter: ${filterValue}`);

    // Update stats
    setTimeout(() => {
        updateFieldStats();
        if (typeof updateTransferButtonState === 'function') updateTransferButtonState();
    }, 100);
}

/**
 * Create a field card element
 */
function createFieldCard(fieldName, fieldLabel, fieldValue, isActive, isRequired) {
    const card = document.createElement('div');
    card.className = `field-card bg-white rounded-lg p-4 ${isActive ? 'active-field' : 'inactive-field'}`;
    card.dataset.fieldName = fieldName;

    const customFieldName = window.fieldMappingService?.customLabels?.[fieldName] || '';
    const escapeHtml = (text) => {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    card.innerHTML = `
        <div class="flex justify-between items-start mb-3">
            <div class="flex-1">
                <h3 class="text-sm font-semibold text-gray-800 mb-1">
                    ${escapeHtml(fieldLabel)}
                    ${isRequired ? '<span class="text-red-500 ml-1">*</span>' : ''}
                </h3>
                <div class="text-xs mt-1">
                    <span class="text-gray-500 font-mono">API: ${escapeHtml(fieldName)}</span>
                    ${customFieldName ? `<br><span class="text-green-600 font-mono font-semibold">SF: ${escapeHtml(customFieldName)}</span>` : ''}
                </div>
            </div>
            <div class="flex items-center space-x-2">
                <button class="edit-label-btn text-gray-400 hover:text-green-600" title="Edit Salesforce field mapping">
                    <i class="fas fa-tag text-sm"></i>
                </button>
                <label class="toggle-switch">
                    <input id="${escapeHtml(fieldName)}-toggle" type="checkbox" ${isActive ? 'checked' : ''} data-field="${escapeHtml(fieldName)}">
                    <span class="toggle-slider"></span>
                </label>
            </div>
        </div>
        <div class="mb-3">
            <p class="text-sm text-gray-700 break-words">${escapeHtml(fieldValue) || '<span class="text-gray-400 italic">No value</span>'}</p>
        </div>
        <div class="flex justify-end">
            <button class="edit-field-btn text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center">
                <i class="fas fa-edit mr-1"></i> Edit
            </button>
        </div>
    `;

    // Event listeners
    const toggleInput = card.querySelector('input[type="checkbox"]');
    const editLabelBtn = card.querySelector('.edit-label-btn');

    if (editLabelBtn) {
        editLabelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof openEditLabelModal === 'function') openEditLabelModal(fieldName);
        });
    }

    toggleInput.addEventListener('change', async (e) => {
        const isChecked = e.target.checked;

        // Safety: Prevent saving system fields
        if (isSystemField(fieldName)) {
            console.warn(`⚠️ Cannot modify system field: ${fieldName}`);
            toggleInput.checked = !isChecked; // Revert
            return;
        }

        // Update card classes
        card.classList.toggle('active-field', isChecked);
        card.classList.toggle('inactive-field', !isChecked);

        // Update in-memory data
        if (window.selectedLeadData && window.selectedLeadData[fieldName]) {
            if (typeof window.selectedLeadData[fieldName] === 'object') {
                window.selectedLeadData[fieldName].active = isChecked;
            }
        }

        // Save to FieldMappingService
        if (window.fieldMappingService) {
            try {
                await window.fieldMappingService.setFieldConfig(fieldName, { active: isChecked });
            } catch (error) {
                console.error(`Failed to save ${fieldName}:`, error);
                // Revert on error
                toggleInput.checked = !isChecked;
                card.classList.toggle('active-field', !isChecked);
                card.classList.toggle('inactive-field', isChecked);
                return;
            }
        }

        // Sync with ListView
        syncToggleWithListView(fieldName, isChecked);

        // Update stats and transfer button
        updateFieldStats();
        if (typeof updateTransferButtonState === 'function') updateTransferButtonState();
    });

    // Edit button click
    const editBtn = card.querySelector('.edit-field-btn');
    if (editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditModal(fieldName, fieldLabel, fieldValue);
        });
    }

    // Card click (except toggle)
    card.addEventListener('click', (e) => {
        if (e.target.closest('.toggle-switch') || e.target.closest('.edit-field-btn') || e.target.closest('.edit-label-btn')) {
            return;
        }
        openEditModal(fieldName, fieldLabel, fieldValue);
    });

    return card;
}

/**
 * Sync card toggle with list toggle
 */
function syncToggleWithListView(fieldName, isChecked) {
    const listToggle = document.querySelector(`.lead-field[data-field-name="${fieldName}"] input[type="checkbox"], .field-row[data-field-name="${fieldName}"] input[type="checkbox"]`);
    if (listToggle && listToggle.checked !== isChecked) {
        listToggle.checked = isChecked;

        // Update list row classes
        const listRow = listToggle.closest('.lead-field, .field-row');
        if (listRow) {
            if (isChecked) {
                listRow.classList.remove('opacity-50', 'bg-gray-100', 'inactive');
                listRow.classList.add('active');
            } else {
                listRow.classList.add('opacity-50', 'bg-gray-100', 'inactive');
                listRow.classList.remove('active');
            }

            // Update status badge
            const statusBadge = listRow.querySelector('.px-2.inline-flex');
            if (statusBadge) {
                statusBadge.className = `px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${isChecked ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`;
                statusBadge.textContent = isChecked ? 'Active' : 'Inactive';
            }
        }
    }
}

/**
 * Sync list toggle with card toggle
 */
function syncToggleWithCardView(fieldName, isChecked) {
    const cardToggle = document.querySelector(`.field-card[data-field-name="${fieldName}"] input[type="checkbox"]`);
    if (cardToggle && cardToggle.checked !== isChecked) {
        cardToggle.checked = isChecked;

        // Update card classes
        const card = cardToggle.closest('.field-card');
        if (card) {
            if (isChecked) {
                card.classList.remove('inactive-field');
                card.classList.add('active-field');
            } else {
                card.classList.remove('active-field');
                card.classList.add('inactive-field');
            }
        }
    }
}

/**
 * Open edit modal for field editing
 */
function openEditModal(fieldName, fieldLabel, fieldValue) {
    const modal = document.getElementById('edit-field-modal');
    const fieldNameInput = document.getElementById('edit-field-name');
    const fieldValueInput = document.getElementById('edit-field-value');
    const activeToggle = document.getElementById('edit-field-active');

    if (!modal) {
        console.error('Edit modal not found');
        return;
    }

    fieldNameInput.value = fieldLabel;
    fieldValueInput.value = fieldValue;

    // Get current active state from either card or list view
    const fieldCard = document.querySelector(`.field-card[data-field-name="${fieldName}"]`);
    const fieldRow = document.querySelector(`.lead-field[data-field-name="${fieldName}"], .field-row[data-field-name="${fieldName}"]`);
    const toggle = (fieldCard || fieldRow)?.querySelector('input[type="checkbox"]');
    activeToggle.checked = toggle ? toggle.checked : true;

    // Store field name for save
    modal.dataset.editingField = fieldName;

    modal.classList.add('show');

    // Setup close handlers
    const closeBtn = document.getElementById('close-edit-modal');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    const saveBtn = document.getElementById('save-edit-btn');

    const closeModal = () => {
        modal.classList.remove('show');
    };

    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    if (saveBtn) {
        saveBtn.onclick = () => {
            saveFieldEdit(fieldName, fieldValueInput.value, activeToggle.checked);
            closeModal();
        };
    }
}

/**
 * Save field edit from modal
 */
function saveFieldEdit(fieldName, newValue, isActive) {
    // 1. Update in-memory data (IMPORTANT for Salesforce transfer)
    if (window.selectedLeadData) {
        // If field exists as object
        if (window.selectedLeadData[fieldName] && typeof window.selectedLeadData[fieldName] === 'object') {
            window.selectedLeadData[fieldName].value = newValue;
            window.selectedLeadData[fieldName].active = isActive;
        }
        // If field exists as primitive value
        else if (window.selectedLeadData[fieldName] !== undefined) {
            window.selectedLeadData[fieldName] = newValue;
        }
        console.log(`💾 Memory updated: ${fieldName} = "${newValue}", active: ${isActive}`);
    }

    // 2. Update in FieldMappingService if exists
    if (window.fieldMappingService) {
        window.fieldMappingService.setFieldConfig(fieldName, {
            active: isActive,
            value: newValue
        });
    }

    // 3. Re-render the entire display with current filter
    // This ensures the edited value appears correctly in all views
    if (window.selectedLeadData && typeof displayLeadData === 'function') {
        const currentFilter = localStorage.getItem('field-display-filter') || 'all';
        displayLeadData(window.selectedLeadData);
        // Restore filter after re-render
        localStorage.setItem('field-display-filter', currentFilter);

        // Regenerate CardView if in card mode
        setTimeout(() => {
            if (currentView === 'card') {
                generateCardView();
            }
            updateFieldStats();
        }, 100);
    } else {
        // Fallback: Update DOM directly if displayLeadData not available
        const listFieldElement = document.querySelector(`.lead-field[data-field-name="${fieldName}"], .field-row[data-field-name="${fieldName}"]`);
        if (listFieldElement) {
            const valueSpan = listFieldElement.querySelector('.field-value');
            if (valueSpan) valueSpan.textContent = newValue;

            const toggle = listFieldElement.querySelector('input[type="checkbox"]');
            if (toggle && toggle.checked !== isActive) {
                toggle.checked = isActive;
                toggle.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        if (currentView === 'card') {
            generateCardView();
        }
        updateFieldStats();
    }

    // 4. Update transfer button state
    if (typeof updateTransferButtonState === 'function') {
        updateTransferButtonState();
    }

    console.log(`✅ Field updated: ${fieldName} = "${newValue}", active: ${isActive}`);
}

/**
 * Setup bulk actions
 */
function setupBulkActions() {
    const activateAllBtn = document.getElementById('activate-all-btn');
    const deactivateAllBtn = document.getElementById('deactivate-all-btn');

    if (activateAllBtn) {
        activateAllBtn.addEventListener('click', () => setAllFieldsActive(true));
    }
    if (deactivateAllBtn) {
        deactivateAllBtn.addEventListener('click', () => setAllFieldsActive(false));
    }
}

/**
 * Show success modal
 */
function showSuccessModal(message) {
    const modal = document.getElementById('bulk-action-success-modal');
    const messageEl = document.getElementById('bulk-action-message');
    const closeBtn = document.getElementById('close-bulk-success-modal');
    const confirmBtn = document.getElementById('confirm-bulk-success');

    if (!modal || !messageEl) return;

    messageEl.textContent = message;
    modal.style.display = 'flex';

    const closeModal = () => {
        modal.style.display = 'none';
    };

    closeBtn.onclick = closeModal;
    confirmBtn.onclick = closeModal;

    // Close on backdrop click
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
}

/**
 * Show error modal
 */
function showErrorModal(message) {
    const modal = document.getElementById('bulk-action-error-modal');
    const messageEl = document.getElementById('bulk-error-message');
    const closeBtn = document.getElementById('close-bulk-error-modal');
    const confirmBtn = document.getElementById('confirm-bulk-error');

    if (!modal || !messageEl) return;

    messageEl.textContent = message;
    modal.style.display = 'flex';

    const closeModal = () => {
        modal.style.display = 'none';
    };

    closeBtn.onclick = closeModal;
    confirmBtn.onclick = closeModal;

    // Close on backdrop click
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
}

/**
 * Set ALL fields active/inactive (regardless of current filter)
 */
async function setAllFieldsActive(active) {
    if (!window.selectedLeadData) {
        console.warn('⚠️ No lead data loaded');
        showErrorModal('No lead data loaded. Please select a lead first.');
        return;
    }

    console.log(`🔄 Setting ALL fields to ${active ? 'active' : 'inactive'}`);

    // Process data with labels
    const processedData = window.fieldMappingService?.applyCustomLabels(window.selectedLeadData) ||
        Object.fromEntries(Object.entries(window.selectedLeadData).map(([key, value]) => [key, {
            value,
            label: formatFieldLabel(key),
            active: true
        }]));

    let updatedCount = 0;

    // Update ALL fields in memory (not just visible ones)
    for (const [fieldName, fieldInfo] of Object.entries(processedData)) {
        // Skip system fields and metadata
        if (isSystemField(fieldName)) continue;
        if (fieldName === '__metadata' || fieldName === 'KontaktViewId') continue;

        // Update in-memory data
        if (typeof fieldInfo === 'object') {
            fieldInfo.active = active;
        }
        if (window.selectedLeadData[fieldName] && typeof window.selectedLeadData[fieldName] === 'object') {
            window.selectedLeadData[fieldName].active = active;
        }

        // Update FieldMappingService config in memory
        if (window.fieldMappingService) {
            const existingConfig = window.fieldMappingService.getFieldConfig(fieldName);
            if (existingConfig) {
                existingConfig.active = active;
                existingConfig.updatedAt = new Date().toISOString();
            } else {
                window.fieldMappingService.setFieldConfigLocal(fieldName, { active });
            }
        }

        updatedCount++;
    }

    console.log(`✅ Updated ${updatedCount} fields in memory`);

    // Bulk save to API
    if (window.fieldMappingService && typeof window.fieldMappingService.setAllFieldsActive === 'function') {
        try {
            await window.fieldMappingService.setAllFieldsActive(active);
            console.log('✅ Bulk save to API completed');
        } catch (error) {
            console.error('❌ Bulk save to API failed:', error);
            showErrorModal(`Failed to save changes: ${error.message}`);
            return;
        }
    }

    // Auto-switch filter to show the affected fields
    // If activated all -> show "Active Only"
    // If deactivated all -> show "Inactive Only"
    const newFilter = active ? 'active' : 'inactive';
    console.log(`🔄 Auto-switching to filter: ${newFilter}`);

    // Update filter in localStorage
    localStorage.setItem('field-display-filter', newFilter);

    // Update filter button UI
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.classList.remove('active', 'text-blue-600', 'border-blue-600');
        btn.classList.add('text-gray-600', 'border-transparent');

        if (btn.dataset.filter === newFilter) {
            btn.classList.remove('text-gray-600', 'border-transparent');
            btn.classList.add('active', 'text-blue-600', 'border-blue-600');
        }
    });

    // Regenerate current view with new filter
    if (currentView === 'list') {
        console.log('🔄 Regenerating ListView after bulk action with new filter');
        if (window.selectedLeadData && typeof displayLeadData === 'function') {
            displayLeadData(window.selectedLeadData);
        }
    } else {
        console.log('🔄 Regenerating CardView after bulk action with new filter');
        generateCardView();
    }

    // Update stats and transfer button
    setTimeout(() => {
        updateFieldStats();
        if (typeof updateTransferButtonState === 'function') updateTransferButtonState();
    }, 100);

    // Show success modal with count
    showSuccessModal(`Successfully ${active ? 'activated' : 'deactivated'} ${updatedCount} fields.`);
    console.log(`✅ Bulk action completed: ${updatedCount} fields set to ${active ? 'active' : 'inactive'}`);
}

/**
 * Update field statistics
 */
function updateFieldStats() {
    const isVisible = (el) => !!(el && el.offsetParent !== null);

    let fieldNodes = Array.from(document.querySelectorAll('.lead-field[data-field-name], .field-row[data-field-name]')).filter(isVisible);
    if (fieldNodes.length === 0) {
        fieldNodes = Array.from(document.querySelectorAll('.field-card[data-field-name]')).filter(isVisible);
    }

    const seen = new Set();
    let activeCount = 0;
    let inactiveCount = 0;

    for (const node of fieldNodes) {
        const name = node.dataset.fieldName || node.dataset.field;
        if (!name || seen.has(name)) continue;
        seen.add(name);

        const toggle = node.querySelector('input[type="checkbox"]');
        if (toggle && toggle.checked) activeCount++;
        else inactiveCount++;
    }

    const totalCount = activeCount + inactiveCount;
    const el = (id) => document.getElementById(id);
    if (el('active-field-count')) el('active-field-count').textContent = activeCount;
    if (el('inactive-field-count')) el('inactive-field-count').textContent = inactiveCount;
    if (el('total-field-count')) el('total-field-count').textContent = totalCount;

    console.log(`📊 Stats updated: ${activeCount} active, ${inactiveCount} inactive, ${totalCount} total`);
}

/**
 * Setup user profile updates
 */
function setupUserProfileUpdates() {
    const observer = new MutationObserver(() => updateUserProfileSidebar());
    const profileElement = document.getElementById('salesforceUserInfo');
    if (profileElement) observer.observe(profileElement, { childList: true, subtree: true });
}

/**
 * Update user profile in sidebar
 */
function updateUserProfileSidebar() {
    const sidebarProfile = document.getElementById('user-profile-sidebar');
    const userName = document.getElementById('user-name-sidebar');
    const userEmail = document.getElementById('user-email-sidebar');
    const userOrg = document.getElementById('user-org-sidebar');
    const userAvatar = document.getElementById('user-avatar');

    if (!sidebarProfile || !userName) return;

    let userInfo = null;
    try {
        const userInfoData = JSON.parse(localStorage.getItem('sf_user_info'));
        if (userInfoData?.userInfo) userInfo = userInfoData.userInfo;
    } catch (e) {}

    if (userInfo) {
        sidebarProfile.style.display = 'block';
        userName.textContent = userInfo.display_name || userInfo.username || 'User';
        if (userEmail) userEmail.textContent = userInfo.username || '-';
        if (userOrg) userOrg.textContent = userInfo.organization_name || 'Unknown Org';
        if (userAvatar) {
            const initials = (userInfo.display_name || userInfo.username || 'U')
                .split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
            userAvatar.textContent = initials;
        }
    } else {
        sidebarProfile.style.display = 'none';
    }
}

/**
 * Setup API status indicator
 */
function setupAPIStatusIndicator() {
    updateAPIStatus();
    setInterval(updateAPIStatus, 5000);
}

/**
 * Update API status
 */
function updateAPIStatus() {
    const statusCard = document.getElementById('api-status-card');
    if (!statusCard) return;

    try {
        const userInfoData = localStorage.getItem('sf_user_info');
        const persistedConnection = userInfoData ? JSON.parse(userInfoData) : null;
        const isConnected = persistedConnection?.status === 'connected' && persistedConnection?.expiresAt > Date.now();

        if (isConnected) {
            const displayName = persistedConnection.userInfo?.display_name || persistedConnection.userInfo?.username || 'Connected';
            statusCard.className = 'bg-green-50 border border-green-200 rounded-lg p-3';
            statusCard.innerHTML = `
                <div class="flex items-center">
                    <div class="w-3 h-3 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                    <span class="text-sm font-medium text-green-700">API Connected</span>
                </div>
                <p class="text-xs text-green-600 mt-1">${displayName}</p>
            `;
        } else {
            statusCard.className = 'bg-gray-100 border border-gray-200 rounded-lg p-3';
            statusCard.innerHTML = `
                <div class="flex items-center">
                    <div class="w-3 h-3 bg-gray-400 rounded-full mr-2"></div>
                    <span class="text-sm font-medium text-gray-600">Disconnected</span>
                </div>
                <p class="text-xs text-gray-500 mt-1">Not connected</p>
            `;
        }
    } catch (e) {}
}

/**
 * Setup stats cards click handlers
 */
function setupStatsCardsClickHandlers() {
    const cards = [
        { id: 'active-stats-card', filter: 'active' },
        { id: 'inactive-stats-card', filter: 'inactive' },
        { id: 'total-stats-card', filter: 'all' }
    ];

    cards.forEach(({ id, filter }) => {
        const card = document.getElementById(id);
        if (card) {
            card.addEventListener('click', () => {
                const btn = document.querySelector(`.filter-btn[data-filter="${filter}"]`);
                if (btn) btn.click();
            });
        }
    });
}

// Setup disconnect button
 
function setupDisconnectButton() {
    const disconnectBtn = document.getElementById('disconnect-sf-btn');
    if (!disconnectBtn) return;

    disconnectBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to disconnect from Salesforce?')) return;

        try {
            localStorage.removeItem('sf_connection_status');
            localStorage.removeItem('sf_user_info');
            localStorage.removeItem('sf_connected_at');
            sessionStorage.clear();

            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('lead_edits_')) localStorage.removeItem(key);
            });

            updateAPIStatus();
            alert('Successfully disconnected. Please refresh the page.');
            setTimeout(() => window.location.reload(), 1000);
        } catch (error) {
            console.error('Error during disconnect:', error);
        }
    });
}

// Setup MutationObserver for field rows
 
function setupFieldRowsObserver() {
    const leadDataContainer = document.getElementById('leadData');
    if (!leadDataContainer) return;

    const observer = new MutationObserver((mutations) => {
        const rowsAdded = mutations.some(m => m.type === 'childList' && m.addedNodes.length > 0);
        if (rowsAdded && leadDataContainer.children.length > 0) {
            console.log('📊 Field rows detected, updating stats...');
            updateFieldStats();
        }
    });

    observer.observe(leadDataContainer, { childList: true, subtree: false });
}

// Auto-initialize V2 UI when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeV2UI);
} else {
    initializeV2UI();
}

// functions globally
window.updateFieldStats = updateFieldStats;
window.updateUserProfileSidebar = updateUserProfileSidebar;
window.updateAPIStatus = updateAPIStatus;
window.openEditModal = openEditModal;



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