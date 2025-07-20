// Popup JavaScript for Tab Sync Extension

class PopupController {
  constructor() {
    this.elements = {};
    this.state = {
      isAuthenticated: false,
      isLoading: true,
      currentProvider: null,
      syncInProgress: false,
      lastSyncTime: null,
      deviceInfo: null
    };
    
    this.init();
  }
  
  async init() {
    try {
      this.bindElements();
      this.attachEventListeners();
      await this.initializeState();
    } catch (error) {
      console.error('Failed to initialize popup:', error);
      this.showError('Failed to initialize extension', error.message);
    }
  }
  
  bindElements() {
    // Status elements
    this.elements.authStatus = document.getElementById('auth-status');
    this.elements.authText = document.getElementById('auth-text');
    
    // Section elements
    this.elements.loadingSection = document.getElementById('loading-section');
    this.elements.authSection = document.getElementById('auth-section');
    this.elements.syncSection = document.getElementById('sync-section');
    this.elements.errorSection = document.getElementById('error-section');
    
    // Sync controls
    this.elements.syncBtn = document.getElementById('sync-btn');
    this.elements.syncText = document.getElementById('sync-text');
    this.elements.syncSpinner = document.getElementById('sync-spinner');
    this.elements.syncProgress = document.getElementById('sync-progress');
    this.elements.progressFill = document.getElementById('progress-fill');
    this.elements.progressText = document.getElementById('progress-text');
    
    // Info elements
    this.elements.lastSync = document.getElementById('last-sync');
    this.elements.deviceName = document.getElementById('device-name');
    this.elements.authProvider = document.getElementById('auth-provider');
    
    // Auth buttons
    this.elements.googleAuthBtn = document.getElementById('google-auth');
    this.elements.githubAuthBtn = document.getElementById('github-auth');
    
    // Footer buttons
    this.elements.settingsBtn = document.getElementById('settings-btn');
    this.elements.signoutBtn = document.getElementById('signout-btn');
    this.elements.retryBtn = document.getElementById('retry-btn');
    
    // Dialog elements
    this.elements.confirmationDialog = document.getElementById('confirmation-dialog');
    this.elements.dialogTitle = document.getElementById('dialog-title');
    this.elements.dialogMessage = document.getElementById('dialog-message');
    this.elements.dialogDetails = document.getElementById('dialog-details');
    this.elements.currentTabCount = document.getElementById('current-tab-count');
    this.elements.dialogLastSync = document.getElementById('dialog-last-sync');
    this.elements.dialogCancel = document.getElementById('dialog-cancel');
    this.elements.dialogConfirm = document.getElementById('dialog-confirm');
    this.elements.dialogClose = document.getElementById('dialog-close');
    
    // Alert elements
    this.elements.conflictAlert = document.getElementById('conflict-alert');
    this.elements.resolveConflictsBtn = document.getElementById('resolve-conflicts-btn');
    
    // Error elements
    this.elements.errorMessage = document.getElementById('error-message');
    
    // Version info
    this.elements.versionInfo = document.getElementById('version-info');
  }
  
  attachEventListeners() {
    // Sync controls
    this.elements.syncBtn?.addEventListener('click', () => this.handleSyncClick());
    
    // Auth buttons
    this.elements.googleAuthBtn?.addEventListener('click', () => this.handleAuth('google'));
    this.elements.githubAuthBtn?.addEventListener('click', () => this.handleAuth('github'));
    
    // Footer buttons
    this.elements.settingsBtn?.addEventListener('click', () => this.openSettings());
    this.elements.signoutBtn?.addEventListener('click', () => this.handleSignOut());
    this.elements.retryBtn?.addEventListener('click', () => this.initializeState());
    
    // Dialog controls
    this.elements.dialogCancel?.addEventListener('click', () => this.hideConfirmationDialog());
    this.elements.dialogConfirm?.addEventListener('click', () => this.confirmSync());
    this.elements.dialogClose?.addEventListener('click', () => this.hideConfirmationDialog());
    
    // Conflict resolution
    this.elements.resolveConflictsBtn?.addEventListener('click', () => this.openConflictResolution());
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => this.handleKeydown(e));
    
