'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InMemoryAssetLibrary, DemoImageGenerator, DemoVideoGenerator, StoryboardManager, CharacterConsistencyManager } from '@nexus/ai-providers';
import { buildStudioAssets, buildAssetReport, generateAsset, removeAsset, updateAssetMetadata, removeStoryboardFrame, reorderStoryboardFrames, registerCharacter, applyCharacterConsistency, type AssetMetadataPatch, type AssetReport, type DerivedConsistencySummary, type GenerationRequestLike } from '@/lib/assets';
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
  //
  // v187 — the generator dispatches on the ASK's type: images to the image generator, footage to the
  // video one. `DemoImageGenerator` ignores the type and would answer a video ask with a still, so a
  // single-generator stack would quietly mislabel footage — the dispatch lives here, where the real
  // classes are touched, and neither generator is asked for what it does not produce.
  const stack = useMemo(
    () => {
      const images = new DemoImageGenerator();
      const videos = new DemoVideoGenerator();
      return {
        library: new InMemoryAssetLibrary(),
        storyboards: new StoryboardManager(),
        // v189 — the consistency register. Its product doors are pure passthroughs; this is the only
        // place the real manager exists.
        characters: new CharacterConsistencyManager(),
        generator: {
          generate: async (request: GenerationRequestLike) =>
            request.type === 'video'
              ? videos.generate(request as Parameters<typeof videos.generate>[0])
              : images.generate(request as Parameters<typeof images.generate>[0]),
        },
      };
    },
    [],
  );

  const [report, setReport] = useState<AssetReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  // v187 — which KIND the form asks for. A still by default; the buttons say which is armed.
  const [genType, setGenType] = useState<'image' | 'video'>('image');
  // The report is read by the bridge at call time, so the bridge needs the LATEST report without being
  // re-installed on every state change; a ref carries it. `meta` carries the composition's identity so a
  // refresh (after a generate/remove) re-reads the SAME storyboard rather than inventing a new one.
  const latest = useRef<AssetReport | null>(null);
  const meta = useRef<{ provenanceMode: string; storyboardId: string | null }>({ provenanceMode: '', storyboardId: null });

  // v189 — the consistency register's form state, and the derived request the last apply produced
  // (null until one does — applying answers a REQUEST, it does not create anything).
  const [charId, setCharId] = useState('');
  const [charRef, setCharRef] = useState('');
  const [charStrength, setCharStrength] = useState('');
  const [derived, setDerived] = useState<{ characterId: string; summary: DerivedConsistencySummary } | null>(null);

  // v190 — the library's update form. Three optional fields; whatever is filled goes into the patch,
  // and a patch that names nothing is refused (the library would report a no-op as an update).
  const [updId, setUpdId] = useState('');
  const [updName, setUpdName] = useState('');
  const [updDesc, setUpdDesc] = useState('');
  const [updTags, setUpdTags] = useState('');

  const refresh = useCallback(async () => {
    const next = await buildAssetReport(stack.library, stack.storyboards, stack.characters, meta.current.provenanceMode, meta.current.storyboardId);
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
        const next = await buildAssetReport(stack.library, stack.storyboards, stack.characters, built.provenanceMode, built.storyboardId);
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
      const out = await generateAsset(stack.generator, stack.library, text, genType);
      if (out.provenanceMode) meta.current.provenanceMode = out.provenanceMode;
      setPrompt('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [prompt, genType, refresh, stack]);

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

  // v190 — UPDATE the library's metadata. The `asset.update` door (v160) has refused an empty patch
  // since it shipped — the library answers `true` for a patch that changes nothing, and a success that
  // updated nothing is the defect this refusal exists to prevent — so the panel refuses it too, in the
  // door's own words. Filled fields go into the patch verbatim; an asset's bytes and id are not editable
  // and the form offers no way to try. The library's own `false` (an id it does not hold) is shown.
  const onUpdateMetadata = useCallback(async () => {
    if (!updId) return;
    const name = updName.trim();
    const description = updDesc.trim();
    const patch: AssetMetadataPatch = {};
    if (name) patch.name = name;
    if (description) patch.description = description;
    if (updTags.trim()) patch.tags = updTags.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    if (Object.keys(patch).length === 0) {
      setError('a patch that names nothing would be reported as an update by the library, so this surface refuses it; name at least one of name, description or tags');
      return;
    }
    setError(null);
    try {
      const updated = await updateAssetMetadata(stack.library, updId, patch);
      if (!updated) {
        setError(`the library holds no asset "${updId}"`);
        return;
      }
      setUpdName('');
      setUpdDesc('');
      setUpdTags('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [updId, updName, updDesc, updTags, refresh, stack]);

  // `frames` leads the callbacks that read it — a `const` below its reader would be a TDZ hit at render.
  // useMemo keeps the identity stable so the reorder callback's deps do not churn every render.
  const frames = useMemo(() => report?.storyboard?.frames ?? [], [report]);

  // v188 — edit the BOARD. Remove passes the manager's boolean through (false for an unknown frame is
  // shown, not swallowed); reorder swaps the two neighbours the button names and hands the manager the
  // FULL id sequence, because resequencing is the manager's word, not the panel's. Neither verb touches
  // the library — the frames reference assets, they are not assets.
  const onRemoveFrame = useCallback(
    async (storyboardId: string, frameId: string) => {
      setError(null);
      try {
        removeStoryboardFrame(stack.storyboards, storyboardId, frameId);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [refresh, stack],
  );

  const onMoveFrame = useCallback(
    async (storyboardId: string, frameId: string, dir: -1 | 1) => {
      setError(null);
      try {
        const ids = frames.map((f) => f.id);
        const at = ids.indexOf(frameId);
        const to = at + dir;
        if (at < 0 || to < 0 || to >= ids.length) return;
        [ids[at], ids[to]] = [ids[to]!, ids[at]!];
        reorderStoryboardFrames(stack.storyboards, storyboardId, ids);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [frames, refresh, stack],
  );

  // v189 — CHARACTERS. Register anchors a character to a reference image the library actually holds (the
  // same `asset://` form the composition files frames under); the manager stores whatever it is given, so
  // the form refuses what the manager would silently hold — an empty id, no anchor, a strength outside
  // (0, 1]. Apply answers the DERIVED REQUEST the manager would hand a generator: no generator runs, and
  // the line says so. Neither verb touches the library.
  const onRegisterCharacter = useCallback(async () => {
    const id = charId.trim();
    if (!id || !charRef) return;
    const raw = charStrength.trim();
    let strength: number | undefined;
    if (raw) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0 || n > 1) {
        setError('a strength is a fraction in (0, 1]');
        return;
      }
      strength = n;
    }
    setError(null);
    try {
      registerCharacter(stack.characters, {
        characterId: id,
        referenceImages: [charRef],
        ...(strength !== undefined ? { consistencyStrength: strength } : {}),
      });
      setCharId('');
      setCharRef('');
      setCharStrength('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [charId, charRef, charStrength, refresh, stack]);

  const onApplyCharacter = useCallback(
    async (characterId: string) => {
      const text = prompt.trim();
      if (!text) {
        setError('type a prompt first — applying derives the request a generator would receive');
        return;
      }
      setError(null);
      try {
        const summary = await applyCharacterConsistency(stack.characters, text, characterId);
        setDerived({ characterId, summary });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [prompt, stack],
  );

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
          DEMO MODE · no image or video model is attached, so these assets hold metadata and NO pixels
        </span>
      </div>

      {error && (
        <div data-asset-error style={{ color: '#d9534f', marginBottom: 10 }}>
          error: {error}
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
            <div style={{ display: 'flex', gap: 4 }}>
              {(['image', 'video'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  data-asset-type={t}
                  onClick={() => setGenType(t)}
                  className="btn"
                  style={{
                    fontSize: 10,
                    padding: '2px 8px',
                    border: genType === t ? '1px solid var(--nexus-text, #e6e8ec)' : '1px solid var(--nexus-border)',
                    opacity: genType === t ? 1 : 0.6,
                  }}
                  title={t === 'video' ? 'Ask the DEMO video generator (metadata only, no footage)' : 'Ask the DEMO image generator (metadata only, no pixels)'}
                >
                  {t}
                </button>
              ))}
            </div>
            <input
              data-asset-prompt
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={genType === 'video' ? 'a beat to film (DEMO MODE — metadata only, no footage)' : 'a beat to generate (DEMO MODE — metadata only, no pixels)'}
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
            <form
              data-asset-update-form
              style={{ display: 'flex', gap: 8, margin: '2px 0 8px', alignItems: 'center', flexWrap: 'wrap' }}
              onSubmit={(e) => {
                e.preventDefault();
                void onUpdateMetadata();
              }}
            >
              <select
                data-asset-update-id
                value={updId}
                onChange={(e) => setUpdId(e.target.value)}
                style={{ padding: '4px 8px', fontSize: 12, maxWidth: 300 }}
                title="Pick an asset the library actually holds"
              >
                <option value="">pick an asset…</option>
                {report.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <input
                data-asset-update-name
                value={updName}
                onChange={(e) => setUpdName(e.target.value)}
                placeholder="new name (optional)"
                style={{ width: 170, padding: '4px 8px', fontSize: 12 }}
              />
              <input
                data-asset-update-description
                value={updDesc}
                onChange={(e) => setUpdDesc(e.target.value)}
                placeholder="new description (optional)"
                style={{ width: 200, padding: '4px 8px', fontSize: 12 }}
              />
              <input
                data-asset-update-tags
                value={updTags}
                onChange={(e) => setUpdTags(e.target.value)}
                placeholder="tags, comma-separated (optional)"
                style={{ width: 200, padding: '4px 8px', fontSize: 12 }}
              />
              <button type="submit" data-asset-update className="btn" disabled={!updId} title="Merge the filled fields into the asset's metadata — bytes and id are not editable">
                update
              </button>
            </form>
            <ul style={list} data-asset-list>
              {report.assets.map((a) => (
                <li key={a.id} style={{ ...item, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>{a.name}</strong>{' '}
                  <span style={dim}>
                    {a.mimeType} · {a.width}×{a.height}
                    {a.duration !== null ? ` · ${a.duration}s` : ''} · <span data-asset-bytes>{a.bytes}</span> B stored · {a.source}
                    {a.tags.length > 0 ? ` · tags ${a.tags.join(', ')}` : ''}
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

          <Section title={report.storyboard ? `Storyboard — ${report.storyboard.name} (ordered, editable)` : 'Storyboard'}>
            <ul style={list} data-asset-frames>
              {frames.map((f, i) => (
                <li key={f.id} style={{ ...item, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={dim}>#{f.order}</span> <strong>{f.prompt}</strong>{' '}
                  <span style={dim}>
                    · {f.cameraAngle ?? '—'} · {f.duration ?? 0}s · ref {f.imageRef ?? 'none'}
                  </span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      data-frame-up={f.id}
                      className="btn"
                      disabled={i === 0}
                      title={`Move frame #${f.order} up`}
                      style={{ fontSize: 10, padding: '1px 6px' }}
                      onClick={() => report.storyboard && void onMoveFrame(report.storyboard.id, f.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      data-frame-down={f.id}
                      className="btn"
                      disabled={i === frames.length - 1}
                      title={`Move frame #${f.order} down`}
                      style={{ fontSize: 10, padding: '1px 6px' }}
                      onClick={() => report.storyboard && void onMoveFrame(report.storyboard.id, f.id, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      data-frame-remove={f.id}
                      className="btn"
                      title={`Remove frame #${f.order} — the board's own state, not the library's`}
                      style={{ fontSize: 10, padding: '1px 6px' }}
                      onClick={() => report.storyboard && void onRemoveFrame(report.storyboard.id, f.id)}
                    >
                      remove
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Characters (anchored, derivable)">
            <form
              data-character-form
              style={{ display: 'flex', gap: 8, margin: '2px 0 8px', alignItems: 'center', flexWrap: 'wrap' }}
              onSubmit={(e) => {
                e.preventDefault();
                void onRegisterCharacter();
              }}
            >
              <input
                data-character-id
                value={charId}
                onChange={(e) => setCharId(e.target.value)}
                placeholder="character id"
                style={{ width: 110, padding: '4px 8px', fontSize: 12 }}
              />
              <select
                data-character-ref
                value={charRef}
                onChange={(e) => setCharRef(e.target.value)}
                style={{ padding: '4px 8px', fontSize: 12, maxWidth: 300 }}
                title="Anchor the character to an asset the library actually holds"
              >
                <option value="">anchor to an asset…</option>
                {report.assets.map((a) => (
                  <option key={a.id} value={`asset://${a.id}`}>
                    {a.name}
                  </option>
                ))}
              </select>
              <input
                data-character-strength
                value={charStrength}
                onChange={(e) => setCharStrength(e.target.value)}
                placeholder="strength (optional)"
                style={{ width: 120, padding: '4px 8px', fontSize: 12 }}
                title="A fraction in (0, 1]; left empty the register holds none and the manager applies its own 0.8 default at apply time"
              />
              <button type="submit" data-character-register className="btn" disabled={!charId.trim() || !charRef} title="Anchor this character to the chosen asset">
                register
              </button>
            </form>
            <ul style={list} data-character-list>
              {report.characters.length === 0 && (
                <li style={{ ...item, ...dim }}>no characters registered — a character is an anchor set, not an asset</li>
              )}
              {report.characters.map((c) => (
                <li key={c.characterId} data-character-row={c.characterId} style={{ ...item, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>{c.characterId}</strong>{' '}
                  <span style={dim}>
                    · {c.referenceImages.length} reference image{c.referenceImages.length === 1 ? '' : 's'} ({c.referenceImages.join(', ')}) · strength{' '}
                    {c.consistencyStrength === null ? 'none held' : c.consistencyStrength}
                  </span>
                  <button
                    type="button"
                    data-character-apply={c.characterId}
                    className="btn"
                    style={{ marginLeft: 'auto', fontSize: 10, padding: '1px 6px' }}
                    title="Derive the request a generator would receive for the prompt above — no generator runs"
                    onClick={() => void onApplyCharacter(c.characterId)}
                  >
                    apply prompt
                  </button>
                </li>
              ))}
            </ul>
            {derived && (
              <div data-character-derived style={{ ...dim, marginTop: 4 }}>
                derived request for “{derived.summary.prompt}” — character {derived.characterId} ·{' '}
                {derived.summary.referenceAssets} reference asset{derived.summary.referenceAssets === 1 ? '' : 's'} attached · strength{' '}
                {derived.summary.consistencyStrength === null ? 'none carried' : derived.summary.consistencyStrength} · no generator ran
              </div>
            )}
          </Section>

          <div style={{ color: 'var(--nexus-muted)', marginTop: 14, maxWidth: 620 }}>
            This surface composes and reads a storyboard; it does not render one. Each asset is stored with an
            empty payload because DEMO MODE produces no pixels — the byte count above is what the library
            actually holds, not what an image of that size would weigh (§60). The library lists assets newest
            first and promises no other order; the STORYBOARD is where the order is the shots&rsquo;. The Generate field grows the library with metadata-only assets, and Remove shrinks it — both through
            the same read-only report the bridge exposes. The library&rsquo;s metadata is editable too (v190): a
            patch merges the filled fields over what the asset&rsquo;s metadata holds — its bytes and id are not
            editable, and a patch that names nothing is refused rather than reported as an update. The storyboard itself is editable too (v188): a frame
            can be removed or moved, and the manager&rsquo;s answer — including the honest order hole a removal
            leaves — is what this panel shows. Characters (v189) anchor to an asset the library holds, and
            applying answers the DERIVED REQUEST a generator would receive — no generator runs, and the
            derived line shows the manager&rsquo;s own 0.8 default landing where the register held none.
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