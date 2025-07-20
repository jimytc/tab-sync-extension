// Unit tests for validation functions
// Simple test framework for Chrome extension environment

import { 
  validateTabData, 
  validateSyncData, 
  validateDeviceMetadata,
  validateConflictData,
  validateAuthTokens,
  validateTabArray
} from '../shared/validation.js';

// Simple test framework
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('🧪 Running validation tests...\n');
    
    for (const { name, fn } of this.tests) {
      try {
        await fn();
        console.log(`✅ ${name}`);
        this.passed++;
      } catch (error) {
        console.error(`❌ ${name}: ${error.message}`);
        this.failed++;
      }
    }

    console.log(`\n📊 Test Results: ${this.passed} passed, ${this.failed} failed`);
    return this.failed === 0;
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  }

  assertArrayEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(message || `Arrays not equal: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`);
    }
  }
}

const test = new TestRunner();

// TabData validation tests
test.test('validateTabData - valid data', () => {
  const validTab = {
    id: 'tab_123',
    url: 'https://example.com',
    title: 'Example Site',
    windowId: 1,
    index: 0,
    timestamp: Date.now(),
    deviceId: 'device_123'
  };

  const result = validateTabData(validTab);
  test.assert(result.isValid, 'Valid tab data should pass validation');
  test.assertEqual(result.errors.length, 0, 'Should have no errors');
});

test.test('validateTabData - missing required fields', () => {
  const invalidTab = {
    url: 'https://example.com'
    // Missing other required fields
  };

  const result = validateTabData(invalidTab);
  test.assert(!result.isValid, 'Invalid tab data should fail validation');
  test.assert(result.errors.length > 0, 'Should have validation errors');
});

test.test('validateTabData - invalid URL', () => {
  const invalidTab = {
    id: 'tab_123',
    url: 'not-a-valid-url',
    title: 'Example Site',
    windowId: 1,
    index: 0,
    timestamp: Date.now(),
    deviceId: 'device_123'
  };

  const result = validateTabData(invalidTab);
  test.assert(!result.isValid, 'Tab with invalid URL should fail validation');
  test.assert(result.errors.some(e => e.includes('valid URL')), 'Should have URL validation error');
});

// DeviceMetadata validation tests
test.test('validateDeviceMetadata - valid data', () => {
  const validMetadata = {
    deviceId: 'device_123',
    deviceName: 'My Computer',
    browserName: 'Chrome',
    browserVersion: '120.0',
    platform: 'MacIntel',
    lastSeen: Date.now()
  };

  const result = validateDeviceMetadata(validMetadata);
  test.assert(result.isValid, 'Valid device metadata should pass validation');
  test.assertEqual(result.errors.length, 0, 'Should have no errors');
});

test.test('validateDeviceMetadata - missing fields', () => {
  const invalidMetadata = {
    deviceId: 'device_123'
    // Missing other required fields
  };

  const result = validateDeviceMetadata(invalidMetadata);
  test.assert(!result.isValid, 'Invalid device metadata should fail validation');
  test.assert(result.errors.length > 0, 'Should have validation errors');
});

// SyncData validation tests
test.test('validateSyncData - valid data', () => {
  const validSyncData = {
    version: '1.0.0',
    deviceId: 'device_123',
    timestamp: Date.now(),
    tabs: [{
      id: 'tab_123',
      url: 'https://example.com',
      title: 'Example Site',
      windowId: 1,
      index: 0,
      timestamp: Date.now(),
      deviceId: 'device_123'
    }],
    metadata: {
      deviceId: 'device_123',
      deviceName: 'My Computer',
      browserName: 'Chrome',
      browserVersion: '120.0',
      platform: 'MacIntel',
      lastSeen: Date.now()
    }
  };

  const result = validateSyncData(validSyncData);
  test.assert(result.isValid, 'Valid sync data should pass validation');
  test.assertEqual(result.errors.length, 0, 'Should have no errors');
});

