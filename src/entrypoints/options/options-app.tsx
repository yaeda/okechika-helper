import { useEffect, useMemo, useState } from 'react';

import { getState, setSettings, toCsv } from '@/lib/storage';
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

export function OptionsApp() {
  const [settings, setLocalSettings] = useState<ExtensionSettings | null>(null);
  const [table, setTable] = useState<DecodeTable | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function handleAllSitesToggle(enabled: boolean): Promise<void> {
    if (!settings) {
      return;
    }

    const nextSettings: ExtensionSettings = {
      ...settings,
      enableAllSites: enabled
    };
    setLocalSettings(nextSettings);
    await setSettings(nextSettings);
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
        <h2>Runtime Scope</h2>
        <label className="toggle-row" htmlFor="all-sites-toggle">
          <span>Enable on all websites</span>
          <input
            id="all-sites-toggle"
            type="checkbox"
            checked={settings.enableAllSites}
            onChange={(event) => {
              void handleAllSitesToggle(event.currentTarget.checked);
            }}
          />
        </label>
        <p className="caption">
          When disabled, only the following hosts are targeted by default.
        </p>
        <ul className="domain-list">
          {settings.enabledDomains.map((domain) => (
            <li key={domain}>{domain}</li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Decode Table</h2>
          <button type="button" onClick={() => downloadCsv(table.mappings)}>
            Export CSV
          </button>
        </div>
        <p className="caption">Columns: source,target</p>
        <p className="caption">Updated At: {table.updatedAt ?? 'Never'}</p>

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
