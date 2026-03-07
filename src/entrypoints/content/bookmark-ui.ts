import { isUnknownGlyphElement } from '@/entrypoints/content/glyph';

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

export interface BookmarkButtonController {
  contains(target: EventTarget | null): boolean;
  setBookmarked(isBookmarked: boolean): void;
  setVisible(isVisible: boolean): void;
}

export function pageHasGlyphContent(root: ParentNode = document): boolean {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    if (
      node.textContent?.trim() &&
      isUnknownGlyphElement(node.parentElement) &&
      !node.parentElement?.closest(
        '#okechika-bookmark-button, #okechika-tooltip'
      )
    ) {
      return true;
    }

    node = walker.nextNode();
  }

  return false;
}

export function createBookmarkButton(
  onClick: () => void | Promise<void>
): BookmarkButtonController {
  const button = document.createElement('button');
  button.id = 'okechika-bookmark-button';
  button.type = 'button';
  button.className = 'is-hidden';
  button.setAttribute('aria-label', 'このページをブックマーク');
  button.innerHTML = OUTLINE_BOOKMARK_ICON;

  button.addEventListener('click', () => {
    void onClick();
  });

  document.documentElement.append(button);

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
    }
  };
}
