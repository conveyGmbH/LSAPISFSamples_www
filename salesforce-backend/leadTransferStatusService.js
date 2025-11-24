/**
 * Lead Transfer Status Service
 * Manages the transfer status of leads (Success, Pending, Failed)
 * Stores data in a JSON file per org
 */

const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const STATUS_FILE = path.join(DATA_DIR, 'lead-transfer-statuses.json');

/**
 * Ensure data directory exists
 */
async function ensureDataDirectory() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
        console.log('📁 Created data directory for lead statuses');
    }
}

/**
 * Load all transfer statuses from file
 * @returns {Promise<Object>} Object with orgId -> leadId -> status mapping
 */
async function loadStatuses() {
    await ensureDataDirectory();

    try {
        const data = await fs.readFile(STATUS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist yet, return empty object
            return {};
        }
        console.error('Error loading transfer statuses:', error);
        return {};
    }
}

/**
 * Save all transfer statuses to file
 * @param {Object} statuses - Complete statuses object
 */
async function saveStatuses(statuses) {
    await ensureDataDirectory();

    try {
        await fs.writeFile(
            STATUS_FILE,
            JSON.stringify(statuses, null, 2),
            'utf8'
        );
    } catch (error) {
        console.error('Error saving transfer statuses:', error);
        throw error;
    }
}

/**
 * Get transfer status for a specific lead
 * @param {string} orgId - Salesforce organization ID
 * @param {string} leadId - Lead ID from the source system
 * @returns {Promise<Object|null>} Status object or null if not found
 */
async function getLeadStatus(orgId, leadId) {
    const statuses = await loadStatuses();

    if (!statuses[orgId] || !statuses[orgId][leadId]) {
        return null;
    }

    return statuses[orgId][leadId];
}

/**
 * Get all transfer statuses for an org
 * @param {string} orgId - Salesforce organization ID
 * @returns {Promise<Object>} Object with leadId -> status mapping
 */
async function getOrgStatuses(orgId) {
    const statuses = await loadStatuses();
    return statuses[orgId] || {};
}

/**
 * Set transfer status for a lead
 * @param {string} orgId - Salesforce organization ID
 * @param {string} leadId - Lead ID from the source system
 * @param {Object} statusData - Status information
 * @param {string} statusData.status - Status: 'Success', 'Failed', 'Pending'
 * @param {string} [statusData.salesforceId] - Salesforce Lead ID (if successful)
 * @param {string} [statusData.errorMessage] - Error message (if failed)
 * @returns {Promise<Object>} The saved status object
 */
async function setLeadStatus(orgId, leadId, statusData) {
    const statuses = await loadStatuses();

    // Initialize org object if it doesn't exist
    if (!statuses[orgId]) {
        statuses[orgId] = {};
    }

    // Create status object with timestamp
    const statusObject = {
        status: statusData.status,
        salesforceId: statusData.salesforceId || null,
        errorMessage: statusData.errorMessage || null,
        transferredAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
    };

    // Save status for this lead
    statuses[orgId][leadId] = statusObject;

    await saveStatuses(statuses);

    console.log(`✅ Transfer status saved: ${leadId} -> ${statusData.status}`);

    return statusObject;
}

/**
 * Get transfer statuses for multiple leads (batch operation)
 * @param {string} orgId - Salesforce organization ID
 * @param {string[]} leadIds - Array of lead IDs
 * @returns {Promise<Object>} Object with leadId -> status mapping
 */
async function getBatchStatuses(orgId, leadIds) {
    const orgStatuses = await getOrgStatuses(orgId);
    const result = {};

    leadIds.forEach(leadId => {
        result[leadId] = orgStatuses[leadId] || { status: 'Pending' };
    });

    return result;
}

/**
 * Delete transfer status for a lead
 * @param {string} orgId - Salesforce organization ID
 * @param {string} leadId - Lead ID from the source system
 */
async function deleteLeadStatus(orgId, leadId) {
    const statuses = await loadStatuses();

    if (statuses[orgId] && statuses[orgId][leadId]) {
        delete statuses[orgId][leadId];
        await saveStatuses(statuses);
        console.log(`🗑️ Transfer status deleted: ${leadId}`);
    }
}

