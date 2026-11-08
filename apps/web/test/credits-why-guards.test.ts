/**
 * 额度页每一格那句解释「说的是哪道门、拦在哪条边界」的来源门（§SEC 第四十三片）。
 *
 * 起点是第四十二片自己记下的「仍欠 ①」：那一片把页面那句话收成了 `ENFORCED_PLAN_AXE_WHY`，
 * 于是**件数、名单、解释**同源了——但句子说的**内容**仍然没有读者。每一格的解释都在声称一件行为
 * （"额度为 0 时挡下""pending 邀请占名额"），行为的真值在那道拦截方里；门改了口径，句子不会跟着改口。
 *
 * 这一片把地址写进表里（`ENFORCED_PLAN_AXE_GUARDS`：module + guard + why），门按地址真的去取函数、
 * 在句子声称的那条边界上问一次。第一遍跑就量到三句与门不符——
 * 见 `docs/adr/0090-plan-axis-explanations-name-their-guard.md`，改的是句子，不是判据。
 *
 * 三条纪律：
 * - **地址要能解析**：表里的 `module` + `guard` 字符串拿去命名空间里查，查不到就是红（改了名、删了导出、
 *   或者句子说的是另一道门——都红）；
 * - **边界由生产常量派生**：档位上限、单次点数都从 `PLAN_LIMITS` / `GENERATION_COST` 现读，
 *   用例里不抄数字；句子里那几个点数反过来与常量对照；
 * - **被点名的门必须真的装在链上**：只导出、没人调用的门不算拦截方（§SEC 第四十一片同一条口径）。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as creditLedgerModule from '../src/server/domain/credit-ledger';
import * as creditsModule from '../src/server/domain/credits';
import {
  ENFORCED_PLAN_AXES,
  ENFORCED_PLAN_AXE_GUARDS,
  GENERATION_COST,
  PLAN_KEYS,
  concurrentPublishLimit,
  planEnforcementReadout,
  refusalFor,
  storageLimitBytes,
  teamMemberLimit,
  type EnforcedPlanAxis,
} from '../src/server/domain/credits';
import { describe, expect, it } from 'vitest';

const WEB_SRC = join(import.meta.dirname, '..', 'src');

/** 表里 `module` 那两个字符串能查到的命名空间；新增一个模块名要在这里登记，否则红话会说出来 */
const NAMESPACES: Record<string, Record<string, unknown>> = {
  credits: creditsModule as unknown as Record<string, unknown>,
  'credit-ledger': creditLedgerModule as unknown as Record<string, unknown>,
};

/** 只在 `src` 里数调用点：测试文件里的 import 不算"产品装了这道门" */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return name.endsWith('.ts') || name.endsWith('.tsx') ? [p] : [];
  });
}

const SRC = sourceFiles(WEB_SRC);

/** `refusalFor(` 不会咬住 `refusalForStorage(`：名字后面直接跟字母时 `\b` 与 `(` 都对不上 */
function callersOf(guard: string): string[] {
  const re = new RegExp(`\\b${guard}\\s*\\(`);
  return SRC.filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) => relative(WEB_SRC, f).split('\\').join('/'));
}

/**
 * 边界腿一律用**表里那个地址解析出来的函数**，不拿 import 的那几个名字。
 *
 * 差别只有一处但很值钱：直接 import 的写法测的是"测试自己抄的那道门"，
 * 把 publishing 与 teamCollaboration 的 `guard` 名字对调，两条边界腿照样绿——
 * 而页面上那两句话已经换错了对象。走表，对调就撞在错误的上限上。
 */
function guardFromTable(axis: EnforcedPlanAxis): (check: Record<string, unknown>) => string | null {
  const entry = ENFORCED_PLAN_AXE_GUARDS[axis] as { module: string; guard: string };
  const fn = NAMESPACES[entry.module]?.[entry.guard];
  if (typeof fn !== 'function') throw new Error(`${axis} 的 ${entry.module}.${entry.guard} 不是函数（解析那条腿会说）`);
  return fn as (check: Record<string, unknown>) => string | null;
}

