// Controller simplified for demo - Lead transfer to Salesforce
import { appConfig } from '../config/salesforceConfig.js';
import SalesforceService from '../services/salesforceService.js';



// Initialize Salesforce service
const sfService = new SalesforceService();

// Global variables
let selectedLeadData = null;
let leadSource = null;
let authWindow = null;
let isTransferInProgress = false;
let sessionToken = localStorage.getItem('sf_session_token');

// Initialization when page loads
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Lead transfer page loaded');
  
  const transferBtn = document.getElementById('transferToSalesforceBtn');
  const backButton = document.getElementById('backButton');
  
  // Load lead data
  loadLeadData();
  
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'salesforce-auth-success') {
      console.log('Received auth success message');
      
      // Save session token
      if (event.data.sessionToken) {
        sessionToken = event.data.sessionToken;
        localStorage.setItem('sf_session_token', sessionToken);
        
        // Update interface
        updateConnectionStatus('connected', `Connected to Salesforce`);
        
        // Continue transfer if in progress
        if (isTransferInProgress) {
          continueTransferWithToken();
        }
      }
    }
  });
  
  // Add event handlers to buttons
  if (transferBtn) {
    transferBtn.addEventListener('click', handleTransferButtonClick);
  }
  
  if (backButton) {
    backButton.addEventListener('click', () => {
      const source = sessionStorage.getItem('selectedLeadSource');
      window.location.href = source === 'LeadReport' ? 'displayLsLeadReport.html' : 'displayLsLead.html';
    });
  }
  
  // Check if already connected
  if (sessionToken) {
    updateConnectionStatus('connected', 'Connected to Salesforce');
  } else {
    updateConnectionStatus('not-connected', 'Not connected to Salesforce');
  }
});

