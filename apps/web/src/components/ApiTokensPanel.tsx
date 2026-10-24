'use client';

import { useCallback, useEffect, useState } from 'react';
import { createNode } from '@nexus/design-model';
import type { DesignDocument } from '@nexus/design-model';
import type { ApiAccessEntry, ApiTokenRecord, ApiTokenScope } from '@nexus/schemas';
import {
  API_ACCESS_RETENTION_DAYS,
  API_TOKEN_RATE_LIMITS_PER_MINUTE as LIMITS,
  API_TOKEN_SCOPES,
} from '@nexus/schemas';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §188：凭据管理面板。五条界面的诚实，都有对应的代码理由：
 * - **明文只在签发成功后显示一次**。库里存的是哈希，服务端此后算不回来，所以这一页没有"再看一眼"，
 *   只有"重发一枚"——把它做成能反复查看的样子就是在暗示库里存着明文。
 * - **列表读失败说"读不到"**，而不是显示"0 枚凭据"（§73 那条纪律：一次失败的读不是空的证明）。
 * - **最近使用是分钟级的**。写入有节流，界面上就说这一列不精确到秒，而不是假装实时。
 * - **"试一下"发的是真请求**：拿刚才那份明文打一次 `/api/v1/*`，状态码与原因原样贴出来。
 *   没有它，这一页就只是"我以为配好了"。
 * - **"最近读过"那一格分得出"没读到"与"读过 0 次"**，并且同一（端点, 项目）在一分钟里合成一行、
 *   只留 `API_ACCESS_RETENTION_DAYS` 天——这两句都写进列名，因为一列"用量"最容易让人以为它是逐次流水。
 */

const SCOPE_LABELS: Record<ApiTokenScope, string> = {
  'projects:read': '读我自己名下的项目清单与详情',
  'projects:write': '建项目与删项目（删除是软删：可恢复、已发布的作品仍在公网）',
  'publish:write': '发布与下架（unlisted 上限：public 要走界面，机检与人工裁决在人的路径上）',
  'design:read': '读设计文档本体（整份，没有分页）',
  'design:write': '给设计文档打补丁（一次调用 = 一个事务，删除类 op 一律拒）',
  'team:read': '读项目名册：成员与邀请（owner 与协作者可读；邀请链接的 secret 不在回执里）',
};

interface TryResult {
  status: number;
  /** 成功时的摘要；失败时服务端那句原因 */
  detail: string;
}

function stamp(iso: string | null): string {
  if (!iso) return '—';
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/**
 * 端点名在读的一格里太长了：`GET /api/v1/projects/[projectId]/design` 会被这一列裁掉最要紧的
 * 那半截，所以只留“方法 + 最后一段”，整句放在 title 里。尾巴是从字符串本身取的，不是另一份名单。
 */
function endpointTail(endpoint: string): string {
  const [method = '', path = ''] = endpoint.split(' ');
  const segments = path.split('/').filter(Boolean);
  return `${method} …/${segments[segments.length - 1] ?? ''}`;
}

function statusOf(record: ApiTokenRecord): { text: string; tone: 'ok' | 'warn' | 'bad' } {
  if (record.revokedAt) return { text: `已吊销（${stamp(record.revokedAt)}）`, tone: 'bad' };
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) return { text: `已到期（${stamp(record.expiresAt)}）`, tone: 'bad' };
  if (record.expiresAt) return { text: `到期 ${stamp(record.expiresAt)}`, tone: 'warn' };
  return { text: '长期有效', tone: 'warn' };
}

