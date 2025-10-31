// FieldMappingService.js
class FieldMappingService {
    constructor() {
        this.fieldConfig = this.loadConfig();
        this.customLabels = {};
        this.customFieldNames = {};
        this.customFields = []; // 🆕 Custom fields created by client
        this.credentials = sessionStorage.getItem('credentials');
        this.currentEventId = null;

        this.serverName = sessionStorage.getItem('serverName') || 'lstest.convey.de';
        this.apiName = sessionStorage.getItem('apiName') || 'apisftest';

        // Load custom field name mappings
        this.loadCustomFieldNames();

        // Load custom fields
        this.loadCustomFields();
    }

    // Create a basic API service for database interactions
    createApiService() {
        return {
            request: async (method, endpoint, data = null) => {
                const errorElement = document.getElementById("errorMessage");
                if (errorElement) errorElement.style.display = "none";

                try {
                    if (!this.credentials) {
                        throw new Error("No credentials found");
                    }

                    const headers = new Headers({
                        Accept: "application/json",
                        Authorization: `Basic ${this.credentials}`,
                    });

                    if (method !== "GET") {
                        headers.append("Content-Type", "application/json");
                    }

                    const config = {
                        method,
                        headers,
                        credentials: "same-origin",
                    };

                    if (data) {
                        config.body = JSON.stringify(data);
                    }

                    const url = `https://${this.serverName}/${this.apiName}/${endpoint}`;
                    console.log("API Request:", method, url);
                    const response = await fetch(url, config);

                    if (!response.ok) {
                        let errorData = {};
                        try {
                            const text = await response.text();
                            if (text.trim()) {
                                errorData = JSON.parse(text);
                            }
                        } catch (parseError) {
                            console.warn('Could not parse error response as JSON:', parseError);
                        }
                        throw new Error(`HTTP ${response.status}: ${errorData.message || response.statusText}`);
                    }

                    // Handle successful responses
                    const text = await response.text();
                    console.log(`API Response (${response.status}):`, text.substring(0, 200) + (text.length > 200 ? '...' : ''));

                    if (!text.trim()) {
                        return { success: true };
                    }

                    try {
                        return JSON.parse(text);
                    } catch (parseError) {
                        console.warn('Response is not valid JSON:', text);
                        throw new Error(`Invalid JSON response: ${parseError.message}`);
                    }
                } catch (error) {
                    console.error('API request error:', error);
                    throw error;
                }
            }
        };
    }

       
    // Initialize fields and load from API     
    async initializeFields(leadData, eventId) {
    try {
        this.currentEventId = eventId;

        //Load existing configuration from API FIRST if eventId is provided
        if (eventId) {
            console.log(`Loading field mappings from API for event: ${eventId}`);
            await this.loadFieldMappingsFromAPI(eventId);
            
        }

        // Initialize any new fields from lead data (only if not already configured)
        if (leadData) {
            Object.keys(leadData).forEach(fieldName => {
                const existingConfig = this.getFieldConfig(fieldName);
                if (!existingConfig) {
                    this.setFieldConfigLocal(fieldName, { active: true });
                } else {
                }
            });
        }
        return true;

    } catch (error) {
        console.error('Field mapping initialization failed, falling back to local-only mode:', error);

        // Initialize fields locally if API failed
        if (leadData) {
            Object.keys(leadData).forEach(fieldName => {
                const existingConfig = this.getFieldConfig(fieldName);
                if (!existingConfig) {
                    this.setFieldConfigLocal(fieldName, { active: true });
                }
            });
        }
        return true;
    }
}

setFieldConfigLocal(fieldName, config) {
    if (!this.fieldConfig.config) {
        this.fieldConfig.config = { fields: [] };
    }

    const existingIndex = this.fieldConfig.config.fields.findIndex(
        field => field.fieldName === fieldName
    );
    
    const fieldConfig = {
        fieldName: fieldName,
        active: config.active !== undefined ? config.active : true,
        customLabel: this.customLabels[fieldName] || this.formatFieldLabel(fieldName),
        updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
        this.fieldConfig.config.fields[existingIndex] = {
            ...this.fieldConfig.config.fields[existingIndex],
            ...fieldConfig
        };
    } else {
        this.fieldConfig.config.fields.push(fieldConfig);
    }

    // Save locally only
    this.saveConfig();
}

