export type DecodeMap = Record<string, string>;

export interface SavedPageEntry {
  url: string;
  title: string;
  rootUrl: string | null;
}

export type DiscoveredPageEntry = SavedPageEntry;

export type BookmarkEntry = SavedPageEntry;

export interface DecodeTable {
  mappings: DecodeMap;
  updatedAt: string | null;
}

export interface ExtensionSettings {
  enabledRootUrls: string[];
  useSourceGlyphFontInOptions: boolean;
  enableOkck24HourMode: boolean;
  tooltipSearchOpenInNewTab: boolean;
}

export type OptionsConverterTab = 'glyphToText' | 'textToGlyph';

export type OptionsTableDisplayMode = 'source' | 'target' | 'both';

export interface OptionsUiState {
  showRootUrls: boolean;
  converterTab: OptionsConverterTab;
  tableDisplayMode: OptionsTableDisplayMode;
}

export interface PopupUiState {
  showBookmarkedOnly: boolean;
}

export interface ExtensionState {
  table: DecodeTable;
  settings: ExtensionSettings;
  discoveredPages: DiscoveredPageEntry[];
  bookmarks: BookmarkEntry[];
}
