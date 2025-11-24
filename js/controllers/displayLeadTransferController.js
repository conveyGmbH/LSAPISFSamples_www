// Standard imports
import { appConfig } from "../config/salesforceConfig.js";
import ApiService from "../services/apiService.js";
import { formatDate } from "../utils/helper.js";


const USE_RERENDER_STRATEGY = false;

// Backend API URL - used for Salesforce transfer operations
const BACKEND_API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://lsapisfbackend.convey.de/';

// Connection persistence manager
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

      console.log(` Connection saved to localStorage for org ${orgId}:`, userInfo.display_name || userInfo.username);

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


// Global variable for lead data 
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

  // Initialize enhanced field mapping system
  await initializeEnhancedSystem();

  // Initialize button listeners
  initializeButtonListeners();

  // Load lead data
  loadLeadData();

  // Display userName in header
  displayUserName();

  // Show LeadEditsManager storage info (debug)
  if (window.leadEditsManager) {
    window.leadEditsManager.showStorageInfo();
  }

  await checkSalesforceConnection();
});


// Initialize button event listeners
function initializeButtonListeners() {
  // Connect/Disconnect buttons
  document.getElementById('connectButton')?.addEventListener('click', handleConnectClick);
  document.getElementById('disconnect-sf-btn')?.addEventListener('click', handleDisconnectClick);

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


// Update Transfer button state based on active fields
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

    // Count active fields from window.selectedLeadData 
    if (!window.selectedLeadData) {
        transferBtn.disabled = true;
        transferBtn.title = 'No lead data loaded';
        transferBtn.style.opacity = '0.5';
        transferBtn.style.cursor = 'not-allowed';
        return;
    }

    // System/metadata fields to exclude
    const excludedFields = new Set([
        '__metadata', 'KontaktViewId'
    ]);

    // Process data with labels
    const processedData = window.fieldMappingService?.applyCustomLabels(window.selectedLeadData) ||
        Object.fromEntries(Object.entries(window.selectedLeadData).map(([key, value]) => [key, {
            value,
            label: formatFieldLabel(key),
            active: true
        }]));

    let activeFieldCount = 0;
    let hasLastName = false;
    let hasCompany = false;

    // Count only active fields with values
    Object.keys(processedData).forEach(fieldName => {

        if (excludedFields.has(fieldName)) return;

        const fieldInfo = processedData[fieldName];

        const value = typeof fieldInfo === 'object' ? fieldInfo.value : fieldInfo;
        const hasValue = value && value.trim() !== '' && value !== 'N/A';

        const isActive = typeof fieldInfo === 'object' ? (fieldInfo.active !== false) : true;

        // Check for required fields (LastName or Company)
        if (fieldName === 'LastName' && isActive && hasValue) {
            hasLastName = true;
        }
        if (fieldName === 'Company' && isActive && hasValue) {
            hasCompany = true;
        }

        // Count active fields with values
        if (hasValue && isActive) {
            activeFieldCount++;
        }
    });

    // Check if BOTH LastName AND Company are present (user requirement)
    const hasRequiredFields = hasLastName && hasCompany;

    // Update button state
    if (activeFieldCount === 0) {
        transferBtn.disabled = true;
        transferBtn.classList.add('no-active-fields');
        transferBtn.classList.remove('missing-required-fields');
        transferBtn.title = 'No active fields to transfer. Please activate some fields first.';
        transferBtn.style.opacity = '0.5';
        transferBtn.style.cursor = 'not-allowed';
    } else if (!hasRequiredFields) {
        // Has active fields but missing required fields
        transferBtn.disabled = true;
        transferBtn.classList.add('missing-required-fields');
        transferBtn.classList.remove('no-active-fields');

        // Provide specific feedback about what's missing
        const missing = [];
        if (!hasLastName) missing.push('LastName');
        if (!hasCompany) missing.push('Company');

        transferBtn.title = `⚠️ Required: ${missing.join(' and ')} must be active and have a value`;
        transferBtn.style.opacity = '0.6';
        transferBtn.style.cursor = 'not-allowed';
        transferBtn.style.backgroundColor = '#f59e0b';
    } else {
        transferBtn.disabled = false;
        transferBtn.classList.remove('no-active-fields', 'missing-required-fields');
        transferBtn.title = `Transfer ${activeFieldCount} active field${activeFieldCount > 1 ? 's' : ''} to Salesforce`;
        transferBtn.style.opacity = '1';
        transferBtn.style.cursor = 'pointer';
        transferBtn.style.backgroundColor = '';
    }

}

// Initialize toggle change listeners 
function initializeToggleListeners() {
    document.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox' && (e.target.id?.endsWith('-toggle') || e.target.closest('.field-row, .field-container'))) {
            updateTransferButtonState();
        }
    });

}


/*
 * Collect ONLY active fields 
 * Uses custom labels (SF field names) from fieldMappingService when available
 * @returns {Object} { leadData, fieldsList, labels }
 */
function collectActiveFieldsOnly() {
    const salesforceData = {}; 
    const fieldsList = [];     
    const labels = {};          

    // System/metadata fields to exclude (not transferable to Salesforce)
    const excludedFields = new Set([
        'Id', 'CreatedDate', 'LastModifiedDate', 'CreatedById', 'LastModifiedById',
        'SystemModstamp', 'IsDeleted', 'MasterRecordId', 'LastActivityDate',
        'LastViewedDate', 'LastReferencedDate', 'Jigsaw', 'JigsawContactId',
        'CleanStatus', 'CompanyDunsNumber', 'DandbCompanyId', 'EmailBouncedReason',
        'EmailBouncedDate', 'IndividualId', 'apiEndpoint', 'credentials',
        'serverName', 'apiName', 'AttachmentIdList', 'EventID', '__metadata', 'KontaktViewId'
    ]);

    if (!window.selectedLeadData) {
        console.error('No lead data found in window.selectedLeadData');
        return { leadData: {}, fieldsList: [], labels: {} };
    }

    // Process data with labels
    const processedData = window.fieldMappingService?.applyCustomLabels(window.selectedLeadData) ||
        Object.fromEntries(Object.entries(window.selectedLeadData).map(([key, value]) => [key, {
            value,
            label: formatFieldLabel(key),
            active: true
        }]));

    // Add active custom fields to the processed data
    if (window.fieldMappingService) {
        const customFields = window.fieldMappingService.getAllCustomFields();
        customFields.forEach(field => {
            if (field.active) {
                const editedValue = window.selectedLeadData[field.sfFieldName];
                processedData[field.sfFieldName] = {
                    value: editedValue !== undefined ? editedValue : (field.value || ''),
                    label: field.label || field.sfFieldName,
                    active: true,
                    isCustomField: true
                };
            }
        });
    }

    console.log(`Processing ${Object.keys(processedData).length} fields from window.selectedLeadData (including custom fields)`);

    Object.keys(processedData).forEach(apiFieldName => {

      if (excludedFields.has(apiFieldName)) return;

        if (/\s/.test(apiFieldName)) {
            console.warn(`⚠️ Skipping field with invalid name (contains spaces): "${apiFieldName}"`);
            return;
        }

        const fieldInfo = processedData[apiFieldName];

        // Check if field is active
        const isActive = typeof fieldInfo === 'object' ? (fieldInfo.active !== false) : true;

        if (!isActive) {
            console.log(` Skipping inactive field: ${apiFieldName}`);
            return;
        }

        // Get field value
        const value = typeof fieldInfo === 'object' ? fieldInfo.value : fieldInfo;

        // For Question/Answers/Text fields, include even if null (they are real lead fields)
        const isQuestionAnswerTextField = /^(Question|Answers|Text)\d{2}$/.test(apiFieldName);

        // Skip empty values (but allow null for Question/Answers/Text fields)
        if (!isQuestionAnswerTextField) {
            if (!value || (typeof value === 'string' && (value.trim() === '' || value === 'N/A'))) {
                return;
            }
        } else {
            // For Question/Answers/Text, only skip if explicitly empty string
            if (value !== null && value !== undefined && typeof value === 'string' && (value.trim() === '' || value === 'N/A')) {
                return;
            }
        }

        // Get Salesforce field name
        let sfFieldName;

        // For STANDARD fields: always use API name (ignore custom labels)
        if (isStandardSalesforceField(apiFieldName)) {
            sfFieldName = apiFieldName;

            // Warn if user tried to set a custom label on a standard field
            const customLabel = window.fieldMappingService?.customLabels?.[apiFieldName];
            if (customLabel && customLabel !== apiFieldName) {
                console.warn(`⚠️ Custom label "${customLabel}" ignored for standard field "${apiFieldName}"`);
            }
        }
        else {
            sfFieldName = window.fieldMappingService?.customLabels?.[apiFieldName] || apiFieldName;
        }

        // Get display label
        const displayLabel = typeof fieldInfo === 'object' ? fieldInfo.label : formatFieldLabel(apiFieldName);

        // Add to salesforceData with SF field name
        salesforceData[sfFieldName] = typeof value === 'string' ? value.trim() : value;
        fieldsList.push(sfFieldName);
        labels[sfFieldName] = displayLabel;

        const valuePreview = typeof value === 'string' ? value.substring(0, 50) : String(value).substring(0, 50);
        console.log(`Active field: ${apiFieldName} → SF: ${sfFieldName} = "${valuePreview}${String(value).length > 50 ? '...' : ''}"`);
    });


    // Validation: ensure required fields are present (check both API name and SF name)
    const hasLastName = salesforceData.LastName || Object.keys(salesforceData).some(k => k.toLowerCase() === 'lastname');
    const hasCompany = salesforceData.Company || Object.keys(salesforceData).some(k => k.toLowerCase() === 'company');

    if (!hasLastName && !hasCompany) {
        console.warn('No required fields found (LastName or Company)');
    }

    return { leadData: salesforceData, fieldsList, labels };
}

/**
 * Check if a field name is a standard Salesforce field
 * @param {string} fieldName - Field name to check
 * @returns {boolean} True if standard field
 */
function isStandardSalesforceField(fieldName) {
    const standardFields = [
        // Standard Salesforce Lead fields
        'ActionCadenceAssigneeId', 'ActionCadenceId', 'ActionCadenceState',
        'ActiveTrackerCount', 'ActivityMetricId', 'ActivityMetricRollupId',
        'Address', 'AnnualRevenue', 'City', 'CleanStatus', 'Company',
        'CompanyDunsNumber', 'ConvertedAccountId', 'ConvertedContactId',
        'ConvertedDate', 'ConvertedOpportunityId', 'ConnectionReceivedId',
        'ConnectionSentId', 'Country', 'CountryCode', 'CurrencyIsoCode',
        'DandBCompanyId', 'Description', 'Division', 'Email',
        'EmailBouncedDate', 'EmailBouncedReason', 'ExportStatus', 'Fax',
        'FirstCallDateTime', 'FirstEmailDateTime', 'FirstName',
        'GeocodeAccuracy', 'GenderIdentity', 'HasOptedOutOfEmail',
        'HasOptedOutOfFax', 'IndividualId', 'Industry', 'IsConverted',
        'IsDeleted', 'IsPriorityRecord', 'IsUnreadByOwner', 'Jigsaw',
        'JigsawContactId', 'LastActivityDate', 'LastName', 'LastReferencedDate',
        'LastViewedDate', 'Latitude', 'LeadSource', 'Longitude',
        'MasterRecordId', 'MiddleName', 'MobilePhone', 'Name',
        'NumberOfEmployees', 'OwnerId', 'PartnerAccountId', 'Phone',
        'PhotoUrl', 'PostalCode', 'Pronouns', 'Rating', 'RecordTypeId',
        'Salutation', 'ScheduledResumeDateTime', 'ScoreIntelligenceId',
        'State', 'StateCode', 'Status', 'Street', 'Suffix', 'Title', 'Website',
        // System fields
        'Id', 'CreatedDate', 'LastModifiedDate', 'SystemModstamp'
    ];

    // Check field name exactly - no cleaning of __c suffix
    return standardFields.includes(fieldName);
}

