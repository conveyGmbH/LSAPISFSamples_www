// helpers.js


export function formatDate(dateString) {
  if (!dateString) return 'N/A';
  
  // for the "/Date(timestamp)/"
  if (typeof dateString === 'string' && dateString.includes('/Date(')) {
    const timestamp = dateString.match(/\/Date\((\d+)\)\//);
    if (timestamp && timestamp[1]) {
      const date = new Date(parseInt(timestamp[1]));
      return date.toISOString().split('T')[0]; // Format YYYY-MM-DD
    }
  }
  
  // for standard date
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toISOString().split('T')[0]; 
  } catch (e) {
    return dateString;
  }
}
  
  // Function to sort table by column
  export function sortTable(index, th) {
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
  
  // Function to clear table and messages
  export function clearTable() {
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    if (tableHead) tableHead.innerHTML = '';
    if (tableBody) tableBody.innerHTML = '';
    const noDataMessage = document.getElementById('noDataMessage');
    if (noDataMessage) noDataMessage.textContent = '';
    const searchInput = document.getElementById('search');
    if (searchInput) searchInput.value = '';
  }
  

// Function to parse date input from user
export function parseDate(input) {
  // Expecting input in 'YYYY-MM-DD' format
  const date = new Date(input);
  if (!isNaN(date.getTime())) {
    return date;
  }
  return null;
}

// Function to format date for OData query
export function formatDateForOData(date) {

  if (!(date instanceof Date) || isNaN(date)) {
    console.error("Invalid date:", date);
    return null;
  }

  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Function to parse date input from user
export function escapeODataValue(value) {
  return value.replace(/'/g, "''");
}
  
// Function to reset filters
export function resetFilters(entity, fields) {
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

// Function setupPagination
export function setupPagination(apiService, displayDataFunction) {
  let nextUrl = '';
  
  // function to update the next URL
  function updateNextUrl(data) {
    nextUrl = apiService.getNextUrl(data);
    const nextButton = document.getElementById('nextButton');
    if (nextButton) {
      nextButton.disabled = !nextUrl;
    }
    return nextUrl;
  }
  
  // function to load the next rows
  async function loadNextRows() {
    if (!nextUrl) {
      console.error('No next URL found.');
      return;
    }

    const nextButton = document.getElementById('nextButton');
    if (nextButton) {
      nextButton.textContent = 'Loading...';
      nextButton.disabled = true;
    }

    try {
      const data = await apiService.fetchNextRows(nextUrl);

      if (data && data.d && data.d.results && data.d.results.length > 0) {

        // Display the data
        displayDataFunction(data.d.results, true);

        // Update the next URL
        updateNextUrl(data);
      } else {

        nextUrl = '';
        if (nextButton) {
          nextButton.disabled = true;
        }
      }
    } catch (error) {
      console.error("Error loading next rows:", error);
    } finally {
      if (nextButton) {
        nextButton.textContent = 'Next';
        nextButton.disabled = !nextUrl;
      }
    }
  }
  
  // function to initialize button pagination
  function initPagination() {
    const nextButton = document.getElementById('nextButton');
    if (nextButton) {
      nextButton.addEventListener('click', loadNextRows);
      nextButton.disabled = true; 
    }
  }
  
  return {
    updateNextUrl,
    loadNextRows,
    initPagination
  };
}



// Function to initialize search functionality
export function initSearch(searchInputId, tableBodySelector = 'tbody', noDataMessageId) {
  const searchInput = document.getElementById(searchInputId);
  const tableRows = document.querySelectorAll(`${tableBodySelector} tr`);
  const noDataMessage = document.getElementById(noDataMessageId);

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

    document.querySelectorAll(`${tableBodySelector} tr:not(.hide)`).forEach((visibleRow, i) => {
      visibleRow.style.backgroundColor = (i % 2 === 0) ? 'transparent' : '#0000000b';
    });

    if (!found) {
      noDataMessage.textContent = 'No results found.';
    } else {
      noDataMessage.textContent = '';
    }
  });
}