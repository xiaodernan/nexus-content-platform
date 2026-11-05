import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { reusableMemberWithProject } from './support/auth-session';

/**
 * §85 第四十九片：两张从没进过读数的界面——创作者主页 `/u/<handle>` 与任务账本 `/tasks/<项目>`。
 *
 * 这两张在 e2e 里都"有人走过"，但走的是功能："关注之后数字变了"（`studio.spec.ts`）、
 * "任务行状态跟着实时事件变"（同文件）。**没有一张被 axe 扫过，也没有一张在 390 下量过布局**。
 * 主页是公开页（陌生人第一次认识一个作者就在这里），账本是作品跑过多少次 AI 请求的凭证页
 * ——两张都不该只靠"功能那条腿是绿的"来假定它们可用（§159）。
 *
 * 主页那一条**不登录**：成员看自己的主页走 `isSelf` 分支（没有关注/拉黑），而那两颗键
 * 恰恰是这张页面上唯一的动作；游客视图才是访客真正看到的那张脸。handle 从发现页上
 * **真公开作品**的地址里取，不编、也不靠夹具账号的发布状态。
 *
 * 三样读数（尺子与 `a11y-internal` / `narrow-surfaces` 同一把）：axe（passes>0、
 * critical/serious=0）、页面级横向溢出、可见点击目标 <24×24（WCAG 2.5.8）。
 */

const require = createRequire(process.cwd() + '/package.json');
const AXE_PATH = require.resolve('axe-core/axe.min.js');

const EMAIL = 'viewer+fixture@nexus.test';
const PASSWORD = 'e2e-secret-123';

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
  // 这两张页面首跑是 0 违规；serious 也一并当门——本片自己就踩到过
  // `scrollable-region-focusable`（横滚区没有 tabindex），别让它以后再溜回来
  return critical + serious;
}

interface LayoutReading {
  overflowX: number;
  smallTargets: string[];
  targetTotal: number;
}

/** 与 `narrow-surfaces.spec.ts` 同一把尺子：页面级溢出、可见目标 <24、名册非空 */
async function layout(page: Page): Promise<LayoutReading> {
  return await page.evaluate((min) => {
    const root = document.documentElement;
    const small: string[] = [];
    let total = 0;
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [role="button"]',
      ),
    )) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      total += 1;
      if (Math.min(r.width, r.height) < min) {
        const label =
          (el.getAttribute('data-follow-button') && '关注按钮') ||
          el.textContent?.trim().slice(0, 20) ||
          el.tagName;
        small.push(`${label} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return {
      overflowX: root.scrollWidth - root.clientWidth,
      smallTargets: small,
      targetTotal: total,
    };
  }, 24);
}

const WIDTHS = [
  { label: '1280', width: 1280, height: 900 },
  { label: '390', width: 390, height: 844 },
] as const;

function gate(
  label: string,
  r: AxeResults,
  l: LayoutReading,
  failures: string[],
): void {
  console.log(
    `  → 溢出 ${l.overflowX}px · 点击目标 ${l.targetTotal} 个 · <24 ${l.smallTargets.length} 个 ${l.smallTargets.join(' / ')}`,
  );
  if (r.passes.length === 0)
    failures.push(`${label}：passes=0，扫描可能在空转`);
  if (l.overflowX !== 0)
    failures.push(`${label}：页面级横向溢出 ${l.overflowX}px`);
  if (l.targetTotal === 0)
    failures.push(`${label}：一个点击目标都没有，0 不等于 0 个缺陷`);
  if (l.smallTargets.length)
    failures.push(`${label}：<24 目标：${l.smallTargets.join(' / ')}`);
}

test('§85 创作者主页（游客）：axe + 390 布局', async ({ page }) => {
  test.setTimeout(240_000);
  const failures: string[] = [];

  // handle 从发现页的真公开作品上取：这一页是给陌生人看的，访客视角也不需要登录
  await page.goto('/discover', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-discover-card]', { timeout: 60_000 });
  const path = await page
    .locator('[data-discover-card]')
    .first()
    .getAttribute('data-discover-card');
  const handle = /^\/n\/([^/]+)\//.exec(path ?? '')?.[1];
  expect(
    handle,
    `发现页上的作品地址不是 /n/<handle>/<slug>：${path}`,
  ).toBeTruthy();
  console.log(`\n== §85 创作者主页/游客（@${handle}，来自 ${path}） ==`);

  await page.goto(`/u/${handle}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-profile-root]', { timeout: 60_000 });
  await expect(
    page.locator('[data-profile-name]'),
    '游客视图没渲染作者名',
  ).toBeVisible();
  // 游客视图必须有动作：没有这两颗键就说明量到的还是 isSelf 分支
  await expect(
    page.locator('[data-follow-button]'),
    '游客视图没有关注键',
  ).toHaveCount(1);
  await expect(
    page.locator('[data-block-set]').first(),
    '游客视图没有拉黑/屏蔽键',
  ).toBeVisible();
  // 作品那一栏真的列了东西：0 件时这一页只是文案，量不到卡片
  await expect(
    page.locator('[data-profile-work-name]').first(),
    '这个作者一件公开作品都没列出来',
  ).toBeVisible();

  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w.width, height: w.height });
    await page.waitForTimeout(200);
    const r = await scan(page);
    const critical = printSurface(`创作者主页/游客 ${w.label}`, r);
    if (critical > 0)
      failures.push(`主页 ${w.label}：critical/serious ${critical} 类`);
    const l = await layout(page);
    gate(`主页 ${w.label}`, r, l, failures);
    await page.screenshot({ path: `screenshots/profile-${w.label}.png` });
  }

  expect(failures, `读数为红：\n${failures.join('\n')}`).toEqual([]);
});

