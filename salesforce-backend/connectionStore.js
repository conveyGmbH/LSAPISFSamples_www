// OAuth Connection Persistence
// Persists Salesforce session data (tokens) per session key to a JSON file so
// connections survive a server restart. Mirrors the file-based pattern used by
// fieldConfigStorage.js. The live jsforce.Connection object is NOT serializable,
// so only the plain session data is stored; the server rebuilds the Connection
// from that data on startup.

const fs = require('fs').promises;
const path = require('path');

const STORAGE_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(STORAGE_DIR, 'oauth-sessions.json');

// Fields safe + necessary to persist. Excludes the live `connection` object.
const PERSISTED_FIELDS = [
    'accessToken', 'refreshToken', 'instanceUrl', 'organizationId',
    'userId', 'userInfo', 'clientId', 'clientSecret', 'loginUrl',
    'stateOrgId', '_sessionId',
];

function pickPersistable(sessionData) {
    const out = {};
    for (const f of PERSISTED_FIELDS) {
        if (sessionData[f] !== undefined) out[f] = sessionData[f];
    }
    return out;
}

/**
 * Read all persisted sessions from disk.
 * @returns {Promise<Record<string, object>>} keyed by session key
 */
async function loadSessions() {
    try {
        const data = await fs.readFile(STORE_FILE, 'utf8');
        const sessions = JSON.parse(data);
        const count = Object.keys(sessions).length;
        console.log(`✅ Loaded ${count} persisted Salesforce session(s)`);
        return sessions;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('ℹ️  No persisted Salesforce sessions, starting fresh');
        } else {
            console.error('Failed to load Salesforce sessions:', error);
        }
        return {};
    }
}

/**
 * Persist the full set of sessions to disk.
 * @param {Map<string, object>} connections - the in-memory connections map
 */
async function saveSessions(connections) {
    try {
        await fs.mkdir(STORAGE_DIR, { recursive: true });
        const out = {};
        for (const [key, connData] of connections) {
            out[key] = pickPersistable(connData);
        }
        await fs.writeFile(STORE_FILE, JSON.stringify(out, null, 2), 'utf8');
    } catch (error) {
        console.error('Failed to save Salesforce sessions:', error);
    }
}

/**
 * Remove one session from disk (after the in-memory delete).
 * @param {Map<string, object>} connections
 */
async function removeSession(connections) {
    // Simplest correct approach: rewrite the file from the current map.
    await saveSessions(connections);
}

module.exports = { loadSessions, saveSessions, removeSession, pickPersistable };
