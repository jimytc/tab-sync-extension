// Unified storage service for Tab Sync Extension
// Provides consistent interface across Google Drive and GitHub storage

import { GoogleDriveStorage } from './google-drive-storage.js';
import { GitHubStorage } from './github-storage.js';
import { log, createError, retryWithBackoff } from '../utils.js';
import { errorHandler, ErrorCategory, ErrorSeverity, withErrorHandling } from '../error-handler.js';

/**
 * Unified storage service class
 */
export class StorageService {
  constructor() {
    this.providers = {
      'google-drive': new GoogleDriveStorage(),
      'github': new GitHubStorage()
    };
    this.currentProvider = null;
    this.initialized = false;
  }

  /**
   * Initialize the storage service
   * @param {string} provider - Storage provider ('google-drive' or 'github')
   * @returns {Promise<void>}
   */
  async initialize(provider) {
    return withErrorHandling(async () => {
      if (!this.isValidProvider(provider)) {
        throw createError(`Invalid storage provider: ${provider}`, 'INVALID_PROVIDER');
      }

      this.currentProvider = provider;
      const storageAdapter = this.providers[provider];
      
      await storageAdapter.initialize();
      this.initialized = true;

      log('info', 'Storage service initialized', { provider });
    }, {
      category: ErrorCategory.STORAGE,
      severity: ErrorSeverity.HIGH,
      source: 'storage_service_initialize',
      context: { provider },
      recoverable: true,
      userVisible: true
    })();
  }

  /**
   * Auto-initialize based on current authentication
   * @returns {Promise<void>}
   */
  async autoInitialize() {
    return withErrorHandling(async () => {
      // Check which provider is currently authenticated
      const authStatus = await this.getAuthenticationStatus();
      
      if (authStatus.google && authStatus.google.authenticated) {
        await this.initialize('google-drive');
      } else if (authStatus.github && authStatus.github.authenticated) {
        await this.initialize('github');
      } else {
        throw createError('No authenticated storage provider available', 'NO_AUTH_PROVIDER');
      }
    }, {
      category: ErrorCategory.STORAGE,
      severity: ErrorSeverity.HIGH,
      source: 'storage_service_auto_initialize',
      recoverable: true,
      userVisible: true
    })();
  }

  /**
   * Store sync data
   * @param {string} fileName - File name to store
   * @param {Object} data - Data to store
   * @param {Object} options - Storage options
   * @returns {Promise<Object>} Storage result
   */
  async store(fileName, data, options = {}) {
    return withErrorHandling(async () => {
      this.ensureInitialized();
      
      const storageAdapter = this.providers[this.currentProvider];
      const result = await storageAdapter.store(fileName, data, {
        ...options,
        provider: this.currentProvider
      });

      // Store metadata about the operation
      await this.recordOperation('store', {
        fileName,
        provider: this.currentProvider,
        size: result.size,
        timestamp: result.timestamp,
        checksum: result.checksum
      });

      log('info', 'Data stored successfully', { 
        fileName, 
        provider: this.currentProvider,
        size: result.size 
      });

      return result;
    }, {
      category: ErrorCategory.STORAGE,
      severity: ErrorSeverity.HIGH,
      source: 'storage_service_store',
      context: { fileName, provider: this.currentProvider },
      recoverable: true,
      userVisible: true
    })();
  }

  /**
   * Retrieve sync data
   * @param {string} fileName - File name to retrieve
   * @param {Object} options - Retrieval options
   * @returns {Promise<Object>} Retrieved data
   */
  async retrieve(fileName, options = {}) {
    return withErrorHandling(async () => {
      this.ensureInitialized();
      
      const storageAdapter = this.providers[this.currentProvider];
      const result = await storageAdapter.retrieve(fileName, options);

      // Record the operation
      await this.recordOperation('retrieve', {
        fileName,
        provider: this.currentProvider,
        size: result.metadata?.size,
        timestamp: Date.now()
      });

      log('info', 'Data retrieved successfully', { 
        fileName, 
        provider: this.currentProvider,
        size: result.metadata?.size 
      });

      return result;
    }, {
      category: ErrorCategory.STORAGE,
      severity: ErrorSeverity.HIGH,
      source: 'storage_service_retrieve',
      context: { fileName, provider: this.currentProvider },
      recoverable: true,
      userVisible: true
    })();
  }

