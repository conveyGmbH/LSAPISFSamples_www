# Guide de Configuration des Custom Labels pour Salesforce

## 📋 Vue d'ensemble

Ce guide explique comment configurer les mappings de champs personnalisés pour transférer vos leads vers Salesforce avec des noms de champs personnalisés.

## 🎯 Pourquoi utiliser les Custom Labels ?

Vos données arrivent de l'API avec des noms génériques comme `Question01`, `Question02`, etc. Les custom labels vous permettent de :

- ✅ Renommer `Question01` → `Products_Interest__c` dans Salesforce
- ✅ Mapper `Answers01` → `Products_Answer__c`
- ✅ Créer des champs Salesforce avec des noms significatifs
- ✅ Réutiliser les mêmes configurations pour plusieurs événements

## 📊 Structure des Données de l'API

### LS_Lead (Champs Standards)
```json
{
  "Salutation": "Mr.",
  "FirstName": "Georg",
  "LastName": "Klein",
  "Company": "convey GmbH",
  "Email": "klein@convey.de",
  "Phone": "+49 (0)89 / 54 34 49 30",
  "Street": "Leonrodstraße 68",
  "City": "München",
  "Country": "Germany"
}
```

### LS_LeadReport (Champs Standards + Questionnaires Dynamiques)
```json
{
  "Salutation": "Mr.",
  "FirstName": "Georg",
  "LastName": "Klein",
  // ... champs standards ...

  // Questionnaires dynamiques (30 questions possibles)
  "Question01": "Products",
  "Answers01": "Product A, Product B",
  "Text01": "Very interested in Product A",

  "Question02": "Prospects",
  "Answers02": "High",
  "Text02": "Ready to buy soon",

  "Question03": "Priority",
  "Answers03": "Urgent",
  "Text03": "Need quote within 2 weeks"
}
```

## 🔧 Configuration des Mappings

### Méthode 1 : Configuration Manuelle (UI)

1. **Charger un lead** depuis la page Lead Transfer
2. **Voir tous les champs** dans CardView ou ListView
3. **Cliquer sur l'icône "Edit" (crayon)** à côté d'un champ
4. **Entrer le nom Salesforce** désiré (ex: `Products_Interest`)
5. **Sauvegarder** - Le système ajoute automatiquement `__c` pour les champs custom

**Exemple :**
```
Question01 → "Products_Interest" → Devient "Products_Interest__c" dans Salesforce
Answers01 → "Products_Answer" → Devient "Products_Answer__c" dans Salesforce
```

### Méthode 2 : Utiliser des Templates

#### Créer un Template

```javascript
// Dans la console du navigateur ou via l'UI
const templates = new FieldMappingTemplates(window.fieldMappingService);

// Créer un template à partir de la configuration actuelle
templates.createTemplate(
  'Trade Show 2025',
  'Configuration pour les salons professionnels',
  ['Trade Show', 'Events']
);
```

#### Appliquer un Template

```javascript
// Lister les templates disponibles
const allTemplates = templates.getAllTemplates();
console.log(allTemplates);

// Appliquer un template
const result = await templates.applyTemplate('template_123456789_abc', false);
// false = ne pas écraser les labels existants
// true = écraser tous les labels
```

#### Exporter/Importer des Templates

```javascript
// Exporter vers un fichier JSON
templates.exportTemplateToFile('template_123456789_abc');

// Importer depuis un fichier JSON
const fileInput = document.querySelector('#templateFileInput');
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const imported = await templates.importTemplateFromFile(file);
  console.log('Template imported:', imported);
});
```

## 📝 Exemples de Configuration par Type d'Événement

### 1. Salon Professionnel (Trade Show)

