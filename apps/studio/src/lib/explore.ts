/**
 * M7 v241 (ADR 0016 amendment 241): the EXPLORE page — what is published, at a URL a person can browse.
 *
 * The artifact page (`/p/{id}`) answers "what is THIS one", but it needs the id. The service has been able to
 * LIST publications since v195 (`GET /projects?limit=N`), and until v241 nothing but the Studio's own panel
 * consumed it — so a visitor had no door that showed them what EXISTS. This module is that door: a gallery
 * where each publication is a card carrying a THUMBNAIL drawn from the canonical model, its receipt facts,
 * and the two actions the community loop needs — open the artifact, or remix it into your own project.
 *
 * PURE and string-returning, like `artifact.ts`: the route's job is to fetch a listing, draw the thumbnails,
 * and choose which of these to answer with. Keeping the rendering pure is what lets the suite assert the rules
 * without starting a server or a service.
 */
import { escapeHtml } from './pageShell';
import { readRemixedFrom } from './lineage';

/** One publication as a card: the service's receipt facts, plus a thumbnail the route has already drawn. */
export interface ExploreItem {
  projectId: string;
  title: string;
  version: number;
  publishedAt: string;
  /** A self-contained data-URI image of the publication's first page, or undefined when it could not be drawn. */
  thumbnail?: string;
  /** Who the service recorded as publisher, when a claim was attached (v243). Shown as `by <handle> · <assurance>`;
   *  absent for pre-claim rows. v270 adds the ACCOUNT ID, because the byline is a link to that account's
   *  profile and a link needs an address, not a name. */
  owner?: { accountId: string; handle: string; assurance: string } | null;
  /** The project this was remixed from, when the document carries a `_lineage` entry the service wrote. Shown as `remixed from <id>`; absent for non-remixes. */
  remixedFrom?: string | null;
  /** Why the thumbnail is absent, when it is — SHOWN on the card, never hidden (a blank card lies). */
  note?: string;
}

/**
 * v265 — the service's listing row, in the shape the pure half reads.
 *
 * The owner is stated as the service SENDS it (an account id, a handle, an assurance and an instant), not as
 * the two fields the card shows, because the reduction is the thing that can go wrong: a mapping that drops
 * the owner makes every publication look anonymous, and the owner was already dropped once on its way to a
 * page (v263 found the publish lane discarding the listing's owner).
 */
export interface ExploreRow {
  projectId: string;
  title: string;
  version: number;
  publishedAt: string;
  owner?: { accountId?: unknown; handle?: unknown; assurance?: unknown } | null;
}

/** What the route learned when it read a row's document. The listing carries none, so this is a second read. */
export interface ExploreDocumentRead {
  ok: boolean;
  document?: unknown;
  reason?: string;
}

/**
 * v265 — the WHOLE service-answer → card mapping, in one pure function.
 *
 * It lived in the route, which meant nothing could assert it: the renderer had byline cases, and no test
 * could say that the page actually RECEIVES an owner to render. A renderer that can render a byline and a
 * page that never gets one look identical from the outside, and the byline is the whole point of the
 * ownership story (v263 made publications owned; this is what shows it).
 *
 * Every field is taken from the service's own answer, and the two that can be absent are stated as absent:
 * an owner the service did not record, and a lineage the document does not carry.
 */
export function toExploreItem(row: ExploreRow, read: ExploreDocumentRead, thumbnail?: string): ExploreItem {
  return {
    projectId: row.projectId,
    title: row.title,
    version: row.version,
    publishedAt: row.publishedAt,
    thumbnail,
    /** The service's recorded owner, when a claim was attached — shown as `by <handle> · <assurance>`. A
     *  malformed owner is shown as NO owner rather than as a broken byline: a card that says `by undefined`
     *  is worse than a card that says nothing, and both are true. */
    owner:
      row.owner
        && typeof row.owner.accountId === 'string'
        && row.owner.accountId.length > 0
        && typeof row.owner.handle === 'string'
        && typeof row.owner.assurance === 'string'
        ? { accountId: row.owner.accountId, handle: row.owner.handle, assurance: row.owner.assurance }
        : null,
    /** Where this publication was remixed from — the service wrote `_lineage.sourceProjectId` into the
     *  document; read it back so the card names its source. */
    remixedFrom: readRemixedFrom(read.document),
    /** Why the thumbnail is absent, when it is — SHOWN, never hidden. */
    note: thumbnail ? undefined : read.ok ? 'nothing to draw' : (read.reason ?? 'preview unavailable'),
  };
}

