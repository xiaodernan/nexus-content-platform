import type {
  DesignProvider,
  EmbeddingProvider,
  ImageProvider,
  RerankerProvider,
  GenerateDesignRequest,
  GenerateDesignResult,
  EditDesignRequest,
  EmbedRequest,
  EmbedResult,
  RankRequest,
  RankResult,
  ImageRequest,
  ImageResult,
} from './types.js';
import {
  DemoDesignProvider,
  DemoEmbeddingProvider,
  DemoRerankerProvider,
  DemoImageProvider,
} from './providers.js';
import { InMemoryCallRecorder, type CallRecorder } from './call-recorder.js';

export interface RouterOptions {
  recorder?: CallRecorder;
  design?: DesignProvider;
  embedding?: EmbeddingProvider;
  reranker?: RerankerProvider;
  image?: ImageProvider;
}

/**
 * Maps tasks to capability providers by availability (ADR 0009). With no live keys every
 * task resolves to the deterministic DEMO provider, so the Studio loop runs end-to-end while
 * `mode` truthfully reports 'demo' — never a fake 'live' (ADR 0010 / §60).
 */
export class ModelRouter {
  readonly recorder: CallRecorder;
  private design: DesignProvider;
  private embedding: EmbeddingProvider;
  private reranker: RerankerProvider;
  private image: ImageProvider;

  constructor(opts: RouterOptions = {}) {
    this.recorder = opts.recorder ?? new InMemoryCallRecorder();
    this.design = opts.design ?? new DemoDesignProvider();
    this.embedding = opts.embedding ?? new DemoEmbeddingProvider();
    this.reranker = opts.reranker ?? new DemoRerankerProvider();
    this.image = opts.image ?? new DemoImageProvider();
  }

  /** 'demo' unless a live design provider is injected; drives the UI badge. */
  get mode(): 'demo' | 'live' {
    const live = !this.design.id.startsWith('nexus-demo') ||
      !this.embedding.id.startsWith('nexus-demo') ||
      !this.image.id.startsWith('nexus-demo');
    return live ? 'live' : 'demo';
  }

  get providers() {
    return {
      design: this.design,
      embedding: this.embedding,
      reranker: this.reranker,
      image: this.image,
    };
  }

  async generateDesign(req: GenerateDesignRequest): Promise<GenerateDesignResult> {
    assertAvailable(this.design, 'design.generate');
    const res = await this.design.generate(req);
    this.recorder.record(res.usage);
    return res;
  }

  async editDesign(req: EditDesignRequest): Promise<GenerateDesignResult> {
    assertAvailable(this.design, 'design.edit');
    const res = await this.design.edit(req);
    this.recorder.record(res.usage);
    return res;
  }

  async embed(req: EmbedRequest): Promise<EmbedResult> {
    assertAvailable(this.embedding, 'embedding');
    const res = await this.embedding.embed(req);
    this.recorder.record(res.usage);
    return res;
  }

  async rank(req: RankRequest): Promise<RankResult> {
    assertAvailable(this.reranker, 'rerank');
    const res = await this.reranker.rank(req);
    this.recorder.record(res.usage);
    return res;
  }

  async textToImage(req: ImageRequest): Promise<ImageResult> {
    assertAvailable(this.image, 'image.text-to-image');
    const res = await this.image.textToImage(req);
    this.recorder.record(res.usage);
    return res;
  }
}

class ProviderUnavailableError extends Error {
  constructor(task: string, provider: string) {
    super(`Provider "${provider}" is unavailable for task "${task}". Configure a live key or use DEMO MODE.`);
    this.name = 'ProviderUnavailableError';
  }
}

function assertAvailable(p: { available: boolean; id: string }, task: string): void {
  if (!p.available) throw new ProviderUnavailableError(task, p.id);
}
