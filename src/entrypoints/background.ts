import { getContentScriptMatchesForRootUrl, hasRootUrlPermission } from '@/lib/host-permissions';
import { DEFAULT_SETTINGS, DEFAULT_TABLE, getState } from '@/lib/storage';

const CONTENT_SCRIPT_ID = 'okechika-content-runtime';

async function ensureDefaults(): Promise<void> {
  const existing = await chrome.storage.sync.get(['decodeTable', 'settings']);

  if (!existing.decodeTable) {
    await chrome.storage.sync.set({ decodeTable: DEFAULT_TABLE });
  }

  if (!existing.settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  }
}

async function syncRuntimeContentScript(): Promise<void> {
  const state = await getState();
  const allowedMatches = await Promise.all(
    state.settings.enabledRootUrls.map(async (rootUrl) => {
      const granted = await hasRootUrlPermission(rootUrl);
      return granted ? getContentScriptMatchesForRootUrl(rootUrl) : [];
    })
  );
  const matches = Array.from(new Set(allowedMatches.flat()));

  await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] }).catch(() => {});
  if (matches.length === 0) {
    return;
  }

  await chrome.scripting.registerContentScripts([
    {
      id: CONTENT_SCRIPT_ID,
      js: ['content-scripts/content.js'],
      css: ['content-scripts/content.css'],
      matches,
      allFrames: true,
      matchOriginAsFallback: true,
      runAt: 'document_idle',
      persistAcrossSessions: true
    }
  ]);
}

let syncChain: Promise<void> = Promise.resolve();

function queueSyncRuntimeContentScript(): void {
  syncChain = syncChain
    .then(() => syncRuntimeContentScript())
    .catch((error) => console.error('Failed to sync content script registration', error));
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    void ensureDefaults();
    queueSyncRuntimeContentScript();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') {
      return;
    }

    if (changes.settings) {
      queueSyncRuntimeContentScript();
    }
  });

  chrome.permissions.onAdded.addListener(() => {
    queueSyncRuntimeContentScript();
  });

  chrome.permissions.onRemoved.addListener(() => {
    queueSyncRuntimeContentScript();
  });

  void ensureDefaults();
  queueSyncRuntimeContentScript();
});
