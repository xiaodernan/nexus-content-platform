import { expect, test, type Page } from '@playwright/test';
import { createProjectNamed, registerMember } from './support/auth-session';

/**
 * §188 M8 的真浏览器那一寸：凭据不是"看起来配好了"，而是**真发一次 HTTP 拿回真 JSON**。
 *
 * 三条只有浏览器能证明的事：
 * - 页面上那几个"试一下"按钮打的是真 `/api/v1/*`（不是把 fetch 换成读本地状态），
 *   所以断言的是 HTTP 状态码与真读回来的项目名/节点数；
 * - 明文只给一次：刷新之后整页文本里再也找不到那串凭据（库里存的是哈希，界面不能假装还能看）；
 * - 吊销是真生效的：吊销之后再拿同一串明文去问，服务端答 401 `revoked_token`，不是"界面上标灰了"。
 *
 * scope 的边界也在真 HTTP 上量：只给 `projects:read` 的凭据问 `/design` 得到 403，
 * 与"没这枚凭据"的 401 是两句不同的话——这两句混起来，配置错误就没法自证。
 *
 * 第二片把写端点接上之后，这里多量的是四件（都不是集成测试那层能证明的）：
 * 页面上那颗"会真的加一个节点"的按钮确实在文档上留下了一个节点（随后的 GET 数得出来，
 * 而面板上那句"文档现在 N 个节点"里的 N 与 GET 回来的一致——不是它自己加的），
 * 删除类 op 在公网这一侧得到的是 409 `approval_required` 而**文档一个节点都没少**，
 * 只给读权限的凭据发 PATCH 是 403 而不是 405/200（同一句 403 面板原样贴出来，不替它美化），
 * 缺 summary 的报文在门口就是 400。
 */

async function createProjectAsGuest(page: Page, name: string): Promise<void> {
  await createProjectNamed(page, name);
}

async function register(page: Page, email: string, password: string): Promise<void> {
  await registerMember(page, email, password);
}

/** 在页面上下文里真发一次带 Bearer 的请求，返回状态码与报文里的 error（不是 fetch 的模拟） */
async function getV1(page: Page, path: string, token: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return page.evaluate(
    async ([p, t]) => {
      const res = await fetch(p as string, { headers: { authorization: `Bearer ${t as string}` }, cache: 'no-store' });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body };
    },
    [path, token],
  );
}

