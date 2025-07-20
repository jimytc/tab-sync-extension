// GitHub OAuth authentication service for Tab Sync Extension

import { log, createError, retryWithBackoff } from '../utils.js';
import { validateAuthTokens } from '../validation.js';

/**
 * GitHub OAuth configuration
 */
const GITHUB_CONFIG = {
  clientId: 'YOUR_GITHUB_CLIENT_ID', // To be replaced with actual client ID
  scopes: [
    'repo', // Access to private repositories for data storage
    'user:email' // Access to user email for identification
  ],
  redirectUri: chrome.identity.getRedirectURL(),
  responseType: 'code',
  state: null // Will be generated for each request
};

/**
 * GitHub OAuth service class
 */
export class GitHubAuthService {
  constructor() {
    this.provider = 'github';
    this.isAuthenticating = false;
  }

  /**
   * Initiate GitHub OAuth flow
   * @returns {Promise<AuthTokens>} Authentication tokens
   */
  async authenticate() {
    if (this.isAuthenticating) {
      throw createError('Authentication already in progress', 'AUTH_IN_PROGRESS');
    }

    this.isAuthenticating = true;
    log('info', 'Starting GitHub OAuth flow');

    try {
      // Step 1: Get authorization code
      const authCode = await this.getAuthorizationCode();
      
      // Step 2: Exchange code for tokens
      const tokens = await this.exchangeCodeForTokens(authCode);
      
      // Step 3: Validate and store tokens
      const validatedTokens = await this.validateAndStoreTokens(tokens);
      
      log('info', 'GitHub OAuth flow completed successfully');
      return validatedTokens;

    } catch (error) {
      log('error', 'GitHub OAuth flow failed', { error: error.message });
      throw error;
    } finally {
      this.isAuthenticating = false;
    }
  }

