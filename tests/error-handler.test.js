// Unit tests for error handling system
// Tests comprehensive error handling, recovery strategies, and user notifications

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  ErrorHandler, 
  ErrorSeverity, 
  ErrorCategory, 
  handleError, 
  withErrorHandling,
  createErrorBoundary 
} from '../shared/error-handler.js';

// Mock Chrome APIs
global.chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn()
    },
    session: {
      set: vi.fn()
    }
  },
  notifications: {
    create: vi.fn()
  },
  runtime: {
    getURL: vi.fn()
  }
};

// Mock console methods
global.console = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn()
};

describe('ErrorHandler', () => {
  let errorHandler;

  beforeEach(async () => {
    errorHandler = new ErrorHandler();
    
    // Mock storage responses
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue();
    chrome.storage.local.remove.mockResolvedValue();
    
    await errorHandler.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Error Normalization', () => {
    it('should normalize Error objects correctly', () => {
      const error = new Error('Test error message');
      error.code = 'TEST_ERROR';
      
      const normalized = errorHandler.normalizeError(error, {
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.HIGH
      });

      expect(normalized).toMatchObject({
        message: 'Test error message',
        code: 'TEST_ERROR',
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.HIGH,
        recoverable: true,
        userVisible: true
      });
      expect(normalized.id).toBeDefined();
      expect(normalized.timestamp).toBeDefined();
      expect(normalized.stack).toBeDefined();
    });

    it('should normalize string errors correctly', () => {
      const normalized = errorHandler.normalizeError('String error message', {
        category: ErrorCategory.NETWORK
      });

      expect(normalized).toMatchObject({
        message: 'String error message',
        name: 'StringError',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM
      });
    });

    it('should handle unknown error types', () => {
      const normalized = errorHandler.normalizeError({ unknown: 'object' });

      expect(normalized).toMatchObject({
        message: 'Unknown error occurred',
        name: 'UnknownError',
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.MEDIUM
      });
    });
  });

  describe('Severity Determination', () => {
    it('should assign CRITICAL severity for authentication failures', () => {
      const error = { message: 'Authentication failed' };
      const severity = errorHandler.determineSeverity(error);
      expect(severity).toBe(ErrorSeverity.CRITICAL);
    });

    it('should assign HIGH severity for network errors', () => {
      const error = { message: 'Network error occurred' };
      const severity = errorHandler.determineSeverity(error);
      expect(severity).toBe(ErrorSeverity.HIGH);
    });

    it('should assign MEDIUM severity for tab operation failures', () => {
      const error = { message: 'Tab operation failed' };
      const severity = errorHandler.determineSeverity(error);
      expect(severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('should use provided severity when no pattern matches', () => {
      const error = { 
        message: 'Unknown error', 
        severity: ErrorSeverity.LOW 
      };
      const severity = errorHandler.determineSeverity(error);
      expect(severity).toBe(ErrorSeverity.LOW);
    });
  });

  describe('Error Recording', () => {
    it('should record errors in history', async () => {
      const error = errorHandler.normalizeError('Test error');
      
      await errorHandler.recordError(error);
      
      expect(errorHandler.errorHistory).toContain(error);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        errorHistory: expect.arrayContaining([error])
      });
    });

    it('should trim history when it exceeds max size', async () => {
      errorHandler.maxHistorySize = 2;
      
      const error1 = errorHandler.normalizeError('Error 1');
      const error2 = errorHandler.normalizeError('Error 2');
      const error3 = errorHandler.normalizeError('Error 3');
      
      await errorHandler.recordError(error1);
      await errorHandler.recordError(error2);
      await errorHandler.recordError(error3);
      
      expect(errorHandler.errorHistory).toHaveLength(2);
      expect(errorHandler.errorHistory).not.toContain(error1);
      expect(errorHandler.errorHistory).toContain(error2);
      expect(errorHandler.errorHistory).toContain(error3);
    });
  });

  describe('Recovery Strategies', () => {
    it('should register recovery strategies correctly', () => {
      const strategy = {
        canRecover: vi.fn(() => true),
        recover: vi.fn(() => Promise.resolve({ success: true }))
      };
      
      errorHandler.registerRecoveryStrategy('test_strategy', strategy);
      
      expect(errorHandler.recoveryStrategies.has('test_strategy')).toBe(true);
      expect(strategy.name).toBe('test_strategy');
    });

    it('should find appropriate recovery strategy', () => {
      const strategy = {
        canRecover: (error) => error.category === ErrorCategory.NETWORK,
        recover: vi.fn()
      };
      
      errorHandler.registerRecoveryStrategy('network_recovery', strategy);
      
      const networkError = { category: ErrorCategory.NETWORK };
      const authError = { category: ErrorCategory.AUTHENTICATION };
      
      expect(errorHandler.findRecoveryStrategy(networkError)).toBe(strategy);
      expect(errorHandler.findRecoveryStrategy(authError)).toBeNull();
    });

    it('should attempt recovery successfully', async () => {
      const strategy = {
        canRecover: () => true,
        recover: vi.fn(() => Promise.resolve({ 
          success: true, 
          reason: 'recovered' 
        }))
      };
      
      errorHandler.registerRecoveryStrategy('test_recovery', strategy);
      
      const error = { recoverable: true, category: ErrorCategory.NETWORK };
      const result = await errorHandler.attemptRecovery(error);
      
      expect(result).toMatchObject({
        success: true,
        strategy: 'test_recovery',
        reason: 'recovered'
      });
      expect(strategy.recover).toHaveBeenCalledWith(error);
    });

    it('should handle recovery failure gracefully', async () => {
      const strategy = {
        canRecover: () => true,
        recover: vi.fn(() => Promise.resolve({ 
          success: false, 
          reason: 'recovery_failed' 
        }))
      };
      
      errorHandler.registerRecoveryStrategy('failing_recovery', strategy);
      
      const error = { recoverable: true };
      const result = await errorHandler.attemptRecovery(error);
      
      expect(result).toMatchObject({
        success: false,
        strategy: 'failing_recovery',
        reason: 'recovery_failed'
      });
    });

    it('should handle recovery exceptions', async () => {
      const strategy = {
        canRecover: () => true,
        recover: vi.fn(() => Promise.reject(new Error('Recovery exception')))
      };
      
      errorHandler.registerRecoveryStrategy('exception_recovery', strategy);
      
      const error = { recoverable: true };
      const result = await errorHandler.attemptRecovery(error);
      
      expect(result).toMatchObject({
        success: false,
        strategy: 'exception_recovery',
        reason: 'recovery_exception',
        error: 'Recovery exception'
      });
    });

    it('should skip recovery for non-recoverable errors', async () => {
      const error = { recoverable: false };
      const result = await errorHandler.attemptRecovery(error);
      
      expect(result).toMatchObject({
        success: false,
        strategy: null,
        reason: 'not_recoverable'
      });
    });
  });

  describe('User Notifications', () => {
    beforeEach(() => {
      chrome.notifications.create.mockResolvedValue('notification-id');
    });

    it('should create appropriate notification for authentication errors', () => {
      const error = {
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.HIGH,
        message: 'Token expired'
      };
      
      const notification = errorHandler.createUserNotification(error, { success: false });
      
      expect(notification.title).toBe('Authentication Error');
      expect(notification.message).toContain('Your authentication has expired');
      expect(notification.type).toBe('error');
    });

    it('should create appropriate notification for storage errors', () => {
      const error = {
        category: ErrorCategory.STORAGE,
        severity: ErrorSeverity.MEDIUM,
        message: 'Storage quota exceeded'
      };
      
      const notification = errorHandler.createUserNotification(error, { success: false });
      
      expect(notification.title).toBe('Storage Error');
      expect(notification.message).toContain('Not enough storage space available');
      expect(notification.type).toBe('warning');
    });

    it('should include recovery success message', () => {
      const error = {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        message: 'Network request failed'
      };
      
      const notification = errorHandler.createUserNotification(error, { success: true });
      
      expect(notification.message).toContain('The issue has been automatically resolved');
    });

    it('should not notify for low severity recovered errors', async () => {
      const error = {
        severity: ErrorSeverity.LOW,
        userVisible: true
      };
      const recoveryResult = { success: true };
      
      await errorHandler.notifyUser(error, recoveryResult);
      
      expect(chrome.notifications.create).not.toHaveBeenCalled();
    });

    it('should not notify for non-user-visible errors', async () => {
      const error = {
        severity: ErrorSeverity.HIGH,
        userVisible: false
      };
      const recoveryResult = { success: false };
      
      await errorHandler.notifyUser(error, recoveryResult);
      
      expect(chrome.notifications.create).not.toHaveBeenCalled();
    });
  });

  describe('Error Statistics', () => {
    beforeEach(async () => {
      // Add some test errors
      const errors = [
        { 
          timestamp: Date.now() - 30 * 60 * 1000, // 30 minutes ago
          severity: ErrorSeverity.HIGH,
          category: ErrorCategory.AUTHENTICATION
        },
        { 
          timestamp: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
          severity: ErrorSeverity.MEDIUM,
          category: ErrorCategory.STORAGE
        },
        { 
          timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
          severity: ErrorSeverity.LOW,
          category: ErrorCategory.UI
        }
      ];
      
      for (const error of errors) {
        await errorHandler.recordError(error);
      }
    });

    it('should calculate error statistics correctly', () => {
      const stats = errorHandler.getErrorStats();
      
      expect(stats.total).toBe(3);
      expect(stats.recent).toBe(1); // Within last hour
      expect(stats.daily).toBe(2); // Within last day
      expect(stats.weekly).toBe(3); // Within last week
      
      expect(stats.bySeverity).toMatchObject({
        [ErrorSeverity.HIGH]: 1,
        [ErrorSeverity.MEDIUM]: 1,
        [ErrorSeverity.LOW]: 1
      });
      
      expect(stats.byCategory).toMatchObject({
        [ErrorCategory.AUTHENTICATION]: 1,
        [ErrorCategory.STORAGE]: 1,
        [ErrorCategory.UI]: 1
      });
    });

    it('should filter error history correctly', () => {
      const authErrors = errorHandler.getErrorHistory({
        category: ErrorCategory.AUTHENTICATION
      });
      expect(authErrors).toHaveLength(1);
      
      const highSeverityErrors = errorHandler.getErrorHistory({
        severity: ErrorSeverity.HIGH
      });
      expect(highSeverityErrors).toHaveLength(1);
      
      const recentErrors = errorHandler.getErrorHistory({
        since: Date.now() - 60 * 60 * 1000 // Last hour
      });
      expect(recentErrors).toHaveLength(1);
      
      const limitedErrors = errorHandler.getErrorHistory({
        limit: 2
      });
      expect(limitedErrors).toHaveLength(2);
    });
  });

  describe('Comprehensive Error Handling', () => {
    it('should handle error completely', async () => {
      const testError = new Error('Test comprehensive handling');
      const context = {
        category: ErrorCategory.SYNC,
        severity: ErrorSeverity.HIGH,
        source: 'test_function'
      };
      
      const result = await errorHandler.handleError(testError, context);
      
      expect(result.handled).toBe(true);
      expect(result.error).toMatchObject({
        message: 'Test comprehensive handling',
        category: ErrorCategory.SYNC,
        severity: ErrorSeverity.HIGH,
        source: 'test_function'
      });
      expect(result.recovery).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should handle error handler failures gracefully', async () => {
      // Mock storage failure
      chrome.storage.local.set.mockRejectedValue(new Error('Storage failed'));
      
      const testError = new Error('Test error');
      const result = await errorHandler.handleError(testError);
      
      expect(result.handled).toBe(false);
      expect(result.handlingError).toBeDefined();
    });
  });
});

describe('Utility Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleError', () => {
    it('should use global error handler', async () => {
      const mockHandleError = vi.fn().mockResolvedValue({ handled: true });
      const mockErrorHandler = { handleError: mockHandleError };
      
      // Mock the global error handler
      vi.doMock('../shared/error-handler.js', () => ({
        errorHandler: mockErrorHandler,
        handleError: (error, context) => mockErrorHandler.handleError(error, context)
      }));
      
      const { handleError } = await import('../shared/error-handler.js');
      
      const error = new Error('Test error');
      const context = { category: ErrorCategory.NETWORK };
      
      await handleError(error, context);
      
      expect(mockHandleError).toHaveBeenCalledWith(error, context);
    });
  });

  describe('withErrorHandling', () => {
    it('should wrap function with error handling', async () => {
      const mockHandleError = vi.fn().mockResolvedValue({ handled: true });
      const mockErrorHandler = { handleError: mockHandleError };
      
      vi.doMock('../shared/error-handler.js', () => ({
        errorHandler: mockErrorHandler,
        withErrorHandling: (fn, context) => {
          return async (...args) => {
            try {
              return await fn(...args);
            } catch (error) {
              await mockErrorHandler.handleError(error, {
                ...context,
                source: context.source || fn.name || 'anonymous_function',
                args: args
              });
              throw error;
            }
          };
        }
      }));
      
      const { withErrorHandling } = await import('../shared/error-handler.js');
      
      const testFunction = vi.fn().mockRejectedValue(new Error('Function failed'));
      const wrappedFunction = withErrorHandling(testFunction, {
        category: ErrorCategory.SYNC,
        source: 'test_function'
      });
      
      await expect(wrappedFunction('arg1', 'arg2')).rejects.toThrow('Function failed');
      
      expect(mockHandleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          category: ErrorCategory.SYNC,
          source: 'test_function',
          args: ['arg1', 'arg2']
        })
      );
    });

    it('should not interfere with successful function execution', async () => {
      const testFunction = vi.fn().mockResolvedValue('success');
      const wrappedFunction = withErrorHandling(testFunction, {});
      
      const result = await wrappedFunction('test');
      
      expect(result).toBe('success');
      expect(testFunction).toHaveBeenCalledWith('test');
    });
  });

  describe('createErrorBoundary', () => {
    it('should wrap component with error handling', async () => {
      const mockHandleError = vi.fn().mockResolvedValue({ handled: true });
      const mockErrorHandler = { handleError: mockHandleError };
      
      vi.doMock('../shared/error-handler.js', () => ({
        errorHandler: mockErrorHandler,
        createErrorBoundary: (component, context) => ({
          ...component,
          async execute(...args) {
            try {
              return await component.execute(...args);
            } catch (error) {
              await mockErrorHandler.handleError(error, {
                ...context,
                source: context.source || component.name || 'component',
                component: component.name,
                args: args
              });
              throw error;
            }
          }
        })
      }));
      
      const { createErrorBoundary } = await import('../shared/error-handler.js');
      
      const testComponent = {
        name: 'TestComponent',
        execute: vi.fn().mockRejectedValue(new Error('Component failed'))
      };
      
      const boundaryComponent = createErrorBoundary(testComponent, {
        category: ErrorCategory.UI
      });
      
      await expect(boundaryComponent.execute('test')).rejects.toThrow('Component failed');
      
      expect(mockHandleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          category: ErrorCategory.UI,
          component: 'TestComponent',
          args: ['test']
        })
      );
    });
  });
});

