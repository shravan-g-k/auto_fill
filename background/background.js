/**
 * AutoFill Pro — Background Service Worker
 * Handles context menus, message relay, badge updates, and site disable list.
 */

const STORAGE_KEY = '__autofill_pro_profiles__';
const ACTIVE_PROFILE_KEY = '__autofill_pro_active__';
const DISABLED_SITES_KEY = '__autofill_pro_disabled_sites__';

// ---- Context Menu ----

chrome.runtime.onInstalled.addListener(() => {
  // Create context menu items
  chrome.contextMenus.create({
    id: 'autofill-fill-page',
    title: 'Fill this form with AutoFill Pro',
    contexts: ['page', 'editable']
  });

  chrome.contextMenus.create({
    id: 'autofill-toggle-site',
    title: 'Disable AutoFill Pro on this site',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'separator',
    type: 'separator',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'autofill-open-settings',
    title: 'Open AutoFill Pro Settings',
    contexts: ['page']
  });

  // Set initial badge
  updateBadge();
});

// ---- Context Menu Click Handler ----

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'autofill-fill-page') {
    // Send fill command to content script
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'MANUAL_FILL' });
    } catch (e) {
      console.warn('AutoFill Pro: Could not reach content script', e);
    }
  }

  if (info.menuItemId === 'autofill-toggle-site') {
    await toggleSiteDisable(tab);
  }

  if (info.menuItemId === 'autofill-open-settings') {
    chrome.action.openPopup();
  }
});

// ---- Site Disable Toggle ----

async function toggleSiteDisable(tab) {
  const url = new URL(tab.url);
  const hostname = url.hostname;

  const result = await chrome.storage.local.get([DISABLED_SITES_KEY]);
  let disabledSites = result[DISABLED_SITES_KEY] || [];

  const index = disabledSites.indexOf(hostname);
  if (index >= 0) {
    disabledSites.splice(index, 1);
  } else {
    disabledSites.push(hostname);
  }

  await chrome.storage.local.set({ [DISABLED_SITES_KEY]: disabledSites });

  // Update context menu text
  updateContextMenuForTab(tab);

  // Reload content script behavior
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'PROFILE_UPDATED' });
  } catch (e) { /* ignore */ }
}

// ---- Update Context Menu For Active Tab ----

async function updateContextMenuForTab(tab) {
  if (!tab || !tab.url) return;

  try {
    const url = new URL(tab.url);
    const hostname = url.hostname;
    const result = await chrome.storage.local.get([DISABLED_SITES_KEY]);
    const disabledSites = result[DISABLED_SITES_KEY] || [];
    const isDisabled = disabledSites.includes(hostname);

    chrome.contextMenus.update('autofill-toggle-site', {
      title: isDisabled
        ? `Enable AutoFill Pro on ${hostname}`
        : `Disable AutoFill Pro on ${hostname}`
    });
  } catch (e) { /* ignore for non-http pages */ }
}

// ---- Badge Updates ----

async function updateBadge() {
  const result = await chrome.storage.local.get([STORAGE_KEY, ACTIVE_PROFILE_KEY]);
  const profiles = result[STORAGE_KEY] || {};
  const activeId = result[ACTIVE_PROFILE_KEY] || 'default';
  const profile = profiles[activeId];

  if (profile && profile.name) {
    // Show first 2 characters of profile name
    const abbr = profile.name.substring(0, 2).toUpperCase();
    chrome.action.setBadgeText({ text: abbr });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
    chrome.action.setTitle({ title: `AutoFill Pro — ${profile.name}` });
  } else {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'AutoFill Pro — Click to set up' });
  }
}

// ---- Message Handler ----

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PROFILE_UPDATED') {
    // Update badge
    updateBadge();

    // Notify all tabs to refresh
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id !== sender.tab?.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'PROFILE_UPDATED' }).catch(() => {});
        }
      });
    });

    sendResponse({ ok: true });
  }

  return true;
});

// ---- Storage Change Listener ----

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes[STORAGE_KEY] || changes[ACTIVE_PROFILE_KEY]) {
      updateBadge();
    }
  }
});

// ---- Tab Activation Listener ----

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  updateContextMenuForTab(tab);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    updateContextMenuForTab(tab);
  }
});
