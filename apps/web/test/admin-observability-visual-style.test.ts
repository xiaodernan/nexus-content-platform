import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-35 `/admin/observability` 观测（读侧）——**静态那一寸**。
 *
 * `page.tsx`（server）：两张故意不合并的表——进程内计数器（本实例唯一、重启清零）+
 * 库里的三本账（审计决定/生成任务/API 调用，跨重启）。横滚区 `role="region"`+`tabIndex`，3 列表格。
 * 2026-11-13 合并（并行线《cont. 50》并入）：新增 §AILIVE-7「AI 就绪」面板——每次渲染问
 * ai-service /healthz，把 text/image/video/live capability 与 LLM completion cache
 * （backend / hits / misses / hit rate / degraded）读数以本页同一套 adm/am/tl 门面表呈现。
 * 判据随之更新：SHA256 钉到合并后的字节（25766451…），面板走同一套零裸原子纪律。
 *
 * **剥 className 后全文 SHA256 钉死（EOL 无关）**：`25766451…` 恒等于合并后的 page.tsx。
 * redact 三步序与钉死常量一致。
 *
 * 判据不变式（12 门）：
 *  1. server 组件 + denied×2 + role 闸门 + AdminNav current="observability"；
 *  2. snapshot() + readLedger(24) 进门；3. 字面 className（含三元 ternary）全 `.adm-*`/`.am-*`/`.tl-*`；
 *  4. 零裸 Tailwind；5. 用到的每个类都在 globals.css 有定义；6. `.am-` 段新增类（ledgerGrid/monoMuted/tableNarrow/headRowTight/shellGapXl）定义在门面段；
 *  7. 零写死 hex；8. 零新增颜色 token；9. `.am-ledgerGrid` @media 48rem 三列逐字平移；
 * 10. role="region" + tabIndex={0} 进门；11. `.am-monoMuted` 锚 mono；12. SHA256 守恒 + 钩子守恒。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/admin/observability/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** redact：EOL 归一 + className 任意形态归一 @。与钉死常量一致。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

function frClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.((?:adm|am|ar|au|rl|tl|gw)-[A-Za-z0-9-]+)\s*{/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-35 /admin/observability 观测', () => {
  it('server 组件 + denied×2 + role 闸门 + snapshot()/readLedger(24) 在', () => {
    expect(code).not.toContain('use client');
    expect(code).toContain("export const dynamic = 'force-dynamic'");
    expect(code).toContain('currentUserOrNull()');
    expect(code).toContain("user.role !== 'admin'");
    expect(code).toContain('data-admin-denied="anonymous"');
    expect(code).toContain('data-admin-denied="not-admin"');
    expect(code).toContain('const metrics = snapshot()');
    expect(code).toContain('readLedger(24)');
    expect(code).toContain('<AdminNav current="observability"');
  });

  it('横滚区键盘可达进门 + LedgerTable 三段标记', () => {
    expect(code).toContain('role="region"');
    expect(code).toContain('tabIndex={0}');
    expect(code).toContain('data-metric-table-scroll');
    for (const marker of ['audit', 'tasks', 'api']) {
      expect(code).toContain(`marker="${marker}"`);
    }
    expect(code).toContain('data-ledger-section');
    expect(code).toContain('data-ledger-heading={props.marker}');
  });

  it('template 类名守恒：am-monoCell 由 j === 0 ? … : undefined 三元拼出', () => {
    expect(code).toMatch(/className=\{j === 0 \? 'am-monoCell' : undefined\}/);
  });

  it('§AILIVE-7「AI 就绪」面板：每次渲染问 /healthz，能力读数按 am-tableNarrow 门面表落位', () => {
    expect(code).toContain('getAiCapabilities()');
    expect(code).toContain('data-ai-readiness-section');
    expect(code).toContain('data-ai-readiness-heading');
    for (const hook of [
      'data-ai-readiness-text=',
      'data-ai-readiness-image=',
      'data-ai-readiness-video=',
      'data-ai-readiness-live=',
      'data-ai-readiness-cache-backend=',
      'data-ai-readiness-cache-hits=',
      'data-ai-readiness-cache-misses=',
      'data-ai-readiness-cache-hitrate=',
      'data-ai-readiness-cache-status=',
    ]) {
      expect(code, `AI 就绪面板丢了锚点 ${hook}`).toContain(hook);
    }
    // 面板不引入任何域外类：表自己也走 am-/tl- 家族
    expect(code).toContain('am-tableNarrow');
    expect(code).toContain('tl-thRow');
    expect(code).toContain('am-monoCell');
  });

  it('数据钩子守恒 + 所有 data- metric/ledger 类锚点（续）', () => {
    for (const hook of [
      'data-observability-root',
      'data-observability-scope',
      'data-observability-raw',
      'data-metric-heading=',
      'data-metric-empty',
      'data-metric-row=',
      'data-ledger-section',
      'data-ledger-heading=',
      'data-ledger-empty=',
      'data-ledger-row=',
      'data-observability-raw',
    ]) {
      expect(code, `observability 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .adm-*/.am-*/.tl-*（含 ternary 字面）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(16);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(adm|am|tl)-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（含任意值 atom）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    for (const cls of literals) {
      const bad = cls.split(/\s+/).filter((t) => t && !/^(adm|am|tl)-/.test(t));
      expect(bad, `门面类之外还出现了：${bad.join(' ')}`).toEqual([]);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:adm|am|tl)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(16);
    const defined = frClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('零写死 hex + 零新增颜色 token（ledgerGrid 不带颜色）', () => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(globals).not.toMatch(/--nexus-color-obs-\w*\s*:/);
  });

  it('.am-ledgerGrid @media 48rem 三列逐字平移；monoMuted/tableNarrow/headRowTight/shellGapXl 有定义', () => {
    expect(globals).toContain('@media (min-width: 48rem)');
    expect(globals).toMatch(/\.am-ledgerGrid \{[^}]*minmax\(0, 1fr\)/);
    for (const sel of ['.am-tableNarrow {', '.am-monoMuted {', '.am-headRowTight {', '.am-shellGapXl {', '.am-ledgerTitle {']) {
      expect(globals).toContain(sel);
    }
  });

  it('两个表的 thead 仍是 tl-thRow；空态仍是 adm-capNote', () => {
    expect(code).toContain('tl-thRow');
    expect(code).toContain('adm-capNote');
    expect(tokens).toContain('--nexus-color-fg-3');
  });

  it('剥 className 后全文 SHA256 钉死（合并后的字节：25766451804365c508e9f1646ab3d1ffd229e141220e250f0311c2192c054475）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '25766451804365c508e9f1646ab3d1ffd229e141220e250f0311c2192c054475',
    );
  });
});
