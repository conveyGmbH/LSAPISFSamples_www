// batchTransferModals.js - Progress and summary modals for batch 

(function() {
    'use strict';

    // Status colors
    const STATUS_COLORS = {
        success: '#10b981',
        failed: '#ef4444',
        duplicate: '#f59e0b',
        skipped: '#6b7280'
    };

    const STATUS_ICONS = {
        success: '&#10003;',
        failed: '&#10007;',
        duplicate: '&#9888;',
        skipped: '&#8212;'
    };

    /**
     * Show batch progress modal
     * Returns control object { updateProgress, updateLeadStatus, close }
     */
    function showBatchProgressModal(totalCount) {
        const modal = document.createElement('div');
        modal.id = 'batch-progress-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.6); display: flex; align-items: center;
            justify-content: center; z-index: 10001;
        `;

        modal.innerHTML = `
            <div style="background: white; border-radius: 12px; padding: 32px; width: 550px; max-width: 95vw; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; font-size: 20px; color: #111827;">Batch Transfer</h2>
                    <span id="batch-progress-counter" style="font-size: 14px; color: #6b7280;">0 / ${totalCount}</span>
                </div>

                <!-- Current lead info -->
                <div id="batch-current-lead" style="background: #f3f4f6; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 14px; color: #374151;">
                    Preparing...
                </div>

                <!-- Progress bar -->
                <div style="background: #e5e7eb; border-radius: 9999px; height: 8px; margin-bottom: 20px; overflow: hidden;">
                    <div id="batch-progress-bar" style="background: #2563eb; height: 100%; width: 0%; border-radius: 9999px; transition: width 0.3s ease;"></div>
                </div>

                <!-- Results list -->
                <div id="batch-results-list" style="flex: 1; overflow-y: auto; max-height: 300px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 16px;">
                </div>

                <!-- Cancel button -->
                <div style="text-align: center;">
                    <button id="batch-cancel-btn" style="
                        padding: 10px 32px; border: 2px solid #dc2626; background: white; color: #dc2626;
                        border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
                        transition: all 0.2s;
                    ">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Wire up cancel button
        const cancelBtn = modal.querySelector('#batch-cancel-btn');
        cancelBtn.addEventListener('click', () => {
            if (window.batchTransferService) {
                window.batchTransferService.cancelBatch();
            }
            cancelBtn.textContent = 'Cancelling...';
            cancelBtn.disabled = true;
            cancelBtn.style.opacity = '0.5';
        });
        cancelBtn.addEventListener('mouseenter', () => {
            if (!cancelBtn.disabled) {
                cancelBtn.style.background = '#dc2626';
                cancelBtn.style.color = 'white';
            }
        });
        cancelBtn.addEventListener('mouseleave', () => {
            if (!cancelBtn.disabled) {
                cancelBtn.style.background = 'white';
                cancelBtn.style.color = '#dc2626';
            }
        });

        return {
            modal,

            updateProgress(current, total, leadName) {
                const counter = modal.querySelector('#batch-progress-counter');
                const bar = modal.querySelector('#batch-progress-bar');
                const currentLead = modal.querySelector('#batch-current-lead');

                if (counter) counter.textContent = `${current} / ${total}`;
                if (bar) bar.style.width = `${(current / total) * 100}%`;
                if (currentLead) currentLead.textContent = `Transferring: ${leadName}`;
            },

            updateLeadStatus(result) {
                const list = modal.querySelector('#batch-results-list');
                if (!list) return;

                const color = STATUS_COLORS[result.status] || '#6b7280';
                const icon = STATUS_ICONS[result.status] || '?';

                const entry = document.createElement('div');
                entry.style.cssText = `
                    display: flex; align-items: center; gap: 10px; padding: 8px 12px;
                    border-bottom: 1px solid #f3f4f6; font-size: 13px;
                `;
                const errorMsg = (result.status === 'failed' && result.message) ? `<div style="font-size: 11px; color: #ef4444; margin-top: 2px; white-space: normal;">${escapeHtml(result.message)}</div>` : '';
                entry.innerHTML = `
                    <span style="width: 22px; height: 22px; border-radius: 50%; background: ${color}; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0;">${icon}</span>
                    <div style="flex: 1; min-width: 0;">
                        <div style="color: #111827; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(result.displayName)}</div>
                        ${errorMsg}
                    </div>
                    <span style="color: ${color}; font-weight: 500; font-size: 12px; flex-shrink: 0;">${result.status}</span>
                    <span style="color: #9ca3af; font-size: 11px; flex-shrink: 0;">${result.milliseconds ? (result.milliseconds / 1000).toFixed(1) + 's' : ''}</span>
                `;

                list.appendChild(entry);
                list.scrollTop = list.scrollHeight;
            },

            close() {
                if (modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
            }
        };
    }

    /**
     * Show batch summary modal after transfer completes
     */
    function showBatchSummaryModal(summary) {
        const modal = document.createElement('div');
        modal.id = 'batch-summary-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.6); display: flex; align-items: center;
            justify-content: center; z-index: 10002;
        `;

        const totalSeconds = (summary.totalMs / 1000).toFixed(1);

        // Determine overall status color
        let headerColor = '#10b981'; // green
        let headerText = 'Batch Transfer Complete';
        if (summary.cancelled) {
            headerColor = '#f59e0b';
            headerText = 'Batch Transfer Cancelled';
        } else if (summary.failedCount > 0 && summary.successCount === 0) {
            headerColor = '#ef4444';
            headerText = 'Batch Transfer Failed';
        } else if (summary.failedCount > 0) {
            headerColor = '#f59e0b';
            headerText = 'Batch Transfer Partial';
        }

        modal.innerHTML = `
            <div style="background: white; border-radius: 12px; width: 550px; max-width: 95vw; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.3); overflow: hidden;">
                <!-- Header -->
                <div style="background: ${headerColor}; color: white; padding: 20px 28px;">
                    <h2 style="margin: 0; font-size: 20px;">${headerText}</h2>
                    <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.9;">${summary.total} leads processed in ${totalSeconds}s</p>
                </div>

                <!-- Stats row -->
                <div style="display: flex; gap: 0; border-bottom: 1px solid #e5e7eb;">
                    ${buildStatBox('Success', summary.successCount, '#10b981')}
                    ${buildStatBox('Failed', summary.failedCount, '#ef4444')}
                    ${buildStatBox('Duplicate', summary.duplicateCount, '#f59e0b')}
                    ${buildStatBox('Skipped', summary.skippedCount, '#6b7280')}
                </div>

                <!-- Details list -->
                <div style="flex: 1; overflow-y: auto; max-height: 350px; padding: 8px 0;">
                    ${summary.results.map(r => buildResultRow(r)).join('')}
                </div>

                <!-- Close button -->
                <div style="padding: 16px 28px; border-top: 1px solid #e5e7eb; text-align: center;">
                    <button id="batch-summary-close" style="
                        padding: 10px 40px; background: #2563eb; color: white; border: none;
                        border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
                        transition: background 0.2s;
                    ">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const closeBtn = modal.querySelector('#batch-summary-close');
        closeBtn.addEventListener('click', () => {
            if (modal.parentNode) modal.parentNode.removeChild(modal);
            window.location.reload();
        });
        closeBtn.addEventListener('mouseenter', () => { closeBtn.style.background = '#1d4ed8'; });
        closeBtn.addEventListener('mouseleave', () => { closeBtn.style.background = '#2563eb'; });

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
                window.location.reload();
            }
        });

        return modal;
    }

    function buildStatBox(label, count, color) {
        return `
            <div style="flex: 1; text-align: center; padding: 16px 8px; border-right: 1px solid #e5e7eb;">
                <div style="font-size: 28px; font-weight: 700; color: ${color};">${count}</div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${label}</div>
            </div>
        `;
    }

    function buildResultRow(result) {
        const color = STATUS_COLORS[result.status] || '#6b7280';
        const icon = STATUS_ICONS[result.status] || '?';
        const time = result.milliseconds ? `${(result.milliseconds / 1000).toFixed(1)}s` : '';
        const sfId = result.salesforceId ? `<span style="color: #9ca3af; font-size: 11px;">SF: ${result.salesforceId}</span>` : '';
        const msg = result.message ? `<span style="color: #9ca3af; font-size: 11px;">${escapeHtml(result.message)}</span>` : '';

        return `
            <div style="display: flex; align-items: center; gap: 10px; padding: 8px 20px; border-bottom: 1px solid #f9fafb;">
                <span style="width: 22px; height: 22px; border-radius: 50%; background: ${color}; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0;">${icon}</span>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 13px; color: #111827; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(result.displayName)}</div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">${sfId}${msg}</div>
                </div>
                <span style="color: ${color}; font-weight: 500; font-size: 12px; flex-shrink: 0;">${result.status}</span>
                <span style="color: #d1d5db; font-size: 11px; flex-shrink: 0; min-width: 35px; text-align: right;">${time}</span>
            </div>
        `;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * Show a confirmation modal 
     * Returns a Promise that resolves to true (OK) or false (Cancel)
     */
    function showConfirmModal(message, { 
        title = 'Confirm', 
        okText = 'OK', 
        cancelText = 'Cancel', 
        okColor = '#2563eb' } = {}) {

        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.5); display: flex; align-items: center;
                justify-content: center; z-index: 10003;
            `;

            modal.innerHTML = `
                <div style="background: white; border-radius: 12px; padding: 28px; width: 420px; max-width: 90vw; box-shadow: 0 20px 40px rgba(0,0,0,0.25);">
                    <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #111827;">${escapeHtml(title)}</h3>
                    <p style="margin: 0 0 24px 0; font-size: 14px; color: #4b5563; line-height: 1.5; white-space: pre-line;">${escapeHtml(message)}</p>
                    <div style="display: flex; justify-content: flex-end; gap: 10px;">
                        <button id="confirm-cancel-btn" style="
                            padding: 10px 24px; border: 1px solid #d1d5db; background: white; color: #374151;
                            border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
                        ">${escapeHtml(cancelText)}</button>
                        <button id="confirm-ok-btn" style="
                            padding: 10px 24px; border: none; background: ${okColor}; color: white;
                            border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
                        ">${escapeHtml(okText)}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const cleanup = (result) => {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
                resolve(result);
            };

            modal.querySelector('#confirm-ok-btn').addEventListener('click', () => cleanup(true));
            modal.querySelector('#confirm-cancel-btn').addEventListener('click', () => cleanup(false));
            modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(false); });
        });
    }

    /**
     * Show an alert modal 
     * Returns a Promise that resolves when closed
     */
    function showAlertModal(message, { title = 'Notice', okText = 'OK', color = '#2563eb' } = {}) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.5); display: flex; align-items: center;
                justify-content: center; z-index: 10003;
            `;

            modal.innerHTML = `
                <div style="background: white; border-radius: 12px; padding: 28px; width: 420px; max-width: 90vw; box-shadow: 0 20px 40px rgba(0,0,0,0.25);">
                    <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #111827;">${escapeHtml(title)}</h3>
                    <p style="margin: 0 0 24px 0; font-size: 14px; color: #4b5563; line-height: 1.5;">${escapeHtml(message)}</p>
                    <div style="text-align: right;">
                        <button id="alert-ok-btn" style="
                            padding: 10px 32px; border: none; background: ${color}; color: white;
                            border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
                        ">${escapeHtml(okText)}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const cleanup = () => {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
                resolve();
            };

            modal.querySelector('#alert-ok-btn').addEventListener('click', cleanup);
            modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(); });
        });
    }

    // Expose on window
    window.batchTransferModals = {
        showBatchProgressModal,
        showBatchSummaryModal,
        showConfirmModal,
        showAlertModal
    };

})();
