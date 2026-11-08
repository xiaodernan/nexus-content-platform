import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { loginOutcome } from './support/auth-session';

/**
 * §85 第五十一片：管理台两张宽表的 390 读数——第四十九 / 五十片收掉的两张之外，
 * "只有 `overflow-x-auto`、没有 `min-w`、也没有 `tabIndex`"的同一形状还剩这两张：
 * `/admin/audit`（六列，最后一列是长句「细节」）与 `/admin/observability` 的进程指标表。
 *
 * 它们此前只在 `narrow-surfaces` 里量过"页面级溢出 0 / 小目标 0"——那两条都不会说
 * "十二列被压成一列一个字"。这一片补的是**表格自己**的读数：390 下它还剩多宽、
 * 第一列是否还能读、横滚区键盘停不停得下来。
 *
 * 管理台要 admin 夹具（`npm run e2e:admin-fixture`）；账号不是 admin 时这条会红在门里，
 * 不会退化成"扫拒绝页"——拒绝页的布局不是管理台的布局。
 */

const require = createRequire(process.cwd() + '/package.json');
const AXE_PATH = require.resolve('axe-core/axe.min.js');

const ADMIN = 'obs-admin+fixture@nexus.test';
const SECRET = 'e2e-secret-123';

interface AxeResults {
  violations: Array<{
    id: string;
    impact: string | null;
    help: string;
    nodes: Array<{ target: string[] }>;
  }>;
  passes: Array<{ id: string }>;
  inapplicable: Array<{ id: string }>;
}

async function scan(page: Page): Promise<AxeResults> {
  await page.addScriptTag({ path: AXE_PATH });
  return await page.evaluate(async (): Promise<AxeResults> => {
    const axe = (
      window as unknown as {
        axe: { run(...args: unknown[]): Promise<AxeResults> };
      }
    ).axe;
    if (!axe) throw new Error('axe 没有加载进页面');
    return await axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
      },
      exclude: [['nextjs-portal']],
    });
  });
}

function printSurface(label: string, r: AxeResults): number {
  const critical = r.violations.filter(
    (v) => (v.impact ?? 'unknown') === 'critical',
  ).length;
  const serious = r.violations.filter(
    (v) => (v.impact ?? 'unknown') === 'serious',
  ).length;
  console.log(
    `  【${label}】通过 ${r.passes.length} · 不适用 ${r.inapplicable.length} · 违规 ${r.violations.length} · critical ${critical} · serious ${serious}`,
  );
  for (const v of r.violations) {
    console.log(
      `    - [${v.impact ?? 'unknown'}] ${v.id}（${v.nodes.length} 个节点）：${v.help}`,
    );
    for (const n of v.nodes.slice(0, 4))
      console.log(`        target: ${n.target.join(' ')}`);
  }
  return critical + serious;
}

interface TableBox {
  overflowX: number;
  scrollWidth: number;
  clientWidth: number;
  cellWidth: number;
  headWidths: number[];
  tabindex: string | null;
  role: string | null;
  label: string | null;
}

async function tableBox(
  page: Page,
  scrollSelector: string,
  cellSelector: string,
  headSelector: string,
): Promise<TableBox | null> {
  return await page.evaluate(
    (sel) => {
      const el = document.querySelector(sel.scroll);
      if (!el) return null;
      const first =
        document.querySelector(sel.cell)?.getBoundingClientRect().width ?? 0;
      const headWidths = Array.from(
        document.querySelectorAll<HTMLElement>(sel.head),
      ).map((th) => th.getBoundingClientRect().width);
      return {
        overflowX:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        cellWidth: first,
        headWidths,
        tabindex: el.getAttribute('tabindex'),
        role: el.getAttribute('role'),
        label: el.getAttribute('aria-label'),
      };
    },
    { scroll: scrollSelector, cell: cellSelector, head: headSelector },
  );
}

const WIDTHS = [
  { label: '1280', width: 1280, height: 900 },
  { label: '390', width: 390, height: 844 },
] as const;

