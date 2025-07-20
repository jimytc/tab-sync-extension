// GitHub storage adapter for Tab Sync Extension

import { log, createError, retryWithBackoff, generateChecksum } from '../utils.js';
import { GitHubAuthService } from '../auth/github-auth.js';

/**
 * GitHub storage adapter using private repositories
 */
export class GitHubStorage {
  constructor() {
    this.provider = 'github';
    this.authService = new GitHubAuthService();
    this.baseUrl = 'https://api.github.com';
    this.repoName = 'tab-sync-data';
    this.repoOwner = null;
    this.repoFullName = null;
    this.defaultBranch = 'main';
  }

  /**
   * Initialize the storage adapter
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Ensure we have valid authentication
      const isValid = await this.authService.areTokensValid();
      if (!isValid) {
        throw createError('No valid authentication tokens', 'NO_VALID_AUTH');
      }

      // Get user profile to determine repo owner
      const profile = await this.authService.getUserProfile();
      this.repoOwner = profile.login;
      this.repoFullName = `${this.repoOwner}/${this.repoName}`;

      // Ensure sync repository exists
      await this.ensureSyncRepository();
      
      log('info', 'GitHub storage initialized', { 
        provider: this.provider,
        repository: this.repoFullName 
      });
    } catch (error) {
      log('error', 'Failed to initialize GitHub storage', { error: error.message });
      throw error;
    }
  }

  /**
   * Store sync data to GitHub repository
   * @param {string} fileName - File name to store
   * @param {Object} data - Data to store
   * @param {Object} options - Storage options
   * @returns {Promise<Object>} Storage result
   */
  async store(fileName, data, options = {}) {
    try {
      const { 
        encrypt = false,
        compress = false,
        commitMessage = null 
      } = options;

      // Prepare data for storage
      const processedData = await this.prepareDataForStorage(data, { encrypt, compress });
      const content = btoa(processedData); // Base64 encode for GitHub API

      // Check if file already exists
      const existingFile = await this.getFile(fileName);
      
      let result;
      const message = commitMessage || `Update ${fileName} - ${new Date().toISOString()}`;

      if (existingFile) {
        // Update existing file
        result = await this.updateFile(fileName, content, existingFile.sha, message);
        log('info', 'Updated file in GitHub repository', { fileName, sha: result.sha });
      } else {
        // Create new file
        result = await this.createFile(fileName, content, message);
        log('info', 'Created file in GitHub repository', { fileName, sha: result.sha });
      }

      return {
        success: true,
        sha: result.sha,
        fileName: fileName,
        size: processedData.length,
        timestamp: Date.now(),
        checksum: await generateChecksum(JSON.stringify(data)),
        commitUrl: result.commit?.html_url
      };
    } catch (error) {
      log('error', 'Failed to store data to GitHub', { 
        fileName, 
        error: error.message 
      });
      throw createError('GitHub storage failed', 'STORAGE_ERROR', { fileName, error });
    }
  }

  /**
   * Retrieve data from GitHub repository
   * @param {string} fileName - File name to retrieve
   * @param {Object} options - Retrieval options
   * @returns {Promise<Object>} Retrieved data
   */
  async retrieve(fileName, options = {}) {
    try {
      const { 
        decrypt = false,
        decompress = false,
        validateChecksum = true,
        ref = null // Specific commit/branch/tag
      } = options;

      // Get file from repository
      const file = await this.getFile(fileName, ref);
      if (!file) {
        throw createError(`File not found: ${fileName}`, 'FILE_NOT_FOUND', { fileName });
      }

      // Decode content from base64
      const content = atob(file.content);
      
      // Process retrieved data
      const processedData = await this.processRetrievedData(content, { decrypt, decompress });
      
      // Validate checksum if requested
      if (validateChecksum && processedData.checksum) {
        const calculatedChecksum = await generateChecksum(JSON.stringify(processedData.data));
        if (calculatedChecksum !== processedData.checksum) {
          log('warn', 'Checksum validation failed', { 
            fileName, 
            expected: processedData.checksum, 
            actual: calculatedChecksum 
          });
        }
      }

      log('info', 'Retrieved data from GitHub repository', { 
        fileName, 
        sha: file.sha,
        size: file.size 
      });

      return {
        success: true,
        data: processedData.data || processedData,
        metadata: {
          sha: file.sha,
          fileName: fileName,
          size: file.size,
          lastModified: file.lastModified,
          checksum: processedData.checksum,
          downloadUrl: file.download_url
        }
      };
    } catch (error) {
      log('error', 'Failed to retrieve data from GitHub', { 
        fileName, 
        error: error.message 
      });
      throw createError('GitHub retrieval failed', 'RETRIEVAL_ERROR', { fileName, error });
    }
  }

