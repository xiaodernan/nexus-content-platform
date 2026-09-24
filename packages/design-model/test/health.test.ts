import { describe, expect, it } from "vitest";
import {
  HEALTH_THRESHOLDS,
  MAX_FINDINGS,
  analyzeHealth,
  createDocument,
  createNode,
  createPage,
  formatHealthValue,
  type DesignDocument,
  type HealthCheck,
  type HealthId,
} from "../src";

/**
 * §178 项目健康 / §179 Quality Gate 的判分测试。
 *
 * 重点不是"算得出数"，而是三件容易造假的事：
 * 没测的行必须是 not-run（不能拿 100 分冒充通过）、分数真的来自发现、
 * 门禁只挡往外公开的方向。
 */

function blankDoc(): DesignDocument {
  const document = createDocument("健康度");
  const page = createPage("Home");
  document.pages = [page];
  document.activePageId = page.id;
  // 背景与文字都写死成已知值：断言比值时不必猜默认主题
  setToken(document, "color.background", "#ffffff");
  setToken(document, "color.text", "#111111");
  // 一个可读的正文节点：什么都没有的文档过的是"空内容"那条 error，不是干净
  add(document, "text", { name: "Body" });
  return document;
}

/** 把正文换成低对比度颜色：#aaaaaa on #ffffff = 2.32:1，16px 正文过不了 4.5:1 */
function makeLowContrast(document: DesignDocument): void {
  setToken(document, "color.text", "#aaaaaa");
}

function setToken(document: DesignDocument, key: string, value: unknown): void {
  const token = document.tokens.find((t) => t.key === key);
  if (!token) throw new Error(`默认 token 表里找不到 ${key}`);
  token.value = value;
  token.modes = undefined;
}

function add(
  document: DesignDocument,
  type: "text" | "button" | "image",
  // 这里刻意不带 type：type 由上一个参数给。写成 CreateNodeInput 的话，
  // 每个调用点都得塞一个假的 type。
  overrides: Omit<Parameters<typeof createNode>[0], "type"> = {},
): string {
  const page = document.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const node = createNode({
    type,
    name: overrides.name ?? type,
    parentId: root.id,
    text: type === "text" || type === "button" ? "一句话" : undefined,
    ...overrides,
  });
  if (type === "text") node.style.fills = [{ kind: "solid", color: "{color.text}" }];
  page.nodes[node.id] = node;
  root.children.push(node.id);
  return node.id;
}

const row = (report: ReturnType<typeof analyzeHealth>, id: HealthId): HealthCheck =>
  report.checks.find((c) => c.id === id)!;

