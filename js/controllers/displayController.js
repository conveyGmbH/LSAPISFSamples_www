import ApiService from '../services/apiService.js';
import {clearTable, formatDate, parseDate, escapeODataValue, formatDateForOData } from '../utils/helper.js';

// Retrieve server information from sessionStorage
const serverName = sessionStorage.getItem('serverName');
const apiName = sessionStorage.getItem('apiName');
const credentials = sessionStorage.getItem('credentials');

// Column width config
const columnConfig = {
  LS_Country: {
    Id: "200px",
    Name: "400px",
  },
  LS_User: {
    Username: "500px",
    FirstName: "400px",
    LastName: "400px",
    EventName: "400px",
    EventId: "500px",
    Email: "400px",
    Phone: "300px",
    MobilePhone: "300px",
    Street: "400px",
    PostalCode: "300px",
    City: "300px",
    Country: "300px",
    CountryCode: "300px",
    Role: "300px"
  },
  LS_Event: {
    EventName: "400px",
    CreatedDate: "200px",
    LastModifiedDate: "200px",
    StartDate: "300px",
    Id: "500px",
    NumberOfContacts: "200px"
  }
};

// Field mappings for display names
const fieldDisplayNames = {
  LS_Event: {
    Subject: "EventName"
  },
  LS_User: {
    Id: "Username",
    CurrentStatus: "Role"
  }
};

let lastSortedColumn = null;
let lastSortDirection = 'asc';


const ACTIVATING_ENTITY = 'LS_Event';
const DEFAULT_ENTITY = 'LS_Event'; 

if (!serverName || !apiName || !credentials) {
  window.location.href = '/index.html';
}

const apiService = new ApiService(serverName, apiName);
let selectedEventId = null;
let currentEntity = '';
let nextUrl = '';
let eventNameCache = {}; // Cache for EventId -> EventName mapping


function enhanceTableResponsiveness() {
  const tableBody = document.querySelector('.table__body');
  if (!tableBody) return;
  
  const isMobile = window.innerWidth <= 768;
  
  if (isMobile) {
    tableBody.style.overflowX = 'auto';
    tableBody.style.minHeight = '300px'; 
    const table = tableBody.querySelector('table');
    if (table) {
      table.style.minWidth = 'max-content';
    }
  } else {
    tableBody.style.minHeight = '300px';
    
    if (currentEntity !== 'LS_Country') {
      tableBody.style.overflowX = 'auto';
    } else {
      tableBody.style.overflowX = 'hidden';
    }
    
    const table = tableBody.querySelector('table');
    if (table) {
      table.style.tableLayout = 'fixed';
       table.style.width = 'max-content';
      table.style.minWidth = '100%';
    }
  }
}

function handleResponsiveLayout() {
  enhanceTableResponsiveness();

  const filterContainer = document.querySelector('.filter-container, .filter-inputs');
  if (filterContainer) {
    if (window.innerWidth <= 768) {
      filterContainer.classList.add('mobile-filters');
    } else {
      filterContainer.classList.remove('mobile-filters');
    }
  }
}

