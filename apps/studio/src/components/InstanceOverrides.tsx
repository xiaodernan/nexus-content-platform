'use client';
import { useMemo } from 'react';
import type { DesignNode, InstanceNode } from '@nexus/design-model';
import { instanceView, useStudio } from '@/lib/store';

interface Row {
  masterId: string;
  name: string;
  type: DesignNode['type'];
  characters?: string;
  width: number;
}

/**
 * Per-instance override editing (ADR 0015). Overrides are keyed by the *master* child id and
 * only apply to this instance's own component subtree, so we walk the materialized clones and
 * stop at nested instances (their internals belong to a nested instance's own overrides).
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
          out.push({
            masterId,
            name: node.name,
            type: node.type,
            characters: node.type === 'text' ? node.characters : undefined,
            width: node.width,
          });
        }
        walk(cid);
      }
    };
    walk(instance.id);
    return out;
  }, [doc, instance.id]);

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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const sectionTitle: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--nexus-muted)', marginBottom: 6 };
