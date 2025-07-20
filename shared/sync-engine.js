// Sync engine for Tab Sync Extension
// Coordinates synchronization between local tabs and cloud storage

import { TabManager } from './tab-manager.js';
import { tabSerializer } from './tab-serializer.js';
import { storageService } from './storage/storage-service.js';
import { authService } from './auth/auth-service.js';
import { log, createError, getOrCreateDeviceId, getDeviceMetadata } from './utils.js';
import { validateSyncData } from './validation.js';

/**
 * Sync engine class
 */
export class SyncEngine {
  constructor() {
    this.tabManager = new TabManager();
    this.isInitialized = false;
    this.isSyncing = false;
    this.syncHistory = [];
    this.deviceId = null;
    this.lastSyncTime = null;
    this.syncFileName = 'tab-sync-data.json';
    this.historyFileName = 'sync-history.json';
  }

  /**
   * Initialize the sync engine
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Initialize dependencies
      await this.tabManager.initialize();
      await tabSerializer.initialize();
      
      // Get device information
      this.deviceId = await getOrCreateDeviceId();
      
      // Load sync history
      await this.loadSyncHistory();
      
      this.isInitialized = true;
      log('info', 'Sync engine initialized', { deviceId: this.deviceId });
    } catch (error) {
      log('error', 'Failed to initialize sync engine', { error: error.message });
      throw error;
    }
  }

  /**
   * Trigger sync operation
   * @param {Object} options - Sync options
   * @returns {Promise<Object>} Sync result
   */
  async triggerSync(options = {}) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (this.isSyncing) {
        throw createError('Sync already in progress', 'SYNC_IN_PROGRESS');
      }

      this.isSyncing = true;
      const syncId = this.generateSyncId();
      
      log('info', 'Starting sync operation', { syncId, options });

      const {
        direction = 'bidirectional', // 'upload', 'download', 'bidirectional'
        forceOverwrite = false,
        dryRun = false
      } = options;

      // Ensure authentication and storage are ready
      await this.ensureStorageReady();

      const syncResult = {
        syncId,
        deviceId: this.deviceId,
        startTime: Date.now(),
        direction,
        dryRun,
        status: 'in_progress',
        operations: [],
        conflicts: [],
        errors: []
      };

      try {
        switch (direction) {
          case 'upload':
            await this.performUpload(syncResult, { forceOverwrite, dryRun });
            break;
          case 'download':
            await this.performDownload(syncResult, { forceOverwrite, dryRun });
            break;
          case 'bidirectional':
            await this.performBidirectionalSync(syncResult, { forceOverwrite, dryRun });
            break;
          default:
            throw createError(`Invalid sync direction: ${direction}`, 'INVALID_SYNC_DIRECTION');
        }

        syncResult.status = 'completed';
        syncResult.endTime = Date.now();
        syncResult.duration = syncResult.endTime - syncResult.startTime;

        // Update last sync time
        this.lastSyncTime = syncResult.endTime;
        await this.updateLastSyncTime(syncResult.endTime);

        log('info', 'Sync operation completed', {
          syncId,
          duration: syncResult.duration,
          operations: syncResult.operations.length,
          conflicts: syncResult.conflicts.length,
          errors: syncResult.errors.length
        });

      } catch (error) {
        syncResult.status = 'failed';
        syncResult.endTime = Date.now();
        syncResult.duration = syncResult.endTime - syncResult.startTime;
        syncResult.errors.push({
          type: 'sync_error',
          message: error.message,
          timestamp: Date.now()
        });

        log('error', 'Sync operation failed', { syncId, error: error.message });
        throw error;
      } finally {
        // Record sync operation
        await this.recordSyncOperation(syncResult);
        this.isSyncing = false;
      }

