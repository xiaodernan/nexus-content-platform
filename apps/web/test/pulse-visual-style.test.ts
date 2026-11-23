/**
 * §PULSE /pulse 公开观测大厅 · SHA 钉死 + 数据纪律
 *
 * 四条钉：
 * 1. SHA256 钉死（EOL 归一 + className→@）——组件字样被误改/复制粘贴就会炸；
 * 2. 数据纪律：组件里绝不出现 "邮箱/用户id/youraka" 式的个人字段样式——
 *    这个页面只允许聚合（它写出来的每条清单见 COPY/PulseBody 类型）；
 * 3. 凭证纪律：内嵌 passphrase 必须是公开的 123（设计如此，不是泄密）——拼错就 fail；
 * 4. 失败态纪律：/api/pulse 非 2xx 时页面必须写"坏了"，绝不静默用 0 冒充真数。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/pulse/page.tsx');
const COMPONENT = join(ROOT, 'apps/web/src/components/PulseGate.tsx');
const API_ROUTE = join(ROOT, 'apps/web/src/app/api/pulse/route.ts');
const DOMAIN = join(ROOT, 'apps/web/src/server/domain/pulse.ts');

const page = readFileSync(PAGE, 'utf8');
const component = readFileSync(COMPONENT, 'utf8');
const apiRoute = readFileSync(API_ROUTE, 'utf8');
const domain = readFileSync(DOMAIN, 'utf8');

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§PULSE /pulse 观测大厅（公开 · 聚合 · 匿名）', () => {
  it('RSC shell：force-dynamic；robots index:false；locale-aware PulseGate', () => {
    expect(page).toContain('force-dynamic');
    expect(page).toContain('index: false');
    expect(page).toContain('PulseGate');
    expect(page).toContain("data-pulse-page");
  });

  it('SHA256 钉死：组件字样（EOL 归一 + className→@）', () => {
    expect(createHash('sha256').update(redactClasses(component)).digest('hex')).toBe(
      // 钉死值见下方 lint 前预跑（v782/cont. 154 首钉）
      '532781aaa76b49baeb51ace428859c86dae9dd2c8f2e6d3cd3d71d12c1a4d4f3',
    );
  });

  it('组件不出现个人字段渲染：无 email/userId/displayName 类型字段', () => {
    // 聚合页不允许任何能定位到个人的渲染变量（注意：文案里的"emails"一词本身不会进这里 —— 查的是访问路径型 token）
    for (const forbidden of ['user.email', '.email(', 'userId', 'displayName', 'avatar', '.handle']) {
      expect(component, `组件疑似渲染个人字段 ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('公开口令：sessionStorage 键以 PASS_KEY 常量持有，且字面值必须是 123', () => {
    expect(component).toContain('const PASSPHRASE = ' + "'123'");
    expect(component).toContain('nexus.pulse.passphrase');
  });

  it('非 2xx 必须落回失败态；绝不静默用 0 冒充真数', () => {
    expect(component).toContain('setLoadError(true)');
    expect(component).not.toContain('Math.random()');
  });

  it('路由：force-dynamic + no-store；错误回 503 而不是编数', () => {
    expect(apiRoute).toContain("export const dynamic = 'force-dynamic'");
    expect(apiRoute).toContain('no-store');
    expect(apiRoute).toContain('503');
    expect(apiRoute).not.toContain('0,0,0'); // 绝不把占位 0 当真数
  });

  it('聚合层不出现 per-event/PII：无 select(users.email) 或类似的个人列', () => {
    for (const forbidden of ['.emailCode', 'email:', 'users.email', '.displayName', 'users.displayName']) {
      expect(domain, `聚合层出现个人列，禁止 ${forbidden}`).not.toContain(forbidden);
    }
    expect(domain).toContain('count(distinct');
    expect(domain).toContain('suspectedBot');
  });
});
