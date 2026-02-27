import ApiService from "../services/apiService.js";
import { appConfig } from "../config/salesforceConfig.js";
import {formatDate, setupPagination, formatDateForOData, escapeODataValue} from "../utils/helper.js";

const REQUIRED_FIELDS = ['LastName', 'Company'];
const DEFAULT_ACTIVE_FIELDS = [
    'FirstName', 'LastName', 'Email', 'Company', 'Phone', 'MobilePhone',
    'Street', 'City', 'PostalCode', 'State', 'Country',
    'Title', 'Industry', 'Description'
];

const serverName = sessionStorage.getItem("serverName");
const apiName = sessionStorage.getItem("apiName");
const credentials = sessionStorage.getItem("credentials");

if (!serverName || !apiName || !credentials) {
  window.location.href = "/index.html";
}

const apiService = new ApiService(serverName, apiName);
console.log("API Service initialized with server:", serverName, "and API:", apiName, "apiService:", apiService);
let nextUrl = "";

// Column size classes: col-xs (tiny), col-sm (small), col-md (medium), col-lg (large), col-xl (extra large)
// Sizes are applied via CSS classes instead of fixed px widths
const COLUMN_SIZE_OVERRIDES = {
    // XS - tiny columns (numbers, codes, flags)
    ExportAttempts: 'col-xs', IsReviewed: 'col-xs', CountryCode: 'col-xs',
    IsIncomplete: 'col-xs', QuestionnaireEmpty: 'col-xs', QuestionnaireIncomplete: 'col-xs',
    // SM - small columns (short text)
    Salutation: 'col-sm', Suffix: 'col-sm', DeviceId: 'col-sm', DeviceRecordId: 'col-sm',
    // MD - medium columns (status, city, dates, postal)
    LastExportStatus: 'col-md', LastExportTimestamp: 'col-md',
    PostalCode: 'col-md', State: 'col-md', Country: 'col-md', City: 'col-md',
    // LG - large columns
    Company: 'col-lg', Email: 'col-lg', LastExportMessage: 'col-lg',
    // XL - extra large columns
    Description: 'col-xl', AttachmentIdList: 'col-xl',
};

const pagination = setupPagination(apiService, displayData);

// Fetch and parse $metadata to get field structure
async function fetchMetadata(entityType = 'LS_LeadReport') {
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

    // Find the EntityType for LS_LeadReport
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
  'State', 'StateCode', 'Street', 'Suffix', 'Title', 'Website',
  'Id', 'CreatedDate', 'LastModifiedDate', 'SystemModstamp'
];

// Check if field mapping configuration exists
async function hasFieldMappingConfig(eventId) {
  try {
    if (!eventId) {
      console.log('❌ hasFieldMappingConfig: No eventId provided');
      return false;
    }

    console.log(`🔎 Loading field mappings for EventId: ${eventId}`);
    await window.fieldMappingService.loadFieldMappingsFromAPI(eventId);
    const activeFields = window.fieldMappingService.getActiveFieldNames();

    const hasConfig = activeFields.length > 0;
    console.log(`📊 Field mapping config exists: ${hasConfig} (active fields: ${activeFields.length})`);

    return hasConfig;
  } catch (error) {
    console.error('❌ Error checking field mapping config:', error);
    return false;
  }
}

// Check if contacts exist for the event
async function hasContactsForEvent(eventId) {
  try {
    if (!eventId) {
      console.log('❌ hasContactsForEvent: No eventId provided');
      return false;
    }

    const endpoint = `LS_LeadReport?$filter=EventId eq '${eventId}'&$top=1&$format=json`;
    console.log(`🔎 Checking contacts with endpoint: ${endpoint}`);

    const response = await apiService.request('GET', endpoint);
    console.log('📡 Response from API:', response);

    const hasContacts = !!(response && response.d && response.d.results && response.d.results.length > 0);
    console.log(`📊 Contacts found: ${hasContacts} (count: ${response?.d?.results?.length || 0})`);

    return hasContacts;
  } catch (error) {
    console.error('❌ Error checking contacts:', error);
    return false;
  }
}

// Loading overlay helpers
function showPageLoading(message = 'Loading data...') {
  let overlay = document.querySelector('.page-loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'page-loading-overlay';
    overlay.innerHTML = `<div class="spinner"></div><p>${message}</p>`;
    const main = document.querySelector('main.table');
    if (main) main.appendChild(overlay);
  }
}

function hidePageLoading() {
  const overlay = document.querySelector('.page-loading-overlay');
  if (overlay) overlay.remove();
}

