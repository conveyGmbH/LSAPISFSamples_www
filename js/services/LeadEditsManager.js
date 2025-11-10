/**
 * LeadEditsManager - Manages lead field value edits in localStorage
 *
 * RESPONSIBILITIES:
 * - Store/retrieve field VALUES edited by user (per EventId)
 * - LRU cleanup to prevent localStorage overflow
 * - NO responsibility for field active/inactive state (handled by FieldMappingService)
 *
 * STORAGE STRUCTURE:
 * lead_edits_${eventId} = {
 *   data: { "Industry": "Technology", "Question01__c": "..." },
 *   lastAccessed: "2025-11-04T20:00:00Z",
 *   lastModified: "2025-11-04T19:30:00Z",
 *   editCount: 2
 * }
 */

class LeadEditsManager {
    constructor(options = {}) {
        this.MAX_LEADS = options.maxLeads || 30;
        this.STORAGE_PREFIX = 'lead_edits_';
        this.AUTO_CLEANUP_ON_SAVE = options.autoCleanup !== false;

        console.log(`📝 LeadEditsManager initialized (max ${this.MAX_LEADS} leads)`);
    }

    /**
     * Save lead field edits with metadata
     * @param {string} eventId - The EventId of the lead
     * @param {object} edits - Key-value pairs of field edits { fieldName: value }
     */
    saveEdits(eventId, edits) {
        if (!eventId) {
            console.error('❌ Cannot save edits: eventId is required');
            return false;
        }

        const key = `${this.STORAGE_PREFIX}${eventId}`;

        try {
            // Get existing data to preserve lastModified for unchanged fields
            const existing = this.getMetadata(eventId);

            const data = {
                data: edits,
                lastAccessed: new Date().toISOString(),
                lastModified: new Date().toISOString(),
                editCount: Object.keys(edits).length,
                // Preserve creation date if exists
                createdAt: existing?.createdAt || new Date().toISOString()
            };

            localStorage.setItem(key, JSON.stringify(data));
            console.log(`💾 Saved ${data.editCount} edits for EventId: ${eventId}`);

            // Auto-cleanup if enabled
            if (this.AUTO_CLEANUP_ON_SAVE) {
                this.cleanup();
            }

            return true;
        } catch (error) {
            console.error(`❌ Failed to save edits for ${eventId}:`, error);

            // Check if quota exceeded
            if (error.name === 'QuotaExceededError') {
                console.warn('⚠️ localStorage quota exceeded! Running cleanup...');
                this.cleanup(true); // Force aggressive cleanup

                // Retry save
                try {
                    localStorage.setItem(key, JSON.stringify(data));
                    console.log('✅ Save successful after cleanup');
                    return true;
                } catch (retryError) {
                    console.error('❌ Save failed even after cleanup:', retryError);
                    return false;
                }
            }

            return false;
        }
    }

    /**
     * Save a single field edit (convenience method)
     * @param {string} eventId
     * @param {string} fieldName
     * @param {any} value
     */
    saveFieldEdit(eventId, fieldName, value) {
        if (!eventId || !fieldName) {
            console.error('❌ eventId and fieldName are required');
            return false;
        }

        // Load existing edits
        let edits = this.loadEdits(eventId) || {};

        // Update field
        edits[fieldName] = value;

        // Save all edits
        return this.saveEdits(eventId, edits);
    }

    /**
     * Load lead edits and update lastAccessed timestamp
     * @param {string} eventId
     * @returns {object|null} Edit data or null if not found
     */
    loadEdits(eventId) {
        if (!eventId) {
            console.warn('⚠️ Cannot load edits: eventId is required');
            return null;
        }

        const key = `${this.STORAGE_PREFIX}${eventId}`;
        const stored = localStorage.getItem(key);

        if (!stored) {
            console.log(`ℹ️ No edits found for EventId: ${eventId}`);
            return null;
        }

        try {
            const parsed = JSON.parse(stored);

            // Update lastAccessed timestamp
            parsed.lastAccessed = new Date().toISOString();
            localStorage.setItem(key, JSON.stringify(parsed));

            console.log(`✅ Loaded ${parsed.editCount || 0} edits for EventId: ${eventId}`);
            return parsed.data;
        } catch (error) {
            console.error(`❌ Failed to parse edits for ${eventId}:`, error);
            return null;
        }
    }

    /**
     * Get metadata without updating lastAccessed
     * @param {string} eventId
     * @returns {object|null}
     */
    getMetadata(eventId) {
        if (!eventId) return null;

        const key = `${this.STORAGE_PREFIX}${eventId}`;
        const stored = localStorage.getItem(key);

        if (!stored) return null;

        try {
            return JSON.parse(stored);
        } catch (error) {
            console.error(`❌ Failed to parse metadata for ${eventId}:`, error);
            return null;
        }
    }

    /**
     * Clear edits for a specific lead
     * @param {string} eventId
     */
    clearLeadEdits(eventId) {
        if (!eventId) {
            console.error('❌ Cannot clear edits: eventId is required');
            return false;
        }

        const key = `${this.STORAGE_PREFIX}${eventId}`;
        localStorage.removeItem(key);
        console.log(`🗑️ Cleared edits for EventId: ${eventId}`);
        return true;
    }

