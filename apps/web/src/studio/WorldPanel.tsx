'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  WORLD_ELEVATION_MAX,
  WORLD_KINDS,
  WORLD_KIND_LABELS,
  WORLD_PLATEAU_LIMIT,
  WORLD_PLATEAU_RADIUS_MAX,
  WORLD_PLATEAU_RADIUS_MIN,
  WORLD_TERRAIN_HEIGHT_MAX,
  addWorldNode,
  countLinksFor,
  linkWorldNodes,
  removeWorldNode,
  setWorldNodeElevation,
  setWorldNodeModelAsset,
  setWorldTerrain,
  setWorldTidePressures,
  updateWorldNode,
  WORLD_TIDE_PRESSURE_KINDS,
  WORLD_TIDE_PRESSURE_LIMIT,
  worldCounts,
  type WorldDocument,
  type WorldKind,
  type WorldPlateau,
  type WorldTidePressure,
  type WorldTidePressureKind,
} from '@nexus/world-model';
import { cn } from '@/lib/cn';
import { patchLore } from '@/lib/worldLore';
import type { Locale } from '@/lib/i18n';
import { chatWithCharacter } from '@/server/ai/client';
import { fillableKinds, formatWorldFillError, parseChronicleReply, parseEchoReply, parseLinkReply, parseWorldFillReply, retrieveWorldContext } from '@/lib/worldFill';
import { rollFate, type FateCard } from '@/lib/worldFate';
import { mergeImportedWorld, parseWorldMarkdown, worldFileName, worldToMarkdown } from '@/lib/worldExport';
import { formatWorldStats, worldStats } from '@/lib/worldStats';
import { filterWorldNodes } from '@/lib/worldFilter';
import { sortWorldNodes, type WorldSortMode } from '@/lib/worldSort';
import { auditSuggestion, auditWorld, formatWorldAudit } from '@/lib/worldAudit';
import { saveBlob } from '@/lib/download';
import { useStudioReady } from './store';
import { useWorld, worldStore } from './worldStore';
import { WORLD_KIND_LABELS_EN } from '@nexus/world-model';