// Handle click on transfer button
async function handleTransferButtonClick() {
  if (isTransferInProgress) return;
  
  const transferBtn = document.getElementById('transferToSalesforceBtn');
  const transferResults = document.getElementById('transferResults');
  const transferStatus = document.getElementById('transferStatus');
  
  if (!selectedLeadData) {
    showError('No lead data available.');
    return;
  }
  
  isTransferInProgress = true;
  transferBtn.disabled = true;
  transferBtn.innerHTML = `
    <div class="spinner"></div>
    Connecting and transferring...
  `;
  
  try {
    // Show progress indicator
    transferResults.style.display = 'block';
    
    // If no session token, start authentication
    if (!sessionToken) {
      updateConnectionStatus('connecting', 'Connecting to Salesforce...');
      
      transferStatus.innerHTML = `
        <div class="transfer-pending">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          Salesforce authentication in progress...
        </div>
      `;
      
      // Start authentication
      const authUrl = await fetch(`${appConfig.apiBaseUrl}/salesforce/auth`)
        .then(response => response.json())
        .then(data => data.authUrl);
      
      authWindow = window.open(authUrl, 'salesforceAuth', 'width=600,height=700');
      
      if (!authWindow) {
        throw new Error('Popup blocked! Please allow popups for this site.');
      }
      
      // Process will continue when authentication message is received
      return;
    }
    
    // Otherwise, proceed directly to transfer
    await continueTransferWithToken();
  } catch (error) {
    console.error('Process failure:', error);
    
    // Show error
    transferStatus.innerHTML = `
      <div class="status-error">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        Transfer failed: ${error.message || 'Unknown error'}
      </div>
    `;
    
    // Reset button
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

// Continue transfer with token
 
async function continueTransferWithToken() {
  const transferStatus = document.getElementById('transferStatus');
  const transferBtn = document.getElementById('transferToSalesforceBtn');
  
  try {
    // Show transfer status
    transferStatus.innerHTML = `
      <div class="transfer-pending">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        Lead transfer in progress...
      </div>
    `;
    
    // Direct call to transfer API
    console.log('Direct transfer with token:', sessionToken);
    
    const leadDataToSend = {...selectedLeadData};

    delete leadDataToSend.State; 
    for (let field in leadDataToSend) {
      // Check if value is invalid
      if (
        leadDataToSend[field] === 'N/A' || 
        leadDataToSend[field] === 'null' || 
        leadDataToSend[field] === 'undefined' ||
        leadDataToSend[field] === null ||
        leadDataToSend[field] === undefined
      ) {
        // Remove field completely instead of sending invalid value
        delete leadDataToSend[field];
      }
    }

    // Special handling for required fields
    if (!leadDataToSend.LastName || leadDataToSend.LastName === 'N/A') {
      leadDataToSend.LastName = 'Unknown';
    }

    if (!leadDataToSend.Company || leadDataToSend.Company === 'N/A') {
      leadDataToSend.Company = 'Unknown';
    }

    // Special handling for Country
    if (leadDataToSend.Country === 'N/A') {
      delete leadDataToSend.Country;
    }
    
    const response = await fetch(`${appConfig.apiBaseUrl}/direct-lead-transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionToken,
        leadData: leadDataToSend
      })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      // If session expired, remove token and restart authentication
      if (response.status === 401) {
        localStorage.removeItem('sf_session_token');
        sessionToken = null;
        
        // Restart authentication
        handleTransferButtonClick();
        return;
      }
      
      throw new Error(result.message || `Error ${response.status}`);
    }
    
    // Show result
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
        <p><strong>Message:</strong> ${result.message}</p>
      </div>
    `;
    
    // Update connection status
    updateConnectionStatus('connected', 'Connected to Salesforce');
  } catch (error) {
    console.error('Error during transfer:', error);
    
    transferStatus.innerHTML = `
      <div class="status-error">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        Transfer failed: ${error.message || 'Unknown error'}
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

/**
 * Load lead data from session
 */
function loadLeadData() {
  try {
    const leadDataStr = sessionStorage.getItem('selectedLeadData');
    leadSource = sessionStorage.getItem('selectedLeadSource');
    
    if (!leadDataStr || !leadSource) {
      showError('No lead data found. Please select a lead first.');
      setTimeout(() => {
        window.location.href = leadSource === 'LeadReport' ? 'displayLsLeadReport.html' : 'displayLsLead.html';
      }, 2000);
      return;
    }
    
    // Update lead source
    const leadSourceElement = document.getElementById('leadSource');
    if (leadSourceElement) {
      leadSourceElement.textContent = leadSource === 'LeadReport' ? 'Lead Report' : 'Lead';
    }
    
    // Parse lead data
    selectedLeadData = JSON.parse(leadDataStr);
    
    // Display data
    displayLeadData(selectedLeadData);
  } catch (error) {
    console.error('Error loading lead data:', error);
    showError('Error loading lead data. Please try again.');
  }
}

/**
 * Verify if the session token is still valid
 */
async function verifySessionToken() {
  if (!sessionToken) {
    updateConnectionStatus('not-connected', 'Not connected to Salesforce');
    return false;
  }
  
  try {
    // Quick ping to check if token is valid
    const response = await fetch(`${appConfig.apiBaseUrl}salesforce/session-check`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Session-Token': sessionToken
      }
    });
    
    if (!response.ok) {
      // Token is invalid or expired
      sessionToken = null;
      localStorage.removeItem('sf_session_token');
      updateConnectionStatus('not-connected', 'Session expired. Please reconnect');
      return false;
    }
    
    // Token is valid
    updateConnectionStatus('connected', 'Connected to Salesforce');
    return true;
  } catch (error) {
    console.error('Error verifying session:', error);
    
    // If server is not responding, better to assume we're not connected
    sessionToken = null;
    localStorage.removeItem('sf_session_token');
    updateConnectionStatus('not-connected', 'Connection error. Please reconnect');
    return false;
  }
}



/**
 * Display lead data in interface
 */
function displayLeadData(data) {
  const leadDataContainer = document.getElementById('leadData');
  
  if (leadDataContainer) {
    leadDataContainer.innerHTML = '';
    
    if (!data || Object.keys(data).length === 0) {
      leadDataContainer.innerHTML = '<div class="no-data">No lead data available</div>';
      return;
    }
    
    // Create info grid
    const infoGrid = document.createElement('div');
    infoGrid.className = 'lead-info-grid';
    
    // Define priority fields
    const priorityFields = ['Id', 'FirstName', 'LastName', 'Email', 'Company', 'Phone', 'MobilePhone', 'Title', 'Industry'];
    const excludedFields = ['__metadata', 'KontaktViewId'];
    
    // Display priority fields first
    priorityFields.forEach(field => {
      if (data[field]) {
        infoGrid.appendChild(createFieldElement(field, data[field]));
      }
    });
    
    // Then other fields
    Object.keys(data).forEach(field => {
      if (
        !priorityFields.includes(field) && 
        !excludedFields.includes(field) && 
        field !== 'AttachmentIdList' &&
        !field.endsWith(' ')
      ) {
        infoGrid.appendChild(createFieldElement(field, data[field]));
      }
    });
    
    leadDataContainer.appendChild(infoGrid);
  }
}

/**
 * Create element to display lead field
 */
function createFieldElement(label, value) {
  const fieldElement = document.createElement('div');
  fieldElement.className = 'lead-field';
  
  const labelElement = document.createElement('div');
  labelElement.className = 'field-label';
  labelElement.textContent = label;
  
  const valueElement = document.createElement('div');
  valueElement.className = 'field-value';
  
  // Format dates if needed
  if (label.includes('Date') || label === 'SystemModstamp') {
    try {
      const date = new Date(value);
      valueElement.textContent = !isNaN(date) ? date.toLocaleString() : (value || 'N/A');
    } catch (e) {
      valueElement.textContent = value || 'N/A';
    }
  } else {
    valueElement.textContent = value || 'N/A';
  }
  
  fieldElement.appendChild(labelElement);
  fieldElement.appendChild(valueElement);
  
  return fieldElement;
}

/**
 * Update connection status indicator
 */
function updateConnectionStatus(status, message) {
  const statusIndicator = document.querySelector('.status-indicator');
  const statusText = document.querySelector('.sf-connection-status span');
  
  if (statusIndicator && statusText) {
    statusIndicator.className = 'status-indicator';
    statusIndicator.classList.add(status);
    statusText.textContent = message;
  }
}

/**
 * Show error message
 */
function showError(message) {
  const errorElement = document.getElementById('errorMessage');
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    setTimeout(() => {
      errorElement.style.display = 'none';
    }, 5000);
  } else {
    console.error('Error message element not found:', message);
    alert(message);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Lead transfer page loaded');
  
  // Get DOM elements
  const transferBtn = document.getElementById('transferToSalesforceBtn');
  const backButton = document.getElementById('backButton');
  
  // Load lead data
  loadLeadData();
  
  // Listen for authentication messages
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'salesforce-auth-success') {
      console.log('Received auth success message');
      
      // Save session token
      if (event.data.sessionToken) {
        sessionToken = event.data.sessionToken;
        localStorage.setItem('sf_session_token', sessionToken);
        
        // Update interface
        updateConnectionStatus('connected', `Connected to Salesforce`);
        
        // Continue transfer if in progress
        if (isTransferInProgress) {
          continueTransferWithToken();
        }
      }
    }
  });
  
  // Add event handlers to buttons
  if (transferBtn) {
    transferBtn.addEventListener('click', handleTransferButtonClick);
  }
  
  if (backButton) {
    backButton.addEventListener('click', () => {
      const source = sessionStorage.getItem('selectedLeadSource');
      window.location.href = source === 'LeadReport' ? 'displayLsLeadReport.html' : 'displayLsLead.html';
    });
  }
  
  // Check if already connected and verify token
  if (sessionToken) {
    // Show connecting status while we verify
    updateConnectionStatus('connecting', 'Verifying connection...');
    
    // Verify if the token is still valid
    await verifySessionToken();
  } else {
    updateConnectionStatus('not-connected', 'Not connected to Salesforce');
  }
});