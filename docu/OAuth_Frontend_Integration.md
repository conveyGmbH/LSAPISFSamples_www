# OAuth Web Server Flow - Frontend Integration Guide

## 📋 Vue d'ensemble

Ce guide explique comment intégrer le OAuth Web Server Flow dans le frontend de l'application LeadSuccess pour supporter l'authentification multi-org Salesforce.

---

## 🔐 Endpoints Backend Disponibles

### 1. **Générer l'URL d'Autorisation**

**Endpoint:** `POST /api/salesforce/auth`

**Description:** Génère l'URL d'autorisation Salesforce pour démarrer le flow OAuth.

**Headers:**
```javascript
{
  'Content-Type': 'application/json'
}
```

**Body:**
```javascript
{
  "clientId": "3MVG9rZjd7MXFdLjcmv2WrBcFvYgqfMxJzyW7...",
  "clientSecret": "D638DD0A7C0DD06A57DAE136320DD523...",
  "loginUrl": "https://login.salesforce.com",  // ou "https://test.salesforce.com" pour sandbox
  "orgId": "optional-custom-org-id"  // Optionnel, défaut: "default"
}
```

**Response (200 OK):**
```javascript
{
  "authUrl": "https://login.salesforce.com/services/oauth2/authorize?...",
  "orgId": "default"
}
```

**Exemple Frontend:**
```javascript
async function initiateOAuthFlow(orgId = 'default') {
  const response = await fetch('http://localhost:3000/api/salesforce/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      clientId: 'YOUR_CLIENT_ID',
      clientSecret: 'YOUR_CLIENT_SECRET',
      loginUrl: 'https://login.salesforce.com',
      orgId: orgId
    })
  });

  const { authUrl, orgId: returnedOrgId } = await response.json();

  // Stocker l'orgId pour l'utiliser après le callback
  localStorage.setItem('pendingOrgId', returnedOrgId);

  // Ouvrir la popup OAuth
  const popup = window.open(authUrl, 'Salesforce OAuth', 'width=600,height=700');
}
```

---

### 2. **Callback OAuth**

**Endpoint:** `GET /oauth/callback`

**Description:** Endpoint appelé automatiquement par Salesforce après autorisation. Échange le code d'autorisation contre des tokens.

**Query Parameters:**
- `code` - Code d'autorisation (fourni par Salesforce)
- `state` - State parameter (format: `randomString:orgId`)

**Comportement:**
1. Valide le state parameter
2. Extrait l'orgId du state
3. Échange le code contre access token et refresh token
4. Stocke la connexion en session et dans le service multi-org
5. Affiche une page de succès et ferme la popup

**Page de succès:** Envoie un message au parent window :
```javascript
window.opener.postMessage({
  type: 'salesforce-oauth-success',
  orgId: 'default'
}, '*');
```

**Exemple Frontend - Écouter le callback:**
```javascript
// Dans la page qui a ouvert la popup
window.addEventListener('message', async (event) => {
  if (event.data.type === 'salesforce-oauth-success') {
    const orgId = event.data.orgId;

    console.log('✅ OAuth successful for org:', orgId);

    // Stocker l'orgId dans le localStorage
    localStorage.setItem('currentOrgId', orgId);

    // Vérifier la connexion
    await checkConnection(orgId);

    // Mettre à jour l'UI
    updateUIConnected(orgId);
  }
});
```

---

### 3. **Vérifier la Connexion**

**Endpoint:** `GET /api/salesforce/check`

**Description:** Vérifie si une connexion Salesforce valide existe pour un orgId donné.

**Headers:**
```javascript
{
  'X-Org-Id': 'default'  // ou votre orgId custom
}
```