/** 在页面上下文里真发一次带 Bearer 的 PATCH，返回状态码与原样报文（写端点那一格） */
async function patchV1(
  page: Page,
  path: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return page.evaluate(
    async ([p, t, b]) => {
      const res = await fetch(p as string, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t as string}` },
        body: JSON.stringify(b),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body: json };
    },
    [path, token, body],
  );
}

/** GET …/design 回来那份文档的形状：只到测试要用的那一层，节点的权威形状仍在 design-model */
type DocShape = { pages: { id: string; rootId: string; nodes: Record<string, { name?: string; type?: string }> }[] };

function allNodes(doc: DocShape): { id: string; name?: string; pageId: string; isRoot: boolean }[] {
  return doc.pages.flatMap((p) =>
    Object.entries(p.nodes).map(([id, n]) => ({ id, name: n.name, pageId: p.id, isRoot: id === p.rootId })),
  );
}

/** 这一页的根节点 id：从 GET 回来的那份文档里取，不写死一个"page-root" */
function rootOf(doc: DocShape, pageId: string): string {
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page?.rootId) throw new Error(`文档里没有这一页（或它没有根节点）：${pageId}`);
  return page.rootId;
}

/** 面板里签发一枚凭据并返回页面上显示的那串明文 */
async function issue(page: Page, name: string, scopes: string[]): Promise<string> {
  await page.fill('[data-token-name]', name);
  // 勾选框是照着 API_TOKEN_SCOPES 渲染出来的，所以这里遍历页面上真实存在的那些，
  // 而不是把名单再抄一份到测试里（抄一份就会漂：测试给的是 design:write，界面上根本没有那一格）
  const boxes = page.locator('[data-token-scope]');
  const count = await boxes.count();
  expect(count, '面板上一个 scope 勾选框都没渲染出来：这不是"没勾中"，是这一格根本没出现').toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const box = boxes.nth(i);
    const scope = await box.getAttribute('data-token-scope');
    if (scopes.includes(scope ?? '') !== (await box.isChecked())) await box.click();
  }
  // 最后要求"勾上的正好是我要的那几格"：名字打错了在这里红，而不是悄悄发出一枚更窄的凭据
  const checked: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const box = boxes.nth(i);
    if (await box.isChecked()) checked.push((await box.getAttribute('data-token-scope')) ?? '');
  }
  expect(checked.sort()).toEqual([...scopes].sort());
  await page.click('[data-token-create]');
  await expect(page.locator('[data-token-issued]')).toBeVisible({ timeout: 20_000 });
  return (await page.locator('[data-token-plain]').innerText()).trim();
}

test('@smoke 凭据：签发 → 真 HTTP 读到项目 → scope 不够 403 → 吊销后 401 → 明文不再可见', async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-api-${Date.now().toString(36)}@nexus.test`;
  await createProjectAsGuest(page, `凭据样本 ${Date.now().toString(36)}`);
  await register(page, email, 'e2e-secret-123');

  await page.goto('/api-tokens');
  await expect(page.locator('[data-api-tokens-page]')).toBeVisible();
  // 新账号：这里说的是"还没有发过"，不是读失败
  await expect(page.locator('[data-token-empty]')).toBeVisible({ timeout: 20_000 });

  // 1) 只给 projects:read 的一枚：清单读得到，设计文档那一格是 403
  const narrow = await issue(page, 'CI 只读清单', ['projects:read']);
  expect(narrow.startsWith('nexus_pat_')).toBe(true);
  const list = await getV1(page, '/api/v1/projects', narrow);
  expect(list.status).toBe(200);
  const projects = (list.body.projects ?? []) as { id: string; name: string }[];
  expect(projects.length).toBeGreaterThanOrEqual(1);
  expect(projects[0]!.name).toContain('凭据样本');
  expect(JSON.stringify(list.body)).not.toContain(narrow); // 响应里不回带凭据

  const design = await getV1(page, `/api/v1/projects/${projects[0]!.id}/design`, narrow);
  expect(design.status).toBe(403);
  expect(design.body.error).toBe('insufficient_scope');
  expect(String(design.body.message)).toContain('design:read');

  // 2) 两格都给的一枚：页面上那两个"试一下"按钮发的是真请求，状态码原样贴出来
  const wide = await issue(page, 'CI 读文档', ['projects:read', 'design:read']);
  await page.click('[data-try-list]');
  await expect(page.locator('[data-try-status]')).toHaveAttribute('data-try-status', '200', { timeout: 20_000 });
  await expect(page.locator('[data-try-status]')).toContainText('凭据样本');

  await page.click('[data-try-design]');
  await expect(page.locator('[data-try-status]')).toHaveAttribute('data-try-status', '200', { timeout: 20_000 });
  await expect(page.locator('[data-try-status]')).toContainText('个节点（库里那一份）');
  const wideDesign = await getV1(page, `/api/v1/projects/${projects[0]!.id}/design`, wide);
  expect(wideDesign.status).toBe(200);
  expect(wideDesign.body.source).toBe('database');
  expect(Number(wideDesign.body.nodeCount)).toBeGreaterThanOrEqual(1);

  await page.screenshot({ path: 'screenshots/api-tokens-issued.png', fullPage: true });

  // 3) 吊销那枚宽 scope 的凭据：行留着并标"已吊销"，而真 HTTP 从此只给 401
  const revokedRow = page.locator('[data-token-row]').filter({ hasText: 'CI 读文档' }).first();
  await revokedRow.locator('[data-token-revoke]').click();
  await expect(revokedRow.locator('[data-token-status]')).toHaveAttribute('data-token-status', 'revoked', { timeout: 20_000 });
  await expect(page.locator('[data-token-note]')).toContainText('401 revoked_token');
  const afterRevoke = await getV1(page, '/api/v1/projects', wide);
  expect(afterRevoke.status).toBe(401);
  expect(afterRevoke.body.error).toBe('revoked_token');
  // 没吊销的那一枚不受影响：吊销是按枚，不是按人
  expect((await getV1(page, '/api/v1/projects', narrow)).status).toBe(200);

  // 4) 刷新之后，页面上任何地方都不该再出现那两串明文（库里只有哈希，界面不能假装还能看）
  await page.reload();
  await expect(page.locator('[data-api-tokens-page]')).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).not.toContain(wide.slice(-12));
  expect(body).not.toContain(narrow.slice(-12));
  // 而列表读得回来：两行都在，其中一行是吊销状态
  await expect(page.locator('[data-token-row]')).toHaveCount(2);
  await expect(page.locator('[data-token-status="revoked"]')).toHaveCount(1);
  await page.screenshot({ path: 'screenshots/api-tokens-after-reload.png', fullPage: true });
});

