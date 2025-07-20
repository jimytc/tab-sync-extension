// Background service worker for Tab Sync Extension
// Handles authentication, sync operations, and keyboard shortcuts

import { 
  getDeviceMetadata, 
  getOrCreateDeviceId, 
  log, 
  createError,
  formatTimestamp 
} from '../shared/utils.js';

console.log('Tab Sync Extension background service worker loaded');

// Handle extension installation
chrome.runtime.onInstalled.addListener(async (details) => {
  log('info', 'Extension installed', { reason: details.reason });
  
  try {
    // Initialize device metadata
    const deviceMetadata = await getDeviceMetadata();
    const deviceId = await getOrCreateDeviceId();
    
    // Initialize default settings
    await chrome.storage.local.set({
      isAuthenticated: false,
      authProvider: null,
      lastSyncTime: null,
      syncCount: 0,
      deviceId: deviceId,
      deviceMetadata: deviceMetadata,
      installationTime: Date.now(),
      extensionVersion: chrome.runtime.getManifest().version
    });
    
    log('info', 'Extension initialized', { 
      deviceId, 
      deviceName: deviceMetadata.deviceName,
      version: chrome.runtime.getManifest().version 
    });
    
  } catch (error) {
    log('error', 'Failed to initialize extension', { error: error.message });
  }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(async () => {
  try {
    // Update device metadata on startup
    const deviceMetadata = await getDeviceMetadata();
    await chrome.storage.local.set({ 
      deviceMetadata,
      lastStartup: Date.now()
    });
    
    log('info', 'Extension started', { deviceName: deviceMetadata.deviceName });
  } catch (error) {
    log('error', 'Failed to update device metadata on startup', { error: error.message });
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'trigger-sync') {
    log('info', 'Sync triggered via keyboard shortcut');
    
    try {
      // Check authentication status
      const storage = await chrome.storage.local.get(['isAuthenticated']);
      if (!storage.isAuthenticated) {
        log('warn', 'Sync attempted without authentication');
        // Could show notification here
        return;
      }
      
      // TODO: Implement sync trigger logic
      await handleSyncTrigger();
      
    } catch (error) {
      log('error', 'Failed to handle keyboard shortcut', { error: error.message });
    }
  }
});

// Handle sync trigger
async function handleSyncTrigger() {
  try {
    log('info', 'Starting sync process');
    
    // Update last sync attempt time
    await chrome.storage.local.set({ 
      lastSyncAttempt: Date.now() 
    });
    
    // TODO: Implement actual sync logic
    // For now, just log the attempt
    log('info', 'Sync process completed (placeholder)');
    
  } catch (error) {
    log('error', 'Sync process failed', { error: error.message });
    throw error;
  }
}

// Handle messages from popup and options pages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  log('info', 'Background received message', { action: request.action });
  
  // Handle async operations
  handleMessage(request, sender)
    .then(response => sendResponse(response))
    .catch(error => {
      log('error', 'Message handler failed', { 
        action: request.action, 
        error: error.message 
      });
      sendResponse(createError(error.message, 'MESSAGE_HANDLER_ERROR'));
    });
  
  return true; // Keep message channel open for async response
});

// Async message handler
async function handleMessage(request, sender) {
  switch (request.action) {
    case 'getAuthStatus':
      return await getAuthStatus();
      
    case 'getDeviceInfo':
      return await getDeviceInfo();
      
    case 'triggerSync':
      return await triggerSync();
      
    case 'updateDeviceName':
      return await updateDeviceName(request.deviceName);
      
    case 'getSyncHistory':
      return await getSyncHistory();
      
    default:
      throw new Error(`Unknown action: ${request.action}`);
  }
}

// Get authentication status
async function getAuthStatus() {
  try {
    const storage = await chrome.storage.local.get([
      'isAuthenticated', 
      'authProvider', 
      'lastSyncTime',
      'syncCount'
    ]);
    
    return {
      authenticated: storage.isAuthenticated || false,
      provider: storage.authProvider || null,
      lastSync: storage.lastSyncTime || null,
      syncCount: storage.syncCount || 0,
      lastSyncFormatted: formatTimestamp(storage.lastSyncTime)
    };
  } catch (error) {
    throw new Error(`Failed to get auth status: ${error.message}`);
  }
}

// Get device information
async function getDeviceInfo() {
  try {
    const storage = await chrome.storage.local.get([
      'deviceId', 
      'deviceMetadata', 
      'deviceName'
    ]);
    
    // Refresh device metadata
    const currentMetadata = await getDeviceMetadata();
    
    return {
      deviceId: storage.deviceId,
      deviceName: storage.deviceName || currentMetadata.deviceName,
      metadata: currentMetadata,
      storedMetadata: storage.deviceMetadata
    };
  } catch (error) {
    throw new Error(`Failed to get device info: ${error.message}`);
  }
}

// Trigger sync operation
async function triggerSync() {
  try {
    // Check authentication
    const authStatus = await getAuthStatus();
    if (!authStatus.authenticated) {
      throw new Error('Not authenticated');
    }
    
    // TODO: Implement actual sync logic
    await handleSyncTrigger();
    
    return { 
      success: true, 
      timestamp: Date.now(),
      message: 'Sync completed successfully (placeholder)'
    };
  } catch (error) {
    throw new Error(`Sync failed: ${error.message}`);
  }
}

// Update device name
async function updateDeviceName(newName) {
  try {
    if (!newName || typeof newName !== 'string') {
      throw new Error('Invalid device name');
    }
    
    await chrome.storage.local.set({ 
      deviceName: newName.trim(),
      deviceNameUpdated: Date.now()
    });
    
    log('info', 'Device name updated', { newName: newName.trim() });
    
    return { 
      success: true, 
      deviceName: newName.trim() 
    };
  } catch (error) {
    throw new Error(`Failed to update device name: ${error.message}`);
  }
}

// Get sync history
async function getSyncHistory() {
  try {
    const storage = await chrome.storage.local.get(['syncHistory']);
    const history = storage.syncHistory || [];
    
    return {
      history: history.slice(-50), // Return last 50 entries
      total: history.length
    };
  } catch (error) {
    throw new Error(`Failed to get sync history: ${error.message}`);
  }
}