import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import {
  ActionAccordionSection,
  ActionPanel,
  ActionSurface
} from '@/components/action-panel';
import { ConverterPanel } from '@/components/converter-panel';
import { ConversionTablePanel } from '@/components/conversion-table-panel';
import { UpdateAvailableBanner } from '@/components/update-available-banner';
import { OKECHIKA_CHARS } from '@/lib/okechika-chars';
import {
  getConversionTableHighlightState,
  DEFAULT_OPTIONS_UI_STATE,
  DEFAULT_SIDEPANEL_UI_STATE,
  DEFAULT_SETTINGS,
  DEFAULT_TABLE,
  getOptionsUiState,
  getSidepanelUiState,
  getState,
  setOptionsUiState,
  setSidepanelUiState,
  setSettings
} from '@/lib/storage';
import type {
  ConversionTableHighlightState,
  DecodeTable,
  ExtensionSettings,
  OptionsUiState,
  SidepanelUiState
} from '@/lib/types';
import '@/entrypoints/sidepanel/sidepanel.css';

function SidepanelApp() {
  const [settings, setLocalSettings] =
    useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [table, setTable] = useState<DecodeTable>(DEFAULT_TABLE);
  const [optionsUiState, setLocalOptionsUiState] = useState<OptionsUiState>(
    DEFAULT_OPTIONS_UI_STATE
  );
  const [tableHighlightState, setTableHighlightState] =
    useState<ConversionTableHighlightState | null>(null);
  const [isDiscoveredPanelExpanded, setIsDiscoveredPanelExpanded] = useState(
    DEFAULT_SIDEPANEL_UI_STATE.discoveredPanelExpanded
  );
  const [isConverterPanelExpanded, setIsConverterPanelExpanded] = useState(
    DEFAULT_SIDEPANEL_UI_STATE.converterPanelExpanded
  );
  const [isTablePanelExpanded, setIsTablePanelExpanded] = useState(
    DEFAULT_SIDEPANEL_UI_STATE.tablePanelExpanded
  );
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function loadPanelState(): Promise<void> {
      const [state, nextOptionsUiState] = await Promise.all([
        getState(),
        getOptionsUiState()
      ]);
      setTable(state.table);
      setLocalSettings(state.settings);
      setLocalOptionsUiState(nextOptionsUiState);
    }

    async function loadSidepanelUiState(): Promise<void> {
      const nextSidepanelUiState = await getSidepanelUiState();
      applySidepanelUiState(nextSidepanelUiState);
    }

    async function loadHighlightState(): Promise<void> {
      const nextHighlightState = await getConversionTableHighlightState();
      setTableHighlightState(nextHighlightState);
    }

    async function load(): Promise<void> {
      await Promise.all([
        loadPanelState(),
        loadSidepanelUiState(),
        loadHighlightState()
      ]);
      setIsReady(true);
    }

    void load();

    const handler: Parameters<
      typeof chrome.storage.onChanged.addListener
    >[0] = (changes, areaName) => {
      if (areaName === 'sync' && (changes.decodeTable || changes.settings)) {
        void loadPanelState();
        return;
      }

      if (areaName !== 'local') {
        return;
      }

      if (changes.optionsUiState) {
        void loadPanelState();
      }

      if (changes.sidepanelUiState) {
        void loadSidepanelUiState();
      }

      if (changes.conversionTableHighlightState) {
        void loadHighlightState();
      }
    };

    chrome.storage.onChanged.addListener(handler);
    return () => {
      chrome.storage.onChanged.removeListener(handler);
    };
  }, []);

  function applySidepanelUiState(nextUiState: SidepanelUiState): void {
    setIsDiscoveredPanelExpanded(nextUiState.discoveredPanelExpanded);
    setIsConverterPanelExpanded(nextUiState.converterPanelExpanded);
    setIsTablePanelExpanded(nextUiState.tablePanelExpanded);
  }

  function saveSidepanelUiState(nextUiState: SidepanelUiState): void {
    applySidepanelUiState(nextUiState);
    void setSidepanelUiState(nextUiState);
  }

  async function handleToggleSourceGlyphFont(checked: boolean): Promise<void> {
    const nextSettings = {
      ...settings,
      useSourceGlyphFontInOptions: checked
    };
    setLocalSettings(nextSettings);
    await setSettings(nextSettings);
  }

  async function handleToggleSelectionHighlight(
    checked: boolean
  ): Promise<void> {
    const nextSettings = {
      ...settings,
      highlightSelectedTextInSidePanel: checked
    };
    setLocalSettings(nextSettings);
    await setSettings(nextSettings);
  }

  function handleSelectTableDisplayMode(
    nextMode: OptionsUiState['tableDisplayMode']
  ): void {
    const nextUiState = {
      ...optionsUiState,
      tableDisplayMode: nextMode
    };
    setLocalOptionsUiState(nextUiState);
    void setOptionsUiState(nextUiState);
  }

  const tableProgressText = useMemo(() => {
    const decoded = OKECHIKA_CHARS.reduce((count, source) => {
      const target = table.mappings[source];
      return target && target !== '?' ? count + 1 : count;
    }, 0);

    return `${decoded}/${OKECHIKA_CHARS.length}`;
  }, [table]);

  if (!isReady) {
    return null;
  }

  return (
    <ActionSurface mode="sidepanel" notice={<UpdateAvailableBanner />}>
      <ActionPanel
        mode="sidepanel"
        expanded={isDiscoveredPanelExpanded}
        onToggle={() => {
          saveSidepanelUiState({
            discoveredPanelExpanded: !isDiscoveredPanelExpanded,
            converterPanelExpanded: isConverterPanelExpanded,
            tablePanelExpanded: isTablePanelExpanded
          });
        }}
      />

      <ActionAccordionSection
        title="相互変換"
        expanded={isConverterPanelExpanded}
        onToggle={() => {
          saveSidepanelUiState({
            discoveredPanelExpanded: isDiscoveredPanelExpanded,
            converterPanelExpanded: !isConverterPanelExpanded,
            tablePanelExpanded: isTablePanelExpanded
          });
        }}
      >
        <p className="action-panel-caption">
          桶地下文字から日本語、日本語から桶地下文字へ変換できます。日本語→桶地下は候補から選択できます。
        </p>
        <div className="action-panel-body">
          <ConverterPanel
            mappings={table.mappings}
            enableOkck24HourMode={settings.enableOkck24HourMode}
          />
        </div>
      </ActionAccordionSection>

      <ActionAccordionSection
        title="変換テーブル"
        meta={tableProgressText}
        expanded={isTablePanelExpanded}
        onToggle={() => {
          saveSidepanelUiState({
            discoveredPanelExpanded: isDiscoveredPanelExpanded,
            converterPanelExpanded: isConverterPanelExpanded,
            tablePanelExpanded: !isTablePanelExpanded
          });
        }}
      >
        <div className="action-panel-body">
          <ConversionTablePanel
            table={table}
            useSourceGlyphFont={settings.useSourceGlyphFontInOptions}
            onToggleSourceGlyphFont={(checked) => {
              void handleToggleSourceGlyphFont(checked);
            }}
            highlightSelectedText={settings.highlightSelectedTextInSidePanel}
            onToggleHighlightSelectedText={(checked) => {
              void handleToggleSelectionHighlight(checked);
            }}
            displayMode={optionsUiState.tableDisplayMode}
            onDisplayModeChange={handleSelectTableDisplayMode}
            highlightedSources={tableHighlightState?.sourceChars}
            highlightRequestId={tableHighlightState?.selectedAt ?? null}
            isVisible={isTablePanelExpanded}
          />
        </div>
      </ActionAccordionSection>
    </ActionSurface>
  );
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container not found');
}

createRoot(container).render(
  <React.StrictMode>
    <SidepanelApp />
  </React.StrictMode>
);
