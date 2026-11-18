import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ──MARKETPLACE-PICKS /marketplace "AI 选品"（cont. 196）
 *
 *  1. MarketplacePicks 是 client 组件；/marketplace 引用之；/api/marketplace/picks 服务端起草
 *  2. className 只允许 .mkp-*（.mk-* 归 marketplace 本组页，.mkp-* 为本组件）
 *  3. .mkp-* 全部收在 globals.css；forced-colors 有回退；零 hex
 *  4. 服务端纪律：DEMO MODE 409；10/小时/IP；24h LRU；4 槽；zod 全覆盖；缺一条即 502
 *  5. 荐语只引用实测字段（价格 / 下载量）——不对作品质量做事实断言（套件机械断言 prompt）
 *  6. SHA256 钉死（className 脱敏后）
 */
const ROOT = process.cwd();
const CARD = join(ROOT, 'apps/web/src/components/MarketplacePicks.tsx');
const API_ROUTE = join(ROOT, 'apps/web/src/app/api/marketplace/picks/route.ts');
const PAGE = join(ROOT, 'apps/web/src/app/marketplace/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const card = readFileSync(CARD, 'utf8');
const apiRoute = readFileSync(API_ROUTE, 'utf8');
const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const code = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const MKP_START = globals.indexOf('.mkp-strip {');
if (MKP_START < 0) throw new Error('globals.css 里没有 .mkp-* 段');
const mkpSegment = globals.slice(MKP_START).replace(/\/\*[\s\S]*?\*\//g, '');

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

const classLiterals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);

describe('──MARKETPLACE-PICKS /marketplace "AI 选品"', () => {
  it('MarketplacePicks 是 client 组件，文案中英双语且诚实降级', () => {
    expect(code).toContain('use client');
    expect(code).toContain('const COPY');
    expect(code).toContain('locale');
    // 公共页：出错安静消失
    expect(card).toContain('公共页：出错安静消失');
  });

  it('服务端纪律：DEMO MODE 409；10/小时/IP；24h LRU；4 槽；zod 覆盖全部卡', () => {
    expect(apiRoute).toContain('demo_mode');
    expect(apiRoute).toContain("rateKey('marketplace-picks'");
    expect(apiRoute).toContain('10, 60 * 60 * 1000');
    expect(apiRoute).toContain('TTL_MS = 24 * 60 * 60 * 1000');
    expect(apiRoute).toContain('LRU_MAX = 4');
    expect(apiRoute).toContain('z.object({');
    // prompt 明确禁止质量断言，只允许数字+类型常识
    expect(apiRoute).toContain('不能对质量做任何事实断言');
    expect(apiRoute).toContain('downloads');
  });

  it('/marketplace 只把仍在售的前三挂上（调用量必须是有限的）', () => {
    expect(page).toContain('MarketplacePicks');
    expect(page).toContain('slice(0, 3)');
    expect(page).toContain('items.length > 0');
  });

  it('className 只允许 .mkp-*', () => {
    expect(classLiterals.length).toBeGreaterThanOrEqual(7);
    for (const cls of classLiterals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `MarketplacePicks 出现非 .mkp-* 类：${tok}`).toMatch(/^mkp-[A-Za-z0-9][A-Za-z0-9-]*$/);
      }
    }
  });

  it('.mkp-* 全部收在 globals.css；forced-colors 有回退；零 hex；tokens 认识', () => {
    const used = new Set<string>();
    for (const cls of classLiterals) for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    const defined = new Set([...globals.matchAll(/\.((?:mkp)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没定义 ${cls}`).toContain(cls);
    expect(mkpSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...mkpSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(usedTokens.length).toBeGreaterThanOrEqual(5);
    for (const token of usedTokens) expect(tokens, `tokens.css 不认识 ${token}`).toContain(token);
    const forced = mkpSegment.slice(mkpSegment.indexOf('@media (forced-colors: active) {'));
    expect(forced).toContain('.mkp-strip');
    expect(forced).toContain('.mkp-item');
  });

  it('SHA256 钉死：MarketplacePicks（className 脱敏后）', () => {
    expect(createHash('sha256').update(redactClasses(card)).digest('hex')).toBe(
      '67da04a37c5542c844f442ba780ee38259415349beb353936890fe1dfd02d13a',
    );
  });
});
