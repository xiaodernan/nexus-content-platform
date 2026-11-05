import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { reusableMemberWithProject } from './support/auth-session';

/**
 * §85 第五十片：`/analytics` 那张十二列表——第四十九片在任务账本上量到的同一形状。
 *
 * 第四十九片收尾时把三张宽表记成"同一形状"（只有 `overflow-x-auto`，没有 `min-w` 也没有
 * `tabIndex`）：任务账本已收，这一片收作品数据页。它的表更宽（12 列），而且每一行的
 * "作品"格里还挂着「第 N 版」「为什么没人看？」与几条角标——列被压扁时这些字先碎。
 *
 * 读法与前一片一致：页面级溢出 0 只是第一条；第二条是**表格自己保住了可读下限**
 * （390 下 `scrollWidth ≥ 900`、作品列不碎）；第三条是横滚区**键盘停得下来**
 * （axe `scrollable-region-focusable`）。三条一起才算"这张表在手机上能用"。
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
  return critical + serious;
}

test('§85 作品数据页：十二列在 390 保可读下限，横滚区键盘停得下来', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const failures: string[] = [];
  const { projectId } = await reusableMemberWithProject(
    page,
    EMAIL,
    PASSWORD,
    '数据窄屏夹具',
  );

  // 一张真公开作品：数据页只列公开着的作品；没有就先发一版（公开发，作品栏才有这一行）
  const got = await page.request.get(`/api/projects/${projectId}/publish`);
  let publication =
    (
      (await got.json().catch(() => null)) as {
        publication?: { path?: string; visibility?: string } | null;
      } | null
    )?.publication ?? null;
  if (!publication || publication.visibility !== 'public') {
    const csrf =
      (await page.context().cookies()).find(
        (cookie) => cookie.name === 'nexus_csrf',
      )?.value ?? '';
    const out = await page.request.post(`/api/projects/${projectId}/publish`, {
      headers: { 'x-csrf-token': csrf },
      data: { visibility: 'public' },
    });
    expect(out.status(), `发布夹具作品失败：${await out.text()}`).toBe(200);
    publication = (
      (await out.json()) as {
        publication: { path: string; visibility: string };
      }
    ).publication;
  }
  const path = publication!.path!;

  // 用游客身份走一次真访问：数据页那一行要有"打开"，不然表根本不渲染（`data-analytics-empty`）
  // 用一条正常的 Chrome UA：Playwright 默认的 HeadlessChrome 会被"疑似爬虫"那条判据挑出去，
  // 于是这次访问只进 bot 计数——数据页那一行还在，但"打开"是 0，量到的就不是真人访问。
  const guest = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  });
  const visitor = await guest.newPage();
  try {
    const beacon = visitor.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/published/visit',
      { timeout: 30_000 },
    );
    await visitor.goto(path, { waitUntil: 'domcontentloaded' });
    const recorded = await beacon.catch(() => null);
    console.log(
      `\n  游客访问 ${path}：上报 ${recorded ? `HTTP ${recorded.status()}` : '没等到 /api/published/visit'}`,
    );
  } finally {
    await guest.close();
  }

  for (const w of [
    { label: '1280', width: 1280, height: 900 },
    { label: '390', width: 390, height: 844 },
  ] as const) {
    await page.setViewportSize({ width: w.width, height: w.height });
    await page.goto('/analytics', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-analytics-page]', { timeout: 60_000 });
    await expect(
      page.locator('[data-analytics-row]').first(),
      '数据页没有作品行：夹具作品还没有被访问过',
    ).toBeVisible({
      timeout: 60_000,
    });
    if (w.width >= 900) {
      // 这一行必须是被真人那次访问推出来的：打开数 ≥1（爬虫那一路不计入）
      // 「打开」那一格是 `views`（`opens_today` 是"今天"那一列）
      const opens = Number(
        await page.evaluate(
          () =>
            document
              .querySelector(
                '[data-analytics-row] [data-analytics-value="views"]',
              )
              ?.textContent?.replace(/[^0-9]/g, '') ?? '0',
        ),
      );
      console.log(`\n  首行打开数：${opens}`);
      if (!Number.isFinite(opens) || opens < 1)
        failures.push(
          `数据页 ${w.label}：首行打开数 ${opens}，夹具那次访问没被算成真人`,
        );
    }
    const r = await scan(page);
    const wrong = printSurface(`作品数据 ${w.label}`, r);
    if (wrong > 0)
      failures.push(`数据页 ${w.label}：critical/serious ${wrong} 类`);
    const box = await page.evaluate(() => {
      const el = document.querySelector('[data-analytics-table-scroll]');
      if (!el) return null;
      const cell =
        document
          .querySelector('[data-analytics-row] td')
          ?.getBoundingClientRect().width ?? 0;
      return {
        overflowX:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        cellWidth: cell,
      };
    });
    console.log(
      `  → 页面溢出 ${box?.overflowX ?? '?'}px · 表格 ${box?.scrollWidth ?? '?'} / ${box?.clientWidth ?? '?'} · 首列 ${Math.round(box?.cellWidth ?? 0)}px`,
    );
    if (!box) failures.push(`数据页 ${w.label}：表格没有横向滚动容器`);
    else {
      if (box.overflowX !== 0)
        failures.push(`数据页 ${w.label}：页面级横向溢出 ${box.overflowX}px`);
      if (w.width < 900) {
        if (box.scrollWidth < 900)
          failures.push(
            `数据页 ${w.label}：表格只剩 ${box.scrollWidth}px 宽（<900），十二列被压扁了`,
          );
        if (box.cellWidth < 120)
          failures.push(
            `数据页 ${w.label}：首列只剩 ${Math.round(box.cellWidth)}px，作品名与角标被拆字`,
          );
        // axe 的 scrollable-region-focusable 在这里不会报——表格里有链接，键盘"进得去"；
        // 但右侧那几列没有链接，键盘用户只有让容器自己可聚焦才滚得到。所以这一条单独钉。
        const focusable = await page.evaluate(() => {
          const el = document.querySelector('[data-analytics-table-scroll]');
          return {
            tabindex: el?.getAttribute('tabindex') ?? null,
            role: el?.getAttribute('role') ?? null,
            label: el?.getAttribute('aria-label') ?? null,
          };
        });
        if (focusable.tabindex !== '0')
          failures.push(
            `数据页 ${w.label}：横滚容器 tabindex=${focusable.tabindex}，键盘滚不到右边的列`,
          );
        if (focusable.role !== 'region' || !focusable.label) {
          failures.push(
            `数据页 ${w.label}：横滚容器没有名字（role=${focusable.role} / label=${focusable.label}）`,
          );
        }
      } else if (box.scrollWidth > box.clientWidth + 2) {
        failures.push(
          `数据页 ${w.label}：宽屏下表格也需要横滚（${box.scrollWidth} > ${box.clientWidth}）`,
        );
      }
    }
    await page
      .locator('[data-analytics-table-scroll]')
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: `screenshots/analytics-${w.label}.png` });
  }

  expect(failures, `读数为红：\n${failures.join('\n')}`).toEqual([]);
});
