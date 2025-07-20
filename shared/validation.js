// Data validation functions for Tab Sync Extension

/**
 * Validate TabData structure
 * @param {any} data - Data to validate
 * @returns {ValidationResult} Validation result
 */
export function validateTabData(data) {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== 'object') {
    errors.push('TabData must be an object');
    return { isValid: false, errors, warnings };
  }

  // Required fields
  if (!data.id || typeof data.id !== 'string') {
    errors.push('TabData.id must be a non-empty string');
  }

  if (!data.url || typeof data.url !== 'string') {
    errors.push('TabData.url must be a non-empty string');
  } else {
    try {
      new URL(data.url);
    } catch {
      errors.push('TabData.url must be a valid URL');
    }
  }

  if (!data.title || typeof data.title !== 'string') {
    errors.push('TabData.title must be a non-empty string');
  }

  if (typeof data.windowId !== 'number' || data.windowId < 0) {
    errors.push('TabData.windowId must be a non-negative number');
  }

  if (typeof data.index !== 'number' || data.index < 0) {
    errors.push('TabData.index must be a non-negative number');
  }

  if (typeof data.timestamp !== 'number' || data.timestamp <= 0) {
    errors.push('TabData.timestamp must be a positive number');
  }

  if (!data.deviceId || typeof data.deviceId !== 'string') {
    errors.push('TabData.deviceId must be a non-empty string');
  }

  // Optional fields
  if (data.favicon !== undefined && typeof data.favicon !== 'string') {
    warnings.push('TabData.favicon should be a string if provided');
  }

  if (data.pinned !== undefined && typeof data.pinned !== 'boolean') {
    warnings.push('TabData.pinned should be a boolean if provided');
  }

  if (data.active !== undefined && typeof data.active !== 'boolean') {
    warnings.push('TabData.active should be a boolean if provided');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate SyncData structure
 * @param {any} data - Data to validate
 * @returns {ValidationResult} Validation result
 */
export function validateSyncData(data) {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== 'object') {
    errors.push('SyncData must be an object');
    return { isValid: false, errors, warnings };
  }

  // Required fields
  if (!data.version || typeof data.version !== 'string') {
    errors.push('SyncData.version must be a non-empty string');
  }

  if (!data.deviceId || typeof data.deviceId !== 'string') {
    errors.push('SyncData.deviceId must be a non-empty string');
  }

  if (typeof data.timestamp !== 'number' || data.timestamp <= 0) {
    errors.push('SyncData.timestamp must be a positive number');
  }

  if (!Array.isArray(data.tabs)) {
    errors.push('SyncData.tabs must be an array');
  } else {
    // Validate each tab
    data.tabs.forEach((tab, index) => {
      const tabValidation = validateTabData(tab);
      if (!tabValidation.isValid) {
        errors.push(`SyncData.tabs[${index}]: ${tabValidation.errors.join(', ')}`);
      }
    });
  }

  if (!data.metadata || typeof data.metadata !== 'object') {
    errors.push('SyncData.metadata must be an object');
  } else {
    const metadataValidation = validateDeviceMetadata(data.metadata);
    if (!metadataValidation.isValid) {
      errors.push(`SyncData.metadata: ${metadataValidation.errors.join(', ')}`);
    }
  }

  // Optional checksum validation
  if (data.checksum !== undefined && typeof data.checksum !== 'string') {
    warnings.push('SyncData.checksum should be a string if provided');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate DeviceMetadata structure
 * @param {any} data - Data to validate
 * @returns {ValidationResult} Validation result
 */
export function validateDeviceMetadata(data) {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== 'object') {
    errors.push('DeviceMetadata must be an object');
    return { isValid: false, errors, warnings };
  }

  // Required fields
  if (!data.deviceId || typeof data.deviceId !== 'string') {
    errors.push('DeviceMetadata.deviceId must be a non-empty string');
  }

  if (!data.deviceName || typeof data.deviceName !== 'string') {
    errors.push('DeviceMetadata.deviceName must be a non-empty string');
  }

  if (!data.browserName || typeof data.browserName !== 'string') {
    errors.push('DeviceMetadata.browserName must be a non-empty string');
  }

  if (!data.browserVersion || typeof data.browserVersion !== 'string') {
    errors.push('DeviceMetadata.browserVersion must be a non-empty string');
  }

  if (!data.platform || typeof data.platform !== 'string') {
    errors.push('DeviceMetadata.platform must be a non-empty string');
  }

  if (typeof data.lastSeen !== 'number' || data.lastSeen <= 0) {
    errors.push('DeviceMetadata.lastSeen must be a positive number');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate ConflictData structure
 * @param {any} data - Data to validate
 * @returns {ValidationResult} Validation result
 */
export function validateConflictData(data) {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== 'object') {
    errors.push('ConflictData must be an object');
    return { isValid: false, errors, warnings };
  }

  // Required fields
  if (!Array.isArray(data.localTabs)) {
    errors.push('ConflictData.localTabs must be an array');
  }

  if (!Array.isArray(data.remoteTabs)) {
    errors.push('ConflictData.remoteTabs must be an array');
  }

  if (!Array.isArray(data.conflicts)) {
    errors.push('ConflictData.conflicts must be an array');
  } else {
    // Validate each conflict
    data.conflicts.forEach((conflict, index) => {
      const conflictValidation = validateConflictItem(conflict);
      if (!conflictValidation.isValid) {
        errors.push(`ConflictData.conflicts[${index}]: ${conflictValidation.errors.join(', ')}`);
      }
    });
  }

  if (typeof data.timestamp !== 'number' || data.timestamp <= 0) {
    errors.push('ConflictData.timestamp must be a positive number');
  }

  if (!data.resolutionStrategy || typeof data.resolutionStrategy !== 'string') {
    errors.push('ConflictData.resolutionStrategy must be a non-empty string');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate ConflictItem structure
 * @param {any} data - Data to validate
 * @returns {ValidationResult} Validation result
 */
export function validateConflictItem(data) {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== 'object') {
    errors.push('ConflictItem must be an object');
    return { isValid: false, errors, warnings };
  }

  // Required fields
  const validTypes = ['duplicate', 'modified', 'deleted', 'structural'];
  if (!validTypes.includes(data.type)) {
    errors.push(`ConflictItem.type must be one of: ${validTypes.join(', ')}`);
  }

  if (!data.reason || typeof data.reason !== 'string') {
    errors.push('ConflictItem.reason must be a non-empty string');
  }

  if (typeof data.severity !== 'number' || data.severity < 1 || data.severity > 3) {
    errors.push('ConflictItem.severity must be a number between 1 and 3');
  }

  // Optional tab data validation
  if (data.localTab !== undefined) {
    const localTabValidation = validateTabData(data.localTab);
    if (!localTabValidation.isValid) {
      errors.push(`ConflictItem.localTab: ${localTabValidation.errors.join(', ')}`);
    }
  }

  if (data.remoteTab !== undefined) {
    const remoteTabValidation = validateTabData(data.remoteTab);
    if (!remoteTabValidation.isValid) {
      errors.push(`ConflictItem.remoteTab: ${remoteTabValidation.errors.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate AuthTokens structure
 * @param {any} data - Data to validate
 * @returns {ValidationResult} Validation result
 */
export function validateAuthTokens(data) {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== 'object') {
    errors.push('AuthTokens must be an object');
    return { isValid: false, errors, warnings };
  }

  // Required fields
  if (!data.accessToken || typeof data.accessToken !== 'string') {
    errors.push('AuthTokens.accessToken must be a non-empty string');
  }

  if (typeof data.expiresAt !== 'number' || data.expiresAt <= 0) {
    errors.push('AuthTokens.expiresAt must be a positive number');
  }

  if (!Array.isArray(data.scopes)) {
    errors.push('AuthTokens.scopes must be an array');
  }

  const validProviders = ['google', 'github'];
  if (!validProviders.includes(data.provider)) {
    errors.push(`AuthTokens.provider must be one of: ${validProviders.join(', ')}`);
  }

  // Optional fields
  if (data.refreshToken !== undefined && typeof data.refreshToken !== 'string') {
    warnings.push('AuthTokens.refreshToken should be a string if provided');
  }

  // Check if token is expired
  if (data.expiresAt && data.expiresAt < Date.now()) {
    warnings.push('AuthTokens appear to be expired');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate array of tab data
 * @param {any[]} tabs - Array of tab data to validate
 * @returns {ValidationResult} Validation result
 */
export function validateTabArray(tabs) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(tabs)) {
    errors.push('Input must be an array');
    return { isValid: false, errors, warnings };
  }

  if (tabs.length === 0) {
    warnings.push('Tab array is empty');
  }

  // Validate each tab and collect unique URLs
  const urlSet = new Set();
  tabs.forEach((tab, index) => {
    const validation = validateTabData(tab);
    if (!validation.isValid) {
      errors.push(`Tab[${index}]: ${validation.errors.join(', ')}`);
    }

    // Check for duplicate URLs
    if (tab.url && urlSet.has(tab.url)) {
      warnings.push(`Duplicate URL found at index ${index}: ${tab.url}`);
    } else if (tab.url) {
      urlSet.add(tab.url);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Create a validation error object
 * @param {string} field - Field name that failed validation
 * @param {string} message - Error message
 * @param {any} value - Invalid value
 * @returns {Object} Validation error object
 */
export function createValidationError(field, message, value) {
  return {
    field,
    message,
    value,
    timestamp: Date.now()
  };
}