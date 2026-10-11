#!/usr/bin/env node
// Browser smoke test: opens the deck, plays the first run to its end, clicks an agent and a file, and checks that the
// page raised no errors. Needs Playwright (PLAYWRIGHT_MODULE=<dir containing playwright>, or installed next to this).
//   node tools/smoke.mjs [outDir]   (the server must run: npm start, or URL=…)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(process.env.PLAYWRIGHT_MODULE ? process.env.PLAYWRIGHT_MODULE.replace(/\/?$/, '/') : import.meta.url);
const { chromium } = require('playwright');
const base = process.env.URL || 'http://127.0.0.1:4777';
const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_CERT|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
await page.goto(base + '/?run=swarm-refaktor', { waitUntil: 'load' });
await page.waitForSelector('.agent', { timeout: 20000 }).catch(() => errors.push('roster never filled'));
await page.evaluate(() => document.querySelector('[data-act="speed"][data-v="4"]').click());
await page.click('[data-act="play"]');
await page.waitForTimeout(6000);
if (out) await page.screenshot({ path: out + '/mid.png' });
await page.click('.agent[data-id="worker-a"]');
await page.waitForTimeout(400);
const inspector = await page.textContent('.pane');
if (!/Programista A/.test(inspector)) errors.push('inspector did not show the agent');
await page.click('[data-act="tab"][data-v="files"]');
const row = page.locator('tr[data-act="file"]').first();
if (await row.count()) await row.click(); else errors.push('no file rows');
await page.waitForTimeout(300);
if (!/historia|plik/.test(await page.textContent('.pane'))) errors.push('inspector did not show the file');
await page.evaluate(() => { document.querySelector('input[data-act="seek"]').value = '45'; document.querySelector('input[data-act="seek"]').dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(500);
if (out) await page.screenshot({ path: out + '/end.png' });
const clockText = await page.textContent('.clock');
console.log('clock at end:', clockText.replace(/\s+/g, ' '));
console.log(errors.length ? 'ERRORS:\n  ' + errors.join('\n  ') : 'smoke ok: no page errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
