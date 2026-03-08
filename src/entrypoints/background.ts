import {
  getContentScriptMatchesForPermittedOrigins,
  hasRootUrlPermission
} from '@/lib/host-permissions';
import { DEFAULT_SETTINGS, DEFAULT_TABLE, getState } from '@/lib/storage';

const CONTENT_SCRIPT_ID = 'okechika-content-runtime';
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

  try {
    await chrome.scripting.updateContentScripts([nextRegistration]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isNotFound =
      message.includes('does not exist') ||
      message.includes('No content script with id') ||
      message.includes('No matching scripts');
    if (!isNotFound) {
      console.error('Failed to update content script registration', {
        message,
        matches
      });
      throw error;
    }

    await chrome.scripting.registerContentScripts([nextRegistration]);
  }
}

let syncChain: Promise<void> = Promise.resolve();

function queueSyncRuntimeContentScript(): void {
  syncChain = syncChain
    .then(() => syncRuntimeContentScript())
    .catch((error) =>
      console.error('Failed to sync content script registration', error)
    );
}

export default defineBackground(() => {
  chrome.action.onClicked.addListener(() => {
    void chrome.runtime.openOptionsPage();
  });

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