/** 某个 export function 在源文件里的那一段（切到下一个顶层 export 为止） */
function functionSource(relPath: string, name: string): string {
  const text = readFileSync(join(WEB_SRC, ...relPath.split('/')), 'utf8').replace(/\r\n/g, '\n');
  const hit = new RegExp(`^export (?:async )?function ${name}\\s*\\(`, 'm').exec(text);
  if (!hit) return '';
  const rest = text.slice(hit.index + 1);
  const next = /^export /m.exec(rest);
  return rest.slice(0, next ? next.index : rest.length);
}

/**
 * 表里那个地址对应的那段**源码**：`module` 推出文件，`guard` 推出那个 export function 的整段。
 *
 * 为什么读文件而不是 `fn.toString()`：vitest 交付前会把模块转成
 * `(0,__vite_ssr_import_3__.refusalFor)({ kind, cost: __vite_ssr_import_3__.GENERATION_COST[kind] …`，
 * 那是测试运行器的产物、不是带出去的那份代码——按它断言等于把运行时形状写进合同。
 */
function guardDefinition(axis: EnforcedPlanAxis): string {
  const { module, guard } = ENFORCED_PLAN_AXE_GUARDS[axis] as { module: string; guard: string };
  return functionSource(`server/domain/${module}.ts`, guard);
}

describe('拦截方名册：表里点名的每一道门都真的存在', () => {
  it('扫描的人口不是空的（名册腿在空集合上会假绿）', () => {
    expect(SRC.length, `${WEB_SRC} 下一个 .ts/.tsx 都没扫到，调用点那条腿作废`).toBeGreaterThanOrEqual(200);
  });

  it('名册与已生效那一列一格不多一格不少，且今天就是五格', () => {
    expect(Object.keys(ENFORCED_PLAN_AXE_GUARDS).sort()).toEqual([...ENFORCED_PLAN_AXES].sort());
    expect(ENFORCED_PLAN_AXES.length).toBe(5);
  });

  it('每个 module + guard 都能真的解析出一个函数（改名、删导出、说错模块都红）', () => {
    for (const axis of ENFORCED_PLAN_AXES) {
      const entry = ENFORCED_PLAN_AXE_GUARDS[axis] as { module: string; guard: string };
      const ns = NAMESPACES[entry.module];
      expect(ns, `${axis} 的拦截方写在没登记的模块 ${entry.module} 里`).toBeTruthy();
      const fn = ns?.[entry.guard];
      expect(
        typeof fn,
        `${axis} 的解释说拦截方是 ${entry.module}.${entry.guard}，那个模块里没有这个函数——句子说的是另一道门`,
      ).toBe('function');
    }
  });

  it('被点名的门都真有调用点，不是只导出的死函数（定义所在那个文件不算调用方）', () => {
    for (const axis of ENFORCED_PLAN_AXES) {
      const entry = ENFORCED_PLAN_AXE_GUARDS[axis] as { module: string; guard: string };
      const callers = callersOf(entry.guard).filter((f) => f !== `server/domain/${entry.module}.ts`);
      expect(callers.length, `${axis} 的拦截方 ${entry.guard} 只有定义、没有任何调用点`).toBeGreaterThanOrEqual(1);
    }
  });

  it('generation 那句「AI 任务与成片渲染各有一道门」：调用方横跨两条链，且不止一处', () => {
    const callers = callersOf(ENFORCED_PLAN_AXE_GUARDS.generation.guard);
    expect(callers.length, `成片渲染的额度门只有 ${callers.length} 处调用方，谈不上"各有一道门"`).toBeGreaterThanOrEqual(2);
    const aiSide = callers.filter((f) => /(^|\/)ai(\/|[-.])/.test(f));
    const renderSide = callers.filter((f) => /storyboard|render/.test(f));
    expect(aiSide.length, `AI 任务那一侧没有调用方：${callers.join(', ')}`).toBeGreaterThanOrEqual(1);
    expect(renderSide.length, `成片渲染那一侧没有调用方：${callers.join(', ')}`).toBeGreaterThanOrEqual(1);
  });

  it('generation 点名的那道门，身体里就是按 GENERATION_COST 问 refusalFor（换成别的门，点数那句话没人执行）', () => {
    const { module, guard } = ENFORCED_PLAN_AXE_GUARDS.generation as { module: string; guard: string };
    const def = guardDefinition('generation');
    expect(def, `表里 generation 写的是 ${module}.${guard}，${module}.ts 里没有这个 export function`).not.toBe('');
    expect(def, `${guard} 不再按 GENERATION_COST 取点数，句子里那几个点数字成了空话`).toContain('GENERATION_COST[kind]');
    expect(def, `${guard} 不再把判断交给 refusalFor，点数边界就不在句子说的那条线上`).toContain('refusalFor({');
  });
});

