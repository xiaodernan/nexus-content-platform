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
 *   `from` 说这张图是**谁挂的**：
 *   `'shot'`      — 这一镜自己的 `referenceAssetId`；
 *   `'source'`    — 整片那条箭头带的那张（`source.referenceAssetId`，只有 `image-to-video` 有）；
 *   `'character'` — 这位角色自己的肖像（`assets.character_id` + `genMeta.characterPortrait`，
 *                   由 web 层解析好经 `characterPortraits` 传进来，只有 `character-to-scene` 有）。
 *   这一格不是装饰：渲染器读的是字节，而"这一镜照哪张图演"是界面上要能指认的事——
 *   没有 `from`，一份每镜都没挂图的分镜渲出来全是同一张肖像，与"每镜各挂了一张一样的图"
 *   在计划里同形，而那是两句不同的话。
 * - `card`：没有参考帧时的确定性色卡。它**是**这一镜的画面，不是"加载失败"的占位图
 */
export type RenderSource =
  | { kind: 'reference'; assetId: string; from: 'shot' | 'source' | 'character' }
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
  /**
   * 上一镜的转场长度：混合窗口同时是**上一镜的尾段**与**这一镜的开头**，
   * 所以这一镜的渲染起点比它的时间线起点早这么多毫秒。
   * 第一镜前面什么都没有，所以是 0。
   */
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
  /**
   * 有多少镜的画面来自整片那条箭头带的那张图。
   *
   * 与 `cardCount` 分开数，因为它们是两句不同的话：一个是"这一镜没有可看的，用色卡"，
   * 另一个是"这一镜自己没挂图，但整片那张图顶上了"。合成一个数就分不清
   * "12 镜全渲成了同一张图"与"12 镜里 8 镜是色卡"。
   */
  sourceReferenceCount: number;
  /**
   * 有多少镜的画面来自角色肖像（`character-to-scene` 箭头命中的那些镜）。
   *
   * 与 `sourceReferenceCount` 也分开数：整片带一张图是作者挑的"同一张"，
   * 肖像是 web 层**按角色 id 解析出来的 N 张**（不同角色不同肖像）——
   * 数色卡看不见它、数整片那张也不是它。
   */
  characterPortraitCount: number;
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
 * 色卡取色：FNV-1a 散列 shotId → 色相 → `#rrggbb`。
 *
 * 不是随机——同一个 shotId 永远是同一个颜色（§16 要能重放），
 * 而不同的镜头拿到不同的颜色，拼起来才分得清哪一帧是哪一镜。
 *
 * 输出**十六进制**而不是 `hsl(...)`：下游是 ffmpeg 的 `color` 源，它只认
 * `0xRRGGBB` 与颜色名。把 HSL 留给渲染器去解析，等于让每个渲染器各写一遍
 * 颜色解析——那是第二份真值（§16 要避免的那件事）。
 */
export function cardColor(shotId: string): string {
  let h = 2166136261;
  for (const ch of shotId) h = (h ^ ch.codePointAt(0)!) * 16777619;
  const hue = ((h >>> 0) % 360) / 360;
  // 明度压在 22%：深底才能让白色 caption 读得清，也压得住 Demo 标识的刺眼感
  return hslToHex(hue, 0.42, 0.22);
}

