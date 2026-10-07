import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { expect, test, type Page } from '@playwright/test';
// 打包用的写入器就是导出那一条链上的同一个（store、不压缩）：
// 这里要的是"一份合法但没清单的 ZIP"，自己手拼字节只会测到我自己的拼法
import { textEntry, zipStore } from '../apps/web/src/lib/zip';

/**
 * §105 / §144 第二片的真浏览器那一寸：作者下载的那份 zip，**在浏览器里点一下就能装回来**。
 *
 * domain 层那 21+7 条测的是判据；这里测的是判据之外的那四件：
 *  ① 顶栏「导出」下载到的**同一份字节**，喂回主页那颗「导入」就能出一个新项目——
 *     不是我把 zip 重新拼一遍再喂，那样测的是我自己的拼法；
 *  ② 导入的项目在画布上**渲染得出**（8 个节点），也就是文档真的进了库、投影走得通，而不只是回执上写着"1 份"；
 *  ③ 源项目没被改动：列表里是两行同名的项目，不是一行被覆盖；
 *  ④ `POST /api/projects/import` 的 401 / 403 / 400 / 415 / 201 各是真的那一个状态码与真的那一句理由。
 *
 * 状态码为什么要在这里量：`docs/SECURITY.md` 让写请求先过 CSRF 双提交，顺序错了（比如先判登录）
 * 界面就会把"没带 token"说成"没登录"，用户照着去登录，回来还是失败。
 * 413 那一条在文件末尾（2026-10-07 补），它同时把当初"为什么不量"的理由更正了——
 * 详见那一条的注释与 `docs/ROADMAP.md` 里同名那一节。
 */

const ZIP_PATH = resolve('.scratch/browser-import-source.zip');

async function createProject(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.fill('[data-project-name-input]', name);
  await page.click('[data-create-project]');
  await page.waitForURL(/\/studio\/[^/]+$/);
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  return new URL(page.url()).pathname.split('/').pop()!;
}

/** 顶栏那三样默认全勾，直接下载；文件留在磁盘上给导入那一步用 */
async function exportToDisk(page: Page, saveTo: string): Promise<void> {
  await page.click('[data-export-open]');
  const waiting = page.waitForEvent('download');
  await page.click('[data-export-run]');
  const download = await waiting;
  await download.saveAs(saveTo);
}

test('§144 闭环：浏览器导出的那份 zip，浏览器里点一下就装回成一个新项目', async ({ page }) => {
  test.setTimeout(180_000);
  const stamp = Date.now().toString(36);
  const name = `导入往返 ${stamp}`;
  const sourceId = await createProject(page, name);
  await expect(page.locator('[data-node-id]')).toHaveCount(8);

  await exportToDisk(page, ZIP_PATH);
  const zipBytes = await readFile(ZIP_PATH);
  expect(zipBytes.subarray(0, 2).toString('latin1'), '下载到的不是 zip').toBe('PK');

  await page.goto('/');
  await page.setInputFiles('[data-import-file]', ZIP_PATH);
  await expect(page.locator('[data-import-receipt]')).toBeVisible({ timeout: 30_000 });

  // 回执的每一个数字都来自服务端；这里断言的是"界面把那些话原样贴出来了"
  await expect(page.locator('[data-import-composition]')).toContainText('设计文档 1');
  await expect(page.locator('[data-import-composition]')).toContainText('代码文件没有入库');
  expect(await page.locator('[data-import-asset-failures]').count(), `少报了几张图：${await page.locator('[data-import-receipt]').innerText()}`).toBe(0);

  // 新项目回到列表里，而且源项目那一行没被覆盖——两行同名，是两个项目
  const rows = page.locator('[data-project-row]', { hasText: name });
  await expect(rows).toHaveCount(2);

  // 打开导入出来的那一个：画布投影得出 8 个节点，才说明文档进了库而不是回执写了好看
  const importedId = (await page.locator('[data-import-open]').getAttribute('data-import-open'))!;
  expect(importedId).not.toBe(sourceId);
  await page.click('[data-import-open]');
  await page.waitForURL(new RegExp(`/studio/${importedId}$`));
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-node-id]')).toHaveCount(8);

  await page.screenshot({ path: 'screenshots/import-roundtrip-canvas.png' });

  // 源项目还是原来那一版：回到它，节点数没被动过
  await page.goto(`/studio/${sourceId}`);
  await expect(page.locator('[data-node-id]')).toHaveCount(8);
});

