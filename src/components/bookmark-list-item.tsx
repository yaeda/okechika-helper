import type { KeyboardEvent } from 'react';

import { BookmarkBadge, BookmarkToggleButton } from '@/components/bookmark-ui';

export interface BookmarkListItemData {
  url: string;
  title: string;
  decodedTitle: string | null;
  isBookmarked: boolean;
}

function handleItemKeyDown(
  event: KeyboardEvent<HTMLElement>,
  onOpen: () => void
): void {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  onOpen();
}

export function BookmarkListItem({
  page,
  onOpen,
  onToggleBookmark
}: {
  page: BookmarkListItemData;
  onOpen: () => void;
  onToggleBookmark: () => void;
}): JSX.Element {
  return (
    <li
      className="bookmark-item bookmark-item-clickable"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        handleItemKeyDown(event, onOpen);
      }}
    >
      <div className="bookmark-main">
        <div className="bookmark-titles">
          <div className="bookmark-title-row">
            <span className="bookmark-link">{page.title}</span>
            <BookmarkBadge isBookmarked={page.isBookmarked} />
          </div>
          {page.decodedTitle ? (
            <p className="bookmark-decoded-title">{page.decodedTitle}</p>
          ) : null}
        </div>
        <p className="bookmark-url">{page.url}</p>
      </div>

      <div
        className="bookmark-item-actions"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <BookmarkToggleButton
          isBookmarked={page.isBookmarked}
          onClick={onToggleBookmark}
        />
      </div>
    </li>
  );
}
