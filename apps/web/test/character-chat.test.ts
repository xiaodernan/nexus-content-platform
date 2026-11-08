import { describe, expect, it } from 'vitest';
import { buildContext, buildPersonaPrompt } from '../src/server/domain/character-chat';

/**
 * §47 人设与上下文组装。对话 API 在 DEMO MODE 下不生成回复（§159），
 * 但"人设拼得对不对、记忆与语料进没进上下文"是纯逻辑，在这里钉死。
 */

describe('buildPersonaPrompt', () => {
  it('名字进首句，空档案只有骨架', () => {
    const prompt = buildPersonaPrompt({ name: '守夜人', profile: null }, null);
    expect(prompt).toContain('守夜人');
    expect(prompt).toContain('第一人称');
    expect(prompt).not.toContain('身份：');
  });

  it('无名角色回落到"未命名角色"', () => {
    const prompt = buildPersonaPrompt({ name: '', profile: null }, null);
    expect(prompt).toContain('未命名角色');
  });

  it('填过的栏位进提示词，空栏位不占行', () => {
    const prompt = buildPersonaPrompt(
      {
        name: '守夜人',
        profile: {
          identity: '边境守卫',
          appearance: '灰斗篷',
          personality: '',
          traits: ['沉默', '警觉'],
          goals: ['守住山口'],
          fears: [],
          voice: { register: '低沉', pace: '慢', catchphrases: ['天黑了'] },
          visualIdentity: { silhouette: '斗篷轮廓', motifs: ['渡鸦'], palette: ['#1a1a2e'] },
          relationships: [{ kind: '同袍', target: '老林', note: '一起守过冬' }],
        },
      },
      {
        identity: '边境守卫',
        appearance: '灰斗篷',
        personality: '',
        traits: ['沉默', '警觉'],
        goals: ['守住山口'],
        fears: [],
        voice: { register: '低沉', pace: '慢', catchphrases: ['天黑了'] },
        visualIdentity: { silhouette: '斗篷轮廓', motifs: ['渡鸦'], palette: ['#1a1a2e'] },
        relationships: [{ kind: '同袍', target: '老林', note: '一起守过冬' }],
      },
    );
    expect(prompt).toContain('身份：边境守卫');
    expect(prompt).toContain('外观：灰斗篷');
    expect(prompt).not.toContain('性格：');
    expect(prompt).toContain('特征：沉默、警觉');
    expect(prompt).toContain('目标：守住山口');
    expect(prompt).not.toContain('恐惧：');
    expect(prompt).toContain('语域：低沉');
    expect(prompt).toContain('口头禅：天黑了');
    expect(prompt).toContain('轮廓：斗篷轮廓');
    expect(prompt).toContain('同袍 → 老林（一起守过冬）');
  });
});

describe('buildContext', () => {
  it('只有人设时也有"当前对话"收尾', () => {
    const context = buildContext('你是守夜人。', [], '');
    expect(context).toContain('你是守夜人。');
    expect(context).toContain('【当前对话】');
    expect(context).not.toContain('【相关记忆】');
    expect(context).not.toContain('【相关语料】');
  });

  it('记忆与语料按截断规则进来', () => {
    const long = '记'.repeat(500);
    const context = buildContext('人设', [{ content: long }], '语料'.repeat(600));
    expect(context).toContain('【相关记忆】');
    expect(context).toContain('【相关语料】');
    // 记忆截 200，语料截 1000
    expect(context.length).toBeLessThan('人设'.length + 200 + 1000 + 100);
  });
});
