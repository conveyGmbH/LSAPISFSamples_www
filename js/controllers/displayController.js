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
let nextUrl = null; // URL for the next set of rows
let currentData = []; // Store current data

// Function to load the list of entities into the selector
async function populateApiSelector() {
  try {
    const response = await apiService.request('GET', '?$format=json');
    console.log("response", response)
    if (response && response.d && response.d.EntitySets) {
      const entities = response.d.EntitySets;
      console.log("enties", entities)
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

  let data = [];
  try {
    let endpoint = `${entityName}?$format=json`;
    let response = await apiService.request('GET', endpoint);
    if (response && response.d && response.d.results) {
      data = response.d.results;
      nextUrl = apiService.getNextUrl(response);
      return data;
    } else {
      console.error('No data returned by the API.');
      return [];
    }
  } catch (error) {
    console.error('Error fetching data:', error);
    return [];
  }
}

// Function to fetch the next set of rows
async function fetchNextData() {
  if (!nextUrl) {
    console.error('No next URL provided.');
    return [];
  }

  try {
    const response = await apiService.fetchNextRows(nextUrl);
    if (response && response.d && response.d.results) {
      nextUrl = apiService.getNextUrl(response);
      return response.d.results;
    } else {
      console.error('No data returned by the API.');
      return [];
    }
  } catch (error) {
    console.error('Error fetching next set of data:', error);
    return [];
  }
}

// Function to format date
function formatDate(timestamp) {
  const date = new Date(parseInt(timestamp.replace(/\/Date\((\d+)\)\//, '$1')));
  return date.toLocaleDateString('fr-FR'); // Format date in DD/MM/YYYY
}


// Function to display data
function displayData(data) {
  console.log('Displaying data:', data); // Log data for debugging

  const tableHead = document.getElementById('tableHead');
  const tableBody = document.getElementById('tableBody');

  if (!tableHead || !tableBody) {
    console.error('Table elements not found in the DOM.');
    return;
  }

  if (!data || data.length === 0) {
    console.error('No data available to display.');
    tableBody.innerHTML = "<tr><td colspan='100%'>No data available</td></tr>";
    return;
  }



  // Clear previous content if it's the first set of data
  if (currentData.length) {
    const headers = Object.keys(data[0]).filter(header => header !== '__metadata' && header !== 'MitarbeiterViewId' && header !== 'LGNTINITLandViewId');
    const headerRow = document.createElement('tr');

    headers.forEach((header, index) => {
      const th = document.createElement('th');
      th.innerHTML = `${header} <span class="icon-arrow">&UpArrow;</span>`;
      th.style.position = 'sticky'; 
      th.style.top = '0';
      th.addEventListener('click', () => sortTable(index, th));
      headerRow.appendChild(th);
    });

    tableHead.innerHTML = ''; 
    tableHead.appendChild(headerRow);
  }

  // Clear table body before adding new rows
  tableBody.innerHTML = '';

  // Create table rows
  data.forEach(item => {
    const row = document.createElement('tr');

    Object.keys(item).filter(header => header !== '__metadata' && header !== 'MitarbeiterViewId' && header !== 'LGNTINITLandViewId').forEach(header => {
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

  // Update current data
  currentData = currentData.concat(data);

  // Enable/disable next button
  document.getElementById('nextButton').disabled = !nextUrl;


    // Initialize search functionality
    initSearch();
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


// Function to update data when the entity changes
async function updateData() {
  const selectedEntity = document.getElementById('apiSelector').value;
  const data = await fetchData(selectedEntity);

  if (data && data.length > 0) {
    currentData = data;
    displayData(data);
  } else {
    currentData = [];
    displayData([]);
    document.getElementById('nextButton').disabled = true;
  }
}

// Function to initialize search functionality
function initSearch() {
  const searchInput = document.getElementById('search');
  const tableRows = document.querySelectorAll('tbody tr');
  const noDataMessage = document.getElementById('noDataMessage')
  

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


// Initialize the application
function init() {
  populateApiSelector();

  // Event listeners
  document.getElementById('apiSelector').addEventListener('change', updateData);

  document.getElementById('nextButton').addEventListener('click', async () => {
    const nextData = await fetchNextData();
    if (nextData && nextData.length > 0) {
      displayData(nextData);
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
