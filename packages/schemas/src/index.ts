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
  // 组件删除同样有 document 全域可达（定义 + 所有页面里引用它的实例一起解开），
  // 并且它带进了 §74 的破坏性 op 名单：web 与 ai-service 两边各扫各的，漏一边等于没门
  z.object({ op: z.literal('removeComponent'), componentId: z.string() }),
  z.object({
    op: z.literal('restoreComponent'),
    component: z.record(z.string(), z.unknown()),
    nodes: z.array(z.record(z.string(), z.unknown())).default([]),
  }),
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

/**
 * §70 Design Index 的线格式。
 *
 * 权威在 `@nexus/design-model`（怎么算是那儿决定的），这里只规定"出了进程长什么样"。
 * 形状里刻意带上 `dropped` / `trimmed` / `omissions`：一次裁剪必须随报文一起出去，
 * 否则客户端只能靠猜知道这份目录被压过（§159）。
 */
export const DesignIndexTotalsSchema = z.object({
  pages: z.number().int().min(0),
  nodes: z.number().int().min(0),
  reachableNodes: z.number().int().min(0),
  unreachableNodes: z.number().int().min(0),
  frames: z.number().int().min(0),
  sections: z.number().int().min(0),
  components: z.number().int().min(0),
  unusedComponents: z.number().int().min(0),
  instances: z.number().int().min(0),
  assets: z.number().int().min(0),
  orphanAssets: z.number().int().min(0),
  tokens: z.number().int().min(0),
  unusedTokens: z.number().int().min(0),
  undeclaredTokenRefs: z.number().int().min(0),
  interactions: z.number().int().min(0),
  edges: z.number().int().min(0),
  textChars: z.number().int().min(0),
});

export const DesignIndexSchema = z.object({
  schemaVersion: z.literal(1),
  generatedFrom: z.object({
    documentId: z.string(),
    documentName: z.string(),
    updatedAt: z.string(),
  }),
  pages: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      route: z.string().nullable(),
      nodeCount: z.number().int().min(0),
      reachable: z.number().int().min(0),
      frames: z.number().int().min(0),
      sections: z.number().int().min(0),
      textChars: z.number().int().min(0),
      components: z.array(z.string()),
      assets: z.array(z.string()),
      tokens: z.number().int().min(0),
      interactions: z.number().int().min(0),
      maxDepth: z.number().int().min(0),
      viewport: z.object({ width: z.number(), height: z.number() }),
    }),
  ),
  frames: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.enum(['frame', 'section']),
      pageId: z.string(),
      pageName: z.string(),
      parent: z.string().nullable(),
      depth: z.number().int().min(0),
      childCount: z.number().int().min(0),
      layoutMode: z.string(),
      size: z.object({ width: z.union([z.number(), z.string()]), height: z.union([z.number(), z.string()]) }),
      textPreview: z.string(),
    }),
  ),
  components: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      definedOnPage: z.string().nullable(),
      props: z.array(z.string()),
      variants: z.number().int().min(0),
      slots: z.array(z.string()),
      instances: z.number().int().min(0),
      usedOnPages: z.array(z.string()),
      unused: z.boolean(),
    }),
  ),
  assets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.string(),
      usedByNodes: z.number().int().min(0),
      usedOnPages: z.array(z.string()),
      orphaned: z.boolean(),
    }),
  ),
  tokens: z.array(
    z.object({
      key: z.string(),
      type: z.string(),
      group: z.string().nullable(),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
      modes: z.number().int().min(0),
      usedByNodes: z.number().int().min(0),
      via: z.array(z.enum(['binding', 'value'])),
      used: z.boolean(),
    }),
  ),
  interactions: z.array(
    z.object({
      id: z.string(),
      pageId: z.string(),
      pageName: z.string(),
      nodeId: z.string(),
      nodeName: z.string(),
      trigger: z.string(),
      action: z.string(),
      target: z.string().nullable(),
      targetName: z.string().nullable(),
    }),
  ),
  edges: z.array(
    z.object({ from: z.string(), to: z.string(), kind: z.enum(['instance', 'asset', 'token', 'interaction']) }),
  ),
  totals: DesignIndexTotalsSchema,
  omissions: z.array(z.string()),
  dropped: z
    .object({
      frames: z.number().int().min(0),
      edges: z.number().int().min(0),
      interactions: z.number().int().min(0),
      textPreviews: z.number().int().min(0),
    })
    .optional(),
  trimmed: z.array(z.string()).optional(),
});
export type DesignIndexPayload = z.infer<typeof DesignIndexSchema>;

/**
 * §69 Code Index 的跨端形状。服务端算目录（apps/web/src/server/domain/code-index.ts），
 * 面板与 provider 看的都是这一份，所以字段一个都不许少：目录说自己"不完整"的那些计数
 * （dropped / unresolvedDeps / unreadableFiles）一旦在传输层被剥掉，读的人就以为拿到的是全量。
 */
export const CodeSymbolSchema = z.object({
  name: z.string(),
  kind: z.enum(['function', 'component', 'class', 'variable', 'interface', 'type', 'enum', 'css-variable']),
  line: z.number().int().min(1),
  exported: z.boolean(),
  params: z.array(z.string()),
});

export const CodeFileOriginSchema = z.union([
  z.object({ kind: z.literal('page'), pageId: z.string(), pageName: z.string() }),
  z.object({ kind: z.literal('tokens') }),
  z.object({ kind: z.literal('barrel') }),
  z.object({
    kind: z.literal('node-region'),
    pageId: z.string(),
    pageName: z.string(),
    nodeId: z.string(),
    nodeName: z.string(),
  }),
]);

export const CodeFileEntrySchema = z.object({
  path: z.string(),
  language: z.enum(['tsx', 'ts', 'css', 'text']),
  origin: CodeFileOriginSchema,
  lines: z.number().int().min(0),
  chars: z.number().int().min(0),
  symbols: z.array(CodeSymbolSchema),
  deps: z.array(z.string()),
  externals: z.array(z.string()),
  unresolvedDeps: z.array(z.string()),
  designAnchors: z.number().int().min(0),
  /** null 是"这类文件不做语法解析"，不是"0 个错" */
  syntaxErrors: z.number().int().min(0).nullable(),
});

