import { getState, shouldRunOnHost, upsertMappings } from '@/lib/storage';
import type { DecodeMap } from '@/lib/types';
import './style.css';

const ANNOTATION_ATTR = 'data-okechika-annotated';
const ORIGINAL_TEXT_ATTR = 'data-okechika-original';
const UNKNOWN_FALLBACK = '?';

let currentMappings: DecodeMap = {};
let isActive = false;
let observer: MutationObserver | null = null;

function isUnknownGlyphElement(element: Element | null): boolean {
  if (!element) {
    return false;
  }

  const family = window.getComputedStyle(element).fontFamily;
  return family.includes('UnknownGlyphs') || family.includes('Underground');
}

function isTextNodeTarget(node: Text): boolean {
  const text = node.nodeValue ?? '';
  if (!text.trim()) {
    return false;
  }

  const parent = node.parentElement;
  if (!parent) {
    return false;
  }

  if (parent.closest(`span[${ANNOTATION_ATTR}="true"]`)) {
    return false;
  }

  if (parent.closest('#okechika-tooltip')) {
    return false;
  }

  const tagName = parent.tagName.toLowerCase();
  if (
    [
      'script',
      'style',
      'textarea',
      'input',
      'option',
      'ruby',
      'rt',
      'rb'
    ].includes(tagName)
  ) {
    return false;
  }

  return isUnknownGlyphElement(parent);
}

function createRuby(char: string, mapped: string): HTMLElement {
  const ruby = document.createElement('ruby');
  ruby.className = 'okechika-ruby';
  ruby.dataset.okechikaSource = char;

  const rt = document.createElement('rt');
  rt.textContent = mapped;

  ruby.append(document.createTextNode(char), rt);
  return ruby;
}

function isWhitespace(char: string): boolean {
  return /^\s$/.test(char);
}

function annotateTextNode(node: Text): void {
  const original = node.nodeValue ?? '';
  if (!original) {
    return;
  }

  const wrapper = document.createElement('span');
  wrapper.setAttribute(ANNOTATION_ATTR, 'true');
  wrapper.setAttribute(ORIGINAL_TEXT_ATTR, original);

  for (const char of Array.from(original)) {
    if (isWhitespace(char)) {
      wrapper.append(document.createTextNode(char));
      continue;
    }

    wrapper.append(createRuby(char, currentMappings[char] ?? UNKNOWN_FALLBACK));
  }

  node.replaceWith(wrapper);
}

function annotateDocument(): void {
  if (!isActive) {
    return;
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];

  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    const textNode = current as Text;
    if (isTextNodeTarget(textNode)) {
      targets.push(textNode);
    }
  }

  for (const node of targets) {
    annotateTextNode(node);
  }
}

function updateExistingRubies(): void {
  const rubies = document.querySelectorAll<HTMLElement>(
    'ruby.okechika-ruby[data-okechika-source]'
  );
  for (const ruby of rubies) {
    const source = ruby.dataset.okechikaSource;
    if (!source) {
      continue;
    }

    const rt = ruby.querySelector('rt');
    if (rt) {
      rt.textContent = currentMappings[source] ?? UNKNOWN_FALLBACK;
    }
  }
}

function clearAnnotations(): void {
  const wrappers = document.querySelectorAll<HTMLElement>(
    `span[${ANNOTATION_ATTR}="true"]`
  );
  for (const wrapper of wrappers) {
    const original = wrapper.getAttribute(ORIGINAL_TEXT_ATTR) ?? '';
    wrapper.replaceWith(document.createTextNode(original));
  }
}

class TooltipController {
  private container: HTMLDivElement;
  private caption: HTMLDivElement;
  private input: HTMLInputElement;
  private errorText: HTMLDivElement;
  private selectedText = '';
  private isComposing = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'okechika-tooltip';

    this.caption = document.createElement('div');
    this.caption.className = 'okechika-caption';

    const form = document.createElement('form');
    const inputCol = document.createElement('div');
    inputCol.className = 'okechika-input-col';

    this.input = document.createElement('input');
    this.input.placeholder = '対応文字を入力';
    this.errorText = document.createElement('div');
    this.errorText.className = 'okechika-error';

    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Save';