  /**
   * List files in storage
   * @param {Object} options - List options
   * @returns {Promise<Object[]>} Array of file metadata
   */
  async listFiles(options = {}) {
    return withErrorHandling(async () => {
      this.ensureInitialized();
      
      const storageAdapter = this.providers[this.currentProvider];
      const files = await storageAdapter.listFiles(options);

      log('info', 'Files listed successfully', { 
        provider: this.currentProvider,
        count: files.length 
      });

      return files.map(file => ({
        ...file,
        provider: this.currentProvider
      }));
    }, {
      category: ErrorCategory.STORAGE,
      severity: ErrorSeverity.MEDIUM,
      source: 'storage_service_list_files',
      context: { provider: this.currentProvider },
      recoverable: true,
      userVisible: false
    })();
  }

  /**
   * Delete file from storage
   * @param {string} fileName - File name to delete
   * @param {Object} options - Delete options
   * @returns {Promise<Object>} Deletion result
   */
  async deleteFile(fileName, options = {}) {
    return withErrorHandling(async () => {
      this.ensureInitialized();
      
      const storageAdapter = this.providers[this.currentProvider];
      const result = await storageAdapter.deleteFile(fileName, options.commitMessage);

      // Record the operation
      await this.recordOperation('delete', {
        fileName,
        provider: this.currentProvider,
        timestamp: result.timestamp
      });

      log('info', 'File deleted successfully', { 
        fileName, 
        provider: this.currentProvider 
      });

      return result;
    }, {
      category: ErrorCategory.STORAGE,
      severity: ErrorSeverity.MEDIUM,
      source: 'storage_service_delete_file',
      context: { fileName, provider: this.currentProvider },
      recoverable: true,
      userVisible: true
    })();
  }

  /**
   * Get storage information and statistics
   * @returns {Promise<Object>} Storage information
   */
  async getStorageInfo() {
    try {
      this.ensureInitialized();
      
      const storageAdapter = this.providers[this.currentProvider];
      let info;

      if (this.currentProvider === 'google-drive') {
        info = await storageAdapter.getStorageInfo();
      } else if (this.currentProvider === 'github') {
        info = await storageAdapter.getRepositoryInfo();
      }

      return {
        provider: this.currentProvider,
        ...info,
        operationHistory: await this.getOperationHistory()
      };
    } catch (error) {
      log('error', 'Failed to get storage info', { 
        provider: this.currentProvider,
        error: error.message 
      });
      throw createError('Storage info failed', 'STORAGE_INFO_FAILED', { error });
    }
  }

  /**
   * Test storage connectivity
   * @param {string} provider - Provider to test (optional, defaults to current)
   * @returns {Promise<Object>} Test result
   */
  async testConnection(provider = null) {
    try {
      const testProvider = provider || this.currentProvider;
      
      if (!this.isValidProvider(testProvider)) {
        throw createError(`Invalid provider for testing: ${testProvider}`, 'INVALID_TEST_PROVIDER');
      }

      const storageAdapter = this.providers[testProvider];
      const result = await storageAdapter.testConnection();

      log('info', 'Storage connection test completed', { 
        provider: testProvider,
        success: result.success 
      });

      return result;
    } catch (error) {
      log('error', 'Storage connection test failed', { 
        provider: provider || this.currentProvider,
        error: error.message 
      });
      return {
        success: false,
        provider: provider || this.currentProvider,
        error: error.message
      };
    }
  }

