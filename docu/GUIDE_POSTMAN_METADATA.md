# Guide Postman: Inspecter les Métadonnées Salesforce

## 📋 Ce que vous allez voir

Ce guide vous montre comment utiliser Postman pour voir **exactement** ce que retourne `conn.describe('Lead')` et comment le système valide les CountryCode.

---

## 🚀 Installation Rapide

### Étape 1: Charger les Debug Endpoints dans server.js

Ajoutez cette ligne dans `server.js` (après les imports, ligne ~15):

```javascript
// Import debug endpoints
const setupDebugEndpoints = require('./debug-endpoints');
```

Puis après la définition de `app` (ligne ~250, juste après les autres routes):

```javascript
// Setup debug endpoints (for Postman testing)
setupDebugEndpoints(app, getCurrentOrgId, getConnection);
```

### Étape 2: Redémarrer le serveur

```bash
cd c:/gitprojects/LSAPISFCRM/salesforce-backend
node server.js
```

### Étape 3: Importer la Collection Postman

1. Ouvrez Postman
2. Click "Import" (en haut à gauche)
3. Sélectionnez le fichier: `POSTMAN_METADATA_COLLECTION.json`
4. La collection "Salesforce Metadata Inspector" apparaît

---

## 🔑 Prérequis IMPORTANT

**Vous DEVEZ être connecté à Salesforce d'abord!**

1. Ouvrez votre navigateur: http://localhost:3000/displayLeadTransfer
2. Cliquez sur "Connect to Salesforce"
3. Connectez-vous à Salesforce
4. **Seulement après**, utilisez Postman

**Pourquoi?** Les endpoints utilisent votre session Salesforce. Sans connexion active, vous aurez une erreur 401.

---

## 📊 Les 6 Endpoints Disponibles

### 1️⃣ GET - Full Lead Metadata

**URL:** `http://localhost:3000/api/salesforce/metadata/lead`

**Ce que ça retourne:**
```json
{
  "success": true,
  "objectName": "Lead",
  "label": "Lead",
  "totalFields": 87,
  "fields": [
    {
      "name": "CountryCode",
      "label": "Country Code",
      "type": "picklist",
      "length": 2,
      "updateable": true,
      "createable": true,
      "picklistValues": [
        { "value": "AF", "label": "Afghanistan", "active": true },
        { "value": "AX", "label": "Åland Islands", "active": true },
        { "value": "AL", "label": "Albania", "active": true },
        { "value": "DZ", "label": "Algeria", "active": true },
        // ... 249 valeurs au total
      ]
    },
    {
      "name": "Country",
      "label": "Country",
      "type": "picklist",
      "picklistValues": [
        { "value": "Afghanistan", "label": "Afghanistan", "active": true },
        { "value": "Albania", "label": "Albania", "active": true },
        // ...
      ]
    },
    // ... tous les autres champs (FirstName, LastName, Email, etc.)
  ],
  "countryCodeField": { /* Détails spécifiques CountryCode */ },
  "countryField": { /* Détails spécifiques Country */ }
}
```

**Utilité:** Voir TOUS les champs disponibles dans Lead, leurs types, et toutes les valeurs de picklist.

---

### 2️⃣ GET - CountryCode Picklist Values (Vue Ciblée)

**URL:** `http://localhost:3000/api/salesforce/metadata/countrycodes`

