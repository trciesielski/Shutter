import { defineConfig } from 'vite';
import { resolve } from 'node:path';
// Cloudflare Pages serves from the domain root. GitHub Pages passes --base=/Shutter/ explicitly
// (see .github/workflows/pages.yml); a CLI --base always overrides this default.
// The admin panel is a separate entry (admin/index.html) so the public bundle contains no admin code.
// It is only built for the Cloudflare web build: never for mobile, nor for GitHub Pages (SHUTTER_BUILD_ADMIN=0),
// which has no Functions to protect it.
export default defineConfig(({ mode }) => ({
  base: '/',
  build: {
    rollupOptions: {
      input: mode === 'mobile' || process.env.SHUTTER_BUILD_ADMIN === '0'
        ? { index: resolve(__dirname, 'index.html') }
        : { index: resolve(__dirname, 'index.html'), admin: resolve(__dirname, 'admin/index.html') }
    }
  }
}));
