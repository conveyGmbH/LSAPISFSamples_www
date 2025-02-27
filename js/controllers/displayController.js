import ApiService from '../services/apiService.js';
import {clearTable, formatDate, parseDate, escapeODataValue, initSearch, formatDateForOData } from '../utils/helper.js';

// Retrieve server information from sessionStorage
const serverName = sessionStorage.getItem('serverName');
const apiName = sessionStorage.getItem('apiName');
const credentials = sessionStorage.getItem('credentials');

const ACTIVATING_ENTITY = 'LS_Event';
const SELECTABLE_ENTITIES = ['LS_User', 'LS_Event'];

if (!serverName || !apiName || !credentials) {
  window.location.href = '/index.html';
}

const apiService = new ApiService(serverName, apiName);
let selectedEventId = null;
let currentEntity = '';
let nextUrl = '';

// Handle filter inputs display based on entity
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

  fields.forEach(field => {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = field;
    input.id = `filter-${field}`;
    input.classList.add('filter-input');

    if (storedFilters[field]) {
      input.value = storedFilters[field];
    }

    if (field === 'StartDate' || field === 'EndDate') {
      input.type = 'date'; 
    }

    filterInputs.appendChild(input);
  });

  // Create a button to apply filters
  const applyButton = document.createElement('button');
  applyButton.textContent = 'Apply Filters';
  applyButton.classList.add('apply-button');
  applyButton.addEventListener('click', () => applyFilters(entity, fields));
  filterInputs.appendChild(applyButton);

  // Create a button to reset filters
  const resetButton = document.createElement('button');
  resetButton.textContent = 'Reset Filters';
  resetButton.classList.add('reset-button');
  resetButton.addEventListener('click', () => resetFilters(entity, fields));
  filterInputs.appendChild(resetButton);
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
      } else if (filteredEntities.length > 0) {
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
// Dans displayController.js
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

  // Update button state based on whether entity supports selection
  const isActivatingEntity = currentEntity === ACTIVATING_ENTITY;
  const hasSelection = selectedEventId !== null;
  updateButtonState(isActivatingEntity && hasSelection);

  if (selectedEntity) {
    // Display filters only for entities that should have them
    if (selectedEntity === 'LS_User' || selectedEntity === 'LS_Event') {
      displayFilterInputs(selectedEntity);
    }
  
    const endpoint = `${selectedEntity}?$format=json`;
    try {
      const data = await apiService.request('GET', endpoint);
      
      if (data && data.d && data.d.results && data.d.results.length > 0) {
        displayData(data.d.results);
        
        // Stocker l'URL de la page suivante
        nextUrl = apiService.getNextUrl(data);
        
        // Activer/désactiver le bouton Next
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
}

// Function to apply filters and fetch data
async function applyFilters(entity, fields) {
  const filters = {};

  fields.forEach((field) => {
    const value = document.getElementById(`filter-${field}`).value.trim();
    if (value) {
      filters[field] = value;
    }
  });

  if (entity === "LS_User") {
    if (!filters["Id"] || !filters["EventId"]) {
      alert("Please enter values for Id and EventId.");
      return;
    }
  } else if (entity === "LS_Event") {
    if (!filters["Id"] || !filters["Subject"]) {
      alert("Please enter values for Id and Subject.");
      return;
    }
  }

  if (Object.keys(filters).length === 0) {
    alert("Please enter at least one filter.");
    return;
  }

  localStorage.setItem(`${entity}_Filters`, JSON.stringify(filters));

  const filterParts = [];

  if (entity === "LS_User") {
    filterParts.push(`startswith(Id,'${encodeURIComponent(filters["Id"])}') eq true`);

    if (filters["FirstName"]) {
      filterParts.push(`startswith(FirstName,'${encodeURIComponent(filters["FirstName"])}' eq true)`);
    }

    if (filters["LastName"]) {
      filterParts.push(`startswith(LastName,'${encodeURIComponent(filters["LastName"])}' eq true)`);
    }

    filterParts.push(`EventId eq '${encodeURIComponent(filters["EventId"])}'`);
  } else if (entity === "LS_Event") {
    filterParts.push(`Id eq '${escapeODataValue(filters["Id"])}'`);

    const escapedSubject = escapeODataValue(filters["Subject"]);
    filterParts.push(`startswith(Subject,'${escapedSubject}') eq true`);

    // Optional StartDate and EndDate
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

      // Format the date for OData query
      filterParts.push(`EndDate eq datetime'${formatDateForOData(endDate)}T00:00:00'`);
    }
  }

  if (filterParts.length === 0) {
    alert("Please enter valid filter values.");
    return;
  }

  const filterQuery = filterParts.join(" and ");

  const endpoint = `${entity}?$format=json&$filter=${encodeURIComponent(filterQuery)}`;
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

// Reset filters
function resetFilters(entity, fields) {
  localStorage.removeItem(`${entity}_Filters`);
  fields.forEach(field => {
    const input = document.getElementById(`filter-${field}`);
    if (input) { 
      input.value = '';
    }
  });
  clearTable();
  const noDataMessage = document.getElementById('noDataMessage');
  noDataMessage.textContent = 'Filters have been reset. Please enter new values and click "Apply Filters".';
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


// Sort Colunm
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


// Display data in the table
function displayData(data, append = false) {
  const tableHead = document.getElementById('tableHead');
  const tableBody = document.getElementById('tableBody');
  const noDataMessage = document.getElementById('noDataMessage');

  // Ne pas effacer l'en-tête ou le corps du tableau si on ajoute des données
  if (!append) {
    tableHead.innerHTML = '';
    tableBody.innerHTML = '';
  }

  if (!data || data.length === 0) {
    if (!append) {
      noDataMessage.textContent = 'No data available.';
    }
    return;
  }

  noDataMessage.textContent = '';

  // Filtrer les en-têtes indésirables
  const headers = Object.keys(data[0]).filter(header => 
    header !== '__metadata' && !header.endsWith('ViewId')
  );

  // Créer l'en-tête seulement si on ne fait pas d'ajout
  if (!append) {
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
  }

  // Ajouter les nouvelles lignes
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
    
    // Ajouter les gestionnaires d'événements pour la sélection des lignes
    row.addEventListener('click', (event) => {
      handleRowClick(item, event);
    });
    
    tableBody.appendChild(row);
  });
  
  // Activer le bouton Next si une URL de page suivante est disponible
  const nextButton = document.getElementById('nextButton');
  if (nextButton) {
    nextButton.disabled = !nextUrl;
  }
}

function handleRowClick(row, item) {
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
    // Afficher un indicateur de chargement si vous le souhaitez
    document.getElementById('nextButton').textContent = 'Loading...';
    
    const data = await apiService.fetchNextRows(nextUrl);

    if (data && data.d && data.d.results && data.d.results.length > 0) {
      // Ajouter les nouvelles lignes au tableau existant
      displayData(data.d.results, true);
      
      // Mettre à jour nextUrl pour la prochaine page
      nextUrl = apiService.getNextUrl(data);
      
      // Activer/désactiver le bouton "Next" en fonction de la disponibilité de données
      document.getElementById('nextButton').disabled = !nextUrl;
      document.getElementById('nextButton').textContent = 'Next';
    } else {
      alert('No more data to load.');
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