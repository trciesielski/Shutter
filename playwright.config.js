import {defineConfig,devices} from '@playwright/test';

// E2E runs against a production build served by `wrangler pages dev` with a local (Miniflare) R2
// bucket bound as MUSIC_BUCKET, plus a mobile build served by `vite preview`. No Cloudflare account access.
const chrome=process.env.PLAYWRIGHT_CHROME_PATH;
const launchOptions={args:['--autoplay-policy=no-user-gesture-required'],...(chrome?{executablePath:chrome}:{})};

export default defineConfig({
 testDir:'e2e',
 timeout:60_000,
 workers:1,
 reporter:[['list']],
 use:{launchOptions,trace:'retain-on-failure'},
 projects:[
  {name:'web-desktop',testMatch:/web\.spec\.js/,use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900},baseURL:'http://127.0.0.1:8788'}},
  {name:'web-mobile-viewport',testMatch:/web\.spec\.js/,use:{...devices['Pixel 7'],baseURL:'http://127.0.0.1:8788'}},
  {name:'mobile-build',testMatch:/mobile\.spec\.js/,use:{...devices['Pixel 7'],baseURL:'http://127.0.0.1:4174'}}
 ],
 webServer:[
  {command:'npm run build && rm -rf .wrangler/e2e && node e2e/seed-r2.mjs .wrangler/e2e && npx wrangler pages dev dist --r2 MUSIC_BUCKET --persist-to .wrangler/e2e --ip 127.0.0.1 --port 8788',url:'http://127.0.0.1:8788/music/catalog/catalog.json',timeout:180_000,reuseExistingServer:!process.env.CI},
  {command:'npm run build:mobile && npx vite preview --outDir dist-mobile --host 127.0.0.1 --port 4174 --strictPort',url:'http://127.0.0.1:4174/',timeout:180_000,reuseExistingServer:!process.env.CI}
 ]
});