test.test('validateSyncData - invalid tabs array', () => {
  const invalidSyncData = {
    version: '1.0.0',
    deviceId: 'device_123',
    timestamp: Date.now(),
    tabs: [
      { id: 'invalid_tab' } // Missing required fields
    ],
    metadata: {
      deviceId: 'device_123',
      deviceName: 'My Computer',
      browserName: 'Chrome',
      browserVersion: '120.0',
      platform: 'MacIntel',
      lastSeen: Date.now()
    }
  };

  const result = validateSyncData(invalidSyncData);
  test.assert(!result.isValid, 'Sync data with invalid tabs should fail validation');
  test.assert(result.errors.some(e => e.includes('tabs[0]')), 'Should have tab validation error');
});

// AuthTokens validation tests
test.test('validateAuthTokens - valid Google tokens', () => {
  const validTokens = {
    accessToken: 'ya29.example_token',
    refreshToken: 'refresh_token_example',
    expiresAt: Date.now() + 3600000, // 1 hour from now
    scopes: ['https://www.googleapis.com/auth/drive.file'],
    provider: 'google'
  };

  const result = validateAuthTokens(validTokens);
  test.assert(result.isValid, 'Valid auth tokens should pass validation');
  test.assertEqual(result.errors.length, 0, 'Should have no errors');
});

test.test('validateAuthTokens - expired tokens', () => {
  const expiredTokens = {
    accessToken: 'ya29.example_token',
    expiresAt: Date.now() - 3600000, // 1 hour ago
    scopes: ['https://www.googleapis.com/auth/drive.file'],
    provider: 'google'
  };

  const result = validateAuthTokens(expiredTokens);
  test.assert(result.isValid, 'Expired tokens should still be structurally valid');
  test.assert(result.warnings.some(w => w.includes('expired')), 'Should have expiration warning');
});

test.test('validateAuthTokens - invalid provider', () => {
  const invalidTokens = {
    accessToken: 'token',
    expiresAt: Date.now() + 3600000,
    scopes: [],
    provider: 'invalid_provider'
  };

  const result = validateAuthTokens(invalidTokens);
  test.assert(!result.isValid, 'Tokens with invalid provider should fail validation');
  test.assert(result.errors.some(e => e.includes('provider')), 'Should have provider validation error');
});

// TabArray validation tests
test.test('validateTabArray - valid array', () => {
  const validTabs = [
    {
      id: 'tab_1',
      url: 'https://example1.com',
      title: 'Example 1',
      windowId: 1,
      index: 0,
      timestamp: Date.now(),
      deviceId: 'device_123'
    },
    {
      id: 'tab_2',
      url: 'https://example2.com',
      title: 'Example 2',
      windowId: 1,
      index: 1,
      timestamp: Date.now(),
      deviceId: 'device_123'
    }
  ];

  const result = validateTabArray(validTabs);
  test.assert(result.isValid, 'Valid tab array should pass validation');
  test.assertEqual(result.errors.length, 0, 'Should have no errors');
});

test.test('validateTabArray - duplicate URLs', () => {
  const duplicateTabs = [
    {
      id: 'tab_1',
      url: 'https://example.com',
      title: 'Example 1',
      windowId: 1,
      index: 0,
      timestamp: Date.now(),
      deviceId: 'device_123'
    },
    {
      id: 'tab_2',
      url: 'https://example.com', // Duplicate URL
      title: 'Example 2',
      windowId: 1,
      index: 1,
      timestamp: Date.now(),
      deviceId: 'device_123'
    }
  ];

  const result = validateTabArray(duplicateTabs);
  test.assert(result.isValid, 'Duplicate URLs should not fail validation but generate warnings');
  test.assert(result.warnings.some(w => w.includes('Duplicate URL')), 'Should have duplicate URL warning');
});

test.test('validateTabArray - empty array', () => {
  const result = validateTabArray([]);
  test.assert(result.isValid, 'Empty array should be valid');
  test.assert(result.warnings.some(w => w.includes('empty')), 'Should have empty array warning');
});

test.test('validateTabArray - not an array', () => {
  const result = validateTabArray('not an array');
  test.assert(!result.isValid, 'Non-array input should fail validation');
  test.assert(result.errors.some(e => e.includes('array')), 'Should have array type error');
});

// Export test runner for use in extension
export { test as validationTests };

// Auto-run tests if this file is loaded directly
if (typeof window !== 'undefined' && window.location) {
  // Running in browser context
  test.run().then(success => {
    if (success) {
      console.log('🎉 All validation tests passed!');
    } else {
      console.error('💥 Some validation tests failed!');
    }
  });
}