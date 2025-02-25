import ApiService from '../services/apiService.js';
import {clearTable, formatDate, parseDate, escapeODataValue, initSearch, formatDateForOData } from '../utils/helper.js';


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

      if (filteredEntities.length > 0) {
        selector.value = filteredEntities[0]; 
        updateData(); 
      }
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


  if (selectedEntity) {
    // Afficher les filtres uniquement si l'utilisateur veut les utiliser
    if (selectedEntity === 'LS_User' || selectedEntity === 'LS_Event') {
      displayFilterInputs(selectedEntity);
    }
  
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


  const isRelevantHeader = header => !['__metadata', 'MitarbeiterViewId', 'LGNTINITLandViewId', 'VeranstaltungViewId', 'KontaktViewId'].includes(header);


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

  const headers = Object.keys(data[0]).filter(isRelevantHeader);
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
    const headers = Object.keys(item).filter(isRelevantHeader);
    headers.forEach(header => {
      const td = document.createElement('td');
      td.textContent = header.includes('Date') ? formatDate(item[header]) : item[header] || 'N/A';
      row.appendChild(td);
  });

    tableBody.appendChild(row);
  });

  initSearch('search', 'tbody', 'noDataMessage');

  addRowSelectionHandler();

  nextUrl = apiService.getNextUrl(data);
  document.getElementById('nextButton').disabled = !nextUrl;
}


function addRowSelectionHandler() {
  const tbody = document.querySelector('tbody');
  const viewLeadsButton = document.getElementById('viewLeadsButton');
  const viewLeadReportsButton = document.getElementById('viewLeadReportsButton');


  const headers = Array.from(document.querySelectorAll('thead th'));
  const eventIdIndex = headers.findIndex(th => {
    const headerText = th.childNodes[0].textContent.trim();
    return headerText === 'Id' || headerText === 'EventId';
  }); 


  headers.forEach((th, index) => {
    const headerText = th.textContent.trim();
    if (headerText === 'Id' || headerText === 'EventId') {
      eventIdIndex = index;
    }
  });

  tbody.addEventListener('click', (event) => {
    const row = event.target.closest('tr');
    if (!row) return;

    if (row.classList.contains('selected')) {
        selectedEventId = row.cells[eventIdIndex].textContent.trim();
        console.log("selectedEventId : ->", selectedEventId);
        sessionStorage.setItem('selectedEventId', selectedEventId);
        row.classList.remove('selected');
        sessionStorage.removeItem('selectedEventId');
    } else {
      const previouslySelected = tbody.querySelector('tr.selected');
      if (previouslySelected) {
        previouslySelected.classList.remove('selected');
      }

      row.classList.add('selected');
      sessionStorage.setItem('selectedEventId', selectedEventId);
    }

    const isSelected = tbody.querySelector('tr.selected') !== null;
    viewLeadsButton.disabled = !isSelected;
    viewLeadReportsButton.disabled = !isSelected;
  });
}



// Function to sort the table by column index
async function loadNextRows() {
  if (!nextUrl) {
      console.error('No next URL found.');
      return;
  }

  try {
      const data = await apiService.fetchNextRows(nextUrl);

      if (data && data.d && data.d.results.length > 0) {
          displayData(data.d.results, true);
          nextUrl = apiService.getNextUrl(data); 
          document.getElementById('nextButton').disabled = !nextUrl;
      } else {
          alert('No more data to load.');
          nextUrl = ''; 
      }
  } catch (error) {
      console.error("Erreur lors du chargement des lignes suivantes:", error);
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

// Initialize the application
function init() {
  populateApiSelector();

  fetchData("LS_Country?$format=json").then((data) => {
    if (data && data.d && data.d.results) {
      displayData(data.d.results);
    }
  });

  // Logout button
  const logoutButton = document.getElementById("logoutButton");
  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      apiService.logout();
    });
  }

  // Setup event listeners for buttons
  document.getElementById("viewLeadsButton").addEventListener("click", () => {
    if (selectedEventId) {
      sessionStorage.setItem("selectedEventId", selectedEventId);
      window.location.href = "displayLsLead.html";
    } else {
      alert("Please select an event first.");
    }
  });

  document
    .getElementById("viewLeadReportsButton")
    .addEventListener("click", () => {
      if (selectedEventId) {
        sessionStorage.setItem("selectedEventId", selectedEventId);
        window.location.href = "displayLsLeadReport.html";
      } else {
        alert("Please select an event first.");
      }
    });

  const paginationDiv = document.querySelector(".pagination");
  let nextButton = document.getElementById("nextButton");
  if (!nextButton) {
    nextButton = document.createElement("button");
    nextButton.id = "nextButton";
    nextButton.textContent = "Next";
    nextButton.classList.add("pagination-button");
    nextButton.disabled = true;
    nextButton.addEventListener("click", loadNextRows);
    paginationDiv.appendChild(nextButton);
  }

  // Restore selected row when navigating back
  restoreSelectedRow();
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

});