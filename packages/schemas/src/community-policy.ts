import { z } from 'zod';

/**
 * §SC-17：社区互动的策略本体。今天该策略只有一个写入方（`apps/web/src/server/domain/blocks.ts`
 * 与 `social.ts`），而 `services/java-domain-service` 的 community 还是桩。桩落地的那一刻就会出现
 * 第二个写入方，两份"什么算被挡住"迟早不一致——所以先把字面量收拢到这里，再让 Java 读同一份导出。
 *
 * 导出两件东西，用途不同：
 * - `contracts/community-policy.json`：**值**文档（ kinds / 拒绝理由 / 可达性谓词的参数）。
 *   Maven 把它打进 jar，Java 运行期读它，不在 Java 里抄第二份字符串。
 * - `community-like-state.schema.json` / `community-follow-state.schema.json`：**报文形状**，
 *   走 `CONTRACT_EXPORTS` 那条既有的漂移门（架构纪律 6：跨端报文只用 packages/schemas）。
 *
 * 边界（与 blocks.ts 文件头同一条，写在这里是因为两个写入方都要照它做）：
 * - **mute 只挡可见性，不挡互动**：被屏蔽的人照样能点赞、关注、评论。
 * - **block 双向挡互动**：两个方向都拒，理由分别说清是谁先拉的谁。
 * - 认不出的 kind 一律当"没有关系"，不当 block：拿旧数据去拒别人的正常互动比放行更糟。
 */

export const BLOCK_KINDS = ['block', 'mute'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export const BlockKindSchema = z.enum(BLOCK_KINDS);

/** 谁先拉的谁。回执里要说清，否则"被挡住"看起来像一次失败而不是一条边界 */
export const BLOCKED_BY = ['me', 'them'] as const;
export type BlockedBy = (typeof BLOCKED_BY)[number];
export const BlockedBySchema = z.enum(BLOCKED_BY);

/** 挡互动的那几类。刻意不是 BLOCK_KINDS 的全部：mute 不在里面 */
export const INTERACTION_BLOCKING_KINDS: readonly BlockKind[] = ['block'];

export const INTERACTION_REFUSAL = {
  them: '对方不接受你的互动',
  me: '你已经拉黑了对方，先解除才能互动',
} as const;

export const COMMUNITY_REFUSAL = {
  selfFollow: '不能关注自己',
  selfBlock: '不能把自己拉黑或屏蔽',
  unknownKind: '只支持 block 与 mute 两类',
  noSuchUser: '没有这个用户',
  noSuchPublication: '没有这个发布版本',
  publicationGone: '这一版已经不公开了',
} as const;

/**
 * 按路径可达的发布版本。`unlisted` 在里面：它的意思就是"不进发现页，但拿到链接的人能看"，
 * 所以"可达"与"进发现列表"是两条谓词（发现列表只要 `public`，见 social.ts 的 discover）。
 */
export const PUBLICATION_REACHABLE_VISIBILITY = ['unlisted', 'public'] as const;
export const REJECTED_MODERATION = 'rejected';

export interface PublicationFacts {
  visibility: string;
  moderation: string;
  /** 项目软删除（§74）：行还在，但公开页已经 404，点赞/评论/改编也不该再收 */
  projectDeleted: boolean;
}

/** 人工拒绝的、私有的、项目已删的都不算存在。机检 flagged/pending 不在这条谓词里——那是 moderation 的分级 */
export function publicationReachable(facts: PublicationFacts): boolean {
  if (facts.projectDeleted) return false;
  if (facts.moderation === REJECTED_MODERATION) return false;
  return (PUBLICATION_REACHABLE_VISIBILITY as readonly string[]).includes(facts.visibility);
}

export type InteractionVerdict = { allowed: true } | { allowed: false; reason: string; blockedBy: BlockedBy };

/** 点赞回执。`blocked` 非空时这不是一次"点赞失败"，是一条边界（§132） */
export const CommunityLikeStateSchema = z.object({
  liked: z.boolean(),
  count: z.number().int().nonnegative(),
  blocked: BlockedBySchema.nullable(),
  reason: z.string().nullable(),
});
export type CommunityLikeState = z.infer<typeof CommunityLikeStateSchema>;

export const CommunityFollowStateSchema = z.object({
  following: z.boolean(),
  followers: z.number().int().nonnegative(),
  blocked: BlockedBySchema.nullable(),
  reason: z.string().nullable(),
});
export type CommunityFollowState = z.infer<typeof CommunityFollowStateSchema>;

/**
 * 值文档的内容。键名就是 Java 侧 `CommunityPolicy` 的取值路径，改名要两边一起改
 * （Java 的单测把这些值钉死，所以改了这边而忘了那边，Maven 会红）。
 */
export const COMMUNITY_POLICY = {
  blockKinds: BLOCK_KINDS,
  interactionBlockingKinds: INTERACTION_BLOCKING_KINDS,
  interactionRefusal: INTERACTION_REFUSAL,
  refusal: COMMUNITY_REFUSAL,
  publication: {
    reachableVisibility: PUBLICATION_REACHABLE_VISIBILITY,
    rejectedModeration: REJECTED_MODERATION,
    deletedProjectHides: true,
  },
} as const;

export const COMMUNITY_POLICY_FILE = 'community-policy.json';

export function renderCommunityPolicy(): string {
  return `${JSON.stringify(COMMUNITY_POLICY, null, 2)}\n`;
}