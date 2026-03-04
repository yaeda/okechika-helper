import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: {
    name: 'Okechika Helper',
    description: 'Helper extension for decoding OKECHIKA glyphs.',
    permissions: ['storage'],
    host_permissions: ['<all_urls>']
  },
   webExt: {
    startUrls: [
      "https://www.qtes9gu0k.xyz",
      "https://www.pub-riddle.com/class-1/",
    ],
  },
});
