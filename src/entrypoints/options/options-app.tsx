import type { ChangeEvent, KeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ConverterPanel } from '@/components/converter-panel';
import { ConversionTablePanel } from '@/components/conversion-table-panel';
import {
  BookmarkListItem,
  type BookmarkListItemData
} from '@/components/bookmark-list-item';
import {
  containsKnownGlyphChars,
  decodeTextWithMappings
} from '@/lib/conversion';
import { requestRootUrlPermission } from '@/lib/host-permissions';
import { createPageSearchMatcher } from '@/lib/page-search';
import {
  DEFAULT_OPTIONS_UI_STATE,
  DEFAULT_ROOT_URLS,
  DEFAULT_SETTINGS,
  getOptionsUiState,
  getPendingExtensionUpdate,
  getState,
  normalizeRootUrl,
  resolveMatchedRootUrl,
  setMappings,
  setOptionsUiState,
  setSettings,
  toCsv,
  toggleBookmark
} from '@/lib/storage';
import type {
  BookmarkEntry,
  ConverterTab,
  DecodeMap,
  DecodeTable,
  DiscoveredPageEntry,
  ExtensionSettings,
  OptionsTableDisplayMode,
  OptionsUiState,
  PendingExtensionUpdate
} from '@/lib/types';

async function hashText(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}

async function downloadCsv(mappings: DecodeMap): Promise<void> {
  const csv = toCsv(mappings);
  const translatedCount = Object.values(mappings).reduce((count, target) => {
    return target && target !== '?' ? count + 1 : count;
  }, 0);
  const hash = (await hashText(csv)).slice(0, 8);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `okechika-table-${translatedCount}-${hash}.csv`;
  anchor.click();

  URL.revokeObjectURL(url);
}

