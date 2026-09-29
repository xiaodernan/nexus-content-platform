export * from './types.js';
export { embedTokens, hybridScore, tokenize } from './embedding.js';
export {
  buildIndex,
  chunkFile,
  extractSymbols,
  fileKind,
  queryIndex,
  sourcePrior,
  type CodeIndex,
  type FileEntry,
  type FileKind,
  type IndexChunk,
  type QueryHit,
} from './codeIndex.js';
export { ToolRegistry, DANGEROUS, matchesTool, type Checkpoint, type CheckpointRequest, type ToolImpl, type InvokeOptions } from './registry.js';
export { validateCheckpointPolicy, decide, policyCheckpoint, receiptsOrNote, gatedCallIds, NO_RECEIPTS_NOTE, type CheckpointRule, type CheckpointPolicy, type CheckpointDecision, type ReceiptState } from './checkpointPolicy.js';
export {
  auditGateHistory,
  auditLineFor,
  recordFromDecision,
  recordsFromDecisions,
  type GateRecord,
  type PolicyAudit,
  type AuditDivergence,
  type DivergenceKind,
} from './policyAudit.js';
export { RoleRegistry, DEMO_ROLES, type RoleDefinition } from './roles.js';
export { AgentRegistry, createDefaultAgents, type AgentDefinition, type AgentCapability, type HandoffPayload, type AgentRegistryOptions } from './agentRegistry.js';
export { runMultiAgentPipeline, type MultiAgentPipelineOptions, type MultiAgentPipelineResult, type MultiAgentStageResult, type MultiAgentHandoff } from './multiAgentPipeline.js';
export {
  createVectorStore,
  syncMemoryToVectorStore,
  type VectorStore,
  type VectorStoreConfig,
  type VectorStoreEntryInput,
  type VectorStoreEngine,
  type VectorStoreFlush,
  type VectorStoreInit,
  type VectorStoreKind,
  type VectorQueryOptions,
  type MemoryVectorSync,
  type MemoryVectorSyncOptions,
} from './vectorStore.js';
export {
  createBrowserDriver,
  registerBrowserTools,
  BROWSER_TOOL_SPECS,
  type BrowserAction,
  type BrowserActionType,
  type BrowserDriver,
  type BrowserElement,
  type BrowserPageDescription,
  type BrowserResult,
  type BrowserState,
  type BrowserToolOptions,
} from './browserTools.js';
// M5 v140 — the first consumer of the 3D lane. A DRIVER SEAM, not a package import: this lane holds the
// capability to compose and inspect a scene without holding a renderer.
export {
  registerSceneTools,
  SCENE_TOOL_SPECS,
  SCENE_ENTITY_KINDS,
  type SceneDriver,
  type SceneEntitySpec,
  type SceneSummary,
} from './sceneTools.js';
export {
  runRoleChain,
  runRolePipeline,
  type ChainOptions,
  type ChainResult,
  type ChainStageHandoff,
  type HandoffRecord,
  type PipelineOptions,
  type PipelineResult,
} from './pipeline.js';
export {
  contrastRatio,
  relativeLuminance,
  runVisualQa,
  type QaFlag,
  type QaInput,
  type QaRect,
  type QaReport,
  type QaSeverity,
} from './visualQa.js';
export { proposeRepairs, type Repair, type RepairResult } from './repair.js';
export {
  TEST_TOOL_SPECS,
  appendTestReport,
  formatTestLine,
  loadTestReports,
  predicateRunner,
  registerTestTools,
  runPredicates,
  type TestFailure,
  type TestPredicate,
  type TestReport,
  type TestRunner,
} from './testRunner.js';
export {
  EXEC_TOOL_SPECS,
  planExec,
  registerExecTools,
  validatePolicy,
  type ExecDecision,
  type ExecPlan,
  type ExecPolicy,
  type ExecRequest,
  type ExecRule,
} from './execSandbox.js';
export { findLabel, registerUiTools, UI_TOOL_SPECS, type UiDriver, type UiElement } from './domkit.js';
export {
  VECTOR_SCHEMA_VERSION,
  buildVectorDb,
  deserializeVectors,
  loadVectors,
  queryVectors,
  saveVectors,
  serializeVectors,
  type VectorDb,
  type VectorEntry,
  type VectorHit,
  type VectorsLoad,
} from './vectordb.js';
export {
  indexHay,
  indexToVectorDb,
  indexVectorId,
  mergeIndexVectors,
  queryIndexWithVectors,
  type IndexedQuery,
} from './indexVectors.js';
export {
  appendEvaluation,
  formatEvaluationLine,
  loadEvaluations,
  scoreRun,
  type EvalLoad,
  type EvaluationMark,
  type RubricOptions,
  type RunEvaluation,
} from './evaluate.js';
export {
  InMemoryWorkspace,
  WORKSPACE_TOOL_SPECS,
  registerWorkspaceTools,
  type SearchHit,
  type WorkspaceToolOptions,
} from './workspace.js';
export {
  collectTextFiles,
  DEFAULT_SKIP_DIRS,
  type FsLike,
  type FsDirentLike,
  type IngestOptions,
} from './realfs.js';
export {
  MemoryStore,
  MEMORY_TOOL_SPECS,
  registerMemoryTools,
  type MemoryToolOptions,
  type MemoryRecord,
  type MemoryRef,
  type RecallHit,
} from './memory.js';
export {
  DISK_TOOL_SPECS,
  MEMORY_SCHEMA_VERSION,
  deserializeMemory,
  guardedJoin,
  loadMemoryStore,
  registerDiskTools,
  saveMemory,
  serializeMemory,
  type DiskToolOptions,
  type FsWriteLike,
  type LoadResult,
} from './durability.js';
export {
  INDEX_SCHEMA_VERSION,
  createIndexProvider,
  deserializeIndex,
  fingerprintFiles,
  loadIndex,
  rescanIndex,
  saveIndex,
  serializeIndex,
  type Fingerprints,
  type IndexLoad,
  type IndexProvider,
  type IndexProviderOptions,
  type PersistedIndex,
  type RescanResult,
} from './indexStore.js';
export {
  applyPatch,
  computeFilePatch,
  createChangeSet,
  formatUnifiedDiff,
  inversePatch,
  type ChangeSet,
  type FilePatch,
  type LineOp,
  type OpType,
} from './changes.js';
export {
  appendLedger,
  formatLedgerLine,
  isArcRecord,
  loadLedger,
  parseLedgerLine,
  type GitArcLedgerRecord,
  type LedgerEntry,
  type LedgerLine,
  type LedgerRead,
} from './ledger.js';
export { planTask, goalKeyword, type PlannerOptions } from './planner.js';
export {
  GIT_ARC_TOOLS,
  gitArcDoors,
  gitArcSteps,
  runGitArc,
  RELEASE_ROLE,
  type GitArcOptions,
  type GitArcOutcome,
  type GitArcPresence,
  type GitArcTool,
} from './gitArc.js';
export { demoPlanner, routerPlanner, validatePlan, type PlanBackend, type Planned, type ProviderLike } from './planBackend.js';
export { runTask, type RunOptions } from './orchestrator.js';
