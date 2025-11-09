# Guide de Test Postman - Salesforce Custom Fields & Lead Transfer

## 🎯 Objectif
Tester la création de champs custom dans Salesforce, puis transférer un lead avec ces champs.

---

## 📋 Prérequis

1. **Access Token Salesforce**
   - Vous devez obtenir un access token OAuth 2.0 (voir section ci-dessous)

2. **Backend démarré** (optionnel pour certains tests)
   - Le serveur Node.js doit être actif : `http://localhost:3000`

3. **Postman installé**

---

## 🔑 Obtenir un Access Token OAuth 2.0

### Méthode 1 : Via Postman (Recommandé)

#### Étape 1 : Obtenir l'Authorization Code

Ouvrez votre navigateur et allez sur cette URL (remplacez les valeurs par les vôtres) :

```
https://YOUR_INSTANCE.salesforce.com/services/oauth2/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=https://oauth.pstmn.io/v1/callback&scope=api%20refresh_token
```

**Exemple :**
```
https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com/services/oauth2/authorize?response_type=code&client_id=3MVG9rZjd7MXFdLjcmv2WrBcFyVgqfMxdzyW7.osW1KAWHjC4Oh_C31c_DOCfKp0dkrPO6tvApDr8Y5qfql&redirect_uri=https://oauth.pstmn.io/v1/callback&scope=api%20refresh_token
```

**Résultat :** Vous serez redirigé vers une URL contenant le code :
```
https://oauth.pstmn.io/v1/callback?code=aPrx.ppuB8UlvcFbz9JJnoDvwk03jgY1WwFLQq9qCshybbmCta1IYntTi67NFpNt4_jJFzOdKw%3D%3D
```

**⚠️ IMPORTANT :** Le code est URL-encodé. Décodez les `%3D` en `=` :
- **Encodé :** `...zOdKw%3D%3D`
- **Décodé :** `...zOdKw==`

#### Étape 2 : Échanger le Code contre un Access Token

**Endpoint :**
```
POST https://YOUR_INSTANCE.salesforce.com/services/oauth2/token
```

**Headers :**
```
Content-Type: application/x-www-form-urlencoded
```

**Body** (form-data) :
```
grant_type: authorization_code
code: aPrx.ppuB8UlvcFbz9JJnoDvwk03jgY1WwFLQq9qCshybbmCta1IYntTi67NFpNt4_jJFzOdKw==
client_id: YOUR_CLIENT_ID
client_secret: YOUR_CLIENT_SECRET
redirect_uri: https://oauth.pstmn.io/v1/callback
```

**Réponse :**
```json
{
  "access_token": "00DgK000000800O!AQEAQHimXKaYlaJIVkCf41doBYKTqP_CndygkjszvYmVve_c_kQQkIZ_PdKbuA7AcrpDkAUT3EXkFS1AmppEsasMn3xqZ_e",
  "refresh_token": "5Aep861ZtC5NxGKVYoh_1SVjgYz_fJeZ.G6A7wjrfXm8hi3Giqz1iio0LCLRbSgN.LnjpqUxkNgtplZZUQs9Hd",
  "signature": "TExvfl+cI0u6GRsxd9NIVAxRIZVHnNUYzd6Je3Ocgu1vB=",
  "scope": "refresh_token api",
  "instance_url": "https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com",
  "id": "https://login.salesforce.com/id/00DgK000000800OMLxUAO/005gK00000TSnjQwN",
  "token_type": "Bearer",
  "issued_at": "1761299948848"
}
```

**✅ Sauvegardez :**
- `access_token` : Pour les requêtes API
- `refresh_token` : Pour obtenir de nouveaux access tokens
- `instance_url` : L'URL de votre org Salesforce

### Méthode 2 : Via l'Interface Web

1. Connectez-vous via l'interface web de votre application
2. Ouvrez la console du navigateur (F12)
3. Tapez :
```javascript
JSON.parse(localStorage.getItem('sf_connection_data')).accessToken
```

---

## 🔧 Test 1 : Créer un Champ Custom via Tooling API (Méthode Directe)

### Endpoint
```
POST https://YOUR_INSTANCE.salesforce.com/services/data/v56.0/tooling/sobjects/CustomField?Content-Type=application/json
```

