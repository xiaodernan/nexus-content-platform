import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §GATE-2 判据本身的卫生门——**守护判据的判据**。
 *
 * 来由不是"想写个新门"，是一次真实的 33 分钟停机：
 *
 * `not-found-visual-style.test.ts` 里有一段取 CSS 段的代码写成
 *
 *     for (let m = /\.nf-/g.exec(globals); m; m = /\.nf-/g.exec(globals)) { … }
 *
 * 每轮（初始化与更新）都新建正则字面量 → `lastIndex` 每轮回到 0 → `exec` 永远返回
 * 同一个首个匹配。首个 `.nf-` 落在注释里的那天，循环再也出不来，
 * 96 套视觉判据在 **collect 阶段**全部挂死，`verify:fe-gates` 跑 33 分钟没输出一行。
 *
 * 关键点：**没有一条判据变红**。所有测试文件本身"通过"，只是永远跑不完。
 * 这类故障对"测试全绿"这套语言完全不可见——它不产生失败，它取消失败的可能。
 *
 * 所以这里守的不是某个页面的样式，而是**判据代码自身的形状**：
 * 凡是依赖 `lastIndex` 的 `g` 正则，就只许有一个实例。
 *
 * 反例之所以危险，是因为它写起来"更短"：`for (let m = /x/g.exec(s); m; m = /x/g.exec(s))`
 * 比"先 `new RegExp` 到外面 + `while ((m = re.exec(s)))`"少一行，而且在**首个匹配
 * 不在注释里**时行为完全正确。它只在数据变化时爆炸，而数据会变。
 */

const ROOT = process.cwd();
const TEST_DIR = join(ROOT, 'apps/web/test');

/**
 * 匹配「在 for 的初始化或更新段里现场构造 `g` 正则并 `.exec()`」。
 *
 * 允许换行与任意空白：这东西被 prettier 折行后仍然违规。
 * `y`（sticky）同族——它也吃 `lastIndex`，同样的自我重置会同样卡死。
 */
const SELF_RESETTING_EXEC = /for\s*\([^)]*(?:=\s*\/[^/\n]+\/[a-z]*[gy]\.exec\s*\(|=\s*new\s+RegExp\([^)]*\)\.exec\s*\()[^)]*\)/;

/** 单例正则 + while exec 的正规写法（用来证明扫描器不会误报好东西）。 */
const GOOD_SAMPLE = `
  const re = /\\.nf-/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(globals))) { if (!inComment(m.index)) return m.index; }
`;

/** 已知坏样本：形状与事故现场一致（含折行）。 */
const BAD_SAMPLE = `
  for (let m = /\\.nf-/g.exec(globals) as RegExpExecArray | null;
       m;
       m = /\\.nf-/g.exec(globals)) {
    return m.index;
  }
`;

function visualStyleFiles(): string[] {
  return readdirSync(TEST_DIR)
    .filter((name) => /-visual-style\.test\.ts$/.test(name))
    .map((name) => join(TEST_DIR, name));
}

/**
 * 剥掉注释再扫。
 *
 * 本项目有一条反复出现的纪律："注释不得喂绿任何一道门"。它的镜像同样成立：
 * **注释也不得喂红任何一道门**。not-found 的修复注释里必须引用那段旧代码才说得清
 * 事故原貌；如果扫描器把引用当违规，下一个想记录教训的人就只能不写。
 *
 * 行注释用 `(^|[^:])` 保护 `http://` 这类字符串——被削掉的是漏报方向，
 * 而这道门只抓「for 头里反复构造 g 正则」这一种形状，漏报风险可接受；
 * 反方向（把注释当代码）会直接让人写不了注释，代价更大。
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('§GATE-2 判据卫生门', () => {
  it('扫描器自检：已知坏样本必须被判违规（否则这道门永远绿，等于没写）', () => {
    expect(SELF_RESETTING_EXEC.test(BAD_SAMPLE)).toBe(true);
  });

  it('扫描器自检：单例正则 + while exec 的好写法不许误报', () => {
    expect(SELF_RESETTING_EXEC.test(GOOD_SAMPLE)).toBe(false);
  });

  it('扫描器自检：单行紧凑写法（事故原始形态）必须被判违规', () => {
    expect(SELF_RESETTING_EXEC.test('for (let m = /x/g.exec(s); m; m = /x/g.exec(s)) {}')).toBe(true);
  });

  it('扫描器自检：sticky(y) 同族同样违规——它也吃 lastIndex', () => {
    expect(SELF_RESETTING_EXEC.test('for (let m = /x/y.exec(s); m; m = /x/y.exec(s)) {}')).toBe(true);
  });

  it('整个仓库的视觉判据里零自我重置正则循环', () => {
    const offenders: string[] = [];
    for (const file of visualStyleFiles()) {
      const src = stripComments(readFileSync(file, 'utf8'));
      if (SELF_RESETTING_EXEC.test(src)) offenders.push(file.slice(ROOT.length + 1).replace(/\\/g, '/'));
    }
    // 报出全部违规文件而不是第一个——一次修完，不用跑 N 轮。
    expect(offenders).toEqual([]);
  });

  it('注释既不喂绿也不喂红：注释里的旧代码不算违规，剥注释前的原文确实含它', () => {
    const raw = readFileSync(join(TEST_DIR, 'not-found-visual-style.test.ts'), 'utf8');
    // 事故原貌必须留在注释里（教训要能读）——所以剥之前的原文**含**这段
    expect(raw).toContain('m = /\\.nf-/g.exec(globals)');
    // 但剥之后必须干净，否则说明它跑到代码里去了
    expect(SELF_RESETTING_EXEC.test(stripComments(raw))).toBe(false);
  });

  it('样本量兜底：这道门至少看住了 90 套判据（防止 glob 写错后空跑变绿）', () => {
    expect(visualStyleFiles().length).toBeGreaterThanOrEqual(90);
  });

  it('not-found 的修复结构在位：注释区间只算一次，靠 indexOf 正扫而不是靠重新 exec', () => {
    const src = readFileSync(join(TEST_DIR, 'not-found-visual-style.test.ts'), 'utf8');
    const body = stripComments(src);
    // 区间只算一次
    expect(body).toContain('const commentSpans = [...globals.matchAll');
    // 正扫用 indexOf 递进，第二个参数保证前进
    expect(body).toContain("globals.indexOf('.nf-', at + 1)");
    // 二分判定（落两区间之间的正确写法）
    expect(body).toContain('commentSpans[mid]![0] <= at');
    // 事故形态不许复活（只看代码，不看注释里的引用）
    expect(SELF_RESETTING_EXEC.test(body)).toBe(false);
  });
});
