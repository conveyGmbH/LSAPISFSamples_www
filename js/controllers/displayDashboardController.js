
class SalesforceLeadManager {
    constructor() {
        this.apiBase = 'http://localhost:3000';
        this.currentUser = null;
        this.isAuthenticated = false;
        this.currentOrg = 'default';
        this.connectedOrgs = new Map();
        this.leads = [];
        this.filteredLeads = [];
        this.currentPage = 1;
        this.pageSize = 10;
        this.currentSortColumn = null;
        this.currentSortDirection = 'asc';
        
        // Auto-refresh settings
        this.autoRefreshInterval = null;
        this.tokenRefreshInterval = null;
        
        // Initialize app
        this.initializeApp();
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    initializeApp() {
        this.initializeDarkMode();
        this.initializeElements();
        this.attachEventListeners();
        this.checkAuthentication();
        this.startTokenRefreshInterval();
    }

    initializeDarkMode() {
        // Load dark mode preference
        const savedTheme = localStorage.getItem('salesforce-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
            document.documentElement.classList.add('dark');
        }
    }

    initializeElements() {
        this.elements = {
            // Navigation
            backToLeadTransferBtn: document.getElementById('backToLeadTransferBtn'),

            // Theme
            darkModeToggle: document.getElementById('darkModeToggle'),

            // Auth
            connectBtn: document.getElementById('connectBtn'),
            logoutBtn: document.getElementById('logoutBtn'),
            completeLogoutBtn: document.getElementById('completeLogoutBtn'),
            
            // Connection Status
            connectionStatus: document.getElementById('connectionStatus'),
            notConnected: document.getElementById('notConnected'),
            connected: document.getElementById('connected'),
            connectedUser: document.getElementById('connectedUser'),
            connectedOrg: document.getElementById('connectedOrg'),
            
            // User Info
            userInfo: document.getElementById('userInfo'),
            userName: document.getElementById('userName'),
            userEmail: document.getElementById('userEmail'),
            userAvatar: document.getElementById('userAvatar'),
            orgName: document.getElementById('orgName'),
            
            // Dashboard
            dashboard: document.getElementById('dashboard'),
            
            // Stats
            totalLeads: document.getElementById('totalLeads'),
            qualifiedLeads: document.getElementById('qualifiedLeads'),
            workingLeads: document.getElementById('workingLeads'),
            newLeads: document.getElementById('newLeads'),
            
            // Actions
            newLeadBtn: document.getElementById('newLeadBtn'),
            refreshBtn: document.getElementById('refreshBtn'),
            refreshText: document.getElementById('refreshText'),
            exportBtn: document.getElementById('exportBtn'),
            
            // Search & Filter
            searchInput: document.getElementById('searchInput'),
            statusFilter: document.getElementById('statusFilter'),
            
            // Table
            tableLoading: document.getElementById('tableLoading'),
            emptyState: document.getElementById('emptyState'),
            leadsTableContainer: document.getElementById('leadsTableContainer'),
            leadsTableBody: document.getElementById('leadsTableBody'),
            
            // Pagination
            showingFrom: document.getElementById('showingFrom'),
            showingTo: document.getElementById('showingTo'),
            totalRecords: document.getElementById('totalRecords'),
            paginationNav: document.getElementById('paginationNav'),
            
            // Org Selector
            orgSelector: document.getElementById('orgSelector'),
            orgSelect: document.getElementById('orgSelect'),
            
            // Modals
            deleteModal: document.getElementById('deleteModal'),
            deleteLeadName: document.getElementById('deleteLeadName'),
            cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
            confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
            deleteBtnText: document.getElementById('deleteBtnText'),
            
            leadModal: document.getElementById('leadModal'),
            modalTitle: document.getElementById('modalTitle'),
            closeModal: document.getElementById('closeModal'),
            leadForm: document.getElementById('leadForm'),
            cancelBtn: document.getElementById('cancelBtn'),
            saveBtn: document.getElementById('saveBtn'),
            saveBtnText: document.getElementById('saveBtnText'),
            
            // Toast Container
            toastContainer: document.getElementById('toastContainer')
        };
    }

    attachEventListeners() {
        // Navigation
        this.elements.backToLeadTransferBtn?.addEventListener('click', () => {
            window.location.href = '../pages/displayLeadTransfer.html';
        });

        // Theme toggle
        this.elements.darkModeToggle.addEventListener('click', () => this.toggleDarkMode());

        // Auth buttons
        this.elements.connectBtn.addEventListener('click', () => this.connectToSalesforce());
        this.elements.logoutBtn.addEventListener('click', () => this.logout());
        this.elements.completeLogoutBtn.addEventListener('click', () => this.completeLogout());
        
        // Actions
        this.elements.newLeadBtn.addEventListener('click', () => this.showCreateLeadModal());
        this.elements.refreshBtn.addEventListener('click', () => this.refreshLeads());
        this.elements.exportBtn.addEventListener('click', () => this.exportLeads());
        
        // Search & Filter
        this.elements.searchInput.addEventListener('input', 
            this.debounce(() => this.filterLeads(), 300));
        this.elements.statusFilter.addEventListener('change', () => this.filterLeads());
        
        // Org switcher
        this.elements.orgSelect.addEventListener('change', (e) => this.switchOrg(e.target.value));
        
        // Modal events
        this.elements.cancelDeleteBtn.addEventListener('click', () => this.hideDeleteModal());
        this.elements.confirmDeleteBtn.addEventListener('click', () => this.confirmDeleteLead());
        this.elements.closeModal.addEventListener('click', () => this.hideLeadModal());
        this.elements.cancelBtn.addEventListener('click', () => this.hideLeadModal());
        this.elements.leadForm.addEventListener('submit', (e) => this.handleLeadSubmit(e));
        
        // Window events
        window.addEventListener('focus', () => this.handleWindowFocus());
        window.addEventListener('beforeunload', () => this.cleanup());
    }

    // ============================================================================
    // DARK MODE
    // ============================================================================

    toggleDarkMode() {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('salesforce-theme', isDark ? 'dark' : 'light');
        this.showToast(
            `Switched to ${isDark ? 'dark' : 'light'} mode`, 
            'success',
            2000
        );
    }

    // ============================================================================
    // AUTHENTICATION
    // ============================================================================

    async checkAuthentication() {
        try {
            this.showConnectionStatus('checking', 'Checking connection...');

            // Use the same endpoint as displayLeadTransfer for OAuth connection
            const response = await this.apiCall('/api/salesforce/check');

            if (response && response.connected && response.userInfo) {
                // Transform response to match expected format
                const userInfo = {
                    username: response.userInfo.username,
                    display_name: response.userInfo.display_name,
                    organization_name: response.userInfo.organization_name,
                    organization_id: response.userInfo.organization_id,
                    user_id: response.userInfo.user_id
                };
                this.setAuthenticatedState(userInfo);
                await this.loadDashboard();
            } else {
                this.setUnauthenticatedState();
            }
        } catch (error) {
            console.error('L Auth check failed:', error);
            this.setUnauthenticatedState();

            if (error.message.includes('401') || error.message.includes('Unauthorized')) {
                // Ne pas afficher de toast, juste montrer le statut de déconnexion
            } else {
                this.showToast('Connection error. Please check your network.', 'error');
            }
        }
    }

    setAuthenticatedState(userInfo) {
        this.isAuthenticated = true;
        this.currentUser = userInfo;
        
        console.log('=d User authenticated:', userInfo);
        
        // Update UI
        this.elements.userName.textContent = userInfo.display_name || userInfo.username;
        this.elements.userEmail.textContent = userInfo.username; // Email is the username in Salesforce
        this.elements.orgName.textContent = userInfo.organization_name || 'Unknown Org';
        
        // Set user avatar - generate Salesforce-style avatar from initials
        this.setUserAvatar(userInfo);
        
        // Show/hide elements
        this.elements.userInfo.classList.remove('hidden');
        this.elements.connectBtn.classList.add('hidden');
        this.elements.logoutBtn.classList.remove('hidden');
        this.elements.completeLogoutBtn.classList.remove('hidden');
        
        // Connection status
        this.showConnectionStatus('connected');
        
        // Show dashboard
        this.elements.dashboard.classList.remove('hidden');
        
        // Store org info
        this.connectedOrgs.set(this.currentOrg, {
            userInfo,
            connectedAt: new Date().toISOString()
        });
        
        this.updateOrgSelector();
    }

    setUnauthenticatedState() {
        this.isAuthenticated = false;
        this.currentUser = null;
        
        // Show/hide elements
        this.elements.userInfo.classList.add('hidden');
        this.elements.connectBtn.classList.remove('hidden');
        this.elements.logoutBtn.classList.add('hidden');
        this.elements.completeLogoutBtn.classList.add('hidden');
        
        // Connection status
        this.showConnectionStatus('disconnected');
        
        // Hide dashboard
        this.elements.dashboard.classList.add('hidden');
        
        // Clear intervals
        this.clearIntervals();
    }

    showConnectionStatus(status, message = '') {
        switch (status) {
            case 'checking':
                this.elements.notConnected.classList.add('hidden');
                break;
            case 'connected':
                this.elements.notConnected.classList.add('hidden');
                break;
            case 'disconnected':
            default:
                this.elements.notConnected.classList.remove('hidden');
                break;
        }
    }

    setUserAvatar(userInfo) {
        // Generate avatar based on user initials or use Salesforce photo if available
        const initials = this.getUserInitials(userInfo);
        
        // Create a canvas-based avatar with initials
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        
        // Background color based on user ID hash
        const colors = ['#0176D3', '#04844B', '#FFB75D', '#EA001E', '#7B68EE', '#20B2AA'];
        const colorIndex = (userInfo.user_id || userInfo.username).split('').reduce((a, b) => a + b.charCodeAt(0), 0) % colors.length;
        
        ctx.fillStyle = colors[colorIndex];
        ctx.fillRect(0, 0, 32, 32);
        
        // Text (initials)
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initials, 16, 16);
        
        // Convert to data URL and set as image source
        this.elements.userAvatar.src = canvas.toDataURL();
    }