**Ce que ça retourne:**
```json
{
  "success": true,
  "countryCode": {
    "fieldName": "CountryCode",
    "label": "Country Code",
    "type": "picklist",
    "totalValues": 249,
    "activeValues": 249,
    "inactiveValues": 0,
    "values": [
      { "value": "DE", "label": "Germany", "active": true },
      { "value": "FR", "label": "France", "active": true },
      { "value": "GB", "label": "United Kingdom", "active": true },
      { "value": "US", "label": "United States", "active": true },
      // ... tous les codes
    ]
  },
  "country": {
    "fieldName": "Country",
    "label": "Country",
    "totalValues": 249,
    "values": [
      { "value": "Germany", "label": "Germany", "active": true },
      { "value": "France", "label": "France", "active": true },
      // ...
    ]
  },
  "mapping": {
    "description": "Automatic Country → CountryCode mapping",
    "totalMappings": 35,
    "mappings": {
      "DE": ["Germany", "Deutschland"],
      "FR": ["France"],
      "GB": ["United Kingdom", "UK"],
      "US": ["United States", "USA"],
      // ...
    }
  },
  "summary": {
    "totalActiveCountryCodes": 249,
    "totalActiveCountryNames": 249,
    "sampleActiveCodes": "AF, AX, AL, DZ, AS, AD, AO, AI, AQ, AG"
  }
}
```

**Utilité:**
- Voir tous les codes ISO valides (DE, FR, GB, etc.)
- Voir le mapping automatique Country → CountryCode
- Comprendre comment le validator fonctionne

---

### 3️⃣ POST - Test Validation (Données Valides)

**URL:** `http://localhost:3000/api/salesforce/metadata/test-country-validation`

**Body (JSON):**
```json
{
  "CountryCode": "DE",
  "Country": "Germany"
}
```

**Réponse:**
```json
{
  "success": true,
  "input": {
    "CountryCode": "DE",
    "Country": "Germany"
  },
  "output": {
    "CountryCode": "DE",
    "Country": "Germany"
  },
  "changes": {
    "countryCodeChanged": false,
    "countryChanged": false,
    "countryCodeRemoved": false,
    "countryRemoved": false
  }
}
```

**Résultat:** Aucun changement (données valides) ✅

---

### 4️⃣ POST - Test Validation (CountryCode Invalide "DE1")

**Body (JSON):**
```json
{
  "CountryCode": "DE1",
  "Country": "Germany1"
}
```

**Réponse:**
```json
{
  "success": true,
  "input": {
    "CountryCode": "DE1",
    "Country": "Germany1"
  },
  "output": {
    "CountryCode": "DE",
    "Country": "Germany"
  },
  "changes": {
    "countryCodeChanged": true,
    "countryChanged": true,
    "countryCodeRemoved": false,
    "countryRemoved": false
  }
}
```

**Résultat:**
- ✅ CountryCode corrigé: "DE1" → "DE"
- ✅ Country nettoyé: "Germany1" → "Germany"

---

### 5️⃣ POST - Test Validation (Mismatch)

**Body (JSON):**
```json
{
  "CountryCode": "FR",
  "Country": "Germany"
}
```

**Réponse:**
```json
{
  "success": true,
  "input": {
    "CountryCode": "FR",
    "Country": "Germany"
  },
  "output": {
    "Country": "Germany"
  },
  "changes": {
    "countryCodeChanged": false,
    "countryChanged": false,
    "countryCodeRemoved": true,
    "countryRemoved": false
  }
}
```

**Résultat:**
- ⚠️ CountryCode supprimé (mismatch détecté)
- ✅ Country conservé: "Germany"

---

### 6️⃣ POST - Test Validation (Code Invalide "XX")

**Body (JSON):**
```json
{
  "CountryCode": "XX",
  "Country": "Germany"
}
```

**Réponse:**
```json
{
  "success": true,
  "input": {
    "CountryCode": "XX",
    "Country": "Germany"
  },
  "output": {
    "Country": "Germany"
  },
  "changes": {
    "countryCodeChanged": false,
    "countryChanged": false,
    "countryCodeRemoved": true,
    "countryRemoved": false
  }
}
```

