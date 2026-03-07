import { OKECHIKA_CHARS } from '@/lib/okechika-chars';
import type { DecodeMap } from '@/lib/types';

const glyphCharSet = new Set(OKECHIKA_CHARS);

export function containsKnownGlyphChars(text: string): boolean {
  return Array.from(text).some((char) => glyphCharSet.has(char));
}

export function decodeTextWithMappings(
  text: string,
  mappings: DecodeMap
): string {
  return Array.from(text)
    .map((char) => {
      if (!glyphCharSet.has(char)) {
        return char;
      }

      return mappings[char] ?? '?';
    })
    .join('');
}
