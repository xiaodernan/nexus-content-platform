import * as THREE from 'three';
import { DEFAULT_THREE_CONFIG, sceneId, entityId, cameraId, animationId } from './types.js';
import type {
  ThreeScene,
  ThreeEntity,
  ThreeCamera,
  ThreeAnimation,
  SceneGraph,
  SceneId,
  EntityId,
  CameraId,
  AnimationId,
  EntityComponent,
  ThreeRuntimeConfig,
  LightingConfig,
  PhysicsConfig,
  CharacterController,
  ControllerInput,
  SerializedEntity,
  CinematicSequence,
  CinematicShot,
  SerializedCinematic,
} from './types.js';
import {
  createWebGLBackend,
  defaultFrameScheduler,
  type FrameScheduler,
  type RenderBackend,
  type RenderBackendFactory,
} from './renderBackend.js';

export { DEFAULT_THREE_CONFIG };

/** A controller attached to an entity, stepped by the frame loop. `groundY` is NOT one of these fields
 *  — it is a property of the world the character stands on, so it lives on the registry entry. */
export interface ControllerAttachOptions {
  type?: CharacterController['type'];
  speed?: number;
  runSpeed?: number;
  jumpForce?: number;
  gravity?: number;
  airControl?: number;
  slopeLimit?: number;
  stepOffset?: number;
  groundY?: number;
  input?: Partial<ControllerInput>;
}

/** The declared numbers the integrator starts from when a caller names none. */
export const DEFAULT_CONTROLLER = {
  type: 'thirdPerson' as const,
  speed: 4,
  runSpeed: 8,
  jumpForce: 5,
  gravity: 9.81,
  airControl: 0.5,
  slopeLimit: 45,
  stepOffset: 0.3,
  groundY: 0,
};

/** The `PhysicsConfig` fields the frame loop READS. `physicsFieldAudit` reports the rest of the type by
 *  name, so a declared word is never left with no reader: `broadphase` and `solverIterations` name work
 *  on contacts, and this package has no collision geometry to have contacts with. */
const HONORED_PHYSICS_FIELDS: readonly string[] = ['gravity', 'timeStep', 'maxSubSteps'];

const UNHONORED_PHYSICS_REASONS: readonly { field: string; reason: string }[] = [
  { field: 'broadphase', reason: 'names a search over candidate contact pairs, and there is no collision geometry in this package to search among' },
  { field: 'solverIterations', reason: 'counts passes over existing contacts, and a character is held up by the `groundY` plane, not by a solver' },
];

/** The `CinematicShot` fields the playhead reads while time advances. `transition`, `transitionDuration`
 *  and `postProcessing` are the declared words left over, and `cinematicFieldAudit` says WHY each one is
 *  in the second list: a value this player cannot perform is refused at `defineCinematic`, which is not
 *  the same claim as honoring a field — a field that can only ever hold one value changes nothing. */
const HONORED_SHOT_FIELDS: readonly string[] = [
  'id', 'cameraId', 'startTime', 'endTime', 'cameraPath', 'targetPath', 'fovAnimation',
];

const UNHONORED_SHOT_REASONS: readonly { field: string; reason: string }[] = [
  { field: 'transition', reason: "only the value 'cut' is accepted; a fade, dissolve, wipe or slide blends two rendered images, and this runtime draws one active camera per frame" },
  { field: 'transitionDuration', reason: 'the only transition available is instantaneous, so a non-zero duration is refused at defineCinematic rather than timed — after the refusal the number has nothing to control' },
  { field: 'postProcessing', reason: 'declares a list of render passes; nothing here compiles a pass, so a shot cannot switch a filter chain the backend does not have' },
];

/** `CinematicSequence` split the same way: `duration` is DERIVED from the shots, `currentShot` and
 *  `playing` are written by the player, and the rest identify what is being played. */
const READ_SEQUENCE_FIELDS: readonly string[] = ['id', 'name', 'shots', 'duration'];
const WRITTEN_SEQUENCE_FIELDS: readonly string[] = ['currentShot', 'playing'];

/**
 * The easings a `fovAnimation` can name. The declared type says `easing: string`, so the honest options
 * were to treat an unknown word as linear (a silent guess) or to refuse it at definition; this refuses,
 * and `defineCinematic` names the keys of THIS table in the message, so the list cannot go stale in prose.
 */
const CINEMATIC_EASINGS: Record<string, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
};

/**
 * Which axes a controller type moves on, and whose frame those axes come from. `sideScroll` lives in
 * XY, so `moveForward`/`moveBackward` have nothing to push against; `firstPerson`/`thirdPerson` read
 * the ACTIVE camera's yaw, so the same key produces a different world direction per camera.
 */
const MOVEMENT_PLANE: Record<CharacterController['type'], 'cameraXZ' | 'worldXZ' | 'worldXY'> = {
  firstPerson: 'cameraXZ',
  thirdPerson: 'cameraXZ',
  topDown: 'worldXZ',
  custom: 'worldXZ',
  sideScroll: 'worldXY',
};

/** Names the integrator CONSULTS to decide what happens this frame. */
const READ_CONTROLLER_FIELDS: readonly string[] = [
  'entityId', 'type', 'speed', 'runSpeed', 'jumpForce', 'gravity', 'airControl', 'grounded', 'input',
];

/** Names the integrator WRITES as its result. Kept separate from the reads, because a field can be
 *  both (`grounded`) and because writing a field is not the same claim as consulting it. */
const WRITTEN_CONTROLLER_FIELDS: readonly string[] = ['velocity', 'state', 'grounded'];

/** Same rule for the input flags; which of them a plane can honor is derived from `MOVEMENT_PLANE`. */
const READ_INPUT_FLAGS: readonly string[] = ['moveForward', 'moveBackward', 'moveLeft', 'moveRight', 'jump', 'run', 'crouch'];

interface ControllerEntry {
  controller: CharacterController;
  groundY: number;
  /** False when the caller named no gravity, which is what makes the world's declared pull the source
   *  for this controller: an entry that cannot say whether its number was a choice would have to ignore
   *  `scene.physics` (refusing to honor it) or overwrite a caller's explicit value (honoring it too much). */
  gravityDeclared: boolean;
}

/** What `physicsFieldAudit` answers for a scene. `consulted`/`unhonored` are read off the shipped tables
 *  against the fields `PhysicsConfig` declares, and `effectiveGravity`/`stepping` are read off the live
 *  scene and the last frame, so the answer cannot be a constant wearing a name. */
export interface PhysicsFieldAudit {
  declared: boolean;
  consulted: string[];
  unhonored: { field: string; reason: string }[];
  effectiveGravity: number;
  stepping: { timeStep: number | null; maxSubSteps: number | null; lastFrame: { steps: number; droppedTime: number } | null };
}

/** What `playCinematic`/`updateCinematics` need beyond the declared sequence: which scene's cameras the
 *  shot ids address, and where the playhead is. `CinematicSequence` has no time field — and
 *  `SerializedCinematic` keeps `currentTime` OUTSIDE the sequence — so the playhead lives on the entry,
 *  mirroring the declared save shape instead of inventing a field the type does not have. */
interface CinematicEntry {
  sequence: CinematicSequence;
  sceneId: SceneId;
  time: number;
  /** Which shot the playhead was inside on the previous frame, or -1 before the first. The camera switch
   *  happens on a CHANGE, so this is the memory that makes a cut fire once rather than every frame. */
  lastShot: number;
}

/** What the caller declares. `duration`, `currentShot` and `playing` are the runtime's to fill: a
 *  `duration` that disagreed with its own shots would be a timeline with two answers. */
export interface CinematicSequenceInput {
  id: string;
  name: string;
  shots: CinematicShot[];
  duration?: number;
}

/** What `cinematicFieldAudit` answers for a sequence, in the same shape as `physicsFieldAudit`: the two
 *  field lists are partitions of `CinematicShot` / `CinematicSequence` as DECLARED in `types.ts` (the
 *  suite requires that, so a newly declared field cannot join the silent ones), and `playhead` is read
 *  off the live entry so the answer moves when the timeline does. */
