import { useState } from 'react';

import { fileReport } from '@/lib/reportLane';
import { session } from '@/lib/accountSession';
import { claimOf } from '@/lib/socialClaim';
import { REPORT_REASONS } from '@/lib/reportBar';

/**
 * M7 v296 — the REPORT composer.
 *
 * A report is the one social act that asks somebody else to do something, and that is why this composer
 * asks for a REASON from a closed set of four: the reporter picks what kind of problem it is, and the
 * service counts by that reason.
 *
 * The rule the component keeps: it never INVENTS an author. A device with no account has no claim, and
 * the composer says so by name rather than reporting on somebody's behalf.
 */
export function ReportComposer({ projectId, onClose }: { projectId: string; onClose?: () => void }) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [detail, setDetail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const post = async () => {
    const account = session.current();
    const claim = claimOf(account?.id ?? null, account?.handle ?? null, account?.assurance ?? null);
    if (!claim) {
      setNote('this device has no account, and a report needs one');
      return;
    }
    setBusy(true);
    const answer = await fileReport(projectId, reason, detail, claim);
    setBusy(false);
    if (answer.ok) {
      setDetail('');
      setNote('reported ' + projectId + ' as ' + reason);
    } else {
      setNote('could not report: ' + (answer.reason ?? 'no reason given'));
    }
  };

  return (
    <div
      data-report-composer={projectId}
      style={{
        position: 'fixed',
        top: 54,
        right: 16,
        zIndex: 45,
        width: 380,
        background: 'var(--nexus-panel, #12151b)',
        border: '1px solid var(--nexus-border, #262b34)',
        borderRadius: 6,
        padding: 10,
        fontSize: 11,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>REPORT</div>
      <div style={{ color: 'var(--nexus-muted)', marginBottom: 6 }}>on {projectId}</div>
      <div data-report-reasons style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        {REPORT_REASONS.map((r) => (
          <button
            key={r}
            className={`btn ${reason === r ? 'tool-active' : ''}`}
            data-report-reason={r}
            onClick={() => setReason(r)}
            title={`report it as ${r}`}
          >
            {r}
          </button>
        ))}
      </div>
      <textarea
        data-report-detail
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="what is wrong with it? (optional)"
        style={{
          width: '100%',
          minHeight: 60,
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
        <button className="btn btn-primary" data-report-post onClick={() => void post()} disabled={busy}>
          {busy ? 'reporting…' : 'Report'}
        </button>
        {onClose && (
          <button className="btn" data-report-close onClick={onClose}>
            Close
          </button>
        )}
      </div>
      {note && (
        <div data-report-note style={{ marginTop: 6, color: 'var(--nexus-muted)' }}>
          {note}
        </div>
      )}
    </div>
  );
}
