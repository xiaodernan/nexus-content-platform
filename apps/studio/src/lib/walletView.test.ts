import { describe, it, expect } from 'vitest';

import type { CreditLedger } from './credits';
import { addTemplate, emptyTemplateCatalog, type TemplateCatalog, type TemplateListing } from './templateCatalog';
import { buildWalletView, walletCanAfford, walletOwns } from './walletView';

const FREE: TemplateListing = {
  id: 'tpl-free', title: 'Starter', description: 'A free starter', authorId: 'authorA',
  priceCents: 0, category: 'landing', tags: ['free'], documentId: 'doc-free', createdAt: 1000,
};
const PAID: TemplateListing = {
  id: 'tpl-paid', title: 'Pro Dashboard', description: 'A pro dashboard', authorId: 'authorA',
  priceCents: 500, category: 'dashboard', tags: ['pro'], documentId: 'doc-paid', createdAt: 2000,
};
const PAID2: TemplateListing = {
  id: 'tpl-paid2', title: 'Mobile Kit', description: 'A mobile kit', authorId: 'authorB',
  priceCents: 200, category: 'mobile', tags: ['mobile'], documentId: 'doc-paid2', createdAt: 3000,
};

function catalog(): TemplateCatalog {
  let c = emptyTemplateCatalog();
  for (const l of [FREE, PAID, PAID2]) { const a = addTemplate(c, l); if (a.ok) c = a.catalog; }
  return c;
}

const ledgerOf = (entries: CreditLedger['entries']): CreditLedger => ({ entries });

describe('buildWalletView', () => {
  it('a viewer with no entries has a zero balance and an empty wallet', () => {
    const view = buildWalletView(catalog(), ledgerOf([]), 'stranger');
    expect(view.balanceCents).toBe(0);
    expect(view.ownedTemplateIds).toEqual([]);
    expect(view.affordableTemplateIds).toEqual([]);
    expect(view.catalogSize).toBe(3);
  });

  it('derives balance, ownership and affordability from the ledger + catalog', () => {
    const ledger = ledgerOf([
      { id: 'e-earn', accountId: 'buyerB', delta: 1000, reason: 'top-up', at: 1, kind: 'grant' },
    ]);
    const view = buildWalletView(catalog(), ledger, 'buyerB');
    expect(view.balanceCents).toBe(1000);
    expect(view.ownedTemplateIds).toEqual([]); // bought nothing, authored nothing
    // free is cloned not bought (excluded); both paid listings are within balance
    expect(view.affordableTemplateIds.sort()).toEqual(['tpl-paid', 'tpl-paid2']);
  });

  it('ownership comes from a spend entry whose ref names the template', () => {
    const ledger = ledgerOf([
      { id: 'e-earn', accountId: 'ownerB', delta: 1000, reason: 'top-up', at: 1, kind: 'grant' },
      { id: 'e-buy', accountId: 'ownerB', delta: -200, reason: 'template "Mobile Kit"', at: 2, kind: 'spend', ref: 'tpl-paid2' },
    ]);
    const view = buildWalletView(catalog(), ledger, 'ownerB');
    expect(view.ownedTemplateIds).toEqual(['tpl-paid2']);
    // still affordable to buy the other paid listing (and even a second copy of the owned one)
    expect(view.affordableTemplateIds.sort()).toEqual(['tpl-paid', 'tpl-paid2']);
  });

  it('the author owns their own listings even with no purchase entry', () => {
    const ledger = ledgerOf([
      { id: 'e-a', accountId: 'authorA', delta: 50, reason: 'tip received', at: 1, kind: 'grant' },
    ]);
    const view = buildWalletView(catalog(), ledger, 'authorA');
    expect(view.balanceCents).toBe(50);
    expect(view.ownedTemplateIds.sort()).toEqual(['tpl-free', 'tpl-paid']);
    // cannot buy their own, and cannot afford the other author's paid listing on 50 cents
    expect(view.affordableTemplateIds).toEqual([]);
  });

  it('only a SPEND entry grants ownership — a refund with the same ref does not', () => {
    const ledger = ledgerOf([
      { id: 'e-earn', accountId: 'ownerB', delta: 1000, reason: 'top-up', at: 1, kind: 'grant' },
      { id: 'e-refund', accountId: 'ownerB', delta: 200, reason: 'refund of "Mobile Kit"', at: 2, kind: 'refund', ref: 'tpl-paid2' },
    ]);
    const view = buildWalletView(catalog(), ledger, 'ownerB');
    expect(view.ownedTemplateIds).toEqual([]); // a refund is not ownership
    expect(view.affordableTemplateIds.sort()).toEqual(['tpl-paid', 'tpl-paid2']);
  });

  it('a spend entry with no ref never enters the owned set', () => {
    const ledger = ledgerOf([
      { id: 'e-noref', accountId: 'buyerB', delta: -500, reason: 'unnamed spend', at: 1, kind: 'spend' },
    ]);
    const view = buildWalletView(catalog(), ledger, 'buyerB');
    expect(view.ownedTemplateIds).toEqual([]);
    expect(view.affordableTemplateIds).toEqual([]); // spent below zero is impossible via marketplace, but the view reports the ledger as-is
  });
});

describe('wallet helpers', () => {
  it('walletOwns / walletCanAfford are named reads over the derived sets', () => {
    const ledger = ledgerOf([
      { id: 'e-earn', accountId: 'buyerB', delta: 1000, reason: 'top-up', at: 1, kind: 'grant' },
      { id: 'e-buy', accountId: 'buyerB', delta: -500, reason: 'template "Pro Dashboard"', at: 2, kind: 'spend', ref: 'tpl-paid' },
    ]);
    const view = buildWalletView(catalog(), ledger, 'buyerB');
    expect(walletOwns(view, 'tpl-paid')).toBe(true);
    expect(walletOwns(view, 'tpl-paid2')).toBe(false);
    expect(walletCanAfford(view, 'tpl-paid2')).toBe(true); // 500 balance >= 200
    expect(walletCanAfford(view, 'tpl-free')).toBe(false); // free is cloned, not bought
  });
});
