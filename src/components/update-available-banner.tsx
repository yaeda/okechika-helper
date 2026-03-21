import { useEffect, useState } from 'react';

import '@/components/update-available-banner.css';
import { getPendingExtensionUpdate } from '@/lib/storage';
import type { PendingExtensionUpdate } from '@/lib/types';

export function UpdateAvailableBanner() {
  const [pendingExtensionUpdate, setPendingExtensionUpdate] =
    useState<PendingExtensionUpdate | null>(null);

  useEffect(() => {
    async function load(): Promise<void> {
      setPendingExtensionUpdate(await getPendingExtensionUpdate());
    }

    void load();

    const handler: Parameters<
      typeof chrome.storage.onChanged.addListener
    >[0] = (changes) => {
      if (changes.pendingExtensionUpdate) {
        void load();
      }
    };

    chrome.storage.onChanged.addListener(handler);
    return () => {
      chrome.storage.onChanged.removeListener(handler);
    };
  }, []);

  async function handleApplyUpdate(): Promise<void> {
    await chrome.runtime.sendMessage({ type: 'prepare-extension-reload' });
    chrome.runtime.reload();
  }

  if (!pendingExtensionUpdate) {
    return null;
  }

  return (
    <div className="update-available-banner">
      <p className="update-available-note">
        新しいバージョン v{pendingExtensionUpdate.version} を適用できます。
      </p>
      <div className="update-available-actions">
        <button
          type="button"
          className="update-available-button"
          onClick={() => {
            void handleApplyUpdate();
          }}
        >
          更新する
        </button>
        <p className="update-available-help">
          実行すると拡張が再起動し、設定画面やサイドパネルは閉じられます。
        </p>
      </div>
    </div>
  );
}
