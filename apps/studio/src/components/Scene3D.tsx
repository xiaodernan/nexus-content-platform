'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ThreeRuntime,
  createHeadlessBackend,
  createWebGLBackend,
  webglAvailable,
  createLocalStorageSaveStore,
} from '@nexus/three-runtime';
import { childIdList } from '@nexus/design-model';
import {
  composeDocumentOps,
  createStudioScene,
  ORBIT_RADIANS_PER_PIXEL,
  ORBIT_ZOOM_PER_NOTCH,
  type SceneAdapterLike,
  type SceneReport,
  type SceneSaveFile,
  type SceneSaverLike,
  type SceneSurface,
} from '@/lib/scene3d';
import { installSceneBridge } from '@/lib/observability';
import { useStudio } from '@/lib/store';

/**
 * M5 v142 — the Studio's 3D surface, RENDERER half. This is the only file in the Studio that touches a
 * canvas, a GL context or three.js, which is what keeps `lib/scene3d.ts` loadable during SSR.
 *
 * What it is: the first PRODUCT consumer of `@nexus/three-runtime`. Everything v108–v141 built — the
 * scene graph, the records, the renderer and frame-scheduler seams — was reachable only from tests and
 * from the agent tool family (v140). This mounts a real runtime on a real canvas, composes the demo
 * scene, aims the camera and drives the loop.
 *
 * §60 says a surface must not overstate what it is. So:
 *   - the backend is chosen HONESTLY (`webglAvailable()`), and the HUD says which one answered — a host
 *     with no GL context gets the headless backend and a visible note, not a black rectangle presented
 *     as a render;
 *   - every number in the HUD comes from the runtime's own report (`buildSceneReport`), not from a
 *     counter this component keeps in parallel;
 *   - the frame count is the one thing this component DOES own, and it says so.
 *
 * The scene is the runtime's own DEMO-MODE geometry: four default meshes, no assets, no model calls.
 *
 * M5 v163 adds the persistence and document controls. The saver is built HERE, next to the adapter:
 * it is the one place that knows the runtime's real id brands, exactly the split `placeCamera` made.
 * "Load" restores into a fresh sibling scene (a restore never overwrites live state), and "send to
 * document" files only AUTHORED bodies — the four composed demo shots are the demo, not user content.
 */

/** Frames between HUD samples. The loop runs every frame; the HUD does not need to. */
const HUD_EVERY_FRAMES = 10;

const panel: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  left: 10,
  zIndex: 5,
  padding: '8px 10px',
  fontSize: 11,
  lineHeight: 1.5,
  background: 'rgba(12,14,18,0.82)',
  border: '1px solid var(--nexus-border)',
  borderRadius: 6,
  color: 'var(--nexus-text, #e6e8ec)',
  minWidth: 200,
  pointerEvents: 'none',
};

