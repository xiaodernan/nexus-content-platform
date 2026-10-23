/**
 * §40 最后一格的模型半片：时间线 → **可渲染的帧计划**。
 *
 * 为什么先有这一层：`timelineOf` 早已把"哪一镜从第几毫秒到第几毫秒"算清楚，
 * 但它答不了"这一段时间里画面上出现什么"。那一格以前只能空着——
 * 本机没有视频 provider（§79 的 `generateVideo()` / `imageToVideo()` 要真 key），
 * 于是 `playable` 一直是 false，时间线改得动但播不了。
 *
 * 这一片不伪造 provider，它做的是**把"没有 provider 时能诚实做出来的那一半"定成契约**：
 * 有参考帧的镜头推演它（推拉/摇移），没有参考帧的镜头用一张确定性色卡占位，
 * 产物是一份**渲染计划**——谁在第几毫秒、画面从哪来、怎么动、和下一镜怎么接。
 * 渲染器（ffmpeg）照着它做就行，不需要再猜任何一个决定。
 *
 * 三条纪律与包里其余部分一致：
 * 1. **纯函数**：无 IO、无随机、无时钟。同一份分镜两次投影逐字段相同。
 * 2. **每一个解释都进 `notes`**：色卡占位、转场吃尾段、总时长怎么来的，界面上原样显示。
 * 3. **DEMO 要说清是 DEMO**：计划自带 `demo: true`，像素来自本地推演，不是 AI 生成（§159/§160）。
 *    把它当真 provider 的产物显示，就是本节要避免的那件事。
 */

import type { ShotCamera, ShotTransition, Storyboard } from './index';

/** 输出规格。30fps / 720p：面板里看得清，一台 16GB 的机器也渲得动 */
export const RENDER_FPS = 30;
export const RENDER_WIDTH = 1280;
export const RENDER_HEIGHT = 720;

/**
 * 转场占用这一镜**尾段**的毫秒数。吃尾段而不是另加一段时间：
 * 时间线的总时长必须等于各镜时长之和，否则 trim 改一镜长度时转场会偷偷变长。
 * `cut` 是 0——硬切不需要两段画面重叠。
 */
export const TRANSITION_MS: Record<ShotTransition, number> = {
  cut: 0,
  fade: 400,
  dissolve: 600,
  wipe: 500,
};

/** 转场在 ffmpeg `xfade` 里的名字。`cut` 不在表里——它不走 xfade，直接接 */
export const XFADE_NAMES: Record<Exclude<ShotTransition, 'cut'>, string> = {
  fade: 'fade',
  dissolve: 'dissolve',
  wipe: 'wipeleft',
};

/**
 * 一镜的画面从哪来。
 * - `reference`：推演这一镜的参考帧（资产 id，不是字节）
 * - `card`：没有参考帧时的确定性色卡。它**是**这一镜的画面，不是"加载失败"的占位图
 */
export type RenderSource =
  | { kind: 'reference'; assetId: string }
  | { kind: 'card'; color: string; caption: string };

/**
 * 推演参数：缩放 + 平移，单位都是**输出帧**的比例。
 *
 * 为什么不直接用归一化裁剪框：源图长宽比五花八门（竖构图、方形、宽幅），
 * 裁剪框要在"保持比例"和"恰好铺满输出帧"之间二选一，选哪个都会在某一档素材上变形。
 * 缩放 + 平移没有这个问题：渲染器先按 cover 适配，再按这里的比例推拉平移，
 * 输出帧永远是 16:9，变不变形由素材自己决定，不由计划决定。
 */
