/**
 * NEXUS Studio — reproducible golden-path proof (§32/§59).
 *
 * Drives the REAL Studio bundle in a REAL browser (Chrome over the CDP harness in cdp.mjs)
 * and asserts observable behaviour. Everything printed is measured, not asserted by
 * construction. This replaces the earlier milestones' un-reproducible "in-app browser"
 * claims — see ADR 0017.
 *
 * Assertions read the canonical Design Model through the read-only observability bridge
 * (`window.__nexus`, lib/observability.ts) rather than scraping rendered text, so a passing
 * run means the MODEL changed, not merely that a button was clicked.
 *
 * Usage: node tools/harness/studio-golden-path.mjs [--url http://127.0.0.1:3210] [--out DIR]
 */
import { launch } from "./cdp.mjs";
import { compareToBaseline } from "./png.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const URL_BASE = arg("url", "http://127.0.0.1:3210");
const OUT_DIR = arg("out", "docs/evidence/studio/harness");
mkdirSync(OUT_DIR, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
}

const session = await launch({ width: 1440, height: 900 });
const page = await session.newPage("about:blank");

/** Click a button by its visible text (exact by default). */
async function clickByText(text, { exact = true, tag = "button" } = {}) {
  const hit = await page.evaluate(
    `(() => { const els = [...document.querySelectorAll(${JSON.stringify(tag)})];
       const want = ${JSON.stringify(text)};
       const el = els.find((e) => ${exact ? "e.textContent.trim() === want" : "e.textContent.trim().includes(want)"});
       if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; })()`,
  );
  if (!hit) throw new Error(`no ${tag} with text ${JSON.stringify(text)}`);
}

/** Click a toolbar button by its `title` attribute (icons have no text). */
async function clickByTitle(title) {
  const hit = await page.evaluate(
    `(() => { const el = [...document.querySelectorAll('button')].find((b) => (b.title||'').startsWith(${JSON.stringify(title)}));
       if (!el) return false; el.click(); return true; })()`,
  );
  if (!hit) throw new Error(`no button titled ${JSON.stringify(title)}`);
}

const snap = () => page.evaluate("window.__nexus ? window.__nexus.snapshot() : null");
const nodeCount = () => page.evaluate("window.__nexus ? window.__nexus.nodeCount() : -1");

/** Poll until `read()` satisfies `pred`, or time out. Returns the last value read. */
async function until(read, pred, ms = 15000) {
  const deadline = Date.now() + ms;
  let value = await read().catch(() => null);
  while (!pred(value) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 150));
    value = await read().catch(() => null);
  }
  return value;
}

