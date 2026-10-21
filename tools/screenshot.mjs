// Usage: node tools/screenshot.mjs [route] [out.png]
// Needs `npm run web` (or `npx expo start --web --port 8081`) already running.
// Env: MOCK=1 mocks iTunes responses (MOCK=feeds also answers /api/feed); SEED=1 preloads a fake library (tools/seed-data.mjs); DARK=1 uses the dark colour scheme.
import { chromium } from 'playwright-core';

import { mockFeedProxy, mockItunes } from './mock-itunes.mjs';
import { seed } from './seed-data.mjs';

const route = process.argv[2] ?? '/';
const out = process.argv[3] ?? 'screenshot.png';
const base = process.env.APP_URL ?? 'http://localhost:8081';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
  colorScheme: process.env.DARK ? 'dark' : 'light',
});
if (process.env.SEED) {
  const data = seed();
  await page.addInitScript((entries) => {
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, data);
}
if (process.env.MOCK) {
  await mockItunes(page);
  // Feed requests would hang on the sandbox proxy: answer them (MOCK=feeds) or fail fast.
  if (process.env.MOCK === 'feeds') await mockFeedProxy(page);
  else await page.route('**/api/feed?**', (r) => r.fulfill({ status: 502, body: 'offline' }));
}
page.on('console', (m) => m.type() === 'error' && console.error('[browser]', m.text()));
await page.goto(base + route, { waitUntil: 'networkidle', timeout: 120000 });
// Storage hydration and the icon font load asynchronously after network idle.
await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 1500));
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out);