**Exemple :**
```
POST https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com/services/data/v56.0/tooling/sobjects/CustomField?Content-Type=application/json
```

### Headers
```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

### Body (JSON)
```json
{
  "FullName": "Lead.Question01__c",
  "Metadata": {
    "type": "Text",
    "label": "Question 01",
    "length": 255,
    "required": false
  }
}
```

### Réponse Attendue (Succès)
```json
{
  "id": "00NgK00002RVDbeUAH",
  "success": true,
  "errors": [],
  "warnings": [],
  "infos": []
}
```

### ⚠️ Points Importants
- Le `FullName` DOIT inclure le suffixe `__c` pour les champs custom : `Lead.Question01__c`
- **Status 201 Created** = Succès
- L'`id` retourné est l'ID du champ créé dans Salesforce

---

## 🔧 Test 2 : Créer Plusieurs Champs via le Backend (Recommandé)

### Endpoint
```
POST http://localhost:3000/api/salesforce/create-fields
```

### Headers
```
Content-Type: application/json
Cookie: connect.sid=<votre_session_id>
```

### Body (JSON)
```json
{
  "fields": [
    {
      "apiName": "Question01__c",
      "label": "Question 01"
    },
    {
      "apiName": "Answers01__c",
      "label": "Answers 01"
    },
    {
      "apiName": "Text01__c",
      "label": "Text 01"
    }
  ]
}
```

### Réponse Attendue (Succès)
```json
{
  "success": true,
  "created": [
    {
      "apiName": "Question01__c",
      "label": "Question 01",
      "success": true
    }
  ],
  "failed": [],
  "message": "Created 1 field(s), 0 failed"
}
```

### Réponse Attendue (Champ Existe Déjà)
```json
{
  "success": false,
  "created": [],
  "failed": [
    {
      "apiName": "Question01__c",
      "label": "Question 01",
      "error": "[{\"statusCode\":\"DUPLICATE_VALUE\",\"message\":\"There's already a field named 'Question01' on Lead\"}]"
    }
  ],
  "message": "Created 0 field(s), 1 failed"
}
```

---

## 🧪 Test 2 : Créer Plusieurs Champs Custom

### Body (JSON)
```json
{
  "fields": [
    {
      "apiName": "Question01__c",
      "label": "Question 01"
    },
    {
      "apiName": "Answers01__c",
      "label": "Answers 01"
    },
    {
      "apiName": "Text01__c",
      "label": "Text 01"
    },
    {
      "apiName": "Question02__c",
      "label": "Question 02"
    },
    {
      "apiName": "Answers02__c",
      "label": "Answers 02"
    },
    {
      "apiName": "Text02__c",
      "label": "Text 02"
    }
  ]
}
```

### Réponse Attendue
```json
{
  "success": true,
  "created": [
    {
      "apiName": "Question01__c",
      "label": "Question 01",
      "success": true
    },
    {
      "apiName": "Answers01__c",
      "label": "Answers 01",
      "success": true
    },
    {
      "apiName": "Text01__c",
      "label": "Text 01",
      "success": true
    },
    {
      "apiName": "Question02__c",
      "label": "Question 02",
      "success": true
    },
    {
      "apiName": "Answers02__c",
      "label": "Answers 02",
      "success": true
    },
    {
      "apiName": "Text02__c",
      "label": "Text 02",
      "success": true
    }
  ],
  "failed": [],
  "message": "Created 6 field(s), 0 failed"
}
```

---

## 📋 CRUD Complet pour les Leads

### ✨ CREATE : Créer un Lead

#### Via API REST Salesforce (Recommandé pour tests)

**Endpoint :**
```
POST https://YOUR_INSTANCE.salesforce.com/services/data/v56.0/sobjects/Lead
```

**Exemple :**
```
POST https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com/services/data/v56.0/sobjects/Lead
```

**Headers :**
```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Body (JSON) :**
```json
{
  "FirstName": "Gilbert",
  "LastName": "Schwaab",
  "Company": "convey INFORMATION SYSTEMS GmbH",
  "Email": "schwaab@convey.de",
  "Phone": "+49 (0)89 54 344",
  "MobilePhone": "+49 (0)151 52 634 364",
  "Title": "Systementwicklung",
  "Street": "Leonrodstraße 68",
  "PostalCode": "80636",
  "City": "München",
  "Country": "Germany",
  "Question01__c": "Field of activity",
  "Answers01__c": "IT Services",
  "Text01__c": "Software development and consulting",
  "Question02__c": "Interest / offer for",
  "Answers02__c": "CRM Solutions",
  "Question06__c": "Question 06 value"
}
```

