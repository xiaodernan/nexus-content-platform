import type { AssetRef } from '@nexus/design-model';
import { finishTask, startTask } from './agent-tasks';
import { uploadImageAsset } from './assets';
import { refusalForRun } from './credit-ledger';
import { emit } from './notifications';
import { synthLimitViolations, synthesizeDemoImage } from './image-synth';

/**
 * §38 Image Studio 的第一条箭头（Text → Image）端到端那一段。
 *
 * 这一层的职责不是"画图"（像素来自 `image-synth.ts` 的本地确定性合成器，本机没有图像 provider），
 * 而是把 §38 那条链上其余环节**全部接成真的**：
 * 规格门 → **额度门**（image 桶）→ 任务行 → 字节 → 与上传同一道摄取门（§80：magic-bytes + 元数据剥离）
 * → 资产行（`source='generated'` + 可回指任务的 genMeta）→ 扣点 → 通知。
 * 换上真 provider 时替换的只有中间那一格像素来源，前后每一环都不用重写。
 *
 * 三条顺序纪律，都是能被反向实验抓住的那种：
 * - **额度门在 `startTask` 之前**（与 `POST /api/ai/run` 同一口径）。被拒的请求如果在任务列表里
 *   留下一行 running→failed，那就是"点了执行但什么都没发生"的假账。
 * - **扣点只在成功收尾**：走 `finishTask`，不在这里手写账（§134 的"消费透明"要求扣点与任务一一对应）。
 * - **DEMO 要说清**：`capability='demo'` 落任务行，`genMeta.demoMode=true` 落资产行，
 *   面板上那枚角标读的就是后者（§160）。
 */

/** agentKey 里带 "image" 是为了让 `creditKindForAgentKey` 把它归到 image 桶（一次 2 点） */
export const IMAGE_AGENT_KEY = 'image.generate';

const DEFAULT_EDGE = 512;

export interface GenerateImageInput {
  projectId: string;
  userId: string;
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
}

export type GenerateImageOutcome =
  | {
      ok: true;
      asset: AssetRef;
      taskId: string;
      /** 同项目里已有这份字节（同 prompt 同 seed）时为 true：省的是存储，不是消费记录 */
      reused: boolean;
      removed: string[];
    }
  | {
      ok: false;
      code: 'invalid_input' | 'credits_exhausted' | 'asset_rejected' | 'synth_failed';
      message: string;
      issues?: string[];
    };

/** 展示名来自 prompt：它只进界面，绝不参与路径拼接（对象键一律由服务端按 id 生成，§80） */
function nameOf(prompt: string): string {
  return `${prompt.trim().slice(0, 60) || 'image'}.png`;
}

export async function generateDemoImage(input: GenerateImageInput): Promise<GenerateImageOutcome> {
  const width = input.width ?? DEFAULT_EDGE;
  const height = input.height ?? DEFAULT_EDGE;
  const seed = input.seed ?? 0;

  const issues = synthLimitViolations({ prompt: input.prompt, width, height, seed });
  if (issues.length) {
    return { ok: false, code: 'invalid_input', message: '这次请求不符合合成器的规格上限', issues };
  }

  // 门放在写任务行之前：余额不够就一行都不留
  const refusal = await refusalForRun(input.userId, IMAGE_AGENT_KEY);
  if (refusal) return { ok: false, code: 'credits_exhausted', message: refusal };

  const startedAt = Date.now();
  const { id: taskId, projectName } = await startTask({
    projectId: input.projectId,
    agentKey: IMAGE_AGENT_KEY,
    createdById: input.userId,
    capability: 'demo',
    input: { prompt: input.prompt.slice(0, 500), width, height, seed },
  });

  const synth = synthesizeDemoImage({ prompt: input.prompt, width, height, seed });
  if (!synth.ok) {
    await finishTask(taskId, { ok: false, error: `合成失败：${synth.issues.join('；')}` });
    return { ok: false, code: 'synth_failed', message: '本地合成器没有给出图片', issues: synth.issues };
  }

  // 与用户上传走同一道摄取门，不给生成物开后门
  const ingested = await uploadImageAsset(input.projectId, {
    data: synth.bytes,
    filename: nameOf(input.prompt),
    createdById: input.userId,
    source: 'generated',
    genMeta: {
      prompt: input.prompt,
      provider: synth.genMeta.provider,
      model: synth.genMeta.model,
      seed,
      demoMode: synth.genMeta.demoMode,
      width: synth.width,
      height: synth.height,
      taskId,
    },
  });
  if (!ingested.ok) {
    await finishTask(taskId, { ok: false, error: `生成物未通过资产摄取门：${ingested.reason}` });
    return { ok: false, code: 'asset_rejected', message: ingested.reason, issues: ingested.issues };
  }

  // 成功收尾：这一句里发生了 §134 的那一笔扣点
  await finishTask(taskId, {
    ok: true,
    result: { assetId: ingested.asset.id, width: synth.width, height: synth.height, reused: ingested.reused },
  });
  await emit({
    kind: 'generation',
    recipientId: input.userId,
    projectId: input.projectId,
    projectName: projectName ?? '未命名项目',
    taskId,
    agentKey: IMAGE_AGENT_KEY,
    capability: 'demo',
    ok: true,
    durationMs: Date.now() - startedAt,
    detail: `一张 ${synth.width}×${synth.height} 的图片（DEMO 本地合成）`,
  });

  return { ok: true, asset: ingested.asset, taskId, reused: ingested.reused, removed: ingested.removed };
}
