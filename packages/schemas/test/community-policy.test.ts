import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BLOCK_KINDS,
  COMMUNITY_POLICY,
  COMMUNITY_POLICY_FILE,
  COMMUNITY_REFUSAL,
  CommunityFollowStateSchema,
  CommunityLikeStateSchema,
  INTERACTION_BLOCKING_KINDS,
  INTERACTION_REFUSAL,
  publicationReachable,
  renderCommunityPolicy,
} from '../src/community-policy';

/**
 * §SC-17：这份值文档有两个读者（web 的域函数、java-domain-service 的 CommunityPolicy），
 * 所以门要钉两件事：文件与代码逐字节一致，以及**跨语言取值路径的键名**不许悄悄改。
 * Java 侧另有单测把这些值钉死，改了这边忘了那边，Maven 会红。
 */
describe('community-policy 值文档', () => {
  it('contracts/community-policy.json 与代码逐字节一致', () => {
    const onDisk = readFileSync(fileURLToPath(new URL(`../../../contracts/${COMMUNITY_POLICY_FILE}`, import.meta.url)), 'utf8');
    expect(onDisk).toBe(renderCommunityPolicy());
  });

  it('Java 取值的那几个键一个不少一个不多', () => {
    expect(Object.keys(COMMUNITY_POLICY)).toEqual([
      'blockKinds',
      'interactionBlockingKinds',
      'interactionRefusal',
      'refusal',
      'publication',
    ]);
    expect(Object.keys(COMMUNITY_POLICY.publication)).toEqual(['reachableVisibility', 'rejectedModeration', 'deletedProjectHides']);
    expect(Object.keys(COMMUNITY_POLICY.refusal)).toEqual([
      'selfFollow',
      'selfBlock',
      'unknownKind',
      'noSuchUser',
      'noSuchPublication',
      'publicationGone',
    ]);
  });

  it('mute 不挡互动——这条边界翻了就是把屏蔽当禁言用', () => {
    expect(BLOCK_KINDS).toEqual(['block', 'mute']);
    expect(INTERACTION_BLOCKING_KINDS).toEqual(['block']);
    expect(INTERACTION_BLOCKING_KINDS).not.toContain('mute');
  });

  it('两个方向的理由不是同一句话：回执要能说清是谁先拉的谁', () => {
    expect(INTERACTION_REFUSAL.me).not.toBe(INTERACTION_REFUSAL.them);
    expect(Object.values(COMMUNITY_REFUSAL).every((s) => s.length > 0)).toBe(true);
    expect(new Set(Object.values(COMMUNITY_REFUSAL)).size).toBe(Object.values(COMMUNITY_REFUSAL).length);
  });
});

describe('publicationReachable', () => {
  const live = { visibility: 'public', moderation: 'pending', projectDeleted: false };

  it('public + 未决 / 通过 / 机检标记都可达', () => {
    for (const moderation of ['pending', 'approved', 'flagged']) {
      expect(publicationReachable({ ...live, moderation })).toBe(true);
    }
  });

  it('unlisted 可达：它的意思就是"不进发现页，但拿到链接的人能看"', () => {
    expect(publicationReachable({ ...live, visibility: 'unlisted' })).toBe(true);
  });

  it('private / 人工拒绝 / 项目软删除都不算存在', () => {
    expect(publicationReachable({ ...live, visibility: 'private' })).toBe(false);
    expect(publicationReachable({ ...live, moderation: 'rejected' })).toBe(false);
    expect(publicationReachable({ ...live, projectDeleted: true })).toBe(false);
  });

  it('认不出的 visibility 一律不可达（白名单，不是黑名单）', () => {
    expect(publicationReachable({ ...live, visibility: 'friends-only' })).toBe(false);
    expect(publicationReachable({ ...live, visibility: '' })).toBe(false);
  });
});

describe('点赞 / 关注回执的形状', () => {
  it('挡住与没挡住都能表达，计数不许是负数或小数', () => {
    expect(CommunityLikeStateSchema.parse({ liked: false, count: 0, blocked: 'them', reason: INTERACTION_REFUSAL.them }).blocked).toBe('them');
    expect(CommunityLikeStateSchema.parse({ liked: true, count: 3, blocked: null, reason: null }).liked).toBe(true);
    expect(CommunityLikeStateSchema.safeParse({ liked: true, count: -1, blocked: null, reason: null }).success).toBe(false);
    expect(CommunityLikeStateSchema.safeParse({ liked: true, count: 1.5, blocked: null, reason: null }).success).toBe(false);
    expect(CommunityLikeStateSchema.safeParse({ liked: true, count: 1, blocked: 'both', reason: null }).success).toBe(false);
    expect(CommunityFollowStateSchema.safeParse({ following: true, followers: 2, blocked: null, reason: null }).success).toBe(true);
    expect(CommunityFollowStateSchema.safeParse({ following: true, followers: 2 }).success).toBe(false);
  });
});