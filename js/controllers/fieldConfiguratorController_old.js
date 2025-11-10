// fieldConfiguratorController.js - Field Configuration Management
// FieldMappingService is loaded globally via script tag

// Salesforce required fields (cannot be disabled)
const REQUIRED_FIELDS = ['LastName', 'Company'];

// All available Salesforce Lead fields
const SALESFORCE_LEAD_FIELDS = [
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
    'State', 'StateCode', 'Status', 'Street', 'Suffix', 'Title', 'Website'
];

// Field categories for better organization
const FIELD_CATEGORIES = {
    'Personal Info': ['FirstName', 'LastName', 'MiddleName', 'Salutation', 'Suffix', 'Email', 'Phone', 'MobilePhone', 'Fax'],
    'Company Info': ['Company', 'Title', 'Industry', 'NumberOfEmployees', 'AnnualRevenue', 'Website', 'Division'],
    'Address': ['Street', 'City', 'State', 'StateCode', 'PostalCode', 'Country', 'CountryCode', 'Address', 'Latitude', 'Longitude'],
    'Lead Management': ['Status', 'Rating', 'LeadSource', 'OwnerId', 'Description'],
    'Custom Fields': [] // Will be populated with Question01, Answer01, Text01, etc.
};

// Global variables
let fieldMappingService = null;
let allFields = [];
let currentFilter = 'all';
let searchQuery = '';

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Field Configurator initializing...');

    try {
        // Initialize Field Mapping Service
        fieldMappingService = new FieldMappingService();

        // Get event ID from URL parameters or session
        const urlParams = new URLSearchParams(window.location.search);
        const eventId = urlParams.get('eventId') || sessionStorage.getItem('selectedEventId');
        const leadSource = urlParams.get('source') || sessionStorage.getItem('selectedLeadSource') || 'lead';

        if (eventId) {
            fieldMappingService.setCurrentEventId(eventId);
            sessionStorage.setItem('selectedEventId', eventId);
            sessionStorage.setItem('selectedLeadSource', leadSource);
            console.log(`📋 Loaded configuration for Event ID: ${eventId}, Source: ${leadSource}`);

            // Update event info in UI
            const eventInfo = document.getElementById('event-info');
            if (eventInfo) {
                eventInfo.textContent = `Configure which fields will be transferred to Salesforce for Event ${eventId} (${leadSource}). Required fields (LastName, Company) are always included.`;
            }
        } else {
            console.warn('⚠️ No event ID available');
            showNotification('No event selected. Please select an event first.', 'error');
        }

        // Get lead data to find custom fields
        const leadDataStr = sessionStorage.getItem('selectedLeadData');
        const leadData = leadDataStr ? JSON.parse(leadDataStr) : null;

        // Initialize field mapping service with lead data
        if (leadData && eventId) {
            await fieldMappingService.initializeFields(leadData, eventId);
        }

        // Load all fields
        await loadAllFields(leadData);

        // Render fields
        renderFields();

        // Setup event listeners
        setupEventListeners();

        console.log('✅ Field Configurator loaded successfully');

    } catch (error) {
        console.error('❌ Failed to initialize Field Configurator:', error);
        showNotification('Failed to load field configuration', 'error');
    }
});

/**
 * Load all available fields from lead data and Salesforce standard fields
 */
async function loadAllFields(leadData) {
    allFields = [];

    // Start with Salesforce standard fields
    const standardFields = [...SALESFORCE_LEAD_FIELDS];

    // Add custom fields from lead data (Question01, Answer01, Text01, etc.)
    const customFieldPattern = /^(Question|Answers|Text)\d{2}$/;
    if (leadData) {
        Object.keys(leadData).forEach(fieldName => {
            if (customFieldPattern.test(fieldName)) {
                if (!standardFields.includes(fieldName)) {
                    standardFields.push(fieldName);
                }
            }
        });
    }

    // Create field objects
    for (const fieldName of standardFields) {
        const fieldConfig = fieldMappingService.getFieldConfig(fieldName);
        const isRequired = REQUIRED_FIELDS.includes(fieldName);
        const isActive = fieldConfig ? fieldConfig.active !== false : true;

        allFields.push({
            name: fieldName,
            label: formatFieldLabel(fieldName),
            active: isRequired ? true : isActive,
            required: isRequired,
            category: getFieldCategory(fieldName)
        });
    }

    console.log(`📊 Loaded ${allFields.length} fields (${allFields.filter(f => f.active).length} active)`);
}

/**
 * Get category for a field
 */
function getFieldCategory(fieldName) {
    for (const [category, fields] of Object.entries(FIELD_CATEGORIES)) {
        if (fields.includes(fieldName)) {
            return category;
        }
    }

    // Check if it's a custom field
    if (/^(Question|Answers|Text)\d{2}$/.test(fieldName)) {
        return 'Custom Fields';
    }

    return 'Other';
}

/**
 * Format field label for display
 */
