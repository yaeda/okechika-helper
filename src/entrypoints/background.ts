import {
  getContentScriptMatchesForPermittedOrigins,
  hasRootUrlPermission
} from '@/lib/host-permissions';
import {
  DEFAULT_SETTINGS,
  DEFAULT_TABLE,
  getPendingExtensionUpdate,
  getState,
  resolveMatchedRootUrl,
  setPendingExtensionUpdate
} from '@/lib/storage';

const CONTENT_SCRIPT_ID = 'okechika-content-runtime';
const SIDEPANEL_PATH = 'sidepanel.html';
const OPEN_SIDE_PANEL_TAB_IDS_KEY = 'openSidePanelTabIds';
const openSidePanelTabIds = new Set<number>();
let hydrateOpenSidePanelTabIdsPromise: Promise<void> | null = null;
const CONTENT_SCRIPT_REGISTRATION: Omit<
  chrome.scripting.RegisteredContentScript,
  'id' | 'matches'
> = {
  js: ['content-scripts/content.js'],
  css: ['content-scripts/content.css'],
  allFrames: true,
  matchOriginAsFallback: true,
  runAt: 'document_idle',
  persistAcrossSessions: true
};

type SidePanelLifecycleApi = typeof chrome.sidePanel & {
  close?: (options: { tabId?: number; windowId?: number }) => Promise<void>;
  onClosed?: chrome.events.Event<
    (info: { path: string; tabId?: number; windowId: number }) => void
  >;
  onOpened?: chrome.events.Event<
    (info: { path: string; tabId?: number; windowId: number }) => void
  >;
};

function supportsSidePanel(): boolean {
  return (
    typeof chrome.sidePanel !== 'undefined' &&
    typeof chrome.sidePanel.setPanelBehavior === 'function'
  );
}

function getSidePanelApi(): SidePanelLifecycleApi | null {
  if (!supportsSidePanel()) {
    return null;
  }

  return chrome.sidePanel as SidePanelLifecycleApi;
}

async function hydrateOpenSidePanelTabIds(): Promise<void> {
  const stored = await chrome.storage.session.get(OPEN_SIDE_PANEL_TAB_IDS_KEY);
  const tabIds = stored[OPEN_SIDE_PANEL_TAB_IDS_KEY];
  openSidePanelTabIds.clear();
  if (!Array.isArray(tabIds)) {
    return;
  }

  for (const value of tabIds) {
    if (typeof value === 'number') {
      openSidePanelTabIds.add(value);
    }
  }
}

function startHydratingOpenSidePanelTabIds(): Promise<void> {
  hydrateOpenSidePanelTabIdsPromise ??= hydrateOpenSidePanelTabIds().catch(
    (error) => {
      hydrateOpenSidePanelTabIdsPromise = null;
      throw error;
    }
  );

  return hydrateOpenSidePanelTabIdsPromise;
}

async function persistOpenSidePanelTabIds(): Promise<void> {
  await chrome.storage.session.set({
    [OPEN_SIDE_PANEL_TAB_IDS_KEY]: Array.from(openSidePanelTabIds)
  });
}

function markSidePanelOpen(tabId: number): void {
  openSidePanelTabIds.add(tabId);
  void persistOpenSidePanelTabIds();
}

function markSidePanelClosed(tabId: number): void {
  if (!openSidePanelTabIds.delete(tabId)) {
    return;
  }

  void persistOpenSidePanelTabIds();
}

async function ensureDefaults(): Promise<void> {
  const existing = await chrome.storage.sync.get(['decodeTable', 'settings']);

  if (!existing.decodeTable) {
    await chrome.storage.sync.set({ decodeTable: DEFAULT_TABLE });
  }

  if (!existing.settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  }
}

async function syncPendingExtensionUpdate(): Promise<void> {
  const currentVersion = chrome.runtime.getManifest().version;
  const pendingUpdate = await getPendingExtensionUpdate();

  if (pendingUpdate?.version === currentVersion) {
    await setPendingExtensionUpdate(null);
  }
}

async function syncRuntimeContentScript(): Promise<void> {
  const state = await getState();
  const allowedMatches = await Promise.all(
    state.settings.enabledRootUrls.map(async (rootUrl) => {
      const granted = await hasRootUrlPermission(rootUrl);
      return granted ? getContentScriptMatchesForPermittedOrigins(rootUrl) : [];
    })
  );
  const matches = Array.from(new Set(allowedMatches.flat()));

  if (matches.length === 0) {
    await chrome.scripting
      .unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] })
      .catch(() => {});
    return;
  }

  const nextRegistration: chrome.scripting.RegisteredContentScript = {
    id: CONTENT_SCRIPT_ID,
    matches,
    ...CONTENT_SCRIPT_REGISTRATION
  };

  await upsertRegisteredContentScript(
    nextRegistration,
    'Failed to update content script registration'
  );
}

