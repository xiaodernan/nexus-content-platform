/**
 * §49 Web侧 Embedding Provider：当 NEXUS_OPENAI_API_KEY 可用时，
 * 直接在 web 进程内实例化 OpenAI 兼容的 embedding provider，
 * 供 VectorStore.upsertChunks 调用生成向量。
 * 这样不需要跨进程调用 ai-service，且与 ai-service 使用完全一致的实现。
 */

export interface EmbeddingProvider {
  models(): string[];
  /** 模型档 → 具体模型名。实现方必须自报，调用方不拼名。 */
  model_for(model_class: string): string;
  embed(args: { model: string; texts: string[] }): Promise<{ vectors: number[][]; provider: string; model: string; tokens_in: number; latency_ms: number }>;
}

export interface EmbeddingResult {
  vectors: number[][];
  provider: string;
  model: string;
  tokens_in: number;
  latency_ms: number;
}

/** §49/§93 — deterministic local embedding dimension count (matches the pgvector column). */
export const LOCAL_EMBEDDING_DIMENSIONS = 1536 as const;
export const LOCAL_EMBEDDING_MODEL = 'local-token-bag-1536' as const;
export const LOCAL_RERANKER_MODEL = 'local-token-bag-rerank-1' as const;

/**
 * §49 local embeddings without a provider key are only honest if they say what they are.
 *
 * This is NOT a semantic model. It is a deterministic bag-of-tokens hashing embedding:
 *   - ASCII runs of a–z/0–9, lowercased, count as one token each;
 *   - a CJK run is cut into 2-character bigrams, which is the granularity CJK search wants;
 *   - every token hashes (FNV-1a 32-bit) into a fixed 1536-bucket bag, count-weighted, L2-normalized.
 * Two texts with similar token overlap get close vectors; it cannot learn meaning, and it is the
 * same honesty rule as DEMO MODE (§159/§160): a local convenience is never presented as a real model.
 * Opt-in ONLY — `NEXUS_EMBEDDING_PROVIDER=local` selects it, `NEXUS_OPENAI_API_KEY` alone never does,
 * and naming an unknown provider throws rather than silently falling back to a different brain.
 */
const FNV1A_PRIME = 0x01000193;
const FNV1A_OFFSET = 0x811c9dc5;

/** FNV-1a over the token's UTF-8 bytes, folded into [0, 1535]. */
function tokenBucket(token: string): number {
  const bytes = new TextEncoder().encode(token);
  let hash = FNV1A_OFFSET;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, FNV1A_PRIME);
  }
  hash ^= hash >>> 16;
  return (hash >>> 0) % LOCAL_EMBEDDING_DIMENSIONS;
}

const ASCII_RUN = /[a-z0-9]+/g;
const CJK_RUN = /[一-鿿㐀-䶿]+/g;

/** Tokenize text into the exact token list the bag carries. Exported for the honestly-measured test. */
export function tokenizeForLocalEmbedding(text: string): string[] {
  const t = text.toLowerCase();
  const tokens: string[] = [];
  for (const match of t.matchAll(ASCII_RUN)) tokens.push(match[0]);
  for (const match of t.matchAll(CJK_RUN)) {
    const run = match[0];
    for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2));
    if (run.length === 1) tokens.push(run);
  }
  return tokens;
}

/** The raw, count-weighted, unnormalized bag — exported so the honest test can measure its weight. */
export function localTokenBag(text: string): Map<number, number> {
  const bag = new Map<number, number>();
  for (const token of tokenizeForLocalEmbedding(text)) {
    const bucket = tokenBucket(token);
    bag.set(bucket, (bag.get(bucket) ?? 0) + 1);
  }
  return bag;
}

/** L2-normalized 1536-dim vector; the empty text yields the zero vector (the store refuses it on read). */
export function localTokenBagVector(text: string): number[] {
  const out = new Array<number>(LOCAL_EMBEDDING_DIMENSIONS).fill(0);
  let norm = 0;
  for (const [bucket, count] of localTokenBag(text)) {
    out[bucket] = count;
    norm += count * count;
  }
  if (norm === 0) return out;
  const scale = 1 / Math.sqrt(norm);
  for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) * scale;
  return out;
}

