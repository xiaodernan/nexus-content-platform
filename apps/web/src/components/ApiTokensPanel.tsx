'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiTokenRecord, ApiTokenScope } from '@nexus/schemas';
import { API_TOKEN_SCOPES } from '@nexus/schemas';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §188：凭据管理面板。四条界面的诚实，都有对应的代码理由：
 * - **明文只在签发成功后显示一次**。库里存的是哈希，服务端此后算不回来，所以这一页没有"再看一眼"，
 *   只有"重发一枚"——把它做成能反复查看的样子就是在暗示库里存着明文。
 * - **列表读失败说"读不到"**，而不是显示"0 枚凭据"（§73 那条纪律：一次失败的读不是空的证明）。
 * - **最近使用是分钟级的**。写入有节流，界面上就说这一列不精确到秒，而不是假装实时。
 * - **"试一下"发的是真请求**：拿刚才那份明文打一次 `/api/v1/*`，状态码与原因原样贴出来。
 *   没有它，这一页就只是"我以为配好了"。
 */

const SCOPE_LABELS: Record<ApiTokenScope, string> = {
  'projects:read': '读我自己名下的项目清单与详情',
  'design:read': '读设计文档本体（整份，没有分页）',
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

function statusOf(record: ApiTokenRecord): { text: string; tone: 'ok' | 'warn' | 'bad' } {
  if (record.revokedAt) return { text: `已吊销（${stamp(record.revokedAt)}）`, tone: 'bad' };
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) return { text: `已到期（${stamp(record.expiresAt)}）`, tone: 'bad' };
  if (record.expiresAt) return { text: `到期 ${stamp(record.expiresAt)}`, tone: 'warn' };
  return { text: '长期有效', tone: 'warn' };
}

export function ApiTokensPanel() {
  const [tokens, setTokens] = useState<ApiTokenRecord[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [days, setDays] = useState('');
  const [scopes, setScopes] = useState<ApiTokenScope[]>(['projects:read']);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ plaintext: string; record: ApiTokenRecord } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [trying, setTrying] = useState<'list' | 'design' | null>(null);
  const [tryResult, setTryResult] = useState<TryResult | null>(null);
  /** 「试一下」拿到的第一个项目 id：设计文档那一条要有它才能问（不是编的，是真从 v1 读回来的） */
  const [triedProjectId, setTriedProjectId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setListError(null);
    try {
      const res = await fetch('/api/account/api-tokens', { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as { tokens?: ApiTokenRecord[]; message?: string } | null;
      if (!res.ok || !body?.tokens) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setTokens(body.tokens);
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
        v1 今天只有两个只读端点（<code className="text-fg-2">GET /api/v1/projects</code> 与{' '}
        <code className="text-fg-2">GET /api/v1/projects/&lt;id&gt;/design</code>，后者要 design:read），
        没有写端点——所以 POST 到这里是 405，那是"写还没做"而不是"写被禁用"。设计文档整份返回，没有分页。
      </p>
    </section>
  );
}
