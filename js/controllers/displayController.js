import ApiService from '../services/apiService.js';

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

  // Get values from input fields
  fields.forEach(field => {
    const value = document.getElementById(`filter-${field}`).value.trim();
    if (value) {
      filters[field] = value;
    }
  });

  if (Object.keys(filters).length === 0) {
    alert('Please enter at least one filter.');
    return;
  }

  // Store the filters in localStorage
  localStorage.setItem(`${entity}_Filters`, JSON.stringify(filters));

  // Build the OData filter query
  const filterStrings = Object.entries(filters).map(([key, value]) => {
    if (key.includes('Date')) {
      // For date fields, format the date appropriately
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        const isoDate = date.toISOString();
        return `${key} eq datetime'${isoDate}'`;
      } else {
        alert(`Invalid date format for ${key}. Please use YYYY-MM-DD format.`);
        return '';
      }
    } else {
      return `${key} eq '${value}'`;
    }
  }).filter(str => str !== '');

  if (filterStrings.length === 0) {
    alert('Please enter valid filter values.');
    return;
  }

  const filterQuery = `&$filter=${filterStrings.join(' and ')}`;

  const endpoint = `${entity}?$format=json${filterQuery}`;

  // Fetch data with filters
  const data = await fetchData(endpoint);

  if (data && data.length > 0) {
    displayData(data);
  } else {
    displayData([]);
    const noDataMessage = document.getElementById('noDataMessage');
    noDataMessage.textContent = 'No data found with the provided filters.';
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
    return [];
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
  initSearch();
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
  }).map(sortedRow => document.querySelector('tbody').appendChild(sortedRow));

  th.classList.toggle('asc', sortAsc);
  th.classList.toggle('desc', !sortAsc);
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

// Function to clear table and messages
function clearTable() {
  const tableHead = document.getElementById('tableHead');
  const tableBody = document.getElementById('tableBody');
  if (tableHead) tableHead.innerHTML = '';
  if (tableBody) tableBody.innerHTML = '';
  const noDataMessage = document.getElementById('noDataMessage');
  if (noDataMessage) noDataMessage.textContent = '';
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
