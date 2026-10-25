import { describe, expect, it } from 'vitest';
import { isUuid } from '../src/server/domain/ids';

/**
 * §ids：UUID 形状校验的**唯一去处**。
 *
 * 从路由进来的 id 大多是路径参数，Next 只保证它们是字符串。一个 `not-a-uuid` 直进
 * `eq(id, …)` 时 Postgres 抛 22P02（invalid input syntax for type uuid），于是"不存在"
 * 在界面上变成 500。这里把形状不对的 id 当成"查不到"，路由侧只剩 404 / 409 一种说法。
 *
 * 这一层是整个 id 校验的唯一来源（assets.ts / agent-tasks.ts / analytics 三处手抄正则都收回到这里），
 * 所以它的精确行为必须钉死——尤其是 zod 与手抄正则的**唯一分歧点**：变体位必须是 8/9/a/b，
 * 且全 0 / 全 f 两个特例放行。手抄正则收任何十六进制，会在这些输入上给出和 zod 不同的答案，
 * 于是"长得像 UUID 但不是"的请求被错误放行（§159：说法与事实要对上）。
 *
 * 变异探针：若有人把 `isUuid` 换成手抄正则，下面"变体位 c 必须拒"那条会红——手抄版会放行它。
 */

describe('isUuid：形状校验', () => {
  it('标准小写 v4 UUID 放行', () => {
    expect(isUuid('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
  });

  it('变体位是 8/9/a/b 都放行（RFC 4122 变体位）', () => {
    // 第 4 组的首字符即变体位：8/9/a/b 都是合法 variant
    expect(isUuid('12345678-1234-1234-8234-123456789012')).toBe(true);
    expect(isUuid('12345678-1234-1234-9234-123456789012')).toBe(true);
    expect(isUuid('12345678-1234-1234-a234-123456789012')).toBe(true);
    expect(isUuid('12345678-1234-1234-b234-123456789012')).toBe(true);
  });

  it('变体位落在 8/9/a/b 之外必须拒（手写正则会误放，zod 不会）——变异探针', () => {
    // 第 4 组首字符是 'c'：不是合法的 variant。手抄正则收任何十六进制会放行，zod 会拒。
    expect(isUuid('12345678-1234-1234-c234-123456789012')).toBe(false);
    expect(isUuid('12345678-1234-1234-d234-123456789012')).toBe(false);
    expect(isUuid('12345678-1234-1234-f234-123456789012')).toBe(false);
  });

  it('全 0 与全 f 两个特例放行（zod 的额外宽容，与手抄正则不同）', () => {
    expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(isUuid('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe(true);
  });

  it('形状不对一律拒：缺横线、长度不对、含非十六进制、空串', () => {
    expect(isUuid('f47ac10b58cc4372a5670e02b2c3d479')).toBe(false); // 无横线
    expect(isUuid('f47ac10b-58cc-4372-a567-0e02b2c3d47')).toBe(false); // 少一位
    expect(isUuid('f47ac10b-58cc-4372-a567-0e02b2c3d4799')).toBe(false); // 多一位
    expect(isUuid('g47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(false); // 非十六进制
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
  });

  it('非字符串输入按"不是 uuid"处理，不抛、不崩', () => {
    // 路由里 eq(id, <something>) 的 <something> 有时是从别处透传来的，类型上未必是 string；
    // 这里用断言把非字符串喂进去，验证运行期 safeParse 会把它们当"不是 uuid"处理
    expect(isUuid(null as unknown as string)).toBe(false);
    expect(isUuid(undefined as unknown as string)).toBe(false);
    expect(isUuid(12345678 as unknown as string)).toBe(false);
    expect(isUuid({} as unknown as string)).toBe(false);
  });
});