```json
{
  "Question01": "Products_Interest__c",
  "Answers01": "Products_Answer__c",
  "Text01": "Products_Notes__c",

  "Question02": "Prospects_Level__c",
  "Answers02": "Prospects_Answer__c",
  "Text02": "Prospects_Notes__c",

  "Question03": "Priority__c",
  "Answers03": "Priority_Answer__c",
  "Text03": "Priority_Notes__c",

  "Question04": "Contact_Preference__c",
  "Answers04": "Contact_Answer__c",
  "Text04": "Contact_Notes__c",

  "Question05": "Followup_Timeline__c",
  "Answers05": "Followup_Answer__c",
  "Text05": "Followup_Notes__c",

  "SalesArea": "Sales_Region__c",
  "Department": "Department__c",
  "Industry": "Industry__c"
}
```

### 2. Webinaire

```json
{
  "Question01": "Webinar_Topic_Interest__c",
  "Answers01": "Topic_Answer__c",
  "Text01": "Topic_Notes__c",

  "Question02": "Company_Size__c",
  "Answers02": "Company_Size_Answer__c",
  "Text02": "Company_Size_Notes__c",

  "Question03": "Role__c",
  "Answers03": "Role_Answer__c",
  "Text03": "Role_Notes__c",

  "Question04": "Pain_Points__c",
  "Answers04": "Pain_Points_Answer__c",
  "Text04": "Pain_Points_Notes__c",

  "Industry": "Industry__c",
  "Department": "Department__c"
}
```

### 3. Enquête Client

```json
{
  "Question01": "Satisfaction_Score__c",
  "Answers01": "Satisfaction_Answer__c",
  "Text01": "Satisfaction_Comments__c",

  "Question02": "Product_Feedback__c",
  "Answers02": "Product_Answer__c",
  "Text02": "Product_Comments__c",

  "Question03": "Support_Rating__c",
  "Answers03": "Support_Answer__c",
  "Text03": "Support_Comments__c",

  "Question04": "Recommendation_Likelihood__c",
  "Answers04": "NPS_Score__c",
  "Text04": "NPS_Comments__c",

  "Question05": "Improvement_Suggestions__c",
  "Answers05": "Improvement_Answer__c",
  "Text05": "Improvement_Details__c"
}
```

## 🔄 Workflow Complet

### Scénario : Nouveau Salon Professionnel

1. **Préparer le Template** (une seule fois)
   ```javascript
   const templates = new FieldMappingTemplates(window.fieldMappingService);
   templates.createSampleTemplate('tradeshow');
   ```

2. **Charger un Lead Test** depuis l'API
   - Ouvrir la page Lead Transfer
   - Sélectionner un lead du salon

3. **Appliquer le Template**
   ```javascript
   // Obtenir l'ID du template "Trade Show Event Template"
   const allTemplates = templates.getAllTemplates();
   const tradeShowTemplate = allTemplates.find(t => t.name.includes('Trade Show'));

   // Appliquer le template
   await templates.applyTemplate(tradeShowTemplate.id, true);
   ```

4. **Vérifier les Mappings**
   - Dans CardView ou ListView, vérifier que les labels sont corrects
   - Exemple : `Question01` devrait afficher "Products Interest"

5. **Transférer vers Salesforce**
   - Activer les champs désirés
   - Cliquer sur "Transfer to Salesforce"
   - Le système crée automatiquement les champs custom s'ils n'existent pas

6. **Réutiliser pour les Prochains Événements**
   - Charger un nouveau lead
   - Appliquer le même template
   - Tous les mappings sont déjà configurés !

## 📦 Sauvegarde et Synchronisation

### Sauvegarde Automatique

Les mappings sont sauvegardés à 2 endroits :

1. **LocalStorage** (navigateur) - Backup immédiat
2. **Base de données API** (table `LS_FieldMappings`) - Persistance

Chaque changement est automatiquement sauvegardé dans les deux.

### Synchronisation entre Événements

```javascript
// Les mappings sont liés à l'EventId
// Pour réutiliser des mappings d'un autre événement :

// 1. Créer un template depuis l'événement source
const templates = new FieldMappingTemplates(window.fieldMappingService);
const sourceTemplate = templates.createTemplate('My Event Config');

// 2. Charger un lead du nouvel événement
// 3. Appliquer le template
await templates.applyTemplate(sourceTemplate.id);
```

