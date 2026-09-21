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

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

function styleFor(node: DesignNode, doc: DesignDocument, rect: { x: number; y: number; width: number; height: number }): string {
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
  if (node.fills.length) parts.push(`background:${paintToCss(node.fills[0]!, doc)}`);
  if (node.strokes.length) {
    const s = node.strokes[0]!;
    parts.push(`border:${s.weight}px solid ${strokeToCss(s)}`);
  }
  return parts.join(';');
}

function nodeToHtml(node: DesignNode, doc: DesignDocument, layout: Record<string, { x: number; y: number; width: number; height: number }>): string {
  const rect = layout[node.id];
  if (!node.visible || !rect) return '';
  const base = styleFor(node, doc, rect);
  if (node.type === 'text') {
    const t = node as TextNode;
    const st = resolveTextStyle(doc, t.style);
    const color = t.fills[0] ? paintToCss(t.fills[0], doc) : '#e6ecf5';
    const textStyle = `color:${color};font:${st.weight} ${st.sizePx}px/${st.lineHeight} ${st.family};letter-spacing:${st.letterSpacing}px;text-align:${st.align};white-space:pre-wrap`;
    return `<div style="${base};${textStyle}">${esc(t.characters)}</div>`;
  }
  if (node.type === 'image') {
    return `<div style="${base};display:flex;align-items:center;justify-content:center;color:#8ea0b5;font:500 12px Inter,sans-serif;background-image:repeating-linear-gradient(45deg,#141a24,#141a24 8px,#10151f 8px,#10151f 16px)">image</div>`;
  }
  return `<div style="${base}"></div>`;
}

function flatten(node: DesignNode, doc: DesignDocument, layout: Record<string, { x: number; y: number; width: number; height: number }>, out: string[]): void {
  out.push(nodeToHtml(node, doc, layout));
  for (const cid of childIdList(node)) {
    const child = doc.nodes[cid];
    if (child) flatten(child, doc, layout, out);
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
        lines.push(`${p}:${typeof raw === 'number' ? parseDimension(raw) + 'px' : String(raw)};`);
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
    if (child) flatten(child, doc, layout, body);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
:root{${tokenVars(doc)}}
*{box-sizing:border-box;margin:0}
html,body{background:#0a0d13}
.stage{position:relative;width:${page?.width ?? 0}px;height:${page?.height ?? 0}px;margin:24px auto;background:#0b0e14;overflow:hidden;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.5);font-family:Inter,system-ui,sans-serif}
</style></head><body><div class="stage">${body.join('\n')}</div></body></html>`;
}