export const CodeIndexSchema = z.object({
  schemaVersion: z.literal(1),
  generatedFrom: z.object({
    documentId: z.string(),
    documentName: z.string(),
    updatedAt: z.string(),
    mode: z.string().nullable(),
  }),
  files: z.array(CodeFileEntrySchema),
  totals: z.object({
    files: z.number().int().min(0),
    pageFiles: z.number().int().min(0),
    nodeRegionFiles: z.number().int().min(0),
    symbols: z.number().int().min(0),
    exportedSymbols: z.number().int().min(0),
    components: z.number().int().min(0),
    functions: z.number().int().min(0),
    classes: z.number().int().min(0),
    interfaces: z.number().int().min(0),
    internalDeps: z.number().int().min(0),
    externalDeps: z.number().int().min(0),
    unresolvedDeps: z.number().int().min(0),
    codeChars: z.number().int().min(0),
    unreadableFiles: z.number().int().min(0),
    nodeRegionChars: z.number().int().min(0),
  }),
  omissions: z.array(z.string()),
  dropped: z
    .object({
      files: z.number().int().min(0),
      symbols: z.number().int().min(0),
      anchors: z.boolean(),
    })
    .optional(),
  trimmed: z.array(z.string()).optional(),
});
export type CodeIndexPayload = z.infer<typeof CodeIndexSchema>;

/** 发给 provider 的那一份代码目录：按这轮请求排过序，命中理由逐条带着 */
export const CodeDigestSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.string().nullable(),
  query: z.string().nullable(),
  files: z.array(
    z.object({
      path: z.string(),
      language: z.enum(['tsx', 'ts', 'css', 'text']),
      origin: z.string(),
      pageName: z.string().nullable(),
      lines: z.number().int().min(0),
      symbols: z.array(z.string()),
      deps: z.array(z.string()),
      externals: z.array(z.string()),
      unresolvedDeps: z.array(z.string()),
      reasons: z.array(z.string()),
    }),
  ),
  totals: CodeIndexSchema.shape.totals,
  budgetChars: z.number().int().min(0),
  omittedFiles: z.number().int().min(0),
  trimmed: z.array(z.string()),
  omissions: z.array(z.string()),
});
export type CodeDigestPayload = z.infer<typeof CodeDigestSchema>;

/**
 * §68：这一轮的"现场"由服务端从权威文档算出来，客户端只报 pageId + selection 这些 id。
 * 所以这份结构是**服务端 → ai-service** 的方向；客户端在请求里带它会被 `/api/ai/run` 拒掉。
 */
export const SelectionDigestSchema = z.object({
  schemaVersion: z.literal(1),
  requested: z.number().int().min(0),
  limit: z.number().int().min(0),
  entries: z.array(
    z.object({
      nodeId: z.string(),
      pageId: z.string(),
      pageName: z.string(),
      type: z.string(),
      name: z.string(),
      parent: z.string().nullable(),
      /** null = 文档里有这个节点，但从页面根走不到（孤儿）；不是"不存在" */
      depth: z.number().int().min(0).nullable(),
      childCount: z.number().int().min(0),
      size: z.object({ width: z.union([z.number(), z.string()]), height: z.union([z.number(), z.string()]) }),
      text: z.string().nullable(),
      /** 数字是绝对值；字符串表示这里引用了 token（形如 `{typography.h1}`），模型应当沿用而不是写死 */
      fontSize: z.union([z.number(), z.string()]).nullable(),
      tokenRefs: z.array(z.string()),
      componentOf: z.string().nullable(),
      assetRef: z.string().nullable(),
    }),
  ),
  /** 文档里根本没有的 id：如实带出去，模型才知道"这几个改不了"而不是凭空造 */
  missing: z.array(z.string()),
  unreachable: z.array(z.string()),
  dropped: z.array(z.string()),
  omissions: z.array(z.string()),
});
export type SelectionDigestPayload = z.infer<typeof SelectionDigestSchema>;

/**
 * §111 画布批注随上下文发给模型的那一份。
 * 与 selectionDigest 同一条纪律：由服务端按库里的批注 + 权威文档算出来，
 * 客户端上传一律 400 —— 否则"我在某个元素上留过话"就成了请求方自述。
 */
export const AnnotationContextSchema = z.object({
  nodeId: z.string(),
  pageId: z.string(),
  pageName: z.string(),
  nodeName: z.string(),
  body: z.string().max(1000),
});
export type AnnotationContext = z.infer<typeof AnnotationContextSchema>;

/** §66 Design Context：Agent 必须拿到上下文而不是每次重推 */
/**
 * §49 × §66-71：按相关性从项目语料库取回、发给模型的那几段摘录。
 *
 * 每一项都带出处（`sourceType` / `sourceId` / 第几块）与命中方式（`matchedBy`）：
 * 只发正文的话，模型既没法指认它引用了哪一条设定，也没法在设定冲突时说出改了哪一句。
 * `query` 为 null 表示"这一轮没有查"，与"查了但都不相关"（query 有值、items 空）是两件事，
 * 报文上必须长得不同。`omitted` 是被字符预算裁掉的相关块数——没带进来不等于项目里没有。
 */
export const CorpusDigestSchema = z.object({
  query: z.string().nullable(),
  candidates: z.number().int().min(0),
  used: z.number().int().min(0),
  omitted: z.number().int().min(0),
  budgetChars: z.number().int().min(0),
  usedChars: z.number().int().min(0),
  vectorAvailable: z.boolean(),
  items: z.array(
    z.object({
      sourceType: z.string(),
      sourceId: z.string(),
      chunkIndex: z.number().int().min(0),
      title: z.string(),
      excerpt: z.string(),
      score: z.number(),
      matchedBy: z.array(z.enum(['fulltext', 'substring'])),
    }),
  ),
});
export type CorpusDigest = z.infer<typeof CorpusDigestSchema>;

/** 语料摘录的默认字符预算。放在契约这一层是因为它同时是夹具与装配的公共参数（§68） */
export const DEFAULT_CORPUS_CHAR_BUDGET = 4000;

/**
 * "这一轮没查语料库"的那一份。契约层给唯一的出处：装配（`domain/context.ts`）与
 * Python 夹具（`scripts/ai-request-fixture.ts`）都从这里拿，两边各写一份就必然漂移。
 */
export function emptyCorpusDigest(budgetChars: number = DEFAULT_CORPUS_CHAR_BUDGET): CorpusDigest {
  return {
    query: null,
    candidates: 0,
    used: 0,
    omitted: 0,
    budgetChars,
    usedChars: 0,
    vectorAvailable: false,
    items: [],
  };
}