    getUserInitials(userInfo) {
        const displayName = userInfo.display_name || '';
        const username = userInfo.username || '';
        
        if (displayName) {
            const parts = displayName.split(' ');
            if (parts.length >= 2) {
                return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
            } else {
                return parts[0].substring(0, 2).toUpperCase();
            }
        } else if (username) {
            return username.substring(0, 2).toUpperCase();
        }
        
        return 'SF';
    }

    connectToSalesforce() {
        // Redirect to displayLeadTransfer page to authenticate
        // The OAuth connection will be shared between pages
        window.location.href = '../pages/displayLeadTransfer.html';
    }

    async logout() {
        try {
            this.showButtonLoading(this.elements.logoutBtn, 'Logging out...');
            
            // Clear local data
            this.connectedOrgs.delete(this.currentOrg);
            this.clearIntervals();
            
            // Check authentication (will show disconnected state)
            await this.checkAuthentication();
            
            this.showToast('Logged out successfully', 'success');
        } catch (error) {
            console.error('L Logout failed:', error);
            this.showToast('Logout failed. Please try again.', 'error');
        } finally {
            this.resetButtonLoading(this.elements.logoutBtn, 'Logout');
        }
    }

    completeLogout() {
        // Clear all local storage and force complete logout
        localStorage.removeItem('salesforce-theme');
        this.connectedOrgs.clear();
        this.clearIntervals();
        
        // Redirect to Salesforce logout
        window.location.href = 'https://login.salesforce.com/secur/logout.jsp';
    }

