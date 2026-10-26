import { sql } from 'drizzle-orm';
import type { ApiTokenScope } from '@nexus/schemas';
import {
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

/** drizzle-orm 0.45 尚未内置 tsvector，用 customType 声明（§93 混合检索需要它） */
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

/**
 * NEXUS 数据模型（§92 PostgreSQL + §93 pgvector）。
 * 命名一律 snake_case，便于 M6 之后 Java/JPA 侧按同一套表接管领域写入（ADR-0001）。
 * 设计文档的权威结构在 pages / design_nodes / design_tokens / components；
 * snapshots.document 只是"某一时刻的完整序列化"，用于历史与分支（§27-28）。
 */

const now = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const UserRole = pgEnum('user_role', ['creator', 'admin']);

/**
 * §133 / §134 的取值域。这三份名单与迁移 `0016_credit_ledger.sql` 里的 CHECK 是同一件事的
 * 两处写法（TS 侧一处、库侧一处），所以有一条集成测试直接往库里写非法值来钉住两边没漂。
 * 为什么不用 pg enum：加一档 / 加一类额度时 pg enum 要重建类型，而 text + CHECK 只要改约束。
 */
export const USER_PLANS = ['free', 'pro', 'creator', 'studio', 'enterprise'] as const;
export type UserPlan = (typeof USER_PLANS)[number];

/** §134 原文点名的四类额度 + marketplace 消费（§127-128） */
export const CREDIT_LEDGER_KINDS = ['ai', 'image', 'video', 'compute', 'marketplace'] as const;
export type CreditLedgerKind = (typeof CREDIT_LEDGER_KINDS)[number];

/** Marketplace 物品类型：组件 / 模板 / 设计系统 / 资产 / 世界 / 游戏 / AI 角色 */
export const MARKETPLACE_ITEM_TYPES = [
  'component',
  'template',
  'design_system',
  'asset',
  'world',
  'game',
  'character',
] as const;
export type MarketplaceItemType = (typeof MARKETPLACE_ITEM_TYPES)[number];

/** Marketplace 物品可见性：公开出售 / 免费分享 / 私有草稿 */
export const MARKETPLACE_VISIBILITY = ['public', 'free', 'private'] as const;
export type MarketplaceVisibility = (typeof MARKETPLACE_VISIBILITY)[number];

/** 一行流水为什么存在：档位发放、一次生成扣点、服务端代码里的一次调整、marketplace 购买/分成 */
export const CREDIT_LEDGER_SOURCES = ['plan_grant', 'generation', 'adjust', 'marketplace_purchase', 'marketplace_sale'] as const;
export type CreditLedgerSource = (typeof CREDIT_LEDGER_SOURCES)[number];
/** 取值与 @nexus/design-model 的 ProjectType 完全一致，避免两套词汇（§9 模型即真值） */
export const ProjectKind = pgEnum('project_kind', [
  'website',
  'webapp',
  'mobile-ui',
  'game',
  'interactive-story',
  '3d-experience',
  'dashboard',
  'design-system',
  'prototype',
  'world',
  'video',
]);
export const Visibility = pgEnum('visibility', ['private', 'unlisted', 'public']);
export const AssetKind = pgEnum('asset_kind', ['image', 'video', 'audio', 'model', 'font', 'other']);
export const AssetSource = pgEnum('asset_source', ['upload', 'generated', 'import']);
export const TaskStatus = pgEnum('task_status', [
  'queued',
  'planning',
  'running',
  'awaiting_approval',
  'succeeded',
  'failed',
  'cancelled',
]);
export const MessageRole = pgEnum('message_role', ['user', 'assistant', 'system', 'tool']);
export const CapabilityStatus = pgEnum('capability_status', ['real', 'demo', 'unavailable']);
export const SnapshotSource = pgEnum('snapshot_source', ['manual', 'ai', 'import', 'publish', 'branch']);
export const ModerationStatus = pgEnum('moderation_status', ['pending', 'approved', 'rejected', 'flagged']);
/** §131 机检的三档结论。注意没有 "safe"：词表扫过不等于安全（§159） */
export const ModerationCaseDecision = pgEnum('moderation_case_decision', ['clear', 'review', 'blocked']);
/** §132 举报类别，与 §129 的四条硬红线对齐，另加两类常见的 */
export const ReportReason = pgEnum('report_reason', [
  'minor_safety',
  'intimate_nonconsensual',
  'impersonation',
  'illegal',
  'ip',
  'spam',
  'other',
]);
export const ReportStatus = pgEnum('report_status', ['open', 'reviewing', 'closed']);
export const MemoryScope = pgEnum('memory_scope', ['session', 'character', 'world', 'user']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** guest 用户没有邮箱（§137），所以列可空；Postgres 唯一索引允许多个 NULL */
    email: text('email'),
    passwordHash: text('password_hash'),
    displayName: text('display_name').notNull(),
    handle: text('handle'),
    avatarUrl: text('avatar_url'),
    /** §60 主页上那段自我介绍。没有版本也没有归属争议，所以直接放这一行而不是另建 1:1 表 */
    bio: text('bio'),
    role: UserRole('role').notNull().default('creator'),
    /**
     * §133 的档位。库里只记"这个人属于哪一档"，**每档给多少**在 `domain/credits.ts` 的表里——
     * 那样一次改档位会碰到类型与单测，而不是悄悄改一行数据就生效。
     * CHECK 约束（迁移 0016）挡住手写进来的第五种值；读出来不合法时 `planOf` 照实退回 free。
     */
    plan: text('plan').$type<UserPlan>().notNull().default('free'),
    /** 免注册首次体验（§137）：guest 可创建项目，注册后认领 */
    guest: boolean('guest').notNull().default(false),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('users_email_key').on(sql`lower(${t.email})`),
    uniqueIndex('users_handle_key').on(t.handle),
    index('users_guest_idx').on(t.guest).where(sql`${t.deletedAt} is null`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 只存哈希，绝不存明文 token（§80） */
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: now(),
  },
  (t) => [uniqueIndex('sessions_token_hash_key').on(t.tokenHash), index('sessions_user_idx').on(t.userId)],
);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    kind: ProjectKind('kind').notNull().default('website'),
    description: text('description'),
    visibility: Visibility('visibility').notNull().default('private'),
    /** Remix / fork 血缘（§58） */
    forkOf: uuid('fork_of').references((): any => projects.id, { onDelete: 'set null' }),
    activePageId: text('active_page_id'),
    /** 当前生效快照，指向 snapshots；外键在迁移里后补，避免循环定义 */
    currentSnapshotId: uuid('current_snapshot_id'),
    /** 项目级硬约束：Brand Kit / Visual DNA（§119 / §172-174） */
    brandKit: jsonb('brand_kit'),
    visualDna: jsonb('visual_dna'),
    /** §12 主题：当前 mode（null = 用 token 默认值）与 mode 名单 */
    activeMode: text('active_mode'),
    modes: jsonb('modes'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('projects_owner_slug_key').on(t.ownerId, t.slug),
    index('projects_owner_idx').on(t.ownerId),
    index('projects_visibility_idx').on(t.visibility).where(sql`${t.deletedAt} is null`),
    index('projects_fork_of_idx').on(t.forkOf),
  ],
);

