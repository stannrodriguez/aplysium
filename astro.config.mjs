// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://stannrodriguez.github.io',
  base: '/aplysium',
  trailingSlash: 'always',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});