## ⚙️ Règles de Nommage Salesforce

### Champs Standard
Les champs standard ne peuvent PAS être renommés :
- `FirstName`, `LastName`, `Email`, `Phone`, `Company`, `Street`, `City`, etc.
- Ces champs gardent toujours leur nom d'origine

### Champs Custom
Les champs custom doivent suivre les règles Salesforce :
- ✅ Commencer par une lettre
- ✅ Contenir seulement lettres, chiffres, underscores
- ✅ Se terminer par `__c` (ajouté automatiquement)
- ❌ Pas d'espaces (remplacés par `_`)
- ❌ Pas de caractères spéciaux (supprimés)

**Exemples de Normalisation Automatique :**
```
"Products Interest" → "Products_Interest__c"
"Priority!!!" → "Priority__c"
"123Test" → "Field_123Test__c" (ajout de préfixe si commence par chiffre)
"Suffix__c" → "Suffix" (champ standard détecté, pas de __c)
```

## 🎨 Interface Utilisateur (Prochaine Étape)

### Template Manager UI (À Implémenter)

Fonctionnalités proposées :
- 📋 Liste de tous les templates
- ➕ Créer nouveau template
- ✏️ Éditer template existant
- 📤 Exporter vers JSON
- 📥 Importer depuis JSON
- 🗑️ Supprimer template
- 👁️ Prévisualiser les changements avant application
- 🏷️ Filtrer par catégorie (Trade Show, Webinar, Survey, etc.)

## 📊 API Reference

### FieldMappingService (Existant)

```javascript
// Définir un custom label
await fieldMappingService.setCustomLabel('Question01', 'Products_Interest');

// Obtenir un custom label
const label = fieldMappingService.customLabels['Question01'];

// Exporter la configuration
const config = fieldMappingService.exportConfiguration();

// Activer/Désactiver un champ
await fieldMappingService.setFieldConfig('Question01', { active: true });
```

### FieldMappingTemplates (Nouveau)

```javascript
// Créer template
const template = templates.createTemplate('My Template', 'Description', ['Category']);

// Appliquer template
await templates.applyTemplate(templateId, overwrite);

// Lister templates
const all = templates.getAllTemplates();
const byCategory = templates.getTemplatesByCategory('Trade Show');

// Prévisualiser changements
const preview = templates.previewTemplate(templateId);

// Exporter/Importer
templates.exportTemplateToFile(templateId);
const imported = await templates.importTemplateFromFile(file);

// Créer sample templates
templates.createSampleTemplate('tradeshow');
templates.createSampleTemplate('webinar');
templates.createSampleTemplate('survey');
```

## 🚀 Quick Start

### Pour les Développeurs

1. **Inclure le service de templates**
   ```html
   <script src="/js/services/mapping/FieldMappingService.js"></script>
   <script src="/js/services/mapping/FieldMappingTemplates.js"></script>
   ```

2. **Initialiser**
   ```javascript
   const fieldMappingService = new FieldMappingService();
   const templates = new FieldMappingTemplates(fieldMappingService);
   ```

3. **Créer le premier template**
   ```javascript
   // Option 1: Depuis sample
   templates.createSampleTemplate('tradeshow');

   // Option 2: Custom
   templates.createTemplateFromData({
     name: 'My Event',
     description: 'Custom event config',
     categories: ['Custom'],
     fieldMappings: {
       'Question01': 'Custom_Field_1__c',
       'Question02': 'Custom_Field_2__c'
     }
   });
   ```

### Pour les Utilisateurs Finaux

1. **Première Configuration**
   - Ouvrir un lead
   - Configurer les labels manuellement via l'UI
   - Créer un template pour réutilisation

2. **Événements Suivants**
   - Ouvrir Template Manager
   - Sélectionner template approprié
   - Appliquer en un clic

## 📞 Support

Pour toute question sur la configuration des mappings :
- Consulter ce guide
- Vérifier les exemples de templates
- Tester avec un lead d'exemple avant le transfert en production
