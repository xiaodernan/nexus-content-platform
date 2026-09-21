import {
  createNode,
  findPage,
  lintDesign,
  summarizeIssues,
  validateDocument,
  TokenStore,
  type DesignDocument,
  type DesignNode,
  type Page,
} from '@nexus/design-model';
import type { AgentActivity, AgentPlan, AiRequest, AiResponse, DesignPatchPayload, ModelClass } from '@nexus/schemas';
import type { PatchOp } from '@nexus/design-model';

/**
 * 确定性 Mock Provider（§159-160）。
 * 它不是"假 AI"：每条规则做的事都能被人读懂、可验证，并且结果一律标注 capability='demo' /
 * usage.demoMode=true，UI 必须常驻 DEMO MODE 徽标。真实 provider 接入后按同一契约替换。
 */

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  run(request: AiRequest): Promise<AiResponse>;
}

interface RuleResult {
  summary: string;
  explanation: string;
  patches: DesignPatchPayload[];
  activities: string[];
  label: string;
}

interface Rule {
  id: string;
  match(prompt: string): boolean;
  apply(input: { document: DesignDocument; page: Page; request: AiRequest }): RuleResult | null;
}

const PALETTES: Record<string, Record<string, string>> = {
  cinematic: {
    'color.background': '#05060a',
    'color.surface': '#0d1018',
    'color.surface-2': '#151a26',
    'color.text': '#f5f7ff',
  },
  'dark-fantasy': {
    'color.background': '#0a0610',
    'color.surface': '#150c22',
    'color.primary': '#a06bff',
    'color.text': '#f2e9ff',
  },
  cyber: {
    'color.background': '#05070d',
    'color.surface': '#0b1220',
    'color.primary': '#22d3ee',
    'color.text': '#e6f7ff',
  },
};

function targetNode(input: { page: Page; request: AiRequest }): DesignNode | null {
  const { page, request } = input;
  for (const id of request.context.selection) {
    const node = page.nodes[id];
    if (node) return node;
  }
  const wanted = request.prompt.toLowerCase();
  const named = Object.values(page.nodes).find(
    (node) => node.id !== page.rootId && (node.name.toLowerCase().includes(wanted.trim()) || wanted.includes(node.name.toLowerCase())),
  );
  if (named) return named;
  const hero = Object.values(page.nodes).find((node) => /hero|banner|首屏/i.test(node.name));
  return hero ?? page.nodes[page.rootId] ?? null;
}

function percentOf(prompt: string): number | null {
  const match = prompt.match(/(\d{1,3})\s*%/);
  return match ? Number(match[1]) : null;
}

/** fontSize 可能是 token 引用：按文档 token 解析，解析不出数字就当 0，不猜尺寸。 */
function fontSizeOf(node: DesignNode, tokens: TokenStore, mode?: string | null): number {
  const value = Number(tokens.resolveValue(node.typography?.fontSize ?? 0, mode));
  return Number.isFinite(value) ? value : 0;
}

function opsPatch(ops: PatchOp[], summary: string, pageId: string): DesignPatchPayload {
  return { pageId, summary, ops: ops as unknown as DesignPatchPayload['ops'] };
}

