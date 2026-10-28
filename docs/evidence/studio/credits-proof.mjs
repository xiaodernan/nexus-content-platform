// NEXUS M8 — the CREDITS sub-system proof: the ledger, the catalog, the marketplace, the dashboard,
// the settlement statement, the template-remix handoff and the buyer wallet, exercised end-to-end
// over the SHIPPED Studio modules rather than a copy.
//
// The modules are read off disk and run through Node's own TypeScript type-stripper — the same
// mechanism asset-surface-proof.mjs uses — so this proof measures the bytes the Studio ships. Two
// details make that work for a MULTI-module graph rather than a single file:
//
//   - the stripped modules are written into a temp dir INSIDE the repo, so the one bare specifier
//     (`@nexus/design-model`, used by the remix handoff) resolves through the workspace's
//     node_modules, and no copy of `forkDocument` appears here;
//   - each extensionless relative import (`from './credits'`) is rewritten to `.mjs`, because Node's
//     ESM resolver requires an extension and the TypeScript source omits it.
//
// What it asserts, in order:
//   §1 the credits ledger IS the record: balances derive, ids are idempotency keys, a spend cannot
//      go below zero, a fractional delta is refused, and a tampered ledger is NAMED by the validator;
//   §2 the catalog is the inventory: a duplicate id is refused, search is exact-token AND, and a
//      query that matches nothing answers nothing;
//   §3 the marketplace is ATOMIC: a purchase moves both accounts, and a refusal moves NEITHER;
//   §4 the dashboard and the statement RECONCILE: earned − spent + refunded − clawedBack === balance,
//      and opening + earned − spent + refunded − clawedBack + after === the whole-ledger balance over
//      a bounded window;
//   §5 the remix handoff forks a NEW document (id changes, source untouched) and reports a malformed
//      source by name instead of throwing;
//   §6 the wallet view is DERIVED: owned = authored + spent-ref; affordable = the marketplace's gate;
//   §7 the wire format round-trips and refuses a bad record (a future version, a negative prefix);
//   §8 the local-first store distinguishes an ABSENT key (empty) from a corrupt one (refused);
//   §9 a refund is atomic, reverses ownership and the remix right, and is not repeatable; the
//      seller's side is a `clawback` (NOT a purchase), and both projections report refunds and
//      claw-backs apart from earned/spent; a reversal dated BEFORE its cause is refused by name;
//   §10 a refund POLICY is the HOST's declaration: a closed window refuses before the mechanism runs
//      and moves nothing, the closing instant is inclusive, an ASK dated before the purchase is
//      refused by the same ordering rule, a broken policy is refused by name, and the PREFLIGHT
//      (`refundEligibility`) answers the same gate without writing anything;
//   §11 HEAD is byte-identical: everything ran in memory.
//
// Run after `npm run build`:  node docs/evidence/studio/credits-proof.mjs

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { execFileSync } from '../lib/syncproc.mjs';

const REPO = process.cwd();
const MODULES = ['credits', 'templateCatalog', 'marketplace', 'creatorDashboard', 'settlement', 'templateRemix', 'walletView', 'ledgerStore', 'creditsStore', 'refund', 'refundPolicy'];

const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const box = mkdtempSync(join(REPO, '.nexus-credits-proof-'));
const libDir = join(box, 'lib');
mkdirSync(libDir, { recursive: true });