    // Dialog overlay click
    this.elements.confirmationDialog?.addEventListener('click', (e) => {
      if (e.target === this.elements.confirmationDialog) {
        this.hideConfirmationDialog();
      }
    });
  }
  
  async initializeState() {
    try {
      this.showLoading();
      
      // Get extension version
      const manifest = chrome.runtime.getManifest();
      if (this.elements.versionInfo) {
        this.elements.versionInfo.textContent = `v${manifest.version}`;
      }
      
      // Get authentication status
      const authResponse = await this.sendMessage({ action: 'getAuthStatus' });
      this.state.isAuthenticated = authResponse.authenticated;
      this.state.currentProvider = authResponse.provider;
      this.state.lastSyncTime = authResponse.lastSync;
      
      // Get device info
      const deviceResponse = await this.sendMessage({ action: 'getDeviceInfo' });
      this.state.deviceInfo = deviceResponse;
      
      // Check for pending conflicts
      const storage = await chrome.storage.local.get(['pendingConflicts']);
      const hasPendingConflicts = storage.pendingConflicts && storage.pendingConflicts.length > 0;
      
      // Update UI based on state
      this.updateUI();
      
      if (hasPendingConflicts) {
        this.showConflictAlert();
      }
      
    } catch (error) {
      console.error('Failed to initialize state:', error);
      this.showError('Initialization failed', error.message);
    }
  }
  
  updateUI() {
    this.hideAllSections();
    
    if (this.state.isAuthenticated) {
      this.showAuthenticatedState();
    } else {
      this.showUnauthenticatedState();
    }
    
    this.updateStatusIndicator();
    this.updateSyncInfo();
  }
  
  showAuthenticatedState() {
    this.elements.authStatus?.classList.add('authenticated');
    this.elements.authText && (this.elements.authText.textContent = 'Authenticated');
    
    this.elements.syncSection?.classList.remove('hidden');
    this.elements.signoutBtn?.classList.remove('hidden');
    
    if (this.elements.syncBtn) {
      this.elements.syncBtn.disabled = false;
    }
  }
  
  showUnauthenticatedState() {
    this.elements.authStatus?.classList.remove('authenticated');
    this.elements.authText && (this.elements.authText.textContent = 'Not authenticated');
    
    this.elements.authSection?.classList.remove('hidden');
    this.elements.signoutBtn?.classList.add('hidden');
    
    if (this.elements.syncBtn) {
      this.elements.syncBtn.disabled = true;
    }
  }
  
  showLoading() {
    this.hideAllSections();
    this.elements.loadingSection?.classList.remove('hidden');
    this.elements.authStatus?.classList.add('checking');
    this.elements.authText && (this.elements.authText.textContent = 'Checking authentication...');
  }
  
  showError(title, message) {
    this.hideAllSections();
    this.elements.errorSection?.classList.remove('hidden');
    if (this.elements.errorMessage) {
      this.elements.errorMessage.textContent = message;
    }
  }
  
  hideAllSections() {
    this.elements.loadingSection?.classList.add('hidden');
    this.elements.authSection?.classList.add('hidden');
    this.elements.syncSection?.classList.add('hidden');
    this.elements.errorSection?.classList.add('hidden');
  }
  
  updateStatusIndicator() {
    if (this.state.isAuthenticated) {
      this.elements.authStatus?.classList.add('authenticated');
      this.elements.authStatus?.classList.remove('checking');
    } else {
      this.elements.authStatus?.classList.remove('authenticated', 'checking');
    }
  }
  
  updateSyncInfo() {
    // Update last sync time
    if (this.elements.lastSync) {
      if (this.state.lastSyncTime) {
        const date = new Date(this.state.lastSyncTime);
        this.elements.lastSync.textContent = this.formatRelativeTime(date);
      } else {
        this.elements.lastSync.textContent = 'Never';
      }
    }
    
    // Update device name
    if (this.elements.deviceName && this.state.deviceInfo) {
      this.elements.deviceName.textContent = this.state.deviceInfo.deviceName || 'Unknown Device';
    }
    
    // Update auth provider
    if (this.elements.authProvider) {
      this.elements.authProvider.textContent = this.state.currentProvider || 'None';
    }
  }
  
  async handleSyncClick() {
    try {
      if (this.state.syncInProgress) {
        return;
      }
      
      // Get current tab count for confirmation dialog
      const tabs = await chrome.tabs.query({});
      await this.showConfirmationDialog(tabs.length);
      
    } catch (error) {
      console.error('Error handling sync click:', error);
      this.showNotification('Sync Error', error.message, 'error');
    }
  }
  
  async showConfirmationDialog(tabCount) {
    if (!this.elements.confirmationDialog) return;
    
    // Update dialog content
    if (this.elements.currentTabCount) {
      this.elements.currentTabCount.textContent = tabCount.toString();
    }
    
    if (this.elements.dialogLastSync) {
      if (this.state.lastSyncTime) {
        const date = new Date(this.state.lastSyncTime);
        this.elements.dialogLastSync.textContent = this.formatRelativeTime(date);
      } else {
        this.elements.dialogLastSync.textContent = 'Never';
      }
    }
    
    // Show dialog details
    this.elements.dialogDetails?.classList.remove('hidden');
    
    // Show dialog
    this.elements.confirmationDialog.classList.remove('hidden');
    this.elements.confirmationDialog.setAttribute('aria-hidden', 'false');
    
    // Focus the confirm button
    this.elements.dialogConfirm?.focus();
  }
  
  hideConfirmationDialog() {
    if (!this.elements.confirmationDialog) return;
    
    this.elements.confirmationDialog.classList.add('hidden');
    this.elements.confirmationDialog.setAttribute('aria-hidden', 'true');
    
    // Return focus to sync button
    this.elements.syncBtn?.focus();
  }
  
  async confirmSync() {
    try {
      this.hideConfirmationDialog();
      await this.performSync();
    } catch (error) {
      console.error('Error confirming sync:', error);
      this.showNotification('Sync Error', error.message, 'error');
    }
  }
  
  async performSync() {
    try {
      this.state.syncInProgress = true;
      this.setSyncButtonState('syncing');
      this.showSyncProgress(0, 'Preparing sync...');
      
      // Trigger sync via background script
      const response = await this.sendMessage({ action: 'triggerSync' });
      
      if (response.success) {
        this.showSyncProgress(100, 'Sync completed!');
        await this.initializeState(); // Refresh state
        this.showNotification('Sync Complete', 'Your tabs have been synchronized successfully.', 'success');
      } else {
        throw new Error(response.error || 'Sync failed');
      }
      
    } catch (error) {
      console.error('Sync failed:', error);
      this.showNotification('Sync Failed', error.message, 'error');
    } finally {
      this.state.syncInProgress = false;
      this.setSyncButtonState('idle');
      this.hideSyncProgress();
    }
  }
  
  setSyncButtonState(state) {
    if (!this.elements.syncBtn || !this.elements.syncText || !this.elements.syncSpinner) return;
    
    switch (state) {
      case 'syncing':
        this.elements.syncBtn.disabled = true;
        this.elements.syncText.textContent = 'Syncing...';
        this.elements.syncSpinner.classList.remove('hidden');
        break;
      case 'idle':
      default:
        this.elements.syncBtn.disabled = !this.state.isAuthenticated;
        this.elements.syncText.textContent = 'Sync Tabs';
        this.elements.syncSpinner.classList.add('hidden');
        break;
    }
  }
  
  showSyncProgress(percentage, text) {
    if (!this.elements.syncProgress) return;
    
    this.elements.syncProgress.classList.remove('hidden');
    this.elements.syncProgress.setAttribute('aria-valuenow', percentage.toString());
    
    if (this.elements.progressFill) {
      this.elements.progressFill.style.width = `${percentage}%`;
    }
    
    if (this.elements.progressText) {
      this.elements.progressText.textContent = text;
    }
  }
  
  hideSyncProgress() {
    if (this.elements.syncProgress) {
      this.elements.syncProgress.classList.add('hidden');
    }
  }
  
  showConflictAlert() {
    if (this.elements.conflictAlert) {
      this.elements.conflictAlert.classList.remove('hidden');
    }
  }
  
  hideConflictAlert() {
    if (this.elements.conflictAlert) {
      this.elements.conflictAlert.classList.add('hidden');
    }
  }
  
  async handleAuth(provider) {
    try {
      console.log(`Authenticating with ${provider}`);
      
      // Disable auth buttons during authentication
      this.setAuthButtonsState(false);
      
      // TODO: Implement actual authentication logic
      // For now, show a placeholder message
      this.showNotification('Authentication', `${provider} authentication will be implemented in the next phase.`, 'info');
      
    } catch (error) {
      console.error('Authentication error:', error);
      this.showNotification('Authentication Failed', error.message, 'error');
    } finally {
      this.setAuthButtonsState(true);
    }
  }
  
  setAuthButtonsState(enabled) {
    if (this.elements.googleAuthBtn) {
      this.elements.googleAuthBtn.disabled = !enabled;
    }
    if (this.elements.githubAuthBtn) {
      this.elements.githubAuthBtn.disabled = !enabled;
    }
  }
  
  openSettings() {
    chrome.runtime.openOptionsPage();
  }
  
  openConflictResolution() {
    // TODO: Implement conflict resolution UI
    this.showNotification('Conflict Resolution', 'Conflict resolution UI will be implemented in the next phase.', 'info');
  }
  
  async handleSignOut() {
    try {
      const confirmed = await this.showConfirmDialog(
        'Sign Out',
        'Are you sure you want to sign out? This will clear all local sync data.',
        'Sign Out',
        'Cancel'
      );
      
      if (confirmed) {
        // TODO: Implement proper sign out logic
        await chrome.storage.local.clear();
        await this.initializeState();
        this.showNotification('Signed Out', 'You have been signed out successfully.', 'info');
      }
    } catch (error) {
      console.error('Sign out error:', error);
      this.showNotification('Sign Out Failed', error.message, 'error');
    }
  }
  
  handleKeydown(event) {
    // Handle Escape key to close dialogs
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
          this.confirmSync();
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
  
  showNotification(title, message, type = 'info') {
    // Create a simple notification using browser's notification API
    // In a real implementation, this could be a toast notification
    console.log(`${type.toUpperCase()}: ${title} - ${message}`);
    
    // For now, use a simple alert for critical errors
    if (type === 'error') {
      alert(`${title}: ${message}`);
    }
  }
  
  async showConfirmDialog(title, message, confirmText, cancelText) {
    // Simple confirmation dialog using browser's confirm
    // In a real implementation, this would use a custom dialog
    return confirm(`${title}\n\n${message}`);
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
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});