**Response (200 OK):**
```javascript
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

**Response (401 Unauthorized):**
```javascript
{
  "connected": false,
  "message": "No valid Salesforce connection for org: default"
}
```

**Exemple Frontend:**
```javascript
async function checkConnection(orgId = 'default') {
  try {
    const response = await fetch('http://localhost:3000/api/salesforce/check', {
      headers: {
        'X-Org-Id': orgId
      },
      credentials: 'include'
    });

    if (response.ok) {
      const data = await response.json();

      if (data.connected) {
        console.log('✅ Connected to Salesforce:', data.userInfo.display_name);
        return data;
      }
    }

    console.log('❌ Not connected to Salesforce');
    return null;

  } catch (error) {
    console.error('Connection check failed:', error);
    return null;
  }
}
```

---

### 4. **Refresh Token**

**Endpoint:** `POST /api/salesforce/refresh`

**Description:** Rafraîchit l'access token en utilisant le refresh token stocké.

**Headers:**
```javascript
{
  'Content-Type': 'application/json',
  'X-Org-Id': 'default'
}
```

**Body (optionnel):**
```javascript
{
  "orgId": "default"  // Alternative à X-Org-Id header
}
```

**Response (200 OK):**
```javascript
{
  "success": true,
  "message": "Token refreshed successfully",
  "tokens": {
    "access_token": "00DgK000000OMLx!AQEAQ...",
    "instance_url": "https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com"
  }
}
```

**Response (401 Unauthorized):**
```javascript
{
  "success": false,
  "message": "No refresh token available. Please re-authenticate.",
  "error": "..."
}
```

**Exemple Frontend:**
```javascript
async function refreshToken(orgId = 'default') {
  try {
    const response = await fetch('http://localhost:3000/api/salesforce/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Org-Id': orgId
      },
      credentials: 'include'
    });

    const data = await response.json();

    if (data.success) {
      console.log('✅ Token refreshed successfully');
      return data.tokens;
    } else {
      console.log('❌ Token refresh failed, need to re-authenticate');
      // Rediriger vers le login
      await initiateOAuthFlow(orgId);
      return null;
    }

  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}
```

---

## 🚀 Flow Complet Frontend

### Architecture Recommandée

```javascript
// oauth-service.js
class SalesforceOAuthService {
  constructor() {
    this.currentOrgId = localStorage.getItem('currentOrgId') || 'default';
  }

  /**
   * Démarre le flow OAuth
   */
  async connect(clientId, clientSecret, loginUrl = 'https://login.salesforce.com', orgId = 'default') {
    try {
      const response = await fetch('/api/salesforce/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clientId, clientSecret, loginUrl, orgId })
      });

      const { authUrl, orgId: returnedOrgId } = await response.json();

      // Stocker l'orgId en attente
      localStorage.setItem('pendingOrgId', returnedOrgId);

      // Ouvrir la popup OAuth
      const popup = window.open(authUrl, 'Salesforce OAuth', 'width=600,height=700,scrollbars=yes');

      // Attendre le callback
      return new Promise((resolve, reject) => {
        const messageHandler = (event) => {
          if (event.data.type === 'salesforce-oauth-success') {
            window.removeEventListener('message', messageHandler);

            this.currentOrgId = event.data.orgId;
            localStorage.setItem('currentOrgId', event.data.orgId);
            localStorage.removeItem('pendingOrgId');

            resolve({
              success: true,
              orgId: event.data.orgId
            });
          }
        };

        window.addEventListener('message', messageHandler);

        // Timeout après 5 minutes
        setTimeout(() => {
          window.removeEventListener('message', messageHandler);
          reject(new Error('OAuth timeout'));
        }, 5 * 60 * 1000);
      });

    } catch (error) {
      console.error('OAuth connection failed:', error);
      throw error;
    }
  }

  /**
   * Vérifie si connecté
   */
  async checkConnection(orgId = this.currentOrgId) {
    try {
      const response = await fetch('/api/salesforce/check', {
        headers: { 'X-Org-Id': orgId },
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        return data.connected ? data : null;
      }

      return null;

    } catch (error) {
      console.error('Connection check failed:', error);
      return null;
    }
  }

  /**
   * Rafraîchit le token
   */
  async refreshToken(orgId = this.currentOrgId) {
    try {
      const response = await fetch('/api/salesforce/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Org-Id': orgId
        },
        credentials: 'include'
      });

      const data = await response.json();
      return data.success ? data.tokens : null;

    } catch (error) {
      console.error('Token refresh failed:', error);
      return null;
    }
  }

  /**
   * Gère automatiquement l'expiration des tokens
   */
  async executeWithTokenRefresh(apiCall, orgId = this.currentOrgId) {
    try {
      // Tenter l'appel API
      return await apiCall();

    } catch (error) {
      // Si erreur 401, tenter de rafraîchir le token
      if (error.status === 401 || error.message.includes('INVALID_SESSION_ID')) {
        console.log('🔄 Token expired, refreshing...');

        const tokens = await this.refreshToken(orgId);

        if (tokens) {
          // Réessayer l'appel API
          console.log('✅ Token refreshed, retrying API call');
          return await apiCall();
        } else {
          // Refresh échoué, demander re-authentification
          throw new Error('Authentication required');
        }
      }

      throw error;
    }
  }

  /**
   * Déconnecte l'org actuelle
   */
  disconnect() {
    localStorage.removeItem('currentOrgId');
    this.currentOrgId = 'default';
  }
}

