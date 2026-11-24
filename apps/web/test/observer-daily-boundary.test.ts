import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aggregateObserverDaily, completeObserverDaily } from '@/server/admin/observer';

const TODAY = new Date('2026-11-24T23:59:59.000Z');

describe('§OBSERVE-DATA · 观测日与零值边界', () => {
  it('固定补满 UTC 近 7 天；有行为行才算观测，缺失保留 null', () => {
    const rows = [
      { day: '2026-11-24', opens: 8 },
      { day: '2026-11-22', opens: 0 },
      { day: '2026-11-01', opens: 999 },
    ];
    const before = structuredClone(rows);
    const daily = completeObserverDaily(rows, TODAY);
    expect(daily).toEqual([
      { day: '2026-11-18', opens: null },
      { day: '2026-11-19', opens: null },
      { day: '2026-11-20', opens: null },
      { day: '2026-11-21', opens: null },
      { day: '2026-11-22', opens: 0 },
      { day: '2026-11-23', opens: null },
      { day: '2026-11-24', opens: 8 },
    ]);
    expect(daily.filter((point) => point.opens !== null)).toHaveLength(2);
    expect(rows).toEqual(before);
  });

  it('没有采集行时七天全为 null，而不是七个零', () => {
    expect(completeObserverDaily([], TODAY).every((point) => point.opens === null)).toBe(true);
  });

  it('机器人-only 日期仍算观测零；查询先按日与机器人标记分组，再在聚合处剔除', () => {
    const rows = [
      { day: '2026-11-24', suspectedBot: false, opens: 8 },
      { day: '2026-11-24', suspectedBot: true, opens: 99 },
      { day: '2026-11-23', suspectedBot: true, opens: 12 },
      { day: '2026-11-22', suspectedBot: false, opens: 0 },
      { day: '2026-11-22', suspectedBot: true, opens: 4 },
    ];
    const aggregated = aggregateObserverDaily(rows);
    expect(aggregated).toEqual([
      { day: '2026-11-22', opens: 0 },
      { day: '2026-11-23', opens: 0 },
      { day: '2026-11-24', opens: 8 },
    ]);
    const daily = completeObserverDaily(aggregated, TODAY);
    expect(daily.find((point) => point.day === '2026-11-23')).toEqual({ day: '2026-11-23', opens: 0 });

    const data = readFileSync(join(process.cwd(), 'apps/web/src/server/admin/observer.ts'), 'utf8');
    const query = data.slice(data.indexOf('const dailyRows'), data.indexOf('const daily = completeObserverDaily'));
    expect(query).toContain('group by day, suspected_bot');
    expect(query).not.toMatch(/where[\s\S]*?suspected_bot\s*=/);
  });

  it('预测标签锚定最后观测日的下一日历日，不冒充固定 Day 8', () => {
    const page = readFileSync(join(process.cwd(), 'apps/web/src/app/admin/observe/page.tsx'), 'utf8');
    expect(page).toContain('最后观测日的下一日历日（opens）');
    expect(page).toContain('下一日起未来 3 天平均预测');
    expect(page).toContain('下一日起未来 7 天平均预测');
    expect(page).toContain('Next calendar day after last observation (opens)');
    expect(page).toContain('Average forecast, 3 days from the next day');
    expect(page).toContain('Average forecast, 7 days from the next day');
    expect(page).not.toContain('第 8 天');
    expect(page).not.toContain('Day 8');
  });

  it('管理页显示真实观测天数，并用虚线与 — 标记未观测', () => {
    const root = process.cwd();
    const page = readFileSync(join(root, 'apps/web/src/app/admin/observe/page.tsx'), 'utf8');
    const css = readFileSync(join(root, 'apps/web/src/app/globals.css'), 'utf8');
    const data = readFileSync(join(root, 'apps/web/src/server/admin/observer.ts'), 'utf8');
    const brief = readFileSync(join(root, 'apps/web/src/app/admin/observe/aiAdvice.ts'), 'utf8');
    expect(page).toContain('data-observer-observed-days');
    expect(page).toContain('data-observed={d.opens !== null}');
    expect(page).toContain("d.opens ?? '—'");
    expect(page).toContain('未观测，不是 0');
    expect(page).toContain('not observed, not zero');
    expect(css).toContain('.obs-barMissing');
    expect(data).toContain('observedDays7d');
    expect(data).toContain('byDay.get(day) ?? null');
    expect(data).not.toContain('openRate');
    expect(brief).toContain("d.opens ?? '未观测'");
    expect(brief).toContain("d.opens ?? 'not observed'");
  });
});
