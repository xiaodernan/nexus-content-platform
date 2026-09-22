/**
 * §178 项目健康 / §179 Quality Gate 的打分层。
 *
 * 这一层不重新发明检查规则：结构与设计体检沿用 `validateDocument` + `lintDesign`
 * 的真实发现，这里补上只有设计模型就能静态算出的性能与安全指标，然后把所有发现
 * 归进 §178 那七行并换算成 0-100。
 *
 * 关键取舍（§159）：测不了的一律 `score = null`、`gating = false`，UI 显示"未评估"。
 * Tests 与 AI QA 至今没有任何能本地算出来的真信号，给它们打个 100 就是假绿，
 * 而那正是这一项存在的理由——发布前让人看见哪里还没被检查过。
 */

import type { DesignDocument, DesignNode, Page } from "./types";
import { lintDesign, validateDocument, type Issue, type IssueCode } from "./validate";
import { resolveLayout, type ResolvedLayout } from "./layout";
import { TokenStore } from "./tokens";

export type HealthId =
  | "build"
  | "tests"
  | "accessibility"
  | "performance"
  | "visual-qa"
  | "ai-qa"
  | "security";

export interface HealthMetric {
  label: string;
  value: string;
}

export type HealthState = "pass" | "fail" | "not-run";

export interface HealthCheck {
  id: HealthId;
  label: string;
  /** 0-100；null = 这一项没测（不参与门禁，也不假装通过） */
  score: number | null;
  /** §179：不达阈值就挡 Publish */
  gating: boolean;
  /** null 表示这一项按"有无 error 级发现"判定，而不是按分数线 */
  threshold: number | null;
  /** `not-run` 是第三种状态：既不是通过也不是失败，UI 不许把它渲染成绿勾 */
  state: HealthState;
  /** 这项到底看了什么，UI 原样显示，别让分数来历不明 */
  basis: string;
  /** 最多 MAX_FINDINGS 条，够读懂就行 */
  findings: Issue[];
  /** 被截掉的那几条的数量：不藏问题，只是不把整百条塞进报文 */
  omitted: number;
  metrics: HealthMetric[];
}

export interface HealthReport {
  checks: HealthCheck[];
  passed: boolean;
  /** 挡住发布的原因，每条都能读：哪项不达标、差在哪个节点 */
  blockers: string[];
  /** 尚未运行/无法评估的行，如实列出来（§178 里显示为"未评估"） */
  notRun: string[];
}

/** 一条检查最多带出多少条发现（报文尺寸上限，不是隐藏问题：剩下的计进 omitted） */
export const MAX_FINDINGS = 40;

/** 一条发现的扣分。error 一票否决门禁，所以扣分比 warning 大一个量级 */
const PENALTY: Record<Issue["severity"], number> = {
  error: 25,
  warning: 6,
  info: 1,
};

const BUILD_CODES: IssueCode[] = [
  "orphan-node",
  "missing-child",
  "cycle",
  "duplicate-id",
  "empty-page",
  "invalid-node-type",
  "bad-binding",
  "missing-token",
  "unreachable-node",
];
const A11Y_CODES: IssueCode[] = [
  "low-contrast",
  "missing-alt",
  "no-text-on-button",
  "tap-target-small",
];
const VISUAL_CODES: IssueCode[] = [
  "hardcoded-style",
  "unused-token",
  "off-px-spacing",
  "off-canvas",
  "zero-size",
];
const PERF_CODES: IssueCode[] = [
  "node-count",
  "tree-depth",
  "asset-bytes",
  "image-no-dims",
  "animation-count",
  "page-count",
];
const SECURITY_CODES: IssueCode[] = ["credential-text", "unsafe-code", "insecure-url"];

/**
 * 门槛线。定在这里而不是散在各处，是为了让"为什么被挡"有唯一答案。
 * 80 / 70 / 60 各自对应：少量对比度或 alt 缺失可容忍，成片失守才挡；
 * 性能是静态预算（节点数、体积、缺尺寸位图），不是 LCP 实测，所以线放得更松。
 */
export const HEALTH_THRESHOLDS = {
  accessibility: 80,
  performance: 70,
  "visual-qa": 60,
} as const;

export interface HealthOptions {
  /** 传入已解析的几何可避免调用方重复跑排版；缺省时本函数自己解 */
  layouts?: Record<Page["id"], ResolvedLayout>;
}

