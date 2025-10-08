# Lead Transfer System - Complete Restructuring Plan

## 📋 Objectifs

1. ✅ Transférer uniquement les champs avec toggle activé
2. ✅ Vérifier l'existence des champs dans Salesforce avant le transfert
3. ✅ Afficher un modal moderne pour confirmer la création de champs manquants
4. ✅ Créer automatiquement les champs custom via Tooling API/Metadata API
5. ✅ Utiliser les labels depuis le mapping (customLabels ou API)
6. ✅ Améliorer les messages d'erreur avec des toast modernes
7. ✅ Améliorer la gestion des doublons avec un modal moderne

## 🎯 Architecture du Nouveau Flux

### Phase 1: Collection des données
```
handleTransferButtonClick()
  ↓
collectActiveFieldsOnly()  ← NOUVELLE FONCTION
  ├─ Lire fieldMappingService.fieldConfig
  ├─ Filtrer uniquement les champs avec active: true
  ├─ Collecter les valeurs depuis les inputs
  └─ Retourner { leadData, fieldsList }
```

### Phase 2: Vérification des champs
```
checkMissingFields(fieldsList)  ← NOUVELLE FONCTION
  ↓
POST /api/salesforce/fields/check
  ├─ fieldNames: ['Question01__c', 'Question02__c', ...]
  └─ Retour: { existing: [...], missing: [...] }
```

### Phase 3: Création des champs manquants (si nécessaire)
```
Si missing.length > 0:
  ↓
showMissingFieldsModal(missingFields, labels)  ← NOUVELLE FONCTION
  ├─ Afficher le modal "missing-fields-modal"
  ├─ Lister les champs avec leurs labels depuis mapping
  ├─ Attendre décision utilisateur:
  │   ├─ "Create Fields" → createCustomFields()
  │   └─ "Skip & Continue" → proceedWithTransfer()
  ↓
createCustomFields(fieldsToCreate)  ← NOUVELLE FONCTION
  ↓
POST /api/salesforce/fields/create
  ├─ fields: [{ apiName, label }, ...]
  └─ Retour: { created: [...], failed: [...] }
```

### Phase 4: Transfert du lead
```
proceedWithTransfer(leadData, attachments)
  ↓
POST /api/salesforce/leads
  ├─ Validation backend
  ├─ Check doublons
  ├─ Création du lead
  └─ Upload attachments
```

## 🛠️ Fonctions à Créer/Modifier

### 1. collectActiveFieldsOnly()
```javascript
/**
 * Collect only ACTIVE fields (toggle enabled) from the UI
 * @returns {Object} { leadData, fieldsList, labels }
 */
function collectActiveFieldsOnly() {
    const leadData = {};
    const fieldsList = [];
    const labels = {};

    // Get field config from FieldMappingService
    const fieldConfig = window.fieldMappingService?.fieldConfig || {};

    // Iterate over all configured fields
    Object.keys(fieldConfig).forEach(fieldName => {
        const config = fieldConfig[fieldName];

        // Only include if active
        if (config.active === true) {
            // Get value from input
            const input = document.querySelector(`[data-field-name="${fieldName}"]`);
            if (input) {
                const value = getInputValue(input);
                if (value && value.trim() !== '') {
                    leadData[fieldName] = value;
                    fieldsList.push(fieldName);

                    // Store label from mapping
                    labels[fieldName] = config.customLabel ||
                                       fieldMappingService.formatFieldLabel(fieldName);
                }
            }
        }
    });

    console.log(`✅ Collected ${fieldsList.length} active fields`);
    return { leadData, fieldsList, labels };
}
```

### 2. checkMissingFields()
```javascript
/**
 * Check which fields exist in Salesforce
 * @param {Array} fieldNames - Array of field API names to check
 * @returns {Promise<Object>} { existing, missing }
 */
async function checkMissingFields(fieldNames) {
    const response = await fetch('/api/salesforce/fields/check', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Org-Id': 'default'
        },
        body: JSON.stringify({ fieldNames })
    });

    if (!response.ok) {
        throw new Error('Failed to check fields in Salesforce');
    }

    return await response.json();
}
```

### 3. showMissingFieldsModal()
```javascript
/**
 * Show modal to confirm creation of missing custom fields
 * @param {Array} missingFields - Array of field API names
 * @param {Object} labels - Map of fieldName to label
 * @returns {Promise<boolean>} true if user wants to create, false to skip
 */
function showMissingFieldsModal(missingFields, labels) {
    return new Promise((resolve) => {
        const modal = document.getElementById('missing-fields-modal');
        const list = document.getElementById('missing-fields-list');
        const createBtn = document.getElementById('create-fields-btn');
        const skipBtn = document.getElementById('skip-field-creation-btn');

        // Build list of missing fields with labels
        list.innerHTML = missingFields.map(fieldName => `
            <div style="display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid #E5E7EB;">
                <div>
                    <div style="font-weight: 600; color: #1F2937;">${labels[fieldName] || fieldName}</div>
                    <div style="font-size: 12px; color: #6B7280; font-family: monospace;">${fieldName}</div>
                </div>
                <div style="background: #EFF6FF; color: #1E40AF; padding: 4px 12px; border-radius: 4px; font-size: 12px; align-self: center;">
                    Text (255)
                </div>
            </div>
        `).join('');

        // Show modal
        modal.style.display = 'flex';

        // Handle create
        createBtn.onclick = () => {
            modal.style.display = 'none';
            resolve(true);
        };

        // Handle skip
        skipBtn.onclick = () => {
            modal.style.display = 'none';
            resolve(false);
        };
    });
}
```

