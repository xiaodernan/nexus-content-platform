'use client';
import { useStudio } from '@/lib/store';
import { DiffCard } from '@/components/DiffCard';

const PROV: Record<string, { label: string; color: string }> = {
  user: { label: 'user', color: 'var(--nexus-brand)' },
  demo: { label: 'DEMO', color: 'var(--nexus-accent)' },
  live: { label: 'live', color: '#63f0a4' },
};

/**
 * Studio-level mirror of the op-log History (ADR 0006). It never re-derives truth from ops —
 * clicking a row just drives undo()/redo() until the store cursor reaches that point, so the
 * History class stays the single source of undo/redo correctness. Each row shows its cached
 * DiffSummary, giving AI-diff browsing for free.
 */
export default function HistoryPanel() {
  const log = useStudio((s) => s.historyLog);
  const cursor = useStudio((s) => s.historyCursor);
  const restoreTo = useStudio((s) => s.restoreTo);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const canUndo = useStudio((s) => s.historyCursor > 0);
  const canRedo = useStudio((s) => s.historyCursor < s.historyLog.length);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ padding: '8px 12px', fontSize: 11, letterSpacing: 1, color: 'var(--nexus-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--nexus-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>History · Snapshots</span>
        <span style={{ display: 'flex', gap: 4 }}>
          <button className="btn" style={{ fontSize: 10, padding: '2px 6px' }} onClick={undo} disabled={!canUndo}>↶</button>
          <button className="btn" style={{ fontSize: 10, padding: '2px 6px' }} onClick={redo} disabled={!canRedo}>↷</button>
        </span>
      </div>
      {log.length === 0 && (
        <div style={{ padding: 16, fontSize: 13, color: 'var(--nexus-muted)', lineHeight: 1.5 }}>
          No edits yet. Generate a design or move something and the reversible history appears here.
        </div>
      )}
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        {log.map((entry, i) => {
          const rowCursor = i + 1;
          const isCurrent = rowCursor === cursor;
          const isFuture = rowCursor > cursor;
          const prov = PROV[entry.provenance] ?? { label: entry.provenance, color: 'var(--nexus-brand)' };
          return (
            <button
              key={i}
              onClick={() => restoreTo(rowCursor)}
              title={isCurrent ? 'Current state' : `Restore to after: ${entry.summary}`}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                padding: 8,
                borderRadius: 8,
                border: isCurrent ? '1px solid var(--nexus-brand)' : '1px solid var(--nexus-border)',
                background: isCurrent ? 'rgba(110,168,254,0.10)' : 'transparent',
                opacity: isFuture ? 0.55 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--nexus-fg, #e6ecf5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {i + 1}. {entry.summary}
                </span>
                <span style={{ fontSize: 9, letterSpacing: 0.5, padding: '1px 5px', borderRadius: 999, border: `1px solid ${prov.color}`, color: prov.color, textTransform: 'uppercase' }}>
                  {prov.label}
                </span>
              </div>
              <DiffCard diff={entry.diff} title="diff" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
