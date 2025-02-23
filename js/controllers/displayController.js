import ApiService from '../services/apiService.js';
import { parseDate, escapeODataValue, initSearch, formatDateForOData } from '../utils/helper.js';


// Retrieve server information from sessionStorage
const serverName = sessionStorage.getItem('serverName');
const apiName = sessionStorage.getItem('apiName');
const credentials = sessionStorage.getItem('credentials');


if (!serverName || !apiName || !credentials) {
  // If information is missing, redirect to the login page
  window.location.href = '/index.html';
}

// Create an instance of ApiService
const apiService = new ApiService(serverName, apiName);

// Global variable to store selected EventId
let selectedEventId = null;

// Function to load the list of entities into the selector
async function populateApiSelector() {
  try {
    const response = await apiService.request('GET', '?$format=json');
    if (response && response.d && response.d.EntitySets) {
      const entities = response.d.EntitySets;
      const selector = document.getElementById('apiSelector');

      // List of desired entities
      const desiredEntities = ['LS_Country', 'LS_User', 'LS_Event'];

      // Filter entities
      const filteredEntities = entities.filter(entity => desiredEntities.includes(entity));

      // Clear the selector
      selector.innerHTML = '<option value="">Select an entity</option>';

      // Fill the selector with entities
      filteredEntities.forEach(entity => {
        const option = document.createElement('option');
        option.value = entity;
        option.textContent = entity;
        selector.appendChild(option);
      });

      // Set change event listener
      selector.addEventListener('change', updateData);

      // No entity selected initially
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

// Function to update data when the entity changes
async function updateData() {
  const selectedEntity = document.getElementById('apiSelector').value;

  // Clear previous filter inputs
  const filterInputs = document.getElementById('filterInputs');
  filterInputs.innerHTML = '';
  filterInputs.style.display = 'none'; // Hide the filter inputs by default

  // Clear table and messages
  clearTable();
  const noDataMessage = document.getElementById('noDataMessage');
  noDataMessage.textContent = '';

  if (selectedEntity === 'LS_User' || selectedEntity === 'LS_Event') {
    displayFilterInputs(selectedEntity);
    noDataMessage.textContent = 'Please enter the required values and click "Apply Filters".';
  } else if (selectedEntity) {
    // Remove stored filters
    localStorage.removeItem(`${selectedEntity}_Filters`);
    // Fetch and display data without filters for other entities
    const data = await fetchData(`${selectedEntity}?$format=json`);
    if (data && data.length > 0) {
      displayData(data);
    } else {
      displayData([]);
      noDataMessage.textContent = 'No data available.';
    }
  } else {
    // No entity selected
    noDataMessage.textContent = 'Please select an entity.';
  }
}

// Function to display filter inputs for LS_User and LS_Event
function displayFilterInputs(entity) {
  const filterInputs = document.getElementById('filterInputs');
  filterInputs.style.display = 'flex'; // Show the filter inputs

  let fields = [];
  if (entity === 'LS_User') {
    fields = ['Id', 'FirstName', 'LastName', 'EventId'];
  } else if (entity === 'LS_Event') {
    fields = ['Id', 'Subject', 'StartDate', 'EndDate'];
  }

  // Retrieve stored filters if any
  const storedFilters = JSON.parse(localStorage.getItem(`${entity}_Filters`)) || {};

  // Create input fields for the filters
  fields.forEach(field => {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = field;
    input.id = `filter-${field}`;
    input.classList.add('filter-input');

    // Set the input value from stored filters if available
    if (storedFilters[field]) {
      input.value = storedFilters[field];
    }

    // For date fields, set input type to date
    if (field === 'StartDate' || field === 'EndDate') {
      input.type = 'date'; // This provides a date picker in modern browsers
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



// Function to apply filters and fetch data
async function applyFilters(entity, fields) {
  const filters = {};

  fields.forEach((field) => {
    const value = document.getElementById(`filter-${field}`).value.trim();
    if (value) {
      filters[field] = value;
    }
  });

  // Vérification des champs obligatoires
  if (entity === "LS_User") {
    if (!filters["Id"] || !filters["EventId"]) {
      alert("Please enter values for Id and EventId.");
      return;
    }
    // Ajouter une validation du format de 'EventId' si nécessaire
  } else if (entity === "LS_Event") {
    if (!filters["Id"] || !filters["Subject"]) {
      alert("Please enter values for Id and Subject.");
      return;
    }
  }

  // Vérifier s'il y a au moins un filtre
  if (Object.keys(filters).length === 0) {
    alert("Please enter at least one filter.");
    return;
  }

  // Stocker les filtres dans le localStorage
  localStorage.setItem(`${entity}_Filters`, JSON.stringify(filters));

  // Construire le filtre OData avec les entrées de l'utilisateur encodées
  const filterParts = [];

  if (entity === "LS_User") {
    // Use 'startswith' for 'Id', 'FirstName', 'LastName'
    filterParts.push(`startswith(Id,'${encodeURIComponent(filters["Id"])}') eq true`);

    if (filters["FirstName"]) {
      filterParts.push(
        `startswith(FirstName,'${encodeURIComponent(filters["FirstName"])}' eq true)`
      );
    }

    if (filters["LastName"]) {
      filterParts.push(
        `startswith(LastName,'${encodeURIComponent(filters["LastName"])}' eq true)`
      );
    }

    // 'EventId' is mandatory and requires exact match
    filterParts.push(`EventId eq '${encodeURIComponent(filters["EventId"])}'`);
  } 
  
  else if (entity === "LS_Event") {
    // Use 'startswith' for 'Id' and 'Subject'
    filterParts.push(`Id eq '${escapeODataValue(filters["Id"])}'`);

    const escapedSubject = escapeODataValue(filters["Subject"]);
    filterParts.push(`startswith(Subject,'${escapedSubject}') eq true`);

    // Optional StartDate and EndDate
    if (filters["StartDate"]) {
      const startDate = parseDate(filters["StartDate"]);
      if (!startDate) {
        alert(
          "Invalid date format for StartDate. Please use YYYY-MM-DD format."
        );
        return;
      }

      // Format the date for OData query
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

  // Combine the filter parts with 'and'
  const filterQuery = filterParts.join(' and ');

  console.log('Generated filter query:', filterQuery);

  // Build the encoded URL
  const endpoint = `${entity}?$format=json&$filter=${encodeURIComponent(filterQuery)}`;
  try {
    // Fetch data with filters
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

// reset filters
function resetFilters(entity, fields) {
  // Remove filters from localStorage
  localStorage.removeItem(`${entity}_Filters`);
  // Clear input fields
  fields.forEach(field => {
    const input = document.getElementById(`filter-${field}`);
    if (input) {
      input.value = '';
    }
  });
  // Clear data display
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
    throw error; // Re-throw the error to be caught in applyFilters
  }
}

// Function to display data
function displayData(data) {
  const tableHead = document.getElementById('tableHead');
  const tableBody = document.getElementById('tableBody');
  const noDataMessage = document.getElementById('noDataMessage');

  if (!tableHead || !tableBody) {
    console.error('Table elements not found in the DOM.');
    return;
  }

  // Clear previous content
  tableHead.innerHTML = '';
  tableBody.innerHTML = '';

  if (!data || data.length === 0) {
    noDataMessage.textContent = 'No data available.';
    return;
  }

  noDataMessage.textContent = '';

  // Create table headers and exclude '__metadata' and any unwanted columns
  const headers = Object.keys(data[0]).filter(header => {
    return header !== '__metadata' && header !== 'MitarbeiterViewId';
  });

  const headerRow = document.createElement('tr');

  headers.forEach((header, index) => {
    const th = document.createElement('th');
    th.innerHTML = `${header} <span class="icon-arrow">&UpArrow;</span>`;
    th.style.position = 'sticky';
    th.style.top = '0';
    th.addEventListener('click', () => sortTable(index, th));
    headerRow.appendChild(th);
  });

  tableHead.appendChild(headerRow);

  // Clear table body before adding new rows
  tableBody.innerHTML = '';

  // Create table rows
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
  });

  // Initialize search functionality
  initSearch('search', 'tbody', 'noDataMessage');

  // Add row selection handler if needed
  addRowSelectionHandler
}


// Function to format date
function formatDate(timestamp) {
  const match = /\/Date\((\d+)\)\//.exec(timestamp);
  if (match) {
    const date = new Date(parseInt(match[1], 10));
    return date.toLocaleDateString('en-GB'); // Use desired format
  } else {
    return timestamp;
  }
}

// Function to sort table by column
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


function clearTable() {
  const tableHead = document.getElementById('tableHead');
  const tableBody = document.getElementById('tableBody');
  if (tableHead) tableHead.innerHTML = '';
  if (tableBody) tableBody.innerHTML = '';
  const noDataMessage = document.getElementById('noDataMessage');
  if (noDataMessage) noDataMessage.textContent = '';
}

function addRowSelectionHandler() {
  const tableRows = document.querySelectorAll('tbody tr');
  const viewLeadsButton = document.getElementById('viewLeadsButton');
  const viewLeadReportsButton = document.getElementById('viewLeadReportsButton');

  tableRows.forEach(row => {
    row.addEventListener('click', () => {
      // Remove 'selected' class from other rows
      tableRows.forEach(r => r.classList.remove('selected'));
      // Add 'selected' class to the clicked row
      row.classList.add('selected');

      // Get the Id from the selected row
      const headers = document.querySelectorAll('thead th');
      let idIndex = -1;

      headers.forEach((th, index) => {
        console.log(`Header ${index}: "${th.textContent.trim()}"`);
        // Adjust the condition to match your column name
        if (th.textContent.trim() === 'EventId') {
          idIndex = index;
        }
      });

      if (idIndex !== -1) {
        selectedEventId = row.querySelectorAll('td')[idIndex].textContent.trim();
        console.log('Selected EventId:', selectedEventId);
        // Enable the buttons
        viewLeadsButton.disabled = false;
        viewLeadReportsButton.disabled = false;
        console.log('Buttons enabled');
      } else {
        console.error('Id column not found in the table headers.');
      }
    });
  });
}


// Initialize the application
function init() {
  populateApiSelector();

  // Logout button
  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      apiService.logout();
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