/** §178 的七行 + §179 的门禁判定，全部由这一处算出来 */
export function analyzeHealth(
  document: DesignDocument,
  options: HealthOptions = {},
): HealthReport {
  const layouts = options.layouts ?? resolvePages(document);
  const sizeMap: Record<string, { width: number; height: number }> = {};
  for (const layout of Object.values(layouts)) {
    for (const [id, r] of Object.entries(layout.nodes)) {
      sizeMap[id] = { width: r.width, height: r.height };
    }
  }

  // 把真实尺寸喂给 lintDesign：不给的话"点击目标过小"这条规则在服务端永远不触发
  const design = lintDesign(document, sizeMap);
  const findings = [
    ...validateDocument(document),
    ...design,
    ...collectStaticIssues(document, layouts),
  ];

  const rows: Array<{
    id: HealthId;
    label: string;
    codes: IssueCode[];
    threshold: number | null;
    gating: boolean;
    basis: string;
    metrics: HealthMetric[];
  }> = [
    {
      id: "build",
      label: "Build",
      codes: BUILD_CODES,
      threshold: null,
      gating: true,
      basis: "设计模型自洽：父子引用可达、无环、无重复 id、token 引用都能解析",
      metrics: [
        { label: "页面", value: String(document.pages.length) },
        {
          label: "节点",
          value: String(document.pages.reduce((n, p) => n + Object.keys(p.nodes).length, 0)),
        },
      ],
    },
    {
      id: "tests",
      label: "Tests",
      codes: [],
      threshold: null,
      gating: false,
      basis: "未评估：项目没有自己的测试可跑，跑不了就是跑不了，不填数",
      metrics: [],
    },
    {
      id: "accessibility",
      label: "Accessibility",
      codes: A11Y_CODES,
      threshold: HEALTH_THRESHOLDS.accessibility,
      gating: true,
      basis: "文本对比度（WCAG 2.1 按字号/字重取 3:1 或 4.5:1）、图片 alt、按钮可访问名称、点击目标 ≥32px",
      metrics: [],
    },
    {
      id: "performance",
      label: "Performance",
      codes: PERF_CODES,
      threshold: HEALTH_THRESHOLDS.performance,
      gating: true,
      basis: "静态预算：节点数、树深度、位图字节、缺尺寸的图片（布局位移来源）。不是 LCP/CLS 实测",
      metrics: [],
    },
    {
      id: "visual-qa",
      label: "Visual QA",
      codes: VISUAL_CODES,
      threshold: HEALTH_THRESHOLDS["visual-qa"],
      gating: true,
      basis: "一致性：字面颜色未绑 token、间距不在 4px 栅格、未使用的 token、越出画布、零尺寸节点",
      metrics: [],
    },
    {
      id: "ai-qa",
      label: "AI QA",
      codes: [],
      threshold: null,
      gating: false,
      basis: "未评估：需要真实模型评审内容，provider 未接入（配置后这一行会自动翻成实测）",
      metrics: [],
    },
    {
      id: "security",
      label: "Security",
      codes: SECURITY_CODES,
      threshold: null,
      gating: true,
      basis: "模型内可查的风险：疑似明文凭据、code 节点里的危险写法、http 明文外链",
      metrics: [],
    },
  ];

  const metrics = staticMetrics(document, layouts);
  const checks: HealthCheck[] = rows.map((row) => {
    const found = row.codes.length
      ? findings.filter((f) => row.codes.includes(f.code))
      : [];
    const scored = row.codes.length > 0;
    const score = scored ? scoreOf(found) : null;
    const hasError = found.some((f) => f.severity === "error");
    const belowLine =
      row.threshold !== null && score !== null && score < row.threshold;
    const rank: Record<Issue["severity"], number> = { error: 0, warning: 1, info: 2 };
    const shown = [...found]
      .sort((a, b) => rank[a.severity] - rank[b.severity])
      .slice(0, MAX_FINDINGS);
    // 没测的行永远是 not-run：绝不因为"没有发现"就冒充通过
    const state: HealthState = !scored
      ? "not-run"
      : row.gating && (hasError || belowLine)
        ? "fail"
        : "pass";
    return {
      id: row.id,
      label: row.label,
      score,
      gating: row.gating,
      threshold: row.threshold,
      state,
      basis: row.basis,
      // 分数按全量算；展示时先把严重的排前面再截断，免得截掉的恰好是错误
      findings: shown,
      omitted: found.length - shown.length,
      metrics: [...row.metrics, ...(metrics[row.id] ?? [])],
    };
  });

  const blockers: string[] = [];
  for (const check of checks) {
    if (check.state !== "fail") continue;
    const worst = check.findings.filter((f) => f.severity === "error");
    const head =
      check.threshold === null
        ? `${check.label}：${worst.length ? `${worst.length} 个错误` : "存在 error 级发现"}`
        : `${check.label} ${check.score ?? 0} 分，低于门槛 ${check.threshold}`;
    const detail = (worst.length ? worst : check.findings)
      .slice(0, 3)
      .map((f) => f.message);
    blockers.push(detail.length ? `${head} — ${detail.join("；")}` : head);
  }

  return {
    checks,
    passed: checks.every((c) => !c.gating || c.state === "pass"),
    blockers,
    notRun: checks.filter((c) => c.state === "not-run").map((c) => c.label),
  };
}

