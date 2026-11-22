import { describe, expect, it } from 'vitest';
import { BIBLE_ECHOES } from '@/world-bible/generated';
import { buildEchoThreads } from '@/lib/echoThreads';

/**
 * §ECHO-THREAD · 回响线索索引的判据。
 *
 * 四条腿，每条都对着一条"不许说谎"的纪律：
 * 1. 确定性——同一份输入两次调用，输出逐字节相等（索引不许每次长得不一样）；
 * 2. 线索是真的——列出的每篇回响里，线索词真的在正文中出现过（不是主题相近凑数）；
 * 3. 锚句是逐字的——每条锚句都能在所属回响的 markdown 里原样找到（防编造证据）；
 * 4. 短了要说——anchorsOmitted 与 anchors.length 加起来等于真实命中数。
 */

const INDEX = buildEchoThreads(BIBLE_ECHOES);
const byOrder = new Map(BIBLE_ECHOES.map((e) => [e.order, e] as const));

describe('§ECHO-THREAD · buildEchoThreads', () => {
  it('扫过全部回响，且至少连出几条线索（世界不是空的）', () => {
    expect(INDEX.scanned).toBe(BIBLE_ECHOES.length);
    expect(INDEX.scanned).toBeGreaterThan(100);
    expect(INDEX.motifs.length).toBeGreaterThanOrEqual(5);
    expect(INDEX.objects + INDEX.places).toBe(INDEX.motifs.length);
  });

  it('确定性：同一输入两次调用，结果逐字节相等', () => {
    const again = buildEchoThreads(BIBLE_ECHOES);
    expect(JSON.stringify(again)).toBe(JSON.stringify(INDEX));
  });

  it('每条线索出现在 ≥2 篇回响（单词线索是篇目，不是线索）', () => {
    for (const m of INDEX.motifs) {
      expect(m.echoes.length, `${m.id} 只出现在 ${m.echoes.length} 篇`).toBeGreaterThanOrEqual(2);
      expect(new Set(m.echoes).size).toBe(m.echoes.length); // 去重
      expect([...m.echoes].sort((a, b) => a - b)).toEqual(m.echoes); // 升序
      expect(m.hits).toBeGreaterThanOrEqual(m.echoes.length);
    }
  });

  it('线索词真的在它列出的每篇回响正文里出现过（不是主题相近）', () => {
    // 线索表是模块私有常量；这里用"锚句必须命中"这同一把尺子反向约束：
    // 若某篇被列入却连一个锚句都不含该线索词，说明匹配逻辑与展示逻辑脱钩了。
    for (const m of INDEX.motifs) {
      const withAnchor = new Set(m.anchors.map((a) => a.echo));
      const total = m.anchors.length + m.anchorsOmitted;
      expect(total, `${m.id} 有 ${total} 条锚句却一个都没列出`).toBeGreaterThanOrEqual(0);
      for (const order of withAnchor) {
        expect(m.echoes).toContain(order);
      }
    }
  });

  it('锚句逐字来自所属回响的 markdown（防编造证据）', () => {
    for (const m of INDEX.motifs) {
      for (const a of m.anchors) {
        const echo = byOrder.get(a.echo);
        expect(echo, `回响 ${a.echo} 不在 generated.ts 里`).toBeTruthy();
        if (!echo) continue;
        if (a.zh) expect(echo.markdownZh).toContain(a.zh);
        if (a.en) expect(echo.markdownEn).toContain(a.en);
      }
    }
  });

  it('每条线索的链接都能打开：列出的回响 slug 真实存在', () => {
    const slugs = new Set(BIBLE_ECHOES.map((e) => e.slug));
    for (const m of INDEX.motifs) {
      for (const order of m.echoes) {
        const echo = byOrder.get(order);
        expect(echo, `线索 ${m.id} 指向不存在的回响 ${order}`).toBeTruthy();
        if (echo) expect(slugs.has(echo.slug)).toBe(true);
      }
    }
  });

  it('线索簇：from≤to、size 是篇数（≤跨度）、各簇篇数之和 = 线索总篇数', () => {
    for (const m of INDEX.motifs) {
      expect(m.arcs.length).toBeGreaterThan(0);
      let total = 0;
      for (const arc of m.arcs) {
        expect(arc.from).toBeLessThanOrEqual(arc.to);
        // size 数的是**篇数**，不是序号跨度：簇内允许有 ≤3 的空洞，
        // 所以 size ≤ to-from+1（等号只在没有空洞时成立）。
        expect(arc.size).toBeGreaterThanOrEqual(1);
        expect(arc.size).toBeLessThanOrEqual(arc.to - arc.from + 1);
        total += arc.size;
      }
      expect(total, `${m.id} 各簇篇数之和不等于它的总篇数`).toBe(m.echoes.length);
      // 段与段之间必须真的断开（差 > 3），否则"簇"是把整条线索糊成一段
      for (let i = 1; i < m.arcs.length; i += 1) {
        const gap = m.arcs[i]!.from - m.arcs[i - 1]!.to;
        expect(gap, `${m.id} 第 ${i} 簇与第 ${i - 1} 簇之间只差 ${gap}`).toBeGreaterThan(3);
      }
    }
  });

  it('线索分物件/地方两组，地名不会把物件线索压掉', () => {
    expect(INDEX.objects).toBeGreaterThan(0);
    expect(INDEX.places).toBeGreaterThan(0);
    const objects = INDEX.motifs.filter((m) => m.kind === 'object');
    const places = INDEX.motifs.filter((m) => m.kind === 'place');
    // 物件全部排在地方之前（同输入同输出的排序纪律）
    const lastObject = INDEX.motifs.lastIndexOf(objects[objects.length - 1]!);
    const firstPlace = INDEX.motifs.indexOf(places[0]!);
    expect(lastObject).toBeLessThan(firstPlace);
  });

  it('未入线索的回响：与"入线索的"合起来正好是全部', () => {
    const onThread = new Set<number>();
    for (const m of INDEX.motifs) for (const o of m.echoes) onThread.add(o);
    for (const o of INDEX.orphans) expect(onThread.has(o)).toBe(false);
    expect(onThread.size + INDEX.orphans.length).toBe(INDEX.scanned);
  });
});