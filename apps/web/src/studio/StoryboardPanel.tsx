'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ARROW_SOURCE_NEEDS,
  clampShotDuration,
  DEFAULT_SHOT_MS,
  dropIndexFor,
  keyboardTrimDelta,
  MAX_SHOT_MS,
  MIN_SHOT_MS,
  missingArrowSource,
  SHOT_CAMERAS,
  SHOT_MS_COARSE_STEP,
  SHOT_MS_STEP,
  SHOT_TRANSITIONS,
  STORYBOARD_ARROWS,
  shotIndexAtX,
  timelineOf,
  type ShotCamera,
  type ShotTransition,
  type StoryboardArrow,
  type StoryboardShot,
} from '@nexus/video-model';
import { cn } from '@/lib/cn';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';
import { apiAssetUrl } from '@/studio/assets';
import { useStudioReady } from './store';
import { storyboardStore, useStoryboard } from './storyboardStore';
import { cameraLabel, transitionLabel, arrowLabel, arrowNeedText } from './storyboard-labels';
type StoryboardCopy = (typeof COPY)[Locale];

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

const COPY = {
  zh: {
    heading: '分镜',
    state: { idle: '', loading: '读取中…', dirty: '未保存', saving: '保存中…', saved: '已保存', error: '保存失败' } as Record<string, string>,
    readError: (err: string) => `读不出库里那份分镜：${err}`,
    emptyBody: '这个项目还没有分镜。写一句话，下面按标点把它切成镜头表——这是本地确定性断句，不是 AI 分镜（provider 未接入前不做假生成）。',
    readStoryboard: '读取分镜…',
    promptPlaceholder: '夜色里的港口，一台旧起重机慢慢转身，猫跳上缆绳，它跑起来了',
    sourceLabel: '这条片子的来源',
    referenceAssetAria: '这条片子的参考图',
    referenceAssetEmpty: '挑一张已定格的参考图（资产库里的）…',
    characterAria: '这条片子的角色',
    characterEmpty: '挑一位本项目的角色…',
    createAndSplit: '切一版分镜',
    changeSource: '改来源',
    changeSourceTitle: '换一条箭头（不会重切这一版：镜头、长度、撤销栈都留着）',
    changeSourceNote: '换来源不重切一版：镜头、长度、撤销栈都留着。',
    undo: '撤销',
    redo: '重做',
    reload: '重读',
    applySource: '应用来源',
    cancel: '取消',
    shotsVsSeconds: (shots: number, seconds: number) => `${shots} 镜 · 共 ${seconds} 秒`,
    sourceArrow: (label: string) => `来源：${label}`,
    arrowOption: (label: string, need: string) => `${label}（${need}）`,
    sourcePrompt: '原句：',
    sourceMissing: '（没有原句）',
    locateShot: '定位',
    locateTitle: '在时间线上找到这一镜',
    locateAria: (n: number) => `在时间线上定位第 ${n} 镜`,
    cameraAria: '机位',
    transitionAria: '转场',
    durationAria: '时长（毫秒）',
    shotCharacterAria: '这一镜里的角色',
    noCharacter: '不挂角色',
    shotReferenceAria: '这一镜的参考图',
    noReference: '不用参考图',
    imageBusy: '合成中…',
    imageTitle: '本地确定性合成（DEMO），不是 AI 出图；撤销只断开引用，不删除已生成的资产',
    imageAria: '为本镜生成参考图',
    imageBtn: 'DEMO 参考图',
    upOne: '上一位',
    downOne: '下一位',
    splitBefore: (ms: number) => `这一镜不足两格步长（${ms} 毫秒），切不出第二镜`,
    splitReady: '在这一镜的中点切成两镜（可撤销）',
    lastCannotDelete: '最后一镜不能删：0 镜的时间线没什么可编辑的',
    deleteShot: '删掉这一镜（可撤销）',
    insertAfter: '在这一镜之后插一镜',
    newShotPrompt: '新的一镜：写要拍什么',
    renderSection: '渲染（§40 最后一格 · DEMO）',
    renderLead: '真 ffmpeg、真链路：额度门在任务之前，参考帧按 id 取字节（带归属校验），成片过视频摄入门，只有成功才扣点。',
    renderHonesty: '但像素是',
    renderHonestyBold: '本地确定性推演，不是 AI 生成',
    renderHonestyTail: '这一条明码标注，不假装有视频 provider（§159/§160）。',
    renderBtn: 'DEMO 渲染整条分镜',
    rendering: '渲染中…',
    renderBtnTitle: '把整条分镜渲成一条 mp4（DEMO：本地 ffmpeg 确定性推演，非 AI 生成）。成片挂回第一镜的 videoAssetId',
    quota: (plan: string, grants: number, cost: number, left: number, balance: number) =>
      `${plan} 档：每月 ${grants} 次成片渲染 · 每次 ${cost} 点 · 本月还可渲 ${left} 次（Video credits 余额 ${balance} 点）`,
    quotaExhausted: '——额度用尽时服务端会拒（429），这里先置灰',
    renderDone: (ms: number) => `成片已挂到第一镜（整条分镜一条片子），耗时 ${ms} 毫秒`,
    renderHistory: (n: number) => `这条分镜渲过 ${n} 版（都是 DEMO，新的在前）：`,
    msUnit: '毫秒',
    attachmentNotDone: ' 条没做到的',
    mountedOnShot: ' · 正挂在某一镜上',
    timelineDoc: '时间线（§41）· 说明与轨道',
    splitHint: '双击一格在点击处切成两镜',
    timelineHintTail: '（两半共享同一张参考帧——切的是时间线，不是像素）；',
    timelineHint: (coarseStep: number) => `松手才写库，每一步都可撤销。键盘：Tab 到格子的右边缘，左右方向键调长度（Shift 一格 ${coarseStep} 毫秒），Enter 落库、Esc 取消；换位用镜头表里的 ↑ ↓，精确毫秒用那个数字框——四条路改的是同一份模型。`,
    emptyTrack: (reason: string) => `空——${reason}`,
    noTrackContent: '这一版没有内容',
    clipCount: (n: number) => `${n} 格`,
    originsSection: '这一版分镜是怎么来的',
    timelineSection: '时间线（§41）',
    totalLength: '总长',
    seconds: '秒',
    notPlayable: '不可播：还没有能直接播放的画面——镜头视频那一格要真 provider，本机不做假生成（§159）',
    playable: ' 可播',
    timelineAria: (shots: number) =>
      `时间线：${shots} 个镜头按顺序排开。拖格子右边缘改长度、拖整块换位置；点任意一格在镜头列表里定位那一镜；键盘按 Tab 到右边缘用方向键改`,
    timelineBlockAria: (i: number, seconds: string, camera: string, transition: string, labelForTransition: string) =>
      `第 ${i} 镜：${seconds} 秒，${camera}，衔接${labelForTransition}`,
    timelineBlockTitle: (i: number, seconds: string, camera: string, transition: string) =>
      `第 ${i} 镜 · ${seconds} 秒 · ${camera} · ${transition} · 双击在点击处切成两镜`,
    noCharactersAssets: '这个项目还没有角色，参考图也要先在资产库里上传（不给你手填 id）',
    unreadableCharacters: (n: number, m: number) => `${n} 位角色可挂，其中 ${m} 位档案读不出来，暂时不列`,
    rosterMiss: '名册或资产清单没读到，镜头上的引用暂时只能留空',
    newReference: '（新生成的参考图）',
    noNamedCharacter: '（没有名字的角色）',
    attachedFinished: '成片已挂到第 1 镜，镜头列表已定位到它',
    locatedInList: (n: number) => `第 ${n} 镜：镜头列表已定位到这一镜`,
    locatedOnStrip: (n: number) => `第 ${n} 镜：已在时间线上定位`,
    lengthChanged: (at: number, delta: string) => `${at >= 0 ? `第 ${at + 1} 镜` : '这一镜'}的长度改成 ${delta} 秒，已写库`,
    splitAtCursor: (at: number) => `第 ${at + 1} 镜在点击处切成两镜，已写库，可撤销`,
    revertPreview: (n: number, seconds: string) => `第 ${n} 镜还是 ${seconds} 秒，取消了这个预览`,
    atLimit: (n: number, isFloor: boolean, edgeSeconds: string) =>
      `第 ${n} 镜已经是${isFloor ? `下限 ${edgeSeconds}` : `上限 ${edgeSeconds}`}秒，这一步没改`,
    previewSeconds: (n: number, seconds: string) => `第 ${n} 镜 ${seconds} 秒，还没写库`,
    emptyPrompt: '这一镜的提示词是空的，没有写进去——空白的镜头没法生成。',
    badDuration: (max: number, min: number, step: number, draft: string, currentMs: number) =>
      `时长要 1 到 ${max} 之间的整数毫秒（拖拽那条路的下限是 ${min}、吸附 ${step}），「${draft}」没写进去——这一镜还是 ${currentMs} 毫秒。`,
    announceSourceChanged: (label: string) => `来源改成了${label}，已写库，可撤销`,
    frameSourceLine: (i: number) => `第 ${i} 镜：`,
    frameSourceSelf: '画面来自这一镜自己挂的参考帧',
    frameSourceWhole: '画面来自整片那张图（image-to-video 箭头带的，本镜没自己挂）',
    frameSourcePlaceholder: '色卡占位（本镜没挂参考帧）',
    shotPromptAria: '这一镜要拍什么',
    resizeHint: (step: number, min: number, _coarseStep: number) =>
      `拖右边缘改长度（吸附 ${step} 毫秒，下限 ${min} 毫秒）、拖整块换位、点左上角的转场标记换衔接、点条上任意一格在镜头列表里定位那一镜（反向用镜头行里的「定位」）、`,
    reloadTitle: '重新读库里那一份（未保存的本地编辑会被覆盖）',
    referenceError: (msg: string) => `参考图没生成：${msg}`,
    rosterCharacter: (name: string) => `角色 ${name}`,
    rosterReference: (name: string) => `参考图 ${name}`,
    swapTransitionAria: (label: string) => `换这一镜的转场（现在是${label}）`,
    swapTransitionTitle: (label: string) => `这一镜的衔接是${label}，点一下换下一种（可撤销）`,
    resizeHandleAria: (n: number, stepMs: number, coarseStepMs: number) =>
      `第 ${n} 镜的右边缘：拖动改长度；方向键一格 ${stepMs} 毫秒、Shift 一格 ${coarseStepMs} 毫秒，Enter 落库，Esc 取消`,
    ariaValueSeconds: (v: string) => `${v} 秒`,
    dragPreviewShot: (n: number, fromSec: string, toSec: string) => `第 ${n} 镜：${fromSec} 秒 → ${toSec} 秒`,
    dragReorderShot: (fromOne: number, toOne: number) => `把第 ${fromOne} 镜拖到第 ${toOne} 位`,
    previewVideoTitle: 'DEMO 成片预览：真 ffmpeg 渲出来的字节，像素是本地确定性推演、不是 AI 生成（§160）',
  },
  en: {
    heading: 'Storyboard',
    state: { idle: '', loading: 'Loading…', dirty: 'Unsaved', saving: 'Saving…', saved: 'Saved', error: 'Save failed' } as Record<string, string>,
    readError: (err: string) => `The stored storyboard cannot be read: ${err}`,
    emptyBody: 'This project has no storyboard yet. Write one line; the panel splits it into a shot list below — local deterministic punctuation, not AI storyboarding (no fake generation until a provider is wired).',
    readStoryboard: 'Reading the storyboard…',
    promptPlaceholder: 'Night harbor: an old crane turns slowly, a cat leaps onto the cable, it sprints off',
    sourceLabel: 'Source of this piece',
    referenceAssetAria: 'Reference image for this piece',
    referenceAssetEmpty: 'Pick a pinned reference image from the asset library…',
    characterAria: 'Character for this piece',
    characterEmpty: 'Pick a character in this project…',
    createAndSplit: 'Cut a storyboard',
    changeSource: 'Change source',
    changeSourceTitle: 'Swap the arrow (no re-cut: shots, durations, undo stack all stay)',
    changeSourceNote: 'Changing source does not re-cut the version: shots, lengths and the undo stack stay.',
    undo: 'Undo',
    redo: 'Redo',
    reload: 'Reload',
    applySource: 'Apply source',
    cancel: 'Cancel',
    shotsVsSeconds: (shots: number, seconds: number) => `${shots} shots · ${seconds}s`,
    sourceArrow: (label: string) => `Source: ${label}`,
    arrowOption: (label: string, need: string) => `${label} (${need})`,
    sourcePrompt: 'Prompt: ',
    sourceMissing: '(no prompt)',
    locateShot: 'Locate',
    locateTitle: 'Find this shot in the timeline',
    locateAria: (n: number) => `Locate shot ${n} in the timeline`,
    cameraAria: 'Camera',
    transitionAria: 'Transition',
    durationAria: 'Duration (ms)',
    shotCharacterAria: 'Character in this shot',
    noCharacter: 'No character',
    shotReferenceAria: 'Reference image for this shot',
    noReference: 'No reference image',
    imageBusy: 'Composing…',
    imageTitle: 'Local deterministic composition (DEMO), not AI output; undo only drops the reference, it never deletes generated assets',
    imageAria: 'Generate a reference image for this shot',
    imageBtn: 'DEMO reference',
    upOne: 'Previous',
    downOne: 'Next',
    splitBefore: (ms: number) => `This shot is shorter than two stride steps (${ms} ms) — cannot split off a second shot`,
    splitReady: 'Split this shot at its midpoint into two (undoable)',
    lastCannotDelete: 'Last shot cannot be deleted: a 0-shot timeline has nothing to edit',
    deleteShot: 'Delete this shot (undoable)',
    insertAfter: 'Insert a shot after this one',
    newShotPrompt: 'New shot: say what to shoot',
    renderSection: 'Render (§40 last cell · DEMO)',
    renderLead: 'Real ffmpeg, real pipeline: quota door runs before the task starts, reference frames are fetched by id (with ownership check), the render goes through the video ingest gate — credits only burn on success.',
    renderHonesty: 'Pixels are ',
    renderHonestyBold: 'local deterministic inference, not AI output',
    renderHonestyTail: ' — labeled plainly, no fake video provider (§159/§160).',
    renderBtn: 'DEMO-render the whole storyboard',
    rendering: 'Rendering…',
    renderBtnTitle: 'Render the whole storyboard into one mp4 (DEMO: local ffmpeg deterministic inference, not AI-generated). The finished clip is attached as the first shot’s videoAssetId',
    quota: (plan: string, grants: number, cost: number, left: number, balance: number) =>
      `${plan} tier: ${grants} renders/month · ${cost} credits each · ${left} renders left this month (Video credits balance ${balance})`,
    quotaExhausted: ' — once exhausted the server refuses (429); here it is greyed out first',
    renderDone: (ms: number) => `The finished clip is attached to the first shot (one clip per storyboard); took ${ms} ms`,
    renderHistory: (n: number) => `${n} render(s) of this storyboard (all DEMO, newest first):`,
    msUnit: 'ms',
    attachmentNotDone: ' unfinished item(s)',
    mountedOnShot: ' · attached to a shot',
    timelineDoc: 'Timeline (§41) · notes and lanes',
    splitHint: 'Double-click a cell to split at the click point',
    timelineHintTail: ' (the two halves share one reference frame — you split the timeline, not the pixels);',
    timelineHint: (coarseStep: number) => `Write happens on drop; every step is undoable. Keyboard: Tab to a cell’s right edge, arrow keys nudge length (Shift = ${coarseStep} ms per step), Enter commits, Esc cancels; reorder via the ↑ ↓ in the shot list; the exact-ms box is another path to the same model.`,
    emptyTrack: (reason: string) => `empty — ${reason}`,
    noTrackContent: 'this version carries no content',
    clipCount: (n: number) => `${n} clips`,
    originsSection: 'How this storyboard was made',
    timelineSection: 'Timeline (§41)',
    totalLength: 'Total',
    seconds: 's',
    notPlayable: 'not playable: there is no directly playable picture — the shot-video cell needs a real provider; no fake generation on this machine (§159)',
    playable: ' playable',
    timelineAria: (shots: number) =>
      `Timeline: ${shots} shots arranged in order. Drag a cell’s right edge to change length, drag the block to reorder; click any cell to locate that shot in the shot list; Tab to the right edge and use arrow keys`,
    timelineBlockAria: (i: number, seconds: string, camera: string, transition: string, labelForTransition: string) =>
      `Shot ${i}: ${seconds}s, ${camera}, ${labelForTransition}`,
    timelineBlockTitle: (i: number, seconds: string, camera: string, transition: string) =>
      `Shot ${i} · ${seconds}s · ${camera} · ${transition} · double-click to split at this point`,
    noCharactersAssets: 'This project has no characters yet, and reference images must be uploaded to the asset library first (no typed ids)',
    unreadableCharacters: (n: number, m: number) => `${n} characters can be linked, ${m} profile(s) unreadable and not listed`,
    rosterMiss: 'The roster or asset library cannot be read — references stay empty for now',
    newReference: '(new reference image)',
    noNamedCharacter: '(no-named character)',
    attachedFinished: 'The finished clip is attached to shot 1; the shot list is focused there',
    locatedInList: (n: number) => `Shot ${n}: shot list focused there`,
    locatedOnStrip: (n: number) => `Shot ${n}: located on the timeline`,
    lengthChanged: (at: number, delta: string) => `${at >= 0 ? `Shot ${at + 1}` : 'This shot'} changed to ${delta}s, written to the library`,
    splitAtCursor: (at: number) => `Shot ${at + 1} split in two at the click point, written, undoable`,
    revertPreview: (n: number, seconds: string) => `Shot ${n} still ${seconds}s — preview reverted`,
    atLimit: (n: number, isFloor: boolean, edgeSeconds: string) =>
      `Shot ${n} already at the ${isFloor ? `floor ${edgeSeconds}s` : `ceiling ${edgeSeconds}s`} — no change`,
    previewSeconds: (n: number, seconds: string) => `Shot ${n} ${seconds}s, not written yet`,
    emptyPrompt: 'This shot’s prompt is empty — it was not written, a blank shot cannot generate.',
    badDuration: (max: number, min: number, step: number, draft: string, currentMs: number) =>
      `Duration must be an integer ms between 1 and ${max} (drag route floor is ${min}, snap ${step}); “${draft}” was not written — the shot keeps ${currentMs}ms.`,
    announceSourceChanged: (label: string) => `Source changed to ${label}, written, undoable`,
    frameSourceLine: (i: number) => `Shot ${i}: `,
    frameSourceSelf: 'Frame from this shot’s own reference',
    frameSourceWhole: 'Frame from the whole-piece image (image-to-video arrow carries this shot; no own reference)',
    frameSourcePlaceholder: 'Color-card placeholder (no reference on this shot)',
    shotPromptAria: 'What to shoot in this shot',
    resizeHint: (step: number, min: number, _coarseStep: number) =>
      `Drag the right edge to resize (snaps to ${step} ms, minimum ${min} ms), drag the block to reorder, click the transition mark at the top-left to swap the join, click any cell in the strip to locate that shot in the list (reverse via “Locate” in the shot row), `,
    reloadTitle: 'Re-read the library copy (unsaved local edits will be overwritten)',
    referenceError: (msg: string) => `The reference image failed: ${msg}`,
    rosterCharacter: (name: string) => `Character ${name}`,
    rosterReference: (name: string) => `Reference ${name}`,
    swapTransitionAria: (label: string) => `Swap this shot’s transition (currently ${label})`,
    swapTransitionTitle: (label: string) => `This shot joins via ${label} — click to switch to the next one (undoable)`,
    resizeHandleAria: (n: number, stepMs: number, coarseStepMs: number) =>
      `Right edge of shot ${n}: drag to resize; arrow key = ${stepMs} ms per step, Shift = ${coarseStepMs} ms, Enter commits, Esc cancels`,
    ariaValueSeconds: (v: string) => `${v}s`,
    dragPreviewShot: (n: number, fromSec: string, toSec: string) => `Shot ${n}: ${fromSec}s → ${toSec}s`,
    dragReorderShot: (fromOne: number, toOne: number) => `Drag shot ${fromOne} to slot ${toOne}`,
    previewVideoTitle: 'DEMO render preview: bytes rendered by real ffmpeg — pixels are local deterministic inference, not AI generation (§160)',
  },
} as const;

