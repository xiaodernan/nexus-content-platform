/**
 * M7 v270 — the PROFILE page: what ONE account has published.
 *
 * A profile is the first thing a community needs that the gallery alone cannot answer: the gallery says
 * "here is what exists", and a profile says "here is what THIS account made". It is also the first place a
 * byline can be a LINK — a name that leads nowhere is a name, not an address.
 *
 * PURE and string-returning, like `explore.ts` and `artifact.ts`: the route's job is to ask the service for
 * one account's publications, draw their thumbnails, and choose which of these to answer with. Keeping the
 * rendering pure is what lets the suite assert the rules without starting a server or a service.
 *
 * **What the service actually knows about an account, stated rather than implied:** the service holds NO
 * account table. An account exists in it only as far as publications NAME it — a claim carries an account id,
 * a handle and an assurance. So a profile can show the handle and the assurance (the claims agree, because
 * they are the same account) and it CANNOT show a display name, a bio, a follower count, or a joined date:
 * the service never received them. And it cannot tell "this account has published nothing" from "there is no
 * such account" — both are an empty list, because the service has nothing else to look at.
 */
import { escapeHtml } from './pageShell';
import { renderExploreCards, type ExploreItem } from './explore';

/** The facts a profile can state about an account, as the claims carry them. */
export interface ProfileFacts {
  /** The account id — the address the profile is at. */
  accountId: string;
  /** The handle the claims carry, or null when no claim said one. */
  handle: string | null;
  /** The assurance the claims carry, or null. `unsigned-local` is what this build can say. */
  assurance: string | null;
  /** How many publications the answer carried. */
  count: number;
  /** The cap the service applied. */
  limit: number;
}

/** One row of a listing, in the shape the profile reads the owner from. */
export interface ProfileRow {
  owner?: { accountId?: unknown; handle?: unknown; assurance?: unknown } | null;
}

/**
 * PURE: the facts about an account, read off the claims on its publications.
 *
 * The claims are the service's only knowledge of the account, so the facts come from them — and a row with
 * no owner says nothing rather than contributing an empty name.
 */
export function profileFactsOf(accountId: string, rows: readonly ProfileRow[], count: number, limit: number, offset: number = 0, query: string = ''): ProfileFacts {
  let handle: string | null = null;
  let assurance: string | null = null;
  for (const row of rows) {
    const owner = row.owner;
    if (!owner || typeof owner !== 'object') continue;
    if (handle === null && typeof owner.handle === 'string' && owner.handle.length > 0) handle = owner.handle;
    if (assurance === null && typeof owner.assurance === 'string' && owner.assurance.length > 0) assurance = owner.assurance;
    if (handle !== null && assurance !== null) break;
  }
  return { accountId, handle, assurance, count, limit };
}

/**
 * The profile page.
 *
 * An account with no publications gets its own state, and it says what it cannot know: the service cannot
 * tell an account that has published nothing from one that does not exist, because it holds no account
 * table — and a page that said "no such account" would be claiming a fact the service never had.
 */
export function renderProfileHtml(facts: ProfileFacts, items: ExploreItem[], offset: number = 0, query: string = ''): string {
  const who = facts.handle ? `@${facts.handle}` : facts.accountId;
  const assurance = facts.assurance ? ` · ${facts.assurance}` : '';
  const { count, limit } = facts;
  const hasPrev = offset > 0;
  const hasNext = offset + items.length < count;
  const paging = `
    <div class="paging" style="margin-top: 16; display: flex; gap: 8; align-items: center;">
      <a href="/u/${encodeURIComponent(facts.accountId)}?offset=${Math.max(0, offset - limit)}${query ? '&q=' + encodeURIComponent(query) : ''}" class="btn ${hasPrev ? '' : 'disabled'}" style="${hasPrev ? '' : 'opacity: 0.4; pointer-events: none;'}">← Prev</a>
      <span style="font-size: 12; color: var(--nexus-muted);">showing ${offset + 1}–${Math.min(offset + items.length, count)} of ${count}</span>
      <a href="/u/${encodeURIComponent(facts.accountId)}?offset=${offset + limit}${query ? '&q=' + encodeURIComponent(query) : ''}" class="btn ${hasNext ? '' : 'disabled'}" style="${hasNext ? '' : 'opacity: 0.4; pointer-events: none;'}">Next →</a>
    </div>`;
  const searchForm = `
    <form action="/u/${encodeURIComponent(facts.accountId)}" method="get" style="margin-bottom: 16; display: flex; gap: 8;">
      <input type="text" name="q" value="${escapeHtml(query ?? '')}" placeholder="search this account's publications..." style="flex: 1; padding: 6px 10px; background: #1b2230; border: 1px solid #262b34; border-radius: 4px; color: #e6e8ec; font-size: 13px;">
      <button type="submit" class="btn">search</button>
      ${query ? `<a href="/u/${encodeURIComponent(facts.accountId)}" class="btn" style="margin-left: 4px;">clear</a>` : ''}
    </form>`;
  const header = `<h1>${escapeHtml(who)}</h1><div class="sub">${escapeHtml(facts.accountId)}${escapeHtml(assurance)} · ${items.length} publication(s) shown · the service caps at ${limit}</div>${searchForm}${paging}`;

  if (items.length === 0) {
    return pageShell(
      `Profile — ${facts.handle ?? facts.accountId}`,
      `${header}<div class="empty-state">No publications are attributed to this account. The service cannot tell an account that has published nothing from one that does not exist: it holds no account table, only the claims that publications carry.</div>${paging}`,
    );
  }
  return pageShell(
    `Profile — ${facts.handle ?? facts.accountId}`,
    `${header}${renderExploreCards(items)}${paging}`,
  );
}

/** The profile's own page shell — the shared one, so the two pages look like one product. */
function pageShell(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box;margin:0}
body{background:#0a0d13;color:#e6e8ec;font-family:Inter,system-ui,sans-serif;padding:32px;line-height:1.5}
h1{font-size:20px;letter-spacing:.4px;margin-bottom:4px}
.sub{color:#9aa3b2;font-size:13px;margin-bottom:20px}
.grid{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.card{background:#12151b;border:1px solid #262b34;border-radius:8px;overflow:hidden;display:flex;flex-direction:column}
.thumb{height:130px;background:#0b0e14;display:flex;align-items:center;justify-content:center;overflow:hidden}
.thumb img{max-width:100%;max-height:100%;object-fit:contain}
.thumb .empty{color:#6b7280;font-size:12px;padding:0 10px;text-align:center}
.meta{padding:10px 12px;display:flex;flex-direction:column;gap:2px}
.meta strong{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta span{color:#9aa3b2;font-size:11px}
.meta .by{color:#9aa3b2;font-size:11px;text-decoration:none}
.meta .by:hover{color:#cfd6e4;text-decoration:underline}
.meta .remixed{color:#3b82f6;font-weight:600}
.acts{display:flex;gap:8px;padding:0 12px 12px}
.acts a{flex:1;text-align:center;font-size:11px;text-decoration:none;padding:5px 8px;border-radius:5px;background:#1b2230;color:#cfd6e4}
.acts a.remix{background:#3b82f6;color:#fff;font-weight:600}
.empty-state{color:#9aa3b2;font-size:14px;padding:40px 0;text-align:center}
</style></head><body>${bodyHtml}</body></html>`;
}
