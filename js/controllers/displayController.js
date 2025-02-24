import ApiService from '../services/apiService.js';
import {formatDate, parseDate, escapeODataValue, initSearch, formatDateForOData } from '../utils/helper.js';


// Retrieve server information from sessionStorage
const serverName = sessionStorage.getItem('serverName');
const apiName = sessionStorage.getItem('apiName');
const credentials = sessionStorage.getItem('credentials');


if (!serverName || !apiName || !credentials) {
  // If information is missing, redirect to the login page
  window.location.href = '/index.html';
}

const apiService = new ApiService(serverName, apiName);
let selectedEventId = null;
let nextUrl = '';


async function populateApiSelector() {
  try {
    const response = await apiService.request('GET', '?$format=json');
    if (response && response.d && response.d.EntitySets) {
      const entities = response.d.EntitySets;
      const selector = document.getElementById('apiSelector');

      // List of desired entities
      const desiredEntities = ['LS_Country', 'LS_User', 'LS_Event'];

      const filteredEntities = entities.filter(entity => desiredEntities.includes(entity));

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

async function updateData() {
  
  const selectedEntity = document.getElementById('apiSelector').value;

  const filterInputs = document.getElementById('filterInputs');
  filterInputs.innerHTML = '';
  filterInputs.style.display = 'none'; 

  clearTable();

  const noDataMessage = document.getElementById('noDataMessage');
  noDataMessage.textContent = '';

  if (selectedEntity === 'LS_User' || selectedEntity === 'LS_Event') {
    displayFilterInputs(selectedEntity);
    noDataMessage.textContent = 'Please enter the required values and click "Apply Filters".';
  } else if (selectedEntity) {

    localStorage.removeItem(`${selectedEntity}_Filters`);

    const data = await fetchData(`${selectedEntity}?$format=json`);
    if (data && data.length > 0) {
      displayData(data);
    } else {
      displayData([]);
      noDataMessage.textContent = 'No data available.';
    }
  } else {
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

  const storedFilters = JSON.parse(localStorage.getItem(`${entity}_Filters`)) || {};

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

    if (filters["LastName"]) {filterParts.push(`startswith(LastName,'${encodeURIComponent(filters["LastName"])}' eq true)` );
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

// reset filters
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
    console.log("Response:", response);
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

function displayData(data, append = false) {
  const tableHead = document.getElementById('tableHead');
  const tableBody = document.getElementById('tableBody');
  const noDataMessage = document.getElementById('noDataMessage');


  if(!append) {
    // Clear previous content
    tableHead.innerHTML = '';
    tableBody.innerHTML = '';
  }

  if (!data || data.length === 0) {
    noDataMessage.textContent = 'No data available.';
    return;
  }

  noDataMessage.textContent = '';

  if (!tableHead || !tableBody) {
    console.error('Table elements not found in the DOM.');
    return;
  }

  if(!append){
  

  const headers = Object.keys(data[0]).filter(header => {
    return header !== '__metadata' && header !== 'MitarbeiterViewId' && header !== 'LGNTINITLandViewId' && header !== 'VeranstaltungViewId' && header !== 'KontaktViewId';
  });

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

  tableBody.innerHTML = '';

  // Create table rows
  data.forEach(item => {
    const row = document.createElement('tr');
    const headers = Object.keys(item).filter(header => header !== '__metadata' && header !== 'MitarbeiterViewId' && header !== 'LGNTINITLandViewId' && header !== 'VeranstaltungViewId' && header !== 'KontaktViewId');
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


  initSearch('search', 'tbody', 'noDataMessage');

  addRowSelectionHandler();


  nextUrl = apiService.getNextUrl(data);
  console.log("Next URL:", nextUrl);
  const nextButton = document.getElementById('nextButton');
  nextButton.disabled = !nextUrl;
}


function addRowSelectionHandler() {
  const tableRows = document.querySelectorAll('tbody tr');
  const viewLeadsButton = document.getElementById('viewLeadsButton');

viewLeadsButton.addEventListener('click', () => {
  if (selectedEventId) {
   
    sessionStorage.setItem('selectedEventId', selectedEventId);
    window.location.href = 'displayLsLead.html';
  } else {
    alert('Please select an event first.');
  }
});




  const viewLeadReportsButton = document.getElementById('viewLeadReportsButton');

  tableRows.forEach(row => {
    row.addEventListener('click', () => {
      tableRows.forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');

      // Get the Id from the selected row
      const headers = document.querySelectorAll('thead th');
      let idIndex = -1;

      headers.forEach((th, index) => {
        const headerText = th.childNodes[0].textContent.trim();
        if (headerText === 'Id' || headerText === 'EventId') {
          idIndex = index;
        }
      });

      if (idIndex !== -1) {
        selectedEventId = row.querySelectorAll('td')[idIndex].textContent.trim();
        viewLeadsButton.disabled = false;
        viewLeadReportsButton.disabled = false;
        console.log('Buttons enabled');
      } else {
        console.error('Id column not found in the table headers.');
      }
    });
  });
}





// Fonction pour charger les lignes suivantes lors du clic sur le bouton "Next"
async function loadNextRows() {
  if (!nextUrl) {
    console.error('No next URL found.');
    return;
  };

  const data = await apiService.fetchNextRows(nextUrl);
  console.log("fetchNextRows:", data);

  if (data && data.d && data.d.results) {
    displayData(data.d.results, true);
  } else {
    alert('No more data to load.');
  }
}


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


  // Charger les données de `LS_Country` par défaut
  fetchData('LS_Country?$format=json').then(data => {
    if (data && data.d && data.d.results) {
      displayData(data.d.results);
    }
  }
  );
  

  // Logout button
  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      apiService.logout();
    });
  }




  const paginationDiv = document.querySelector('.pagination');
  let nextButton = document.getElementById('nextButton');
  if (!nextButton) {
    nextButton = document.createElement('button');
    nextButton.id = 'nextButton';
    nextButton.textContent = 'Next';
    nextButton.classList.add('pagination-button');
    nextButton.disabled = true;  
    nextButton.addEventListener('click', loadNextRows);
    paginationDiv.appendChild(nextButton);
  }

}



function restoreSelectedRow() {
  const tbody = document.querySelector('tbody');
  const selectedEventId = sessionStorage.getItem('selectedEventId');
  if (!selectedEventId) return;

  const rows = tbody.querySelectorAll('tr');
  rows.forEach(row => {
    const eventIdCell = row.cells[eventIdIndex];
    if (eventIdCell && eventIdCell.textContent.trim() === selectedEventId) {
      row.classList.add('selected');
    }
  });

  const isSelected = tbody.querySelector('tr.selected') !== null;
  document.getElementById('viewLeadsButton').disabled = !isSelected;
  document.getElementById('viewLeadReportsButton').disabled = !isSelected;
}


document.addEventListener('DOMContentLoaded', init);

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  populateApiSelector();

  const logoutButton = document.getElementById('logoutButton');
  logoutButton.addEventListener('click', () => {
    sessionStorage.clear();
    window.location.href = 'index.html';
  });

  const viewLeadsButton = document.getElementById('viewLeadsButton');
  const viewLeadReportsButton = document.getElementById('viewLeadReportsButton');
  viewLeadsButton.disabled = true;
  viewLeadReportsButton.disabled = true;
});