try {
  for (const name of MODULES) {
    let stripped = stripTypeScriptTypes(
      readFileSync(join(REPO, 'apps', 'studio', 'src', 'lib', `${name}.ts`), 'utf8'),
      { mode: 'strip' },
    );
    // Node ESM needs extensions; the TS source writes `from './credits'`. Rewrite only OUR modules.
    for (const dep of MODULES) {
      stripped = stripped.replaceAll(`from './${dep}'`, `from './${dep}.mjs'`);
      stripped = stripped.replaceAll(`from "./${dep}"`, `from "./${dep}.mjs"`);
    }
    writeFileSync(join(libDir, `${name}.mjs`), stripped, 'utf8');
  }

  const credits = await import(pathToFileURL(join(libDir, 'credits.mjs')).href);
  const catalogMod = await import(pathToFileURL(join(libDir, 'templateCatalog.mjs')).href);
  const market = await import(pathToFileURL(join(libDir, 'marketplace.mjs')).href);
  const dash = await import(pathToFileURL(join(libDir, 'creatorDashboard.mjs')).href);
  const settle = await import(pathToFileURL(join(libDir, 'settlement.mjs')).href);
  const remix = await import(pathToFileURL(join(libDir, 'templateRemix.mjs')).href);
  const wallet = await import(pathToFileURL(join(libDir, 'walletView.mjs')).href);
  const store = await import(pathToFileURL(join(libDir, 'ledgerStore.mjs')).href);
  const creditsStore = await import(pathToFileURL(join(libDir, 'creditsStore.mjs')).href);
  const refund = await import(pathToFileURL(join(libDir, 'refund.mjs')).href);
  const refundPolicy = await import(pathToFileURL(join(libDir, 'refundPolicy.mjs')).href);

  // Sanity: the real modules were imported, not re-implemented here.
  for (const [name, mod, fn] of [
    ['credits', credits, 'appendCreditEntry'],
    ['templateCatalog', catalogMod, 'addTemplate'],
    ['marketplace', market, 'purchaseTemplate'],
    ['creatorDashboard', dash, 'buildCreatorDashboard'],
    ['settlement', settle, 'statementFor'],
    ['templateRemix', remix, 'remixTemplateToProject'],
    ['walletView', wallet, 'buildWalletView'],
    ['ledgerStore', store, 'serializeLedger'],
    ['creditsStore', creditsStore, 'loadCredits'],
    ['refund', refund, 'refundPurchase'],
    ['refundPolicy', refundPolicy, 'refundPurchaseUnderPolicy'],
    ['refundPolicy', refundPolicy, 'refundEligibility'],
  ]) {
    assert.equal(typeof mod[fn], 'function', `${name}.${fn} was not imported — the module was not run`);
  }

  // ── §1 the credits ledger IS the record ───────────────────────────────────────────────────────────
  console.log('§1 the credits ledger IS the record');
  let ledger = credits.emptyCreditLedger();
  assert.equal(ledger.entries.length, 0, 'the empty ledger is not empty');
  const a1 = credits.appendCreditEntry(ledger, { id: 'e1', accountId: 'buyerB', delta: 1000, reason: 'top-up', at: 100, kind: 'grant' });
  assert.equal(a1.ok, true, `top-up refused: ${a1.reason}`);
  ledger = a1.ledger;
  assert.equal(credits.balanceOf(ledger, 'buyerB'), 1000, 'the balance does not derive from the entry');
  const retry = credits.appendCreditEntry(ledger, { id: 'e1', accountId: 'buyerB', delta: 1000, reason: 'retry', at: 101, kind: 'grant' });
  assert.equal(retry.ok, false, 'a reused idempotency key was accepted');
  assert.match(retry.reason, /already in this ledger/);
  const overdraw = credits.appendCreditEntry(ledger, { id: 'e2', accountId: 'buyerB', delta: -2000, reason: 'overdraw', at: 102, kind: 'spend' });
  assert.equal(overdraw.ok, false, 'a spend below zero was accepted');
  assert.match(overdraw.reason, /below zero/);
  const frac = credits.appendCreditEntry(ledger, { id: 'e3', accountId: 'buyerB', delta: 1.5, reason: 'fractional', at: 103, kind: 'grant' });
  assert.equal(frac.ok, false, 'a fractional delta was accepted');
  assert.match(frac.reason, /whole number/);
  assert.equal(credits.validateCreditLedger(ledger).ok, true, 'a well-formed ledger was refused');
  const tampered = { entries: [{ id: 'x', accountId: 'a', delta: -10, reason: 'tampered', at: 1, kind: 'spend' }] };
  const bad = credits.validateCreditLedger(tampered);
  assert.equal(bad.ok, false, 'a ledger that dips negative was accepted');
  assert.ok(bad.problems.some((p) => p.code === 'negative-balance'), 'the validator did not name the negative prefix');
  const badAt = credits.validateCreditLedger({ entries: [{ id: 'y', accountId: 'a', delta: 5, reason: 'ok', at: Number.NaN, kind: 'grant' }] });
  assert.equal(badAt.ok, false, 'a ledger with a non-finite `at` was accepted');
  assert.ok(badAt.problems.some((p) => p.code === 'bad-at'), 'the validator did not name a non-finite `at`');
  console.log(`  balance derives to ${credits.balanceOf(ledger, 'buyerB')}; retry/overdraw/fractional refused by name; tampered ledger named (${bad.problems.length} problem(s)); non-finite \`at\` named`);

  // ── §2 the catalog is the inventory ──────────────────────────────────────────────────────────────
  console.log('§2 the catalog is the inventory');
  const FREE = { id: 'tpl-free', title: 'Starter', description: 'A free starter', authorId: 'authorA', priceCents: 0, category: 'landing', tags: ['free'], documentId: 'doc-free', createdAt: 1000 };
  const PAID = { id: 'tpl-paid', title: 'Pro Dashboard', description: 'A pro dashboard', authorId: 'authorA', priceCents: 500, category: 'dashboard', tags: ['pro'], documentId: 'doc-paid', createdAt: 2000 };
  const PAID2 = { id: 'tpl-paid2', title: 'Mobile Kit', description: 'A mobile kit', authorId: 'authorB', priceCents: 200, category: 'mobile', tags: ['mobile'], documentId: 'doc-paid2', createdAt: 3000 };
  let catalog = catalogMod.emptyTemplateCatalog();
  for (const listing of [FREE, PAID, PAID2]) {
    const added = catalogMod.addTemplate(catalog, listing);
    assert.equal(added.ok, true, `listing refused: ${added.reason}`);
    catalog = added.catalog;
  }
  assert.equal(catalog.listings.length, 3, 'the catalog did not hold all three listings');
  const dup = catalogMod.addTemplate(catalog, PAID);
  assert.equal(dup.ok, false, 'a duplicate listing id was accepted');
  assert.match(dup.reason, /already listed/);
  const hit = catalogMod.searchTemplates(catalog, 'pro dashboard');
  assert.ok(hit.length >= 1 && hit.some((h) => h.listing.id === 'tpl-paid'), 'exact-token search missed the listing');
  assert.equal(catalogMod.searchTemplates(catalog, 'quantum').length, 0, 'a query that matches nothing must answer nothing');
  // A Chinese query must TOKENIZE. The old `[^a-z0-9]` split deleted every CJK character, so the
  // catalog could not be searched in Chinese at all — measured here rather than assumed.
  assert.deepEqual(catalogMod.queryTokens('仪表盘 SaaS'), ['仪表盘', 'saas'], 'the tokenizer deleted non-Latin text');
  assert.deepEqual(catalogMod.queryTokens('图'), ['图'], 'a single CJK character was dropped');
  const byPrice = catalogMod.sortByPriceAsc(catalog).map((l) => l.id);
  assert.deepEqual(byPrice, ['tpl-free', 'tpl-paid2', 'tpl-paid'], 'the price sort is not ascending');
  console.log(`  ${catalog.listings.length} listings; duplicate refused; search('pro dashboard') -> ${hit.length}; search('quantum') -> 0; a CJK query tokenizes; price order ${byPrice.join(' < ')}`);

  // ── §3 the marketplace is atomic ────────────────────────────────────────────────────────────────
  console.log('§3 the marketplace is atomic');
  let mledger = credits.emptyCreditLedger();
  const g1 = credits.appendCreditEntry(mledger, { id: 'g1', accountId: 'buyerB', delta: 1000, reason: 'top-up', at: 100, kind: 'grant' });
  assert.equal(g1.ok, true, g1.reason);
  mledger = g1.ledger;
  const buy = market.purchaseTemplate(catalog, mledger, { templateId: 'tpl-paid', buyerId: 'buyerB', entryId: 'buy1', at: 200 });
  assert.equal(buy.ok, true, `purchase refused: ${buy.reason}`);
  assert.equal(buy.buyerEntry.delta, -500, 'the buyer was not debited the price');
  assert.equal(buy.authorEntry.delta, 500, 'the author was not credited the price');
  assert.equal(buy.buyerEntry.ref, 'tpl-paid', 'the buyer entry does not name the template');
  assert.equal(buy.authorEntry.ref, 'tpl-paid', 'the author entry does not name the template');
  assert.equal(credits.balanceOf(buy.ledger, 'buyerB'), 500);
  assert.equal(credits.balanceOf(buy.ledger, 'authorA'), 500);
  // Atomicity, measured: reuse the idempotency key for a DIFFERENT listing. The debit is refused, so
  // the author must NOT be credited — a half-purchase would show up as authorB holding 200 here.
  const atomic = market.purchaseTemplate(catalog, buy.ledger, { templateId: 'tpl-paid2', buyerId: 'buyerB', entryId: 'buy1', at: 300 });
  assert.equal(atomic.ok, false, 'a purchase reusing an entry id was accepted');
  assert.equal(credits.balanceOf(buy.ledger, 'authorB'), 0, 'a refused purchase credited the author');
  assert.equal(credits.balanceOf(buy.ledger, 'buyerB'), 500, 'a refused purchase debited the buyer');
  const poorLedger = credits.appendCreditEntry(credits.emptyCreditLedger(), { id: 'p1', accountId: 'poorC', delta: 100, reason: 'top-up', at: 100, kind: 'grant' }).ledger;
  const poorBuy = market.purchaseTemplate(catalog, poorLedger, { templateId: 'tpl-paid', buyerId: 'poorC', entryId: 'p1', at: 200 });
  assert.equal(poorBuy.ok, false, 'an unaffordable purchase was accepted');
  assert.match(poorBuy.reason, /not affordable/);
  const self = market.purchaseTemplate(catalog, buy.ledger, { templateId: 'tpl-paid', buyerId: 'authorA', entryId: 's1', at: 400 });
  assert.equal(self.ok, false, 'an author bought their own listing');
  assert.match(self.reason, /already holds it/);
  const freeBuy = market.purchaseTemplate(catalog, buy.ledger, { templateId: 'tpl-free', buyerId: 'buyerB', entryId: 'f1', at: 500 });
  assert.equal(freeBuy.ok, false, 'a free template was sold');
  assert.match(freeBuy.reason, /free/);
  console.log(`  purchase moved buyerB -500 / authorA +500; reused-key purchase refused whole (authorB still 0); unaffordable/self/free refused by name`);

  // ── §4 the dashboard and the statement reconcile ────────────────────────────────────────────────
  console.log('§4 the dashboard and the statement reconcile');
  let real = credits.emptyCreditLedger();
  real = credits.appendCreditEntry(real, { id: 'r1', accountId: 'buyerB', delta: 1000, reason: 'top-up', at: 100, kind: 'grant' }).ledger;
  real = credits.appendCreditEntry(real, { id: 'r2', accountId: 'authorA', delta: 100, reason: 'tip', at: 110, kind: 'grant' }).ledger;
  const b1 = market.purchaseTemplate(catalog, real, { templateId: 'tpl-paid', buyerId: 'buyerB', entryId: 'r3', at: 200 });
  assert.equal(b1.ok, true, b1.reason);
  real = b1.ledger;
  const b2 = market.purchaseTemplate(catalog, real, { templateId: 'tpl-paid2', buyerId: 'buyerB', entryId: 'r4', at: 300 });
  assert.equal(b2.ok, true, b2.reason);
  real = b2.ledger;
  for (const who of ['buyerB', 'authorA', 'authorB']) {
    const d = dash.buildCreatorDashboard(catalog, real, who);
    assert.equal(d.earned - d.spent + d.refunded - d.clawedBack, d.balance, `the dashboard does not reconcile for ${who}`);
  }
  const buyerDash = dash.buildCreatorDashboard(catalog, real, 'buyerB');
  assert.equal(buyerDash.balance, 300, 'buyerB balance');
  assert.equal(buyerDash.earned, 1000, 'buyerB earned');
  assert.equal(buyerDash.spent, 700, 'buyerB spent');
  assert.equal(buyerDash.movements, 3, 'buyerB movements');
  assert.equal(buyerDash.referenced.length, 2, 'buyerB referenced movements');
  const st = settle.statementFor(real, 'buyerB', { from: 0, to: 250 });
  assert.equal(st.opening, 0, 'opening');
  assert.equal(st.earned, 1000, 'earned in window');
  assert.equal(st.spent, 500, 'spent in window');
  assert.equal(st.closing, 500, 'closing');
  assert.equal(st.after, -200, 'the entry after the window was not carried in `after`');
  assert.equal(settle.statementReconciles(real, st), true, 'the bounded statement does not reconcile');
  const all = settle.statementFor(real, 'buyerB');
  assert.equal(all.after, 0, 'an unbounded window carries an `after`');
  assert.equal(all.closing, credits.balanceOf(real, 'buyerB'), 'an unbounded closing is not the balance');
  assert.equal(settle.statementReconciles(real, all), true, 'the unbounded statement does not reconcile');
  const attr = settle.attributionByRef(real, 'authorA');
  assert.deepEqual(attr, [{ ref: 'tpl-paid', earned: 500, spent: 0, refunded: 0, clawedBack: 0, net: 500, count: 1 }], 'attribution by ref is wrong');
  // v535: a sale and its FULL reversal net to zero, and the row still says what happened — the two
  // histories must not collapse into "never sold".
  const buyerAttr = settle.attributionByRef(real, 'buyerB');
  assert.deepEqual(buyerAttr, [
    { ref: 'tpl-paid2', earned: 0, spent: 200, refunded: 0, clawedBack: 0, net: -200, count: 1 },
    { ref: 'tpl-paid', earned: 0, spent: 500, refunded: 0, clawedBack: 0, net: -500, count: 1 },
  ], 'the buyer attribution does not name each purchase');
  let rev = credits.emptyCreditLedger();
  for (const e of [
    { id: 'sale-rev', accountId: 'authorA', delta: 300, reason: 'sale', at: 10, kind: 'grant', ref: 'tpl-rev' },
    { id: 'back-rev', accountId: 'authorA', delta: -300, reason: 'refund claw-back', at: 20, kind: 'clawback', ref: 'tpl-rev' },
  ]) {
    const d = credits.appendCreditEntry(rev, e);
    assert.equal(d.ok, true, d.reason);
    rev = d.ledger;
  }
  const revRow = settle.attributionByRef(rev, 'authorA');
  assert.deepEqual(revRow, [{ ref: 'tpl-rev', earned: 300, spent: 0, refunded: 0, clawedBack: 300, net: 0, count: 2 }], 'a sold-then-refunded listing lost its history');
  const revSum = rev.entries.reduce((sum, e) => sum + e.delta, 0);
  assert.equal(revRow[0].net, revSum, 'the buckets and the raw deltas disagree');
  console.log(`  buyerB 1000 earned / 700 spent / 300 balance; the dashboard identity is earned − spent + refunded − clawedBack; window 0..250 -> closing 500, after -200, reconciles; authorA attribution ${JSON.stringify(attr)}; a sold-then-clawed-back ref stays named ${JSON.stringify(revRow[0])}`);

  // ── §5 the remix handoff forks a NEW document ───────────────────────────────────────────────────
  console.log('§5 the remix handoff forks a NEW document');
  const sourceDoc = { id: 'doc-source', rootId: 'n1', name: 'Pro Dashboard', nodes: { n1: { id: 'n1', type: 'page' } } };
  assert.deepEqual(remix.remixRightFor(catalog, real, 'stranger', 'tpl-free'), { ok: true, basis: 'free' }, 'a free template is not open to anyone');
  assert.equal(remix.remixRightFor(catalog, real, 'stranger', 'tpl-paid').ok, false, 'a paid template was remixable by a stranger');
  assert.deepEqual(remix.remixRightFor(catalog, real, 'buyerB', 'tpl-paid'), { ok: true, basis: 'owned' }, 'the buyer does not own what they bought');
  assert.deepEqual(remix.remixRightFor(catalog, real, 'authorA', 'tpl-paid'), { ok: true, basis: 'owned' }, 'the author does not own their own listing');
  const forked = remix.remixTemplateToProject(sourceDoc, catalog, real, 'buyerB', 'tpl-paid', 'My Remix');
  assert.equal(forked.ok, true, forked.reason);
  assert.notEqual(forked.document.id, sourceDoc.id, 'the fork kept the source document id');
  assert.equal(forked.document.name, 'My Remix', 'the explicit name was not honoured');
  assert.equal(sourceDoc.id, 'doc-source', 'the source document was mutated');
  assert.equal(forked.basis, 'owned');
  const malformed = { id: 'doc-bad', rootId: 'missing', name: 'Bad', nodes: {} };
  const badRemix = remix.remixTemplateToProject(malformed, catalog, real, 'buyerB', 'tpl-paid');
  assert.equal(badRemix.ok, false, 'a malformed source was forked');
  assert.match(badRemix.reason, /could not be forked/);
  console.log(`  free -> anyone; paid -> owner only; fork id ${sourceDoc.id} -> ${forked.document.id}; malformed source refused by name`);

  // ── §6 the wallet view is derived ───────────────────────────────────────────────────────────────
  console.log('§6 the wallet view is derived');
  const wv = wallet.buildWalletView(catalog, real, 'buyerB');
  assert.equal(wv.balanceCents, 300, 'wallet balance');
  assert.deepEqual([...wv.ownedTemplateIds].sort(), ['tpl-paid', 'tpl-paid2'], 'wallet ownership');
  assert.deepEqual([...wv.affordableTemplateIds].sort(), ['tpl-paid2'], 'wallet affordability');
  assert.equal(wv.catalogSize, 3, 'wallet catalog size');
  assert.equal(wallet.walletOwns(wv, 'tpl-paid'), true);
  assert.equal(wallet.walletCanAfford(wv, 'tpl-paid2'), true);
  assert.equal(wallet.walletCanAfford(wv, 'tpl-paid'), false);
  const authorWv = wallet.buildWalletView(catalog, real, 'authorA');
  assert.deepEqual([...authorWv.ownedTemplateIds].sort(), ['tpl-free', 'tpl-paid'], 'the author does not own their listings');
  assert.deepEqual([...authorWv.affordableTemplateIds].sort(), ['tpl-paid2'], 'the author affordability');
  let refundLedger = credits.emptyCreditLedger();
  refundLedger = credits.appendCreditEntry(refundLedger, { id: 'x1', accountId: 'buyerB', delta: 1000, reason: 'top-up', at: 1, kind: 'grant' }).ledger;
  refundLedger = credits.appendCreditEntry(refundLedger, { id: 'x2', accountId: 'buyerB', delta: 200, reason: 'refund', at: 2, kind: 'refund', ref: 'tpl-paid2' }).ledger;
  assert.deepEqual(wallet.buildWalletView(catalog, refundLedger, 'buyerB').ownedTemplateIds, [], 'a refund granted ownership');
  // The ledger is shared: a subscription spend carries a PLAN id in `ref`, which is not a template.
  let subLedger = credits.emptyCreditLedger();
  subLedger = credits.appendCreditEntry(subLedger, { id: 'u1', accountId: 'buyerB', delta: 1000, reason: 'top-up', at: 1, kind: 'grant' }).ledger;
  subLedger = credits.appendCreditEntry(subLedger, { id: 'u2', accountId: 'buyerB', delta: -300, reason: 'subscription "pro"', at: 2, kind: 'spend', ref: 'plan-pro' }).ledger;
  assert.deepEqual(wallet.buildWalletView(catalog, subLedger, 'buyerB').ownedTemplateIds, [], 'a subscription spend was reported as template ownership');
  console.log(`  buyerB owns ${wv.ownedTemplateIds.join(', ')}; affordable ${wv.affordableTemplateIds.join(', ')}; authorA owns ${authorWv.ownedTemplateIds.join(', ')}; a refund and a non-template ref are not ownership`);

  // ── §7 the wire format round-trips and refuses a bad record ─────────────────────────────────────
  console.log('§7 the ledger wire format round-trips and refuses a bad record');
  const wire = store.serializeLedger(real);
  const reloaded = store.deserializeLedger(wire);
  assert.equal(reloaded.ok, true, `a valid ledger was refused: ${reloaded.reason}`);
  assert.deepEqual(reloaded.ledger.entries, real.entries, 'the round-trip changed the entries');
  assert.equal(store.serializeLedger(reloaded.ledger), wire, 'serialization is not deterministic');
  const badVersion = store.deserializeLedger(JSON.stringify({ version: store.LEDGER_FORMAT_VERSION + 1, entries: [] }));
  assert.equal(badVersion.ok, false, 'a future format version was accepted');
  assert.match(badVersion.reason, /unsupported ledger format version/);
  const dippedWire = JSON.stringify({ version: store.LEDGER_FORMAT_VERSION, entries: [
    { id: 'a', accountId: 'acc-1', delta: 50, reason: 'grant', at: 1, kind: 'grant' },
    { id: 'b', accountId: 'acc-1', delta: -100, reason: 'spend', at: 2, kind: 'spend' },
  ] });
  const dipped = store.deserializeLedger(dippedWire);
  assert.equal(dipped.ok, false, 'a ledger that dips negative was loaded');
  assert.match(dipped.reason, /not consistent/);
  console.log(`  ${real.entries.length} entries round-trip byte-identically; a future version and a negative prefix are refused by name`);

  // ── §8 the local-first store distinguishes absence from corruption ──────────────────────────────
  console.log('§8 the local-first store distinguishes an absent key from a corrupt one');
  const mem = new Map();
  const kv = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, v); } };
  const emptyLoad = creditsStore.loadCredits(kv);
  assert.equal(emptyLoad.ok, true, 'an absent key was treated as an error');
  assert.equal(emptyLoad.source, 'empty');
  const saved = creditsStore.saveCredits(kv, real);
  assert.equal(saved.ok, true, `a valid ledger was refused by save: ${saved.reason}`);
  const storedLoad = creditsStore.loadCredits(kv);
  assert.equal(storedLoad.ok, true, `the saved ledger did not load: ${storedLoad.reason}`);
  assert.equal(storedLoad.source, 'stored');
  assert.deepEqual(storedLoad.ledger.entries, real.entries, 'the store changed the entries');
  mem.set(creditsStore.CREDITS_STORAGE_KEY, '{not json');
  const corruptLoad = creditsStore.loadCredits(kv);
  assert.equal(corruptLoad.ok, false, 'a corrupt record was silently emptied');
  assert.match(corruptLoad.reason, /not JSON/);
  console.log(`  absent -> empty; ${real.entries.length} entries saved (${saved.bytes} bytes) and reloaded; a corrupt record is refused, not emptied`);

  // ── §9 a refund is atomic and reverses ownership ────────────────────────────────────────────────
  console.log('§9 a refund is atomic and reverses ownership');
  let refundable = credits.emptyCreditLedger();
  refundable = credits.appendCreditEntry(refundable, { id: 'rg1', accountId: 'buyerB', delta: 1000, reason: 'top-up', at: 1, kind: 'grant' }).ledger;
  refundable = credits.appendCreditEntry(refundable, { id: 'rg2', accountId: 'authorA', delta: 100, reason: 'tip', at: 2, kind: 'grant' }).ledger;
  const boughtForRefund = market.purchaseTemplate(catalog, refundable, { templateId: 'tpl-paid', buyerId: 'buyerB', entryId: 'rg3', at: 3 });
  assert.equal(boughtForRefund.ok, true, boughtForRefund.reason);
  refundable = boughtForRefund.ledger;
  assert.equal(wallet.walletOwns(wallet.buildWalletView(catalog, refundable, 'buyerB'), 'tpl-paid'), true, 'the buyer does not own what they bought');
  // v533: instants are HOST-SUPPLIED, so the mechanism refuses a history that cannot have happened —
  // a reversal dated before the movement it reverses. The purchase was recorded at 3; this asks for 2.
  const earlyRefund = refund.refundPurchase(catalog, refundable, { templateId: 'tpl-paid', buyerId: 'buyerB', entryId: 'rr-early', at: 2 });
  assert.equal(earlyRefund.ok, false, 'a refund was dated before the purchase it reverses');
  assert.match(earlyRefund.reason, /before the purchase it reverses/);
  assert.equal(refundable.entries.length, boughtForRefund.ledger.entries.length, 'a refused early refund moved the ledger');
  const refunded = refund.refundPurchase(catalog, refundable, { templateId: 'tpl-paid', buyerId: 'buyerB', entryId: 'rr1', at: 4 });
  assert.equal(refunded.ok, true, `the refund was refused: ${refunded.reason}`);
  assert.equal(refunded.priceCents, 500, 'the refund did not use the recorded price');
  assert.equal(credits.balanceOf(refunded.ledger, 'buyerB'), 1000, 'the buyer was not made whole');
  assert.equal(credits.balanceOf(refunded.ledger, 'authorA'), 100, 'the author was not clawed back');
  assert.equal(refunded.authorEntry.kind, 'clawback', 'the seller side of a refund is not a clawback');
  // The claw-back is NOT a purchase: the author earned the sale and neither spent nor lost an earned
  // figure — the reversal is reported under its own name by both projections.
  const authorAfterRefund = dash.buildCreatorDashboard(catalog, refunded.ledger, 'authorA');
  assert.equal(authorAfterRefund.earned, 600, 'the claw-back un-earned what the author earned');
  assert.equal(authorAfterRefund.spent, 0, 'the claw-back was reported as the author spending');
  assert.equal(authorAfterRefund.clawedBack, 500, 'the dashboard did not report the claw-back');
  const authorStatement = settle.statementFor(refunded.ledger, 'authorA');
  assert.equal(authorStatement.spent, 0, 'the statement called the claw-back spending');
  assert.equal(authorStatement.clawedBack, 500, 'the statement did not report the claw-back');
  assert.equal(settle.statementReconciles(refunded.ledger, authorStatement), true, 'the author statement does not reconcile');
  const buyerAfterRefund = dash.buildCreatorDashboard(catalog, refunded.ledger, 'buyerB');
  assert.equal(buyerAfterRefund.earned, 1000, 'the refund was counted as income');
  assert.equal(buyerAfterRefund.refunded, 500, 'the dashboard did not report the refund');
  const buyerStatement = settle.statementFor(refunded.ledger, 'buyerB');
  assert.equal(buyerStatement.earned, 1000, 'the statement counted the refund as income');
  assert.equal(buyerStatement.refunded, 500, 'the statement did not report the refund');
  assert.equal(settle.statementReconciles(refunded.ledger, buyerStatement), true, 'the buyer statement does not reconcile');
  assert.equal(wallet.walletOwns(wallet.buildWalletView(catalog, refunded.ledger, 'buyerB'), 'tpl-paid'), false, 'a refunded purchase still counts as ownership');
  assert.equal(remix.remixRightFor(catalog, refunded.ledger, 'buyerB', 'tpl-paid').ok, false, 'a refunded purchase still grants the remix right');
  const twice = refund.refundPurchase(catalog, refunded.ledger, { templateId: 'tpl-paid', buyerId: 'buyerB', entryId: 'rr2', at: 5 });
  assert.equal(twice.ok, false, 'a purchase was refunded twice');
  assert.match(twice.reason, /already been refunded/);
  // A RE-PURCHASE is refundable again: refunds pair with purchases, not with the ref.
  const rebought = market.purchaseTemplate(catalog, refunded.ledger, { templateId: 'tpl-paid', buyerId: 'buyerB', entryId: 'rg4', at: 6 });
  assert.equal(rebought.ok, true, rebought.reason);
  const refundedAgain = refund.refundPurchase(catalog, rebought.ledger, { templateId: 'tpl-paid', buyerId: 'buyerB', entryId: 'rr3', at: 7 });
  assert.equal(refundedAgain.ok, true, `a re-purchase could not be refunded: ${refundedAgain.reason}`);
  assert.equal(credits.balanceOf(refundedAgain.ledger, 'buyerB'), 1000, 'the second cycle did not make the buyer whole');
  assert.equal(credits.balanceOf(refundedAgain.ledger, 'authorA'), 100, 'the second cycle did not claw back');
  console.log(`  refund returned ${refunded.priceCents} to the buyer and clawed it back from the author; the seller side is a CLAWBACK (not a purchase, not ownership); the dashboard reports refunded 500 / clawed back 500 apart from earned/spent, and both statements reconcile; ownership and the remix right are released; a second refund is refused; a RE-PURCHASE is refundable again; a refund dated BEFORE the purchase it reverses (2 vs 3) was refused by name and moved nothing`);

  // ── §10 a refund POLICY is the host's declaration ───────────────────────────────────────────────
  console.log("§10 a refund policy is the host's declaration, applied before the mechanism");
  let policyLedger = credits.emptyCreditLedger();
  policyLedger = credits.appendCreditEntry(policyLedger, { id: 'pg1', accountId: 'buyerC', delta: 1000, reason: 'top-up', at: 1, kind: 'grant' }).ledger;
  policyLedger = credits.appendCreditEntry(policyLedger, { id: 'pg2', accountId: 'authorA', delta: 1000, reason: 'top-up', at: 1, kind: 'grant' }).ledger;
  const policyBuy = market.purchaseTemplate(catalog, policyLedger, { templateId: 'tpl-paid', buyerId: 'buyerC', entryId: 'pg3', at: 2 });
  assert.equal(policyBuy.ok, true, policyBuy.reason);
  policyLedger = policyBuy.ledger;

  assert.equal(refundPolicy.describeRefundPolicy(refundPolicy.NO_REFUND_DEADLINE), 'no deadline', 'a declared no-deadline policy was not named');
  assert.match(refundPolicy.refundPolicyProblem({}), /windowMs/, 'a policy that never declared a window was read as "no deadline"');

  const beforePolicy = policyLedger.entries.length;

  // v533: the window bounds how LATE a refund may be; the ordering rule bounds how EARLY. An ask at
  // instant 1 (the purchase is at 2) must be refused as an ASK — the preflight and the write alike.
  const earlyAsk = refundPolicy.refundEligibility(
    catalog, policyLedger, { templateId: 'tpl-paid', buyerId: 'buyerC' }, refundPolicy.NO_REFUND_DEADLINE, 1,
  );
  assert.equal(earlyAsk.eligible, false, 'the preflight offered a refund before the purchase existed');
  assert.match(earlyAsk.reason, /before the purchase it reverses/, 'the early ask was not refused by the ordering rule');
  assert.doesNotMatch(earlyAsk.reason, /refund window/, 'the ordering refusal came back in the window\'s words');
  const earlyAskWrite = refundPolicy.refundPurchaseUnderPolicy(
    catalog, policyLedger, { templateId: 'tpl-paid', buyerId: 'buyerC', entryId: 'pr-early', at: 5 }, refundPolicy.NO_REFUND_DEADLINE, 1,
  );
  assert.equal(earlyAskWrite.ok, false, 'a policy write was allowed before the purchase existed');
  assert.equal(policyLedger.entries.length, beforePolicy, 'an early ask moved the ledger');

  const late = refundPolicy.refundPurchaseUnderPolicy(
    catalog, policyLedger, { templateId: 'tpl-paid', buyerId: 'buyerC', entryId: 'pr-late', at: 13 }, { windowMs: 10 }, 13,
  );
  assert.equal(late.ok, false, 'a closed window allowed the refund');
  assert.match(late.reason, /refund window/);
  assert.match(late.reason, /closed 1 ms ago/);
  assert.equal(policyLedger.entries.length, beforePolicy, 'a refused policy ask moved the ledger');
  assert.equal(credits.balanceOf(policyLedger, 'buyerC'), 500, 'a refused policy ask changed the buyer balance');

  const atEdge = refundPolicy.refundPurchaseUnderPolicy(
    catalog, policyLedger, { templateId: 'tpl-paid', buyerId: 'buyerC', entryId: 'pr-edge', at: 12 }, { windowMs: 10 }, 12,
  );
  assert.equal(atEdge.ok, true, `the closing instant was treated as outside the window: ${atEdge.reason}`);
  assert.equal(atEdge.priceCents, 500, 'the policy path lost the recorded price');

  // The PREFLIGHT: the same gate, answered without writing. A surface can disable the action instead
  // of discovering the refusal on click, and both answers must agree.
  const eligible = refundPolicy.refundEligibility(catalog, policyLedger, { templateId: 'tpl-paid', buyerId: 'buyerC' }, { windowMs: 10 }, 12);
  assert.equal(eligible.eligible, true, 'a refund inside the window was not reported eligible');
  assert.equal(eligible.purchaseAt, 2, 'the preflight lost the purchase instant it measured');
  assert.equal(eligible.closesAt, 12, 'the preflight did not compute the closing instant');
  assert.equal(eligible.priceCents, 500, 'the preflight lost the recorded price');
  const ineligible = refundPolicy.refundEligibility(catalog, policyLedger, { templateId: 'tpl-paid', buyerId: 'buyerC' }, { windowMs: 10 }, 13);
  assert.equal(ineligible.eligible, false, 'a closed window was reported eligible');
  assert.match(ineligible.reason, /refund window/, 'the preflight did not name the closed window');
  const noPurchaseInPreflight = refundPolicy.refundEligibility(catalog, policyLedger, { templateId: 'tpl-paid', buyerId: 'buyerZ' }, { windowMs: 0 }, 99);
  assert.equal(noPurchaseInPreflight.eligible, false, 'a preflight resurrected a purchase nobody made');
  assert.match(noPurchaseInPreflight.reason, /holds no purchase/, 'the preflight did not defer to the mechanism');
  assert.equal(policyLedger.entries.length, beforePolicy, 'the preflight moved the ledger');

  const noDeadline = refundPolicy.refundPurchaseUnderPolicy(
    catalog, policyLedger, { templateId: 'tpl-paid', buyerId: 'buyerC', entryId: 'pr-never', at: 1_700_000_000_000 },
    refundPolicy.NO_REFUND_DEADLINE, 1_700_000_000_000,
  );
  assert.equal(noDeadline.ok, true, `a declared no-deadline policy refused a refund: ${noDeadline.reason}`);

  const neverBought = refundPolicy.refundPurchaseUnderPolicy(
    catalog, policyLedger, { templateId: 'tpl-paid', buyerId: 'buyerZ', entryId: 'pr-zero', at: 99 }, { windowMs: 0 }, 99,
  );
  assert.equal(neverBought.ok, false, 'a policy resurrected a purchase nobody made');
  assert.match(neverBought.reason, /holds no purchase/, 'a structural refusal did not come back in the mechanism\'s words');
  assert.doesNotMatch(neverBought.reason, /refund window/, 'the policy answered a question that belongs to the mechanism');

  const broken = refundPolicy.refundPurchaseUnderPolicy(
    catalog, policyLedger, { templateId: 'tpl-paid', buyerId: 'buyerC', entryId: 'pr-broken', at: 99 }, {}, 99,
  );
  assert.equal(broken.ok, false, 'a policy with no windowMs was applied');
  assert.match(broken.reason, /windowMs/, 'a broken policy was not refused by name');

  console.log('  a 10 ms window refused the refund 1 ms past closing and moved NOTHING; it allowed one AT the closing instant; "no deadline" allowed it years later; a buyer with no purchase got the mechanism\'s sentence; a policy that never declared a window was refused by name; an ask at 1 (purchase at 2) was refused by the ORDERING rule in both readers and moved nothing; the PREFLIGHT reported the same gate (eligible at the edge with purchaseAt 2 / closesAt 12, refused past it, deferred on a missing purchase) without touching the ledger');
} finally {
  rmSync(box, { recursive: true, force: true });
}

// ── §11 HEAD is byte-identical ────────────────────────────────────────────────────────────────────
const after = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(after, head, 'the repository HEAD moved while the proof ran');
console.log(`§11 HEAD unchanged (${head.slice(0, 12)})`);
console.log('ALL SECTIONS PASSED');
