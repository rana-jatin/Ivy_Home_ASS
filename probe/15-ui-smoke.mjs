// Drive the real app in a real browser: log in, wait for the pull, walk every
// screen, and fail on any console error or unhandled rejection.
// Uses the Playwright chromium already on this machine.
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, E } from './lib.mjs';

const { chromium } = await import('playwright');
const BASE = process.env.UI_BASE ?? 'http://127.0.0.1:5199';
const shots = join(ROOT, 'data/raw/screens');
mkdirSync(shots, { recursive: true });

// Use whichever real browser this machine already has rather than downloading
// one; the app is plain React and does not care which engine renders it.
const CANDIDATES = [
  process.env.UI_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);
const { existsSync } = await import('node:fs');
const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) throw new Error('no Chrome or Edge found; set UI_BROWSER');
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1380, height: 1000 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const step = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
};
const shot = (n) => page.screenshot({ path: join(shots, `${n}.png`), fullPage: false });
// The app keeps the pull in IndexedDB, so after the first sign-in a navigation
// makes no network requests to wait on - wait for the dataset itself instead.
const settle = () => page.waitForSelector('.shell[data-dataset="ready"]', { timeout: 90000 });

// --- login screen ---
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('form.login', { timeout: 15000 });
step('login screen renders', await page.isVisible('form.login'));
await shot('01-login');

// --- sign in ---
await page.selectOption('#email', 'demo1@ivy.homes');
await page.fill('#password', E.IVY_PASSWORD);
await page.click('button[type=submit]');

// the pull is ~123 requests; give it room
await page.waitForSelector('header.top', { timeout: 30000 });
step('signed in, app chrome visible', await page.isVisible('header.top'));
await page.waitForSelector('.listing', { timeout: 90000 });
const sub = await page.textContent('main .sub');
step('browse screen loaded with the full snapshot', /4,100/.test(sub ?? ''), (sub ?? '').slice(0, 90));
await shot('02-browse');

const cardCount = await page.locator('.listing').count();
step('listing cards rendered', cardCount > 0, `${cardCount} cards`);

// --- filters actually filter ---
const before = await page.textContent('main > p.muted');
await page.selectOption('#f-loc', 'velachery');
await page.selectOption('#f-bed', '2');
await page.waitForTimeout(400);
const after = await page.textContent('main > p.muted');
step('locality + bedroom filter changes the result count', before !== after, `${(before ?? '').trim()} -> ${(after ?? '').trim()}`);

// the filter the server ignores. The inputs take lakh: 60 is ₹60,00,000.
await page.fill('#f-max', '60');
await page.waitForTimeout(400);
const priced = await page.textContent('main > p.muted');
step('max price filters (the server ignores this one)', priced !== after, (priced ?? '').trim());
const prices = await page.locator('.listing .price').allTextContents();
step('every card is under the cap', prices.length > 0 && prices.every((t) => {
  const m = t.match(/₹([\d.]+)\s*(Cr|L)/);
  if (!m) return true;
  const v = Number(m[1]) * (m[2] === 'Cr' ? 1e7 : 1e5);
  return v <= 6_000_000;
}), `${prices.length} cards checked`);
await shot('03-filtered');

// --- detail page by URL ---
const listings = JSON.parse(readFileSync(join(ROOT, 'data/listings.json'), 'utf8'));
const dupId = JSON.parse(readFileSync(join(ROOT, 'analysis/out-duplicates.json'), 'utf8')).clusters[0][0];
await page.goto(`${BASE}/listings/${encodeURIComponent(dupId)}`, { waitUntil: 'networkidle' });
await settle();
await page.waitForSelector('.dl', { timeout: 20000 });
const detailTitle = (await page.textContent('h1')) ?? '';
step('detail page reachable by URL alone', detailTitle.length > 0, `${dupId} -> ${detailTitle}`);
step('duplicate panel shown', await page.isVisible('text=Same property, listed'));
await shot('04-detail');

