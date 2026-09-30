'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ThreeRuntime,
  createHeadlessBackend,
  createWebGLBackend,
  webglAvailable,
} from '@nexus/three-runtime';
import {
  createStudioScene,
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
      installSceneBridge(() => null);
      setReport(null);
      setNote('');
    };
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
        style={{ display: 'block', width: '100%', height: '100%' }}
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
          </>
        ) : (
          <div>starting…</div>
        )}
        {note && <div style={{ marginTop: 6, color: 'var(--nexus-muted)', maxWidth: 280 }}>{note}</div>}
      </div>
    </div>
  );
}
