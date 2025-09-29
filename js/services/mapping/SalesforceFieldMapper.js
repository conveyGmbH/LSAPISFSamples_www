// SalesforceFieldMapper.js - Service de mapping et validation des champs Salesforce
class SalesforceFieldMapper {
    constructor() {
        this.fieldMapping = this.loadFieldMapping();
        this.readOnlyFields = this.getReadOnlyFields();
        this.validationRules = this.getValidationRules();
        this.picklistValues = this.getPicklistValues();
    }

    /**
     * Load field mapping configuration from CSV data
     */
    loadFieldMapping() {
        return {
            // Standard Salesforce Lead fields
            'Id': { type: 'Text', maxLength: 36, writable: false, required: false },
            'CreatedDate': { type: 'DateTime', writable: false, required: false },
            'LastModifiedDate': { type: 'DateTime', writable: false, required: false },
            'CreatedById': { type: 'Lookup', writable: false, required: false },
            'LastModifiedById': { type: 'Lookup', writable: false, required: false },
            'Salutation': { type: 'Picklist', writable: true, required: false },
            'Suffix': { type: 'Text', maxLength: 40, writable: true, required: false },
            'FirstName': { type: 'Text', maxLength: 40, writable: true, required: false },
            'MiddleName': { type: 'Text', maxLength: 40, writable: true, required: false, custom: true },
            'LastName': { type: 'Text', maxLength: 80, writable: true, required: true },
            'Company': { type: 'Text', maxLength: 255, writable: true, required: true },
            'Title': { type: 'Text', maxLength: 128, writable: true, required: false },
            'Phone': { type: 'Phone', writable: true, required: false },
            'MobilePhone': { type: 'Phone', writable: true, required: false },
            'Fax': { type: 'Phone', writable: true, required: false },
            'Email': { type: 'Email', writable: true, required: false },
            'Website': { type: 'Url', writable: true, required: false },
            'Street': { type: 'TextArea', writable: true, required: false },
            'PostalCode': { type: 'Text', maxLength: 20, writable: true, required: false },
            'City': { type: 'Text', maxLength: 40, writable: true, required: false },
            'Country': { type: 'Text', maxLength: 80, writable: true, required: false },
            'CountryCode': { type: 'Picklist', writable: true, required: false },
            'State': { type: 'Text', maxLength: 80, writable: true, required: false },
            'Description': { type: 'LongTextArea', writable: true, required: false },
            'AttachmentIdList': { type: 'Text', maxLength: 255, writable: false, required: false },
            'SalesArea': { type: 'Text', maxLength: 255, writable: true, required: false, custom: true },
            'RequestBarcode': { type: 'Text', maxLength: 255, writable: false, required: false },
            'StatusMessage': { type: 'Text', maxLength: 255, writable: true, required: false },
            'DeviceId': { type: 'Number', writable: false, required: false },
            'DeviceRecordId': { type: 'Number', writable: false, required: false },
            'SystemModstamp': { type: 'DateTime', writable: false, required: false },
            'EventId': { type: 'Text', maxLength: 36, writable: false, required: false },
            'IsReviewed': { type: 'Checkbox', writable: true, required: false },
            'Department': { type: 'Text', maxLength: 80, writable: true, required: false },
            'Industry': { type: 'Picklist', writable: true, required: false },

            // LS_LeadReport specific fields (Questions/Answers/Text)
            ...this.generateQuestionFields()
        };
    }

    /**
     * Generate Question/Answer/Text fields for LeadReport
     */
    generateQuestionFields() {
        const fields = {};
        for (let i = 1; i <= 30; i++) {
            const num = i.toString().padStart(2, '0');
            fields[`Question${num}`] = { type: 'Text', maxLength: 255, writable: true, required: false, custom: true };
            fields[`Answers${num}`] = { type: 'Text', maxLength: 255, writable: true, required: false, custom: true };
            fields[`Text${num}`] = { type: 'LongTextArea', writable: true, required: false, custom: true };
        }
        return fields;
    }

    /**
     * Get read-only fields
     */
    getReadOnlyFields() {
        return [
            'Id', 'CreatedDate', 'LastModifiedDate', 'CreatedById', 'LastModifiedById',
            'AttachmentIdList', 'RequestBarcode', 'DeviceId', 'DeviceRecordId',
            'SystemModstamp', 'EventId'
        ];
    }

