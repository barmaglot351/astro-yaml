import { defineConfig } from 'astro/config';

const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4322',
  base: base.endsWith('/') ? base : `${base}/`,
  trailingSlash: 'never',
  compressHTML: true,
  server: {
    host: '127.0.0.1',
    port: 4322,
    strictPort: true,
  },
});
