import { useCallback, useEffect, useState } from 'react';

import { postComment, readMyComments, removeComment } from '@/lib/commentLane';
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

  /**
   * v335 — the comments THIS account wrote on this publication.
   *
   * <p>A commenter who comes back to a thread could not see what they had said there — and a comment is a
   * thing a person might want to find again, or take back. The composer's note says what was posted; this
   * is the whole of it, with the way to unsay it.
   */
  const [mine, setMine] = useState<{ id: string; body: string; createdAt: number; deleted: boolean; projectId: string }[]>([]);
  const [mineNote, setMineNote] = useState('');

  const readMine = useCallback(async () => {
    const account = session.current();
    if (!account) {
      setMine([]);
      setMineNote('this device has no account, and a comment needs one');
      return;
    }
    const answer = await readMyComments(account.id);
    if (!answer.ok) {
      setMine([]);
      setMineNote('could not read your comments: ' + (answer.reason ?? 'no reason given'));
      return;
    }
    setMine(answer.comments.filter((c) => c.projectId === projectId));
    // The note is NOT cleared here: the take-back sets it, and a re-read that wiped it would leave the
    // reader with a list that changed and no word about why.
  }, [projectId]);

  useEffect(() => {
    void readMine();
    // The composer's project is fixed for as long as it is open, and the reader is rebuilt for it.
  }, [readMine]);

  const takeBack = async (commentId: string) => {
    const account = session.current();
    if (!account) {
      setMineNote('this device has no account, and a comment needs one');
      return;
    }
    const answer = await removeComment(commentId, account.id);
    // The list is read FIRST, and the word comes after: a re-read that cleared the note would leave the
    // reader with a list that changed and nothing about why.
    await readMine();
    setMineNote(
      answer.ok
        ? answer.removed
          ? 'took the comment back — the thread will say it was removed by its author'
          : 'that comment was already gone'
        : 'could not take the comment back: ' + (answer.reason ?? 'no reason given'),
    );
  };

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
      // v335 — and the list of what you wrote here grows with it.
      await readMine();
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
      {/* v335 — what THIS account wrote here, and the way to unsay it. */}
      {mine.length > 0 && (
        <div data-comment-mine style={{ marginTop: 8, borderTop: '1px solid var(--nexus-border, #262b34)', paddingTop: 6 }}>
          <div style={{ fontWeight: 700, letterSpacing: 0.4, marginBottom: 4 }}>YOUR COMMENTS HERE</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {mine.map((c) => (
              <li key={c.id} data-comment-mine-row={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '3px 0' }}>
                <div style={{ color: c.deleted ? 'var(--nexus-muted)' : 'var(--nexus-text, #e6e8ec)' }}>
                  {c.deleted ? 'this comment was removed by its author' : c.body}
                </div>
                {!c.deleted && (
                  <button className="btn" data-comment-take-back={c.id} onClick={() => void takeBack(c.id)} style={{ fontSize: 10, padding: '2px 8px', alignSelf: 'flex-start' }}>
                    Take it back
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {mineNote && (
        <div data-comment-mine-note style={{ marginTop: 6, color: 'var(--nexus-muted)' }}>
          {mineNote}
        </div>
      )}
    </div>
  );
}
