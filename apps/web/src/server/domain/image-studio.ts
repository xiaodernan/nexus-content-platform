import type { AssetRef } from '@nexus/design-model';
import { finishTask, startTask } from './agent-tasks';
import { openAssetForOwner, uploadImageAsset } from './assets';
import { refusalForRun } from './credit-ledger';
import { emit } from './notifications';
import { synthLimitViolations, synthesizeDemoImage } from './image-synth';
import { extractVisualDna } from './visualDna';

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
  /**
   * §38 的 Reference → Variation：以项目里已有的一张图为参考。
   * 传了就要求它属于**这个项目且这个用户**（走 `openAssetForOwner`，不是按 id 直接取字节），
   * 并从它的像素里量出一个色相锚点喂给合成器。量不出来就拒绝，不退化成"无参考随机生成一张"——
   * 那样界面上点了"生成变体"，拿回的却与原图毫不相干（§159）。
   */
  referenceAssetId?: string;
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

/** #rrggbb → 0..1 的色相。灰阶图（r=g=b）没有色相可言，返回 0 由调用方如实记进 genMeta */
export function hueOfHex(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  if (span === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / span) % 6;
  else if (max === g) h = (b - r) / span + 2;
  else h = (r - g) / span + 4;
  return (h / 6 + 1) % 1;
}

/**
 * 从一张参考图量出色相锚点。三条拒绝路径都带回原因，**绝不返回"没有锚点，随便生成一张"**：
 * 那条路让"生成变体"这个按钮变成一个说谎的按钮。
 */
async function hueAnchorOfReference(
  assetId: string,
  userId: string,
): Promise<{ ok: true; hue: number; dominant: string } | { ok: false; message: string }> {
  const file = await openAssetForOwner(assetId, userId);
  if (!file) return { ok: false, message: `参考图 ${assetId} 不在这个项目里，或者你并不拥有它` };
  const measured = extractVisualDna(file.bytes, { assetId });
  if (!measured.ok) return { ok: false, message: `这张参考图量不出颜色：${measured.reason}` };
  const dominant = measured.stats.palette[0]?.color;
  if (!dominant) return { ok: false, message: '这张参考图没有可复用的主色' };
  return { ok: true, hue: hueOfHex(dominant), dominant };
}

export async function generateDemoImage(input: GenerateImageInput): Promise<GenerateImageOutcome> {
  const width = input.width ?? DEFAULT_EDGE;
  const height = input.height ?? DEFAULT_EDGE;
  const seed = input.seed ?? 0;

  // 参考图先解析再谈额度：解析失败是一次输入错误，不该留下一行任务、也不该碰额度
  let anchor: { hue: number; dominant: string } | null = null;
  if (input.referenceAssetId) {
    const measured = await hueAnchorOfReference(input.referenceAssetId, input.userId);
    if (!measured.ok) return { ok: false, code: 'invalid_input', message: measured.message };
    anchor = { hue: measured.hue, dominant: measured.dominant };
  }

  const issues = synthLimitViolations({ prompt: input.prompt, width, height, seed, hueAnchor: anchor?.hue });
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
    input: {
      prompt: input.prompt.slice(0, 500),
      width,
      height,
      seed,
      ...(input.referenceAssetId ? { referenceAssetId: input.referenceAssetId } : {}),
    },
  });

  const synth = synthesizeDemoImage({ prompt: input.prompt, width, height, seed, hueAnchor: anchor?.hue });
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
      // 事后要能看出这一张是"以哪张图为参考、用了它哪个主色量的色相"，
      // 而不是只写着 prompt——否则变体与原图的关系只存在于界面上
      ...(input.referenceAssetId ? { referenceAssetId: input.referenceAssetId } : {}),
      ...(anchor ? { hueAnchor: anchor.hue, referenceDominant: anchor.dominant } : {}),
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
    detail: `一张 ${synth.width}×${synth.height} 的图片（DEMO 本地合成${input.referenceAssetId ? `，以 ${input.referenceAssetId} 为参考的变体` : ''}）`,
  });

  return { ok: true, asset: ingested.asset, taskId, reused: ingested.reused, removed: ingested.removed };
}