    /**
     * Get validation rules for different field types
     */
    getValidationRules() {
        return {
            Email: {
                pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Please enter a valid email address (example@email.com)'
            },
            Phone: {
                pattern: /^[\+]?[1-9][\d]{0,15}$/,
                message: 'Please enter a valid phone number'
            },
            Url: {
                pattern: /^https?:\/\/.+/,
                message: 'Please enter a valid URL (must start with http:// or https://)',
                transform: (value) => {
                    if (value && !value.startsWith('http://') && !value.startsWith('https://')) {
                        return 'https://' + value;
                    }
                    return value;
                }
            },
            Text: {
                validate: (value, maxLength) => {
                    if (value && value.length > maxLength) {
                        return `Text too long. Maximum ${maxLength} characters allowed.`;
                    }
                    return null;
                }
            },
            LongTextArea: {
                validate: (value) => {
                    const maxLength = 32768; // Salesforce Long Text Area limit
                    if (value && value.length > maxLength) {
                        return `Text too long. Maximum ${maxLength} characters allowed.`;
                    }
                    return null;
                }
            },
            Required: {
                validate: (value) => {
                    if (!value || value.toString().trim() === '') {
                        return 'This field is required.';
                    }
                    return null;
                }
            }
        };
    }

    /**
     * Get picklist values
     */
    getPicklistValues() {
        return {
            Salutation: ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.'],
            CountryCode: ['DE', 'FR', 'US', 'GB', 'ES', 'IT', 'NL', 'BE', 'CH', 'AT'],
            Industry: [
                'Agriculture', 'Apparel', 'Banking', 'Biotechnology', 'Chemicals',
                'Communications', 'Construction', 'Consulting', 'Education', 'Electronics',
                'Energy', 'Engineering', 'Entertainment', 'Environmental', 'Finance',
                'Food & Beverage', 'Government', 'Healthcare', 'Hospitality', 'Insurance',
                'Machinery', 'Manufacturing', 'Media', 'Not For Profit', 'Recreation',
                'Retail', 'Shipping', 'Technology', 'Telecommunications', 'Transportation',
                'Utilities', 'Other'
            ]
        };
    }

    /**
     * Check if field is writable
     */
    isFieldWritable(fieldName) {
        const mapping = this.fieldMapping[fieldName];
        return mapping ? mapping.writable : false;
    }

    /**
     * Check if field is required
     */
    isFieldRequired(fieldName) {
        const mapping = this.fieldMapping[fieldName];
        return mapping ? mapping.required : false;
    }

    /**
     * Get field type for rendering appropriate input
     */
    getFieldType(fieldName) {
        const mapping = this.fieldMapping[fieldName];
        return mapping ? mapping.type : 'Text';
    }

    /**
     * Get field configuration
     */
    getFieldConfig(fieldName) {
        return this.fieldMapping[fieldName] || { type: 'Text', writable: true, required: false };
    }

    /**
     * Validate a single field
     */
    validateField(fieldName, value) {
        const config = this.getFieldConfig(fieldName);
        const errors = [];

        // Check required fields
        if (config.required) {
            const requiredError = this.validationRules.Required.validate(value);
            if (requiredError) {
                errors.push(requiredError);
                return errors; // Return early if required field is empty
            }
        }

        // Skip validation for empty optional fields
        if (!value || value.toString().trim() === '') {
            return errors;
        }

        // Type-specific validation
        switch (config.type) {
            case 'Email':
                if (!this.validationRules.Email.pattern.test(value)) {
                    errors.push(this.validationRules.Email.message);
                }
                break;

            case 'Phone':
                if (!this.validationRules.Phone.pattern.test(value.replace(/[\s\-\(\)]/g, ''))) {
                    errors.push(this.validationRules.Phone.message);
                }
                break;

            case 'Url':
                if (!this.validationRules.Url.pattern.test(value)) {
                    errors.push(this.validationRules.Url.message);
                }
                break;

            case 'Text':
                if (config.maxLength) {
                    const lengthError = this.validationRules.Text.validate(value, config.maxLength);
                    if (lengthError) {
                        errors.push(lengthError);
                    }
                }
                break;

            case 'LongTextArea':
                const longTextError = this.validationRules.LongTextArea.validate(value);
                if (longTextError) {
                    errors.push(longTextError);
                }
                break;

            case 'Picklist':
                if (this.picklistValues[fieldName] && !this.picklistValues[fieldName].includes(value)) {
                    errors.push(`Please select a valid value: ${this.picklistValues[fieldName].join(', ')}`);
                }
                break;
        }

        return errors;
    }