const COPY = {
  zh: {
    state: { idle: '', loading: '读取中…', dirty: '未保存', saving: '保存中…', saved: '已保存', error: '保存失败' } as Record<string, string>,
    world: '世界',
    readWorld: '读取世界…',
    unreadableBody: (reason: string) =>
      `读不出库里那份世界：${reason}。下面这个按钮会写一份新的模板骨架进去，覆盖掉读不出来的那份——先确认不是契约漂移再点。`,
    emptyBody:
      '这个项目还没有世界。可以先建一份模板骨架：九类内容各留一个空条目，你自己往里填。' +
      'AI 生成世界（§44 的「Create a dark fantasy world」）需要真实模型，provider 未接入前这里不做假生成。',
    createSkeleton: '创建世界骨架（模板）',
    defaultName: '未命名世界',
    nameAria: '世界名称',
    summaryPlaceholder: '一句话说明这是个什么样的世界',
    summaryAria: '世界概述',
    aiGen: 'AI 生成概述',
    aiGenBusy: '生成中…',
    aiFill: 'AI 填充这一节',
    aiFillBusy: '填充中…',
    aiFillTitle: (kind: string) => `真调用一次 provider，给「${kind}」补 1–2 条可编辑的条目：只依据这个世界的概述与已有条目，不编数字、不写模型话术；结果逐条写库（世界编辑不进画布的撤销栈，Ctrl+Z 只管设计文档）。没配 provider 就如实报错，不假生成。（这四个 AI 按钮共用每小时 10 次额度，超了会告诉你要等多久。）`,
    aiFillDone: (kind: string, n: number) => `已给「${kind}」补 ${n} 条，改完失焦即写库。`,
    aiFillNone: '模型没有返回可用条目——可能是格式不对或 provider 不可用；没有写入任何东西。',
    aiFillAll: 'AI 补全空节',
    aiFillAllBusy: '补全中…',
    aiFillAllTitle: '一次点击最多补 3 个还没有条目的节（九类里选），每节都是真调用；已有内容的节不动。想补完就再点一次。token 按实际调用计，不偷偷多打。（四个 AI 按钮共用每小时 10 次的额度，超了界面会告诉你要等多久。）',
    filterAria: '在世界条目里按标题或正文筛选',
    filterPlaceholder: '筛选题名/正文/纪元/回声…',
    filterEmpty: '没有条目匹配这个关键词——清空筛选框看全部。',
    sort: (m: WorldSortMode) => `排序：${m === 'insertion' ? '原序' : m === 'era' ? '纪元' : '标题'}（点一下切换）`,
    sortTitle: '只改变这一栏的显示顺序，不改文档本体；原序=写入顺序，纪元=按作者写的纪元与序号，标题=按名称。',
    exportMd: '导出 Markdown',
    exportMdTitle: '把这份世界按九类固定顺序导成 .md：节点正文、纪元/序号、记忆回声都在里面，空类也留标题。纯本地投影，不调模型、不联网。',
    importMd: '导入 Markdown',
    importMdTitle: '读回本模块导出的 .md，把有正文的条目追加到当前世界（不覆盖、不去重）；纪元/序号/记忆回声一起带回来。格式不对或没有合法条目会明确报错，不会编内容。纯本地解析，不调模型、不联网。',
    importDone: (added: number, skipped: number) => `已导入 ${added} 条${skipped ? `，跳过 ${skipped} 条不认识的类别` : ''}。只追加、没动原有条目。`,
    importFail: '这个文件不是本模块导出的 Markdown（缺 # 世界名或没有任何有正文的条目）——什么都没写进去。',
    audit: '世界体检',
    auditTitle: '纯本地只读检查：量出空正文、重名、没有关系的孤儿条目、指向已删除条目的断链，并给一条可执行的下一步。不写库、不调模型。',
    fate: '掷命运骰',
    fateTitle: '不调模型、不写库：从这个世界已写的条目里抽两条，按确定性的句式重组成一张事件卡。同一个数字出现同一张卡，换一个数字就换一张——无穷来自你写下的细节组合，不是凭空编造。',
    fateEmpty: '至少要有两条写了正文的条目才能掷骰——先用填充或续写补一点内容。',
    fateKeep: '把这张卡写进世界',
    fateDone: (card: { title: string; body: string }) => `命运骰 · ${card.title}：${card.body}`,
    fateKept: '这张事件卡已写进世界的「故事」类；正文里标了 seed 与来源，不冒充模型新写的史实。',
    aiChronicle: 'AI 续写编年',
    aiChronicleBusy: '续写中…',
    aiChronicleTitle: '真调用一次 provider，给编年册补一条故事：只从这个世界已有的纪元里挑一个，写一件具体发生过的事与它留下的痕迹。模型不许自造纪元或数字；新条目直接带纪元标签进编年页。（这四个 AI 按钮共用每小时 10 次额度，超了会告诉你要等多久。）',
    aiChronicleDone: (era: string, title: string) => `已续写「${era || '未标纪元'}」·《${title}》，编年页可看。`,
    aiEcho: 'AI 写回声',
    aiEchoBusy: '写回声中…',
    aiEchoTitle: (t: string) => `真调用一次模型，给「${t}」写一段 ≤240 字的记忆回声：声音、味道、触感、光线里的一瞬，不是梗概、不评价。只依据这条条目已有的正文；没有可写的东西就照实说。（这四个 AI 按钮共用每小时 10 次额度，超了会告诉你要等多久。）`,
    aiEchoDone: (t: string) => `已给「${t}」写下一段记忆回声。`,
    aiLink: 'AI 牵线',
    aiLinkBusy: '牵线中…',
    aiLinkTitle: (t: string) => `真调用一次模型，从这个世界已有的条目里给「${t}」找一条真有关系的目标并写出关系名；自造的条目 id 会被丢掉，重复的边不会连两次。（这四个 AI 按钮共用每小时 10 次额度，超了会告诉你要等多久。）`,
    aiLinkDone: (t: string, label: string) => `已从「${t}」牵出一条「${label}」关系，星图可见。`,
    tidalTerrainHeading: '地形（可走的圆台与坡）',
    mesaOption: '台面（硬边）',
    coneOption: '坡（线性降到 0）',
    tideHeading: '潮汐扰模（作者声明）',
    tideKindLabels: { drought: '干亢', progeny: '繁衍', inflation: '通胀', erosion: '寂蚀', murmur: '潮声' } as Record<WorldTidePressureKind, string>,
    tideDeclared: (n: number, limit: number) => ` 已声明 ${n} / ${limit} 条。`,
    tideNone: ' 还没有声明——写了一条，潮汐页就会亮。',
    tideLabelPlaceholder: '孕育季',
    tideLabelAria: '扰模名字',
    tideKindAria: '扰模 kind',
    tideSeverityAria: '扰模 severity',
    tideNameRequired: '扰模要有一个名字——给它取 1–40 字。',
    eraPlaceholder: '灰灯纪',
    memoryEchoPlaceholder: '记忆回声：那一刻的感官（声音 / 味道 / 触感 / 光线）—— 不是剧情，是刻痕',
    severity1: '1 · 要闻',
    severity2: '2 · 季节',
    severity3: '3 · 纪元',
    newKindAria: '新增条目的类型',
    placeholderGeometryNoAssets: '类别几何体（本项目还没有 model 资产）',
    placeholderGeometryFallback: '类别几何体（占位）',
    unnamed: '未命名世界',
    titleAria: (t: string) => `条目标题 ${t}`,
    deleteEntryTitle: (n: number) => (n ? `删除这条（会一并去掉 ${n} 条关系）` : '删除这条'),
    deleteAriaEntry: (t: string) => `删除 ${t}`,
    bodyPlaceholder: '还什么都没写',
    bodyAria: (t: string) => `正文 ${t}`,
    eraLabel: '纪元',
    eraAria: (t: string) => `纪元 ${t}`,
    orderLabel: '序',
    orderAria: (t: string) => `编年序号 ${t}`,
    orderPlaceholder: '0',
    orderOptionalHint: '0 最早，缺省按 updatedAt 排',
    memoryEchoAria: (t: string) => `记忆回声 ${t}`,
    elevationLabel: '高度',
    elevationAria: (t: string) => `高度 ${t}`,
    elevationHint: (max: number) => `0–${max}；3D 世界里条目会浮在这个高度上（先在世界图上摆过位置才能写）`,
    modelLabel: '3D 模型',
    modelAria: (t: string) => `3D 模型 ${t}`,
    modelHint: '在 3D 世界里渲染哪个模型；加载不出来时退回类别几何体，不会留空白',
    saveToLibrary: '保存到库',
    addOne: '加一条',
    editsNote: '改完即写库（失焦或点删除都会保存）。世界编辑不进画布的撤销栈：Ctrl+Z 只管设计文档。',
    missingKinds: (names: string) => ` ${names} 这一类还没有条目，可以用上面的下拉补。`,
    newEntryLabel: (kind: string) => `${kind} · 新条目`,
    terrainIntro: (max: number, rmin: number, rmax: number, limit: number, count: number) =>
      `站在地形特征上就是站在它的高度上（相机与点击地面都读同一份高度）。剖面两种：台面（硬边）与坡（台心到边缘线性降到 0，可走）。没画地形的世界脚下是平的。高度 0–${max}，半径 ${rmin}–${rmax}；重叠的地形取最高的那个。当前 ${count}/${limit} 个。`,
    plateauRadius: '半径',
    plateauHeight: '高度',
    plateauProfile: '剖面',
    addPlateau: '加上去',
    clearTerrain: '收掉地形',
    plateauConeSuffix: ' 坡',
    plateauRemoveAria: (id: string) => `删除圆台 ${id}`,
    tideIntro:
      '声明一条，潮汐页（/world/项目/tide）就会按它算出真压住了多少落笔节点。severity 只是着墨（1 要闻 / 2 季节 / 3 纪元），不参与计数。',
    tideMatchKind: (entry: string, label: string) => `${entry}（${label}）`,
    tideNameField: '名字',
    tideAdd: '加上去',
    tideClearAll: '收掉全部',
    tideRemoveAria: (label: string) => `删除扰模 ${label}`,
  },
  en: {
    state: { idle: '', loading: 'Loading…', dirty: 'Unsaved', saving: 'Saving…', saved: 'Saved', error: 'Save failed' } as Record<string, string>,
    world: 'World',
    readWorld: 'Reading world…',
    unreadableBody: (reason: string) =>
      `The stored world cannot be read: ${reason}. The button below writes a new template skeleton over the unreadable one — confirm it is not a contract drift first.`,
    emptyBody:
      'This project has no world yet. Start with a template skeleton: nine kinds, one empty entry each, yours to fill in. ' +
      'AI-generating a world (§44’s “Create a dark fantasy world”) needs a real model — until a provider is wired, no fake generation ships.',
    createSkeleton: 'Create world skeleton (template)',
    defaultName: 'Untitled world',
    nameAria: 'World name',
    summaryPlaceholder: 'One line: what this world is',
    summaryAria: 'World summary',
    aiGen: 'AI generate summary',
    aiGenBusy: 'Generating…',
    aiFill: 'AI fill this section',
    aiFillBusy: 'Filling…',
    aiFillTitle: (kind: string) => `One real provider call adds 1–2 editable entries to ${kind}, grounded only in this world's summary and existing entries — no invented numbers, no model chatter. Each entry is written as its own save. Without a provider the error is shown honestly; nothing is faked. (These four AI buttons share a 10-per-hour quota; if you hit it the UI tells you how long to wait.)`,
    aiFillDone: (kind: string, n: number) => `Added ${n} entries to ${kind}; each saves when you leave the field.`,
    aiFillNone: 'The model returned no usable entries — wrong shape or provider unavailable. Nothing was written.',
    aiFillAll: 'AI fill empties',
    aiFillAllBusy: 'Filling…',
    aiFillAllTitle: 'One click fills at most 3 of the sections that still have no entries (out of nine); each is a real provider call. Sections with content are untouched. Click again for the rest — token cost is what is actually called, never silently more. (All four AI buttons share a 10-per-hour quota; the UI tells you how long to wait if you hit it.)',
    filterAria: 'Filter world entries by title or body',
    filterPlaceholder: 'Filter titles / bodies / eras / echoes…',
    filterEmpty: 'No entry matches that keyword — clear the filter to see everything.',
    sort: (m: WorldSortMode) => `Sort: ${m === 'insertion' ? 'insertion' : m === 'era' ? 'era' : 'title'} (click to cycle)`,
    sortTitle: 'Changes only this list view, never the document: insertion = write order, era = the author’s era and order fields, title = name.',
    exportMd: 'Export Markdown',
    exportMdTitle: 'Export this world as a .md in the fixed nine-section order: bodies, era/order and memory echoes are all included, and empty sections keep their headings. Pure local projection — no model call, no network.',
    importMd: 'Import Markdown',
    importMdTitle: 'Read back a .md exported by this module and append entries with bodies to the current world (no overwrite, no dedup); era/order/memory echoes come along. Wrong format or no valid entry reports an error and writes nothing. Pure local parse — no model call, no network.',
    importDone: (added: number, skipped: number) => `Imported ${added} entr${added === 1 ? 'y' : 'ies'}${skipped ? `, skipped ${skipped} unknown section${skipped === 1 ? '' : 's'}` : ''}. Append-only — nothing existing was touched.`,
    importFail: 'This file is not a Markdown exported by this module (no # world name, or no entry with a body) — nothing was written.',
    audit: 'World checkup',
    auditTitle: 'Read-only local check: counts empty bodies, duplicate titles, orphan nodes with no relations and links pointing at deleted entries, then gives one actionable next step. No database write, no model call.',
    fate: 'Roll fate',
    fateTitle: 'No model call, no database write: pick two entries you already wrote and recombine them into an event card with a deterministic frame. Same number, same card; a different number gives another — the endlessness comes from your own details, not invented ones.',
    fateEmpty: 'Roll needs at least two entries with body text — fill or continue the chronicle first.',
    fateKeep: 'Keep this card in the world',
    fateDone: (card: { title: string; body: string }) => `Fate · ${card.title}: ${card.body}`,
    fateKept: 'This event card is now a Story entry; its body names the seed and sources — it is not passed off as a freshly written fact.',
    aiChronicle: 'AI write chronicle',
    aiChronicleBusy: 'Writing…',
    aiChronicleTitle: 'One real provider call adds one story to the chronicle: it must pick an era that already exists in this world and write something that happened, what it cost, and what remains. No invented eras or figures; the new entry carries its era tag straight into the chronicle page. (These four AI buttons share a 10-per-hour quota; if you hit it the UI tells you how long to wait.)',
    aiChronicleDone: (era: string, title: string) => `Wrote ${era || 'untagged'} · ${title} — visible on the chronicle page.`,
    aiEcho: 'AI write echo',
    aiEchoBusy: 'Writing echo…',
    aiEchoTitle: (t: string) => `One real model call writes a ≤240-char memory echo for ${t}: one instant of sound, taste, touch or light — never a plot summary or a verdict. Grounded only in this entry's own body; if there is nothing to draw from, the UI says so. (These four AI buttons share a 10-per-hour quota; if you hit it the UI tells you how long to wait.)`,
    aiEchoDone: (t: string) => `Wrote a memory echo for ${t}.`,
    aiLink: 'AI link',
    aiLinkBusy: 'Linking…',
    aiLinkTitle: (t: string) => `One real model call finds one genuinely related entry for ${t} among this world's own entries and names the relation; invented ids are dropped and duplicate edges are never written twice. (These four AI buttons share a 10-per-hour quota; if you hit it the UI tells you how long to wait.)`,
    aiLinkDone: (t: string, label: string) => `Linked ${t} with "${label}" — visible on the star graph.`,
eraPlaceholder: 'Grey Lantern Era',
    memoryEchoPlaceholder: 'Memory echo: the sensory trace of that moment (sound / taste / touch / light) — not plot, a scar',
tidalTerrainHeading: 'Terrain (walkable plateaus and cones)',
    mesaOption: 'Mesa (hard edge)',
    coneOption: 'Cone (linear to 0)',
    tideHeading: 'Tide pressures (author-declared)',
    tideKindLabels: { drought: 'Drought', progeny: 'Progeny', inflation: 'Inflation', erosion: 'Erosion', murmur: 'Murmur' } as Record<WorldTidePressureKind, string>,
    tideDeclared: (n: number, limit: number) => ` ${n} / ${limit} declared.`,
    tideNone: ' None declared yet — write one and the tide page lights up.',
    tideLabelPlaceholder: 'Breeding season',
    tideLabelAria: 'Pressure name',
    tideKindAria: 'Pressure kind',
    tideSeverityAria: 'Pressure severity',
    tideNameRequired: 'A pressure needs a name — give it 1–40 chars.',
    severity1: '1 · Major',
    severity2: '2 · Season',
    severity3: '3 · Era',
    newKindAria: 'Kind of the new entry',
    placeholderGeometryNoAssets: 'Category geometry (this project has no model assets yet)',
    placeholderGeometryFallback: 'Category geometry (placeholder)',
    unnamed: 'Untitled world',
    titleAria: (t: string) => `Entry title ${t}`,
    deleteEntryTitle: (n: number) => (n ? `Delete this entry (removes ${n} relationship(s) too)` : 'Delete this entry'),
    deleteAriaEntry: (t: string) => `Delete ${t}`,
    bodyPlaceholder: 'Nothing written yet',
    bodyAria: (t: string) => `Body ${t}`,
    eraLabel: 'Era',
    eraAria: (t: string) => `Era ${t}`,
    orderLabel: 'Order',
    orderAria: (t: string) => `Chronicle order ${t}`,
    orderPlaceholder: '0',
    orderOptionalHint: '0 = earliest; absent falls back to updatedAt',
    memoryEchoAria: (t: string) => `Memory echo ${t}`,
    elevationLabel: 'Elevation',
    elevationAria: (t: string) => `Elevation ${t}`,
    elevationHint: (max: number) => `0–${max}; in 3D the entry floats at this height (place one in the world graph first)`,
    modelLabel: '3D model',
    modelAria: (t: string) => `3D model ${t}`,
    modelHint: 'Which model to render in the 3D world; falls back to category geometry if load fails — never a blank',
    saveToLibrary: 'Save to library',
    addOne: 'Add one',
    editsNote: 'Edits write to the library immediately (blur or delete saves). World edits stay out of the canvas undo stack: Ctrl+Z only covers the design document.',
    missingKinds: (names: string) => ` No entries of these kinds yet: ${names} — add them from the dropdown above.`,
    newEntryLabel: (kind: string) => `${kind} · new entry`,
    terrainIntro: (max: number, rmin: number, rmax: number, limit: number, count: number) =>
      `Standing on a terrain feature means standing on its height (the camera and click-to-ground both read the same number). Two profiles: mesa (hard edge) and cone (linear falloff from center to rim, walkable). A world with no terrain is flat. Heights 0–${max}, radius ${rmin}–${rmax}; overlapping terrain keeps the highest. Current ${count}/${limit}.`,
    plateauRadius: 'Radius',
    plateauHeight: 'Height',
    plateauProfile: 'Profile',
    addPlateau: 'Add plateau',
    clearTerrain: 'Clear terrain',
    plateauConeSuffix: ' cone',
    plateauRemoveAria: (id: string) => `Delete plateau ${id}`,
    tideIntro:
      'Declare one and the tide page (/world/<id>/tide) will compute how many authored nodes it actually weighs on. Severity is just tint (1 major / 2 season / 3 era); it never enters the counts.',
    tideMatchKind: (entry: string, label: string) => `${entry} (${label})`,
    tideNameField: 'Name',
    tideAdd: 'Add pressure',
    tideClearAll: 'Clear all',
    tideRemoveAria: (label: string) => `Delete pressure ${label}`,
  },
} as const;

