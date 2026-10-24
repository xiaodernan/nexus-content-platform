import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * M7 v506 (ADR 0016 amendment 499) — the SIGNED-IN half of the account face, graded by reading the source.
 *
 * The gap. v500–v505 graded every panel the Studio serves by rendering it: the align bar, the tabs, the
 * panel layer, the composers, the toolbar, the agent dock, the surfaces, the root. One branch of one panel
 * was left standing, and it is the branch a creator actually lives in — AccountPanel signed IN. The
 * account read happens in an effect (`useEffect` → `session.current()`), and effects do not run under
 * `renderToStaticMarkup`: the server snapshot answers with `null`, so the unsigned create-form is all a
 * render can ever reach. The harness cannot ask this question, so it is asked the way v132 asked the
 * instance panel — read the source, require the seam.
 *
 * The proof. Seven guards, each naming one thing a reader would otherwise have to take on trust: the
 * assurance row prints the record’s own assurance and hardcodes no badge of its own (ADR 0018 records
 * that a signed-in badge would be a lie in this build); the yuan price becomes cents in BOTH plan verbs
 * by the same arithmetic; the period is the closed set of three the service knows; the reprice control
 * carries the snapshot sentence where a creator reads it; a plan that costs nothing is refused BEFORE
 * the service lane is asked; every verb routes through `accountSession` with refusals surfacing
 * verbatim; and signing out clears the face and says so.
 */
