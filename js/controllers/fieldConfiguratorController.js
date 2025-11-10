// fieldConfiguratorController_v3.js - Dynamic Field Configuration from API
// FieldMappingService is loaded globally via script tag

// Required fields (cannot be disabled)
const REQUIRED_FIELDS = ['LastName', 'Company'];

// Default active fields (commonly used)
const DEFAULT_ACTIVE_FIELDS = [
    'FirstName', 'LastName', 'Email', 'Company', 'Phone', 'MobilePhone',
    'Street', 'City', 'PostalCode', 'State', 'Country',
    'Title', 'Industry', 'Description'
];

// No fields are excluded - show everything from the API
// The user will decide which fields to use

// Global variables
let fieldMappingService = null;
let allFields = []; // API fields
let customFields = []; // User-created custom fields
let currentFilter = 'all';
let searchQuery = '';
let apiEndpoint = 'LS_Lead'; // Default endpoint

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Field Configurator V3 initializing...');

    try {
        // Initialize Field Mapping Service
        fieldMappingService = new window.FieldMappingService();

        // Get event ID from URL parameters or session
        const urlParams = new URLSearchParams(window.location.search);
        const eventId = urlParams.get('eventId') || sessionStorage.getItem('selectedEventId');
        const leadSource = urlParams.get('source') || sessionStorage.getItem('selectedLeadSource') || 'lead';

        // Determine API endpoint based on source
        apiEndpoint = leadSource === 'leadReport' ? 'LS_LeadReport' : 'LS_Lead';

        if (eventId) {
            fieldMappingService.setCurrentEventId(eventId);
            sessionStorage.setItem('selectedEventId', eventId);
            sessionStorage.setItem('selectedLeadSource', leadSource);
            console.log(`📋 Event ID: ${eventId}, Source: ${leadSource}, Endpoint: ${apiEndpoint}`);

            // Update event info
            const eventInfo = document.getElementById('event-info');
            if (eventInfo) {
                eventInfo.textContent = `Configure which fields will be transferred to Salesforce for Event ${eventId}. Required fields (LastName, Company) are always included.`;
            }
        }

        // Load fields dynamically from API
        await loadFieldsFromAPI(eventId);

        // Load custom fields from FieldMappingService
        await loadCustomFields();

        renderFields();
        setupEventListeners();

        console.log('✅ Field Configurator loaded successfully');

    } catch (error) {
        console.error('❌ Failed to initialize:', error);
        showNotification('Failed to load field configuration', 'error');
    }
});

/**
 * Load fields dynamically from API
 */
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

        // Build full URL (without /odata/)
        const url = `https://${serverName}/${apiName}/${endpoint}`;

        console.log(`📡 Fetching fields from: ${url}`);

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
        // Show ALL fields from the API - no exclusions
        const availableFields = Object.keys(firstRecord);

        console.log(`📊 Found ${availableFields.length} available fields from API`);

        // Create field objects (all fields from API, no categorization)
        for (const fieldName of availableFields) {
            const fieldConfig = fieldMappingService.getFieldConfig(fieldName);
            const isRequired = REQUIRED_FIELDS.includes(fieldName);

            // Check if field has a saved config, otherwise use default active list
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
                isApiField: true // Mark as API field (not user-created custom field)
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

        console.log(`✅ Loaded ${allFields.length} fields from API (${allFields.filter(f => f.active).length} active)`);

    } catch (error) {
        console.error('❌ Failed to load fields from API:', error);
        showNotification('Failed to load fields from API: ' + error.message, 'error');
        throw error;
    }
}

/**
 * Load custom fields created by user
 */
async function loadCustomFields() {
    try {
        if (!fieldMappingService || !fieldMappingService.getAllCustomFields) {
            console.warn('⚠️ FieldMappingService.getAllCustomFields not available');
            return;
        }

        const loadedCustomFields = fieldMappingService.getAllCustomFields();
        customFields = loadedCustomFields.map(field => ({
            id: field.id,
            name: field.sfFieldName,
            value: field.value || '',
            active: field.active !== false,
            isCustomField: true
        }));

        console.log(`✅ Loaded ${customFields.length} custom fields`);

    } catch (error) {
        console.error('❌ Failed to load custom fields:', error);
    }
}

