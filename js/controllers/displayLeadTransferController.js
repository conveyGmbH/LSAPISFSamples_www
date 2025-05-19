// LeadTransferController.js - Handles the lead transfer UI and process
import { appConfig } from "../config/salesforceConfig.js";
import ApiService from "../services/apiService.js";
import SalesforceService from "../services/SalesforceService.js";
import SalesforceConfigController from "../controllers/salesforceConfigController.js";

// Global variables
let selectedLeadData = null;
let leadSource = null;
let isTransferInProgress = false;

/* Initialize controller when DOM is loaded */
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Lead transfer page loaded");

  // Initialize Salesforce service with API base URL
  const salesforceService = SalesforceService.getInstance(appConfig.apiBaseUrl);

  const transferBtn = document.getElementById("transferToSalesforceBtn");
  const backButton = document.getElementById("backButton");
  const configBtn = document.getElementById("sfConfigButton");

  // disconnect button
   const disconnectBtn = document.getElementById("disconnectSalesforceBtn");
   if (disconnectBtn) {
     disconnectBtn.addEventListener("click", handleDisconnectClick);
   }

  // Load lead data
  loadLeadData();

  // Initialize Salesforce configuration controller
  try {
    // Get singleton instance
    const configController = SalesforceConfigController.getInstance();

    // Check if configuration exists
    const hasConfig = salesforceService.hasClientConfig();

    // Show configuration notice if needed
    if (!hasConfig) {
      showConfigurationRequiredNotice(configController);

      // Disable transfer button if no configuration
      if (transferBtn) {
        transferBtn.disabled = true;
        transferBtn.title = "Salesforce configuration required before transfer";
      }
    }

    // Set up configuration button
    if (configBtn) {
      configBtn.addEventListener("click", () => {
        configController.openModal();
      });
    }
  } catch (error) {
    console.error("Error initializing configuration controller:", error);
    showError("Failed to initialize Salesforce configuration");
  }

  if (transferBtn) {
    transferBtn.addEventListener("click", handleTransferButtonClick);
  }

  if (backButton) {
    backButton.addEventListener("click", () => {
      const source = sessionStorage.getItem("selectedLeadSource");
      window.location.href = source === "LeadReport" 
        ? "displayLsLeadReport.html" 
        : "displayLsLead.html";
    });
  }

  // Listen for authentication token after redirection
  window.addEventListener('message', (event) => {

    // Check if message contains access token
    if (event.data && event.data.access_token) {
      console.log('Access token received from authentication window');
      handleAuthSuccess(event.data);
    } else if (event.data && event.data.error) {
      console.error('Authentication error:', event.data.error);
      showError(`Authentication error: ${event.data.error}`);
      updateConnectionStatus("not-connected", "Failed to connect to Salesforce");
    }
  });

  // Check Salesforce connection status
  try {
    updateConnectionStatus("connecting", "Checking connection...");
    const status = await salesforceService.checkConnection();

    if (status.connected) {
      updateConnectionStatus("connected", 
        status.userInfo ? `Connected as ${status.userInfo.name}` : "Connected to Salesforce");

      // Display user info if available
      if (status.userInfo) {
        displayUserInfo(status.userInfo);
      }
    } else {
      updateConnectionStatus("not-connected", status.message || "Not connected to Salesforce");
    }
  } catch (error) {
    console.error("Connection check error:", error);
    updateConnectionStatus("not-connected", "Connection error");
  }
});

/**
 * Display user information in the interface
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

  // display user info container
   //userInfoContainer.style.display = "block"; (to enable if you want to show user info)
  
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
 * Handle successful authentication
 * @param {Object} authData - Authentication data
 */
function handleAuthSuccess(authData) {
  const salesforceService = SalesforceService.getInstance();
  
  // Format authentication data
  const formattedAuthData = {
    accessToken: authData.access_token,
    instanceUrl: authData.instance_url,
 
  };
  
  // Store authentication data
  salesforceService.storeAuthData(formattedAuthData);
  
  // Update UI
  updateConnectionStatus("connected", "Connected to Salesforce");
  
  // Try transfer again if it was in progress
  if (isTransferInProgress) {
    handleTransferButtonClick();
  }
}

/**
 * Show configuration required notice
 * @param {Object} configController - Configuration controller
 */
function showConfigurationRequiredNotice(configController) {
  // Check if notice already exists to avoid duplicates
  if (document.querySelector('.config-required-notice')) {
    return;
  }
  
  const container = document.querySelector('.container');
  if (!container) return;
  
  const noticeElement = document.createElement('div');
  noticeElement.className = 'config-required-notice';
  noticeElement.innerHTML = `
    <div class="notice-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    </div>
    <div class="notice-content">
      <h3>Salesforce Configuration Required</h3>
      <p>Before transferring leads to Salesforce, you need to configure your Salesforce connection settings.</p>
    </div>
    <button id="configureNowBtn" class="configure-now-btn">Configure Now</button>
  `;
  
  // Insert at beginning of container
  container.insertBefore(noticeElement, container.firstChild);
  
  // Add event listener for configuration button
  document.getElementById('configureNowBtn').addEventListener('click', () => {
    configController.openModal();
  });
}

