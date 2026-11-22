// 无头跑 .scratch/showcase-avatar-display.html，把读数收进 .scratch/showcase-avatar-display.json
//
// 这份 runner 干三件事：
//   1. 起一个只监听 127.0.0.1 的静态服务（根 = .scratch/），用 http 打开探针页——
//      同源才能读 canvas 像素（file:// 打开时 canvas 被跨源污染，像素读数拿不到）；
//   2. 量**展示页原件**：加载 .scratch/showcase-site/site/index.html，直接读线上那张
//      <img class> 的 computed style 与盒子尺寸——不是复刻，是原件；
//   3. 落盘：读数 JSON + 探针页截图 + 真实站点头像截图。
//
// 用法：node .scratch/showcase-avatar-display.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = process.cwd();
const SCRATCH = join(ROOT, '.scratch');
const CLONE = join(SCRATCH, 'showcase-site', 'site');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
};

const server = createServer((req, res) => {
  const rel = decodeURIComponent((req.url || '/').split('?')[0]);
  const target = join(SCRATCH, normalize(rel).replace(/^([/\\])+/, ''));
  if (!target.startsWith(SCRATCH) || !existsSync(target) || !statSync(target).isFile()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(target)] || 'application/octet-stream' });
  createReadStream(target).pipe(res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`http://127.0.0.1:${port}/showcase-avatar-display.html`);
await page.waitForFunction(() => Boolean(window.__PROBE_RESULT__), null, { timeout: 60_000 });
const probe = await page.evaluate(() => window.__PROBE_RESULT__);
await page.screenshot({ path: join(SCRATCH, 'showcase-avatar-display.png'), fullPage: true });

// ---- 真实展示页原件的读数（不是复刻）----
let site = null;
if (existsSync(join(CLONE, 'index.html'))) {
  const sitePage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await sitePage.goto('file:///' + join(CLONE, 'index.html').replace(/\\/g, '/'));
  await sitePage.waitForLoadState('domcontentloaded');
  await sitePage.waitForTimeout(1200);
  site = await sitePage.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('.profile-frame img'));
    const visible = imgs.filter((i) => {
      const r = i.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(i).display !== 'none';
    });
    const el = visible[0] || imgs[0];
    if (!el) return { found: false, total: 0 };
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const naturalRatio = el.naturalWidth / el.naturalHeight;
    const boxRatio = box.width / box.height;
    return {
      found: true,
      total: imgs.length,
      visibleCount: visible.length,
      src: el.getAttribute('src'),
      alt: el.getAttribute('alt'),
      natural: [el.naturalWidth, el.naturalHeight],
      box: [Number(box.width.toFixed(2)), Number(box.height.toFixed(2))],
      aspectRatio: cs.aspectRatio,
      objectFit: cs.objectFit,
      objectPosition: cs.objectPosition,
      width: cs.width,
      height: cs.height,
      ratioErr: naturalRatio ? Math.abs(boxRatio - naturalRatio) / naturalRatio : 1,
      complete: el.complete && el.naturalWidth > 0,
    };
  });
  const shot = site.found
    ? await sitePage.locator('.profile-frame img').first().screenshot({ path: join(SCRATCH, 'showcase-avatar-display-site.png') })
    : null;
  if (shot) site.screenshotBytes = shot.length;
  await sitePage.close();
}

await browser.close();
server.close();

// ---- 合并判定 ----
const lines = [...probe.lines];
let ok = probe.ok;
if (site && site.found) {
  lines.push('');
  lines.push('—— 展示页原件（.scratch/showcase-site/site/index.html，file:// 实测）——');
  lines.push(`<img class> 命中 ${site.visibleCount}/${site.total} 个可见 · src ${site.src}`);
  lines.push(`源图 ${site.natural[0]}×${site.natural[1]} · 渲染盒 ${site.box[0]}×${site.box[1]} px · 偏差 ${(site.ratioErr * 100).toFixed(3)}%`);
  lines.push(`aspect-ratio ${site.aspectRatio} · object-fit ${site.objectFit} · object-position ${site.objectPosition}`);
  const siteOk = site.complete && site.objectFit === 'contain' && site.ratioErr < 0.01
    && site.natural[0] === 508 && site.natural[1] === 586;
  lines.push(`${siteOk ? 'PASS' : 'FAIL'} · 真实展示页的头像同款规则生效（508×586 + contain + 同比）`);
  if (!siteOk) ok = false;
} else {
  lines.push('');
  lines.push('FAIL · 读不到展示页原件（.scratch/showcase-site/site/index.html 不在？克隆没拉下来就只验了探针页）');
  ok = false;
}
lines.push('');
lines.push(ok ? '总判定：PASS' : '总判定：FAIL');

const result = {
  measuredAt: new Date().toISOString(),
  ok,
  probe,
  site,
  lines,
};
writeFileSync(join(SCRATCH, 'showcase-avatar-display.json'), JSON.stringify(result, null, 2));
console.log(lines.join('\n'));
process.exit(ok ? 0 : 1);
