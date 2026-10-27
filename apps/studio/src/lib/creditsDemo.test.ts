import { describe, expect, it } from 'vitest';

import { balanceOf, validateCreditLedger } from './credits';
import { buildCreatorDashboard } from './creatorDashboard';
import { buildDemoCreditsScene } from './creditsDemo';
import { buildWalletView } from './walletView';

describe('creditsDemo: the fixture obeys the model it demonstrates', () => {
  it('produces a ledger the validator accepts', () => {
    const scene = buildDemoCreditsScene();
    expect(validateCreditLedger(scene.ledger)).toEqual({ ok: true, problems: [] });
    expect(scene.catalog.listings).toHaveLength(3);
  });

  it('has the balances the purchase implies', () => {
    const scene = buildDemoCreditsScene();
    expect(balanceOf(scene.ledger, 'buyer-1')).toBe(500); // 1000 - 500
    expect(balanceOf(scene.ledger, 'author-1')).toBe(600); // 100 + 500
  });

  it('the buyer owns the template they bought, and can still afford another', () => {
    const scene = buildDemoCreditsScene();
    const view = buildWalletView(scene.catalog, scene.ledger, scene.viewerId);
    expect(view.balanceCents).toBe(500);
    expect(view.ownedTemplateIds).toEqual(['tpl-saas']);
    expect(view.affordableTemplateIds).toContain('tpl-mobile');
    expect(view.affordableTemplateIds).not.toContain('tpl-starter'); // free is cloned, not bought
  });

  it('both dashboards reconcile', () => {
    const scene = buildDemoCreditsScene();
    for (const who of [scene.viewerId, scene.creatorId]) {
      const d = buildCreatorDashboard(scene.catalog, scene.ledger, who);
      expect(d.earned - d.spent).toBe(d.balance);
    }
    const creator = buildCreatorDashboard(scene.catalog, scene.ledger, scene.creatorId);
    expect(creator.balance).toBe(600);
    expect(creator.myListings.map((l) => l.id).sort()).toEqual(['tpl-saas', 'tpl-starter']);
  });

  it('is deterministic: two builds produce the same entries', () => {
    const a = buildDemoCreditsScene();
    const b = buildDemoCreditsScene();
    expect(a.ledger.entries).toEqual(b.ledger.entries);
  });
});
