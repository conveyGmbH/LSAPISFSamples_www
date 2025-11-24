// virtualDataModal.js
// Modal for editing test data when no contacts exist

class VirtualDataModal {
  constructor(fieldMappingService) {
    this.fieldMappingService = fieldMappingService;
    this.virtualData = {};
    this.metadata = null;
    this.isClosing = false; // Prevent double-close
    this.isSaving = false; // Prevent double-save
  }

  // Fetch metadata for the entity type
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

  // Generate default virtual data based on metadata using FakeDataGenerator
  generateVirtualData(entityType = 'LS_Lead') {
    if (!this.metadata) {
      console.error('Metadata not loaded');
      return {};
    }

    // Initialize FakeDataGenerator if available
    const fakeGenerator = window.FakeDataGenerator ? new window.FakeDataGenerator() : null;

    const virtualData = {};

    this.metadata.forEach(field => {
      // Use FakeDataGenerator for realistic data if available
      if (fakeGenerator) {
        switch (field.name) {
          case 'FirstName':
            virtualData[field.name] = fakeGenerator.generateFirstName();
            break;
          case 'LastName':
            virtualData[field.name] = fakeGenerator.generateLastName();
            break;
          case 'Email':
            const firstName = virtualData['FirstName'] || 'test';
            const lastName = virtualData['LastName'] || 'user';
            virtualData[field.name] = fakeGenerator.generateEmail(firstName, lastName);
            break;
          case 'Company':
            virtualData[field.name] = fakeGenerator.generateCompany();
            break;
          case 'Phone':
            virtualData[field.name] = fakeGenerator.generatePhone();
            break;
          case 'MobilePhone':
            virtualData[field.name] = fakeGenerator.generateMobilePhone();
            break;
          case 'Title':
            virtualData[field.name] = fakeGenerator.generateTitle();
            break;
          case 'Street':
            virtualData[field.name] = fakeGenerator.generateStreet();
            break;
          case 'City':
            virtualData[field.name] = fakeGenerator.generateCity();
            break;
          case 'PostalCode':
            virtualData[field.name] = fakeGenerator.generatePostalCode();
            break;
          case 'State':
            virtualData[field.name] = fakeGenerator.generateState();
            break;
          case 'Industry':
            virtualData[field.name] = fakeGenerator.generateIndustry();
            break;
          case 'Website':
            const company = virtualData['Company'] || 'Example Company';
            virtualData[field.name] = fakeGenerator.generateWebsite(company);
            break;
          case 'Description':
            virtualData[field.name] = fakeGenerator.generateDescription();
            break;
          default:
            // Fallback for other fields based on type
            virtualData[field.name] = this.generateDefaultValue(field);
        }
      } else {
        // Fallback if FakeDataGenerator not available
        virtualData[field.name] = this.generateDefaultValue(field);
      }
    });

    this.virtualData = virtualData;
    return virtualData;
  }

  // Generate default value based on field type (fallback)
  generateDefaultValue(field) {
    switch (field.type) {
      case 'Edm.String':
        return 'Sample Text';
      case 'Edm.Int32':
      case 'Edm.Int64':
        return 0;
      case 'Edm.DateTime':
        return new Date().toISOString();
      case 'Edm.Boolean':
        return false;
      default:
        return '';
    }
  }