    /**
     * Transform field value for Salesforce
     */
    transformFieldValue(fieldName, value) {
        const config = this.getFieldConfig(fieldName);

        if (!value || value.toString().trim() === '') {
            return null;
        }

        switch (config.type) {
            case 'Url':
                return this.validationRules.Url.transform(value);

            case 'Phone':
                // Normalize phone number (remove formatting)
                return value.replace(/[\s\-\(\)]/g, '');

            case 'DateTime':
                // Convert from /Date(1715822433086)/ format
                if (value.startsWith('/Date(') && value.endsWith(')/')) {
                    const timestamp = parseInt(value.match(/\d+/)[0]);
                    return new Date(timestamp).toISOString();
                }
                return value;

            case 'Checkbox':
                // Convert 0/1 to boolean
                return value === 1 || value === '1' || value === true;

            default:
                return value;
        }
    }

    /**
     * Validate all lead data
     */
    validateLeadData(leadData) {
        const errors = {};
        const warnings = [];

        Object.keys(leadData).forEach(fieldName => {
            const value = leadData[fieldName];
            const fieldErrors = this.validateField(fieldName, value);

            if (fieldErrors.length > 0) {
                errors[fieldName] = fieldErrors;
            }
        });

        // Check required fields
        const requiredFields = Object.keys(this.fieldMapping)
            .filter(fieldName => this.fieldMapping[fieldName].required);

        requiredFields.forEach(fieldName => {
            if (!leadData[fieldName] || leadData[fieldName].toString().trim() === '') {
                if (!errors[fieldName]) {
                    errors[fieldName] = [];
                }
                errors[fieldName].push('This field is required for Salesforce.');
            }
        });

        return { errors, warnings, isValid: Object.keys(errors).length === 0 };
    }

    /**
     * Transform lead data for Salesforce API
     */
    transformForSalesforce(leadData) {
        const transformed = {};
        const excluded = [];

        Object.keys(leadData).forEach(fieldName => {
            const config = this.getFieldConfig(fieldName);

            // Skip read-only fields
            if (!config.writable) {
                excluded.push(`${fieldName} (read-only)`);
                return;
            }

            // Transform value
            const transformedValue = this.transformFieldValue(fieldName, leadData[fieldName]);

            if (transformedValue !== null && transformedValue !== '') {
                transformed[fieldName] = transformedValue;
            }
        });

        return { transformed, excluded };
    }

    /**
     * Get picklist options for a field
     */
    getPicklistOptions(fieldName) {
        return this.picklistValues[fieldName] || [];
    }

    /**
     * Create field input element (from FieldRenderer)
     */
    createFieldInput(fieldName, value, isEditMode = false) {
        const config = this.getFieldConfig(fieldName);
        const isWritable = this.isFieldWritable(fieldName);

        if (!isEditMode || !isWritable) {
            return this.createDisplayElement(fieldName, value, config);
        }

        switch (config.type) {
            case 'Picklist':
                return this.createPicklistInput(fieldName, value, config);
            case 'Email':
                return this.createEmailInput(fieldName, value, config);
            case 'Phone':
                return this.createPhoneInput(fieldName, value, config);
            case 'Url':
                return this.createUrlInput(fieldName, value, config);
            case 'TextArea':
            case 'LongTextArea':
                return this.createTextAreaInput(fieldName, value, config);
            case 'Checkbox':
                return this.createCheckboxInput(fieldName, value, config);
            case 'DateTime':
                return this.createDateTimeInput(fieldName, value, config);
            case 'Number':
                return this.createNumberInput(fieldName, value, config);
            default:
                return this.createTextInput(fieldName, value, config);
        }
    }

    createDisplayElement(fieldName, value, config) {
        const displayValue = this.formatDisplayValue(fieldName, value, config);
        const element = document.createElement('div');
        element.className = 'field-display-value';

        if (config.writable) {
            element.className += ' editable';
        } else {
            element.className += ' read-only';
            element.title = 'This field is read-only in Salesforce';
        }

        element.textContent = displayValue;
        return element;
    }

