import ApiService from '../services/apiService.js';
import {clearTable, formatDate, parseDate, escapeODataValue, formatDateForOData } from '../utils/helper.js';

// Retrieve server information from sessionStorage
const serverName = sessionStorage.getItem('serverName');
const apiName = sessionStorage.getItem('apiName');
const credentials = sessionStorage.getItem('credentials');

// Column width config
const columnConfig = {
  LS_Country: {
    Id: "100px",
    Name: "300px",
    Code: "100px"
  },
  LS_User: {
    Id: "400px",
    FirstName: "150px",
    LastName: "150px",
    Email: "200px",
    Phone: "200px",
    MobilePhone: "300px",
    Street: "200px",
    PostalCode: "150px",
    City: "150px",
    Country: "150px",
    CountryCode: "250px",
    EventId: "500px"
  },
  LS_Event: {
    Id: "400px",
    CreatedDate: "200px",
    LastModifiedDate: "200px",
    Subject: "300px",
    StartDate: "200px",
    EndDate: "200px",
    Type: "400px",
    EventSubtype: "300px",
    Description: "300px",
  }
};

let lastSortedColumn = null;
let lastSortDirection = 'asc';


const ACTIVATING_ENTITY = 'LS_Event';
const DEFAULT_ENTITY = 'LS_Country'; 

if (!serverName || !apiName || !credentials) {
  window.location.href = '/index.html';
}

const apiService = new ApiService(serverName, apiName);
let selectedEventId = null;
let currentEntity = '';
let nextUrl = '';


function displayFilterInputs(entity) {
  const filterInputs = document.getElementById('filterInputs');
  filterInputs.style.display = 'flex';
  filterInputs.innerHTML = '';
  let fields = [];

  if (entity === 'LS_User') {
    fields = ['Id', 'FirstName', 'LastName', 'EventId'];
  } else if (entity === 'LS_Event') {
    fields = ['Id', 'Subject', 'StartDate', 'EndDate'];
  }

  const storedFilters = JSON.parse(localStorage.getItem(`${entity}_Filters`)) || {};
  
  const hasActiveFiltersWithValues = Object.values(storedFilters).some(value => value && value.trim() !== '');

  fields.forEach(field => {
    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('date-input-wrapper');

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = field;
    input.id = `filter-${field}`;
    input.classList.add('filter-input');

    input.addEventListener('input', () => updateResetButtonState(entity, fields));

    if (storedFilters[field]) {
      input.value = storedFilters[field];
    }

    if (field === 'StartDate' || field === 'EndDate') {
      input.type = 'date';

      const fieldLabel = document.createElement('span');
      fieldLabel.textContent = field;
      fieldLabel.classList.add('date-field-label');
         
      inputWrapper.appendChild(input);
      inputWrapper.appendChild(fieldLabel);
      filterInputs.appendChild(inputWrapper);
    } else {
      input.type = 'text';
      input.placeholder = field;
      filterInputs.appendChild(input);
    }
  });

  const applyButton = document.createElement('button');
  applyButton.textContent = 'Apply Filters';
  applyButton.classList.add('apply-button');
  applyButton.addEventListener('click', () => applyFilters(entity, fields));
  filterInputs.appendChild(applyButton);

  const resetButton = document.createElement('button');
  resetButton.textContent = 'Reset Filters';
  resetButton.classList.add('reset-button');
  resetButton.id = 'resetFiltersButton';
  
  resetButton.disabled = !hasActiveFiltersWithValues;
  
  resetButton.addEventListener('click', () => resetFilters(entity, fields));
  filterInputs.appendChild(resetButton);

  updateResetButtonState(entity, fields);
}

function updateResetButtonState(entity, fields) {
  const resetButton = document.getElementById('resetFiltersButton');
  if (!resetButton) return;
  
  const hasValue = fields.some(field => {
    const input = document.getElementById(`filter-${field}`);
    return input && input.value && input.value.trim() !== '';
  });
  
  resetButton.disabled = !hasValue;
}

