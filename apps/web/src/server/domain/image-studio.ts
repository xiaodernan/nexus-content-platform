import type { AssetRef } from '@nexus/design-model';
import { finishTask, startTask } from './agent-tasks';
import { listProjectAssets, openAssetForOwner, uploadImageAsset } from './assets';
import { refusalForRun } from './credit-ledger';
import { listCharacters } from './characters';
import { emit } from './notifications';
import { synthLimitViolations, synthesizeDemoImage } from './image-synth';
import { extractVisualDna, type PixelStats } from './visualDna';

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
  /**
   * §39 / §40 的 Character → Scene：为项目里的某个角色生成"它在另一个场景里"。
   * 色相锚点取自角色档案的 `visualIdentity.palette`（§39 那一栏），所以同一角色的不同场景
   * 共享同一份色调身份——这一条是**可测的**，不是"尽量保持一致"那句口号。
   * 可以与 `referenceAssetId` 同时给，但那张参考图**必须是这个角色自己的肖像**（服务端按
   * `assets.character_id` + `genMeta.characterPortrait` 验）——这就是 §39 要的"同一个角色在
   * 不同场景里认得出"：档案给语义，肖像给实际像素的色调。与 `generateCharacterPortrait` 仍互斥。
   */
  characterId?: string;
  /**
   * §39 的角色一致性生成：为角色生成它自己的参考图（portrait）。
   * 与 `characterId` 搭配使用；`prompt` 将被忽略，改用角色档案的 visualIdentity + profile
   * 组装成角色描述 prompt。产出资产打上 `characterPortrait: true` 标记，
   * 供后续 Character → Scene 以 `referenceAssetId` 复用，实现跨场景一致性。
   * 与 `referenceAssetId` 互斥。
   */
  generateCharacterPortrait?: boolean;
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
      code: 'invalid_input' | 'credits_exhausted' | 'storage_exhausted' | 'asset_rejected' | 'synth_failed';
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
 * 从一张参考图量出色相锚点与更多统计值。三条拒绝路径都带回原因，**绝不返回"没有锚点，随便生成一张"**：
 * 那条路让"生成变体"这个按钮变成一个说谎的按钮。
 */
async function hueAnchorOfReference(
  assetId: string,
  userId: string,
): Promise<{ ok: true; hue: number; dominant: string; stats: PixelStats } | { ok: false; message: string }> {
  const file = await openAssetForOwner(assetId, userId);
  if (!file) return { ok: false, message: `参考图 ${assetId} 不在这个项目里，或者你并不拥有它` };
  const measured = extractVisualDna(file.bytes, { assetId });
  if (!measured.ok) return { ok: false, message: `这张参考图量不出颜色：${measured.reason}` };
  const dominant = measured.stats.palette[0]?.color;
  if (!dominant) return { ok: false, message: '这张参考图没有可复用的主色' };
  return { 
    ok: true, 
    hue: hueOfHex(dominant), 
    dominant,
    stats: measured.stats 
  };
}

