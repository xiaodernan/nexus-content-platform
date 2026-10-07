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
  /** v202 — optional visual target this component controls. When disabled, this object is hidden. */
  targetObject?: THREE.Object3D;
  /** v203 — optional animation ids this component gates. When disabled, these animations pause. */
  animationIds?: AnimationId[];
}

/**
 * The save-shape of an entity component — excludes runtime-only fields (`targetObject`, `animationIds`)
 * that cannot be serialized to JSON. This is what `snapshotEntity` actually writes and what
 * `restoreEntity` reads back.
 */
export interface SerializedEntityComponent {
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

/**
 * v182 — what one pick answers: the entity under a view point, as the runtime knows it. `distance` is
 * along the pick ray, so an overlapping pair of bodies answers the NEARER one — the same rule a hand
 * and a mouse expect.
 */
export interface ScenePick {
  entityId: EntityId;
  name: string;
  distance: number;
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
  entities: [EntityId, SerializedEntity][];
  npcs: Map<EntityId, SerializedNPC>;
  quests: SerializedQuestSystem;
  player: Player | null;
  worldState: Record<string, unknown>;
  cinematic: SerializedCinematic;
}

/**
 * A save FILE — what actually goes to disk, as distinct from `SaveData`, the in-memory aggregate the engine
 * has never been able to fill. The difference is the point: a file has to survive `JSON.stringify`, so it
 * carries no `Map` and no live object anywhere in it, and it states which `SaveData` fields it holds
 * (`carries`) and which it does NOT (`doesNotCarry`, copied out of `saveFeasibilityAudit`'s blocked rows).
 *
 * `version` is a number the loader compares against its own, because a file written by a later runtime may
 * mean something this one cannot know. `savedAt` is the caller's clock: this package owns no time source and
 * would be inventing one to fill it.
 */
export interface SaveFile {
  format: 'nexus-three-runtime-save';
  version: number;
  savedAt: number;
  carries: string[];
  doesNotCarry: { field: string; needs: string }[];
  entities: [EntityId, SerializedEntity][];
  /** Every NPC record the scene holds, as [entityId, record] pairs — the same entry-array spelling
   *  `entities` uses, scoped to the same scene for the same reason, and referring only to ids that appear
   *  in `entities` (a record about a body the file does not carry would restore onto nothing). */
  npcs: [EntityId, SerializedNPC][];
  /** The scene's world state as a plain bag of named values, which is the shape `SaveData.worldState`
   *  declares and the shape a file keeps whole. Scoped to the scene like `entities` and `npcs`: state is
   *  a fact about the world the file describes, and a bag shared across scenes would put one scene's
   *  facts in another scene's file. */
  worldState: Record<string, unknown>;
  /** The scene's player, or `null` when the scene has none. The two are different claims and the loader tells
   *  them apart: `null` is this format saying "no player was attached", while a pre-v136 file has NO `player`
   *  key at all, which the loader reads as "this file predates the half" — see `loadSaveFile`, where the file's
   *  own `carries` decides whether an absent key is a load or the refusal of a claim it cannot back up. */
  player: SerializedPlayer | null;
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

/**
 * A `THREE.Vector3` as DATA. The save shape may not hold a live vector, and this is a measured claim, not a
 * style preference: `JSON.stringify` keeps the three numbers but loses the class, so what comes back off a
 * disk is a plain object whose methods are gone.
 */
export interface SerializedVector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * An `Euler` as data, ORDER INCLUDED. The order is not decoration — three.js reads it when it composes the
 * quaternion — and it is the reason a flattened `THREE.Euler` cannot be handed to `Euler.copy`: measured,
 * `JSON.stringify` writes an Euler as `_x/_y/_z/_order/isEuler`, so `copy` reads `x` as `undefined` and the
 * restored entity ends up pointing at NaN.
 */
export interface SerializedEuler {
  x: number;
  y: number;
  z: number;
  order: string;
}

export interface SerializedEntity {
  id: EntityId;
  name: string;
  type: ThreeEntity['type'];
  position: SerializedVector3;
  rotation: SerializedEuler;
  scale: SerializedVector3;
  visible: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  /** Declared by `ThreeEntity` and part of an entity's state, so the save shape has to carry it or a
   *  restore silently resets it. `saveFeasibilityAudit` would report it as dropped if this line or the
   *  matching line in `snapshotEntity` were removed — the claim is checked, not assumed. */
  layers: number;
  /** An ENTRY ARRAY, not a `Map`, for the same reason the transform fields are plain: a `Map` is written by
   *  `JSON.stringify` as `{}`, which is how a save with three components on it comes back with none. */
  components: [string, SerializedEntityComponent][];
  userData: Record<string, unknown>;
}

/**
 * An NPC record as FILE data — the shape a file's `npcs` list holds, spelled so it survives
 * `JSON.stringify`.
 *
 * The declared `NPC` carries fields backed by systems this package does not have — `schedule` and
 * `currentTask` (no task scheduler), `dialogueTree` (no dialogue system), `quests` (no quest system) — plus
 * an `inventory` whose `InventoryItem` holds two `Map`s of its own. Those are named by `npcFieldAudit` from
 * the live record, not by this comment, so the list cannot go stale beside an implementation. What is left
 * is the half a file can hold: identity, the social standing, and where the record calls home.
 */
export interface SerializedNPC {
  entityId: EntityId;
  name: string;
  archetype: string;
  personality: PersonalityTraits;
  homeLocation: SerializedVector3;
  wanderRadius: number;
  faction: string;
  /** An ENTRY ARRAY, not a `Map`, for the same reason `SerializedEntity.components` is: `JSON.stringify`
   *  writes a `Map` as `{}`, which is how a record with two standings on it comes back with none. */
  reputation: [string, number][];
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

/**
 * The LIVE player record — the one body a scene is played as, and the subject the runtime owns from v136.
 *
 * This interface is what `SaveData.player` names, and the reason it is a separate shape from
 * `SerializedPlayer` is the same reason `NPC` is separate from `SerializedNPC`: three of these fields are live
 * objects. `position` is a `THREE.Vector3`, `rotation` is a `THREE.Euler`, `skills` is a `Map` — measured by
 * v119, `JSON.stringify` flattens the first two into `_x/_y/_z/_order`-shaped plain objects and writes the third
 * as `{}`, so a record handed to a file would come back holding less than it was given.
 *
 * `inventory` is declared and not carried, for the reason `npcFieldAudit` says out loud about an NPC's bag of
 * the same type: `InventoryItem` holds two `Map`s of its own and no inventory system exists in this package.
 */
export interface Player {
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

/**
 * A `Player` as FILE data — the shape `SaveFile.player` holds, spelled so it survives `JSON.stringify`.
 *
 * Eleven of the twelve declared fields are here. `position`/`rotation` become the plain `SerializedVector3`/
 * `SerializedEuler` pair for the reason `SerializedEntity` spells out (a flattened live object restores as NaN
 * where `copy` reads `x`), and `skills` is an ENTRY ARRAY for the `Map` reason. `inventory` is the one left out,
 * and `playerFieldAudit` names it from the refusal table rather than from this comment, so the omission cannot
 * go quiet if the field ever stops being carried for a different reason.
 */
export interface SerializedPlayer {
  entityId: EntityId;
  position: SerializedVector3;
  rotation: SerializedEuler;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  experience: number;
  level: number;
  /** An ENTRY ARRAY, not a `Map`: `JSON.stringify` writes a `Map` as `{}`. */
  skills: [string, number][];
  /** The bodies in the quick slots, or `null` for an empty one. A slot naming an entity the file does not carry
   *  is refused by `restorePlayer`, because a hotbar pointing at nothing is a slot that cannot be used. */
  hotbar: (EntityId | null)[];
}

/**
 * What a health-changing call answers. A report rather than the record itself, because the caller has to know
 * what ACTUALLY happened: an overkill blow lands only the health that was there, and "died" is the crossing of
 * a boundary that a return value of "the new health" alone cannot express (0 is also what a second blow on a
 * corpse would report).
 */
export interface PlayerDamageReport {
  sceneId: SceneId;
  entityId: EntityId;
  /** What the caller asked for. */
  amount: number;
  /** What landed — `min(amount, health)`, so an overkill blow reports less than it asked for. */
  damage: number;
  health: number;
  maxHealth: number;
  /** True only on the call that took health from a positive number to zero. A blow on a corpse is not a death. */
  died: boolean;
  /** The caller's own word for what did it, or `''`. Never read by this runtime; carried so the event a
   *  listener receives names its own cause instead of leaving the listener to guess. */
  reason: string;
}

/** What `healPlayer` answers. `healed` is `min(amount, maxHealth - health)`, so a heal at full health is a
 *  report of zero rather than a refusal: asking for health a record already has is not an error. */
export interface PlayerHealReport {
  sceneId: SceneId;
  entityId: EntityId;
  amount: number;
  healed: number;
  health: number;
  maxHealth: number;
}

/** What `spendMana` answers. Unlike health, a spend larger than the pool is REFUSED rather than clamped —
 *  see the method's own note. */
export interface PlayerManaSpendReport {
  sceneId: SceneId;
  entityId: EntityId;
  amount: number;
  mana: number;
  maxMana: number;
}

/** What `gainExperience` answers. The `level` is carried because it did NOT move: no curve is implemented
 *  here, and a report that showed only the experience would leave a caller assuming one was. */
export interface PlayerExperienceReport {
  sceneId: SceneId;
  entityId: EntityId;
  amount: number;
  experience: number;
  level: number;
}

/** What `setPlayerLevel` answers — the level as DATA, set by name. */
export interface PlayerLevelReport {
  sceneId: SceneId;
  entityId: EntityId;
  level: number;
  experience: number;
}

/** What `strike` answers. `damage` is what LANDED after armor rather than what the attacker asked for —
 *  the same word `PlayerDamageReport` uses for the same reason, because a blow and an overkill are two
 *  different claims and a report that conflated them would make armor unmeasurable. */
export interface CombatStrikeReport {
  sceneId: SceneId;
  entityId: EntityId;
  targetId: EntityId;
  /** What the caller asked for, or the attacker's `attackPower` when the caller named no amount. */
  amount: number;
  /** What the target actually lost. */
  damage: number;
  /** The target's armor as it stood when the blow landed — carried because it is the whole of the arithmetic
   *  a caller would otherwise have to reconstruct from two records it may not hold. */
  armor: number;
  health: number;
  maxHealth: number;
  /** True only on the blow that took the target's health from a positive number to zero. */
  died: boolean;
  reason: string;
}

/** What `healCombatant` answers. `revived` is true only where the heal crossed the target's health back
 *  above zero, which is the ONE state transition this runtime keeps on a combat record. */
export interface CombatHealReport {
  sceneId: SceneId;
  entityId: EntityId;
  amount: number;
  healed: number;
  health: number;
  maxHealth: number;
  revived: boolean;
}

export interface SerializedCinematic {
  sequences: [string, SerializedCinematicSequence][];
  activeSequence: string | null;
  currentTime: number;
}

/**
 * A `THREE.CatmullRomCurve3` as DATA: the control points, and the three constructor arguments that change
 * the shape of the curve through them. `curveType` and `tension` are here because three.js reads an
 * UNRECOGNIZED `curveType` as `'catmullrom'` — a save that lost the word would play a different path than
 * the one it names, so `curveFromData` refuses an unknown value by name instead of letting the default
 * answer for it.
 */
export interface SerializedCurve {
  points: SerializedVector3[];
  closed: boolean;
  curveType: 'centripetal' | 'chordal' | 'catmullrom';
  tension: number;
}

export interface SerializedCinematicShot {
  id: string;
  cameraId: CameraId;
  startTime: number;
  endTime: number;
  transition: 'cut' | 'fade' | 'dissolve' | 'wipe' | 'slide';
  transitionDuration: number;
  cameraPath?: SerializedCurve;
  targetPath?: SerializedCurve;
  fovAnimation?: { start: number; end: number; easing: string };
  postProcessing?: PostProcessingConfig;
}

/**
 * `CinematicSequence` plus `sceneId`. The scene is NOT a field of the live type — it is the registry
 * entry's — because a sequence's shot `cameraId`s address ONE scene's camera set and nothing else. Which
 * means `SerializedCinematic` could not say which scene a saved sequence belongs to until something
 * actually tried to read it: `defineCinematic` needs that answer to validate the shots at all, and a shape
 * that cannot carry it cannot be restored without the caller remembering it. So the save shape declares it
 * and the reader checks it (the same repair `SerializedEntity.layers` was for v115).
 */
export interface SerializedCinematicSequence {
  id: string;
  name: string;
  sceneId: SceneId;
  shots: SerializedCinematicShot[];
  duration: number;
  currentShot: number;
  playing: boolean;
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
