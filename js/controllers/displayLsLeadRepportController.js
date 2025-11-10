import ApiService from "../services/apiService.js";
import {formatDate, setupPagination, formatDateForOData, escapeODataValue} from "../utils/helper.js";

const serverName = sessionStorage.getItem("serverName");
const apiName = sessionStorage.getItem("apiName");
const credentials = sessionStorage.getItem("credentials");

if (!serverName || !apiName || !credentials) {
  window.location.href = "/index.html";
}

const apiService = new ApiService(serverName, apiName);
console.log("API Service initialized with server:", serverName, "and API:", apiName, "apiService:", apiService);
let nextUrl = "";

const columnConfig = {
  LS_LeadReport: {
    Status: "150px",  // New Status column
    Id: "400px",
    CreatedDate: "200px",
    LastModifiedDate: "300px",
    CreatedById: "300px",
    LastModifiedById: "300px",
    Salutation: "300px",
    Suffix: "300px",
    FirstName: "300px",
    MiddleName: "300px",
    LastName: "300px",
    Company: "500px",
    Title: "300px",
    Phone: "300px",
    MobilePhone: "300px",
    Fax: "300px",
    Email: "300px",
    Website: "300px",
    Street: "300px",
    PostalCode: "300px",
    City: "300px",
    Country: "300px",
    CountryCode: "300px",
    State: "300px",
    Description: "700px",
    IsReviewed: "300px",
    AttachmentIdList: "800px",
    SalesArea: "300px",
    RequestBarcode: "500px",
    StatusMessage: "600px",
    DeviceId: "600px",
    DeviceRecordId: "300px",
    SystemModstamp: "300px",
    EventId: "600px",
    Department: "300px",
    Industry: "300px",
    Question01: "300px",
    Answers01: "300px",
    Text01: "300px",
    Question02: "300px",
    Answers02: "300px",
    Text02: "300px",
    Question03: "300px",
    Answers03: "300px",
    Text03: "300px",
    Question04: "300px",
    Answers04: "300px",
    Text04: "300px",
    Question05: "300px",
    Answers05: "300px",
    Text05: "300px",
    Question06: "300px",
    Answers06: "300px",
    Text06: "300px",
    Question07: "300px",
    Answers07: "300px",
    Text07: "300px",
    Question08: "300px",
    Answers08: "300px",
    Text08: "300px",
    Question09: "300px",
    Answers09: "300px",
    Text09: "300px",
    Question10: "300px",
    Answers10: "300px",
    Text10: "300px",
    Question11: "300px",
    Answers11: "300px",
    Text11: "300px",
    Question12: "300px",
    Answers12: "300px",
    Text12: "300px",
    Question13: "300px",
    Answers13: "300px",
    Text13: "300px",
    Question14: "300px",
    Answers14: "300px",
    Text14: "300px",
    Question15: "300px",
    Answers15: "300px",
    Text15: "300px",
    Question16: "300px",
    Answers16: "300px",
    Text16: "300px",
    Question17: "300px",
    Answers17: "300px",
    Text17: "300px",
    Question18: "300px",
    Answers18: "300px",
    Text18: "300px",
    Question19: "300px",
    Answers19: "300px",
    Text19: "300px",
    Question20: "300px",
    Answers20: "300px",
    Text20: "300px",
    Question21: "300px",
    Answers21: "300px",
    Text21: "300px",
    Question22: "300px",
    Answers22: "300px",
    Text22: "300px",
    Question23: "300px",
    Answers23: "300px",
    Text23: "300px",
    Question24: "300px",
    Answers24: "300px",
    Text24: "300px",
    Question25: "300px",
    Answers25: "300px",
    Text25: "300px",
    Question26: "300px",
    Answers26: "300px",
    Text26: "300px",
    Question27: "300px",
    Answers27: "300px",
    Text27: "300px",
    Question28: "300px",
    Answers28: "300px",
    Text28: "300px",
    Question29: "300px",
    Answers29: "300px",
    Text29: "300px",
    Question30: "300px",
    Answers30: "300px",
    Text30: "300px",
  },
};

