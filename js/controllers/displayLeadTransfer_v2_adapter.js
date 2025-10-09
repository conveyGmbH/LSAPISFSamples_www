/**
 * Display Lead Transfer V2 UI Adapter
 * Adds CardView/ListView toggle and modern UI features
 * Works alongside existing displayLeadTransferController.js
 */

// View state management
let currentView = 'list'; // 'list' or 'card'

/**
 * Initialize V2 UI enhancements
 */
export function initializeV2UI() {
    console.log('🎨 Initializing V2 UI enhancements...');

    // Dark mode removed - using light mode only
    // setupDarkMode();

    // Setup view toggle
    setupViewToggle();

    // Setup filter buttons
    setupFilterButtons();

    // Setup bulk actions
    setupBulkActions();

    // Setup user profile sidebar updates
    setupUserProfileUpdates();

    // Setup API status indicator
    setupAPIStatusIndicator();

    // Setup stats cards click handlers
    setupStatsCardsClickHandlers();

    // Setup disconnect button
    setupDisconnectButton();

    console.log('✅ V2 UI initialized (Light Mode Only)');
}

/**
 * Setup dark mode toggle
 */
function setupDarkMode() {
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (!darkModeToggle) return;

    // Check saved preference - DEFAULT TO LIGHT MODE
    const savedTheme = localStorage.getItem('theme') || 'light';

    // Apply theme
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
        updateDarkModeUI(true);
    } else {
        // Ensure light mode by default
        document.documentElement.classList.remove('dark');
        updateDarkModeUI(false);
    }

    darkModeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        updateDarkModeUI(isDark);
        console.log(`🌓 Dark mode ${isDark ? 'enabled' : 'disabled'}`);
    });
}

/**
 * Update dark mode UI elements
 */
function updateDarkModeUI(isDark) {
    const moonIcon = document.querySelector('.dark-mode-icon-moon');
    const sunIcon = document.querySelector('.dark-mode-icon-sun');
    const darkText = document.querySelector('.dark-mode-text-dark');
    const lightText = document.querySelector('.dark-mode-text-light');

    if (isDark) {
        moonIcon.style.display = 'none';
        sunIcon.style.display = 'inline';
        darkText.style.display = 'none';
        lightText.style.display = 'inline';
    } else {
        moonIcon.style.display = 'inline';
        sunIcon.style.display = 'none';
        darkText.style.display = 'inline';
        lightText.style.display = 'none';
    }
}

/**
 * Setup filter buttons (All/Active/Inactive)
 */
function setupFilterButtons() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    if (filterButtons.length === 0) return;

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const filterValue = btn.dataset.filter;

            // Update active state
            filterButtons.forEach(b => b.classList.remove('active', 'bg-blue-100', 'text-blue-700', 'dark:bg-blue-900', 'dark:text-blue-300'));
            filterButtons.forEach(b => b.classList.add('bg-gray-100', 'text-gray-700', 'dark:bg-gray-700', 'dark:text-gray-300'));

            btn.classList.remove('bg-gray-100', 'text-gray-700', 'dark:bg-gray-700', 'dark:text-gray-300');
            btn.classList.add('active', 'bg-blue-100', 'text-blue-700', 'dark:bg-blue-900', 'dark:text-blue-300');

            // Create synthetic dropdown element for compatibility
            const syntheticDropdown = document.createElement('select');
            syntheticDropdown.id = 'field-display-filter';
            syntheticDropdown.value = filterValue;

            // Trigger existing filter logic
            if (typeof window.handleFieldFilterChange === 'function') {
                window.handleFieldFilterChange({ target: syntheticDropdown });
            } else {
                // Fallback: trigger display update
                const event = new CustomEvent('filterChange', { detail: { filter: filterValue } });
                document.dispatchEvent(event);

                // Update summary text
                const summaryText = document.getElementById('fields-summary');
                if (summaryText) {
                    const texts = {
                        'all': 'Showing all fields',
                        'active': 'Showing active fields only',
                        'inactive': 'Showing inactive fields only'
                    };
                    summaryText.textContent = texts[filterValue] || 'Showing all fields';
                }

                // Reload lead data with new filter
                if (window.selectedLeadData && typeof window.displayLeadData === 'function') {
                    // Temporarily set dropdown value for compatibility
                    let dropdown = document.getElementById('field-display-filter');
                    if (!dropdown) {
                        dropdown = document.createElement('select');
                        dropdown.id = 'field-display-filter';
                        dropdown.style.display = 'none';
                        document.body.appendChild(dropdown);
                    }
                    dropdown.value = filterValue;

                    window.displayLeadData(window.selectedLeadData);

                    // Regenerate card view if currently visible
                    if (currentView === 'card') {
                        generateCardView();
                    }
                }
            }

            console.log(`🔍 Filter changed to: ${filterValue}`);
        });
    });
}

