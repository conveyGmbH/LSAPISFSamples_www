// FieldMappingService.js 
class FieldMappingService {
    constructor() {
        this.fieldConfig = this.loadConfig();
        this.customLabels = {};
        this.customFieldNames = {}; // NEW: Maps original field name to Salesforce API name
        this.credentials = sessionStorage.getItem('credentials');
        this.currentEventId = null;

        this.serverName = sessionStorage.getItem('serverName') || 'lstest.convey.de';
        this.apiName = sessionStorage.getItem('apiName') || 'apisftest';

        // Load custom field name mappings
        this.loadCustomFieldNames();

        console.log('FieldMappingService initialized:', {
            serverName: this.serverName,
            apiName: this.apiName,
            customFieldMappings: Object.keys(this.customFieldNames).length
        });
    }

    /**
     * Create ApiService instance when needed
     * @returns {Object} ApiService instance
     */
    createApiService() {
        // Create inline ApiService-like object for API calls
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
                        // Empty response is valid for some operations (like DELETE, PUT)
                        console.log('Empty response, returning success');
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

       /**
     * Initialize fields and load from API
     * @param {Object} leadData - Lead data
     * @param {string} eventId - Current event ID
     */
    async initializeFields(leadData, eventId) {
    try {
        this.currentEventId = eventId;

        // STEP 1: Load existing configuration from API FIRST if eventId is provided
        // This ensures custom labels and configurations are available before field processing
        if (eventId) {
            console.log(`Loading field mappings from API for event: ${eventId}`);
            await this.loadFieldMappingsFromAPI(eventId);
            console.log('API configurations loaded:', {
                customLabels: Object.keys(this.customLabels).length,
                configuredFields: this.fieldConfig.config?.fields?.length || 0
            });
        }

        // STEP 2: Initialize any new fields from lead data (only if not already configured)
        if (leadData) {
            console.log('Processing lead data fields...');
            Object.keys(leadData).forEach(fieldName => {
                const existingConfig = this.getFieldConfig(fieldName);
                if (!existingConfig) {
                    // Don't await this as we don't want to slow down the UI
                    console.log(`Adding new field to local config: ${fieldName}`);
                    this.setFieldConfigLocal(fieldName, { active: true });
                } else {
                    console.log(`Field ${fieldName} already configured:`, existingConfig);
                }
            });
        }

        console.log('Field mapping initialization completed successfully');
        console.log('Final state:', {
            eventId: this.currentEventId,
            totalCustomLabels: Object.keys(this.customLabels).length,
            totalConfiguredFields: this.fieldConfig.config?.fields?.length || 0,
            customLabelsKeys: Object.keys(this.customLabels)
        });
        return true;

    } catch (error) {
        console.error('Field mapping initialization failed, falling back to local-only mode:', error);
        // Don't throw error - continue with local initialization

        // Initialize fields locally if API failed
        if (leadData) {
            Object.keys(leadData).forEach(fieldName => {
                const existingConfig = this.getFieldConfig(fieldName);
                if (!existingConfig) {
                    this.setFieldConfigLocal(fieldName, { active: true });
                }
            });
        }

        console.log('Field mapping initialized in local-only mode');
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

    /**
     * Load field mappings from API
     * @param {string} eventId - Event ID to load mappings for
     */

    async loadFieldMappingsFromAPI(eventId) {
    if (!eventId) {
        console.log('❌ No event ID provided, skipping database load');
        return;
    }

    if (!this.credentials) {
        console.warn('❌ No credentials available for database access');
        return;
    }

    try {
        console.log(`🔄 Loading field mappings from database for event: ${eventId}`);
        console.log('🔧 Current service state before loading:', {
            currentEventId: this.currentEventId,
            hasCredentials: !!this.credentials,
            existingCustomLabels: Object.keys(this.customLabels).length,
            serverName: this.serverName,
            apiName: this.apiName
        });

        const endpoint = `LS_FieldMappings?$filter=EventId eq '${eventId}'&$format=json`;
        console.log(`🌐 API Endpoint: https://${this.serverName}/${this.apiName}/${endpoint}`);

        const data = await this.createApiService().request('GET', endpoint);

        if (!data) {
            console.log('No data returned from API');
            return;
        }


        if (data.d && data.d.results && data.d.results.length > 0) {
            const configRecord = data.d.results[0];

            console.log('✅ Found configuration record:', {
                id: configRecord.FieldMappingsViewId,
                hasConfigData: !!configRecord.ConfigData,
                configDataLength: configRecord.ConfigData?.length,
                eventId: configRecord.EventId
            });

            if (configRecord.ConfigData) {
                try {
                    console.log('🔍 Parsing ConfigData from database...');
                    const parsedConfig = JSON.parse(configRecord.ConfigData);

                    console.log('📦 Parsed config structure:', {
                        hasFieldConfig: !!parsedConfig.fieldConfig,
                        hasCustomLabels: !!parsedConfig.customLabels,
                        customLabelsKeys: Object.keys(parsedConfig.customLabels || {}),
                        customLabelsCount: Object.keys(parsedConfig.customLabels || {}).length
                    });

                    // Load configuration with validation
                    if (parsedConfig.fieldConfig) {
                        this.fieldConfig = parsedConfig.fieldConfig;
                        console.log('✅ Loaded field configuration from database');
                    }

                    if (parsedConfig.customLabels) {
                        this.customLabels = parsedConfig.customLabels;
                        console.log('✅ Loaded custom labels from database:', parsedConfig.customLabels);
                    }

                    console.log('🎉 Successfully loaded field mappings from database:', {
                        configuredFields: this.fieldConfig.config?.fields?.length || 0,
                        customLabels: Object.keys(this.customLabels).length,
                        customLabelsContent: this.customLabels
                    });

                } catch (parseError) {
                    console.error('❌ Failed to parse ConfigData from database, using default config:', parseError);
                    console.log('🔍 Raw ConfigData:', configRecord.ConfigData?.substring(0, 500));
                    // Continue with default configuration instead of throwing
                }
            } else {
                console.log('⚠️ Configuration record found but no ConfigData');
            }
        } else {
            console.log('❌ No existing field mappings found in database for this event');
            console.log('🔍 API Response structure:', data);
        }

    } catch (error) {
        console.error('Failed to load field mappings from database, continuing with local config:', error);
        // Don't throw - continue with default/local configuration
        return false;
    }
}

    /**
     * Save field mappings to API immediately
     * @param {string} fieldName - Field that was modified
     * @param {string} operation - Type of operation (label, toggle, etc.)
     */

/**
 * Save field mappings to API/Database
 * @param {string} fieldName - Field that was modified
 * @param {string} operation - Type of operation (label, toggle, etc.)
 */
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
        console.log(`Saving field mappings to database for event: ${this.currentEventId}`);
        
        // Show loading indicator (skip for bulk operations)
        if (fieldName !== 'bulk_save') {
            this.showSaveIndicator(fieldName, 'saving');
        }

        // Prepare configuration data to store in ConfigData field
        const configData = {
            fieldConfig: this.fieldConfig,
            customLabels: this.customLabels,
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

/**
 * Find existing record in database
 * @returns {Object|null} Existing record or null
 */
async findExistingRecord() {
    try {

        const endpoint = `LS_FieldMappings?$filter=EventId eq '${this.currentEventId}'&$format=json`;
        const data = await this.createApiService().request('GET', endpoint);

        if (data.d && data.d.results && data.d.results.length > 0) {
            console.log('Found existing configuration record');
            return data.d.results[0];
        }
        
        console.log('No existing configuration record found');
        return null;

    } catch (error) {
        console.error('Error finding existing record:', error);
        throw error;
    }
}

/**
 * Create new record in database
 * @param {Object} configData - Configuration data to save
 * @returns {Object} Success/error result
 */
async createRecord(configData) {
    try {
        const payload = {
            ApiEndpoint: 'LeadSuccess_Event_API',
            EventId: this.currentEventId,
            ConfigData: JSON.stringify(configData)
        };

        console.log('Creating new record with payload:', {
            ApiEndpoint: payload.ApiEndpoint,
            EventId: payload.EventId,
            ConfigDataLength: payload.ConfigData.length
        });

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


/**
 * Update existing record in database
 * @param {number} recordId - Record ID to update
 * @param {Object} configData - Configuration data to save
 * @returns {Object} Success/error result
 */
async updateRecord(recordId, configData) {
    try {
        
        console.log(`Updating record ID ${recordId} using delete-recreate strategy`);

        const currentData = await this.findExistingRecord();
        if (!currentData) {
            throw new Error('Cannot find record to update');
        }

        try {
            await this.createApiService().request('DELETE', `LS_FieldMappings(${recordId})`);
            console.log('Old record deleted successfully');
        } catch (deleteError) {
            console.warn('Delete failed, will try direct update:', deleteError);
        }

        const createResult = await this.createRecord(configData);

        
        if (createResult.success) {
            console.log('Record updated via delete-recreate strategy');
            return { success: true };
        } else {
            throw new Error('Failed to recreate record');
        }

} catch (error) {
        console.error('Error updating record:', error);
        
        // FALLBACK: Essayer avec votre ApiService et PUT si disponible
        try {
            console.log('Trying PUT as fallback...');
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

async updateRecordReadOnly(recordId, configData) {
    // Si aucune méthode de mise à jour ne fonctionne
    console.warn('Update operations not available due to CORS. Saving locally only.');
    
    // Sauvegarder localement
    this.saveConfig();
    this.saveCustomLabels();
    
    // Notifier l'utilisateur
    if (typeof showError === 'function') {
        showError('Configuration saved locally. Server update not available due to API restrictions.');
    }
    
    return { success: true, localOnly: true };
}


    /**
     * Show save indicator for user feedback
     * @param {string} fieldName - Field being saved
     * @param {string} status - Status: saving, success, error
     */
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

    /**
     * Set custom label and save immediately to API
     * @param {string} fieldName - Field name
     * @param {string} label - Custom label
     */
    async setCustomLabel(fieldName, label) {
        this.customLabels[fieldName] = label;
        
        // Update field config as well
        const fieldConfig = this.getFieldConfig(fieldName) || {};
        fieldConfig.customLabel = label;
        this.setFieldConfig(fieldName, fieldConfig);
        
        // Save to API immediately
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

/**
 * Get current event ID
 * @returns {string|null} Current event ID
 */
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

        //Also save locally as backup

        this.saveConfig();
        console.log(`Field config set for ${fieldName}:`, fieldConfig);
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
    

    // MODIFICATION CLIENT: Retourner le nom du champ API tel quel (pas de formatage)
    // Le client verra "Company" au lieu de "Company Name", "Question01" au lieu de "Question 01"
    formatFieldLabel(fieldName) {
        // Retourner simplement le nom du champ de l'API sans transformation
        return fieldName;
    }

    // Exporter la configuration
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

    // Filtrer les champs selon leur état
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

    // Appliquer les labels personnalisés aux données de lead
    applyCustomLabels(leadData) {
        console.log('applyCustomLabels called with:', {
            leadDataKeys: Object.keys(leadData),
            availableCustomLabels: Object.keys(this.customLabels),
            customLabelsData: this.customLabels
        });

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

            // Debug logging for custom labels
            if (customLabel) {
                console.log(`Field ${key}: Using custom label "${customLabel}"`);
            } else {
                console.log(`Field ${key}: Using default label "${finalLabel}"`);
            }
        }

        console.log('applyCustomLabels result:', result);
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

    /**
     * Set custom Salesforce field name for a field
     * @param {string} originalFieldName - Original field name (e.g., "Title")
     * @param {string} salesforceFieldName - Salesforce API name (e.g., "Title__c")
     */
    setCustomFieldName(originalFieldName, salesforceFieldName) {
        this.customFieldNames[originalFieldName] = salesforceFieldName;
        this.saveCustomFieldNames();
        console.log(`Custom field mapping set: ${originalFieldName} → ${salesforceFieldName}`);
    }

    /**
     * Get custom Salesforce field name for a field
     * @param {string} originalFieldName - Original field name
     * @returns {string} Salesforce field name or original if no mapping exists
     */
    getCustomFieldName(originalFieldName) {
        return this.customFieldNames[originalFieldName] || originalFieldName;
    }

    /**
     * Get all custom field name mappings
     * @returns {Object} All custom field mappings
     */
    getAllCustomFieldNames() {
        return { ...this.customFieldNames };
    }

    /**
     * Save custom field names to localStorage
     */
    saveCustomFieldNames() {
        try {
            localStorage.setItem('fieldMappingCustomNames', JSON.stringify(this.customFieldNames));
        } catch (error) {
            console.error('Failed to save custom field names:', error);
        }
    }

    /**
     * Load custom field names from localStorage
     */
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

    /**
     * Apply custom field name mappings to lead data for Salesforce transfer
     * MODIFICATION CLIENT: Utilise customLabel comme nom de champ SF si modifié
     * Exemple: Si customLabel = "Question07__c", alors le champ sera posté comme "Question07__c"
     * @param {Object} leadData - Original lead data
     * @returns {Object} Lead data with Salesforce field names
     */
    mapFieldNamesForSalesforce(leadData) {
        const mappedData = {};

        // Champs système à exclure du POST vers Salesforce
        const systemFieldsToExclude = [
            '__metadata', 'KontaktViewId', 'Id', 'CreatedDate', 'LastModifiedDate',
            'CreatedById', 'LastModifiedById', 'DeviceId', 'DeviceRecordId',
            'RequestBarcode', 'EventId', 'SystemModstamp', 'AttachmentIdList',
            'IsReviewed', 'StatusMessage'
        ];

        // MODIFICATION CLIENT: Pas de validation côté frontend
        // Tous les champs (mappés ou non) seront envoyés à Salesforce
        // Salesforce retournera une erreur si un champ n'existe pas

        for (const [originalField, value] of Object.entries(leadData)) {
            // Exclure les champs système lors du POST vers SF
            if (systemFieldsToExclude.includes(originalField)) {
                console.log(`Excluding system field from SF transfer: ${originalField}`);
                continue;
            }

            // MODIFICATION CLIENT: Exclure les champs inactifs
            const isActive = this.isFieldActive(originalField);
            if (isActive === false) {
                console.log(`Excluding inactive field from SF transfer: ${originalField}`);
                continue;
            }

            // Priorité 1: Utiliser customLabel si défini et différent du label par défaut
            let salesforceFieldName = originalField;

            const customLabel = this.customLabels[originalField];
            const defaultLabel = this.formatFieldLabel(originalField);

            // MODIFICATION CLIENT: Utiliser customLabel UNIQUEMENT s'il ressemble à un nom de champ SF valide
            // Format valide: commence par lettre, contient seulement lettres/chiffres/underscore, peut finir par __c
            const isValidSalesforceFieldName = (name) => {
                if (!name || name.trim() === '') return false;
                // Pattern pour champs SF: commence par lettre, contient lettres/chiffres/underscore, peut finir par __c
                return /^[a-zA-Z][a-zA-Z0-9_]*(__c)?$/.test(name.trim());
            };

            // Si customLabel existe ET est différent du label par défaut ET est un nom de champ SF valide
            if (customLabel && customLabel.trim() !== '' && customLabel !== defaultLabel) {
                const trimmedLabel = customLabel.trim();

                if (isValidSalesforceFieldName(trimmedLabel)) {
                    salesforceFieldName = trimmedLabel;
                    console.log(`✅ Using custom label as SF field name: ${originalField} → ${salesforceFieldName}`);
                } else {
                    // customLabel est un label d'affichage (avec espaces), pas un nom de champ SF
                    // Utiliser le nom original du champ
                    console.log(`ℹ️ Custom label "${trimmedLabel}" is display label only, using original field name: ${originalField}`);
                    salesforceFieldName = originalField;
                }
            }
            // Priorité 2: Utiliser le mapping explicite customFieldNames (legacy)
            else if (this.customFieldNames[originalField]) {
                salesforceFieldName = this.customFieldNames[originalField];
                console.log(`Using explicit field mapping: ${originalField} → ${salesforceFieldName}`);
            }
            // Priorité 3: Utiliser le nom original
            else {
                console.log(`Using original field name: ${originalField}`);
            }

            // MODIFICATION CLIENT: Envoyer tous les champs mappés à Salesforce
            // Salesforce validera si le champ existe et retournera une erreur claire si nécessaire
            mappedData[salesforceFieldName] = value;
        }

        console.log('🔄 Field mapping summary:', {
            originalFields: Object.keys(leadData).length,
            mappedFields: Object.keys(mappedData).length,
            excluded: Object.keys(leadData).length - Object.keys(mappedData).length
        });

        return mappedData;
    }


    /**
     * Apply enhanced data processing with field values
     * @param {Object} leadData - Lead data to process  
     * @returns {Object} Enhanced data with labels and values
     */
    applyEnhancedLabels(leadData) {
        if (window.enhancedFieldMappingService) {
            return window.enhancedFieldMappingService.applyEnhancedDataProcessing(leadData);
        }
        // Fallback à la méthode existante
        return this.applyCustomLabels(leadData);
    }
}

// Exporter le service
window.FieldMappingService = FieldMappingService;