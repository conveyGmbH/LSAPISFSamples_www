// Contrôleur simplifié pour le transfert de leads vers Salesforce
import SalesforceService from '../services/salesforceService.js';

// Initialisation du service Salesforce
const sfService = new SalesforceService();

// Variables globales
let selectedLeadData = null;
let leadSource = null;
let authWindow = null;

/**
 * Initialisation lors du chargement de la page
 */
document.addEventListener('DOMContentLoaded', async () => {
  const connectSalesforceBtn = document.getElementById('connectSalesforceBtn');
  const transferLeadBtn = document.getElementById('transferLeadBtn');
  const logoutBtn = document.getElementById('logoutButton');
  
  // Vérifier l'état de connexion Salesforce
  await checkSalesforceConnection();
  
  // Charger les données du lead
  loadLeadData();
  
  // Écouter les messages d'authentification réussie
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'salesforce-auth-success') {
      console.log('Received auth success message:', event.data);
      onAuthSuccess(event.data);
    }
  });
  
  // Ajouter les gestionnaires d'événements aux boutons
  if (connectSalesforceBtn) {
    connectSalesforceBtn.addEventListener('click', connectToSalesforce);
  }
  
  if (transferLeadBtn) {
    transferLeadBtn.addEventListener('click', transferLeadToSalesforce);
  }
  
  if (backButton) {
    backButton.addEventListener('click', () => {
      const source = sessionStorage.getItem('selectedLeadSource');
      window.location.href = source === 'LeadReport' ? 'displayLsLeadReport.html' : 'displayLsLead.html';
    });
  }
});

/**
 * Vérifier l'état de connexion Salesforce
 */
async function checkSalesforceConnection() {
  try {
    const status = await sfService.checkConnection();
    updateConnectionStatus(status.connected ? 'connected' : 'not-connected', 
      status.connected ? `Connecté en tant que ${status.userInfo?.display_name || status.userInfo?.name || 'Utilisateur Salesforce'}` : 'Non connecté à Salesforce');
    
    // Activer/désactiver le bouton de transfert selon l'état de connexion
    document.getElementById('transferLeadBtn').disabled = !status.connected;
  } catch (error) {
    console.error('Échec de la vérification de connexion:', error);
    updateConnectionStatus('not-connected', 'Statut de connexion inconnu');
  }
}

/**
 * Se connecter à Salesforce
 */
async function connectToSalesforce() {
  try {
    updateConnectionStatus('connecting', 'Connexion à Salesforce...');
    
    const authUrl = await sfService.getAuthUrl();
    authWindow = window.open(authUrl, 'salesforceAuth', 'width=600,height=700');
    
    if (!authWindow) {
      throw new Error('Popup bloqué! Veuillez autoriser les popups pour ce site.');
    }
  } catch (error) {
    console.error('Erreur d\'authentification:', error);
    updateConnectionStatus('not-connected', 'Échec de la connexion');
    showError(`Échec de la connexion à Salesforce: ${error.message}`);
  }
}

/**
 * Gérer le succès de l'authentification
 */
function onAuthSuccess(data) {
  // Fermer la fenêtre d'authentification si elle est encore ouverte
  if (authWindow && !authWindow.closed) {
    authWindow.close();
  }
  
  const userInfo = data.userInfo || {};
  const displayName = userInfo.display_name || userInfo.name || 'Utilisateur Salesforce';
  
  updateConnectionStatus('connected', `Connecté en tant que ${displayName}`);
  document.getElementById('transferLeadBtn').disabled = false;
}

/**
 * Charger les données du lead depuis la session
 */
function loadLeadData() {
  try {
    const leadDataStr = sessionStorage.getItem('selectedLeadData');
    leadSource = sessionStorage.getItem('selectedLeadSource');
    
    if (!leadDataStr || !leadSource) {
      showError('No lead data found. Please select a lead first.');
      setTimeout(() => {
        window.location.href = leadSource === 'LeadReport' ? 'displayLsLeadReport.html' : 'displayLsLead.html';
      }, 2000);
      return;
    }
    
    // Mettre à jour la source du lead
    const leadSourceElement = document.getElementById('leadSource');
    if (leadSourceElement) {
      leadSourceElement.textContent = leadSource === 'LeadReport' ? 'Lead Report' : 'Lead';
    }
    
    // Analyser les données du lead
    selectedLeadData = JSON.parse(leadDataStr);
    
    // Afficher les données
    displayLeadData(selectedLeadData);
  } catch (error) {
    console.error('Error loading lead data:', error);
    showError('Error loading lead data. Please try again.');
  }
}

/**
 * Afficher les données du lead dans l'interface
 */
