// transferModals.js - Modal dialogs for lead transfer process

/**
 * Show loading modal during transfer operations
 */
function showTransferLoadingModal(message = 'Processing...') {
    const modal = document.createElement('div');
    modal.className = 'transfer-loading-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    modal.innerHTML = `
        <div style="background: white; border-radius: 12px; padding: 32px; text-align: center; min-width: 300px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);">
            <div style="margin-bottom: 16px;">
                <svg style="width: 64px; height: 64px; color: #3b82f6; animation: spin 1s linear infinite;" viewBox="0 0 24 24">
                    <circle style="opacity: 0.25;" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                    <path style="opacity: 0.75;" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            </div>
            <p style="font-size: 16px; font-weight: 600; color: #111827; margin: 0;">${message}</p>
        </div>
    `;

    // Add CSS animation
    if (!document.getElementById('spinner-animation-style')) {
        const style = document.createElement('style');
        style.id = 'spinner-animation-style';
        style.textContent = `
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(modal);
    return modal;
}

/**
 * Show confirmation modal for field creation
 * Returns a Promise that resolves to true/false based on user choice
 */
function showFieldCreationConfirmationModal(missingFields, labels, totalFields) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'transfer-loading-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            padding: 20px;
        `;

        // Group fields by type
        const fieldList = missingFields.map(fieldName => {
            const label = labels[fieldName] || fieldName;
            return { name: fieldName, label };
        });

        modal.innerHTML = `
            <div style="background: white; border-radius: 12px; padding: 0; max-width: 600px; width: 100%; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);">
                <!-- Header -->
                <div style="padding: 24px; border-bottom: 1px solid #e5e7eb;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                        <svg style="width: 24px; height: 24px; color: #f59e0b;" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                        </svg>
                        <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: #111827;">Create Custom Salesforce Fields</h2>
                    </div>
                    <p style="margin: 0; color: #6b7280; font-size: 14px;">
                        The following custom fields don't exist in Salesforce yet and will be created automatically as <strong>Text</strong> fields (255 characters).
                    </p>
                </div>

                <!-- Field List -->
                <div style="flex: 1; overflow-y: auto; padding: 24px;">
                    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <span style="font-weight: 600; color: #374151; font-size: 14px;">Fields to Create</span>
                            <span style="background: #3b82f6; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">${missingFields.length}</span>
                        </div>
                        <div style="max-height: 300px; overflow-y: auto; background: white; border-radius: 6px; padding: 12px;">
                            ${fieldList.map(f => `
                                <div style="display: flex; align-items: start; gap: 8px; padding: 8px; border-bottom: 1px solid #f3f4f6; last-child:border-bottom: none;">
                                    <svg style="width: 16px; height: 16px; color: #10b981; flex-shrink: 0; margin-top: 2px;" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-weight: 600; color: #111827; font-size: 13px; font-family: 'Courier New', monospace;">${f.name}</div>
                                        ${f.label !== f.name ? `<div style="color: #6b7280; font-size: 12px; margin-top: 2px;">Display: ${f.label}</div>` : ''}
                                    </div>
                                    <span style="background: #e0e7ff; color: #4f46e5; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500; white-space: nowrap;">Text (255)</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div style="background: #eff6ff; border: 1px solid #dbeafe; border-radius: 8px; padding: 12px;">
                        <div style="display: flex; gap: 8px;">
                            <svg style="width: 20px; height: 20px; color: #3b82f6; flex-shrink: 0;" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                            </svg>
                            <div style="flex: 1;">
                                <strong style="color: #1e40af; font-size: 13px; display: block; margin-bottom: 4px;">Transfer Summary</strong>
                                <ul style="margin: 0; padding-left: 16px; color: #1e3a8a; font-size: 12px;">
                                    <li>Total active fields: <strong>${totalFields}</strong></li>
                                    <li>New fields to create: <strong>${missingFields.length}</strong></li>
                                    <li>Existing fields: <strong>${totalFields - missingFields.length}</strong></li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div style="padding: 20px 24px; border-top: 1px solid #e5e7eb; background: #f9fafb; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; display: flex; justify-content: flex-end; gap: 12px;">
                    <button id="cancel-field-creation" style="padding: 10px 20px; border: 1px solid #d1d5db; background: white; color: #374151; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px; transition: all 0.2s;">
                        Cancel
                    </button>
                    <button id="confirm-field-creation" style="padding: 10px 20px; border: none; background: #3b82f6; color: white; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px; transition: all 0.2s; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);">
                        Create Fields & Transfer
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        const confirmBtn = modal.querySelector('#confirm-field-creation');
        const cancelBtn = modal.querySelector('#cancel-field-creation');

        confirmBtn.addEventListener('click', () => {
            modal.remove();
            resolve(true);
        });

        cancelBtn.addEventListener('click', () => {
            modal.remove();
            resolve(false);
        });

        // Hover effects
        cancelBtn.addEventListener('mouseenter', () => {
            cancelBtn.style.background = '#f3f4f6';
        });
        cancelBtn.addEventListener('mouseleave', () => {
            cancelBtn.style.background = 'white';
        });

        confirmBtn.addEventListener('mouseenter', () => {
            confirmBtn.style.background = '#2563eb';
        });
        confirmBtn.addEventListener('mouseleave', () => {
            confirmBtn.style.background = '#3b82f6';
        });
    });
}

/**
 * Show error modal
 */
function showErrorModal(title, message) {
    const modal = document.createElement('div');
    modal.className = 'transfer-loading-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 20px;
    `;

    modal.innerHTML = `
        <div style="background: white; border-radius: 12px; padding: 0; max-width: 500px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);">
            <div style="padding: 24px; border-bottom: 1px solid #e5e7eb;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 48px; height: 48px; background: #fee2e2; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <svg style="width: 24px; height: 24px; color: #dc2626;" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                        </svg>
                    </div>
                    <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #111827;">${title}</h2>
                </div>
            </div>
            <div style="padding: 24px;">
                <p style="margin: 0; color: #374151; font-size: 14px; white-space: pre-wrap; line-height: 1.5;">${message}</p>
            </div>
            <div style="padding: 16px 24px; border-top: 1px solid #e5e7eb; background: #f9fafb; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; display: flex; justify-content: flex-end;">
                <button id="close-error-modal" style="padding: 10px 20px; border: none; background: #dc2626; color: white; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px; transition: background 0.2s;">
                    Close
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('#close-error-modal');
    closeBtn.addEventListener('click', () => modal.remove());
    closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.background = '#b91c1c';
    });
    closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.background = '#dc2626';
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

/**
 * Show success modal
 */
function showSuccessModal(title, message) {
    const modal = document.createElement('div');
    modal.className = 'transfer-loading-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 20px;
    `;

    modal.innerHTML = `
        <div style="background: white; border-radius: 12px; padding: 0; max-width: 500px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);">
            <div style="padding: 24px; border-bottom: 1px solid #e5e7eb;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 48px; height: 48px; background: #d1fae5; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <svg style="width: 24px; height: 24px; color: #059669;" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                        </svg>
                    </div>
                    <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #111827;">${title}</h2>
                </div>
            </div>
            <div style="padding: 24px;">
                <p style="margin: 0; color: #374151; font-size: 14px; white-space: pre-wrap; line-height: 1.5;">${message}</p>
            </div>
            <div style="padding: 16px 24px; border-top: 1px solid #e5e7eb; background: #f9fafb; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; display: flex; justify-content: flex-end;">
                <button id="close-success-modal" style="padding: 10px 20px; border: none; background: #059669; color: white; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px; transition: background 0.2s;">
                    Close
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('#close-success-modal');
    closeBtn.addEventListener('click', () => modal.remove());
    closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.background = '#047857';
    });
    closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.background = '#059669';
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// Make functions available globally immediately (not waiting for DOMContentLoaded)
window.showTransferLoadingModal = showTransferLoadingModal;
window.showFieldCreationConfirmationModal = showFieldCreationConfirmationModal;
window.showErrorModal = showErrorModal;
window.showSuccessModal = showSuccessModal;

// Log for debugging
console.log('✅ transferModals.js loaded - showErrorModal available:', typeof window.showErrorModal);
