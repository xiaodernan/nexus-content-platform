import { describe, expect, it } from 'vitest';
import {
  ShotCameraSchema,
  ShotTransitionSchema,
  StoryboardArrowSchema,
  StoryboardDocumentSchema,
  StoryboardSaveRequestSchema,
  StoryboardShotSchema,
} from '../src/index';
import { SHOT_CAMERAS, STORYBOARD_ARROWS, SHOT_TRANSITIONS, planStoryboard } from '@nexus/video-model';

/**
 * 分镜的 zod 报文与 @nexus/video-model 不许漂移（边界纪律 6）。
 * 与 world-contract / game-contract 同一套理由：清单写了两遍，就要有测试盯着它俩说的是不是同一件事。
 * 这里最阴的一种漂移不是枚举写错，而是**模型加了一个字段而报文不认识它**：
 * zod 默认把未知键剥掉，于是那一格存进库就永远读不出来——存得下但查不着，等于对下游不存在。
 */

describe('分镜契约（§40-42）', () => {
  it('三份枚举清单与模型完全一致，顺序也算', () => {
    expect([...ShotCameraSchema.options]).toEqual([...SHOT_CAMERAS]);
    expect([...ShotTransitionSchema.options]).toEqual([...SHOT_TRANSITIONS]);
    expect([...StoryboardArrowSchema.options]).toEqual([...STORYBOARD_ARROWS]);
  });

  it('报文的键清单覆盖模型的镜头字段（模型加字段而报文没跟上，就会被静默剥掉）', () => {
    const fullShot = {
      id: 'shot-1-abc',
      prompt: '夜色里的港口',
      durationMs: 3000,
      camera: 'wide' as const,
      transition: 'fade' as const,
      characterId: 'c-1',
      referenceAssetId: 'a-1',
      videoAssetId: 'v-1',
    };
    expect(Object.keys(fullShot).sort()).toEqual(Object.keys(StoryboardShotSchema.shape).sort());
    const parsed = StoryboardShotSchema.safeParse(fullShot);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(fullShot);
  });

  it('整份文档能往返：planStoryboard 的产物过一遍报文，逐字段还在', () => {
    const sb = planStoryboard('角色在雪地里回头，风把斗篷吹起来', {
      arrow: 'character-to-scene',
      characterId: 'c-7',
      referenceAssetId: 'a-3',
    });
    const parsed = StoryboardDocumentSchema.safeParse(sb);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(sb);
    // 来源那一格也不能被剥：切分依据（原话 + 箭头）要能重放
    if (parsed.success) expect(parsed.data.source).toEqual(sb.source);
  });

  it('镜头 id 撞了进不来：撤销补丁与时间线都按 id 指镜头，撞了就撤错一格', () => {
    const sb = planStoryboard('一，二');
    const clash = { ...sb, shots: sb.shots.map((s) => ({ ...s, id: 'same-id' })) };
    const parsed = StoryboardDocumentSchema.safeParse(clash);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toContain('镜头标识必须唯一');
  });

  it('时长上限远高于模型会产生的值：长镜头写得进，垃圾值才被拦', () => {
    const sb = planStoryboard('它跑起来了');
    const produced = sb.shots[0]!.durationMs;
    const long = { ...sb, shots: sb.shots.map((s) => ({ ...s, durationMs: produced * 100 })) };
    expect(StoryboardDocumentSchema.safeParse(long).success, `${produced * 100} 毫秒的长镜头被上限拦了`).toBe(true);
    expect(StoryboardDocumentSchema.safeParse({ ...sb, shots: [{ ...sb.shots[0]!, durationMs: 0 }] }).success).toBe(false);
    expect(StoryboardDocumentSchema.safeParse({ ...sb, shots: [{ ...sb.shots[0]!, durationMs: 3e9 }] }).success).toBe(false);
  });

  it('空白提示词的镜头进不来，空 notes 的合法（手写的分镜没有解释要交代）', () => {
    const sb = planStoryboard('一镜');
    expect(StoryboardDocumentSchema.safeParse({ ...sb, shots: [{ ...sb.shots[0]!, prompt: '   ' }] }).success).toBe(false);
    expect(StoryboardDocumentSchema.safeParse({ ...sb, notes: [] }).success).toBe(true);
  });

  it('PUT 体：baseUpdatedAt 可省（第一次建档手里没有基准），带上就得是个非空字符串', () => {
    const sb = planStoryboard('一镜');
    expect(StoryboardSaveRequestSchema.safeParse({ document: sb }).success).toBe(true);
    expect(StoryboardSaveRequestSchema.safeParse({ document: sb, baseUpdatedAt: '' }).success).toBe(false);
    expect(StoryboardSaveRequestSchema.safeParse({ document: sb, baseUpdatedAt: '2026-09-28T00:00:00.000Z' }).success).toBe(true);
  });

  it('未知机位不是"退回默认值"，是一次明确的拒绝（默认值会让人以为存进去了）', () => {
    const sb = planStoryboard('一镜');
    const bogus = { ...sb, shots: [{ ...sb.shots[0]!, camera: 'dutch-angle' }] };
    const parsed = StoryboardDocumentSchema.safeParse(bogus);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.map((i) => i.path.join('.'))).toContain('shots.0.camera');
  });
});
