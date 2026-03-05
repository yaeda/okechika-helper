import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: {
    name: 'Okechika Helper',
    description: 'Helper extension for decoding OKECHIKA glyphs.',
    permissions: ['storage', 'scripting'],
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