const pagination = setupPagination(apiService, displayData);

let lastSortedColumn = null;
let lastSortDirection = "asc";
let selectedRowItem = null;

/**
 * Get transfer status for a lead from localStorage
 * @param {string} leadId - The lead ID to check
 * @returns {object|null} Transfer status object or null if not transferred
 */
/**
 * Get transfer status from backend with Salesforce verification
 * @param {string} leadId - The lead ID to check
 * @returns {Promise<Object|null>} Enhanced status object or null
 */
async function getTransferStatus(leadId) {
  if (!leadId) return null;

  try {
    const BACKEND_API_URL = window.location.hostname === 'localhost'
      ? 'http://localhost:3000'
      : 'https://lsapisfbackenddev-gnfbema5gcaxdahz.germanywestcentral-01.azurewebsites.net';

    const orgId = localStorage.getItem('orgId') || 'default';

    const response = await fetch(`${BACKEND_API_URL}/api/leads/transfer-status/${leadId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Org-Id': orgId
      },
      credentials: 'include'
    });

    if (!response.ok) {
      console.error('Failed to get transfer status:', response.statusText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching transfer status:', error);
    return null;
  }
}

/**
 * Check if a lead has been transferred to Salesforce
 * @param {string} leadId - The lead ID to check
 * @returns {Promise<boolean>} True if transferred, false otherwise
 */
async function isLeadTransferred(leadId) {
  const status = await getTransferStatus(leadId);
  return status !== null && status.status !== 'NOT_TRANSFERRED';
}

async function fetchLsLeadReportData() {
  const eventId = sessionStorage.getItem("selectedEventId");
  if (!eventId) {
    alert("No EventId provided.");
    window.location.href = "display.html";
    return;
  }

  const endpoint = `LS_LeadReport?$format=json&$filter=EventId eq '${encodeURIComponent(
    eventId
  )}'`;

  try {
    const data = await apiService.request("GET", endpoint);
    console.log("Fetched LS_LeadReport data:", data);
    if (data && data.d && data.d.results) {
      displayData(data.d.results);

      // Setup for pagination
      nextUrl = apiService.getNextUrl(data);
      document.getElementById("nextButton").disabled = !nextUrl;
    } else {
      displayData([]);
    }
  } catch (error) {
    console.error("Error fetching LS_LeadReport data:", error);
    apiService.showError(
      "An error occurred while fetching LS_LeadReport data."
    );
  }

  // Initialize search functionality
  initSearch();

  // Display filter options
  displayLeadReportFilters();
}

async function refreshTransferStatuses() {
  try {
    const BACKEND_API_URL = window.location.hostname === 'localhost'
      ? 'http://localhost:3000'
      : 'https://lsapisfbackenddev-gnfbema5gcaxdahz.germanywestcentral-01.azurewebsites.net';

    const orgId = localStorage.getItem('orgId') || 'default';
    await fetch(`${BACKEND_API_URL}/api/leads/transfer-status/sync`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Org-Id': orgId }
    });


  } catch (e) {
    console.warn('Status sync failed:', e);
  }
}



// Function to get the configured width of a column (dynamic if not in config)
function getColumnWidth(header, entity) {
  if (columnConfig[entity] && columnConfig[entity][header] !== undefined) {
    return columnConfig[entity][header];
  }

  // Return dynamic width for fields not in config (e.g., custom fields)
  // Status gets smaller width, most other fields get medium width
  if (header === 'Status') return '150px';
  if (header.includes('Id')) return '400px';
  if (header.includes('Date') || header === 'SystemModstamp') return '200px';
  if (header.includes('Description') || header.includes('Message')) return '600px';
  if (header.includes('Attachment')) return '800px';
  if (header.includes('Question') || header.includes('Answer') || header.includes('Text')) return '300px';

  // Default width for custom fields and unknown fields
  return '300px';
}