function displayLeadData(data) {
  const leadDataContainer = document.getElementById('leadData');
  
  if (leadDataContainer) {
    leadDataContainer.innerHTML = '';
    
    if (!data || Object.keys(data).length === 0) {
      leadDataContainer.innerHTML = '<div class="no-data">No lead data available</div>';
      return;
    }
    
    // Créer la grille d'informations
    const infoGrid = document.createElement('div');
    infoGrid.className = 'lead-info-grid';
    
    // Définir les champs prioritaires
    const priorityFields = ['Id', 'FirstName', 'LastName', 'Email', 'Company', 'Phone', 'MobilePhone', 'Title', 'Industry'];
    const excludedFields = ['__metadata', 'KontaktViewId'];
    
    // Afficher d'abord les champs prioritaires
    priorityFields.forEach(field => {
      if (data[field]) {
        infoGrid.appendChild(createFieldElement(field, data[field]));
      }
    });
    
    // Puis les autres champs
    Object.keys(data).forEach(field => {
      if (
        !priorityFields.includes(field) && 
        !excludedFields.includes(field) && 
        field !== 'AttachmentIdList' &&
        !field.endsWith(' ')
      ) {
        infoGrid.appendChild(createFieldElement(field, data[field]));
      }
    });
    
    leadDataContainer.appendChild(infoGrid);
  }
}

/**
 * Créer un élément pour afficher un champ du lead
 */
function createFieldElement(label, value) {
  const fieldElement = document.createElement('div');
  fieldElement.className = 'lead-field';
  
  const labelElement = document.createElement('div');
  labelElement.className = 'field-label';
  labelElement.textContent = label;
  
  const valueElement = document.createElement('div');
  valueElement.className = 'field-value';
  
  // Formatter les dates si nécessaire
  if (label.includes('Date') || label === 'SystemModstamp') {
    try {
      const date = new Date(value);
      valueElement.textContent = !isNaN(date) ? date.toLocaleString() : (value || 'N/A');
    } catch (e) {
      valueElement.textContent = value || 'N/A';
    }
  } else {
    valueElement.textContent = value || 'N/A';
  }
  
  fieldElement.appendChild(labelElement);
  fieldElement.appendChild(valueElement);
  
  return fieldElement;
}

/**
 * Transférer le lead vers Salesforce
 */
async function transferLeadToSalesforce() {
  const transferLeadBtn = document.getElementById('transferLeadBtn');
  const transferResults = document.getElementById('transferResults');
  const transferStatus = document.getElementById('transferStatus');
  
  if (!selectedLeadData) {
    showError('Aucune donnée de lead disponible.');
    return;
  }
  
  try {
    // Désactiver le bouton pendant le transfert
    transferLeadBtn.disabled = true;
    transferLeadBtn.textContent = 'Transfert en cours...';
    
    // Afficher l'indicateur de progression
    transferResults.style.display = 'block';
    transferStatus.innerHTML = `
      <div class="transfer-pending">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        Traitement du transfert...
      </div>
    `;
    
    // Effectuer le transfert
    const result = await sfService.transferLead(selectedLeadData);

    console.log("result", result)
    
    // Afficher le résultat
    transferStatus.innerHTML = `
      <div class="status-success">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        Lead transféré avec succès vers Salesforce
      </div>
      <div class="status-details">
        <p><strong>ID Salesforce:</strong> ${result.leadId}</p>
        <p><strong>Statut:</strong> ${result.status}</p>
        <p><strong>Message:</strong> ${result.message}</p>
      </div>
    `;
  } catch (error) {
    console.error('Échec du transfert:', error);
    
    // Vérifier si l'erreur est liée à l'authentification
    if (error.message.includes('Not connected') || error.message.includes('expired')) {
      // Tenter une reconnexion
      updateConnectionStatus('not-connected', 'Session expirée. Reconnexion nécessaire.');
    }
    
    transferStatus.innerHTML = `
      <div class="status-error">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        Échec du transfert
      </div>
      <div class="status-details">
        <p><strong>Erreur:</strong> ${error.message || 'Erreur inconnue'}</p>
      </div>
    `;
  } finally {
    // Réactiver le bouton
    transferLeadBtn.disabled = false;
    transferLeadBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 5v14M19 12l-7 7-7-7"/>
      </svg>
      Transférer vers Salesforce
    `;
  }
}

/**
 * Mettre à jour l'indicateur de statut de connexion
 */
function updateConnectionStatus(status, message) {
  const statusIndicator = document.querySelector('.status-indicator');
  const statusText = document.querySelector('.sf-connection-status span');
  const connectSalesforceBtn = document.getElementById('connectSalesforceBtn');
  const transferLeadBtn = document.getElementById('transferLeadBtn');
  
  statusIndicator.className = 'status-indicator';
  statusIndicator.classList.add(status);
  statusText.textContent = message;
  
  if (status === 'connected') {
    if (connectSalesforceBtn) {
      connectSalesforceBtn.textContent = 'Connected to Salesforce';
      connectSalesforceBtn.disabled = true;
    }
    if (transferLeadBtn) {
      transferLeadBtn.disabled = false;
    }
  } else {
    if (connectSalesforceBtn) {
      connectSalesforceBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 11h-8m0 0V3m0 8 8-8M4 13h8m0 0v8m0-8-8 8"/>
        </svg>
        Connect to Salesforce
      `;
      connectSalesforceBtn.disabled = false;
    }
    if (transferLeadBtn) {
      transferLeadBtn.disabled = true;
    }
  }
}

/**
 * Afficher un message d'erreur
 */
function showError(message) {
  const errorElement = document.getElementById('errorMessage');
  errorElement.textContent = message;
  errorElement.style.display = 'block';
  
  setTimeout(() => {
    errorElement.style.display = 'none';
  }, 5000);
}