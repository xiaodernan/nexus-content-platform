// 这一片的承重事实：「这一档取消反向」在 CSS 里只能靠**重发正向方向类**，
// 而它必须排在窄档那条反向类之后才顶得掉。这里用本仓库装的 Tailwind v4.3.3 现编样式，
// 再在真 Chromium 里读三种宽度下的 computed flex-direction——不是推理，是量。
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "@playwright/test";

const dir = path.resolve(".scratch/twprobe");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

// 三组就是发射侧的三种形状：基线反向、md 取消、md 反向 + lg 取消
const CASES = [
  { id: "base-reverse", cls: "flex flex-col flex-col-reverse" },
  { id: "md-cancel", cls: "flex flex-col flex-col-reverse md:flex-col" },
  { id: "lg-cancel", cls: "flex flex-col md:flex-col md:flex-col-reverse lg:flex-col" },
];
const all = [...new Set(CASES.flatMap((c) => c.cls.split(" ")))].join(" ");
fs.writeFileSync(path.join(dir, "index.html"), `<div class="${all}"></div>`);
fs.writeFileSync(path.join(dir, "input.css"), '@import "tailwindcss";\n@source "./index.html";\n');

const result = await postcss([tailwind()]).process(fs.readFileSync(path.join(dir, "input.css"), "utf8"), {
  from: path.join(dir, "input.css"),
});
fs.writeFileSync(path.join(dir, "out.css"), result.css);

const page = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="out.css"></head><body>
${CASES.map((c) => `<div id="${c.id}" class="${c.cls}"></div>`).join("\n")}
</body></html>`;
fs.writeFileSync(path.join(dir, "page.html"), page);

const WIDTHS = [400, 900, 1300];
const browser = await chromium.launch();
const probe = await browser.newPage();
await probe.goto(`file:///${path.join(dir, "page.html").replace(/\\/g, "/")}`);
const rows = [];
for (const width of WIDTHS) {
  await probe.setViewportSize({ width, height: 800 });
  for (const c of CASES) {
    const value = await probe.$eval(`#${c.id}`, (el) => getComputedStyle(el).flexDirection);
    rows.push({ width, id: c.id, value });
  }
}
await browser.close();

for (const r of rows) console.log(`${String(r.width).padStart(5)}px  ${r.id.padEnd(14)} flex-direction: ${r.value}`);
console.log("\n产出的类：", (result.css.match(/\.[a-z\\:0-9-]+(?=\s*\{)/g) ?? []).join(" "));

// 顺序判据：同档里反向类排在正向类**之后**（后者赢不了），跨档时宽档的 media 块整个排在窄档之后（才顶得掉）。
// 文档里那几行行号来自这里，不是手抄的回忆。out.css 的写法是「两个空格 + 选择器 + 空格 + 花括号」，
// 所以按 trim 后的前缀找，并把选择器名本身当唯一判据（`.flex-col` 是 `.flex-col-reverse` 的前缀，得连花括号一起比）。
const cssLines = result.css.split(/\r?\n/);
const indentOf = (line) => line.length - line.trimStart().length;
const lineOf = (needle) => cssLines.findIndex((l) => `${l.trim()} `.startsWith(needle));
// 带断点的类嵌在 @media 块里（out.css 用 4 格缩进表示嵌套），无前缀的基线类在顶层（2 格）。
// 而 out.css 顶部还有一份"断点清单"，@media 那几行会先出现一次，所以只能按缩进决定要不要往前找。
const enclosingMedia = (at) => {
  if (indentOf(cssLines[at]) < 4) return "顶层（无 media 块）";
  for (let i = at; i >= 0; i--) if (cssLines[i].trim().startsWith("@media (width")) return `${i + 1}(${cssLines[i].trim()})`;
  return "找不到所属 media";
};
for (const needle of [
  ".flex-col {",
  ".flex-col-reverse {",
  ".md\\:flex-col {",
  ".md\\:flex-col-reverse {",
  ".lg\\:flex-col {",
]) {
  const at = lineOf(needle);
  console.log(`${at < 0 ? "找不到" : `out.css:${at + 1}`}  ${needle}  ← ${enclosingMedia(at)}`);
}


