# Field Configurator System - Documentation

## Vue d'ensemble

Le système **Field Configurator** permet aux utilisateurs de configurer précisément quels champs seront transférés vers Salesforce lors du transfert de leads. Ce système comprend:

1. **Page de Configuration** - Interface pour sélectionner les champs actifs/inactifs
2. **Modal de Prévisualisation** - Affiche les champs qui seront transférés avant confirmation
3. **Génération Automatique de Données Fictives** - Remplit automatiquement les champs requis vides
4. **Sauvegarde Persistante** - Configuration sauvegardée par Event dans la base de données

---

## Architecture

### Fichiers Créés

```
pages/
└── fieldConfigurator.html                    # Page de configuration des champs

js/
├── controllers/
│   ├── fieldConfiguratorController.js        # Logique de la page de configuration
│   ├── fieldPreviewModal.js                  # Modal de prévisualisation avant transfert
│   └── transferWithPreview.js                # Intégration du système de preview
│
└── services/
    └── fakeDataGenerator.js                  # Génération de données fictives réalistes
```

### Flux Utilisateur (Architecture Corrigée)

```
┌─────────────────────────────────────────────────────────────────┐
│                 ÉTAPE 1: Sélection Event                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
    1. User ouvre display.html (Liste des Events)
       - Sélectionne un Event (ex: API Test)
       - Click "View Leads" ou "View Lead Reports"

┌─────────────────────────────────────────────────────────────────┐
│        ÉTAPE 2: Configuration des Champs (Avant les leads)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
    2. Redirection automatique vers fieldConfigurator.html
       - URL: fieldConfigurator.html?eventId=xxx&source=lead
       - Affiche TOUS les champs Salesforce disponibles (50+)
       - Toggles actif/inactif pour chaque champ
       - Champs requis (LastName, Company) toujours actifs
       - Recherche et filtres disponibles
                              │
                              ▼
    3. User sélectionne les champs désirés (ex: 10 sur 50)
       - FirstName, LastName, Email, Company, Phone, etc.
                              │
                              ▼
    4. Click "Save & Continue to Leads"
       - Sauvegarde dans LS_FieldMappings (base de données)
       - Configuration liée à l'EventId
       - Redirection automatique vers displayLsLead.html ou displayLsLeadReport.html

┌─────────────────────────────────────────────────────────────────┐
│            ÉTAPE 3: Visualisation des Leads Filtrés              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
    5. Page displayLsLead.html (ou displayLsLeadReport.html)
       - Affiche SEULEMENT les 10 champs configurés
       - Liste des contacts filtrée
       - User peut modifier les valeurs si nécessaire
                              │
                              ▼
    6. User sélectionne un contact et click "Transfer to Salesforce"

┌─────────────────────────────────────────────────────────────────┐
│              ÉTAPE 4: Transfert vers Salesforce                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
    7. Redirection vers displayLeadTransfer.html
       - Affiche les champs configurés avec leurs valeurs
       - Bouton "Configure Fields" disponible pour reconfigurer
                              │
                              ▼
    8. User click "Transfer Lead"
       - Modal de prévisualisation s'ouvre (optionnel)
       - Affiche les champs qui seront transférés
       - Indique les champs vides
                              │
                              ▼
    9. Si champs requis vides → Avertissement
       "Ces champs seront auto-remplis avec des données réalistes"
                              │
                              ▼
    10. User confirme le transfert
        - Génération automatique de fake data si nécessaire
        - Transfert vers Salesforce avec SEULEMENT les champs configurés
        - ✅ Succès!
```

---

## Composants Détaillés

### 1. Field Configurator Page (`fieldConfigurator.html`)

**Fonctionnalités:**
- Liste complète de tous les champs Salesforce Lead disponibles
- Toggles actif/inactif pour chaque champ
- Champs requis (LastName, Company) non désactivables
- Recherche et filtres (All, Active, Inactive, Required)
- Statistiques en temps réel (Total, Active, Inactive)
- Sauvegarde dans la base de données via API