test('§105 状态码：401 / 403 / 400 / 415 / 201 在真 HTTP 上各说各的话', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  const csrf = await page.evaluate(() => /nexus_csrf=([a-f0-9]+)/.exec(document.cookie)?.[1] ?? '');
  expect(csrf.length, '浏览器里没有 nexus_csrf cookie：双提交这一门没法量').toBeGreaterThan(8);

  const junk = { name: 'x.zip', mimeType: 'application/zip', buffer: Buffer.from('这一串不是 ZIP') };

  // ① 没带 CSRF 头 → 403。这一条必须在"没登录"之前判，别的路由也是同一顺序（ADR-0002）
  const noCsrf = await page.request.post('/api/projects/import', { multipart: { file: junk }, headers: { 'x-csrf-token': 'not-the-token' } });
  expect(noCsrf.status()).toBe(403);
  expect((await noCsrf.json()).error).toBe('csrf_failed');

  // ② 带了 CSRF 但没登录 → 401。用一个新的 request 上下文：它有自己的空 cookie jar，
  //    middleware 会临时签一个没人认识的会话 token，库里查不到就是 null
  const anon = await browser.newContext({ baseURL: process.env.NEXUS_WEB_URL ?? 'http://localhost:3100' });
  const anonRes = await anon.request.post('/api/projects/import', {
    multipart: { file: junk },
    headers: { 'x-csrf-token': 'a'.repeat(64), cookie: `nexus_csrf=${'a'.repeat(64)}` },
  });
  expect(anonRes.status(), '未登录拿到的不是 401——那 requireUser 抛错那一格又被写回了 500').toBe(401);
  expect((await anonRes.json()).error).toBe('unauthenticated');
  await anon.close();

  // ③ 登录了但传错了表单类型 → 400：这是"你填错了"，与"这份包不是这个格式"是两件事
  const notMultipart = await page.request.post('/api/projects/import', { data: { file: 'x' }, headers: { 'x-csrf-token': csrf } });
  expect(notMultipart.status()).toBe(400);
  expect((await notMultipart.json()).reason).toMatch(/multipart/);

  // ④ 真的传了一份不是 ZIP 的字节 → 415，且理由带着 ZIP 读取器那一句原话
  const junkRes = await page.request.post('/api/projects/import', { multipart: { file: junk }, headers: { 'x-csrf-token': csrf } });
  expect(junkRes.status()).toBe(415);
  const junkBody = await junkRes.json();
  expect(junkBody.error).toBe('import_refused');
  expect(junkBody.reason).toMatch(/ZIP 拒绝/);

  // ⑤ 一份真导出过的包 → 201，回执里带着新项目与包里的字节数
  const stamp = Date.now().toString(36);
  const name = `状态码源 ${stamp}`;
  await createProject(page, name);
  await exportToDisk(page, ZIP_PATH);
  const real = await page.request.post('/api/projects/import', {
    multipart: { file: { name: 'round.zip', mimeType: 'application/zip', buffer: await readFile(ZIP_PATH) } },
    headers: { 'x-csrf-token': csrf },
  });
  expect(real.status(), `一份本平台导出的包被拒了：${JSON.stringify(await real.json().catch(() => null))}`).toBe(201);
  const body = await real.json();
  expect(body.ok).toBe(true);
  expect(body.name).toBe(name);
  expect(body.counts.design).toBe(1);
  expect(body.bytes.zip, '回执里的整包字节数与真的上传字节数不一致').toBe((await readFile(ZIP_PATH)).length);

  // 201 之后新项目就在列表里（这一句证明走的是同一条 domain 链，不是只回了个号）
  await page.goto('/');
  await expect(page.locator('[data-project-row]', { hasText: name })).toHaveCount(2);
});

