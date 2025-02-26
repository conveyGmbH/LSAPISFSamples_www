import ApiService from "../services/apiService.js";
import { formatDate, sortTable } from "../utils/helper.js";

const serverName = sessionStorage.getItem('serverName');
const apiName = sessionStorage.getItem('apiName');
const credentials = sessionStorage.getItem('credentials');

if (!serverName || !apiName || !credentials) {
  window.location.href = '/index.html';
}

const apiService = new ApiService(serverName, apiName);
let nextUrl = '';

/**
 * Fetch LS_LeadReport data based on the EventId in sessionStorage
 */
async function fetchLsLeadReportData() {
  const eventId = sessionStorage.getItem('selectedEventId');
  if (!eventId) {
    alert('No EventId provided.');
    window.location.href = '/pages/display.html';
    return;
  }

  const endpoint = `LS_LeadReport?$format=json&$filter=EventId eq '${encodeURIComponent(eventId)}'`;

  try {
    const data = await apiService.request('GET', endpoint);
    if (data && data.d && data.d.results) {
      displayData(data.d.results);
      
      // Setup for pagination
      nextUrl = apiService.getNextUrl(data);
      document.getElementById('nextButton').disabled = !nextUrl;
    } else {
      displayData([]);
    }
  } catch (error) {
    console.error('Error fetching LS_LeadReport data:', error);
    apiService.showError('An error occurred while fetching LS_LeadReport data.');
  }
}

/**
 * Display data in the table
 * @param {Array} data - The data to display
 * @param {boolean} append - Whether to append to existing data or replace it
 */
function displayData(data, append = false) {
  const tableHead = document.getElementById('tableHead');
  const tableBody = document.getElementById('tableBody');
  const noDataMessage = document.getElementById('noDataMessage');

  if (!append) {
    tableHead.innerHTML = '';
    tableBody.innerHTML = '';
  }

  if (!data || data.length === 0) {
    noDataMessage.textContent = 'No data available.';
    return;
  }

  noDataMessage.textContent = '';

  // Filter out metadata and unwanted columns
  const headers = Object.keys(data[0]).filter(header => 
    header !== '__metadata' && 
    header !== 'KontaktViewId' && 
    !header.endsWith(' ')
  );

  if (!append) {
    const headerRow = document.createElement('tr');
    
    headers.forEach((header, index) => {
      const th = document.createElement('th');
      
      // Create a text node for the header text
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

  // Populate table body
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

  // Initialize search functionality after populating data
  initSearch();
}

/**
 * Load next set of rows for pagination
 */
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
      document.getElementById('nextButton').disabled = true;
    }
  } catch (error) {
    console.error("Error loading next rows:", error);
    apiService.showError("Failed to load additional data.");
  }
}

/**
 * Initialize the application
 */
function init() {
  fetchLsLeadReportData();

  // Setup back button
  const backButton = document.getElementById('backButton');
  if (backButton) {
    backButton.addEventListener('click', () => {
      window.location.href = 'display.html';
    });
  }

  // Setup pagination button
  const nextButton = document.getElementById('nextButton');
  if (nextButton) {
    nextButton.addEventListener('click', loadNextRows);
  }
}

/**
 * Initialize search functionality
 */
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

    // Update row colors for better visibility
    document.querySelectorAll('tbody tr:not(.hide)').forEach((visibleRow, i) => {
      visibleRow.style.backgroundColor = (i % 2 === 0) ? 'transparent' : 'rgba(0, 0, 0, 0.03)';
    });

    if (!found) {
      noDataMessage.textContent = 'No results found.';
    } else {
      noDataMessage.textContent = '';
    }
  });
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', init);