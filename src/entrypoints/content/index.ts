import { decodeTextWithMappings } from '@/lib/conversion';
import {
  getState,
  resolveMatchedRootUrl,
  shouldRunOnUrl,
  toggleBookmark,
  upsertMappings
} from '@/lib/storage';
import type { DecodeMap } from '@/lib/types';
import {
  createAnnotationController,
  type AnnotationController
} from '@/entrypoints/content/annotation';
import {
  createBookmarkButton,
  pageHasGlyphContent,
  type BookmarkButtonController
} from '@/entrypoints/content/bookmark-ui';
import {
  getSelectionForUnknownGlyph,
  isTranslatableGlyphChar
} from '@/entrypoints/content/glyph';
import { getPageUrlForMatching } from '@/entrypoints/content/host';
import {
  createTooltipUi,
  type TooltipUi
} from '@/entrypoints/content/tooltip-ui';
import './style.css';

let currentMappings: DecodeMap = {};
let currentSearchRootUrl: string | null = null;
let currentTooltipSearchOpenInNewTab = false;
let currentOkck24HourModeEnabled = false;
let isActive = false;
let observer: MutationObserver | null = null;

function decodeSelectedText(text: string): string {
  return Array.from(text)
    .map((char) =>
      isTranslatableGlyphChar(char)
        ? decodeTextWithMappings(char, currentMappings)
        : char
    )
    .join('');
}

async function refreshActivation(
  tooltip: Pick<TooltipUi, 'hide'>,
  annotation: AnnotationController,
  bookmarkButton: BookmarkButtonController
): Promise<void> {
  const state = await getState();
  currentMappings = state.table.mappings;
  annotation.setMappings(currentMappings);
  currentTooltipSearchOpenInNewTab = state.settings.tooltipSearchOpenInNewTab;
  currentOkck24HourModeEnabled = state.settings.enableOkck24HourMode;
  const pageUrl = await getPageUrlForMatching();
  currentSearchRootUrl = resolveMatchedRootUrl(state.settings, pageUrl);
  const nextIsActive = shouldRunOnUrl(state.settings, pageUrl);
  const isBookmarked = state.bookmarks.some(
    (bookmark) => bookmark.url === pageUrl
  );
  bookmarkButton.setBookmarked(isBookmarked);
  bookmarkButton.setVisible(nextIsActive && pageHasGlyphContent());

  if (nextIsActive === isActive) {
    if (isActive) {
      annotation.updateExistingRubies();
      annotation.annotateDocument();
    }
    return;
  }

  isActive = nextIsActive;

  if (!isActive) {
    tooltip.hide();
    annotation.clearAnnotations();
    bookmarkButton.setVisible(false);
    observer?.disconnect();
    return;
  }

  annotation.annotateDocument();
  observeDomChanges(annotation, bookmarkButton);
}

function observeDomChanges(
  annotation: AnnotationController,
  bookmarkButton: BookmarkButtonController
): void {
  observer?.disconnect();

  observer = new MutationObserver(() => {
    annotation.annotateDocument();
    bookmarkButton.setVisible(isActive && pageHasGlyphContent());
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

export default defineContentScript({
  registration: 'runtime',
  main(ctx) {
    const annotation = createAnnotationController();
    const bookmarkButton = createBookmarkButton(async () => {
      if (!isActive) {
        return;
      }

      const pageUrl = await getPageUrlForMatching();
      const nextState = await toggleBookmark({
        url: pageUrl,
        title: document.title || pageUrl,
        rootUrl: currentSearchRootUrl
      });
      bookmarkButton.setBookmarked(nextState);
    });

    const tooltip = createTooltipUi(
      ctx,
      async (entries) => {
        await upsertMappings(entries);
        const nextMappings: DecodeMap = { ...currentMappings };
        for (const [source, target] of Object.entries(entries)) {
          if (target === '?') {
            delete nextMappings[source];
            continue;
          }
          nextMappings[source] = target;
        }
        currentMappings = nextMappings;
        annotation.setMappings(currentMappings);
        annotation.updateExistingRubies();
        window.getSelection()?.removeAllRanges();
      },
      decodeSelectedText,
      () => currentSearchRootUrl,
      () => currentTooltipSearchOpenInNewTab,
      () => currentOkck24HourModeEnabled
    );

    void refreshActivation(tooltip, annotation, bookmarkButton);

    const handleSelection = () => {
      if (!isActive) {
        return;
      }

      const picked = getSelectionForUnknownGlyph();
      if (!picked) {
        tooltip.hide();
        return;
      }

      tooltip.show(picked.text, picked.rect);
    };

    document.addEventListener('mouseup', (event) => {
      if (
        tooltip.contains(event.target) ||
        bookmarkButton.contains(event.target)
      ) {
        return;
      }
      window.setTimeout(handleSelection, 0);
    });

    document.addEventListener('keyup', (event) => {
      if (event.isComposing || tooltip.shouldIgnoreSelectionCheck()) {
        return;
      }
      window.setTimeout(handleSelection, 0);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') {
        return;
      }

      if (changes.decodeTable || changes.settings || changes.bookmarks) {
        void refreshActivation(tooltip, annotation, bookmarkButton);
      }
    });
  }
});
