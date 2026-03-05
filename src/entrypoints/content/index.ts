import { getState, shouldRunOnHost, upsertMappings } from '@/lib/storage';
import type { DecodeMap } from '@/lib/types';
import {
  createAnnotationController,
  type AnnotationController
} from '@/entrypoints/content/annotation';
import { getSelectionForUnknownGlyph, isTranslatableGlyphChar } from '@/entrypoints/content/glyph';
import { getHostForMatching } from '@/entrypoints/content/host';
import { createTooltipUi, type TooltipUi } from '@/entrypoints/content/tooltip-ui';
import './style.css';

let currentMappings: DecodeMap = {};
let isActive = false;
let observer: MutationObserver | null = null;

function decodeSelectedText(text: string): string {
  return Array.from(text)
    .map((char) => {
      if (!isTranslatableGlyphChar(char)) {
        return char;
      }

      return currentMappings[char] ?? '?';
    })
    .join('');
}

async function refreshActivation(
  tooltip: Pick<TooltipUi, 'hide'>,
  annotation: AnnotationController
): Promise<void> {
  const state = await getState();
  currentMappings = state.table.mappings;
  annotation.setMappings(currentMappings);

  const nextIsActive = shouldRunOnHost(state.settings, await getHostForMatching());

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
    observer?.disconnect();
    return;
  }

  annotation.annotateDocument();
  observeDomChanges(annotation);
}

function observeDomChanges(annotation: AnnotationController): void {
  observer?.disconnect();

  observer = new MutationObserver(() => {
    annotation.annotateDocument();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  matchAboutBlank: true,
  matchOriginAsFallback: true,
  runAt: 'document_idle',
  main(ctx) {
    const annotation = createAnnotationController();

    const tooltip = createTooltipUi(
      ctx,
      async (entries) => {
        await upsertMappings(entries);
        currentMappings = {
          ...currentMappings,
          ...entries
        };
        annotation.setMappings(currentMappings);
        annotation.updateExistingRubies();
        window.getSelection()?.removeAllRanges();
      },
      decodeSelectedText
    );

    void refreshActivation(tooltip, annotation);

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
      if (tooltip.contains(event.target)) {
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

      if (changes.decodeTable || changes.settings) {
        void refreshActivation(tooltip, annotation);
      }
    });
  }
});
