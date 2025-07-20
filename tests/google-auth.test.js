// Unit tests for Google OAuth authentication service

import { GoogleAuthService } from '../shared/auth/google-auth.js';

// Mock Chrome APIs for testing
const mockChrome = {
  identity: {
    getRedirectURL: () => 'https://extension-id.chromiumapp.org/',
    launchWebAuthFlow: null // Will be mocked in tests
  },
  storage: {
    local: {
      get: null, // Will be mocked in tests
      set: null, // Will be mocked in tests
      remove: null // Will be mocked in tests
    }
  },
  runtime: {
    lastError: null
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
    console.log('🧪 Running Google Auth tests...\n');
    
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

  assertThrows(fn, message) {
    try {
      fn();
      throw new Error(message || 'Expected function to throw');
    } catch (error) {
      // Expected to throw
    }
  }
}

const test = new TestRunner();

// Mock global chrome object
global.chrome = mockChrome;

// Test GoogleAuthService instantiation
test.test('GoogleAuthService - instantiation', () => {
  const authService = new GoogleAuthService();
  test.assertEqual(authService.provider, 'google', 'Provider should be google');
  test.assertEqual(authService.isAuthenticating, false, 'Should not be authenticating initially');
});

// Test buildAuthUrl method
test.test('GoogleAuthService - buildAuthUrl', () => {
  const authService = new GoogleAuthService();
  const authUrl = authService.buildAuthUrl();
  
  test.assert(authUrl.includes('accounts.google.com'), 'Should contain Google OAuth URL');
  test.assert(authUrl.includes('client_id='), 'Should contain client_id parameter');
  test.assert(authUrl.includes('scope='), 'Should contain scope parameter');
  test.assert(authUrl.includes('response_type=code'), 'Should use authorization code flow');
});

// Test extractCodeFromUrl method
test.test('GoogleAuthService - extractCodeFromUrl success', () => {
  const authService = new GoogleAuthService();
  const responseUrl = 'https://extension-id.chromiumapp.org/?code=test_auth_code&state=test';
  
  const code = authService.extractCodeFromUrl(responseUrl);
  test.assertEqual(code, 'test_auth_code', 'Should extract authorization code correctly');
});

test.test('GoogleAuthService - extractCodeFromUrl with error', () => {
  const authService = new GoogleAuthService();
  const responseUrl = 'https://extension-id.chromiumapp.org/?error=access_denied';
  
  test.assertThrows(() => {
    authService.extractCodeFromUrl(responseUrl);
  }, 'Should throw error when OAuth error is present');
});

test.test('GoogleAuthService - extractCodeFromUrl without code', () => {
  const authService = new GoogleAuthService();
  const responseUrl = 'https://extension-id.chromiumapp.org/?state=test';
  
  test.assertThrows(() => {
    authService.extractCodeFromUrl(responseUrl);
  }, 'Should throw error when no code is present');
});

// Test validateAndStoreTokens method
test.test('GoogleAuthService - validateAndStoreTokens', async () => {
  const authService = new GoogleAuthService();
  
  // Mock chrome.storage.local.set
  let storedData = {};
  mockChrome.storage.local.set = async (data) => {
    Object.assign(storedData, data);
  };

  const tokenResponse = {
    access_token: 'test_access_token',
    refresh_token: 'test_refresh_token',
    expires_in: 3600,
    token_type: 'Bearer'
  };

  const tokens = await authService.validateAndStoreTokens(tokenResponse);
  
  test.assertEqual(tokens.accessToken, 'test_access_token', 'Should set access token');
  test.assertEqual(tokens.refreshToken, 'test_refresh_token', 'Should set refresh token');
  test.assertEqual(tokens.provider, 'google', 'Should set provider to google');
  test.assert(tokens.expiresAt > Date.now(), 'Should set future expiration time');
  test.assert(storedData.isAuthenticated, 'Should mark as authenticated in storage');
});

// Test getStoredTokens method
test.test('GoogleAuthService - getStoredTokens', async () => {
  const authService = new GoogleAuthService();
  
  const mockTokens = {
    accessToken: 'stored_access_token',
    refreshToken: 'stored_refresh_token',
    expiresAt: Date.now() + 3600000,
    provider: 'google'
  };

  // Mock chrome.storage.local.get
  mockChrome.storage.local.get = async (keys) => {
    return {
      authTokens: mockTokens,
      authProvider: 'google'
    };
  };

  const tokens = await authService.getStoredTokens();
  test.assertEqual(tokens.accessToken, 'stored_access_token', 'Should retrieve stored access token');
  test.assertEqual(tokens.provider, 'google', 'Should retrieve correct provider');
});

test.test('GoogleAuthService - getStoredTokens with no tokens', async () => {
  const authService = new GoogleAuthService();
  
  // Mock chrome.storage.local.get to return empty
  mockChrome.storage.local.get = async (keys) => {
    return {};
  };

  const tokens = await authService.getStoredTokens();
  test.assertEqual(tokens, null, 'Should return null when no tokens stored');
});

test.test('GoogleAuthService - getStoredTokens with wrong provider', async () => {
  const authService = new GoogleAuthService();
  
  // Mock chrome.storage.local.get to return GitHub tokens
  mockChrome.storage.local.get = async (keys) => {
    return {
      authTokens: { provider: 'github' },
      authProvider: 'github'
    };
  };

  const tokens = await authService.getStoredTokens();
  test.assertEqual(tokens, null, 'Should return null when provider mismatch');
});

// Test areTokensValid method
test.test('GoogleAuthService - areTokensValid with valid tokens', async () => {
  const authService = new GoogleAuthService();
  
  const validTokens = {
    accessToken: 'valid_token',
    expiresAt: Date.now() + 3600000, // 1 hour from now
    provider: 'google'
  };

  mockChrome.storage.local.get = async (keys) => {
    return {
      authTokens: validTokens,
      authProvider: 'google'
    };
  };

  const isValid = await authService.areTokensValid();
  test.assert(isValid, 'Should return true for valid tokens');
});

test.test('GoogleAuthService - areTokensValid with expired tokens', async () => {
  const authService = new GoogleAuthService();
  
  const expiredTokens = {
    accessToken: 'expired_token',
    expiresAt: Date.now() - 3600000, // 1 hour ago
    provider: 'google'
  };

  mockChrome.storage.local.get = async (keys) => {
    return {
      authTokens: expiredTokens,
      authProvider: 'google'
    };
  };

  const isValid = await authService.areTokensValid();
  test.assert(!isValid, 'Should return false for expired tokens without refresh token');
});

// Test signOut method
test.test('GoogleAuthService - signOut', async () => {
  const authService = new GoogleAuthService();
  
  let removedKeys = [];
  mockChrome.storage.local.remove = async (keys) => {
    removedKeys = keys;
  };

  mockChrome.storage.local.get = async (keys) => {
    return {
      authTokens: { accessToken: 'test_token' },
      authProvider: 'google'
    };
  };

  // Mock fetch for token revocation
  global.fetch = async (url, options) => {
    if (url.includes('revoke')) {
      return { ok: true };
    }
    throw new Error('Unexpected fetch call');
  };

  await authService.signOut();
  
  test.assert(removedKeys.includes('authTokens'), 'Should remove auth tokens');
  test.assert(removedKeys.includes('isAuthenticated'), 'Should remove authentication status');
  test.assert(removedKeys.includes('authProvider'), 'Should remove auth provider');
});

// Test error handling
test.test('GoogleAuthService - error handling in authenticate', async () => {
  const authService = new GoogleAuthService();
  
  // Mock failed OAuth flow
  mockChrome.identity.launchWebAuthFlow = (options, callback) => {
    mockChrome.runtime.lastError = { message: 'User cancelled' };
    callback(null);
  };

  try {
    await authService.authenticate();
    test.assert(false, 'Should have thrown an error');
  } catch (error) {
    test.assert(error.message.includes('User cancelled'), 'Should propagate OAuth error');
  }
});

// Export test runner for use in extension
export { test as googleAuthTests };

// Auto-run tests if this file is loaded directly
if (typeof window !== 'undefined' && window.location) {
  // Running in browser context
  test.run().then(success => {
    if (success) {
      console.log('🎉 All Google Auth tests passed!');
    } else {
      console.error('💥 Some Google Auth tests failed!');
    }
  });
}