'use client';

import { useCallback, useEffect, useState } from 'react';
import { createNode } from '@nexus/creative-model';
import type { DesignDocument } from '@nexus/creative-model';
import type { ApiAccessEntry, ApiTokenRecord, ApiTokenScope } from '@nexus/schemas';
import {
  API_ACCESS_RETENTION_DAYS,
  API_TOKEN_RATE_LIMITS_PER_MINUTE as LIMITS,
  API_TOKEN_SCOPES,
} from '@nexus/schemas';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

/**
 * §188：凭据管理面板。五条界面的诚实，都有对应的代码理由（不变）：
 * - **明文只在签发成功后显示一次**。库里存的是哈希，服务端此后算不回来，所以这一页没有"再看一眼"，
 *   只有"重发一枚"——把它做成能反复查看的样子就是在暗示库里存着明文。
 * - **列表读失败说"读不到"**，而不是显示"0 枚凭据"（§73 那条纪律：一次失败的读不是空的证明）。
 * - **最近使用是分钟级的**。写入有节流，界面上就说这一列不精确到秒，而不是假装实时。
 * - **"试一下"发的是真请求**：拿刚才那份明文打一次 `/api/v1/*`，状态码与原因原样贴出来。
 * - **"最近读过"那一格分得出"没读到"与"读过 0 次"**，同一（端点, 项目）在一分钟里合成一行、
 *   只留 `API_ACCESS_RETENTION_DAYS` 天——两句都写进列名。
 *
 * v782：双语化（locale prop，默认 zh；文案结构映射逐句）。
 */