async function loadNextRows() {
  if (!nextUrl) {
    console.error("No next URL found.");
    return;
  }

  try {
    const data = await apiService.fetchNextRows(nextUrl);

    if (data && data.d && data.d.results.length > 0) {
      displayData(data.d.results, true);
      nextUrl = apiService.getNextUrl(data);
      document.getElementById("nextButton").disabled = !nextUrl;
    } else {
      alert("No more data to load.");
      nextUrl = "";
      document.getElementById("nextButton").disabled = true;
    }
  } catch (error) {
    console.error("Error loading next rows:", error);
    apiService.showError("Failed to load additional data.");
  }
}

// Updated function for displaying LS_LeadReport filters with floating labels and proper input IDs
function displayLeadReportFilters() {
  const filterInputs = document.getElementById("filterInputs");
  if (!filterInputs) return;

  filterInputs.innerHTML = "";
  filterInputs.className = "filter-container";

  const textFields = ["Id", "FirstName", "LastName", "Company", "Email"];
  const dateFields = ["CreatedDate", "LastModifiedDate", "SystemModstamp"];

  const storedFilters =
    JSON.parse(localStorage.getItem("LS_LeadReport_Filters")) || {};

  // Create text fields with floating labels
  textFields.forEach((field) => {
    const inputGroup = document.createElement("div");
    inputGroup.classList.add("input-group-float");
    inputGroup.id = `input-group-${field.toLowerCase()}`;

    // Create input element first (order is important for floating labels)
    const input = document.createElement("input");
    input.type = "text";
    input.id = `filter-${field}`;
    input.classList.add("filter-input");
    input.placeholder = " "; // Empty space placeholder is required for the CSS selector to work

    // Create label element
    const label = document.createElement("label");
    label.setAttribute("for", `filter-${field}`);
    label.textContent = field;

    // Restore stored values if they exist
    if (storedFilters[field]) {
      input.value = storedFilters[field];
    }

    input.addEventListener("input", updateResetButtonState);

    // Add elements to the DOM in correct order (input first, then label)
    inputGroup.appendChild(input);
    inputGroup.appendChild(label);
    filterInputs.appendChild(inputGroup);
  });

  // Create date fields with floating labels
  dateFields.forEach((field) => {
    const inputGroup = document.createElement("div");
    inputGroup.classList.add("input-group-float");
    inputGroup.id = `input-group-${field.toLowerCase()}`;

    // Create date input first
    const input = document.createElement("input");
    input.type = "date";
    input.id = `filter-${field}`;
    input.classList.add("filter-input");
    input.placeholder = " "; //Empty space placeholder is required for the CSS selector to work

    // Create label
    const label = document.createElement("label");
    label.setAttribute("for", `filter-${field}`);
    label.textContent = field;

    // Restore stored values
    if (storedFilters[field]) {
      input.value = storedFilters[field];
      // This class helps with styling when a date is already selected
      inputGroup.classList.add("has-value");
    }

    input.addEventListener("input", () => {
      updateResetButtonState();
      // Add or remove has-value class when date is selected or cleared
      if (input.value) {
        inputGroup.classList.add("has-value");
      } else {
        inputGroup.classList.remove("has-value");
      }
    });

    // Add elements to DOM in correct order
    inputGroup.appendChild(input);
    inputGroup.appendChild(label);
    filterInputs.appendChild(inputGroup);
  });

  // Add button group
  const buttonGroup = document.createElement("div");
  buttonGroup.classList.add("filter-buttons");

  // Apply filters button
  const applyButton = document.createElement("button");
  applyButton.textContent = "Apply Filters";
  applyButton.classList.add("filter-button");
  applyButton.addEventListener("click", () =>
    applyLeadReportFilters([...textFields, ...dateFields])
  );
  buttonGroup.appendChild(applyButton);

  // Reset filters button
  const resetButton = document.createElement("button");
  resetButton.textContent = "Reset Filters";
  resetButton.id = "resetFiltersButton";
  resetButton.classList.add("filter-button", "reset-button");

  // Check if there are any active filters
  const hasActiveFilters = Object.values(storedFilters).some(
    (value) => value && value.trim() !== ""
  );
  resetButton.disabled = !hasActiveFilters;

  resetButton.addEventListener("click", () =>
    resetLeadReportFilters([...textFields, ...dateFields])
  );
  buttonGroup.appendChild(resetButton);

  // Add button group to filters container
  filterInputs.appendChild(buttonGroup);
}