### 4. createCustomFields()
```javascript
/**
 * Create custom fields in Salesforce
 * @param {Array} missingFields - Array of field API names
 * @param {Object} labels - Map of fieldName to label
 * @returns {Promise<Object>} Creation results
 */
async function createCustomFields(missingFields, labels) {
    const fields = missingFields.map(apiName => ({
        apiName,
        label: labels[apiName] || apiName.replace(/__c$/, '').replace(/_/g, ' ')
    }));

    const response = await fetch('/api/salesforce/fields/create', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Org-Id': 'default'
        },
        body: JSON.stringify({ fields })
    });

    if (!response.ok) {
        throw new Error('Failed to create custom fields');
    }

    return await response.json();
}
```

### 5. Modifier handleTransferButtonClick()
```javascript
async function handleTransferButtonClick() {
    console.log("=== STARTING ENHANCED LEAD TRANSFER ===");

    // Phase 1: Collect ONLY active fields
    const { leadData, fieldsList, labels } = collectActiveFieldsOnly();

    if (!leadData || Object.keys(leadData).length === 0) {
        showModernToast('No active fields to transfer', 'warning');
        return;
    }

    console.log(`📊 Active fields to transfer: ${fieldsList.length}`);

    // Phase 2: Check which fields exist in Salesforce
    showModernToast('Checking fields in Salesforce...', 'info');

    const fieldCheck = await checkMissingFields(fieldsList);
    console.log(`✅ Existing fields: ${fieldCheck.existing.length}`);
    console.log(`❌ Missing fields: ${fieldCheck.missing.length}`);

    // Phase 3: Handle missing custom fields
    if (fieldCheck.missing.length > 0) {
        const userWantsToCreate = await showMissingFieldsModal(
            fieldCheck.missing,
            labels
        );

        if (userWantsToCreate) {
            // Create the fields
            showModernToast('Creating custom fields...', 'info');

            const createResult = await createCustomFields(
                fieldCheck.missing,
                labels
            );

            if (createResult.failed.length > 0) {
                showModernToast(
                    `Failed to create ${createResult.failed.length} fields`,
                    'error'
                );
                console.error('Failed fields:', createResult.failed);
            }

            if (createResult.created.length > 0) {
                showModernToast(
                    `Created ${createResult.created.length} custom fields successfully`,
                    'success'
                );
            }
        } else {
            // User chose to skip - remove missing fields from leadData
            fieldCheck.missing.forEach(fieldName => {
                delete leadData[fieldName];
            });
            showModernToast('Proceeding without missing fields...', 'info');
        }
    }

    // Phase 4: Validate required fields
    if (!leadData.LastName || !leadData.Company) {
        showModernToast('Last Name and Company are required', 'error');
        return;
    }

    // Phase 5: Check for duplicates (improved modal)
    const duplicateCheck = await checkForDuplicates(leadData);
    if (duplicateCheck.hasDuplicates) {
        const proceed = await showDuplicateModal(duplicateCheck.duplicates);
        if (!proceed) {
            showModernToast('Transfer cancelled', 'info');
            return;
        }
    }

    // Phase 6: Transfer lead
    showModernToast('Transferring lead to Salesforce...', 'info');
    const attachments = await fetchAttachments(leadData.AttachmentIdList);
    const result = await transferLeadDirectlyToSalesforce(leadData, attachments);

    if (result.ok) {
        showModernToast('Lead transferred successfully!', 'success');
    } else {
        showModernToast('Transfer failed', 'error');
    }
}
```

## 🎨 Toast Notifications Modernes

```javascript
function showModernToast(message, type = 'info') {
    const container = document.getElementById('toast-container') || createToastContainer();

    const toast = document.createElement('div');
    toast.className = `modern-toast modern-toast-${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${getToastIcon(type)}</div>
        <div class="toast-message">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
```

## 📊 Endpoints API Backend

### Déjà Créés ✅
1. **POST /api/salesforce/fields/check** - Vérifie l'existence des champs
2. **POST /api/salesforce/fields/create** - Crée les champs custom via Metadata API

### Existants
3. **POST /api/salesforce/leads** - Transfert du lead avec attachments

## 🔄 Ordre d'Implémentation

1. ✅ Modal HTML créé
2. ✅ Endpoints API créés
3. ⏳ Créer `collectActiveFieldsOnly()`
4. ⏳ Créer `checkMissingFields()`
5. ⏳ Créer `showMissingFieldsModal()`
6. ⏳ Créer `createCustomFields()`
7. ⏳ Créer `showModernToast()`
8. ⏳ Créer `showDuplicateModal()` (amélioration)
9. ⏳ Modifier `handleTransferButtonClick()`
10. ⏳ Tester le flux complet

## 🧪 Test Plan

1. **Test 1**: Transférer avec tous les champs standards (actifs)
2. **Test 2**: Transférer avec un champ custom manquant (Question01__c)
   - Vérifier modal s'affiche
   - Accepter création
   - Vérifier champ créé dans SF
3. **Test 3**: Transférer avec champ custom manquant mais skip
   - Vérifier modal s'affiche
   - Refuser création
   - Vérifier transfert sans ce champ
4. **Test 4**: Transférer lead en doublon
   - Vérifier modal doublon s'affiche
5. **Test 5**: Désactiver des champs via toggle
   - Vérifier qu'ils ne sont pas transférés

## 📝 Notes Importantes

- Les labels viennent de `fieldMappingService.customLabels` ou formatFieldLabel()
- Les champs créés sont de type Text(255) par défaut
- L'utilisateur peut modifier le type dans Salesforce Setup après
- Utiliser Metadata API pour la création (pas Tooling API)
- Tous les messages utilisent des toast modernes centrés