  /**
   * Get authorization code using Chrome Identity API
   * @returns {Promise<string>} Authorization code
   */
  async getAuthorizationCode() {
    return new Promise((resolve, reject) => {
      const authUrl = this.buildAuthUrl();
      
      chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      }, (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(createError(
            chrome.runtime.lastError.message,
            'OAUTH_FLOW_ERROR'
          ));
          return;
        }

        if (!responseUrl) {
          reject(createError('No response URL received', 'OAUTH_NO_RESPONSE'));
          return;
        }

        try {
          const code = this.extractCodeFromUrl(responseUrl);
          resolve(code);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Build GitHub OAuth authorization URL
   * @returns {string} Authorization URL
   */
  buildAuthUrl() {
    // Generate random state for CSRF protection
    const state = this.generateState();
    GITHUB_CONFIG.state = state;

    const params = new URLSearchParams({
      client_id: GITHUB_CONFIG.clientId,
      redirect_uri: GITHUB_CONFIG.redirectUri,
      scope: GITHUB_CONFIG.scopes.join(' '),
      state: state,
      allow_signup: 'true'
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /**
   * Generate random state for CSRF protection
   * @returns {string} Random state string
   */
  generateState() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Extract authorization code from response URL
   * @param {string} responseUrl - OAuth response URL
   * @returns {string} Authorization code
   */
  extractCodeFromUrl(responseUrl) {
    const url = new URL(responseUrl);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    if (error) {
      const message = errorDescription || error;
      throw createError(`OAuth error: ${message}`, 'OAUTH_ERROR', { error, errorDescription });
    }

    if (!code) {
      throw createError('No authorization code in response', 'OAUTH_NO_CODE');
    }

    // Verify state parameter for CSRF protection
    if (state !== GITHUB_CONFIG.state) {
      throw createError('Invalid state parameter', 'OAUTH_INVALID_STATE');
    }

    return code;
  }

  /**
   * Exchange authorization code for access tokens
   * @param {string} authCode - Authorization code
   * @returns {Promise<Object>} Token response
   */
  async exchangeCodeForTokens(authCode) {
    const tokenUrl = 'https://github.com/login/oauth/access_token';
    
    const requestBody = {
      client_id: GITHUB_CONFIG.clientId,
      client_secret: 'YOUR_GITHUB_CLIENT_SECRET', // Should be stored securely
      code: authCode,
      redirect_uri: GITHUB_CONFIG.redirectUri
    };

    try {
      const response = await retryWithBackoff(async () => {
        const res = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Tab-Sync-Extension/1.0'
          },
          body: JSON.stringify(requestBody)
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw createError(
            `Token exchange failed: ${res.status}`,
            'TOKEN_EXCHANGE_ERROR',
            { status: res.status, error: errorData }
          );
        }

        return res.json();
      });

      // Check for GitHub API errors
      if (response.error) {
        throw createError(
          `GitHub API error: ${response.error_description || response.error}`,
          'GITHUB_API_ERROR',
          response
        );
      }

      return response;
    } catch (error) {
      log('error', 'Failed to exchange code for tokens', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate and store authentication tokens
   * @param {Object} tokenResponse - Token response from GitHub
   * @returns {Promise<AuthTokens>} Validated tokens
   */
  async validateAndStoreTokens(tokenResponse) {
    const tokens = {
      accessToken: tokenResponse.access_token,
      refreshToken: null, // GitHub doesn't provide refresh tokens for OAuth apps
      expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000), // GitHub tokens don't expire, set to 1 year
      scopes: tokenResponse.scope ? tokenResponse.scope.split(',') : GITHUB_CONFIG.scopes,
      provider: this.provider,
      tokenType: tokenResponse.token_type || 'bearer'
    };

    // Validate token structure
    const validation = validateAuthTokens(tokens);
    if (!validation.isValid) {
      throw createError(
        'Invalid token structure',
        'TOKEN_VALIDATION_ERROR',
        { errors: validation.errors }
      );
    }

    // Store tokens securely
    await chrome.storage.local.set({
      authTokens: tokens,
      isAuthenticated: true,
      authProvider: this.provider,
      authTime: Date.now()
    });

    log('info', 'GitHub tokens validated and stored');
    return tokens;
  }

  /**
   * GitHub doesn't support token refresh for OAuth apps
   * This method will re-authenticate instead
   * @returns {Promise<AuthTokens>} New tokens
   */
  async refreshTokens() {
    log('info', 'GitHub tokens cannot be refreshed, re-authenticating');
    return await this.authenticate();
  }

  /**
   * Get stored authentication tokens
   * @returns {Promise<AuthTokens|null>} Stored tokens or null
   */
  async getStoredTokens() {
    try {
      const storage = await chrome.storage.local.get(['authTokens', 'authProvider']);
      
      if (!storage.authTokens || storage.authProvider !== this.provider) {
        return null;
      }

      return storage.authTokens;
    } catch (error) {
      log('error', 'Failed to get stored tokens', { error: error.message });
      return null;
    }
  }

  /**
   * Check if tokens are valid
   * GitHub tokens don't expire, so we just check if they exist and work
   * @returns {Promise<boolean>} True if tokens are valid
   */
  async areTokensValid() {
    try {
      const tokens = await this.getStoredTokens();
      
      if (!tokens) {
        return false;
      }

      // Test token by making a simple API call
      try {
        await this.testTokenValidity(tokens.accessToken);
        return true;
      } catch (error) {
        log('warn', 'GitHub token validation failed', { error: error.message });
        return false;
      }
    } catch (error) {
      log('error', 'Failed to validate tokens', { error: error.message });
      return false;
    }
  }

  /**
   * Test token validity by making a simple API call
   * @param {string} accessToken - Access token to test
   * @returns {Promise<void>}
   */
  async testTokenValidity(accessToken) {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Tab-Sync-Extension/1.0'
      }
    });

    if (!response.ok) {
      throw createError(
        `Token validation failed: ${response.status}`,
        'TOKEN_VALIDATION_FAILED'
      );
    }
  }

  /**
   * Sign out and clear authentication data
   * @returns {Promise<void>}
   */
  async signOut() {
    try {
      const tokens = await this.getStoredTokens();
      
      // Revoke tokens with GitHub if available
      if (tokens && tokens.accessToken) {
        try {
          await this.revokeTokens(tokens.accessToken);
        } catch (error) {
          log('warn', 'Failed to revoke tokens with GitHub', { error: error.message });
        }
      }

      // Clear local storage
      await chrome.storage.local.remove([
        'authTokens',
        'isAuthenticated',
        'authProvider',
        'authTime'
      ]);

      log('info', 'GitHub sign out completed');
    } catch (error) {
      log('error', 'Failed to sign out', { error: error.message });
      throw error;
    }
  }

  /**
   * Revoke tokens with GitHub
   * @param {string} accessToken - Access token to revoke
   * @returns {Promise<void>}
   */
  async revokeTokens(accessToken) {
    const revokeUrl = `https://api.github.com/applications/${GITHUB_CONFIG.clientId}/token`;
    
    // GitHub requires basic auth with client credentials for token revocation
    const credentials = btoa(`${GITHUB_CONFIG.clientId}:YOUR_GITHUB_CLIENT_SECRET`);
    
    const response = await fetch(revokeUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Tab-Sync-Extension/1.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        access_token: accessToken
      })
    });

    if (!response.ok && response.status !== 404) {
      // 404 is acceptable - token might already be revoked
      throw createError(
        `Token revocation failed: ${response.status}`,
        'TOKEN_REVOKE_ERROR'
      );
    }
  }

