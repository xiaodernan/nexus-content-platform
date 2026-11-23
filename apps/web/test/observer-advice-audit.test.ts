import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditNumbers, numbersInText } from '../src/app/admin/observe/aiAdviceAudit';

/**
 * §ADMIN-LLM-2 观察站 AI 深读的「数字出处核对」。
 *
 * 钉住的是一件窄而可复核的事：**模型写出的数字有没有在喂给它的快照里逐字出现过**。
 * 不判断业务对错（那要真值），只把"快照里没有的数"当面标出来——
 * 同类纪律见 ADR 0262「没报 ≠ 0」与 §MOD-1 的 quote 逐字校验。
 */
describe('§ADMIN-LLM-2 数字出处核对', () => {
  const BRIEF = `注册用户（非游客）：1358，游客：49，7 天新注册：12
总发布 327，公开已过审 96，总浏览 18,420，点赞 733
完成度（30 天均值）：41.7%
近 7 天每日有效打开：11-16=21，11-17=18`;

  it('数字抽取归一化：千分位与百分号不制造两个数', () => {
    const set = numbersInText('18,420 / 18420 / 41.7% / 41.7');
    expect(set.has('18420')).toBe(true);
    expect(set.has('41.7')).toBe(true);
    expect(set.size).toBe(2);
  });

  it('全部数字都在快照里 → 没有未核实项', () => {
    const audit = auditNumbers('非游客 1358，完成度 41.7%，总浏览 18,420', BRIEF);
    expect(audit.unverified).toEqual([]);
    expect(audit.cited.every((c) => c.inSnapshot)).toBe(true);
  });

  it('编造的数字被标出，但保留原文不删', () => {
    const audit = auditNumbers('注册用户 1358，但留存率只有 73.2%', BRIEF);
    expect(audit.unverified).toEqual(['73.2']);
    expect(audit.cited.find((c) => c.value === '1358')?.inSnapshot).toBe(true);
  });

  it('模型推算出的新数（快照里没有）同样标注，不冒充实测', () => {
    const audit = auditNumbers('按当前斜率，下周将新增 300 人', BRIEF);
    expect(audit.unverified).toEqual(['300']);
  });

  it('重复数字只标一次，顺序按首次出现', () => {
    const audit = auditNumbers('999 人，又说 888 人，再提 999 人', BRIEF);
    expect(audit.unverified).toEqual(['999', '888']);
  });

  it('没有数字的句子不产生噪音', () => {
    const audit = auditNumbers('先把发布门禁跑通，再谈增长。', BRIEF);
    expect(audit.cited).toEqual([]);
    expect(audit.unverified).toEqual([]);
  });

  it('快照里没有的数字（哪怕很短）也不会被放过', () => {
    const audit = auditNumbers('7 天新增 12，但第 8 天会翻倍', BRIEF);
    expect(audit.unverified).toEqual(['8']);
  });
});

describe('§ADMIN-LLM-2 接线纪律（源码级）', () => {
  const ROOT = process.cwd();
  const advice = readFileSync(join(ROOT, 'apps/web/src/app/admin/observe/aiAdvice.ts'), 'utf8');
  const card = readFileSync(join(ROOT, 'apps/web/src/app/admin/observe/ObserverAiAdvice.tsx'), 'utf8');
  const globals = readFileSync(join(ROOT, 'apps/web/src/app/globals.css'), 'utf8');
  const route = readFileSync(join(ROOT, 'apps/web/src/app/api/admin/observer/advice/route.ts'), 'utf8');
  const page = readFileSync(join(ROOT, 'apps/web/src/app/admin/observe/page.tsx'), 'utf8');

  it('生成建议时用同一份 brief 做核对（不是另拼一份）', () => {
    expect(advice).toContain('const brief = observerMetricsBrief(m, locale)');
    expect(advice).toContain('user: brief');
    expect(advice).toContain('auditNumbers(`${item.basis} ${item.impact}`, brief)');
  });

  it('标注在界面上可见（不是只塞 title）', () => {
    expect(card).toContain('obs-aiAdviceAudit');
    expect(card).toContain('item.unverifiedNumbers.join');
  });

  it('client 组件不再直接 import 服务端调用（浏览器里没有凭据）', () => {
    expect(card).toContain("import type { AiAdviceItem } from './aiAdvice'");
    expect(card).not.toMatch(/generateAiAdvice\s*\(/);
    expect(card).toContain("fetch('/api/admin/observer/advice'");
  });

  it('服务端路由：口令门 + DEMO 拒绝 + 限流 + 指标现算', () => {
    expect(route).toContain('OBSERVER_COOKIE_VALUE');
    expect(route).toContain("caps.text !== 'real'");
    expect(route).toContain("rateKey('observer-advice'");
    expect(route).toContain('readObserverMetrics()');
    expect(route).toContain('generateAiAdvice(metrics, locale)');
  });

  it('页面不再把指标当 props 塞给 client（防伪造输入/少传一份计数）', () => {
    expect(page).toContain('<ObserverAiAdvice locale={locale} />');
    expect(page).not.toContain('metrics={m} />');
  });

  it('组件用到的 obs-aiAdvice* 类名全部有样式定义', () => {
    const used = new Set([...card.matchAll(/className="(obs-aiAdvice[^" ]*)"/g)].map((m) => m[1]!));
    expect(used.size).toBeGreaterThan(0);
    for (const cls of used) expect(globals).toContain(`.${cls}`);
  });

  it('这条写路由与它的按钮两头都接上 CSRF 双提交（并回 origin/main 时补的）', () => {
    expect(route).toContain('csrfOk(req)');
    expect(card).toContain('...csrfHeaders()');
  });
});
