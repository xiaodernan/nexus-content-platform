import {
  childIdList,
  layoutPage,
  parseDimension,
  resolveToken,
  type DesignDocument,
  type DesignNode,
  type TextNode,
} from '@nexus/design-model';
import { paintToCss, resolveTextStyle, strokeToCss } from './paint';
import { clipBoxFor, clipStyleFor, intersectClips, type ClipBox } from './clip';
/**
 * The escaper every value interpolated into this page's MARKUP passes through — the one the Studio's
 * server-rendered pages already share (§241), so there is a single answer to "is this safe to write".
 *
 * Everything the artifact interpolates is derived from a PUBLISHED document, and a publication is JSON a
 * client posted that the service stores verbatim (v294's leg read a malformed style back out of the store to
 * prove it). The resolvers pass a token's `$value` through as written — `colorToCss` returns a string
 * unchanged, `resolveTextStyle` reads the family with `String(...)` — so one quote inside a design token used
 * to end the attribute and become an ATTRIBUTE OF THE ELEMENT. Measured on shipped bytes: all nine
 * document-derived fields this renderer writes (`left`, `top`, `width`, `height`, `opacity`, `border-radius`,
 * `rotate()`, the `background`/`border` colours and the text shorthand) could do it.
 *
 * It is applied to the COMPOSED attribute rather than field by field, so a field added later cannot be
 * forgotten. A well-formed CSS value holds none of `& < > " '` — the editor cannot author one that does — so
 * this is inert for every drawing the canvas itself could make.
 */
import { escapeHtml } from './pageShell';

/**
 * A value written INSIDE the page's own `<style>` block must NOT be HTML-escaped: CSS does not decode
 * entities, so `&lt;` would be four characters where the author meant one. CSS has its own spelling — `\3c `
 * — which the parser reads back as `<` when the custom property is substituted, so the value survives and the
 * element still cannot be closed. `;`, `{` and `}` travel with `<` because they are the declaration and rule
 * boundaries this block is assembled out of, and a backslash first, because it is how the escape itself is
 * spelled.
 */