export class LocalTokenBagEmbeddingProvider implements EmbeddingProvider {
  kind = 'embedding';
  name = 'local-token-bag';

  models(): string[] {
    return [LOCAL_EMBEDDING_MODEL];
  }

  model_for(model_class: string): string {
    if (model_class !== 'embedding') {
      throw new Error(`未知的模型档：${model_class}（local-token-bag 只声明 embedding 档）`);
    }
    return LOCAL_EMBEDDING_MODEL;
  }

  async embed({ model, texts }: { model: string; texts: string[] }): Promise<EmbeddingResult> {
    if (model !== LOCAL_EMBEDDING_MODEL) {
      throw new Error(`local-token-bag 只提供 ${LOCAL_EMBEDDING_MODEL}，不接受 ${model}`);
    }
    const started = performance.now();
    if (!texts.length) {
      return { vectors: [], provider: this.name, model, tokens_in: 0, latency_ms: 0 };
    }
    const tokenCounts = texts.map((t) => tokenizeForLocalEmbedding(t).length);
    return {
      vectors: texts.map(localTokenBagVector),
      provider: this.name,
      model,
      tokens_in: tokenCounts.reduce((a, b) => a + b, 0),
      latency_ms: Math.round(performance.now() - started),
    };
  }

  close(): void {
    // 无连接可关
  }
}

/**
 * §93 — deterministic local reranker, opt-in via NEXUS_RERANKER_PROVIDER=local (never by a key alone).
 * Same honesty contract as the local embedder: it is NOT a cross-encoder working on meaning.
 * It scores query and document by cosine of their L2-normalized token-bag vectors — i.e. token-overlap
 * preference with the same deterministic machinery as the embedder. It reorders what the retrieval
 * stage already produced; it does not judge relevance semantically, and it says so rather than pretending.
 */
export class LocalTokenBagRerankerProvider implements RerankerProvider {
  kind = 'reranker';
  name = 'local-token-bag';

  models(): string[] {
    return [LOCAL_RERANKER_MODEL];
  }

  model_for(model_class: string): string {
    if (model_class !== 'reranker') {
      throw new Error(`未知的模型档：${model_class}（local-token-bag 只声明 reranker 档）`);
    }
    return LOCAL_RERANKER_MODEL;
  }

  async rerank({ model, query, documents }: { model: string; query: string; documents: string[] }): Promise<{ scores: number[]; provider: string; model: string; latency_ms: number }> {
    if (model !== LOCAL_RERANKER_MODEL) {
      throw new Error(`local-token-bag 只提供 ${LOCAL_RERANKER_MODEL}，不接受 ${model}`);
    }
    const started = performance.now();
    if (documents.length === 0) {
      return { scores: [], provider: this.name, model, latency_ms: 0 };
    }
    const qv = localTokenBagVector(query);
    const qvNorm = qv.some((x) => x !== 0);
    const scores = documents.map((doc) => {
      if (!qvNorm) return 0; // 空查询对一切文档得 0 分；排序稳定（见 vector-store 对 0 分的处理）
      const dv = localTokenBagVector(doc);
      let dot = 0;
      for (let i = 0; i < dv.length; i++) {
        const a = qv[i] ?? 0;
        const b = dv[i] ?? 0;
        dot += a * b;
      }
      return dot;
    });
    return {
      scores,
      provider: this.name,
      model,
      latency_ms: Math.round(performance.now() - started),
    };
  }

  close(): void {
    // 无连接可关
  }
}

/** §93 reranker 切片的 TypeScript 接口 */
export interface RerankerProvider {
  models(): string[];
  rerank(args: { model: string; query: string; documents: string[] }): Promise<{ scores: number[]; provider: string; model: string; latency_ms: number }>;
}

export interface RerankerResult {
  scores: number[];
  provider: string;
  model: string;
  latency_ms: number;
}

class OpenAICompatibleEmbeddingProvider {
  kind = 'embedding';
  name = 'openai-compatible';

