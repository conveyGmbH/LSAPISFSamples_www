# Plan d'Implémentation - Field Mapping avec Dialog Modal

## ✅ Déjà Complété

### 1. Fonction fetchMetadata()
- ✅ Ajoutée dans `displayLsLeadController.js` (lignes 59-121)
- ✅ Ajoutée dans `displayLsLeadRepportController.js` (lignes 150-212)
- Parse XML de `$metadata` endpoint
- Extrait tous les champs avec leur type
- Skip les champs metadata (KontaktViewId, __metadata)

### 2. Commits
- ✅ Commit "Add fetchMetadata() function to parse OData metadata" (d10de76)
- ✅ Commit "Fix FieldMappingService import error" (7a39d89)
- ✅ Commit "Filter display pages to show only active fields" (717702d)
- ✅ Commit "Create Field Configurator Page" (4641fd6)

---

## 🔄 À Implémenter - Parties Critiques

### Phase 1: Modal de Configuration des Champs

#### Fichier: `displayLsLead.html` (avant `</body>`)

```html
<!-- Field Configuration Modal -->
<div id="fieldConfigModal" class="modal" style="display: none;">
    <div class="modal-content" style="max-width: 900px; max-height: 90vh;">
        <div class="modal-header">
            <h2>Configure Fields for Lead Display</h2>
            <button id="closeFieldConfigModal" class="close-btn">&times;</button>
        </div>

        <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
            <!-- Search Bar -->
            <div class="search-container">
                <input type="text" id="fieldSearchInput" placeholder="Search fields..." />
            </div>

            <!-- Select All / None -->
            <div class="bulk-actions">
                <button id="selectAllFields">Select All</button>
                <button id="deselectAllFields">Deselect All</button>
            </div>

            <!-- Fields Grid -->
            <div id="fieldsGrid" class="fields-grid">
                <!-- Fields will be populated here -->
            </div>
        </div>

        <div class="modal-footer">
            <button id="cancelFieldConfig" class="btn-secondary">Cancel</button>
            <button id="saveFieldConfig" class="btn-primary">Save & Continue</button>
        </div>
    </div>
</div>

<style>
.modal {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    align-items: center;
    justify-content: center;
}

.modal.show {
    display: flex;
}

.modal-content {
    background: white;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    width: 90%;
    max-width: 900px;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid #e5e7eb;
}

.modal-header h2 {
    margin: 0;
    font-size: 20px;
    color: #1f2937;
}

.close-btn {
    background: none;
    border: none;
    font-size: 28px;
    cursor: pointer;
    color: #6b7280;
}

.modal-body {
    padding: 20px;
}

.search-container {
    margin-bottom: 16px;
}

#fieldSearchInput {
    width: 100%;
    padding: 10px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
}

.bulk-actions {
    margin-bottom: 16px;
    display: flex;
    gap: 10px;
}

.bulk-actions button {
    padding: 8px 16px;
    border: 1px solid #d1d5db;
    background: white;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
}

.bulk-actions button:hover {
    background: #f3f4f6;
}

.fields-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 12px;
    max-height: 500px;
    overflow-y: auto;
}

.field-item {
    display: flex;
    align-items: center;
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
}

.field-item:hover {
    background: #f9fafb;
    border-color: #3b82f6;
}

.field-item input[type="checkbox"] {
    margin-right: 10px;
}

.field-item.required {
    border-left: 3px solid #f59e0b;
    background: #fffbeb;
}

.field-item.required input[type="checkbox"] {
    cursor: not-allowed;
}

.modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 20px;
    border-top: 1px solid #e5e7eb;
}

.btn-secondary {
    padding: 10px 20px;
    border: 1px solid #d1d5db;
    background: white;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
}

.btn-primary {
    padding: 10px 20px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
}

.btn-primary:hover {
    background: #2563eb;
}
</style>
```

#### Répéter le même modal dans `displayLsLeadReport.html`

---

### Phase 2: Logique JavaScript - checkFieldMappingAndLoad()

#### Fichier: `displayLsLeadController.js`

Ajouter après la fonction `fetchMetadata()`:

