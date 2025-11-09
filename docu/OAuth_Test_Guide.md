# Guide de Test OAuth - Backend Local

## 🚀 Prérequis

1. **Backend démarré :**
   ```bash
   cd salesforce-backend
   node server.js
   ```

2. **Vérifier le démarrage :**
   ```
   🌍 Environment: DEVELOPMENT
   🔗 OAuth Redirect URI: http://localhost:3000/oauth/callback
   🚀 Server running on port: 3000
   ```

3. **Postman installé et configuré**

---

## 📋 Tests à Effectuer

### ✅ Test 1 : Générer URL OAuth (Format Legacy - Sans OrgId)

**Description :** Test du format legacy pour backward compatibility

**Endpoint :**
```
POST http://localhost:3000/api/salesforce/auth
```

**Headers :**
```
Content-Type: application/json
```

**Body :**
```json
{
  "clientId": "3MVG9rZjd7MXFdLjcmv2WrBcFvYgqfMxdzyy7osW1KAWitHjC4Oh_C31c_DOCfKp0d1knPO6rvApDr8Y5qfgl",
  "clientSecret": "D638DD0A7C0DD06A57DAE136320DD52317D99F54FF9D8886725F7ADC420F356AD",
  "loginUrl": "https://login.salesforce.com"
}
```

**Response Attendue :**
```json
{
  "authUrl": "https://login.salesforce.com/services/oauth2/authorize?scope=api%20refresh_token&state=abc123defg...:default&...",
  "orgId": "default"
}
```

**Logs Console Attendus :**
```
========================================
📨 POST /api/salesforce/auth - Request received
========================================
📋 Request body: {
  clientId: '3MVG9rZjd7MXFdLjcmv2...',
  clientSecret: '***HIDDEN***',
  loginUrl: 'https://login.salesforce.com',
  orgId: 'not provided (will use "default")'
}
🔐 Generated state parameter:
   - Random part: 1a2b3c4d5e6f7g8h...
   - OrgId: default
   - Full state: 1a2b3c4d5e6f7g8h...:default
✅ Auth URL generated successfully
🔗 Redirect URI: http://localhost:3000/oauth/callback
🌐 Login URL: https://login.salesforce.com
🎯 State format: Multi-org (state:orgId)
========================================
```

**✅ Test Réussi Si :**
- [ ] Status 200 OK
- [ ] `authUrl` contient `state=...%3Adefault` (URL-encoded `:default`)
- [ ] `orgId` = `"default"`
- [ ] Logs affichent "State format: Multi-org (state:orgId)"

---

### ✅ Test 2 : Générer URL OAuth (Format Multi-Org - Avec OrgId Custom)

**Description :** Test du format multi-org avec orgId personnalisé

**Endpoint :**
```
POST http://localhost:3000/api/salesforce/auth
```

**Body :**
```json
{
  "clientId": "3MVG9rZjd7MXFdLjcmv2WrBcFvYgqfMxdzyy7osW1KAWitHjC4Oh_C31c_DOCfKp0d1knPO6rvApDr8Y5qfgl",
  "clientSecret": "D638DD0A7C0DD06A57DAE136320DD52317D99F54FF9D8886725F7ADC420F356AD",
  "loginUrl": "https://login.salesforce.com",
  "orgId": "test_client_123"
}
```

**Response Attendue :**
```json
{
  "authUrl": "https://login.salesforce.com/services/oauth2/authorize?scope=api%20refresh_token&state=xyz789...:test_client_123&...",
  "orgId": "test_client_123"
}
```

**Logs Console Attendus :**
```
========================================
📨 POST /api/salesforce/auth - Request received
========================================
📋 Request body: {
  clientId: '3MVG9rZjd7MXFdLjcmv2...',
  clientSecret: '***HIDDEN***',
  loginUrl: 'https://login.salesforce.com',
  orgId: 'test_client_123'
}
🔐 Generated state parameter:
   - Random part: xyz789abc...
   - OrgId: test_client_123
   - Full state: xyz789abc...:test_client_123
✅ Auth URL generated successfully
========================================
```

**✅ Test Réussi Si :**
- [ ] Status 200 OK
- [ ] `authUrl` contient `state=...%3Atest_client_123` (URL-encoded `:test_client_123`)
- [ ] `orgId` = `"test_client_123"`
- [ ] Logs affichent "OrgId: test_client_123"

---

### ✅ Test 3 : Callback OAuth (Navigation Manuelle)

**Description :** Test du callback complet avec connexion Salesforce

**Étapes :**

1. **Copier l'authUrl du Test 1 ou Test 2**

2. **Ouvrir dans un navigateur :**
   - Chrome, Firefox, ou Edge
   - Coller l'URL complète

3. **Se connecter à Salesforce :**
   - Entrer username/password
   - Cliquer "Allow" / "Autoriser"

4. **Observer la redirection :**
   - URL change vers `http://localhost:3000/oauth/callback?code=...&state=...`
   - Page affiche "Authentication Successful"

