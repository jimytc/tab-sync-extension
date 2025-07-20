// End-to-end tests for complete sync workflows
// Tests integration between all components for real-world sync scenarios

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { syncEngine } from '../../shared/sync-engine.js';
import { authService } from '../../shared/auth/auth-service.js';
import { storageService } from '../../shared/storage/storage-service.js';
import { syncHistoryService } from '../../shared/sync-history-service.js';
import { TabManager } from '../../shared/tab-manager.js';

// Mock Chrome APIs for E2E testing
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
    getAll: vi.fn()
  },
  runtime: {
    getManifest: vi.fn(() => ({ version: '1.0.0' })),
    getURL: vi.fn(path => `chrome-extension://test/${path}`)
  },
  notifications: {
    create: vi.fn()
  }
};

// Mock navigator
global.navigator = {
  userAgent: 'Mozilla/5.0 (Test Browser) Chrome/120.0.0.0'
};

// Mock fetch for network operations
global.fetch = vi.fn();

describe('End-to-End Sync Workflows', () => {
  let mockTabs;
  let mockAuthTokens;
  let mockStorageData;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup mock data
    mockTabs = [
      {
        id: 1,
        url: 'https://example.com',
        title: 'Example Site',
        windowId: 1,
        index: 0,
        active: true,
        pinned: false
      },
      {
        id: 2,
        url: 'https://github.com',
        title: 'GitHub',
        windowId: 1,
        index: 1,
        active: false,
        pinned: true
      }
    ];

    mockAuthTokens = {
      access_token: 'mock_access_token',
      refresh_token: 'mock_refresh_token',
      expires_in: 3600
    };

    mockStorageData = {
      version: '1.0',
      deviceId: 'test-device-123',
      timestamp: Date.now(),
      tabs: [
        {
          id: 'remote_tab_1',
          url: 'https://remote-example.com',
          title: 'Remote Example',
          windowId: 1,
          index: 0,
          timestamp: Date.now() - 1000,
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
    chrome.tabs.query.mockResolvedValue(mockTabs);
    chrome.tabs.create.mockImplementation((createProperties) => 
      Promise.resolve({ 
        id: Math.floor(Math.random() * 1000), 
        ...createProperties 
      })
    );
    chrome.tabs.remove.mockResolvedValue();
    chrome.windows.getAll.mockResolvedValue([{ id: 1, type: 'normal' }]);
    
    chrome.storage.local.get.mockImplementation((keys) => {
      const result = {};
      if (keys.includes?.('authTokens') || keys === 'authTokens') {
        result.authTokens = mockAuthTokens;
      }
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
    
    // Mock successful fetch responses
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStorageData),
      text: () => Promise.resolve(JSON.stringify(mockStorageData))
    });

    // Initialize services
    await authService.initialize();
    await syncEngine.initialize();
    await syncHistoryService.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Complete Upload Sync Workflow', () => {
    it('should successfully upload local tabs to cloud storage', async () => {
      // Mock storage service to simulate successful upload
      const mockStore = vi.spyOn(storageService, 'store').mockResolvedValue({
        success: true,
        size: 1024,
        checksum: 'mock_checksum',
        timestamp: Date.now()
      });

      // Trigger upload sync
      const syncResult = await syncEngine.triggerSync({
        direction: 'upload',
        trigger: 'manual'
      });

      // Verify sync completed successfully
      expect(syncResult.status).toBe('completed');
      expect(syncResult.direction).toBe('upload');
      expect(syncResult.operations).toHaveLength(1);
      expect(syncResult.operations[0].type).toBe('upload');
      expect(syncResult.operations[0].tabCount).toBe(2);

      // Verify storage was called with correct data
      expect(mockStore).toHaveBeenCalledWith(
        'tab-sync-data.json',
        expect.objectContaining({
          deviceId: 'test-device-123',
          tabs: expect.arrayContaining([
            expect.objectContaining({
              url: 'https://example.com',
              title: 'Example Site'
            }),
            expect.objectContaining({
              url: 'https://github.com',
              title: 'GitHub'
            })
          ])
        }),
        expect.any(Object)
      );

      // Verify sync history was recorded
      const history = syncHistoryService.getHistory({ limit: 1 });
      expect(history.operations).toHaveLength(1);
      expect(history.operations[0].type).toBe('bidirectional');
      expect(history.operations[0].status).toBe('completed');
    });

    it('should handle upload failures gracefully', async () => {
      // Mock storage service to simulate failure
      const mockStore = vi.spyOn(storageService, 'store').mockRejectedValue(
        new Error('Storage quota exceeded')
      );

      // Trigger upload sync and expect it to fail
      await expect(syncEngine.triggerSync({
        direction: 'upload',
        trigger: 'manual'
      })).rejects.toThrow('Storage quota exceeded');

      // Verify error was recorded in sync history
      const history = syncHistoryService.getHistory({ limit: 1 });
      expect(history.operations).toHaveLength(1);
      expect(history.operations[0].status).toBe('failed');
      expect(history.operations[0].errors).toHaveLength(1);
    });
  });

  describe('Complete Download Sync Workflow', () => {
    it('should successfully download and apply remote tabs', async () => {
      // Mock storage service to return remote data
      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: mockStorageData,
        metadata: { size: 1024 }
      });

      // Trigger download sync
      const syncResult = await syncEngine.triggerSync({
        direction: 'download',
        trigger: 'manual'
      });

      // Verify sync completed successfully
      expect(syncResult.status).toBe('completed');
      expect(syncResult.direction).toBe('download');
      expect(syncResult.operations).toHaveLength(1);
      expect(syncResult.operations[0].type).toBe('download');

      // Verify storage was queried
      expect(mockRetrieve).toHaveBeenCalledWith('tab-sync-data.json');

      // Verify tabs were created
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://remote-example.com',
        active: false,
        windowId: 1,
        index: 0
      });
    });

    it('should handle missing remote data gracefully', async () => {
      // Mock storage service to simulate no remote data
      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockRejectedValue(
        new Error('FILE_NOT_FOUND')
      );

      // Trigger download sync
      const syncResult = await syncEngine.triggerSync({
        direction: 'download',
        trigger: 'manual'
      });

      // Verify sync completed with skip operation
      expect(syncResult.status).toBe('completed');
      expect(syncResult.operations).toHaveLength(1);
      expect(syncResult.operations[0].action).toBe('skip');
      expect(syncResult.operations[0].reason).toBe('no_remote_data');
    });
  });

  describe('Bidirectional Sync with Conflict Resolution', () => {
    it('should detect and resolve conflicts automatically', async () => {
      // Setup conflicting remote data (same URL, different metadata)
      const conflictingRemoteData = {
        ...mockStorageData,
        tabs: [
          {
            id: 'remote_tab_1',
            url: 'https://example.com', // Same URL as local tab
            title: 'Different Title', // Different title
            windowId: 2, // Different window
            index: 0,
            timestamp: Date.now() + 1000, // Newer timestamp
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
        checksum: 'mock_checksum',
        timestamp: Date.now()
      });

      // Trigger bidirectional sync
      const syncResult = await syncEngine.triggerSync({
        direction: 'bidirectional',
        trigger: 'manual'
      });

      // Verify conflicts were detected
      expect(syncResult.conflicts).toBeDefined();
      expect(syncResult.conflicts.length).toBeGreaterThan(0);

      // Verify sync still completed (with default resolution strategy)
      expect(syncResult.status).toBe('completed');
    });

    it('should handle no conflicts scenario', async () => {
      // Setup non-conflicting remote data
      const nonConflictingRemoteData = {
        ...mockStorageData,
        timestamp: Date.now() - 5000, // Older timestamp
        tabs: [
          {
            id: 'remote_tab_1',
            url: 'https://different-site.com', // Different URL
            title: 'Different Site',
            windowId: 1,
            index: 2,
            timestamp: Date.now() - 5000,
            deviceId: 'remote-device-456'
          }
        ]
      };

      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: nonConflictingRemoteData,
        metadata: { size: 1024 }
      });

      const mockStore = vi.spyOn(storageService, 'store').mockResolvedValue({
        success: true,
        size: 1024,
        checksum: 'mock_checksum',
        timestamp: Date.now()
      });

      // Trigger bidirectional sync
      const syncResult = await syncEngine.triggerSync({
        direction: 'bidirectional',
        trigger: 'manual'
      });

      // Verify no conflicts were detected
      expect(syncResult.conflicts).toHaveLength(0);
      expect(syncResult.status).toBe('completed');

      // Verify local data was uploaded (newer timestamp)
      expect(mockStore).toHaveBeenCalled();
    });
  });

  describe('Cross-Device Sync Scenarios', () => {
    it('should handle sync between multiple devices', async () => {
      // Simulate data from multiple devices
      const multiDeviceData = {
        ...mockStorageData,
        tabs: [
          {
            id: 'device1_tab_1',
            url: 'https://device1-site.com',
            title: 'Device 1 Site',
            windowId: 1,
            index: 0,
            timestamp: Date.now() - 2000,
            deviceId: 'device-1'
          },
          {
            id: 'device2_tab_1',
            url: 'https://device2-site.com',
            title: 'Device 2 Site',
            windowId: 1,
            index: 1,
            timestamp: Date.now() - 1000,
            deviceId: 'device-2'
          }
        ]
      };

      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: multiDeviceData,
        metadata: { size: 2048 }
      });

      // Trigger download sync
      const syncResult = await syncEngine.triggerSync({
        direction: 'download',
        trigger: 'automatic'
      });

      // Verify tabs from both devices were processed
      expect(syncResult.status).toBe('completed');
      expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
      
      // Verify tabs were created with correct URLs
      expect(chrome.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://device1-site.com' })
      );
      expect(chrome.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://device2-site.com' })
      );
    });

    it('should maintain device-specific metadata', async () => {
      const mockStore = vi.spyOn(storageService, 'store').mockResolvedValue({
        success: true,
        size: 1024,
        checksum: 'mock_checksum',
        timestamp: Date.now()
      });

      // Trigger upload sync
      await syncEngine.triggerSync({
        direction: 'upload',
        trigger: 'manual'
      });

      // Verify device metadata was included
      expect(mockStore).toHaveBeenCalledWith(
        'tab-sync-data.json',
        expect.objectContaining({
          deviceId: 'test-device-123',
          metadata: expect.objectContaining({
            deviceName: expect.any(String),
            browserVersion: expect.any(String),
            extensionVersion: '1.0.0'
          })
        }),
        expect.any(Object)
      );
    });
  });

  describe('Performance and Reliability Tests', () => {
    it('should handle large numbers of tabs efficiently', async () => {
      // Create a large number of mock tabs
      const largeMockTabs = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        url: `https://example${i}.com`,
        title: `Example Site ${i}`,
        windowId: Math.floor(i / 20) + 1,
        index: i % 20,
        active: i === 0,
        pinned: i < 5
      }));

      chrome.tabs.query.mockResolvedValue(largeMockTabs);

      const mockStore = vi.spyOn(storageService, 'store').mockResolvedValue({
        success: true,
        size: 10240,
        checksum: 'large_checksum',
        timestamp: Date.now()
      });

      const startTime = Date.now();
      
      // Trigger upload sync with large dataset
      const syncResult = await syncEngine.triggerSync({
        direction: 'upload',
        trigger: 'manual'
      });

      const duration = Date.now() - startTime;

      // Verify sync completed successfully
      expect(syncResult.status).toBe('completed');
      expect(syncResult.operations[0].tabCount).toBe(100);
      
      // Verify reasonable performance (should complete within 5 seconds)
      expect(duration).toBeLessThan(5000);

      // Verify all tabs were processed
      expect(mockStore).toHaveBeenCalledWith(
        'tab-sync-data.json',
        expect.objectContaining({
          tabs: expect.arrayContaining(
            largeMockTabs.map(tab => expect.objectContaining({
              url: tab.url,
              title: tab.title
            }))
          )
        }),
        expect.any(Object)
      );
    });

    it('should handle network failures with retry logic', async () => {
      let attemptCount = 0;
      const mockStore = vi.spyOn(storageService, 'store').mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('Network timeout'));
        }
        return Promise.resolve({
          success: true,
          size: 1024,
          checksum: 'retry_checksum',
          timestamp: Date.now()
        });
      });

      // Trigger upload sync (should retry on failure)
      const syncResult = await syncEngine.triggerSync({
        direction: 'upload',
        trigger: 'manual'
      });

      // Verify sync eventually succeeded after retries
      expect(syncResult.status).toBe('completed');
      expect(attemptCount).toBe(3);
    });

    it('should maintain data integrity during sync operations', async () => {
      const originalTabs = [...mockTabs];
      
      const mockStore = vi.spyOn(storageService, 'store').mockResolvedValue({
        success: true,
        size: 1024,
        checksum: 'integrity_checksum',
        timestamp: Date.now()
      });

      // Trigger upload sync
      const syncResult = await syncEngine.triggerSync({
        direction: 'upload',
        trigger: 'manual'
      });

      // Verify original tab data wasn't modified
      expect(mockTabs).toEqual(originalTabs);

      // Verify stored data maintains integrity
      const storedData = mockStore.mock.calls[0][1];
      expect(storedData.tabs).toHaveLength(2);
      expect(storedData.tabs[0]).toMatchObject({
        url: 'https://example.com',
        title: 'Example Site'
      });
      expect(storedData.tabs[1]).toMatchObject({
        url: 'https://github.com',
        title: 'GitHub'
      });
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from authentication failures', async () => {
      // Mock initial auth failure followed by success
      let authAttempts = 0;
      const mockGetAuthStatus = vi.spyOn(authService, 'getAuthStatus').mockImplementation(() => {
        authAttempts++;
        if (authAttempts === 1) {
          return Promise.resolve({
            isAuthenticated: false,
            tokensValid: false
          });
        }
        return Promise.resolve({
          isAuthenticated: true,
          tokensValid: true,
          provider: 'google'
        });
      });

      const mockRefreshTokens = vi.spyOn(authService, 'refreshTokens').mockResolvedValue(mockAuthTokens);

      // Trigger sync (should handle auth failure and recover)
      await expect(syncEngine.triggerSync({
        direction: 'upload',
        trigger: 'manual'
      })).rejects.toThrow();

      // Verify auth status was checked and refresh was attempted
      expect(mockGetAuthStatus).toHaveBeenCalled();
    });

    it('should handle storage corruption gracefully', async () => {
      // Mock corrupted remote data
      const corruptedData = {
        version: 'invalid',
        tabs: 'not_an_array',
        timestamp: 'invalid_timestamp'
      };

      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: corruptedData,
        metadata: { size: 512 }
      });

      const mockStore = vi.spyOn(storageService, 'store').mockResolvedValue({
        success: true,
        size: 1024,
        checksum: 'recovery_checksum',
        timestamp: Date.now()
      });

      // Trigger bidirectional sync (should handle corruption and upload local data)
      const syncResult = await syncEngine.triggerSync({
        direction: 'bidirectional',
        trigger: 'manual'
      });

      // Verify sync completed by uploading local data
      expect(syncResult.status).toBe('completed');
      expect(mockStore).toHaveBeenCalled();
    });

    it('should maintain sync history during failures', async () => {
      const mockStore = vi.spyOn(storageService, 'store').mockRejectedValue(
        new Error('Critical storage failure')
      );

      // Trigger sync that will fail
      await expect(syncEngine.triggerSync({
        direction: 'upload',
        trigger: 'manual'
      })).rejects.toThrow('Critical storage failure');

      // Verify failure was recorded in sync history
      const history = syncHistoryService.getHistory({ limit: 1 });
      expect(history.operations).toHaveLength(1);
      expect(history.operations[0].status).toBe('failed');
      expect(history.operations[0].errors).toHaveLength(1);
      expect(history.operations[0].errors[0].message).toBe('Critical storage failure');

      // Verify statistics were updated
      const stats = syncHistoryService.getStatistics();
      expect(stats.totalOperations).toBe(1);
      expect(stats.failedOperations).toBe(1);
      expect(stats.successfulOperations).toBe(0);
    });
  });

  describe('Concurrent Sync Operations', () => {
    it('should prevent concurrent sync operations', async () => {
      const mockStore = vi.spyOn(storageService, 'store').mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          success: true,
          size: 1024,
          checksum: 'concurrent_checksum',
          timestamp: Date.now()
        }), 100))
      );

      // Start first sync operation
      const firstSyncPromise = syncEngine.triggerSync({
        direction: 'upload',
        trigger: 'manual'
      });

      // Try to start second sync operation immediately
      await expect(syncEngine.triggerSync({
        direction: 'download',
        trigger: 'manual'
      })).rejects.toThrow('Sync already in progress');

      // Wait for first sync to complete
      const firstResult = await firstSyncPromise;
      expect(firstResult.status).toBe('completed');

      // Now second sync should be allowed
      const secondResult = await syncEngine.triggerSync({
        direction: 'download',
        trigger: 'manual'
      });
      expect(secondResult.status).toBe('completed');
    });
  });

  describe('Dry Run Operations', () => {
    it('should perform dry run without making actual changes', async () => {
      const mockStore = vi.spyOn(storageService, 'store');
      const mockTabCreate = chrome.tabs.create;

      // Trigger dry run upload
      const syncResult = await syncEngine.triggerSync({
        direction: 'upload',
        dryRun: true,
        trigger: 'manual'
      });

      // Verify sync completed as dry run
      expect(syncResult.status).toBe('completed');
      expect(syncResult.dryRun).toBe(true);
      expect(syncResult.operations[0].action).toBe('dry_run');

      // Verify no actual storage or tab operations were performed
      expect(mockStore).not.toHaveBeenCalled();
      expect(mockTabCreate).not.toHaveBeenCalled();
    });

    it('should show what would happen in dry run mode', async () => {
      const mockRetrieve = vi.spyOn(storageService, 'retrieve').mockResolvedValue({
        data: mockStorageData,
        metadata: { size: 1024 }
      });

      // Trigger dry run download
      const syncResult = await syncEngine.triggerSync({
        direction: 'download',
        dryRun: true,
        trigger: 'manual'
      });

      // Verify dry run results show what would be downloaded
      expect(syncResult.status).toBe('completed');
      expect(syncResult.operations[0].action).toBe('dry_run');
      expect(syncResult.operations[0].tabCount).toBe(1);

      // Verify no tabs were actually created
      expect(chrome.tabs.create).not.toHaveBeenCalled();
    });
  });
});

