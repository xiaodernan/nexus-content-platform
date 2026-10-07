'use client';
import { useEffect, useMemo, useState } from 'react';
import { WorldEngine, type TickReport } from '@nexus/world-engine';
import { buildStudioWorld, buildWorldReport, type WorldReport } from '@/lib/world';
import { probeWorldSaves, readWorldSaveFromDisk, writeWorldSaveToDisk, WORLD_SAVE_LANE_DISK_SAVE_PATH } from '@/lib/worldSaveLane';
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
 *   - the panel says the engine is `DEMO MODE`, because the decisions the simulation produces are the
 *     package's deterministic arithmetic, not a mind.
 *
 * v162 — the surface STEPS the world. The Step buttons run the engine's own `tickOnce()` (deterministic:
 * insertion-order agents, awaited decisions, per-tick relationship decay) and re-read the report, so what
 * moves on screen is the engine moving, not a parallel story. One knob is set deliberately: the engine's
 * `ragScoreThreshold` is lowered to 0.02 — it doubles as the decision gate, and at the package default of
 * 0.1 a first meeting (confidence 0.03, a hair below a literal 0.03 gate in floats) could never pass, so Mira and Toma would
 * never speak. That is the engine's own declared knob doing its declared job, in the open.
 */
export default function WorldPanel() {
  // One engine per mount. Built in `useMemo` rather than in the effect so React 19's development
  // double-invoke does not compose the world twice into two engines — the effect below still owns the
  // bridge and its teardown.
  const engine = useMemo(() => {
    const created = new WorldEngine({ ragEnabled: true, autoSaveInterval: 0, ragScoreThreshold: 0.02 });
    buildStudioWorld(created);
    return created;
  }, []);

  const [report, setReport] = useState<WorldReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastTick, setLastTick] = useState<TickReport | null>(null);
  // v191 — the disk lane: `null` until the first probe answers (or when it answers unavailable),
  // an array of save names when the server's store is reachable.
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [diskSaves, setDiskSaves] = useState<string[] | null>(null);

  useEffect(() => {
    // The bridge reads the LIVE engine and caches nothing, so a harness always sees the current world.
    installWorldBridge(() => buildWorldReport(engine));
    setReport(buildWorldReport(engine));
    void probeWorldSaves().then((probe) => {
      setDiskSaves(probe.available ? probe.saves ?? [] : null);
    });

    return () => {
      // Unregistering matters: `world()` must answer `null` once this panel is gone, so a harness cannot
      // read a world that is no longer on screen.
      installWorldBridge(() => null);
      setReport(null);
    };
  }, [engine]);

  const step = async (n: number) => {
    if (busy) return;
    setBusy(true);
    try {
      let last: TickReport | null = null;
      for (let i = 0; i < n; i++) {
        last = await engine.tickOnce();
      }
      setLastTick(last);
      setReport(buildWorldReport(engine));
    } finally {
      setBusy(false);
    }
  };

  // v191 — the engine's own save()/load() are the only story; disk is where the file rests.
  const refreshDiskSaves = async () => {
    const probe = await probeWorldSaves();
    setDiskSaves(probe.available ? probe.saves ?? [] : null);
    return probe;
  };

  const onSaveToDisk = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const file: unknown = JSON.parse(engine.save());
      const answer = await writeWorldSaveToDisk(WORLD_SAVE_LANE_DISK_SAVE_PATH, file);
      if (!answer.ok) {
        setSaveNote(answer.reason ?? 'the write was refused');
        return;
      }
      setSaveNote(`saved ${answer.bytes} bytes to disk as "${answer.path}"`);
      await refreshDiskSaves();
    } catch (e) {
      setSaveNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onBrowseDisk = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const probe = await refreshDiskSaves();
      if (!probe.available) setSaveNote(probe.reason ?? 'the disk lane is unavailable');
    } finally {
      setBusy(false);
    }
  };

  const onLoadFromDisk = async (path: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const answer = await readWorldSaveFromDisk(path);
      if (!answer.ok) {
        setSaveNote(answer.reason ?? 'the read was refused');
        return;
      }
      // The engine's own loader, on the file the store read back. Anything it refuses is the
      // engine's own refusal, shown as the note rather than swallowed.
      engine.load(JSON.stringify(answer.file));
      setReport(buildWorldReport(engine));
      setSaveNote(`loaded "${path}" from disk — the live world is now the saved one`);
    } catch (e) {
      setSaveNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

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

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }} data-world-simulate>
            <span style={{ fontSize: 11, letterSpacing: 1, color: 'var(--nexus-muted)', textTransform: 'uppercase' }}>
              Simulate
            </span>
            <button
              data-sim-step="1"
              onClick={() => step(1)}
              disabled={busy}
              style={buttonStyle}
            >
              Step ×1
            </button>
            <button
              data-sim-step="5"
              onClick={() => step(5)}
              disabled={busy}
              style={buttonStyle}
            >
              Step ×5
            </button>
            {lastTick ? (
              <span style={{ color: 'var(--nexus-muted)' }} data-world-last-tick>
                tick {lastTick.tick} · {lastTick.decisions} decisions · {lastTick.actions} actions ·{' '}
                {lastTick.relationshipsChanged} bonds eroded
              </span>
            ) : (
              <span style={{ color: 'var(--nexus-muted)' }} data-world-last-tick>
                not stepped yet
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }} data-world-persist>
            <span style={{ fontSize: 11, letterSpacing: 1, color: 'var(--nexus-muted)', textTransform: 'uppercase' }}>
              Persist
            </span>
            <button data-world-save-disk onClick={onSaveToDisk} disabled={busy} style={buttonStyle}>
              save to disk
            </button>
            <button data-world-browse-disk onClick={onBrowseDisk} disabled={busy} style={buttonStyle}>
              browse disk
            </button>
            <span style={{ color: 'var(--nexus-muted)' }} data-world-save-note>
              {saveNote ?? "the engine's own save()/load(), persisted on THIS server's disk (.nexus/world-saves)"}
            </span>
          </div>

          {diskSaves !== null && (
            <div style={{ marginBottom: 14 }} data-world-disk>
              <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--nexus-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                World saves on disk ({diskSaves.length}) — click a row to load it into the live world
              </div>
              <ul style={list} data-world-disk-list>
                {diskSaves.length === 0 ? (
                  <li style={item} data-world-disk-none>
                    <span style={dim}>none yet — save to disk writes the engine&apos;s own file</span>
                  </li>
                ) : (
                  diskSaves.map((name) => (
                    <li
                      key={name}
                      style={{ ...item, cursor: 'pointer' }}
                      data-world-disk-save={name}
                      onClick={() => onLoadFromDisk(name)}
                    >
                      {name}
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}

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

          <Section title="Relationships">
            <ul style={list} data-world-relationships>
              {report.relationships.length === 0 ? (
                <li style={item} data-pairs-none>
                  <span style={dim}>none yet — bonds form when characters meet through simulated dialogue</span>
                </li>
              ) : (
                report.relationships.map((p, i) => (
                  <li key={`${p.from}-${p.to}-${i}`} style={item} data-pair>
                    <strong>{p.from}</strong> <span style={dim}>→</span> {p.to ?? 'someone unknown'}{' '}
                    <span style={dim}>· {p.type} · {p.strength}</span>
                  </li>
                ))
              )}
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
            This surface steps the world on demand: the Step buttons run the engine&apos;s own deterministic
            tickOnce() — every character decides, actions that pass its confidence gate execute, unmaintained
            bonds decay — and every number on screen is the engine&apos;s own report. The decisions are the
            package&apos;s deterministic arithmetic, not a model: DEMO MODE, no model attached (§60). The RAG is
            queryable from the agent lane rather than from here. It also persists (v191): save to disk
            writes the engine&apos;s own save() file to the studio server&apos;s disk, and loading a disk row hands
            that file back to the engine&apos;s own load() — the live world becomes the saved one (the demo
            composition returns only when this surface remounts).
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
const buttonStyle: React.CSSProperties = {
  padding: '3px 10px',
  background: 'transparent',
  border: '1px solid var(--nexus-muted)',
  color: 'var(--nexus-text)',
  fontSize: 11,
  cursor: 'pointer',
};

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
