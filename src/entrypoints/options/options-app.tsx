import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import {
  DEFAULT_ROOT_URLS,
  getState,
  normalizeRootUrl,
  setMappings,
  setSettings,
  toCsv
} from '@/lib/storage';
import { requestRootUrlPermission } from '@/lib/host-permissions';
import {
  OKECHIKA_CHARS,
  OKECHIKA_NUMBER_CHARS,
  OKECHIKA_TEXT_CHARS
} from '@/lib/okechika-chars';
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
    throw new Error('CSV のヘッダーは source,target である必要があります。');
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
    throw new Error('CSV の引用符が閉じられていません。');
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function toRootUrlInput(rawValue: string): string | null {
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

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return normalizeRootUrl(url.toString());
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

function maskRootUrl(value: string): string {
  try {
    const url = new URL(value);
    const maskedHost = url.hostname
      .split('.')
      .map((part, index, all) => {
        if (index === all.length - 1) {
          return part;
        }
        if (part.length <= 2) {
          return '*'.repeat(part.length);
        }
        return `${part[0]}${'*'.repeat(part.length - 2)}${part[part.length - 1]}`;
      })
      .join('.');

    return `${url.protocol}//${maskedHost}${url.pathname}`;
  } catch {
    return value.replace(/./g, '*');
  }
}

export function OptionsApp() {
  const [displayMode, setDisplayMode] = useState<'source' | 'target' | 'both'>('both');
  const [showRootUrls, setShowRootUrls] = useState(false);
  const [settings, setLocalSettings] = useState<ExtensionSettings | null>(null);
  const [table, setTable] = useState<DecodeTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [newRootUrlInput, setNewRootUrlInput] = useState('');
  const [rootUrlError, setRootUrlError] = useState('');
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

  const glyphSections = useMemo(() => {
    const mappings = table?.mappings ?? {};
    const baseCells = OKECHIKA_TEXT_CHARS.map((source) => ({
      source,
      target: mappings[source] ?? '?'
    }));
    const numberLikeCells = OKECHIKA_NUMBER_CHARS.map((source) => ({
      source,
      target: mappings[source] ?? '?'
    }));

    function toRows(source: Array<{ source: string; target: string }>) {
      const chunked: Array<Array<{ source: string; target: string }>> = [];
      for (let i = 0; i < source.length; i += 20) {
        chunked.push(source.slice(i, i + 20));
      }
      return chunked;
    }

    return {
      baseRows: toRows(baseCells),
      numberLikeRows: toRows(numberLikeCells)
    };
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

  async function saveRootUrls(rootUrls: string[]): Promise<void> {
    if (!settings) {
      return;
    }

    const uniqueRootUrls = Array.from(new Set(rootUrls.map(normalizeRootUrl))).filter(Boolean);
    const nextSettings: ExtensionSettings = {
      enabledRootUrls: uniqueRootUrls
    };

    setLocalSettings(nextSettings);
    await setSettings(nextSettings);
  }

  async function handleAddRootUrl(): Promise<void> {
    if (!settings) {
      return;
    }

    const parsed = toRootUrlInput(newRootUrlInput);
    if (!parsed) {
      setRootUrlError('有効な URL またはホストを入力してください。');
      return;
    }

    if (settings.enabledRootUrls.includes(parsed)) {
      setRootUrlError('同じルートURLはすでに登録されています。');
      return;
    }

    const granted = await requestRootUrlPermission(parsed);
    if (!granted) {
      setRootUrlError('この URL を有効化するには、権限の許可が必要です。');
      return;
    }

    setRootUrlError('');
    setNewRootUrlInput('');
    await saveRootUrls([...settings.enabledRootUrls, parsed]);
  }

  async function handleRemoveRootUrl(rootUrl: string): Promise<void> {
    if (!settings) {
      return;
    }

    const nextRootUrls = settings.enabledRootUrls.filter((item) => item !== rootUrl);
    await saveRootUrls(nextRootUrls);
  }

  async function handleResetDefaultRootUrls(): Promise<void> {
    setRootUrlError('');
    setNewRootUrlInput('');
    await saveRootUrls(DEFAULT_ROOT_URLS);
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
      setImportMessage(`${Object.keys(mappings).length} 件をインポートしました。`);
    } catch (error) {
      setImportMessage('');
      setImportError(
        error instanceof Error
          ? error.message
          : 'CSV のインポートに失敗しました。ファイル形式を確認してください。'
      );
    } finally {
      event.currentTarget.value = '';
    }
  }

  if (loading || !settings || !table) {
    return <main className="page">読み込み中...</main>;
  }

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">桶地下 helper</p>
        <h1>変換テーブル管理</h1>
        <p className="sub">変換表の確認・CSV入出力・対象URLの管理ができます。</p>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2>対象ルートURL</h2>
          <div className="button-group">
            <button
              type="button"
              className="secondary"
              onClick={() => setShowRootUrls((prev) => !prev)}
            >
              {showRootUrls ? 'URLを隠す' : 'URLを表示'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                void handleResetDefaultRootUrls();
              }}
            >
              初期値に戻す
            </button>
          </div>
        </div>

        <p className="caption">
          対象ルートURLを追加・削除できます。追加時にブラウザ権限の許可を求めることがあります。
        </p>

        <div className="domain-input-row">
          <input
            type="text"
            value={newRootUrlInput}
            placeholder="例: https://example.com/path/ または example.com"
            onChange={(event) => {
              setNewRootUrlInput(event.currentTarget.value);
              setRootUrlError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleAddRootUrl();
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              void handleAddRootUrl();
            }}
          >
            追加
          </button>
        </div>

        <p className="caption error">{rootUrlError}</p>

        <ul className="domain-list">
          {settings.enabledRootUrls.length === 0 ? (
            <li className="empty">対象ルートURLは未設定です。</li>
          ) : (
            settings.enabledRootUrls.map((rootUrl) => (
              <li key={rootUrl} className="domain-item">
                <span>{showRootUrls ? rootUrl : maskRootUrl(rootUrl)}</span>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    void handleRemoveRootUrl(rootUrl);
                  }}
                >
                  削除
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>変換テーブル</h2>
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
              CSVインポート
            </button>
            <button type="button" onClick={() => downloadCsv(table.mappings)}>
              CSVエクスポート
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
              {glyphSections.baseRows.map((row, rowIndex) => (
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
                        <span className="glyph-pair">
                          <span className={target === '?' ? 'unknown-target' : undefined}>
                            {source}
                          </span>
                          <span
                            className={target === '?' ? 'glyph-divider unknown-target' : 'glyph-divider'}
                          >
                            {'>'}
                          </span>
                          <span className={target === '?' ? 'unknown-target' : undefined}>{target}</span>
                        </span>
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {glyphSections.numberLikeRows.length > 0 ? (
          <>
            <div className="table-wrap table-wrap-second">
              <table>
                <tbody>
                  {glyphSections.numberLikeRows.map((row, rowIndex) => (
                    <tr key={`glyph-number-row-${rowIndex}`}>
                      {row.map(({ source, target }) => (
                        <td key={source} className="glyph-cell">
                          {displayMode === 'source' ? (
                            <span className={target === '?' ? 'unknown-target' : undefined}>
                              {source}
                            </span>
                          ) : null}
                          {displayMode === 'target' ? (
                            <span className={target === '?' ? 'unknown-target' : undefined}>
                              {target}
                            </span>
                          ) : null}
                          {displayMode === 'both' ? (
                            <span className="glyph-pair">
                              <span className={target === '?' ? 'unknown-target' : undefined}>
                                {source}
                              </span>
                              <span
                                className={
                                  target === '?' ? 'glyph-divider unknown-target' : 'glyph-divider'
                                }
                              >
                                {'>'}
                              </span>
                              <span className={target === '?' ? 'unknown-target' : undefined}>
                                {target}
                              </span>
                            </span>
                          ) : null}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

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

      <section className="panel">
        <h2>権利について</h2>
        <p className="caption">桶地下は第四境界のコンテンツです。</p>
        <ul className="credit-list">
          <li>
            第四境界:{' '}
            <a href="https://www.daiyonkyokai.net/" target="_blank" rel="noreferrer">
              https://www.daiyonkyokai.net/
            </a>
          </li>
          <li>
            桶地下 調査の手引き:{' '}
            <a
              href="https://www.daiyonkyokai.net/bps/guide/78fghuvtgy7/"
              target="_blank"
              rel="noreferrer"
            >
              https://www.daiyonkyokai.net/bps/guide/78fghuvtgy7/
            </a>
          </li>
        </ul>

        <p className="caption">
          この拡張機能はファンメイド作品です。第四境界とは関係がなく、権利を侵害する意図はありません。
        </p>

        <h3 className="subsection-title">この拡張機能へのコンタクト先</h3>
        <ul className="credit-list">
          <li>
            X:{' '}
            <a href="https://x.com/yaeda" target="_blank" rel="noreferrer">
              x.com/yaeda
            </a>
          </li>
          <li>
            GitHub:{' '}
            <a href="https://github.com/yaeda/okechika-helper" target="_blank" rel="noreferrer">
              github.com/yaeda/okechika-helper
            </a>
          </li>
        </ul>
      </section>
    </main>
  );
}