describe('Default Recovery Strategies', () => {
  let errorHandler;

  beforeEach(async () => {
    errorHandler = new ErrorHandler();
    
    // Mock Chrome storage
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue();
    
    await errorHandler.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Token Refresh Strategy', () => {
    it('should identify token-related errors', () => {
      const strategy = errorHandler.recoveryStrategies.get('token_refresh');
      
      const tokenError = {
        category: ErrorCategory.AUTHENTICATION,
        message: 'Token expired'
      };
      
      const networkError = {
        category: ErrorCategory.NETWORK,
        message: 'Connection failed'
      };
      
      expect(strategy.canRecover(tokenError)).toBe(true);
      expect(strategy.canRecover(networkError)).toBe(false);
    });
  });

  describe('Network Retry Strategy', () => {
    it('should identify network-related errors', () => {
      const strategy = errorHandler.recoveryStrategies.get('network_retry');
      
      const networkError = {
        category: ErrorCategory.NETWORK,
        message: 'Network error occurred'
      };
      
      const fetchError = {
        category: ErrorCategory.SYSTEM,
        message: 'Fetch failed'
      };
      
      const authError = {
        category: ErrorCategory.AUTHENTICATION,
        message: 'Invalid credentials'
      };
      
      expect(strategy.canRecover(networkError)).toBe(true);
      expect(strategy.canRecover(fetchError)).toBe(true);
      expect(strategy.canRecover(authError)).toBe(false);
    });
  });

  describe('Storage Cleanup Strategy', () => {
    it('should identify storage-related errors', () => {
      const strategy = errorHandler.recoveryStrategies.get('storage_cleanup');
      
      const quotaError = {
        category: ErrorCategory.STORAGE,
        message: 'Storage quota exceeded'
      };
      
      const storageError = {
        category: ErrorCategory.STORAGE,
        message: 'Storage operation failed'
      };
      
      const networkError = {
        category: ErrorCategory.NETWORK,
        message: 'Network failed'
      };
      
      expect(strategy.canRecover(quotaError)).toBe(true);
      expect(strategy.canRecover(storageError)).toBe(true);
      expect(strategy.canRecover(networkError)).toBe(false);
    });
  });
});

