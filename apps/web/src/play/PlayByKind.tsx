import {
  GAME_KIND_LABELS,
  GAME_KIND_LABELS_EN,
  GAME_KIND_STATUS,
  GAME_KIND_STATUS_EN,
  isGameKind,
  type GameDocument,
  type GameProjection,
} from '@nexus/game-model';
import { GamePlay } from '@/game2d/GamePlay';
import { RpgPlay } from '@/game2d/RpgPlay';
import { StoryPlay } from './StoryPlay';
import type { Locale } from '@/lib/i18n';

/**
 * 双语 COPY（2026-11-15：公开试玩面）——两语组件各自只选一套。
 * 注意：`describeProjection` 的数据源是模型产出（label、plan.counts、notes），只翻平台说的那几句。
 */
const COPY: Record<Locale, {
  kindNotWiredTitle: (label: string) => string;
  noFallback: string;
  thisKind: string;
  paintIso: string;
  paint3d: string;
  paintExploration: string;
  paintPuzzle: string;
  enemiesItemsQuests: (enemies: number, items: number, quests: number, w: number, h: number) => string;
  dialogueProjection: (readable: number, start: string, notes: number) => string;
  noStart: string;
  rpgGrowthLoop: (enemies: number, quests: number, w: number, h: number, fallbackXp: number) => string;
  noProjection: string;
}> = {
  zh: {
    kindNotWiredTitle: (label) => `这一版标的类型是「${label}」，它还没有可玩的投影`,
    noFallback: '这里不给一个空场子，也不拿别的类型的关卡顶上：那会让"平台还没接这一种"看起来像"你的设计跑出来就是这样"（§159）。',
    thisKind: '这一种',
    paintIso: '等轴测投影 · ',
    paint3d: '3D 视角 · ',
    paintExploration: '探索画法（走近才看得见） · ',
    paintPuzzle: '解谜画法（机关连线） · ',
    enemiesItemsQuests: (enemies, items, quests, w, h) => `${enemies} 个敌人 · ${items} 个物品 · ${quests} 条任务 · 场地 ${w}×${h}`,
    dialogueProjection: (readable, start, notes) => `对话投影 · ${readable} 段可读 · 起点「${start}」 · ${notes} 条如实说明`,
    noStart: '没有',
    rpgGrowthLoop: (enemies, quests, w, h, fallbackXp) =>
      `RPG 成长循环（战斗与 2D 同一个 step） · ${enemies} 个敌人 · ${quests} 条任务 · 场地 ${w}×${h}${fallbackXp ? ` · ${fallbackXp} 个敌人的经验是兜底值` : ''}`,
    noProjection: '这条类型没有可玩投影',
  },
  en: {
    kindNotWiredTitle: (label) => `This version is tagged “${label}”, and it has no playable projection yet`,
    noFallback: 'There is no empty arena and no substitute level: that would make “the platform has not wired up this kind” look like “your design runs out like this” (§159).',
    thisKind: 'this kind',
    paintIso: 'isometric · ',
    paint3d: '3D view · ',
    paintExploration: 'exploration rendering (up close only) · ',
    paintPuzzle: 'puzzle rendering (trigger wiring) · ',
    enemiesItemsQuests: (enemies, items, quests, w, h) => `${enemies} enemies · ${items} items · ${quests} quests · arena ${w}×${h}`,
    dialogueProjection: (readable, start, notes) => `dialogue projection · ${readable} readable beats · starts at “${start}” · ${notes} honesty notes`,
    noStart: 'none',
    rpgGrowthLoop: (enemies, quests, w, h, fallbackXp) =>
      `RPG growth loop (same combat step as 2D) · ${enemies} enemies · ${quests} quests · arena ${w}×${h}${fallbackXp ? ` · ${fallbackXp} enemies run on default XP` : ''}`,
    noProjection: 'no playable projection for this kind',
  },
};

/**
 * §51 的"类型 → 播放器"这一段，两个试玩入口共用一处（§16）：
 * `/game/<项目>`（作者自己的工作稿）与 `/n/<handle>/<slug>/play`（发布那一刻钉住的那一版）。
 * 各写一遍判断，迟早变成"一个页面说这个类型没接、另一个页面硬跑 2D 关卡"。
 *
 * 分派只看 `document.kind`，不看"文档里有什么"——作者标了 3D 却写了一堆对话时，
 * 按内容静默降级就是替他做了决定（`compileForKind` 里写了同一条理由）。
 *
 * 接了的类型也要把状态表那句话亮在页面上：2.5D 的"没有 3D 模型"、3D 的"判定仍在地平面上"、
 * 视觉小说的"没有立绘/背景/音乐"都是**限度**，只写在注释里等于没写（§159）。
 * 这句与 Studio 面板下拉旁边那句是同一份（`GAME_KIND_STATUS`），不是第二处自己判断。
 */