export interface RenderMotion {
  fromScale: number;
  toScale: number;
  /** 平移量，单位是输出帧宽/高的比例（0.12 = 横向移过一帧的 12%） */
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface RenderSegment {
  shotId: string;
  /** 在分镜里的序号（0 起）：色卡配色与备注都按它说话 */
  index: number;
  startMs: number;
  durationMs: number;
  source: RenderSource;
  /** 色卡是满屏静态画面，没有推演——它没有可推的东西 */
  motion?: RenderMotion;
  /** 这一镜与**下一镜**怎么接 */
  transitionOut: ShotTransition;
  /** 上一镜的转场吃掉的，属于这一镜尾段的毫秒数 */
  transitionInMs: number;
}

export interface VideoRenderPlan {
  storyboardId: string;
  width: number;
  height: number;
  fps: number;
  totalMs: number;
  segments: RenderSegment[];
  /** 一帧都排不出来时为 false：没有镜头，或所有镜头时长都是 0 */
  renderable: boolean;
  /** 有多少镜在用色卡占位：DEMO 标识的依据，界面上要显示这个数 */
  cardCount: number;
  /** 固定为 true：这一份计划产出的像素来自本地推演，不是 provider 生成 */
  demo: true;
  notes: string[];
}

/**
 * 机位 → 推演。规则写死在这里，可预期：
 * - `wide` 缓慢推近（交代环境，不抢戏）；
 * - `medium` / `close` 小幅推拉，幅度比 wide 小——中近景再大动就晕；
 * - `detail` 推得最狠：特写要的是"贴上去看"；
 * - `tracking` 不缩放只横摇（跟移），`aerial` 只纵摇（航拍下滑）。
 *
 * 每条都给出起止两个值而不是"每帧加一点"：同一份分镜两次投影必须逐字段相同（§16），
 * 而"每帧累加"那种写法在浮点上会漂。
 */
const CAMERA_MOTION: Record<ShotCamera, RenderMotion> = {
  wide: { fromScale: 1.0, toScale: 1.08, fromX: 0, fromY: 0, toX: 0, toY: 0 },
  medium: { fromScale: 1.06, toScale: 1.14, fromX: 0, fromY: 0, toX: 0, toY: 0 },
  close: { fromScale: 1.3, toScale: 1.18, fromX: 0, fromY: 0, toX: 0, toY: 0 },
  detail: { fromScale: 1.6, toScale: 1.85, fromX: 0, fromY: 0, toX: 0, toY: 0 },
  tracking: { fromScale: 1.12, toScale: 1.12, fromX: 0, fromY: 0, toX: 0.18, toY: 0 },
  aerial: { fromScale: 1.12, toScale: 1.12, fromX: 0, fromY: 0, toX: 0, toY: 0.16 },
};

/** 色卡的 caption 截到这么长：卡片上要放得下一行字 */
const CARD_CAPTION_MAX = 24;

/**
 * 色卡取色：FNV-1a 散列 shotId → 色相。
 * 不是随机——同一个 shotId 永远是同一个颜色（§16 要能重放），
 * 而不同的镜头拿到不同的颜色，拼起来才分得清哪一帧是哪一镜。
 */
function cardColor(shotId: string): string {
  let h = 2166136261;
  for (const ch of shotId) h = (h ^ ch.codePointAt(0)!) * 16777619;
  const hue = (h >>> 0) % 360;
  // 明度压在 22%：深底才能让白色 caption 读得清，也压得住 Demo 标识的刺眼感
  return `hsl(${hue} 42% 22%)`;
}

/**
 * 时间线 → 渲染计划。
 *
 * 一镜有没有参考帧，决定它这一段的画面从哪来；这不改变时长与顺序——
 * 分镜仍是唯一真值（§16），这一层只解释"怎么演出来"。
 */
export function planVideoRender(storyboard: Storyboard): VideoRenderPlan {
  const notes: string[] = [];
  const segments: RenderSegment[] = [];
  let cursor = 0;
  let cardCount = 0;

  storyboard.shots.forEach((shot, index) => {
    const source: RenderSource = shot.referenceAssetId
      ? { kind: 'reference', assetId: shot.referenceAssetId }
      : { kind: 'card', color: cardColor(shot.id), caption: shot.prompt.slice(0, CARD_CAPTION_MAX) };
    if (source.kind === 'card') cardCount += 1;
    const previous = storyboard.shots[index - 1];
    segments.push({
      shotId: shot.id,
      index,
      startMs: cursor,
      durationMs: shot.durationMs,
      source,
      // 色卡没有可推的画面：给它一套"不动"的推演等于假装有运动
      ...(source.kind === 'reference' ? { motion: CAMERA_MOTION[shot.camera] } : {}),
      transitionOut: shot.transition,
      // 上一镜的转场吃的是这一镜的开头；第一镜前面什么都没有，所以是 0
      transitionInMs: index === 0 ? 0 : TRANSITION_MS[previous!.transition],
    });
    cursor += shot.durationMs;
  });

  const total = storyboard.shots.length;
  if (total === 0) {
    notes.push('还没有镜头：没有可渲染的内容。先写一句话切出分镜。');
  } else {
    notes.push(
      `总时长 ${cursor} 毫秒 = 各镜时长之和；转场吃每一镜的尾段，不额外加时间（否则 trim 一镜就会偷偷改变总长）。`,
    );
    if (cardCount > 0) {
      notes.push(
        `${cardCount}/${total} 镜没有参考帧，用确定性色卡占位：色卡就是这一镜的画面，不是"素材加载失败"。`,
      );
    }
    const transitions = storyboard.shots.filter((s) => s.transition !== 'cut').length;
    notes.push(
      transitions > 0
        ? `${transitions} 镜带转场（fade/dissolve/wipe），按 ${RENDER_FPS}fps 交叉淡入淡出；cut 不占用额外时间。`
        : '所有衔接都是硬切（cut）：不需要两段画面重叠，渲染最快。',
    );
    notes.push(
      `本机没有视频 provider（§79 的 generateVideo / imageToVideo 要真 key）：这份计划由本地确定性推演产出，像素是 DEMO，不是 AI 生成。`,
    );
  }

  return {
    storyboardId: storyboard.id,
    width: RENDER_WIDTH,
    height: RENDER_HEIGHT,
    fps: RENDER_FPS,
    totalMs: cursor,
    segments,
    renderable: segments.length > 0 && cursor > 0,
    cardCount,
    demo: true,
    notes,
  };
}
