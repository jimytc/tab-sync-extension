// Shared utilities for Tab Sync Extension

/**
 * Generate a unique device identifier
 * @returns {string} Unique device ID
 */
export function generateDeviceId() {
  return 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Get current browser and OS information
 * @returns {Object} Device metadata
 */
export function getDeviceMetadata() {
  const userAgent = navigator.userAgent;
  
  return {
    browserName: getBrowserName(userAgent),
    browserVersion: getBrowserVersion(userAgent),
    platform: navigator.platform,
    timestamp: Date.now()
  };
}

/**
 * Extract browser name from user agent
 * @param {string} userAgent 
 * @returns {string} Browser name
 */
function getBrowserName(userAgent) {
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  return 'Unknown';
}

/**
 * Extract browser version from user agent
 * @param {string} userAgent 
 * @returns {string} Browser version
 */
function getBrowserVersion(userAgent) {
  const match = userAgent.match(/Chrome\/(\d+\.\d+)/);
  return match ? match[1] : 'Unknown';
}

/**
 * Format timestamp for display
 * @param {number} timestamp 
 * @returns {string} Formatted date string
 */
export function formatTimestamp(timestamp) {
  if (!timestamp) return 'Never';
  return new Date(timestamp).toLocaleString();
}

/**
 * Validate tab data structure
 * @param {Object} tabData 
 * @returns {boolean} Is valid
 */
export function validateTabData(tabData) {
  return (
    tabData &&
    typeof tabData.url === 'string' &&
    typeof tabData.title === 'string' &&
    typeof tabData.timestamp === 'number'
  );
}

/**
 * Create error object with consistent structure
 * @param {string} message 
 * @param {string} code 
 * @param {Object} details 
 * @returns {Object} Error object
 */
export function createError(message, code = 'UNKNOWN_ERROR', details = {}) {
  return {
    error: true,
    message,
    code,
    details,
    timestamp: Date.now()
  };
}

/**
 * Log message with timestamp and context
 * @param {string} level 
 * @param {string} message 
 * @param {Object} context 
 */
export function log(level, message, context = {}) {
  const timestamp = new Date().toISOString();
  console[level](`[${timestamp}] Tab Sync:`, message, context);
}