```javascript
// Check if field mapping exists, if not show configuration dialog
async function checkFieldMappingAndLoad() {
  const eventId = sessionStorage.getItem('selectedEventId');
  if (!eventId) {
    alert('No EventId provided.');
    window.location.href = '/display.html';
    return;
  }

  try {
    // Load field mapping from database
    await window.fieldMappingService.loadFieldMappingsFromAPI(eventId);
    const activeFields = window.fieldMappingService.getActiveFieldNames();

    if (activeFields.length === 0) {
      console.log('⚠️ No field mapping found, showing configuration dialog');

      // Fetch metadata to get available fields
      const metadataFields = await fetchMetadata('LS_Lead');

      // Show configuration dialog
      showFieldConfigurationDialog(metadataFields);
    } else {
      console.log('✅ Field mapping exists, loading data');
      // Field mapping exists, proceed with normal data loading
      fetchLsLeadData();
    }
  } catch (error) {
    console.error('Error checking field mapping:', error);
    alert('Error loading field configuration. Please try again.');
  }
}

// Show field configuration dialog
function showFieldConfigurationDialog(fields) {
  const modal = document.getElementById('fieldConfigModal');
  const fieldsGrid = document.getElementById('fieldsGrid');
  const searchInput = document.getElementById('fieldSearchInput');

  // Clear existing content
  fieldsGrid.innerHTML = '';

  // Required fields
  const requiredFields = ['LastName', 'Company'];

  // Store fields for search
  window.configFields = fields;

  // Render fields
  renderConfigFields(fields);

  // Show modal
  modal.classList.add('show');

  // Search functionality
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filtered = fields.filter(f =>
      f.name.toLowerCase().includes(searchTerm)
    );
    renderConfigFields(filtered);
  });

  // Select All
  document.getElementById('selectAllFields').onclick = () => {
    document.querySelectorAll('.field-item input[type="checkbox"]:not([disabled])').forEach(cb => {
      cb.checked = true;
    });
  };

  // Deselect All
  document.getElementById('deselectAllFields').onclick = () => {
    document.querySelectorAll('.field-item input[type="checkbox"]:not([disabled])').forEach(cb => {
      cb.checked = false;
    });
  };

  // Close modal
  document.getElementById('closeFieldConfigModal').onclick = () => {
    modal.classList.remove('show');
  };

  document.getElementById('cancelFieldConfig').onclick = () => {
    modal.classList.remove('show');
    window.location.href = '/display.html';
  };

  // Save configuration
  document.getElementById('saveFieldConfig').onclick = async () => {
    await saveFieldConfiguration();
  };
}

// Render fields in grid
function renderConfigFields(fields) {
  const fieldsGrid = document.getElementById('fieldsGrid');
  const requiredFields = ['LastName', 'Company'];

  fieldsGrid.innerHTML = '';

  fields.forEach(field => {
    const isRequired = requiredFields.includes(field.name);

    const fieldItem = document.createElement('div');
    fieldItem.className = `field-item ${isRequired ? 'required' : ''}`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `field_${field.name}`;
    checkbox.value = field.name;
    checkbox.checked = isRequired; // Required fields pre-checked
    checkbox.disabled = isRequired; // Required fields can't be unchecked

    const label = document.createElement('label');
    label.htmlFor = `field_${field.name}`;
    label.textContent = field.name;
    label.style.cursor = 'pointer';
    label.style.flex = '1';

    fieldItem.appendChild(checkbox);
    fieldItem.appendChild(label);

    // Click on item to toggle checkbox
    fieldItem.onclick = (e) => {
      if (e.target !== checkbox && !isRequired) {
        checkbox.checked = !checkbox.checked;
      }
    };

    fieldsGrid.appendChild(fieldItem);
  });
}

// Save field configuration
async function saveFieldConfiguration() {
  const eventId = sessionStorage.getItem('selectedEventId');
  const checkboxes = document.querySelectorAll('.field-item input[type="checkbox"]:checked');

  if (checkboxes.length === 0) {
    alert('Please select at least one field');
    return;
  }

  const selectedFields = Array.from(checkboxes).map(cb => cb.value);

  console.log(`💾 Saving ${selectedFields.length} selected fields`);

  // Configure fields in FieldMappingService
  selectedFields.forEach(fieldName => {
    window.fieldMappingService.setFieldConfig(fieldName, { active: true });
  });

  // Set eventId
  window.fieldMappingService.currentEventId = eventId;

  // Save to local storage
  window.fieldMappingService.saveConfig();

  // Bulk save to database
  try {
    const success = await window.fieldMappingService.bulkSaveToDatabase();

    if (success) {
      console.log('✅ Field configuration saved successfully');

      // Close modal
      document.getElementById('fieldConfigModal').classList.remove('show');

      // Load data with configured fields
      fetchLsLeadData();
    } else {
      alert('Failed to save field configuration');
    }
  } catch (error) {
    console.error('Error saving field configuration:', error);
    alert('Error saving field configuration');
  }
}
```