test('@smoke 公开 API 的写端点：面板那颗按钮真加一个节点，删除类 op 回 409 且一个节点都没少', async ({ page }) => {
  test.setTimeout(240_000);
  const email = `e2e-api-write-${Date.now().toString(36)}@nexus.test`;
  const projectName = `写入样本 ${Date.now().toString(36)}`;
  await createProjectAsGuest(page, projectName);
  await register(page, email, 'e2e-secret-123');

  await page.goto('/api-tokens');
  await expect(page.locator('[data-api-tokens-page]')).toBeVisible();

  // 三格都给的一枚：后面每一个期望数字都是从库里那份读回来的，不是测试自己算的
  const writer = await issue(page, 'CI 写文档', ['projects:read', 'design:read', 'design:write']);
  const list = await getV1(page, '/api/v1/projects', writer);
  expect(list.status).toBe(200);
  const listed = (list.body.projects ?? []) as { id: string; name: string }[];
  const project = listed.find((p) => p.name.includes('写入样本'));
  expect(project, `清单里没有刚建的那个项目（读回来的名字：${JSON.stringify(listed.map((p) => p.name))}）`).toBeDefined();
  const path = `/api/v1/projects/${project!.id}/design`;

  const before = await getV1(page, path, writer);
  expect(before.status).toBe(200);
  expect(before.body.source).toBe('database');
  const nodeCountBefore = Number(before.body.nodeCount);
  expect(Number.isInteger(nodeCountBefore)).toBe(true);

  // 1) 页面上那颗"会真的加一个节点"：状态码、它报的节点数、以及随后 GET 回来的节点数三者要一致
  await page.click('[data-try-list]');
  await expect(page.locator('[data-try-status]')).toHaveAttribute('data-try-status', '200', { timeout: 20_000 });
  await page.click('[data-try-patch]');
  await expect(page.locator('[data-try-status]')).toHaveAttribute('data-try-status', '200', { timeout: 30_000 });
  const panelLine = await page.locator('[data-try-status]').innerText();
  expect(panelLine).toMatch(/历史里落了一条带补丁清单的记录/);
  const panelCount = Number(panelLine.match(/文档现在 (\d+) 个节点/)?.[1]);
  expect(panelCount, `面板那句里没有节点数：${panelLine}`).toBe(nodeCountBefore + 1);
  await page.screenshot({ path: 'screenshots/api-write-panel.png', fullPage: true });

  const afterPanel = await getV1(page, path, writer);
  expect(Number(afterPanel.body.nodeCount)).toBe(panelCount); // 面板报的数是库里那个，不是它自己加的
  const writtenNodes = allNodes(afterPanel.body.document as DocShape).filter((n) => n.name === '公开 API 写的');
  expect(writtenNodes.length).toBe(1);
  const writtenNode = writtenNodes[0]!;

  // 2) 删除类 op：公网这一侧没有人能批准，所以是 409 拒，且文档一个节点都没少（不是"删了一半"）
  const removeAttempt = await patchV1(page, path, writer, {
    summary: '试着删掉刚写入的那个节点',
    pageId: writtenNode.pageId,
    ops: [{ op: 'remove', nodeId: writtenNode.id }],
  });
  expect(removeAttempt.status).toBe(409);
  expect(removeAttempt.body.error).toBe('approval_required');
  expect(String(removeAttempt.body.message)).toContain('remove');
  const afterRemoveAttempt = await getV1(page, path, writer);
  expect(Number(afterRemoveAttempt.body.nodeCount)).toBe(nodeCountBefore + 1);
  expect(
    allNodes(afterRemoveAttempt.body.document as DocShape).some((n) => n.id === writtenNode.id),
    '409 说"一条都没写"，但那个节点已经不在了',
  ).toBe(true);

  // 3) 只有读权限的那一枚发 PATCH：403 insufficient_scope，且它连一个节点都没能加上
  const readOnly = await issue(page, 'CI 只读文档', ['projects:read', 'design:read']);
  const docNow = afterRemoveAttempt.body.document as DocShape;
  const rootId = rootOf(docNow, writtenNode.pageId);
  const sourceNode = docNow.pages.find((p) => p.id === writtenNode.pageId)!.nodes[writtenNode.id]!;
  const denied = await patchV1(page, path, readOnly, {
    summary: '只读凭据尝试写入',
    pageId: writtenNode.pageId,
    ops: [{ op: 'insert', node: { ...sourceNode, id: `e2e-copy-${Date.now().toString(36)}`, name: '只读凭据想写的', parentId: rootId, children: [] }, parentId: rootId }],
  });
  expect(denied.status).toBe(403);
  expect(denied.body.error).toBe('insufficient_scope');
  expect(String(denied.body.message)).toContain('design:write');
  expect(Number((await getV1(page, path, writer)).body.nodeCount)).toBe(nodeCountBefore + 1);

  // 界面那一侧同样不美化：面板那颗按钮把同一句 403 原样贴出来，而不是报"成功"或一句含糊的失败
  await expect(page.locator('[data-try-patch]')).toBeEnabled({ timeout: 20_000 });
  await page.click('[data-try-patch]');
  await expect(page.locator('[data-try-status]')).toHaveAttribute('data-try-status', '403', { timeout: 20_000 });
  await expect(page.locator('[data-try-status]')).toContainText('insufficient_scope');
  await page.screenshot({ path: 'screenshots/api-write-refusals.png', fullPage: true });

  // 4) 报文在门口就是 400：缺 summary 与空 ops 都进不了事务，所以也没有任何半写
  const noSummary = await patchV1(page, path, writer, { pageId: writtenNode.pageId, ops: [{ op: 'remove', nodeId: writtenNode.id }] });
  expect(noSummary.status).toBe(400);
  expect(noSummary.body.error).toBe('invalid_patch');
  expect(String(noSummary.body.message)).toContain('summary');
  const emptyOps = await patchV1(page, path, writer, { summary: '空补丁', pageId: writtenNode.pageId, ops: [] });
  expect(emptyOps.status).toBe(400);
  expect(emptyOps.body.error).toBe('invalid_patch');
  expect(String(emptyOps.body.message)).toContain('ops');
  expect(Number((await getV1(page, path, writer)).body.nodeCount)).toBe(nodeCountBefore + 1);
});