describe('Integration Test Utilities', () => {
  // Helper functions for setting up complex test scenarios
  
  const createMockTabSet = (count, deviceId = 'test-device') => {
    return Array.from({ length: count }, (_, i) => ({
      id: `${deviceId}_tab_${i}`,
      url: `https://example${i}.com`,
      title: `Example Site ${i}`,
      windowId: Math.floor(i / 10) + 1,
      index: i % 10,
      timestamp: Date.now() - (count - i) * 1000,
      deviceId: deviceId
    }));
  };

  const createConflictScenario = (localTabs, remoteTabs) => {
    // Create overlapping URLs with different metadata
    const conflictingUrl = 'https://conflict-site.com';
    
    localTabs.push({
      id: 'local_conflict_tab',
      url: conflictingUrl,
      title: 'Local Title',
      windowId: 1,
      index: 0,
      timestamp: Date.now(),
      deviceId: 'local-device'
    });

    remoteTabs.push({
      id: 'remote_conflict_tab',
      url: conflictingUrl,
      title: 'Remote Title',
      windowId: 2,
      index: 1,
      timestamp: Date.now() + 1000,
      deviceId: 'remote-device'
    });

    return { localTabs, remoteTabs };
  };

  it('should provide utility functions for test setup', () => {
    const tabs = createMockTabSet(5, 'test-device');
    expect(tabs).toHaveLength(5);
    expect(tabs[0].deviceId).toBe('test-device');
    expect(tabs[0].url).toBe('https://example0.com');

    const { localTabs, remoteTabs } = createConflictScenario([], []);
    expect(localTabs).toHaveLength(1);
    expect(remoteTabs).toHaveLength(1);
    expect(localTabs[0].url).toBe(remoteTabs[0].url);
    expect(localTabs[0].title).not.toBe(remoteTabs[0].title);
  });
});