describe('Error Handler Integration', () => {
  let errorHandler;

  beforeEach(async () => {
    errorHandler = new ErrorHandler();
    
    // Mock Chrome APIs
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue();
    chrome.notifications.create.mockResolvedValue('notification-id');
    
    await errorHandler.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle complete error lifecycle', async () => {
    // Register a test recovery strategy
    const recoveryStrategy = {
      canRecover: (error) => error.category === ErrorCategory.NETWORK,
      recover: vi.fn().mockResolvedValue({ success: true, reason: 'network_restored' })
    };
    
    errorHandler.registerRecoveryStrategy('test_network_recovery', recoveryStrategy);
    
    // Register notification callback
    const notificationCallback = vi.fn();
    errorHandler.registerNotificationCallback(notificationCallback);
    
    // Handle a network error
    const networkError = new Error('Network connection failed');
    const result = await errorHandler.handleError(networkError, {
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.HIGH,
      source: 'test_integration',
      userVisible: true
    });
    
    // Verify error was handled completely
    expect(result.handled).toBe(true);
    expect(result.error.category).toBe(ErrorCategory.NETWORK);
    expect(result.recovery.success).toBe(true);
    expect(result.recovery.strategy).toBe('test_network_recovery');
    
    // Verify recovery was attempted
    expect(recoveryStrategy.recover).toHaveBeenCalled();
    
    // Verify error was recorded
    expect(errorHandler.errorHistory).toHaveLength(1);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      errorHistory: expect.arrayContaining([
        expect.objectContaining({
          message: 'Network connection failed',
          category: ErrorCategory.NETWORK
        })
      ])
    });
    
    // Verify notification callback was called
    expect(notificationCallback).toHaveBeenCalledWith({
      error: expect.objectContaining({
        message: 'Network connection failed'
      }),
      recovery: expect.objectContaining({
        success: true,
        strategy: 'test_network_recovery'
      })
    });
    
    // Verify user notification was shown (recovery successful, so no notification for low severity)
    // High severity errors should still show notification even if recovered
    expect(chrome.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Network Error',
        message: expect.stringContaining('automatically resolved')
      })
    );
  });

  it('should handle error handler initialization failure gracefully', async () => {
    const failingErrorHandler = new ErrorHandler();
    
    // Mock storage failure during initialization
    chrome.storage.local.get.mockRejectedValue(new Error('Storage initialization failed'));
    
    // Should not throw during initialization
    await expect(failingErrorHandler.initialize()).resolves.toBeUndefined();
    
    // Should still be able to handle errors (with degraded functionality)
    const result = await failingErrorHandler.handleError('Test error');
    expect(result.handled).toBe(false);
    expect(result.handlingError).toBeDefined();
  });
});