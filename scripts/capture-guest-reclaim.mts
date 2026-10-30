/**
 * 过期访客回收面板的手跑见证（§158 的 Run → Screenshot → Inspect）。
 *
 * 常驻用例已经能点真执行了（第三十片的点名回收：发出去的 `ids` 只有这一趟造的两个人），
 * 这一份留着的理由不再是"e2e 不敢点"，而是**看得见**：它把首屏、勾选收窄、两次回执、
 * 收完之后那半张界面一起截成图，人眼读一遍才知道那几句话说的是不是同一件事。
 * 这一份自己造夹具、自己点、点完把夹具删干净。2026-10-30 第一次跑它抓到的正是那一格：
 * 回执写着"收走了 2 个"，列表还停在原来那 2 行（`useState(scan)` 不接 props 的后续变化）。
 *
 * 用法：
 *   npm run dev -w @nexus/web
 *   npx tsx scripts/guest-reclaim-fixture.mts
 *   npx tsx scripts/capture-guest-reclaim.mts
 *   npx tsx scripts/guest-reclaim-fixture.mts --rollback
 *
 * 端点那道桶是 6 次/10 分钟/审核员，这一份要按三次（dry run + 点名收甲 + 收完乙）——
 * 反复跑会撞 429，撞了等窗口过去，**不为了跑得快去放宽它**。
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import postgres from 'postgres';

const base = process.argv[2] ?? 'http://localhost:3100';
const outDir = fileURLToPath(new URL('../screenshots/', import.meta.url));
await mkdir(outDir, { recursive: true });

const ADMIN = 'obs-admin+fixture@nexus.test';
const SECRET = 'e2e-secret-123';
const MARKER = 's29witness';
const url = process.env.NEXUS_DATABASE_URL ?? 'postgres://nexus:nexus_dev_only@localhost:55433/nexus';
if (!url.includes('nexus_dev_only')) {
  console.error(`拒绝执行：NEXUS_DATABASE_URL 看着不像本地开发库`);
  process.exit(1);
}
const sql = postgres(url, { max: 1 });

function fail(message: string): never {
  throw new Error(message);
}

const seeded = await sql`select count(*)::int as n from users where bio = ${MARKER}`;
if (seeded[0]!.n !== 5) {
  fail(`库里 ${MARKER} 夹具是 ${seeded[0]!.n} 个（要 5 个）：先跑 npx tsx scripts/guest-reclaim-fixture.mts`);
}

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();

// —— 登录走界面上那条真链路（不插会话行，否则"登得进来"这句话就没证到）——
await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-auth-tab="login"]', { timeout: 60_000 });
for (let attempt = 1; attempt <= 20; attempt++) {
  await page.click('[data-auth-tab="login"]');
  const woke = await page
    .waitForSelector('[data-auth-displayname]', { state: 'detached', timeout: 1_000 })
    .then(() => true)
    .catch(() => false);
  if (woke) break;
  if (attempt === 20) fail('水合没等到：点 20 次「登录」，昵称输入框都没消失——React 始终没接住点击');
}
await page.fill('[data-auth-email]', ADMIN);
await page.fill('[data-auth-password]', SECRET);
const loginRes = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/auth/login', { timeout: 30_000 }).catch(() => null);
await page.click('[data-auth-submit]');
const loginStatus = (await loginRes)?.status() ?? 0;
const becameMember = await page
  .waitForFunction(
    () => document.querySelector('[data-auth-identity]')?.getAttribute('data-auth-identity') === 'member',
    undefined,
    { timeout: 30_000 },
  )
  .then(() => true)
  .catch(() => false);
if (!becameMember) {
  const errText = (await page.locator('[data-auth-error]').textContent().catch(() => '')) ?? '';
  fail(`登录没把身份换成 member（HTTP ${loginStatus}）：${errText}`);
}

const counts = async (): Promise<string> => (await page.textContent('[data-reclaim-counts]'))?.replace(/\s+/g, ' ').trim() ?? '';
const rows = (): Promise<{ id: string; text: string }[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-reclaim-row]')].map((el) => ({
      id: el.getAttribute('data-reclaim-row') ?? '',
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    })),
  );
const applyLabel = async (): Promise<string> => (await page.textContent('[data-reclaim-apply]'))?.trim() ?? '';

// —— 第一份读数：服务端渲染下来的那一份 ——
await page.goto(`${base}/admin/users`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-reclaim-root]', { timeout: 60_000 });
const firstCounts = await counts();
const firstRows = await rows();
const firstLabel = await applyLabel();
console.log(`首屏读数：${firstCounts}`);
console.log(`首屏列表：${firstRows.map((r) => r.text).join(' | ')}`);
console.log(`执行按钮：${firstLabel}`);
await page.locator('[data-reclaim-root]').scrollIntoViewIfNeeded();
await page.screenshot({ path: `${outDir}guest-reclaim-first.png` });
if (!firstCounts.includes('沉默到线 3') || !firstCounts.includes('够格 2') || !firstCounts.includes('发布过不碰 1')) {
  fail(`首屏读数与夹具期望不符：${firstCounts}`);
}
if (firstRows.length !== 2 || firstLabel !== '收走这 2 个') fail(`首屏列表或按钮那句数不对：${firstRows.length} 行 / ${firstLabel}`);
if (!firstRows.some((r) => r.text.includes('从来没有过会话'))) fail('乙那种"从来没有过会话"的形状没在界面上说出来');

// —— dry run：再数一遍，一个字都不该写 ——
const beforeDry = await sql`select count(*)::int as n from users where bio = ${MARKER} and deleted_at is null`;
await page.click('[data-recount-button]');
await page.waitForSelector('[data-reclaim-notice]', { timeout: 30_000 });
const dryNotice = (await page.textContent('[data-reclaim-notice]'))?.trim() ?? '';
const afterDry = await sql`select count(*)::int as n from users where bio = ${MARKER} and deleted_at is null`;
console.log(`dry run 回执：${dryNotice}（库里未删夹具行 ${beforeDry[0]!.n} → ${afterDry[0]!.n}）`);
await page.screenshot({ path: `${outDir}guest-reclaim-dryrun.png` });
if (!dryNotice.includes('只数了一遍') || !dryNotice.includes('一条都没写')) fail(`dry run 那句话不成立：${dryNotice}`);
if (beforeDry[0]!.n !== afterDry[0]!.n) fail('dry run 写了库：那句"一条都没写"是假的');

// —— 勾选收窄：默认全勾这一屏，取消甲那一行之后范围就该只剩乙 ——
const idOf = (name: string): string => {
  const id = firstRows.find((r) => r.text.includes(name))?.id;
  if (!id) fail(`首屏列表里没有「${name}」那一行：${firstRows.map((r) => r.text).join(' | ')}`);
  return id;
};
const pickState = (id: string) => page.$eval(`[data-reclaim-pick="${id}"]`, (el) => (el as HTMLInputElement).checked);
const pickAllLabel = () =>
  page.$eval('[data-reclaim-pick-all]', (el) => (el.closest('label')?.textContent ?? '').replace(/\s+/g, ' ').trim());

const jia = idOf('甲沉默两月');
const yi = idOf('乙从来没有会话');
// 取消勾选的那一行（甲）= 这一次**不该被动**的人；还勾着的那一行（乙）= 这一次要走的人
const kept = jia;
const taken = yi;
console.log(`首屏勾选：${await pickAllLabel()} · 甲=${await pickState(jia)} 乙=${await pickState(yi)}`);
if ((await pickAllLabel()) !== '全选（2/2）') fail(`默认范围不是"全勾这一屏"：${await pickAllLabel()}`);

await page.click(`[data-reclaim-pick="${kept}"]`);
const narrowedLabel = await applyLabel();
console.log(`取消甲（${kept}）之后：${await pickAllLabel()} · 执行按钮=${narrowedLabel}`);
if (narrowedLabel !== '收走这 1 个') fail(`取消一行之后按钮那句数没收窄：${narrowedLabel}`);
if ((await pickState(taken)) !== true) fail('勾着的那一行被这次点击一起取消了');
await page.screenshot({ path: `${outDir}guest-reclaim-named.png` });

// —— 第一次真执行：只点名的那一个（乙）——
await page.click('[data-reclaim-apply]');
await page.waitForFunction(
  () => (document.querySelector('[data-reclaim-notice]')?.textContent ?? '').includes('收走了'),
  undefined,
  { timeout: 60_000, polling: 300 },
);
const namedNotice = (await page.textContent('[data-reclaim-notice]'))?.trim() ?? '';
// refresh 送下来的新快照接住了，乙那一行才会没；这条等不到就是 2026-10-30 那一格复发
await page.waitForFunction(
  (id) => !document.querySelector(`[data-reclaim-row="${id}"]`),
  taken,
  { timeout: 30_000, polling: 300 },
);
const afterNamedRows = await rows();
const afterNamedCounts = await counts();
const afterNamedLabel = await applyLabel();
console.log(`点名执行回执：${namedNotice}`);
console.log(`点名执行后读数：${afterNamedCounts}`);
console.log(`点名执行后列表：${afterNamedRows.map((r) => r.text).join(' | ')} · 执行按钮=${afterNamedLabel}`);
if (namedNotice !== '点名的 1 个里收走了 1 个') fail(`点名执行那句回执不成立：${namedNotice}`);
if (!afterNamedCounts.includes('够格 1 个')) fail(`点名执行后界面还停在旧清单上：${afterNamedCounts}`);
if (afterNamedRows.length !== 1 || !afterNamedRows[0]!.text.includes('甲沉默两月')) {
  fail(`点名的乙收走了，屏幕上剩下的应该是没被点名的甲：${afterNamedRows.map((r) => r.text).join(' | ')}`);
}
if (afterNamedLabel !== '收走这 1 个') fail(`换过读数之后"全勾"应该指向新一屏：${afterNamedLabel}`);
const takenState = await sql`select deleted_at is not null as deleted from users where id = ${taken}`;
const keptState = await sql`select deleted_at is not null as deleted from users where id = ${kept}`;
console.log(`库里核对：乙（点名）删=${takenState[0]!.deleted} 甲（没点名）删=${keptState[0]!.deleted}`);
if (takenState[0]!.deleted !== true || keptState[0]!.deleted !== false) fail('点名执行碰了没被点名的那个人');
await page.screenshot({ path: `${outDir}guest-reclaim-after-named.png` });

// —— 第二次真执行：这一屏剩的那一个（refresh 之后默认又全勾了）——
await page.click('[data-reclaim-apply]');
await page.waitForFunction(
  () => (document.querySelector('[data-reclaim-notice]')?.textContent ?? '').includes('收走了'),
  undefined,
  { timeout: 60_000, polling: 300 },
);
const applyNotice = (await page.textContent('[data-reclaim-notice]'))?.trim() ?? '';
await page.waitForSelector('[data-reclaim-empty]', { timeout: 30_000 });
const emptyText = (await page.textContent('[data-reclaim-empty]'))?.trim() ?? '';
const finalCounts = await counts();
const finalLabel = await applyLabel();
const finalDisabled = await page.$eval('[data-reclaim-apply]', (el) => (el as HTMLButtonElement).disabled);
console.log(`执行回执：${applyNotice}`);
console.log(`执行后读数：${finalCounts}`);
console.log(`执行后空态：${emptyText}`);
console.log(`执行后按钮：${finalLabel} 禁用=${finalDisabled}`);
if (applyNotice !== '点名的 1 个里收走了 1 个') fail(`第二次执行那句数不对：${applyNotice}`);
if (!finalCounts.includes('够格 0 个')) fail(`刷新后界面还停在旧清单上：${finalCounts}`);
if (finalLabel !== '收走这 0 个' || finalDisabled !== true) fail(`刷新后按钮那句数没跟着走：${finalLabel} 禁用=${finalDisabled}`);
if (!emptyText.includes('没有够格的访客')) fail(`空态那句话不见了：${emptyText}`);
await page.screenshot({ path: `${outDir}guest-reclaim-applied.png` });

// —— 库里核对：六件事与那两道护身符，逐个人一行 ——
const after = await sql`
  select u.display_name as name, u.deleted_at is not null as deleted,
    (select count(*) from sessions s where s.user_id = u.id)::int as sessions,
    (select count(*) from projects p where p.owner_id = u.id and p.deleted_at is null)::int as live_drafts,
    (select count(*) from published_projects pp join projects p on p.id = pp.project_id where p.owner_id = u.id)::int as published
  from users u where u.bio = ${MARKER} order by u.display_name`;
for (const r of after) console.log(`库：${r.name} 删=${r.deleted} 会话=${r.sessions} 活草稿=${r.live_drafts} 发布=${r.published}`);
const byName = Object.fromEntries(after.map((r) => [r.name as string, r]));
const expected: Record<string, { deleted: boolean; sessions: number }> = {
  [`${MARKER}·甲沉默两月`]: { deleted: true, sessions: 0 },
  [`${MARKER}·乙从来没有会话`]: { deleted: true, sessions: 0 },
  [`${MARKER}·丙发布过`]: { deleted: false, sessions: 1 },
  [`${MARKER}·丁才刚过期`]: { deleted: false, sessions: 1 },
  [`${MARKER}·戊宽限期内`]: { deleted: false, sessions: 1 },
};
/** 按名字取那一行；夹具少一行就是夹具坏了，别往下猜 */
const need = (name: string) => {
  const row = byName[name];
  if (!row) throw new Error(`库里没有 ${name}（夹具丢了？）`);
  return row;
};
for (const [name, want] of Object.entries(expected)) {
  const got = need(name);
  if (got.deleted !== want.deleted || got.sessions !== want.sessions) {
    fail(`${name}：期望 删=${want.deleted} 会话=${want.sessions}，实际 删=${got.deleted} 会话=${got.sessions}`);
  }
}
if (need(`${MARKER}·甲沉默两月`).live_drafts !== 0) fail('甲的私有草稿没进回收站');
if (need(`${MARKER}·丙发布过`).published !== 1) fail('丙的已发布作品被收走了（那道护身符失效）');

const audit = await sql`
  select count(*)::int as n from audit_events e join users u on u.id::text = e.target_id
  where e.action = 'user.reclaim' and u.bio = ${MARKER}`;
console.log(`审计里 user.reclaim 的行数：${audit[0]!.n}`);
if (audit[0]!.n !== 2) fail(`审计应该有两行（甲、乙），实际 ${audit[0]!.n}`);

await browser.close();
await sql.end({ timeout: 5 });
console.log('界面见证通过（截图在 screenshots/guest-reclaim-*.png）');
