// Centralized error handling system for Tab Sync Extension
// Provides consistent error handling, logging, and user notifications

import { log, createError } from './utils.js';

/**
 * Error severity levels
 */
export const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Error categories for better organization
 */
export const ErrorCategory = {
  AUTHENTICATION: 'authentication',
  STORAGE: 'storage',
  SYNC: 'sync',
  NETWORK: 'network',
  VALIDATION: 'validation',
  UI: 'ui',
  SYSTEM: 'system'
};

/**
 * Centralized error handler class
 */
export class ErrorHandler {
  constructor() {
    this.errorHistory = [];
    this.maxHistorySize = 100;
    this.notificationCallbacks = new Set();
    this.recoveryStrategies = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the error handler
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Load error history from storage
      await this.loadErrorHistory();
      
      // Set up global error handlers
      this.setupGlobalErrorHandlers();
      
      // Register default recovery strategies
      this.registerDefaultRecoveryStrategies();
      
      this.initialized = true;
      log('info', 'Error handler initialized');
    } catch (error) {
      console.error('Failed to initialize error handler:', error);
    }
  }

  /**
   * Handle an error with comprehensive processing
   * @param {Error|string} error - Error to handle
   * @param {Object} context - Error context information
   * @returns {Promise<Object>} Error handling result
   */
  async handleError(error, context = {}) {
    try {
      // Normalize error object
      const normalizedError = this.normalizeError(error, context);
      
      // Log the error
      this.logError(normalizedError);
      
      // Record in history
      await this.recordError(normalizedError);
      
      // Attempt recovery if strategy exists
      const recoveryResult = await this.attemptRecovery(normalizedError);
      
      // Notify user if necessary
      await this.notifyUser(normalizedError, recoveryResult);
      
      // Notify callbacks
      this.notifyCallbacks(normalizedError, recoveryResult);
      
      return {
        error: normalizedError,
        recovery: recoveryResult,
        handled: true,
        timestamp: Date.now()
      };
      
    } catch (handlingError) {
      console.error('Error handler failed:', handlingError);
      return {
        error: this.normalizeError(error, context),
        recovery: { success: false, strategy: null },
        handled: false,
        handlingError: handlingError.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Normalize error into consistent format
   * @param {Error|string} error - Raw error
   * @param {Object} context - Error context
   * @returns {Object} Normalized error object
   */
  normalizeError(error, context = {}) {
    const normalized = {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
      message: '',
      stack: null,
      code: null,
      category: context.category || ErrorCategory.SYSTEM,
      severity: context.severity || ErrorSeverity.MEDIUM,
      context: { ...context },
      source: context.source || 'unknown',
      recoverable: context.recoverable !== false,
      userVisible: context.userVisible !== false
    };

    if (error instanceof Error) {
      normalized.message = error.message;
      normalized.stack = error.stack;
      normalized.code = error.code || error.name;
      normalized.name = error.name;
    } else if (typeof error === 'string') {
      normalized.message = error;
      normalized.name = 'StringError';
    } else if (typeof error === 'object' && error.message) {
      normalized.message = error.message;
      normalized.code = error.code;
      normalized.name = error.name || 'ObjectError';
    } else {
      normalized.message = 'Unknown error occurred';
      normalized.name = 'UnknownError';
    }

    // Determine severity based on error type and context
    normalized.severity = this.determineSeverity(normalized);

    return normalized;
  }

  /**
   * Determine error severity based on error characteristics
   * @param {Object} error - Normalized error object
   * @returns {string} Severity level
   */
  determineSeverity(error) {
    // Critical errors that break core functionality
    const criticalPatterns = [
      /authentication.*failed/i,
      /storage.*corrupted/i,
      /sync.*engine.*failed/i,
      /device.*id.*invalid/i
    ];

    // High severity errors that impact user experience
    const highPatterns = [
      /network.*error/i,
      /token.*expired/i,
      /conflict.*resolution.*failed/i,
      /data.*validation.*failed/i
    ];

    // Medium severity errors that are recoverable
    const mediumPatterns = [
      /tab.*operation.*failed/i,
      /ui.*component.*error/i,
      /shortcut.*registration.*failed/i
    ];

    const message = error.message.toLowerCase();

    if (criticalPatterns.some(pattern => pattern.test(message))) {
      return ErrorSeverity.CRITICAL;
    }
    if (highPatterns.some(pattern => pattern.test(message))) {
      return ErrorSeverity.HIGH;
    }
    if (mediumPatterns.some(pattern => pattern.test(message))) {
      return ErrorSeverity.MEDIUM;
    }

    return error.severity || ErrorSeverity.LOW;
  }

  /**
   * Log error with appropriate level
   * @param {Object} error - Normalized error object
   */
  logError(error) {
    const logLevel = this.getLogLevel(error.severity);
    const logData = {
      errorId: error.id,
      category: error.category,
      severity: error.severity,
      source: error.source,
      context: error.context
    };

    log(logLevel, error.message, logData);

    // Also log stack trace for high/critical errors
    if (error.severity === ErrorSeverity.HIGH || error.severity === ErrorSeverity.CRITICAL) {
      if (error.stack) {
        log('debug', 'Error stack trace', { errorId: error.id, stack: error.stack });
      }
    }
  }

  /**
   * Get appropriate log level for error severity
   * @param {string} severity - Error severity
   * @returns {string} Log level
   */
  getLogLevel(severity) {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return 'error';
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.MEDIUM:
        return 'warn';
      case ErrorSeverity.LOW:
        return 'info';
      default:
        return 'warn';
    }
  }

  /**
   * Record error in history
   * @param {Object} error - Normalized error object
   * @returns {Promise<void>}
   */
  async recordError(error) {
    try {
      // Add to in-memory history
      this.errorHistory.push(error);
      
      // Trim history if too large
      if (this.errorHistory.length > this.maxHistorySize) {
        this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
      }
      
      // Save to storage
      await this.saveErrorHistory();
      
    } catch (storageError) {
      console.error('Failed to record error in history:', storageError);
    }
  }

  /**
   * Attempt error recovery using registered strategies
   * @param {Object} error - Normalized error object
   * @returns {Promise<Object>} Recovery result
   */
  async attemptRecovery(error) {
    if (!error.recoverable) {
      return { success: false, strategy: null, reason: 'not_recoverable' };
    }

    // Find recovery strategy
    const strategy = this.findRecoveryStrategy(error);
    if (!strategy) {
      return { success: false, strategy: null, reason: 'no_strategy' };
    }

    try {
      log('info', 'Attempting error recovery', { 
        errorId: error.id, 
        strategy: strategy.name 
      });

      const result = await strategy.recover(error);
      
      if (result.success) {
        log('info', 'Error recovery successful', { 
          errorId: error.id, 
          strategy: strategy.name 
        });
      } else {
        log('warn', 'Error recovery failed', { 
          errorId: error.id, 
          strategy: strategy.name,
          reason: result.reason 
        });
      }

      return {
        success: result.success,
        strategy: strategy.name,
        reason: result.reason,
        data: result.data
      };

    } catch (recoveryError) {
      log('error', 'Error recovery threw exception', { 
        errorId: error.id, 
        strategy: strategy.name,
        recoveryError: recoveryError.message 
      });

      return {
        success: false,
        strategy: strategy.name,
        reason: 'recovery_exception',
        error: recoveryError.message
      };
    }
  }

  /**
   * Find appropriate recovery strategy for error
   * @param {Object} error - Normalized error object
   * @returns {Object|null} Recovery strategy or null
   */
  findRecoveryStrategy(error) {
    for (const [key, strategy] of this.recoveryStrategies) {
      if (strategy.canRecover(error)) {
        return strategy;
      }
    }
    return null;
  }

  /**
   * Notify user about error if appropriate
   * @param {Object} error - Normalized error object
   * @param {Object} recoveryResult - Recovery attempt result
   * @returns {Promise<void>}
   */
  async notifyUser(error, recoveryResult) {
    if (!error.userVisible) {
      return;
    }

    // Don't notify for low severity errors that were successfully recovered
    if (error.severity === ErrorSeverity.LOW && recoveryResult.success) {
      return;
    }

    try {
      const notification = this.createUserNotification(error, recoveryResult);
      await this.showNotification(notification);
    } catch (notificationError) {
      console.error('Failed to notify user about error:', notificationError);
    }
  }

  /**
   * Create user-friendly notification for error
   * @param {Object} error - Normalized error object
   * @param {Object} recoveryResult - Recovery attempt result
   * @returns {Object} Notification object
   */
  createUserNotification(error, recoveryResult) {
    const notification = {
      title: this.getNotificationTitle(error),
      message: this.getNotificationMessage(error, recoveryResult),
      type: this.getNotificationType(error.severity),
      actions: this.getNotificationActions(error, recoveryResult),
      persistent: error.severity === ErrorSeverity.CRITICAL
    };

    return notification;
  }

  /**
   * Get notification title based on error
   * @param {Object} error - Normalized error object
   * @returns {string} Notification title
   */
  getNotificationTitle(error) {
    switch (error.category) {
      case ErrorCategory.AUTHENTICATION:
        return 'Authentication Error';
      case ErrorCategory.STORAGE:
        return 'Storage Error';
      case ErrorCategory.SYNC:
        return 'Sync Error';
      case ErrorCategory.NETWORK:
        return 'Network Error';
      case ErrorCategory.VALIDATION:
        return 'Data Validation Error';
      case ErrorCategory.UI:
        return 'Interface Error';
      default:
        return 'Tab Sync Error';
    }
  }

  /**
   * Get user-friendly notification message
   * @param {Object} error - Normalized error object
   * @param {Object} recoveryResult - Recovery attempt result
   * @returns {string} Notification message
   */
  getNotificationMessage(error, recoveryResult) {
    let message = this.getUserFriendlyMessage(error.message);

    if (recoveryResult.success) {
      message += ' The issue has been automatically resolved.';
    } else if (recoveryResult.strategy) {
      message += ' Automatic recovery failed. Please try again or check your settings.';
    } else {
      message += ' Please check your connection and try again.';
    }

    return message;
  }

  /**
   * Convert technical error message to user-friendly message
   * @param {string} technicalMessage - Technical error message
   * @returns {string} User-friendly message
   */
  getUserFriendlyMessage(technicalMessage) {
    const messageMap = {
      'Network request failed': 'Unable to connect to the sync service',
      'Token expired': 'Your authentication has expired',
      'Invalid credentials': 'Authentication failed',
      'Storage quota exceeded': 'Not enough storage space available',
      'Sync conflict detected': 'Your tabs have conflicting changes',
      'File not found': 'Sync data not found',
      'Permission denied': 'Access denied to sync service'
    };

    const lowerMessage = technicalMessage.toLowerCase();
    
    for (const [technical, friendly] of Object.entries(messageMap)) {
      if (lowerMessage.includes(technical.toLowerCase())) {
        return friendly;
      }
    }

    // Fallback to original message if no mapping found
    return technicalMessage;
  }

  /**
   * Get notification type based on severity
   * @param {string} severity - Error severity
   * @returns {string} Notification type
   */
  getNotificationType(severity) {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return 'error';
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.MEDIUM:
        return 'warning';
      case ErrorSeverity.LOW:
        return 'info';
      default:
        return 'warning';
    }
  }

  /**
   * Get notification actions based on error and recovery
   * @param {Object} error - Normalized error object
   * @param {Object} recoveryResult - Recovery attempt result
   * @returns {Array} Array of notification actions
   */
  getNotificationActions(error, recoveryResult) {
    const actions = [];

    // Add retry action for failed recoveries
    if (!recoveryResult.success && error.recoverable) {
      actions.push({
        title: 'Retry',
        action: 'retry_error',
        data: { errorId: error.id }
      });
    }

    // Add settings action for authentication errors
    if (error.category === ErrorCategory.AUTHENTICATION) {
      actions.push({
        title: 'Open Settings',
        action: 'open_settings',
        data: { section: 'authentication' }
      });
    }

    // Add help action for critical errors
    if (error.severity === ErrorSeverity.CRITICAL) {
      actions.push({
        title: 'Get Help',
        action: 'open_help',
        data: { errorId: error.id }
      });
    }

    return actions;
  }

  /**
   * Show notification to user
   * @param {Object} notification - Notification object
   * @returns {Promise<void>}
   */
  async showNotification(notification) {
    try {
      if (typeof chrome !== 'undefined' && chrome.notifications) {
        const notificationOptions = {
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: notification.title,
          message: notification.message
        };

        // Add buttons if actions exist
        if (notification.actions && notification.actions.length > 0) {
          notificationOptions.buttons = notification.actions.map(action => ({
            title: action.title
          }));
        }

        await chrome.notifications.create(notificationOptions);
      } else {
        // Fallback for non-extension contexts
        console.warn('Notification:', notification.title, notification.message);
      }
    } catch (error) {
      console.error('Failed to show notification:', error);
    }
  }

  /**
   * Setup global error handlers
   */
  setupGlobalErrorHandlers() {
    // Handle unhandled promise rejections
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (event) => {
        this.handleError(event.reason, {
          category: ErrorCategory.SYSTEM,
          severity: ErrorSeverity.HIGH,
          source: 'unhandled_promise_rejection',
          context: { url: window.location?.href }
        });
      });

      // Handle uncaught errors
      window.addEventListener('error', (event) => {
        this.handleError(event.error || event.message, {
          category: ErrorCategory.SYSTEM,
          severity: ErrorSeverity.HIGH,
          source: 'uncaught_error',
          context: { 
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
          }
        });
      });
    }
  }

  /**
   * Register default recovery strategies
   */
  registerDefaultRecoveryStrategies() {
    // Token refresh strategy
    this.registerRecoveryStrategy('token_refresh', {
      canRecover: (error) => {
        return error.category === ErrorCategory.AUTHENTICATION &&
               (error.message.includes('token') || error.message.includes('expired'));
      },
      recover: async (error) => {
        try {
          const { authService } = await import('./auth/auth-service.js');
          await authService.refreshTokens();
          return { success: true, reason: 'token_refreshed' };
        } catch (refreshError) {
          return { success: false, reason: 'refresh_failed', error: refreshError.message };
        }
      }
    });

    // Network retry strategy
    this.registerRecoveryStrategy('network_retry', {
      canRecover: (error) => {
        return error.category === ErrorCategory.NETWORK ||
               error.message.includes('network') ||
               error.message.includes('fetch');
      },
      recover: async (error) => {
        // Simple connectivity test
        try {
          const response = await fetch('https://www.google.com/favicon.ico', {
            method: 'HEAD',
            cache: 'no-cache'
          });
          
          if (response.ok) {
            return { success: true, reason: 'network_restored' };
          } else {
            return { success: false, reason: 'network_still_down' };
          }
        } catch (testError) {
          return { success: false, reason: 'network_test_failed' };
        }
      }
    });

    // Storage cleanup strategy
    this.registerRecoveryStrategy('storage_cleanup', {
      canRecover: (error) => {
        return error.category === ErrorCategory.STORAGE &&
               (error.message.includes('quota') || error.message.includes('storage'));
      },
      recover: async (error) => {
        try {
          // Clear old error history
          await this.clearOldErrorHistory();
          
          // Clear old sync history
          const storage = await chrome.storage.local.get(['syncHistory']);
          if (storage.syncHistory && storage.syncHistory.length > 50) {
            const trimmedHistory = storage.syncHistory.slice(-50);
            await chrome.storage.local.set({ syncHistory: trimmedHistory });
          }
          
          return { success: true, reason: 'storage_cleaned' };
        } catch (cleanupError) {
          return { success: false, reason: 'cleanup_failed', error: cleanupError.message };
        }
      }
    });
  }

  /**
   * Register a recovery strategy
   * @param {string} name - Strategy name
   * @param {Object} strategy - Strategy object with canRecover and recover methods
   */
  registerRecoveryStrategy(name, strategy) {
    if (!strategy.canRecover || !strategy.recover) {
      throw new Error('Recovery strategy must have canRecover and recover methods');
    }
    
    strategy.name = name;
    this.recoveryStrategies.set(name, strategy);
    
    log('debug', 'Recovery strategy registered', { name });
  }

  /**
   * Register notification callback
   * @param {Function} callback - Callback function
   * @returns {Function} Unregister function
   */
  registerNotificationCallback(callback) {
    this.notificationCallbacks.add(callback);
    return () => this.notificationCallbacks.delete(callback);
  }

  /**
   * Notify callbacks about error
   * @param {Object} error - Normalized error object
   * @param {Object} recoveryResult - Recovery attempt result
   */
  notifyCallbacks(error, recoveryResult) {
    for (const callback of this.notificationCallbacks) {
      try {
        callback({ error, recovery: recoveryResult });
      } catch (callbackError) {
        console.error('Error notification callback failed:', callbackError);
      }
    }
  }

  /**
   * Load error history from storage
   * @returns {Promise<void>}
   */
  async loadErrorHistory() {
    try {
      const result = await chrome.storage.local.get(['errorHistory']);
      this.errorHistory = result.errorHistory || [];
      
      // Clean up old errors (older than 7 days)
      const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      this.errorHistory = this.errorHistory.filter(error => error.timestamp > weekAgo);
      
    } catch (error) {
      console.error('Failed to load error history:', error);
      this.errorHistory = [];
    }
  }

  /**
   * Save error history to storage
   * @returns {Promise<void>}
   */
  async saveErrorHistory() {
    try {
      await chrome.storage.local.set({ errorHistory: this.errorHistory });
    } catch (error) {
      console.error('Failed to save error history:', error);
    }
  }

  /**
   * Clear old error history
   * @returns {Promise<void>}
   */
  async clearOldErrorHistory() {
    try {
      const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
      this.errorHistory = this.errorHistory.filter(error => error.timestamp > dayAgo);
      await this.saveErrorHistory();
    } catch (error) {
      console.error('Failed to clear old error history:', error);
    }
  }

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  getErrorStats() {
    const now = Date.now();
    const hourAgo = now - (60 * 60 * 1000);
    const dayAgo = now - (24 * 60 * 60 * 1000);
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);

    const recentErrors = this.errorHistory.filter(error => error.timestamp > hourAgo);
    const dailyErrors = this.errorHistory.filter(error => error.timestamp > dayAgo);
    const weeklyErrors = this.errorHistory.filter(error => error.timestamp > weekAgo);

    const bySeverity = {};
    const byCategory = {};

    for (const error of this.errorHistory) {
      bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
      byCategory[error.category] = (byCategory[error.category] || 0) + 1;
    }

    return {
      total: this.errorHistory.length,
      recent: recentErrors.length,
      daily: dailyErrors.length,
      weekly: weeklyErrors.length,
      bySeverity,
      byCategory,
      lastError: this.errorHistory.length > 0 ? 
        this.errorHistory[this.errorHistory.length - 1] : null
    };
  }

  /**
   * Get error history with optional filtering
   * @param {Object} filters - Filter options
   * @returns {Array} Filtered error history
   */
  getErrorHistory(filters = {}) {
    let filtered = [...this.errorHistory];

    if (filters.category) {
      filtered = filtered.filter(error => error.category === filters.category);
    }

    if (filters.severity) {
      filtered = filtered.filter(error => error.severity === filters.severity);
    }

    if (filters.since) {
      filtered = filtered.filter(error => error.timestamp >= filters.since);
    }

    if (filters.limit) {
      filtered = filtered.slice(-filters.limit);
    }

    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Clear all error history
   * @returns {Promise<void>}
   */
  async clearErrorHistory() {
    try {
      this.errorHistory = [];
      await chrome.storage.local.remove(['errorHistory']);
      log('info', 'Error history cleared');
    } catch (error) {
      console.error('Failed to clear error history:', error);
      throw error;
    }
  }
}

// Create singleton instance
export const errorHandler = new ErrorHandler();

// Convenience functions for common error handling patterns
export async function handleError(error, context = {}) {
  return await errorHandler.handleError(error, context);
}

export function withErrorHandling(fn, context = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      await handleError(error, {
        ...context,
        source: context.source || fn.name || 'anonymous_function',
        args: args
      });
      throw error;
    }
  };
}

export function createErrorBoundary(component, context = {}) {
  return {
    ...component,
    async execute(...args) {
      try {
        return await component.execute(...args);
      } catch (error) {
        await handleError(error, {
          ...context,
          source: context.source || component.name || 'component',
          component: component.name,
          args: args
        });
        throw error;
      }
    }
  };
}