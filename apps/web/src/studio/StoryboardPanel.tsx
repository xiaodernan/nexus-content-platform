'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clampShotDuration,
  DEFAULT_SHOT_MS,
  dropIndexFor,
  keyboardTrimDelta,
  MAX_SHOT_MS,
  MIN_SHOT_MS,
  SHOT_CAMERAS,
  SHOT_MS_COARSE_STEP,
  SHOT_MS_STEP,
  SHOT_TRANSITIONS,
  shotIndexAtX,
  timelineOf,
  type ShotCamera,
  type ShotTransition,
  type StoryboardShot,
} from '@nexus/video-model';
import { cn } from '@/lib/cn';
import { csrfHeaders } from '@/lib/csrf';
import { apiAssetUrl } from '@/studio/assets';
import { useStudioReady } from './store';
import { storyboardStore, useStoryboard } from './storyboardStore';

/**
 * §40-42 分镜面板：Prompt → Storyboard → Shot list → Timeline 的界面入口。
 *
 * 三件事在界面上写着，不藏着：
 * - 「切一版分镜」是**本地确定性断句**，不是 AI 分镜（notes 里那句原样显示，§159 不许假生成）；
 * - 时间线**能编辑不能播**：§40 的 Video generation 那一格要真 provider，本机不假造像素，
 *   所以 `playable` 一直是 false，而这一条理由要读得出来（blockers 原文显示）；
 *   「DEMO 渲染整条分镜」出的片子是真 ffmpeg 跑真链路的产物，但像素来自本地确定性
 *   推演、不是 AI 生成——按钮、角标、warnings 三处都明码标注（§160），与"假生成"隔着
 *   一条"字节是真的、来源是假的"的线；渲完的成片在面板里直接播——<video> 挂的是
 *   apiAssetUrl 投影出来的鉴权 URL，播出去的是真字节，DEMO 标注照旧（§16）；
 * - audio / subtitles / effects 三条轨照样列出来，各带一句"为什么是空的"——
 *   缺这一句，界面上"没有音频"与"渲染失败"就长得一模一样（§41）。
 *
 * 每一次改镜头都是一个补丁事务（§150）：撤销/重做是真的能回，不是重打一遍。
 */

/** 一条分镜成片的记录：与 `GET /storyboard/render` 的返回同形 */
interface RenderRecord {
  assetId: string;
  storyboardId: string;
  taskId: string;
  renderMs: number;
  createdAt: string;
  warnings: string[];
}

/**
 * §133 generation 那一格在 render 链上的呈现（#196）：本档每月发几点 Video credits、
 * 一次成片渲染扣几点、本月还可渲几版。与 POST 的额度门读同一组数——
 * 展示说还有次数、门却早就关了，那种对不上比不展示更糟（§159）。
 */
interface RenderQuota {
  plan: string;
  planLabel: string;
  monthlyGrant: number;
  costPerRender: number;
  balance: number;
  rendersLeft: number;
}

const STATE_TEXT: Record<string, string> = {
  idle: '',
  loading: '读取中…',
  dirty: '未保存',
  saving: '保存中…',
  saved: '已保存',
  error: '保存失败',
};

const CAMERA_LABELS: Record<ShotCamera, string> = {
  wide: '宽景',
  medium: '中景',
  close: '特写',
  detail: '细部',
  tracking: '跟移',
  aerial: '航拍',
};

const TRANSITION_LABELS: Record<ShotTransition, string> = {
  cut: '硬切',
  fade: '淡入',
  dissolve: '叠化',
  wipe: '划像',
};

/**
 * §41 改长度/换位期间的状态。`preview*` 只是这一份本地预览：库里那一份在提交之前一动不动，
 * 所以"改到一半关掉页面"不会留下一个半截的长度，撤销栈也不会被 pointermove 塞满。
 *
 * trim 那一支按 `via` 分两种：拖动带着指针几何（起点像素与像素↔毫秒换算），键盘只有档位。
 * 写成两种而不是把几何字段设成可选：`moveTrim` 只该认指针那一支，
 * 可选字段会让"键盘这条路上混进一次 pointermove"变成能编译过的写法。
 */
type TimelineDrag =
  | { kind: 'trim'; via: 'pointer'; shotId: string; startX: number; startMs: number; msPerPx: number; previewMs: number }
  | { kind: 'trim'; via: 'keyboard'; shotId: string; startMs: number; previewMs: number }
  | {
      kind: 'reorder';
      shotId: string;
      startX: number;
      deltaPx: number;
      msPerPx: number;
      /** 这一格能在条里走多远：超出条的两端就会被 `overflow-hidden` 裁掉，拖到右边时那格等于不见了 */
      minDx: number;
      maxDx: number;
      fromIndex: number;
      previewIndex: number;
    };

