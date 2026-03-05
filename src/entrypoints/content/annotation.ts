import type { DecodeMap } from '@/lib/types';
import { isTranslatableGlyphChar, isUnknownGlyphElement } from '@/entrypoints/content/glyph';

const ANNOTATION_ATTR = 'data-okechika-annotated';
const ORIGINAL_TEXT_ATTR = 'data-okechika-original';
const UNKNOWN_FALLBACK = '?';

export interface AnnotationController {
  setMappings: (mappings: DecodeMap) => void;
  annotateDocument: () => void;
  updateExistingRubies: () => void;
  clearAnnotations: () => void;
}

export function createAnnotationController(): AnnotationController {
  let mappings: DecodeMap = {};

  function isTextNodeTarget(node: Text): boolean {
    const text = node.nodeValue ?? '';
    if (!text.trim()) {
      return false;
    }

    const parent = node.parentElement;
    if (!parent || !(parent instanceof HTMLElement)) {
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
      ['script', 'style', 'textarea', 'input', 'option', 'ruby', 'rt', 'rb'].includes(tagName)
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

  function annotateTextNode(node: Text): void {
    const original = node.nodeValue ?? '';
    if (!original) {
      return;
    }

    const wrapper = document.createElement('span');
    wrapper.setAttribute(ANNOTATION_ATTR, 'true');
    wrapper.setAttribute(ORIGINAL_TEXT_ATTR, original);

    for (const char of Array.from(original)) {
      if (!isTranslatableGlyphChar(char)) {
        wrapper.append(document.createTextNode(char));
        continue;
      }

      wrapper.append(createRuby(char, mappings[char] ?? UNKNOWN_FALLBACK));
    }

    node.replaceWith(wrapper);
  }

  function annotateDocument(): void {
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
        rt.textContent = mappings[source] ?? UNKNOWN_FALLBACK;
      }
    }
  }

  function clearAnnotations(): void {
    const wrappers = document.querySelectorAll<HTMLElement>(`span[${ANNOTATION_ATTR}="true"]`);
    for (const wrapper of wrappers) {
      const original = wrapper.getAttribute(ORIGINAL_TEXT_ATTR) ?? '';
      wrapper.replaceWith(document.createTextNode(original));
    }
  }

  return {
    setMappings(nextMappings) {
      mappings = nextMappings;
    },
    annotateDocument,
    updateExistingRubies,
    clearAnnotations
  };
}
