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
} from './types.js';
import {
  createWebGLBackend,
  defaultFrameScheduler,
  type FrameScheduler,
  type RenderBackend,
  type RenderBackendFactory,
} from './renderBackend.js';

export { DEFAULT_THREE_CONFIG };

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
    const scene = this.sceneGraph.scenes.get(sceneId);
    if (!scene) throw new Error(`Scene ${sceneId} not found`);

    const entityIdValue = entityId(`entity-${Date.now()}-${Math.random().toString(36).slice(2)}`);

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
      id: entityIdValue,
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

    scene.entities.set(entityIdValue, entity);
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

    this.updateAnimations(delta);
    this.updatePhysics(delta);
    this.updateControllers(delta);
    this.updateCinematics(delta);

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

  private updatePhysics(delta: number): void {
    // Physics update would go here
  }

  private updateControllers(delta: number): void {
    // Character controller update would go here
  }

  private updateCinematics(delta: number): void {
    // Cinematic sequence update would go here
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