// Controller optimized for Lead transfer to Salesforce
import { appConfig } from "../config/salesforceConfig.js";
import ApiService from "../services/apiService.js";

// Global variables
let selectedLeadData = null;
let leadSource = null;
let authWindow = null;
let isTransferInProgress = false;

// Load and store authentication data in localStorage instead of session token
function getAuthData() {
  try {
    const authData = localStorage.getItem("sf_auth_data");
    return authData ? JSON.parse(authData) : null;
  } catch (error) {
    console.error("Error parsing stored authentication data:", error);
    return null;
  }
}

function storeAuthData(data) {
  try {
    localStorage.setItem("sf_auth_data", JSON.stringify(data));
    return true;
  } catch (error) {
    console.error("Error storing authentication data:", error);
    return false;
  }
}

function clearAuthData() {
  localStorage.removeItem("sf_auth_data");
}

// Handle click on transfer button
async function handleTransferButtonClick() {
  if (isTransferInProgress) return;

  const transferBtn = document.getElementById("transferToSalesforceBtn");
  const transferResults = document.getElementById("transferResults");
  const transferStatus = document.getElementById("transferStatus");

  if (!selectedLeadData) {
    showError("No lead data available.");
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
    transferResults.style.display = "block";

    // Get existing auth data
    const authData = getAuthData();

    // If no auth data, start authentication flow
    if (!authData) {
      updateConnectionStatus("connecting", "Connecting to Salesforce...");

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
      const response = await fetch(`${appConfig.apiBaseUrl}/salesforce/auth`);
      const data = await response.json();
      const authUrl = data.authUrl;

      authWindow = window.open(
        authUrl,
        "salesforceAuth",
        "width=600,height=700"
      );

      if (!authWindow) {
        throw new Error("Popup blocked! Please allow popups for this site.");
      }

      // The rest of the auth flow will be handled by the message event listener
      return;
    }

    // Otherwise, proceed directly to transfer using existing auth data
    await continueTransferWithAuth(authData);
  } catch (error) {
    console.error("Process failure:", error);

    // Show error
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

async function displayAttachmentsPreview() {
  // Check if the lead contains attachments
  if (!selectedLeadData || !selectedLeadData.AttachmentIdList) {
    return;
  }

  const attachmentIds = selectedLeadData.AttachmentIdList.split(",").filter(
    (id) => id.trim() !== ""
  );
  if (attachmentIds.length === 0) {
    return;
  }

  // Create or retrieve the attachment preview container
  let attachmentsPreviewContainer =
    document.getElementById("attachmentsPreview");
  if (!attachmentsPreviewContainer) {
    // Find the location to insert the preview container
    const leadDataContainer = document.getElementById("leadData");

    attachmentsPreviewContainer = document.createElement("div");
    attachmentsPreviewContainer.id = "attachmentsPreview";
    attachmentsPreviewContainer.className = "attachments-preview";

    // Add a title for the section
    const title = document.createElement("h4");
    title.textContent = "Attachments to be transferred";
    attachmentsPreviewContainer.appendChild(title);

    // Create the list of attachments
    const attachmentsList = document.createElement("ul");
    attachmentsList.className = "attachments-list";
    attachmentsList.id = "attachmentsList";
    attachmentsPreviewContainer.appendChild(attachmentsList);

    // Insert after leadDataContainer
    leadDataContainer.parentNode.insertBefore(
      attachmentsPreviewContainer,
      leadDataContainer.nextSibling
    );
  }

  const attachmentsList = document.getElementById("attachmentsList");
  attachmentsList.innerHTML = '<li class="loading">Loading attachments...</li>';

  // Create an instance of ApiService
  const serverName = sessionStorage.getItem("serverName");
  const apiName = sessionStorage.getItem("apiName");
  const apiService = new ApiService(serverName, apiName);

  // Array to store all retrieval promises
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
      console.error(`Error fetching attachment ${attachmentId}:`, error);
      return null;
    }
  });

  // Wait for all attachments to be retrieved
  const attachments = await Promise.all(attachmentPromises);

  // Filter out null results and create the interface
  const validAttachments = attachments.filter((a) => a && a.Name);

  if (validAttachments.length === 0) {
    attachmentsList.innerHTML =
      '<li class="no-data">No attachments available</li>';
    return;
  }

  // Clear the list
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

  // Add a summary message - Only if it doesn't already exist
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

