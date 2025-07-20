// Google OAuth authentication service for Tab Sync Extension

import { log, createError, retryWithBackoff } from '../utils.js';
import { validateAuthTokens } from '../validation.js';

/**
 * Google OAuth configuration
 */
const GOOGLE_CONFIG = {
  clientId: 'YOUR_GOOGLE_CLIENT_ID', // To be replaced with actual client ID
  scopes: [
    'https://www.googleapis.com/auth/drive.file'
  ],
  redirectUri: chrome.identity.getRedirectURL(),
  responseType: 'code',
  accessType: 'offline',
  prompt: 'consent'
};

/**
 * Google OAuth service class
 */
export class GoogleAuthService {
  constructor() {
    this.provider = 'google';
    this.isAuthenticating = false;
  }

  /**
   * Initiate Google OAuth flow
   * @returns {Promise<AuthTokens>} Authentication tokens
   */
  async authenticate() {
    if (this.isAuthenticating) {
      throw createError('Authentication already in progress', 'AUTH_IN_PROGRESS');
    }

    this.isAuthenticating = true;
    log('info', 'Starting Google OAuth flow');

    try {
      // Step 1: Get authorization code
      const authCode = await this.getAuthorizationCode();
      
      // Step 2: Exchange code for tokens
      const tokens = await this.exchangeCodeForTokens(authCode);
      
      // Step 3: Validate and store tokens
      const validatedTokens = await this.validateAndStoreTokens(tokens);
      
      log('info', 'Google OAuth flow completed successfully');
      return validatedTokens;

    } catch (error) {
      log('error', 'Google OAuth flow failed', { error: error.message });
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
   * Build Google OAuth authorization URL
   * @returns {string} Authorization URL
   */
  buildAuthUrl() {
    const params = new URLSearchParams({
      client_id: GOOGLE_CONFIG.clientId,
      redirect_uri: GOOGLE_CONFIG.redirectUri,
      response_type: GOOGLE_CONFIG.responseType,
      scope: GOOGLE_CONFIG.scopes.join(' '),
      access_type: GOOGLE_CONFIG.accessType,
      prompt: GOOGLE_CONFIG.prompt
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Extract authorization code from response URL
   * @param {string} responseUrl - OAuth response URL
   * @returns {string} Authorization code
   */
  extractCodeFromUrl(responseUrl) {
    const url = new URL(responseUrl);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      throw createError(`OAuth error: ${error}`, 'OAUTH_ERROR', { error });
    }

    if (!code) {
      throw createError('No authorization code in response', 'OAUTH_NO_CODE');
    }

    return code;
  }

  /**
   * Exchange authorization code for access tokens
   * @param {string} authCode - Authorization code
   * @returns {Promise<Object>} Token response
   */
  async exchangeCodeForTokens(authCode) {
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    
    const requestBody = new URLSearchParams({
      client_id: GOOGLE_CONFIG.clientId,
      client_secret: 'YOUR_GOOGLE_CLIENT_SECRET', // Should be stored securely
      code: authCode,
      grant_type: 'authorization_code',
      redirect_uri: GOOGLE_CONFIG.redirectUri
    });

    try {
      const response = await retryWithBackoff(async () => {
        const res = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: requestBody.toString()
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

      return response;
    } catch (error) {
      log('error', 'Failed to exchange code for tokens', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate and store authentication tokens
   * @param {Object} tokenResponse - Token response from Google
   * @returns {Promise<AuthTokens>} Validated tokens
   */
  async validateAndStoreTokens(tokenResponse) {
    const tokens = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
      scopes: GOOGLE_CONFIG.scopes,
      provider: this.provider
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

    log('info', 'Google tokens validated and stored');
    return tokens;
  }

  /**
   * Refresh expired access token
   * @returns {Promise<AuthTokens>} Refreshed tokens
   */
  async refreshTokens() {
    try {
      const storage = await chrome.storage.local.get(['authTokens']);
      const currentTokens = storage.authTokens;

      if (!currentTokens || !currentTokens.refreshToken) {
        throw createError('No refresh token available', 'NO_REFRESH_TOKEN');
      }

      const refreshUrl = 'https://oauth2.googleapis.com/token';
      const requestBody = new URLSearchParams({
        client_id: GOOGLE_CONFIG.clientId,
        client_secret: 'YOUR_GOOGLE_CLIENT_SECRET',
        refresh_token: currentTokens.refreshToken,
        grant_type: 'refresh_token'
      });

      const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: requestBody.toString()
      });

      if (!response.ok) {
        throw createError(
          `Token refresh failed: ${response.status}`,
          'TOKEN_REFRESH_ERROR'
        );
      }

      const tokenData = await response.json();
      
      // Update tokens
      const refreshedTokens = {
        ...currentTokens,
        accessToken: tokenData.access_token,
        expiresAt: Date.now() + (tokenData.expires_in * 1000)
      };

      // If new refresh token provided, update it
      if (tokenData.refresh_token) {
        refreshedTokens.refreshToken = tokenData.refresh_token;
      }

      await chrome.storage.local.set({
        authTokens: refreshedTokens,
        lastTokenRefresh: Date.now()
      });

      log('info', 'Google tokens refreshed successfully');
      return refreshedTokens;

    } catch (error) {
      log('error', 'Failed to refresh Google tokens', { error: error.message });
      throw error;
    }
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
   * Check if tokens are valid and not expired
   * @returns {Promise<boolean>} True if tokens are valid
   */
  async areTokensValid() {
    try {
      const tokens = await this.getStoredTokens();
      
      if (!tokens) {
        return false;
      }

      // Check if tokens are expired (with 5 minute buffer)
      const bufferTime = 5 * 60 * 1000; // 5 minutes
      const isExpired = Date.now() >= (tokens.expiresAt - bufferTime);

      if (isExpired && tokens.refreshToken) {
        // Try to refresh tokens
        try {
          await this.refreshTokens();
          return true;
        } catch (error) {
          log('warn', 'Failed to refresh expired tokens', { error: error.message });
          return false;
        }
      }

      return !isExpired;
    } catch (error) {
      log('error', 'Failed to validate tokens', { error: error.message });
      return false;
    }
  }

  /**
   * Sign out and clear authentication data
   * @returns {Promise<void>}
   */
  async signOut() {
    try {
      const tokens = await this.getStoredTokens();
      
      // Revoke tokens with Google if available
      if (tokens && tokens.accessToken) {
        try {
          await this.revokeTokens(tokens.accessToken);
        } catch (error) {
          log('warn', 'Failed to revoke tokens with Google', { error: error.message });
        }
      }

      // Clear local storage
      await chrome.storage.local.remove([
        'authTokens',
        'isAuthenticated',
        'authProvider',
        'authTime',
        'lastTokenRefresh'
      ]);

      log('info', 'Google sign out completed');
    } catch (error) {
      log('error', 'Failed to sign out', { error: error.message });
      throw error;
    }
  }

  /**
   * Revoke tokens with Google
   * @param {string} accessToken - Access token to revoke
   * @returns {Promise<void>}
   */
  async revokeTokens(accessToken) {
    const revokeUrl = `https://oauth2.googleapis.com/revoke?token=${accessToken}`;
    
    const response = await fetch(revokeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!response.ok) {
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

      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`
        }
      });

      if (!response.ok) {
        throw createError(
          `Failed to get user profile: ${response.status}`,
          'PROFILE_FETCH_ERROR'
        );
      }

      const profile = await response.json();
      log('info', 'Retrieved Google user profile', { email: profile.email });
      
      return profile;
    } catch (error) {
      log('error', 'Failed to get user profile', { error: error.message });
      throw error;
    }
  }
}