  private _models: Record<string, string>;
  private _baseUrl: string;
  private _apiKey: string;
  private _timeout: number;

  constructor(
    api_key: string,
    base_url: string,
    models: Record<string, string>,
    timeout_s: number = 60.0,
  ) {
    this._models = { ...models };
    this._baseUrl = base_url;
    this._apiKey = api_key;
    this._timeout = timeout_s * 1000;
  }

  models(): string[] {
    return [...new Set(Object.values(this._models))].sort();
  }

  model_for(model_class: string): string {
    const model = this._models[model_class];
    if (!model) throw new Error(`未配置 ${model_class} 档 embedding 模型`);
    return model;
  }

  async embed({ model, texts }: { model: string; texts: string[] }): Promise<EmbeddingResult> {
    if (!texts.length) {
      return { vectors: [], provider: this.name, model, tokens_in: 0, latency_ms: 0 };
    }
    const body = { model, input: texts };
    const started = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._timeout);
    try {
      const response = await fetch(`${this._baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this._apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const latency_ms = Math.round(performance.now() - started);

      if (response.status === 401 || response.status === 403) {
        throw new Error('embedding provider 拒绝了凭据（401/403），检查 NEXUS_OPENAI_API_KEY');
      }
      if (response.status >= 400) {
        const detail = (await response.text()).slice(0, 400).replace('\n', ' ');
        throw new Error(`embedding provider 返回 ${response.status}：${detail}`);
      }

      const payload = await response.json();
      const data = payload.data;
      const vectors = data.map((item: { embedding: number[] }) => item.embedding);
      const usage = payload.usage ?? {};
      return {
        vectors,
        provider: this.name,
        model: payload.model ?? model,
        tokens_in: usage.prompt_tokens ?? 0,
        latency_ms,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error) throw err;
      throw new Error(`embedding provider 调用失败：${String(err)}`, { cause: err });
    }
  }

  close(): void {
    // fetch 无需显式关闭
  }
}

let cachedEmbeddingProvider: { want: string; provider: EmbeddingProvider } | null = null;

function createEmbeddingProvider(want: string): EmbeddingProvider | null {
  if (want === 'local') return new LocalTokenBagEmbeddingProvider();
  if (want !== 'openai-compatible') {
    // 未命名的 provider 绝不静默换成别的大脑——这是本函数的选择权，不是本函数的猜测权。
    throw new Error(`未知的 embedding provider：${want}（可选：openai-compatible | local）`);
  }

  const apiKey = process.env.NEXUS_OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.NEXUS_OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const models: Record<string, string> = { embedding: 'text-embedding-3-small' };
  const embeddingModelEnv = process.env.NEXUS_MODEL_EMBEDDING;
  if (embeddingModelEnv) models.embedding = embeddingModelEnv;

  return new OpenAICompatibleEmbeddingProvider(apiKey, baseUrl, models);
}

export function getEmbeddingProvider(): EmbeddingProvider | null {
  const want = process.env.NEXUS_EMBEDDING_PROVIDER ?? 'openai-compatible';
  if (cachedEmbeddingProvider?.want === want) return cachedEmbeddingProvider.provider;
  const provider = createEmbeddingProvider(want);
  // 只缓存已创建的 provider；null（缺 key）不缓存，免得先调用时缓存住 null、后来补 key 却落不进去。
  if (provider) cachedEmbeddingProvider = { want, provider };
  return provider;
}

export function hasEmbeddingProvider(): boolean {
  // §49/§93: an unknown provider claims true ON PURPOSE — the caller then takes
  // getEmbeddingProvider()! and hits the throw naming the allowed values, instead of the
  // system silently degrading to lexical search and hiding a broken env var from the operator.
  const want = process.env.NEXUS_EMBEDDING_PROVIDER;
  if (!want) return !!process.env.NEXUS_OPENAI_API_KEY;
  if (want === 'local') return true;
  if (want === 'openai-compatible') return !!process.env.NEXUS_OPENAI_API_KEY;
  return true; // unknown: loud misuse, never silent degradation
}

/** §93 OpenAI 兼容 reranker provider（跨模型复用，支持 /v1/rerank 等兼容端点） */
class OpenAICompatibleRerankerProvider {
  kind = 'reranker';
  name = 'openai-compatible';

  private _models: Record<string, string>;
  private _baseUrl: string;
  private _apiKey: string;
  private _timeout: number;

  constructor(
    api_key: string,
    base_url: string,
    models: Record<string, string>,
    timeout_s: number = 60.0,
  ) {
    this._models = { ...models };
    this._baseUrl = base_url;
    this._apiKey = api_key;
    this._timeout = timeout_s * 1000;
  }

  models(): string[] {
    return [...new Set(Object.values(this._models))].sort();
  }

  model_for(model_class: string): string {
    const model = this._models[model_class];
    if (!model) throw new Error(`未配置 ${model_class} 档 reranker 模型`);
    return model;
  }

  async rerank({ model, query, documents }: { model: string; query: string; documents: string[] }): Promise<RerankerResult> {
    if (!documents.length) {
      return { scores: [], provider: this.name, model, latency_ms: 0 };
    }
    const body = { model, query, documents };
    const started = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._timeout);
    try {
      const response = await fetch(`${this._baseUrl}/rerank`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this._apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const latency_ms = Math.round(performance.now() - started);

      if (response.status === 401 || response.status === 403) {
        throw new Error('reranker provider 拒绝了凭据（401/403），检查 NEXUS_OPENAI_API_KEY');
      }
      if (response.status >= 400) {
        const detail = (await response.text()).slice(0, 400).replace('\n', ' ');
        throw new Error(`reranker provider 返回 ${response.status}：${detail}`);
      }

      const payload = await response.json();
      const data = payload.data;
      const scores = data.map((item: { score: number }) => item.score);
      return {
        scores,
        provider: this.name,
        model: payload.model ?? model,
        latency_ms,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error) throw err;
      throw new Error(`reranker provider 调用失败：${String(err)}`, { cause: err });
    }
  }

  close(): void {
    // fetch 无需显式关闭
  }
}

let cachedRerankerProvider: { want: string; provider: RerankerProvider } | null = null;

function createRerankerProvider(want: string): RerankerProvider | null {
  if (want === 'local') return new LocalTokenBagRerankerProvider();
  if (want !== 'openai-compatible') {
    // 与 embedding 同一条纪律：未命名的 provider 绝不静默换成别的大脑。
    throw new Error(`未知的 reranker provider：${want}（可选：openai-compatible | local）`);
  }

  const apiKey = process.env.NEXUS_OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.NEXUS_OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const models: Record<string, string> = { reranker: 'text-embedding-3-small' }; // OpenAI 没有官方 reranker，兼容层可换成 Cohere 等
  const rerankerModelEnv = process.env.NEXUS_MODEL_RERANKER;
  if (rerankerModelEnv) models.reranker = rerankerModelEnv;

  return new OpenAICompatibleRerankerProvider(apiKey, baseUrl, models);
}

export function getRerankerProvider(): RerankerProvider | null {
  const want = process.env.NEXUS_RERANKER_PROVIDER ?? 'openai-compatible';
  if (cachedRerankerProvider?.want === want) return cachedRerankerProvider.provider;
  const provider = createRerankerProvider(want);
  if (provider) cachedRerankerProvider = { want, provider };
  return provider;
}

export function hasRerankerProvider(): boolean {
  // 与 embedding 同口径：未知 provider 说 "true" —— 调用方拿到 getRerankerProvider()!，
  // 撞上的是清楚写出可选名单的 throw，而不是被静默降级成没有 rerank。
  const want = process.env.NEXUS_RERANKER_PROVIDER;
  if (!want) return !!process.env.NEXUS_OPENAI_API_KEY;
  if (want === 'local') return true;
  if (want === 'openai-compatible') return !!process.env.NEXUS_OPENAI_API_KEY;
  return true; // 未命名：响亮失败，绝不静默降级
}