**Interface:**
```
┌─────────────────────────────────────────────────────────────────┐
│  [<Back]  Field Configurator                                    │
│  Configure which fields will be transferred to Salesforce       │
├─────────────────────────────────────────────────────────────────┤
│  [Total: 45]  [Active: 12]  [Inactive: 33]                     │
├─────────────────────────────────────────────────────────────────┤
│  [Search...]                                                     │
│  [All | Active | Inactive | Required]                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ FirstName       │  │ LastName  [REQ] │  │ Email           │ │
│  │ John            │  │ Doe       [REQ] │  │ john@email.com  │ │
│  │        [Toggle] │  │  [Always Active] │  │        [Toggle] │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  [Select All]  [Deselect All]  [Save Configuration]            │
└─────────────────────────────────────────────────────────────────┘
```

**Code Example:**
```javascript
// Utilisation dans fieldConfiguratorController.js
window.toggleField = async function(fieldName) {
    const field = allFields.find(f => f.name === fieldName);
    field.active = !field.active;
    await fieldMappingService.setFieldConfig(fieldName, { active: field.active });
    renderFields();
};

window.saveConfiguration = async function() {
    await fieldMappingService.bulkSaveToDatabase();
    showNotification('Configuration saved successfully!', 'success');
};
```

---

### 2. Preview Modal (`fieldPreviewModal.js`)

**Fonctionnalités:**
- Affiche les champs qui seront transférés
- Compte: Active Fields / Total Available / Empty Fields
- Avertissement si champs requis vides
- Bouton "Configure Fields" pour modifier rapidement
- Confirmation avant transfert

**Interface:**
```
┌─────────────────────────────────────────────────────────────────┐
│  📋 Transfer Preview                                            │
│  Review the fields that will be transferred to Salesforce       │
├─────────────────────────────────────────────────────────────────┤
│  [Active: 10]  [Total: 30]  [Empty: 2]                         │
├─────────────────────────────────────────────────────────────────┤
│  ⚠️ Empty Required Fields Detected                              │
│  LastName, Company are empty. Will be auto-filled.              │
├─────────────────────────────────────────────────────────────────┤
│  Fields to Transfer:                                            │
│  • FirstName: John                                              │
│  • LastName: ⚠️ Empty (will be auto-filled)                    │
│  • Email: john@example.com                                      │
│  • Company: ⚠️ Empty (will be auto-filled)                     │
│  ...                                                            │
├─────────────────────────────────────────────────────────────────┤
│  [Configure Fields]  [Cancel]  [Confirm Transfer]              │
└─────────────────────────────────────────────────────────────────┘
```

**Code Example:**
```javascript
import { showFieldPreviewModal } from './fieldPreviewModal.js';

// Afficher le modal
const confirmed = await showFieldPreviewModal(
    leadData,           // Données du lead
    configuredFields,   // Champs configurés actifs
    (data, emptyInfo) => {
        // Callback après confirmation
        proceedWithTransfer(data, emptyInfo);
    },
    () => {
        // Callback si annulation
        console.log('Transfer cancelled');
    }
);
```

---

### 3. Fake Data Generator (`fakeDataGenerator.js`)

**Fonctionnalités:**
- Génère des données réalistes pour champs vides
- Données cohérentes (email basé sur FirstName/LastName)
- Noms allemands et internationaux
- Entreprises B2B réalistes
- Adresses allemandes

**Champs Générés:**

| Champ | Exemple |
|-------|---------|
| FirstName | Emma, Liam, Noah |
| LastName | Müller, Schmidt, Johnson |
| Company | TechVision GmbH, DataFlow Solutions |
| Email | emma.mueller@example.com |
| Phone | +49 30 12345678 |
| MobilePhone | +49 151 23456789 |
| Street | Hauptstraße 42 |
| City | Berlin, München, Hamburg |
| PostalCode | 10115 |
| State | Bayern, Berlin |
| Title | CEO, Sales Manager |

