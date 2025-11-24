# Guide de Test - SalesforceLeadLib

## 🧪 Comment Tester le Module

### Méthode 1: Page de Test HTML (Recommandé)

#### Étape 1: Ouvrir la Page de Test

```bash
# Ouvrir dans le navigateur
file:///c:/gitprojects/LSAPISFCRM/test-salesforce-lib.html
```

Ou double-cliquer sur `test-salesforce-lib.html`

#### Étape 2: Initialiser le Module

1. **Cliquer sur "Initialize Module"**
   - Vous devriez voir l'interface complète apparaître
   - Sidebar avec logo LeadSuccess
   - Header avec boutons
   - Stats cards (vides pour l'instant)
   - Section "Lead Information" avec état vide

2. **Vérifier la Console (F12)**
   ```
   ✅ Library instance created
   ✅ Interface built successfully!
   ```

#### Étape 3: Charger un Lead de Test

1. **Cliquer sur "Load Sample Lead"**
   - Les données du lead apparaissent dans le tableau
   - Les stats se mettent à jour (Active/Inactive/Total)
   - Le bouton Transfer se met à jour

2. **Données du Lead de Test:**
   ```javascript
   FirstName: 'John'
   LastName: 'Doe'
   Company: 'Acme Corporation'
   Email: 'john.doe@acme.com'
   Phone: '+1 555-0123'
   Title: 'Marketing Director'
   // ... + 15 autres champs
   ```

#### Étape 4: Tester l'Interface

**Navigation:**
- ✅ Cliquer sur "Dashboard" → Rien (simulé)
- ✅ Cliquer sur "Transfer Lead" → Rien (simulé)
- ✅ Cliquer sur "Back to Lead Selection" → Console log

**Vues:**
- ✅ Cliquer sur "List" → Vue tableau
- ✅ Cliquer sur "Cards" → Vue cartes (grille)

**Filtres:**
- ✅ "All Fields" → Tous les champs
- ✅ "Active Only" → Seulement les champs actifs
- ✅ "Inactive Only" → Seulement les champs inactifs
- ✅ "Custom Fields" → Vue des champs personnalisés

**Stats Cards (cliquables):**
- ✅ Cliquer sur "Active" → Filtre sur les actifs
- ✅ Cliquer sur "Inactive" → Filtre sur les inactifs
- ✅ Cliquer sur "Total" → Affiche tous

**Actions sur les Champs:**
- ✅ Cliquer sur l'icône ✏️ → Ouvre modal d'édition
- ✅ Toggle Active/Inactive → Change l'état du champ
- ✅ Modifier la valeur → Enregistre les changements

**Boutons Principaux:**
- ✅ "Connect to Salesforce" → Tenter la connexion
- ✅ "Transfer Lead" → Tenter le transfert

---

### Méthode 2: Tests Programmatiques (Console)

Ouvrir la console (F12) et exécuter:

#### Test 1: Initialisation

```javascript
// Créer l'instance
const sfLib = new SalesforceLeadLib({
    backendUrl: 'http://localhost:3000',
    serverName: 'lstest.convey.de',
    apiName: 'apisftest'
});

// Générer l'interface
const container = document.getElementById('container');
sfLib.buildCompleteInterface(container);

console.log('✅ Interface initialisée');
```

#### Test 2: Charger un Lead

```javascript
const leadData = {
    FirstName: 'Jane',
    LastName: 'Smith',
    Company: 'Tech Corp',
    Email: 'jane@techcorp.com',
    EventId: '12345'
};

await sfLib.loadLead(container, leadData, '12345');
console.log('✅ Lead chargé');
```

#### Test 3: Transférer un Lead

```javascript
try {
    const result = await sfLib.transferLead(leadData);
    console.log('✅ Transfer réussi:', result);
} catch (error) {
    console.error('❌ Transfer échoué:', error.message);
}
```

#### Test 4: Vérifier le Statut

```javascript
const status = await sfLib.getStatus('LEAD_12345');
console.log('📊 Statut:', status);
```

#### Test 5: Connexion Salesforce

```javascript
try {
    const result = await sfLib.connect({
        username: 'user@salesforce.com',
        password: 'password123',
        orgId: '00D5g000000abcd'
    });
    console.log('✅ Connecté:', result);
} catch (error) {
    console.error('❌ Connexion échouée:', error.message);
}
```

#### Test 6: Déconnexion

```javascript
await sfLib.disconnect();
console.log('✅ Déconnecté');
```

#### Test 7: Nettoyer

```javascript
sfLib.clear(container);
console.log('✅ Nettoyé');
```

---

### Méthode 3: Tests avec Backend Local

#### Prérequis

```bash
# Démarrer le backend Node.js
cd salesforce-backend
node server.js
```

Backend doit être accessible sur: `http://localhost:3000`

#### Test Complet avec Backend

```javascript
// 1. Initialiser
const sfLib = new SalesforceLeadLib({
    backendUrl: 'http://localhost:3000'
});

const container = document.getElementById('container');
sfLib.buildCompleteInterface(container);

// 2. Se connecter à Salesforce
await sfLib.connect({
    username: 'votre-email@salesforce.com',
    password: 'votre-mot-de-passe',
    securityToken: 'votre-token',
    orgId: 'votre-org-id'
});

// 3. Charger un lead réel
const realLead = {
    FirstName: 'Test',
    LastName: 'User',
    Company: 'Test Company',
    Email: 'test@example.com',
    EventId: '12345'
};

await sfLib.loadLead(container, realLead, '12345');

// 4. Transférer
const result = await sfLib.transferLead(realLead);
console.log('✅ Lead transféré, SF ID:', result.salesforceId);

// 5. Vérifier le statut
const status = await sfLib.getStatus(realLead.KontaktViewId);
console.log('📊 Statut:', status);
```

---

## 🔍 Tests Visuels

### Ce que vous devriez voir après chaque étape:

#### Après `buildCompleteInterface()`:

```
✓ Sidebar gauche (largeur 256px)
  - Logo LeadSuccess en haut
  - Navigation (Dashboard, Transfer Lead)
  - API Status card (gris = déconnecté)
  - User Profile (caché tant que non connecté)

✓ Contenu principal
  - Header "Transfer Lead to Salesforce"
  - Boutons: Connect to Salesforce, Transfer Lead (désactivé)
  - 3 Stats cards: Active (0), Inactive (0), Total (0)
  - Field Management Controls (List/Cards toggle, filtres)
  - Lead Information card avec "No lead loaded"

✓ Tous les modals (cachés)
  - Edit Field Modal
  - Edit Label Modal
  - Missing Fields Modal
  - etc.
```

#### Après `loadLead()`:

```
✓ Stats mises à jour
  - Active: ~20 (selon les champs actifs)
  - Inactive: ~5 (selon les champs inactifs)
  - Total: ~25

✓ Tableau des champs visible
  - Colonnes: Field Name, Value, Status, Actions
  - Lignes avec toggle active/inactive
  - Boutons d'édition (✏️)

✓ Bouton Transfer Lead
  - Activé si LastName ET Company présents
  - Désactivé sinon (avec tooltip explicatif)
```

#### Après `connect()` (avec backend):

```
✓ API Status card
  - Point vert (connecté)
  - Texte "Connected"

✓ User Profile visible (sidebar bas)
  - Avatar avec initiales
  - Nom d'utilisateur
  - Email
  - Org ID
  - Bouton Disconnect

✓ Bouton Transfer Lead
  - Activé (si champs requis présents)
  - Prêt pour le transfert
```

---

## 🐛 Dépannage

### Problème 1: "Cannot read property 'buildCompleteInterface' of undefined"

**Cause:** Le module n'est pas chargé

**Solution:**
```html
<!-- Vérifier que le script est inclus -->
<script src="salesforceLeadLib-complete.js"></script>

<!-- Attendre le chargement -->
<script>
window.addEventListener('load', () => {
    // Code ici
});
</script>
```

### Problème 2: Interface ne s'affiche pas

**Cause:** Container invalide ou CSS non injecté

**Solution:**
```javascript
// Vérifier que le container existe
const container = document.getElementById('container');
if (!container) {
    console.error('Container not found!');
    return;
}

// CSS devrait s'injecter automatiquement
// Vérifier dans <head> : <style id="salesforce-lead-lib-css">
```

### Problème 3: "Failed to fetch"

**Cause:** Backend non accessible

**Solution:**
```javascript
// Option 1: Démarrer le backend
cd salesforce-backend
node server.js

// Option 2: Changer l'URL backend
const sfLib = new SalesforceLeadLib({
    backendUrl: 'https://votre-backend-azure.com'
});
```

### Problème 4: Transfer button toujours désactivé

**Cause:** LastName OU Company manquant

**Solution:**
```javascript
// Les DEUX champs sont requis
const leadData = {
    LastName: 'Doe',      // ← Requis
    Company: 'Acme Corp', // ← Requis
    // ... autres champs
};
```

### Problème 5: Styles Tailwind manquants

**Cause:** Tailwind CSS non chargé

**Solution:**
```html
<head>
    <!-- Ajouter Tailwind -->
    <script src="https://cdn.tailwindcss.com"></script>
</head>
```

### Problème 6: Icônes FontAwesome manquantes

**Cause:** FontAwesome non chargé

**Solution:**
```html
<head>
    <!-- Ajouter FontAwesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
```

---

## 📊 Checklist de Test Complète

### Tests d'Interface ✓

- [ ] Module s'initialise sans erreur
- [ ] Sidebar visible avec logo
- [ ] Navigation présente (mais pas fonctionnelle)
- [ ] API Status card affichée
- [ ] Header avec titre et boutons
- [ ] Stats cards (3) affichées
- [ ] Field controls visibles
- [ ] Lead Information card affichée
- [ ] Empty state visible initialement
- [ ] Tous les modals présents (cachés)

### Tests de Chargement ✓

- [ ] `loadLead()` charge les données
- [ ] Tableau ListView se remplit
- [ ] Stats se mettent à jour correctement
- [ ] Toggle List/Cards fonctionne
- [ ] CardView affiche en grille
- [ ] Filtres fonctionnent (All/Active/Inactive/Custom)
- [ ] Stats cards cliquables filtrent

### Tests d'Édition ✓

- [ ] Clic sur ✏️ ouvre modal d'édition
- [ ] Modification de valeur fonctionne
- [ ] Toggle active/inactive fonctionne
- [ ] Synchronisation ListView ↔ CardView
- [ ] Custom labels sauvegardés
- [ ] Custom fields créés/édités/supprimés

### Tests de Connexion ✓

- [ ] `connect()` avec backend fonctionne
- [ ] API Status passe à "Connected"
- [ ] User Profile s'affiche
- [ ] Disconnect fonctionne
- [ ] Persistence de connexion (24h)

### Tests de Transfert ✓

- [ ] Bouton Transfer activé avec LastName + Company
- [ ] Bouton Transfer désactivé sinon
- [ ] Tooltip explicite si désactivé
- [ ] `transferLead()` envoie données
- [ ] Modal de succès s'affiche (15s)
- [ ] Modal d'erreur si échec
- [ ] Statut sauvegardé après transfert

### Tests de Performance ✓

- [ ] Interface <500ms pour initialiser
- [ ] Pas de lag sur toggle active/inactive
- [ ] Switch List/Cards instantané
- [ ] Filtres réactifs
- [ ] Modals s'ouvrent/ferment smoothly

---

## 🎯 Tests de Régression

À tester après chaque modification:

1. **Initialisation complète**
2. **Chargement de lead**
3. **Toggle List/Cards**
4. **Filtres**
5. **Édition de champ**
6. **Transfert (si backend disponible)**

---

## 📝 Résultats Attendus

### Test Complet (avec backend):

```
✅ Module initialisé en <500ms
✅ Interface complète générée
✅ Lead chargé et affiché
✅ Connexion Salesforce établie
✅ Lead transféré avec succès
✅ Statut "Success" sauvegardé
✅ Modal de succès affiché 15s
✅ Déconnexion propre
✅ Nettoyage sans erreur
```

### Test Sans Backend:

```
✅ Module initialisé
✅ Interface complète générée
✅ Lead chargé et affiché
⚠️  Connexion échoue (normal - pas de backend)
⚠️  Transfert échoue (normal - pas de backend)
✅ UI reste fonctionnelle
✅ Nettoyage sans erreur
```

---

## 🚀 Test de Production

Avant déploiement, tester avec:

```javascript
// Configuration production
const sfLib = new SalesforceLeadLib({
    backendUrl: 'https://lsapisfbackenddev-gnfbema5gcaxdahz.germanywestcentral-01.azurewebsites.net',
    serverName: 'lstest.convey.de',
    apiName: 'apisftest'
});

// Lead réel
const realLead = {
    // Données réelles d'un lead
};

// Test complet
await sfLib.connect({/* credentials réels */});
await sfLib.loadLead(container, realLead, eventId);
const result = await sfLib.transferLead(realLead);

console.log('✅ Production test passed:', result.salesforceId);
```

---

**Version:** 1.0.0
**Dernière mise à jour:** 9 novembre 2025
**Auteur:** LeadSuccess Team