// a corrupt one, to check the badge path
const corruptId = JSON.parse(readFileSync(join(ROOT, 'analysis/out-corrupt.json'), 'utf8')).ids[0];
await page.goto(`${BASE}/listings/${encodeURIComponent(corruptId)}`, { waitUntil: 'networkidle' });
await settle();
await page.waitForSelector('.note.bad', { timeout: 20000 });
step('impossible record is called out on its page', await page.isVisible('.note.bad'), corruptId);
await shot('05-corrupt');

// --- saved round trip through the UI ---
// Saved lists live on the server and survive between runs, so clear it first;
// otherwise the toggle below removes rather than adds.
await page.goto(`${BASE}/saved`, { waitUntil: 'networkidle' });
await settle();
await page.waitForSelector('main[data-saved="ready"]', { timeout: 30000 });
for (;;) {
  const star = page.locator('.listing button:has-text("★")').first();
  if (!(await star.count())) break;
  await star.click();
  await page.waitForTimeout(700);
}
step('saved list starts empty', (await page.locator('.listing').count()) === 0);

await page.goto(`${BASE}/listings/${encodeURIComponent(listings[0].listing_id)}`, { waitUntil: 'networkidle' });
await settle();
await page.waitForSelector('button:has-text("Save")', { timeout: 20000 });
await page.click('button:has-text("Save")');
await page.waitForTimeout(900);
step('the button flips to saved', await page.isVisible('button:has-text("★ Saved")'));
await page.goto(`${BASE}/saved`, { waitUntil: 'networkidle' });
await settle();
await page.waitForSelector('main[data-saved="ready"]', { timeout: 30000 });
const savedCards = await page.locator('.listing').count();
step('saved listing appears on the saved screen', savedCards === 1, `${savedCards}`);
await shot('06-saved');

// --- survives a reload (the session requirement) ---
const reloadStarted = Date.now();
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('header.top', { timeout: 30000 });
step('session survives a page refresh', await page.isVisible('header.top'));
await settle();
step('a reload opens the stored copy instead of re-pulling', Date.now() - reloadStarted < 5000, `${Date.now() - reloadStarted} ms`);

// --- rentals, projects, insights ---
await page.goto(`${BASE}/rentals`, { waitUntil: 'networkidle' });
await settle();
await page.waitForSelector('table tbody tr', { timeout: 30000 });
step('rentals table renders', (await page.locator('table tbody tr').count()) > 0);
step('a deposit correction is shown', await page.isVisible('text=served as'));
await shot('07-rentals');

await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
await settle();
await page.waitForSelector('table tbody tr', { timeout: 30000 });
const projText = await page.textContent('main .sub');
step('projects screen reports the miscount', /119 projects/.test(projText ?? ''), (projText ?? '').slice(0, 120));
await shot('08-projects');

await page.goto(`${BASE}/insights`, { waitUntil: 'networkidle' });
await settle();
await page.waitForSelector('.kpi', { timeout: 30000 });
const kpis = await page.locator('.kpi').count();
step('insights screen renders its KPIs', kpis >= 10, `${kpis} tiles`);
const body = (await page.textContent('main')) ?? '';
// The last two are sentences the screen used to hard-code; they are computed
// now, so seeing them proves the computed text renders.
for (const want of ['4,100', '3,116', '3,233', '3.78 Cr', '7 classes, 9 records each', 'each post 15–16 listings']) {
  step(`insights shows ${want}`, body.includes(want));
}
await shot('09-insights');

step('no console errors or unhandled rejections anywhere', errors.length === 0);
if (errors.length) {
  console.log('--- everything the browser complained about ---');
  for (const e of errors) console.log('  ' + e);
}

await browser.close();
console.log(process.exitCode ? '\nUI smoke test FAILED' : '\nUI smoke test passed; screenshots in data/raw/screens/');
