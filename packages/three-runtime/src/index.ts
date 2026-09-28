export * from './types.js';
export { ThreeRuntime, createThreeRuntime, DEFAULT_THREE_CONFIG, DEFAULT_CONTROLLER, type ThreeRuntimeOptions, type ControllerAttachOptions, type ControllerFieldAudit, type SaveFeasibilityAudit, type PhysicsFieldAudit, type CinematicSequenceInput, type CinematicFieldAudit, type CinematicRestoreReport, type SaveFileLoadReport, type SaveFileWriteReport, type SaveFileReadReport, type SaveFileDeleteReport, type SaveFileLatest, type SaveFileDiagnosis, SAVE_FILE_FORMAT, SAVE_FILE_VERSION } from './threeRuntime.js';
// M5 v120 — the storage seam. `createMemorySaveStore` is what makes save files testable without a disk;
// `createFsSaveStore` takes an injected fs-like object so the package never imports one itself.
export {
  createMemorySaveStore,
  createFsSaveStore,
  resolveSavePath,
  SAVE_TEMP_SUFFIX,
  type SaveStore,
  type FsLike,
} from './saveStore.js';
// M5 v108 — the renderer seam. `createWebGLBackend` is the production default; `createHeadlessBackend`
// is what makes every layer above the seam verifiable without a GPU, and `webglAvailable()` lets a
// caller pick honestly instead of discovering the answer through a thrown constructor.
export {
  createWebGLBackend,
  createHeadlessBackend,
  webglAvailable,
  defaultFrameScheduler,
  manualFrameScheduler,
  type RenderBackend,
  type RenderBackendFactory,
  type RenderBackendState,
  type HeadlessBackend,
  type HeadlessFrame,
  type FrameScheduler,
} from './renderBackend.js';
