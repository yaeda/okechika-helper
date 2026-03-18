import { useEffect, useMemo, useState } from 'react';

import {
  BookmarkListItem,
  type BookmarkListItemData
} from '@/components/bookmark-list-item';
import {
  containsKnownGlyphChars,
  decodeTextWithMappings
} from '@/lib/conversion';
import { createPageSearchMatcher } from '@/lib/page-search';
import {
  DEFAULT_SETTINGS,
  getPopupUiState,
  getState,
  resolveMatchedRootUrl,
  setPopupUiState,
  toggleBookmark
} from '@/lib/storage';
import type {
  BookmarkEntry,
  DecodeTable,
  DiscoveredPageEntry,
  ExtensionSettings
} from '@/lib/types';

export type ActionPanelMode = 'popup' | 'sidepanel';

export function ActionPanel({ mode = 'popup' }: { mode?: ActionPanelMode }) {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [table, setTable] = useState<DecodeTable | null>(null);
  const [discoveredPages, setDiscoveredPages] = useState<DiscoveredPageEntry[]>(
    []
  );
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [activePageUrl, setActivePageUrl] = useState<string | null>(null);
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load(): Promise<void> {
      const [state, popupUiState, tabs] = await Promise.all([
        getState(),
        getPopupUiState(),
        chrome.tabs.query({ active: true, currentWindow: true })
      ]);
      const activeTabUrl = tabs[0]?.url ?? null;
      setSettings(state.settings);
      setTable(state.table);
      setDiscoveredPages(state.discoveredPages);
      setBookmarks(state.bookmarks);
      setActivePageUrl(activeTabUrl);
      setShowBookmarkedOnly(popupUiState.showBookmarkedOnly);
      setLoading(false);
    }

    void load();

    const handler: Parameters<
      typeof chrome.storage.onChanged.addListener
    >[0] = (changes, areaName) => {
      if (
        areaName === 'local' &&
        (changes.discoveredPages || changes.popupUiState)
      ) {
        void load();
        return;
      }

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

  const bookmarkedUrls = useMemo(
    () => new Set(bookmarks.map((bookmark) => bookmark.url)),
    [bookmarks]
  );

  const pageItems = useMemo<
    Array<BookmarkListItemData & DiscoveredPageEntry>
  >(() => {
    const mappings = table?.mappings ?? {};

    return discoveredPages
      .map((page) => ({
        ...page,
        decodedTitle: containsKnownGlyphChars(page.title)
          ? decodeTextWithMappings(page.title, mappings)
          : null,
        isBookmarked: bookmarkedUrls.has(page.url)
      }))
      .sort((a, b) => a.url.localeCompare(b.url));
  }, [bookmarkedUrls, discoveredPages, table]);

  const activeRootUrl = useMemo(() => {
    if (!activePageUrl) {
      return null;
    }

    return resolveMatchedRootUrl(settings ?? DEFAULT_SETTINGS, activePageUrl);
  }, [activePageUrl, settings]);

  const visiblePages = useMemo(() => {
    if (!activeRootUrl) {
      return [];
    }

    const matchesSearchQuery = createPageSearchMatcher(searchQuery);

    return pageItems.filter((page) => {
      const pageRootUrl =
        page.rootUrl ??
        resolveMatchedRootUrl(settings ?? DEFAULT_SETTINGS, page.url);
      if (pageRootUrl !== activeRootUrl) {
        return false;
      }
      if (showBookmarkedOnly && !page.isBookmarked) {
        return false;
      }
      return matchesSearchQuery(page);
    });
  }, [activeRootUrl, pageItems, searchQuery, settings, showBookmarkedOnly]);

  async function openUrl(url: string): Promise<void> {
    await chrome.tabs.create({ url });
    if (mode === 'popup') {
      window.close();
    }
  }

  async function handleOpenOptions(): Promise<void> {
    await chrome.runtime.openOptionsPage();
    if (mode === 'popup') {
      window.close();
    }
  }

  function handleSelectPopupFilter(nextShowBookmarkedOnly: boolean): void {
    setShowBookmarkedOnly(nextShowBookmarkedOnly);
    void setPopupUiState({
      showBookmarkedOnly: nextShowBookmarkedOnly
    });
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

  return (
    <main
      className={`action-panel-shell${mode === 'sidepanel' ? ' is-sidepanel' : ''}`}
    >
      <button
        type="button"
        className="action-panel-settings-link"
        onClick={() => {
          void handleOpenOptions();
        }}
      >
        <span>設定を開く</span>
        <span className="action-panel-chevron" aria-hidden="true">
          ›
        </span>
      </button>

      <section className="action-panel-section">
        <header className="action-panel-section-header">
          <h1>発見済みページ</h1>
          {!loading ? <span>{visiblePages.length}件</span> : null}
        </header>

        <div className="action-panel-filter-row">
          <button
            type="button"
            className={`action-panel-filter-chip${showBookmarkedOnly ? '' : ' is-active'}`}
            onClick={() => {
              handleSelectPopupFilter(false);
            }}
          >
            すべて
          </button>
          <button
            type="button"
            className={`action-panel-filter-chip${showBookmarkedOnly ? ' is-active' : ''}`}
            onClick={() => {
              handleSelectPopupFilter(true);
            }}
          >
            ブックマークのみ
          </button>
        </div>

        <div className="action-panel-search-row">
          <input
            type="search"
            className="action-panel-search-input"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
            }}
            placeholder="タイトル・URL で検索"
            aria-label="発見済みページを検索"
          />
        </div>

        {loading ? <p className="action-panel-empty">読み込み中...</p> : null}

        {!loading && visiblePages.length === 0 ? (
          <p className="action-panel-empty">
            {searchQuery
              ? '条件に一致するページはありません。'
              : showBookmarkedOnly
                ? '現在開いているサイトにブックマークはありません。'
                : '現在開いているサイトで発見済みのページはまだありません。'}
          </p>
        ) : null}

        {!loading && visiblePages.length > 0 ? (
          <ul className="bookmark-list action-panel-bookmark-list">
            {visiblePages.map((page) => (
              <BookmarkListItem
                key={page.url}
                page={page}
                onOpen={() => {
                  void openUrl(page.url);
                }}
                onToggleBookmark={() => {
                  void handleSetBookmark(page);
                }}
              />
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
