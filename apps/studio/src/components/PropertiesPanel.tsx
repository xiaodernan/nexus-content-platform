'use client';
import { hexToRgba, rgbaToCss, resolveToken, type DesignNode, type InstanceNode, type Paint } from '@nexus/design-model';
import { useStudio } from '@/lib/store';
import { DiffCard } from '@/components/DiffCard';
import InstanceOverrides from '@/components/InstanceOverrides';

function NumberField({ label, value, onCommit, min = -100000, max = 100000, step = 1 }: { label: string; value: number; onCommit: (n: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--nexus-muted)' }}>
      {label}
      <input
        className="field"
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!Number.isNaN(n)) onCommit(n);
        }}
      />
    </label>
  );
}

function fillSummary(node: DesignNode): string {
  const f = node.fills[0];
  if (!f) return 'none';
  if (f.kind === 'solid') return rgbaToCss(f.color).toUpperCase();
  if (f.kind === 'token') return `token ${f.ref}`;
  if (f.kind === 'linear') return 'gradient';
  return f.kind;
}

function NodeEditor({ node }: { node: DesignNode }) {
  const doc = useStudio((s) => s.doc);
  const updateNode = useStudio((s) => s.updateNode);

  const firstFill = node.fills[0];
  const currentHex = (() => {
    if (!firstFill) return '#888888';
    if (firstFill.kind === 'solid') return rgbaToCss(firstFill.color);
    if (firstFill.kind === 'token') {
      const tv = resolveToken(doc.tokens, firstFill.ref);
      return typeof tv?.$value === 'string' ? tv.$value : '#888888';
    }
    return '#888888';
  })();

  const setFillHex = (hex: string) => {
    const paint: Paint = { kind: 'solid', color: hexToRgba(hex) };
    updateNode(node.id, { fills: [paint, ...node.fills.slice(1)] });
  };

  const isText = node.type === 'text';
  const style = isText ? (node as unknown as { style: Record<string, unknown> }).style : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 12 }}>
      <div>
        <div style={{ fontSize: 11, color: 'var(--nexus-muted)', marginBottom: 4 }}>Name</div>
        <input className="field" value={node.name} onChange={(e) => updateNode(node.id, { name: e.target.value })} />
        <div style={{ fontSize: 11, color: 'var(--nexus-muted)', marginTop: 4 }}>
          type: <b>{node.type}</b>
        </div>
      </div>

      <div>
        <div style={sectionTitle}>Geometry</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <NumberField label="X" value={node.x} onCommit={(n) => updateNode(node.id, { x: Math.round(n) })} />
          <NumberField label="Y" value={node.y} onCommit={(n) => updateNode(node.id, { y: Math.round(n) })} />
          <NumberField label="W" value={node.width} min={1} onCommit={(n) => updateNode(node.id, { width: Math.round(Math.max(1, n)) })} />
          <NumberField label="H" value={node.height} min={1} onCommit={(n) => updateNode(node.id, { height: Math.round(Math.max(1, n)) })} />
          <NumberField label="Rotation" value={node.rotation} onCommit={(n) => updateNode(node.id, { rotation: n })} />
          <NumberField label="Opacity" value={node.opacity} min={0} max={1} step={0.05} onCommit={(n) => updateNode(node.id, { opacity: Math.min(1, Math.max(0, n)) })} />
        </div>
      </div>

      {'cornerRadius' in node && (
        <div>
          <div style={sectionTitle}>Appearance</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'end' }}>
            <NumberField label="Corner radius" value={node.cornerRadius} min={0} onCommit={(n) => updateNode(node.id, { cornerRadius: Math.max(0, Math.round(n)) })} />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--nexus-muted)' }}>
              Fill
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="color" value={/^#([0-9a-f]{6})$/i.test(currentHex) ? currentHex : '#888888'} onChange={(e) => setFillHex(e.target.value)} style={{ width: 34, height: 30, padding: 0, border: '1px solid var(--nexus-border)', borderRadius: 6, background: 'transparent' }} />
                <span style={{ fontSize: 11, color: 'var(--nexus-muted)' }}>{fillSummary(node)}</span>
              </div>
            </label>
          </div>
        </div>
      )}

      {isText && style && (
        <div>
          <div style={sectionTitle}>Text</div>
          <textarea
            className="field"
            rows={3}
            value={(node as unknown as { characters: string }).characters}
            onChange={(e) => updateNode(node.id, { characters: e.target.value })}
            style={{ marginBottom: 8 }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <NumberField label="Size" value={Number(style.sizePx ?? 16)} min={1} onCommit={(n) => updateNode(node.id, { style: { ...style, sizePx: Math.max(1, n) } })} />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--nexus-muted)' }}>
              Align
              <select className="field" value={String(style.align ?? 'left')} onChange={(e) => updateNode(node.id, { style: { ...style, align: e.target.value } })}>
                <option value="left">left</option>
                <option value="center">center</option>
                <option value="right">right</option>
              </select>
            </label>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => updateNode(node.id, { visible: !node.visible })}>
          {node.visible ? 'Hide' : 'Show'}
        </button>
        <button className="btn" style={{ flex: 1 }} onClick={() => updateNode(node.id, { locked: !node.locked })}>
          {node.locked ? 'Unlock' : 'Lock'}
        </button>
      </div>
    </div>
  );
}

const sectionTitle: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--nexus-muted)', marginBottom: 6 };

export default function PropertiesPanel() {
  const doc = useStudio((s) => s.doc);
  const selection = useStudio((s) => s.selection);
  const lastDiff = useStudio((s) => s.lastDiff);
  const setStatus = useStudio((s) => s.setStatus);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ padding: '8px 12px', fontSize: 11, letterSpacing: 1, color: 'var(--nexus-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--nexus-border)' }}>
        Properties
      </div>
      {selection.length === 0 && (
        <div style={{ padding: 16, fontSize: 13, color: 'var(--nexus-muted)', lineHeight: 1.5 }}>
          Nothing selected.
          <br />
          <br />
          Click a layer or shape to edit it.
          <br />
          Use a tool in the top bar to add shapes, or type a prompt below to generate a design in DEMO MODE.
        </div>
      )}
      {selection.length === 1 && doc.nodes[selection[0]!] && (
        <>
          <NodeEditor node={doc.nodes[selection[0]!]!} />
          {doc.nodes[selection[0]!]!.type === 'instance' && (
            <InstanceOverrides instance={doc.nodes[selection[0]!]! as InstanceNode} />
          )}
        </>
      )}
      {selection.length > 1 && (
        <div style={{ padding: 16, fontSize: 13, color: 'var(--nexus-muted)' }}>
          {selection.length} layers selected.
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn" onClick={() => useStudio.getState().duplicateSelection()}>Duplicate</button>
            <button className="btn" onClick={() => useStudio.getState().deleteSelection()}>Delete</button>
          </div>
        </div>
      )}
      <div style={{ margin: 12 }}>
        <DiffCard diff={lastDiff} onClose={() => setStatus(useStudio.getState().status)} />
      </div>
    </div>
  );
}