function updateResetButtonState() {
  const resetButton = document.getElementById("resetFiltersButton");
  if (!resetButton) return;

  const filterInputs = document.querySelectorAll(".filter-input");
  const hasValue = Array.from(filterInputs).some(
    (input) => input.value && input.value.trim() !== ""
  );

  resetButton.disabled = !hasValue;
}

async function applyLeadReportFilters(fields) {
  const eventId = sessionStorage.getItem("selectedEventId");
  if (!eventId) {
    alert(
      "No EventId found. Please return to the main page and select an event."
    );
    return;
  }

  const filters = {};
  let hasFilters = false;

  fields.forEach((field) => {
    const value = document.getElementById(`filter-${field}`).value.trim();
    if (value) {
      filters[field] = value;
      hasFilters = true;
    }
  });

  localStorage.setItem("LS_LeadReport_Filters", JSON.stringify(filters));

  if (!hasFilters) {
    return fetchLsLeadReportData();
  }

  const filterParts = [`EventId eq '${escapeODataValue(eventId)}'`];

  Object.entries(filters).forEach(([field, value]) => {
    if (field.includes("Date") || field.includes("SystemModstamp")) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        const formattedDate = formatDateForOData(date);
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        const formattedNextDay = formatDateForOData(nextDay);

        filterParts.push(
          `(${field} ge datetime'${formattedDate}T00:00:00' and ${field} lt datetime'${formattedNextDay}T00:00:00')`
        );
      }
    } else if (field === "Id") {
      filterParts.push(`substringof('${escapeODataValue(value)}', ${field})`);
    } else if (field === "Email") {
      const emailFilter = `substringof('${escapeODataValue(value)}', ${field})`;
      filterParts.push(emailFilter);
    } else if (
      field === "FirstName" ||
      field === "LastName" ||
      field === "Company"
    ) {
      filterParts.push(`substringof('${escapeODataValue(value)}', ${field})`);
    }
  });

  const filterQuery = filterParts.join(" and ");
  console.log("Generated OData filter query:", filterQuery);

  let endpoint = `LS_LeadReport?$format=json&$filter=${encodeURIComponent(
    filterQuery
  )}`;

  if (lastSortedColumn) {
    const sortOrder =
      lastSortDirection === "asc"
        ? lastSortedColumn
        : `${lastSortedColumn} desc`;
    endpoint = `LS_LeadReport?$orderby=${sortOrder}&$format=json&$filter=${encodeURIComponent(filterQuery)}`;
  }

  try {
    const data = await apiService.request("GET", endpoint);
    if (data && data.d && data.d.results) {
      displayData(data.d.results);
      pagination.updateNextUrl(data);
    } else {
      displayData([]);
      document.getElementById("noDataMessage").textContent = "No data found with the provided filters.";
    }
  } catch (error) {
    console.error("Error applying filters:", error);
    console.error("Error details:", error.message);
    alert("An error occurred while fetching filtered data.");
  }
}

function resetLeadReportFilters(fields) {
  localStorage.removeItem("LS_LeadReport_Filters");

  fields.forEach((field) => {
    const input = document.getElementById(`filter-${field}`);
    if (input) {
      input.value = "";
    }
  });

  const resetButton = document.getElementById("resetFiltersButton");
  if (resetButton) {
    resetButton.disabled = true;
  }

  fetchLsLeadReportData();
}