  /**
   * List files in the repository
   * @param {Object} options - List options
   * @returns {Promise<Object[]>} Array of file metadata
   */
  async listFiles(options = {}) {
    try {
      const { 
        path = '',
        ref = null,
        pattern = null 
      } = options;

      const url = `${this.baseUrl}/repos/${this.repoFullName}/contents/${path}`;
      const params = new URLSearchParams();
      if (ref) params.append('ref', ref);

      const response = await this.makeAuthenticatedRequest(
        `${url}${params.toString() ? '?' + params.toString() : ''}`
      );

      let files = Array.isArray(response) ? response : [response];
      
      // Filter by pattern if provided
      if (pattern) {
        const regex = new RegExp(pattern, 'i');
        files = files.filter(file => regex.test(file.name));
      }

      // Filter to only files (not directories)
      files = files.filter(file => file.type === 'file');

      log('info', 'Listed files from GitHub repository', { 
        count: files.length,
        path: path || 'root',
        pattern: pattern || 'all' 
      });

      return files.map(file => ({
        name: file.name,
        path: file.path,
        sha: file.sha,
        size: file.size,
        type: file.type,
        downloadUrl: file.download_url,
        htmlUrl: file.html_url
      }));
    } catch (error) {
      log('error', 'Failed to list files from GitHub', { error: error.message });
      throw createError('GitHub list failed', 'LIST_ERROR', { error });
    }
  }

