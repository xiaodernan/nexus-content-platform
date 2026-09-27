import * as THREE from 'three';

export type EntityId = string & { readonly __brand: unique symbol };
export type SceneId = string & { readonly __brand: unique symbol };
export type CameraId = string & { readonly __brand: unique symbol };
export type AnimationId = string & { readonly __brand: unique symbol };

export function entityId(id: string): EntityId { return id as EntityId; }
export function sceneId(id: string): SceneId { return id as SceneId; }
export function cameraId(id: string): CameraId { return id as CameraId; }
export function animationId(id: string): AnimationId { return id as AnimationId; }

export interface ThreeScene {
  id: SceneId;
  name: string;
  threeScene: THREE.Scene;
  entities: Map<EntityId, ThreeEntity>;
  cameras: Map<CameraId, ThreeCamera>;
  animations: Map<AnimationId, ThreeAnimation>;
  lighting: LightingConfig;
  physics?: PhysicsConfig;
  metadata: Record<string, unknown>;
}

export interface ThreeEntity {
  id: EntityId;
  name: string;
  type: 'mesh' | 'group' | 'sprite' | 'points' | 'line' | 'bone' | 'skinnedMesh';
  threeObject: THREE.Object3D;
  components: Map<string, EntityComponent>;
  transform: Transform;
  visible: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  layers: number;
  userData: Record<string, unknown>;
}

export interface EntityComponent {
  type: string;
  data: Record<string, unknown>;
  enabled: boolean;
}

export interface Transform {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  matrix: THREE.Matrix4;
  matrixWorld: THREE.Matrix4;
}

export interface ThreeCamera {
  id: CameraId;
  name: string;
  type: 'perspective' | 'orthographic';
  threeCamera: THREE.Camera;
  active: boolean;
  viewport: { x: number; y: number; width: number; height: number };
  postProcessing?: PostProcessingConfig;
}

export interface LightingConfig {
  ambient: THREE.Color;
  ambientIntensity: number;
  shadows: boolean;
  shadowMapType: THREE.ShadowMapType;
  lights: LightConfig[];
}

export interface LightConfig {
  id: string;
  type: 'ambient' | 'directional' | 'point' | 'spot' | 'hemisphere' | 'rectArea';
  threeLight: THREE.Light;
  enabled: boolean;
  castShadow: boolean;
}

export interface PhysicsConfig {
  gravity: THREE.Vector3;
  timeStep: number;
  maxSubSteps: number;
  broadphase: 'sap' | 'grid' | 'dynamic';
  solverIterations: number;
}

export interface PostProcessingConfig {
  enabled: boolean;
  passes: PostProcessingPass[];
}

export interface PostProcessingPass {
  type: 'bloom' | 'ssao' | 'fxaa' | 'tonemap' | 'colorCorrection' | 'vignette' | 'custom';
  enabled: boolean;
  parameters: Record<string, unknown>;
}

export interface ThreeAnimation {
  id: AnimationId;
  name: string;
  threeAnimation: THREE.AnimationAction;
  mixer: THREE.AnimationMixer;
  clips: THREE.AnimationClip[];
  playing: boolean;
  loop: THREE.AnimationActionLoopStyles;
  weight: number;
  timeScale: number;
}

export interface SceneGraph {
  scenes: Map<SceneId, ThreeScene>;
  activeSceneId: SceneId | null;
  renderTarget?: THREE.WebGLRenderTarget;
  renderer?: THREE.WebGLRenderer;
  clock: THREE.Clock;
  stats?: {
    fps: number;
    drawCalls: number;
    triangles: number;
    points: number;
    lines: number;
  };
}

export interface CinematicSequence {
  id: string;
  name: string;
  shots: CinematicShot[];
  duration: number;
  currentShot: number;
  playing: boolean;
}

export interface CinematicShot {
  id: string;
  cameraId: CameraId;
  startTime: number;
  endTime: number;
  transition: 'cut' | 'fade' | 'dissolve' | 'wipe' | 'slide';
  transitionDuration: number;
  cameraPath?: THREE.CatmullRomCurve3;
  targetPath?: THREE.CatmullRomCurve3;
  fovAnimation?: { start: number; end: number; easing: string };
  postProcessing?: PostProcessingConfig;
}

export interface CharacterController {
  entityId: EntityId;
  type: 'firstPerson' | 'thirdPerson' | 'topDown' | 'sideScroll' | 'custom';
  speed: number;
  runSpeed: number;
  jumpForce: number;
  gravity: number;
  airControl: number;
  slopeLimit: number;
  stepOffset: number;
  grounded: boolean;
  velocity: THREE.Vector3;
  input: ControllerInput;
  state: 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'crouch' | 'custom';
}

export interface ControllerInput {
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  jump: boolean;
  run: boolean;
  crouch: boolean;
  custom: Record<string, boolean>;
}

export interface CombatSystem {
  entities: Map<EntityId, CombatEntity>;
  projectiles: Map<EntityId, Projectile>;
  hitboxes: Map<EntityId, Hitbox>;
  damageNumbers: DamageNumber[];
}