/** 界面状态里的两个引用用空字符串表示"还没挑"；到规则里要折成 undefined（空 id 与没有 id 是两件事） */
type ArrowSourceValue = { arrow: StoryboardArrow; referenceAssetId: string; characterId: string };

function arrowSourceGaps(value: ArrowSourceValue): string[] {
  return missingArrowSource({
    arrow: value.arrow,
    referenceAssetId: value.referenceAssetId || undefined,
    characterId: value.characterId || undefined,
  });
}

/**
 * 箭头 + 它要的两个引用：建分镜的空态与建完之后的「改来源」用**同一个组件**。
 * 两处各写一份的话，"这边说要参考图、那边却不要"就会漂成两套规则（§159）。
 * `dataAttr` 把两处的测试抓手分开——页面上同一时刻只会出现一份，但名字不重样读起来不费解。
 */
function SourceFields({
  idPrefix,
  value,
  onChange,
  roster,
  dataAttr,
  c,
  locale,
}: {
  idPrefix: string;
  value: ArrowSourceValue;
  onChange: (next: ArrowSourceValue) => void;
  roster: { characters: { id: string; name: string }[]; assets: { id: string; name: string }[] };
  dataAttr: { arrow: string; asset: string; character: string; missing: string };
  c: StoryboardCopy;
  locale: 'zh' | 'en';
}) {
  const needs = ARROW_SOURCE_NEEDS[value.arrow];
  const gaps = arrowSourceGaps(value);
  const attr = (name: string): Record<string, string> => ({ [name]: 'true' });
  return (
    <div className="sb-col1">
      <label className="sb-faint11" htmlFor={`${idPrefix}-arrow`}>
        {c.sourceLabel}
      </label>
      <select
        id={`${idPrefix}-arrow`}
        value={value.arrow}
        onChange={(e) => onChange({ ...value, arrow: e.target.value as StoryboardArrow })}
        {...attr(dataAttr.arrow)}
        className="sb-inputBox"
      >
        {STORYBOARD_ARROWS.map((option) => (
          <option key={option} value={option}>
            {c.arrowOption(arrowLabel(option, locale), arrowNeedText(option, locale))}
          </option>
        ))}
      </select>
      {needs.referenceAssetId ? (
        <select
          aria-label={c.referenceAssetAria}
          value={value.referenceAssetId}
          onChange={(e) => onChange({ ...value, referenceAssetId: e.target.value })}
          {...attr(dataAttr.asset)}
          className="sb-inputBox"
        >
          <option value="">{c.referenceAssetEmpty}</option>
          {roster.assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
      ) : null}
      {needs.characterId ? (
        <select
          aria-label={c.characterAria}
          value={value.characterId}
          onChange={(e) => onChange({ ...value, characterId: e.target.value })}
          {...attr(dataAttr.character)}
          className="sb-inputBox"
        >
          <option value="">{c.characterEmpty}</option>
          {roster.characters.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name}
            </option>
          ))}
        </select>
      ) : null}
      {gaps.length ? (
        <p className="sb-faint11" {...attr(dataAttr.missing)}>
          {gaps.join(' ')}
        </p>
      ) : null}
    </div>
  );
}

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

