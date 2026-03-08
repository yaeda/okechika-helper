import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';

import {
  containsKnownGlyphChars,
  decodeTextWithMappings
} from '@/lib/conversion';
import {
  DEFAULT_SETTINGS,
  getState,
  removeBookmark,
  resolveMatchedRootUrl
} from '@/lib/storage';
import type {
  BookmarkEntry,
  DecodeTable,
  ExtensionSettings
} from '@/lib/types';

type PopupBookmarkItem = BookmarkEntry & {
  decodedTitle: string | null;
};

export function PopupApp() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [table, setTable] = useState<DecodeTable | null>(null);
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [activePageUrl, setActivePageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load(): Promise<void> {
      const [state, tabs] = await Promise.all([
        getState(),
        chrome.tabs.query({ active: true, currentWindow: true })
      ]);
      const activeTabUrl = tabs[0]?.url ?? null;
      setSettings(state.settings);
      setTable(state.table);
      setBookmarks(state.bookmarks);
      setActivePageUrl(activeTabUrl);
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

  const bookmarkItems = useMemo<PopupBookmarkItem[]>(() => {
    const mappings = table?.mappings ?? {};

    return bookmarks.map((bookmark) => ({
      ...bookmark,
      decodedTitle: containsKnownGlyphChars(bookmark.title)
        ? decodeTextWithMappings(bookmark.title, mappings)
        : null
    }));
  }, [bookmarks, table]);

  const activeRootUrl = useMemo(() => {
    if (!activePageUrl) {
      return null;
    }

    return resolveMatchedRootUrl(settings ?? DEFAULT_SETTINGS, activePageUrl);
  }, [activePageUrl, settings]);

  const visibleBookmarks = useMemo(() => {
    if (!activeRootUrl) {
      return [];
    }

    return bookmarkItems.filter((bookmark) => {
      const bookmarkRootUrl =
        bookmark.rootUrl ??
        resolveMatchedRootUrl(settings ?? DEFAULT_SETTINGS, bookmark.url);
      return bookmarkRootUrl === activeRootUrl;
    });
  }, [activeRootUrl, bookmarkItems, settings]);

  async function openUrl(url: string): Promise<void> {
    await chrome.tabs.create({ url });
    window.close();
  }

  async function handleOpenOptions(): Promise<void> {
    await chrome.runtime.openOptionsPage();
    window.close();
  }

  async function handleRemoveBookmark(url: string): Promise<void> {
    setBookmarks((prev) => prev.filter((bookmark) => bookmark.url !== url));
    await removeBookmark(url);
  }

  function handleBookmarkKeyDown(
    event: KeyboardEvent<HTMLElement>,
    url: string
  ): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    void openUrl(url);
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
          <h1>ブックマーク</h1>
          {!loading ? <span>{visibleBookmarks.length}件</span> : null}
        </header>

        {loading ? <p className="popup-empty">読み込み中...</p> : null}

        {!loading && visibleBookmarks.length === 0 ? (
          <p className="popup-empty">
            現在開いているサイトのブックマークはありません。
          </p>
        ) : null}

        {!loading && visibleBookmarks.length > 0 ? (
          <ul className="popup-bookmark-list">
            {visibleBookmarks.map((bookmark) => (
              <li key={bookmark.url}>
                <div
                  className="popup-bookmark-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    void openUrl(bookmark.url);
                  }}
                  onKeyDown={(event) => {
                    handleBookmarkKeyDown(event, bookmark.url);
                  }}
                >
                  <div className="popup-bookmark-main">
                    <p className="popup-bookmark-title">{bookmark.title}</p>
                    {bookmark.decodedTitle ? (
                      <p className="popup-bookmark-decoded">
                        {bookmark.decodedTitle}
                      </p>
                    ) : null}
                    <p className="popup-bookmark-url">{bookmark.url}</p>
                  </div>

                  <div className="popup-bookmark-actions">
                    <button
                      type="button"
                      className="popup-action-button danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleRemoveBookmark(bookmark.url);
                      }}
                    >
                      削除
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