export function ApiTokensPanel() {
  const [tokens, setTokens] = useState<ApiTokenRecord[] | null>(null);
  /** 每一枚凭据最近读过什么。null 是“这一本没读到”，空数组才是“读过 0 次”（§73） */
  const [access, setAccess] = useState<ApiAccessEntry[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [days, setDays] = useState('');
  const [scopes, setScopes] = useState<ApiTokenScope[]>(['projects:read']);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ plaintext: string; record: ApiTokenRecord } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [trying, setTrying] = useState<'list' | 'design' | 'patch' | null>(null);
  const [tryResult, setTryResult] = useState<TryResult | null>(null);
  /** 「试一下」拿到的第一个项目 id：设计文档那一条要有它才能问（不是编的，是真从 v1 读回来的） */
  const [triedProjectId, setTriedProjectId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setListError(null);
    try {
      const res = await fetch('/api/account/api-tokens', { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as
        | { tokens?: ApiTokenRecord[]; access?: ApiAccessEntry[]; message?: string }
        | null;
      if (!res.ok || !body?.tokens || !Array.isArray(body.access)) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setTokens(body.tokens);
      setAccess(body.access);
    } catch (e) {
      // 读失败不等于"这个人名下没有凭据"：把两者混起来，界面就在替一次故障编造结论
      setTokens(null);
      setListError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (busy || !name.trim() || scopes.length === 0) return;
    setBusy(true);
    setError(null);
    setNote(null);
    setIssued(null);
    setTryResult(null);
    try {
      const res = await fetch('/api/account/api-tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({
          name: name.trim(),
          scopes,
          ...(days.trim() ? { expiresInDays: Number.parseInt(days, 10) } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as { token?: string; record?: ApiTokenRecord; issues?: string[]; message?: string } | null;
      if (!res.ok || !body?.token || !body.record) {
        throw new Error(body?.issues?.join('；') ?? body?.message ?? `HTTP ${res.status}`);
      }
      setIssued({ plaintext: body.token, record: body.record });
      setName('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (record: ApiTokenRecord) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/account/api-tokens/${encodeURIComponent(record.id)}/revoke`, {
        method: 'POST',
        headers: csrfHeaders(),
      });
      const body = (await res.json().catch(() => null)) as { note?: string; message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      // 幂等的那一句要留在界面上：第二次点"吊销"时那行本来就是吊销状态，
      // 不说这句就成了"什么都没变但界面闪了一下"
      setNote(body?.note ?? `已吊销 ${record.name}，带着它的调用现在会拿到 401 revoked_token`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** 用刚签发的那份明文真打一次 v1：状态码与原因都原样贴出来，不替它美化 */
  const tryV1 = async (which: 'list' | 'design') => {
    if (!issued?.plaintext) return;
    setTrying(which);
    setTryResult(null);
    setError(null);
    try {
      const path =
        which === 'list' ? '/api/v1/projects' : `/api/v1/projects/${encodeURIComponent(triedProjectId ?? '')}/design`;
      const res = await fetch(path, { headers: { authorization: `Bearer ${issued.plaintext}` }, cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as
        | { projects?: { id: string; name: string }[]; message?: string; error?: string; nodeCount?: number; pageCount?: number }
        | null;
      if (!res.ok) {
        setTryResult({ status: res.status, detail: `${body?.error ?? '未知原因'}：${body?.message ?? '服务端没给原因'}` });
        return;
      }
      if (which === 'list') {
        const first = body?.projects?.[0];
        if (first) setTriedProjectId(first.id);
        setTryResult({
          status: res.status,
          detail: first
            ? `读到 ${body?.projects?.length ?? 0} 个项目，第一个是「${first.name}」——现在可以试设计文档那一条`
            : '读到 0 个项目：这个人名下现在没有未删除的项目',
        });
      } else {
        setTryResult({ status: res.status, detail: `文档来自 ${body?.pageCount ?? 0} 页 / ${body?.nodeCount ?? 0} 个节点（库里那一份）` });
      }
    } catch (e) {
      setTryResult({ status: 0, detail: `请求没发出去：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setTrying(null);
    }
  };

  /**
   * 「试一下（写）」发的是真补丁：往当前项目的根节点下面插一个文本节点。
   *
   * 按钮上写的就是"会真的加一个节点"，而不是一个看不出后果的"测试"。父节点 id 是从**本人会话**
   * 的项目文档里取的（不是这枚凭据读来的），所以这一格证明的只有"这枚凭据写得了"，
   * 不会顺手替它证明"它也读得到"——那是另一格 scope。
   */
  const tryPatch = async () => {
    if (!issued?.plaintext || !triedProjectId) return;
    setTrying('patch');
    setTryResult(null);
    setError(null);
    try {
      const mine = await fetch(`/api/projects/${encodeURIComponent(triedProjectId)}`, { cache: 'no-store' });
      const mineBody = (await mine.json().catch(() => null)) as { document?: DesignDocument } | null;
      const doc = mineBody?.document;
      const page = doc?.pages.find((p) => p.id === doc.activePageId) ?? doc?.pages[0];
      if (!page?.rootId) {
        setTryResult({ status: mine.status, detail: `读不到这一页的根节点（HTTP ${mine.status}），构造不出补丁` });
        return;
      }
      const node = createNode({ type: 'text', name: '公开 API 写的', text: '这一段是凭据写进来的', parentId: page.rootId });
      const res = await fetch(`/api/v1/projects/${encodeURIComponent(triedProjectId)}/design`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${issued.plaintext}` },
        body: JSON.stringify({
          summary: '凭据管理页的写入演示：插入一个文本节点',
          pageId: page.id,
          ops: [{ op: 'insert', node, parentId: page.rootId }],
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
        nodeCount?: number;
        snapshotId?: string | null;
        warnings?: string[];
      } | null;
      if (!res.ok) {
        setTryResult({ status: res.status, detail: `${body?.error ?? '未知原因'}：${body?.message ?? '服务端没给原因'}` });
        return;
      }
      setTryResult({
        status: res.status,
        detail: `文档现在 ${body?.nodeCount ?? 0} 个节点；${
          body?.snapshotId
            ? '历史里落了一条带补丁清单的记录（Studio 历史面板能看到它的 diff）'
            : `历史没落上：${body?.warnings?.join('；') ?? '服务端没给原因'}`
        }`,
      });
    } catch (e) {
      setTryResult({ status: 0, detail: `请求没发出去：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setTrying(null);
    }
  };

  return (
    <section className="flex flex-col gap-[var(--nexus-space-3)]">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-11 text-fg-3">
          名称（认哪一把用）
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="例如：CI 拉取设计文档"
            className="h-[30px] w-[220px] rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 text-12 text-fg-1"
            data-token-name
          />
        </label>
        <label className="flex flex-col gap-1 text-11 text-fg-3" title="留空 = 不过期。到期时间由发的人自己定，服务端不替你设一个你不知道的期限">
          有效天数（可选）
          <input
            value={days}
            onChange={(e) => setDays(e.target.value)}
            inputMode="numeric"
            placeholder="不过期"
            className="h-[30px] w-[90px] rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 text-12 text-fg-1"
            data-token-days
          />
        </label>
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy || !name.trim() || scopes.length === 0}
          className="h-[30px] rounded-[var(--nexus-radius-sm)] bg-brand px-3 text-12 text-bg-0 disabled:opacity-40"
          data-token-create
        >
          签发凭据
        </button>
      </div>

      <div className="flex flex-wrap gap-3 text-12 text-fg-2">
        {API_TOKEN_SCOPES.map((scope) => (
          <label key={scope} className="flex items-center gap-1" title={SCOPE_LABELS[scope]}>
            <input
              type="checkbox"
              checked={scopes.includes(scope)}
              onChange={(e) =>
                setScopes((current) => (e.target.checked ? [...current, scope] : current.filter((s) => s !== scope)))
              }
              data-token-scope={scope}
            />
            {scope}
            <span className="text-fg-3">· {SCOPE_LABELS[scope]}</span>
          </label>
        ))}
      </div>

      {issued ? (
        <div className="flex flex-col gap-2 rounded-[var(--nexus-radius-md)] border border-warn/50 bg-bg-2 p-[var(--nexus-space-3)]" data-token-issued>
          <p className="text-12 text-fg-1">
            这是这个平台唯一一次把明文给你。关掉这一页就再也拿不回来了——库里存的是哈希，服务端自己也算不出来。
          </p>
          <code className="break-all rounded bg-bg-3 p-2 text-11 text-fg-1" data-token-plain>
            {issued.plaintext}
          </code>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void tryV1('list')}
              disabled={trying !== null}
              className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11 text-fg-2 disabled:opacity-40"
              data-try-list
            >
              试一下 GET /api/v1/projects
            </button>
            <button
              type="button"
              onClick={() => void tryV1('design')}
              disabled={trying !== null || !triedProjectId}
              title={triedProjectId ? '用刚才读到的第一个项目' : '先试上面那条，拿到一个项目 id'}
              className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11 text-fg-2 disabled:opacity-40"
              data-try-design
            >
              试一下 GET /api/v1/projects/&lt;id&gt;/design
            </button>
            <button
              type="button"
              onClick={() => void tryPatch()}
              disabled={trying !== null || !triedProjectId}
              title={
                triedProjectId
                  ? '真的往这个项目插一个文本节点——不是模拟，撤销要去 Studio 的历史面板'
                  : '先试上面那条，拿到一个项目 id'
              }
              className="rounded-[var(--nexus-radius-sm)] border border-warn/60 px-2 py-1 text-11 text-fg-2 disabled:opacity-40"
              data-try-patch
            >
              试一下 PATCH …/design（会真的加一个节点）
            </button>
            {tryResult ? (
              <span className="text-11 text-fg-2" data-try-status={tryResult.status}>
                HTTP {tryResult.status} · {tryResult.detail}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-12 text-danger" data-token-error>
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="text-12 text-fg-2" data-token-note>
          {note}
        </p>
      ) : null}

      {listError ? (
        <p className="text-12 text-warn" data-token-list-failed>
          凭据列表读不到：{listError}（这不等于你名下没有凭据）
          <button type="button" className="ml-2 underline" onClick={() => void load()} data-token-retry>
            再读一次
          </button>
        </p>
      ) : tokens === null ? (
        <p className="text-12 text-fg-3">正在读取凭据列表…</p>
      ) : tokens.length === 0 ? (
        <p className="text-12 text-fg-3" data-token-empty>
          这个账号还没有发过凭据。
        </p>
      ) : (
        <table className="w-full border-collapse text-12">
          <thead className="text-left text-11 text-fg-3">
            <tr>
              <th className="py-1 pr-3 font-normal">名称</th>
              <th className="py-1 pr-3 font-normal">前缀</th>
              <th className="py-1 pr-3 font-normal">scope</th>
              <th className="py-1 pr-3 font-normal">签发</th>
              <th className="py-1 pr-3 font-normal" title="写入有分钟级节流，所以这一列不精确到秒">
                最近使用（分钟级）
              </th>
              <th
                className="py-1 pr-3 font-normal"
                title={`同一（端点, 项目）在一分钟里合成一行计数，只留最近 ${API_ACCESS_RETENTION_DAYS} 天`}
              >
                最近读过（按分钟合并，留 {API_ACCESS_RETENTION_DAYS} 天）
              </th>
              <th className="py-1 pr-3 font-normal">状态</th>
              <th className="py-1 font-normal" />
            </tr>
          </thead>
          <tbody>
            {tokens.map((record) => {
              const status = statusOf(record);
              return (
                <tr key={record.id} data-token-row={record.id}>
                  <td className="py-1 pr-3 text-fg-1">{record.name}</td>
                  <td className="py-1 pr-3 font-mono text-11 text-fg-3" data-token-hint={record.hint}>
                    {record.hint}
                  </td>
                  <td className="py-1 pr-3 text-11">{record.scopes.join(' / ')}</td>
                  <td className="py-1 pr-3 text-11 text-fg-3">{stamp(record.createdAt)}</td>
                  <td className="py-1 pr-3 text-11 text-fg-3">{stamp(record.lastUsedAt)}</td>
                  <td className="py-1 pr-3 text-11 text-fg-3" data-token-access={record.id}>
                    {(() => {
                      // 读不到就说读不到：把“没读到”渲染成“没读过”，是在替一次故障编造结论
                      if (access === null) return '—';
                      const lines = access.filter((entry) => entry.tokenId === record.id);
                      if (lines.length === 0) return '还没读过东西';
                      return lines.map((entry) => (
                        <div key={`${entry.endpoint}::${entry.projectId}`} data-access-line={entry.endpoint}>
                          <span title={entry.endpoint}>{endpointTail(entry.endpoint)}</span> ·{' '}
                          {entry.projectId ? entry.projectName ?? '项目已删除' : '整个清单'} ×{entry.calls} · {stamp(entry.lastSeen)}
                        </div>
                      ));
                    })()}
                  </td>
                  <td
                    className={`py-1 pr-3 text-11 ${status.tone === 'bad' ? 'text-danger' : status.tone === 'warn' ? 'text-warn' : 'text-fg-2'}`}
                    data-token-status={record.revokedAt ? 'revoked' : 'active'}
                  >
                    {status.text}
                  </td>
                  <td className="py-1">
                    {record.revokedAt ? null : (
                      <button
                        type="button"
                        onClick={() => void revoke(record)}
                        disabled={busy}
                        className="underline disabled:opacity-40"
                        data-token-revoke={record.id}
                      >
                        吊销
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="text-11 text-fg-3" data-api-limits>
        v1 今天是三个读端点加一个写端点：<code className="text-fg-2">GET /api/v1/projects</code>、
        <code className="text-fg-2">GET /api/v1/projects/&lt;id&gt;</code>、
        <code className="text-fg-2">GET /api/v1/projects/&lt;id&gt;/design</code>（后两条要 design:read），
        与 <code className="text-fg-2">PATCH /api/v1/projects/&lt;id&gt;/design</code>（要 design:write）。
        写发的是补丁不是整份文档：一次调用是一个事务，op 打不到就一条都不写；
        删除类 op（remove / removePage / removeToken / removeAsset / removeComponent）一律
        409 approval_required——公网这一侧没有人能批准它，请回 Studio 做。读每分钟 {LIMITS.read} 次、
        写每分钟 {LIMITS.write} 次。设计文档整份返回，没有分页。
      </p>
    </section>
  );
}
