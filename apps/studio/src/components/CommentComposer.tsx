import { useState } from 'react';

import { postComment } from '@/lib/commentLane';
import { session } from '@/lib/accountSession';
import { likeClaimOf } from '@/lib/likeIntent';

/**
 * M7 v286 — the COMMENT composer.
 *
 * A comment is written HERE, in the Studio, and not on the artifact page: the page is server-rendered
 * and does not know who the device is (ADR 0018), while the Studio does. The page carries a link
 * (`/?comment=<id>`) and the Studio opens this over it — the same arrangement the like and the remix use.
 *
 * The rule the component keeps: it never INVENTS an author. A device with no account has no claim, and
 * the composer says so by name rather than posting a comment nobody made.
 */
export function CommentComposer({ projectId, onClose }: { projectId: string; onClose?: () => void }) {
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const post = async () => {
    const account = session.current();
    const claim = likeClaimOf(account?.id ?? null, account?.handle ?? null, account?.assurance ?? null);
    if (!claim) {
      setNote('this device has no account, and a comment needs one');
      return;
    }
    if (!text.trim()) {
      setNote('a comment must say something: a blank body is not a comment');
      return;
    }
    setBusy(true);
    const answer = await postComment(projectId, text, claim);
    setBusy(false);
    if (answer.ok) {
      setText('');
      setNote('commented on ' + projectId);
    } else {
      setNote('could not comment: ' + (answer.reason ?? 'no reason given'));
    }
  };

  return (
    <div
      data-comment-composer={projectId}
      style={{
        position: 'fixed',
        top: 54,
        right: 16,
        zIndex: 44,
        width: 380,
        background: 'var(--nexus-panel, #12151b)',
        border: '1px solid var(--nexus-border, #262b34)',
        borderRadius: 6,
        padding: 10,
        fontSize: 11,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>COMMENT</div>
      <div style={{ color: 'var(--nexus-muted)', marginBottom: 6 }}>on {projectId}</div>
      <textarea
        data-comment-body
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="say something about this publication…"
        style={{
          width: '100%',
          minHeight: 70,
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
        <button className="btn btn-primary" data-comment-post onClick={() => void post()} disabled={busy}>
          {busy ? 'posting…' : 'Post'}
        </button>
        {onClose && (
          <button className="btn" data-comment-close onClick={onClose}>
            Close
          </button>
        )}
      </div>
      {note && (
        <div data-comment-note style={{ marginTop: 6, color: 'var(--nexus-muted)' }}>
          {note}
        </div>
      )}
    </div>
  );
}
