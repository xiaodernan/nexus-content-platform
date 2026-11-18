import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ──EDITOR-NOTES /discover "馆长批注"（cont. 192）
 *
 *  1. EditorNotes 是 client 组件；/discover 引用之；/api/editor-note 服务端起草
 *  2. className 只允许 .en-*
 *  3. .en-* 全部收在 globals.css；forced-colors 有回退；零 hex
 *  4. 服务端纪律：DEMO MODE 409；20/小时/IP；24h LRU 缓存；zod 全覆盖
 *  5. SHA256 钉死（className 脱敏后）
 */
const ROOT = process.cwd();
const CARD = join(ROOT, 'apps/web/src/components/EditorNotes.tsx');
const API_ROUTE = join(ROOT, 'apps/web/src/app/api/editor-note/route.ts');
const DISCOVER = join(ROOT, 'apps/web/src/app/discover/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const card = readFileSync(CARD, 'utf8');
const apiRoute = readFileSync(API_ROUTE, 'utf8');
const discover = readFileSync(DISCOVER, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const code = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const EN_START = globals.indexOf('.en-strip {');
if (EN_START < 0) throw new Error('globals.css 里没有 .en-* 段');
const enSegment = globals.slice(EN_START).replace(/\/\*[\s\S]*?\*\//g, '');

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

const classLiterals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);

describe('──EDITOR-NOTES /discover "馆长批注"', () => {
  it('EditorNotes 是 client 组件，文案中英双语且诚实降级', () => {
    expect(code).toContain('use client');
    expect(code).toContain('const COPY');
    expect(code).toContain('locale');
    // 失败安静消失——不给公共页访客渲染 5xx（注释在 code 里被剥掉，故查原文）
    expect(card).toContain('公共页：出错安静消失');
  });

  it('服务端纪律：DEMO MODE 409；20/小时/IP；24h LRU；4 槽；zod 覆盖全部卡', () => {
    expect(apiRoute).toContain('demo_mode');
    expect(apiRoute).toContain("rateKey('editor-note'");
    expect(apiRoute).toContain('20, 60 * 60 * 1000');
    expect(apiRoute).toContain('TTL_MS = 24 * 60 * 60 * 1000');
    expect(apiRoute).toContain('LRU_MAX = 4');
    expect(apiRoute).toContain("z.object({");
    // 模型 prompt 明确禁止内容事实断言（只读指标）
    expect(apiRoute).toContain('只读指标');
  });

  it('/discover 只把 trending 榜前三挂上（调用量必须是有限的）', () => {
    expect(discover).toContain('EditorNotes');
    expect(discover).toContain("result.sort === 'trending'");
    expect(discover).toContain('slice(0, 3)');
  });

  it('className 只允许 .en-*', () => {
    expect(classLiterals.length).toBeGreaterThanOrEqual(8);
    for (const cls of classLiterals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `EditorNotes 出现非 .en-* 类：${tok}`).toMatch(/^en-[A-Za-z0-9][A-Za-z0-9-]*$/);
      }
    }
  });

  it('.en-* 全部收在 globals.css；forced-colors 有回退；零 hex；tokens 认识', () => {
    const used = new Set<string>();
    for (const cls of classLiterals) for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    const defined = new Set([...globals.matchAll(/\.((?:en)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没定义 ${cls}`).toContain(cls);
    expect(enSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...enSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(usedTokens.length).toBeGreaterThanOrEqual(6);
    for (const token of usedTokens) expect(tokens, `tokens.css 不认识 ${token}`).toContain(token);
    const forced = globals.slice(Math.max(0, globals.indexOf('@media (forced-colors: active) {')));
    expect(forced).toContain('.en-strip');
    expect(forced).toContain('.en-item');
  });

  it('SHA256 钉死：EditorNotes（className 脱敏后）', () => {
    expect(createHash('sha256').update(redactClasses(card)).digest('hex')).toBe(
      '26c05039899489d9c2a5f621853ca78c5bff57aa29c148efab234d8cecfbbb0f',
    );
  });
});
