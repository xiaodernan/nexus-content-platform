import { describe, expect, it } from 'vitest';
import {
  FLUSH_INTERVAL_MS,
  MAX_FLUSH_MS,
  MAX_SAMPLE_MS,
  addVisibleMs,
  classifyVisit,
  clampReportedMs,
  completionPct,
  mergeVisit,
  takePending,
  utcDay,
  validVisitorKey,
} from '../src/lib/visit-meter';

/**
 * §168 采集口径的规则表。这里全是纯算术，因为它管的恰好是"最容易说谎的两个数"：
 * 一次后台挂起能让 play time 多出几小时，一次没滚动的页面能让 completion 变成 0。
 * 每条截断规则都要在单测里钉死——放进浏览器就只能看个大概。
 */

describe('可见时长累加（addVisibleMs）', () => {
  it('正常 tick 如实累加，小数往下取整', () => {
    expect(addVisibleMs(0, 1000)).toBe(1000);
    expect(addVisibleMs(1000, 1234.9)).toBe(2234);
  });

  it('挂起后的超长样本只算上限：宁可少算，不把后台时间当观看时长', () => {
    expect(addVisibleMs(0, 10 * 60 * 1000)).toBe(MAX_SAMPLE_MS);
    // 上限之后还要能继续加，而不是把已有数字吃掉
    expect(addVisibleMs(30_000, 10 * 60 * 1000)).toBe(30_000 + MAX_SAMPLE_MS);
    expect(MAX_SAMPLE_MS).toBeLessThan(FLUSH_INTERVAL_MS);
  });

  it('负数、NaN、Infinity 一律按 0 段处理，现有值原样保住', () => {
    // 系统时钟被往回调过，两次 tick 之间能算出负间隔
    expect(addVisibleMs(5000, -8000)).toBe(5000);
    expect(addVisibleMs(5000, Number.NaN)).toBe(5000);
    expect(addVisibleMs(5000, Number.POSITIVE_INFINITY)).toBe(5000);
    expect(addVisibleMs(-100, 1000)).toBe(1000);
  });
});

describe('上报前的截断（clampReportedMs / takePending）', () => {
  it('只认 number：字符串、null、undefined 都变成 0，不让脏数据进库', () => {
    expect(clampReportedMs('123456')).toBe(0);
    expect(clampReportedMs(null)).toBe(0);
    expect(clampReportedMs(undefined)).toBe(0);
    expect(clampReportedMs({})).toBe(0);
  });

  it('一次上报最多带走 MAX_FLUSH_MS，超了截断而不是拒收整次访问', () => {
    expect(clampReportedMs(MAX_FLUSH_MS)).toBe(MAX_FLUSH_MS);
    expect(clampReportedMs(MAX_FLUSH_MS + 1)).toBe(MAX_FLUSH_MS);
    expect(clampReportedMs(600_000)).toBe(MAX_FLUSH_MS);
    expect(clampReportedMs(-5)).toBe(0);
  });

  it('攒下的时长一次带不走时，剩下的留在本地继续攒，比例两边都带上', () => {
    const split = takePending({ visibleMs: MAX_FLUSH_MS + 20_000, completionPct: 73 });
    expect(split.report).toEqual({ visibleMs: MAX_FLUSH_MS, completionPct: 73 });
    expect(split.rest).toEqual({ visibleMs: 20_000, completionPct: 73 });
    // 没超上限就不该产生任何"剩余"
    const all = takePending({ visibleMs: 500, completionPct: 12 });
    expect(all.report.visibleMs).toBe(500);
    expect(all.rest.visibleMs).toBe(0);
  });
});

describe('完成度 = 最远到达比例（completionPct）', () => {
  it('内容比视口短就是 100%：没有可滚的地方不等于没看完', () => {
    expect(completionPct(0, 800, 800)).toBe(100);
    expect(completionPct(0, 800, 400)).toBe(100);
  });

  it('按滚动到的绝对位置算，不是按滚动条位置算', () => {
    // 1600 高的内容、800 的视口：滚到底部前一行时视口下沿正好接上内容底部
    expect(completionPct(800, 800, 1600)).toBe(100);
    expect(completionPct(400, 800, 1600)).toBe(75);
    expect(completionPct(0, 800, 1600)).toBe(50);
    // 视口本来就占一半，所以"刚打开"就有 50%，不是 0
    expect(completionPct(0, 800, 3200)).toBe(25);
  });

  it('越界与坏数据：负滚动当 0，超过 100 压回 100，高斯噪声不给数', () => {
    expect(completionPct(-500, 800, 1600)).toBe(50);
    expect(completionPct(9999, 800, 1600)).toBe(100);
    expect(completionPct(100, 800, 0)).toBe(0);
    expect(completionPct(100, 800, Number.NaN)).toBe(0);
    expect(completionPct(100, 0, 1600)).toBe(0);
  });
});