function pageShell(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box;margin:0}
body{background:#0a0d13;color:#e6e8ec;font-family:Inter,system-ui,sans-serif;padding:32px;line-height:1.5}
h1{font-size:20px;letter-spacing:.4px;margin-bottom:4px}
.sub{color:#9aa3b2;font-size:13px;margin-bottom:20px}
.grid{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
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

/**
 * The gallery. `count` is what the answer CARRIED; `limit` is the cap the service applied — both are shown, so
 * "24" is never mistaken for "there are only 24" (the same rule the Studio's own panel follows).
 */
export function renderExploreHtml(items: ExploreItem[], opts: { count: number; limit: number; offset: number; query?: string }): string {
  const { count, limit, offset, query } = opts;
  const hasPrev = offset > 0;
  const hasNext = offset + items.length < count;
  const paging = `
    <div class="paging" style="margin-top: 16; display: flex; gap: 8; align-items: center;">
      <a href="/explore?offset=${Math.max(0, offset - limit)}${query ? '&q=' + encodeURIComponent(query) : ''}" class="btn ${hasPrev ? '' : 'disabled'}" style="${hasPrev ? '' : 'opacity: 0.4; pointer-events: none;'}">← Prev</a>
      <span style="font-size: 12; color: var(--nexus-muted);">showing ${offset + 1}–${Math.min(offset + items.length, count)} of ${count}</span>
      <a href="/explore?offset=${offset + limit}${query ? '&q=' + encodeURIComponent(query) : ''}" class="btn ${hasNext ? '' : 'disabled'}" style="${hasNext ? '' : 'opacity: 0.4; pointer-events: none;'}">Next →</a>
    </div>`;
  const searchForm = `
    <form action="/explore" method="get" style="margin-bottom: 16; display: flex; gap: 8;">
      <input type="text" name="q" value="${escapeHtml(query ?? '')}" placeholder="search publications..." style="flex: 1; padding: 6px 10px; background: #1b2230; border: 1px solid #262b34; border-radius: 4px; color: #e6e8ec; font-size: 13px;">
      <button type="submit" class="btn">search</button>
      ${query ? `<a href="/explore" class="btn" style="margin-left: 4px;">clear</a>` : ''}
    </form>`;
  const header = `<h1>EXPLORE</h1><div class="sub">${items.length} publication(s) shown · newest first · the service caps at ${limit}</div>${searchForm}${paging}`;
  if (items.length === 0) {
    return pageShell('Explore — nothing published yet', `${header}<div class="empty-state">Nothing is published yet. Publish a project from the Studio and it will appear here.</div>${paging}`);
  }
  return pageShell('Explore — published projects', `${header}${renderExploreCards(items)}${paging}`);
}

/**
 * v270 — the CARD GRID, exported so the PROFILE page renders the same cards.
 *
 * Two pages that draw the same card must draw it with the same code, or they drift — and the drift shows up
 * as a card that looks right on the gallery and wrong on a profile. The byline is a LINK to the author's
 * profile, which is what turns a name into an address.
 */
export function renderExploreCards(items: ExploreItem[]): string {
  const cards = items
    .map((it) => {
      const thumb = it.thumbnail
        ? `<div class="thumb"><img src="${escapeHtml(it.thumbnail)}" alt="${escapeHtml(it.title)}"></div>`
        : `<div class="thumb"><span class="empty">${escapeHtml(it.note ?? 'no preview')}</span></div>`;
      const href = `/p/${encodeURIComponent(it.projectId)}`;
      const remix = `/?remix=${encodeURIComponent(it.projectId)}`;
      return `<li class="card" data-explore-card="${escapeHtml(it.projectId)}">${thumb}
<div class="meta"><strong>${escapeHtml(it.title)}</strong>${it.owner ? `<a class="by" href="/u/${encodeURIComponent(it.owner.accountId)}">by ${escapeHtml(it.owner.handle)} · ${escapeHtml(it.owner.assurance)}</a>` : ''}${it.remixedFrom ? `<a class="remixed" href="/p/${encodeURIComponent(it.remixedFrom)}">remixed from ${escapeHtml(it.remixedFrom)}</a>` : ''}<span>v${it.version} · ${escapeHtml(it.publishedAt)}</span></div>
<div class="acts"><a href="${escapeHtml(href)}">open</a><a class="remix" href="${escapeHtml(remix)}">remix</a></div>
</li>`;
    })
    .join('\n');
  return `<ul class="grid">${cards}</ul>`;
}

/** The service could not be reached or answered unusably. A DIFFERENT page from "nothing is published". */
export function renderExploreUnavailable(reason: string): string {
  return pageShell(
    'Explore — the publication service is not answering',
    `<h1>Explore is unavailable</h1><div class="sub">${escapeHtml(reason)}</div><p style="color:#9aa3b2">This is the service that holds publications, not this page — published work may be perfectly fine.</p>`,
  );
}
