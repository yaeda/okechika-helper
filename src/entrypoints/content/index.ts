import { decodeTextWithMappings } from '@/lib/conversion';
import {
  getState,
  recordDiscoveredPage,
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
  createSidePanelButton,
  type BookmarkButtonController,
  type PageActionButtonController
} from '@/entrypoints/content/page-action-buttons';
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

async function syncPageStatus(
  bookmarkButton: BookmarkButtonController,
  sidePanelButton: PageActionButtonController,
  state?: Awaited<ReturnType<typeof getState>>
): Promise<boolean> {
  const nextState = state ?? (await getState());
  const pageUrl = await getPageUrlForMatching();
  currentSearchRootUrl = resolveMatchedRootUrl(nextState.settings, pageUrl);
  const nextIsActive = shouldRunOnUrl(nextState.settings, pageUrl);
  const discoveredEntry = nextState.discoveredPages.find(
    (page) => page.url === pageUrl
  );
  const isBookmarked = nextState.bookmarks.some(
    (bookmark) => bookmark.url === pageUrl
  );

  if (
    nextIsActive &&
    (!discoveredEntry ||
      discoveredEntry.title !== (document.title || pageUrl) ||
      discoveredEntry.rootUrl !== currentSearchRootUrl)
  ) {
    await recordDiscoveredPage({
      url: pageUrl,
      title: document.title || pageUrl,
      rootUrl: currentSearchRootUrl
    });
  }

  bookmarkButton.setBookmarked(isBookmarked);
  bookmarkButton.setVisible(nextIsActive);
  sidePanelButton.setVisible(nextIsActive);
  return nextIsActive;
}

async function refreshActivation(
  tooltip: Pick<TooltipUi, 'hide'>,
  annotation: AnnotationController,
  bookmarkButton: BookmarkButtonController,
  sidePanelButton: PageActionButtonController
): Promise<void> {
  const state = await getState();
  currentMappings = state.table.mappings;
  annotation.setMappings(currentMappings);
  currentTooltipSearchOpenInNewTab = state.settings.tooltipSearchOpenInNewTab;
  currentOkck24HourModeEnabled = state.settings.enableOkck24HourMode;
  const nextIsActive = await syncPageStatus(
    bookmarkButton,
    sidePanelButton,
    state
  );

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
    sidePanelButton.setVisible(false);
    observer?.disconnect();
    return;
  }

  annotation.annotateDocument();
  observeDomChanges(annotation, bookmarkButton, sidePanelButton);
}

function observeDomChanges(
  annotation: AnnotationController,
  bookmarkButton: BookmarkButtonController,
  sidePanelButton: PageActionButtonController
): void {
  observer?.disconnect();

  observer = new MutationObserver(() => {
    annotation.annotateDocument();
    void syncPageStatus(bookmarkButton, sidePanelButton);
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
    const sidePanelButton = createSidePanelButton(async () => {
      await chrome.runtime.sendMessage({ type: 'open-side-panel-for-tab' });
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

    void refreshActivation(
      tooltip,
      annotation,
      bookmarkButton,
      sidePanelButton
    );

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
        bookmarkButton.contains(event.target) ||
        sidePanelButton.contains(event.target)
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
        void refreshActivation(
          tooltip,
          annotation,
          bookmarkButton,
          sidePanelButton
        );
      }
    });
  }
});
