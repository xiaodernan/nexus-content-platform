/**
 * §PROOF-STUDIO-LANE-CACHE · 2026-11-18（完全对上 contracts/ai-request.schema.json）
 */
const SERVICE = process.env.NEXUS_AI_SERVICE_URL ?? 'http://127.0.0.1:8001';

const tideCode = `// src/studio/tide-card.tsx — 潮汐卡：吸顶区 + 级别印章
import { cn } from '@/lib/cn';
import { SealZhao } from '@/studio/SealZhao';
import type { TideCardLevel } from './tide-card-types';

export function TideCard({ tide, next, level }: { tide: string; next: string; level: TideCardLevel }) {
  return (
    <article data-tide-card data-level={level}>
      <header className="tide-header">
        <h3 className="tide-title">{tide}</h3>
        <p className="tide-next">{next}</p>
      </header>
      <footer className="tide-foot">
        <SealZhao size={16} />
        <span>潮候院恒定印章 · CÆSURA 止音纪元</span>
      </footer>
    </article>
  );
}
export type { TideCardLevel };
// ↑ 潮位分层：gold / silver / bronze；只接受 token color.ink / color.salt；不许硬编码。`;

const designIndex = {
  schemaVersion: 1,
  generatedFrom: { documentId: 'doc-probe-001', documentName: '首页潮种纪元 v12', updatedAt: '2026-11-18T02:00:00.000Z' },
  pages: [
    { id: 'pg-home', name: '首页', route: '/', nodeCount: 42, reachable: 42, frames: 7, sections: 3, textChars: 4120, components: ['cmp-tide-card', 'cmp-harbor-list', 'cmp-lock-ledger'], assets: ['ast-seal-zhao', 'ast-tide-chart'], tokens: 14, interactions: 1, maxDepth: 5, viewport: { width: 1440, height: 900 } },
    { id: 'pg-harbor', name: '雾港·潮汐表', route: '/harbor', nodeCount: 38, reachable: 38, frames: 5, sections: 3, textChars: 3480, components: ['cmp-tide-card', 'cmp-harbor-list', 'cmp-lock-ledger'], assets: ['ast-tide-chart'], tokens: 14, interactions: 1, maxDepth: 4, viewport: { width: 1440, height: 900 } },
    { id: 'pg-ask', name: '问典 · THE TIDAL INQUIRY', route: '/bible/ask', nodeCount: 17, reachable: 17, frames: 2, sections: 1, textChars: 820, components: ['cmp-tide-card'], assets: [], tokens: 10, interactions: 0, maxDepth: 3, viewport: { width: 1440, height: 900 } },
  ],
  frames: Array.from({ length: 12 }, (_, i) => ({
    id: `fr-${String(i + 1).padStart(2, '0')}`,
    name: ['tide-hero', 'salt-grid', 'harbor-list', 'ask-canon', 'poll-seal', 'harbor-man', 'fog-window', 'lock-ledger', 'echo-frame', 'map-panel', 'footer', 'quote-ring'][i],
    kind: i % 3 === 0 ? 'section' : 'frame',
    pageId: i < 7 ? 'pg-home' : 'pg-harbor',
    pageName: i < 7 ? '首页' : '雾港·潮汐表',
    parent: i % 3 === 2 ? 'fr-01' : 'pg-home',
    depth: (i % 3) + 1,
    childCount: [5, 8, 3][i % 3],
    layoutMode: i % 2 === 0 ? 'column' : 'row',
    size: { width: [1440, 1200, 360, 720, 1440, 480, 960, 480, 1440, 400, 1440, 1440][i], height: [720, 600, 480, 240, 96, 320, 720, 600, 288, 520, 96, 288][i] },
    textPreview: ['潮种纪元 · 东留海门', '雾港 · 12 盏号灯', '潮汐表今日的字', '问诸典 · 复姓共执', '潮分牌 · 署名', '值更人 · 老语', '雾吻的窗', '值更册最后一行', '回响 · 原话见典', '世界 3D 全图', '赵欣曈 · 版权', '"潮起潮落"'][i],
  })),
  components: [
    { id: 'cmp-tide-card', name: 'TideCard', definedOnPage: 'pg-home', props: ['tide', 'next', 'level'], variants: 3, slots: ['footer'], instances: 3, usedOnPages: ['pg-home', 'pg-harbor'], unused: false },
    { id: 'cmp-harbor-list', name: 'HarborList', definedOnPage: 'pg-harbor', props: ['harbors', 'season'], variants: 2, slots: [], instances: 2, usedOnPages: ['pg-harbor'], unused: false },
    { id: 'cmp-lock-ledger', name: 'LockLedger', definedOnPage: 'pg-harbor', props: ['entries', 'editor'], variants: 1, slots: ['header'], instances: 1, usedOnPages: ['pg-harbor'], unused: false },
  ],
  assets: [
    { id: 'ast-seal-zhao', name: '赵欣曈印', kind: 'image/svg+xml', usedByNodes: 2, usedOnPages: ['pg-home', 'pg-harbor'], orphaned: false },
    { id: 'ast-tide-chart', name: '潮汐曲线', kind: 'image/svg+xml', usedByNodes: 4, usedOnPages: ['pg-home', 'pg-harbor'], orphaned: false },
  ],
  tokens: Array.from({ length: 14 }, (_, i) => ({
    key: ['color.ink', 'color.salt', 'color.harbor', 'color.mile', 'font.display', 'font.body', 'font.mono', 'space.1', 'space.2', 'space.4', 'radius.card', 'motion.fast', 'z.header', 'wash.fog'][i],
    type: ['color', 'color', 'color', 'color', 'font', 'font', 'font', 'space', 'space', 'space', 'radius', 'motion', 'z', 'color'][i],
    group: ['color', 'color', 'color', 'color', 'font', 'font', 'font', 'space', 'space', 'space', 'radius', 'motion', 'z', 'color'][i],
    value: ['#0B1D2A', '#D8D2C4', '#1F3B4C', '#A8894F', 'serif', 'sans-serif', 'monospace', '4px', '8px', '16px', '0.625rem', '120ms', '30', 'rgba(216,210,196,0.08)'][i],
    modes: 1,
    usedByNodes: 5 + i,
    via: [],
    used: true,
  })),
  interactions: [
    { id: 'int-tide-hover', pageId: 'pg-home', pageName: '首页', nodeId: 'fr-01', nodeName: 'tide-hero', trigger: 'hover', action: 'style', target: 'fr-01', targetName: 'TideCard' },
    { id: 'int-lock-tap', pageId: 'pg-harbor', pageName: '雾港·潮汐表', nodeId: 'fr-08', nodeName: 'lock-ledger', trigger: 'dblclick', action: 'toggle', target: 'fr-08', targetName: 'LockLedger' },
  ],
  edges: [{ from: 'pg-home', to: 'pg-harbor', kind: 'token' }, { from: 'pg-harbor', to: 'pg-ask', kind: 'instance' }],
  totals: { pages: 3, nodes: 97, reachableNodes: 97, unreachableNodes: 0, frames: 12, sections: 7, components: 3, unusedComponents: 0, instances: 6, assets: 2, orphanAssets: 0, tokens: 14, unusedTokens: 0, undeclaredTokenRefs: 0, interactions: 2, edges: 2, textChars: 8420 },
  omissions: ['逐节点样式', '图片内容', '组件内部实现', '字幕逐帧的文本'],
};

