// batchTransferService.js - Batch transfer engine for multi-lead Salesforce transfer
// Classic script (not module) - all functions exposed on window.*

(function() {
    'use strict';

    // ============================================================
    // CONSTANTS
    // ============================================================

    // System/metadata fields to exclude from Salesforce transfer
    const BATCH_EXCLUDED_FIELDS = new Set([
        'Id', 'CreatedDate', 'LastModifiedDate', 'CreatedById', 'LastModifiedById', 'SystemModstamp', 'IsDeleted', 'MasterRecordId', 'LastActivityDate',  'LastViewedDate', 'LastReferencedDate', 'Jigsaw', 'JigsawContactId',
        'CleanStatus', 'CompanyDunsNumber', 'DandbCompanyId', 'EmailBouncedReason', 'EmailBouncedDate', 'IndividualId', 'apiEndpoint', 'credentials',  'serverName', 'apiName', 'AttachmentIdList', 'EventID', '__metadata', 'LastExportStatus', 'LastExportTimestamp', 'LastExportMilliseconds', 'LastExportMessage', 'ExportAttempts'
    ]);

    // Standard Salesforce Lead fields (no __c suffix needed)
    const STANDARD_SF_FIELDS = new Set([
        'ActionCadenceAssigneeId', 'ActionCadenceId', 'ActionCadenceState', 'ActiveTrackerCount', 'ActivityMetricId', 'ActivityMetricRollupId',
        'Address', 'AnnualRevenue', 'City', 'CleanStatus', 'Company',
        'CompanyDunsNumber', 'ConvertedAccountId', 'ConvertedContactId', 'ConvertedDate', 'ConvertedOpportunityId', 'ConnectionReceivedId',
        'ConnectionSentId', 'Country', 'CountryCode', 'CurrencyIsoCode',
        'DandbCompanyId', 'Description', 'Division', 'Email',
        'EmailBouncedDate', 'EmailBouncedReason', 'ExportStatus', 'Fax',
        'FirstCallDateTime', 'FirstEmailDateTime', 'FirstName',
        'GeocodeAccuracy', 'GenderIdentity', 'HasOptedOutOfEmail',
        'HasOptedOutOfFax', 'IndividualId', 'Industry', 'IsConverted',
        'IsDeleted', 'IsPriorityRecord', 'IsUnreadByOwner', 'Jigsaw',
        'JigsawContactId', 'LastActivityDate', 'LastName', 'LastReferencedDate',
        'LastViewedDate', 'Latitude', 'LeadSource', 'Longitude',
        'MasterRecordId', 'MiddleName', 'MobilePhone', 'Name',
        'NumberOfEmployees', 'OwnerId', 'PartnerAccountId', 'Phone',
        'PhotoUrl', 'PostalCode', 'Pronouns', 'Rating', 'RecordTypeId',
        'Salutation', 'ScheduledResumeDateTime', 'ScoreIntelligenceId',
        'State', 'StateCode', 'Status', 'Street', 'Suffix', 'Title', 'Website',  'Id', 'CreatedDate', 'LastModifiedDate', 'SystemModstamp'
    ]);

    // Batch cancel flag
    let _batchCancelled = false;

    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================

    /**
     * Extract GUID from OData __metadata.uri
     * URI format: "https://server/api/LS_Lead(guid'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')"
     */
    function extractGuidFromMetadata(data) {
        try {
            const uri = data?.__metadata?.uri;
            if (!uri) return null;
            const match = uri.match(/guid'([0-9a-f-]{36})'/i);
            return match ? match[1] : null;
        } catch {
            return null;
        }
    }

    /**
     * Get a display name for a lead item (for progress display)
     */
    function getLeadDisplayName(itemData) {
        const parts = [];
        if (itemData.FirstName) parts.push(itemData.FirstName);
        if (itemData.LastName) parts.push(itemData.LastName);
        if (parts.length === 0 && itemData.Company) parts.push(itemData.Company);
        if (parts.length === 0 && itemData.Email) parts.push(itemData.Email);
        return parts.join(' ') || 'Unknown Lead';
    }

    // ============================================================
    // CORE FUNCTIONS
    // ============================================================

    /**
     * Build Salesforce lead data from an OData item
     * Replicates collectActiveFieldsOnly() logic from displayLeadTransferController.js
     * but takes itemData as parameter instead of reading window.selectedLeadData
     */
    function buildLeadDataFromItem(itemData, fieldMappingService) {
        const salesforceData = {};

        // Process data with labels (respects active/inactive field config)
        const processedData = fieldMappingService?.applyCustomLabels(itemData) ||
            Object.fromEntries(Object.entries(itemData).map(([key, value]) => [key, {
                value,
                label: key,
                active: true
            }]));

        // Add active custom fields
        if (fieldMappingService) {
            const customFields = fieldMappingService.getAllCustomFields();
            if (customFields) {
                customFields.forEach(field => {
                    if (field.active) {
                        const editedValue = itemData[field.sfFieldName];
                        processedData[field.sfFieldName] = {
                            value: editedValue !== undefined ? editedValue : (field.value || ''),
                            label: field.label || field.sfFieldName,
                            active: true,
                            isCustomField: true
                        };
                    }
                });
            }
        }

        // Check if the OData 'Id' field is mapped to a SF External ID field (for upsert support)
        const externalIdSfField = detectExternalIdField(fieldMappingService);
        if (externalIdSfField && itemData.Id) {
            // Include the OData Id value under the SF External ID field name
            salesforceData[externalIdSfField] = itemData.Id;
        }

        Object.keys(processedData).forEach(apiFieldName => {
            if (BATCH_EXCLUDED_FIELDS.has(apiFieldName)) return;
            if (/\s/.test(apiFieldName)) return;

            const fieldInfo = processedData[apiFieldName];
            // LastName and Company are always required by Salesforce — include even if deactivated in field config
            const isRequired = (apiFieldName === 'LastName' || apiFieldName === 'Company');
            const isActive = isRequired || (typeof fieldInfo === 'object' ? (fieldInfo.active !== false) : true);
            if (!isActive) return;

            const value = typeof fieldInfo === 'object' ? fieldInfo.value : fieldInfo;

            // For Question/Answers/Text fields, include even if null
            const isQuestionAnswerTextField = /^(Question|Answers|Text)\d{2}$/.test(apiFieldName);

            if (!isQuestionAnswerTextField) {
                if (!value || (typeof value === 'string' && (value.trim() === '' || value === 'N/A'))) {
                    return;
                }
            } else {
                if (value !== null && value !== undefined && typeof value === 'string' && (value.trim() === '' || value === 'N/A')) {
                    return;
                }
            }

            // Determine SF field name
            let sfFieldName;
            if (STANDARD_SF_FIELDS.has(apiFieldName)) {
                sfFieldName = apiFieldName;
            } else {
                const customLabel = fieldMappingService?.customLabels?.[apiFieldName];
                if (customLabel && customLabel.trim() !== '' && customLabel !== apiFieldName) {
                    sfFieldName = customLabel.trim();
                } else {
                    sfFieldName = apiFieldName;
                }
                if (!sfFieldName.endsWith('__c')) {
                    sfFieldName = sfFieldName + '__c';
                }
            }

            // Convert numeric fields
            if (sfFieldName === 'AnnualRevenue' || sfFieldName === 'NumberOfEmployees') {
                const numValue = Number(value);
                if (!isNaN(numValue)) {
                    salesforceData[sfFieldName] = numValue;
                }
                return;
            }

            if (salesforceData[sfFieldName] === undefined) {
                salesforceData[sfFieldName] = typeof value === 'string' ? value.trim() : value;
            }
        });

        return salesforceData;
    }

    /**
     * Detect if an External ID field is configured in FieldMappingService
     * Returns the SF field name (e.g. 'LS_LeadId__c') if the OData 'Id' field is mapped to a custom SF field
     * Returns null if no External ID mapping is found
     */
    function detectExternalIdField(fieldMappingService) {
        if (!fieldMappingService) return null;
        const customLabels = fieldMappingService.customLabels || {};
        // Check if OData 'Id' field is mapped to a SF custom field (ends with __c)
        const idMapping = customLabels['Id'];
        if (idMapping && idMapping.trim() && idMapping.endsWith('__c')) {
            return idMapping.trim();
        }
        return null;
    }

    /**
     * Transfer a single lead to Salesforce via backend API
     * Adapted from transferLeadDirectlyToSalesforce()
     */
    async function transferSingleLead(leadData, attachments, apiBaseUrl, externalIdField) {
        try {
            let salesforceLeadData = { ...leadData };

            // Remove null/empty values
            Object.keys(salesforceLeadData).forEach(key => {
                if (salesforceLeadData[key] === null || salesforceLeadData[key] === '' || salesforceLeadData[key] === 'N/A') {
                    delete salesforceLeadData[key];
                }
            });

            const apiUrl = `${apiBaseUrl}/salesforce/leads`;
            const orgId = localStorage.getItem('orgId') || 'default';

            const payload = {
                leadData: salesforceLeadData,
                attachments: attachments || [],
                ...(externalIdField && { externalIdField })
            };

            console.log('[Batch] Payload sent to SF:', JSON.stringify(payload.leadData, null, 2));

            const sessionToken = localStorage.getItem('sf_session_token');
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Org-Id': orgId,
                    ...(sessionToken && { 'X-Session-Token': sessionToken })
                },
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
                console.log('[Batch] SF error response:', JSON.stringify(errorData, null, 2));

                // 409 = duplicate detected by Salesforce
                if (response.status === 409) {
                    return {
                        success: false,
                        status: 'duplicate',
                        message: errorData.message || 'Duplicate lead found',
                        salesforceId: errorData.salesforceId || null,
                        duplicateWarning: true
                    };
                }

                return {
                    success: false,
                    status: 'failed',
                    message: errorData.error || errorData.message || `HTTP ${response.status}`,
                    salesforceId: null,
                    duplicateWarning: null
                };
            }

            const result = await response.json();
            return {
                success: result.success !== false,
                status: result.duplicateWarning ? 'duplicate' : (result.success !== false ? 'success' : 'failed'),
                message: result.message || (result.success !== false ? 'Lead transferred successfully' : 'Transfer failed'),
                salesforceId: result.salesforceId || null,
                duplicateWarning: result.duplicateWarning || null,
                attachmentsTransferred: result.attachments ? result.attachments.filter(a => a.success).length : 0
            };

        } catch (error) {
            return {
                success: false,
                status: 'failed',
                message: error.message || 'Network error',
                salesforceId: null,
                duplicateWarning: null
            };
        }
    }

    /**
     * Call LS_SetLeadExportStatus stored procedure
     * Records transfer status in the OData database (fire-and-forget)
     */
    async function callSetLeadExportStatus(kontaktViewId, status, message, milliseconds) {
        const serverName = sessionStorage.getItem('serverName');
        const apiName = sessionStorage.getItem('apiName');
        const credentials = sessionStorage.getItem('credentials');

        if (!serverName || !apiName || !kontaktViewId) {
            console.warn('LS_SetLeadExportStatus: Missing required params');
            return null;
        }

        const safeStatus = (status || 'Unknown').substring(0, 32);
        const safeMessage = (message || '').substring(0, 1024);
        const safeMs = Math.max(0, Math.round(milliseconds || 0));

        const id = kontaktViewId.toLowerCase();
        const encodedMessage = encodeURIComponent(safeMessage);
        const url = `https://${serverName}/${apiName}/LS_SetLeadExportStatus?id='${id}'&status='${safeStatus}'&message='${encodedMessage}'&milliseconds=${safeMs}&$format=json`;

        try {
            const headers = { 'Accept': 'application/json' };
            if (credentials) {
                headers['Authorization'] = 'Basic ' + credentials;
            }

            const response = await fetch(url, { method: 'GET', headers });

            if (!response.ok) {
                console.error(`LS_SetLeadExportStatus failed (${response.status})`);
                return null;
            }

            const data = await response.json();
            return data.d?.results?.[0] || data.d;
        } catch (error) {
            console.error('LS_SetLeadExportStatus error:', error);
            return null;
        }
    }

    /**
     * Fetch attachments for a lead (batch-friendly, no DOM manipulation)
     */
    async function fetchAttachmentsForBatch(attachmentIdList) {
        if (!attachmentIdList) return [];

        const attachmentIds = attachmentIdList.split(',').filter(id => id.trim() !== '');
        if (attachmentIds.length === 0) return [];

        const serverName = sessionStorage.getItem('serverName');
        const apiName = sessionStorage.getItem('apiName');
        const credentials = sessionStorage.getItem('credentials');

        if (!serverName || !apiName) return [];

        const attachments = [];

        for (const attachmentId of attachmentIds) {
            try {
                const endpoint = `LS_AttachmentById?Id=%27${encodeURIComponent(attachmentId)}%27&$format=json`;
                const url = `https://${serverName}/${apiName}/${endpoint}`;

                const headers = { 'Accept': 'application/json' };
                if (credentials) {
                    headers['Authorization'] = 'Basic ' + credentials;
                }

                const response = await fetch(url, { method: 'GET', headers });
                if (!response.ok) continue;

                const data = await response.json();
                let attachmentData = null;
                if (data?.d?.results?.length > 0) {
                    attachmentData = data.d.results[0];
                } else if (data?.d) {
                    attachmentData = data.d;
                }

                if (attachmentData?.Body) {
                    const fileName = attachmentData.Name || '';
                    const extension = fileName.split('.').pop().toLowerCase();
                    const isSVG = extension === 'svg' || attachmentData.ContentType === 'image/svg+xml';

                    let processedBody = attachmentData.Body;
                    let finalContentType = attachmentData.ContentType;

                    if (isSVG) {
                        try {
                            const testDecode = atob(attachmentData.Body.replace(/\s+/g, ''));
                            if (testDecode.includes('<svg') || testDecode.includes('<?xml')) {
                                processedBody = attachmentData.Body.replace(/\s+/g, '');
                            } else {
                                throw new Error('Not SVG Base64');
                            }
                        } catch {
                            if (attachmentData.Body.includes('<svg') || attachmentData.Body.includes('<?xml')) {
                                processedBody = btoa(decodeURIComponent(encodeURIComponent(attachmentData.Body)));
                            } else {
                                processedBody = attachmentData.Body.replace(/\s+/g, '');
                            }
                        }
                        finalContentType = 'image/svg+xml';
                    } else {
                        processedBody = attachmentData.Body.replace(/\s+/g, '');
                        if (!finalContentType) {
                            const mimeTypes = {
                                'pdf': 'application/pdf', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                                'png': 'image/png', 'gif': 'image/gif', 'txt': 'text/plain',
                                'doc': 'application/msword',
                                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                            };
                            finalContentType = mimeTypes[extension] || 'application/octet-stream';
                        }
                    }

                    attachments.push({
                        Name: fileName,
                        Body: processedBody,
                        ContentType: finalContentType
                    });
                }
            } catch (error) {
                console.error(`Error fetching attachment ${attachmentId}:`, error);
            }
        }

        return attachments;
    }

    /**
     * Cancel the current batch transfer
     */
    function cancelBatch() {
        _batchCancelled = true;
        console.log('Batch transfer cancellation requested');
    }

    /**
     * Execute batch transfer of multiple leads
     * Sequential processing (1 at a time) to respect Salesforce API limits
     *
     * @param {Array} items - Array of itemData objects (from row._itemData)
     * @param {Object} options - Configuration
     * @param {Object} options.fieldMappingService - The FieldMappingService instance
     * @param {string} options.apiBaseUrl - Backend API base URL
     * @param {Function} options.onProgress - Callback(current, total, leadName)
     * @param {Function} options.onLeadComplete - Callback(result) per lead
     * @returns {Object} Summary { results[], successCount, failedCount, duplicateCount, skippedCount, cancelledCount, totalMs }
     */
    async function executeBatchTransfer(items, options) {
        const { fieldMappingService, apiBaseUrl, onProgress, onLeadComplete } = options;

        // Detect External ID field once for the whole batch (same config applies to all leads)
        const externalIdField = detectExternalIdField(fieldMappingService);
        if (externalIdField) {
            console.log('[Batch] UPDATE mode enabled — External ID field:', externalIdField);
        }

        _batchCancelled = false;
        const results = [];
        const batchStartTime = Date.now();

        for (let i = 0; i < items.length; i++) {
            // Check cancellation
            if (_batchCancelled) {
                // Mark remaining items as skipped
                for (let j = i; j < items.length; j++) {
                    const skippedItem = items[j];
                    results.push({
                        index: j,
                        itemData: skippedItem,
                        displayName: getLeadDisplayName(skippedItem),
                        status: 'skipped',
                        message: 'Cancelled by user',
                        salesforceId: null,
                        milliseconds: 0
                    });
                }
                break;
            }

            const item = items[i];
            const displayName = getLeadDisplayName(item);

            // Notify progress
            if (onProgress) onProgress(i + 1, items.length, displayName);

            const leadStartTime = Date.now();

            // Validate required fields
            if (!item.LastName && !item.Company) {
                const result = {
                    index: i,
                    itemData: item,
                    displayName,
                    status: 'skipped',
                    message: 'Missing required fields (LastName or Company)',
                    salesforceId: null,
                    milliseconds: Date.now() - leadStartTime
                };
                results.push(result);
                if (onLeadComplete) onLeadComplete(result);
                continue;
            }

            try {
                // 1. Build SF data
                const leadData = buildLeadDataFromItem(item, fieldMappingService);

                // 2. Fetch attachments
                const attachments = await fetchAttachmentsForBatch(item.AttachmentIdList);

                // 3. Transfer to Salesforce (upsert if externalIdField configured)
                const transferResult = await transferSingleLead(leadData, attachments, apiBaseUrl, externalIdField);

                const milliseconds = Date.now() - leadStartTime;

                // 4. Record export status in DB (fire-and-forget)
                const kontaktViewId = item.Id || extractGuidFromMetadata(item);
                if (kontaktViewId) {
                    // Don't await - fire and forget
                    callSetLeadExportStatus(
                        kontaktViewId,
                        transferResult.duplicateWarning ? 'Duplicate' : (transferResult.success ? 'Success' : 'Failed'),
                        transferResult.message,
                        milliseconds
                    );
                }

                const result = {
                    index: i,
                    itemData: item,
                    displayName,
                    status: transferResult.status,
                    message: transferResult.message,
                    salesforceId: transferResult.salesforceId,
                    duplicateWarning: transferResult.duplicateWarning,
                    attachmentsTransferred: transferResult.attachmentsTransferred || 0,
                    milliseconds
                };

                results.push(result);
                if (onLeadComplete) onLeadComplete(result);

            } catch (error) {
                const milliseconds = Date.now() - leadStartTime;
                const result = {
                    index: i,
                    itemData: item,
                    displayName,
                    status: 'failed',
                    message: error.message || 'Unexpected error',
                    salesforceId: null,
                    milliseconds
                };
                results.push(result);
                if (onLeadComplete) onLeadComplete(result);
            }
        }

        // Build summary
        const summary = {
            results,
            total: items.length,
            successCount: results.filter(r => r.status === 'success').length,
            failedCount: results.filter(r => r.status === 'failed').length,
            duplicateCount: results.filter(r => r.status === 'duplicate').length,
            skippedCount: results.filter(r => r.status === 'skipped').length,
            totalMs: Date.now() - batchStartTime,
            cancelled: _batchCancelled
        };

        console.log('Batch transfer complete:', summary);
        return summary;
    }

    // ============================================================
    // EXPOSE ON WINDOW
    // ============================================================
    window.batchTransferService = {
        buildLeadDataFromItem,
        transferSingleLead,
        callSetLeadExportStatus,
        extractGuidFromMetadata,
        fetchAttachmentsForBatch,
        executeBatchTransfer,
        cancelBatch,
        getLeadDisplayName
    };

})();