function displayFilterInputs(entity) {
  const filterInputs = document.getElementById('filterInputs');
  const toggleButton = document.getElementById('toggleFiltersButton');

  // Show toggle button for LS_User and LS_Event
  if (toggleButton) {
    toggleButton.style.display = 'flex';
  }

  filterInputs.style.display = 'none'; // Start hidden
  filterInputs.innerHTML = '';
  filterInputs.className = 'filter-container';

  let fields = [];

  if (entity === 'LS_User') {
    fields = ['Username', 'FirstName', 'LastName', 'EventId'];
  } else if (entity === 'LS_Event') {
    fields = ['Id', 'EventName', 'StartDate', 'EndDate'];
  }

  const storedFilters = JSON.parse(localStorage.getItem(`${entity}_Filters`)) || {};
  
  const hasActiveFiltersWithValues = Object.values(storedFilters).some(value => value && value.trim() !== '');

  fields.forEach(field => {
    const inputGroup = document.createElement('div');
    inputGroup.classList.add('input-group-float');
    inputGroup.id = `input-group-${field.toLowerCase()}`;

    const input = document.createElement('input');
    input.id = `filter-${field}`;
    input.classList.add('filter-input');
    input.placeholder = " "; 
    
    if (field === 'StartDate' || field === 'EndDate') {
      input.type = 'date';
    } else {
      input.type = 'text';
    }

    const label = document.createElement('label');
    label.setAttribute('for', `filter-${field}`);
    label.textContent = field;

    if (storedFilters[field]) {
      input.value = storedFilters[field];
      if (input.type === 'date') {
        inputGroup.classList.add('has-value');
      }
    }

    input.addEventListener('input', () => {
      updateResetButtonState(entity, fields);
      if (input.type === 'date') {
        if (input.value) {
          inputGroup.classList.add('has-value');
        } else {
          inputGroup.classList.remove('has-value');
        }
      }
    });

    // Add Enter key support for applying filters
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyFilters(entity, fields);
      }
    });

    inputGroup.appendChild(input);
    inputGroup.appendChild(label);
    filterInputs.appendChild(inputGroup);
  });

  const buttonGroup = document.createElement('div');
  buttonGroup.classList.add('filter-buttons');

  const applyButton = document.createElement('button');
  applyButton.textContent = 'Apply Filters';
  applyButton.classList.add('filter-button');
  applyButton.addEventListener('click', () => applyFilters(entity, fields));
  buttonGroup.appendChild(applyButton);

  const resetButton = document.createElement('button');
  resetButton.textContent = 'Reset Filters';
  resetButton.classList.add('filter-button', 'reset-button');
  resetButton.id = 'resetFiltersButton';
  resetButton.disabled = !hasActiveFiltersWithValues;
  resetButton.addEventListener('click', () => resetFilters(entity, fields));
  buttonGroup.appendChild(resetButton);

  filterInputs.appendChild(buttonGroup);
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

  // Reset toggle button state and hide filters
  const toggleButton = document.getElementById('toggleFiltersButton');
  const filterInputs = document.getElementById('filterInputs');
  if (toggleButton && filterInputs) {
    toggleButton.classList.remove('active');
    filterInputs.style.display = 'none';
  }

  updateData();
}

