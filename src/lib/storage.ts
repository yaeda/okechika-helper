import type { DecodeMap, DecodeTable, ExtensionSettings, ExtensionState } from '@/lib/types';

const STORAGE_KEYS = {
  table: 'decodeTable',
  settings: 'settings'
} as const;

export const DEFAULT_DOMAINS = ['www.pub-riddle.com', 'www.qtes9gu0k.xyz'];

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabledDomains: DEFAULT_DOMAINS
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
    | (Partial<ExtensionSettings> & { enableAllSites?: boolean })
    | undefined;

  return {
    table: {
      mappings: table.mappings ?? {},
      updatedAt: table.updatedAt ?? null
    },
    settings: {
      enabledDomains: (rawSettings?.enabledDomains ?? DEFAULT_DOMAINS).map(normalizeHost)
    }
  };
}

export async function setSettings(settings: ExtensionSettings): Promise<void> {
  await getSyncStorage().set({
    [STORAGE_KEYS.settings]: {
      enabledDomains: settings.enabledDomains.map(normalizeHost)
    } satisfies ExtensionSettings
  });
}

export async function setMappings(mappings: DecodeMap): Promise<void> {
  await getSyncStorage().set({
    [STORAGE_KEYS.table]: {
      mappings,
      updatedAt: nowIso()
    } satisfies DecodeTable
  });
}

export async function upsertMappings(entries: DecodeMap): Promise<void> {
  const state = await getState();
  const nextMappings = {
    ...state.table.mappings,
    ...entries
  };

  await setMappings(nextMappings);
}

export function shouldRunOnHost(settings: ExtensionSettings, host: string): boolean {
  const normalizedHost = normalizeHost(host);
  return settings.enabledDomains.some((domain) => isSameHostOrWwwPair(normalizedHost, domain));
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
