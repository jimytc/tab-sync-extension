// Shared utilities for Tab Sync Extension

import { validateDeviceMetadata } from './validation.js';

/**
 * Generate a unique device identifier
 * @returns {string} Unique device ID
 */
export function generateDeviceId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  const platform = getPlatformCode();
  return `device_${platform}_${timestamp}_${random}`;
}

/**
 * Get platform-specific code for device ID
 * @returns {string} Platform code
 */
function getPlatformCode() {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('mac')) return 'mac';
  if (platform.includes('win')) return 'win';
  if (platform.includes('linux')) return 'linux';
  if (platform.includes('android')) return 'android';
  if (platform.includes('iphone') || platform.includes('ipad')) return 'ios';
  return 'unknown';
}

/**
 * Get comprehensive device metadata
 * @returns {Promise<DeviceMetadata>} Device metadata object
 */
export async function getDeviceMetadata() {
  const userAgent = navigator.userAgent;
  const deviceId = await getOrCreateDeviceId();
  
  const metadata = {
    deviceId,
    deviceName: await getDeviceName(),
    browserName: getBrowserName(userAgent),
    browserVersion: getBrowserVersion(userAgent),
    platform: navigator.platform,
    lastSeen: Date.now()
  };

  // Validate the metadata before returning
  const validation = validateDeviceMetadata(metadata);
  if (!validation.isValid) {
    console.warn('Generated device metadata failed validation:', validation.errors);
  }

  return metadata;
}

/**
 * Get or create device ID from storage
 * @returns {Promise<string>} Device ID
 */
export async function getOrCreateDeviceId() {
  try {
    const result = await chrome.storage.local.get(['deviceId']);
    if (result.deviceId) {
      return result.deviceId;
    }

    // Generate new device ID
    const newDeviceId = generateDeviceId();
    await chrome.storage.local.set({ deviceId: newDeviceId });
    return newDeviceId;
  } catch (error) {
    console.error('Error getting/creating device ID:', error);
    return generateDeviceId(); // Fallback to temporary ID
  }
}

/**
 * Get human-readable device name
 * @returns {Promise<string>} Device name
 */
export async function getDeviceName() {
  try {
    // Try to get custom device name from storage
    const result = await chrome.storage.local.get(['deviceName']);
    if (result.deviceName) {
      return result.deviceName;
    }

    // Generate default device name
    const browserName = getBrowserName(navigator.userAgent);
    const platform = getPlatformName(navigator.platform);
    const defaultName = `${browserName} on ${platform}`;
    
    // Store default name
    await chrome.storage.local.set({ deviceName: defaultName });
    return defaultName;
  } catch (error) {
    console.error('Error getting device name:', error);
    return 'Unknown Device';
  }
}

/**
 * Set custom device name
 * @param {string} name - Custom device name
 * @returns {Promise<void>}
 */
export async function setDeviceName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Device name must be a non-empty string');
  }

  try {
    await chrome.storage.local.set({ deviceName: name.trim() });
  } catch (error) {
    console.error('Error setting device name:', error);
    throw error;
  }
}

/**
 * Get human-readable platform name
 * @param {string} platform - Navigator platform string
 * @returns {string} Human-readable platform name
 */
function getPlatformName(platform) {
  const p = platform.toLowerCase();
  if (p.includes('mac')) return 'macOS';
  if (p.includes('win')) return 'Windows';
  if (p.includes('linux')) return 'Linux';
  if (p.includes('android')) return 'Android';
  if (p.includes('iphone')) return 'iPhone';
  if (p.includes('ipad')) return 'iPad';
  return platform;
}

/**
 * Extract browser name from user agent
 * @param {string} userAgent 
 * @returns {string} Browser name
 */
function getBrowserName(userAgent) {
  if (userAgent.includes('Edg/')) return 'Edge';
  if (userAgent.includes('Chrome/')) return 'Chrome';
  if (userAgent.includes('Firefox/')) return 'Firefox';
  if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) return 'Safari';
  if (userAgent.includes('Opera/')) return 'Opera';
  return 'Unknown';
}

/**
 * Extract browser version from user agent
 * @param {string} userAgent 
 * @returns {string} Browser version
 */
function getBrowserVersion(userAgent) {
  // Try different browser patterns
  const patterns = [
    /Chrome\/(\d+\.\d+)/,
    /Firefox\/(\d+\.\d+)/,
    /Safari\/(\d+\.\d+)/,
    /Edge\/(\d+\.\d+)/,
    /Edg\/(\d+\.\d+)/,
    /Opera\/(\d+\.\d+)/
  ];

  for (const pattern of patterns) {
    const match = userAgent.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return 'Unknown';
}

/**
 * Compare timestamps to determine which is newer
 * @param {number} timestamp1 
 * @param {number} timestamp2 
 * @returns {number} -1 if timestamp1 is older, 1 if newer, 0 if equal
 */
export function compareTimestamps(timestamp1, timestamp2) {
  if (timestamp1 < timestamp2) return -1;
  if (timestamp1 > timestamp2) return 1;
  return 0;
}

/**
 * Check if a timestamp is within a certain time window
 * @param {number} timestamp - Timestamp to check
 * @param {number} windowMs - Time window in milliseconds
 * @returns {boolean} True if timestamp is within the window
 */
export function isWithinTimeWindow(timestamp, windowMs = 300000) { // Default 5 minutes
  const now = Date.now();
  return Math.abs(now - timestamp) <= windowMs;
}

/**
 * Get time difference in human-readable format
 * @param {number} timestamp - Past timestamp
 * @returns {string} Human-readable time difference
 */
export function getTimeDifference(timestamp) {
  if (!timestamp) return 'Never';
  
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 0) return 'In the future';
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  if (seconds > 0) return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
  
  return 'Just now';
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

/**
 * Generate checksum for data integrity
 * @param {string} data - Data to checksum
 * @returns {Promise<string>} Checksum string
 */
export async function generateChecksum(data) {
  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('Error generating checksum:', error);
    // Fallback to simple hash
    return simpleHash(data);
  }
}

/**
 * Simple hash function fallback
 * @param {string} str - String to hash
 * @returns {string} Simple hash
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Debounce function to limit rapid function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} Promise that resolves with function result
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      log('warn', `Attempt ${attempt + 1} failed, retrying in ${delay}ms`, { error: error.message });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}