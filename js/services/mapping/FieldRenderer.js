// FieldRenderer.js - Service pour rendre les champs selon leur type Salesforce
class FieldRenderer {
    constructor(salesforceMapper) {
        this.mapper = salesforceMapper;
    }

    /**
     * Create appropriate input element based on Salesforce field type
     */
    createFieldInput(fieldName, value, isEditMode = false) {
        const config = this.mapper.getFieldConfig(fieldName);
        const isWritable = this.mapper.isFieldWritable(fieldName);
        const isRequired = this.mapper.isFieldRequired(fieldName);

        // If not in edit mode or field is not writable, return display element
        if (!isEditMode || !isWritable) {
            return this.createDisplayElement(fieldName, value, config);
        }

        // Create input based on field type
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

    /**
     * Create display element for read-only or view mode
     */
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

    /**
     * Create picklist/select input
     */
    createPicklistInput(fieldName, value, config) {
        const select = document.createElement('select');
        select.className = 'form-control salesforce-input picklist-input';
        select.name = fieldName;
        select.id = `input-${fieldName}`;

        if (config.required) {
            select.required = true;
            select.setAttribute('aria-required', 'true');
        }

        // Add empty option for optional fields
        if (!config.required) {
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = '-- Select an option --';
            select.appendChild(emptyOption);
        }

        // Add picklist options
        const options = this.mapper.getPicklistOptions(fieldName);
        options.forEach(optionValue => {
            const option = document.createElement('option');
            option.value = optionValue;
            option.textContent = optionValue;
            if (value === optionValue) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        this.addValidationListeners(select, fieldName);
        return select;
    }

    /**
     * Create email input
     */
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

        this.addValidationListeners(input, fieldName);
        return input;
    }

    /**
     * Create phone input
     */
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

        this.addValidationListeners(input, fieldName);
        return input;
    }

    /**
     * Create URL input
     */
    createUrlInput(fieldName, value, config) {
        const input = document.createElement('input');
        input.type = 'url';
        input.className = 'form-control salesforce-input url-input';
        input.name = fieldName;
        input.id = `input-${fieldName}`;
        input.value = value || '';
        input.placeholder = 'https://google.com';

        if (config.required) {
            input.required = true;
            input.setAttribute('aria-required', 'true');
        }

        this.addValidationListeners(input, fieldName);
        return input;
    }

    /**
     * Create textarea input
     */
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

        this.addValidationListeners(textarea, fieldName);
        return textarea;
    }

    /**
     * Create checkbox input
     */
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

        this.addValidationListeners(input, fieldName);
        return container;
    }

    /**
     * Create datetime input
     */
    createDateTimeInput(fieldName, value, config) {
        const input = document.createElement('input');
        input.type = 'datetime-local';
        input.className = 'form-control salesforce-input datetime-input';
        input.name = fieldName;
        input.id = `input-${fieldName}`;

        // Format datetime value
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

        this.addValidationListeners(input, fieldName);
        return input;
    }

    /**
     * Create number input
     */
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

        this.addValidationListeners(input, fieldName);
        return input;
    }

    /**
     * Create text input
     */
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

        this.addValidationListeners(input, fieldName);
        return input;
    }

    /**
     * Format display value based on field type
     */
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

            case 'Email':
                return value;

            case 'Phone':
                return value;

            case 'Url':
                return value;

            default:
                return value.toString();
        }
    }

    /**
     * Add validation listeners to input elements
     */
    addValidationListeners(element, fieldName) {
        // Real-time validation on blur
        element.addEventListener('blur', () => {
            this.validateFieldInput(element, fieldName);
        });

        // Clear validation on focus
        element.addEventListener('focus', () => {
            this.clearFieldValidation(element);
        });

        // Mark required fields
        const config = this.mapper.getFieldConfig(fieldName);
        if (config.required) {
            element.classList.add('required-field');
        }
    }

    /**
     * Validate field input and show errors
     */
    validateFieldInput(element, fieldName) {
        const value = this.getElementValue(element);
        const errors = this.mapper.validateField(fieldName, value);

        this.clearFieldValidation(element);

        if (errors.length > 0) {
            element.classList.add('validation-error');
            this.showFieldErrors(element, errors);
        } else {
            element.classList.add('validation-success');
        }
    }

    /**
     * Clear field validation styles and messages
     */
    clearFieldValidation(element) {
        element.classList.remove('validation-error', 'validation-success');

        // Remove existing error messages
        const existingError = element.parentNode.querySelector('.field-error-message');
        if (existingError) {
            existingError.remove();
        }
    }

    /**
     * Show field validation errors
     */
    showFieldErrors(element, errors) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'field-error-message';
        errorDiv.innerHTML = errors.map(error => `<div class="error-item">${error}</div>`).join('');

        element.parentNode.appendChild(errorDiv);
    }

    /**
     * Get value from different input types
     */
    getElementValue(element) {
        if (element.type === 'checkbox') {
            return element.checked;
        }
        return element.value;
    }

    /**
     * Create field status indicator
     */
    createFieldStatusIndicator(fieldName) {
        const config = this.mapper.getFieldConfig(fieldName);
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
window.FieldRenderer = FieldRenderer;