    // Load field mappings from API
    async loadFieldMappingsFromAPI(eventId) {
    if (!eventId) {
        console.log('❌ No event ID provided, skipping database load');
        return;
    }

    if (!this.credentials) {
        console.warn('No credentials available for database access');
        return;
    }

    try {
        const endpoint = `LS_FieldMappings?$filter=EventId eq '${eventId}'&$format=json`;
        console.log(`API Endpoint: https://${this.serverName}/${this.apiName}/${endpoint}`);

        const data = await this.createApiService().request('GET', endpoint);

        if (!data) {
            console.log('No data returned from API');
            return;
        }


        if (data.d && data.d.results && data.d.results.length > 0) {
            const configRecord = data.d.results[0];

            if (configRecord.ConfigData) {
                try {
                    const parsedConfig = JSON.parse(configRecord.ConfigData);

                    // Load configuration with validation
                    if (parsedConfig.fieldConfig) {
                        this.fieldConfig = parsedConfig.fieldConfig;
                    }

                    if (parsedConfig.customLabels) {
                        this.customLabels = parsedConfig.customLabels;
                    }

                    // 🆕 Load custom fields if available
                    if (parsedConfig.customFields && Array.isArray(parsedConfig.customFields)) {
                        this.customFields = parsedConfig.customFields;
                        console.log(`✅ Loaded ${this.customFields.length} custom fields from API`);
                    }

                } catch (parseError) {
                    console.error('Failed to parse ConfigData from database, using default config:', parseError);
                    console.log('Raw ConfigData:', configRecord.ConfigData?.substring(0, 500));
                }
            } else {
                console.log('Configuration record found but no ConfigData');
            }
        } else {
            console.log('No existing field mappings found in database for this event');
            console.log('API Response structure:', data);
        }

    } catch (error) {
        console.error('Failed to load field mappings from database, continuing with local config:', error);
        return false;
    }
}


//  Save field mappings to API/Database
async saveFieldMappingsToAPI(fieldName, operation = 'update') {
    if (!this.currentEventId) {
        console.warn('No event ID available for saving to database');
        return false;
    }

    if (!this.credentials) {
        console.warn('No credentials available for database save');
        return false;
    }

    try {        
        if (fieldName !== 'bulk_save') {
            this.showSaveIndicator(fieldName, 'saving');
        }

        // Prepare configuration data to store in ConfigData field
        const configData = {
            fieldConfig: this.fieldConfig,
            customLabels: this.customLabels,
            customFields: this.customFields || [], // 🆕 Include custom fields
            lastModified: new Date().toISOString(),
            modifiedField: fieldName,
            operation: operation,
            version: "1.0"
        };

        // Check if record already exists for this EventId
        console.log('Checking for existing configuration record...');
        const existingRecord = await this.findExistingRecord();

        let saveResponse;
        
        if (existingRecord) {
            // Update existing record
            console.log(`Updating existing record with ID: ${existingRecord.FieldMappingsViewId}`);
            saveResponse = await this.updateRecord(existingRecord.FieldMappingsViewId, configData);
        } else {
            // Create new record
            console.log('Creating new configuration record...');
            saveResponse = await this.createRecord(configData);
        }

        if (saveResponse.success) {
            if (fieldName !== 'bulk_save') {
                this.showSaveIndicator(fieldName, 'success');
            }
            console.log('Field mappings saved to database successfully');
            return true;
        } else {
            throw new Error(saveResponse.error || 'Database save operation failed');
        }

    } catch (error) {
        console.error('Failed to save field mappings to database:', error);
        if (fieldName !== 'bulk_save') {
            this.showSaveIndicator(fieldName, 'error');
        }
        return false;
    }
}


// Find existing record in database
async findExistingRecord() {
    try {
        const endpoint = `LS_FieldMappings?$filter=EventId eq '${this.currentEventId}'&$format=json`;
        const data = await this.createApiService().request('GET', endpoint);

        if (data.d && data.d.results && data.d.results.length > 0) {
            return data.d.results[0];
        }
        return null;

    } catch (error) {
        console.error('Error finding existing record:', error);
        throw error;
    }
}

//  Create new record in database
async createRecord(configData) {
    try {
        const payload = {
            ApiEndpoint: 'LeadSuccess_Event_API',
            EventId: this.currentEventId,
            ConfigData: JSON.stringify(configData)
        };

        const result = await this.createApiService().request('POST', 'LS_FieldMappings', payload);


        if (result) {
            console.log('Record created successfully:', result);
            return { success: true, data: result };
        } else {
            return { success: false, error: 'POST request failed' };
        }

    } catch (error) {
        console.error('Error creating record:', error);
        return { success: false, error: error.message };
    }
}

// Update existing record in database
async updateRecord(recordId, configData) {
    try {        
        const currentData = await this.findExistingRecord();
        if (!currentData) {
            throw new Error('Cannot find record to update');
        }

        try {
            await this.createApiService().request('DELETE', `LS_FieldMappings(${recordId})`);
        } catch (deleteError) {
        }

        const createResult = await this.createRecord(configData);        
        if (createResult.success) {
            console.log('Record updated via delete-recreate strategy');
            return { success: true };
        } else {
            throw new Error('Failed to recreate record');
        }

} catch (error) {        
        try {
            const payload = { ConfigData: JSON.stringify(configData) };
            const result = await this.createApiService().request('PUT', `LS_FieldMappings(${recordId})`, payload);
            
            if (result) {
                console.log('Record updated via PUT fallback');
                return { success: true };
            }
        } catch (putError) {
            console.error('PUT fallback also failed:', putError);
        }
        
        return { success: false, error: error.message };
    }
}


