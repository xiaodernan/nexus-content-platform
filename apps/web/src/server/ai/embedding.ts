/**
 * §49 Web侧 Embedding Provider：当 NEXUS_OPENAI_API_KEY 可用时，
 * 直接在 web 进程内实例化 OpenAI 兼容的 embedding provider，
 * 供 VectorStore.upsertChunks 调用生成向量。
 * 这样不需要跨进程调用 ai-service，且与 ai-service 使用完全一致的实现。
 */

export interface EmbeddingProvider {
  models(): string[];
  embed(args: { model: string; texts: string[] }): Promise<{ vectors: number[][]; provider: string; model: string; tokens_in: number; latency_ms: number }>;
}

export interface EmbeddingResult {
  vectors: number[][];
  provider: string;
  model: string;
  tokens_in: number;
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

let cachedProvider: OpenAICompatibleEmbeddingProvider | null = null;

export function getEmbeddingProvider(): OpenAICompatibleEmbeddingProvider | null {
  if (cachedProvider) return cachedProvider;

  const apiKey = process.env.NEXUS_OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.NEXUS_OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const models: Record<string, string> = { embedding: 'text-embedding-3-small' };
  const embeddingModelEnv = process.env.NEXUS_MODEL_EMBEDDING;
  if (embeddingModelEnv) models.embedding = embeddingModelEnv;

  cachedProvider = new OpenAICompatibleEmbeddingProvider(apiKey, baseUrl, models);
  return cachedProvider;
}

export function hasEmbeddingProvider(): boolean {
  return !!process.env.NEXUS_OPENAI_API_KEY;
}