export interface CinematicFieldAudit {
  consulted: string[];
  unhonored: { field: string; reason: string }[];
  sequenceRead: string[];
  sequenceWritten: string[];
  playhead: {
    playing: boolean;
    time: number;
    duration: number;
    currentShot: number;
    shotId: string | null;
    cameraId: CameraId | null;
    /** True when another sequence holds the single active slot — see `playCinematic`. */
    blockedBy: string | null;
  };
}

/** What `controllerFieldAudit` answers. The `untouched` list is the honesty surface — a field declared
 *  on `CharacterController` but never implemented shows up there BY NAME instead of being ignored in
 *  silence. `slopeLimit` and `stepOffset` are in it today: both need collision geometry this package
 *  does not have. (`scene.physics` / `PhysicsConfig` was in that sentence up to v116, which gave the
 *  declared world a reader; see `physicsFieldAudit` for what it still cannot honor.) */
export interface ControllerFieldAudit {
  consulted: string[];
  written: string[];
  untouched: string[];
  input: { consulted: string[]; untouched: string[] };
}

function emptyControllerInput(): ControllerInput {
  return { moveForward: false, moveBackward: false, moveLeft: false, moveRight: false, jump: false, run: false, crouch: false, custom: {} };
}

/** Which shot owns a playhead instant: the LAST one that has started, so a shot holds the camera until the
 *  next one begins. `defineCinematic` has already refused a timeline with a gap or an overlap, which is
 *  what makes this total — with a gap, the frames inside it would silently show the previous shot. */
function shotIndexAt(shots: readonly CinematicShot[], time: number): number {
  let index = 0;
  for (let i = 0; i < shots.length; i += 1) {
    if (shots[i]!.startTime <= time) index = i;
  }
  return index;
}

/**
 * What the save surface can carry. `snapshotEntity`/`restoreEntity` are the first readers of the
 * `SerializedEntity` type, which `types.ts` had declared with nothing constructing or consuming it.
 *
 * An entity's `threeObject` and `transform` are not extra state — they are two views of the same
 * numbers (`entity.transform.position === entity.threeObject.position`, pinned in the controller
 * suite) — so the save shape carries them as `position`/`rotation`/`scale`. This table records WHICH
 * fields of that view the shape claims to carry, and `saveFeasibilityAudit` accepts an alias only when
 * every name it claims is present in the snapshot it actually builds. That is why `layers` is listed
 * here and declared on `SerializedEntity`: the claim is checked against the produced record, so a shape
 * that stops carrying a field it claims is reported as broken instead of restoring a default.
 */
const SAVE_ALIAS_CLAIMS: Record<string, readonly string[]> = {
  threeObject: ['position', 'rotation', 'scale', 'visible', 'castShadow', 'receiveShadow', 'layers'],
  transform: ['position', 'rotation', 'scale'],
};

/** Which declared `SaveData` fields the runtime can fill today, and which are waiting on a system that
 *  does not exist yet. The blocked half is the honest part: `npcs`/`quests`/`player` are declared in
 *  `types.ts` and implemented by nothing, and `cinematic` has had a runtime owner since v117 but still has
 *  nothing that can rebuild its live objects from stored points — so a `SaveData` written today would carry
 *  empty maps that look like an empty game world. */
const SAVE_DATA_FEASIBILITY: { savable: readonly string[]; blocked: readonly { field: string; needs: string }[] } = {
  savable: ['entities'],
  blocked: [
    { field: 'sceneGraph', needs: 'SerializedScene stores a LightingConfig whose lights hold live THREE.Light objects and a PhysicsConfig whose gravity is a live THREE.Vector3; nothing here rebuilds either' },
    { field: 'npcs', needs: 'NPCSystem is declared in types.ts and implemented by nothing' },
    { field: 'quests', needs: 'QuestSystem is declared in types.ts and implemented by nothing' },
    { field: 'player', needs: 'SerializedPlayer names health/mana/inventory/skills; the runtime holds no player state' },
    { field: 'worldState', needs: 'the runtime keeps no world-state store' },
    { field: 'cinematic', needs: 'v117 gave this a writer — `cinematicSnapshot` fills all three `SerializedCinematic` fields — but the `sequences` map it fills holds LIVE `CinematicSequence` objects whose shots carry `THREE.CatmullRomCurve3` paths, and nothing here rebuilds a curve from stored points' },
  ],
};

/** The answer `saveFeasibilityAudit` gives. `dropped` is the list that matters: a live field the shape
 *  cannot carry is a save that lies about the state it restored. */
export interface SaveFeasibilityAudit {
  dropped: string[];
  aliased: string[];
  savable: string[];
  blocked: { field: string; needs: string }[];
}

/**
 * The two open bags in the save shape (`userData`, `EntityComponent.data`) must hold data, not live
 * objects. A reference to a running `THREE.Object3D` inside a snapshot keeps the whole scene graph alive
 * behind it and restores as a detached object, so a class instance is refused BY NAME rather than copied
 * into something flatter than what the caller put in.
 */
function plainDataOrRefuse(value: unknown, path: string): void {
  if (value === null || value === undefined) return;
  const kind = typeof value;
  if (kind === 'number' || kind === 'string' || kind === 'boolean') return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => plainDataOrRefuse(item, `${path}[${i}]`));
    return;
  }
  if (kind !== 'object') {
    throw new Error(`snapshot: ${path} holds ${kind}, which a save cannot carry`);
  }
  const proto = Object.getPrototypeOf(value as object);
  if (proto !== Object.prototype && proto !== null) {
    const name = (value as { constructor?: { name?: string } }).constructor?.name ?? 'unnamed class';
    throw new Error(`snapshot: ${path} holds a ${name} instance, not plain data — a save stores values, not live objects`);
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    plainDataOrRefuse(nested, `${path}.${key}`);
  }
}

export class ThreeRuntime {
  private config: ThreeRuntimeConfig;
  private sceneGraph: SceneGraph;
  private backend: RenderBackend | null = null;
  private backendFactory: RenderBackendFactory;
  private scheduler: FrameScheduler;
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private animationFrameId: number | null = null;
  private running = false;
  private eventListeners: Map<string, Function[]> = new Map();
  /** Entities carrying a character controller, keyed by entity id. The registry — not a component —
   *  owns this because the integrator needs a per-entity world property (`groundY`) beside the controller. */
  private controllers: Map<EntityId, ControllerEntry> = new Map();
  /** Cinematic sequences the runtime owns, keyed by their declared id. */
  private readonly cinematics = new Map<string, CinematicEntry>();

  constructor(config: Partial<ThreeRuntimeConfig> = {}, options: ThreeRuntimeOptions = {}) {
    this.config = { ...DEFAULT_THREE_CONFIG, ...config };
    this.backendFactory = options.backend ?? createWebGLBackend;
    this.scheduler = options.scheduler ?? defaultFrameScheduler();
    this.sceneGraph = this.createEmptySceneGraph();
  }

  private createEmptySceneGraph(): SceneGraph {
    return {
      scenes: new Map(),
      activeSceneId: null,
      clock: new THREE.Clock(),
      stats: { fps: 0, drawCalls: 0, triangles: 0, points: 0, lines: 0 },
    };
  }

  initialize(canvas: HTMLCanvasElement | OffscreenCanvas): void {
    this.canvas = canvas;
    // The renderer is built by the injected backend (M5 v108). Production passes `createWebGLBackend`,
    // which applies the exact same settings this method used to apply inline; a headless caller passes
    // a recording backend and every decision ABOVE this line becomes verifiable without a GPU.
    this.backend = this.backendFactory(canvas, this.config);
    this.emit('initialized', { renderer: this.backend.raw, backend: this.backend });
  }

  resize(width: number, height: number): void {
    if (!this.backend) return;
    this.backend.setSize(width, height, false);
    this.emit('resize', { width, height });
  }

  setPixelRatio(ratio: number): void {
    this.backend?.setPixelRatio(ratio);
  }