// Check if field mapping exists, if not show configuration dialog
async function checkFieldMappingAndLoad() {
  const eventId = sessionStorage.getItem('selectedEventId');
  if (!eventId) {
    alert('No EventId provided.');
    window.location.href = 'display.html';
    return;
  }

  showPageLoading('Loading field configuration...');

  try {
    // Check if we're in virtual mode (coming from fieldConfigurator with fake data)
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');

    if (mode === 'virtual') {
      // 🧪 VIRTUAL MODE: Load fake data from sessionStorage
      console.log('🧪 Virtual mode detected - loading fake data from sessionStorage');
      hidePageLoading();
      loadVirtualData();
      return;
    }

    // 🔍 Step 1: FIRST check if contacts exist for this event
    console.log('🔍 Step 1: Checking if contacts exist for this event...');
    const contactsExist = await hasContactsForEvent(eventId);

    if (!contactsExist) {
      // ❌ NO CONTACTS → Redirect to fieldConfigurator in virtual mode
      console.log('⚠️ No contacts found for this event');
      console.log('🧪 Redirecting to Field Configurator in virtual mode (no real contacts to display)');
      hidePageLoading();

      // Redirect to fieldConfigurator.html in virtual mode
      window.location.href = `fieldConfigurator.html?mode=virtual&eventId=${eventId}&entityType=LS_LeadReport`;
      return;
    }

    // ✅ CONTACTS EXIST → Check field mapping and load real data
    console.log('✅ Contacts found for this event');
    console.log('🔍 Step 2: Checking if field mapping configuration exists...');

    const configExists = await hasFieldMappingConfig(eventId);

    if (!configExists) {
      // No field mapping configured yet → Redirect to fieldConfigurator in normal mode
      console.log('⚠️ No field mapping found, redirecting to Field Configurator (normal mode)');
      hidePageLoading();
      window.location.href = `fieldConfigurator.html?eventId=${eventId}&entityType=LS_LeadReport`;
      return;
    }

    // ✅ Step 3: Field mapping exists and contacts exist - load normally
    console.log('✅ Field mapping configuration exists');
    console.log('📊 Loading real contact data...');

    // Load field mapping from database
    await window.fieldMappingService.loadFieldMappingsFromAPI(eventId);
    const activeFields = window.fieldMappingService.getActiveFieldNames();

    console.log(`📋 Active fields found: ${activeFields.length}`);

    // Proceed with normal data loading
    await fetchLsLeadReportData();
    hidePageLoading();

  } catch (error) {
    console.error('❌ Error in checkFieldMappingAndLoad:', error);
    hidePageLoading();
    if (window.batchTransferModals && window.batchTransferModals.showAlertModal) {
      await window.batchTransferModals.showAlertModal('Error loading field configuration. Please try again.', { title: 'Error', okColor: '#dc2626' });
    } else {
      alert('Error loading field configuration. Please try again.');
    }
  }
}

// Show virtual data configuration modal (when no contacts exist)
async function showVirtualDataConfiguration(eventId) {
  try {
    console.log('🧪 Initializing Virtual Data Modal...');

    // Check if VirtualDataModal class is available
    if (!window.VirtualDataModal) {
      console.error('❌ VirtualDataModal class not found');
      alert('Virtual Data Modal not available. Please refresh the page.');
      return;
    }

    // Create instance of VirtualDataModal
    const virtualModal = new window.VirtualDataModal(window.fieldMappingService);

    // Store globally for access from modal callbacks
    window.virtualDataModal = virtualModal;

    // Show the modal
    await virtualModal.show(eventId, 'LS_LeadReport');

    console.log('✅ Virtual Data Modal displayed');

  } catch (error) {
    console.error('❌ Error showing virtual data configuration:', error);
    alert('Error showing test data configuration. Please try again.');
  }
}

