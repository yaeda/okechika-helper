export interface SelectedGlyphRange {
  text: string;
  rect: DOMRect;
}

export function isTranslatableGlyphChar(char: string): boolean {
  if (/^\s$/u.test(char)) {
    return false;
  }

  // Exclude punctuation/symbol-like marks from translation targets.
  if (/\p{P}/u.test(char)) {
    return false;
  }

  return true;
}

export function filterTranslatableGlyphChars(text: string): string[] {
  return Array.from(text).filter(isTranslatableGlyphChar);
}

export function isUnknownGlyphElement(element: Element | null): boolean {
  if (!element) {
    return false;
  }

  const family = window.getComputedStyle(element).fontFamily;
  return family.includes('UnknownGlyphs') || family.includes('Underground');
}

export function findGlyphFontElement(element: Element | null): Element | null {
  return isUnknownGlyphElement(element) ? element : null;
}

export function getSelectionForUnknownGlyph(): SelectedGlyphRange | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const text = selection.toString().replace(/\s+/g, '');
  if (!text) {
    return null;
  }

  if (filterTranslatableGlyphChars(text).length === 0) {
    return null;
  }

  const anchorParent =
    selection.anchorNode instanceof Element
      ? selection.anchorNode
      : (selection.anchorNode?.parentElement ?? null);

  const focusParent =
    selection.focusNode instanceof Element
      ? selection.focusNode
      : (selection.focusNode?.parentElement ?? null);

  const range = selection.getRangeAt(0);
  const commonParent =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

  if (
    !findGlyphFontElement(anchorParent) &&
    !findGlyphFontElement(focusParent) &&
    !findGlyphFontElement(commonParent)
  ) {
    return null;
  }

  return {
    text,
    rect: range.getBoundingClientRect()
  };
}