describe("analyzeHealth（§178 七行 + §179 门禁）", () => {
  it("七行齐全，没跑的两行如实标成未评估", () => {
    const report = analyzeHealth(blankDoc());
    expect(report.checks.map((c) => c.id)).toEqual([
      "build",
      "tests",
      "accessibility",
      "performance",
      "visual-qa",
      "ai-qa",
      "security",
    ]);
    expect(report.notRun).toEqual(["Tests", "AI QA"]);
    for (const id of ["tests", "ai-qa"] as const) {
      const check = row(report, id);
      expect(check.state).toBe("not-run");
      expect(check.score).toBeNull();
      expect(check.gating).toBe(false);
      expect(formatHealthValue(check)).toBe("未评估");
    }
    // 未评估不参与判定：干净文档仍然是"可发布"
    expect(report.passed).toBe(true);
    expect(report.blockers).toEqual([]);
  });

  it("分数由真实发现换算：一条 warning 扣 6 分", () => {
    const document = blankDoc();
    makeLowContrast(document);
    const check = row(analyzeHealth(document), "accessibility");
    expect(check.findings.map((f) => f.code)).toEqual(["low-contrast"]);
    expect(check.score).toBe(94);
    expect(check.state).toBe("pass");
    expect(check.findings[0]!.message).toContain("2.32:1");
  });

  it("卡在门槛上：3 条 warning 通过，4 条就挡发布", () => {
    const pass = blankDoc();
    add(pass, "text");
    add(pass, "text");
    makeLowContrast(pass);
    const passReport = analyzeHealth(pass);
    expect(row(passReport, "accessibility").score).toBe(100 - 6 * 3);
    expect(HEALTH_THRESHOLDS.accessibility).toBe(80);
    expect(row(passReport, "accessibility").state).toBe("pass");
    expect(passReport.passed).toBe(true);

    const fail = blankDoc();
    add(fail, "text");
    add(fail, "text");
    add(fail, "text");
    makeLowContrast(fail);
    const failReport = analyzeHealth(fail);
    expect(row(failReport, "accessibility").score).toBe(76);
    expect(row(failReport, "accessibility").state).toBe("fail");
    expect(failReport.passed).toBe(false);
    expect(failReport.blockers.join("")).toContain("Accessibility 76 分，低于门槛 80");
  });

  it("空白文档按 error 挡下：发布出去是一片空白（老 gate 的唯一实质检查搬到这里）", () => {
    const document = blankDoc();
    document.pages = [];
    document.activePageId = "";
    const report = analyzeHealth(document);
    const check = row(report, "build");
    expect(check.state).toBe("fail");
    expect(check.findings.some((f) => f.code === "empty-page")).toBe(true);
    expect(report.passed).toBe(false);
    expect(report.blockers.join("")).toContain("页面里还没有可见内容");
  });

  it("error 级发现一票否决，不看分数线", () => {
    const document = blankDoc();
    const id = add(document, "text");
    document.pages[0]!.nodes[id]!.bindings = [
      { property: "text", source: "variable", expression: "  ", fallback: "" },
    ];
    const report = analyzeHealth(document);
    // bad-binding 落在 build 行：threshold 为 null，只要有一条 error 就是 fail
    expect(row(report, "build").threshold).toBeNull();
    expect(row(report, "build").score).toBe(75);
    expect(row(report, "build").state).toBe("fail");
  });

  it("越出画布算视觉问题，不算结构坏掉", () => {
    const document = blankDoc();
    // 竖排容器里先垫一个超高块，后面的正文就被推到画布下方
    add(document, "text", { size: { width: "fill", height: 1200 } });
    add(document, "text", { name: "推到画布外" });
    const report = analyzeHealth(document);
    const visual = row(report, "visual-qa");
    expect(visual.findings.map((f) => f.code)).toContain("off-canvas");
    expect(row(report, "build").findings).toEqual([]);
    expect(row(report, "build").state).toBe("pass");
  });

  it("点击目标过小要靠真实排版：健康层自己解析布局，服务端也能抓到", () => {
    const document = blankDoc();
    add(document, "button", {
      size: { width: 20, height: 20 },
      style: { fills: [{ kind: "solid", color: "{color.primary}" }] },
    });
    const a11y = row(analyzeHealth(document), "accessibility");
    expect(a11y.findings.map((f) => f.code)).toContain("tap-target-small");
  });

  it("发现太多时截断展示，但扣分按全量算、剩下的计数", () => {
    const document = blankDoc();
    for (let i = 1; i < MAX_FINDINGS + 5; i += 1) add(document, "text");
    makeLowContrast(document);
    const check = row(analyzeHealth(document), "accessibility");
    expect(check.findings.length).toBe(MAX_FINDINGS);
    expect(check.omitted).toBe(5);
    expect(check.score).toBe(0);
  });

  it("疑似凭据只报位置，绝不把内容抄进报告", () => {
    const document = blankDoc();
    const secret = "fake-not-a-real-key-0123456789";
    const id = add(document, "text", { text: `api_key: "${secret}"` });
    const security = row(analyzeHealth(document), "security");
    expect(security.state).toBe("fail");
    const finding = security.findings.find((f) => f.code === "credential-text");
    expect(finding?.message).toContain("内容已脱敏");
    expect(JSON.stringify(security)).not.toContain(secret);
    expect(finding?.nodeId).toBe(id);
  });

  it("http 明文外链算 warning，localhost 不算", () => {
    const clean = blankDoc();
    add(clean, "text", { text: "本地 http://localhost:3100/api 没问题" });
    expect(row(analyzeHealth(clean), "security").findings).toEqual([]);

    const dirty = blankDoc();
    add(dirty, "text", { text: "去看 http://example.com/pricing" });
    const security = row(analyzeHealth(dirty), "security");
    expect(security.findings.map((f) => f.code)).toEqual(["insecure-url"]);
    expect(security.state).toBe("pass"); // warning 不挡 error 一票否决线
  });

  it("父子引用坏掉时健康层不崩，问题归到 build 行", () => {
    const document = blankDoc();
    const id = add(document, "text");
    document.pages[0]!.nodes[id]!.parentId = "frame-不存在";
    const report = analyzeHealth(document);
    expect(report.checks.length).toBe(7);
    expect(row(report, "build").state).toBe("fail");
    expect(row(report, "build").findings.map((f) => f.code)).toContain("orphan-node");
  });
});