/** HSL → `#rrggbb`。标准变换，没有取巧：同一组 (h,s,l) 永远得到同一个 hex */
export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 1) + 1) % 1) * 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const m = l - c / 2;
  const to = (v: number): string =>
    Math.round(Math.min(1, Math.max(0, v + m)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r!)}${to(g!)}${to(b!)}`;
}

/**
 * 时间线 → 渲染计划。
 *
 * 一镜有没有参考帧，决定它这一段的画面从哪来；这不改变时长与顺序——
 * 分镜仍是唯一真值（§16），这一层只解释"怎么演出来"。
 *
 * **箭头也进这里**（M5 第三十八片）。以前 `planVideoRender` 只看 `shot.referenceAssetId`，
 * 于是 `storyboard.source` 那一格（箭头 + 整片的出处）在保存时验归属、在界面上显示，
 * 到了渲染这一步**一个字都不读**：一份 `image-to-video` 的分镜如果每镜都没单独挂图，
 * 渲出来全是确定性色卡，而界面上"参考图 → 视频"那句话看起来像是被兑现了。
 * 现在规则是：`image-to-video` 带的那张图补进**自己没挂图**的那些镜（每镜自己的优先，
 * 那是作者更具体的决定），补了几镜写进 `notes`。
 *
 * `character-to-scene` 在模型里兑现：角色不是一张图，肖像是一件资产，
 * 而"查这位角色的肖像"是 IO——模型不许查库（这个包的三条纪律之一）。
 * 所以肖像一律由 web 层解析好、经 `options.characterPortraits` 递进来：
 * 模型只看字典，不连库——同一个字典投影两次逐字段相同（§16）。
 * 没递进来 / 角色没有肖像 → 这些镜渲成色卡，但**这句限度不再沉默**：
 * 说清是哪几位角色、为什么、作者现在能做什么。
 */
export interface PlanVideoRenderOptions {
  /**
   * 角色 id → 肖像资产 id。web 层按 `assets.character_id` + `genMeta.characterPortrait`
   * 解析（同一位角色取最新那张），只读字典；模型不读不写库。
   * 只在 `source.arrow === 'character-to-scene'` 时被读取。
   */
  characterPortraits?: Readonly<Record<string, string>>;
}

export function planVideoRender(storyboard: Storyboard, options: PlanVideoRenderOptions = {}): VideoRenderPlan {
  const notes: string[] = [];
  const segments: RenderSegment[] = [];
  let cursor = 0;
  let cardCount = 0;
  let sourceReferenceCount = 0;
  let characterPortraitCount = 0;

  // 整片那一张：只有 `image-to-video` 这条箭头要它，也只有那条箭头该用它
  const wholePiece =
    storyboard.source.arrow === 'image-to-video' ? storyboard.source.referenceAssetId : undefined;
  // 角色肖像递进来的那一格：只有 `character-to-scene` 这条箭头读它（与整片那张同一条纪律）
  const portraitsNeeded = storyboard.source.arrow === 'character-to-scene';
  const missingPortraits = new Set<string>();
  const portraitsIgnored = !portraitsNeeded && options.characterPortraits && Object.keys(options.characterPortraits).length > 0
    ? Object.keys(options.characterPortraits).length
    : 0;

  storyboard.shots.forEach((shot, index) => {
    const portrait =
      portraitsNeeded && shot.characterId && !shot.referenceAssetId
        ? options.characterPortraits?.[shot.characterId]
        : undefined;
    if (
      portraitsNeeded &&
      !shot.referenceAssetId &&
      shot.characterId &&
      !portrait
    ) {
      missingPortraits.add(shot.characterId);
    }
    const source: RenderSource = shot.referenceAssetId
      ? { kind: 'reference', assetId: shot.referenceAssetId, from: 'shot' }
      : wholePiece
        ? { kind: 'reference', assetId: wholePiece, from: 'source' }
        : portrait
          ? { kind: 'reference', assetId: portrait, from: 'character' }
          : { kind: 'card', color: cardColor(shot.id), caption: shot.prompt.slice(0, CARD_CAPTION_MAX) };
    if (source.kind === 'card') cardCount += 1;
    if (source.kind === 'reference' && source.from === 'source') sourceReferenceCount += 1;
    if (source.kind === 'reference' && source.from === 'character') characterPortraitCount += 1;
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
      // 混合窗口 = 上一镜的尾段 + 这一镜的开头。第一镜前面什么都没有，所以是 0
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
    // 箭头那一格进没进像素，必须逐句说出来。三种形状是三句话，不是一条 note 管两种情况：
    // 补上了、整片那张被每镜自己的图盖住、以及这条箭头压根没有可进的东西。
    if (sourceReferenceCount > 0) {
      notes.push(
        `${sourceReferenceCount}/${total} 镜自己没挂参考帧，画面来自 image-to-video 带的那张整片参考图（source.referenceAssetId）：整片从同一张图出发，与每镜各挂一张是两件事。`,
      );
    } else if (wholePiece) {
      notes.push(
        'image-to-video 带的那张整片参考图这次没有进画面：每一镜都有自己的参考帧，更具体的那个决定赢。',
      );
    }
    // 箭头不认但留着的东西：界面上看得见"选了图/角色"，渲染里看不见"这张图没用上"——
    // 那是两句不同的话，少一句就是假诚实（上一片发现的静默格子）。
    if (portraitsIgnored > 0) {
      notes.push(
        `${portraitsIgnored} 个角色的肖像被递进来了，但 ${storyboard.source.arrow} 这条箭头不读它——这些肖像这次渲染不进画面。换成 character-to-scene 才会进。`,
      );
    }
    // character-to-scene 进没进像素：肖像递进来了就进（from: 'character'），缺就说清哪几位、为什么、怎么办
    if (storyboard.source.arrow === 'character-to-scene') {
      if (characterPortraitCount > 0) {
        notes.push(
          `${characterPortraitCount}/${total} 镜自己没挂参考帧，画面来自 character-to-scene 箭头递进的角色肖像（web 层按 assets.character_id + genMeta.characterPortrait 解析到的那张）：角色进像素了。`,
        );
      }
      if (missingPortraits.size > 0) {
        const ids = [...missingPortraits];
        const shown = ids.slice(0, 3).map((id) => `…${id.slice(-6)}`).join('、');
        notes.push(
          `${ids.length} 位角色没有肖像可递进来（web 层按 assets.character_id + genMeta.characterPortrait 解析不到：${shown}${ids.length > 3 ? ` 等 ${ids.length} 位` : ''}）——先给角色生成肖像（Studio 图片面板「生成角色肖像」）再回来渲染；挂了角色但没有肖像的镜头渲成色卡。`,
        );
      }
      if (characterPortraitCount === 0 && missingPortraits.size === 0 && cardCount > 0) {
        // 箭头选了 character-to-scene 但镜头上一个 characterId 都没挂（不可能有肖像可递）——
        // 这不是"缺肖像"，是"没挂角色"，两句话不同，别并成一句
        notes.push(
          'character-to-scene 这条箭头要镜头挂角色才有人进像素：这份分镜的镜头上没有挂角色（也没有肖像可递进来），渲成色卡。先给镜头挂上 characterId，并为角色生成肖像。',
        );
      }
    }
    // 箭头不认但留着的东西：界面上看得见"选了图/角色"，渲染里看不见"这张图没用上"——
    // 那是两句不同的话，少一句就是假诚实（上一片发现的静默格子）。
    if (storyboard.source.arrow !== 'image-to-video' && storyboard.source.referenceAssetId) {
      notes.push(
        `source.referenceAssetId 带着那张图，但 ${storyboard.source.arrow} 这条箭头不读它——这张图这次渲染不进画面。换成 image-to-video 才会进。`,
      );
    }
    if (storyboard.source.arrow !== 'character-to-scene' && storyboard.source.characterId) {
      notes.push(
        `source.characterId 带着那位角色，但 ${storyboard.source.arrow} 这条箭头不读它——这位角色这次渲染不进画面。换成 character-to-scene 才会进。`,
      );
    }
    const transitions = storyboard.shots.filter((s) => s.transition !== 'cut').length;
    notes.push(
      transitions > 0
        ? `${transitions} 镜的下一衔接是转场（fade/dissolve/wipe），按 ${RENDER_FPS}fps 交叉淡入淡出；cut 不占用额外时间。`
        : '所有衔接都是硬切（cut）：不需要两段画面重叠，渲染最快。',
    );
    // 最后一镜的 transitionOut 后面没有镜头，所以它谁也不衔接——说出来，
    // 否则界面上"这一镜标了 dissolve"会让人以为片尾还有一次叠化
    const last = storyboard.shots[storyboard.shots.length - 1]!;
    if (last.transition !== 'cut') {
      notes.push(
        `最后一镜标的是 ${last.transition}，但它后面没有镜头：这个转场不产生任何效果，改它不会改变成片。`,
      );
    }
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
    sourceReferenceCount,
    characterPortraitCount,
    demo: true,
    notes,
  };
}