/**
 * 界面上那一句"拒收了"要带证据：`issues` 逐条列出来，而服务端没给细节时**承认没给**。
 *
 * 这两半是同一根纪律（§159）的两面：只显 `reason` 的第一句，"清单与包内容对不上"这种话就无从下手；
 * 反过来自己补一句"大概是因为…"，界面就开始编话。所以这里两份包各测一面。
 */
test('§105 界面上的拒收：逐条细节原样列出来，服务端没给的就不补', async ({ page }) => {
  test.setTimeout(120_000);
  const junkPath = resolve('.scratch/import-junk-not-a-zip.zip');
  const noManifestPath = resolve('.scratch/import-valid-zip-no-manifest.zip');
  await writeFile(junkPath, Buffer.from('这一串不是 ZIP'));
  // 一份合法但没清单的 ZIP：用仓库里那个 store 写入器打，判据走的仍是服务端那一条
  await writeFile(noManifestPath, Buffer.from(zipStore([textEntry('README.txt', '说明')])));

  await page.goto('/');
  const before = await page.locator('[data-project-row]').count();

  await page.setInputFiles('[data-import-file]', junkPath);
  await expect(page.locator('[data-import-refused]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-import-refusal-reason]')).toContainText('ZIP 拒绝');
  // 这一条拒收只有一句话，没有逐条细节——界面就说"没给"，不补一句猜测
  await expect(page.locator('[data-import-refusal-issues]')).toHaveCount(0);
  await expect(page.locator('[data-import-refused]')).toContainText('服务端没给逐条细节');

  await page.setInputFiles('[data-import-file]', noManifestPath);
  await expect(page.locator('[data-import-refusal-reason]')).toContainText('没有 .nexus/manifest.json');
  await expect(page.locator('[data-import-refusal-issues] li')).toHaveCount(1);
  await expect(page.locator('[data-import-refusal-issues] li')).toContainText('只接受 Studio「导出」');

  // 两次拒收都不该留下新项目：列表的行数原地不动
  await expect(page.locator('[data-project-row]')).toHaveCount(before);
});

/**
 * 413 那一格：**真的发一份声明超过上限的包**。
 *
 * 这是 `docs/TESTING.md` 第 12 条最后欠着的一项，本页两处记过"没量"，理由写的是
 * "128MB 真字节会把这台 16GB 机器的空闲内存吃光"。
 *
 * **实测把那个理由的一半更正了**（2026-10-07，`.scratch/probe-413.mts` 走真 HTTP 量过）：
 * - 413 那条路**是真的**：声明 2GB → 拿到 `413 {"error":"too_large","reason":"整包 2048MB 超过导入上限 128MB"}`。
 * - 但**"早拒就省下正文"这个想法不成立**：服务端把 2GB 正文**全读掉了**（2GB / 10.8 秒），
 *   响应是在正文排完之后才到客户端的。所以路由里那句"读正文之前就比 content-length"
 *   只说明**判定**发生得早，不说明**字节**没被收下。
 * - 也不是"攒在内存里"：2GB 流式排掉、机器（空闲约 2.5GB）没有 OOM。
 *   所以那份"会把内存吃光"的顾虑对**这个写法**不成立，但"便宜"这个假设同样不成立。
 *
 * 因此这一条断言的判据不是"发了多少字节"，而是：**发一堆根本不是 ZIP 的字节，却拿到 413 而不是 415**
 * ——说明尺寸那一关排在"这是不是本平台的包"之前。
 *
 * 用 `node:http` 而不是 `page.request`：后者按实际正文自己算 `Content-Length`，
 * 而这一格要证的恰恰是**声明的那个数**就足以触发拒收。
 */
