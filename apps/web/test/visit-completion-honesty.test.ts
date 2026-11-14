import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyticsCsv, dailySeries, dayWindow, totalsOf, type VisitDayRow } from '../src/server/domain/analytics';

/**
 * §DATA-1 完成度口径**诚实读数 / 透明**的判据（零浏览器、零真库、零时钟）。
 *
 * === 先量再治：这一片被真测试证伪过一次，方向因此掉头 ===
 * 初判 `analytics.ts` 里 `completionPct > 0` 是把 0% 访客丢掉的缺陷。真库集成测
 * `analytics.integration.test.ts:192` 写死了相反的产品语义：
 *   "第三个人一行心跳都没留下（0%），他不该把平均值拉低、也不该被算进 over"
 *   ⇒ `expect(analytics.completion).toEqual({ avgPct: 60, over: 2 })`。
 * 所以 **`>0` 是刻意语义，本片一律不动算法**。真缺陷是口径被写反了：
 *   1. `over` 数的是「滚过 0% 的 人×天 行数」，不是去重人数；作品表却写 `/ N 人`、
 *      窗口卡写 `N 条上报`，都会被读成"人数"或"每次心跳上报数"。
 *   2. `VisitTotals.completionOver` 注释"上面那个平均是几行算出来的"、以及
 *      `AnalyticsNumbers.completion` 的"几个访客聚合出来的"，都没讲 `>0` 与 0% 排除。
 *   3. `DEFINITIONS` 的完成度说明点明了"比视口短=100%"，却没点明"打开即走的 0% 不计入"。
 * CSV 表头 `达标的访客` 也暗示人数 ⇒ 这一片把它改成自带口径的 `滚过0%的人·天行数`
 * （CSV 是**下载给人看的**表面，代码旁注救不了在 Excel 里打开它的人），并另立一条
 * **行为门**直接调用 `analyticsCsv([])` 验真实吐出的表头，而不只判源码字符串。
 *
 * === 两道门，一绿一红，缺一不可 ===
 * - **不变量门（本就绿，零回归对照）**：把纯聚合函数导出后，合成 `VisitDayRow[]` 直接喂进去，
 *   钉死刻意语义（0% 不进分母 / over 只数 >0 / 全 0% 是 null 不是 0 / 按行加权 /
 *   over 是人×天行数而非去重人数 / 爬虫不进完成度）。它现在就该绿——它的作用是**防止
 *   将来有人"顺手"把 0% 纳入分母**，把产品语义改掉而无人察觉。
 * - **措辞门（先红，改完转绿）**：动态定位两个源文件里**恰好那几处**口径声明（字段注释、
 *   两处 UI 插值、DEFINITIONS 完成度条、CSV 列注、算法里的 filter），要求诚实措辞到位、
 *   误导措辞消失、且 `>0` 过滤一个不少。绑定声明而非"整个文件含某词"，堵住"在别处
 *   补一句诚实话就算过"的假绿。
 *
 * === 门自身验电（假片段）===
 * 同一套谓词喂假字符串：旧注释 / 只提 >0 不提 0% 排除 / 裸 `N 人` / 隔行代码冒充紧邻注释，
 * 都必须判红；诚实写法才判绿。验电红 = 门没牙，先修门再修生产。
 *
 * 诚实边界（不伪装）：本片只守"数字旁的话说的是不是真话"，不重测聚合算术本身
 * （那是 `analytics-trend.integration.test.ts` 真库那一寸的事），也不碰算法一个字符。
 */
const ROOT = process.cwd();
const DOMAIN = readFileSync(join(ROOT, 'apps/web/src/server/domain/analytics.ts'), 'utf8');
const PAGE = readFileSync(join(ROOT, 'apps/web/src/app/analytics/page.tsx'), 'utf8');

