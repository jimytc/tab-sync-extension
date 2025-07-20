// Comprehensive sync history and status tracking service
// Provides detailed logging, statistics, and performance tracking for sync operations

import { log, createError, formatTimestamp } from './utils.js';
import { errorHandler, ErrorCategory, ErrorSeverity, withErrorHandling } from './error-handler.js';

/**
 * Sync operation status types
 */
export const SyncStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  CONFLICT_DETECTED: 'conflict_detected',
  CONFLICT_RESOLVED: 'conflict_resolved'
};

/**
 * Sync operation types
 */
export const SyncOperationType = {
  UPLOAD: 'upload',
  DOWNLOAD: 'download',
  BIDIRECTIONAL: 'bidirectional',
  CONFLICT_RESOLUTION: 'conflict_resolution',
  MANUAL: 'manual',
  AUTOMATIC: 'automatic',
  SCHEDULED: 'scheduled'
};

/**
 * Comprehensive sync history service
 */
export class SyncHistoryService {
  constructor() {
    this.history = [];
    this.activeOperations = new Map();
    this.statistics = {
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
    this.maxHistorySize = 200;
    this.initialized = false;
    this.statusCallbacks = new Set();
  }

  /**
   * Initialize the sync history service
   * @returns {Promise<void>}
   */
  async initialize() {
    return withErrorHandling(async () => {
      await this.loadHistory();
      await this.loadStatistics();
      this.initialized = true;
      log('info', 'Sync history service initialized', { 
        historyCount: this.history.length,
        totalOperations: this.statistics.totalOperations
      });
    }, {
      category: ErrorCategory.SYNC,
      severity: ErrorSeverity.HIGH,
      source: 'sync_history_initialize',
      recoverable: true
    })();
  }

  /**
   * Start tracking a sync operation
   * @param {Object} operationData - Initial operation data
   * @returns {Promise<string>} Operation ID
   */
  async startOperation(operationData) {
    return withErrorHandling(async () => {
      const operationId = this.generateOperationId();
      const operation = {
        id: operationId,
        type: operationData.type || SyncOperationType.MANUAL,
        direction: operationData.direction || 'bidirectional',
        status: SyncStatus.PENDING,
        deviceId: operationData.deviceId,
        startTime: Date.now(),
        endTime: null,
        duration: null,
        tabsProcessed: 0,
        tabsCreated: 0,
        tabsClosed: 0,
        tabsModified: 0,
        conflictsDetected: 0,
        conflictsResolved: 0,
        errors: [],
        warnings: [],
        metadata: {
          userAgent: navigator.userAgent,
          extensionVersion: chrome.runtime.getManifest().version,
          trigger: operationData.trigger || 'manual',
          ...operationData.metadata
        },
        phases: [],
        performance: {
          authTime: null,
          storageTime: null,
          conflictDetectionTime: null,
          conflictResolutionTime: null,
          tabOperationTime: null
        }
      };

      this.activeOperations.set(operationId, operation);
      
      // Add to history immediately as pending
      this.history.push(operation);
      await this.saveHistory();
      
      // Notify status callbacks
      this.notifyStatusCallbacks({
        type: 'operation_started',
        operationId,
        operation
      });

      log('info', 'Sync operation started', { 
        operationId, 
        type: operation.type,
        direction: operation.direction
      });

      return operationId;
    }, {
      category: ErrorCategory.SYNC,
      severity: ErrorSeverity.MEDIUM,
      source: 'sync_history_start_operation',
      context: { operationData },
      recoverable: true
    })();
  }

  /**
   * Update operation status
   * @param {string} operationId - Operation ID
   * @param {string} status - New status
   * @param {Object} updateData - Additional update data
   * @returns {Promise<void>}
   */
  async updateOperationStatus(operationId, status, updateData = {}) {
    return withErrorHandling(async () => {
      const operation = this.activeOperations.get(operationId);
      if (!operation) {
        throw createError(`Operation not found: ${operationId}`, 'OPERATION_NOT_FOUND');
      }

      const previousStatus = operation.status;
      operation.status = status;
      operation.lastUpdated = Date.now();

      // Update specific fields based on update data
      if (updateData.tabsProcessed !== undefined) {
        operation.tabsProcessed = updateData.tabsProcessed;
      }
      if (updateData.tabsCreated !== undefined) {
        operation.tabsCreated = updateData.tabsCreated;
      }
      if (updateData.tabsClosed !== undefined) {
        operation.tabsClosed = updateData.tabsClosed;
      }
      if (updateData.tabsModified !== undefined) {
        operation.tabsModified = updateData.tabsModified;
      }
      if (updateData.conflictsDetected !== undefined) {
        operation.conflictsDetected = updateData.conflictsDetected;
      }
      if (updateData.conflictsResolved !== undefined) {
        operation.conflictsResolved = updateData.conflictsResolved;
      }
      if (updateData.error) {
        operation.errors.push({
          message: updateData.error.message || updateData.error,
          timestamp: Date.now(),
          phase: updateData.phase || 'unknown'
        });
      }
      if (updateData.warning) {
        operation.warnings.push({
          message: updateData.warning.message || updateData.warning,
          timestamp: Date.now(),
          phase: updateData.phase || 'unknown'
        });
      }

      // Add phase information
      if (updateData.phase) {
        operation.phases.push({
          name: updateData.phase,
          status: status,
          timestamp: Date.now(),
          duration: updateData.phaseDuration || null
        });
      }

      // Update performance metrics
      if (updateData.performance) {
        Object.assign(operation.performance, updateData.performance);
      }

      // Handle status-specific updates
      if (status === SyncStatus.IN_PROGRESS && previousStatus === SyncStatus.PENDING) {
        operation.actualStartTime = Date.now();
      }

      if ([SyncStatus.COMPLETED, SyncStatus.FAILED, SyncStatus.CANCELLED].includes(status)) {
        operation.endTime = Date.now();
        operation.duration = operation.endTime - (operation.actualStartTime || operation.startTime);
        
        // Update statistics
        await this.updateStatistics(operation);
        
        // Remove from active operations
        this.activeOperations.delete(operationId);
      }

      // Save updated history
      await this.saveHistory();

      // Notify status callbacks
      this.notifyStatusCallbacks({
        type: 'operation_updated',
        operationId,
        operation,
        previousStatus,
        currentStatus: status
      });

      log('info', 'Sync operation status updated', { 
        operationId, 
        previousStatus,
        currentStatus: status,
        duration: operation.duration
      });
    }, {
      category: ErrorCategory.SYNC,
      severity: ErrorSeverity.LOW,
      source: 'sync_history_update_status',
      context: { operationId, status, updateData },
      recoverable: true
    })();
  }

  /**
   * Complete a sync operation
   * @param {string} operationId - Operation ID
   * @param {Object} completionData - Completion data
   * @returns {Promise<void>}
   */
  async completeOperation(operationId, completionData = {}) {
    return withErrorHandling(async () => {
      const finalStatus = completionData.success !== false ? 
        SyncStatus.COMPLETED : SyncStatus.FAILED;

      await this.updateOperationStatus(operationId, finalStatus, {
        ...completionData,
        phase: 'completion'
      });

      log('info', 'Sync operation completed', { 
        operationId, 
        status: finalStatus,
        success: completionData.success !== false
      });
    }, {
      category: ErrorCategory.SYNC,
      severity: ErrorSeverity.LOW,
      source: 'sync_history_complete_operation',
      context: { operationId, completionData },
      recoverable: true
    })();
  }

  /**
   * Cancel a sync operation
   * @param {string} operationId - Operation ID
   * @param {string} reason - Cancellation reason
   * @returns {Promise<void>}
   */
  async cancelOperation(operationId, reason = 'User cancelled') {
    return withErrorHandling(async () => {
      await this.updateOperationStatus(operationId, SyncStatus.CANCELLED, {
        warning: `Operation cancelled: ${reason}`,
        phase: 'cancellation'
      });

      log('info', 'Sync operation cancelled', { operationId, reason });
    }, {
      category: ErrorCategory.SYNC,
      severity: ErrorSeverity.LOW,
      source: 'sync_history_cancel_operation',
      context: { operationId, reason },
      recoverable: true
    })();
  }

  /**
   * Record conflict detection
   * @param {string} operationId - Operation ID
   * @param {Array} conflicts - Detected conflicts
   * @returns {Promise<void>}
   */
  async recordConflictDetection(operationId, conflicts) {
    return withErrorHandling(async () => {
      await this.updateOperationStatus(operationId, SyncStatus.CONFLICT_DETECTED, {
        conflictsDetected: conflicts.length,
        phase: 'conflict_detection',
        metadata: {
          conflicts: conflicts.map(conflict => ({
            id: conflict.id,
            type: conflict.type,
            severity: conflict.severity,
            description: conflict.description
          }))
        }
      });

      log('info', 'Conflicts detected in sync operation', { 
        operationId, 
        conflictCount: conflicts.length 
      });
    }, {
      category: ErrorCategory.SYNC,
      severity: ErrorSeverity.MEDIUM,
      source: 'sync_history_record_conflicts',
      context: { operationId, conflictCount: conflicts.length },
      recoverable: true
    })();
  }

  /**
   * Record conflict resolution
   * @param {string} operationId - Operation ID
   * @param {Array} resolutions - Conflict resolutions
   * @returns {Promise<void>}
   */
  async recordConflictResolution(operationId, resolutions) {
    return withErrorHandling(async () => {
      await this.updateOperationStatus(operationId, SyncStatus.CONFLICT_RESOLVED, {
        conflictsResolved: resolutions.length,
        phase: 'conflict_resolution',
        metadata: {
          resolutions: resolutions.map(resolution => ({
            conflictId: resolution.conflictId,
            strategy: resolution.strategy,
            choice: resolution.choice,
            timestamp: resolution.timestamp
          }))
        }
      });

      log('info', 'Conflicts resolved in sync operation', { 
        operationId, 
        resolutionCount: resolutions.length 
      });
    }, {
      category: ErrorCategory.SYNC,
      severity: ErrorSeverity.MEDIUM,
      source: 'sync_history_record_resolutions',
      context: { operationId, resolutionCount: resolutions.length },
      recoverable: true
    })();
  }

  /**
   * Get operation by ID
   * @param {string} operationId - Operation ID
   * @returns {Object|null} Operation data or null
   */
  getOperation(operationId) {
    // Check active operations first
    const activeOperation = this.activeOperations.get(operationId);
    if (activeOperation) {
      return { ...activeOperation };
    }

    // Check history
    const historicalOperation = this.history.find(op => op.id === operationId);
    return historicalOperation ? { ...historicalOperation } : null;
  }

  /**
   * Get sync history with filtering and pagination
   * @param {Object} options - Query options
   * @returns {Object} History results
   */
  getHistory(options = {}) {
    const {
      limit = 50,
      offset = 0,
      status = null,
      type = null,
      deviceId = null,
      since = null,
      until = null,
      includeActive = true
    } = options;

    let filtered = [...this.history];

    // Include active operations if requested
    if (includeActive) {
      filtered = [...filtered, ...Array.from(this.activeOperations.values())];
    }

    // Apply filters
    if (status) {
      filtered = filtered.filter(op => op.status === status);
    }
    if (type) {
      filtered = filtered.filter(op => op.type === type);
    }
    if (deviceId) {
      filtered = filtered.filter(op => op.deviceId === deviceId);
    }
    if (since) {
      filtered = filtered.filter(op => op.startTime >= since);
    }
    if (until) {
      filtered = filtered.filter(op => op.startTime <= until);
    }

    // Sort by start time (newest first)
    filtered.sort((a, b) => b.startTime - a.startTime);

    // Apply pagination
    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      operations: paginated,
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };
  }

