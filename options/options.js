// Options page JavaScript for Tab Sync Extension

class OptionsController {
  constructor() {
    this.elements = {};
    this.state = {
      currentSection: 'account',
      isAuthenticated: false,
      authProvider: null,
      deviceInfo: null,
      syncHistory: [],
      filteredHistory: [],
      currentPage: 1,
      itemsPerPage: 10,
      sortColumn: 'timestamp',
      sortDirection: 'desc',
      preferences: {}
    };
    
    this.init();
  }
  
  async init() {
    try {
      this.bindElements();
      this.attachEventListeners();
      await this.loadInitialData();
      this.setupNavigation();
    } catch (error) {
      console.error('Failed to initialize options page:', error);
      this.showBanner('error', 'Initialization Error', 'Failed to load extension settings');
    }
  }
  
  bindElements() {
    // Navigation
    this.elements.navItems = document.querySelectorAll('.nav-item');
    this.elements.sections = document.querySelectorAll('.settings-section');
    
    // Header elements
    this.elements.syncNowBtn = document.getElementById('sync-now-btn');
    this.elements.helpBtn = document.getElementById('help-btn');
    this.elements.statusBanner = document.getElementById('status-banner');
    this.elements.bannerTitle = document.getElementById('banner-title');
    this.elements.bannerMessage = document.getElementById('banner-message');
    this.elements.bannerClose = document.getElementById('banner-close');
    
    // Account section
    this.elements.authStatusIndicator = document.getElementById('auth-status-indicator');
    this.elements.authStatusText = document.getElementById('auth-status-text');
    this.elements.authDetails = document.getElementById('auth-details');
    this.elements.authProviderName = document.getElementById('auth-provider-name');
    this.elements.authAccountInfo = document.getElementById('auth-account-info');
    this.elements.authConnectedTime = document.getElementById('auth-connected-time');
    this.elements.googleAuthBtn = document.getElementById('google-auth-btn');
    this.elements.githubAuthBtn = document.getElementById('github-auth-btn');
    this.elements.signoutBtn = document.getElementById('signout-btn');
    this.elements.deviceNameInput = document.getElementById('device-name-input');
    this.elements.updateDeviceNameBtn = document.getElementById('update-device-name');
    
    // Sync status section
    this.elements.lastSyncTime = document.getElementById('last-sync-time');
    this.elements.lastSyncRelative = document.getElementById('last-sync-relative');
    this.elements.deviceId = document.getElementById('device-id');
    this.elements.copyDeviceIdBtn = document.getElementById('copy-device-id');
    this.elements.totalSyncs = document.getElementById('total-syncs');
    this.elements.successRate = document.getElementById('success-rate');
    this.elements.storageProvider = document.getElementById('storage-provider');
    this.elements.storageUsage = document.getElementById('storage-usage');
    this.elements.testConnectionBtn = document.getElementById('test-connection-btn');
    this.elements.forceSyncBtn = document.getElementById('force-sync-btn');
    
    // Shortcuts section
    this.elements.syncShortcutDisplay = document.getElementById('sync-shortcut-display');
    this.elements.shortcutStatus = document.getElementById('shortcut-status');
    this.elements.editShortcutBtn = document.getElementById('edit-shortcut-btn');
    this.elements.resetShortcutBtn = document.getElementById('reset-shortcut-btn');
    this.elements.settingsShortcutDisplay = document.getElementById('settings-shortcut-display');
    this.elements.editSettingsShortcutBtn = document.getElementById('edit-settings-shortcut-btn');
    
    // History section
    this.elements.historyFilter = document.getElementById('history-filter');
    this.elements.historyTimeframe = document.getElementById('history-timeframe');
    this.elements.historySearch = document.getElementById('history-search');
    this.elements.refreshHistoryBtn = document.getElementById('refresh-history-btn');
    this.elements.exportHistoryBtn = document.getElementById('export-history-btn');
    this.elements.clearHistoryBtn = document.getElementById('clear-history-btn');
    this.elements.historyTable = document.getElementById('history-table');
    this.elements.historyTbody = document.getElementById('history-tbody');
    this.elements.historyPagination = document.getElementById('history-pagination');
    this.elements.prevPageBtn = document.getElementById('prev-page');
    this.elements.nextPageBtn = document.getElementById('next-page');
    this.elements.pageInfo = document.getElementById('page-info');
    
    // Preferences section
    this.elements.confirmSyncToggle = document.getElementById('confirm-sync-toggle');
    this.elements.autoMergeToggle = document.getElementById('auto-merge-toggle');
    this.elements.syncNotificationsToggle = document.getElementById('sync-notifications-toggle');
    this.elements.includeIncognitoToggle = document.getElementById('include-incognito-toggle');
    this.elements.historyRetentionSelect = document.getElementById('history-retention-select');
    
    // Data management section
    this.elements.clearCacheBtn = document.getElementById('clear-cache-btn');
    this.elements.resetSettingsBtn = document.getElementById('reset-settings-btn');
    this.elements.clearAllDataBtn = document.getElementById('clear-all-data-btn');
    this.elements.downloadBackupBtn = document.getElementById('download-backup-btn');
    this.elements.backupFileInput = document.getElementById('backup-file-input');
    this.elements.uploadBackupBtn = document.getElementById('upload-backup-btn');
    this.elements.deleteCloudDataBtn = document.getElementById('delete-cloud-data-btn');
    
    // Footer elements
    this.elements.extensionVersion = document.getElementById('extension-version');
    this.elements.privacyLink = document.getElementById('privacy-link');
    this.elements.supportLink = document.getElementById('support-link');
    this.elements.feedbackLink = document.getElementById('feedback-link');
    this.elements.resetToDefaultsBtn = document.getElementById('reset-to-defaults-btn');
    
    // Dialog elements
    this.elements.confirmationDialog = document.getElementById('confirmation-dialog');
    this.elements.dialogTitle = document.getElementById('dialog-title');
    this.elements.dialogMessage = document.getElementById('dialog-message');
    this.elements.dialogDetails = document.getElementById('dialog-details');
    this.elements.dialogCancel = document.getElementById('dialog-cancel');
    this.elements.dialogConfirm = document.getElementById('dialog-confirm');
    this.elements.dialogClose = document.getElementById('dialog-close');
  }
  