**Logs Console Attendus :**
```
========================================
🔙 GET /oauth/callback - Callback received
========================================
📋 Query parameters:
   - code: aPrx.ppuB8UlvcFbz9...
   - state: abc123...:default
   - error: none
🔍 State parameter analysis:
   - Format detected: Multi-org (state:orgId)
   - Extracted orgId: default
   - State value: abc123...
🔐 Using credentials from .env:
   - Client ID: 3MVG9rZjd7MXFdLjcmv2...
   - Client Secret: ***CONFIGURED***
   - Login URL: https://login.salesforce.com
🔄 Exchanging authorization code for tokens...
✅ OAuth successful!
👤 User info:
   - User ID: 005gK000000TSnJQAW
   - Organization ID: 00DgK000000OMLxUAO
   - Instance URL: https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com
💾 Storing connection data...
✅ Connection stored in session
   - Access Token: 00DgK000000OMLx!AQEA...
   - Refresh Token: 5Aep8612EC5NxGKVYoh...
✅ Multi-org connection stored for org: 00DgK000000OMLxUAO
🎉 OAuth flow completed successfully!
   - OrgId used: default
   - Organization: Convey
   - User: Maxim Kemajou
========================================
```

**✅ Test Réussi Si :**
- [ ] Page affiche "✅ Authentication Successful"
- [ ] Logs affichent "OAuth successful!"
- [ ] Logs affichent "Multi-org connection stored"
- [ ] Tokens (access + refresh) sont affichés (tronqués)
- [ ] OrgId extrait correctement (`default` ou `test_client_123`)

---

### ✅ Test 4 : Vérifier la Connexion (Format Legacy)

**Description :** Vérifier qu'une connexion OAuth valide existe

**Endpoint :**
```
GET http://localhost:3000/api/salesforce/check
```

**Headers :**
```
X-Org-Id: default
```

**Response Attendue :**
```json
{
  "connected": true,
  "userInfo": {
    "username": "maxim@convey.de",
    "display_name": "Maxim Kemajou",
    "organization_name": "Convey",
    "organization_id": "00DgK000000OMLxUAO",
    "user_id": "005gK000000TSnJQAW"
  },
  "tokens": {
    "access_token": "00DgK000000OMLx!AQEAQ...",
    "instance_url": "https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com"
  }
}
```

**Logs Console Attendus :**
```
========================================
🔍 GET /api/salesforce/check - Checking connection
========================================
📋 Request info:
   - OrgId from header: default
🔎 Looking for connection in salesforceService...
✅ Connection found!
🔄 Verifying connection with identity call...
✅ Identity verified successfully
👤 User info:
   - Username: maxim@convey.de
   - Display name: Maxim Kemajou
   - Organization: Convey
   - Org ID: 00DgK000000OMLxUAO
========================================
```

**✅ Test Réussi Si :**
- [ ] Status 200 OK
- [ ] `connected: true`
- [ ] userInfo contient toutes les données
- [ ] tokens.access_token existe
- [ ] Logs affichent "Identity verified successfully"

---

### ✅ Test 5 : Vérifier la Connexion (Multi-Org)

**Description :** Vérifier une connexion avec orgId custom

**Endpoint :**
```
GET http://localhost:3000/api/salesforce/check
```

**Headers :**
```
X-Org-Id: test_client_123
```

**Response Attendue (si connexion existe) :**
```json
{
  "connected": true,
  "userInfo": { ... }
}
```

**Response Attendue (si connexion n'existe pas) :**
```json
{
  "connected": false,
  "message": "No valid Salesforce connection for org: test_client_123"
}
```

**Logs Console Attendus (pas de connexion) :**
```
========================================
🔍 GET /api/salesforce/check - Checking connection
========================================
📋 Request info:
   - OrgId from header: test_client_123
🔎 Looking for connection in salesforceService...
❌ Connection not found or invalid: No connection found for org: test_client_123
========================================
```

**✅ Test Réussi Si :**
- [ ] Status 401 si pas de connexion
- [ ] Status 200 si connexion existe
- [ ] Logs indiquent clairement si connexion trouvée ou non

---

### ✅ Test 6 : Refresh Token

**Description :** Rafraîchir l'access token avec le refresh token

**Prérequis :** Une connexion doit exister (Test 3 complété)

**Endpoint :**
```
POST http://localhost:3000/api/salesforce/refresh
```

**Headers :**
```
Content-Type: application/json
X-Org-Id: default
```

**Response Attendue :**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "tokens": {
    "access_token": "00DgK000000OMLx!AQEAQ...",
    "instance_url": "https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com"
  }
}
```

**Logs Console Attendus :**
```
========================================
🔄 POST /api/salesforce/refresh - Refreshing token
========================================
📋 Request info:
   - OrgId from header: default
   - OrgId from body: not provided
   - Using orgId: default
