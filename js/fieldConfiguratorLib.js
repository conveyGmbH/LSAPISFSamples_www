// fieldConfiguratorLib.js - Field Configuration Library for Salesforce Integration
// Compatible with WinJS projects and standard JavaScript environments

(function () {
    "use strict";

    // Global configuration
    let currentSession = {
        activeContainer: null,
        eventId: null,
        entityType: 'LS_Lead',
        mode: 'normal', // 'normal' or 'virtual'
        fieldMappingService: null
    };

    // Field configuration constants
    const REQUIRED_FIELDS = ['LastName', 'Company'];
    const EXCLUDED_FIELDS = ['__metadata'];
    const DEFAULT_ACTIVE_FIELDS = [
        'FirstName', 'LastName', 'Email', 'Company', 'Phone', 'MobilePhone', 'Street', 'City', 'PostalCode', 'State', 'Country', 'Title', 'Industry', 'Description'
    ];

    // Global object detection (window, self, or global)
    let globalObject = typeof window !== 'undefined' ? window :
        typeof self !== 'undefined' ? self :
        typeof global !== 'undefined' ? global : {};

    // ============================================================
    // UTILITY FUNCTIONS
    // ============================================================

    /**
     * Convert a standard Promise to WinJS Promise
     * @param {Promise} promise - Standard promise
     * @returns {Promise|WinJS.Promise} WinJS Promise if available, otherwise standard Promise
     */
    function toWinJSPromise(promise) {
        if (typeof WinJS !== 'undefined' && WinJS.Promise) {
            return new WinJS.Promise(function (complete, error) {
                promise.then(complete).catch(error);
            });
        }
        return promise;
    }

    /**
     * Get API credentials from session storage
     * @returns {Object} Credentials object
     */
    function getCredentials() {
        return {
            credentials: sessionStorage.getItem('credentials'),
            serverName: sessionStorage.getItem('serverName') || 'lstest.convey.de',
            apiName: sessionStorage.getItem('apiName') || 'apisftest'
        };
    }

    /**
     * Make API request to backend
     * @param {string} method - HTTP method
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request payload
     * @returns {Promise<Object>} Response data
     */
    async function apiRequest(method, endpoint, data = null) {
        const { credentials, serverName, apiName } = getCredentials();

        if (!credentials) {
            throw new Error('No credentials found in session storage');
        }

        const url = `https://${serverName}/${apiName}/${endpoint}`;
        const options = {
            method,
            headers: {
                'Accept': 'application/json',
                'Authorization': `Basic ${credentials}`
            }
        };

        if (data && method !== 'GET') {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, options);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const text = await response.text();
            if (!text.trim()) {
                return { success: true };
            }

            return JSON.parse(text);

        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    }

    /**
     * Format date to readable string
     * @param {string} dateString - ISO date string
     * @returns {string} Formatted date
     */
    function formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }

    /**
     * Format field label (convert camelCase to Title Case)
     * @param {string} fieldName - Field name
     * @returns {string} Formatted label
     */
    function formatFieldLabel(fieldName) {
        return fieldName
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }

    /**
     * Show notification message
     * @param {string} message - Notification message
     * @param {string} type - Type of notification ('success' or 'error')
     */
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `fc-notification fc-notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#d4edda' : '#f8d7da'};
            color: ${type === 'success' ? '#155724' : '#721c24'};
            border: 1px solid ${type === 'success' ? '#c3e6cb' : '#f5c6cb'};
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 9999;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideIn 0.3s ease-out;
        `;

        const icon = type === 'success'
            ? '<svg width="24" height="24" fill="currentColor" style="color: #48bb78;"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/></svg>'
            : '<svg width="24" height="24" fill="currentColor" style="color: #f56565;"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"/></svg>';

        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                ${icon}
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    /**
     * Inject CSS styles for the field configurator
     */
    function injectCSS() {
        if (document.getElementById('fc-library-styles')) {
            return; // Already injected
        }

        const style = document.createElement('style');
        style.id = 'fc-library-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(400px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }

            .fc-container {
                font-family: "Open Sans", -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, serif;
                background-color: var(--Window, rgb(249, 250, 251));
                color: var(--WindowText, #1f2937);
                padding: 20px;
            }

            .fc-header {
                background-color: var(--Window, white);
                border-bottom: 1px solid #e2e8f0;
                padding: 16px 24px;
                margin-bottom: 20px;
            }
            .cnv-ui-dark .fc-header {
                border-bottom-color: #525252;
            }

            .fc-header h1 {
                font-size: 1.25rem;
                font-weight: 700;
                color: var(--WindowText, #1f2937);
                margin: 0 0 8px 0;
            }

            .fc-header p {
                font-size: 0.875rem;
                color: var(--label-color, #6b7280);
                margin: 0;
            }

            .fc-stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 16px;
                margin-bottom: 20px;
            }

            .fc-stat-card {
                background-color: var(--Window, white);
                padding: 16px;
                border-radius: 12px;
                border: 1px solid #e2e8f0;
                box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
            }
            .cnv-ui-dark .fc-stat-card {
                border-color: #525252;
                box-shadow: 0 1px 3px 0 rgba(255, 255, 255, 0.05);
            }

            .fc-stat-value {
                font-size: 1.5rem;
                font-weight: 700;
                margin-bottom: 4px;
            }

            .fc-stat-label {
                font-size: 0.875rem;
                color: var(--label-color, #6b7280);
            }

            .fc-search-bar {
                position: relative;
                margin-bottom: 16px;
            }

            .fc-search-bar input {
                width: 100%;
                padding: 12px 12px 12px 40px;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                font-size: 0.875rem;
                background-color: var(--Window, white);
                color: var(--WindowText, #1f2937);
            }
            .cnv-ui-dark .fc-search-bar input {
                border-color: #525252;
            }

            .fc-search-bar::before {
                content: "🔍";
                position: absolute;
                left: 12px;
                top: 50%;
                transform: translateY(-50%);
            }

            .fc-filter-tabs {
                display: flex;
                gap: 8px;
                margin-bottom: 16px;
                flex-wrap: wrap;
                border-bottom: 1px solid #e2e8f0;
                padding-bottom: 12px;
            }
            .cnv-ui-dark .fc-filter-tabs {
                border-bottom-color: #525252;
            }

            .fc-filter-tab {
                padding: 8px 16px;
                border-radius: 8px;
                background: transparent;
                border: none;
                cursor: pointer;
                font-size: 0.875rem;
                font-weight: 500;
                color: var(--label-color, #6b7280);
                transition: all 0.2s;
            }

            .fc-filter-tab:hover {
                background: rgba(0, 0, 0, 0.05);
                color: var(--WindowText, #1f2937);
            }
            .cnv-ui-dark .fc-filter-tab:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            .fc-filter-tab.active {
                background-color: var(--accent-color, #2563eb);
                color: white;
            }

            .fc-fields-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                gap: 12px;
            }

            .fc-field-item {
                background-color: var(--Window, white);
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                padding: 12px;
                display: flex;
                align-items: center;
                gap: 12px;
                transition: all 0.3s;
                cursor: pointer;
            }
            .cnv-ui-dark .fc-field-item {
                border-color: #525252;
            }

            .fc-field-item:hover {
                border-color: var(--accent-color, #667eea);
                background-color: var(--box-bkg, #f7fafc);
                transform: translateY(-1px);
            }
            .cnv-ui-dark .fc-field-item:hover {
                background-color: rgba(255, 255, 255, 0.05);
            }

            .fc-field-item.active {
                background-color: rgba(37, 99, 235, 0.1);
                border-color: var(--accent-color, #667eea);
            }
            .cnv-ui-dark .fc-field-item.active {
                background-color: rgba(37, 99, 235, 0.2);
            }

            .fc-field-item.required {
                border-left: 3px solid #f59e0b;
                background-color: rgba(245, 158, 11, 0.1);
            }
            .cnv-ui-dark .fc-field-item.required {
                background-color: rgba(245, 158, 11, 0.15);
            }

            .fc-field-item.custom-field {
                border-left: 3px solid var(--accent-color, #2563eb);
                background-color: rgba(37, 99, 235, 0.1);
            }
            .cnv-ui-dark .fc-field-item.custom-field {
                background-color: rgba(37, 99, 235, 0.15);
            }

            .fc-field-checkbox {
                width: 18px;
                height: 18px;
                cursor: pointer;
                accent-color: var(--accent-color, #667eea);
                flex-shrink: 0;
            }

            .fc-field-checkbox:disabled {
                cursor: not-allowed;
                opacity: 0.6;
            }

            .fc-required-badge {
                display: inline-block;
                background: #f59e0b;
                color: white;
                font-size: 9px;
                padding: 2px 6px;
                border-radius: 3px;
                font-weight: 600;
                margin-left: 6px;
            }

            .fc-custom-badge {
                display: inline-block;
                background-color: var(--accent-color, #2563eb);
                color: white;
                font-size: 9px;
                padding: 2px 6px;
                border-radius: 3px;
                font-weight: 600;
                margin-left: 6px;
            }

            .fc-action-buttons {
                display: flex;
                justify-content: flex-end;
                gap: 12px;
                margin-top: 20px;
                padding: 16px;
                background-color: var(--Window, white);
                border: 1px solid #e2e8f0;
                border-radius: 12px;
            }
            .cnv-ui-dark .fc-action-buttons {
                border-color: #525252;
            }

            .fc-btn {
                padding: 10px 20px;
                border-radius: var(--use-border-radius, 6px);
                border: none;
                font-weight: 600;
                font-size: 0.875rem;
                cursor: pointer;
                transition: all 0.2s;
            }

            .fc-btn-primary {
                background-color: var(--accent-color, #2563eb);
                color: white;
            }

            .fc-btn-primary:hover:not(:disabled) {
                opacity: 0.9;
            }

            .fc-btn-secondary {
                background-color: var(--box-bkg, #e5e7eb);
                color: var(--WindowText, #374151);
                border: 1px solid #e2e8f0;
            }
            .cnv-ui-dark .fc-btn-secondary {
                border-color: #525252;
            }

            .fc-btn-secondary:hover {
                background-color: rgba(0, 0, 0, 0.1);
            }
            .cnv-ui-dark .fc-btn-secondary:hover {
                background-color: rgba(255, 255, 255, 0.1);
            }

            .fc-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .fc-modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 9999;
                align-items: center;
                justify-content: center;
            }

            .fc-modal.show {
                display: flex;
            }

            .fc-modal-content {
                background-color: var(--Window, white);
                border-radius: 16px;
                border: 1px solid #e2e8f0;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                max-width: 500px;
                width: 90%;
                max-height: 90vh;
                overflow-y: auto;
            }
            .cnv-ui-dark .fc-modal-content {
                border-color: #525252;
                box-shadow: 0 25px 50px -12px rgba(255, 255, 255, 0.1);
            }

            .fc-modal-header {
                background-color: var(--accent-color, #2563eb);
                color: white;
                padding: 16px 24px;
                border-radius: 16px 16px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .fc-modal-header h3 {
                margin: 0;
                font-size: 1.125rem;
                font-weight: 700;
            }

            .fc-modal-close {
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                width: 30px;
                height: 30px;
                line-height: 1;
            }

            .fc-modal-body {
                padding: 24px;
                background-color: var(--Window, white);
            }

            .fc-form-group {
                margin-bottom: 16px;
            }

            .fc-form-label {
                display: block;
                font-size: 0.875rem;
                font-weight: 500;
                color: var(--label-color, #374151);
                margin-bottom: 8px;
            }

            .fc-form-input {
                width: 100%;
                padding: 10px 12px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 0.875rem;
                background-color: var(--Window, white);
                color: var(--WindowText, #1f2937);
            }
            .cnv-ui-dark .fc-form-input {
                border-color: #525252;
            }

            .fc-form-input:focus {
                outline: none;
                border-color: var(--accent-color, #2563eb);
                box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
            }

            .fc-form-help {
                font-size: 0.75rem;
                color: var(--label-color, #6b7280);
                margin-top: 4px;
            }

            .fc-loading {
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 40px;
                color: var(--label-color, #6b7280);
            }

            .fc-loading::before {
                content: "";
                width: 24px;
                height: 24px;
                border: 3px solid rgba(0, 0, 0, 0.1);
                border-top-color: var(--accent-color, #2563eb);
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-right: 10px;
            }
            .cnv-ui-dark .fc-loading::before {
                border-color: rgba(255, 255, 255, 0.1);
                border-top-color: var(--accent-color, #2563eb);
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;

        document.head.appendChild(style);
    }

    // ============================================================
    // FIELD MANAGEMENT
    // ============================================================

    /**
     * Load fields from API metadata
     * @param {string} eventId - Event ID
     * @param {string} entityType - Entity type (LS_Lead or LS_LeadReport)
     * @returns {Promise<Array>} Array of field objects
     */
    async function loadFieldsFromAPI(eventId, entityType = 'LS_Lead') {
        try {
            const endpoint = `${entityType}?$filter=EventId eq '${eventId}'&$top=1&$format=json`;
            const data = await apiRequest('GET', endpoint);

            if (!data.d || !data.d.results || data.d.results.length === 0) {
                throw new Error('No data found for this event');
            }

            const firstRecord = data.d.results[0];
            const fieldNames = Object.keys(firstRecord).filter(
                name => !EXCLUDED_FIELDS.includes(name)
            );

            return fieldNames.map(name => ({
                name: name,
                active: DEFAULT_ACTIVE_FIELDS.includes(name) || REQUIRED_FIELDS.includes(name),
                required: REQUIRED_FIELDS.includes(name),
                isApiField: true
            }));

        } catch (error) {
            console.error('Failed to load fields from API:', error);
            throw error;
        }
    }

    /**
     * Load metadata from API
     * @param {string} entityType - Entity type
     * @returns {Promise<Array>} Array of field metadata
     */
    async function loadMetadata(entityType = 'LS_Lead') {
        try {
            const { credentials, serverName, apiName } = getCredentials();
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
                throw new Error(`EntityType ${entityType} not found in metadata`);
            }

            const properties = targetEntity.getElementsByTagName('Property');
            const fields = [];

            for (let prop of properties) {
                const name = prop.getAttribute('Name');

                if (EXCLUDED_FIELDS.includes(name)) {
                    continue;
                }

                const type = prop.getAttribute('Type');
                const nullable = prop.getAttribute('Nullable') !== 'false';

                fields.push({
                    name,
                    type,
                    nullable,
                    active: DEFAULT_ACTIVE_FIELDS.includes(name) || REQUIRED_FIELDS.includes(name),
                    required: REQUIRED_FIELDS.includes(name)
                });
            }

            return fields;

        } catch (error) {
            console.error('Failed to load metadata:', error);
            throw error;
        }
    }

    // ============================================================
    // PUBLIC API
    // ============================================================

    /**
     * Initialize field configurator
     * @param {Object} options - Configuration options
     * @returns {Promise} WinJS Promise if available
     */
    function initialize(options) {
        const promise = new Promise(async (resolve, reject) => {
            try {
                // Inject CSS
                injectCSS();

                // Set session configuration
                currentSession.eventId = options.eventId;
                currentSession.entityType = options.entityType || 'LS_Lead';
                currentSession.mode = options.mode || 'normal';
                currentSession.activeContainer = options.container;

                // Initialize Field Mapping Service if available
                if (globalObject.FieldMappingService) {
                    currentSession.fieldMappingService = new globalObject.FieldMappingService();
                    currentSession.fieldMappingService.setCurrentEventId(options.eventId);
                }

                resolve({
                    success: true,
                    eventId: currentSession.eventId,
                    mode: currentSession.mode
                });

            } catch (error) {
                console.error('Failed to initialize field configurator:', error);
                reject(error);
            }
        });

        return toWinJSPromise(promise);
    }

    /**
     * Render field configurator UI
     * @param {HTMLElement} container - Container element
     * @param {Object} options - Rendering options
     * @returns {Promise} WinJS Promise if available
     */
    function render(container, options = {}) {
        const promise = new Promise(async (resolve, reject) => {
            try {
                currentSession.activeContainer = container;

                // Load fields
                const fields = currentSession.mode === 'virtual'
                    ? await loadMetadata(currentSession.entityType)
                    : await loadFieldsFromAPI(currentSession.eventId, currentSession.entityType);

                // Render UI
                renderFieldConfiguratorUI(container, fields, options);

                resolve({
                    success: true,
                    fieldsCount: fields.length
                });

            } catch (error) {
                console.error('Failed to render field configurator:', error);
                container.innerHTML = `<div class="fc-loading">Error: ${error.message}</div>`;
                reject(error);
            }
        });

        return toWinJSPromise(promise);
    }

    /**
     * Render field configurator UI
     * @param {HTMLElement} container - Container element
     * @param {Array} fields - Array of field objects
     * @param {Object} options - Rendering options
     */
    function renderFieldConfiguratorUI(container, fields, options) {
        container.className = 'fc-container';

        const activeFieldsCount = fields.filter(f => f.active).length;
        const customFieldsCount = fields.filter(f => f.isCustomField).length;

        container.innerHTML = `
            <div class="fc-header">
                <h1>Field Configurator</h1>
                <p>Configure which fields will be transferred to Salesforce for Event ${currentSession.eventId}</p>
            </div>

            <div class="fc-stats-grid">
                <div class="fc-stat-card">
                    <div class="fc-stat-value" style="color: #2563eb;">${fields.length}</div>
                    <div class="fc-stat-label">Total Fields</div>
                </div>
                <div class="fc-stat-card">
                    <div class="fc-stat-value" style="color: #10b981;">${activeFieldsCount}</div>
                    <div class="fc-stat-label">Active Fields</div>
                </div>
                <div class="fc-stat-card">
                    <div class="fc-stat-value" style="color: #6b7280;">${fields.length - activeFieldsCount}</div>
                    <div class="fc-stat-label">Inactive Fields</div>
                </div>
                <div class="fc-stat-card">
                    <div class="fc-stat-value" style="color: #2563eb;">${customFieldsCount}</div>
                    <div class="fc-stat-label">Custom Fields</div>
                </div>
            </div>

            <div class="fc-search-bar">
                <input type="text" id="fc-search-input" placeholder="Search fields..." />
            </div>

            <div class="fc-filter-tabs">
                <button class="fc-filter-tab" data-filter="all">All Fields</button>
                <button class="fc-filter-tab active" data-filter="active">Active Fields</button>
                <button class="fc-filter-tab" data-filter="inactive">Inactive Fields</button>
                <button class="fc-filter-tab" data-filter="required">Required</button>
                <button class="fc-filter-tab" data-filter="custom">Custom Fields</button>
            </div>

            <div id="fc-fields-container" class="fc-fields-grid"></div>

            <div class="fc-action-buttons">
                <button class="fc-btn fc-btn-secondary" id="fc-cancel-btn">Cancel</button>
                <button class="fc-btn fc-btn-primary" id="fc-save-btn">Save Configuration</button>
            </div>
        `;

        // Render fields
        renderFields(container, fields, 'active');

        // Add event listeners
        setupEventListeners(container, fields);
    }

    /**
     * Render fields based on filter
     * @param {HTMLElement} container - Container element
     * @param {Array} fields - Array of field objects
     * @param {string} filter - Filter type
     */
    function renderFields(container, fields, filter = 'all') {
        const fieldsContainer = container.querySelector('#fc-fields-container');
        const searchQuery = container.querySelector('#fc-search-input').value.toLowerCase();

        let filteredFields = fields.filter(field => {
            // Apply filter
            if (filter === 'active' && !field.active) return false;
            if (filter === 'inactive' && field.active) return false;
            if (filter === 'required' && !field.required) return false;
            if (filter === 'custom' && !field.isCustomField) return false;

            // Apply search
            if (searchQuery && !field.name.toLowerCase().includes(searchQuery)) {
                return false;
            }

            return true;
        });

        if (filteredFields.length === 0) {
            fieldsContainer.innerHTML = '<div class="fc-loading">No fields found</div>';
            return;
        }

        fieldsContainer.innerHTML = '';

        filteredFields.forEach(field => {
            const fieldItem = document.createElement('label');
            fieldItem.className = `fc-field-item ${field.active ? 'active' : ''} ${field.required ? 'required' : ''} ${field.isCustomField ? 'custom-field' : ''}`;
            fieldItem.dataset.fieldName = field.name;

            fieldItem.innerHTML = `
                <input type="checkbox"
                       class="fc-field-checkbox"
                       ${field.active ? 'checked' : ''}
                       ${field.required ? 'disabled' : ''}
                       data-field="${field.name}" />
                <div style="flex: 1;">
                    <div class="text-textcolor" style="font-weight: 500;">
                        ${field.name}
                        ${field.required ? '<span class="fc-required-badge">REQUIRED</span>' : ''}
                        ${field.isCustomField ? '<span class="fc-custom-badge">CUSTOM</span>' : ''}
                    </div>
                </div>
            `;

            // Add checkbox toggle handler
            const checkbox = fieldItem.querySelector('.fc-field-checkbox');
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                field.active = checkbox.checked;

                if (checkbox.checked) {
                    fieldItem.classList.add('active');
                } else {
                    fieldItem.classList.remove('active');
                }

                updateStatistics(container, fields);
            });

            fieldsContainer.appendChild(fieldItem);
        });
    }

    /**
     * Setup event listeners
     * @param {HTMLElement} container - Container element
     * @param {Array} fields - Array of field objects
     */
    function setupEventListeners(container, fields) {
        // Search input
        const searchInput = container.querySelector('#fc-search-input');
        searchInput.addEventListener('input', () => {
            const activeFilter = container.querySelector('.fc-filter-tab.active').dataset.filter;
            renderFields(container, fields, activeFilter);
        });

        // Filter tabs
        const filterTabs = container.querySelectorAll('.fc-filter-tab');
        filterTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                filterTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                renderFields(container, fields, tab.dataset.filter);
            });
        });

        // Save button
        const saveBtn = container.querySelector('#fc-save-btn');
        saveBtn.addEventListener('click', async () => {
            try {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';

                await saveConfiguration(fields);

                showNotification('Configuration saved successfully!', 'success');

                // Trigger callback if provided
                if (options.onSave) {
                    options.onSave(fields);
                }

            } catch (error) {
                showNotification('Failed to save configuration: ' + error.message, 'error');
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Configuration';
            }
        });

        // Cancel button
        const cancelBtn = container.querySelector('#fc-cancel-btn');
        cancelBtn.addEventListener('click', () => {
            if (options.onCancel) {
                options.onCancel();
            }
        });
    }

    /**
     * Update statistics
     * @param {HTMLElement} container - Container element
     * @param {Array} fields - Array of field objects
     */
    function updateStatistics(container, fields) {
        const activeCount = fields.filter(f => f.active).length;
        const customCount = fields.filter(f => f.isCustomField).length;

        const statCards = container.querySelectorAll('.fc-stat-card .fc-stat-value');
        statCards[0].textContent = fields.length;
        statCards[1].textContent = activeCount;
        statCards[2].textContent = fields.length - activeCount;
        statCards[3].textContent = customCount;
    }

    /**
     * Save field configuration
     * @param {Array} fields - Array of field objects
     * @returns {Promise} Save promise
     */
    async function saveConfiguration(fields) {
        if (!currentSession.fieldMappingService) {
            throw new Error('Field Mapping Service not available');
        }

        // Update field configurations
        for (const field of fields) {
            const existingIndex = currentSession.fieldMappingService.fieldConfig.config.fields.findIndex(
                f => f.fieldName === field.name
            );

            const fieldConfigData = {
                fieldName: field.name,
                active: field.active,
                sfLabel: field.sfLabel || field.name
            };

            if (existingIndex >= 0) {
                currentSession.fieldMappingService.fieldConfig.config.fields[existingIndex] = {
                    ...currentSession.fieldMappingService.fieldConfig.config.fields[existingIndex],
                    ...fieldConfigData
                };
            } else {
                currentSession.fieldMappingService.fieldConfig.config.fields.push(fieldConfigData);
            }
        }

        // Save to local storage
        currentSession.fieldMappingService.saveConfig();

        // Save to database
        const success = await currentSession.fieldMappingService.bulkSaveToDatabase();

        if (!success) {
            throw new Error('Failed to save configuration to database');
        }

        return success;
    }

    /**
     * Get active fields
     * @returns {Array} Array of active field names
     */
    function getActiveFields() {
        if (!currentSession.fieldMappingService) {
            return [];
        }

        return currentSession.fieldMappingService.getActiveFieldNames();
    }

    /**
     * Destroy field configurator instance
     */
    function destroy() {
        if (currentSession.activeContainer) {
            currentSession.activeContainer.innerHTML = '';
        }

        currentSession = {
            activeContainer: null,
            eventId: null,
            entityType: 'LS_Lead',
            mode: 'normal',
            fieldMappingService: null
        };
    }

    // ============================================================
    // EXPORT API
    // ============================================================

    const FieldConfigurator = {
        initialize: initialize,
        render: render,
        getActiveFields: getActiveFields,
        destroy: destroy,
        version: '1.0.0'
    };

    // Export for different module systems
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = FieldConfigurator;
    } else if (typeof define === 'function' && define.amd) {
        define(function () { return FieldConfigurator; });
    } else {
        globalObject.FieldConfigurator = FieldConfigurator;
    }

})();
