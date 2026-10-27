/**
 * M8 — the `/credits` surface in a REAL browser (ADR 0017 harness).
 *
 * The last increment shipped the surface with an honest bound: *"type-checked and fixture-tested, but a
 * browser render was not driven."* This file is that check. It drives the real page over CDP and asks
 * the questions only a browser can answer:
 *
 *   1. `/credits` mounts and says `DEMO MODE` on its face — no service, no payment;
 *   2. an ABSENT local ledger is shown as EMPTY, not as a fabricated balance;
 *   3. pressing `Load a demo ledger` renders the wallet (500 credits, owning the purchased template),
 *      the creator dashboard (earned 600, its listings) and a statement that RECONCILES;
 *   4. the store lists all three listings and marks the free one and the owned one;
 *   5. the ledger PERSISTS across a full reload — it was written through `creditsStore` to localStorage,
 *      so a fresh page reads it back (this is the local-first claim, measured);
 *   6. the refund POLICY is the HOST's choice: the page declares "no deadline" by default, switching
 *      to a 30-day window makes the demo's 2023 purchase REFUSED by policy (the local ledger does not
 *      move), and switching back allows it — the mechanism never makes this decision itself;
 *   7. clearing writes a VALID empty ledger and the page returns to its empty state;
 *   8. no uncaught page errors, and a screenshot is written as evidence.
 *
 * Usage: node tools/harness/studio-credits.mjs [--url http://127.0.0.1:3210] [--out DIR]
 *
 * The Studio must be running first: from `apps/studio`,
 *   NODE_OPTIONS= ../../node_modules/.bin/next dev -p 3210
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const URL_BASE = arg('url', 'http://127.0.0.1:3210');
const OUT_DIR = arg('out', '.scratch/m8-credits');
mkdirSync(OUT_DIR, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`);
};

const session = await launch({ width: 1280, height: 900 });
const page = await session.newPage('about:blank');

try {
  // 1. the page mounts and names its mode.
  await page.navigate(`${URL_BASE}/credits`, { waitForSelector: '#nexus-credits', waitMs: 500 });
  const face = await page.evaluate(
    "(() => ({ surface: document.querySelector('[data-surface]')?.getAttribute('data-surface') ?? null, mode: document.querySelector('[data-credits-mode]')?.innerText ?? null, empty: !!document.querySelector('[data-credits-empty]') }))()",
  );
  check('the /credits page mounts and names DEMO MODE', face.surface === 'credits' && /DEMO MODE/.test(face.mode ?? ''), JSON.stringify(face));

  // 2. a first visit has no ledger, and the page says so rather than inventing a balance.
  const emptyText = await page.text('[data-credits-empty]');
  check('an absent local ledger is shown as EMPTY', /No movements yet/.test(emptyText ?? ''), JSON.stringify(emptyText));

  // 3. load the demo ledger.
  const clicked = await page.evaluate(
    "(() => { const b = document.querySelector('[data-credits-load]'); if (!b) return false; b.click(); return true; })()",
  );
  check('the surface exposes a demo-loader', clicked === true, `load button clicked: ${clicked}`);
  await page.waitForSelector('[data-credits-wallet]', 15000);
  const rendered = await page.evaluate(
    "(() => ({ wallet: document.querySelector('[data-credits-wallet]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, creator: document.querySelector('[data-credits-creator]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, statement: document.querySelector('[data-credits-statement]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null }))()",
  );
  check('the wallet shows the demo balance and ownership', /balance: 500 credits/.test(rendered.wallet ?? '') && /owns: tpl-saas/.test(rendered.wallet ?? ''), rendered.wallet);
  check('the creator dashboard reconciles and names its listings', /holds 600/.test(rendered.creator ?? '') && /earned 600/.test(rendered.creator ?? '') && /SaaS Dashboard/.test(rendered.creator ?? ''), rendered.creator);
  check('the statement reconciles', /reconciles: yes/.test(rendered.statement ?? ''), rendered.statement);

  // 4. the store lists every listing and marks the free and owned ones.
  const rows = await page.evaluate("[...document.querySelectorAll('[data-credits-listing]')].map((tr) => tr.innerText.replace(/\\s+/g, ' ').trim())");
  check('the store lists all three listings', rows.length === 3, JSON.stringify(rows));
  check(
    'the store marks the free listing and the owned one',
    rows.some((r) => /Starter Landing/.test(r) && /Free/.test(r) && /free/.test(r)) && rows.some((r) => /SaaS Dashboard/.test(r) && /owned/.test(r)),
    JSON.stringify(rows),
  );

  // 4b. BUY: the REAL marketplace transaction on the local ledger.
  const buyClicked = await page.evaluate(
    "(() => { const b = document.querySelector('[data-credits-buy=\"tpl-mobile\"]'); if (!b) return false; b.click(); return true; })()",
  );
  check('the store offers a Buy action for an affordable, unowned listing', buyClicked === true, `buy clicked: ${buyClicked}`);
  await page.waitForFunction("(document.querySelector('[data-credits-wallet]')?.innerText ?? '').includes('balance: 300 credits')", { timeout: 10000 });
  const afterBuy = await page.evaluate(
    "(() => ({ wallet: document.querySelector('[data-credits-wallet]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, stillBuyable: !!document.querySelector('[data-credits-buy=\"tpl-mobile\"]') }))()",
  );
  check('buying debits the buyer by the price (500 -> 300)', /balance: 300 credits/.test(afterBuy.wallet ?? ''), afterBuy.wallet);
  check('the purchased template is now owned and no longer offered', /owns: tpl-saas, tpl-mobile/.test(afterBuy.wallet ?? '') && afterBuy.stillBuyable === false, JSON.stringify(afterBuy));

  // evidence: a screenshot of the POPULATED surface (before the reload and clear).
  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  const file = join(OUT_DIR, 'credits-surface.png');
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`screenshot: ${file}`);

  // 4c. REFUND: reversing the recorded purchase releases ownership (net of refunds).
  const refundClicked = await page.evaluate(
    "(() => { const b = document.querySelector('[data-credits-refund=\"tpl-mobile\"]'); if (!b) return false; b.click(); return true; })()",
  );
  check('the store offers a Refund action for a held purchase', refundClicked === true, `refund clicked: ${refundClicked}`);
  await page.waitForFunction("(document.querySelector('[data-credits-wallet]')?.innerText ?? '').includes('balance: 500 credits')", { timeout: 10000 });
  const afterRefund = await page.evaluate(
    "(() => ({ wallet: document.querySelector('[data-credits-wallet]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, refundGone: !document.querySelector('[data-credits-refund=\"tpl-mobile\"]'), buyBack: !!document.querySelector('[data-credits-buy=\"tpl-mobile\"]') }))()",
  );
  check('refunding makes the buyer whole (300 -> 500) and releases ownership', /balance: 500 credits/.test(afterRefund.wallet ?? '') && /owns: tpl-saas can still buy/.test(afterRefund.wallet ?? ''), afterRefund.wallet);
  check('the refunded listing is no longer held and can be bought again', afterRefund.refundGone === true && afterRefund.buyBack === true, JSON.stringify(afterRefund));

  // 5. PERSISTENCE: a full reload reads the ledger back from localStorage.
  await page.navigate(`${URL_BASE}/credits`, { waitForSelector: '#nexus-credits' });
  // The FIRST render after a reload has no ledger yet (the effect has not run), so waiting for
  // "wallet OR empty" would read the empty state before hydration and report a persistence failure
  // that is really a race. Wait for the WALLET: if the stored ledger comes back, it appears.
  await page.waitForFunction("!!document.querySelector('[data-credits-wallet]')", { timeout: 20000 });
  const afterReload = await page.evaluate(
    "(() => ({ empty: !!document.querySelector('[data-credits-empty]'), wallet: document.querySelector('[data-credits-wallet]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null }))()",
  );
  check('the ledger PERSISTS across a reload (localStorage)', afterReload.empty === false && /balance: 500 credits/.test(afterReload.wallet ?? '') && /owns: tpl-saas can still buy/.test(afterReload.wallet ?? ''), JSON.stringify(afterReload));

  // 6. the refund POLICY: the host chooses the window, and the mechanism obeys it.
  const policyLine = async () =>
    page.evaluate("document.querySelector('[data-credits-policy-line]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null");
  check('the page declares its refund policy on its face', /REFUND POLICY · no deadline/.test((await policyLine()) ?? ''), await policyLine());

  await page.evaluate("(() => { const b = document.querySelector('[data-credits-policy=\"30d\"]'); if (!b) return false; b.click(); return true; })()");
  await page.waitForFunction("(document.querySelector('[data-credits-policy-line]')?.innerText ?? '').includes('30-day window')", { timeout: 10000 });
  check('switching the policy rewrites the declared window', /30-day window from the purchase/.test((await policyLine()) ?? ''), await policyLine());

  await page.evaluate("(() => { const b = document.querySelector('[data-credits-refund=\"tpl-saas\"]'); if (!b) return false; b.click(); return true; })()");
  await page.waitForSelector('[data-credits-error]', 10000);
  const refused = await page.evaluate(
    "(() => ({ error: document.querySelector('[data-credits-error]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, wallet: document.querySelector('[data-credits-wallet]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, stillHeld: !!document.querySelector('[data-credits-refund=\"tpl-saas\"]') }))()",
  );
  check(
    'a closed window REFUSES the refund by policy and leaves the local ledger untouched',
    /refund window/.test(refused.error ?? '') && /balance: 500 credits/.test(refused.wallet ?? '') && /owns: tpl-saas/.test(refused.wallet ?? '') && refused.stillHeld === true,
    JSON.stringify(refused),
  );

  // Switching back to "no deadline" must allow the SAME refund — proving the refusal above was the
  // policy's and not a broken page.
  await page.evaluate("(() => { const b = document.querySelector('[data-credits-policy=\"none\"]'); if (!b) return false; b.click(); return true; })()");
  await page.waitForFunction("(document.querySelector('[data-credits-policy-line]')?.innerText ?? '').includes('no deadline')", { timeout: 10000 });
  await page.evaluate("(() => { const b = document.querySelector('[data-credits-refund=\"tpl-saas\"]'); if (!b) return false; b.click(); return true; })()");
  await page.waitForFunction("(document.querySelector('[data-credits-wallet]')?.innerText ?? '').includes('balance: 1000 credits')", { timeout: 10000 });
  const allowed = await page.evaluate(
    "(() => ({ wallet: document.querySelector('[data-credits-wallet]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, error: !!document.querySelector('[data-credits-error]') }))()",
  );
  check(
    'with no declared deadline the same refund is allowed (500 -> 1000)',
    /balance: 1000 credits/.test(allowed.wallet ?? '') && /owns: nothing/.test(allowed.wallet ?? '') && allowed.error === false,
    JSON.stringify(allowed),
  );

  // 7. clearing writes a valid empty ledger and returns the page to its empty state.
  await page.evaluate("(() => { const b = document.querySelector('[data-credits-clear]'); if (!b) return false; b.click(); return true; })()");
  await sleep(300);
  const cleared = await page.evaluate("!!document.querySelector('[data-credits-empty]')");
  check('clearing the local ledger returns the page to its empty state', cleared === true, String(cleared));

  // 8. no uncaught page errors (the screenshot was taken on the populated surface above).
  check('no uncaught page errors', session.pageErrors.length === 0, JSON.stringify(session.pageErrors).slice(0, 400));
} finally {
  await page.close();
  await session.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILED:', failed.map((f) => f.name).join(' | '));
  process.exitCode = 1;
}
