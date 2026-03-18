import React from 'react';
import { createRoot } from 'react-dom/client';

import { ActionPanel } from '@/components/action-panel';
import '@/entrypoints/sidepanel/sidepanel.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container not found');
}

createRoot(container).render(
  <React.StrictMode>
    <ActionPanel mode="sidepanel" />
  </React.StrictMode>
);
