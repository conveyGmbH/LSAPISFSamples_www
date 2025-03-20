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
    Id: "500px",
    FirstName: "400px",
    LastName: "400px",
    Email: "400px",
    Phone: "300px",
    MobilePhone: "300px",
    Street: "400px",
    PostalCode: "300px",
    City: "300px",
    Country: "300px",
    CountryCode: "300px",
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



function enhanceHeaderLayout() {
  const tableHeader = document.querySelector('.table__header');
  if (!tableHeader) return;
  
  // S'assurer que les boutons d'action ont la bonne structure
  const actions = tableHeader.querySelector('.actions');
  if (actions) {
    // Ajouter une classe pour la mise en page mobile
    actions.classList.add('action-buttons-container');
    
    // S'assurer que tous les boutons ont les bonnes classes et styles
    const buttons = actions.querySelectorAll('button');
    buttons.forEach(button => {
      button.classList.add('action-button');
      // Uniformiser la hauteur des boutons
      button.style.height = '44px';
    });
  }
  
  // Améliorer la structure du sélecteur d'entités
  const viewSelector = tableHeader.querySelector('.view-selector');
  if (viewSelector) {
    const select = viewSelector.querySelector('select');
    if (select) {
      // Uniformiser la hauteur du sélecteur
      select.style.height = '44px';
    }
  }
}

 function enhanceTableResponsiveness() {
  const tableBody = document.querySelector('.table__body');
  if (!tableBody) return;
  
  // Vérifier si l'écran est en mode mobile
  const isMobile = window.innerWidth <= 768;
  
  if (isMobile) {
    // Permettre le défilement horizontal sur mobile
    tableBody.style.overflowX = 'auto';
    
    // S'assurer que la table a une largeur minimum convenable
    const table = tableBody.querySelector('table');
    if (table) {
      table.style.minWidth = 'max-content';
    }
  } else {
    // Sur desktop, laisser la table s'adapter normalement
    tableBody.style.overflowX = '';
    
    const table = tableBody.querySelector('table');
    if (table) {
      table.style.minWidth = '100%';
    }
  }
}

  function handleResponsiveLayout() {
    enhanceHeaderLayout();
    enhanceTableResponsiveness();
    
    // Adapter les conteneurs de filtres
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
  filterInputs.style.display = 'flex';
  filterInputs.innerHTML = '';
  filterInputs.className = 'filter-container';
  
  let fields = [];

  if (entity === 'LS_User') {
    fields = ['Id', 'FirstName', 'LastName', 'EventId'];
  } else if (entity === 'LS_Event') {
    fields = ['Id', 'Subject', 'StartDate', 'EndDate'];
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
    input.placeholder = " "; // Espace requis pour le sélecteur CSS
    
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
      // Ajouter ou supprimer la classe has-value pour les dates
      if (input.type === 'date') {
        if (input.value) {
          inputGroup.classList.add('has-value');
        } else {
          inputGroup.classList.remove('has-value');
        }
      }
    });
    
    // Ajouter les éléments au DOM dans le bon ordre (input d'abord, puis label)
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
      
      // Find all events ending before the next day (thus including the entire specified day)
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
    const data = await fetchData(endpoint);
    console.log("Fetched data:", data ? data.length : 0, "records");

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

  // Écouter les changements de taille d'écran
  window.addEventListener('resize', handleResponsiveLayout);
  
  // Exécuter au chargement de la page
  document.addEventListener('DOMContentLoaded', () => {
    handleResponsiveLayout();
    
    // Observer les mutations du DOM pour appliquer les améliorations 
    // lorsque new éléments sont ajoutés (comme les filtres)
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