export async function generateDemoImage(input: GenerateImageInput): Promise<GenerateImageOutcome> {
  const width = input.width ?? DEFAULT_EDGE;
  const height = input.height ?? DEFAULT_EDGE;
  const seed = input.seed ?? 0;

  // 参考图/角色先解析再谈额度：解析失败是一次输入错误，不该留下一行任务、也不该碰额度
  // 肖像不接受参考图：它**由档案驱动**，混进一张图当参考，"由档案驱动"这句话就又不成立了
  if (input.referenceAssetId && input.generateCharacterPortrait) {
    return {
      ok: false,
      code: 'invalid_input',
      message: '角色肖像由档案驱动，不接受参考图。要复用某个角色的肖像，就生成它的场景（不要带 generateCharacterPortrait）',
    };
  }
  // 角色肖像没有角色就无从谈起：它要读的是那份档案。这条判定以前写成
  // `characterId && generateCharacterPortrait && !characterId`——前后自相矛盾，
  // 永远为假，等于这道口从来没关上（typecheck 与 eslint 都看不出来）
  if (input.generateCharacterPortrait && !input.characterId) {
    return {
      ok: false,
      code: 'invalid_input',
      message: 'generateCharacterPortrait 需要同时提供 characterId',
    };
  }
  let anchor: { hue: number; dominant: string; stats?: PixelStats } | null = null;
  let effectivePrompt = input.prompt;
  let isCharacterPortrait = false;
  if (input.referenceAssetId) {
    const measured = await hueAnchorOfReference(input.referenceAssetId, input.userId);
    if (!measured.ok) return { ok: false, code: 'invalid_input', message: measured.message };
    anchor = { hue: measured.hue, dominant: measured.dominant, stats: measured.stats };
  }
  if (input.characterId) {
    const roster = await listCharacters(input.projectId);
    const found = roster.items.find((c) => c.id === input.characterId);
    if (!found) {
      return {
        ok: false,
        code: 'invalid_input',
        message: `角色 ${input.characterId} 不在这个项目里${roster.unreadable.length ? `（另有 ${roster.unreadable.length} 个角色档案读不动）` : ''}`,
      };
    }
    // 参考图 + 角色同时给，只允许照**这个角色自己的肖像**画：
    // 拿别人的图、或拿这个角色另一张场景当参考，"这张图照谁画"就又说不清了
    if (input.referenceAssetId) {
      const refs = await listProjectAssets(input.projectId);
      const ref = refs.find((r) => r.id === input.referenceAssetId);
      if (!ref?.characterPortrait || ref.characterId !== input.characterId) {
        return {
          ok: false,
          code: 'invalid_input',
          message: '带角色时的参考图必须是这个角色自己的肖像：先给它生成肖像，再拿那张肖像生成场景',
        };
      }
    }
    const palette = found.profile.visualIdentity.palette;
    const first = palette.find((color) => /^#[0-9a-f]{6}$/i.test(color));
    if (!first) {
      return {
        ok: false,
        code: 'invalid_input',
        message: `角色「${found.profile.name}」还没有可用的视觉标识：palette 是空的。先补 §39 那一栏，再来生成它的场景`,
      };
    }
    // 同时给了参考图（上一段已验过它就是这个角色的肖像）时，锚点用**量自那张图像素**的那个：
    // "照这张图画"照的是它实际长什么样，而不是档案里声明的那份颜色
    anchor ??= { hue: hueOfHex(first), dominant: first };
    // §39 的四栏从这里开始**已经在报文里**：身份 / 穿着 / 画风 / 特征拼进交给合成器与任务行的 prompt。
    // 说清楚边界：DEMO 合成器只认 prompt 的哈希，画不出"靛蓝斗篷"这四个字的语义——
    // 但换真 provider 时不必再动链路，这一格欠的是像素，不是接线。
    const vi = found.profile.visualIdentity;
    const silhouette = vi.silhouette ? `轮廓：${vi.silhouette}` : '';
    const motifs = vi.motifs.length ? `标志：${vi.motifs.join('、')}` : '';
    const traits = found.profile.traits.length ? `特征：${found.profile.traits.join('、')}` : '';
    const look = [
      found.profile.identity ? `身份：${found.profile.identity}` : '',
      found.profile.clothing ? `穿着：${found.profile.clothing}` : '',
      found.profile.style ? `画风：${found.profile.style}` : '',
      silhouette,
      motifs,
      traits,
    ]
      .filter(Boolean)
      .join('；');
    if (input.generateCharacterPortrait) {
      // Character Portrait：忽略用户 prompt，完全由角色档案驱动
      effectivePrompt = `角色肖像｜${look}`.trim();
      isCharacterPortrait = true;
    } else {
      // Character → Scene：用户 prompt + 角色档案
      effectivePrompt = [input.prompt, look].filter(Boolean).join('｜');
    }
  }

  const issues = synthLimitViolations({ prompt: effectivePrompt, width, height, seed, hueAnchor: anchor?.hue });
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
      prompt: effectivePrompt.slice(0, 500),
      width,
      height,
      seed,
      ...(input.referenceAssetId ? { referenceAssetId: input.referenceAssetId } : {}),
      ...(input.characterId ? { characterId: input.characterId } : {}),
      ...(input.generateCharacterPortrait ? { generateCharacterPortrait: true } : {}),
    },
  });

  const synth = synthesizeDemoImage({ 
    prompt: effectivePrompt, 
    width, 
    height, 
    seed, 
    hueAnchor: anchor?.hue,
    referenceStats: anchor?.stats ? {
      meanLuminance: anchor.stats.meanLuminance,
      luminanceStdev: anchor.stats.luminanceStdev,
      meanSaturation: anchor.stats.meanSaturation,
      edgeDensity: anchor.stats.edgeDensity,
      warmth: anchor.stats.warmth,
    } : undefined,
  });
  if (!synth.ok) {
    await finishTask(taskId, { ok: false, error: `合成失败：${synth.issues.join('；')}` });
    return { ok: false, code: 'synth_failed', message: '本地合成器没有给出图片', issues: synth.issues };
  }

  // 与用户上传走同一道摄取门，不给生成物开后门
  const ingested = await uploadImageAsset(input.projectId, {
    data: synth.bytes,
    filename: nameOf(isCharacterPortrait ? `角色肖像：${effectivePrompt}` : input.prompt),
    createdById: input.userId,
    source: 'generated',
    ...(input.characterId ? { characterId: input.characterId } : {}),
    genMeta: {
      prompt: effectivePrompt,
      provider: synth.genMeta.provider,
      model: synth.genMeta.model,
      seed,
      demoMode: synth.genMeta.demoMode,
      width: synth.width,
      height: synth.height,
      taskId,
      // 事后要能看出这一张是"以哪张图/哪个角色为来源、用了它哪个主色量的色相"，
      // 而不是只写着 prompt——否则变体与原图（或场景与角色）的关系只存在于界面上
      ...(input.referenceAssetId ? { referenceAssetId: input.referenceAssetId } : {}),
      ...(input.characterId ? { characterId: input.characterId } : {}),
      ...(input.generateCharacterPortrait ? { characterPortrait: true } : {}),
      ...(anchor ? { hueAnchor: anchor.hue, anchorDominant: anchor.dominant } : {}),
    },
  });
  if (!ingested.ok) {
    await finishTask(taskId, { ok: false, error: `生成物未通过资产摄取门：${ingested.reason}` });
    // 摄取门有两种拒法，别混成一句：存储配额满了不是"生成物不合格"，
    // 用户该做的是删素材（或换档），而不是换个 prompt 再试一次。
    return {
      ok: false,
      code: ingested.code === 'storage_exhausted' ? 'storage_exhausted' : 'asset_rejected',
      message: ingested.reason,
      issues: ingested.issues,
    };
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
