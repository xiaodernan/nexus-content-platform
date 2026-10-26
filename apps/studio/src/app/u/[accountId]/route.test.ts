import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, dynamic, runtime } from './route';

/**
 * M7 v523 (ADR 0016 amendment 509) — the PROFILE page, graded directly for the first time.
 *
 * The profile is the one page that asks FIVE questions about one name: the publications door (through the
 * shared listing lib), then plans, tips, followers and following together. That is where the house rule
 * about names bites hardest, and until now nothing graded it: the page read a URL segment, decoded it a
 * SECOND time over bytes Next had already decoded (`base-server.js`'s `prepareDestination`, shared by dev
 * and prod), decided on the trimmed bytes and then forwarded the UNtrimmed ones — so the listing lib,
 * which trims for itself, asked about `ada` while the four side doors were asked about ` ada `.
 *
 * The service is faked at the `fetch` boundary, and the names are read back THROUGH the URL parser rather
 * than by byte needles: parsing the address the page composed is what the service does to it, so the
 * answer is the name that gets looked up — on every one of the five asks, not on the one that happens to
 * trim on the way out.
 */

const API_BASE = 'http://service.test';

/** The query keys the five asks name the account under — one spelling per door, none of them the page's. */
const NAMED = ['owner', 'creator', 'recipient', 'accountId', 'follower'];

let seen: string[] = [];

function stubService() {
  seen = [];
  vi.stubGlobal('fetch', async (input: string | URL) => {
    seen.push(String(input));
    const url = new URL(String(input));
    // The listing has to be an ANSWER or the page stops before the four side reads; every other door
    // answers "nothing here", which each lib reports as a bar the page leaves out.
    if (url.pathname === '/projects' || url.pathname === '/search') {
      return new Response(JSON.stringify({ publications: [], count: 0, limit: 24, offset: 0 }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
}

const open = (accountId: string) =>
  GET(new Request(`http://studio.test/u/${encodeURIComponent(accountId)}`), { params: Promise.resolve({ accountId }) });

/** Every name the page asked a door to look up, in the order it asked. */
function namesAsked(): string[] {
  return seen.map((url) => {
    const parsed = new URL(url);
    for (const key of NAMED) if (parsed.searchParams.has(key)) return parsed.searchParams.get(key)!;
    throw new Error(`the page asked ${url}, which names no account`);
  });
}

beforeEach(() => {
  vi.stubEnv('NEXUS_API_URL', API_BASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('profile page — the one name the five asks share (v523)', () => {
  it('runs on the node runtime, because this page is the hop that holds the service address', () => {
    expect(runtime).toBe('nodejs');
    expect(dynamic).toBe('force-dynamic');
  });

  it('a padded account asks ALL FIVE sources about the name the caller MEANT', async () => {
    // The rule the query-side doors have kept since amendment 501 and the body-side ones since 507, now
    // on the page that fans out five asks: decide on the trimmed bytes and FORWARD them, so the page does
    // not answer about two accounts at once.
    stubService();
    const res = await open(' ada ');
    expect(res.status).toBe(200);
    expect(seen, 'the listing and the four side reads are all asked').toHaveLength(5);
    expect(new Set(namesAsked()).size, `the five asks named: ${JSON.stringify(namesAsked())}`).toBe(1);
    for (const name of namesAsked()) expect(name).toBe('ada');
    expect(seen.join(' ')).not.toContain('%20ada');
  });

  it('a percent sign in an account is a NAME, not a broken escape', async () => {
    // The browser sent `/u/ada%25b`; the framework handed the page `ada%b`, which is the id. The second
    // decode threw `URIError` out of the handler — a 500 with no sentence, and no ask.
    stubService();
    const res = await open('ada%b');
    expect(seen).toHaveLength(5);
    expect(res.status).toBe(200);
    for (const name of namesAsked()) expect(name).toBe('ada%b');
  });

  it('one decode, not two: an account that NAMES a percent is asked about as the percent it names', async () => {
    stubService();
    await open('ada%25b');
    for (const name of namesAsked()) expect(name).toBe('ada%25b');
  });

  it('a blank account names nobody — an empty profile, and nothing asked', async () => {
    // v270's rule, unchanged and ungraded until now: a blank owner is the ABSENCE of one, so the page
    // answers "nobody" rather than the whole table — and it says so without asking anything.
    stubService();
    const res = await open('   ');
    expect(res.status).toBe(200);
    expect(seen, 'a name that is blank after trimming is not asked about at all').toHaveLength(0);
  });
});
