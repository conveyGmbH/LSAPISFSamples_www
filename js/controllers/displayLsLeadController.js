import ApiService from '../services/apiService.js';
import {escapeODataValue, formatDateForOData, formatDate, setupPagination } from '../utils/helper.js';

const columnConfig = {
  LS_Lead: {
    "Status": "150px",  // New Status column
    "Id": "500px",
    "CreatedDate": "200px",
    "LastModifiedDate": "200px",
    "CreatedById": "400px",
    "LastModifiedById": "400px",
    "Salutation": "400px",
    "Suffix": "200px",
    "FirstName": "400px",
    "MiddleName": "400px",
    "LastName": "400px",
    "Company": "500px",
    "Title": "400px",
    "Phone": "400px",
    "MobilePhone": "400px",
    "Fax": "400px",
    "Email": "400px",
    "Website": "500px",
    "Street": "400px",
    "PostalCode": "400px",
    "City": "300px",
    "Country": "300px",
    "CountryCode": "200px",
    "State": "300px",
    "Description": "500px",
    "AttachmentIdList": "800px",
    "SalesArea": "400px",
    "RequestBarcode": "500px",
    "StatusMessage": "500px",
    "DeviceId": "200px",
    "DeviceRecordId": "200px",
    "SystemModstamp": "200px",
    "EventId": "500px",
    "IsReviewed": "400px",
    "Department": "400px",
    "Industry": "200px"
  }
};


const serverName = sessionStorage.getItem('serverName');
const apiName = sessionStorage.getItem('apiName');
const credentials = sessionStorage.getItem('credentials');

if (!serverName || !apiName || !credentials) {
  window.location.href = '/index.html';
}

const apiService = new ApiService(serverName, apiName);

const pagination = setupPagination(apiService, displayData);

let lastSortedColumn = null;
let lastSortDirection = 'asc';
let selectedRowItem = null;

/**
 * Get transfer status for a lead from localStorage
 * @param {string} leadId - The lead ID to check
 * @returns {object|null} Transfer status object or null if not transferred
 */
/**
 * Get transfer status from backend with Salesforce verification
 * @param {string} leadId - The lead ID to check
 * @returns {Promise<Object|null>} Enhanced status object or null
 */