**Code Example:**
```javascript
import fakeDataGenerator from './fakeDataGenerator.js';

// Vérifier si données vides
const emptyCheck = fakeDataGenerator.checkEmptyFields(
    leadData,
    ['LastName', 'Company']
);

if (emptyCheck.hasEmpty) {
    console.log('Empty fields:', emptyCheck.emptyFields);

    // Remplir automatiquement
    const result = fakeDataGenerator.fillEmptyFields(
        leadData,
        emptyCheck.emptyFields
    );

    leadData = result.data;
    console.log('Filled fields:', result.filledFields);
}
```

---

### 4. Integration Layer (`transferWithPreview.js`)

**Fonctionnalités:**
- Wrapper autour du transfert existant
- Affiche automatiquement le modal de preview
- Applique le fake data si nécessaire
- Compatible avec le code existant

**Code Example:**
```javascript
import { transferLeadWithPreview } from './transferWithPreview.js';

// Nouveau flux avec preview
await transferLeadWithPreview(
    leadData,
    fieldMappingService,
    async (filteredData) => {
        // Fonction de transfert originale
        await transferLeadDirectlyToSalesforce(filteredData);
    }
);
```

---

## Configuration API

### Structure de Données (LS_FieldMappings)

```json
{
    "EventId": "12345",
    "ApiEndpoint": "LeadSuccess_Event_API",
    "ConfigData": {
        "fieldConfig": {
            "config": {
                "fields": [
                    {
                        "fieldName": "FirstName",
                        "active": true,
                        "customLabel": "First Name",
                        "updatedAt": "2025-01-10T12:00:00Z"
                    },
                    {
                        "fieldName": "LastName",
                        "active": true,
                        "customLabel": "Last Name",
                        "updatedAt": "2025-01-10T12:00:00Z"
                    }
                ]
            }
        },
        "customLabels": {
            "Question01": "HotLead__c"
        },
        "customFields": [],
        "lastModified": "2025-01-10T12:00:00Z"
    }
}
```

---

## Champs Requis Salesforce

### Champs Obligatoires

Selon la documentation Salesforce, ces champs sont **TOUJOURS REQUIS**:

1. **LastName** (Nom de famille)
2. **Company** (Entreprise)

Ces champs:
- Ne peuvent PAS être désactivés dans le configurateur
- Sont TOUJOURS affichés avec le badge `[REQUIRED]`
- Sont automatiquement remplis avec fake data si vides

---

## Exemples d'Utilisation

### Exemple 1: Configuration Initiale

```javascript
// 1. User navigue vers fieldConfigurator.html
// 2. Charge tous les champs disponibles
const allFields = SALESFORCE_LEAD_FIELDS; // 50+ champs

// 3. User sélectionne 10 champs
toggleField('FirstName');  // Active
toggleField('LastName');   // Toujours actif (requis)
toggleField('Email');      // Active
toggleField('Company');    // Toujours actif (requis)
toggleField('Phone');      // Active
// ... 5 autres champs

// 4. Sauvegarde
await saveConfiguration();
// ✅ Saved to LS_FieldMappings with EventId
```

### Exemple 2: Transfert avec Preview

```javascript
// 1. User clique sur EventId
// 2. Chargement de la configuration
const configuredFields = fieldMappingService.getActiveFieldNames();
// ['FirstName', 'LastName', 'Email', 'Company', 'Phone', ...]

// 3. Filtrage des données
const filteredData = {};
for (const field of configuredFields) {
    filteredData[field] = leadData[field];
}

// 4. Vérification des champs vides
const emptyCheck = fakeDataGenerator.checkEmptyFields(filteredData);
// { hasEmpty: true, emptyFields: ['LastName', 'Company'] }

// 5. Affichage du modal
await showFieldPreviewModal(filteredData, configuredFields);
// User confirme → Transfert avec fake data
```

### Exemple 3: Fake Data Generation

