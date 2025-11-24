# Système de Gestion des Champs Actifs par Client

## 🎯 Objectif

Permettre à chaque client de définir quels champs Question/Answers/Text sont actifs, et sauvegarder cette configuration pour les prochaines connexions.

---

## 🏗️ Architecture

### Fichiers Créés

1. **`leadTransferService.js`** - Service de transfert intelligent
   - Extraction des champs custom avec filtre "champs actifs"
   - Vérification de l'existence des champs dans Salesforce
   - Création automatique des champs manquants
   - Support des valeurs `null` pour les champs actifs

2. **`fieldConfigStorage.js`** - Stockage des configurations
   - Stockage en mémoire + fichier JSON
   - Configuration par `orgId` (organisation Salesforce)
   - Sauvegarde automatique

3. **`data/field-configs.json`** - Fichier de persistance
   - Créé automatiquement au démarrage
   - Contient les configurations de tous les clients

---

## 📋 Nouveaux Endpoints API

### 1. GET `/api/salesforce/field-config`

Récupère la configuration des champs actifs pour le client connecté.

**Headers :**
```
Cookie: connect.sid=<session>
```

**Réponse :**
```json
{
  "activeFields": ["Question01", "Question02", "Answers01", "Text01"],
  "customLabels": {
    "Question01": "Question 01",
    "Answers01": "Answers 01"
  },
  "lastUpdated": "2025-10-24T12:00:00.000Z"
}
```

---

### 2. POST `/api/salesforce/field-config`

Enregistre la configuration des champs actifs pour le client.

**Headers :**
```
Content-Type: application/json
Cookie: connect.sid=<session>
```

**Body :**
```json
{
  "activeFields": ["Question01", "Question02", "Answers01", "Text01"],
  "customLabels": {
    "Question01": "Question 01",
    "Answers01": "Answers 01"
  }
}
```

**Réponse :**
```json
{
  "success": true,
  "message": "Field configuration saved for 4 active fields",
  "config": {
    "activeFields": ["Question01", "Question02", "Answers01", "Text01"],
    "customLabels": {...},
    "lastUpdated": "2025-10-24T12:00:00.000Z"
  }
}
```

---

### 3. POST `/api/salesforce/leads/prepare`

Prépare le transfert en vérifiant et créant les champs manquants (avec filtre champs actifs).

**Headers :**
```
Content-Type: application/json
Cookie: connect.sid=<session>
```

**Body :**
```json
{
  "leadData": {
    "FirstName": "Gilbert",
    "LastName": "Schwaab",
    "Company": "convey INFORMATION SYSTEMS GmbH",
    "Email": "schwaab@convey.de",
    "Question01": "Products",
    "Answers01": null,
    "Question02": "Prospects",
    "Question06": "Question 06 value"
  }
}
```

**Réponse (Champs créés) :**
```json
{
  "step": "field_creation",
  "fieldsCreated": [
    {
      "apiName": "Question01__c",
      "label": "Question 01",
      "success": true
    },
    {
      "apiName": "Question02__c",
      "label": "Question 02",
      "success": true
    }
  ],
  "fieldsSkipped": [
    {
      "apiName": "Question06__c",
      "label": "Question 06",
      "reason": "Field already exists"
    }
  ],
  "fieldsFailed": [],
  "missingFields": ["Question01__c", "Question02__c"],
  "existingFields": ["Question06__c"],
  "readyForTransfer": true
}
```

---

## 🔄 Flux Complet de Transfert

### Étape 1 : Définir les Champs Actifs

Le frontend envoie la liste des champs actifs cochés par l'utilisateur :

```
POST /api/salesforce/field-config

{
  "activeFields": ["Question01", "Question02", "Answers01", "Text01"],
  "customLabels": {}
}
```

✅ **Résultat** : Configuration sauvegardée dans `data/field-configs.json`

---

### Étape 2 : Préparer le Transfert

Avant de transférer, vérifier quels champs doivent être créés :

```
POST /api/salesforce/leads/prepare

{
  "leadData": {
    "Question01": "Products",
    "Answers01": null,
    "Question02": "Prospects",
    "Question06": "Not active"
  }
}
```

🔍 **Le système fait** :
1. Récupère les champs actifs pour ce client
2. Filtre uniquement `Question01`, `Answers01`, `Question02` (actifs)
3. Ignore `Question06` (non actif)
4. Vérifie quels champs existent dans Salesforce
5. Crée les champs manquants
6. Retourne le résumé

✅ **Résultat** : Champs créés dans Salesforce

---

### Étape 3 : Transférer le Lead

Après préparation réussie :

```
POST /api/salesforce/leads

{
  "leadData": {
    "FirstName": "Gilbert",
    "LastName": "Schwaab",
    "Company": "convey INFORMATION SYSTEMS GmbH",
    "Question01__c": "Products",
    "Answers01__c": null,
    "Question02__c": "Prospects"
  },
  "attachments": []
}
```