export const DesignContextSchema = z.object({
  projectId: z.string(),
  pageId: z.string().optional(),
  viewport: z.enum(['mobile', 'tablet', 'desktop', 'wide']).optional(),
  selection: z.array(z.string()).default([]),
  /**
   * 选中节点的紧凑描述（类型/名称/尺寸/引用了哪些 token），避免整文档塞进模型（§68）。
   * **由服务端装配注入**，客户端不许上传——所以这里刻意没有 `.default()`：
   * 装了默认值就分不清"客户端没发"和"客户端发了空"，而这条边界要能拒绝（同 `document`）。
   */
  selectionDigest: SelectionDigestSchema.optional(),
  /** 设计系统摘要（token / 组件），同样由服务端从权威文档派生，客户端上传会被拒 */
  designSystemDigest: z
    .object({
      tokens: z.array(z.object({ key: z.string(), type: z.string(), value: z.unknown() })).default([]),
      components: z.array(z.object({ id: z.string(), name: z.string(), props: z.record(z.string(), z.unknown()).default({}) })).default([]),
    })
    .optional(),
  /**
   * §111：这一轮要请模型看的批注（钉在节点上的用户原话）。
   * 服务端注入，客户端上传会被拒（同 document / selectionDigest）。
   */
  annotations: z.array(AnnotationContextSchema).optional(),
  /** 超出上限没带上的批注怎么说：条数与原因，不留"看起来是全的"的错觉 */
  annotationsNote: z.string().optional(),
  /**
   * §70 的设计目录（服务端 Context Engine 装配时注入，预算内）。
   * 这是 provider 真正能看到的那一份；`document` 不是（见下）。
   */
  designIndex: DesignIndexSchema.optional(),
  /**
   * §69 的代码目录，按这轮请求排过序、在预算内。provider 看到的是"哪几份文件、里面有什么符号"，
   * 不是代码正文——正文要 Agent 明确伸手取（还没有那条通道，见 omissions）。
   */
  codeDigest: CodeDigestSchema.optional(),
  /**
   * §49 语料的内容，按这一轮的提示词取回（服务端注入，和 `designIndex` 同一类：
   * 客户端上传一律拒）。契约上留 `optional` 是因为这 schema 也用于校验**进来**的请求。
   */
  corpus: CorpusDigestSchema.optional(),
  /** 目录字符数与本轮预算：让"发了多大"成为报文里可核对的数，而不是日志里的一句话 */
  indexChars: z.number().int().min(0).optional(),
  budgetChars: z.number().int().min(0).optional(),
  /**
   * 完整文档**不在 provider 的上下文里**（§68）。这个字段只服务于 web 进程内的确定性工具
   * （DEMO MODE 的规则要读权威文档才能产出合法补丁），由服务端注入、随请求走本地调用，
   * 转发给 ai-service 前会被剥掉。客户端不许再自己塞一份进来。
   */
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
  /**
   * §111/§112：这一轮想交给哪个 Agent（`@qa 看一下这个按钮`里的 `qa`）。
   * 请求方只能**提名**——名册、职责与权限由服务端查（`agent` 那一栏），
   * 提名不在册不会变成"随便挑一个顶上"，而是原样报回"名册里没有 @xxx"。
   */
  agentKey: z.string().min(1).max(40).optional(),
  /**
   * 服务端按名册装配出来的那一份：`context.document` 的同一类——契约上有，客户端上传一律 400。
   * 为什么把职责随报文发而不是让 provider 自己查名册：ai-service 不碰业务库（架构纪律 3），
   * 名册在 web 这一侧；而职责不进提示词的话，§112 那句"每个 Agent 有自己的职责"就只是库里一列字。
   */
  agent: z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    responsibilities: z.array(z.string().min(1)).default([]),
    /** §73 的权限作用域。今天代码只执行其中一个：`design.patch` = 允许让补丁落地 */
    capabilities: z.array(z.string().min(1)).default([]),
  }).optional(),
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

/**
 * §47 角色对话的跨端契约。`system` 是 web 侧 `server/domain/character-chat.ts`
 * 拼好的人设 + 记忆 + 语料（ai-service 不碰业务库，自己拼不出来）；
 * `user` 是用户这一句话。回的是纯文本，不带补丁、不走审批门——
 * 对话只落记忆行，不改设计文档，所以 §73/§74 的补丁口径不适用这一路。
 */
export const AiChatRequestSchema = z.object({
  requestId: z.string(),
  system: z.string().min(1).max(12000),
  user: z.string().min(1).max(4000),
  modelClass: ModelClass.default('balanced'),
});
export type AiChatRequest = z.infer<typeof AiChatRequestSchema>;

export const AiChatResponseSchema = z.object({
  requestId: z.string(),
  capability: CapabilityStatus,
  provider: z.string(),
  model: z.string(),
  text: z.string().max(4000),
  usage: UsageSchema,
  error: AiErrorSchema.optional(),
});
export type AiChatResponse = z.infer<typeof AiChatResponseSchema>;

/**
 * §131 机检结果。放在 schemas 而不是 web 内部类型：发布面板要把它原样画出来，
 * 客户端拿到的一份如果和服务端算的那份形状不同，"几项待人工复核"就变成一个猜出来的数。
 */
export const ModerationFindingSchema = z.object({
  rule: z.string(),
  /** 只有这两档：机检不下"安全"的结论（§159） */
  level: z.enum(['review', 'blocked']),
  /** 命中的原文片段或资产名：复核的人要能看到凭什么说的 */
  quote: z.string(),
  /** 在文档里的位置（节点 id 或 asset:id），要能跳回去看 */
  where: z.string(),
  why: z.string(),
});
export type ModerationFinding = z.infer<typeof ModerationFindingSchema>;

export const ModerationScanSchema = z.object({
  rulesVersion: z.string(),
  decision: z.enum(['clear', 'review', 'blocked']),
  findings: z.array(ModerationFindingSchema).default([]),
  /** 这一轮机检覆盖不到的部分。缺了它，decision:'clear' 会被读成"内容没问题" */
  limits: z.array(z.string()).default([]),
  scanned: z.object({
    pages: z.number().int().min(0),
    textNodes: z.number().int().min(0),
    /** 文档引用到的**不同**资产数（不是引用次数） */
    assetRefs: z.number().int().min(0),
  }),
});
export type ModerationScan = z.infer<typeof ModerationScanSchema>;

/** §132 举报：公开页上真能提交的那一份 */
export const AbuseReportRequestSchema = z.object({
  path: z.string().min(3).max(200),
  reason: z.enum(['minor_safety', 'intimate_nonconsensual', 'impersonation', 'illegal', 'ip', 'spam', 'other']),
  detail: z.string().max(2000).optional(),
});
export type AbuseReportRequest = z.infer<typeof AbuseReportRequestSchema>;