async function shouldEnableRuntimeContentScriptForTab(
  url: string | undefined,
  state?: Awaited<ReturnType<typeof getState>>
): Promise<boolean> {
  const nextState = state ?? (await getState());
  const matchedRootUrl =
    typeof url === 'string'
      ? resolveMatchedRootUrl(nextState.settings, url)
      : null;

  return (
    matchedRootUrl !== null && (await hasRootUrlPermission(matchedRootUrl))
  );
}

async function reinjectRuntimeContentScriptIntoEligibleTabs(): Promise<void> {
  const state = await getState();
  const tabs = await chrome.tabs.query({});

  await Promise.all(
    tabs.map(async (tab) => {
      try {
        if (
          typeof tab.id !== 'number' ||
          !(await shouldEnableRuntimeContentScriptForTab(tab.url, state))
        ) {
          return;
        }

        await chrome.scripting.insertCSS({
          target: { tabId: tab.id, allFrames: true },
          files: CONTENT_SCRIPT_REGISTRATION.css
        });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: CONTENT_SCRIPT_REGISTRATION.js
        });
        await syncSidePanelForTab(tab.id, tab.url, state);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isGone =
          message.includes('No tab with id') ||
          message.includes('Tabs cannot be edited right now');
        const isRestricted =
          message.includes('Cannot access contents of') ||
          message.includes('Missing host permission') ||
          message.includes('The tab was closed');
        if (!isGone && !isRestricted) {
          throw error;
        }
      }
    })
  );
}

async function syncSidePanelState(): Promise<void> {
  const state = await getState();

  if (!supportsSidePanel()) {
    return;
  }

  await chrome.sidePanel.setOptions({
    enabled: false
  });

  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: false
  });

  await syncSidePanelTabs(state);
}

async function syncSidePanelForTab(
  tabId: number,
  url: string | undefined,
  state?: Awaited<ReturnType<typeof getState>>
): Promise<void> {
  if (!supportsSidePanel()) {
    return;
  }

  const nextState = state ?? (await getState());
  const matchedRootUrl =
    typeof url === 'string'
      ? resolveMatchedRootUrl(nextState.settings, url)
      : null;
  const enabled =
    matchedRootUrl !== null && (await hasRootUrlPermission(matchedRootUrl));

  if (!enabled) {
    markSidePanelClosed(tabId);
  }

  await chrome.sidePanel.setOptions({
    tabId,
    enabled,
    ...(enabled ? { path: SIDEPANEL_PATH } : {})
  });
}

async function syncSidePanelTabs(
  state?: Awaited<ReturnType<typeof getState>>
): Promise<void> {
  if (!supportsSidePanel()) {
    return;
  }

  const nextState = state ?? (await getState());
  const tabs = await chrome.tabs.query({});

  await Promise.all(
    tabs.map(async (tab) => {
      if (typeof tab.id !== 'number') {
        return;
      }

      await syncSidePanelForTab(tab.id, tab.url, nextState);
    })
  );
}

async function syncSidePanelTabById(tabId: number): Promise<void> {
  if (!supportsSidePanel()) {
    return;
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    if (typeof tab.id !== 'number') {
      return;
    }

    await syncSidePanelForTab(tab.id, tab.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isGone =
      message.includes('No tab with id') ||
      message.includes('Tabs cannot be edited right now');
    if (!isGone) {
      throw error;
    }
  }
}

async function toggleSidePanelForTab(tabId: number): Promise<void> {
  const sidePanel = getSidePanelApi();
  if (!sidePanel) {
    return;
  }

  const isOpen = openSidePanelTabIds.has(tabId);

  if (isOpen && typeof sidePanel.close === 'function') {
    try {
      await sidePanel.close({ tabId });
      markSidePanelClosed(tabId);
      return;
    } catch (error) {
      console.error('Failed to close extension side panel from page button', {
        tabId,
        error
      });
      return;
    }
  }

  try {
    await chrome.sidePanel.open({ tabId });
    markSidePanelOpen(tabId);
  } catch (error) {
    console.error('Failed to open extension side panel from page button', {
      tabId,
      error
    });
  }
}

function handleOpenSidePanelMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender
): void {
  if (
    !message ||
    typeof message !== 'object' ||
    !('type' in message) ||
    message.type !== 'open-side-panel-for-tab'
  ) {
    return;
  }

  if (!supportsSidePanel() || typeof sender.tab?.id !== 'number') {
    return;
  }

  const tabId = sender.tab.id;
  void toggleSidePanelForTab(tabId);
}

