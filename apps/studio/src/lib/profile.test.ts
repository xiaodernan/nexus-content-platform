import { describe, expect, it } from 'vitest';
import { profileFactsOf, renderProfileHtml } from './profile';
import type { ExploreItem } from './explore';

/**
 * M7 v270 — the PROFILE page, in the pure half.
 *
 * A profile is the first thing a community needs that the gallery alone cannot answer, and it is also the
 * first place a byline can be an ADDRESS rather than a name. What it can state is bounded by what the
 * service actually knows: an account exists in the service only as far as publications NAME it, so the
 * handle and the assurance are the facts, and a display name or a follower count is not.
 */
const card = (over: Partial<ExploreItem> = {}): ExploreItem => ({
  projectId: 'pub-1',
  title: 'Harbour',
  version: 2,
  publishedAt: '2026-10-01T00:00:00Z',
  thumbnail: 'data:image/svg+xml,%3Csvg%2F%3E',
  owner: { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local' },
  ...over,
});

const row = (over: Partial<Parameters<typeof profileFactsOf>[1][number]> = {}) => ({
  owner: { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local' },
  ...over,
});

describe('profile — what the service knows about an account (M7 v270)', () => {
  it('reads the handle and the assurance off the claims the publications carry', () => {
    const facts = profileFactsOf('acct-ada', [row()], 1, 24);
    expect(facts.accountId).toBe('acct-ada');
    expect(facts.handle).toBe('ada');
    expect(facts.assurance).toBe('unsigned-local');
  });

  it('an account with no publications says NOTHING about itself rather than an empty name', () => {
    const facts = profileFactsOf('acct-ghost', [], 0, 24);
    expect(facts.handle).toBeNull();
    expect(facts.assurance).toBeNull();
    expect(facts.accountId).toBe('acct-ghost');
  });

  it('a row with no owner contributes nothing — a pre-claim publication is not this account\'s', () => {
    const facts = profileFactsOf('acct-ada', [row({ owner: null })], 1, 24);
    expect(facts.handle).toBeNull();
  });

  it('a malformed owner is skipped, not shown', () => {
    const facts = profileFactsOf('acct-ada', [row({ owner: { handle: 42, assurance: null } })], 1, 24);
    expect(facts.handle).toBeNull();
    expect(facts.assurance).toBeNull();
  });
});

describe('profile — the page (M7 v270)', () => {
  it('names the account and shows its publications as the SAME cards the gallery draws', () => {
    const facts = profileFactsOf('acct-ada', [row()], 1, 24);
    const html = renderProfileHtml(facts, [card()]);
    expect(html).toContain('@ada');
    expect(html).toContain('acct-ada');
    expect(html).toContain('unsigned-local');
    expect(html).toContain('data-explore-card="pub-1"');
    expect(html).toContain('href="/p/pub-1"');
    // the byline on a profile card is still a link to the profile — it is the page itself
    expect(html).toContain('href="/u/acct-ada"');
  });

  it('states the cap, so "1" is never mistaken for "there is only 1"', () => {
    const facts = profileFactsOf('acct-ada', [row()], 1, 24);
    expect(renderProfileHtml(facts, [card()])).toContain('caps at 24');
  });

  it('an account with nothing published gets its OWN state, and it says what it cannot know', () => {
    const facts = profileFactsOf('acct-ghost', [], 0, 24);
    const html = renderProfileHtml(facts, []);
    expect(html).toContain('No publications are attributed to this account');
    // the service cannot tell "published nothing" from "does not exist" — and the page says so
    expect(html).toContain('cannot tell an account that has published nothing from one that does not exist');
    expect(html).not.toContain('data-explore-card=');
  });

  it('escapes caller-controlled text — the handle and the title are both caller text', () => {
    const facts = profileFactsOf('acct-ada', [row()], 1, 24);
    const html = renderProfileHtml(facts, [card({ title: '<script>x</script>' })]);
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
