import { z } from 'zod';

/**
 * web ↔ ai-service 的跨端契约（docs/ARCHITECTURE.md 边界纪律 6）。
 * 两侧都不得自定义形状；新增字段必须先改这里。
 */

/** §159-160：任何生成结果必须自证来源，前端据此显示 DEMO MODE */
export const CapabilityStatus = z.enum(['real', 'demo', 'unavailable']);
export type CapabilityStatus = z.infer<typeof CapabilityStatus>;

export const ModelClass = z.enum(['fast', 'balanced', 'reasoning', 'vision', 'image', 'video', 'embedding', 'reranker']);
export type ModelClass = z.infer<typeof ModelClass>;

export const NodeTypeEnum = z.enum([
  'frame', 'section', 'container', 'group', 'text', 'image', 'video', 'svg', 'shape', 'button',
  'input', 'card', 'list', 'grid', 'component', 'instance', 'code', 'three', 'webgl',
]);

/** 设计补丁 op：与 @nexus/design-model 的 PatchOp 一一对应 */
export const PatchOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set'), nodeId: z.string(), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal('merge'), nodeId: z.string(), path: z.string().optional().default(''), value: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal('insert'), node: z.record(z.string(), z.unknown()), parentId: z.string(), index: z.number().int().min(0).optional() }),
  z.object({ op: z.literal('remove'), nodeId: z.string() }),
  z.object({ op: z.literal('reparent'), nodeId: z.string(), parentId: z.string(), index: z.number().int().min(0).optional() }),
  z.object({ op: z.literal('reorder'), parentId: z.string(), from: z.number().int().min(0), to: z.number().int().min(0) }),
  z.object({ op: z.literal('setToken'), key: z.string(), value: z.unknown(), mode: z.string().optional() }),
  z.object({ op: z.literal('addToken'), token: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal('removeToken'), key: z.string() }),
  z.object({ op: z.literal('addComponent'), component: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal('addAsset'), asset: z.record(z.string(), z.unknown()) }),
  // 资产删除有 document 全域可达（清单 + 所有页面的引用一起清理），逆操作带回原样
  z.object({ op: z.literal('removeAsset'), assetId: z.string() }),
  z.object({
    op: z.literal('restoreAsset'),
    asset: z.record(z.string(), z.unknown()),
    paints: z.array(z.record(z.string(), z.unknown())).default([]),
    nodes: z.array(z.record(z.string(), z.unknown())).default([]),
  }),
  // §30/§174：Visual DNA 是文档级约束，null 表示清掉
  z.object({ op: z.literal('setVisualDna'), dna: z.record(z.string(), z.unknown()).nullable() }),
  z.object({ op: z.literal('addPage'), page: z.record(z.string(), z.unknown()), setActive: z.boolean().optional() }),
  z.object({ op: z.literal('removePage'), pageId: z.string() }),
]);
export type PatchOpPayload = z.infer<typeof PatchOpSchema>;

export const DesignPatchSchema = z.object({
  id: z.string().optional(),
  summary: z.string().max(500).optional(),
  pageId: z.string().optional(),
  ops: z.array(PatchOpSchema).max(4000),
});
export type DesignPatchPayload = z.infer<typeof DesignPatchSchema>;

/** §25 Agent Plan */
export const AgentPlanSchema = z.object({
  goal: z.string(),
  constraints: z.array(z.string()).default([]),
  tasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        agent: z.string(),
        status: z.enum(['pending', 'running', 'done', 'failed', 'skipped']).default('pending'),
        dependsOn: z.array(z.string()).default([]),
        /** 该任务产出什么，供 handoff 与 UI 显示（§113） */
        artifact: z.string().optional(),
      }),
    )
    .default([]),
  dependencies: z.array(z.tuple([z.string(), z.string()])).default([]),
  risks: z.array(z.string()).default([]),
  validation: z.array(z.string()).default([]),
});
export type AgentPlan = z.infer<typeof AgentPlanSchema>;