  /**
   * Get current sync statistics
   * @returns {Object} Sync statistics
   */
  getStatistics() {
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const monthAgo = now - (30 * 24 * 60 * 60 * 1000);

    const recentOperations = this.history.filter(op => op.startTime > dayAgo);
    const weeklyOperations = this.history.filter(op => op.startTime > weekAgo);
    const monthlyOperations = this.history.filter(op => op.startTime > monthAgo);

    const activeCount = this.activeOperations.size;
    const recentSuccessRate = recentOperations.length > 0 ? 
      (recentOperations.filter(op => op.status === SyncStatus.COMPLETED).length / recentOperations.length) * 100 : 0;

    return {
      ...this.statistics,
      activeOperations: activeCount,
      recentOperations: {
        daily: recentOperations.length,
        weekly: weeklyOperations.length,
        monthly: monthlyOperations.length
      },
      successRates: {
        overall: this.statistics.totalOperations > 0 ? 
          (this.statistics.successfulOperations / this.statistics.totalOperations) * 100 : 0,
        recent: recentSuccessRate
      },
      averageOperationTime: {
        overall: this.statistics.averageSyncTime,
        recent: recentOperations.length > 0 ? 
          recentOperations.reduce((sum, op) => sum + (op.duration || 0), 0) / recentOperations.length : 0
      }
    };
  }

