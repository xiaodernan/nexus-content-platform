'use client';

import { useCallback, useEffect, useState } from 'react';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';
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
 * - **角色有实质差别**（#206）：editor 能写，viewer 的写请求会被服务端 403 挡下。
 *   owner 可以改成员角色，改完立刻生效——写门每次现读成员行，不需要对方重新接受邀请。
 * 双语（v744）：locale 由 StudioShell 透传；zh 原文原样保留，en 逐句对应。
 */

const COPY = {
  zh: {
    heading: '团队（§133 · teamCollaboration）',
    lede: '协作者上限随档位（本档 {limit} 人，不含所有者）。成员与未兑现的邀请都占名额；撤回或移除立刻释放。owner 自己不是成员行——名额数的是“除所有者外还能拉几个人”。',
    email: '邮箱',
    role: '角色',
    editor: '可编辑',
    viewer: '可查看',
    editorShort: '可编辑',
    viewerShort: '可查看',
    sendInvite: '发邀请',
    busy: '处理中…',
    rosterFailed: (status: number) => `名册读不出来（HTTP ${status}）`,
    rosterReadFailed: '名册读取失败',
    inviteFailed: (status: number) => `邀请失败（HTTP ${status}）`,
    inviteCreated: (to: string) => `邀请已创建。本机没有发信服务——把这条链接转交给 ${to}，对方登录后打开即加入。`,
    inviteDuplicate: '这个邮箱已经有一封没兑现的邀请了；要新链接先撤回旧的那一封。',
    opFailed: (status: number) => `操作失败（HTTP ${status}）`,
    opFailedPlain: '操作失败',
    slots: (occupied: number, limit: string, members: number, pending: number) =>
      `已占 ${occupied} / ${limit} 个名额（成员 ${members} + 未兑现邀请 ${pending}）`,
    expiredPending: (n: number) => `；另有 ${n} 封已过期，不占名额`,
    full: '——满了，服务端会拒新的邀请（400）',
    freshLinkLead: '邀请链接（只显示这一次，刷新后只能撤回再邀拿新的）：',
    members: '成员',
    noName: '（没有名字）',
    noEmail: '（没有邮箱）',
    roleAria: (name: string) => `${name} 的角色`,
    remove: '移除',
    removeNotice: (name: string) => `已移除 ${name}`,
    roleChanged: (name: string, role: string) => `已把 ${name} 改为${role}`,
    noCollaborators: '还没有协作者。所有者不算成员——名额数的是除你之外的人。',
    invites: '邀请',
    statusExpired: '已过期',
    statusPending: '未兑现',
    statusAccepted: '已接受',
    statusRevoked: '已撤回',
    expiresAt: (d: string) => ` · 有效至 ${d}`,
    revoke: '撤回',
    revokeNotice: (email: string) => `已撤回给 ${email} 的邀请`,
    noInvites: '没有邀请。',
    footnote: '本机没有发信服务：邀请链接由你转交。editor 能编辑；viewer 的写请求会被服务端拒绝（403）。改角色立刻生效，不需要对方重新接受邀请，也不影响名额。',
  },
  en: {
    heading: 'Team (§133 · teamCollaboration)',
    lede: 'The collaborator cap follows the plan tier ({limit} people in this tier, not counting the owner). Members and unaccepted invites both occupy seats, and revoking or removing frees one immediately. The owner is not a member row — the cap counts “how many others can you pull in”.',
    email: 'Email',
    role: 'Role',
    editor: 'Editor',
    viewer: 'Viewer',
    editorShort: 'Editor',
    viewerShort: 'Viewer',
    sendInvite: 'Send invite',
    busy: 'Working…',
    rosterFailed: (status: number) => `The roster cannot be read (HTTP ${status})`,
    rosterReadFailed: 'Roster read failed',
    inviteFailed: (status: number) => `Invite failed (HTTP ${status})`,
    inviteCreated: (to: string) => `Invite created. There is no mail service on this machine — hand the link to ${to}; when they sign in and open it, they join.`,
    inviteDuplicate: 'This address already has a pending invite; to get a new link, revoke the old one first.',
    opFailed: (status: number) => `Operation failed (HTTP ${status})`,
    opFailedPlain: 'Operation failed',
    slots: (occupied: number, limit: string, members: number, pending: number) =>
      `${occupied} / ${limit} seats taken (${members} members + ${pending} pending invites)`,
    expiredPending: (n: number) => `; ${n} more expired and occupy nothing`,
    full: ' — full; the server will refuse new invites (400)',
    freshLinkLead: 'Invite link (shown this once only — after a refresh you can only revoke and re-invite for a new one):',
    members: 'Members',
    noName: '(no name)',
    noEmail: '(no email)',
    roleAria: (name: string) => `${name} role`,
    remove: 'Remove',
    removeNotice: (name: string) => `Removed ${name}`,
    roleChanged: (name: string, role: string) => `Changed ${name} to ${role}`,
    noCollaborators: 'No collaborators yet. The owner is not a member — the cap counts people besides you.',
    invites: 'Invites',
    statusExpired: 'Expired',
    statusPending: 'Pending',
    statusAccepted: 'Accepted',
    statusRevoked: 'Revoked',
    expiresAt: (d: string) => ` · valid until ${d}`,
    revoke: 'Revoke',
    revokeNotice: (email: string) => `Revoked invite for ${email}`,
    noInvites: 'No invites.',
    footnote: 'No mail service on this machine: the invite link is yours to hand over. Editors can edit; viewers have their writes refused server-side (403). Role changes take effect immediately and do not affect seats.',
  },
} as const;

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
  /** 有效期截止（ISO）；过期后不再占名额、也收不了 */
  expiresAt: string;
  /** status==='pending' 且 expiresAt 已过——计算值，不是第四种 status */
  expired: boolean;
}

