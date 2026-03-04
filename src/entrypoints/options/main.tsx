import React from 'react';
import { createRoot } from 'react-dom/client';

import { OptionsApp } from '@/entrypoints/options/options-app';
import '@/entrypoints/options/options.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container not found');
}

createRoot(container).render(
  <React.StrictMode>
    <OptionsApp />
  </React.StrictMode>
);
