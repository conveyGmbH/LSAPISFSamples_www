import ApiService from '../services/apiService.js';
import {escapeODataValue, formatDateForOData, formatDate, setupPagination } from '../utils/helper.js';

const columnConfig = {
  LS_Lead: {
    "Id": "500px",
    "CreatedDate": "200px",
    "LastModifiedDate": "200px",
    "CreatedById": "400px",
    "LastModifiedById": "400px",
    "Salutation": "400px",
    "Suffix": "200px",
    "FirstName": "400px",
    "MiddleName": "400px",
    "LastName": "400px",
    "Company": "500px",
    "Title": "400px",
    "Phone": "400px",
    "MobilePhone": "400px",
    "Fax": "400px",
    "Email": "400px",
    "Website": "500px",
    "Street": "400px",
    "PostalCode": "400px",
    "City": "300px",
    "Country": "300px",
    "CountryCode": "200px",
    "State": "300px",
    "Description": "500px",
    "AttachmentIdList": "800px",
    "SalesArea": "400px",
    "RequestBarcode": "500px",
    "StatusMessage": "500px",
    "DeviceId": "200px",
    "DeviceRecordId": "200px",
    "SystemModstamp": "200px",
    "EventId": "500px",
    "IsReviewed": "400px",
    "Department": "400px",
    "Industry": "200px"
  }
};


const serverName = sessionStorage.getItem('serverName');
const apiName = sessionStorage.getItem('apiName');
const credentials = sessionStorage.getItem('credentials');

if (!serverName || !apiName || !credentials) {
  window.location.href = '/index.html';
}

const apiService = new ApiService(serverName, apiName);

const pagination = setupPagination(apiService, displayData);

let lastSortedColumn = null;
let lastSortDirection = 'asc';
let selectedRowItem = null;

// Function to fetch LS_Lead data
async function fetchLsLeadData() {
  const eventId = sessionStorage.getItem('selectedEventId');
  if (!eventId) {
    alert('No EventId provided.');
    window.location.href = '/display.html';
    return;
  }

  const endpoint = `LS_Lead?$format=json&$filter=EventId eq '${encodeURIComponent(eventId)}'`;

  try {
    const data = await apiService.request('GET', endpoint);
    if (data && data.d && data.d.results) {
      console.log(`[DEBUG] Nombre de lignes chargées: ${data.d.results.length}`);
      console.log(`[DEBUG] URL pagination: ${data.d.__next ? "Disponible" : "Non disponible"}`);

      displayData(data.d.results);

      pagination.updateNextUrl(data);
    } else {
      displayData([]);
    }
  } catch (error) {
    console.error('Error fetching LS_Lead data:', error);
    alert('An error occurred while fetching LS_Lead data.');
  }

  initSearch();
}