export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    headSnapshotId: uuid('head_snapshot_id'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: now(),
  },
  (t) => [uniqueIndex('branches_project_name_key').on(t.projectId, t.name), index('branches_project_idx').on(t.projectId)],
);

export const snapshots = pgTable(
  'snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    parentId: uuid('parent_id').references((): any => snapshots.id, { onDelete: 'set null' }),
    label: text('label'),
    source: SnapshotSource('source').notNull().default('manual'),
    /** DesignDocument 的完整序列化（.nexus/ 格式同源，§102） */
    document: jsonb('document').notNull(),
    /** AI 变更说明与 diff 摘要（§151） */
    summary: text('summary'),
    patch: jsonb('patch'),
    taskId: uuid('task_id'),
    createdById: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: now(),
    /** 用于全文检索的文本摘要（标题+页面名+节点文字+visualDna描述等），用于 trigram 匹配 */
    search_text: text('search_text'),
  },
  (t) => [index('snapshots_project_created_idx').on(t.projectId, t.createdAt)],
);

export const pages = pgTable(
  'pages',
  {
    /** 主键直接用设计模型里的 page id：模型即真值，不允许二次发号（§9） */
    id: text('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    rootNodeId: text('root_node_id').notNull(),
    sortIndex: integer('sort_index').notNull().default(0),
    width: integer('width').notNull().default(1440),
    height: integer('height').notNull().default(1024),
    backgroundColor: text('background_color'),
    layout: jsonb('layout'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('pages_project_name_key').on(t.projectId, t.name), index('pages_project_sort_idx').on(t.projectId, t.sortIndex)],
);

export const designNodes = pgTable(
  'design_nodes',
  {
    id: text('id').notNull(),
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    nodeType: text('node_type').notNull(),
    name: text('name').notNull(),
    sortIndex: integer('sort_index').notNull().default(0),
    /** 几何 / 样式 / 排版 / 动效 / 交互等易变属性；结构列用于查询 */
    data: jsonb('data').notNull(),
    componentId: uuid('component_id'),
    visible: boolean('visible').notNull().default(true),
    locked: boolean('locked').notNull().default(false),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.pageId, t.id] }),
    index('design_nodes_page_idx').on(t.pageId),
    index('design_nodes_parent_idx').on(t.pageId, t.parentId),
    index('design_nodes_type_idx').on(t.pageId, t.nodeType),
  ],
);

export const designTokens = pgTable(
  'design_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** 点号键：color.primary / space.4 / motion.fast（§12） */
    key: text('key').notNull(),
    type: text('type').notNull(),
    value: jsonb('value').notNull(),
    /** 多主题值：{ light: '#...', dark: '#...' } */
    modes: jsonb('modes'),
    description: text('description'),
    /** 文档里的位置（§16：数组顺序也是模型的一部分）。没有它，读回来的 token 表顺序由物理行序决定 */
    sortIndex: integer('sort_index').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('design_tokens_project_key_key').on(t.projectId, t.key), index('design_tokens_project_idx').on(t.projectId)],
);

export const components = pgTable(
  'components',
  {
    id: text('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    pageId: text('page_id').references(() => pages.id, { onDelete: 'cascade' }),
    rootNodeId: text('root_node_id').notNull(),
    variants: jsonb('variants'),
    props: jsonb('props'),
    slots: jsonb('slots'),
    description: text('description'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('components_project_name_key').on(t.projectId, t.name), index('components_project_idx').on(t.projectId)],
);

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    kind: AssetKind('kind').notNull(),
    name: text('name').notNull(),
    /** S3/MinIO object key；绝不存可公开枚举的路径（§80 文件上传安全） */
    storageKey: text('storage_key').notNull(),
    mime: text('mime'),
    bytes: bigint('bytes', { mode: 'number' }),
    width: integer('width'),
    height: integer('height'),
    checksum: text('checksum'),
    source: AssetSource('source').notNull().default('upload'),
    /** 生成参数（prompt / provider / model / seed / 角色一致性引用，§38-39） */
    genMeta: jsonb('gen_meta'),
    characterId: uuid('character_id'),
    createdById: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex('assets_storage_key_key').on(t.storageKey),
    index('assets_project_idx').on(t.projectId),
    index('assets_kind_idx').on(t.kind),
  ],
);

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** .nexus/ 相对路径或 code/ 路径（§102 / §105） */
    path: text('path').notNull(),
    kind: text('kind').notNull().default('code'),
    content: text('content'),
    bytes: bigint('bytes', { mode: 'number' }),
    checksum: text('checksum'),
    /** code-only region：无法安全回转成设计节点时保留原文（§19） */
    codeOnly: boolean('code_only').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('files_project_path_key').on(t.projectId, t.path), index('files_project_idx').on(t.projectId)],
);