  /**
   * Get user profile information
   * @returns {Promise<Object>} User profile data
   */
  async getUserProfile() {
    try {
      const tokens = await this.getStoredTokens();
      
      if (!tokens || !(await this.areTokensValid())) {
        throw createError('No valid authentication tokens', 'NO_VALID_TOKENS');
      }

      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Tab-Sync-Extension/1.0'
        }
      });

      if (!response.ok) {
        throw createError(
          `Failed to get user profile: ${response.status}`,
          'PROFILE_FETCH_ERROR'
        );
      }

      const profile = await response.json();
      log('info', 'Retrieved GitHub user profile', { login: profile.login });
      
      return profile;
    } catch (error) {
      log('error', 'Failed to get user profile', { error: error.message });
      throw error;
    }
  }

  /**
   * Get user's primary email address
   * @returns {Promise<string>} Primary email address
   */
  async getUserEmail() {
    try {
      const tokens = await this.getStoredTokens();
      
      if (!tokens || !(await this.areTokensValid())) {
        throw createError('No valid authentication tokens', 'NO_VALID_TOKENS');
      }

      const response = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Tab-Sync-Extension/1.0'
        }
      });

      if (!response.ok) {
        throw createError(
          `Failed to get user emails: ${response.status}`,
          'EMAIL_FETCH_ERROR'
        );
      }

      const emails = await response.json();
      const primaryEmail = emails.find(email => email.primary);
      
      return primaryEmail ? primaryEmail.email : emails[0]?.email || null;
    } catch (error) {
      log('error', 'Failed to get user email', { error: error.message });
      throw error;
    }
  }

  /**
   * Create a private repository for storing sync data
   * @param {string} repoName - Repository name
   * @returns {Promise<Object>} Repository data
   */
  async createSyncRepository(repoName = 'tab-sync-data') {
    try {
      const tokens = await this.getStoredTokens();
      
      if (!tokens || !(await this.areTokensValid())) {
        throw createError('No valid authentication tokens', 'NO_VALID_TOKENS');
      }

      const response = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Tab-Sync-Extension/1.0',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: repoName,
          description: 'Private repository for Tab Sync Extension data storage',
          private: true,
          auto_init: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw createError(
          `Failed to create repository: ${response.status}`,
          'REPO_CREATE_ERROR',
          errorData
        );
      }

      const repo = await response.json();
      log('info', 'Created GitHub sync repository', { name: repo.name, url: repo.html_url });
      
      return repo;
    } catch (error) {
      log('error', 'Failed to create sync repository', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if sync repository exists
   * @param {string} repoName - Repository name
   * @returns {Promise<Object|null>} Repository data or null if not found
   */
  async getSyncRepository(repoName = 'tab-sync-data') {
    try {
      const tokens = await this.getStoredTokens();
      
      if (!tokens || !(await this.areTokensValid())) {
        throw createError('No valid authentication tokens', 'NO_VALID_TOKENS');
      }

      const profile = await this.getUserProfile();
      const response = await fetch(`https://api.github.com/repos/${profile.login}/${repoName}`, {
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Tab-Sync-Extension/1.0'
        }
      });

      if (response.status === 404) {
        return null; // Repository doesn't exist
      }

      if (!response.ok) {
        throw createError(
          `Failed to get repository: ${response.status}`,
          'REPO_GET_ERROR'
        );
      }

      return await response.json();
    } catch (error) {
      log('error', 'Failed to get sync repository', { error: error.message });
      throw error;
    }
  }
}