  // Show the virtual data configuration modal
  async show(eventId, entityType = 'LS_Lead') {
    // Fetch metadata first
    await this.fetchMetadata(entityType);

    // Generate virtual data
    this.generateVirtualData(entityType);

    // Create modal HTML with Salesforce branding
    const modalHTML = `
      <style>
        #virtualDataModal.modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }

        #virtualDataModal .modal-container {
          background: #FFFFFF;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
          max-width: 900px;
          max-height: 90vh;
          overflow: auto;
          animation: slideDown 0.3s ease-out;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        #virtualDataModal .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: none;
          background: #FFFFFF;
        }

        #virtualDataModal .modal-header-content {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        #virtualDataModal .modal-header-content img {
          height: 32px;
          width: auto;
        }

        #virtualDataModal .modal-header h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: #032D60;
        }

        #virtualDataModal .modal-header-divider {
          height: 1px;
          background: #E5E5E5;
          margin: 0 24px 16px 24px;
        }

        #virtualDataModal .close-btn {
          background: none;
          border: none;
          font-size: 28px;
          color: #706E6B;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: all 0.2s;
        }

        #virtualDataModal .close-btn:hover {
          background: #F3F2F2;
          color: #032D60;
        }

        #virtualDataModal .modal-body {
          padding: 0 24px 24px 24px;
        }

        #virtualDataModal .info-message {
          background: #E8F4F8;
          border-left: 4px solid #009EDB;
          padding: 12px 16px;
          margin-bottom: 20px;
          border-radius: 4px;
          color: #032D60;
          font-size: 14px;
          line-height: 1.5;
        }

        #virtualDataModal .field-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
          border-bottom: 2px solid #E5E5E5;
        }

        #virtualDataModal .tab-btn {
          background: none;
          border: none;
          padding: 12px 20px;
          font-size: 14px;
          font-weight: 500;
          color: #706E6B;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -2px;
          transition: all 0.2s;
        }

        #virtualDataModal .tab-btn:hover {
          color: #009EDB;
        }

        #virtualDataModal .tab-btn.active {
          color: #009EDB;
          border-bottom-color: #009EDB;
        }

        #virtualDataModal .fields-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
          max-height: 400px;
          overflow-y: auto;
          padding-right: 8px;
        }

        #virtualDataModal .field-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        #virtualDataModal .field-label {
          font-size: 13px;
          font-weight: 600;
          color: #032D60;
          margin: 0;
        }

        #virtualDataModal .field-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #C9C7C5;
          border-radius: 4px;
          font-size: 14px;
          color: #181818;
          background: #FFFFFF;
          transition: all 0.2s;
          box-sizing: border-box;
        }

        #virtualDataModal .field-input:hover {
          border-color: #009EDB;
        }

        #virtualDataModal .field-input:focus {
          outline: none;
          border-color: #009EDB;
          box-shadow: 0 0 0 3px rgba(0, 158, 219, 0.1);
        }

        #virtualDataModal .field-input::placeholder {
          color: #C9C7C5;
        }

        #virtualDataModal .no-data {
          text-align: center;
          color: #706E6B;
          padding: 40px;
          font-size: 14px;
        }

        #virtualDataModal .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 24px;
          border-top: 1px solid #E5E5E5;
          background: #F9F9F9;
          border-radius: 0 0 8px 8px;
        }

        #virtualDataModal .btn {
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 600;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
          min-width: 100px;
        }

        #virtualDataModal .btn-secondary {
          background: #FFFFFF;
          color: #032D60;
          border: 1px solid #C9C7C5;
        }

        #virtualDataModal .btn-secondary:hover {
          background: #F3F2F2;
          border-color: #032D60;
        }

        #virtualDataModal .btn-primary {
          background: #009EDB;
          color: #FFFFFF;
          border: 1px solid #009EDB;
        }

        #virtualDataModal .btn-primary:hover {
          background: #00A1E0;
          border-color: #00A1E0;
          box-shadow: 0 2px 8px rgba(0, 158, 219, 0.3);
        }

        #virtualDataModal .tab-content {
          animation: fadeIn 0.3s ease-in;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        /* Scrollbar styling */
        #virtualDataModal .fields-grid::-webkit-scrollbar {
          width: 8px;
        }

        #virtualDataModal .fields-grid::-webkit-scrollbar-track {
          background: #F3F2F2;
          border-radius: 4px;
        }

        #virtualDataModal .fields-grid::-webkit-scrollbar-thumb {
          background: #C9C7C5;
          border-radius: 4px;
        }

        #virtualDataModal .fields-grid::-webkit-scrollbar-thumb:hover {
          background: #009EDB;
        }
      </style>

      <div id="virtualDataModal" class="modal-overlay" style="display: flex;">
        <div class="modal-container">
          <div class="modal-header">
            <div class="modal-header-content">
              <img src="../img/Salesforce Logo.jpg" alt="Salesforce Logo" />
              <h2>Test Data Configuration</h2>
            </div>
            <button id="virtualDataCloseBtn" class="close-btn">&times;</button>
          </div>
          <div class="modal-header-divider"></div>

          <div class="modal-body">
            <p class="info-message">
              No contacts found for this event. You can configure test data below for testing the transfer.
              All fields are editable for testing purposes.
            </p>

            <!-- Tabs -->
            <div class="field-tabs">
              <button class="tab-btn active" data-tab="standard">
                Standard Fields
              </button>
              <button class="tab-btn" data-tab="custom">
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
            <button id="virtualDataCancelBtn" class="btn btn-secondary">Cancel</button>
            <button id="virtualDataSaveBtn" class="btn btn-primary">
              Save & Test Transfer
            </button>
          </div>
        </div>
      </div>
    `;

    // Remove any existing virtual data modal first
    const existingModal = document.getElementById('virtualDataModal');
    if (existingModal) {
      console.log('⚠️ Removing existing modal before creating new one');
      existingModal.remove();
    }

    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Attach event listeners
    this.attachEventListeners();
  }

  
   // Render standard fields  
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