/**
 * Setup view toggle (List/Card)
 */
function setupViewToggle() {
    const listViewBtn = document.getElementById('listViewBtn');
    const cardViewBtn = document.getElementById('cardViewBtn');
    const listContainer = document.getElementById('list-view-container');
    const cardContainer = document.getElementById('card-view-container');

    if (!listViewBtn || !cardViewBtn) return;

    listViewBtn.addEventListener('click', () => {
        currentView = 'list';
        listViewBtn.classList.add('active');
        cardViewBtn.classList.remove('active');
        listContainer.style.display = 'block';
        cardContainer.style.display = 'none';
        console.log('📋 Switched to ListView');
    });

    cardViewBtn.addEventListener('click', () => {
        currentView = 'card';
        cardViewBtn.classList.add('active');
        listViewBtn.classList.remove('active');
        listContainer.style.display = 'none';
        cardContainer.style.display = 'grid';

        // Generate card view from list view data
        generateCardView();
        console.log('🎴 Switched to CardView');
    });
}

/**
 * Generate CardView from existing lead data
 */
function generateCardView() {
    const cardContainer = document.getElementById('card-view-container');
    if (!cardContainer) return;

    // Get all field elements from list view
    const fieldElements = document.querySelectorAll('.lead-field, .field-row');
    if (fieldElements.length === 0) {
        cardContainer.innerHTML = '<div class="col-span-full text-center text-gray-500 py-8">No fields to display</div>';
        return;
    }

    cardContainer.innerHTML = '';

    fieldElements.forEach(fieldElement => {
        const fieldName = fieldElement.dataset?.fieldName || fieldElement.dataset?.field;
        if (!fieldName) return;

        // Get field data
        const fieldLabel = fieldElement.querySelector('.field-label, .field-name')?.textContent || fieldName;
        const fieldInput = fieldElement.querySelector('.field-input, input:not([type="checkbox"]), select, textarea');
        const fieldValue = fieldInput ? getFieldInputValue(fieldInput) : '';
        const toggle = fieldElement.querySelector('input[type="checkbox"]');
        const isActive = toggle ? toggle.checked : true;
        const isRequired = fieldElement.querySelector('.required-marker') !== null || fieldLabel.includes('*');

        // Create card
        const card = createFieldCard(fieldName, fieldLabel, fieldValue, isActive, isRequired);
        cardContainer.appendChild(card);
    });

    console.log(`🎴 Generated ${fieldElements.length} field cards`);
}

/**
 * Create a field card element
 */
function createFieldCard(fieldName, fieldLabel, fieldValue, isActive, isRequired) {
    const card = document.createElement('div');
    card.className = `field-card bg-white rounded-lg p-4 ${isActive ? 'active-field' : 'inactive-field'}`;
    card.dataset.fieldName = fieldName;

    card.innerHTML = `
        <div class="flex justify-between items-start mb-3">
            <div class="flex-1">
                <h3 class="text-sm font-semibold text-gray-800 mb-1">
                    ${escapeHtml(fieldLabel)}
                    ${isRequired ? '<span class="text-red-500 ml-1">*</span>' : ''}
                </h3>
                <p class="text-xs text-gray-500 font-mono">${escapeHtml(fieldName)}</p>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" ${isActive ? 'checked' : ''} data-field="${escapeHtml(fieldName)}">
                <span class="toggle-slider"></span>
            </label>
        </div>
        <div class="mb-3">
            <p class="text-sm text-gray-700 break-words">${escapeHtml(fieldValue) || '<span class="text-gray-400 italic">No value</span>'}</p>
        </div>
        <div class="flex justify-end">
            <button class="edit-field-btn text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center" data-field="${escapeHtml(fieldName)}">
                <i class="fas fa-edit mr-1"></i> Edit
            </button>
        </div>
    `;

    // Add event listeners
    const toggleInput = card.querySelector('input[type="checkbox"]');
    const editBtn = card.querySelector('.edit-field-btn');

    toggleInput.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        card.classList.toggle('active-field', isChecked);
        card.classList.toggle('inactive-field', !isChecked);

        // Sync with list view toggle
        syncToggleWithListView(fieldName, isChecked);

        // Update stats
        updateFieldStatsV2();

        // Update transfer button
        if (typeof updateTransferButtonState === 'function') {
            updateTransferButtonState();
        }
    });

    // Click on edit button opens modal
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent card click
        openEditModal(fieldName, fieldLabel, fieldValue);
    });

    // Click on card (except toggle) also opens modal
    card.addEventListener('click', (e) => {
        // Don't open modal if clicking on toggle or edit button
        if (e.target.closest('.toggle-switch') || e.target.closest('.edit-field-btn')) {
            return;
        }
        openEditModal(fieldName, fieldLabel, fieldValue);
    });

    return card;
}

