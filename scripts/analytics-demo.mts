/**
 * §168 的第二片（按天曲线）需要一个**看得出形状**的账号：窗口里得有十几天的数据。
 *
 * 平台自己的接口造不出这个：访客现场由 `POST /api/published/visit` 写，而那一天是哪一天
 * **由服务端说了算**（`utcDay(now)`，客户端传来的时间戳一律不信）。所以这里分两步：
 * 先用真浏览器走一遍产品路径（拿身份 → 建项目 → 发布），再直接往 `publication_visits`
 * 里补历史天数的行——补的是"过去发生过什么"，不是伪造一个接口。
 *
 * 用法：先起 dev server（`npm run dev`），然后 `npx tsx scripts/analytics-demo.mts`。
 * 产物：`screenshots/creator-analytics-trend.png`，并把页面上的窗口口径打印出来供核对。
 *
 * 幂等：项目每次都新建（名字带时间戳），访客行按 (publication, key, day) 去重，所以可以反复跑。
 */
import postgres from 'postgres';
import { chromium } from '@playwright/test';

const WEB = process.env.NEXUS_WEB_URL ?? 'http://localhost:3100';
const DB = process.env.NEXUS_DATABASE_URL ?? 'postgres://nexus:nexus_dev_only@localhost:55433/nexus';

/** 32 位十六进制：与 `validVisitorKey` 同一种形状，不然写入侧会（正确地）把它丢掉 */
const visitorKey = (n: number) => `${n.toString(16)}`.padStart(2, '0').repeat(16).slice(0, 32);

const day = (offsetFromToday: number): string =>
  new Date(Date.now() - offsetFromToday * 86_400_000).toISOString().slice(0, 10);

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext();
const page = await context.newPage();

// 1) 让 middleware 签发身份（guest 也行：访客现场与项目都挂在它名下）
await page.goto(WEB, { waitUntil: 'domcontentloaded' });
const csrf = (await context.cookies()).find((cookie) => cookie.name === 'nexus_csrf')?.value ?? '';
if (!csrf) throw new Error('没拿到 nexus_csrf：dev server 起来了吗？');
const headers = { 'x-csrf-token': csrf, 'content-type': 'application/json' };

const me = await page.request.get(`${WEB}/api/auth/me`);
const meBody = (await me.json()) as { user?: { id?: string; displayName?: string } };
const userId = meBody.user?.id;
if (!userId) throw new Error(`/api/auth/me 没给出用户：${JSON.stringify(meBody)}`);

// 2) 一个项目 + 一次公开发布（发布走真实管线：门禁 + 机检都在里面）
const created = await page.request.post(`${WEB}/api/projects`, {
  headers,
  data: { name: `创作数据演示 ${new Date().toISOString().slice(11, 19)}`, kind: 'website' },
});
if (created.status() !== 201) throw new Error(`建项目失败 ${created.status()}：${await created.text()}`);
const { projectId } = (await created.json()) as { projectId: string };

const published = await page.request.post(`${WEB}/api/projects/${projectId}/publish`, {
  headers,
  data: { visibility: 'public' },
});
const publishedBody = (await published.json()) as { ok?: boolean; publication?: { id: string; path: string } };
if (!publishedBody.ok || !publishedBody.publication) {
  throw new Error(`发布失败：${JSON.stringify(publishedBody)}`);
}
const publicationId = publishedBody.publication.id;

// 3) 补历史：最近 30 天里，从第 14 天起有人来，中间断掉两天（曲线上的空档与 0 要看得出区别）
const sql = postgres(DB, { max: 1 });
let rows = 0;
for (let offset = 14; offset >= 0; offset -= 1) {
  if (offset === 8 || offset === 7) continue; // 这两天一个人都没来
  const visitors = ((offset * 7) % 5) + 1; // 1..5 人，来回振荡，形状不是一条直线
  for (let index = 0; index < visitors; index += 1) {
    const inserted = await sql`
      insert into publication_visits (publication_id, visitor_key, day, opens, visible_ms, completion_pct, capped_reports)
              values (${publicationId}, ${visitorKey(index)}, ${day(offset)},
              ${index === 0 ? 1 : 0}, ${20_000 + offset * 1_500}, ${Math.min(100, 40 + offset * 4)}, 0)
      on conflict (publication_id, visitor_key, day) do nothing
      returning id
    `;
    rows += inserted.length;
  }
}
await sql.end();

// 4) 打开页面、把窗口口径读回来（"看一眼"要看得见数字，不能只看截图好不好看）
await page.goto(`${WEB}/analytics?days=30`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-analytics-trend]', { timeout: 60_000 });
// 传字符串而不是函数：tsx 的 esbuild 会往函数体里插 `__name` 辅助调用，
// 那段代码在页面上下文里不存在（`__name is not defined`），字符串表达式绕开这一层
const readout = await page.evaluate(`(() => {
  const take = (key) => Array.from(document.querySelectorAll('[data-analytics-window="' + key + '"]'))
    .map((node) => node.textContent.trim())
    .join(' | ');
  return {
    opens: take('opens'),
    visitors: take('visitors'),
    activeDays: take('active_days'),
    streak: take('streak'),
    playTime: take('play_time'),
    completion: take('completion'),
    valueBars: document.querySelectorAll('[data-analytics-bar-state="value"]').length,
    missingBars: document.querySelectorAll('[data-analytics-bar-state="missing"]').length,
    series: document.querySelectorAll('[data-analytics-series]').length,
  };
})()`);
console.log(`新补的历史行：${rows}`);
console.log(`窗口口径：${JSON.stringify(readout, null, 0)}`);

await page.screenshot({ path: 'screenshots/creator-analytics-trend.png', fullPage: true });

await page.goto(`${WEB}/analytics?days=7`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-analytics-trend]', { timeout: 60_000 });
await page.screenshot({ path: 'screenshots/creator-analytics-trend-7d.png', fullPage: true });

await browser.close();
console.log('截图：screenshots/creator-analytics-trend.png / -7d.png');
