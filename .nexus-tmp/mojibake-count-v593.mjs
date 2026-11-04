import { execFileSync } from "node:child_process";

const DASH = '鈥?';
const ARROW = '鈫?';
const SEC = '搂';
const ROOT = "D:/终极项目";

const show = (p) =>
  execFileSync("git", ["show", `HEAD:${p}`], { encoding: "utf8", cwd: ROOT, maxBuffer: 1 << 28 });

const count = (hay, needle) => hay.split(needle).length - 1;

for (const p of ["docs/evidence/m9/README.md", "docs/decisions/0016-agent-runtime-hermetic-demo-loop.md"]) {
  const text = show(p);
  const lines = text.split("\n");
  let scoped = text;
  let label = "whole file";
  if (p.includes("0016")) {
    const start = lines.findIndex((l) => l.startsWith("### Amendment 549"));
    const rest = lines.slice(start);
    const next = rest.findIndex((l, i) => i > 0 && l.startsWith("### "));
    scoped = rest.slice(0, next === -1 ? rest.length : next).join("\n");
    label = `Amendment 549 block only (starts at line ${start + 1})`;
  }
  console.log(`${p} — ${label} @ HEAD blob`);
  console.log(`  em-dash sites ${count(scoped, DASH)} · arrow sites ${count(scoped, ARROW)} · section-sign sites ${count(scoped, SEC)}`);
  console.log(`  whole file: dash ${count(text, DASH)} · arrow ${count(text, ARROW)} · section ${count(text, SEC)}`);
}
