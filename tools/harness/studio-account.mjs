/**
 * NEXUS Studio — ACCOUNT-face harness (M7 v264).
 *
 * Drives the REAL Studio bundle in a REAL browser (Chrome over the CDP harness in cdp.mjs,
 * ADR 0017) against the REAL dev server, and asserts the account face end-to-end:
 *   §1 the account control exists and the panel opens;
 *   §2 registering writes a REAL record into this origin's localStorage — an account id, the
 *      handle, a display name, an instant and the assurance — and the panel shows the handle
 *      and the assurance;
 *   §3 there is NO "signed in" badge anywhere on the page, because ADR 0018 records that one
 *      would be a lie in this build;
 *   §4 while an account is set the panel offers NO create control: one account per device is
 *      structural here, not a message;
 *   §5 a rename changes the DISPLAY NAME only — the id, the handle and the instant are pinned;
 *   §6 signing out forgets the NAME and keeps the DEVICE SEED;
 *   §7 re-registering the same handle after signing out yields the SAME id, which is the whole
 *      promise of "this device publishes as";
 *   §8 the run raises no console errors.
 *
 * Usage: node tools/harness/studio-account.mjs [--url http://127.0.0.1:3210]
 */
import { launch } from "./cdp.mjs";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const URL_BASE = arg("url", "http://127.0.0.1:3210");

const ACCOUNT_KEY = "nexus-current-account";
const SEED_KEY = "nexus-device-seed";

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

