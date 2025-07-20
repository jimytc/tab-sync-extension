// TypeScript-style interfaces and data structures for Tab Sync Extension
// Using JSDoc comments for type definitions in JavaScript

/**
 * @typedef {Object} TabData
 * @property {string} id - Unique tab identifier
 * @property {string} url - Tab URL
 * @property {string} title - Tab title
 * @property {string} [favicon] - Tab favicon URL (optional)
 * @property {number} windowId - Chrome window ID
 * @property {number} index - Tab position in window
 * @property {number} timestamp - Last modified timestamp
 * @property {string} deviceId - Device that created/modified this tab
 * @property {boolean} [pinned] - Whether tab is pinned (optional)
 * @property {boolean} [active] - Whether tab is currently active (optional)
 */

/**
 * @typedef {Object} DeviceMetadata
 * @property {string} deviceId - Unique device identifier
 * @property {string} deviceName - Human-readable device name
 * @property {string} browserName - Browser name (Chrome, Firefox, etc.)
 * @property {string} browserVersion - Browser version
 * @property {string} platform - Operating system platform
 * @property {number} lastSeen - Last activity timestamp
 */

/**
 * @typedef {Object} SyncData
 * @property {string} version - Sync data format version
 * @property {string} deviceId - Device that created this sync data
 * @property {number} timestamp - Sync creation timestamp
 * @property {TabData[]} tabs - Array of tab data
 * @property {DeviceMetadata} metadata - Device metadata
 * @property {string} [checksum] - Data integrity checksum (optional)
 */

/**
 * @typedef {Object} ConflictItem
 * @property {'duplicate'|'modified'|'deleted'|'structural'} type - Type of conflict
 * @property {TabData} [localTab] - Local tab data (optional)
 * @property {TabData} [remoteTab] - Remote tab data (optional)
 * @property {string} reason - Human-readable conflict reason
 * @property {number} severity - Conflict severity (1-3, 3 being most severe)
 */

/**
 * @typedef {Object} ConflictData
 * @property {TabData[]} localTabs - Local tab data
 * @property {TabData[]} remoteTabs - Remote tab data
 * @property {ConflictItem[]} conflicts - Array of detected conflicts
 * @property {number} timestamp - Conflict detection timestamp
 * @property {string} resolutionStrategy - Strategy for resolving conflicts
 */

/**
 * @typedef {Object} SyncHistoryEntry
 * @property {string} id - Unique history entry ID
 * @property {number} timestamp - Sync operation timestamp
 * @property {string} deviceId - Device that performed sync
 * @property {string} deviceName - Human-readable device name
 * @property {'upload'|'download'|'merge'|'conflict'} action - Sync action type
 * @property {'success'|'error'|'partial'} status - Sync result status
 * @property {number} tabCount - Number of tabs involved
 * @property {string} [error] - Error message if status is 'error' (optional)
 * @property {Object} [details] - Additional sync details (optional)
 */

/**
 * @typedef {Object} AuthTokens
 * @property {string} accessToken - OAuth access token
 * @property {string} [refreshToken] - OAuth refresh token (optional)
 * @property {number} expiresAt - Token expiration timestamp
 * @property {string[]} scopes - Granted OAuth scopes
 * @property {string} provider - Authentication provider ('google'|'github')
 */

/**
 * @typedef {Object} StorageConfig
 * @property {string} provider - Storage provider ('google'|'github')
 * @property {string} [fileName] - Storage file name (optional)
 * @property {string} [repositoryName] - GitHub repository name (optional)
 * @property {boolean} encrypted - Whether data should be encrypted
 * @property {number} maxRetries - Maximum retry attempts for operations
 */

/**
 * @typedef {Object} ExtensionSettings
 * @property {boolean} isAuthenticated - Authentication status
 * @property {string} [authProvider] - Current auth provider (optional)
 * @property {string} deviceId - Current device ID
 * @property {number} [lastSyncTime] - Last successful sync timestamp (optional)
 * @property {number} syncCount - Total number of successful syncs
 * @property {StorageConfig} storageConfig - Storage configuration
 * @property {Object} shortcuts - Keyboard shortcuts configuration
 * @property {boolean} confirmBeforeSync - Whether to show confirmation dialog
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether validation passed
 * @property {string[]} errors - Array of validation error messages
 * @property {string[]} warnings - Array of validation warnings
 */

// Export type definitions for use in other modules
export const Types = {
  TabData: 'TabData',
  DeviceMetadata: 'DeviceMetadata',
  SyncData: 'SyncData',
  ConflictData: 'ConflictData',
  ConflictItem: 'ConflictItem',
  SyncHistoryEntry: 'SyncHistoryEntry',
  AuthTokens: 'AuthTokens',
  StorageConfig: 'StorageConfig',
  ExtensionSettings: 'ExtensionSettings',
  ValidationResult: 'ValidationResult'
};