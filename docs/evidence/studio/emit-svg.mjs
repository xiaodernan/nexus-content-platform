// Emit a genuine SVG snapshot of a composed design straight from the Nexus Design
// Model (headless, deterministic). This is a real visual artifact derived from the
// same geometry the canvas renderer uses — NOT a fabricated screenshot.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const dm = await import(pathToFileURL('./packages/design-model/dist/index.js').href);
const ap = await import(pathToFileURL('./packages/ai-providers/dist/index.js').href);
const { createEmptyDocument, layoutPage, childIdList, resolveToken, colorToCss } = dm;

const router = new ap.ModelRouter();
const doc0 = createEmptyDocument('Evidence World');
const res = await router.generateDesign({ prompt: process.argv[2] || 'an analytics dashboard', document: doc0 });
const { applyBatch } = dm;
const doc = applyBatch(doc0, res.batch);
const layout = layoutPage(doc, doc.activePageId);
// Union bounding box of all laid-out nodes → correct viewBox (the page frame is auto-sized in-app).
const rects = Object.values(layout).filter((r) => Number.isFinite(r.x));
const minX = Math.min(...rects.map((r) => r.x));
const minY = Math.min(...rects.map((r) => r.y));
const maxX = Math.max(...rects.map((r) => r.x + r.width));
const maxY = Math.max(...rects.map((r) => r.y + r.height));
const page = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

function fillOf(node) {
  const f = node.fills && node.fills[0];
  if (!f) return 'none';
  if (f.kind === 'solid') return colorToCss(f.color);
  if (f.kind === 'token') {
    const t = resolveToken(doc.tokens, f.ref);
    return t ? colorToCss(t.$value) : '#888';
  }
  if (f.kind === 'linear') return colorToCss(f.stops[0].color);
  return '#5a6e8c';
}

const parts = [];
function walk(id) {
  const node = doc.nodes[id];
  const r = layout[id];
  if (!node || !r || !node.visible) return;
  const rx = node.type === 'ellipse' ? 0 : 'cornerRadius' in node ? node.cornerRadius : 0;
  const fill = fillOf(node);
  if (node.type === 'text') {
    const t = doc.nodes[id];
    parts.push(`<text x="${r.x + 2}" y="${r.y + r.height * 0.7}" font-family="Inter,sans-serif" font-size="${Math.max(8, r.height * 0.6)}" fill="${fill}">${escapeXml(String(t.characters ?? '').slice(0, 60))}</text>`);
  } else if (node.type !== 'page' && node.type !== 'document') {
    if (node.type === 'ellipse') parts.push(`<ellipse cx="${r.x + r.width / 2}" cy="${r.y + r.height / 2}" rx="${r.width / 2}" ry="${r.height / 2}" fill="${fill}"/>`);
    else parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${rx}" fill="${fill}"/>`);
  }
  for (const c of childIdList(node)) walk(c);
}
walk(doc.activePageId);

const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${page.x} ${page.y} ${page.width} ${page.height}" width="${Math.round(page.width)}" height="${Math.round(page.height)}"><rect x="${page.x}" y="${page.y}" width="${page.width}" height="${page.height}" fill="#0b0e14"/>${parts.join('')}</svg>`;

function escapeXml(s) {
  return s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

const prompt = process.argv[2] || 'an analytics dashboard';
const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const out = `docs/evidence/studio/generated-${slug}.svg`;
writeFileSync(out, svg);
console.log(JSON.stringify({ out, nodeCount: Object.keys(doc.nodes).length, shapesEmitted: parts.length, viewBox: `${page.x} ${page.y} ${page.width} ${page.height}`, prompt }));
