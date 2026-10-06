/**
 * NEXUS Studio — build-lane harness (M6 v174, ADR 0016 amendment 174).
 *
 * Drives the REAL Studio bundle in a REAL browser (Chrome over the CDP harness in cdp.mjs,
 * ADR 0017) against the REAL dev server and the REAL docker daemon, and asserts the dock's
 * BUILD face end-to-end:
 *   §1 the probe lands in the panel: the status line states the pinned arc id, its step
 *      count and the engine — measured from the running route;
 *   §2 the ask appears; Allow-once (the §28 human gate) walks the arc SERVER-side and the
 *      line answers in the arc's own words: 2/2 steps green, engine named;
 *   §3 the per-step lines render (runtime + compute, both green);
 *   §4 the §28 decision lands in the dock ledger: the last entry is approved, names
 *      build.verify as the via, and carries the arc's detail line;
 *   §5 the whole run raises no console errors.
 *
 * Usage: node tools/harness/studio-build.mjs [--url http://127.0.0.1:3211]
 */
import { launch } from "./cdp.mjs";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const URL_BASE = arg("url", "http://127.0.0.1:3211");

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
}

const session = await launch({ width: 1440, height: 900 });
const page = await session.newPage("about:blank");

/** Poll until `read()` satisfies `pred`, or time out. */
async function until(read, pred, ms = 15000) {
  const deadline = Date.now() + ms;
  let value = await read().catch(() => null);
  while (!pred(value) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    value = await read().catch(() => null);
  }
  return value;
}

const testId = (id) =>
  page.evaluate(`(() => { const el = document.querySelector('[data-testid="${id}"]'); return el ? el.textContent.trim() : null; })()`);
const allTestIds = (id) =>
  page.evaluate(`(() => [...document.querySelectorAll('[data-testid="${id}"]')].map((el) => el.textContent.trim()))()`);
const clickTest = (id) =>
  page.evaluate(`(() => { const el = document.querySelector('[data-testid="${id}"]'); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; })()`);

try {
  await page.navigate(`${URL_BASE}/`, { waitForSelector: "#nexus-canvas", waitMs: 400 });
  check("Studio loads in a REAL viewport", true, URL_BASE);

  // §1 the probe lands (first hit compiles the route — give it a generous budget)
  const status = await until(() => testId("build-status"), (t) => !!t && !t.includes("probing") && t.length > 0, 90_000);
  check(
    "§1 probe lands: pinned arc + step count + engine",
    !!status && status.includes("studio-build-arc") && status.includes("2 verify step(s)") && status.includes("container:node:22-alpine"),
    `status=${status}`,
  );

  // §2 the ask, the Allow-once, the walk
  const runBtn = await until(() => page.evaluate("[...document.querySelectorAll('[data-testid=\"build-run\"]')].length"), (n) => n === 1, 5_000);
  check("§2a the arc offered exactly once when the runtime is available", runBtn === 1, `buttons=${runBtn}`);
  await clickTest("build-run");
  const ask = await until(() => testId("build-ask"), Boolean, 10_000);
  check("§2b the ask names the steps and the engine", !!ask && ask.includes("node --version") && ask.includes("arc ok:") && ask.includes("container:node:22-alpine"), `ask=${ask}`);
  await clickTest("build-allow");
  const line = await until(() => testId("build-line"), (t) => !!t && t.includes("green"), 120_000);
  check("§2c the walk answers in the arc's own words", !!line && line.includes("2/2 step(s) green") && line.includes("container:node:22-alpine"), `line=${line}`);

  // §3 per-step lines
  const steps = await until(() => allTestIds("build-step"), (arr) => Array.isArray(arr) && arr.length === 2, 10_000);
  check(
    "§3 both walked steps render with their engine details",
    Array.isArray(steps) && steps.every((s) => s.includes("✓")) && steps[0].includes("runtime") && steps[1].includes("compute") && steps[1].includes("exit 0"),
    `steps=${JSON.stringify(steps)}`,
  );

  // §4 the §28 decision in the ledger
  const ledger = await page.evaluate(
    "(() => { const lines = (localStorage.getItem('nexus.agentLedger.v1') ?? '').split('\\n').filter((l) => l.trim() !== ''); const last = lines[lines.length - 1]; return last ? JSON.parse(last) : null; })()",
  );
  check(
    "§4 the §28 decision landed in the ledger (approved · via build.verify · arc detail)",
    !!ledger && ledger.approved === true && ledger.via === "build.verify" && typeof ledger.goal === "string" && ledger.goal.startsWith("build arc:") && typeof ledger.exec === "string" && ledger.exec.includes("green"),
    `last=${JSON.stringify(ledger)}`,
  );
} catch (err) {
  check("build lane completed without harness error", false, String(err?.stack ?? err));
} finally {
  const consoleErrors = session.consoleMessages.filter((m) => m.type === "error");
  check("§5 no console errors during the run", consoleErrors.length === 0, `${session.consoleMessages.length} console message(s), ${consoleErrors.length} error(s)`);
  await session.close();
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} build-lane assertions passed` +
    (failed.length ? ` — FAILED: ${failed.map((f) => f.name).join(" ; ")}` : ""),
);
process.exit(failed.length ? 1 : 0);