const cssValue = (raw: unknown): string => String(raw).replace(/[\\<>&{}";']/g, (c) => `\\${c.charCodeAt(0).toString(16)} `);

function styleFor(node: DesignNode, doc: DesignDocument, rect: { x: number; y: number; width: number; height: number }, clip: ClipBox | null): string {
  const parts: string[] = [
    `position:absolute`,
    `left:${rect.x}px`,
    `top:${rect.y}px`,
    `width:${rect.width}px`,
    `height:${rect.height}px`,
    `opacity:${node.opacity}`,
    `border-radius:${'cornerRadius' in node ? node.cornerRadius : 0}px`,
  ];
  if (node.type === 'ellipse') parts.push('border-radius:50%');
  // The canvas turns a node about its own centre and then restores, so children turn individually —
  // which is exactly what these flat siblings do with the same transform, since CSS' origin is the box centre.
  if (node.rotation) parts.push(`transform:rotate(${node.rotation}deg)`);
  // A text node's fill is its LETTER colour (nodeToHtml reads it as `color`); painting it as a background too
  // would hide the words behind a solid bar of their own colour.
  if (node.type !== 'text' && node.fills.length) parts.push(`background:${paintToCss(node.fills[0]!, doc)}`);
  if (node.strokes.length) {
    const s = node.strokes[0]!;
    parts.push(`border:${s.weight}px solid ${strokeToCss(s)}`);
  }
  // The artifact flattens the tree into siblings, so a clipping container cannot wrap what it cuts —
  // the cut travels down the walk instead and comes back out as `inset()` distances on each child's own box.
  // One divergence is accepted, and pinned by a test rather than left silent: CSS applies `clip-path` in the
  // element's own box BEFORE its `transform`, so a TURNED child is cut by a line that turns with it, while
  // the canvas and the SVG cut in the container's axis. The distances are therefore computed from the
  // child's unrotated rect — exact for the 99% of spill that happens inside unturned frames.
  const cut = clipStyleFor(rect, clip);
  if (cut) parts.push(`clip-path:${cut}`);
  return parts.join(';');
}

function nodeToHtml(node: DesignNode, doc: DesignDocument, layout: Record<string, { x: number; y: number; width: number; height: number }>, clip: ClipBox | null): string {
  const rect = layout[node.id];
  if (!node.visible || !rect) return '';
  const base = styleFor(node, doc, rect, clip);
  if (node.type === 'text') {
    const t = node as TextNode;
    const st = resolveTextStyle(doc, t.style);
    const color = t.fills[0] ? paintToCss(t.fills[0], doc) : '#e6ecf5';
    const textStyle = `color:${color};font:${st.weight} ${st.sizePx}px/${st.lineHeight} ${st.family};letter-spacing:${st.letterSpacing}px;text-align:${st.align};white-space:pre-wrap`;
    return `<div style="${escapeHtml(`${base};${textStyle}`)}">${escapeHtml(String(t.characters ?? ''))}</div>`;
  }
  if (node.type === 'image') {
    return `<div style="${escapeHtml(`${base};display:flex;align-items:center;justify-content:center;color:#8ea0b5;font:500 12px Inter,sans-serif;background-image:repeating-linear-gradient(45deg,#141a24,#141a24 8px,#10151f 8px,#10151f 16px)`)}">image</div>`;
  }
  return `<div style="${escapeHtml(base)}"></div>`;
}

function flatten(node: DesignNode, doc: DesignDocument, layout: Record<string, { x: number; y: number; width: number; height: number }>, out: string[], clip: ClipBox | null): void {
  out.push(nodeToHtml(node, doc, layout, clip));
  const under = intersectClips(clip, clipBoxFor(node, layout));
  for (const cid of childIdList(node)) {
    const child = doc.nodes[cid];
    if (child) flatten(child, doc, layout, out, under);
  }
}

function tokenVars(doc: DesignDocument): string {
  const lines: string[] = [];
  const walk = (obj: Record<string, unknown>, path: string) => {
    for (const [k, v] of Object.entries(obj)) {
      const p = path ? `${path}-${k}` : `--nexus-${k}`;
      if (v && typeof v === 'object' && '$value' in (v as object)) {
        const val = resolveToken(doc.tokens, (path ? path.replace(/--nexus-/, '').replace(/-/g, '.') + '.' : '') + k);
        const raw = (v as { $value: unknown }).$value;
        // The NAME is document-derived too — an object key is whatever the client posted — so `p` carries the
        // same escape as its value: a key of `x}</style><img src=y>` must not reach the block as a rule.
        lines.push(`${cssValue(p)}:${cssValue(typeof raw === 'number' ? parseDimension(raw) + 'px' : raw)};`);
        void val;
      } else if (v && typeof v === 'object') {
        walk(v as Record<string, unknown>, `${p}`);
      }
    }
  };
  walk(doc.tokens as unknown as Record<string, unknown>, '');
  return lines.join('\n');
}

/** Full standalone HTML for the iframe preview — one source of truth (the model), §3/§44. */
export function renderPreviewHtml(doc: DesignDocument, pageId: string): string {
  const layout = layoutPage(doc, pageId);
  const page = layout[pageId];
  const body: string[] = [];
  const rootNode = doc.nodes[pageId];
  if (rootNode) for (const cid of childIdList(rootNode)) {
    const child = doc.nodes[cid];
    if (child) flatten(child, doc, layout, body, null);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
:root{${tokenVars(doc)}}
*{box-sizing:border-box;margin:0}
html,body{background:#0a0d13}
.stage{position:relative;width:${cssValue(page?.width ?? 0)}px;height:${cssValue(page?.height ?? 0)}px;margin:24px auto;background:#0b0e14;overflow:hidden;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.5);font-family:Inter,system-ui,sans-serif}
</style></head><body><div class="stage">${body.join('\n')}</div></body></html>`;
}