function handleClickableItemKeyDown(
  event: KeyboardEvent<HTMLElement>,
  onActivate: () => void
): void {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  onActivate();
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
    if (!source || target === '?') {
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

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

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

function getFaviconUrl(pageUrl: string): string {
  const faviconUrl = new URL(chrome.runtime.getURL('/_favicon/'));
  faviconUrl.searchParams.set('pageUrl', pageUrl);
  faviconUrl.searchParams.set('size', '24');
  return faviconUrl.toString();
}

function RootUrlFavicon({ rootUrl }: { rootUrl: string }) {
  return (
    <img
      className="domain-item-favicon-image"
      src={getFaviconUrl(rootUrl)}
      alt=""
      aria-hidden="true"
    />
  );
}

export function OptionsApp() {
  const extensionVersion = chrome.runtime.getManifest().version;
  const [displayMode, setDisplayMode] = useState<OptionsTableDisplayMode>(
    DEFAULT_OPTIONS_UI_STATE.tableDisplayMode
  );
  const [showRootUrls, setShowRootUrls] = useState(
    DEFAULT_OPTIONS_UI_STATE.showRootUrls
  );
  const [pendingExtensionUpdate, setPendingExtensionUpdateState] =
    useState<PendingExtensionUpdate | null>(null);
  const [settings, setLocalSettings] = useState<ExtensionSettings | null>(null);
  const [table, setTable] = useState<DecodeTable | null>(null);
  const [discoveredPages, setDiscoveredPages] = useState<DiscoveredPageEntry[]>(
    []
  );
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);
  const [discoveredPageSearchQuery, setDiscoveredPageSearchQuery] =
    useState('');
  const [loading, setLoading] = useState(true);
  const [newRootUrlInput, setNewRootUrlInput] = useState('');
  const [rootUrlError, setRootUrlError] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const [converterTab, setConverterTab] = useState<ConverterTab>(
    DEFAULT_OPTIONS_UI_STATE.converterTab
  );
  const [collapsedBookmarkGroups, setCollapsedBookmarkGroups] = useState<
    Record<string, boolean>
  >({});
  const importFileInputRef = useRef<HTMLInputElement>(null);

  function applyOptionsUiState(nextUiState: OptionsUiState): void {
    setShowRootUrls(nextUiState.showRootUrls);
    setConverterTab(nextUiState.converterTab);
    setDisplayMode(nextUiState.tableDisplayMode);
  }

  async function saveOptionsPanelState(
    nextUiState: OptionsUiState
  ): Promise<void> {
    await setOptionsUiState(nextUiState);
  }

  useEffect(() => {
    async function load(): Promise<void> {
      const [state, uiState, pendingUpdate] = await Promise.all([
        getState(),
        getOptionsUiState(),
        getPendingExtensionUpdate()
      ]);
      setLocalSettings(state.settings);
      setTable(state.table);
      setDiscoveredPages(state.discoveredPages);
      setBookmarks(state.bookmarks);
      setPendingExtensionUpdateState(pendingUpdate);
      applyOptionsUiState(uiState);
      setLoading(false);
    }

    void load();

    const handler: Parameters<
      typeof chrome.storage.onChanged.addListener
    >[0] = (changes, areaName) => {
      if (
        (areaName === 'sync' &&
          (changes.decodeTable || changes.settings || changes.bookmarks)) ||
        (areaName === 'local' && changes.discoveredPages) ||
        (areaName === 'local' &&
          (changes.optionsUiState || changes.pendingExtensionUpdate))
      ) {
        void load();
      }
    };

    chrome.storage.onChanged.addListener(handler);
    return () => {
      chrome.storage.onChanged.removeListener(handler);
    };
  }, []);

  const bookmarkedUrls = useMemo(
    () => new Set(bookmarks.map((bookmark) => bookmark.url)),
    [bookmarks]
  );

  const discoveredPageItems = useMemo<
    Array<BookmarkListItemData & { rootUrl: string | null }>
  >(() => {
    const mappings = table?.mappings ?? {};

    return discoveredPages
      .map((page) => {
        const hasGlyphTitle = containsKnownGlyphChars(page.title);
        const rootUrl =
          page.rootUrl ??
          resolveMatchedRootUrl(settings ?? DEFAULT_SETTINGS, page.url);

        return {
          ...page,
          rootUrl,
          decodedTitle: hasGlyphTitle
            ? decodeTextWithMappings(page.title, mappings)
            : null,
          isBookmarked: bookmarkedUrls.has(page.url)
        };
      })
      .sort((a, b) => a.url.localeCompare(b.url));
  }, [bookmarkedUrls, discoveredPages, settings, table]);

  const discoveredPageGroups = useMemo(() => {
    const matchesSearchQuery = createPageSearchMatcher(
      discoveredPageSearchQuery
    );
    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        items: typeof discoveredPageItems;
      }
    >();

    for (const page of discoveredPageItems) {
      if (showBookmarkedOnly && !page.isBookmarked) {
        continue;
      }
      const groupKey = page.rootUrl ?? '__unmatched__';
      const existing = groups.get(groupKey);
      const matchesSearch = matchesSearchQuery(page);

      if (existing) {
        if (matchesSearch) {
          existing.items.push(page);
        }
        continue;
      }

      groups.set(groupKey, {
        key: groupKey,
        label: page.rootUrl ?? '未分類のURL',
        items: matchesSearch ? [page] : []
      });
    }

    return Array.from(groups.values()).sort((a, b) => {
      if (a.key === '__unmatched__') {
        return 1;
      }
      if (b.key === '__unmatched__') {
        return -1;
      }
      return a.label.localeCompare(b.label);
    });
  }, [discoveredPageItems, discoveredPageSearchQuery, showBookmarkedOnly]);

  useEffect(() => {
    setCollapsedBookmarkGroups((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const group of discoveredPageGroups) {
        if (!(group.key in next)) {
          next[group.key] = true;
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [discoveredPageGroups]);

  const optionsUiState: OptionsUiState = {
    showRootUrls,
    converterTab,
    tableDisplayMode: displayMode
  };

  async function saveSettings(nextSettings: ExtensionSettings): Promise<void> {
    if (!settings) {
      return;
    }

    setLocalSettings(nextSettings);
    await setSettings(nextSettings);
  }

  async function saveRootUrls(rootUrls: string[]): Promise<void> {
    if (!settings) {
      return;
    }

    const uniqueRootUrls = Array.from(
      new Set(rootUrls.map(normalizeRootUrl))
    ).filter(Boolean);
    await saveSettings({
      ...settings,
      enabledRootUrls: uniqueRootUrls
    });
  }

  async function handleToggleSourceGlyphFont(checked: boolean): Promise<void> {
    if (!settings) {
      return;
    }

    await saveSettings({
      ...settings,
      useSourceGlyphFontInOptions: checked
    });
  }

  async function handleToggleOkck24HourMode(checked: boolean): Promise<void> {
    if (!settings) {
      return;
    }

    await saveSettings({
      ...settings,
      enableOkck24HourMode: checked
    });
  }

  async function handleToggleTooltipSearchOpenInNewTab(
    checked: boolean
  ): Promise<void> {
    if (!settings) {
      return;
    }

    await saveSettings({
      ...settings,
      tooltipSearchOpenInNewTab: checked
    });
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

    const nextRootUrls = settings.enabledRootUrls.filter(
      (item) => item !== rootUrl
    );
    await saveRootUrls(nextRootUrls);
  }

  function handleOpenRootUrl(rootUrl: string): void {
    window.open(rootUrl, '_blank', 'noopener,noreferrer');
  }

  function handleOpenBookmark(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function handleApplyPendingUpdate(): void {
    chrome.runtime.reload();
  }

  function handleToggleShowRootUrls(): void {
    const nextShowRootUrls = !showRootUrls;
    setShowRootUrls(nextShowRootUrls);
    void saveOptionsPanelState({
      ...optionsUiState,
      showRootUrls: nextShowRootUrls
    });
  }

  function handleSelectConverterTab(nextTab: ConverterTab): void {
    setConverterTab(nextTab);
    void saveOptionsPanelState({
      ...optionsUiState,
      converterTab: nextTab
    });
  }

  function handleSelectDisplayMode(nextMode: OptionsTableDisplayMode): void {
    setDisplayMode(nextMode);
    void saveOptionsPanelState({
      ...optionsUiState,
      tableDisplayMode: nextMode
    });
  }

  async function handleResetDefaultRootUrls(): Promise<void> {
    setRootUrlError('');
    setNewRootUrlInput('');
    await saveRootUrls(DEFAULT_ROOT_URLS);
  }

  async function handleSetBookmark(page: DiscoveredPageEntry): Promise<void> {
    const nextIsBookmarked = await toggleBookmark(page);
    setBookmarks((prev) => {
      if (nextIsBookmarked) {
        return [page, ...prev.filter((bookmark) => bookmark.url !== page.url)];
      }

      return prev.filter((bookmark) => bookmark.url !== page.url);
    });
  }

  function toggleBookmarkGroup(groupKey: string): void {
    setCollapsedBookmarkGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  }

  async function handleImportCsv(
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const mappings = parseMappingsCsv(text);
      await setMappings(mappings);
      setImportError('');
      setImportMessage(
        `${Object.keys(mappings).length} 件をインポートしました。`
      );
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
      <div className="content-column">
        <header className="hero">
          <div className="hero-head">
            <div>
              <div className="hero-title-row">
                <h1>桶地下 helper</h1>
                <span className="version-badge">v{extensionVersion}</span>
              </div>
            </div>
            {pendingExtensionUpdate ? (
              <div className="update-available-banner update-available-banner-compact">
                <p className="hero-sub-inline update-available-note">
                  新しいバージョン v{pendingExtensionUpdate.version}{' '}
                  を適用できます。
                </p>
                <div className="update-available-actions">
                  <button
                    type="button"
                    className="secondary version-update-button"
                    onClick={handleApplyPendingUpdate}
                  >
                    更新する
                  </button>
                  <p className="update-available-help">
                    実行すると拡張が再起動し、この画面は閉じます。
                  </p>
                </div>
              </div>
            ) : null}
            <div className="hero-side">
              <nav className="hero-links" aria-label="サポートリンク">
                <a
                  href="https://github.com/yaeda/okechika-helper/issues/new/choose"
                  target="_blank"
                  rel="noreferrer"
                >
                  不具合報告
                </a>
                <a
                  href="https://github.com/yaeda/okechika-helper/wiki/%E4%BD%BF%E3%81%84%E6%96%B9"
                  target="_blank"
                  rel="noreferrer"
                >
                  使い方
                </a>
                <a
                  href="https://github.com/yaeda/okechika-helper/wiki/%E6%9B%B4%E6%96%B0%E5%86%85%E5%AE%B9"
                  target="_blank"
                  rel="noreferrer"
                >
                  更新内容
                </a>
              </nav>
            </div>
          </div>
        </header>

        <div className="top-panels-grid">
          <section className="panel">
            <div className="panel-header">
              <h2>対象ルートURL</h2>
              <div className="button-group">
                <button
                  type="button"
                  className="secondary"
                  onClick={handleToggleShowRootUrls}
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

            {rootUrlError ? (
              <p className="caption error">{rootUrlError}</p>
            ) : null}

            <ul className="domain-list">
              {settings.enabledRootUrls.length === 0 ? (
                <li className="empty">対象ルートURLは未設定です。</li>
              ) : (
                settings.enabledRootUrls.map((rootUrl) => (
                  <li
                    key={rootUrl}
                    className="domain-item domain-item-clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      handleOpenRootUrl(rootUrl);
                    }}
                    onKeyDown={(event) => {
                      handleClickableItemKeyDown(event, () => {
                        handleOpenRootUrl(rootUrl);
                      });
                    }}
                  >
                    <div className="domain-item-main">
                      <span className="domain-item-favicon">
                        <RootUrlFavicon rootUrl={rootUrl} />
                      </span>
                      <span>
                        {showRootUrls ? rootUrl : maskRootUrl(rootUrl)}
                      </span>
                    </div>
                    <div className="domain-item-actions">
                      <button
                        type="button"
                        className="danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleRemoveRootUrl(rootUrl);
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>各種設定</h2>
            </div>
            <p className="caption">
              桶地下サイト向けの追加機能と、ツールチップの検索ボタンの開き方を切り替えできます。
            </p>

            <label className="subtle-setting-card">
              <span className="source-font-toggle">
                <input
                  type="checkbox"
                  checked={settings.enableOkck24HourMode}
                  onChange={(event) => {
                    void handleToggleOkck24HourMode(
                      event.currentTarget.checked
                    );
                  }}
                />
                <span>桶地下サイトを24時間営業にする</span>
              </span>
              <p className="caption">
                サイト内の検索機能ではなく、拡張が提供するツールチップや相互変換パネルの検索ボタンが時間制限なく利用できます。
              </p>
              <p className="caption">
                この設定は世界観を損なうおそれがあります。ご利用の際はあらかじめご了承ください。
              </p>
            </label>

            <label className="subtle-setting-card">
              <span className="source-font-toggle">
                <input
                  type="checkbox"
                  checked={settings.tooltipSearchOpenInNewTab}
                  onChange={(event) => {
                    void handleToggleTooltipSearchOpenInNewTab(
                      event.currentTarget.checked
                    );
                  }}
                />
                <span>ツールチップの検索ボタンを別タブで開く</span>
              </span>
              <p className="caption">
                OFF の場合は現在のタブで遷移し、ON
                の場合は新しいタブで検索結果を開きます。
              </p>
            </label>
          </section>
        </div>

        <div className="top-panels-grid">
          <section className="panel">
            <div className="panel-header">
              <h2>相互変換</h2>
            </div>
            <p className="caption">
              桶地下文字から日本語、日本語から桶地下文字へ変換できます。日本語→桶地下は候補から選択できます。
            </p>
            <ConverterPanel
              mappings={table?.mappings ?? {}}
              enableOkck24HourMode={
                settings?.enableOkck24HourMode ??
                DEFAULT_SETTINGS.enableOkck24HourMode
              }
              tab={converterTab}
              onTabChange={handleSelectConverterTab}
            />
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>発見済みページ</h2>
            </div>
            <p className="caption">
              対象サイト配下で到達したページを自動で記録します。重要なページは個別にブックマークできます。
            </p>
            <div className="bookmark-filter-row">
              <button
                type="button"
                className={`filter-chip${showBookmarkedOnly ? '' : ' is-active'}`}
                onClick={() => {
                  setShowBookmarkedOnly(false);
                }}
              >
                すべて
              </button>
              <button
                type="button"
                className={`filter-chip${showBookmarkedOnly ? ' is-active' : ''}`}
                onClick={() => {
                  setShowBookmarkedOnly(true);
                }}
              >
                ブックマークのみ
              </button>
            </div>
            <div className="bookmark-search-row">
              <input
                type="search"
                className="bookmark-search-input"
                value={discoveredPageSearchQuery}
                onChange={(event) => {
                  setDiscoveredPageSearchQuery(event.target.value);
                }}
                placeholder="タイトル・URL で検索"
                aria-label="発見済みページを検索"
              />
            </div>

            {discoveredPageGroups.length === 0 ? (
              <p className="caption">
                {discoveredPageSearchQuery
                  ? '条件に一致するページはありません。'
                  : showBookmarkedOnly
                    ? 'ブックマークはまだありません。'
                    : '発見済みページはまだありません。'}
              </p>
            ) : (
              <div className="bookmark-groups">
                {discoveredPageGroups.map((group) => {
                  const isCollapsed =
                    collapsedBookmarkGroups[group.key] ?? false;

                  return (
                    <section key={group.key} className="bookmark-group">
                      <button
                        type="button"
                        className="bookmark-group-toggle"
                        onClick={() => {
                          toggleBookmarkGroup(group.key);
                        }}
                        aria-expanded={!isCollapsed}
                      >
                        <span className="bookmark-group-toggle-main">
                          <span
                            className="bookmark-group-chevron"
                            aria-hidden="true"
                          >
                            {isCollapsed ? '▸' : '▾'}
                          </span>
                          <span className="bookmark-group-label">
                            {group.label}
                          </span>
                        </span>
                        <span className="bookmark-group-count">
                          {group.items.length}件
                        </span>
                      </button>

                      {!isCollapsed ? (
                        group.items.length > 0 ? (
                          <ul className="bookmark-list">
                            {group.items.map((page) => (
                              <BookmarkListItem
                                key={page.url}
                                page={page}
                                onOpen={() => {
                                  handleOpenBookmark(page.url);
                                }}
                                onToggleBookmark={() => {
                                  void handleSetBookmark(page);
                                }}
                              />
                            ))}
                          </ul>
                        ) : (
                          <p className="bookmark-group-empty">
                            条件に一致するページはありません。
                          </p>
                        )
                      ) : null}
                    </section>
                  );
                })}
              </div>
            )}
          </section>
        </div>

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
              <button
                type="button"
                onClick={() => {
                  void downloadCsv(table.mappings);
                }}
              >
                CSVエクスポート
              </button>
            </div>
          </div>
          <p className="caption">
            設定画面では CSV のインポート / エクスポートも行えます。
          </p>
          <ConversionTablePanel
            table={table}
            useSourceGlyphFont={settings.useSourceGlyphFontInOptions}
            onToggleSourceGlyphFont={(checked) => {
              void handleToggleSourceGlyphFont(checked);
            }}
            displayMode={displayMode}
            onDisplayModeChange={handleSelectDisplayMode}
            statusContent={
              <>
                {importMessage ? (
                  <p className="conversion-table-caption success">
                    {importMessage}
                  </p>
                ) : null}
                {importError ? (
                  <p className="conversion-table-caption error">
                    {importError}
                  </p>
                ) : null}
              </>
            }
          />
        </section>

        <section className="panel">
          <h2>権利について</h2>
          <p className="caption">桶地下は第四境界のコンテンツです。</p>
          <ul className="credit-list">
            <li>
              第四境界:{' '}
              <a
                href="https://www.daiyonkyokai.net/"
                target="_blank"
                rel="noreferrer"
              >
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
              <a
                href="https://github.com/yaeda/okechika-helper"
                target="_blank"
                rel="noreferrer"
              >
                github.com/yaeda/okechika-helper
              </a>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
