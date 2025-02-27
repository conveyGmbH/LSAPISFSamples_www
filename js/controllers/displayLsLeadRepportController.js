import ApiService from "../services/apiService.js";
import { formatDate, sortTable, parseDate, formatDateForOData, escapeODataValue } from "../utils/helper.js";

const serverName = sessionStorage.getItem('serverName');
const apiName = sessionStorage.getItem('apiName');
const credentials = sessionStorage.getItem('credentials');

if (!serverName || !apiName || !credentials) {
  window.location.href = '/index.html';
}

const apiService = new ApiService(serverName, apiName);
let nextUrl = '';


async function fetchLsLeadReportData() {
  const eventId = sessionStorage.getItem('selectedEventId');
  if (!eventId) {
    alert('No EventId provided.');
    window.location.href = 'display.html';
    return;
  }

  const endpoint = `LS_LeadReport?$format=json&$filter=EventId eq '${encodeURIComponent(eventId)}'`;

  try {
    const data = await apiService.request('GET', endpoint);
    if (data && data.d && data.d.results) {
      displayData(data.d.results);
      
      // Setup for pagination
      nextUrl = apiService.getNextUrl(data);
      document.getElementById('nextButton').disabled = !nextUrl;
    } else {
      displayData([]);
    }
  } catch (error) {
    console.error('Error fetching LS_LeadReport data:', error);
    apiService.showError('An error occurred while fetching LS_LeadReport data.');
  }

  // Initialize search functionality
  initSearch();
  
  // Display filter options
  displayLeadReportFilters();
}

function displayData(data, append = false) {
  const tableHead = document.getElementById('tableHead');
  const tableBody = document.getElementById('tableBody');
  const noDataMessage = document.getElementById('noDataMessage');
  const showAttachmentButton = document.getElementById('showAttachmentButton');
  
  // Initialize the attachment button if it exists
  if (showAttachmentButton) {
    showAttachmentButton.disabled = true;
    showAttachmentButton.textContent = 'Show Attachment';
  }

  if (!append) {
    tableHead.innerHTML = '';
    tableBody.innerHTML = '';
  }

  if (!data || data.length === 0) {
    noDataMessage.textContent = 'No data available.';
    return;
  }

  noDataMessage.textContent = '';

  // Filter out metadata and unwanted columns
  const headers = Object.keys(data[0]).filter(header => 
    header !== '__metadata' && 
    header !== 'KontaktViewId' && 
    !header.endsWith(' ')
  );

  if (!append) {
    const headerRow = document.createElement('tr');
    
    headers.forEach((header, index) => {
      const th = document.createElement('th');
      
      // Create a text node for the header text
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
  }

  // Populate table body
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
    
 
    row.addEventListener('click', () => {
      const tableRows = document.querySelectorAll('tbody tr');
      
      // If row is already selected, deselect it
      if (row.classList.contains('selected')) {
        row.classList.remove('selected');
        if (showAttachmentButton) {
          showAttachmentButton.disabled = true;
          showAttachmentButton.textContent = 'Show Attachment';
        }
        sessionStorage.removeItem('AttachmentIdList');
      } else {
        
        tableRows.forEach(r => r.classList.remove('selected'));
        
        row.classList.add('selected');
        
        // Check if this item has attachments
        if (item.AttachmentIdList) {
          if (showAttachmentButton) {
            const attachmentCount = item.AttachmentIdList.split(',').length;
            showAttachmentButton.disabled = false;
            showAttachmentButton.textContent = `Show Attachment (${attachmentCount})`;
          }
          sessionStorage.setItem('AttachmentIdList', item.AttachmentIdList);
        } else {
          if (showAttachmentButton) {
            showAttachmentButton.disabled = true;
            showAttachmentButton.textContent = 'No Attachments';
          }
          sessionStorage.removeItem('AttachmentIdList');
        }
      }
    });
  });
}


async function loadNextRows() {
  if (!nextUrl) {
    console.error('No next URL found.');
    return;
  }

  try {
    const data = await apiService.fetchNextRows(nextUrl);

    if (data && data.d && data.d.results.length > 0) {
      displayData(data.d.results, true);
      nextUrl = apiService.getNextUrl(data); 
      document.getElementById('nextButton').disabled = !nextUrl;
    } else {
      alert('No more data to load.');
      nextUrl = ''; 
      document.getElementById('nextButton').disabled = true;
    }
  } catch (error) {
    console.error("Error loading next rows:", error);
    apiService.showError("Failed to load additional data.");
  }
}


