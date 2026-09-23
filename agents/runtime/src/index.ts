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
export { validateCheckpointPolicy, decide, policyCheckpoint, type CheckpointRule, type CheckpointPolicy, type CheckpointDecision } from './checkpointPolicy.js';
export { RoleRegistry, DEMO_ROLES, type RoleDefinition } from './roles.js';
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
  loadLedger,
  parseLedgerLine,
  type LedgerLine,
  type LedgerRead,
} from './ledger.js';
export { planTask, goalKeyword, type PlannerOptions } from './planner.js';
export {
  GIT_ARC_TOOLS,
  gitArcDoors,
  gitArcSteps,
  runGitArc,
  type GitArcOptions,
  type GitArcOutcome,
  type GitArcPresence,
  type GitArcTool,
} from './gitArc.js';
export { demoPlanner, routerPlanner, validatePlan, type PlanBackend, type Planned, type ProviderLike } from './planBackend.js';
export { runTask, type RunOptions } from './orchestrator.js';
