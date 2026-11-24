import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §OV-2 `/onboarding` 上手漫游——静态不变式。
 *
 * 1. 'use client' 仅限 OnboardingTour.tsx；RSC page 保 Title/locale/metadata/force-dynamic；
 * 2. 钩子守恒（root/tour/step/cta/done/reset/progress）；3. 数据源只认双语 STEPS（无网络、无 provider）；
 * 4. 门面类只认 .obv-*；§OV-1 段定义齐；段内零 hex；forced-colors 收口；var() 全声明；
 * 5. 里“localStorage”可出现但必须 try/catch 包（§159 不伪造已持久化）；不画“假进度”——progress 只按实数按钮计数；
 * 6. 无外部 CDN、无 <img>、不 fetch。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/onboarding/page.tsx');
const TOUR = join(ROOT, 'apps/web/src/app/onboarding/OnboardingTour.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const tour = readFileSync(TOUR, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const OV_START = globals.indexOf('§OV-1');
if (OV_START < 0) throw new Error('globals.css 里没有 §OV-1 段');
const ovSegment = globals.slice(OV_START);

describe('§OV-2 /onboarding 上手漫游', () => {
  it('RSC 壳 + generateMetadata + force-dynamic + locale', () => {
    expect(page.slice(0, 60)).not.toContain('use client');
    expect(page).toContain('export const dynamic');
    expect(page).toContain('generateMetadata');
    expect(page).toContain('getLocale');
  });

  it('OnboardingTour 是 client 组件；不发请求', () => {
    expect(tour.slice(0, 40)).toContain('use client');
    expect(tour).not.toMatch(/\bfetch\s*\(/);
    expect(tour).not.toMatch(/\b(?:XMLHttpRequest|WebSocket|sendBeacon)\b/);
    expect(tour).not.toMatch(/\bchatWith[A-Za-z0-9_]*\s*\(/);
    expect(tour).not.toContain('/api/');
    expect(tour).toContain('真实 provider');
  });

  it('双语 STEPS 齐（zh + en，7 步同步）', () => {
    for (const marker of ['think', 'create', 'studio', 'save', 'publish', 'discover', 'tide']) {
      expect([...tour.matchAll(new RegExp(`key: '${marker}'`, 'g'))]).toHaveLength(2);
    }
    expect(tour).toContain('zh: [');
    expect(tour).toContain('en: [');
    expect(tour).toContain('本地自检进度');
    expect(tour).toContain('Local self-check progress');
    expect(tour).not.toContain("key: 'snap'");
  });

  it('钩子守恒', () => {
    for (const hook of [
      'data-onboarding-root',
      'data-onboarding-locale=',
      'data-onboarding-tour',
      'data-onboarding-step=',
      'data-onboarding-cta',
      'data-onboarding-done',
      'data-onboarding-reset',
      'data-onboarding-progress-text',
      'data-onboarding-storage-unavailable',
    ]) {
      expect(page + tour, `Onboarding 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('localStorage 必须 try/catch 包（§159：不假装持久化成功）', () => {
    const idx = tour.indexOf('localStorage');
    expect(idx).toBeGreaterThan(-1);
    expect(tour).toMatch(/try\s*\{[\s\S]*?localStorage[\s\S]*?\}\s*catch/);
    expect(tour).toContain('setStorageAvailable(false)');
    expect(tour).toContain('data-onboarding-storage-unavailable');
    expect(tour).toContain('不会假装已持久化');
    expect(tour).toContain('not presented as persisted');
  });

  it('本地存储记录先校验形状与已知步骤，坏数据不退化成崩溃或额外完成数', () => {
    expect(tour).toContain('function parseDone');
    expect(tour).toContain("typeof parsed !== 'object'");
    expect(tour).toContain('Array.isArray(parsed)');
    expect(tour).toContain('new Set<string>(STEPS.zh.map((step) => step.key))');
    expect(tour).toContain("typeof value === 'boolean'");
    expect(tour).toContain('setDone(parseDone(raw))');
  });

  it('字面 className 只认 .obv-*；无裸 Tailwind 原子类', () => {
    for (const file of [page, tour]) {
      const literals = [...file.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      expect(literals.length).toBeGreaterThanOrEqual(8);
      for (const cls of literals) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) {
          expect(tok, `出现域外类：${tok}`).toMatch(/^obv-[A-Za-z0-9][A-Za-z0-9-]*$/);
        }
      }
    }
  });

  it('.obv-* 全部在 §OV-1 段定义；段内零 hex；forced-colors 收口', () => {
    expect(ovSegment.length).toBeGreaterThan(1200);
    expect(ovSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const cls of ['.obv-root', '.obv-title', '.obv-tour', '.obv-progressBar', '.obv-progressFill', '.obv-storageNote', '.obv-stepCard', '.obv-stepTitle', '.obv-stepCta', '.obv-stepToggle', '.obv-reset', '.obv-foot', '.obv-footLink']) {
      expect(ovSegment, `§OV-1 段没有定义 ${cls}`).toContain(cls + ' {');
    }
    expect(ovSegment).toContain('@media (forced-colors: active)');
  });

  it('§OV-1 段 var(--nexus-*) 全在 tokens.css 声明（零写死 hex）', () => {
    const used = [...new Set([...ovSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(8);
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('进度只按实数计数（不做多计，控件已计数）', () => {
    expect(tour).toContain('completedCount');
    // 不允许加假分母或假完成：
    expect(tour).not.toMatch(/completedCount\+[0-9]/);
    expect(tour).not.toMatch(/Math\.max\(\s*0\s*,\s*0/);
  });
});
