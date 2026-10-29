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
 *      to a 30-day window DISABLES the Refund action (the preflight names the reason before the
 *      click), pressing it anyway writes nothing, and switching back re-enables it and allows the
 *      same refund — the mechanism never makes this decision itself;
 *   6b. the refund is REPORTED under its own name: the creator dashboard shows the claw-back apart
 *      from `spent`, the statement shows `refunded` apart from `earned`, and both reconcile;
 *   6c. the DEADLINE is visible (v534): beside the Refund action the row states the closing instant
 *      the preflight computed — "no deadline" under a declared no-deadline policy, and a dated
 *      `refund until …` for a purchase made under a 30-day window;
 *   6d. the statement reads BY LISTING (v536): each ref's row names what it actually did — the
 *      listing bought and fully refunded still says `spent … · refunded …` with net 0 and two
 *      movements, a held purchase names its spend only, and an untouched listing has no row at all;
 *   6e. the shelf can RETIRE a listing (v540): an unowned listing leaves the shelf outright, while
 *      a listing the buyer PAID FOR keeps its row, states that it is retired, keeps naming the
 *      buyer as its owner, and keeps a Refund action that reads the RECORD — pressing it makes the
 *      buyer whole and the now-unowned row finally leaves;
 *   6g. a take-down can be PUT BACK (v542): the shelf remembers WHAT it withdrew beside what is still
 *      for sale, the record survives a reload, and a Put back action returns a listing to the shelf
 *      (and out of the withdrawn record) — again across a reload;
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

  // v531: the surface asks the policy layer BEFORE the click. Under a closed window the Refund action
  // is DISABLED and carries the gate's own sentence in its title — the refusal is visible, not
  // discovered by pressing it.
  await page.waitForFunction(
    "(() => { const b = document.querySelector('[data-credits-refund=\"tpl-saas\"]'); return !!b && b.disabled === true; })()",
    { timeout: 10000 },
  );
  const preflight = await page.evaluate(
    "(() => { const b = document.querySelector('[data-credits-refund=\"tpl-saas\"]'); return { disabled: b?.disabled ?? null, title: b?.getAttribute('title') ?? null, blocked: b?.getAttribute('data-credits-refund-blocked') ?? null, wallet: document.querySelector('[data-credits-wallet]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, error: !!document.querySelector('[data-credits-error]') }; })()",
  );
  check(
    'a closed window DISABLES the Refund action and names the reason before any click',
    preflight.disabled === true && /refund window/.test(preflight.title ?? '') && preflight.blocked === 'true' &&
      /balance: 500 credits/.test(preflight.wallet ?? '') && /owns: tpl-saas/.test(preflight.wallet ?? '') && preflight.error === false,
    JSON.stringify(preflight),
  );

  // Pressing it anyway must be INERT: a disabled button dispatches no click, so nothing is written and
  // no error banner appears.
  const pressed = await page.evaluate(
    "(() => { const b = document.querySelector('[data-credits-refund=\"tpl-saas\"]'); if (!b) return null; b.click(); return true; })()",
  );
  await sleep(300);
  const afterPress = await page.evaluate(
    "(() => ({ disabled: document.querySelector('[data-credits-refund=\"tpl-saas\"]')?.disabled ?? null, wallet: document.querySelector('[data-credits-wallet]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, error: !!document.querySelector('[data-credits-error]') }))()",
  );
  check(
    'pressing the disabled action writes nothing and stays disabled',
    pressed === true && afterPress.disabled === true && afterPress.error === false &&
      /balance: 500 credits/.test(afterPress.wallet ?? '') && /owns: tpl-saas/.test(afterPress.wallet ?? ''),
    JSON.stringify(afterPress),
  );

  // Switching back to "no deadline" must RE-ENABLE it and allow the SAME refund — proving the
  // refusal above was the policy's and not a broken page.
  await page.evaluate("(() => { const b = document.querySelector('[data-credits-policy=\"none\"]'); if (!b) return false; b.click(); return true; })()");
  await page.waitForFunction("(document.querySelector('[data-credits-policy-line]')?.innerText ?? '').includes('no deadline')", { timeout: 10000 });
  await page.waitForFunction(
    "(() => { const b = document.querySelector('[data-credits-refund=\"tpl-saas\"]'); return !!b && b.disabled === false; })()",
    { timeout: 10000 },
  );
  const reenabled = await page.evaluate(
    "(() => { const b = document.querySelector('[data-credits-refund=\"tpl-saas\"]'); return { disabled: b?.disabled ?? null, title: b?.getAttribute('title') ?? null, blocked: b?.getAttribute('data-credits-refund-blocked') ?? null }; })()",
  );
  check(
    'switching back re-enables the Refund action and clears the reason',
    reenabled.disabled === false && reenabled.title === null && reenabled.blocked === null,
    JSON.stringify(reenabled),
  );
  // v534: the deadline the preflight computed is SAID. Under "no deadline" the row states that, so a
  // reader never has to infer "refundable forever" from the absence of a refusal.
  const noDeadlineShown = await page.evaluate(
    "(() => { const r = document.querySelector('[data-credits-listing=\"tpl-saas\"]'); const s = r?.querySelector('[data-credits-refund-until]'); return { attr: s?.getAttribute('data-credits-refund-until') ?? null, text: s?.textContent?.trim() ?? null }; })()",
  );
  check(
    'with no declared deadline the surface says so beside the action',
    noDeadlineShown.attr === 'no deadline' && /refund: no deadline/.test(noDeadlineShown.text ?? ''),
    JSON.stringify(noDeadlineShown),
  );
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

  // 6b. WHAT THE REFUND IS CALLED. The author lost a sale, so the claw-back must be reported as a
  // claw-back — not as the creator spending — and the buyer's returned credits as `refunded` — not as
  // income. Both projections must reconcile after the reversal.
  const flows = await page.evaluate(
    "(() => ({ creator: document.querySelector('[data-credits-creator]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, statement: document.querySelector('[data-credits-statement]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null }))()",
  );
  check(
    'the creator dashboard reports the claw-back apart from spent, and the statement reports refunds apart from earned',
    /holds 100/.test(flows.creator ?? '') && /earned 600/.test(flows.creator ?? '') && /spent 0/.test(flows.creator ?? '') &&
      /clawed back 500/.test(flows.creator ?? '') && /refunded 0/.test(flows.creator ?? '') &&
      /refunded 700/.test(flows.statement ?? '') && /reconciles: yes/.test(flows.statement ?? ''),
    JSON.stringify(flows),
  );

  // 6c. THE DEADLINE IS VISIBLE (v534). A purchase made NOW under a 30-day window is refundable until
  // purchase + 30d, and the row must state that INSTANT — the preflight's `closesAt`, not a promise of
  // "forever". The instant is read off the DOM attribute and parsed; the date is not asserted to the
  // millisecond because the purchase instant is the page's clock, but it must be a real future instant.
  const mobileBought = await page.evaluate(
    "(() => { const b = document.querySelector('[data-credits-buy=\"tpl-mobile\"]'); if (!b) return false; b.click(); return true; })()",
  );
  await page.waitForFunction(
    "(document.querySelector('[data-credits-wallet]')?.innerText ?? '').includes('balance: 800 credits')",
    { timeout: 10000 },
  );
  const buyAt = Date.now();
  await page.evaluate("(() => { const b = document.querySelector('[data-credits-policy=\"30d\"]'); if (!b) return false; b.click(); return true; })()");
  await page.waitForFunction("(document.querySelector('[data-credits-policy-line]')?.innerText ?? '').includes('30-day window')", { timeout: 10000 });
  await page.waitForFunction(
    "(() => !!document.querySelector('[data-credits-listing=\"tpl-mobile\"] [data-credits-refund-until]'))()",
    { timeout: 10000 },
  );
  const dated = await page.evaluate(
    "(() => { const r = document.querySelector('[data-credits-listing=\"tpl-mobile\"]'); const s = r?.querySelector('[data-credits-refund-until]'); const b = r?.querySelector('[data-credits-refund=\"tpl-mobile\"]'); return { attr: s?.getAttribute('data-credits-refund-until') ?? null, text: s?.textContent?.trim() ?? null, disabled: b?.disabled ?? null }; })()",
  );
  const closesMs = typeof dated.attr === 'string' ? Date.parse(dated.attr) : NaN;
  check(
    'a purchase under a 30-day window shows WHEN its refund closes, and the action stays offered',
    mobileBought === true && dated.disabled === false &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(dated.attr ?? '') &&
      Number.isFinite(closesMs) && closesMs > buyAt - 1000 &&
      /refund until \d{4}-/.test(dated.text ?? ''),
    JSON.stringify(dated),
  );

  // 6d. BY LISTING (v535/v536). The statement's totals say what moved; these rows say WHICH listing
  // moved it, by name. The row that matters is the one a net could hide: tpl-saas was bought and then
  // fully refunded, so its net is 0 — and it must still say `spent 500 · refunded 500` rather than
  // disappear into "nothing happened". A listing nobody touched contributes no row at all.
  const byListing = await page.evaluate(
    "(() => { const sec = document.querySelector('[data-credits-attribution]'); const rows = {}; for (const el of document.querySelectorAll('[data-credits-attr]')) { rows[el.getAttribute('data-credits-attr')] = { net: el.getAttribute('data-credits-attr-net'), text: el.textContent.trim() }; } return { present: !!sec, rows }; })()",
  );
  check(
    'a purchase that was fully refunded keeps both halves on its own row (net 0, two movements)',
    byListing.present === true && byListing.rows['tpl-saas']?.net === '0' &&
      /spent 500/.test(byListing.rows['tpl-saas']?.text ?? '') &&
      /refunded 500/.test(byListing.rows['tpl-saas']?.text ?? '') &&
      /net 0/.test(byListing.rows['tpl-saas']?.text ?? '') &&
      /\(2 movement\(s\)\)/.test(byListing.rows['tpl-saas']?.text ?? ''),
    JSON.stringify(byListing),
  );
  check(
    'a listing bought, refunded and bought AGAIN names all three movements; an untouched listing has no row',
    byListing.rows['tpl-mobile']?.net === '-200' &&
      /spent 400/.test(byListing.rows['tpl-mobile']?.text ?? '') &&
      /refunded 200/.test(byListing.rows['tpl-mobile']?.text ?? '') &&
      /net -200/.test(byListing.rows['tpl-mobile']?.text ?? '') &&
      /\(3 movement\(s\)\)/.test(byListing.rows['tpl-mobile']?.text ?? '') &&
      byListing.rows['tpl-starter'] === undefined,
    JSON.stringify(byListing.rows),
  );

  // 6e. THE WINDOW IS THE READER'S (v537). A statement is a reading of the record, and WHICH window
  // it reads is the host's choice, not the model's. The demo span is the fixture's own 2023 instants,
  // so this session's movements fall AFTER the close: `closing` stops being the balance and the line
  // must say so. The same window feeds the per-listing rows, so a refund whose purchase is outside it
  // is stated as the refund it was (the Amendment 7 bound, now operable).
  const readWindow = async () =>
    page.evaluate(
      "(() => { const rows = {}; for (const el of document.querySelectorAll('[data-credits-attr]')) { rows[el.getAttribute('data-credits-attr')] = el.textContent.trim(); } return { window: document.querySelector('[data-credits-window-line]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, line: document.querySelector('[data-credits-statement-line]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, card: document.querySelector('[data-credits-statement]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, rows }; })()",
    );
  const chooseWindow = async (choice, needle) => {
    await page.evaluate(
      `(() => { const b = document.querySelector('[data-credits-window="${choice}"]'); if (!b) return false; b.click(); return true; })()`,
    );
    await page.waitForFunction(
      `(() => (document.querySelector('[data-credits-window-line]')?.innerText ?? '').includes(${JSON.stringify(needle)}))()`,
      { timeout: 10000 },
    );
  };
  await chooseWindow('demo', "the demo ledger's own span");
  const demoWindow = await readWindow();
  check(
    'a BOUNDED window says what follows it: the demo span closes at 500 and names the +300 after it',
    /1700000300000\.\.1700000400000/.test(demoWindow.line ?? '') &&
      /0 → 500/.test(demoWindow.line ?? '') &&
      /after \+300/.test(demoWindow.line ?? '') &&
      /balance 800/.test(demoWindow.line ?? '') &&
      /reconciles: yes/.test(demoWindow.card ?? '') &&
      /tpl-saas: spent 500 · net -500 \(1 movement\(s\)\)/.test(demoWindow.rows['tpl-saas'] ?? '') &&
      demoWindow.rows['tpl-mobile'] === undefined,
    JSON.stringify(demoWindow),
  );
  await chooseWindow('session', 'since ');
  const sessionWindow = await readWindow();
  check(
    'the SESSION window (since this page opened) folds the earlier era into the opening (500 → 800) and states the refund alone',
    /statement: buyer-1 · \d{13}\.\.−/.test(sessionWindow.line ?? '') &&
      /\+0 \/ −200/.test(sessionWindow.line ?? '') &&
      /refunded 500/.test(sessionWindow.line ?? '') &&
      /500 → 800/.test(sessionWindow.line ?? '') &&
      !/ after /.test(sessionWindow.line ?? '') &&
      /reconciles: yes/.test(sessionWindow.card ?? '') &&
      /tpl-saas: refunded 500 · net 500 \(1 movement\(s\)\)/.test(sessionWindow.rows['tpl-saas'] ?? '') &&
      /tpl-mobile: spent 200 · net -200 \(1 movement\(s\)\)/.test(sessionWindow.rows['tpl-mobile'] ?? ''),
    JSON.stringify(sessionWindow),
  );
  await chooseWindow('all', 'all time');
  const backToAll = await readWindow();
  check(
    'switching back to the whole record restores the all-time line and both rows',
    /all time/.test(backToAll.window ?? '') &&
      /statement: buyer-1 · all time/.test(backToAll.line ?? '') &&
      !/ after /.test(backToAll.line ?? '') &&
      /\(2 movement\(s\)\)/.test(backToAll.rows['tpl-saas'] ?? '') &&
      /\(3 movement\(s\)\)/.test(backToAll.rows['tpl-mobile'] ?? ''),
    JSON.stringify(backToAll),
  );

  // 6e. THE SHELF'S OTHER VERB (v540). The catalog could only ADD until v539, so a take-down was a
  // capability with no producer on the surface. Retire is that verb, and the check that matters is the
  // one a shelf alone cannot answer: a listing the buyer PAID FOR stays owned, stays refundable, and
  // only then — once the refund has released the hold — does the retired row leave.
  await page.evaluate("(() => { const b = document.querySelector('[data-credits-retire=\"tpl-starter\"]'); if (!b) return false; b.click(); return true; })()");
  await page.waitForFunction("(() => document.querySelectorAll('[data-credits-listing]').length === 2)()", { timeout: 10000 });
  const retiredFree = await page.evaluate(
    "(() => ({ count: document.querySelectorAll('[data-credits-listing]').length, gone: !document.querySelector('[data-credits-listing=\"tpl-starter\"]'), header: document.querySelector('[data-credits-store]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null }))()",
  );
  check(
    'a retire WITHDRAWS an unowned listing from the shelf, and the shelf says its new size',
    retiredFree.count === 2 && retiredFree.gone === true && /2 listing\(s\)/.test(retiredFree.header ?? ''),
    JSON.stringify(retiredFree),
  );

  await page.evaluate("(() => { const b = document.querySelector('[data-credits-retire=\"tpl-mobile\"]'); if (!b) return false; b.click(); return true; })()");
  await page.waitForFunction("(() => !!document.querySelector('[data-credits-listing=\"tpl-mobile\"][data-credits-retired=\"true\"]'))()", { timeout: 10000 });
  const retiredOwned = await page.evaluate(
    "(() => { const r = document.querySelector('[data-credits-listing=\"tpl-mobile\"]'); const b = r?.querySelector('[data-credits-refund=\"tpl-mobile\"]'); return { retired: r?.getAttribute('data-credits-retired') ?? null, row: r?.innerText.replace(/\\s+/g, ' ').trim() ?? null, wallet: document.querySelector('[data-credits-wallet]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, refund: !!b, disabled: b?.disabled ?? null, header: document.querySelector('[data-credits-store]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null }; })()",
  );
  check(
    'a listing the buyer OWNS keeps its row after a retire, says it is retired, and keeps its Refund action',
    retiredOwned.retired === 'true' && /retired/.test(retiredOwned.row ?? '') &&
      /owns: tpl-mobile/.test(retiredOwned.wallet ?? '') && /balance: 800 credits/.test(retiredOwned.wallet ?? '') &&
      retiredOwned.refund === true && retiredOwned.disabled === false &&
      /1 listing\(s\)/.test(retiredOwned.header ?? '') && /1 retired you still own/.test(retiredOwned.header ?? ''),
    JSON.stringify(retiredOwned),
  );

  await page.evaluate("(() => { const b = document.querySelector('[data-credits-refund=\"tpl-mobile\"]'); if (!b) return false; b.click(); return true; })()");
  await page.waitForFunction("(document.querySelector('[data-credits-wallet]')?.innerText ?? '').includes('balance: 1000 credits')", { timeout: 10000 });
  const refundedRetired = await page.evaluate(
    "(() => ({ wallet: document.querySelector('[data-credits-wallet]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, gone: !document.querySelector('[data-credits-listing=\"tpl-mobile\"]'), error: document.querySelector('[data-credits-error]')?.innerText.trim() ?? null, header: document.querySelector('[data-credits-store]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null }))()",
  );
  check(
    'a refund of a RETIRED ref reads the record: the buyer is made whole and the released row leaves',
    /balance: 1000 credits/.test(refundedRetired.wallet ?? '') && /owns: nothing/.test(refundedRetired.wallet ?? '') &&
      refundedRetired.gone === true && refundedRetired.error === null && /1 listing\(s\)/.test(refundedRetired.header ?? ''),
    JSON.stringify(refundedRetired),
  );

  // 6f. THE SHELF IS LOCAL-FIRST TOO (v541). The page holds the catalog in `catalogStore`, so a
  // RETIRE outlives the page that performed it: a full reload reads back the shelf the retire left
  // (one listing), and the purchase the refund released is gone from the store — not just the DOM.
  await page.navigate(`${URL_BASE}/credits`, { waitForSelector: '#nexus-credits' });
  await page.waitForFunction("!!document.querySelector('[data-credits-wallet]')", { timeout: 20000 });
  const shelfReload = await page.evaluate(
    "(() => ({ wallet: document.querySelector('[data-credits-wallet]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, rows: document.querySelectorAll('[data-credits-listing]').length, retired: document.querySelectorAll('[data-credits-retired]').length, gone: !document.querySelector('[data-credits-listing=\"tpl-mobile\"]'), header: document.querySelector('[data-credits-store]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null }))()",
  );
  check(
    'a RETIRE survives a reload: the shelf read back from catalogStore has one listing and no retired row',
    shelfReload.rows === 1 && shelfReload.retired === 0 && shelfReload.gone === true &&
      /balance: 1000 credits/.test(shelfReload.wallet ?? '') && /1 listing\(s\)/.test(shelfReload.header ?? ''),
    JSON.stringify(shelfReload),
  );

  // 6g. A TAKE-DOWN CAN BE PUT BACK (v542). A retire used to be a plain removal; format 2 remembers
  // WHAT was withdrawn beside what is still for sale, so the shelf can offer the move reversed. The
  // claim is measured where a shelf alone cannot answer it: the record now, and the record after a
  // reload — the same two facts a person would check before trusting the button.
  const retireLast = await page.evaluate(
    "(() => { const b = document.querySelector('[data-credits-retire=\"tpl-saas\"]'); if (!b) return false; b.click(); return true; })()",
  );
  await page.waitForFunction("(() => document.querySelectorAll('[data-credits-listing]').length === 0)()", { timeout: 10000 });
  const withdrewLast = await page.evaluate(
    "(() => ({ rows: document.querySelectorAll('[data-credits-listing]').length, withdrawn: document.querySelectorAll('[data-credits-withdrawn]').length, strip: document.querySelector('[data-credits-withdrawn-strip]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, header: document.querySelector('[data-credits-store]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null }))()",
  );
  check(
    'retiring the LAST listed template empties the shelf but RECORDS the take-down (3 withdrawn, the newest named)',
    retireLast === true && withdrewLast.rows === 0 && withdrewLast.withdrawn === 3 &&
      /0 listing\(s\)/.test(withdrewLast.header ?? '') &&
      /WITHDRAWN · 3 listing\(s\)/.test(withdrewLast.strip ?? '') &&
      /SaaS Dashboard/.test(withdrewLast.strip ?? ''),
    JSON.stringify(withdrewLast),
  );

  await page.navigate(`${URL_BASE}/credits`, { waitForSelector: '#nexus-credits' });
  await page.waitForFunction("!!document.querySelector('[data-credits-wallet]')", { timeout: 20000 });
  const withdrawnReload = await page.evaluate(
    "(() => ({ rows: document.querySelectorAll('[data-credits-listing]').length, withdrawn: document.querySelectorAll('[data-credits-withdrawn]').length, ids: [...document.querySelectorAll('[data-credits-withdrawn]')].map((el) => el.getAttribute('data-credits-withdrawn')), strip: document.querySelector('[data-credits-withdrawn-strip]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null }))()",
  );
  check(
    'the WITHDRAWN record survives a reload: the empty shelf reads back and all three take-downs are remembered',
    withdrawnReload.rows === 0 && withdrawnReload.withdrawn === 3 &&
      ['tpl-starter', 'tpl-mobile', 'tpl-saas'].every((id) => withdrawnReload.ids.includes(id)) &&
      /WITHDRAWN · 3 listing\(s\)/.test(withdrawnReload.strip ?? ''),
    JSON.stringify(withdrawnReload),
  );

  const putBack = await page.evaluate(
    "(() => { const b = document.querySelector('[data-credits-relist=\"tpl-saas\"]'); if (!b) return false; b.click(); return true; })()",
  );
  await page.waitForFunction("(() => document.querySelectorAll('[data-credits-listing]').length === 1)()", { timeout: 10000 });
  const relisted = await page.evaluate(
    "(() => ({ rows: document.querySelectorAll('[data-credits-listing]').length, withdrawn: document.querySelectorAll('[data-credits-withdrawn]').length, relistGone: !document.querySelector('[data-credits-relist=\"tpl-saas\"]'), row: document.querySelector('[data-credits-listing=\"tpl-saas\"]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null, header: document.querySelector('[data-credits-store]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null }))()",
  );
  check(
    'Put back returns a withdrawn listing to the shelf and takes it off the withdrawn record',
    putBack === true && relisted.rows === 1 && relisted.withdrawn === 2 && relisted.relistGone === true &&
      /SaaS Dashboard/.test(relisted.row ?? '') && /1 listing\(s\)/.test(relisted.header ?? ''),
    JSON.stringify(relisted),
  );

  await page.navigate(`${URL_BASE}/credits`, { waitForSelector: '#nexus-credits' });
  await page.waitForFunction("!!document.querySelector('[data-credits-wallet]')", { timeout: 20000 });
  const relistReload = await page.evaluate(
    "(() => ({ rows: document.querySelectorAll('[data-credits-listing]').length, withdrawn: document.querySelectorAll('[data-credits-withdrawn]').length, row: document.querySelector('[data-credits-listing=\"tpl-saas\"]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null }))()",
  );
  check(
    'a PUT-BACK survives a reload too: the shelf reads back one listing and two withdrawals',
    relistReload.rows === 1 && relistReload.withdrawn === 2 && /SaaS Dashboard/.test(relistReload.row ?? ''),
    JSON.stringify(relistReload),
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