describe('边界：句子声称"什么时候拒"，门就在同一条线上答', () => {
  it('aiUsage「余额不够这一次要用的点数」：等于点数放行，少 1 点拒（每一类都过一遍，点数从单价表现读）', () => {
    const gate = guardFromTable('aiUsage');
    for (const kind of ['ai', 'image', 'video', 'compute'] as const) {
      const cost = GENERATION_COST[kind];
      expect(gate({ kind, cost, balance: cost }), `${kind} 类刚好用点数 ${cost} 却被拒`).toBeNull();
      expect(
        gate({ kind, cost, balance: cost - 1 }),
        `${kind} 类差 1 点（余额 ${cost - 1} / 需要 ${cost}）却没被拒——门不在点数上`,
      ).not.toBeNull();
    }
    // 反向对照：这一格的原句说的是"额度为 0"。按那句写，image 类余额 1 点应当放行——
    // 门实际拒了，所以那句话不成立（这一行是这一片改句子的直接证据）。
    expect(gate({ kind: 'image', cost: GENERATION_COST.image, balance: 1 })).not.toBeNull();
  });

  it('generation 那一格的点数与 aiUsage 同源：一次渲染要 GENERATION_COST.video 点，差 1 点就渲不成', () => {
    const cost = GENERATION_COST.video;
    // 这一格点名的 refusalForRun 要读库（余额、发放），单元平面跑不动：
    // 库那一半由 credits-enforcement.integration.test.ts 打真库钉，
    // "它确实把这三个数交给 refusalFor"由上面那条源码腿钉，这里钉的是数本身。
    expect(refusalFor({ kind: 'video', cost, balance: cost })).toBeNull();
    expect(
      refusalFor({ kind: 'video', cost, balance: cost - 1 }),
      `余额 ${cost - 1} / 需要 ${cost} 却没被拒——渲染门不在点数上`,
    ).not.toBeNull();
  });

  it('storage「放不下」：刚好填满放行，多 1 字节拒（上限从 PLAN_LIMITS 现算，不抄 MB）', () => {
    const gate = guardFromTable('storage');
    for (const plan of PLAN_KEYS) {
      const limit = storageLimitBytes(plan);
      expect(gate({ plan, usedBytes: limit - 1, incomingBytes: 1 }), `${plan} 档刚好放下却被拒`).toBeNull();
      expect(gate({ plan, usedBytes: limit - 1, incomingBytes: 2 }), `${plan} 档放不下却放行`).not.toBeNull();
    }
  });

  it('publishing「达到档位上限」：到线上就拒，不是超过才拒（每一档都过一遍）', () => {
    const gate = guardFromTable('publishing');
    for (const plan of PLAN_KEYS) {
      const limit = concurrentPublishLimit(plan);
      expect(gate({ plan, activeCount: limit - 1 }), `${plan} 档第 ${limit - 1} 个被拒，门比句子说的紧`).toBeNull();
      expect(
        gate({ plan, activeCount: limit }),
        `${plan} 档第 ${limit} 个（=上限）没被拒，句子里"达到"就成了"超过"`,
      ).not.toBeNull();
    }
  });

  it('teamCollaboration「达到档位上限」：同一形状，owner 不算在内由那道门的入参口径保证', () => {
    const gate = guardFromTable('teamCollaboration');
    for (const plan of PLAN_KEYS) {
      const limit = teamMemberLimit(plan);
      expect(gate({ plan, activeCount: limit - 1 }), `${plan} 档第 ${limit - 1} 人被拒，门比句子说的紧`).toBeNull();
      expect(gate({ plan, activeCount: limit }), `${plan} 档第 ${limit} 人（=上限）没被拒`).not.toBeNull();
    }
  });
});

