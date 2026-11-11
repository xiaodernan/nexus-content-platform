import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { busTag } from '../src/app/admin/discover-cache/discover-view';
import type { InvalidationBusStats } from '../src/server/domain/invalidation-bus';

/**
 * §MQ-3 / ADR-0150：结清 §MQ-2 引入的账本文案欠账（不新增 `rejected` 字段，生产出站拒绝恒 0）。
 *
 * §MQ-2（ADR-0149）让 `errors` 多了一类「**本机出站超界拒绝**」——帧根本没上线路、对端也没丢。
 * 但 `discover-view.ts` 的 `busTag` 仍在说一句**已经读反**的话：
 *   `headline='已接 · 线路有过错误'`、`detail='…丢帧的那几台会退回 TTL（15s）自愈。'`
 * 把本机拒发错误地归因为「线路」错 + 「那几台（对端）」丢帧。运维据此会去查一条没坏的线路、
 * 等一批没丢帧的对端——比"措辞未细化"更严重，是**已在说谎**。
 *
 * 另两处同源欠账（ADR-0126 §仍欠 + ADR-0149 §诚实边界明列）：
 *   - `InvalidationBusStats.errors` 注释「坏帧 / 线路错误数」没含 §MQ-2 的出站拒绝、坏回调、序列化失败；
 *   - `InvalidationBusStats.applied` 注释「消息处理回调数」与实现（§MQ-1 已收紧为"至少一个 listener
 *     成功处置才按 viewerIds.length 记一次"）读反。
 *
 * 本片只同步**注释 + 面板文案**（零字段形状变化、零 counters、零 route/discover-cache 联动），
 * 把 `errors` 明确为"含出站拒绝 / 坏帧 / 线路错误 / 坏回调"的合并总账。判据**测纯函数返回值**
 * 而非"整文件含某词"（A11Y-2 教训：注释里塞一次就假绿），且带 `errors:0` 反向支——
 * 防"文案写了出站拒绝，但 0 的时候也说成有错"这最难查的谎。
 */
const busWithErrors = (errors: number): InvalidationBusStats => ({
  published: 3,
  received: 1,
  errors,
  applied: 1,
});

const BUS_SRC = fileURLToPath(new URL('../src/server/domain/invalidation-bus.ts', import.meta.url));
const busSource = readFileSync(BUS_SRC, 'utf8');

/** 绑定声明：抠出 `InvalidationBusStats` 接口体内某个字段紧邻的 JSDoc（隔代码即空）。 */
function fieldDoc(source: string, field: string): string {
  const iface = source.indexOf('export interface InvalidationBusStats');
  if (iface < 0) return '';
  const decl = source.indexOf(`readonly ${field}:`, iface);
  if (decl < 0) return '';
  const before = source.slice(iface, decl);
  const lines = before.split('\n');
  const doc: string[] = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const t = lines[i]!.trim();
    if (t === '') continue; // 声明行前的缩进残留 / 空行，不是"隔代码"
    if (t.startsWith('*/')) { doc.push(t); continue; }
    if (t.startsWith('*')) { doc.push(t); continue; }
    if (t.startsWith('/**')) { doc.push(t); break; } // 单行 /** ... */ 或块注释起点
    break; // 紧邻的是真代码行（隔了别的声明）→ 停，doc 保持已收集部分
  }
  return doc.reverse().join('\n');
}

describe('§MQ-3 面板 bus 文案：出站拒发绝不甩锅线路与对端（先红：旧文案正在说谎）', () => {
  it('errors>0 的 headline 不再把本机出站拒发说成「线路有过错误」', () => {
    const tag = busTag(busWithErrors(2));
    expect(tag.connected).toBe(true);
    expect(tag.dot).toBe('gw-dotUnknown'); // warn 档照旧，不把错误画成绿
    // 核心：headline 不能把"本机没让帧上线路"归因为线路故障。
    expect(tag.headline).not.toContain('线路有过错误');
  });

  it('errors>0 的 detail 点名「出站拒绝」这一类，且不说成「那几台丢帧」', () => {
    const detail = busTag(busWithErrors(2)).detail;
    expect(detail).toContain('出站'); // errors 总账含 §MQ-2 的本机拒发
    expect(detail).not.toContain('那几台'); // 拒发的帧根本没上线路，没有"对端丢"这回事
    expect(detail).toContain('TTL'); // 但对端确实可能因为别的丢帧退回 TTL，边界仍要说
  });

  it('errors=0 反向支：不说成"有拒发/有错"，也不冒充"线路正常"之外的谎', () => {
    const tag = busTag(busWithErrors(0));
    expect(tag.dot).toBe('gw-dotUp');
    expect(tag.headline).toContain('正常');
    expect(tag.detail).toContain('最终一致'); // 已接也绝不承诺瞬时强一致
    // 反向防假绿：0 的时候绝不能叙述"拒过/丢过"任何一次（"拒发/拒绝/丢帧"任一措辞都不许），
    // 且必须明说 0 是"还没发生"——否则"拒发过 0 帧"这种把 0 叙述成一次观测的谎会漏过。
    expect(tag.detail).not.toMatch(/拒|丢过|报过错.*实际/);
    expect(tag.detail).toMatch(/还没发生|还没/);
  });

  it('errors>0 仍处 warn 档、仍带 TTL 自愈边界（复用 §MQ-1 已有诚实护栏，零回归）', () => {
    const tag = busTag(busWithErrors(1));
    expect(tag.connected).toBe(true);
    expect(tag.dot).toBe('gw-dotUnknown');
    expect(tag.detail).not.toContain('线路正常');
    expect(tag.detail).toContain('TTL');
  });
});

describe('§MQ-3 账本字段注释绑定声明（errors 总账 / applied 与实现一致）', () => {
  it('errors 注释纳入「出站拒绝」，不再只说坏帧/线路错误（绑定字段紧邻 JSDoc，非整文件含词）', () => {
    const doc = fieldDoc(busSource, 'errors');
    expect(doc).not.toBe('');
    expect(doc).toContain('出站');
    expect(doc).toContain('线路');
  });

  it('applied 注释与 §MQ-1 收紧后的实现一致，不再说「消息处理回调数」', () => {
    const doc = fieldDoc(busSource, 'applied');
    expect(doc).not.toBe('');
    expect(doc).not.toContain('消息处理回调数'); // 旧注释与实现读反，ADR-0126 §仍欠
    expect(doc).toMatch(/viewerIds|处置|listener|成功/); // 与"至少一次成功处置才按 viewerIds.length 记"一致
  });
});