/** 诚实口径三要素：>0 过滤、0% 排除、人·天 单位，缺一不可。 */
const FILTER_RE = /(?:>\s*0|大于\s*0|滚过\s*0\s*%|超过\s*0|非零)/i;
const EXCLUDE_RE = /(?:不计入|不算进|不计|排除|不含|剔除|不拉低|不参与|打开即走|一秒都没|没留下|没滚|0\s*%\s*的|全是\s*0\s*%)/;
const UNIT_RE = /(?:人·天|人天|人\s*×\s*天)/;

/** 显示层把「N 人·天行数」写成裸「N 人」——紧跟 `}` 一个「人」且后面不是「·」。 */
const BARE_PERSON_RE = /(?:\bover|completionOver)\s*\}\s*人(?![·•])/;

interface Caliber {
  filter: boolean;
  exclude: boolean;
  unit: boolean;
}

function caliberOf(text: string): Caliber {
  return { filter: FILTER_RE.test(text), exclude: EXCLUDE_RE.test(text), unit: UNIT_RE.test(text) };
}

function isHonest(text: string): boolean {
  const c = caliberOf(text);
  return c.filter && c.exclude && c.unit;
}

/** 取 `name` 接口的体内文本；按花括号深度配平，内联对象类型不截断。 */
function interfaceBody(src: string, name: string): string {
  const at = src.search(new RegExp(`interface\\s+${name}\\s*\\{`));
  if (at < 0) return '';
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return '';
}

/**
 * 取字段声明**紧邻**的块注释（斜杠星号块，注释定界符故意不写在本文里，免得提前闭合）。
 * 声明与注释之间只允许空白；隔了一行代码就返回空——防"别处的诚实话被当成本字段口径"。
 */
function jsdocBefore(src: string, fieldDecl: string): string {
  const at = src.indexOf(fieldDecl);
  if (at < 0) return '';
  const before = src.slice(0, at);
  const OPEN = String.fromCharCode(47, 42, 42);
  const CLOSE = String.fromCharCode(42, 47);
  const close = before.lastIndexOf(CLOSE);
  if (close < 0) return '';
  const open = before.lastIndexOf(OPEN, close);
  if (open < 0) return '';
  if (/\S/.test(before.slice(close + 2))) return '';
  return before.slice(open, close + 2);
}

/** 取 `at` 行上方**连续**的行注释（斜杠斜杠），用于 CSV 列旁那一段口径注。 */
function lineCommentsBefore(src: string, at: number): string {
  const lines = src.slice(0, at).split('\n');
  const out: string[] = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const t = lines[i]!.trim();
    if (t.startsWith('//')) out.unshift(t);
    else if (t === '') {
      if (out.length) break;
    } else break;
  }
  return out.join('\n');
}