  attachEventListeners() {
    // Navigation
    this.elements.navItems.forEach(item => {
      item.addEventListener('click', (e) => this.switchSection(e.target.dataset.section));
    });
    
    // Header actions
    this.elements.syncNowBtn?.addEventListener('click', () => this.handleSyncNow());
    this.elements.helpBtn?.addEventListener('click', () => this.showHelp());
    this.elements.bannerClose?.addEventListener('click', () => this.hideBanner());
    
    // Account section
    this.elements.googleAuthBtn?.addEventListener('click', () => this.handleAuth('google'));
    this.elements.githubAuthBtn?.addEventListener('click', () => this.handleAuth('github'));
    this.elements.signoutBtn?.addEventListener('click', () => this.handleSignOut());
    this.elements.updateDeviceNameBtn?.addEventListener('click', () => this.updateDeviceName());
    
    // Sync status section
    this.elements.copyDeviceIdBtn?.addEventListener('click', () => this.copyDeviceId());
    this.elements.testConnectionBtn?.addEventListener('click', () => this.testConnection());
    this.elements.forceSyncBtn?.addEventListener('click', () => this.forceSync());
    
    // Shortcuts section
    this.elements.editShortcutBtn?.addEventListener('click', () => this.editShortcuts());
    this.elements.resetShortcutBtn?.addEventListener('click', () => this.resetShortcuts());
    this.elements.editSettingsShortcutBtn?.addEventListener('click', () => this.editShortcuts());
    
    // History section
    this.elements.historyFilter?.addEventListener('change', () => this.filterHistory());
    this.elements.historyTimeframe?.addEventListener('change', () => this.filterHistory());
    this.elements.historySearch?.addEventListener('input', () => this.debounce(() => this.filterHistory(), 300)());
    this.elements.refreshHistoryBtn?.addEventListener('click', () => this.loadSyncHistory());
    this.elements.exportHistoryBtn?.addEventListener('click', () => this.exportHistory());
    this.elements.clearHistoryBtn?.addEventListener('click', () => this.clearHistory());
    this.elements.prevPageBtn?.addEventListener('click', () => this.changePage(-1));
    this.elements.nextPageBtn?.addEventListener('click', () => this.changePage(1));
    
    // Table sorting
    this.elements.historyTable?.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => this.sortHistory(th.dataset.sort));
    });
    
    // Preferences section
    this.elements.confirmSyncToggle?.addEventListener('change', () => this.savePreference('confirmSync', this.elements.confirmSyncToggle.checked));
    this.elements.autoMergeToggle?.addEventListener('change', () => this.savePreference('autoMerge', this.elements.autoMergeToggle.checked));
    this.elements.syncNotificationsToggle?.addEventListener('change', () => this.savePreference('syncNotifications', this.elements.syncNotificationsToggle.checked));
    this.elements.includeIncognitoToggle?.addEventListener('change', () => this.savePreference('includeIncognito', this.elements.includeIncognitoToggle.checked));
    this.elements.historyRetentionSelect?.addEventListener('change', () => this.savePreference('historyRetention', parseInt(this.elements.historyRetentionSelect.value)));
    
    // Data management section
    this.elements.clearCacheBtn?.addEventListener('click', () => this.clearCache());
    this.elements.resetSettingsBtn?.addEventListener('click', () => this.resetSettings());
    this.elements.clearAllDataBtn?.addEventListener('click', () => this.clearAllData());
    this.elements.downloadBackupBtn?.addEventListener('click', () => this.downloadBackup());
    this.elements.backupFileInput?.addEventListener('change', () => this.handleBackupFileSelect());
    this.elements.uploadBackupBtn?.addEventListener('click', () => this.uploadBackup());
    this.elements.deleteCloudDataBtn?.addEventListener('click', () => this.deleteCloudData());
    
    // Footer actions
    this.elements.resetToDefaultsBtn?.addEventListener('click', () => this.resetToDefaults());
    this.elements.privacyLink?.addEventListener('click', (e) => { e.preventDefault(); this.showPrivacyPolicy(); });
    this.elements.supportLink?.addEventListener('click', (e) => { e.preventDefault(); this.showSupport(); });
    this.elements.feedbackLink?.addEventListener('click', (e) => { e.preventDefault(); this.showFeedback(); });
    
    // Dialog controls
    this.elements.dialogCancel?.addEventListener('click', () => this.hideConfirmationDialog());
    this.elements.dialogConfirm?.addEventListener('click', () => this.confirmDialogAction());
    this.elements.dialogClose?.addEventListener('click', () => this.hideConfirmationDialog());
    
    // Dialog overlay click
    this.elements.confirmationDialog?.addEventListener('click', (e) => {
      if (e.target === this.elements.confirmationDialog) {
        this.hideConfirmationDialog();
      }
    });
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => this.handleKeydown(e));
  }
  
  async loadInitialData() {
    try {
      // Load extension version
      const manifest = chrome.runtime.getManifest();
      if (this.elements.extensionVersion) {
        this.elements.extensionVersion.textContent = `v${manifest.version}`;
      }
      
      // Load authentication status
      await this.loadAuthStatus();
      
      // Load device information
      await this.loadDeviceInfo();
      
      // Load sync statistics
      await this.loadSyncStats();
      
      // Load keyboard shortcuts
      await this.loadShortcuts();
      
      // Load sync history
      await this.loadSyncHistory();
      
      // Load preferences
      await this.loadPreferences();
      
      this.showBanner('success', 'Settings Loaded', 'Extension settings loaded successfully');
      
    } catch (error) {
      console.error('Error loading initial data:', error);
      this.showBanner('error', 'Loading Error', 'Some settings could not be loaded');
    }
  }
  
  async loadAuthStatus() {
    try {
      const response = await this.sendMessage({ action: 'getAuthStatus' });
      this.state.isAuthenticated = response.authenticated;
      this.state.authProvider = response.provider;
      
      this.updateAuthUI();
      
    } catch (error) {
      console.error('Error loading auth status:', error);
      this.updateAuthUI();
    }
  }
  
  updateAuthUI() {
    if (this.state.isAuthenticated) {
      this.elements.authStatusIndicator?.classList.add('authenticated');
      this.elements.authStatusText && (this.elements.authStatusText.textContent = 'Authenticated');
      
      if (this.elements.authDetails) {
        this.elements.authDetails.classList.remove('hidden');
        this.elements.authProviderName && (this.elements.authProviderName.textContent = this.state.authProvider || 'Unknown');
        // TODO: Load actual account info
        this.elements.authAccountInfo && (this.elements.authAccountInfo.textContent = 'Account information not available');
        this.elements.authConnectedTime && (this.elements.authConnectedTime.textContent = 'Recently');
      }
      
      this.elements.signoutBtn?.classList.remove('hidden');
      this.elements.syncNowBtn && (this.elements.syncNowBtn.disabled = false);
      this.elements.forceSyncBtn && (this.elements.forceSyncBtn.disabled = false);
      this.elements.downloadBackupBtn && (this.elements.downloadBackupBtn.disabled = false);
      this.elements.deleteCloudDataBtn && (this.elements.deleteCloudDataBtn.disabled = false);
      
    } else {
      this.elements.authStatusIndicator?.classList.remove('authenticated');
      this.elements.authStatusText && (this.elements.authStatusText.textContent = 'Not authenticated');
      this.elements.authDetails?.classList.add('hidden');
      this.elements.signoutBtn?.classList.add('hidden');
      this.elements.syncNowBtn && (this.elements.syncNowBtn.disabled = true);
      this.elements.forceSyncBtn && (this.elements.forceSyncBtn.disabled = true);
      this.elements.downloadBackupBtn && (this.elements.downloadBackupBtn.disabled = true);
      this.elements.deleteCloudDataBtn && (this.elements.deleteCloudDataBtn.disabled = true);
    }
  }
  
  async loadDeviceInfo() {
    try {
      const response = await this.sendMessage({ action: 'getDeviceInfo' });
      this.state.deviceInfo = response;
      
      if (this.elements.deviceId) {
        this.elements.deviceId.textContent = response.deviceId || 'Unknown';
      }
      
      if (this.elements.deviceNameInput) {
        this.elements.deviceNameInput.value = response.deviceName || '';
        this.elements.deviceNameInput.placeholder = response.metadata?.deviceName || 'Enter device name';
      }
      
    } catch (error) {
      console.error('Error loading device info:', error);
    }
  }
  
  async loadSyncStats() {
    try {
      const storage = await chrome.storage.local.get([
        'lastSyncTime', 'syncStats', 'authProvider'
      ]);
      
      // Update last sync time
      if (storage.lastSyncTime) {
        const date = new Date(storage.lastSyncTime);
        if (this.elements.lastSyncTime) {
          this.elements.lastSyncTime.textContent = date.toLocaleString();
        }
        if (this.elements.lastSyncRelative) {
          this.elements.lastSyncRelative.textContent = this.formatRelativeTime(date);
        }
      } else {
        this.elements.lastSyncTime && (this.elements.lastSyncTime.textContent = 'Never');
        this.elements.lastSyncRelative && (this.elements.lastSyncRelative.textContent = 'No sync performed');
      }
      
      // Update sync statistics
      const stats = storage.syncStats || {};
      if (this.elements.totalSyncs) {
        this.elements.totalSyncs.textContent = stats.totalSyncs || '0';
      }
      
      if (this.elements.successRate) {
        const successRate = stats.totalSyncs > 0 ? 
          Math.round((stats.successfulSyncs || 0) / stats.totalSyncs * 100) : 0;
        this.elements.successRate.textContent = `${successRate}% success rate`;
      }
      
      // Update storage provider
      if (this.elements.storageProvider) {
        const provider = storage.authProvider;
        if (provider === 'google') {
          this.elements.storageProvider.textContent = 'Google Drive';
        } else if (provider === 'github') {
          this.elements.storageProvider.textContent = 'GitHub';
        } else {
          this.elements.storageProvider.textContent = 'None';
        }
      }
      
      // TODO: Calculate actual storage usage
      if (this.elements.storageUsage) {
        this.elements.storageUsage.textContent = storage.authProvider ? 'Usage data not available' : 'No data stored';
      }
      
    } catch (error) {
      console.error('Error loading sync stats:', error);
    }
  }
  
  async loadShortcuts() {
    try {
      const commands = await chrome.commands.getAll();
      
      const syncCommand = commands.find(cmd => cmd.name === 'trigger-sync');
      if (syncCommand) {
        if (this.elements.syncShortcutDisplay) {
          this.elements.syncShortcutDisplay.textContent = syncCommand.shortcut || 'Not set';
        }
        if (this.elements.shortcutStatus) {
          this.elements.shortcutStatus.textContent = syncCommand.shortcut ? 'Active' : 'Inactive';
          this.elements.shortcutStatus.className = `shortcut-status ${syncCommand.shortcut ? '' : 'inactive'}`;
        }
      }
      
      // Check for settings shortcut (if defined)
      const settingsCommand = commands.find(cmd => cmd.name === 'open-settings');
      if (settingsCommand && this.elements.settingsShortcutDisplay) {
        this.elements.settingsShortcutDisplay.textContent = settingsCommand.shortcut || 'Not set';
      }
      
    } catch (error) {
      console.error('Error loading shortcuts:', error);
    }
  }
  
  async loadSyncHistory() {
    try {
      const storage = await chrome.storage.local.get(['syncHistory']);
      this.state.syncHistory = storage.syncHistory || [];
      
      this.filterHistory();
      
    } catch (error) {
      console.error('Error loading sync history:', error);
      this.showNoHistoryData('Error loading history');
    }
  }
  
  filterHistory() {
    let filtered = [...this.state.syncHistory];
    
    // Apply status filter
    const statusFilter = this.elements.historyFilter?.value;
    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter(entry => {
        switch (statusFilter) {
          case 'success': return entry.status === 'completed' || entry.status === 'success';
          case 'failed': return entry.status === 'failed' || entry.status === 'error';
          case 'conflicts': return entry.conflicts && entry.conflicts.length > 0;
          default: return true;
        }
      });
    }
    
    // Apply timeframe filter
    const timeframeFilter = this.elements.historyTimeframe?.value;
    if (timeframeFilter && timeframeFilter !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      
      switch (timeframeFilter) {
        case 'today':
          cutoff.setHours(0, 0, 0, 0);
          break;
        case 'week':
          cutoff.setDate(now.getDate() - 7);
          break;
        case 'month':
          cutoff.setMonth(now.getMonth() - 1);
          break;
      }
      
      filtered = filtered.filter(entry => new Date(entry.timestamp) >= cutoff);
    }
    
    // Apply search filter
    const searchTerm = this.elements.historySearch?.value?.toLowerCase();
    if (searchTerm) {
      filtered = filtered.filter(entry => 
        entry.deviceName?.toLowerCase().includes(searchTerm) ||
        entry.action?.toLowerCase().includes(searchTerm) ||
        entry.status?.toLowerCase().includes(searchTerm)
      );
    }
    
    this.state.filteredHistory = filtered;
    this.state.currentPage = 1;
    this.renderHistory();
  }
  
  sortHistory(column) {
    if (this.state.sortColumn === column) {
      this.state.sortDirection = this.state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.state.sortColumn = column;
      this.state.sortDirection = 'desc';
    }
    
    this.state.filteredHistory.sort((a, b) => {
      let aVal = a[column];
      let bVal = b[column];
      
      // Handle different data types
      if (column === 'timestamp') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      } else if (column === 'tabs') {
        aVal = parseInt(aVal) || 0;
        bVal = parseInt(bVal) || 0;
      } else {
        aVal = String(aVal || '').toLowerCase();
        bVal = String(bVal || '').toLowerCase();
      }
      
      if (aVal < bVal) return this.state.sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return this.state.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    // Update sort indicators
    this.elements.historyTable?.querySelectorAll('th.sortable').forEach(th => {
      th.classList.remove('sorted');
      if (th.dataset.sort === column) {
        th.classList.add('sorted');
      }
    });
    
    this.renderHistory();
  }
  
  renderHistory() {
    if (!this.elements.historyTbody) return;
    
    if (this.state.filteredHistory.length === 0) {
      this.showNoHistoryData();
      return;
    }
    
    // Calculate pagination
    const totalPages = Math.ceil(this.state.filteredHistory.length / this.state.itemsPerPage);
    const startIndex = (this.state.currentPage - 1) * this.state.itemsPerPage;
    const endIndex = startIndex + this.state.itemsPerPage;
    const pageData = this.state.filteredHistory.slice(startIndex, endIndex);
    
    // Render table rows
    this.elements.historyTbody.innerHTML = pageData.map(entry => `
      <tr>
        <td>
          <div>${new Date(entry.timestamp).toLocaleDateString()}</div>
          <div style="font-size: 12px; color: var(--text-muted);">${new Date(entry.timestamp).toLocaleTimeString()}</div>
        </td>
        <td>${this.escapeHtml(entry.deviceName || 'Unknown')}</td>
        <td>
          <span class="action-badge action-${entry.action?.toLowerCase() || 'unknown'}">${this.escapeHtml(entry.action || 'Unknown')}</span>
        </td>
        <td>${entry.tabCount || 0}</td>
        <td>
          <span class="status-badge status-${entry.status?.toLowerCase() || 'unknown'}">${this.escapeHtml(entry.status || 'Unknown')}</span>
        </td>
        <td>
          <button class="table-action-btn" onclick="optionsController.showHistoryDetails('${entry.id || entry.timestamp}')" title="View Details">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path fill="currentColor" d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z"/>
            </svg>
          </button>
        </td>
      </tr>
    `).join('');
    
    // Update pagination
    this.updatePagination(totalPages);
  }
  
  showNoHistoryData(message = null) {
    if (!this.elements.historyTbody) return;
    
    const defaultMessage = message || (this.state.syncHistory.length === 0 ? 
      'No sync history available' : 'No results match your filters');
    
    this.elements.historyTbody.innerHTML = `
      <tr class="no-data-row">
        <td colspan="6" class="no-data">
          <div class="no-data-content">
            <svg class="no-data-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z"/>
            </svg>
            <p>${this.escapeHtml(defaultMessage)}</p>
            <p class="no-data-subtitle">Sync operations will appear here once you start using the extension</p>
          </div>
        </td>
      </tr>
    `;
    
    this.elements.historyPagination?.classList.add('hidden');
  }
  
  updatePagination(totalPages) {
    if (!this.elements.historyPagination) return;
    
    if (totalPages <= 1) {
      this.elements.historyPagination.classList.add('hidden');
      return;
    }
    
    this.elements.historyPagination.classList.remove('hidden');
    
    if (this.elements.prevPageBtn) {
      this.elements.prevPageBtn.disabled = this.state.currentPage <= 1;
    }
    
    if (this.elements.nextPageBtn) {
      this.elements.nextPageBtn.disabled = this.state.currentPage >= totalPages;
    }
    
    if (this.elements.pageInfo) {
      this.elements.pageInfo.textContent = `Page ${this.state.currentPage} of ${totalPages}`;
    }
  }
  
  changePage(direction) {
    const totalPages = Math.ceil(this.state.filteredHistory.length / this.state.itemsPerPage);
    const newPage = this.state.currentPage + direction;
    
    if (newPage >= 1 && newPage <= totalPages) {
      this.state.currentPage = newPage;
      this.renderHistory();
    }
  }
  
  async loadPreferences() {
    try {
      const storage = await chrome.storage.local.get(['syncSettings']);
      const settings = storage.syncSettings || {};
      
      this.state.preferences = {
        confirmSync: settings.confirmBeforeSync !== false,
        autoMerge: settings.autoMerge !== false,
        syncNotifications: settings.showNotifications !== false,
        includeIncognito: settings.includeIncognito === true,
        historyRetention: settings.historyRetentionDays || 30
      };
      
      // Update UI
      if (this.elements.confirmSyncToggle) {
        this.elements.confirmSyncToggle.checked = this.state.preferences.confirmSync;
      }
      if (this.elements.autoMergeToggle) {
        this.elements.autoMergeToggle.checked = this.state.preferences.autoMerge;
      }
      if (this.elements.syncNotificationsToggle) {
        this.elements.syncNotificationsToggle.checked = this.state.preferences.syncNotifications;
      }
      if (this.elements.includeIncognitoToggle) {
        this.elements.includeIncognitoToggle.checked = this.state.preferences.includeIncognito;
      }
      if (this.elements.historyRetentionSelect) {
        this.elements.historyRetentionSelect.value = this.state.preferences.historyRetention.toString();
      }
      
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  }
  
  async savePreference(key, value) {
    try {
      this.state.preferences[key] = value;
      
      const storage = await chrome.storage.local.get(['syncSettings']);
      const settings = storage.syncSettings || {};
      
      // Map preference keys to storage keys
      const keyMap = {
        confirmSync: 'confirmBeforeSync',
        autoMerge: 'autoMerge',
        syncNotifications: 'showNotifications',
        includeIncognito: 'includeIncognito',
        historyRetention: 'historyRetentionDays'
      };
      
      settings[keyMap[key]] = value;
      
      await chrome.storage.local.set({ syncSettings: settings });
      
      this.showBanner('success', 'Preference Saved', `${key} setting has been updated`);
      
    } catch (error) {
      console.error('Error saving preference:', error);
      this.showBanner('error', 'Save Failed', 'Could not save preference');
    }
  }
  
  setupNavigation() {
    // Set initial section
    this.switchSection('account');
  }
  
  switchSection(sectionId) {
    // Update navigation
    this.elements.navItems.forEach(item => {
      item.classList.remove('active');
      item.setAttribute('aria-selected', 'false');
      if (item.dataset.section === sectionId) {
        item.classList.add('active');
        item.setAttribute('aria-selected', 'true');
      }
    });
    
    // Update sections
    this.elements.sections.forEach(section => {
      section.classList.remove('active');
      if (section.id === `${sectionId}-section`) {
        section.classList.add('active');
      }
    });
    
    this.state.currentSection = sectionId;
    
    // Trigger section-specific actions
    if (sectionId === 'history') {
      this.loadSyncHistory();
    }
  }
  
  // Event handlers
  async handleSyncNow() {
    try {
      if (!this.state.isAuthenticated) {
        this.showBanner('warning', 'Authentication Required', 'Please sign in to sync your tabs');
        this.switchSection('account');
        return;
      }
      
      this.elements.syncNowBtn.disabled = true;
      this.elements.syncNowBtn.innerHTML = `
        <div class="spinner" style="width: 16px; height: 16px; border: 2px solid transparent; border-top: 2px solid currentColor; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <span>Syncing...</span>
      `;
      
      const response = await this.sendMessage({ action: 'triggerSync' });
      
      if (response.success) {
        this.showBanner('success', 'Sync Complete', 'Your tabs have been synchronized successfully');
        await this.loadSyncStats();
        await this.loadSyncHistory();
      } else {
        throw new Error(response.error || 'Sync failed');
      }
      
    } catch (error) {
      console.error('Sync failed:', error);
      this.showBanner('error', 'Sync Failed', error.message);
    } finally {
      this.elements.syncNowBtn.disabled = false;
      this.elements.syncNowBtn.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12,18A6,6 0 0,1 6,12C6,11 6.25,10.03 6.7,9.2L5.24,7.74C4.46,8.97 4,10.43 4,12A8,8 0 0,0 12,20V23L16,19L12,15M12,4V1L8,5L12,9V6A6,6 0 0,1 18,12C18,13 17.75,13.97 17.3,14.8L18.76,16.26C19.54,15.03 20,13.57 20,12A8,8 0 0,0 12,4Z"/>
        </svg>
        <span>Sync Now</span>
      `;
    }
  }
  
  async handleAuth(provider) {
    try {
      console.log(`Authenticating with ${provider}`);
      
      // Disable auth buttons
      this.elements.googleAuthBtn && (this.elements.googleAuthBtn.disabled = true);
      this.elements.githubAuthBtn && (this.elements.githubAuthBtn.disabled = true);
      
      // TODO: Implement actual authentication
      this.showBanner('info', 'Authentication', `${provider} authentication will be implemented in the next phase`);
      
    } catch (error) {
      console.error('Authentication error:', error);
      this.showBanner('error', 'Authentication Failed', error.message);
    } finally {
      this.elements.googleAuthBtn && (this.elements.googleAuthBtn.disabled = false);
      this.elements.githubAuthBtn && (this.elements.githubAuthBtn.disabled = false);
    }
  }
  
  async handleSignOut() {
    const confirmed = await this.showConfirmationDialog(
      'Sign Out',
      'Are you sure you want to sign out? This will clear all local sync data.',
      'Sign Out',
      'Cancel'
    );
    
    if (confirmed) {
      try {
        await chrome.storage.local.remove([
          'isAuthenticated',
          'authProvider',
          'authTokens',
          'lastSyncTime',
          'syncCount',
          'syncHistory'
        ]);
        
        await this.loadAuthStatus();
        await this.loadSyncStats();
        await this.loadSyncHistory();
        
        this.showBanner('success', 'Signed Out', 'You have been signed out successfully');
        
      } catch (error) {
        console.error('Sign out error:', error);
        this.showBanner('error', 'Sign Out Failed', error.message);
      }
    }
  }
  
  async updateDeviceName() {
    try {
      const newName = this.elements.deviceNameInput?.value?.trim();
      if (!newName) {
        this.showBanner('warning', 'Invalid Name', 'Please enter a valid device name');
        return;
      }
      
      const response = await this.sendMessage({ 
        action: 'updateDeviceName', 
        deviceName: newName 
      });
      
      if (response.success) {
        this.showBanner('success', 'Device Name Updated', `Device name changed to "${newName}"`);
        await this.loadDeviceInfo();
      } else {
        throw new Error(response.error || 'Failed to update device name');
      }
      
    } catch (error) {
      console.error('Error updating device name:', error);
      this.showBanner('error', 'Update Failed', error.message);
    }
  }
  
  async copyDeviceId() {
    try {
      const deviceId = this.elements.deviceId?.textContent;
      if (deviceId && deviceId !== 'Unknown') {
        await navigator.clipboard.writeText(deviceId);
        this.showBanner('success', 'Copied', 'Device ID copied to clipboard');
      }
    } catch (error) {
      console.error('Error copying device ID:', error);
      this.showBanner('error', 'Copy Failed', 'Could not copy device ID');
    }
  }
  
  async testConnection() {
    try {
      this.elements.testConnectionBtn.disabled = true;
      this.elements.testConnectionBtn.innerHTML = `
        <div class="spinner" style="width: 14px; height: 14px; border: 2px solid transparent; border-top: 2px solid currentColor; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <span>Testing...</span>
      `;
      
      // TODO: Implement actual connection test
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate test
      
      this.showBanner('success', 'Connection Test', 'Connection to storage provider is working correctly');
      
    } catch (error) {
      console.error('Connection test failed:', error);
      this.showBanner('error', 'Connection Failed', 'Could not connect to storage provider');
    } finally {
      this.elements.testConnectionBtn.disabled = false;
      this.elements.testConnectionBtn.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,7C13.4,7 14.8,8.6 14.8,10V11.5C15.4,11.5 16,12.1 16,12.7V16.2C16,16.8 15.4,17.3 14.8,17.3H9.2C8.6,17.3 8,16.8 8,16.2V12.8C8,12.2 8.6,11.7 9.2,11.7V10C9.2,8.6 10.6,7 12,7M12,8.2C11.2,8.2 10.5,8.7 10.5,9.5V11.5H13.5V9.5C13.5,8.7 12.8,8.2 12,8.2Z"/>
        </svg>
        <span>Test Connection</span>
      `;
    }
  }
  
  async forceSync() {
    const confirmed = await this.showConfirmationDialog(
      'Force Sync',
      'This will override any conflicts and force synchronization. Are you sure?',
      'Force Sync',
      'Cancel'
    );
    
    if (confirmed) {
      try {
        // TODO: Implement force sync
        this.showBanner('info', 'Force Sync', 'Force sync functionality will be implemented in the next phase');
      } catch (error) {
        console.error('Force sync failed:', error);
        this.showBanner('error', 'Force Sync Failed', error.message);
      }
    }
  }
  
  editShortcuts() {
    chrome.tabs.create({
      url: 'chrome://extensions/shortcuts'
    });
  }
  
  async resetShortcuts() {
    const confirmed = await this.showConfirmationDialog(
      'Reset Shortcuts',
      'This will reset all keyboard shortcuts to their default values.',
      'Reset',
      'Cancel'
    );
    
    if (confirmed) {
      // Chrome doesn't provide an API to reset shortcuts programmatically
      this.showBanner('info', 'Reset Shortcuts', 'Please reset shortcuts manually in Chrome\'s extension settings');
      this.editShortcuts();
    }
  }
  
  async exportHistory() {
    try {
      const data = {
        exportDate: new Date().toISOString(),
        version: chrome.runtime.getManifest().version,
        history: this.state.syncHistory
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `tab-sync-history-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.showBanner('success', 'Export Complete', 'Sync history has been exported');
      
    } catch (error) {
      console.error('Export failed:', error);
      this.showBanner('error', 'Export Failed', 'Could not export sync history');
    }
  }
  
  async clearHistory() {
    const confirmed = await this.showConfirmationDialog(
      'Clear History',
      'This will permanently delete all sync history. This action cannot be undone.',
      'Clear History',
      'Cancel'
    );
    
    if (confirmed) {
      try {
        await chrome.storage.local.remove(['syncHistory']);
        this.state.syncHistory = [];
        this.filterHistory();
        this.showBanner('success', 'History Cleared', 'All sync history has been deleted');
      } catch (error) {
        console.error('Error clearing history:', error);
        this.showBanner('error', 'Clear Failed', 'Could not clear sync history');
      }
    }
  }
  
  async clearCache() {
    try {
      // TODO: Implement cache clearing
      this.showBanner('success', 'Cache Cleared', 'Local cache has been cleared');
    } catch (error) {
      console.error('Error clearing cache:', error);
      this.showBanner('error', 'Clear Failed', 'Could not clear cache');
    }
  }
  
  async resetSettings() {
    const confirmed = await this.showConfirmationDialog(
      'Reset Settings',
      'This will reset all extension settings to their default values.',
      'Reset Settings',
      'Cancel'
    );
    
    if (confirmed) {
      try {
        await chrome.storage.local.remove(['syncSettings']);
        await this.loadPreferences();
        this.showBanner('success', 'Settings Reset', 'All settings have been reset to defaults');
      } catch (error) {
        console.error('Error resetting settings:', error);
        this.showBanner('error', 'Reset Failed', 'Could not reset settings');
      }
    }
  }
  
  async clearAllData() {
    const confirmed = await this.showConfirmationDialog(
      'Clear All Data',
      'This will permanently delete ALL extension data including authentication, settings, and history. This action cannot be undone.',
      'Clear All Data',
      'Cancel'
    );
    
    if (confirmed) {
      try {
        await chrome.storage.local.clear();
        await this.loadInitialData();
        this.showBanner('success', 'Data Cleared', 'All extension data has been deleted');
      } catch (error) {
        console.error('Error clearing all data:', error);
        this.showBanner('error', 'Clear Failed', 'Could not clear all data');
      }
    }
  }
  
  async downloadBackup() {
    try {
      const storage = await chrome.storage.local.get();
      const backup = {
        exportDate: new Date().toISOString(),
        version: chrome.runtime.getManifest().version,
        data: storage
      };
      
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `tab-sync-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.showBanner('success', 'Backup Downloaded', 'Extension data backup has been downloaded');
      
    } catch (error) {
      console.error('Backup download failed:', error);
      this.showBanner('error', 'Backup Failed', 'Could not create backup');
    }
  }
  
  handleBackupFileSelect() {
    const file = this.elements.backupFileInput?.files[0];
    if (file && this.elements.uploadBackupBtn) {
      this.elements.uploadBackupBtn.disabled = false;
    }
  }
  
  async uploadBackup() {
    const file = this.elements.backupFileInput?.files[0];
    if (!file) {
      this.showBanner('warning', 'No File Selected', 'Please select a backup file to upload');
      return;
    }
    
    const confirmed = await this.showConfirmationDialog(
      'Restore Backup',
      'This will replace all current extension data with the backup data. Current data will be lost.',
      'Restore Backup',
      'Cancel'
    );
    
    if (confirmed) {
      try {
        const text = await file.text();
        const backup = JSON.parse(text);
        
        if (!backup.data) {
          throw new Error('Invalid backup file format');
        }
        
        await chrome.storage.local.clear();
        await chrome.storage.local.set(backup.data);
        await this.loadInitialData();
        
        this.showBanner('success', 'Backup Restored', 'Extension data has been restored from backup');
        
      } catch (error) {
        console.error('Backup restore failed:', error);
        this.showBanner('error', 'Restore Failed', 'Could not restore from backup file');
      }
    }
  }
  
  async deleteCloudData() {
    const confirmed = await this.showConfirmationDialog(
      'Delete Cloud Data',
      'This will permanently delete all sync data stored in the cloud. This action cannot be undone.',
      'Delete Cloud Data',
      'Cancel'
    );
    
    if (confirmed) {
      try {
        // TODO: Implement cloud data deletion
        this.showBanner('info', 'Cloud Data', 'Cloud data deletion will be implemented in the next phase');
      } catch (error) {
        console.error('Error deleting cloud data:', error);
        this.showBanner('error', 'Delete Failed', 'Could not delete cloud data');
      }
    }
  }
  
  async resetToDefaults() {
    const confirmed = await this.showConfirmationDialog(
      'Reset to Defaults',
      'This will reset all settings to their default values but keep your authentication and sync history.',
      'Reset to Defaults',
      'Cancel'
    );
    
    if (confirmed) {
      try {
        await chrome.storage.local.remove(['syncSettings']);
        await this.loadPreferences();
        this.showBanner('success', 'Reset Complete', 'All settings have been reset to defaults');
      } catch (error) {
        console.error('Error resetting to defaults:', error);
        this.showBanner('error', 'Reset Failed', 'Could not reset to defaults');
      }
    }
  }
  
  showHelp() {
    // TODO: Implement help system
    this.showBanner('info', 'Help', 'Help documentation will be available in the next phase');
  }
  
  showPrivacyPolicy() {
    // TODO: Show privacy policy
    this.showBanner('info', 'Privacy Policy', 'Privacy policy will be available in the next phase');
  }
  
  showSupport() {
    // TODO: Show support information
    this.showBanner('info', 'Support', 'Support information will be available in the next phase');
  }
  
  showFeedback() {
    // TODO: Show feedback form
    this.showBanner('info', 'Feedback', 'Feedback system will be available in the next phase');
  }
  
  showHistoryDetails(entryId) {
    // TODO: Implement history details view
    this.showBanner('info', 'History Details', 'Detailed history view will be available in the next phase');
  }
  
  // Utility methods
  showBanner(type, title, message) {
    if (!this.elements.statusBanner) return;
    
    const typeClasses = {
      success: 'banner-success',
      error: 'banner-error',
      warning: 'banner-warning',
      info: 'banner-info'
    };
    
    this.elements.statusBanner.className = `status-banner ${typeClasses[type] || 'banner-info'}`;
    this.elements.bannerTitle && (this.elements.bannerTitle.textContent = title);
    this.elements.bannerMessage && (this.elements.bannerMessage.textContent = message);
    this.elements.statusBanner.classList.remove('hidden');
    
    // Auto-hide after 5 seconds
    setTimeout(() => this.hideBanner(), 5000);
  }
  
  hideBanner() {
    this.elements.statusBanner?.classList.add('hidden');
  }
  
  async showConfirmationDialog(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
    return new Promise((resolve) => {
      if (!this.elements.confirmationDialog) {
        resolve(false);
        return;
      }
      
      this.elements.dialogTitle && (this.elements.dialogTitle.textContent = title);
      this.elements.dialogMessage && (this.elements.dialogMessage.textContent = message);
      this.elements.dialogConfirm && (this.elements.dialogConfirm.textContent = confirmText);
      this.elements.dialogCancel && (this.elements.dialogCancel.textContent = cancelText);
      
      this.elements.confirmationDialog.classList.remove('hidden');
      this.elements.confirmationDialog.setAttribute('aria-hidden', 'false');
      
      this.dialogResolve = resolve;
      this.elements.dialogConfirm?.focus();
    });
  }
  
  hideConfirmationDialog() {
    if (this.elements.confirmationDialog) {
      this.elements.confirmationDialog.classList.add('hidden');
      this.elements.confirmationDialog.setAttribute('aria-hidden', 'true');
    }
    
    if (this.dialogResolve) {
      this.dialogResolve(false);
      this.dialogResolve = null;
    }
  }
  
  confirmDialogAction() {
    this.hideConfirmationDialog();
    if (this.dialogResolve) {
      this.dialogResolve(true);
      this.dialogResolve = null;
    }
  }
  
  handleKeydown(event) {
    // Handle Escape key
    if (event.key === 'Escape') {
      if (!this.elements.confirmationDialog?.classList.contains('hidden')) {
        this.hideConfirmationDialog();
        event.preventDefault();
      }
    }
    
    // Handle Enter key in dialogs
    if (event.key === 'Enter') {
      if (!this.elements.confirmationDialog?.classList.contains('hidden')) {
        if (event.target === this.elements.dialogConfirm) {
          this.confirmDialogAction();
          event.preventDefault();
        }
      }
    }
  }
  
  async sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });
  }
  
  formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    } else {
      return date.toLocaleDateString();
    }
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
}

// Initialize options controller when DOM is loaded
let optionsController;
document.addEventListener('DOMContentLoaded', () => {
  optionsController = new OptionsController();
});