/**
 * Show modern toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type: 'success', 'error', 'warning', 'info'
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

// LEAD TRANSFER STATUS TRACKING

//Save transfer status to backend after successful transfer

async function saveTransferStatus(leadId, salesforceId, status = 'Success') {
  try {
    try {
      const transferredLeads = JSON.parse(localStorage.getItem('transferred_leads') || '{}');
      transferredLeads[leadId] = {
        salesforceId: salesforceId,
        status: status,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('transferred_leads', JSON.stringify(transferredLeads));
      console.log(`Saved transfer status to localStorage for lead ${leadId}`);
    } catch (localError) {
      console.error('Failed to save to localStorage:', localError);
    }

    // Also save to backend
    const orgId = localStorage.getItem('orgId') || 'default';

    const response = await fetch(`${BACKEND_API_URL}/api/leads/transfer-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Org-Id': orgId
      },
      credentials: 'include',
      body: JSON.stringify({
        leadId,
        status,
        salesforceId
      })
    });

    if (!response.ok) {
      console.warn('Failed to save transfer status to backend:', response.statusText);
      return false;
    }

    const result = await response.json();
    console.log('Transfer status saved to backend:', result);
    return true;

  } catch (error) {
    console.error('Error saving transfer status:', error);
    return false;
  }
}


// TRANSFER BUTTON HANDLER
async function handleTransferButtonClick() {
  console.log("Transfer button clicked");
  if (isTransferInProgress) return;

  isTransferInProgress = true;

  // Enable transfer mode in FieldMappingService to prevent sync interruptions
  if (window.fieldMappingService) {
    window.fieldMappingService.setTransferMode(true);
  }

  try {
    // Load edited values from LeadEditsManager
    const eventId = sessionStorage.getItem('selectedEventId');
    if (eventId && window.leadEditsManager) {
      try {
        const edits = window.leadEditsManager.loadEdits(eventId);
        if (edits) {

          // Apply edits to window.selectedLeadData
          Object.keys(edits).forEach(fieldName => {
            if (window.selectedLeadData[fieldName] !== undefined) {

              if (typeof window.selectedLeadData[fieldName] === 'object') {
                window.selectedLeadData[fieldName].value = edits[fieldName];
              } else {
                // If primitive, replace directly
                window.selectedLeadData[fieldName] = edits[fieldName];
              }
            }
          });
        } else {
          console.log('No edited values found');
        }
      } catch (error) {
        console.error('Error loading edits:', error);
      }
    } else {
      console.warn('⚠️ LeadEditsManager not available or no EventId');
    }

    // PHASE 1: Collect ONLY Active Fields
    console.log('📋 Phase 1: Collecting active fields only...');
    const { leadData, fieldsList, labels } = collectActiveFieldsOnly();

    if (!leadData || Object.keys(leadData).length === 0) {
      showModernToast("No active fields with values to transfer", 'warning');
      return;
    }


    // Validate Required Fields 
    console.log('Phase 2: Validating required fields...');

    // Validate LastName and Company - both required
    const hasLastName = leadData.LastName && leadData.LastName.trim() !== '';
    const hasCompany = leadData.Company && leadData.Company.trim() !== '';

    if (!hasLastName && !hasCompany) {
      // Show error modal instead of toast for better visibility
      if (typeof window.showErrorModal === 'function') {
        window.showErrorModal(
          'Required Fields Missing',
          'Both Last Name and Company are required fields.\n\nPlease fill in at least one of these fields before transferring the lead to Salesforce.'
        );
      } else {
        showModernToast('Last Name and Company are required. Please fill in both fields.', 'error', 6000);
      }
      return;
    }

    if (!hasLastName) {
      if (typeof window.showErrorModal === 'function') {
        window.showErrorModal(
          'Last Name Required',
          'Last Name is a required field.\n\nPlease enter the lead\'s last name before transferring to Salesforce.'
        );
      } else {
        showModernToast('Last Name is required. Please enter a value.', 'error', 6000);
      }
      return;
    }

    if (!hasCompany) {
      if (typeof window.showErrorModal === 'function') {
        window.showErrorModal(
          'Company Required',
          'Company is a required field.\n\nPlease enter the company name before transferring to Salesforce.'
        );
      } else {
        showModernToast('Company is required. Please enter a value.', 'error', 6000);
      }
      return;
    }

    // Transfer Lead to Salesforce 
    const transferModal = showTransferLoadingModal('Transferring lead to Salesforce...');
    isTransferInProgress = true;

    // Prepare attachments if present
    const attachmentIds = leadData.AttachmentIdList || window.selectedLeadData?.AttachmentIdList;
    const attachments = await fetchAttachments(attachmentIds);

    // Transfer ONLY active fields
    const response = await transferLeadDirectlyToSalesforce(leadData, attachments);

  if (!response.ok) {
    console.error(`Transfer failed with status: ${response.status}`);
    const errorData = await response.json().catch(() => ({}));
    console.error('Error data:', errorData);

    // Close loading modal
    if (transferModal) transferModal.remove();

 
    // Handle 409 Conflict - Duplicate lead
    if (response.status === 409) {

      // Build detailed error message with identification fields
      let errorMessage = errorData.message || 'A duplicate lead was found in Salesforce.';

      // If backend provided existing lead details, show them
      if (errorData.existingLead) {
        const existing = errorData.existingLead;
        errorMessage += '\n\nExisting Lead Details:';
        if (existing.name) errorMessage += `\n• Name: ${existing.name}`;
        if (existing.company) errorMessage += `\n• Company: ${existing.company}`;
        if (existing.email) errorMessage += `\n• Email: ${existing.email}`;

        if (errorData.salesforceId) {
          errorMessage += `\n• Salesforce ID: ${errorData.salesforceId}`;
        }
      }

      const errorTitle = errorData.error === 'DUPLICATE_VALUE' ? 'Duplicate Lead Found' : 'Duplicate Lead Detected';

      if (typeof window.showErrorModal === 'function') {
        window.showErrorModal(errorTitle, errorMessage);
      } else {
        alert(`${errorTitle}\n\n${errorMessage}`);
      }
      isTransferInProgress = false;
      return;
    }

    // Handle 400 Bad Request errors (validation errors, missing fields, etc.)
    if (response.status === 400) {

      // Determine error title based on error code
      let errorTitle = 'Validation Error';
      if (errorData.error === 'MISSING_CUSTOM_FIELDS' || errorData.error === 'MISSING_FIELDS') {
        errorTitle = 'Missing Fields in Salesforce';
      }

      const errorMessage = errorData.message || 'A validation error occurred.';

      if (typeof window.showErrorModal === 'function') {
        window.showErrorModal(errorTitle, errorMessage);
      } else {
        alert(`${errorTitle}\n\n${errorMessage}`);
      }
      isTransferInProgress = false;
      return;
    }

    // Handle 500 Server errors
    if (response.status === 500) {
      console.error('🔍 Server error (500) detected');
      const errorMessage = errorData.message || 'A server error occurred.';

      if (typeof window.showErrorModal === 'function') {
        window.showErrorModal('Server Error', errorMessage);
      } else {
        alert(`Server Error\n\n${errorMessage}`);
      }
      isTransferInProgress = false;
      return;
    }

    // Other errors - display generic message with backend error if available
    const errorMessage = errorData.message || `Transfer failed with status ${response.status}`;

    if (typeof window.showErrorModal === 'function') {
      window.showErrorModal('Transfer Error', errorMessage);
    } else {
      alert(`Transfer Error\n\n${errorMessage}`);
    }
    isTransferInProgress = false;
    return;
  }


    const result = await response.json();

    // Close transfer modal
    if (transferModal) transferModal.remove();

    // Success!
    // Build success message with details
    let successMessage = `Lead successfully transferred to Salesforce!\n\n`;
    successMessage += `Salesforce ID: ${result.salesforceId || 'N/A'}\n`;
    successMessage += `Fields transferred: ${fieldsList.length}\n`;

    // Add attachment info if present
    if (result.attachmentsTransferred > 0) {
      successMessage += `Attachments: ${result.attachmentsTransferred} uploaded\n`;
    }

    // Add validation warnings if any (filter out automatic cleaning messages)
    if (result.validationWarnings && result.validationWarnings.length > 0) {
      const importantWarnings = result.validationWarnings.filter(w =>
        !w.includes('Cleaned phone number') &&
        !w.includes('Added https://')
      );

      if (importantWarnings.length > 0) {
        successMessage += `\nWarnings:\n${importantWarnings.map(w => `• ${w}`).join('\n')}`;
      }
    }

    // Clean up BEFORE showing modal to prevent interruptions
    console.log('🧹 Cleaning up before showing success modal...');
    isTransferInProgress = false;

    if (window.fieldMappingService) {
      window.fieldMappingService.setTransferMode(false);
    }

    // Close loading modals
    document.querySelectorAll('.transfer-loading-modal').forEach(m => m.remove());


    console.log('🎉 About to show success modal...');

    if (typeof window.showSuccessModal === 'function') {
      // Show success modal immediately
      window.showSuccessModal(
        'Transfer Successful!',
        successMessage.trim()
      );

      console.log('✅ Success modal displayed');
    } else {
      console.error('showSuccessModal function not found!');
      await showAlertDialog(
        'Transfer Successful!',
        successMessage.trim(),
        { type: 'success', buttonText: 'OK' }
      );
    }

    console.log('📊 Transfer complete:', result);

  } catch (error) {
    console.error('Transfer failed:', error);

    // Close any loading modals first
    document.querySelectorAll('.transfer-loading-modal').forEach(m => m.remove());

    // Parse error message for better user experience
    let errorTitle = 'Transfer Failed';
    let errorMessage = error.message || 'Unknown error occurred';

    // Detect specific error types
    if (errorMessage.includes('Custom field(s) not found')) {
      errorTitle = 'Custom Fields Missing';
    } else if (errorMessage.includes('REQUIRED_FIELD_MISSING')) {
      errorTitle = 'Required Field Missing';
    } else if (errorMessage.includes('DUPLICATE')) {
      errorTitle = 'Duplicate Record';
    } else if (errorMessage.includes('INVALID_EMAIL')) {
      errorTitle = 'Invalid Email';
    } else if (errorMessage.includes('Not connected')) {
      errorTitle = 'Connection Error';
      errorMessage = 'You are not connected to Salesforce. Please connect and try again.';
    }

    if (error.stack) {
      console.error('Error stack:', error.stack);
    }

    // Show error to user
    if (typeof window.showErrorModal === 'function') {
      window.showErrorModal(errorTitle, errorMessage);
    } else {
      console.error('showErrorModal function not found!');
      await showAlertDialog(
        errorTitle,
        errorMessage,
        { type: 'error', buttonText: 'OK' }
      );
    }

  } finally {
    console.log('🔚 Entering finally block (cleanup already done for success case)...');

    // Ensure cleanup happens even if there was an error before reaching success block
    if (isTransferInProgress) {
      console.log('⚠️ Transfer still in progress - doing emergency cleanup');
      isTransferInProgress = false;
    }

    if (window.fieldMappingService && window.fieldMappingService._isTransferInProgress) {
      console.log('🔓 Emergency: Disabling transfer mode...');
      window.fieldMappingService.setTransferMode(false);
    }

    // Close any remaining loading modals (shouldn't be any for success case)
    const loadingModals = document.querySelectorAll('.transfer-loading-modal');
    if (loadingModals.length > 0) {
      console.log(`🧹 Emergency: Removing ${loadingModals.length} loading modals...`);
      loadingModals.forEach(m => m.remove());
    }

    console.log('✨ Finally block complete');
  }
}


// DISCONNECT & CONNECT HANDLERS

/**
 * Handle connect button click - Opens Salesforce OAuth popup
 * Shows environment selector (Sandbox/Production)
 */
async function handleConnectClick() {
  try {
    // Save orgId for persistence
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
        console.log('✅ OAuth success message received:', event.data);

        const realOrgId = event.data.orgId;
        localStorage.setItem('orgId', realOrgId);

        popup.close();
        clearInterval(checkClosed);
        window.removeEventListener('message', messageListener);

        checkAuthenticationStatus();
      }
    };

    window.addEventListener('message', messageListener);

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', messageListener);
        checkAuthenticationStatus();
      }
    }, 1000);

  } catch (error) {
    console.error("Connection error:", error);
    showError("Failed to connect: " + error.message);
    updateConnectionStatus("not-connected", "Connection failed");
  }
}