async function notifyTabsBeforeExtensionReload(): Promise<void> {
  const tabs = await chrome.tabs.query({});

  await Promise.all(
    tabs.map(async (tab) => {
      if (typeof tab.id !== 'number') {
        return;
      }

      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'prepare-extension-reload'
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isNoReceiver =
          message.includes('Receiving end does not exist') ||
          message.includes('Could not establish connection');
        const isRestrictedUrl =
          message.includes('Cannot access contents of') ||
          message.includes('The tab was closed');
        if (!isNoReceiver && !isRestrictedUrl) {
          throw error;
        }
      }
    })
  );
}

function registerSidePanelLifecycleListeners(): void {
  const sidePanel = getSidePanelApi();
  if (!sidePanel) {
    return;
  }

  sidePanel.onOpened?.addListener((info) => {
    if (info.path !== SIDEPANEL_PATH || typeof info.tabId !== 'number') {
      return;
    }

    markSidePanelOpen(info.tabId);
  });

  sidePanel.onClosed?.addListener((info) => {
    if (info.path !== SIDEPANEL_PATH || typeof info.tabId !== 'number') {
      return;
    }

    markSidePanelClosed(info.tabId);
  });
}

async function upsertRegisteredContentScript(
  registration: chrome.scripting.RegisteredContentScript,
  errorLabel: string
): Promise<void> {
  try {
    await chrome.scripting.updateContentScripts([registration]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isNotFound =
      message.includes('does not exist') ||
      message.includes('No content script with id') ||
      message.includes('No matching scripts');
    if (!isNotFound) {
      console.error(errorLabel, {
        message,
        matches: registration.matches
      });
      throw error;
    }

    await chrome.scripting.registerContentScripts([registration]);
  }
}

let syncChain: Promise<void> = Promise.resolve();
let sidePanelSyncChain: Promise<void> = Promise.resolve();

function queueSyncRuntimeContentScript(): void {
  syncChain = syncChain
    .then(async () => {
      await syncRuntimeContentScript();
    })
    .catch((error) =>
      console.error('Failed to sync extension runtime state', error)
    );
}

function queueSyncSidePanelState(): void {
  sidePanelSyncChain = sidePanelSyncChain
    .then(async () => {
      await syncSidePanelState();
    })
    .catch((error) =>
      console.error('Failed to sync extension side panel state', error)
    );
}

function queueSyncSidePanelTabById(tabId: number): void {
  sidePanelSyncChain = sidePanelSyncChain
    .then(async () => {
      await syncSidePanelTabById(tabId);
    })
    .catch((error) =>
      console.error('Failed to sync extension side panel state', error)
    );
}

export default defineBackground(() => {
  registerSidePanelLifecycleListeners();
  void startHydratingOpenSidePanelTabIds();

  chrome.runtime.onInstalled.addListener((details) => {
    void ensureDefaults();
    void syncPendingExtensionUpdate();
    void startHydratingOpenSidePanelTabIds();
    queueSyncRuntimeContentScript();
    queueSyncSidePanelState();
    if (details.reason === 'update') {
      void reinjectRuntimeContentScriptIntoEligibleTabs().catch((error) =>
        console.error(
          'Failed to reinject content scripts after extension update',
          error
        )
      );
    }
  });

  chrome.runtime.onUpdateAvailable.addListener((details) => {
    void setPendingExtensionUpdate({
      version: details.version,
      detectedAt: new Date().toISOString()
    });
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') {
      return;
    }

    if (changes.settings) {
      queueSyncRuntimeContentScript();
      queueSyncSidePanelState();
    }
  });

  chrome.permissions.onAdded.addListener(() => {
    queueSyncRuntimeContentScript();
    queueSyncSidePanelState();
  });

  chrome.permissions.onRemoved.addListener(() => {
    queueSyncRuntimeContentScript();
    queueSyncSidePanelState();
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    queueSyncSidePanelTabById(tabId);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      queueSyncSidePanelTabById(tabId);
      return;
    }

    if (typeof tab.url === 'string' && changeInfo.status === 'loading') {
      queueSyncSidePanelTabById(tabId);
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    markSidePanelClosed(tabId);
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      message &&
      typeof message === 'object' &&
      'type' in message &&
      message.type === 'prepare-extension-reload'
    ) {
      void notifyTabsBeforeExtensionReload()
        .then(() => {
          sendResponse();
        })
        .catch((error) => {
          console.error('Failed to notify tabs before extension reload', error);
          sendResponse();
        });
      return true;
    }

    handleOpenSidePanelMessage(message, sender);
    return false;
  });

  void ensureDefaults();
  void syncPendingExtensionUpdate();
  queueSyncRuntimeContentScript();
  queueSyncSidePanelState();
});
