# Architecture de Stockage des Données

Ce document explique **où** et **comment** les données sont sauvegardées dans l'application.

---

## 🗄️ LES 3 SYSTÈMES DE STOCKAGE

### 1️⃣ **localStorage (Navigateur - Cache Local)**

**Emplacement:** Navigateur du client
**Durée de vie:** Permanent jusqu'à suppression manuelle
**Format:** JSON

**Données stockées:**
```javascript
// Field configurations
localStorage.setItem('salesforce_field_mapping', JSON.stringify({
  config: {
    fields: [
      { fieldName: "FirstName", active: true, customLabel: "First Name" },
      { fieldName: "Question01", active: false, customLabel: "Customer Question" }
    ]
  }
}));

// Custom labels
localStorage.setItem('salesforce_custom_labels', JSON.stringify({
  "Question01": "Customer_Question__c",
  "Answers01": "Customer_Response__c"
}));

// Custom fields (user-created)
localStorage.setItem('salesforce_custom_fields', JSON.stringify([
  {
    id: "custom_1699123456789",
    label: "My Custom Field",
    sfFieldName: "MyCustomField__c",
    value: "",
    active: true
  }
]));

// Lead edits (temporary per event)
localStorage.setItem('lead_edits_${eventId}', JSON.stringify({
  "FirstName": "John",
  "LastName": "Doe Updated"
}));
```

**Quand c'est utilisé:**
- ✅ Chargement initial (cache rapide)
- ✅ Offline mode (quand backend indisponible)
- ✅ Fallback si API échoue

**Code responsable:** `FieldMappingService.js`
- Ligne 526: `saveConfig()`
- Ligne 531: `saveCustomLabels()`
- Ligne 994: `saveCustomFields()`

---

### 2️⃣ **Backend API Database (Base de Données Centralisée)**

**Emplacement:** LeadSuccess API (lstest.convey.de)
**Durée de vie:** Permanent
**Format:** Base de données relationnelle

**Table: `LS_FieldMappingsView`**
```
Columns:
- FieldMappingsViewId (PK)
- EventId (FK)
- ConfigData (JSON text)
- CreatedDate
- LastModifiedDate
```

**Structure ConfigData (JSON):**
```json
{
  "fieldConfig": {
    "config": {
      "fields": [
        {
          "fieldName": "FirstName",
          "active": true,
          "customLabel": "First Name",
          "updatedAt": "2025-11-04T12:00:00Z"
        }
      ]
    }
  },
  "customLabels": {
    "Question01": "Customer_Question__c"
  },
  "customFields": [
    {
      "id": "custom_123",
      "label": "My Field",
      "sfFieldName": "MyField__c"
    }
  ],
  "lastModified": "2025-11-04T12:00:00Z",
  "version": "1.0"
}
```

**API Endpoints:**

**POST** `https://lstest.convey.de/apisftest/LS_FieldMappingsView`
- Créer une nouvelle configuration

**PATCH** `https://lstest.convey.de/apisftest/LS_FieldMappingsView(guid'xxx')`
- Mettre à jour une configuration existante

**GET** `https://lstest.convey.de/apisftest/LS_FieldMappingsView?$filter=EventId eq 'xxx'`
- Récupérer la configuration pour un EventId

**Code responsable:** `FieldMappingService.js`
- Ligne 227-286: `saveFieldMappingsToAPI()`
- Ligne 256: `findExistingRecord()` - Cherche si record existe
- Ligne 263: `updateRecord()` - Met à jour record existant
- Ligne 267: `createRecord()` - Crée nouveau record

---

### 3️⃣ **Salesforce Backend API (Session + Field Config)**

**Emplacement:** Backend Node.js + Salesforce
**Durée de vie:** Session (24h) ou Permanent (Salesforce)
**Format:** JSON + Salesforce Objects

#### A. **Session Backend (Per-Org Configuration)**

**Stockage:** `salesforce-backend/data/field-configs.json`

```json
{
  "00D9A000000IZ3Z": {
    "activeFields": ["FirstName", "LastName", "Question01"],
    "customLabels": {
      "Question01": "Customer_Question__c"
    },
    "lastUpdated": "2025-11-04T12:00:00Z"
  }
}
```

**API Endpoint:**

**POST** `/api/salesforce/field-config`
- Sauvegarder la configuration active

**GET** `/api/salesforce/field-config`
- Récupérer la configuration active

**Code responsable:**
- Backend: `salesforce-backend/fieldConfigStorage.js`
- Frontend: `FieldMappingService.js` ligne 851-882 (`saveActiveFieldsToBackend()`)

#### B. **Salesforce (Custom Fields)**

**Stockage:** Salesforce Metadata API

Quand un custom field est créé (ex: `Question01__c`), il est:
1. Créé dans Salesforce via Metadata API
2. Devient un vrai champ permanent dans l'objet Lead
3. Stocké dans Salesforce (pas dans notre DB)

**Code responsable:**
- `leadTransferService.js` ligne 108-159: `createMissingFields()`

---

## 🔄 FLUX DE SAUVEGARDE LORS D'UN TOGGLE

### Scénario: User toggle le champ "FirstName" de Active → Inactive

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER CLIQUE SUR TOGGLE                                   │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. EVENT HANDLER (displayLeadTransferController.js:1621)    │
│    toggle.addEventListener('change', async () => {...})     │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. UPDATE IN-MEMORY (ligne 1648-1652)                       │
│    window.selectedLeadData['FirstName'].active = false      │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. SAVE TO SERVICE (ligne 1657)                             │
│    window.fieldMappingService.setFieldConfig('FirstName',   │
│                                    { active: false })        │
└─────────────────────────────────────────────────────────────┘
                        ↓
        ┌───────────────┴───────────────┐
        ↓                               ↓
