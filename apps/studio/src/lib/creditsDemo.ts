/**
 * M8 — a DETERMINISTIC demo scene for the credits surface, as a PURE fixture.
 *
 * <p>The credits surface (`components/CreditsPanel.tsx`) needs something to render, and this build has
 * no credits service (ADR 0018 blocks the monetization endpoints). Rather than invent money in the UI,
 * the fixture lives here, where it can be tested: every entry goes through the real appender, the one
 * purchase goes through the real marketplace, and every instant is a fixed constant (ADR 0010). The
 * scene is therefore VALID by the same rules the rest of the model enforces — a demo that broke a rule
 * would be caught by the suite rather than shown to a user.
 *
 * <p>What this is NOT: it is not data from a service, and it is not a claim that a user earned anything.
 * The surface says DEMO MODE on its own face, and `ledgerStore`/`creditsStore` treat whatever it saves
 * as an ordinary local ledger — because that is exactly what it is.
 */

import { appendCreditEntry, emptyCreditLedger, type CreditLedger } from './credits';
import { addTemplate, emptyTemplateCatalog, type TemplateCatalog, type TemplateListing } from './templateCatalog';
import { purchaseTemplate } from './marketplace';

/** Everything the demo surface renders, in one immutable value. */
export interface DemoCreditsScene {
  catalog: TemplateCatalog;
  ledger: CreditLedger;
  /** The buyer whose wallet the surface shows. */
  viewerId: string;
  /** The creator whose dashboard the surface shows. */
  creatorId: string;
}

const T0 = 1_700_000_000_000;

const LISTINGS: readonly TemplateListing[] = [
  {
    id: 'tpl-starter', title: 'Starter Landing', description: 'A hero, a value row and a call to action.',
    authorId: 'author-1', priceCents: 0, category: 'landing', tags: ['free', 'landing'], documentId: 'doc-starter', createdAt: T0,
  },
  {
    id: 'tpl-saas', title: 'SaaS Dashboard', description: 'A metrics dashboard with a collapsible sidebar.',
    authorId: 'author-1', priceCents: 500, category: 'dashboard', tags: ['saas', 'dashboard'], documentId: 'doc-saas', createdAt: T0 + 100_000,
  },
  {
    id: 'tpl-mobile', title: 'Mobile Kit', description: 'A three-step mobile onboarding flow.',
    authorId: 'author-2', priceCents: 200, category: 'mobile', tags: ['mobile'], documentId: 'doc-mobile', createdAt: T0 + 200_000,
  },
];

/**
 * Build the demo scene. Deterministic: the same listings, the same grants, the same one purchase, and
 * the same fixed instants on every call. A failure here is a broken fixture, so it THROWS rather than
 * silently producing a scene that is missing a listing or a movement.
 */
export function buildDemoCreditsScene(): DemoCreditsScene {
  let catalog = emptyTemplateCatalog();
  for (const listing of LISTINGS) {
    const added = addTemplate(catalog, listing);
    if (!added.ok) throw new Error(`demo scene: listing "${listing.id}" was refused: ${added.reason}`);
    catalog = added.catalog;
  }

  let ledger = emptyCreditLedger();
  const grant = (id: string, accountId: string, delta: number, at: number): void => {
    const res = appendCreditEntry(ledger, { id, accountId, delta, reason: 'DEMO top-up', at, kind: 'grant' });
    if (!res.ok) throw new Error(`demo scene: grant "${id}" was refused: ${res.reason}`);
    ledger = res.ledger;
  };
  grant('demo-grant-buyer', 'buyer-1', 1000, T0 + 300_000);
  grant('demo-grant-author', 'author-1', 100, T0 + 300_100);

  const bought = purchaseTemplate(catalog, ledger, {
    templateId: 'tpl-saas', buyerId: 'buyer-1', entryId: 'demo-buy-1', at: T0 + 400_000,
  });
  if (!bought.ok) throw new Error(`demo scene: the purchase was refused: ${bought.reason}`);
  ledger = bought.ledger;

  return { catalog, ledger, viewerId: 'buyer-1', creatorId: 'author-1' };
}
