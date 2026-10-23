/**
 * §40-42 的模型半片：分镜（Storyboard）→ 镜头表（Shot list）→ 时间线（Timeline）的**数据结构与投影**。
 *
 * 需求原文那条流程是 `Prompt → Storyboard → Shot list → Image references → Video generation → Timeline`。
 * 这一包里只有前三步能是真的：本机没有视频 provider，所以 `videoAssetId` 只能一直是空，
 * 时间线因此**不可播**——这不是半成品，是"没来源的那一格明说没有"（§159）。
 * `render.ts` 补上的是"没有 provider 时能诚实做出来的那一半"：把时间线投影成一份
 * 渲染计划（推演参考帧 + 确定性色卡），像素明码标注是 DEMO。它不冒充 provider 生成。
 *
 * 三条纪律与仓库其余模型包一致：
 * 1. **纯函数**：无 IO、无随机、无时钟。同一份输入两次投影逐字段相同（§16 的"模型即真值"要能重放）。
 * 2. **投影做的每一个解释都进 `notes`**，界面上要原样显示——与 `GamePlan.notes` 同一口径。
 *    规则本身（谁拿宽景、哪一镜算长镜头）写在注释里，不要求读者去反推代码。
 * 3. **不凑数**：镜头数由断句决定，不会因为"看起来 6 镜比较像分镜"就凭空多写几镜。
 */

export * from './patch';
export * from './render';

/**
 * §41 的 Camera 轨上那些机位。只有这几个：更多机位要真 provider 的运镜控制才有意义。
 * 清单是**运行时常量**，类型从它派生——与 `GAME_KINDS` 同一口径：
 * 契约测试能逐位比 `z.enum` 的清单，而加一个机位只需要在这里多写一项（不会漂出第二份真值）。
 */
export const SHOT_CAMERAS = ['wide', 'medium', 'close', 'detail', 'tracking', 'aerial'] as const;
export type ShotCamera = (typeof SHOT_CAMERAS)[number];

/** 镜与镜之间怎么接。`cut` 是硬切，不需要任何渲染能力，所以它是默认值 */
export const SHOT_TRANSITIONS = ['cut', 'fade', 'dissolve', 'wipe'] as const;
export type ShotTransition = (typeof SHOT_TRANSITIONS)[number];

/** §40 点名的四条箭头 */
export const STORYBOARD_ARROWS = ['text-to-video', 'image-to-video', 'storyboard-to-video', 'character-to-scene'] as const;
export type StoryboardArrow = (typeof STORYBOARD_ARROWS)[number];

export interface StoryboardShot {
  /** 稳定标识：重排不改它，所以 `moveShot` 之后引用仍然指得回同一镜 */
  id: string;
  /** 这一镜要拍什么——就是喂给图像/视频生成的那一句话 */
  prompt: string;
  durationMs: number;
  camera: ShotCamera;
  transition: ShotTransition;
  /** 归属角色（§39 那条链）：有它才能拿"这个角色自己的肖像"当参考帧 */
  characterId?: string;
  /** 已定格的参考帧：来自资产清单的 id，不是字节（§38/§39 那条摄取链的产物） */
  referenceAssetId?: string;
  /** §40 最后一格的产物。本机没有视频 provider，所以这个字段今天只可能是空 */
  videoAssetId?: string;
}

export interface Storyboard {
  id: string;
  title: string;
  source: {
    arrow: StoryboardArrow;
    /** 作者写的那句话，原样留着：投影可以切它，但不能改它 */
    prompt: string;
    referenceAssetId?: string;
    characterId?: string;
  };
  shots: StoryboardShot[];
  /** 投影做的每一个解释与每一条限度 */
  notes: string[];
}

/** 一镜最多切这么多：断句再多也不无限膨胀，超出的并进最后一镜并记进 notes */
export const MAX_SHOTS = 12;

/** 没有运动的镜头默认多长 */
export const DEFAULT_SHOT_MS = 3000;

