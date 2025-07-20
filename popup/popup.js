// Popup JavaScript for Tab Sync Extension

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup loaded');
  
  // Get DOM elements
  const authStatus = document.getElementById('auth-status');
  const authText = document.getElementById('auth-text');
  const syncBtn = document.getElementById('sync-btn');
  const syncText = document.getElementById('sync-text');
  const syncSpinner = document.getElementById('sync-spinner');
  const authSection = document.getElementById('auth-section');
  const syncSection = document.getElementById('sync-section');
  const settingsBtn = document.getElementById('settings-btn');
  const signoutBtn = document.getElementById('signout-btn');
  const googleAuthBtn = document.getElementById('google-auth');
  const githubAuthBtn = document.getElementById('github-auth');
  const lastSyncText = document.getElementById('last-sync');
  const syncCountText = document.getElementById('sync-count');
  
  // Initialize popup state
  await updateUI();
  
  // Event listeners
  syncBtn.addEventListener('click', handleSyncClick);
  settingsBtn.addEventListener('click', openSettings);
  signoutBtn.addEventListener('click', handleSignOut);
  googleAuthBtn.addEventListener('click', () => handleAuth('google'));
  githubAuthBtn.addEventListener('click', () => handleAuth('github'));
  
  async function updateUI() {
    try {
      // Get authentication status from background
      const response = await chrome.runtime.sendMessage({ action: 'getAuthStatus' });
      
      if (response.authenticated) {
        showAuthenticatedState();
      } else {
        showUnauthenticatedState();
      }
      
      // Update sync info
      const storage = await chrome.storage.local.get(['lastSyncTime', 'syncCount']);
      updateSyncInfo(storage.lastSyncTime, storage.syncCount || 0);
      
    } catch (error) {
      console.error('Error updating UI:', error);
    }
  }
  
  function showAuthenticatedState() {
    authStatus.classList.add('authenticated');
    authText.textContent = 'Authenticated';
    syncBtn.disabled = false;
    authSection.classList.add('hidden');
    syncSection.classList.remove('hidden');
    signoutBtn.classList.remove('hidden');
  }
  
  function showUnauthenticatedState() {
    authStatus.classList.remove('authenticated');
    authText.textContent = 'Not authenticated';
    syncBtn.disabled = true;
    authSection.classList.remove('hidden');
    syncSection.classList.add('hidden');
    signoutBtn.classList.add('hidden');
  }
  
  function updateSyncInfo(lastSyncTime, syncCount) {
    if (lastSyncTime) {
      const date = new Date(lastSyncTime);
      lastSyncText.textContent = `Last sync: ${date.toLocaleString()}`;
    } else {
      lastSyncText.textContent = 'Last sync: Never';
    }
    
    syncCountText.textContent = `Tabs synced: ${syncCount}`;
  }
  
  async function handleSyncClick() {
    try {
      // Show loading state
      syncBtn.disabled = true;
      syncText.textContent = 'Syncing...';
      syncSpinner.classList.remove('hidden');
      
      // TODO: Show confirmation dialog before sync
      const confirmed = confirm('Are you sure you want to sync your tabs?');
      if (!confirmed) {
        resetSyncButton();
        return;
      }
      
      // Trigger sync via background script
      const response = await chrome.runtime.sendMessage({ action: 'triggerSync' });
      
      if (response.success) {
        // Update UI with success state
        await updateUI();
      } else {
        console.error('Sync failed:', response.error);
        alert('Sync failed. Please try again.');
      }
      
    } catch (error) {
      console.error('Error during sync:', error);
      alert('Sync failed. Please try again.');
    } finally {
      resetSyncButton();
    }
  }
  
  function resetSyncButton() {
    syncBtn.disabled = false;
    syncText.textContent = 'Sync Tabs';
    syncSpinner.classList.add('hidden');
  }
  
  async function handleAuth(provider) {
    try {
      console.log(`Authenticating with ${provider}`);
      // TODO: Implement authentication logic
      alert(`${provider} authentication not yet implemented`);
    } catch (error) {
      console.error('Authentication error:', error);
      alert('Authentication failed. Please try again.');
    }
  }
  
  function openSettings() {
    chrome.runtime.openOptionsPage();
  }
  
  async function handleSignOut() {
    try {
      const confirmed = confirm('Are you sure you want to sign out? This will clear all local sync data.');
      if (confirmed) {
        // TODO: Implement sign out logic
        await chrome.storage.local.clear();
        await updateUI();
      }
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }
});