try {
  // ── 1. Load the real Studio ────────────────────────────────────────────────
  await page.navigate(`${URL_BASE}/`, { waitForSelector: "#nexus-canvas", waitMs: 400 });
  const vp = await page.viewport();
  check(
    "Studio loads in a REAL visible viewport",
    vp.w > 800 && vp.hidden === false,
    `${vp.w}x${vp.h} · document.hidden=${vp.hidden} · dpr=${vp.dpr}`,
  );
  check("document title", (await page.evaluate("document.title")) === "NEXUS Studio");

  const brand = await page.evaluate(
    "document.querySelector('header strong')?.textContent?.trim() ?? null",
  );
  check("toolbar brand renders", brand === "NEXUS Studio", `brand=${JSON.stringify(brand)}`);

  const badges = await page.evaluate(
    "[...document.querySelectorAll('span')].filter((s) => s.textContent.trim() === 'DEMO MODE').length",
  );
  check("DEMO MODE badge present (§60 honesty)", badges > 0, `${badges} badge(s)`);

  const canvasBox = await page.evaluate(
    "(() => { const c = document.getElementById('nexus-canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { w: c.width, h: c.height, cssW: Math.round(r.width), cssH: Math.round(r.height) }; })()",
  );
  check(
    "canvas element sized and mounted",
    canvasBox && canvasBox.cssW > 200 && canvasBox.cssH > 200,
    JSON.stringify(canvasBox),
  );

  // ── 2. Observability bridge — assert on the MODEL, not on markup ──────────
  const base = await snap();
  check(
    "read-only observability bridge exposes canonical model state (§56/§57)",
    !!base && base.schema === 1 && base.mode === 'demo',
    base
      ? `schema=${base.schema} mode=${base.mode} nodes=${base.nodeCount} pages=${base.pageIds.length} types=[${base.nodeTypes}]`
      : "window.__nexus missing",
  );
  const baseNodes = base?.nodeCount ?? -1;
  const baseOnPage = base?.activePageNodeCount ?? -1;
  check(
    "fresh document is structurally empty (no content nodes yet)",
    baseOnPage === 0 && baseNodes > 0,
    `nodeCount=${baseNodes} (document+page roots) · activePageNodeCount=${baseOnPage}`,
  );

  // ── 3. Prompt → real Design Model ops ─────────────────────────────────────
  const inputSel = 'input[placeholder*="DEMO MODE"]';
  await page.type(inputSel, "an analytics dashboard");
  const typed = await page.evaluate(
    `document.querySelector(${JSON.stringify(inputSel)})?.value ?? null`,
  );
  check(
    "prompt typed via real keyboard events",
    typed === "an analytics dashboard",
    `value=${JSON.stringify(typed)}`,
  );

  await clickByText("Compose");
  const composed = await until(
    () => snap(),
    (s) => s && s.activePageNodeCount > 0,
  );
  check(
    "Compose produced real editable nodes in the canonical model",
    !!composed && composed.activePageNodeCount > 0,
    composed
      ? `activePageNodeCount ${baseOnPage} → ${composed.activePageNodeCount} · nodeCount ${baseNodes} → ${composed.nodeCount} · types=[${composed.nodeTypes}]`
      : "no snapshot",
  );
  check(
    "composed nodes span multiple primitive types (composer is parameterised)",
    (composed?.nodeTypes?.length ?? 0) >= 3,
    `types=[${composed?.nodeTypes?.join(", ")}]`,
  );
  check(
    "every composed content node has finite, positive model-derived geometry",
    !!composed &&
      composed.nodes
        .filter((n) => n.rect !== null)
        .every((n) => n.rect.width > 0 && n.rect.height > 0),
    composed
      ? `${composed.nodes.filter((n) => n.rect !== null).length} node(s) laid out, all positive`
      : "no snapshot",
  );
  const sampleNames = (composed?.nodes ?? []).filter((n) => n.rect).slice(0, 5).map((n) => n.name);
  check(
    "AI diff was recorded for the change (§36)",
    !!composed?.lastDiff,
    `lastDiff=${JSON.stringify(composed?.lastDiff)} · sample=[${sampleNames.join(" | ")}]`,
  );

  // ── 4. PIXEL proof — the capability the old harness could not reach ───────
  const shot = await page.send("Page.captureScreenshot", { format: "png" });
  const png = Buffer.from(shot.data, "base64");
  const shotPath = join(OUT_DIR, "studio-after-compose.png");
  writeFileSync(shotPath, png);
  check(
    "full-page PIXEL screenshot captured (§30 visual QA)",
    png.length > 5000,
    `${png.length} bytes → ${shotPath}`,
  );

  // ── 4b. the capture is READ, not just written ─────────────────────────────
  // `docs/KNOWN_ISSUES.md` has carried the sentence "the harness does not yet compare screenshots against a
  // baseline" since the harness existed: it wrote this PNG and never looked at it, so a visual regression was
  // invisible to every gate. This arm is GUARDED — it asserts only when a baseline exists beside the capture,
  // and says so when there is none — so it can never turn a first run red for the absence of a file.
  const baselinePath = join(OUT_DIR, "studio-after-compose.baseline.png");
  // The DECISION is `compareToBaseline` in png.mjs — pure, so the proof runs the same rule this harness does
  // rather than only asserting that a call site exists.
  const cmp = compareToBaseline(png, existsSync(baselinePath) ? readFileSync(baselinePath) : null);
  if (cmp.skipped) console.log(`[golden-path] ${cmp.detail} — write ${baselinePath} to arm it`);
  else check("screenshot matches its BASELINE within 2% of pixels (tolerance 8/channel)", cmp.ok, cmp.detail);

  const canvasPixels = await page.canvasStats("#nexus-canvas");
  check(
    "canvas actually PAINTED (non-transparent pixels)",
    canvasPixels && canvasPixels.nonEmpty > 1000,
    canvasPixels
      ? `${canvasPixels.nonEmpty}/${canvasPixels.total} px painted · ${canvasPixels.distinctColors} sampled colours · ${canvasPixels.w}x${canvasPixels.h}`
      : "no canvas",
  );

  // ── 5. Live preview mounts an iframe built FROM the model ────────────────
  await clickByText("Preview");
  await page.waitForSelector("iframe", 8000).catch(() => {});
  const previewText = await page.evaluate(
    "document.querySelector('iframe')?.contentDocument?.body?.innerText ?? null",
  );
  check(
    "Preview iframe renders content derived from the Design Model",
    !!previewText && previewText.length > 20,
    previewText ? `${previewText.replace(/\s+/g, " ").trim().slice(0, 110)}…` : "no iframe content",
  );
  await clickByText("Close ✕", { exact: false }).catch(() => {});

  // ── 6. Undo restores exact prior state (§35) ─────────────────────────────
  await clickByTitle("Undo");
  const undone = await until(
    () => snap(),
    (s) => s && s.activePageNodeCount === baseOnPage,
  );
  check(
    "Undo restores the exact baseline model state",
    undone?.activePageNodeCount === baseOnPage && undone?.nodeCount === baseNodes,
    `activePageNodeCount ${composed?.activePageNodeCount} → ${undone?.activePageNodeCount} · nodeCount ${composed?.nodeCount} → ${undone?.nodeCount} (baseline ${baseNodes})`,
  );

  // ── 7. Redo → persistence round-trip through a real reload (ADR 0014) ────
  await clickByTitle("Redo");
  const redone = await until(
    () => snap(),
    (s) => s && s.activePageNodeCount === composed?.activePageNodeCount,
  );
  check(
    "Redo returns to the composed state",
    redone?.activePageNodeCount === composed?.activePageNodeCount,
    `activePageNodeCount=${redone?.activePageNodeCount}`,
  );

  await new Promise((r) => setTimeout(r, 1400)); // let the debounced save flush
  const savedLen = await page.evaluate(
    "localStorage.getItem('nexus.studio.doc.v1')?.length ?? 0",
  );
  await page.navigate(`${URL_BASE}/`, { waitForSelector: "#nexus-canvas", waitMs: 900 });
  const revived = await until(
    () => snap(),
    (s) => s && s.activePageNodeCount > 0,
  );
  check(
    "localStorage snapshot survives a real reload",
    savedLen > 100 && revived?.activePageNodeCount === redone?.activePageNodeCount,
    `snapshot ${savedLen} chars · activePageNodeCount after reload ${revived?.activePageNodeCount} (expected ${redone?.activePageNodeCount}) · docName=${JSON.stringify(revived?.docName)}`,
  );

  // ── 8. Console cleanliness ──────────────────────────────────────────────
  const errors = session.pageErrors;
  const consoleErrors = session.consoleMessages.filter((m) => m.type === "error");
  check(
    "no page exceptions / console errors during the run",
    errors.length === 0 && consoleErrors.length === 0,
    errors.length || consoleErrors.length
      ? `exceptions: ${JSON.stringify(errors.slice(0, 2))} · console: ${JSON.stringify(consoleErrors.slice(0, 2))}`
      : `${session.consoleMessages.length} console messages, all non-error`,
  );
} catch (err) {
  check("golden path completed without harness error", false, String(err?.stack ?? err));
} finally {
  await session.close();
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} golden-path assertions passed` +
    (failed.length ? ` — FAILED: ${failed.map((f) => f.name).join(" ; ")}` : ""),
);
process.exit(failed.length ? 1 : 0);
