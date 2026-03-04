import { DEFAULT_SETTINGS, DEFAULT_TABLE } from '@/lib/storage';

async function ensureDefaults(): Promise<void> {
  const existing = await chrome.storage.sync.get(['decodeTable', 'settings']);

  if (!existing.decodeTable) {
    await chrome.storage.sync.set({ decodeTable: DEFAULT_TABLE });
  }

  if (!existing.settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  }
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    void ensureDefaults();
  });

  void ensureDefaults();
});
