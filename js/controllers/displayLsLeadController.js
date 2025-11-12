import ApiService from '../services/apiService.js';
import {escapeODataValue, formatDateForOData, formatDate, setupPagination } from '../utils/helper.js';

const REQUIRED_FIELDS = ['LastName', 'Company'];
const DEFAULT_ACTIVE_FIELDS = [
    'FirstName', 'LastName', 'Email', 'Company', 'Phone', 'MobilePhone',
    'Street', 'City', 'PostalCode', 'State', 'Country',
    'Title', 'Industry', 'Description'
];

const columnConfig = {
  LS_Lead: {
    "Status": "150px",  // New Status column
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

// Fetch and parse $metadata to get field structure
async function fetchMetadata(entityType = 'LS_Lead') {
  try {
    const endpoint = '$metadata';
    const response = await fetch(`https://${serverName}/${apiName}/${endpoint}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/xml'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch metadata: ${response.statusText}`);
    }

    const xmlText = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    // Find the EntityType for LS_Lead or LS_LeadReport
    const entityTypes = xmlDoc.getElementsByTagName('EntityType');
    let targetEntity = null;

    for (let entity of entityTypes) {
      if (entity.getAttribute('Name') === entityType) {
        targetEntity = entity;
        break;
      }
    }

    if (!targetEntity) {
      console.error(`EntityType ${entityType} not found in metadata`);
      return [];
    }

    // Extract all Property elements (fields)
    const properties = targetEntity.getElementsByTagName('Property');
    const fields = [];

    for (let prop of properties) {
      const fieldName = prop.getAttribute('Name');
      const fieldType = prop.getAttribute('Type');

      // Skip metadata fields
      if (fieldName === 'KontaktViewId' || fieldName === '__metadata') {
        continue;
      }

      fields.push({
        name: fieldName,
        type: fieldType,
        nullable: prop.getAttribute('Nullable') !== 'false'
      });
    }

    console.log("metadata leads", fields)

    console.log(`✅ Loaded ${fields.length} fields from $metadata for ${entityType}`);
    return fields;

  } catch (error) {
    console.error('Error fetching metadata:', error);
    throw error;
  }
}

// Standard Salesforce Lead Fields
const STANDARD_SALESFORCE_FIELDS = [
  'ActionCadenceAssigneeId', 'ActionCadenceId', 'ActionCadenceState',
  'ActiveTrackerCount', 'ActivityMetricId', 'ActivityMetricRollupId',
  'Address', 'AnnualRevenue', 'City', 'CleanStatus', 'Company',
  'CompanyDunsNumber', 'ConvertedAccountId', 'ConvertedContactId',
  'ConvertedDate', 'ConvertedOpportunityId', 'ConnectionReceivedId',
  'ConnectionSentId', 'Country', 'CountryCode', 'CurrencyIsoCode',
  'DandBCompanyId', 'Description', 'Division', 'Email',
  'EmailBouncedDate', 'EmailBouncedReason', 'ExportStatus', 'Fax',
  'FirstCallDateTime', 'FirstEmailDateTime', 'FirstName',
  'GeocodeAccuracy', 'GenderIdentity', 'HasOptedOutOfEmail',
  'HasOptedOutOfFax', 'IndividualId', 'Industry', 'IsConverted',
  'IsDeleted', 'IsPriorityRecord', 'IsUnreadByOwner', 'Jigsaw',
  'JigsawContactId', 'LastActivityDate', 'LastName', 'LastReferencedDate',
  'LastViewedDate', 'Latitude', 'LeadSource', 'Longitude',
  'MasterRecordId', 'MiddleName', 'MobilePhone', 'Name',
  'NumberOfEmployees', 'OwnerId', 'PartnerAccountId', 'Phone',
  'PhotoUrl', 'PostalCode', 'Pronouns', 'Rating', 'RecordTypeId',
  'Salutation', 'ScheduledResumeDateTime', 'ScoreIntelligenceId',
  'State', 'StateCode', 'Status', 'Street', 'Suffix', 'Title', 'Website',
  'Id', 'CreatedDate', 'LastModifiedDate', 'SystemModstamp'
];

// Check if field mapping exists, if not show configuration dialog
async function checkFieldMappingAndLoad() {
  const eventId = sessionStorage.getItem('selectedEventId');
  if (!eventId) {
    alert('No EventId provided.');
    window.location.href = 'display.html';
    return;
  }

  try {
    // Load field mapping from database
    await window.fieldMappingService.loadFieldMappingsFromAPI(eventId);
    const activeFields = window.fieldMappingService.getActiveFieldNames();

    console.log(`📋 Active fields found: ${activeFields.length}`);

    if (activeFields.length === 0) {
      console.log('⚠️ No field mapping found, showing configuration dialog');

      // Fetch metadata from API to get available fields
      const metadataFields = await fetchMetadata('LS_Lead');

      console.log(`📡 API fields found: ${metadataFields.length}`);

      // Use API fields directly and mark as active based on DEFAULT_ACTIVE_FIELDS
      const apiFields = metadataFields.map(field => ({
        name: field.name,
        type: field.type,
        nullable: field.nullable,
        isStandardActive: DEFAULT_ACTIVE_FIELDS.includes(field.name) // Only active if in default list
      }));

      console.log(`✅ API fields to display: ${apiFields.length}`);

      // Load custom fields from FieldMappingService and add them
      const customFields = window.fieldMappingService?.getAllCustomFields() || [];
      customFields.forEach(customField => {
        apiFields.push({
          name: customField.sfFieldName,
          type: 'Edm.String',
          nullable: true,
          isCustom: true
        });
      });

      // Show configuration dialog with API fields + custom fields
      showFieldConfigurationDialog(apiFields);
    } else {
      console.log('✅ Field mapping exists, loading data');
      // Field mapping exists, proceed with normal data loading
      fetchLsLeadData();
    }
  } catch (error) {
    console.error('Error checking field mapping:', error);
    alert('Error loading field configuration. Please try again.');
  }
}

// Show field configuration dialog
function showFieldConfigurationDialog(fields) {
  const modal = document.getElementById('fieldConfigModal');
  const fieldsGrid = document.getElementById('fieldsGrid');
  const searchInput = document.getElementById('fieldSearchInput');
  const addCustomFieldBtn = document.getElementById('addCustomFieldBtnModal');

  // Clear existing content
  fieldsGrid.innerHTML = '';
  searchInput.value = ''; // Reset search

  // Required fields
  const requiredFields = ['LastName', 'Company'];

  // Store fields for search and filtering
  window.configFields = fields;
  window.fieldSelections = {}; // Track selections across re-renders
  window.currentModalFilter = 'all'; // Track current filter

  // Render fields with current filter
  renderConfigFields(fields, window.currentModalFilter);

  // Show modal
  modal.classList.add('show');

  // Remove old event listeners by replacing elements
  const newSearchInput = searchInput.cloneNode(true);
  searchInput.parentNode.replaceChild(newSearchInput, searchInput);

  // Setup filter tabs
  const filterTabs = document.querySelectorAll('.filter-tab');
  filterTabs.forEach(tab => {
    tab.onclick = () => {
      // Save current selections
      saveCurrentSelections();

      // Update active tab
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Get filter type
      window.currentModalFilter = tab.getAttribute('data-filter');

      // Show/hide Add Custom Field button
      if (addCustomFieldBtn) {
        addCustomFieldBtn.style.display = window.currentModalFilter === 'custom' ? 'flex' : 'none';
      }

      // Apply filter
      renderConfigFields(fields, window.currentModalFilter);
    };
  });

  // Search functionality - preserve selections and respect filter
  newSearchInput.addEventListener('input', (e) => {
    // Save current selections before re-rendering
    saveCurrentSelections();

    const searchTerm = e.target.value.toLowerCase();
    const filtered = fields.filter(f =>
      f.name.toLowerCase().includes(searchTerm)
    );
    renderConfigFields(filtered, window.currentModalFilter);
  });

  // Select All
  document.getElementById('selectAllFields').onclick = () => {
    document.querySelectorAll('.field-card input[type="checkbox"]:not([disabled])').forEach(cb => {
      cb.checked = true;
      window.fieldSelections[cb.value] = true;
      // Trigger the change handler to update the UI
      handleFieldToggle(cb, cb.value);
    });
  };

  // Deselect All
  document.getElementById('deselectAllFields').onclick = () => {
    document.querySelectorAll('.field-card input[type="checkbox"]:not([disabled])').forEach(cb => {
      cb.checked = false;
      window.fieldSelections[cb.value] = false;
      // Trigger the change handler to update the UI
      handleFieldToggle(cb, cb.value);
    });
  };

  // Add Custom Field button
  if (addCustomFieldBtn) {
    addCustomFieldBtn.onclick = () => {
      openAddCustomFieldModal();
    };
  }

  // Close modal
  document.getElementById('closeFieldConfigModal').onclick = () => {
    modal.classList.remove('show');
    window.location.href = 'display.html';
  };

  document.getElementById('cancelFieldConfig').onclick = () => {
    modal.classList.remove('show');
    window.location.href = 'display.html';
  };

  // Save configuration
  document.getElementById('saveFieldConfig').onclick = async () => {
    await saveFieldConfiguration();
  };
}

// Save current checkbox selections
function saveCurrentSelections() {
  document.querySelectorAll('.field-card input[type="checkbox"]').forEach(cb => {
    window.fieldSelections[cb.value] = cb.checked;
  });
}

// Render fields in grid
function renderConfigFields(fields, filter = 'all') {
  const fieldsGrid = document.getElementById('fieldsGrid');
  const requiredFields = ['LastName', 'Company'];

  fieldsGrid.innerHTML = '';

  // Apply filter to fields
  let filteredFields = fields;
  if (filter !== 'all') {
    filteredFields = fields.filter(field => {
      const isRequired = requiredFields.includes(field.name);
      const isCustomField = field.isCustom === true;
      const isActive = window.fieldSelections && window.fieldSelections.hasOwnProperty(field.name)
        ? window.fieldSelections[field.name]
        : (isRequired || field.isStandardActive === true);

      switch (filter) {
        case 'active':
          return isActive;
        case 'inactive':
          return !isActive;
        case 'required':
          return isRequired;
        case 'custom':
          return isCustomField;
        default:
          return true;
      }
    });
  }

  filteredFields.forEach(field => {
    const isRequired = requiredFields.includes(field.name);
    const isCustomField = field.isCustom === true;

    // Determine if field is checked
    let isChecked;
    if (window.fieldSelections && window.fieldSelections.hasOwnProperty(field.name)) {
      isChecked = window.fieldSelections[field.name];
    } else {
      isChecked = isRequired || field.isStandardActive === true;
    }

    const isActive = isChecked;

    // Get SF field name and default value
    const sfFieldName = field.sfFieldName || field.name;
    const defaultValue = field.defaultValue || '';

    // Create field card
    const fieldCard = document.createElement('div');
    fieldCard.className = `field-card ${isActive ? '' : 'inactive'}`;

    // Create checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `field_${field.name}`;
    checkbox.value = field.name;
    checkbox.checked = isChecked;
    checkbox.disabled = isRequired;
    checkbox.onchange = function() { handleFieldToggle(this, field.name); };

    // Create field card content
    const cardContent = document.createElement('div');
    cardContent.className = 'field-card-content';

    // Header with name and badges
    const header = document.createElement('div');
    header.className = 'field-card-header';

    const fieldName = document.createElement('span');
    fieldName.className = 'field-card-name';
    fieldName.textContent = field.name;

    const badges = document.createElement('div');
    badges.className = 'field-card-badges';

    if (isRequired) {
      const requiredBadge = document.createElement('span');
      requiredBadge.className = 'badge required';
      requiredBadge.textContent = 'REQUIRED';
      badges.appendChild(requiredBadge);
    }

    const statusBadge = document.createElement('span');
    statusBadge.className = `badge ${isActive ? 'active' : 'inactive'}`;
    statusBadge.textContent = isActive ? 'ACTIVE' : 'INACTIVE';
    badges.appendChild(statusBadge);

    if (isCustomField) {
      const customBadge = document.createElement('span');
      customBadge.className = 'badge custom';
      customBadge.textContent = 'CUSTOM';
      badges.appendChild(customBadge);
    }

    header.appendChild(fieldName);
    header.appendChild(badges);

    // Field mappings
    const lsMapping = document.createElement('div');
    lsMapping.className = 'field-mapping';
    lsMapping.innerHTML = `<span class="field-mapping-ls">LS: ${field.name}</span>`;

    const sfMapping = document.createElement('div');
    sfMapping.className = 'field-mapping';
    sfMapping.innerHTML = `<span class="field-mapping-sf">SF: ${sfFieldName}</span>`;

    cardContent.appendChild(header);
    cardContent.appendChild(lsMapping);
    cardContent.appendChild(sfMapping);

    // Default value if exists
    if (defaultValue) {
      const defaultDiv = document.createElement('div');
      defaultDiv.className = 'field-default-value';
      defaultDiv.textContent = `Default: ${defaultValue}`;
      cardContent.appendChild(defaultDiv);
    }

    // Edit button for all fields
    const editBtn = document.createElement('button');
    editBtn.className = 'field-edit-btn';
    editBtn.title = 'Edit mapping';
    editBtn.onclick = function() { openEditFieldMapping(field.name); };
    editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
    </svg>`;

    // Delete button only for custom fields
    if (isCustomField) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'field-delete-btn';
      deleteBtn.title = 'Delete field';
      deleteBtn.onclick = function() { deleteCustomField(field.name); };
      deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>`;
      fieldCard.appendChild(deleteBtn);
    }

    // Assemble card
    fieldCard.appendChild(checkbox);
    fieldCard.appendChild(cardContent);
    fieldCard.appendChild(editBtn);

    fieldsGrid.appendChild(fieldCard);
  });
}

