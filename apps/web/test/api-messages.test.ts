import { describe, expect, it } from 'vitest';
import {
  API_MESSAGE_EXACT,
  translateApiIssues,
  translateApiMessage,
  translateApiOutletData,
} from '@/server/api-messages';

/**
 * Cont. 132/133 的钉住门（2026-11-15）：
 * - 源码 census（`\d{163}` 条 distinct zh message）已落进 EXACT 表——表不许悄悄缩
 *   （<160 必 red）、不许把 zh 原文以外的东西钉进去（key 全是 zh 散文，零英文 key）；
 * - zh 缺省 = 原文 passthrough（含表外散文：不命中就不猜）；
 * - en cookie=NEXUS_LOCALE=en 时命中表即翻译（含 pattern 的项目 id 同形替换）；
 * - reason/note/error/issues 扁平字段集中翻译，未命中透传，不多翻。
 */
describe('API messages（v1 双语）', () => {
  it('EXACT 表不小于 160 条（<160 说明有人清空/改 key，是 v132 契约倒退）', () => {
    expect(Object.keys(API_MESSAGE_EXACT).length).toBeGreaterThanOrEqual(160);
  });

  it('表的 key 全部含汉字（不是英文占位符）', () => {
    for (const key of Object.keys(API_MESSAGE_EXACT)) {
      expect(/[一-鿿]/.test(key), `non-zh key leaked into table: ${JSON.stringify(key)}`).toBe(true);
    }
  });

  it('常见 v1 散文一一对齐（字节级，含带中文标点）', () => {
    expect(API_MESSAGE_EXACT['CSRF 校验未通过']).toBe('CSRF check failed');
    expect(API_MESSAGE_EXACT['需要先登录']).toBe('Sign-in required');
    expect(API_MESSAGE_EXACT['需要登录']).toBe('Sign-in required');
    expect(API_MESSAGE_EXACT['服务器处理失败，请稍后重试']).toBe('The server could not process the request; please try again');
    expect(API_MESSAGE_EXACT['互动被挡住']).toBe('This interaction is blocked');
  });

  it('zh 缺省原文返回（表外未命中也原样透传）', () => {
    expect(translateApiMessage('随便一句中文散文，绝不猜', 'zh')).toBe('随便一句中文散文，绝不猜');
    expect(translateApiMessage('CSRF 校验未通过', 'zh')).toBe('CSRF 校验未通过');
  });

  it('en 命中即翻译；带 projectId 参数的同形替换一并覆盖', () => {
    expect(translateApiMessage('CSRF 校验未通过', 'en')).toBe('CSRF check failed');
    expect(
      translateApiMessage(
        '项目 abc123 不在这一枚凭据所属的人名下、已被删除，或库里还没有文档',
        'en',
      ),
    ).toContain("This project is not under this credential");
    expect(translateApiMessage('项目 p 不存在', 'en')).toBe('Project not found.');
  });

  it('issues 数组逐项翻译，形状不变（非串原样留下）', () => {
    expect(translateApiIssues(['CSRF 校验未通过', 'keep me'], 'en')).toEqual(['CSRF check failed', 'keep me']);
    expect(translateApiIssues(['原文'], 'zh')).toEqual(['原文']);
  });

  it('outlet data：message/reason/note/error/issues 一并翻译，其余字段不动', () => {
    const out = translateApiOutletData(
      { message: 'CSRF 校验未通过', reason: '互动被挡住', note: 'table miss passthrough', other: '原味', issues: ['需要登录'] },
      'en',
    ) as Record<string, unknown>;
    expect(out.message).toBe('CSRF check failed');
    expect(out.reason).toBe('This interaction is blocked');
    expect(out.note).toBe('table miss passthrough');
    expect(out.other).toBe('原味');
    expect(out.issues).toEqual(['Sign-in required']);
  });

  it('outlet data：zh 直接原样回来', () => {
    const input = { message: 'CSRF 校验未通过', issues: ['需要登录'] };
    expect(translateApiOutletData(input, 'zh')).toBe(input);
  });
});
