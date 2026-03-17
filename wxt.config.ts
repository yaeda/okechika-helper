import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  srcDir: 'src',
  manifest: {
    name: '桶地下 Helper',
    description: '桶地下文字の解読作業を支援するためのブラウザ拡張です。',
    action: {
      default_title: '桶地下 Helper',
      default_popup: 'popup.html'
    },
    permissions: ['favicon', 'storage', 'scripting'],
    host_permissions: [
      'https://www.pub-riddle.com/*',
      'https://pub-riddle.com/*',
      'https://www.qtes9gu0k.xyz/*',
      'https://qtes9gu0k.xyz/*'
    ],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    options_page: 'options.html'
  },
  webExt: {
    startUrls: [
      'https://www.qtes9gu0k.xyz',
      'https://www.pub-riddle.com/class-1/'
    ]
  }
});
