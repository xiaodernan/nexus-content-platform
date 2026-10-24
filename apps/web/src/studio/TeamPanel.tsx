import { useCallback, useEffect, useState } from 'react';
import { csrfHeaders } from '@/lib/csrf';
import { useStudioReady } from './store';

/**
 * §133 teamCollaboration（#201-203）：项目名册与邀请的界面。
 *
 * 三件事在界面上写着，不藏着：
 * - **名额是档位的事**：`teamLimit` 跟着名册一起回（与门同源），"3/5" 说得清，
 *   满员时邀请按钮照旧能点——服务端会拒，界面先说清为什么（§159：展示与门不许对不上）；
 * - **邀请链接只展示一次**：token 是 secret，roster 永远不给它，链接在创建那一回
 *   显示，刷新/重进页面就再也拿不到（要链接只能撤回再邀，拿新的一枚）。本机没有发信，
 *   链接由邀请人自己转交——这句话写在链接旁边，不假装有邮件服务；
 * - **本机没有角色权限的实质差别**：editor / viewer 只是档案里的一个标签，
 *   协作者的读写权限模型还没接（§160 不假造）。所以界面上不承诺"viewer 不能改"。
 */

interface Member {
  id: string;
  userId: string;
  displayName: string | null;
  email: string | null;
  role: string;
  createdAt: string;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  acceptedAt: string | null;
}

interface Roster {
  members: Member[];
  invites: Invite[];
  teamLimit: number;
}

const ROLE_LABELS: Record<string, string> = { editor: '可编辑', viewer: '可查看' };

export function TeamPanel() {
  const state = useStudioReady();
  const [roster, setRoster] = useState<Roster | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** 新建邀请时返回的一次性链接；roster 里没有 token，所以只能在这里展示 */
  const [freshLink, setFreshLink] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${state.projectId}/members`, { cache: 'no-store' });
      if (!res.ok) {
        setError(`名册读不出来（HTTP ${res.status}）`);
        return;
      }
      setRoster((await res.json()) as Roster);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '名册读取失败');
    }
  }, [state.projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const occupied = roster ? roster.members.length + roster.invites.filter((i) => i.status === 'pending').length : 0;
  const full = roster ? occupied >= roster.teamLimit : false;

  const invite = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setFreshLink(null);
    try {
      const res = await fetch(`/api/projects/${state.projectId}/members/invite`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string; message?: string; token?: string } | null;
      if (!res.ok || !body?.ok) {
        setError(body?.message ?? body?.reason ?? `邀请失败（HTTP ${res.status}）`);
        return;
      }
      // 链接只在创建这一下给：token 是 secret，roster 永远不给（命中 pending 去重时也不给）
      if (body.token) {
        setFreshLink(`${window.location.origin}/invites/${body.token}`);
        setNotice(`邀请已创建。本机没有发信服务——把这条链接转交给 ${email.trim()}，对方登录后打开即加入。`);
      } else {
        setNotice('这个邮箱已经有一封没兑现的邀请了；要新链接先撤回旧的那一封。');
      }
      setEmail('');
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '邀请失败');
    } finally {
      setBusy(false);
    }
  };

  const act = async (url: string, okMessage: string, payload: unknown = {}) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? `操作失败（HTTP ${res.status}）`);
        return;
      }
      setNotice(okMessage);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-[var(--nexus-space-3)]" data-team-panel>
      <h3 className="font-mono text-11 uppercase tracking-wide text-fg-3">团队（§133 · teamCollaboration）</h3>
      <p className="text-11 text-fg-2">
        协作者上限随档位（本档 {roster?.teamLimit ?? '—'} 人，不含所有者）。成员与未兑现的邀请都占名额；
        撤回或移除立刻释放。owner 自己不是成员行——名额数的是"除所有者外还能拉几个人"。
      </p>

      <section className="flex flex-col gap-2" data-team-invite-form>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-11 text-fg-3">
            邮箱
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              data-team-invite-email
              className="w-[220px] rounded-[var(--nexus-radius-sm)] bg-bg-3 p-1 text-12 text-fg-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-11 text-fg-3">
            角色
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}
              data-team-invite-role
              className="rounded-[var(--nexus-radius-sm)] bg-bg-3 p-1 text-12 text-fg-1"
            >
              <option value="editor">可编辑</option>
              <option value="viewer">可查看</option>
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !email.trim()}
            onClick={() => void invite()}
            data-team-invite
            className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-3 py-1 text-12 text-fg-1 disabled:opacity-40"
          >
            {busy ? '处理中…' : '发邀请'}
          </button>
        </div>
        <p className="text-11 text-fg-3" data-team-slots>
          已占 {occupied} / {roster?.teamLimit ?? '—'} 个名额（成员 {roster?.members.length ?? 0} + 未兑现邀请{' '}
          {roster?.invites.filter((i) => i.status === 'pending').length ?? 0}）
          {full ? '——满了，服务端会拒新的邀请（400）' : ''}
        </p>
      </section>

      {error ? (
        <p className="text-11 text-danger" data-team-error>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="text-11 text-accent-2" data-team-notice>
          {notice}
        </p>
      ) : null}
      {freshLink ? (
        <div className="flex flex-col gap-1 rounded-[var(--nexus-radius-sm)] bg-bg-2 p-2" data-team-fresh-link>
          <span className="text-11 text-fg-3">邀请链接（只显示这一次，刷新后只能撤回再邀拿新的）：</span>
          <code className="break-all text-11 text-fg-1">{freshLink}</code>
        </div>
      ) : null}

      <section className="flex flex-col gap-1" data-team-members>
        <span className="text-11 text-fg-3">成员（{roster?.members.length ?? 0}）</span>
        {roster && roster.members.length ? (
          <ul className="flex flex-col gap-1">
            {roster.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 text-12 text-fg-2" data-team-member={m.userId}>
                <span>
                  {m.displayName ?? '（没有名字）'} · {m.email ?? '（没有邮箱）'} · {ROLE_LABELS[m.role] ?? m.role}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(`/api/projects/${state.projectId}/members/remove`, `已移除 ${m.displayName ?? m.email ?? m.userId}`, {
                      userId: m.userId,
                    })
                  }
                  data-team-remove={m.userId}
                  className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-2 py-[1px] text-11 text-danger disabled:opacity-40"
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-11 text-fg-3">还没有协作者。所有者不算成员——名额数的是除你之外的人。</p>
        )}
      </section>

      <section className="flex flex-col gap-1" data-team-invites>
        <span className="text-11 text-fg-3">邀请（{roster?.invites.length ?? 0}）</span>
        {roster && roster.invites.length ? (
          <ul className="flex flex-col gap-1">
            {roster.invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 text-12 text-fg-2" data-team-invite-row={i.id}>
                <span>
                  {i.email} · {ROLE_LABELS[i.role] ?? i.role} ·{' '}
                  {i.status === 'pending' ? '未兑现' : i.status === 'accepted' ? '已接受' : '已撤回'}
                </span>
                {i.status === 'pending' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void act(`/api/projects/${state.projectId}/invites/${i.id}/revoke`, `已撤回给 ${i.email} 的邀请`)
                    }
                    data-team-revoke={i.id}
                    className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-2 py-[1px] text-11 text-warn disabled:opacity-40"
                  >
                    撤回
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-11 text-fg-3">没有邀请。</p>
        )}
      </section>

      <p className="text-11 text-fg-3">
        本机没有发信服务：邀请链接由你转交。editor / viewer 只是档案标签——协作者的读写权限模型还没接，
        界面上不承诺"可查看不能改"（§160 不假造）。
      </p>
    </div>
  );
}
