/**
 * NEXUS Studio — container-lane harness (M2 v172, ADR 0016 amendment 172).
 *
 * Drives the REAL Studio bundle in a REAL browser (Chrome over the CDP harness in cdp.mjs,
 * ADR 0017) against the REAL dev server and the REAL docker daemon, and asserts the dock's
 * container face end-to-end:
 *   §1 the probe lands in the panel: the status line states the daemon's version plus the
 *      pinned image and container workdir root — measured from the running route;
 *   §2 the self-check ask appears; Allow-once (the §28 human gate) runs it SERVER-side and
 *      the line answers in the container's own words: image, command, exit 0;
 *   §3 the §28 decision lands in the dock ledger: the last entry is approved, names
 *      container.exec as the via, and carries the exec detail;
 *   §4 the whole run raises no console errors (the probe never claims more than it answered).
 *
 * Usage: node tools/harness/studio-container.mjs [--url http://127.0.0.1:3211]
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
const clickTest = (id) =>
  page.evaluate(`(() => { const el = document.querySelector('[data-testid="${id}"]'); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; })()`);

try {
  await page.navigate(`${URL_BASE}/`, { waitForSelector: "#nexus-canvas", waitMs: 400 });
  check("Studio loads in a REAL viewport", true, URL_BASE);

  // §1 the probe lands (first hit compiles the route — give it a generous budget)
  const status = await until(() => testId("container-status"), (t) => !!t && !t.includes("probing") && t.length > 0, 90_000);
  check(
    "§1 probe lands: daemon version + pinned image + container root",
    !!status && status.includes("✓ docker") && status.includes("node:22-alpine") && status.includes("/workspace"),
    `status=${status}`,
  );

  // §2 the ask, the Allow-once, the run
  const runBtn = await until(() => page.evaluate("[...document.querySelectorAll('[data-testid=\"container-run\"]')].length"), (n) => n === 1, 5_000);
  check("§2a self-check offered exactly once when the runtime is available", runBtn === 1, `buttons=${runBtn}`);
  await clickTest("container-run");
  const ask = await until(() => testId("container-ask"), Boolean, 10_000);
  check("§2b the ask names the command, the image and the jail", !!ask && ask.includes("node -e") && ask.includes("node:22-alpine") && ask.includes("/workspace"), `ask=${ask}`);
  await clickTest("container-allow");
  const line = await until(() => testId("container-line"), (t) => !!t && t.includes("exit 0"), 120_000);
  check("§2c the run answers in the container's own words", !!line && line.includes("container node:22-alpine") && line.includes("exit 0"), `line=${line}`);

  // §3 the §28 decision in the ledger
  const ledger = await page.evaluate(
    "(() => { const lines = (localStorage.getItem('nexus.agentLedger.v1') ?? '').split('\\n').filter((l) => l.trim() !== ''); const last = lines[lines.length - 1]; return last ? JSON.parse(last) : null; })()",
  );
  check(
    "§3 the §28 decision landed in the ledger (approved · via container.exec · exec detail)",
    !!ledger && ledger.approved === true && ledger.via === "container.exec" && typeof ledger.goal === "string" && ledger.goal.startsWith("container exec:") && typeof ledger.exec === "string" && ledger.exec.includes("exit 0"),
    `last=${JSON.stringify(ledger)}`,
  );
} catch (err) {
  check("container lane completed without harness error", false, String(err?.stack ?? err));
} finally {
  const consoleErrors = session.consoleMessages.filter((m) => m.type === "error");
  check("§4 no console errors during the run", consoleErrors.length === 0, `${session.consoleMessages.length} console message(s), ${consoleErrors.length} error(s)`);
  await session.close();
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} container-lane assertions passed` +
    (failed.length ? ` — FAILED: ${failed.map((f) => f.name).join(" ; ")}` : ""),
);
process.exit(failed.length ? 1 : 0);