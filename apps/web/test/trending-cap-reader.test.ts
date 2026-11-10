import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRENDING_CANDIDATE_CAP, trendingMethod } from '../src/server/domain/trending';

/**
 * §SEC 第四十四片：方法句说"只在最近 N 条公开版本里排"，那个 N 必须真的是 SQL 取候选集时用的数。
 *
 * 今天 both  sides 都写着 `TRENDING_CANDIDATE_CAP`，所以看起来是对的——但没有任何门要求它们继续同源：
 * 把 social.ts 那一行改成 `.limit(200)`（手抄一份）或 `.limit(limit)`（跟着页面页长走），
 * 句子照样说 200，而 `trending.test.ts` 那条"句子里有这个常数"照样绿。这一片补的就是那个读者。
 *
 * 判据钉在**出货的那段函数体**上（`discover` 自己的源码切片），不是全树搜 token：
 * 全树搜索会被别的函数里的同名常数满足，而真正取候选集的那一行可能已经改口。
 */

const SOCIAL = join(process.cwd(), 'apps/web/src/server/domain/social.ts');

/** 取 `export (async )?function name(` 到下一个 `export ` 之前那一段；找不到返回空串（由载体腿先红） */
function functionSource(name: string): string {
  const text = readFileSync(SOCIAL, 'utf8').replace(/\r\n/g, '\n');
  const hit = new RegExp(`^export (?:async )?function ${name}\\s*\\(`, 'm').exec(text);
  if (!hit) return '';
  const rest = text.slice(hit.index + 1);
  const next = /^export /m.exec(rest);
  return rest.slice(0, next ? next.index : rest.length);
}

/** 候选集那一行：`.limit( … )`。切片里只该有一处，多于一处就说明判据读的不是唯一那个读者 */
function limitCalls(body: string): string[] {
  return body.match(/\.limit\([^)]*\)/g) ?? [];
}

describe('载体：判据读的那段代码真的在（空切片会让下面每一条都假绿）', () => {
  it('social.ts 里能找到 discover 的函数体，而且它不是一段空壳', () => {
    const body = functionSource('discover');
    expect(body, 'social.ts 里没有 export function discover——候选集不再由它取，这一片的判据没有载体').not.toBe('');
    expect(body.length, 'discover 的切片短得不像真的函数体（切片正则读错了边界）').toBeGreaterThan(800);
    expect(body, 'discover 的身体里没有任何 .limit(——候选集上限不再由这条 SQL 决定').toContain('.limit(');
  });

  it('discover 里只有一处 .limit(：判据点名的就是那一处，不是碰巧搜到的另一处', () => {
    expect(limitCalls(functionSource('discover')).length).toBe(1);
  });
});

describe('句子声称的那个数，就是 SQL 取候选集时用的那个数', () => {
  it('trending 那一支的 limit 参数按名字读 TRENDING_CANDIDATE_CAP，不是手抄的数字、也不是页长', () => {
    const [call] = limitCalls(functionSource('discover'));
    expect(call, 'trending 的候选集不再按 TRENDING_CANDIDATE_CAP 取——方法句里那个数成了空话').toContain(
      'TRENDING_CANDIDATE_CAP',
    );
    expect(call, '候选集那一行不再区分 trending 与别的排序（别的排序该按页长取）').toContain("input.sort === 'trending'");
    // 手抄一份的数字：即使今天恰好等于常数，成本/上限改了它也不会跟着改口
    expect(call, `候选集上限被写死成一个数字（${call}）——常数改了句子跟着改、SQL 不跟着改，就是两份真相`).not.toMatch(
      /\b\d+\b/,
    );
  });

  it('方法句里那个数与 SQL 读的是同一个常数（句子这一端不许另有来源）', () => {
    const method = trendingMethod();
    const numbers = method.match(/\d+/g) ?? [];
    expect(numbers, '方法句里一个数都没有——它不再披露候选集上限').toContain(String(TRENDING_CANDIDATE_CAP));
    expect(method, '方法句没有说"只在最近 N 条公开版本里排"，候选集那件事没被披露').toContain('条公开版本里排');
    // 反向对照：这句话不是"按热度排"那种把算法藏起来的说法
    expect(method).not.toBe('按热度排序');
  });

  it('SQL 那一端读的就是句子这一端的同一个 binding（不是两个碰巧相等的常数）', async () => {
    const social = await import('../src/server/domain/social');
    const trending = await import('../src/server/domain/trending');
    expect(typeof social.discover, 'social.ts 不再导出 discover，页面那一栏没有生产者').toBe('function');
    expect(trending.TRENDING_CANDIDATE_CAP, '常数不再是数，句子与 SQL 都无从同源').toBe(TRENDING_CANDIDATE_CAP);
    // social.ts 必须真的从 trending 模块 import 这个常数（而不是自己另声明一份同名的）
    const text = readFileSync(SOCIAL, 'utf8').replace(/\r\n/g, '\n');
    const importBlock = /import\s*\{[^}]*\}\s*from\s*'\.\/trending'/.exec(text);
    expect(importBlock, 'social.ts 不再从 ./trending import 任何东西——它可能自己另抄了一份上限').not.toBeNull();
    expect(importBlock?.[0], 'social.ts 从 ./trending 取的那一份里没有 TRENDING_CANDIDATE_CAP').toContain(
      'TRENDING_CANDIDATE_CAP',
    );
    expect(text, 'social.ts 自己另声明了一份 TRENDING_CANDIDATE_CAP（两份真值）').not.toMatch(
      /const\s+TRENDING_CANDIDATE_CAP\s*=/,
    );
  });
});