export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    /** §112 的"职责"。装配 AI 请求时读走，随报文发给 provider（0014） */
    responsibilities: text('responsibilities').array().notNull().default(sql`'{}'`),
    /** 权限作用域；今天代码只认 `design.patch` 这一个（§73，见 server/domain/agents.ts） */
    capabilities: text('capabilities').array().notNull().default(sql`'{}'`),
    tools: text('tools').array().notNull().default(sql`'{}'`),
    modelClass: text('model_class').notNull().default('fast'),
    maxSteps: smallint('max_steps').notNull().default(12),
    output: text('output'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: now(),
  },
  (t) => [uniqueIndex('agents_key_key').on(t.key)],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('conversations_project_idx').on(t.projectId), index('conversations_user_idx').on(t.userId)],
);

export const agentTasks = pgTable(
  'agent_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    agentKey: text('agent_key').notNull(),
    status: TaskStatus('status').notNull().default('queued'),
    /** §25：Goal / Constraints / Tasks / Dependencies / Risks / Validation */
    plan: jsonb('plan'),
    input: jsonb('input'),
    result: jsonb('result'),
    error: text('error'),
    /** §74/§177 高危动作需人工批准 */
    requiresApproval: boolean('requires_approval').notNull().default(false),
    /**
     * §74：挂起那一刻的时间。等待中的行**必须**有它（0021 那条 CHECK 挡着），
     * 到期判定只读这一列——不读 created_at，异步作业从提交到挂起可以隔很久。
     */
    awaitingSince: timestamp('awaiting_since', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    capability: CapabilityStatus('capability'),
    attempt: smallint('attempt').notNull().default(1),
    /** §162：这行任务对应 ai-service 哪一个异步作业；NULL = 同步请求，没有可轮询的作业 */
    providerJobId: text('provider_job_id'),
    /** 已经翻译成实时事件的活动条数（0013）：轮询一次推进一次，不回头 */
    activityCursor: integer('activity_cursor').notNull().default(0),
    createdById: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: now(),
  },
  (t) => [
    index('agent_tasks_project_idx').on(t.projectId),
    index('agent_tasks_status_idx').on(t.status),
    index('agent_tasks_created_idx').on(t.createdAt),
  ],
);

export const agentEvents = pgTable(
  'agent_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => agentTasks.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    /** §26：只允许 stage / status / summary / counts / artifactRef，禁止透传隐藏推理 */
    stage: text('stage').notNull(),
    status: text('status').notNull(),
    summary: text('summary'),
    counts: jsonb('counts'),
    artifactRef: text('artifact_ref'),
    createdAt: now(),
  },
  (t) => [uniqueIndex('agent_events_task_seq_key').on(t.taskId, t.seq), index('agent_events_task_idx').on(t.taskId)],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: MessageRole('role').notNull(),
    content: text('content').notNull(),
    /** 本条消息产生的设计补丁与其能力标记（§151 / §160） */
    patch: jsonb('patch'),
    taskId: uuid('task_id').references(() => agentTasks.id, { onDelete: 'set null' }),
    capability: CapabilityStatus('capability'),
    createdAt: now(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt)],
);

export const usage = pgTable(
  'usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    taskId: uuid('task_id').references(() => agentTasks.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    kind: text('kind').notNull(),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    latencyMs: integer('latency_ms'),
    costEstimate: real('cost_estimate'),
    demoMode: boolean('demo_mode').notNull().default(true),
    createdAt: now(),
  },
  (t) => [index('usage_user_created_idx').on(t.userId, t.createdAt), index('usage_task_idx').on(t.taskId)],
);

export const publishedProjects = pgTable(
  'published_projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    snapshotId: uuid('snapshot_id').references(() => snapshots.id, { onDelete: 'set null' }),
    /**
     * §50 / ADR-0009：发布那一刻从 `games.document` 原样钉下来的游戏设计。
     * 公开可玩只读这一列，不读工作稿——否则昨天分享的链接今天会变玩法。
     * NULL 有两种来源（这一版没有游戏设计 / 这行早于迁移 0012），都不回填。
     */
    gameDocument: jsonb('game_document'),
    /** /n/<handle>/<slug>（§56） */
    path: text('path').notNull(),
    visibility: Visibility('visibility').notNull().default('public'),
    version: integer('version').notNull().default(1),
    moderation: ModerationStatus('moderation').notNull().default('pending'),
    publishedById: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
    views: bigint('views', { mode: 'number' }).notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('published_path_key').on(t.path),
    index('published_project_idx').on(t.projectId),
    // §61 发现页 / trending 的热读路径：`WHERE visibility='public' ORDER BY published_at DESC LIMIT 200`
    // （social.ts 的 discover 查询）。没有它，这一句是全表扫 + 排序；有了它，倒序扫描直接取前 N 行。
    index('published_visibility_published_idx').on(t.visibility, t.publishedAt),
  ],
);