/**
 * §41 的 trim / extend 在时间线上拖出来的边界。
 *
 * 三个数各管一件事：`SHOT_MS_STEP` 是**吸附**（鼠标画不出整数毫秒，2817 这种数不是作者写的，
 * 是一像素的误差）；`MIN_SHOT_MS` 是下限（拖到比一步更短等于把这一镜拖没了，
 * 而「没有镜头」与「一镜 0 毫秒」是两件事——后者会在时间线上留下一块看不见的方块）；
 * `MAX_SHOT_MS` 与列表里那个数字输入框的上限是**同一个数**：拖拽与手填不走两套规矩。
 *
 * 手填那条路的下限仍然是 1 毫秒（作者自己要写 80ms 的字卡是他的自由，界面不替他改数），
 * 拖拽那条路的下限是一步——两条路的差别只在「输入精度」，不在「什么算合法的一镜」。
 */
export const SHOT_MS_STEP = 100;
export const MIN_SHOT_MS = SHOT_MS_STEP;
export const MAX_SHOT_MS = 600_000;

/** 把拖出来的毫秒吸到刻度上并夹进上下限。非有限数按一步算（一次坏拖拽不该把这一镜变成 NaN） */
export function clampShotDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs)) return MIN_SHOT_MS;
  const snapped = Math.round(durationMs / SHOT_MS_STEP) * SHOT_MS_STEP;
  return Math.max(MIN_SHOT_MS, Math.min(MAX_SHOT_MS, snapped));
}

/**
 * §41 键盘那条 trim 的粗档：Shift + 方向键一次 1 秒。
 *
 * 为什么刻度与拖动**共用** `SHOT_MS_STEP` 而不是键盘自己定一个（比如 500ms）：
 * 两条路改的是同一个 `durationMs`，刻度不同的话键盘调出来的数在拖动那条路上没有对应档位，
 * 作者就会看到"明明调好了，一碰鼠标又跳一下"。
 */
export const SHOT_MS_COARSE_STEP = SHOT_MS_STEP * 10;

/**
 * 键盘按下的方向键 → 毫秒增量。`ArrowRight` 是**加长**（右边缘往右 = 更长），`ArrowLeft` 是缩短。
 *
 * 不管的键返回 `null` 而不是 `0`：`0` 会被调用方当成"一次合法的零步操作"，
 * 于是 `preventDefault` 掉一个本该交给别人的按键——上下方向键要留给面板滚动。
 * 返回 `null` 就是"这个键不是 trim 的"，调用方原样放行。
 */
export function keyboardTrimDelta(key: string, shiftKey: boolean): number | null {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
  const step = shiftKey ? SHOT_MS_COARSE_STEP : SHOT_MS_STEP;
  return key === 'ArrowRight' ? step : -step;
}

/** 句子里出现这些词就当这一镜有运动：时长给足，机位给跟移 */
const MOTION_WORDS = ['跑', '走', '冲', '追', '飞', '游', '跳', '逃', '奔', 'run', 'walk', 'fly', 'chase', 'drive'];

/** 断句用的分隔符：中英标点都吃，连续分隔符不产生空镜 */
const SPLIT = /[。！？；，、\n\r,.!?;]+/;

