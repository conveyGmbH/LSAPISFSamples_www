import ApiService from "../services/apiService.js";
import { formatDate,setupPagination, formatDateForOData, escapeODataValue } from "../utils/helper.js";

const serverName = sessionStorage.getItem('serverName');
const apiName = sessionStorage.getItem('apiName');
const credentials = sessionStorage.getItem('credentials');

if (!serverName || !apiName || !credentials) {
  window.location.href = '/index.html';
}

const apiService = new ApiService(serverName, apiName);
let nextUrl = '';


const columnConfig = {
    LS_LeadReport: {
      "Id": "400px",
      "CreatedDate": "200px",
      "LastModifiedDate": "300px",
      "CreatedById": "300px",
      "LastModifiedById": "300px",
      "Salutation": "300px",
      "Suffix": "300px",
      "FirstName": "300px",
      "MiddleName": "300px",
      "LastName": "300px",
      "Company": "500px",
      "Title": "300px",
      "Phone": "300px",
      "MobilePhone": "300px",
      "Fax": "300px",
      "Email": "300px",
      "Website": "300px",
      "Street": "300px",
      "PostalCode": "300px",
      "City": "300px",
      "Country": "300px",
      "CountryCode": "300px",
      "State": "300px",
      "Description": "700px",
      "IsReviewed": "300px", 
      "AttachmentIdList": "800px",
      "SalesArea": "300px",
      "RequestBarcode": "500px",
      "StatusMessage": "600px",
      "DeviceId": "600px",
      "DeviceRecordId": "300px",
      "SystemModstamp": "300px",
      "EventId": "600px",
      "Department": "300px",
      "Industry": "300px",
      "Question01": "300px",
      "Answers01": "300px",
      "Text01": "300px",
      "Question02": "300px",
      "Answers02": "300px",
      "Text02": "300px",
      "Question03": "300px",
      "Answers03": "300px",
      "Text03": "300px",
      "Question04": "300px",
      "Answers04": "300px",
      "Text04": "300px",
      "Question05": "300px",
      "Answers05": "300px",
      "Text05": "300px",
      "Question06": "300px",
      "Answers06": "300px",
      "Text06": "300px",
      "Question07": "300px",
      "Answers07": "300px",
      "Text07": "300px",
      "Question08": "300px",
      "Answers08": "300px",
      "Text08": "300px",
      "Question09": "300px",
      "Answers09": "300px",
      "Text09": "300px",
      "Question10": "300px",
      "Answers10": "300px",
      "Text10": "300px",
      "Question11": "300px",
      "Answers11": "300px",
      "Text11": "300px",
      "Question12": "300px",
      "Answers12": "300px",
      "Text12": "300px",
      "Question13": "300px",
      "Answers13": "300px",
      "Text13": "300px",
      "Question14": "300px",
      "Answers14": "300px",
      "Text14": "300px",
      "Question15": "300px",
      "Answers15": "300px",
      "Text15": "300px",
      "Question16": "300px",
      "Answers16": "300px",
      "Text16": "300px",
      "Question17": "300px",
      "Answers17": "300px",
      "Text17": "300px",
      "Question18": "300px",
      "Answers18": "300px",
      "Text18": "300px",
      "Question19": "300px",
      "Answers19": "300px",
      "Text19": "300px",
      "Question20": "300px",
      "Answers20": "300px",
      "Text20": "300px",
      "Question21": "300px",
      "Answers21": "300px",
      "Text21": "300px",
      "Question22": "300px",
      "Answers22": "300px",
      "Text22": "300px",
      "Question23": "300px",
      "Answers23": "300px",
      "Text23": "300px",
      "Question24": "300px",
      "Answers24": "300px",
      "Text24": "300px",
      "Question25": "300px",
      "Answers25": "300px",
      "Text25": "300px",
      "Question26": "300px",
      "Answers26": "300px",
      "Text26": "300px",
      "Question27": "300px",
      "Answers27": "300px",
      "Text27": "300px",
      "Question28": "300px",
      "Answers28": "300px",
      "Text28": "300px",
      "Question29": "300px",
      "Answers29": "300px",
      "Text29": "300px",
      "Question30": "300px",
      "Answers30": "300px",
      "Text30": "300px"
    }
  };

  const pagination = setupPagination(apiService, displayData);

  let lastSortedColumn = null;
  let lastSortDirection = 'asc';
  let selectedRowItem = null;


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

function getColumnWidth(header, entity) {
  if (columnConfig[entity] && columnConfig[entity][header] !== undefined) {
    return columnConfig[entity][header];
  }
  return null;
}

