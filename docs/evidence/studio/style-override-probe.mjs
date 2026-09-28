#!/usr/bin/env node
/**
 * M1 v132 — mutation probe for the per-instance style overrides (ADR 0015 amendment 4).
 *
 * Predict-then-measure: each arm mutates ONE line, states the studio/design-model case it expects to
 * go red, then runs the smallest suite that can see it. An arm that survives is a real finding about
 * the tests, not a nuisance — arm 05 below survived the first version of the panel guard and is the
 * reason that guard became an argument check. Every file is restored byte-for-byte in `finally`.
 *
 *   node docs/evidence/studio/style-override-probe.mjs        # from the repo root
 *
 * Reference measurement (Windows, 2026-09-28):
 *   control — design-model 32 passed / 0 red, studio 119 passed / 0 red
 *   arms 01..06 — red 1 each, each matching its prediction
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync("packages/design-model/src/instances.ts")) {
  console.error("run me from the repo root (packages/design-model/src/instances.ts not found)");
  process.exit(2);
}

const FILES = {
  proj: "packages/design-model/src/instances.ts",
  store: "apps/studio/src/lib/store.ts",
  panel: "apps/studio/src/components/InstanceOverrides.tsx",
};
const SUITE = { proj: "packages/design-model", store: "apps/studio", panel: "apps/studio" };

const arms = [
  { id: "01-projection-forgets-the-radius", file: "proj", suite: "proj",
    anchor: "    if (geom.cornerRadius !== undefined) clone.cornerRadius = geom.cornerRadius;\n",
    replacement: "",
    predict: ["replaces a clone's fill and corner radius, leaving the master and the unpatched sibling alone"] },
  { id: "02-projection-aliases-the-override-array", file: "proj", suite: "proj",
    anchor: "if (geom.fills !== undefined) clone.fills = [...geom.fills];",
    replacement: "if (geom.fills !== undefined) clone.fills = geom.fills;",
    predict: ["hands the clone a COPY of the override array, so a renderer cannot write back into the document"] },
  { id: "03-store-clamps-radius-at-one", file: "store", suite: "store",
    anchor: "geom.cornerRadius = Math.round(Math.max(0, patch.cornerRadius))",
    replacement: "geom.cornerRadius = Math.round(Math.max(1, patch.cornerRadius))",
    predict: ["a negative radius lands as a square corner, and a style patch on a non-instance is a no-op"] },
  { id: "04-store-drops-the-fills-patch", file: "store", suite: "store",
    anchor: "    if (patch.fills !== undefined) { geom.fills = [...patch.fills]; touched = true; }\n",
    replacement: "",
    predict: ["a fill and a radius override land on the patch, project onto the clone, and leave the master alone"] },
  { id: "05-panel-writes-to-the-master-id", file: "panel", suite: "panel",
    anchor: "setInstanceOverride(instance.id, r.masterId, { cornerRadius: n })",
    replacement: "setInstanceOverride(r.masterId, r.masterId, { cornerRadius: n })",
    predict: ["routes the fill swatch and the radius through setInstanceOverride, never through updateNode"] },
  { id: "06-panel-shows-a-constant-radius", file: "panel", suite: "panel",
    anchor: "radius: node.cornerRadius ?? 0,",
    replacement: "radius: 0,",
    predict: ["reads the clone it is editing out of the projection, so the inputs show the override that is applied"] },
];

function runVitest(root) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--root", root, "--no-file-parallelism"], {
      cwd: process.cwd(), env: { ...process.env, NODE_OPTIONS: "" }, stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { out += d.toString(); });
    child.on("close", (code) => resolve({ code, out }));
  });
}

const parse = (out) => {
  const seen = new Set();
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s*FAIL\s+(\S+\.test\.ts)\s*>\s*(.+)$/);
    if (m) seen.add(m[2].trim().replace(/^\S+ > /, ""));
  }
  return [...seen].sort();
};

const backups = {};
for (const [k, p] of Object.entries(FILES)) backups[k] = readFileSync(p);

for (const k of ["proj", "store", "panel"]) {
  const r = await runVitest(SUITE[k]);
  const reds = parse(r.out);
  const total = (r.out.match(/Tests\s+(\d+) passed/) || [])[1] ?? "?";
  console.log(`[control] ${k}: exit ${r.code} · ${total} passed · ${reds.length} red`);
}

let failed = 0;
try {
  for (const arm of arms) {
    const path = FILES[arm.file];
    const raw = backups[arm.file].toString("utf8");
    const crlf = raw.includes("\r\n");
    const text = raw.replace(/\r\n/g, "\n");
    const n = text.split(arm.anchor).length - 1;
    if (n !== 1) { console.log(`ARM ${arm.id}: ANCHOR MISS (${n} matches) — not measured`); failed += 1; continue; }
    writeFileSync(path, text.replace(arm.anchor, arm.replacement).replace(/\n/g, crlf ? "\r\n" : "\n"), "utf8");
    const r = await runVitest(SUITE[arm.suite]);
    const reds = parse(r.out);
    const caught = arm.predict.every((p) => reds.some((r2) => r2.includes(p)));
    const extra = reds.filter((r2) => !arm.predict.some((p) => r2.includes(p)));
    if (!caught || extra.length > 0) failed += 1;
    console.log(`ARM ${arm.id}: exit ${r.code} · predicted ${arm.predict.length} · red ${reds.length} · caught=${caught} · unexpected=${extra.length}${extra.length ? ` (${extra.join(" | ")})` : ""}`);
    for (const r2 of reds) console.log(`      red: ${r2}`);
    // restore THIS arm's file before the next arm — the first probe run forgot this and reported
    // two phantom "unexpected" reds that were really a doubly-mutated tree. See the ADR record.
    writeFileSync(path, backups[arm.file]);
  }
} finally {
  for (const [k, b] of Object.entries(backups)) writeFileSync(FILES[k], b);
  console.log("[restore] all three files written back byte-for-byte");
}
console.log(failed === 0 ? "PROBE OK — every arm matched its prediction" : `PROBE FAILED — ${failed} arm(s) off`);
process.exit(failed === 0 ? 0 : 1);