test('§85 管理台宽表：审计表与进程指标表在 390 保可读下限', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const failures: string[] = [];
  // 用 loginOutcome 而不是布尔：登不上时把服务端那句原话带出来，
  // 否则"登不上"会被读成夹具不存在，而实际九成是 10 次/15 分钟那道闸被反复跑喂满了
  const attempt = await loginOutcome(page, ADMIN, SECRET);
  expect(
    attempt.upgraded,
    `admin 夹具登不上（${ADMIN} · HTTP ${attempt.status}${attempt.shown ? ` · 界面写：${attempt.shown}` : ''}）：` +
      '账号要被 `npm run e2e:admin-fixture` 提成 admin；若是 429，等窗口腾出名额再跑，别放宽产品里的门',
  ).toBe(true);

  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w.width, height: w.height });

    // ---- 审计表：六列，最后一列是长句
    await page.goto('/admin/audit', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-audit-root]', { timeout: 60_000 });
    await expect(
      page.locator('[data-audit-root] tbody tr').first(),
      '审计表没有行：账户或库里的审计事件不够，量不到宽表',
    ).toBeVisible({
      timeout: 30_000,
    });
    const r = await scan(page);
    const wrong = printSurface(`管理台·审计 ${w.label}`, r);
    if (wrong > 0)
      failures.push(`审计 ${w.label}：critical/serious ${wrong} 类`);
    const box = await tableBox(
      page,
      '[data-audit-table-scroll]',
      '[data-audit-root] tbody tr td',
      '[data-audit-root] thead th',
    );
    console.log(
      `  → 页面溢出 ${box?.overflowX ?? '?'}px · 表格 ${box?.scrollWidth ?? '?'} / ${box?.clientWidth ?? '?'} · 首列 ${Math.round(box?.cellWidth ?? 0)}px · 表头 ${(box?.headWidths ?? []).map((n) => Math.round(n)).join('/')}`,
    );
    if (!box) failures.push(`审计 ${w.label}：表格没有横向滚动容器`);
    else {
      if (box.overflowX !== 0)
        failures.push(`审计 ${w.label}：页面级横向溢出 ${box.overflowX}px`);
      if (w.width < 900 && box.cellWidth < 90)
        failures.push(
          `审计 ${w.label}：首列只剩 ${Math.round(box.cellWidth)}px，时间被拆字`,
        );
      // 六列不许有一列被挤到 <24（连两个字都放不下，表头就会竖排）
      const squeezed = box.headWidths.filter((n) => n < 24);
      if (w.width < 900 && squeezed.length)
        failures.push(`审计 ${w.label}：有 ${squeezed.length} 列窄于 24px`);
      // 「细节」是这一表里最长的一格；没有下限时它会被压成一条竖线（实测 33px）
      const detail = box.headWidths.at(-1) ?? 0;
      if (w.width < 900 && detail < 200)
        failures.push(
          `审计 ${w.label}：细节列只剩 ${Math.round(detail)}px，JSON 会被拆成一条竖线`,
        );
      if (w.width < 900 && box.tabindex !== '0')
        failures.push(
          `审计 ${w.label}：横滚容器 tabindex=${box.tabindex}，键盘滚不到右边的列`,
        );
    }
    await page.screenshot({ path: `screenshots/admin-audit-${w.label}.png` });

    // ---- 进程指标表：五列（指标名/标签/次数/合计/均值）；空态是服务刚重启，照实记
    await page.goto('/admin/observability', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-observability-root]', {
      timeout: 60_000,
    });
    const hasRows = (await page.locator('[data-metric-row]').count()) > 0;
    console.log(
      `  进程指标行数：${hasRows ? '有' : '0（服务重启过，只有空态）'}`,
    );
    if (hasRows) {
      const r2 = await scan(page);
      const wrong2 = printSurface(`管理台·观测 ${w.label}`, r2);
      if (wrong2 > 0)
        failures.push(`观测 ${w.label}：critical/serious ${wrong2} 类`);
      const m = await tableBox(
        page,
        '[data-metric-table-scroll]',
        '[data-metric-row] td',
        '[data-metric-table-scroll] thead th',
      );
      console.log(
        `  → 页面溢出 ${m?.overflowX ?? '?'}px · 指标表 ${m?.scrollWidth ?? '?'} / ${m?.clientWidth ?? '?'} · 首列 ${Math.round(m?.cellWidth ?? 0)}px`,
      );
      if (!m) failures.push(`观测 ${w.label}：指标表没有横向滚动容器`);
      else {
        if (m.overflowX !== 0)
          failures.push(`观测 ${w.label}：页面级横向溢出 ${m.overflowX}px`);
        if (w.width < 900 && m.scrollWidth < 520)
          failures.push(
            `观测 ${w.label}：指标表只剩 ${m.scrollWidth}px（<520），五列被压扁了`,
          );
        if (w.width < 900 && m.tabindex !== '0')
          failures.push(
            `观测 ${w.label}：横滚容器 tabindex=${m.tabindex}，键盘滚不到右边的列`,
          );
      }
    }
    await page.screenshot({
      path: `screenshots/admin-observability-${w.label}.png`,
    });
  }

  expect(failures, `读数为红：\n${failures.join('\n')}`).toEqual([]);
});
