// Background service worker for Tab Sync Extension
// Handles authentication, sync operations, and keyboard shortcuts

import { 
  getDeviceMetadata, 
  getOrCreateDeviceId, 
  log, 
  createError,
  formatTimestamp,
  debounce 
} from '../shared/utils.js';
import { syncEngine } from '../shared/sync-engine.js';
import { authService } from '../shared/auth/auth-service.js';

console.log('Tab Sync Extension background service worker loaded');

// Keyboard shortcut state management
let shortcutHandlers = new Map();
let syncInProgress = false;
let lastSyncAttempt = 0;
const SYNC_DEBOUNCE_TIME = 2000; // 2 seconds

// Initialize background service
async function initializeBackground() {
  try {
    // Initialize core services
    await authService.initialize();
    await syncEngine.initialize();
    
    // Register keyboard shortcut handlers
    await registerShortcutHandlers();
    
    log('info', 'Background service initialized successfully');
  } catch (error) {
    log('error', 'Failed to initialize background service', { error: error.message });
  }
}

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
      extensionVersion: chrome.runtime.getManifest().version,
      keyboardShortcuts: {
        'trigger-sync': {
          enabled: true,
          key: 'Ctrl+Shift+S',
          description: 'Trigger tab synchronization',
          lastUsed: null,
          useCount: 0
        }
      }
    });
    
    log('info', 'Extension initialized', { 
      deviceId, 
      deviceName: deviceMetadata.deviceName,
      version: chrome.runtime.getManifest().version 
    });
    
    // Initialize background services
    await initializeBackground();
    
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
    
    // Initialize background services
    await initializeBackground();
    
  } catch (error) {
    log('error', 'Failed to update device metadata on startup', { error: error.message });
  }
});

// Register keyboard shortcut handlers
async function registerShortcutHandlers() {
  try {
    // Get current shortcuts configuration
    const storage = await chrome.storage.local.get(['keyboardShortcuts']);
    const shortcuts = storage.keyboardShortcuts || {};
    
    // Register debounced sync handler
    const debouncedSyncHandler = debounce(handleSyncTrigger, SYNC_DEBOUNCE_TIME);
    shortcutHandlers.set('trigger-sync', debouncedSyncHandler);
    
    log('info', 'Keyboard shortcut handlers registered', { 
      shortcuts: Object.keys(shortcuts) 
    });
    
  } catch (error) {
    log('error', 'Failed to register shortcut handlers', { error: error.message });
  }
}

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command, tab) => {
  try {
    log('info', 'Keyboard shortcut triggered', { command, tabId: tab?.id });
    
    // Update shortcut usage statistics
    await updateShortcutStats(command);
    
    // Get shortcut handler
    const handler = shortcutHandlers.get(command);
    if (!handler) {
      log('warn', 'No handler found for keyboard shortcut', { command });
      return;
    }
    
    // Execute handler with context
    await handler({ command, tab, timestamp: Date.now() });
    
  } catch (error) {
    log('error', 'Failed to handle keyboard shortcut', { 
      command, 
      error: error.message 
    });
    
    // Show error notification to user
    await showNotification('Keyboard Shortcut Error', 
      `Failed to execute ${command}: ${error.message}`, 'error');
  }
});

