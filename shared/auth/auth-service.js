// Unified authentication service for Tab Sync Extension
// Supports both Google and GitHub OAuth providers

import { GoogleAuthService } from './google-auth.js';
import { GitHubAuthService } from './github-auth.js';
import { log, createError } from '../utils.js';
import { errorHandler, ErrorCategory, ErrorSeverity, withErrorHandling } from '../error-handler.js';

/**
 * Unified authentication service class
 */
export class AuthService {
  constructor() {
    this.providers = {
      google: new GoogleAuthService(),
      github: new GitHubAuthService()
    };
    this.currentProvider = null;
  }

  /**
   * Initialize the auth service and detect current provider
   * @returns {Promise<void>}
   */
  async initialize() {
    return withErrorHandling(async () => {
      const storage = await chrome.storage.local.get(['authProvider', 'isAuthenticated']);
      
      if (storage.isAuthenticated && storage.authProvider) {
        this.currentProvider = storage.authProvider;
        log('info', 'Auth service initialized', { provider: this.currentProvider });
      } else {
        log('info', 'Auth service initialized - no active authentication');
      }
    }, {
      category: ErrorCategory.AUTHENTICATION,
      severity: ErrorSeverity.HIGH,
      source: 'auth_service_initialize',
      recoverable: true
    })();
  }

  /**
   * Authenticate with specified provider
   * @param {string} provider - Provider name ('google' or 'github')
   * @returns {Promise<AuthTokens>} Authentication tokens
   */
  async authenticate(provider) {
    if (!this.isValidProvider(provider)) {
      const error = createError(`Invalid provider: ${provider}`, 'INVALID_PROVIDER');
      await errorHandler.handleError(error, {
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.MEDIUM,
        source: 'auth_service_authenticate',
        context: { provider },
        recoverable: false
      });
      throw error;
    }

    return withErrorHandling(async () => {
      log('info', 'Starting authentication', { provider });
      
      const authService = this.providers[provider];
      const tokens = await authService.authenticate();
      
      this.currentProvider = provider;
      
      // Store provider info and update authentication status
      await chrome.storage.local.set({
        authProvider: provider,
        isAuthenticated: true,
        authTime: Date.now()
      });

      log('info', 'Authentication completed successfully', { provider });
      return tokens;
    }, {
      category: ErrorCategory.AUTHENTICATION,
      severity: ErrorSeverity.HIGH,
      source: 'auth_service_authenticate',
      context: { provider },
      recoverable: true,
      userVisible: true
    })();
  }

  /**
   * Sign out from current provider
   * @returns {Promise<void>}
   */
  async signOut() {
    return withErrorHandling(async () => {
      if (!this.currentProvider) {
        const storage = await chrome.storage.local.get(['authProvider']);
        this.currentProvider = storage.authProvider;
      }

      if (!this.currentProvider) {
        log('warn', 'No active authentication to sign out from');
        return;
      }

      log('info', 'Starting sign out', { provider: this.currentProvider });
      
      const authService = this.providers[this.currentProvider];
      await authService.signOut();
      
      // Clear unified auth state
      await chrome.storage.local.remove([
        'authProvider',
        'isAuthenticated',
        'authTime',
        'lastTokenRefresh'
      ]);

      this.currentProvider = null;
      
      log('info', 'Sign out completed successfully');
    }, {
      category: ErrorCategory.AUTHENTICATION,
      severity: ErrorSeverity.MEDIUM,
      source: 'auth_service_signout',
      recoverable: true,
      userVisible: true
    })();
  }

  /**
   * Get current authentication status
   * @returns {Promise<Object>} Authentication status
   */
  async getAuthStatus() {
    return withErrorHandling(async () => {
      const storage = await chrome.storage.local.get([
        'isAuthenticated',
        'authProvider',
        'authTime',
        'lastTokenRefresh'
      ]);

      if (!storage.isAuthenticated || !storage.authProvider) {
        return {
          isAuthenticated: false,
          provider: null,
          authTime: null,
          tokensValid: false
        };
      }

      // Check if tokens are still valid
      const authService = this.providers[storage.authProvider];
      const tokensValid = await authService.areTokensValid();

      return {
        isAuthenticated: storage.isAuthenticated,
        provider: storage.authProvider,
        authTime: storage.authTime,
        lastTokenRefresh: storage.lastTokenRefresh,
        tokensValid
      };
    }, {
      category: ErrorCategory.AUTHENTICATION,
      severity: ErrorSeverity.MEDIUM,
      source: 'auth_service_get_status',
      recoverable: true
    })().catch(error => {
      // Return safe default on error
      return {
        isAuthenticated: false,
        provider: null,
        authTime: null,
        tokensValid: false,
        error: error.message
      };
    });
  }

  /**
   * Get stored authentication tokens for current provider
   * @returns {Promise<AuthTokens|null>} Stored tokens or null
   */
  async getStoredTokens() {
    return withErrorHandling(async () => {
      if (!this.currentProvider) {
        const storage = await chrome.storage.local.get(['authProvider']);
        this.currentProvider = storage.authProvider;
      }

      if (!this.currentProvider) {
        return null;
      }

      const authService = this.providers[this.currentProvider];
      return await authService.getStoredTokens();
    }, {
      category: ErrorCategory.AUTHENTICATION,
      severity: ErrorSeverity.LOW,
      source: 'auth_service_get_tokens',
      recoverable: true
    })().catch(error => {
      // Return null on error for graceful degradation
      return null;
    });
  }

