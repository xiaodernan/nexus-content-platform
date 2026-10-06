'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ThreeRuntime,
  createHeadlessBackend,
  createWebGLBackend,
  webglAvailable,
} from '@nexus/three-runtime';
import {
  createStudioScene,
  ORBIT_RADIANS_PER_PIXEL,
  ORBIT_ZOOM_PER_NOTCH,
  type SceneAdapterLike,
  type SceneReport,
  type SceneSurface,
} from '@/lib/scene3d';
import { installSceneBridge } from '@/lib/observability';

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
  // Pointer-drag bookkeeping. A ref, not state: a drag must not re-render on every move.
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [report, setReport] = useState<SceneReport | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // A real GL context when the host has one, the recording backend when it does not. Both arrive as
    // the runtime's construction option (M5 v108) — the same seam the package's own suite uses — so
    // this is a parameter, not a fork inside the class.
    const gl = webglAvailable();
    const runtime = new ThreeRuntime(
      {},
      gl ? { backend: createWebGLBackend } : { backend: (_canvas, config) => createHeadlessBackend(config) },
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
        {note && <div style={{ marginTop: 6, color: 'var(--nexus-muted)', maxWidth: 280 }}>{note}</div>}
      </div>
    </div>
  );
}