describe('句子里的数字不许有第二份', () => {
  it('aiUsage 那句里的三个点数逐字等于 GENERATION_COST（写死一个"1 点"而成本改了，就是这句在说谎）', () => {
    const nums = (ENFORCED_PLAN_AXE_GUARDS.aiUsage.why.match(/\d+/g) ?? []).map(Number);
    expect(nums, `句子里读到的点数：${nums.join(',')}`).toEqual([
      GENERATION_COST.ai,
      GENERATION_COST.image,
      GENERATION_COST.video,
    ]);
  });

  it('generation 那句里的点数等于一次渲染的成本，且句子里只有这一个数', () => {
    const nums = (ENFORCED_PLAN_AXE_GUARDS.generation.why.match(/\d+/g) ?? []).map(Number);
    expect(nums).toEqual([GENERATION_COST.video]);
  });

  it('storage / publishing / teamCollaboration 三句不带数字——上限在页面上另有一列，句子只说形状', () => {
    for (const axis of ['storage', 'publishing', 'teamCollaboration'] as EnforcedPlanAxis[]) {
      expect(ENFORCED_PLAN_AXE_GUARDS[axis].why.match(/\d+/g), `${axis} 的解释里冒出了数字`).toBeNull();
    }
  });
});

describe('过期口径与旧措辞不许留在带出去的那份文本上', () => {
  /** 这几句都曾经是真的限度说法，今天都对不上门的口径；留在页面上就是把门说松或说紧 */
  const STALE = ['pending 邀请也占名额', '额度为 0 时新的 AI 任务', '渲染额度为 0', '存储写满时'];

  it('页面端出去那句话里没有任一条旧措辞', () => {
    const text = planEnforcementReadout();
    for (const stale of STALE) expect(text, `页面上还留着「${stale}」`).not.toContain(stale);
  });

  it('credits.ts 的散文里也没有（表改口了、注释还在讲旧口径，也是两份真相）', () => {
    const source = readFileSync(join(WEB_SRC, 'server', 'domain', 'credits.ts'), 'utf8').replace(/\r\n/g, '\n');
    for (const stale of STALE) expect(source, `credits.ts 里还留着「${stale}」`).not.toContain(stale);
  });

  it('teamCollaboration 那句改口成「过期不占名额」，与真在数名额的那道 SQL 同一条口径', () => {
    const why = ENFORCED_PLAN_AXE_GUARDS.teamCollaboration.why;
    expect(why).toContain('没过期');
    // 判据在 credit-ledger.ts 的 teamSlotRefusalFor 里（真库那条腿见 team.integration.test.ts ⑥）。
    // 只搜"src 里有没有这个 token"不够：team.ts 的邀请视图也按 expiresAt 过滤，
    // 把数名额那一句删了、页面句子照样绿——所以钉在**那个函数自己的那一段**上。
    const counting = functionSource('server/domain/credit-ledger.ts', 'teamSlotRefusalFor');
    expect(counting, '找不到 teamSlotRefusalFor：名额不再由它算，句子的口径没有读者').not.toBe('');
    expect(
      counting,
      'teamSlotRefusalFor 不再按 expiresAt 过滤过期的 pending 邀请，句子那句"过期不占名额"就又是谎',
    ).toContain('gt(projectInvites.expiresAt');
  });
});