type WorldCopy = (typeof COPY)[Locale];

const kindLabel = (kind: WorldKind, locale: Locale): string =>
  locale === 'en' ? WORLD_KIND_LABELS_EN[kind] : WORLD_KIND_LABELS[kind];

/**
 * §44 World Builder 的填写界面：把世界文档摊开成可编辑的九类。
 * 图视图（§45，`WorldGraphView`）读的是同一个 store，两处不会各存一份世界。
 *
 * 两件事刻意没做，界面上也写着：
 * - AI 生成世界内容要真 provider，没接之前只有**模板骨架**（九类各一条空条目、正文留空），
 *   往模板里塞预设世界观就是假生成（§159）；
 * - 世界编辑不进画布的 Command 撤销栈（§150 目前只覆盖设计文档），所以每次写库都对应一个明确动作。
 */

export function WorldPanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const studio = useStudioReady();
  const snapshot = useWorld();
  const [newKind, setNewKind] = useState<WorldKind>('lore');
  const world = snapshot.world;

  useEffect(() => {
    worldStore.ensure(studio.projectId);
  }, [studio.projectId]);

  // §34 的 model 类资产名册：给每个条目挑 3D 世界里的模型。
  // 只列本项目 kind='model' 的资产——"这个 id 是不是本项目的"在这里保证，
  // 模型包里那个 setter 只管形状（世界文档不认识资产表，§16）。
  const [modelAssets, setModelAssets] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${studio.projectId}/assets`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((body: { assets?: { id: string; name: string; kind: string }[] }) => {
        if (cancelled) return;
        setModelAssets((body.assets ?? []).filter((a) => a.kind === 'model').map((a) => ({ id: a.id, name: a.name })));
      })
      .catch(() => {
        if (!cancelled) setModelAssets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [studio.projectId]);

  const counts = useMemo(() => (world ? worldCounts(world) : null), [world]);

  /** 限流回执里服务端已给 retryAfterMs，界面要说清还要等多久，别只说"稍后"。 */
  const failReason = (body: { message?: string; retryAfterMs?: number } | null, status: number, zh: string, en: string): string => {
    return formatWorldFillError(`${locale === 'zh' ? zh : en}${body?.message ?? `HTTP ${status}`}`, body?.retryAfterMs, locale);
  };

  // AI 生成概述：草稿（summary，可为空）+ 计数投喂给真 provider，结果写回 summary（setLocal + commit，落库）。
  // 任何失败原样展示，不吞；没有 provider 时 chatWithCharacter 抛/报错，也如实。
  const [aiGen, setAiGen] = useState(false);
  const [aiGenError, setAiGenError] = useState('');
  const generateWorldSummary = async () => {
    const doc = world;
    if (!doc) return;
    setAiGen(true);
    setAiGenError('');
    try {
      const res = await chatWithCharacter({
        requestId: `world-summary-${Date.now()}`,
        system: locale === 'zh'
          ? '你是世界编纂者。给一份给定世界的概述草稿做打磨：给出一段史诗感开篇（2–5 句话），描绘这个世界的整体基调与值得引以为傲的细节；读起来像真世界的介绍，不要模型语言，不要指代项目或人名，不要编造数字。'
          : 'You are a world archivist. Polish a brief world introduction: an epic opening line or two (2–5 sentences), capturing the world’s overall tone and a standout feature — evocative, not meta, no invented names or numbers.',
        user: `世界名称：${doc.name}\n概述字段（可为空）：${(doc.summary || '').trim() || '(empty)'}\n已有条目计数：${counts ? JSON.stringify(counts) : ''}`,
        modelClass: 'balanced',
      });
      if (res.ok) {
        const text = res.response.text.trim();
        if (text) {
          worldStore.setLocal({ ...doc, summary: text });
          void worldStore.commit();
        } else {
          setAiGenError(locale === 'zh' ? 'AI 返回了空概述——请重试' : 'AI returned an empty summary — retry');
        }
      } else {
        setAiGenError(locale === 'zh' ? `AI 调用未成功：${res.error?.message ?? 'provider 不可用'}` : `AI call failed: ${res.error?.message ?? 'provider unavailable'}`);
      }
    } catch (e) {
      setAiGenError(String((e as Error)?.message ?? e).slice(0, 200));
    } finally {
      setAiGen(false);
    }
  };

  // §44 填料：按当前下拉选中的那一节补 1–2 条。真 provider 调用；解析不出合法条目就一条不写，
  // 不能把模型话术当设定塞进用户的世界（§159）。
  const [aiFillBusy, setAiFillBusy] = useState(false);
  const [aiFillNote, setAiFillNote] = useState('');
  const fillSection = async (kindOverride?: WorldKind): Promise<boolean> => {
    // 批量循环里闭包捕获的 `world` 是点击那一刻的旧文档，三次写入会互相覆盖；
    // 每次都从 store 取最新快照，前一轮补的条目才留得下来。
    const doc = worldStore.getSnapshot().world;
    if (!doc || aiFillBusy) return false;
    const kind = kindOverride ?? newKind;
    setAiFillBusy(true);
    setAiFillNote('');
    try {
      const existing = doc.nodes.filter((n) => n.kind === kind).map((n) => n.title);
      // 走 web 自己的 API 路由：浏览器直接 import server/ai/client 会读不到 process.env，
      // 而且跨域打 ai-service 会被 CORS 挡成 TypeError（已经踩过一次）。
      const res = await fetch('/api/ai/world-fill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locale,
          worldName: doc.name,
          summary: doc.summary || '',
          kind: kindLabel(kind, locale),
          existingTitles: existing,
          // RAG-lite：从已有条目里取最相关的 3 段正文作证据，让新条目长在世界细节上
          context: retrieveWorldContext(doc.nodes, `${doc.summary || ''} ${kindLabel(kind, locale)}`, 3),
        }),
      });
      const body = (await res.json().catch(() => null)) as { text?: string; message?: string; retryAfterMs?: number } | null;
      if (!res.ok || typeof body?.text !== 'string') {
        setAiFillNote(failReason(body, res.status, 'AI 调用未成功：', 'AI call failed: '));
        return false;
      }
      const entries = parseWorldFillReply(body.text);
      if (entries.length === 0) {
        setAiFillNote(c.aiFillNone);
        return false;
      }
      let next = doc;
      for (const entry of entries) next = addWorldNode(next, { kind, title: entry.title, body: entry.body });
      worldStore.setLocal(next);
      void worldStore.commit();
      setAiFillNote(c.aiFillDone(kindLabel(kind, locale), entries.length));
    } catch (e) {
      setAiFillNote(String((e as Error)?.message ?? e).slice(0, 200));
      return false;
    } finally {
      setAiFillBusy(false);
    }
    return true;
  };

  // §44 一键补全空节：九类里还空着的节，每次最多补 3 节——一次点击=最多 3 次真调用，
  // 界面上把 token 代价说清楚；不静默打满九次，也不替作者写已有节。
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNote, setBulkNote] = useState('');
  const fillAllEmpty = async () => {
    // 骨架九类各有一条空壳节点，光看 counts 会误判成"都已有内容"；按正文是否为空来判空节。
    const nodes = world?.nodes ?? [];
    const empty = WORLD_KINDS.filter((k) => !nodes.some((n) => n.kind === k && (n.body || '').trim().length > 0));
    if (empty.length === 0) {
      setBulkNote(locale === 'zh' ? '九类都已经有正文了，没有空节要补。' : 'All nine sections already have content — nothing to fill.');
      return;
    }
    setBulkBusy(true);
    setBulkNote('');
    const todo = empty.slice(0, 3);
    let done = 0;
    for (const k of todo) {
      if (await fillSection(k)) done += 1;
    }
    setBulkNote(locale === 'zh'
      ? `已补 ${done}/${empty.length} 个空节（一次最多 3 节，省 token；还可再点继续）。`
      : `Filled ${done}/${empty.length} empty sections (max 3 per click to save tokens; click again for the rest).`);
    setBulkBusy(false);
  };

  const exportMarkdown = () => {
    const doc = worldStore.getSnapshot().world;
    if (!doc) return;
    saveBlob(worldFileName(doc), new Blob([worldToMarkdown(doc, locale)], { type: 'text/markdown;charset=utf-8' }));
  };

  const importFileRef = useRef<HTMLInputElement>(null);
  const [importNote, setImportNote] = useState('');
  const importMarkdown = async (file: File | undefined) => {
    if (!file) return;
    const doc = worldStore.getSnapshot().world;
    if (!doc) return;
    const text = await file.text();
    const parsed = parseWorldMarkdown(text);
    if (!parsed) {
      setImportNote(c.importFail);
      return;
    }
    const { document: merged, added, skipped } = mergeImportedWorld(doc, parsed);
    edit(merged, true);
    setImportNote(c.importDone(added, skipped));
  };

  const [auditNote, setAuditNote] = useState('');
  const runAudit = () => {
    const doc = worldStore.getSnapshot().world;
    if (!doc) return;
    const a = auditWorld(doc);
    setAuditNote(`${formatWorldAudit(a, locale)}。${auditSuggestion(a, locale)}`);
  };

  // §44 衍生玩法「命运骰」：纯确定性重组已有条目，零 provider、零写库；seed 递增保证每次换新卡。
  const [fateSeed, setFateSeed] = useState(1);
  const [fateNote, setFateNote] = useState('');
  const [fateCard, setFateCard] = useState<FateCard | null>(null);
  const rollFateCard = () => {
    const doc = worldStore.getSnapshot().world;
    const card = doc ? rollFate(doc.nodes, fateSeed) : null;
    if (!card) {
      setFateNote(c.fateEmpty);
      return;
    }
    setFateSeed((s) => s + 1);
    setFateCard(card);
    setFateNote(c.fateDone(card));
  };
  const keepFateCard = () => {
    const doc = worldStore.getSnapshot().world;
    if (!doc || !fateCard) return;
    // 收进编年是确定性重组、不是模型生成：在卡片正文里点明来源与 seed，不冒充新史实。
    const body = `${fateCard.body}\n（命运骰 seed ${fateCard.seed} · 由 ${fateCard.sourceIds.length} 条已有条目重组成，非模型生成）`;
    const next = addWorldNode(doc, { kind: 'story', title: fateCard.title, body });
    worldStore.setLocal(next);
    void worldStore.commit();
    setFateNote(c.fateKept);
    setFateCard(null);
  };

  // §44 编年续写：模型只在作者已有的纪元字面下补一条 story，不替作者发明历史分期。
  const [chronicleBusy, setChronicleBusy] = useState(false);
  const [chronicleNote, setChronicleNote] = useState('');
  const writeChronicle = async () => {
    const doc = world;
    if (!doc || chronicleBusy) return;
    setChronicleBusy(true);
    setChronicleNote('');
    try {
      const eras = [...new Set(doc.nodes.map((n) => n.lore?.era?.trim()).filter((e): e is string => Boolean(e)))];
      const storyNodes = doc.nodes.filter((n) => n.kind === 'story' || n.kind === 'history');
      const res = await fetch('/api/ai/world-fill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locale,
          worldName: doc.name,
          summary: doc.summary || '',
          kind: kindLabel('story', locale),
          existingTitles: storyNodes.slice(-30).map((n) => n.title),
          eras,
          chronicle: true,
        }),
      });
      const body = (await res.json().catch(() => null)) as { text?: string; message?: string; retryAfterMs?: number } | null;
      if (!res.ok || typeof body?.text !== 'string') {
        setChronicleNote(failReason(body, res.status, '续写未成功：', 'Write failed: '));
        return;
      }
      const entry = parseChronicleReply(body.text, eras);
      if (!entry) {
        setChronicleNote(c.aiFillNone);
        return;
      }
      let next = addWorldNode(doc, { kind: 'story', title: entry.title, body: entry.body });
      const added = next.nodes[next.nodes.length - 1]!;
      const order = storyNodes.filter((n) => n.lore?.era === entry.era).reduce((m, n) => Math.max(m, n.lore?.order ?? 0), -1) + 1;
      next = updateWorldNode(next, added.id, { lore: entry.era ? { era: entry.era, order } : { order } });
      worldStore.setLocal(next);
      void worldStore.commit();
      setChronicleNote(c.aiChronicleDone(entry.era, entry.title));
    } catch (e) {
      setChronicleNote(String((e as Error)?.message ?? e).slice(0, 200));
    } finally {
      setChronicleBusy(false);
    }
  };

  // §44 记忆回声：逐条写 ≤240 字的感官刻痕，只依据该条目正文；lore 其余字段原样保留。
  const [echoBusyFor, setEchoBusyFor] = useState('');
  const [echoNote, setEchoNote] = useState('');
  const writeEcho = async (node: { id: string; title: string; body: string }) => {
    const doc = world;
    if (!doc || echoBusyFor) return;
    setEchoBusyFor(node.id);
    setEchoNote('');
    try {
      const res = await fetch('/api/ai/world-fill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locale, worldName: doc.name, summary: doc.summary || '',
          kind: kindLabel('lore', locale), focusTitle: node.title, focusBody: node.body, echo: true,
        }),
      });
      const body = (await res.json().catch(() => null)) as { text?: string; message?: string; retryAfterMs?: number } | null;
      if (!res.ok || typeof body?.text !== 'string') {
        setEchoNote(failReason(body, res.status, '写回声未成功：', 'Echo failed: '));
        return;
      }
      const memory = parseEchoReply(body.text);
      if (!memory) {
        setEchoNote(c.aiFillNone);
        return;
      }
      const current = doc.nodes.find((n) => n.id === node.id)!;
      worldStore.setLocal(updateWorldNode(doc, node.id, { lore: { ...(current.lore ?? {}), memory } }));
      void worldStore.commit();
      setEchoNote(c.aiEchoDone(node.title));
    } catch (e) {
      setEchoNote(String((e as Error)?.message ?? e).slice(0, 200));
    } finally {
      setEchoBusyFor('');
    }
  };

  // §45 星图牵线：从已有条目里挑目标，模型不许自造端点；重复边由 linkWorldNodes 挡掉。
  const [linkBusyFor, setLinkBusyFor] = useState('');
  const [linkNote, setLinkNote] = useState('');
  const linkFrom = async (node: { id: string; title: string; body: string }) => {
    const doc = world;
    if (!doc || linkBusyFor) return;
    setLinkBusyFor(node.id);
    setLinkNote('');
    try {
      const candidates = doc.nodes
        .filter((n) => n.id !== node.id)
        .slice(0, 24)
        .map((n) => ({ id: n.id, title: n.title, body: (n.body || '').slice(0, 400) }));
      if (candidates.length === 0) {
        setLinkNote(locale === 'zh' ? '这个世界还没有别的条目可以连——先加一条再来。' : 'No other entries to link yet — add one first.');
        return;
      }
      // 空壳条目之间没有任何可依据的正文，让模型猜就是编关系；先明确挡住并说清下一步。
      if (candidates.filter((x) => x.body).length < 1) {
        setLinkNote(locale === 'zh' ? '候选条目还没有正文——先写点内容再牵线，免得模型凭标题编关系。' : 'Candidate entries have no bodies yet — write some content first so the model is not guessing from titles.');
        return;
      }
      const res = await fetch('/api/ai/world-fill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locale, worldName: doc.name, summary: doc.summary || '',
          kind: kindLabel('lore', locale), focusTitle: node.title, focusBody: node.body,
          link: true, candidates,
        }),
      });
      const body = (await res.json().catch(() => null)) as { text?: string; message?: string; retryAfterMs?: number } | null;
      if (!res.ok || typeof body?.text !== 'string') {
        setLinkNote(failReason(body, res.status, '牵线未成功：', 'Link failed: '));
        return;
      }
      const picked = parseLinkReply(body.text, candidates.map((c) => c.id));
      if (!picked) {
        setLinkNote(c.aiFillNone);
        return;
      }
      const result = linkWorldNodes(doc, node.id, picked.toId, picked.label);
      if (result.reason) {
        setLinkNote(result.reason);
        return;
      }
      worldStore.setLocal(result.document);
      void worldStore.commit();
      const target = candidates.find((c) => c.id === picked.toId)?.title ?? picked.toId;
      setLinkNote(c.aiLinkDone(target, picked.label));
    } catch (e) {
      setLinkNote(String((e as Error)?.message ?? e).slice(0, 200));
    } finally {
      setLinkBusyFor('');
    }
  };

  if (!world) {
    return (
      <div className="wd-scrollPad" data-world-panel>
        <h2 className="wd-label">{c.world}</h2>
        <p className="wd-body12" data-world-empty>
          {snapshot.saveState === 'loading'
            ? c.readWorld
            : snapshot.error
              ? c.unreadableBody(snapshot.error)
              : c.emptyBody}
        </p>
        {snapshot.error ? (
          <p className="wd-danger11" data-world-error>
            {snapshot.error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={snapshot.saveState === 'saving'}
          onClick={() => void worldStore.createSkeleton(studio.document?.name ?? c.defaultName)}
          data-world-create
          className="wd-selfStart wd-accentBtn wd-dis50"
        >
          {c.createSkeleton}
        </button>
      </div>
    );
  }

  const edit = (next: WorldDocument, save = false) => {
    worldStore.setLocal(next);
    if (save) void worldStore.commit();
  };

  const [nodeFilter, setNodeFilter] = useState('');
  const [sortMode, setSortMode] = useState<WorldSortMode>('insertion');
  const SORT_CYCLE: readonly WorldSortMode[] = ['insertion', 'era', 'title'];
  const cycleSort = () => setSortMode((m) => SORT_CYCLE[(SORT_CYCLE.indexOf(m) + 1) % SORT_CYCLE.length]!);
  const visibleNodes = sortWorldNodes(filterWorldNodes(world.nodes, nodeFilter), sortMode);
  const visibleCounts = visibleNodes.reduce<Record<string, number>>((acc, n) => {
    acc[n.kind] = (acc[n.kind] ?? 0) + 1;
    return acc;
  }, {});
  const groups = WORLD_KINDS.filter((kind) => visibleCounts[kind]);

  return (
    <div className="wd-rootCol" data-world-panel>
      <header className="wd-headBordered">
        <div className="wd-row2">
          <h2 className="wd-label">{c.world}</h2>
          <span
            className={cn('wd-monoFaintEnd', snapshot.saveState === 'error' && 'wd-dangerText')}
            data-world-state
          >
            {c.state[snapshot.saveState] ?? ''}
          </span>
          <span data-world-pending={snapshot.saveState === 'saving' || snapshot.saveState === 'dirty' ? 'true' : 'false'} />
        </div>
        <input
          value={world.name}
          onChange={(e) => edit({ ...world, name: e.target.value })}
          onBlur={() => edit({ ...world, name: world.name.trim() || c.unnamed }, true)}
          aria-label={c.nameAria}
          data-world-name
          className="wd-wfullInput13"
        />
        <textarea
          value={world.summary}
          onChange={(e) => edit({ ...world, summary: e.target.value })}
          onBlur={() => edit(world, true)}
          placeholder={c.summaryPlaceholder}
          aria-label={c.summaryAria}
          data-world-summary
          rows={2}
          className="wd-areaResize"
        />
        <div className="wd-row1">
          <button
            type="button"
            data-world-summary-ai
            onClick={() => void generateWorldSummary()}
            disabled={aiGen}
            className="wd-accentBtn"
          >
            {aiGen ? c.aiGenBusy : c.aiGen}
          </button>
          {aiGenError ? <p className="wd-danger11" data-world-ai-error>{aiGenError}</p> : null}
        </div>
        <p className="wd-body11Mt2" data-world-stats>{formatWorldStats(worldStats(world), locale)}</p>
        <input
          type="search"
          value={nodeFilter}
          onChange={(e) => setNodeFilter(e.target.value)}
          placeholder={c.filterPlaceholder}
          aria-label={c.filterAria}
          data-world-filter
          className="wd-growInput"
        />
        <button
          type="button"
          onClick={cycleSort}
          title={c.sortTitle}
          data-world-sort
          className="wd-ghostBtn"
        >
          {c.sort(sortMode)}
        </button>
        {nodeFilter.trim() && visibleNodes.length === 0 ? (
          <p className="wd-body11Mt2" data-world-filter-empty>{c.filterEmpty}</p>
        ) : null}
        {snapshot.error ? (
          <p className="wd-dangerMt2" data-world-error>
            {snapshot.error}
          </p>
        ) : null}
      </header>

      <div className="wd-scrollP2">
        {groups.map((kind) => (
          <section key={kind} className="wd-mb3" data-world-group={kind}>
            <h3 className="wd-labelMb1">
              {kindLabel(kind, locale)}
              <span className="wd-end">{visibleCounts[kind] ?? 0}</span>
            </h3>
            <ul className="wd-col2">
              {visibleNodes
                .filter((node) => node.kind === kind)
                .map((node) => (
                  <li
                    key={node.id}
                    className="wd-card"
                    data-world-node={node.id}
                  >
                    <div className="wd-row1">
                      <input
                        value={node.title}
                        onChange={(e) => edit(updateWorldNode(world, node.id, { title: e.target.value }))}
                        onBlur={() => edit(world, true)}
                        aria-label={c.titleAria(node.title)}
                        data-world-title={node.id}
                        className="wd-growInput"
                      />
                      <button
                        type="button"
                        title={c.deleteEntryTitle(countLinksFor(world, node.id))}
                        onClick={() => edit(removeWorldNode(world, node.id), true)}
                        aria-label={c.deleteAriaEntry(node.title)}
                        data-world-remove={node.id}
                        className="wd-delBtn"
                      >
                        ×
                      </button>
                    </div>
                    <textarea
                      value={node.body}
                      onChange={(e) => edit(updateWorldNode(world, node.id, { body: e.target.value }))}
                      onBlur={() => edit(world, true)}
                      placeholder={c.bodyPlaceholder}
                      aria-label={c.bodyAria(node.title)}
                      data-world-body={node.id}
                      rows={3}
                      className="wd-areaResizeMt"
                    />
                      <button
                        type="button"
                        onClick={() => void writeEcho(node)}
                        disabled={echoBusyFor === node.id}
                        title={c.aiEchoTitle(node.title)}
                        data-world-ai-echo={node.id}
                        className="wd-ghostBtn"
                      >
                        {echoBusyFor === node.id ? c.aiEchoBusy : c.aiEcho}
                      </button>
                      <button
                        type="button"
                        onClick={() => void linkFrom(node)}
                        disabled={linkBusyFor === node.id}
                        title={c.aiLinkTitle(node.title)}
                        data-world-ai-link={node.id}
                        className="wd-ghostBtn"
                      >
                        {linkBusyFor === node.id ? c.aiLinkBusy : c.aiLink}
                      </button>
                    {node.kind === 'story' || node.kind === 'history' ? (
                      <>
                      <div className="wd-rowMt1" data-world-lore-row={node.id}>
                        <label htmlFor={`world-era-${node.id}`} className="wd-faint11shrink">
                          {c.eraLabel}
                        </label>
                        <input
                          id={`world-era-${node.id}`}
                          type="text"
                          value={node.lore?.era ?? ''}
                          maxLength={80}
                          placeholder={c.eraPlaceholder}
                          aria-label={c.eraAria(node.title)}
                          data-world-era={node.id}
                          onChange={(e) => {
                            const merged = patchLore(node.lore, { era: e.target.value });
                            edit(updateWorldNode(world, node.id, { lore: merged }));
                          }}
                          onBlur={() => edit(world, true)}
                          className="wd-growInput"
                        />
                        <label htmlFor={`world-order-${node.id}`} className="wd-faint11shrink">
                          {c.orderLabel}
                        </label>
                        <input
                          id={`world-order-${node.id}`}
                          type="number"
                          min={0}
                          step={1}
                          value={node.lore?.order ?? ''}
                          placeholder={c.orderPlaceholder}
                          aria-label={c.orderAria(node.title)}
                          data-world-order={node.id}
                          onChange={(e) => {
                            const merged = patchLore(node.lore, { order: e.target.value });
                            edit(updateWorldNode(world, node.id, { lore: merged }));
                          }}
                          onBlur={() => edit(world, true)}
                          className="wd-numInput"
                        />
                        <span className="wd-faint11">{c.orderOptionalHint}</span>
                      </div>
                      <input
                        type="text"
                        value={node.lore?.memory ?? ''}
                        maxLength={240}
                        placeholder={c.memoryEchoPlaceholder}
                        aria-label={c.memoryEchoAria(node.title)}
                        data-world-memory={node.id}
                        onChange={(e) => {
                          const merged = patchLore(node.lore, { memory: e.target.value });
                          edit(updateWorldNode(world, node.id, { lore: merged }));
                        }}
                        onBlur={() => edit(world, true)}
                        className="wd-growInput"
                      />
                      </>
                    ) : null}
                    <div className="wd-rowMt1">
                      <label htmlFor={`world-elevation-${node.id}`} className="wd-faint11shrink">
                        {c.elevationLabel}
                      </label>
                      <input
                        id={`world-elevation-${node.id}`}
                        type="number"
                        min={0}
                        max={WORLD_ELEVATION_MAX}
                        step={0.5}
                        value={world.positions?.[node.id]?.elevation ?? 0}
                        disabled={!world.positions?.[node.id]}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          const result = setWorldNodeElevation(world, node.id, value);
                          if (result.reason) {
                            // 不合法就不写：把原因说出来，而不是让一次按键悄悄消失
                            worldStore.showNotice(result.reason);
                            return;
                          }
                          edit(result.document, true);
                        }}
                        aria-label={c.elevationAria(node.title)}
                        data-world-elevation={node.id}
                        className="wd-numInput"
                      />
                      <span className="wd-faint11">
                        {c.elevationHint(WORLD_ELEVATION_MAX)}
                      </span>
                    </div>
                    <div className="wd-rowMt1">
                      <label htmlFor={`world-model-${node.id}`} className="wd-faint11shrink">
                        {c.modelLabel}
                      </label>
                      <select
                        id={`world-model-${node.id}`}
                        value={node.modelAssetId ?? ''}
                        onChange={(e) => {
                          const result = setWorldNodeModelAsset(world, node.id, e.target.value === '' ? null : e.target.value);
                          if (result.reason) {
                            worldStore.showNotice(result.reason);
                            return;
                          }
                          edit(result.document, true);
                        }}
                        aria-label={c.modelAria(node.title)}
                        data-world-model={node.id}
                        className="wd-growInput"
                      >
                        <option value="">
                          {modelAssets.length ? c.placeholderGeometryFallback : c.placeholderGeometryNoAssets}
                        </option>
                        {modelAssets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.name}
                          </option>
                        ))}
                      </select>
                      <span className="wd-faint11shrink">
                        {c.modelHint}
                      </span>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ))}

        <TerrainSection world={world} edit={edit} c={c} />
        <TideSection world={world} edit={edit} c={c} />

        <div className="wd-aiRow" data-world-ai-row>
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as WorldKind)}
            aria-label={c.newKindAria}
            data-world-new-kind
            className="wd-chipSelect"
          >
            {WORLD_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kindLabel(kind, locale)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              edit(addWorldNode(world, { kind: newKind, title: c.newEntryLabel(kindLabel(newKind, locale)) }), true)
            }
            data-world-add={newKind}
            className="wd-ghostBtn"
          >
            {c.addOne}
          </button>
          <button
            type="button"
            onClick={() => void fillSection()}
            disabled={aiFillBusy}
            title={c.aiFillTitle(kindLabel(newKind, locale))}
            data-world-ai-fill={newKind}
            className="wd-ghostBtn"
          >
            {aiFillBusy ? c.aiFillBusy : c.aiFill}
          </button>
          <button
            type="button"
            onClick={() => void writeChronicle()}
            disabled={chronicleBusy}
            title={c.aiChronicleTitle}
            data-world-ai-chronicle
            className="wd-ghostBtn"
          >
            {chronicleBusy ? c.aiChronicleBusy : c.aiChronicle}
          </button>
          <button
            type="button"
            onClick={() => void fillAllEmpty()}
            disabled={bulkBusy || aiFillBusy}
            title={c.aiFillAllTitle}
            data-world-ai-fill-all
            className="wd-ghostBtn"
          >
            {bulkBusy ? c.aiFillAllBusy : c.aiFillAll}
          </button>
          <button
            type="button"
            onClick={rollFateCard}
            title={c.fateTitle}
            data-world-fate
            className="wd-ghostBtn"
          >
            {c.fate}
          </button>
          <button
            type="button"
            onClick={exportMarkdown}
            title={c.exportMdTitle}
            data-world-export-md
            className="wd-ghostBtn"
          >
            {c.exportMd}
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept=".md,.markdown,text/markdown,text/plain"
            data-world-import-file
            style={{ display: 'none' }}
            onChange={(e) => {
              void importMarkdown(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => importFileRef.current?.click()}
            title={c.importMdTitle}
            data-world-import-md
            className="wd-ghostBtn"
          >
            {c.importMd}
          </button>
          <button
            type="button"
            onClick={runAudit}
            title={c.auditTitle}
            data-world-audit
            className="wd-ghostBtn"
          >
            {c.audit}
          </button>
        </div>
        {aiFillNote ? <p className="wd-body11Mt2" data-world-ai-fill-note>{aiFillNote}</p> : null}
        {chronicleNote ? <p className="wd-body11Mt2" data-world-ai-chronicle-note>{chronicleNote}</p> : null}
        {echoNote ? <p className="wd-body11Mt2" data-world-ai-echo-note>{echoNote}</p> : null}
        {linkNote ? <p className="wd-body11Mt2" data-world-ai-link-note>{linkNote}</p> : null}
        {bulkNote ? <p className="wd-body11Mt2" data-world-ai-fill-all-note>{bulkNote}</p> : null}
        {fateNote ? <p className="wd-body11Mt2" data-world-fate-note>{fateNote}</p> : null}
        {importNote ? <p className="wd-body11Mt2" data-world-import-note>{importNote}</p> : null}
        {auditNote ? <p className="wd-body11Mt2" data-world-audit-note>{auditNote}</p> : null}
        {fateCard ? (
          <button
            type="button"
            onClick={keepFateCard}
            title={c.fateKept}
            data-world-fate-keep
            className="wd-ghostBtn"
          >
            {c.fateKeep}
          </button>
        ) : null}
        <p className="wd-body11Mt2" data-world-note>
          {c.editsNote}
          {groups.length < WORLD_KINDS.length
            ? c.missingKinds(WORLD_KINDS.filter((k) => !counts?.[k]).map((k) => kindLabel(k, locale)).join(locale === 'en' ? ', ' : '、'))
            : ''}
        </p>
        <button
          type="button"
          onClick={() => void worldStore.commit()}
          data-world-save
          className="wd-mt2 wd-selfStart wd-accentBtn"
        >
          {c.saveToLibrary}
        </button>
      </div>
    </div>
  );
}

/**
 * §140 第四片的地形编辑区。圆台清单 + 加一个 + 删一个。
 * 写入口径与高度输入同一边：不合法就不写，原因由 `setWorldTerrain` 交回来这里显示
 * （面板是唯一的"人看见原因"的地方，模型不认识 UI）。
 * 加的圆台落在世界原点附近一格：面板是数字入口，位置用数字填——
 * 想拖着画的入口在世界图上（WorldGraphView 的「画地形」模式，2026-10-13 落地），
 * 两边同一个写入口径 `setWorldTerrain`，不合法都只显示原因不写。
 */
function TerrainSection({
  world,
  edit,
  c,
}: {
  world: WorldDocument;
  edit: (next: WorldDocument, save?: boolean) => void;
  c: WorldCopy;
}) {
  const plateaus = world.terrain?.kind === 'plateaus' ? world.terrain.plateaus : [];
  const [draft, setDraft] = useState<WorldPlateau>({ id: '', x: 0, y: 0, radius: 6, height: 2 });

  const apply = (next: WorldPlateau[] | null) => {
    const result = setWorldTerrain(world, next === null ? null : { kind: 'plateaus', plateaus: next });
    if (result.reason) {
      worldStore.showNotice(result.reason);
      return;
    }
    edit(result.document, true);
  };

  return (
    <section className="wd-mt4" data-world-terrain-panel>
      <h3 className="wd-label11">{c.tidalTerrainHeading}</h3>
      <p className="wd-body11Mt1">
        {c.terrainIntro(WORLD_TERRAIN_HEIGHT_MAX, WORLD_PLATEAU_RADIUS_MIN, WORLD_PLATEAU_RADIUS_MAX, WORLD_PLATEAU_LIMIT, plateaus.length)}
      </p>
      <ul className="wd-colMt1">
        {plateaus.map((plateau) => (
          <li key={plateau.id} className="wd-row1" data-world-plateau={plateau.id}>
            <span className="wd-fname11truncate">
              ({plateau.x}, {plateau.y}) r={plateau.radius} h={plateau.height}
              {plateau.profile === 'cone' ? c.plateauConeSuffix : ''}
            </span>
            <button
              type="button"
              onClick={() => apply(plateaus.filter((p) => p.id !== plateau.id))}
              aria-label={c.plateauRemoveAria(plateau.id)}
              data-world-plateau-remove={plateau.id}
              className="wd-delBtn"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="wd-wrapCenter1">
        <label htmlFor="world-plateau-x" className="wd-faint11shrink">
          x
        </label>
        <input
          id="world-plateau-x"
          type="number"
          value={draft.x}
          onChange={(e) => setDraft((d) => ({ ...d, x: Number(e.target.value) }))}
          data-world-plateau-input="x"
          className="wd-numInput"
        />
        <label htmlFor="world-plateau-y" className="wd-faint11shrink">
          y
        </label>
        <input
          id="world-plateau-y"
          type="number"
          value={draft.y}
          onChange={(e) => setDraft((d) => ({ ...d, y: Number(e.target.value) }))}
          data-world-plateau-input="y"
          className="wd-numInput"
        />
        <label htmlFor="world-plateau-radius" className="wd-faint11shrink">
          {c.plateauRadius}
        </label>
        <input
          id="world-plateau-radius"
          type="number"
          min={WORLD_PLATEAU_RADIUS_MIN}
          max={WORLD_PLATEAU_RADIUS_MAX}
          value={draft.radius}
          onChange={(e) => setDraft((d) => ({ ...d, radius: Number(e.target.value) }))}
          data-world-plateau-input="radius"
          className="wd-numInput"
        />
        <label htmlFor="world-plateau-height" className="wd-faint11shrink">
          {c.plateauHeight}
        </label>
        <input
          id="world-plateau-height"
          type="number"
          min={0}
          max={WORLD_TERRAIN_HEIGHT_MAX}
          step={0.5}
          value={draft.height}
          onChange={(e) => setDraft((d) => ({ ...d, height: Number(e.target.value) }))}
          data-world-plateau-input="height"
          className="wd-numInput"
        />
        <label htmlFor="world-plateau-profile" className="wd-faint11shrink">
          {c.plateauProfile}
        </label>
        <select
          id="world-plateau-profile"
          value={draft.profile ?? 'mesa'}
          onChange={(e) =>
            setDraft((d) => ({ ...d, profile: e.target.value === 'cone' ? 'cone' : undefined }))
          }
          data-world-plateau-input="profile"
          className="wd-inputSm"
        >
          <option value="mesa">{c.mesaOption}</option>
          <option value="cone">{c.coneOption}</option>
        </select>
        <button
          type="button"
          onClick={() => {
            // 只写 cone：mesa 是缺省，写进文档等于让每个存盘都多一栏没人读的默认值
            const { profile, ...rest } = draft;
            apply([...plateaus, { ...rest, id: `wp_${Date.now().toString(36)}${plateaus.length}`, ...(profile === 'cone' ? { profile: 'cone' as const } : {}) }]);
          }}
          data-world-plateau-add
          className="wd-ghostBtnShrink"
        >
          {c.addPlateau}
        </button>
        {world.terrain ? (
          <button
            type="button"
            onClick={() => apply(null)}
            data-world-terrain-clear
            className="wd-delBtnBig"
          >
            {c.clearTerrain}
          </button>
        ) : null}
      </div>
    </section>
  );
}
/**
 * §潮汐声明编辑器（v721 · ADR-0267 的第三片）：作者在面板里落笔声明扰模。
 * 写入口径与 `setWorldTidePressures` 同一支笔：kind 不认识 / label 空白 / id 重复 / 超限整批拒绝，
 * 原因由 `worldStore.showNotice` 原样显示——和「画地形」是同一门（UI 永远不收不合法的字节）。
 * severity 只是着墨（1 要闻 / 2 季节 / 3 纪元），不参与任何潮汐计数。
 */
function TideSection({
  world,
  edit,
  c,
}: {
  world: WorldDocument;
  edit: (next: WorldDocument, save?: boolean) => void;
  c: WorldCopy;
}) {
  const pressures = world.pressures ?? [];
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<WorldTidePressureKind>('drought');
  const [severity, setSeverity] = useState<1 | 2 | 3>(2);

  const apply = (next: WorldTidePressure[] | null) => {
    const result = setWorldTidePressures(world, next);
    if (result.reason) {
      worldStore.showNotice(result.reason);
      return;
    }
    edit(result.document, true);
  };

  return (
    <section className="wd-mt4" data-world-tide-panel>
      <h3 className="wd-label11">{c.tideHeading}</h3>
      <p className="wd-body11Mt1">
        {c.tideIntro}
        {pressures.length > 0 ? c.tideDeclared(pressures.length, WORLD_TIDE_PRESSURE_LIMIT) : c.tideNone}
      </p>
      <ul className="wd-colMt1">
        {pressures.map((pressure) => (
          <li key={pressure.id} className="wd-row1" data-world-tide={pressure.id}>
            <span className="wd-fname11truncate">
              {pressure.label} · {c.tideKindLabels[pressure.kind]} · severity {pressure.severity}
            </span>
            <button
              type="button"
              onClick={() => apply(pressures.filter((entry) => entry.id !== pressure.id))}
              aria-label={c.tideRemoveAria(pressure.label)}
              data-world-tide-remove={pressure.id}
              className="wd-delBtn"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="wd-wrapCenter1">
        <label htmlFor="world-tide-label" className="wd-faint11shrink">
          {c.tideNameField}
        </label>
        <input
          id="world-tide-label"
          type="text"
          value={label}
          maxLength={40}
          placeholder={c.tideLabelPlaceholder}
          onChange={(e) => setLabel(e.target.value)}
          aria-label={c.tideLabelAria}
          data-world-tide-label
          className="wd-numInput"
        />
        <label htmlFor="world-tide-kind" className="wd-faint11shrink">
          kind
        </label>
        <select
          id="world-tide-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as WorldTidePressureKind)}
          aria-label={c.tideKindAria}
          data-world-tide-kind
          className="wd-inputSm"
        >
          {WORLD_TIDE_PRESSURE_KINDS.map((entry) => (
            <option key={entry} value={entry}>
              {c.tideMatchKind(entry, c.tideKindLabels[entry])}
            </option>
          ))}
        </select>
        <label htmlFor="world-tide-severity" className="wd-faint11shrink">
          severity
        </label>
        <select
          id="world-tide-severity"
          value={severity}
          onChange={(e) => setSeverity(Number(e.target.value) as 1 | 2 | 3)}
          aria-label={c.tideSeverityAria}
          data-world-tide-severity
          className="wd-inputSm"
        >
          <option value={1}>{c.severity1}</option>
          <option value={2}>{c.severity2}</option>
          <option value={3}>{c.severity3}</option>
        </select>
        <button
          type="button"
          onClick={() => {
            const trimmed = label.trim();
            if (!trimmed) {
              worldStore.showNotice(c.tideNameRequired);
              return;
            }
            apply([...pressures, { id: `tp_${Date.now().toString(36)}${pressures.length}`, kind, label: trimmed, severity }]);
            setLabel('');
          }}
          data-world-tide-add
          className="wd-ghostBtnShrink"
        >
          {c.tideAdd}
        </button>
        {pressures.length > 0 ? (
          <button
            type="button"
            onClick={() => apply(null)}
            data-world-tide-clear
            className="wd-delBtnBig"
          >
            {c.tideClearAll}
          </button>
        ) : null}
      </div>
    </section>
  );
}