function formatFieldLabel(fieldName) {
    // Check for custom label first
    if (fieldMappingService && fieldMappingService.customLabels[fieldName]) {
        return fieldMappingService.customLabels[fieldName];
    }

    // Default formatting: add spaces before capital letters
    return fieldName.replace(/([A-Z])/g, ' $1').trim();
}

/**
 * Render fields in the grid
 */
function renderFields() {
    const container = document.getElementById('fieldsContainer');

    // Filter fields based on current filter and search
    let filteredFields = allFields.filter(field => {
        // Apply filter
        if (currentFilter === 'active' && !field.active) return false;
        if (currentFilter === 'inactive' && field.active) return false;
        if (currentFilter === 'required' && !field.required) return false;

        // Apply search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            return field.name.toLowerCase().includes(query) ||
                   field.label.toLowerCase().includes(query);
        }

        return true;
    });

    // Update statistics
    updateStatistics();

    // Render fields
    if (filteredFields.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">No fields found</div>
                <div>Try adjusting your search or filter</div>
            </div>
        `;
    } else {
        container.className = 'fields-grid';
        container.innerHTML = filteredFields.map(field => `
            <div class="field-item ${field.active ? 'active' : ''} ${field.required ? 'required' : ''}"
                 data-field="${field.name}">
                <div class="field-info">
                    <div class="field-name">
                        ${field.name}
                        ${field.required ? '<span class="required-badge">REQUIRED</span>' : ''}
                    </div>
                    <div class="field-label">${field.label}</div>
                </div>
                <div class="toggle-switch ${field.active ? 'active' : ''} ${field.required ? 'required' : ''}"
                     onclick="${field.required ? '' : 'toggleField(\'' + field.name + '\')'}"></div>
            </div>
        `).join('');
    }
}

/**
 * Toggle field active status
 */
window.toggleField = async function(fieldName) {
    const field = allFields.find(f => f.name === fieldName);
    if (!field || field.required) return;

    // Toggle status
    field.active = !field.active;

    // Update field mapping service
    await fieldMappingService.setFieldConfig(fieldName, { active: field.active });

    // Re-render
    renderFields();

    console.log(`✅ Field ${fieldName} ${field.active ? 'activated' : 'deactivated'}`);
};

/**
 * Select all fields
 */
window.selectAllFields = async function() {
    for (const field of allFields) {
        if (!field.required) {
            field.active = true;
            await fieldMappingService.setFieldConfig(field.name, { active: true });
        }
    }
    renderFields();
    showNotification('All fields selected', 'success');
};

/**
 * Deselect all fields (except required)
 */
window.deselectAllFields = async function() {
    for (const field of allFields) {
        if (!field.required) {
            field.active = false;
            await fieldMappingService.setFieldConfig(field.name, { active: false });
        }
    }
    renderFields();
    showNotification('All optional fields deselected', 'success');
};

/**
 * Save configuration
 */
window.saveConfiguration = async function() {
    try {
        console.log('💾 Saving field configuration...');

        // Save to database
        const success = await fieldMappingService.bulkSaveToDatabase();

        if (success) {
            showNotification('Configuration saved successfully!', 'success');
            console.log('✅ Configuration saved to database');
        } else {
            throw new Error('Failed to save configuration');
        }

    } catch (error) {
        console.error('❌ Failed to save configuration:', error);
        showNotification('Failed to save configuration: ' + error.message, 'error');
    }
};

/**
 * Update statistics
 */
function updateStatistics() {
    const total = allFields.length;
    const active = allFields.filter(f => f.active).length;
    const inactive = total - active;

    document.getElementById('totalFieldsCount').textContent = total;
    document.getElementById('activeFieldsCount').textContent = active;
    document.getElementById('inactiveFieldsCount').textContent = inactive;
}

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
            // Update active tab
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update filter
            currentFilter = tab.dataset.filter;
            renderFields();
        });
    });
}

/**
 * Save configuration and continue to leads page
 */
window.saveAndContinue = async function() {
    try {
        console.log('💾 Saving configuration and continuing to leads...');

        // Save to database
        const success = await fieldMappingService.bulkSaveToDatabase();

        if (success) {
            showNotification('Configuration saved successfully!', 'success');
            console.log('✅ Configuration saved to database');

            // Determine which page to redirect to based on lead source
            const leadSource = sessionStorage.getItem('selectedLeadSource') || 'lead';
            const targetPage = leadSource === 'leadReport' ? 'displayLsLeadReport.html' : 'displayLsLead.html';

            // Small delay to show the success message
            setTimeout(() => {
                window.location.href = targetPage;
            }, 1000);
        } else {
            throw new Error('Failed to save configuration');
        }

    } catch (error) {
        console.error('❌ Failed to save configuration:', error);
        showNotification('Failed to save configuration: ' + error.message, 'error');
    }
};

/**
 * Navigate back to events page
 */
window.goBack = function() {
    window.location.href = 'display.html';
};

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

// Export for use in other modules
export { fieldMappingService, REQUIRED_FIELDS };
