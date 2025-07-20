/**
 * Conflict Resolution Integration Tests
 * Tests the integration between sync engine and conflict resolution UI
 */

import { syncEngine } from '../shared/sync-engine.js';
import { authService } from '../shared/auth/auth-service.js';
import { storageService } from '../shared/storage/storage-service.js';

// Mock Chrome APIs
global.chrome = {
  storage: {
    session: {
      set: jest.fn().mockResolvedValue(),
      get: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue()
    },
    local: {
      set: jest.fn().mockResolvedValue(),
      get: jest.fn().mockResolvedValue({})
    }
  },
  windows: {
    create: jest.fn().mockResolvedValue({ id: 123 }),
    remove: jest.fn().mockResolvedValue(),
    getCurrent: jest.fn().mockResolvedValue({ id: 123 }),
    onRemoved: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },
  runtime: {
    getURL: jest.fn(path => `chrome-extension://test/${path}`),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    sendMessage: jest.fn().mockResolvedValue()
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 1 }),
    remove: jest.fn().mockResolvedValue()
  }
};

describe('Conflict Resolution Integration', () => {
  let mockLocalTabs;
  let mockRemoteSyncData;
  let mockConflicts;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock local tabs
    mockLocalTabs = [
      {
        id: 'tab1',
        url: 'https://example.com',
        title: 'Example Local',
        timestamp: Date.now() - 1000,
        deviceId: 'local-device',
        windowId: 1,
        index: 0
      },
      {
        id: 'tab2',
        url: 'https://test.com',
        title: 'Test Local',
        timestamp: Date.now() - 2000,
        deviceId: 'local-device',
        windowId: 1,
        index: 1
      }
    ];

    // Mock remote sync data
    mockRemoteSyncData = {
      deviceId: 'remote-device',
      timestamp: Date.now() - 500,
      tabs: [
        {
          id: 'tab1',
          url: 'https://example.com',
          title: 'Example Remote',
          timestamp: Date.now() - 800,
          deviceId: 'remote-device',
          windowId: 1,
          index: 0
        },
        {
          id: 'tab3',
          url: 'https://new.com',
          title: 'New Remote',
          timestamp: Date.now() - 1500,
          deviceId: 'remote-device',
          windowId: 1,
          index: 1
        }
      ]
    };

    // Mock conflicts
    mockConflicts = [
      {
        id: 'conflict_1',
        type: 'tab_metadata',
        subtype: 'modified',
        severity: 2,
        description: 'Tab "Example" has different metadata',
        url: 'https://example.com',
        details: {
          localTab: mockLocalTabs[0],
          remoteTab: mockRemoteSyncData.tabs[0],
          differences: [
            { field: 'title', localValue: 'Example Local', remoteValue: 'Example Remote', severity: 2 }
          ]
        },
        resolutionStrategies: ['local_wins', 'remote_wins', 'merge_metadata']
      }
    ];

    // Mock auth and storage services
    authService.isAuthenticated = jest.fn().mockResolvedValue(true);
    storageService.isInitialized = jest.fn().mockReturnValue(true);
    storageService.testConnection = jest.fn().mockResolvedValue({ success: true });
  });

  describe('showConflictResolutionUI', () => {
    it('should create conflict resolution window with proper data', async () => {
      const context = { localTabs: mockLocalTabs, remoteSyncData: mockRemoteSyncData };
      
      // Mock window creation and message handling
      const mockResolve = jest.fn();
      
      await syncEngine.showConflictResolutionUI(mockConflicts, context);
      
      expect(chrome.windows.create).toHaveBeenCalledWith({
        url: 'chrome-extension://test/shared/conflict-resolution-modal.html',
        type: 'popup',
        width: 1000,
        height: 700,
        focused: true
      });
      
      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        'conflict_data_123': {
          conflicts: mockConflicts,
          context: context,
          deviceId: syncEngine.deviceId,
          timestamp: expect.any(Number)
        }
      });
    });

    it('should handle window creation failure gracefully', async () => {
      chrome.windows.create.mockRejectedValue(new Error('Window creation failed'));
      
      const result = await syncEngine.showConflictResolutionUI(mockConflicts);
      
      expect(result).toBeNull();
    });

    it('should return null in non-extension context', async () => {
      const originalChrome = global.chrome;
      delete global.chrome;
      
      const result = await syncEngine.showConflictResolutionUI(mockConflicts);
      
      expect(result).toBeNull();
      
      global.chrome = originalChrome;
    });
  });

  describe('createConflictResolutionWindow', () => {
    it('should setup message listeners for resolution completion', async () => {
      const mockResolve = jest.fn();
      const context = { localTabs: mockLocalTabs };
      
      await syncEngine.createConflictResolutionWindow(mockConflicts, context, mockResolve);
      
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
      expect(chrome.windows.onRemoved.addListener).toHaveBeenCalled();
    });

    it('should handle resolution completion message', async () => {
      const mockResolve = jest.fn();
      const context = { localTabs: mockLocalTabs };
      const resolutionChoices = { conflict_1: 'local_wins' };
      
      // Capture the message listener
      let messageListener;
      chrome.runtime.onMessage.addListener.mockImplementation(listener => {
        messageListener = listener;
      });
      
      await syncEngine.createConflictResolutionWindow(mockConflicts, context, mockResolve);
      
      // Simulate resolution completion message
      const mockSender = { tab: { windowId: 123 } };
      const mockMessage = {
        type: 'conflict-resolution-complete',
        resolutionChoices: resolutionChoices
      };
      
      messageListener(mockMessage, mockSender, jest.fn());
      
      expect(chrome.windows.remove).toHaveBeenCalledWith(123);
      expect(mockResolve).toHaveBeenCalledWith(resolutionChoices);
    });

    it('should handle resolution cancellation message', async () => {
      const mockResolve = jest.fn();
      const context = { localTabs: mockLocalTabs };
      
      // Capture the message listener
      let messageListener;
      chrome.runtime.onMessage.addListener.mockImplementation(listener => {
        messageListener = listener;
      });
      
      await syncEngine.createConflictResolutionWindow(mockConflicts, context, mockResolve);
      
      // Simulate cancellation message
      const mockSender = { tab: { windowId: 123 } };
      const mockMessage = { type: 'conflict-resolution-cancelled' };
      
      messageListener(mockMessage, mockSender, jest.fn());
      
      expect(chrome.windows.remove).toHaveBeenCalledWith(123);
      expect(mockResolve).toHaveBeenCalledWith(null);
    });

    it('should handle window closed without resolution', async () => {
      const mockResolve = jest.fn();
      const context = { localTabs: mockLocalTabs };
      
      // Capture the window removed listener
      let windowRemovedListener;
      chrome.windows.onRemoved.addListener.mockImplementation(listener => {
        windowRemovedListener = listener;
      });
      
      await syncEngine.createConflictResolutionWindow(mockConflicts, context, mockResolve);
      
      // Simulate window being closed
      windowRemovedListener(123);
      
      expect(mockResolve).toHaveBeenCalledWith(null);
    });
  });

  describe('bidirectional sync with conflict resolution', () => {
    beforeEach(() => {
      // Mock sync engine methods
      syncEngine.tabManager = {
        getCurrentTabs: jest.fn().mockResolvedValue(mockLocalTabs)
      };
      
      storageService.retrieve = jest.fn().mockResolvedValue({
        data: mockRemoteSyncData
      });
      
      syncEngine.detectConflicts = jest.fn().mockResolvedValue(mockConflicts);
      syncEngine.performAdvancedMerge = jest.fn().mockResolvedValue();
      syncEngine.resolveConflictsLocalWins = jest.fn().mockResolvedValue();
    });

    it('should show conflict UI when conflicts are detected', async () => {
      const showConflictUISpy = jest.spyOn(syncEngine, 'showConflictResolutionUI')
        .mockResolvedValue({ conflict_1: 'local_wins' });
      
      const syncResult = {
        syncId: 'test-sync',
        deviceId: 'local-device',
        startTime: Date.now(),
        direction: 'bidirectional',
        status: 'in_progress',
        operations: [],
        conflicts: [],
        errors: []
      };
      
      await syncEngine.performBidirectionalSync(syncResult);
      
      expect(showConflictUISpy).toHaveBeenCalledWith(mockConflicts, {
        localTabs: mockLocalTabs,
        remoteSyncData: mockRemoteSyncData,
        syncResult: syncResult
      });
      
      expect(syncEngine.performAdvancedMerge).toHaveBeenCalledWith(
        syncResult,
        mockLocalTabs,
        mockRemoteSyncData,
        mockConflicts,
        { conflict_1: 'local_wins' },
        {}
      );
    });

    it('should use default resolution when UI is disabled', async () => {
      const syncResult = {
        syncId: 'test-sync',
        deviceId: 'local-device',
        startTime: Date.now(),
        direction: 'bidirectional',
        status: 'in_progress',
        operations: [],
        conflicts: [],
        errors: []
      };
      
      const options = { showConflictUI: false };
      
      await syncEngine.performBidirectionalSync(syncResult, options);
      
      expect(syncEngine.resolveConflictsLocalWins).toHaveBeenCalledWith(
        syncResult,
        mockLocalTabs,
        mockRemoteSyncData,
        mockConflicts,
        options
      );
    });

    it('should use default resolution when user cancels conflict UI', async () => {
      const showConflictUISpy = jest.spyOn(syncEngine, 'showConflictResolutionUI')
        .mockResolvedValue(null); // User cancelled
      
      const syncResult = {
        syncId: 'test-sync',
        deviceId: 'local-device',
        startTime: Date.now(),
        direction: 'bidirectional',
        status: 'in_progress',
        operations: [],
        conflicts: [],
        errors: []
      };
      
      await syncEngine.performBidirectionalSync(syncResult);
      
      expect(showConflictUISpy).toHaveBeenCalled();
      expect(syncEngine.resolveConflictsLocalWins).toHaveBeenCalledWith(
        syncResult,
        mockLocalTabs,
        mockRemoteSyncData,
        mockConflicts,
        {}
      );
    });

    it('should handle dry run with conflicts', async () => {
      const syncResult = {
        syncId: 'test-sync',
        deviceId: 'local-device',
        startTime: Date.now(),
        direction: 'bidirectional',
        status: 'in_progress',
        operations: [],
        conflicts: [],
        errors: []
      };
      
      const options = { dryRun: true };
      
      await syncEngine.performBidirectionalSync(syncResult, options);
      
      expect(syncResult.operations).toContainEqual({
        type: 'bidirectional',
        action: 'dry_run_conflicts',
        conflictCount: mockConflicts.length,
        timestamp: expect.any(Number)
      });
    });
  });

  describe('performAdvancedMerge integration', () => {
    it('should apply user resolution choices correctly', async () => {
      const syncResult = {
        syncId: 'test-sync',
        operations: [],
        conflicts: []
      };
      
      const resolutionChoices = {
        conflict_1: 'local_wins'
      };
      
      // Mock the resolution methods
      syncEngine.resolveTabMetadataConflicts = jest.fn().mockResolvedValue();
      syncEngine.applyMergedTabs = jest.fn().mockResolvedValue([]);
      
      await syncEngine.performAdvancedMerge(
        syncResult,
        mockLocalTabs,
        mockRemoteSyncData,
        mockConflicts,
        resolutionChoices
      );
      
      expect(syncEngine.resolveTabMetadataConflicts).toHaveBeenCalledWith(
        mockConflicts,
        mockLocalTabs,
        mockRemoteSyncData.tabs,
        resolutionChoices,
        expect.any(Object)
      );
    });
  });

  describe('error handling', () => {
    it('should handle conflict resolution UI errors gracefully', async () => {
      const showConflictUISpy = jest.spyOn(syncEngine, 'showConflictResolutionUI')
        .mockRejectedValue(new Error('UI error'));
      
      const syncResult = {
        syncId: 'test-sync',
        deviceId: 'local-device',
        startTime: Date.now(),
        direction: 'bidirectional',
        status: 'in_progress',
        operations: [],
        conflicts: [],
        errors: []
      };
      
      // Mock sync engine methods
      syncEngine.tabManager = {
        getCurrentTabs: jest.fn().mockResolvedValue(mockLocalTabs)
      };
      
      storageService.retrieve = jest.fn().mockResolvedValue({
        data: mockRemoteSyncData
      });
      
      syncEngine.detectConflicts = jest.fn().mockResolvedValue(mockConflicts);
      syncEngine.resolveConflictsLocalWins = jest.fn().mockResolvedValue();
      
      await syncEngine.performBidirectionalSync(syncResult);
      
      // Should fall back to default resolution
      expect(syncEngine.resolveConflictsLocalWins).toHaveBeenCalled();
    });

    it('should handle advanced merge errors', async () => {
      const syncResult = {
        syncId: 'test-sync',
        deviceId: 'local-device',
        startTime: Date.now(),
        direction: 'bidirectional',
        status: 'in_progress',
        operations: [],
        conflicts: [],
        errors: []
      };
      
      const resolutionChoices = { conflict_1: 'local_wins' };
      
      // Mock methods
      syncEngine.tabManager = {
        getCurrentTabs: jest.fn().mockResolvedValue(mockLocalTabs)
      };
      
      storageService.retrieve = jest.fn().mockResolvedValue({
        data: mockRemoteSyncData
      });
      
      syncEngine.detectConflicts = jest.fn().mockResolvedValue(mockConflicts);
      syncEngine.showConflictResolutionUI = jest.fn().mockResolvedValue(resolutionChoices);
      syncEngine.performAdvancedMerge = jest.fn().mockRejectedValue(new Error('Merge failed'));
      
      await expect(syncEngine.performBidirectionalSync(syncResult)).rejects.toThrow('Merge failed');
    });
  });
});

