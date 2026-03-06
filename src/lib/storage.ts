import type { DecodeMap, DecodeTable, ExtensionSettings, ExtensionState } from '@/lib/types';

const STORAGE_KEYS = {
  table: 'decodeTable',
  settings: 'settings'
} as const;

export const DEFAULT_ROOT_URLS = ['https://www.pub-riddle.com/', 'https://www.qtes9gu0k.xyz/'];

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabledRootUrls: DEFAULT_ROOT_URLS,
  useSourceGlyphFontInOptions: true
};

export const DEFAULT_TABLE: DecodeTable = {
  mappings: {},
  updatedAt: null
};

function nowIso(): string {
  return new Date().toISOString();
}

function getSyncStorage(): chrome.storage.StorageArea {
  return chrome.storage.sync;
}

export async function getState(): Promise<ExtensionState> {
  const result = await getSyncStorage().get([STORAGE_KEYS.table, STORAGE_KEYS.settings]);

  const table = (result[STORAGE_KEYS.table] as DecodeTable | undefined) ?? DEFAULT_TABLE;
  const rawSettings = result[STORAGE_KEYS.settings] as
    | (Partial<ExtensionSettings> & { enabledDomains?: string[]; enableAllSites?: boolean })
    | undefined;
  const legacyDomains = rawSettings?.enabledDomains ?? [];
  const storedRootUrls = rawSettings?.enabledRootUrls ?? [];
  const useSourceGlyphFontInOptions =
    rawSettings?.useSourceGlyphFontInOptions ?? DEFAULT_SETTINGS.useSourceGlyphFontInOptions;
  const nextRootUrls = (storedRootUrls.length > 0 ? storedRootUrls : legacyDomains).map((value) => {
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
      enabledRootUrls: nextRootUrls.length > 0 ? nextRootUrls : DEFAULT_ROOT_URLS,
      useSourceGlyphFontInOptions
    }
  };
}

export async function setSettings(settings: ExtensionSettings): Promise<void> {
  await getSyncStorage().set({
    [STORAGE_KEYS.settings]: {
      enabledRootUrls: settings.enabledRootUrls.map(normalizeRootUrl),
      useSourceGlyphFontInOptions: settings.useSourceGlyphFontInOptions
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

export function shouldRunOnUrl(settings: ExtensionSettings, url: string): boolean {
  return resolveMatchedRootUrl(settings, url) !== null;
}

export function resolveMatchedRootUrl(settings: ExtensionSettings, url: string): string | null {
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

function isSameHostOrWwwPair(host: string, domain: string): boolean {
  const normalizedDomain = normalizeHost(domain);

  if (host === normalizedDomain) {
    return true;
  }

  if (host.startsWith('www.') && host.slice(4) === normalizedDomain) {
    return true;
  }

  if (normalizedDomain.startsWith('www.') && normalizedDomain.slice(4) === host) {
    return true;
  }

  return false;
}

export function normalizeRootUrl(value: string): string {
  const url = new URL(value);
  const pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
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

    if (!isSameHostOrWwwPair(normalizeHost(current.hostname), normalizeHost(root.hostname))) {
      return false;
    }

    const currentPath = current.pathname.endsWith('/') ? current.pathname : `${current.pathname}/`;
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
  return Object.fromEntries(Object.entries(mappings).filter(([, target]) => target !== '?'));
}