function scoreOf(findings: Issue[]): number {
  const lost = findings.reduce((sum, f) => sum + PENALTY[f.severity], 0);
  return Math.max(0, Math.round(100 - lost));
}

function resolvePages(
  document: DesignDocument,
): Record<string, ResolvedLayout> {
  const tokens = new TokenStore(document.tokens);
  const out: Record<string, ResolvedLayout> = {};
  for (const page of document.pages) {
    try {
      out[page.id] = resolveLayout(page, { tokens, mode: document.activeMode });
    } catch {
      // 结构坏掉的页面排不了版；这类问题由 build 行的 validate 发现负责报出来，
      // 这里跳过而不是让整份健康度崩掉
    }
  }
  return out;
}

function staticMetrics(
  document: DesignDocument,
  layouts: Record<string, ResolvedLayout>,
): Partial<Record<HealthId, HealthMetric[]>> {
  let depth = 0;
  for (const layout of Object.values(layouts)) {
    for (const r of Object.values(layout.nodes)) depth = Math.max(depth, r.depth);
  }
  const assetBytes = document.assets.reduce(
    (n, a) => n + (a.sizeBytes ?? 0),
    0,
  );
  const animations = countAnimations(document);
  return {
    performance: [
      { label: "最深", value: `${depth} 层` },
      { label: "资产", value: formatBytes(assetBytes) },
      { label: "动效", value: String(animations) },
    ],
  };
}

function countAnimations(document: DesignDocument): number {
  let n = 0;
  for (const page of document.pages) {
    for (const node of Object.values(page.nodes)) {
      n += (node.animation ?? []).filter((a) => a.enabled !== false).length;
    }
  }
  return n;
}

/** 性能 / 安全 / 视觉越界这些 lintDesign 没覆盖的静态规则 */
function collectStaticIssues(
  document: DesignDocument,
  layouts: Record<string, ResolvedLayout>,
): Issue[] {
  const issues: Issue[] = [];

  // 空页面是发布门禁的老规矩（原先在 runPublishGate 里），搬到这里来，
  // 这样 Studio 实时显示的健康度和服务端门禁算的是同一件事
  const hasContent = document.pages.some((page) =>
    Object.values(page.nodes).some((node) => node.id !== page.rootId && node.visible),
  );
  if (!hasContent) {
    issues.push({
      code: "empty-page",
      severity: "error",
      message: "页面里还没有可见内容，发布出去是一片空白",
    });
  }

  const pageCount = document.pages.length;
  if (pageCount > 24) {
    issues.push({
      code: "page-count",
      severity: "info",
      message: `项目有 ${pageCount} 个页面，首次加载与生成成本都会跟着涨`,
    });
  }

  const assetById = new Map(document.assets.map((a) => [a.id, a]));
  const missingDims = new Set<string>();
  let animations = 0;
  for (const page of document.pages) {
    const nodeCount = Object.keys(page.nodes).length;
    if (nodeCount > 800) {
      issues.push({
        code: "node-count",
        severity: nodeCount > 2000 ? "error" : "warning",
        message: `页面 ${page.name} 有 ${nodeCount} 个节点，超出静态预算 800`,
        pageId: page.id,
        suggestion: "把重复区块改成组件或 list 的数据驱动重复",
      });
    }
    const layout = layouts[page.id];
    if (layout) {
      for (const r of Object.values(layout.nodes)) {
        if (r.depth >= 24 && r.children.length) {
          issues.push({
            code: "tree-depth",
            severity: "warning",
            message: `${r.node.name} 嵌套到第 ${r.depth} 层，过深的层级会让响应式与调试失控`,
            pageId: page.id,
            nodeId: r.id,
          });
        }
        if (!r.node.visible) continue;
        if (r.id === page.rootId) continue;
        const outside =
          r.x + r.width <= 0 ||
          r.y + r.height <= 0 ||
          r.x >= page.width ||
          r.y >= page.height;
        if (outside) {
          issues.push({
            code: "off-canvas",
            severity: "warning",
            message: `${r.node.name} 完全在画布外（${Math.round(r.x)}, ${Math.round(r.y)} · ${Math.round(r.width)}×${Math.round(r.height)}）`,
            pageId: page.id,
            nodeId: r.id,
            suggestion: "移回画布，或确认它是有意的离屏素材",
          });
        }
        if (r.width < 1 || r.height < 1) {
          issues.push({
            code: "zero-size",
            severity: "info",
            message: `${r.node.name} 解析后尺寸为 ${Math.round(r.width)}×${Math.round(r.height)}，看不见也点不到`,
            pageId: page.id,
            nodeId: r.id,
          });
        }
      }
    }

    for (const node of Object.values(page.nodes)) {
      animations += (node.animation ?? []).filter((a) => a.enabled !== false).length;
      if ((node.type === "image" || node.type === "video") && node.assetId) {
        const asset = assetById.get(node.assetId);
        if (asset && !asset.width && !asset.height && !missingDims.has(asset.id)) {
          missingDims.add(asset.id);
          issues.push({
            code: "image-no-dims",
            severity: "warning",
            message: `资产「${asset.name}」没有记录宽高，渲染时无法预留位置，加载后会造成布局跳动`,
            pageId: page.id,
            nodeId: node.id,
            suggestion: "重新摄取该资产以读取尺寸",
          });
        }
      }
      issues.push(...scanNodeForRisk(node, page.id));
    }
  }

  if (animations > 60) {
    issues.push({
      code: "animation-count",
      severity: "info",
      message: `整份文档有 ${animations} 条动效，低端设备上会掉帧`,
    });
  }

  const bytes = document.assets.reduce((n, a) => n + (a.sizeBytes ?? 0), 0);
  if (bytes > 8_000_000) {
    issues.push({
      code: "asset-bytes",
      severity: bytes > 24_000_000 ? "error" : "warning",
      message: `资产合计 ${formatBytes(bytes)}，超出静态预算 8 MB`,
      suggestion: "压缩或换用 provider 生成的合适尺寸",
    });
  }
  return issues;
}