    inputCol.append(this.input, this.errorText);
    form.append(inputCol, button);
    this.container.append(this.caption, form);
    document.body.append(this.container);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await this.submit();
    });

    this.input.addEventListener('compositionstart', () => {
      this.isComposing = true;
    });
    this.input.addEventListener('compositionend', () => {
      this.isComposing = false;
    });
    this.input.addEventListener('input', () => {
      this.clearError();
    });
  }

  show(selectionText: string, rect: DOMRect): void {
    this.selectedText = selectionText;
    this.renderCaption(selectionText);
    this.input.value = '';
    this.clearError();

    this.container.style.left = `${Math.min(window.innerWidth - 240, Math.max(8, rect.left))}px`;
    this.container.style.top = `${Math.min(window.innerHeight - 80, Math.max(8, rect.bottom + 8))}px`;
    this.container.style.display = 'block';

    this.input.focus();
  }

  hide(): void {
    this.selectedText = '';
    this.isComposing = false;
    this.clearError();
    this.container.style.display = 'none';
  }

  contains(target: EventTarget | null): boolean {
    return target instanceof Node && this.container.contains(target);
  }

  shouldIgnoreSelectionCheck(): boolean {
    const activeElement = document.activeElement;
    const isFocusedInsideTooltip =
      activeElement instanceof Node && this.container.contains(activeElement);

    return isFocusedInsideTooltip || this.isComposing;
  }

  private renderCaption(selectionText: string): void {
    this.caption.replaceChildren();

    const label = document.createTextNode('Selected: ');
    const unknown = document.createElement('span');
    unknown.className = 'okechika-selected-unknown';
    unknown.textContent = selectionText;

    const normal = document.createElement('span');
    normal.className = 'okechika-selected-normal';
    normal.textContent = selectionText;

    this.caption.append(label, unknown, '（', normal, '）');
  }

  private async submit(): Promise<void> {
    if (!this.selectedText) {
      return;
    }

    const sourceChars = Array.from(this.selectedText);
    const targetChars = Array.from(this.input.value);

    if (targetChars.length !== sourceChars.length) {
      this.setError('入力文字数は選択文字数と同じにしてください');
      return;
    }

    this.clearError();

    const entries: DecodeMap = {};
    targetChars.forEach((target, index) => {
      const source = sourceChars[index];
      if (source) {
        entries[source] = target;
      }
    });

    if (Object.keys(entries).length === 0) {
      this.hide();
      return;
    }

    await upsertMappings(entries);
    currentMappings = {
      ...currentMappings,
      ...entries
    };
    updateExistingRubies();
    this.hide();
    window.getSelection()?.removeAllRanges();
  }

  private setError(message: string): void {
    this.errorText.textContent = message;
  }

  private clearError(): void {
    this.errorText.textContent = '';
  }
}

function getSelectionForUnknownGlyph(): { text: string; rect: DOMRect } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const text = selection.toString().replace(/\s+/g, '');
  if (!text) {
    return null;
  }

  const anchorParent =
    selection.anchorNode instanceof Element
      ? selection.anchorNode
      : selection.anchorNode?.parentElement;

  if (!anchorParent || !isUnknownGlyphElement(anchorParent)) {
    return null;
  }

  const range = selection.getRangeAt(0);
  return {
    text,
    rect: range.getBoundingClientRect()
  };
}

async function refreshActivation(tooltip: TooltipController): Promise<void> {
  const state = await getState();
  currentMappings = state.table.mappings;

  const nextIsActive = shouldRunOnHost(
    state.settings,
    window.location.hostname
  );

  if (nextIsActive === isActive) {
    if (isActive) {
      updateExistingRubies();
      annotateDocument();
    }
    return;
  }

  isActive = nextIsActive;

  if (!isActive) {
    tooltip.hide();
    clearAnnotations();
    if (observer) {
      observer.disconnect();
    }
    return;
  }

  annotateDocument();
  observeDomChanges();
}

function observeDomChanges(): void {
  if (observer) {
    observer.disconnect();
  }

  observer = new MutationObserver(() => {
    annotateDocument();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    const tooltip = new TooltipController();

    void refreshActivation(tooltip);

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
        void refreshActivation(tooltip);
      }
    });
  }
});
