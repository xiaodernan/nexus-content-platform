// M5 v211 — setEntityName/setEntityVisible (v197) changed the registry SILENTLY: the component family
// had announced itself on the event bus since always (v210 gave it a subscriber), but an out-of-band
// rename or hide was still news the bus never carried. These verbs now emit AFTER the mutation — and
// a refusal, which changed nothing, announces nothing.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  ThreeRuntime,
  createHeadlessBackend,
  manualFrameScheduler,
  sceneId as brandSceneId,
  entityId as brandEntityId,
  type HeadlessBackend,
} from '../src/index.js';

const CONFIG = {
  renderer: { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'default' as const, stencil: false, depth: false, logarithmicDepthBuffer: false },
  shadowMap: { enabled: false, type: 0, autoUpdate: false },
  toneMapping: 0,
  toneMappingExposure: 1,
  colorSpace: 'srgb' as const,
  sortObjects: true,
};

function headlessRuntime() {
  let backend: HeadlessBackend | null = null;
  const scheduler = manualFrameScheduler();
  const runtime = new ThreeRuntime(
    CONFIG,
    {
      backend: () => {
        backend = createHeadlessBackend(CONFIG);
        return backend;
      },
      scheduler,
    },
  );
  const mockCanvas = { width: 800, height: 600, style: {}, addEventListener() {}, removeEventListener() {}, getContext: () => null } as unknown as HTMLCanvasElement;
  runtime.initialize(mockCanvas);
  return { runtime, scheduler, backend: backend! };
}

interface RenamedData {
  sceneId: string;
  entityId: string;
  name: string;
}
interface VisibilityData {
  sceneId: string;
  entityId: string;
  visible: boolean;
}

describe('M5 v211 — the entity rename/visibility verbs announce themselves', () => {
  let runtime: ThreeRuntime;
  let scene: ReturnType<ThreeRuntime['createScene']>;
  let entity: ReturnType<ThreeRuntime['createEntity']>;
  let renamed: RenamedData[];
  let visibility: VisibilityData[];

  const listen = () => {
    runtime.addEventListener('entityRenamed', (data?: unknown) => renamed.push(data as RenamedData));
    runtime.addEventListener('entityVisibilityChanged', (data?: unknown) => visibility.push(data as VisibilityData));
  };

  beforeEach(() => {
    const headless = headlessRuntime();
    runtime = headless.runtime;
    scene = runtime.createScene('Test Scene');
    entity = runtime.createEntity(scene.id, 'Test Entity', 'mesh');
    renamed = [];
    visibility = [];
    listen();
  });

  it('a successful rename emits entityRenamed exactly once, with the scene, the entity and the NEW name', () => {
    expect(runtime.setEntityName(scene.id, entity.id, 'Hero')).toBe(true);

    expect(renamed).toEqual([{ sceneId: scene.id, entityId: entity.id, name: 'Hero' }]);
  });

  it('the rename announcement arrives AFTER the registry moved: a listener reading the entity sees the new name', () => {
    // The ordering is the whole grant: an emit BEFORE `entity.name = name` would announce a name the
    // registry does not yet hold. The runtime's emit try/CATCHES each listener, so an inline expect
    // would be swallowed — RECORD what the listener read from the REGISTRY (not the payload) and
    // assert outside.
    const nameAtEmit: string[] = [];
    runtime.addEventListener('entityRenamed', () => {
      const live = runtime.getSceneGraph().scenes.get(scene.id)!.entities.get(entity.id)!;
      nameAtEmit.push(live.name);
    });
    expect(runtime.setEntityName(scene.id, entity.id, 'Villain')).toBe(true);
    expect(nameAtEmit).toEqual(['Villain']);
  });

  it('every refused rename is SILENT: blank, non-string, unknown entity and unknown scene announce nothing', () => {
    expect(runtime.setEntityName(scene.id, entity.id, '   ')).toBe(false);
    expect(runtime.setEntityName(scene.id, entity.id, undefined as unknown as string)).toBe(false);
    expect(runtime.setEntityName(scene.id, brandEntityId('no-such-entity'), 'Hero')).toBe(false);
    expect(runtime.setEntityName(brandSceneId('no-such-scene'), entity.id, 'Hero')).toBe(false);

    expect(renamed).toEqual([]);
  });

  it('a successful visibility change emits entityVisibilityChanged on BOTH legs — hide and show', () => {
    expect(runtime.setEntityVisible(scene.id, entity.id, false)).toBe(true);
    expect(runtime.setEntityVisible(scene.id, entity.id, true)).toBe(true);

    expect(visibility).toEqual([
      { sceneId: scene.id, entityId: entity.id, visible: false },
      { sceneId: scene.id, entityId: entity.id, visible: true },
    ]);
  });

  it('the visibility announcement arrives AFTER both records moved: registry AND three.js object already agree', () => {
    // Same swallowed-expect rule as the rename ordering case: RECORD the pair each record held at
    // emit time, assert outside the listener.
    const recordsAtEmit: Array<[boolean, boolean]> = [];
    runtime.addEventListener('entityVisibilityChanged', (data?: unknown) => {
      const d = data as VisibilityData;
      const live = runtime.getSceneGraph().scenes.get(d.sceneId)!.entities.get(d.entityId)!;
      recordsAtEmit.push([live.visible, live.threeObject.visible]);
    });
    expect(runtime.setEntityVisible(scene.id, entity.id, false)).toBe(true);
    expect(recordsAtEmit).toEqual([[false, false]]);
  });

  it('a refused visibility change is SILENT: non-boolean asks and unknown owners announce nothing', () => {
    expect(runtime.setEntityVisible(scene.id, entity.id, 0 as unknown as boolean)).toBe(false);
    expect(runtime.setEntityVisible(scene.id, entity.id, 'true' as unknown as boolean)).toBe(false);
    expect(runtime.setEntityVisible(scene.id, brandEntityId('no-such-entity'), true)).toBe(false);
    expect(runtime.setEntityVisible(brandSceneId('no-such-scene'), entity.id, false)).toBe(false);

    expect(visibility).toEqual([]);
  });

  it('the two names do not cross: a rename reaches only the rename listener and a hide only the visibility one', () => {
    runtime.setEntityName(scene.id, entity.id, 'Hero');
    runtime.setEntityVisible(scene.id, entity.id, false);

    expect(renamed.length).toBe(1);
    expect(visibility.length).toBe(1);
  });

  it('removeEventListener silences the verb: after unsubscribe, further changes announce nothing', () => {
    const listener = (data?: unknown) => renamed.push(data as RenamedData);
    runtime.addEventListener('entityRenamed', listener);
    runtime.setEntityName(scene.id, entity.id, 'First');
    runtime.removeEventListener('entityRenamed', listener);
    runtime.setEntityName(scene.id, entity.id, 'Second');

    // The beforeEach listener shares this ledger, so the first rename (both listeners live) pushes
    // twice and the second (after unsubscribe) pushes once — the ADDED listener heard exactly once.
    expect(renamed.map((r) => r.name)).toEqual(['First', 'First', 'Second']);
  });
});
