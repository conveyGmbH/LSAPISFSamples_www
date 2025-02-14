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

// Pagination variables
let currentPage = 1;
let totalPages = 1;
let currentData = [];
const perPage = 20; // Number of items per page

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
      selector.innerHTML = '';

      // Fill the selector with entities
      filteredEntities.forEach(entity => {
        const option = document.createElement('option');
        option.value = entity;
        option.textContent = entity;
        selector.appendChild(option);
      });

      // Load data for the first entity
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

// Function to fetch data for the selected entity
async function fetchData(entityName) {
  if (!entityName) {
    console.error('No entity name provided.');
    return [];
  }

  try {
    const endpoint = `${entityName}?$format=json`;
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

// Function to display paginated data
function displayData(pageData) {
  const tableHead = document.getElementById('tableHead');
  const tableBody = document.getElementById('tableBody');

  if (!tableHead || !tableBody) {
    console.error('Table elements not found in the DOM.');
    return;
  }

  // Clear previous content
  tableHead.innerHTML = '';
  tableBody.innerHTML = '';

  if (pageData && pageData.length > 0) {
    // Create table headers and exclude '__metadata'
    const headers = Object.keys(pageData[0]).filter(header => header !== '__metadata');
    const headerRow = document.createElement('tr');

    headers.forEach(header => {
      const th = document.createElement('th');
      th.textContent = header;
      headerRow.appendChild(th);
    });

    tableHead.appendChild(headerRow);

    // Create table rows
    pageData.forEach(item => {
      const row = document.createElement('tr');

      headers.forEach(header => {
        const td = document.createElement('td');
        td.textContent = item[header] || 'N/A';
        row.appendChild(td);
      });

      tableBody.appendChild(row);
    });
  } else {
    // Display a message if no data
    tableBody.innerHTML = "<tr><td colspan='100%'>No data available</td></tr>";
  }
}

// Function to handle pagination
function handlePagination() {
  const startIndex = (currentPage - 1) * perPage;
  const endIndex = currentPage * perPage;

  const pageData = currentData.slice(startIndex, endIndex);
  displayData(pageData);

  // Update pagination info
  document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;

  // Enable or disable pagination buttons
  document.getElementById('prevButton').disabled = currentPage === 1;
  document.getElementById('nextButton').disabled = currentPage === totalPages;
}

// Function to update data when the entity changes
async function updateData() {
  const selectedEntity = document.getElementById('apiSelector').value;
  const data = await fetchData(selectedEntity);

  if (data && data.length > 0) {
    currentData = data;
    totalPages = Math.ceil(currentData.length / perPage);
    currentPage = 1;
    handlePagination();
  } else {
    currentData = [];
    totalPages = 1;
    currentPage = 1;
    displayData([]);
    document.getElementById('pageInfo').textContent = 'Page 1 of 1';
    document.getElementById('prevButton').disabled = true;
    document.getElementById('nextButton').disabled = true;
  }
}

// Initialization function
function init() {
  populateApiSelector();

  // Event listeners
  document.getElementById('apiSelector').addEventListener('change', updateData);

  document.getElementById('prevButton').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      handlePagination();
    }
  });

  document.getElementById('nextButton').addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      handlePagination();
    }
  });

  // Logout button
  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      apiService.logout();
    });
  }
}

// Execute initialization on DOM content loaded
document.addEventListener('DOMContentLoaded', init);