export function PlayByKind({
  document,
  projection,
  onComplete,
  locale = 'zh',
}: {
  document: GameDocument;
  projection: GameProjection;
  /** §168：通关的那一声（公开可玩页用它上报；作者自己的工作稿不传 ⇒ 不记成访客） */
  onComplete?: () => void;
  /** 双语（2026-11-15 公开试玩面）——与页面同一 locale；缺省 zh */
  locale?: Locale;
}) {
  const c = COPY[locale];
  const kindNote = isGameKind(document.kind) ? (
    <p className="pk-hint" data-game-kind-note={document.kind}>
      {locale === 'en' ? GAME_KIND_STATUS_EN[document.kind] : GAME_KIND_STATUS[document.kind]!.note}
    </p>
  ) : null;

  if (projection.pipeline === 'topdown') {
    return (
      <>
        <GamePlay plan={projection.plan} view={projection.view} onComplete={onComplete} locale={locale} />
        {kindNote}
      </>
    );
  }
  if (projection.pipeline === 'story') {
    return (
      <>
        <StoryPlay plan={projection.plan} onComplete={onComplete} locale={locale} />
        {kindNote}
      </>
    );
  }
  if (projection.pipeline === 'rpg') {
    return (
      <>
        <RpgPlay plan={projection.plan} onComplete={onComplete} locale={locale} />
        {kindNote}
      </>
    );
  }
  // 没接：reason 本身就是状态表那句话，不重复显示第二遍
  const label = isGameKind(document.kind) ? (locale === 'en' ? GAME_KIND_LABELS_EN[document.kind] : GAME_KIND_LABELS[document.kind]) : COPY[locale].thisKind;
  return (
    <div className="pk-card" data-play="kind-not-wired">
      <h2 className="pk-h2">{c.kindNotWiredTitle(label)}</h2>
      <p className="pk-note12" data-play-kind-reason>
        {projection.reason}
      </p>
      <p className="pk-hint2">
        {c.noFallback}
      </p>
    </div>
  );
}

/** 页首那行小字：说清这一页跑的到底是哪条管线、投影出多少可读内容 */
export function describeProjection(document: GameDocument, projection: GameProjection, locale: Locale = 'zh'): string {
  const c = COPY[locale];
  const KIND_LABELS = locale === 'en' ? GAME_KIND_LABELS_EN : GAME_KIND_LABELS;
  const label = isGameKind(document.kind) ? KIND_LABELS[document.kind] : c.thisKind;
  if (projection.pipeline === 'topdown') {
    const plan = projection.plan;
    // 画法要写进页首：2.5D / 3D 与 2D 跑的是同一条计划，差别只在这句话和画布上
    // （不写就会被读成"三种游戏"，而它们是同一个 step 算出来的同一份结果）
    const paint =
      projection.view === 'isometric'
        ? c.paintIso
        : projection.view === '3d'
          ? c.paint3d
          : projection.view === 'exploration'
            ? c.paintExploration
            : projection.view === 'puzzle'
              ? c.paintPuzzle
              : '';
    return `${label} · ${paint}${c.enemiesItemsQuests(plan.enemies.length, plan.items.length, plan.quests.length, plan.arena.width, plan.arena.height)}`;
  }
  if (projection.pipeline === 'story') {
    const plan = projection.plan;
    const start = plan.beats.find((beat) => beat.id === plan.startId);
    return `${label} · ${c.dialogueProjection(plan.beats.length, start?.name ?? c.noStart, plan.notes.length)}`;
  }
  if (projection.pipeline === 'rpg') {
    const plan = projection.plan;
    // 战斗与 2D 是同一个 step：这句话要写在页首，不然读起来像"多了一种战斗规则"
    const fallbackXp = plan.enemyXp.filter((enemy) => enemy.from === 'default').length;
    return `${label} · ${c.rpgGrowthLoop(plan.base.enemies.length, plan.quests.length, plan.base.arena.width, plan.base.arena.height, fallbackXp)}`;
  }
  return `${label} · ${c.noProjection}`;
}
