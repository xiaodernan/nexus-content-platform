/**
 * NEXUS Studio — deploy-lane harness (M6 v177, ADR 0016 amendment 177).
 *
 * Drives the REAL Studio bundle in a REAL browser (Chrome over the CDP harness in cdp.mjs,
 * ADR 0017) against the REAL dev server and the REAL docker daemon, and asserts the dock's
 * DEPLOY face end-to-end — the deploy arc's first product consumer:
 *   §1 the probe lands in the panel: the status line states the arc it deploys from, the
 *      records path and the on-file count — measured from the running route;
 *   §2 the ask appears; Allow-once (the §28 human gate) plans + walks the BUILD arc and
 *      records each fact SERVER-side; the line answers in the deploy's own words;
 *   §3 the per-fact lines render — the engine's own stdout, verbatim;
 *   §4 the §28 decision lands in the dock ledger: the last entry is approved, names
 *      deploy.record as the via, and carries the deploy's detail line;
 *   §5 (v178) the records READ BACK: the probe refresh after the walk renders the records
 *      on file NEWEST FIRST — the compute fact (recorded last) is the first row, the
 *      runtime fact is in the history, verbatim;
 *   §6 the whole run raises no console errors.
 *
 * Usage: node tools/harness/studio-deploy.mjs [--url http://127.0.0.1:3211]
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
  const status = await until(() => testId("deploy-status"), (t) => !!t && !t.includes("probing") && t.length > 0, 90_000);
  check(
    "§1 probe lands: arc id + records path + on-file count",
    !!status && status.includes("studio-build-arc") && status.includes("records → .nexus/deployments.jsonl") && status.includes("on file"),
    `status=${status}`,
  );

  // §2 the ask, the Allow-once, the walk
  const runBtn = await until(() => page.evaluate("[...document.querySelectorAll('[data-testid=\"deploy-run\"]')].length"), (n) => n === 1, 5_000);
  check("§2a the deploy offered exactly once when the runtime is available", runBtn === 1, `buttons=${runBtn}`);
  await clickTest("deploy-run");
  const ask = await until(() => testId("deploy-ask"), Boolean, 10_000);
  check(
    "§2b the ask names the goal, the ONE write door and the honest limit",
    !!ask && ask.includes("deploy.record") && ask.includes("deploys nothing") && ask.includes(".nexus/deployments.jsonl"),
    `ask=${ask}`,
  );
  await clickTest("deploy-allow");
  const line = await until(() => testId("deploy-line"), (t) => !!t && (t.includes("recorded") || t.includes("nothing")), 180_000);
  check(
    "§2c the walk answers in the deploy's own words",
    !!line && line.includes("2 fact(s) recorded") && line.includes(".nexus/deployments.jsonl"),
    `line=${line}`,
  );

  // §3 per-fact lines — the engine's own words
  const facts = await until(() => allTestIds("deploy-fact"), (arr) => Array.isArray(arr) && arr.length === 2, 10_000);
  check(
    "§3 both recorded facts render verbatim",
    Array.isArray(facts) && facts.every((f) => f.includes("✓ recorded")) && facts[0].includes("runtime") && facts[1].includes("compute") && facts[1].includes("arc ok:5"),
    `facts=${JSON.stringify(facts)}`,
  );

  // §4 the §28 decision in the ledger
  const ledger = await page.evaluate(
    "(() => { const lines = (localStorage.getItem('nexus.agentLedger.v1') ?? '').split('\\n').filter((l) => l.trim() !== ''); const last = lines[lines.length - 1]; return last ? JSON.parse(last) : null; })()",
  );
  check(
    "§4 the §28 decision landed in the ledger (approved · via deploy.record · deploy detail)",
    !!ledger && ledger.approved === true && ledger.via === "deploy.record" && typeof ledger.goal === "string" && ledger.goal.startsWith("deploy arc:") && typeof ledger.exec === "string" && ledger.exec.includes("recorded"),
    `last=${JSON.stringify(ledger)}`,
  );
  // §5 the records read back — the probe refresh renders the history NEWEST FIRST (v178)
  const records = await until(
    () => allTestIds("deploy-record"),
    (arr) => Array.isArray(arr) && arr.length >= 2 && arr[0].includes("compute") && arr[0].includes("arc ok:5"),
    20_000,
  );
  check(
    "§5 the records on file render NEWEST FIRST (the last-recorded fact first), verbatim",
    Array.isArray(records) && records.length >= 2 && records[0].includes("compute") && records[0].includes("arc ok:5") && records.some((r) => r.includes("runtime") && r.includes("container:node:22-alpine")),
    `records=${JSON.stringify(records)}`,
  );
  const malformed = await page.evaluate("[...document.querySelectorAll('[data-testid=\"deploy-malformed\"]')].length");
  check("§5b no unreadable line is hidden or invented", malformed === 0, `malformed rows=${malformed}`);
} catch (err) {
  check("deploy lane completed without harness error", false, String(err?.stack ?? err));
} finally {
  const consoleErrors = session.consoleMessages.filter((m) => m.type === "error");
  check("§6 no console errors during the run", consoleErrors.length === 0, `${session.consoleMessages.length} console message(s), ${consoleErrors.length} error(s)`);
  await session.close();
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} deploy-lane assertions passed` +
    (failed.length ? ` — FAILED: ${failed.map((f) => f.name).join(" ; ")}` : ""),
);
process.exit(failed.length ? 1 : 0);
