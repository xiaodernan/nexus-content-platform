/**
 * Deterministic heuristic Design Composer — the DEMO MODE "design agent" (ADR 0010).
 * It reads a prompt, chooses a layout template, and emits a real Nexus Design Model
 * OpBatch. This is NOT a canned screenshot: it produces genuine, editable Design Model
 * nodes that consume the project's tokens, so the canvas and live preview render them.
 */
import {
  demoId,
  ops,
  ellipseNode,
  frameNode,
  rectNode,
  textNode,
  type AutoLayout,
  type ContainerNode,
  type DesignDocument,
  type DesignNode,
  type NodePatch,
  type OpBatch,
  type Paint,
  type TextStyle,
} from '@nexus/design-model';
import { hashString, mulberry32, pick } from '../prng.js';

const SECTION_W = 1200;

function token(name: string): Paint {
  return { kind: 'token', ref: name };
}

type Template = 'landing' | 'auth' | 'dashboard' | 'portfolio';

function detectTemplate(prompt: string): Template {
  const p = prompt.toLowerCase();
  if (/(login|log in|sign in|sign up|register|auth)/.test(p)) return 'auth';
  if (/(dashboard|admin|analytics|metrics|crm|table|panel)/.test(p)) return 'dashboard';
  if (/(portfolio|gallery|photograph|showcase|masonry|grid of images)/.test(p)) return 'portfolio';
  return 'landing';
}

/** Manages deterministic ids + parent/child wiring while a section is assembled. */
class Composer {
  nodes: DesignNode[] = [];
  private n = 0;
  constructor(private seed: string) {}
  private nid(prefix: string): string {
    return `${prefix}_${demoId(this.seed, this.n++).slice(2)}`;
  }

  frame(name: string, patch: NodePatch, layout?: AutoLayout): ContainerNode {
    const id = this.nid('fr');
    const node = frameNode(name, layout, { id, ...patch });
    this.nodes.push(node);
    return node;
  }
  rect(name: string, patch: NodePatch): DesignNode {
    const node = rectNode(name, { id: this.nid('rc'), ...patch });
    this.nodes.push(node);
    return node;
  }
  ellipse(name: string, patch: NodePatch): DesignNode {
    const node = ellipseNode(name, { id: this.nid('el'), ...patch });
    this.nodes.push(node);
    return node;
  }
  text(name: string, chars: string, style: Partial<TextStyle>, patch: NodePatch): DesignNode {
    const full: TextStyle = {
      fontFamilyToken: 'font.family.body',
      sizeToken: 'font.size.base',
      weight: 400,
      lineHeight: 1.35,
      letterSpacing: 0,
      align: 'left',
      ...style,
    };
    const node = textNode(name, chars, full, { id: this.nid('tx'), fills: [token('color.text')], ...patch });
    this.nodes.push(node);
    return node;
  }
  /** mark a parent's children after the fact (parent must already be created) */
  adopt(parent: ContainerNode, kids: DesignNode[]): ContainerNode {
    for (const k of kids) k.parentId = parent.id;
    parent.childIds = kids.map((k) => k.id);
    return parent;
  }
}

function vLayout(gap: number, pad: Partial<AutoLayout['padding']> = {}, primaryAxis: AutoLayout['primaryAxis'] = 'start', counterAxis: AutoLayout['counterAxis'] = 'start'): AutoLayout {
  return {
    mode: 'vertical',
    gap,
    padding: { top: pad.top ?? 0, right: pad.right ?? 0, bottom: pad.bottom ?? 0, left: pad.left ?? 0 },
    primaryAxis,
    counterAxis,
  };
}
function hLayout(gap: number, pad: Partial<AutoLayout['padding']> = {}, primaryAxis: AutoLayout['primaryAxis'] = 'start', counterAxis: AutoLayout['counterAxis'] = 'center'): AutoLayout {
  return {
    mode: 'horizontal',
    gap,
    padding: { top: pad.top ?? 0, right: pad.right ?? 0, bottom: pad.bottom ?? 0, left: pad.left ?? 0 },
    primaryAxis,
    counterAxis,
  };
}

function titleCase(prompt: string): string {
  const clean = prompt.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Your Next Big Thing';
  const words = clean.split(' ');
  const head = words.slice(0, Math.min(6, words.length)).join(' ');
  return head.charAt(0).toUpperCase() + head.slice(1);
}

function featureCard(c: Composer, title: string, body: string): ContainerNode {
  const card = c.frame(title + ' card', { width: 352, height: 240, cornerRadius: 16, fills: [token('color.surface')] }, vLayout(12, { top: 24, right: 24, bottom: 24, left: 24 }));
  const swatch = c.rect('icon', { width: 40, height: 40, cornerRadius: 10, fills: [token('color.accent')] });
  const t = c.text('title', title, { sizeToken: 'font.size.lg', weight: 700 }, { width: 304, height: 28 });
  const b = c.text('body', body, { sizeToken: 'font.size.sm', weight: 400 }, { width: 304, height: 68, fills: [token('color.textMuted')] });
  return c.adopt(card, [swatch, t, b]) as ContainerNode;
}