  /**
   * Switch storage provider
   * @param {string} newProvider - New provider to switch to
   * @returns {Promise<void>}
   */
  async switchProvider(newProvider) {
    try {
      if (!this.isValidProvider(newProvider)) {
        throw createError(`Invalid provider: ${newProvider}`, 'INVALID_PROVIDER');
      }

      if (newProvider === this.currentProvider) {
        log('info', 'Already using requested provider', { provider: newProvider });
        return;
      }

      const oldProvider = this.currentProvider;
      
      // Initialize new provider
      await this.initialize(newProvider);
      
      log('info', 'Switched storage provider', { 
        from: oldProvider, 
        to: newProvider 
      });

      // Record the switch
      await this.recordOperation('switch', {
        fromProvider: oldProvider,
        toProvider: newProvider,
        timestamp: Date.now()
      });
    } catch (error) {
      log('error', 'Failed to switch storage provider', { 
        newProvider, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Sync data between providers (migration utility)
   * @param {string} fromProvider - Source provider
   * @param {string} toProvider - Destination provider
   * @param {Object} options - Sync options
   * @returns {Promise<Object>} Sync result
   */
  async syncBetweenProviders(fromProvider, toProvider, options = {}) {
    try {
      if (!this.isValidProvider(fromProvider) || !this.isValidProvider(toProvider)) {
        throw createError('Invalid provider for sync operation', 'INVALID_SYNC_PROVIDERS');
      }

      const { 
        filePattern = null,
        dryRun = false,
        overwrite = false 
      } = options;

      const sourceAdapter = this.providers[fromProvider];
      const targetAdapter = this.providers[toProvider];

      // Initialize both providers
      await sourceAdapter.initialize();
      await targetAdapter.initialize();

      // Get files from source
      const sourceFiles = await sourceAdapter.listFiles({ pattern: filePattern });
      
      const results = {
        total: sourceFiles.length,
        synced: 0,
        skipped: 0,
        errors: []
      };

      for (const file of sourceFiles) {
        try {
          if (dryRun) {
            log('info', 'Dry run: would sync file', { 
              fileName: file.name, 
              from: fromProvider, 
              to: toProvider 
            });
            results.synced++;
            continue;
          }

          // Check if file exists in target
          const targetFiles = await targetAdapter.listFiles({ pattern: file.name });
          const fileExists = targetFiles.some(f => f.name === file.name);

          if (fileExists && !overwrite) {
            log('info', 'Skipping existing file', { fileName: file.name });
            results.skipped++;
            continue;
          }

          // Retrieve data from source
          const sourceData = await sourceAdapter.retrieve(file.name);
          
          // Store in target
          await targetAdapter.store(file.name, sourceData.data, {
            commitMessage: `Synced from ${fromProvider} - ${new Date().toISOString()}`
          });

          results.synced++;
          log('info', 'Synced file between providers', { 
            fileName: file.name, 
            from: fromProvider, 
            to: toProvider 
          });

        } catch (error) {
          results.errors.push({
            fileName: file.name,
            error: error.message
          });
          log('error', 'Failed to sync file', { 
            fileName: file.name, 
            error: error.message 
          });
        }
      }

      log('info', 'Provider sync completed', { 
        from: fromProvider, 
        to: toProvider, 
        results 
      });

      return results;
    } catch (error) {
      log('error', 'Failed to sync between providers', { 
        fromProvider, 
        toProvider, 
        error: error.message 
      });
      throw createError('Provider sync failed', 'PROVIDER_SYNC_FAILED', { error });
    }
  }

  /**
   * Create backup of current storage
   * @param {Object} options - Backup options
   * @returns {Promise<Object>} Backup result
   */
  async createBackup(options = {}) {
    try {
      this.ensureInitialized();
      
      const storageAdapter = this.providers[this.currentProvider];
      
      if (this.currentProvider === 'github' && typeof storageAdapter.createBackup === 'function') {
        return await storageAdapter.createBackup();
      } else {
        // For Google Drive or providers without native backup, create a snapshot
        const files = await this.listFiles();
        const backupData = {
          provider: this.currentProvider,
          timestamp: Date.now(),
          files: files,
          metadata: await this.getStorageInfo()
        };

        const backupFileName = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        await this.store(backupFileName, backupData, {
          commitMessage: 'Automated backup creation'
        });

        return {
          success: true,
          backupFile: backupFileName,
          fileCount: files.length,
          timestamp: Date.now()
        };
      }
    } catch (error) {
      log('error', 'Failed to create backup', { 
        provider: this.currentProvider,
        error: error.message 
      });
      throw createError('Backup creation failed', 'BACKUP_FAILED', { error });
    }
  }

  /**
   * Get authentication status for all providers
   * @returns {Promise<Object>} Authentication status
   */
  async getAuthenticationStatus() {
    try {
      const status = {};

      for (const [providerName, adapter] of Object.entries(this.providers)) {
        try {
          const isValid = await adapter.authService.areTokensValid();
          status[providerName.replace('-', '')] = {
            authenticated: isValid,
            provider: providerName
          };
        } catch (error) {
          status[providerName.replace('-', '')] = {
            authenticated: false,
            provider: providerName,
            error: error.message
          };
        }
      }

      return status;
    } catch (error) {
      log('error', 'Failed to get authentication status', { error: error.message });
      throw error;
    }
  }

  /**
   * Record storage operation for history tracking
   * @param {string} operation - Operation type
   * @param {Object} details - Operation details
   * @returns {Promise<void>}
   */
  async recordOperation(operation, details) {
    try {
      const operationRecord = {
        id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        operation,
        timestamp: Date.now(),
        ...details
      };

      // Get existing history
      const history = await this.getOperationHistory();
      history.push(operationRecord);

      // Keep only last 100 operations
      const trimmedHistory = history.slice(-100);

      // Store updated history
      await chrome.storage.local.set({ 
        storageOperationHistory: trimmedHistory 
      });
    } catch (error) {
      log('warn', 'Failed to record operation', { operation, error: error.message });
      // Don't throw error as this is not critical
    }
  }

  /**
   * Get operation history
   * @returns {Promise<Object[]>} Operation history
   */
  async getOperationHistory() {
    try {
      const result = await chrome.storage.local.get(['storageOperationHistory']);
      return result.storageOperationHistory || [];
    } catch (error) {
      log('warn', 'Failed to get operation history', { error: error.message });
      return [];
    }
  }

  /**
   * Clear operation history
   * @returns {Promise<void>}
   */
  async clearOperationHistory() {
    try {
      await chrome.storage.local.remove(['storageOperationHistory']);
      log('info', 'Operation history cleared');
    } catch (error) {
      log('error', 'Failed to clear operation history', { error: error.message });
      throw error;
    }
  }

  /**
   * Ensure storage service is initialized
   * @throws {Error} If not initialized
   */
  ensureInitialized() {
    if (!this.initialized || !this.currentProvider) {
      throw createError('Storage service not initialized', 'NOT_INITIALIZED');
    }
  }

  /**
   * Check if provider name is valid
   * @param {string} provider - Provider name to validate
   * @returns {boolean} True if valid
   */
  isValidProvider(provider) {
    return provider && typeof provider === 'string' && provider in this.providers;
  }

  /**
   * Get list of available providers
   * @returns {string[]} Array of provider names
   */
  getAvailableProviders() {
    return Object.keys(this.providers);
  }

  /**
   * Get current provider name
   * @returns {string|null} Current provider or null
   */
  getCurrentProvider() {
    return this.currentProvider;
  }

  /**
   * Check if storage service is initialized
   * @returns {boolean} True if initialized
   */
  isInitialized() {
    return this.initialized;
  }
}

// Create singleton instance
export const storageService = new StorageService();