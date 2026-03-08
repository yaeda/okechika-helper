import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { ReactNode } from 'react';

import {
  containsKnownGlyphChars,
  decodeTextWithMappings
} from '@/lib/conversion';
import {
  DEFAULT_SETTINGS,
  DEFAULT_ROOT_URLS,
  getState,
  normalizeRootUrl,
  removeBookmark,
  resolveMatchedRootUrl,
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
import type {
  BookmarkEntry,
  DecodeMap,
  DecodeTable,
  ExtensionSettings
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

function joinClassNames(
  ...names: Array<string | undefined>
): string | undefined {
  const filtered = names.filter(Boolean);
  return filtered.length > 0 ? filtered.join(' ') : undefined;
}

function tokenizeByLongestTargets(text: string, targets: string[]): string[] {
  const tokens: string[] = [];
  let index = 0;

  while (index < text.length) {
    const matched = targets.find((target) => text.startsWith(target, index));
    if (matched) {
      tokens.push(matched);
      index += matched.length;
      continue;
    }

    const char = text[index];
    if (char) {
      tokens.push(char);
    }
    index += 1;
  }

  return tokens;
}

function ScrollableTableWrap({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasLeftFade, setHasLeftFade] = useState(false);
  const [hasRightFade, setHasRightFade] = useState(false);

  useEffect(() => {
    function updateFadeVisibility(): void {
      const element = containerRef.current;
      if (!element) {
        return;
      }

      const maxScrollLeft = Math.max(
        0,
        element.scrollWidth - element.clientWidth
      );
      setHasLeftFade(element.scrollLeft > 0);
      setHasRightFade(element.scrollLeft < maxScrollLeft - 1);
    }

    updateFadeVisibility();

    const element = containerRef.current;
    if (!element) {
      return;
    }

    element.addEventListener('scroll', updateFadeVisibility, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      updateFadeVisibility();
    });
    resizeObserver.observe(element);
    const firstChild = element.firstElementChild;
    if (firstChild) {
      resizeObserver.observe(firstChild);
    }

    window.addEventListener('resize', updateFadeVisibility);

    return () => {
      element.removeEventListener('scroll', updateFadeVisibility);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateFadeVisibility);
    };
  }, []);

  return (
    <div
      className={joinClassNames(
        'table-wrap',
        className,
        hasLeftFade ? 'has-left-fade' : undefined,
        hasRightFade ? 'has-right-fade' : undefined
      )}
    >
      <div ref={containerRef} className="table-wrap-scroll">
        {children}
      </div>
    </div>
  );
}