**Modifier la fonction `fetchLsLeadData()`** pour appeler `checkFieldMappingAndLoad()` au lieu de charger directement:

```javascript
// Dans document.addEventListener('DOMContentLoaded')
// REMPLACER:
// fetchLsLeadData();

// PAR:
checkFieldMappingAndLoad();
```

---

### Phase 3: Répéter pour displayLsLeadReport

Dupliquer toute la logique dans `displayLsLeadRepportController.js` avec:
- Changer `'LS_Lead'` en `'LS_LeadReport'`
- Changer `fetchLsLeadData()` en `fetchLsLeadReportData()`

---

### Phase 4: Bouton "Change Field Mapping"

#### Dans `displayLsLead.html` et `displayLsLeadReport.html`

Ajouter le bouton à côté de "Show Attachment":

```html
<!-- Dans la section actions -->
<button id="changeFieldMappingBtn" class="action-button">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 20h9"></path>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
    </svg>
    <span>Change Field Mapping</span>
</button>
```

#### JavaScript pour le bouton:

```javascript
// Add Change Field Mapping button handler
document.getElementById('changeFieldMappingBtn')?.addEventListener('click', async () => {
  const metadataFields = await fetchMetadata('LS_Lead'); // ou 'LS_LeadReport'
  showFieldConfigurationDialog(metadataFields);
});
```

---

## 📋 Prochaines Tâches (Phase Suivante)

### 1. Mode Configuration avec Fake Data
- Générer des données fake si `data.length === 0`
- Rendre TOUS les champs éditables en mode configuration
- Utiliser `fakeDataGenerator.js` existant

### 2. Mode Transfert (données réelles)
- Désactiver l'édition des champs en mode transfert
- Afficher les vraies valeurs des contacts

### 3. Persister Custom Fields
- Corriger le problème de persistence des custom fields
- Enlever l'ajout automatique de `__c`

### 4. Fix Show Attachment Button
- Corriger l'activation du bouton lors de la sélection

---

## 🔧 Tests à Effectuer

1. **Premier accès à un Event**
   - ✅ Vérifier que le modal s'affiche
   - ✅ Vérifier que les champs requis sont pré-cochés et disabled
   - ✅ Tester la recherche de champs
   - ✅ Tester Select All / Deselect All
   - ✅ Sauvegarder et vérifier que les données s'affichent

2. **Accès suivants**
   - ✅ Vérifier que les données s'affichent directement
   - ✅ Vérifier que seuls les champs actifs sont affichés

3. **Bouton Change Field Mapping**
   - ✅ Ouvre le modal
   - ✅ Permet de modifier la configuration
   - ✅ Recharge les données après sauvegarde

---

## 📝 Notes Importantes

- Le modal utilise les mêmes styles que `fieldConfigurator.html` mais adapté en modal
- La logique de sauvegarde utilise `bulkSaveToDatabase()` pour éviter les appels multiples
- Les champs requis (LastName, Company) sont toujours actifs et non modifiables
- Le bouton "Change Field Mapping" est TOUJOURS actif (même sans sélection de ligne)
- Le bouton "Transfer to SF" n'est actif que si une ligne est sélectionnée

---

## 🚀 Pour Continuer

Dans la nouvelle session, commencer par:

1. Ajouter le modal HTML dans `displayLsLead.html`
2. Ajouter les fonctions JavaScript dans `displayLsLeadController.js`
3. Tester le flux complet
4. Dupliquer pour `displayLsLeadReport`
5. Commit et push

**État actuel du code: Branche `FeatureFieldConfigurator-clean`**
**Dernier commit: d10de76 - Add fetchMetadata() function**