// Helper function to handle field toggle
window.handleFieldToggle = function(checkbox, fieldName) {
  window.fieldSelections[fieldName] = checkbox.checked;

  // Update the card's active/inactive class
  const card = checkbox.closest('.field-card');
  if (card) {
    if (checkbox.checked) {
      card.classList.remove('inactive');
    } else {
      card.classList.add('inactive');
    }

    // Update the status badge
    const statusBadge = card.querySelector('.badge.active, .badge.inactive');
    if (statusBadge) {
      statusBadge.className = checkbox.checked ? 'badge active' : 'badge inactive';
      statusBadge.textContent = checkbox.checked ? 'ACTIVE' : 'INACTIVE';
    }
  }
};

// Helper function to open edit field mapping modal
window.openEditFieldMapping = function(fieldName) {
  const field = window.configFields.find(f => f.name === fieldName);
  if (!field) return;

  const editModal = document.getElementById('editFieldMappingModal');
  document.getElementById('editLsFieldName').value = field.name;
  document.getElementById('editSfFieldName').value = field.sfFieldName || field.name;

  // Store current field name for saving
  window.currentEditingField = fieldName;

  editModal.classList.add('show');

  // Setup event handlers
  document.getElementById('closeEditFieldMappingBtn').onclick = closeEditFieldMapping;
  document.getElementById('cancelEditFieldMapping').onclick = closeEditFieldMapping;
  document.getElementById('saveEditFieldMapping').onclick = saveEditFieldMapping;
};

