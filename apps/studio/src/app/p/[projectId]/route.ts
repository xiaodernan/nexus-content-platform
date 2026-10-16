import { readPublication } from '@/lib/publishServer';
import { renderArtifactHtml, renderArtifactMissing, renderArtifactUnavailable } from '@/lib/artifact';

/**
 * M7 v196 (ADR 0016 amendment 196): `/p/{projectId}` — a published project at a URL a PERSON can open.
 *
 * A route HANDLER rather than a page, because what it answers with is not a React tree: it is the artifact
 * itself, drawn by the Studio's own preview renderer. Serving that HTML directly is what makes "what you
 * published is what you get" literally true — the bytes here are the bytes the local Preview produces, not a
 * second rendering of the same document.
 *
 * Node runtime, because the hop to `services/nexus-api` is server-side (the browser never learns the
 * service's address).
 *
 * Three answers, and the status codes carry the difference:
 *   200 — the artifact
 *   404 — nothing is published under this id (it may never have been, or it was taken down)
 *   503 — the SERVICE could not be reached or answered unusably. NOT a 404: "nothing is published here" and
 *         "the thing that knows what is published is not running" are different facts, and a reader given
 *         the wrong one looks for the problem in the wrong place.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await params;
  const answer = await readPublication(decodeURIComponent(projectId));

  if (answer.ok) {
    const doc = answer.document as Record<string, unknown> | null | undefined;
    const lineage = doc && typeof doc === 'object' && doc._lineage && typeof doc._lineage === 'object' ? doc._lineage : null;
    const remixedFrom = lineage && typeof lineage.sourceProjectId === 'string' ? lineage.sourceProjectId : null;
    return new Response(renderArtifactHtml(
      { projectId: decodeURIComponent(projectId), title: answer.title, version: answer.version, publishedAt: answer.publishedAt, document: answer.document },
      answer.owner ?? null,
      remixedFrom,
    ), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  // The lane reports a 404 STRUCTURALLY (`notFound`), rather than this route pattern-matching its sentence:
  // a route that read the wording would start answering 503 the day someone reworded it, and the difference
  // between "nothing is published here" and "the service is down" is the whole reason there are two pages.
  if (answer.notFound) {
    return new Response(renderArtifactMissing(projectId), {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return new Response(renderArtifactUnavailable(answer.reason ?? 'no reason given'), {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