/**
 * §188 M8 第三片：把「哪一枚凭据在什么时候读了哪一份文档」在真浏览器里读到眼里。
 *
 * 集成测试能证明库里那几行，证明不了这四件只有页面能说的话：
 * - 刚发出来的凭据那一格写的是「还没读过东西」，而不是读失败时那句「—」——
 *   两者混起来，一次拉取失败就会在界面上被读成"这个人在公网上一格都没读过"（§73 同一形状）；
 * - 三次连续读在面板上**不出现三行**：合并是在库里做的，界面上要看得境合并的结果，
 *   而次数合计必须还是 3（合并不许把次数合掉）；
 * - 读到的那一份文档是按名字出现在那一行的，不是只有端点名——"读过哪一份"是这一片的目的；
 * - 被 403 拒掉的那一次**不进账**：同一枚凭据的清单读在账上，文档那一格一行都没有。
 */
test('@smoke 访问账：读过哪几份落在凭据那一行上，次数按分钟合并且合计不丢，被拒的那一次不进账', async ({ page }) => {
  test.setTimeout(240_000);
  const email = `e2e-api-ledger-${Date.now().toString(36)}@nexus.test`;
  const projectName = `访问账样本 ${Date.now().toString(36)}`;
  await createProjectAsGuest(page, projectName);
  await register(page, email, 'e2e-secret-123');

  await page.goto('/api-tokens');
  await expect(page.locator('[data-api-tokens-page]')).toBeVisible();

  const wide = await issue(page, 'CI 读三遍', ['projects:read', 'design:read']);
  const wideRow = page.locator('[data-token-row]').filter({ hasText: 'CI 读三遍' }).first();
  // 这一句是"空账"那一格：读成功且确实 0 次才写这句，读失败写的是「—」
  await expect(wideRow.locator('[data-token-access]')).toContainText('还没读过东西', { timeout: 20_000 });

  const list = await getV1(page, '/api/v1/projects', wide);
  expect(list.status).toBe(200);
  const listed = (list.body.projects ?? []) as { id: string; name: string }[];
  const project = listed.find((p) => p.name.includes('访问账样本'));
  expect(project, `清单里没有刚建的那个项目：${JSON.stringify(listed.map((p) => p.name))}`).toBeDefined();
  const designPath = `/api/v1/projects/${project!.id}/design`;

  // 三次清单读连着发：正常的合并结果是一到两行（跨不跨分钟边界都可能），但绝不会是三行
  for (let i = 0; i < 2; i += 1) expect((await getV1(page, '/api/v1/projects', wide)).status).toBe(200);
  expect((await getV1(page, designPath, wide)).status).toBe(200);

  // 只给清单权限的那一枚：清单读进账，文档那一格是 403 且不许留下任何痕迹
  const narrow = await issue(page, 'CI 被拒的那次', ['projects:read']);
  expect((await getV1(page, '/api/v1/projects', narrow)).status).toBe(200);
  const denied = await getV1(page, designPath, narrow);
  expect(denied.status).toBe(403);

  await page.reload();
  await expect(page.locator('[data-api-tokens-page]')).toBeVisible();

  /**
   * 面板上某一枚凭据的账：端点名取 `data-access-line`（全串，不会被列宽裁掉），次数取行文本里的 ×N。
   * 返回的是**每一条渲染出来的行**，不是按端点合过的一张表——合并这件事正是这一片要量的对象，
   * 在测试里先合一次就没得量了（同一个端点散成三行与合成一行，在合过的表里长得一样）。
   */
  const ledger = async (rowText: string) => {
    const cell = page.locator('[data-token-row]').filter({ hasText: rowText }).first().locator('[data-token-access]');
    // 「—」是那一本没读到；读到 0 次写的是「还没读过东西」。这里要的是后者
    await expect(cell).not.toContainText('—', { timeout: 20_000 });
    const lines = cell.locator('[data-access-line]');
    const n = await lines.count();
    const out: { endpoint: string; calls: number; text: string }[] = [];
    for (let i = 0; i < n; i += 1) {
      const line = lines.nth(i);
      const text = await line.innerText();
      out.push({
        endpoint: (await line.getAttribute('data-access-line')) ?? '',
        // 数不出来就是 0，让下面的合计去红，而不是在这里编一个数
        calls: Number(text.match(/×(\d+)/)?.[1] ?? 0),
        text,
      });
    }
    return { cell, lines: out };
  };
  const ofEndpoint = (book: { lines: { endpoint: string; calls: number }[] }, endpoint: string) =>
    book.lines.filter((l) => l.endpoint === endpoint);

  const wideLedger = await ledger('CI 读三遍');
  expect([...new Set(wideLedger.lines.map((l) => l.endpoint))].sort()).toEqual([
    'GET /api/v1/projects',
    'GET /api/v1/projects/[projectId]/design',
  ]);
  const listLines = ofEndpoint(wideLedger, 'GET /api/v1/projects');
  // 三次连着读最多落在两行上：每次调用各写一行就会在这里变成三行（"账本变流水"那条退路）；
  // 落两行只是这一次跑跨了分钟边界，不是缺陷，所以行数不设下限。
  expect(listLines.length, `三次连着读散成了 ${listLines.length} 行：${JSON.stringify(listLines.map((l) => l.calls))}`).toBeLessThanOrEqual(2);
  // 合并不许把次数合掉：落在几行都不要紧，加起来还是 3
  expect(listLines.reduce((s, l) => s + l.calls, 0)).toBe(3);
  expect(ofEndpoint(wideLedger, 'GET /api/v1/projects/[projectId]/design').map((l) => l.calls)).toEqual([1]);
  // 「读过哪一份」要看得见项目名，而不是只有端点名
  await expect(wideLedger.cell).toContainText('访问账样本');
  await page.screenshot({ path: 'screenshots/api-access-ledger.png', fullPage: true });

  const narrowLedger = await ledger('CI 被拒的那次');
  // 那一枚只成功读过清单：账上只有这一格。多出来的那一行就是"被 403 拒掉的读也进了读过什么"
  expect(
    narrowLedger.lines.map((l) => `${l.endpoint}×${l.calls}`),
    `被拒的那一次在账上留了东西：${JSON.stringify(narrowLedger.lines)}`,
  ).toEqual(['GET /api/v1/projects×1']);
});

test('@smoke 凭据页对游客不可达（账号还没认出来，就没有可管的凭据）', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/api-tokens');
  // 服务端把游客退回首页：这里断言的是"落到了首页且身份仍是游客"，不是一句 302
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'guest', { timeout: 20_000 });
  await expect(page.locator('[data-api-tokens-page]')).toHaveCount(0);
});
