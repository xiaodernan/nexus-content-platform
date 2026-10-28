'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { csrfToken } from '@/lib/csrf';

interface Identity {
  displayName: string;
  email: string | null;
  guest: boolean;
}

export function AccountPanel({ user }: { user: Identity }) {
  const router = useRouter();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const path = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
        body: JSON.stringify(mode === 'register' ? { email, password, displayName: displayName.trim() || undefined } : { email, password }),
      });
      const body = (await res.json().catch(() => null)) as
        | { message?: string; issues?: string[]; claimedProjects?: number }
        | null;
      if (!res.ok) throw new Error(body?.issues?.join('；') ?? body?.message ?? `HTTP ${res.status}`);
      if (mode === 'register' && typeof body?.claimedProjects === 'number') {
        setNotice(`账号已创建，已认领 ${body.claimedProjects} 个此前的游客项目`);
      }
      setEmail('');
      setPassword('');
      setDisplayName('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST', headers: { 'x-csrf-token': csrfToken() } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-[var(--nexus-space-3)]">
      {notice ? (
        <p className="text-12 text-fg-2" data-auth-notice>
          {notice}
        </p>
      ) : null}
      <div className="flex items-center justify-between" data-auth-identity={user.guest ? 'guest' : 'member'}>
        <span className="text-[var(--nexus-font-size-13)] text-fg-2">
          {user.guest ? (
            <>当前是<b className="text-fg-1">游客</b>（{user.displayName}）。注册即可把游客项目认领到自己的账号。</>
          ) : (
            <>已登录：<b className="text-fg-1">{user.email}</b></>
          )}
          {/* §134：游客也在被记账（一次生成扣的就是这个会话名下那 100 点），
              所以这一页对两种身份都得进得去 */}
          <Link href="/credits" className="ml-2 text-12 text-accent-2 underline" data-credits-link>
            额度与消费
          </Link>
          {/* §188：公开 API 的凭据也是账号的一部分，游客没有可认领的项目，这一页只对登录态开 */}
          {!user.guest ? (
            <Link href="/api-tokens" className="ml-2 text-12 text-accent-2 underline" data-api-tokens-link>
              API 凭据
            </Link>
          ) : null}
        </span>
        {!user.guest ? (
          <span className="flex items-center gap-[var(--nexus-space-2)]">
            <button
              type="button"
              onClick={() => void logout()}
              disabled={busy}
              className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-[var(--nexus-space-3)] py-1 text-12 text-fg-2 hover:bg-bg-2 disabled:opacity-40"
              data-auth-logout
            >
              登出
            </button>
          </span>
        ) : null}
      </div>

      {user.guest ? (
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-[var(--nexus-space-2)]">
          <div className="flex gap-[var(--nexus-space-2)]">
            <button
              type="button"
              onClick={() => setMode('register')}
              className={tabClass(mode === 'register')}
              data-auth-tab="register"
            >
              注册
            </button>
            <button
              type="button"
              onClick={() => setMode('login')}
              className={tabClass(mode === 'login')}
              data-auth-tab="login"
            >
              登录
            </button>
          </div>
          {mode === 'register' ? (
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="昵称（可选）"
              maxLength={60}
              className={inputClass}
              data-auth-displayname
            />
          ) : null}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="邮箱"
            autoComplete="email"
            className={inputClass}
            data-auth-email
          />
          <input
            type="password"
            required
            minLength={mode === 'register' ? 8 : 1}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'register' ? '口令（至少 8 位）' : '口令'}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            className={inputClass}
            data-auth-password
          />
          <div className="flex items-center gap-[var(--nexus-space-3)]">
            <button
              type="submit"
              disabled={busy}
              className="rounded-[var(--nexus-radius-sm)] bg-brand px-[var(--nexus-space-4)] py-2 text-14 font-medium text-accent-fg disabled:opacity-40"
              data-auth-submit
            >
              {busy ? '处理中…' : mode === 'register' ? '注册并认领项目' : '登录'}
            </button>
          </div>
          {error ? <p className="text-12 text-danger" data-auth-error>{error}</p> : null}
        </form>
      ) : null}
    </section>
  );
}

const inputClass =
  'rounded-[var(--nexus-radius-sm)] bg-bg-2 px-[var(--nexus-space-3)] py-2 text-14 placeholder:text-fg-3';

function tabClass(active: boolean): string {
  const base = 'rounded-[var(--nexus-radius-sm)] px-[var(--nexus-space-3)] py-1 text-13';
  return active ? `${base} bg-bg-3 text-fg-1` : `${base} text-fg-3 hover:bg-bg-2`;
}
