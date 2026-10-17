// Usage: node tools/screenshot.mjs [route] [out.png]
// Needs `npm run web` (or `npx expo start --web --port 8081`) already running.
import { chromium } from 'playwright-core';

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
});
page.on('console', (m) => m.type() === 'error' && console.error('[browser]', m.text()));
await page.goto(base + route, { waitUntil: 'networkidle', timeout: 120000 });
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out);
