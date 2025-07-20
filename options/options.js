// Options page JavaScript for Tab Sync Extension

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Options page loaded');
  
  // Get DOM elements
  const authStatusText = document.getElementById('auth-status-text');
  const authBtn = document.getElementById('auth-btn');
  const signoutBtn = document.getElementById('signout-btn');
  const lastSyncTime = document.getElementById('last-sync-time');
  const deviceId = document.getElementById('device-id');
  const tabsSynced = document.getElementById('tabs-synced');
  const storageProvider = document.getElementById('storage-provider');
  const syncShortcut = document.getElementById('sync-shortcut');
  const editShortcut = document.getElementById('edit-shortcut');
  const refreshHistory = document.getElementById('refresh-history');
  const clearHistory = document.getElementById('clear-history');
  const historyTbody = document.getElementById('history-tbody');
  const clearData = document.getElementById('clear-data');
  
  // Initialize page
  await loadSettings();
  await loadSyncHistory();
  
  // Event listeners
  authBtn.addEventListener('click', handleAuthentication);
  signoutBtn.addEventListener('click', handleSignOut);
  editShortcut.addEventListener('click', handleEditShortcut);
  refreshHistory.addEventListener('click', loadSyncHistory);
  clearHistory.addEventListener('click', handleClearHistory);
  clearData.addEventListener('click', handleClearData);
  
  async function loadSettings() {
    try {
      // Get stored settings
      const storage = await chrome.storage.local.get([
        'isAuthenticated',
        'authProvider',
        'lastSyncTime',
        'syncCount',
        'deviceId'
      ]);
      
      // Update authentication status
      if (storage.isAuthenticated) {
        authStatusText.textContent = `Authenticated with ${storage.authProvider || 'Unknown'}`;
        authBtn.classList.add('hidden');
        signoutBtn.classList.remove('hidden');
        storageProvider.textContent = storage.authProvider === 'google' ? 'Google Drive' : 'GitHub';
      } else {
        authStatusText.textContent = 'Not authenticated';
        authBtn.classList.remove('hidden');
        signoutBtn.classList.add('hidden');
        storageProvider.textContent = 'None';
      }
      
      // Update sync status
      if (storage.lastSyncTime) {
        const date = new Date(storage.lastSyncTime);
        lastSyncTime.textContent = date.toLocaleString();
      } else {
        lastSyncTime.textContent = 'Never';
      }
      
      deviceId.textContent = storage.deviceId || 'Not set';
      tabsSynced.textContent = storage.syncCount || '0';
      
      // Load keyboard shortcuts
      const commands = await chrome.commands.getAll();
      const syncCommand = commands.find(cmd => cmd.name === 'trigger-sync');
      if (syncCommand && syncCommand.shortcut) {
        syncShortcut.value = syncCommand.shortcut;
      }
      
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }
  
  async function loadSyncHistory() {
    try {
      // TODO: Implement sync history loading
      // For now, show placeholder data
      const storage = await chrome.storage.local.get(['syncHistory']);
      const history = storage.syncHistory || [];
      
      if (history.length === 0) {
        historyTbody.innerHTML = '<tr><td colspan="5" class="no-data">No sync history available</td></tr>';
        return;
      }
      
      // Populate history table
      historyTbody.innerHTML = history.map(entry => `
        <tr>
          <td>${new Date(entry.timestamp).toLocaleString()}</td>
          <td>${entry.deviceName || 'Unknown'}</td>
          <td>${entry.action}</td>
          <td>${entry.tabCount}</td>
          <td>${entry.status}</td>
        </tr>
      `).join('');
      
    } catch (error) {
      console.error('Error loading sync history:', error);
      historyTbody.innerHTML = '<tr><td colspan="5" class="no-data">Error loading history</td></tr>';
    }
  }
  
  async function handleAuthentication() {
    try {
      // TODO: Implement authentication selection
      const provider = prompt('Choose authentication provider (google/github):');
      if (provider === 'google' || provider === 'github') {
        alert(`${provider} authentication not yet implemented`);
      }
    } catch (error) {
      console.error('Authentication error:', error);
    }
  }
  
  async function handleSignOut() {
    try {
      const confirmed = confirm('Are you sure you want to sign out? This will clear all local sync data.');
      if (confirmed) {
        // Clear authentication data
        await chrome.storage.local.remove([
          'isAuthenticated',
          'authProvider',
          'authTokens',
          'lastSyncTime',
          'syncCount',
          'syncHistory'
        ]);
        
        // Reload settings
        await loadSettings();
        await loadSyncHistory();
        
        alert('Successfully signed out');
      }
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }
  
  function handleEditShortcut() {
    // Open Chrome's keyboard shortcuts page
    chrome.tabs.create({
      url: 'chrome://extensions/shortcuts'
    });
  }
  
  async function handleClearHistory() {
    try {
      const confirmed = confirm('Are you sure you want to clear sync history?');
      if (confirmed) {
        await chrome.storage.local.remove(['syncHistory']);
        await loadSyncHistory();
        alert('Sync history cleared');
      }
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  }
  
  async function handleClearData() {
    try {
      const confirmed = confirm('Are you sure you want to clear all local data? This will sign you out and remove all settings.');
      if (confirmed) {
        await chrome.storage.local.clear();
        await loadSettings();
        await loadSyncHistory();
        alert('All local data cleared');
      }
    } catch (error) {
      console.error('Error clearing data:', error);
    }
  }
});