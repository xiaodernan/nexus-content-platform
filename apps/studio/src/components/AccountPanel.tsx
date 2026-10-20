'use client';
import { useEffect, useState } from 'react';
import { session } from '../lib/accountSession';
import { offerPlan } from '@/lib/planLane';
import { claimOf } from '@/lib/socialClaim';
import type { AccountRecord } from '@/lib/accounts';

/**
 * M7 v252 — the Studio's account face: the one control that answers "who is this device publishing as".
 *
 * The panel holds NO storage logic of its own — every verb is a call into `accountSession`
 * (`register` / `rename` / `signOut` / `current`), which is where the rules and their refusals live
 * and where they are tested. What this file owns is the conversation: showing the verdict the session
 * returned, including the refusals ("sign out first", "handle too short") verbatim.
 *
 * It renders `assurance: 'unsigned-local'` from the record itself — no "signed in" badge exists to
 * draw, because ADR 0018 records that one would be a lie in this build.
 */
export function AccountPanel({ onClose }: { onClose?: () => void }) {
  const [account, setAccount] = useState<AccountRecord | null>(null);
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  // v301 — offering a PLAN: the plan id is an ADDRESS people are given, the price is in yuan (the
  // composer converts to cents, because a decimal amount is a thing a client and a service can disagree
  // about), and the period is one of the three the service knows.
  const [planId, setPlanId] = useState('');
  const [planPrice, setPlanPrice] = useState('15');
  const [planPeriod, setPlanPeriod] = useState('month');
  const [planMessage, setPlanMessage] = useState('');

  useEffect(() => {
    setAccount(session.current());
  }, []);

  const onCreate = () => {
    setLoading(true);
    setMessage('');
    try {
      const result = session.register(handle, displayName);
      if (!result.ok) {
        setMessage(result.reason);
        return;
      }
      setAccount(result.account);
      setHandle(result.account.handle);
      setDisplayName(result.account.displayName);
      setMessage('local account created — unsigned-local, this device only');
    } finally {
      setLoading(false);
    }
  };

  const onRename = () => {
    const result = session.rename(displayName);
    if (!result.ok) {
      setMessage(result.reason);
      return;
    }
    setAccount(result.account);
    setMessage('display name updated');
  };

  const onSignOut = () => {
    session.signOut();
    setAccount(null);
    setHandle('');
    setDisplayName('');
    setMessage('signed out — this device publishes anonymously again');
  };

  const onOfferPlan = async () => {
    setPlanMessage('');
    const claim = claimOf(account?.id ?? null, account?.handle ?? null, account?.assurance ?? null);
    if (!claim) {
      setPlanMessage('this device has no account, and a plan needs one');
      return;
    }
    const cents = Math.round(Number(planPrice) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setPlanMessage('a plan must cost more than nothing');
      return;
    }
    const answer = await offerPlan(planId.trim(), cents, 'CNY', planPeriod, claim);
    setPlanMessage(
      answer.ok
        ? `offered ${planId.trim()} at ${cents} cents (${planPeriod})`
        : `could not offer the plan: ${answer.reason ?? 'no reason given'}`,
    );
  };

  const fieldStyle = {
    fontSize: 13,
    padding: '8px 12px',
    borderRadius: 4,
    border: '1px solid var(--nexus-border)',
    background: 'var(--nexus-panel)',
    color: 'var(--nexus-text)',
  } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, minWidth: 280, maxWidth: 360 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 14 }}>Account</strong>
        <button
          className="btn"
          data-account-close
          style={{ fontSize: 10, padding: '2px 8px' }}
          onClick={onClose}
          title="Close"
        >
          ✕
        </button>
      </div>

      {account ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }} data-account-display>
              {account.displayName}
            </span>
            <span
              data-account-handle
              style={{
                fontSize: 11,
                color: 'var(--nexus-muted)',
                background: 'var(--nexus-border)',
                padding: '2px 6px',
                borderRadius: 4,
              }}
            >
              @{account.handle}
            </span>
          </div>
          <div data-account-assurance style={{ fontSize: 11, color: 'var(--nexus-muted)' }}>
            {account.assurance} · this device only
          </div>
          <div style={{ fontSize: 11, color: 'var(--nexus-muted)', fontFamily: 'monospace' }}>
            id: {account.id}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              data-account-display-name
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name"
              style={{ ...fieldStyle, flex: 1, fontSize: 12, padding: '4px 8px' }}
            />
            <button className="btn" data-account-save-name onClick={onRename} style={{ fontSize: 11, padding: '4px 12px' }}>
              Save
            </button>
          </div>
          <button
            className="btn"
            data-account-signout
            onClick={onSignOut}
            style={{ background: 'var(--nexus-border)', color: 'var(--nexus-muted)' }}
          >
            Sign out
          </button>
          {/* v301 — offering a PLAN. It lives in the ACCOUNT panel because a plan is a creator's own
              claim about their own work, and the account is where a creator's claims are made. The price is
              typed in YUAN and sent in CENTS, and the period is one of the three the service knows. */}
          <div
            data-account-plans
            style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--nexus-border)', paddingTop: 12 }}
          >
            <strong style={{ fontSize: 12 }}>Offer a plan</strong>
            <input
              type="text"
              data-plan-id-input
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              placeholder="Plan id (the address people are given)"
              style={fieldStyle}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--nexus-muted)' }}>¥</span>
              <input
                type="text"
                data-plan-price-input
                value={planPrice}
                onChange={(e) => setPlanPrice(e.target.value)}
                placeholder="15"
                style={{ ...fieldStyle, width: 90 }}
              />
              <select
                data-plan-period-select
                value={planPeriod}
                onChange={(e) => setPlanPeriod(e.target.value)}
                style={fieldStyle}
              >
                <option value="once">one-off</option>
                <option value="month">monthly</option>
                <option value="year">yearly</option>
              </select>
            </div>
            <button className="btn" data-plan-offer onClick={() => void onOfferPlan()} style={{ fontSize: 11, padding: '4px 12px' }}>
              Offer
            </button>
            {planMessage && (
              <div data-plan-note style={{ fontSize: 11, color: 'var(--nexus-muted)' }}>
                {planMessage}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12, color: 'var(--nexus-muted)', margin: 0 }}>
            Pick a handle this device will answer to. It carries no proof — it is an unsigned local name
            until a service can verify one (ADR 0018).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              data-account-handle-input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="Handle"
              style={fieldStyle}
            />
            <input
              type="text"
              data-account-display-name
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name (optional)"
              style={fieldStyle}
            />
            <button
              className="btn btn-primary"
              data-account-create
              onClick={onCreate}
              disabled={loading}
              style={{ marginTop: 4 }}
            >
              {loading ? 'Creating…' : 'Create Account'}
            </button>
          </div>
        </div>
      )}

      {message && (
        <div data-account-message style={{ fontSize: 11, color: 'var(--nexus-brand)', marginTop: 4 }}>
          {message}
        </div>
      )}
    </div>
  );
}