/**
 * Get all fields (API fields + custom fields) for rendering
 */
function getAllFieldsForRendering() {
    // Combine API fields and custom fields
    return [...allFields, ...customFields];
}

/**
 * Render fields in the grid
 */
function renderFields() {
    const container = document.getElementById('fieldsContainer');
    const addCustomFieldBtn = document.getElementById('addCustomFieldBtn');

    // Get all fields (API + custom)
    const allFieldsCombined = getAllFieldsForRendering();

    // Show/hide "Add Custom Field" button based on filter
    if (addCustomFieldBtn) {
        addCustomFieldBtn.style.display = currentFilter === 'custom' ? 'flex' : 'none';
    }

    // Filter fields
    let filteredFields = allFieldsCombined.filter(field => {
        if (currentFilter === 'active' && !field.active) return false;
        if (currentFilter === 'inactive' && field.active) return false;
        if (currentFilter === 'required' && !field.required) return false;
        if (currentFilter === 'custom' && !field.isCustomField) return false;

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
        container.innerHTML = filteredFields.map(field => `
            <label class="field-item ${field.active ? 'active' : ''} ${field.required ? 'required' : ''} ${field.isCustomField ? 'user-custom-field' : ''}"
                   data-field="${field.name}"
                   data-is-custom="${field.isCustomField || false}">
                <input type="checkbox"
                       class="field-checkbox"
                       ${field.active ? 'checked' : ''}
                       ${field.required ? 'disabled' : ''}
                       onchange="toggleField('${field.name}', this.checked, ${field.isCustomField || false})" />
                <div class="field-info">
                    <div class="field-name">
                        ${field.name}
                        ${field.required ? '<span class="required-badge">REQUIRED</span>' : ''}
                        ${field.isCustomField ? '<span class="user-custom-badge">CUSTOM</span>' : ''}
                    </div>
                    ${field.isCustomField && field.value ? `<div class="field-value-preview">${field.value}</div>` : ''}
                </div>
                ${field.isCustomField ? `<button class="delete-custom-field" onclick="deleteCustomField(event, '${field.id}')" title="Delete custom field"><i class="fas fa-trash"></i></button>` : ''}
            </label>
        `).join('');
    }
}

/**
 * Toggle field active status (in memory only, no DB save)
 */
window.toggleField = function(fieldName, checked, isCustomField = false) {
    let field;

    if (isCustomField) {
        field = customFields.find(f => f.name === fieldName);
    } else {
        field = allFields.find(f => f.name === fieldName);
    }

    if (!field || field.required) return;

    // Update in memory only
    field.active = checked;

    // Update the field item styling
    const fieldItem = document.querySelector(`[data-field="${fieldName}"]`);
    if (fieldItem) {
        if (checked) {
            fieldItem.classList.add('active');
        } else {
            fieldItem.classList.remove('active');
        }
    }

    updateStatistics();
    console.log(`✅ Field ${fieldName} ${checked ? 'activated' : 'deactivated'} (not saved yet)`);
};

/**
 * Select all fields (in memory only, no DB save)
 */
window.selectAllFields = function() {
    for (const field of allFields) {
        if (!field.required && !field.active) {
            field.active = true;
        }
    }
    renderFields();
    showNotification('All fields selected (not saved yet)', 'success');
};

/**
 * Deselect all fields (except required) (in memory only, no DB save)
 */
window.deselectAllFields = function() {
    for (const field of allFields) {
        if (!field.required && field.active) {
            field.active = false;
        }
    }
    renderFields();
    showNotification('All optional fields deselected (not saved yet)', 'success');
};

/**
 * Save configuration and continue
 */
window.saveAndContinue = async function() {
    try {
        console.log('💾 Saving configuration...');

        // Update field configurations in memory WITHOUT triggering individual API saves
        // We'll do one bulk save at the end
        for (const field of allFields) {
            // Find existing field config
            const existingIndex = fieldMappingService.fieldConfig.config.fields.findIndex(
                f => f.fieldName === field.name
            );

            const fieldConfigData = {
                fieldName: field.name,
                active: field.active
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

        // Update custom fields active state in memory
        for (const field of customFields) {
            const customField = fieldMappingService.getAllCustomFields().find(f => f.id === field.id);
            if (customField) {
                customField.active = field.active;
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
            console.log(`✅ Configuration saved: ${activeCount} active fields (${allFields.filter(f => f.active).length} API + ${customFields.filter(f => f.active).length} custom)`);

            const leadSource = sessionStorage.getItem('selectedLeadSource') || 'lead';
            const targetPage = leadSource === 'leadReport' ? 'displayLsLeadReport.html' : 'displayLsLead.html';

            setTimeout(() => {
                window.location.href = targetPage;
            }, 1000);
        } else {
            throw new Error('Failed to save configuration');
        }

    } catch (error) {
        console.error('❌ Failed to save:', error);
        showNotification('Failed to save configuration: ' + error.message, 'error');
    }
};

/**
 * Navigate back
 */
window.goBack = function() {
    window.location.href = 'display.html';
};

/**
 * Update statistics
 */
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

/**
 * Open modal to add custom field
 */
window.openAddCustomFieldModal = function() {
    const modal = document.getElementById('customFieldModal');
    if (modal) {
        modal.style.display = 'flex';
        // Clear previous values
        document.getElementById('customFieldName').value = '';
        document.getElementById('customFieldValue').value = '';
    }
};

/**
 * Close custom field modal
 */
window.closeCustomFieldModal = function() {
    const modal = document.getElementById('customFieldModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

/**
 * Save custom field
 */
window.saveCustomField = async function() {
    const fieldName = document.getElementById('customFieldName').value.trim();
    const fieldValue = document.getElementById('customFieldValue').value.trim();

    if (!fieldName) {
        showNotification('Field name is required', 'error');
        return;
    }

    // Validate field name (no spaces, no special characters except underscore)
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(fieldName)) {
        showNotification('Invalid field name. Use only letters, numbers, and underscores. Must start with a letter.', 'error');
        return;
    }

    // Check if field name already exists
    const allFieldsCombined = getAllFieldsForRendering();
    if (allFieldsCombined.some(f => f.name === fieldName || f.name === `${fieldName}__c`)) {
        showNotification('A field with this name already exists', 'error');
        return;
    }

    try {
        // Add __c suffix if not present
        const sfFieldName = fieldName.endsWith('__c') ? fieldName : `${fieldName}__c`;

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

            showNotification('Custom field added successfully!', 'success');
            closeCustomFieldModal();
            renderFields();
        } else {
            throw new Error('FieldMappingService.addCustomField not available');
        }

    } catch (error) {
        console.error('❌ Failed to add custom field:', error);
        showNotification('Failed to add custom field: ' + error.message, 'error');
    }
};

/**
 * Delete custom field
 */
window.deleteCustomField = async function(event, fieldId) {
    event.preventDefault();
    event.stopPropagation();

    if (!confirm('Are you sure you want to delete this custom field?')) {
        return;
    }

    try {
        // Remove from FieldMappingService
        if (fieldMappingService && fieldMappingService.deleteCustomField) {
            await fieldMappingService.deleteCustomField(fieldId);

            // Remove from local array
            customFields = customFields.filter(f => f.id !== fieldId);

            showNotification('Custom field deleted successfully', 'success');
            renderFields();
        } else {
            throw new Error('FieldMappingService.deleteCustomField not available');
        }

    } catch (error) {
        console.error('❌ Failed to delete custom field:', error);
        showNotification('Failed to delete custom field: ' + error.message, 'error');
    }
};

/**
 * Setup event listeners
 */
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

/**
 * Show notification
 */
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