function closeEditFieldMapping() {
  document.getElementById('editFieldMappingModal').classList.remove('show');
  window.currentEditingField = null;
}

function saveEditFieldMapping() {
  const sfFieldName = document.getElementById('editSfFieldName').value.trim();
  if (!sfFieldName) {
    showToast('Salesforce field name is required', 'error');
    return;
  }

  // Update the field in configFields
  const field = window.configFields.find(f => f.name === window.currentEditingField);
  if (field) {
    field.sfFieldName = sfFieldName;
    // Re-render to show updated SF field name
    renderConfigFields(window.configFields, window.currentModalFilter || 'all');
    showToast('Field mapping updated successfully!', 'success');
  }

  closeEditFieldMapping();
}

// Helper function to delete custom field
window.deleteCustomField = async function(fieldName) {
  if (!confirm(`Are you sure you want to delete the custom field "${fieldName}"?`)) {
    return;
  }

  try {
    const eventId = sessionStorage.getItem('selectedEventId');

    // Remove from FieldMappingService
    await window.fieldMappingService.removeCustomField(eventId, fieldName);

    // Remove from configFields
    window.configFields = window.configFields.filter(f => f.name !== fieldName);

    // Re-render
    renderConfigFields(window.configFields, window.currentModalFilter || 'all');

    showToast('Custom field deleted successfully!', 'success');
  } catch (error) {
    console.error('Error deleting custom field:', error);
    showToast('Error deleting custom field', 'error');
  }
};