export function StoryboardPanel() {
  const studio = useStudioReady();
  const snapshot = useStoryboard();
  const [prompt, setPrompt] = useState('');
  /** 草稿：镜头文本与时长各自独立存，失焦才写成一个事务——打字过程中不该一次次 PUT */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /**
   * §40 那一格欠的入口：镜头可以挂「这一镜里是谁」与「用哪张图当参考」。
   * 名册与资产清单从服务端读（不是让客户端猜 id）——挂上去的 id 由 `saveStoryboard`
   * 那侧的 `firstForeignRef` 校验归属，所以这里的列表就是唯一能被接受的那一批。
   */
  const [roster, setRoster] = useState<{
    characters: { id: string; name: string }[];
    assets: { id: string; name: string }[];
  }>({ characters: [], assets: [] });
  const [rosterNote, setRosterNote] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [renderBusy, setRenderBusy] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  /** 上一次 DEMO 渲染的交代：没做到的事（warnings）与计划说的每一句（notes）原样显示（§159） */
  const [renderNote, setRenderNote] = useState<{
    assetId: string;
    warnings: string[];
    notes: string[];
    renderMs: number;
  } | null>(null);
  /** 这个项目渲染出过的成片，新的在前（§101 资产清单的"分镜产物"那一格） */
  const [renders, setRenders] = useState<RenderRecord[]>([]);
  /** §133：成片渲染的额度视图。拿不到就不显示也不猜——置灰只看服务端说的 0 次 */
  const [quota, setQuota] = useState<RenderQuota | null>(null);
  /**
   * §41 时间线 ↔ 镜头列表的联动：点条上哪一格，镜头列表滚到并高亮那一镜；
   * 反过来点镜头行里的「定位」，条上那一格滚进视野。联动**不改模型**——
   * 它是投影上的取景框而不是一次编辑，所以不进撤销栈（§150 管的是改动，不是查看）。
   */
  const [linkedShotId, setLinkedShotId] = useState<string | null>(null);
  const sb = snapshot.storyboard;

  useEffect(() => {
    storyboardStore.ensure(studio.projectId);
  }, [studio.projectId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [c, a, r] = await Promise.all([
          fetch(`/api/projects/${studio.projectId}/characters`, { cache: 'no-store' })
            .then((r) => r.json())
            .catch(() => null),
          fetch(`/api/projects/${studio.projectId}/assets`, { cache: 'no-store' })
            .then((r) => r.json())
            .catch(() => null),
          fetch(`/api/projects/${studio.projectId}/storyboard/render`, { cache: 'no-store' })
            .then((r) => r.json())
            .catch(() => null),
        ]);
        if (cancelled) return;
        const characters = ((c as { characters?: { id: string; profile: { name: string } }[] } | null)?.characters ?? []).map(
          (item) => ({ id: item.id, name: item.profile.name || '（没有名字的角色）' }),
        );
        const assets = ((a as { assets?: { id: string; name: string }[] } | null)?.assets ?? []).map((item) => ({
          id: item.id,
          name: item.name,
        }));
        setRoster({ characters, assets });
        if (cancelled) return;
        setRenders(((r as { renders?: RenderRecord[] } | null)?.renders ?? []).map((item) => ({ ...item, warnings: item.warnings ?? [] })));
        setQuota((r as { quota?: RenderQuota } | null)?.quota ?? null);
        const unreadable = ((c as { unreadable?: string[] } | null)?.unreadable ?? []).length;
        setRosterNote(
          characters.length === 0
            ? '这个项目还没有角色，参考图也要先在资产库里上传（不给你手填 id）'
            : unreadable
              ? `${characters.length} 位角色可挂，其中 ${unreadable} 位档案读不出来，暂时不列`
              : null,
        );
      } catch {
        if (!cancelled) setRosterNote('名册或资产清单没读到，镜头上的引用暂时只能留空');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studio.projectId]);

  /**
   * §38 / §39 那条箭头接到镜头上：拿这一镜的提示词生成一张参考图，成功后把资产 id 挂上去。
   * 挂了角色就走 Character → Scene 那一条（服务端拿这位角色的肖像当参考，字节由服务端自己取）。
   *
   * 两句实话写在按钮上：像素来自**本地确定性合成器**（本机没有图像 provider，§160），
   * 这不是 AI 出图；撤销只断开镜头与引用的关系，**不会删掉那张已经花过额度产出的资产**——
   * 删资产是资产库那一格的动作，不该藏在一次 undo 里。
   */
  const makeReference = useCallback(
    async (shot: StoryboardShot) => {
      setImageBusy(shot.id);
      setImageError(null);
      try {
        const res = await fetch(`/api/projects/${studio.projectId}/images`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify(
            shot.characterId ? { prompt: shot.prompt, characterId: shot.characterId } : { prompt: shot.prompt },
          ),
        });
        const body = (await res.json().catch(() => null)) as
          | { asset?: { id: string; name?: string }; message?: string }
          | null;
        if (!res.ok || !body?.asset) throw new Error(body?.message ?? `HTTP ${res.status}`);
        // 新资产要立刻出现在选择器里：名册是挂载时拉的那一份，不补上就会显示成
        // "选了一个不存在的选项"（浏览器把这种 select 渲染成空白，用户看到的是刚刚挂上的东西不见了）
        setRoster((prev) =>
          prev.assets.some((item) => item.id === body.asset!.id)
            ? prev
            : { ...prev, assets: [...prev.assets, { id: body.asset!.id, name: body.asset!.name || '（新生成的参考图）' }] },
        );
        storyboardStore.applyOps([
          {
            op: 'updateShot',
            id: shot.id,
            before: { referenceAssetId: shot.referenceAssetId },
            after: { referenceAssetId: body.asset.id },
          },
        ]);
      } catch (error) {
        setImageError(error instanceof Error ? error.message : String(error));
      } finally {
        setImageBusy(null);
      }
    },
    [studio.projectId],
  );

  /**
   * §40 最后一格：把**整条分镜**真的渲出来。与 makeReference 同口径——
   * 像素是本地确定性推演 + 真 ffmpeg（DEMO，§160），但链路是真的：额度门在
   * startTask 之前、参考帧按 id 取字节走归属校验、字节过视频摄入门、只有成功才扣点。
   * 成片是整条分镜一条片子，挂回第一镜的 videoAssetId（§150 补丁事务，可撤销）。
   * warnings 里"没有字体→字幕没烧"这类没做到的事必须显示，不许静默。
   */
  const renderDemo = useCallback(async () => {
    if (!sb || sb.shots.length === 0) return;
    setRenderBusy(true);
    setRenderError(null);
    setRenderNote(null);
    try {
      const res = await fetch(`/api/projects/${studio.projectId}/storyboard/render`, {
        method: 'POST',
        headers: { ...csrfHeaders() },
      });
      const body = (await res.json().catch(() => null)) as
        | {
            asset?: { id: string };
            warnings?: string[];
            notes?: string[];
            renderMs?: number;
            message?: string;
          }
        | null;
      if (!res.ok || !body?.asset) throw new Error(body?.message ?? `HTTP ${res.status}`);
      const first = sb.shots[0]!;
      storyboardStore.applyOps([
        {
          op: 'updateShot',
          id: first.id,
          before: { videoAssetId: first.videoAssetId },
          after: { videoAssetId: body.asset.id },
        },
      ]);
      setRenderNote({
        assetId: body.asset.id,
        warnings: body.warnings ?? [],
        notes: body.notes ?? [],
        renderMs: body.renderMs ?? 0,
      });
      // 历史清单里立刻多出这一版：不刷新的话面板指着旧清单，像"刚渲的不算数"
      const list = (await fetch(`/api/projects/${studio.projectId}/storyboard/render`, { cache: 'no-store' })
        .then((r) => r.json())
        .catch(() => null)) as { renders?: RenderRecord[] } | null;
      setRenders((list?.renders ?? []).map((item) => ({ ...item, warnings: item.warnings ?? [] })));
      // #200：成片挂在第一镜上，把那一镜滚进视野并高亮——刚渲完的东西要能在镜头列表里找到。
      // 不走 focusShot()：那个函数的播报话是"用户点了定位"的口径，这里是渲染完成的副作用，
      // 话要说明白是"成片挂在了这一镜"。同样只动视图状态，不进撤销栈（§150 管改动，不管查看）。
      setLinkedShotId(first.id);
      setAnnounce('成片已挂到第 1 镜，镜头列表已定位到它');
      document.querySelector(`[data-storyboard-shot="${first.id}"]`)?.scrollIntoView({ block: 'nearest' });
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : String(error));
    } finally {
      setRenderBusy(false);
    }
  }, [sb, studio.projectId]);

  const timeline = useMemo(() => (sb ? timelineOf(sb) : null), [sb]);

  /** 时间线 → 镜头列表：滚到那一镜并高亮；读屏也有一句（§90 焦点之外要有回话） */
  const focusShot = (shotId: string, index: number): void => {
    setLinkedShotId(shotId);
    setAnnounce(`第 ${index + 1} 镜：镜头列表已定位到这一镜`);
    document.querySelector(`[data-storyboard-shot="${shotId}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  /** 镜头列表 → 时间线：把那一格滚进视野（条是横的，两个方向都要） */
  const locateOnStrip = (shotId: string, index: number): void => {
    setLinkedShotId(shotId);
    setAnnounce(`第 ${index + 1} 镜：已在时间线上定位`);
    document.querySelector(`[data-timeline-block="${shotId}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  /**
   * 条上点中的是哪一镜。判据走 `shotIndexAtX`（布局后的累计宽度，含短格下限）——
   * 按时长线性换算会把点在被下限抬宽的短格上的点击算到邻居身上。
   * 像素坐标取**点击那一刻的** rect：条宽会随面板伸缩，拿状态里的旧宽度会对偏。
   */
  const locateFromStrip = (event: React.MouseEvent<HTMLDivElement>): void => {
    const el = stripRef.current;
    if (!el || !sb || sb.shots.length === 0) return;
    const rect = el.getBoundingClientRect();
    const at = shotIndexAtX(sb.shots, timeline?.totalMs ?? 0, rect.width, event.clientX - rect.left);
    if (at < 0) return;
    focusShot(sb.shots[at]!.id, at);
  };

  /**
   * §41 的时间线编辑：拖右边缘 trim/extend、拖整块 reorder、点左上角的转场标记换衔接；
   * 键盘那条路（方向键调长度、Enter 落库、Esc 取消）改的是同一份模型、走同一个提交口径。
   *
   * 三条纪律：
   * - **调整期间不写库**。预览只活在这一份本地状态里，提交时才落一个补丁事务（§150）——
   *   每一次 pointermove（或按住方向键时的一次按键重复）都走 `applyOps` 会把撤销栈塞进几十步，
   *   Ctrl+Z 要按几十次才退得回去，PUT 也是几十次。
   * - **没有变化就不记事务**：拖回原位时长度与下标都没变，这时不写库也不进撤销栈，
   *   免得栈里多出一条"按一次什么都没发生"的撤销步。
   * - **改的是模型里的 `durationMs` / 镜头顺序**，不是界面上的宽度：时间线是投影（§16），
   *   所以 trim 改的是分镜本身，总长与其余格的位置跟着重算。
   */
  const [drag, setDrag] = useState<TimelineDrag | null>(null);
  const dragRef = useRef<TimelineDrag | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  /** 量出来的条宽：窄到一定程度就只画格子不留字（半个字被裁掉比不显示更难读），也用它决定转场标记放不放得下 */
  const [stripWidth, setStripWidth] = useState(0);
  /**
   * 读屏用的播报（`role="status"`）：焦点之外也要有一句"现在是多少、落库了没有"。
   * 视觉上藏起来，但它是一段真文本——不是给测试看的影子状态。
   */
  const [announce, setAnnounce] = useState('');
  const hasStoryboard = sb !== null;
  useEffect(() => {
    const el = stripRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setStripWidth(el.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasStoryboard]);

  /** 条宽与总长是像素↔毫秒的唯一换算处：两处各算一次，拖出来的长度就会在两种算法之间跳 */
  const msPerPx = (): number | null => {
    const el = stripRef.current;
    const width = el?.getBoundingClientRect().width ?? 0;
    const totalMs = timeline?.totalMs ?? 0;
    if (width <= 0 || totalMs <= 0) return null;
    return totalMs / width;
  };

  const beginTrim = (event: React.PointerEvent<HTMLElement>, shot: StoryboardShot): void => {
    const scale = msPerPx();
    if (scale === null) return;
    event.preventDefault();
    // 手柄在格子内部：这一下不该同时被当成"拖动整块换位"
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next: TimelineDrag = { kind: 'trim', via: 'pointer', shotId: shot.id, startX: event.clientX, startMs: shot.durationMs, msPerPx: scale, previewMs: shot.durationMs };
    dragRef.current = next;
    setDrag(next);
  };

  const moveTrim = (event: React.PointerEvent<HTMLElement>): void => {
    const active = dragRef.current;
    // 只有拖动那一支带指针几何；键盘那条路不该被一次 pointermove 改到
    if (active?.kind !== 'trim' || active.via !== 'pointer') return;
    const next: TimelineDrag = { ...active, previewMs: clampShotDuration(active.startMs + (event.clientX - active.startX) * active.msPerPx) };
    dragRef.current = next;
    setDrag(next);
  };

  /** 这一镜有没有待提交的预览（拖动或键盘都算）；没有就是 `null`，不返回一个"零改动"的假状态 */
  const pendingTrimOf = (shotId: string): Extract<TimelineDrag, { kind: 'trim' }> | null => {
    const active = dragRef.current;
    return active?.kind === 'trim' && active.shotId === shotId ? active : null;
  };

  const endTrim = (shot: StoryboardShot): void => {
    const active = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (active?.kind !== 'trim' || active.previewMs === shot.durationMs) return;
    storyboardStore.applyOps([
      { op: 'updateShot', id: shot.id, before: { durationMs: shot.durationMs }, after: { durationMs: active.previewMs } },
    ]);
    const at = sb?.shots.findIndex((candidate) => candidate.id === shot.id) ?? -1;
    setAnnounce(
      `${at >= 0 ? `第 ${at + 1} 镜` : '这一镜'}的长度改成 ${(active.previewMs / 1000).toFixed(1)} 秒，已写库`,
    );
  };

  /**
   * §41 片段级裁切的界面路：**双击**时间线上的一格，在点击处把这一镜切成两镜。
   *
   * 切点按格子自身的宽度换算（不是整条线），再被模型吸到 `SHOT_MS_STEP` 上——
   * 鼠标落不到整数毫秒，2817 这种数是像素误差不是作者的意思。拒因（太短、挪一点再切）
   * 由 store 落进 `data-storyboard-notice` 那一格，不静默。
   * 双击前那两下 pointerdown 会先走"拖整块换位"的起手——没有位移时 `endReorder`
   * 判"没真的换位"，不落事务，两条路互不踩。
   */
  const splitAtClick = (event: React.MouseEvent<HTMLElement>, shot: StoryboardShot): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const atMs = ((event.clientX - rect.left) / rect.width) * shot.durationMs;
    const at = sb?.shots.findIndex((candidate) => candidate.id === shot.id) ?? -1;
    if (storyboardStore.splitShot(shot.id, atMs, `shot-split-${crypto.randomUUID().slice(0, 8)}`)) {
      setAnnounce(`第 ${at + 1} 镜在点击处切成两镜，已写库，可撤销`);
    }
  };

  /**
   * §41 第二片：时间线自己也能用键盘改（`docs/DESIGN_SYSTEM.md` §90「全部交互可键盘到达」）。
   * 语义照画布那条"方向键微调"：方向键调、Enter 落库、Esc 取消。
   *
   * **为什么不按一下就写一次库**：这里的每次写是一整份分镜的 PUT 加一条撤销栈记录（§150），
   * 按住方向键半秒就是三十次写、三十步撤销；而拖动那条路的口径早就是"预览期间不写库、
   * 提交才落一个事务"。键盘复用**同一份预览状态**与同一个 `endTrim`，
   * 所以读数行、格子宽度、提交口径两条路完全一致，不会各写一套。
   *
   * 空格不做"提交"：`CanvasStage` 把 Space 当成画布的平移修饰键（window 级 keydown 按下、
   * keyup 抬起），在这里抢过来会让画布收到一个"按下没抬起"的修饰键。
   */
  const nudgeTrim = (event: React.KeyboardEvent<HTMLElement>, shot: StoryboardShot, index: number): void => {
    const pending = pendingTrimOf(shot.id);
    if (event.key === 'Enter') {
      if (!pending) return;
      event.preventDefault();
      event.stopPropagation();
      endTrim(shot);
      return;
    }
    if (event.key === 'Escape') {
      // 没有待提交的改动就不抢 Escape：画布那条「Esc 退出选择」照旧
      if (!pending) return;
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = null;
      setDrag(null);
      setAnnounce(`第 ${index + 1} 镜还是 ${(shot.durationMs / 1000).toFixed(1)} 秒，取消了这个预览`);
      return;
    }
    const delta = keyboardTrimDelta(event.key, event.shiftKey);
    if (delta === null) return;
    event.preventDefault();
    // 一并挡住 window 上画布那套方向键微调：不挡的话焦点在时间线上按方向键，画布上选中的节点也跟着挪
    event.stopPropagation();
    const fromMs = pending ? pending.previewMs : shot.durationMs;
    const previewMs = clampShotDuration(fromMs + delta);
    if (previewMs === fromMs) {
      // 停在上下限上：说清楚"这一步没改"，而不是让按键看起来像丢了
      setAnnounce(
        `第 ${index + 1} 镜已经是${fromMs <= MIN_SHOT_MS ? `下限 ${(MIN_SHOT_MS / 1000).toFixed(1)}` : `上限 ${(MAX_SHOT_MS / 1000).toFixed(1)}`}秒，这一步没改`,
      );
      return;
    }
    const next: TimelineDrag = {
      kind: 'trim',
      via: 'keyboard',
      shotId: shot.id,
      startMs: pending ? pending.startMs : shot.durationMs,
      previewMs,
    };
    dragRef.current = next;
    setDrag(next);
    setAnnounce(`第 ${index + 1} 镜 ${(previewMs / 1000).toFixed(1)} 秒，还没写库`);
  };

  const beginReorder = (event: React.PointerEvent<HTMLElement>, shot: StoryboardShot, index: number): void => {
    const scale = msPerPx();
    if (scale === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const stripRect = stripRef.current?.getBoundingClientRect();
    const rect = event.currentTarget.getBoundingClientRect();
    const next: TimelineDrag = {
      kind: 'reorder',
      shotId: shot.id,
      startX: event.clientX,
      deltaPx: 0,
      msPerPx: scale,
      minDx: stripRect ? stripRect.left - rect.left : Number.NEGATIVE_INFINITY,
      maxDx: stripRect ? stripRect.right - rect.right : Number.POSITIVE_INFINITY,
      fromIndex: index,
      previewIndex: index,
    };
    dragRef.current = next;
    setDrag(next);
  };

  const moveReorder = (event: React.PointerEvent<HTMLElement>): void => {
    const active = dragRef.current;
    if (active?.kind !== 'reorder' || !sb) return;
    const deltaPx = Math.min(active.maxDx, Math.max(active.minDx, event.clientX - active.startX));
    let previewIndex: number;
    try {
      previewIndex = dropIndexFor(sb.shots, active.shotId, deltaPx * active.msPerPx);
    } catch {
      // 拖到一半这一镜在别的标签页里被删了：保持原位，不拿一个不存在的 id 去写库
      previewIndex = active.fromIndex;
    }
    const next: TimelineDrag = { ...active, deltaPx, previewIndex };
    dragRef.current = next;
    setDrag(next);
  };

  const endReorder = (): void => {
    const active = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (active?.kind !== 'reorder' || active.previewIndex === active.fromIndex) return;
    storyboardStore.applyOps([{ op: 'moveShot', from: active.fromIndex, to: active.previewIndex }]);
  };

  /** §41 的 transition：时间线上的标记点一下换下一种衔接。一次点击仍是一个可撤销事务 */
  const cycleTransition = (shot: StoryboardShot): void => {
    const at = SHOT_TRANSITIONS.indexOf(shot.transition);
    const next = SHOT_TRANSITIONS[(at + 1) % SHOT_TRANSITIONS.length]!;
    storyboardStore.applyOps([
      { op: 'updateShot', id: shot.id, before: { transition: shot.transition }, after: { transition: next } },
    ]);
  };

  if (!sb) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-[var(--nexus-space-3)]" data-storyboard-panel>
        <h2 className="font-mono text-12 uppercase tracking-wide text-fg-3">分镜</h2>
        <p className="text-12 leading-relaxed text-fg-2" data-storyboard-empty>
          {snapshot.saveState === 'loading'
            ? '读取分镜…'
            : snapshot.error
              ? `读不出库里那份分镜：${snapshot.error}`
              : '这个项目还没有分镜。写一句话，下面按标点把它切成镜头表——这是本地确定性断句，不是 AI 分镜（provider 未接入前不做假生成）。'}
        </p>
        {snapshot.error ? (
          <p className="text-11 text-danger" data-storyboard-error>
            {snapshot.error}
          </p>
        ) : null}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="夜色里的港口，一台旧起重机慢慢转身，猫跳上缆绳，它跑起来了"
          data-storyboard-prompt-input
          className="w-full resize-y rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 p-2 text-12 text-fg-1"
        />
        <button
          type="button"
          disabled={!prompt.trim() || snapshot.saveState === 'saving'}
          onClick={() => void storyboardStore.planFrom(prompt)}
          data-storyboard-create
          className="self-start rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-fg-1 disabled:opacity-50"
        >
          切一版分镜
        </button>
        {snapshot.notice ? (
          <p className="text-11 text-fg-3" data-storyboard-notice>
            {snapshot.notice}
          </p>
        ) : null}
      </div>
    );
  }

  const draftOf = (shot: StoryboardShot, field: 'prompt' | 'durationMs') => {
    const key = `${shot.id}::${field}`;
    if (field === 'prompt') return drafts[key] ?? shot.prompt;
    return String(drafts[key] ?? shot.durationMs);
  };

  const setDraft = (key: string, value: string) => setDrafts((d) => ({ ...d, [key]: value }));

  const flushPrompt = (shot: StoryboardShot) => {
    const key = `${shot.id}::prompt`;
    const next = (drafts[key] ?? shot.prompt).trim();
    if (!next) {
      // 空提示词过不了报文契约，也不该静默把旧值清掉：明说这一格没动
      storyboardStore.showNotice('这一镜的提示词是空的，没有写进去——空白的镜头没法生成。');
      setDraft(key, shot.prompt);
      return;
    }
    if (next === shot.prompt) {
      setDrafts((d) => {
        const { [key]: _drop, ...rest } = d;
        return rest;
      });
      return;
    }
    setDrafts((d) => {
      const { [key]: _drop, ...rest } = d;
      return rest;
    });
    storyboardStore.applyOps([{ op: 'updateShot', id: shot.id, before: { prompt: shot.prompt }, after: { prompt: next } }]);
  };

  const flushDuration = (shot: StoryboardShot) => {
    const key = `${shot.id}::durationMs`;
    const next = Number(drafts[key]);
    setDrafts((d) => {
      const { [key]: _drop, ...rest } = d;
      return rest;
    });
    if (!Number.isInteger(next) || next < 1 || next > MAX_SHOT_MS) {
      storyboardStore.showNotice(
        `时长要 1 到 ${MAX_SHOT_MS} 之间的整数毫秒（拖拽那条路的下限是 ${MIN_SHOT_MS}、吸附 ${SHOT_MS_STEP}），「${drafts[key] ?? ''}」没写进去——这一镜还是 ${shot.durationMs} 毫秒。`,
      );
      return;
    }
    if (next === shot.durationMs) return;
    storyboardStore.applyOps([{ op: 'updateShot', id: shot.id, before: { durationMs: shot.durationMs }, after: { durationMs: next } }]);
  };

  const total = sb.shots.length;

  return (
    <div className="flex h-full min-h-0 flex-col" data-storyboard-panel>
      <header className="shrink-0 border-b border-[var(--nexus-color-border-subtle)] p-[var(--nexus-space-3)]">
        <div className="flex items-center gap-2">
          <h2 className="font-mono text-12 uppercase tracking-wide text-fg-3">分镜</h2>
          <span
            className={cn(
              'ml-auto rounded-[var(--nexus-radius-sm)] px-2 py-[2px] font-mono text-11',
              snapshot.saveState === 'error' ? 'bg-warn text-bg-0' : 'text-fg-3',
            )}
            data-storyboard-save-state
          >
            {STATE_TEXT[snapshot.saveState] ?? ''}
          </span>
        </div>
        <p className="mt-1 text-12 text-fg-2" data-storyboard-summary>
          {total} 镜 · 共 {(timeline?.totalMs ?? 0) / 1000} 秒 · 来源：{sb.source.prompt || '（没有原句）'}
        </p>
        <div className="mt-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => storyboardStore.undo()}
            disabled={!snapshot.canUndo || snapshot.saveState === 'saving'}
            title="撤销上一次镜头改动（走 patch 的逆补丁，不是重打一遍）"
            data-storyboard-undo
            className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-11 text-fg-2 disabled:opacity-50"
          >
            撤销
          </button>
          <button
            type="button"
            onClick={() => storyboardStore.redo()}
            disabled={!snapshot.canRedo || snapshot.saveState === 'saving'}
            title="重做"
            data-storyboard-redo
            className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-11 text-fg-2 disabled:opacity-50"
          >
            重做
          </button>
          <button
            type="button"
            onClick={() => storyboardStore.reload()}
            className="ml-auto rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-11 text-fg-3"
            title="重新读库里那一份（未保存的本地编辑会被覆盖）"
            data-storyboard-reload
          >
            重读
          </button>
        </div>
        {snapshot.error ? (
          <p className="mt-1 text-11 text-danger" data-storyboard-error>
            {snapshot.error}
          </p>
        ) : null}
        {snapshot.notice ? (
          <p className="mt-1 text-11 text-fg-3" data-storyboard-notice>
            {snapshot.notice}
          </p>
        ) : null}
        {rosterNote ? (
          <p className="mt-1 text-11 text-fg-3" data-storyboard-roster-note>
            {rosterNote}
          </p>
        ) : null}
        {imageError ? (
          <p className="mt-1 text-11 text-danger" data-storyboard-image-error>
            参考图没生成：{imageError}
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <ul className="flex flex-col gap-2 p-[var(--nexus-space-3)]">
          {sb.shots.map((shot, index) => (
            <li
              key={shot.id}
              className={cn(
                'rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 p-2',
                // 时间线上点过的那一格：列表里这一镜高亮——联动是取景框，不进撤销栈
                linkedShotId === shot.id ? 'border-accent-2' : null,
              )}
              data-storyboard-shot={shot.id}
              data-storyboard-shot-linked={linkedShotId === shot.id ? 'true' : undefined}
            >
              {/* 换行是必要的：面板只有 264px 宽，机位+转场+时长已经占满一行，
                  不换行时 ↑↓＋✕ 四个动作会被裁到面板外面——点得到但看不见，等于没有 */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-11 text-fg-3">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <button
                  type="button"
                  onClick={() => locateOnStrip(shot.id, index)}
                  title="在时间线上找到这一镜"
                  aria-label={`在时间线上定位第 ${index + 1} 镜`}
                  data-storyboard-locate={shot.id}
                  className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 py-[2px] text-11 text-fg-2"
                >
                  定位
                </button>
                <select
                  value={shot.camera}
                  onChange={(e) =>
                    storyboardStore.applyOps([
                      {
                        op: 'updateShot',
                        id: shot.id,
                        before: { camera: shot.camera },
                        after: { camera: e.target.value as ShotCamera },
                      },
                    ])
                  }
                  aria-label="机位"
                  data-storyboard-camera={shot.id}
                  className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 py-[2px] text-11 text-fg-1"
                >
                  {SHOT_CAMERAS.map((c) => (
                    <option key={c} value={c}>
                      {CAMERA_LABELS[c]}
                    </option>
                  ))}
                </select>
                <select
                  value={shot.transition}
                  onChange={(e) =>
                    storyboardStore.applyOps([
                      {
                        op: 'updateShot',
                        id: shot.id,
                        before: { transition: shot.transition },
                        after: { transition: e.target.value as ShotTransition },
                      },
                    ])
                  }
                  aria-label="转场"
                  data-storyboard-transition={shot.id}
                  className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 py-[2px] text-11 text-fg-1"
                >
                  {SHOT_TRANSITIONS.map((t) => (
                    <option key={t} value={t}>
                      {TRANSITION_LABELS[t]}
                    </option>
                  ))}
                </select>
                <input
                  value={draftOf(shot, 'durationMs')}
                  onChange={(e) => setDraft(`${shot.id}::durationMs`, e.target.value)}
                  onBlur={() => flushDuration(shot)}
                  aria-label="时长（毫秒）"
                  data-storyboard-duration={shot.id}
                  className="w-[64px] rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 py-[2px] text-11 text-fg-1"
                />
                {/* 挂角色 / 挂参考图：一次改动 = 一个可撤销事务（§150），选项只来自服务端名册，
                    所以这里给不出一个"会被 firstForeignRef 挡下"的 id */}
                <select
                  value={shot.characterId ?? ''}
                  onChange={(e) =>
                    storyboardStore.applyOps([
                      {
                        op: 'updateShot',
                        id: shot.id,
                        before: { characterId: shot.characterId },
                        after: { characterId: e.target.value || undefined },
                      },
                    ])
                  }
                  aria-label="这一镜里的角色"
                  data-storyboard-character={shot.id}
                  className="max-w-[110px] rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 py-[2px] text-11 text-fg-1"
                >
                  <option value="">不挂角色</option>
                  {roster.characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={shot.referenceAssetId ?? ''}
                  onChange={(e) =>
                    storyboardStore.applyOps([
                      {
                        op: 'updateShot',
                        id: shot.id,
                        before: { referenceAssetId: shot.referenceAssetId },
                        after: { referenceAssetId: e.target.value || undefined },
                      },
                    ])
                  }
                  aria-label="这一镜的参考图"
                  data-storyboard-reference={shot.id}
                  className="max-w-[110px] rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 py-[2px] text-11 text-fg-1"
                >
                  <option value="">不用参考图</option>
                  {roster.assets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void makeReference(shot)}
                  disabled={imageBusy !== null}
                  title="本地确定性合成（DEMO），不是 AI 出图；撤销只断开引用，不删除已生成的资产"
                  aria-label="为本镜生成参考图"
                  data-storyboard-image-gen={shot.id}
                  className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 py-[2px] text-11 text-fg-2 disabled:opacity-40"
                >
                  {imageBusy === shot.id ? '合成中…' : 'DEMO 参考图'}
                </button>
                <span className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => storyboardStore.applyOps([{ op: 'moveShot', from: index, to: index - 1 }])}
                    disabled={index === 0}
                    title="上一位"
                    data-storyboard-move-up={shot.id}
                    className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 text-11 text-fg-2 disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => storyboardStore.applyOps([{ op: 'moveShot', from: index, to: index + 1 }])}
                    disabled={index === total - 1}
                    title="下一位"
                    data-storyboard-move-down={shot.id}
                    className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 text-11 text-fg-2 disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      storyboardStore.applyOps([
                        {
                          op: 'addShot',
                          index: index + 1,
                          shot: {
                            id: `shot-manual-${crypto.randomUUID().slice(0, 8)}`,
                            prompt: '新的一镜：写要拍什么',
                            durationMs: DEFAULT_SHOT_MS,
                            camera: 'medium',
                            transition: 'cut',
                          },
                        },
                      ])
                    }
                    title="在这一镜之后插一镜"
                    data-storyboard-add={shot.id}
                    className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 text-11 text-fg-2"
                  >
                    ＋
                  </button>
                  {/* §41 片段级裁切的键盘路：与时间线上的双击走同一个 store.splitShot，只是切点固定中点 */}
                  <button
                    type="button"
                    onClick={() => storyboardStore.splitShot(shot.id, Math.round(shot.durationMs / 2), `shot-split-${crypto.randomUUID().slice(0, 8)}`)}
                    disabled={shot.durationMs < MIN_SHOT_MS * 2}
                    title={shot.durationMs < MIN_SHOT_MS * 2 ? `这一镜不足两格步长（${MIN_SHOT_MS * 2} 毫秒），切不出第二镜` : '在这一镜的中点切成两镜（可撤销）'}
                    data-storyboard-split={shot.id}
                    className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 text-11 text-fg-2 disabled:opacity-40"
                  >
                    ✂
                  </button>
                  <button
                    type="button"
                    onClick={() => storyboardStore.applyOps([{ op: 'removeShot', id: shot.id }])}
                    disabled={total <= 1}
                    title={total <= 1 ? '最后一镜不能删：0 镜的时间线没什么可编辑的' : '删掉这一镜（可撤销）'}
                    data-storyboard-remove={shot.id}
                    className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 text-11 text-fg-2 disabled:opacity-40"
                  >
                    ✕
                  </button>
                </span>
              </div>
              <textarea
                value={draftOf(shot, 'prompt')}
                onChange={(e) => setDraft(`${shot.id}::prompt`, e.target.value)}
                onBlur={() => flushPrompt(shot)}
                rows={2}
                aria-label="这一镜要拍什么"
                data-storyboard-prompt={shot.id}
                className="mt-1 w-full resize-y rounded-[var(--nexus-radius-sm)] bg-bg-3 p-1 text-12 text-fg-1"
              />
            </li>
          ))}
        </ul>

        <section className="border-t border-[var(--nexus-color-border-subtle)] p-[var(--nexus-space-3)]" data-storyboard-render-panel>
          <h3 className="font-mono text-11 uppercase tracking-wide text-fg-3">渲染（§40 最后一格 · DEMO）</h3>
          <p className="mt-1 text-11 text-fg-2">
            真 ffmpeg、真链路：额度门在任务之前，参考帧按 id 取字节（带归属校验），成片过视频摄入门，只有成功才扣点。
            但像素是<strong>本地确定性推演，不是 AI 生成</strong>——这一条明码标注，不假装有视频 provider（§159/§160）。
          </p>
          <button
            type="button"
            disabled={renderBusy || sb.shots.length === 0 || quota?.rendersLeft === 0}
            onClick={() => void renderDemo()}
            data-storyboard-render
            title="把整条分镜渲成一条 mp4（DEMO：本地 ffmpeg 确定性推演，非 AI 生成）。成片挂回第一镜的 videoAssetId"
            className="mt-2 rounded-[var(--nexus-radius-sm)] bg-bg-3 px-3 py-1 text-12 text-fg-1 disabled:opacity-40"
          >
            {renderBusy ? '渲染中…' : 'DEMO 渲染整条分镜'}
          </button>
          {quota ? (
            <p className="mt-2 text-11 text-fg-3" data-storyboard-render-quota>
              {quota.planLabel} 档：每月 {quota.monthlyGrant} 次成片渲染 · 每次 {quota.costPerRender} 点 ·
              本月还可渲 {quota.rendersLeft} 次（Video credits 余额 {quota.balance} 点）
              {quota.rendersLeft === 0 ? '——额度用尽时服务端会拒（429），这里先置灰' : ''}
            </p>
          ) : null}
          {renderError ? (
            <p className="mt-2 text-11 text-danger" data-storyboard-render-error>
              {renderError}
            </p>
          ) : null}
          {renderNote ? (
            <div className="mt-2 flex flex-col gap-1" data-storyboard-render-result>
              <p className="text-11 text-fg-2">
                <span className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-1 py-[1px] text-10 text-fg-1">DEMO</span>
                {' '}成片已挂到第一镜（整条分镜一条片子），耗时 {renderNote.renderMs} 毫秒
              </p>
              <video
                controls
                preload="metadata"
                src={apiAssetUrl(renderNote.assetId)}
                data-storyboard-render-video
                className="mt-1 w-full max-w-[480px] rounded-[var(--nexus-radius-sm)] bg-bg-3"
                title="DEMO 成片预览：真 ffmpeg 渲出来的字节，像素是本地确定性推演、不是 AI 生成（§160）"
              />
              {renderNote.warnings.length ? (
                <ul className="flex flex-col gap-1" data-storyboard-render-warnings>
                  {renderNote.warnings.map((w) => (
                    <li key={w} className="text-11 text-warn">
                      {w}
                    </li>
                  ))}
                </ul>
              ) : null}
              <ul className="flex flex-col gap-1">
                {renderNote.notes.map((n) => (
                  <li key={n} className="text-11 text-fg-3">
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {renders.length ? (
            <div className="mt-2 flex flex-col gap-1" data-storyboard-render-history>
              <span className="text-11 text-fg-3">这条分镜渲过 {renders.length} 版（都是 DEMO，新的在前）：</span>
              <ul className="flex flex-col gap-1">
                {renders.map((r) => (
                  <li key={r.assetId} className="flex flex-col gap-1 text-11 text-fg-2">
                    <span>
                      <span className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-1 py-[1px] text-10 text-fg-1">DEMO</span>
                      {' '}
                      {new Date(r.createdAt).toLocaleString('zh-CN')} · {r.renderMs} 毫秒
                      {r.warnings.length ? ` · ${r.warnings.length} 条没做到的` : ''}
                      {sb.shots.some((s) => s.videoAssetId === r.assetId) ? ' · 正挂在某一镜上' : ''}
                    </span>
                    <video
                      controls
                      preload="metadata"
                      src={apiAssetUrl(r.assetId)}
                      data-storyboard-render-video
                      className="w-full max-w-[480px] rounded-[var(--nexus-radius-sm)] bg-bg-3"
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="border-t border-[var(--nexus-color-border-subtle)] p-[var(--nexus-space-3)]" data-storyboard-timeline-doc>
          <h3 className="font-mono text-11 uppercase tracking-wide text-fg-3">时间线（§41）· 说明与轨道</h3>
          <p className="mt-1 text-11 text-fg-3">
            拖右边缘改长度（吸附 {SHOT_MS_STEP} 毫秒，下限 {MIN_SHOT_MS} 毫秒）、拖整块换位、点左上角的转场标记换衔接、
            点条上任意一格在镜头列表里定位那一镜（反向用镜头行里的「定位」）、
            <span data-timeline-split-hint>双击一格在点击处切成两镜</span>（两半共享同一张参考帧——切的是时间线，不是像素）；
            松手才写库，每一步都可撤销。键盘：Tab 到格子的右边缘，左右方向键调长度（Shift 一格 {SHOT_MS_COARSE_STEP} 毫秒），
            Enter 落库、Esc 取消；换位用镜头表里的 ↑ ↓，精确毫秒用那个数字框——四条路改的是同一份模型。
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {(timeline?.tracks ?? []).map((track) => (
              <li key={track.kind} className="text-11 text-fg-2" data-storyboard-track={track.kind}>
                <span className="font-mono text-fg-3">{track.kind}</span>
                {'：'}
                {track.clips.length ? `${track.clips.length} 格` : `空——${track.emptyReason ?? '这一版没有内容'}`}
              </li>
            ))}
          </ul>
          {timeline?.blockers.length ? (
            <ul className="mt-2 flex flex-col gap-1">
              {timeline.blockers.map((b) => (
                <li key={b} className="text-11 text-fg-3" data-storyboard-blocker>
                  {b}
                </li>
              ))}
            </ul>
          ) : null}
        </section>


        <section className="border-t border-[var(--nexus-color-border-subtle)] p-[var(--nexus-space-3)]">
          <h3 className="font-mono text-11 uppercase tracking-wide text-fg-3">这一版分镜是怎么来的</h3>
          <ul className="mt-1 flex flex-col gap-1">
            {sb.notes.map((note) => (
              <li key={note} className="text-11 leading-relaxed text-fg-3" data-storyboard-note>
                {note}
              </li>
            ))}
          </ul>
        </section>
      </div>

        <section className="shrink-0 border-t border-[var(--nexus-color-border-subtle)] p-[var(--nexus-space-3)]" data-storyboard-timeline>
          <h3 className="font-mono text-11 uppercase tracking-wide text-fg-3">时间线（§41）</h3>
          <p className="mt-1 text-11 text-fg-2">
            总长 {String((timeline?.totalMs ?? 0) / 1000)} 秒 ·
            <span data-storyboard-playable={String(timeline?.playable)}>
              {timeline?.playable
                ? ' 可播'
                : ' 不可播：还没有能直接播放的画面——镜头视频那一格要真 provider，本机不做假生成（§159）'}
            </span>
          </p>
          {/*
            §41 的编辑面：一格一镜，宽度就是时长。三种直接操作各有一处实现——
            右边缘 trim/extend、整块 reorder、左上角的转场标记换衔接；
            三者都只在松手时落一个补丁事务，拖动期间库里那一份不动。
          */}
          <div
            ref={stripRef}
            role="list"
            onClick={locateFromStrip}
            aria-label={`时间线：${sb.shots.length} 个镜头按顺序排开。拖格子右边缘改长度、拖整块换位置；点任意一格在镜头列表里定位那一镜；键盘按 Tab 到右边缘用方向键改`}
            className="mt-2 flex h-9 w-full min-w-0 overflow-hidden rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2"
            data-timeline-strip
            data-timeline-total-ms={String(timeline?.totalMs ?? 0)}
          >
            {sb.shots.map((shot, index) => {
              const trimming = drag?.kind === 'trim' && drag.shotId === shot.id ? drag : null;
              const moving = drag?.kind === 'reorder' && drag.shotId === shot.id ? drag : null;
              const shownMs = trimming?.previewMs ?? shot.durationMs;
              // 分母跟着预览走：这一镜变长，总长就变长，其余格按比例让位——
              // 拿旧总长当分母会把尾部裁掉半截，那等于界面在说"总长没变"
              const layoutMs = Math.max(1, (timeline?.totalMs ?? 0) + (trimming ? trimming.previewMs - shot.durationMs : 0));
              const pct = (shownMs / layoutMs) * 100;
              const px = (pct / 100) * stripWidth;
              const dropTarget = drag?.kind === 'reorder' && !moving && drag.previewIndex === index;
              return (
                <div
                  key={shot.id}
                  role="listitem"
                  aria-label={`第 ${index + 1} 镜：${(shownMs / 1000).toFixed(1)} 秒，${CAMERA_LABELS[shot.camera]}，衔接${TRANSITION_LABELS[shot.transition]}`}
                  data-timeline-block={shot.id}
                  data-timeline-drop-target={dropTarget ? 'true' : undefined}
                  title={`第 ${index + 1} 镜 · ${(shownMs / 1000).toFixed(1)} 秒 · ${CAMERA_LABELS[shot.camera]} · ${TRANSITION_LABELS[shot.transition]} · 双击在点击处切成两镜`}
                  onPointerDown={(event) => beginReorder(event, shot, index)}
                  onPointerMove={moveReorder}
                  onPointerUp={endReorder}
                  onPointerCancel={endReorder}
                  onDoubleClick={(event) => splitAtClick(event, shot)}
                  className={cn(
                    'relative flex min-w-0 shrink-0 cursor-grab items-center justify-center gap-1 border-r border-[var(--nexus-color-border-subtle)] bg-bg-3 last:border-r-0',
                    moving ? 'z-10 opacity-60' : null,
                    dropTarget ? 'bg-bg-1' : null,
                  )}
                  style={{
                    width: `${pct}%`,
                    // 一格 100 毫秒在 9 秒的时间线上只有 2.6 像素：不给下限的话它看上去根本"没有"
                    minWidth: '6px',
                    ...(moving ? { transform: `translateX(${moving.deltaPx}px)` } : {}),
                  }}
                >
                  {/*
                    两行都是绝对定位，谁也压不着谁：转场标记贴左上、序号贴右上、时长贴在底下居中。
                    第一版把序号与时长放在居中流里，转场标记就盖在了"4.5s"的 4 上——
                    这是截图里看出来的（面板只有 239 像素，47 像素的一格放不下三段居中文字）。
                  */}
                  {px >= 40 ? (
                    <span className="pointer-events-none absolute right-[10px] top-[2px] font-mono text-11 text-fg-3">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  ) : null}
                  {px >= 34 ? (
                    <span className="pointer-events-none absolute bottom-[3px] left-0 right-0 text-center font-mono text-11 text-fg-2">
                      {(shownMs / 1000).toFixed(1)}s
                    </span>
                  ) : null}
                  {px >= 44 ? (
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => cycleTransition(shot)}
                      aria-label={`换这一镜的转场（现在是${TRANSITION_LABELS[shot.transition]}）`}
                      title={`这一镜的衔接是${TRANSITION_LABELS[shot.transition]}，点一下换下一种（可撤销）`}
                      data-timeline-transition={shot.id}
                      className="absolute left-[2px] top-[2px] rounded-[var(--nexus-radius-sm)] bg-bg-1 px-[3px] font-mono text-11 leading-tight text-fg-3"
                    >
                      {TRANSITION_LABELS[shot.transition]}
                    </button>
                  ) : null}
                  <span
                    role="separator"
                    tabIndex={0}
                    aria-orientation="vertical"
                    aria-label={`第 ${index + 1} 镜的右边缘：拖动改长度；方向键一格 ${SHOT_MS_STEP} 毫秒、Shift 一格 ${SHOT_MS_COARSE_STEP} 毫秒，Enter 落库，Esc 取消`}
                    aria-valuemin={MIN_SHOT_MS}
                    aria-valuemax={MAX_SHOT_MS}
                    aria-valuenow={shownMs}
                    aria-valuetext={`${(shownMs / 1000).toFixed(1)} 秒`}
                    data-timeline-trim={shot.id}
                    onPointerDown={(event) => beginTrim(event, shot)}
                    onPointerMove={moveTrim}
                    onPointerUp={() => endTrim(shot)}
                    onPointerCancel={() => endTrim(shot)}
                    onKeyDown={(event) => nudgeTrim(event, shot, index)}
                    // 焦点离开 = 提交（等价于松手）：预览过的长度不能因为 Tab 走开就悄悄消失
                    onBlur={() => endTrim(shot)}
                    className="absolute right-0 top-0 h-full w-[8px] cursor-col-resize bg-transparent hover:bg-accent-2/40 focus-visible:w-[12px] focus-visible:bg-accent-2/50"
                  />
                </div>
              );
            })}
          </div>
          {drag ? (
            <p className="mt-1 text-11 text-accent-2" data-timeline-readout>
              {drag.kind === 'trim'
                ? `第 ${sb.shots.findIndex((candidate) => candidate.id === drag.shotId) + 1} 镜：${(drag.startMs / 1000).toFixed(1)} 秒 → ${(drag.previewMs / 1000).toFixed(1)} 秒`
                : `把第 ${drag.fromIndex + 1} 镜拖到第 ${drag.previewIndex + 1} 位`}
            </p>
          ) : null}
          {/* 读屏那一句：视觉上藏起来，但与上面那行读数说的是同一件事（§90 的键盘路要能听见结果） */}
          <p className="sr-only" role="status" data-timeline-announce>
            {announce}
          </p>
        </section>
    </div>
  );
}