const COPY = {
  zh: {
    scopeLabels: {
      'projects:read': '读我自己名下的项目清单与详情',
      'projects:write': '建项目与删项目（删除是软删：可恢复、已发布的作品仍在公网）',
      'publish:write': '发布与下架（unlisted 上限：public 要走界面，机检与人工裁决在人的路径上）',
      'design:read': '读设计文档本体（整份，没有分页）',
      'design:write': '给设计文档打补丁（一次调用 = 一个事务，删除类 op 一律拒）',
      'team:read': '读项目名册：成员与邀请（owner 与协作者可读；邀请链接的 secret 不在回执里）',
    } as Record<ApiTokenScope, string>,
    nameLabel: '名称（认哪一把用）',
    namePlaceholder: '例如：CI 拉取设计文档',
    daysLabel: '有效天数（可选）',
    daysPlaceholder: '不过期',
    daysTitle: '留空 = 不过期。到期时间由发的人自己定，服务端不替你设一个你不知道的期限',
    createButton: '签发凭据',
    issuedHint: '这是这个平台唯一一次把明文给你。关掉这一页就再也拿不回来了——库里存的是哈希，服务端自己也算不出来。',
    tryList: '试一下 GET /api/v1/projects',
    tryDesign: '试一下 GET /api/v1/projects/<id>/design',
    tryDesignTitle: '用刚才读到的第一个项目',
    tryDesignTitleEmpty: '先试上面那条，拿到一个项目 id',
    tryPatch: '试一下 PATCH …/design（会真的加一个节点）',
    tryPatchTitle: '真的往这个项目插一个文本节点——不是模拟，撤销要去 Studio 的历史面板',
    tryPatchTitleEmpty: '先试上面那条，拿到一个项目 id',
    unknownReason: '未知原因',
    noServerReason: '服务端没给原因',
    readProjects: (n: number, first: string) => `读到 ${n} 个项目，第一个是「${first}」——现在可以试设计文档那一条`,
    readProjectsEmpty: '读到 0 个项目：这个人名下现在没有未删除的项目',
    docFrom: (pages: number, nodes: number) => `文档来自 ${pages} 页 / ${nodes} 个节点（库里那一份）`,
    requestNotSent: (reason: string) => `请求没发出去：${reason}`,
    revokeNote: (name: string) => `已吊销 ${name}，带着它的调用现在会拿到 401 revoked_token`,
    docNow: (count: number, snapshotSaved: boolean, warnings: string) =>
      `文档现在 ${count} 个节点；${snapshotSaved ? '历史里落了一条带补丁清单的记录（Studio 历史面板能看到它的 diff）' : `历史没落上：${warnings}`}`,
    patchSummary: '凭据管理页的写入演示：插入一个文本节点',
    cannotBuildPatch: (status: number) => `读不到这一页的根节点（HTTP ${status}），构造不出补丁`,
    revokedAt: (stamp: string) => `已吊销（${stamp}）`,
    expiredAt: (stamp: string) => `已到期（${stamp}）`,
    expiryWarn: (stamp: string) => `到期 ${stamp}`,
    activeWarn: '长期有效',
    listFailed: '凭据列表读不到：',
    listFailedSuffix: '（这不等于你名下没有凭据）',
    retryRead: '再读一次',
    reading: '正在读取凭据列表…',
    empty: '这个账号还没有发过凭据。',
    colName: '名称',
    colPrefix: '前缀',
    colIssued: '签发',
    colLastUsed: '最近使用（分钟级）',
    colLastUsedTitle: '写入有分钟级节流，所以这一列不精确到秒',
    colAccess: `最近读过（按分钟合并，留 ${API_ACCESS_RETENTION_DAYS} 天）`,
    colAccessTitle: (days: number) => `同一（端点, 项目）在一分钟里合成一行计数，只留最近 ${days} 天`,
    colStatus: '状态',
    accessNever: '还没读过东西',
    accessProjectDeleted: '项目已删除',
    accessWholeList: '整个清单',
    revoke: '吊销',
    footLine1: 'v1 今天是三个读端点加一个写端点：',
    footLine2: '（后两条要 design:read），与',
    footLine3: '（要 design:write）。',
    footLine4: (read: number, write: number) =>
      `写发的是补丁不是整份文档：一次调用是一个事务，op 打不到就一条都不写；删除类 op（remove / removePage / removeToken / removeAsset / removeComponent）一律 409 approval_required——公网这一侧没有人能批准它，请回 Studio 做。读每分钟 ${read} 次、写每分钟 ${write} 次。设计文档整份返回，没有分页。`,
  },
  en: {
    scopeLabels: {
      'projects:read': "Read my own projects' list and details",
      'projects:write': 'Create and delete projects (delete is soft: restored, published works stay public)',
      'publish:write': 'Publish and unpublish (unlisted ceiling: public goes through the UI, review and human verdict live on the human path)',
      'design:read': 'Read the design document itself (whole, unpaged)',
      'design:write': 'Patch the design document (one call = one transaction, delete-class ops always denied)',
      'team:read': "Read the member/invite roll (owner and collaborators may read; the invite secret is never in the receipt)",
    } as Record<ApiTokenScope, string>,
    nameLabel: 'Name (which credential this is)',
    namePlaceholder: 'e.g.: CI read access for design docs',
    daysLabel: 'Days valid (optional)',
    daysPlaceholder: 'Never expires',
    daysTitle: 'Leave empty = never expires. The expiry is set by the issuer, never by the server',
    createButton: 'Issue token',
    issuedHint: 'This is the single time this platform will ever show you the plaintext. Close this page and it is gone forever — the library stores the hash, the server cannot reconstruct it either.',
    tryList: 'Try GET /api/v1/projects',
    tryDesign: 'Try GET /api/v1/projects/<id>/design',
    tryDesignTitle: 'Use the first project read just now',
    tryDesignTitleEmpty: 'Try the one above first to get a project id',
    tryPatch: 'Try PATCH …/design (really writes one node)',
    tryPatchTitle: 'Really insert a text node into this project — not simulated; undo it in the Studio history panel',
    tryPatchTitleEmpty: 'Try the one above first to get a project id',
    unknownReason: 'unknown reason',
    noServerReason: 'server gave no reason',
    readProjects: (n: number, first: string) => `Read ${n} project(s), first is “${first}” — now you can try the design-document one`,
    readProjectsEmpty: 'Read 0 projects: there is currently no un-deleted project under this account',
    docFrom: (pages: number, nodes: number) => `Document from ${pages} page(s) / ${nodes} node(s) (the one stored in the library)`,
    requestNotSent: (reason: string) => `Request did not go out: ${reason}`,
    revokeNote: (name: string) => `Revoked ${name} — calls carrying it now receive 401 revoked_token`,
    docNow: (count: number, snapshotSaved: boolean, warnings: string) =>
      `Document now has ${count} node(s); ${snapshotSaved ? 'one historic line with the op list landed (visible in the Studio history panel)' : `nothing landed in history: ${warnings}`}`,
    patchSummary: 'Demo write from the credentials page: insert a text node',
    cannotBuildPatch: (status: number) => `Cannot build a patch — cannot reach the root node of this page (HTTP ${status})`,
    revokedAt: (stamp: string) => `Revoked (${stamp})`,
    expiredAt: (stamp: string) => `Expired (${stamp})`,
    expiryWarn: (stamp: string) => `Expires ${stamp}`,
    activeWarn: 'Long-lived',
    listFailed: 'The token list cannot be read:',
    listFailedSuffix: ' (this is not “you have no tokens”)',
    retryRead: 'Read again',
    reading: 'Reading the token list…',
    empty: 'This account has not issued any token yet.',
    colName: 'Name',
    colPrefix: 'Prefix',
    colIssued: 'Issued',
    colLastUsed: 'Last used (minute-level)',
    colLastUsedTitle: 'Writes are throttled by minute, so this column is not second-accurate',
    colAccess: `Last reads (merged by minute, kept ${API_ACCESS_RETENTION_DAYS} days)`,
    colAccessTitle: (days: number) => `One (endpoint, project) pair merges into one line per minute, kept only for the latest ${days} days`,
    colStatus: 'Status',
    accessNever: 'has read nothing yet',
    accessProjectDeleted: 'project deleted',
    accessWholeList: 'the whole list',
    revoke: 'Revoke',
    footLine1: 'v1 today is three read endpoints plus one write endpoint:',
    footLine2: '(the latter two need design:read), and',
    footLine3: '(needs design:write).',
    footLine4: (read: number, write: number) =>
      `The write sends a patch, not the whole document: one call is one transaction — an op that cannot be applied means nothing writes; delete-class ops (remove / removePage / removeToken / removeAsset / removeComponent) all land as 409 approval_required — nobody here can approve on the public side, do it in Studio instead. Reads ${read}/min, writes ${write}/min. The design document returns in full, unpaged.`,
  },
} as const;

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