// Handle sync trigger with comprehensive logic
async function handleSyncTrigger(context = {}) {
  try {
    const now = Date.now();
    
    // Prevent rapid successive sync attempts
    if (now - lastSyncAttempt < SYNC_DEBOUNCE_TIME) {
      log('info', 'Sync attempt debounced', { 
        timeSinceLastAttempt: now - lastSyncAttempt 
      });
      return;
    }
    
    lastSyncAttempt = now;
    
    // Check if sync is already in progress
    if (syncInProgress) {
      log('info', 'Sync already in progress, showing status');
      await showSyncStatus();
      return;
    }
    
    log('info', 'Starting sync process via keyboard shortcut', context);
    
    // Check authentication status
    const authStatus = await authService.getAuthStatus();
    if (!authStatus.isAuthenticated || !authStatus.tokensValid) {
      log('warn', 'Sync attempted without valid authentication');
      await showNotification('Authentication Required', 
        'Please sign in to sync your tabs across devices', 'warning');
      
      // Open options page for authentication
      await chrome.runtime.openOptionsPage();
      return;
    }
    
    // Show confirmation dialog if enabled
    const shouldConfirm = await getSyncConfirmationSetting();
    if (shouldConfirm) {
      const confirmed = await showSyncConfirmation();
      if (!confirmed) {
        log('info', 'Sync cancelled by user');
        return;
      }
    }
    
    // Set sync in progress flag
    syncInProgress = true;
    
    try {
      // Show sync started notification
      await showNotification('Sync Started', 
        'Synchronizing your tabs across devices...', 'info');
      
      // Trigger sync with bidirectional mode
      const syncResult = await syncEngine.triggerSync({
        direction: 'bidirectional',
        forceOverwrite: false,
        dryRun: false
      });
      
      // Handle sync result
      await handleSyncResult(syncResult);
      
    } finally {
      syncInProgress = false;
    }
    
  } catch (error) {
    syncInProgress = false;
    log('error', 'Sync process failed', { error: error.message });
    
    await showNotification('Sync Failed', 
      `Synchronization failed: ${error.message}`, 'error');
    
    throw error;
  }
}

// Handle sync result and show appropriate notifications
async function handleSyncResult(syncResult) {
  try {
    const { status, conflicts, operations, errors, duration } = syncResult;
    
    if (status === 'completed') {
      if (conflicts && conflicts.length > 0) {
        // Sync completed but with conflicts
        await showNotification('Sync Completed with Conflicts', 
          `${conflicts.length} conflicts detected. Click to resolve.`, 'warning');
        
        // Store conflicts for resolution UI
        await chrome.storage.local.set({ 
          pendingConflicts: conflicts,
          lastSyncResult: syncResult 
        });
        
      } else {
        // Sync completed successfully
        const operationCount = operations.length;
        const durationSec = Math.round(duration / 1000);
        
        await showNotification('Sync Completed', 
          `Successfully synchronized ${operationCount} operations in ${durationSec}s`, 'success');
      }
      
      // Update sync statistics
      await updateSyncStats(syncResult);
      
    } else if (status === 'failed') {
      const errorMsg = errors.length > 0 ? errors[0].message : 'Unknown error';
      await showNotification('Sync Failed', 
        `Synchronization failed: ${errorMsg}`, 'error');
    }
    
  } catch (error) {
    log('error', 'Failed to handle sync result', { error: error.message });
  }
}

// Show sync confirmation dialog
async function showSyncConfirmation() {
  return new Promise((resolve) => {
    // Create a simple confirmation using Chrome's notification API
    // In a real implementation, this would be a proper dialog
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Confirm Sync',
      message: 'Do you want to synchronize your tabs across devices?',
      buttons: [
        { title: 'Yes, Sync Now' },
        { title: 'Cancel' }
      ]
    }, (notificationId) => {
      // Listen for button clicks
      const listener = (clickedNotificationId, buttonIndex) => {
        if (clickedNotificationId === notificationId) {
          chrome.notifications.onButtonClicked.removeListener(listener);
          chrome.notifications.clear(notificationId);
          resolve(buttonIndex === 0); // True if "Yes" clicked
        }
      };
      
      chrome.notifications.onButtonClicked.addListener(listener);
      
      // Auto-resolve after 10 seconds (default to cancel)
      setTimeout(() => {
        chrome.notifications.onButtonClicked.removeListener(listener);
        chrome.notifications.clear(notificationId);
        resolve(false);
      }, 10000);
    });
  });
}

// Show sync status
async function showSyncStatus() {
  try {
    const syncStatus = await syncEngine.getSyncStatus();
    const { lastSyncTime, isSyncing, syncHistory } = syncStatus;
    
    let message;
    if (isSyncing) {
      message = 'Sync in progress...';
    } else if (lastSyncTime) {
      const lastSyncFormatted = formatTimestamp(lastSyncTime);
      message = `Last sync: ${lastSyncFormatted}`;
    } else {
      message = 'No previous sync found';
    }
    
    await showNotification('Sync Status', message, 'info');
    
  } catch (error) {
    log('error', 'Failed to show sync status', { error: error.message });
  }
}

