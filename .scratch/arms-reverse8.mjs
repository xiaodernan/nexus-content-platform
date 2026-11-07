// §14 第八片变异电池：每条臂只改一个行为，跑完立刻按字节还原（共享树，绝不用 git checkout）。
// 这一片新增的机制有四台：发射侧的"取消反向"那一支、回写侧 saysForward / saysMode 两条归属判据、
// DIRECTION_CLASS 那张派生表、面板侧 absentAs + effectiveAt 那一层归一。每台一到两条。
//
// 预测（跑之前按磁盘上的用例标题逐字写死；红集不符即 MISMATCH）：
//   载体标题：
//     CG  codegen「这一档取消更窄那档的反向：重发正向方向类，没得取消时一个字都不发」
//     P1  parse 「发得出也读得回，一个补丁都不发」   P2 「lg 那一条重发正向方向类」
//     P3  parse 「只补 reverse:false，不凭空写 mode」  P4 「没顶掉任何东西」  P5 「md:flex-col 只发一条」
//     E1  editor 「这一格跟着这一档解出来的排布走」   E2 「写「反向」：一条规则、一处投影」
//     E3  editor 「取消更窄那档的反向…存下来并算一处投影」  E4 「这一档本来正序：写「正序」一条规则都不存」
//     E5  editor 「非布尔的取值不当"改成 false"处理」
//   H6  发射不发取消类  → 红 CG / P1 / P2 / P3；不红 P4（钉的就是不发）
//   H7  回写不收 saysForward → 红 P3 / P5；**不红 P1 / P2**（第二轮实测，第一轮预测按标题想当然）：
//       那两条说的是"往返零补丁"，而读者不认领这条类时同样零补丁——它把类归给这一档继承来的排布，
//       既不写键也不记 unmapped。所以零补丁这一判据只能见证发射侧，见证不了回写侧的认领；
//       P5 因此在第八片补了半条真读数（把模型那一档的 reverse 键抽掉再读同一份代码）。
//   H8  回写无条件补 mode → 红 P1 / P2 / P3；不红 P4、P5（那一档本来真改了排布，补 mode 是对的）。
//       P3 第一轮没红是因为它用 toMatchObject 比 value：多出来的 `mode` 键看不见，
//       那句标题「不凭空写 mode」当时无人管 ⇒ 改成 toEqual 之后这条臂才有牙齿。
//   H9  DIRECTION_CLASS 的唯一性判据放宽（`=== 1` → `>= 1`）→ **等价变异，红集必为 0**：
//       今天的表里 `flex` 竖/横/换行三档共用（计数 3）被排除，vertical / horizontal 各剩一条，
//       两种比较符挑出的东西一模一样。所以这条判据的牙齿不在放宽它，而在"表被改坏时它挡得住"，
//       那一寸交给 H11（把 `=== 1` 换成永远不成立的 `=== 2`）与新的前提用例。
//   H11 DIRECTION_CLASS 一条都不填（`=== 2`）→ 红「正向方向类那张表…」+ CG / P1 / P2 / P3。
//       P3 也在里面不是意外（第二轮实测把它的"不该红"划掉了）：那条腿手写一条 `md:flex-col`，读者
//       认领之后要靠重投影再现它（§19 的自检）；取消分支没了类可发 ⇒ 整节点回写作废。H6 红 P3
//       是同一条理由。P5 不红：它那一档自己声明了 mode，正向类由 `DISPLAY_CLASSES` 发出，
//       与 `DIRECTION_CLASS` 无关。
//   H4  面板去掉 absentAs → 红 E4 / E3；不红 E5、E2
//   H5  effectiveAt 变恒等 → 红 E4 / E3；不红 E5、E2
//   H10 这一格不看投影（网格档也摆出来）→ 红 E1
// 一处先说明：PropertiesPanel 那颗钮的**文案**（正序/反向）没有单测载体——仓库这层没有组件测试，
// 它的证据在 e2e 腿 R 的「这一档 反向」读数上，与第七片那条"发射侧判据没有红腿可当载体"同类。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ROOT = "D:/内容创作平台";
const FILES = {
  codegen: "packages/design-model/src/codegen.ts",
  parse: "packages/design-model/src/code-parse.ts",
  editor: "apps/web/src/studio/responsive-editor.ts",
};
const backup = {};
for (const [k, rel] of Object.entries(FILES)) backup[k] = readFileSync(`${ROOT}/${rel}`, "utf8");