async function sortTable(index, th) {
  const headerText = th.childNodes[0].nodeValue.trim();

  const previouslySelectedRow = document.querySelector("tr.selected");
  let previousItem = null;

  if (previouslySelectedRow) {
    previousItem = getItemFromRow(previouslySelectedRow);
  }

  let sortAsc;

  if (lastSortedColumn !== headerText) {
    sortAsc = true;
    lastSortedColumn = headerText;
  } else {
    sortAsc = lastSortDirection === "desc";
  }

  lastSortDirection = sortAsc ? "asc" : "desc";

  const allHeaders = document.querySelectorAll("thead th");
  allHeaders.forEach((header) => {
    header.classList.remove("asc", "desc", "active");
  });

  th.classList.add(lastSortDirection, "active");

  const sortOrder = sortAsc ? headerText : `${headerText} desc`;

  const eventId = sessionStorage.getItem("selectedEventId");
  if (!eventId) {
    alert("No EventId provided.");
    return;
  }

  try {
    const noDataMessage = document.getElementById("noDataMessage");
    if (noDataMessage) noDataMessage.textContent = "Chargement...";

    const filterParts = [];
    filterParts.push(`EventId eq '${escapeODataValue(eventId)}'`);

    const storedFilters =
      JSON.parse(localStorage.getItem("LS_LeadReport_Filters")) || {};
    Object.entries(storedFilters).forEach(([field, value]) => {
      if (value && value.trim()) {
        if (field.includes("Date") || field.includes("SystemModstamp")) {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            const formattedDate = formatDateForOData(date);

            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);
            const formattedNextDay = formatDateForOData(nextDay);

            filterParts.push(
              `(${field} ge datetime'${formattedDate}T00:00:00' and ${field} lt datetime'${formattedNextDay}T00:00:00')`
            );
          }
        }
      }
    });

    const filterQuery = filterParts.join(" and ");

    let endpoint = `LS_LeadReport?$orderby=${sortOrder}&$format=json&$filter=${encodeURIComponent(
      filterQuery
    )}`;

    const data = await apiService.request("GET", endpoint);

    if (data && data.d && data.d.results) {
      displayData(data.d.results);

      pagination.updateNextUrl(data);

      if (previousItem) {
        restoreRowSelection(previousItem);
      }
    } else {
      displayData([]);
      if (noDataMessage) noDataMessage.textContent = "No data available.";
    }
  } catch (error) {
    console.error("Sorting error:", error);
    alert("Error during sorting. Check the console for more details.");
  }
}

function restoreRowSelection(previousItem) {
  if (!previousItem || !previousItem.Id) return;

  const rows = document.querySelectorAll("tbody tr");
  let matchFound = false;

  rows.forEach((row) => {
    const rowItem = getItemFromRow(row);
    if (rowItem.Id === previousItem.Id) {
      row.click();
      matchFound = true;
    }
  });

  if (!matchFound) {
    const showAttachmentButton = document.getElementById(
      "showAttachmentButton"
    );
    if (showAttachmentButton) {
      showAttachmentButton.disabled = true;
      showAttachmentButton.textContent = "Show Attachment";
      sessionStorage.removeItem("AttachmentIdList");
    }
  }
}

// Initialize search functionality
// This function sets up the search input and filters the table rows based on the search term
function initSearch() {
  const searchInput = document.getElementById("search");
  const tableRows = document.querySelectorAll("tbody tr");
  const noDataMessage = document.getElementById("noDataMessage");

  if (!searchInput || !tableRows) {
    console.error("Search elements not found in the DOM.");
    return;
  }

  searchInput.addEventListener("input", () => {
    const searchValue = searchInput.value.toLowerCase();
    let found = false;

    tableRows.forEach((row, i) => {
      const rowText = row.textContent.toLowerCase();
      const isVisible = rowText.indexOf(searchValue) >= 0;
      row.classList.toggle("hide", !isVisible);
      if (isVisible) {
        found = true;
      }
      row.style.setProperty("--delay", i / 25 + "s");
    });

    // Update row colors for better visibility
    document
      .querySelectorAll("tbody tr:not(.hide)")
      .forEach((visibleRow, i) => {
        visibleRow.style.backgroundColor =
          i % 2 === 0 ? "transparent" : "rgba(0, 0, 0, 0.03)";
      });

    if (!found) {
      noDataMessage.textContent = "No results found.";
    } else {
      noDataMessage.textContent = "";
    }
  });
}