// Fonction pour améliorer l'affichage responsive de la table
function enhanceTableDisplay() {
  const tableBody = document.querySelector('.table__body');
  if (!tableBody) return;
  
  // Set a minimum height for the table body
  tableBody.style.minHeight = '200px';
  
  const table = tableBody.querySelector('table');
  if (!table) return;
  
  const isMobile = window.innerWidth <= 768;
  
  if (isMobile) {
    // On mobile, ensure horizontal scrolling works properly
    table.style.width = 'max-content';
    table.style.minWidth = 'max-content';
    tableBody.style.overflowX = 'auto';
    tableBody.style.maxWidth = '100%';
    
    // Adjust cell sizes for better mobile viewing
    const allCells = table.querySelectorAll('th, td');
    allCells.forEach(cell => {
      // Limit maximum width for better readability
      cell.style.maxWidth = '250px';
      cell.style.padding = '8px 10px';
    });
    
    // Make sure the table wrapper doesn't overflow the viewport
    tableBody.style.width = 'calc(100% - 16px)';
    tableBody.style.margin = '8px';
  } else {
    // Desktop view
    table.style.width = '100%';
    table.style.minWidth = '100%';
    tableBody.style.overflowX = '';
    
    // Reset cell sizes
    const allCells = table.querySelectorAll('th, td');
    allCells.forEach(cell => {
      cell.style.maxWidth = '';
      cell.style.padding = '';
    });
    
    // Apply configured column widths
    applyColumnWidths();
  }
}

 // Fix for applyColumnWidths function: add missing currentEntity declaration
 function applyColumnWidths() {
  const tableHead = document.querySelector('thead');
  const tableBody = document.querySelector('tbody');
  if (!tableHead || !tableBody) return;
  
  // Add fallback for currentEntity since it's not defined
  const currentEntity = 'LS_Lead'; // Default to LS_Lead
  
  const config = columnConfig[currentEntity] || {};
  
  const headers = tableHead.querySelectorAll('th');
  
  headers.forEach((header, index) => {
    const headerText = header.textContent.trim().replace(/[↑↓]/g, '');
    const width = config[headerText];
    
    if (width) {
      // Apply width to header
      header.style.width = width;
      
      // Apply same width to all cells in this column
      const cells = tableBody.querySelectorAll(`tr td:nth-child(${index + 1})`);
      cells.forEach(cell => {
        cell.style.width = width;
      });
    }
  });
}

 // Improved responsive layout function
 function handleResponsiveLayout() {
  const isMobile = window.innerWidth <= 768;
  
  // Fix body overflow on mobile to allow scrolling
  if (isMobile) {
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
    
    // Fix main container height
    const mainTable = document.querySelector('main.table');
    if (mainTable) {
      mainTable.style.maxHeight = 'none';
      mainTable.style.overflow = 'visible';
    }
  } else {
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100vh';
    
    // Reset main container
    const mainTable = document.querySelector('main.table');
    if (mainTable) {
      mainTable.style.maxHeight = 'calc(100vh - 150px)';
      mainTable.style.overflow = 'hidden';
    }
  }
  
  // Handle table header responsive layout
  const tableHeader = document.querySelector('.table__header');
  if (tableHeader) {
    if (isMobile) {
      tableHeader.classList.add('mobile-header');
      
      // Make action buttons responsive
      const actions = tableHeader.querySelector('.actions');
      if (actions) {
        actions.style.width = '100%';
        actions.style.flexDirection = 'row';
        actions.style.flexWrap = 'wrap';
        actions.style.gap = '8px';
        
        const buttons = actions.querySelectorAll('button');
        buttons.forEach(button => {
          button.style.flex = '1';
          button.style.minWidth = '120px';
          button.style.margin = '0';
        });
      }
    } else {
      tableHeader.classList.remove('mobile-header');
      
      // Reset desktop styles
      const actions = tableHeader.querySelector('.actions');
      if (actions) {
        actions.style.width = '';
        actions.style.flexDirection = '';
        actions.style.flexWrap = '';
        actions.style.gap = '10px';
        
        const buttons = actions.querySelectorAll('button');
        buttons.forEach(button => {
          button.style.flex = '';
          button.style.minWidth = '';
          button.style.margin = '0';
        });
      }
    }
  }
  
  // Handle filter container responsive layout
  const filterContainer = document.querySelector('.filter-container, .filter-inputs');
  if (filterContainer) {
    if (isMobile) {
      filterContainer.classList.add('mobile-filters');
      filterContainer.style.flexDirection = 'column';
      filterContainer.style.width = 'calc(100% - 16px)';
      filterContainer.style.margin = '8px';
      
      // Make all input groups full width
      const inputGroups = filterContainer.querySelectorAll('.input-group-float');
      inputGroups.forEach(group => {
        group.style.width = '100%';
        group.style.minWidth = '100%';
        
        // Ensure date inputs are full width
        const dateInput = group.querySelector('input[type="date"]');
        if (dateInput) {
          dateInput.style.width = '100%';
        }
      });
      
      // Handle filter buttons on mobile
      const filterButtons = filterContainer.querySelector('.filter-buttons');
      if (filterButtons) {
        filterButtons.style.width = '100%';
        filterButtons.style.marginLeft = '0';
        filterButtons.style.marginTop = '12px';
      }
    } else {
      filterContainer.classList.remove('mobile-filters');
      filterContainer.style.flexDirection = 'row';
      filterContainer.style.width = 'calc(100% - 24px)';
      filterContainer.style.margin = '12px';
      
      // Reset input groups
      const inputGroups = filterContainer.querySelectorAll('.input-group-float');
      inputGroups.forEach(group => {
        group.style.width = '';
        group.style.minWidth = '300px';
        
        // Reset date inputs
        const dateInput = group.querySelector('input[type="date"]');
        if (dateInput) {
          dateInput.style.width = '';
        }
      });
      
      // Reset filter buttons
      const filterButtons = filterContainer.querySelector('.filter-buttons');
      if (filterButtons) {
        filterButtons.style.width = '';
        filterButtons.style.marginLeft = 'auto';
        filterButtons.style.marginTop = '';
      }
    }
  }
  
  // Improve table display
  enhanceTableDisplay();
}


 // Fix for the buttonGroup reference error in addTransferButton
 function addTransferButton() {
  // Check if the button already exists to avoid duplicates
  if (document.getElementById('transferButton')) return;
  
  // Create the button
  const transferButton = document.createElement('button');
  transferButton.id = 'transferButton';
  transferButton.className = 'action-button';
  transferButton.disabled = true;
  transferButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 5v14M19 12l-7 7-7-7"/>
    </svg>
    <span>Transfer to Salesforce</span>
  `;
  
  // Add click event
  transferButton.addEventListener('click', () => {
    if (selectedRowItem) {
      sessionStorage.setItem('selectedLeadData', JSON.stringify(selectedRowItem));
      sessionStorage.setItem('selectedLeadSource', 'Lead');
      window.location.href = 'displayLeadTransfer.html';
    } else {
      alert('Please select a lead to transfer.');
    }
  });
  
  // Insert the button into the DOM
  const showAttachmentButton = document.getElementById('showAttachmentButton');
  const actionsContainer = showAttachmentButton?.parentNode;
  
  if (actionsContainer) {
    actionsContainer.insertBefore(transferButton, showAttachmentButton.nextSibling);
  }
}


document.addEventListener('DOMContentLoaded', () => {
  
  addTransferButton();
  
});
// Function to get the configured width of a column
function getColumnWidth(header, entity) {

  // Check if there is a configuration for this entity and column
  if (columnConfig[entity] && columnConfig[entity][header] !== undefined) {
    return columnConfig[entity][header];
  }

  return null;
}

// Function to sort the table using OData
async function sortTable(index, th) {

  const headerText = th.childNodes[0].nodeValue.trim();
  
  const previouslySelectedRow = document.querySelector('tr.selected');
  let previousItem = null;
  
  if (previouslySelectedRow) {
    previousItem = getItemFromRow(previouslySelectedRow);
  }
  
  let sortAsc;
  
  if (lastSortedColumn !== headerText) {
    sortAsc = true;
    lastSortedColumn = headerText;
  } else {
    sortAsc = lastSortDirection === 'desc';
  }
  
  lastSortDirection = sortAsc ? 'asc' : 'desc';

  const allHeaders = document.querySelectorAll('thead th');
  allHeaders.forEach(header => {
    header.classList.remove('asc', 'desc', 'active');
  });
  
  th.classList.add(lastSortDirection, 'active');
  
  const sortOrder = sortAsc ? headerText : `${headerText} desc`;
  
  const eventId = sessionStorage.getItem('selectedEventId');
  if (!eventId) {
    alert('No EventId provided.');
    return;
  }
  
  try {
    const noDataMessage = document.getElementById('noDataMessage');
    if (noDataMessage) noDataMessage.textContent = 'Chargement...';

    const filterParts = [];
    filterParts.push(`EventId eq '${escapeODataValue(eventId)}'`);
    
    const storedFilters = JSON.parse(localStorage.getItem('LS_Lead_Filters')) || {};
    Object.entries(storedFilters).forEach(([field, value]) => {
      if (value && value.trim()) {
        if (field.includes('Date') || field.includes('SystemModstamp')) {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            const formattedDate = formatDateForOData(date);

            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);
            const formattedNextDay = formatDateForOData(nextDay);

            filterParts.push(`(${field} ge datetime'${formattedDate}T00:00:00' and ${field} lt datetime'${formattedNextDay}T00:00:00')`);
          }
        }
      }
    });

    const filterQuery = filterParts.join(' and ');

    let endpoint = `LS_Lead?$orderby=${sortOrder}&$format=json&$filter=${encodeURIComponent(filterQuery)}`;

    const data = await apiService.request('GET', endpoint);

    if (data && data.d && data.d.results) {
      displayData(data.d.results);

      pagination.updateNextUrl(data);

      if (previousItem) {
        restoreRowSelection(previousItem);
      }
    } else {
      displayData([]);
      if (noDataMessage) noDataMessage.textContent = 'No data available.';
    }
  } catch (error) {
    console.error('Sorting error:', error);
    alert('Error during sorting. Check the console for more details.');
  }
}

function displayData(data) {
  const tableHead = document.getElementById('tableHead');
  const tableBody = document.getElementById('tableBody');
  const noDataMessage = document.getElementById('noDataMessage');

  tableHead.innerHTML = '';
  tableBody.innerHTML = '';

  if (!data || data.length === 0) {
    noDataMessage.textContent = 'No data available.';
    return;
  }

  noDataMessage.textContent = '';

  const headers = Object.keys(data[0]).filter(header => 
    header !== '__metadata' && header !== 'KontaktViewId'
  );

  const headerRow = document.createElement('tr');
  
  headers.forEach((header, index) => {
    const th = document.createElement('th');

    const width = getColumnWidth(header, 'LS_Lead');
    if (width) {
      th.style.width = width;
    }

    const headerText = document.createTextNode(header);
    th.appendChild(headerText);

    const span = document.createElement('span');
    span.classList.add('icon-arrow');

    if (header === lastSortedColumn) {
      th.classList.add(lastSortDirection, 'active');
      span.innerHTML = lastSortDirection === 'asc' ? '&uarr;' : '&darr;';
    } else {
      span.innerHTML = '&UpArrow;';
    }
    
    th.appendChild(span);
    th.style.position = 'sticky';
    th.style.top = '0';
    th.addEventListener('click', () => sortTable(index, th));
    headerRow.appendChild(th);
  });

  tableHead.appendChild(headerRow);

  data.forEach(item => {
    const row = document.createElement('tr');

    headers.forEach(header => {
      const td = document.createElement('td');

      const width = getColumnWidth(header, 'LS_Lead');
      if (width) {
        td.style.width = width;
      }

      if (header === lastSortedColumn) {
        td.classList.add('active');
      }

      if (header.includes('Date') || header === 'SystemModstamp') {
        td.textContent = formatDate(item[header]);
      } else {
        td.textContent = item[header] || 'N/A';
      }
      row.appendChild(td);
    });
    
    tableBody.appendChild(row);
  });
  
  initializeRowToggle();
}

function getItemFromRow(row) {
  const cells = Array.from(row.cells);
  
  const item = {};
  const headers = Array.from(document.querySelectorAll('thead th')).map(th => 
    th.textContent.trim().replace(/[↑↓]/g, '')
  );
  
  cells.forEach((cell, index) => {
    if (headers[index]) {
      item[headers[index]] = cell.textContent.trim();
    }
  });
  
  return item;
}

// function restoreRowSelection(previousItem) {
//   if (!previousItem || !previousItem.Id) return;
  
//   const rows = document.querySelectorAll('tbody tr');
//   let matchFound = false;
  
//   rows.forEach(row => {
//     const rowItem = getItemFromRow(row);
//     if (rowItem.Id === previousItem.Id) {
//       row.click(); 
//       matchFound = true;
//     }
//   });
  
//   if (!matchFound) {
//     const showAttachmentButton = document.getElementById('showAttachmentButton');
//     if (showAttachmentButton) {
//       showAttachmentButton.disabled = true;
//       showAttachmentButton.textContent = 'Show Attachment';
//       sessionStorage.removeItem('AttachmentIdList');
//     }

//       // Insérer le bouton dans le DOM
//     if (showAttachmentButton && showAttachmentButton.parentNode) {
//       showAttachmentButton.parentNode.insertBefore(transferButton, showAttachmentButton.nextSibling);
//     } else {
//       // Sinon, l'ajouter à la fin du groupe de boutons
//       buttonGroup.appendChild(transferButton);
//     }
//   }
// }

// Fixed version of restoreRowSelection to avoid reference error
function restoreRowSelection(previousItem) {
  if (!previousItem || !previousItem.Id) return;
  
  const rows = document.querySelectorAll('tbody tr');
  let matchFound = false;
  
  rows.forEach(row => {
    const rowItem = getItemFromRow(row);
    if (rowItem.Id === previousItem.Id) {
      row.click(); 
      matchFound = true;
    }
  });
  
  if (!matchFound) {
    const showAttachmentButton = document.getElementById('showAttachmentButton');
    if (showAttachmentButton) {
      showAttachmentButton.disabled = true;
      showAttachmentButton.textContent = 'Show Attachment';
      sessionStorage.removeItem('AttachmentIdList');
    }

    // Fix for transferButton reference
    const transferButton = document.getElementById('transferButton');
    if (transferButton) {
      transferButton.disabled = true;
    }
  }
}


function handleRowSelection(item, event) {
  if (!event) {
    console.error('Event is missing in handleRowSelection');
    return;
  }

  const row = event.currentTarget;
  const showAttachmentButton = document.getElementById('showAttachmentButton');
  const previouslySelected = document.querySelector('tr.selected');

  if (previouslySelected === row) {
    row.classList.remove('selected');
    showAttachmentButton.disabled = true;
    showAttachmentButton.textContent = 'Show Attachment';
    sessionStorage.removeItem('AttachmentIdList');
    selectedRowItem = null;
    return; 
  }
  
  if (previouslySelected) {
    previouslySelected.classList.remove('selected');
  }
  
  row.classList.add('selected');
  selectedRowItem = item;
  
  if (item.AttachmentIdList) {
    const validAttachments = item.AttachmentIdList.split(',').filter(id => id.trim() !== '');
    
    if (validAttachments.length > 0) {
      showAttachmentButton.disabled = false;
      showAttachmentButton.textContent = `Show Attachment (${validAttachments.length})`;
      sessionStorage.setItem('AttachmentIdList', validAttachments.join(','));
    } else {
      showAttachmentButton.disabled = true;
      showAttachmentButton.textContent = 'No Valid Attachments';
      sessionStorage.removeItem('AttachmentIdList');
    }
  } else {
    showAttachmentButton.disabled = true;
    showAttachmentButton.textContent = 'Show Attachment';
    sessionStorage.removeItem('AttachmentIdList');
  }

  // display button
  const transferButton = document.getElementById('transferButton');
  if (transferButton) {
    transferButton.disabled = !selectedRowItem;
  }
}

function initializeRowToggle() {
  const tableRows = document.querySelectorAll('tbody tr');
  const showAttachmentButton = document.getElementById('showAttachmentButton');
  
  if (showAttachmentButton) {
    showAttachmentButton.disabled = true;
  }
  
  tableRows.forEach(row => {
    row.removeEventListener('click', handleRowClickWrapper);
    
    row.addEventListener('click', handleRowClickWrapper);
  });
}

function handleRowClickWrapper(event) {
  const row = event.currentTarget;
  const cells = Array.from(row.cells);
  
  const item = {};
  const headers = Array.from(document.querySelectorAll('thead th')).map(th => 
    th.textContent.trim().replace(/[↑↓]/g, '')
  );
  
  cells.forEach((cell, index) => {
    if (headers[index]) {
      item[headers[index]] = cell.textContent.trim();
    }
  });
  
  const attachmentColumn = headers.findIndex(h => h === 'AttachmentIdList');
  if (attachmentColumn >= 0) {
    item.AttachmentIdList = cells[attachmentColumn].textContent.trim();
  }
  
  handleRowSelection(item, event);
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

// function displayLeadFilters() {
//   const filterInputs = document.getElementById('filterInputs');
//   if (!filterInputs) return;
  
//   filterInputs.innerHTML = ''; 
//   filterInputs.classList.add('filter-container');
  
//   const textFields = ['Id', 'CreateById', 'LastModifiedById','FirstName', 'LastName', 'Company', 'Email'];
//   const dateFields = ['CreatedDate', 'LastModifiedDate', 'SystemModstamp'];
  
//   const storedFilters = JSON.parse(localStorage.getItem('LS_Lead_Filters')) || {};
  
//   textFields.forEach(field => {
//     const input = document.createElement('input');
//     input.type = 'text';
//     input.placeholder = field;
//     input.id = `filter-${field}`;
//     input.classList.add('filter-input');
//     input.classList.add(`filter-${field.toLowerCase()}`);
    
//     if (storedFilters[field]) {
//       input.value = storedFilters[field];
//     }
    
//     input.addEventListener('input', updateResetButtonState);
//     filterInputs.appendChild(input);
//   });
  
//   dateFields.forEach(field => {
//     const dateWrapper = document.createElement('div');
//     dateWrapper.classList.add('date-wrapper');
//     dateWrapper.classList.add(`date-wrapper-${field.toLowerCase()}`); 
    
//     const input = document.createElement('input');
//     input.type = 'date';
//     input.id = `filter-${field}`;
//     input.classList.add('filter-input', 'filter-date');
    
//     if (storedFilters[field]) {
//       input.value = storedFilters[field];
//     }
    
//     input.addEventListener('input', updateResetButtonState);
    
//     const label = document.createElement('span');
//     label.textContent = field;
//     label.classList.add('date-label');
    
//     dateWrapper.appendChild(input);
//     dateWrapper.appendChild(label);
//     filterInputs.appendChild(dateWrapper);
//   });
  
//   const buttonWrapper = document.createElement('div');
//   buttonWrapper.classList.add('filter-buttons');
  
//   const applyButton = document.createElement('button');
//   applyButton.textContent = 'Apply Filters';
//   applyButton.classList.add('filter-button', 'apply-filter');
//   applyButton.addEventListener('click', () => applyLeadFilters([...textFields, ...dateFields]));
//   buttonWrapper.appendChild(applyButton);
  
//   const resetButton = document.createElement('button');
//   resetButton.textContent = 'Reset Filters';
//   resetButton.id = 'resetFiltersButton';
//   resetButton.classList.add('filter-button', 'reset-filter');
  
//   const hasActiveFilters = Object.values(storedFilters).some(value => value && value.trim() !== '');
//   resetButton.disabled = !hasActiveFilters;
  
//   resetButton.addEventListener('click', () => resetLeadFilters([...textFields, ...dateFields]));
//   buttonWrapper.appendChild(resetButton);
  
//   filterInputs.appendChild(buttonWrapper);
// }

// Fonction pour afficher les filtres LS_Lead avec labels flottants
// function displayLeadFilters() {
//   const filterInputs = document.getElementById('filterInputs');
//   if (!filterInputs) return;
  
//   filterInputs.innerHTML = ''; 
//   filterInputs.className = 'filter-container';
  
//   const textFields = ['Id', 'FirstName', 'LastName', 'Company', 'Email'];
//   const dateFields = ['CreatedDate', 'LastModifiedDate', 'SystemModstamp'];
  
//   const storedFilters = JSON.parse(localStorage.getItem('LS_Lead_Filters')) || {};
  
//   // Création des champs texte avec labels flottants
//   textFields.forEach(field => {
//     const inputGroup = document.createElement('div');
//     inputGroup.classList.add('input-group-float');
    
//     const input = document.createElement('input');
//     input.type = 'text';
//     input.id = `filter-${field}`;
//     input.classList.add('filter-input');
    
//     // Ajouter le label flottant
//     const label = document.createElement('label');
//     label.setAttribute('for', `filter-${field}`);
//     label.textContent = field;
    
//     // Restaurer les valeurs stockées
//     if (storedFilters[field]) {
//       input.value = storedFilters[field];
//     }
    
//     input.addEventListener('input', updateResetButtonState);
    
//     inputGroup.appendChild(input);
//     inputGroup.appendChild(label);
//     filterInputs.appendChild(inputGroup);
//   });
  
//   // Création des champs de date avec labels flottants
//   dateFields.forEach(field => {
//     const inputGroup = document.createElement('div');
//     inputGroup.classList.add('input-group-float');
    
//     const input = document.createElement('input');
//     input.type = 'date';
//     input.id = `filter-${field}`;
//     input.classList.add('filter-input');
    
//     // Ajouter le label flottant
//     const label = document.createElement('label');
//     label.setAttribute('for', `filter-${field}`);
//     label.textContent = field;
    
//     // Restaurer les valeurs stockées
//     if (storedFilters[field]) {
//       input.value = storedFilters[field];
//     }
    
//     input.addEventListener('input', updateResetButtonState);
    
//     inputGroup.appendChild(input);
//     inputGroup.appendChild(label);
//     filterInputs.appendChild(inputGroup);
//   });
  
//   // Ajouter le groupe de boutons
//   const buttonGroup = document.createElement('div');
//   buttonGroup.classList.add('filter-buttons');
  
//   const applyButton = document.createElement('button');
//   applyButton.textContent = 'Apply Filters';
//   applyButton.classList.add('filter-button');
//   applyButton.addEventListener('click', () => applyLeadFilters([...textFields, ...dateFields]));
//   buttonGroup.appendChild(applyButton);
  
//   const resetButton = document.createElement('button');
//   resetButton.textContent = 'Reset Filters';
//   resetButton.id = 'resetFiltersButton';
//   resetButton.classList.add('filter-button', 'reset-button');
  
//   const hasActiveFilters = Object.values(storedFilters).some(value => value && value.trim() !== '');
//   resetButton.disabled = !hasActiveFilters;
  
//   resetButton.addEventListener('click', () => resetLeadFilters([...textFields, ...dateFields]));
//   buttonGroup.appendChild(resetButton);
  
//   filterInputs.appendChild(buttonGroup);
// }


// Updated function for displaying LS_Lead filters with floating labels
// function displayLeadFilters() {
//   const filterInputs = document.getElementById('filterInputs');
//   if (!filterInputs) return;
  
//   filterInputs.innerHTML = ''; 
//   filterInputs.className = 'filter-container';
  
//   const textFields = ['Id', 'FirstName', 'LastName', 'Company', 'Email'];
//   const dateFields = ['CreatedDate', 'LastModifiedDate', 'SystemModstamp'];
  
//   const storedFilters = JSON.parse(localStorage.getItem('LS_Lead_Filters')) || {};
  
//   // Create text fields with floating labels
//   textFields.forEach(field => {
//     const inputGroup = document.createElement('div');
//     inputGroup.classList.add('input-group-float');
    
//     // Create input element first (order is important for floating labels)
//     const input = document.createElement('input');
//     input.type = 'text';
//     input.id = `filter-${field}`;
//     input.classList.add('filter-input');
//     input.placeholder = " "; // Empty space placeholder is required for the CSS selector to work
    
//     // Create label element
//     const label = document.createElement('label');
//     label.setAttribute('for', `filter-${field}`);
//     label.textContent = field;
    
//     // Restore stored values if they exist
//     if (storedFilters[field]) {
//       input.value = storedFilters[field];
//     }
    
//     input.addEventListener('input', updateResetButtonState);
    
//     // Add elements to the DOM in correct order (input first, then label)
//     inputGroup.appendChild(input);
//     inputGroup.appendChild(label);
//     filterInputs.appendChild(inputGroup);
//   });
  
//   // Create date fields with floating labels
//   dateFields.forEach(field => {
//     const inputGroup = document.createElement('div');
//     inputGroup.classList.add('input-group-float');
    
//     // Create date input first
//     const input = document.createElement('input');
//     input.type = 'date';
//     input.id = `filter-${field}`;
//     input.classList.add('filter-input');
//     input.placeholder = " "; // Empty space placeholder
    
//     // Create label
//     const label = document.createElement('label');
//     label.setAttribute('for', `filter-${field}`);
//     label.textContent = field;
    
//     // Restore stored values
//     if (storedFilters[field]) {
//       input.value = storedFilters[field];
//       // This class helps with styling when a date is already selected
//       inputGroup.classList.add('has-value');
//     }
    
//     input.addEventListener('input', () => {
//       updateResetButtonState();
//       // Add or remove has-value class when date is selected or cleared
//       if (input.value) {
//         inputGroup.classList.add('has-value');
//       } else {
//         inputGroup.classList.remove('has-value');
//       }
//     });
    
//     // Add elements to DOM in correct order
//     inputGroup.appendChild(input);
//     inputGroup.appendChild(label);
//     filterInputs.appendChild(inputGroup);
//   });
  
//   // Add button group
//   const buttonGroup = document.createElement('div');
//   buttonGroup.classList.add('filter-buttons');
  
//   // Apply filters button
//   const applyButton = document.createElement('button');
//   applyButton.textContent = 'Apply Filters';
//   applyButton.classList.add('filter-button');
//   applyButton.addEventListener('click', () => applyLeadFilters([...textFields, ...dateFields]));
//   buttonGroup.appendChild(applyButton);
  
//   // Reset filters button
//   const resetButton = document.createElement('button');
//   resetButton.textContent = 'Reset Filters';
//   resetButton.id = 'resetFiltersButton';
//   resetButton.classList.add('filter-button', 'reset-button');
  
//   // Check if there are any active filters
//   const hasActiveFilters = Object.values(storedFilters).some(value => value && value.trim() !== '');
//   resetButton.disabled = !hasActiveFilters;
  
//   resetButton.addEventListener('click', () => resetLeadFilters([...textFields, ...dateFields]));
//   buttonGroup.appendChild(resetButton);
  
//   // Add button group to filters container
//   filterInputs.appendChild(buttonGroup);
// }

// Updated function for displaying LS_Lead filters with floating labels and proper input IDs
function displayLeadFilters() {
  const filterInputs = document.getElementById('filterInputs');
  if (!filterInputs) return;
  
  filterInputs.innerHTML = ''; 
  filterInputs.className = 'filter-container';
  
  const textFields = ['Id', 'FirstName', 'LastName', 'Company', 'Email'];
  const dateFields = ['CreatedDate', 'LastModifiedDate', 'SystemModstamp'];
  
  const storedFilters = JSON.parse(localStorage.getItem('LS_Lead_Filters')) || {};
  
  // Create text fields with floating labels
  textFields.forEach(field => {
    const inputGroup = document.createElement('div');
    inputGroup.classList.add('input-group-float');
    // Add ID to the container for styling specific fields
    inputGroup.id = `input-group-${field.toLowerCase()}`;
    
    // Create input element first (order is important for floating labels)
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `filter-${field}`;
    input.classList.add('filter-input');
    input.placeholder = " "; // Empty space placeholder is required for the CSS selector to work
    
    // Create label element
    const label = document.createElement('label');
    label.setAttribute('for', `filter-${field}`);
    label.textContent = field;
    
    // Restore stored values if they exist
    if (storedFilters[field]) {
      input.value = storedFilters[field];
    }
    
    input.addEventListener('input', updateResetButtonState);
    
    // Add elements to the DOM in correct order (input first, then label)
    inputGroup.appendChild(input);
    inputGroup.appendChild(label);
    filterInputs.appendChild(inputGroup);
  });
  
  // Create date fields with floating labels
  dateFields.forEach(field => {
    const inputGroup = document.createElement('div');
    inputGroup.classList.add('input-group-float');
    inputGroup.id = `input-group-${field.toLowerCase()}`;
    
    // Create date input first
    const input = document.createElement('input');
    input.type = 'date';
    input.id = `filter-${field}`;
    input.classList.add('filter-input');
    input.placeholder = " "; // Empty space placeholder
    
    // Create label
    const label = document.createElement('label');
    label.setAttribute('for', `filter-${field}`);
    label.textContent = field;
    
    // Restore stored values
    if (storedFilters[field]) {
      input.value = storedFilters[field];
      // This class helps with styling when a date is already selected
      inputGroup.classList.add('has-value');
    }
    
    input.addEventListener('input', () => {
      updateResetButtonState();
      // Add or remove has-value class when date is selected or cleared
      if (input.value) {
        inputGroup.classList.add('has-value');
      } else {
        inputGroup.classList.remove('has-value');
      }
    });
    
    // Add elements to DOM in correct order
    inputGroup.appendChild(input);
    inputGroup.appendChild(label);
    filterInputs.appendChild(inputGroup);
  });
  
  // Add button group
  const buttonGroup = document.createElement('div');
  buttonGroup.classList.add('filter-buttons');
  
  // Apply filters button
  const applyButton = document.createElement('button');
  applyButton.textContent = 'Apply Filters';
  applyButton.classList.add('filter-button');
  applyButton.addEventListener('click', () => applyLeadFilters([...textFields, ...dateFields]));
  buttonGroup.appendChild(applyButton);
  
  // Reset filters button
  const resetButton = document.createElement('button');
  resetButton.textContent = 'Reset Filters';
  resetButton.id = 'resetFiltersButton';
  resetButton.classList.add('filter-button', 'reset-button');
  
  // Check if there are any active filters
  const hasActiveFilters = Object.values(storedFilters).some(value => value && value.trim() !== '');
  resetButton.disabled = !hasActiveFilters;
  
  resetButton.addEventListener('click', () => resetLeadFilters([...textFields, ...dateFields]));
  buttonGroup.appendChild(resetButton);
  
  // Add button group to filters container
  filterInputs.appendChild(buttonGroup);
}

async function applyLeadFilters(fields) {
  const eventId = sessionStorage.getItem('selectedEventId');
  if (!eventId) {
    alert('No EventId found. Please return to the main page and select an event.');
    return;
  }
  
  const filters = {};
  let hasFilters = false;
  
  fields.forEach(field => {
    const value = document.getElementById(`filter-${field}`).value.trim();
    if (value) {
      filters[field] = value;
      hasFilters = true;
    }
  });
  
  localStorage.setItem('LS_Lead_Filters', JSON.stringify(filters));
  
  if (!hasFilters) {
    return fetchLsLeadData();
  }

  const filterParts = [`EventId eq '${escapeODataValue(eventId)}'`]; 
  
  Object.entries(filters).forEach(([field, value]) => {
    if (field.includes('Date') || field.includes('SystemModstamp')) {      
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        const formattedDate = formatDateForOData(date);
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        const formattedNextDay = formatDateForOData(nextDay);

        filterParts.push(`(${field} ge datetime'${formattedDate}T00:00:00' and ${field} lt datetime'${formattedNextDay}T00:00:00')`);
      }
    } else if (field === 'Id') {
      filterParts.push(`substringof('${escapeODataValue(value)}', ${field})`);
    } else if (field === 'Email') {
      const emailFilter = `substringof('${escapeODataValue(value)}', ${field})`;
      console.log('Email filter:', emailFilter);
      filterParts.push(emailFilter);
      // filterParts.push(`substringof('${escapeODataValue(value)}', ${field})`);
    } else if (field === 'FirstName' || field === 'LastName' || field === 'Company') {
      filterParts.push(`substringof('${escapeODataValue(value)}', ${field})`);
    }
  });
  
  const filterQuery = filterParts.join(' and ');
  console.log('Generated OData filter query:', filterQuery); 
  
  let endpoint = `LS_Lead?$format=json&$filter=${encodeURIComponent(filterQuery)}`;
  
  if (lastSortedColumn) {
    const sortOrder = lastSortDirection === 'asc' ? lastSortedColumn : `${lastSortedColumn} desc`;
    endpoint = `LS_Lead?$orderby=${sortOrder}&$format=json&$filter=${encodeURIComponent(filterQuery)}`;
  }
  
  try {
    const data = await apiService.request('GET', endpoint);
    if (data && data.d && data.d.results) {
      displayData(data.d.results);
      pagination.updateNextUrl(data);
    } else {
      displayData([]);
      document.getElementById('noDataMessage').textContent = 'No data found with the provided filters.';
    }
  } catch (error) {
    console.error('Error applying filters:', error);
    console.error('Error details:', error.message);
    alert('An error occurred while fetching filtered data.');
  }
}

async function applyLeadReportFilters(fields) {
  const eventId = sessionStorage.getItem('selectedEventId');
  if (!eventId) {
    alert('No EventId found. Please return to the main page and select an event.');
    return;
  }

  const filters = {};
  let hasFilters = false;

  fields.forEach(field => {
    const value = document.getElementById(`filter-${field}`).value.trim();
    if (value) {
      filters[field] = value;
      hasFilters = true;
    }
  });

  localStorage.setItem('LS_LeadReport_Filters', JSON.stringify(filters));

  if (!hasFilters) {
    return fetchLsLeadReportData();
  }

  const filterParts = [`EventId eq '${escapeODataValue(eventId)}'`];

  Object.entries(filters).forEach(([field, value]) => {
    if (field.includes('Date') || field.includes('SystemModstamp')) {      
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        const formattedDate = formatDateForOData(date);
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        const formattedNextDay = formatDateForOData(nextDay);

        filterParts.push(`(${field} ge datetime'${formattedDate}T00:00:00' and ${field} lt datetime'${formattedNextDay}T00:00:00')`);
      }
    } else if (field === 'Id') {
      filterParts.push(`substringof('${escapeODataValue(value)}', ${field})`);
    } else if (field === 'Email') {
      filterParts.push(`substringof('${escapeODataValue(value)}', ${field})`);
    } else if (field === 'FirstName' || field === 'LastName' || field === 'Company') {
      filterParts.push(`substringof('${escapeODataValue(value)}', ${field})`);
    }
  });

  const filterQuery = filterParts.join(' and ');

  let endpoint = `LS_LeadReport?$format=json&$filter=${encodeURIComponent(filterQuery)}`;

  if (lastSortedColumn) {
    const sortOrder = lastSortDirection === 'asc' ? lastSortedColumn : `${lastSortedColumn} desc`;
    endpoint = `LS_LeadReport?$orderby=${sortOrder}&$format=json&$filter=${encodeURIComponent(filterQuery)}`;
  }

  try {
    const data = await apiService.request('GET', endpoint);
    if (data && data.d && data.d.results) {
      displayData(data.d.results);
      pagination.updateNextUrl(data);
    } else {
      displayData([]);
      document.getElementById('noDataMessage').textContent = 'No data found with the provided filters.';
    }
  } catch (error) {
    console.error('Error applying filters:', error);
    console.error('Error details:', error.message);
    alert('An error occurred while fetching filtered data.');
  }
}

function resetLeadFilters(fields) {
  localStorage.removeItem('LS_Lead_Filters');
  
  fields.forEach(field => {
    const input = document.getElementById(`filter-${field}`);
    if (input) {
      input.value = '';
    }
  });
  
  // Désactiver le bouton Reset
  const resetButton = document.getElementById('resetFiltersButton');
  if (resetButton) {
    resetButton.disabled = true;
  }

  fetchLsLeadData();
}

function updateResetButtonState() {
  const resetButton = document.getElementById('resetFiltersButton');
  if (!resetButton) return;
  
  const filterInputs = document.querySelectorAll('.filter-input');
  const hasValue = Array.from(filterInputs).some(input => input.value && input.value.trim() !== '');
  
  resetButton.disabled = !hasValue;
}

// Initialisation lors du chargement de la page
document.addEventListener('DOMContentLoaded', () => {
  const showAttachmentButton = document.getElementById('showAttachmentButton');
  showAttachmentButton.addEventListener('click', () => {
    const attachmentIdList = sessionStorage.getItem('AttachmentIdList');
    if (attachmentIdList) {
      sessionStorage.setItem('attachmentSource', 'Lead');
      window.location.href = 'displayLsAttachmentList.html';
    } else {
      alert('No attachments available for this lead.');
    }
  });

  // display button transfert to salesforce
    addTransferButton();


  // Initialiser la pagination
  pagination.initPagination();

  fetchLsLeadData();
  displayLeadFilters();
  initializeRowToggle();
});

const backButton = document.getElementById('backButton');
backButton.addEventListener('click', () => {
  window.location.href = 'display.html';
});

// Ajouter des écouteurs d'événements pour le redimensionnement et le chargement
window.addEventListener('resize', handleResponsiveLayout);
document.addEventListener('DOMContentLoaded', () => {
   handleResponsiveLayout();
});