export function StoryboardPanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const studio = useStudioReady();
  const snapshot = useStoryboard();
  const [prompt, setPrompt] = useState('');
  /**
   * §40 建分镜时的来源：四条箭头 + 要参考的那两条各自的引用。
   * 默认 `text-to-video`：只要一句话就能切，这是唯一不需要额外东西的那条。
   */
  const [arrow, setArrow] = useState<StoryboardArrow>('text-to-video');
  const [sourceAssetId, setSourceAssetId] = useState('');
  const [sourceCharacterId, setSourceCharacterId] = useState('');
  /**
   * 建完之后改来源（§40 的另一半）：编辑面板开着没有、草稿是什么。
   * 打开的那一刻才从当前文档拷一份——常驻同步会让"撤销了来源"与草稿对不上。
   */
  const [sourceEditing, setSourceEditing] = useState(false);
  const [sourceDraft, setSourceDraft] = useState<ArrowSourceValue>({
    arrow: 'text-to-video',
    referenceAssetId: '',
    characterId: '',
  });
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
  /** 上一次 DEMO 渲染的交代：没做到的事（warnings）与计划说的每一句（notes）原样显示（§159）。segments = 逐镜画面出处（本镜自己挂的 / 整片那张 / 色卡） */
  const [renderNote, setRenderNote] = useState<{
    assetId: string;
    warnings: string[];
    notes: string[];
    renderMs: number;
    segments: Array<{ index: number; shotId: string; frame: 'own' | 'whole-piece' | 'card' }>;
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
          (item) => ({ id: item.id, name: item.profile.name || c.noNamedCharacter }),
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
            ? 'c.noCharactersAssets'
            : unreadable
              ? c.unreadableCharacters(characters.length, unreadable)
              : null,
        );
      } catch {
        if (!cancelled) setRosterNote(c.rosterMiss);
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
            : { ...prev, assets: [...prev.assets, { id: body.asset!.id, name: body.asset!.name || c.newReference }] },
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
            segments?: Array<{ index: number; shotId: string; frame: 'own' | 'whole-piece' | 'card' }>;
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
        segments: body.segments ?? [],
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
      setAnnounce(c.attachedFinished);
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
    setAnnounce(c.locatedInList(index + 1));
    document.querySelector(`[data-storyboard-shot="${shotId}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  /** 镜头列表 → 时间线：把那一格滚进视野（条是横的，两个方向都要） */
  const locateOnStrip = (shotId: string, index: number): void => {
    setLinkedShotId(shotId);
    setAnnounce(c.locatedOnStrip(index + 1));
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
    setAnnounce(c.lengthChanged(at, (active.previewMs / 1000).toFixed(1)));
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
      setAnnounce(c.splitAtCursor(at));
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
      setAnnounce(c.revertPreview(index + 1, (shot.durationMs / 1000).toFixed(1)));
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
        c.atLimit(index + 1, fromMs <= MIN_SHOT_MS, ((fromMs <= MIN_SHOT_MS ? MIN_SHOT_MS : MAX_SHOT_MS) / 1000).toFixed(1)),
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
    setAnnounce(c.previewSeconds(index + 1, (previewMs / 1000).toFixed(1)));
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

  /**
   * 缺来源就不许切：`missingArrowSource` 与服务端拒收读的是**同一条规则**。
   * 空字符串在这里折成 undefined——选择器里"还没挑"是一个空选项，不是一个空 id。
   */
  const sourceGaps = arrowSourceGaps({ arrow, referenceAssetId: sourceAssetId, characterId: sourceCharacterId });

  if (!sb) {
    return (
      <div className="sb-root" data-storyboard-panel>
        <h2 className="sb-label12">{c.heading}</h2>
        <p className="sb-body12" data-storyboard-empty>
          {snapshot.saveState === 'loading'
            ? c.readStoryboard
            : snapshot.error
              ? c.readError(snapshot.error)
              : c.emptyBody}
        </p>
        {snapshot.error ? (
          <p className="sb-danger11" data-storyboard-error>
            {snapshot.error}
          </p>
        ) : null}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder={c.promptPlaceholder}
          data-storyboard-prompt-input
          className="sb-inputBoxResize"
        />
        {/* §40 的四条箭头：它决定这一版分镜从什么出发，也是界面上唯一能表达这件事的地方 */}
        <SourceFields
          idPrefix="storyboard-create"
          value={{ arrow, referenceAssetId: sourceAssetId, characterId: sourceCharacterId }}
          onChange={(next) => {
            setArrow(next.arrow);
            setSourceAssetId(next.referenceAssetId);
            setSourceCharacterId(next.characterId);
          }}
          roster={roster}
          dataAttr={{
            arrow: 'data-storyboard-arrow',
            asset: 'data-storyboard-source-asset',
            character: 'data-storyboard-source-character',
            missing: 'data-storyboard-source-missing',
          }}
          c={c}
          locale={locale}
        />
        {rosterNote ? <p className="sb-faint11">{rosterNote}</p> : null}
        <button
          type="button"
          disabled={!prompt.trim() || snapshot.saveState === 'saving' || sourceGaps.length > 0}
          onClick={() =>
            void storyboardStore.planFrom(prompt, {
              arrow,
              referenceAssetId: sourceAssetId || undefined,
              characterId: sourceCharacterId || undefined,
            })
          }
          data-storyboard-create
          className="sb-accentBtn sb-selfStart"
        >
          {c.createAndSplit}
        </button>
        {snapshot.notice ? (
          <p className="sb-faint11" data-storyboard-notice>
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
      storyboardStore.showNotice(c.emptyPrompt);
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
        c.badDuration(MAX_SHOT_MS, MIN_SHOT_MS, SHOT_MS_STEP, drafts[key] ?? '', shot.durationMs),
      );
      return;
    }
    if (next === shot.durationMs) return;
    storyboardStore.applyOps([{ op: 'updateShot', id: shot.id, before: { durationMs: shot.durationMs }, after: { durationMs: next } }]);
  };

  const total = sb.shots.length;

  /**
   * §40 建完之后的交代：这一版是从哪条箭头来的、挂的是哪张图/哪位角色。
   * 显示哪一格由**箭头要什么**决定：`source` 里可能还留着旧箭头的引用（一次编辑的中间态），
   * 但这条片子实际从什么出发只有一个答案——两格都显示会把"角色 X"写进"文字 → 视频"旁边。
   */
  const sourceNeeds = ARROW_SOURCE_NEEDS[sb.source.arrow];
  const sourceRefName = sourceNeeds.characterId
    ? sb.source.characterId
      ? c.rosterCharacter(roster.characters.find((who) => who.id === sb.source.characterId)?.name ?? sb.source.characterId)
      : null
    : sourceNeeds.referenceAssetId
      ? sb.source.referenceAssetId
        ? c.rosterReference(roster.assets.find((asset) => asset.id === sb.source.referenceAssetId)?.name ?? sb.source.referenceAssetId)
        : null
      : null;

  /**
   * 改来源的草稿按**新箭头要什么**先归一：与箭头无关的那一格在应用时会被抹掉
   * （store 的 `changeSource` 做同一件事），所以"改没改"也要按归一后的值比——
   * 否则切一圈箭头回到原点，应用键还是亮的，按下去却什么都没变。
   */
  const draftNeeds = ARROW_SOURCE_NEEDS[sourceDraft.arrow];
  const draftAfter = {
    arrow: sourceDraft.arrow,
    referenceAssetId: draftNeeds.referenceAssetId ? sourceDraft.referenceAssetId || undefined : undefined,
    characterId: draftNeeds.characterId ? sourceDraft.characterId || undefined : undefined,
  };
  const draftGaps = missingArrowSource(draftAfter);
  const sourceUnchanged =
    sb.source.arrow === draftAfter.arrow &&
    (sb.source.referenceAssetId || undefined) === draftAfter.referenceAssetId &&
    (sb.source.characterId || undefined) === draftAfter.characterId;

  return (
    <div className="sb-rootCol" data-storyboard-panel>
      <header className="sb-sectionBorderB">
        <div className="sb-row2">
          <h2 className="sb-label12">{c.heading}</h2>
          <span
            className={cn('sb-saveBadge', snapshot.saveState === 'error' && 'sb-saveBadgeError')}
            data-storyboard-save-state
          >
            {c.state[snapshot.saveState] ?? ''}
          </span>
        </div>
        <p className="sb-inkMt1-12" data-storyboard-summary>
          {`${c.shotsVsSeconds(total, (timeline?.totalMs ?? 0) / 1000)} · ${c.sourceArrow(arrowLabel(sb.source.arrow, locale))}${
            sourceRefName ? `｜${sourceRefName}` : ''
          }`}
        </p>
        <p className="sb-faintMt1" data-storyboard-source-prompt>
          {c.sourcePrompt}{sb.source.prompt || c.sourceMissing}
        </p>
        <div className="sb-rowMt2">
          <button
            type="button"
            onClick={() => {
              // 打开时从当前文档拷一份：撤销过来源之后草稿不能还是旧的那一份
              setSourceDraft({
                arrow: sb.source.arrow,
                referenceAssetId: sb.source.referenceAssetId ?? '',
                characterId: sb.source.characterId ?? '',
              });
              setSourceEditing((open) => !open);
            }}
            title={c.changeSourceTitle}
            aria-expanded={sourceEditing}
            aria-controls={sourceEditing ? 'storyboard-source-editor' : undefined}
            data-storyboard-source-open
            className="sb-btn2"
          >
            {c.changeSource}
          </button>
          <button
            type="button"
            onClick={() => storyboardStore.undo()}
            disabled={!snapshot.canUndo || snapshot.saveState === 'saving'}
            title={c.undo}
            data-storyboard-undo
            className="sb-btn2dis"
          >
            {c.undo}
          </button>
          <button
            type="button"
            onClick={() => storyboardStore.redo()}
            disabled={!snapshot.canRedo || snapshot.saveState === 'saving'}
            title={c.redo}
            data-storyboard-redo
            className="sb-btn2dis"
          >
            {c.redo}
          </button>
          <button
            type="button"
            onClick={() => storyboardStore.reload()}
            className="sb-btn2faint"
            title={c.reloadTitle}
            data-storyboard-reload
          >
            {c.reload}
          </button>
        </div>
        {/* §40 建完之后改来源：镜头表不重切、长度不变、一次应用是一个可撤销事务（§150） */}
        {sourceEditing ? (
          <div
            id="storyboard-source-editor"
            className="sb-boxMt2"
            data-storyboard-source-editor
          >
            <SourceFields
              idPrefix="storyboard-source-edit"
              value={sourceDraft}
              onChange={setSourceDraft}
              roster={roster}
              dataAttr={{
                arrow: 'data-storyboard-source-edit-arrow',
                asset: 'data-storyboard-source-edit-asset',
                character: 'data-storyboard-source-edit-character',
                missing: 'data-storyboard-source-edit-missing',
              }}
              c={c}
              locale={locale}
            />
            <p className="sb-faint11">{c.changeSourceNote}</p>
            <div className="sb-row1">
              <button
                type="button"
                disabled={draftGaps.length > 0 || sourceUnchanged || snapshot.saveState === 'saving'}
                onClick={() => {
                  const changed = storyboardStore.changeSource({
                    arrow: sourceDraft.arrow,
                    referenceAssetId: sourceDraft.referenceAssetId || undefined,
                    characterId: sourceDraft.characterId || undefined,
                  });
                  if (changed) {
                    setSourceEditing(false);
                    setAnnounce(c.announceSourceChanged(arrowLabel(sourceDraft.arrow, locale)));
                  }
                }}
                data-storyboard-source-apply
                className="sb-accentBtn"
              >
                {c.applySource}
              </button>
              <button
                type="button"
                onClick={() => setSourceEditing(false)}
                data-storyboard-source-cancel
                className="sb-btn2faint"
              >
                {c.cancel}
              </button>
            </div>
          </div>
        ) : null}
        {snapshot.error ? (
          <p className="sb-dangerMt1" data-storyboard-error>
            {snapshot.error}
          </p>
        ) : null}
        {snapshot.notice ? (
          <p className="sb-faintMt1" data-storyboard-notice>
            {snapshot.notice}
          </p>
        ) : null}
        {rosterNote ? (
          <p className="sb-faintMt1" data-storyboard-roster-note>
            {rosterNote}
          </p>
        ) : null}
        {imageError ? (
          <p className="sb-dangerMt1" data-storyboard-image-error>
            {c.referenceError(imageError)}
          </p>
        ) : null}
      </header>

      <div className="sb-scroll">
        <ul className="sb-colPad3">
          {sb.shots.map((shot, index) => (
            <li
              key={shot.id}
              className={cn('sb-shotCard', linkedShotId === shot.id && 'sb-shotLinked')}
              data-storyboard-shot={shot.id}
              data-storyboard-shot-linked={linkedShotId === shot.id ? 'true' : undefined}
            >
              {/* 换行是必要的：面板只有 264px 宽，机位+转场+时长已经占满一行，
                  不换行时 ↑↓＋✕ 四个动作会被裁到面板外面——点得到但看不见，等于没有 */}
              <div className="sb-wrap2">
                <span className="sb-mono11">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <button
                  type="button"
                  onClick={() => locateOnStrip(shot.id, index)}
                  title={c.locateTitle}
                  aria-label={c.locateAria(index + 1)}
                  data-storyboard-locate={shot.id}
                  className="sb-chip"
                >
                  {c.locateShot}
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
                  aria-label={c.cameraAria}
                  data-storyboard-camera={shot.id}
                  className="sb-chip sb-fg1"
                >
                  {SHOT_CAMERAS.map((cam) => (
                    <option key={cam} value={cam}>
                      {cameraLabel(cam, locale)}
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
                  aria-label={c.transitionAria}
                  data-storyboard-transition={shot.id}
                  className="sb-chip sb-fg1"
                >
                  {SHOT_TRANSITIONS.map((t) => (
                    <option key={t} value={t}>
                      {transitionLabel(t, locale)}
                    </option>
                  ))}
                </select>
                <input
                  value={draftOf(shot, 'durationMs')}
                  onChange={(e) => setDraft(`${shot.id}::durationMs`, e.target.value)}
                  onBlur={() => flushDuration(shot)}
                  aria-label={c.durationAria}
                  data-storyboard-duration={shot.id}
                  className="sb-chip sb-fg1 sb-cap64"
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
                  aria-label={c.shotCharacterAria}
                  data-storyboard-character={shot.id}
                  className="sb-chip sb-fg1 sb-max110"
                >
                  <option value="">{c.noCharacter}</option>
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
                  aria-label={c.shotReferenceAria}
                  data-storyboard-reference={shot.id}
                  className="sb-chip sb-fg1 sb-max110"
                >
                  <option value="">{c.noReference}</option>
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
                  title={c.imageTitle}
                  aria-label={c.imageAria}
                  data-storyboard-image-gen={shot.id}
                  className="sb-chip sb-dis40"
                >
                  {imageBusy === shot.id ? c.imageBusy : c.imageBtn}
                </button>
                <span className="sb-rowEnd">
                  <button
                    type="button"
                    onClick={() => storyboardStore.applyOps([{ op: 'moveShot', from: index, to: index - 1 }])}
                    disabled={index === 0}
                    title={c.upOne}
                    data-storyboard-move-up={shot.id}
                    className="sb-chip sb-dis40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => storyboardStore.applyOps([{ op: 'moveShot', from: index, to: index + 1 }])}
                    disabled={index === total - 1}
                    title={c.downOne}
                    data-storyboard-move-down={shot.id}
                    className="sb-chip sb-dis40"
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
                            prompt: c.newShotPrompt,
                            durationMs: DEFAULT_SHOT_MS,
                            camera: 'medium',
                            transition: 'cut',
                          },
                        },
                      ])
                    }
                    title={c.insertAfter}
                    data-storyboard-add={shot.id}
                    className="sb-chip"
                  >
                    ＋
                  </button>
                  {/* §41 片段级裁切的键盘路：与时间线上的双击走同一个 store.splitShot，只是切点固定中点 */}
                  <button
                    type="button"
                    onClick={() => storyboardStore.splitShot(shot.id, Math.round(shot.durationMs / 2), `shot-split-${crypto.randomUUID().slice(0, 8)}`)}
                    disabled={shot.durationMs < MIN_SHOT_MS * 2}
                    title={shot.durationMs < MIN_SHOT_MS * 2 ? c.splitBefore(MIN_SHOT_MS * 2) : c.splitReady}
                    data-storyboard-split={shot.id}
                    className="sb-chip sb-dis40"
                  >
                    ✂
                  </button>
                  <button
                    type="button"
                    onClick={() => storyboardStore.applyOps([{ op: 'removeShot', id: shot.id }])}
                    disabled={total <= 1}
                    title={total <= 1 ? c.lastCannotDelete : c.deleteShot}
                    data-storyboard-remove={shot.id}
                    className="sb-chip sb-dis40"
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
                aria-label={c.shotPromptAria}
                data-storyboard-prompt={shot.id}
                className="sb-inputMtResize"
              />
            </li>
          ))}
        </ul>

        <section className="sb-sectionBorderT" data-storyboard-render-panel>
          <h3 className="sb-label">{c.renderSection}</h3>
          <p className="sb-inkMt1">
            {c.renderLead}
            {c.renderHonesty}<strong>{c.renderHonestyBold}</strong>{c.renderHonestyTail}
          </p>
          <button
            type="button"
            disabled={renderBusy || sb.shots.length === 0 || quota?.rendersLeft === 0}
            onClick={() => void renderDemo()}
            data-storyboard-render
            title={c.renderBtnTitle}
            className="sb-btnDis"
          >
            {renderBusy ? c.rendering : c.renderBtn}
          </button>
          {quota ? (
            <p className="sb-faintMt2" data-storyboard-render-quota>
              {c.quota(quota.planLabel, quota.monthlyGrant, quota.costPerRender, quota.rendersLeft, quota.balance)}
              {quota.rendersLeft === 0 ? c.quotaExhausted : ''}
            </p>
          ) : null}
          {renderError ? (
            <p className="sb-dangerMt2" data-storyboard-render-error>
              {renderError}
            </p>
          ) : null}
          {renderNote ? (
            <div className="sb-colMt2" data-storyboard-render-result>
              <p className="sb-ink11">
                <span className="sb-demoChip">DEMO</span>
                {' '}{c.renderDone(renderNote.renderMs)}
              </p>
              <video
                controls
                preload="metadata"
                src={apiAssetUrl(renderNote.assetId)}
                data-storyboard-render-video
                className="sb-trackMt"
                title={c.previewVideoTitle}
              />
              {renderNote.warnings.length ? (
                <ul className="sb-col1" data-storyboard-render-warnings>
                  {renderNote.warnings.map((w) => (
                    <li key={w} className="sb-warn11">
                      {w}
                    </li>
                  ))}
                </ul>
              ) : null}
              {renderNote.segments.length ? (
                <ul className="sb-col1" data-storyboard-render-provenance>
                  {renderNote.segments.map((segment) => (
                    <li key={`${segment.shotId}-${segment.index}`} className="sb-faint11">
                      {`${c.frameSourceLine(segment.index + 1)}${
                        segment.frame === 'own'
                          ? c.frameSourceSelf
                          : segment.frame === 'whole-piece'
                            ? c.frameSourceWhole
                            : c.frameSourcePlaceholder
                      }`}
                    </li>
                  ))}
                </ul>
              ) : null}
              <ul className="sb-col1">
                {renderNote.notes.map((n) => (
                  <li key={n} className="sb-faint11">
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {renders.length ? (
            <div className="sb-colMt2" data-storyboard-render-history>
              <span className="sb-faint11">{c.renderHistory(renders.length)}</span>
              <ul className="sb-col1">
                {renders.map((r) => (
                  <li key={r.assetId} className="sb-col1ink">
                    <span>
                      <span className="sb-demoChip">DEMO</span>
                      {' '}
                      {new Date(r.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN')} · {r.renderMs} {c.msUnit}
                      {r.warnings.length ? ` · ${r.warnings.length}${c.attachmentNotDone}` : ''}
                      {sb.shots.some((s) => s.videoAssetId === r.assetId) ? c.mountedOnShot : ''}
                    </span>
                    <video
                      controls
                      preload="metadata"
                      src={apiAssetUrl(r.assetId)}
                      data-storyboard-render-video
                      className="sb-track"
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="sb-sectionBorderT" data-storyboard-timeline-doc>
          <h3 className="sb-label">{c.timelineDoc}</h3>
          <p className="sb-faintMt1">
            {c.resizeHint(SHOT_MS_STEP, MIN_SHOT_MS, SHOT_MS_COARSE_STEP)}
            <span data-timeline-split-hint>{c.splitHint}</span>{c.timelineHintTail}
            {c.timelineHint(SHOT_MS_COARSE_STEP)}
          </p>
          <ul className="sb-colMt2">
            {(timeline?.tracks ?? []).map((track) => (
              <li key={track.kind} className="sb-ink11" data-storyboard-track={track.kind}>
                <span className="sb-monoFaint">{track.kind}</span>
                {': '}
                {track.clips.length ? c.clipCount(track.clips.length) : c.emptyTrack(track.emptyReason ?? c.noTrackContent)}
              </li>
            ))}
          </ul>
          {timeline?.blockers.length ? (
            <ul className="sb-colMt2">
              {timeline.blockers.map((b) => (
                <li key={b} className="sb-faint11" data-storyboard-blocker>
                  {b}
                </li>
              ))}
            </ul>
          ) : null}
        </section>


        <section className="sb-sectionBorderT">
          <h3 className="sb-label">{c.originsSection}</h3>
          <ul className="sb-colMt1">
            {sb.notes.map((note) => (
              <li key={note} className="sb-body11" data-storyboard-note>
                {note}
              </li>
            ))}
          </ul>
        </section>
      </div>

        <section className="sb-sectionBorderT" data-storyboard-timeline>
          <h3 className="sb-label">{c.timelineSection}</h3>
          <p className="sb-inkMt1">
            {c.totalLength} {String((timeline?.totalMs ?? 0) / 1000)}{c.seconds} ·
            <span data-storyboard-playable={String(timeline?.playable)}>
              {timeline?.playable
                ? c.playable
                : c.notPlayable}
            </span>
          </p>
          {/* §41 的编辑面：一格一镜，宽度就是时长。三种直接操作各有一处实现——
              右边缘 trim/extend、整块 reorder、左上角的转场标记换衔接；
              三者都只在松手时落一个补丁事务，拖动期间库里那一份不动。
              （comment stays zh-only; the rendered surface is fully localized） */}
          <div
            ref={stripRef}
            role="list"
            onClick={locateFromStrip}
            aria-label={c.timelineAria(sb.shots.length)}
            className="sb-timeBar"
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
                  aria-label={c.timelineBlockAria(index + 1, (shownMs / 1000).toFixed(1), cameraLabel(shot.camera, locale), transitionLabel(shot.transition, locale), transitionLabel(shot.transition, locale))}
                  data-timeline-block={shot.id}
                  data-timeline-drop-target={dropTarget ? 'true' : undefined}
                  title={c.timelineBlockTitle(index + 1, (shownMs / 1000).toFixed(1), cameraLabel(shot.camera, locale), transitionLabel(shot.transition, locale))}
                  onPointerDown={(event) => beginReorder(event, shot, index)}
                  onPointerMove={moveReorder}
                  onPointerUp={endReorder}
                  onPointerCancel={endReorder}
                  onDoubleClick={(event) => splitAtClick(event, shot)}
                  className={cn('sb-timeSeg', moving && 'sb-timeSegMoving', dropTarget && 'sb-timeSegDropTarget')}
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
                    <span className="sb-cornerNote">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  ) : null}
                  {px >= 34 ? (
                    <span className="sb-footNote">
                      {(shownMs / 1000).toFixed(1)}s
                    </span>
                  ) : null}
                  {px >= 44 ? (
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => cycleTransition(shot)}
                      aria-label={c.swapTransitionAria(transitionLabel(shot.transition, locale))}
                      title={c.swapTransitionTitle(transitionLabel(shot.transition, locale))}
                      data-timeline-transition={shot.id}
                      className="sb-indexChip"
                    >
                      {transitionLabel(shot.transition, locale)}
                    </button>
                  ) : null}
                  <span
                    role="separator"
                    tabIndex={0}
                    aria-orientation="vertical"
                    aria-label={c.resizeHandleAria(index + 1, SHOT_MS_STEP, SHOT_MS_COARSE_STEP)}
                    aria-valuemin={MIN_SHOT_MS}
                    aria-valuemax={MAX_SHOT_MS}
                    aria-valuenow={shownMs}
                    aria-valuetext={c.ariaValueSeconds((shownMs / 1000).toFixed(1))}
                    data-timeline-trim={shot.id}
                    onPointerDown={(event) => beginTrim(event, shot)}
                    onPointerMove={moveTrim}
                    onPointerUp={() => endTrim(shot)}
                    onPointerCancel={() => endTrim(shot)}
                    onKeyDown={(event) => nudgeTrim(event, shot, index)}
                    // 焦点离开 = 提交（等价于松手）：预览过的长度不能因为 Tab 走开就悄悄消失
                    onBlur={() => endTrim(shot)}
                    className="sb-resizeHandle"
                  />
                </div>
              );
            })}
          </div>
          {drag ? (
            <p className="sb-accent2inkMt1" data-timeline-readout>
              {drag.kind === 'trim'
                ? c.dragPreviewShot(sb.shots.findIndex((candidate) => candidate.id === drag.shotId) + 1, (drag.startMs / 1000).toFixed(1), (drag.previewMs / 1000).toFixed(1))
                : c.dragReorderShot(drag.fromIndex + 1, drag.previewIndex + 1)}
            </p>
          ) : null}
          {/* 读屏那一句：视觉上藏起来，但与上面那行读数说的是同一件事（§90 的键盘路要能听见结果） */}
          <p className="sb-srOnly" role="status" data-timeline-announce>
            {announce}
          </p>
        </section>
    </div>
  );
}