    // Show save indicator for user feedback
    showSaveIndicator(fieldName, status) {
        const fieldElement = document.querySelector(`[data-field-name="${fieldName}"]`);
        if (!fieldElement) return;

        // Remove existing indicators
        const existingIndicator = fieldElement.querySelector('.save-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }

        // Create indicator
        const indicator = document.createElement('div');
        indicator.className = `save-indicator save-${status}`;
        
        const icons = {
            saving: '<svg class="spinner" width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
            success: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
            error: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        };

        indicator.innerHTML = icons[status];
        
        // Add to field header
        const fieldHeader = fieldElement.querySelector('.field-header');
        if (fieldHeader) {
            fieldHeader.appendChild(indicator);
        }

        // Auto-remove success/error indicators after 2 seconds
        if (status !== 'saving') {
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.remove();
                }
            }, 2000);
        }
    }

    //  Set custom label and save immediately to API
    async setCustomLabel(fieldName, label) {
        this.customLabels[fieldName] = label;
        
        const fieldConfig = this.getFieldConfig(fieldName) || {};
        fieldConfig.customLabel = label;
        this.setFieldConfig(fieldName, fieldConfig);
        
        await this.saveFieldMappingsToAPI(fieldName, 'label');
        
        // Also save locally as backup
        this.saveCustomLabels();
    }

    async updateExistingRecord(configData) {
    try {
        // Find existing record
        const findResponse = await fetch(
            `${this.apiBaseUrl}/LS_FieldMappings?$filter=EventId eq '${this.currentEventId}'&$format=json`,
            {
                headers: {
                    'Authorization': `Basic ${this.credentials}`,
                    'Accept': 'application/json'
                }
            }
        );

        if (findResponse.ok) {
            const findData = await findResponse.json();
            
            if (findData.d && findData.d.results && findData.d.results.length > 0) {
                const existingRecord = findData.d.results[0];
                const recordId = existingRecord.FieldMappingsViewId;
                
                console.log(`Updating existing record with ID: ${recordId}`);

                const updateResponse = await fetch(
                    `${this.apiBaseUrl}/LS_FieldMappings(${recordId})`,
                    {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Basic ${this.credentials}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({
                            ConfigData: JSON.stringify(configData),
                            LastModified: new Date().toISOString()
                        })
                    }
                );

                if (updateResponse.ok) {
                    console.log('Record updated successfully');
                    return true;
                } else {
                    const errorText = await updateResponse.text();
                    throw new Error(`Update failed: ${updateResponse.status} - ${errorText}`);
                }
            }
        }
        
        throw new Error('Could not find existing record to update');
        
    } catch (error) {
        console.error('Failed to update existing record:', error);
        throw error;
    }
}