/** §26 Activity Feed：只允许安全的工作状态，禁止透传隐藏推理 */
export const AgentActivitySchema = z.object({
  stage: z.string(),
  status: z.enum(['started', 'running', 'completed', 'failed', 'info']),
  summary: z.string().max(400),
  counts: z.record(z.string(), z.number()).optional(),
  artifactRef: z.string().optional(),
  at: z.string().datetime().optional(),
});
export type AgentActivity = z.infer<typeof AgentActivitySchema>;

export const UsageSchema = z.object({
  provider: z.string(),
  model: z.string(),
  modelClass: ModelClass,
  tokensIn: z.number().int().min(0).default(0),
  tokensOut: z.number().int().min(0).default(0),
  latencyMs: z.number().min(0).default(0),
  costUsd: z.number().min(0).default(0),
  toolCalls: z.number().int().min(0).default(0),
  demoMode: z.boolean().default(false),
});
export type Usage = z.infer<typeof UsageSchema>;

/** §66 Design Context：Agent 必须拿到上下文而不是每次重推 */
export const DesignContextSchema = z.object({
  projectId: z.string(),
  pageId: z.string().optional(),
  viewport: z.enum(['mobile', 'tablet', 'desktop', 'wide']).optional(),
  selection: z.array(z.string()).default([]),
  /** 选中节点的紧凑描述（类型/名称/尺寸/关键样式），避免整文档塞进模型（§68） */
  selectionDigest: z.array(z.record(z.string(), z.unknown())).default([]),
  designSystemDigest: z
    .object({
      tokens: z.array(z.object({ key: z.string(), type: z.string(), value: z.unknown() })).default([]),
      components: z.array(z.object({ id: z.string(), name: z.string(), props: z.record(z.string(), z.unknown()).default({}) })).default([]),
    })
    .default({ tokens: [], components: [] }),
  /** 完整文档仅在需要结构改写时提供（小项目 / M1 可行） */
  document: z.record(z.string(), z.unknown()).optional(),
  recentChanges: z.array(z.object({ label: z.string(), source: z.enum(['manual', 'ai', 'system', 'import']) })).default([]),
  brandKit: z.record(z.string(), z.unknown()).optional(),
  visualDna: z.record(z.string(), z.unknown()).optional(),
});
export type DesignContext = z.infer<typeof DesignContextSchema>;

export const AiRequestSchema = z.object({
  requestId: z.string(),
  /** 意图类别由前端预选或让 Agent 判定；未知时服务端按 design-edit 处理 */
  intent: z
    .enum(['design-generate', 'design-edit', 'style-transfer', 'component-create', 'code-from-design', 'critique', 'research', 'freeform'])
    .default('design-edit'),
  prompt: z.string().min(1).max(4000),
  modelClass: ModelClass.default('balanced'),
  /** 多方案生成数量（§29/§117），1-4 */
  variants: z.number().int().min(1).max(4).default(1),
  context: DesignContextSchema,
  /** 参考图（§30）：data url 或资产 id */
  references: z.array(z.object({ assetId: z.string().optional(), dataUrl: z.string().optional(), kind: z.enum(['screenshot', 'photo', 'moodboard', 'url']).default('screenshot') })).default([]),
  /** §74/§177 人工审批策略；未列出的动作视为允许 */
  approvalPolicy: z.array(z.enum(['delete', 'publish-public', 'spend-credits', 'send-message', 'deploy-production', 'payment'])).default([]),
  dryRun: z.boolean().default(false),
});
export type AiRequest = z.infer<typeof AiRequestSchema>;

export const AiErrorSchema = z.object({
  code: z.enum(['provider-unavailable', 'provider-failed', 'invalid-context', 'permission-denied', 'approval-required', 'budget-exceeded', 'validation-failed', 'internal']),
  message: z.string(),
  /** 给用户看的下一步；不允许内部堆栈（§26） */
  hint: z.string().optional(),
  retryable: z.boolean().default(false),
});
export type AiError = z.infer<typeof AiErrorSchema>;