function buildLanding(c: Composer, headline: string): ContainerNode {
  // nav
  const logo = c.text('Logo', 'NEXUS', { sizeToken: 'font.size.lg', weight: 700 }, { width: 120, height: 32 });
  const navItems: DesignNode[] = ['Product', 'Pricing', 'Docs'].map((label) =>
    c.text('nav ' + label, label, { sizeToken: 'font.size.sm' }, { width: 72, height: 24, fills: [token('color.textMuted')] }),
  );
  const nav = c.frame('Nav', { width: SECTION_W, height: 72, fills: [token('color.surface')] }, hLayout(24, { top: 20, right: 48, bottom: 20, left: 48 }, 'space-between'));
  c.adopt(nav, [logo, ...navItems]);

  // hero
  const title = c.text('Headline', headline, { sizeToken: 'font.size.2xl', weight: 700, lineHeight: 1.1 }, { width: 820, height: 96 });
  const sub = c.text('Subhead', 'Turn ideas into executable digital worlds — designed, coded, and running in one canvas.', { sizeToken: 'font.size.lg' }, { width: 640, height: 64, fills: [token('color.textMuted')] });
  const ctaLabel = c.text('label', 'Get started', { sizeToken: 'font.size.base', weight: 700 }, { width: 160, height: 24 });
  const cta = c.frame('CTA', { width: 220, height: 52, cornerRadius: 999, fills: [token('color.brand')] }, hLayout(0, { top: 14, right: 28, bottom: 14, left: 28 }, 'center', 'center'));
  c.adopt(cta, [ctaLabel]);
  const hero = c.frame('Hero', { width: SECTION_W, height: 320, fills: [token('color.bg')] }, vLayout(20, { top: 72, right: 48, bottom: 72, left: 48 }, 'center', 'start'));
  c.adopt(hero, [title, sub, cta]);

  // features
  const cards = [
    featureCard(c, 'Design', 'A canonical design model, not pixels — every edit is a structured operation.'),
    featureCard(c, 'Code', 'Design and code coexist; the model renders to running experiences.'),
    featureCard(c, 'Agents', 'AI agents plan, generate and verify — with human checkpoints.'),
  ];
  const features = c.frame('Features', { width: SECTION_W, height: 288, fills: [token('color.surfaceAlt')] }, hLayout(24, { top: 48, right: 48, bottom: 48, left: 48 }, 'start', 'start'));
  c.adopt(features, cards);

  const section = c.frame('Landing', { width: SECTION_W, height: 680, fills: [token('color.bg')] }, vLayout(0, {}, 'start', 'start'));
  return c.adopt(section, [nav, hero, features]) as ContainerNode;
}

function buildAuth(c: Composer, headline: string): ContainerNode {
  const title = c.text('Title', headline || 'Welcome back', { sizeToken: 'font.size.xl', weight: 700 }, { width: 320, height: 40 });
  const label = (t: string) => c.text('field label', t, { sizeToken: 'font.size.sm', weight: 500 }, { width: 320, height: 20, fills: [token('color.textMuted')] });
  const input = () => c.rect('input', { width: 320, height: 44, cornerRadius: 8, fills: [token('color.surfaceAlt')], strokes: [{ color: { r: 0.16, g: 0.2, b: 0.27, a: 1 }, weight: 1, align: 'inside' }] });
  const btn = c.frame('submit', { width: 320, height: 44, cornerRadius: 8, fills: [token('color.brand')] }, hLayout(0, { top: 12, right: 12, bottom: 12, left: 12 }, 'center'));
  c.adopt(btn, [c.text('label', 'Sign in', { sizeToken: 'font.size.base', weight: 700 }, { width: 80, height: 20 })]);
  const card = c.frame('Auth card', { width: 400, height: 420, cornerRadius: 16, fills: [token('color.surface')] }, vLayout(14, { top: 40, right: 40, bottom: 40, left: 40 }, 'start', 'start'));
  c.adopt(card, [title, label('Email'), input(), label('Password'), input(), btn]);
  const section = c.frame('Auth', { width: SECTION_W, height: 560, fills: [token('color.bg')] }, vLayout(0, { top: 70, right: 48, bottom: 70, left: 48 }, 'center', 'center'));
  return c.adopt(section, [card]) as ContainerNode;
}

