// Performance optimization utilities for Tab Sync Extension
// Provides memory management, caching, and performance monitoring

import { log, createError } from './utils.js';
import { errorHandler, ErrorCategory, ErrorSeverity, withErrorHandling } from './error-handler.js';

/**
 * Performance optimization service
 */
export class PerformanceOptimizer {
  constructor() {
    this.memoryUsage = {
      peak: 0,
      current: 0,
      history: []
    };
    this.performanceMetrics = {
      syncOperations: [],
      cacheHits: 0,
      cacheMisses: 0,
      networkRequests: 0
    };
    this.cache = new Map();
    this.cacheConfig = {
      maxSize: 100,
      ttl: 5 * 60 * 1000, // 5 minutes
      cleanupInterval: 60 * 1000 // 1 minute
    };
    this.initialized = false;
  }

  /**
   * Initialize performance optimizer
   * @returns {Promise<void>}
   */
  async initialize() {
    return withErrorHandling(async () => {
      // Start memory monitoring
      this.startMemoryMonitoring();
      
      // Start cache cleanup
      this.startCacheCleanup();
      
      // Initialize performance observer if available
      this.initializePerformanceObserver();
      
      this.initialized = true;
      log('info', 'Performance optimizer initialized');
    }, {
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.LOW,
      source: 'performance_optimizer_initialize',
      recoverable: true
    })();
  }

  /**
   * Optimize sync operation performance
   * @param {Function} syncOperation - Sync operation to optimize
   * @param {Object} options - Optimization options
   * @returns {Promise<any>} Optimized operation result
   */
  async optimizeSyncOperation(syncOperation, options = {}) {
    return withErrorHandling(async () => {
      const startTime = performance.now();
      const startMemory = this.getCurrentMemoryUsage();
      
      // Pre-optimization
      await this.preOptimize(options);
      
      let result;
      try {
        // Execute operation with monitoring
        result = await this.executeWithMonitoring(syncOperation, options);
      } finally {
        // Post-optimization cleanup
        await this.postOptimize(options);
      }
      
      // Record performance metrics
      const endTime = performance.now();
      const endMemory = this.getCurrentMemoryUsage();
      
      this.recordPerformanceMetrics({
        operation: 'sync',
        duration: endTime - startTime,
        memoryDelta: endMemory - startMemory,
        success: !!result,
        options
      });
      
      return result;
    }, {
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.MEDIUM,
      source: 'performance_optimizer_sync',
      recoverable: true
    })();
  }

  /**
   * Optimize tab operations for better performance
   * @param {Array} tabs - Tabs to process
   * @param {Function} processor - Tab processing function
   * @param {Object} options - Processing options
   * @returns {Promise<Array>} Processed tabs
   */
  async optimizeTabProcessing(tabs, processor, options = {}) {
    return withErrorHandling(async () => {
      const { batchSize = 10, delay = 0 } = options;
      const results = [];
      
      // Process tabs in batches to avoid memory spikes
      for (let i = 0; i < tabs.length; i += batchSize) {
        const batch = tabs.slice(i, i + batchSize);
        
        // Process batch
        const batchResults = await Promise.all(
          batch.map(tab => processor(tab))
        );
        
        results.push(...batchResults);
        
        // Add delay between batches if specified
        if (delay > 0 && i + batchSize < tabs.length) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // Trigger garbage collection hint if available
        this.triggerGarbageCollection();
      }
      
      return results;
    }, {
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.LOW,
      source: 'performance_optimizer_tabs',
      recoverable: true
    })();
  }

  /**
   * Cache management with TTL and size limits
   * @param {string} key - Cache key
   * @param {any} value - Value to cache (optional, for get operation)
   * @param {Object} options - Cache options
   * @returns {any} Cached value or undefined
   */
  cache(key, value = undefined, options = {}) {
    const now = Date.now();
    
    // Get operation
    if (value === undefined) {
      const cached = this.cache.get(key);
      
      if (!cached) {
        this.performanceMetrics.cacheMisses++;
        return undefined;
      }
      
      // Check TTL
      if (now > cached.expires) {
        this.cache.delete(key);
        this.performanceMetrics.cacheMisses++;
        return undefined;
      }
      
      this.performanceMetrics.cacheHits++;
      return cached.value;
    }
    
    // Set operation
    const ttl = options.ttl || this.cacheConfig.ttl;
    const expires = now + ttl;
    
    // Check cache size limit
    if (this.cache.size >= this.cacheConfig.maxSize) {
      this.evictOldestCacheEntries();
    }
    
    this.cache.set(key, {
      value,
      expires,
      created: now,
      accessed: now
    });
    
    return value;
  }