describe('ConflictResolutionModal Integration', () => {
  let ConflictResolutionModal;
  let modal;

  beforeEach(async () => {
    // Mock DOM
    document.body.innerHTML = `
      <div id="conflict-modal" style="display: none;">
        <div id="conflict-count">0</div>
        <div id="conflict-list"></div>
        <input id="select-all-conflicts" type="checkbox">
        <span id="selected-count">0 selected</span>
        <button id="batch-local-wins">Keep Local</button>
        <button id="batch-remote-wins">Keep Remote</button>
        <button id="batch-merge">Auto Merge</button>
        <button id="preview-changes">Preview</button>
        <span id="preview-summary"></span>
        <button id="apply-resolution">Apply</button>
        <button id="cancel-resolution">Cancel</button>
        <button id="close-modal">Close</button>
      </div>
      <template id="conflict-item-template">
        <div class="conflict-item">
          <div class="conflict-header">
            <input class="conflict-select" type="checkbox">
            <h3 class="conflict-title"></h3>
            <span class="conflict-type"></span>
            <span class="conflict-severity"></span>
            <button class="expand-conflict"></button>
          </div>
          <div class="conflict-details">
            <div class="conflict-description"></div>
            <div class="local-tabs"></div>
            <div class="remote-tabs"></div>
            <div class="resolution-buttons"></div>
          </div>
        </div>
      </template>
      <template id="tab-item-template">
        <div class="tab-item">
          <img class="tab-favicon">
          <div class="tab-title"></div>
          <div class="tab-url"></div>
          <div class="tab-meta"></div>
          <input class="tab-select" type="checkbox">
        </div>
      </template>
      <template id="resolution-button-template">
        <button class="resolution-btn">
          <span class="strategy-name"></span>
          <span class="strategy-description"></span>
        </button>
      </template>
    `;

    // Import and create modal
    ConflictResolutionModal = (await import('../shared/conflict-resolution-modal.js')).default;
    modal = new ConflictResolutionModal();
  });

  it('should initialize and show conflicts correctly', () => {
    const conflicts = mockConflicts;
    const options = {
      context: { localTabs: mockLocalTabs, remoteSyncData: mockRemoteSyncData },
      deviceId: 'local-device'
    };

    modal.show(conflicts, options);

    expect(document.getElementById('conflict-count').textContent).toBe('1');
    expect(document.getElementById('conflict-modal').style.display).toBe('flex');
    expect(modal.conflicts).toEqual(conflicts);
    expect(modal.deviceId).toBe('local-device');
  });

  it('should handle resolution selection', () => {
    modal.show(mockConflicts);
    
    // Simulate resolution selection
    modal.handleResolutionSelect({
      target: {
        closest: () => ({
          dataset: { strategy: 'local_wins', conflictId: 'conflict_1' },
          parentElement: { querySelectorAll: () => [] },
          classList: { add: jest.fn() }
        })
      }
    });

    expect(modal.resolutionChoices['conflict_1']).toBe('local_wins');
  });

  it('should handle batch actions', () => {
    modal.show(mockConflicts);
    modal.selectedConflicts.add('conflict_1');
    
    // Mock DOM query
    document.querySelector = jest.fn().mockReturnValue({
      querySelectorAll: jest.fn().mockReturnValue([{
        classList: { toggle: jest.fn() },
        dataset: { strategy: 'local_wins' }
      }])
    });

    modal.handleBatchAction('local_wins');

    expect(modal.resolutionChoices['conflict_1']).toBe('local_wins');
  });

  it('should send correct message on apply', async () => {
    modal.show(mockConflicts);
    modal.resolutionChoices['conflict_1'] = 'local_wins';
    
    // Mock apply button
    const applyButton = document.getElementById('apply-resolution');
    applyButton.disabled = false;
    
    await modal.handleApply();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'conflict-resolution-complete',
      result: expect.any(Object),
      resolutionChoices: { conflict_1: 'local_wins' }
    });
  });

  it('should send cancellation message on cancel', () => {
    modal.show(mockConflicts);
    
    modal.handleCancel();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'conflict-resolution-cancelled'
    });
  });
});