/**
 * §168 访客现场：公开页上报"看了多久、看到哪儿"。
 * 这里只挡明显不合法的形状；**截断规则在 web 侧**（`apps/web/src/lib/visit-meter.ts`）：
 * 一次心跳最多带走 60 秒，超了就按上限记并留下 capped 痕迹。
 * 放宽到 600 秒再截而不是直接拒绝，是因为被节流挂起的标签页会攒出一大段——
 * 拒绝等于把"这个人确实看过"整条丢掉。
 */
export const PublishedVisitRequestSchema = z.object({
  path: z.string().min(3).max(200),
  /** 浏览器生成的匿名 key：32 位十六进制，只用于把同一个人的多次心跳并成一行 */
  visitorKey: z.string().regex(/^[0-9a-f]{32}$/),
  /** true = 这次算一次页面打开；false = 仅仅是心跳 */
  open: z.boolean(),
  visibleMs: z.number().int().min(0).max(600_000),
  completionPct: z.number().int().min(0).max(100),
});
export type PublishedVisitRequest = z.infer<typeof PublishedVisitRequestSchema>;

/**
 * §164 标已读。ids 与 all 二选一（都不给是客户端 bug，两个都给时 all 优先），
 * id 必须是 uuid：收件箱按人查询，这里只是把"能标别人的行"挡在报文层。
 */
export const NotificationsReadRequestSchema = z
  .object({
    ids: z.array(z.string().uuid()).max(200).optional(),
    all: z.boolean().optional(),
  })
  .refine((body) => body.all === true || (body.ids?.length ?? 0) > 0, {
    message: '要么给出要标记的通知 id，要么显式说 all',
  });
export type NotificationsReadRequest = z.infer<typeof NotificationsReadRequestSchema>;

/**
 * §49 项目元信息编辑。这里刻意只有 description：名字走设计文档（TopBar 重命名 →
 * `saveDocument` 把 `document.name` 同步到 `projects.name`），报文层再开一个写名入口
 * 只会让同一份名字有两个真值（§16）。
 * null / 空串都表示"清空简介"，所以字段可空；但整个报文不能什么都不带——
 * 那是一次静默的 no-op，界面上看不出来自己没改到东西。
 */