// Load virtual test data from sessionStorage (Virtual Mode)
function loadVirtualData() {
  try {
    console.log('🧪 Loading virtual data from sessionStorage...');

    // Get virtual test data from sessionStorage
    const virtualTestDataStr = sessionStorage.getItem('virtualTestData');
    const activeFieldsStr = sessionStorage.getItem('virtualTestDataActiveFields');

    if (!virtualTestDataStr) {
      console.error('❌ No virtual test data found in sessionStorage');
      alert('No test data available. Please configure test data first.');
      window.location.href = 'display.html';
      return;
    }

    const virtualData = JSON.parse(virtualTestDataStr);
    const activeFields = activeFieldsStr ? JSON.parse(activeFieldsStr) : Object.keys(virtualData);

    console.log('💾 Virtual data loaded:', virtualData);
    console.log('📋 Active fields:', activeFields);

    // Create a mock lead report object with virtual data
    const mockLeadReport = {
      Id: 'VIRTUAL_TEST_' + Date.now(),
      ...virtualData,
      __metadata: { type: 'LS_LeadReport' }
    };

    // Set active field names in FieldMappingService for filtering
    if (window.fieldMappingService && activeFields) {
      // Use setFieldConfigLocal (not setFieldConfig) to avoid API calls in virtual mode
      activeFields.forEach(fieldName => {
        window.fieldMappingService.setFieldConfigLocal(fieldName, {
          active: true,
          fieldName: fieldName
        });
      });

      console.log('✅ Configured active fields in FieldMappingService (local only)');
    }

    // Display virtual data in table with all active fields visible
    displayData([mockLeadReport], false);

    console.log('✅ Virtual test data displayed in table');

  } catch (error) {
    console.error('❌ Error loading virtual data:', error);
    alert('Error loading test data. Please try again.');
    window.location.href = 'display.html';
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
  // Load custom fields from FieldMappingService and combine with API fields
  const customFields = window.fieldMappingService.getAllCustomFields();
  console.log('📋 Loading custom fields for modal:', customFields);

  const mappedCustomFields = customFields
    .filter(cf => {
      const hasValidName = !!(cf.sfFieldName || cf.fieldName || cf.name);
      if (!hasValidName) {
        console.warn('⚠️ Skipping custom field without name:', cf);
      }
      return hasValidName;
    })
    .map(cf => ({
      id: cf.id,
      name: cf.sfFieldName || cf.fieldName || cf.name,
      value: cf.value || '',
      isCustom: true,
      active: cf.active !== false
    }));

  // Combine API fields + custom fields
  window.configFields = [...fields, ...mappedCustomFields];
  console.log(`✅ Modal loaded with ${fields.length} API fields and ${mappedCustomFields.length} custom fields`);

  window.fieldSelections = {}; // Track selections across re-renders
  window.currentModalFilter = 'active'; // Track current filter - default to Active Fields

  // Render fields with current filter
  renderConfigFields(window.configFields, 'active'); // Start with Active Fields

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

      // Apply filter - CRITICAL: use window.configFields (includes custom fields) instead of local 'fields' variable
      renderConfigFields(window.configFields, window.currentModalFilter);
    };
  });

  // Search functionality - preserve selections and respect filter
  newSearchInput.addEventListener('input', (e) => {
    // Save current selections before re-rendering
    saveCurrentSelections();

    const searchTerm = e.target.value.toLowerCase();
    // CRITICAL: use window.configFields (includes custom fields) instead of local 'fields' variable
    const filtered = window.configFields.filter(f =>
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

      // Determine active state: check fieldSelections first, then field.active (for custom), then field.isStandardActive (for API)
      let isActive;
      if (window.fieldSelections && window.fieldSelections.hasOwnProperty(field.name)) {
        isActive = window.fieldSelections[field.name];
      } else if (isCustomField) {
        isActive = field.active !== false; // Custom fields have 'active' property
      } else {
        isActive = isRequired || field.isStandardActive === true; // API fields
      }

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

    // Determine if field is checked: check fieldSelections first, then field.active (for custom), then field.isStandardActive (for API)
    let isChecked;
    if (window.fieldSelections && window.fieldSelections.hasOwnProperty(field.name)) {
      isChecked = window.fieldSelections[field.name];
    } else if (isCustomField) {
      isChecked = field.active !== false; // Custom fields have 'active' property
    } else {
      isChecked = isRequired || field.isStandardActive === true; // API fields
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
      deleteBtn.onclick = function() { deleteCustomField(field.id || field.name); };
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
window.handleFieldToggle = async function(checkbox, fieldName) {
  window.fieldSelections[fieldName] = checkbox.checked;

  // CRITICAL: Also update the field.active property in window.configFields for custom fields
  const field = window.configFields.find(f => f.name === fieldName);
  if (field && field.isCustom) {
    field.active = checkbox.checked;
    console.log(`✅ Updated custom field "${fieldName}" active state to ${checkbox.checked}`);

    // CRITICAL: Save to FieldMappingService to persist the change
    try {
      await window.fieldMappingService.updateCustomField(field.id, {
        active: checkbox.checked
      });
      console.log(`💾 Saved custom field "${fieldName}" active state to FieldMappingService`);
    } catch (error) {
      console.error('Failed to save custom field active state:', error);
      // Revert UI on error
      checkbox.checked = !checkbox.checked;
      field.active = !checkbox.checked;
      showToast('Failed to update field state', 'error');
      return;
    }
  }

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
window.deleteCustomField = async function(fieldIdOrName) {
  // Find the field to get its name for confirmation
  const field = window.configFields.find(f => f.id === fieldIdOrName || f.name === fieldIdOrName);
  if (!field) {
    showToast('Field not found', 'error');
    return;
  }

  if (!confirm(`Are you sure you want to delete the custom field "${field.name}"?`)) {
    return;
  }

  try {
    // Remove from FieldMappingService using the field ID
    const fieldId = field.id || fieldIdOrName;
    await window.fieldMappingService.deleteCustomField(fieldId);

    // Remove from configFields
    window.configFields = window.configFields.filter(f => f.id !== fieldId && f.name !== field.name);

    // Re-render
    renderConfigFields(window.configFields, window.currentModalFilter || 'active');

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
      fetchLsLeadReportData();
    } else {
      alert('Failed to save field configuration');
    }
  } catch (error) {
    console.error('Error saving field configuration:', error);
    alert('Error saving field configuration');
  }
}

let lastSortedColumn = null;
let lastSortDirection = "asc";
let selectedRowItem = null;

// Loading indicator functions
function showLoadingIndicator() {
  const loadingIndicator = document.getElementById('loadingIndicator');
  if (loadingIndicator) {
    loadingIndicator.classList.add('show');
    loadingIndicator.style.display = 'flex';
  }
}

function hideLoadingIndicator() {
  const loadingIndicator = document.getElementById('loadingIndicator');
  if (loadingIndicator) {
    loadingIndicator.classList.remove('show');
    loadingIndicator.style.display = 'none';
  }
}

// Auto-load all data recursively
async function autoLoadNextData() {
  try {
    // Call loadNextRows which will automatically update nextUrl
    await pagination.loadNextRows();

    // After loading, check if there's still more data
    const nextButton = document.getElementById('nextButton');
    if (nextButton && !nextButton.disabled) {
      // There's more data, continue loading
      await autoLoadNextData();
    } else {
      // No more data, hide loading indicator
      hideLoadingIndicator();
    }
  } catch (error) {
    console.error("Error auto-loading next rows:", error);
    hideLoadingIndicator();
  }
}

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
      : 'https://lsapisfbackend.convey.de/';

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

      // Update pagination and auto-load all remaining data
      const nextUrl = pagination.updateNextUrl(data);

      // Auto-load all remaining data
      if (nextUrl) {
        showLoadingIndicator();
        await autoLoadNextData();
      }
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
      : 'https://lsapisfbackend.convey.de';

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
function getColumnSizeClass(header) {
  // Check explicit overrides first
  if (COLUMN_SIZE_OVERRIDES[header]) return COLUMN_SIZE_OVERRIDES[header];

  // Auto-detect by field name patterns
  if (header.includes('Id') || header.includes('Barcode')) return 'col-lg';
  if (header.includes('Date') || header === 'SystemModstamp' || header.includes('Timestamp')) return 'col-sm';
  if (header.includes('Description') || header.includes('Attachment')) return 'col-xl';
  if (header.includes('Message') || header.includes('Status')) return 'col-lg';

  // Default
  return 'col-lg';
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

  // Build filter fields dynamically from active field config
  const DATE_FIELD_PATTERNS = ["Date", "Timestamp", "Modstamp"];
  const ALWAYS_EXCLUDE_FROM_FILTER = new Set([
    '__metadata', 'LastExportStatus', 'LastExportTimestamp', 'LastExportMilliseconds',
    'LastExportMessage', 'ExportAttempts'
  ]);
  let allActiveFields = [];
  if (window.fieldMappingService) {
    allActiveFields = window.fieldMappingService.getActiveFieldNames()
      .filter(f => !ALWAYS_EXCLUDE_FROM_FILTER.has(f));
  }
  // Fallback if no config loaded yet
  if (allActiveFields.length === 0) {
    allActiveFields = ["FirstName", "LastName", "Company", "Email"];
  }
  const textFields = allActiveFields.filter(f => !DATE_FIELD_PATTERNS.some(p => f.includes(p)));
  const dateFields = allActiveFields.filter(f => DATE_FIELD_PATTERNS.some(p => f.includes(p)));

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

  // Show toggle button when filters are available
  const toggleButton = document.getElementById('toggleFiltersButton');
  if (toggleButton) {
    toggleButton.style.display = 'flex';
  }
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

  // Export status columns - always visible when present in data
  const EXPORT_STATUS_FIELDS = ['LastExportStatus', 'LastExportTimestamp', 'ExportAttempts', 'LastExportMessage'];

  // Filter to show only active fields
  const headers = allHeaders.filter(header => {
    // Always show required fields
    if (header === 'LastName' || header === 'Company') return true;
    // Always show export status fields
    if (EXPORT_STATUS_FIELDS.includes(header)) return true;
    // Check if field is in active configuration
    return activeFieldNames.includes(header);
  });

  // Add custom fields at the end (avoid duplicates)
  const headersWithCustom = [...headers];
  activeCustomFields.forEach(customField => {
    // Only add if not already in headers
    if (!headersWithCustom.includes(customField.sfFieldName)) {
      headersWithCustom.push(customField.sfFieldName);
    }
  });

  if (!append) {
    const headerRow = document.createElement("tr");

    // Checkbox column header (Select All)
    const thCheckbox = document.createElement("th");
    thCheckbox.className = "col-checkbox";
    thCheckbox.style.position = "sticky";
    thCheckbox.style.top = "0";
    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    selectAllCheckbox.id = "selectAllCheckbox";
    selectAllCheckbox.title = "Select All";
    selectAllCheckbox.addEventListener("change", (e) => {
      const checkboxes = document.querySelectorAll("tbody .batch-checkbox");
      checkboxes.forEach(cb => { cb.checked = e.target.checked; });
      updateBatchSelectionCount();
    });
    thCheckbox.appendChild(selectAllCheckbox);
    headerRow.appendChild(thCheckbox);

    headersWithCustom.forEach((header, index) => {
      const th = document.createElement("th");

      th.classList.add(getColumnSizeClass(header));

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
      // +1 offset because checkbox column is index 0
      th.addEventListener("click", () => sortTable(index + 1, th));
      headerRow.appendChild(th);
    });

    tableHead.appendChild(headerRow);
  }

  // Populate table body
  data.forEach((item) => {
    const row = document.createElement("tr");

    // Row tinting based on export status
    const exportStatus = item.LastExportStatus;
    if (exportStatus === 'Success') row.classList.add('export-row-success');
    else if (exportStatus === 'Failed') row.classList.add('export-row-failed');
    else if (exportStatus === 'Duplicate') row.classList.add('export-row-duplicate');

    // Checkbox cell
    const tdCheckbox = document.createElement("td");
    tdCheckbox.className = "col-checkbox";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "batch-checkbox";
    checkbox.addEventListener("click", (e) => {
      e.stopPropagation(); // Don't trigger row selection
      updateBatchSelectionCount();
    });
    tdCheckbox.appendChild(checkbox);
    row.appendChild(tdCheckbox);

    let isFirstCell = true;

    headersWithCustom.forEach((header) => {
      const td = document.createElement("td");

      td.classList.add(getColumnSizeClass(header));

      if (header === lastSortedColumn) {
        td.classList.add("active");
      }

      // First visible cell: add export status badge dot
      if (isFirstCell) {
        isFirstCell = false;
        const text = item[header] != null ? item[header] : '';
        if (exportStatus) {
          const badge = document.createElement("span");
          badge.className = "export-badge";
          const dot = document.createElement("span");
          dot.className = "export-badge-dot";
          if (exportStatus === 'Success') dot.classList.add('dot-success');
          else if (exportStatus === 'Failed') dot.classList.add('dot-failed');
          else if (exportStatus === 'Duplicate') dot.classList.add('dot-duplicate');
          badge.appendChild(dot);
          badge.appendChild(document.createTextNode(text));
          td.appendChild(badge);
        } else {
          td.textContent = text;
        }
      // Handle export status columns
      } else if (header === 'LastExportStatus') {
        if (exportStatus) {
          td.textContent = exportStatus;
          if (exportStatus === 'Success') td.classList.add('export-status-success');
          else if (exportStatus === 'Failed') td.classList.add('export-status-failed');
          else if (exportStatus === 'Duplicate') td.classList.add('export-status-duplicate');
          else td.classList.add('export-status-other');
        }
      } else if (header === 'LastExportTimestamp') {
        const val = item[header];
        td.textContent = val ? formatDate(val) : '';
      } else if (header === 'ExportAttempts') {
        const attempts = item[header];
        if (attempts != null && attempts > 0) {
          td.textContent = attempts;
          td.classList.add('export-col-attempts');
        }
      } else if (header === 'LastExportMessage') {
        const msg = item[header] || '';
        td.textContent = msg.length > 80 ? msg.substring(0, 80) + '...' : msg;
        if (msg.length > 80) td.title = msg;
      // Handle Date columns
      } else if (header.includes("Date") || header === "SystemModstamp") {
        td.textContent = formatDate(item[header]);
      } else {
        // Check if this is a custom field
        const customField = activeCustomFields.find(f => f.sfFieldName === header);
        if (customField) {
          td.textContent = item[header] || customField.value || '';
          td.style.fontStyle = 'italic';
          td.style.color = '#8b5cf6';
        } else {
          td.textContent = item[header] != null ? item[header] : '';
        }
      }
      row.appendChild(td);
    });

    // Store the full OData item on the row (includes Id, __metadata, KontaktViewId, etc.)
    row._itemData = item;

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
  // Use stored OData data (includes Id, __metadata, KontaktViewId, etc.)
  const item = row._itemData || getItemFromRow(row);

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

// Add Batch Transfer button next to the Transfer button
function addBatchTransferButton() {
  if (document.getElementById('batchTransferButton')) return;

  const batchButton = document.createElement("button");
  batchButton.id = "batchTransferButton";
  batchButton.className = "action-button batch-transfer-button";
  batchButton.disabled = true;
  batchButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17 1l4 4-4 4"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <path d="M7 23l-4-4 4-4"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
    <span>Batch Transfer (0)</span>
  `;

  batchButton.addEventListener("click", handleBatchTransferClick);

  // Insert after the transfer button
  const transferButton = document.getElementById("transferButton");
  if (transferButton && transferButton.parentNode) {
    transferButton.parentNode.insertBefore(batchButton, transferButton.nextSibling);
  } else {
    // Fallback: insert in actions container
    const actionsContainer = document.querySelector('.actions');
    if (actionsContainer) actionsContainer.appendChild(batchButton);
  }
}

// Update batch selection count and button state
function updateBatchSelectionCount() {
  const checkboxes = document.querySelectorAll("tbody .batch-checkbox:checked");
  const count = checkboxes.length;
  const batchButton = document.getElementById("batchTransferButton");

  if (batchButton) {
    batchButton.querySelector("span").textContent = `Batch Transfer (${count})`;
    batchButton.disabled = count < 2;
  }

  // Update Select All checkbox state
  const selectAll = document.getElementById("selectAllCheckbox");
  if (selectAll) {
    const total = document.querySelectorAll("tbody .batch-checkbox").length;
    selectAll.checked = total > 0 && count === total;
    selectAll.indeterminate = count > 0 && count < total;
  }
}

// Handle batch transfer button click
async function handleBatchTransferClick() {
  const modals = window.batchTransferModals;

  // Collect checked items
  const checkedRows = [];
  const rows = document.querySelectorAll("tbody tr");
  rows.forEach(row => {
    const checkbox = row.querySelector(".batch-checkbox");
    if (checkbox && checkbox.checked && row._itemData) {
      checkedRows.push(row._itemData);
    }
  });

  if (checkedRows.length < 2) {
    await modals.showAlertModal("Please select at least 2 leads for batch transfer.", { title: 'Selection Required' });
    return;
  }

  // Check Salesforce connection
  const connectionStatus = localStorage.getItem('sf_connection_status');
  if (connectionStatus !== 'connected') {
    await modals.showAlertModal("Please connect to Salesforce first using the Transfer button.", { title: 'Not Connected', color: '#f59e0b' });
    return;
  }

  // Confirm
  const confirmed = await modals.showConfirmModal(
    `Transfer ${checkedRows.length} leads to Salesforce?\n\nThis will process them sequentially.`,
    { title: 'Batch Transfer', okText: 'Transfer', okColor: '#2563eb' }
  );
  if (!confirmed) return;

  // Ensure batch services are available
  if (!window.batchTransferService) {
    await modals.showAlertModal("Batch transfer service not loaded. Please refresh the page.", { title: 'Error', color: '#ef4444' });
    return;
  }

  // Show progress modal
  const progressModal = modals.showBatchProgressModal(checkedRows.length);

  // Disable batch button during transfer
  const batchButton = document.getElementById("batchTransferButton");
  if (batchButton) batchButton.disabled = true;

  try {
    const summary = await window.batchTransferService.executeBatchTransfer(checkedRows, {
      fieldMappingService: window.fieldMappingService,
      apiBaseUrl: appConfig.apiBaseUrl,
      onProgress: (current, total, leadName) => {
        progressModal.updateProgress(current, total, leadName);
      },
      onLeadComplete: (result) => {
        progressModal.updateLeadStatus(result);
      }
    });

    // Close progress, show summary
    progressModal.close();
    modals.showBatchSummaryModal(summary);

    // Update row tinting for transferred leads
    refreshRowTintingAfterBatch(summary.results);

    // Uncheck all checkboxes
    document.querySelectorAll("tbody .batch-checkbox").forEach(cb => { cb.checked = false; });
    const selectAll = document.getElementById("selectAllCheckbox");
    if (selectAll) { selectAll.checked = false; selectAll.indeterminate = false; }
    updateBatchSelectionCount();

  } catch (error) {
    progressModal.close();
    await modals.showAlertModal("Batch transfer error: " + error.message, { title: 'Transfer Error', color: '#ef4444' });
    console.error("Batch transfer error:", error);
  }
}

// Refresh row tinting after batch transfer (without full page reload)
function refreshRowTintingAfterBatch(results) {
  const rows = document.querySelectorAll("tbody tr");

  results.forEach(result => {
    if (!result.itemData) return;
    const itemId = result.itemData.Id || result.itemData.KontaktViewId;
    if (!itemId) return;

    // Find matching row
    rows.forEach(row => {
      if (!row._itemData) return;
      const rowId = row._itemData.Id || row._itemData.KontaktViewId;
      if (rowId !== itemId) return;

      // Remove old tinting
      row.classList.remove('export-row-success', 'export-row-failed', 'export-row-duplicate');

      // Apply new tinting
      if (result.status === 'success') row.classList.add('export-row-success');
      else if (result.status === 'failed') row.classList.add('export-row-failed');
      else if (result.status === 'duplicate') row.classList.add('export-row-duplicate');

      // Update _itemData export fields
      if (result.status !== 'skipped') {
        row._itemData.LastExportStatus = result.status === 'success' ? 'Success' :
          result.status === 'duplicate' ? 'Duplicate' : 'Failed';
      }

      // Update badge dot in first data cell (skip checkbox cell)
      const firstDataCell = row.cells[1];
      if (firstDataCell && result.status !== 'skipped') {
        const existingBadge = firstDataCell.querySelector('.export-badge');
        if (existingBadge) {
          const dot = existingBadge.querySelector('.export-badge-dot');
          if (dot) {
            dot.className = 'export-badge-dot';
            if (result.status === 'success') dot.classList.add('dot-success');
            else if (result.status === 'failed') dot.classList.add('dot-failed');
            else if (result.status === 'duplicate') dot.classList.add('dot-duplicate');
          }
        } else {
          // Create badge if not existing
          const text = firstDataCell.textContent;
          firstDataCell.textContent = '';
          const badge = document.createElement("span");
          badge.className = "export-badge";
          const dot = document.createElement("span");
          dot.className = "export-badge-dot";
          if (result.status === 'success') dot.classList.add('dot-success');
          else if (result.status === 'failed') dot.classList.add('dot-failed');
          else if (result.status === 'duplicate') dot.classList.add('dot-duplicate');
          badge.appendChild(dot);
          badge.appendChild(document.createTextNode(text));
          firstDataCell.appendChild(badge);
        }
      }
    });
  });
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

// ========================================
// Salesforce Connection Management
// ========================================

function updateSfConnectionUI(status, userName) {
  const statusEl = document.getElementById('sfConnectionStatus');
  const connectBtn = document.getElementById('sfConnectBtn');
  if (!statusEl || !connectBtn) return;

  const text = statusEl.querySelector('.sf-status-text');

  // Reset classes
  statusEl.className = 'sf-status';

  if (status === 'connected') {
    statusEl.classList.add('sf-status-connected');
    text.textContent = userName || 'Connected';
    connectBtn.textContent = 'Disconnect';
    connectBtn.classList.add('connected');
    connectBtn.disabled = false;
    connectBtn.title = 'Disconnect from Salesforce';
  } else if (status === 'connecting') {
    statusEl.classList.add('sf-status-connecting');
    text.textContent = 'Verifying...';
    connectBtn.disabled = true;
  } else {
    statusEl.classList.add('sf-status-disconnected');
    text.textContent = 'Not connected';
    connectBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
      </svg>
      Connect SF`;
    connectBtn.classList.remove('connected');
    connectBtn.disabled = false;
    connectBtn.title = 'Connect to Salesforce';
  }
}

async function checkSfConnection() {
  try {
    // Show connecting state from persisted data if available
    const connectionStr = localStorage.getItem('sf_user_info');
    if (connectionStr) {
      const connection = JSON.parse(connectionStr);
      if (connection.status === 'connected' && connection.expiresAt > Date.now()) {
        const name = connection.userInfo?.display_name || connection.userInfo?.username || 'Connected';
        updateSfConnectionUI('connecting', name);
      }
    }

    // Always verify with backend (handles both persisted and fresh OAuth)
    const orgId = localStorage.getItem('orgId') || 'default';
    const response = await fetch(`${appConfig.apiBaseUrl}/salesforce/check`, {
      method: 'GET', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Org-Id': orgId }
    });

    if (response.ok) {
      const data = await response.json();
      const userInfo = data.userInfo || data;
      const displayName = userInfo.display_name || userInfo.username;

      if (displayName) {
        // Store tokens
        if (data.tokens) {
          localStorage.setItem('sf_access_token', data.tokens.access_token);
          localStorage.setItem('sf_instance_url', data.tokens.instance_url);
        }

        // Persist connection (same format as ConnectionPersistenceManager)
        localStorage.setItem('sf_connection_status', 'connected');
        localStorage.setItem('sf_connected_at', Date.now().toString());
        localStorage.setItem('sf_user_info', JSON.stringify({
          status: 'connected',
          userInfo: userInfo,
          orgId: orgId,
          connectedAt: Date.now(),
          expiresAt: Date.now() + 24 * 60 * 60 * 1000
        }));

        updateSfConnectionUI('connected', displayName);
        return;
      }
    }

    // Not connected
    updateSfConnectionUI('not-connected');
  } catch (error) {
    console.warn('SF connection check failed:', error);
    updateSfConnectionUI('not-connected');
  }
}

function handleSfConnectClick() {
  const connectBtn = document.getElementById('sfConnectBtn');
  if (!connectBtn) return;

  // If connected → disconnect
  if (connectBtn.classList.contains('connected')) {
    localStorage.removeItem('sf_connection_status');
    localStorage.removeItem('sf_user_info');
    localStorage.removeItem('sf_connected_at');
    localStorage.removeItem('sf_access_token');
    localStorage.removeItem('sf_instance_url');
    localStorage.removeItem('orgId');
    updateSfConnectionUI('not-connected');
    return;
  }

  // Connect → open OAuth popup
  const orgId = localStorage.getItem('orgId') || 'default';
  const authUrl = `${appConfig.apiBaseUrl.replace('/api', '/auth/salesforce')}?orgId=${encodeURIComponent(orgId)}`;
  const popup = window.open(authUrl, 'salesforce-auth', 'width=500,height=650,scrollbars=no,resizable=no');

  if (!popup) {
    if (window.batchTransferModals?.showAlertModal) {
      window.batchTransferModals.showAlertModal('Popup blocked. Please allow popups for this site.', { title: 'Popup Blocked' });
    }
    return;
  }

  updateSfConnectionUI('connecting');

  let authHandled = false;

  const messageListener = (event) => {
    if (event.data?.type === 'SALESFORCE_AUTH_SUCCESS' && !authHandled) {
      authHandled = true;
      console.log('SF OAuth success:', event.data);
      if (event.data.orgId) localStorage.setItem('orgId', event.data.orgId);
      popup.close();
      clearInterval(checkClosed);
      window.removeEventListener('message', messageListener);
      checkSfConnection();
    }
  };

  window.addEventListener('message', messageListener);

  const checkClosed = setInterval(() => {
    if (popup.closed) {
      clearInterval(checkClosed);
      window.removeEventListener('message', messageListener);
      if (!authHandled) {
        authHandled = true;
        checkSfConnection();
      }
    }
  }, 1000);
}

function initSfConnection() {
  const connectBtn = document.getElementById('sfConnectBtn');
  if (connectBtn) {
    connectBtn.addEventListener('click', handleSfConnectClick);
  }
  checkSfConnection();
}

function init() {
  // Display userName in header
  displayUserName();

  // Initialize SF connection UI
  initSfConnection();

  checkFieldMappingAndLoad();

  // Setup back button
  const backButton = document.getElementById("backButton");
  if (backButton) {
    backButton.addEventListener("click", () => {
      window.location.href = "display.html";
    });
  }

  // Toggle filters button handler
  const toggleFiltersButton = document.getElementById('toggleFiltersButton');
  if (toggleFiltersButton) {
    toggleFiltersButton.addEventListener('click', () => {
      const filterInputs = document.getElementById('filterInputs');
      if (filterInputs.style.display === 'none' || filterInputs.style.display === '') {
        filterInputs.style.display = 'flex';
        toggleFiltersButton.classList.add('active');
      } else {
        filterInputs.style.display = 'none';
        toggleFiltersButton.classList.remove('active');
      }
    });
  }

  // addTransferButton function is called here to ensure the button is added after the DOM is fully loaded
  addTransferButton();
  addBatchTransferButton();

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

  // Add Change Field Mapping button handler - Redirects to configuration page
  const changeFieldMappingBtn = document.getElementById("changeFieldMappingBtn");
  if (changeFieldMappingBtn) {
    changeFieldMappingBtn.addEventListener("click", () => {
      const eventId = sessionStorage.getItem('selectedEventId');
      sessionStorage.setItem('selectedLeadSource', 'leadReport');

      // Check if we're in virtual mode
      const urlParams = new URLSearchParams(window.location.search);
      const currentMode = urlParams.get('mode');

      let redirectUrl = `fieldConfigurator.html?eventId=${eventId}&source=leadReport&entityType=LS_LeadReport`;

      // Preserve virtual mode if active
      if (currentMode === 'virtual') {
        redirectUrl += '&mode=virtual';
        console.log('🧪 Redirecting to Field Configurator in virtual mode');
      }

      window.location.href = redirectUrl;
    });
  }
}

// Initialize the application when DOM is loaded
document.addEventListener("DOMContentLoaded", init);

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
    console.log(`➕ Creating new custom field ${fieldName} with value: ${fieldValue}`);

    // Add custom field using FieldMappingService (returns the new field object)
    const newField = await window.fieldMappingService.addCustomField({
      sfFieldName: fieldName,
      value: fieldValue,
      active: true
    });

    console.log(`✅ Custom field "${fieldName}" added successfully`, newField);

    // CRITICAL: Reload custom fields from FieldMappingService to ensure synchronization
    const customFields = window.fieldMappingService.getAllCustomFields();
    console.log('📋 Reloading custom fields after add:', customFields);

    // Map custom fields to proper format
    const mappedCustomFields = customFields
      .filter(cf => {
        const hasValidName = !!(cf.sfFieldName || cf.fieldName || cf.name);
        if (!hasValidName) {
          console.warn('⚠️ Skipping custom field without name:', cf);
        }
        return hasValidName;
      })
      .map(cf => ({
        id: cf.id,
        name: cf.sfFieldName || cf.fieldName || cf.name,
        value: cf.value || '',
        isCustom: true,
        active: cf.active !== false
      }));

    // Get API fields (filter out old custom fields, keep only API fields)
    const apiFields = window.configFields.filter(f => !f.isCustom);

    // Combine API fields + updated custom fields
    window.configFields = [...apiFields, ...mappedCustomFields];
    console.log(`✅ Updated configFields: ${apiFields.length} API fields + ${mappedCustomFields.length} custom fields`);

    // Close the custom field modal
    closeCustomFieldModal();

    // Stay on Custom Fields tab to show the new field in context
    window.currentModalFilter = 'custom';
    console.log('🔄 Switching to Custom Fields tab...');

    let tabFound = false;
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.classList.remove('active');
      if (tab.getAttribute('data-filter') === 'custom') {
        tab.classList.add('active');
        tabFound = true;
        console.log('✅ Custom Fields tab activated');
      }
    });

    if (!tabFound) {
      console.warn('⚠️ Custom Fields tab not found!');
    }

    // Re-render with current filter (Custom Fields tab)
    console.log('🎨 Re-rendering with custom filter, fields count:', window.configFields.length);
    renderConfigFields(window.configFields, 'custom');
    console.log('✅ Re-render complete');

    // Show success message
    showToast('Custom field added successfully!', 'success');

  } catch (error) {
    console.error('Error saving custom field:', error);
    showToast('Error saving custom field. Please try again.', 'error');
  }
}