const textOf = (sel) => page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el ? el.textContent.trim() : null; })()`);
const countOf = (sel) => page.evaluate(`(() => document.querySelectorAll(${JSON.stringify(sel)}).length)()`);
const clickSel = (sel) =>
  page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
const stored = (key) => page.evaluate(`(() => { const raw = localStorage.getItem(${JSON.stringify(key)}); if (!raw) return null; try { return JSON.parse(raw); } catch { return { __unparsable: raw }; } })()`);
/** A raw stored value, for the keys that are NOT JSON (the device seed is a plain string). */
const storedRaw = (key) => page.evaluate(`localStorage.getItem(${JSON.stringify(key)})`);
const bodyText = () => page.evaluate("document.body.innerText");

try {
  await page.navigate(`${URL_BASE}/`, { waitForSelector: "#nexus-canvas", waitMs: 400 });
  check("§0 the Studio loads in a REAL viewport", true, URL_BASE);

  // A KNOWN starting point: this harness owns these two keys, and nothing else in the origin
  // is touched. A fresh Chrome profile has neither, but saying so is better than assuming it.
  await page.evaluate(`(() => { localStorage.removeItem(${JSON.stringify(ACCOUNT_KEY)}); localStorage.removeItem(${JSON.stringify(SEED_KEY)}); return true; })()`);

  // ── §1 the account control and the panel ──────────────────────────────────────────
  const controlCount = await countOf('button[title="Account"]');
  check("§1a the account control is on the toolbar", controlCount === 1, `buttons=${controlCount}`);
  await clickSel('button[title="Account"]');
  const panel = await until(() => countOf("[data-toolbar-account]"), (n) => n === 1, 5000);
  check("§1b the panel opens", panel === 1, `panels=${panel}`);

  // ── §2 registering writes a REAL record ───────────────────────────────────────────
  const handle = "ada";
  await page.type("[data-account-handle-input]", handle);
  await page.type("[data-account-display-name]", "Ada Lovelace");
  await clickSel("[data-account-create]");

  const record = await until(() => stored(ACCOUNT_KEY), (r) => r && typeof r === "object", 5000);
  check(
    "§2a registering writes a real account record into this origin's storage",
    !!record && typeof record.id === "string" && record.id.length > 0 && record.handle === handle,
    `record=${JSON.stringify(record)}`,
  );
  check(
    "§2b the record carries the assurance and the instant, and the display name",
    !!record && record.assurance === "unsigned-local" && typeof record.createdAt === "number" && record.createdAt > 0 && record.displayName === "Ada Lovelace",
    `assurance=${record?.assurance} createdAt=${record?.createdAt} displayName=${JSON.stringify(record?.displayName)}`,
  );
  const shownHandle = await until(() => textOf("[data-account-handle]"), (t) => !!t, 5000);
  const shownAssurance = await until(() => textOf("[data-account-assurance]"), (t) => !!t, 5000);
  check(
    "§2c the panel shows the handle and the assurance",
    shownHandle === `@${handle}` && !!shownAssurance && shownAssurance.includes("unsigned-local"),
    `handle=${shownHandle} assurance=${shownAssurance}`,
  );

  // ── §3 NO "signed in" badge ───────────────────────────────────────────────────────
  const text = await bodyText();
  const badgeish = /signed\s*in/i.test(text);
  check("§3 the page carries NO 'signed in' badge (ADR 0018 says one would be a lie)", !badgeish, badgeish ? "the page says 'signed in'" : "no such badge on the page");

  // ── §4 one account per device is STRUCTURAL ──────────────────────────────────────
  const createControls = await countOf("[data-account-create]");
  check("§4 while an account is set the panel offers NO create control", createControls === 0, `create buttons=${createControls}`);

  // ── §5 a rename changes the DISPLAY NAME only ─────────────────────────────────────
  await page.evaluate(`(() => { const el = document.querySelector("[data-account-display-name]"); if (!el) return false; el.value = ""; return true; })()`);
  await page.type("[data-account-display-name]", "Ada L.");
  await clickSel("[data-account-save-name]");
  const renamed = await until(() => stored(ACCOUNT_KEY), (r) => r && r.displayName === "Ada L.", 5000);
  check(
    "§5a the rename changed the display name",
    !!renamed && renamed.displayName === "Ada L.",
    `displayName=${JSON.stringify(renamed?.displayName)}`,
  );
  check(
    "§5b and it changed NOTHING else — the id, the handle and the instant are pinned",
    !!renamed && renamed.id === record.id && renamed.handle === record.handle && renamed.createdAt === record.createdAt && renamed.assurance === record.assurance,
    `before=${JSON.stringify(record)} after=${JSON.stringify(renamed)}`,
  );

  // ── §6 signing out forgets the NAME and keeps the DEVICE SEED ────────────────────
  await clickSel("[data-account-signout]");
  const afterSignOut = await until(() => stored(ACCOUNT_KEY), (r) => r === null, 5000);
  const seedAfter = await storedRaw(SEED_KEY);
  check("§6a signing out forgets the account record", afterSignOut === null, `record=${JSON.stringify(afterSignOut)}`);
  check("§6b and it KEEPS the device seed — signing out is not a factory reset", typeof seedAfter === "string" && seedAfter.length > 0, `seed=${JSON.stringify(seedAfter)}`);

  // ── §7 the same handle on the same device is the same account ─────────────────────
  // The panel clears the handle on sign out, so the handle is typed again — this is the path a person
  // takes, and a register with an EMPTY handle is refused by the session (which the unit suite pins).
  await page.type("[data-account-handle-input]", handle);
  await clickSel("[data-account-create]");
  const reRegistered = await until(() => stored(ACCOUNT_KEY), (r) => r && typeof r === "object", 5000);
  check(
    "§7 re-registering the same handle on the same device yields the SAME id",
    !!reRegistered && reRegistered.id === record.id,
    `before=${JSON.stringify(record)} after=${JSON.stringify(reRegistered)}`,
  );
} catch (err) {
  check("the account lane completed without harness error", false, String(err?.stack ?? err));
} finally {
  const consoleErrors = session.consoleMessages.filter((m) => m.type === "error");
  check("§8 no console errors during the run", consoleErrors.length === 0, `${session.consoleMessages.length} console message(s), ${consoleErrors.length} error(s)`);
  await session.close();
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} account-face assertions passed` +
    (failed.length ? ` — FAILED: ${failed.map((f) => f.name).join(" ; ")}` : ""),
);
process.exit(failed.length ? 1 : 0);