function displayLeadReportFilters() {
  const filterInputs = document.getElementById('filterInputs');
  if (!filterInputs) return;
  
  filterInputs.innerHTML = ''; 
  filterInputs.style.display = 'flex';
  
  // Filter fields for LS_LeadReport
  const fields = ['Id', 'CreateDate', 'LastModifiedDate', 'SystemModstamp'];
  const storedFilters = JSON.parse(localStorage.getItem('LS_LeadReport_Filters')) || {};
  
  fields.forEach(field => {
    const input = document.createElement('input');
    input.type = field.includes('Date') || field === 'SystemModstamp' ? 'date' : 'text';
    input.placeholder = field;
    input.id = `filter-${field}`;
    input.classList.add('filter-input');
    
    // Restore saved values if available
    if (storedFilters[field]) {
      input.value = storedFilters[field];
    }
    
    filterInputs.appendChild(input);
  });
  
  // Apply button
  const applyButton = document.createElement('button');
  applyButton.textContent = 'Apply Filters';
  applyButton.classList.add('apply-button');
  applyButton.addEventListener('click', () => applyLeadReportFilters(fields));
  filterInputs.appendChild(applyButton);
  
  // Reset button
  const resetButton = document.createElement('button');
  resetButton.textContent = 'Reset Filters';
  resetButton.classList.add('reset-button');
  resetButton.addEventListener('click', () => resetLeadReportFilters(fields));
  filterInputs.appendChild(resetButton);
}


async function applyLeadReportFilters(fields) {
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
  
  // Save filters to localStorage
  localStorage.setItem('LS_LeadReport_Filters', JSON.stringify(filters));
  
  // Build filter parts
  const filterParts = [`EventId eq '${escapeODataValue(eventId)}'`]; // Always filter by EventId
  
  Object.entries(filters).forEach(([field, value]) => {
    if (field.includes('Date') || field === 'SystemModstamp') {
      const date = parseDate(value);
      if (date) {
        filterParts.push(`${field} eq datetime'${formatDateForOData(date)}T00:00:00'`);
      }
    } else if (field === 'Id') {
      filterParts.push(`${field} eq '${escapeODataValue(value)}'`);
    } else {
      // "Starts with" search for other fields
      filterParts.push(`startswith(${field},'${escapeODataValue(value)}') eq true`);
    }
  });
  
  const filterQuery = filterParts.join(' and ');
  const endpoint = `LS_LeadReport?$format=json&$filter=${encodeURIComponent(filterQuery)}`;
  
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

function resetLeadReportFilters(fields) {
  localStorage.removeItem('LS_LeadReport_Filters');
  
  fields.forEach(field => {
    const input = document.getElementById(`filter-${field}`);
    if (input) {
      input.value = '';
    }
  });
  
  // Reload initial data
  fetchLsLeadReportData();
}


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

    // Update row colors for better visibility
    document.querySelectorAll('tbody tr:not(.hide)').forEach((visibleRow, i) => {
      visibleRow.style.backgroundColor = (i % 2 === 0) ? 'transparent' : 'rgba(0, 0, 0, 0.03)';
    });

    if (!found) {
      noDataMessage.textContent = 'No results found.';
    } else {
      noDataMessage.textContent = '';
    }
  });
}


function init() {
  fetchLsLeadReportData();

  // Setup back button
  const backButton = document.getElementById('backButton');
  if (backButton) {
    backButton.addEventListener('click', () => {
      window.location.href = 'display.html';
    });
  }

  // Setup pagination button
  const nextButton = document.getElementById('nextButton');
  if (nextButton) {
    nextButton.addEventListener('click', loadNextRows);
  }
  
  // Setup show attachment button if it exists
  const showAttachmentButton = document.getElementById('showAttachmentButton');
if (showAttachmentButton) {
  showAttachmentButton.addEventListener('click', () => {
    const attachmentIdList = sessionStorage.getItem('AttachmentIdList');
    if (attachmentIdList) {
      
      sessionStorage.setItem('attachmentSource', 'LeadReport');
      window.location.href = 'displayLsAttachmentList.html';
    } else {
      alert('No attachments available for this report.');
    }
  });
}
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', init);