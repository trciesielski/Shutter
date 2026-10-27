import { defineConfig } from 'vite';
// Cloudflare Pages serves from the domain root. GitHub Pages passes --base=/Shutter/ explicitly
// (see .github/workflows/pages.yml); a CLI --base always overrides this default.
export default defineConfig({ base: '/' });