  /**
   * Refresh authentication tokens for current provider
   * @returns {Promise<AuthTokens>} Refreshed tokens
   */
  async refreshTokens() {
    return withErrorHandling(async () => {
      if (!this.currentProvider) {
        const storage = await chrome.storage.local.get(['authProvider']);
        this.currentProvider = storage.authProvider;
      }

      if (!this.currentProvider) {
        throw createError('No active authentication to refresh', 'NO_ACTIVE_AUTH');
      }

      log('info', 'Refreshing tokens', { provider: this.currentProvider });
      
      const authService = this.providers[this.currentProvider];
      const tokens = await authService.refreshTokens();
      
      // Update last refresh time
      await chrome.storage.local.set({
        lastTokenRefresh: Date.now()
      });

      log('info', 'Tokens refreshed successfully', { provider: this.currentProvider });
      return tokens;
    }, {
      category: ErrorCategory.AUTHENTICATION,
      severity: ErrorSeverity.HIGH,
      source: 'auth_service_refresh_tokens',
      recoverable: true,
      userVisible: true
    })();
  }

  /**
   * Get user profile from current provider
   * @returns {Promise<Object>} User profile data
   */
  async getUserProfile() {
    return withErrorHandling(async () => {
      if (!this.currentProvider) {
        const storage = await chrome.storage.local.get(['authProvider']);
        this.currentProvider = storage.authProvider;
      }

      if (!this.currentProvider) {
        throw createError('No active authentication', 'NO_ACTIVE_AUTH');
      }

      const authService = this.providers[this.currentProvider];
      const profile = await authService.getUserProfile();
      
      // Normalize profile data across providers
      return this.normalizeProfile(profile, this.currentProvider);
    }, {
      category: ErrorCategory.AUTHENTICATION,
      severity: ErrorSeverity.MEDIUM,
      source: 'auth_service_get_profile',
      recoverable: true,
      userVisible: true
    })();
  }

  /**
   * Normalize user profile data across different providers
   * @param {Object} profile - Raw profile data from provider
   * @param {string} provider - Provider name
   * @returns {Object} Normalized profile data
   */
  normalizeProfile(profile, provider) {
    const normalized = {
      provider,
      id: null,
      name: null,
      email: null,
      avatar: null,
      username: null,
      raw: profile
    };

    switch (provider) {
      case 'google':
        normalized.id = profile.id;
        normalized.name = profile.name;
        normalized.email = profile.email;
        normalized.avatar = profile.picture;
        normalized.username = profile.email?.split('@')[0];
        break;

      case 'github':
        normalized.id = profile.id;
        normalized.name = profile.name || profile.login;
        normalized.email = profile.email;
        normalized.avatar = profile.avatar_url;
        normalized.username = profile.login;
        break;

      default:
        log('warn', 'Unknown provider for profile normalization', { provider });
    }

    return normalized;
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
   * Check if currently authenticated
   * @returns {Promise<boolean>} True if authenticated
   */
  async isAuthenticated() {
    const status = await this.getAuthStatus();
    return status.isAuthenticated && status.tokensValid;
  }

  /**
   * Validate authentication and refresh tokens if needed
   * @returns {Promise<boolean>} True if authentication is valid
   */
  async validateAuthentication() {
    try {
      const status = await this.getAuthStatus();
      
      if (!status.isAuthenticated) {
        return false;
      }

      if (!status.tokensValid) {
        // Try to refresh tokens
        try {
          await this.refreshTokens();
          return true;
        } catch (error) {
          log('warn', 'Failed to refresh tokens during validation', { error: error.message });
          return false;
        }
      }

      return true;
    } catch (error) {
      log('error', 'Failed to validate authentication', { error: error.message });
      return false;
    }
  }

  /**
   * Clear all authentication data (emergency cleanup)
   * @returns {Promise<void>}
   */
  async clearAllAuthData() {
    try {
      log('info', 'Clearing all authentication data');
      
      // Clear Chrome storage
      await chrome.storage.local.remove([
        'authTokens',
        'authProvider',
        'isAuthenticated',
        'authTime',
        'lastTokenRefresh'
      ]);

      this.currentProvider = null;
      
      log('info', 'All authentication data cleared');

    } catch (error) {
      log('error', 'Failed to clear authentication data', { error: error.message });
      throw error;
    }
  }

  /**
   * Get authentication statistics
   * @returns {Promise<Object>} Authentication statistics
   */
  async getAuthStats() {
    try {
      const storage = await chrome.storage.local.get([
        'authTime',
        'lastTokenRefresh',
        'authProvider'
      ]);

      const now = Date.now();
      const authAge = storage.authTime ? now - storage.authTime : null;
      const lastRefreshAge = storage.lastTokenRefresh ? now - storage.lastTokenRefresh : null;

      return {
        provider: storage.authProvider || null,
        authTime: storage.authTime || null,
        authAge,
        lastTokenRefresh: storage.lastTokenRefresh || null,
        lastRefreshAge,
        isAuthenticated: await this.isAuthenticated()
      };

    } catch (error) {
      log('error', 'Failed to get auth stats', { error: error.message });
      return {
        provider: null,
        authTime: null,
        authAge: null,
        lastTokenRefresh: null,
        lastRefreshAge: null,
        isAuthenticated: false,
        error: error.message
      };
    }
  }
}

// Create singleton instance
export const authService = new AuthService();