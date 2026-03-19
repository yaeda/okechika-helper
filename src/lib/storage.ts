import type {
  BookmarkEntry,
  ConversionTableHighlightState,
  DecodeMap,
  DecodeTable,
  DiscoveredPageEntry,
  ExtensionSettings,
  ExtensionState,
  OptionsUiState,
  PendingExtensionUpdate,
  PopupUiState
} from '@/lib/types';

const STORAGE_KEYS = {
  table: 'decodeTable',
  settings: 'settings',
  discoveredPages: 'discoveredPages',
  bookmarks: 'bookmarks',
  optionsUiState: 'optionsUiState',
  popupUiState: 'popupUiState',
  conversionTableHighlightState: 'conversionTableHighlightState',
  pendingExtensionUpdate: 'pendingExtensionUpdate'
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
  enableOkckResponsiveLayoutFix: false,
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

export const DEFAULT_POPUP_UI_STATE: PopupUiState = {
  showBookmarkedOnly: false
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
  const [syncResult, localResult] = await Promise.all([
    getSyncStorage().get([
      STORAGE_KEYS.table,
      STORAGE_KEYS.settings,
      STORAGE_KEYS.bookmarks
    ]),
    getLocalStorage().get(STORAGE_KEYS.discoveredPages)
  ]);

  const table =
    (syncResult[STORAGE_KEYS.table] as DecodeTable | undefined) ??
    DEFAULT_TABLE;
  const storedDiscoveredPages = normalizeSavedPages(
    localResult[STORAGE_KEYS.discoveredPages]
  );
  const bookmarks = normalizeBookmarks(syncResult[STORAGE_KEYS.bookmarks]);
  const rawSettings = syncResult[STORAGE_KEYS.settings] as
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
  const enableOkckResponsiveLayoutFix =
    rawSettings?.enableOkckResponsiveLayoutFix ??
    DEFAULT_SETTINGS.enableOkckResponsiveLayoutFix;
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
      enableOkckResponsiveLayoutFix,
      tooltipSearchOpenInNewTab
    },
    discoveredPages: mergeSavedPages(storedDiscoveredPages, bookmarks),
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

export async function getPopupUiState(): Promise<PopupUiState> {
  const result = await getLocalStorage().get(STORAGE_KEYS.popupUiState);
  const rawUiState = result[STORAGE_KEYS.popupUiState] as
    | Partial<PopupUiState>
    | undefined;

  return {
    showBookmarkedOnly:
      rawUiState?.showBookmarkedOnly ??
      DEFAULT_POPUP_UI_STATE.showBookmarkedOnly
  };
}

export async function getConversionTableHighlightState(): Promise<ConversionTableHighlightState | null> {
  const result = await getLocalStorage().get(
    STORAGE_KEYS.conversionTableHighlightState
  );
  const rawState = result[STORAGE_KEYS.conversionTableHighlightState] as
    | Partial<ConversionTableHighlightState>
    | undefined;

  if (
    !rawState ||
    !Array.isArray(rawState.sourceChars) ||
    typeof rawState.selectedAt !== 'string'
  ) {
    return null;
  }

  const sourceChars = rawState.sourceChars.filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );

  if (sourceChars.length === 0) {
    return null;
  }

  return {
    sourceChars,
    selectedAt: rawState.selectedAt
  };
}

export async function getPendingExtensionUpdate(): Promise<PendingExtensionUpdate | null> {
  const result = await getLocalStorage().get(
    STORAGE_KEYS.pendingExtensionUpdate
  );
  const rawPendingUpdate = result[STORAGE_KEYS.pendingExtensionUpdate] as
    | Partial<PendingExtensionUpdate>
    | undefined;

  if (
    !rawPendingUpdate ||
    typeof rawPendingUpdate.version !== 'string' ||
    rawPendingUpdate.version.length === 0
  ) {
    return null;
  }

  return {
    version: rawPendingUpdate.version,
    detectedAt:
      typeof rawPendingUpdate.detectedAt === 'string'
        ? rawPendingUpdate.detectedAt
        : nowIso()
  };
}