/**
 * Verify lead status in Salesforce and detect if modified after transfer
 * @param {Object} conn - JSForce connection
 * @param {string} salesforceId - Salesforce Lead ID
 * @param {string} lastTransferDate - ISO date string of last transfer
 * @returns {Promise<Object>} Status verification result
 */
async function verifyLeadInSalesforce(conn, salesforceId, lastTransferDate) {
    try {
        // Query the lead from Salesforce to check if it exists and get LastModifiedDate
        const result = await conn.query(
            `SELECT Id, LastModifiedDate, Status, IsDeleted FROM Lead WHERE Id = '${salesforceId}' LIMIT 1`
        );

        if (result.records.length === 0) {
            return {
                exists: false,
                status: 'NOT_FOUND',
                message: 'Lead not found in Salesforce (may have been deleted)'
            };
        }

        const lead = result.records[0];

        if (lead.IsDeleted) {
            return {
                exists: false,
                status: 'DELETED',
                message: 'Lead has been deleted in Salesforce'
            };
        }

        // Check if lead was modified after transfer
        const lastModified = new Date(lead.LastModifiedDate);
        const transferDate = new Date(lastTransferDate);

        const wasModified = lastModified > transferDate;

        return {
            exists: true,
            status: lead.Status,
            lastModified: lead.LastModifiedDate,
            wasModifiedAfterTransfer: wasModified,
            message: wasModified
                ? 'Lead has been modified in Salesforce after transfer'
                : 'Lead transfer successful, no modifications detected'
        };
    } catch (error) {
        console.error('Error verifying lead in Salesforce:', error);
        return {
            exists: 'unknown',
            status: 'ERROR',
            message: `Error checking Salesforce: ${error.message}`
        };
    }
}

/**
 * Get enhanced transfer status with Salesforce verification
 * @param {Object} conn - JSForce connection
 * @param {string} orgId - Salesforce organization ID
 * @param {string} leadId - Lead ID from the source system
 * @returns {Promise<Object>} Enhanced status object
 */
async function getEnhancedLeadStatus(conn, orgId, leadId) {
    const localStatus = await getLeadStatus(orgId, leadId);

    if (!localStatus) {
        return {
            status: 'NOT_TRANSFERRED',
            icon: '⏺',
            label: 'Not yet transferred',
            color: '#6b7280'
        };
    }

    // If we have a salesforceId, verify in Salesforce
    if (localStatus.salesforceId && conn) {
        const sfVerification = await verifyLeadInSalesforce(
            conn,
            localStatus.salesforceId,
            localStatus.transferredAt
        );

        if (!sfVerification.exists) {
            return {
                status: 'ERROR',
                icon: '⚠️',
                label: 'Transfer error',
                color: '#dc2626',
                details: sfVerification.message,
                salesforceId: localStatus.salesforceId
            };
        }

        if (sfVerification.wasModifiedAfterTransfer) {
            return {
                status: 'MODIFIED',
                icon: '🕓',
                label: 'Modified after transfer',
                color: '#f59e0b',
                details: `Last modified: ${new Date(sfVerification.lastModified).toLocaleString('en-US')}`,
                salesforceId: localStatus.salesforceId,
                lastModified: sfVerification.lastModified
            };
        }

        return {
            status: 'SUCCESS',
            icon: '✅',
            label: 'Transferred',
            color: '#10b981',
            details: `Transferred on: ${new Date(localStatus.transferredAt).toLocaleString('en-US')}`,
            salesforceId: localStatus.salesforceId,
            transferredAt: localStatus.transferredAt
        };
    }

    // No Salesforce verification possible
    if (localStatus.status === 'Failed') {
        return {
            status: 'ERROR',
            icon: '⚠️',
            label: 'Transfer error',
            color: '#dc2626',
            details: localStatus.errorMessage || 'Transfer failed'
        };
    }

    return {
        status: 'SUCCESS',
        icon: '✅',
        label: 'Transferred',
        color: '#10b981',
        details: `Transferred on: ${new Date(localStatus.transferredAt).toLocaleString('en-US')}`,
        salesforceId: localStatus.salesforceId
    };
}

module.exports = {
    getLeadStatus,
    getOrgStatuses,
    setLeadStatus,
    getBatchStatuses,
    deleteLeadStatus,
    verifyLeadInSalesforce,
    getEnhancedLeadStatus
};
