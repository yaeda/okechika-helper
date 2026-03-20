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
  highlightSelectedTextInSidePanel: boolean;
  enableOkck24HourMode: boolean;
  enableOkckResponsiveLayoutFix: boolean;
  tooltipSearchOpenInNewTab: boolean;
}

export type ConverterTab = 'glyphToText' | 'textToGlyph';

export type OptionsTableDisplayMode = 'source' | 'target' | 'both';

export interface OptionsUiState {
  showRootUrls: boolean;
  converterTab: ConverterTab;
  tableDisplayMode: OptionsTableDisplayMode;
}

export interface PopupUiState {
  showBookmarkedOnly: boolean;
}

export interface SidepanelUiState {
  discoveredPanelExpanded: boolean;
  converterPanelExpanded: boolean;
  tablePanelExpanded: boolean;
}

export interface ConversionTableHighlightState {
  sourceChars: string[];
  selectedAt: string;
}

export interface PendingExtensionUpdate {
  version: string;
  detectedAt: string;
}

export interface ExtensionState {
  table: DecodeTable;
  settings: ExtensionSettings;
  discoveredPages: DiscoveredPageEntry[];
  bookmarks: BookmarkEntry[];
}