function buildDashboard(c: Composer, headline: string): ContainerNode {
  const bar = c.frame('Top bar', { width: SECTION_W, height: 64, fills: [token('color.surface')] }, hLayout(16, { top: 16, right: 32, bottom: 16, left: 32 }, 'space-between'));
  c.adopt(bar, [
    c.text('title', headline || 'Dashboard', { sizeToken: 'font.size.lg', weight: 700 }, { width: 200, height: 32 }),
    c.ellipse('avatar', { width: 32, height: 32, fills: [token('color.accent')] }),
  ]);
  const statCards = ['Revenue', 'Active users', 'Conversion'].map((s, i) => {
    const card = c.frame('stat ' + s, { width: 276, height: 120, cornerRadius: 12, fills: [token('color.surface')] }, vLayout(6, { top: 16, right: 16, bottom: 16, left: 16 }));
    c.adopt(card, [
      c.text('k', s, { sizeToken: 'font.size.sm' }, { width: 240, height: 18, fills: [token('color.textMuted')] }),
      c.text('v', pick(mulberry32(hashString(s)), ['12.4k', '$48,920', '3.7%']), { sizeToken: 'font.size.xl', weight: 700 }, { width: 240, height: 40 }),
    ]);
    return card;
  });
  const stats = c.frame('stats', { width: SECTION_W, height: 120, fills: [token('color.bg')] }, hLayout(16, { top: 0, right: 32, bottom: 0, left: 32 }));
  c.adopt(stats, statCards);
  const content = c.rect('content', { width: 1136, height: 320, cornerRadius: 12, fills: [token('color.surfaceAlt')] });
  const grid = c.frame('grid', { width: SECTION_W, height: 320, fills: [token('color.bg')] }, hLayout(16, { top: 24, right: 32, bottom: 24, left: 32 }));
  c.adopt(grid, [content]);
  const section = c.frame('Dashboard', { width: SECTION_W, height: 560, fills: [token('color.bg')] }, vLayout(16, {}, 'start', 'start'));
  return c.adopt(section, [bar, stats, grid]) as ContainerNode;
}

function buildPortfolio(c: Composer, headline: string): ContainerNode {
  const header = c.text('Headline', headline || 'Selected work', { sizeToken: 'font.size.xl', weight: 700 }, { width: 600, height: 48 });
  const tiles: DesignNode[] = [];
  for (let i = 0; i < 6; i++) {
    const t = c.rect('tile ' + (i + 1), { width: 372, height: 220, cornerRadius: 12, fills: [i % 2 ? token('color.surfaceAlt') : token('color.surface')] });
    tiles.push(t);
  }
  const wrap = c.frame('grid', { width: SECTION_W, height: 560, fills: [token('color.bg')] }, hLayout(24, { top: 24, right: 48, bottom: 48, left: 48 }, 'start', 'start'));
  c.adopt(wrap, [header, ...tiles]);
  const section = c.frame('Portfolio', { width: SECTION_W, height: 640, fills: [token('color.bg')] }, vLayout(0, {}, 'start', 'start'));
  return c.adopt(section, [wrap]) as ContainerNode;
}

export interface ComposedSection {
  root: ContainerNode;
  all: DesignNode[];
  template: Template;
}

export function compose(prompt: string, seed: number): ComposedSection {
  const c = new Composer(prompt + ':' + seed);
  const headline = titleCase(prompt);
  const template = detectTemplate(prompt);
  let root: ContainerNode;
  if (template === 'auth') root = buildAuth(c, headline);
  else if (template === 'dashboard') root = buildDashboard(c, headline);
  else if (template === 'portfolio') root = buildPortfolio(c, headline);
  else root = buildLanding(c, headline);
  return { root, all: c.nodes, template };
}

/** Produce the OpBatch that inserts the composed section onto the active page. */
export function composeDesignBatch(req: {
  prompt: string;
  document: DesignDocument;
  seed?: number;
}): { batch: OpBatch; template: Template } {
  const seed = req.seed ?? hashString(req.prompt);
  const { root, all, template } = compose(req.prompt, seed);

  // Thread parentId from the tree and emit nodes root→descendants so applyOp wires correctly.
  const byId = new Map<string, DesignNode>();
  for (const n of all) byId.set(n.id, n);
  const ordered: DesignNode[] = [];
  const seen = new Set<string>();
  const walk = (id: string, parentId: string | null): void => {
    const n = byId.get(id);
    if (!n || seen.has(id)) return;
    seen.add(id);
    n.parentId = parentId;
    ordered.push(n);
    for (const cid of (n as ContainerNode).childIds ?? []) walk(cid, n.id);
  };
  walk(root.id, req.document.activePageId);

  const batch: OpBatch = {
    id: demoId('batch', seed),
    ops: [ops.addSubtree(req.document.activePageId, 0, ordered)],
    provenance: { mode: 'demo', provider: 'nexus-demo', label: `demo:${template}` },
    timestamp: 0,
    summary: `Generated ${template} from “${req.prompt.slice(0, 60)}”`,
  };
  return { batch, template };
}

