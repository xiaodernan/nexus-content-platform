/**
 * §44 衍生玩法「命运骰」：把世界已有条目重组成一张事件卡。
 *
 * 诚实边界：这是**确定性重组**，不是模型生成，也不写库——它只把作者已写的条目换一种关系摆出来，
 * 卡片里每个可指认的名词都来自这个世界。换 seed 就能再看一张，所以"无穷"来自组合而非编造。
 */
export type FateNode = { id: string; kind: string; title: string; body?: string; lore?: { memory?: string } };
export type FateCard = { title: string; body: string; sourceIds: string[]; seed: number };

const FRAMES = [
  (a: string, b: string) => `${a} 的旧痕在 ${b} 重新被人提起，两处相隔的记录忽然对上了。`,
  (a: string, b: string) => `${b} 那里传来与 ${a} 相同的声音，像同一件事在两个地方各留了一份。`,
  (a: string, b: string) => `有人在 ${a} 记下的一笔，到了 ${b} 才有人明白是什么意思。`,
  (a: string, b: string) => `${a} 的变故没有写进 ${b} 的账里，但两处的细节一模一样。`,
];

/** 确定性 LCG：同一个 seed + 同一个世界 ⇒ 同一张卡，可复现、可核对。 */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function rollFate(nodes: readonly FateNode[], seed: number): FateCard | null {
  const usable = nodes.filter((n) => (n.body || '').trim().length > 0);
  if (usable.length < 2) return null;
  const next = rng(seed);
  const i = Math.floor(next() * usable.length) % usable.length;
  let j = Math.floor(next() * (usable.length - 1));
  if (j >= i) j += 1;
  const a = usable[i]!;
  const b = usable[j]!;
  const frame = FRAMES[Math.floor(next() * FRAMES.length) % FRAMES.length]!;
  const detail = (a.lore?.memory || a.body || '').trim().slice(0, 90);
  return {
    title: `${a.title} × ${b.title}`,
    body: `${frame(a.title, b.title)} 现场留下的是：${detail}${detail.endsWith('。') ? '' : '。'}`,
    sourceIds: [a.id, b.id],
    seed: seed >>> 0,
  };
}