describe('AccountPanel signed-in branch', () => {
  const source = readFileSync(new URL('./AccountPanel.tsx', import.meta.url), 'utf8');

  /**
   * Why the strip. This file is allowed to talk about the badge that does not exist — its own header
   * explains the absence in prose (v252). A guard on the raw source would then be satisfied by the very
   * comment that denies the badge, which is the one place the phrase is ALLOWED to appear. So the guards
   * below read the code with the comments removed: what the panel DRAWS, not what it says about what it
   * draws.
   */
  function codeOnly(): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  }

  it('prints the record’s own assurance and invents no signed-in badge', () => {
    // ADR 0018 records that a signed-in badge would be a lie in this build: what the record carries is
    // `unsigned-local`, and the panel shows exactly that, beside “this device only”. The assurance is
    // READ off the record — a hardcoded literal here would keep showing the same words in a future build
    // that finally has something to prove, which is precisely the lie the ADR is about.
    expect(codeOnly(), 'the assurance row renders the record’s own assurance verbatim').toContain(
      '{account.assurance} · this device only',
    );
    expect(codeOnly().toLowerCase(), 'no signed-in badge exists to draw — ADR 0018').not.toContain('signed in');
    expect(codeOnly(), 'the assurance is read, never hardcoded').not.toContain("'unsigned-local'");
  });

  it('converts the yuan price to cents in BOTH plan verbs, by the same arithmetic', () => {
    // v301: the price is typed in yuan and sent in cents, because a decimal amount is a thing a client
    // and a service can disagree about. Two verbs send a price (offer and reprice), and a guard that
    // found only ONE conversion would pass a file where the second verb sent yuan where cents were
    // owed — a plan a hundred times cheaper than the creator typed, with nothing to notice it.
    const conversions = codeOnly().match(/Math\.round\(Number\(planPrice\) \* 100\)/g) ?? [];
    expect(conversions.length, 'offer AND reprice both convert yuan to cents').toBe(2);
    expect(codeOnly(), 'the price field is labelled in yuan, so the creator types what they mean').toContain('¥');
    expect(codeOnly(), 'the offer verb sends cents').toContain('offerPlan(planId.trim(), cents');
    expect(codeOnly(), 'the reprice verb sends cents').toContain('repricePlan(planId.trim(), cents');
  });

  it('offers the closed set of three periods the service knows', () => {
    // The period is not free text: it is one of the three the service knows. A fourth option, a renamed
    // value or a typo is a plan the lane cannot price, and nothing on this side of the wire would say so.
    for (const period of ['once', 'month', 'year']) {
      expect(codeOnly(), `the ${period} period is offered`).toContain(`value="${period}"`);
    }
    expect(codeOnly().match(/<option/g)?.length, 'exactly three — the closed set, not an open field').toBe(3);
    expect(codeOnly(), 'the select is the one the plan verbs read').toContain('data-plan-period-select');
  });

  it('carries the snapshot sentence on the reprice control and in its answer', () => {
    // v317: changing the price of a plan does not move the subscriptions already made — they keep the
    // price they were agreed at, which is the whole point of a price snapshot and the moment it earns
    // its keep. So the sentence is not left in a comment: it rides on the button a creator reads BEFORE
    // clicking, and on the answer that comes back after.
    expect(codeOnly(), 'the reprice button states the snapshot rule before it is clicked').toContain(
      'title="change the price of a plan you offer (the subscriptions already made keep the price they were agreed at)"',
    );
    expect(codeOnly(), 'and the answer repeats it, quoting the new price in cents').toContain(
      'is now ${cents} cents (${planPeriod}) — the subscriptions already made keep the price they were agreed at',
    );
    expect(codeOnly(), 'the offer verb answers with its own sentence, not the reprice one').toContain(
      'offered ${planId.trim()} at ${cents} cents (${planPeriod})',
    );
  });

  it('refuses a plan that costs nothing before the service lane is asked', () => {
    // A plan priced at zero — or at nonsense — is refused locally. The price is checked BEFORE the claim
    // is built and the lane is called, so a creator who clears the field is not charged a service
    // round-trip to be told what could have been told for free. This is an ORDER guard: the refusal must
    // appear before the first `claimOf(` in the file, which is the reprice verb’s own lane ask.
    const code = codeOnly();
    expect(code.indexOf('a plan must cost more than nothing'), 'the refusal exists').toBeGreaterThanOrEqual(0);
    expect(
      code.indexOf('a plan must cost more than nothing'),
      'the zero-price refusal precedes the first lane ask',
    ).toBeLessThan(code.indexOf('claimOf('));
    expect(
      code.match(/setPlanMessage\('a plan must cost more than nothing'\)/g)?.length,
      'both verbs refuse a priceless plan with the same sentence',
    ).toBe(2);
  });

  it('routes every verb through accountSession and surfaces refusals verbatim', () => {
    // The panel holds NO storage logic of its own (v252 header): register, rename, sign-out and the
    // current-account read belong to `accountSession`, where the rules live and where they are tested.
    // What the panel owns is the conversation — and a refusal is part of it: when the session declines,
    // its reason goes on screen UNCHANGED, so the creator reads the rule that actually refused them
    // rather than a paraphrase of it.
    for (const verb of ['session.register(', 'session.rename(', 'session.signOut()', 'session.current()']) {
      expect(codeOnly(), `${verb} goes through the session, not around it`).toContain(verb);
    }
    expect(
      codeOnly().match(/setMessage\(result\.reason\)/g)?.length,
      'register AND rename refusals surface verbatim',
    ).toBe(2);
    expect(codeOnly(), 'a successful create announces the assurance it actually got').toContain(
      'local account created — unsigned-local, this device only',
    );
  });

  it('signs out through the session, clears the face, and says what happened', () => {
    // Signing out is the one verb that takes no arguments and the one whose effect must be visible: the
    // account becomes null — which is what swaps the panel back to the create form — and the creator is
    // told the device publishes anonymously again, rather than being dropped into a silently empty panel.
    expect(codeOnly(), 'sign-out goes through the session').toContain('session.signOut()');
    expect(codeOnly(), 'sign-out clears the account, which is what swaps the panel back to the create form').toContain('setAccount(null)');
    expect(codeOnly(), 'the sign-out is announced, not silent').toContain(
      'signed out — this device publishes anonymously again',
    );
  });
});