// Enhanced displayData function with improved row selection and button toggling
function displayData(data, append = false) {
  const tableHead = document.getElementById("tableHead");
  const tableBody = document.getElementById("tableBody");
  const noDataMessage = document.getElementById("noDataMessage");
  const showAttachmentButton = document.getElementById("showAttachmentButton");
  const transferButton = document.getElementById("transferButton");

  if (showAttachmentButton) {
    showAttachmentButton.disabled = true;
    showAttachmentButton.textContent = "Show Attachment";
  }

  if (transferButton) {
    transferButton.disabled = true;
  }

  if (!append) {
    tableHead.innerHTML = "";
    tableBody.innerHTML = "";
  }

  if (!data || data.length === 0) {
    noDataMessage.textContent = "No data available.";
    return;
  }

  noDataMessage.textContent = "";

  // Get all available fields from the data
  const allHeaders = Object.keys(data[0]).filter((header) =>
      header !== "__metadata" &&
      header !== "KontaktViewId" && !header.endsWith(" ")
  );

  // Get active fields from FieldMappingService
  const activeFieldNames = window.fieldMappingService?.getActiveFieldNames() || [];
  const activeCustomFields = window.fieldMappingService?.getAllCustomFields().filter(f => f.active !== false) || [];

  // Filter to show only active fields
  const headers = allHeaders.filter(header => {
    // Always show required fields
    if (header === 'LastName' || header === 'Company') return true;
    // Check if field is in active configuration
    return activeFieldNames.includes(header);
  });

  // Inject "Status" column at the beginning
  const headersWithStatus = ['Status', ...headers];

  // Add custom fields at the end
  activeCustomFields.forEach(customField => {
    headersWithStatus.push(customField.sfFieldName);
  });

  if (!append) {
    const headerRow = document.createElement("tr");

    headersWithStatus.forEach((header, index) => {
      const th = document.createElement("th");

      const width = getColumnWidth(header, "LS_LeadReport");
      if (width) {
        th.style.width = width;
      }

      const headerText = document.createTextNode(header);
      th.appendChild(headerText);

      const span = document.createElement("span");
      span.classList.add("icon-arrow");

      if (header === lastSortedColumn) {
        th.classList.add(lastSortDirection, "active");
        span.innerHTML = lastSortDirection === "asc" ? "&uarr;" : "&darr;";
      } else {
        span.innerHTML = "&UpArrow;";
      }

      th.appendChild(span);

      th.style.position = "sticky";
      th.style.top = "0";
      th.addEventListener("click", () => sortTable(index, th));
      headerRow.appendChild(th);
    });

    tableHead.appendChild(headerRow);
  }

  // Populate table body
  data.forEach((item) => {
    const row = document.createElement("tr");

    headersWithStatus.forEach((header) => {
      const td = document.createElement("td");

      const width = getColumnWidth(header, "LS_LeadReport");
      if (width) {
        td.style.width = width;
      }

      if (header === lastSortedColumn) {
        td.classList.add("active");
      }

      // Handle Status column specially - load async
      if (header === 'Status') {
        const leadId = item.Id;

        // Create loading placeholder
        const badge = document.createElement('span');
        badge.style.cssText = 'display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background-color: #e5e7eb; color: #6b7280;';
        badge.textContent = '⏳ Loading...';
        badge.setAttribute('data-lead-id', leadId);
        td.appendChild(badge);

        // Load status asynchronously
        getTransferStatus(leadId).then(status => {
          if (status && status.icon) {
            badge.style.backgroundColor = status.color;
            badge.style.color = 'white';
            badge.textContent = `${status.icon} ${status.label}`;
            badge.title = status.details || status.label;
            badge.style.cursor = 'help';
          } else {
            // Fallback for old format or no status
            badge.style.backgroundColor = '#6b7280';
            badge.style.color = 'white';
            badge.textContent = '⏺ Not yet transferred';
          }
        }).catch(error => {
          console.error('Error loading status for', leadId, error);
          badge.style.backgroundColor = '#6b7280';
          badge.textContent = '⏺ Not yet transferred';
        });
      } else if (header.includes("Date") || header === "SystemModstamp") {
        td.textContent = formatDate(item[header]);
      } else {
        // Check if this is a custom field
        const customField = activeCustomFields.find(f => f.sfFieldName === header);
        if (customField) {
          // Display the custom field's default value
          td.textContent = customField.value || 'N/A';
          td.style.fontStyle = 'italic';
          td.style.color = '#8b5cf6';
        } else {
          td.textContent = item[header] || "N/A";
        }
      }
      row.appendChild(td);
    });

    tableBody.appendChild(row);
  });

  // Initialize row toggle functionality
  initializeRowToggle();

  refreshTransferStatuses();
}

