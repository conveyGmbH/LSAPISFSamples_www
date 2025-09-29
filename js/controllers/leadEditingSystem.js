// ===== LEAD EDITING SYSTEM CORRIGÉ =====

/**
 * Afficher les données de lead avec système d'édition inline
 */
function displayLeadData(data) {
    console.log('🎨 Displaying lead data with inline editing system');

    const leadDataContainer = document.getElementById("leadData");
    if (!leadDataContainer) {
        console.error('Lead data container not found');
        return;
    }

    leadDataContainer.innerHTML = "";

    if (!data || Object.keys(data).length === 0) {
        leadDataContainer.innerHTML = '<div class="no-data">No lead data available</div>';
        return;
    }

    // Traiter les données avec les labels personnalisés
    const processedData = window.fieldMappingService?.applyCustomLabels(data) ||
        Object.fromEntries(Object.entries(data).map(([key, value]) => [key, {
            value,
            label: formatFieldLabel(key),
            active: true
        }]));

    // Créer la grille d'informations
    const infoGrid = document.createElement("div");
    infoGrid.className = "lead-info-grid";

    // Filtrer et afficher les champs selon leur statut
    const filterValue = document.getElementById('field-display-filter')?.value || 'all';

    Object.keys(processedData).forEach((fieldName) => {
        const fieldInfo = processedData[fieldName];

        // Appliquer le filtre
        if (filterValue === 'active' && !fieldInfo.active) return;
        if (filterValue === 'inactive' && fieldInfo.active) return;

        // Exclure les champs système
        if (isSystemField(fieldName)) return;

        const fieldElement = createFieldElement(fieldName, fieldInfo);
        infoGrid.appendChild(fieldElement);
    });

    leadDataContainer.appendChild(infoGrid);

    // Mettre à jour les statistiques
    setTimeout(() => updateFieldStats(), 100);
}

/**
 * Vérifier si c'est un champ système (non éditable)
 */
function isSystemField(fieldName) {
    const systemFields = [
        '__metadata', 'KontaktViewId', 'Id', 'CreatedDate', 'LastModifiedDate',
        'CreatedById', 'LastModifiedById', 'SystemModstamp', 'DeviceId',
        'DeviceRecordId', 'EventId', 'RequestBarcode', 'StatusMessage'
    ];
    return systemFields.includes(fieldName);
}

/**
 * Créer un élément de champ avec édition inline
 */
function createFieldElement(fieldName, fieldInfo) {
    const fieldElement = document.createElement("div");
    fieldElement.className = `lead-field ${fieldInfo.active ? '' : 'field-inactive'}`;
    fieldElement.dataset.fieldName = fieldName;

    // Configuration Salesforce pour le champ
    const salesforceConfig = getSalesforceFieldConfig(fieldName);

    // Header du champ
    const fieldHeader = createFieldHeader(fieldName, fieldInfo.label, salesforceConfig);

    // Contenu du champ avec logique d'édition
    const fieldContent = createFieldContent(fieldName, fieldInfo.value, salesforceConfig);

    // Footer avec toggle actif/inactif
    const fieldFooter = createFieldFooter(fieldName, fieldInfo.active);

    fieldElement.appendChild(fieldHeader);
    fieldElement.appendChild(fieldContent);
    fieldElement.appendChild(fieldFooter);

    return fieldElement;
}

/**
 * Créer le header du champ
 */
function createFieldHeader(fieldName, label, config) {
    const header = document.createElement("div");
    header.className = "field-header";

    const labelContainer = document.createElement("div");
    labelContainer.className = "field-label-container";

    const labelText = document.createElement("span");
    labelText.className = "field-label";
    labelText.textContent = label;

    // Ajouter indicateur requis
    if (config.required) {
        labelText.innerHTML += ' <span class="required-indicator">*</span>';
    }

    const apiName = document.createElement("div");
    apiName.className = "field-api-name";
    apiName.textContent = `${fieldName} (${config.type})`;

    labelContainer.appendChild(labelText);
    labelContainer.appendChild(apiName);

    // Bouton d'édition du label
    const editLabelBtn = document.createElement("button");
    editLabelBtn.className = "edit-label-btn";
    editLabelBtn.innerHTML = '✏️';
    editLabelBtn.title = 'Edit field label';
    editLabelBtn.onclick = () => openEditLabelModal(fieldName);

    header.appendChild(labelContainer);
    header.appendChild(editLabelBtn);

    return header;
}