/**
 * §133 teamCollaboration 那一格（#201）：项目协作者与邀请。
 *
 * 两件事分开存，因为它们的生命周期不同：
 * - `project_members` 是**既成事实**：邀请被接受后才有一行，unique(projectId, userId)
 *   挡"同一个人在同一项目里两行"（两个标签页同时接受同一枚邀请）；
 * - `project_invites` 是**未兑现的承诺**：pending 的行占名额（否则可以无限发邀请绕过上限），
 *   accepted / revoked 是终态。token 是邀请链接的 secret，不参与任何鉴权 cookie。
 *
 * owner 自己**不是**成员行：`PLAN_LIMITS.teamMembers` 数的是"除 owner 外还能拉几个人"
 * （free=1 就是可以拉一个协作者）。把 owner 也算进去，free 档就连自己都装不下了。
 */
export const PROJECT_MEMBER_ROLES = ['editor', 'viewer'] as const;
export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number];

export const PROJECT_INVITE_STATUSES = ['pending', 'accepted', 'revoked'] as const;
export type ProjectInviteStatus = (typeof PROJECT_INVITE_STATUSES)[number];

export const projectMembers = pgTable(
  'project_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<ProjectMemberRole>().notNull().default('editor'),
    invitedById: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('project_members_unique').on(t.projectId, t.userId),
    index('project_members_user_idx').on(t.userId),
  ],
);

