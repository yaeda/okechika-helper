export function BookmarkBadge({
  isBookmarked
}: {
  isBookmarked: boolean;
}): JSX.Element {
  return (
    <span className={`bookmark-state-badge${isBookmarked ? '' : ' is-hidden'}`}>
      ブックマーク
    </span>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }): JSX.Element {
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M6.75 3A.75.75 0 0 0 6 3.75v16.576l5.565-3.967a.75.75 0 0 1 .87 0L18 20.326V3.75A.75.75 0 0 0 17.25 3h-10.5Z"
          fill="currentColor"
          fillOpacity="0.6"
        />
        <path
          d="M6.75 3A.75.75 0 0 0 6 3.75v16.576l5.565-3.967a.75.75 0 0 1 .87 0L18 20.326V3.75A.75.75 0 0 0 17.25 3h-10.5ZM4.5 3.75A2.25 2.25 0 0 1 6.75 1.5h10.5a2.25 2.25 0 0 1 2.25 2.25v18.03a.75.75 0 0 1-1.185.61L12 17.855 5.685 22.39A.75.75 0 0 1 4.5 21.78V3.75Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        className="bookmark-icon-fill"
        d="M6.75 3A.75.75 0 0 0 6 3.75v16.576l5.565-3.967a.75.75 0 0 1 .87 0L18 20.326V3.75A.75.75 0 0 0 17.25 3h-10.5Z"
      />
      <path d="M6.75 3A.75.75 0 0 0 6 3.75v16.576l5.565-3.967a.75.75 0 0 1 .87 0L18 20.326V3.75A.75.75 0 0 0 17.25 3h-10.5ZM4.5 3.75A2.25 2.25 0 0 1 6.75 1.5h10.5a2.25 2.25 0 0 1 2.25 2.25v18.03a.75.75 0 0 1-1.185.61L12 17.855 5.685 22.39A.75.75 0 0 1 4.5 21.78V3.75Z" />
    </svg>
  );
}

export function BookmarkToggleButton({
  isBookmarked,
  onClick
}: {
  isBookmarked: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`bookmark-toggle-button${isBookmarked ? ' is-bookmarked' : ''}`}
      aria-label={isBookmarked ? 'ブックマークを解除' : 'ブックマークに追加'}
      title={isBookmarked ? 'ブックマークを解除' : 'ブックマークに追加'}
      onClick={onClick}
    >
      <BookmarkIcon filled={isBookmarked} />
    </button>
  );
}