  /**
   * Get performance metrics
   * @param {Object} options - Query options
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics(options = {}) {
    const { since = Date.now() - (7 * 24 * 60 * 60 * 1000) } = options;
    
    const recentOperations = this.history.filter(op => 
      op.startTime >= since && op.status === SyncStatus.COMPLETED
    );

    if (recentOperations.length === 0) {
      return {
        operationCount: 0,
        averageDuration: 0,
        medianDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        phaseBreakdown: {},
        errorRate: 0
      };
    }

    const durations = recentOperations
      .map(op => op.duration)
      .filter(d => d !== null)
      .sort((a, b) => a - b);

    const phaseBreakdown = {};
    const phaseNames = ['auth', 'storage', 'conflictDetection', 'conflictResolution', 'tabOperation'];
    
    for (const phaseName of phaseNames) {
      const phaseTimes = recentOperations
        .map(op => op.performance[`${phaseName}Time`])
        .filter(t => t !== null);
      
      if (phaseTimes.length > 0) {
        phaseBreakdown[phaseName] = {
          average: phaseTimes.reduce((sum, t) => sum + t, 0) / phaseTimes.length,
          min: Math.min(...phaseTimes),
          max: Math.max(...phaseTimes)
        };
      }
    }

    const totalOperationsInPeriod = this.history.filter(op => op.startTime >= since).length;
    const errorRate = totalOperationsInPeriod > 0 ? 
      (totalOperationsInPeriod - recentOperations.length) / totalOperationsInPeriod * 100 : 0;

    return {
      operationCount: recentOperations.length,
      averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      medianDuration: durations[Math.floor(durations.length / 2)] || 0,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      phaseBreakdown,
      errorRate
    };
  }

  /**
   * Clear sync history
   * @param {Object} options - Clear options
   * @returns {Promise<void>}
   */
  async clearHistory(options = {}) {
    return withErrorHandling(async () => {
      const { 
        olderThan = null, 
        status = null, 
        keepStatistics = true 
      } = options;

      let toRemove = [];

      if (olderThan) {
        toRemove = this.history.filter(op => op.startTime < olderThan);
        this.history = this.history.filter(op => op.startTime >= olderThan);
      } else if (status) {
        toRemove = this.history.filter(op => op.status === status);
        this.history = this.history.filter(op => op.status !== status);
      } else {
        toRemove = [...this.history];
        this.history = [];
      }

      if (!keepStatistics) {
        this.statistics = {
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
      }

      await this.saveHistory();
      await this.saveStatistics();

      log('info', 'Sync history cleared', { 
        removedCount: toRemove.length,
        remainingCount: this.history.length,
        keepStatistics
      });
    }, {
      category: ErrorCategory.SYNC,
      severity: ErrorSeverity.LOW,
      source: 'sync_history_clear',
      context: { options },
      recoverable: true
    })();
  }

  /**
   * Export sync history
   * @param {Object} options - Export options
   * @returns {Object} Exported data
   */
  exportHistory(options = {}) {
    const { 
      format = 'json',
      includeStatistics = true,
      includeActive = false,
      since = null,
      until = null
    } = options;

    let exportData = {
      exportTime: Date.now(),
      exportVersion: '1.0',
      deviceId: null, // Will be filled by caller
      operations: [...this.history]
    };

    // Include active operations if requested
    if (includeActive) {
      exportData.operations.push(...Array.from(this.activeOperations.values()));
    }

    // Apply time filters
    if (since) {
      exportData.operations = exportData.operations.filter(op => op.startTime >= since);
    }
    if (until) {
      exportData.operations = exportData.operations.filter(op => op.startTime <= until);
    }

    // Include statistics if requested
    if (includeStatistics) {
      exportData.statistics = this.getStatistics();
      exportData.performanceMetrics = this.getPerformanceMetrics();
    }

    // Sort operations by start time
    exportData.operations.sort((a, b) => b.startTime - a.startTime);

    if (format === 'csv') {
      return this.convertToCSV(exportData);
    }

    return exportData;
  }

  /**
   * Register status callback
   * @param {Function} callback - Status callback function
   * @returns {Function} Unregister function
   */
  registerStatusCallback(callback) {
    this.statusCallbacks.add(callback);
    return () => this.statusCallbacks.delete(callback);
  }

  /**
   * Generate unique operation ID
   * @returns {string} Operation ID
   */
  generateOperationId() {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  /**
   * Update statistics based on completed operation
   * @param {Object} operation - Completed operation
   * @returns {Promise<void>}
   */
  async updateStatistics(operation) {
    try {
      this.statistics.totalOperations++;
      
      if (operation.status === SyncStatus.COMPLETED) {
        this.statistics.successfulOperations++;
      } else if (operation.status === SyncStatus.FAILED) {
        this.statistics.failedOperations++;
      }

      if (operation.conflictsDetected > 0) {
        this.statistics.conflictsDetected += operation.conflictsDetected;
      }
      if (operation.conflictsResolved > 0) {
        this.statistics.conflictsResolved += operation.conflictsResolved;
      }

      if (operation.duration) {
        this.statistics.totalSyncTime += operation.duration;
        this.statistics.averageSyncTime = 
          this.statistics.totalSyncTime / this.statistics.totalOperations;
      }

      this.statistics.lastSyncTime = operation.endTime;
      
      if (!this.statistics.firstSyncTime) {
        this.statistics.firstSyncTime = operation.startTime;
      }

      await this.saveStatistics();
    } catch (error) {
      log('error', 'Failed to update sync statistics', { error: error.message });
    }
  }

  /**
   * Notify status callbacks
   * @param {Object} statusData - Status update data
   */
  notifyStatusCallbacks(statusData) {
    for (const callback of this.statusCallbacks) {
      try {
        callback(statusData);
      } catch (error) {
        log('error', 'Status callback failed', { error: error.message });
      }
    }
  }

  /**
   * Load history from storage
   * @returns {Promise<void>}
   */
  async loadHistory() {
    try {
      const result = await chrome.storage.local.get(['syncHistory']);
      if (result.syncHistory && Array.isArray(result.syncHistory)) {
        this.history = result.syncHistory;
        
        // Clean up old entries
        const monthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        this.history = this.history.filter(op => op.startTime > monthAgo);
      }
      
      log('info', 'Sync history loaded', { count: this.history.length });
    } catch (error) {
      log('error', 'Failed to load sync history', { error: error.message });
      this.history = [];
    }
  }

  /**
   * Save history to storage
   * @returns {Promise<void>}
   */
  async saveHistory() {
    try {
      // Trim history if too large
      if (this.history.length > this.maxHistorySize) {
        this.history = this.history.slice(-this.maxHistorySize);
      }

      await chrome.storage.local.set({ syncHistory: this.history });
    } catch (error) {
      log('error', 'Failed to save sync history', { error: error.message });
    }
  }

  /**
   * Load statistics from storage
   * @returns {Promise<void>}
   */
  async loadStatistics() {
    try {
      const result = await chrome.storage.local.get(['syncStatistics']);
      if (result.syncStatistics) {
        this.statistics = { ...this.statistics, ...result.syncStatistics };
      }
      
      log('info', 'Sync statistics loaded', this.statistics);
    } catch (error) {
      log('error', 'Failed to load sync statistics', { error: error.message });
    }
  }

  /**
   * Save statistics to storage
   * @returns {Promise<void>}
   */
  async saveStatistics() {
    try {
      await chrome.storage.local.set({ syncStatistics: this.statistics });
    } catch (error) {
      log('error', 'Failed to save sync statistics', { error: error.message });
    }
  }

  /**
   * Convert export data to CSV format
   * @param {Object} exportData - Data to convert
   * @returns {string} CSV string
   */
  convertToCSV(exportData) {
    const headers = [
      'ID', 'Type', 'Direction', 'Status', 'Start Time', 'End Time', 'Duration',
      'Tabs Processed', 'Tabs Created', 'Tabs Closed', 'Tabs Modified',
      'Conflicts Detected', 'Conflicts Resolved', 'Errors', 'Device ID'
    ];

    const rows = exportData.operations.map(op => [
      op.id,
      op.type,
      op.direction,
      op.status,
      new Date(op.startTime).toISOString(),
      op.endTime ? new Date(op.endTime).toISOString() : '',
      op.duration || '',
      op.tabsProcessed || 0,
      op.tabsCreated || 0,
      op.tabsClosed || 0,
      op.tabsModified || 0,
      op.conflictsDetected || 0,
      op.conflictsResolved || 0,
      op.errors.length,
      op.deviceId || ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    return csvContent;
  }

  /**
   * Get current sync status summary
   * @returns {Object} Status summary
   */
  getCurrentStatus() {
    const activeOps = Array.from(this.activeOperations.values());
    const recentOps = this.history
      .filter(op => op.startTime > Date.now() - (60 * 60 * 1000)) // Last hour
      .slice(0, 10);

    return {
      isActive: activeOps.length > 0,
      activeOperations: activeOps.map(op => ({
        id: op.id,
        type: op.type,
        status: op.status,
        startTime: op.startTime,
        duration: Date.now() - op.startTime
      })),
      recentOperations: recentOps.map(op => ({
        id: op.id,
        type: op.type,
        status: op.status,
        startTime: op.startTime,
        duration: op.duration,
        success: op.status === SyncStatus.COMPLETED
      })),
      statistics: this.getStatistics(),
      lastSyncTime: this.statistics.lastSyncTime,
      lastSyncFormatted: this.statistics.lastSyncTime ? 
        formatTimestamp(this.statistics.lastSyncTime) : 'Never'
    };
  }
}

// Create singleton instance
export const syncHistoryService = new SyncHistoryService();