**Réponse Attendue (Succès) :**
```json
{
  "id": "00Q5i000001XXXXUAX",
  "success": true,
  "errors": []
}
```

**Réponse Attendue (Erreur - Champ Requis Manquant) :**
```json
{
  "message": "Required fields are missing: [LastName, Company]",
  "errorCode": "REQUIRED_FIELD_MISSING",
  "fields": ["LastName", "Company"]
}
```

**Réponse Attendue (Erreur - Champ Custom Non Accessible) :**
```json
{
  "message": "No such column 'Question06__c' on sobject of type Lead",
  "errorCode": "INVALID_FIELD"
}
```

**⚠️ Si vous obtenez l'erreur "No such column" alors que le champ existe :**

Cela signifie que le champ n'est **pas accessible via l'API** à cause des permissions. Suivez ces étapes :

#### Solution : Configurer Field-Level Security

1. Dans Salesforce : **Setup** → **Object Manager** → **Lead** → **Fields & Relationships**

2. Cliquez sur le champ concerné (ex: `Question06__c`)

3. Cliquez sur **Set Field-Level Security**

4. **Cochez les cases** pour tous les profils (minimum votre profil actuel) :
   - ✅ **Visible**
   - ⬜ **Read-Only** (décochez cette case pour permettre la création/modification)

5. Cliquez sur **Save**

6. Répétez pour tous les champs custom

#### Vérification Rapide via Developer Console

Ouvrez **Developer Console** et exécutez ce code :

```apex
Schema.DescribeFieldResult fieldDescribe = Lead.Question06__c.getDescribe();
System.debug('Accessible: ' + fieldDescribe.isAccessible());
System.debug('Createable: ' + fieldDescribe.isCreateable());
System.debug('Updateable: ' + fieldDescribe.isUpdateable());
```

Les trois doivent retourner `true` pour que l'API puisse utiliser le champ.

---

### 📖 READ : Récupérer un/des Lead(s)

#### 1. Récupérer UN Lead par ID

**Endpoint :**
```
GET https://YOUR_INSTANCE.salesforce.com/services/data/v56.0/sobjects/Lead/{LEAD_ID}
```

**Exemple :**
```
GET https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com/services/data/v56.0/sobjects/Lead/00Q5i000001XXXXUAX
```

**Headers :**
```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Réponse Attendue :**
```json
{
  "attributes": {
    "type": "Lead",
    "url": "/services/data/v56.0/sobjects/Lead/00Q5i000001XXXXUAX"
  },
  "Id": "00Q5i000001XXXXUAX",
  "FirstName": "Gilbert",
  "LastName": "Schwaab",
  "Company": "convey INFORMATION SYSTEMS GmbH",
  "Email": "schwaab@convey.de",
  "Phone": "+49 (0)89 54 344",
  "Question01__c": "Field of activity",
  "Answers01__c": "IT Services",
  "Text01__c": "Software development and consulting"
}
```

#### 2. Récupérer Plusieurs Leads avec SOQL

**Endpoint :**
```
GET https://YOUR_INSTANCE.salesforce.com/services/data/v56.0/query?q=SELECT+Id,FirstName,LastName,Company,Email,Question01__c,Answers01__c+FROM+Lead+WHERE+Company='convey INFORMATION SYSTEMS GmbH'+LIMIT+10
```

**Headers :**
```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Query SOQL Décodée :**
```sql
SELECT Id, FirstName, LastName, Company, Email, Question01__c, Answers01__c
FROM Lead
WHERE Company = 'convey INFORMATION SYSTEMS GmbH'
LIMIT 10
```