  /**
   * Delete file from GitHub repository
   * @param {string} fileName - File name to delete
   * @param {string} commitMessage - Commit message for deletion
   * @returns {Promise<Object>} Deletion result
   */
  async deleteFile(fileName, commitMessage = null) {
    try {
      const file = await this.getFile(fileName);
      if (!file) {
        log('warn', 'File not found for deletion', { fileName });
        return { success: true, message: 'File not found' };
      }

      const message = commitMessage || `Delete ${fileName} - ${new Date().toISOString()}`;
      
      const response = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/repos/${this.repoFullName}/contents/${fileName}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: message,
            sha: file.sha
          })
        }
      );

      log('info', 'Deleted file from GitHub repository', { 
        fileName, 
        sha: file.sha,
        commitSha: response.commit?.sha 
      });

      return {
        success: true,
        sha: file.sha,
        fileName: fileName,
        timestamp: Date.now(),
        commitUrl: response.commit?.html_url
      };
    } catch (error) {
      log('error', 'Failed to delete file from GitHub', { 
        fileName, 
        error: error.message 
      });
      throw createError('GitHub deletion failed', 'DELETE_ERROR', { fileName, error });
    }
  }

  /**
   * Get repository information and statistics
   * @returns {Promise<Object>} Repository info
   */
  async getRepositoryInfo() {
    try {
      const response = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/repos/${this.repoFullName}`
      );

      return {
        name: response.name,
        fullName: response.full_name,
        description: response.description,
        private: response.private,
        size: response.size, // Size in KB
        defaultBranch: response.default_branch,
        createdAt: response.created_at,
        updatedAt: response.updated_at,
        htmlUrl: response.html_url,
        cloneUrl: response.clone_url,
        owner: response.owner?.login
      };
    } catch (error) {
      log('error', 'Failed to get repository info', { error: error.message });
      throw createError('GitHub repository info failed', 'REPO_INFO_ERROR', { error });
    }
  }

  /**
   * Get commit history for the repository
   * @param {Object} options - History options
   * @returns {Promise<Object[]>} Array of commits
   */
  async getCommitHistory(options = {}) {
    try {
      const { 
        path = null,
        since = null,
        until = null,
        per_page = 30 
      } = options;

      const params = new URLSearchParams();
      if (path) params.append('path', path);
      if (since) params.append('since', since);
      if (until) params.append('until', until);
      params.append('per_page', per_page.toString());

      const response = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/repos/${this.repoFullName}/commits?${params.toString()}`
      );

      return response.map(commit => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.commit.author.name,
        date: commit.commit.author.date,
        htmlUrl: commit.html_url,
        stats: commit.stats
      }));
    } catch (error) {
      log('error', 'Failed to get commit history', { error: error.message });
      throw createError('GitHub commit history failed', 'COMMIT_HISTORY_ERROR', { error });
    }
  }

  /**
   * Ensure sync repository exists
   * @returns {Promise<void>}
   */
  async ensureSyncRepository() {
    try {
      // Check if repository exists
      const existingRepo = await this.authService.getSyncRepository(this.repoName);
      
      if (!existingRepo) {
        // Create new repository
        const newRepo = await this.authService.createSyncRepository(this.repoName);
        log('info', 'Created new sync repository', { 
          name: newRepo.name, 
          url: newRepo.html_url 
        });
      } else {
        log('info', 'Using existing sync repository', { 
          name: existingRepo.name, 
          url: existingRepo.html_url 
        });
      }
    } catch (error) {
      log('error', 'Failed to ensure sync repository', { error: error.message });
      throw error;
    }
  }

  /**
   * Get file from repository
   * @param {string} fileName - File name
   * @param {string} ref - Git reference (branch, commit, tag)
   * @returns {Promise<Object|null>} File data or null
   */
  async getFile(fileName, ref = null) {
    try {
      const url = `${this.baseUrl}/repos/${this.repoFullName}/contents/${fileName}`;
      const params = new URLSearchParams();
      if (ref) params.append('ref', ref);

      const response = await this.makeAuthenticatedRequest(
        `${url}${params.toString() ? '?' + params.toString() : ''}`
      );

      return {
        name: response.name,
        path: response.path,
        sha: response.sha,
        size: response.size,
        content: response.content.replace(/\n/g, ''), // Remove newlines from base64
        encoding: response.encoding,
        download_url: response.download_url,
        html_url: response.html_url
      };
    } catch (error) {
      if (error.message.includes('404')) {
        return null; // File not found
      }
      throw error;
    }
  }

  /**
   * Create new file in repository
   * @param {string} fileName - File name
   * @param {string} content - Base64 encoded content
   * @param {string} message - Commit message
   * @returns {Promise<Object>} Created file info
   */
  async createFile(fileName, content, message) {
    try {
      const response = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/repos/${this.repoFullName}/contents/${fileName}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: message,
            content: content,
            branch: this.defaultBranch
          })
        }
      );

      return {
        sha: response.content.sha,
        commit: response.commit
      };
    } catch (error) {
      log('error', 'Failed to create file', { fileName, error: error.message });
      throw error;
    }
  }

  /**
   * Update existing file in repository
   * @param {string} fileName - File name
   * @param {string} content - Base64 encoded content
   * @param {string} sha - Current file SHA
   * @param {string} message - Commit message
   * @returns {Promise<Object>} Updated file info
   */
  async updateFile(fileName, content, sha, message) {
    try {
      const response = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/repos/${this.repoFullName}/contents/${fileName}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: message,
            content: content,
            sha: sha,
            branch: this.defaultBranch
          })
        }
      );

      return {
        sha: response.content.sha,
        commit: response.commit
      };
    } catch (error) {
      log('error', 'Failed to update file', { fileName, error: error.message });
      throw error;
    }
  }

  /**
   * Make authenticated request to GitHub API
   * @param {string} url - API URL
   * @param {Object} options - Request options
   * @returns {Promise<Object>} API response
   */
  async makeAuthenticatedRequest(url, options = {}) {
    return await retryWithBackoff(async () => {
      const tokens = await this.authService.getStoredTokens();
      if (!tokens) {
        throw createError('No authentication tokens available', 'NO_AUTH_TOKENS');
      }

      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Tab-Sync-Extension/1.0',
          ...options.headers
        }
      });

      if (response.status === 401) {
        // Token might be invalid, GitHub tokens don't expire but can be revoked
        throw createError('GitHub authentication failed', 'AUTH_FAILED');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw createError(
          `GitHub API error: ${response.status}`,
          'API_ERROR',
          { status: response.status, error: errorData }
        );
      }

      return await response.json();
    }, 3, 1000);
  }

  /**
   * Prepare data for storage (encryption, compression, etc.)
   * @param {Object} data - Data to prepare
   * @param {Object} options - Preparation options
   * @returns {Promise<string>} Prepared data
   */
  async prepareDataForStorage(data, options = {}) {
    let processedData = JSON.stringify(data, null, 2); // Pretty print for GitHub

    // Add compression if requested
    if (options.compress) {
      // Simple compression placeholder - in real implementation, use proper compression
      log('info', 'Compression requested but not implemented');
    }

    // Add encryption if requested
    if (options.encrypt) {
      // Encryption placeholder - in real implementation, use proper encryption
      log('info', 'Encryption requested but not implemented');
    }

    return processedData;
  }

  /**
   * Process retrieved data (decryption, decompression, etc.)
   * @param {string} content - Raw content
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processed data
   */
  async processRetrievedData(content, options = {}) {
    let processedContent = content;

    // Handle decryption if needed
    if (options.decrypt) {
      // Decryption placeholder
      log('info', 'Decryption requested but not implemented');
    }

    // Handle decompression if needed
    if (options.decompress) {
      // Decompression placeholder
      log('info', 'Decompression requested but not implemented');
    }

    try {
      return JSON.parse(processedContent);
    } catch (error) {
      log('warn', 'Failed to parse JSON content, returning as string', { error: error.message });
      return processedContent;
    }
  }

  /**
   * Test storage connectivity
   * @returns {Promise<Object>} Test result
   */
  async testConnection() {
    try {
      const repoInfo = await this.getRepositoryInfo();
      
      return {
        success: true,
        provider: this.provider,
        repository: repoInfo.fullName,
        private: repoInfo.private,
        size: repoInfo.size,
        owner: repoInfo.owner
      };
    } catch (error) {
      return {
        success: false,
        provider: this.provider,
        error: error.message
      };
    }
  }

  /**
   * Create a backup of current repository state
   * @returns {Promise<Object>} Backup info
   */
  async createBackup() {
    try {
      const files = await this.listFiles();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupBranch = `backup-${timestamp}`;

      // Create backup branch from current main branch
      const mainRef = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/repos/${this.repoFullName}/git/refs/heads/${this.defaultBranch}`
      );

      await this.makeAuthenticatedRequest(
        `${this.baseUrl}/repos/${this.repoFullName}/git/refs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ref: `refs/heads/${backupBranch}`,
            sha: mainRef.object.sha
          })
        }
      );

      log('info', 'Created repository backup', { 
        branch: backupBranch, 
        files: files.length 
      });

      return {
        success: true,
        backupBranch: backupBranch,
        fileCount: files.length,
        timestamp: Date.now()
      };
    } catch (error) {
      log('error', 'Failed to create backup', { error: error.message });
      throw createError('GitHub backup failed', 'BACKUP_ERROR', { error });
    }
  }
}