/**
 * Créer le contenu du champ avec logique d'édition
 */
function createFieldContent(fieldName, value, config) {
    const content = document.createElement("div");
    content.className = "field-content";

    const isEmpty = !value || value === null || value === 'null' || value === '';

    if (isEmpty || isAlwaysEditable(fieldName)) {
        // Affichage direct de l'input pour les champs vides ou toujours éditables
        const input = createSalesforceInput(fieldName, value, config);
        content.appendChild(input);
    } else {
        // Affichage avec possibilité d'édition via icône
        const displayContainer = createDisplayWithEditIcon(fieldName, value, config);
        content.appendChild(displayContainer);
    }

    // Élément d'erreur pour la validation
    const errorElement = document.createElement("div");
    errorElement.className = "field-error";
    errorElement.id = `error-${fieldName}`;
    content.appendChild(errorElement);

    return content;
}

/**
 * Créer un input selon le type Salesforce
 */
function createSalesforceInput(fieldName, value, config) {
    let input;

    switch (config.type) {
        case 'Picklist':
            input = createPicklistInput(fieldName, value, config);
            break;
        case 'Email':
            input = createEmailInput(fieldName, value);
            break;
        case 'Phone':
            input = createPhoneInput(fieldName, value);
            break;
        case 'Url':
            input = createUrlInput(fieldName, value);
            break;
        case 'TextArea':
        case 'LongTextArea':
            input = createTextAreaInput(fieldName, value, config);
            break;
        case 'Checkbox':
            input = createCheckboxInput(fieldName, value);
            break;
        case 'DateTime':
            input = createDateTimeInput(fieldName, value);
            break;
        default:
            input = createTextInput(fieldName, value, config);
    }

    input.className += ' field-input';
    input.dataset.fieldName = fieldName;

    // Ajouter les événements de sauvegarde
    addSaveEvents(input, fieldName);

    return input;
}

/**
 * Vérifier si un champ est en lecture seule (système)
 */
function isReadOnlyField(fieldName) {
    const readOnlyFields = [
        'Id', 'CreatedDate', 'LastModifiedDate', 'SystemModstamp',
        'CreatedById', 'LastModifiedById', 'IsDeleted'
    ];
    return readOnlyFields.includes(fieldName);
}

/**
 * Créer un affichage avec icône d'édition
 */
function createDisplayWithEditIcon(fieldName, value, config) {
    const container = document.createElement("div");
    container.className = "field-value-container";

    // Vérifier si le champ est en lecture seule
    const isReadOnly = isReadOnlyField(fieldName);

    // Valeur affichée
    const displayValue = document.createElement("div");
    displayValue.className = "field-value";
    displayValue.textContent = formatDisplayValue(value, config);

    container.appendChild(displayValue);

    // Si le champ n'est pas en lecture seule, ajouter l'icône d'édition
    if (!isReadOnly) {
        // Icône d'édition
        const editIcon = document.createElement("button");
        editIcon.className = "field-edit-icon";
        editIcon.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
        `;
        editIcon.title = `Edit ${fieldName}`;
        editIcon.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            switchToEditMode(fieldName, value, config);
        });

        container.appendChild(editIcon);
    } else {
        // Indicateur de lecture seule
        const readOnlyIndicator = document.createElement("span");
        readOnlyIndicator.className = "read-only-indicator";
        readOnlyIndicator.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <circle cx="12" cy="16" r="1"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            READ-ONLY
        `;
        container.appendChild(readOnlyIndicator);
    }

    return container;
}

/**
 * Basculer vers le mode édition
 */
function switchToEditMode(fieldName, currentValue, config) {
    const fieldElement = document.querySelector(`[data-field-name="${fieldName}"]`);
    if (!fieldElement) return;

    const content = fieldElement.querySelector('.field-content');
    const displayContainer = content.querySelector('.field-value-container');

    if (!displayContainer) return;

    // Créer l'input de remplacement
    const input = createSalesforceInput(fieldName, currentValue, config);

    // Remplacer l'affichage par l'input
    content.replaceChild(input, displayContainer);

    // Focus sur l'input
    setTimeout(() => input.focus(), 100);

    // Ajouter événement pour revenir au mode affichage
    const exitEditMode = () => {
        const newValue = getInputValue(input);
        const newDisplayContainer = createDisplayWithEditIcon(fieldName, newValue || currentValue, config);
        content.replaceChild(newDisplayContainer, input);
    };

    input.addEventListener('blur', exitEditMode, { once: true });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            exitEditMode();
        }
        if (e.key === 'Escape') {
            input.value = currentValue;
            exitEditMode();
        }
    });
}

