


function extractCustomFieldsFromLeadData(leadData, activeFields = null) {
    const customFields = [];
    const customFieldPattern = /^(Question|Answers|Text)\d{2}(__c)?$/;

    for (const [fieldName, value] of Object.entries(leadData)) {
        // Remove __c suffix for checking if present
        const baseFieldName = fieldName.replace(/__c$/, '');

        // Check if field is active (if activeFields provided)
        if (activeFields && activeFields.length > 0) {
            const isActive = activeFields.includes(fieldName) || activeFields.includes(baseFieldName);
            if (!isActive) {
                console.log(`⏭️  Skipping inactive field: ${fieldName}`);
                continue;
            }
        }

        // Check if it's a Question/Answers/Text field
        // IMPORTANT: Include fields with null values if they are active
        // This allows clearing field values in Salesforce
        if (customFieldPattern.test(fieldName)) {
            // Add __c suffix if not already present
            const sfFieldName = fieldName.endsWith('__c') ? fieldName : `${fieldName}__c`;
            customFields.push({
                apiName: sfFieldName,
                originalName: baseFieldName,
                value: value !== undefined ? value : null,  // Keep null values
                label: baseFieldName.replace(/([A-Z])/g, ' $1').trim() // Convert "Question01" to "Question 01"
            });
        }
    }

    return customFields;
}

/**
 * Check which custom fields exist in Salesforce
 * @param {Object} conn - Salesforce connection
 * @param {Array} fieldNames - Array of field names to check
 * @returns {Promise<Object>} Object with existing and missing field arrays
 */
async function checkFieldsExistence(conn, fieldNames) {
    try {
        // Get Lead object metadata
        const metadata = await conn.describe('Lead');
        const existingFields = new Set(metadata.fields.map(f => f.name));

        const existing = [];
        const missing = [];

        for (const fieldName of fieldNames) {
            if (existingFields.has(fieldName)) {
                existing.push(fieldName);
            } else {
                missing.push(fieldName);
            }
        }

        return { existing, missing };
    } catch (error) {
        console.error('Error checking field existence:', error);
        throw error;
    }
}


/**
 * Transfer lead with automatic field creation
 * @param {Object} conn - Salesforce connection
 * @param {Object} leadData - Lead data to transfer
 * @param {Array} activeFields - Array of active field names for this client
 * @param {Array} attachments - Optional attachments
 * @returns {Promise<Object>} Transfer results
 */
async function transferLeadWithAutoFieldCreation(conn, leadData, activeFields = null, attachments = []) {
    try {
        console.log('🚀 Starting lead transfer with auto field creation');
        console.log(`📋 Active fields for this client: ${activeFields ? activeFields.length : 'all'}`);

        // Step 1: Extract custom fields from lead data (only active ones)
        const customFieldsInData = extractCustomFieldsFromLeadData(leadData, activeFields);
        console.log(`📋 Found ${customFieldsInData.length} active custom fields in lead data:`, customFieldsInData.map(f => f.apiName));

        if (customFieldsInData.length === 0) {
            console.log('ℹ️  No custom fields to process, proceeding with standard transfer');
        } else {
            // Step 2: Check which fields exist in Salesforce
            const fieldNames = customFieldsInData.map(f => f.apiName);
            const { existing, missing } = await checkFieldsExistence(conn, fieldNames);

            console.log(`✅ Existing fields (${existing.length}):`, existing);
            console.log(`❓ Missing fields (${missing.length}):`, missing);

            // Step 3: Missing fields are NOT created automatically. The customer creates
            // their own custom fields in their Salesforce org. If an active mapped field
            // does not exist, the transfer must fail with a clear message — otherwise
            // Salesforce silently drops the unknown field and the lead looks "transferred"
            // while the value was never written.
            if (missing.length > 0) {
                console.warn(`🚫 Transfer blocked — ${missing.length} active field(s) do not exist in Salesforce:`, missing);
                return {
                    step: 'missing_fields',
                    readyForTransfer: false,
                    missingFields: missing,
                    existingFields: existing,
                    message: `The following field(s) do not exist in your Salesforce org and must be created there first: ${missing.join(', ')}`
                };
            }
        }

        // If we reach here, all fields exist or were created successfully
        return {
            step: 'ready_for_transfer',
            customFields: customFieldsInData,
            message: 'All required fields exist, ready to transfer lead'
        };

    } catch (error) {
        console.error('❌ Error in transferLeadWithAutoFieldCreation:', error);
        throw error;
    }
}

module.exports = {
    extractCustomFieldsFromLeadData,
    checkFieldsExistence,
    transferLeadWithAutoFieldCreation
};
