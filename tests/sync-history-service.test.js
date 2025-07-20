// Unit tests for sync history service
// Tests comprehensive sync history tracking, statistics, and performance metrics

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  SyncHistoryService, 
  SyncStatus, 
  SyncOperationType,
  syncHistoryService 
} from '../shared/sync-history-service.js';

// Mock Chrome APIs
global.chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn()
    }
  },
  runtime: {
    getManifest: vi.fn(() => ({ version: '1.0.0' }))
  }
};

// Mock navigator
global.navigator = {
  userAgent: 'Mozilla/5.0 (Test Browser)'
};

// Mock console methods
global.console = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn()
};

describe('SyncHistoryService', () => {
  let historyService;

  beforeEach(async () => {
    historyService = new SyncHistoryService();
    
    // Mock storage responses
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue();
    chrome.storage.local.remove.mockResolvedValue();
    
    await historyService.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const newService = new SyncHistoryService();
      await newService.initialize();
      
      expect(newService.initialized).toBe(true);
      expect(newService.history).toEqual([]);
      expect(newService.activeOperations.size).toBe(0);
    });

    it('should load existing history from storage', async () => {
      const existingHistory = [
        {
          id: 'test_op_1',
          type: SyncOperationType.UPLOAD,
          status: SyncStatus.COMPLETED,
          startTime: Date.now() - 1000,
          endTime: Date.now(),
          duration: 1000
        }
      ];

      chrome.storage.local.get.mockResolvedValue({
        syncHistory: existingHistory,
        syncStatistics: {
          totalOperations: 1,
          successfulOperations: 1
        }
      });

      const newService = new SyncHistoryService();
      await newService.initialize();
      
      expect(newService.history).toEqual(existingHistory);
      expect(newService.statistics.totalOperations).toBe(1);
    });

    it('should clean up old history entries during initialization', async () => {
      const now = Date.now();
      const monthAgo = now - (31 * 24 * 60 * 60 * 1000); // 31 days ago
      const weekAgo = now - (7 * 24 * 60 * 60 * 1000); // 7 days ago

      const existingHistory = [
        { id: 'old_op', startTime: monthAgo },
        { id: 'recent_op', startTime: weekAgo }
      ];

      chrome.storage.local.get.mockResolvedValue({
        syncHistory: existingHistory
      });

      const newService = new SyncHistoryService();
      await newService.initialize();
      
      expect(newService.history).toHaveLength(1);
      expect(newService.history[0].id).toBe('recent_op');
    });
  });

  describe('Operation Tracking', () => {
    it('should start a new operation', async () => {
      const operationData = {
        type: SyncOperationType.BIDIRECTIONAL,
        direction: 'bidirectional',
        deviceId: 'test-device-123',
        trigger: 'manual'
      };

      const operationId = await historyService.startOperation(operationData);
      
      expect(operationId).toBeDefined();
      expect(operationId).toMatch(/^sync_\d+_[a-z0-9]+$/);
      
      const operation = historyService.getOperation(operationId);
      expect(operation).toMatchObject({
        id: operationId,
        type: SyncOperationType.BIDIRECTIONAL,
        direction: 'bidirectional',
        status: SyncStatus.PENDING,
        deviceId: 'test-device-123'
      });
      
      expect(historyService.activeOperations.has(operationId)).toBe(true);
      expect(historyService.history).toHaveLength(1);
    });

    it('should update operation status', async () => {
      const operationId = await historyService.startOperation({
        type: SyncOperationType.UPLOAD,
        deviceId: 'test-device'
      });

      await historyService.updateOperationStatus(operationId, SyncStatus.IN_PROGRESS, {
        phase: 'authentication',
        tabsProcessed: 5
      });

      const operation = historyService.getOperation(operationId);
      expect(operation.status).toBe(SyncStatus.IN_PROGRESS);
      expect(operation.tabsProcessed).toBe(5);
      expect(operation.phases).toHaveLength(1);
      expect(operation.phases[0].name).toBe('authentication');
    });

    it('should complete operation successfully', async () => {
      const operationId = await historyService.startOperation({
        type: SyncOperationType.DOWNLOAD,
        deviceId: 'test-device'
      });

      await historyService.completeOperation(operationId, {
        success: true,
        tabsProcessed: 10,
        tabsCreated: 8,
        tabsClosed: 2
      });

      const operation = historyService.getOperation(operationId);
      expect(operation.status).toBe(SyncStatus.COMPLETED);
      expect(operation.tabsProcessed).toBe(10);
      expect(operation.tabsCreated).toBe(8);
      expect(operation.tabsClosed).toBe(2);
      expect(operation.endTime).toBeDefined();
      expect(operation.duration).toBeDefined();
      
      expect(historyService.activeOperations.has(operationId)).toBe(false);
    });

    it('should complete operation with failure', async () => {
      const operationId = await historyService.startOperation({
        type: SyncOperationType.BIDIRECTIONAL,
        deviceId: 'test-device'
      });

      await historyService.completeOperation(operationId, {
        success: false,
        error: new Error('Sync failed')
      });

      const operation = historyService.getOperation(operationId);
      expect(operation.status).toBe(SyncStatus.FAILED);
      expect(operation.errors).toHaveLength(1);
      expect(operation.errors[0].message).toBe('Sync failed');
    });

    it('should cancel operation', async () => {
      const operationId = await historyService.startOperation({
        type: SyncOperationType.UPLOAD,
        deviceId: 'test-device'
      });

      await historyService.cancelOperation(operationId, 'User cancelled');

      const operation = historyService.getOperation(operationId);
      expect(operation.status).toBe(SyncStatus.CANCELLED);
      expect(operation.warnings).toHaveLength(1);
      expect(operation.warnings[0].message).toContain('User cancelled');
    });

    it('should record conflict detection', async () => {
      const operationId = await historyService.startOperation({
        type: SyncOperationType.BIDIRECTIONAL,
        deviceId: 'test-device'
      });

      const conflicts = [
        { id: 'conflict1', type: 'timestamp', severity: 2 },
        { id: 'conflict2', type: 'tab_metadata', severity: 1 }
      ];

      await historyService.recordConflictDetection(operationId, conflicts);

      const operation = historyService.getOperation(operationId);
      expect(operation.status).toBe(SyncStatus.CONFLICT_DETECTED);
      expect(operation.conflictsDetected).toBe(2);
      expect(operation.metadata.conflicts).toHaveLength(2);
    });

    it('should record conflict resolution', async () => {
      const operationId = await historyService.startOperation({
        type: SyncOperationType.BIDIRECTIONAL,
        deviceId: 'test-device'
      });

      const resolutions = [
        { conflictId: 'conflict1', strategy: 'local_wins', choice: 'keep_local' },
        { conflictId: 'conflict2', strategy: 'manual', choice: 'merge' }
      ];

      await historyService.recordConflictResolution(operationId, resolutions);

      const operation = historyService.getOperation(operationId);
      expect(operation.status).toBe(SyncStatus.CONFLICT_RESOLVED);
      expect(operation.conflictsResolved).toBe(2);
      expect(operation.metadata.resolutions).toHaveLength(2);
    });

    it('should handle operation not found error', async () => {
      await expect(
        historyService.updateOperationStatus('non-existent-id', SyncStatus.COMPLETED)
      ).rejects.toThrow('Operation not found');
    });
  });

  describe('History Querying', () => {
    beforeEach(async () => {
      // Add test operations
      const operations = [
        {
          id: 'op1',
          type: SyncOperationType.UPLOAD,
          status: SyncStatus.COMPLETED,
          deviceId: 'device1',
          startTime: Date.now() - 3000,
          endTime: Date.now() - 2000,
          duration: 1000
        },
        {
          id: 'op2',
          type: SyncOperationType.DOWNLOAD,
          status: SyncStatus.FAILED,
          deviceId: 'device2',
          startTime: Date.now() - 2000,
          endTime: Date.now() - 1000,
          duration: 1000
        },
        {
          id: 'op3',
          type: SyncOperationType.BIDIRECTIONAL,
          status: SyncStatus.COMPLETED,
          deviceId: 'device1',
          startTime: Date.now() - 1000,
          endTime: Date.now(),
          duration: 1000
        }
      ];

      historyService.history = operations;
    });

    it('should get all history', () => {
      const result = historyService.getHistory();
      
      expect(result.operations).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by status', () => {
      const result = historyService.getHistory({ status: SyncStatus.COMPLETED });
      
      expect(result.operations).toHaveLength(2);
      expect(result.operations.every(op => op.status === SyncStatus.COMPLETED)).toBe(true);
    });

    it('should filter by type', () => {
      const result = historyService.getHistory({ type: SyncOperationType.UPLOAD });
      
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].type).toBe(SyncOperationType.UPLOAD);
    });

    it('should filter by device ID', () => {
      const result = historyService.getHistory({ deviceId: 'device1' });
      
      expect(result.operations).toHaveLength(2);
      expect(result.operations.every(op => op.deviceId === 'device1')).toBe(true);
    });

    it('should filter by time range', () => {
      const since = Date.now() - 2500;
      const until = Date.now() - 500;
      
      const result = historyService.getHistory({ since, until });
      
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].id).toBe('op2');
    });

    it('should apply pagination', () => {
      const result = historyService.getHistory({ limit: 2, offset: 1 });
      
      expect(result.operations).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(false);
      expect(result.limit).toBe(2);
      expect(result.offset).toBe(1);
    });

    it('should sort by start time (newest first)', () => {
      const result = historyService.getHistory();
      
      expect(result.operations[0].id).toBe('op3'); // Most recent
      expect(result.operations[1].id).toBe('op2');
      expect(result.operations[2].id).toBe('op1'); // Oldest
    });

    it('should include active operations when requested', async () => {
      const activeOpId = await historyService.startOperation({
        type: SyncOperationType.UPLOAD,
        deviceId: 'device1'
      });

      const result = historyService.getHistory({ includeActive: true });
      
      expect(result.operations).toHaveLength(4);
      expect(result.operations.some(op => op.id === activeOpId)).toBe(true);
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      // Reset statistics
      historyService.statistics = {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        conflictsDetected: 0,
        conflictsResolved: 0,
        totalSyncTime: 0,
        averageSyncTime: 0,
        lastSyncTime: null,
        firstSyncTime: null
      };
    });

    it('should update statistics on operation completion', async () => {
      const operationId = await historyService.startOperation({
        type: SyncOperationType.UPLOAD,
        deviceId: 'test-device'
      });

      await historyService.updateOperationStatus(operationId, SyncStatus.IN_PROGRESS, {
        actualStartTime: Date.now() - 1000
      });

      await historyService.completeOperation(operationId, {
        success: true,
        conflictsDetected: 2,
        conflictsResolved: 2
      });

      const stats = historyService.getStatistics();
      expect(stats.totalOperations).toBe(1);
      expect(stats.successfulOperations).toBe(1);
      expect(stats.failedOperations).toBe(0);
      expect(stats.conflictsDetected).toBe(2);
      expect(stats.conflictsResolved).toBe(2);
      expect(stats.lastSyncTime).toBeDefined();
      expect(stats.averageSyncTime).toBeGreaterThan(0);
    });

    it('should calculate success rates correctly', async () => {
      // Add some test history
      const now = Date.now();
      historyService.history = [
        { status: SyncStatus.COMPLETED, startTime: now - 1000 },
        { status: SyncStatus.FAILED, startTime: now - 2000 },
        { status: SyncStatus.COMPLETED, startTime: now - 3000 }
      ];

      historyService.statistics.totalOperations = 3;
      historyService.statistics.successfulOperations = 2;

      const stats = historyService.getStatistics();
      expect(stats.successRates.overall).toBe(66.66666666666666);
      expect(stats.recentOperations.daily).toBe(3);
    });

    it('should provide recent operation counts', async () => {
      const now = Date.now();
      const dayAgo = now - (24 * 60 * 60 * 1000);
      const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
      const monthAgo = now - (30 * 24 * 60 * 60 * 1000);

      historyService.history = [
        { startTime: now - 1000 }, // Recent
        { startTime: dayAgo + 1000 }, // Within day
        { startTime: weekAgo + 1000 }, // Within week
        { startTime: monthAgo + 1000 } // Within month
      ];

      const stats = historyService.getStatistics();
      expect(stats.recentOperations.daily).toBe(2);
      expect(stats.recentOperations.weekly).toBe(3);
      expect(stats.recentOperations.monthly).toBe(4);
    });
  });

  describe('Performance Metrics', () => {
    beforeEach(() => {
      const now = Date.now();
      historyService.history = [
        {
          status: SyncStatus.COMPLETED,
          startTime: now - 5000,
          duration: 1000,
          performance: {
            authTime: 100,
            storageTime: 200,
            conflictDetectionTime: 50,
            tabOperationTime: 300
          }
        },
        {
          status: SyncStatus.COMPLETED,
          startTime: now - 4000,
          duration: 2000,
          performance: {
            authTime: 150,
            storageTime: 300,
            conflictDetectionTime: 100,
            tabOperationTime: 400
          }
        },
        {
          status: SyncStatus.FAILED,
          startTime: now - 3000,
          duration: 500
        }
      ];
    });

    it('should calculate performance metrics correctly', () => {
      const metrics = historyService.getPerformanceMetrics();
      
      expect(metrics.operationCount).toBe(2); // Only completed operations
      expect(metrics.averageDuration).toBe(1500);
      expect(metrics.medianDuration).toBe(1000);
      expect(metrics.minDuration).toBe(1000);
      expect(metrics.maxDuration).toBe(2000);
      expect(metrics.errorRate).toBe(33.33333333333333); // 1 failed out of 3 total
    });

    it('should calculate phase breakdown correctly', () => {
      const metrics = historyService.getPerformanceMetrics();
      
      expect(metrics.phaseBreakdown.auth).toEqual({
        average: 125,
        min: 100,
        max: 150
      });
      
      expect(metrics.phaseBreakdown.storage).toEqual({
        average: 250,
        min: 200,
        max: 300
      });
    });

    it('should handle empty performance data', () => {
      historyService.history = [];
      
      const metrics = historyService.getPerformanceMetrics();
      
      expect(metrics.operationCount).toBe(0);
      expect(metrics.averageDuration).toBe(0);
      expect(metrics.errorRate).toBe(0);
      expect(metrics.phaseBreakdown).toEqual({});
    });

    it('should filter by time range', () => {
      const since = Date.now() - 3500;
      const metrics = historyService.getPerformanceMetrics({ since });
      
      expect(metrics.operationCount).toBe(1); // Only one operation since the specified time
    });
  });

  describe('History Management', () => {
    beforeEach(() => {
      const now = Date.now();
      historyService.history = [
        { id: 'op1', startTime: now - 5000, status: SyncStatus.COMPLETED },
        { id: 'op2', startTime: now - 4000, status: SyncStatus.FAILED },
        { id: 'op3', startTime: now - 3000, status: SyncStatus.COMPLETED }
      ];
    });

    it('should clear history by age', async () => {
      const olderThan = Date.now() - 3500;
      
      await historyService.clearHistory({ olderThan });
      
      expect(historyService.history).toHaveLength(1);
      expect(historyService.history[0].id).toBe('op3');
    });

    it('should clear history by status', async () => {
      await historyService.clearHistory({ status: SyncStatus.FAILED });
      
      expect(historyService.history).toHaveLength(2);
      expect(historyService.history.every(op => op.status !== SyncStatus.FAILED)).toBe(true);
    });

    it('should clear all history', async () => {
      await historyService.clearHistory();
      
      expect(historyService.history).toHaveLength(0);
    });

    it('should preserve statistics when clearing history', async () => {
      historyService.statistics.totalOperations = 10;
      
      await historyService.clearHistory({ keepStatistics: true });
      
      expect(historyService.statistics.totalOperations).toBe(10);
    });

    it('should reset statistics when requested', async () => {
      historyService.statistics.totalOperations = 10;
      
      await historyService.clearHistory({ keepStatistics: false });
      
      expect(historyService.statistics.totalOperations).toBe(0);
    });
  });

  describe('Export Functionality', () => {
    beforeEach(() => {
      const now = Date.now();
      historyService.history = [
        {
          id: 'op1',
          type: SyncOperationType.UPLOAD,
          direction: 'upload',
          status: SyncStatus.COMPLETED,
          startTime: now - 2000,
          endTime: now - 1000,
          duration: 1000,
          tabsProcessed: 5,
          tabsCreated: 3,
          tabsClosed: 1,
          conflictsDetected: 0,
          errors: [],
          deviceId: 'device1'
        }
      ];

      historyService.statistics = {
        totalOperations: 1,
        successfulOperations: 1,
        failedOperations: 0
      };
    });

    it('should export history in JSON format', () => {
      const exported = historyService.exportHistory();
      
      expect(exported.exportTime).toBeDefined();
      expect(exported.exportVersion).toBe('1.0');
      expect(exported.operations).toHaveLength(1);
      expect(exported.operations[0].id).toBe('op1');
    });

    it('should include statistics in export', () => {
      const exported = historyService.exportHistory({ includeStatistics: true });
      
      expect(exported.statistics).toBeDefined();
      expect(exported.statistics.totalOperations).toBe(1);
      expect(exported.performanceMetrics).toBeDefined();
    });

    it('should exclude statistics from export', () => {
      const exported = historyService.exportHistory({ includeStatistics: false });
      
      expect(exported.statistics).toBeUndefined();
      expect(exported.performanceMetrics).toBeUndefined();
    });

    it('should filter export by time range', () => {
      const since = Date.now() - 1500;
      const exported = historyService.exportHistory({ since });
      
      expect(exported.operations).toHaveLength(0); // Operation started before 'since'
    });

    it('should export in CSV format', () => {
      const exported = historyService.exportHistory({ format: 'csv' });
      
      expect(typeof exported).toBe('string');
      expect(exported).toContain('ID,Type,Direction,Status');
      expect(exported).toContain('op1,upload,upload,completed');
    });
  });

  describe('Status Callbacks', () => {
    it('should register and call status callbacks', async () => {
      const callback = vi.fn();
      const unregister = historyService.registerStatusCallback(callback);
      
      const operationId = await historyService.startOperation({
        type: SyncOperationType.UPLOAD,
        deviceId: 'test-device'
      });
      
      expect(callback).toHaveBeenCalledWith({
        type: 'operation_started',
        operationId,
        operation: expect.objectContaining({ id: operationId })
      });
      
      await historyService.updateOperationStatus(operationId, SyncStatus.IN_PROGRESS);
      
      expect(callback).toHaveBeenCalledWith({
        type: 'operation_updated',
        operationId,
        operation: expect.objectContaining({ status: SyncStatus.IN_PROGRESS }),
        previousStatus: SyncStatus.PENDING,
        currentStatus: SyncStatus.IN_PROGRESS
      });
      
      // Test unregister
      unregister();
      callback.mockClear();
      
      await historyService.completeOperation(operationId, { success: true });
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', async () => {
      const failingCallback = vi.fn(() => {
        throw new Error('Callback failed');
      });
      
      historyService.registerStatusCallback(failingCallback);
      
      // Should not throw despite callback failure
      await expect(
        historyService.startOperation({
          type: SyncOperationType.UPLOAD,
          deviceId: 'test-device'
        })
      ).resolves.toBeDefined();
    });
  });

  describe('Current Status', () => {
    it('should provide current status summary', async () => {
      // Add some history
      historyService.history = [
        {
          id: 'recent_op',
          status: SyncStatus.COMPLETED,
          startTime: Date.now() - 1000,
          duration: 500
        }
      ];

      // Add active operation
      const activeOpId = await historyService.startOperation({
        type: SyncOperationType.BIDIRECTIONAL,
        deviceId: 'test-device'
      });

      const status = historyService.getCurrentStatus();
      
      expect(status.isActive).toBe(true);
      expect(status.activeOperations).toHaveLength(1);
      expect(status.activeOperations[0].id).toBe(activeOpId);
      expect(status.recentOperations).toHaveLength(1);
      expect(status.statistics).toBeDefined();
      expect(status.lastSyncFormatted).toBeDefined();
    });

    it('should handle no active operations', () => {
      const status = historyService.getCurrentStatus();
      
      expect(status.isActive).toBe(false);
      expect(status.activeOperations).toHaveLength(0);
    });
  });

  describe('Storage Integration', () => {
    it('should save history to storage', async () => {
      await historyService.startOperation({
        type: SyncOperationType.UPLOAD,
        deviceId: 'test-device'
      });

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        syncHistory: expect.arrayContaining([
          expect.objectContaining({
            type: SyncOperationType.UPLOAD,
            deviceId: 'test-device'
          })
        ])
      });
    });

    it('should save statistics to storage', async () => {
      const operationId = await historyService.startOperation({
        type: SyncOperationType.UPLOAD,
        deviceId: 'test-device'
      });

      await historyService.completeOperation(operationId, { success: true });

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        syncStatistics: expect.objectContaining({
          totalOperations: 1,
          successfulOperations: 1
        })
      });
    });

    it('should trim history when it exceeds max size', async () => {
      historyService.maxHistorySize = 2;
      
      // Add operations that exceed max size
      await historyService.startOperation({ type: SyncOperationType.UPLOAD, deviceId: 'device1' });
      await historyService.startOperation({ type: SyncOperationType.DOWNLOAD, deviceId: 'device2' });
      await historyService.startOperation({ type: SyncOperationType.BIDIRECTIONAL, deviceId: 'device3' });

      expect(historyService.history).toHaveLength(2);
    });
  });
});

describe('Singleton Instance', () => {
  it('should provide singleton instance', () => {
    expect(syncHistoryService).toBeInstanceOf(SyncHistoryService);
  });

  it('should maintain state across imports', async () => {
    // This test ensures the singleton pattern works correctly
    const { syncHistoryService: importedService } = await import('../shared/sync-history-service.js');
    expect(importedService).toBe(syncHistoryService);
  });
});