export const ProjectPatchRequestSchema = z
  .object({
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine((body) => body.description !== undefined, { message: '没有要改的字段' });
export type ProjectPatchRequest = z.infer<typeof ProjectPatchRequestSchema>;

/**
 * §74 删除项目的审批报文。`confirm` 必须逐字等于项目名，空串不行——
 * "什么都不填就把一个项目删掉"正是这一条要挡住的一键操作，所以这里不收默认值、
 * 也不接受 clientId / id 之类"反正能证明是本人"的替身（审批要证明的是*你真的想删这个*，
 * 不是*你有权限*，后者由 requireUser + owner 谓词管）。
 *
 * 上限 2000 比名字的其它上限宽：项目名是从设计文档同步过来的（`projects.name` ← `document.name`），
 * 文档名这条链上没有 120 的约束，太窄会让一个改了长名字的项目永远删不掉。
 * 真的超过 2000 时这里给的是"确认词太长"而不是"不匹配"，界面上说得清，
 * 补救办法也是明摆着的：先把名字改短。
 */
export const ProjectDeleteRequestSchema = z.object({
  confirm: z.string().trim().min(1).max(2000),
});
export type ProjectDeleteRequest = z.infer<typeof ProjectDeleteRequestSchema>;

/**
 * §74 的 agent 侧：一次含高危动作的 AI 结果只能靠这两个决定之一离开等待态。
 * 只有 `decision`：任务号在路径上、归属由服务端账本判，报文里能自报的字段越多，
 * "自报归属"的机会就越多（§68 那条纪律在写侧同样成立）。
 * 也**没有** `confirm`：删项目要逐字敲名字，是因为那一步由服务端替用户改库；
 * 审批 AI 结果改不了任何东西——它只是把补丁交回编辑区，落地与否仍是一条可撤销的 Command（§149）。
 */
export const AiTaskApprovalRequestSchema = z.object({
  decision: z.enum(['approve', 'reject']),
});
export type AiTaskApprovalRequest = z.infer<typeof AiTaskApprovalRequestSchema>;

/**
 * §74 的最后一格：一份挂起的 AI 结果等多久就算过期。
 *
 * 放在 `packages/schemas` 而不是 `server/domain`，因为浏览器也要能把这句话讲圆：
 * 审批卡片上"过时作废"那句话必须与服务端判定用的是同一个数，否则界面上承诺 24 小时、
 * 服务端 6 小时就作废——那是 §159 禁止的那一类谎报，而它只能靠"两边读同一个常量"来防。
 *
 * 为什么是 24 小时：
 * - 短于一天的挂起，用户当天回来还能接着决定；审批不是那种要放一周的事——
 *   被扣下的补丁对应的文档在这一天里会被他自己改好几轮，越晚批准越可能一句"op 与当前文档不匹配"。
 * - 长于一天的挂起，真正有价值的动作是"重新生成一次看看现在是什么样"，而不是把昨天那一版塞回画布。
 * - 它不需要精确：这条时间只决定"补丁还认不认"，不决定钱（扣点在批准之后才走）、
 *   也不决定任何对外可见的状态。
 */
export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * 审批的回执。`held` 是批准时**原样交回**的那份被挂起的结果（含补丁），放弃时是 null——
 * 交回而不是重新生成：重新跑一次会拿到另一份内容，用户批准的就不是他看过的那一版了。
 * 状态只有这三种：`awaiting_approval` 表示这条决定没被接受（已经决定过），
 * 让重复点第二次按钮拿到一个"成功"就是谎报。
 */
export const AiTaskApprovalResultSchema = z.object({
  taskId: z.string(),
  decision: z.enum(['approve', 'reject']),
  status: z.enum(['succeeded', 'cancelled', 'awaiting_approval']),
  applied: z.boolean(),
  approvals: z.array(z.object({ action: z.string(), reason: z.string() })).default([]),
  held: AiResponseSchema.nullable(),
});
export type AiTaskApprovalResult = z.infer<typeof AiTaskApprovalResultSchema>;

/**
 * §132 block / mute 的报文。只有 handle：id 是内部键，把别人的 uuid 抄进地址栏
 * 就能拉黑一个不认识的人，而 @handle 是界面上本来就显示的东西。
 * kind 必填在 POST（缺省按 block 会替用户做一个更重的决定），DELETE 不需要。
 */
export const BlockRelationSchema = z.enum(['block', 'mute']);
export type BlockRelation = z.infer<typeof BlockRelationSchema>;
export const BlocksRequestSchema = z.object({
  handle: z.string().trim().min(1).max(60),
  kind: BlockRelationSchema,
});
export type BlocksRequest = z.infer<typeof BlocksRequestSchema>;
/** DELETE 只认 handle：解除哪一类不重要，一对关系只有一行 */
export const BlocksClearRequestSchema = z.object({ handle: z.string().trim().min(1).max(60) });
export type BlocksClearRequest = z.infer<typeof BlocksClearRequestSchema>;


/**
 * §162 作业队列：图片 / 视频 / 3D / 复杂 Agent 任务不能挂在一个 HTTP 请求上等结果，
 * 所以走 Queue → Worker → Progress → Result。这两份是 ai-service ↔ web 之间的报文。
 */
export const AiJobStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);
export type AiJobStatusValue = z.infer<typeof AiJobStatusSchema>;

export const AiJobBackend = z.enum(['none', 'memory', 'redis']);
export type AiJobBackend = z.infer<typeof AiJobBackend>;

export const AiJobAcceptedSchema = z.object({
  jobId: z.string(),
  requestId: z.string(),
  status: AiJobStatusSchema,
  /** 作业存在哪儿：memory = 只有这一个进程看得到、重启即失；redis = 跨进程可见 */
  backend: AiJobBackend,
  /** 后端带来的限制写在报文里，不能让人以为刷新页面还能找回这个 job */
  note: z.string(),
  /** 这条队列同时在跑几件活：让调用方能判断"要不要现在提交" */
  capacity: z.number().int().min(1),
});
export type AiJobAccepted = z.infer<typeof AiJobAcceptedSchema>;

export const AiJobStatusResponseSchema = z.object({
  jobId: z.string(),
  requestId: z.string(),
  backend: AiJobBackend,
  status: AiJobStatusSchema,
  queuedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  /**
   * 0..1。只有**真知道**进度才给：单次 LLM 调用没有可观测的中间态，所以那种作业一直是 null，
   * 而不是先给 0.2 再给 0.9 的假刻度（§159）。
   */
  progress: z.number().min(0).max(1).nullable(),
  /** 队列与执行各自的里程碑；与 AiResponse.activities 同一形状 */
  activities: z.array(AgentActivitySchema).default([]),
  /** completed 时是完整的 AiResponse（与同步 /v1/ai/run 同一份契约）；failed 时只有 error */
  result: AiResponseSchema.optional(),
  error: AiErrorSchema.optional(),
});
export type AiJobStatusResponse = z.infer<typeof AiJobStatusResponseSchema>;

/**
 * §162 × §74：web 侧一次"问作业"的对外报文（`GET /api/ai/jobs/<jobId>` 的响应体）。
 *
 * 它与 `AiJobStatusResponse` 不是一份东西：那份是 ai-service ↔ web，真值在队列那一侧；
 * 这份是 web ↔ 浏览器，里面除了镜像过来的状态，还有 **web 自己判断出来的东西**——
 * 任务行现在的状态、这次观察有什么要说清楚的（问不到、查不到、后端是内存），
 * 以及过门之后**能交回编辑区的那一份结果**。
 *
 * `response` 就是这条报文存在的理由：作业跑完了要能把补丁交回去，否则"异步生成"
 * 只能生成不能落地。而它给的永远是**过门之后**的那一份——含高危动作的结果里，
 * 这里的 `response.patches` 是空的、`approvals` 是非空的（§74：决定之前那份东西进不了工作区）。
 */
export const AiJobObservationSchema = z.object({
  jobId: z.string(),
  taskId: z.string(),
  projectId: z.string().nullable(),
  /** ai-service 报的状态原样透传；问不到就是 null，不拿账本里的旧状态冒充"现在的" */
  jobStatus: AiJobStatusSchema.nullable(),
  backend: AiJobBackend.nullable(),
  /** 只有真知道才给；今天这条队列没有可观测的中间态，所以一直是 null（§159） */
  progress: z.number().min(0).max(1).nullable(),
  activities: z.array(AgentActivitySchema).default([]),
  queuedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  /** 这行任务在 web 账本里的状态（挂起 / 终态都由这一轮观察写入） */
  taskStatus: z.string().min(1),
  outcome: z.string().nullable(),
  notes: z.array(z.string()).default([]),
  /** 需要人工审批的动作；空数组表示这一份结果可以原样交回 */
  approvals: z.array(z.object({ action: z.string(), reason: z.string() })).default([]),
  /** §112：这一轮服务端实际交给了谁（没人被点名是 null）——读的是账本里那一行，不是浏览器选的那一个 */
  agent: z.object({ key: z.string().min(1), name: z.string().min(1) }).nullable(),
  /** 能交回的那一份结果：没跑完 / 没结果 / 行已终态但报文丢了结果时是 null */
  response: AiResponseSchema.nullable(),
});
export type AiJobObservation = z.infer<typeof AiJobObservationSchema>;

/**
 * §112 的名册：Studio 的 Agent 选择器读它（`GET /api/ai/agents`）。
 *
 * 形状与 `AiRequestSchema.agent` 里那一栏一致，但**这是两份定义**：那一栏是跨语言契约
 * （要经 `contract:export` 导出给 ai-service 校验），这一份只在 web ↔ 浏览器之间走。
 * 合成一份的话，导出的 ai-request 契约里就会多出不属于 provider 的东西。
 */
export const AgentRosterSchema = z.object({
  agents: z.array(
    z.object({
      key: z.string().min(1).max(40),
      name: z.string().min(1),
      responsibilities: z.array(z.string().min(1)),
      capabilities: z.array(z.string().min(1)),
    }),
  ),
});
export type AgentRoster = z.infer<typeof AgentRosterSchema>;

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

/**
 * §163：多实例扇出时，实例之间在 Redis 线路上走的那一帧。
 *
 * 和 `AgentRosterSchema` 同一个道理（见上面那段注释）：这是**两份定义里的第二份**，
 * 只在 web 的进程之间走，ai-service 不参与，所以不进 `CONTRACT_EXPORTS`——
 * 否则导出的 ai-request 契约里会多出根本不属于 provider 的东西。
 * 但它是货真价实的跨进程报文，接收侧必须先 `safeParse` 再落到本机总线：
 * 线路上的字节和浏览器发来的一样是不可信输入，不能因为"这是我们自己发的"就直接对象化。
 *
 * `origin` 是发帧那一台总线的身份，收侧用它跳过自己回环的那一份（否则本机订阅者会收到两次）。
 */
export const RealtimeWireFrameSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('event'), origin: z.string().min(1), channel: z.string().min(1), event: RealtimeEventSchema }),
  z.object({ kind: z.literal('close'), origin: z.string().min(1), channel: z.string().min(1) }),
]);
export type RealtimeWireFrame = z.infer<typeof RealtimeWireFrameSchema>;

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
  /** §162：队列的真实状态。这里的 pending 必须来自真计数器，写死一个 0 就是谎报（§159） */
  queue: z
    .object({
      backend: z.enum(['none', 'memory', 'redis']),
      pending: z.number().int().default(0),
      running: z.number().int().default(0),
      /** 同时在跑的 worker 数；0 = 队列没启动（此时 pending/running 必为 0，note 说明原因） */
      capacity: z.number().int().min(0).default(0),
      /** 后端带来的限制（memory = 只此进程可见、重启即失），写进报文而不是只写日志 */
      note: z.string().default(''),
    })
    .default({ backend: 'none', pending: 0, running: 0, capacity: 0, note: '' }),
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
  // §39 点名的四栏：identity / style / clothing / traits。
  // 全部带 default——库里已有的档案没有这几栏，不用 default 的话旧行在载入时就解析不过去，
  // 而"解析不过去"在面板上表现成"这个角色读不出来"，那是数据被界面弄丢，不是契约在把关。
  identity: z.string().max(8000).default(''),
  style: z.string().max(2000).default(''),
  clothing: z.string().max(8000).default(''),
  traits: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
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


