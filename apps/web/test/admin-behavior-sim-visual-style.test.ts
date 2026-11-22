import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §SIM-1 `/admin/behavior-sim` 行为演练
 * 契约（与 /admin/* 其余几面同一道门）：
 *  1. RSC shell + force-dynamic + adm-denied ×2；role=admin 才能进
 *  2. BehaviorSimPanel 是"use client" + 客户端 fetch /api/admin/visitor-sim
 *  3. className 只认 be/adm/am 门面族
 *  4. 数据钩子守恒（data-behavior-sim-*）
 *  5. SHA256 钉死（组件整体字样）
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/admin/behavior-sim/page.tsx');
const PANEL = join(ROOT, 'apps/web/src/app/admin/behavior-sim/BehaviorSimPanel.tsx');
const ROUTE = join(ROOT, 'apps/web/src/app/api/admin/visitor-sim/route.ts');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');

const page = readFileSync(PAGE, 'utf8');
const panel = readFileSync(PANEL, 'utf8');
const route = readFileSync(ROUTE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\r\n/g, '\n');
}

describe('§SIM-1 /admin/behavior-sim 行为演练', () => {
  it('RSC shell：force-dynamic + adm-denied ×2 + 行为管理员门 + AdminNav current=behavior-sim', () => {
    expect(page).toContain('export const dynamic');
    expect(page).toContain("user.role !== 'admin'");
    expect(page).toContain('data-admin-denied="anonymous"');
    expect(page).toContain('data-admin-denied="not-admin"');
    expect(page).toContain('current="behavior-sim"');
    expect(page).toContain('currentUserOrNull()');
  });

  it('BehaviorSimPanel 是 client 组件；钩子 data-behavior-sim-* 齐活', () => {
    expect(panel).toContain("'use client'");
    for (const hook of [
      'data-behavior-sim-actions',
      'data-behavior-sim-run=',
      'data-behavior-sim-error',
      'data-behavior-sim-result',
      'data-behavior-sim-by-profile',
      'data-behavior-sim-profile=',
      'data-behavior-sim-total-visitors',
      'data-behavior-sim-total-opens',
    ]) {
      expect(panel).toContain(hook);
    }
    expect(panel).toContain("fetch('/api/admin/visitor-sim'");
    expect(panel).toContain("headers:");
  });

  it('管理员 API：role=admin 门禁；拒绝兜底；返回 JSON 透传', () => {
    expect(route).toContain("user.role !== 'admin'");
    expect(route).toContain("unauthenticated");
    expect(route).toContain("forbidden");
    expect(route).toContain("cache-control': 'no-store'");
  });

  it('字面 className 只认 be/adm/am 门面族且都有 .be-* 定义', () => {
    const allCode = page + panel;
    const literals = [...allCode.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(6);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `出现域外类：${tok}`).toMatch(/^(be|adm|am)-[A-Za-z0-9]/);
      }
    }
    const clean = cssNoComments(globals);
    for (const cls of ['.be-panel', '.be-panelTitle', '.be-actions', '.be-primaryBtn', '.be-mono', '.be-byProfile', '.be-profileFill', '.be-profileRow', '.be-note']) {
      expect(clean).toContain(cls);
    }
  });

  it('SHA256 钉死（page + panel 二双锚）', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      '7fc95eee28da4a3057475612cedffcae85473f1dbe5ea418152545211ad00856',
    );
    expect(createHash('sha256').update(redactClasses(panel)).digest('hex')).toBe(
      '31ab76119df2cd43808a3259a8cc09155bed83fa3da8084a52adc0c3c7afe27c',
    );
  });
});
