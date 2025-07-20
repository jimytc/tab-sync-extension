// Tab data serialization and deserialization utilities

import { validateTabData, validateTabArray, validateSyncData } from './validation.js';
import { log, createError, generateChecksum, getOrCreateDeviceId } from './utils.js';

/**
 * Tab serialization service
 */
export class TabSerializer {
  constructor() {
    this.version = '1.0.0';
    this.deviceId = null;
  }

  /**
   * Initialize the serializer
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      this.deviceId = await getOrCreateDeviceId();
      log('info', 'Tab serializer initialized', { deviceId: this.deviceId });
    } catch (error) {
      log('error', 'Failed to initialize tab serializer', { error: error.message });
      throw error;
    }
  }

  /**
   * Serialize Chrome tab to TabData format with comprehensive metadata
   * @param {chrome.tabs.Tab} chromeTab - Chrome tab object
   * @param {Object} options - Serialization options
   * @returns {Promise<TabData>} Serialized tab data
   */
  async serializeTab(chromeTab, options = {}) {
    try {
      if (!this.deviceId) {
        await this.initialize();
      }

      const {
        includeContent = false,
        includeHistory = false,
        sanitizeUrl = true
      } = options;

      // Basic tab data
      const tabData = {
        id: this.generateTabId(chromeTab.id),
        url: sanitizeUrl ? this.sanitizeUrl(chromeTab.url) : chromeTab.url,
        title: this.sanitizeTitle(chromeTab.title),
        favicon: chromeTab.favIconUrl || null,
        windowId: chromeTab.windowId,
        index: chromeTab.index,
        timestamp: Date.now(),
        deviceId: this.deviceId,
        pinned: chromeTab.pinned || false,
        active: chromeTab.active || false,
        chromeTabId: chromeTab.id,
        
        // Additional metadata
        metadata: {
          serializedAt: Date.now(),
          serializerVersion: this.version,
          chromeVersion: this.getChromeVersion(),
          tabState: this.getTabState(chromeTab),
          domain: this.extractDomain(chromeTab.url),
          protocol: this.extractProtocol(chromeTab.url)
        }
      };

      // Optional content inclusion
      if (includeContent) {
        tabData.content = await this.extractTabContent(chromeTab);
      }

      // Validate serialized data
      const validation = validateTabData(tabData);
      if (!validation.isValid) {
        log('warn', 'Serialized tab data validation failed', {
          url: tabData.url,
          errors: validation.errors
        });
        
        // Try to fix common issues
        const fixedData = this.fixTabData(tabData, validation.errors);
        const revalidation = validateTabData(fixedData);
        
        if (!revalidation.isValid) {
          throw createError(
            'Failed to serialize valid tab data',
            'TAB_SERIALIZATION_ERROR',
            { errors: validation.errors, url: chromeTab.url }
          );
        }
        
        return fixedData;
      }

      return tabData;
    } catch (error) {
      log('error', 'Failed to serialize tab', { 
        tabId: chromeTab.id, 
        url: chromeTab.url,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Serialize multiple tabs with batch processing
   * @param {chrome.tabs.Tab[]} chromeTabs - Array of Chrome tabs
   * @param {Object} options - Serialization options
   * @returns {Promise<TabData[]>} Array of serialized tab data
   */
  async serializeTabs(chromeTabs, options = {}) {
    try {
      const { 
        batchSize = 10,
        continueOnError = true 
      } = options;

      const results = [];
      const errors = [];

      // Process in batches to avoid overwhelming the system
      for (let i = 0; i < chromeTabs.length; i += batchSize) {
        const batch = chromeTabs.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (tab) => {
          try {
            return await this.serializeTab(tab, options);
          } catch (error) {
            if (continueOnError) {
              errors.push({ tabId: tab.id, url: tab.url, error: error.message });
              return null;
            } else {
              throw error;
            }
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.filter(result => result !== null));
      }

      if (errors.length > 0) {
        log('warn', 'Some tabs failed to serialize', { 
          total: chromeTabs.length,
          successful: results.length,
          errors: errors.length
        });
      }

      // Validate the entire array
      const validation = validateTabArray(results);
      if (!validation.isValid) {
        log('warn', 'Serialized tab array validation issues', {
          errors: validation.errors,
          warnings: validation.warnings
        });
      }

      return results;
    } catch (error) {
      log('error', 'Failed to serialize tabs batch', { error: error.message });
      throw createError('Batch tab serialization failed', 'BATCH_SERIALIZATION_ERROR', { error });
    }
  }

  /**
   * Deserialize TabData back to Chrome tab creation properties
   * @param {TabData} tabData - Serialized tab data
   * @param {Object} options - Deserialization options
   * @returns {Object} Chrome tab creation properties
   */
  deserializeTab(tabData, options = {}) {
    try {
      // Validate input data
      const validation = validateTabData(tabData);
      if (!validation.isValid) {
        throw createError(
          'Invalid tab data for deserialization',
          'INVALID_TAB_DATA',
          { errors: validation.errors }
        );
      }

      const {
        targetWindowId = null,
        preserveIndex = true,
        preservePinned = true
      } = options;

      // Create Chrome tab properties
      const createProperties = {
        url: tabData.url,
        active: false, // Don't activate by default
        pinned: preservePinned ? (tabData.pinned || false) : false
      };

      // Set window ID if specified
      if (targetWindowId) {
        createProperties.windowId = targetWindowId;
      }

      // Set index if preserving
      if (preserveIndex && typeof tabData.index === 'number') {
        createProperties.index = tabData.index;
      }

      return createProperties;
    } catch (error) {
      log('error', 'Failed to deserialize tab', { 
        tabId: tabData.id,
        url: tabData.url,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Deserialize multiple tabs
   * @param {TabData[]} tabsData - Array of serialized tab data
   * @param {Object} options - Deserialization options
   * @returns {Object[]} Array of Chrome tab creation properties
   */
  deserializeTabs(tabsData, options = {}) {
    try {
      // Validate input array
      const validation = validateTabArray(tabsData);
      if (!validation.isValid) {
        throw createError(
          'Invalid tabs data for deserialization',
          'INVALID_TABS_DATA',
          { errors: validation.errors }
        );
      }

      const results = tabsData.map((tabData, index) => {
        try {
          return this.deserializeTab(tabData, {
            ...options,
            // Adjust index for sequential creation
            preserveIndex: options.preserveIndex && typeof tabData.index === 'number'
          });
        } catch (error) {
          log('error', 'Failed to deserialize individual tab', {
            index,
            tabId: tabData.id,
            error: error.message
          });
          
          if (options.continueOnError) {
            return null;
          } else {
            throw error;
          }
        }
      });

      return results.filter(result => result !== null);
    } catch (error) {
      log('error', 'Failed to deserialize tabs', { error: error.message });
      throw createError('Tab deserialization failed', 'DESERIALIZATION_ERROR', { error });
    }
  }

  /**
   * Create sync data package from tabs
   * @param {TabData[]} tabs - Array of tab data
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<SyncData>} Sync data package
   */
  async createSyncData(tabs, metadata = {}) {
    try {
      if (!this.deviceId) {
        await this.initialize();
      }

      // Get device metadata
      const deviceMetadata = await this.getDeviceMetadata();
      
      const syncData = {
        version: this.version,
        deviceId: this.deviceId,
        timestamp: Date.now(),
        tabs: tabs,
        metadata: {
          ...deviceMetadata,
          ...metadata,
          tabCount: tabs.length,
          syncId: this.generateSyncId()
        }
      };

      // Add checksum for integrity
      const dataString = JSON.stringify({ tabs, metadata: syncData.metadata });
      syncData.checksum = await generateChecksum(dataString);

      // Validate sync data
      const validation = validateSyncData(syncData);
      if (!validation.isValid) {
        throw createError(
          'Invalid sync data created',
          'INVALID_SYNC_DATA',
          { errors: validation.errors }
        );
      }

      log('info', 'Created sync data package', {
        tabCount: tabs.length,
        deviceId: this.deviceId,
        checksum: syncData.checksum.substring(0, 8)
      });

      return syncData;
    } catch (error) {
      log('error', 'Failed to create sync data', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate and parse sync data package
   * @param {SyncData} syncData - Sync data to validate
   * @returns {Promise<Object>} Validation result with parsed data
   */
  async validateSyncData(syncData) {
    try {
      // Basic structure validation
      const validation = validateSyncData(syncData);
      if (!validation.isValid) {
        return {
          isValid: false,
          errors: validation.errors,
          warnings: validation.warnings
        };
      }

      // Checksum validation if present
      if (syncData.checksum) {
        const dataString = JSON.stringify({ 
          tabs: syncData.tabs, 
          metadata: syncData.metadata 
        });
        const expectedChecksum = await generateChecksum(dataString);
        
        if (syncData.checksum !== expectedChecksum) {
          return {
            isValid: false,
            errors: ['Checksum validation failed - data may be corrupted'],
            warnings: validation.warnings
          };
        }
      }

      // Version compatibility check
      const versionCompatible = this.isVersionCompatible(syncData.version);
      if (!versionCompatible) {
        return {
          isValid: false,
          errors: [`Incompatible sync data version: ${syncData.version}`],
          warnings: validation.warnings
        };
      }

      return {
        isValid: true,
        errors: [],
        warnings: validation.warnings,
        data: syncData
      };
    } catch (error) {
      log('error', 'Failed to validate sync data', { error: error.message });
      return {
        isValid: false,
        errors: [`Validation error: ${error.message}`],
        warnings: []
      };
    }
  }

  /**
   * Generate unique tab ID
   * @param {number} chromeTabId - Chrome tab ID
   * @returns {string} Unique tab ID
   */
  generateTabId(chromeTabId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 6);
    return `tab_${chromeTabId}_${timestamp}_${random}`;
  }

  /**
   * Generate unique sync ID
   * @returns {string} Unique sync ID
   */
  generateSyncId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 8);
    return `sync_${timestamp}_${random}`;
  }

  /**
   * Sanitize URL for storage
   * @param {string} url - URL to sanitize
   * @returns {string} Sanitized URL
   */
  sanitizeUrl(url) {
    if (!url || typeof url !== 'string') {
      return '';
    }

    // Remove sensitive parameters
    try {
      const urlObj = new URL(url);
      
      // Remove common tracking parameters
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'fbclid', 'gclid', 'msclkid', '_ga', 'mc_eid'
      ];
      
      trackingParams.forEach(param => {
        urlObj.searchParams.delete(param);
      });

      return urlObj.toString();
    } catch (error) {
      // If URL parsing fails, return original
      return url;
    }
  }

  /**
   * Sanitize tab title
   * @param {string} title - Title to sanitize
   * @returns {string} Sanitized title
   */
  sanitizeTitle(title) {
    if (!title || typeof title !== 'string') {
      return 'Untitled';
    }

    // Trim and limit length
    return title.trim().substring(0, 200);
  }

  /**
   * Extract domain from URL
   * @param {string} url - URL to extract domain from
   * @returns {string} Domain or 'unknown'
   */
  extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Extract protocol from URL
   * @param {string} url - URL to extract protocol from
   * @returns {string} Protocol or 'unknown'
   */
  extractProtocol(url) {
    try {
      return new URL(url).protocol;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get tab state information
   * @param {chrome.tabs.Tab} chromeTab - Chrome tab
   * @returns {Object} Tab state
   */
  getTabState(chromeTab) {
    return {
      loading: chromeTab.status === 'loading',
      complete: chromeTab.status === 'complete',
      audible: chromeTab.audible || false,
      muted: chromeTab.mutedInfo?.muted || false,
      incognito: chromeTab.incognito || false
    };
  }

  /**
   * Get Chrome version
   * @returns {string} Chrome version
   */
  getChromeVersion() {
    try {
      const userAgent = navigator.userAgent;
      const match = userAgent.match(/Chrome\/(\d+\.\d+)/);
      return match ? match[1] : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get device metadata for sync
   * @returns {Promise<Object>} Device metadata
   */
  async getDeviceMetadata() {
    try {
      const { getDeviceMetadata } = await import('./utils.js');
      return await getDeviceMetadata();
    } catch (error) {
      log('warn', 'Failed to get device metadata', { error: error.message });
      return {
        deviceId: this.deviceId,
        deviceName: 'Unknown Device',
        browserName: 'Chrome',
        browserVersion: this.getChromeVersion(),
        platform: navigator.platform,
        lastSeen: Date.now()
      };
    }
  }

  /**
   * Fix common tab data issues
   * @param {TabData} tabData - Tab data to fix
   * @param {string[]} errors - Validation errors
   * @returns {TabData} Fixed tab data
   */
  fixTabData(tabData, errors) {
    const fixed = { ...tabData };

    errors.forEach(error => {
      if (error.includes('url')) {
        fixed.url = fixed.url || 'about:blank';
      }
      if (error.includes('title')) {
        fixed.title = fixed.title || 'Untitled';
      }
      if (error.includes('timestamp')) {
        fixed.timestamp = Date.now();
      }
      if (error.includes('deviceId')) {
        fixed.deviceId = this.deviceId || 'unknown';
      }
    });

    return fixed;
  }

  /**
   * Check version compatibility
   * @param {string} version - Version to check
   * @returns {boolean} True if compatible
   */
  isVersionCompatible(version) {
    // Simple version compatibility check
    // In a real implementation, this would be more sophisticated
    const [major] = version.split('.');
    const [currentMajor] = this.version.split('.');
    
    return major === currentMajor;
  }

  /**
   * Extract tab content (placeholder for future implementation)
   * @param {chrome.tabs.Tab} chromeTab - Chrome tab
   * @returns {Promise<Object|null>} Tab content or null
   */
  async extractTabContent(chromeTab) {
    // This would require content script injection
    // For now, return null
    return null;
  }
}

// Create singleton instance
export const tabSerializer = new TabSerializer();