/* Handle disconnect button click - using modern confirm dialog */
async function handleDisconnectClick() {
  const confirmed = await showConfirmDialog(
    'Disconnect from Salesforce?',
    'Are you sure you want to disconnect from Salesforce?',
    {
      confirmText: 'Disconnect',
      cancelText: 'Cancel',
      type: 'warning'
    }
  );

  if (!confirmed) return;

  try {
    performDisconnect();
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

  //  Clear legacy localStorage 
  try {
    localStorage.removeItem('SF_ACCESS_TOKEN');
    localStorage.removeItem('SF_INSTANCE_URL');
    localStorage.removeItem('sf_connection_status');
    localStorage.removeItem('sf_user_info');
  } catch (error) {
    console.warn("Error clearing legacy data:", error);
  }

  // Update UI
  try {
    updateConnectionStatus("not-connected", "Not connected to Salesforce");
    console.log("UI updated to disconnected state");
  } catch (error) {
    console.warn("Error updating UI:", error);
  }

  // Disable transfer button
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

  // Clear user info display 
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

  // Clear server session (optional, async)
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

  showSuccess("Successfully disconnected from Salesforce");
}

// REMOVED: Old popup-based connection - replaced by redirect to auth-start page (line 1060)


// Check authentication status after popup closes
 
async function checkAuthenticationStatus() {
  await checkSalesforceConnection();
}

// Check Salesforce connection by calling server endpoint
async function checkSalesforceConnection() {
  try {
    const persistedConnection = ConnectionPersistenceManager.loadConnection();

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

    // Background server verification 
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

      // STORE SALESFORCE TOKENS for direct API calls
      if (responseData.tokens) {
        console.log(' Storing Salesforce tokens for direct API access');
        localStorage.setItem('sf_access_token', responseData.tokens.access_token);
        localStorage.setItem('sf_instance_url', responseData.tokens.instance_url);
        console.log('Tokens stored successfully');
      }

      // Check if success modal is currently visible - if so, defer ALL background updates to avoid interfering
      const successModalExists = document.getElementById('persistent-success-modal');

      if (successModalExists) {
        console.log('⏸️ Success modal is visible - deferring ALL background verification updates (connection save and UI updates)');
        // Don't save or update UI while success modal is showing
        return;
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

        // Load active fields configuration from backend after successful connection
        if (window.fieldMappingService) {
          try {
            await window.fieldMappingService.loadActiveFieldsFromBackend();
            console.log('Loaded active fields configuration from backend after connection');
          } catch (error) {
            console.warn('⚠️ Could not load active fields from backend:', error);
          }
        }
      }

    } else if (response.status === 401) {
      // Expected when not authenticated - not an error
      console.log('Not authenticated to Salesforce (401) - this is expected when not connected');
      ConnectionPersistenceManager.clearConnection();
      updateConnectionStatus("not-connected", "Not connected to Salesforce");

    } else if (response.status === 503) {
      // Service Unavailable
      console.error("Service Unavailable (503)");
      ConnectionPersistenceManager.clearConnection();
      updateConnectionStatus("not-connected", "Service unavailable");
      showServiceUnavailableMessage();

    } else {
      console.error("Unexpected response status:", response.status);
      ConnectionPersistenceManager.clearConnection();
      updateConnectionStatus("not-connected", "Connection error");
    }
  } catch (error) {
    console.error("Connection check error:", error);
    ConnectionPersistenceManager.clearConnection();

    // Check if error is due to backend being offline
    if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
      updateConnectionStatus("not-connected", "Backend server offline");
      showBackendOfflineMessage();
    } else {
      updateConnectionStatus("not-connected", "Connection error");
    }
  }
}

// Show simple message when service is unavailable (503)
function showServiceUnavailableMessage() {
  const messageHtml = `
    <div id="service-unavailable-overlay" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    ">
      <div style="
        text-align: center;
        padding: 40px;
        max-width: 500px;
      ">
        <div style="font-size: 72px; margin-bottom: 20px;">⚠️</div>
        <h1 style="
          font-size: 32px;
          font-weight: 600;
          color: #333;
          margin: 0 0 16px 0;
        ">503 Service Unavailable</h1>
        <p style="
          font-size: 16px;
          color: #666;
          line-height: 1.6;
          margin: 0 0 24px 0;
        ">
          We were not able to resume the service because the backend is temporarily unavailable.
          Please try again in a few moments.
        </p>
        <button onclick="location.reload()" style="
          background: #4f46e5;
          color: white;
          border: none;
          padding: 12px 32px;
          border-radius: 6px;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        " onmouseover="this.style.background='#4338ca'" onmouseout="this.style.background='#4f46e5'">
          Retry
        </button>
      </div>
    </div>
  `;

  // Remove existing overlay if present
  const existingOverlay = document.getElementById('service-unavailable-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  // Add overlay
  document.body.insertAdjacentHTML('beforeend', messageHtml);
}

// Show friendly message when backend is offline
function showBackendOfflineMessage() {
  const messageHtml = `
    <div id="backend-offline-notice" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    ">
      <div style="
        text-align: center;
        padding: 40px;
        max-width: 500px;
      ">
        <div style="font-size: 72px; margin-bottom: 20px;">🔌</div>
        <h1 style="
          font-size: 32px;
          font-weight: 600;
          color: #333;
          margin: 0 0 16px 0;
        ">Backend Server Offline</h1>
        <p style="
          font-size: 16px;
          color: #666;
          line-height: 1.6;
          margin: 0 0 24px 0;
        ">
          The Node.js backend server is not running. Please start it to use Salesforce features.
        </p>
        <div style="
          background: #f5f5f5;
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 24px;
          text-align: left;
        ">
          <code style="
            font-size: 14px;
            color: #333;
            display: block;
            margin-bottom: 8px;
            font-family: 'Courier New', monospace;
          ">cd salesforce-backend</code>
          <code style="
            font-size: 14px;
            color: #333;
            display: block;
            font-family: 'Courier New', monospace;
          ">npm run dev</code>
        </div>
        <button onclick="location.reload()" style="
          background: #4f46e5;
          color: white;
          border: none;
          padding: 12px 32px;
          border-radius: 6px;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        " onmouseover="this.style.background='#4338ca'" onmouseout="this.style.background='#4f46e5'">
          Retry Connection
        </button>
      </div>
    </div>
  `;

  // Remove existing notice if present
  const existingNotice = document.getElementById('backend-offline-notice');
  if (existingNotice) {
    existingNotice.remove();
  }

  // Add new notice
  document.body.insertAdjacentHTML('beforeend', messageHtml);
}


// Display lead data in the UI
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

    // Add ALL custom fields (active and inactive) to the processed data
    // This ensures they appear in the correct filter tabs
    if (window.fieldMappingService) {
        const customFields = window.fieldMappingService.getAllCustomFields();
        customFields.forEach(field => {
            processedData[field.sfFieldName] = {
                value: field.value || data[field.sfFieldName] || '',
                label: field.label || field.sfFieldName,
                active: field.active,  // Respect the field's active state
                isCustomField: true
            };
        });
    }

    // Filtrer et afficher les champs selon leur statut - IMPORTANT: lire depuis localStorage
    const filterValue = localStorage.getItem('field-display-filter') || 'all';
    console.log(`displayLeadData() applying filter: ${filterValue}`);

    let rowsGenerated = 0;

    Object.keys(processedData).forEach((fieldName) => {
        const fieldInfo = processedData[fieldName];

        if (isSystemField(fieldName)) return;

        if (fieldName === '__metadata' || fieldName === 'KontaktViewId') return;

        const isActive = fieldInfo.active !== false;
        const isCustomField = fieldInfo.isCustomField === true;

        if (filterValue === 'active' && !isActive) return;  
        if (filterValue === 'inactive' && isActive) return;  
        if (filterValue === 'custom' && !isCustomField) return;  

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
            : filterValue === 'custom'
            ? 'No custom fields to display'
            : 'No fields to display';
        leadDataContainer.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500 py-8">${noResultsMsg}</td></tr>`;
    }

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

// Update lead information header
function updateLeadInfoHeader(data) {
    const header = document.getElementById('lead-info-header');
    if (!header) return;

    const source = 'Lead Report'; 
    const leadId = data.Id || data.EventId || 'Unknown';
    const createdDate = data.CreatedDate ? formatDate(data.CreatedDate) : 'Unknown';
    const isActive = true; 
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

// Create a table row for a field (ListView)
/**
 * Create a read-only field table row (no editing, no toggle)
 * Users must use fieldConfigurator.html to modify fields
 */
function createFieldTableRow(fieldName, fieldInfo) {
    const row = document.createElement('tr');

    // Check if field name is invalid (contains spaces or special characters)
    const hasInvalidName = /\s/.test(fieldName);
    const activeClass = fieldInfo.active ? 'active' : 'inactive';
    const invalidNameClass = hasInvalidName ? 'bg-red-50 border-l-4 border-red-500' : '';
    row.className = `table-row hover:bg-gray-50 field-row ${activeClass} ${!fieldInfo.active ? 'opacity-50 bg-gray-100' : ''} ${invalidNameClass}`;
    row.dataset.fieldName = fieldName;

    const salesforceConfig = getSalesforceFieldConfig(fieldName);
    const isRequired = salesforceConfig?.required || false;
    const displayValue = fieldInfo.value || '<span class="text-gray-400 italic">No value</span>';

    // Get custom Salesforce field name if it exists and was modified
    const customSfFieldName = window.fieldMappingService?.customLabels?.[fieldName] || '';
    const sfNameWasModified = customSfFieldName && customSfFieldName !== fieldName;

    // For custom fields: show "Custom" indicator
    // For API fields: show LS label, and SF label only if modified
    let fieldNameDisplay = '';
    if (hasInvalidName) {
        // Invalid field name: show warning
        fieldNameDisplay = `<span class="text-red-600 font-mono font-semibold">⚠️ Invalid Name (contains spaces)</span>`;
    } else if (fieldInfo.isCustomField) {
        // Custom field: show "Custom" indicator
        fieldNameDisplay = `<span class="text-purple-600 font-mono font-semibold">Custom</span>`;
    } else {
        // API field: LS: name, and SF: name only if modified
        fieldNameDisplay = `<span class="text-gray-500 font-mono">LS: ${fieldName}</span>`;
        if (sfNameWasModified) {
            fieldNameDisplay += `<span class="mx-2 text-gray-400">→</span><span class="text-green-600 font-mono font-semibold">SF: ${customSfFieldName}</span>`;
        }
    }

    // READ-ONLY row - no Actions column, no edit buttons, no toggles
    row.innerHTML = `
        <td class="px-4 py-3 whitespace-nowrap">
            <div class="flex items-center">
                <div class="flex-1">
                    <div class="flex items-center">
                        <span class="text-sm font-medium text-gray-900">${fieldInfo.label || fieldName}</span>
                        ${isRequired ? '<span class="ml-1 text-red-500">*</span>' : ''}
                    </div>
                    <div class="flex items-center mt-1 text-xs">
                        ${fieldNameDisplay}
                    </div>
                </div>
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
    `;

    return row;
}


/*
 * Only returns if field is required - all fields must already exist in Salesforce
 */
function getSalesforceFieldConfig(fieldName) {
    const requiredFields = ['LastName', 'Company'];

    return {
        required: requiredFields.includes(fieldName)
    };
}


async function transferLeadDirectlyToSalesforce(leadData, attachments) {
  try {  

    let salesforceLeadData = {};

    if (window.fieldMappingService && window.fieldMappingService.mapFieldNamesForSalesforce) {

      // Appliquer le mapping directement
      salesforceLeadData = window.fieldMappingService.mapFieldNamesForSalesforce(leadData);
    } else {
      console.warn('⚠️ FieldMappingService not available - using original field names');
      const systemFields = ['__metadata', 'KontaktViewId', 'Id', 'CreatedDate', 'LastModifiedDate',
        'CreatedById', 'LastModifiedById', 'DeviceId', 'DeviceRecordId', 'RequestBarcode',
        'EventId', 'SystemModstamp', 'AttachmentIdList', 'IsReviewed', 'StatusMessage'];

      Object.keys(leadData).forEach(key => {
        if (!systemFields.includes(key)) {
          salesforceLeadData[key] = leadData[key];
        }
      });
    }

    // Remove null/empty values
    Object.keys(salesforceLeadData).forEach(key => {
      if (salesforceLeadData[key] === null || salesforceLeadData[key] === '' || salesforceLeadData[key] === 'N/A') {
        delete salesforceLeadData[key];
      }
    });

    // Make call to backend API which handles Salesforce transfer
    const apiUrl = `${appConfig.apiBaseUrl}/salesforce/leads`;
    const orgId = localStorage.getItem('orgId') || 'default';

    // Get lead ID for status tracking (use KontaktViewId from original lead data)
    const leadIdForStatus = window.selectedLeadData?.KontaktViewId || leadData.KontaktViewId;

    // Prepare payload for backend API
    const payload = {
      leadData: salesforceLeadData,
      attachments: attachments,
      leadId: leadIdForStatus  // Add leadId for status tracking
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

    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: result.success,
        salesforceId: result.salesforceId,
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

// Display userName from sessionStorage in the page header
function displayUserName() {
    const userName = sessionStorage.getItem("userName");
    const userNameDisplay = document.getElementById("userNameDisplay");

    if (userNameDisplay && userName) {
        userNameDisplay.textContent = userName;
    }
}

// Load and display lead data from session storage with proper error handling
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

                        // Merge saved field values with original data
                        Object.assign(window.selectedLeadData, savedFieldValues);

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

                // Add timeout to prevent infinite loading
                const initPromise = window.fieldMappingService.initializeFields(window.selectedLeadData, eventId);

                if (initPromise && typeof initPromise.then === 'function') {
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Field mapping initialization timeout')), 10000)
                    );

                    await Promise.race([initPromise, timeoutPromise]);
                    console.log('Field mappings loaded from API successfully');
                } else {
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

        // Display lead
        if (dataWasUpdated) {
        } else {
        }
        displayLeadData(window.selectedLeadData);

        // Generate CardView if that was the saved view
        const savedView = localStorage.getItem('current-view');
        if (savedView === 'card') {
            generateCardView();
        }

        loadSavedChanges();

        displayAttachmentsPreview();

    } catch (error) {
        showError("Error loading lead data: " + error.message);
        
        // Fallback: try to display what we can
        if (window.selectedLeadData) {
            try {
                displayLeadData(window.selectedLeadData);
                
            } catch (displayError) {
                console.error("Failed to display lead data:", displayError);
            }
        }
    }
}


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


//Show edit action buttons

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
    console.log(` Saving field ${fieldName}: "${value}"`);

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
        
        console.log(`Field ${fieldName} saved locally for event ${eventId}`);
        
        // Indicateur visuel de sauvegarde
        showFieldSaveIndicator(fieldName);
        
    } catch (error) {
        console.error(`Error saving field ${fieldName}:`, error);
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


// Load previously saved changes from localStorage/sessionStorage
function loadSavedChanges() {
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
        console.log(' Found saved data in localStorage');
      }
    }

    if (savedData && savedData.leadData) {

      // Merge saved data with current window.selectedLeadData
      Object.assign(window.selectedLeadData, savedData.leadData);

      // Show notification about loaded data
      if (savedData.changes && Object.keys(savedData.changes).length > 0) {
        const changeCount = Object.keys(savedData.changes).length;
        const changeText = changeCount === 1 ? 'change' : 'changes';
        const timeAgo = savedData.timestamp ? formatTimeAgo(savedData.timestamp) : 'recently';

        showSuccess(`Loaded ${changeCount} previously saved ${changeText} from ${timeAgo}`);
      }

      // Re-render the lead fields with saved data
      if (typeof renderLeadFields === 'function') {
        renderLeadFields(window.selectedLeadData);
      }

      return true;
    } else {
      console.log('No saved changes found');
      return false;
    }

  } catch (error) {
    console.warn('⚠️ Error loading saved changes:', error);
    return false;
  }
}

// Format timestamp to human readable "time ago"
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

  try {
    const eventId = sessionStorage.getItem('selectedEventId') || 'default';
    const storageKey = `lead_edits_${eventId}`;

    // Clear from both storages
    sessionStorage.removeItem(storageKey);
    localStorage.removeItem(storageKey);

    console.log('Saved changes cleared');
    return true;
  } catch (error) {
    console.warn('⚠️ Error clearing saved changes:', error);
    return false;
  }
}