function displayData(data, append = false) {

  const tableHead = document.getElementById('tableHead');
  const tableBody = document.getElementById('tableBody');
  const noDataMessage = document.getElementById('noDataMessage');
  const showAttachmentButton = document.getElementById('showAttachmentButton');

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

      const width = getColumnWidth(header, 'LS_LeadReport');
      if (width) {
        th.style.width = width;
      }

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

      const width = getColumnWidth(header, 'LS_LeadReport');
      if (width) {
        td.style.width = width;
      }

       if (header === lastSortedColumn) {
        td.classList.add('active');
      }


      if (header.includes('Date') || header === 'SystemModstamp') {
        td.textContent = formatDate(item[header]);
      } else {
        td.textContent = item[header] || 'N/A';
      }
      row.appendChild(td);
    });

    tableBody.appendChild(row);

    row.addEventListener('click', () => {
      const tableRows = document.querySelectorAll('tbody tr');

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
  filterInputs.classList.add('filter-container');

  const textFields = ['Id', 'CreatedById', 'LastModifiedById','FirstName', 'LastName', 'Company', 'Email'];
  const dateFields = ['CreatedDate', 'LastModifiedDate', 'SystemModstamp'];



  const storedFilters = JSON.parse(localStorage.getItem('LS_LeadReport_Filters')) || {};

  textFields.forEach(field => {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = field;
    input.id = `filter-${field}`;
    input.classList.add('filter-input');
    input.classList.add(`filter-${field.toLowerCase()}`);

    if (storedFilters[field]) {
      input.value = storedFilters[field];
    }

    input.addEventListener('input', updateResetButtonState);
    filterInputs.appendChild(input);
  });

  dateFields.forEach(field => {
    const dateWrapper = document.createElement('div');
    dateWrapper.classList.add('date-wrapper');
    dateWrapper.classList.add(`date-wrapper-${field.toLowerCase()}`);

    const input = document.createElement('input');
    input.type = 'date';
    input.id = `filter-${field}`;
    input.classList.add('filter-input', 'filter-date');

    if (storedFilters[field]) {
      input.value = storedFilters[field];
    }

    input.addEventListener('input', updateResetButtonState);

    const label = document.createElement('span');
    label.textContent = field;
    label.classList.add('date-label');

    dateWrapper.appendChild(input);
    dateWrapper.appendChild(label);
    filterInputs.appendChild(dateWrapper);
  });

  const buttonWrapper = document.createElement('div');
  buttonWrapper.classList.add('filter-buttons');

  const applyButton = document.createElement('button');
  applyButton.textContent = 'Apply Filters';
  applyButton.classList.add('filter-button', 'apply-filter');
  applyButton.addEventListener('click', () => applyLeadReportFilters([...textFields, ...dateFields]));
  buttonWrapper.appendChild(applyButton);

  const resetButton = document.createElement('button');
  resetButton.textContent = 'Reset Filters';
  resetButton.id = 'resetFiltersButton';
  resetButton.classList.add('filter-button', 'reset-filter');

  const hasActiveFilters = Object.values(storedFilters).some(value => value && value.trim() !== '');
  resetButton.disabled = !hasActiveFilters;

  resetButton.addEventListener('click', () => resetLeadReportFilters([...textFields, ...dateFields]));
  buttonWrapper.appendChild(resetButton);

  filterInputs.appendChild(buttonWrapper);
}

function updateResetButtonState() {
  const resetButton = document.getElementById('resetFiltersButton');
  if (!resetButton) return;
  
  const filterInputs = document.querySelectorAll('.filter-input');
  const hasValue = Array.from(filterInputs).some(input => input.value && input.value.trim() !== '');
  
  resetButton.disabled = !hasValue;
}



async function applyLeadReportFilters(fields) {
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

  localStorage.setItem('LS_LeadReport_Filters', JSON.stringify(filters));

  if (!hasFilters) {
    return fetchLsLeadReportData();
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
      filterParts.push(emailFilter);
    } else if (field === 'FirstName' || field === 'LastName' || field === 'Company') {
      filterParts.push(`substringof('${escapeODataValue(value)}', ${field})`);
    }
  });

  const filterQuery = filterParts.join(' and ');
  console.log('Generated OData filter query:', filterQuery);

  let endpoint = `LS_LeadReport?$format=json&$filter=${encodeURIComponent(filterQuery)}`;

  if (lastSortedColumn) {
    const sortOrder = lastSortDirection === 'asc' ? lastSortedColumn : `${lastSortedColumn} desc`;
    endpoint = `LS_LeadReport?$orderby=${sortOrder}&$format=json&$filter=${encodeURIComponent(filterQuery)}`;
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


function resetLeadReportFilters(fields) {
  localStorage.removeItem('LS_LeadReport_Filters');

  fields.forEach(field => {
    const input = document.getElementById(`filter-${field}`);
    if (input) {
      input.value = '';
    }
  });

  const resetButton = document.getElementById('resetFiltersButton');
  if (resetButton) {
    resetButton.disabled = true;
  }

  fetchLsLeadReportData();
}

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
    
    const storedFilters = JSON.parse(localStorage.getItem('LS_LeadReport_Filters')) || {};
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

    let endpoint = `LS_LeadReport?$orderby=${sortOrder}&$format=json&$filter=${encodeURIComponent(filterQuery)}`;

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
  }
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