  createScene(name: string, id?: string): ThreeScene {
    const sceneIdValue = id ? sceneId(id) : sceneId(`scene-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const threeScene = new THREE.Scene();

    const scene: ThreeScene = {
      id: sceneIdValue,
      name,
      threeScene,
      entities: new Map(),
      cameras: new Map(),
      animations: new Map(),
      lighting: this.createDefaultLighting(),
      metadata: {},
    };

    this.sceneGraph.scenes.set(sceneIdValue, scene);

    if (!this.sceneGraph.activeSceneId) {
      this.sceneGraph.activeSceneId = sceneIdValue;
    }

    this.emit('sceneCreated', { scene });
    return scene;
  }

  private createDefaultLighting(): LightingConfig {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    const directional = new THREE.DirectionalLight(0xffffff, 1);
    directional.position.set(10, 20, 10);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 2048;
    directional.shadow.mapSize.height = 2048;
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 50;
    directional.shadow.camera.left = -20;
    directional.shadow.camera.right = 20;
    directional.shadow.camera.top = 20;
    directional.shadow.camera.bottom = -20;

    return {
      ambient: new THREE.Color(0x404040),
      ambientIntensity: 0.5,
      shadows: true,
      shadowMapType: THREE.PCFSoftShadowMap,
      lights: [
        { id: 'ambient', type: 'ambient', threeLight: ambient, enabled: true, castShadow: false },
        { id: 'directional', type: 'directional', threeLight: directional, enabled: true, castShadow: true },
      ],
    };
  }

  getScene(id: SceneId): ThreeScene | undefined {
    return this.sceneGraph.scenes.get(id);
  }

  getActiveScene(): ThreeScene | undefined {
    return this.sceneGraph.activeSceneId ? this.sceneGraph.scenes.get(this.sceneGraph.activeSceneId) : undefined;
  }

  setActiveScene(id: SceneId): boolean {
    const scene = this.sceneGraph.scenes.get(id);
    if (!scene) return false;
    this.sceneGraph.activeSceneId = id;
    this.emit('activeSceneChanged', { sceneId: id });
    return true;
  }

  createEntity(
    sceneId: SceneId,
    name: string,
    type: ThreeEntity['type'],
    geometry?: THREE.BufferGeometry,
    material?: THREE.Material | THREE.Material[],
    position?: THREE.Vector3,
    rotation?: THREE.Euler,
    scale?: THREE.Vector3
  ): ThreeEntity {
    return this.insertEntity(
      sceneId,
      entityId(`entity-${Date.now()}-${Math.random().toString(36).slice(2)}`),
      name,
      type,
      geometry,
      material,
      position,
      rotation,
      scale,
    );
  }

  /**
   * Build one entity and register it under `id`. `createEntity` generates the id; a restore passes the
   * saved one, because `SerializedEntity.id` is only worth storing if a load hands back the SAME address
   * — otherwise everything that referenced the old id (a controller, another entity's `userData`) points
   * at nothing after a load, while the save itself claims it recorded the id.
   */
  private insertEntity(
    sceneId: SceneId,
    id: EntityId,
    name: string,
    type: ThreeEntity['type'],
    geometry?: THREE.BufferGeometry,
    material?: THREE.Material | THREE.Material[],
    position?: THREE.Vector3,
    rotation?: THREE.Euler,
    scale?: THREE.Vector3
  ): ThreeEntity {
    const scene = this.sceneGraph.scenes.get(sceneId);
    if (!scene) throw new Error(`Scene ${sceneId} not found`);

    let threeObject: THREE.Object3D;
    switch (type) {
      case 'mesh':
        threeObject = new THREE.Mesh(geometry || new THREE.BoxGeometry(1, 1, 1), material || new THREE.MeshStandardMaterial());
        break;
      case 'group':
        threeObject = new THREE.Group();
        break;
      case 'sprite':
        threeObject = new THREE.Sprite(material as THREE.SpriteMaterial || new THREE.SpriteMaterial());
        break;
      case 'points':
        threeObject = new THREE.Points(geometry || new THREE.BufferGeometry(), material as THREE.PointsMaterial || new THREE.PointsMaterial());
        break;
      case 'line':
        threeObject = new THREE.Line(geometry || new THREE.BufferGeometry(), material as THREE.LineBasicMaterial || new THREE.LineBasicMaterial());
        break;
      case 'skinnedMesh':
        threeObject = new THREE.SkinnedMesh(geometry || new THREE.BufferGeometry(), material || new THREE.MeshStandardMaterial());
        break;
      default:
        threeObject = new THREE.Object3D();
    }

    if (position) threeObject.position.copy(position);
    if (rotation) threeObject.rotation.copy(rotation);
    if (scale) threeObject.scale.copy(scale);

    threeObject.updateMatrix();
    threeObject.updateMatrixWorld(true);

    const entity: ThreeEntity = {
      id,
      name,
      type,
      threeObject,
      components: new Map(),
      transform: {
        position: threeObject.position,
        rotation: threeObject.rotation,
        scale: threeObject.scale,
        matrix: threeObject.matrix,
        matrixWorld: threeObject.matrixWorld,
      },
      visible: true,
      castShadow: true,
      receiveShadow: true,
      layers: 0,
      userData: {},
    };

    scene.entities.set(id, entity);
    scene.threeScene.add(threeObject);

    this.emit('entityCreated', { sceneId, entity });
    return entity;
  }

  getEntity(sceneId: SceneId, entityId: EntityId): ThreeEntity | undefined {
    return this.sceneGraph.scenes.get(sceneId)?.entities.get(entityId);
  }

  removeEntity(sceneId: SceneId, entityId: EntityId): boolean {
    const scene = this.sceneGraph.scenes.get(sceneId);
    if (!scene) return false;

    const entity = scene.entities.get(entityId);
    if (!entity) return false;

    scene.threeScene.remove(entity.threeObject);
    this.disposeSubtree(entity.threeObject);

    scene.entities.delete(entityId);
    this.emit('entityRemoved', { sceneId, entityId });
    return true;
  }

  /**
   * Dispose every GPU resource under `root`.
   *
   * `THREE.Object3D` does not declare `geometry`/`material` — only the subclasses that own them do
   * (Mesh, Line, Points, Sprite) — so this narrows explicitly instead of reaching through a cast at
   * each call site. Kept as one function because the same traversal was duplicated in `removeEntity`
   * and `dispose()`, which is how one of them eventually stops matching the other.
   */
  private disposeSubtree(root: THREE.Object3D): void {
    root.traverse((obj) => {
      const owner = obj as THREE.Object3D & {
        geometry?: { dispose(): void };
        material?: THREE.Material | THREE.Material[];
      };
      owner.geometry?.dispose();
      const material = owner.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
  }

  addComponent(entity: ThreeEntity, component: EntityComponent): void {
    entity.components.set(component.type, component);
    this.emit('componentAdded', { entityId: entity.id, component });
  }

  removeComponent(entity: ThreeEntity, componentType: string): boolean {
    const removed = entity.components.delete(componentType);
    if (removed) {
      this.emit('componentRemoved', { entityId: entity.id, componentType });
    }
    return removed;
  }

  getComponent(entity: ThreeEntity, componentType: string): EntityComponent | undefined {
    return entity.components.get(componentType);
  }

  /**
   * Copy one entity's state out of the running scene, under the shape `SerializedEntity` declares.
   *
   * The three numbers-bearing fields are CLONED, not assigned: `entity.transform.position` is the very
   * object the renderer moves, so a snapshot that stored the reference would keep changing after it was
   * taken, and a caller would have no way to tell a saved position from a live one. The two open bags
   * (`userData`, each component's `data`) are checked by `plainDataOrRefuse` first, so a value that is a
   * live class instance is refused with its path named instead of being flattened into a plain object.
   */
  snapshotEntity(sceneId: SceneId, entity: EntityId): SerializedEntity {
    const target = this.getEntity(sceneId, entity);
    if (!target) throw new Error(`snapshotEntity: entity ${entity} is not in scene ${sceneId}`);
    const copy = (record: Record<string, unknown>, path: string): Record<string, unknown> => {
      plainDataOrRefuse(record, path);
      return structuredClone(record);
    };
    return {
      id: target.id,
      name: target.name,
      type: target.type,
      position: target.threeObject.position.clone(),
      rotation: target.threeObject.rotation.clone(),
      scale: target.threeObject.scale.clone(),
      visible: target.visible,
      castShadow: target.castShadow,
      receiveShadow: target.receiveShadow,
      layers: target.layers,
      components: new Map(
        [...target.components].map(([key, component]) => [
          key,
          { type: component.type, data: copy(component.data, `components.${key}.data`), enabled: component.enabled },
        ]),
      ),
      userData: copy(target.userData, 'userData'),
    };
  }

  /**
   * Put a snapshot back, under the id it was saved with.
   *
   * This is a NEW entity, not an overwrite: restoring onto a live id would replace state the caller has
   * not agreed to lose, so an occupied id throws instead. Because `SerializedEntity` carries no geometry
   * or material, a restored mesh is built the same way `createEntity` builds one with no shape arguments
   * — the default box and standard material — which `saveFeasibilityAudit` names rather than leaves for
   * the caller to discover as a wrong-looking scene.
   */
  restoreEntity(sceneId: SceneId, snapshot: SerializedEntity): ThreeEntity {
    if (!this.sceneGraph.scenes.get(sceneId)) {
      throw new Error(`restoreEntity: scene ${sceneId} does not exist (entity ${snapshot.id})`);
    }
    if (this.getEntity(sceneId, snapshot.id)) {
      throw new Error(`restoreEntity: entity ${snapshot.id} is already in scene ${sceneId}; a restore never overwrites live state`);
    }
    const entity = this.insertEntity(
      sceneId,
      snapshot.id,
      snapshot.name,
      snapshot.type,
      undefined,
      undefined,
      snapshot.position,
      snapshot.rotation,
      snapshot.scale,
    );
    entity.visible = snapshot.visible;
    entity.castShadow = snapshot.castShadow;
    entity.receiveShadow = snapshot.receiveShadow;
    entity.layers = snapshot.layers;
    entity.threeObject.visible = snapshot.visible;
    entity.threeObject.castShadow = snapshot.castShadow;
    entity.threeObject.receiveShadow = snapshot.receiveShadow;
    entity.threeObject.layers.set(snapshot.layers);
    for (const [key, component] of snapshot.components) {
      entity.components.set(key, { type: component.type, data: structuredClone(component.data), enabled: component.enabled });
    }
    for (const [key, value] of Object.entries(snapshot.userData)) {
      entity.userData[key] = structuredClone(value);
    }
    // No `updateMatrix()` here: the insert path rebuilds it after copying position/rotation/scale, and a
    // second call measured as a mutation is caught by nothing — which is how a redundant line becomes a
    // claimed guarantee that no test can falsify.
    this.emit('entityRestored', { sceneId, entity, entityId: snapshot.id });
    return entity;
  }

  /**
   * Say, for one live entity, what a save would actually carry.
   *
   * `dropped` is derived by comparing the fields the runtime's OWN snapshot builder produces with the
   * fields the caller's entity has, so it cannot go stale quietly: a field added to `ThreeEntity` without
   * a matching line in `snapshotEntity` lands here by name, and `threeObject`/`transform` land here with
   * the specific claim of theirs that no longer holds (`SAVE_ALIAS_CLAIMS`). `blocked` is the other half
   * of the honesty: the declared `SaveData` asks for npcs, quests, a player and a cinematic state the
   * runtime does not implement, so a whole-game save written today would be a file full of empty maps.
   */
  saveFeasibilityAudit(sceneId: SceneId, entity: EntityId): SaveFeasibilityAudit | undefined {
    const target = this.getEntity(sceneId, entity);
    if (!target) return undefined;
    const carried = new Set(Object.keys(this.snapshotEntity(sceneId, entity)));
    const dropped: string[] = [];
    const aliased: string[] = [];
    for (const field of Object.keys(target)) {
      if (carried.has(field)) continue;
      const claim = SAVE_ALIAS_CLAIMS[field];
      if (!claim) {
        dropped.push(field);
        continue;
      }
      const missing = claim.filter((name) => !carried.has(name));
      if (missing.length === 0) aliased.push(field);
      else dropped.push(`${field} (${missing.join(', ')} not carried)`);
    }
    return {
      dropped: dropped.sort(),
      aliased: aliased.sort(),
      savable: [...SAVE_DATA_FEASIBILITY.savable],
      blocked: SAVE_DATA_FEASIBILITY.blocked.map(({ field, needs }) => ({ field, needs })),
    };
  }

  createCamera(
    sceneId: SceneId,
    name: string,
    type: 'perspective' | 'orthographic' = 'perspective',
    params: { fov?: number; aspect?: number; near?: number; far?: number; left?: number; right?: number; top?: number; bottom?: number } = {}
  ): ThreeCamera {
    const scene = this.sceneGraph.scenes.get(sceneId);
    if (!scene) throw new Error(`Scene ${sceneId} not found`);

    const cameraIdValue = cameraId(`camera-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    let threeCamera: THREE.Camera;
    if (type === 'perspective') {
      threeCamera = new THREE.PerspectiveCamera(
        params.fov ?? 75,
        params.aspect ?? 16 / 9,
        params.near ?? 0.1,
        params.far ?? 1000
      );
    } else {
      threeCamera = new THREE.OrthographicCamera(
        params.left ?? -10,
        params.right ?? 10,
        params.top ?? 10,
        params.bottom ?? -10,
        params.near ?? 0.1,
        params.far ?? 1000
      );
    }

    const camera: ThreeCamera = {
      id: cameraIdValue,
      name,
      type,
      threeCamera,
      active: false,
      viewport: { x: 0, y: 0, width: 1, height: 1 },
    };

    scene.cameras.set(cameraIdValue, camera);

    if (scene.cameras.size === 1) {
      camera.active = true;
    }

    this.emit('cameraCreated', { sceneId, camera });
    return camera;
  }

  setActiveCamera(sceneId: SceneId, cameraId: CameraId): boolean {
    const scene = this.sceneGraph.scenes.get(sceneId);
    if (!scene) return false;

    for (const camera of scene.cameras.values()) {
      camera.active = false;
    }

    const camera = scene.cameras.get(cameraId);
    if (!camera) return false;

    camera.active = true;
    this.emit('activeCameraChanged', { sceneId, cameraId });
    return true;
  }

  createAnimation(
    sceneId: SceneId,
    entity: ThreeEntity,
    clips: THREE.AnimationClip[],
    name: string
  ): ThreeAnimation {
    // An animation with no clips has no action to play, so it is refused here rather than handed back
    // in a state where `play()` silently does nothing (the type says `threeAnimation` is present, and
    // it must be true — M5 v108).
    if (clips.length === 0) {
      throw new Error(`createAnimation("${name}") needs at least one AnimationClip`);
    }
    const mixer = new THREE.AnimationMixer(entity.threeObject);
    const actions = clips.map(clip => mixer.clipAction(clip));
    const primary = actions[0];
    if (!primary) {
      // Unreachable given the guard above, but stated rather than asserted away: the type says
      // `threeAnimation` is present, so this function may not return one that is not.
      throw new Error(`createAnimation("${name}") produced no AnimationAction for ${clips.length} clip(s)`);
    }

    const animationIdValue = animationId(`anim-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    const animation: ThreeAnimation = {
      id: animationIdValue,
      name,
      threeAnimation: primary,
      mixer,
      clips,
      playing: false,
      loop: THREE.LoopRepeat,
      weight: 1,
      timeScale: 1,
    };

    const scene = this.sceneGraph.scenes.get(sceneId);
    if (scene) {
      scene.animations.set(animationIdValue, animation);
    }

    this.emit('animationCreated', { sceneId, animation });
    return animation;
  }

  playAnimation(animationId: AnimationId): void {
    for (const scene of this.sceneGraph.scenes.values()) {
      const animation = scene.animations.get(animationId);
      if (animation) {
        animation.playing = true;
        animation.mixer.setTime(0);
        animation.threeAnimation.play();
        this.emit('animationPlayed', { animationId });
        break;
      }
    }
  }

  stopAnimation(animationId: AnimationId): void {
    for (const scene of this.sceneGraph.scenes.values()) {
      const animation = scene.animations.get(animationId);
      if (animation) {
        animation.playing = false;
        animation.threeAnimation.stop();
        this.emit('animationStopped', { animationId });
        break;
      }
    }
  }

  start(): void {
    if (this.running || !this.backend) return;
    this.running = true;
    this.sceneGraph.clock.start();
    this.animate();
    this.emit('started');
  }

  stop(): void {
    this.running = false;
    if (this.animationFrameId !== null) {
      this.scheduler.cancel(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.sceneGraph.clock.stop();
    this.emit('stopped');
  }

  private animate = (): void => {
    if (!this.running || !this.backend) return;

    this.animationFrameId = this.scheduler.request(this.animate);

    const delta = this.sceneGraph.clock.getDelta();

    this.simulateFrame(delta);

    const activeScene = this.getActiveScene();
    if (activeScene) {
      const activeCamera = Array.from(activeScene.cameras.values()).find(c => c.active);
      if (activeCamera && this.backend) {
        this.backend.render(activeScene.threeScene, activeCamera.threeCamera);
        this.updateStats();
      }
    }

    this.emit('frame', { delta, time: this.sceneGraph.clock.getElapsedTime() });
  };

  private updateAnimations(delta: number): void {
    for (const scene of this.sceneGraph.scenes.values()) {
      for (const animation of scene.animations.values()) {
        if (animation.playing) {
          animation.mixer.update(delta * animation.timeScale);
        }
      }
    }
  }

  /**
   * Advance every simulation subsystem by exactly `delta` seconds, without a clock and without
   * rendering. `animate()` calls THIS, so the frame loop and a test can never run different code —
   * the delta a wall clock supplies is the only thing a test cannot control, and it is out of the path.
   */
  simulateFrame(delta: number): void {
    this.updateAnimations(delta);
    const steps = this.updatePhysics(delta);
    this.updateControllers(steps);
    this.updateCinematics(delta);
  }

  /** Per-scene fixed-timestep backlog, keyed by the scene that declared it. */
  private readonly physicsAccumulators = new Map<SceneId, number>();
  /** What the last frame actually ran, per scene that declares a world: an audit of a DORMANT scene must
   *  not answer with the active scene's numbers. */
  private readonly physicsFrames = new Map<SceneId, { steps: number; droppedTime: number }>();

  /**
   * The physics subsystem: the only place that reads `scene.physics`. It does the two jobs the declared
   * type exists for. First it syncs the world's pull into every controller whose caller named no gravity,
   * so changing a scene's gravity between frames changes the fall — which is the point of declaring it on
   * the world rather than baked into each character. Then it turns the frame's `delta` into the fixed
   * slices the scene asked for, and `updateControllers` integrates exactly those slices, so `timeStep`
   * and `maxSubSteps` are read by the code that moves things rather than by an audit about them.
   *
   * A scene that declares no world keeps the v114 path exactly: one slice of the whole frame.
   */
  private updatePhysics(delta: number): number[] {
    const scene = this.getActiveScene();
    const physics = scene?.physics;
    if (!scene || !physics) return [delta];
    const worldGravity = -physics.gravity.y;
    for (const [entity, entry] of this.controllers) {
      if (entry.gravityDeclared) continue;
      if (!scene.entities.has(entity)) continue;
      entry.controller.gravity = worldGravity;
    }
    const available = (this.physicsAccumulators.get(scene.id) ?? 0) + delta;
    const steps = Math.min(Math.floor(available / physics.timeStep), physics.maxSubSteps);
    const backlog = available - steps * physics.timeStep;
    // The backlog is capped at what ONE frame may simulate, and what the cap refuses is REPORTED rather
    // than kept: an uncapped accumulator loses nothing for a while and then spends a frame simulating ten
    // seconds of world, which is a teleport with a nicer name.
    const budget = physics.maxSubSteps * physics.timeStep;
    const dropped = Math.max(0, backlog - budget);
    this.physicsAccumulators.set(scene.id, backlog - dropped);
    this.physicsFrames.set(scene.id, { steps, droppedTime: dropped });
    return new Array<number>(steps).fill(physics.timeStep);
  }

  private updateControllers(steps: number[]): void {
    if (this.controllers.size === 0) return;
    const scene = this.getActiveScene();
    // Active scene only: a controller in a dormant scene does not move, and the camera-relative types
    // would otherwise borrow a yaw from a camera that is not looking at them.
    if (!scene) return;
    const yaw = this.activeCameraYaw(scene);
    // Orphans are resolved once per frame, before any slice runs: stepping a corpse and then dropping it
    // would emit `controllerOrphaned` after the motion it claims did not happen.
    const live: { target: ThreeEntity; entry: ControllerEntry }[] = [];
    for (const [entity, entry] of this.controllers) {
      const target = scene.entities.get(entity);
      if (!target) {
        // The entity left its scene while its entry stayed: drop it here and announce it, so a caller
        // that lost an entity under a controller knows which one rather than watching it stop moving.
        this.resolveController(entity);
        continue;
      }
      live.push({ target, entry });
    }
    for (const step of steps) {
      for (const { target, entry } of live) this.advanceController(target, entry, yaw, step);
    }
  }

  private activeCameraYaw(scene: ThreeScene): number {
    const camera = Array.from(scene.cameras.values()).find((c) => c.active);
    // Yaw only: a character walks the ground plane, so the camera's pitch is not the character's
    // forward. No camera means no frame to be relative to, and 0 is the world-forward case.
    return camera?.threeCamera.rotation.y ?? 0;
  }

  private advanceController(entity: ThreeEntity, entry: ControllerEntry, cameraYaw: number, delta: number): void {
    const c = entry.controller;
    const plane = MOVEMENT_PLANE[c.type];
    const yaw = plane === 'cameraXZ' ? cameraYaw : 0;
    const f = (c.input.moveForward ? 1 : 0) - (c.input.moveBackward ? 1 : 0);
    const s = (c.input.moveRight ? 1 : 0) - (c.input.moveLeft ? 1 : 0);
    const magnitude = Math.hypot(f, s);
    // Air control scales the WHOLE horizontal intent, not a separate axis — an airborne character keeps
    // steering along the same normalised direction, just slower.
    const speed = (c.input.run ? c.runSpeed : c.speed) * (c.grounded ? 1 : c.airControl);
    // Normalised BEFORE scaling, so a diagonal is not `sqrt(2)` faster than a cardinal direction.
    const nf = magnitude > 0 ? f / magnitude : 0;
    const ns = magnitude > 0 ? s / magnitude : 0;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    c.velocity.x = (-sin * nf + cos * ns) * speed;
    c.velocity.z = plane === 'worldXY' ? 0 : (-cos * nf - sin * ns) * speed;

    if (c.input.jump && c.grounded) {
      // The takeoff frame pays NO gravity: the jump force is what the character leaves the ground with.
      c.velocity.y = c.jumpForce;
      c.grounded = false;
    } else {
      c.velocity.y -= c.gravity * delta;
    }

    const position = entity.threeObject.position;
    position.x += c.velocity.x * delta;
    if (plane !== 'worldXY') position.z += c.velocity.z * delta;
    position.y += c.velocity.y * delta;

    // Landing is a clamp, not an approximation: at or below the ground plane with downward velocity, the
    // character is set exactly on it, vertical velocity zeroed, and grounded restored.
    if (position.y <= entry.groundY && c.velocity.y <= 0) {
      position.y = entry.groundY;
      c.velocity.y = 0;
      c.grounded = true;
    }

    // `custom` keeps its own state: the type exists for callers that run their own state machine, and
    // overwriting what they wrote would make the declared literal `'custom'` unreachable.
    if (c.type !== 'custom') {
      if (!c.grounded) c.state = c.velocity.y > 0 ? 'jump' : 'fall';
      else if (c.input.crouch) c.state = 'crouch';
      else if (magnitude > 0) c.state = c.input.run ? 'run' : 'walk';
      else c.state = 'idle';
    }

    entity.threeObject.updateMatrix();
  }

  /**
   * The cinematic subsystem: advance the one playing sequence and put its camera where the shot says.
   * It was the last comment-shaped hole inside `simulateFrame` (M5 v117 gave `CinematicSequence`,
   * `CinematicShot` and `SerializedCinematic` their first readers).
   *
   * Three decisions are worth naming, because each one is a reading of a declared type rather than a
   * preference: the playhead stops when its scene stops being the active one (a shot's `cameraId` means
   * one scene's camera set, and a dormant scene is not being drawn); the camera switch fires on a CHANGE
   * of shot index, which is the only behavior `'cut'` can have when one camera is rendered per frame; and
   * the path is sampled by ARC length (`getPointAt`), so a shot's `startTime`/`endTime` say when the move
   * happens and the curve's own geometry says how fast the camera covers it.
   */
  private updateCinematics(delta: number): void {
    const entry = this.playingCinematic();
    if (!entry) return;
    const { sequence } = entry;
    if (this.sceneGraph.activeSceneId !== entry.sceneId) {
      // Not an error and not a pause-with-hope: the sequence is over as far as this runtime is concerned,
      // because the only thing that could finish it — its own scene being looked at — has gone away. The
      // playhead keeps its position, so a caller that switches back can `playCinematic` from where it is.
      sequence.playing = false;
      this.emit('cinematicInterrupted', {
        sequenceId: sequence.id,
        time: entry.time,
        reason: `scene ${entry.sceneId} is no longer the active scene, and this sequence's shots address its cameras`,
      });
      return;
    }
    const scene = this.sceneGraph.scenes.get(entry.sceneId)!;
    entry.time = Math.min(entry.time + delta, sequence.duration);