test('@smoke §144 413：声明超过上限的包在服务端读正文之前就被拒', async ({ page }) => {
  await createProject(page, `超限包 ${Date.now().toString(36)}`);
  const csrf = await page.evaluate(() => /nexus_csrf=([a-f0-9]+)/.exec(document.cookie)?.[1] ?? '');
  expect(csrf.length, '浏览器里没有 nexus_csrf cookie：双提交这一门没法量').toBeGreaterThan(8);

  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  // 128MB + 1：刚好过线就够，不声明 2GB——服务端会把正文全读掉（见文件头那段实测），
  // 声明多大就真推多大，2GB 会让这条用例白跑十几秒。
  //
  // 为什么不 import `IMPORT_MAX_ZIP_BYTES`：`e2e/tsconfig.json` 没有 `@/*` 的路径映射，
  // 一旦 import 了 `domain/import.ts`（它内部用 `@/lib/zip`）就把整条 web 侧依赖链拉进
  // e2e 的编译单元，typecheck 会红在别人没动过的文件上。
  // 这里写死一个数，并把"上限到底是多少"交给服务端那句话去说（下面匹配 `超过导入上限 <数字>MB`）。
  const declared = 128 * 1024 * 1024 + 1;
  const url = new URL(page.url());

  const result = await new Promise<{ status: number; body: { error?: string; reason?: string }; sent: number }>(
    (resolve, reject) => {
      let settled = false;
      const req = httpRequest(
        {
          hostname: url.hostname,
          port: url.port,
          path: '/api/projects/import',
          method: 'POST',
          headers: {
            cookie: cookieHeader,
            'x-csrf-token': csrf,
            'content-type': 'multipart/form-data; boundary=nexus413probe',
            'content-length': String(declared),
          },
        },
        (res) => {
          let raw = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            raw += chunk;
          });
          res.on('end', () => {
            if (settled) return;
            settled = true;
            let body: { error?: string; reason?: string } = {};
            try {
              body = JSON.parse(raw) as { error?: string; reason?: string };
            } catch {
              /* 不是 JSON 就留着空对象，断言会在 status/reason 上红 */
            }
            resolve({ status: res.statusCode ?? 0, body, sent });
          });
        },
      );
      let sent = 0;
      // 1MB 一块地推，收到响应就停——不把 2GB 攒在内存里。
      // **必须让出事件循环**：第一版是个同步 `while`，它在 Node 单线程里一路写到底，
      // 响应回调根本轮不到执行，于是"收到响应就停"从来没生效过（那一版实测把 2GB 全写完了，
      // 红在我自己那句 `sent < declared` 上）。这里每写一块 `await setImmediate` 一次。
      const chunk = Buffer.alloc(1024 * 1024);
      const pump = async (): Promise<void> => {
        while (!settled && sent < declared) {
          sent += chunk.length;
          if (req.write(chunk)) {
            await new Promise<void>((r) => setImmediate(r));
          } else {
            await new Promise<void>((r) => req.once('drain', () => r()));
          }
        }
        if (!settled && sent >= declared) req.end();
      };
      req.on('error', (error) => {
        // 服务端提前关连接是**预期**的（它已经拒了），只在还没拿到响应时才算失败
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
      void pump().catch(() => {
        // 写不进去 = 服务端已经把连接收了；响应那一路会给出结论
      });
    },
  );

  expect(result.status, `期望 413，拿到 ${result.status}：${JSON.stringify(result.body)}`).toBe(413);
  expect(result.body.error).toBe('too_large');
  // 上限由服务端自己报出来——测试不重抄那个数，所以上限改了这条不会说谎
  expect(result.body.reason).toMatch(/超过导入上限 \d+MB/);
  // **不是 415**：我们发的是 1MB 的零字节，根本不是 ZIP。拿到 413 而不是 415，
  // 说明**尺寸那一关在"这是不是本平台的包"之前就判了**——这一条才是这条用例真正的判据。
  expect(result.body.error).not.toBe('import_refused');
});
