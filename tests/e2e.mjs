// Drives the page in headless Chromium against the live data host.
//
// The builder is the part worth driving rather than unit testing: what it
// saves has to reach the worker, come back as numbers, survive a reload and
// be undone again. The cross sections themselves are checked by moving one
// slider of the physics, the Li6 fraction, and asserting the total goes up.
//
// Usage: python3 -m http.server 8000 & node tests/e2e.mjs [--url http://127.0.0.1:8000/]

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const urlIndex = args.indexOf('--url');
const url = urlIndex >= 0 ? args[urlIndex + 1] : 'http://127.0.0.1:8000/';
const SHOTS = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const step = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok' : 'FAIL'} - ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
};
const plotted = (n) => page.waitForFunction((want) => document.getElementById('plot')?.data?.length === want, n, { timeout: 120000 });
const trace0 = () => page.evaluate(() => ({ name: document.getElementById('plot').data[0].name, y0: document.getElementById('plot').data[0].y[0] }));

async function fillComponent(index, name, fraction) {
  const row = page.locator('#component-rows tr').nth(index);
  await row.locator('.component-name').fill(name);
  await row.locator('.component-fraction').fill(String(fraction));
}

await page.goto(`${url}index.html`, { waitUntil: 'load' });
await page.evaluate(() => window.localStorage.clear());
await page.goto(`${url}index.html`, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('.reaction-select')?.options.length > 2, null, { timeout: 120000 });
step('the page opens on a built-in material', (await page.textContent('.material-select option:checked')) === 'Pure Li-6');

await page.click('#new-material-btn');
step('the builder opens with one component',
  (await page.locator('#component-rows tr').count()) === 1);
await page.fill('#builder-name', 'Enriched lithium');
await fillComponent(0, 'Li6', 0.6);
await page.click('#add-component-btn');
await fillComponent(1, 'Li7', 0.4);
await page.fill('#builder-density', '0.534');
await page.click('#builder-save');
await page.waitForFunction(() => document.querySelectorAll('.custom-chip').length === 1, null, { timeout: 15000 });
step('a saved material joins the list', (await page.textContent('.custom-chip span')) === 'Enriched lithium');

const groups = await page.evaluate(() => [...document.querySelector('.material-select').querySelectorAll('optgroup')].map((g) => g.label));
step('it is offered above the built-in materials', groups.join(',') === 'Your materials,Built in', groups.join(','));

await page.selectOption('.material-select', 'c1');
await page.waitForFunction(() => document.querySelector('.reaction-select')?.options.length > 2, null, { timeout: 120000 });
await page.selectOption('.reaction-select', '1');
await plotted(1);
const first = await trace0();
step('it plots like any other material', first.name.startsWith('Enriched lithium'), JSON.stringify(first));

await page.waitForTimeout(500);
const hash = await page.evaluate(() => location.hash);
step('the link carries the plot and the composition', hash.includes('r=endf-b8.1:c1:1') && hash.includes('&m='), `${hash.slice(0, 60)}...`);

await page.goto(`${url}index.html${hash}`, { waitUntil: 'load' });
await plotted(1);
const restored = await page.evaluate(() => ({ chips: document.querySelectorAll('.custom-chip').length, ...{ name: document.getElementById('plot').data[0].name, y0: document.getElementById('plot').data[0].y[0] } }));
step('opening the link restores it without duplicating it',
  restored.chips === 1 && restored.name === first.name && restored.y0 === first.y0, JSON.stringify(restored));

await page.click('.custom-chip button[data-edit]');
await fillComponent(0, 'Li6', 0.95);
await fillComponent(1, 'Li7', 0.05);
await page.click('#builder-save');
await page.waitForFunction((old) => document.getElementById('plot')?.data?.[0]?.y[0] !== old, first.y0, { timeout: 120000 });
const edited = (await trace0()).y0;
step('editing recomputes the cross section', edited > first.y0,
  `${first.y0.toPrecision(5)} then ${edited.toPrecision(5)} per cm at 1e-5 eV, more Li6 absorbs more`);
await page.screenshot({ path: `${SHOTS}custom-material.png` });

await page.click('#new-material-btn');
await page.fill('#builder-name', '');
await fillComponent(0, 'Zz', 1);
await page.click('#builder-save');
await page.waitForSelector('#builder-errors:not([hidden])', { timeout: 15000 });
const reasons = await page.evaluate(() => [...document.querySelectorAll('#builder-errors li')].map((li) => li.textContent));
step('a bad composition is refused with reasons', reasons.length >= 2 && reasons.some((r) => r.includes('Zz')), reasons.join(' | '));
await page.click('#builder-cancel');

await page.click('.custom-chip button[data-remove]');
await page.waitForFunction(() => document.querySelectorAll('.custom-chip').length === 0, null, { timeout: 15000 });
step('removing it puts the row back on a built-in material',
  (await page.evaluate(() => document.querySelector('.material-select').value)) === 'pure_li6');

step('no console errors', errors.length === 0, errors.join(' | '));
await browser.close();
if (process.exitCode) process.exit(process.exitCode);
