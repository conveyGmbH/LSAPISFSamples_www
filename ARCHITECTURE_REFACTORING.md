# 🔄 Architecture Refactoring - Lead Display Controllers

## 📅 Date: 2025-12-02

## 🎯 Objectif

Simplifier et unifier l'architecture des contrôleurs pour gérer **LS_Lead** et **LS_LeadReport** avec un seul contrôleur intelligent.

---

## ✅ Changements effectués

### 1. **Nouveau contrôleur unifié créé**

**Fichier**: `js/controllers/displayLeadUnifiedController.js`

**Responsabilités**:
- ✅ Détecte automatiquement le type d'entité (LS_Lead ou LS_LeadReport)
- ✅ Détecte automatiquement le mode (normal avec contacts, virtuel sans contacts)
- ✅ Gère l'affichage des données avec filtrage des champs actifs
- ✅ Gère le transfert vers Salesforce sans modals
- ✅ Affiche des notifications toast au lieu de modals

---

### 2. **Fichiers à SUPPRIMER** ❌

Les fichiers suivants ne sont **plus nécessaires** et peuvent être supprimés:

| Fichier | Raison |
|---------|--------|
| `js/controllers/displayLsLeadController.js` | Remplacé par displayLeadUnifiedController.js |
| `js/controllers/displayLsLeadRepportController.js` | Remplacé par displayLeadUnifiedController.js |
| `js/controllers/fieldPreviewModal.js` | Modals de prévisualisation supprimés |
| `js/controllers/transferModals.js` | Remplacé par notifications toast |
| `js/controllers/transferWithPreview.js` | Plus nécessaire |

---

### 3. **Fichiers à CONSERVER** ✅

| Fichier | Utilisation |
|---------|-------------|
| `js/controllers/fieldConfiguratorController.js` | Configuration des champs (INCHANGÉ) |
| `js/services/mapping/FieldMappingService.js` | Service de mapping (INCHANGÉ) |
| `js/services/fakeDataGenerator.js` | Génération de données test (INCHANGÉ) |
| `salesforce-backend/fieldConfigStorage.js` | Stockage backend (INCHANGÉ) |
| `salesforceLeadLib.js` | Communication Salesforce (INCHANGÉ) |

---

## 🔄 Migration des pages HTML

### Pages à mettre à jour

#### 1. **pages/displayLsLead.html**

**Avant**:
```html
<script type="module" src="/js/controllers/displayLsLeadController.js"></script>
```

**Après**:
```html
<script type="module" src="/js/controllers/displayLeadUnifiedController.js"></script>
```

#### 2. **pages/displayLsLeadReport.html**

**Avant**:
```html
<script type="module" src="/js/controllers/displayLsLeadRepportController.js"></script>
```

**Après**:
```html
<script type="module" src="/js/controllers/displayLeadUnifiedController.js"></script>
```

---

## 🆕 Nouvelles fonctionnalités

### 1. **Système de notifications Toast**

Remplace tous les modals par des notifications légères:

```javascript
// Utilisation
showToast('Message', 'success'); // Types: success, error, warning, info
```

**Avantages**:
- ⚡ Plus rapide
- 🎨 Moins intrusif
- 🧹 Code plus simple
- ♿ Meilleure UX

---

### 2. **Détection automatique du mode**

Le contrôleur détecte automatiquement:

```javascript
// URL: displayLsLead.html?eventId=123&mode=virtual&source=leadReport
// ↓
// Détecte:
// - entityType = 'LS_LeadReport'
// - mode = 'virtual'
// - eventId = '123'
```

---

## 📊 Architecture finale

```
┌─────────────────────────────────────────────────────┐
│              PAGES HTML                              │
└─────────────────────────────────────────────────────┘
                    │
         ┌──────────┴───────────┐
         │                      │
   displayLsLead.html    displayLsLeadReport.html
         │                      │
         └──────────┬───────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│      displayLeadUnifiedController.js                 │
│                                                      │
│  • Détecte entity type (LS_Lead | LS_LeadReport)    │
│  • Détecte mode (normal | virtual)                  │
│  • Charge les données                               │
│  • Affiche avec champs actifs                       │
│  • Transfert direct (toast notifications)           │
└─────────────────────────────────────────────────────┘
                    │
         ┌──────────┼──────────┐
         │          │          │
         ▼          ▼          ▼
  ApiService  FieldMapping  SalesforceLib
```

---

## ✅ Checklist de migration

- [x] Créer displayLeadUnifiedController.js
- [ ] Mettre à jour displayLsLead.html
- [ ] Mettre à jour displayLsLeadReport.html
- [ ] Supprimer les fichiers obsolètes
- [ ] Tester mode normal (avec contacts)
- [ ] Tester mode virtuel (sans contacts)
- [ ] Tester LS_Lead
- [ ] Tester LS_LeadReport
- [ ] Tester le transfert vers Salesforce
- [ ] Vérifier les notifications toast

---

## 🚨 Points d'attention

1. **FieldMappingService** doit être chargé avant le contrôleur
2. **salesforceLeadLib** doit être disponible pour le transfert
3. Les **modals d'édition** dans fieldConfiguratorController sont **conservés**
4. Le **backend** (fieldConfigStorage.js) reste **inchangé**

---

## 📝 Notes

- Le contrôleur unifié est **rétrocompatible** avec l'architecture existante
- Les notifications toast utilisent du CSS inline (pas de dépendances externes)
- Le mode virtuel utilise sessionStorage pour les données de test
- Le transfert vers Salesforce est direct (pas de modal de prévisualisation)

---

## 🔗 Fichiers modifiés

| Fichier | Type de modification |
|---------|---------------------|
| `js/controllers/displayLeadUnifiedController.js` | ✅ CRÉÉ |
| `pages/displayLsLead.html` | ⏳ À METTRE À JOUR |
| `pages/displayLsLeadReport.html` | ⏳ À METTRE À JOUR |

---

**Auteur**: Refactoring architectural
**Date**: 2025-12-02
**Version**: 1.0.0