/**
 * §54 游戏设计系统的跨端形状。权威定义在 @nexus/game-model，这里只是传输层。
 * 11 类清单在两处各写一份（z.enum 要字面量），所以 test/game-contract.test.ts 逐字对齐它们。
 */
export const GameEntityKindSchema = z.enum([
  'player',
  'enemy',
  'weapon',
  'item',
  'quest',
  'dialogue',
  'trigger',
  'npc',
  'camera',
  'animation',
  'particle',
]);
export type GameEntityKindPayload = z.infer<typeof GameEntityKindSchema>;

/**
 * §51 的游戏类型：这份设计是给哪一种游戏做的。清单同样只在 @nexus/game-model 有一份，
 * 这里抄字面量是因为 z.enum 不吃跨包的 `as const`；漂移由契约测试逐字对齐（含顺序）。
 */
export const GameKindSchema = z.enum([
  '2d',
  '2.5d',
  '3d',
  'interactive-story',
  'rpg-prototype',
  'exploration',
  'puzzle',
  'visual-novel',
]);
export type GameKindPayload = z.infer<typeof GameKindSchema>;

export const GameRefSchema = z.object({
  id: z.string().min(1).max(128),
  to: z.string().min(1).max(128),
  // role 可以留空（图上不写字），但长度要有个上限，否则有人拿它当正文写
  role: z.string().max(120),
});

export const GameEntitySchema = z.object({
  id: z.string().min(1).max(128),
  kind: GameEntityKindSchema,
  name: z.string().trim().min(1).max(120),
  notes: z.string().max(20_000),
  tags: z.array(z.string().trim().min(1).max(60)).max(100),
  /**
   * 值必须是**有限数**：NaN / Infinity 经 JSON.stringify 会变成 null，
   * 放它进库就等于存了一个谁也没打算存的值。键名开放（不预设属性表），
   * 但空白键没有意义，拦住。
   */
  stats: z.record(z.string().trim().min(1).max(60), z.number().finite()),
  refs: z.array(GameRefSchema).max(500),
  /**
   * §34 的 model 类资产 ID：这个实体在 3D 场景里用哪个模型渲染。
   * 库里 assets.kind='model' 的那一行就是它的来源（storageKey 指向 .glb/.gltf 文件）。
   * 没有它时 3D 画法退回到类别几何体（球/方/锥/八面体）——不是美术模型，只是标记。
   */
  modelAssetId: z.string().min(1).max(128).optional(),
  updatedAt: z.string().min(1),
});
export type GameEntityPayload = z.infer<typeof GameEntitySchema>;

