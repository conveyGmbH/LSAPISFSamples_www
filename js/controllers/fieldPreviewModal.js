// fieldPreviewModal.js - Preview configured fields before transfer
import fakeDataGenerator from '../services/fakeDataGenerator.js';

/**
 * Show field preview modal before transfer
 * @param {Object} leadData - Lead data to be transferred
 * @param {Array} configuredFields - List of configured active fields
 * @param {Function} onConfirm - Callback when user confirms transfer
 * @param {Function} onCancel - Callback when user cancels
 */
export function showFieldPreviewModal(leadData, configuredFields, onConfirm, onCancel) {
    return new Promise((resolve) => {
        // Check for empty required fields
        const requiredFields = ['LastName', 'Company'];
        const emptyCheck = fakeDataGenerator.checkEmptyFields(leadData, requiredFields);

        // Filter lead data to only include configured fields
        const filteredData = {};
        for (const fieldName of configuredFields) {
            if (leadData.hasOwnProperty(fieldName)) {
                filteredData[fieldName] = leadData[fieldName];
            }
        }

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'field-preview-modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            padding: 20px;
            animation: fadeIn 0.2s ease-out;
        `;

        // Count active fields
        const activeFieldsCount = configuredFields.length;
        const totalAvailableFields = Object.keys(leadData).length;

        // Create field list HTML
        const fieldsHTML = configuredFields.map(fieldName => {
            const value = leadData[fieldName];
            const isEmpty = fakeDataGenerator.isEmpty(value);
            const isRequired = requiredFields.includes(fieldName);
            const displayValue = isEmpty ?
                (isRequired ? '⚠️ Empty (will be auto-filled)' : '<em>Empty</em>') :
                String(value);

            return `
                <div class="preview-field-row ${isEmpty && isRequired ? 'warning' : ''}"
                     style="display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid #e2e8f0; ${isEmpty && isRequired ? 'background: #fffbeb;' : ''}">
                    <div style="font-weight: 600; color: #374151; display: flex; align-items: center; gap: 8px;">
                        ${fieldName}
                        ${isRequired ? '<span style="background: #f59e0b; color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px;">REQUIRED</span>' : ''}
                    </div>
                    <div style="color: #6b7280; text-align: right; max-width: 50%; overflow: hidden; text-overflow: ellipsis;">
                        ${displayValue}
                    </div>
                </div>
            `;
        }).join('');

        modal.innerHTML = `
            <div style="background: white; border-radius: 16px; max-width: 700px; width: 100%; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); animation: slideUp 0.3s ease-out;">
                <!-- Header -->
                <div style="padding: 24px; border-bottom: 2px solid #e5e7eb; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-top-left-radius: 16px; border-top-right-radius: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                        </svg>
                        <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: white;">Transfer Preview</h2>
                    </div>
                    <p style="margin: 0; color: rgba(255, 255, 255, 0.9); font-size: 14px;">
                        Review the fields that will be transferred to Salesforce
                    </p>
                </div>

                <!-- Statistics Cards -->
                <div style="padding: 20px; background: #f9fafb; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                    <div style="background: white; padding: 16px; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
                        <div style="font-size: 28px; font-weight: 700; color: #667eea; margin-bottom: 4px;">${activeFieldsCount}</div>
                        <div style="font-size: 12px; color: #6b7280; font-weight: 600;">Active Fields</div>
                    </div>
                    <div style="background: white; padding: 16px; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
                        <div style="font-size: 28px; font-weight: 700; color: #10b981; margin-bottom: 4px;">${totalAvailableFields}</div>
                        <div style="font-size: 12px; color: #6b7280; font-weight: 600;">Total Available</div>
                    </div>
                    <div style="background: white; padding: 16px; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
                        <div style="font-size: 28px; font-weight: 700; color: ${emptyCheck.hasEmpty ? '#f59e0b' : '#10b981'}; margin-bottom: 4px;">${emptyCheck.emptyFields.length}</div>
                        <div style="font-size: 12px; color: #6b7280; font-weight: 600;">Empty Fields</div>
                    </div>
                </div>

                ${emptyCheck.hasEmpty ? `
                <!-- Warning Banner -->
                <div style="margin: 0 20px; padding: 16px; background: #fffbeb; border: 1px solid #fbbf24; border-radius: 8px; display: flex; gap: 12px; align-items: start;">
                    <svg width="24" height="24" viewBox="0 0 20 20" fill="#f59e0b">
                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                    </svg>
                    <div style="flex: 1;">
                        <div style="font-weight: 700; color: #92400e; margin-bottom: 4px;">Empty Required Fields Detected</div>
                        <div style="font-size: 13px; color: #78350f;">
                            The following required fields are empty: <strong>${emptyCheck.emptyFields.join(', ')}</strong>.
                            They will be automatically filled with realistic placeholder data to ensure successful transfer.
                        </div>
                    </div>
                </div>
                ` : ''}

                <!-- Fields List -->
                <div style="flex: 1; overflow-y: auto; padding: 20px;">
                    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                        <div style="background: #f3f4f6; padding: 12px 16px; border-bottom: 2px solid #e2e8f0;">
                            <div style="font-weight: 700; color: #1f2937; font-size: 14px;">Fields to Transfer</div>
                        </div>
                        <div style="max-height: 300px; overflow-y: auto;">
                            ${fieldsHTML}
                        </div>
                    </div>

                    <!-- Custom Fields Section (Future enhancement) -->
                    <div style="margin-top: 16px; padding: 16px; background: #f0fdf4; border: 1px dashed #86efac; border-radius: 8px; text-align: center;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" style="margin: 0 auto 8px;">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="8" x2="12" y2="16"/>
                            <line x1="8" y1="12" x2="16" y2="12"/>
                        </svg>
                        <div style="font-size: 13px; color: #166534; font-weight: 600; margin-bottom: 4px;">Add Custom Fields</div>
                        <div style="font-size: 12px; color: #15803d;">
                            Use the Field Configurator to add custom fields before transfer
                        </div>
                    </div>
                </div>

                <!-- Footer Actions -->
                <div style="padding: 20px; border-top: 1px solid #e5e7eb; background: #f9fafb; border-bottom-left-radius: 16px; border-bottom-right-radius: 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                    <button id="open-configurator-btn" style="padding: 10px 20px; border: 1px solid #d1d5db; background: white; color: #374151; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; transition: all 0.2s; display: flex; align-items: center; gap: 8px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M12 1v6m0 6v6m9-9h-6m-6 0H3"/>
                        </svg>
                        Configure Fields
                    </button>
                    <div style="display: flex; gap: 12px;">
                        <button id="cancel-transfer-btn" style="padding: 10px 24px; border: 1px solid #d1d5db; background: white; color: #374151; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; transition: all 0.2s;">
                            Cancel
                        </button>
                        <button id="confirm-transfer-btn" style="padding: 10px 24px; border: none; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; transition: all 0.2s; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);">
                            Confirm Transfer
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Add CSS animations
        if (!document.getElementById('modal-animations')) {
            const style = document.createElement('style');
            style.id = 'modal-animations';
            style.textContent = `
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(modal);

        // Event listeners
        const confirmBtn = modal.querySelector('#confirm-transfer-btn');
        const cancelBtn = modal.querySelector('#cancel-transfer-btn');
        const configuratorBtn = modal.querySelector('#open-configurator-btn');

        confirmBtn.addEventListener('click', () => {
            modal.remove();
            resolve(true);
            if (onConfirm) onConfirm(filteredData, emptyCheck);
        });

        cancelBtn.addEventListener('click', () => {
            modal.remove();
            resolve(false);
            if (onCancel) onCancel();
        });

        configuratorBtn.addEventListener('click', () => {
            modal.remove();
            // Navigate to field configurator
            window.location.href = 'fieldConfigurator.html';
        });

        // Hover effects
        confirmBtn.addEventListener('mouseenter', () => {
            confirmBtn.style.transform = 'translateY(-2px)';
            confirmBtn.style.boxShadow = '0 6px 12px rgba(102, 126, 234, 0.4)';
        });
        confirmBtn.addEventListener('mouseleave', () => {
            confirmBtn.style.transform = 'translateY(0)';
            confirmBtn.style.boxShadow = '0 4px 6px rgba(102, 126, 234, 0.3)';
        });

        cancelBtn.addEventListener('mouseenter', () => {
            cancelBtn.style.background = '#f3f4f6';
        });
        cancelBtn.addEventListener('mouseleave', () => {
            cancelBtn.style.background = 'white';
        });

        configuratorBtn.addEventListener('mouseenter', () => {
            configuratorBtn.style.background = '#f3f4f6';
        });
        configuratorBtn.addEventListener('mouseleave', () => {
            configuratorBtn.style.background = 'white';
        });

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(false);
                if (onCancel) onCancel();
            }
        });
    });
}

// Make available globally
window.showFieldPreviewModal = showFieldPreviewModal;

export default showFieldPreviewModal;
