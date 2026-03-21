const SOLID_BOOKMARK_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M6.75 3A.75.75 0 0 0 6 3.75v16.576l5.565-3.967a.75.75 0 0 1 .87 0L18 20.326V3.75A.75.75 0 0 0 17.25 3h-10.5Z"
      fill="currentColor"
      fill-opacity="0.6"
    />
    <path
      d="M6.75 3A.75.75 0 0 0 6 3.75v16.576l5.565-3.967a.75.75 0 0 1 .87 0L18 20.326V3.75A.75.75 0 0 0 17.25 3h-10.5ZM4.5 3.75A2.25 2.25 0 0 1 6.75 1.5h10.5a2.25 2.25 0 0 1 2.25 2.25v18.03a.75.75 0 0 1-1.185.61L12 17.855 5.685 22.39A.75.75 0 0 1 4.5 21.78V3.75Z"
      fill="currentColor"
    />
  </svg>
`;

const OUTLINE_BOOKMARK_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M6.75 3A.75.75 0 0 0 6 3.75v16.576l5.565-3.967a.75.75 0 0 1 .87 0L18 20.326V3.75A.75.75 0 0 0 17.25 3h-10.5ZM4.5 3.75A2.25 2.25 0 0 1 6.75 1.5h10.5a2.25 2.25 0 0 1 2.25 2.25v18.03a.75.75 0 0 1-1.185.61L12 17.855 5.685 22.39A.75.75 0 0 1 4.5 21.78V3.75Z" />
  </svg>
`;

const SIDE_PANEL_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M4.5 5.25A2.25 2.25 0 0 1 6.75 3h10.5a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 17.25 21H6.75A2.25 2.25 0 0 1 4.5 18.75V5.25Zm2.25-.75A.75.75 0 0 0 6 5.25v13.5c0 .414.336.75.75.75h2.25V4.5H6.75Zm3.75 15h6.75a.75.75 0 0 0 .75-.75V5.25a.75.75 0 0 0-.75-.75H10.5v15Z" />
  </svg>
`;

export interface BookmarkButtonController {
  contains(target: EventTarget | null): boolean;
  setBookmarked(isBookmarked: boolean): void;
  setVisible(isVisible: boolean): void;
  destroy(): void;
}

export interface PageActionButtonController {
  contains(target: EventTarget | null): boolean;
  setVisible(isVisible: boolean): void;
  destroy(): void;
}

function getActionButtonHost(): HTMLDivElement {
  let host = document.getElementById(
    'okechika-page-action-buttons'
  ) as HTMLDivElement | null;

  if (host) {
    return host;
  }

  host = document.createElement('div');
  host.id = 'okechika-page-action-buttons';
  document.documentElement.append(host);
  return host;
}

function replaceExistingButton(buttonId: string): HTMLButtonElement | null {
  const existing = document.getElementById(buttonId);
  if (!(existing instanceof HTMLButtonElement)) {
    return null;
  }

  const replacement = existing.cloneNode(true);
  if (!(replacement instanceof HTMLButtonElement)) {
    existing.remove();
    return null;
  }

  existing.replaceWith(replacement);
  return replacement;
}

function cleanupActionButtonHostIfEmpty(): void {
  const host = document.getElementById('okechika-page-action-buttons');
  if (!(host instanceof HTMLDivElement) || host.childElementCount > 0) {
    return;
  }

  host.remove();
}

export function createBookmarkButton(
  onClick: () => void | Promise<void>
): BookmarkButtonController {
  const button =
    replaceExistingButton('okechika-bookmark-button') ??
    document.createElement('button');
  button.id = 'okechika-bookmark-button';
  button.type = 'button';
  button.className = 'is-hidden';
  button.setAttribute('aria-label', 'このページをブックマーク');
  button.innerHTML = OUTLINE_BOOKMARK_ICON;

  button.addEventListener('click', () => {
    void onClick();
  });

  if (!button.parentElement) {
    getActionButtonHost().append(button);
  }

  return {
    contains(target) {
      return button.contains(target as Node | null);
    },
    setBookmarked(isBookmarked) {
      button.classList.toggle('is-bookmarked', isBookmarked);
      button.setAttribute(
        'aria-label',
        isBookmarked ? 'ブックマークを削除' : 'このページをブックマーク'
      );
      button.innerHTML = isBookmarked
        ? SOLID_BOOKMARK_ICON
        : OUTLINE_BOOKMARK_ICON;
    },
    setVisible(isVisible) {
      button.classList.toggle('is-hidden', !isVisible);
    },
    destroy() {
      button.remove();
      cleanupActionButtonHostIfEmpty();
    }
  };
}

export function createSidePanelButton(
  onClick: () => void | Promise<void>
): PageActionButtonController {
  const button =
    replaceExistingButton('okechika-sidepanel-button') ??
    document.createElement('button');
  button.id = 'okechika-sidepanel-button';
  button.type = 'button';
  button.className = 'is-hidden';
  button.setAttribute('aria-label', 'サイドパネルを開閉');
  button.innerHTML = SIDE_PANEL_ICON;

  button.addEventListener('click', () => {
    void onClick();
  });

  if (!button.parentElement) {
    getActionButtonHost().append(button);
  }

  return {
    contains(target) {
      return button.contains(target as Node | null);
    },
    setVisible(isVisible) {
      button.classList.toggle('is-hidden', !isVisible);
    },
    destroy() {
      button.remove();
      cleanupActionButtonHostIfEmpty();
    }
  };
}
