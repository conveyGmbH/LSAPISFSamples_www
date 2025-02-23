// helpers.js

// Function to format date
export function formatDate(input) {
    let date;
    if (typeof input === 'string' && input.includes('/Date(')) {
      const match = /\/Date\((\d+)\)\//.exec(input);
      if (match) {
        date = new Date(parseInt(match[1], 10));
      }
    } else {
      date = new Date(input);
    }
  
    if (!isNaN(date)) {
      return date.toLocaleDateString('en-GB');
    } else {
      return input;
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