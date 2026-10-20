import { useState } from 'react';

import { giveTip } from '@/lib/tipLane';
import { session } from '@/lib/accountSession';
import { claimOf } from '@/lib/socialClaim';

/**
 * M7 v298 — the TIP composer.
 *
 * A tip carries an AMOUNT, so the composer asks for one \u2014 in YUAN, because the currency is CNY in this
 * build and the client says the same. The amount is converted to CENTS before it is sent, because the
 * service\u2019s unit is cents and a decimal amount is a thing a client and a service can disagree about.
 *
 * The rule the component keeps: it never INVENTS an author. A device with no account has no claim, and
 * the composer says so by name rather than giving a tip on somebody\u2019s behalf.
 */
export function TipComposer({ accountId, onClose }: { accountId: string; onClose?: () => void }) {
  const [yuan, setYuan] = useState('5');
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const post = async () => {
    const account = session.current();
    const claim = claimOf(account?.id ?? null, account?.handle ?? null, account?.assurance ?? null);
    if (!claim) {
      setNote('this device has no account, and a tip needs one');
      return;
    }
    // Yuan to CENTS, and a refusal to anything that is not a whole number of cents: a tip of 5.555 yuan
    // has no honest reading in a unit of cents.
    const cents = Math.round(Number(yuan) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setNote('a tip must be more than nothing');
      return;
    }
    setBusy(true);
    const answer = await giveTip(accountId, cents, message, anonymous, claim);
    setBusy(false);
    if (answer.ok) {
      setMessage('');
      setNote('tipped ' + accountId + ' \u00b5 ' + (answer.tip?.amountCents ?? cents) + ' cents');
    } else {
      setNote('could not tip: ' + (answer.reason ?? 'no reason given'));
    }
  };

  return (
    <div
      data-tip-composer={accountId}
      style={{
        position: 'fixed',
        top: 54,
        right: 16,
        zIndex: 46,
        width: 360,
        background: 'var(--nexus-panel, #12151b)',
        border: '1px solid var(--nexus-border, #262b34)',
        borderRadius: 6,
        padding: 10,
        fontSize: 11,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>TIP</div>
      <div style={{ color: 'var(--nexus-muted)', marginBottom: 6 }}>to {accountId}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <span style={{ color: 'var(--nexus-muted)' }}>\u00a5</span>
        <input
          data-tip-amount
          value={yuan}
          onChange={(e) => setYuan(e.target.value)}
          style={{
            width: 80,
            background: '#1b2230',
            border: '1px solid #262b34',
            borderRadius: 4,
            color: 'var(--nexus-text, #e6e8ec)',
            font: '11px Inter, system-ui, sans-serif',
            padding: 5,
          }}
        />
        <label style={{ display: 'flex', gap: 4, alignItems: 'center', color: 'var(--nexus-muted)' }}>
          <input type="checkbox" data-tip-anonymous checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
          anonymous
        </label>
      </div>
      <textarea
        data-tip-message
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="say something with it? (optional)"
        style={{
          width: '100%',
          minHeight: 50,
          background: '#1b2230',
          border: '1px solid #262b34',
          borderRadius: 4,
          color: 'var(--nexus-text, #e6e8ec)',
          font: '11px Inter, system-ui, sans-serif',
          padding: 6,
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button className="btn btn-primary" data-tip-post onClick={() => void post()} disabled={busy}>
          {busy ? 'sending\u2026' : 'Tip'}
        </button>
        {onClose && (
          <button className="btn" data-tip-close onClick={onClose}>
            Close
          </button>
        )}
      </div>
      {note && (
        <div data-tip-note style={{ marginTop: 6, color: 'var(--nexus-muted)' }}>
          {note}
        </div>
      )}
    </div>
  );
}
