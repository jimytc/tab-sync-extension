// Chrome tabs API integration for Tab Sync Extension

import { log, createError, generateChecksum, getOrCreateDeviceId } from './utils.js';
import { validateTabData, validateTabArray } from './validation.js';

/**
 * Tab Manager class for Chrome tabs API integration
 */
export class TabManager {
  constructor() {
    this.deviceId = null;
    this.initialized = false;
  }

  /**
   * Initialize the tab manager
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      this.deviceId = await getOrCreateDeviceId();
      this.initialized = true;
      log('info', 'Tab manager initialized', { deviceId: this.deviceId });
    } catch (error) {
      log('error', 'Failed to initialize tab manager', { error: error.message });
      throw error;
    }
  }

  /**
   * Get all current tabs from all windows
   * @returns {Promise<TabData[]>} Array of tab data
   */
  async getCurrentTabs() {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const tabs = await chrome.tabs.query({});
      const tabData = await Promise.all(tabs.map(tab => this.serializeTab(tab)));
      
      // Filter out invalid tabs and validate
      const validTabs = tabData.filter(tab => {
        const validation = validateTabData(tab);
        if (!validation.isValid) {
          log('warn', 'Invalid tab data filtered out', { 
            url: tab.url, 
            errors: validation.errors 
          });
          return false;
        }
        return true;
      });

      log('info', 'Retrieved current tabs', { 
        total: tabs.length, 
        valid: validTabs.length 
      });

      return validTabs;
    } catch (error) {
      log('error', 'Failed to get current tabs', { error: error.message });
      throw createError('Failed to retrieve current tabs', 'TAB_RETRIEVAL_ERROR', { error });
    }
  }

  /**
   * Get tabs from a specific window
   * @param {number} windowId - Window ID
   * @returns {Promise<TabData[]>} Array of tab data
   */
  async getTabsFromWindow(windowId) {
    try {
      const tabs = await chrome.tabs.query({ windowId });
      const tabData = await Promise.all(tabs.map(tab => this.serializeTab(tab)));
      
      log('info', 'Retrieved tabs from window', { windowId, count: tabData.length });
      return tabData;
    } catch (error) {
      log('error', 'Failed to get tabs from window', { windowId, error: error.message });
      throw createError('Failed to retrieve window tabs', 'WINDOW_TAB_ERROR', { windowId, error });
    }
  }

  /**
   * Get active tab from current window
   * @returns {Promise<TabData|null>} Active tab data or null
   */
  async getActiveTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tabs.length === 0) {
        return null;
      }

      const tabData = await this.serializeTab(tabs[0]);
      log('info', 'Retrieved active tab', { url: tabData.url });
      
      return tabData;
    } catch (error) {
      log('error', 'Failed to get active tab', { error: error.message });
      throw createError('Failed to retrieve active tab', 'ACTIVE_TAB_ERROR', { error });
    }
  }

  /**
   * Serialize Chrome tab to TabData format
   * @param {chrome.tabs.Tab} tab - Chrome tab object
   * @returns {Promise<TabData>} Serialized tab data
   */
  async serializeTab(tab) {
    if (!this.deviceId) {
      await this.initialize();
    }

    return {
      id: `tab_${tab.id}_${Date.now()}`,
      url: tab.url || '',
      title: tab.title || 'Untitled',
      favicon: tab.favIconUrl || null,
      windowId: tab.windowId,
      index: tab.index,
      timestamp: Date.now(),
      deviceId: this.deviceId,
      pinned: tab.pinned || false,
      active: tab.active || false,
      chromeTabId: tab.id // Store original Chrome tab ID for reference
    };
  }

  /**
   * Create new tabs from tab data
   * @param {TabData[]} tabsData - Array of tab data to create
   * @param {Object} options - Creation options
   * @returns {Promise<chrome.tabs.Tab[]>} Created Chrome tabs
   */
  async createTabs(tabsData, options = {}) {
    try {
      const { 
        windowId = null, 
        createNewWindow = false,
        activateFirst = true 
      } = options;

      // Validate input
      const validation = validateTabArray(tabsData);
      if (!validation.isValid) {
        throw createError('Invalid tab data provided', 'INVALID_TAB_DATA', {
          errors: validation.errors
        });
      }

      let targetWindowId = windowId;
      
      // Create new window if requested
      if (createNewWindow) {
        const newWindow = await chrome.windows.create({
          focused: true,
          type: 'normal'
        });
        targetWindowId = newWindow.id;
        
        // Close the default blank tab
        const defaultTabs = await chrome.tabs.query({ windowId: targetWindowId });
        if (defaultTabs.length === 1 && defaultTabs[0].url === 'chrome://newtab/') {
          await chrome.tabs.remove(defaultTabs[0].id);
        }
      }

      const createdTabs = [];
      
      for (let i = 0; i < tabsData.length; i++) {
        const tabData = tabsData[i];
        
        try {
          const createProperties = {
            url: tabData.url,
            windowId: targetWindowId,
            active: activateFirst && i === 0,
            pinned: tabData.pinned || false
          };

          const createdTab = await chrome.tabs.create(createProperties);
          createdTabs.push(createdTab);
          
          log('info', 'Created tab', { 
            url: tabData.url, 
            title: tabData.title,
            tabId: createdTab.id 
          });

        } catch (error) {
          log('error', 'Failed to create individual tab', { 
            url: tabData.url, 
            error: error.message 
          });
          // Continue with other tabs even if one fails
        }
      }

      log('info', 'Tab creation completed', { 
        requested: tabsData.length, 
        created: createdTabs.length 
      });

      return createdTabs;
    } catch (error) {
      log('error', 'Failed to create tabs', { error: error.message });
      throw createError('Failed to create tabs', 'TAB_CREATION_ERROR', { error });
    }
  }

  /**
   * Close tabs by their Chrome tab IDs
   * @param {number[]} tabIds - Array of Chrome tab IDs to close
   * @returns {Promise<void>}
   */
  async closeTabs(tabIds) {
    try {
      if (!Array.isArray(tabIds) || tabIds.length === 0) {
        return;
      }

      await chrome.tabs.remove(tabIds);
      log('info', 'Closed tabs', { count: tabIds.length, tabIds });
    } catch (error) {
      log('error', 'Failed to close tabs', { tabIds, error: error.message });
      throw createError('Failed to close tabs', 'TAB_CLOSE_ERROR', { tabIds, error });
    }
  }

  /**
   * Update tab properties
   * @param {number} tabId - Chrome tab ID
   * @param {Object} updateProperties - Properties to update
   * @returns {Promise<chrome.tabs.Tab>} Updated tab
   */
  async updateTab(tabId, updateProperties) {
    try {
      const updatedTab = await chrome.tabs.update(tabId, updateProperties);
      log('info', 'Updated tab', { tabId, properties: updateProperties });
      return updatedTab;
    } catch (error) {
      log('error', 'Failed to update tab', { tabId, error: error.message });
      throw createError('Failed to update tab', 'TAB_UPDATE_ERROR', { tabId, error });
    }
  }

  /**
   * Move tabs to different positions or windows
   * @param {number[]} tabIds - Array of Chrome tab IDs to move
   * @param {Object} moveProperties - Move properties
   * @returns {Promise<chrome.tabs.Tab[]>} Moved tabs
   */
  async moveTabs(tabIds, moveProperties) {
    try {
      const movedTabs = await chrome.tabs.move(tabIds, moveProperties);
      log('info', 'Moved tabs', { tabIds, properties: moveProperties });
      return Array.isArray(movedTabs) ? movedTabs : [movedTabs];
    } catch (error) {
      log('error', 'Failed to move tabs', { tabIds, error: error.message });
      throw createError('Failed to move tabs', 'TAB_MOVE_ERROR', { tabIds, error });
    }
  }

  /**
   * Get all windows with their tabs
   * @returns {Promise<Object[]>} Array of window data with tabs
   */
  async getAllWindows() {
    try {
      const windows = await chrome.windows.getAll({ populate: true });
      
      const windowData = await Promise.all(windows.map(async (window) => {
        const tabs = await Promise.all(window.tabs.map(tab => this.serializeTab(tab)));
        
        return {
          id: window.id,
          type: window.type,
          state: window.state,
          focused: window.focused,
          incognito: window.incognito,
          tabs: tabs,
          tabCount: tabs.length
        };
      }));

      log('info', 'Retrieved all windows', { 
        windowCount: windowData.length,
        totalTabs: windowData.reduce((sum, w) => sum + w.tabCount, 0)
      });

      return windowData;
    } catch (error) {
      log('error', 'Failed to get all windows', { error: error.message });
      throw createError('Failed to retrieve windows', 'WINDOW_RETRIEVAL_ERROR', { error });
    }
  }

  /**
   * Apply tab changes (create, close, update) based on sync data
   * @param {Object} changes - Tab changes to apply
   * @returns {Promise<Object>} Results of applied changes
   */
  async applyTabChanges(changes) {
    try {
      const { 
        tabsToCreate = [], 
        tabsToClose = [], 
        tabsToUpdate = [],
        windowArrangement = null
      } = changes;

      const results = {
        created: [],
        closed: [],
        updated: [],
        errors: []
      };

      // Close tabs first
      if (tabsToClose.length > 0) {
        try {
          await this.closeTabs(tabsToClose);
          results.closed = tabsToClose;
        } catch (error) {
          results.errors.push({ operation: 'close', error: error.message });
        }
      }

      // Create new tabs
      if (tabsToCreate.length > 0) {
        try {
          const createdTabs = await this.createTabs(tabsToCreate);
          results.created = createdTabs;
        } catch (error) {
          results.errors.push({ operation: 'create', error: error.message });
        }
      }

      // Update existing tabs
      for (const update of tabsToUpdate) {
        try {
          const updatedTab = await this.updateTab(update.tabId, update.properties);
          results.updated.push(updatedTab);
        } catch (error) {
          results.errors.push({ 
            operation: 'update', 
            tabId: update.tabId, 
            error: error.message 
          });
        }
      }

      log('info', 'Applied tab changes', {
        created: results.created.length,
        closed: results.closed.length,
        updated: results.updated.length,
        errors: results.errors.length
      });

      return results;
    } catch (error) {
      log('error', 'Failed to apply tab changes', { error: error.message });
      throw createError('Failed to apply tab changes', 'TAB_CHANGES_ERROR', { error });
    }
  }

  /**
   * Get tab statistics
   * @returns {Promise<Object>} Tab statistics
   */
  async getTabStats() {
    try {
      const windows = await this.getAllWindows();
      const allTabs = windows.flatMap(w => w.tabs);
      
      const stats = {
        totalTabs: allTabs.length,
        totalWindows: windows.length,
        pinnedTabs: allTabs.filter(t => t.pinned).length,
        activeTabs: allTabs.filter(t => t.active).length,
        incognitoWindows: windows.filter(w => w.incognito).length,
        uniqueDomains: new Set(allTabs.map(t => {
          try {
            return new URL(t.url).hostname;
          } catch {
            return 'unknown';
          }
        })).size,
        tabsByWindow: windows.map(w => ({
          windowId: w.id,
          tabCount: w.tabCount,
          type: w.type,
          state: w.state
        }))
      };

      return stats;
    } catch (error) {
      log('error', 'Failed to get tab statistics', { error: error.message });
      throw createError('Failed to get tab statistics', 'TAB_STATS_ERROR', { error });
    }
  }

  /**
   * Find tabs by URL pattern
   * @param {string|RegExp} pattern - URL pattern to search for
   * @returns {Promise<TabData[]>} Matching tabs
   */
  async findTabsByUrl(pattern) {
    try {
      const allTabs = await this.getCurrentTabs();
      const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
      
      const matchingTabs = allTabs.filter(tab => regex.test(tab.url));
      
      log('info', 'Found tabs by URL pattern', { 
        pattern: pattern.toString(), 
        matches: matchingTabs.length 
      });

      return matchingTabs;
    } catch (error) {
      log('error', 'Failed to find tabs by URL', { pattern, error: error.message });
      throw createError('Failed to find tabs by URL', 'TAB_SEARCH_ERROR', { pattern, error });
    }
  }

  /**
   * Find duplicate tabs (same URL)
   * @returns {Promise<Object>} Duplicate tabs grouped by URL
   */
  async findDuplicateTabs() {
    try {
      const allTabs = await this.getCurrentTabs();
      const urlGroups = {};
      
      // Group tabs by URL
      allTabs.forEach(tab => {
        if (!urlGroups[tab.url]) {
          urlGroups[tab.url] = [];
        }
        urlGroups[tab.url].push(tab);
      });

      // Filter to only duplicates
      const duplicates = {};
      Object.entries(urlGroups).forEach(([url, tabs]) => {
        if (tabs.length > 1) {
          duplicates[url] = tabs;
        }
      });

      const duplicateCount = Object.values(duplicates).reduce((sum, tabs) => sum + tabs.length - 1, 0);
      
      log('info', 'Found duplicate tabs', { 
        uniqueUrls: Object.keys(duplicates).length,
        totalDuplicates: duplicateCount
      });

      return {
        duplicates,
        duplicateCount,
        uniqueUrls: Object.keys(duplicates).length
      };
    } catch (error) {
      log('error', 'Failed to find duplicate tabs', { error: error.message });
      throw createError('Failed to find duplicate tabs', 'DUPLICATE_SEARCH_ERROR', { error });
    }
  }

  /**
   * Create a snapshot of current tab state
   * @returns {Promise<Object>} Tab state snapshot
   */
  async createSnapshot() {
    try {
      const windows = await this.getAllWindows();
      const allTabs = await this.getCurrentTabs();
      const stats = await this.getTabStats();
      
      const snapshot = {
        timestamp: Date.now(),
        deviceId: this.deviceId,
        windows: windows,
        tabs: allTabs,
        stats: stats,
        checksum: await generateChecksum(JSON.stringify({ windows, tabs: allTabs }))
      };

      log('info', 'Created tab snapshot', {
        windows: windows.length,
        tabs: allTabs.length,
        checksum: snapshot.checksum.substring(0, 8)
      });

      return snapshot;
    } catch (error) {
      log('error', 'Failed to create tab snapshot', { error: error.message });
      throw createError('Failed to create tab snapshot', 'SNAPSHOT_ERROR', { error });
    }
  }
}