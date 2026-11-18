import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ──SHIP-DIGEST /ship "AI 平台速览"（cont. 204）
 *
 *  1. ShipDigest 是 client 组件；/ship 引用之；/api/ship/digest 服务端出速览
 *  2. className 只允许 .shd-*
 *  3. .shd-* 全部收在 globals.css；forced-colors 有回退；零 hex
 *  4. 服务端纪律：DEMO MODE 409；5/小时/IP；24h LRU（16 槽）；缺数字即 502
 *  5. SHA256 钉死（className 脱敏后）
 */
const ROOT = process.cwd();
const CARD = join(ROOT, 'apps/web/src/components/ShipDigest.tsx');
const API_ROUTE = join(ROOT, 'apps/web/src/app/api/ship/digest/route.ts');
const PAGE = join(ROOT, 'apps/web/src/app/ship/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const card = readFileSync(CARD, 'utf8');
const apiRoute = readFileSync(API_ROUTE, 'utf8');
const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const code = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SHD_START = globals.indexOf('.shd-strip {');
if (SHD_START < 0) throw new Error('globals.css 里没有 .shd-* 段');
const shdSegment = globals.slice(SHD_START).replace(/\/\*[\s\S]*?\*\//g, '');

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

const classLiterals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);

describe('──SHIP-DIGEST /ship "AI 平台速览"', () => {
  it('ShipDigest 是 client 组件，挂载即触发且双语', () => {
    expect(code).toContain('use client');
    expect(card).toContain('locale');
    expect(card).toContain('useEffect');
    // 公共页：出错安静消失
    expect(card).toContain('公共页：出错安静消失');
  });

  it('服务端纪律：DEMO MODE 409；5/小时/IP；24h LRU；16 槽；缺数字即 502', () => {
    expect(apiRoute).toContain('demo_mode');
    expect(apiRoute).toContain("rateKey('ship-digest'");
    expect(apiRoute).toContain('5, 60 * 60 * 1000');
    expect(apiRoute).toContain('TTL_MS = 24 * 60 * 60 * 1000');
    expect(apiRoute).toContain('LRU_MAX = 16');
    expect(apiRoute).toContain('/\\d/');
  });

  it('输入是机械统计（git log 计数），不读源文件、不重读 git', () => {
    expect(apiRoute).not.toContain('execFileSync');
    expect(apiRoute).not.toContain('readdirSync');
    expect(apiRoute).toContain('readJson');
    expect(page).toContain('SHIP_DIGEST_INPUT');
    expect(page).toContain('counts[e.kind]');
    expect(page).toContain('flat.slice(0, 12)');
  });

  it('/ship 挂载 ShipDigest', () => {
    expect(page).toContain('ShipDigest');
  });

  it('className 只允许 .shd-*', () => {
    expect(classLiterals.length).toBeGreaterThanOrEqual(4);
    for (const cls of classLiterals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `ShipDigest 出现非 .shd-* 类：${tok}`).toMatch(/^shd-[A-Za-z0-9][A-Za-z0-9-]*$/);
      }
    }
  });

  it('.shd-* 全部收在 globals.css；forced-colors 有回退；零 hex；tokens 认识', () => {
    const used = new Set<string>();
    for (const cls of classLiterals) for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    const defined = new Set([...globals.matchAll(/\.((?:shd)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没定义 ${cls}`).toContain(cls);
    expect(shdSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...shdSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(usedTokens.length).toBeGreaterThanOrEqual(4);
    for (const token of usedTokens) expect(tokens, `tokens.css 不认识 ${token}`).toContain(token);
    const forced = shdSegment.slice(shdSegment.indexOf('@media (forced-colors: active) {'));
    expect(forced).toContain('.shd-strip');
  });

  it('SHA256 钉死：ShipDigest（className 脱敏后）', () => {
    expect(createHash('sha256').update(redactClasses(card)).digest('hex')).toBe(
      'f083d5d557d7bfa45aad315205ea1d1db34df99b812ee38ed0457ee42dbac8e1',
    );
  });
});
