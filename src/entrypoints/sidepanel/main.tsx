import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import {
  ActionAccordionSection,
  ActionPanel,
  ActionSurface
} from '@/components/action-panel';
import { ConverterPanel } from '@/components/converter-panel';
import { DEFAULT_SETTINGS, getState } from '@/lib/storage';
import type { DecodeMap } from '@/lib/types';
import '@/entrypoints/sidepanel/sidepanel.css';

function SidepanelApp() {
  const [mappings, setMappings] = useState<DecodeMap>({});
  const [enableOkck24HourMode, setEnableOkck24HourMode] = useState(
    DEFAULT_SETTINGS.enableOkck24HourMode
  );
  const [isDiscoveredPanelExpanded, setIsDiscoveredPanelExpanded] =
    useState(true);
  const [isConverterPanelExpanded, setIsConverterPanelExpanded] =
    useState(true);

  useEffect(() => {
    async function load(): Promise<void> {
      const state = await getState();
      setMappings(state.table.mappings);
      setEnableOkck24HourMode(state.settings.enableOkck24HourMode);
    }

    void load();

    const handler: Parameters<
      typeof chrome.storage.onChanged.addListener
    >[0] = (changes, areaName) => {
      if (areaName !== 'sync') {
        return;
      }

      if (changes.decodeTable || changes.settings) {
        void load();
      }
    };

    chrome.storage.onChanged.addListener(handler);
    return () => {
      chrome.storage.onChanged.removeListener(handler);
    };
  }, []);

  return (
    <ActionSurface mode="sidepanel">
      <ActionPanel
        mode="sidepanel"
        expanded={isDiscoveredPanelExpanded}
        onToggle={() => {
          setIsDiscoveredPanelExpanded((prev) => !prev);
        }}
      />

      <ActionAccordionSection
        title="相互変換"
        expanded={isConverterPanelExpanded}
        onToggle={() => {
          setIsConverterPanelExpanded((prev) => !prev);
        }}
      >
        <p className="action-panel-caption">
          桶地下文字から日本語、日本語から桶地下文字へ変換できます。日本語→桶地下は候補から選択できます。
        </p>
        <div className="action-panel-body">
          <ConverterPanel
            mappings={mappings}
            enableOkck24HourMode={enableOkck24HourMode}
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
