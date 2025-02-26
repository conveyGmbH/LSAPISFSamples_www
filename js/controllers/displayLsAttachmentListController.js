import ApiService from '../services/apiService.js';

const serverName = sessionStorage.getItem('serverName');
const apiName = sessionStorage.getItem('apiName');
const credentials = sessionStorage.getItem('credentials');

if (!serverName || !apiName || !credentials) {
  window.location.href = '/index.html';
}

const apiService = new ApiService(serverName, apiName);

/**
 * Fetches attachment data for all IDs in the AttachmentIdList
 */
async function fetchAttachmentData() {
  const attachmentIdList = sessionStorage.getItem('AttachmentIdList');
  if (!attachmentIdList) {
    console.error('No AttachmentIdList found in sessionStorage');
    alert('No attachments found.');
    window.location.href = 'displayLsLead.html';
    return;
  }

  const attachmentIds = attachmentIdList.split(',');
  console.log("Attachment IDs:", attachmentIds);
  
  // Create tabs for all attachments
  createAttachmentTabs(attachmentIds);
  
  // Load the first attachment by default
  if (attachmentIds.length > 0) {
    await loadAttachment(attachmentIds[0]);
    const firstTab = document.querySelector('.tab-button');
    if (firstTab) {
      setActiveTab(firstTab);
    }
  }
}

/**
 * Loads a specific attachment by ID and displays it
 * @param {string} attachmentId - The ID of the attachment to load
 */
async function loadAttachment(attachmentId) {
  try {
    // Clear any existing content and show loading state
    const attachmentContainer = document.getElementById('attachmentContainer');
    attachmentContainer.innerHTML = '<div class="loading">Loading attachment...</div>';
    
    // Update the file name display
    const fileNameElement = document.getElementById('fileName');
    fileNameElement.textContent = 'Loading...';
    
    // Construct the endpoint URL
    const endpoint = `LS_AttachmentById?Id=%27${encodeURIComponent(attachmentId)}%27&$format=json`;
    console.log("Fetching attachment with endpoint:", endpoint);

    const data = await apiService.request('GET', endpoint);
    console.log("Attachment data received:", data);

    // Check response structure
    let attachmentData = null;
    
    if (data && data.d && data.d.results && data.d.results.length > 0) {
      attachmentData = data.d.results[0];
      console.log("Processing attachment for display:", attachmentData);
    } else if (data && data.d) {
      attachmentData = data.d;
      console.log("Processing attachment for display:", attachmentData);
    }
    
    if (attachmentData) {
      displayAttachment(attachmentData);
    } else {
      console.error("No attachment found for ID:", attachmentId);
      attachmentContainer.innerHTML = '<div class="no-data"><p>No attachment data found.</p></div>';
      fileNameElement.textContent = 'No file';
    }
  } catch (error) {
    console.error("Error loading attachment:", error);
    document.getElementById('attachmentContainer').innerHTML = 
      `<div class="no-data"><p>Error loading attachment: ${error.message}</p></div>`;
    document.getElementById('fileName').textContent = 'Error';
  }
}

/**
 * Displays an attachment based on its type
 * @param {Object} attachment - The attachment data object
 */
function displayAttachment(attachment) {
  const attachmentContainer = document.getElementById('attachmentContainer');
  const fileNameElement = document.getElementById('fileName');
  const downloadButton = document.getElementById('downloadButton');
  
  if (!attachment) {
    attachmentContainer.innerHTML = '<div class="no-data"><p>No attachment available</p></div>';
    fileNameElement.textContent = 'No file';
    downloadButton.style.display = 'none';
    return;
  }
  
  // Get attachment properties
  const fileName = attachment.Name || 'attachment';
  const fileType = attachment.ContentType;
  const base64Data = attachment.Body;
  const fileSize = attachment.BodyLength;
  
  // Update file name display
  fileNameElement.textContent = fileName;
  downloadButton.style.display = 'inline-flex';
  
  if (!base64Data || !fileType) {
    attachmentContainer.innerHTML = '<div class="no-data"><p>Missing data for this attachment</p></div>';
    return;
  }

  try {
    // For Content Security Policy compliance, use data URLs instead of blob URLs
    // This avoids the 'blob:' URL which is being blocked by CSP
    const dataUrl = `data:${fileType};base64,${base64Data}`;
    
    // Set up download button functionality to use the data URL
    downloadButton.onclick = () => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    
    // Display based on file type using data URLs directly
    if (fileType.startsWith('image/')) {
      attachmentContainer.innerHTML = `<img src="${dataUrl}" alt="${fileName}" style="max-width: 100%; max-height: 500px;" />`;
    } else if (fileType === 'application/pdf') {
      attachmentContainer.innerHTML = `<iframe src="${dataUrl}" width="100%" height="500px" type="application/pdf"></iframe>`;
    } else if (fileType.startsWith('audio/')) {
      attachmentContainer.innerHTML = `
        <audio controls style="width: 100%;">
          <source src="${dataUrl}" type="${fileType}">
          Your browser does not support this audio element.
        </audio>`;
    } else if (fileType.startsWith('video/')) {
      attachmentContainer.innerHTML = `
        <video controls style="width: 100%; max-height: 500px;">
          <source src="${dataUrl}" type="${fileType}">
          Your browser does not support this video element.
        </video>`;
    } else {
      attachmentContainer.innerHTML = `
        <div class="no-data">
          <p>${fileName} (${(fileSize / 1024).toFixed(2)} KB)</p>
          <p>Preview not available for this file type (${fileType})</p>
          <p>Use the download button to open the file</p>
        </div>`;
    }
  } catch (error) {
    console.error("Error displaying attachment:", error);
    attachmentContainer.innerHTML = `<div class="no-data"><p>Error displaying attachment: ${error.message}</p></div>`;
  }
}

/**
 * Creates tabs for navigating between attachments
 * @param {Array} attachmentIds - Array of attachment IDs
 */
function createAttachmentTabs(attachmentIds) {
  const tabContainer = document.getElementById('tabContainer');
  tabContainer.innerHTML = '';

  if (!attachmentIds || attachmentIds.length === 0) {
    tabContainer.innerHTML = '<div class="no-tabs">No attachments available</div>';
    return;
  }

  // Create a tab for each attachment
  attachmentIds.forEach((attachmentId, index) => {
    const tab = document.createElement('button');
    tab.textContent = `Attachment ${index + 1}`;
    tab.classList.add('tab-button');
    tab.dataset.attachmentId = attachmentId;
    
    tab.addEventListener('click', () => {
      loadAttachment(attachmentId);
      setActiveTab(tab);
    });

    tabContainer.appendChild(tab);
  });
}

/**
 * Sets the active tab styling
 * @param {HTMLElement} activeTab - The tab element to set as active
 */
function setActiveTab(activeTab) {
  const tabs = document.querySelectorAll('.tab-button');
  tabs.forEach(tab => tab.classList.remove('active-tab'));
  activeTab.classList.add('active-tab');
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Back button functionality
  const backButton = document.getElementById('backButton');
  backButton.addEventListener('click', () => {
    window.location.href = 'displayLsLead.html';
  });

  // Initialize by fetching attachment data
  fetchAttachmentData();
});