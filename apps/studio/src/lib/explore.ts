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

/** One publication as a card: the service's receipt facts, plus a thumbnail the route has already drawn. */
export interface ExploreItem {
  projectId: string;
  title: string;
  version: number;
  publishedAt: string;
  /** A self-contained data-URI image of the publication's first page, or undefined when it could not be drawn. */
  thumbnail?: string;
  /** Who the service recorded as publisher, when a claim was attached (v243). Shown as `by <handle> · <assurance>`; absent for pre-claim rows. */
  owner?: { handle: string; assurance: string } | null;
  /** The project this was remixed from, when the document carries a `_lineage` entry the service wrote. Shown as `remixed from <id>`; absent for non-remixes. */
  remixedFrom?: string | null;
  /** Why the thumbnail is absent, when it is — SHOWN on the card, never hidden (a blank card lies). */
  note?: string;
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
export function renderExploreHtml(items: ExploreItem[], opts: { count: number; limit: number }): string {
  const header = `<h1>EXPLORE</h1><div class="sub">${items.length} publication(s) shown · newest first · the service caps at ${opts.limit}</div>`;
  if (items.length === 0) {
    return pageShell('Explore — nothing published yet', `${header}<div class="empty-state">Nothing is published yet. Publish a project from the Studio and it will appear here.</div>`);
  }
  const cards = items
    .map((it) => {
      const thumb = it.thumbnail
        ? `<div class="thumb"><img src="${escapeHtml(it.thumbnail)}" alt="${escapeHtml(it.title)}"></div>`
        : `<div class="thumb"><span class="empty">${escapeHtml(it.note ?? 'no preview')}</span></div>`;
      const href = `/p/${encodeURIComponent(it.projectId)}`;
      const remix = `/?remix=${encodeURIComponent(it.projectId)}`;
      return `<li class="card" data-explore-card="${escapeHtml(it.projectId)}">${thumb}
<div class="meta"><strong>${escapeHtml(it.title)}</strong>${it.owner ? `<span class="by">by ${escapeHtml(it.owner.handle)} · ${escapeHtml(it.owner.assurance)}</span>` : ''}${it.remixedFrom ? `<span class="remixed">remixed from ${escapeHtml(it.remixedFrom)}</span>` : ''}<span>v${it.version} · ${escapeHtml(it.publishedAt)}</span></div>
<div class="acts"><a href="${escapeHtml(href)}">open</a><a class="remix" href="${escapeHtml(remix)}">remix</a></div>
</li>`;
    })
    .join('\n');
  return pageShell('Explore — published projects', `${header}<ul class="grid">${cards}</ul>`);
}

/** The service could not be reached or answered unusably. A DIFFERENT page from "nothing is published". */
export function renderExploreUnavailable(reason: string): string {
  return pageShell(
    'Explore — the publication service is not answering',
    `<h1>Explore is unavailable</h1><div class="sub">${escapeHtml(reason)}</div><p style="color:#9aa3b2">This is the service that holds publications, not this page — published work may be perfectly fine.</p>`,
  );
}