export interface CombatEntity {
  entityId: EntityId;
  health: number;
  maxHealth: number;
  armor: number;
  attackPower: number;
  attackSpeed: number;
  attackRange: number;
  attackType: 'melee' | 'ranged' | 'magic' | 'area';
  cooldowns: Map<string, number>;
  statusEffects: StatusEffect[];
  target: EntityId | null;
  faction: string;
  aiState: 'idle' | 'patrol' | 'chase' | 'attack' | 'flee' | 'dead';
}

export interface Projectile {
  entityId: EntityId;
  ownerId: EntityId;
  damage: number;
  speed: number;
  lifetime: number;
  maxDistance: number;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  hitEntities: EntityId[];
  onHit: (target: EntityId) => void;
}

export interface Hitbox {
  entityId: EntityId;
  shape: 'box' | 'sphere' | 'capsule' | 'mesh';
  offset: THREE.Vector3;
  size: THREE.Vector3;
  rotation: THREE.Euler;
  layer: number;
  mask: number;
  onHit: (other: EntityId, point: THREE.Vector3, normal: THREE.Vector3) => void;
}

export interface StatusEffect {
  id: string;
  type: 'buff' | 'debuff' | 'dot' | 'hot' | 'stun' | 'slow' | 'root' | 'silence' | 'custom';
  name: string;
  duration: number;
  remainingTime: number;
  magnitude: number;
  stackable: boolean;
  maxStacks: number;
  currentStacks: number;
  onApply: (entity: EntityId) => void;
  onRemove: (entity: EntityId) => void;
  onTick: (entity: EntityId, deltaTime: number) => void;
}

export interface DamageNumber {
  id: string;
  targetId: EntityId;
  amount: number;
  type: 'normal' | 'critical' | 'heal' | 'miss' | 'block' | 'absorb';
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  lifetime: number;
  color: THREE.Color;
  size: number;
}

export interface NPCSystem {
  npcs: Map<EntityId, NPC>;
  factions: Map<string, FactionRelation>;
  dialogueSystem: DialogueSystem;
  questSystem: QuestSystem;
  scheduler: NPCTaskScheduler;
}

export interface NPC {
  entityId: EntityId;
  name: string;
  archetype: string;
  personality: PersonalityTraits;
  schedule: NPCTask[];
  currentTask: NPCTask | null;
  homeLocation: THREE.Vector3;
  wanderRadius: number;
  faction: string;
  reputation: Map<string, number>;
  inventory: InventoryItem[];
  dialogueTree: DialogueNode[];
  quests: Quest[];
}

export interface PersonalityTraits {
  aggression: number;
  curiosity: number;
  sociability: number;
  bravery: number;
  intelligence: number;
  loyalty: number;
}

export interface NPCTask {
  id: string;
  type: 'idle' | 'wander' | 'patrol' | 'goto' | 'interact' | 'work' | 'sleep' | 'eat' | 'socialize' | 'custom';
  priority: number;
  location?: THREE.Vector3;
  targetEntity?: EntityId;
  duration: number;
  startTime: number;
  repeatable: boolean;
  conditions: TaskCondition[];
  onComplete: (npc: EntityId) => void;
}

export interface TaskCondition {
  type: 'time' | 'location' | 'entity' | 'item' | 'quest' | 'reputation' | 'custom';
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'not_contains';
  value: unknown;
}

export interface FactionRelation {
  factionId: string;
  name: string;
  relations: Map<string, number>;
}

export interface DialogueSystem {
  activeDialogue: DialogueSession | null;
  dialogues: Map<string, DialogueTree>;
}

export interface DialogueTree {
  id: string;
  name: string;
  startNode: string;
  nodes: Map<string, DialogueNode>;
}

export interface DialogueNode {
  id: string;
  speaker: 'npc' | 'player' | 'system';
  text: string;
  conditions: TaskCondition[];
  choices: DialogueChoice[];
  actions: DialogueAction[];
  nextNode?: string;
}

export interface DialogueChoice {
  id: string;
  text: string;
  conditions: TaskCondition[];
  nextNode: string;
  actions: DialogueAction[];
}

export interface DialogueAction {
  type: 'give_item' | 'take_item' | 'start_quest' | 'complete_quest' | 'change_reputation' | 'teleport' | 'spawn_entity' | 'play_animation' | 'custom';
  parameters: Record<string, unknown>;
}

export interface DialogueSession {
  treeId: string;
  currentNodeId: string;
  participantId: EntityId;
  variables: Map<string, unknown>;
}

export interface QuestSystem {
  quests: Map<string, Quest>;
  activeQuests: Map<EntityId, string[]>;
  completedQuests: Map<EntityId, string[]>;
}

export interface Quest {
  id: string;
  name: string;
  description: string;
  type: 'main' | 'side' | 'daily' | 'weekly' | 'event' | 'custom';
  objectives: QuestObjective[];
  rewards: QuestReward[];
  prerequisites: string[];
  repeatable: boolean;
  timeLimit: number;
  autoComplete: boolean;
}

