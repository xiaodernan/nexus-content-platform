'use client';
import { useState } from 'react';
import { flattenTokens, type TokenValue } from '@nexus/design-model';
import { useStudio } from '@/lib/store';

function isColor(v: TokenValue): boolean {
  return v.$type === 'color' || (typeof v.$value === 'string' && /^#/.test(v.$value));
}

export default function DesignSystemPanel() {
  const doc = useStudio((s) => s.doc);
  const [open, setOpen] = useState(true);
  const flat = flattenTokens(doc.tokens);
  const groups = new Map<string, [string, TokenValue][]>();
  for (const [path, val] of Object.entries(flat)) {
    const g = path.split('.')[0] ?? 'other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push([path, val]);
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', borderTop: '1px solid var(--nexus-border)', color: 'var(--nexus-muted)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
      >
        <span>Design System</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ maxHeight: 200, overflow: 'auto', padding: '4px 10px 10px' }}>
          {[...groups.entries()].map(([g, entries]) => (
            <div key={g} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--nexus-brand)', textTransform: 'capitalize', margin: '4px 0' }}>{g}</div>
              {entries.map(([path, val]) => (
                <div key={path} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '2px 0' }}>
                  {isColor(val) ? (
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: String(val.$value), border: '1px solid var(--nexus-border)', flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 14, textAlign: 'center', color: 'var(--nexus-muted)', flexShrink: 0 }}>·</span>
                  )}
                  <span style={{ flex: 1, color: 'var(--nexus-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</span>
                  <span style={{ color: 'var(--nexus-muted)' }}>{String(val.$value)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
