import type {
  BookmarkEntry,
  DecodeMap,
  DecodeTable,
  ExtensionSettings,
  ExtensionState,
  OptionsUiState
} from '@/lib/types';

const STORAGE_KEYS = {
  table: 'decodeTable',
  settings: 'settings',
  bookmarks: 'bookmarks',
  optionsUiState: 'optionsUiState'
} as const;

export const DEFAULT_ROOT_URLS = [
  'https://www.pub-riddle.com/',
  'https://www.qtes9gu0k.xyz/'
];

export const OKCK_HOST = 'qtes9gu0k.xyz';

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabledRootUrls: DEFAULT_ROOT_URLS,
  useSourceGlyphFontInOptions: true,
  enableOkck24HourMode: false,
  tooltipSearchOpenInNewTab: false
};

export const DEFAULT_TABLE: DecodeTable = {
  mappings: {},
  updatedAt: null
};

export const DEFAULT_OPTIONS_UI_STATE: OptionsUiState = {
  showRootUrls: false,
  converterTab: 'textToGlyph',
  tableDisplayMode: 'both'
};

function nowIso(): string {
  return new Date().toISOString();
}

function getSyncStorage(): chrome.storage.StorageArea {
  return chrome.storage.sync;
}

function getLocalStorage(): chrome.storage.StorageArea {
  return chrome.storage.local;
}

export async function getState(): Promise<ExtensionState> {
  const result = await getSyncStorage().get([
    STORAGE_KEYS.table,
    STORAGE_KEYS.settings,
    STORAGE_KEYS.bookmarks
  ]);

  const table =
    (result[STORAGE_KEYS.table] as DecodeTable | undefined) ?? DEFAULT_TABLE;
  const bookmarks = normalizeBookmarks(result[STORAGE_KEYS.bookmarks]);
  const rawSettings = result[STORAGE_KEYS.settings] as
    | (Partial<ExtensionSettings> & {
        enabledDomains?: string[];
        enableAllSites?: boolean;
      })
    | undefined;
  const legacyDomains = rawSettings?.enabledDomains ?? [];
  const storedRootUrls = rawSettings?.enabledRootUrls ?? [];
  const useSourceGlyphFontInOptions =
    rawSettings?.useSourceGlyphFontInOptions ??
    DEFAULT_SETTINGS.useSourceGlyphFontInOptions;
  const enableOkck24HourMode =
    rawSettings?.enableOkck24HourMode ?? DEFAULT_SETTINGS.enableOkck24HourMode;
  const tooltipSearchOpenInNewTab =
    rawSettings?.tooltipSearchOpenInNewTab ??
    DEFAULT_SETTINGS.tooltipSearchOpenInNewTab;
  const nextRootUrls = (
    storedRootUrls.length > 0 ? storedRootUrls : legacyDomains
  ).map((value) => {
    if (isHttpUrl(value)) {
      return normalizeRootUrl(value);
    }
    return normalizeRootUrl(`https://${normalizeHost(value)}/`);
  });

  return {
    table: {
      mappings: table.mappings ?? {},
      updatedAt: table.updatedAt ?? null
    },
    settings: {
      enabledRootUrls:
        nextRootUrls.length > 0 ? nextRootUrls : DEFAULT_ROOT_URLS,
      useSourceGlyphFontInOptions,
      enableOkck24HourMode,
      tooltipSearchOpenInNewTab
    },
    bookmarks
  };
}

export async function getOptionsUiState(): Promise<OptionsUiState> {
  const result = await getLocalStorage().get(STORAGE_KEYS.optionsUiState);
  const rawUiState = result[STORAGE_KEYS.optionsUiState] as
    | Partial<OptionsUiState>
    | undefined;

  return {
    showRootUrls:
      rawUiState?.showRootUrls ?? DEFAULT_OPTIONS_UI_STATE.showRootUrls,
    converterTab:
      rawUiState?.converterTab === 'glyphToText' ||
      rawUiState?.converterTab === 'textToGlyph'
        ? rawUiState.converterTab
        : DEFAULT_OPTIONS_UI_STATE.converterTab,
    tableDisplayMode:
      rawUiState?.tableDisplayMode === 'source' ||
      rawUiState?.tableDisplayMode === 'target' ||
      rawUiState?.tableDisplayMode === 'both'
        ? rawUiState.tableDisplayMode
        : DEFAULT_OPTIONS_UI_STATE.tableDisplayMode
  };
}

export async function setOptionsUiState(
  uiState: OptionsUiState
): Promise<void> {
  await getLocalStorage().set({
    [STORAGE_KEYS.optionsUiState]: uiState satisfies OptionsUiState
  });
}

export async function setSettings(settings: ExtensionSettings): Promise<void> {
  await getSyncStorage().set({
    [STORAGE_KEYS.settings]: {
      enabledRootUrls: settings.enabledRootUrls.map(normalizeRootUrl),
      useSourceGlyphFontInOptions: settings.useSourceGlyphFontInOptions,
      enableOkck24HourMode: settings.enableOkck24HourMode,
      tooltipSearchOpenInNewTab: settings.tooltipSearchOpenInNewTab
    } satisfies ExtensionSettings
  });
}

