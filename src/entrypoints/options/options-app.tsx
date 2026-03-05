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

export function OptionsApp() {
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

  const rows = useMemo(
    () =>
      Object.entries(table?.mappings ?? {}).sort(([a], [b]) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      ),
    [table]
  );

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
        <p className="caption">Columns: source,target</p>
        <p className="caption">Updated At: {table.updatedAt ?? 'Never'}</p>
        <p className="caption success">{importMessage}</p>
        <p className="caption error">{importError}</p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>source</th>
                <th>target</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={2}>No mappings yet.</td>
                </tr>
              ) : (
                rows.map(([source, target]) => (
                  <tr key={source}>
                    <td>{source}</td>
                    <td>{target}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