export async function setOptionsUiState(
  uiState: OptionsUiState
): Promise<void> {
  await getLocalStorage().set({
    [STORAGE_KEYS.optionsUiState]: uiState satisfies OptionsUiState
  });
}

export async function setPopupUiState(uiState: PopupUiState): Promise<void> {
  await getLocalStorage().set({
    [STORAGE_KEYS.popupUiState]: uiState satisfies PopupUiState
  });
}

export async function setConversionTableHighlightState(
  state: ConversionTableHighlightState | null
): Promise<void> {
  if (!state || state.sourceChars.length === 0) {
    await getLocalStorage().remove(STORAGE_KEYS.conversionTableHighlightState);
    return;
  }

  await getLocalStorage().set({
    [STORAGE_KEYS.conversionTableHighlightState]:
      state satisfies ConversionTableHighlightState
  });
}

export async function setPendingExtensionUpdate(
  update: PendingExtensionUpdate | null
): Promise<void> {
  if (!update) {
    await getLocalStorage().remove(STORAGE_KEYS.pendingExtensionUpdate);
    return;
  }

  await getLocalStorage().set({
    [STORAGE_KEYS.pendingExtensionUpdate]:
      update satisfies PendingExtensionUpdate
  });
}

export async function setSettings(settings: ExtensionSettings): Promise<void> {
  await getSyncStorage().set({
    [STORAGE_KEYS.settings]: {
      enabledRootUrls: settings.enabledRootUrls.map(normalizeRootUrl),
      useSourceGlyphFontInOptions: settings.useSourceGlyphFontInOptions,
      enableOkck24HourMode: settings.enableOkck24HourMode,
      enableOkckResponsiveLayoutFix: settings.enableOkckResponsiveLayoutFix,
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

export async function setDiscoveredPages(
  discoveredPages: DiscoveredPageEntry[]
): Promise<void> {
  await getLocalStorage().set({
    [STORAGE_KEYS.discoveredPages]: normalizeSavedPages(discoveredPages)
  });
}

export async function recordDiscoveredPage(
  page: DiscoveredPageEntry
): Promise<void> {
  const result = await getLocalStorage().get(STORAGE_KEYS.discoveredPages);
  const storedDiscoveredPages = normalizeSavedPages(
    result[STORAGE_KEYS.discoveredPages]
  );
  const normalizedPage = normalizeSavedPage(page);
  const nextPages = [
    normalizedPage,
    ...storedDiscoveredPages.filter((entry) => entry.url !== normalizedPage.url)
  ];
  await setDiscoveredPages(nextPages);
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

function normalizeSavedPage<T extends DiscoveredPageEntry | BookmarkEntry>(
  page: T
): T {
  return {
    url: page.url.trim(),
    title: page.title.trim() || page.url.trim(),
    rootUrl: page.rootUrl ? normalizeRootUrl(page.rootUrl) : null
  } as T;
}

function normalizeBookmark(bookmark: BookmarkEntry): BookmarkEntry {
  return normalizeSavedPage(bookmark);
}

function normalizeSavedPages(value: unknown): DiscoveredPageEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const nextPages: DiscoveredPageEntry[] = [];
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
    nextPages.push({
      url,
      title: title || url,
      rootUrl
    });
  }

  return nextPages;
}

function normalizeBookmarks(value: unknown): BookmarkEntry[] {
  return normalizeSavedPages(value);
}

function mergeSavedPages(
  primaryPages: DiscoveredPageEntry[],
  fallbackPages: BookmarkEntry[]
): DiscoveredPageEntry[] {
  const mergedPages = [...primaryPages];
  const seenUrls = new Set(primaryPages.map((page) => page.url));

  for (const page of fallbackPages) {
    if (seenUrls.has(page.url)) {
      continue;
    }

    seenUrls.add(page.url);
    mergedPages.push(page);
  }

  return mergedPages;
}