// Save field configuration
async function saveFieldConfiguration() {
  const eventId = sessionStorage.getItem('selectedEventId');
  const checkboxes = document.querySelectorAll('.field-card input[type="checkbox"]:checked');

  if (checkboxes.length === 0) {
    alert('Please select at least one field');
    return;
  }

  const selectedFields = Array.from(checkboxes).map(cb => cb.value);

  console.log(`💾 Saving ${selectedFields.length} selected fields`);

  // Configure fields in FieldMappingService
  selectedFields.forEach(fieldName => {
    window.fieldMappingService.setFieldConfig(fieldName, { active: true });
  });

  // Set eventId
  window.fieldMappingService.currentEventId = eventId;

  // Save to local storage
  window.fieldMappingService.saveConfig();

  // Bulk save to database
  try {
    const success = await window.fieldMappingService.bulkSaveToDatabase();

    if (success) {
      console.log('✅ Field configuration saved successfully');

      // Close modal
      document.getElementById('fieldConfigModal').classList.remove('show');

      // Load data with configured fields
      fetchLsLeadData();
    } else {
      alert('Failed to save field configuration');
    }
  } catch (error) {
    console.error('Error saving field configuration:', error);
    alert('Error saving field configuration');
  }
}

let lastSortedColumn = null;
let lastSortDirection = 'asc';
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