const ARMS = [
  {
    name: "H6",
    file: "codegen",
    label: "发射不取消：这一档声明 reverse:false 也一条类都不发（回到第七片之后那个洞）",
    from: `      } else if (
        layout?.reverse === false &&
        applyResponsiveBelow(node, rule.breakpoint).layout.reverse === true
      ) {`,
    to: `      } else if (
        false &&
        layout?.reverse === false &&
        applyResponsiveBelow(node, rule.breakpoint).layout.reverse === true
      ) {`,
    expect: {
      must: ["没得取消时一个字都不发", "发得出也读得回", "lg 那一条重发正向方向类", "只补 reverse:false"],
      mustNot: ["没顶掉任何东西", "只发一条"],
    },
  },
  {
    name: "H7",
    file: "parse",
    label: "回写不收「取消反向」这件事：正向方向类读了但不写 reverse:false",
    from: `    const saysForward = !assertsReverse && narrowerReversed && ALIGNABLE_MODES.includes(mode);`,
    to: `    const saysForward = false;`,
    expect: {
      must: ["只补 reverse:false", "只发一条"],
      mustNot: [
        "发得出也读得回",
        "lg 那一条重发正向方向类",
        "没顶掉任何东西",
        "没得取消时一个字都不发",
        "正向方向类那张表",
      ],
    },
  },
  {
    name: "H8",
    file: "parse",
    label: "回写无条件补 mode：一条只说「这一档不反向」的类顺手改了排布（模型里凭空多一个键）",
    from: `    const saysMode = declaresMode || mode !== narrower.layout.mode;`,
    to: `    const saysMode = true;`,
    expect: {
      must: ["发得出也读得回", "lg 那一条重发正向方向类", "不凭空写 mode"],
      mustNot: ["只发一条", "没顶掉任何东西", "没得取消时一个字都不发", "正向方向类那张表"],
    },
  },
  {
    name: "H9",
    file: "codegen",
    equiv: true,
    label:
      "DIRECTION_CLASS 的唯一性判据放宽（=== 1 → >= 1）：今天这张表挑不出第二条，等价变异，红集必为 0",
    from: `    if (unique.length === 1) out[mode] = unique[0];`,
    to: `    if (unique.length >= 1) out[mode] = unique[0];`,
    expect: { mustNot: ["没顶掉任何东西"] },
  },
  {
    name: "H11",
    file: "codegen",
    label:
      "DIRECTION_CLASS 一条都不填（=== 1 → === 2）：取消反向那一支没了类可发，而前提用例要先一步红",
    from: `    if (unique.length === 1) out[mode] = unique[0];`,
    to: `    if (unique.length === 2) out[mode] = unique[0];`,
    expect: {
      must: [
        "正向方向类那张表",
        "没得取消时一个字都不发",
        "发得出也读得回",
        "lg 那一条重发正向方向类",
        "只补 reverse:false",
      ],
      mustNot: ["只发一条", "没顶掉任何东西"],
    },
  },
  {
    name: "H4",
    file: "editor",
    label: "面板不声明 absentAs：「没有这个键」读成 undefined，于是本来正序时点「正序」也存一条规则",
    from: `    absentAs: false,`,
    to: `    // absentAs 摘掉`,
    expect: {
      must: ["一条规则都不存", "存下来并算一处投影"],
      mustNot: ["非布尔的取值", "写「反向」：一条规则"],
    },
  },
  {
    name: "H5",
    file: "editor",
    label: "effectiveAt 变恒等：这层归一不生效（读数、冗余判据、徽标三处一起吃 undefined）",
    from: `  const raw = getByPath(node, readPath);
  if (raw !== undefined) return raw;
  const spec = RESPONSIVE_CHANNELS.find((c) => c.readPath === readPath);
  return spec?.absentAs;`,
    to: `  return getByPath(node, readPath);`,
    expect: {
      must: ["一条规则都不存", "存下来并算一处投影"],
      mustNot: ["非布尔的取值", "写「反向」：一条规则"],
    },
  },
  {
    name: "H10",
    file: "editor",
    label: "这一格不看投影：网格档也摆出「顺序」（按下去什么都不动的按钮摆回面板，§159）",
    from: `    appliesTo: (node, breakpoint) => hasChildren(node) && alignableAt(node, breakpoint),
    clean: (value) => (typeof value === 'boolean' ? value : REJECT),`,
    to: `    appliesTo: (node) => hasChildren(node),
    clean: (value) => (typeof value === 'boolean' ? value : REJECT),`,
    expect: { must: ["这一格跟着这一档解出来的排布走"] },
  },
];