// Function to get item data from row
function getItemFromRow(row) {
  const cells = Array.from(row.cells);

  const item = {};
  const headers = Array.from(document.querySelectorAll("thead th")).map((th) =>
    th.textContent.trim().replace(/[↑↓]/g, "")
  );

  cells.forEach((cell, index) => {
    if (headers[index]) {
      item[headers[index]] = cell.textContent.trim();
    }
  });

  return item;
}

// Handle row selection with toggle support for both attachment and transfer buttons
function handleRowSelection(item, event) {
  if (!event) {
    console.error("Event is missing in handleRowSelection");
    return;
  }

  const row = event.currentTarget;
  const showAttachmentButton = document.getElementById("showAttachmentButton");
  const transferButton = document.getElementById("transferButton");
  const previouslySelected = document.querySelector("tr.selected");

  if (previouslySelected === row) {
    // Deselect if clicking the same row
    row.classList.remove("selected");
    if (showAttachmentButton) {
      showAttachmentButton.disabled = true;
      showAttachmentButton.textContent = "Show Attachment";
    }
    if (transferButton) {
      transferButton.disabled = true;
    }
    sessionStorage.removeItem("AttachmentIdList");
    selectedRowItem = null;
    return;
  }

  // Clear previous selection
  if (previouslySelected) {
    previouslySelected.classList.remove("selected");
  }

  // Set new selection
  row.classList.add("selected");
  selectedRowItem = item;

  // Handle the attachment button state
  if (item.AttachmentIdList) {
    const validAttachments = item.AttachmentIdList.split(",").filter(
      (id) => id.trim() !== ""
    );

    if (validAttachments.length > 0) {
      if (showAttachmentButton) {
        showAttachmentButton.disabled = false;
        showAttachmentButton.textContent = `Show Attachment (${validAttachments.length})`;
      }
      sessionStorage.setItem("AttachmentIdList", validAttachments.join(","));
    } else {
      if (showAttachmentButton) {
        showAttachmentButton.disabled = true;
        showAttachmentButton.textContent = "No Valid Attachments";
      }
      sessionStorage.removeItem("AttachmentIdList");
    }
  } else {
    if (showAttachmentButton) {
      showAttachmentButton.disabled = true;
      showAttachmentButton.textContent = "Show Attachment";
    }
    sessionStorage.removeItem("AttachmentIdList");
  }

  // Enable transfer button when a row is selected
  if (transferButton) {
    transferButton.disabled = false;
  }
}