export const AiResponseSchema = z.object({
  requestId: z.string(),
  capability: CapabilityStatus,
  provider: z.string(),
  model: z.string(),
  /** 一个意图可能产出多个方案（§29） */
  plans: z.array(AgentPlanSchema).default([]),
  patches: z.array(DesignPatchSchema).default([]),
  /** 方案标签，与 patches 一一对应 */
  labels: z.array(z.string()).default([]),
  activities: z.array(AgentActivitySchema).default([]),
  explanation: z.string().max(2000).default(''),
  usage: UsageSchema,
  error: AiErrorSchema.optional(),
  /** 需要审批时挂起，不执行（§74） */
  approvals: z.array(z.object({ action: z.string(), reason: z.string() })).default([]),
});
export type AiResponse = z.infer<typeof AiResponseSchema>;

/** §163 实时事件（WebSocket） */
export const RealtimeEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('agent.plan'), projectId: z.string(), taskId: z.string(), plan: AgentPlanSchema }),
  z.object({ type: z.literal('agent.step'), projectId: z.string(), taskId: z.string(), stepId: z.string(), status: z.enum(['started', 'running', 'completed', 'failed']), summary: z.string() }),
  z.object({ type: z.literal('agent.activity'), projectId: z.string(), taskId: z.string(), activity: AgentActivitySchema }),
  z.object({ type: z.literal('generation.progress'), projectId: z.string(), taskId: z.string(), kind: z.enum(['image', 'video', '3d', 'agent']), progress: z.number().min(0).max(1), message: z.string().optional() }),
  z.object({ type: z.literal('build.status'), projectId: z.string(), status: z.enum(['idle', 'building', 'ok', 'failed']), log: z.string().optional() }),
  z.object({ type: z.literal('preview.status'), projectId: z.string(), status: z.enum(['idle', 'starting', 'ready', 'failed']), url: z.string().optional() }),
  z.object({ type: z.literal('notification'), projectId: z.string().optional(), level: z.enum(['info', 'success', 'warning', 'error']), title: z.string(), body: z.string().optional() }),
]);
export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>;

export const ScreenshotRequestSchema = z.object({
  url: z.string().url(),
  width: z.number().int().min(240).max(4096).default(1280),
  height: z.number().int().min(240).max(4096).default(800),
  fullPage: z.boolean().default(true),
  devices: z.array(z.enum(['mobile', 'tablet', 'desktop', 'wide'])).default([]),
});
export type ScreenshotRequest = z.infer<typeof ScreenshotRequestSchema>;

export const VisualQaIssueSchema = z.object({
  kind: z.enum(['overflow', 'low-contrast', 'misaligned', 'clipped-text', 'empty-region', 'inconsistent-spacing', 'tap-target', 'layout-shift']),
  severity: z.enum(['error', 'warning', 'info']),
  nodeId: z.string().optional(),
  message: z.string(),
  recommendation: z.string().optional(),
});
export type VisualQaIssue = z.infer<typeof VisualQaIssueSchema>;

export const ScreenshotResponseSchema = z.object({
  capability: CapabilityStatus,
  /** PNG base64（不含 data: 前缀）或对象存储 key */
  imageBase64: z.string().optional(),
  storageKey: z.string().optional(),
  width: z.number(),
  height: z.number(),
  issues: z.array(VisualQaIssueSchema).default([]),
  consoleErrors: z.array(z.string()).default([]),
  metrics: z
    .object({ lcpMs: z.number().optional(), cls: z.number().optional(), inpMs: z.number().optional(), bundleBytes: z.number().optional() })
    .optional(),
});
export type ScreenshotResponse = z.infer<typeof ScreenshotResponseSchema>;