document.addEventListener('DOMContentLoaded', () => {
  // Display userName in header
  displayUserName();

  addTransferButton();

});


// Function to get the configured width of a column (dynamic if not in config)
function getColumnWidth(header, entity) {

  // Check if there is a configuration for this entity and column
  if (columnConfig[entity] && columnConfig[entity][header] !== undefined) {
    return columnConfig[entity][header];
  }

  // Return dynamic width for fields not in config (e.g., custom fields)
  // Status gets smaller width, most other fields get medium width
  if (header === 'Status') return '150px';
  if (header.includes('Id')) return '500px';
  if (header.includes('Date') || header === 'SystemModstamp') return '200px';
  if (header.includes('Description') || header.includes('Message')) return '600px';
  if (header.includes('Attachment')) return '800px';

  // Default width for custom fields and unknown fields
  return '300px';
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

  // Get all available fields from the data
  const allHeaders = Object.keys(data[0]).filter(header =>
    header !== '__metadata' && header !== 'KontaktViewId'
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

  const headerRow = document.createElement('tr');

  headersWithStatus.forEach((header, index) => {
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

    headersWithStatus.forEach(header => {
      const td = document.createElement('td');

      const width = getColumnWidth(header, 'LS_Lead');
      if (width) {
        td.style.width = width;
      }

      if (header === lastSortedColumn) {
        td.classList.add('active');
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
      } else if (header.includes('Date') || header === 'SystemModstamp') {
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
          td.textContent = item[header] || 'N/A';
        }
      }
      row.appendChild(td);
    });

    tableBody.appendChild(row);
  });

  initializeRowToggle();

  refreshTransferStatuses();
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


function resetLeadFilters(fields) {
  localStorage.removeItem('LS_Lead_Filters');
  
  fields.forEach(field => {
    const input = document.getElementById(`filter-${field}`);
    if (input) {
      input.value = '';
    }
  });
  
  // reset the filter button state
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

  // Add Change Field Mapping button handler - Redirects to configuration page
  const changeFieldMappingBtn = document.getElementById('changeFieldMappingBtn');
  if (changeFieldMappingBtn) {
    changeFieldMappingBtn.addEventListener('click', () => {
      const eventId = sessionStorage.getItem('selectedEventId');
      sessionStorage.setItem('selectedLeadSource', 'lead');
      window.location.href = `fieldConfigurator.html?eventId=${eventId}&source=lead`;
    });
  }

    addTransferButton();


  pagination.initPagination();

  checkFieldMappingAndLoad();
  displayLeadFilters();
  initializeRowToggle();
});

