// virtualDataModal.js
// Modal for editing virtual/test data when no contacts exist

class VirtualDataModal {
  constructor(fieldMappingService) {
    this.fieldMappingService = fieldMappingService;
    this.virtualData = {};
    this.metadata = null;
  }

  /**
   * Fetch metadata for the entity type
   */
  async fetchMetadata(entityType = 'LS_Lead') {
    try {
      const serverName = sessionStorage.getItem('serverName');
      const apiName = sessionStorage.getItem('apiName');
      const credentials = sessionStorage.getItem('credentials');
      
      const endpoint = '$metadata';
      const response = await fetch(`https://${serverName}/${apiName}/${endpoint}`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Accept': 'application/xml'
        }
      });


      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.statusText}`);
      }

      const xmlText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

      const entityTypes = xmlDoc.getElementsByTagName('EntityType');
      let targetEntity = null;

      for (let entity of entityTypes) {
        if (entity.getAttribute('Name') === entityType) {
          targetEntity = entity;
          break;
        }
      }

      if (!targetEntity) {
        console.error(`EntityType ${entityType} not found in metadata`);
        return [];
      }

      // Parse properties
      const properties = targetEntity.getElementsByTagName('Property');
      const fields = [];

      for (let prop of properties) {
        const name = prop.getAttribute('Name');
        const type = prop.getAttribute('Type');
        const nullable = prop.getAttribute('Nullable') !== 'false';
        const maxLength = prop.getAttribute('MaxLength');

        fields.push({
          name,
          type,
          nullable,
          maxLength: maxLength && maxLength !== 'Max' ? parseInt(maxLength) : null
        });
      }



      this.metadata = fields;
      console.log("field",fields)
      return fields;

    } catch (error) {
      console.error('Error fetching metadata:', error);
      return [];
    }
  }

  /**
   * Generate default virtual data based on metadata
   */
  generateVirtualData(entityType = 'LS_Lead') {
    if (!this.metadata) {
      console.error('Metadata not loaded');
      return {};
    }

    const virtualData = {};

    this.metadata.forEach(field => {
      // Set default values based on field type
      switch (field.type) {
        case 'Edm.String':
          if (field.name.includes('Email')) {
            virtualData[field.name] = 'test@example.com';
          } else if (field.name.includes('Phone')) {
            virtualData[field.name] = '+1234567890';
          } else if (field.name === 'LastName') {
            virtualData[field.name] = 'Doe';
          } else if (field.name === 'FirstName') {
            virtualData[field.name] = 'John';
          } else if (field.name === 'Company') {
            virtualData[field.name] = 'Test Company';
          } else {
            virtualData[field.name] = 'Sample Text';
          }
          break;
          
        case 'Edm.Int32':
        case 'Edm.Int64':
          virtualData[field.name] = 0;
          break;
          
        case 'Edm.DateTime':
          virtualData[field.name] = new Date().toISOString();
          break;
          
        case 'Edm.Boolean':
          virtualData[field.name] = false;
          break;
          
        default:
          virtualData[field.name] = '';
      }
    });

    this.virtualData = virtualData;
    return virtualData;
  }

  /**
   * Show the virtual data configuration modal
   */
  async show(eventId, entityType = 'LS_Lead') {
    // Fetch metadata first
    await this.fetchMetadata(entityType);
    
    // Generate virtual data
    this.generateVirtualData(entityType);

    // Create modal HTML
    const modalHTML = `
      <div id="virtualDataModal" class="modal-overlay" style="display: flex;">
        <div class="modal-container" style="max-width: 900px; max-height: 90vh; overflow: auto;">
          <div class="modal-header">
            <h2>Test Data Configuration</h2>
            <button class="close-btn" onclick="window.virtualDataModal.close()">&times;</button>
          </div>
          
          <div class="modal-body">
            <p class="info-message">
              No contacts found for this event. You can configure test data below for testing the transfer.
              All fields are editable for testing purposes.
            </p>
            
            <!-- Tabs -->
            <div class="field-tabs">
              <button class="tab-btn active" data-tab="standard" onclick="window.virtualDataModal.switchTab('standard')">
                Standard Fields
              </button>
              <button class="tab-btn" data-tab="custom" onclick="window.virtualDataModal.switchTab('custom')">
                Custom Fields
              </button>
            </div>
            
            <!-- Standard Fields Tab -->
            <div id="standardFieldsTab" class="tab-content active">
              <div class="fields-grid">
                ${this.renderStandardFields()}
              </div>
            </div>
            
            <!-- Custom Fields Tab -->
            <div id="customFieldsTab" class="tab-content" style="display: none;">
              <div class="fields-grid">
                ${this.renderCustomFields()}
              </div>
            </div>
          </div>
          
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="window.virtualDataModal.close()">Cancel</button>
            <button class="btn btn-primary" onclick="window.virtualDataModal.saveAndTest()">
              Save & Test Transfer
            </button>
          </div>
        </div>
      </div>
    `;

    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Attach event listeners
    this.attachEventListeners();
  }

  /**
   * Render standard fields
   */
  renderStandardFields() {
    if (!this.metadata) return '';

    return this.metadata.map(field => `
      <div class="field-row">
        <label class="field-label">${field.name}</label>
        <input 
          type="text" 
          class="field-input" 
          data-field="${field.name}"
          value="${this.virtualData[field.name] || ''}"
          placeholder="Enter ${field.name}"
        />
      </div>
    `).join('');
  }

  /**
   * Render custom fields
   */
  renderCustomFields() {
    const customFields = this.fieldMappingService.getAllCustomFields();
    
    if (customFields.length === 0) {
      return '<p class="no-data">No custom fields configured.</p>';
    }

    return customFields.map(field => `
      <div class="field-row">
        <label class="field-label">${field.label}</label>
        <input 
          type="text" 
          class="field-input custom-field" 
          data-field-id="${field.id}"
          data-sf-field="${field.sfFieldName}"
          value="${field.value || ''}"
          placeholder="Enter ${field.label}"
        />
      </div>
    `).join('');
  }

  /**
   * Switch between tabs
   */
  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.getElementById('standardFieldsTab').style.display = 
      tabName === 'standard' ? 'block' : 'none';
    document.getElementById('customFieldsTab').style.display = 
      tabName === 'custom' ? 'block' : 'none';
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Listen to input changes
    document.querySelectorAll('.field-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const fieldName = e.target.dataset.field;
        if (fieldName) {
          this.virtualData[fieldName] = e.target.value;
        }
      });
    });

    // Listen to custom field changes
    document.querySelectorAll('.custom-field').forEach(input => {
      input.addEventListener('input', (e) => {
        const fieldId = e.target.dataset.fieldId;
        const value = e.target.value;
        
        // Update custom field value
        const customField = this.fieldMappingService.getCustomFieldById(fieldId);
        if (customField) {
          customField.value = value;
        }
      });
    });
  }

  /**
   * Save and test transfer
   */
  async saveAndTest() {
    try {
      // Validate required fields
      if (!this.virtualData.LastName || !this.virtualData.Company) {
        alert('LastName and Company are required fields!');
        return;
      }

      // Save virtual data to session for testing
      sessionStorage.setItem('virtualTestData', JSON.stringify(this.virtualData));
      
      // Close modal
      this.close();
      
      // Show success message
      showToast('Test data saved successfully!', 'success');
      
      // Trigger the test transfer (you can implement this based on your transfer logic)
      if (window.testTransferWithVirtualData) {
        await window.testTransferWithVirtualData(this.virtualData);
      }

    } catch (error) {
      console.error('Error saving test data:', error);
      showToast('Error saving test data', 'error');
    }
  }

  /**
   * Close the modal
   */
  close() {
    const modal = document.getElementById('virtualDataModal');
    if (modal) {
      modal.remove();
    }
  }
}

// Make available globally
window.VirtualDataModal = VirtualDataModal;