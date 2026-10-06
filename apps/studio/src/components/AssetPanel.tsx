'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InMemoryAssetLibrary, DemoImageGenerator, StoryboardManager } from '@nexus/ai-providers';
import { buildStudioAssets, buildAssetReport, generateAsset, removeAsset, type AssetReport } from '@/lib/assets';
import { installAssetBridge } from '@/lib/observability';

/**
 * M3 v153 — the Studio's asset surface. This is the only file in the Studio that touches the real
 * generators and library, which is what keeps `lib/assets.ts` loadable during SSR.
 *
 * What it is: the first PRODUCT consumer of the multimodal slice. v145 gave the lane an agent consumer
 * (`assetTools.ts` over an `AssetDriver` seam) and its record still ended with *"nothing in the Studio
 * imports it, so M3's PRODUCT face is still open."* This is that half. v159 makes it INTERACTIVE: the
 * surface can grow and shrink its own library, not merely read the three shots it composed on mount.
 *
 * **§60 says a surface must not overstate what it is, and this is the surface where that matters most.**
 * There is no image model in this build, so:
 *   - the panel says `DEMO MODE` on its own face and states that no pixels exist;
 *   - the byte count it shows is the number the LIBRARY holds — **zero** — rather than a plausible size;
 *   - nothing here renders an `<img>` from the assets, because there is no image to render. A surface that
 *     showed a broken image frame would be implying one exists.
 *
 * The composition runs ONCE per mount and its result is held in state, so a re-render does not generate a
 * second set of assets. The bridge reads the live report, so a harness always sees current state.
 */
export default function AssetPanel() {
  // One generator/library/storyboard set per mount. Built in `useMemo` so React 19's development
  // double-invoke does not hand the effect two different libraries.
  const stack = useMemo(
    () => ({ generator: new DemoImageGenerator(), library: new InMemoryAssetLibrary(), storyboards: new StoryboardManager() }),
    [],
  );

  const [report, setReport] = useState<AssetReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  // The report is read by the bridge at call time, so the bridge needs the LATEST report without being
  // re-installed on every state change; a ref carries it. `meta` carries the composition's identity so a
  // refresh (after a generate/remove) re-reads the SAME storyboard rather than inventing a new one.
  const latest = useRef<AssetReport | null>(null);
  const meta = useRef<{ provenanceMode: string; storyboardId: string | null }>({ provenanceMode: '', storyboardId: null });

  const refresh = useCallback(async () => {
    const next = await buildAssetReport(stack.library, stack.storyboards, meta.current.provenanceMode, meta.current.storyboardId);
    latest.current = next;
    setReport(next);
  }, [stack]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const built = await buildStudioAssets(stack.generator, stack.library, stack.storyboards);
        if (cancelled) return;
        meta.current = { provenanceMode: built.provenanceMode, storyboardId: built.storyboardId };
        const next = await buildAssetReport(stack.library, stack.storyboards, built.provenanceMode, built.storyboardId);
        if (cancelled) return;
        latest.current = next;
        setReport(next);
      } catch (e) {
        if (cancelled) return;
        // A failure is SHOWN rather than swallowed: a surface that silently rendered nothing would look
        // like a surface with nothing to show.
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    installAssetBridge(() => latest.current);

    return () => {
      cancelled = true;
      // Unregistering matters: `assets()` must answer `null` once this panel is gone, so a harness cannot
      // read a library that is no longer on screen.
      installAssetBridge(() => null);
      latest.current = null;
      setReport(null);
      setError(null);
    };
  }, [stack]);

  const onGenerate = useCallback(async () => {
    const text = prompt.trim();
    if (!text) return;
    setError(null);
    try {
      const out = await generateAsset(stack.generator, stack.library, text);
      if (out.provenanceMode) meta.current.provenanceMode = out.provenanceMode;
      setPrompt('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [prompt, refresh, stack]);

  const onRemove = useCallback(
    async (assetId: string) => {
      setError(null);
      try {
        await removeAsset(stack.library, assetId);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [refresh, stack],
  );

  const frames = report?.storyboard?.frames ?? [];

  return (
    <div
      id="nexus-assets"
      data-surface="assets"
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
        <strong style={{ letterSpacing: 0.4 }}>ASSETS (M3)</strong>
        <span style={{ color: 'var(--nexus-muted)' }} data-asset-mode>
          DEMO MODE · no image model is attached, so these assets hold metadata and NO pixels
        </span>
      </div>

      {error && (
        <div data-asset-error style={{ color: '#d9534f', marginBottom: 10 }}>
          generation failed: {error}
        </div>
      )}

      {report ? (
        <>
          <form
            data-asset-generator
            style={{ display: 'flex', gap: 8, margin: '6px 0 10px', alignItems: 'center' }}
            onSubmit={(e) => {
              e.preventDefault();
              void onGenerate();
            }}
          >
            <input
              data-asset-prompt
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="a beat to generate (DEMO MODE — metadata only, no pixels)"
              style={{ flex: 1, maxWidth: 380, padding: '4px 8px', fontSize: 12 }}
            />
            <button type="submit" data-asset-generate className="btn">
              Generate
            </button>
          </form>

          <div style={{ display: 'flex', gap: 16, margin: '10px 0 14px', flexWrap: 'wrap' }} data-asset-stats>
            <Stat label="assets" value={report.assets.length} />
            <Stat label="frames" value={frames.length} />
            <Stat label="stored bytes" value={report.storedBytes} />
            <Stat label="provenance" value={report.provenanceMode} />
          </div>

          <Section title="Library (the library’s own order — newest first)">
            <ul style={list} data-asset-list>
              {report.assets.map((a) => (
                <li key={a.id} style={{ ...item, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>{a.name}</strong>{' '}
                  <span style={dim}>
                    {a.mimeType} · {a.width}×{a.height} · <span data-asset-bytes>{a.bytes}</span> B stored · {a.source}
                  </span>
                  <button
                    type="button"
                    data-asset-remove={a.id}
                    className="btn"
                    style={{ marginLeft: 'auto', fontSize: 10, padding: '1px 6px' }}
                    onClick={() => void onRemove(a.id)}
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={report.storyboard ? `Storyboard — ${report.storyboard.name} (ordered)` : 'Storyboard'}>
            <ul style={list} data-asset-frames>
              {frames.map((f) => (
                <li key={f.id} style={item}>
                  <span style={dim}>#{f.order}</span> <strong>{f.prompt}</strong>{' '}
                  <span style={dim}>
                    · {f.cameraAngle ?? '—'} · {f.duration ?? 0}s · ref {f.imageRef ?? 'none'}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <div style={{ color: 'var(--nexus-muted)', marginTop: 14, maxWidth: 620 }}>
            This surface composes and reads a storyboard; it does not render one. Each asset is stored with an
            empty payload because DEMO MODE produces no pixels — the byte count above is what the library
            actually holds, not what an image of that size would weigh (§60). The library lists assets newest
            first and promises no other order; the STORYBOARD is where the order is the shots&rsquo;. The
            Generate field grows the library with metadata-only assets, and Remove shrinks it — both through
            the same read-only report the bridge exposes.
          </div>
        </>
      ) : (
        !error && <div style={{ color: 'var(--nexus-muted)' }}>composing…</div>
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

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div data-asset-stat={label}>
      <div style={{ fontSize: 18, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--nexus-muted)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
    </div>
  );
}