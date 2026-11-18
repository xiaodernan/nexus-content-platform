'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 观察站守门表单（client）——口令 123，刻意公开。
 * 成功后整页刷新，服务端那道门（cookie）自然打开。
 */
export function PasswordForm({ locale }: { locale: 'zh' | 'en' }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const COPY = locale === 'zh'
    ? { button: '进入只读观察站', placeholder: '口令', errorWrong: '口令不对——提示：是 123。', hint: '口令公开：123', submitting: '正在进入…' }
    : { button: 'Open read-only observer', placeholder: 'Password', errorWrong: 'Wrong password — hint: it is 123.', hint: 'Password is public: 123', submitting: 'Entering…' };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch('/api/admin/observer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (r.ok) {
      router.refresh();
      return;
    }
    setError(COPY.errorWrong);
    setBusy(false);
  }

  return (
    <form className="obs-gateForm" onSubmit={(event) => { void submit(event); }} data-observer-gate-form>
      <label className="obs-gateLabel" htmlFor="observer-password">
        {COPY.hint}
      </label>
      <div className="obs-gateRow">
        <input
          id="observer-password"
          className="obs-gateInput"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-observer-gate-input
        />
        <button type="submit" className="obs-gateButton" disabled={busy} data-observer-gate-button>
          {busy ? COPY.submitting : COPY.button}
        </button>
      </div>
      {error ? (
        <p className="obs-gateError" role="alert" data-observer-gate-error>
          {error}
        </p>
      ) : null}
    </form>
  );
}