function resetFilters(entity, fields) {
  localStorage.removeItem(`${entity}_Filters`);
  
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
  
  updateData();
}


async function applyFilters(entity, fields) {
  const filters = {};
  let hasFilters = false;

  fields.forEach((field) => {
    const value = document.getElementById(`filter-${field}`).value.trim();
    if (value) {
      filters[field] = value;
      hasFilters = true;
    }
  });

  localStorage.setItem(`${entity}_Filters`, JSON.stringify(filters));

  if (!hasFilters) {
    return updateData();
  }

  const filterParts = [];

  if (entity === "LS_User") {
    if (filters["Id"]) {
      filterParts.push(`substringof('${escapeODataValue(filters["Id"])}', Id) eq true`);
    }

    if (filters["FirstName"]) {
      filterParts.push(`substringof('${escapeODataValue(filters["FirstName"])}', FirstName) eq true`);
    }

    if (filters["LastName"]) {
      filterParts.push(`substringof('${escapeODataValue(filters["LastName"])}', LastName) eq true`);
    }

    if (filters["EventId"]) {
      filterParts.push(`substringof('${escapeODataValue(filters["EventId"])}', EventId) eq true`);
    }
  } else if (entity === "LS_Event") {
    if (filters["Id"]) {
      filterParts.push(`substringof('${escapeODataValue(filters["Id"])}', Id) eq true`);
    }

    if (filters["Subject"]) {
      const escapedSubject = escapeODataValue(filters["Subject"]);
      filterParts.push(`substringof('${escapedSubject}', Subject) eq true`);
    }

    if (filters["StartDate"]) {
      const startDate = parseDate(filters["StartDate"]);
      if (!startDate) {
        alert("Invalid date format for StartDate. Please use YYYY-MM-DD format.");
        return;
      }

      const formattedDate = formatDateForOData(startDate);
      const nextDay = new Date(startDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const formattedNextDay = formatDateForOData(nextDay);

      filterParts.push(`(StartDate ge datetime'${formattedDate}T00:00:00' and StartDate lt datetime'${formattedNextDay}T00:00:00')`);
    }

    if (filters["EndDate"]) {
      const endDate = parseDate(filters["EndDate"]);
      if (!endDate) {
        alert("Invalid date format for EndDate. Please use YYYY-MM-DD format.");
        return;
      }

      const formattedDate = formatDateForOData(endDate);
      const nextDay = new Date(endDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const formattedNextDay = formatDateForOData(nextDay);
      
      filterParts.push(`(EndDate ge datetime'${formattedDate}T00:00:00' and EndDate lt datetime'${formattedNextDay}T00:00:00')`);
    }
  }

  let endpoint = `${entity}?$format=json`;
  
  if (filterParts.length > 0) {
    const filterQuery = filterParts.join(" and ");
    endpoint += `&$filter=${encodeURIComponent(filterQuery)}`;
  }
  
  
  try {
    const data = await fetchData(endpoint);

    if (data && data.length > 0) {
      displayData(data);
    } else {
      displayData([]);
      const noDataMessage = document.getElementById("noDataMessage");
      noDataMessage.textContent = "No data found with the provided filters.";
    }
  } catch (error) {
    console.error("Error applying filters:", error);
    console.error("Error details:", error.message);
    alert("An error occurred while fetching data. Please try again later.");
  }
}


// Populate API selector with available entities
async function populateApiSelector() {
  try {
    const response = await apiService.request('GET', '?$format=json');
    

    if (response && response.d && response.d.EntitySets) {
      const entities = response.d.EntitySets;
      const selector = document.getElementById('apiSelector');
      const desiredEntities = ['LS_Country', 'LS_User', 'LS_Event'];
      const filteredEntities = entities.filter(entity => desiredEntities.includes(entity));

      selector.innerHTML = '<option value="">Select an entity</option>';

      filteredEntities.forEach(entity => {
        const option = document.createElement('option');
        option.value = entity;
        option.textContent = entity;
        selector.appendChild(option);
      });

      selector.addEventListener('change', updateData);

      // Check if there's a previously selected entity in localStorage
      const lastSelectedEntity = localStorage.getItem('selectedEntity');
      if (lastSelectedEntity && filteredEntities.includes(lastSelectedEntity)) {
        selector.value = lastSelectedEntity;
      } 
      else if(filteredEntities.includes(DEFAULT_ENTITY)){
        selector.value = DEFAULT_ENTITY;
      }
      else if (filteredEntities.length > 0) {
        selector.value = filteredEntities[0]; 
      }
      
      updateData();
    } else {
      console.error('Unable to retrieve entity list from the API.');
      apiService.showError('Unable to load the list of entities.');
    }
  } catch (error) {
    console.error('Error retrieving entity list:', error);
    apiService.showError('Error loading the list of entities.');
  }
}

// Update data based on selected entity
async function updateData() {
  const selector = document.getElementById('apiSelector');
  const selectedEntity = selector.value;
  
  // When changing entities, clear selection and update button state
  if (currentEntity !== selectedEntity) {
    selectedEventId = null;
    sessionStorage.removeItem('selectedEventId');
    updateButtonState(false);
  }
  
  currentEntity = selectedEntity;
  
  // Save the selected entity to localStorage
  if (selectedEntity) {
    localStorage.setItem('selectedEntity', selectedEntity);
  }

  const filterInputs = document.getElementById('filterInputs');
  filterInputs.innerHTML = '';
  filterInputs.style.display = 'none';

  clearTable();

  const noDataMessage = document.getElementById('noDataMessage');
  noDataMessage.textContent = '';



  const isActivatingEntity = currentEntity === ACTIVATING_ENTITY;
  const hasSelection = selectedEventId !== null;
  updateButtonState(isActivatingEntity && hasSelection);

  if (selectedEntity) {
    if (selectedEntity === 'LS_User' || selectedEntity === 'LS_Event') {
      displayFilterInputs(selectedEntity);
    }
  
    const endpoint = `${selectedEntity}?$format=json`;
    try {
      const data = await apiService.request('GET', endpoint);

      if (data && data.d && data.d.results && data.d.results.length > 0) {
        displayData(data.d.results);

        nextUrl = apiService.getNextUrl(data);

        const nextButton = document.getElementById('nextButton');
        if (nextButton) {
          nextButton.disabled = !nextUrl;
        }
      } else {
        displayData([]);
        noDataMessage.textContent = 'No data available.';
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      noDataMessage.textContent = 'Error fetching data.';
    }
  } else {
    noDataMessage.textContent = 'Please select an entity.';
  }

  initSearch();
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


// Function to fetch data for the selected entity or with a custom endpoint
async function fetchData(endpoint) {
  if (!endpoint) {
    console.error('No endpoint provided.');
    return [];
  }

  try {
    const response = await apiService.request('GET', endpoint);
    if (response && response.d && response.d.results) {
      return response.d.results;
    } else {
      console.error('No data returned by the API.');
      return [];
    }
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error;
  }
}

function getColumnWidth(header, entity) {
  if (columnConfig[entity] && columnConfig[entity][header] !== undefined) {
    return columnConfig[entity][header];
  }
  return null;
}


async function sortTable(index, th) {

  const headerText = th.childNodes[0].nodeValue.trim();
  console.log("Colonne sélectionnée pour le tri:", headerText);
  
  const previousSelectedEventId = selectedEventId;
  
  let sortAsc;
  
  if (lastSortedColumn !== headerText) {
    sortAsc = true;
    lastSortedColumn = headerText;
  } else {
    
    sortAsc = lastSortDirection === 'desc';
  }
  
  lastSortDirection = sortAsc ? 'asc' : 'desc';
  
  console.log("Direction de tri:", lastSortDirection);
  
  const allHeaders = document.querySelectorAll('thead th');
  allHeaders.forEach(header => {
    header.classList.remove('asc', 'desc', 'active');
  });

  th.classList.add(lastSortDirection, 'active');

  const sortOrder = sortAsc ? headerText : `${headerText} desc`;

  try {

    const noDataMessage = document.getElementById('noDataMessage');
    if (noDataMessage) noDataMessage.textContent = 'Chargement...';

    let endpoint = `${currentEntity}?$orderby=${sortOrder}&$format=json`;

    const response = await apiService.request('GET', endpoint);

    if (response && response.d && response.d.results) {

      displayData(response.d.results);

      nextUrl = apiService.getNextUrl(response);

      const nextButton = document.getElementById('nextButton');
      if (nextButton) {
        nextButton.disabled = !nextUrl;
      }

      if (previousSelectedEventId && currentEntity === ACTIVATING_ENTITY) {
        restoreRowSelection(previousSelectedEventId);
      } else {

        updateButtonState(false);
      }
    } else {

      displayData([]);
      if (noDataMessage) noDataMessage.textContent = 'No data available.';
      updateButtonState(false);
    }
  } catch (error) {
    console.error('Sorting error:', error);
    console.error('details:', error.message);
    alert('Error during sorting. Check the console for more details.');
  }
}

function restoreRowSelection(eventId) {
  if (!eventId) return;

  selectedEventId = eventId;

  const rows = document.querySelectorAll('tbody tr');
  let rowFound = false;

  rows.forEach(row => {
    row.classList.remove('selected');

    const firstCell = row.querySelector('td');
    if (firstCell && firstCell.textContent.trim() === eventId) {
      row.classList.add('selected');
      rowFound = true;
    }
  });
  
  updateButtonState(rowFound && currentEntity === ACTIVATING_ENTITY);
}

function displayData(data, append = false) {

  const tableHead = document.getElementById('tableHead');
  const tableBody = document.getElementById('tableBody');
  const noDataMessage = document.getElementById('noDataMessage');
  
  // Clear table content if not appending data
  if (!append) {
    tableHead.innerHTML = '';
    tableBody.innerHTML = '';
  }

  // Display message if no data is available
  if (!data || data.length === 0) {
    if (!append) {
      noDataMessage.textContent = 'No data available.';
    }
    return;
  }

  noDataMessage.textContent = '';

  // Extract column headers excluding metadata fields
  const headers = Object.keys(data[0]).filter(header => 
    header !== '__metadata' && !header.endsWith('ViewId')
  );

  // Create table header row if not appending
  if (!append) {
    const headerRow = document.createElement('tr');
    
    headers.forEach((header, index) => {
      const th = document.createElement('th');
      
      // Apply column width if configured
      const width = getColumnWidth(header, currentEntity);
      if (width) {
        th.style.width = width;
      }
      
      // Add header text
      const headerText = document.createTextNode(header);
      th.appendChild(headerText);

      // Add sorting icon
      const span = document.createElement('span');
      span.classList.add('icon-arrow');
      span.innerHTML = '&UpArrow;';
      
      // Highlight sorted column
      if (header === lastSortedColumn) {
        th.classList.add(lastSortDirection, 'active');
      }
      
      th.appendChild(span);
      
      th.style.position = 'sticky';
      th.style.top = '0';
      th.addEventListener('click', () => sortTable(index, th));
      headerRow.appendChild(th);
    });
    
    tableHead.appendChild(headerRow);
  }

  // Populate table rows with data
  data.forEach(item => {
    const row = document.createElement('tr');

    headers.forEach(header => {
      const td = document.createElement('td');
      
      // Highlight sorted column cells
      if (header === lastSortedColumn) {
        td.classList.add('active');
      }
      
      // Apply column width if configured
      const width = getColumnWidth(header, currentEntity);
      if (width) {
        td.style.width = width;
      }
      
      // Format date columns
      if (header.includes('Date') || header === 'SystemModstamp') {
        td.textContent = formatDate(item[header]);
      } else {
        td.textContent = item[header] || 'N/A';
      }
      
      row.appendChild(td);
    });

    // Add event listeners based on entity type
    if (currentEntity === ACTIVATING_ENTITY) {
      row.style.cursor = 'pointer';
      row.classList.add('event-row');
      row.addEventListener('click', (event) => {
        handleRowClick(item, event);
      });
    } else if (currentEntity === 'LS_Country' || currentEntity === 'LS_User') {
      row.style.cursor = 'default';
    }
    
    tableBody.appendChild(row);
  });
  
  // Enable/disable the next button based on availability of more data
  const nextButton = document.getElementById('nextButton');
  if (nextButton) {
    nextButton.disabled = !nextUrl;
  }
}


function handleRowClick(item, event) {
  const row = event.currentTarget;
  const tbody = document.querySelector('tbody');
  
  if (row.classList.contains('selected')) {
    row.classList.remove('selected');
    selectedEventId = null;

    sessionStorage.removeItem('selectedEventId');
    updateButtonState(false);
  } else {
    
    const previouslySelected = tbody.querySelector('tr.selected');
    if (previouslySelected) {
      previouslySelected.classList.remove('selected');
    }
    
    row.classList.add('selected');
    selectedEventId = item.Id;
    sessionStorage.setItem('selectedEventId', selectedEventId);
    
    if (currentEntity === ACTIVATING_ENTITY) {
      updateButtonState(true);
    } else {
      updateButtonState(false);
    }
  }
}

// Update the state of the action buttons
function updateButtonState(enabled) {
  const viewLeadsButton = document.getElementById('viewLeadsButton');
  const viewLeadReportsButton = document.getElementById('viewLeadReportsButton');
  
  if (viewLeadsButton && viewLeadReportsButton) {
    viewLeadsButton.disabled = !enabled;
    viewLeadReportsButton.disabled = !enabled;
  }
}

// Function to load next rows

async function loadNextRows() {
  if (!nextUrl) {
    console.error('No next URL found.');
    return;
  }

  try {
    document.getElementById('nextButton').textContent = 'Loading...';

    const data = await apiService.fetchNextRows(nextUrl);

    if (data && data.d && data.d.results && data.d.results.length > 0) {
      displayData(data.d.results, false);

      nextUrl = apiService.getNextUrl(data);

      document.getElementById('nextButton').disabled = !nextUrl;
      document.getElementById('nextButton').textContent = 'Next';
      
      if (selectedEventId && currentEntity === ACTIVATING_ENTITY) {
        restoreRowSelection(selectedEventId);
      }
    } else {
      nextUrl = '';
      document.getElementById('nextButton').disabled = true;
      document.getElementById('nextButton').textContent = 'Next';
    }
  } catch (error) {
    console.error("Error loading next rows:", error);
    document.getElementById('nextButton').textContent = 'Next';
    document.getElementById('nextButton').disabled = false;
  }
}


// Initialize the application
function init() {
  populateApiSelector();

  document.getElementById("viewLeadsButton").addEventListener("click", () => {
    if (selectedEventId) {
      sessionStorage.setItem("selectedEventId", selectedEventId);
      window.location.href = "displayLsLead.html";
    } else {
      alert("Please select an event first.");
    }
  });

  document.getElementById("viewLeadReportsButton").addEventListener("click", () => {
    if (selectedEventId) {
      sessionStorage.setItem("selectedEventId", selectedEventId);
      window.location.href = "displayLsLeadReport.html";
    } else {
      alert("Please select an event first.");
    }
  });

  const nextButton = document.getElementById('nextButton');
  if (nextButton) {
    nextButton.addEventListener('click', loadNextRows);
    nextButton.disabled = true; 
  }

}

// Initialize the application
document.addEventListener('DOMContentLoaded', init);