    const index = shotIndexAt(sequence.shots, entry.time);
    const shot = sequence.shots[index]!;
    if (index !== entry.lastShot) {
      entry.lastShot = index;
      sequence.currentShot = index;
      this.setActiveCamera(entry.sceneId, shot.cameraId);
      this.emit('cinematicShotChanged', {
        sequenceId: sequence.id, shotIndex: index, shotId: shot.id, cameraId: shot.cameraId,
      });
    }

    const camera = scene.cameras.get(shot.cameraId)!;
    const span = shot.endTime - shot.startTime;
    const local = Math.min(Math.max((entry.time - shot.startTime) / span, 0), 1);
    if (shot.cameraPath) camera.threeCamera.position.copy(shot.cameraPath.getPointAt(local));
    // `lookAt` reads the position it was just given, so an aiming path has to run after a moving one.
    if (shot.targetPath) camera.threeCamera.lookAt(shot.targetPath.getPointAt(local));
    if (shot.fovAnimation && camera.threeCamera instanceof THREE.PerspectiveCamera) {
      const { start, end, easing } = shot.fovAnimation;
      camera.threeCamera.fov = start + (end - start) * CINEMATIC_EASINGS[easing]!(local);
      camera.threeCamera.updateProjectionMatrix();
    }

    if (entry.time >= sequence.duration) {
      sequence.playing = false;
      this.emit('cinematicFinished', { sequenceId: sequence.id, time: entry.time, duration: sequence.duration });
    }
  }

  // ── declared world physics ────────────────────────────────────────────────────────────────────

  /**
   * Declare the world a scene integrates in, and validate it HERE, because a value this model cannot
   * express has to refuse rather than be read as zero. A controller carries gravity as a positive
   * magnitude applied on -y: a vector pointing up has no scalar reading (the sign would be a guess about
   * what the caller meant), and a vector with horizontal components has no scalar reading at all — this
   * package has no per-body dynamics to apply them to. `timeStep` of 0 would ask the accumulator for an
   * infinite number of slices, and `maxSubSteps` below 1 would ask a frame to run none.
   *
   * The stored gravity is a CLONE, so the caller's vector moving later does not silently change the
   * world mid-game. The object returned IS the scene's own — change the world through another
   * `setScenePhysics`, not by reaching around it.
   */
  setScenePhysics(sceneId: SceneId, physics: PhysicsConfig): PhysicsConfig {
    const scene = this.sceneGraph.scenes.get(sceneId);
    if (!scene) throw new Error(`setScenePhysics: scene ${sceneId} does not exist`);
    const g = physics.gravity;
    if (!(g.y <= 0)) {
      throw new Error(`setScenePhysics: gravity.y is ${g.y}; a controller applies gravity as a positive magnitude on -y and will not guess your sign — name gravity.y <= 0 (a falling world uses a negative y, a zero-G world uses 0), or give each controller its own gravity`);
    }
    if (g.x !== 0 || g.z !== 0) {
      throw new Error(`setScenePhysics: gravity has horizontal components (${g.x}, ${g.z}) that a scalar controller gravity cannot carry; a character on a ground plane has no body for them to push`);
    }
    if (!(physics.timeStep > 0)) {
      throw new Error(`setScenePhysics: timeStep is the fixed slice the integrator runs, so it must be a positive number of seconds; got ${physics.timeStep}`);
    }
    if (!Number.isInteger(physics.maxSubSteps) || physics.maxSubSteps < 1) {
      throw new Error(`setScenePhysics: maxSubSteps bounds how many fixed slices ONE frame may run, so it must be a whole number >= 1; got ${physics.maxSubSteps}`);
    }
    scene.physics = { ...physics, gravity: g.clone() };
    // A new world needs a new backlog AND a new frame record: keeping either would let the next frame
    // report, or spend, time measured against a step size that no longer exists.
    this.physicsAccumulators.delete(scene.id);
    this.physicsFrames.delete(scene.id);
    return scene.physics;
  }

  /** The scene's pull read the only way this model can: `-gravity.y`, or the package default when the
   *  scene declares no world. */
  private worldGravityFor(sceneId: SceneId): number {
    const physics = this.sceneGraph.scenes.get(sceneId)?.physics;
    return physics ? -physics.gravity.y : DEFAULT_CONTROLLER.gravity;
  }

  /**
   * What the declared physics of a scene actually buys. `consulted` and `unhonored` come from the shipped
   * tables, `effectiveGravity` and `stepping` come from the live scene and the last frame, so the answer
   * moves when the world moves — and the suite requires these two lists to cover every field
   * `PhysicsConfig` DECLARES (read out of `src/types.ts`), which is what stops a new declared field from
   * joining the silent ones.
   */
  physicsFieldAudit(sceneId: SceneId): PhysicsFieldAudit | undefined {
    const scene = this.sceneGraph.scenes.get(sceneId);
    if (!scene) return undefined;
    const physics = scene.physics;
    return {
      declared: physics !== undefined,
      consulted: physics ? [...HONORED_PHYSICS_FIELDS].sort() : [],
      unhonored: physics ? UNHONORED_PHYSICS_REASONS.map((r) => ({ ...r })) : [],
      effectiveGravity: this.worldGravityFor(scene.id),
      stepping: {
        timeStep: physics?.timeStep ?? null,
        maxSubSteps: physics?.maxSubSteps ?? null,
        lastFrame: physics ? this.physicsFrames.get(scene.id) ?? null : null,
      },
    };
  }

  // ── controller registry ───────────────────────────────────────────────────────────────────────

  /** Attach a character controller to `entity`. Throws naming the id when the scene or entity is not
   *  there, and refuses a second controller on one entity instead of replacing it silently. */
  attachController(sceneId: SceneId, entity: EntityId, options: ControllerAttachOptions = {}): CharacterController {
    if (!this.sceneGraph.scenes.get(sceneId)) {
      throw new Error(`attachController: scene ${sceneId} does not exist (entity ${entity})`);
    }
    const target = this.getEntity(sceneId, entity);
    if (!target) throw new Error(`attachController: entity ${entity} is not in scene ${sceneId}`);
    if (this.controllers.has(entity)) {
      throw new Error(`attachController: entity ${entity} already has a controller; detachController(${entity}) first`);
    }
    const groundY = options.groundY ?? DEFAULT_CONTROLLER.groundY;
    const controller: CharacterController = {
      entityId: entity,
      type: options.type ?? DEFAULT_CONTROLLER.type,
      speed: options.speed ?? DEFAULT_CONTROLLER.speed,
      runSpeed: options.runSpeed ?? DEFAULT_CONTROLLER.runSpeed,
      jumpForce: options.jumpForce ?? DEFAULT_CONTROLLER.jumpForce,
      gravity: options.gravity ?? this.worldGravityFor(sceneId),
      airControl: options.airControl ?? DEFAULT_CONTROLLER.airControl,
      slopeLimit: options.slopeLimit ?? DEFAULT_CONTROLLER.slopeLimit,
      stepOffset: options.stepOffset ?? DEFAULT_CONTROLLER.stepOffset,
      // `grounded` is READ FROM THE POSITION, not assumed true — a controller attached in mid-air that
      // reported itself grounded would let a caller press jump and never see a fall.
      grounded: target.threeObject.position.y <= groundY,
      velocity: new THREE.Vector3(),
      input: { ...emptyControllerInput(), ...options.input },
      state: 'idle',
    };
    this.controllers.set(entity, { controller, groundY, gravityDeclared: options.gravity !== undefined });
    this.emit('controllerAttached', { entityId: entity, controller });
    return controller;
  }

  detachController(entity: EntityId): boolean {
    const removed = this.controllers.delete(entity);
    if (removed) this.emit('controllerDetached', { entityId: entity });
    return removed;
  }

  /** The live controller for `entity`, or `undefined`. An entry whose entity is gone is dropped here, so
   *  `getController` can never hand back a controller that has nothing to move. */
  getController(entity: EntityId): CharacterController | undefined {
    return this.resolveController(entity)?.controller;
  }

  /** Write input flags between frames. Returns false when there is no controller for `entity`. */
  setControllerInput(entity: EntityId, input: Partial<ControllerInput>): boolean {
    const entry = this.resolveController(entity);
    if (!entry) return false;
    Object.assign(entry.controller.input, input);
    return true;
  }

  /**
   * Report, from the object the caller attached, which declared fields the integrator CONSULTS, which it
   * WRITES, and which it touches in NEITHER direction — plus the same split for the input flags, narrowed
   * by the controller's plane. Nothing here is hand-listed for a particular controller: every list is
   * derived from `Object.keys` of the live object against the shipped field tables, so a field added to
   * the type with no implementation lands in `untouched` automatically.
   */
  controllerFieldAudit(entity: EntityId): ControllerFieldAudit | undefined {
    const entry = this.resolveController(entity);
    if (!entry) return undefined;
    const names = Object.keys(entry.controller);
    const plane = MOVEMENT_PLANE[entry.controller.type];
    const inputRead = plane === 'worldXY'
      ? READ_INPUT_FLAGS.filter((flag) => flag !== 'moveForward' && flag !== 'moveBackward')
      : [...READ_INPUT_FLAGS];
    const consult = (list: readonly string[]) => names.filter((n) => list.includes(n)).sort();
    return {
      consulted: consult(READ_CONTROLLER_FIELDS),
      written: consult(WRITTEN_CONTROLLER_FIELDS),
      untouched: names.filter((n) => !READ_CONTROLLER_FIELDS.includes(n) && !WRITTEN_CONTROLLER_FIELDS.includes(n)).sort(),
      input: {
        consulted: inputRead.slice().sort(),
        untouched: [...new Set([...READ_INPUT_FLAGS, 'custom'])].filter((flag) => !inputRead.includes(flag)).sort(),
      },
    };
  }

  private resolveController(entity: EntityId): ControllerEntry | undefined {
    const entry = this.controllers.get(entity);
    if (!entry) return undefined;
    for (const scene of this.sceneGraph.scenes.values()) {
      if (scene.entities.has(entity)) return entry;
    }
    this.controllers.delete(entity);
    this.emit('controllerOrphaned', { entityId: entity });
    return undefined;
  }

  // ── cinematic sequences ───────────────────────────────────────────────────────────────────────

  /**
   * Register a sequence against `sceneId` and validate it HERE, for the same reason `setScenePhysics`
   * validates a world: a shot whose value this player cannot perform has to refuse at the door rather than
   * be read as something else at play time. So `defineCinematic` refuses a shot that names a camera the
   * scene does not have, a timeline with a gap or an overlap (two shots claiming one instant leave no
   * answer to which camera is showing), a `transition` other than `'cut'` (blending needs two rendered
   * images and this runtime draws one active camera per frame), a non-zero `transitionDuration` (nothing
   * would time it), an `fovAnimation` on an orthographic camera (there is no `fov` to write), a field of
   * view outside (0, 180) (the projection matrix goes degenerate), an easing word it does not implement
   * (reading it as linear would be a guess about what the caller meant), and a zero-length path (an arc
   * parameter divided by the arc it does not have).
   *
   * `duration` is DERIVED from the shots. A caller may name it, and then it has to agree; a declared
   * duration that disagreed with its own timeline would be two answers to "when does this end", and the
   * save shape has one field for it.
   *
   * The shot ARRAY is copied, so a caller pushing another shot later cannot move a registered timeline.
   * The shot objects are not copied — a path is a live `THREE.CatmullRomCurve3`, and rebuilding one from
   * stored points is the job `saveFeasibilityAudit` still lists as missing.
   */
  defineCinematic(sceneId: SceneId, input: CinematicSequenceInput): CinematicSequence {
    const scene = this.sceneGraph.scenes.get(sceneId);
    if (!scene) throw new Error(`defineCinematic: scene ${sceneId} does not exist`);
    if (this.cinematics.has(input.id)) {
      throw new Error(`defineCinematic: a sequence named ${input.id} is already registered, and this runtime has no way to unregister one — choose a new id`);
    }
    const shots = [...input.shots];
    if (shots.length === 0) {
      throw new Error(`defineCinematic("${input.id}"): a sequence with no shots has no timeline to play, and \`duration\` would be 0 with nothing on camera`);
    }
    if (shots[0]!.startTime !== 0) {
      throw new Error(`defineCinematic("${input.id}"): the first shot starts at ${shots[0]!.startTime}; a sequence must open at playhead 0 or the frames before it show nothing while the type claims a shot is playing`);
    }
    let cursor = 0;
    for (const shot of shots) {
      if (shot.startTime < cursor) {
        throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} starts at ${shot.startTime}, at or before the previous shot's ${cursor} — two shots claiming one playhead instant have no single answer to which camera is showing`);
      }
      if (!(shot.endTime > shot.startTime)) {
        throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} runs ${shot.startTime} → ${shot.endTime}; progress inside a shot divides by its own length, so it must end after it starts`);
      }
      const camera = scene.cameras.get(shot.cameraId);
      if (!camera) {
        throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} names camera ${shot.cameraId}, which is not in scene ${sceneId}. A sequence is registered against ONE scene because its shot ids address that scene's cameras and nothing else`);
      }
      if (shot.transition !== 'cut') {
        throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} asks for a '${shot.transition}' transition. This player switches the active camera and draws one camera per frame, so a blend has no two images to blend — only 'cut' is available`);
      }
      if (shot.transitionDuration !== 0) {
        throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} declares transitionDuration ${shot.transitionDuration} while the only available transition is an instantaneous cut; a duration that nothing times is refused rather than accepted and ignored`);
      }
      const fov = shot.fovAnimation;
      if (fov) {
        if (!(camera.threeCamera instanceof THREE.PerspectiveCamera)) {
          throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} animates the field of view of camera ${shot.cameraId}, which is ${camera.type}; an orthographic camera has no "fov" to write`);
        }
        for (const [which, value] of [['start', fov.start], ['end', fov.end]] as const) {
          if (!Number.isFinite(value) || value <= 0 || value >= 180) {
            throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} fovAnimation.${which} is ${value}; a PerspectiveCamera fov must be finite and strictly between 0 and 180, or updateProjectionMatrix builds a degenerate matrix`);
          }
        }
        if (!(fov.easing in CINEMATIC_EASINGS)) {
          throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} fovAnimation names easing "${fov.easing}". The easings this package implements are ${Object.keys(CINEMATIC_EASINGS).sort().map((n) => `"${n}"`).join(', ')} — an unknown word would be read as linear, which is a guess about what you meant`);
        }
      }
      for (const [name, path] of [['cameraPath', shot.cameraPath], ['targetPath', shot.targetPath]] as const) {
        if (path && !(path.getLength() > 0)) {
          throw new Error(`defineCinematic("${input.id}"): shot ${shot.id} ${name} has no length; the camera is placed by arc position along it, so a path with no arc has no position to return`);
        }
      }
      cursor = shot.endTime;
    }
    const duration = cursor;
    if (input.duration !== undefined && input.duration !== duration) {
      throw new Error(`defineCinematic("${input.id}"): duration is declared ${input.duration} but the shots run to ${duration}. The timeline the shots describe wins — name a matching number, or name none`);
    }

    const sequence: CinematicSequence = { id: input.id, name: input.name, shots, duration, currentShot: 0, playing: false };
    this.cinematics.set(sequence.id, { sequence, sceneId, time: 0, lastShot: -1 });
    this.emit('cinematicDefined', { sequenceId: sequence.id, sceneId, shotCount: shots.length, duration });
    return sequence;
  }

  /** The single playing sequence, DERIVED from `sequence.playing` rather than stored beside it. Two
   *  sources for one fact can disagree, and `SerializedCinematic.activeSequence` is a single id: a runtime
   *  that could not answer "which one" uniquely would have nothing honest to put in that field. */
  private playingCinematic(): CinematicEntry | undefined {
    for (const entry of this.cinematics.values()) {
      if (entry.sequence.playing) return entry;
    }
    return undefined;
  }

  /**
   * Start (or restart) a sequence. Returns false when another one holds the single active slot — see
   * `cinematicFieldAudit`'s `playhead.blockedBy`, which names it — and throws when the request cannot mean
   * anything: an unregistered id, or a sequence whose scene is not the active one.
   *
   * Replaying a finished sequence rewinds its playhead first; stopping one does NOT, because a stop is a
   * caller interrupting a cutscene, not a request to watch it again.
   */
  playCinematic(id: string): boolean {
    const entry = this.cinematics.get(id);
    if (!entry) throw new Error(`playCinematic: no sequence named ${id} is registered`);
    if (this.sceneGraph.activeSceneId !== entry.sceneId) {
      throw new Error(`playCinematic: "${id}" belongs to scene ${entry.sceneId}, which is not the active scene (${this.sceneGraph.activeSceneId ?? 'none'}); its shots address that scene's cameras`);
    }
    if (entry.sequence.playing) return false;
    if (this.playingCinematic()) return false;
    if (entry.time >= entry.sequence.duration) {
      entry.time = 0;
      entry.lastShot = -1;
    }
    entry.sequence.playing = true;
    this.emit('cinematicPlayed', { sequenceId: id, time: entry.time, duration: entry.sequence.duration });
    return true;
  }

  /** Stop a playing sequence where its playhead stands. False when it was not playing. */
  stopCinematic(id: string): boolean {
    const entry = this.cinematics.get(id);
    if (!entry || !entry.sequence.playing) return false;
    entry.sequence.playing = false;
    this.emit('cinematicStopped', { sequenceId: id, time: entry.time, duration: entry.sequence.duration });
    return true;
  }

  /** The live answer for the `SerializedCinematic` shape — all three of its fields, filled from the
   *  registry rather than invented. This is the first WRITER the declared save type has ever had, and it is
   *  still not a save: `saveFeasibilityAudit` keeps `cinematic` in `blocked` because the map's values are
   *  the live sequence objects, whose shot paths are curves nothing here rebuilds from points. */
  cinematicSnapshot(): SerializedCinematic {
    const sequences = new Map<string, CinematicSequence>();
    for (const [id, entry] of this.cinematics) sequences.set(id, entry.sequence);
    const playing = this.playingCinematic();
    return {
      sequences,
      activeSequence: playing?.sequence.id ?? null,
      currentTime: playing?.time ?? 0,
    };
  }

  /** What declaring a sequence actually buys, in the same shape as `physicsFieldAudit`. */
  cinematicFieldAudit(id: string): CinematicFieldAudit | undefined {
    const entry = this.cinematics.get(id);
    if (!entry) return undefined;
    const { sequence } = entry;
    const names = Object.keys(sequence);
    const showing = entry.lastShot < 0 ? undefined : sequence.shots[entry.lastShot];
    const other = this.playingCinematic();
    return {
      consulted: [...HONORED_SHOT_FIELDS].sort(),
      unhonored: UNHONORED_SHOT_REASONS.map((r) => ({ ...r })),
      sequenceRead: names.filter((n) => READ_SEQUENCE_FIELDS.includes(n)).sort(),
      sequenceWritten: names.filter((n) => WRITTEN_SEQUENCE_FIELDS.includes(n)).sort(),
      playhead: {
        playing: sequence.playing,
        time: entry.time,
        duration: sequence.duration,
        // `currentShot` is the declared field, which has no way to say "nothing yet" and so sits at 0
        // before the first frame; `shotId` is the audit's answer to what the camera is actually showing.
        currentShot: sequence.currentShot,
        shotId: showing?.id ?? null,
        cameraId: showing?.cameraId ?? null,
        blockedBy: other && other !== entry ? other.sequence.id : null,
      },
    };
  }

  private updateStats(): void {
    if (!this.backend || !this.sceneGraph.stats) return;
    const info = this.backend.stats;
    this.sceneGraph.stats.drawCalls = info.calls;
    this.sceneGraph.stats.triangles = info.triangles;
    this.sceneGraph.stats.points = info.points;
    this.sceneGraph.stats.lines = info.lines;
  }

  addEventListener(event: string, listener: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  removeEventListener(event: string, listener: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    }
  }

  private emit(event: string, data?: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      }
    }
  }

  /** The wrapped WebGL renderer, or null under a backend that owns none (e.g. headless). */
  getRenderer(): THREE.WebGLRenderer | null {
    return this.backend?.raw ?? null;
  }

  /** The backend in force — `null` before `initialize()`. Callers that must know which
   *  implementation is drawing (rather than assuming WebGL) should read `getBackend()?.kind`. */
  getBackend(): RenderBackend | null {
    return this.backend;
  }

  getSceneGraph(): SceneGraph {
    return this.sceneGraph;
  }

  dispose(): void {
    this.stop();

    for (const scene of this.sceneGraph.scenes.values()) {
      for (const entity of scene.entities.values()) {
        this.disposeSubtree(entity.threeObject);
      }
      scene.threeScene.clear();
    }

    this.sceneGraph.scenes.clear();
    // Controllers live in a registry keyed by entity id, not in a scene's entity map, so clearing the
    // scenes would otherwise strand them. Clearing here (rather than orphan-walking) is deliberate: the
    // entities are already gone, and a dispose is not a caller losing one entity under a live controller.
    this.controllers.clear();
    // Same reason as the controllers: a sequence is registered by id against a scene that no longer
    // exists, so keeping it would let `playCinematic` answer for cameras that are gone.
    this.cinematics.clear();

    if (this.backend) {
      this.backend.dispose();
      this.backend = null;
    }

    this.canvas = null;
    this.emit('disposed');
  }
}

/** Construction options. `backend` and `scheduler` are the host seams (M5 v108); omit both for a
 *  browser (WebGL + `requestAnimationFrame`). */
export interface ThreeRuntimeOptions {
  backend?: RenderBackendFactory;
  scheduler?: FrameScheduler;
}

export function createThreeRuntime(
  config: Partial<ThreeRuntimeConfig> = {},
  options: ThreeRuntimeOptions = {},
): ThreeRuntime {
  return new ThreeRuntime(config, options);
}