**Résultat:**
- ⚠️ CountryCode supprimé ("XX" n'existe pas dans Salesforce)
- ✅ Country conservé: "Germany"

---

## 🔍 Exploration des Métadonnées

### Question 1: Combien de codes pays valides?

**Endpoint:** `GET /api/salesforce/metadata/countrycodes`

**Réponse:**
```json
{
  "summary": {
    "totalActiveCountryCodes": 249
  }
}
```

**Réponse:** 249 codes ISO actifs dans Salesforce Standard

---

### Question 2: Quels sont les 10 premiers codes?

**Endpoint:** `GET /api/salesforce/metadata/countrycodes`

**Réponse:**
```json
{
  "summary": {
    "sampleActiveCodes": "AF, AX, AL, DZ, AS, AD, AO, AI, AQ, AG"
  }
}
```

---

### Question 3: Le code "DE" existe-t-il?

**Endpoint:** `GET /api/salesforce/metadata/countrycodes`

**Recherche dans la réponse:**
```json
{
  "countryCode": {
    "values": [
      { "value": "DE", "label": "Germany", "active": true }
    ]
  }
}
```

**Réponse:** Oui ✅

---

### Question 4: Quels noms de pays correspondent à "DE"?

**Endpoint:** `GET /api/salesforce/metadata/countrycodes`

**Réponse:**
```json
{
  "mapping": {
    "mappings": {
      "DE": ["Germany", "Deutschland"]
    }
  }
}
```

**Réponse:** "Germany" et "Deutschland"

---

## ⚠️ Erreurs Communes

### Erreur 401: Not connected to Salesforce

**Message:**
```json
{
  "message": "Not connected to Salesforce",
  "tip": "Please connect to Salesforce first via the UI at http://localhost:3000/displayLeadTransfer"
}
```

**Solution:** Connectez-vous d'abord via le navigateur!

---

### Erreur: CountryCode field not found

**Message:**
```json
{
  "success": false,
  "message": "CountryCode field not found in Lead object",
  "tip": "Your Salesforce org may not have standard address fields enabled"
}
```

**Solution:** Votre org Salesforce n'a pas activé les champs d'adresse standard (State and Country Picklists).

---

## 📚 Relation avec le Code

### Comment le validator utilise ces métadonnées:

```javascript
// 1. Récupération des métadonnées (comme l'endpoint #1)
const metadata = await conn.describe('Lead');

// 2. Extraction du champ CountryCode (comme l'endpoint #2)
const countryCodeField = metadata.fields.find(f => f.name === 'CountryCode');

// 3. Extraction des valeurs valides
const validCodes = countryCodeField.picklistValues
    .filter(pv => pv.active)
    .map(pv => pv.value);
// Résultat: ['DE', 'FR', 'GB', 'US', ...]

// 4. Validation (comme l'endpoint #4)
if (!validCodes.includes("DE1")) {
    // "DE1" n'existe pas → Correction vers "DE"
}
```

---

## 🎯 Cas d'Usage

### Use Case 1: Vérifier si mon org a des codes custom

**Endpoint:** `GET /api/salesforce/metadata/countrycodes`

**Rechercher dans values:** Des codes non-standard (ex: "XX", "ZZ", etc.)

---

### Use Case 2: Tester la validation avant d'envoyer un lead réel

**Endpoint:** `POST /api/salesforce/metadata/test-country-validation`

**Body:** Vos données
**Résultat:** Vous voyez les corrections AVANT le transfer réel

---

### Use Case 3: Comprendre pourquoi mon CountryCode est rejeté

**Endpoint:** `GET /api/salesforce/metadata/countrycodes`

**Rechercher:** Si votre code existe dans la liste `values`

---

## 📝 Fichiers Créés

- ✅ `debug-endpoints.js` - Les 3 endpoints de debug
- ✅ `POSTMAN_METADATA_COLLECTION.json` - Collection Postman prête
- ✅ `GUIDE_POSTMAN_METADATA.md` - Ce guide

---

## 🚀 Prochaines Étapes

1. **Importer** la collection dans Postman
2. **Se connecter** à Salesforce via le navigateur
3. **Tester** les endpoints dans Postman
4. **Explorer** les métadonnées de votre org
5. **Comprendre** comment le validator fonctionne

Amusez-vous bien! 🎉