describe('一天一行的合并（mergeVisit）', () => {
  it('时长相加、比例取最远，都不是平均数', () => {
    const merged = mergeVisit({ visibleMs: 10_000, completionPct: 90 }, { visibleMs: 5_000, completionPct: 30 });
    expect(merged).toEqual({ visibleMs: 15_000, completionPct: 90 });
    // 反过来：后一次走得更远，比例要跟着走
    expect(mergeVisit({ visibleMs: 10_000, completionPct: 20 }, { visibleMs: 0, completionPct: 65 }).completionPct).toBe(
      65,
    );
  });

  it('来的一侧超上限先截断，坏比例不会把已有数据带坏', () => {
    expect(mergeVisit({ visibleMs: 0, completionPct: 40 }, { visibleMs: 600_000, completionPct: 40 }).visibleMs).toBe(
      MAX_FLUSH_MS,
    );
    expect(mergeVisit({ visibleMs: 1000, completionPct: 40 }, { visibleMs: -100, completionPct: 40 }).visibleMs).toBe(
      1000,
    );
    expect(mergeVisit({ visibleMs: 0, completionPct: -8 }, { visibleMs: 0, completionPct: 500 }).completionPct).toBe(
      100,
    );
  });
});

describe('访客身份与归属日', () => {
  it('匿名 key 只认 32 位小写十六进制，别的一律不收', () => {
    const key = 'a'.repeat(32);
    expect(validVisitorKey(key)).toBe(key);
    expect(validVisitorKey('a'.repeat(31))).toBeNull();
    expect(validVisitorKey('a'.repeat(33))).toBeNull();
    expect(validVisitorKey('A'.repeat(32))).toBeNull();
    expect(validVisitorKey(`sk-${'x'.repeat(30)}`)).toBeNull();
    expect(validVisitorKey('')).toBeNull();
    expect(validVisitorKey(null)).toBeNull();
    expect(validVisitorKey(42)).toBeNull();
  });

  it('归属哪一天由服务端的时刻决定，与本机时区无关', () => {
    expect(utcDay(new Date('2026-09-24T23:30:00.000Z'))).toBe('2026-09-24');
    // UTC 已过午夜：这一刻在东八区是"第二天早上"，在服务端口径里仍算新的一天
    expect(utcDay(new Date('2026-09-25T00:30:00.000Z'))).toBe('2026-09-25');
    expect(utcDay(new Date('2026-09-25T00:30:00.000+08:00'))).toBe('2026-09-24');
  });
});

describe('classifyVisit：疑似爬虫与真人（§168 第三片）', () => {
  const CHROME =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0';

  it('真人的 UA 不命中：名单是保守的，宁可漏掉一个可疑的，也不错杀一个真人', () => {
    expect(classifyVisit(CHROME, false)).toBe(false);
    expect(classifyVisit(SAFARI, false)).toBe(false);
    expect(classifyVisit(FIREFOX, false)).toBe(false);
    // UA 大小写混写也一样（真实 UA 就是混的）
    expect(classifyVisit('Mozilla/5.0 (compatible; Something)', false)).toBe(false);
  });

  it('自报 navigator.webdriver = true 直接算自动化（Playwright / Puppeteer / Selenium）', () => {
    expect(classifyVisit(CHROME, true)).toBe(true);
    // 自报之外 UA 干净也照算：标记本身就是那条信号
    expect(classifyVisit(SAFARI, true)).toBe(true);
    // 谎报 false 只能骗到自己——UA 名单还在兜底
    expect(classifyVisit('Mozilla/5.0 (compatible; Googlebot/2.1)', false)).toBe(true);
  });

  it('公认的产品名与脚本客户端串命中；空 UA 也算（浏览器一定带 UA）', () => {
    expect(classifyVisit('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', false)).toBe(true);
    expect(classifyVisit('curl/8.5.0', false)).toBe(true);
    expect(classifyVisit('python-requests/2.31.0', false)).toBe(true);
    expect(classifyVisit('Scrapy/2.11 (+https://scrapy.org)', false)).toBe(true);
    expect(classifyVisit('okhttp/4.12.0', false)).toBe(true);
    expect(classifyVisit('', false)).toBe(true);
    expect(classifyVisit(null, false)).toBe(true);
    expect(classifyVisit(undefined, false)).toBe(true);
  });

  it('不放 "headless" 进名单：新版无头 Chrome 的 UA 与真人相同，e2e 也跑在无头 Chrome 里', () => {
    const headless = CHROME.replace('Chrome/131.0.0.0', 'HeadlessChrome/131.0.0.0');
    expect(classifyVisit(headless, false)).toBe(false);
    // 真正的自动化标记是 webdriver——VisitMeter 会自报它
    expect(classifyVisit(headless, true)).toBe(true);
  });
});
