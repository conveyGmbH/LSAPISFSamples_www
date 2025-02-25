import ApiService from '../services/apiService.js';

const serverName = sessionStorage.getItem('serverName');
const apiName = sessionStorage.getItem('apiName');
const credentials = sessionStorage.getItem('credentials');

if (!serverName || !apiName || !credentials) {
  window.location.href = '/index.html';
}

const apiService = new ApiService(serverName, apiName);

// Function to fetch and display attachment data
async function fetchAttachmentData() {
  const attachmentIdList = sessionStorage.getItem('AttachmentIdList');
  if (!attachmentIdList) {
    alert('No AttachmentIdList found.');
    window.location.href = 'displayLsLead.html';
    return;
  }

  const attachmentIds = attachmentIdList.split(',');
  const data = [];

  try {
    for (const id of attachmentIds) {
      const endpoint = `LS_AttachmentById?Id=%27${encodeURIComponent(id)}%27&$format=json`;
      const attachmentData = await apiService.request('GET', endpoint);
      if (attachmentData && attachmentData.d) {
        data.push(attachmentData.d);
      }
    }
    displayData(data);
  } catch (error) {
    console.error('Error fetching attachment data:', error);
    alert('An error occurred while fetching attachment data.');
  }

  initSearch();
}

// Function to display data in the table
function displayData(data) {
  const tableHead = document.getElementById('tableHead');
  const tableBody = document.getElementById('tableBody');
  const noDataMessage = document.getElementById('noDataMessage');

  tableHead.innerHTML = '';
  tableBody.innerHTML = '';

  if (!data || data.length === 0) {
    noDataMessage.textContent = 'No data available.';
    return;
  }

  noDataMessage.textContent = '';

  const headers = Object.keys(data[0]).filter(header => header !== '__metadata');

  const headerRow = document.createElement('tr');
  
  headers.forEach((header) => {
    const th = document.createElement('th');
    const headerText = document.createTextNode(header);
    th.appendChild(headerText);
    headerRow.appendChild(th);
  });
  tableHead.appendChild(headerRow);

  data.forEach(item => {
    const row = document.createElement('tr');

    headers.forEach(header => {
      const td = document.createElement('td');
      let cellData = item[header];

      console.log("Cell data:", cellData);

      if (typeof cellData === 'object' && cellData !== null) {
        cellData = JSON.stringify(cellData, null, 2);
      }
      td.textContent = cellData || 'N/A';
      row.appendChild(td);
      if (header.includes('Date')) {
        td.textContent = formatDate(item[header]);
      } else {
        td.textContent = item[header] || 'N/A';
      }
      row.appendChild(td);
    });
    tableBody.appendChild(row);
  });
}

// Function to initialize search functionality
function initSearch() {
  const searchInput = document.getElementById('search');
  const tableRows = document.querySelectorAll('tbody tr');
  const noDataMessage = document.getElementById('noDataMessage');

  if (!searchInput || !tableRows) {
    console.error('Search elements not found in the DOM.');
    return;
  }

  searchInput.addEventListener('input', () => {
    const searchValue = searchInput.value.toLowerCase();
    let found = false;

    tableRows.forEach((row, i) => {
      const rowText = row.textContent.toLowerCase();
      const isVisible = rowText.indexOf(searchValue) >= 0;
      row.classList.toggle('hide', !isVisible);
      if (isVisible) {
        found = true;
      }
      row.style.setProperty('--delay', i / 25 + 's');
    });

    document.querySelectorAll('tbody tr:not(.hide)').forEach((visibleRow, i) => {
      visibleRow.style.backgroundColor = (i % 2 === 0) ? 'transparent' : '#0000000b';
    });

    if (!found) {
      noDataMessage.textContent = 'No results found.';
    } else {
      noDataMessage.textContent = '';
    }
  });
}

// Function to fetch and display an attachment
async function loadAttachment(attachmentId) {
  try {
    const endpoint = `LS_AttachmentById?Id=%27${encodeURIComponent(attachmentId)}%27&$format=json`;

    const data = await apiService.request('GET', endpoint);
    console.log("data:", data.d.results[0]);

    if (data && data.d && data.d.results.length > 0) {
      displayAttachment(data.d.results[0]); 
    } else {
      console.error("No attachment found for ID:", attachmentId);
    }
  } catch (error) {
    console.error("Error loading attachment:", error);
  }
}

// Function to display an attachment based on its type
function displayAttachment(attachment) {
  const attachmentContainer = document.getElementById('attachmentContainer');

  if (!attachment || !attachment.rtn9 || !attachment.rtn8) {
      attachmentContainer.innerHTML = '<p>No attachment available.</p>';
      return;
  }

  const base64Data = attachment.rtn9;
  const fileType = attachment.rtn8;

  const byteCharacters = atob(base64Data);

  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
  }
  const blob = new Blob(byteArrays, { type: fileType });

  // 3. Create a URL for the Blob
  const fileUrl = URL.createObjectURL(blob);

  // Now use the fileUrl in your iframe
  attachmentContainer.innerHTML = `<iframe src="${fileUrl}" width="100%" height="500px"></iframe>`;
}

// Function to create attachment tabs for navigation
function createAttachmentTabs() {
  const tabContainer = document.getElementById('tabContainer');
  tabContainer.innerHTML = '';

  const attachmentIdList = sessionStorage.getItem('AttachmentIdList');
  if (!attachmentIdList) {
    alert('No attachments found.');
    window.history.back();
  }

  const attachmentIds = attachmentIdList.split(',');
  attachmentIds.forEach((attachmentId, index) => {
    const tab = document.createElement('button');
    tab.textContent = `Attachment ${index + 1}`;
    tab.classList.add('tab-button');
    
    tab.addEventListener('click', () => {
      loadAttachment(attachmentId);
      setActiveTab(tab);
    });

    tabContainer.appendChild(tab);
  });

  // Load the first attachment by default
  if (attachmentIds.length > 0) {
    loadAttachment(attachmentIds[0]);
    tabContainer.firstChild.classList.add('active-tab');
  }
}

// Function to set the active tab styling
function setActiveTab(activeTab) {
  const tabs = document.querySelectorAll('.tab-button');
  tabs.forEach(tab => tab.classList.remove('active-tab'));
  activeTab.classList.add('active-tab');
}

// Back button functionality
const backButton = document.getElementById('backButton');
backButton.addEventListener('click', () => {
  window.location.href = 'displayLsLead.html';
});

// Initialize the attachment list
document.addEventListener('DOMContentLoaded', createAttachmentTabs);

// Initialize
fetchAttachmentData();
