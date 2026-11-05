import { expect, test } from "@playwright/test";
import { reusableMemberWithProject } from "./support/auth-session";

/**
 * §85 第四十八片：发布机检的 **review 态**。前三片把 clear / blocked 两种结论都量过了，
 * 唯独"挂人工复核"这一条从没上过表——而它恰恰是最容易被写成假话的一格：
 * review 的语义是"页面照样发出去，只是进人工队列"（§131 机检只升级不认证），
 * 文案要是照 clear 念（"没命中规则"）或者照 blocked 念（"没有发出去"），
 * 作者会得到与事实相反的结论：要么以为没人看，要么以为链接不可用。
 *
 * 造 review 的办法是真文档：给起手文档的一个文本节点写一句像官方身份的文案
 * （`risk.impersonation`，只挂人工不自动挡），走 `PUT /api/projects/:id` 这条用户保存路由，
 * 然后从界面上真点发布。四条判据：
 * 1. `[data-scan-decision]` 是 `review`，文案明说"挂人工复核"且"页面已发出去"；
 * 2. 发现项就是 `risk.impersonation`，位置指到写入的那个节点、引文是写进去的那句；
 * 3. 五条 limits 与结论同时在场（§159：没命中不等于合规，看不见的部分要一起说）；
 * 4. 公开地址真的能打开、访客真能看到那段文字——review 不是拦截。
 * **跑完在 `finally` 里把原文写回去并收回发布**：夹具项目会被同族用例反复发布，
 * 留着一句"官方客服"会让下一次机检一直挂人工。
 */

const EMAIL = "a11y-opened+fixture@nexus.test";
const PASSWORD = "e2e-secret-123";