    /**
     * Clear all lead edits (use with caution!)
     */
    clearAll() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(this.STORAGE_PREFIX)) {
                keys.push(key);
            }
        }

        keys.forEach(key => localStorage.removeItem(key));
        console.log(`🗑️ Cleared all ${keys.length} lead edits`);
        return keys.length;
    }

    /**
     * Cleanup old leads using LRU strategy
     * @param {boolean} aggressive - If true, remove more leads
     */
    cleanup(aggressive = false) {
        const allLeads = [];

        // Collect all lead_edits with metadata
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(this.STORAGE_PREFIX)) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    allLeads.push({
                        key: key,
                        eventId: key.replace(this.STORAGE_PREFIX, ''),
                        lastAccessed: new Date(data.lastAccessed),
                        editCount: data.editCount || 0,
                        size: localStorage.getItem(key).length
                    });
                } catch (error) {
                    console.error(`⚠️ Corrupted data in ${key}, will be removed`);
                    localStorage.removeItem(key);
                }
            }
        }

        // Sort by lastAccessed (oldest first)
        allLeads.sort((a, b) => a.lastAccessed - b.lastAccessed);

        // Calculate how many to remove
        const maxLeads = aggressive ? Math.floor(this.MAX_LEADS * 0.7) : this.MAX_LEADS;
        const toRemove = allLeads.length - maxLeads;

        if (toRemove > 0) {
            console.log(`🧹 Cleaning up ${toRemove} old leads (${aggressive ? 'aggressive' : 'normal'} mode)`);

            for (let i = 0; i < toRemove; i++) {
                localStorage.removeItem(allLeads[i].key);
                console.log(`🗑️ Removed: ${allLeads[i].eventId} (last accessed: ${allLeads[i].lastAccessed.toLocaleString()})`);
            }

            return toRemove;
        } else {
            console.log(`✅ No cleanup needed (${allLeads.length}/${maxLeads} leads)`);
            return 0;
        }
    }

    /**
     * Get storage usage statistics
     * @returns {object} Storage info
     */
    getStorageInfo() {
        let totalSize = 0;
        let leadCount = 0;
        const leads = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(this.STORAGE_PREFIX)) {
                const value = localStorage.getItem(key);
                const size = value.length;
                totalSize += size;
                leadCount++;

                try {
                    const data = JSON.parse(value);
                    leads.push({
                        eventId: key.replace(this.STORAGE_PREFIX, ''),
                        size: size,
                        editCount: data.editCount || 0,
                        lastAccessed: data.lastAccessed,
                        lastModified: data.lastModified
                    });
                } catch (error) {
                    // Skip corrupted entries
                }
            }
        }

        // Sort by lastAccessed (most recent first)
        leads.sort((a, b) => new Date(b.lastAccessed) - new Date(a.lastAccessed));

        return {
            leadCount,
            maxLeads: this.MAX_LEADS,
            totalSize,
            totalSizeKB: (totalSize / 1024).toFixed(2),
            totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
            usage: `${leadCount}/${this.MAX_LEADS} leads`,
            usagePercent: ((leadCount / this.MAX_LEADS) * 100).toFixed(1),
            leads: leads,
            needsCleanup: leadCount > this.MAX_LEADS * 0.8
        };
    }

    /**
     * Display storage info in console
     */
    showStorageInfo() {
        const info = this.getStorageInfo();

        console.log('📊 Lead Edits Storage Info:');
        console.log(`   Leads: ${info.leadCount}/${info.maxLeads} (${info.usagePercent}%)`);
        console.log(`   Size: ${info.totalSizeKB} KB (${info.totalSizeMB} MB)`);

        if (info.needsCleanup) {
            console.warn(`⚠️ Storage almost full! Consider running cleanup.`);
        }

        if (info.leads.length > 0) {
            console.log(`   Most recent: ${info.leads[0].eventId} (${info.leads[0].editCount} edits)`);
        }

        return info;
    }

    /**
     * Export all edits for backup
     * @returns {object} All lead edits
     */
    exportAll() {
        const allEdits = {};

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(this.STORAGE_PREFIX)) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    const eventId = key.replace(this.STORAGE_PREFIX, '');
                    allEdits[eventId] = data;
                } catch (error) {
                    console.error(`⚠️ Failed to export ${key}:`, error);
                }
            }
        }

        console.log(`📦 Exported ${Object.keys(allEdits).length} lead edits`);
        return allEdits;
    }

    /**
     * Import edits from backup
     * @param {object} editsData
     */
    importAll(editsData) {
        let imported = 0;
        let failed = 0;

        Object.entries(editsData).forEach(([eventId, data]) => {
            try {
                const key = `${this.STORAGE_PREFIX}${eventId}`;
                localStorage.setItem(key, JSON.stringify(data));
                imported++;
            } catch (error) {
                console.error(`❌ Failed to import ${eventId}:`, error);
                failed++;
            }
        });

        console.log(`📥 Import complete: ${imported} succeeded, ${failed} failed`);
        return { imported, failed };
    }
}

// Export as global
if (typeof window !== 'undefined') {
    window.LeadEditsManager = LeadEditsManager;

    // Auto-initialize with default options
    if (!window.leadEditsManager) {
        window.leadEditsManager = new LeadEditsManager();
    }
}

export default LeadEditsManager;