/** 在 `DEFINITIONS` 里按 label 取那一条的 meaning 字符串。 */
function definitionMeaning(page: string, label: string): string {
  const at = page.indexOf(`label: '${label}'`);
  if (at < 0) return '';
  const tail = page.slice(at, at + 2000);
  const m = /meaning:\s*(['"])([\s\S]*?)\1\s*[,}]/.exec(tail);
  return m ? m[2]! : '';
}

const visitTotalsBody = interfaceBody(DOMAIN, 'VisitTotals');
const dailyPointBody = interfaceBody(DOMAIN, 'DailyPoint');
const analyticsNumbersBody = interfaceBody(DOMAIN, 'AnalyticsNumbers');

// ============================================================================
// 门一：纯内存不变量（本就绿——零回归对照，钉死刻意 >0 语义）
// ============================================================================
const KEY = (n: number) => `${n}`.padStart(2, '0').repeat(16);
function row(over: Partial<VisitDayRow> = {}): VisitDayRow {
  return {
    day: '2026-05-10',
    visitorKey: KEY(1),
    opens: 1,
    visibleMs: 1000,
    completionPct: 0,
    suspectedBot: false,
    ...over,
  };
}

describe('§DATA-1 完成度口径不变量（纯内存，零回归对照，本就绿）', () => {
  it('0% 行不进分母、也不把平均拉低：100/20/20/20 + 一个 0 ⇒ 40 而 over=4（不是 32/5）', () => {
    const rows = [
      row({ visitorKey: KEY(1), completionPct: 100 }),
      row({ visitorKey: KEY(2), completionPct: 20 }),
      row({ visitorKey: KEY(3), completionPct: 20 }),
      row({ visitorKey: KEY(4), completionPct: 20 }),
      row({ visitorKey: KEY(5), completionPct: 0, visibleMs: 0 }),
    ];
    // 用 recordVisit 的口径：0% 的人确实来过（visitors 该数他），但不参与完成度
    const t = totalsOf(rows);
    expect(t.completionPct).toBe(40);
    expect(t.completionOver).toBe(4);
    expect(t.completionPct).not.toBe(32); // 若把 0 纳入分母就是 (100+20+20+20+0)/5=32
    expect(t.visitors).toBe(5); // "来过"与"滚过"是两件事
  });

  it('全是 0% 时 completionPct 是 null 不是 0，但时长/访客照报（null ≠ 0 的诚实边界）', () => {
    const t = totalsOf([
      row({ visitorKey: KEY(1), completionPct: 0, visibleMs: 0 }),
      row({ visitorKey: KEY(2), completionPct: 0, visibleMs: 0 }),
    ]);
    expect(t.completionPct).toBeNull();
    expect(t.completionOver).toBe(0);
    expect(t.visitors).toBe(2);
    expect(t.playTimeMs).toBe(0); // "来了但没攒够"是 0，不是"没采到"
  });

  it('按行加权，不是"每天先平均再平均"：一天 100、另一天 20/20/20 ⇒ 40 不是 60', () => {
    const rows = [
      row({ day: '2026-05-09', visitorKey: KEY(1), completionPct: 100 }),
      row({ day: '2026-05-10', visitorKey: KEY(2), completionPct: 20 }),
      row({ day: '2026-05-10', visitorKey: KEY(3), completionPct: 20 }),
      row({ day: '2026-05-10', visitorKey: KEY(4), completionPct: 20 }),
    ];
    const t = totalsOf(rows);
    expect(t.completionPct).toBe(40); // (100+20+20+20)/4
    expect(t.completionPct).not.toBe(60); // (100+20)/2 是错的那个
    expect(t.completionOver).toBe(4);
  });

  it('over 是「人×天行数」不是去重人数：同一人两天都滚过 ⇒ over=2 而 visitors=1', () => {
    // 这一条正是措辞门要把 "/ N 人" 改成 "/ N 人·天" 的可执行证据
    const sameKey = KEY(7);
    const t = totalsOf([
      row({ day: '2026-05-09', visitorKey: sameKey, completionPct: 50 }),
      row({ day: '2026-05-10', visitorKey: sameKey, completionPct: 50 }),
    ]);
    expect(t.visitors).toBe(1);
    expect(t.completionOver).toBe(2);
    expect(t.completionPct).toBe(50);
  });

  it('爬虫的 >0 行不进完成度分母，只另计 botOpens', () => {
    const t = totalsOf([
      row({ visitorKey: KEY(1), completionPct: 60 }),
      row({ visitorKey: KEY(2), completionPct: 100, suspectedBot: true, opens: 3 }),
    ]);
    expect(t.completionPct).toBe(60);
    expect(t.completionOver).toBe(1);
    expect(t.visitors).toBe(1);
    expect(t.botOpens).toBe(3);
  });

  it('dailySeries 同一口径：某天 100/0/0 ⇒ 100（0 不拉低）；某天全 0 ⇒ null 不是 0，但时长照报', () => {
    const window = dayWindow('2026-05-11', 2); // 2026-05-10 .. 2026-05-11
    const days = dailySeries(
      [
        row({ day: '2026-05-10', visitorKey: KEY(1), completionPct: 100 }),
        row({ day: '2026-05-10', visitorKey: KEY(2), completionPct: 0 }),
        row({ day: '2026-05-10', visitorKey: KEY(3), completionPct: 0 }),
        row({ day: '2026-05-11', visitorKey: KEY(4), completionPct: 0, visibleMs: 0 }),
      ],
      window,
    );
    expect(days).toHaveLength(2); // 日期密集
    expect(days[0]!.completionPct).toBe(100);
    expect(days[1]!.completionPct).toBeNull();
    expect(days[1]!.playTimeMs).toBe(0); // 来过、没滚，时长是 0 不是 null
    expect(days[1]!.visitors).toBe(1);
  });

  it('缺的那天补齐成 0：completionPct 是 null、playTimeMs 也是 null（真的没有行）', () => {
    const window = dayWindow('2026-05-12', 3); // 2026-05-10 .. 2026-05-12
    const days = dailySeries([row({ day: '2026-05-10', completionPct: 50 })], window);
    expect(days.map((d) => d.day)).toEqual(['2026-05-10', '2026-05-11', '2026-05-12']);
    expect(days[1]).toMatchObject({ opens: 0, visitors: 0, playTimeMs: null, completionPct: null });
  });

  it('空窗口：totalsOf([]) 每项 0 / null，completionOver=0', () => {
    expect(totalsOf([])).toEqual({
      opens: 0,
      visitors: 0,
      playTimeMs: null,
      completionPct: null,
      completionOver: 0,
      activeDays: 0,
      botOpens: 0,
    });
  });
});

// ============================================================================
// 门二：口径措辞（先红，改完转绿）——绑定声明，别处补话不算过
// ============================================================================
describe('§DATA-1 完成度口径措辞（静态门）', () => {
  it('算法 >0 过滤一个不少（措辞可以改，语义不许动）', () => {
    const sqlAndCode = (DOMAIN.match(/completionPct\s*\}?\s*>\s*0/g) ?? []).length;
    expect(sqlAndCode, 'rollupVisits 两条 SQL + totalsOf + dailySeries 共 4 处 >0 过滤').toBeGreaterThanOrEqual(4);
    const completedDefs = (
      DOMAIN.match(/const completed\s*=\s*\w+\.filter\(\(row\)\s*=>\s*row\.completionPct\s*>\s*0\)/g) ?? []
    ).length;
    expect(completedDefs, 'totalsOf / dailySeries 的 >0 过滤被改动了').toBe(2);
    expect(DOMAIN, '不许把 >0 放宽成 >=0（那会把打开即走的人拉进分母）').not.toMatch(/completionPct\s*\}?\s*>=\s*0/);
  });

  it('三个误导措辞从 analytics.ts 消失', () => {
    for (const bad of ['几行算出来的', '是几个访客聚合出来的', '那些行的平均值']) {
      expect(DOMAIN, `analytics.ts 又出现会被读反的措辞：${bad}`).not.toContain(bad);
    }
  });

  it('VisitTotals.completionOver 注释钉住 >0 排除 + 人·天 单位', () => {
    const doc = jsdocBefore(visitTotalsBody, 'completionOver: number;');
    expect(doc, 'VisitTotals.completionOver 没有紧邻的字段注释').not.toBe('');
    expect(isHonest(doc), `completionOver 注释没讲全口径（>0 + 0% 排除 + 人·天）：\n${doc}`).toBe(true);
  });

  it('VisitTotals.completionPct 注释钉住 >0 排除 + 人·天 单位', () => {
    const doc = jsdocBefore(visitTotalsBody, 'completionPct: number | null;');
    expect(doc, 'VisitTotals.completionPct 没有紧邻的字段注释').not.toBe('');
    expect(isHonest(doc), `completionPct 注释没讲全口径：\n${doc}`).toBe(true);
  });

  it('AnalyticsNumbers.completion 注释讲清 over 是 人·天 行数、0% 不计入', () => {
    const doc = jsdocBefore(analyticsNumbersBody, 'completion: {');
    expect(doc, 'AnalyticsNumbers.completion 没有紧邻的字段注释').not.toBe('');
    expect(isHonest(doc), `completion 注释没讲全口径：\n${doc}`).toBe(true);
  });

  it('DailyPoint.completionPct 注释点明"当天全 0% 是 null 不是 0"', () => {
    const doc = jsdocBefore(dailyPointBody, 'completionPct: number | null;');
    expect(doc, 'DailyPoint.completionPct 没有紧邻的字段注释').not.toBe('');
    expect(isHonest(doc), `DailyPoint.completionPct 注释没讲全口径：\n${doc}`).toBe(true);
  });

  it('CSV 表头自带口径：不再是「达标的访客」，而是「滚过0%的人·天行数」', () => {
    const OVER_LABEL = '滚过0%的人·天行数';
    const at = DOMAIN.indexOf(`{ label: '${OVER_LABEL}'`);
    expect(at, `取 completion.over 的那列没改成诚实表头「${OVER_LABEL}」`).toBeGreaterThan(0);
    expect(DOMAIN, '旧表头「达标的访客」还在——它把 人·天行数 冒充去重人数').not.toContain("'达标的访客'");
    // 表头自身带 >0 过滤 + 人·天 单位：CSV 是下载给人看的，代码旁注救不了 Excel 里那一行
    const c = caliberOf(OVER_LABEL);
    expect(c.filter && c.unit, `表头自身要说清 >0 过滤与人·天单位：${OVER_LABEL}`).toBe(true);
    // 列旁再补完整三要素口径注，给维护者
    const note = lineCommentsBefore(DOMAIN, at);
    expect(isHonest(note), `CSV 列旁缺完整口径注（>0 + 0% 排除 + 人·天）：\n${note}`).toBe(true);
  });

  it('行为门：analyticsCsv([]) 真实吐出的表头自带诚实口径，不含旧表头', () => {
    const header = analyticsCsv([]).split('\r\n')[0]!;
    expect(header, '真实 CSV 表头里没有「滚过0%的人·天行数」').toContain('滚过0%的人·天行数');
    expect(header, '真实 CSV 表头里还留着「达标的访客」').not.toContain('达标的访客');
    const cell = header.split(',').find((x) => x.includes('人·天'))!;
    const c = caliberOf(cell);
    expect(c.filter && c.unit, `真实表头那格没带 >0 过滤与人·天单位：${cell}`).toBe(true);
  });

  it('作品表与窗口卡都不再写裸「N 人」，插值旁必须带 人·天 单位', () => {
    const bare = PAGE.match(new RegExp(BARE_PERSON_RE.source, 'g'));
    expect(bare, `这些地方把「人·天行数」写成了裸「N 人」：${(bare ?? []).join(' | ')}`).toBeNull();
    const overTokens = [...PAGE.matchAll(/(?:completionOver|completion\.over)\s*\}/g)];
    expect(overTokens.length, '作品表 / 窗口卡两处完成度 over 插值都应还在').toBeGreaterThanOrEqual(2);
    for (const [i, m] of overTokens.entries()) {
      const ctx = PAGE.slice(Math.max(0, m.index - 90), m.index + 90);
      expect(UNIT_RE.test(ctx), `第 ${i + 1} 处 over 插值旁没写诚实单位「人·天」：\n${ctx}`).toBe(true);
    }
  });

  it('窗口卡不再写「N 条上报」，而是把 0% 排除说在数字旁', () => {
    expect(PAGE, '窗口卡还在把人·天行数写成「条上报」').not.toContain('条上报');
    const at = PAGE.indexOf('data-analytics-window="completion"');
    expect(at, '窗口卡 completion 那个读数不在了').toBeGreaterThan(0);
    const liStart = PAGE.lastIndexOf('<li>', at);
    const liEnd = PAGE.indexOf('</li>', at);
    expect(liStart).toBeGreaterThanOrEqual(0);
    expect(liEnd).toBeGreaterThan(at);
    const li = PAGE.slice(liStart, liEnd);
    expect(isHonest(li), `窗口卡 completion 读数旁没说全口径（>0 + 0% 排除 + 人·天）：\n${li}`).toBe(true);
  });

  it('DEFINITIONS 完成度条点明"打开即走的 0% 不计入"与 人·天 单位', () => {
    const meaning = definitionMeaning(PAGE, '完成度');
    expect(meaning, 'DEFINITIONS 里找不到「完成度」条').not.toBe('');
    expect(isHonest(meaning), `DEFINITIONS 完成度说明没讲全口径：\n${meaning}`).toBe(true);
  });
});

