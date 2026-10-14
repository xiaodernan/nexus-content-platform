import { renderPreviewHtml } from './preview';
import { escapeHtml } from './pageShell';
import type { DesignDocument } from '@nexus/design-model';

/**
 * M7 v196 (ADR 0016 amendment 196): the ARTIFACT PAGE — a published project at a URL a person can open.
 *
 * M1 deferred "hosted publish" to M7 and v193–v195 built the API half: a publication is a row, it can be
 * read, listed and taken down. But every one of those is reachable only by a client that already knows the
 * id — a person with a browser has nothing to open. This module is the missing half.
 *
 * **It renders with the STUDIO'S OWN preview renderer**, the same function the local Preview and the HTML
 * export use. That is the whole point: "what you published is what you get" is only true if the published
 * page and the preview are the same code. A second renderer would be a second answer to the same question,
 * and the two would drift.
 *
 * The functions here are PURE and return HTML strings: the route's only job is to fetch a publication and
 * choose which of these to answer with. Keeping them pure is what lets the suite assert the rendering rules
 * without starting a server — and what lets the route stay small enough to read.
 */

/** The shell the two failure pages share. Deliberately plain: a page that cannot show the artifact should
 *  not look like the artifact. */
function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box;margin:0}
body{background:#0a0d13;color:#e6e8ec;font-family:Inter,system-ui,sans-serif;padding:48px;line-height:1.5}
h1{font-size:20px;letter-spacing:.4px;margin-bottom:10px}
p{color:#9aa3b2;max-width:60ch;margin-bottom:8px}
code{background:#12151b;border:1px solid #262b34;border-radius:4px;padding:1px 5px;font-size:13px}
</style></head><body>${bodyHtml}</body></html>`;
}

/**
 * The publication rendered as a page.
 *
 * The document is passed through `renderPreviewHtml` UNCHANGED — the artifact is not a paraphrase of the
 * document, it IS the document, drawn by the renderer the author already looked at.
 */
export function renderArtifactHtml(publication: { title?: string; version?: number; publishedAt?: string; document: unknown; projectId?: string }): string {
  const doc = publication.document as DesignDocument | null;
  if (!doc || typeof doc !== 'object') {
    return shell('Artifact unavailable', '<h1>Artifact unavailable</h1><p>The publication exists but its document is not an object, so there is nothing to draw.</p>');
  }
  // A document whose `activePageId` names no page has nothing to lay out — `renderPreviewHtml` would draw an
  // empty stage, which would look like an artifact that happens to be blank rather than a broken record.
  const pageId = doc.activePageId && doc.nodes && doc.nodes[doc.activePageId] ? doc.activePageId : null;
  if (!pageId) {
    return shell('Artifact unavailable', '<h1>Artifact unavailable</h1><p>The publication exists but names no page to draw, so there is nothing to show.</p>');
  }
  const html = renderPreviewHtml(doc, pageId);
  // v234 — a VISITOR (not just the publisher, whose Published panel already carries a remix control) can take
  // the work and make it their own. The link names the Studio root with `?remix=<id>`, which the Studio reads
  // on mount. Injection is a single string surgery on the preview's own bytes, so the drawing is untouched.
  return publication.projectId ? injectRemixBar(html, publication.projectId) : html;
}

/**
 * v234 — insert the remix bar before `</body>`. PURE and testable: it asserts nothing about the document, only
 * that the preview renderer's output ends the way it always does (`…</div></body></html>`), and it ESCAPES the
 * href it builds. A preview that does not contain `</body>` is returned unchanged rather than corrupted — the
 * artifact is still the artifact, and a missing bar is better than a broken page.
 */
export function injectRemixBar(html: string, projectId: string): string {
  if (!html.includes('</body>')) return html;
  const href = `/?remix=${encodeURIComponent(projectId)}`;
  const bar = `<a class="nexus-remix" href="${escapeHtml(href)}" rel="noreferrer">Remix in NEXUS Studio</a>
<style>.nexus-remix{position:fixed;right:16px;bottom:16px;z-index:10;background:#3b82f6;color:#fff;font:600 12px Inter,system-ui,sans-serif;text-decoration:none;padding:8px 12px;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.4)}</style>`;
  return html.replace('</body>', `${bar}</body>`);
}

/** Nothing is published under this id. 404 — the id may simply never have been published. */
export function renderArtifactMissing(projectId: string): string {
  return shell(
    'Nothing published here',
    `<h1>Nothing published here</h1><p>No publication exists under <code>${escapeHtml(projectId)}</code>.</p><p>It may never have been published, or it may have been taken down.</p>`,
  );
}

/**
 * The service could not be reached, or answered something unusable.
 *
 * 503 rather than 404, and the difference matters: "nothing is published here" and "the thing that knows what
 * is published is not running" are different facts, and a reader who gets the wrong one will look for the
 * problem in the wrong place. The reason is passed through so the page says what happened.
 */
export function renderArtifactUnavailable(reason: string): string {
  return shell(
    'The publication service is not answering',
    `<h1>The publication service is not answering</h1><p>${escapeHtml(reason)}</p><p>This is the service that holds publications, not this page — the artifact itself may be perfectly fine.</p>`,
  );
}
