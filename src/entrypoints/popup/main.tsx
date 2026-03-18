import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { ActionPanel, ActionSurface } from '@/components/action-panel';
import '@/entrypoints/popup/popup.css';

function PopupApp() {
  const [isDiscoveredPanelExpanded, setIsDiscoveredPanelExpanded] =
    useState(true);

  return (
    <ActionSurface>
      <ActionPanel
        expanded={isDiscoveredPanelExpanded}
        onToggle={() => {
          setIsDiscoveredPanelExpanded((prev) => !prev);
        }}
      />
    </ActionSurface>
  );
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container not found');
}

createRoot(container).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>
);