// Export singleton
export const sfOAuth = new SalesforceOAuthService();
```

---

## 🎨 Exemple d'Intégration UI

### Bouton "Connect to Salesforce"

```javascript
// displayLeadTransferController.js
import { sfOAuth } from './oauth-service.js';

// Configuration Salesforce (à stocker dans un fichier config)
const SF_CONFIG = {
  clientId: '3MVG9rZjd7MXFdLjcmv2WrBcFvYgqfMxJzyW7...',
  clientSecret: 'D638DD0A7C0DD06A57DAE136320DD523...',
  loginUrl: 'https://login.salesforce.com'
};

// Au chargement de la page
document.addEventListener('DOMContentLoaded', async () => {
  await checkInitialConnection();
});

async function checkInitialConnection() {
  const connectionData = await sfOAuth.checkConnection();

  if (connectionData) {
    // Connecté
    updateUIConnected(connectionData.userInfo);
  } else {
    // Non connecté
    updateUIDisconnected();
  }
}

function updateUIConnected(userInfo) {
  const connectBtn = document.getElementById('connectSalesforceBtn');
  connectBtn.textContent = `✅ Connected as ${userInfo.display_name}`;
  connectBtn.classList.add('connected');
  connectBtn.onclick = handleDisconnect;

  // Afficher les org info
  document.getElementById('orgInfo').innerHTML = `
    <div class="org-info">
      <strong>Organization:</strong> ${userInfo.organization_name}<br>
      <strong>User:</strong> ${userInfo.display_name} (${userInfo.username})
    </div>
  `;

  // Activer les boutons de transfert
  document.getElementById('transferLeadBtn').disabled = false;
}

function updateUIDisconnected() {
  const connectBtn = document.getElementById('connectSalesforceBtn');
  connectBtn.textContent = '🔗 Connect to Salesforce';
  connectBtn.classList.remove('connected');
  connectBtn.onclick = handleConnect;

  // Cacher les org info
  document.getElementById('orgInfo').innerHTML = '';

  // Désactiver les boutons de transfert
  document.getElementById('transferLeadBtn').disabled = true;
}

async function handleConnect() {
  try {
    showLoading('Connecting to Salesforce...');

    const result = await sfOAuth.connect(
      SF_CONFIG.clientId,
      SF_CONFIG.clientSecret,
      SF_CONFIG.loginUrl
    );

    if (result.success) {
      const connectionData = await sfOAuth.checkConnection();
      updateUIConnected(connectionData.userInfo);
      showSuccess('Connected to Salesforce successfully!');
    }

  } catch (error) {
    showError('Failed to connect to Salesforce: ' + error.message);
  } finally {
    hideLoading();
  }
}

function handleDisconnect() {
  if (confirm('Disconnect from Salesforce?')) {
    sfOAuth.disconnect();
    updateUIDisconnected();
    showSuccess('Disconnected from Salesforce');
  }
}
```

---

### Transfer Lead avec Auto-Refresh Token

```javascript
async function transferLeadToSalesforce(leadData, attachments) {
  try {
    showLoading('Transferring lead to Salesforce...');

    // Utiliser executeWithTokenRefresh pour gérer automatiquement l'expiration
    await sfOAuth.executeWithTokenRefresh(async () => {
      const response = await fetch('/api/salesforce/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Org-Id': sfOAuth.currentOrgId
        },
        credentials: 'include',
        body: JSON.stringify({ leadData, attachments })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Transfer failed');
      }

      const result = await response.json();
      return result;
    });

    showSuccess(`Lead transferred successfully! SF ID: ${result.salesforceId}`);

  } catch (error) {
    if (error.message === 'Authentication required') {
      showError('Session expired. Please reconnect to Salesforce.');
      updateUIDisconnected();
    } else {
      showError('Failed to transfer lead: ' + error.message);
    }
  } finally {
    hideLoading();
  }
}
```

---

## 🔄 Support Multi-Org

### Switcher entre Organizations

```javascript
// Gestion de plusieurs orgs
class MultiOrgManager {
  constructor() {
    this.orgs = JSON.parse(localStorage.getItem('salesforceOrgs') || '[]');
    this.currentOrg = localStorage.getItem('currentOrgId') || null;
  }

