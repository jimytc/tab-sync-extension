# Tab Sync Extension

> **🤖 Built Entirely with Kiro AI**  
> This entire project - from initial concept to production-ready code - was created using [Kiro](https://kiro.ai), an AI-powered development assistant. Every line of code, test, documentation, and architectural decision was generated through AI-human collaboration, showcasing the power of AI-assisted software development.

A comprehensive Chromium browser extension that enables secure, manual synchronization of browser tabs across multiple devices using Google Drive or GitHub authentication.

## Features

### 🔐 Secure Authentication

- **Multi-Provider Support**: Authenticate with Google or GitHub accounts
- **OAuth 2.0 Integration**: Secure token-based authentication
- **Automatic Token Refresh**: Seamless re-authentication when needed
- **Privacy-First**: No automatic data collection, user consent for all operations

### 📱 Cross-Device Synchronization

- **Manual Sync Control**: User-triggered synchronization for complete control
- **Bidirectional Sync**: Upload, download, or sync in both directions
- **Device Identification**: Unique device tracking with metadata
- **Cloud Storage**: Secure storage using Google Drive or GitHub

### ⚡ Intelligent Conflict Resolution

- **Automatic Detection**: Identifies conflicts between devices automatically
- **Multiple Resolution Strategies**: Local wins, remote wins, or manual resolution
- **Interactive UI**: User-friendly conflict resolution interface
- **Conflict History**: Track and analyze conflict patterns

### 📊 Comprehensive Monitoring

- **Detailed History**: Complete sync operation tracking with statistics
- **Performance Metrics**: Monitor sync speed and success rates
- **Error Handling**: Robust error recovery with user-friendly notifications
- **Real-time Status**: Live sync progress and status updates

### ⌨️ Keyboard Shortcuts

- **Customizable Shortcuts**: Configure keyboard shortcuts for quick access
- **Default Shortcut**: `Ctrl+Shift+S` to trigger sync
- **Conflict Detection**: Automatic detection of shortcut conflicts

## Installation

### From Chrome Web Store

1. Visit the Chrome Web Store (link coming soon)
2. Click "Add to Chrome"
3. Follow the installation prompts

### Manual Installation (Development)

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension directory
5. The extension will appear in your browser toolbar

## Quick Start

### 1. Initial Setup

1. Click the Tab Sync extension icon in your browser toolbar
2. Choose your authentication provider (Google or GitHub)
3. Complete the OAuth authentication flow
4. Your extension is now ready to sync!

### 2. First Sync

1. Open some tabs you want to sync
2. Click the extension icon or use `Ctrl+Shift+S`
3. Click "Sync Now" in the popup
4. Your tabs are now saved to the cloud!

### 3. Sync on Another Device

1. Install the extension on your other device
2. Sign in with the same account
3. Click "Sync Now" to download your tabs
4. Your tabs will open automatically

## Usage Guide

### Authentication

#### Google Authentication

- **Required Permissions**: Google Drive access for storing sync data
- **Data Storage**: Encrypted sync data stored in your Google Drive
- **Privacy**: Only sync data is stored, no browsing history or personal data

#### GitHub Authentication

- **Required Permissions**: Repository access for storing sync data
- **Data Storage**: Encrypted sync data stored in a private repository or gist
- **Privacy**: Data is stored in your personal GitHub account

### Sync Operations

#### Manual Sync

1. Click the extension icon
2. Choose sync direction:
   - **Upload**: Send local tabs to cloud
   - **Download**: Get tabs from cloud
   - **Bidirectional**: Smart sync in both directions
3. Confirm the operation
4. Monitor progress in the popup

#### Keyboard Shortcuts

- **Default**: `Ctrl+Shift+S` (Windows/Linux) or `Cmd+Shift+S` (Mac)
- **Customization**: Change shortcuts in the extension settings
- **Confirmation**: Optional confirmation dialog before sync

### Conflict Resolution

When conflicts are detected between devices:

1. **Automatic Detection**: The extension identifies conflicting tabs
2. **Conflict Types**:
   - **Timestamp Conflicts**: Changes on multiple devices
   - **Tab Metadata**: Same URL with different titles/positions
   - **Structural**: Different window organization
3. **Resolution Options**:
   - **Local Wins**: Keep local version
   - **Remote Wins**: Use cloud version
   - **Manual**: Choose for each conflict
4. **Interactive UI**: Visual conflict resolution interface

### Settings and Configuration

#### Access Settings

1. Right-click the extension icon
2. Select "Options" or click "Settings" in the popup
3. Configure your preferences

#### Available Settings

- **Sync Confirmation**: Require confirmation before sync
- **Keyboard Shortcuts**: Customize shortcut keys
- **Conflict Resolution**: Default resolution strategy
- **History Retention**: How long to keep sync history
- **Notifications**: Enable/disable sync notifications

### Sync History

#### View History

1. Open extension settings
2. Navigate to "Sync History" tab
3. View detailed sync operations

#### History Features

- **Operation Details**: Complete sync information
- **Performance Metrics**: Speed and success rates
- **Error Logs**: Detailed error information
- **Export Data**: Download history as JSON or CSV
- **Filter Options**: Filter by date, status, or device

## Advanced Features

### Dry Run Mode

Test sync operations without making changes:

```javascript
// Available in developer console
syncEngine.triggerSync({ dryRun: true });
```

### Batch Operations

Sync multiple tab sets efficiently:

- Automatic batching for large tab counts
- Progress indicators for long operations
- Cancellation support for running syncs

### Performance Optimization

- **Incremental Sync**: Only sync changed tabs
- **Compression**: Efficient data storage
- **Caching**: Local caching for faster operations
- **Background Processing**: Non-blocking sync operations

## Troubleshooting

### Common Issues

#### Authentication Problems

**Issue**: "Authentication failed" error
**Solution**:

1. Check internet connection
2. Clear browser cache and cookies
3. Try signing out and back in
4. Verify account permissions

#### Sync Failures

**Issue**: Sync operations fail consistently
**Solution**:

1. Check cloud storage quota
2. Verify network connectivity
3. Review error logs in settings
4. Try manual conflict resolution

#### Performance Issues

**Issue**: Slow sync operations
**Solution**:

1. Reduce number of open tabs
2. Check network speed
3. Clear sync history
4. Restart browser

### Error Codes

| Code                | Description            | Solution         |
| ------------------- | ---------------------- | ---------------- |
| `AUTH_FAILED`       | Authentication error   | Re-authenticate  |
| `STORAGE_QUOTA`     | Storage limit exceeded | Clear old data   |
| `NETWORK_ERROR`     | Connection problem     | Check internet   |
| `CONFLICT_DETECTED` | Merge conflicts found  | Resolve manually |
| `INVALID_DATA`      | Corrupted sync data    | Reset sync data  |

### Getting Help

1. **Check Settings**: Review error logs in extension settings
2. **Documentation**: Read this guide thoroughly
3. **GitHub Issues**: Report bugs on our GitHub repository
4. **Community**: Join our community discussions

## Privacy and Security

### Data Protection

- **Encryption**: All sync data is encrypted before storage
- **Local Storage**: Sensitive data stored securely in browser
- **No Tracking**: No user behavior tracking or analytics
- **Minimal Permissions**: Only required permissions requested

### What Data is Stored

- **Tab Information**: URLs, titles, and organization
- **Device Metadata**: Device name and browser version
- **Sync History**: Operation logs and statistics
- **Settings**: User preferences and configuration

### What Data is NOT Stored

- **Browsing History**: No browsing history collected
- **Personal Data**: No personal information stored
- **Tab Content**: No webpage content or form data
- **Passwords**: No password or authentication data

### Data Retention

- **Sync Data**: Stored until manually deleted
- **History**: Configurable retention period (default: 30 days)
- **Logs**: Error logs kept for 7 days
- **Settings**: Stored locally until extension removal

## Development

### Building from Source

#### Prerequisites

- Node.js 18+ and npm
- Chrome/Chromium browser
- Git

#### Setup

```bash
# Clone repository
git clone https://github.com/your-org/tab-sync-extension.git
cd tab-sync-extension

# Install dependencies
npm install

# Build extension
npm run build

# Run tests
npm test

# Start development server
npm run dev
```

#### Project Structure

```
tab-sync-extension/
├── manifest.json          # Extension manifest
├── background/            # Background service worker
├── popup/                # Extension popup UI
├── options/              # Settings page
├── shared/               # Shared utilities and services
│   ├── auth/            # Authentication services
│   ├── storage/         # Cloud storage adapters
│   └── ...
├── tests/               # Unit and integration tests
└── docs/                # Documentation
```

### Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

#### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

#### Code Standards

- **ESLint**: Follow our linting rules
- **Testing**: Maintain test coverage above 90%
- **Documentation**: Update docs for new features
- **Commits**: Use conventional commit messages

## API Reference

### Core Services

#### SyncEngine

```javascript
// Trigger sync operation
await syncEngine.triggerSync({
  direction: "bidirectional", // 'upload', 'download', 'bidirectional'
  forceOverwrite: false,
  dryRun: false,
});

// Get sync status
const status = await syncEngine.getSyncStatus();
```

#### AuthService

```javascript
// Authenticate with provider
await authService.authenticate("google"); // or 'github'

// Check authentication status
const status = await authService.getAuthStatus();

// Sign out
await authService.signOut();
```

#### StorageService

```javascript
// Store data
await storageService.store("filename.json", data);

// Retrieve data
const result = await storageService.retrieve("filename.json");

// List files
const files = await storageService.listFiles();
```

### Events and Callbacks

#### Sync Progress

```javascript
// Register for sync progress updates
syncEngine.onProgress((progress) => {
  console.log("Sync progress:", progress);
});
```

#### Error Handling

```javascript
// Register error handler
errorHandler.registerNotificationCallback((error) => {
  console.log("Error occurred:", error);
});
```

## Changelog

### Version 1.0.0 (Current)

- Initial release
- Google and GitHub authentication
- Bidirectional sync with conflict resolution
- Comprehensive error handling and logging
- Interactive conflict resolution UI
- Detailed sync history and statistics
- Keyboard shortcuts and customization
- Performance optimizations

### Planned Features

- **Automatic Sync**: Optional background synchronization
- **Tab Groups**: Support for Chrome tab groups
- **Selective Sync**: Choose which tabs to sync
- **Multiple Profiles**: Support for multiple sync profiles
- **Team Sharing**: Share tab collections with team members

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: This README and inline code documentation
- **Issues**: [GitHub Issues](https://github.com/your-org/tab-sync-extension/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/tab-sync-extension/discussions)
- **Email**: support@tabsync.dev

---

**Tab Sync Extension** - Synchronize your browsing experience across all your devices with security and privacy in mind.
