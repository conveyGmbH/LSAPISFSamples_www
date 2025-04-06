import ApiService from '../services/apiService.js';

const serverName = sessionStorage.getItem('serverName');
const apiName = sessionStorage.getItem('apiName');
const credentials = sessionStorage.getItem('credentials');

if (!serverName || !apiName || !credentials) {
  window.location.href = '/index.html';
}

const apiService = new ApiService(serverName, apiName);


async function fetchAttachmentData() {
  const attachmentIdList = sessionStorage.getItem('AttachmentIdList');
  if (!attachmentIdList) {
    console.error('No AttachmentIdList found in sessionStorage');
    showError('No attachments found.');
    navigateBack();
    return;
  }

  const attachmentIds = attachmentIdList.split(',');
  
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


function navigateBack() {
  // Get the source page from sessionStorage if available
  const sourcePage = sessionStorage.getItem('attachmentSource');
  
  if (sourcePage === 'LeadReport') {
    window.location.href = 'displayLsLeadReport.html';
  } else {
    // Default to Lead page if no source or unknown source
    window.location.href = 'displayLsLead.html';
  }
}


async function loadAttachment(attachmentId) {
  try {
    const attachmentContainer = document.getElementById('attachmentContainer');
    attachmentContainer.innerHTML = '<div class="loading">Loading attachment...</div>';
    
    const fileNameElement = document.getElementById('fileName');
    fileNameElement.textContent = 'Loading...';
    
    // Construct the endpoint URL
    const endpoint = `LS_AttachmentById?Id=%27${encodeURIComponent(attachmentId)}%27&$format=json`;

    const data = await apiService.request('GET', endpoint);

    // Check response structure
    let attachmentData = null;
    
    if (data && data.d && data.d.results && data.d.results.length > 0) {
      attachmentData = data.d.results[0];
    } else if (data && data.d) {
      attachmentData = data.d;
    }
    
    if (attachmentData) {
      // Check if the attachment actually has binary data (Body)
      if (attachmentData.Body) {
        displayAttachment(attachmentData);
      } else {
        attachmentContainer.innerHTML = `
          <div class="no-data">
            <p>The attachment record exists (ID: ${attachmentId}), but no file content is available.</p>
            <p>The file may have been deleted or is inaccessible.</p>
          </div>`;
        fileNameElement.textContent = attachmentData.Name || 'Unknown File';
        
        // Disable download button
        const downloadButton = document.getElementById('downloadButton');
        if (downloadButton) {
          downloadButton.disabled = true;
        }
      }
    } else {
      attachmentContainer.innerHTML = '<div class="no-data"><p>No attachment data found.</p></div>';
      fileNameElement.textContent = 'No file';
    }
  } catch (error) {
    console.error("Error loading attachment:", error);
    showError(`Error loading attachment: ${error.message}`);
    document.getElementById('attachmentContainer').innerHTML = 
      `<div class="no-data"><p>Error loading attachment: ${error.message}</p></div>`;
    document.getElementById('fileName').textContent = 'Error';
  }
}

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
  downloadButton.disabled = false;
  
  if (!base64Data || !fileType) {
    attachmentContainer.innerHTML = '<div class="no-data"><p>Missing data for this attachment</p></div>';
    return;
  }

  try {
    const dataUrl = `data:${fileType};base64,${base64Data}`;

    // Set up download button functionality
    downloadButton.onclick = () => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    
    // Special handling for SVG files
    if (fileType === 'image/svg+xml' || fileName.toLowerCase().endsWith('.svg')) {
      try {
        // Decode the Base64 data to get the SVG as a string
        const svgString = atob(base64Data);
        
        // Create a wrapper div with appropriate styling
        attachmentContainer.innerHTML = `
          <div class="svg-container">
            ${svgString}
          </div>
        `;
        
        // Adjust SVG element to be responsive if it exists
        const svgElement = attachmentContainer.querySelector('svg');
        if (svgElement) {
          svgElement.style.width = '100%';
          svgElement.style.height = 'auto';
          svgElement.style.maxHeight = '500px';
          svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        } else {
          // Fallback if SVG parsing failed
          console.warn("SVG element not found in decoded string, using fallback");
          attachmentContainer.innerHTML = `<object data="${dataUrl}" type="image/svg+xml" style="width: 100%; height: 500px;">SVG not supported</object>`;
        }
      } catch (svgError) {
        console.error("Error displaying SVG:", svgError);
        attachmentContainer.innerHTML = `<object data="${dataUrl}" type="image/svg+xml" style="width: 100%; height: 500px;">SVG not supported</object>`;
      }
    } 
    
    else if (fileType.startsWith('image/')) {
      attachmentContainer.innerHTML = `<img src="${dataUrl}" alt="${fileName}" style="max-width: 100%; max-height: 500px;" />`;
    } else if (fileType === 'application/pdf') {

      attachmentContainer.innerHTML = `
        <iframe 
          src="${dataUrl}#view=Fit&scrollbar=0" 
          class="pdf-viewer" 
          type="application/pdf"
          style="width: 100%; height: 100%; border: none;"
        >
         <p>Your browser does not support displaying PDFs. <a href="${dataUrl}" download="${fileName}">Download the PDF</a> to view it.</p>

        </iframe>`;
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
    showError(`Error displaying attachment: ${error.message}`);
    attachmentContainer.innerHTML = `<div class="no-data"><p>Error displaying attachment: ${error.message}</p></div>`;
  }
}

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

function setActiveTab(activeTab) {
  const tabs = document.querySelectorAll('.tab-button');
  tabs.forEach(tab => tab.classList.remove('active-tab'));
  activeTab.classList.add('active-tab');
}

function showError(message) {
  const errorElement = document.getElementById('errorMessage');
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    // Hide after 5 seconds
    setTimeout(() => {
      errorElement.style.display = 'none';
    }, 5000);
  }
}

window.addEventListener('load', () => {
  // Initialize by fetching attachment data
  fetchAttachmentData();
});

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
  const backButton = document.getElementById('backButton');
  backButton.addEventListener('click', () => {
    navigateBack();
  });

});