// Display attachments preview - ATTCHAMENTS AREA
 
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

  // Add attachments progress section (if element exists)
  if (transferStatus) {
    transferStatus.innerHTML += `
      <div class="attachment-section">
        <h4>Preparing Attachments</h4>
        <div id="attachment-progress">0/${attachmentIds.length} prepared</div>
        <div id="attachment-list"></div>
      </div>
    `;
  }

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
    if (attachmentList) {
      attachmentList.innerHTML += `
        <div id="${itemId}" class="attachment-item pending">
          <span class="attachment-name">Attachment ${i + 1}</span>
          <span class="attachment-status">Retrieving...</span>
        </div>
      `;
    }

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
  if (extension === 'svg' || contentType === 'image/svg+xml') {
    // SVG preview - decode base64 and inject directly for better rendering
    try {
      const svgString = atob(attachment.Body);
      modalBody.innerHTML = `
        <div class="flex flex-col items-center">
          <div class="bg-white p-4 rounded-lg shadow-lg" style="max-width: 800px; max-height: 700px; overflow: auto;">
            <div class="svg-container">
              ${svgString}
            </div>
          </div>
          <div class="mt-4 text-center">
            <p class="text-sm font-medium text-gray-700">${fileName}</p>
            <p class="text-xs text-gray-500">${formatFileSize(attachment.BodyLength)}</p>
          </div>
        </div>
      `;

      // Adjust SVG element to be responsive
      const svgElement = modalBody.querySelector('svg');
      if (svgElement) {
        svgElement.style.width = '100%';
        svgElement.style.height = 'auto';
        svgElement.style.maxHeight = '650px';
        svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      }
    } catch (svgError) {
      console.error('Error decoding SVG:', svgError);
      // Fallback to data URL method
      const svgSrc = `data:image/svg+xml;base64,${attachment.Body}`;
      modalBody.innerHTML = `
        <div class="flex flex-col items-center">
          <img src="${svgSrc}" alt="${fileName}" style="max-width: 800px; max-height: 700px; object-fit: contain;" class="rounded-lg shadow-lg">
          <div class="mt-4 text-center">
            <p class="text-sm font-medium text-gray-700">${fileName}</p>
            <p class="text-xs text-gray-500">${formatFileSize(attachment.BodyLength)}</p>
          </div>
        </div>
      `;
    }
  } else if (contentType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension)) {
    // Image preview
    const imgSrc = attachment.Body ? `data:${contentType || 'image/jpeg'};base64,${attachment.Body}` : '';
    modalBody.innerHTML = `
      <div class="flex flex-col items-center">
        <img src="${imgSrc}" alt="${fileName}" style="max-width: 800px; max-height: 700px; object-fit: contain;" class="rounded-lg shadow-lg">
        <div class="mt-4 text-center">
          <p class="text-sm font-medium text-gray-700">${fileName}</p>
          <p class="text-xs text-gray-500">${formatFileSize(attachment.BodyLength)}</p>
        </div>
      </div>
    `;
  } else if (contentType === 'application/pdf' || extension === 'pdf') {
    // PDF preview
    const pdfSrc = attachment.Body ? `data:application/pdf;base64,${attachment.Body}` : '';
    modalBody.innerHTML = `
      <div class="flex flex-col items-center">
        <iframe src="${pdfSrc}" style="width: 100%; height: 700px; max-width: 900px;" class="border rounded-lg shadow-lg"></iframe>
        <div class="mt-4 text-center">
          <p class="text-sm font-medium text-gray-700">${fileName}</p>
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

        // Update sidebar profile
        if (typeof window.updateUserProfileSidebar === 'function') {
            window.updateUserProfileSidebar();
        }

        // Update API status indicator
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

        // Update sidebar profile
        if (typeof window.updateUserProfileSidebar === 'function') {
            window.updateUserProfileSidebar();
        }

        // Update API status indicator
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
    const connectBtn = document.getElementById('connectButton');
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
    const connectBtn = document.getElementById('connectButton');
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
    // Use toast instead of alert
    showSuccessToast(message);
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
    // Use toast instead of alert
    showErrorToast(message);
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


// Handle field filter changes
function handleFieldFilterChange(event) {
    const filterValue = event.target.value;
    console.log(`Field filter changed to: ${filterValue}`);

    if (window.selectedLeadData) {
        displayLeadData(window.selectedLeadData);
    }

    // Update statistics after filtering
    if (typeof window.updateFieldStats === 'function') {
        window.updateFieldStats();
    } else {
        updateFieldStats();
    }

    // Update transfer button state based on visible active fields
    setTimeout(() => updateTransferButtonState(), 100);
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

        // Load active fields configuration from backend
        try {
            await window.fieldMappingService.loadActiveFieldsFromBackend();
            console.log('Loaded active fields configuration from backend');
        } catch (error) {
            console.warn('⚠️ Could not load active fields from backend (may not be connected yet):', error);
        }

        // Initialize custom fields tab
        initializeCustomFieldsTab();

        // Initialize modal event listeners
        setupModalEventListeners();

        document.getElementById('save-custom-label')?.addEventListener('click', saveCustomLabel);

         // Update statistics
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


// Save custom label from modal
 
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

    const hasSpaces = /\s/.test(customLabel);
    if (hasSpaces) {
        showError('Invalid field name: Spaces are not allowed.\n\nExamples of valid names:\n• Company__c\n• Question01__c\n• CustomField__c\n\nExamples of invalid names:\n• Company Name (has space)\n• Job title new (has spaces)');
        customLabelInput.focus();
        customLabelInput.select();
        return;
    }

    // Vérifier que c'est un nom de champ SF valide
    const isValidSFFieldName = /^[a-zA-Z][a-zA-Z0-9_]*(__c|__C)?$/.test(customLabel);
    if (!isValidSFFieldName) {
        showError('Invalid Salesforce field name format.\n\nField names must:\n• Start with a letter\n• Contain only letters, numbers, and underscores\n• End with __c for custom fields\n\nExamples: Company, Title, Question01__c, CustomField__c');
        customLabelInput.focus();
        customLabelInput.select();
        return;
    }

    
    const standardLeadFields = [
        'FirstName', 'LastName', 'Email', 'Phone', 'MobilePhone', 'Fax', 'Company',
        'Title', 'Street', 'City', 'State', 'PostalCode', 'Country', 'CountryCode',
        'Salutation', 'Website', 'Description', 'Industry', 'Department'
    ];

    if (standardLeadFields.includes(fieldName) && customLabel.endsWith('__c')) {
        showError(`Warning: "${fieldName}" is a STANDARD Salesforce field.\n\nYou are trying to map it to "${customLabel}" which is a CUSTOM field name.\n\n💡 Solution:\n• Keep the standard name: "${fieldName}"\n• OR create a custom field "${customLabel}" in Salesforce first\n\nStandard fields should NOT have __c suffix.`);
        customLabelInput.focus();
        customLabelInput.select();
        return;
    }

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

    const isStandardField = isStandardSalesforceField(fieldName);
    const currentLabel = window.fieldMappingService?.customLabels[fieldName] || '';

    modal.innerHTML = `
        <div class="config-modal-content" style="max-width: 600px;">
            <div class="config-modal-header">
                <h3>Edit Salesforce Field Mapping</h3>
                <button class="config-modal-close">&times;</button>
            </div>
            <div class="config-modal-body">
                <div class="form-group">
                    <label style="font-weight: 600; color: #374151;">API Field Name</label>
                    <input type="text" id="edit-field-api-name" class="form-input" readonly value="${fieldName}" style="background: #f3f4f6; cursor: not-allowed;">
                    <small style="color: #6b7280; font-size: 0.75rem;">This is the original field name from your data source</small>
                </div>

                ${isStandardField ? `
                    <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 6px; padding: 12px; margin: 16px 0;">
                        <div style="display: flex; align-items: start; gap: 8px;">
                            <svg style="width: 20px; height: 20px; color: #f59e0b; flex-shrink: 0; margin-top: 2px;" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                            </svg>
                            <div>
                                <strong style="color: #92400e; display: block; margin-bottom: 4px;">Standard Salesforce Field</strong>
                                <p style="color: #92400e; font-size: 0.875rem; margin: 0;">This is a standard field. Custom labels for standard fields are used for display only and will be ignored during transfer to Salesforce.</p>
                            </div>
                        </div>
                    </div>
                ` : ''}

                <div class="form-group">
                    <label style="font-weight: 600; color: #374151;">
                        ${isStandardField ? 'Display Label (optional)' : 'Salesforce Field Name'}
                        ${!isStandardField ? '<span style="color: #ef4444;">*</span>' : ''}
                    </label>
                    <input
                        type="text"
                        id="edit-field-custom-label"
                        class="form-input"
                        placeholder="${isStandardField ? 'Display name for UI' : 'e.g., Products Interest'}"
                        value="${currentLabel}"
                        ${isStandardField ? '' : 'required'}
                        style="font-family: 'Courier New', monospace;"
                    >
                    <small style="color: #6b7280; font-size: 0.75rem;">
                        ${isStandardField
                            ? 'This label is for display purposes only in the UI'
                            : '⚠️ Use underscores (_) instead of spaces. Only letters, numbers, and underscores allowed.'
                        }
                    </small>
                </div>

                ${!isStandardField ? `
                    <div id="salesforce-preview-container" style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 12px; margin-top: 16px; display: none;">
                        <div style="display: flex; align-items: start; gap: 8px;">
                            <svg style="width: 20px; height: 20px; color: #22c55e; flex-shrink: 0; margin-top: 2px;" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                            </svg>
                            <div style="flex: 1;">
                                <strong style="color: #166534; display: block; margin-bottom: 4px;">Salesforce Field Preview</strong>
                                <code id="salesforce-field-preview" style="background: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 4px; font-size: 0.875rem; display: inline-block;"></code>
                            </div>
                        </div>
                    </div>

                    <div id="validation-error" style="background: #fee; border: 1px solid #fca5a5; border-radius: 6px; padding: 12px; margin-top: 16px; display: none;">
                        <div style="display: flex; align-items: start; gap: 8px;">
                            <svg style="width: 20px; height: 20px; color: #dc2626; flex-shrink: 0; margin-top: 2px;" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                            </svg>
                            <div>
                                <strong style="color: #991b1b; display: block; margin-bottom: 4px;">Invalid Field Name</strong>
                                <p id="validation-error-message" style="color: #991b1b; font-size: 0.875rem; margin: 0;"></p>
                            </div>
                        </div>
                    </div>
                ` : ''}

                <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px; margin-top: 16px; border-radius: 4px;">
                    <strong style="color: #1e40af; font-size: 0.875rem; display: block; margin-bottom: 4px;">Salesforce Naming Rules:</strong>
                    <ul style="color: #1e3a8a; font-size: 0.813rem; margin: 4px 0 0 0; padding-left: 20px;">
                        <li>Must start with a letter (A-Z, a-z)</li>
                        <li>Only letters, numbers, and underscores allowed</li>
                        <li><strong>NO SPACES</strong> - use underscores (_) instead</li>
                        <li>Maximum 40 characters</li>
                        ${!isStandardField ? '<li>Custom fields automatically get <code>__c</code> suffix</li>' : ''}
                    </ul>
                </div>
            </div>
            <div class="config-modal-footer">
                <button class="config-btn cancel-btn">Cancel</button>
                <button class="config-btn export-btn" id="save-custom-label" disabled style="opacity: 0.5;">Save Label</button>
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

    // Real-time validation for custom fields
    const labelInput = modal.querySelector('#edit-field-custom-label');
    const saveButton = modal.querySelector('#save-custom-label');
    const previewContainer = modal.querySelector('#salesforce-preview-container');
    const previewField = modal.querySelector('#salesforce-field-preview');
    const errorContainer = modal.querySelector('#validation-error');
    const errorMessage = modal.querySelector('#validation-error-message');

    if (!isStandardField && labelInput && saveButton) {
        // Validate and preview on input (STRICT MODE - NO AUTO-CORRECTION)
        labelInput.addEventListener('input', () => {
            const value = labelInput.value.trim();

            if (!value) {
                // Empty input
                if (previewContainer) previewContainer.style.display = 'none';
                if (errorContainer) errorContainer.style.display = 'none';
                saveButton.disabled = true;
                saveButton.style.opacity = '0.5';
                return;
            }

            // STRICT Validation rules - NO automatic correction
            const errors = [];

            // Must start with letter
            if (!/^[a-zA-Z]/.test(value)) {
                errors.push('Must start with a letter (A-Z, a-z)');
            }

            // NO SPACES ALLOWED - Force user to use underscores
            if (/\s/.test(value)) {
                errors.push('⛔ Spaces are NOT allowed - use underscores (_) instead');
            }

            // Check for invalid characters (ONLY letters, numbers, underscores)
            const invalidChars = value.match(/[^a-zA-Z0-9_]/g);
            if (invalidChars && !(/\s/.test(value))) { // Don't show this if already showing space error
                errors.push(`Invalid characters: ${[...new Set(invalidChars)].join(', ')}`);
            }

            // Check minimum length
            if (value.length < 2) {
                errors.push('Field name must be at least 2 characters');
            }

            // Check maximum length (40 chars without __c)
            const baseLength = value.replace(/__c$/i, '').length;
            if (baseLength > 40) {
                errors.push(`Too long! Max 40 characters (currently ${baseLength})`);
            }

            // Show errors or preview
            if (errors.length > 0) {
                if (errorContainer && errorMessage) {
                    errorMessage.innerHTML = errors.map(e => `• ${e}`).join('<br>');
                    errorContainer.style.display = 'block';
                }
                if (previewContainer) previewContainer.style.display = 'none';
                saveButton.disabled = true;
                saveButton.style.opacity = '0.5';
            } else {
                // Valid input - show preview
                if (errorContainer) errorContainer.style.display = 'none';
                if (previewContainer && previewField) {
                    // Show with __c suffix if not already present
                    const preview = value.endsWith('__c') || value.endsWith('__C')
                        ? value.replace(/__C$/i, '__c')
                        : `${value}__c`;
                    previewField.textContent = preview;
                    previewContainer.style.display = 'block';
                }
                saveButton.disabled = false;
                saveButton.style.opacity = '1';
            }
        });

        // Trigger validation on initial load if there's a value
        if (currentLabel) {
            labelInput.dispatchEvent(new Event('input'));
        }
    } else if (isStandardField && labelInput && saveButton) {
        // For standard fields, always enable save button
        labelInput.addEventListener('input', () => {
            const value = labelInput.value.trim();
            // Allow any value for standard fields (it's just for display)
            saveButton.disabled = false;
            saveButton.style.opacity = '1';
        });

        // Enable immediately if there's an initial value
        if (currentLabel) {
            saveButton.disabled = false;
            saveButton.style.opacity = '1';
        }
    }

    // Focus on input
    setTimeout(() => {
        if (labelInput) {
            labelInput.focus();
            // If there's existing text, select it for easy replacement
            if (currentLabel) {
                labelInput.select();
            }
        }
    }, 100);
}