// Get current event ID
getCurrentEventId() {
    if (!this.currentEventId) {
        // Try to get from sessionStorage if not set
        const sessionEventId = sessionStorage.getItem('selectedEventId');
        if (sessionEventId) {
            this.currentEventId = sessionEventId;
            console.log('Event ID recovered from session storage:', sessionEventId);
        }
    }
    return this.currentEventId;
}

/**
 * Set current event ID
 * @param {string} eventId - Event ID to set
 */
setCurrentEventId(eventId) {
    this.currentEventId = eventId;
    console.log('Event ID set to:', eventId);
}






    // Charger la configuration depuis le localStorage
    loadConfig() {
        const savedConfig = localStorage.getItem('salesforce_field_mapping');
        return savedConfig ? JSON.parse(savedConfig) : {
            apiEndpoint: "LeadSuccess_Event_API",
            eventId: null,
            config: { fields: [] }
        };
    }

    // Charger les labels personnalisés
    loadCustomLabels() {
        const savedLabels = localStorage.getItem('salesforce_custom_labels');
        return savedLabels ? JSON.parse(savedLabels) : {};
    }

    // Sauvegarder la configuration
    saveConfig() {
        localStorage.setItem('salesforce_field_mapping', JSON.stringify(this.fieldConfig));
    }

    // Sauvegarder les labels personnalisés
    saveCustomLabels() {
        localStorage.setItem('salesforce_custom_labels', JSON.stringify(this.customLabels));
    }

    // Obtenir la configuration d'un champ
    getFieldConfig(fieldName) {
        if (!this.fieldConfig.config || !this.fieldConfig.config.fields) {
            return null;
        }
        return this.fieldConfig.config.fields.find(field => field.fieldName === fieldName);
    }

    // Définir la configuration d'un champ
    async setFieldConfig(fieldName, config) {
        if (!this.fieldConfig.config) {
            this.fieldConfig.config = { fields: [] };
        }

         const existingIndex = this.fieldConfig.config.fields.findIndex(
            field => field.fieldName === fieldName
        );

        const fieldConfig = {
            fieldName: fieldName,
            active: config.active !== undefined ? config.active : true,
            customLabel: this.customLabels[fieldName] || this.formatFieldLabel(fieldName),
            updatedAt: new Date().toISOString()
        };

        if (existingIndex >= 0) {
            // Merge with existing config to preserve settings
            this.fieldConfig.config.fields[existingIndex] = {
                ...this.fieldConfig.config.fields[existingIndex],
                ...fieldConfig
            };
        } else {
            this.fieldConfig.config.fields.push(fieldConfig);
        }

        // Skip database saves during backend load to prevent spam
        if (!this._isLoadingFromBackend) {
            // Save to API immediately if we have an event ID
            if (this.currentEventId) {
               try {
                const success = await this.saveFieldMappingsToAPI(fieldName, 'toggle');
                if (success) {
                    console.log(`Field config for ${fieldName} saved to database successfully`);
                } else {
                    console.warn(`Failed to save field config for ${fieldName} to database`);
                }
            } catch (error) {
                console.error(`Error saving field config for ${fieldName} to database:`, error);
            }
            }
        } else {
            console.log(`⏭️  Skipping database save for ${fieldName} - loading from backend`);
        }

        //Also save locally as backup

        this.saveConfig();
        console.log(`Field config set for ${fieldName}:`, fieldConfig);

        // Sync active fields with backend
        await this.syncWithBackend();
    }

    async setCustomLabel(fieldName, label) {
    this.customLabels[fieldName] = label;
    
    // Update field config as well
    const fieldConfig = this.getFieldConfig(fieldName) || {};
    fieldConfig.customLabel = label;
    
    // Save to database immediately
    try {
        const success = await this.saveFieldMappingsToAPI(fieldName, 'label');
        if (success) {
            console.log(`Custom label for ${fieldName} saved to database successfully`);
        } else {
            console.warn(`Failed to save custom label for ${fieldName} to database`);
        }
    } catch (error) {
        console.error(`Error saving custom label for ${fieldName} to database:`, error);
        throw error; // Re-throw to let UI handle the error
    }
    
    // Also save locally as backup
    this.saveCustomLabels();

    // Update the field configuration locally
    await this.setFieldConfigLocal(fieldName, fieldConfig);

    // Sync active fields with backend
    await this.syncWithBackend();
}

