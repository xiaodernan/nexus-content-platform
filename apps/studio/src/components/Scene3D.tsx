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
  LIGHT_INTENSITY_STEP,
  ORBIT_PAN_PER_KEY,
  ORBIT_PAN_PER_PIXEL,
  ORBIT_RADIANS_PER_PIXEL,
  ORBIT_ZOOM_PER_NOTCH,
  type SceneAdapterLike,
  type SceneReport,
  type SceneSaveFile,
  type SceneSaverLike,
  type SceneSurface,
} from '@/lib/scene3d';
import { installSceneBridge } from '@/lib/observability';
import { SAVE_FS_LANE_DISK_SAVE_PATH, deleteSaveOnDisk, probeSaveFs, readSaveFromDisk, renameSaveOnDisk, writeSaveToDisk } from '@/lib/saveFsLane';
import {
  footprintOf,
  formatFootprint,
  formatOriginEstimate,
  originStorageEstimate,
  quotaPct,
  type OriginStorageEstimateView,
  type StoreFootprint,
} from '@/lib/storageMeter';
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

/** v182 — a release within this many pixels of its press is a CLICK (and picks); anything more was a
 *  drag (and only moved the camera). Big enough for a resting hand, small enough to never swallow a turn. */
const PICK_MAX_CLICK_PIXELS = 4;

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
  // v184: a MAX width too — the disk controls made the natural width cover the canvas center, and a
  // HUD that swallows drags and picks aimed at the scene it describes is a HUD gone wrong. The rows
  // wrap; the canvas keeps its clicks.
  maxWidth: 320,
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
  // v182: where the CURRENT press started, so a release can tell a CLICK from a drag — a click picks
  // the body under the cursor, a drag only ever moves the camera.
  const downRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [report, setReport] = useState<SceneReport | null>(null);
  const [note, setNote] = useState('');
  // v163: the last file this surface saved, and what the last save/load/send answered — the harness
  // reads the note through its data attribute, so it carries counts rather than moods.
  const [lastFile, setLastFile] = useState<SceneSaveFile | null>(null);
  const [saveNote, setSaveNote] = useState('');
  // M5 v169: available saves from the store (listed without reading files), and which one is selected.
  const [availableSaves, setAvailableSaves] = useState<Array<{ path: string; savedAt: number; version: number; entityCount?: number }>>([]);
  const [selectedSavePath, setSelectedSavePath] = useState<string | null>(null);
  // v184: saves on the SERVER's disk, from the save-fs lane's probe (names only — a listing is a
  // fact about names, and reading every file's bytes to decorate a menu is the wrong seam).
  const [diskSaves, setDiskSaves] = useState<string[]>([]);
  // v185: the quota meter — what the store MEASURES (the meter reads the bytes it reports, the cost
  // the store's own listing refuses to pay) and what the browser estimates for the whole origin.
  const [storeMeter, setStoreMeter] = useState<StoreFootprint | null>(null);
  const [originEstimate, setOriginEstimate] = useState<OriginStorageEstimateView | null>(null);

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
      // v182 — the pick path. The runtime owns the raycast (it owns the scene graph); this adapter is
      // the one place the Studio's plain strings become the package's branded ids, exactly as above.
      pickAt(sceneId, nx, ny) {
        return runtime.pickAt(sceneId as Parameters<typeof runtime.pickAt>[0], nx, ny);
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
                // v185 — the meter's raw material: this string's own length, in chars.
                chars: contents.length,
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
    // v210 — the registry can change WITHOUT anything this component called (a console command, an
    // agent writing through the runtime). The event leg keeps the inspector honest about THAT: any
    // component event re-reads the report. This surface's own verbs already re-read on return.
    const unwatchComponents = surface.watchComponents(() => setReport(surface.report()));
    // v212 — the entity leg: an out-of-band rename or hide now moves the panel too. Two separate
    // subscriptions, not one wider watch: each family's name set is pinned by its own witnesses.
    const unwatchEntities = surface.watchEntities(() => setReport(surface.report()));
    // v216 — the body leg: a body added or taken away by anyone moves the roster AND the inspector, since
    // a name whose body left has nothing to inspect. The third leg of the same seam, with its own name set:
    // a restore counts here, because the runtime's insert emits `entityCreated` for a restore too.
    const unwatchBodies = surface.watchBodies(() => setReport(surface.report()));
    // v217 — the scene leg: a scene created or made active by anyone moves the scene rows (which scene is
    // named, how many exist), which no earlier leg hears. `disposed` is NOT in this set: this very effect's
    // teardown calls it, so watching it would re-read the report against a graph the same teardown has
    // just cleared.
    const unwatchScenes = surface.watchScenes(() => setReport(surface.report()));
    // v218 — the pixels leg: a backend built, a size set or a ratio changed by ANYONE moves the two fields
    // no earlier leg reads. This component's own `onResize` below now re-reads twice — once through its own
    // pull, once through the bus it just joined — which is a redundant render, not a wrong value.
    const unwatchPixels = surface.watchPixels(() => setReport(surface.report()));
    // v224 — the camera leg: a camera created or switched to by ANYONE moves the camera rows (how many,
    // which one the panel says is live). The runtime's refusal to switch is now a true no-op (v224), so the
    // leg has nothing to hear on a failed ask — deaf there is correct, not a gap.
    const unwatchCameras = surface.watchCameras(() => setReport(surface.report()));
    // v161: the controls live OUTSIDE this effect (they are React handlers), so the surface has to be
    // reachable from them. A ref rather than state, because the surface is not a value React should
    // re-render on — it is a handle to a running loop.
    surfaceRef.current = surface;
    runtimeRef.current = runtime;

    // v185 — the meter measures as it boots, so the save area never guesses what it holds.
    setStoreMeter(footprintOf(saver.listSaveFiles?.() ?? []));
    void originStorageEstimate(navigator).then(setOriginEstimate);

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
      unwatchComponents();
      unwatchEntities();
      unwatchBodies();
      unwatchScenes();
      unwatchPixels();
      unwatchCameras();
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

  /**
   * M5 v181 — pan. The world follows the cursor, so dragging right slides the scene right and the TARGET
   * moves left — the same "push the world" sign the orbit drag uses. Everything goes THROUGH the surface
   * (`panBy`), which owns the camera-relative → world conversion.
   */
  const onPan = useCallback((dxPixels: number, dyPixels: number) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    setReport(surface.panBy({ right: -dxPixels * ORBIT_PAN_PER_PIXEL, forward: -dyPixels * ORBIT_PAN_PER_PIXEL }));
  }, []);

  /** The keyboard half of pan: W walks INTO the screen, S back out, A/D sideways — camera-relative, like
   *  the drag. Arrows repeat the same four moves for people who never touch WASD. */
  const onKeyPan = useCallback((key: string) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    if (key === 'w' || key === 'ArrowUp') setReport(surface.panBy({ forward: ORBIT_PAN_PER_KEY }));
    else if (key === 's' || key === 'ArrowDown') setReport(surface.panBy({ forward: -ORBIT_PAN_PER_KEY }));
    else if (key === 'a' || key === 'ArrowLeft') setReport(surface.panBy({ right: -ORBIT_PAN_PER_KEY }));
    else if (key === 'd' || key === 'ArrowRight') setReport(surface.panBy({ right: ORBIT_PAN_PER_KEY }));
  }, []);

  /** v182 — a click picks the body under the cursor. The canvas is where pixels are counted from: the
   *  surface converts them to NDC and the adapter casts the ray, so the HUD names what a hand would. */
  const onPick = useCallback((clientX: number, clientY: number) => {
    const surface = surfaceRef.current;
    const canvas = canvasRef.current;
    if (!surface || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    setReport(surface.pickAt(clientX - rect.left, clientY - rect.top));
  }, []);

  /** v183 — the lighting controls. Both go THROUGH the surface (`setLight`), which folds the ask into the
   *  range the lib owns and hands the rest to the runtime's gate; the report that comes back re-reads the
   *  live scene, so the HUD numbers are the light's state, never the button's opinion. */
  const onLightToggle = useCallback((lightId: string, enabled: boolean) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    setReport(surface.setLight(lightId, { enabled }));
  }, []);

  const onLightStep = useCallback((lightId: string, direction: 1 | -1) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const light = surface.report().scene?.lighting.find((l) => l.id === lightId);
    if (!light) return;
    setReport(surface.setLight(lightId, { intensity: light.intensity + direction * LIGHT_INTENSITY_STEP }));
  }, []);

  /** v197 — the inspector's edit controls. Both go THROUGH the surface (`renameSelected` /
   *  `setSelectedVisible`), which folds the ask and hands the rest to the runtime's gate; the report
   *  that comes back re-reads the live scene, so the inspector line is the body's state, never the
   *  button's opinion. The rename ask comes from a prompt — a cancelled or blank one is a no-ask. */
  const onInspectorRename = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const answer = window.prompt('Rename the selected body');
    if (answer === null) return;
    setReport(surface.renameSelected(answer));
  }, []);

  const onInspectorToggleVisible = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const facts = surface.report().inspector;
    if (!facts) return;
    setReport(surface.setSelectedVisible(!facts.visible));
  }, []);

  const onToggleComponentEnabled = useCallback((componentType: string) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    setReport(surface.toggleComponentEnabled(componentType));
  }, []);

  // The keyboard listener is its own effect so it can depend on the stable `onKeyPan` without touching
  // the mount effect that owns the runtime's lifecycle.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Typing in the agent panel is not camera input: a text field's WASD must not pan the scene.
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
        return;
      }
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === 'w' || k === 'a' || k === 's' || k === 'd' || k.startsWith('Arrow')) {
        // Arrows would otherwise scroll the page; the letters are consumed so nothing else answers them.
        e.preventDefault();
        onKeyPan(k);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyPan]);

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
   * v185 — the quota meter's refresh. The footprint is measured from the decorated listing (the same
   * read a browse makes), and the origin estimate is the browser's own. Both are re-measured after
   * every store mutation — a meter that kept a stale reading would be a counter with a dial on it.
   */
  const refreshMeter = useCallback(() => {
    const saver = saverRef.current;
    setStoreMeter(footprintOf(saver?.listSaveFiles?.() ?? []));
    void originStorageEstimate(navigator).then(setOriginEstimate);
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
    const runtime = runtimeRef.current;
    if (!surface || !runtime) return;
    try {
      const savedAt = Math.round(performance.now());
      const file = surface.save(savedAt);
      setLastFile(file);
      // v184: the note's persistence claim is now TRUE. v163-v180 built the file and only held it in
      // React state — nothing ever called writeSaveFile, so the store (and every browse after a
      // reload) stayed empty while the note said "persisted". The store receives the bytes now, and
      // the note carries the write report's OWN byte count.
      const report = runtime.writeSaveFile(
        'last-saved',
        surface.sceneId as Parameters<typeof runtime.writeSaveFile>[1],
        savedAt,
      );
      setSaveNote(
        `saved ${file.entities.length} bodies · ${file.format} v${file.version} · ${report.bytes} bytes in this origin's localStorage ('last-saved', reload-safe), not on disk`,
      );
      // v185 — the store just changed; the meter re-measures rather than arithmetic-ing the delta.
      refreshMeter();
    } catch (error) {
      setSaveNote(`save refused: ${(error as Error).message}`);
    }
  }, [refreshMeter]);

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
      // v227 — the surface answers what the restore had to RE-ISSUE (the format carries no camera objects,
      // so a shot's camera is re-created under its own id with a name spelled from it). Said out loud here
      // rather than showing a camera row whose name the save never carried.
      const reissuedCameras = result.reissued.cameraIds.length;
      setSaveNote(
        `restored ${result.report.entities.length} bodies into a fresh scene — the runtime now holds ${surface.report().scenes} scenes, and the demo scene is untouched`
        + (result.report.sequences.length > 0 ? ` · ${result.report.sequences.length} cutscene(s) restored` : '')
        + (reissuedCameras > 0 ? ` · ${reissuedCameras} camera(s) re-issued by id (the format holds no camera objects)` : '')
        + (result.reissued.activated ? ' · the restored scene is now the active one, so a running cutscene resumes' : ''),
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
    // v185 — the browse already holds the decorated listing; the footprint sums it for free.
    setStoreMeter(footprintOf(saves));
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
      // v185 — a deletion frees origin storage; the meter re-measures both halves.
      refreshMeter();
    } catch (error) {
      setSaveNote(`delete refused: ${(error as Error).message}`);
    }
  }, [selectedSavePath, refreshMeter]);

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
      // v185 — same store, different name; the footprint is unchanged but re-measured anyway, so the
      // meter never arithmetic-s what the store can answer directly.
      refreshMeter();
    } catch (error) {
      setSaveNote(`rename refused: ${(error as Error).message}`);
    }
  }, [selectedSavePath, refreshMeter]);

  // M5 v184 — the disk lane. One save, two named destinations: the browser store gets the same
  // bytes the server's disk gets, and every answer (byte counts, refusals) is the stores' own.
  const onSaveToDisk = useCallback(() => {
    const surface = surfaceRef.current;
    const runtime = runtimeRef.current;
    if (!surface || !runtime) return;
    void (async () => {
      try {
        const savedAt = Math.round(performance.now());
        const file = surface.save(savedAt);
        setLastFile(file);
        const storeReport = runtime.writeSaveFile(
          SAVE_FS_LANE_DISK_SAVE_PATH,
          surface.sceneId as Parameters<typeof runtime.writeSaveFile>[1],
          savedAt,
        );
        const answer = await writeSaveToDisk(SAVE_FS_LANE_DISK_SAVE_PATH, file);
        // v185 — the localStorage half landed above; the meter re-measures whatever the answer was.
        refreshMeter();
        if (answer.ok) {
          setSaveNote(
            `saved ${file.entities.length} bodies → server disk (${answer.path}, ${answer.bytes} bytes) + localStorage (${storeReport.bytes} bytes, 'last-saved')`,
          );
        } else {
          setSaveNote(
            `saved to localStorage (${storeReport.bytes} bytes) but the disk save was refused: ${answer.reason}`,
          );
        }
      } catch (error) {
        setSaveNote(`save refused: ${(error as Error).message}`);
      }
    })();
  }, [refreshMeter]);

  const onBrowseDisk = useCallback(() => {
    void (async () => {
      const probe = await probeSaveFs();
      if (probe.available) {
        const saves = probe.saves ?? [];
        setDiskSaves(saves);
        setSaveNote(`found ${saves.length} save${saves.length === 1 ? '' : 's'} on the server's disk (${probe.root})`);
      } else {
        setDiskSaves([]);
        setSaveNote(`the disk save lane is unavailable: ${probe.reason}`);
      }
    })();
  }, []);

  // v186 — the disk rows get the same verbs the store rows have had since v172. The answer comes
  // from the route (the store's own boolean or sentence); the rows are then RE-PROBED, not
  // hand-edited — what the panel lists stays a fact about the disk, not a guess about it.
  const refreshDiskSaves = useCallback(() => {
    void (async () => {
      const probe = await probeSaveFs();
      setDiskSaves(probe.available ? probe.saves ?? [] : []);
    })();
  }, []);

  const onDeleteDiskSave = useCallback((path: string) => {
    void (async () => {
      const answer = await deleteSaveOnDisk(path);
      if (!answer.ok) {
        setSaveNote(`disk delete refused: ${answer.reason}`);
        return;
      }
      setSaveNote(
        answer.deleted
          ? `deleted ${path} on the server's disk`
          : `${path} was already gone from the server's disk`,
      );
      refreshDiskSaves();
    })();
  }, [refreshDiskSaves]);

  const onRenameDiskSave = useCallback((from: string, to: string) => {
    void (async () => {
      const answer = await renameSaveOnDisk(from, to);
      if (!answer.ok) {
        setSaveNote(`disk rename refused: ${answer.reason}`);
        return;
      }
      setSaveNote(`renamed "${from}" to "${answer.to}" on the server's disk`);
      refreshDiskSaves();
    })();
  }, [refreshDiskSaves]);

  const onLoadFromDisk = useCallback((path: string) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    void (async () => {
      const answer = await readSaveFromDisk(path);
      if (!answer.ok || answer.file === undefined) {
        setSaveNote(`disk load refused: ${answer.reason}`);
        return;
      }
      try {
        const result = surface.load(answer.file as SceneSaveFile);
        setReport(surface.report());
        // v227 — the same answer as the in-memory load above: what the restore had to re-issue is said out loud.
        const reissuedCameras = result.reissued.cameraIds.length;
        setSaveNote(
          `restored ${result.report.entities.length} bodies from the server's disk (${path}) into a fresh scene — the demo scene is untouched`
          + (result.report.sequences.length > 0 ? ` · ${result.report.sequences.length} cutscene(s) restored` : '')
          + (reissuedCameras > 0 ? ` · ${reissuedCameras} camera(s) re-issued by id (the format holds no camera objects)` : '')
          + (result.reissued.activated ? ' · the restored scene is now the active one, so a running cutscene resumes' : ''),
        );
      } catch (error) {
        setSaveNote(`load refused: ${(error as Error).message}`);
      }
    })();
  }, []);

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
  // v185 — the quota bar renders only when the browser gave numbers; a percent that cannot be
  // computed honestly is not computed (§60).
  const originPct = quotaPct(originEstimate);
  // A scene the Studio composed holds exactly one camera; name it only when that is what the report says.
  const activeName = s && s.cameras === 1 ? s.cameraNames[0] ?? '—' : s?.activeCamera ? s.activeCamera : '—';

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0b0d11' }}>
      <canvas
        ref={canvasRef}
        id="nexus-scene3d"
        data-surface="3d"
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab', touchAction: 'none' }}
        // M5 v161/v181/v182 — drag to orbit, SHIFT-drag to pan, wheel to zoom, WASD/arrows to pan, and a
        // click (a release that barely moved) PICKS the body under the cursor. Pointer capture so a drag
        // that leaves the canvas keeps driving the camera instead of stopping when the cursor crosses
        // the panel.
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          downRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag || drag.id !== e.pointerId) return;
          const dx = e.clientX - drag.x;
          const dy = e.clientY - drag.y;
          dragRef.current = { id: drag.id, x: e.clientX, y: e.clientY };
          // v181: shift = grab the ground and slide it; plain drag still orbits.
          if (e.shiftKey) onPan(dx, dy);
          else onOrbit(dx, dy);
        }}
        onPointerUp={(e) => {
          const down = downRef.current;
          if (down && down.id === e.pointerId && Math.hypot(e.clientX - down.x, e.clientY - down.y) < PICK_MAX_CLICK_PIXELS) {
            onPick(e.clientX, e.clientY);
          }
          downRef.current = null;
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          downRef.current = null;
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
              {report.orbit.distance.toFixed(2)} · pan {report.orbit.panX.toFixed(2)}/{report.orbit.panZ.toFixed(2)}
            </div>
            {/* v182 — what the last click picked, or an honest dash when the click hit empty space. */}
            <div data-scene3d-picked>
              picked: {report.selected ? <strong>{report.selected.name}</strong> : '—'}
            </div>
            {/* v192 — the selected body's facts, read from the LIVE scene at report time (the lighting
                rule). Absent when nothing is selected or the body left the scene: a name whose body
                is gone has nothing to inspect, and the HUD shows nothing rather than stale facts. */}
            {report.inspector && (
              <div data-scene3d-inspector>
                {report.inspector.name} · {report.inspector.kind} ·{' '}
                {report.inspector.position
                  ? `(${report.inspector.position.x.toFixed(2)}, ${report.inspector.position.y.toFixed(2)}, ${report.inspector.position.z.toFixed(2)})`
                  : '(position unknown)'}{' '}
                · {report.inspector.visible ? 'visible' : 'hidden'}
                {/* v199 → v200 — the components the live registry holds, now EDITABLE: each row gets its
                    own toggle. A disabled component names itself `(off)`; the button flips it through the
                    host gate and the report re-reads the registry at once.
                    v207 — the report now carries the two halves apart (`components` enabled,
                    `disabledComponents` not). The HUD joins them back into ONE row set: the active ones
                    first, the disabled ones after, each still a toggle — v204's gate must not strand a
                    component out of the only surface that can click it back on. */}
                {report.inspector.components.length + report.inspector.disabledComponents.length > 0 && (
                  <>
                    {' '}· components:{' '}
                    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                      {[...report.inspector.components, ...report.inspector.disabledComponents].map((c) => (
                        <button
                          key={c.name}
                          type="button"
                          className="btn"
                          data-scene3d-component-enabled={c.enabled ? 'on' : 'off'}
                          onClick={() => onToggleComponentEnabled(c.name)}
                          style={{ fontSize: '0.85em', padding: '1px 6px' }}
                        >
                          {c.enabled ? c.name : `${c.name} (off)`}
                        </button>
                      ))}
                    </span>
                  </>
                )}
                {/* v197 — the inspector's own edit verbs, over the same selection the facts read. The
                    labels state the ACTION; what actually happened is the report that follows, read
                    from the live scene. */}
                <span style={{ marginLeft: 6, display: 'inline-flex', gap: 4, pointerEvents: 'auto' }}>
                  <button type="button" className="btn" data-scene3d-inspector-rename onClick={onInspectorRename}>
                    rename
                  </button>
                  <button
                    type="button"
                    className="btn"
                    data-scene3d-inspector-visible={report.inspector.visible ? 'on' : 'off'}
                    onClick={onInspectorToggleVisible}
                  >
                    {report.inspector.visible ? 'hide' : 'show'}
                  </button>
                </span>
              </div>
            )}
            {/* v183 — the scene's declared lights, each with on/off and −/+ brightness. The numbers come
                from the report (the LIVE scene), so a host without a lighting gate shows its lights
                unchanged rather than pretending a press did something. */}
            {s && s.lighting.length > 0 && (
              <div data-scene3d-lights style={{ marginTop: 4, pointerEvents: 'auto' }}>
                {s.lighting.map((light) => (
                  <div key={light.id} data-scene3d-light={light.id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ minWidth: 74 }}>
                      {light.id} ({light.type})
                    </span>
                    <button
                      type="button"
                      className="btn"
                      data-scene3d-light-toggle={light.id}
                      onClick={() => onLightToggle(light.id, !light.enabled)}
                    >
                      {light.enabled ? 'on' : 'off'}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      data-scene3d-light-dim={light.id}
                      onClick={() => onLightStep(light.id, -1)}
                    >
                      −
                    </button>
                    <span data-scene3d-light-value={light.id} style={{ minWidth: 34, textAlign: 'right' }}>
                      {light.intensity.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      className="btn"
                      data-scene3d-light-brighten={light.id}
                      onClick={() => onLightStep(light.id, 1)}
                    >
                      +
                    </button>
                  </div>
                ))}
              </div>
            )}
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
          <button type="button" className="btn" data-scene-save-disk onClick={onSaveToDisk}>
            save to disk
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
        {/* M5 v184 — saves on the SERVER's disk, via the save-fs lane (route → the runtime's fs
            store). A row click loads that save into a fresh scene, exactly like the panel's own
            load button; the bytes never cross the client's store to get here. */}
        <div style={{ marginTop: 8, pointerEvents: 'auto' }}>
          <button type="button" className="btn" data-scene-browse-disk onClick={onBrowseDisk}>
            browse disk
          </button>
          {diskSaves.map((path) => (
            <div
              key={path}
              data-scene3d-disk-save={path}
              onClick={() => onLoadFromDisk(path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '4px 6px',
                margin: '2px 0',
                borderRadius: 3,
                fontSize: 10,
                lineHeight: 1.4,
                cursor: 'pointer',
                border: '1px solid rgba(102, 187, 106, 0.4)',
                background: 'rgba(102, 187, 106, 0.08)',
              }}
            >
              <div style={{ flex: 1 }}>
                <div>{path}</div>
                <div style={{ color: 'var(--nexus-muted)', fontSize: 9 }}>
                  on the server&apos;s disk — click to restore into a fresh scene
                </div>
              </div>
              <button
                type="button"
                data-scene3d-disk-delete={path}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteDiskSave(path);
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
                title={`Delete disk save ${path}`}
              >
                delete
              </button>
              <button
                type="button"
                data-scene3d-disk-rename={path}
                onClick={(e) => {
                  e.stopPropagation();
                  const newName = prompt('Enter a new name for this disk save:', path);
                  if (newName && newName !== path) {
                    onRenameDiskSave(path, newName);
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
                title={`Rename disk save ${path}`}
              >
                rename
              </button>
            </div>
          ))}
        </div>
        {/* v185 — the QUOTA METER, in the save area. The store line is measured (the meter reads the
            bytes it reports); the origin line is the browser's own estimate and covers every storage
            API, not just localStorage — the label says so. A missing estimate is named, not guessed. */}
        <div data-scene3d-storage-meter style={{ marginTop: 8, fontSize: 10, color: 'var(--nexus-muted)' }}>
          <div data-scene3d-store-footprint>
            store: {storeMeter ? formatFootprint(storeMeter, 'studio-scene') : 'measuring…'}
          </div>
          <div data-scene3d-origin-estimate>
            {originEstimate ? formatOriginEstimate(originEstimate) : 'origin: measuring…'}
          </div>
          {originPct !== null && (
            <div style={{ marginTop: 3, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <div
                data-scene3d-quota-bar
                style={{ height: '100%', width: `${Math.max(0.5, originPct)}%`, background: 'rgba(102, 187, 106, 0.65)' }}
              />
            </div>
          )}
        </div>
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
