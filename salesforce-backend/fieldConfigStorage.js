// Field Configuration Storage
// Stores active field configurations per client (orgId)

const fs = require('fs').promises;
const path = require('path');

// In-memory storage (can be replaced with database later)
const fieldConfigurations = new Map();

// File-based persistence
const STORAGE_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(STORAGE_DIR, 'field-configs.json');

/**
 * Initialize storage (create directory if needed)
 */
async function initializeStorage() {
    try {
        await fs.mkdir(STORAGE_DIR, { recursive: true });
        await loadConfigurations();
    } catch (error) {
        console.error('Failed to initialize field config storage:', error);
    }
}

/**
 * Load configurations from file
 */
async function loadConfigurations() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        const configs = JSON.parse(data);

        // Populate in-memory map
        for (const [orgId, config] of Object.entries(configs)) {
            fieldConfigurations.set(orgId, config);
        }

        console.log(`✅ Loaded field configurations for ${fieldConfigurations.size} org(s)`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('ℹ️  No existing field configurations file, starting fresh');
        } else {
            console.error('Failed to load field configurations:', error);
        }
    }
}

/**
 * Save configurations to file
 */
async function saveConfigurations() {
    try {
        const configs = Object.fromEntries(fieldConfigurations);
        await fs.writeFile(CONFIG_FILE, JSON.stringify(configs, null, 2), 'utf8');
        console.log(`💾 Saved field configurations for ${fieldConfigurations.size} org(s)`);
    } catch (error) {
        console.error('Failed to save field configurations:', error);
    }
}

/**
 * Get active fields for a specific org/client
 * @param {string} orgId - Salesforce org ID
 * @returns {Object} Field configuration
 */
function getFieldConfig(orgId) {
    return fieldConfigurations.get(orgId) || {
        activeFields: [],
        customLabels: {},
        lastUpdated: null
    };
}

/**
 * Set active fields for a specific org/client
 * @param {string} orgId - Salesforce org ID
 * @param {Array} activeFields - Array of active field names
 * @param {Object} customLabels - Optional custom field labels
 */
async function setFieldConfig(orgId, activeFields, customLabels = {}) {
    const config = {
        activeFields: activeFields || [],
        customLabels: customLabels || {},
        lastUpdated: new Date().toISOString()
    };

    fieldConfigurations.set(orgId, config);
    await saveConfigurations();

    console.log(`✅ Updated field config for org ${orgId}: ${activeFields.length} active fields`);
    return config;
}

/**
 * Get active fields list for an org
 * @param {string} orgId - Salesforce org ID
 * @returns {Array} Array of active field names
 */
function getActiveFields(orgId) {
    const config = getFieldConfig(orgId);
    return config.activeFields || [];
}

/**
 * Add field to active list
 * @param {string} orgId - Salesforce org ID
 * @param {string} fieldName - Field name to add
 */
async function addActiveField(orgId, fieldName) {
    const config = getFieldConfig(orgId);

    if (!config.activeFields.includes(fieldName)) {
        config.activeFields.push(fieldName);
        config.lastUpdated = new Date().toISOString();

        fieldConfigurations.set(orgId, config);
        await saveConfigurations();

        console.log(`✅ Added active field ${fieldName} for org ${orgId}`);
    }
}

/**
 * Remove field from active list
 * @param {string} orgId - Salesforce org ID
 * @param {string} fieldName - Field name to remove
 */
async function removeActiveField(orgId, fieldName) {
    const config = getFieldConfig(orgId);

    config.activeFields = config.activeFields.filter(f => f !== fieldName);
    config.lastUpdated = new Date().toISOString();

    fieldConfigurations.set(orgId, config);
    await saveConfigurations();

    console.log(`✅ Removed active field ${fieldName} for org ${orgId}`);
}

/**
 * Get all configurations (for debugging)
 */
function getAllConfigs() {
    return Object.fromEntries(fieldConfigurations);
}

module.exports = {
    initializeStorage,
    getFieldConfig,
    setFieldConfig,
    getActiveFields,
    addActiveField,
    removeActiveField,
    getAllConfigs
};
