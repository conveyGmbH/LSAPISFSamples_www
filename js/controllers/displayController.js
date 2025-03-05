import ApiService from '../services/apiService.js';
import {clearTable, formatDate, parseDate, escapeODataValue, formatDateForOData } from '../utils/helper.js';

// Retrieve server information from sessionStorage
const serverName = sessionStorage.getItem('serverName');
const apiName = sessionStorage.getItem('apiName');
const credentials = sessionStorage.getItem('credentials');

// Column config
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
  
  // Le bouton est désactivé par défaut sauf s'il y a des filtres actifs avec des valeurs
  resetButton.disabled = !hasActiveFiltersWithValues;
  
  resetButton.addEventListener('click', () => resetFilters(entity, fields));
  filterInputs.appendChild(resetButton);
  
  // Vérifier immédiatement l'état des champs pour s'assurer que le bouton Reset est correctement désactivé
  updateResetButtonState(entity, fields);
}

function updateResetButtonState(entity, fields) {
  const resetButton = document.getElementById('resetFiltersButton');
  if (!resetButton) return;
  
  // Vérifier si au moins un champ de filtre a une valeur non vide
  const hasValue = fields.some(field => {
    const input = document.getElementById(`filter-${field}`);
    return input && input.value && input.value.trim() !== '';
  });
  
  // Désactiver le bouton si aucun champ n'a de valeur
  resetButton.disabled = !hasValue;
  
  // Ajouter un log pour débogage (à supprimer après vérification)
  console.log('Reset button state updated:', !hasValue ? 'disabled' : 'enabled');
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
      filterParts.push(`startswith(Id,'${escapeODataValue(filters["Id"])}') eq true`);
    }

    if (filters["FirstName"]) {
      filterParts.push(`startswith(FirstName,'${escapeODataValue(filters["FirstName"])}') eq true`);
    }

    if (filters["LastName"]) {
      filterParts.push(`startswith(LastName,'${escapeODataValue(filters["LastName"])}') eq true`);
    }

    if (filters["EventId"]) {
      filterParts.push(`EventId eq '${escapeODataValue(filters["EventId"])}'`);
    }
  } else if (entity === "LS_Event") {
    if (filters["Id"]) {
      filterParts.push(`Id eq '${escapeODataValue(filters["Id"])}'`);
    }

    if (filters["Subject"]) {
      const escapedSubject = escapeODataValue(filters["Subject"]);
      filterParts.push(`startswith(Subject,'${escapedSubject}') eq true`);
    }

    // Filtres de date optionnels
    if (filters["StartDate"]) {
      const startDate = parseDate(filters["StartDate"]);
      if (!startDate) {
        alert("Invalid date format for StartDate. Please use YYYY-MM-DD format.");
        return;
      }

      filterParts.push(`StartDate eq datetime'${formatDateForOData(startDate)}T00:00:00'`);
    }

    if (filters["EndDate"]) {
      const endDate = parseDate(filters["EndDate"]);
      if (!endDate) {
        alert("Invalid date format for EndDate. Please use YYYY-MM-DD format.");
        return;
      }

      filterParts.push(`EndDate eq datetime'${formatDateForOData(endDate)}T00:00:00'`);
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
  // Get the header text
  const headerText = th.childNodes[0].nodeValue.trim();
  
  let sortAsc;
  
  // Determine the sorting order
  if (lastSortedColumn !== headerText) {
    sortAsc = true;
    lastSortedColumn = headerText;
  } else {
    sortAsc = lastSortDirection === 'desc';
  }
  
  lastSortDirection = sortAsc ? 'asc' : 'desc';
    
  // Reset sorting styles for all headers
  const allHeaders = document.querySelectorAll('thead th');
  allHeaders.forEach(header => {
    header.classList.remove('asc', 'desc', 'active');
  });
  
  // Apply sorting styles to the clicked header
  th.classList.add(lastSortDirection, 'active');
  
  const sortOrder = sortAsc ? headerText : `${headerText} desc`;
  
  try {
    // Display loading message
    const noDataMessage = document.getElementById('noDataMessage');
    if (noDataMessage) noDataMessage.textContent = 'Loading...';
    
    // Construct API endpoint for sorting
    let endpoint = `${currentEntity}?$orderby=${sortOrder}&$format=json`;
    
    console.log(`Sorting request URL: ${endpoint}`);
    
    // Fetch sorted data from the API
    const response = await apiService.request('GET', endpoint);
    
    if (response && response.d && response.d.results) {
      // Display retrieved data
      displayData(response.d.results);
      
      // Get next page URL for pagination
      nextUrl = apiService.getNextUrl(response);
      
      // Enable/disable the next button based on availability of more data
      const nextButton = document.getElementById('nextButton');
      if (nextButton) {
        nextButton.disabled = !nextUrl;
      }
    } else {
      // Display no data message if response is empty
      displayData([]);
      if (noDataMessage) noDataMessage.textContent = 'No data available.';
    }
  } catch (error) {
    // Handle errors during sorting request
    console.error('Error while sorting:', error);
    console.error('Details:', error.message);
    alert('Sorting error. Check the console for details.');
  }
}

function displayData(data, append = false) {
  // Get table elements
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

      displayData(data.d.results, true);

      nextUrl = apiService.getNextUrl(data);

      document.getElementById('nextButton').disabled = !nextUrl;
      document.getElementById('nextButton').textContent = 'Next';

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