/**
 * Créer les différents types d'inputs Salesforce
 */
function createPicklistInput(fieldName, value, config) {
    const select = document.createElement('select');

    // Options selon le champ
    const options = getPicklistOptions(fieldName);

    // Option vide si pas requis
    if (!config.required) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-- Select --';
        select.appendChild(emptyOption);
    }

    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option;
        optionElement.textContent = option;
        if (value === option) {
            optionElement.selected = true;
        }
        select.appendChild(optionElement);
    });

    return select;
}

function createEmailInput(fieldName, value) {
    const input = document.createElement('input');
    input.type = 'email';
    input.value = value || '';
    input.placeholder = 'email@example.com';
    return input;
}

function createPhoneInput(fieldName, value) {
    const input = document.createElement('input');
    input.type = 'tel';
    input.value = value || '';
    input.placeholder = '+49 123 456789';
    return input;
}

function createUrlInput(fieldName, value) {
    const input = document.createElement('input');
    input.type = 'url';
    input.value = value || '';
    input.placeholder = 'https://example.com';
    return input;
}

function createTextAreaInput(fieldName, value, config) {
    const textarea = document.createElement('textarea');
    textarea.value = value || '';
    textarea.rows = config.type === 'LongTextArea' ? 6 : 3;
    textarea.placeholder = `Enter ${fieldName}`;
    return textarea;
}

function createCheckboxInput(fieldName, value) {
    const container = document.createElement('div');
    container.className = 'checkbox-container';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value === true || value === 1 || value === '1';

    const label = document.createElement('label');
    label.textContent = 'Yes';

    container.appendChild(input);
    container.appendChild(label);

    return container;
}

function createDateTimeInput(fieldName, value) {
    const input = document.createElement('input');
    input.type = 'datetime-local';

    if (value && value.includes('/Date(')) {
        const timestamp = parseInt(value.match(/\d+/)[0]);
        const date = new Date(timestamp);
        input.value = date.toISOString().slice(0, 16);
    } else if (value) {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
            input.value = date.toISOString().slice(0, 16);
        }
    }

    return input;
}

function createTextInput(fieldName, value, config) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value || '';
    input.placeholder = `Enter ${fieldName}`;

    if (config.maxLength) {
        input.maxLength = config.maxLength;
    }

    return input;
}

/**
 * Ajouter les événements de sauvegarde automatique
 */
function addSaveEvents(input, fieldName) {
    // Sauvegarde lors du changement de valeur
    input.addEventListener('change', () => {
        saveFieldValue(fieldName, getInputValue(input));
    });

    // Sauvegarde lors de la perte de focus
    input.addEventListener('blur', () => {
        saveFieldValue(fieldName, getInputValue(input));
    });

    // Validation en temps réel
    input.addEventListener('input', () => {
        validateField(fieldName, getInputValue(input));
    });
}

/**
 * Obtenir la valeur d'un input selon son type
 */
function getInputValue(input) {
    if (input.type === 'checkbox') {
        return input.checked;
    } else if (input.tagName === 'SELECT') {
        return input.value;
    } else if (input.querySelector && input.querySelector('input[type="checkbox"]')) {
        return input.querySelector('input[type="checkbox"]').checked;
    } else {
        return input.value;
    }
}

/**
 * Sauvegarder la valeur d'un champ localement
 */
function saveFieldValue(fieldName, value) {
    console.log(`💾 Saving field ${fieldName}: "${value}"`);

    // Mettre à jour les données globales
    if (typeof selectedLeadData !== 'undefined') {
        selectedLeadData[fieldName] = value;
    }

    // Sauvegarder dans localStorage pour persistence
    try {
        const eventId = sessionStorage.getItem('selectedEventId') || 'default';
        const storageKey = `lead_edits_${eventId}`;

        let savedData = {};
        const existing = localStorage.getItem(storageKey);
        if (existing) {
            savedData = JSON.parse(existing);
        }

        if (!savedData.changes) savedData.changes = {};
        savedData.changes[fieldName] = value;
        savedData.leadData = selectedLeadData;
        savedData.timestamp = new Date().toISOString();
        savedData.eventId = eventId;

        localStorage.setItem(storageKey, JSON.stringify(savedData));

        console.log(`✅ Field ${fieldName} saved locally`);

        // Indicateur visuel de sauvegarde
        showFieldSaveIndicator(fieldName);

    } catch (error) {
        console.error(`❌ Error saving field ${fieldName}:`, error);
    }
}