interface Roster {
  members: Member[];
  invites: Invite[];
  teamLimit: number;
}

export function TeamPanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const roleLabel = (role: string) => (role === 'editor' ? c.editor : role === 'viewer' ? c.viewer : role);
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
        setError(c.rosterFailed(res.status));
        return;
      }
      setRoster((await res.json()) as Roster);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : c.rosterReadFailed);
    }
  }, [state.projectId, c]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 过期的 pending 邀请不占名额（与服务端 teamSlotRefusalFor 同一口径）——
  // 界面上的"已占 N"如果比服务端多算，用户会以为自己满了而服务端其实放行。
  const livePending = roster ? roster.invites.filter((i) => i.status === 'pending' && !i.expired).length : 0;
  const expiredPending = roster ? roster.invites.filter((i) => i.status === 'pending' && i.expired).length : 0;
  const occupied = roster ? roster.members.length + livePending : 0;
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
        setError(body?.message ?? body?.reason ?? c.inviteFailed(res.status));
        return;
      }
      // 链接只在创建这一下给：token 是 secret，roster 永远不给（命中 pending 去重时也不给）
      if (body.token) {
        setFreshLink(`${window.location.origin}/invites/${body.token}`);
        setNotice(c.inviteCreated(email.trim()));
      } else {
        setNotice(c.inviteDuplicate);
      }
      setEmail('');
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : c.opFailedPlain);
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
        setError(body?.message ?? c.opFailed(res.status));
        return;
      }
      setNotice(okMessage);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : c.opFailedPlain);
    } finally {
      setBusy(false);
    }
  };

  const memberName = (m: Member) => m.displayName ?? m.email ?? m.userId;

  return (
    <div className="tp-rootPad" data-team-panel>
      <h3 className="sb-label">{c.heading}</h3>
      <p className="sb-ink11">
        {c.lede.replace('{limit}', String(roster?.teamLimit ?? '—'))}
      </p>

      <section className="wd-col2" data-team-invite-form>
        <div className="tp-rowEnd">
          <label className="tp-colFaint">
            {c.email}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              data-team-invite-email
              className="tp-w220"
            />
          </label>
          <label className="tp-colFaint">
            {c.role}
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}
              data-team-invite-role
              className="tp-chipPrimary"
            >
              <option value="editor">{c.editorShort}</option>
              <option value="viewer">{c.viewerShort}</option>
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !email.trim()}
            onClick={() => void invite()}
            data-team-invite
            className="tp-btnPrimary"
          >
            {busy ? c.busy : c.sendInvite}
          </button>
        </div>
        <p className="sb-faint11" data-team-slots>
          {c.slots(occupied, String(roster?.teamLimit ?? '—'), roster?.members.length ?? 0, livePending)}
          {expiredPending > 0 ? c.expiredPending(expiredPending) : ''}
          {full ? c.full : ''}
        </p>
      </section>

      {error ? (
        <p className="wd-danger11" data-team-error>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="tp-accent2Ink" data-team-notice>
          {notice}
        </p>
      ) : null}
      {freshLink ? (
        <div className="tp-cardFaint" data-team-fresh-link>
          <span className="sb-faint11">{c.freshLinkLead}</span>
          <code className="tp-breakAll">{freshLink}</code>
        </div>
      ) : null}

      <section className="gp-col1" data-team-members>
        <span className="sb-faint11">{c.members}（{roster?.members.length ?? 0}）</span>
        {roster && roster.members.length ? (
          <ul className="gp-col1">
            {roster.members.map((m) => (
              <li key={m.id} className="tp-rowBetween" data-team-member={m.userId}>
                <span>
                  {m.displayName ?? c.noName} · {m.email ?? c.noEmail}
                </span>
                <span className="wd-row2">
                  <select
                    value={m.role}
                    disabled={busy}
                    onChange={(e) =>
                      void act(
                        `/api/projects/${state.projectId}/members/role`,
                        c.roleChanged(memberName(m), roleLabel(e.target.value)),
                        { userId: m.userId, role: e.target.value },
                      )
                    }
                    data-team-member-role={m.userId}
                    aria-label={c.roleAria(memberName(m))}
                    className="tp-chipPrimarySm"
                  >
                    <option value="editor">{c.editorShort}</option>
                    <option value="viewer">{c.viewerShort}</option>
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void act(`/api/projects/${state.projectId}/members/remove`, c.removeNotice(memberName(m)), {
                        userId: m.userId,
                      })
                    }
                    data-team-remove={m.userId}
                    className="tp-chipDanger"
                  >
                    {c.remove}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sb-faint11">{c.noCollaborators}</p>
        )}
      </section>

      <section className="gp-col1" data-team-invites>
        <span className="sb-faint11">{c.invites}（{roster?.invites.length ?? 0}）</span>
        {roster && roster.invites.length ? (
          <ul className="gp-col1">
            {roster.invites.map((i) => (
              <li
                key={i.id}
                className="tp-rowBetween"
                data-team-invite-row={i.id}
                data-team-invite-expired={i.expired ? 'true' : 'false'}
              >
                <span>
                  {i.email} · {roleLabel(i.role)} ·{' '}
                  {i.status === 'pending'
                    ? i.expired
                      ? c.statusExpired
                      : c.statusPending
                    : i.status === 'accepted'
                      ? c.statusAccepted
                      : c.statusRevoked}
                  {i.status === 'pending' ? (
                    <span className="sb-faint11">{c.expiresAt(i.expiresAt.slice(0, 10))}</span>
                  ) : null}
                </span>
                {i.status === 'pending' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void act(`/api/projects/${state.projectId}/invites/${i.id}/revoke`, c.revokeNotice(i.email))
                    }
                    data-team-revoke={i.id}
                    className="tp-chipWarn"
                  >
                    {c.revoke}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="sb-faint11">{c.noInvites}</p>
        )}
      </section>

      <p className="sb-faint11">
        {c.footnote}
      </p>
    </div>
  );
}