const RULES: Rule[] = [
  {
    id: 'resize-height',
    match: (p) => /\d+\s*%/.test(p) && /(taller|shorter|更高|加高|更矮|降低高度|height)/i.test(p),
    apply: ({ page, request }) => {
      const percent = percentOf(request.prompt);
      const node = targetNode({ page, request });
      if (percent === null || !node) return null;
      const current = node.size.height;
      if (typeof current !== 'number') {
        return {
          summary: `无法按比例调整 ${node.name} 的高度`,
          explanation: `${node.name} 的高度是 ${String(current)}（由内容决定），需要先把高度设为具体数值。`,
          patches: [],
          activities: ['识别目标节点', '高度非数值 → 放弃修改'],
          label: '未修改',
        };
      }
      const shrink = /(shorter|更矮|降低)/i.test(request.prompt);
      const next = Math.max(1, Math.round(current * (1 + (shrink ? -percent : percent) / 100)));
      return {
        summary: `${node.name} 高度 ${current} → ${next}`,
        explanation: `把 ${node.name} 的高度按 ${shrink ? '-' : '+'}${percent}% 改成 ${next}px。`,
        patches: [opsPatch([{ op: 'set', nodeId: node.id, path: 'size.height', value: next }], `${node.name} 高度`, page.id)],
        activities: [`定位 ${node.name}`, `计算新高度 ${next}`, '写入 size.height'],
        label: '尺寸调整',
      };
    },
  },
  {
    id: 'palette-transfer',
    match: (p) => /(cinematic|电影感|dark fantasy|暗黑|cyber|赛博|visual style|视觉风格)/i.test(p),
    apply: ({ document, page, request }) => {
      const key = Object.keys(PALETTES).find((k) => new RegExp(k, 'i').test(request.prompt)) ?? 'cinematic';
      const palette = PALETTES[key]!;
      const ops: PatchOp[] = Object.entries(palette)
        .filter(([tokenKey]) => document.tokens.some((t) => t.key === tokenKey))
        .map(([tokenKey, value]) => ({ op: 'setToken', key: tokenKey, value }));
      const tokens = new TokenStore(document.tokens);
      const title = Object.values(page.nodes).find(
        (n) => n.type === 'text' && fontSizeOf(n, tokens, document.activeMode) >= 28,
      );
      if (title) {
        ops.push({ op: 'set', nodeId: title.id, path: 'typography.letterSpacing', value: 1.5 });
        ops.push({ op: 'set', nodeId: title.id, path: 'typography.lineHeight', value: 1.15 });
      }
      if (!ops.length) return null;
      return {
        summary: `切换到 ${key} 配色`,
        explanation: `改写 ${Object.keys(palette).length} 个颜色 token（不逐节点硬编码），标题加上字距与更紧的行高。`,
        patches: [opsPatch(ops, `视觉风格：${key}`, page.id)],
        activities: ['提取配色意图', '写 token', '标题排版微调'],
        label: key,
      };
    },
  },
  {
    id: 'mobile-layout',
    match: (p) => /(mobile|移动端|手机|responsive|响应式)/i.test(p) && /(better|优化|调整|改|layout|布局|make)/i.test(p),
    apply: ({ page, request }) => {
      const root = page.nodes[page.rootId];
      if (!root) return null;
      const targets = root.children.map((id) => page.nodes[id]).filter((n): n is DesignNode => Boolean(n));
      const node = targetNode({ page, request });
      const list = node && node.id !== root.id ? [node] : targets.length ? targets : [root];
      const ops: PatchOp[] = list
        .filter((n) => n.layout.mode === 'horizontal' || n.layout.mode === 'grid' || n.layout.columns)
        .map((n) => ({
          op: 'set',
          nodeId: n.id,
          path: 'responsive',
          value: [
            ...(n.responsive?.filter((r) => r.breakpoint !== 'mobile') ?? []),
            {
              breakpoint: 'mobile',
              patch: {
                layout: { mode: 'vertical', columns: 1, gap: Math.max(12, Number(n.layout.gap) || 16) },
                size: { width: 'fill' },
              },
            },
          ],
        }));
      if (!ops.length) {
        return {
          summary: '移动端无需改动',
          explanation: '当前页面里没有横向或网格布局的容器需要折叠。',
          patches: [],
          activities: ['扫描容器', '未发现需要折叠的布局'],
          label: '未修改',
        };
      }
      return {
        summary: `${ops.length} 个容器加上移动端规则`,
        explanation: `为 ${ops.length} 个容器写入 mobile 断点规则：改为纵向布局、单列、宽度填满。模型保留原尺寸，只在 375px 投影时生效。`,
        patches: [opsPatch(ops, '移动端布局规则', page.id)],
        activities: ['按 viewport 扫描布局', '生成 responsive 规则', '写入模型'],
        label: '响应式',
      };
    },
  },
  {
    id: 'add-section',
    match: (p) => /(add|新增|生成|加一个|insert).{0,12}(section|block|区块|定价|pricing|cta|hero|卡片)/i.test(p),
    apply: ({ page, request }) => {
      const root = page.nodes[page.rootId];
      if (!root) return null;
      const topic = /定价|pricing/i.test(request.prompt) ? '定价' : /卡片/.test(request.prompt) ? '亮点' : '行动号召';
      const ops: PatchOp[] = [];
      const section = createNode({
        type: 'section',
        name: `${topic} Section`,
        size: { width: 'fill', height: 'hug' },
        layout: { mode: 'vertical', gap: 24, padding: { top: 96, right: 40, bottom: 96, left: 40 }, justify: 'center', items: 'center' },
        style: { fills: [{ kind: 'solid', color: '{color.surface}' }] },
      });
      ops.push({ op: 'insert', node: section, parentId: root.id });
      const heading = createNode({
        type: 'text',
        name: `${topic} 标题`,
        text: topic === '定价' ? '选择适合你的宇宙' : topic === '亮点' ? '为什么选择 NEXUS' : '现在开始创作',
        size: { width: 'hug', height: 'hug' },
        typography: {
          fontFamily: '{font.display}',
          fontSize: 48,
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: -0.5,
          align: 'center',
          verticalAlign: 'top',
        },
        style: { fills: [{ kind: 'solid', color: '{color.text}' }] },
      });
      ops.push({ op: 'insert', node: heading, parentId: section.id });
      const row = createNode({
        type: 'grid',
        name: `${topic} 列表`,
        size: { width: 'fill', height: 'hug' },
        layout: { mode: 'grid', columns: 3, gap: 24, padding: { top: 0, right: 0, bottom: 0, left: 0 }, justify: 'start', items: 'stretch' },
      });
      ops.push({ op: 'insert', node: row, parentId: section.id });
      for (let i = 0; i < 3; i += 1) {
        const card = createNode({
          type: 'card',
          name: `${topic} ${i + 1}`,
          size: { width: 'fill', height: 'hug' },
          layout: { mode: 'vertical', gap: 12, padding: { top: 24, right: 24, bottom: 24, left: 24 }, justify: 'start', items: 'start' },
          style: {
            fills: [{ kind: 'solid', color: '{color.surface-2}' }],
            cornerRadius: { topLeft: 16, topRight: 16, bottomRight: 16, bottomLeft: 16 },
          },
        });
        ops.push({ op: 'insert', node: card, parentId: row.id });
        const label = createNode({
          type: 'text',
          name: `标题 ${i + 1}`,
          text: `${topic} ${i + 1}`,
          size: { width: 'fill', height: 'hug' },
          typography: { fontFamily: '{font.body}', fontSize: 18, fontWeight: 600, lineHeight: 1.4, letterSpacing: 0, align: 'left', verticalAlign: 'top' },
          style: { fills: [{ kind: 'solid', color: '{color.text}' }] },
        });
        ops.push({ op: 'insert', node: label, parentId: card.id });
      }
      const button = createNode({
        type: 'button',
        name: `${topic} CTA`,
        text: '开始使用',
        size: { width: 'hug', height: 48 },
        style: {
          fills: [{ kind: 'solid', color: '{color.primary}' }],
          cornerRadius: { topLeft: 10, topRight: 10, bottomRight: 10, bottomLeft: 10 },
        },
        typography: { fontFamily: '{font.body}', fontSize: 15, fontWeight: 600, lineHeight: 1.2, letterSpacing: 0, align: 'center', verticalAlign: 'top' },
      });
      ops.push({ op: 'insert', node: button, parentId: section.id });
      return {
        summary: `插入${topic}区块`,
        explanation: `按当前 token 生成一个 ${topic} 区块（标题 + 三列卡片 + CTA），全部样式走 token 引用，因此换主题时会自动跟随。`,
        patches: [opsPatch(ops, `插入${topic}区块`, page.id)],
        activities: ['解析意图', '组装节点树', '绑定 token', '插入页面'],
        label: '结构生成',
      };
    },
  },
  {
    id: 'audit',
    match: (p) => /(accessibility|a11y|无障碍|contrast|对比度|find issues|检查|quality)/i.test(p),
    apply: ({ document, request }) => {
      const issues = [...validateDocument(document), ...lintDesign(document)];
      const counts = summarizeIssues(issues);
      const relevant = issues.filter((i) => i.code === 'low-contrast' || i.code === 'tap-target-small' || i.code === 'missing-alt' || i.code === 'off-px-spacing' || i.code === 'no-text-on-button' || i.code === 'bad-binding');
      const top = relevant.slice(0, 6);
      return {
        summary: `质检：${counts.error} 错误 / ${counts.warning} 警告`,
        explanation: top.length
          ? `发现 ${relevant.length} 个可访问性/间距问题：\n${top.map((i) => `· [${i.severity}] ${i.message}${i.suggestion ? ` → ${i.suggestion}` : ''}`).join('\n')}`
          : `没有发现对比度、点击目标或间距问题。结构检查：${counts.error} 错误、${counts.warning} 警告（来自 ${document.pages.length} 个页面 / 设计系统检查）。`,
        patches: [],
        activities: ['结构校验', '对比度/点击目标/间距 lint', '汇总'],
        label: /(对比度|contrast)/i.test(request.prompt) ? '可访问性' : '质检',
      };
    },
  },
];