/**
 * Indicateur visuel de sauvegarde
 */
function showFieldSaveIndicator(fieldName) {
    const fieldElement = document.querySelector(`[data-field-name="${fieldName}"]`);
    if (fieldElement) {
        fieldElement.classList.add('field-saved');
        setTimeout(() => {
            fieldElement.classList.remove('field-saved');
        }, 1000);
    }
}

/**
 * Obtenir la configuration Salesforce pour un champ
 */
function getSalesforceFieldConfig(fieldName) {
    const configs = {
        'Salutation': { type: 'Picklist', required: false },
        'FirstName': { type: 'Text', required: false, maxLength: 40 },
        'LastName': { type: 'Text', required: true, maxLength: 80 },
        'Company': { type: 'Text', required: true, maxLength: 255 },
        'Email': { type: 'Email', required: false },
        'Phone': { type: 'Phone', required: false },
        'MobilePhone': { type: 'Phone', required: false },
        'Website': { type: 'Url', required: false },
        'Title': { type: 'Text', required: false, maxLength: 128 },
        'Description': { type: 'LongTextArea', required: false },
        'Industry': { type: 'Picklist', required: false },
        'Department': { type: 'Text', required: false, maxLength: 80 },
        'Street': { type: 'TextArea', required: false },
        'City': { type: 'Text', required: false, maxLength: 40 },
        'State': { type: 'Text', required: false, maxLength: 80 },
        'Country': { type: 'Text', required: false, maxLength: 80 },
        'PostalCode': { type: 'Text', required: false, maxLength: 20 },
        'CountryCode': { type: 'Picklist', required: false },
        'IsReviewed': { type: 'Checkbox', required: false }
    };

    return configs[fieldName] || { type: 'Text', required: false };
}

/**
 * Obtenir les options de picklist
 */
function getPicklistOptions(fieldName) {
    const options = {
        'Salutation': ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.'],
        'Industry': [
            'Agriculture', 'Banking', 'Biotechnology', 'Chemicals', 'Communications',
            'Construction', 'Consulting', 'Education', 'Electronics', 'Energy',
            'Engineering', 'Entertainment', 'Finance', 'Healthcare', 'Insurance',
            'Manufacturing', 'Media', 'Technology', 'Transportation', 'Other'
        ],
        'CountryCode': ['DE', 'US', 'GB', 'FR', 'IT', 'ES', 'NL', 'BE', 'CH', 'AT']
    };

    return options[fieldName] || [];
}

/**
 * Vérifier si un champ est toujours éditable
 */
function isAlwaysEditable(fieldName) {
    const alwaysEditable = [
        'Description', 'Title', 'Department', 'Industry', 'SalesArea'
    ];
    return alwaysEditable.includes(fieldName);
}

/**
 * Formater la valeur d'affichage
 */
function formatDisplayValue(value, config) {
    if (!value || value === null || value === 'null' || value === '') {
        return 'N/A';
    }

    switch (config.type) {
        case 'DateTime':
            if (value.includes('/Date(')) {
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

/**
 * Créer le footer du champ avec toggle
 */
function createFieldFooter(fieldName, isActive) {
    const footer = document.createElement("div");
    footer.className = "field-footer";

    const toggleContainer = document.createElement("label");
    toggleContainer.className = "toggle-switch";

    const toggleInput = document.createElement("input");
    toggleInput.type = "checkbox";
    toggleInput.checked = isActive !== false;
    toggleInput.addEventListener('change', () => {
        if (typeof toggleFieldActive === 'function') {
            toggleFieldActive(fieldName, toggleInput.checked);
        }
    });

    const slider = document.createElement("span");
    slider.className = "slider";

    toggleContainer.appendChild(toggleInput);
    toggleContainer.appendChild(slider);

    const statusText = document.createElement("span");
    statusText.className = "field-status";
    statusText.textContent = isActive !== false ? "Active" : "Inactive";

    footer.appendChild(toggleContainer);
    footer.appendChild(statusText);

    return footer;
}

// Exporter les fonctions principales pour l'intégration
window.leadEditingSystem = {
    displayLeadData,
    createFieldElement,
    createDisplayWithEditIcon,
    switchToEditMode,
    saveFieldValue,
    getSalesforceFieldConfig
};

console.log('🚀 Lead Editing System loaded successfully!');