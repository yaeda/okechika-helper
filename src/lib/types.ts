export type DecodeMap = Record<string, string>;

export interface DecodeTable {
  mappings: DecodeMap;
  updatedAt: string | null;
}

export interface ExtensionSettings {
  enabledDomains: string[];
}

export interface ExtensionState {
  table: DecodeTable;
  settings: ExtensionSettings;
}
