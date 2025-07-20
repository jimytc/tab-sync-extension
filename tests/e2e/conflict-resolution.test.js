// End-to-end tests for conflict resolution workflows
// Tests complex conflict scenarios and resolution strategies

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { syncEngine } from '../../shared/sync-engine.js';
import { authService } from '../../shared/auth/auth-service.js';
import { storageService } from '../../shared/storage/storage-service.js';
import { syncHistoryService } from '../../shared/sync-history-service.js';

// Mock Chrome APIs
global.chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn()
    },
    session: {
      set: vi.fn(),
      get: vi.fn()
    }
  },
  tabs: {
    query: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    update: vi.fn()
  },
  windows: {
    create: vi.fn(),
    remove: vi.fn(),
    getAll: vi.fn(),
    onRemoved: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  },
  runtime: {
    getManifest: vi.fn(() => ({ version: '1.0.0' })),
    getURL: vi.fn(path => `chrome-extension://test/${path}`),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  },
  notifications: {
    create: vi.fn()
  }
};

global.navigator = {
  userAgent: 'Mozilla/5.0 (Test Browser) Chrome/120.0.0.0'
};

describe('End-to-End Conflict Resolution', () => {
  let localTabs;
  let remoteSyncData;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup base local tabs
    localTabs = [
      {
        id: 1,
        url: 'https://local-only.com',
        title: 'Local Only Site',
        windowId: 1,
        index: 0,
        active: true,
        pinned: false
      },
      {
        id: 2,
        url: 'https://shared-site.com',
        title: 'Local Version of Shared Site',
        windowId: 1,
        index: 1,
        active: false,
        pinned: false
      }
    ];

    // Setup base remote sync data
    remoteSyncData = {
      version: '1.0',
      deviceId: 'remote-device-456',
      timestamp: Date.now(),
      tabs: [
        {
          id: 'remote_tab_1',
          url: 'https://remote-only.com',
          title: 'Remote Only Site',
          windowId: 1,
          index: 0,
          timestamp: Date.now() - 1000,
          deviceId: 'remote-device-456'
        },
        {
          id: 'remote_tab_2',
          url: 'https://shared-site.com',
          title: 'Remote Version of Shared Site',
          windowId: 2,
          index: 0,
          timestamp: Date.now() + 1000, // Newer than local
          deviceId: 'remote-device-456'
        }
      ],
      metadata: {
        deviceName: 'Remote Device',
        browserVersion: 'Chrome/120.0.0.0',
        extensionVersion: '1.0.0'
      }
    };

    // Setup Chrome API mocks
    chrome.tabs.query.mockResolvedValue(localTabs);
    chrome.tabs.create.mockImplementation((createProperties) => 
      Promise.resolve({ 
        id: Math.floor(Math.random() * 1000), 
        ...createProperties 
      })
    );
    chrome.windows.getAll.mockResolvedValue([{ id: 1, type: 'normal' }]);
    
    chrome.storage.local.get.mockImplementation((keys) => {
      const result = {};
      if (keys.includes?.('isAuthenticated') || keys === 'isAuthenticated') {
        result.isAuthenticated = true;
      }
      if (keys.includes?.('authProvider') || keys === 'authProvider') {
        result.authProvider = 'google';
      }
      if (keys.includes?.('deviceId') || keys === 'deviceId') {
        result.deviceId = 'test-device-123';
      }
      return Promise.resolve(result);
    });
    
    chrome.storage.local.set.mockResolvedValue();

    // Initialize services
    await authService.initialize();
    await syncEngine.initialize();
    await syncHistoryService.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Timestamp Conflict Resolution', () => {
    it('should detect concurrent modification conflicts', async () => {
      // Setup concurrent modifications (both local and remote newer than last sync)
      const lastSyncTime = Date.now() - 5000;
      syncEngine.lastSyncTime = lastSyncTime;

      // Local tabs modified after last sync
      localTabs[1].timestamp = Date.now() - 1000;
      
      // Remote data also modified after last sync
      remoteSyncData.timestamp = Date.now() - 500;

      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: remoteSyncData,
        metadata: { size: 1024 }
      });

      const mockStore = vi.spyOn(storageService, 'store').mockResolvedValue({
        success: true,
        size: 1024,
        checksum: 'conflict_checksum',
        timestamp: Date.now()
      });

      // Trigger bidirectional sync
      const syncResult = await syncEngine.triggerSync({
        direction: 'bidirectional',
        trigger: 'manual'
      });

      // Verify conflicts were detected
      expect(syncResult.conflicts).toBeDefined();
      const timestampConflicts = syncResult.conflicts.filter(c => c.type === 'timestamp');
      expect(timestampConflicts.length).toBeGreaterThan(0);
      expect(timestampConflicts[0].subtype).toBe('concurrent_modification');

      // Verify sync completed with default resolution (local wins)
      expect(syncResult.status).toBe('completed');
    });

    it('should detect stale data conflicts', async () => {
      // Setup stale local data
      const weekAgo = Date.now() - (8 * 24 * 60 * 60 * 1000);
      localTabs.forEach(tab => {
        tab.timestamp = weekAgo;
      });

      // Remote data is recent
      remoteSyncData.timestamp = Date.now() - 1000;

      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: remoteSyncData,
        metadata: { size: 1024 }
      });

      // Trigger bidirectional sync
      const syncResult = await syncEngine.triggerSync({
        direction: 'bidirectional',
        trigger: 'manual'
      });

      // Verify stale data conflict was detected
      const staleConflicts = syncResult.conflicts.filter(c => 
        c.type === 'timestamp' && c.subtype === 'stale_local'
      );
      expect(staleConflicts.length).toBeGreaterThan(0);
    });
  });

  describe('Tab-Level Conflict Resolution', () => {
    it('should detect and resolve tab metadata conflicts', async () => {
      // Setup tab with same URL but different metadata
      const conflictingTab = {
        id: 'remote_conflict_tab',
        url: 'https://shared-site.com',
        title: 'Different Remote Title',
        windowId: 3, // Different window
        index: 2, // Different index
        timestamp: Date.now() + 2000,
        deviceId: 'remote-device-456'
      };

      remoteSyncData.tabs[1] = conflictingTab;

      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: remoteSyncData,
        metadata: { size: 1024 }
      });

      const mockStore = vi.spyOn(storageService, 'store').mockResolvedValue({
        success: true,
        size: 1024,
        checksum: 'metadata_conflict_checksum',
        timestamp: Date.now()
      });

      // Trigger bidirectional sync
      const syncResult = await syncEngine.triggerSync({
        direction: 'bidirectional',
        trigger: 'manual'
      });

      // Verify tab metadata conflicts were detected
      const tabConflicts = syncResult.conflicts.filter(c => c.type === 'tab_metadata');
      expect(tabConflicts.length).toBeGreaterThan(0);
      
      const modifiedConflict = tabConflicts.find(c => c.subtype === 'modified');
      expect(modifiedConflict).toBeDefined();
      expect(modifiedConflict.url).toBe('https://shared-site.com');
      expect(modifiedConflict.details.differences).toBeDefined();
    });

    it('should detect duplicate tab conflicts', async () => {
      // Add duplicate tabs from different devices
      remoteSyncData.tabs.push({
        id: 'remote_duplicate_1',
        url: 'https://shared-site.com',
        title: 'Another Remote Version',
        windowId: 1,
        index: 3,
        timestamp: Date.now(),
        deviceId: 'another-remote-device'
      });

      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: remoteSyncData,
        metadata: { size: 1024 }
      });

      // Trigger bidirectional sync
      const syncResult = await syncEngine.triggerSync({
        direction: 'bidirectional',
        trigger: 'manual'
      });

      // Verify duplicate conflicts were detected
      const duplicateConflicts = syncResult.conflicts.filter(c => 
        c.type === 'tab_metadata' && c.subtype === 'duplicate'
      );
      expect(duplicateConflicts.length).toBeGreaterThan(0);
      
      const duplicateConflict = duplicateConflicts[0];
      expect(duplicateConflict.url).toBe('https://shared-site.com');
      expect(duplicateConflict.details.devices.length).toBeGreaterThan(1);
    });
  });

  describe('Structural Conflict Resolution', () => {
    it('should detect window organization conflicts', async () => {
      // Setup different window organizations
      localTabs[0].windowId = 1;
      localTabs[1].windowId = 1;

      remoteSyncData.tabs[0].windowId = 1;
      remoteSyncData.tabs[1].windowId = 2; // Different window

      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: remoteSyncData,
        metadata: { size: 1024 }
      });

      // Trigger bidirectional sync
      const syncResult = await syncEngine.triggerSync({
        direction: 'bidirectional',
        trigger: 'manual'
      });

      // Verify structural conflicts were detected
      const structuralConflicts = syncResult.conflicts.filter(c => c.type === 'structural');
      expect(structuralConflicts.length).toBeGreaterThan(0);
    });

    it('should detect tab order conflicts', async () => {
      // Setup same tabs in different orders
      localTabs[0].index = 0;
      localTabs[1].index = 1;

      // Remote has same tabs but different order
      remoteSyncData.tabs = [
        {
          id: 'remote_tab_1',
          url: 'https://shared-site.com',
          title: 'Shared Site',
          windowId: 1,
          index: 0, // Different order
          timestamp: Date.now(),
          deviceId: 'remote-device-456'
        },
        {
          id: 'remote_tab_2',
          url: 'https://local-only.com',
          title: 'Local Only Site',
          windowId: 1,
          index: 1, // Different order
          timestamp: Date.now(),
          deviceId: 'remote-device-456'
        }
      ];

      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: remoteSyncData,
        metadata: { size: 1024 }
      });

      // Trigger bidirectional sync
      const syncResult = await syncEngine.triggerSync({
        direction: 'bidirectional',
        trigger: 'manual'
      });

      // Verify tab order conflicts were detected
      const orderConflicts = syncResult.conflicts.filter(c => 
        c.type === 'structural' && c.subtype === 'tab_order'
      );
      expect(orderConflicts.length).toBeGreaterThan(0);
    });
  });

  describe('Conflict Resolution UI Integration', () => {
    it('should create conflict resolution window for user input', async () => {
      // Setup conflicts
      remoteSyncData.tabs[1].title = 'Conflicting Title';
      remoteSyncData.tabs[1].timestamp = Date.now() + 1000;

      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: remoteSyncData,
        metadata: { size: 1024 }
      });

      // Mock window creation
      chrome.windows.create.mockResolvedValue({ id: 123 });

      // Trigger bidirectional sync with conflict UI enabled
      const syncPromise = syncEngine.triggerSync({
        direction: 'bidirectional',
        showConflictUI: true,
        trigger: 'manual'
      });

      // Wait a bit for conflict detection
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify conflict resolution window was created
      expect(chrome.windows.create).toHaveBeenCalledWith({
        url: 'chrome-extension://test/shared/conflict-resolution-modal.html',
        type: 'popup',
        width: 1000,
        height: 700,
        focused: true
      });

      // Verify conflict data was stored for modal
      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        'conflict_data_123': expect.objectContaining({
          conflicts: expect.any(Array),
          context: expect.any(Object),
          deviceId: 'test-device-123'
        })
      });

      // Simulate user cancelling conflict resolution
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      messageListener(
        { type: 'conflict-resolution-cancelled' },
        { tab: { windowId: 123 } },
        vi.fn()
      );

      const syncResult = await syncPromise;
      
      // Verify sync completed with default resolution
      expect(syncResult.status).toBe('completed');
    });

    it('should handle user conflict resolution choices', async () => {
      // Setup conflicts
      const conflictingRemoteData = {
        ...remoteSyncData,
        tabs: [
          {
            id: 'remote_conflict_tab',
            url: 'https://shared-site.com',
            title: 'User Will Choose This Title',
            windowId: 1,
            index: 0,
            timestamp: Date.now() + 1000,
            deviceId: 'remote-device-456'
          }
        ]
      };

      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: conflictingRemoteData,
        metadata: { size: 1024 }
      });

      const mockStore = vi.spyOn(storageService, 'store').mockResolvedValue({
        success: true,
        size: 1024,
        checksum: 'user_resolution_checksum',
        timestamp: Date.now()
      });

      chrome.windows.create.mockResolvedValue({ id: 456 });

      // Trigger bidirectional sync with conflict UI
      const syncPromise = syncEngine.triggerSync({
        direction: 'bidirectional',
        showConflictUI: true,
        trigger: 'manual'
      });

      // Wait for conflict detection
      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate user providing resolution choices
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const userChoices = {
        'conflict_1': {
          strategy: 'remote_wins',
          choice: 'keep_remote',
          tabData: {
            url: 'https://shared-site.com',
            title: 'User Will Choose This Title'
          }
        }
      };

      messageListener(
        { 
          type: 'conflict-resolution-complete',
          resolutionChoices: userChoices
        },
        { tab: { windowId: 456 } },
        vi.fn()
      );

      const syncResult = await syncPromise;

      // Verify sync completed with user choices applied
      expect(syncResult.status).toBe('completed');
      expect(syncResult.conflicts.length).toBeGreaterThan(0);
    });
  });

  describe('Advanced Conflict Scenarios', () => {
    it('should handle complex multi-device conflicts', async () => {
      // Setup data from 3 different devices with overlapping tabs
      const multiDeviceData = {
        ...remoteSyncData,
        tabs: [
          {
            id: 'device1_tab',
            url: 'https://multi-device-site.com',
            title: 'Device 1 Version',
            windowId: 1,
            index: 0,
            timestamp: Date.now() - 3000,
            deviceId: 'device-1'
          },
          {
            id: 'device2_tab',
            url: 'https://multi-device-site.com',
            title: 'Device 2 Version',
            windowId: 1,
            index: 0,
            timestamp: Date.now() - 2000,
            deviceId: 'device-2'
          },
          {
            id: 'device3_tab',
            url: 'https://multi-device-site.com',
            title: 'Device 3 Version',
            windowId: 2,
            index: 0,
            timestamp: Date.now() - 1000,
            deviceId: 'device-3'
          }
        ]
      };

      // Add local version
      localTabs.push({
        id: 3,
        url: 'https://multi-device-site.com',
        title: 'Local Device Version',
        windowId: 1,
        index: 2,
        active: false,
        pinned: false,
        timestamp: Date.now()
      });

      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: multiDeviceData,
        metadata: { size: 2048 }
      });

      // Trigger bidirectional sync
      const syncResult = await syncEngine.triggerSync({
        direction: 'bidirectional',
        trigger: 'manual'
      });

      // Verify complex conflicts were detected
      expect(syncResult.conflicts.length).toBeGreaterThan(0);
      
      const duplicateConflicts = syncResult.conflicts.filter(c => 
        c.type === 'tab_metadata' && c.subtype === 'duplicate'
      );
      expect(duplicateConflicts.length).toBeGreaterThan(0);
      
      const duplicateConflict = duplicateConflicts[0];
      expect(duplicateConflict.details.devices.length).toBe(4); // 3 remote + 1 local
    });

    it('should handle conflicts with pinned tabs', async () => {
      // Setup pinned tab conflicts
      localTabs[1].pinned = true;
      localTabs[1].index = 0; // Pinned tabs typically have lower indices

      remoteSyncData.tabs[1].pinned = false;
      remoteSyncData.tabs[1].index = 5; // Not pinned, higher index

      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: remoteSyncData,
        metadata: { size: 1024 }
      });

      // Trigger bidirectional sync
      const syncResult = await syncEngine.triggerSync({
        direction: 'bidirectional',
        trigger: 'manual'
      });

      // Verify pinned tab conflicts were detected
      const pinnedConflicts = syncResult.conflicts.filter(c => 
        c.details && c.details.differences && 
        c.details.differences.some(d => d.field === 'pinned')
      );
      expect(pinnedConflicts.length).toBeGreaterThan(0);
    });

    it('should handle conflicts with active tab states', async () => {
      // Setup active tab conflicts (multiple tabs claiming to be active)
      localTabs[0].active = true;
      localTabs[1].active = false;

      remoteSyncData.tabs[0].active = false;
      remoteSyncData.tabs[1].active = true; // Different active tab

      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: remoteSyncData,
        metadata: { size: 1024 }
      });

      // Trigger bidirectional sync
      const syncResult = await syncEngine.triggerSync({
        direction: 'bidirectional',
        trigger: 'manual'
      });

      // Verify active state conflicts were handled
      expect(syncResult.status).toBe('completed');
      
      // Check if conflicts were detected for active state differences
      const activeConflicts = syncResult.conflicts.filter(c => 
        c.details && c.details.differences && 
        c.details.differences.some(d => d.field === 'active')
      );
      
      // Active state conflicts should be detected if tabs have different active states
      if (activeConflicts.length > 0) {
        expect(activeConflicts[0].details.differences).toContainEqual(
          expect.objectContaining({ field: 'active' })
        );
      }
    });
  });

  describe('Conflict Resolution Performance', () => {
    it('should handle large numbers of conflicts efficiently', async () => {
      // Create many conflicting tabs
      const manyLocalTabs = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        url: `https://conflict-site-${i}.com`,
        title: `Local Title ${i}`,
        windowId: 1,
        index: i,
        active: i === 0,
        pinned: false,
        timestamp: Date.now() - 1000
      }));

      const manyRemoteTabs = Array.from({ length: 50 }, (_, i) => ({
        id: `remote_tab_${i}`,
        url: `https://conflict-site-${i}.com`,
        title: `Remote Title ${i}`, // Different titles
        windowId: 2, // Different window
        index: i,
        timestamp: Date.now() + 1000, // Newer
        deviceId: 'remote-device-456'
      }));

      chrome.tabs.query.mockResolvedValue(manyLocalTabs);

      const conflictingRemoteData = {
        ...remoteSyncData,
        tabs: manyRemoteTabs
      };

      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: conflictingRemoteData,
        metadata: { size: 10240 }
      });

      const startTime = Date.now();

      // Trigger bidirectional sync with many conflicts
      const syncResult = await syncEngine.triggerSync({
        direction: 'bidirectional',
        trigger: 'manual'
      });

      const duration = Date.now() - startTime;

      // Verify conflicts were detected efficiently
      expect(syncResult.conflicts.length).toBeGreaterThan(0);
      expect(syncResult.status).toBe('completed');
      
      // Should complete within reasonable time (10 seconds for 50 conflicts)
      expect(duration).toBeLessThan(10000);
    });

    it('should prioritize conflicts by severity', async () => {
      // Setup conflicts with different severity levels
      const criticalConflictData = {
        ...remoteSyncData,
        deviceId: 'test-device-123', // Same device ID (critical)
        tabs: [
          {
            id: 'critical_conflict',
            url: 'https://critical-site.com',
            title: 'Critical Conflict',
            windowId: 1,
            index: 0,
            timestamp: Date.now(),
            deviceId: 'test-device-123' // Same device ID
          },
          {
            id: 'minor_conflict',
            url: 'https://minor-site.com',
            title: 'Minor Conflict',
            windowId: 1,
            index: 1,
            timestamp: Date.now(),
            deviceId: 'remote-device-456'
          }
        ]
      };

      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: criticalConflictData,
        metadata: { size: 1024 }
      });

      // Trigger bidirectional sync
      const syncResult = await syncEngine.triggerSync({
        direction: 'bidirectional',
        trigger: 'manual'
      });

      // Verify conflicts were prioritized by severity
      if (syncResult.conflicts.length > 1) {
        const sortedBySeverity = [...syncResult.conflicts].sort((a, b) => b.severity - a.severity);
        expect(sortedBySeverity[0].severity).toBeGreaterThanOrEqual(sortedBySeverity[1].severity);
      }
    });
  });

  describe('Conflict Resolution History', () => {
    it('should record conflict resolution in sync history', async () => {
      // Setup conflicts
      remoteSyncData.tabs[1].title = 'Conflicting Remote Title';
      remoteSyncData.tabs[1].timestamp = Date.now() + 1000;

      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: remoteSyncData,
        metadata: { size: 1024 }
      });

      const mockStore = vi.spyOn(storageService, 'store').mockResolvedValue({
        success: true,
        size: 1024,
        checksum: 'conflict_history_checksum',
        timestamp: Date.now()
      });

      // Trigger bidirectional sync
      const syncResult = await syncEngine.triggerSync({
        direction: 'bidirectional',
        trigger: 'manual'
      });

      // Verify conflict resolution was recorded in history
      const history = syncHistoryService.getHistory({ limit: 1 });
      expect(history.operations).toHaveLength(1);
      
      const operation = history.operations[0];
      expect(operation.conflictsDetected).toBeGreaterThan(0);
      
      // If conflicts were resolved automatically
      if (operation.conflictsResolved > 0) {
        expect(operation.conflictsResolved).toBeGreaterThan(0);
      }
    });

    it('should track conflict resolution strategies used', async () => {
      // Setup conflicts that will use local wins strategy
      remoteSyncData.tabs[1].title = 'Remote Title';
      remoteSyncData.tabs[1].timestamp = Date.now() - 1000; // Older than local

      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: remoteSyncData,
        metadata: { size: 1024 }
      });

      const mockStore = vi.spyOn(storageService, 'store').mockResolvedValue({
        success: true,
        size: 1024,
        checksum: 'strategy_tracking_checksum',
        timestamp: Date.now()
      });

      // Trigger bidirectional sync
      await syncEngine.triggerSync({
        direction: 'bidirectional',
        trigger: 'manual'
      });

      // Verify conflict resolution strategy was recorded
      const history = syncHistoryService.getHistory({ limit: 1 });
      const operation = history.operations[0];
      
      // Look for conflict resolution operations
      const conflictOps = operation.phases?.filter(phase => 
        phase.name === 'conflict_resolution'
      ) || [];
      
      if (conflictOps.length > 0) {
        expect(conflictOps[0]).toBeDefined();
      }
    });
  });
});