// ============================================================================
// 门自身验电：同一套谓词喂假片段——该红的必须红，该绿的才绿
// ============================================================================
describe('§DATA-1 判据自身验电（假片段，防假红/假绿）', () => {
  it('旧「几行算出来的」注释判红', () => {
    expect(isHonest('/** 上面那个平均是几行算出来的 */')).toBe(false);
  });

  it('只提 >0 却不讲 0% 排除的注释仍判红（exclude 不可省）', () => {
    expect(isHonest('/** 只统计 completionPct > 0 的真人·天行 */')).toBe(false);
  });

  it('只讲 0% 排除却漏了 >0 过滤的注释仍判红（filter 不可省）', () => {
    expect(isHonest('/** 打开即走的不计入，按人·天算 */')).toBe(false);
  });

  it('三要素齐全的诚实注释判绿', () => {
    expect(isHonest('/** 滚过 0% 的真人·天行，打开即走的 0% 不计入 */')).toBe(true);
  });

  it('裸「N 人」显示判红，「N 人·天」放行', () => {
    // 用 String.fromCharCode 拼花括号，避免本文件里出现 JSX 插值被工具链误解析
    const ob = String.fromCharCode(123);
    const cb = String.fromCharCode(125);
    const bare = `/ ${ob}analytics.completion.over${cb} 人${String.fromCharCode(60)}/span${String.fromCharCode(62)}`;
    const honest = `/ ${ob}analytics.completion.over${cb} 人·天${String.fromCharCode(60)}/span${String.fromCharCode(62)}`;
    expect(bare.match(BARE_PERSON_RE), `裸「N 人」应判红，实际串：${bare}`).not.toBeNull();
    expect(honest.match(BARE_PERSON_RE), `「N 人·天」应放行，实际串：${honest}`).toBeNull();
  });

  it('jsdocBefore 不把上一段无关注释误认成字段注释（假绿防护）', () => {
    const fake =
      '/** 无关说明 */\n\nconst x = 1;\n\n/** 滚过 0% 的真人·天行，打开即走的 0% 不计入 */\ncompletionOver: number;';
    const got = jsdocBefore(fake, 'completionOver: number;');
    expect(got).toContain('真人·天');
    expect(got).not.toContain('无关说明');
  });

  it('字段与注释之间隔了代码就返回空（防别处诚实话冒充本字段口径）', () => {
    const fake = '/** 滚过 0% 的真人·天行，打开即走的 0% 不计入 */\nconst unrelated = 1;\ncompletionOver: number;';
    expect(jsdocBefore(fake, 'completionOver: number;')).toBe('');
  });

  it('interfaceBody 花括号配平：内联对象类型不截断接口体', () => {
    const fake =
      'interface A { x: number; }\ninterface B { completion: { avgPct: number; over: number } | null; completionOver: number; }';
    const b = interfaceBody(fake, 'B');
    expect(b).toContain('completionOver');
    expect(b).toContain('avgPct');
    expect(b).not.toContain('interface A');
  });

  it('lineCommentsBefore 只收紧邻的连续行注释，隔一行代码就断', () => {
    const a = '// 滚过 0% 的真人·天行\n// 打开即走的 0% 不计入\n{ label: x }';
    expect(lineCommentsBefore(a, a.indexOf('{ label'))).toContain('不计入');
    const b = '// 滚过 0% 的真人·天行，打开即走的 0% 不计入\nconst y = 1;\n{ label: x }';
    expect(lineCommentsBefore(b, b.indexOf('{ label'))).toBe('');
  });
});