export const projectInvites = pgTable(
  'project_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** 受邀人的邮箱：接受时按它找用户（本机没有发信，链接由邀请人自己转交） */
    email: text('email').notNull(),
    role: text('role').$type<ProjectMemberRole>().notNull().default('editor'),
    /** 邀请链接的 secret：/api/projects/invites/<token>/accept */
    token: text('token').notNull(),
    status: text('status').$type<ProjectInviteStatus>().notNull().default('pending'),
    invitedById: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    /** 兑现的那一刻：pending → accepted 时写，revoked 留 NULL */
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * 有效期（#213）：过期后不再占名额、也收不了。
     * "过期"是 `status='pending' AND expires_at <= now()` 的**计算值**，不是第四种 status——
     * 加一档状态要改 CHECK、改类型、改所有读路径，而"过期"是时间的函数，不该让人去改一行状态。
     */
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '7 days'`),
  },
  (t) => [uniqueIndex('project_invites_token_key').on(t.token), index('project_invites_project_idx').on(t.projectId)],
);

export const worlds = pgTable(
  'worlds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .unique(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    summary: text('summary'),
    /**
     * §44 世界文档（@nexus/world-model 的 WorldDocument 序列化）。
     * 原来那列叫 lore、装一个 jsonb 杂物袋，谁也没读过——九类内容需要一份有契约的文档，
     * 所以换成 document（迁移 0002）。和 snapshots 一样按 JSON 存，读写都过 zod。
     */
    document: jsonb('document'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('worlds_owner_idx').on(t.ownerId), index('worlds_project_idx').on(t.projectId)],
);

export const characters = pgTable(
  'characters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id').references(() => worlds.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    /**
     * §46 角色档案（@nexus/world-model 的 CharacterProfile 序列化）。
     * 原来 profile / visual / voice 三列各装一个 jsonb 杂物袋、谁也没读过——
     * 档案现在有一份契约，合成一列存（迁移 0003），读写都过 zod。
     * 名字单独留一列是为了列表与搜索不必解析 JSONB。
     */
    profile: jsonb('profile'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('characters_world_idx').on(t.worldId), index('characters_owner_idx').on(t.ownerId)],
);

export const memories = pgTable(
  'memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: MemoryScope('scope').notNull(),
    /** 归属主体：user_id / character_id / world_id / session id */
    subjectId: text('subject_id').notNull(),
    /**
     * §48 的硬边界：owner_id 决定谁能看与删（迁移 0004 补的）。
     * 只有 scope + subjectId 时，任何人拿着 id 都能读到别人的记忆——"可查看可删除"
     * 也就没有可归属的口径。project_id 让项目面板列得出自己这批；
     * user / session 两类不属于任何项目，留 null。
     */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    /** 没有 provider 就是 null：这里只保证可查看可删除，不假装已经能语义检索（§159） */
    embedding: vector('embedding', { dimensions: 1536 }),
    meta: jsonb('meta'),
    createdAt: now(),
  },
  (t) => [
    index('memories_subject_idx').on(t.scope, t.subjectId),
    index('memories_owner_idx').on(t.ownerId),
    index('memories_project_idx').on(t.projectId),
  ],
);

export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    worldId: uuid('world_id').references(() => worlds.id, { onDelete: 'cascade' }),
    /** lore / character / history / location / item / quest / document / code / design */
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    chunkIndex: integer('chunk_index').notNull().default(0),
    content: text('content').notNull(),
    tokens: integer('tokens'),
    embedding: vector('embedding', { dimensions: 1536 }),
    /** 混合检索：向量 + 全文（§49 / §93） */
    /** PostgreSQL 的生成列默认即 STORED，可被 GIN 索引（§93 混合检索） */
    tsv: tsvector('tsv').generatedAlwaysAs(sql`to_tsvector('simple', content)`),
    meta: jsonb('meta'),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex('knowledge_chunks_source_key').on(t.sourceType, t.sourceId, t.chunkIndex),
    index('knowledge_chunks_project_idx').on(t.projectId),
    index('knowledge_chunks_tsv_idx').using('gin', t.tsv),
    index('knowledge_chunks_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);

export const stories = pgTable(
  'stories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    worldId: uuid('world_id').references(() => worlds.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    /** 场景 / 分支 / 节点图（§42 / §47） */
    script: jsonb('script'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('stories_project_idx').on(t.projectId)],
);

export const games = pgTable(
  'games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .unique(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    summary: text('summary'),
    /**
     * §54 游戏设计文档（@nexus/game-model 的 GameDocument 序列化）。
     * 0000_init 那版是 entities + scene 两个 jsonb 杂物袋，除了主页数行数没人读过；
     * 迁移 0007 换成一份过 zod + validateGame 的文档（与 worlds.document 同一条路）。
     */
    document: jsonb('document'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('games_owner_idx').on(t.ownerId), index('games_project_idx').on(t.projectId)],
);

/**
 * §40-42 分镜（Storyboard）。一个项目一份（v1，与 worlds / games 同一口径）：
 * 面板、镜头参考图、时间线都从这一份出发，所以这里不预备"多份分镜"的列表。
 * 唯一索引把这条不变量写进库——没有它，一次并发建档就会留下两行，
 * 而"读最新那行"会让两行的内容都还在库里，只是看不见。
 *
 * 结构权威在 @nexus/video-model（纯函数包，不碰库）；`document` 存的是那个包序列化出来的
 * `Storyboard`，进出的两道门（zod 报文 + 归属校验）在 domain/storyboards.ts。
 * 时间戳只放进行列，不塞进文档：文档要能被同一份输入重复投影出同样的字节（§16 的可重放）。
 */
export const storyboards = pgTable(
  'storyboards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' })
      .unique(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    document: jsonb('document'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('storyboards_owner_idx').on(t.ownerId)],
);

export const likes = pgTable(
  'likes',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    createdAt: now(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.projectId] }), index('likes_project_idx').on(t.projectId)],
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): any => comments.id, { onDelete: 'cascade' }),
    /** 画布批注定位（§111）：指向设计节点 */
    nodeId: text('node_id'),
    /**
     * §111 批注的「已解决」：一行时间戳，存在性即状态（NULL = 未解决），见迁移 0038。
     * 公开评论（§59）这一列必须为空——CHECK `comments_resolved_at_only_annotations` 在库上。
     * 不存布尔：两个字段会漂移，一个字段不会（与 `projects.deletedAt` 同一纪律）。
     */
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    body: text('body').notNull(),
    createdAt: now(),
  },
  (t) => [index('comments_project_idx').on(t.projectId, t.createdAt)],
);

export const follows = pgTable(
  'follows',
  {
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followeeId: uuid('followee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: now(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] }), index('follows_followee_idx').on(t.followeeId)],
);

/**
 * §132 block / mute。一条关系只有一行：block 的效果包含 mute，所以"既拉黑又屏蔽"
 * 不是第三种状态，从 mute 升到 block 是改 kind。判定只看"有没有这一行 + 是什么"。
 * `not_self` 与 kind 白名单两条 CHECK 只在迁移 0011 的 SQL 里（这张表的其他约束也一样，
 * 全库没有用 drizzle 的 check()），所以这里不重复声明。
 */
export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] }), index('user_blocks_blocked_idx').on(t.blockedId)],
);

/**
 * §134 的额度账本。两条不能省的形状：
 * - **没有"余额"这一列**：余额 = 这个人这一类 `delta` 的和。存一份可改的余额就是造第二份真值；
 * - **只追加**：迁移 0016 上挂了一个 BEFORE UPDATE OR DELETE 触发器，退款与更正一律是**新写一行**。
 * 一次任务的一类产品只扣一次，靠 `credit_ledger_task_kind_key` 那条部分唯一索引（同步收尾与
 * 异步轮询收尾是同一条账的两条路，见 `domain/agent-tasks.ts` 的 `finishTask`）。
 */
export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<CreditLedgerKind>().notNull(),
    /** 正数=发放，负数=消费。0 没有意义，所以库里的 CHECK 直接不许（迁移 0016） */
    delta: integer('delta').notNull(),
    /** 人读的一句话，且必须能追到一件事：哪一次任务，或哪个月哪个档位 */
    reason: text('reason').notNull(),
    source: text('source').$type<CreditLedgerSource>().notNull(),
    /** 消费行指着那次任务；发放与调整行是 null */
    taskId: uuid('task_id').references(() => agentTasks.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    /** 发放行的幂等键（'2026-09'）。消费行也带上月份，只是不进那条唯一索引 */
    period: text('period'),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex('credit_ledger_task_kind_key')
      .on(t.taskId, t.kind)
      .where(sql`${t.taskId} is not null`),
    uniqueIndex('credit_ledger_grant_once_key')
      .on(t.userId, t.kind, t.period)
      .where(sql`${t.source} = 'plan_grant'`),
    index('credit_ledger_user_idx').on(t.userId, t.createdAt),
  ],
);

export const remixes = pgTable(
  'remixes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceProjectId: uuid('source_project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    forkedProjectId: uuid('forked_project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: now(),
  },
  (t) => [uniqueIndex('remixes_fork_key').on(t.forkedProjectId), index('remixes_source_idx').on(t.sourceProjectId)],
);

/** 审计事件（§80 / §84）：谁在什么时候做了什么，含被拒绝的越权尝试 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    allowed: boolean('allowed').notNull().default(true),
    detail: jsonb('detail'),
    ip: text('ip'),
    createdAt: now(),
  },
  (t) => [index('audit_actor_idx').on(t.actorId, t.createdAt), index('audit_action_idx').on(t.action)],
);

/** §59 Save：收下的是"这一版公开页"，所以挂 publication_id 而不是 project_id */
export const saves = pgTable(
  'saves',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    publicationId: uuid('publication_id')
      .notNull()
      .references(() => publishedProjects.id, { onDelete: 'cascade' }),
    createdAt: now(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.publicationId] }), index('saves_user_idx').on(t.userId, t.createdAt)],
);

/**
 * §168 Analytics：一行 = 一个访客在一天里对某一份公开快照的现场。
 *
 * 为什么要有这张表：views / likes / remixes / followers 从旧表数得出来，
 * 但 completion 与 play time **此前没有任何采集**——不采就没有真值，
 * 拿 PV 或"页面停留"改个名字冒充就是 §159 禁止的那种假数据。
 * 时长与比例都是**按访客聚合**的（累加 / 取最远），所以粒度是"访客 × 天"而不是事件流。
 */
export const publicationVisits = pgTable(
  'publication_visits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicationId: uuid('publication_id')
      .notNull()
      .references(() => publishedProjects.id, { onDelete: 'cascade' }),
    /** 浏览器里生成的匿名 key：只用来把同一人的多次心跳并成一行，不代表账号 */
    visitorKey: text('visitor_key').notNull(),
    day: date('day').notNull(),
    /** 登录访客的账号，匿名留 null —— 作者自己的访问因此能在查询里挑出来说明 */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    opens: integer('opens').notNull().default(0),
    visibleMs: bigint('visible_ms', { mode: 'number' }).notNull().default(0),
    completionPct: integer('completion_pct').notNull().default(0),
    /** 被上限截断过几次：被动过的痕迹要留得下来，不然"累计时长"看着像原样 */
    cappedReports: integer('capped_reports').notNull().default(0),
    /** §168 第三片：疑似爬虫/自动化（判定在 classifyVisit，这里只存结论，历史行不补判） */
    suspectedBot: boolean('suspected_bot').notNull().default(false),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('publication_visit_day_key').on(t.publicationId, t.visitorKey, t.day),
    index('publication_visit_pub_idx').on(t.publicationId, t.day),
  ],
);

/**
 * §168：游戏侧的"通关"事件——玩家玩到了结局。
 *
 * 为什么不能拿 `publication_visits.completion_pct` 顶替：那个数是**滚动比例**
 * （这一页滚到哪儿），而"通关"是**另一回事**（玩到了结局）⇒ 混进同一行，
 * "完成度 100%"里就会混着"通关"，那一句谁也不说了（§159）。
 *
 * 粒度是"一个访客在一个发布版本上通关一次"（唯一索引）⇒ 计的是**通关过多少人**，
 * 不是通关了几次；界面上那一句必须跟着这个粒度走。
 */
export const gameCompletions = pgTable(
  'game_completions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicationId: uuid('publication_id')
      .notNull()
      .references(() => publishedProjects.id, { onDelete: 'cascade' }),
    /** 浏览器里生成的匿名 key：与访客现场那把是同一把（同一个"人"），不代表账号 */
    visitorKey: text('visitor_key').notNull(),
    /** 登录访客的账号，匿名留 null */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** §168 第三片那条纪律：疑似爬虫/自动化（判定在 classifyVisit，这里只存结论） */
    suspectedBot: boolean('suspected_bot').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('game_completions_once').on(t.publicationId, t.visitorKey),
    index('game_completions_pub_idx').on(t.publicationId),
  ],
);

/**
 * §131 发布审核：upload → 机检 → 风险分级 → 发布或人工复核。
 *
 * 一行 = 一次发布扫描。`reviewRequired` 才进人工队列，所以 clear 不会把队列淹掉，
 * 而 `resolution` 只能由人（role='admin'）写：机检永远不把 published_projects.moderation
 * 改成 approved —— 那是把"没查出问题"说成"审核通过"。
 */
export const moderationCases = pgTable(
  'moderation_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** 被挡下的那次发布根本没有 publication 行，所以可空 */
    publicationId: uuid('publication_id').references(() => publishedProjects.id, { onDelete: 'set null' }),
    publicationVersion: integer('publication_version').notNull(),
    visibility: Visibility('visibility').notNull(),
    decision: ModerationCaseDecision('decision').notNull(),
    reviewRequired: boolean('review_required').notNull().default(false),
    /** [{rule, level, quote, where, why}]：证据要能指回文档里的哪一处，否则人无从复核 */
    findings: jsonb('findings').notNull().default([]),
    /** 哪一版规则扫的：规则会改，改了以后旧案要能说清当时看到了什么 */
    rulesVersion: text('rules_version').notNull(),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolution: ModerationStatus('resolution'),
    resolutionNote: text('resolution_note'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: now(),
  },
  (t) => [
    index('moderation_case_project_idx').on(t.projectId, t.createdAt),
    index('moderation_case_queue_idx').on(t.reviewRequired, t.resolvedAt),
  ],
);

/** §132 社区举报：公开页上真的能提交，提交后有人能看见（admin 队列），不是丢进黑洞 */
export const abuseReports = pgTable(
  'abuse_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicationId: uuid('publication_id')
      .notNull()
      .references(() => publishedProjects.id, { onDelete: 'cascade' }),
    /** 举报按 URL 进来，冗余存一份路径：取消发布后行还在，复盘时对得上 */
    path: text('path').notNull(),
    reason: ReportReason('reason').notNull(),
    detail: text('detail'),
    reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    status: ReportStatus('status').notNull().default('open'),
    createdAt: now(),
  },
  (t) => [index('abuse_report_publication_idx').on(t.publicationId), index('abuse_report_status_idx').on(t.status)],
);

/**
 * §164 Notifications：一行 = 有一个人真的做过一件事，而这件事与另一个人有关。
 *
 * 原文（§164）列的四类里只有 Publish complete 今天有服务端终态可发；
 * Generation 是同步回话（没有作业可以"完成"）、Agent task 表全库无写入方、Build 这个操作不存在，
 * 所以这三类在界面上写成"没有真实来源"而不是往这里插行。
 * 反过来，人工裁决与别人对你作品的动作是**真的延后发生**的事件，它们才是收件箱的价值所在。
 *
 * dedupe_key 是这张表的核心而不是优化：like / follow 是开关式的，
 * 没有唯一键的话"反复点五次"就会留下五条通知，收件箱变成噪音发生器。
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 收件人：读与标记只按这一列判定，别人的通知查不到 */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 造成这件事的人；注销后留着——那是"我收到过什么"的历史，不是那个人的资产 */
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    /** 取值由 lib/notify-plan.ts 的联合类型把住（唯一写入方），没有用 pg enum */
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    /** 摘录（评论正文等），写入前已按上限裁短 */
    body: text('body'),
    /** 站内相对地址；没有能跳的地方就是 null，不编一个 404 地址 */
    link: text('link'),
    /** 指针留着是为了读取时判断"目标还在不在"，不是为了拼地址 */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    /** 刻意 SET NULL：作者下架不该顺手删掉别人收件箱里的历史 */
    publicationId: uuid('publication_id').references(() => publishedProjects.id, { onDelete: 'set null' }),
    dedupeKey: text('dedupe_key').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('notification_dedupe_key').on(t.dedupeKey), index('notification_inbox_idx').on(t.userId, t.createdAt)],
);

/**
 * §164 NotificationSettings：用户对每一类通知的开关。
 *
 * 一行 = 一个用户对某一类通知的偏好。没有行就用默认值（全开），
 * 这样新用户不需要初始化 10 行数据就能开始收通知；
 * 而"我关掉了哪一类"这件事对这个人来说必须是可查可改的，所以有表而不是硬编码。
 *
 * kind 的取值域与 lib/notify-plan.ts 的 NotificationKind 一致（迁移 0022 用 CHECK 钉住）。
 */
export const notificationSettings = pgTable(
  'notification_settings',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 取值由 lib/notify-plan.ts 把住，库侧 CHECK（迁移 0022）是同一件事的第二处写法 */
    kind: text('kind').notNull(),
    /** 关掉就是 false：true 或不存在这一行都表示"收" */
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind] })],
);

/**
 * §188 M8（MCP / 外部 Agent / 公开 API）的凭据表。
 *
 * 与 `sessions` 同一口径：**只存哈希**（§80）。明文只在签发那一次出现在响应里，
 * 之后连服务端自己都拿不回来——所以这一页只有"重发一枚"，没有"再看一眼"。
 * `hint` 留随机段前 8 位是为了让人在列表里认出是哪一把（CI 那把 / 本地脚本那把），
 * 它不是凭据的一部分，也不足以拼回凭据。
 *
 * `revokedAt` 用时间而不是布尔：吊销要留"什么时候吊销的"，一次 401 事后才解释得了。
 * 行不删（与 notifications 那处的道理同一形状）：删了行就分不清"这枚 token 从没存在过"
 * 和"存在过、被吊销了"，而后者才是调用方真正需要知道的那一句。
 */
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(),
    hint: text('hint').notNull(),
    /** 取值域在 @nexus/schemas 的 API_TOKEN_SCOPES，库侧 CHECK（迁移 0018）是同一件事的第二处写法 */
    scopes: text('scopes').array().$type<ApiTokenScope[]>().notNull(),
    createdAt: now(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('api_tokens_hash_key').on(t.tokenHash), index('api_tokens_user_idx').on(t.userId)],
);

/**
 * §188 M8 第三片：这本账答的是"哪一枚凭据在什么时候读了哪一份文档"。
 *
 * 一行不是"一次调用"而是"一个（凭据, 端点, 项目, 分钟）"，`calls` 是这一分钟里的次数——
 * 这样"读接口不许变成写接口"那条纪律在开了账之后依然成立（详见迁移 0020 的开头）。
 * 它与 §80 的 `audit_events` 是两本账：那本记**决定**（放行与拒绝），这本记**用量**。
 * 桶必须是整分钟、`calls >= 1` 这两条 CHECK 只在库里（迁移 0020），与 `api_tokens` 的
 * scope 名单同一个口径：drizzle 这边不重复写约束，写了也不会替库执行。
 */
export const apiAccessBuckets = pgTable(
  'api_access_buckets',
  {
    tokenId: uuid('token_id')
      .notNull()
      .references(() => apiTokens.id, { onDelete: 'cascade' }),
    /** 路由自己报失败时说的那一句，例如 `GET /api/v1/projects/[projectId]/design` */
    endpoint: text('endpoint').notNull(),
    /** 集合类端点没有具体项目，是空串而不是 null：这一列要进主键，而 null 之间不比相等 */
    projectId: text('project_id').notNull().default(''),
    bucket: timestamp('bucket', { withTimezone: true }).notNull(),
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
    calls: integer('calls').notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.tokenId, t.endpoint, t.projectId, t.bucket], name: 'api_access_buckets_pkey' }),
    index('api_access_buckets_token_recent_idx').on(t.tokenId, t.lastSeen),
  ],
);

/**
 * Marketplace：用户发布的可交易物品（§127-128）。
 * 
 * 支持七类物品：组件 / 模板 / 设计系统 / 资产 / 世界 / 游戏 / AI 角色。
 * 每类物品的"内容"不同，但元数据与交易逻辑统一：
 * - 作者、标题、描述、标签、预览图
 * - 价格（credits）、可见性、下载次数
 * - 关联的源项目/快照（可选，用于从现有作品发布）
 * 
 * 边界纪律：
 * - `source_project_id` 是可选的：有些物品是专门创建的，不来自某个项目
 * - `snapshot_id` 钉住的是发布那一刻的版本，作者后续修改不影响已购买的副本
 * - `price_credits` 为 0 表示免费；负数不允许（CHECK 约束保证）
 * - 删除策略：软删（`deleted_at`），保留购买记录与审计轨迹
 */
export const marketplaceItems = pgTable(
  'marketplace_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 发布者 */
    creatorId: uuid('creator_id').notNull(),
    /** 物品类型 */
    itemType: text('item_type', { enum: MARKETPLACE_ITEM_TYPES }).notNull(),
    /** 标题 */
    title: text('title').notNull(),
    /** 描述（最多 2000 字） */
    description: text('description').notNull().default(''),
    /** 标签数组（最多 5 个） */
    tags: text('tags').array().notNull().default(sql`ARRAY[]::text[]`),
    /** 预览图 asset id（可选） */
    previewAssetId: uuid('preview_asset_id'),
    /** 源项目（如果来自某个项目的发布） */
    sourceProjectId: uuid('source_project_id'),
    /** 钉住的快照版本（发布那一刻的） */
    snapshotId: uuid('snapshot_id'),
    /** 关联的设计文档/世界文档/游戏文档 id（根据 item_type 指向不同的表） */
    documentId: uuid('document_id'),
    /** 价格（credits），0 表示免费 */
    priceCredits: integer('price_credits').notNull().default(0),
    /** 可见性 */
    visibility: text('visibility', { enum: MARKETPLACE_VISIBILITY }).notNull().default('private'),
    /** 下载次数 */
    downloadCount: integer('download_count').notNull().default(0),
    /** 软删标记 */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('marketplace_items_creator_idx').on(t.creatorId),
    index('marketplace_items_type_idx').on(t.itemType),
    index('marketplace_items_visibility_idx').on(t.visibility),
    index('marketplace_items_price_idx').on(t.priceCredits),
    index('marketplace_items_created_idx').on(t.createdAt),
  ],
);

/**
 * §127-128 Marketplace：购买记录表。一个用户对一件物品只买一次（幂等）。
 */
export const marketplacePurchases = pgTable(
  'marketplace_purchases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => marketplaceItems.id, { onDelete: 'cascade' }),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 购买时支付的价格（credits） */
    pricePaid: integer('price_paid').notNull(),
    /**
     * 列名**必须显式写**，不能用 `now()`：那个助手把列名写死成 `created_at`，
     * 于是 `purchasedAt: now()` 生成的是 `created_at` 列，而迁移 0024 建的是 `purchased_at`——
     * 两者对不上，插入直接报 `column "created_at" does not exist`。
     * 这一格从 0024 落地起就是坏的（见 `marketplace-settle.integration.test.ts` 头部）。
     */
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('marketplace_purchases_item_buyer_key').on(t.itemId, t.buyerId),
    index('marketplace_purchases_buyer_idx').on(t.buyerId),
    index('marketplace_purchases_item_idx').on(t.itemId),
    index('marketplace_purchases_purchased_idx').on(t.purchasedAt),
  ],
);

/**
 * §128 Marketplace：创作者分账记录表。一次购买只记一次分成（幂等）。
 */
export const marketplaceSplits = pgTable(
  'marketplace_splits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    purchaseId: uuid('purchase_id')
      .notNull()
      .references(() => marketplacePurchases.id, { onDelete: 'cascade' }),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 分给创作者的 credits */
    amount: integer('amount').notNull(),
    /** 同上：`now()` 会把列名写成 `created_at`，而迁移 0025 建的是 `split_at` */
    splitAt: timestamp('split_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('marketplace_splits_purchase_key').on(t.purchaseId),
    index('marketplace_splits_creator_idx').on(t.creatorId),
  ],
);

/**
 * §123 Marketplace：交易审计日志表。记录所有关键操作（购买、下载、分成结算、价格修改、上下架）。
 */
export const marketplaceAuditLog = pgTable(
  'marketplace_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** action: purchase / download / settle / price_change / list / delist / suspicious_purchase */
    action: text('action').notNull(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => marketplaceItems.id, { onDelete: 'cascade' }),
    metadata: jsonb('metadata').default('{}'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
  },
  (t) => [
    index('marketplace_audit_item_idx').on(t.itemId),
    index('marketplace_audit_actor_idx').on(t.actorId),
    index('marketplace_audit_occurred_idx').on(t.occurredAt),
  ],
);

/**
 * §123 Marketplace：用户举报与可疑行为记录表。
 */
export const marketplaceReports = pgTable(
  'marketplace_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => marketplaceItems.id, { onDelete: 'cascade' }),
    /** reason: fraud / spam / copyright / inappropriate / other */
    reason: text('reason').notNull(),
    description: text('description'),
    /** status: pending / reviewing / resolved / dismissed */
    status: text('status').notNull().default('pending'),
    adminNotes: text('admin_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('marketplace_reports_status_idx').on(t.status),
    index('marketplace_reports_item_idx').on(t.itemId),
    index('marketplace_reports_created_idx').on(t.createdAt),
    uniqueIndex('marketplace_reports_unique_reporter_item').on(t.reporterId, t.itemId),
  ],
);

export const schema = {
  users,
  sessions,
  projects,
  branches,
  snapshots,
  pages,
  designNodes,
  designTokens,
  components,
  assets,
  files,
  agents,
  conversations,
  agentTasks,
  agentEvents,
  messages,
  usage,
  publishedProjects,
  worlds,
  characters,
  memories,
  knowledgeChunks,
  stories,
  games,
  likes,
  comments,
  follows,
  userBlocks,
  creditLedger,
  remixes,
  auditEvents,
  moderationCases,
  abuseReports,
  saves,
  publicationVisits,
  notifications,
  notificationSettings,
  apiTokens,
  apiAccessBuckets,
  marketplaceItems,
  marketplacePurchases,
  marketplaceSplits,
  marketplaceAuditLog,
  marketplaceReports,
};