🔎 Looking for existing connection...
✅ Connection found with refresh token
   - Refresh token: 5Aep8612EC5NxGKVYoh...
🔄 Calling Salesforce to refresh token...
✅ Token refreshed successfully!
   - New access token: 00DgK000000OMLx!AQEAQ...
   - Instance URL: https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com
========================================
```

**✅ Test Réussi Si :**
- [ ] Status 200 OK
- [ ] `success: true`
- [ ] `tokens.access_token` a changé (nouveau token)
- [ ] Logs affichent "Token refreshed successfully!"

---

### ✅ Test 7 : Refresh Token (Sans Connexion)

**Description :** Tester le refresh sans connexion existante

**Endpoint :**
```
POST http://localhost:3000/api/salesforce/refresh
```

**Headers :**
```
Content-Type: application/json
X-Org-Id: non_existent_org
```

**Response Attendue :**
```json
{
  "success": false,
  "message": "No refresh token available. Please re-authenticate."
}
```

**Logs Console Attendus :**
```
========================================
🔄 POST /api/salesforce/refresh - Refreshing token
========================================
📋 Request info:
   - OrgId from header: non_existent_org
   - OrgId from body: not provided
   - Using orgId: non_existent_org
🔎 Looking for existing connection...
❌ No refresh token found for org: non_existent_org
========================================
```

**✅ Test Réussi Si :**
- [ ] Status 401 Unauthorized
- [ ] `success: false`
- [ ] Message indique "Please re-authenticate"
- [ ] Logs affichent "No refresh token found"

---

## 📊 Résumé des Tests

| # | Test | Endpoint | Attendu | Statut |
|---|------|----------|---------|--------|
| 1 | Auth URL (Legacy) | POST /api/salesforce/auth | orgId = "default" | ⬜ |
| 2 | Auth URL (Multi-Org) | POST /api/salesforce/auth | orgId = custom | ⬜ |
| 3 | Callback OAuth | GET /oauth/callback | Tokens stockés | ⬜ |
| 4 | Check Connection (Legacy) | GET /api/salesforce/check | connected: true | ⬜ |
| 5 | Check Connection (Multi-Org) | GET /api/salesforce/check | Varie selon connexion | ⬜ |
| 6 | Refresh Token (Valide) | POST /api/salesforce/refresh | success: true | ⬜ |
| 7 | Refresh Token (Invalide) | POST /api/salesforce/refresh | success: false | ⬜ |

---

## 🐛 Troubleshooting

### Problème : "Client credentials not found"

**Cause :** Variables d'environnement manquantes dans `.env`

**Solution :**
1. Vérifier `.env` dans `salesforce-backend/`
2. Doit contenir :
   ```
   SF_CLIENT_ID=3MVG9rZjd7MXFdLjcmv2WrBcFvYgqfMxdzyy7osW1KAWitHjC4Oh_C31c_DOCfKp0d1knPO6rvApDr8Y5qfgl
   SF_CLIENT_SECRET=D638DD0A7C0DD06A57DAE136320DD52317D99F54FF9D8886725F7ADC420F356AD
   SF_LOGIN_URL=https://login.salesforce.com
   ```
3. Redémarrer le serveur

---

### Problème : "redirect_uri_mismatch"

**Cause :** Callback URL pas configuré dans Salesforce Connected App

**Solution :**
1. Dans Salesforce → Setup → App Manager
2. Trouver "LeadSuccess API" → Manage
3. Ajouter dans Callback URL :
   ```
   http://localhost:3000/oauth/callback
   ```
4. Save et attendre 5-10 minutes

---

### Problème : Logs ne s'affichent pas

**Cause :** Serveur pas démarré ou erreur au démarrage

**Solution :**
1. Vérifier le terminal :
   ```bash
   cd salesforce-backend
   node server.js
   ```
2. Vérifier qu'aucune erreur n'apparaît
3. Vérifier que le port 3000 est libre

---

### Problème : "Connection not found" après callback

**Cause :** Session perdue ou connexion pas stockée

**Solution :**
1. Vérifier les logs du callback - doit afficher "Multi-org connection stored"
2. Immédiatement après le callback, faire Test 4 (check connection)
3. Utiliser le même `X-Org-Id` que celui utilisé dans l'auth

---

## ✅ Validation Finale

**Tous les tests sont réussis si :**

1. ✅ Test 1 & 2 : authUrl générée avec state contenant orgId
2. ✅ Test 3 : Callback OK, tokens stockés, logs complets
3. ✅ Test 4 & 5 : Connection check fonctionne avec les deux formats
4. ✅ Test 6 : Refresh token fonctionne
5. ✅ Test 7 : Erreur appropriée si pas de connexion
6. ✅ Tous les logs s'affichent clairement dans la console

---

**Prêt à tester ? Lancez le serveur et commencez par le Test 1 ! 🚀**

```bash
cd salesforce-backend
node server.js
```

Puis ouvrez Postman et suivez les tests dans l'ordre.
