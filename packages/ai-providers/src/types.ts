import type { DesignDocument, OpBatch, Provenance } from '@nexus/design-model';

/** Task descriptors the ModelRouter maps to concrete provider+model (ADR 0009). */
export type NexusTask =
  | 'design.generate'
  | 'design.edit'
  | 'text.fast'
  | 'text.reason'
  | 'vision.inspect'
  | 'embedding'
  | 'rerank'
  | 'image.text-to-image'
  | 'video.text-to-video';

export interface Usage {
  provider: string;
  model: string;
  mode: Provenance['mode'];
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  /** estimated USD; 0 for DEMO MODE so cost transparency stays honest (§53) */
  estimatedCostUsd: number;
}

export interface GenerateDesignRequest {
  prompt: string;
  document: DesignDocument;
  /** optional explicit selection to scope an edit */
  targetNodeIds?: string[];
  seed?: number;
}

export interface GenerateDesignResult {
  batch: OpBatch;
  usage: Usage;
  provenance: Provenance;
}

export interface EditDesignRequest {
  instruction: string;
  document: DesignDocument;
  selectedNodeIds: string[];
  seed?: number;
}

export interface EmbedRequest {
  texts: string[];
}
export interface EmbedResult {
  vectors: number[][];
  dim: number;
  usage: Usage;
}

export interface RankRequest {
  query: string;
  documents: { id: string; text: string }[];
  topK?: number;
}
export interface RankResult {
  ranked: { id: string; score: number }[];
  usage: Usage;
}

export interface ImageRequest {
  prompt: string;
  width: number;
  height: number;
  seed?: number;
}
export interface ImageResult {
  /** procedural spec for DEMO MODE: a deterministic gradient/pattern, not a real render */
  spec: { kind: 'demo-gradient'; from: string; to: string; angle: number };
  width: number;
  height: number;
  usage: Usage;
  provenance: Provenance;
}

/** A capability provider reports whether it can actually serve live today. */
export interface ProviderInfo {
  id: string;
  label: string;
  /** false → router must fall back (ADR 0010). Never pretend to be live. */
  available: boolean;
}

export interface DesignProvider extends ProviderInfo {
  generate(req: GenerateDesignRequest): Promise<GenerateDesignResult>;
  edit(req: EditDesignRequest): Promise<GenerateDesignResult>;
}
export interface EmbeddingProvider extends ProviderInfo {
  embed(req: EmbedRequest): Promise<EmbedResult>;
}
export interface RerankerProvider extends ProviderInfo {
  rank(req: RankRequest): Promise<RankResult>;
}
export interface ImageProvider extends ProviderInfo {
  textToImage(req: ImageRequest): Promise<ImageResult>;
}