**Réponse Attendue :**
```json
{
  "totalSize": 2,
  "done": true,
  "records": [
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v56.0/sobjects/Lead/00Q5i000001XXXXUAX"
      },
      "Id": "00Q5i000001XXXXUAX",
      "FirstName": "Gilbert",
      "LastName": "Schwaab",
      "Company": "convey INFORMATION SYSTEMS GmbH",
      "Email": "schwaab@convey.de",
      "Question01__c": "Field of activity",
      "Answers01__c": "IT Services"
    }
  ]
}
```

---

### ✏️ UPDATE : Mettre à Jour un Lead

**Endpoint :**
```
PATCH https://YOUR_INSTANCE.salesforce.com/services/data/v56.0/sobjects/Lead/{LEAD_ID}
```

**Exemple :**
```
PATCH https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com/services/data/v56.0/sobjects/Lead/00Q5i000001XXXXUAX
```

**Headers :**
```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Body (JSON) :**
```json
{
  "Phone": "+49 (0)89 54 344 999",
  "Question01__c": "Updated field of activity",
  "Answers01__c": "Cloud Services",
  "Status": "Working - Contacted"
}
```

**Réponse Attendue (Succès) :**
```
Status: 204 No Content
```
(Pas de body, le succès est indiqué par le status code 204)

**Réponse Attendue (Erreur) :**
```json
{
  "message": "Lead with ID 00Q5i000001XXXXUAX not found",
  "errorCode": "NOT_FOUND"
}
```

---

### 🗑️ DELETE : Supprimer un Lead

**Endpoint :**
```
DELETE https://YOUR_INSTANCE.salesforce.com/services/data/v56.0/sobjects/Lead/{LEAD_ID}
```

**Exemple :**
```
DELETE https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com/services/data/v56.0/sobjects/Lead/00Q5i000001XXXXUAX
```

**Headers :**
```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Réponse Attendue (Succès) :**
```
Status: 204 No Content
```

**Réponse Attendue (Erreur) :**
```json
{
  "message": "entity is deleted",
  "errorCode": "ENTITY_IS_DELETED"
}
```

---

## 🚀 Processus de Transfert Automatique avec Création de Champs

### Nouveau Flux (Recommandé)

Le nouveau processus vérifie automatiquement les champs manquants et les crée avant le transfert.

#### Étape 1 : Préparer le Transfert (Vérifier et Créer les Champs)

**Endpoint :**
```
POST http://localhost:3000/api/salesforce/leads/prepare
```

**Headers :**
```
Content-Type: application/json
Cookie: connect.sid=<session_id>
```

**Body (JSON) :**
```json
{
  "leadData": {
    "FirstName": "Gilbert",
    "LastName": "Schwaab",
    "Company": "convey INFORMATION SYSTEMS GmbH",
    "Email": "schwaab@convey.de",
    "Phone": "+49 (0)89 54 344",
    "Question01": "Products",
    "Answers01": null,
    "Text01": null,
    "Question02": "Prospects",
    "Answers02": null,
    "Text02": null,
    "Question06": "Question 06 value"
  }
}
```

