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
      const lastSyncTime = this.lastSyncTime || 0;

      log('info', 'Starting comprehensive conflict detection', {
        localTabCount: localTabs.length,
        remoteTabCount: remoteTabs.length,
        lastSyncTime: lastSyncTime
      });

      // 1. Timestamp-based conflict detection
      const timestampConflicts = await this.detectTimestampConflicts(
        localTabs, remoteSyncData, lastSyncTime
      );
      conflicts.push(...timestampConflicts);

      // 2. Tab-level conflict detection
      const tabConflicts = await this.detectTabLevelConflicts(
        localTabs, remoteTabs
      );
      conflicts.push(...tabConflicts);

      // 3. Structural conflict detection
      const structuralConflicts = await this.detectStructuralConflicts(
        localTabs, remoteTabs
      );
      conflicts.push(...structuralConflicts);

      // 4. Device-specific conflict detection
      const deviceConflicts = await this.detectDeviceConflicts(
        localTabs, remoteSyncData
      );
      conflicts.push(...deviceConflicts);

      // 5. Window organization conflicts
      const windowConflicts = await this.detectWindowOrganizationConflicts(
        localTabs, remoteTabs
      );
      conflicts.push(...windowConflicts);

      // Assign severity levels to conflicts
      const prioritizedConflicts = this.prioritizeConflicts(conflicts);

      log('info', 'Conflict detection completed', { 
        totalConflicts: prioritizedConflicts.length,
        byType: this.groupConflictsByType(prioritizedConflicts),
        bySeverity: this.groupConflictsBySeverity(prioritizedConflicts)
      });

      return prioritizedConflicts;

    } catch (error) {
      log('error', 'Conflict detection failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Detect timestamp-based conflicts
   * @param {TabData[]} localTabs - Local tab data
   * @param {SyncData} remoteSyncData - Remote sync data
   * @param {number} lastSyncTime - Last successful sync timestamp
   * @returns {Promise<Object[]>} Timestamp conflicts
   */
  async detectTimestampConflicts(localTabs, remoteSyncData, lastSyncTime) {
    const conflicts = [];
    const remoteTabs = remoteSyncData.tabs;

    // Check if both local and remote have changes since last sync
    const localMaxTimestamp = localTabs.length > 0 ? 
      Math.max(...localTabs.map(tab => tab.timestamp)) : 0;
    const remoteTimestamp = remoteSyncData.timestamp;

    // Concurrent modification conflict
    if (localMaxTimestamp > lastSyncTime && remoteTimestamp > lastSyncTime) {
      const timeDiff = Math.abs(localMaxTimestamp - remoteTimestamp);
      const severity = timeDiff < 300000 ? 3 : 2; // High severity if within 5 minutes

      conflicts.push({
        id: `timestamp_${Date.now()}`,
        type: 'timestamp',
        subtype: 'concurrent_modification',
        severity: severity,
        description: 'Both local and remote data have changes since last sync',
        details: {
          localTimestamp: localMaxTimestamp,
          remoteTimestamp: remoteTimestamp,
          lastSyncTime: lastSyncTime,
          timeDifference: timeDiff,
          localChanges: localTabs.filter(tab => tab.timestamp > lastSyncTime).length,
          remoteChanges: remoteTabs.filter(tab => tab.timestamp > lastSyncTime).length
        },
        resolutionStrategies: ['local_wins', 'remote_wins', 'merge', 'manual']
      });
    }

    // Stale data conflict (one side very old)
    const staleThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days
    const now = Date.now();
    
    if (now - localMaxTimestamp > staleThreshold && remoteTimestamp > lastSyncTime) {
      conflicts.push({
        id: `stale_local_${Date.now()}`,
        type: 'timestamp',
        subtype: 'stale_local',
        severity: 2,
        description: 'Local data appears stale compared to remote',
        details: {
          localAge: now - localMaxTimestamp,
          remoteTimestamp: remoteTimestamp,
          threshold: staleThreshold
        },
        resolutionStrategies: ['remote_wins', 'manual']
      });
    }

    if (now - remoteTimestamp > staleThreshold && localMaxTimestamp > lastSyncTime) {
      conflicts.push({
        id: `stale_remote_${Date.now()}`,
        type: 'timestamp',
        subtype: 'stale_remote',
        severity: 2,
        description: 'Remote data appears stale compared to local',
        details: {
          remoteAge: now - remoteTimestamp,
          localTimestamp: localMaxTimestamp,
          threshold: staleThreshold
        },
        resolutionStrategies: ['local_wins', 'manual']
      });
    }

    return conflicts;
  }

  /**
   * Detect tab-level conflicts
   * @param {TabData[]} localTabs - Local tab data
   * @param {TabData[]} remoteTabs - Remote tab data
   * @returns {Promise<Object[]>} Tab-level conflicts
   */
  async detectTabLevelConflicts(localTabs, remoteTabs) {
    const conflicts = [];
    
    // Create URL-based maps for efficient lookup
    const localUrlMap = new Map(localTabs.map(tab => [tab.url, tab]));
    const remoteUrlMap = new Map(remoteTabs.map(tab => [tab.url, tab]));

    // Check for modified tabs (same URL, different metadata)
    for (const [url, localTab] of localUrlMap) {
      const remoteTab = remoteUrlMap.get(url);
      if (remoteTab && remoteTab.deviceId !== localTab.deviceId) {
        const differences = this.compareTabMetadata(localTab, remoteTab);
        
        if (differences.length > 0) {
          const severity = this.calculateTabConflictSeverity(differences);
          
          conflicts.push({
            id: `tab_modified_${this.hashUrl(url)}`,
            type: 'tab_metadata',
            subtype: 'modified',
            severity: severity,
            description: `Tab "${localTab.title}" has different metadata`,
            url: url,
            details: {
              differences: differences,
              localTab: localTab,
              remoteTab: remoteTab,
              conflictFields: differences.map(d => d.field)
            },
            resolutionStrategies: ['local_wins', 'remote_wins', 'merge_metadata', 'manual']
          });
        }
      }
    }

    // Check for duplicate tabs (same URL from different devices)
    const urlCounts = new Map();
    [...localTabs, ...remoteTabs].forEach(tab => {
      if (!urlCounts.has(tab.url)) {
        urlCounts.set(tab.url, { local: 0, remote: 0, devices: new Set() });
      }
      const count = urlCounts.get(tab.url);
      if (localTabs.includes(tab)) {
        count.local++;
      } else {
        count.remote++;
      }
      count.devices.add(tab.deviceId);
    });

    for (const [url, counts] of urlCounts) {
      if (counts.devices.size > 1 && (counts.local > 0 && counts.remote > 0)) {
        conflicts.push({
          id: `tab_duplicate_${this.hashUrl(url)}`,
          type: 'tab_metadata',
          subtype: 'duplicate',
          severity: 1,
          description: `Duplicate tab found: "${localUrlMap.get(url)?.title || remoteUrlMap.get(url)?.title}"`,
          url: url,
          details: {
            localCount: counts.local,
            remoteCount: counts.remote,
            devices: Array.from(counts.devices),
            tabs: [...localTabs, ...remoteTabs].filter(tab => tab.url === url)
          },
          resolutionStrategies: ['keep_local', 'keep_remote', 'keep_newest', 'keep_all', 'manual']
        });
      }
    }

    return conflicts;
  }

  /**
   * Detect structural conflicts (tab organization)
   * @param {TabData[]} localTabs - Local tab data
   * @param {TabData[]} remoteTabs - Remote tab data
   * @returns {Promise<Object[]>} Structural conflicts
   */
  async detectStructuralConflicts(localTabs, remoteTabs) {
    const conflicts = [];

    // Group tabs by window
    const localWindows = this.groupTabsByWindow(localTabs);
    const remoteWindows = this.groupTabsByWindow(remoteTabs);

    // Check for window count differences
    if (Object.keys(localWindows).length !== Object.keys(remoteWindows).length) {
      conflicts.push({
        id: `structural_window_count_${Date.now()}`,
        type: 'structural',
        subtype: 'window_count',
        severity: 2,
        description: 'Different number of windows between local and remote',
        details: {
          localWindowCount: Object.keys(localWindows).length,
          remoteWindowCount: Object.keys(remoteWindows).length,
          localWindows: Object.keys(localWindows).map(Number),
          remoteWindows: Object.keys(remoteWindows).map(Number)
        },
        resolutionStrategies: ['merge_windows', 'local_structure', 'remote_structure', 'manual']
      });
    }

    // Check for tab order conflicts within windows
    for (const windowId of Object.keys(localWindows)) {
      const localWindowTabs = localWindows[windowId];
      const remoteWindowTabs = remoteWindows[windowId];

      if (remoteWindowTabs) {
        const orderConflict = this.detectTabOrderConflicts(localWindowTabs, remoteWindowTabs);
        if (orderConflict) {
          conflicts.push({
            id: `structural_order_${windowId}_${Date.now()}`,
            type: 'structural',
            subtype: 'tab_order',
            severity: 1,
            description: `Tab order differs in window ${windowId}`,
            details: {
              windowId: parseInt(windowId),
              localOrder: localWindowTabs.map(tab => ({ url: tab.url, index: tab.index })),
              remoteOrder: remoteWindowTabs.map(tab => ({ url: tab.url, index: tab.index })),
              conflicts: orderConflict
            },
            resolutionStrategies: ['local_order', 'remote_order', 'merge_order', 'manual']
          });
        }
      }
    }

    // Check for pinned tab conflicts
    const pinnedConflicts = this.detectPinnedTabConflicts(localTabs, remoteTabs);
    conflicts.push(...pinnedConflicts);

    return conflicts;
  }

  /**
   * Detect device-specific conflicts
   * @param {TabData[]} localTabs - Local tab data
   * @param {SyncData} remoteSyncData - Remote sync data
   * @returns {Promise<Object[]>} Device conflicts
   */
  async detectDeviceConflicts(localTabs, remoteSyncData) {
    const conflicts = [];
    const remoteDeviceId = remoteSyncData.deviceId;
    const localDeviceId = this.deviceId;

    // Check for same device ID (shouldn't happen but could indicate issues)
    if (remoteDeviceId === localDeviceId) {
      conflicts.push({
        id: `device_same_id_${Date.now()}`,
        type: 'device',
        subtype: 'same_device_id',
        severity: 3,
        description: 'Remote data has same device ID as local device',
        details: {
          deviceId: localDeviceId,
          remoteTimestamp: remoteSyncData.timestamp,
          localTimestamp: Math.max(...localTabs.map(tab => tab.timestamp))
        },
        resolutionStrategies: ['regenerate_device_id', 'use_newest', 'manual']
      });
    }

    // Check for device capability conflicts (e.g., mobile vs desktop)
    const remoteMetadata = remoteSyncData.metadata;
    const localMetadata = await getDeviceMetadata();

    if (remoteMetadata && localMetadata) {
      const platformConflict = this.detectPlatformConflicts(localMetadata, remoteMetadata);
      if (platformConflict) {
        conflicts.push(platformConflict);
      }
    }

    return conflicts;
  }

  /**
   * Detect window organization conflicts
   * @param {TabData[]} localTabs - Local tab data
   * @param {TabData[]} remoteTabs - Remote tab data
   * @returns {Promise<Object[]>} Window organization conflicts
   */
  async detectWindowOrganizationConflicts(localTabs, remoteTabs) {
    const conflicts = [];

    // Check for tabs that moved between windows
    const localUrlToWindow = new Map(localTabs.map(tab => [tab.url, tab.windowId]));
    const remoteUrlToWindow = new Map(remoteTabs.map(tab => [tab.url, tab.windowId]));

    const movedTabs = [];
    for (const [url, localWindowId] of localUrlToWindow) {
      const remoteWindowId = remoteUrlToWindow.get(url);
      if (remoteWindowId && remoteWindowId !== localWindowId) {
        movedTabs.push({
          url,
          localWindowId,
          remoteWindowId,
          title: localTabs.find(tab => tab.url === url)?.title
        });
      }
    }

    if (movedTabs.length > 0) {
      conflicts.push({
        id: `window_organization_${Date.now()}`,
        type: 'structural',
        subtype: 'window_organization',
        severity: 1,
        description: `${movedTabs.length} tabs moved between windows`,
        details: {
          movedTabs: movedTabs,
          affectedWindows: [...new Set([
            ...movedTabs.map(t => t.localWindowId),
            ...movedTabs.map(t => t.remoteWindowId)
          ])]
        },
        resolutionStrategies: ['local_organization', 'remote_organization', 'merge_smart', 'manual']
      });
    }

    return conflicts;
  }

  /**
   * Compare tab metadata to find differences
   * @param {TabData} localTab - Local tab
   * @param {TabData} remoteTab - Remote tab
   * @returns {Object[]} Array of differences
   */
  compareTabMetadata(localTab, remoteTab) {
    const differences = [];
    const fieldsToCompare = ['title', 'pinned', 'index', 'windowId'];

    for (const field of fieldsToCompare) {
      if (localTab[field] !== remoteTab[field]) {
        differences.push({
          field,
          localValue: localTab[field],
          remoteValue: remoteTab[field],
          severity: this.getFieldConflictSeverity(field)
        });
      }
    }

    return differences;
  }

  /**
   * Calculate severity for tab conflicts based on differences
   * @param {Object[]} differences - Array of differences
   * @returns {number} Severity level (1-3)
   */
  calculateTabConflictSeverity(differences) {
    const maxSeverity = Math.max(...differences.map(d => d.severity));
    const criticalFields = differences.filter(d => d.severity >= 2).length;
    
    if (criticalFields > 1) return 3;
    if (maxSeverity >= 2) return 2;
    return 1;
  }

  /**
   * Get conflict severity for specific fields
   * @param {string} field - Field name
   * @returns {number} Severity level
   */
  getFieldConflictSeverity(field) {
    const severityMap = {
      title: 2,      // Medium - affects user recognition
      pinned: 2,     // Medium - affects workflow
      windowId: 3,   // High - affects organization
      index: 1       // Low - affects order only
    };
    return severityMap[field] || 1;
  }

  /**
   * Group tabs by window ID
   * @param {TabData[]} tabs - Tab data array
   * @returns {Object} Tabs grouped by window ID
   */
  groupTabsByWindow(tabs) {
    return tabs.reduce((windows, tab) => {
      const windowId = tab.windowId.toString();
      if (!windows[windowId]) {
        windows[windowId] = [];
      }
      windows[windowId].push(tab);
      return windows;
    }, {});
  }

  /**
   * Detect tab order conflicts within a window
   * @param {TabData[]} localTabs - Local window tabs
   * @param {TabData[]} remoteTabs - Remote window tabs
   * @returns {Object|null} Order conflict details or null
   */
  detectTabOrderConflicts(localTabs, remoteTabs) {
    // Sort by index to compare order
    const localSorted = [...localTabs].sort((a, b) => a.index - b.index);
    const remoteSorted = [...remoteTabs].sort((a, b) => a.index - b.index);

    // Compare URL order
    const localOrder = localSorted.map(tab => tab.url);
    const remoteOrder = remoteSorted.map(tab => tab.url);

    if (JSON.stringify(localOrder) !== JSON.stringify(remoteOrder)) {
      return {
        localOrder,
        remoteOrder,
        commonUrls: localOrder.filter(url => remoteOrder.includes(url)),
        localOnlyUrls: localOrder.filter(url => !remoteOrder.includes(url)),
        remoteOnlyUrls: remoteOrder.filter(url => !localOrder.includes(url))
      };
    }

    return null;
  }

  /**
   * Detect pinned tab conflicts
   * @param {TabData[]} localTabs - Local tab data
   * @param {TabData[]} remoteTabs - Remote tab data
   * @returns {Object[]} Pinned tab conflicts
   */
  detectPinnedTabConflicts(localTabs, remoteTabs) {
    const conflicts = [];
    const localPinned = new Map(
      localTabs.filter(tab => tab.pinned).map(tab => [tab.url, tab])
    );
    const remotePinned = new Map(
      remoteTabs.filter(tab => tab.pinned).map(tab => [tab.url, tab])
    );

    // Check for tabs pinned on one side but not the other
    for (const [url, localTab] of localPinned) {
      const remoteTab = remoteTabs.find(tab => tab.url === url);
      if (remoteTab && !remoteTab.pinned) {
        conflicts.push({
          id: `pinned_conflict_${this.hashUrl(url)}`,
          type: 'structural',
          subtype: 'pinned_status',
          severity: 2,
          description: `Tab pinned locally but not remotely: "${localTab.title}"`,
          url: url,
          details: {
            localPinned: true,
            remotePinned: false,
            localTab,
            remoteTab
          },
          resolutionStrategies: ['keep_pinned', 'remove_pin', 'manual']
        });
      }
    }

    for (const [url, remoteTab] of remotePinned) {
      const localTab = localTabs.find(tab => tab.url === url);
      if (localTab && !localTab.pinned) {
        conflicts.push({
          id: `pinned_conflict_${this.hashUrl(url)}`,
          type: 'structural',
          subtype: 'pinned_status',
          severity: 2,
          description: `Tab pinned remotely but not locally: "${remoteTab.title}"`,
          url: url,
          details: {
            localPinned: false,
            remotePinned: true,
            localTab,
            remoteTab
          },
          resolutionStrategies: ['keep_pinned', 'remove_pin', 'manual']
        });
      }
    }

    return conflicts;
  }

  /**
   * Detect platform-specific conflicts
   * @param {Object} localMetadata - Local device metadata
   * @param {Object} remoteMetadata - Remote device metadata
   * @returns {Object|null} Platform conflict or null
   */
  detectPlatformConflicts(localMetadata, remoteMetadata) {
    const localPlatform = this.normalizePlatform(localMetadata.platform);
    const remotePlatform = this.normalizePlatform(remoteMetadata.platform);

    if (localPlatform !== remotePlatform) {
      return {
        id: `platform_conflict_${Date.now()}`,
        type: 'device',
        subtype: 'platform_difference',
        severity: 1,
        description: `Different platforms: ${localPlatform} vs ${remotePlatform}`,
        details: {
          localPlatform,
          remotePlatform,
          localMetadata,
          remoteMetadata
        },
        resolutionStrategies: ['platform_aware_merge', 'ignore_platform', 'manual']
      };
    }

    return null;
  }

  /**
   * Normalize platform names for comparison
   * @param {string} platform - Platform string
   * @returns {string} Normalized platform
   */
  normalizePlatform(platform) {
    const p = platform.toLowerCase();
    if (p.includes('mac')) return 'mac';
    if (p.includes('win')) return 'windows';
    if (p.includes('linux')) return 'linux';
    if (p.includes('android')) return 'mobile';
    if (p.includes('iphone') || p.includes('ipad')) return 'mobile';
    return 'unknown';
  }

  /**
   * Prioritize conflicts by severity and type
   * @param {Object[]} conflicts - Array of conflicts
   * @returns {Object[]} Prioritized conflicts
   */
  prioritizeConflicts(conflicts) {
    return conflicts.sort((a, b) => {
      // Sort by severity (high to low), then by type
      if (a.severity !== b.severity) {
        return b.severity - a.severity;
      }
      return a.type.localeCompare(b.type);
    });
  }

  /**
   * Group conflicts by type for reporting
   * @param {Object[]} conflicts - Array of conflicts
   * @returns {Object} Conflicts grouped by type
   */
  groupConflictsByType(conflicts) {
    return conflicts.reduce((groups, conflict) => {
      const key = `${conflict.type}_${conflict.subtype}`;
      groups[key] = (groups[key] || 0) + 1;
      return groups;
    }, {});
  }

  /**
   * Group conflicts by severity for reporting
   * @param {Object[]} conflicts - Array of conflicts
   * @returns {Object} Conflicts grouped by severity
   */
  groupConflictsBySeverity(conflicts) {
    return conflicts.reduce((groups, conflict) => {
      const severity = conflict.severity;
      groups[severity] = (groups[severity] || 0) + 1;
      return groups;
    }, {});
  }

  /**
   * Generate hash for URL (for consistent conflict IDs)
   * @param {string} url - URL to hash
   * @returns {string} Hash string
   */
  hashUrl(url) {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
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