export type DecodeMap = Record<string, string>;

export interface DecodeTable {
  mappings: DecodeMap;
  updatedAt: string | null;
}

export interface ExtensionSettings {
  enabledRootUrls: string[];
}

export interface ExtensionState {
  table: DecodeTable;
  settings: ExtensionSettings;
}