/**
 * Initialize the Custom Fields tab system
 */
function initializeCustomFieldsTab() {

    // REMOVED: Filter buttons no longer exist in read-only transfer page
    // Users must use fieldConfigurator.html to manage fields

    // REMOVED: Add custom field button - no longer available in transfer page
    // Users must use fieldConfigurator.html to add custom fields

    console.log('Custom Fields tab functionality disabled - use fieldConfigurator.html instead');
}

/**
 * Handle tab switching between All/Active/Inactive/Custom Fields
 * REMOVED: Filter tabs no longer exist in read-only transfer page
 * Users must use fieldConfigurator.html to filter and manage fields
 */
function handleTabSwitch(event) {
    // No longer needed - filter tabs removed from UI
    console.log('⚠️ Tab switching disabled - use fieldConfigurator.html to manage fields');
}



// CUSTOM FIELDS MANAGEMENT 

// Show success toast notification
function showSuccessToast(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed top-20 right-6 bg-white border-l-4 border-green-500 rounded-lg shadow-xl p-4 flex items-center gap-3 z-50 transform transition-all duration-300';
    toast.style.animation = 'slideInRight 0.3s ease-out';

    toast.innerHTML = `
        <div class="flex-shrink-0 w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
            <i class="fas fa-check text-green-600 text-lg"></i>
        </div>
        <div class="flex-1">
            <p class="font-semibold text-gray-900 text-sm">Success!</p>
            <p class="text-gray-600 text-xs mt-0.5">${message}</p>
        </div>
        <button onclick="this.parentElement.remove()" class="text-gray-400 hover:text-gray-600">
            <i class="fas fa-times"></i>
        </button>
    `;

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

/**
 * Show error toast notification
 */
function showErrorToast(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed top-20 right-6 bg-white border-l-4 border-red-500 rounded-lg shadow-xl p-4 flex items-center gap-3 z-50 transform transition-all duration-300';
    toast.style.animation = 'slideInRight 0.3s ease-out';

    toast.innerHTML = `
        <div class="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <i class="fas fa-exclamation-circle text-red-600 text-lg"></i>
        </div>
        <div class="flex-1">
            <p class="font-semibold text-gray-900 text-sm">Error</p>
            <p class="text-gray-600 text-xs mt-0.5">${message}</p>
        </div>
        <button onclick="this.parentElement.remove()" class="text-gray-400 hover:text-gray-600">
            <i class="fas fa-times"></i>
        </button>
    `;

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

/**
 * Render custom fields in table format
 */
function renderCustomFieldsTable() {
    const tableBody = document.getElementById('custom-fields-table-body');
    const emptyState = document.getElementById('custom-fields-empty-state');

    if (!tableBody || !window.fieldMappingService) return;

    const customFields = window.fieldMappingService.getAllCustomFields();

    if (customFields.length === 0) {
        tableBody.parentElement.parentElement.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    tableBody.parentElement.parentElement.style.display = 'block';
    emptyState.style.display = 'none';
    tableBody.innerHTML = '';

    customFields.forEach(field => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 transition-colors';

        row.innerHTML = `
            <td class="px-4 py-3">
                <span class="text-sm font-medium text-gray-900">${escapeHtml(field.sfFieldName)}</span>
            </td>
            <td class="px-4 py-3">
                ${field.value ? `<span class="text-sm text-gray-700">${escapeHtml(field.value)}</span>` : '<span class="text-sm text-gray-400 italic">From lead data</span>'}
            </td>
            <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                    <label class="toggle-switch inline-block align-middle">
                        <input type="checkbox" ${field.active ? 'checked' : ''} data-custom-field-id="${field.id}">
                        <span class="toggle-slider"></span>
                    </label>
                    <span class="status-badge px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${field.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                        ${field.active ? 'Active' : 'Inactive'}
                    </span>
                </div>
            </td>
            <td class="px-4 py-3">
                <div class="flex gap-2">
                    <button class="edit-custom-field-btn px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs font-medium transition-colors" data-field-id="${field.id}" title="Edit field">
                        <i class="fas fa-edit mr-1"></i> Edit
                    </button>
                    <button class="delete-custom-field-btn px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-medium transition-colors" data-field-id="${field.id}" title="Delete field">
                        <i class="fas fa-trash mr-1"></i> Delete
                    </button>
                </div>
            </td>
        `;

        // Event listeners
        const toggle = row.querySelector('input[type="checkbox"]');
        const editBtn = row.querySelector('.edit-custom-field-btn');
        const deleteBtn = row.querySelector('.delete-custom-field-btn');

        console.log('🔧 Setting up event listeners for custom field:', field.sfFieldName, {
            toggleFound: !!toggle,
            editBtnFound: !!editBtn,
            deleteBtnFound: !!deleteBtn
        });

        if (!toggle || !editBtn || !deleteBtn) {
            console.error('Missing elements for custom field row:', field.sfFieldName);
            return;
        }

        toggle.addEventListener('change', async () => {
            console.log('🎯 Toggle clicked for custom field:', field.sfFieldName);
            const isChecked = toggle.checked;

            // Toggle the field
            await window.fieldMappingService.toggleCustomField(field.id);
            console.log(`Custom field ${field.id} toggled to ${isChecked}`);

            const fieldRow = toggle.closest('tr');
            if (fieldRow) {
                const statusBadge = fieldRow.querySelector('.status-badge');
                if (statusBadge) {
                    if (isChecked) {
                        statusBadge.className = 'status-badge px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800';
                        statusBadge.textContent = 'Active';
                    } else {
                        statusBadge.className = 'status-badge px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800';
                        statusBadge.textContent = 'Inactive';
                    }
                }
            }

            // Update field stats
            if (typeof window.updateFieldStats === 'function') {
                window.updateFieldStats();
            }

            // Update transfer button state
            setTimeout(() => updateTransferButtonState(), 100);
        });

        editBtn.addEventListener('click', () => {
            openEditCustomFieldModal(field);
        });

        deleteBtn.addEventListener('click', async () => {
            const confirmed = await showConfirmDialog(
                'Delete Custom Field?',
                `Are you sure you want to delete the custom field "${field.sfFieldName}"?\n\nThis action cannot be undone.`,
                {
                    confirmText: 'Delete',
                    cancelText: 'Cancel',
                    type: 'danger'
                }
            );

            if (confirmed) {
                await window.fieldMappingService.deleteCustomField(field.id);
                renderCustomFieldsTable();
                showSuccessToast('Custom field deleted successfully');
                console.log(`Custom field ${field.id} deleted`);
            }
        });

        tableBody.appendChild(row);
    });
}

/**
 * Open modal to add a new custom field
 */
function openAddCustomFieldModal() {
    const modalHTML = `
        <div id="add-custom-field-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style="animation: fadeIn 0.2s ease-in-out;">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4" style="animation: slideUp 0.3s ease-out;">
                <!-- Header -->
                <div class="flex justify-between items-center p-6 border-b border-gray-200">
                    <div class="flex items-center">
                        <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                            <i class="fas fa-plus text-green-600 text-lg"></i>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-gray-900">Add Custom Field</h3>
                            <p class="text-xs text-gray-500 mt-0.5">Map to existing Salesforce field</p>
                        </div>
                    </div>
                    <button id="close-add-custom-field-modal" class="text-gray-400 hover:text-gray-600 transition-colors">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>

                <!-- Body -->
                <div class="p-6 space-y-4">
                    <!-- Field Name -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fab fa-salesforce text-blue-600 mr-1"></i>
                            Field Name <span class="text-red-500">*</span>
                        </label>
                        <input type="text" id="custom-field-sfname"
                               class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-sm font-mono bg-gray-50">
                        <div class="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <p class="text-xs text-amber-800 flex items-start">
                                <i class="fas fa-exclamation-triangle text-amber-600 mr-2 mt-0.5"></i>
                                <span><strong>Important:</strong> Enter the exact Salesforce API field name (case-sensitive). This field must already exist in your org.</span>
                            </p>
                        </div>
                    </div>

                    <!-- Field Value -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            Value <span class="text-gray-400 text-xs">(optional)</span>
                        </label>
                        <input type="text" id="custom-field-value"
                               class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-sm">
                        <p class="text-xs text-gray-500 mt-1.5">Default value for all leads. If empty, value will be taken from lead data.</p>
                    </div>

                    <!-- Active Field Toggle -->
                    <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div class="flex items-center">
                            <i class="fas fa-toggle-on text-green-500 mr-2"></i>
                            <div>
                                <label class="text-sm font-semibold text-gray-700">Active Field</label>
                                <p class="text-xs text-gray-500">Enable this field for lead transfers</p>
                            </div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="custom-field-active" checked>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>

                <!-- Footer -->
                <div class="flex justify-end gap-3 p-6 bg-gray-50 border-t border-gray-200 rounded-b-xl">
                    <button id="cancel-add-custom-field" class="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm">
                        Cancel
                    </button>
                    <button id="save-add-custom-field" class="px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors font-medium text-sm flex items-center">
                        <i class="fas fa-check mr-2"></i>
                        Add Field
                    </button>
                </div>
            </div>
        </div>

        <style>
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideUp {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        </style>
    `;

    // Remove existing modal if any
    const existingModal = document.getElementById('add-custom-field-modal');
    if (existingModal) existingModal.remove();

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Event listeners
    const modal = document.getElementById('add-custom-field-modal');
    const closeBtn = document.getElementById('close-add-custom-field-modal');
    const cancelBtn = document.getElementById('cancel-add-custom-field');
    const saveBtn = document.getElementById('save-add-custom-field');
    const sfNameInput = document.getElementById('custom-field-sfname');
    const valueInput = document.getElementById('custom-field-value');
    const activeInput = document.getElementById('custom-field-active');

    const closeModal = () => modal.remove();

    // Real-time validation for field name
    const validateFieldName = () => {
        const fieldName = sfNameInput.value.trim();

        // Check for spaces
        if (/\s/.test(fieldName)) {
            sfNameInput.classList.add('border-red-500', 'bg-red-50');
            sfNameInput.classList.remove('border-gray-300');
            saveBtn.disabled = true;
            saveBtn.classList.add('opacity-50', 'cursor-not-allowed');

            // Show warning message
            let warningDiv = document.getElementById('field-name-warning');
            if (!warningDiv) {
                warningDiv = document.createElement('div');
                warningDiv.id = 'field-name-warning';
                warningDiv.className = 'mt-2 p-2 bg-red-50 border border-red-300 rounded text-xs text-red-700';
                warningDiv.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i><strong>Invalid:</strong> Spaces are not allowed in field names. Use underscores instead.';
                sfNameInput.parentElement.appendChild(warningDiv);
            }
            return false;
        } else {
            sfNameInput.classList.remove('border-red-500', 'bg-red-50');
            sfNameInput.classList.add('border-gray-300');
            saveBtn.disabled = false;
            saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');

            // Remove warning if exists
            const warningDiv = document.getElementById('field-name-warning');
            if (warningDiv) warningDiv.remove();
            return true;
        }
    };

    // Add input listener for real-time validation
    sfNameInput.addEventListener('input', validateFieldName);

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    saveBtn.addEventListener('click', async () => {
        const sfFieldName = sfNameInput.value.trim();
        const value = valueInput.value.trim();
        const isActive = activeInput.checked;

        // Validation: Field name is required
        if (!sfFieldName) {
            showErrorToast('Please enter a Salesforce field name');
            sfNameInput.focus();
            return;
        }

        // Validation: Check for spaces (most important check)
        if (/\s/.test(sfFieldName)) {
            showErrorToast('❌ Field name cannot contain spaces. Use underscores instead (e.g., "My_Field__c")');
            sfNameInput.focus();
            return;
        }

        // Validation: Value is required for custom fields
        if (!value) {
            showErrorToast('Value is required for custom fields. Custom field values cannot be empty.');
            valueInput.focus();
            return;
        }

        // Validate field name - check for forbidden characters
        const forbiddenChars = /[@#$%'^*()={}[\]\\./<>":?|,+!&]/;
        if (forbiddenChars.test(sfFieldName)) {
            showErrorToast('Field name contains invalid characters. Only letters, numbers, and underscores are allowed.');
            sfNameInput.focus();
            return;
        }

        // Check if field name starts with a letter
        if (!/^[a-zA-Z]/.test(sfFieldName)) {
            showErrorToast('Field name must start with a letter');
            sfNameInput.focus();
            return;
        }

        // Check if field already exists
        if (window.fieldMappingService.customFieldExists(sfFieldName)) {
            showErrorToast(`A custom field with Salesforce name "${sfFieldName}" already exists`);
            return;
        }

        // Add field
        try {
            await window.fieldMappingService.addCustomField({
                sfFieldName: sfFieldName,
                value: value,
                active: isActive
            });

            renderCustomFieldsTable();
            closeModal();

            // Show success message with activation status
            const statusText = isActive ? 'added and activated' : 'added as inactive';
            showSuccessToast(`Custom field "${sfFieldName}" ${statusText}!`);

            // If active, refresh the current view to show it in Active Only tab
            if (isActive && window.selectedLeadData) {
                const currentFilter = localStorage.getItem('field-display-filter') || 'active';
                if (currentFilter === 'active') {
                    const isCardView = document.getElementById('cardViewBtn')?.classList.contains('active');
                    if (isCardView) {
                        generateCardView();
                    } else {
                        displayLeadData(window.selectedLeadData);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to add custom field:', error);
            showErrorToast(`Failed to add custom field: ${error.message}`);
        }
    });

    // Focus on first input
    setTimeout(() => sfNameInput.focus(), 100);
}

/**
 * Open modal to edit an existing custom field
 */
function openEditCustomFieldModal(field) {
    const modalHTML = `
        <div id="edit-custom-field-modal" class="modal show" style="display: flex;">
            <div class="modal-content" style="max-width: 500px;">
                <div class="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-t-xl flex justify-between items-center">
                    <h3 class="text-lg font-bold">Edit Custom Field</h3>
                    <button id="close-edit-custom-field-modal" class="text-white hover:text-gray-200 text-2xl font-bold">&times;</button>
                </div>
                <div class="p-6">
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            Salesforce Field Name <span class="text-red-500">*</span>
                        </label>
                        <input type="text" id="edit-custom-field-sfname" value="${escapeHtml(field.sfFieldName)}"
                               class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm">
                        <p class="text-xs text-gray-500 mt-1">⚠️ Changing this may break existing mappings</p>
                    </div>

                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            Constant Value <span class="text-red-500">*</span>
                        </label>
                        <input type="text" id="edit-custom-field-value" value="${escapeHtml(field.value || '')}"
                               class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                               placeholder="Enter field value">
                        <p class="text-xs text-gray-500 mt-1">Custom field values must be non-empty strings</p>
                    </div>

                    <div class="mb-6 flex items-center">
                        <label class="toggle-switch mr-3">
                            <input type="checkbox" id="edit-custom-field-active" ${field.active ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                        <span class="text-sm font-medium text-gray-700">Active Field</span>
                    </div>

                    <div class="flex justify-end space-x-3">
                        <button id="cancel-edit-custom-field" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
                            Cancel
                        </button>
                        <button id="save-edit-custom-field" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    const existingModal = document.getElementById('edit-custom-field-modal');
    if (existingModal) existingModal.remove();

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('edit-custom-field-modal');
    const closeBtn = document.getElementById('close-edit-custom-field-modal');
    const cancelBtn = document.getElementById('cancel-edit-custom-field');
    const saveBtn = document.getElementById('save-edit-custom-field');
    const sfNameInput = document.getElementById('edit-custom-field-sfname');
    const valueInput = document.getElementById('edit-custom-field-value');
    const activeToggle = document.getElementById('edit-custom-field-active');

    const closeModal = () => modal.remove();

    // Real-time validation for field name
    const validateFieldName = () => {
        const fieldName = sfNameInput.value.trim();

        // Check for spaces
        if (/\s/.test(fieldName)) {
            sfNameInput.classList.add('border-red-500', 'bg-red-50');
            sfNameInput.classList.remove('border-gray-300');
            saveBtn.disabled = true;
            saveBtn.classList.add('opacity-50', 'cursor-not-allowed');

            // Show warning message
            let warningDiv = document.getElementById('edit-field-name-warning');
            if (!warningDiv) {
                warningDiv = document.createElement('div');
                warningDiv.id = 'edit-field-name-warning';
                warningDiv.className = 'mt-2 p-2 bg-red-50 border border-red-300 rounded text-xs text-red-700';
                warningDiv.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i><strong>Invalid:</strong> Spaces are not allowed in field names. Use underscores instead.';
                sfNameInput.parentElement.appendChild(warningDiv);
            }
            return false;
        } else {
            sfNameInput.classList.remove('border-red-500', 'bg-red-50');
            sfNameInput.classList.add('border-gray-300');
            saveBtn.disabled = false;
            saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');

            // Remove warning if exists
            const warningDiv = document.getElementById('edit-field-name-warning');
            if (warningDiv) warningDiv.remove();
            return true;
        }
    };

    // Add input listener for real-time validation
    sfNameInput.addEventListener('input', validateFieldName);

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // ESC key to close
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);

    saveBtn.addEventListener('click', async () => {
        const sfFieldName = sfNameInput.value.trim();
        const value = valueInput.value.trim();
        const isActive = activeToggle.checked;

        // Validation: Field name is required
        if (!sfFieldName) {
            showErrorToast('Please enter a Salesforce field name');
            sfNameInput.focus();
            return;
        }

        // Validation: Check for spaces (most important check)
        if (/\s/.test(sfFieldName)) {
            showErrorToast('❌ Field name cannot contain spaces. Use underscores instead (e.g., "My_Field__c")');
            sfNameInput.focus();
            return;
        }

        // Validation: Value is required for custom fields
        if (!value) {
            showErrorToast('Value is required for custom fields. Custom field values cannot be empty.');
            valueInput.focus();
            return;
        }

        try {
            await window.fieldMappingService.updateCustomField(field.id, {
                sfFieldName: sfFieldName,
                value: value,
                active: isActive
            });

            renderCustomFieldsTable();
            closeModal();
            showSuccessToast('Custom field updated successfully!');
        } catch (error) {
            console.error('Failed to update custom field:', error);
            showErrorToast(`Failed to update custom field: ${error.message}`);
        }
    });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show modern confirm dialog
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {Object} options - Options {confirmText, cancelText, type}
 * @returns {Promise<boolean>} True if confirmed, false if cancelled
 */
function showConfirmDialog(title, message, options = {}) {
    return new Promise((resolve) => {
        const {
            confirmText = 'OK',
            cancelText = 'Cancel',
            type = 'warning' // warning, danger, info
        } = options;

        const typeColors = {
            warning: 'bg-yellow-500 hover:bg-yellow-600',
            danger: 'bg-red-500 hover:bg-red-600',
            info: 'bg-blue-500 hover:bg-blue-600'
        };

        const typeIcons = {
            warning: '<i class="fas fa-exclamation-triangle text-yellow-500 text-4xl mb-4"></i>',
            danger: '<i class="fas fa-trash-alt text-red-500 text-4xl mb-4"></i>',
            info: '<i class="fas fa-info-circle text-blue-500 text-4xl mb-4"></i>'
        };

        const modalHTML = `
            <div id="modern-confirm-modal" class="fixed inset-0 z-[9999] flex items-center justify-center" style="background: rgba(0, 0, 0, 0.5); animation: fadeIn 0.2s ease-out;">
                <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 transform" style="animation: slideUp 0.3s ease-out;">
                    <div class="p-6 text-center">
                        ${typeIcons[type]}
                        <h3 class="text-xl font-bold text-gray-900 mb-2">${escapeHtml(title)}</h3>
                        <p class="text-gray-600 mb-6 whitespace-pre-line">${escapeHtml(message)}</p>
                        <div class="flex gap-3 justify-center">
                            <button id="modal-cancel-btn" class="px-6 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors">
                                ${escapeHtml(cancelText)}
                            </button>
                            <button id="modal-confirm-btn" class="px-6 py-2.5 ${typeColors[type]} text-white rounded-lg font-medium transition-colors">
                                ${escapeHtml(confirmText)}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <style>
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            </style>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('modern-confirm-modal');
        if (existingModal) existingModal.remove();

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const modal = document.getElementById('modern-confirm-modal');
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');

        const closeModal = (result) => {
            modal.style.animation = 'fadeOut 0.2s ease-out';
            setTimeout(() => {
                modal.remove();
                resolve(result);
            }, 200);
        };

        confirmBtn.addEventListener('click', () => closeModal(true));
        cancelBtn.addEventListener('click', () => closeModal(false));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(false);
        });

        // ESC key to cancel
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal(false);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    });
}

/**
 * Show modern alert dialog
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {Object} options - Options {buttonText, type}
 * @returns {Promise<void>}
 */
function showAlertDialog(title, message, options = {}) {
    return new Promise((resolve) => {
        const {
            buttonText = 'OK',
            type = 'info' // info, success, error, warning
        } = options;

        const typeColors = {
            info: 'bg-blue-500 hover:bg-blue-600',
            success: 'bg-green-500 hover:bg-green-600',
            error: 'bg-red-500 hover:bg-red-600',
            warning: 'bg-yellow-500 hover:bg-yellow-600'
        };

        const typeIcons = {
            info: '<i class="fas fa-info-circle text-blue-500 text-4xl mb-4"></i>',
            success: '<i class="fas fa-check-circle text-green-500 text-4xl mb-4"></i>',
            error: '<i class="fas fa-exclamation-circle text-red-500 text-4xl mb-4"></i>',
            warning: '<i class="fas fa-exclamation-triangle text-yellow-500 text-4xl mb-4"></i>'
        };

        const modalHTML = `
            <div id="modern-alert-modal" class="fixed inset-0 z-[9999] flex items-center justify-center" style="background: rgba(0, 0, 0, 0.5); animation: fadeIn 0.2s ease-out;">
                <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 transform" style="animation: slideUp 0.3s ease-out;">
                    <div class="p-6 text-center">
                        ${typeIcons[type]}
                        <h3 class="text-xl font-bold text-gray-900 mb-2">${escapeHtml(title)}</h3>
                        <p class="text-gray-600 mb-6 whitespace-pre-line">${escapeHtml(message)}</p>
                        <button id="modal-ok-btn" class="px-8 py-2.5 ${typeColors[type]} text-white rounded-lg font-medium transition-colors">
                            ${escapeHtml(buttonText)}
                        </button>
                    </div>
                </div>
            </div>
            <style>
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            </style>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('modern-alert-modal');
        if (existingModal) existingModal.remove();

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const modal = document.getElementById('modern-alert-modal');
        const okBtn = document.getElementById('modal-ok-btn');

        const closeModal = () => {
            modal.style.animation = 'fadeOut 0.2s ease-out';
            setTimeout(() => {
                modal.remove();
                resolve();
            }, 200);
        };

        okBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // ESC or Enter key to close
        const handleKey = (e) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
                closeModal();
                document.removeEventListener('keydown', handleKey);
            }
        };
        document.addEventListener('keydown', handleKey);
    });
}


window.openEditLabelModal = openEditLabelModal;
window.closeEditLabelModal = closeEditLabelModal;
window.saveCustomLabel = saveCustomLabel;

// Make functions globally accessible for professional production use
window.leadTransferController = {
  handleTransferButtonClick,
  showError,
  updateConnectionStatus,
  // validateBusinessLogic,
  toggleLabelEditMode,
  handleFieldFilterChange,
  saveFieldMappingConfig,
  loadSavedChanges,
  clearSavedChanges,
  // isFieldDirectlyEditable,
  saveFieldValue
};


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

// UI COMPONENTS & INTERACTIVE FEATURES
 
// View state management
let currentView = 'list'; // 'list' or 'card'

function initializeUIComponents() {

    // Initialize filter dropdown with saved value
    initializeFilterDropdown();

    setupViewToggle();
    setupFilterButtons();
    setupUserProfileUpdates();
    setupAPIStatusIndicator();
    setupStatsCardsClickHandlers();
    setupDisconnectButton();
    setupFieldRowsObserver();
}

// Initialize hidden filter dropdown with saved value

function initializeFilterDropdown() {
    // Initialize to 'active' by default if not set
    let savedFilter = localStorage.getItem('field-display-filter');
    if (!savedFilter) {
        savedFilter = 'active';
        localStorage.setItem('field-display-filter', 'active');
    }

    let dropdown = document.getElementById('field-display-filter');
    if (!dropdown) {
        dropdown = document.createElement('select');
        dropdown.id = 'field-display-filter';
        dropdown.style.display = 'none';
        document.body.appendChild(dropdown);
    }
    dropdown.value = savedFilter;
}

function applyFilterToAllViews(filterValue, forceRerender = false) {

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

    if (forceRerender) {
        console.log('🔄 Re-rendering views with new filter...');
        if (currentView === 'list') {
            if (window.selectedLeadData && typeof displayLeadData === 'function') {
                displayLeadData(window.selectedLeadData);
            }
        } else {
            if (typeof generateCardView === 'function') {
                generateCardView();
            }
        }
    } else {
        
        if (currentView === 'list') {
            const allRows = document.querySelectorAll('.lead-field, .field-row');
            allRows.forEach(row => {
                const toggle = row.querySelector('input[type="checkbox"]');
                const isActive = toggle ? toggle.checked : true;

                if (filterValue === 'all') {
                    row.style.display = '';
                } else if (filterValue === 'active') {
                    row.style.display = isActive ? '' : 'none';
                } else if (filterValue === 'inactive') {
                    row.style.display = isActive ? 'none' : '';
                }
            });
        } else {
            // Filter card view cards
            const allCards = document.querySelectorAll('.field-card');
            allCards.forEach(card => {
                const toggle = card.querySelector('input[type="checkbox"]');
                const isActive = toggle ? toggle.checked : true;

                if (filterValue === 'all') {
                    card.style.display = '';
                } else if (filterValue === 'active') {
                    card.style.display = isActive ? '' : 'none';
                } else if (filterValue === 'inactive') {
                    card.style.display = isActive ? 'none' : '';
                }
            });
        }
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

// Setup filter buttons (All/Active/Inactive)
function setupFilterButtons() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    if (filterButtons.length === 0) return;

    // Restore last filter from localStorage and apply it
    const savedFilter = localStorage.getItem('field-display-filter') || 'all';

    // Restore active button styling
    filterButtons.forEach(btn => {
        if (btn.dataset.filter === savedFilter) {
            btn.classList.add('active', 'text-blue-600', 'border-blue-600');
            btn.classList.remove('text-gray-600', 'border-transparent');
        } else {
            btn.classList.remove('active', 'text-blue-600', 'border-blue-600');
            btn.classList.add('text-gray-600', 'border-transparent');
        }
    });


    // Add click listeners to all filter buttons
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const filterValue = btn.dataset.filter;
            // Use configured rendering strategy
            applyFilterToAllViews(filterValue, USE_RERENDER_STRATEGY);
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

    // Restore saved view from localStorage
    const savedView = localStorage.getItem('current-view') || 'list';
    currentView = savedView;

    if (savedView === 'card') {
        cardViewBtn.classList.add('active');
        listViewBtn.classList.remove('active');
        listContainer.style.display = 'none';
        cardContainer.style.display = 'grid';
    } else {
        listViewBtn.classList.add('active');
        cardViewBtn.classList.remove('active');
        listContainer.style.display = 'block';
        cardContainer.style.display = 'none';
    }

    listViewBtn.addEventListener('click', () => {
        currentView = 'list';
        localStorage.setItem('current-view', 'list');
        listViewBtn.classList.add('active');
        cardViewBtn.classList.remove('active');
        listContainer.style.display = 'block';
        cardContainer.style.display = 'none';

        // Apply current filter without regenerating the view
        const currentFilter = localStorage.getItem('field-display-filter') || 'all';
        applyFilterToAllViews(currentFilter);
        console.log('Switched to ListView with filter:', currentFilter);
    });

    cardViewBtn.addEventListener('click', () => {
        currentView = 'card';
        localStorage.setItem('current-view', 'card');
        cardViewBtn.classList.add('active');
        listViewBtn.classList.remove('active');
        listContainer.style.display = 'none';
        cardContainer.style.display = 'grid';

        // Check if cards exist, if not generate them
        const existingCards = cardContainer.querySelectorAll('.field-card');
        if (existingCards.length === 0) {
            console.log('No cards found, generating CardView...');
            generateCardView();
        } else {
            // Apply current filter to existing cards
            const currentFilter = localStorage.getItem('field-display-filter') || 'all';
            applyFilterToAllViews(currentFilter);
            console.log('Switched to CardView with filter:', currentFilter);
        }
    });
}

// Generate Card View from lead data with filter applied 
function generateCardView() {

    const cardContainer = document.getElementById('card-view-container');
    if (!cardContainer || !window.selectedLeadData) {
        console.warn('⚠️ CardView: container ou data manquant');
        return;
    }

    // Get current filter
    const filterValue = localStorage.getItem('field-display-filter') || 'all';

    cardContainer.innerHTML = '';

    // Process data with labels
    const processedData = window.fieldMappingService?.applyCustomLabels(window.selectedLeadData) ||
        Object.fromEntries(Object.entries(window.selectedLeadData).map(([key, value]) => [key, {
            value,
            label: formatFieldLabel(key),
            active: true
        }]));

    // Add ALL custom fields (active and inactive) to the processed data
    // This ensures they appear in the correct filter tabs
    if (window.fieldMappingService) {
        const customFields = window.fieldMappingService.getAllCustomFields();
        customFields.forEach(field => {
            const editedValue = window.selectedLeadData[field.sfFieldName];
            processedData[field.sfFieldName] = {
                value: editedValue !== undefined ? editedValue : (field.value || ''),
                label: field.label || field.sfFieldName,
                active: field.active, 
                isCustomField: true
            };
        });
    }

    let cardsGenerated = 0;

    Object.keys(processedData).forEach((fieldName) => {
        const fieldInfo = processedData[fieldName];

        // Skip system fields
        if (isSystemField(fieldName)) return;
        if (fieldName === '__metadata' || fieldName === 'KontaktViewId') return;

        // Apply filter
        const isActive = fieldInfo.active !== false;
        const isCustomField = fieldInfo.isCustomField === true;

        if (filterValue === 'active' && !isActive) return;
        if (filterValue === 'inactive' && isActive) return;
        if (filterValue === 'custom' && !isCustomField) return;

        // Get Salesforce config for required fields
        const salesforceConfig = getSalesforceFieldConfig(fieldName);
        const isRequired = salesforceConfig?.required || false;

        const card = createFieldCard(fieldName, fieldInfo.label || fieldName, fieldInfo.value || '', isActive, isRequired, isCustomField);
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

    console.log(`Generated ${cardsGenerated} cards with filter: ${filterValue}`);

    // Update stats
    setTimeout(() => {
        updateFieldStats();
        if (typeof updateTransferButtonState === 'function') updateTransferButtonState();
    }, 100);
}

// Create a field card element
/**
 * Create a read-only field card (no editing, no toggle)
 * Users must use fieldConfigurator.html to modify fields
 */
function createFieldCard(fieldName, fieldLabel, fieldValue, isActive, isRequired, isCustomField = false) {
    const card = document.createElement('div');

    // Check if field name is invalid (contains spaces or special characters)
    const hasInvalidName = /\s/.test(fieldName);
    const invalidNameClass = hasInvalidName ? 'border-l-4 border-red-500 bg-red-50' : '';

    card.className = `field-card bg-white rounded-lg p-4 ${isActive ? 'active-field' : 'inactive-field'} ${invalidNameClass}`;
    card.dataset.fieldName = fieldName;

    const customFieldName = window.fieldMappingService?.customLabels?.[fieldName] || '';
    const escapeHtml = (text) => {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    // Prepare field name display with warning for invalid names
    let fieldNameDisplay = '';
    if (hasInvalidName) {
        fieldNameDisplay = `<span class="text-red-600 font-mono font-semibold">⚠️ Invalid Name (contains spaces)</span>`;
    } else {
        fieldNameDisplay = `<span class="text-gray-500 font-mono">API: ${escapeHtml(fieldName)}</span>`;
        if (customFieldName) {
            fieldNameDisplay += `<br><span class="text-green-600 font-mono font-semibold">SF: ${escapeHtml(customFieldName)}</span>`;
        }
    }

    // READ-ONLY card - no edit buttons, no toggles
    card.innerHTML = `
        <div class="flex justify-between items-start mb-3">
            <div class="flex-1">
                <h3 class="text-sm font-semibold text-gray-800 mb-1">
                    ${escapeHtml(fieldLabel)}
                    ${isRequired ? '<span class="text-red-500 ml-1">*</span>' : ''}
                </h3>
                <div class="text-xs mt-1">
                    ${fieldNameDisplay}
                </div>
            </div>
            <div class="flex items-center">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                    ${isActive ? 'Active' : 'Inactive'}
                </span>
            </div>
        </div>
        <div class="mb-2">
            <p class="text-sm text-gray-700 break-words">${escapeHtml(fieldValue) || '<span class="text-gray-400 italic">No value</span>'}</p>
        </div>
    `;

    // Card click (no longer used for editing - read-only mode)
    // Users must go to fieldConfigurator.html to edit

    return card;
}

// Sync card toggle with list toggle
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

// Sync list toggle with card toggle

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

// Open edit modal for field editing
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
        saveBtn.onclick = async () => {
            await saveFieldEdit(fieldName, fieldValueInput.value, activeToggle.checked);
            closeModal();
        };
    }
}

// Save field edit from modal
async function saveFieldEdit(fieldName, newValue, isActive) {

    // Get EventId from sessionStorage
    const eventId = sessionStorage.getItem('selectedEventId');

    if (!eventId) {
        console.warn('⚠️ No EventId found - cannot save edit to localStorage');
    }

    // Update in-memory data (IMPORTANT for Salesforce transfer)
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
        console.log(`Memory updated: ${fieldName} = "${newValue}", active: ${isActive}`);
    }

    // 2. Save to LeadEditsManager (for all fields)
    if (eventId && window.leadEditsManager) {
        try {
            const success = window.leadEditsManager.saveFieldEdit(eventId, fieldName, newValue);

            if (success) {
                console.log(`Saved to LeadEditsManager: ${fieldName} = "${newValue}"`);
            } else {
                console.error(`Failed to save to LeadEditsManager`);
            }
        } catch (error) {
            console.error(`Error saving to LeadEditsManager:`, error);
        }
    } else {
        console.warn(`⚠️ Skipping save - no EventId or LeadEditsManager not available`);
    }

    // 3. Check if this is a custom field - if so, save to LS_FieldMappingsView API
    const fieldInfo = window.selectedLeadData?.[fieldName];
    const isCustomField = fieldInfo && typeof fieldInfo === 'object' && fieldInfo.isCustomField === true;

    if (isCustomField && eventId) {
        
        try {
            await saveCustomFieldEditToAPI(eventId, fieldName, newValue, isActive);
        } catch (error) {
            console.error(`Failed to save custom field to API:`, error);
        }
    }

    if (window.fieldMappingService && window.selectedLeadData[fieldName]) {
        const config = window.fieldMappingService.getFieldConfig(fieldName);
        if (config) {
            config.active = isActive;
            console.log(`Updated in-memory active state for ${fieldName}: ${isActive}`);
        }
    }

    const listFieldElement = document.querySelector(`.lead-field[data-field-name="${fieldName}"], .field-row[data-field-name="${fieldName}"]`);
    if (listFieldElement) {
        const valueSpan = listFieldElement.querySelector('.field-value');
        if (valueSpan) valueSpan.textContent = newValue;

        const toggle = listFieldElement.querySelector('input[type="checkbox"]');
        if (toggle && toggle.checked !== isActive) {
            toggle.checked = isActive;
        }

        if (isActive) {
            listFieldElement.classList.remove('opacity-50', 'bg-gray-100', 'inactive');
            listFieldElement.classList.add('active');
        } else {
            listFieldElement.classList.add('opacity-50', 'bg-gray-100', 'inactive');
            listFieldElement.classList.remove('active');
        }

        // Update status badge
        const statusBadge = listFieldElement.querySelector('.px-2.inline-flex');
        if (statusBadge) {
            statusBadge.className = `px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`;
            statusBadge.textContent = isActive ? 'Active' : 'Inactive';
        }
    }

    // Synchronize with CardView (toggle AND value)
    syncToggleWithCardView(fieldName, isActive);

    // Update CardView field value
    const cardElement = document.querySelector(`.field-card[data-field-name="${fieldName}"]`);
    if (cardElement) {
        // Find the value paragraph (it's in a div.mb-3 after the header)
        const valueElement = cardElement.querySelector('.mb-3 > p.text-sm');
        if (valueElement) {
            valueElement.innerHTML = newValue ? escapeHtml(newValue) : '<span class="text-gray-400 italic">No value</span>';
        }
    }

    // Update statistics
    updateFieldStats();

    // 4. Update transfer button state
    if (typeof updateTransferButtonState === 'function') {
        updateTransferButtonState();
    }

    console.log(`Field updated: ${fieldName} = "${newValue}", active: ${isActive}`);
}

/**
 * Save custom field edit to LS_FieldMappingsView API by EventId
 * This stores custom field values in the ConfigData JSON structure
 */
async function saveCustomFieldEditToAPI(eventId, fieldName, newValue, isActive) {
    try {
        

        // Get credentials for API authentication
        const credentials = window.fieldMappingService?.credentials;
        if (!credentials) {
            return false;
        }

        const baseUrl = 'https://lstest.convey.de/apisftest/LS_FieldMappingsView';
        const authHeader = 'Basic ' + btoa(credentials.username + ':' + credentials.password);

        // Find existing record for this EventId
        const filterUrl = `${baseUrl}?$filter=EventId eq '${eventId}'`;
        console.log(`🔍 Checking for existing record: ${filterUrl}`);

        const existingResponse = await fetch(filterUrl, {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json'
            }
        });

        if (!existingResponse.ok) {
            console.error(`Failed to fetch existing record: ${existingResponse.status}`);
            return false;
        }

        const existingData = await existingResponse.json();
        const existingRecord = existingData.value?.[0];

        let configData = {
            fieldConfig: { config: { fields: [] } },
            customLabels: {},
            customFields: [],
            fieldValues: {},  // New section for storing field values
            lastModified: new Date().toISOString(),
            version: "1.0"
        };

        // Merge with existing ConfigData if record exists
        if (existingRecord && existingRecord.ConfigData) {
            try {
                configData = JSON.parse(existingRecord.ConfigData);
            } catch (e) {
            }
        }

        // Update field value in ConfigData
        if (!configData.fieldValues) {
            configData.fieldValues = {};
        }
        configData.fieldValues[fieldName] = {
            value: newValue,
            active: isActive,
            updatedAt: new Date().toISOString()
        };
        configData.lastModified = new Date().toISOString();

        // Save back to API (PATCH if exists, POST if new)
        const payload = {
            EventId: eventId,
            ConfigData: JSON.stringify(configData)
        };

        let saveResponse;
        if (existingRecord) {
            // PATCH existing record
            const patchUrl = `${baseUrl}(guid'${existingRecord.FieldMappingsViewId}')`;
            saveResponse = await fetch(patchUrl, {
                method: 'PATCH',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });
        } else {
            // POST new record
            console.log(`➕ Creating new record for EventId: ${eventId}`);

            saveResponse = await fetch(baseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });
        }

        if (!saveResponse.ok) {
            console.error(`Failed to save to API: ${saveResponse.status} ${saveResponse.statusText}`);
            return false;
        }

        console.log(`Successfully saved custom field edit to LS_FieldMappingsView API`);
        return true;

    } catch (error) {
        console.error('Error saving custom field to API:', error);
        return false;
    }
}


function showBulkActionSuccessModal(message) {
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
 * Show bulk action error modal
 */
function showBulkActionErrorModal(message) {
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
 * Update field statistics
 */
function updateFieldStats() {
    let activeCount = 0;
    let inactiveCount = 0;
    const excludedFields = new Set(['__metadata', 'KontaktViewId']);

    // Count from data source instead of DOM for accuracy
    if (window.selectedLeadData && window.fieldMappingService) {
        // Process lead data with labels
        const processedData = window.fieldMappingService.applyCustomLabels(window.selectedLeadData) ||
            Object.fromEntries(Object.entries(window.selectedLeadData).map(([key, value]) => [key, {
                value,
                label: formatFieldLabel(key),
                active: true
            }]));

        // Add custom fields
        const customFields = window.fieldMappingService.getAllCustomFields();
        customFields.forEach(field => {
            const editedValue = window.selectedLeadData[field.sfFieldName];
            processedData[field.sfFieldName] = {
                value: editedValue !== undefined ? editedValue : (field.value || ''),
                label: field.label || field.sfFieldName,
                active: field.active,
                isCustomField: true
            };
        });

        // Count active/inactive fields
        Object.keys(processedData).forEach(fieldName => {
            if (excludedFields.has(fieldName)) return;

            const fieldInfo = processedData[fieldName];
            const isActive = fieldInfo.active !== false;

            if (isActive) {
                activeCount++;
            } else {
                inactiveCount++;
            }
        });
    } else {
        // Fallback: count from DOM if data not available
        const isVisible = (el) => !!(el && el.offsetParent !== null);
        let fieldNodes = Array.from(document.querySelectorAll('.lead-field[data-field-name], .field-row[data-field-name]')).filter(isVisible);
        if (fieldNodes.length === 0) {
            fieldNodes = Array.from(document.querySelectorAll('.field-card[data-field-name]')).filter(isVisible);
        }

        const seen = new Set();
        for (const node of fieldNodes) {
            const name = node.dataset.fieldName || node.dataset.field;
            if (!name || seen.has(name)) continue;
            seen.add(name);

            const toggle = node.querySelector('input[type="checkbox"]');
            if (toggle && toggle.checked) activeCount++;
            else inactiveCount++;
        }
    }

    const totalCount = activeCount + inactiveCount;
    const el = (id) => document.getElementById(id);
    if (el('active-field-count')) el('active-field-count').textContent = activeCount;
    if (el('inactive-field-count')) el('inactive-field-count').textContent = inactiveCount;
    if (el('total-field-count')) el('total-field-count').textContent = totalCount;

    console.log(`Stats updated: ${activeCount} active, ${inactiveCount} inactive, ${totalCount} total`);
}

// Setup user profile updates
 function setupUserProfileUpdates() {
    const observer = new MutationObserver(() => updateUserProfileSidebar());
    const profileElement = document.getElementById('salesforceUserInfo');
    if (profileElement) observer.observe(profileElement, { childList: true, subtree: true });
}

/**
 * Update user profile in header
 */
function updateUserProfileSidebar() {
    const headerProfile = document.getElementById('user-profile-header');
    const userName = document.getElementById('user-name-header');
    const userEmail = document.getElementById('user-email-header');
    const userAvatar = document.getElementById('user-avatar-header');
    const disconnectBtn = document.getElementById('disconnect-sf-btn');

    if (!headerProfile || !userName) return;

    let userInfo = null;
    try {
        const userInfoData = JSON.parse(localStorage.getItem('sf_user_info'));
        if (userInfoData?.userInfo) userInfo = userInfoData.userInfo;
    } catch (e) {}

    if (userInfo) {
        headerProfile.style.display = 'flex';
        if (disconnectBtn) disconnectBtn.style.display = 'flex';
        userName.textContent = userInfo.display_name || userInfo.username || 'User';
        if (userEmail) userEmail.textContent = userInfo.username || '-';
        if (userAvatar) {
            const initials = (userInfo.display_name || userInfo.username || 'U')
                .split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
            userAvatar.textContent = initials;
        }
    } else {
        headerProfile.style.display = 'none';
        if (disconnectBtn) disconnectBtn.style.display = 'none';
    }
}

// Setup API status indicator
function setupAPIStatusIndicator() {
    updateAPIStatus();
    setInterval(updateAPIStatus, 5000);
}

// Update API status
function updateAPIStatus() {
    const statusCard = document.getElementById('api-status-card');
    if (!statusCard) return;

    try {
        const userInfoData = localStorage.getItem('sf_user_info');
        const persistedConnection = userInfoData ? JSON.parse(userInfoData) : null;
        const isConnected = persistedConnection?.status === 'connected' && persistedConnection?.expiresAt > Date.now();

        if (isConnected) {
            const displayName = persistedConnection.userInfo?.display_name || persistedConnection.userInfo?.username || 'Connected';
            statusCard.className = 'flex items-center px-3 py-2 bg-green-50 border border-green-200 rounded-lg';
            statusCard.innerHTML = `
                <div class="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                <div>
                    <span class="text-xs font-medium text-green-700">API Status</span>
                    <p class="text-xs text-green-600">Connected</p>
                </div>
            `;
        } else {
            statusCard.className = 'flex items-center px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg';
            statusCard.innerHTML = `
                <div class="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
                <div>
                    <span class="text-xs font-medium text-gray-600">API Status</span>
                    <p class="text-xs text-gray-500">Disconnected</p>
                </div>
            `;
        }
    } catch (e) {}
}

/**
 * Setup stats cards click handlers
 * REMOVED: Stats cards have been removed from the UI - read-only transfer page
 */
function setupStatsCardsClickHandlers() {
    // No longer needed - stats cards removed
}

// Setup disconnect button
 
function setupDisconnectButton() {
    const disconnectBtn = document.getElementById('disconnect-sf-btn');
    if (!disconnectBtn) return;

    disconnectBtn.addEventListener('click', async () => {
        const confirmed = await showConfirmDialog(
            'Disconnect from Salesforce?',
            'Are you sure you want to disconnect from Salesforce?',
            {
                confirmText: 'Disconnect',
                cancelText: 'Cancel',
                type: 'warning'
            }
        );

        if (!confirmed) return;

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
            await showAlertDialog(
                'Successfully Disconnected',
                'You have been disconnected. The page will reload...',
                { type: 'success', buttonText: 'OK' }
            );
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
            console.log('Field rows detected, updating stats...');
            updateFieldStats();
        }
    });

    observer.observe(leadDataContainer, { childList: true, subtree: false });
}

// Auto-initialize UI components when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUIComponents);
} else {    
    initializeUIComponents();
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
  saveFieldValue
};