import { describe, expect, it } from 'vitest';
import { BIBLE_ECHOES } from '../src/world-bible/generated';
import { buildEchoThreads } from '../src/lib/echoThreads';

/**
 * §ECHO-THREAD 回归：新写的回响必须能被线索索引"顺藤摸瓜"找到。
 *
 * 为什么钉这一条：线索表是手写的，理由写死在 echoThreads.ts 的注释里——
 * 「大已经有了，但大本身不是可探索」。若有人编辑线索表时误删一个词，
 * 刚写的一批回响会默默变成 orphan：页面还在、字数还在，只是没人能顺着找到它们。
 * 这正是"看着很大、里面很空"的失败模式，所以用测试把它钉住。
 */
describe('§ECHO-THREAD · 新回响在线索索引里可探索', () => {
  const index = buildEchoThreads(BIBLE_ECHOES);
  const fresh = (e: number) => e >= 222 && e <= 229;

  it('E222–E229 全部命中至少一条线索（无 orphan 回退）', () => {
    const orphans = index.orphans.filter(fresh);
    expect(orphans, `这些新回响没有被任何线索收录：${orphans.join(', ')}`).toEqual([]);
  });

  it('盐井线索串起 Echo #4 之后的 E226/E227/E228', () => {
    const well = index.motifs.find((m) => m.id === 'salt-well');
    expect(well, 'salt-well 线索应存在（盐井在多篇里被写到，符合收录判据）').toBeDefined();
    for (const e of [226, 227, 228]) expect(well!.echoes, `E${e} 应在 salt-well 线上`).toContain(e);
  });

  it('新场景各自进入对应线索：海上→fog-harbor，竖琴→whalebone-harp', () => {
    const byId = (id: string) => index.motifs.find((m) => m.id === id)!;
    expect(byId('fog-harbor').echoes).toContain(229);
    expect(byId('whalebone-harp').echoes).toContain(228);
    expect(byId('tide-conclave').echoes).toContain(224);
  });

  it('线索索引仍是确定性的纯函数', () => {
    const again = buildEchoThreads(BIBLE_ECHOES);
    expect(JSON.stringify(again)).toBe(JSON.stringify(index));
  });
});