export const GameDocumentSchema = z.object({
  id: z.string().min(1).max(128),
  projectId: z.string().max(128).nullable(),
  name: z.string().trim().min(1).max(120),
  summary: z.string().max(2000),
  /**
   * §51 的类型。库里与历史发布版本里没有这个字段的，按 `2d` 读——
   * 这不是随手挑的默认值，而是"这一格加进来之前只有俯视 2D 一条管线"这个事实。
   * 缺省必须在这里补，不能在分派点各写一遍：`compileForKind` 读的是 `document.kind`，
   * 拿到 undefined 就去找 `GAME_KIND_STATUS[undefined]`，那是 500 不是一个默认值。
   */
  kind: GameKindSchema.default('2d'),
  entities: z.array(GameEntitySchema).max(5000),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type GameDocumentPayload = z.infer<typeof GameDocumentSchema>;

/** 与 /api/projects/[id]/game 的 PUT 体一致：整份文档一起换（游戏文档不大，不需要增量补丁） */
export const GameSaveRequestSchema = z.object({ document: GameDocumentSchema });

/**
 * §40-42 分镜的**报文契约**（边界纪律 6：跨端只能是 packages/schemas 里的 zod 定义）。
 *
 * 这里不重复 @nexus/video-model 的结构权威——那份包负责"分镜是什么"，
 * 这一份负责"进出 HTTP 的那串字节长什么样"。三份枚举清单写了两遍，
 * 所以 `packages/schemas/test/video-contract.test.ts` 逐位比它与模型包的运行时常量，
 * 加一个机位只改一处而测试会红，这就是那条测试要的作用。
 */
export const ShotCameraSchema = z.enum(['wide', 'medium', 'close', 'detail', 'tracking', 'aerial']);
export const ShotTransitionSchema = z.enum(['cut', 'fade', 'dissolve', 'wipe']);
export const StoryboardArrowSchema = z.enum([
  'text-to-video',
  'image-to-video',
  'storyboard-to-video',
  'character-to-scene',
]);

export const StoryboardShotSchema = z.object({
  /** 稳定标识：重排不改它，参考帧与时间线都按它指回这一镜 */
  id: z.string().min(1).max(128),
  prompt: z.string().trim().min(1).max(2000),
  /**
   * 上限给到 10 分钟一镜——远高于模型会产生的 3000/4500 毫秒。
   * 边界是用来拦垃圾输入的（一次误操作写进 3e9 毫秒会把整条时间线的刻度压成一片空白），
   * 不是用来否决作者真想要的长镜头；上限若贴着默认值，长镜头的写入就只剩一条 500。
   */
  durationMs: z.number().int().min(1).max(600_000),
  camera: ShotCameraSchema,
  transition: ShotTransitionSchema,
  characterId: z.string().min(1).max(128).optional(),
  referenceAssetId: z.string().min(1).max(128).optional(),
  videoAssetId: z.string().min(1).max(128).optional(),
});

export const StoryboardDocumentSchema = z
  .object({
    id: z.string().min(1).max(128),
    title: z.string().trim().min(1).max(120),
    source: z.object({
      arrow: StoryboardArrowSchema,
      /** 作者原话：投影可以切它，但不能改它，所以这里只限长，不作任何规范化 */
      prompt: z.string().max(4000),
      referenceAssetId: z.string().min(1).max(128).optional(),
      characterId: z.string().min(1).max(128).optional(),
    }),
    shots: z.array(StoryboardShotSchema).max(200),
    /** 投影做的每一个解释与每一条限度：空数组是合法的（手写的分镜没有解释要交代） */
    notes: z.array(z.string().min(1).max(2000)).max(50),
  })
  .superRefine((sb, ctx) => {
    // id 必须唯一：时间线、参考帧、撤销补丁都按 id 指镜头，撞了就会撤错一格
    const seen = new Set<string>();
    sb.shots.forEach((shot, index) => {
      if (seen.has(shot.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shots', index, 'id'],
          message: `第 ${index + 1} 镜的 id「${shot.id}」与前面某一镜重复，镜头标识必须唯一`,
        });
      }
      seen.add(shot.id);
    });
  });
export type StoryboardDocumentPayload = z.infer<typeof StoryboardDocumentSchema>;

/** 与 /api/projects/[id]/storyboard 的 PUT 体一致；baseUpdatedAt 是这次改动读到的那一份的时间戳 */
export const StoryboardSaveRequestSchema = z.object({
  document: StoryboardDocumentSchema,
  /**
   * 可选的乐观并发凭据：带上来就拒绝"更旧的写"（两个 PUT 乱序到达时不能让旧版本赢），
   * 不带上就是最后写入者赢。刻意可省——面板第一次建档时手里没有基准，
   * 逼它编一个时间戳等于让它伪造并发检查。
   */
  baseUpdatedAt: z.string().min(1).optional(),
});
export type StoryboardSaveRequestPayload = z.infer<typeof StoryboardSaveRequestSchema>;


/** §67 Context Engine 的一次装配：设计目录 + 世界/角色/记忆/资产/索引/近况的摘要 */
export const ProjectContextSchema = z.object({
  projectId: z.string(),
  generatedAt: z.string(),
  /** 尺寸对比：§68 的"别整个塞进去"要能被量出来 */
  sizes: z.object({
    fullDocumentChars: z.number().int().min(0),
    indexChars: z.number().int().min(0),
    budgetChars: z.number().int().min(0),
    /** §69 代码目录的大小：和文档字符数并排放，"发目录不发代码"才有个可核对的比例 */
    codeIndexChars: z.number().int().min(0),
  }),
  design: DesignIndexSchema,
  code: CodeIndexSchema,
  world: z.object({
    present: z.boolean(),
    name: z.string().nullable(),
    kinds: z.array(z.object({ kind: z.string(), count: z.number().int().min(0) })),
    links: z.number().int().min(0),
    /** 读不出来时的原因；不能因为它缺了就当项目没有世界（§159） */
    reason: z.string().nullable(),
  }),
  characters: z.object({
    count: z.number().int().min(0),
    items: z.array(z.object({ id: z.string(), name: z.string(), relationships: z.number().int().min(0) })),
    unreadable: z.array(z.string()),
  }),
  memory: z.object({
    scopes: z.array(z.object({ scope: z.string(), count: z.number().int().min(0) })),
    total: z.number().int().min(0),
  }),
  assets: z.object({
    count: z.number().int().min(0),
    kinds: z.array(z.object({ kind: z.string(), count: z.number().int().min(0) })),
  }),
  knowledge: z.object({
    chunks: z.number().int().min(0),
    vectorized: z.number().int().min(0),
    vectorAvailable: z.boolean(),
    sources: z.array(z.object({ sourceType: z.string(), count: z.number().int().min(0) })),
  }),
  /**
   * §49 语料的**内容**按相关性进上下文（§66-71）。刻意没有默认值：
   * 装配方必须显式说这一轮查没查语料库、查了几条、被预算裁掉几条——
   * 让"没查"与"查了但都没用上"在报文上长得一样，就是让收到的一方无从判断该信多少。
   */
  corpus: CorpusDigestSchema,
  recentChanges: z.array(
    z.object({ label: z.string().nullable(), source: z.string(), summary: z.string().nullable(), createdAt: z.string() }),
  ),
  /** §71 Project Graph：这七个分支这次各自带到什么程度。没带的如实标 not-indexed */
  publishing: z.object({
    published: z.boolean(),
    visibility: z.string().nullable(),
    path: z.string().nullable(),
    version: z.number().int().min(0),
    views: z.number().int().min(0),
    publishedAt: z.string().nullable(),
  }),
  branches: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['indexed', 'partial', 'not-indexed']),
      note: z.string(),
    }),
  ),
  /** 这次装配没带、也暂时给不了的东西，原样列出来（§66 的清单要能核对缺哪一项） */
  unavailable: z.array(z.string()),
});
export type ProjectContextPayload = z.infer<typeof ProjectContextSchema>;

export { NodeTypeEnum as DesignNodeType };

/**
 * §188 M8（MCP / 外部 Agent / 公开 API）：公开 API 的凭据与报文。
 *
 * 设计文档的权威形状在 `@nexus/design-model`（怎么算是那儿决定的，纪律 1），这里只规定
 * "出了进程长什么样"——所以 document 那一格是 `z.unknown()`，而配套的 `digest` 是真的会校验的数。
 */
export const API_TOKEN_SCOPES = ['projects:read', 'design:read', 'design:write'] as const;
export const ApiTokenScopeSchema = z.enum(API_TOKEN_SCOPES);
export type ApiTokenScope = z.infer<typeof ApiTokenScopeSchema>;

/**
 * 每个凭据每分钟的调用上限，读与写各一桶（窗口 60 秒）。
 *
 * 住在 schemas 而不是服务端 domain 里，是因为界面上要把这两个数说给人听：从 domain 引进来的话，
 * 'use client' 的组件就把 drizzle 与 node:crypto 拖进浏览器包了。这里是契约的一部分（公开 API
 * 对外的承诺），执行方在 `apps/web/src/server/domain/api-tokens.ts`，两处永远同一个数。
 */
export const API_TOKEN_RATE_LIMITS_PER_MINUTE = { read: 120, write: 30 } as const;

