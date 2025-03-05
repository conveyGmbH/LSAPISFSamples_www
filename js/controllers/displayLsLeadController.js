import ApiService from '../services/apiService.js';
import {escapeODataValue, formatDateForOData, formatDate, setupPagination } from '../utils/helper.js';

const serverName = sessionStorage.getItem('serverName');
const apiName = sessionStorage.getItem('apiName');
const credentials = sessionStorage.getItem('credentials');

if (!serverName || !apiName || !credentials) {
  window.location.href = '/index.html';
}

const apiService = new ApiService(serverName, apiName);

const pagination = setupPagination(apiService, displayData);

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
      console.log(`[DEBUG] Nombre de lignes chargées: ${data.d.results.length}`);
      console.log(`[DEBUG] URL pagination: ${data.d.__next ? "Disponible" : "Non disponible"}`);

      displayData(data.d.results);

      pagination.updateNextUrl(data);
    } else {
      displayData([]);
    }
  } catch (error) {
    console.error('Error fetching LS_Lead data:', error);
    alert('An error occurred while fetching LS_Lead data.');
  }

  initSearch();
}

function sortTable(index, th) {
  let sortAsc = !th.classList.contains('asc');
  const tableRows = document.querySelectorAll('tbody tr');

  [...tableRows].sort((a, b) => {
    let firstRow = a.querySelectorAll('td')[index].textContent.toLowerCase();
    let secondRow = b.querySelectorAll('td')[index].textContent.toLowerCase();
    return sortAsc ? (firstRow > secondRow ? 1 : -1) : (firstRow < secondRow ? 1 : -1);
  }).forEach(sortedRow => document.querySelector('tbody').appendChild(sortedRow));

  th.classList.toggle('asc', sortAsc);
  th.classList.toggle('desc', !sortAsc);
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

  const headers = Object.keys(data[0]).filter(header => header !== '__metadata' && 
    header !== 'KontaktViewId');

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
      if (header.includes('Date') || header === 'SystemModstamp') {
        td.textContent = formatDate(item[header]);
      } else {
        td.textContent = item[header] || 'N/A';
      }
      row.appendChild(td);
    });
    
    tableBody.appendChild(row);
    
  });
  
  initializeRowToggle();
}

function handleRowSelection(item, event) {
  if (!event) {
    console.error('Event is missing in handleRowSelection');
    return;
  }

  const row = event.currentTarget;
  const showAttachmentButton = document.getElementById('showAttachmentButton');
  const previouslySelected = document.querySelector('tr.selected');
  
  
  if (previouslySelected === row) {
    row.classList.remove('selected');
    showAttachmentButton.disabled = true;
    showAttachmentButton.textContent = 'Show Attachment';
    sessionStorage.removeItem('AttachmentIdList');
    return; 
  }
  
  if (previouslySelected) {
    previouslySelected.classList.remove('selected');
  }
  
  row.classList.add('selected');
  
  if (item.AttachmentIdList) {
    const validAttachments = item.AttachmentIdList.split(',').filter(id => id.trim() !== '');
    
    if (validAttachments.length > 0) {
      showAttachmentButton.disabled = false;
      showAttachmentButton.textContent = `Show Attachment (${validAttachments.length})`;
      sessionStorage.setItem('AttachmentIdList', validAttachments.join(','));
    } else {
      showAttachmentButton.disabled = true;
      showAttachmentButton.textContent = 'No Valid Attachments';
      sessionStorage.removeItem('AttachmentIdList');
    }
  } else {
    showAttachmentButton.disabled = true;
    showAttachmentButton.textContent = 'Show Attachment';
    sessionStorage.removeItem('AttachmentIdList');
  }
}

function initializeRowToggle() {
  const tableRows = document.querySelectorAll('tbody tr');
  const showAttachmentButton = document.getElementById('showAttachmentButton');
  
  if (showAttachmentButton) {
    showAttachmentButton.disabled = true;
  }
  
  tableRows.forEach(row => {
    row.removeEventListener('click', handleRowClickWrapper);
    
    row.addEventListener('click', handleRowClickWrapper);
  });
}