async function applyFilters(entity, fields) {

  const filters = {};
  let hasFilters = false;

  fields.forEach((field) => {
    const element = document.getElementById(`filter-${field}`);
    if (!element) {
      console.error(`Element filter-${field} not found`);
      return;
    }
    
    const value = element.value.trim();
    
    if (value) {
      filters[field] = value;
      hasFilters = true;
    }
  });

  console.log("Collected filters:", filters);
  localStorage.setItem(`${entity}_Filters`, JSON.stringify(filters));

  if (!hasFilters) {
    console.log("No filters applied, returning to updateData");
    return updateData();
  }

  const filterParts = [];
  
  // If the entity is LS_Event or LS_User, add the EventId filter if available
  if (entity === "LS_User" || entity === "LS_Event") {
    const eventId = sessionStorage.getItem('selectedEventId');
    if (eventId) {
      console.log("Adding EventId filter:", eventId);
      filterParts.push(`EventId eq '${escapeODataValue(eventId)}'`);
    }
  }

  if (entity === "LS_User") {
    if (filters["Username"]) {
      filterParts.push(`substringof('${escapeODataValue(filters["Username"])}', Id) eq true`);
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

    if (filters["EventName"]) {
      const escapedEventName = escapeODataValue(filters["EventName"]);
      filterParts.push(`substringof('${escapedEventName}', Subject) eq true`);
    }

    // Handling the start date
    if (filters["StartDate"]) {
      const startDate = parseDate(filters["StartDate"]);

      if (!startDate) {
        alert("Invalid date format for the start date. Use DD.MM.YYYY, YYYY-MM-DD, or DD/MM/YYYY.");
        return;
      }

      const formattedDate = formatDateForOData(startDate);

      // Find all events starting from this date (inclusive)
      filterParts.push(`StartDate ge datetime'${formattedDate}T00:00:00'`);
    }

    // Handling the end date
    if (filters["EndDate"]) {
      const endDate = parseDate(filters["EndDate"]);

      if (!endDate) {
        alert("Invalid date format for the end date. Use DD.MM.YYYY, YYYY-MM-DD, or DD/MM/YYYY.");
        return;
      }

      // Add one day to include the entire end day
      const nextDay = new Date(endDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const formattedNextDay = formatDateForOData(nextDay);

      // Find all events ending before the next day
      filterParts.push(`EndDate lt datetime'${formattedNextDay}T00:00:00'`);
    }
  }

  
  let endpoint = `${entity}?$format=json`;
  
  if (filterParts.length > 0) {
    const filterQuery = filterParts.join(" and ");
    console.log("Final filter query:", filterQuery);
    endpoint += `&$filter=${encodeURIComponent(filterQuery)}`;
  }
  
  
  try {
    let data = await fetchData(endpoint);
    console.log("Fetched data:", data ? data.length : 0, "records");

    if (data && data.length > 0) {
      // Enrich LS_User data with EventName
      if (entity === "LS_User") {
        data = enrichUserDataWithEventName(data);
      }
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

async function populateApiSelector() {
  try {
    const response = await apiService.request('GET', '?$format=json');
    

    if (response && response.d && response.d.EntitySets) {
      const entities = response.d.EntitySets;
      const selector = document.getElementById('apiSelector');
      const desiredEntities = ['LS_User', 'LS_Country', 'LS_Event'];
      const filteredEntities = entities.filter(entity => desiredEntities.includes(entity));

      selector.innerHTML = '';

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

  const toggleButton = document.getElementById('toggleFiltersButton');

  clearTable();

  const noDataMessage = document.getElementById('noDataMessage');
  noDataMessage.textContent = '';

  const isActivatingEntity = currentEntity === ACTIVATING_ENTITY;
  const hasSelection = selectedEventId !== null;
  updateButtonState(isActivatingEntity && hasSelection);


  if (selectedEntity) {
    if (selectedEntity === 'LS_User' || selectedEntity === 'LS_Event') {
      displayFilterInputs(selectedEntity);
    } else {
      // Hide toggle button for LS_Country
      if (toggleButton) {
        toggleButton.style.display = 'none';
        toggleButton.classList.remove('active');
      }
    }

    const endpoint = `${selectedEntity}?$format=json`;
    try {
      // Load event name cache for LS_User
      if (selectedEntity === 'LS_User') {
        await loadEventNameCache();
      }

      const data = await apiService.request('GET', endpoint);

      if (data && data.d && data.d.results && data.d.results.length > 0) {
        let enrichedData = data.d.results;

        // Enrich LS_User data with EventName
        if (selectedEntity === 'LS_User') {
          enrichedData = enrichUserDataWithEventName(data.d.results);
        }

        await displayData(enrichedData);

        nextUrl = apiService.getNextUrl(data);

        // Auto-load all remaining data
        if (nextUrl) {
          showLoadingIndicator();
          await autoLoadNextData();
        }
      } else {
        await displayData([]);
        noDataMessage.textContent = 'No data available.';
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      noDataMessage.textContent = 'Error fetching data.';
      hideLoadingIndicator();
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

function getDisplayName(field, entity) {
  if (fieldDisplayNames[entity] && fieldDisplayNames[entity][field]) {
    return fieldDisplayNames[entity][field];
  }
  return field;
}

function getOrderedFields(data, entity) {
  if (!data || data.length === 0) return [];

  const allFields = Object.keys(data[0]).filter(header =>
    header !== '__metadata' && !header.endsWith('ViewId')
  );

  // Define desired field order for each entity
  const fieldOrder = {
    LS_Event: ['Subject', 'CreatedDate', 'LastModifiedDate', 'StartDate', 'Id'],
    LS_User: ['Id', 'FirstName', 'LastName', 'EventName', 'EventId', 'Email', 'Phone', 'MobilePhone', 'Street', 'PostalCode', 'City', 'Country', 'CountryCode', 'CurrentStatus']
  };

  if (fieldOrder[entity]) {
    // Return fields in the specified order, including any additional fields not in the order
    const orderedFields = fieldOrder[entity].filter(field => allFields.includes(field));
    const remainingFields = allFields.filter(field => !fieldOrder[entity].includes(field));
    return [...orderedFields, ...remainingFields];
  }

  return allFields;
}

async function loadEventNameCache() {
  if (Object.keys(eventNameCache).length > 0) {
    return; // Already loaded
  }

  try {
    const endpoint = 'LS_Event?$format=json';
    let allEvents = [];
    let currentNextUrl = '';

    // Load first batch
    const data = await apiService.request('GET', endpoint);
    if (data && data.d && data.d.results) {
      allEvents = [...data.d.results];
      currentNextUrl = apiService.getNextUrl(data);

      // Load remaining batches
      while (currentNextUrl) {
        const nextData = await apiService.fetchNextRows(currentNextUrl);
        if (nextData && nextData.d && nextData.d.results && nextData.d.results.length > 0) {
          allEvents = [...allEvents, ...nextData.d.results];
          currentNextUrl = apiService.getNextUrl(nextData);
        } else {
          currentNextUrl = '';
        }
      }
    }

    // Create cache: EventId -> EventName (Subject)
    allEvents.forEach(event => {
      if (event.Id && event.Subject) {
        eventNameCache[event.Id] = event.Subject;
      }
    });

    console.log('Event name cache loaded:', Object.keys(eventNameCache).length, 'events');
  } catch (error) {
    console.error('Error loading event names:', error);
  }
}

function enrichUserDataWithEventName(data) {
  if (!data || data.length === 0) return data;

  return data.map(user => {
    if (user.EventId && eventNameCache[user.EventId]) {
      return {
        ...user,
        EventName: eventNameCache[user.EventId]
      };
    }
    return {
      ...user,
      EventName: 'N/A'
    };
  });
}


async function sortTable(index, th) {

  const headerText = th.childNodes[0].nodeValue.trim();
  console.log("Selected column for sorting:", headerText);
  
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

async function displayData(data, append = false) {

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

  const headers = getOrderedFields(data, currentEntity);

  if (!append) {
    const headerRow = document.createElement('tr');

    headers.forEach((header, index) => {
      const th = document.createElement('th');

      const displayName = getDisplayName(header, currentEntity);
      const width = getColumnWidth(displayName, currentEntity);
      if (width) {
        th.style.width = width;
      }

      const headerText = document.createTextNode(displayName);
      th.appendChild(headerText);

      const span = document.createElement('span');
      span.classList.add('icon-arrow');
      span.innerHTML = '&UpArrow;';

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

  data.forEach(item => {
    const row = document.createElement('tr');

    headers.forEach(header => {
      const td = document.createElement('td');

      const displayName = getDisplayName(header, currentEntity);

      if (displayName === lastSortedColumn || header === lastSortedColumn) {
        td.classList.add('active');
      }

      const width = getColumnWidth(displayName, currentEntity);
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

  // Auto-load next data if available
  if (nextUrl && append) {
    await autoLoadNextData();
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

function updateButtonState(enabled) {
  const viewLeadsButton = document.getElementById('viewLeadsButton');
  const viewLeadReportsButton = document.getElementById('viewLeadReportsButton');
  
  if (viewLeadsButton && viewLeadReportsButton) {
    viewLeadsButton.disabled = !enabled;
    viewLeadReportsButton.disabled = !enabled;
  }
}

function showLoadingIndicator() {
  const loadingIndicator = document.getElementById('loadingIndicator');
  if (loadingIndicator) {
    loadingIndicator.classList.add('show');
    loadingIndicator.style.display = 'flex';
  }
}

function hideLoadingIndicator() {
  const loadingIndicator = document.getElementById('loadingIndicator');
  if (loadingIndicator) {
    loadingIndicator.classList.remove('show');
    loadingIndicator.style.display = 'none';
  }
}

async function autoLoadNextData() {
  if (!nextUrl) {
    return;
  }

  try {
    const data = await apiService.fetchNextRows(nextUrl);

    if (data && data.d && data.d.results && data.d.results.length > 0) {
      // Append new data to existing table
      const tableBody = document.getElementById('tableBody');

      // Enrich LS_User data with EventName
      let enrichedData = data.d.results;
      if (currentEntity === 'LS_User') {
        enrichedData = enrichUserDataWithEventName(data.d.results);
      }

      const headers = getOrderedFields(enrichedData, currentEntity);

      enrichedData.forEach(item => {
        const row = document.createElement('tr');

        headers.forEach(header => {
          const td = document.createElement('td');

          const displayName = getDisplayName(header, currentEntity);

          if (displayName === lastSortedColumn || header === lastSortedColumn) {
            td.classList.add('active');
          }

          const width = getColumnWidth(displayName, currentEntity);
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

      // Update nextUrl for the next batch
      nextUrl = apiService.getNextUrl(data);

      // Continue loading if there's more data
      if (nextUrl) {
        await autoLoadNextData();
      } else {
        // Hide loading indicator when all data is loaded
        hideLoadingIndicator();
      }

      if (selectedEventId && currentEntity === ACTIVATING_ENTITY) {
        restoreRowSelection(selectedEventId);
      }
    } else {
      nextUrl = '';
      hideLoadingIndicator();
    }
  } catch (error) {
    console.error("Error auto-loading next rows:", error);
    hideLoadingIndicator();
  }
}

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

function init() {
  populateApiSelector();

  document.getElementById("viewLeadsButton").addEventListener("click", () => {
    if (selectedEventId) {
      sessionStorage.setItem("selectedEventId", selectedEventId);
      sessionStorage.setItem("selectedLeadSource", "lead");
      // Redirect directly to lead display page (modal will show if no field mapping)
      window.location.href = `displayLsLead.html`;
    } else {
      alert("Please select an event first.");
    }
  });

  document.getElementById("viewLeadReportsButton").addEventListener("click", () => {
    if (selectedEventId) {
      sessionStorage.setItem("selectedEventId", selectedEventId);
      sessionStorage.setItem("selectedLeadSource", "leadReport");
      // Redirect directly to lead report display page (modal will show if no field mapping)
      window.location.href = `displayLsLeadReport.html`;
    } else {
      alert("Please select an event first.");
    }
  });

  const nextButton = document.getElementById('nextButton');
  if (nextButton) {
    nextButton.addEventListener('click', loadNextRows);
    nextButton.disabled = true;
  }

  // Toggle filters button handler
  const toggleFiltersButton = document.getElementById('toggleFiltersButton');
  if (toggleFiltersButton) {
    toggleFiltersButton.addEventListener('click', () => {
      const filterInputs = document.getElementById('filterInputs');
      if (filterInputs.style.display === 'none' || filterInputs.style.display === '') {
        filterInputs.style.display = 'flex';
        toggleFiltersButton.classList.add('active');
      } else {
        filterInputs.style.display = 'none';
        toggleFiltersButton.classList.remove('active');
      }
    });
  }

}

window.addEventListener('resize', handleResponsiveLayout);

document.addEventListener('DOMContentLoaded', () => {
  handleResponsiveLayout();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        handleResponsiveLayout();
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
});


// Initialize the application
document.addEventListener('DOMContentLoaded', init);