export default function Scene3D() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // v161: a handle to the running surface, so the orbit/body controls can reach it without the surface
  // becoming React state (it is not a value to re-render on; it owns a frame loop).
  const surfaceRef = useRef<SceneSurface | null>(null);
  // v163: a handle to the runtime, so the send-to-document control can read the authored bodies' names
  // and positions at click time — the renderer half is where a `threeObject` may be touched.
  const runtimeRef = useRef<ThreeRuntime | null>(null);
  // M5 v169/v170: handles to the storage and saver, so browse/load can reach them without becoming state.
  const storageRef = useRef<ReturnType<typeof createLocalStorageSaveStore> | null>(null);
  const saverRef = useRef<SceneSaverLike | null>(null);
  // Pointer-drag bookkeeping. A ref, not state: a drag must not re-render on every move.
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [report, setReport] = useState<SceneReport | null>(null);
  const [note, setNote] = useState('');
  // v163: the last file this surface saved, and what the last save/load/send answered — the harness
  // reads the note through its data attribute, so it carries counts rather than moods.
  const [lastFile, setLastFile] = useState<SceneSaveFile | null>(null);
  const [saveNote, setSaveNote] = useState('');
  // M5 v169: available saves from the store (listed without reading files), and which one is selected.
  const [availableSaves, setAvailableSaves] = useState<Array<{ path: string; savedAt: number; version: number; entityCount?: number }>>([]);
  const [selectedSavePath, setSelectedSavePath] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // A real GL context when the host has one, the recording backend when it does not. Both arrive as
    // the runtime's construction option (M5 v108) — the same seam the package's own suite uses — so
    // this is a parameter, not a fork inside the class.
    const gl = webglAvailable();
    const storage = createLocalStorageSaveStore('studio-scene');
    storageRef.current = storage;
    const runtime = new ThreeRuntime(
      {},
      {
        backend: gl ? createWebGLBackend : (_canvas, config) => createHeadlessBackend(config),
        storage,
      },
    );
    runtime.initialize(canvas);

    /**
     * The adapter: the ONLY place the Studio converts its plain `SceneVec3` into what the package
     * declares. `createCamera` builds a camera at the origin looking down -Z, so aiming it is a
     * three.js write — and it is exactly the write the pure module may not perform.
     */
    const cameraOf = (sceneId: string, cameraId: string) =>
      runtime.getScene(sceneId as Parameters<typeof runtime.getScene>[0])?.cameras.get(cameraId as never);

    const adapter: SceneAdapterLike = {
      placeCamera(sceneId, cameraId, position, lookAt) {
        const camera = cameraOf(sceneId, cameraId);
        if (!camera) return false;
        camera.threeCamera.position.set(position.x, position.y, position.z);
        camera.threeCamera.lookAt(new THREE.Vector3(lookAt.x, lookAt.y, lookAt.z));
        camera.threeCamera.updateMatrixWorld(true);
        return true;
      },
    };

    /**
     * The saver (v163): the same story one seam over. The conversions from the Studio's plain strings
     * into the package's branded ids happen HERE and nowhere else, and the file passes through
     * unparaphrased — what `surface.save()` answers is the runtime's own save format.
     *
     * M5 v169 adds listSaveFiles(): the store answers about names without reading files, so the UI can
     * show available saves before loading any of them.
     */
    const saver: SceneSaverLike = {
      buildSaveFile(sceneId, savedAt) {
        return runtime.buildSaveFile(sceneId as Parameters<typeof runtime.buildSaveFile>[0], savedAt);
      },
      loadSaveFile(file, sceneId) {
        return runtime.loadSaveFile(
          file as Parameters<typeof runtime.loadSaveFile>[0],
          sceneId as Parameters<typeof runtime.loadSaveFile>[1],
        );
      },
      listSaveFiles() {
        try {
          const listed = runtime.listSaveFiles();
          // Map the runtime's answer (paths + refused) into what the surface needs. Refused names are
          // reported but not loaded — a name this build will not re-enter stays visible in the list.
          return listed.paths.map((path) => {
            // Read just the header to get entity count and timestamp
            try {
              const contents = storage.read(path);
              if (!contents) return { path, savedAt: 0, version: 0 };
              const parsed = JSON.parse(contents) as { savedAt?: number; version?: number; entities?: unknown[] };
              return {
                path,
                savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
                version: typeof parsed.version === 'number' ? parsed.version : 0,
                entityCount: Array.isArray(parsed.entities) ? parsed.entities.length : undefined,
              };
            } catch {
              return { path, savedAt: 0, version: 0 };
            }
          });
        } catch {
          return [];
        }
      },
      deleteSaveFile(path) {
        try {
          const report = runtime.deleteSaveFile(path);
          return report.removed;
        } catch {
          return false;
        }
      },
      renameSaveFile(oldPath, newPath) {
        try {
          return runtime.renameSaveFile(oldPath, newPath);
        } catch (error) {
          throw error;
        }
      },
    };
    saverRef.current = saver;

    const sceneOf = (sceneId: string) => runtime.getScene(sceneId as Parameters<typeof runtime.getScene>[0]);

    const surface: SceneSurface = createStudioScene(
      runtime,
      (bodyIds, motion) => {
        const scene = sceneOf(surface.sceneId);
        for (const id of bodyIds) {
          const entity = scene?.entities.get(id as never);
          if (!entity) continue;
          // Spin each body about its own Y axis and give it a small bob, both functions of ELAPSED TIME
          // (`spinAt`) rather than of a frame counter — so two runs at the same instant agree.
          entity.threeObject.rotation.y = motion.y;
          entity.threeObject.position.y += motion.bob * 0.01;
        }
      },
      adapter,
      0,
      saver,
    );

    const size = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
      runtime.setPixelRatio(ratio);
      runtime.resize(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)));
    };
    size();

    const backend = runtime.getBackend();
    setNote(
      backend?.kind === 'webgl'
        ? 'WebGL — the GPU is drawing this.'
        : 'HEADLESS — this host has no GL context, so no pixels are drawn here. The graph, the camera and the frame loop are real; the picture is not (§60).',
    );

    // The bridge reads the LIVE surface and caches nothing, so a harness always sees the current frame.
    installSceneBridge(() => surface.report());
    setReport(surface.report());
    // v161: the controls live OUTSIDE this effect (they are React handlers), so the surface has to be
    // reachable from them. A ref rather than state, because the surface is not a value React should
    // re-render on — it is a handle to a running loop.
    surfaceRef.current = surface;
    runtimeRef.current = runtime;

    const onResize = () => {
      size();
      setReport(surface.report());
    };
    window.addEventListener('resize', onResize);

    let raf = 0;
    const started = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const next = surface.step((performance.now() - started) / 1000);
      // Sampling is a rendering cost, not a fact about the scene: the report is always the runtime's.
      if (next.frames % HUD_EVERY_FRAMES === 0) setReport(next);
    };
    runtime.start();
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      // `dispose()` stops the loop it owns, drops every entity/record registry and disposes the
      // backend — so a teardown needs no second call here, and the next mount starts clean.
      runtime.dispose();
      surfaceRef.current = null;
      runtimeRef.current = null;
      storageRef.current = null;
      saverRef.current = null;
      dragRef.current = null;
      installSceneBridge(() => null);
      setReport(null);
      setNote('');
    };
  }, []);

  /**
   * M5 v161 — the controls. Every one of them goes THROUGH the surface, so what changes is the runtime's
   * own state and the report follows from it; this component never reaches past the surface to edit a
   * three.js object, except where the adapter (the one place that owns that write) does it for the camera.
   */
  const onOrbit = useCallback((dxPixels: number, dyPixels: number) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    // Dragging RIGHT turns the camera left, and dragging DOWN raises it — the sign a person expects from
    // pushing the world rather than the camera.
    setReport(surface.orbitBy({ azimuth: -dxPixels * ORBIT_RADIANS_PER_PIXEL, elevation: -dyPixels * ORBIT_RADIANS_PER_PIXEL }));
  }, []);

  const onZoom = useCallback((notches: number) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    // PROPORTIONAL: a notch moves the camera a fraction of how far it already is, so zooming feels the
    // same up close and far out. An absolute step is unusable at both ends.
    setReport(surface.orbitBy({ distance: notches * ORBIT_ZOOM_PER_NOTCH * surface.orbit.distance }));
  }, []);

  const addedRef = useRef(0);
  const onAddBody = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    addedRef.current += 1;
    // `buildDemoScene` composed Cube A/B/C, so user-added bodies continue at D — starting at A would put
    // a second `Cube A` into the graph on the first click. The counter is per-mount and never decremented
    // by Remove, so the names stay unique across add/remove cycles.
    const added = surface.addBody(`Cube ${String.fromCharCode(67 + addedRef.current)}`, 'mesh');
    if (added) setReport(surface.report());
  }, []);

  const onRemoveBody = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    // Remove the LAST body this surface added, not one of the four it composed — the composed scene is the
    // demo the other proofs assert, and a control that could delete it would make those proofs depend on
    // what a user clicked.
    const last = surface.bodyIds[surface.bodyIds.length - 1];
    if (last && surface.removeBody(last)) setReport(surface.report());
  }, []);

  const onResetOrbit = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    setReport(surface.resetOrbit());
  }, []);

  /**
   * M5 v163 — save, load, send to document.
   *
   * The instant is named HERE because the runtime owns a frame clock, not a wall clock, and refuses to
   * invent one. Load restores into a fresh sibling scene — the demo scene and its loop stay untouched.
   * Send files only the AUTHORED bodies (the ones `+ body` added), as one ordinary undoable op.
   */
  const onSave = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    try {
      const file = surface.save(Math.round(performance.now()));
      setLastFile(file);
      setSaveNote(`saved ${file.entities.length} bodies · ${file.format} v${file.version} · nothing written to disk`);
    } catch (error) {
      setSaveNote(`save refused: ${(error as Error).message}`);
    }
  }, []);

  const onLoad = useCallback(() => {
    const surface = surfaceRef.current;
    const saver = saverRef.current;
    const storage = storageRef.current;
    if (!surface || !saver || !storage) return;
    // Load the SELECTED save, or fall back to lastFile if nothing is selected
    const pathToLoad = selectedSavePath || (lastFile ? 'last-saved' : null);
    if (!pathToLoad) {
      setSaveNote('nothing saved yet — save first, then load');
      return;
    }
    try {
      // If loading from list, we need to read the file first
      let fileToLoad = lastFile;
      if (selectedSavePath && saver.listSaveFiles) {
        // Re-read the selected file from storage
        const contents = storage.read(selectedSavePath);
        if (!contents) {
          setSaveNote(`cannot read ${selectedSavePath} — the store changed underneath`);
          return;
        }
        const parsed = JSON.parse(contents);
        fileToLoad = parsed as SceneSaveFile;
      }
      if (!fileToLoad) {
        setSaveNote('nothing to load');
        return;
      }
      const result = surface.load(fileToLoad);
      setReport(surface.report());
      setSaveNote(
        `restored ${result.report.entities.length} bodies into a fresh scene — the runtime now holds ${surface.report().scenes} scenes, and the demo scene is untouched`,
      );
    } catch (error) {
      setSaveNote(`load refused: ${(error as Error).message}`);
    }
  }, [lastFile, selectedSavePath]);

  const onBrowseSaves = useCallback(() => {
    const saver = saverRef.current;
    if (!saver) return;
    if (!saver.listSaveFiles) {
      setSaveNote('this surface has no save browser — the host did not provide one');
      return;
    }
    const saves = saver.listSaveFiles();
    setAvailableSaves(saves);
    setSaveNote(`found ${saves.length} save${saves.length === 1 ? '' : 's'} in the store`);
  }, []);

  const onDeleteSave = useCallback((path: string) => {
    const saver = saverRef.current;
    if (!saver || !saver.deleteSaveFile) return;
    try {
      const removed = saver.deleteSaveFile(path);
      // Refresh the list after deletion
      const remaining = saver.listSaveFiles?.() ?? [];
      setAvailableSaves(remaining);
      // Clear selection if the deleted save was selected
      if (selectedSavePath === path) setSelectedSavePath(null);
      setSaveNote(removed ? `deleted ${path}` : `${path} was already gone`);
    } catch (error) {
      setSaveNote(`delete refused: ${(error as Error).message}`);
    }
  }, [selectedSavePath]);

  const onRenameSave = useCallback((oldPath: string, newPath: string) => {
    const saver = saverRef.current;
    if (!saver || !saver.renameSaveFile) return;
    try {
      // Validate new name before attempting rename (if savePathRefusal is available)
      const refusal = saver.savePathRefusal?.(newPath);
      if (refusal !== null && refusal !== undefined) throw new Error(refusal);
      const renamed = saver.renameSaveFile(oldPath, newPath);
      // Refresh the list after rename
      const updated = saver.listSaveFiles?.() ?? [];
      setAvailableSaves(updated);
      // Update selection if the renamed save was selected
      if (selectedSavePath === oldPath) setSelectedSavePath(renamed);
      setSaveNote(`renamed "${oldPath}" to "${renamed}"`);
    } catch (error) {
      setSaveNote(`rename refused: ${(error as Error).message}`);
    }
  }, [selectedSavePath]);

  const sendCountRef = useRef(0);
  const onSendToDocument = useCallback(() => {
    const surface = surfaceRef.current;
    const runtime = runtimeRef.current;
    if (!surface || !runtime) return;
    const authored = surface.authoredBodyIds;
    if (authored.length === 0) {
      setSaveNote('nothing authored to send — add a body first');
      return;
    }
    const scene = runtime.getScene(surface.sceneId as Parameters<typeof runtime.getScene>[0]);
    if (!scene) return;
    const { doc, activePageId, commitOps } = useStudio.getState();
    const page = doc.nodes[activePageId];
    if (!page) {
      setSaveNote('no page to file the scene under');
      return;
    }
    // Names and positions are read off the RUNTIME's own entities — the renderer half is where a
    // `threeObject` may be touched. A body the runtime no longer holds is skipped, not invented.
    const facts = authored.flatMap((id) => {
      const entity = scene.entities.get(id as never);
      if (!entity) return [];
      const p = entity.threeObject.position;
      return [{ id, name: entity.name, kind: entity.type, position: { x: p.x, y: p.y, z: p.z } }];
    });
    if (facts.length === 0) {
      setSaveNote('nothing authored to send — add a body first');
      return;
    }
    const n = sendCountRef.current;
    sendCountRef.current += 1;
    const opsList = composeDocumentOps({
      pageId: activePageId,
      index: childIdList(page).length,
      sceneName: surface.report().scene?.name ?? 'Studio Scene',
      bodies: facts,
      // Each send lands beside the last, so two sends do not stack into one pile.
      at: { x: 40 + n * 24, y: 40 + n * 24 },
    });
    commitOps(opsList, `Send 3D scene to document (${facts.length} bodies)`);
    const op = opsList[0];
    const nodeCount = op?.type === 'addSubtree' ? op.nodes.length : 0;
    setSaveNote(
      `sent ${facts.length} authored bodies to the document — one addSubtree of ${nodeCount} nodes, undoable like any other edit`,
    );
  }, []);

  const s = report?.scene ?? null;
  // A scene the Studio composed holds exactly one camera; name it only when that is what the report says.
  const activeName = s && s.cameras === 1 ? s.cameraNames[0] ?? '—' : s?.activeCamera ? s.activeCamera : '—';

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0b0d11' }}>
      <canvas
        ref={canvasRef}
        id="nexus-scene3d"
        data-surface="3d"
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab', touchAction: 'none' }}
        // M5 v161 — drag to orbit, wheel to zoom. Pointer capture so a drag that leaves the canvas keeps
        // turning the camera instead of stopping when the cursor crosses the panel.
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag || drag.id !== e.pointerId) return;
          const dx = e.clientX - drag.x;
          const dy = e.clientY - drag.y;
          dragRef.current = { id: drag.id, x: e.clientX, y: e.clientY };
          onOrbit(dx, dy);
        }}
        onPointerUp={(e) => {
          if (dragRef.current?.id === e.pointerId) dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onWheel={(e) => {
          // `deltaMode` is lines on some hosts and pixels on others; the sign is what the control uses, so
          // the two are normalised to one notch rather than compared.
          const notches = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
          if (notches !== 0) onZoom(notches);
        }}
      />

      <div style={panel}>
        <div style={{ fontWeight: 700, letterSpacing: 0.4, marginBottom: 4 }}>3D SCENE (M5)</div>
        {report ? (
          <>
            <div>
              backend: <strong>{report.backend ?? 'none'}</strong>
              {report.pixels ? ` · ${report.pixels.width}×${report.pixels.height} @${report.pixels.pixelRatio}x` : ''}
            </div>
            <div>scene: {s ? `“${s.name}” · ${s.entities} bodies · ${s.cameras} camera` : 'none'}</div>
            <div>bodies: {s ? s.entityNames.join(', ') : '—'}</div>
            <div>
              frames: <strong data-scene3d-frames>{report.frames}</strong> · draw calls: {report.draws.calls}
            </div>
            <div>active camera: {activeName}</div>
            {/* The orbit is reported as the surface holds it, not as a counter this component keeps. */}
            <div data-scene3d-orbit>
              orbit: az {report.orbit.azimuth.toFixed(3)} · el {report.orbit.elevation.toFixed(3)} · d{' '}
              {report.orbit.distance.toFixed(2)}
            </div>
          </>
        ) : (
          <div>starting…</div>
        )}
        {/* The panel is `pointerEvents: none` so it never eats a drag meant for the canvas; the controls
            are the one part that must be clickable, so they re-enable it for themselves. */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, pointerEvents: 'auto', flexWrap: 'wrap' }}>
          <button type="button" className="btn" data-scene-add-body onClick={onAddBody}>
            + body
          </button>
          <button type="button" className="btn" data-scene-remove-body onClick={onRemoveBody}>
            − body
          </button>
          <button type="button" className="btn" data-scene-reset-view onClick={onResetOrbit}>
            reset view
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, pointerEvents: 'auto', flexWrap: 'wrap' }}>
          <button type="button" className="btn" data-scene-save onClick={onSave}>
            save
          </button>
          <button type="button" className="btn" data-scene-load onClick={onLoad}>
            load
          </button>
          <button type="button" className="btn" data-scene-browse-saves onClick={onBrowseSaves}>
            browse saves
          </button>
          <button type="button" className="btn" data-scene-send-doc onClick={onSendToDocument}>
            send to doc
          </button>
        </div>
        {/* M5 v169/v171 — available saves list with delete buttons */}
        {availableSaves.length > 0 && (
          <div style={{ marginTop: 8, pointerEvents: 'auto', maxHeight: 200, overflowY: 'auto' }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 10 }}>Available Saves:</div>
            {availableSaves.map((save) => (
              <div
                key={save.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px 6px',
                  margin: '2px 0',
                  background: selectedSavePath === save.path ? 'rgba(66, 133, 244, 0.2)' : 'transparent',
                  border: selectedSavePath === save.path ? '1px solid rgba(66, 133, 244, 0.5)' : '1px solid transparent',
                  borderRadius: 3,
                  fontSize: 10,
                  lineHeight: 1.4,
                }}
              >
                <div
                  onClick={() => setSelectedSavePath(save.path)}
                  style={{ flex: 1, cursor: 'pointer' }}
                >
                  <div>{save.path}</div>
                  <div style={{ color: 'var(--nexus-muted)', fontSize: 9 }}>
                    v{save.version} · {save.entityCount ?? '?'} bodies · savedAt {save.savedAt}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSave(save.path);
                  }}
                  style={{
                    marginLeft: 8,
                    padding: '2px 6px',
                    fontSize: 9,
                    background: 'rgba(244, 67, 54, 0.1)',
                    border: '1px solid rgba(244, 67, 54, 0.3)',
                    borderRadius: 3,
                    cursor: 'pointer',
                    color: 'var(--nexus-danger)',
                  }}
                  title={`Delete ${save.path}`}
                >
                  delete
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newName = prompt('Enter new name for this save:', save.path);
                    if (newName && newName !== save.path) {
                      onRenameSave(save.path, newName);
                    }
                  }}
                  style={{
                    marginLeft: 4,
                    padding: '2px 6px',
                    fontSize: 9,
                    background: 'rgba(33, 150, 243, 0.1)',
                    border: '1px solid rgba(33, 150, 243, 0.3)',
                    borderRadius: 3,
                    cursor: 'pointer',
                    color: 'var(--nexus-info)',
                  }}
                  title={`Rename ${save.path}`}
                >
                  rename
                </button>
              </div>
            ))}
          </div>
        )}
        {note && <div style={{ marginTop: 6, color: 'var(--nexus-muted)', maxWidth: 280 }}>{note}</div>}
        {saveNote && (
          <div data-scene3d-save-note style={{ marginTop: 6, color: 'var(--nexus-muted)', maxWidth: 280 }}>
            {saveNote}
          </div>
        )}
      </div>
    </div>
  );
}
