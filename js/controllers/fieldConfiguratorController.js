import { formatDate } from '../utils/helper.js';

const REQUIRED_FIELDS = ['LastName', 'Company'];

// Fields to exclude from display
const EXCLUDED_FIELDS = ['KontaktViewId', '__metadata'];

// Default active fields
const DEFAULT_ACTIVE_FIELDS = [
    'FirstName', 'LastName', 'Email', 'Company', 'Phone', 'MobilePhone',
    'Street', 'City', 'PostalCode', 'State', 'Country',
    'Title', 'Industry', 'Description'
];


// Global variables
let fieldMappingService = null;
let allFields = []; // API fields
let customFields = [];
let currentFilter = 'active';
let searchQuery = '';
let apiEndpoint = 'LS_Lead';
let currentMode = 'normal'; // 'virtual' or 'normal'
let virtualData = {}; // Store virtual test data
let metadata = null; // Store metadata for virtual mode 

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {

    try {
        // Initialize Field Mapping Service
        fieldMappingService = window.fieldMappingService || new window.FieldMappingService();

        // Get parameters from URL
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode') || 'normal'; // 'virtual' or 'normal'
        const eventId = urlParams.get('eventId') || sessionStorage.getItem('selectedEventId');
        const entityType = urlParams.get('entityType') || 'LS_Lead';
        const leadSource = urlParams.get('source') || sessionStorage.getItem('selectedLeadSource') || 'lead';

        // Set global mode
        currentMode = mode;

        // Determine API endpoint based on entityType or leadSource
        apiEndpoint = entityType || (leadSource === 'leadReport' ? 'LS_LeadReport' : 'LS_Lead');

        console.log(`🔧 Field Configurator initializing in ${currentMode} mode for ${apiEndpoint}`);

        if (eventId) {
            fieldMappingService.setCurrentEventId(eventId);
            sessionStorage.setItem('selectedEventId', eventId);
            sessionStorage.setItem('selectedLeadSource', leadSource);
        }

        // Configure UI based on mode
        configureUIForMode(mode, eventId);

        if (mode === 'virtual') {
            // VIRTUAL MODE: Load metadata and generate fake data
            await initVirtualMode(eventId, apiEndpoint);
        } else {
            // NORMAL MODE: Load existing field mapping
            await initNormalMode(eventId);
        }

        renderFields();
        setupEventListeners();

        console.log('✅ Field Configurator loaded successfully');

    } catch (error) {
        console.error('❌ Failed to initialize:', error);
        showNotification('Failed to load field configuration', 'error');
    }
});

// Configure UI elements based on mode
function configureUIForMode(mode, eventId) {
    const pageTitle = document.getElementById('page-title');
    const eventInfo = document.getElementById('event-info');
    const virtualModeInfo = document.getElementById('virtual-mode-info');
    const normalModeButtons = document.getElementById('normal-mode-buttons');
    const virtualModeButtons = document.getElementById('virtual-mode-buttons');

    if (mode === 'virtual') {
        // Virtual mode UI
        if (pageTitle) {
            pageTitle.innerHTML = `
                Test Data Configuration
                <img src="../images/salesforcelogo.png" alt="Salesforce" style="height: 32px; width: auto; vertical-align: middle; margin-right: 12px;">
                
            `;
        }
        if (eventInfo) eventInfo.style.display = 'none';
        if (virtualModeInfo) virtualModeInfo.style.display = 'block';
        if (normalModeButtons) normalModeButtons.style.display = 'none';
        if (virtualModeButtons) virtualModeButtons.style.display = 'flex';
    } else {
        // Normal mode UI
        if (pageTitle) {
            pageTitle.innerHTML = `
            Field Configurator
                <img src="../images/salesforcelogo.png" alt="Salesforce" style="height: 32px; width: auto; vertical-align: middle; margin-right: 12px;">
            `;
        }
        if (eventInfo) {
            eventInfo.style.display = 'block';
            eventInfo.textContent = `Configure which fields will be transferred to Salesforce for Event ${eventId}. Required fields (LastName, Company) are always included.`;
        }
        if (virtualModeInfo) virtualModeInfo.style.display = 'none';
        if (normalModeButtons) normalModeButtons.style.display = 'flex';
        if (virtualModeButtons) virtualModeButtons.style.display = 'none';
    }
}

// Initialize virtual mode (NO contacts exist - use fake data with Test_ prefix)
async function initVirtualMode(eventId, entityType) {
    console.log('🧪 Initializing Virtual Mode (no contacts - using Test_ prefix data)...');

    // Fetch metadata from API
    await fetchMetadata(entityType);

    // Generate fake data with Test_ prefix (no real contacts available)
    generateVirtualData();

    // Load custom fields from FieldMappingService
    await loadCustomFields();

    console.log('✅ Virtual mode initialized with Test_ prefixed fake data');
}

// Initialize normal mode
async function initNormalMode(eventId) {
    console.log('📋 Initializing Normal Mode...');

    // Load fields from API
    await loadFieldsFromAPI(eventId);

    // Load a sample contact to display real values
    await loadSampleContact(eventId);

    // Load custom fields from FieldMappingService
    await loadCustomFields();

    console.log('✅ Normal mode initialized');
}

