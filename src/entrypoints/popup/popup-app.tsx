import { useEffect, useMemo, useState } from 'react';

import {
  BookmarkListItem,
  type BookmarkListItemData
} from '@/components/bookmark-list-item';
import {
  containsKnownGlyphChars,
  decodeTextWithMappings
} from '@/lib/conversion';
import {
  DEFAULT_SETTINGS,
  getState,
  getPopupUiState,
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

export function PopupApp() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [table, setTable] = useState<DecodeTable | null>(null);
  const [discoveredPages, setDiscoveredPages] = useState<DiscoveredPageEntry[]>(
    []
  );
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [activePageUrl, setActivePageUrl] = useState<string | null>(null);
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);
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

  const pageItems = useMemo<BookmarkListItemData[]>(() => {
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

    return pageItems.filter((page) => {
      const pageRootUrl =
        page.rootUrl ??
        resolveMatchedRootUrl(settings ?? DEFAULT_SETTINGS, page.url);
      if (pageRootUrl !== activeRootUrl) {
        return false;
      }
      return !showBookmarkedOnly || page.isBookmarked;
    });
  }, [activeRootUrl, pageItems, settings, showBookmarkedOnly]);

  async function openUrl(url: string): Promise<void> {
    await chrome.tabs.create({ url });
    window.close();
  }

  async function handleOpenOptions(): Promise<void> {
    await chrome.runtime.openOptionsPage();
    window.close();
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
    <main className="popup-shell">
      <button
        type="button"
        className="popup-settings-link"
        onClick={() => {
          void handleOpenOptions();
        }}
      >
        <span>設定を開く</span>
        <span className="popup-chevron" aria-hidden="true">
          ›
        </span>
      </button>

      <section className="popup-section">
        <header className="popup-section-header">
          <h1>発見済みページ</h1>
          {!loading ? <span>{visiblePages.length}件</span> : null}
        </header>

        <div className="popup-filter-row">
          <button
            type="button"
            className={`popup-filter-chip${showBookmarkedOnly ? '' : ' is-active'}`}
            onClick={() => {
              handleSelectPopupFilter(false);
            }}
          >
            すべて
          </button>
          <button
            type="button"
            className={`popup-filter-chip${showBookmarkedOnly ? ' is-active' : ''}`}
            onClick={() => {
              handleSelectPopupFilter(true);
            }}
          >
            ブックマークのみ
          </button>
        </div>

        {loading ? <p className="popup-empty">読み込み中...</p> : null}

        {!loading && visiblePages.length === 0 ? (
          <p className="popup-empty">
            {showBookmarkedOnly
              ? '現在開いているサイトにブックマークはありません。'
              : '現在開いているサイトで発見済みのページはまだありません。'}
          </p>
        ) : null}

        {!loading && visiblePages.length > 0 ? (
          <ul className="bookmark-list popup-bookmark-list">
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