export class DeterministicMockProvider implements AiProvider {
  readonly name = 'mock';
  readonly model = 'nexus-deterministic-v1';

  async run(request: AiRequest): Promise<AiResponse> {
    const started = Date.now();
    const base = {
      requestId: request.requestId,
      provider: this.name,
      model: this.model,
      capability: 'demo' as const,
      usage: {
        provider: this.name,
        model: this.model,
        modelClass: request.modelClass as ModelClass,
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: 0,
        costUsd: 0,
        toolCalls: 0,
        demoMode: true,
      },
      plans: [] as AgentPlan[],
      patches: [] as DesignPatchPayload[],
      labels: [] as string[],
      activities: [] as AgentActivity[],
      explanation: '',
      approvals: [],
    };

    const document = request.context.document as unknown as DesignDocument | undefined;
    const page = document ? (findPage(document, request.context.pageId) ?? document.pages[0]) : undefined;
    if (!document || !page) {
      return {
        ...base,
        error: { code: 'invalid-context', message: '请求里没有可用的设计文档', retryable: false },
      };
    }

    const rule = RULES.find((r) => r.match(request.prompt));
    if (!rule) {
      return {
        ...base,
        error: {
          code: 'provider-unavailable',
          message: '当前是确定性 Mock，只实现了有限的指令类型',
          hint: '可试："把 X 提高 30%" / "更电影感" / "移动端布局优化" / "加一个定价区块" / "检查无障碍"。接入真实 provider 后由模型规划。',
          retryable: false,
        },
      };
    }

    const result = rule.apply({ document, page, request });
    const activity = (stage: string, summary: string, status: AgentActivity['status'] = 'completed'): AgentActivity => ({
      stage,
      summary,
      status,
      at: new Date().toISOString(),
    });

    const plan: AgentPlan = {
      goal: request.prompt.slice(0, 200),
      constraints: ['只修改设计模型（§16）', '样式尽量走 token（§12）'],
      tasks: [{ id: 't1', title: result?.summary ?? rule.id, agent: 'DesignAgent', status: result ? 'done' : 'failed', dependsOn: [], artifact: 'DesignPatch' }],
      dependencies: [],
      risks: [],
      validation: ['validateDocument 无错误', 'Ctrl+Z 可整体回滚'],
    };

    return {
      ...base,
      plans: [plan],
      labels: result ? [result.label] : [],
      patches: result?.patches ?? [],
      explanation: result?.explanation ?? '没有可执行的确定性改动。',
      activities: [
        activity('intent', `规则 ${rule.id} 命中：${result?.summary ?? '无改动'}`),
        ...(result?.activities.map((step) => activity('plan-step', step)) ?? []),
        activity('apply', result?.patches.length ? `${result.patches.length} 个补丁、${result.patches.reduce((n, p) => n + p.ops.length, 0)} 个 op 已落地` : '未产生补丁'),
      ],
      usage: { ...base.usage, latencyMs: Date.now() - started + 1 },
    };
  }
}

export const mockProvider = new DeterministicMockProvider();
