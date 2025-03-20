
class SalesforceService {
  constructor() {
    this.baseUrl = '/salesforce-api'; // URL du backend Node.js
    this.isConnected = false;
    this.userInfo = null;
  }

  /**
   * Initialiser la connexion à Salesforce
   * @returns {Promise<string>} URL d'authentification Salesforce
   */
  async initAuth() {
    try {
      const response = await fetch(`${this.baseUrl}/auth`);
      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.statusText}`);
      }
      const data = await response.json();
      return data.authUrl;
    } catch (error) {
      console.error('Failed to initialize authentication:', error);
      throw error;
    }
  }

  /**
   * Vérifier l'état de connexion à Salesforce
   * @returns {Promise<Object>} Informations de connexion
   */
  async checkConnection() {
    try {
      const response = await fetch(`${this.baseUrl}/connection-status`);
      if (!response.ok) {
        throw new Error(`Connection check failed: ${response.statusText}`);
      }
      const data = await response.json();
      this.isConnected = data.connected;
      this.userInfo = data.userInfo;
      return data;
    } catch (error) {
      console.error('Failed to check connection:', error);
      this.isConnected = false;
      this.userInfo = null;
      throw error;
    }
  }

  /**
   * Valider les données d'un lead pour Salesforce
   * @param {Object} leadData Les données du lead à valider
   * @returns {Promise<Object>} Résultat de la validation
   */
  async validateLeadData(leadData) {
    try {
      const response = await fetch(`${this.baseUrl}/validate-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(leadData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Validation failed: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Lead validation failed:', error);
      throw error;
    }
  }

  /**
   * Transférer un lead vers Salesforce
   * @param {Object} leadData Les données du lead à transférer
   * @returns {Promise<Object>} Résultat du transfert
   */
  async transferLead(leadData) {
    try {
      const response = await fetch(`${this.baseUrl}/transfer-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(leadData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Transfer failed: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Lead transfer failed:', error);
      throw error;
    }
  }

  /**
   * Récupérer le statut d'un transfert
   * @param {string} transferId ID du transfert
   * @returns {Promise<Object>} Statut du transfert
   */
  async getTransferStatus(transferId) {
    try {
      const response = await fetch(`${this.baseUrl}/transfer-status/${transferId}`);
      if (!response.ok) {
        throw new Error(`Failed to get transfer status: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to get transfer status:', error);
      throw error;
    }
  }
}

export default SalesforceService;