export function ApiTokensPanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const statusOf = (record: ApiTokenRecord): { text: string; tone: 'ok' | 'warn' | 'bad' } => {
    if (record.revokedAt) return { text: c.revokedAt(stamp(record.revokedAt)), tone: 'bad' };
    if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now())
      return { text: c.expiredAt(stamp(record.expiresAt)), tone: 'bad' };
    if (record.expiresAt) return { text: c.expiryWarn(stamp(record.expiresAt)), tone: 'warn' };
    return { text: c.activeWarn, tone: 'warn' };
  };

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
      if (!res.ok || !body?.tokens || !Array.isArray(body.access))
        throw new Error(body?.message ?? `HTTP ${res.status}`);
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
      setNote(body?.note ?? c.revokeNote(record.name));
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
        setTryResult({ status: res.status, detail: `${body?.error ?? c.unknownReason}：${body?.message ?? c.noServerReason}` });
        return;
      }
      if (which === 'list') {
        const first = body?.projects?.[0];
        if (first) setTriedProjectId(first.id);
        setTryResult({
          status: res.status,
          detail: first
            ? c.readProjects(body?.projects?.length ?? 0, first.name)
            : c.readProjectsEmpty,
        });
      } else {
        setTryResult({ status: res.status, detail: c.docFrom(body?.pageCount ?? 0, body?.nodeCount ?? 0) });
      }
    } catch (e) {
      setTryResult({ status: 0, detail: c.requestNotSent(e instanceof Error ? e.message : String(e)) });
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
        setTryResult({ status: mine.status, detail: c.cannotBuildPatch(mine.status) });
        return;
      }
      const node = createNode({ type: 'text', name: locale === 'en' ? 'Written by public API' : '公开 API 写的', text: locale === 'en' ? 'This line was written by the credential' : '这一段是凭据写进来的', parentId: page.rootId });
      const res = await fetch(`/api/v1/projects/${encodeURIComponent(triedProjectId)}/design`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${issued.plaintext}` },
        body: JSON.stringify({
          summary: c.patchSummary,
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
        setTryResult({ status: res.status, detail: `${body?.error ?? c.unknownReason}：${body?.message ?? c.noServerReason}` });
        return;
      }
      setTryResult({
        status: res.status,
        detail: c.docNow(body?.nodeCount ?? 0, Boolean(body?.snapshotId), body?.warnings?.join(locale === 'en' ? '; ' : '；') ?? c.noServerReason),
      });
    } catch (e) {
      setTryResult({ status: 0, detail: c.requestNotSent(e instanceof Error ? e.message : String(e)) });
    } finally {
      setTrying(null);
    }
  };

  return (
    <section className="at-panel">
      <div className="at-formRow">
        <label className="at-label">
          {c.nameLabel}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder={c.namePlaceholder}
            className="at-input"
            data-token-name
          />
        </label>
        <label className="at-label" title={c.daysTitle}>
          {c.daysLabel}
          <input
            value={days}
            onChange={(e) => setDays(e.target.value)}
            inputMode="numeric"
            placeholder={c.daysPlaceholder}
            className="at-inputNarrow"
            data-token-days
          />
        </label>
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy || !name.trim() || scopes.length === 0}
          className="at-btnPrimary"
          data-token-create
        >
          {c.createButton}
        </button>
      </div>

      <div className="at-scopesRow">
        {API_TOKEN_SCOPES.map((scope) => (
          <label key={scope} className="at-scopeItem" title={c.scopeLabels[scope]}>
            <input
              type="checkbox"
              checked={scopes.includes(scope)}
              onChange={(e) =>
                setScopes((current) => (e.target.checked ? [...current, scope] : current.filter((s) => s !== scope)))
              }
              data-token-scope={scope}
            />
            {scope}
            <span className="at-scopeNote">· {c.scopeLabels[scope]}</span>
          </label>
        ))}
      </div>

      {issued ? (
        <div className="at-issued" data-token-issued>
          <p className="at-issuedHint">
            {c.issuedHint}
          </p>
          <code className="at-issuedBox" data-token-plain>
            {issued.plaintext}
          </code>
          <div className="at-issuedActions">
            <button
              type="button"
              onClick={() => void tryV1('list')}
              disabled={trying !== null}
              className="at-btnGhostSm"
              data-try-list
            >
              {c.tryList}
            </button>
            <button
              type="button"
              onClick={() => void tryV1('design')}
              disabled={trying !== null || !triedProjectId}
              title={triedProjectId ? c.tryDesignTitle : c.tryDesignTitleEmpty}
              className="at-btnGhostSm"
              data-try-design
            >
              {c.tryDesign}
            </button>
            <button
              type="button"
              onClick={() => void tryPatch()}
              disabled={trying !== null || !triedProjectId}
              title={triedProjectId ? c.tryPatchTitle : c.tryPatchTitleEmpty}
              className="at-btnGhostSmWarn"
              data-try-patch
            >
              {c.tryPatch}
            </button>
            {tryResult ? (
              <span className="at-tryRow" data-try-status={tryResult.status}>
                HTTP {tryResult.status} · {tryResult.detail}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="at-error" data-token-error>
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="at-note" data-token-note>
          {note}
        </p>
      ) : null}

      {listError ? (
        <p className="at-warnNote" data-token-list-failed>
          {c.listFailed}{listError}{c.listFailedSuffix}
          <button type="button" className="at-textLink at-textLinkTight" onClick={() => void load()} data-token-retry>
            {c.retryRead}
          </button>
        </p>
      ) : tokens === null ? (
        <p className="at-loading">{c.reading}</p>
      ) : tokens.length === 0 ? (
        <p className="at-empty" data-token-empty>
          {c.empty}
        </p>
      ) : (
        <table className="at-table">
          <thead className="at-thRow">
            <tr>
              <th className="at-th">{c.colName}</th>
              <th className="at-th">{c.colPrefix}</th>
              <th className="at-th">scope</th>
              <th className="at-th">{c.colIssued}</th>
              <th className="at-th" title={c.colLastUsedTitle}>
                {c.colLastUsed}
              </th>
              <th className="at-th" title={c.colAccessTitle(API_ACCESS_RETENTION_DAYS)}>
                {c.colAccess}
              </th>
              <th className="at-th">{c.colStatus}</th>
              <th className="at-thLast" />
            </tr>
          </thead>
          <tbody>
            {tokens.map((record) => {
              const status = statusOf(record);
              return (
                <tr key={record.id} data-token-row={record.id}>
                  <td className="at-td">{record.name}</td>
                  <td className="at-td at-tdMono" data-token-hint={record.hint}>
                    {record.hint}
                  </td>
                  <td className="at-td at-tdMono">{record.scopes.join(' / ')}</td>
                  <td className="at-td at-tdSecondary">{stamp(record.createdAt)}</td>
                  <td className="at-td at-tdSecondary">{stamp(record.lastUsedAt)}</td>
                  <td className="at-td at-tdSecondary" data-token-access={record.id}>
                    {(() => {
                      // 读不到就说读不到：把“没读到”渲染成“没读过”，是在替一次故障编造结论
                      if (access === null) return '—';
                      const lines = access.filter((entry) => entry.tokenId === record.id);
                      if (lines.length === 0) return c.accessNever;
                      return lines.map((entry) => (
                        <div key={`${entry.endpoint}::${entry.projectId}`} data-access-line={entry.endpoint}>
                          <span title={entry.endpoint}>{endpointTail(entry.endpoint)}</span> ·{' '}
                          {entry.projectId ? entry.projectName ?? c.accessProjectDeleted : c.accessWholeList} ×{entry.calls} · {stamp(entry.lastSeen)}
                        </div>
                      ));
                    })()}
                  </td>
                  <td
                    className={'at-td ' + (status.tone === 'bad' ? 'at-statusBad' : status.tone === 'warn' ? 'at-statusWarn' : 'at-statusOk')}
                    data-token-status={record.revokedAt ? 'revoked' : 'active'}
                  >
                    {status.text}
                  </td>
                  <td className="at-tdTight">
                    {record.revokedAt ? null : (
                      <button
                        type="button"
                        onClick={() => void revoke(record)}
                        disabled={busy}
                        className="at-textLink"
                        data-token-revoke={record.id}
                      >
                        {c.revoke}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="at-foot" data-api-limits>
        {c.footLine1}<code className="at-codeInline">GET /api/v1/projects</code>、
        <code className="at-codeInline">GET /api/v1/projects/&lt;id&gt;</code>、
        <code className="at-codeInline">GET /api/v1/projects/&lt;id&gt;/design</code>{c.footLine2}
        <code className="at-codeInline">PATCH /api/v1/projects/&lt;id&gt;/design</code>{c.footLine3}
        {c.footLine4(LIMITS.read, LIMITS.write)}
      </p>
    </section>
  );
}