export async function setMappings(mappings: DecodeMap): Promise<void> {
  const normalizedMappings = normalizeMappings(mappings);
  await getSyncStorage().set({
    [STORAGE_KEYS.table]: {
      mappings: normalizedMappings,
      updatedAt: nowIso()
    } satisfies DecodeTable
  });
}

export async function upsertMappings(entries: DecodeMap): Promise<void> {
  const state = await getState();
  const nextMappings: DecodeMap = { ...state.table.mappings };
  for (const [source, target] of Object.entries(entries)) {
    if (target === '?') {
      delete nextMappings[source];
      continue;
    }
    nextMappings[source] = target;
  }

  await setMappings(nextMappings);
}

export async function setBookmarks(bookmarks: BookmarkEntry[]): Promise<void> {
  await getSyncStorage().set({
    [STORAGE_KEYS.bookmarks]: normalizeBookmarks(bookmarks)
  });
}

export async function removeBookmark(url: string): Promise<void> {
  const state = await getState();
  await setBookmarks(state.bookmarks.filter((entry) => entry.url !== url));
}

export async function toggleBookmark(
  bookmark: BookmarkEntry
): Promise<boolean> {
  const state = await getState();
  const normalizedBookmark = normalizeBookmark(bookmark);
  const isBookmarked = state.bookmarks.some(
    (entry) => entry.url === normalizedBookmark.url
  );

  if (isBookmarked) {
    await setBookmarks(
      state.bookmarks.filter((entry) => entry.url !== normalizedBookmark.url)
    );
    return false;
  }

  await setBookmarks([normalizedBookmark, ...state.bookmarks]);
  return true;
}

export function shouldRunOnUrl(
  settings: ExtensionSettings,
  url: string
): boolean {
  return resolveMatchedRootUrl(settings, url) !== null;
}

export function resolveMatchedRootUrl(
  settings: ExtensionSettings,
  url: string
): string | null {
  const matched = settings.enabledRootUrls
    .map(normalizeRootUrl)
    .filter((rootUrl) => isUrlWithinRoot(url, rootUrl));

  if (matched.length === 0) {
    return null;
  }

  // Prefer the most specific root URL when multiple roots match the same page.
  matched.sort((a, b) => {
    const aPathLength = new URL(a).pathname.length;
    const bPathLength = new URL(b).pathname.length;
    return bPathLength - aPathLength;
  });

  return matched[0] ?? null;
}

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

export function isOkckHost(host: string): boolean {
  return isSameHostOrWwwPair(normalizeHost(host), OKCK_HOST);
}

function isSameHostOrWwwPair(host: string, domain: string): boolean {
  const normalizedDomain = normalizeHost(domain);

  if (host === normalizedDomain) {
    return true;
  }

  if (host.startsWith('www.') && host.slice(4) === normalizedDomain) {
    return true;
  }

  if (
    normalizedDomain.startsWith('www.') &&
    normalizedDomain.slice(4) === host
  ) {
    return true;
  }

  return false;
}

export function normalizeRootUrl(value: string): string {
  const url = new URL(value);
  const pathname = url.pathname.endsWith('/')
    ? url.pathname
    : `${url.pathname}/`;
  return `${url.protocol}//${normalizeHost(url.hostname)}${pathname}`;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isUrlWithinRoot(urlValue: string, rootUrlValue: string): boolean {
  try {
    const current = new URL(urlValue);
    const root = new URL(normalizeRootUrl(rootUrlValue));

    if (current.protocol !== root.protocol) {
      return false;
    }

    if (
      !isSameHostOrWwwPair(
        normalizeHost(current.hostname),
        normalizeHost(root.hostname)
      )
    ) {
      return false;
    }

    const currentPath = current.pathname.endsWith('/')
      ? current.pathname
      : `${current.pathname}/`;
    return currentPath.startsWith(root.pathname);
  } catch {
    return false;
  }
}

export function toCsv(mappings: DecodeMap): string {
  const header = 'source,target';
  const lines = Object.entries(mappings)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, target]) => `${escapeCsv(source)},${escapeCsv(target)}`);

  return [header, ...lines].join('\n');
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

function normalizeMappings(mappings: DecodeMap): DecodeMap {
  return Object.fromEntries(
    Object.entries(mappings).filter(([, target]) => target !== '?')
  );
}

function normalizeBookmark(bookmark: BookmarkEntry): BookmarkEntry {
  return {
    url: bookmark.url.trim(),
    title: bookmark.title.trim() || bookmark.url.trim(),
    rootUrl: bookmark.rootUrl ? normalizeRootUrl(bookmark.rootUrl) : null
  };
}

function normalizeBookmarks(value: unknown): BookmarkEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const nextBookmarks: BookmarkEntry[] = [];
  const seenUrls = new Set<string>();

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const url =
      'url' in entry && typeof entry.url === 'string' ? entry.url.trim() : '';
    const title =
      'title' in entry && typeof entry.title === 'string'
        ? entry.title.trim()
        : url;
    const rootUrl =
      'rootUrl' in entry &&
      typeof entry.rootUrl === 'string' &&
      entry.rootUrl.trim()
        ? normalizeRootUrl(entry.rootUrl)
        : null;

    if (!url || seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);
    nextBookmarks.push({
      url,
      title: title || url,
      rootUrl
    });
  }

  return nextBookmarks;
}