/** 明文凭据：只报"哪个节点像有密钥"，绝不把命中的内容抄进消息里 */
const CREDENTIAL_RE =
  /\b(api[_-]?key|secret[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|authorization)\b["']?\s*[:=]\s*["']?[^\s"']{12,}/i;
const UNSAFE_CODE_RE =
  /dangerouslySetInnerHTML|\beval\s*\(|new\s+Function\s*\(|document\.write|\.innerHTML\s*=|outerHTML\s*=/;
const INSECURE_URL_RE = /\bhttp:\/\/(?!localhost\b|127\.0\.0\.1|\[::1\])[^\s"'<>)]+/i;
const JAVASCRIPT_URL_RE = /\bjavascript:/i;

function scanNodeForRisk(node: DesignNode, pageId: string): Issue[] {
  const out: Issue[] = [];
  const samples: { path: string; text: string }[] = [];
  if (node.text) samples.push({ path: "text", text: node.text });
  if (node.code?.content)
    samples.push({ path: `code.${node.code.language}`, text: node.code.content });
  if (node.src) samples.push({ path: "src", text: node.src });
  for (const binding of node.bindings ?? []) {
    if (binding.expression) samples.push({ path: `bindings.${binding.property}`, text: binding.expression });
    if (typeof binding.fallback === "string")
      samples.push({ path: `bindings.${binding.property}.fallback`, text: binding.fallback });
  }

  for (const sample of samples) {
    if (CREDENTIAL_RE.test(sample.text)) {
      out.push({
        code: "credential-text",
        severity: "error",
        message: `${node.name} 的 ${sample.path} 里出现疑似明文凭据（内容已脱敏，未记录到报告里）`,
        pageId,
        nodeId: node.id,
        path: sample.path,
        suggestion: "发布物是公开页面：把密钥移到 provider 配置，不要写进设计",
      });
    }
    if (node.code && UNSAFE_CODE_RE.test(sample.text)) {
      out.push({
        code: "unsafe-code",
        severity: "error",
        message: `${node.name} 的代码片段含危险写法（${sample.path}），预览沙箱不执行它，但发布物里也不该留`,
        pageId,
        nodeId: node.id,
        path: sample.path,
        suggestion: "改为受约束的组件；见 docs/SECURITY.md 的生成代码隔离执行",
      });
    }
    if (JAVASCRIPT_URL_RE.test(sample.text)) {
      out.push({
        code: "unsafe-code",
        severity: "error",
        message: `${node.name} 的 ${sample.path} 含 javascript: 链接，会被浏览器当脚本执行`,
        pageId,
        nodeId: node.id,
        path: sample.path,
      });
    }
    if (INSECURE_URL_RE.test(sample.text)) {
      out.push({
        code: "insecure-url",
        severity: "warning",
        message: `${node.name} 的 ${sample.path} 引用了 http 明文地址，公开页面上会被混合内容拦截`,
        pageId,
        nodeId: node.id,
        path: sample.path,
        suggestion: "换成 https",
      });
    }
  }
  return out;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** §178 一行行的读法：分数，或者"未评估" */
export function formatHealthValue(check: HealthCheck): string {
  return check.score === null ? "未评估" : String(check.score);
}
