'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { csrfToken } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

interface Identity {
  displayName: string;
  email: string | null;
  guest: boolean;
}

const COPY: Record<Locale, {
  guestNow: string;
  guestVisitor: string;
  signedIn: string;
  registerHint: string;
  creditsLink: string;
  apiTokensLink: string;
  logout: string;
  register: string;
  login: string;
  displayNamePlaceholder: string;
  displayNameAria: string;
  emailPlaceholder: string;
  emailAria: string;
  passwordPlaceholderRegister: string;
  passwordPlaceholderLogin: string;
  passwordAria: string;
  noticeClaimed: (n: number) => string;
  busy: string;
  registerCta: string;
  loginCta: string;
}> = {
  zh: {
    guestNow: '当前是',
    guestVisitor: '游客',
    registerHint: '注册即可把游客项目认领到自己的账号。',
    signedIn: '已登录：',
    creditsLink: '额度与消费',
    apiTokensLink: 'API 凭据',
    logout: '登出',
    register: '注册',
    login: '登录',
    displayNamePlaceholder: '昵称（可选）',
    displayNameAria: '显示名',
    emailPlaceholder: '邮箱',
    emailAria: '邮箱',
    passwordPlaceholderRegister: '口令（至少 8 位）',
    passwordPlaceholderLogin: '口令',
    passwordAria: '口令',
    noticeClaimed: (n) => `账号已创建，已认领 ${n} 个此前的游客项目`,
    busy: '处理中…',
    registerCta: '注册并认领项目',
    loginCta: '登录',
  },
  en: {
    guestNow: 'You are currently a',
    guestVisitor: 'guest',
    registerHint: 'an account claims your guest projects onto it.',
    signedIn: 'Signed in as:',
    creditsLink: 'Credits & spending',
    apiTokensLink: 'API tokens',
    logout: 'Sign out',
    register: 'Register',
    login: 'Sign in',
    displayNamePlaceholder: 'Nickname (optional)',
    displayNameAria: 'Display name',
    emailPlaceholder: 'Email',
    emailAria: 'Email',
    passwordPlaceholderRegister: 'Password (8+ characters)',
    passwordPlaceholderLogin: 'Password',
    passwordAria: 'Password',
    noticeClaimed: (n) => `Account created — ${n} earlier guest project(s) claimed`,
    busy: 'Working…',
    registerCta: 'Register & claim projects',
    loginCta: 'Sign in',
  },
};

export function AccountPanel({ user, locale = 'zh' }: { user: Identity; locale?: Locale }) {
  const c = COPY[locale];
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
        setNotice(c.noticeClaimed(body.claimedProjects));
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
    <section className="ac-root">
      {notice ? (
        <p className="ac-note" data-auth-notice>
          {notice}
        </p>
      ) : null}
      <div className="ac-between" data-auth-identity={user.guest ? 'guest' : 'member'}>
        <span className="ac-ident">
          {user.guest ? (
            <>{c.guestNow} <b className="ac-strong">{c.guestVisitor}</b>{locale === 'en' ? ` (${user.displayName})` : ''}。{c.registerHint}</>
          ) : (
            <>{c.signedIn} <b className="ac-strong">{user.email}</b></>
          )}
          <Link href="/credits" className="ac-inlineLink" data-credits-link>
            {c.creditsLink}
          </Link>
          {!user.guest ? (
            <Link href="/api-tokens" className="ac-inlineLink" data-api-tokens-link>
              {c.apiTokensLink}
            </Link>
          ) : null}
        </span>
        {!user.guest ? (
          <span className="ac-inlineRow">
            <button
              type="button"
              onClick={() => void logout()}
              disabled={busy}
              className="ac-ghostBtnSm"
              data-auth-logout
            >
              {c.logout}
            </button>
          </span>
        ) : null}
      </div>

      {user.guest ? (
        <form onSubmit={(event) => void submit(event)} className="ac-form">
          <div className="ac-tabs">
            <button
              type="button"
              onClick={() => setMode('register')}
              className={tabClass(mode === 'register')}
              data-auth-tab="register"
            >
              {c.register}
            </button>
            <button
              type="button"
              onClick={() => setMode('login')}
              className={tabClass(mode === 'login')}
              data-auth-tab="login"
            >
              {c.login}
            </button>
          </div>
          {mode === 'register' ? (
            <input aria-label={c.displayNameAria}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={c.displayNamePlaceholder}
              maxLength={60}
              className={inputClass}
              data-auth-displayname
            />
          ) : null}
          <input aria-label={c.emailAria}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={c.emailPlaceholder}
            autoComplete="email"
            className={inputClass}
            data-auth-email
          />
          <input aria-label={c.passwordAria}
            type="password"
            required
            minLength={mode === 'register' ? 8 : 1}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'register' ? c.passwordPlaceholderRegister : c.passwordPlaceholderLogin}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            className={inputClass}
            data-auth-password
          />
          <div className="ac-submitRow">
            <button
              type="submit"
              disabled={busy}
              className="ac-submitBtn"
              data-auth-submit
            >
              {busy ? c.busy : mode === 'register' ? c.registerCta : c.loginCta}
            </button>
          </div>
          {error ? <p className="ac-error" data-auth-error>{error}</p> : null}
        </form>
      ) : null}
    </section>
  );
}

const inputClass =
  'ac-input';

function tabClass(active: boolean): string {
  const base = 'ac-tab';
  return active ? `${base} ac-tabActive` : `${base} ac-tabIdle`;
}