const SUITES = [
  "packages/design-model",
  "apps/web/test/responsive-editor.test.ts",
  "apps/web/test/studio-responsive.test.ts",
];

function runSuite() {
  const out = spawnSync(
    "npx",
    ["vitest", "run", ...SUITES, "--reporter=json", "--outputFile=.scratch/arm8.json"],
    { cwd: ROOT, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 },
  );
  try {
    const report = JSON.parse(readFileSync(`${ROOT}/.scratch/arm8.json`, "utf8"));
    const names = [];
    for (const f of report.testResults || []) {
      for (const a of f.assertionResults || []) if (a.status === "failed") names.push(a.title);
    }
    return {
      crash: false,
      names,
      total: report.numTotalTests,
      passed: report.numPassedTests,
      files: (report.testResults || []).length,
    };
  } catch {
    return { crash: true, names: [], note: ((out.stdout || "") + (out.stderr || "")).slice(0, 500) };
  }
}

mkdirSync(`${ROOT}/.scratch`, { recursive: true });
const base = runSuite();
console.log(
  `BASE files=${base.files ?? "-"} passed=${base.passed ?? "-"}/${base.total ?? "-"} reds=${base.names.length} crash=${base.crash}`,
);
if (base.crash || base.names.length > 0) {
  console.log("BASELINE 不干净：电池作废（先修基线再谈臂）");
  for (const n of base.names) console.log(`    · ${n}`);
  process.exit(1);
}

const results = [{ arm: "BASE", ...base }];
// 第二轮只重跑预测对不上的那几条臂（电池其余臂的实测已在 arms8-run1.log 里）
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const SELECTED = ONLY.length ? ARMS.filter((a) => ONLY.includes(a.name)) : ARMS;
if (ONLY.length && SELECTED.length !== new Set(ONLY).size) {
  console.log(`臂名对不上：请求 ${ONLY.join(",")}，认得 ${SELECTED.map((a) => a.name).join(",")}`);
  process.exit(1);
}
for (const arm of SELECTED) {
  const rel = FILES[arm.file];
  const path = `${ROOT}/${rel}`;
  const src = backup[arm.file];
  if (!src.includes(arm.from)) {
    results.push({ arm: arm.name, error: "NEEDLE-NOT-FOUND" });
    console.log(`[${arm.name}] NEEDLE-NOT-FOUND`);
    continue;
  }
  writeFileSync(path, src.replace(arm.from, arm.to), "utf8");
  const run = runSuite();
  writeFileSync(path, src, "utf8");
  const restored = readFileSync(path, "utf8") === src;
  let verdict;
  if (run.crash) verdict = "CRASH(零证据)";
  else if (arm.equiv)
    verdict = run.names.length === 0 ? "EQUIV(等价变异，红集 0，与预测相符)" : "MISMATCH 等价变异却有红";
  else {
    const missing = (arm.expect.must || []).filter((p) => !run.names.some((n) => n.includes(p)));
    const leaked = (arm.expect.mustNot || []).filter((p) => run.names.some((n) => n.includes(p)));
    verdict = missing.length
      ? `MISMATCH 未红:${JSON.stringify(missing)}`
      : leaked.length
        ? `MISMATCH 不该红:${JSON.stringify(leaked)}`
        : "MATCH";
  }
  results.push({ arm: arm.name, label: arm.label, restored, reds: run.names.length, verdict, names: run.names, note: run.note });
  console.log(`[${arm.name}] reds=${run.names.length} verdict=${verdict} restored=${restored}`);
  for (const n of run.names) console.log(`    · ${n}`);
}
writeFileSync(
  `${ROOT}/.scratch/arms8-result${ONLY.length ? "-rerun" : ""}.json`,
  JSON.stringify(results, null, 1),
  "utf8",
);
let residue = false;
for (const [k, rel] of Object.entries(FILES)) {
  if (readFileSync(`${ROOT}/${rel}`, "utf8") !== backup[k]) {
    residue = true;
    writeFileSync(`${ROOT}/${rel}`, backup[k], "utf8");
  }
}
console.log(`RESIDUE=${residue}`);
