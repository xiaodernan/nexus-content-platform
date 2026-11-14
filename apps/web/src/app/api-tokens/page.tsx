import type { ReactElement } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUserOrNull } from '@/server/domain/session';
import { ApiTokensPanel } from '@/components/ApiTokensPanel';

export const dynamic = 'force-dynamic';

/**
 * §188 M8（MCP / 外部 Agent / 公开 API）的账号侧入口：这一页只管一件事——
 * 发得出、认得出、收得回一枚给平台外程序用的凭据。
 * §FE-20：门面化只换 className，零行为；文案、data 钩子、表单/校验逻辑一字不改。
 */
export default async function ApiTokensPage(): Promise<ReactElement> {
  const user = await currentUserOrNull();
  if (!user) redirect('/');
  return (
    <main className="at-page" data-api-tokens-page>
      <header className="at-head">
        <h1 className="at-title">公开 API 凭据</h1>
        <p className="at-lede">
          给平台外的程序（外部 Agent、脚本、CI）用：<code className="at-codeInline">Authorization: Bearer &lt;token&gt;</code>
          。今天 v1 是三个只读端点加一个写端点（<code className="at-codeInline">PATCH …/design</code>，要
          <code className="at-codeInline">design:write</code>）：写发的是补丁而不是整份文档，删除类动作在这一侧一律拒。
          <Link href="/" className="at-backlink">
            回创作页
          </Link>
        </p>
      </header>
      <ApiTokensPanel />
    </main>
  );
}