function handleRowClickWrapper(event) {
  const row = event.currentTarget;
  const cells = Array.from(row.cells);
  
  const item = {};
  const headers = Array.from(document.querySelectorAll('thead th')).map(th => 
    th.textContent.trim().replace(/[↑↓]/g, '')
  );
  
  cells.forEach((cell, index) => {
    if (headers[index]) {
      item[headers[index]] = cell.textContent.trim();
    }
  });
  
  const attachmentColumn = headers.findIndex(h => h === 'AttachmentIdList');
  if (attachmentColumn >= 0) {
    item.AttachmentIdList = cells[attachmentColumn].textContent.trim();
  }
  
  handleRowSelection(item, event);
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


function displayLeadFilters() {
  const filterInputs = document.getElementById('filterInputs');
  if (!filterInputs) return;
  
  filterInputs.innerHTML = ''; 
  filterInputs.style.display = 'flex';
  
  
  const fields = ['Id', 'FirstName', 'LastName', 'Company', 'Email', 'CreateDate', 'LastModifiedDate'];
  const storedFilters = JSON.parse(localStorage.getItem('LS_Lead_Filters')) || {};
  
  fields.forEach(field => {
    const input = document.createElement('input');


    input.type = field.includes('Date') ? 'date' : 'text';
    input.placeholder = field;
    input.id = `filter-${field}`;
    input.classList.add('filter-input');
    
    if (storedFilters[field]) {
      input.value = storedFilters[field];
    }
    
    filterInputs.appendChild(input);
  });
  
  const applyButton = document.createElement('button');
  applyButton.textContent = 'Apply Filters';
  applyButton.classList.add('apply-button');
  applyButton.addEventListener('click', () => applyLeadFilters(fields));
  filterInputs.appendChild(applyButton);
  
  const resetButton = document.createElement('button');
  resetButton.textContent = 'Reset Filters';
  resetButton.classList.add('reset-button');
  resetButton.addEventListener('click', () => resetLeadFilters(fields));
  filterInputs.appendChild(resetButton);
}

 async function applyLeadFilters(fields) {
  const eventId = sessionStorage.getItem('selectedEventId');
  if (!eventId) {
    alert('No EventId found. Please return to the main page and select an event.');
    return;
  }
  
  const filters = {};
  fields.forEach(field => {
    const value = document.getElementById(`filter-${field}`).value.trim();
    if (value) {
      filters[field] = value;
    }
  });
  
  localStorage.setItem('LS_Lead_Filters', JSON.stringify(filters));

  const filterParts = [`EventId eq '${escapeODataValue(eventId)}'`]; 
  
  Object.entries(filters).forEach(([field, value]) => {
    if (field.includes('Date')) {
      const date = parseDate(value);
      if (date) {
        filterParts.push(`${field} eq datetime'${formatDateForOData(date)}T00:00:00'`);
      }
    } else if (field === 'Id' || field === 'Email') {
      filterParts.push(`${field} eq '${escapeODataValue(value)}'`);
    } else if (field === 'FirstName' || field === 'LastName' || field === 'Company') {
      filterParts.push(`startswith(${field}, '${escapeODataValue(value)}')`);
    }
  });
  
  const filterQuery = filterParts.join(' and ');
  const endpoint = `LS_Lead?$format=json&$filter=${encodeURIComponent(filterQuery)}`;
  
  try {
    const data = await apiService.request('GET', endpoint);
    if (data && data.d && data.d.results) {
      displayData(data.d.results);
    } else {
      displayData([]);
      document.getElementById('noDataMessage').textContent = 'No data found with the provided filters.';
    }
  } catch (error) {
    console.error('Error applying filters:', error);
    alert('An error occurred while fetching filtered data.');
  }
}

function resetLeadFilters(fields) {
  localStorage.removeItem('LS_Lead_Filters');
  
  fields.forEach(field => {
    const input = document.getElementById(`filter-${field}`);
    if (input) {
      input.value = '';
    }
  });

  fetchLsLeadData();
}

document.addEventListener('DOMContentLoaded', () => {
  const showAttachmentButton = document.getElementById('showAttachmentButton');
  showAttachmentButton.addEventListener('click', () => {
    const attachmentIdList = sessionStorage.getItem('AttachmentIdList');
    if (attachmentIdList) {
      sessionStorage.setItem('attachmentSource', 'Lead');
      window.location.href = 'displayLsAttachmentList.html';
    } else {
      alert('No attachments available for this lead.');
    }
  });

  // init pagination
  pagination.initPagination();

  fetchLsLeadData();
  displayLeadFilters();
  initializeRowToggle();
}
);

const backButton = document.getElementById('backButton');
backButton.addEventListener('click', () => {
  window.location.href = 'display.html';
});