/**
 * Sync card view toggle with list view toggle
 */
function syncToggleWithListView(fieldName, isChecked) {
    // Find corresponding toggle in list view
    const listToggle = document.querySelector(`.lead-field[data-field-name="${fieldName}"] input[type="checkbox"], .field-row[data-field-name="${fieldName}"] input[type="checkbox"]`);
    if (listToggle && listToggle.checked !== isChecked) {
        listToggle.checked = isChecked;
        listToggle.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

/**
 * Open edit modal
 */
function openEditModal(fieldName, fieldLabel, fieldValue) {
    const modal = document.getElementById('edit-field-modal');
    const fieldNameInput = document.getElementById('edit-field-name');
    const fieldValueInput = document.getElementById('edit-field-value');
    const activeToggle = document.getElementById('edit-field-active');

    if (!modal) return;

    fieldNameInput.value = fieldLabel;
    fieldValueInput.value = fieldValue;

    // Get current active state
    const fieldCard = document.querySelector(`.field-card[data-field-name="${fieldName}"]`);
    const toggle = fieldCard?.querySelector('input[type="checkbox"]');
    activeToggle.checked = toggle ? toggle.checked : true;

    // Store field name for save
    modal.dataset.editingField = fieldName;

    modal.classList.add('show');

    // Setup close handlers
    const closeBtn = document.getElementById('close-edit-modal');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    const saveBtn = document.getElementById('save-edit-btn');

    const closeModal = () => {
        modal.classList.remove('show');
    };

    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;

    saveBtn.onclick = () => {
        saveFieldEdit(fieldName, fieldValueInput.value, activeToggle.checked);
        closeModal();
    };
}

/**
 * Save field edit
 */
function saveFieldEdit(fieldName, newValue, isActive) {
    // Update in list view
    const listFieldElement = document.querySelector(`.lead-field[data-field-name="${fieldName}"], .field-row[data-field-name="${fieldName}"]`);
    if (listFieldElement) {
        const input = listFieldElement.querySelector('.field-input, input:not([type="checkbox"]), select, textarea');
        if (input) {
            input.value = newValue;
        }
        const toggle = listFieldElement.querySelector('input[type="checkbox"]');
        if (toggle) {
            toggle.checked = isActive;
        }
    }

    // Update in card view if visible
    if (currentView === 'card') {
        generateCardView();
    }

    console.log(`✅ Field updated: ${fieldName}`);
}

/**
 * Setup bulk actions
 */
function setupBulkActions() {
    const activateAllBtn = document.getElementById('activate-all-btn');
    const deactivateAllBtn = document.getElementById('deactivate-all-btn');

    if (activateAllBtn) {
        activateAllBtn.addEventListener('click', () => {
            setAllFieldsActive(true);
        });
    }

    if (deactivateAllBtn) {
        deactivateAllBtn.addEventListener('click', () => {
            setAllFieldsActive(false);
        });
    }
}

/**
 * Set all fields active/inactive
 */
function setAllFieldsActive(active) {
    // Update all toggles
    const allToggles = document.querySelectorAll('.field-card input[type="checkbox"], .lead-field input[type="checkbox"], .field-row input[type="checkbox"]');
    allToggles.forEach(toggle => {
        toggle.checked = active;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Regenerate card view if active
    if (currentView === 'card') {
        generateCardView();
    }

    updateFieldStatsV2();

    if (typeof updateTransferButtonState === 'function') {
        updateTransferButtonState();
    }

    console.log(`✅ All fields set to ${active ? 'active' : 'inactive'}`);
}

/**
 * Update field statistics
 */
function updateFieldStatsV2() {
    const allFields = document.querySelectorAll('.field-card, .lead-field, .field-row');
    let activeCount = 0;
    let inactiveCount = 0;

    allFields.forEach(field => {
        const toggle = field.querySelector('input[type="checkbox"]');
        if (toggle) {
            if (toggle.checked) {
                activeCount++;
            } else {
                inactiveCount++;
            }
        }
    });

    const totalCount = activeCount + inactiveCount;

    // Update stat cards
    document.getElementById('active-field-count').textContent = activeCount;
    document.getElementById('inactive-field-count').textContent = inactiveCount;
    document.getElementById('total-field-count').textContent = totalCount;

    console.log(`📊 Stats updated: ${activeCount} active, ${inactiveCount} inactive, ${totalCount} total`);
}

/**
 * Setup user profile updates
 */
function setupUserProfileUpdates() {
    // Listen for connection status changes
    const observer = new MutationObserver(() => {
        updateUserProfileSidebar();
    });

    const profileElement = document.getElementById('salesforceUserInfo');
    if (profileElement) {
        observer.observe(profileElement, { childList: true, subtree: true });
    }
}

/**
 * Update user profile in sidebar
 */
function updateUserProfileSidebar() {
    const sidebarProfile = document.getElementById('user-profile-sidebar');
    const userName = document.getElementById('user-name-sidebar');
    const userEmail = document.getElementById('user-email-sidebar');
    const userOrg = document.getElementById('user-org-sidebar');
    const userAvatar = document.getElementById('user-avatar');

    // Try to get user info from existing profile or localStorage
    let userInfo = null;

    try {
        const persistedConnection = JSON.parse(localStorage.getItem('sf_connection_status'));
        if (persistedConnection && persistedConnection.userInfo) {
            userInfo = persistedConnection.userInfo;
        }
    } catch (e) {
        console.warn('Failed to load user info from localStorage');
    }

    if (userInfo && sidebarProfile) {
        sidebarProfile.style.display = 'block';
        userName.textContent = userInfo.display_name || userInfo.username || 'User';
        userEmail.textContent = userInfo.username || '-';
        userOrg.textContent = userInfo.organization_name || 'Unknown Org';

        // Create initials for avatar
        const initials = (userInfo.display_name || userInfo.username || 'U')
            .split(' ')
            .map(word => word[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
        userAvatar.textContent = initials;
    } else if (sidebarProfile) {
        sidebarProfile.style.display = 'none';
    }
}

/**
 * Setup API status indicator
 */
function setupAPIStatusIndicator() {
    // Check connection status periodically
    updateAPIStatus();
    setInterval(updateAPIStatus, 5000);
}

/**
 * Update API status indicator
 */
function updateAPIStatus() {
    const statusCard = document.getElementById('api-status-card');
    if (!statusCard) return;

    try {
        const persistedConnection = JSON.parse(localStorage.getItem('sf_connection_status'));
        const isConnected = persistedConnection &&
                          persistedConnection.status === 'connected' &&
                          persistedConnection.expiresAt > Date.now();

        if (isConnected) {
            const orgId = persistedConnection.orgId || 'default';
            statusCard.className = 'bg-green-50 border border-green-200 rounded-lg p-3';
            statusCard.innerHTML = `
                <div class="flex items-center">
                    <div class="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                    <span class="text-sm font-medium text-green-700">API Connected</span>
                </div>
                <p class="text-xs text-green-600 mt-1">${orgId}</p>
            `;
        } else {
            statusCard.className = 'bg-gray-100 border border-gray-200 rounded-lg p-3';
            statusCard.innerHTML = `
                <div class="flex items-center">
                    <div class="w-3 h-3 bg-gray-400 rounded-full mr-2"></div>
                    <span class="text-sm font-medium text-gray-600">Disconnected</span>
                </div>
                <p class="text-xs text-gray-500 mt-1">Not connected</p>
            `;
        }
    } catch (e) {
        console.warn('Failed to update API status');
    }
}

/**
 * Update filter summary text
 */
function updateFilterSummary() {
    const filterDropdown = document.getElementById('field-display-filter');
    const summaryText = document.getElementById('fields-summary');

    if (!filterDropdown || !summaryText) return;

    filterDropdown.addEventListener('change', (e) => {
        const value = e.target.value;
        const texts = {
            'all': 'Showing all fields',
            'active': 'Showing active fields only',
            'inactive': 'Showing inactive fields only'
        };
        summaryText.textContent = texts[value] || 'Showing all fields';
    });
}

/**
 * Helper: Get input value safely
 */
function getFieldInputValue(input) {
    if (!input) return '';
    if (input.tagName === 'SELECT') {
        return input.options[input.selectedIndex]?.text || input.value;
    }
    return input.value || '';
}

/**
 * Helper: Escape HTML
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Setup click handlers on stats cards to show field details
 */
function setupStatsCardsClickHandlers() {
    const activeCard = document.getElementById('active-stats-card');
    const inactiveCard = document.getElementById('inactive-stats-card');
    const totalCard = document.getElementById('total-stats-card');

    if (activeCard) {
        activeCard.addEventListener('click', () => showFieldDetailsModal('active'));
    }

    if (inactiveCard) {
        inactiveCard.addEventListener('click', () => showFieldDetailsModal('inactive'));
    }

    if (totalCard) {
        totalCard.addEventListener('click', () => showFieldDetailsModal('all'));
    }
}

/**
 * Show field details modal
 */
function showFieldDetailsModal(filterType) {
    const modal = document.getElementById('field-details-modal');
    const modalTitle = document.getElementById('field-details-title');
    const modalBody = document.getElementById('field-details-body');
    const closeBtn = document.getElementById('close-field-details-modal');

    if (!modal || !modalTitle || !modalBody) {
        console.error('Field details modal not found');
        return;
    }

    // Set title based on filter
    const titles = {
        'active': 'Active Fields',
        'inactive': 'Inactive Fields',
        'all': 'All Fields'
    };
    modalTitle.textContent = titles[filterType] || 'Field Details';

    // Get all field elements
    const allFields = document.querySelectorAll('.field-row, .field-container, .lead-field');
    const filteredFields = [];

    allFields.forEach(field => {
        const fieldName = field.dataset.fieldName || field.dataset.field;
        if (!fieldName) return;

        const toggle = field.querySelector('input[type="checkbox"]');
        const isActive = toggle ? toggle.checked : false;

        // Filter based on type
        if (filterType === 'active' && !isActive) return;
        if (filterType === 'inactive' && isActive) return;

        const fieldValue = field.querySelector('.field-value, .field-input, input:not([type="checkbox"]), select, textarea');
        const value = fieldValue ? (fieldValue.textContent || fieldValue.value || 'N/A') : 'N/A';

        filteredFields.push({
            name: fieldName,
            value: value.trim(),
            active: isActive
        });
    });

    // Generate modal content
    if (filteredFields.length === 0) {
        modalBody.innerHTML = `
            <div class="text-center py-8">
                <i class="fas fa-inbox text-gray-300 text-5xl mb-3"></i>
                <p class="text-gray-600">No ${filterType === 'all' ? '' : filterType} fields found</p>
            </div>
        `;
    } else {
        modalBody.innerHTML = `
            <div class="mb-3">
                <p class="text-sm text-gray-600">Found <strong>${filteredFields.length}</strong> field(s)</p>
            </div>
            <div class="space-y-2">
                ${filteredFields.map(field => `
                    <div class="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                        <div class="flex-1">
                            <p class="text-sm font-medium text-gray-800">${field.name}</p>
                            <p class="text-xs text-gray-600 mt-1">${field.value}</p>
                        </div>
                        <span class="px-2 py-1 text-xs rounded-full ${field.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                            ${field.active ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Show modal
    modal.classList.add('show');
    modal.style.display = 'flex';

    // Close handlers
    const closeModal = () => {
        modal.classList.remove('show');
        modal.style.display = 'none';
    };

    closeBtn.onclick = closeModal;
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
}

/**
 * Setup disconnect button
 */
function setupDisconnectButton() {
    const disconnectBtn = document.getElementById('disconnect-sf-btn');
    if (!disconnectBtn) return;

    disconnectBtn.addEventListener('click', async () => {
        // Confirm disconnect
        const confirmed = confirm('Are you sure you want to disconnect from Salesforce? This will clear all cached data and connection information.');
        if (!confirmed) return;

        try {
            // Clear localStorage
            localStorage.removeItem('sf_connection_status');
            localStorage.removeItem('sf_user_info');
            localStorage.removeItem('sf_connected_at');
            localStorage.removeItem('orgId');
            localStorage.removeItem('selectedEventId');

            // Clear sessionStorage
            sessionStorage.clear();

            // Clear any lead edit data
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('lead_edits_')) {
                    localStorage.removeItem(key);
                }
            });

            console.log('🚪 Disconnected from Salesforce, localStorage cleared');

            // Update UI
            const userProfileSidebar = document.getElementById('user-profile-sidebar');
            if (userProfileSidebar) {
                userProfileSidebar.style.display = 'none';
            }

            // Reset API status
            updateAPIStatus();

            // Show success message
            alert('Successfully disconnected from Salesforce. Please refresh the page to reconnect.');

            // Optionally reload the page
            setTimeout(() => {
                window.location.reload();
            }, 1000);

        } catch (error) {
            console.error('Error during disconnect:', error);
            alert('Error disconnecting. Please try again or clear your browser cache manually.');
        }
    });
}

// Auto-initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeV2UI);
} else {
    initializeV2UI();
}

// Expose openEditModal globally for ListView integration
window.openEditModal = openEditModal;

// Export for use in other modules
export { generateCardView, updateFieldStatsV2, updateUserProfileSidebar, updateAPIStatus, openEditModal };
