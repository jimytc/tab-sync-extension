// Unit tests for Tab Manager

import { TabManager } from '../shared/tab-manager.js';

// Mock Chrome APIs for testing
const mockChrome = {
  tabs: {
    query: null, // Will be mocked in tests
    create: null, // Will be mocked in tests
    remove: null, // Will be mocked in tests
    update: null, // Will be mocked in tests
    move: null // Will be mocked in tests
  },
  windows: {
    getAll: null, // Will be mocked in tests
    create: null // Will be mocked in tests
  },
  storage: {
    local: {
      get: null, // Will be mocked in tests
      set: null // Will be mocked in tests
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
    console.log('🧪 Running Tab Manager tests...\n');
    
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

// Mock sample Chrome tabs
const mockChromeTabs = [
  {
    id: 1,
    url: 'https://example.com',
    title: 'Example Site',
    favIconUrl: 'https://example.com/favicon.ico',
    windowId: 1,
    index: 0,
    pinned: false,
    active: true
  },
  {
    id: 2,
    url: 'https://github.com',
    title: 'GitHub',
    favIconUrl: 'https://github.com/favicon.ico',
    windowId: 1,
    index: 1,
    pinned: true,
    active: false
  }
];

// Test TabManager instantiation
test.test('TabManager - instantiation', () => {
  const tabManager = new TabManager();
  test.assertEqual(tabManager.deviceId, null, 'Should have no device ID initially');
  test.assertEqual(tabManager.initialized, false, 'Should not be initialized initially');
});

// Test TabManager initialization
test.test('TabManager - initialize', async () => {
  const tabManager = new TabManager();
  
  // Mock storage for device ID
  mockChrome.storage.local.get = async (keys) => {
    return { deviceId: 'test_device_123' };
  };

  await tabManager.initialize();
  
  test.assertEqual(tabManager.deviceId, 'test_device_123', 'Should set device ID');
  test.assertEqual(tabManager.initialized, true, 'Should be initialized');
});

// Test serializeTab method
test.test('TabManager - serializeTab', async () => {
  const tabManager = new TabManager();
  tabManager.deviceId = 'test_device_123';
  tabManager.initialized = true;
  
  const chromeTab = mockChromeTabs[0];
  const serialized = await tabManager.serializeTab(chromeTab);
  
  test.assert(serialized.id.startsWith('tab_'), 'Should generate tab ID');
  test.assertEqual(serialized.url, 'https://example.com', 'Should preserve URL');
  test.assertEqual(serialized.title, 'Example Site', 'Should preserve title');
  test.assertEqual(serialized.windowId, 1, 'Should preserve window ID');
  test.assertEqual(serialized.index, 0, 'Should preserve index');
  test.assertEqual(serialized.deviceId, 'test_device_123', 'Should set device ID');
  test.assertEqual(serialized.pinned, false, 'Should preserve pinned status');
  test.assertEqual(serialized.active, true, 'Should preserve active status');
  test.assert(typeof serialized.timestamp === 'number', 'Should set timestamp');
});

// Test getCurrentTabs method
test.test('TabManager - getCurrentTabs', async () => {
  const tabManager = new TabManager();
  tabManager.deviceId = 'test_device_123';
  tabManager.initialized = true;
  
  // Mock chrome.tabs.query
  mockChrome.tabs.query = async (queryInfo) => {
    return mockChromeTabs;
  };

  const tabs = await tabManager.getCurrentTabs();
  
  test.assertEqual(tabs.length, 2, 'Should return correct number of tabs');
  test.assertEqual(tabs[0].url, 'https://example.com', 'Should serialize first tab correctly');
  test.assertEqual(tabs[1].url, 'https://github.com', 'Should serialize second tab correctly');
});

// Test getTabsFromWindow method
test.test('TabManager - getTabsFromWindow', async () => {
  const tabManager = new TabManager();
  tabManager.deviceId = 'test_device_123';
  tabManager.initialized = true;
  
  // Mock chrome.tabs.query for specific window
  mockChrome.tabs.query = async (queryInfo) => {
    if (queryInfo.windowId === 1) {
      return [mockChromeTabs[0]]; // Only first tab
    }
    return [];
  };

  const tabs = await tabManager.getTabsFromWindow(1);
  
  test.assertEqual(tabs.length, 1, 'Should return tabs from specific window');
  test.assertEqual(tabs[0].url, 'https://example.com', 'Should return correct tab');
});

// Test getActiveTab method
test.test('TabManager - getActiveTab', async () => {
  const tabManager = new TabManager();
  tabManager.deviceId = 'test_device_123';
  tabManager.initialized = true;
  
  // Mock chrome.tabs.query for active tab
  mockChrome.tabs.query = async (queryInfo) => {
    if (queryInfo.active && queryInfo.currentWindow) {
      return [mockChromeTabs[0]]; // Return active tab
    }
    return [];
  };

  const activeTab = await tabManager.getActiveTab();
  
  test.assert(activeTab !== null, 'Should return active tab');
  test.assertEqual(activeTab.url, 'https://example.com', 'Should return correct active tab');
  test.assertEqual(activeTab.active, true, 'Should be marked as active');
});

// Test getActiveTab with no active tab
test.test('TabManager - getActiveTab with no active tab', async () => {
  const tabManager = new TabManager();
  tabManager.deviceId = 'test_device_123';
  tabManager.initialized = true;
  
  // Mock chrome.tabs.query to return no tabs
  mockChrome.tabs.query = async (queryInfo) => {
    return [];
  };

  const activeTab = await tabManager.getActiveTab();
  
  test.assertEqual(activeTab, null, 'Should return null when no active tab');
});

// Test createTabs method
test.test('TabManager - createTabs', async () => {
  const tabManager = new TabManager();
  tabManager.deviceId = 'test_device_123';
  tabManager.initialized = true;
  
  const tabsToCreate = [
    {
      id: 'tab_test_1',
      url: 'https://test1.com',
      title: 'Test 1',
      windowId: 1,
      index: 0,
      timestamp: Date.now(),
      deviceId: 'test_device_123',
      pinned: false
    },
    {
      id: 'tab_test_2',
      url: 'https://test2.com',
      title: 'Test 2',
      windowId: 1,
      index: 1,
      timestamp: Date.now(),
      deviceId: 'test_device_123',
      pinned: true
    }
  ];

  let createdTabs = [];
  mockChrome.tabs.create = async (createProperties) => {
    const newTab = {
      id: createdTabs.length + 100,
      url: createProperties.url,
      windowId: createProperties.windowId,
      active: createProperties.active,
      pinned: createProperties.pinned
    };
    createdTabs.push(newTab);
    return newTab;
  };

  const result = await tabManager.createTabs(tabsToCreate);
  
  test.assertEqual(result.length, 2, 'Should create correct number of tabs');
  test.assertEqual(result[0].url, 'https://test1.com', 'Should create first tab correctly');
  test.assertEqual(result[1].url, 'https://test2.com', 'Should create second tab correctly');
  test.assertEqual(result[1].pinned, true, 'Should preserve pinned status');
});

// Test createTabs with new window
test.test('TabManager - createTabs with new window', async () => {
  const tabManager = new TabManager();
  tabManager.deviceId = 'test_device_123';
  tabManager.initialized = true;
  
  const tabsToCreate = [{
    id: 'tab_test_1',
    url: 'https://test.com',
    title: 'Test',
    windowId: 1,
    index: 0,
    timestamp: Date.now(),
    deviceId: 'test_device_123'
  }];

  // Mock window creation
  mockChrome.windows.create = async (createData) => {
    return { id: 999, focused: true };
  };

  // Mock tabs query for new window (to close default tab)
  mockChrome.tabs.query = async (queryInfo) => {
    if (queryInfo.windowId === 999) {
      return [{ id: 1000, url: 'chrome://newtab/' }];
    }
    return [];
  };

  // Mock tab removal
  mockChrome.tabs.remove = async (tabIds) => {};

  // Mock tab creation
  mockChrome.tabs.create = async (createProperties) => {
    return {
      id: 1001,
      url: createProperties.url,
      windowId: createProperties.windowId
    };
  };

  const result = await tabManager.createTabs(tabsToCreate, { createNewWindow: true });
  
  test.assertEqual(result.length, 1, 'Should create tab in new window');
  test.assertEqual(result[0].windowId, 999, 'Should use new window ID');
});

// Test closeTabs method
test.test('TabManager - closeTabs', async () => {
  const tabManager = new TabManager();
  
  let removedTabIds = [];
  mockChrome.tabs.remove = async (tabIds) => {
    removedTabIds = Array.isArray(tabIds) ? tabIds : [tabIds];
  };

  await tabManager.closeTabs([1, 2, 3]);
  
  test.assertArrayEqual(removedTabIds, [1, 2, 3], 'Should close correct tabs');
});

// Test updateTab method
test.test('TabManager - updateTab', async () => {
  const tabManager = new TabManager();
  
  let updatedTabId = null;
  let updateProperties = null;
  
  mockChrome.tabs.update = async (tabId, properties) => {
    updatedTabId = tabId;
    updateProperties = properties;
    return { id: tabId, ...properties };
  };

  const result = await tabManager.updateTab(123, { active: true, pinned: false });
  
  test.assertEqual(updatedTabId, 123, 'Should update correct tab');
  test.assertEqual(updateProperties.active, true, 'Should set active property');
  test.assertEqual(updateProperties.pinned, false, 'Should set pinned property');
});

// Test moveTabs method
test.test('TabManager - moveTabs', async () => {
  const tabManager = new TabManager();
  
  let movedTabIds = null;
  let moveProperties = null;
  
  mockChrome.tabs.move = async (tabIds, properties) => {
    movedTabIds = tabIds;
    moveProperties = properties;
    return Array.isArray(tabIds) ? tabIds.map(id => ({ id })) : [{ id: tabIds }];
  };

  const result = await tabManager.moveTabs([1, 2], { windowId: 999, index: 0 });
  
  test.assertArrayEqual(movedTabIds, [1, 2], 'Should move correct tabs');
  test.assertEqual(moveProperties.windowId, 999, 'Should move to correct window');
  test.assertEqual(moveProperties.index, 0, 'Should move to correct index');
});

// Test findTabsByUrl method
test.test('TabManager - findTabsByUrl', async () => {
  const tabManager = new TabManager();
  tabManager.deviceId = 'test_device_123';
  tabManager.initialized = true;
  
  // Mock getCurrentTabs
  mockChrome.tabs.query = async () => mockChromeTabs;

  const matchingTabs = await tabManager.findTabsByUrl('github');
  
  test.assertEqual(matchingTabs.length, 1, 'Should find matching tabs');
  test.assert(matchingTabs[0].url.includes('github'), 'Should match correct URL');
});

// Test findDuplicateTabs method
test.test('TabManager - findDuplicateTabs', async () => {
  const tabManager = new TabManager();
  tabManager.deviceId = 'test_device_123';
  tabManager.initialized = true;
  
  // Mock tabs with duplicates
  const tabsWithDuplicates = [
    ...mockChromeTabs,
    {
      id: 3,
      url: 'https://example.com', // Duplicate URL
      title: 'Example Site Copy',
      windowId: 2,
      index: 0
    }
  ];
  
  mockChrome.tabs.query = async () => tabsWithDuplicates;

  const result = await tabManager.findDuplicateTabs();
  
  test.assertEqual(result.uniqueUrls, 1, 'Should find one unique URL with duplicates');
  test.assertEqual(result.duplicateCount, 1, 'Should count one duplicate');
  test.assert(result.duplicates['https://example.com'], 'Should group duplicates by URL');
  test.assertEqual(result.duplicates['https://example.com'].length, 2, 'Should find both duplicate tabs');
});

// Export test runner for use in extension
export { test as tabManagerTests };

// Auto-run tests if this file is loaded directly
if (typeof window !== 'undefined' && window.location) {
  // Running in browser context
  test.run().then(success => {
    if (success) {
      console.log('🎉 All Tab Manager tests passed!');
    } else {
      console.error('💥 Some Tab Manager tests failed!');
    }
  });
}