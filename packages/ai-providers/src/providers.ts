import { hexToRgba, ops, type DesignDocument, type Op } from '@nexus/design-model';
import {
  type DesignProvider,
  type EmbeddingProvider,
  type ImageProvider,
  type RerankerProvider,
  type GenerateDesignResult,
  type EmbedResult,
  type RankResult,
  type ImageResult,
  type Usage,
  type EditDesignRequest,
  type GenerateDesignRequest,
  type EmbedRequest,
  type RankRequest,
  type ImageRequest,
} from './types.js';
import { composeDesignBatch, compose } from './demo/composer.js';
import { hashEmbed, lexicalScore, EMBED_DIM } from './demo/embedding.js';
import { hashString, mulberry32 } from './prng.js';

function demoUsage(model: string, startedAt: number): Usage {
  return {
    provider: 'nexus-demo',
    model,
    mode: 'demo',
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: Math.round((Date.now() - startedAt) * 100) / 100,
    estimatedCostUsd: 0,
  };
}

/** The DEMO design agent: prompt → editable Design Model ops; instruction → targeted edits. */
export class DemoDesignProvider implements DesignProvider {
  id = 'nexus-demo-design';
  label = 'NEXUS Demo Composer';
  available = true; // demo always available; live is a different provider

  async generate(req: GenerateDesignRequest): Promise<GenerateDesignResult> {
    const started = Date.now();
    const { batch, template } = composeDesignBatch({ prompt: req.prompt, document: req.document, seed: req.seed });
    return {
      batch,
      usage: demoUsage(`demo-composer:${template}`, started),
      provenance: { mode: 'demo', provider: 'nexus-demo', model: `demo-composer:${template}`, seed: req.seed ?? hashString(req.prompt) },
    };
  }

  async edit(req: EditDesignRequest): Promise<GenerateDesignResult> {
    const started = Date.now();
    const batch = buildEditBatch(req.document, req.selectedNodeIds, req.instruction);
    return {
      batch,
      usage: demoUsage('demo-editor', started),
      provenance: { mode: 'demo', provider: 'nexus-demo', model: 'demo-editor', seed: req.seed },
    };
  }
}

/** Concrete, deterministic transforms so "AI edit" is real behavior, not a mock (§60). */
function buildEditBatch(doc: DesignDocument, selected: string[], instruction: string) {
  const instr = instruction.toLowerCase();
  const opsList: Op[] = [];
  const targets = selected.length ? selected : [];
  for (const id of targets) {
    if (!doc.nodes[id]) continue;
    if (/\brename\s+["']?(.+?)["']?$/.test(instruction)) {
      const m = /\brename\s+["']?(.+?)["']?$/.exec(instruction);
      if (m) opsList.push(ops.updateNode(id, { name: m[1] }));
    } else if (/hide/.test(instr)) {
      opsList.push(ops.updateNode(id, { visible: false }));
    } else if (/\bshow\b/.test(instr)) {
      opsList.push(ops.updateNode(id, { visible: true }));
    } else if (/bigger|larger|grow|scale/.test(instr)) {
      const n = doc.nodes[id]!;
      opsList.push(ops.updateNode(id, { width: Math.round(n.width * 1.2), height: Math.round(n.height * 1.2) }));
    } else if (/smaller|shrink/.test(instr)) {
      const n = doc.nodes[id]!;
      opsList.push(ops.updateNode(id, { width: Math.round(n.width * 0.8), height: Math.round(n.height * 0.8) }));
    } else {
      const color = /red/.test(instr) ? '#ef4444' : /blue/.test(instr) ? '#3b82f6' : /green/.test(instr) ? '#22c55e' : /brand/.test(instr) ? '#6ea8fe' : /accent|purple/.test(instr) ? '#b48cff' : null;
      if (color) opsList.push(ops.updateNode(id, { fills: [{ kind: 'solid', color: hexToRgba(color) }] }));
    }
  }
  return {
    id: 'edit_' + hashString(instruction) + '_' + targets.length,
    ops: opsList,
    provenance: { mode: 'demo' as const, provider: 'nexus-demo', label: 'demo:edit' },
    timestamp: 0,
    summary: `Edited ${targets.length} node(s): ${instruction.slice(0, 60)}`,
  };
}

export class DemoEmbeddingProvider implements EmbeddingProvider {
  id = 'nexus-demo-embed';
  label = 'NEXUS Hash Embeddings';
  available = true;
  async embed(req: EmbedRequest): Promise<EmbedResult> {
    const started = Date.now();
    return {
      vectors: req.texts.map((t) => hashEmbed(t)),
      dim: EMBED_DIM,
      usage: demoUsage('demo-hash-embed', started),
    };
  }
}

export class DemoRerankerProvider implements RerankerProvider {
  id = 'nexus-demo-rerank';
  label = 'NEXUS Lexical Reranker';
  available = true;
  async rank(req: RankRequest): Promise<RankResult> {
    const started = Date.now();
    const scored = req.documents
      .map((d) => ({ id: d.id, score: lexicalScore(req.query, d.text) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, req.topK ?? req.documents.length);
    return { ranked: scored, usage: demoUsage('demo-lexical-rerank', started) };
  }
}

export class DemoImageProvider implements ImageProvider {
  id = 'nexus-demo-image';
  label = 'NEXUS Procedural Image';
  available = true;
  async textToImage(req: ImageRequest): Promise<ImageResult> {
    const started = Date.now();
    const seed = req.seed ?? hashString(req.prompt);
    const rng = mulberry32(seed);
    const hueA = Math.floor(rng() * 360);
    const hueB = (hueA + 40 + Math.floor(rng() * 120)) % 360;
    return {
      spec: { kind: 'demo-gradient', from: hsl(hueA, 65, 45), to: hsl(hueB, 70, 30), angle: Math.floor(rng() * 360) },
      width: req.width,
      height: req.height,
      usage: demoUsage('demo-procedural-image', started),
      provenance: { mode: 'demo', provider: 'nexus-demo', model: 'demo-procedural-image', seed },
    };
  }
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h} ${s}% ${l}%)`;
}

export { compose };