export const HealthResponseSchema = z.object({
  service: z.string(),
  version: z.string(),
  capability: CapabilityStatus,
  providers: z
    .array(
      z
        .object({
          kind: z.enum(['llm', 'image', 'video', 'embedding', 'speech']),
          name: z.string(),
          status: CapabilityStatus,
          models: z.array(z.string()).default([]),
          /** 为什么是 demo/unavailable；给就绪面板直接显示原因，不藏在服务端日志里 */
          reason: z.string().optional(),
        }),
    )
    .default([]),
  queue: z.object({ pending: z.number().int().default(0), running: z.number().int().default(0) }).default({ pending: 0, running: 0 }),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/**
 * §30 参考图 → Visual DNA 的提取请求/响应（浏览器 ↔ web 服务端）。
 * 提取在 web 服务端做（它才拿得到存储里的字节），客户端只负责把结果作为一个
 * 可撤销事务写回模型——所以这里传的是 DNA 本身，不是"已经保存好了"的谎话。
 */
export const VisualDnaRequestSchema = z.object({
  assetId: z.string().min(1).max(128),
});
export type VisualDnaRequest = z.infer<typeof VisualDnaRequestSchema>;

export const VisualDnaSchema = z.object({
  source: z
    .object({
      assetId: z.string().optional(),
      method: z.enum(['pixel-stats', 'vision-model', 'concept-language']),
      extractedAt: z.string(),
      notes: z.array(z.string()).default([]),
    })
    .optional(),
  palette: z.array(z.object({ role: z.string(), color: z.string() })).default([]),
  typography: z.array(z.record(z.string(), z.unknown())).optional(),
  spacingScale: z.array(z.number()).optional(),
  radius: z.number().optional(),
  shadow: z.string().optional(),
  motion: z.record(z.string(), z.unknown()).optional(),
  hierarchy: z.array(z.string()).optional(),
  descriptors: z.array(z.string()).default([]),
});
export type VisualDnaPayload = z.infer<typeof VisualDnaSchema>;

export const VisualDnaResponseSchema = z.object({
  ok: z.literal(true),
  assetId: z.string(),
  dna: VisualDnaSchema,
  /** 实测数字一并回给客户端：描述符必须能被追溯到统计量，不让人对着形容词猜 */
  stats: z.object({
    width: z.number().int(),
    height: z.number().int(),
    samples: z.number().int(),
    meanLuminance: z.number(),
    luminanceStdev: z.number(),
    meanSaturation: z.number(),
    edgeDensity: z.number(),
    warmth: z.number(),
    palette: z.array(z.object({ color: z.string(), share: z.number() })).default([]),
  }),
});
export type VisualDnaResponse = z.infer<typeof VisualDnaResponseSchema>;

/**
 * §178 项目健康 / §179 Quality Gate 的跨端形状。
 *
 * 算法只有一份（`@nexus/design-model` 的 analyzeHealth），但 Studio 实时显示的那份和
 * 服务器挡下发布时返回的那份要能对齐，所以报文照样过 zod。Issue.code 在这里刻意用
 * string 而不是枚举：枚举由设计模型定义，抄一份到 schema 就是多一处会漂移的地方。
 */
export const ProjectHealthFindingSchema = z.object({
  code: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  pageId: z.string().optional(),
  nodeId: z.string().optional(),
  path: z.string().optional(),
  suggestion: z.string().optional(),
});
export type ProjectHealthFinding = z.infer<typeof ProjectHealthFindingSchema>;

export const ProjectHealthCheckSchema = z.object({
  id: z.enum(['build', 'tests', 'accessibility', 'performance', 'visual-qa', 'ai-qa', 'security']),
  label: z.string(),
  /** null = 这一项没测。不许用 0 或 100 冒充它 */
  score: z.number().min(0).max(100).nullable(),
  gating: z.boolean(),
  threshold: z.number().min(0).max(100).nullable(),
  state: z.enum(['pass', 'fail', 'not-run']),
  basis: z.string(),
  findings: z.array(ProjectHealthFindingSchema).default([]),
  omitted: z.number().int().min(0).default(0),
  metrics: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
});
export type ProjectHealthCheck = z.infer<typeof ProjectHealthCheckSchema>;

export const ProjectHealthReportSchema = z.object({
  checks: z.array(ProjectHealthCheckSchema),
  passed: z.boolean(),
  blockers: z.array(z.string()).default([]),
  notRun: z.array(z.string()).default([]),
});
export type ProjectHealthReport = z.infer<typeof ProjectHealthReportSchema>;

/**
 * §44 世界文档的跨端形状（M3 第一切片）。
 *
 * 权威在 `@nexus/world-model`（类型与结构校验都那儿），这里只负责传输层：
 * 路由收到的 JSON 必须先过这份 zod 才允许落库。九类的清单在两处各有一份是没办法的事
 * （z.enum 要字面量），所以 `test/world-contract.test.ts` 拿模型对齐它们——漂移会在测试里炸，
 * 而不是变成"模型认得、库里存不下"的静默不一致。
 */
export const WorldKindSchema = z.enum([
  'lore',
  'history',
  'geography',
  'factions',
  'characters',
  'creatures',
  'items',
  'quests',
  'story',
]);
export type WorldKindPayload = z.infer<typeof WorldKindSchema>;

export const WorldNodeSchema = z.object({
  id: z.string().min(1).max(128),
  kind: WorldKindSchema,
  // trim 之后才算非空：'  ' 过 min(1) 是 zod 的默认行为，不 trim 就等于允许没有名字的条目进库
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20_000),
  updatedAt: z.string().min(1),
});
export type WorldNodePayload = z.infer<typeof WorldNodeSchema>;

export const WorldPointSchema = z.object({
  x: z.number().finite().min(-100_000).max(100_000),
  y: z.number().finite().min(-100_000).max(100_000),
});

export const WorldLinkSchema = z.object({
  id: z.string().min(1).max(128),
  from: z.string().min(1).max(128),
  to: z.string().min(1).max(128),
  label: z.string().max(120),
});
export type WorldLinkPayload = z.infer<typeof WorldLinkSchema>;

export const WorldDocumentSchema = z.object({
  id: z.string().min(1).max(128),
  projectId: z.string().max(128).nullable(),
  name: z.string().trim().min(1).max(120),
  summary: z.string().max(2000),
  nodes: z.array(WorldNodeSchema).max(5000),
  // default 不是偷懒：上一版存进来的世界没有这两项，缺字段必须仍然读得出来，
  // 而不是让老项目一打开面板就报"契约不符"。
  links: z.array(WorldLinkSchema).max(5000).default([]),
  positions: z.record(z.string(), WorldPointSchema).default({}),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type WorldDocumentPayload = z.infer<typeof WorldDocumentSchema>;

/** PUT 的请求体：整个文档一起换（世界文档比设计文档小得多，不需要增量补丁） */
export const WorldSaveRequestSchema = z.object({ document: WorldDocumentSchema });
export type WorldSaveRequest = z.infer<typeof WorldSaveRequestSchema>;

/**
 * §46 角色档案的跨端形状。权威在 @nexus/world-model，这里是传输层。
 * 没有 memory 字段不是漏了：§48 的记忆是独立存储，档案里塞一个"记忆"文本框
 * 就会造出第二个记忆真值（两边迟早对不上）。
 */
export const CharacterRelationshipSchema = z.object({
  target: z.string().trim().max(128),
  kind: z.string().trim().max(120),
  note: z.string().max(2000),
});

export const CharacterProfileSchema = z.object({
  name: z.string().trim().max(120),
  appearance: z.string().max(8000),
  personality: z.string().max(8000),
  backstory: z.string().max(20_000),
  goals: z.array(z.string().trim().min(1).max(500)).max(100),
  fears: z.array(z.string().trim().min(1).max(500)).max(100),
  relationships: z.array(CharacterRelationshipSchema).max(200),
  voice: z.object({
    register: z.string().max(500),
    pace: z.string().max(500),
    catchphrases: z.array(z.string().trim().min(1).max(500)).max(100),
    notes: z.string().max(8000),
  }),
  visualIdentity: z.object({
    palette: z.array(z.string().max(32)).max(24),
    silhouette: z.string().max(2000),
    motifs: z.array(z.string().trim().min(1).max(500)).max(100),
    referenceAssetId: z.string().max(128).nullable(),
  }),
});

export const CharacterSchema = z.object({
  id: z.string().min(1).max(128),
  projectId: z.string().max(128).nullable(),
  worldId: z.string().max(128).nullable(),
  profile: CharacterProfileSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type CharacterPayload = z.infer<typeof CharacterSchema>;

/** 建档只给名字，其余字段留空：AI 生成角色设定要真 provider，这里不做假生成（§159） */
export const CharacterCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  worldId: z.string().max(128).nullable().optional(),
});

export const CharacterUpdateRequestSchema = z.object({ profile: CharacterProfileSchema });

export { NodeTypeEnum as DesignNodeType };