/* Bulk save all configurations to database
 * @returns {boolean} Success status
 */
async bulkSaveToDatabase() {
    // Get current event ID with fallback
    const eventId = this.getCurrentEventId();
    
    if (!eventId) {
        console.error('Bulk save failed: No event ID available');
        console.log('Available session data:', {
            selectedEventId: sessionStorage.getItem('selectedEventId'),
            selectedLeadSource: sessionStorage.getItem('selectedLeadSource'),
            hasLeadData: !!sessionStorage.getItem('selectedLeadData')
        });
        throw new Error('No event ID available for bulk save. Please refresh the page and try again.');
    }

    console.log('Performing bulk save to database with event ID:', eventId);
    
    const success = await this.saveFieldMappingsToAPI('bulk_save', 'bulk_export');
    
    if (success) {
        console.log('Bulk save to database completed successfully');
    } else {
        console.error('Bulk save to database failed');
    }
    
    return success;
}
    
    formatFieldLabel(fieldName) {
        return fieldName;
    }

    exportConfiguration() {
        const exportData = {
            exportedAt: new Date().toISOString(),
            version: "1.0",
            fieldMapping: this.fieldConfig,
            customLabels: this.customLabels,
            metadata: {
                totalFields: this.fieldConfig.config?.fields?.length || 0,
                activeFields: this.fieldConfig.config?.fields?.filter(f => f.active).length || 0,
                customLabelsCount: Object.keys(this.customLabels).length
            }
        };

        return exportData;
    }

    filterFields(fields, filterType) {
        if (filterType === 'all') return fields;
        
        return fields.map(field => {
            const fieldConfig = this.getFieldConfig(field.apiName);
            const isActive = fieldConfig ? fieldConfig.active : true;
            
            if (filterType === 'active' && isActive) return field;
            if (filterType === 'inactive' && !isActive) return field;
            return null;
        }).filter(field => field !== null);
    }

    applyCustomLabels(leadData) {
        const result = {};

        for (const [key, value] of Object.entries(leadData)) {
            const fieldConfig = this.getFieldConfig(key);
            const customLabel = this.customLabels[key];
            const finalLabel = customLabel || this.formatFieldLabel(key);

            result[key] = {
                value: value,
                label: finalLabel,
                active: fieldConfig ? fieldConfig.active !== false : true
            };  
        }

        return result;
    }

    // Get all field names that have been configured
    getAllConfiguredFields() {
        return this.fieldConfig.config?.fields?.map(f => f.fieldName) || [];
    }

    // Check if a field is active
    isFieldActive(fieldName) {
        const config = this.getFieldConfig(fieldName);
        return config ? config.active !== false : true;
    }
    // Set custom Salesforce field name for a field
    setCustomFieldName(originalFieldName, salesforceFieldName) {
        this.customFieldNames[originalFieldName] = salesforceFieldName;
        this.saveCustomFieldNames();
    }

    // Get custom Salesforce field name for a field
    getCustomFieldName(originalFieldName) {
        return this.customFieldNames[originalFieldName] || originalFieldName;
    }


    // Get all custom field name mappings
    getAllCustomFieldNames() {
        return { ...this.customFieldNames };
    }

    // Save custom field names to localStorage
    saveCustomFieldNames() {
        try {
            localStorage.setItem('fieldMappingCustomNames', JSON.stringify(this.customFieldNames));
        } catch (error) {
            console.error('Failed to save custom field names:', error);
        }
    }

    //  Load custom field names from localStorage
    loadCustomFieldNames() {
        try {
            const saved = localStorage.getItem('fieldMappingCustomNames');
            if (saved) {
                this.customFieldNames = JSON.parse(saved);
                console.log('Loaded custom field names:', this.customFieldNames);
            }
        } catch (error) {
            console.error('Failed to load custom field names:', error);
            this.customFieldNames = {};
        }
    }

    mapFieldNamesForSalesforce(leadData) {
        const mappedData = {};

        // Excluding system field from SF transfer
        const systemFieldsToExclude = [
            '__metadata', 'KontaktViewId', 'Id', 'CreatedDate', 'LastModifiedDate',
            'CreatedById', 'LastModifiedById', 'DeviceId', 'DeviceRecordId',
            'RequestBarcode', 'EventId', 'SystemModstamp','AttachmentIdList',
            'IsReviewed', 'StatusMessage'
        ];

        for (const [originalField, value] of Object.entries(leadData)) {
            if (systemFieldsToExclude.includes(originalField)) {
                console.log(`Excluding system field from SF transfer: ${originalField}`);
                continue;
            }

            const isActive = this.isFieldActive(originalField);
            if (isActive === false) {
                console.log(`Excluding inactive field from SF transfer: ${originalField}`);
                continue;
            }

            let salesforceFieldName = originalField;

            // Auto-add __c suffix for Question/Answers/Text fields if not already present
            // Question01 -> Question01__c, Answers01 -> Answers01__c, Text01 -> Text01__c
            if (/^(Question|Answers|Text)\d{2}$/.test(originalField) && !originalField.endsWith('__c')) {
                salesforceFieldName = `${originalField}__c`;
                console.log(`Auto-added __c suffix: ${originalField} → ${salesforceFieldName}`);
            } else {
                const customLabel = this.customLabels[originalField];
                const defaultLabel = this.formatFieldLabel(originalField);

                const isValidSalesforceFieldName = (name) => {
                    if (!name || name.trim() === '') return false;
                    return /^[a-zA-Z][a-zA-Z0-9_]*(__c)?$/.test(name.trim());
                };

                if (customLabel && customLabel.trim() !== '' && customLabel !== defaultLabel) {
                    const trimmedLabel = customLabel.trim();

                    if (isValidSalesforceFieldName(trimmedLabel)) {
                        salesforceFieldName = trimmedLabel;
                    } else {
                        salesforceFieldName = originalField;
                    }
                }
                else if (this.customFieldNames[originalField]) {
                    salesforceFieldName = this.customFieldNames[originalField];
                }
                else {
                    console.log(`Using original field name: ${originalField}`);
                }
            }
            mappedData[salesforceFieldName] = value;
        }

        return mappedData;
    }

    // Apply enhanced data processing with field values
    applyEnhancedLabels(leadData) {
        if (window.enhancedFieldMappingService) {
            return window.enhancedFieldMappingService.applyEnhancedDataProcessing(leadData);
        }
        return this.applyCustomLabels(leadData);
    }

    // ========== BACKEND SYNCHRONIZATION ==========

    /**
     * Get list of active field names
     * @returns {Array} Array of active field names
     */
    getActiveFieldNames() {
        const activeFields = [];
        if (this.fieldConfig && this.fieldConfig.config && this.fieldConfig.config.fields) {
            for (const field of this.fieldConfig.config.fields) {
                if (field.active !== false) {
                    activeFields.push(field.fieldName);
                }
            }
        }
        return activeFields;
    }

    /**
     * Save active fields configuration to backend
     * @returns {Promise} Promise resolving to backend response
     */
    async saveActiveFieldsToBackend() {
        try {
            const activeFields = this.getActiveFieldNames();
            const customLabels = this.customLabels || {};

            console.log(`💾 Saving ${activeFields.length} active fields to backend...`);

            const response = await fetch('http://localhost:3000/api/salesforce/field-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    activeFields,
                    customLabels
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to save field config: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('✅ Field configuration saved to backend:', result);
            return result;

        } catch (error) {
            console.error('❌ Failed to save field configuration to backend:', error);
            throw error;
        }
    }

    /**
     * Load active fields configuration from backend
     * @returns {Promise} Promise resolving to configuration
     */
    async loadActiveFieldsFromBackend() {
        try {
            console.log('📥 Loading field configuration from backend...');

            const response = await fetch('http://localhost:3000/api/salesforce/field-config', {
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) {
                if (response.status === 401) {
                    console.log('ℹ️  Not connected to Salesforce, skipping field config load');
                    return null;
                }
                throw new Error(`Failed to load field config: ${response.statusText}`);
            }

            const config = await response.json();
            console.log(`✅ Loaded ${config.activeFields?.length || 0} active fields from backend`);

            // Disable auto-sync during initial load to prevent infinite loop
            this._isLoadingFromBackend = true;

            // Apply the configuration
            if (config.activeFields && config.activeFields.length > 0) {
                // Update local field config to match backend
                for (const fieldName of config.activeFields) {
                    await this.setFieldConfig(fieldName, { active: true });
                }

                // Deactivate fields not in the active list
                if (this.fieldConfig && this.fieldConfig.config && this.fieldConfig.config.fields) {
                    for (const field of this.fieldConfig.config.fields) {
                        if (!config.activeFields.includes(field.fieldName)) {
                            await this.setFieldConfig(field.fieldName, { active: false });
                        }
                    }
                }
            }

            // Apply custom labels if present
            if (config.customLabels) {
                this.customLabels = { ...this.customLabels, ...config.customLabels };
                this.saveConfig();
            }

            // Re-enable auto-sync after load completes
            this._isLoadingFromBackend = false;

            return config;

        } catch (error) {
            console.error('❌ Failed to load field configuration from backend:', error);
            this._isLoadingFromBackend = false;
            return null;
        }
    }

    /**
     * Sync field configuration with backend after field toggle
     * This should be called whenever a field is activated/deactivated
     */
    async syncWithBackend() {
        // Skip sync if we're currently loading from backend (prevents infinite loop)
        if (this._isLoadingFromBackend) {
            console.log('⏭️  Skipping sync - currently loading from backend');
            return;
        }

        // Debounce to avoid too many calls
        if (this.syncTimeout) {
            clearTimeout(this.syncTimeout);
        }

        this.syncTimeout = setTimeout(async () => {
            try {
                await this.saveActiveFieldsToBackend();
            } catch (error) {
                console.error('Failed to sync with backend:', error);
            }
        }, 1000); // Wait 1 second after last change
    }

    // ========== CUSTOM FIELDS MANAGEMENT (Client-created fields) ==========

    /**
     * Load custom fields from localStorage
     */
    loadCustomFields() {
        try {
            const saved = localStorage.getItem('salesforce_custom_fields');
            if (saved) {
                this.customFields = JSON.parse(saved);
                console.log(`✅ Loaded ${this.customFields.length} custom fields from localStorage`);
            } else {
                this.customFields = [];
            }
        } catch (error) {
            console.error('❌ Failed to load custom fields:', error);
            this.customFields = [];
        }
    }

    /**
     * Save custom fields to localStorage
     */
    saveCustomFields() {
        try {
            localStorage.setItem('salesforce_custom_fields', JSON.stringify(this.customFields));
            console.log(`💾 Saved ${this.customFields.length} custom fields to localStorage`);
        } catch (error) {
            console.error('❌ Failed to save custom fields:', error);
        }
    }

    /**
     * Get all custom fields
     * @returns {Array} Array of custom field objects
     */
    getAllCustomFields() {
        return this.customFields || [];
    }

    /**
     * Get active custom fields only
     * @returns {Array} Array of active custom field objects
     */
    getActiveCustomFields() {
        return (this.customFields || []).filter(field => field.active !== false);
    }

    /**
     * Add a new custom field
     * @param {Object} fieldData - { label, sfFieldName, value, active }
     * @returns {Object} Created custom field object
     */
    async addCustomField(fieldData) {
        const newField = {
            id: `custom_${Date.now()}`,
            label: fieldData.label || '',
            sfFieldName: fieldData.sfFieldName || '',
            value: fieldData.value || '',
            active: fieldData.active !== false,
            isCustom: true,
            createdAt: new Date().toISOString(),
            createdBy: 'user'
        };

        this.customFields.push(newField);
        this.saveCustomFields();

        // Save to API immediately
        if (this.currentEventId) {
            await this.saveFieldMappingsToAPI('custom_field_add', 'custom_field');
        }

        console.log('✅ Custom field added:', newField);
        return newField;
    }

    /**
     * Update an existing custom field
     * @param {string} fieldId - Custom field ID
     * @param {Object} updates - Fields to update
     * @returns {boolean} Success status
     */
    async updateCustomField(fieldId, updates) {
        const index = this.customFields.findIndex(f => f.id === fieldId);

        if (index === -1) {
            console.error(`❌ Custom field not found: ${fieldId}`);
            return false;
        }

        this.customFields[index] = {
            ...this.customFields[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        this.saveCustomFields();

        // Save to API immediately
        if (this.currentEventId) {
            await this.saveFieldMappingsToAPI('custom_field_update', 'custom_field');
        }

        console.log('✅ Custom field updated:', this.customFields[index]);
        return true;
    }

    /**
     * Delete a custom field
     * @param {string} fieldId - Custom field ID
     * @returns {boolean} Success status
     */
    async deleteCustomField(fieldId) {
        const index = this.customFields.findIndex(f => f.id === fieldId);

        if (index === -1) {
            console.error(`❌ Custom field not found: ${fieldId}`);
            return false;
        }

        const deletedField = this.customFields.splice(index, 1)[0];
        this.saveCustomFields();

        // Save to API immediately
        if (this.currentEventId) {
            await this.saveFieldMappingsToAPI('custom_field_delete', 'custom_field');
        }

        console.log('✅ Custom field deleted:', deletedField);
        return true;
    }

    /**
     * Toggle custom field active status
     * @param {string} fieldId - Custom field ID
     * @returns {boolean} New active status
     */
    async toggleCustomField(fieldId) {
        const field = this.customFields.find(f => f.id === fieldId);

        if (!field) {
            console.error(`❌ Custom field not found: ${fieldId}`);
            return false;
        }

        field.active = !field.active;
        this.saveCustomFields();

        // Save to API immediately
        if (this.currentEventId) {
            await this.saveFieldMappingsToAPI('custom_field_toggle', 'custom_field');
        }

        console.log(`✅ Custom field ${field.active ? 'activated' : 'deactivated'}:`, field);
        return field.active;
    }

    /**
     * Get custom field by ID
     * @param {string} fieldId - Custom field ID
     * @returns {Object|null} Custom field object or null
     */
    getCustomFieldById(fieldId) {
        return this.customFields.find(f => f.id === fieldId) || null;
    }

    /**
     * Get custom field by Salesforce field name
     * @param {string} sfFieldName - Salesforce field name
     * @returns {Object|null} Custom field object or null
     */
    getCustomFieldBySfName(sfFieldName) {
        return this.customFields.find(f => f.sfFieldName === sfFieldName) || null;
    }

    /**
     * Check if a Salesforce field name already exists
     * @param {string} sfFieldName - Salesforce field name to check
     * @returns {boolean} True if exists
     */
    customFieldExists(sfFieldName) {
        return this.customFields.some(f => f.sfFieldName === sfFieldName);
    }

    /**
     * Get all active field names for transfer (including custom fields)
     * @returns {Array} Array of Salesforce field names
     */
    getAllActiveFieldNamesForTransfer() {
        const standardActiveFields = this.getActiveFieldNames();
        const customActiveFields = this.getActiveCustomFields().map(f => f.sfFieldName);

        return [...standardActiveFields, ...customActiveFields];
    }
}

window.FieldMappingService = FieldMappingService;