      return syncResult;
    } catch (error) {
      this.isSyncing = false;
      throw error;
    }
  }

  /**
   * Perform upload sync (local to cloud)
   * @param {Object} syncResult - Sync result object to update
   * @param {Object} options - Upload options
   * @returns {Promise<void>}
   */
  async performUpload(syncResult, options = {}) {
    try {
      log('info', 'Starting upload sync');

      // Get current local tabs
      const localTabs = await this.tabManager.getCurrentTabs();
      
      // Create sync data package
      const syncData = await tabSerializer.createSyncData(localTabs, {
        syncId: syncResult.syncId,
        syncType: 'upload',
        deviceMetadata: await getDeviceMetadata()
      });

      if (options.dryRun) {
        syncResult.operations.push({
          type: 'upload',
          action: 'dry_run',
          tabCount: localTabs.length,
          timestamp: Date.now()
        });
        log('info', 'Dry run: would upload tabs', { count: localTabs.length });
        return;
      }

      // Store sync data
      const storeResult = await storageService.store(this.syncFileName, syncData, {
        commitMessage: `Upload sync from ${this.deviceId} - ${new Date().toISOString()}`
      });

      syncResult.operations.push({
        type: 'upload',
        action: 'store',
        tabCount: localTabs.length,
        fileSize: storeResult.size,
        checksum: storeResult.checksum,
        timestamp: Date.now()
      });

      log('info', 'Upload sync completed', { 
        tabCount: localTabs.length,
        fileSize: storeResult.size 
      });

    } catch (error) {
      syncResult.errors.push({
        type: 'upload_error',
        message: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }

  /**
   * Perform download sync (cloud to local)
   * @param {Object} syncResult - Sync result object to update
   * @param {Object} options - Download options
   * @returns {Promise<void>}
   */
  async performDownload(syncResult, options = {}) {
    try {
      log('info', 'Starting download sync');

      // Retrieve sync data from storage
      const retrieveResult = await storageService.retrieve(this.syncFileName);
      const remoteSyncData = retrieveResult.data;

      // Validate remote sync data
      const validation = await tabSerializer.validateSyncData(remoteSyncData);
      if (!validation.isValid) {
        throw createError('Invalid remote sync data', 'INVALID_REMOTE_DATA', {
          errors: validation.errors
        });
      }

      if (options.dryRun) {
        syncResult.operations.push({
          type: 'download',
          action: 'dry_run',
          tabCount: remoteSyncData.tabs.length,
          timestamp: Date.now()
        });
        log('info', 'Dry run: would download tabs', { count: remoteSyncData.tabs.length });
        return;
      }

      // Apply remote tabs to local browser
      const applyResult = await this.applyRemoteTabs(remoteSyncData.tabs, {
        createNewWindow: false,
        closeExistingTabs: options.forceOverwrite
      });

      syncResult.operations.push({
        type: 'download',
        action: 'apply',
        tabCount: remoteSyncData.tabs.length,
        created: applyResult.created.length,
        closed: applyResult.closed.length,
        errors: applyResult.errors.length,
        timestamp: Date.now()
      });

      log('info', 'Download sync completed', {
        tabCount: remoteSyncData.tabs.length,
        created: applyResult.created.length,
        closed: applyResult.closed.length
      });

    } catch (error) {
      if (error.message.includes('FILE_NOT_FOUND')) {
        // No remote data exists yet, this is not an error for first sync
        log('info', 'No remote sync data found, skipping download');
        syncResult.operations.push({
          type: 'download',
          action: 'skip',
          reason: 'no_remote_data',
          timestamp: Date.now()
        });
        return;
      }

      syncResult.errors.push({
        type: 'download_error',
        message: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }

  /**
   * Perform bidirectional sync with conflict detection
   * @param {Object} syncResult - Sync result object to update
   * @param {Object} options - Sync options
   * @returns {Promise<void>}
   */
  async performBidirectionalSync(syncResult, options = {}) {
    try {
      log('info', 'Starting bidirectional sync');

      // Get local tabs
      const localTabs = await this.tabManager.getCurrentTabs();
      
      // Try to get remote sync data
      let remoteSyncData = null;
      try {
        const retrieveResult = await storageService.retrieve(this.syncFileName);
        remoteSyncData = retrieveResult.data;
      } catch (error) {
        if (error.message.includes('FILE_NOT_FOUND')) {
          log('info', 'No remote sync data found, performing initial upload');
          await this.performUpload(syncResult, options);
          return;
        }
        throw error;
      }

      // Validate remote sync data
      const validation = await tabSerializer.validateSyncData(remoteSyncData);
      if (!validation.isValid) {
        log('warn', 'Invalid remote sync data, performing upload', {
          errors: validation.errors
        });
        await this.performUpload(syncResult, options);
        return;
      }

      // Check for conflicts
      const conflicts = await this.detectConflicts(localTabs, remoteSyncData);
      
      if (conflicts.length === 0) {
        // No conflicts, perform simple merge
        await this.performSimpleMerge(syncResult, localTabs, remoteSyncData, options);
      } else {
        // Conflicts detected, need resolution
        syncResult.conflicts = conflicts;
        log('info', 'Conflicts detected in bidirectional sync', { 
          conflictCount: conflicts.length 
        });
        
        if (options.dryRun) {
          syncResult.operations.push({
            type: 'bidirectional',
            action: 'dry_run_conflicts',
            conflictCount: conflicts.length,
            timestamp: Date.now()
          });
          return;
        }

        // For now, default to local wins strategy
        // In a full implementation, this would present conflicts to user
        await this.resolveConflictsLocalWins(syncResult, localTabs, remoteSyncData, conflicts, options);
      }

    } catch (error) {
      syncResult.errors.push({
        type: 'bidirectional_error',
        message: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }

  /**
   * Perform simple merge when no conflicts exist
   * @param {Object} syncResult - Sync result object
   * @param {TabData[]} localTabs - Local tab data
   * @param {SyncData} remoteSyncData - Remote sync data
   * @param {Object} options - Merge options
   * @returns {Promise<void>}
   */
  async performSimpleMerge(syncResult, localTabs, remoteSyncData, options = {}) {
    try {
      log('info', 'Performing simple merge (no conflicts)');

      // Determine which data is newer
      const localTimestamp = Math.max(...localTabs.map(tab => tab.timestamp));
      const remoteTimestamp = remoteSyncData.timestamp;

      if (localTimestamp > remoteTimestamp) {
        // Local is newer, upload
        log('info', 'Local data is newer, uploading');
        await this.performUpload(syncResult, options);
      } else if (remoteTimestamp > localTimestamp) {
        // Remote is newer, download
        log('info', 'Remote data is newer, downloading');
        await this.performDownload(syncResult, options);
      } else {
        // Same timestamp, no action needed
        log('info', 'Data is synchronized, no action needed');
        syncResult.operations.push({
          type: 'bidirectional',
          action: 'no_change',
          reason: 'data_synchronized',
          timestamp: Date.now()
        });
      }

    } catch (error) {
      log('error', 'Simple merge failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Resolve conflicts using local wins strategy
   * @param {Object} syncResult - Sync result object
   * @param {TabData[]} localTabs - Local tab data
   * @param {SyncData} remoteSyncData - Remote sync data
   * @param {Object[]} conflicts - Detected conflicts
   * @param {Object} options - Resolution options
   * @returns {Promise<void>}
   */
  async resolveConflictsLocalWins(syncResult, localTabs, remoteSyncData, conflicts, options = {}) {
    try {
      log('info', 'Resolving conflicts with local wins strategy', { 
        conflictCount: conflicts.length 
      });

      // Local wins - upload local data
      await this.performUpload(syncResult, options);

      syncResult.operations.push({
        type: 'conflict_resolution',
        strategy: 'local_wins',
        conflictCount: conflicts.length,
        timestamp: Date.now()
      });

    } catch (error) {
      log('error', 'Conflict resolution failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Detect conflicts between local and remote data
   * @param {TabData[]} localTabs - Local tab data
   * @param {SyncData} remoteSyncData - Remote sync data
   * @returns {Promise<Object[]>} Array of conflicts
   */
  async detectConflicts(localTabs, remoteSyncData) {
    try {
      const conflicts = [];
      const remoteTabs = remoteSyncData.tabs;

      // Check timestamp conflicts
      const localMaxTimestamp = Math.max(...localTabs.map(tab => tab.timestamp));
      const remoteTimestamp = remoteSyncData.timestamp;
      const lastSyncTime = this.lastSyncTime || 0;

      // If both local and remote have changes since last sync, it's a conflict
      if (localMaxTimestamp > lastSyncTime && remoteTimestamp > lastSyncTime) {
        conflicts.push({
          type: 'timestamp',
          description: 'Both local and remote data have changes since last sync',
          localTimestamp: localMaxTimestamp,
          remoteTimestamp: remoteTimestamp,
          lastSyncTime: lastSyncTime
        });
      }

      // Check for URL conflicts (same URL, different metadata)
      const localUrlMap = new Map(localTabs.map(tab => [tab.url, tab]));
      const remoteUrlMap = new Map(remoteTabs.map(tab => [tab.url, tab]));

      for (const [url, localTab] of localUrlMap) {
        const remoteTab = remoteUrlMap.get(url);
        if (remoteTab) {
          // Same URL exists in both, check for differences
          if (localTab.title !== remoteTab.title || 
              localTab.pinned !== remoteTab.pinned ||
              localTab.index !== remoteTab.index) {
            conflicts.push({
              type: 'tab_metadata',
              url: url,
              description: 'Same URL with different metadata',
              localTab: localTab,
              remoteTab: remoteTab
            });
          }
        }
      }

      log('info', 'Conflict detection completed', { conflictCount: conflicts.length });
      return conflicts;

    } catch (error) {
      log('error', 'Conflict detection failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Apply remote tabs to local browser
   * @param {TabData[]} remoteTabs - Remote tab data
   * @param {Object} options - Apply options
   * @returns {Promise<Object>} Apply result
   */
  async applyRemoteTabs(remoteTabs, options = {}) {
    try {
      const {
        createNewWindow = false,
        closeExistingTabs = false
      } = options;

      // Close existing tabs if requested
      let closedTabs = [];
      if (closeExistingTabs) {
        const currentTabs = await this.tabManager.getCurrentTabs();
        const tabIds = currentTabs.map(tab => tab.chromeTabId).filter(id => id);
        if (tabIds.length > 0) {
          await this.tabManager.closeTabs(tabIds);
          closedTabs = tabIds;
        }
      }

      // Create tabs from remote data
      const createdTabs = await this.tabManager.createTabs(remoteTabs, {
        createNewWindow,
        activateFirst: true
      });

      return {
        created: createdTabs,
        closed: closedTabs,
        errors: []
      };

    } catch (error) {
      log('error', 'Failed to apply remote tabs', { error: error.message });
      throw error;
    }
  }

  /**
   * Get sync status
   * @returns {Promise<Object>} Sync status
   */
  async getSyncStatus() {
    try {
      const authStatus = await authService.getAuthStatus();
      const storageInfo = storageService.isInitialized() ? 
        await storageService.getStorageInfo() : null;

      return {
        isInitialized: this.isInitialized,
        isSyncing: this.isSyncing,
        deviceId: this.deviceId,
        lastSyncTime: this.lastSyncTime,
        lastSyncFormatted: this.lastSyncTime ? 
          new Date(this.lastSyncTime).toLocaleString() : 'Never',
        authentication: {
          isAuthenticated: authStatus.isAuthenticated,
          provider: authStatus.provider,
          tokensValid: authStatus.tokensValid
        },
        storage: {
          isReady: storageService.isInitialized(),
          provider: storageService.getCurrentProvider(),
          info: storageInfo
        },
        syncHistory: this.syncHistory.slice(-10) // Last 10 sync operations
      };
    } catch (error) {
      log('error', 'Failed to get sync status', { error: error.message });
      throw error;
    }
  }

  /**
   * Ensure storage is ready for sync operations
   * @returns {Promise<void>}
   */
  async ensureStorageReady() {
    try {
      // Check authentication
      const isAuthenticated = await authService.isAuthenticated();
      if (!isAuthenticated) {
        throw createError('Not authenticated', 'NOT_AUTHENTICATED');
      }

      // Initialize storage if needed
      if (!storageService.isInitialized()) {
        await storageService.autoInitialize();
      }

      // Test storage connection
      const connectionTest = await storageService.testConnection();
      if (!connectionTest.success) {
        throw createError('Storage connection failed', 'STORAGE_CONNECTION_FAILED', {
          error: connectionTest.error
        });
      }

    } catch (error) {
      log('error', 'Storage readiness check failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Record sync operation in history
   * @param {Object} syncResult - Sync result to record
   * @returns {Promise<void>}
   */
  async recordSyncOperation(syncResult) {
    try {
      // Add to local history
      this.syncHistory.push(syncResult);
      
      // Keep only last 50 operations
      if (this.syncHistory.length > 50) {
        this.syncHistory = this.syncHistory.slice(-50);
      }

      // Store in Chrome storage
      await chrome.storage.local.set({
        syncHistory: this.syncHistory,
        lastSyncTime: this.lastSyncTime
      });

      // Store sync history in cloud storage
      try {
        await storageService.store(this.historyFileName, {
          deviceId: this.deviceId,
          history: this.syncHistory,
          lastUpdated: Date.now()
        }, {
          commitMessage: `Update sync history - ${new Date().toISOString()}`
        });
      } catch (error) {
        log('warn', 'Failed to store sync history in cloud', { error: error.message });
        // Don't throw error as local storage succeeded
      }

    } catch (error) {
      log('error', 'Failed to record sync operation', { error: error.message });
      // Don't throw error as this is not critical for sync operation
    }
  }

  /**
   * Load sync history from storage
   * @returns {Promise<void>}
   */
  async loadSyncHistory() {
    try {
      // Load from Chrome storage first
      const result = await chrome.storage.local.get(['syncHistory', 'lastSyncTime']);
      
      if (result.syncHistory) {
        this.syncHistory = result.syncHistory;
      }
      
      if (result.lastSyncTime) {
        this.lastSyncTime = result.lastSyncTime;
      }

      log('info', 'Sync history loaded', { 
        historyCount: this.syncHistory.length,
        lastSyncTime: this.lastSyncTime 
      });

    } catch (error) {
      log('warn', 'Failed to load sync history', { error: error.message });
      // Initialize empty history
      this.syncHistory = [];
      this.lastSyncTime = null;
    }
  }

  /**
   * Update last sync time
   * @param {number} timestamp - Sync timestamp
   * @returns {Promise<void>}
   */
  async updateLastSyncTime(timestamp) {
    try {
      this.lastSyncTime = timestamp;
      await chrome.storage.local.set({ lastSyncTime: timestamp });
    } catch (error) {
      log('warn', 'Failed to update last sync time', { error: error.message });
    }
  }

  /**
   * Generate unique sync ID
   * @returns {string} Sync ID
   */
  generateSyncId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 8);
    return `sync_${this.deviceId}_${timestamp}_${random}`;
  }

  /**
   * Clear sync history
   * @returns {Promise<void>}
   */
  async clearSyncHistory() {
    try {
      this.syncHistory = [];
      this.lastSyncTime = null;
      
      await chrome.storage.local.remove(['syncHistory', 'lastSyncTime']);
      
      log('info', 'Sync history cleared');
    } catch (error) {
      log('error', 'Failed to clear sync history', { error: error.message });
      throw error;
    }
  }
}

// Create singleton instance
export const syncEngine = new SyncEngine();