**Réponse Attendue (Champs Créés) :**
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
    },
    {
      "apiName": "Question06__c",
      "label": "Question 06",
      "success": true
    }
  ],
  "fieldsSkipped": [
    {
      "apiName": "Answers01__c",
      "label": "Answers 01",
      "reason": "Field already exists"
    }
  ],
  "fieldsFailed": [],
  "missingFields": ["Question01__c", "Question02__c", "Question06__c"],
  "existingFields": ["Answers01__c"],
  "readyForTransfer": true
}
```

**Réponse Attendue (Tous les Champs Existent) :**
```json
{
  "step": "ready_for_transfer",
  "customFields": [
    {
      "apiName": "Question01__c",
      "originalName": "Question01",
      "value": "Products",
      "label": "Question 01"
    }
  ],
  "message": "All required fields exist, ready to transfer lead"
}
```

**💡 Explications :**
- Le système extrait automatiquement les champs `Question`, `Answers`, `Text` avec des valeurs non-null
- Ajoute le suffixe `__c` automatiquement
- Vérifie quels champs existent dans Salesforce
- Crée les champs manquants
- Skip les champs qui existent déjà
- Retourne un résumé détaillé pour l'utilisateur

---

#### Étape 2 : Transférer le Lead

Après la préparation réussie, transférez le lead normalement :

**Endpoint :**
```
POST http://localhost:3000/api/salesforce/leads
```

**Headers :**
```
Content-Type: application/json
Cookie: connect.sid=<session_id>
```

**Body (JSON) :**
```json
{
  "leadData": {
    "FirstName": "Gilbert",
    "LastName": "Schwaab",
    "Company": "convey INFORMATION SYSTEMS GmbH",
    "Email": "schwaab@convey.de",
    "Phone": "+49 (0)89 54 344",
    "Question01__c": "Products",
    "Question02__c": "Prospects",
    "Question06__c": "Question 06 value"
  },
  "attachments": []
}
```

**Réponse Attendue (Succès) :**
```json
{
  "success": true,
  "salesforceId": "00Q5i000001XXXXUAX",
  "message": "Lead successfully transferred to Salesforce",
  "validationWarnings": [],
  "attachments": []
}
```

---

## 📤 Test 3 : Transférer un Lead via le Backend Node.js (Méthode Classique)

### Endpoint
```
POST http://localhost:3000/api/salesforce/leads
```

### Headers
```
Content-Type: application/json
Cookie: connect.sid=<votre_session_id>
```

### Body (JSON) - Lead Simple
```json
{
  "leadData": {
    "FirstName": "Jean",
    "LastName": "Dupont",
    "Company": "Test Company SARL",
    "Email": "jean.dupont@testcompany.fr",
    "Phone": "+33 1 23 45 67 89",
    "Title": "Directeur Général",
    "Question01__c": "Field of activity",
    "Answers01__c": "IT Services",
    "Text01__c": "Additional information about IT services",
    "Question02__c": "Interest / offer for",
    "Answers02__c": "Software Development",
    "Text02__c": "Looking for custom software solutions"
  },
  "attachments": []
}
```

### Réponse Attendue (Succès)
```json
{
  "success": true,
  "salesforceId": "00Q5i000001XXXXUAX",
  "message": "Lead successfully transferred to Salesforce",
  "leadData": {
    "FirstName": "Jean",
    "LastName": "Dupont",
    "Company": "Test Company SARL",
    "Email": "jean.dupont@testcompany.fr",
    "Phone": "+33 1 23 45 67 89",
    "Title": "Directeur Général",
    "Question01__c": "Field of activity",
    "Answers01__c": "IT Services",
    "Text01__c": "Additional information about IT services",
    "Question02__c": "Interest / offer for",
    "Answers02__c": "Software Development",
    "Text02__c": "Looking for custom software solutions"
  },
  "validationWarnings": [
    "Added https:// to website: www.testcompany.fr"
  ],
  "attachments": []
}
```

### Réponse Attendue (Doublon Détecté)
```json
{
  "message": "Duplicate lead found",
  "salesforceId": "00Q5i000001XXXXUAX",
  "existingLead": {
    "name": "Jean Dupont",
    "company": "Test Company SARL",
    "email": "jean.dupont@testcompany.fr"
  }
}
```

Status Code: `409 Conflict`

---

## 📎 Test 4 : Transférer un Lead avec Attachments

### Body (JSON) - Lead avec Attachments
```json
{
  "leadData": {
    "FirstName": "Marie",
    "LastName": "Martin",
    "Company": "Innovation Corp",
    "Email": "marie.martin@innovation.fr",
    "Phone": "+33 6 12 34 56 78",
    "Question01__c": "Product Interest",
    "Answers01__c": "Cloud Solutions",
    "Text01__c": "Interested in cloud migration"
  },
  "attachments": [
    {
      "Name": "test-document.pdf",
      "Body": "JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCA1OTUgODQyXS9Db250ZW50cyA0IDAgUj4+CmVuZG9iago0IDAgb2JqCjw8L0xlbmd0aCA0NT4+CnN0cmVhbQpCVAovRjEgMjQgVGYKMTAwIDcwMCBUZAooSGVsbG8gV29ybGQhKSBUagpFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA1CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDIwNyAwMDAwMCBuIAp0cmFpbGVyCjw8L1NpemUgNS9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjMwMQolJUVPRgo="
    }
  ]
}
```

**Note**: Le champ `Body` contient le fichier encodé en Base64.

### Réponse Attendue
```json
{
  "success": true,
  "salesforceId": "00Q5i000002YYYYUAY",
  "message": "Lead successfully transferred to Salesforce",
  "leadData": {
    "FirstName": "Marie",
    "LastName": "Martin",
    "Company": "Innovation Corp",
    "Email": "marie.martin@innovation.fr",
    "Phone": "+33 6 12 34 56 78",
    "Question01__c": "Product Interest",
    "Answers01__c": "Cloud Solutions",
    "Text01__c": "Interested in cloud migration"
  },
  "validationWarnings": [],
  "attachments": [
    {
      "filename": "test-document.pdf",
      "success": true,
      "id": "068XX00000XXXXXCAZ"
    }
  ],
  "attachmentSummary": "1/1 attachments transferred"
}
```

---

## 🔍 Vérification dans Salesforce

Après le transfert, vérifiez dans Salesforce :

### 1. Vérifier le Lead
```
Setup → Object Manager → Lead → Fields & Relationships
```
Vous devriez voir les nouveaux champs :
- `Question01__c`
- `Answers01__c`
- `Text01__c`
- etc.

### 2. Voir le Lead Créé
```
App Launcher → Leads
```
Recherchez le lead par nom (ex: "Jean Dupont") et vérifiez que :
- Tous les champs standard sont remplis
- Les champs custom contiennent les bonnes valeurs
- Les attachments sont présents dans la section "Files"

---

## ❌ Gestion des Erreurs

### Erreur 401 : Non Authentifié
```json
{
  "message": "Not connected to Salesforce"
}
```
**Solution**: Connectez-vous d'abord via l'interface web.

### Erreur 400 : Données Invalides
```json
{
  "message": "fields array is required"
}
```
**Solution**: Vérifiez que le body contient bien un tableau `fields`.

### Erreur 409 : Lead Dupliqué
```json
{
  "message": "Duplicate lead found",
  "salesforceId": "00Q5i000001XXXXUAX",
  "existingLead": { ... }
}
```
**Solution**: Le lead existe déjà. Modifiez le LastName ou Company pour créer un nouveau lead.

### Erreur 500 : Erreur Serveur
```json
{
  "message": "Failed to create custom fields",
  "error": "..."
}
```
**Solution**: Vérifiez les logs du backend pour plus de détails.

---

## 📝 Notes Importantes

1. **Suffixe `__c` Obligatoire**
   - Tous les champs custom DOIVENT se terminer par `__c`
   - Exemple: `Question01__c`, `Answers01__c`

2. **Limitations Salesforce**
   - Les noms de champs ne peuvent pas contenir d'espaces
   - Longueur maximale : 255 caractères pour les champs Text
   - Les champs sont créés avec le type `Text(255)` par défaut

3. **Temps de Propagation**
   - Après création d'un champ, attendez 1-2 secondes avant de l'utiliser
   - Le backend attend automatiquement 2 secondes après création

4. **Cookies de Session**
   - Les cookies `connect.sid` sont gérés automatiquement par le backend
   - Ils expirent après 24 heures

---

## 🚀 Exemple de Workflow Complet

### Étape 1 : Créer les champs
```bash
POST http://localhost:3000/api/salesforce/create-fields
Body: {
  "fields": [
    {"apiName": "Question01__c", "label": "Question 01"},
    {"apiName": "Answers01__c", "label": "Answers 01"},
    {"apiName": "Text01__c", "label": "Text 01"}
  ]
}
```

### Étape 2 : Attendre 2 secondes
```bash
# Le backend attend automatiquement
```

### Étape 3 : Transférer le lead
```bash
POST http://localhost:3000/api/salesforce/leads
Body: {
  "leadData": {
    "FirstName": "Test",
    "LastName": "User",
    "Company": "Test Corp",
    "Question01__c": "Field of activity",
    "Answers01__c": "IT Services",
    "Text01__c": "Some details"
  },
  "attachments": []
}
```

### Étape 4 : Vérifier dans Salesforce
- Allez dans Salesforce
- Ouvrez le lead créé
- Vérifiez que tous les champs contiennent les bonnes valeurs

---

**🎉 Succès !** Vous avez maintenant créé des champs custom et transféré un lead avec ces champs dans Salesforce.
