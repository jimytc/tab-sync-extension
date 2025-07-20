// Background service worker for Tab Sync Extension
// Handles authentication, sync operations, and keyboard shortcuts

console.log('Tab Sync Extension background service worker loaded');

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details.reason);
  
  // Initialize default settings
  chrome.storage.local.set({
    isAuthenticated: false,
    authProvider: null,
    lastSyncTime: null,
    deviceId: generateDeviceId()
  });
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === 'trigger-sync') {
    console.log('Sync triggered via keyboard shortcut');
    // TODO: Implement sync trigger logic
  }
});

// Generate unique device ID
function generateDeviceId() {
  return 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Handle messages from popup and options pages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  switch (request.action) {
    case 'getAuthStatus':
      // TODO: Implement auth status check
      sendResponse({ authenticated: false });
      break;
    case 'triggerSync':
      // TODO: Implement sync logic
      sendResponse({ success: true });
      break;
    default:
      sendResponse({ error: 'Unknown action' });
  }
  
  return true; // Keep message channel open for async response
});