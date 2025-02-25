import ApiService from '../services/apiService.js';
import { formatDate } from '../utils/helper.js';

const serverName = sessionStorage.getItem('serverName');
const apiName = sessionStorage.getItem('apiName');
const credentials = sessionStorage.getItem('credentials');

if (!serverName || !apiName || !credentials) {
  window.location.href = '/index.html';
}

const apiService = new ApiService(serverName, apiName);

async function fetchLsLeadData() {
  const eventId = sessionStorage.getItem('selectedEventId');
  if (!eventId) {
    alert('No EventId provided.');
    window.location.href = '/display.html';
    return;
  }

  const endpoint = `LS_Lead?$format=json&$filter=EventId eq '${encodeURIComponent(eventId)}'`;

  try {
    const data = await apiService.request('GET', endpoint);
    if (data && data.d && data.d.results) {
      displayData(data.d.results);
    } else {
      displayData([]);
    }
  } catch (error) {
    console.error('Error fetching LS_Lead data:', error);
    alert('An error occurred while fetching LS_Lead data.');
  }

  initSearch();
}

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
  
  headers.forEach((header, index) => {
    const th = document.createElement('th');
    
    const headerText = document.createTextNode(header);
    th.appendChild(headerText);
    
    const span = document.createElement('span');
    span.classList.add('icon-arrow');
    span.innerHTML = '&UpArrow;'; 
    th.appendChild(span);
    th.style.position = 'sticky';
    th.style.top = '0';
    th.addEventListener('click', () => sortTable(index, th));
    headerRow.appendChild(th);

  });
  tableHead.appendChild(headerRow);

  data.forEach(item => {
    const row = document.createElement('tr');

    headers.forEach(header => {
      const td = document.createElement('td');
      if (header.includes('Date')) {
        td.textContent = formatDate(item[header]);
      } else {
        td.textContent = item[header] || 'N/A';
      }
      row.appendChild(td);
    });
    tableBody.appendChild(row);

    // Add click event to row to handle selection and show attachment button
    row.addEventListener('click', () => handleRowSelection(item));
  });
}

// Function to handle row selection and enabling "Show Attachment" button
function handleRowSelection(item) {
  const showAttachmentButton = document.getElementById('showAttachmentButton');
  if (item.AttachmentIdList) {
    showAttachmentButton.disabled = false;
    showAttachmentButton.textContent = `Show Attachment (${item.AttachmentIdList.split(',').length})`;
    sessionStorage.setItem('AttachmentIdList', item.AttachmentIdList);
  } else {
    showAttachmentButton.disabled = true;
    showAttachmentButton.textContent = 'Show Attachment';
    sessionStorage.removeItem('AttachmentIdList');
  }

  const previouslySelected = document.querySelector('tr.selected');
  if (previouslySelected) {
    previouslySelected.classList.remove('selected');
  }
  event.currentTarget.classList.add('selected');
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

document.addEventListener('DOMContentLoaded', () => {
  const showAttachmentButton = document.getElementById('showAttachmentButton');
  showAttachmentButton.addEventListener('click', () => {
    const attachmentIdList = sessionStorage.getItem('AttachmentIdList');
    if (attachmentIdList) {
      window.location.href = 'displayLsAttachmentList.html';
    } else {
      alert('No attachments available for this lead.');
    }
  });

  fetchLsLeadData();
}
);

const backButton = document.getElementById('backButton');
backButton.addEventListener('click', () => {
  window.location.href = 'display.html';
});
