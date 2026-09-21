'use client';
import { useStudio } from '@/lib/store';
import type { AlignMode, DistributeAxis } from '@/lib/align';

const ALIGN_X: { mode: AlignMode; icon: string; label: string }[] = [
  { mode: 'left', icon: '⇤', label: 'Align left' },
  { mode: 'hcenter', icon: '⇹', label: 'Align horizontal centers' },
  { mode: 'right', icon: '⇥', label: 'Align right' },
];
const ALIGN_Y: { mode: AlignMode; icon: string; label: string }[] = [
  { mode: 'top', icon: '⤒', label: 'Align top' },
  { mode: 'vcenter', icon: '↕', label: 'Align vertical centers' },
  { mode: 'bottom', icon: '⤓', label: 'Align bottom' },
];
const DISTRIBUTE: { axis: DistributeAxis; icon: string; label: string }[] = [
  { axis: 'x', icon: '⇼', label: 'Distribute horizontally' },
  { axis: 'y', icon: '⇳', label: 'Distribute vertically' },
];

const divider: React.CSSProperties = { width: 1, height: 18, background: 'var(--nexus-border)', margin: '0 4px' };

/**
 * Alignment + distribution actions. Each maps to a single reversible store batch (ADR 0006), so
 * every click lands in the History panel and the AI-diff for free. Align uses one layer against
 * the page or many against the selection bounds; distribute needs three or more.
 */
export default function AlignBar() {
  const count = useStudio((s) => s.selection.length);
  const align = useStudio((s) => s.align);
  const distribute = useStudio((s) => s.distribute);

  const canAlign = count >= 1;
  const canDistribute = count >= 3;

  const btn = (enabled: boolean): React.CSSProperties => ({
    minWidth: 30,
    fontSize: 15,
    lineHeight: 1,
    opacity: enabled ? 1 : 0.35,
    cursor: enabled ? 'pointer' : 'not-allowed',
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '4px 8px', borderBottom: '1px solid var(--nexus-border)', background: 'var(--nexus-surface, #0e131d)' }}>
      {ALIGN_X.map((b) => (
        <button key={b.mode} className="btn" style={btn(canAlign)} title={b.label} disabled={!canAlign} onClick={() => align(b.mode)}>
          {b.icon}
        </button>
      ))}
      <span style={divider} />
      {ALIGN_Y.map((b) => (
        <button key={b.mode} className="btn" style={btn(canAlign)} title={b.label} disabled={!canAlign} onClick={() => align(b.mode)}>
          {b.icon}
        </button>
      ))}
      <span style={divider} />
      {DISTRIBUTE.map((b) => (
        <button key={b.axis} className="btn" style={btn(canDistribute)} title={b.label} disabled={!canDistribute} onClick={() => distribute(b.axis)}>
          {b.icon}
        </button>
      ))}
      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--nexus-muted)' }}>
        {count === 0 ? 'Select layers to align' : count < 3 ? `${count} selected — align only` : `${count} selected — align + distribute`}
      </span>
    </div>
  );
}
