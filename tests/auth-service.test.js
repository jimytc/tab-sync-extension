// Integration tests for unified authentication service

import { AuthService } from '../shared/auth/auth-service.js';

// Mock Chrome APIs for testing
const mockChrome = {
  storage: {
    local: {
      get: null, // Will be mocked in tests
      set: null, // Will be mocked in tests
      remove: null // Will be mocked in tests
    }
  }
};

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
    console.log('🧪 Running Auth Service integration tests...\n');
    
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

// Mock global chrome object
global.chrome = mockChrome;

// Test AuthService instantiation
test.test('AuthService - instantiation', () => {
  const authService = new AuthService();
  test.assert(authService.providers, 'Should have providers object');
  test.assert(authService.providers.google, 'Should have Google provider');
  test.assert(authService.providers.github, 'Should have GitHub provider');
  test.assertEqual(authService.currentProvider, null, 'Should have no current provider initially');
});

// Test provider validation
test.test('AuthService - isValidProvider', () => {
  const authService = new AuthService();
  
  test.assert(authService.isValidProvider('google'), 'Should validate google provider');
  test.assert(authService.isValidProvider('github'), 'Should validate github provider');
  test.assert(!authService.isValidProvider('invalid'), 'Should reject invalid provider');
  test.assert(!authService.isValidProvider(null), 'Should reject null provider');
  test.assert(!authService.isValidProvider(''), 'Should reject empty provider');
});

// Test getAvailableProviders
test.test('AuthService - getAvailableProviders', () => {
  const authService = new AuthService();
  const providers = authService.getAvailableProviders();
  
  test.assertArrayEqual(providers.sort(), ['github', 'google'], 'Should return correct providers');
});

// Test initialization with no existing auth
test.test('AuthService - initialize with no auth', async () => {
  const authService = new AuthService();
  
  mockChrome.storage.local.get = async (keys) => {
    return {}; // No stored auth data
  };

  await authService.initialize();
  test.assertEqual(authService.currentProvider, null, 'Should have no current provider');
});

// Test initialization with existing auth
test.test('AuthService - initialize with existing auth', async () => {
  const authService = new AuthService();
  
  mockChrome.storage.local.get = async (keys) => {
    return {
      isAuthenticated: true,
      authProvider: 'google'
    };
  };

  await authService.initialize();
  test.assertEqual(authService.currentProvider, 'google', 'Should set current provider from storage');
});

// Test getAuthStatus with no authentication
test.test('AuthService - getAuthStatus with no auth', async () => {
  const authService = new AuthService();
  
  mockChrome.storage.local.get = async (keys) => {
    return {}; // No auth data
  };

  const status = await authService.getAuthStatus();
  test.assertEqual(status.isAuthenticated, false, 'Should not be authenticated');
  test.assertEqual(status.provider, null, 'Should have no provider');
  test.assertEqual(status.tokensValid, false, 'Should have invalid tokens');
});

// Test getAuthStatus with authentication
test.test('AuthService - getAuthStatus with auth', async () => {
  const authService = new AuthService();
  
  mockChrome.storage.local.get = async (keys) => {
    return {
      isAuthenticated: true,
      authProvider: 'google',
      authTime: Date.now() - 3600000 // 1 hour ago
    };
  };

  // Mock the Google auth service areTokensValid method
  authService.providers.google.areTokensValid = async () => true;

  const status = await authService.getAuthStatus();
  test.assertEqual(status.isAuthenticated, true, 'Should be authenticated');
  test.assertEqual(status.provider, 'google', 'Should have correct provider');
  test.assertEqual(status.tokensValid, true, 'Should have valid tokens');
});

// Test authenticate with invalid provider
test.test('AuthService - authenticate with invalid provider', async () => {
  const authService = new AuthService();
  
  try {
    await authService.authenticate('invalid');
    test.assert(false, 'Should have thrown an error');
  } catch (error) {
    test.assert(error.message.includes('Invalid provider'), 'Should throw invalid provider error');
  }
});

// Test authenticate with valid provider
test.test('AuthService - authenticate with valid provider', async () => {
  const authService = new AuthService();
  
  let storedData = {};
  mockChrome.storage.local.set = async (data) => {
    Object.assign(storedData, data);
  };

  // Mock the Google auth service authenticate method
  const mockTokens = {
    accessToken: 'test_token',
    provider: 'google',
    expiresAt: Date.now() + 3600000
  };
  
  authService.providers.google.authenticate = async () => mockTokens;

  const tokens = await authService.authenticate('google');
  
  test.assertEqual(tokens.accessToken, 'test_token', 'Should return tokens');
  test.assertEqual(authService.currentProvider, 'google', 'Should set current provider');
  test.assert(storedData.isAuthenticated, 'Should mark as authenticated in storage');
  test.assertEqual(storedData.authProvider, 'google', 'Should store provider in storage');
});

// Test signOut with no authentication
test.test('AuthService - signOut with no auth', async () => {
  const authService = new AuthService();
  
  mockChrome.storage.local.get = async (keys) => {
    return {}; // No auth data
  };

  // Should not throw error
  await authService.signOut();
  test.assertEqual(authService.currentProvider, null, 'Should have no current provider');
});

