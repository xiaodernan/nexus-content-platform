/**
 * Smoke test for the CDP harness itself.
 * Proves: the browser really launches, JS really executes, the viewport is REALLY visible
 * (the blocker the earlier milestones hit), canvas pixel readback works, and screenshots
 * are accepted. Run: node tools/harness/smoke.mjs
 */
import { launch } from "./cdp.mjs";

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const session = await launch({ width: 1280, height: 800 });
const page = await session.newPage("about:blank");

try {
  // 1. DOM + JS execution
  await page.navigate(
    "data:text/html,<title>nexus</title><div id=root><span class=item>a</span><span class=item>b</span></div>",
  );
  const count = await page.count(".item");
  record("js executes / selector counts", count === 2, `${count} .item nodes`);

  // 2. The real blocker from M1/M2: is the viewport visible?
  const vp = await page.viewport();
  record(
    "viewport is REAL (non-zero, visible)",
    vp.w > 0 && vp.h > 0 && vp.hidden === false,
    `${vp.w}x${vp.h} dpr=${vp.dpr} hidden=${vp.hidden}`,
  );

  // 3. requestAnimationFrame actually runs (suspended in the old hidden surface)
  const frames = await page.evaluate(
    `new Promise((res) => { let n = 0; const t0 = performance.now();
       const tick = () => { n++; if (performance.now() - t0 > 250) res(n); else requestAnimationFrame(tick); };
       requestAnimationFrame(tick); })`,
  );
  record("requestAnimationFrame runs", frames > 3, `${frames} frames in 250ms`);

  // 4. Canvas is paintable and readable back
  await page.navigate("data:text/html,<canvas id=c width=64 height=64></canvas>");
  const painted = await page.evaluate(
    `(() => { const c = document.getElementById('c'); const g = c.getContext('2d');
       g.fillStyle = '#e11d48'; g.fillRect(0,0,64,64); return true; })()`,
  );
  const stats = await page.canvasStats("#c");
  record(
    "canvas paint + pixel readback",
    painted && stats && stats.nonEmpty === 64 * 64,
    `${stats ? `${stats.nonEmpty}/${stats.total} px non-transparent` : "no stats"}`,
  );

  // 5. Screenshots are ACCEPTED (refused by the old harness)
  const shot = await page.send("Page.captureScreenshot", { format: "png" });
  const bytes = shot?.data ? Buffer.from(shot.data, "base64").length : 0;
  record("Page.captureScreenshot accepted", bytes > 1000, `${bytes} bytes png`);

  // 6. Trusted input dispatch (the agent's §29/§63 click path)
  await page.navigate(
    "data:text/html,<button id=b onclick=\"this.textContent='clicked'\">idle</button>",
  );
  await page.click("#b");
  const label = await page.text("#b");
  record("trusted pointer click reaches handlers", label === "clicked", `label=${label}`);

  // 7. Typing into a React-style input (value setter + input event)
  await page.navigate("data:text/html,<input id=i>");
  await page.type("#i", "nexus");
  const value = await page.evaluate("document.querySelector('#i').value");
  record("keyboard events type into inputs", value === "nexus", `value=${value}`);

  // 8. Console/page-error capture
  await page.navigate("data:text/html,<script>console.log('hello-nexus');</script>");
  const sawLog = session.consoleMessages.some((m) => m.text.includes("hello-nexus"));
  record("console capture", sawLog, `${session.consoleMessages.length} messages`);
} finally {
  await session.close();
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} harness capabilities verified` +
    (failed.length ? ` — FAILED: ${failed.map((f) => f.name).join(", ")}` : ""),
);
process.exit(failed.length ? 1 : 0);