  // Ajouter une nouvelle org
  async addOrg(name, clientId, clientSecret, loginUrl) {
    const orgId = `org_${Date.now()}`;

    const result = await sfOAuth.connect(clientId, clientSecret, loginUrl, orgId);

    if (result.success) {
      this.orgs.push({
        id: orgId,
        name: name,
        clientId: clientId,
        clientSecret: clientSecret,
        loginUrl: loginUrl,
        addedAt: new Date().toISOString()
      });

      this.saveOrgs();
      return orgId;
    }

    return null;
  }

  // Changer d'org active
  async switchOrg(orgId) {
    const connectionData = await sfOAuth.checkConnection(orgId);

    if (connectionData) {
      this.currentOrg = orgId;
      localStorage.setItem('currentOrgId', orgId);
      sfOAuth.currentOrgId = orgId;
      return true;
    }

    return false;
  }

  // Supprimer une org
  removeOrg(orgId) {
    this.orgs = this.orgs.filter(org => org.id !== orgId);
    this.saveOrgs();

    if (this.currentOrg === orgId) {
      this.currentOrg = this.orgs.length > 0 ? this.orgs[0].id : null;
      localStorage.setItem('currentOrgId', this.currentOrg);
    }
  }

  saveOrgs() {
    localStorage.setItem('salesforceOrgs', JSON.stringify(this.orgs));
  }
}

export const multiOrgManager = new MultiOrgManager();
```

### UI pour Switcher les Orgs

```html
<!-- displayLeadTransfer.html -->
<div class="org-selector">
  <select id="orgSelector" onchange="handleOrgSwitch()">
    <option value="">Select Organization...</option>
    <!-- Populated dynamically -->
  </select>
  <button onclick="showAddOrgModal()">+ Add Organization</button>
</div>
```

```javascript
async function handleOrgSwitch() {
  const select = document.getElementById('orgSelector');
  const orgId = select.value;

  if (orgId) {
    const success = await multiOrgManager.switchOrg(orgId);

    if (success) {
      const connectionData = await sfOAuth.checkConnection(orgId);
      updateUIConnected(connectionData.userInfo);
      showSuccess('Switched to ' + connectionData.userInfo.organization_name);
    } else {
      showError('Failed to switch organization. Please reconnect.');
    }
  }
}
```

---

## 📝 Résumé des Endpoints

| Endpoint | Method | Description | Headers |
|----------|--------|-------------|---------|
| `/api/salesforce/auth` | POST | Génère l'URL OAuth | `Content-Type: application/json` |
| `/oauth/callback` | GET | Callback OAuth (automatique) | - |
| `/api/salesforce/check` | GET | Vérifie la connexion | `X-Org-Id` |
| `/api/salesforce/refresh` | POST | Rafraîchit le token | `X-Org-Id`, `Content-Type: application/json` |

---

## ✅ Checklist d'Intégration

- [ ] Importer le service OAuth (`oauth-service.js`)
- [ ] Configurer les credentials Salesforce (Client ID, Secret)
- [ ] Ajouter le bouton "Connect to Salesforce"
- [ ] Implémenter le listener de message pour le callback
- [ ] Vérifier la connexion au chargement de la page
- [ ] Utiliser `executeWithTokenRefresh` pour tous les appels API
- [ ] Gérer la déconnexion
- [ ] (Optionnel) Implémenter le support multi-org

---

## 🔐 Sécurité

### ✅ Bonnes Pratiques

1. **Ne jamais exposer les credentials côté client**
   - Stocker Client ID et Secret dans des variables d'environnement backend
   - Ou demander à l'utilisateur de les saisir (pour multi-tenant)

2. **Utiliser HTTPS en production**
   - Tous les cookies doivent être `secure: true`
   - `sameSite: 'none'` pour cross-origin

3. **Valider le state parameter**
   - Le backend valide automatiquement le state
   - Protection contre CSRF

4. **Stocker les tokens côté serveur**
   - Jamais dans localStorage/sessionStorage
   - Utiliser httpOnly cookies

5. **Refresh automatique des tokens**
   - Utiliser `executeWithTokenRefresh` pour tous les appels
   - Éviter les erreurs 401

---

## 📚 Ressources

- [OAuth Web Server Flow Documentation](./OAuth_Web_Server_Flow_Documentation.md)
- [Salesforce REST API Guide](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/)
- [LeadSuccess System Documentation](./LeadSuccess_SF_System_Documentation.md)

---

**Version:** 1.0
**Dernière mise à jour:** 2025-10-07
**Auteur:** Development Team