    createPicklistInput(fieldName, value, config) {
        const select = document.createElement('select');
        select.className = 'form-control salesforce-input picklist-input';
        select.name = fieldName;
        select.id = `input-${fieldName}`;

        if (config.required) {
            select.required = true;
            select.setAttribute('aria-required', 'true');
        }

        if (!config.required) {
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = '-- Select an option --';
            select.appendChild(emptyOption);
        }

        const options = this.getPicklistOptions(fieldName);
        options.forEach(optionValue => {
            const option = document.createElement('option');
            option.value = optionValue;
            option.textContent = optionValue;
            if (value === optionValue) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        return select;
    }

    createEmailInput(fieldName, value, config) {
        const input = document.createElement('input');
        input.type = 'email';
        input.className = 'form-control salesforce-input email-input';
        input.name = fieldName;
        input.id = `input-${fieldName}`;
        input.value = value || '';
        input.placeholder = 'example@email.com';

        if (config.required) {
            input.required = true;
            input.setAttribute('aria-required', 'true');
        }

        return input;
    }

    createPhoneInput(fieldName, value, config) {
        const input = document.createElement('input');
        input.type = 'tel';
        input.className = 'form-control salesforce-input phone-input';
        input.name = fieldName;
        input.id = `input-${fieldName}`;
        input.value = value || '';
        input.placeholder = '+1 234 567 8900';

        if (config.required) {
            input.required = true;
            input.setAttribute('aria-required', 'true');
        }

        return input;
    }

    createUrlInput(fieldName, value, config) {
        const input = document.createElement('input');
        input.type = 'url';
        input.className = 'form-control salesforce-input url-input';
        input.name = fieldName;
        input.id = `input-${fieldName}`;
        input.value = value || '';
        input.placeholder = 'https://example.com';

        if (config.required) {
            input.required = true;
            input.setAttribute('aria-required', 'true');
        }

        return input;
    }

    createTextAreaInput(fieldName, value, config) {
        const textarea = document.createElement('textarea');
        textarea.className = 'form-control salesforce-input textarea-input';
        textarea.name = fieldName;
        textarea.id = `input-${fieldName}`;
        textarea.value = value || '';
        textarea.rows = config.type === 'LongTextArea' ? 6 : 3;

        if (config.maxLength) {
            textarea.maxLength = config.maxLength;
        }

        if (config.required) {
            textarea.required = true;
            textarea.setAttribute('aria-required', 'true');
        }

        return textarea;
    }

    createCheckboxInput(fieldName, value, config) {
        const container = document.createElement('div');
        container.className = 'checkbox-container';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'salesforce-input checkbox-input';
        input.name = fieldName;
        input.id = `input-${fieldName}`;
        input.checked = value === true || value === 1 || value === '1';

        const label = document.createElement('label');
        label.htmlFor = `input-${fieldName}`;
        label.textContent = 'Yes';

        container.appendChild(input);
        container.appendChild(label);

        return container;
    }

    createDateTimeInput(fieldName, value, config) {
        const input = document.createElement('input');
        input.type = 'datetime-local';
        input.className = 'form-control salesforce-input datetime-input';
        input.name = fieldName;
        input.id = `input-${fieldName}`;

        if (value) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                input.value = date.toISOString().slice(0, 16);
            }
        }

        if (config.required) {
            input.required = true;
            input.setAttribute('aria-required', 'true');
        }

        return input;
    }

    createNumberInput(fieldName, value, config) {
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'form-control salesforce-input number-input';
        input.name = fieldName;
        input.id = `input-${fieldName}`;
        input.value = value || '';

        if (config.required) {
            input.required = true;
            input.setAttribute('aria-required', 'true');
        }

        return input;
    }

    createTextInput(fieldName, value, config) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control salesforce-input text-input';
        input.name = fieldName;
        input.id = `input-${fieldName}`;
        input.value = value || '';

        if (config.maxLength) {
            input.maxLength = config.maxLength;
        }

        if (config.required) {
            input.required = true;
            input.setAttribute('aria-required', 'true');
        }

        return input;
    }

    formatDisplayValue(fieldName, value, config) {
        if (value === null || value === undefined || value === '') {
            return 'N/A';
        }

        switch (config.type) {
            case 'DateTime':
                if (value.startsWith('/Date(') && value.endsWith(')/')) {
                    const timestamp = parseInt(value.match(/\d+/)[0]);
                    return new Date(timestamp).toLocaleDateString();
                }
                return new Date(value).toLocaleDateString();

            case 'Checkbox':
                return value === true || value === 1 || value === '1' ? 'Yes' : 'No';

            default:
                return value.toString();
        }
    }

    createFieldStatusIndicator(fieldName) {
        const config = this.getFieldConfig(fieldName);
        const indicator = document.createElement('div');
        indicator.className = 'field-status-indicator';

        const badges = [];

        if (config.required) {
            badges.push('<span class="badge badge-required">Required</span>');
        }

        if (!config.writable) {
            badges.push('<span class="badge badge-readonly">Read-only</span>');
        }

        if (config.custom) {
            badges.push('<span class="badge badge-custom">Custom</span>');
        }

        indicator.innerHTML = badges.join('');
        return indicator;
    }
}

// Export service
window.SalesforceFieldMapper = SalesforceFieldMapper;