import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import {
  DEFAULT_DOMAINS,
  getState,
  normalizeHost,
  setMappings,
  setSettings,
  toCsv
} from '@/lib/storage';
import { OKECHIKA_CHARS } from '@/lib/okechika-chars';
import type { DecodeMap, DecodeTable, ExtensionSettings } from '@/lib/types';

function downloadCsv(mappings: DecodeMap): void {
  const csv = toCsv(mappings);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'okechika-table.csv';
  anchor.click();

  URL.revokeObjectURL(url);
}

function parseMappingsCsv(csvText: string): DecodeMap {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) {
    return {};
  }

  const header = rows[0].map((value, index) => {
    const normalized = value.trim().toLowerCase();
    return index === 0 ? normalized.replace(/^\ufeff/, '') : normalized;
  });

  if (header[0] !== 'source' || header[1] !== 'target') {
    throw new Error('CSV header must be source,target');
  }

  const mappings: DecodeMap = {};
  for (let i = 1; i < rows.length; i += 1) {
    const source = rows[i]?.[0] ?? '';
    const target = rows[i]?.[1] ?? '';
    if (!source) {
      continue;
    }
    mappings[source] = target;
  }

  return mappings;
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];

    if (inQuotes) {
      if (char === '"') {
        if (csvText[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error('CSV contains an unterminated quoted field');
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function toDomainInput(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withScheme);
    if (!url.hostname) {
      return null;
    }

    return normalizeHost(url.hostname);
  } catch {
    return null;
  }
}

function formatUpdatedAt(value: string | null): string {
  if (!value) {
    return '未更新';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function OptionsApp() {
  const [displayMode, setDisplayMode] = useState<'source' | 'target' | 'both'>('both');
  const [settings, setLocalSettings] = useState<ExtensionSettings | null>(null);
  const [table, setTable] = useState<DecodeTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [newDomainInput, setNewDomainInput] = useState('');
  const [domainError, setDomainError] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const importFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load(): Promise<void> {
      const state = await getState();
      setLocalSettings(state.settings);
      setTable(state.table);
      setLoading(false);
    }

    void load();

    const handler: Parameters<
      typeof chrome.storage.onChanged.addListener
    >[0] = (changes, areaName) => {
      if (areaName !== 'sync') {
        return;
      }

      if (changes.decodeTable || changes.settings) {
        void load();
      }
    };

    chrome.storage.onChanged.addListener(handler);
    return () => {
      chrome.storage.onChanged.removeListener(handler);
    };
  }, []);

  const glyphRows = useMemo(() => {
    const mappings = table?.mappings ?? {};
    const cells = OKECHIKA_CHARS.map((source) => ({
      source,
      target: mappings[source] ?? '?'
    }));

    const chunked: Array<Array<{ source: string; target: string }>> = [];
    for (let i = 0; i < cells.length; i += 20) {
      chunked.push(cells.slice(i, i + 20));
    }
    return chunked;
  }, [table]);

  const decodeProgress = useMemo(() => {
    const mappings = table?.mappings ?? {};
    const total = OKECHIKA_CHARS.length;
    const decoded = OKECHIKA_CHARS.reduce((count, source) => {
      const target = mappings[source];
      return target && target !== '?' ? count + 1 : count;
    }, 0);
    const percent = total === 0 ? 0 : (decoded / total) * 100;

    return {
      decoded,
      total,
      percent
    };
  }, [table]);

  const otherMappings = useMemo(() => {
    const mappings = table?.mappings ?? {};
    const defined = new Set(OKECHIKA_CHARS);
    return Object.entries(mappings)
      .filter(([source]) => !defined.has(source))
      .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [table]);

  async function saveDomains(domains: string[]): Promise<void> {
    if (!settings) {
      return;
    }

    const uniqueDomains = Array.from(new Set(domains.map(normalizeHost))).filter(Boolean);
    const nextSettings: ExtensionSettings = {
      enabledDomains: uniqueDomains
    };

    setLocalSettings(nextSettings);
    await setSettings(nextSettings);
  }

  async function handleAddDomain(): Promise<void> {
    if (!settings) {
      return;
    }

    const parsed = toDomainInput(newDomainInput);
    if (!parsed) {
      setDomainError('有効な URL またはホストを入力してください。');
      return;
    }

    if (settings.enabledDomains.includes(parsed)) {
      setDomainError('同じホストはすでに登録されています。');
      return;
    }

    setDomainError('');
    setNewDomainInput('');
    await saveDomains([...settings.enabledDomains, parsed]);
  }

  async function handleRemoveDomain(domain: string): Promise<void> {
    if (!settings) {
      return;
    }

    const nextDomains = settings.enabledDomains.filter((item) => item !== domain);
    await saveDomains(nextDomains);
  }

  async function handleResetDefaultDomains(): Promise<void> {
    setDomainError('');
    setNewDomainInput('');
    await saveDomains(DEFAULT_DOMAINS);
  }

  async function handleImportCsv(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const mappings = parseMappingsCsv(text);
      await setMappings(mappings);
      setImportError('');
      setImportMessage(`Imported ${Object.keys(mappings).length} rows.`);
    } catch (error) {
      setImportMessage('');
      setImportError(
        error instanceof Error
          ? error.message
          : 'Failed to import CSV. Please check the file format.'
      );
    } finally {
      event.currentTarget.value = '';
    }
  }

  if (loading || !settings || !table) {
    return <main className="page">Loading...</main>;
  }

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">桶地下 helper</p>
        <h1>Decode Table Manager</h1>
        <p className="sub">
          Review mappings, export CSV, and control where annotation runs.
        </p>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2>Target URLs</h2>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              void handleResetDefaultDomains();
            }}
          >
            Reset to Default
          </button>
        </div>

        <p className="caption">
          Add or remove target hosts. Enter either a full URL or a host.
        </p>

        <div className="domain-input-row">
          <input
            type="text"
            value={newDomainInput}
            placeholder="e.g. https://example.com or example.com"
            onChange={(event) => {
              setNewDomainInput(event.currentTarget.value);
              setDomainError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleAddDomain();
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              void handleAddDomain();
            }}
          >
            Add
          </button>
        </div>

        <p className="caption error">{domainError}</p>

        <ul className="domain-list">
          {settings.enabledDomains.length === 0 ? (
            <li className="empty">No target URLs configured.</li>
          ) : (
            settings.enabledDomains.map((domain) => (
              <li key={domain} className="domain-item">
                <span>{domain}</span>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    void handleRemoveDomain(domain);
                  }}
                >
                  Remove
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Decode Table</h2>
          <div className="button-group">
            <input
              ref={importFileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden-file-input"
              onChange={(event) => {
                void handleImportCsv(event);
              }}
            />
            <button
              type="button"
              className="secondary"
              onClick={() => importFileInputRef.current?.click()}
            >
              Import CSV
            </button>
            <button type="button" onClick={() => downloadCsv(table.mappings)}>
              Export CSV
            </button>
          </div>
        </div>
        <p className="caption">最終更新日: {formatUpdatedAt(table.updatedAt)}</p>
        <p className="caption success">{importMessage}</p>
        <p className="caption error">{importError}</p>

        <div className="display-row">
          <p className="caption progress">
            解析進捗: {decodeProgress.decoded}/{decodeProgress.total}（
            {decodeProgress.percent.toFixed(1)}%）
          </p>
          <div className="display-mode-group">
            <button
              type="button"
              className={displayMode === 'source' ? 'secondary is-active' : 'secondary'}
              onClick={() => setDisplayMode('source')}
            >
              変換前
            </button>
            <button
              type="button"
              className={displayMode === 'target' ? 'secondary is-active' : 'secondary'}
              onClick={() => setDisplayMode('target')}
            >
              変換後
            </button>
            <button
              type="button"
              className={displayMode === 'both' ? 'secondary is-active' : 'secondary'}
              onClick={() => setDisplayMode('both')}
            >
              両方表示
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <tbody>
              {glyphRows.map((row, rowIndex) => (
                <tr key={`glyph-row-${rowIndex}`}>
                  {row.map(({ source, target }) => (
                    <td key={source} className="glyph-cell">
                      {displayMode === 'source' ? (
                        <span className={target === '?' ? 'unknown-target' : undefined}>{source}</span>
                      ) : null}
                      {displayMode === 'target' ? (
                        <span className={target === '?' ? 'unknown-target' : undefined}>{target}</span>
                      ) : null}
                      {displayMode === 'both' ? (
                        <>
                          <span className={target === '?' ? 'unknown-target' : undefined}>
                            {source}
                          </span>
                          <span> | </span>
                          <span className={target === '?' ? 'unknown-target' : undefined}>{target}</span>
                        </>
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="subsection-title">その他の文字</h3>
        {otherMappings.length === 0 ? (
          <p className="caption">該当する文字はありません。</p>
        ) : (
          <div className="table-wrap table-wrap-compact">
            <table className="compact-table">
              <thead>
                <tr>
                  <th>変換前</th>
                  <th>変換後</th>
                </tr>
              </thead>
              <tbody>
                {otherMappings.map(([source, target]) => (
                  <tr key={`other-${source}`}>
                    <td className={target === '?' ? 'unknown-target' : undefined}>{source}</td>
                    <td className={target === '?' ? 'unknown-target' : undefined}>{target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