export const ApiTokenRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** 随机段前 8 位：认哪一把用的，不是凭据 */
  hint: z.string(),
  scopes: z.array(ApiTokenScopeSchema),
  createdAt: z.string(),
  /** 分钟级节流的读数，界面上要说明它不是精确的最后一次调用 */
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type ApiTokenRecord = z.infer<typeof ApiTokenRecordSchema>;

/**
 * 建凭据的入站报文。`expiresInDays` 不给就是不过期：凭据是给人配到 CI 里去的，
 * 到期时间得由发的人自己决定，服务端不替他设一个他不知道的期限。
 */
export const ApiTokenCreateRequestSchema = z.object({
  name: z.string().min(1).max(60),
  scopes: z.array(ApiTokenScopeSchema).min(1),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});
export type ApiTokenCreateRequest = z.infer<typeof ApiTokenCreateRequestSchema>;

/** 明文只在这一个报文里出现这一次——库里存的是哈希，所以关掉页面就再也拿不到了 */
export const ApiTokenIssuedSchema = z.object({
  token: z.string(),
  record: ApiTokenRecordSchema,
});
export type ApiTokenIssued = z.infer<typeof ApiTokenIssuedSchema>;

/**
 * "哪一枚凭据在什么时候读过哪一份文档"这本账留多久（§188 M8 第三片）。
 * 界面上要说得出这个数：一份其实只留这么久的账，不写出来就是让人以为它是永久账。
 * 数值住在这里，执行与展示读同一份（与 `API_TOKEN_RATE_LIMITS_PER_MINUTE` 同一个理由）。
 */
export const API_ACCESS_RETENTION_DAYS = 30;

/**
 * 一次访问的账。库里那一行的粒度是"一个分钟桶"（迁移 0020），这一份是给它的主人看的摘要：
 * 同一（端点, 项目）的桶在读的时候聚成一条，`calls` 是窗口里的总次数。
 */
export const ApiAccessEntrySchema = z.object({
  tokenId: z.string(),
  /** 路由自己报失败时说的那一句端点名，两边同一个字符串才对得上账 */
  endpoint: z.string(),
  /** 空串是"这次访问不落在这个项目上"（集合类端点），不是"项目 id 未知" */
  projectId: z.string(),
  /** 项目已经删了：账还在，名字读不出来。留 null 让界面明说"已删除"，而不是摊一个空串 */
  projectName: z.string().nullable(),
  calls: z.number().int().min(1),
  lastSeen: z.string(),
});
export type ApiAccessEntry = z.infer<typeof ApiAccessEntrySchema>;

/** 账号侧那一份凭据列表的出口报文：凭据本身 + 每一枚最近的访问摘要 */
export const ApiAccountTokensSchema = z.object({
  tokens: z.array(ApiTokenRecordSchema),
  access: z.array(ApiAccessEntrySchema),
});
export type ApiAccountTokens = z.infer<typeof ApiAccountTokensSchema>;

export const ApiProjectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  kind: z.string(),
  visibility: z.string(),
  updatedAt: z.string(),
});
export type ApiProject = z.infer<typeof ApiProjectSchema>;

export const ApiProjectListSchema = z.object({
  /** 这个凭据只看得见它自己那个人名下的项目；公开作品走 /api/public，不在这里 */
  projects: z.array(ApiProjectSchema),
});
export type ApiProjectList = z.infer<typeof ApiProjectListSchema>;

export const ApiProjectDetailSchema = ApiProjectSchema.extend({
  description: z.string().nullable(),
  createdAt: z.string(),
  forkOf: z.string().nullable(),
  pageCount: z.number().int().min(0),
  nodeCount: z.number().int().min(0),
});
export type ApiProjectDetail = z.infer<typeof ApiProjectDetailSchema>;

export const ApiDesignDocumentSchema = z.object({
  projectId: z.string(),
  document: z.unknown(),
  pageCount: z.number().int().min(0),
  nodeCount: z.number().int().min(0),
  /** 文档是从库里读出来的那一份（§68 同一口径），不是调用方递进来的 */
  source: z.literal('database'),
});
export type ApiDesignDocument = z.infer<typeof ApiDesignDocumentSchema>;

/**
 * §188 第二片：写端点的入站报文。
 *
 * op 的形状直接复用 `DesignPatchSchema` 的那一份（权威语义在 `@nexus/design-model`：怎么应用、
 * 怎么求逆都是那儿决定的，这里重定义一遍就是两处定义同一件事），只收紧三件事：
 * - `summary` 必填：一次外来的写入必须能在历史里读出"谁为的是什么"，否则那条快照只是噪音；
 * - `ops` 至少一条：空补丁照样会落一条历史、一次语料重切，却什么也不改；
 * - 一次最多 200 条：内部 AI 那条上限是 4000，因为它在同一个进程里；公网上的一个请求
 *   不该让服务端把整份文档反复拷 4000 次。
 */
export const ApiDesignPatchRequestSchema = DesignPatchSchema.extend({
  summary: z.string().min(1).max(200),
  ops: z.array(PatchOpSchema).min(1).max(200),
});
export type ApiDesignPatchRequest = z.infer<typeof ApiDesignPatchRequestSchema>;

/**
 * 写成功后的回执。`historyRecorded` 单独一栏是因为它是事务**外面**那一步：
 * 文档已经改完了，历史没落上的话只能说实话，不能把整次请求报成失败让人以为可以重发。
 */
export const ApiDesignPatchResultSchema = z.object({
  projectId: z.string(),
  ok: z.literal(true),
  appliedOps: z.number().int().min(1),
  /** 被这次补丁改到的节点 id，调用方据此局部刷新；上限就是这次 op 的条数 */
  touchedNodeIds: z.array(z.string()),
  pageCount: z.number().int().min(0),
  nodeCount: z.number().int().min(0),
  /** 落在项目历史里的那一条（带 patch 清单，Studio 的历史面板按 §151 展示它的 diff） */
  snapshotId: z.string().nullable(),
  historyRecorded: z.boolean(),
  /**
   * 文档已经改了，但后续某几步（历史 / 语料 / 审计）没成。
   *
   * 这几步都在事务**外面**，所以它们失败不能把整次请求报成失败：调用方一看 500 就会重发，
   * 而重发一份 `insert` 补丁是两条节点，不是幂等的一次写。宁可把没成的那一步原样说出来。
   */
  warnings: z.array(z.string()),
  /** 数的是库里那一份，不是调用方递进来的补丁自己声明的结果 */
  source: z.literal('database'),
});
export type ApiDesignPatchResult = z.infer<typeof ApiDesignPatchResultSchema>;
