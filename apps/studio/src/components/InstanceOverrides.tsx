'use client';
import { useMemo } from 'react';
import { hexToRgba, type DesignNode, type InstanceNode, type Paint } from '@nexus/design-model';
import { instanceView, useStudio } from '@/lib/store';

interface Row {
  masterId: string;
  name: string;
  type: DesignNode['type'];
  characters?: string;
  width: number;
  rotation: number;
  radius: number;
  fills: Paint[];
  /** `#rrggbb` for the swatch. A token, a gradient or no fill shows the neutral swatch, and writing it
   *  becomes a single solid paint over `fills[0]` with the tail kept — the Properties panel's own rule,
   *  repeated here rather than invented, so an instance and a detached copy edit a fill the same way. */
  fill: string;
}

function hexOf(c: { r: number; g: number; b: number }): string {
  const to = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${to(c.r)}${to(c.g)}${to(c.b)}`;
}

/**
 * Per-instance override editing (ADR 0015). Overrides are keyed by the *master* child id and
 * only apply to this instance's own component subtree, so we walk the materialized clones and
 * stop at nested instances (their internals belong to a nested instance's own overrides).
 *
 * v132 adds the two style controls: a corner radius, and the clone's first paint as a swatch that
 * writes ONE solid paint over `fills[0]` and keeps the tail. Both go through the same
 * `setInstanceOverride` seam as width/rotation, so they land as one reversible op on this instance
 * and never touch the master.
 */
export default function InstanceOverrides({ instance }: { instance: InstanceNode }) {
  const doc = useStudio((s) => s.doc);
  const setInstanceOverride = useStudio((s) => s.setInstanceOverride);

  const rows = useMemo<Row[]>(() => {
    const { doc: view, meta } = instanceView(doc);
    const out: Row[] = [];
    const walk = (id: string) => {
      for (const cid of view.nodes[id]?.childIds ?? []) {
        const node = view.nodes[cid];
        if (!node) continue;
        if (node.type === 'instance') continue; // nested-instance internals: not ours to override here
        const masterId = meta[cid]?.masterId;
        if (masterId) {
          const first = node.fills[0];
          out.push({
            masterId,
            name: node.name,
            type: node.type,
            characters: node.type === 'text' ? node.characters : undefined,
            width: node.width,
            // the projection bake composes the instance's own angle on top; show/edit the local one
            rotation: node.rotation - instance.rotation,
            radius: node.cornerRadius ?? 0,
            fills: node.fills,
            fill: first?.kind === 'solid' ? hexOf(first.color) : '#888888',
          });
        }
        walk(cid);
      }
    };
    walk(instance.id);
    return out;
  }, [doc, instance.id, instance.rotation]);

  if (!rows.length) return null;

  return (
    <div style={{ borderTop: '1px solid var(--nexus-border)', padding: 12 }}>
      <div style={sectionTitle}>Instance overrides</div>
      <div style={{ fontSize: 11, color: 'var(--nexus-muted)', marginBottom: 8 }}>
        Edits here are stored on this instance only, not the master.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((r) => (
          <div key={r.masterId} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--nexus-muted)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{r.name}</span>
              <span style={{ opacity: 0.7 }}>{r.type}</span>
            </div>
            {r.characters !== undefined && (
              <input
                className="field"
                value={r.characters}
                onChange={(e) => setInstanceOverride(instance.id, r.masterId, { characters: e.target.value })}
              />
            )}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--nexus-muted)' }}>Width</span>
              <input
                className="field"
                type="number"
                style={{ width: 78 }}
                value={Math.round(r.width)}
                min={1}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (!Number.isNaN(n)) setInstanceOverride(instance.id, r.masterId, { width: n });
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--nexus-muted)' }}>Rotation</span>
              <input
                className="field"
                type="number"
                style={{ width: 64 }}
                value={Math.round(r.rotation)}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (!Number.isNaN(n)) setInstanceOverride(instance.id, r.masterId, { rotation: n });
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--nexus-muted)' }}>Fill</span>
              <input
                type="color"
                aria-label={`Fill of ${r.name}`}
                style={{ width: 34, height: 22, padding: 0, background: 'none', border: '1px solid var(--nexus-border)' }}
                value={r.fill}
                onChange={(e) => setInstanceOverride(instance.id, r.masterId, {
                  fills: [{ kind: 'solid', color: hexToRgba(e.target.value) }, ...r.fills.slice(1)],
                })}
              />
              <span style={{ fontSize: 11, color: 'var(--nexus-muted)' }}>Radius</span>
              <input
                className="field"
                type="number"
                style={{ width: 64 }}
                value={Math.round(r.radius)}
                min={0}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (!Number.isNaN(n)) setInstanceOverride(instance.id, r.masterId, { cornerRadius: n });
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const sectionTitle: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--nexus-muted)', marginBottom: 6 };