const backButton = document.getElementById('backButton');
backButton.addEventListener('click', () => {
  window.location.href = 'display.html';
});

// ========================================
// Custom Field Management Functions
// ========================================

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
  // Remove existing toast if any
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-message">${message}</div>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;

  document.body.appendChild(toast);

  // Auto remove after 3 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.remove();
    }
  }, 3000);
}

/**
 * Open custom field modal
 */
function openAddCustomFieldModal() {
  const customFieldModal = document.getElementById('customFieldModal');
  if (customFieldModal) {
    customFieldModal.classList.add('show');
    // Clear previous values
    document.getElementById('customFieldName').value = '';
    document.getElementById('customFieldValue').value = '';
  }

  // Setup event handlers
  const closeBtn = document.getElementById('closeCustomFieldModalBtn');
  const cancelBtn = document.getElementById('cancelCustomField');
  const saveBtn = document.getElementById('saveCustomFieldBtn');

  if (closeBtn) {
    closeBtn.onclick = closeCustomFieldModal;
  }
  if (cancelBtn) {
    cancelBtn.onclick = closeCustomFieldModal;
  }
  if (saveBtn) {
    saveBtn.onclick = saveCustomField;
  }
}

/**
 * Close custom field modal
 */
function closeCustomFieldModal() {
  const customFieldModal = document.getElementById('customFieldModal');
  if (customFieldModal) {
    customFieldModal.classList.remove('show');
  }
}

/**
 * Save custom field
 */
async function saveCustomField() {
  const fieldName = document.getElementById('customFieldName').value.trim();
  const fieldValue = document.getElementById('customFieldValue').value.trim();

  if (!fieldName) {
    showToast('Field name is required', 'error');
    return;
  }

  // Validate field name (no spaces, no special characters except underscore)
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(fieldName)) {
    showToast('Invalid field name. Use only letters, numbers, and underscores. Must start with a letter.', 'error');
    return;
  }

  // Check if field name already exists
  const allFields = window.configFields || [];
  if (allFields.some(f => f.name === fieldName)) {
    showToast('A field with this name already exists', 'error');
    return;
  }

  try {
    const eventId = sessionStorage.getItem('selectedEventId');

    // Add custom field using FieldMappingService (without __c suffix)
    await window.fieldMappingService.addCustomField(eventId, {
      sfFieldName: fieldName,
      defaultValue: fieldValue,
      active: true
    });

    console.log(`✅ Custom field "${fieldName}" added successfully`);

    // Close the custom field modal
    closeCustomFieldModal();

    // Reload the field configuration dialog with updated fields
    const updatedFields = [...allFields, {
      name: fieldName,
      type: 'Edm.String',
      nullable: true,
      isCustom: true
    }];

    window.configFields = updatedFields;

    // Re-render with current filter
    renderConfigFields(updatedFields, window.currentModalFilter || 'custom');

    // Show success message
    showToast('Custom field added successfully!', 'success');

  } catch (error) {
    console.error('Error saving custom field:', error);
    showToast('Error saving custom field. Please try again.', 'error');
  }
}

