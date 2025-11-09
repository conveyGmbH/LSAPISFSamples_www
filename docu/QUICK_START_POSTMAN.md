# 🚀 Quick Start: Tester les Métadonnées avec Postman

## Installation Automatique (1 commande)

```powershell
cd C:\gitprojects\LSAPISFCRM
.\install-debug-endpoints.ps1
```

**Ce script fait automatiquement:**
1. ✅ Arrête les serveurs existants
2. ✅ Ajoute les imports dans server.js
3. ✅ Active les 3 endpoints de debug
4. ✅ Redémarre le serveur
5. ✅ Affiche les URLs des endpoints

---

## Installation Manuelle (si le script échoue)

### Étape 1: Arrêter le serveur

```powershell
# Trouver le processus sur port 3000
$pid = (Get-NetTCPConnection -LocalPort 3000).OwningProcess
Stop-Process -Id $pid -Force
```

### Étape 2: Modifier server.js

**Ligne 14** - Ajouter après les imports:
```javascript
const setupDebugEndpoints = require('./debug-endpoints');
```

**Ligne 2216** - Ajouter avant `// Health check`:
```javascript
// DEBUG ENDPOINTS: Inspect Salesforce metadata via Postman
setupDebugEndpoints(app, getCurrentOrgId, getConnection);
```

### Étape 3: Redémarrer

```bash
cd C:\gitprojects\LSAPISFCRM\salesforce-backend
node server.js
```

---

## Vérification

**Logs attendus au démarrage:**
```
✅ Debug endpoints loaded:
   GET  /api/salesforce/metadata/lead
   GET  /api/salesforce/metadata/countrycodes
   POST /api/salesforce/metadata/test-country-validation
```

---

## Test Rapide (sans Postman)

### Test 1: Vérifier que l'endpoint existe

```bash
curl http://localhost:3000/api/salesforce/metadata/countrycodes
```

**Si pas connecté à Salesforce:**
```json
{
  "message": "Not connected to Salesforce",
  "tip": "Please connect first..."
}
```
✅ C'est normal!

### Test 2: Se connecter à Salesforce

1. Ouvrez: http://localhost:3000/displayLeadTransfer
2. Click "Connect to Salesforce"
3. Connectez-vous

### Test 3: Réessayer

```bash
curl http://localhost:3000/api/salesforce/metadata/countrycodes
```

**Maintenant vous devriez voir:**
```json
{
  "success": true,
  "countryCode": {
    "totalValues": 249,
    "values": [
      { "value": "DE", "label": "Germany", "active": true },
      ...
    ]
  }
}
```
✅ Ça marche!

---

## Import Collection Postman

### Méthode 1: Fichier
1. Ouvrez Postman
2. Click **Import**
3. Sélectionnez: `POSTMAN_METADATA_COLLECTION.json`
4. Click **Import**

### Méthode 2: URL (si fichier ne marche pas)
1. Click **Import** → **Link**
2. Collez ce contenu dans Postman (New Collection → Import Raw Text)

---

## 🎯 Les 3 Requêtes Essentielles

### 1️⃣ Voir tous les codes pays valides

```
GET http://localhost:3000/api/salesforce/metadata/countrycodes
```

**Résultat:** Liste de tous les codes ISO (DE, FR, GB, US, ...)

---

### 2️⃣ Voir TOUS les champs Lead

```
GET http://localhost:3000/api/salesforce/metadata/lead
```

**Résultat:** Métadonnées complètes (87 champs)

---

### 3️⃣ Tester la validation

```
POST http://localhost:3000/api/salesforce/metadata/test-country-validation
Content-Type: application/json

{
  "CountryCode": "DE1",
  "Country": "Germany1"
}
```

**Résultat:** Voir les corrections appliquées

---

## ❌ Dépannage

### Erreur: "Route not found"

**Cause:** Les endpoints ne sont pas chargés

**Solution:**
```bash
# Vérifier que debug-endpoints.js existe
ls C:\gitprojects\LSAPISFCRM\salesforce-backend\debug-endpoints.js

# Relancer l'installation
.\install-debug-endpoints.ps1
```

---

### Erreur: 401 "Not connected"

**Cause:** Pas connecté à Salesforce

**Solution:**
1. http://localhost:3000/displayLeadTransfer
2. Connect to Salesforce
3. Réessayez Postman

---

### Erreur: "Cannot find module './debug-endpoints'"

**Cause:** Le fichier debug-endpoints.js n'existe pas

**Solution:**
```bash
# Vérifier
ls C:\gitprojects\LSAPISFCRM\salesforce-backend\debug-endpoints.js

# Si absent, le fichier a été créé mais peut-être au mauvais endroit
# Cherchez-le:
dir debug-endpoints.js /s
```

---

## 📚 Documentation Complète

- 📖 [GUIDE_POSTMAN_METADATA.md](GUIDE_POSTMAN_METADATA.md) - Guide détaillé
- 🔧 [debug-endpoints.js](salesforce-backend/debug-endpoints.js) - Code des endpoints
- 📦 [POSTMAN_METADATA_COLLECTION.json](POSTMAN_METADATA_COLLECTION.json) - Collection

---

## 💡 Exemples de Réponses

### CountryCodes (simplifié)
```json
{
  "countryCode": {
    "totalValues": 249,
    "activeValues": 249,
    "values": [
      { "value": "DE", "label": "Germany" },
      { "value": "FR", "label": "France" },
      { "value": "GB", "label": "United Kingdom" }
    ]
  },
  "mapping": {
    "DE": ["Germany", "Deutschland"],
    "FR": ["France"]
  },
  "summary": {
    "sampleActiveCodes": "AF, AX, AL, DZ, AS, AD, AO, AI, AQ, AG"
  }
}
```

### Test Validation
```json
{
  "input": { "CountryCode": "DE1", "Country": "Germany1" },
  "output": { "CountryCode": "DE", "Country": "Germany" },
  "changes": {
    "countryCodeChanged": true,
    "countryChanged": true
  }
}
```

---

## ✅ Checklist Finale

- [ ] Script `install-debug-endpoints.ps1` exécuté
- [ ] Serveur redémarré avec les nouveaux endpoints
- [ ] Connecté à Salesforce via le navigateur
- [ ] Collection Postman importée
- [ ] Test GET /countrycodes réussi
- [ ] Test POST /test-country-validation réussi

**Tout fonctionne?** 🎉 Vous pouvez maintenant explorer vos métadonnées Salesforce!

---

## 🎓 Ce que Vous Pouvez Faire Maintenant

1. ✅ Voir tous les codes pays valides dans VOTRE org
2. ✅ Tester la validation AVANT un vrai transfert
3. ✅ Comprendre pourquoi "DE1" est corrigé vers "DE"
4. ✅ Voir le mapping Country → CountryCode
5. ✅ Explorer tous les champs Lead disponibles
6. ✅ Vérifier si des codes custom existent

**Amusez-vous!** 🚀