// Load a sample contact to display real values in normal mode
async function loadSampleContact(eventId) {
    try {
        console.log('📊 Loading sample contact for event:', eventId);

        const serverName = sessionStorage.getItem('serverName');
        const apiName = sessionStorage.getItem('apiName');
        const credentials = sessionStorage.getItem('credentials');

        if (!serverName || !apiName || !credentials) {
            console.warn('⚠️ Missing credentials, cannot load sample contact');
            return;
        }

        // Fetch one contact from the API for this event
        const url = `https://${serverName}/${apiName}/${apiEndpoint}?$filter=EventId eq '${eventId}'&$top=1`;

        const response = await fetch(url, {
            headers: {
                'Authorization': 'Basic ' + credentials,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            console.warn('⚠️ Failed to load sample contact:', response.statusText);
            return;
        }

        const data = await response.json();

        if (data.d && data.d.results && data.d.results.length > 0) {
            const sampleContact = data.d.results[0];

            // Store sample contact data in virtualData (we reuse the same storage)
            virtualData = { ...sampleContact };

            console.log('✅ Sample contact loaded:', virtualData);
        } else {
            console.warn('⚠️ No contacts found for this event');
        }

    } catch (error) {
        console.error('❌ Error loading sample contact:', error);
    }
}

// Fetch metadata from API
async function fetchMetadata(entityType = 'LS_Lead') {
    try {
        const serverName = sessionStorage.getItem('serverName');
        const apiName = sessionStorage.getItem('apiName');
        const credentials = sessionStorage.getItem('credentials');

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

        // Parse properties
        const properties = targetEntity.getElementsByTagName('Property');
        const fields = [];

        for (let prop of properties) {
            const name = prop.getAttribute('Name');

            // Skip excluded fields
            if (EXCLUDED_FIELDS.includes(name)) {
                continue;
            }

            const type = prop.getAttribute('Type');
            const nullable = prop.getAttribute('Nullable') !== 'false';
            const maxLength = prop.getAttribute('MaxLength');

            fields.push({
                name,
                type,
                nullable,
                maxLength: maxLength && maxLength !== 'Max' ? parseInt(maxLength) : null,
                isStandardActive: DEFAULT_ACTIVE_FIELDS.includes(name),
                required: REQUIRED_FIELDS.includes(name), // Mark required fields
                active: DEFAULT_ACTIVE_FIELDS.includes(name) || REQUIRED_FIELDS.includes(name) // Active by default for DEFAULT_ACTIVE_FIELDS
            });
        }

        metadata = fields;
        allFields = fields;
        console.log(`📡 Metadata loaded: ${fields.length} fields`);
        return fields;

    } catch (error) {
        console.error('❌ Error fetching metadata:', error);
        return [];
    }
}

// Generate virtual fake data with Test_ prefix (for events with NO contacts)
function generateVirtualData() {
    if (!metadata) {
        console.error('❌ Metadata not available');
        return;
    }

    console.log('🧪 Generating virtual data with Test_ prefix for', metadata.length, 'fields');

    // Create virtualData object with Test_ prefixed values
    virtualData = {};

    metadata.forEach(field => {
        const fieldName = field.name;

        // Generate Test_ prefix value based on field name
        if (fieldName === 'Country') {
            // Special case: Country uses ISO code
            virtualData[fieldName] = 'DE';
        } else {
            // All other fields: Test_ + FieldName
            virtualData[fieldName] = `Test_${fieldName}`;
        }
    });

    console.log('✅ Virtual data generated:', virtualData);
}


// Load fields dynamically from API

async function loadFieldsFromAPI(eventId) {
    allFields = [];

    try {
        // Get credentials from session
        const credentials = sessionStorage.getItem('credentials');
        const serverName = sessionStorage.getItem('serverName') || 'lstest.convey.de';
        const apiName = sessionStorage.getItem('apiName') || 'apisftest';

        if (!credentials) {
            throw new Error('No credentials found');
        }

        // Build API endpoint - get first record to extract field names
        let endpoint = `${apiEndpoint}?$format=json&$top=1`;

        // Add event filter if available
        if (eventId) {
            endpoint += `&$filter=EventId eq '${encodeURIComponent(eventId)}'`;
        }

        const url = `https://${serverName}/${apiName}/${endpoint}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Basic ${credentials}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const results = data.d?.results || [];

        if (results.length === 0) {
            console.warn('⚠️ No data found in API');
            showNotification('No data found in the API. Cannot load fields.', 'error');
            return;
        }

        // Extract field names from first record
        const firstRecord = results[0];

        // Filter out excluded fields (KontaktViewId, __metadata)
        const availableFields = Object.keys(firstRecord).filter(fieldName =>
            !EXCLUDED_FIELDS.includes(fieldName)
        );

        console.log('📊 Available fields from API (after exclusions):', availableFields);


        // Create field objects (all fields from API, no categorization)
        for (const fieldName of availableFields) {
            const fieldConfig = fieldMappingService.getFieldConfig(fieldName);
            const isRequired = REQUIRED_FIELDS.includes(fieldName);

            // Check if field has a saved config
            let isActive = isRequired; // Required fields always active
            if (!isRequired) {
                if (fieldConfig && fieldConfig.hasOwnProperty('active')) {
                    isActive = fieldConfig.active;
                } else {
                    // Use default active fields on first load
                    isActive = DEFAULT_ACTIVE_FIELDS.includes(fieldName);
                }
            }

            allFields.push({
                name: fieldName,
                active: isActive,
                required: isRequired,
                isApiField: true,
                sfLabel: fieldConfig?.sfLabel || fieldName // Load saved SF label mapping
            });
        }

        // Sort fields: required first, then active, then alphabetically
        allFields.sort((a, b) => {
            if (a.required && !b.required) return -1;
            if (!a.required && b.required) return 1;
            if (a.active && !b.active) return -1;
            if (!a.active && b.active) return 1;
            return a.name.localeCompare(b.name);
        });

    } catch (error) {
        console.error('Failed to load fields from API:', error);
        showNotification('Failed to load fields from API: ' + error.message, 'error');
        throw error;
    }
}

// Load custom fields created by user
async function loadCustomFields() {
    try {
        if (!fieldMappingService || !fieldMappingService.getAllCustomFields) {
            console.warn('⚠️ FieldMappingService.getAllCustomFields not available');
            return;
        }

        const loadedCustomFields = fieldMappingService.getAllCustomFields();
        console.log('📋 Raw custom fields from service:', loadedCustomFields);

        customFields = loadedCustomFields.map(field => {
            console.log('🔍 Processing custom field:', field);

            // Try multiple possible field name properties
            const fieldName = field.sfFieldName || field.fieldName || field.name || 'Unnamed Field';

            return {
                id: field.id,
                name: fieldName,
                value: field.value || '',
                active: field.active !== false,
                isCustomField: true
            };
        });

        console.log('✅ Loaded custom fields:', customFields);

    } catch (error) {
        console.error('Failed to load custom fields:', error);
    }
}

// Get all fields (API fields + custom fields) for rendering

function getAllFieldsForRendering() {
    // Combine API fields and custom fields
    return [...allFields, ...customFields];
}

// Render fields in the grid
function renderFields() {
    const container = document.getElementById('fieldsContainer');
    const addCustomFieldBtn = document.getElementById('addCustomFieldBtn');

    // Get all fields (API + custom)
    const allFieldsCombined = getAllFieldsForRendering();

    // Show/hide "Add Custom Field" button based on filter
    if (addCustomFieldBtn) {
        addCustomFieldBtn.style.display = currentFilter === 'custom' ? 'flex' : 'none';
    }

    // Filter fields - FIXED: custom fields now appear in all tabs based on their state
    let filteredFields = allFieldsCombined.filter(field => {
        // "Custom Fields" tab: show ONLY custom fields (regardless of active state)
        if (currentFilter === 'custom') {
            return field.isCustomField;
        }

        // All other tabs: include BOTH API fields AND custom fields based on state
        if (currentFilter === 'active' && !field.active) return false;
        if (currentFilter === 'inactive' && field.active) return false;
        if (currentFilter === 'required' && !field.required) return false;

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            return field.name.toLowerCase().includes(query);
        }

        return true;
    });

    // Update statistics
    updateStatistics();

    // Render
    if (filteredFields.length === 0) {
        container.innerHTML = `
            <div class="loading">
                <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #718096;">No fields found</div>
                <div style="color: #a0aec0;">Try adjusting your search or filter</div>
            </div>
        `;
    } else {
        container.className = 'fields-grid';
        container.innerHTML = ''; // Clear container

        // Create field items based on mode
        filteredFields.forEach(field => {
            const fieldItem = currentMode === 'virtual'
                ? createVirtualFieldItem(field)
                : createFieldItem(field);
            container.appendChild(fieldItem);
        });
    }
}

// Create a field item element with proper event listeners (NORMAL MODE)
function createFieldItem(field) {
    const label = document.createElement('label');
    label.className = `field-item ${field.active ? 'active' : ''} ${field.required ? 'required' : ''} ${field.isCustomField ? 'user-custom-field' : ''}`;
    label.dataset.field = field.name;
    label.dataset.isCustom = field.isCustomField || false;
    label.dataset.fieldId = field.id || '';

    // Get value from virtualData (which now contains sample contact in normal mode)
    // Display values as-is from API (including null values)
    let fieldValue = field.isCustomField
        ? (field.value ?? '')
        : (virtualData[field.name] ?? '');

    // Format date fields using helper function
    if (fieldValue && (field.name.includes('Date') || field.name === 'SystemModstamp')) {
        fieldValue = formatDate(fieldValue);
    }

    // Field name display
    const fieldLabel = field.isCustomField
        ? field.name  // Custom field: just the name
        : field.name; // Standard field: just the name

    // Get SF label (custom mapping) if exists
    const sfLabel = field.sfLabel || field.name;
    const hasCustomMapping = field.sfLabel && field.sfLabel !== field.name;

    // Build HTML with checkbox + label mapping + value input
    label.innerHTML = `
        <input type="checkbox"
               class="field-checkbox"
               ${field.active ? 'checked' : ''}
               ${field.required ? 'disabled' : ''} />
        <div class="field-info" style="flex: 1;">
            <div class="field-label-with-flags" style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                <span class="ls-flag" style="color: ${field.isCustomField ? '#805ad5' : '#718096'}; font-size: 0.75rem;">
                    ${field.isCustomField ? 'Custom:' : 'LS:'}
                </span>
                <span style="color: ${field.isCustomField ? '#805ad5' : '#718096'};">${fieldLabel}</span>
                ${hasCustomMapping ? `
                    <span class="arrow" style="color: #999;">→</span>
                    <span class="sf-flag" style="color: #009EDB; font-weight: 600; font-size: 0.75rem;">SF:</span>
                    <span style="color: #009EDB; font-weight: 600;">${sfLabel}</span>
                ` : ''}
                ${field.required ? '<span class="required-badge">REQUIRED</span>' : ''}
                <button class="edit-label-btn" title="Edit label mapping" style="margin-left: auto; background: none; border: none; color: #718096; cursor: pointer; padding: 4px; font-size: 14px;">
                    ✏️
                </button>
            </div>
            <input
                type="text"
                class="field-input field-value-input"
                ${field.isCustomField ? 'data-custom-field="true"' : 'data-field="' + field.name + '"'}
                ${field.isCustomField ? 'data-custom-field-id="' + (field.id || '') + '"' : ''}
                ${field.isCustomField ? 'data-sf-field="' + field.name + '"' : ''}
                value="${fieldValue}"
                placeholder=${fieldLabel}
                ${field.isCustomField ? '' : 'readonly'}
                style="width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 14px; ${field.isCustomField ? '' : 'background: #f9fafb; cursor: not-allowed;'}"
                onclick="event.stopPropagation()"
            />
        </div>
        ${field.isCustomField ? `
            <button class="delete-custom-field" title="Delete custom field" style="font-size: 14px;">
                🗑️
            </button>
        ` : ''}
    `;

    // Add event listeners
    const checkbox = label.querySelector('.field-checkbox');
    const input = label.querySelector('.field-input');
    const editLabelBtn = label.querySelector('.edit-label-btn');
    const deleteBtn = label.querySelector('.delete-custom-field');

    // Toggle handler - updates local state only (no DB save until saveAndContinue)
    checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        const isChecked = checkbox.checked;

        if (field.required) {
            checkbox.checked = true;
            return;
        }

        // Update local state only (both API and custom fields)
        field.active = isChecked;

        // Update UI immediately
        if (isChecked) {
            label.classList.add('active');
        } else {
            label.classList.remove('active');
        }

        // Update statistics in real-time
        updateStatistics();

        console.log(`✅ Field ${field.name} ${isChecked ? 'activated' : 'deactivated'} (not saved yet)`);
    });

    // Input change handler for custom fields (update value in memory)
    if (input && field.isCustomField) {
        input.addEventListener('input', (e) => {
            field.value = e.target.value;
            console.log(`📝 Updated custom field "${field.name}" value:`, e.target.value);
        });
    }

    // Edit label button handler - Opens modal to edit SF label mapping
    if (editLabelBtn) {
        editLabelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openEditLabelModal(field);
        });
    }

    // Delete handler for custom fields
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Use modern confirmation dialog
            const confirmed = await showConfirmDialog(
                'Delete Custom Field?',
                `Are you sure you want to delete the custom field "${field.name}"?\n\nThis action cannot be undone.`,
                {
                    confirmText: 'Delete',
                    cancelText: 'Cancel',
                    type: 'danger'
                }
            );

            if (!confirmed) {
                return;
            }

            try {
                console.log(`🗑️ Deleting custom field ${field.name} (ID: ${field.id})`);

                // Delete from service (this updates fieldMappingService.customFields AND localStorage)
                await fieldMappingService.deleteCustomField(field.id);

                // Reload custom fields from service to ensure sync
                await loadCustomFields();

                // Re-render all fields immediately to update the UI
                renderFields();
                updateStatistics();

                showNotification(`Custom field "${field.name}" deleted successfully`, 'success');
                console.log(`✅ Custom field ${field.name} deleted and UI refreshed`);

            } catch (error) {
                console.error('Failed to delete custom field:', error);
                showNotification('Failed to delete custom field', 'error');
            }
        });
    }

    // Make field name clickable for inline editing (custom fields only)
    if (field.isCustomField) {
        const fieldNameElement = label.querySelector('.field-label-with-flags');
        if (fieldNameElement) {
            fieldNameElement.style.cursor = 'pointer';
            fieldNameElement.title = 'Click to edit field value';

            fieldNameElement.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openEditCustomFieldModal(field);
            });
        }
    }

    return label;
}

// Create a virtual field item with checkbox and editable input (Virtual mode)
function createVirtualFieldItem(field) {
    const label = document.createElement('label');
    label.className = `field-item ${field.active ? 'active' : ''} ${field.required ? 'required' : ''} ${field.isCustomField ? 'user-custom-field' : ''}`;
    label.dataset.field = field.name;
    label.dataset.isCustom = field.isCustomField || false;
    label.dataset.fieldId = field.id || '';

    // Get value from virtualData or field.value (for custom fields)
    // Display values as-is from API (including null values)
    let fieldValue = field.isCustomField
        ? (field.value ?? '')
        : (virtualData[field.name] ?? '');

    // Format date fields using helper function
    if (fieldValue && (field.name.includes('Date') || field.name === 'SystemModstamp')) {
        fieldValue = formatDate(fieldValue);
    }

    // Field name display - NO "LS:" prefix in virtual mode (fields not modified yet)
    const fieldLabel = field.isCustomField
        ? field.name  // Custom field: just the name
        : field.name; // Standard field: just the name

    // Build HTML with checkbox + label + editable input
    label.innerHTML = `
        <input type="checkbox"
               class="field-checkbox"
               ${field.active ? 'checked' : ''}
               ${field.required ? 'disabled' : ''} />
        <div class="field-info" style="flex: 1;">
            <div class="field-name">
                ${fieldLabel}
                ${field.required ? '<span class="required-badge">REQUIRED</span>' : ''}
            </div>
            <input
                type="text"
                class="field-input"
                ${field.isCustomField ? 'data-custom-field="true"' : 'data-field="' + field.name + '"'}
                ${field.isCustomField ? 'data-custom-field-id="' + (field.id || '') + '"' : ''}
                ${field.isCustomField ? 'data-sf-field="' + field.name + '"' : ''}
                value="${fieldValue}"
                placeholder="Enter ${fieldLabel}"
                style="width: 100%; padding: 8px 12px; border: 1px solid #C9C7C5; border-radius: 4px; font-size: 14px; margin-top: 6px;"
                onclick="event.stopPropagation()"
            />
        </div>
        ${field.isCustomField ? `
            <button class="delete-custom-field" title="Delete custom field" style="font-size: 14px;">
                🗑️
            </button>
        ` : ''}
    `;

    // Add event listeners
    const checkbox = label.querySelector('.field-checkbox');
    const input = label.querySelector('.field-input');
    const deleteBtn = label.querySelector('.delete-custom-field');

    // Checkbox toggle handler
    checkbox.addEventListener('change', async (e) => {
        e.stopPropagation();
        const isChecked = checkbox.checked;

        if (field.required) {
            checkbox.checked = true;
            return;
        }

        // Update field active state
        field.active = isChecked;

        // If it's a custom field, save the active state to the database
        if (field.isCustomField && field.id) {
            try {
                await window.fieldMappingService.updateCustomField(field.id, {
                    active: isChecked
                });
                console.log(`💾 Saved custom field "${field.name}" active state (${isChecked}) to database`);
            } catch (error) {
                console.error(`❌ Error saving custom field active state:`, error);
                // Revert the checkbox if save failed
                checkbox.checked = !isChecked;
                field.active = !isChecked;
                showNotification('Error saving field state', 'error');
                return;
            }
        }

        // Update UI
        if (isChecked) {
            label.classList.add('active');
        } else {
            label.classList.remove('active');
        }

        // Update statistics
        updateStatistics();

        console.log(`✅ Field ${field.name} ${isChecked ? 'activated' : 'deactivated'}`);
    });

    // Input change handler
    input.addEventListener('input', (e) => {
        const fieldName = field.isCustomField ? field.name : field.name;
        virtualData[fieldName] = e.target.value;
        console.log(`📝 Updated ${fieldName}:`, e.target.value);
    });

    // Delete button for custom fields
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (confirm(`Delete custom field "${field.name}"?`)) {
                try {
                    await fieldMappingService.deleteCustomField(field.id);
                    // Remove from customFields array
                    customFields = customFields.filter(f => f.id !== field.id);
                    // Re-render fields
                    renderFields();
                    showNotification(`Custom field "${field.name}" deleted successfully`, 'success');
                } catch (error) {
                    console.error('Failed to delete custom field:', error);
                    showNotification('Failed to delete custom field', 'error');
                }
            }
        });
    }

    return label;
}

// Open modal to edit custom field value
function openEditCustomFieldModal(field) {
    const modal = document.getElementById('customFieldModal');
    const modalHeader = modal?.querySelector('.modal-header');
    if (!modal) return;

    // Update modal title
    if (modalHeader) {
        modalHeader.textContent = 'Edit Custom Field';
    }

    // Pre-fill with existing values
    document.getElementById('customFieldName').value = field.name;
    document.getElementById('customFieldName').disabled = true; // Don't allow name change
    document.getElementById('customFieldValue').value = field.value || '';

    // Store field ID for update
    modal.dataset.editingFieldId = field.id;
    modal.style.display = 'flex';
}

// Open modal to edit field label (LS → SF mapping)
function openEditLabelModal(field) {
    // Create modal dynamically if it doesn't exist
    let modal = document.getElementById('editLabelModal');

    if (!modal) {
        const modalHTML = `
            <div id="editLabelModal" class="modal" style="display: flex;">
                <div class="modal-content">
                    <div class="modal-header">Edit Field Label Mapping</div>
                    <div class="form-group">
                        <label class="form-label">LS Field Name</label>
                        <input type="text" id="editLabelLsName" class="form-input" readonly style="background: #f9fafb;" />
                    </div>
                    <div class="form-group">
                        <label class="form-label">SF Field Name *</label>
                        <input type="text" id="editLabelSfName" class="form-input" placeholder="Enter Salesforce field name" />
                        <p class="form-hint">Enter the Salesforce field name you want to map this field to. Leave empty to use the same name.</p>
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="closeEditLabelModal()">Cancel</button>
                        <button class="btn btn-primary" onclick="saveEditLabel()">Save</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('editLabelModal');
    }

    // Pre-fill with existing values
    document.getElementById('editLabelLsName').value = field.name;
    document.getElementById('editLabelSfName').value = field.sfLabel || field.name;

    // Store field name for update
    modal.dataset.editingFieldName = field.name;
    modal.style.display = 'flex';
}

// Close edit label modal
window.closeEditLabelModal = function() {
    const modal = document.getElementById('editLabelModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

// Save edited label mapping
window.saveEditLabel = function() {
    const modal = document.getElementById('editLabelModal');
    const fieldName = modal.dataset.editingFieldName;
    const sfLabel = document.getElementById('editLabelSfName').value.trim();

    if (!fieldName) {
        showNotification('Error: Field name not found', 'error');
        return;
    }

    // Find the field and update its SF label
    const field = allFields.find(f => f.name === fieldName);
    if (field) {
        field.sfLabel = sfLabel || field.name; // Use original name if empty
        console.log(`📝 Updated field "${fieldName}" SF label to:`, field.sfLabel);

        // Re-render fields to show updated mapping
        renderFields();
        showNotification('Label mapping updated (not saved yet)', 'success');
    }

    closeEditLabelModal();
};

// Legacy toggle function - kept for compatibility but not used anymore
// Real-time toggle is now handled in createFieldItem()
window.toggleField = function(fieldName, checked, isCustomField = false) {
    console.warn('⚠️ Legacy toggleField called - this should not happen with new implementation');
};

// Select all fields (in memory only, no DB save)
window.selectAllFields = function() {
    for (const field of allFields) {
        if (!field.required && !field.active) {
            field.active = true;
        }
    }
    renderFields();
    showNotification('All fields selected (not saved yet)', 'success');
};

// Deselect all fields (except required) (in memory only, no DB save)
window.deselectAllFields = function() {
    for (const field of allFields) {
        if (!field.required && field.active) {
            field.active = false;
        }
    }
    renderFields();
    showNotification('All optional fields deselected (not saved yet)', 'success');
};

// Save configuration and continue
window.saveAndContinue = async function() {
    try {

        // Update field configurations in memory WITHOUT triggering individual API saves
        // We'll do one bulk save at the end
        for (const field of allFields) {
            // Find existing field config
            const existingIndex = fieldMappingService.fieldConfig.config.fields.findIndex(
                f => f.fieldName === field.name
            );

            const fieldConfigData = {
                fieldName: field.name,
                active: field.active,
                sfLabel: field.sfLabel || field.name // Save SF label mapping
            };

            if (existingIndex >= 0) {
                // Update existing config
                fieldMappingService.fieldConfig.config.fields[existingIndex] = {
                    ...fieldMappingService.fieldConfig.config.fields[existingIndex],
                    ...fieldConfigData
                };
            } else {
                // Add new config
                fieldMappingService.fieldConfig.config.fields.push(fieldConfigData);
            }
        }

        // Update custom fields active state AND value in memory
        for (const field of customFields) {
            const customField = fieldMappingService.getAllCustomFields().find(f => f.id === field.id);
            if (customField) {
                customField.active = field.active;
                customField.value = field.value; // Also save updated value
            }
        }

        // Save local config
        fieldMappingService.saveConfig();

        // Now save all configurations to database in ONE bulk operation
        const success = await fieldMappingService.bulkSaveToDatabase();

        if (success) {
            showNotification('Configuration saved successfully!', 'success');

            const allFieldsCombined = getAllFieldsForRendering();
            const activeCount = allFieldsCombined.filter(f => f.active).length;
            console.log(`Configuration saved: ${activeCount} active fields (${allFields.filter(f => f.active).length} API + ${customFields.filter(f => f.active).length} custom)`);

            const leadSource = sessionStorage.getItem('selectedLeadSource') || 'lead';
            const targetPage = leadSource === 'leadReport' ? 'displayLsLeadReport.html' : 'displayLsLead.html';

            setTimeout(() => {
                window.location.href = targetPage;
            }, 1000);
        } else {
            throw new Error('Failed to save configuration');
        }

    } catch (error) {
        console.error('Failed to save:', error);
        showNotification('Failed to save configuration: ' + error.message, 'error');
    }
};

// Navigate back
window.goBack = function() {
    window.location.href = 'display.html';
};

// Update statistics 
function updateStatistics() {

    const allFieldsCombined = getAllFieldsForRendering();
    const total = allFieldsCombined.length;
    const active = allFieldsCombined.filter(f => f.active).length;
    const inactive = total - active;
    const custom = customFields.length;

    document.getElementById('totalFieldsCount').textContent = total;
    document.getElementById('activeFieldsCount').textContent = active;
    document.getElementById('inactiveFieldsCount').textContent = inactive;
    document.getElementById('customFieldsCount').textContent = custom;
}

// Open modal to add custom field

window.openAddCustomFieldModal = function() {
    const modal = document.getElementById('customFieldModal');
    const modalHeader = modal?.querySelector('.modal-header');

    if (modal) {
        modal.style.display = 'flex';

        // Update modal title
        if (modalHeader) {
            modalHeader.textContent = 'Add Custom Field';
        }

        // Clear previous values
        document.getElementById('customFieldName').value = '';
        document.getElementById('customFieldName').disabled = false; // Enable for new field
        document.getElementById('customFieldValue').value = '';

        // Clear editing state
        delete modal.dataset.editingFieldId;
    }
};

// Close custom field modal
window.closeCustomFieldModal = function() {
    const modal = document.getElementById('customFieldModal');
    if (modal) {
        modal.style.display = 'none';
        // Reset editing state
        delete modal.dataset.editingFieldId;
        document.getElementById('customFieldName').disabled = false;
    }
};

// Save custom field (handles both create and update)

window.saveCustomField = async function() {
    const fieldName = document.getElementById('customFieldName').value.trim();
    const fieldValue = document.getElementById('customFieldValue').value.trim();
    const modal = document.getElementById('customFieldModal');
    const editingFieldId = modal?.dataset.editingFieldId;

    if (!fieldName) {
        showNotification('Field name is required', 'error');
        return;
    }

    // Validate field name (no spaces, no special characters except underscore) - only for new fields
    if (!editingFieldId && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(fieldName)) {
        showNotification('Invalid field name. Use only letters, numbers, and underscores. Must start with a letter.', 'error');
        return;
    }

    // Check if field name already exists (only for new fields)
    if (!editingFieldId) {
        const allFieldsCombined = getAllFieldsForRendering();
        if (allFieldsCombined.some(f => f.name === fieldName)) {
            showNotification('A field with this name already exists', 'error');
            return;
        }
    }

    try {
        if (editingFieldId) {
            // UPDATE existing custom field
            console.log(`🔄 Updating custom field ${fieldName} with new value: ${fieldValue}`);

            // Update in FieldMappingService
            await fieldMappingService.updateCustomField(editingFieldId, {
                value: fieldValue
            });

            // Update in local array
            const localField = customFields.find(f => f.id === editingFieldId);
            if (localField) {
                localField.value = fieldValue;
            }

            showNotification(`Custom field "${fieldName}" updated successfully!`, 'success');
            closeCustomFieldModal();

            // Re-render to show updated value
            renderFields();

        } else {
            // CREATE new custom field
            console.log(`➕ Creating new custom field ${fieldName} with value: ${fieldValue}`);

            // Use field name as-is (no __c suffix needed - fields already exist in Salesforce)
            const sfFieldName = fieldName;

            // Save to FieldMappingService
            if (fieldMappingService && fieldMappingService.addCustomField) {
                const newField = await fieldMappingService.addCustomField({
                    sfFieldName: sfFieldName,
                    value: fieldValue,
                    active: true
                });

                // Add to local customFields array
                customFields.push({
                    id: newField.id,
                    name: sfFieldName,
                    value: fieldValue,
                    active: true,
                    isCustomField: true
                });

                // Stay on Custom Fields tab (do NOT switch to Active Fields)
                currentFilter = 'custom';
                document.querySelectorAll('.filter-tab').forEach(tab => {
                    tab.classList.remove('active');
                    if (tab.getAttribute('data-filter') === 'custom') {
                        tab.classList.add('active');
                    }
                });

                showNotification(`Custom field "${fieldName}" added successfully!`, 'success');
                closeCustomFieldModal();
                renderFields();
            } else {
                throw new Error('FieldMappingService.addCustomField not available');
            }
        }

    } catch (error) {
        console.error('Failed to save custom field:', error);
        showNotification('Failed to save custom field: ' + error.message, 'error');
    }
};

// Legacy delete function - kept for compatibility but not used anymore
// Real-time delete is now handled in createFieldItem()
window.deleteCustomField = async function() {
    console.warn('⚠️ Legacy deleteCustomField called - this should not happen with new implementation');
};

// Modern confirm dialog (Salesforce-styled)
function showConfirmDialog(title, message, options = {}) {
    return new Promise((resolve) => {
        const {
            confirmText = 'OK',
            cancelText = 'Cancel',
            type = 'danger' // warning, danger, info
        } = options;

        const typeStyles = {
            warning: 'background: #eab308; color: white;',
            danger: 'background: #ef4444; color: white;',
            info: 'background: #3b82f6; color: white;'
        };

        const typeHoverStyles = {
            warning: '#ca8a04',
            danger: '#dc2626',
            info: '#2563eb'
        };

        const typeIcons = {
            warning: '<i class="fas fa-exclamation-triangle" style="color: #eab308; font-size: 3rem; margin-bottom: 1rem; display: block;"></i>',
            danger: '<i class="fas fa-trash-alt" style="color: #ef4444; font-size: 3rem; margin-bottom: 1rem; display: block;"></i>',
            info: '<i class="fas fa-info-circle" style="color: #3b82f6; font-size: 3rem; margin-bottom: 1rem; display: block;"></i>'
        };

        const escapeHtml = (text) => {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };

        const modalHTML = `
            <div id="modern-confirm-modal" style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(0, 0, 0, 0.5);
                animation: fadeIn 0.2s ease-out;
            ">
                <div style="
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                    max-width: 28rem;
                    width: 100%;
                    margin: 0 1rem;
                    animation: slideUp 0.3s ease-out;
                ">
                    <div style="padding: 1.5rem; text-align: center;">
                        ${typeIcons[type]}
                        <h3 style="
                            font-size: 1.25rem;
                            font-weight: 700;
                            color: #111827;
                            margin-bottom: 0.5rem;
                        ">${escapeHtml(title)}</h3>
                        <p style="
                            color: #6b7280;
                            margin-bottom: 1.5rem;
                            white-space: pre-line;
                            line-height: 1.5;
                        ">${escapeHtml(message)}</p>
                        <div style="
                            display: flex;
                            gap: 0.75rem;
                            justify-content: center;
                        ">
                            <button id="modal-cancel-btn" style="
                                padding: 0.625rem 1.5rem;
                                background: #e5e7eb;
                                color: #374151;
                                border: none;
                                border-radius: 0.5rem;
                                font-weight: 500;
                                cursor: pointer;
                                transition: background-color 0.2s;
                                font-size: 0.9375rem;
                            " onmouseover="this.style.background='#d1d5db'" onmouseout="this.style.background='#e5e7eb'">
                                ${escapeHtml(cancelText)}
                            </button>
                            <button id="modal-confirm-btn" style="
                                padding: 0.625rem 1.5rem;
                                ${typeStyles[type]}
                                border: none;
                                border-radius: 0.5rem;
                                font-weight: 500;
                                cursor: pointer;
                                transition: background-color 0.2s;
                                font-size: 0.9375rem;
                            " onmouseover="this.style.background='${typeHoverStyles[type]}'" onmouseout="this.style.background='${typeStyles[type].match(/background: ([^;]+)/)[1]}'">
                                ${escapeHtml(confirmText)}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <style>
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes fadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
            </style>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('modern-confirm-modal');
        if (existingModal) existingModal.remove();

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const modal = document.getElementById('modern-confirm-modal');
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');

        const closeModal = (result) => {
            modal.style.animation = 'fadeOut 0.2s ease-out';
            setTimeout(() => {
                modal.remove();
                resolve(result);
            }, 200);
        };

        confirmBtn.addEventListener('click', () => closeModal(true));
        cancelBtn.addEventListener('click', () => closeModal(false));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(false);
        });

        // ESC key to cancel
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal(false);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    });
}

// Cancel configuration (Normal mode)
window.cancelConfiguration = function() {
    console.log('🔙 Cancelling configuration...');
    window.location.href = 'display.html';
};

// Save fake data defaults (Virtual mode)
window.saveFakeDataDefaults = async function() {
    console.log('💾 Saving fake data defaults...');

    try {
        // Collect all modified virtual data from inputs (only from active fields)
        document.querySelectorAll('.field-input[data-field]').forEach(input => {
            const fieldName = input.dataset.field;
            // Only collect if field is active
            const field = allFields.find(f => f.name === fieldName);
            if (field && field.active) {
                virtualData[fieldName] = input.value;
            }
        });

        // Collect custom field values (only from active fields)
        document.querySelectorAll('.field-input[data-custom-field]').forEach(input => {
            const fieldId = input.dataset.customFieldId;
            const sfFieldName = input.dataset.sfField;
            // Only collect if custom field is active
            const customField = customFields.find(f => f.name === sfFieldName);
            if (customField && customField.active) {
                virtualData[sfFieldName] = input.value;
            }
        });

        // TODO: Save to database via API
        // For now, just save to sessionStorage
        sessionStorage.setItem('virtualTestDataDefaults', JSON.stringify(virtualData));

        showNotification('Test data defaults saved successfully!', 'success');
        console.log('✅ Virtual data defaults saved:', virtualData);

    } catch (error) {
        console.error('❌ Error saving fake data defaults:', error);
        showNotification('Error saving test data defaults', 'error');
    }
};

// Test & Transfer (Virtual mode)
window.testTransfer = async function() {
    console.log('🚀 Test & Transfer starting...');

    try {
        // Validate required fields
        if (!virtualData.LastName || !virtualData.Company) {
            showNotification('LastName and Company are required fields!', 'error');
            return;
        }

        // Collect all modified virtual data from inputs (only from active fields)
        document.querySelectorAll('.field-input[data-field]').forEach(input => {
            const fieldName = input.dataset.field;
            // Only collect if field is active
            const field = allFields.find(f => f.name === fieldName);
            if (field && field.active) {
                virtualData[fieldName] = input.value;
            }
        });

        // Collect custom field values (only from active fields)
        document.querySelectorAll('.field-input[data-custom-field]').forEach(input => {
            const fieldId = input.dataset.customFieldId;
            const sfFieldName = input.dataset.sfField;
            // Only collect if custom field is active
            const customField = customFields.find(f => f.name === sfFieldName);
            if (customField && customField.active) {
                virtualData[sfFieldName] = input.value;
            }
        });

        // Get only ACTIVE fields for display
        const activeFieldNames = [];
        allFields.forEach(field => {
            if (field.active) {
                activeFieldNames.push(field.name);
            }
        });
        customFields.forEach(field => {
            if (field.active) {
                activeFieldNames.push(field.name);
            }
        });

        // Filter virtualData to only include active fields
        const activeVirtualData = {};
        activeFieldNames.forEach(fieldName => {
            if (virtualData.hasOwnProperty(fieldName)) {
                activeVirtualData[fieldName] = virtualData[fieldName];
            }
        });

        // Save to sessionStorage for the display page
        sessionStorage.setItem('virtualTestData', JSON.stringify(activeVirtualData));
        sessionStorage.setItem('virtualTestDataActiveFields', JSON.stringify(activeFieldNames));
        console.log('💾 Virtual test data saved to sessionStorage:', activeVirtualData);
        console.log('📋 Active fields:', activeFieldNames);

        // Get eventId from URL params
        const urlParams = new URLSearchParams(window.location.search);
        const eventId = urlParams.get('eventId') || sessionStorage.getItem('selectedEventId');

        // Determine redirect page based on entityType
        const entityType = apiEndpoint;
        const redirectPage = entityType === 'LS_LeadReport' ? 'displayLsLeadReport.html' : 'displayLsLead.html';

        showNotification('Redirecting to test with fake data...', 'success');

        // Redirect to display page with eventId
        setTimeout(() => {
            window.location.href = `${redirectPage}?eventId=${eventId}&mode=virtual`;
        }, 500);

    } catch (error) {
        console.error('❌ Error in test & transfer:', error);
        showNotification('Error during test & transfer', 'error');
    }
};

// Setup event listeners

function setupEventListeners() {
    // Search
    const searchInput = document.getElementById('searchField');
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderFields();
    });

    // Filter tabs
    const filterTabs = document.querySelectorAll('.filter-tab');
    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.filter;
            renderFields();
        });
    });
}

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    const icon = type === 'success'
        ? '<svg width="24" height="24" fill="currentColor" style="color: #48bb78;"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/></svg>'
        : '<svg width="24" height="24" fill="currentColor" style="color: #f56565;"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"/></svg>';

    notification.innerHTML = `
        ${icon}
        <span>${message}</span>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