test("§85 发布机检 review 态：挂人工也照发，公开地址真能开", async ({
  page,
}) => {
  test.setTimeout(360_000);
  const run = Date.now().toString(36);
  const { projectId } = await reusableMemberWithProject(
    page,
    EMAIL,
    PASSWORD,
    `发布复核夹具${run}`,
  );

  interface RawNode {
    text?: string;
    [key: string]: unknown;
  }
  await page.goto("/");
  const csrf =
    (await page.context().cookies()).find(
      (cookie) => cookie.name === "nexus_csrf",
    )?.value ?? "";
  const current = await page.request.get(`/api/projects/${projectId}`);
  expect(current.status(), `读取项目失败：${await current.text()}`).toBe(200);
  const doc = (await current.json()) as {
    document: { pages: { id: string; nodes: Record<string, RawNode> }[] };
  };
  const home = doc.document.pages[0]!;
  const nodeId = Object.keys(home.nodes).find(
    (id) =>
      typeof home.nodes[id]?.text === "string" &&
      (home.nodes[id]?.text ?? "").length > 0,
  );
  expect(
    nodeId,
    "起手文档里没有带文字的节点，造不出 impersonation 发现",
  ).toBeTruthy();
  const originalText = home.nodes[nodeId!]!.text as string;
  // 只挂人工的那一档：命中 `官方客服`，不碰任何硬红线，也不改变节点宽度
  home.nodes[nodeId!]!.text = "官方客服";
  const put = await page.request.put(`/api/projects/${projectId}`, {
    headers: { "x-csrf-token": csrf },
    data: doc.document,
  });
  expect(put.status(), `写入夹具文档失败：${await put.text()}`).toBe(200);

  try {
    await page.goto(`/studio/${projectId}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-canvas-frame] [data-node-id]", {
      timeout: 120_000,
    });

    const trigger = page.locator("[data-publish-open]");
    await trigger.focus();
    await page.keyboard.press("Enter");
    const panel = page.locator("[data-publish-panel]");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-publish-gate]")).toBeVisible({
      timeout: 120_000,
    });

    // 夹具项目可能带着上一轮的发布：先收回，保证下面那块结果来自这一次
    const resultBlock = page.locator("[data-publish-result]");
    if (await resultBlock.count()) {
      await page.locator("[data-publish-off]").click();
      await expect(resultBlock).toHaveCount(0, { timeout: 60_000 });
      await expect(trigger).toHaveText(/^发布$/, { timeout: 60_000 });
    }

    await page.locator("[data-publish-submit]").click();

    // ---- 结论：review，不是 clear 也不是 blocked
    const scanCard = page.locator("[data-publish-scan]");
    await expect(scanCard, "发布之后机检结论没画出来").toBeVisible({
      timeout: 120_000,
    });
    await expect(scanCard).toHaveAttribute("role", "status");
    const decision = page.locator("[data-scan-decision]");
    await expect(
      decision,
      "机检结论不是 review：夹具没造出 impersonation 发现，或判定被改坏",
    ).toHaveAttribute("data-scan-decision", "review");
    await expect(decision, "review 的文案没说要人看").toContainText(
      "挂人工复核",
    );
    await expect(
      decision,
      "review 的文案没说页面已经发出去——照 blocked 念会让作者以为链接不可用",
    ).toContainText("页面已发出去");

    // ---- 发现项：规则、位置、引文三样都要对得上这次写入
    const finding = page.locator('[data-scan-finding="risk.impersonation"]');
    await expect(finding, "没有 impersonation 这一条发现").toHaveCount(1);
    await expect(finding).toContainText("risk.impersonation");
    await expect(
      finding,
      `发现项的位置没指到写入的节点 ${nodeId}`,
    ).toContainText(`位置 ${nodeId!}`);
    await expect(finding, "发现项的引文不是写进去的那句").toContainText(
      "官方客服",
    );
    await expect(
      page.locator('[data-scan-finding="redline.minor_safety"]'),
    ).toHaveCount(0);

    // ---- limits 与结论一起出现：机检看不到的部分必须跟着说
    await expect(
      page.locator("[data-scan-limit]"),
      "机检的 limits 没跟结论一起列出来",
    ).toHaveCount(5);

    // ---- 结果块：真的发出去了
    await expect(
      resultBlock,
      "review 态下没有结果块：页面被当成 blocked 挡住了",
    ).toBeVisible({ timeout: 60_000 });
    await expect(resultBlock, "人工审核状态没跟着结果块说").toContainText(
      "人工审核还没看过这一版",
    );
    const url = page.locator("[data-publish-url]");
    await expect(url).toHaveCount(1);
    const href = await url.getAttribute("href");
    expect(href, `公开地址不是一个站内路由：${href}`).toMatch(
      /^\/n\/[a-z0-9]+\/.+/,
    );
    await expect(trigger).toHaveText(/已发布 v\d+/);
    await expect(page.locator("[data-publish-error]")).toHaveCount(0);
    await expect(page.locator("[data-publish-busy]")).toHaveCount(0);

    // ---- 公开页真的能开，访客真的看得到那段文字（review 不是拦截）
    const opened = await page.request.get(href!);
    expect(
      opened.status(),
      `review 态声称已发布，公开地址却打不开（HTTP ${opened.status()}）`,
    ).toBe(200);
    const html = await opened.text();
    expect(
      html,
      "公开页里没有那段被挂人工的文字：地址打开的可能是另一份快照",
    ).toContain("官方客服");

    // ---- 弹层自己不许被这条长文案撑出横向滚动（第四十六片定的口径）
    const overflow = await panel.evaluate(
      (el) => el.scrollWidth - el.clientWidth,
    );
    expect(
      overflow,
      `发布弹层出现了 ${overflow}px 横向溢出`,
    ).toBeLessThanOrEqual(2);

    await scanCard.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "screenshots/publish-review-decision.png" });
  } finally {
    // 写回原文：先离开 Studio（store 的旧稿会在卸载时盖回来），再走同一条保存路由
    await page.goto("/").catch(() => undefined);
    home.nodes[nodeId!]!.text = originalText;
    const restored = await page.request.put(`/api/projects/${projectId}`, {
      headers: { "x-csrf-token": csrf },
      data: doc.document,
    });
    expect(
      restored.status(),
      `还原夹具文档失败（留着"官方客服"会一直挂人工）：${await restored.text()}`,
    ).toBe(200);
    // 收回这一版：复核页不该留在夹具项目的公开地址上
    const off = await page.request.delete(
      `/api/projects/${projectId}/publish`,
      {
        headers: { "x-csrf-token": csrf },
      },
    );
    expect(off.status(), `收回复核页失败：${await off.text()}`).toBe(200);
  }
});
