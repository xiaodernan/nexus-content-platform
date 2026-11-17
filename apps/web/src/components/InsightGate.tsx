'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/lib/i18n';

/**
 * /insight 的口令门（公共口令 123，见 API 端的说明）。
 * 提交成功 → 整页刷新让 RSC 重新读 cookie 直出完整页面。
 */
export function InsightGate({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<'wrong-password' | 'rate-limited' | 'generic' | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = locale === 'zh'
    ? { label: '口令', placeholder: '输入口令…', submit: '进入观察哨', wrong: '口令不对——再试一次。', rate: '尝试太频繁，休息一下再来。', generic: '没进去——稍后再试。', busy: '进入中…' }
    : { label: 'Password', placeholder: 'Enter the passcode…', submit: 'Enter Insight', wrong: 'Wrong passcode — try again.', rate: 'Too many attempts — wait a moment.', generic: 'Couldn’t enter — try again shortly.', busy: 'Entering…' };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/insight/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      if (res.status === 401) { setError('wrong-password'); }
      else if (res.status === 429) { setError('rate-limited'); }
      else { setError('generic'); }
    } catch {
      setError('generic');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="insg-gate" onSubmit={onSubmit} data-insight-gate>
      <label className="insg-gateLabel" htmlFor="insight-password">{copy.label}</label>
      <div className="insg-gateRow">
        <input
          id="insight-password"
          className="insg-gateInput"
          type="password"
          autoComplete="off"
          autoFocus
          placeholder={copy.placeholder}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-insight-password
        />
        <button type="submit" className="insg-gateSubmit" disabled={busy || password.length === 0} data-insight-submit>
          {busy ? copy.busy : copy.submit}
        </button>
      </div>
      {error ? (
        <p className="insg-gateError" role="alert" data-insight-error>
          {error === 'wrong-password' ? copy.wrong : error === 'rate-limited' ? copy.rate : copy.generic}
        </p>
      ) : null}
    </form>
  );
}
