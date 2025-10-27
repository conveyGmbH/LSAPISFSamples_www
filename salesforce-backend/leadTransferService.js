// Lead Transfer Service with Auto Field Creation
// This service handles the complete lead transfer process:
// 1. Identify non-null custom fields from lead data
// 2. Check which fields exist in Salesforce
// 3. Create missing fields automatically
// 4. Transfer the lead

/**
 * Extract custom field names from lead data
 * Only includes Question, Answers, and Text fields with non-null values AND active status
 * @param {Object} leadData - The lead data object
 * @param {Array} activeFields - Array of active field names (optional)
 * @returns {Array} Array of custom field names (e.g., ['Question01__c', 'Answers01__c'])
 */
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
 * Create missing custom fields in Salesforce
 * @param {Object} conn - Salesforce connection
 * @param {Array} fields - Array of field objects to create
 * @returns {Promise<Object>} Creation results
 */
async function createMissingFields(conn, fields) {
    const results = {
        created: [],
        failed: [],
        skipped: []
    };

    for (const field of fields) {
        try {
            const customField = {
                fullName: `Lead.${field.apiName}`,
                label: field.label,
                type: 'Text',
                length: 255,
                required: false,
                externalId: false,
                unique: false
            };

            console.log(`🔧 Creating field: Lead.${field.apiName} (${customField.label})`);

            const result = await conn.metadata.create('CustomField', [customField]);
            const fieldResult = Array.isArray(result) ? result[0] : result;

            if (fieldResult.success) {
                results.created.push({
                    apiName: field.apiName,
                    label: customField.label,
                    success: true
                });
                console.log(`✅ Field created: ${field.apiName}`);
            } else {
                // Check if it's a duplicate error (field already exists)
                const isDuplicate = fieldResult.errors && fieldResult.errors.some(e =>
                    e.statusCode === 'DUPLICATE_VALUE' || e.message.includes('already')
                );

                if (isDuplicate) {
                    results.skipped.push({
                        apiName: field.apiName,
                        label: customField.label,
                        reason: 'Field already exists'
                    });
                    console.log(`⏭️  Field already exists: ${field.apiName}`);
                } else {
                    results.failed.push({
                        apiName: field.apiName,
                        label: customField.label,
                        error: fieldResult.errors ? JSON.stringify(fieldResult.errors) : 'Unknown error'
                    });
                    console.error(`❌ Field creation failed: ${field.apiName}`, fieldResult.errors);
                }
            }
        } catch (fieldError) {
            results.failed.push({
                apiName: field.apiName,
                label: field.label,
                error: fieldError.message
            });
            console.error(`❌ Field creation error: ${field.apiName}`, fieldError);
        }
    }

    return results;
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

            // Step 3: Create missing fields if any
            if (missing.length > 0) {
                const fieldsToCreate = customFieldsInData.filter(f => missing.includes(f.apiName));

                console.log(`🛠️  Creating ${fieldsToCreate.length} missing field(s)...`);
                const creationResults = await createMissingFields(conn, fieldsToCreate);

                console.log(`📊 Field creation summary:`);
                console.log(`   - Created: ${creationResults.created.length}`);
                console.log(`   - Skipped: ${creationResults.skipped.length}`);
                console.log(`   - Failed: ${creationResults.failed.length}`);

                // Wait a bit for Salesforce to process the field creation
                if (creationResults.created.length > 0) {
                    console.log('⏳ Waiting 2 seconds for Salesforce to process field creation...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

                // Return field creation results for the user
                return {
                    step: 'field_creation',
                    fieldsCreated: creationResults.created,
                    fieldsSkipped: creationResults.skipped,
                    fieldsFailed: creationResults.failed,
                    missingFields: missing,
                    existingFields: existing,
                    readyForTransfer: creationResults.failed.length === 0
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
    createMissingFields,
    transferLeadWithAutoFieldCreation
};