// Show notification to user
async function showNotification(title, message, type = 'info') {
  try {
    const iconMap = {
      info: 'icons/icon48.png',
      success: 'icons/icon48.png',
      warning: 'icons/icon48.png',
      error: 'icons/icon48.png'
    };
    
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: iconMap[type],
      title: title,
      message: message
    });
    
  } catch (error) {
    log('error', 'Failed to show notification', { error: error.message });
  }
}

// Update shortcut usage statistics
async function updateShortcutStats(command) {
  try {
    const storage = await chrome.storage.local.get(['keyboardShortcuts']);
    const shortcuts = storage.keyboardShortcuts || {};
    
    if (shortcuts[command]) {
      shortcuts[command].lastUsed = Date.now();
      shortcuts[command].useCount = (shortcuts[command].useCount || 0) + 1;
      
      await chrome.storage.local.set({ keyboardShortcuts: shortcuts });
    }
    
  } catch (error) {
    log('error', 'Failed to update shortcut stats', { error: error.message });
  }
}

// Update sync statistics
async function updateSyncStats(syncResult) {
  try {
    const storage = await chrome.storage.local.get(['syncStats']);
    const stats = storage.syncStats || {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      conflictsResolved: 0,
      lastSyncDuration: 0,
      averageSyncDuration: 0
    };
    
    stats.totalSyncs++;
    stats.lastSyncDuration = syncResult.duration;
    
    if (syncResult.status === 'completed') {
      stats.successfulSyncs++;
      
      // Update average duration (simple moving average)
      if (stats.averageSyncDuration === 0) {
        stats.averageSyncDuration = syncResult.duration;
      } else {
        stats.averageSyncDuration = Math.round(
          (stats.averageSyncDuration + syncResult.duration) / 2
        );
      }
      
      if (syncResult.conflicts) {
        stats.conflictsResolved += syncResult.conflicts.length;
      }
    } else {
      stats.failedSyncs++;
    }
    
    await chrome.storage.local.set({ 
      syncStats: stats,
      lastSyncTime: Date.now(),
      syncCount: stats.successfulSyncs
    });
    
  } catch (error) {
    log('error', 'Failed to update sync stats', { error: error.message });
  }
}

// Get sync confirmation setting
async function getSyncConfirmationSetting() {
  try {
    const storage = await chrome.storage.local.get(['syncSettings']);
    const settings = storage.syncSettings || {};
    return settings.confirmBeforeSync !== false; // Default to true
  } catch (error) {
    log('error', 'Failed to get sync confirmation setting', { error: error.message });
    return true; // Default to requiring confirmation
  }
}

// Validate keyboard shortcuts for conflicts
async function validateShortcuts() {
  try {
    const commands = await chrome.commands.getAll();
    const conflicts = [];
    
    for (const command of commands) {
      if (command.shortcut) {
        // Check for potential conflicts with browser shortcuts
        const browserShortcuts = [
          'Ctrl+T', 'Ctrl+W', 'Ctrl+N', 'Ctrl+Shift+N',
          'Ctrl+R', 'Ctrl+F', 'Ctrl+L', 'Ctrl+D'
        ];
        
        if (browserShortcuts.includes(command.shortcut)) {
          conflicts.push({
            command: command.name,
            shortcut: command.shortcut,
            type: 'browser_conflict'
          });
        }
      }
    }
    
    if (conflicts.length > 0) {
      log('warn', 'Keyboard shortcut conflicts detected', { conflicts });
    }
    
    return conflicts;
    
  } catch (error) {
    log('error', 'Failed to validate shortcuts', { error: error.message });
    return [];
  }
}

// Get keyboard shortcut information
async function getShortcutInfo() {
  try {
    const commands = await chrome.commands.getAll();
    const storage = await chrome.storage.local.get(['keyboardShortcuts']);
    const shortcuts = storage.keyboardShortcuts || {};
    
    const shortcutInfo = commands.map(command => ({
      name: command.name,
      description: command.description,
      shortcut: command.shortcut || 'Not set',
      enabled: shortcuts[command.name]?.enabled !== false,
      lastUsed: shortcuts[command.name]?.lastUsed || null,
      useCount: shortcuts[command.name]?.useCount || 0
    }));
    
    return shortcutInfo;
    
  } catch (error) {
    log('error', 'Failed to get shortcut info', { error: error.message });
    return [];
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