// transferWithPreview.js - Integration layer for field preview and fake data generation
import { showFieldPreviewModal } from './fieldPreviewModal.js';
import fakeDataGenerator from '../services/fakeDataGenerator.js';

/**
 * Enhanced transfer flow with preview and fake data generation
 * This wraps the existing transfer logic with preview modal and auto-fill capabilities
 *
 * @param {Object} leadData - Lead data to transfer
 * @param {Object} fieldMappingService - Field mapping service instance
 * @param {Function} transferFunction - Original transfer function to call after preview
 * @returns {Promise} Transfer result
 */
export async function transferLeadWithPreview(leadData, fieldMappingService, transferFunction) {
    try {
        console.log('🎬 Starting enhanced transfer flow with preview...');

        // STEP 1: Get configured active fields
        const activeFields = fieldMappingService ?
            fieldMappingService.getActiveFieldNames() :
            Object.keys(leadData);

        console.log(`📋 Active fields configured: ${activeFields.length}`);

        // STEP 2: Filter lead data to only include active fields
        const filteredLeadData = {};
        for (const fieldName of activeFields) {
            if (leadData.hasOwnProperty(fieldName)) {
                // Handle both object format (with .value) and primitive values
                if (typeof leadData[fieldName] === 'object' && leadData[fieldName].hasOwnProperty('value')) {
                    filteredLeadData[fieldName] = leadData[fieldName].value;
                } else {
                    filteredLeadData[fieldName] = leadData[fieldName];
                }
            }
        }

        // STEP 3: Check for empty required fields
        const requiredFields = ['LastName', 'Company'];
        const emptyCheck = fakeDataGenerator.checkEmptyFields(filteredLeadData, requiredFields);

        console.log(`🔍 Empty fields check:`, emptyCheck);

        // STEP 4: Show preview modal
        const confirmed = await showFieldPreviewModal(
            filteredLeadData,
            activeFields,
            async (data, emptyInfo) => {
                console.log('✅ User confirmed transfer');
                await proceedWithTransfer(data, emptyInfo, transferFunction);
            },
            () => {
                console.log('❌ User cancelled transfer');
            }
        );

        return confirmed;

    } catch (error) {
        console.error('❌ Error in transfer with preview:', error);
        throw error;
    }
}

/**
 * Proceed with actual transfer after user confirmation
 */
async function proceedWithTransfer(leadData, emptyCheck, transferFunction) {
    try {
        console.log('🚀 Proceeding with transfer...');

        // Generate fake data for empty required fields if needed
        let finalLeadData = leadData;
        if (emptyCheck.hasEmpty) {
            console.log('🎭 Generating fake data for empty required fields...');
            const result = fakeDataGenerator.fillEmptyFields(leadData, emptyCheck.emptyFields);
            finalLeadData = result.data;

            if (result.filledFields.length > 0) {
                console.log(`✅ Auto-filled ${result.filledFields.length} fields:`, result.filledFields);
            }
        }

        // Call the original transfer function
        if (transferFunction) {
            await transferFunction(finalLeadData);
        }

    } catch (error) {
        console.error('❌ Error during transfer:', error);
        throw error;
    }
}

/**
 * Quick transfer without preview (for backwards compatibility)
 * Just applies fake data generation if needed
 */
export function applyFakeDataIfNeeded(leadData, requiredFields = ['LastName', 'Company']) {
    const result = fakeDataGenerator.fillEmptyFields(leadData, requiredFields);
    return result.data;
}

/**
 * Check if lead data needs fake data generation
 */
export function needsFakeData(leadData, requiredFields = ['LastName', 'Company']) {
    return fakeDataGenerator.checkEmptyFields(leadData, requiredFields).hasEmpty;
}

// Make available globally
window.transferLeadWithPreview = transferLeadWithPreview;
window.applyFakeDataIfNeeded = applyFakeDataIfNeeded;
window.needsFakeData = needsFakeData;

export default {
    transferLeadWithPreview,
    applyFakeDataIfNeeded,
    needsFakeData
};