  /**
   * Optimize network requests with caching and batching
   * @param {Function} requestFunction - Network request function
   * @param {string} cacheKey - Cache key for request
   * @param {Object} options - Request options
   * @returns {Promise<any>} Request result
   */
  async optimizeNetworkRequest(requestFunction, cacheKey, options = {}) {
    return withErrorHandling(async () => {
      // Check cache first
      const cached = this.cache(cacheKey);
      if (cached && !options.bypassCache) {
        return cached;
      }
      
      // Execute request with retry logic
      const result = await this.executeWithRetry(requestFunction, {
        maxRetries: options.maxRetries || 3,
        retryDelay: options.retryDelay || 1000
      });
      
      // Cache successful results
      if (result && !options.noCache) {
        this.cache(cacheKey, result, { ttl: options.cacheTtl });
      }
      
      this.performanceMetrics.networkRequests++;
      return result;
    }, {
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.MEDIUM,
      source: 'performance_optimizer_network',
      recoverable: true
    })();
  }

  /**
   * Memory usage optimization
   * @returns {Promise<void>}
   */
  async optimizeMemoryUsage() {
    return withErrorHandling(async () => {
      // Clear expired cache entries
      this.cleanupCache();
      
      // Clear old performance metrics
      this.cleanupPerformanceMetrics();
      
      // Trigger garbage collection if available
      this.triggerGarbageCollection();
      
      // Update memory usage tracking
      this.updateMemoryUsage();
      
      log('info', 'Memory usage optimized', {
        cacheSize: this.cache.size,
        memoryUsage: this.memoryUsage.current
      });
    }, {
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.LOW,
      source: 'performance_optimizer_memory',
      recoverable: true
    })();
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance statistics
   */
  getPerformanceStats() {
    const cacheHitRate = this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses > 0 ?
      (this.performanceMetrics.cacheHits / (this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses)) * 100 : 0;
    
    const avgSyncDuration = this.performanceMetrics.syncOperations.length > 0 ?
      this.performanceMetrics.syncOperations.reduce((sum, op) => sum + op.duration, 0) / this.performanceMetrics.syncOperations.length : 0;
    
    return {
      memory: {
        current: this.memoryUsage.current,
        peak: this.memoryUsage.peak,
        history: this.memoryUsage.history.slice(-10) // Last 10 measurements
      },
      cache: {
        size: this.cache.size,
        hitRate: cacheHitRate,
        hits: this.performanceMetrics.cacheHits,
        misses: this.performanceMetrics.cacheMisses
      },
      network: {
        requests: this.performanceMetrics.networkRequests
      },
      sync: {
        operations: this.performanceMetrics.syncOperations.length,
        averageDuration: avgSyncDuration,
        recentOperations: this.performanceMetrics.syncOperations.slice(-5)
      }
    };
  }

  /**
   * Pre-optimization setup
   * @param {Object} options - Optimization options
   * @returns {Promise<void>}
   */
  async preOptimize(options = {}) {
    // Clear unnecessary cache entries
    if (options.clearCache) {
      this.cache.clear();
    }
    
    // Optimize memory before operation
    if (options.optimizeMemory) {
      await this.optimizeMemoryUsage();
    }
    
    // Prepare for high-performance operation
    if (options.highPerformance) {
      this.triggerGarbageCollection();
    }
  }

  /**
   * Post-optimization cleanup
   * @param {Object} options - Optimization options
   * @returns {Promise<void>}
   */
  async postOptimize(options = {}) {
    // Clean up temporary data
    this.cleanupCache();
    
    // Update performance metrics
    this.updateMemoryUsage();
    
    // Trigger cleanup if needed
    if (options.forceCleanup) {
      this.triggerGarbageCollection();
    }
  }

  /**
   * Execute operation with performance monitoring
   * @param {Function} operation - Operation to execute
   * @param {Object} options - Execution options
   * @returns {Promise<any>} Operation result
   */
  async executeWithMonitoring(operation, options = {}) {
    const startTime = performance.now();
    
    try {
      const result = await operation();
      
      const duration = performance.now() - startTime;
      log('debug', 'Operation completed', { duration, success: true });
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      log('debug', 'Operation failed', { duration, error: error.message });
      throw error;
    }
  }

  /**
   * Execute function with retry logic
   * @param {Function} fn - Function to execute
   * @param {Object} options - Retry options
   * @returns {Promise<any>} Function result
   */
  async executeWithRetry(fn, options = {}) {
    const { maxRetries = 3, retryDelay = 1000 } = options;
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Start memory monitoring
   */
  startMemoryMonitoring() {
    setInterval(() => {
      this.updateMemoryUsage();
    }, 30000); // Every 30 seconds
  }

  /**
   * Start cache cleanup
   */
  startCacheCleanup() {
    setInterval(() => {
      this.cleanupCache();
    }, this.cacheConfig.cleanupInterval);
  }

  /**
   * Initialize performance observer
   */
  initializePerformanceObserver() {
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            if (entry.entryType === 'measure') {
              log('debug', 'Performance measure', {
                name: entry.name,
                duration: entry.duration
              });
            }
          });
        });
        
        observer.observe({ entryTypes: ['measure', 'navigation'] });
      } catch (error) {
        log('warn', 'Performance observer not available', { error: error.message });
      }
    }
  }

  /**
   * Update memory usage tracking
   */
  updateMemoryUsage() {
    try {
      if (performance.memory) {
        const current = performance.memory.usedJSHeapSize;
        this.memoryUsage.current = current;
        
        if (current > this.memoryUsage.peak) {
          this.memoryUsage.peak = current;
        }
        
        this.memoryUsage.history.push({
          timestamp: Date.now(),
          usage: current
        });
        
        // Keep only last 100 measurements
        if (this.memoryUsage.history.length > 100) {
          this.memoryUsage.history = this.memoryUsage.history.slice(-100);
        }
      }
    } catch (error) {
      log('debug', 'Memory monitoring not available', { error: error.message });
    }
  }

  /**
   * Get current memory usage
   * @returns {number} Current memory usage in bytes
   */
  getCurrentMemoryUsage() {
    try {
      return performance.memory ? performance.memory.usedJSHeapSize : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      log('debug', 'Cache cleanup completed', { entriesRemoved: cleaned });
    }
  }

  /**
   * Evict oldest cache entries when size limit reached
   */
  evictOldestCacheEntries() {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].accessed - b[1].accessed);
    
    const toRemove = Math.ceil(this.cacheConfig.maxSize * 0.1); // Remove 10%
    for (let i = 0; i < toRemove && entries.length > 0; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Clean up old performance metrics
   */
  cleanupPerformanceMetrics() {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const cutoff = Date.now() - maxAge;
    
    this.performanceMetrics.syncOperations = this.performanceMetrics.syncOperations
      .filter(op => op.timestamp > cutoff);
  }

  /**
   * Record performance metrics
   * @param {Object} metrics - Metrics to record
   */
  recordPerformanceMetrics(metrics) {
    this.performanceMetrics.syncOperations.push({
      ...metrics,
      timestamp: Date.now()
    });
    
    // Keep only last 100 operations
    if (this.performanceMetrics.syncOperations.length > 100) {
      this.performanceMetrics.syncOperations = this.performanceMetrics.syncOperations.slice(-100);
    }
  }

  /**
   * Trigger garbage collection if available
   */
  triggerGarbageCollection() {
    try {
      if (window.gc) {
        window.gc();
      }
    } catch (error) {
      // Garbage collection not available, ignore
    }
  }

  /**
   * Clear all performance data
   */
  clearPerformanceData() {
    this.cache.clear();
    this.performanceMetrics = {
      syncOperations: [],
      cacheHits: 0,
      cacheMisses: 0,
      networkRequests: 0
    };
    this.memoryUsage = {
      peak: 0,
      current: 0,
      history: []
    };
    
    log('info', 'Performance data cleared');
  }

  /**
   * Export performance data for analysis
   * @returns {Object} Performance data export
   */
  exportPerformanceData() {
    return {
      timestamp: Date.now(),
      version: '1.0',
      data: {
        memoryUsage: this.memoryUsage,
        performanceMetrics: this.performanceMetrics,
        cacheStats: {
          size: this.cache.size,
          hitRate: this.performanceMetrics.cacheHits / 
            (this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses) * 100
        }
      }
    };
  }
}

// Create singleton instance
export const performanceOptimizer = new PerformanceOptimizer();

// Utility functions for common optimizations
export const optimizeAsync = (fn, options = {}) => {
  return async (...args) => {
    return await performanceOptimizer.optimizeSyncOperation(
      () => fn(...args),
      options
    );
  };
};

export const memoize = (fn, keyGenerator = (...args) => JSON.stringify(args)) => {
  return (...args) => {
    const key = `memoize_${keyGenerator(...args)}`;
    let result = performanceOptimizer.cache(key);
    
    if (result === undefined) {
      result = fn(...args);
      performanceOptimizer.cache(key, result);
    }
    
    return result;
  };
};

export const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

export const throttle = (fn, limit) => {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};