const payload = (busySuffix: string) => ({
  requestId: `studio-lane-${Date.now().toString(36)}-${busySuffix}`,
  prompt: '把潮汐曲线上移到吸顶区，字号 72px 衬线，颜色用 token color.ink',
  modelClass: 'balanced',
  intent: 'design-edit',
  variants: 1,
  context: {
    projectId: '00000000-0000-4000-8000-0000000000ff',
    contextSource: 'designIndex',
    indexChars: 6800,
    budgetChars: 8000,
    designIndex,
    codeDigest: {
      schemaVersion: 1,
      mode: 'selection-images',
      query: 'TideCard',
      tree: tideCode,
      files: [{
        path: 'src/studio/tide-card.tsx',
        language: 'tsx',
        origin: 'document-fallback',
        pageName: '首页',
        lines: 22,
        symbols: ['TideCard', 'TideCardLevel'],
        deps: ['react'],
        externals: ['renderer'],
        unresolvedDeps: [],
        reasons: ['TideCard 内容改动'],
        sha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        bytes: 620,
      }],
      budgetChars: 4000,
      omittedFiles: 0,
      trimmed: [],
      omissions: ['组件实现细节'],
      totals: { files: 1, bytes: 620, matched: 1, pageFiles: 1, nodeRegionFiles: 1, symbols: 2, exportedSymbols: 1, components: 1, functions: 2, classes: 0, interfaces: 0, internalDeps: 0, externalDeps: 1, unresolvedDeps: 0, codeChars: 620, unreadableFiles: 0, nodeRegionChars: 620 },
    },
    selection: ['fr-01'],
    selectionDigest: {
      schemaVersion: 1,
      requested: 1,
      limit: 20,
      entries: [{
        nodeId: 'fr-01', pageId: 'pg-home', pageName: '首页', type: 'section', name: 'tide-hero',
        parent: 'pg-home', depth: 1, childCount: 5,
        size: { width: 1440, height: 720 }, text: '潮种纪元 · 东留海门', fontSize: '72px',
        tokenRefs: ['color.ink', 'font.display'], componentOf: 'cmp-tide-card', assetRef: 'ast-tide-chart',
      }],
      missing: [],
      unreachable: [],
      dropped: [],
      omissions: [],
    },
  },
});

const call = async (n: number, suffix: string) => {
  const started = Date.now();
  const res = await fetch(`${SERVICE}/v1/ai/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload(suffix)),
  });
  const body = (await res.json().catch(() => null)) as any;
  if (body && body.code === 'validation-failed') {
    console.log(JSON.stringify({ n, status: res.status, code: body.code, hint: body.hint }).slice(0, 900));
    return;
  }
  const u = body?.usage ?? {};
  console.log(JSON.stringify({ n, status: res.status, ms: Date.now() - started, rawField: Object.keys(body ?? {}) }, null, 0));
  console.log(JSON.stringify({
    n,
    status: res.status,
    ms: Date.now() - started,
    provider: u.provider ?? null,
    model: u.model ?? null,
    tokensIn: u.tokensIn ?? null,
    tokensOut: u.tokensOut ?? null,
    cachedTokens: u.cachedTokens ?? null,
    cacheReported: u.cacheReported ?? null,
    patchCount: body?.patches?.length ?? null,
    explanation: String(body?.explanation ?? '').slice(0, 200),
    capability: body?.capability ?? null,
    error: body?.error ?? null,
  }));
};

await call(1, 'a');
await call(2, 'a');
await call(3, 'b');
