import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §INSIGHT-2 `/insight` 观察哨（管理员洞察台 · 口令 123）——静态不变式。
 *
 * 判据：
 * 1. RSC-only（零 'use client'）；force-dynamic + metadata；
 * 2. 数据只来自服务端域 `@/server/domain/insight` + 纯函数 `@/lib/insight-math` / `insight-rules` / `llmSavingsAdmin`；
 * 3. 页面本身零 fetch/provider 字面（登录动作只在 `InsightGate.tsx` 里，且只打 `/api/insight/login`）；
 * 4. 口令真值在 `/api/insight/login`：默认 123（用户拍板）、环境变量可覆盖、httpOnly Cookie、IP 限流 30/5min；
 * 5. 钩子守恒（data-insight-*）；门面类只认 `.insg-*`；§INSIGHT-1 段零 hex；forced-colors 收口；
 * 6. 双语 COPY 齐（zh/en）；数字展示全用实数表达式（hits / projects / authorized forms）；
 * 7. 趋势预测走 insight-math 的 leastSquares（不是假定的斜率）。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/insight/page.tsx');
const GATE = join(ROOT, 'apps/web/src/components/InsightGate.tsx');
const LOGOUT = join(ROOT, 'apps/web/src/components/InsightLogoutButton.tsx');
const LOGIN = join(ROOT, 'apps/web/src/app/api/insight/login/route.ts');
const DOMAIN = join(ROOT, 'apps/web/src/server/domain/insight.ts');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');
const AICA = join(ROOT, 'apps/web/src/components/InsightAiAnalysis.tsx');

const page = readFileSync(PAGE, 'utf8');
const gate = readFileSync(GATE, 'utf8');
const logout = readFileSync(LOGOUT, 'utf8');
const login = readFileSync(LOGIN, 'utf8');
const domain = readFileSync(DOMAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const aica = readFileSync(AICA, 'utf8');

const INSIGHT_START = globals.indexOf('§INSIGHT-1');
if (INSIGHT_START < 0) throw new Error('globals.css 里没有 §INSIGHT-1 段');
const insSegment = globals.slice(INSIGHT_START);

describe('§INSIGHT-2 /insight 观察哨', () => {
  it('RSC + force-dynamic + metadata；页面零 fetch/provider 字面', () => {
    expect(page.slice(0, 60)).not.toContain('use client');
    expect(page).toContain('export const dynamic');
    expect(page).toContain('export const metadata');
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('provider');
  });

  it('数据源只认服务端域与纯函数（不双算、不走网络）', () => {
    expect(page).toContain("from '@/server/domain/insight'");
    expect(page).toContain("from '@/lib/insight-math'");
    expect(page).toContain("from '@/lib/insight-rules'");
    expect(page).toContain("from '@/lib/llmSavingsAdmin'");
    expect(domain).toContain('collectInsightSnapshot');
    expect(domain).not.toContain('fetch(');
  });

  it('双语 COPY 齐（zh/en 同键）', () => {
    expect(page).toContain('zh: {');
    expect(page).toContain('en: {');
    for (const key of ['kicker', 'title', 'lede', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']) {
      expect(page).toContain(key + ':');
    }
    expect(page).toContain('InsightAiAnalysis');
    expect(aica).toContain("fetch('/api/insight/analyze'");
  });

  it('口令门：默认 123、环境变量可覆盖、httpOnly Cookie、IP 限流', () => {
    expect(login).toContain("process.env.NEXUS_INSIGHT_PASSWORD ?? '123'");
    expect(login).toContain('httpOnly: true');
    expect(login).toContain('30, 300_000');
    expect(gate).toContain("fetch('/api/insight/login'");
    expect(gate).not.toMatch(/fetch\('\/api\/(?!insight\/login)/);
    expect(logout).toContain("fetch('/api/insight/logout'");
  });

  it('data-insight-* 钩子守恒', () => {
    for (const hook of [
      'data-insight-root',
      'data-insight-locale=',
      'data-insight-locked',
      'data-insight-stat',
      'data-insight-section=',
      'data-insight-trend-row',
      'data-insight-action=',
      'data-insight-gate',
      'data-insight-password',
      'data-insight-submit',
      'data-insight-error',
      'data-insight-logout',
      'data-insight-ai-card',
      'data-insight-ai-button',
      'data-insight-ai-output',
      'data-insight-ai-honest',
      'data-insight-ai-badge',
    ]) {
      expect(page + gate + logout + aica, `Insight 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .insg-*；无裸 Tailwind 原子类', () => {
    const counts: Record<string, number> = { [PAGE]: 6, [GATE]: 1, [LOGOUT]: 1, [AICA]: 4 };
    for (const file of [page, gate, logout, aica]) {
      const literals = [...file.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      const min = counts[file === page ? PAGE : file === gate ? GATE : file === logout ? LOGOUT : AICA]!;
      expect(literals.length).toBeGreaterThanOrEqual(min);
      for (const cls of literals) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) {
          expect(tok, `出现域外类：${tok}`).toMatch(/^insg-[A-Za-z0-9][A-Za-z0-9-]*$/);
        }
      }
    }
  });

  it('.insg-* 全部在 §INSIGHT-1 段定义；段内零 hex；forced-colors 收口', () => {
    expect(insSegment.length).toBeGreaterThan(1000);
    expect(insSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const cls of [
      '.insg-root',
      '.insg-hero',
      '.insg-title',
      '.insg-statGrid',
      '.insg-statValue',
      '.insg-trendTable',
      '.insg-signalBar',
      '.insg-signalFill',
      '.insg-actionCard',
      '.insg-severity-act',
      '.insg-severity-watch',
      '.insg-gate',
      '.insg-gateInput',
      '.insg-logout',
      '.insg-foot',
      '.insg-aiCard',
      '.insg-aiBtn',
      '.insg-aiBadge',
      '.insg-aiHonest',
    ]) {
      expect(insSegment, `§INSIGHT-1 段没有定义 ${cls}`).toContain(cls + ' {');
    }
    expect(insSegment).toContain('@media (forced-colors: active)');
  });

  it('§INSIGHT-1 段 var(--nexus-*) 全在 tokens.css 声明（零写死 hex）', () => {
    const used = [...new Set([...insSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(8);
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('趋势预测与命中数走真实公式（leastSquares / weightedHitRate），不是假定斜率', () => {
    expect(page).toContain('leastSquares(');
    expect(page).toContain('projectHorizonSum(');
    expect(page).toContain('weightedHitRate(');
    expect(page).toContain('evaluateInsightRules(');
  });

  it('hotfix：aiCalls30d 只用 usage 表（不混合 agentTasks 口径）', () => {
    expect(page).toContain("['aiCalls30d', snap.totals.usageCalls30d],");
    expect(page).not.toContain('usageCalls30d + snap');
  });
});