/**
 * Handle transfer button click
 */
async function handleTransferButtonClick() {
  if (isTransferInProgress) return;

  const salesforceService = SalesforceService.getInstance();

  if (!selectedLeadData) {
    showError("No lead data available.");
    return;
  }

  // Check Salesforce configuration
  if (!salesforceService.hasClientConfig()) {
    showError("Salesforce configuration is required before transferring leads.");
    
    try {
      const configController = SalesforceConfigController.getInstance();
      configController.openModal();
    } catch (error) {
      console.error("Error opening configuration modal:", error);
    }
    return;
  }

  const transferBtn = document.getElementById("transferToSalesforceBtn");
  const transferResults = document.getElementById("transferResults");
  const transferStatus = document.getElementById("transferStatus");

  isTransferInProgress = true;
  transferBtn.disabled = true;
  transferBtn.innerHTML = `
    <div class="spinner"></div>
    Connecting and transferring...
  `;

  try {
    // Show progress indicator
    transferResults.style.display = "block";
    
    // Check if authenticated
    updateConnectionStatus("connecting", "Checking Salesforce connection...");
    
    const isValid = await salesforceService.isTokenValid();
    
    // If not authenticated or token invalid, start authentication flow
    if (!isValid) {
      transferStatus.innerHTML = `
        <div class="transfer-pending">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          Salesforce authentication in progress...
        </div>
      `;

      // Start authentication flow
      await salesforceService.initializeAuth();
      
      // Check again if token is now valid
      const isNowValid = await salesforceService.isTokenValid();
      if (!isNowValid) {
        throw new Error("Authentication failed. Please try again.");
      }
    }

    // Show transfer status
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
    const attachments = await fetchAttachments(selectedLeadData.AttachmentIdList);

    // Transfer the lead
    const result = await salesforceService.transferLead(selectedLeadData, attachments);

    // Show success message
    let attachmentStatus = "";
    if (attachments.length > 0) {
      attachmentStatus = `<p><strong>Attachments:</strong> ${result.attachmentsTransferred || attachments.length}/${attachments.length} transferred</p>`;
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
        <p><strong>Configuration:</strong> <span class="config-used custom">Custom</span></p>
        ${attachmentStatus}
      </div>
    `;

    // Update connection status
    updateConnectionStatus("connected", "Connected to Salesforce");
  } catch (error) {
    console.error("Transfer error:", error);

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

    // Add configuration button if error is about configuration
    if (error.message && error.message.includes("configuration")) {
      transferStatus.innerHTML += `
        <div class="configure-prompt">
          <button id="openConfigBtn" class="open-config-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            Configure Salesforce Settings
          </button>
        </div>
      `;

      setTimeout(() => {
        const openConfigBtn = document.getElementById("openConfigBtn");
        if (openConfigBtn) {
          openConfigBtn.addEventListener('click', () => {
            // Use singleton instance
            const configController = SalesforceConfigController.getInstance();
            configController.openModal();
          });
        }
      }, 100);
    }

    // Add reconnection button if authentication expired
    if (error.message && (error.message.includes("expired") || error.message.includes("authentication"))) {
      transferStatus.innerHTML += `
        <div class="retry-auth">
          <button id="retryAuthBtn" class="retry-button">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 2v6h-6"></path>
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
              <path d="M3 22v-6h6"></path>
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
            </svg>
            Reconnect to Salesforce
          </button>
        </div>
      `;

      setTimeout(() => {
        const retryBtn = document.getElementById("retryAuthBtn");
        if (retryBtn) {
          retryBtn.addEventListener("click", async () => {
            const salesforceService = SalesforceService.getInstance();
            await salesforceService.logout();
            handleTransferButtonClick();
          });
        }
      }, 100);
    }
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
 * Handle disconnect button click
 */
async function handleDisconnectClick() {
  try {
    const salesforceService = SalesforceService.getInstance();
    
    // Show a confirmation dialog
    if (confirm("Are you sure you want to disconnect from Salesforce?")) {
      // Disconnect the user
      await salesforceService.logout();
      
      // Update the UI
      updateConnectionStatus("not-connected", "Not connected to Salesforce");
      
      // Hide the disconnect button
      const disconnectBtn = document.getElementById("disconnectSalesforceBtn");
      if (disconnectBtn) {
        disconnectBtn.style.display = "none";
      }
      
      // Remove user info if present
      const userInfoContainer = document.getElementById("salesforceUserInfo");
      if (userInfoContainer) {
        userInfoContainer.innerHTML = "";
        userInfoContainer.style.display = "none";
      }
      
      // Show a success message
      showSuccess("Disconnected from Salesforce successfully");
      
      // Reload the page to ensure everything is updated
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  } catch (error) {
    console.error("Error during disconnection:", error);
    showError("Failed to disconnect: " + error.message);
  }
}



/**
 * Load and display lead data from session storage
 */
function loadLeadData() {
  try {
    const leadDataStr = sessionStorage.getItem("selectedLeadData");
    leadSource = sessionStorage.getItem("selectedLeadSource");

    if (!leadDataStr || !leadSource) {
      showError("No lead data found. Please select a lead first.");
      setTimeout(() => {
        window.location.href = leadSource === "LeadReport"
          ? "displayLsLeadReport.html"
          : "displayLsLead.html";
      }, 2000);
      return;
    }

    // Update source display
    const leadSourceElement = document.getElementById("leadSource");
    if (leadSourceElement) {
      leadSourceElement.textContent = leadSource === "LeadReport" ? "Lead Report" : "Lead";
    }

    // Parse and store lead data
    selectedLeadData = JSON.parse(leadDataStr);

    // Display lead data
    displayLeadData(selectedLeadData);

    // Display attachments preview
    displayAttachmentsPreview();
  } catch (error) {
    console.error("Error loading lead data:", error);
    showError("Error loading lead data: " + error.message);
  }
}

/**
 * Display lead data in the interface
 * @param {Object} data - Lead data to display
 */
function displayLeadData(data) {
  const leadDataContainer = document.getElementById("leadData");

  if (leadDataContainer) {
    leadDataContainer.innerHTML = "";

    if (!data || Object.keys(data).length === 0) {
      leadDataContainer.innerHTML = '<div class="no-data">No lead data available</div>';
      return;
    }

    // Create information grid
    const infoGrid = document.createElement("div");
    infoGrid.className = "lead-info-grid";

    // Define priority fields
    const priorityFields = [
      "Id", "FirstName", "LastName", "Email", "Company", 
      "Phone", "MobilePhone", "Title", "Industry"
    ];
    const excludedFields = ["__metadata", "KontaktViewId"];

    // Display priority fields first
    priorityFields.forEach((field) => {
      if (data[field]) {
        infoGrid.appendChild(createFieldElement(field, data[field]));
      }
    });

    // Then display other fields
    Object.keys(data).forEach((field) => {
      if (!priorityFields.includes(field) && !excludedFields.includes(field) &&  field !== "AttachmentIdList" &&
        !field.endsWith(" ")
      ) {
        infoGrid.appendChild(createFieldElement(field, data[field]));
      }
    });

    leadDataContainer.appendChild(infoGrid);
  }
}

/**
 * Create a field element for display
 * @param {string} label - Field label
 * @param {string} value - Field value
 * @returns {HTMLElement} Field element
 */
function createFieldElement(label, value) {
  const fieldElement = document.createElement("div");
  fieldElement.className = "lead-field";

  const labelElement = document.createElement("div");
  labelElement.className = "field-label";
  labelElement.textContent = label;

  const valueElement = document.createElement("div");
  valueElement.className = "field-value";

  // Format dates if needed
  if (label.includes("Date") || label === "SystemModstamp") {
    try {
      const date = new Date(value);
      valueElement.textContent = !isNaN(date)
        ? date.toLocaleString()
        : value || "N/A";
    } catch (e) {
      valueElement.textContent = value || "N/A";
    }
  } else {
    valueElement.textContent = value || "N/A";
  }

  fieldElement.appendChild(labelElement);
  fieldElement.appendChild(valueElement);

  return fieldElement;
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
          itemElement.querySelector(".attachment-name").textContent =
            attachmentData.Name || `Attachment ${i + 1}`;
          itemElement.querySelector(".attachment-status").textContent =
            "Ready for transfer";
        }

        // Encode body for transfer
        const encodedBody = btoa(unescape(encodeURIComponent(attachmentData.Body)));

        // Add to attachments list
        attachments.push({
          Name: attachmentData.Name || `Attachment_${i + 1}`,
          Body: encodedBody,
          ContentType: attachmentData.ContentType || "application/octet-stream",
        });
      } else {
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
 * Update connection status indicator
 * @param {string} status - Status (connected/not-connected/connecting)
 * @param {string} message - Status message
 */
function updateConnectionStatus(status, message) {
  const statusIndicator = document.querySelector(".status-indicator");
  const statusText = document.querySelector(".sf-connection-status span");
  const disconnectBtn = document.getElementById("disconnectSalesforceBtn");

  if (statusIndicator && statusText) {
    // Reset the status indicator classes
    statusIndicator.className = "status-indicator";
    statusIndicator.classList.add(status);
    statusText.textContent = message;
    
    // Show or hide the disconnect button based on connection status
    if (disconnectBtn) {
      disconnectBtn.style.display = status === "connected" ? "flex" : "none";
    }
  }
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

// Export functions that other modules might use
export default {
  handleTransferButtonClick,
  showError,
  updateConnectionStatus
};