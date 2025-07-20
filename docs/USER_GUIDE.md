# Tab Sync Extension - User Guide

This comprehensive guide will help you get the most out of the Tab Sync Extension, from basic setup to advanced features.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Authentication Setup](#authentication-setup)
3. [Basic Sync Operations](#basic-sync-operations)
4. [Conflict Resolution](#conflict-resolution)
5. [Settings and Customization](#settings-and-customization)
6. [Sync History and Monitoring](#sync-history-and-monitoring)
7. [Keyboard Shortcuts](#keyboard-shortcuts)
8. [Troubleshooting](#troubleshooting)
9. [Advanced Features](#advanced-features)
10. [Privacy and Security](#privacy-and-security)

## Getting Started

### Installation

#### From Chrome Web Store (Recommended)
1. Visit the Chrome Web Store
2. Search for "Tab Sync Extension"
3. Click "Add to Chrome"
4. Confirm installation when prompted
5. The extension icon will appear in your browser toolbar

#### Manual Installation (Development)
1. Download the extension files
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the extension folder
6. The extension will be loaded and ready to use

### First Launch

When you first click the Tab Sync extension icon:

1. **Welcome Screen**: You'll see a welcome message explaining the extension
2. **Authentication Required**: You'll be prompted to sign in
3. **Provider Selection**: Choose between Google or GitHub authentication
4. **Permission Grant**: Authorize the extension to access your chosen service
5. **Setup Complete**: You're ready to start syncing!

## Authentication Setup

### Google Authentication

#### What You'll Need
- A Google account
- Google Drive access (free tier is sufficient)

#### Setup Process
1. Click the extension icon
2. Select "Sign in with Google"
3. You'll be redirected to Google's OAuth page
4. Review the permissions requested:
   - **Google Drive access**: To store your sync data
   - **Profile information**: To identify your account
5. Click "Allow" to grant permissions
6. You'll be redirected back to the extension
7. Authentication complete!

#### What Happens Next
- Your sync data will be stored in your Google Drive
- A hidden folder called "TabSyncData" will be created
- All data is encrypted before storage

### GitHub Authentication

#### What You'll Need
- A GitHub account
- Permission to create private repositories or gists

#### Setup Process
1. Click the extension icon
2. Select "Sign in with GitHub"
3. You'll be redirected to GitHub's OAuth page
4. Review the permissions requested:
   - **Repository access**: To store sync data
   - **Profile information**: To identify your account
5. Click "Authorize" to grant permissions
6. You'll be redirected back to the extension
7. Authentication complete!

#### What Happens Next
- Your sync data will be stored in a private GitHub repository
- A repository called "tab-sync-data" will be created
- All data is encrypted before storage

### Switching Authentication Providers

To change from Google to GitHub (or vice versa):

1. Open extension settings
2. Go to "Account" section
3. Click "Sign Out"
4. Confirm sign out
5. Click the extension icon
6. Choose your new authentication provider
7. Complete the authentication process

**Note**: Switching providers will not transfer existing sync data. You'll start fresh with the new provider.

## Basic Sync Operations

### Understanding Sync Directions

The extension supports three sync directions:

#### Upload (Local → Cloud)
- Sends your current tabs to cloud storage
- Overwrites existing cloud data
- Use when you want to save your current session

#### Download (Cloud → Local)
- Retrieves tabs from cloud storage
- Opens tabs in your current browser
- Use when you want to restore a saved session

#### Bidirectional (Smart Sync)
- Compares local and cloud data
- Merges changes intelligently
- Handles conflicts automatically or with user input
- **Recommended for most users**

### Performing Your First Sync

#### Method 1: Using the Popup
1. Click the Tab Sync extension icon
2. You'll see the current sync status
3. Click "Sync Now" button
4. Choose sync direction (or leave as "Bidirectional")
5. Confirm the operation
6. Monitor progress in the popup

#### Method 2: Using Keyboard Shortcut
1. Press `Ctrl+Shift+S` (Windows/Linux) or `Cmd+Shift+S` (Mac)
2. A confirmation dialog will appear (if enabled)
3. Click "Yes, Sync Now" to proceed
4. The sync will start automatically

### Understanding Sync Results

After a sync operation, you'll see:

#### Success Indicators
- ✅ **Green checkmark**: Sync completed successfully
- **Tab count**: Number of tabs processed
- **Duration**: How long the sync took
- **Timestamp**: When the sync completed

#### Conflict Indicators
- ⚠️ **Yellow warning**: Conflicts detected and resolved
- **Conflict count**: Number of conflicts found
- **Resolution method**: How conflicts were handled

#### Error Indicators
- ❌ **Red X**: Sync failed
- **Error message**: Description of what went wrong
- **Retry option**: Button to try the sync again

### Sync Best Practices

#### Before Syncing
- **Close unnecessary tabs**: Reduce sync time and storage
- **Organize tabs**: Group related tabs in windows
- **Check connection**: Ensure stable internet connection

#### During Sync
- **Don't close browser**: Let the sync complete
- **Avoid opening/closing tabs**: Can cause conflicts
- **Monitor progress**: Watch for any error messages

#### After Sync
- **Verify results**: Check that tabs opened correctly
- **Review conflicts**: Address any unresolved conflicts
- **Update other devices**: Sync on your other devices

## Conflict Resolution

Conflicts occur when the same tab exists on multiple devices with different information. The extension provides several ways to handle these situations.

### Types of Conflicts

#### Timestamp Conflicts
**What it is**: Both local and cloud data have been modified since the last sync

**Example**: You modified tabs on your laptop and phone simultaneously

**Resolution options**:
- **Local wins**: Keep your current device's version
- **Remote wins**: Use the cloud version
- **Manual**: Choose for each conflict individually

#### Tab Metadata Conflicts
**What it is**: Same URL exists with different titles, positions, or properties

**Example**: 
- Local: "GitHub - Homepage" in window 1, position 0
- Remote: "GitHub" in window 2, position 5

**Resolution options**:
- **Keep local**: Use local tab metadata
- **Keep remote**: Use cloud tab metadata
- **Merge**: Combine information where possible

#### Structural Conflicts
**What it is**: Different tab organization between devices

**Example**:
- Local: 10 tabs in 1 window
- Remote: Same tabs split across 3 windows

**Resolution options**:
- **Local structure**: Keep current window organization
- **Remote structure**: Use cloud window organization
- **Merge windows**: Combine tabs intelligently

### Automatic Conflict Resolution

By default, the extension uses these strategies:

1. **Timestamp-based**: Newer changes win
2. **Local preference**: When timestamps are equal, local wins
3. **Safe merging**: Combine non-conflicting changes

### Manual Conflict Resolution

When automatic resolution isn't possible:

#### Conflict Resolution UI
1. A popup window will appear showing conflicts
2. Each conflict displays:
   - **Local version**: Your current tab information
   - **Remote version**: Cloud tab information
   - **Differences**: What's different between them
3. For each conflict, choose:
   - **Keep Local**: Use your device's version
   - **Keep Remote**: Use the cloud version
   - **Skip**: Don't sync this tab

#### Batch Resolution
- **Select All Local**: Choose local version for all conflicts
- **Select All Remote**: Choose remote version for all conflicts
- **Apply Defaults**: Use automatic resolution rules

#### Preview Changes
- **Show Preview**: See what will happen before applying
- **Undo Option**: Reverse changes if needed

### Conflict Prevention Tips

#### Keep Devices in Sync
- Sync regularly on all devices
- Don't let devices go too long without syncing
- Use bidirectional sync for best results

#### Organize Consistently
- Use similar window organization on all devices
- Keep tab titles consistent
- Avoid rapid changes during sync

#### Handle Conflicts Promptly
- Address conflicts when they appear
- Don't accumulate many unresolved conflicts
- Review conflict history periodically

## Settings and Customization

### Accessing Settings

#### Method 1: Right-click Menu
1. Right-click the extension icon
2. Select "Options"
3. Settings page opens in new tab

#### Method 2: Extension Popup
1. Click the extension icon
2. Click the gear icon (⚙️) in popup
3. Settings page opens

### General Settings

#### Sync Behavior
- **Default sync direction**: Choose upload, download, or bidirectional
- **Confirmation dialogs**: Require confirmation before sync
- **Auto-retry failed syncs**: Automatically retry failed operations
- **Sync timeout**: How long to wait before timing out

#### Notifications
- **Success notifications**: Show when sync completes successfully
- **Error notifications**: Show when sync fails
- **Conflict notifications**: Show when conflicts are detected
- **Progress notifications**: Show sync progress updates

### Account Settings

#### Current Account
- **Provider**: Shows Google or GitHub
- **Account info**: Display name and email
- **Connection status**: Shows if authentication is valid
- **Last sync**: When you last synced successfully

#### Account Actions
- **Sign out**: Disconnect from current provider
- **Switch provider**: Change to different authentication method
- **Clear data**: Remove all local sync data
- **Export data**: Download your sync history

### Sync History Settings

#### History Retention
- **Keep history for**: 7 days, 30 days, 90 days, or forever
- **Maximum entries**: Limit number of history entries
- **Auto-cleanup**: Automatically remove old entries

#### History Display
- **Show details**: Include detailed operation information
- **Group by device**: Organize history by device
- **Filter options**: Default filters for history view

### Privacy Settings

#### Data Collection
- **Error reporting**: Send anonymous error reports
- **Usage statistics**: Share anonymous usage data
- **Crash reports**: Send crash information for debugging

#### Data Storage
- **Encryption**: Always enabled, cannot be disabled
- **Local caching**: Cache data locally for faster access
- **Clear cache**: Remove all cached data

### Advanced Settings

#### Performance
- **Sync batch size**: Number of tabs to process at once
- **Network timeout**: How long to wait for network operations
- **Retry attempts**: Number of times to retry failed operations
- **Background sync**: Enable background synchronization (future feature)

#### Developer Options
- **Debug logging**: Enable detailed logging
- **Dry run mode**: Test syncs without making changes
- **API endpoints**: Custom API endpoints (for development)
- **Reset settings**: Restore all settings to defaults

## Sync History and Monitoring

### Viewing Sync History

#### Access History
1. Open extension settings
2. Click "Sync History" tab
3. View list of all sync operations

#### History Information
Each history entry shows:
- **Date and time**: When the sync occurred
- **Direction**: Upload, download, or bidirectional
- **Status**: Success, failed, or with conflicts
- **Duration**: How long the sync took
- **Tab count**: Number of tabs processed
- **Device**: Which device performed the sync
- **Conflicts**: Number of conflicts detected/resolved

### Filtering and Searching

#### Filter Options
- **Date range**: Show syncs from specific time period
- **Status**: Show only successful, failed, or conflicted syncs
- **Device**: Show syncs from specific device
- **Direction**: Filter by sync direction

#### Search Function
- **Text search**: Search in sync descriptions
- **Advanced search**: Multiple criteria search
- **Saved searches**: Save frequently used search criteria

### Statistics and Analytics

#### Sync Statistics
- **Total syncs**: Number of sync operations performed
- **Success rate**: Percentage of successful syncs
- **Average duration**: Typical sync time
- **Conflict rate**: How often conflicts occur

#### Performance Metrics
- **Sync speed**: Tabs processed per second
- **Error patterns**: Common error types
- **Peak usage**: When you sync most often
- **Device comparison**: Performance across devices

#### Charts and Graphs
- **Sync frequency**: How often you sync over time
- **Success trends**: Success rate trends
- **Conflict patterns**: When conflicts occur most
- **Performance trends**: Speed improvements over time

### Exporting History Data

#### Export Formats
- **JSON**: Machine-readable format for analysis
- **CSV**: Spreadsheet-compatible format
- **PDF**: Human-readable report format

#### Export Options
- **Date range**: Export specific time period
- **Include details**: Add detailed operation information
- **Include statistics**: Add summary statistics
- **Include charts**: Add visual representations

#### Using Exported Data
- **Backup**: Keep records of your sync history
- **Analysis**: Analyze your sync patterns
- **Troubleshooting**: Share with support for help
- **Reporting**: Create usage reports

## Keyboard Shortcuts

### Default Shortcuts

#### Primary Shortcuts
- **Trigger Sync**: `Ctrl+Shift+S` (Windows/Linux) or `Cmd+Shift+S` (Mac)
- **Open Settings**: `Ctrl+Shift+O` (Windows/Linux) or `Cmd+Shift+O` (Mac)
- **Show History**: `Ctrl+Shift+H` (Windows/Linux) or `Cmd+Shift+H` (Mac)

#### Conflict Resolution Shortcuts
- **Accept All Local**: `Ctrl+L` during conflict resolution
- **Accept All Remote**: `Ctrl+R` during conflict resolution
- **Skip All**: `Ctrl+S` during conflict resolution

### Customizing Shortcuts

#### Changing Shortcuts
1. Open extension settings
2. Go to "Keyboard Shortcuts" section
3. Click on the shortcut you want to change
4. Press the new key combination
5. Click "Save" to confirm

#### Shortcut Requirements
- **Modifier keys**: Must include Ctrl, Alt, or Shift
- **Conflict detection**: Extension warns about conflicts
- **Browser conflicts**: Avoid conflicting with browser shortcuts
- **System conflicts**: Avoid conflicting with system shortcuts

#### Best Practices
- **Memorable combinations**: Use logical key combinations
- **Consistent patterns**: Use similar patterns across shortcuts
- **Avoid conflicts**: Check for conflicts with other extensions
- **Test thoroughly**: Verify shortcuts work as expected

### Shortcut Troubleshooting

#### Shortcuts Not Working
1. **Check conflicts**: Look for conflicting shortcuts
2. **Restart browser**: Reload extension after changes
3. **Check permissions**: Ensure extension has necessary permissions
4. **Reset shortcuts**: Restore default shortcuts if needed

#### Conflict Resolution
1. **Identify conflicts**: Extension shows conflicting shortcuts
2. **Choose alternatives**: Select different key combinations
3. **Disable conflicts**: Turn off conflicting shortcuts in other extensions
4. **Use alternatives**: Use mouse/menu alternatives

## Troubleshooting

### Common Issues and Solutions

#### Authentication Problems

**Issue**: "Authentication failed" error
**Symptoms**: Can't sign in, sync operations fail
**Solutions**:
1. Check internet connection
2. Clear browser cache and cookies
3. Disable other extensions temporarily
4. Try incognito/private browsing mode
5. Sign out and sign in again

**Issue**: "Token expired" error
**Symptoms**: Previously working authentication stops working
**Solutions**:
1. Extension will try to refresh automatically
2. If that fails, sign out and sign in again
3. Check account permissions haven't changed
4. Verify account is still active

#### Sync Operation Failures

**Issue**: Sync operations consistently fail
**Symptoms**: All syncs fail with errors
**Solutions**:
1. Check network connectivity
2. Verify cloud storage quota
3. Review error logs in settings
4. Try different sync direction
5. Clear local cache and retry

**Issue**: Slow sync performance
**Symptoms**: Syncs take very long time
**Solutions**:
1. Reduce number of open tabs
2. Check network speed
3. Clear sync history
4. Restart browser
5. Try sync during off-peak hours

#### Conflict Resolution Issues

**Issue**: Too many conflicts detected
**Symptoms**: Every sync shows many conflicts
**Solutions**:
1. Sync more frequently on all devices
2. Use consistent tab organization
3. Avoid simultaneous changes on multiple devices
4. Use batch conflict resolution
5. Consider resetting sync data

**Issue**: Conflict resolution UI not appearing
**Symptoms**: Conflicts detected but no UI shown
**Solutions**:
1. Check popup blocker settings
2. Ensure extension has window creation permissions
3. Try manual conflict resolution from settings
4. Restart browser and try again

### Error Codes and Messages

#### Authentication Errors
- **AUTH_FAILED**: General authentication failure
- **TOKEN_EXPIRED**: Authentication token expired
- **INVALID_CREDENTIALS**: Wrong username/password
- **PERMISSION_DENIED**: Insufficient permissions
- **PROVIDER_ERROR**: Problem with Google/GitHub service

#### Sync Errors
- **NETWORK_ERROR**: Internet connection problem
- **STORAGE_QUOTA**: Cloud storage limit exceeded
- **INVALID_DATA**: Corrupted sync data
- **CONFLICT_UNRESOLVED**: Conflicts need manual resolution
- **SYNC_IN_PROGRESS**: Another sync is already running

#### System Errors
- **EXTENSION_ERROR**: Problem with extension itself
- **BROWSER_ERROR**: Browser compatibility issue
- **PERMISSION_ERROR**: Missing required permissions
- **STORAGE_ERROR**: Local storage problem
- **UNKNOWN_ERROR**: Unexpected error occurred

### Getting Additional Help

#### Self-Help Resources
1. **Error logs**: Check detailed error information in settings
2. **Sync history**: Review recent sync operations for patterns
3. **Documentation**: Read this guide and FAQ thoroughly
4. **Community forums**: Search for similar issues

#### Contacting Support
1. **GitHub Issues**: Report bugs and feature requests
2. **Email Support**: Contact support team directly
3. **Community Discord**: Get help from other users
4. **Documentation feedback**: Suggest improvements to guides

#### Information to Include
When contacting support, include:
- **Extension version**: Found in settings
- **Browser version**: Chrome version and OS
- **Error messages**: Exact error text
- **Steps to reproduce**: What you were doing when error occurred
- **Sync history**: Recent sync operations (if relevant)

## Advanced Features

### Developer Features

#### Debug Mode
Enable detailed logging for troubleshooting:
1. Open extension settings
2. Go to "Advanced" section
3. Enable "Debug logging"
4. Reproduce the issue
5. Check browser console for detailed logs

#### Dry Run Mode
Test sync operations without making changes:
```javascript
// In browser console
syncEngine.triggerSync({ dryRun: true })
```

#### Custom API Endpoints
For development and testing:
1. Open extension settings
2. Go to "Advanced" → "Developer Options"
3. Set custom API endpoints
4. Use for testing with local servers

### Power User Tips

#### Batch Operations
- **Multiple windows**: Organize tabs across multiple windows before sync
- **Tab groups**: Use Chrome tab groups for better organization
- **Selective sync**: Close tabs you don't want to sync before operation

#### Performance Optimization
- **Regular cleanup**: Clear old sync history periodically
- **Efficient organization**: Keep similar tabs together
- **Network timing**: Sync during good network conditions
- **Device coordination**: Avoid simultaneous syncs on multiple devices

#### Automation Possibilities
- **Scheduled syncs**: Use browser automation tools
- **Conditional syncs**: Sync based on specific conditions
- **Integration**: Combine with other productivity tools
- **Scripting**: Use extension APIs for custom workflows

### Future Features

#### Planned Enhancements
- **Automatic sync**: Background synchronization
- **Tab groups support**: Sync Chrome tab groups
- **Selective sync**: Choose specific tabs to sync
- **Team sharing**: Share tab collections with others
- **Mobile support**: Sync with mobile browsers

#### Beta Features
Some features may be available in beta:
1. Check extension settings for beta options
2. Enable beta features at your own risk
3. Provide feedback on beta functionality
4. Report any issues with beta features

## Privacy and Security

### Data Protection Measures

#### Encryption
- **End-to-end encryption**: All data encrypted before leaving your device
- **Strong algorithms**: Industry-standard encryption methods
- **Key management**: Encryption keys never stored in plain text
- **Regular updates**: Encryption methods updated regularly

#### Data Minimization
- **Only necessary data**: Only tab information is stored
- **No tracking**: No user behavior tracking
- **No analytics**: No usage analytics without consent
- **Minimal permissions**: Only required permissions requested

### What Data is Collected

#### Sync Data
- **Tab URLs**: Website addresses of your tabs
- **Tab titles**: Page titles as shown in browser
- **Tab organization**: Window and position information
- **Timestamps**: When tabs were created/modified
- **Device metadata**: Device name and browser version

#### Operational Data
- **Sync history**: Record of sync operations
- **Error logs**: Information about failures (temporary)
- **Performance metrics**: Speed and success statistics
- **Settings**: Your configuration preferences

### What Data is NOT Collected

#### Browsing Data
- **Browsing history**: No record of sites visited
- **Page content**: No webpage content stored
- **Form data**: No form inputs or passwords
- **Cookies**: No cookie information stored
- **Downloads**: No download history

#### Personal Data
- **Personal information**: No PII beyond account identifier
- **Location data**: No location tracking
- **Device fingerprinting**: No device identification beyond basic metadata
- **Cross-site tracking**: No tracking across websites

### Data Storage and Retention

#### Cloud Storage
- **Your account**: Data stored in your Google Drive or GitHub
- **Encrypted format**: All data encrypted before storage
- **Access control**: Only you can access your data
- **Retention**: Data kept until you delete it

#### Local Storage
- **Browser storage**: Settings and cache stored locally
- **Temporary data**: Cleared when browser closes
- **No persistence**: No permanent local data storage
- **User control**: You can clear local data anytime

### Privacy Controls

#### Data Management
- **Export data**: Download all your sync data
- **Delete data**: Remove all sync data from cloud
- **Clear cache**: Remove local temporary data
- **Account deletion**: Complete account data removal

#### Consent Management
- **Explicit consent**: Clear consent for all data collection
- **Granular control**: Choose what data to share
- **Opt-out options**: Disable any data collection
- **Consent withdrawal**: Remove consent at any time

### Security Best Practices

#### Account Security
- **Strong passwords**: Use strong passwords for Google/GitHub
- **Two-factor authentication**: Enable 2FA on your accounts
- **Regular review**: Review account permissions periodically
- **Secure devices**: Keep your devices secure and updated

#### Extension Security
- **Keep updated**: Install extension updates promptly
- **Review permissions**: Check extension permissions regularly
- **Report issues**: Report security concerns immediately
- **Secure networks**: Use secure networks for syncing

---

This user guide covers all aspects of using the Tab Sync Extension effectively and securely. For additional help or questions not covered here, please refer to our support resources or contact the development team.