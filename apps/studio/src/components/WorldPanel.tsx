'use client';
import { useEffect, useMemo, useState } from 'react';
import { WorldEngine } from '@nexus/world-engine';
import { buildStudioWorld, buildWorldReport, type WorldReport } from '@/lib/world';
import { installWorldBridge } from '@/lib/observability';

/**
 * M4 v148 — the Studio's world surface. This is the only file in the Studio that touches a real
 * `WorldEngine`, which is what keeps `lib/world.ts` loadable during SSR.
 *
 * What it is: the first PRODUCT consumer of `@nexus/world-engine`. v144 gave the lane an agent consumer
 * (`worldTools.ts` over a `WorldDriver` seam) and its record still ended with *"no Studio surface … the
 * product half is still open."* This is that half.
 *
 * §60 says a surface must not overstate what it is, so:
 *   - the engine runs with **no model behind it**: the world is composed from the package's own declared
 *     vocabulary and every character stands in a location that really exists. Nothing here calls a model,
 *     and nothing here claims one;
 *   - every number shown comes from the engine's own report (`buildWorldReport`), not from a counter this
 *     component keeps in parallel;
 *   - the panel says the engine is `DEMO MODE`, because the character decisions it can produce are the
 *     package's deterministic arithmetic (v144's proof measures exactly that: an empty world scores every
 *     action at zero).
 *
 * Unlike the 3D surface there is no frame loop and no canvas: a world is DATA, so this panel renders once
 * per mount and the bridge reads the live report at call time.
 */
export default function WorldPanel() {
  // One engine per mount. Built in `useMemo` rather than in the effect so React 19's development
  // double-invoke does not compose the world twice into two engines — the effect below still owns the
  // bridge and its teardown.
  const engine = useMemo(() => {
    const created = new WorldEngine({ ragEnabled: true, autoSaveInterval: 0 });
    buildStudioWorld(created);
    return created;
  }, []);

  const [report, setReport] = useState<WorldReport | null>(null);

  useEffect(() => {
    // The bridge reads the LIVE engine and caches nothing, so a harness always sees the current world.
    installWorldBridge(() => buildWorldReport(engine));
    setReport(buildWorldReport(engine));

    return () => {
      // Unregistering matters: `world()` must answer `null` once this panel is gone, so a harness cannot
      // read a world that is no longer on screen.
      installWorldBridge(() => null);
      setReport(null);
    };
  }, [engine]);

  return (
    <div
      id="nexus-world"
      data-surface="world"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'auto',
        padding: 16,
        background: 'var(--nexus-bg)',
        color: 'var(--nexus-text)',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <strong style={{ letterSpacing: 0.4 }}>WORLD (M4)</strong>
        <span style={{ color: 'var(--nexus-muted)' }} data-world-mode>
          DEMO MODE · no model is attached
        </span>
      </div>

      {report ? (
        <>
          <div style={{ color: 'var(--nexus-muted)', marginBottom: 12 }} data-world-identity>
            {report.name} · {report.genre} · {report.description}
          </div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }} data-world-stats>
            <Stat label="locations" value={report.stats.locations} />
            <Stat label="characters" value={report.stats.characters} />
            <Stat label="lore" value={report.stats.lore} />
            <Stat label="agents" value={report.stats.agents} />
            <Stat label="events" value={report.stats.events} />
            <Stat label="ticks" value={report.stats.ticks} />
          </div>

          <Section title="Locations">
            <ul style={list} data-world-locations>
              {report.locations.map((l) => (
                <li key={l.id} style={item}>
                  <strong>{l.name}</strong> <span style={dim}>{l.type}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Characters">
            <ul style={list} data-world-characters>
              {report.characters.map((c) => (
                <li key={c.id} style={item}>
                  <strong>{c.name}</strong> <span style={dim}>{c.archetype}</span>{' '}
                  <span style={dim}>@ {c.locationName ?? 'nowhere'}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Lore">
            <ul style={list} data-world-lore>
              {report.lore.map((l) => (
                <li key={l.id} style={item}>
                  <strong>{l.title}</strong> <span style={dim}>{l.category}</span>
                </li>
              ))}
            </ul>
          </Section>

          <div style={{ color: 'var(--nexus-muted)', marginTop: 14, maxWidth: 560 }}>
            This surface composes and reads a world; it does not simulate one. Nothing ticks the engine, no
            character acts, and the RAG is queryable from the agent lane rather than from here (§60).
          </div>
        </>
      ) : (
        <div style={{ color: 'var(--nexus-muted)' }}>starting…</div>
      )}
    </div>
  );
}

const list: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0 };
const item: React.CSSProperties = { padding: '2px 0' };
const dim: React.CSSProperties = { color: 'var(--nexus-muted)' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--nexus-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div data-world-stat={label}>
      <div style={{ fontSize: 18, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--nexus-muted)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
    </div>
  );
}