// Test signOut with authentication
test.test('AuthService - signOut with auth', async () => {
  const authService = new AuthService();
  authService.currentProvider = 'google';
  
  let removedKeys = [];
  mockChrome.storage.local.remove = async (keys) => {
    removedKeys = keys;
  };

  // Mock the Google auth service signOut method
  authService.providers.google.signOut = async () => {};

  await authService.signOut();
  
  test.assertEqual(authService.currentProvider, null, 'Should clear current provider');
  test.assert(removedKeys.includes('authProvider'), 'Should remove auth provider from storage');
  test.assert(removedKeys.includes('isAuthenticated'), 'Should remove auth status from storage');
});

// Test normalizeProfile for Google
test.test('AuthService - normalizeProfile for Google', () => {
  const authService = new AuthService();
  
  const googleProfile = {
    id: '123456789',
    name: 'John Doe',
    email: 'john@example.com',
    picture: 'https://example.com/avatar.jpg'
  };

  const normalized = authService.normalizeProfile(googleProfile, 'google');
  
  test.assertEqual(normalized.provider, 'google', 'Should set correct provider');
  test.assertEqual(normalized.id, '123456789', 'Should set correct ID');
  test.assertEqual(normalized.name, 'John Doe', 'Should set correct name');
  test.assertEqual(normalized.email, 'john@example.com', 'Should set correct email');
  test.assertEqual(normalized.avatar, 'https://example.com/avatar.jpg', 'Should set correct avatar');
  test.assertEqual(normalized.username, 'john', 'Should extract username from email');
});

// Test normalizeProfile for GitHub
test.test('AuthService - normalizeProfile for GitHub', () => {
  const authService = new AuthService();
  
  const githubProfile = {
    id: 987654321,
    login: 'johndoe',
    name: 'John Doe',
    email: 'john@example.com',
    avatar_url: 'https://github.com/avatar.jpg'
  };

  const normalized = authService.normalizeProfile(githubProfile, 'github');
  
  test.assertEqual(normalized.provider, 'github', 'Should set correct provider');
  test.assertEqual(normalized.id, 987654321, 'Should set correct ID');
  test.assertEqual(normalized.name, 'John Doe', 'Should set correct name');
  test.assertEqual(normalized.email, 'john@example.com', 'Should set correct email');
  test.assertEqual(normalized.avatar, 'https://github.com/avatar.jpg', 'Should set correct avatar');
  test.assertEqual(normalized.username, 'johndoe', 'Should set correct username');
});

// Test getUserProfile
test.test('AuthService - getUserProfile', async () => {
  const authService = new AuthService();
  authService.currentProvider = 'google';
  
  const mockProfile = {
    id: '123',
    name: 'Test User',
    email: 'test@example.com',
    picture: 'https://example.com/pic.jpg'
  };

  // Mock the Google auth service getUserProfile method
  authService.providers.google.getUserProfile = async () => mockProfile;

  const profile = await authService.getUserProfile();
  
  test.assertEqual(profile.provider, 'google', 'Should set correct provider');
  test.assertEqual(profile.name, 'Test User', 'Should normalize name correctly');
  test.assertEqual(profile.email, 'test@example.com', 'Should normalize email correctly');
});

// Test clearAllAuthData
test.test('AuthService - clearAllAuthData', async () => {
  const authService = new AuthService();
  authService.currentProvider = 'google';
  
  let removedKeys = [];
  mockChrome.storage.local.remove = async (keys) => {
    removedKeys = keys;
  };

  await authService.clearAllAuthData();
  
  test.assertEqual(authService.currentProvider, null, 'Should clear current provider');
  test.assert(removedKeys.includes('authTokens'), 'Should remove auth tokens');
  test.assert(removedKeys.includes('authProvider'), 'Should remove auth provider');
  test.assert(removedKeys.includes('isAuthenticated'), 'Should remove auth status');
});

// Test getAuthStats
test.test('AuthService - getAuthStats', async () => {
  const authService = new AuthService();
  
  const authTime = Date.now() - 7200000; // 2 hours ago
  const refreshTime = Date.now() - 1800000; // 30 minutes ago
  
  mockChrome.storage.local.get = async (keys) => {
    return {
      authTime,
      lastTokenRefresh: refreshTime,
      authProvider: 'github'
    };
  };

  // Mock isAuthenticated
  authService.isAuthenticated = async () => true;

  const stats = await authService.getAuthStats();
  
  test.assertEqual(stats.provider, 'github', 'Should return correct provider');
  test.assertEqual(stats.authTime, authTime, 'Should return correct auth time');
  test.assert(stats.authAge > 0, 'Should calculate auth age');
  test.assert(stats.lastRefreshAge > 0, 'Should calculate refresh age');
  test.assertEqual(stats.isAuthenticated, true, 'Should return auth status');
});

// Export test runner for use in extension
export { test as authServiceTests };

// Auto-run tests if this file is loaded directly
if (typeof window !== 'undefined' && window.location) {
  // Running in browser context
  test.run().then(success => {
    if (success) {
      console.log('🎉 All Auth Service tests passed!');
    } else {
      console.error('💥 Some Auth Service tests failed!');
    }
  });
}