async function getTransferStatus(leadId) {
  if (!leadId) return null;

  try {
    const BACKEND_API_URL = window.location.hostname === 'localhost'
      ? 'http://localhost:3000'
      : 'https://lsapisfbackenddev-gnfbema5gcaxdahz.germanywestcentral-01.azurewebsites.net';

    const orgId = localStorage.getItem('orgId') || 'default';

    const response = await fetch(`${BACKEND_API_URL}/api/leads/transfer-status/${leadId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Org-Id': orgId
      },
      credentials: 'include'
    });

    if (!response.ok) {
      console.error('Failed to get transfer status:', response.statusText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching transfer status:', error);
    return null;
  }
}

/**
 * Check if a lead has been transferred to Salesforce
 * @param {string} leadId - The lead ID to check
 * @returns {Promise<boolean>} True if transferred, false otherwise
 */
async function isLeadTransferred(leadId) {
  const status = await getTransferStatus(leadId);
  return status !== null && status.status !== 'NOT_TRANSFERRED';
}

// Function to fetch LS_Lead data
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

async function refreshTransferStatuses() {
  try {
    const BACKEND_API_URL = window.location.hostname === 'localhost'
      ? 'http://localhost:3000'
      : 'https://lsapisfbackenddev-gnfbema5gcaxdahz.germanywestcentral-01.azurewebsites.net';

    const orgId = localStorage.getItem('orgId') || 'default';
    await fetch(`${BACKEND_API_URL}/api/leads/transfer-status/sync`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Org-Id': orgId }
    });
  } catch (e) {
    console.warn('Status sync failed:', e);
  }
}






 function addTransferButton() {
  // Check if the button already exists to avoid duplicates
  if (document.getElementById('transferButton')) return;
  
  // Create the button
  const transferButton = document.createElement('button');
  transferButton.id = 'transferButton';
  transferButton.className = 'action-button';
  transferButton.disabled = true;
  transferButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 5v14M19 12l-7 7-7-7"/>
    </svg>
    <span>Transfer to Salesforce</span>
  `;
  
  // Add click event
  transferButton.addEventListener('click', () => {
    if (selectedRowItem) {
      sessionStorage.setItem('selectedLeadData', JSON.stringify(selectedRowItem));
      sessionStorage.setItem('selectedLeadSource', 'Lead');
      window.location.href = 'displayLeadTransfer.html';
    } else {
      alert('Please select a lead to transfer.');
    }
  });
  
  // Insert the button into the DOM
  const showAttachmentButton = document.getElementById('showAttachmentButton');
  const actionsContainer = showAttachmentButton?.parentNode;
  
  if (actionsContainer) {
    actionsContainer.insertBefore(transferButton, showAttachmentButton.nextSibling);
  }
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

document.addEventListener('DOMContentLoaded', () => {
  // Display userName in header
  displayUserName();

  addTransferButton();

});


// Function to get the configured width of a column
function getColumnWidth(header, entity) {

  // Check if there is a configuration for this entity and column
  if (columnConfig[entity] && columnConfig[entity][header] !== undefined) {
    return columnConfig[entity][header];
  }

  return null;
}


// Function to sort the table using OData
async function sortTable(index, th) {

  const headerText = th.childNodes[0].nodeValue.trim();

  const previouslySelectedRow = document.querySelector('tr.selected');
  let previousItem = null;

  if (previouslySelectedRow) {
    previousItem = getItemFromRow(previouslySelectedRow);
  }

  let sortAsc;

  if (lastSortedColumn !== headerText) {
    sortAsc = true;
    lastSortedColumn = headerText;
  } else {
    sortAsc = lastSortDirection === 'desc';
  }

  lastSortDirection = sortAsc ? 'asc' : 'desc';

  const allHeaders = document.querySelectorAll('thead th');
  allHeaders.forEach(header => {
    header.classList.remove('asc', 'desc', 'active');
  });

  th.classList.add(lastSortDirection, 'active');

  const sortOrder = sortAsc ? headerText : `${headerText} desc`;

  const eventId = sessionStorage.getItem('selectedEventId');
  if (!eventId) {
    alert('No EventId provided.');
    return;
  }

  try {
    const noDataMessage = document.getElementById('noDataMessage');
    if (noDataMessage) noDataMessage.textContent = 'Chargement...';

    const filterParts = [];
    filterParts.push(`EventId eq '${escapeODataValue(eventId)}'`);

    const storedFilters = JSON.parse(localStorage.getItem('LS_Lead_Filters')) || {};
    Object.entries(storedFilters).forEach(([field, value]) => {
      if (value && value.trim()) {
        if (field.includes('Date') || field.includes('SystemModstamp')) {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            const formattedDate = formatDateForOData(date);

            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);
            const formattedNextDay = formatDateForOData(nextDay);

            filterParts.push(`(${field} ge datetime'${formattedDate}T00:00:00' and ${field} lt datetime'${formattedNextDay}T00:00:00')`);
          }
        }
      }
    });

    const filterQuery = filterParts.join(' and ');

    let endpoint = `LS_Lead?$orderby=${sortOrder}&$format=json&$filter=${encodeURIComponent(filterQuery)}`;

    const data = await apiService.request('GET', endpoint);

    if (data && data.d && data.d.results) {
      displayData(data.d.results);

      pagination.updateNextUrl(data);

      if (previousItem) {
        restoreRowSelection(previousItem);
      }
    } else {
      displayData([]);
      if (noDataMessage) noDataMessage.textContent = 'No data available.';
    }
  } catch (error) {
    console.error('Sorting error:', error);
    alert('Error during sorting. Check the console for more details.');
  }
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

  const headers = Object.keys(data[0]).filter(header =>
    header !== '__metadata' && header !== 'KontaktViewId'
  );

  // Inject "Status" column at the beginning
  const headersWithStatus = ['Status', ...headers];

  const headerRow = document.createElement('tr');

  headersWithStatus.forEach((header, index) => {
    const th = document.createElement('th');

    const width = getColumnWidth(header, 'LS_Lead');
    if (width) {
      th.style.width = width;
    }

    const headerText = document.createTextNode(header);
    th.appendChild(headerText);

    const span = document.createElement('span');
    span.classList.add('icon-arrow');

    if (header === lastSortedColumn) {
      th.classList.add(lastSortDirection, 'active');
      span.innerHTML = lastSortDirection === 'asc' ? '&uarr;' : '&darr;';
    } else {
      span.innerHTML = '&UpArrow;';
    }
    
    th.appendChild(span);
    th.style.position = 'sticky';
    th.style.top = '0';
    th.addEventListener('click', () => sortTable(index, th));
    headerRow.appendChild(th);
  });

  tableHead.appendChild(headerRow);

  data.forEach(item => {
    const row = document.createElement('tr');

    headersWithStatus.forEach(header => {
      const td = document.createElement('td');

      const width = getColumnWidth(header, 'LS_Lead');
      if (width) {
        td.style.width = width;
      }

      if (header === lastSortedColumn) {
        td.classList.add('active');
      }

      // Handle Status column specially - load async
      if (header === 'Status') {
        const leadId = item.Id;

        // Create loading placeholder
        const badge = document.createElement('span');
        badge.style.cssText = 'display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background-color: #e5e7eb; color: #6b7280;';
        badge.textContent = '⏳ Loading...';
        badge.setAttribute('data-lead-id', leadId);
        td.appendChild(badge);

        // Load status asynchronously
        getTransferStatus(leadId).then(status => {
          if (status && status.icon) {
            badge.style.backgroundColor = status.color;
            badge.style.color = 'white';
            badge.textContent = `${status.icon} ${status.label}`;
            badge.title = status.details || status.label;
            badge.style.cursor = 'help';
          } else {
            // Fallback for old format or no status
            badge.style.backgroundColor = '#6b7280';
            badge.style.color = 'white';
            badge.textContent = '⏺ Not yet transferred';
          }
        }).catch(error => {
          console.error('Error loading status for', leadId, error);
          badge.style.backgroundColor = '#6b7280';
          badge.textContent = '⏺ Not yet transferred';
        });
      } else if (header.includes('Date') || header === 'SystemModstamp') {
        td.textContent = formatDate(item[header]);
      } else {
        td.textContent = item[header] || 'N/A';
      }
      row.appendChild(td);
    });

    tableBody.appendChild(row);
  });

  initializeRowToggle();

  refreshTransferStatuses();
}

function getItemFromRow(row) {
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
  
  return item;
}


function restoreRowSelection(previousItem) {
  if (!previousItem || !previousItem.Id) return;
  
  const rows = document.querySelectorAll('tbody tr');
  let matchFound = false;
  
  rows.forEach(row => {
    const rowItem = getItemFromRow(row);
    if (rowItem.Id === previousItem.Id) {
      row.click(); 
      matchFound = true;
    }
  });
  
  if (!matchFound) {
    const showAttachmentButton = document.getElementById('showAttachmentButton');
    if (showAttachmentButton) {
      showAttachmentButton.disabled = true;
      showAttachmentButton.textContent = 'Show Attachment';
      sessionStorage.removeItem('AttachmentIdList');
    }

    // Fix for transferButton reference
    const transferButton = document.getElementById('transferButton');
    if (transferButton) {
      transferButton.disabled = true;
    }
  }
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
    selectedRowItem = null;
    return; 
  }
  
  if (previouslySelected) {
    previouslySelected.classList.remove('selected');
  }
  
  row.classList.add('selected');
  selectedRowItem = item;
  
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

  // display button
  const transferButton = document.getElementById('transferButton');
  if (transferButton) {
    transferButton.disabled = !selectedRowItem;
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
  filterInputs.className = 'filter-container';
  
  const textFields = ['Id', 'FirstName', 'LastName', 'Company', 'Email'];
  const dateFields = ['CreatedDate', 'LastModifiedDate', 'SystemModstamp'];
  
  const storedFilters = JSON.parse(localStorage.getItem('LS_Lead_Filters')) || {};
  
  // Create text fields with floating labels
  textFields.forEach(field => {
    const inputGroup = document.createElement('div');
    inputGroup.classList.add('input-group-float');
    // Add ID to the container for styling specific fields
    inputGroup.id = `input-group-${field.toLowerCase()}`;
    
    // Create input element first (order is important for floating labels)
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `filter-${field}`;
    input.classList.add('filter-input');
    input.placeholder = " "; // Empty space placeholder is required for the CSS selector to work
    
    // Create label element
    const label = document.createElement('label');
    label.setAttribute('for', `filter-${field}`);
    label.textContent = field;
    
    // Restore stored values if they exist
    if (storedFilters[field]) {
      input.value = storedFilters[field];
    }
    
    input.addEventListener('input', updateResetButtonState);
    
    // Add elements to the DOM in correct order (input first, then label)
    inputGroup.appendChild(input);
    inputGroup.appendChild(label);
    filterInputs.appendChild(inputGroup);
  });
  
  // Create date fields with floating labels
  dateFields.forEach(field => {
    const inputGroup = document.createElement('div');
    inputGroup.classList.add('input-group-float');
    inputGroup.id = `input-group-${field.toLowerCase()}`;
    
    // Create date input first
    const input = document.createElement('input');
    input.type = 'date';
    input.id = `filter-${field}`;
    input.classList.add('filter-input');
    input.placeholder = " "; // Empty space placeholder
    
    // Create label
    const label = document.createElement('label');
    label.setAttribute('for', `filter-${field}`);
    label.textContent = field;
    
    // Restore stored values
    if (storedFilters[field]) {
      input.value = storedFilters[field];
      // This class helps with styling when a date is already selected
      inputGroup.classList.add('has-value');
    }
    
    input.addEventListener('input', () => {
      updateResetButtonState();
      // Add or remove has-value class when date is selected or cleared
      if (input.value) {
        inputGroup.classList.add('has-value');
      } else {
        inputGroup.classList.remove('has-value');
      }
    });
    
    // Add elements to DOM in correct order
    inputGroup.appendChild(input);
    inputGroup.appendChild(label);
    filterInputs.appendChild(inputGroup);
  });
  
  // Add button group
  const buttonGroup = document.createElement('div');
  buttonGroup.classList.add('filter-buttons');
  
  // Apply filters button
  const applyButton = document.createElement('button');
  applyButton.textContent = 'Apply Filters';
  applyButton.classList.add('filter-button');
  applyButton.addEventListener('click', () => applyLeadFilters([...textFields, ...dateFields]));
  buttonGroup.appendChild(applyButton);
  
  // Reset filters button
  const resetButton = document.createElement('button');
  resetButton.textContent = 'Reset Filters';
  resetButton.id = 'resetFiltersButton';
  resetButton.classList.add('filter-button', 'reset-button');
  
  // Check if there are any active filters
  const hasActiveFilters = Object.values(storedFilters).some(value => value && value.trim() !== '');
  resetButton.disabled = !hasActiveFilters;
  
  resetButton.addEventListener('click', () => resetLeadFilters([...textFields, ...dateFields]));
  buttonGroup.appendChild(resetButton);
  
  // Add button group to filters container
  filterInputs.appendChild(buttonGroup);
}

async function applyLeadFilters(fields) {
  const eventId = sessionStorage.getItem('selectedEventId');
  if (!eventId) {
    alert('No EventId found. Please return to the main page and select an event.');
    return;
  }
  
  const filters = {};
  let hasFilters = false;
  
  fields.forEach(field => {
    const value = document.getElementById(`filter-${field}`).value.trim();
    if (value) {
      filters[field] = value;
      hasFilters = true;
    }
  });
  
  localStorage.setItem('LS_Lead_Filters', JSON.stringify(filters));
  
  if (!hasFilters) {
    return fetchLsLeadData();
  }

  const filterParts = [`EventId eq '${escapeODataValue(eventId)}'`]; 
  
  Object.entries(filters).forEach(([field, value]) => {
    if (field.includes('Date') || field.includes('SystemModstamp')) {      
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        const formattedDate = formatDateForOData(date);
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        const formattedNextDay = formatDateForOData(nextDay);

        filterParts.push(`(${field} ge datetime'${formattedDate}T00:00:00' and ${field} lt datetime'${formattedNextDay}T00:00:00')`);
      }
    } else if (field === 'Id') {
      filterParts.push(`substringof('${escapeODataValue(value)}', ${field})`);
    } else if (field === 'Email') {
      const emailFilter = `substringof('${escapeODataValue(value)}', ${field})`;
      console.log('Email filter:', emailFilter);
      filterParts.push(emailFilter);
      // filterParts.push(`substringof('${escapeODataValue(value)}', ${field})`);
    } else if (field === 'FirstName' || field === 'LastName' || field === 'Company') {
      filterParts.push(`substringof('${escapeODataValue(value)}', ${field})`);
    }
  });
  
  const filterQuery = filterParts.join(' and ');
  console.log('Generated OData filter query:', filterQuery); 
  
  let endpoint = `LS_Lead?$format=json&$filter=${encodeURIComponent(filterQuery)}`;
  
  if (lastSortedColumn) {
    const sortOrder = lastSortDirection === 'asc' ? lastSortedColumn : `${lastSortedColumn} desc`;
    endpoint = `LS_Lead?$orderby=${sortOrder}&$format=json&$filter=${encodeURIComponent(filterQuery)}`;
  }
  
  try {
    const data = await apiService.request('GET', endpoint);
    if (data && data.d && data.d.results) {
      displayData(data.d.results);
      pagination.updateNextUrl(data);
    } else {
      displayData([]);
      document.getElementById('noDataMessage').textContent = 'No data found with the provided filters.';
    }
  } catch (error) {
    console.error('Error applying filters:', error);
    console.error('Error details:', error.message);
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
  
  // reset the filter button state
  const resetButton = document.getElementById('resetFiltersButton');
  if (resetButton) {
    resetButton.disabled = true;
  }

  fetchLsLeadData();
}

function updateResetButtonState() {
  const resetButton = document.getElementById('resetFiltersButton');
  if (!resetButton) return;
  
  const filterInputs = document.querySelectorAll('.filter-input');
  const hasValue = Array.from(filterInputs).some(input => input.value && input.value.trim() !== '');
  
  resetButton.disabled = !hasValue;
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

    addTransferButton();


  pagination.initPagination();

  fetchLsLeadData();
  displayLeadFilters();
  initializeRowToggle();
});

const backButton = document.getElementById('backButton');
backButton.addEventListener('click', () => {
  window.location.href = 'display.html';
});