✅ **Résultat** : Lead créé avec champs actifs uniquement

---

## 💡 Fonctionnalités Clés

### 1. Support des Valeurs `null`

✅ **Accepte les valeurs `null`** pour les champs actifs
- Permet de vider des champs dans Salesforce
- Si un champ est actif mais vide, il sera quand même transféré

**Exemple :**
```json
{
  "Question01": "Value",
  "Answers01": null,    // ✅ Sera transféré car actif
  "Question02": null    // ✅ Sera transféré car actif
}
```

---

### 2. Filtrage par Champs Actifs

✅ **Seuls les champs actifs** sont traités
- Les champs non actifs sont ignorés
- Économise des appels API
- Évite la création de champs inutiles

**Exemple :**
```javascript
// Champs actifs configurés
activeFields = ["Question01", "Question02"]

// Données du lead
leadData = {
  "Question01": "Value",  // ✅ Traité (actif)
  "Question02": "Value",  // ✅ Traité (actif)
  "Question06": "Value"   // ⏭️  Ignoré (non actif)
}
```

---

### 3. Sauvegarde Persistante

✅ **Configuration sauvegardée** dans un fichier JSON
- Restaurée au redémarrage du serveur
- Spécifique à chaque client (`orgId`)
- Mise à jour automatique

**Fichier `data/field-configs.json` :**
```json
{
  "00DgK000000800O": {
    "activeFields": ["Question01", "Question02", "Answers01"],
    "customLabels": {},
    "lastUpdated": "2025-10-24T12:00:00.000Z"
  },
  "00DgK000000900P": {
    "activeFields": ["Question01", "Question03", "Text01"],
    "customLabels": {},
    "lastUpdated": "2025-10-24T11:00:00.000Z"
  }
}
```

---

## 🧪 Tests avec Postman

### Test 1 : Configurer les Champs Actifs

```
POST http://localhost:3000/api/salesforce/field-config

Body:
{
  "activeFields": ["Question01", "Question02", "Answers01", "Text01"],
  "customLabels": {}
}
```

**Résultat attendu :** `200 OK` avec confirmation

---

### Test 2 : Récupérer la Configuration

```
GET http://localhost:3000/api/salesforce/field-config
```

**Résultat attendu :** Configuration sauvegardée

---

### Test 3 : Préparer le Transfert

```
POST http://localhost:3000/api/salesforce/leads/prepare

Body:
{
  "leadData": {
    "Question01": "Products",
    "Answers01": null,
    "Question02": "Prospects",
    "Question06": "This field is not active"
  }
}
```

**Résultat attendu :**
- Extraction de `Question01`, `Answers01`, `Question02` uniquement
- Ignore `Question06` (non actif)
- Créé les champs manquants dans Salesforce

---

### Test 4 : Transférer le Lead

```
POST http://localhost:3000/api/salesforce/leads

Body:
{
  "leadData": {
    "FirstName": "Test",
    "LastName": "User",
    "Company": "Test Corp",
    "Question01__c": "Products",
    "Answers01__c": null,
    "Question02__c": "Prospects"
  },
  "attachments": []
}
```

**Résultat attendu :** Lead créé avec succès

---

## 📊 Avantages du Système

✅ **Personnalisation par client** - Chaque organisation Salesforce a sa propre configuration
✅ **Persistance** - Configuration sauvegardée automatiquement
✅ **Performance** - Seuls les champs actifs sont traités
✅ **Flexibilité** - Support des valeurs `null`
✅ **Automatisation** - Création automatique des champs manquants
✅ **Sécurité** - Configuration isolée par `orgId`

---

## 🔄 Intégration Frontend

Le frontend doit appeler ces endpoints pour :

1. **Au chargement** : Récupérer la configuration sauvegardée
   ```javascript
   const config = await fetch('/api/salesforce/field-config');
   ```

2. **Quand l'utilisateur modifie les champs actifs** : Sauvegarder
   ```javascript
   await fetch('/api/salesforce/field-config', {
     method: 'POST',
     body: JSON.stringify({ activeFields: [...] })
   });
   ```

3. **Avant le transfert** : Préparer (vérifier/créer champs)
   ```javascript
   const result = await fetch('/api/salesforce/leads/prepare', {
     method: 'POST',
     body: JSON.stringify({ leadData: {...} })
   });
   ```

4. **Transfert final** : Envoyer uniquement les champs actifs
   ```javascript
   await fetch('/api/salesforce/leads', {
     method: 'POST',
     body: JSON.stringify({ leadData: {...} })
   });
   ```

---

🎉 **Le système est maintenant prêt à gérer les champs actifs par client avec création automatique des champs manquants !**
