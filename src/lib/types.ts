export type DecodeMap = Record<string, string>;

export interface BookmarkEntry {
  url: string;
  title: string;
  rootUrl: string | null;
}

export interface DecodeTable {
  mappings: DecodeMap;
  updatedAt: string | null;
}

export interface ExtensionSettings {
  enabledRootUrls: string[];
  useSourceGlyphFontInOptions: boolean;
}

export interface ExtensionState {
  table: DecodeTable;
  settings: ExtensionSettings;
  bookmarks: BookmarkEntry[];
}
