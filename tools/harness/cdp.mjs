/**
 * NEXUS verification harness — minimal CDP client over stdio pipes.
 *
 * Why hand-rolled instead of puppeteer/playwright:
 *   - zero dependencies (the milestone gates must run `npm ci && node …` with no extra install),
 *   - works on Windows (the in-app browser surface the earlier milestones relied on does NOT,
 *     and its screenshot/pointer path was never reproducible — see ADR 0017).
 *
 * Transport: Chrome's `--remote-debugging-pipe` speaks length-prefixed JSON *(not* JSON-RPC
 * framed with a newline) over fd 3 (commands in) and fd 4 (events out). Length prefix is
 * decimal ASCII digits followed by a NUL byte, then the JSON payload.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_CANDIDATES = [
  process.env.NEXUS_CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "google-chrome",
  "chromium",
].filter(Boolean);

/** @returns {string} an existing browser binary path (existence is verified by the caller). */
export function chromeCandidates() {
  return [...CHROME_CANDIDATES];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Frame a CDP message for the debugging pipe.
 *
 * Empirically pinned against Chrome 153 on Windows (`tools/harness/probe.mjs`): the pipe
 * carries **plain NUL-terminated JSON in both directions** — there is no length prefix.
 * This is worth stating because the obvious guess (`<length>\0<json>`, as used by some
 * other bindings) is wrong here and fails in a very confusing way: Chrome parses the
 * *length digits themselves* as a message, answers `-32600 Message must be an object`,
 * and the real command only works if it also happens to be NUL-terminated. A first version
 * of this client shipped that bug and could never get a `Target.getTargets` reply.
 */
function frame(message, sessionId) {
  const json = JSON.stringify(sessionId ? { ...message, sessionId } : message);
  return Buffer.concat([Buffer.from(json, "utf8"), Buffer.from([0])]);
}

/**
 * Launch a headless browser and return a connected session.
 *
 * @param {object} [opts]
 * @param {string} [opts.binary]   explicit browser path
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @param {boolean} [opts.headless] default true
 * @param {number} [opts.timeout]  per-command timeout (ms)
 */
export async function launch(opts = {}) {
  const binary = opts.binary ?? (await resolveBinary());
  const width = opts.width ?? 1280;
  const height = opts.height ?? 800;
  const headless = opts.headless !== false;
  const profile = mkdtempSync(join(tmpdir(), "nexus-cdp-"));

  const args = [
    `--remote-debugging-pipe`,
    `--user-data-dir=${profile}`,
    `--no-first-run`,
    `--no-default-browser-check`,
    `--disable-extensions`,
    `--disable-background-networking`,
    `--disable-sync`,
    `--disable-translate`,
    `--mute-audio`,
    `--hide-scrollbars`,
    `--allow-file-access-from-files`,
    `--disable-features=CalculateNativeWinOcclusion,TranslateUI`,
    `--window-size=${width},${height}`,
    "--force-color-profile=srgb",
  ];
  if (headless) args.push("--headless=new", "--disable-gpu", "--no-sandbox");
  args.push("about:blank");

  const child = spawn(binary, args, {
    stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"],
  });
  // Chrome hard-requires the debugging-pipe fds to be numbered exactly 3 (commands in)
  // and 4 (events out). We ask Node for four pipes so that fd 3 = commands and
  // fd 4 = events; `child.stdio` is a read-only getter for fd 3+ on this Node, so we
  // relabel the two streams Node did expose for our own bookkeeping.
  const pipeIn = child.stdio[3];
  const pipeOut = child.stdio[4];
  child.stdio[3] = pipeIn;
  child.stdio[4] = pipeOut;

  const session = new CdpSession(child, opts.timeout ?? 30000);
  session._profile = profile;
  await session.ready();
  return session;
}

export async function resolveBinary() {
  const { accessSync } = await import("node:fs");
  for (const candidate of CHROME_CANDIDATES) {
    try {
      accessSync(candidate);
      return candidate;
    } catch {
      /* keep looking */
    }
  }
  // Last resort: let spawn search PATH.
  return CHROME_CANDIDATES[CANDIDATE_FALLBACK];
}
const CANDIDATE_FALLBACK = CHROME_CANDIDATES.findIndex((c) => c === "google-chrome");

class CdpSession {
  constructor(child, defaultTimeout) {
    this.child = child;
    this.defaultTimeout = defaultTimeout;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.consoleMessages = [];
    this.pageErrors = [];
    this.protocolNoise = [];
    this.closed = false;
    this._buf = Buffer.alloc(0);
    this._targetSessionId = null;

    child.stdio[4].on("data", (chunk) => this._onData(chunk));
    child.stdio[4].on("error", () => {});
    child.stdio[3].on("error", () => {});
    child.on("exit", () => {
      this.closed = true;
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error("browser exited"));
      }
      this.pending.clear();
    });
  }

  _onData(chunk) {
    this._buf = Buffer.concat([this._buf, chunk]);
    for (;;) {
      const nul = this._buf.indexOf(0);
      if (nul === -1) return;
      const payload = this._buf.subarray(0, nul).toString("utf8");
      this._buf = this._buf.subarray(nul + 1);
      if (!payload.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(payload);
      } catch {
        this.protocolNoise.push(payload.slice(0, 200));
        continue;
      }
      this._dispatch(msg);
    }
  }

  _dispatch(msg) {
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject, timer } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      clearTimeout(timer);
      if (msg.error) reject(new Error(`${msg.error.message ?? "CDP error"} (${msg.error.code})`));
      else resolve(msg.result);
      return;
    }
    if (msg.method === "Runtime.consoleAPICalled") {
      const text = (msg.params.args ?? [])
        .map((a) => (a.value !== undefined ? String(a.value) : (a.description ?? a.type)))
        .join(" ");
      this.consoleMessages.push({ type: msg.params.type, text });
    }
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      this.pageErrors.push({
        text: d.exception?.description ?? d.text ?? "unknown",
        url: d.url,
        line: d.lineNumber,
      });
    }
    for (const fn of this.listeners) fn(msg);
  }

  /** Wait until the browser-side pipe is answering. */
  async ready() {
    // The first command over the pipe implicitly creates the browser target session.
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const { targetInfos } = await this.send("Target.getTargets", {}, 2000);
        if (targetInfos?.length) return;
      } catch {
        /* retry */
      }
      await sleep(100);
    }
    throw new Error("browser did not become ready over the debugging pipe");
  }

  send(method, params = {}, timeout = this.defaultTimeout) {
    if (this.closed) return Promise.reject(new Error("browser exited"));
    const id = this.nextId++;
    const framed = frame({ id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout after ${timeout}ms: ${method}`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.child.stdio[3].write(framed);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Open a page target, attach, and enable Runtime/Page/Log/Console domains. */
  async newPage(url = "about:blank", { viewport } = {}) {
    const { targetId } = await this.send("Target.createTarget", { url });
    const { sessionId } = await this.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const page = new CdpPage(this, sessionId, targetId);
    await page._setup(viewport);
    return page;
  }

  async close() {
    try {
      await this.send("Browser.close", {}, 3000);
    } catch {
      /* ignore */
    }
    try {
      this.child.kill();
    } catch {
      /* ignore */
    }
    try {
      rmSync(this._profile, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

class CdpPage {
  constructor(session, sessionId, targetId) {
    this.session = session;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.events = [];
    this._unsub = session.on((msg) => {
      if (msg.sessionId === sessionId) {
        this.events.push(msg);
        // Keep the buffer bounded — a long-lived harness must not grow without limit.
        if (this.events.length > 512) this.events.splice(0, this.events.length - 512);
      }
    });
  }

  /** Route page-domain commands through the flattened session id. */
  send(method, params = {}, timeout) {
    const id = this.session.nextId++;
    const framed = frame({ id, method, params }, this.sessionId);
    return new Promise((resolve, reject) => {
      const t = timeout ?? this.session.defaultTimeout;
      const timer = setTimeout(() => {
        this.session.pending.delete(id);
        reject(new Error(`CDP timeout after ${t}ms: ${method}`));
      }, t);
      this.session.pending.set(id, { resolve, reject, timer });
      this.session.child.stdio[3].write(framed);
    });
  }

  async _setup(viewport) {
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Log.enable").catch(() => {});
    if (viewport) await this.setViewport(viewport);
  }

  async setViewport({ width, height, deviceScaleFactor = 1 }) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor,
      mobile: false,
    });
  }

  /**
   * Navigate and wait for readiness.
   *
   * The load-event promise is `.catch`-ed **at creation**, not at the await: if the CDP send
   * below throws (or a dev server is still compiling on first request), an unattached rejection
   * would otherwise surface ~20s later as an unhandled rejection and kill the process. Readiness
   * is then confirmed by the selector, which is the signal that actually matters.
   */
  async navigate(url, { waitMs = 0, waitForSelector, loadTimeout = 45000 } = {}) {
    // Drop stale lifecycle events so a fresh navigation can't be satisfied by the last one.
    this.events.length = 0;
    const loaded = this.waitFor("Page.loadEventFired", loadTimeout).catch(() => null);
    await this.send("Page.navigate", { url }, loadTimeout + 5000);
    await loaded;
    if (waitForSelector) await this.waitForSelector(waitForSelector, loadTimeout);
    if (waitMs) await sleep(waitMs);
  }

  waitFor(method, timeout = 10000) {
    const existing = this.events.find((e) => e.method === method);
    if (existing) return Promise.resolve(existing.params);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.session.listeners.delete(onMsg);
        reject(new Error(`timeout waiting for ${method}`));
      }, timeout);
      const onMsg = (msg) => {
        if (msg.sessionId === this.sessionId && msg.method === method) {
          clearTimeout(timer);
          this.session.listeners.delete(onMsg);
          resolve(msg.params);
        }
      };
      this.session.listeners.add(onMsg);
    });
  }

  async waitForSelector(selector, timeout = 10000) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const found = await this.evaluate(
        `!!document.querySelector(${JSON.stringify(selector)})`,
      ).catch(() => false);
      if (found) return true;
      if (Date.now() > deadline) throw new Error(`selector not found: ${selector}`);
      await sleep(100);
    }
  }

  async waitForFunction(expr, { timeout = 10000, arg } = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const value = await this.evaluate(expr, { arg }).catch(() => undefined);
      if (value) return value;
      if (Date.now() > deadline) throw new Error(`condition not met: ${expr}`);
      await sleep(100);
    }
  }

  /**
   * Evaluate an expression in the page.
   * `arg` is exposed as the global `__arg` (JSON-serialised) for use in the expression.
   */
  async evaluate(expr, { arg, timeout } = {}) {
    const wrapped = arg === undefined ? `(() => (${expr}))()` : `(() => { const __arg = ${JSON.stringify(arg)}; return (${expr}); })()`;
    const res = await this.send(
      "Runtime.evaluate",
      {
        expression: wrapped,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
      },
      timeout,
    );
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error(`page exception: ${d.exception?.description ?? d.text}`);
    }
    return res.result?.value;
  }

  /** Fire a real trusted-like pointer sequence at the centre of a selector. */
  async click(selector, { button = "left", clickCount = 1 } = {}) {
    const box = await this.evaluate(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null; const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`,
    );
    if (!box) throw new Error(`click target missing: ${selector}`);
    return this.clickAt(box.x, box.y, { button, clickCount });
  }

  async clickAt(x, y, { button = "left", clickCount = 1 } = {}) {
    const common = { x, y, button, clickCount, buttons: button === "left" ? 1 : 0 };
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", ...common });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...common, buttons: 0 });
  }

  async type(selector, text, { clear = true, delay = 0 } = {}) {
    if (clear) {
      await this.evaluate(
        `(() => { const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false; el.focus();
          // The setter must come from the ELEMENT'S OWN prototype: HTMLInputElement's value setter
          // throws "Illegal invocation" when it is called on a <textarea>. Picking the input's setter
          // first (as this did) made typing into a textarea crash the run.
          const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto,'value')?.set;
          if (setter) setter.call(el, ''); else el.value = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return true; })()`,
      );
    }
    await this.evaluate(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el) el.focus(); return !!el; })()`,
    );
    for (const ch of text) {
      await this.send("Input.dispatchKeyEvent", { type: "keyDown", text: ch, unmodifiedText: ch });
      await this.send("Input.dispatchKeyEvent", { type: "keyUp", text: ch, unmodifiedText: ch });
      if (delay) await sleep(delay);
    }
    return this.evaluate(
      `document.querySelector(${JSON.stringify(selector)})?.value ?? null`,
    );
  }

  /** True when the page reports itself hidden (the old harness's blocker). */
  async isHidden() {
    return this.evaluate("document.hidden");
  }

  async viewport() {
    return this.evaluate(
      "({w: window.innerWidth, h: window.innerHeight, dpr: devicePixelRatio, hidden: document.hidden})",
    );
  }

  /** Navigate back to the top of the DOM as text (works headless with no extra deps). */
  async dom() {
    return this.evaluate("document.documentElement.outerHTML");
  }

  async text(selector) {
    return this.evaluate(
      `document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`,
    );
  }

  async count(selector) {
    return this.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  }

  /** Read canvas pixels via a 2D readback of a drawn canvas element. */
  async canvasStats(selector) {
    return this.evaluate(
      `(() => { const c = document.querySelector(${JSON.stringify(selector)});
        if (!c) return null;
        const r = c.getBoundingClientRect();
        let ctx = null; let data = null;
        try { ctx = c.getContext('2d'); } catch { /* webgl */ }
        if (ctx) { try { data = ctx.getImageData(0,0,c.width,c.height).data; } catch { data = null; } }
        if (!data) return { found: true, w: c.width, h: c.height, cssW: r.width, cssH: r.height, pixels: null };
        let nonEmpty = 0; const colors = new Set();
        for (let i = 0; i < data.length; i += 4) {
          if (data[i+3] !== 0) { nonEmpty++; if (colors.size < 40) colors.add(data[i]+','+data[i+1]+','+data[i+2]); }
        }
        return { found: true, w: c.width, h: c.height, cssW: r.width, cssH: r.height,
                 nonEmpty, total: data.length/4, distinctColors: colors.size }; })()`,
    );
  }

  async close() {
    this._unsub?.();
    try {
      await this.session.send("Target.closeTarget", { targetId: this.targetId }, 3000);
    } catch {
      /* ignore */
    }
  }
}

export { sleep };
