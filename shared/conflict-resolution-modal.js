/**
 * Conflict Resolution Modal
 * Provides UI for resolving tab sync conflicts
 */

class ConflictResolutionModal {
  constructor() {
    this.conflicts = [];
    this.resolutionChoices = {};
    this.selectedConflicts = new Set();
    this.isInitialized = false;
    
    // Bind methods
    this.handleConflictSelect = this.handleConflictSelect.bind(this);
    this.handleSelectAll = this.handleSelectAll.bind(this);
    this.handleExpandConflict = this.handleExpandConflict.bind(this);
    this.handleResolutionSelect = this.handleResolutionSelect.bind(this);
    this.handleBatchAction = this.handleBatchAction.bind(this);
    this.handlePreview = this.handlePreview.bind(this);
    this.handleApply = this.handleApply.bind(this);
    this.handleCancel = this.handleCancel.bind(this);
    this.handleClose = this.handleClose.bind(this);
  }

  /**
   * Initialize the modal
   */
  initialize() {
    if (this.isInitialized) return;
    
    this.setupEventListeners();
    this.isInitialized = true;
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Modal controls
    document.getElementById('close-modal').addEventListener('click', this.handleClose);
    document.getElementById('cancel-resolution').addEventListener('click', this.handleCancel);
    document.getElementById('apply-resolution').addEventListener('click', this.handleApply);
    document.getElementById('preview-changes').addEventListener('click', this.handlePreview);
    
    // Batch actions
    document.getElementById('select-all-conflicts').addEventListener('change', this.handleSelectAll);
    document.getElementById('batch-local-wins').addEventListener('click', () => this.handleBatchAction('local_wins'));
    document.getElementById('batch-remote-wins').addEventListener('click', () => this.handleBatchAction('remote_wins'));
    document.getElementById('batch-merge').addEventListener('click', () => this.handleBatchAction('merge'));
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.handleClose();
      }
    });
    
    // Click outside to close
    document.getElementById('conflict-modal').addEventListener('click', (e) => {
      if (e.target.id === 'conflict-modal') {
        this.handleClose();
      }
    });
  }

  /**
   * Show the modal with conflicts
   * @param {Object[]} conflicts - Array of conflict objects
   * @param {Object} options - Display options
   */
  show(conflicts, options = {}) {
    this.conflicts = conflicts || [];
    this.resolutionChoices = {};
    this.selectedConflicts.clear();
    this.context = options.context || {};
    this.deviceId = options.deviceId || 'local-device';
    
    if (!this.isInitialized) {
      this.initialize();
    }
    
    this.updateConflictSummary();
    this.renderConflicts();
    this.updateUI();
    
    // Show modal
    const modal = document.getElementById('conflict-modal');
    modal.style.display = 'flex';
    
    // Focus management
    const firstFocusable = modal.querySelector('button, input, [tabindex]');
    if (firstFocusable) {
      firstFocusable.focus();
    }
  }

  /**
   * Hide the modal
   */
  hide() {
    const modal = document.getElementById('conflict-modal');
    modal.style.display = 'none';
  }

  /**
   * Update conflict summary
   */
  updateConflictSummary() {
    const countElement = document.getElementById('conflict-count');
    countElement.textContent = this.conflicts.length;
  }

  /**
   * Render all conflicts
   */
  renderConflicts() {
    const conflictList = document.getElementById('conflict-list');
    conflictList.innerHTML = '';
    
    this.conflicts.forEach(conflict => {
      const conflictElement = this.createConflictElement(conflict);
      conflictList.appendChild(conflictElement);
    });
  }

  /**
   * Create a conflict element
   * @param {Object} conflict - Conflict object
   * @returns {HTMLElement} Conflict element
   */
  createConflictElement(conflict) {
    const template = document.getElementById('conflict-item-template');
    const element = template.content.cloneNode(true);
    
    // Set conflict data
    const conflictItem = element.querySelector('.conflict-item');
    conflictItem.dataset.conflictId = conflict.id;
    
    // Conflict header
    const title = element.querySelector('.conflict-title');
    title.textContent = conflict.description || this.getConflictTitle(conflict);
    
    const type = element.querySelector('.conflict-type');
    type.textContent = this.formatConflictType(conflict.type, conflict.subtype);
    
    const severity = element.querySelector('.conflict-severity');
    severity.textContent = this.getSeverityText(conflict.severity);
    severity.className = `conflict-severity ${this.getSeverityClass(conflict.severity)}`;
    
    // Event listeners
    const checkbox = element.querySelector('.conflict-select');
    checkbox.addEventListener('change', this.handleConflictSelect);
    
    const expandButton = element.querySelector('.expand-conflict');
    expandButton.addEventListener('click', this.handleExpandConflict);
    
    // Conflict details
    this.populateConflictDetails(element, conflict);
    
    return element;
  }

  /**
   * Populate conflict details
   * @param {HTMLElement} element - Conflict element
   * @param {Object} conflict - Conflict object
   */
  populateConflictDetails(element, conflict) {
    const description = element.querySelector('.conflict-description');
    description.textContent = this.getDetailedDescription(conflict);
    
    // Tab comparison
    this.populateTabComparison(element, conflict);
    
    // Resolution options
    this.populateResolutionOptions(element, conflict);
  }

  /**
   * Populate tab comparison view
   * @param {HTMLElement} element - Conflict element
   * @param {Object} conflict - Conflict object
   */
  populateTabComparison(element, conflict) {
    const localTabs = element.querySelector('.local-tabs');
    const remoteTabs = element.querySelector('.remote-tabs');
    
    // Clear existing content
    localTabs.innerHTML = '';
    remoteTabs.innerHTML = '';
    
    // Get tabs from conflict details
    const { localTab, remoteTab, tabs } = conflict.details || {};
    
    if (localTab) {
      localTabs.appendChild(this.createTabElement(localTab, 'local'));
    }
    
    if (remoteTab) {
      remoteTabs.appendChild(this.createTabElement(remoteTab, 'remote'));
    }
    
    // Handle multiple tabs (for duplicate conflicts)
    if (tabs) {
      const localTabsList = tabs.filter(tab => tab.deviceId === this.getLocalDeviceId());
      const remoteTabsList = tabs.filter(tab => tab.deviceId !== this.getLocalDeviceId());
      
      localTabsList.forEach(tab => {
        localTabs.appendChild(this.createTabElement(tab, 'local'));
      });
      
      remoteTabsList.forEach(tab => {
        remoteTabs.appendChild(this.createTabElement(tab, 'remote'));
      });
    }
  }

  /**
   * Create a tab element
   * @param {Object} tab - Tab data
   * @param {string} side - 'local' or 'remote'
   * @returns {HTMLElement} Tab element
   */
  createTabElement(tab, side) {
    const template = document.getElementById('tab-item-template');
    const element = template.content.cloneNode(true);
    
    // Favicon
    const favicon = element.querySelector('.tab-favicon img');
    if (tab.favicon) {
      favicon.src = tab.favicon;
      favicon.style.display = 'block';
    }
    
    // Tab info
    const title = element.querySelector('.tab-title');
    title.textContent = tab.title || 'Untitled';
    
    const url = element.querySelector('.tab-url');
    url.textContent = tab.url;
    
    const meta = element.querySelector('.tab-meta');
    meta.textContent = this.formatTabMeta(tab);
    
    // Tab selection
    const selectLabel = element.querySelector('.tab-select-label');
    const selectInput = element.querySelector('.tab-select');
    selectInput.dataset.tabUrl = tab.url;
    selectInput.dataset.side = side;
    
    return element;
  }

  /**
   * Populate resolution options
   * @param {HTMLElement} element - Conflict element
   * @param {Object} conflict - Conflict object
   */
  populateResolutionOptions(element, conflict) {
    const buttonsContainer = element.querySelector('.resolution-buttons');
    buttonsContainer.innerHTML = '';
    
    const strategies = conflict.resolutionStrategies || [];
    
    strategies.forEach(strategy => {
      const button = this.createResolutionButton(strategy, conflict.id);
      buttonsContainer.appendChild(button);
    });
  }

  /**
   * Create a resolution button
   * @param {string} strategy - Resolution strategy
   * @param {string} conflictId - Conflict ID
   * @returns {HTMLElement} Resolution button
   */
  createResolutionButton(strategy, conflictId) {
    const template = document.getElementById('resolution-button-template');
    const element = template.content.cloneNode(true);
    
    const button = element.querySelector('.resolution-btn');
    button.dataset.strategy = strategy;
    button.dataset.conflictId = conflictId;
    
    const name = element.querySelector('.strategy-name');
    name.textContent = this.getStrategyName(strategy);
    
    const description = element.querySelector('.strategy-description');
    description.textContent = this.getStrategyDescription(strategy);
    
    button.addEventListener('click', this.handleResolutionSelect);
    
    return element;
  }

  /**
   * Handle conflict selection
   * @param {Event} event - Change event
   */
  handleConflictSelect(event) {
    const conflictItem = event.target.closest('.conflict-item');
    const conflictId = conflictItem.dataset.conflictId;
    
    if (event.target.checked) {
      this.selectedConflicts.add(conflictId);
    } else {
      this.selectedConflicts.delete(conflictId);
    }
    
    this.updateUI();
  }

  /**
   * Handle select all conflicts
   * @param {Event} event - Change event
   */
  handleSelectAll(event) {
    const checkboxes = document.querySelectorAll('.conflict-select');
    
    checkboxes.forEach(checkbox => {
      checkbox.checked = event.target.checked;
      const conflictItem = checkbox.closest('.conflict-item');
      const conflictId = conflictItem.dataset.conflictId;
      
      if (event.target.checked) {
        this.selectedConflicts.add(conflictId);
      } else {
        this.selectedConflicts.delete(conflictId);
      }
    });
    
    this.updateUI();
  }

  /**
   * Handle expand/collapse conflict
   * @param {Event} event - Click event
   */
  handleExpandConflict(event) {
    const conflictItem = event.target.closest('.conflict-item');
    const details = conflictItem.querySelector('.conflict-details');
    const button = event.target.closest('.expand-conflict');
    
    const isExpanded = details.style.display !== 'none';
    
    if (isExpanded) {
      details.style.display = 'none';
      button.classList.remove('expanded');
    } else {
      details.style.display = 'block';
      button.classList.add('expanded');
    }
  }

  /**
   * Handle resolution strategy selection
   * @param {Event} event - Click event
   */
  handleResolutionSelect(event) {
    const button = event.target.closest('.resolution-btn');
    const strategy = button.dataset.strategy;
    const conflictId = button.dataset.conflictId;
    
    // Update resolution choice
    this.resolutionChoices[conflictId] = strategy;
    
    // Update button states
    const allButtons = button.parentElement.querySelectorAll('.resolution-btn');
    allButtons.forEach(btn => btn.classList.remove('selected'));
    button.classList.add('selected');
    
    this.updateUI();
  }

  /**
   * Handle batch actions
   * @param {string} strategy - Resolution strategy to apply
   */
  handleBatchAction(strategy) {
    if (this.selectedConflicts.size === 0) return;
    
    this.selectedConflicts.forEach(conflictId => {
      this.resolutionChoices[conflictId] = strategy;
      
      // Update UI for this conflict
      const conflictItem = document.querySelector(`[data-conflict-id="${conflictId}"]`);
      const buttons = conflictItem.querySelectorAll('.resolution-btn');
      buttons.forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.strategy === strategy);
      });
    });
    
    this.updateUI();
  }

  /**
   * Handle preview changes
   */
  async handlePreview() {
    try {
      const preview = await this.generatePreview();
      this.showPreview(preview);
    } catch (error) {
      console.error('Failed to generate preview:', error);
      this.showError('Failed to generate preview');
    }
  }

  /**
   * Handle apply resolution
   */
  async handleApply() {
    try {
      const applyButton = document.getElementById('apply-resolution');
      applyButton.disabled = true;
      applyButton.textContent = 'Applying...';
      
      // Validate all conflicts have resolutions
      const unresolvedConflicts = this.conflicts.filter(
        conflict => !this.resolutionChoices[conflict.id]
      );
      
      if (unresolvedConflicts.length > 0) {
        throw new Error(`${unresolvedConflicts.length} conflicts still need resolution`);
      }
      
      // Apply resolutions
      const result = await this.applyResolutions();
      
      // Notify background script
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          type: 'conflict-resolution-complete',
          result: result,
          resolutionChoices: this.resolutionChoices
        });
      }
      
      this.hide();
      
    } catch (error) {
      console.error('Failed to apply resolutions:', error);
      this.showError(error.message);
      
      const applyButton = document.getElementById('apply-resolution');
      applyButton.disabled = false;
      applyButton.textContent = 'Apply Resolution';
    }
  }

  /**
   * Handle cancel
   */
  handleCancel() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'conflict-resolution-cancelled'
      });
    }
    
    this.hide();
  }

  /**
   * Handle close
   */
  handleClose() {
    this.handleCancel();
  }

  /**
   * Update UI state
   */
  updateUI() {
    // Update selected count
    const selectedCount = document.getElementById('selected-count');
    selectedCount.textContent = `${this.selectedConflicts.size} selected`;
    
    // Update select all checkbox
    const selectAllCheckbox = document.getElementById('select-all-conflicts');
    selectAllCheckbox.checked = this.selectedConflicts.size === this.conflicts.length;
    selectAllCheckbox.indeterminate = this.selectedConflicts.size > 0 && 
                                      this.selectedConflicts.size < this.conflicts.length;
    
    // Update batch action buttons
    const batchButtons = document.querySelectorAll('.batch-btn');
    batchButtons.forEach(btn => {
      btn.disabled = this.selectedConflicts.size === 0;
    });
    
    // Update apply button
    const applyButton = document.getElementById('apply-resolution');
    const resolvedCount = Object.keys(this.resolutionChoices).length;
    applyButton.disabled = resolvedCount < this.conflicts.length;
    
    // Update preview summary
    this.updatePreviewSummary();
  }

  /**
   * Update preview summary
   */
  updatePreviewSummary() {
    const summary = document.getElementById('preview-summary');
    const resolvedCount = Object.keys(this.resolutionChoices).length;
    const totalCount = this.conflicts.length;
    
    if (resolvedCount === 0) {
      summary.textContent = 'No resolutions selected';
    } else if (resolvedCount === totalCount) {
      summary.textContent = `All ${totalCount} conflicts resolved`;
    } else {
      summary.textContent = `${resolvedCount} of ${totalCount} conflicts resolved`;
    }
  }

  /**
   * Generate preview of changes
   * @returns {Promise<Object>} Preview data
   */
  async generatePreview() {
    // This would integrate with the sync engine to generate a preview
    // For now, return a mock preview
    return {
      tabsToAdd: [],
      tabsToRemove: [],
      tabsToModify: [],
      summary: 'Preview generation not yet implemented'
    };
  }

  /**
   * Show preview
   * @param {Object} preview - Preview data
   */
  showPreview(preview) {
    // This would show a preview dialog
    // For now, just update the summary
    const summary = document.getElementById('preview-summary');
    summary.textContent = preview.summary;
  }

  /**
   * Apply resolutions
   * @returns {Promise<Object>} Application result
   */
  async applyResolutions() {
    // This would integrate with the sync engine to apply resolutions
    // For now, return a mock result
    return {
      success: true,
      appliedResolutions: Object.keys(this.resolutionChoices).length,
      message: 'Resolutions applied successfully'
    };
  }

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    // This would show an error dialog or notification
    alert(`Error: ${message}`);
  }

  // Utility methods

  getConflictTitle(conflict) {
    const typeMap = {
      timestamp: 'Timestamp Conflict',
      tab_metadata: 'Tab Metadata Conflict',
      structural: 'Tab Organization Conflict',
      device: 'Device Conflict'
    };
    
    return typeMap[conflict.type] || 'Unknown Conflict';
  }

  formatConflictType(type, subtype) {
    return `${type}${subtype ? `:${subtype}` : ''}`;
  }

  getSeverityText(severity) {
    const severityMap = {
      1: 'Low',
      2: 'Medium',
      3: 'High'
    };
    
    return severityMap[severity] || 'Unknown';
  }

  getSeverityClass(severity) {
    const classMap = {
      1: 'low',
      2: 'medium',
      3: 'high'
    };
    
    return classMap[severity] || 'low';
  }

  getDetailedDescription(conflict) {
    // Return more detailed description based on conflict type
    return conflict.description || 'No detailed description available';
  }

  formatTabMeta(tab) {
    const parts = [];
    
    if (tab.pinned) parts.push('Pinned');
    if (tab.windowId) parts.push(`Window ${tab.windowId}`);
    if (tab.index !== undefined) parts.push(`Position ${tab.index + 1}`);
    if (tab.timestamp) {
      const date = new Date(tab.timestamp);
      parts.push(date.toLocaleString());
    }
    
    return parts.join(' • ');
  }

  getStrategyName(strategy) {
    const nameMap = {
      local_wins: 'Keep Local',
      remote_wins: 'Keep Remote',
      merge: 'Auto Merge',
      merge_metadata: 'Merge Metadata',
      keep_newest: 'Keep Newest',
      keep_all: 'Keep All',
      manual: 'Manual Selection'
    };
    
    return nameMap[strategy] || strategy;
  }

  getStrategyDescription(strategy) {
    const descMap = {
      local_wins: 'Use the local version and discard remote changes',
      remote_wins: 'Use the remote version and discard local changes',
      merge: 'Automatically merge compatible changes',
      merge_metadata: 'Merge tab metadata intelligently',
      keep_newest: 'Keep the most recently modified version',
      keep_all: 'Keep all versions as separate tabs',
      manual: 'Manually select which tabs to keep'
    };
    
    return descMap[strategy] || 'No description available';
  }

  getLocalDeviceId() {
    // Use the device ID from context or fallback
    return this.deviceId || 'local-device';
  }
}

// Initialize modal when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  window.conflictResolutionModal = new ConflictResolutionModal();
  
  // Load conflict data from Chrome storage if available
  if (typeof chrome !== 'undefined' && chrome.storage) {
    try {
      // Get current window ID
      const currentWindow = await chrome.windows.getCurrent();
      const conflictDataKey = `conflict_data_${currentWindow.id}`;
      
      // Load conflict data
      const result = await chrome.storage.session.get(conflictDataKey);
      const conflictData = result[conflictDataKey];
      
      if (conflictData) {
        // Show conflicts in modal
        window.conflictResolutionModal.show(conflictData.conflicts, {
          context: conflictData.context,
          deviceId: conflictData.deviceId
        });
        
        // Clean up storage
        await chrome.storage.session.remove(conflictDataKey);
      }
    } catch (error) {
      console.error('Failed to load conflict data:', error);
    }
  }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConflictResolutionModal;
}