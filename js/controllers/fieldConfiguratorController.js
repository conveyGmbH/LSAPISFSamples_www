const REQUIRED_FIELDS = ['LastName', 'Company'];

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

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {

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

        console.log('Field Configurator loaded successfully');

    } catch (error) {
        console.error('Failed to initialize:', error);
        showNotification('Failed to load field configuration', 'error');
    }
});

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

        // Show ALL fields from the API - no exclusions
        const availableFields = Object.keys(firstRecord);


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
                isApiField: true 
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

        // Create field items with event listeners (not inline onclick)
        filteredFields.forEach(field => {
            const fieldItem = createFieldItem(field);
            container.appendChild(fieldItem);
        });
    }
}

// Create a field item element with proper event listeners
function createFieldItem(field) {
    const label = document.createElement('label');
    label.className = `field-item ${field.active ? 'active' : ''} ${field.required ? 'required' : ''} ${field.isCustomField ? 'user-custom-field' : ''}`;
    label.dataset.field = field.name;
    label.dataset.isCustom = field.isCustomField || false;
    label.dataset.fieldId = field.id || '';

    // Field name display - FIXED: show actual field names for custom fields
    let fieldNameDisplay = '';
    if (field.isCustomField) {
        // Custom field: show "Custom" badge in purple + actual field name
        fieldNameDisplay = `
            <div class="field-name">
                <span style="color: #805ad5; font-weight: 600; font-size: 0.75rem; margin-right: 4px;">Custom:</span>
                <span>${field.name}</span>
                ${field.required ? '<span class="required-badge">REQUIRED</span>' : ''}
            </div>
        `;
    } else {
        // API field: show LS: prefix + field name
        fieldNameDisplay = `
            <div class="field-name">
                <span style="color: #718096; font-size: 0.75rem; margin-right: 4px;">LS:</span>
                <span>${field.name}</span>
                ${field.required ? '<span class="required-badge">REQUIRED</span>' : ''}
            </div>
        `;
    }

    // Build HTML structure
    label.innerHTML = `
        <input type="checkbox"
               class="field-checkbox"
               ${field.active ? 'checked' : ''}
               ${field.required ? 'disabled' : ''} />
        <div class="field-info">
            ${fieldNameDisplay}
            ${field.isCustomField && field.value ? `
                <div class="field-value-preview" style="font-size: 0.875rem; color: #4a5568; margin-top: 4px;">
                    Value: <span style="font-weight: 500;">${field.value}</span>
                </div>
            ` : ''}
        </div>
        ${field.isCustomField ? `
            <button class="delete-custom-field" title="Delete custom field">
                <i class="fas fa-trash"></i>
            </button>
        ` : ''}
    `;

    // Add event listeners
    const checkbox = label.querySelector('.field-checkbox');
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
        const fieldNameElement = label.querySelector('.field-name');
        fieldNameElement.style.cursor = 'pointer';
        fieldNameElement.title = 'Click to edit field value';

        fieldNameElement.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openEditCustomFieldModal(field);
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

        const typeColors = {
            warning: 'bg-yellow-500 hover:bg-yellow-600',
            danger: 'bg-red-500 hover:bg-red-600',
            info: 'bg-blue-500 hover:bg-blue-600'
        };

        const typeIcons = {
            warning: '<i class="fas fa-exclamation-triangle text-yellow-500 text-4xl mb-4"></i>',
            danger: '<i class="fas fa-trash-alt text-red-500 text-4xl mb-4"></i>',
            info: '<i class="fas fa-info-circle text-blue-500 text-4xl mb-4"></i>'
        };

        const escapeHtml = (text) => {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };

        const modalHTML = `
            <div id="modern-confirm-modal" class="fixed inset-0 z-[9999] flex items-center justify-center" style="background: rgba(0, 0, 0, 0.5); animation: fadeIn 0.2s ease-out;">
                <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 transform" style="animation: slideUp 0.3s ease-out;">
                    <div class="p-6 text-center">
                        ${typeIcons[type]}
                        <h3 class="text-xl font-bold text-gray-900 mb-2">${escapeHtml(title)}</h3>
                        <p class="text-gray-600 mb-6 whitespace-pre-line">${escapeHtml(message)}</p>
                        <div class="flex gap-3 justify-center">
                            <button id="modal-cancel-btn" class="px-6 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors">
                                ${escapeHtml(cancelText)}
                            </button>
                            <button id="modal-confirm-btn" class="px-6 py-2.5 ${typeColors[type]} text-white rounded-lg font-medium transition-colors">
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

