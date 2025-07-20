// Google Drive storage adapter for Tab Sync Extension

import { log, createError, retryWithBackoff, generateChecksum } from '../utils.js';
import { GoogleAuthService } from '../auth/google-auth.js';

/**
 * Google Drive storage adapter
 */
export class GoogleDriveStorage {
  constructor() {
    this.provider = 'google-drive';
    this.authService = new GoogleAuthService();
    this.baseUrl = 'https://www.googleapis.com/drive/v3';
    this.uploadUrl = 'https://www.googleapis.com/upload/drive/v3';
    this.appFolderName = 'Tab Sync Extension';
    this.appFolderId = null;
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

      // Create or find app folder
      await this.ensureAppFolder();
      
      log('info', 'Google Drive storage initialized', { 
        provider: this.provider,
        folderId: this.appFolderId 
      });
    } catch (error) {
      log('error', 'Failed to initialize Google Drive storage', { error: error.message });
      throw error;
    }
  }

  /**
   * Store sync data to Google Drive
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
        metadata = {} 
      } = options;

      // Prepare data for storage
      const processedData = await this.prepareDataForStorage(data, { encrypt, compress });
      
      // Check if file already exists
      const existingFile = await this.findFile(fileName);
      
      let result;
      if (existingFile) {
        // Update existing file
        result = await this.updateFile(existingFile.id, fileName, processedData, metadata);
        log('info', 'Updated file in Google Drive', { fileName, fileId: result.id });
      } else {
        // Create new file
        result = await this.createFile(fileName, processedData, metadata);
        log('info', 'Created file in Google Drive', { fileName, fileId: result.id });
      }

      return {
        success: true,
        fileId: result.id,
        fileName: fileName,
        size: processedData.length,
        timestamp: Date.now(),
        checksum: await generateChecksum(JSON.stringify(data))
      };
    } catch (error) {
      log('error', 'Failed to store data to Google Drive', { 
        fileName, 
        error: error.message 
      });
      throw createError('Google Drive storage failed', 'STORAGE_ERROR', { fileName, error });
    }
  }

  /**
   * Retrieve data from Google Drive
   * @param {string} fileName - File name to retrieve
   * @param {Object} options - Retrieval options
   * @returns {Promise<Object>} Retrieved data
   */
  async retrieve(fileName, options = {}) {
    try {
      const { 
        decrypt = false,
        decompress = false,
        validateChecksum = true 
      } = options;

      // Find the file
      const file = await this.findFile(fileName);
      if (!file) {
        throw createError(`File not found: ${fileName}`, 'FILE_NOT_FOUND', { fileName });
      }

      // Download file content
      const content = await this.downloadFile(file.id);
      
      // Process retrieved data
      const processedData = await this.processRetrievedData(content, { decrypt, decompress });
      
      // Validate checksum if requested
      if (validateChecksum && processedData.checksum) {
        const calculatedChecksum = await generateChecksum(JSON.stringify(processedData.data));
        if (calculatedChecksum !== processedData.checksum) {
          log('warn', 'Checksum validation failed', { fileName, expected: processedData.checksum, actual: calculatedChecksum });
        }
      }

      log('info', 'Retrieved data from Google Drive', { 
        fileName, 
        fileId: file.id,
        size: content.length 
      });

      return {
        success: true,
        data: processedData.data || processedData,
        metadata: {
          fileId: file.id,
          fileName: fileName,
          modifiedTime: file.modifiedTime,
          size: file.size,
          checksum: processedData.checksum
        }
      };
    } catch (error) {
      log('error', 'Failed to retrieve data from Google Drive', { 
        fileName, 
        error: error.message 
      });
      throw createError('Google Drive retrieval failed', 'RETRIEVAL_ERROR', { fileName, error });
    }
  }

  /**
   * List files in the app folder
   * @param {Object} options - List options
   * @returns {Promise<Object[]>} Array of file metadata
   */
  async listFiles(options = {}) {
    try {
      const { 
        pattern = null,
        maxResults = 100,
        orderBy = 'modifiedTime desc' 
      } = options;

      await this.ensureAppFolder();

      let query = `'${this.appFolderId}' in parents and trashed=false`;
      if (pattern) {
        query += ` and name contains '${pattern}'`;
      }

      const params = new URLSearchParams({
        q: query,
        pageSize: maxResults.toString(),
        orderBy: orderBy,
        fields: 'files(id,name,size,modifiedTime,createdTime,mimeType)'
      });

      const response = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/files?${params.toString()}`
      );

      const files = response.files || [];
      
      log('info', 'Listed files from Google Drive', { 
        count: files.length,
        pattern: pattern || 'all' 
      });

      return files.map(file => ({
        id: file.id,
        name: file.name,
        size: parseInt(file.size) || 0,
        modifiedTime: file.modifiedTime,
        createdTime: file.createdTime,
        mimeType: file.mimeType
      }));
    } catch (error) {
      log('error', 'Failed to list files from Google Drive', { error: error.message });
      throw createError('Google Drive list failed', 'LIST_ERROR', { error });
    }
  }

  /**
   * Delete file from Google Drive
   * @param {string} fileName - File name to delete
   * @returns {Promise<Object>} Deletion result
   */
  async deleteFile(fileName) {
    try {
      const file = await this.findFile(fileName);
      if (!file) {
        log('warn', 'File not found for deletion', { fileName });
        return { success: true, message: 'File not found' };
      }

      await this.makeAuthenticatedRequest(
        `${this.baseUrl}/files/${file.id}`,
        { method: 'DELETE' }
      );

      log('info', 'Deleted file from Google Drive', { fileName, fileId: file.id });

      return {
        success: true,
        fileId: file.id,
        fileName: fileName,
        timestamp: Date.now()
      };
    } catch (error) {
      log('error', 'Failed to delete file from Google Drive', { 
        fileName, 
        error: error.message 
      });
      throw createError('Google Drive deletion failed', 'DELETE_ERROR', { fileName, error });
    }
  }

  /**
   * Get storage quota information
   * @returns {Promise<Object>} Storage quota info
   */
  async getStorageInfo() {
    try {
      const response = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/about?fields=storageQuota,user`
      );

      const quota = response.storageQuota || {};
      
      return {
        totalBytes: parseInt(quota.limit) || 0,
        usedBytes: parseInt(quota.usage) || 0,
        availableBytes: (parseInt(quota.limit) || 0) - (parseInt(quota.usage) || 0),
        user: response.user?.displayName || 'Unknown'
      };
    } catch (error) {
      log('error', 'Failed to get storage info from Google Drive', { error: error.message });
      throw createError('Google Drive storage info failed', 'STORAGE_INFO_ERROR', { error });
    }
  }

  /**
   * Ensure app folder exists
   * @returns {Promise<void>}
   */
  async ensureAppFolder() {
    if (this.appFolderId) {
      return;
    }

    try {
      // Search for existing app folder
      const query = `name='${this.appFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const response = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`
      );

      if (response.files && response.files.length > 0) {
        this.appFolderId = response.files[0].id;
        log('info', 'Found existing app folder', { folderId: this.appFolderId });
      } else {
        // Create new app folder
        const folderMetadata = {
          name: this.appFolderName,
          mimeType: 'application/vnd.google-apps.folder'
        };

        const folder = await this.makeAuthenticatedRequest(
          `${this.baseUrl}/files`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(folderMetadata)
          }
        );

        this.appFolderId = folder.id;
        log('info', 'Created new app folder', { folderId: this.appFolderId });
      }
    } catch (error) {
      log('error', 'Failed to ensure app folder', { error: error.message });
      throw error;
    }
  }

  /**
   * Find file by name in app folder
   * @param {string} fileName - File name to find
   * @returns {Promise<Object|null>} File metadata or null
   */
  async findFile(fileName) {
    try {
      await this.ensureAppFolder();

      const query = `name='${fileName}' and '${this.appFolderId}' in parents and trashed=false`;
      const response = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,modifiedTime)`
      );

      return response.files && response.files.length > 0 ? response.files[0] : null;
    } catch (error) {
      log('error', 'Failed to find file', { fileName, error: error.message });
      throw error;
    }
  }

  /**
   * Create new file in Google Drive
   * @param {string} fileName - File name
   * @param {string} content - File content
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Created file info
   */
  async createFile(fileName, content, metadata = {}) {
    try {
      await this.ensureAppFolder();

      const fileMetadata = {
        name: fileName,
        parents: [this.appFolderId],
        description: metadata.description || 'Tab Sync Extension data file'
      };

      // Use multipart upload for file with content
      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const multipartRequestBody = 
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(fileMetadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        content +
        closeDelimiter;

      const response = await this.makeAuthenticatedRequest(
        `${this.uploadUrl}/files?uploadType=multipart`,
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/related; boundary="${boundary}"`
          },
          body: multipartRequestBody
        }
      );

      return response;
    } catch (error) {
      log('error', 'Failed to create file', { fileName, error: error.message });
      throw error;
    }
  }

  /**
   * Update existing file in Google Drive
   * @param {string} fileId - File ID to update
   * @param {string} fileName - File name
   * @param {string} content - New content
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Updated file info
   */
  async updateFile(fileId, fileName, content, metadata = {}) {
    try {
      // Update file content
      const response = await this.makeAuthenticatedRequest(
        `${this.uploadUrl}/files/${fileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: content
        }
      );

      return response;
    } catch (error) {
      log('error', 'Failed to update file', { fileId, fileName, error: error.message });
      throw error;
    }
  }

  /**
   * Download file content from Google Drive
   * @param {string} fileId - File ID to download
   * @returns {Promise<string>} File content
   */
  async downloadFile(fileId) {
    try {
      const response = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/files/${fileId}?alt=media`,
        { method: 'GET' }
      );

      return typeof response === 'string' ? response : JSON.stringify(response);
    } catch (error) {
      log('error', 'Failed to download file', { fileId, error: error.message });
      throw error;
    }
  }

  /**
   * Make authenticated request to Google Drive API
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
          'User-Agent': 'Tab-Sync-Extension/1.0',
          ...options.headers
        }
      });

      if (response.status === 401) {
        // Token might be expired, try to refresh
        try {
          await this.authService.refreshTokens();
          const newTokens = await this.authService.getStoredTokens();
          
          // Retry with new token
          const retryResponse = await fetch(url, {
            ...options,
            headers: {
              'Authorization': `Bearer ${newTokens.accessToken}`,
              'User-Agent': 'Tab-Sync-Extension/1.0',
              ...options.headers
            }
          });

          if (!retryResponse.ok) {
            throw createError(
              `Google Drive API error: ${retryResponse.status}`,
              'API_ERROR',
              { status: retryResponse.status }
            );
          }

          return await retryResponse.json();
        } catch (refreshError) {
          throw createError('Authentication failed', 'AUTH_FAILED', { refreshError });
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw createError(
          `Google Drive API error: ${response.status}`,
          'API_ERROR',
          { status: response.status, error: errorData }
        );
      }

      // Handle different response types
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    }, 3, 1000);
  }

  /**
   * Prepare data for storage (encryption, compression, etc.)
   * @param {Object} data - Data to prepare
   * @param {Object} options - Preparation options
   * @returns {Promise<string>} Prepared data
   */
  async prepareDataForStorage(data, options = {}) {
    let processedData = JSON.stringify(data);

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
      const storageInfo = await this.getStorageInfo();
      await this.ensureAppFolder();
      
      return {
        success: true,
        provider: this.provider,
        user: storageInfo.user,
        available: storageInfo.availableBytes > 0,
        folderId: this.appFolderId
      };
    } catch (error) {
      return {
        success: false,
        provider: this.provider,
        error: error.message
      };
    }
  }
}