  // Render custom fields
  renderCustomFields() {
    const customFields = this.fieldMappingService.getAllCustomFields();
    console.log('🔍 VirtualDataModal - Raw custom fields:', customFields);

    if (!customFields || customFields.length === 0) {
      return '<p class="no-data">No custom fields found.</p>';
    }

    return customFields.map(field => {
      // Use same fallback logic as fieldConfiguratorController
      const fieldName = field.sfFieldName || field.fieldName || field.name || 'Unnamed Field';
      console.log('🔍 VirtualDataModal - Rendering custom field:', {
        id: field.id,
        fieldName,
        sfFieldName: field.sfFieldName,
        value: field.value
      });

      return `
        <div class="field-row">
          <label class="field-label">${fieldName}</label>
          <input
            type="text"
            class="field-input custom-field"
            data-field-id="${field.id}"
            data-sf-field="${field.sfFieldName || ''}"
            value="${field.value || ''}"
            placeholder="Enter ${fieldName}"
          />
        </div>
      `;
    }).join('');
  }

  // Switch between tabs
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

  // Attach event listeners
  attachEventListeners() {
    console.log('🔧 Attaching event listeners...');

    // Field inputs
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

    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        console.log('🔘 Tab clicked:', tabName);
        this.switchTab(tabName);
      });
    });

    // Close button (X)
    const closeBtn = document.getElementById('virtualDataCloseBtn');
    console.log('🔍 Close button found:', closeBtn);
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        console.log('🔘 Close button (X) clicked');
        this.close();
      });
    } else {
      console.error('❌ Close button not found!');
    }

    // Cancel button
    const cancelBtn = document.getElementById('virtualDataCancelBtn');
    console.log('🔍 Cancel button found:', cancelBtn);
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        console.log('🔘 Cancel button clicked');
        this.close();
      });
    } else {
      console.error('❌ Cancel button not found!');
    }

    // Save & Test button
    const saveBtn = document.getElementById('virtualDataSaveBtn');
    console.log('🔍 Save button found:', saveBtn);
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        console.log('🔘 Save & Test button clicked');
        this.saveAndTest();
      });
    } else {
      console.error('❌ Save button not found!');
    }

    console.log('✅ Event listeners attached');
  }

  // Save and test transfer
  async saveAndTest() {
    // Prevent double execution
    if (this.isSaving) {
      console.log('⚠️ Save already in progress, ignoring...');
      return;
    }

    this.isSaving = true;
    console.log('💾 Starting save and test transfer...');

    try {
      // Validate required fields
      if (!this.virtualData.LastName || !this.virtualData.Company) {
        alert('LastName and Company are required fields!');
        this.isSaving = false;
        return;
      }

      // Collect custom field values from inputs
      document.querySelectorAll('.custom-field').forEach(input => {
        const fieldId = input.dataset.fieldId;
        const sfFieldName = input.dataset.sfField;
        const value = input.value;

        // Update in virtualData
        if (sfFieldName) {
          this.virtualData[sfFieldName] = value;
        }
      });

      // Save virtual data to session for testing
      sessionStorage.setItem('virtualTestData', JSON.stringify(this.virtualData));
      console.log('💾 Virtual test data saved to sessionStorage:', this.virtualData);

      // Close modal
      this.close();

      // Show success message
      if (typeof showToast === 'function') {
        showToast('Test data saved successfully! Displaying in table...', 'success');
      }

      // Display virtual data in the table
      if (window.displayVirtualDataInTable) {
        await window.displayVirtualDataInTable(this.virtualData);
      } else {
        console.warn('⚠️ displayVirtualDataInTable function not found');
      }

    } catch (error) {
      console.error('Error saving test data:', error);
      if (typeof showToast === 'function') {
        showToast('Error saving test data', 'error');
      }
    } finally {
      // Reset saving flag after a delay
      setTimeout(() => {
        this.isSaving = false;
      }, 1000);
    }
  }

  // Close the modal
  close() {
    // Prevent double execution
    if (this.isClosing) {
      console.log('⚠️ Close already in progress, ignoring...');
      return;
    }

    this.isClosing = true;
    console.log('🔒 Closing Virtual Data Modal...');

    const modal = document.getElementById('virtualDataModal');
    if (modal) {
      modal.remove();
      console.log('✅ Virtual Data Modal closed and removed from DOM');
    } else {
      console.log('⚠️ Modal already removed or not found');
    }

    // Redirect back to events page
    console.log('🔙 Redirecting to events page...');
    window.location.href = 'display.html';

    // Reset closing flag after a short delay
    setTimeout(() => {
      this.isClosing = false;
    }, 300);
  }
}

// Make available globally
window.VirtualDataModal = VirtualDataModal;