test('§85 任务账本：九列在 390 不压扁，横滚区键盘停得下来', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const failures: string[] = [];
  const { projectId } = await reusableMemberWithProject(
    page,
    EMAIL,
    PASSWORD,
    '任务账本夹具',
  );

  // 空账本只有一句话，量不到那张九列表格。已有行就直接用；一行都没有时用一次真的
  // DEMO 出图造一行（走真链路：额度门 → 任务行 → 资产行）。额度不够就照实记"没造出"，
  // 只量空态——额度是夹具账号的状态，不是这张页面的缺陷。
  const ledgerRes = await page.request.get(`/api/projects/${projectId}/tasks`);
  const existing =
    ((await ledgerRes.json().catch(() => null)) as { tasks?: unknown[] } | null)
      ?.tasks?.length ?? 0;
  if (existing > 0) {
    console.log(
      `\n  账本已有 ${existing} 行，不再造（出图要花额度，重复跑不该一路加行）`,
    );
  } else {
    const csrf =
      (await page.context().cookies()).find(
        (cookie) => cookie.name === 'nexus_csrf',
      )?.value ?? '';
    const seeded = await page.request.post(
      `/api/projects/${projectId}/images`,
      {
        headers: { 'x-csrf-token': csrf },
        data: {
          prompt: '任务账本布局夹具（64×64）',
          width: 64,
          height: 64,
          seed: 1,
        },
      },
    );
    console.log(
      `\n  造任务行：${seeded.ok() ? '成功' : `失败（HTTP ${seeded.status()}）`}`,
    );
  }

  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w.width, height: w.height });
    await page.goto(`/tasks/${projectId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-tasks-root]', { timeout: 60_000 });
    const rows = await page.locator('[data-task-row]').count();
    const r = await scan(page);
    const critical = printSurface(`任务账本 ${w.label}（${rows} 行）`, r);
    if (critical > 0)
      failures.push(`账本 ${w.label}：critical/serious ${critical} 类`);
    const l = await layout(page);
    gate(`账本 ${w.label}`, r, l, failures);
    if (rows > 0) {
      // 有行的时候，九列不该靠把布局视口撑宽来"装下"；要滚就滚表格自己那一块
      const box = await page.evaluate(() => {
        const el = document.querySelector('[data-tasks-table-scroll]');
        if (!el) return null;
        const time =
          document.querySelector('[data-task-time]')?.getBoundingClientRect()
            .width ?? 0;
        return {
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          timeWidth: time,
        };
      });
      console.log(
        `  → 表格滚动容器：${box ? `${box.scrollWidth} / ${box.clientWidth} · 时间列 ${Math.round(box.timeWidth)}px` : '不存在'}`,
      );
      if (!box)
        failures.push(`账本 ${w.label}：九列表格没有自己的横向滚动容器`);
      else {
        // 390 下必须"滚得动"：不滚就说明九列又被压成一列一个字
        if (w.width < 900 && box.scrollWidth <= box.clientWidth) {
          failures.push(
            `账本 ${w.label}：表格没有可滚的内容（${box.scrollWidth} ≤ ${box.clientWidth}），九列大概又被压扁了`,
          );
        }
        // 表格自己的宽度下限：九列每列至少 ~70px（640）
        if (w.width < 900 && box.scrollWidth < 640) {
          failures.push(
            `账本 ${w.label}：表格只剩 ${box.scrollWidth}px 宽（<640），九列被压扁了`,
          );
        }
      }
    }
    await page.screenshot({ path: `screenshots/tasks-ledger-${w.label}.png` });
  }

  expect(failures, `读数为红：\n${failures.join('\n')}`).toEqual([]);
});