```javascript
// Données originales (champs vides)
const leadData = {
    FirstName: 'John',
    LastName: '',        // Vide
    Email: 'john@test.com',
    Company: 'N/A',      // Considéré vide
    Phone: '+49123456'
};

// Génération automatique
const result = fakeDataGenerator.fillEmptyFields(leadData, ['LastName', 'Company']);

// Résultat
console.log(result.data);
// {
//     FirstName: 'John',
//     LastName: 'Müller',           // ✅ Généré
//     Email: 'john@test.com',
//     Company: 'TechVision GmbH',   // ✅ Généré
//     Phone: '+49123456'
// }

console.log(result.filledFields);
// ['LastName', 'Company']
```

---

## Avantages du Système

### Pour l'Utilisateur
✅ **Contrôle Total** - Choisit exactement quels champs transférer
✅ **Configuration Réutilisable** - Sauvegardée par Event
✅ **Preview Avant Transfert** - Voit exactement ce qui sera envoyé
✅ **Pas d'Erreurs** - Fake data pour champs requis vides
✅ **Interface Intuitive** - Toggles simples, recherche, filtres

### Pour le Développeur
✅ **Architecture Modulaire** - Composants séparés et réutilisables
✅ **Non-Invasif** - S'intègre avec le code existant
✅ **Extensible** - Facile d'ajouter de nouvelles fonctionnalités
✅ **Debuggable** - Logs détaillés à chaque étape
✅ **Type-Safe** - Validation des données

---

## Troubleshooting

### Problème: Configuration non sauvegardée

**Cause:** EventId non disponible

**Solution:**
```javascript
// Vérifier l'EventId
const eventId = sessionStorage.getItem('selectedEventId');
if (!eventId) {
    console.error('No EventId available');
    // Rediriger vers sélection d'event
}
```

### Problème: Champs toujours tous transférés

**Cause:** Configuration non chargée

**Solution:**
```javascript
// Vérifier que la configuration est chargée
await fieldMappingService.initializeFields(leadData, eventId);
const activeFields = fieldMappingService.getActiveFieldNames();
console.log('Active fields:', activeFields);
```

### Problème: Fake data non généré

**Cause:** Champs requis non détectés comme vides

**Solution:**
```javascript
// Le générateur détecte: null, undefined, '', 'N/A', 'n/a'
const isEmpty = fakeDataGenerator.isEmpty(value);
console.log('Is empty?', isEmpty);
```

---

## Tests Recommandés

### Test 1: Configuration Basique
1. Ouvrir fieldConfigurator.html
2. Désactiver tous les champs sauf FirstName, LastName, Company
3. Sauvegarder
4. Revenir à displayLeadTransfer.html
5. Cliquer sur un EventId
6. Vérifier que le modal affiche seulement ces 3 champs

### Test 2: Fake Data
1. Créer un lead avec LastName = '' et Company = 'N/A'
2. Cliquer Transfer
3. Vérifier l'avertissement dans le modal
4. Confirmer
5. Vérifier que les champs ont été remplis automatiquement

### Test 3: Champs Requis
1. Essayer de désactiver LastName dans le configurateur
2. Vérifier que le toggle ne fonctionne pas
3. Vérifier le badge [REQUIRED]

---

## Prochaines Améliorations

### Phase 2 (Optionnel)
- [ ] Ajout de custom fields temporaires dans le modal de preview
- [ ] Templates de configuration (Sales, Marketing, Support)
- [ ] Export/Import de configurations
- [ ] Mapping de champs (renommer avant transfert)
- [ ] Validation des valeurs avant transfert

---

## Support

Pour toute question ou problème:
1. Vérifier les logs dans la console du navigateur
2. Vérifier que tous les scripts sont chargés
3. Vérifier la structure de données dans localStorage
4. Contacter le développeur avec les logs d'erreur

---

**Version:** 1.0
**Date:** 2025-01-10
**Auteur:** Claude AI Assistant