export interface QuestObjective {
  id: string;
  type: 'kill' | 'collect' | 'deliver' | 'talk' | 'go_to' | 'use' | 'craft' | 'discover' | 'survive' | 'custom';
  target: string;
  count: number;
  currentCount: number;
  location?: THREE.Vector3;
  description: string;
  optional: boolean;
  hidden: boolean;
}

export interface QuestReward {
  type: 'item' | 'currency' | 'experience' | 'reputation' | 'skill_point' | 'unlock' | 'custom';
  value: unknown;
  quantity: number;
}

export interface NPCTaskScheduler {
  queue: NPCTask[];
  running: Map<EntityId, NPCTask>;
  tickInterval: number;
}

export interface SaveSystem {
  version: string;
  saves: Map<string, SaveSlot>;
  currentSave: string | null;
  autoSaveInterval: number;
  maxSaves: number;
}

export interface SaveSlot {
  id: string;
  name: string;
  timestamp: number;
  version: string;
  playtime: number;
  screenshot: string;
  data: SaveData;
}

export interface SaveData {
  sceneGraph: SerializedSceneGraph;
  entities: Map<EntityId, SerializedEntity>;
  npcs: Map<EntityId, SerializedNPC>;
  quests: SerializedQuestSystem;
  player: SerializedPlayer;
  worldState: Record<string, unknown>;
  cinematic: SerializedCinematic;
}

export interface SerializedSceneGraph {
  activeSceneId: SceneId | null;
  scenes: Map<SceneId, SerializedScene>;
}

export interface SerializedScene {
  id: SceneId;
  name: string;
  entities: EntityId[];
  cameras: CameraId[];
  lighting: LightingConfig;
  physics?: PhysicsConfig;
}

export interface SerializedEntity {
  id: EntityId;
  name: string;
  type: ThreeEntity['type'];
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  visible: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  components: Map<string, EntityComponent>;
  userData: Record<string, unknown>;
}

export interface SerializedNPC {
  entityId: EntityId;
  currentTask: NPCTask | null;
  schedule: NPCTask[];
  reputation: Map<string, number>;
  inventory: InventoryItem[];
}

export interface SerializedQuestSystem {
  activeQuests: Map<EntityId, string[]>;
  completedQuests: Map<EntityId, string[]>;
  questStates: Map<string, QuestState>;
}

export interface QuestState {
  questId: string;
  status: 'available' | 'active' | 'completed' | 'failed' | 'turned_in';
  objectives: Map<string, number>;
  startTime: number;
  endTime?: number;
}

export interface SerializedPlayer {
  entityId: EntityId;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  experience: number;
  level: number;
  inventory: InventoryItem[];
  skills: Map<string, number>;
  hotbar: (EntityId | null)[];
}

export interface SerializedCinematic {
  sequences: Map<string, CinematicSequence>;
  activeSequence: string | null;
  currentTime: number;
}

export interface InventoryItem {
  id: EntityId;
  name: string;
  type: 'weapon' | 'armor' | 'consumable' | 'tool' | 'key' | 'currency' | 'material' | 'quest' | 'custom';
  description: string;
  icon: string;
  stackable: boolean;
  maxStack: number;
  quantity: number;
  weight: number;
  value: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'artifact';
  attributes: Map<string, number>;
  requirements: Map<string, number>;
  effects: ItemEffect[];
  durability: number;
  maxDurability: number;
  enchantments: Enchantment[];
  socketedGems: (EntityId | null)[];
}

export interface ItemEffect {
  type: 'stat' | 'heal' | 'mana' | 'buff' | 'teleport' | 'spell' | 'summon' | 'transform' | 'custom';
  magnitude: number;
  duration: number;
  target: 'self' | 'target' | 'area' | 'global';
  conditions: TaskCondition[];
}

export interface Enchantment {
  id: string;
  name: string;
  type: 'prefix' | 'suffix' | 'intrinsic';
  stats: Map<string, number>;
  level: number;
  maxLevel: number;
}

export interface ThreeRuntimeConfig {
  renderer: {
    antialias: boolean;
    alpha: boolean;
    preserveDrawingBuffer: boolean;
    powerPreference: 'high-performance' | 'low-power' | 'default';
    stencil: boolean;
    depth: boolean;
    logarithmicDepthBuffer: boolean;
  };
  shadowMap: {
    enabled: boolean;
    type: THREE.ShadowMapType;
    autoUpdate: boolean;
  };
  toneMapping: THREE.ToneMapping;
  toneMappingExposure: number;
  colorSpace: THREE.ColorSpace;
  maxLights: number;
  frustumCulling: boolean;
  sortObjects: boolean;
}

export const DEFAULT_THREE_CONFIG: ThreeRuntimeConfig = {
  renderer: {
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
    stencil: true,
    depth: true,
    logarithmicDepthBuffer: false,
  },
  shadowMap: {
    enabled: true,
    type: THREE.PCFSoftShadowMap,
    autoUpdate: true,
  },
  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 1.0,
  colorSpace: THREE.SRGBColorSpace,
  maxLights: 100,
  frustumCulling: true,
  sortObjects: true,
};