// Initialize row toggle for all table rows
function initializeRowToggle() {
  const tableRows = document.querySelectorAll("tbody tr");
  const showAttachmentButton = document.getElementById("showAttachmentButton");
  const transferButton = document.getElementById("transferButton");

  if (showAttachmentButton) {
    showAttachmentButton.disabled = true;
  }

  if (transferButton) {
    transferButton.disabled = true;
  }

  tableRows.forEach((row) => {
    // Remove existing event listener to prevent duplicates
    row.removeEventListener("click", handleRowClickWrapper);

    // Add new event listener
    row.addEventListener("click", handleRowClickWrapper);
  });
}

// Wrapper function to handle row clicks
function handleRowClickWrapper(event) {
  const row = event.currentTarget;
  const item = getItemFromRow(row);

  // Add attachment ID to the item if available
  const headers = Array.from(document.querySelectorAll("thead th")).map((th) =>
    th.textContent.trim().replace(/[↑↓]/g, "")
  );

  const attachmentColumn = headers.findIndex((h) => h === "AttachmentIdList");
  if (attachmentColumn >= 0 && row.cells[attachmentColumn]) {
    item.AttachmentIdList = row.cells[attachmentColumn].textContent.trim();
  }

  handleRowSelection(item, event);
}

// Improved addTransferButton function
function addTransferButton() {
  // Check if the button already exists to avoid duplicates
   if (document.getElementById('transferButton')) {
    console.log("Transfer button already exists");
    return;
  }

  // Create the button
  const transferButton = document.createElement("button");
  transferButton.id = "transferButton";
  transferButton.className = "action-button";
  transferButton.disabled = true;
  transferButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 5v14M19 12l-7 7-7-7"/>
      </svg>
      <span>Transfer to Salesforce</span>
    `;

  // Add click event
  transferButton.addEventListener("click", () => {
    if (selectedRowItem) {
      sessionStorage.setItem("selectedLeadData", JSON.stringify(selectedRowItem));
      sessionStorage.setItem("selectedLeadSource", "LeadReport");
      window.location.href = "displayLeadTransfer.html";
    } else {
      alert("Please select a lead report to transfer.");
    }
  });

  // Insert the button into the DOM
  const showAttachmentButton = document.getElementById("showAttachmentButton");
  const actionsContainer = showAttachmentButton?.parentNode;

  if (actionsContainer) {
    actionsContainer.insertBefore(
      transferButton,
      showAttachmentButton.nextSibling
    );
  }
}

/**
 * Display userName from sessionStorage in the page header
 */
function displayUserName() {
  const userName = sessionStorage.getItem("userName");
  const userNameDisplay = document.getElementById("userNameDisplay");

  if (userNameDisplay && userName) {
    userNameDisplay.textContent = userName;
  }
}

function init() {
  // Display userName in header
  displayUserName();

  fetchLsLeadReportData();

  // Setup back button
  const backButton = document.getElementById("backButton");
  if (backButton) {
    backButton.addEventListener("click", () => {
      window.location.href = "display.html";
    });
  }

  // addTransferButton function is called here to ensure the button is added after the DOM is fully loaded
  addTransferButton();

  // Setup pagination button
  const nextButton = document.getElementById("nextButton");
  if (nextButton) {
    nextButton.addEventListener("click", loadNextRows);
  }

  // Setup show attachment button if it exists
  const showAttachmentButton = document.getElementById("showAttachmentButton");
  if (showAttachmentButton) {
    showAttachmentButton.addEventListener("click", () => {
      const attachmentIdList = sessionStorage.getItem("AttachmentIdList");
      if (attachmentIdList) {
        sessionStorage.setItem("attachmentSource", "LeadReport");
        window.location.href = "displayLsAttachmentList.html";
      } else {
        alert("No attachments available for this report.");
      }
    });
  }
}

// Initialize the application when DOM is loaded
document.addEventListener("DOMContentLoaded", init);