┌──────────────────────┐    ┌──────────────────────────┐
│ 5A. SAVE TO DB       │    │ 5B. SAVE TO BACKEND      │
│ (LeadSuccess API)    │    │ (Salesforce Backend)     │
└──────────────────────┘    └──────────────────────────┘
        │                               │
        ↓                               ↓
┌──────────────────────┐    ┌──────────────────────────┐
│ saveFieldMappingsTo  │    │ syncWithBackend()        │
│ API() (ligne 574)    │    │ (ligne 594)              │
│                      │    │                          │
│ → findExisting       │    │ → Debounced 1000ms      │
│   Record()           │    │ → saveActiveFieldsTo     │
│ → updateRecord()     │    │   Backend() (ligne 851)  │
│ → POST/PATCH to      │    │ → POST /api/salesforce/  │
│   lstest.convey.de   │    │   field-config           │
└──────────────────────┘    └──────────────────────────┘
        │                               │
        ↓                               ↓
┌──────────────────────┐    ┌──────────────────────────┐
│ 6A. DB UPDATED       │    │ 6B. BACKEND FILE UPDATED │
│ LS_FieldMappings     │    │ field-configs.json       │
│ View table           │    │                          │
└──────────────────────┘    └──────────────────────────┘
        │                               │
        └───────────────┬───────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. SAVE TO LOCALSTORAGE (ligne 590)                         │
│    localStorage.setItem('salesforce_field_mapping', ...)    │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. UPDATE UI (lignes 1670-1693)                             │
│    - Row styling ✅                                         │
│    - Status badge ✅                                        │
│    - Sync CardView ✅                                       │
│    - Update stats ✅                                        │
│    PAS DE RELOAD! ✅                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 📍 OÙ SONT LES DONNÉES PHYSIQUEMENT?

### **localStorage (DevTools → Application → Local Storage)**
```
http://localhost:5504
├── salesforce_field_mapping
├── salesforce_custom_labels
├── salesforce_custom_fields
├── lead_edits_${eventId}
└── orgId
```

### **LeadSuccess API Database**
```
Database: LeadSuccessDB
Table: LS_FieldMappingsView
Location: lstest.convey.de
```

### **Backend Node.js File System**
```
salesforce-backend/
└── data/
    └── field-configs.json
```

### **Salesforce**
```
Organization: 00D9A000000IZ3Z
Object: Lead
Custom Fields: Question01__c, Answers01__c, etc.
```

---

## 🔑 POURQUOI 3 SYSTÈMES?

### **localStorage**
- ✅ **Rapide**: Accès instantané
- ✅ **Offline**: Fonctionne sans connexion
- ❌ **Non partagé**: Limité au navigateur local

### **LeadSuccess API DB**
- ✅ **Partagé**: Accessible depuis n'importe quel appareil
- ✅ **Persistent**: Survit aux changements de navigateur
- ✅ **Historique**: Peut tracker les modifications
- ❌ **Plus lent**: Requiert réseau

### **Salesforce Backend**
- ✅ **Per-Org**: Configuration différente par organisation SF
- ✅ **OAuth session**: Lié à la session Salesforce active
- ✅ **Rapide sync**: Utilisé pour synchro temps réel
- ❌ **Temporaire**: Perdu si session expire

---

## 🛠️ COMMENT DEBUGGER LES SAUVEGARDES

### **1. Vérifier localStorage**
```javascript
// Dans la console browser
JSON.parse(localStorage.getItem('salesforce_field_mapping'))
JSON.parse(localStorage.getItem('salesforce_custom_labels'))
```

### **2. Vérifier LeadSuccess DB**
```javascript
// Regarder les logs dans FieldMappingService.js
// Chercher: "Field mappings saved to database successfully"
```

### **3. Vérifier Salesforce Backend**
```bash
# Regarder le fichier
cat salesforce-backend/data/field-configs.json
```

### **4. Vérifier Network Requests**
```
DevTools → Network
Filter: /LS_FieldMappingsView
Filter: /api/salesforce/field-config
```

---

## ⚠️ PIÈGES COURANTS

### **Problème: Données non sauvegardées**
**Cause:** Backend API down ou credentials manquants
**Solution:** Vérifier `this.credentials` et `this.currentEventId`

### **Problème: Synchronisation désactivée**
**Cause:** `this._isLoadingFromBackend = true`
**Solution:** Flag mis pendant le chargement pour éviter boucle infinie

### **Problème: Duplicate records**
**Cause:** `findExistingRecord()` ne trouve pas le record
**Solution:** Vérifier que EventId est correct dans la requête

---

## 📚 FICHIERS IMPORTANTS

### **Frontend:**
- `js/services/mapping/FieldMappingService.js` - Service central
- `js/controllers/displayLeadTransferController.js` - UI et toggles

### **Backend:**
- `salesforce-backend/server.js` - API endpoints (lignes 1250-1350)
- `salesforce-backend/fieldConfigStorage.js` - File system storage
- `salesforce-backend/leadTransferService.js` - Salesforce field creation

### **Documentation:**
- `ACTIVE_FIELDS_SYSTEM.md` - Système de champs actifs
- `RENDERING_STRATEGY_GUIDE.md` - Stratégies de rendu

---

**Dernière mise à jour:** 2025-11-04
**Auteur:** Documentation technique du projet
