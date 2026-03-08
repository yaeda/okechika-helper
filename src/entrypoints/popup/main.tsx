import React from 'react';
import { createRoot } from 'react-dom/client';

import { PopupApp } from '@/entrypoints/popup/popup-app';
import '@/entrypoints/popup/popup.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container not found');
}

createRoot(container).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>
);