function slug(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** 确定性 id：内容 + 序号，所以同一句话重排后 id 不变（重排不改内容） */
function shotId(index: number, clause: string): string {
  let h = 2166136261;
  for (const ch of clause) h = (h ^ ch.codePointAt(0)!) * 16777619;
  return `shot-${index + 1}-${((h >>> 0) % 46656).toString(36)}`;
}

function hasMotion(clause: string): boolean {
  const lower = clause.toLowerCase();
  return MOTION_WORDS.some((w) => lower.includes(w));
}

/**
 * 机位分配规则（写死，可预期）：首镜宽景交代环境，尾镜特写收，中间在 中景 / 特写 之间轮转；
 * 带运动的镜头一律给跟移（`tracking`），航拍不在自动规则里——那是作者手动指定的。
 */
function cameraFor(index: number, total: number, clause: string): ShotCamera {
  if (hasMotion(clause)) return 'tracking';
  if (total === 1) return 'medium';
  if (index === 0) return 'wide';
  if (index === total - 1) return 'close';
  return index % 2 === 1 ? 'medium' : 'detail';
}

/**
 * 把一句话切成镜头表。**确定性文本切分，不是 AI 分镜**：
 * 换真 provider 时替换的是这一个函数，前后（存储、投影、界面）不重写。
 * 空句子不编镜头出来——返回空 `shots` 并在 `notes` 里说为什么。
 */
export function planStoryboard(
  prompt: string,
  options: { id?: string; title?: string; arrow?: StoryboardArrow; referenceAssetId?: string; characterId?: string } = {},
): Storyboard {
  const text = slug(prompt);
  const notes: string[] = [];
  const source: Storyboard['source'] = {
    arrow: options.arrow ?? 'text-to-video',
    prompt: text,
    ...(options.referenceAssetId ? { referenceAssetId: options.referenceAssetId } : {}),
    ...(options.characterId ? { characterId: options.characterId } : {}),
  };
  const base: Storyboard = {
    id: options.id ?? 'storyboard-1',
    title: options.title ?? (text ? `${text.slice(0, 24)}` : '未命名分镜'),
    source,
    shots: [],
    notes,
  };
  const clauses = text.split(SPLIT).map(slug).filter(Boolean);
  if (!clauses.length) {
    // 只剩标点或空白：切不出镜头就明说，不拿"0 镜"冒充一次成功的分镜
    notes.push('没有输入句子（只有标点或空白）：分镜是空的，而不是"生成失败"。先写一句话再切镜头。');
    return base;
  }
  if (clauses.length > MAX_SHOTS) {
    // 合并段数要在改动之前量：改完再算就会报出"1 段"这种假数字
    const merged = clauses.length - (MAX_SHOTS - 1);
    const kept = clauses.slice(0, MAX_SHOTS - 1);
    const tail = clauses.slice(MAX_SHOTS - 1).join('，');
    clauses.length = 0;
    clauses.push(...kept, tail);
    notes.push(`断句超过 ${MAX_SHOTS} 段：第 ${MAX_SHOTS} 镜把剩下的 ${merged} 段并成一句，没有另起新镜。`);
  }
  if (clauses.length === 1) {
    notes.push('整句没有可断的标点，所以只有一镜。要更多镜头就把句子分开写。');
  }
  const total = clauses.length;
  notes.push(
    `镜头数 = 断句数（${total}），不凑数；机位规则：首镜宽景、尾镜特写、中间中景/特写轮转，含运动词的句子给跟移。`,
    `时长规则：默认 ${DEFAULT_SHOT_MS} 毫秒，含运动词给 ${DEFAULT_SHOT_MS * 1.5} 毫秒。`,
    '这一版分镜来自本地确定性断句，不是模型给的镜头语言（本机没有视频 provider）。',
  );
  base.shots = clauses.map((clause, index): StoryboardShot => ({
    id: shotId(index, clause),
    prompt: clause,
    durationMs: hasMotion(clause) ? Math.round(DEFAULT_SHOT_MS * 1.5) : DEFAULT_SHOT_MS,
    camera: cameraFor(index, total, clause),
    transition: index === 0 ? 'fade' : 'cut',
    ...(options.characterId ? { characterId: options.characterId } : {}),
    ...(options.referenceAssetId ? { referenceAssetId: options.referenceAssetId } : {}),
  }));
  return base;
}

export interface TimelineClip {
  shotId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  /** Camera 轨上带的是机位；别的轨不填 */
  camera?: ShotCamera;
  /** 这一格为什么存在（界面上 tooltip 用），例如转场 */
  label?: string;
}

export interface TimelineTrack {
  kind: 'video' | 'camera' | 'transition' | 'audio' | 'subtitles' | 'effects';
  clips: TimelineClip[];
  /** 空轨必须说清为什么是空的：缺这一句，界面上一片空白与"渲染失败"就分不开了 */
  emptyReason?: string;
}

export interface Timeline {
  storyboardId: string;
  totalMs: number;
  tracks: TimelineTrack[];
  /** 能播吗：只要有一镜还没有视频帧就不能 */
  playable: boolean;
  blockers: string[];
  notes: string[];
}

/** §41 点名的轨：Track 1 / Track 2 / Audio / Subtitles / Effects / Camera。这里按能力如实摆，空的说明理由 */
const EMPTY_TRACKS: { kind: TimelineTrack['kind']; reason: string }[] = [
  { kind: 'audio', reason: '没有音频 provider，也没有配音/音乐来源：这一轨是空的，不是渲染失败。' },
  { kind: 'subtitles', reason: '字幕要真渲染（时间轴上的文字层），今天只有镜头文本，没有烧制能力。' },
  { kind: 'effects', reason: '特效要视频编辑器的实际处理能力，模型层不假装有。' },
];

/**
 * 时间线是**投影**，不是第二份真值（§16）：它只从 `storyboard.shots` 算偏移，
 * 任何一镜的长度变化都要重算，界面上 trim/extend 改的必须是分镜本身。
 */
export function timelineOf(storyboard: Storyboard): Timeline {
  const notes: string[] = [];
  const blockers: string[] = [];
  let cursor = 0;
  const clips: TimelineClip[] = [];
  for (const shot of storyboard.shots) {
    const startMs = cursor;
    const endMs = cursor + shot.durationMs;
    clips.push({ shotId: shot.id, startMs, endMs, durationMs: shot.durationMs });
    cursor = endMs;
  }
  const missing = storyboard.shots.filter((s) => !s.videoAssetId).length;
  if (!storyboard.shots.length) {
    blockers.push('还没有镜头：这一条时间线是空的，先切一句分镜。');
  }
  if (missing) {
    blockers.push(
      `有 ${missing}/${storyboard.shots.length} 镜还没有视频帧：§40 的 Video generation 那一格要真 provider，本机不假造像素。`,
    );
    notes.push('时间线可以编辑（长度、顺序、转场、提示词），但不能播放——缺的是帧，不是布局。');
  }
  const tracks: TimelineTrack[] = [
    { kind: 'video', clips },
    {
      kind: 'camera',
      clips: storyboard.shots.map((shot) => ({
        shotId: shot.id,
        startMs: clips.find((c) => c.shotId === shot.id)?.startMs ?? 0,
        endMs: clips.find((c) => c.shotId === shot.id)?.endMs ?? 0,
        durationMs: shot.durationMs,
        camera: shot.camera,
      })),
    },
    {
      kind: 'transition',
      clips: storyboard.shots
        .filter((shot) => shot.transition !== 'cut')
        .map((shot) => ({
          shotId: shot.id,
          startMs: clips.find((c) => c.shotId === shot.id)?.startMs ?? 0,
          endMs: clips.find((c) => c.shotId === shot.id)?.startMs ?? 0,
          durationMs: 0,
          label: shot.transition,
        })),
    },
    ...EMPTY_TRACKS.map((t) => ({ kind: t.kind, clips: [] as TimelineClip[], emptyReason: t.reason })),
  ];
  return {
    storyboardId: storyboard.id,
    totalMs: cursor,
    tracks,
    playable: storyboard.shots.length > 0 && missing === 0,
    blockers,
    notes,
  };
}

/** 空分镜：新建项目里那一格"还没有分镜"的样子，与"切完是 0 镜"共用同一个形状 */
/**
 * §41 片段级裁切：把一镜在 `atMs`（**相对这一镜左边缘**）处切成两镜。
 *
 * 切的是时间线，不是像素：两半共享同一份 `prompt` 与同一张参考帧/视频帧的引用——
 * "按帧切开素材"要真 provider 的剪辑能力，模型层不假装有（§159）。所以：
 * - 前半**原样保留 id**（引用它的地方不断链），只换 `durationMs`；
 * - 后半拿调用方给的 `secondId`，`transition` 固定 `cut`——中间切出来的是硬切，
 *   原来那个转场描述的是这一镜与**前一镜**的衔接，它跟着前半走；
 * - 两半各自不得低于 `MIN_SHOT_MS`：切出个 0 毫秒的格子，时间线上就留下一块看不见的方块。
 *
 * 毫秒吸附到 `SHOT_MS_STEP`（与拖动同一步进），但**总时长守恒**：后半拿的是
 * `durationMs − headMs` 的余数，不是再吸一次——手填允许 1ms 粒度，两次吸附会让
 * 两半之和与原来那一镜差出半格，撤销栈对不上账。
 */
export type ShotSplitOutcome =
  | { ok: true; headMs: number; tail: StoryboardShot }
  | { ok: false; reason: string };

export function splitShotAt(shot: StoryboardShot, atMs: number, secondId: string): ShotSplitOutcome {
  if (!secondId || secondId === shot.id) {
    return { ok: false, reason: `后半的 id 必须非空且不等于原镜头 id（收到「${secondId}」）` };
  }
  if (!Number.isFinite(atMs)) {
    return { ok: false, reason: `切点要落在有限的毫秒上，收到 ${atMs}` };
  }
  const headMs = Math.round(atMs / SHOT_MS_STEP) * SHOT_MS_STEP;
  if (headMs < MIN_SHOT_MS) {
    return { ok: false, reason: `前半只有 ${headMs} 毫秒，短于一格步长（${MIN_SHOT_MS} 毫秒）——切点往右挪一点再切` };
  }
  const tailMs = shot.durationMs - headMs;
  if (tailMs < MIN_SHOT_MS) {
    return { ok: false, reason: `后半只剩 ${tailMs} 毫秒，凑不成一镜（最短 ${MIN_SHOT_MS} 毫秒）——切点往左挪一点再切` };
  }
  const tail: StoryboardShot = { ...shot, id: secondId, durationMs: tailMs, transition: 'cut' };
  return { ok: true, headMs, tail };
}

/**
 * §41 reorder：拖到哪个位置落下。
 *
 * 规则只有一条——**按其余镜头的中点分界**：拖动后这一镜的中心跨过谁的中心，就排到谁后面。
 * 不用「目标格的左边缘」那种判据，是因为拖拽时这一镜自己的宽度也在变，
 * 同一个位置会给出两个答案，界面就在相邻两位之间来回跳。
 *
 * 返回的是**最终下标**，与 `moveShot` 的 `to` 同口径（`applyStoryboardPatch` 里的 splice 就是最终位置）。
 * 所以「拖回原位」会原样拿回它当前的下标——调用方据此判断这次拖拽没有真的换位，
 * 不记一次什么都不改的撤销步。
 */
export function dropIndexFor(
  shots: readonly Pick<StoryboardShot, 'id' | 'durationMs'>[],
  draggedId: string,
  deltaMs: number,
): number {
  const at = shots.findIndex((shot) => shot.id === draggedId);
  if (at < 0) throw new Error(`镜头 ${draggedId} 不在这份分镜里`);
  const dragged = shots[at]!;
  let before = 0;
  for (let i = 0; i < at; i += 1) before += shots[i]!.durationMs;
  const center = before + deltaMs + dragged.durationMs / 2;
  // 其余镜头按「把这一镜拿掉之后」的位置算：拖拽期间它们本来就显示在这个位置上
  let target = 0;
  let cursor = 0;
  for (const other of shots) {
    if (other.id === draggedId) continue;
    if (cursor + other.durationMs / 2 < center) target += 1;
    cursor += other.durationMs;
  }
  return target;
}

/** 空分镜：新建项目里那一格"还没有分镜"的样子，与"切完是 0 镜"共用同一个形状 */
export function emptyStoryboard(id = 'storyboard-1'): Storyboard {
  return {
    id,
    title: '未命名分镜',
    source: { arrow: 'text-to-video', prompt: '' },
    shots: [],
    notes: ['还没有分镜：写一句话再切镜头。'],
  };
}