export function OptionsApp() {
  const extensionVersion = chrome.runtime.getManifest().version;
  const [displayMode, setDisplayMode] = useState<'source' | 'target' | 'both'>(
    'both'
  );
  const [showRootUrls, setShowRootUrls] = useState(false);
  const [settings, setLocalSettings] = useState<ExtensionSettings | null>(null);
  const [table, setTable] = useState<DecodeTable | null>(null);
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRootUrlInput, setNewRootUrlInput] = useState('');
  const [rootUrlError, setRootUrlError] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const [inlineEditError, setInlineEditError] = useState('');
  const [editingCell, setEditingCell] = useState<{
    source: string;
    draft: string;
    cellKey: string;
  } | null>(null);
  const [glyphToTextInput, setGlyphToTextInput] = useState('');
  const [textToGlyphInput, setTextToGlyphInput] = useState('');
  const [textToGlyphSelected, setTextToGlyphSelected] = useState<string[]>([]);
  const [converterMessage, setConverterMessage] = useState('');
  const [converterError, setConverterError] = useState('');
  const [converterTab, setConverterTab] = useState<
    'glyphToText' | 'textToGlyph'
  >('glyphToText');
  const [collapsedBookmarkGroups, setCollapsedBookmarkGroups] = useState<
    Record<string, boolean>
  >({});
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    async function load(): Promise<void> {
      const state = await getState();
      setLocalSettings(state.settings);
      setTable(state.table);
      setBookmarks(state.bookmarks);
      setLoading(false);
    }

    void load();

    const handler: Parameters<
      typeof chrome.storage.onChanged.addListener
    >[0] = (changes, areaName) => {
      if (areaName !== 'sync') {
        return;
      }

      if (changes.decodeTable || changes.settings || changes.bookmarks) {
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
      .sort(([a], [b]) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      );
  }, [table]);

  const bookmarkItems = useMemo(() => {
    const mappings = table?.mappings ?? {};

    return bookmarks.map((bookmark) => {
      const hasGlyphTitle = containsKnownGlyphChars(bookmark.title);
      const rootUrl =
        bookmark.rootUrl ??
        resolveMatchedRootUrl(settings ?? DEFAULT_SETTINGS, bookmark.url);

      return {
        ...bookmark,
        rootUrl,
        decodedTitle: hasGlyphTitle
          ? decodeTextWithMappings(bookmark.title, mappings)
          : null
      };
    });
  }, [bookmarks, settings, table]);

  const bookmarkGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        items: typeof bookmarkItems;
      }
    >();

    for (const bookmark of bookmarkItems) {
      const groupKey = bookmark.rootUrl ?? '__unmatched__';
      const existing = groups.get(groupKey);

      if (existing) {
        existing.items.push(bookmark);
        continue;
      }

      groups.set(groupKey, {
        key: groupKey,
        label: bookmark.rootUrl ?? '未分類のURL',
        items: [bookmark]
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
  }, [bookmarkItems]);

  useEffect(() => {
    setCollapsedBookmarkGroups((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const group of bookmarkGroups) {
        if (!(group.key in next)) {
          next[group.key] = true;
          changed = true;
        }
      }

      for (const key of Object.keys(next)) {
        if (!bookmarkGroups.some((group) => group.key === key)) {
          delete next[key];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [bookmarkGroups]);

  const glyphSourceSet = useMemo(() => new Set(OKECHIKA_CHARS), []);

  const glyphToTextOutput = useMemo(() => {
    const mappings = table?.mappings ?? {};
    return Array.from(glyphToTextInput)
      .map((char) => {
        const mapped = mappings[char];
        if (mapped) {
          return mapped;
        }
        return glyphSourceSet.has(char) ? '?' : char;
      })
      .join('');
  }, [glyphToTextInput, glyphSourceSet, table]);

  const textToGlyphSegments = useMemo(() => {
    const mappings = table?.mappings ?? {};
    const reverseMap = new Map<string, string[]>();
    Object.entries(mappings).forEach(([source, target]) => {
      if (!target) {
        return;
      }
      const existing = reverseMap.get(target);
      if (existing) {
        existing.push(source);
        return;
      }
      reverseMap.set(target, [source]);
    });
    for (const candidates of reverseMap.values()) {
      candidates.sort((a, b) => a.localeCompare(b));
    }

    const targets = Array.from(reverseMap.keys()).sort(
      (a, b) => b.length - a.length
    );
    const tokens = tokenizeByLongestTargets(textToGlyphInput, targets);
    return tokens.map((token) => ({
      token,
      candidates: reverseMap.get(token) ?? []
    }));
  }, [table, textToGlyphInput]);

  useEffect(() => {
    setTextToGlyphSelected((prev) =>
      textToGlyphSegments.map((segment, index) => {
        const previous = prev[index];
        if (previous && segment.candidates.includes(previous)) {
          return previous;
        }
        return segment.candidates[0] ?? '';
      })
    );
  }, [textToGlyphSegments]);

  const textToGlyphOutput = useMemo(
    () =>
      textToGlyphSegments
        .map((segment, index) => textToGlyphSelected[index] || segment.token)
        .join(''),
    [textToGlyphSegments, textToGlyphSelected]
  );

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

  async function handleResetDefaultRootUrls(): Promise<void> {
    setRootUrlError('');
    setNewRootUrlInput('');
    await saveRootUrls(DEFAULT_ROOT_URLS);
  }

  async function handleRemoveBookmark(url: string): Promise<void> {
    setBookmarks((prev) => prev.filter((bookmark) => bookmark.url !== url));
    await removeBookmark(url);
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

  async function handleCopyConverterResult(
    value: string,
    successMessage: string
  ): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setConverterError('');
      setConverterMessage(successMessage);
    } catch {
      setConverterMessage('');
      setConverterError('コピーに失敗しました。');
    }
  }

  function startInlineEdit(
    source: string,
    currentTarget: string,
    cellKey: string
  ): void {
    setInlineEditError('');
    setEditingCell({
      source,
      draft: currentTarget === '?' ? '' : currentTarget,
      cellKey
    });
  }

  function cancelInlineEdit(): void {
    setEditingCell(null);
  }

  async function commitInlineEdit(
    source: string,
    draft: string
  ): Promise<void> {
    if (!table) {
      return;
    }

    const currentValue = table.mappings[source] ?? '';
    const shouldDelete = draft === '' || draft === '?';
    if (shouldDelete && currentValue === '') {
      setEditingCell(null);
      return;
    }
    if (!shouldDelete && draft === currentValue) {
      setEditingCell(null);
      return;
    }

    const nextMappings: DecodeMap = { ...table.mappings };
    if (shouldDelete) {
      delete nextMappings[source];
    } else {
      nextMappings[source] = draft;
    }

    setEditingCell(null);
    setInlineEditError('');
    setTable({
      mappings: nextMappings,
      updatedAt: new Date().toISOString()
    });

    try {
      await setMappings(nextMappings);
    } catch {
      setInlineEditError(
        'セル編集の保存に失敗しました。もう一度お試しください。'
      );
    }
  }

  function renderCellEditor(source: string, cellKey: string): JSX.Element {
    if (editingCell?.source === source && editingCell.cellKey === cellKey) {
      return (
        <input
          className="cell-edit-input"
          size={1}
          value={editingCell.draft}
          onChange={(event) => {
            const nextDraft = event.currentTarget.value;
            setEditingCell((prev) => {
              if (!prev || prev.source !== source || prev.cellKey !== cellKey) {
                return prev;
              }
              return {
                ...prev,
                draft: nextDraft
              };
            });
          }}
          onBlur={() => {
            if (skipBlurCommitRef.current) {
              skipBlurCommitRef.current = false;
              return;
            }
            void commitInlineEdit(source, editingCell.draft);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commitInlineEdit(source, editingCell.draft);
              return;
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              skipBlurCommitRef.current = true;
              cancelInlineEdit();
            }
          }}
          autoFocus
        />
      );
    }

    return <></>;
  }

  function renderEditableTarget(target: string): JSX.Element {
    return (
      <span
        className={joinClassNames(
          'editable-target',
          target === '?' ? 'unknown-target' : undefined
        )}
      >
        {target}
      </span>
    );
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
              <p className="eyebrow">
                <span>桶地下 helper</span>
                <span className="version-badge">v{extensionVersion}</span>
              </p>
              <div className="hero-title-row">
                <h1>設定</h1>
                <p className="sub hero-sub-inline">
                  変換表の確認・CSV入出力・対象URLの管理ができます。
                </p>
              </div>
            </div>
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
                  href="https://github.com/yaeda/okechika-helper/releases"
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

            {rootUrlError ? (
              <p className="caption error">{rootUrlError}</p>
            ) : null}

            <ul className="domain-list">
              {settings.enabledRootUrls.length === 0 ? (
                <li className="empty">対象ルートURLは未設定です。</li>
              ) : (
                settings.enabledRootUrls.map((rootUrl) => (
                  <li key={rootUrl} className="domain-item">
                    <span>{showRootUrls ? rootUrl : maskRootUrl(rootUrl)}</span>
                    <div className="domain-item-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          handleOpenRootUrl(rootUrl);
                        }}
                      >
                        開く
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
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
                <span>桶地下サイトを24時間モードにする</span>
              </span>
              <p className="caption">
                設定を反映するためにページを開き直して下さい
              </p>
            </label>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>相互変換</h2>
            </div>
            <p className="caption">
              桶地下文字から日本語、日本語から桶地下文字へ変換できます。日本語→桶地下は候補から選択できます。
            </p>
            {converterMessage ? (
              <p className="caption success">{converterMessage}</p>
            ) : null}
            {converterError ? (
              <p className="caption error">{converterError}</p>
            ) : null}

            <div className="converter-tab-group">
              <button
                type="button"
                className={
                  converterTab === 'glyphToText'
                    ? 'secondary is-active'
                    : 'secondary'
                }
                onClick={() => setConverterTab('glyphToText')}
              >
                桶地下 → 日本語
              </button>
              <button
                type="button"
                className={
                  converterTab === 'textToGlyph'
                    ? 'secondary is-active'
                    : 'secondary'
                }
                onClick={() => setConverterTab('textToGlyph')}
              >
                日本語 → 桶地下
              </button>
            </div>

            <div className="converter-section">
              {converterTab === 'glyphToText' ? (
                <>
                  <textarea
                    className="converter-textarea"
                    rows={1}
                    value={glyphToTextInput}
                    onChange={(event) => {
                      setGlyphToTextInput(event.currentTarget.value);
                      setConverterMessage('');
                      setConverterError('');
                    }}
                    placeholder="桶地下文字を入力"
                  />
                  <div className="converter-output">
                    {glyphToTextOutput || '（変換結果）'}
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      void handleCopyConverterResult(
                        glyphToTextOutput,
                        '日本語変換結果をコピーしました。'
                      );
                    }}
                    disabled={!glyphToTextOutput}
                  >
                    結果をコピー
                  </button>
                </>
              ) : null}

              {converterTab === 'textToGlyph' ? (
                <>
                  <textarea
                    className="converter-textarea"
                    rows={1}
                    value={textToGlyphInput}
                    onChange={(event) => {
                      setTextToGlyphInput(event.currentTarget.value);
                      setConverterMessage('');
                      setConverterError('');
                    }}
                    placeholder="日本語を入力"
                  />
                  <div className="converter-candidates">
                    {textToGlyphSegments.length === 0 ? (
                      <p className="caption">候補がここに表示されます。</p>
                    ) : (
                      textToGlyphSegments.map((segment, index) => (
                        <div
                          key={`segment-${index}-${segment.token}`}
                          className="converter-segment"
                        >
                          <span className="converter-token">
                            {segment.token}
                          </span>
                          {segment.candidates.length === 0 ? (
                            <span className="converter-no-candidate">
                              候補なし
                            </span>
                          ) : (
                            <div className="converter-choices">
                              {segment.candidates.map((candidate) => (
                                <button
                                  key={`choice-${index}-${candidate}`}
                                  type="button"
                                  className={
                                    textToGlyphSelected[index] === candidate
                                      ? 'secondary is-active'
                                      : 'secondary'
                                  }
                                  onClick={() => {
                                    setTextToGlyphSelected((prev) => {
                                      const next = [...prev];
                                      next[index] = candidate;
                                      return next;
                                    });
                                  }}
                                >
                                  {candidate}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  <div className="converter-output">
                    {textToGlyphOutput || '（変換結果）'}
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      void handleCopyConverterResult(
                        textToGlyphOutput,
                        '桶地下文字変換結果をコピーしました。'
                      );
                    }}
                    disabled={!textToGlyphOutput}
                  >
                    結果をコピー
                  </button>
                </>
              ) : null}
            </div>
          </section>
        </div>

        <section className="panel">
          <div className="panel-header">
            <h2>ブックマーク</h2>
          </div>
          <p className="caption">
            桶地下文字のあるページで追加したブックマークです。タイトルに桶地下文字が含まれる場合は変換結果も表示します。
          </p>

          {bookmarkGroups.length === 0 ? (
            <p className="caption">ブックマークはまだありません。</p>
          ) : (
            <div className="bookmark-groups">
              {bookmarkGroups.map((group) => {
                const isCollapsed = collapsedBookmarkGroups[group.key] ?? false;

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
                      <ul className="bookmark-list">
                        {group.items.map((bookmark) => (
                          <li key={bookmark.url} className="bookmark-item">
                            <div className="bookmark-main">
                              <div className="bookmark-titles">
                                <a
                                  href={bookmark.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="bookmark-link"
                                >
                                  {bookmark.title}
                                </a>
                                {bookmark.decodedTitle ? (
                                  <p className="caption bookmark-decoded-title">
                                    {bookmark.decodedTitle}
                                  </p>
                                ) : null}
                              </div>
                              <p className="caption bookmark-url">
                                {bookmark.url}
                              </p>
                            </div>
                            <div className="domain-item-actions">
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => {
                                  handleOpenBookmark(bookmark.url);
                                }}
                              >
                                開く
                              </button>
                              <button
                                type="button"
                                className="danger"
                                onClick={() => {
                                  void handleRemoveBookmark(bookmark.url);
                                }}
                              >
                                削除
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}
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
            最終更新日: {formatUpdatedAt(table.updatedAt)}
          </p>
          {importMessage ? (
            <p className="caption success">{importMessage}</p>
          ) : null}
          {importError ? <p className="caption error">{importError}</p> : null}
          {inlineEditError ? (
            <p className="caption error">{inlineEditError}</p>
          ) : null}
          <p className="caption">
            セルをダブルクリックすると、そのセルを直接編集できます。
          </p>

          <div className="display-row">
            <p className="caption progress">
              解析進捗: {decodeProgress.decoded}/{decodeProgress.total}（
              {decodeProgress.percent.toFixed(1)}%）
            </p>
            <div className="display-controls">
              <label className="source-font-toggle">
                <input
                  type="checkbox"
                  checked={settings.useSourceGlyphFontInOptions}
                  onChange={(event) => {
                    void handleToggleSourceGlyphFont(
                      event.currentTarget.checked
                    );
                  }}
                />
                <span>変換前に桶地下フォントを適用</span>
              </label>
              <div className="display-mode-group">
                <button
                  type="button"
                  className={
                    displayMode === 'source'
                      ? 'secondary is-active'
                      : 'secondary'
                  }
                  onClick={() => setDisplayMode('source')}
                >
                  変換前
                </button>
                <button
                  type="button"
                  className={
                    displayMode === 'target'
                      ? 'secondary is-active'
                      : 'secondary'
                  }
                  onClick={() => setDisplayMode('target')}
                >
                  変換後
                </button>
                <button
                  type="button"
                  className={
                    displayMode === 'both' ? 'secondary is-active' : 'secondary'
                  }
                  onClick={() => setDisplayMode('both')}
                >
                  両方表示
                </button>
              </div>
            </div>
          </div>

          <ScrollableTableWrap className="table-wrap-fill">
            <table>
              <tbody>
                {glyphSections.baseRows.map((row, rowIndex) => (
                  <tr key={`glyph-row-${rowIndex}`}>
                    {row.map(({ source, target }) => (
                      <td
                        key={source}
                        className="glyph-cell editable-cell"
                        onDoubleClick={() =>
                          startInlineEdit(source, target, source)
                        }
                        title="ダブルクリックで編集"
                      >
                        {editingCell?.source === source &&
                        editingCell.cellKey === source
                          ? renderCellEditor(source, source)
                          : null}
                        {editingCell?.source === source &&
                        editingCell.cellKey === source ? null : displayMode ===
                          'source' ? (
                          <span
                            className={joinClassNames(
                              settings.useSourceGlyphFontInOptions
                                ? 'source-glyph'
                                : undefined,
                              target === '?' ? 'unknown-target' : undefined
                            )}
                          >
                            {source}
                          </span>
                        ) : null}
                        {editingCell?.source === source &&
                        editingCell.cellKey === source
                          ? null
                          : displayMode === 'target'
                            ? renderEditableTarget(target)
                            : null}
                        {editingCell?.source === source &&
                        editingCell.cellKey === source ? null : displayMode ===
                          'both' ? (
                          <span className="glyph-pair">
                            <span
                              className={joinClassNames(
                                settings.useSourceGlyphFontInOptions
                                  ? 'source-glyph'
                                  : undefined,
                                target === '?' ? 'unknown-target' : undefined
                              )}
                            >
                              {source}
                            </span>
                            <span
                              className={
                                target === '?'
                                  ? 'glyph-divider unknown-target'
                                  : 'glyph-divider'
                              }
                            >
                              {'>'}
                            </span>
                            {renderEditableTarget(target)}
                          </span>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTableWrap>

          {glyphSections.numberLikeRows.length > 0 ? (
            <>
              <ScrollableTableWrap className="table-wrap-fill table-wrap-second">
                <table>
                  <tbody>
                    {glyphSections.numberLikeRows.map((row, rowIndex) => (
                      <tr key={`glyph-number-row-${rowIndex}`}>
                        {row.map(({ source, target }) => (
                          <td
                            key={source}
                            className="glyph-cell editable-cell"
                            onDoubleClick={() =>
                              startInlineEdit(source, target, source)
                            }
                            title="ダブルクリックで編集"
                          >
                            {editingCell?.source === source &&
                            editingCell.cellKey === source
                              ? renderCellEditor(source, source)
                              : null}
                            {editingCell?.source === source &&
                            editingCell.cellKey ===
                              source ? null : displayMode === 'source' ? (
                              <span
                                className={joinClassNames(
                                  settings.useSourceGlyphFontInOptions
                                    ? 'source-glyph'
                                    : undefined,
                                  target === '?' ? 'unknown-target' : undefined
                                )}
                              >
                                {source}
                              </span>
                            ) : null}
                            {editingCell?.source === source &&
                            editingCell.cellKey === source
                              ? null
                              : displayMode === 'target'
                                ? renderEditableTarget(target)
                                : null}
                            {editingCell?.source === source &&
                            editingCell.cellKey ===
                              source ? null : displayMode === 'both' ? (
                              <span className="glyph-pair">
                                <span
                                  className={joinClassNames(
                                    settings.useSourceGlyphFontInOptions
                                      ? 'source-glyph'
                                      : undefined,
                                    target === '?'
                                      ? 'unknown-target'
                                      : undefined
                                  )}
                                >
                                  {source}
                                </span>
                                <span
                                  className={
                                    target === '?'
                                      ? 'glyph-divider unknown-target'
                                      : 'glyph-divider'
                                  }
                                >
                                  {'>'}
                                </span>
                                {renderEditableTarget(target)}
                              </span>
                            ) : null}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTableWrap>
            </>
          ) : null}

          <h3 className="subsection-title">その他の文字</h3>
          {otherMappings.length === 0 ? (
            <p className="caption">該当する文字はありません。</p>
          ) : (
            <ScrollableTableWrap className="table-wrap-compact">
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
                      <td
                        className={joinClassNames(
                          'editable-cell',
                          settings.useSourceGlyphFontInOptions
                            ? 'source-glyph'
                            : undefined,
                          target === '?' ? 'unknown-target' : undefined
                        )}
                        onDoubleClick={() =>
                          startInlineEdit(
                            source,
                            target,
                            `other-source-${source}`
                          )
                        }
                        title="ダブルクリックで編集"
                      >
                        {editingCell?.source === source &&
                        editingCell.cellKey === `other-source-${source}`
                          ? renderCellEditor(source, `other-source-${source}`)
                          : source}
                      </td>
                      <td
                        className="editable-cell"
                        onDoubleClick={() =>
                          startInlineEdit(
                            source,
                            target,
                            `other-target-${source}`
                          )
                        }
                        title="ダブルクリックで編集"
                      >
                        {editingCell?.source === source &&
                        editingCell.cellKey === `other-target-${source}`
                          ? renderCellEditor(source, `other-target-${source}`)
                          : renderEditableTarget(target)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTableWrap>
          )}
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
