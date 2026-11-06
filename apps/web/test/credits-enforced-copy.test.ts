/**
 * 额度页那句"哪些限制今天真会拦人"的**来源**门（§SEC 第四十二片）。
 *
 * 起点是 ADR-0088「没牙 6」：`/credits` 上那句话原来整句手写在页面上——里面的件数、
 * 每一格的解释、"还没有拦截方"那半句，都不由 `ENFORCED_PLAN_AXES` / `UNENFORCED_PLAN_AXES` 拼出来。
 * 于是数组加一格时页面不会跟着改口，而这一页偏偏是靠这句话让人相信"表上的上限是真会拦人的"。
 *
 * 这里的两条纪律：
 * - **数字要由入参证明**：把一格摘掉传给生成函数，句子必须跟着改口（写死件数的实现在这条上红）；
 * - **页面不许自己再写一遍**：静态门读 `page.tsx`，那句话的出处只能有一个。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ENFORCED_PLAN_AXES,
  ENFORCED_PLAN_AXE_WHY,
  UNENFORCED_PLAN_AXES,
  planEnforcementReadout,
  type EnforcedPlanAxis,
} from '../src/server/domain/credits';

const PAGE_SOURCE = readFileSync(join(import.meta.dirname, '../src/app/credits/page.tsx'), 'utf8').replace(
  /\r\n/g,
  '\n',
);

describe('planEnforcementReadout：那句话的件数与名单同源', () => {
  it('件数 == 数组长度，每一格的名字和它自己的解释都在句子里', () => {
    const text = planEnforcementReadout();
    // 默认入参就是那两列本身——默认换成别的东西，这句话就不再是账上的那句话了
    expect(text).toBe(planEnforcementReadout(ENFORCED_PLAN_AXES, UNENFORCED_PLAN_AXES));
    expect(text).toContain(`§133 点名的 ${ENFORCED_PLAN_AXES.length} 件事今天全都有真的拦截方`);
    for (const axis of ENFORCED_PLAN_AXES) {
      expect(text, `句子里没有点名 ${axis}`).toContain(axis);
      expect(text, `${axis} 没有带上它那条解释`).toContain(ENFORCED_PLAN_AXE_WHY[axis]);
    }
  });

  it('解释表与已生效那一列一格不多一格不少（类型已经键住，这条给运行时读数）', () => {
    expect(Object.keys(ENFORCED_PLAN_AXE_WHY).sort()).toEqual([...ENFORCED_PLAN_AXES].sort());
  });

  it('摘掉一格，句子改口说四件事，那一格的名字与解释都不再出现——件数是拼出来的不是写死的', () => {
    const dropped: EnforcedPlanAxis = 'teamCollaboration';
    const four = ENFORCED_PLAN_AXES.filter((a) => a !== dropped);
    const text = planEnforcementReadout(four);
    expect(text).toContain('§133 点名的 4 件事');
    expect(text).not.toContain(dropped);
    expect(text).not.toContain(ENFORCED_PLAN_AXE_WHY[dropped]);
    // 反向对照：只改这一格，其余四格的名字与解释一个都没少
    for (const axis of four) {
      expect(text).toContain(axis);
      expect(text).toContain(ENFORCED_PLAN_AXE_WHY[axis]);
    }
  });

  it('还没拦截方那一列非空时，句子点名它并说"只是这张表上的数字"', () => {
    const text = planEnforcementReadout(['aiUsage'], ['apiRateLimit']);
    expect(text).toContain('另外 1 格（apiRateLimit）目前只是这张表上的数字');
    expect(text).not.toContain('真加了第六件事');
    // 那一列空掉时（今天的实况）换成另一句，且不许留下"只是数字"的谎
    expect(planEnforcementReadout()).not.toContain('只是这张表上的数字');
    expect(planEnforcementReadout()).toContain('真加了第六件事，先在这两列里放明，再落拦截方。');
  });

  it('两句尾各说一件事：件数不等于已生效那列的长度时，句子里的数字跟着入参走', () => {
    expect(planEnforcementReadout(['aiUsage', 'storage']).startsWith('§133 点名的 2 件事')).toBe(true);
  });
});

describe('页面不许把那句话再抄一遍（静态门）', () => {
  it('[data-credits-enforced] 那一段落只调用 planEnforcementReadout()，没有手写的句子', () => {
    const start = PAGE_SOURCE.indexOf('data-credits-enforced');
    expect(start, '额度页找不到 [data-credits-enforced] 那一格').toBeGreaterThan(-1);
    const block = PAGE_SOURCE.slice(start, PAGE_SOURCE.indexOf('</p>', start));
    expect(block).toContain('planEnforcementReadout()');
    expect(block).not.toContain('§133');
  });

  it('整个页面文件里不留手写的件数——数字只能从域里那句拼出来', () => {
    expect(PAGE_SOURCE).not.toMatch(/点名的\s*[0-9一二三四五六七八九十]+\s*件事/);
    expect(PAGE_SOURCE).not.toContain('额度为 0 时生成会被挡下');
  });

  it('今天这一页端出来的那句话，逐字与生成函数一致（不是"差不多"）', () => {
    expect(planEnforcementReadout()).toBe(
      '§133 点名的 5 件事今天全都有真的拦截方（aiUsage、storage、generation、publishing、teamCollaboration）：' +
        'aiUsage：额度为 0 时新的 AI 任务会被挡下；storage：存储写满时新的素材会被拒绝（库里已有的不会被自动删掉）；' +
        'generation：渲染额度为 0 时成片渲染被挡下（AI 任务与成片渲染各有一道门）；' +
        'publishing：公开发布数达到档位上限时新的发布会被挡下（换版本不占名额，收回发布即释放）；' +
        'teamCollaboration：协作者数达到档位上限时新的邀请会被挡下（pending 邀请也占名额，撤回/移除即释放）。' +
        '真加了第六件事，先在这两列里放明，再落拦截方。',
    );
  });
});