function getFileIcon(contentType, filename) {
  let iconSvg = "";

  if (!contentType && filename) {
    // Determine the type based on file extension
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

async function continueTransferWithAuth(authData) {
  const transferStatus = document.getElementById("transferStatus");
  const transferBtn = document.getElementById("transferToSalesforceBtn");

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

    // Prepare lead data
    const leadDataToSend = { ...selectedLeadData };

    // Clean up lead data
    delete leadDataToSend.State;

    for (let field in leadDataToSend) {
      if (
        leadDataToSend[field] === "N/A" ||
        leadDataToSend[field] === "null" ||
        leadDataToSend[field] === "undefined" ||
        leadDataToSend[field] === null ||
        leadDataToSend[field] === undefined
      ) {
        delete leadDataToSend[field];
      }
    }

    // Set required fields if missing
    if (!leadDataToSend.LastName || leadDataToSend.LastName === "N/A") {
      leadDataToSend.LastName = "Unknown";
    }

    if (!leadDataToSend.Company || leadDataToSend.Company === "N/A") {
      leadDataToSend.Company = "Unknown";
    }

    if (leadDataToSend.Country === "N/A") {
      delete leadDataToSend.Country;
    }

    // Prepare attachments
    const attachments = await fetchAttachments(leadDataToSend.AttachmentIdList);

    // Make the API call to transfer the lead with attachments
    const response = await fetch(
      `${appConfig.apiBaseUrl}/direct-lead-transfer`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accessToken: authData.accessToken,
          instanceUrl: authData.instanceUrl,
          leadData: leadDataToSend,
          attachments: attachments,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        // Clear auth data if unauthorized
        clearAuthData();

        // Restart authentication process
        handleTransferButtonClick();
        return;
      }

      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Error ${response.status}`);
    }

    const result = await response.json();

    // Show success result
    let attachmentStatus = "";
    if (attachments.length > 0) {
      const attachmentsTransferred =
        result.attachmentsTransferred !== undefined
          ? result.attachmentsTransferred
          : attachments.length;

      attachmentStatus = `<p><strong>Attachments:</strong> ${attachmentsTransferred}/${attachments.length} transferred</p>`;
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
        <p><strong>Message:</strong> ${result.message}</p>
        ${attachmentStatus}
      </div>
    `;

    // Update connection status
    updateConnectionStatus("connected", "Connected to Salesforce");
  } catch (error) {
    console.error("Error during transfer:", error);

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

    if (error.message && error.message.includes("expired")) {
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
          retryBtn.addEventListener("click", () => {
            clearAuthData();
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

async function fetchAttachments(attachmentIdList) {
  if (!attachmentIdList) {
    return [];
  }

  const attachmentIds = attachmentIdList
    .split(",")
    .filter((id) => id.trim() !== "");
  if (attachmentIds.length === 0) {
    return [];
  }

  const transferStatus = document.getElementById("transferStatus");

  // Add a section for attachment progress
  transferStatus.innerHTML += `
    <div class="attachment-section">
      <h4>Preparing Attachments</h4>
      <div id="attachment-progress">0/${attachmentIds.length} prepared</div>
      <div id="attachment-list"></div>
    </div>
  `;

  const attachmentList = document.getElementById("attachment-list");
  const progressElement = document.getElementById("attachment-progress");

  // Create API service for fetching attachments
  const serverName = sessionStorage.getItem("serverName");
  const apiName = sessionStorage.getItem("apiName");
  const apiService = new ApiService(serverName, apiName);

  // Fetch all attachments
  const attachments = [];

  for (let i = 0; i < attachmentIds.length; i++) {
    const attachmentId = attachmentIds[i];

    // Show status for this attachment
    const itemId = `attachment-${i}`;
    attachmentList.innerHTML += `
      <div id="${itemId}" class="attachment-item pending">
        <span class="attachment-name">Attachment ${i + 1}</span>
        <span class="attachment-status">Fetching...</span>
      </div>
    `;

    try {
      // Fetch the attachment data
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

        // Encode the body in base64 for transfer
        const encodedBody = btoa(
          unescape(encodeURIComponent(attachmentData.Body))
        );

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
      console.error(`Error fetching attachment ${attachmentId}:`, error);

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

// Utility function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/* Load lead data from session */
function loadLeadData() {
  try {
    const leadDataStr = sessionStorage.getItem("selectedLeadData");
    leadSource = sessionStorage.getItem("selectedLeadSource");

    if (!leadDataStr || !leadSource) {
      showError("No lead data found. Please select a lead first.");
      setTimeout(() => {
        window.location.href =
          leadSource === "LeadReport"
            ? "displayLsLeadReport.html"
            : "displayLsLead.html";
      }, 2000);
      return;
    }

    // Update lead source
    const leadSourceElement = document.getElementById("leadSource");
    if (leadSourceElement) {
      leadSourceElement.textContent =
        leadSource === "LeadReport" ? "Lead Report" : "Lead";
    }

    // Parse lead data
    selectedLeadData = JSON.parse(leadDataStr);

    // Display data
    displayLeadData(selectedLeadData);

    // Show attachments to be transferred
    displayAttachmentsPreview();
  } catch (error) {
    console.error("Error loading lead data:", error);
    showError("Error loading lead data. Please try again.");
  }
}

/* Verify if the auth data is still valid */
async function verifyAuthData() {
  const authData = getAuthData();
  if (!authData) {
    updateConnectionStatus("not-connected", "Not connected to Salesforce");
    return false;
  }

  try {
    // Quick check if token is valid by fetching user info
    const response = await fetch(
      `${authData.instanceUrl}/services/oauth2/userinfo`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authData.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      // Token is invalid or expired
      clearAuthData();
      updateConnectionStatus(
        "not-connected",
        "Session expired. Please reconnect"
      );
      return false;
    }

    // Token is valid
    updateConnectionStatus("connected", "Connected to Salesforce");
    return true;
  } catch (error) {
    console.error("Error verifying auth data:", error);

    // If server is not responding, better to assume we're not connected
    clearAuthData();
    updateConnectionStatus(
      "not-connected",
      "Connection error. Please reconnect"
    );
    return false;
  }
}

/* Display lead data in interface */
function displayLeadData(data) {
  const leadDataContainer = document.getElementById("leadData");

  if (leadDataContainer) {
    leadDataContainer.innerHTML = "";

    if (!data || Object.keys(data).length === 0) {
      leadDataContainer.innerHTML =
        '<div class="no-data">No lead data available</div>';
      return;
    }

    // Create info grid
    const infoGrid = document.createElement("div");
    infoGrid.className = "lead-info-grid";

    // Define priority fields
    const priorityFields = [
      "Id",
      "FirstName",
      "LastName",
      "Email",
      "Company",
      "Phone",
      "MobilePhone",
      "Title",
      "Industry",
    ];
    const excludedFields = ["__metadata", "KontaktViewId"];

    // Display priority fields first
    priorityFields.forEach((field) => {
      if (data[field]) {
        infoGrid.appendChild(createFieldElement(field, data[field]));
      }
    });

    // Then other fields
    Object.keys(data).forEach((field) => {
      if (
        !priorityFields.includes(field) &&
        !excludedFields.includes(field) &&
        field !== "AttachmentIdList" &&
        !field.endsWith(" ")
      ) {
        infoGrid.appendChild(createFieldElement(field, data[field]));
      }
    });

    leadDataContainer.appendChild(infoGrid);
  }
}

/* Create element to display lead field */
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

/* Update connection status indicator */
function updateConnectionStatus(status, message) {
  const statusIndicator = document.querySelector(".status-indicator");
  const statusText = document.querySelector(".sf-connection-status span");

  if (statusIndicator && statusText) {
    statusIndicator.className = "status-indicator";
    statusIndicator.classList.add(status);
    statusText.textContent = message;
  }
}

/* Show error message */
function showError(message) {
  const errorElement = document.getElementById("errorMessage");
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = "block";

    setTimeout(() => {
      errorElement.style.display = "none";
    }, 5000);
  } else {
    console.error("Error message element not found:", message);
    alert(message);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("Lead transfer page loaded");

  const transferBtn = document.getElementById("transferToSalesforceBtn");
  const backButton = document.getElementById("backButton");

  // Load lead data
  loadLeadData();

  // Listen for authentication messages
  window.addEventListener("message", (event) => {
    if (event.data.type === "salesforce-auth-success") {
      console.log("Received auth success message");

      // Store auth data
      const authData = {
        accessToken: event.data.accessToken,
        refreshToken: event.data.refreshToken,
        instanceUrl: event.data.instanceUrl,
        userInfo: event.data.userInfo,
        timestamp: Date.now(),
      };

      storeAuthData(authData);

      // Update interface
      updateConnectionStatus(
        "connected",
        `Connected to Salesforce as ${authData.userInfo?.name || "User"}`
      );

      // Continue transfer if in progress
      if (isTransferInProgress) {
        continueTransferWithAuth(authData);
      }

      // Close the auth window if it's still open
      if (authWindow && !authWindow.closed) {
        authWindow.close();
      }
    } else if (event.data.type === "salesforce-auth-error") {
      console.error("Auth error:", event.data.error);
      showError(`Authentication error: ${event.data.error}`);

      // Reset transfer button
      isTransferInProgress = false;
      const transferBtn = document.getElementById("transferToSalesforceBtn");
      if (transferBtn) {
        transferBtn.disabled = false;
        transferBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5v14M19 12l-7 7-7-7"/>
            </svg>
            Transfer to Salesforce
          `;
      }
    }
  });

  // Add event handlers to buttons
  if (transferBtn) {
    transferBtn.addEventListener("click", handleTransferButtonClick);
  }

  if (backButton) {
    backButton.addEventListener("click", () => {
      const source = sessionStorage.getItem("selectedLeadSource");
      window.location.href =
        source === "LeadReport"
          ? "displayLsLeadReport.html"
          : "displayLsLead.html";
    });
  }

  // Check if already connected and verify auth status
  const authData = getAuthData();
  if (authData) {
    // Show connecting status while we verify
    updateConnectionStatus("connecting", "Verifying connection...");

    // Verify if the auth data is still valid
    await verifyAuthData();
  } else {
    updateConnectionStatus("not-connected", "Not connected to Salesforce");
  }

  // Handle duplicate detection modal if it exists
  const duplicateModal = document.getElementById("duplicateModal");
  const closeDuplicateModalBtn = document.querySelector(".close-modal");
  const cancelDuplicateBtn = document.getElementById("cancelDuplicateBtn");
  const createDuplicateBtn = document.getElementById("createDuplicateBtn");

  if (duplicateModal) {
    if (closeDuplicateModalBtn) {
      closeDuplicateModalBtn.addEventListener("click", () => {
        duplicateModal.style.display = "none";
      });
    }

    if (cancelDuplicateBtn) {
      cancelDuplicateBtn.addEventListener("click", () => {
        duplicateModal.style.display = "none";
      });
    }

    if (createDuplicateBtn) {
      createDuplicateBtn.addEventListener("click", async () => {
        duplicateModal.style.display = "none";

        // Get the current authData
        const authData = getAuthData();
        if (authData) {
          // Continue with the transfer, but add a flag to ignore duplicates
          const leadDataToSend = {
            ...selectedLeadData,
            ignoreDuplicates: true,
          };
          await continueTransferWithAuth(authData);
        } else {
          showError(
            "Authentication data not found. Please reconnect to Salesforce."
          );
        }
      });
    }
  }

  // Close modal if user clicks outside of it
  window.addEventListener("click", (event) => {
    if (duplicateModal && event.target === duplicateModal) {
      duplicateModal.style.display = "none";
    }
  });
});