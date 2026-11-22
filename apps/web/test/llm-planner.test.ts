import { describe, expect, it } from 'vitest';
import {
  PLANNER_SYSTEM,
  buildPlannerUserPrompt,
  planFromPlannerText,
  planFromReply,
  parsePlannerReply,
  plannerStepOptions,
} from '../src/lib/llm-planner';
import { READINESS_STEPS, validatePlan } from '../src/lib/agent-runtime';

const GK = 'rpg';

describe('§PLAN-1 模型规划器的纯规则层', () => {
  describe('步骤清单与提示词', () => {
    it('清单正好是九种真实步骤，id 与配方一致', () => {
      const opts = plannerStepOptions();
      expect(opts).toHaveLength(READINESS_STEPS.length);
      expect(opts.map((o) => o.id)).toEqual(READINESS_STEPS.map((s) => s.kind));
    });

    it('清单里没有 agent / 能力 / dependsOn——模型看不到它碰不得的真值', () => {
      for (const opt of plannerStepOptions()) {
        expect(Object.keys(opt)).toEqual(['id', 'purpose']);
      }
    });

    it('system 明说不能造步骤、只能挑清单里的，且要求纯 JSON', () => {
      expect(PLANNER_SYSTEM).toContain('不能创造新步骤');
      expect(PLANNER_SYSTEM).toContain('不能改步骤 id');
      expect(PLANNER_SYSTEM).toContain('JSON');
    });

    it('user 提示带目标与显式类型，且逐条列出可用 id', () => {
      const prompt = buildPlannerUserPrompt('做一份上架检查', GK);
      expect(prompt).toContain('做一份上架检查');
      expect(prompt).toContain(GK);
      for (const opt of plannerStepOptions()) expect(prompt).toContain(`- ${opt.id}:`);
      expect(prompt).toContain('不要改，也不要从目标里猜');
    });
  });

  describe('回执解析：非法形状整份拒收', () => {
    it('空串 / 非 JSON / 数组都返回 null', () => {
      expect(parsePlannerReply('')).toBeNull();
      expect(parsePlannerReply('not json')).toBeNull();
      expect(parsePlannerReply('[]')).toBeNull();
    });

    it('带 markdown fence 的 JSON 也能解析', () => {
      const r = parsePlannerReply('```json\n{"order":["context"]}\n```');
      expect(r?.order).toEqual(['context']);
    });

    it('缺 order 或 order 空都返回 null', () => {
      expect(parsePlannerReply('{"titles":{}}')).toBeNull();
      expect(parsePlannerReply('{"order":[]}')).toBeNull();
    });

    it('造一个不存在的步骤 id ⇒ 整份拒收，不让模型发明步骤', () => {
      expect(parsePlannerReply('{"order":["context","teleport"]}')).toBeNull();
    });

    it('同一个 id 重复 ⇒ 整份拒收', () => {
      expect(parsePlannerReply('{"order":["context","context"]}')).toBeNull();
    });

    it('titles 里给没被挑中的步骤改标题 ⇒ 忽略，不认', () => {
      const r = parsePlannerReply('{"order":["context"],"titles":{"context":"盘点","qa-audit":"偷改"}}');
      expect(r?.titles).toEqual({ context: '盘点' });
      expect(r?.titles).not.toHaveProperty('qa-audit');
    });

    it('risks 最多 3 条，空的跳过', () => {
      const r = parsePlannerReply('{"order":["context"],"risks":["a","","b","c","d"]}');
      expect(r?.risks).toEqual(['a', 'b', 'c']);
    });
  });

  describe('重建计划：真值只来自配方', () => {
    it('模型给的 agent / 能力 / dependsOn 字段即使塞进回执也不进计划', () => {
      // parsePlannerReply 只认三个字段，多余的被丢弃；这里直接构造回执验证重建
      const plan = planFromReply(
        { order: ['context'], titles: {}, risks: [] },
        '目标',
        GK,
      )!;
      const spec = READINESS_STEPS.find((s) => s.kind === 'context')!;
      expect(plan.tasks).toHaveLength(1);
      expect(plan.tasks[0]!.agent).toBe(spec.agentName);
      expect(plan.tasks[0]!.artifact).toBe(spec.artifact);
      expect(plan.tasks[0]!.dependsOn).toEqual(spec.dependsOn);
    });

    it('模型改的标题生效，但步骤 id / agent 不被标题带着改', () => {
      const plan = planFromReply(
        { order: ['context'], titles: { context: '只看页面结构' }, risks: [] },
        '目标',
        GK,
      )!;
      expect(plan.tasks[0]!.title).toBe('只看页面结构');
      expect(plan.tasks[0]!.id).toBe('context');
      expect(plan.tasks[0]!.agent).toBe('Product Agent');
    });

    it('顺序按模型给的 order，不是配方原序', () => {
      const plan = planFromReply({ order: ['qa-audit', 'context'], titles: {}, risks: [] }, '目标', GK)!;
      expect(plan.tasks.map((t) => t.id)).toEqual(['qa-audit', 'context']);
    });

    it('挑了 report 却漏了它的三个前置 ⇒ 依赖缺失 ⇒ 返回 null（回退）', () => {
      const plan = planFromReply({ order: ['report'], titles: {}, risks: [] }, '目标', GK);
      expect(plan).toBeNull();
    });

    it('report + 三个前置齐全 ⇒ 计划和依赖都成立', () => {
      const plan = planFromReply(
        { order: ['context', 'seo-audit', 'qa-audit', 'report'], titles: {}, risks: [] },
        '目标',
        GK,
      )!;
      expect(plan).not.toBeNull();
      expect(validatePlan(plan)).toEqual([]);
      expect(plan.tasks.find((t) => t.id === 'report')!.dependsOn).toEqual(['context', 'seo-audit', 'qa-audit']);
    });

    it('模型给的风险落进计划，且始终追加一条诚实注记', () => {
      const plan = planFromReply({ order: ['context'], titles: {}, risks: ['注意额度'] }, '目标', GK)!;
      expect(plan.risks).toContain('注意额度');
      expect(plan.risks!.some((r) => r.includes('模型从真实配方中挑选'))).toBe(true);
    });

    it('模型没给风险时也不能回退到那句"没有真 provider / 确定性配方"的谎话（§159/§160）', () => {
      const plan = planFromReply({ order: ['context'], titles: {}, risks: [] }, '目标', GK)!;
      const all = plan.risks!.join(' | ');
      expect(all).not.toContain('本机没有真 provider');
      expect(all).not.toContain('计划由确定性配方生成');
      expect(all).toContain('模型按本次目标挑选');
    });

    it('重建出的每一份计划都能过 validatePlan', () => {
      const valid = planFromPlannerText('{"order":["game","combat","level"],"titles":{},"risks":[]}', '目标', GK)!;
      expect(valid).not.toBeNull();
      expect(validatePlan(valid)).toEqual([]);
    });
  });

  describe('端到端：文本 → 计划', () => {
    it('模型完整回执产出 9 步可执行计划', () => {
      const order = READINESS_STEPS.map((s) => s.kind);
      const plan = planFromPlannerText(JSON.stringify({ order, titles: {}, risks: [] }), '上线检查', GK)!;
      expect(plan.tasks).toHaveLength(9);
      expect(validatePlan(plan)).toEqual([]);
      expect(plan.goal).toBe('上线检查');
      expect(plan.gameKind).toBe(GK);
    });

    it('垃圾文本返回 null（等价回退信号）', () => {
      expect(planFromPlannerText('模型今天不想说话', '目标', GK)).toBeNull();
    });
  });
});