    // ============================================================================
    // TOKEN REFRESH & AUTO-REFRESH
    // ============================================================================

    startTokenRefreshInterval() {
        // Check token validity every 30 minutes
        this.tokenRefreshInterval = setInterval(() => {
            if (this.isAuthenticated) {
                this.checkAuthentication();
            }
        }, 30 * 60 * 1000); // 30 minutes
    }

    startAutoRefresh() {
        // Auto-refresh leads every 2 minutes when authenticated
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }
        
        this.autoRefreshInterval = setInterval(() => {
            if (this.isAuthenticated && document.visibilityState === 'visible') {
                this.loadLeads(false); // Silent refresh
            }
        }, 2 * 60 * 1000); // 2 minutes
    }

    clearIntervals() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
        if (this.tokenRefreshInterval) {
            clearInterval(this.tokenRefreshInterval);
            this.tokenRefreshInterval = null;
        }
    }

    handleWindowFocus() {
        // Refresh data when window regains focus
        if (this.isAuthenticated) {
            this.checkAuthentication();
        }
    }

    // ============================================================================
    // MULTI-ORG MANAGEMENT
    // ============================================================================

    updateOrgSelector() {
        const select = this.elements.orgSelect;
        select.innerHTML = '';
        
        // Add connected orgs
        this.connectedOrgs.forEach((orgData, orgId) => {
            const option = document.createElement('option');
            option.value = orgId;
            option.textContent = orgData.userInfo.organization_name || orgId;
            if (orgId === this.currentOrg) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        // Show selector if multiple orgs
        if (this.connectedOrgs.size > 1) {
            this.elements.orgSelector.classList.remove('hidden');
        } else {
            this.elements.orgSelector.classList.add('hidden');
        }
    }

    async switchOrg(orgId) {
        if (orgId === this.currentOrg) return;
        
        try {
            this.showToast(`Switching to ${orgId}...`, 'info');
            this.currentOrg = orgId;
            
            // Re-check authentication for new org
            await this.checkAuthentication();
            
        } catch (error) {
            console.error('L Org switch failed:', error);
            this.showToast('Failed to switch organization', 'error');
            
            // Revert selection
            this.elements.orgSelect.value = this.currentOrg;
        }
    }

    // ============================================================================
    // DASHBOARD & LEADS MANAGEMENT
    // ============================================================================

    async loadDashboard() {
        try {
            // Show loading during initial data load
            this.showConnectionStatus('checking', 'Loading leads data...');
            
            await this.loadLeads();
            this.startAutoRefresh();
            
            // Hide loading state after data is loaded
            this.showConnectionStatus('connected');
        } catch (error) {
            console.error('L Dashboard load failed:', error);
            this.showToast('Failed to load dashboard', 'error');
        }
    }

    async loadLeads(showLoading = true) {
        try {
            if (showLoading) {
                this.showTableLoading(true);
            }
            
            const response = await this.apiCall('/api/leads');
            
            if (Array.isArray(response)) {
                this.leads = response;
                this.updateStats();
                this.filterLeads();
                
            } else {
                throw new Error('Invalid response format');
            }
            
        } catch (error) {
            console.error('L Failed to load leads:', error);
            
            if (error.message.includes('401')) {
                await this.checkAuthentication();
                return;
            }
            
            this.showToast('Failed to load leads', 'error');
            this.showEmptyState();
        } finally {
            this.showTableLoading(false);
        }
    }

    async refreshLeads() {
        this.showButtonLoading(this.elements.refreshBtn, 'Refreshing...');
        this.elements.refreshText.innerHTML = '<i class=\"fas fa-spinner fa-spin mr-2\"></i>Refreshing...';
        
        try {
            await this.loadLeads();
        } finally {
            this.resetButtonLoading(this.elements.refreshBtn, 'Refresh');
            this.elements.refreshText.innerHTML = 'Refresh';
        }
    }

    updateStats() {
        const total = this.leads.length;
        const qualified = this.leads.filter(lead => 
            lead.Status && lead.Status.includes('Qualified')).length;
        const working = this.leads.filter(lead => 
            lead.Status && lead.Status.includes('Working')).length;
        const newLeads = this.leads.filter(lead => 
            !lead.Status || lead.Status.includes('Open')).length;

        this.elements.totalLeads.textContent = total;
        this.elements.qualifiedLeads.textContent = qualified;
        this.elements.workingLeads.textContent = working;
        this.elements.newLeads.textContent = newLeads;
    }

    filterLeads() {
        const searchTerm = this.elements.searchInput.value.toLowerCase();
        const statusFilter = this.elements.statusFilter.value;

        this.filteredLeads = this.leads.filter(lead => {
            const matchesSearch = !searchTerm || 
                (lead.FirstName && lead.FirstName.toLowerCase().includes(searchTerm)) ||
                (lead.LastName && lead.LastName.toLowerCase().includes(searchTerm)) ||
                (lead.Company && lead.Company.toLowerCase().includes(searchTerm)) ||
                (lead.Email && lead.Email.toLowerCase().includes(searchTerm));

            const matchesStatus = !statusFilter || lead.Status === statusFilter;

            return matchesSearch && matchesStatus;
        });

        this.currentPage = 1;
        this.renderLeadsTable();
    }

    renderLeadsTable() {
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        const pageLeads = this.filteredLeads.slice(startIndex, endIndex);

        if (this.filteredLeads.length === 0) {
            this.showEmptyState();
            return;
        }

        this.showLeadsTable();
        
        const tbody = this.elements.leadsTableBody;
        tbody.innerHTML = '';

        pageLeads.forEach(lead => {
            const row = this.createLeadRow(lead);
            tbody.appendChild(row);
        });

        this.updatePagination();
    }

    createLeadRow(lead) {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150';
        
        const statusClass = this.getStatusClass(lead.Status);
        const createdDate = lead.CreatedDate ? new Date(lead.CreatedDate).toLocaleDateString() : '-';
        
        row.innerHTML = `
            <!-- Fixed Name column -->
            <td class="sticky left-0 z-20 bg-white dark:bg-gray-800 px-4 py-3 whitespace-nowrap border-r border-gray-200 dark:border-gray-600">
                <div class="flex items-center">
                    <div class="flex-shrink-0 h-10 w-10">
                        <div class="h-10 w-10 rounded-full bg-salesforce/10 flex items-center justify-center">
                            <span class="text-sm font-medium text-salesforce">
                                ${this.getInitials(lead.FirstName, lead.LastName)}
                            </span>
                        </div>
                    </div>
                    <div class="ml-4">
                        <div class="text-sm font-medium text-gray-900 dark:text-white">
                            ${this.escapeHtml((lead.FirstName || '') + ' ' + (lead.LastName || '')).trim()}
                        </div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">
                            ${this.escapeHtml(lead.Title || '')}
                        </div>
                    </div>
                </div>
            </td>
            <!-- Company column -->
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                ${this.escapeHtml(lead.Company || '-')}
            </td>
            <!-- Email column -->
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                ${lead.Email ? `<a href="mailto:${lead.Email}" class="text-salesforce hover:underline">${this.escapeHtml(lead.Email)}</a>` : '-'}
            </td>
            <!-- Phone column -->
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                ${lead.Phone ? `<a href="tel:${lead.Phone}" class="text-salesforce hover:underline">${this.escapeHtml(lead.Phone)}</a>` : '-'}
            </td>
            <!-- State column -->
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                ${this.escapeHtml(lead.State || '-')}
            </td>
            <!-- Status column -->
            <td class="px-4 py-3 whitespace-nowrap">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}">
                    ${this.escapeHtml(lead.Status || 'Unknown')}
                </span>
            </td>
            <!-- Owner column -->
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                ${this.escapeHtml(lead.Owner?.Name || lead.OwnerId || '-')}
            </td>
            <!-- Unread column -->
            <td class="px-4 py-3 whitespace-nowrap text-center">
                <span class="inline-flex items-center justify-center w-6 h-6 rounded-full ${lead.IsUnreadByOwner ? 'bg-blue-100 dark:bg-blue-900/20' : 'bg-gray-100 dark:bg-gray-700'}">
                    <i class="fas fa-envelope${lead.IsUnreadByOwner ? '' : '-open'} text-xs ${lead.IsUnreadByOwner ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}"></i>
                </span>
            </td>
            <!-- Created column -->
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                ${createdDate}
            </td>
            <!-- Actions column -->
            <td class="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                <div class="flex items-center justify-end space-x-2">
                    <button onclick="window.salesforceApp.editLead('${lead.Id}')" 
                        class="text-salesforce hover:text-salesforce-dark transition-colors duration-150 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
                        title="Edit lead">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="window.salesforceApp.deleteLead('${lead.Id}')" 
                        class="text-red-600 hover:text-red-900 transition-colors duration-150 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
                        title="Delete lead">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        
        return row;
    }

    getStatusClass(status) {
        if (!status) return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
        
        if (status.includes('Open')) {
            return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
        } else if (status.includes('Working')) {
            return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
        } else if (status.includes('Converted')) {
            return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
        } else if (status.includes('Closed')) {
            return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
        }
        
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }

    getInitials(firstName, lastName) {
        const first = firstName ? firstName.charAt(0).toUpperCase() : '';
        const last = lastName ? lastName.charAt(0).toUpperCase() : '';
        return first + last || '?';
    }

    showTableLoading(show) {
        if (show) {
            this.elements.tableLoading.classList.remove('hidden');
            this.elements.emptyState.classList.add('hidden');
            this.elements.leadsTableContainer.classList.add('hidden');
        } else {
            this.elements.tableLoading.classList.add('hidden');
        }
    }

    showEmptyState() {
        this.elements.tableLoading.classList.add('hidden');
        this.elements.emptyState.classList.remove('hidden');
        this.elements.leadsTableContainer.classList.add('hidden');
    }

    showLeadsTable() {
        this.elements.tableLoading.classList.add('hidden');
        this.elements.emptyState.classList.add('hidden');
        this.elements.leadsTableContainer.classList.remove('hidden');
    }

    updatePagination() {
        const totalRecords = this.filteredLeads.length;
        const totalPages = Math.ceil(totalRecords / this.pageSize);
        const startRecord = (this.currentPage - 1) * this.pageSize + 1;
        const endRecord = Math.min(this.currentPage * this.pageSize, totalRecords);

        this.elements.showingFrom.textContent = startRecord;
        this.elements.showingTo.textContent = endRecord;
        this.elements.totalRecords.textContent = totalRecords;

        // Generate pagination buttons
        this.renderPaginationButtons(totalPages);
    }

    renderPaginationButtons(totalPages) {
        const nav = this.elements.paginationNav;
        nav.innerHTML = '';

        if (totalPages <= 1) return;

        // Previous button
        const prevButton = this.createPaginationButton(
            '<i class="fas fa-chevron-left"></i>',
            this.currentPage - 1,
            this.currentPage === 1
        );
        nav.appendChild(prevButton);

        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= this.currentPage - 1 && i <= this.currentPage + 1)) {
                const pageButton = this.createPaginationButton(i, i, false, i === this.currentPage);
                nav.appendChild(pageButton);
            } else if (i === this.currentPage - 2 || i === this.currentPage + 2) {
                const dots = document.createElement('span');
                dots.className = 'relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-sm font-medium text-gray-700 dark:text-gray-300';
                dots.textContent = '...';
                nav.appendChild(dots);
            }
        }

        // Next button
        const nextButton = this.createPaginationButton(
            '<i class="fas fa-chevron-right"></i>',
            this.currentPage + 1,
            this.currentPage === totalPages
        );
        nav.appendChild(nextButton);
    }

    createPaginationButton(text, page, disabled, active = false) {
        const button = document.createElement('button');
        button.innerHTML = text;
        button.disabled = disabled;
        
        let className = 'relative inline-flex items-center px-4 py-2 border text-sm font-medium transition-colors duration-150';
        
        if (active) {
            className += ' border-salesforce bg-salesforce text-white';
        } else if (disabled) {
            className += ' border-gray-300 dark:border-dark-border bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed';
        } else {
            className += ' border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600';
        }
        
        button.className = className;
        
        if (!disabled) {
            button.addEventListener('click', () => {
                this.currentPage = page;
                this.renderLeadsTable();
            });
        }
        
        return button;
    }

    // ============================================================================
    // LEAD CRUD OPERATIONS
    // ============================================================================

    showCreateLeadModal() {
        this.elements.modalTitle.textContent = 'Create New Lead';
        this.elements.leadForm.reset();
        this.elements.leadForm.querySelector('#leadId').value = '';
        this.elements.saveBtnText.textContent = 'Create Lead';
        this.showLeadModal();
    }

    editLead(leadId) {
        const lead = this.leads.find(l => l.Id === leadId);
        if (lead) {
            this.showToast(`Edit ${lead.FirstName} ${lead.LastName}`, 'info');
        }
    }

    deleteLead(leadId) {
        const lead = this.leads.find(l => l.Id === leadId);
        if (!lead) return;

        this.elements.deleteLeadName.textContent = `${lead.FirstName || ''} ${lead.LastName || ''} (${lead.Company || ''})`;
        this.currentDeleteId = leadId;
        this.showDeleteModal();

    }

    exportLeads() {
        if (this.filteredLeads.length === 0) {
            this.showToast('No leads to export', 'warning');
            return;
        }

        const csvContent = this.generateCSV(this.filteredLeads);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `salesforce-leads-${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.showToast(`Exported ${this.filteredLeads.length} leads`, 'success');
        }
    }

    generateCSV(leads) {
        const headers = ['First Name', 'Last Name', 'Company', 'Email', 'Phone', 'Status', 'Title', 'State'];
        const csvRows = [headers.join(',')];

        leads.forEach(lead => {
            const row = [
                this.escapeCSV(lead.FirstName || ''),
                this.escapeCSV(lead.LastName || ''),
                this.escapeCSV(lead.Company || ''),
                this.escapeCSV(lead.Email || ''),
                this.escapeCSV(lead.Phone || ''),
                this.escapeCSV(lead.Status || ''),
                this.escapeCSV(lead.Title || ''),
                this.escapeCSV(lead.State || '')
            ];
            csvRows.push(row.join(','));
        });

        return csvRows.join('\\n');
    }

    // ============================================================================
    // API CALLS
    // ============================================================================

    async apiCall(endpoint, options = {}) {
        const defaultOptions = {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-Org-Id': this.currentOrg
            }
        };

        try {
            const response = await fetch(`${this.apiBase}${endpoint}`, {
                ...defaultOptions,
                ...options,
                headers: { ...defaultOptions.headers, ...options.headers }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // Token expired or invalid
                    this.setUnauthenticatedState();
                    throw new Error('Unauthorized - please reconnect');
                }
                
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();

        } catch (error) {
            console.error(`L API call failed (${endpoint}):`, error);
            throw error;
        }
    }

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

    showToast(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `max-w-sm w-full bg-white dark:bg-dark-card shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 dark:ring-gray-600 overflow-hidden animate-slide-up`;
        
        const iconClass = {
            success: 'fas fa-check-circle text-green-400',
            error: 'fas fa-exclamation-circle text-red-400',
            warning: 'fas fa-exclamation-triangle text-yellow-400',
            info: 'fas fa-info-circle text-blue-400'
        }[type];

        toast.innerHTML = `
            <div class="p-4">
                <div class="flex items-start">
                    <div class="flex-shrink-0">
                        <i class="${iconClass}"></i>
                    </div>
                    <div class="ml-3 w-0 flex-1 pt-0.5">
                        <p class="text-sm font-medium text-gray-900 dark:text-white">${message}</p>
                    </div>
                    <div class="ml-4 flex-shrink-0 flex">
                        <button class="bg-white dark:bg-dark-card rounded-md inline-flex text-gray-400 hover:text-gray-500 dark:hover:text-gray-300" onclick="this.parentElement.parentElement.parentElement.parentElement.remove()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.elements.toastContainer.appendChild(toast);

        // Auto remove after duration
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, duration);
    }

    showButtonLoading(button, text) {
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>${text}`;
    }

    resetButtonLoading(button, text) {
        button.disabled = false;
        button.innerHTML = text;
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeCSV(text) {
        if (text.includes(',') || text.includes('"') || text.includes('\\n')) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    }

    cleanup() {
        this.clearIntervals();
    }

    // ============================================================================
    // TABLE SORTING
    // ============================================================================

    sortTable(column) {
        if (!this.leads || this.leads.length === 0) return;

        // Toggle sort direction
        if (this.currentSortColumn === column) {
            this.currentSortDirection = this.currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSortColumn = column;
            this.currentSortDirection = 'asc';
        }

        // Sort the leads array
        this.leads.sort((a, b) => {
            let aValue, bValue;

            switch (column) {
                case 'name':
                    aValue = `${a.FirstName || ''} ${a.LastName || ''}`.trim().toLowerCase();
                    bValue = `${b.FirstName || ''} ${b.LastName || ''}`.trim().toLowerCase();
                    break;
                case 'company':
                    aValue = (a.Company || '').toLowerCase();
                    bValue = (b.Company || '').toLowerCase();
                    break;
                case 'status':
                    aValue = (a.Status || '').toLowerCase();
                    bValue = (b.Status || '').toLowerCase();
                    break;
                case 'created':
                    aValue = new Date(a.CreatedDate || 0);
                    bValue = new Date(b.CreatedDate || 0);
                    break;
                default:
                    return 0;
            }

            // Handle date comparison
            if (aValue instanceof Date && bValue instanceof Date) {
                return this.currentSortDirection === 'asc' ? aValue - bValue : bValue - aValue;
            }

            // Handle string comparison
            if (aValue < bValue) {
                return this.currentSortDirection === 'asc' ? -1 : 1;
            }
            if (aValue > bValue) {
                return this.currentSortDirection === 'asc' ? 1 : -1;
            }
            return 0;
        });

        // Update sort icons
        this.updateSortIcons(column);

        // Re-filter and render
        this.filterLeads();
    }

    updateSortIcons(activeColumn) {
        // Reset all sort icons
        const sortHeaders = document.querySelectorAll('[onclick*="sortTable"] i.fas');
        sortHeaders.forEach(icon => {
            icon.className = 'fas fa-sort text-gray-400';
        });

        // Update active column icon
        const activeHeader = document.querySelector(`[onclick="window.salesforceApp.sortTable('${activeColumn}')"] i.fas`);
        if (activeHeader) {
            const iconClass = this.currentSortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
            activeHeader.className = `fas ${iconClass} text-salesforce`;
        }
    }

    // ============================================================================
    // MODAL MANAGEMENT
    // ============================================================================

    showLeadModal() {
        this.elements.leadModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    hideLeadModal() {
        this.elements.leadModal.classList.add('hidden');
        document.body.style.overflow = 'auto';
    }

    showDeleteModal() {
        this.elements.deleteModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    hideDeleteModal() {
        this.elements.deleteModal.classList.add('hidden');
        document.body.style.overflow = 'auto';
    }

    async confirmDeleteLead() {
        if (!this.currentDeleteId) return;

        try {
            this.showButtonLoading(this.elements.confirmDeleteBtn, 'Deleting...');
            
            await this.apiCall(`/api/leads/${this.currentDeleteId}`, { method: 'DELETE' });
            
            this.showToast('Lead deleted successfully', 'success');
            await this.loadLeads();
            this.hideDeleteModal();
            
        } catch (error) {
            console.error('Delete failed:', error);
            this.showToast('Failed to delete lead', 'error');
        } finally {
            this.resetButtonLoading(this.elements.confirmDeleteBtn, 'Delete');
        }
    }

    async handleLeadSubmit(event) {
        event.preventDefault();
        
        const formData = new FormData(this.elements.leadForm);
        const leadData = {
            FirstName: formData.get('FirstName'),
            LastName: formData.get('LastName'),
            Company: formData.get('Company'),
            Email: formData.get('Email'),
            Phone: formData.get('Phone'),
            Title: formData.get('Title'),
            State: formData.get('State'),
            Status: formData.get('Status'),
            LeadSource: formData.get('LeadSource')
        };

        const leadId = formData.get('Id');
        const isEdit = leadId && leadId.trim() !== '';

        try {
            this.showButtonLoading(this.elements.saveBtn, isEdit ? 'Updating...' : 'Creating...');

            if (isEdit) {
                await this.apiCall(`/api/leads/${leadId}`, {
                    method: 'PUT',
                    body: JSON.stringify(leadData)
                });
                this.showToast('Lead updated successfully', 'success');
            } else {
                await this.apiCall('/api/leads', {
                    method: 'POST',
                    body: JSON.stringify(leadData)
                });
                this.showToast('Lead created successfully', 'success');
            }

            await this.loadLeads();
            this.hideLeadModal();

        } catch (error) {
            console.error('❌ Lead save failed:', error);
            this.showToast(`Failed to ${isEdit ? 'update' : 'create'} lead`, 'error');
        } finally {
            this.resetButtonLoading(this.elements.saveBtn, isEdit ? 'Update Lead' : 'Create Lead');
        }
    }
}

// ============================================================================
// INITIALIZE APPLICATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    try {
        window.salesforceApp = new SalesforceLeadManager();
        console.log('Application initialized successfully');
    } catch (error) {
        console.error('L Failed to initialize application:', error);
        document.body.innerHTML = `
            <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg">
                <div class="max-w-md w-full bg-white dark:bg-dark-card shadow-lg rounded-lg p-6">
                    <div class="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 dark:bg-red-900/20 rounded-full">
                        <i class="fas fa-exclamation-triangle text-red-600 dark:text-red-400"></i>
                    </div>
                    <div class="mt-3 text-center">
                        <h3 class="text-lg font-medium text-gray-900 dark:text-white">Initialization Error</h3>
                        <div class="mt-2">
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                The application failed to load properly. Please refresh the page or contact support.
                            </p>
                        </div>
                        <div class="mt-4">
                            <button onclick="window.location.reload()" class="inline-flex items-center px-4 py-2 bg-salesforce hover:bg-salesforce-dark text-white text-sm font-medium rounded-md transition-colors duration-200">
                                <i class="fas fa-refresh mr-2"></i>Reload Page
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
});

// Global error handlers
window.addEventListener('error', (event) => {
    console.error('L Global error:', event.error);
    if (window.salesforceApp) {
        window.salesforceApp.showToast('An unexpected error occurred', 'error');
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('L Unhandled promise rejection:', event.reason);
    if (window.salesforceApp) {
        window.salesforceApp.showToast('An unexpected error occurred', 'error');
    }
});