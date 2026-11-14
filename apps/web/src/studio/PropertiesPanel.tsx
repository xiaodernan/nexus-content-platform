'use client';

import { useState } from 'react';
import {
  getByPath,
  isTokenRef,
  makeTokenRef,
  tokenRefKey,
  NODE_STATES,
  type BreakpointName,
  type ColorValue,
  type DesignNode,
  type NodeState,
  type Token,
} from '@nexus/creative-model';
import { cn } from '@/lib/cn';
import type { Locale } from '@/lib/i18n';
import { resolveColor } from './render';
import { stateLabel } from './state-labels';
import {
  breakpointLabel,
  viewportOptions,
} from './viewer-params';
import {
  RESPONSIVE_CHANNELS,
  channelLabel,
  choicesFor,
  designValueOf,
  hasResponsiveRule,
  projectedValueOf,
  responsiveChannelsOf,
  responsiveImpactDetailOf,
  responsiveImpactOf,
  toggleLabelsFor,
  type ChannelSpec,
  type ResponsiveChannel,
  type ResponsiveChoice,
} from './responsive-editor';
import { studio, useStudio, useStudioReady } from './store';

const COPY = {
  zh: {
    fits: [
      { value: 'cover', label: '覆盖' },
      { value: 'contain', label: '包含' },
      { value: 'fill', label: '拉伸' },
      { value: 'tile', label: '平铺' },
    ],
    layoutModes: [
      { value: 'none', label: '绝对定位' },
      { value: 'vertical', label: '纵向自动布局' },
      { value: 'horizontal', label: '横向自动布局' },
      { value: 'grid', label: '网格' },
      { value: 'wrap', label: '换行' },
      { value: 'stack', label: '堆叠' },
    ],
    uploadBusy: '上传中…',
    multiSelected: (n: number) => `${n} 个元素（属性写入将广播到全部选中）`,
    summarySingle: (type: string, name: string) => `${type} · ${name}`,
    secSizeTitle: '尺寸与位置',
    secLayoutTitle: '布局',
    secTextTitle: '文字',
    secFillTitle: '填充与描边',
    secEffectsTitle: '效果',
    secStatesTitle: '交互状态（§124）',
    secBreakpointsTitle: '断点（§14）',
    secVisibilityTitle: '状态',
    secPageTitle: '页面',
    secDesignSystemTitle: 'Design System 概览',
    sizeWidth: '宽',
    sizeHeight: '高',
    posX: 'X',
    posY: 'Y',
    posXHint: '父级为自动布局时位置由布局决定',
    layoutMode: '模式',
    layoutGap: '间距',
    layoutColumns: '列数',
    layoutJustify: '主轴',
    layoutItems: '交叉轴',
    clipContent: '裁剪超出内容',
    textContent: '内容',
    tyFontSize: '字号',
    tyFontWeight: '字重',
    tyLineHeight: '行高',
    tyLetterSpacing: '字距',
    tyAlign: '对齐',
    tyFontFamily: '字体',
    tyColor: '字色',
    tyTextWrap: '换行',
    fillCornerRadius: '圆角',
    fillStrokeWidth: '描边',
    fxOpacity: '透明度',
    fxRotation: '旋转',
    fxCursor: '光标',
    visVisible: '可见',
    visLocked: '锁定',
    delete: '删除',
    multiPasteNote: (n: number) => `多选时不做逐通道编辑：在一个元素上复制状态补丁，再整份贴给选中的 ${n} 个元素（一次事务，撤销一次全回去）。`,
    clipboardNote: (source: string, state: string) => `剪贴板：${source} 的「${state}」补丁`,
    clipboardNoteFull: (source: string, state: string) => `剪贴板：${source} 的「${state}」补丁（粘贴会整份覆盖目标这个状态的通道）`,
    clipboardEmpty: '剪贴板为空：先单选一个已有状态补丁的元素，点「复制」。',
    pasteToMany: (state: string, n: number) => `粘贴「${state}」补丁到 ${n} 个元素`,
    pasteSimple: '粘贴到选中元素',
    noText: '画布不预览状态（避免干扰选择与拖拽）；移上指针的效果去预览或发布页看（ADR-0062）。',
    fontColorLabel: '字色',
    backgroundLabel: '背景',
    strokeLabel: '描边',
    shadowX: '阴影 X',
    shadowY: '阴影 Y',
    blur: '模糊',
    spread: '扩散',
    shadowColorLabel: '阴影色',
    opacityLabel: '透明度',
    notSet: '未设置',
    clearChannelTitle: '清除该通道（生成器发射重置类）',
    clearStrokeTitle: '清除描边通道',
    clearEffectsTitle: '清除效果通道',
    clearOpacityTitle: '清除透明度覆盖',
    dropStateTitle: (state: string) => `删除${state}状态补丁`,
    copyPatchTitleReady: (state: string) => `复制「${state}」的整份补丁`,
    copyPatchTitleEmpty: (state: string) => `「${state}」还没有补丁，没有可复制的通道`,
    copyPatchButton: (state: string) => `复制「${state}」补丁`,
    pastePatchTitleReady: (source: string, state: string) => `粘贴 ${source} 的「${state}」补丁（整通道覆盖）`,
    pastePatchTitleEmpty: '剪贴板为空：先选一个已有状态补丁的元素复制',
    pastePatchButton: (state?: string) => (state ? `粘贴「${state}」补丁` : '粘贴补丁'),
    bgAria: (state: string) => `${state}状态·背景颜色`,
    strokeWidthAria: (state: string) => `${state}状态·描边宽度`,
    strokeColorAria: (state: string) => `${state}状态·描边颜色`,
    shadowColorAria: (state: string) => `${state}状态·阴影颜色`,
    opacityAria: (state: string) => `${state}状态·透明度`,
    nodeNameAria: '元素名称',
    pageNodes: (n: number) => `${n} 个节点`,
    resolvedSize: (viewport: string, rw: number, rh: number) => `${viewport} 下为 ${rw} × ${rh}`,
    breakpointRootNote: (rw: number, pageWidth: number, pageHeight: number) =>
      `这一档的根宽由断点给出（${rw}px），不是模型里的那个数——换视口只改投影，模型仍是 ${pageWidth} × ${pageHeight}。所以断点面板编辑的是元素，根画框不在其中。`,
    dsCounts: (tokens: number, components: number, assets: number) =>
      `${tokens} 个 token · ${components} 个组件 · ${assets} 个资产`,
    dsSelectionHint: '选中画布元素后，这里会切换成属性编辑器。',
    mixedLabel: '混合',
    hugTitle: 'hug：贴合内容',
    fillTitle: 'fill：填满父级',
    follows: '跟随',
    defaultValue: '默认',
    uploadImageShort: '换一张图',
    addImage: '+ 图片',
    addColor: '+ 颜色',
    noFills: '无填充',
    imageAsset: (id: string) => `图片 ${id}`,
    imageAssetMissing: '图片资产不在本项目清单',
    imageFitAria: '图片填充方式',
    removeFillTitle: '移除该填充层',
    layerFillAria: (n: number) => `第 ${n} 层填充颜色`,
    bindTokenTitle: '绑定 token',
    bindGlyph: '链',
    noMatchingTokens: '没有匹配类型的 token',
    alignItems: [
      { id: 'left', short: '左', full: '左' },
      { id: 'hcenter', short: '中', full: '水平居中' },
      { id: 'right', short: '右', full: '右' },
      { id: 'top', short: '上', full: '上' },
      { id: 'vcenter', short: '中', full: '垂直居中' },
      { id: 'bottom', short: '下', full: '下' },
    ],
    alignTitle: (full: string) => `对齐：${full}（仅绝对定位父级生效）`,
    bpLead: '窄一档的规则会带到更宽的档（手机→全部、平板→桌面与宽屏）。写下去的每一个键都会真的改变那一档的投影：',
    bpLead2: '等于原值的写入会被剪掉，不占撤销栈。',
    mixedParen: '（混合）',
    changesCount: (n: number) => `（改 ${n} 处）`,
    backToDesign: '回设计尺寸',
    tierReadPrefix: (label: string) => `${label} 这一档：`,
    impactMixed: (n: number) => `选中的 ${n} 个元素改的通道数不一致`,
    impactChanged: (n: number) => `改 ${n} 处投影`,
    impactInheritedSuffix: '（都来自更窄那一档的规则：这一档自己没有规则，清除键要等这一档写了才出现）',
    impactNoOp: '这一档的规则一处投影都没改——它跟设计值和更窄档的继承撞上了（AI 配方或代码视图写进来的空覆盖，按下面那颗清掉）',
    noRules: '还没有规则',
    canvasShownDesign: ' · 画布按设计尺寸（不在预览这一档）呈现',
    canvasShownTier: (viewport: string) => ` · 画布按 ${viewport} 档呈现`,
    outsideMixed: '徽标里还有几个键在这一格摆不出输入口（代码视图或 AI 配方写进来的，或者这个元素改不了它），各元素不同——',
    outsideMixedTail: '按下面那颗「清掉这一档」会连着它们一起删。',
    outsideSome: (n: number, keys: string) =>
      `其中 ${n} 处面板没有输入口：${keys}——它们由「代码」那一节或 AI 配方写进来（或这个元素改不了它），「清掉这一档」会连着它们一起删。`,
    clearTierAll: (name: string) => `清掉${name}这一档的全部覆盖`,
    channelRowReadout: (value: string, design: string) => `这一档 ${value} · 设计 ${design}`,
    choiceTitle: (label: string) => `这一档排成${label}`,
    clearTierChannelTitle: (label: string) => `清除这一档的${label}覆盖`,
  },
  en: {
    fits: [
      { value: 'cover', label: 'Cover' },
      { value: 'contain', label: 'Contain' },
      { value: 'fill', label: 'Fill' },
      { value: 'tile', label: 'Tile' },
    ],
    layoutModes: [
      { value: 'none', label: 'Absolute positioning' },
      { value: 'vertical', label: 'Vertical auto layout' },
      { value: 'horizontal', label: 'Horizontal auto layout' },
      { value: 'grid', label: 'Grid' },
      { value: 'wrap', label: 'Wrap' },
      { value: 'stack', label: 'Stack' },
    ],
    uploadBusy: 'Uploading…',
    multiSelected: (n: number) => `${n} elements (writes broadcast to all selected)`,
    summarySingle: (type: string, name: string) => `${type} · ${name}`,
    secSizeTitle: 'Size & position',
    secLayoutTitle: 'Layout',
    secTextTitle: 'Text',
    secFillTitle: 'Fill & stroke',
    secEffectsTitle: 'Effects',
    secStatesTitle: 'Interaction states (§124)',
    secBreakpointsTitle: 'Breakpoints (§14)',
    secVisibilityTitle: 'Visibility',
    secPageTitle: 'Page',
    secDesignSystemTitle: 'Design System overview',
    sizeWidth: 'Width',
    sizeHeight: 'Height',
    posX: 'X',
    posY: 'Y',
    posXHint: 'Position is decided by the layout when the parent is auto-layout',
    layoutMode: 'Mode',
    layoutGap: 'Gap',
    layoutColumns: 'Columns',
    layoutJustify: 'Justify',
    layoutItems: 'Align items',
    clipContent: 'Clip overflowing content',
    textContent: 'Content',
    tyFontSize: 'Font size',
    tyFontWeight: 'Font weight',
    tyLineHeight: 'Line height',
    tyLetterSpacing: 'Letter spacing',
    tyAlign: 'Align',
    tyFontFamily: 'Font family',
    tyColor: 'Text color',
    tyTextWrap: 'Wrap',
    fillCornerRadius: 'Corner radius',
    fillStrokeWidth: 'Stroke',
    fxOpacity: 'Opacity',
    fxRotation: 'Rotation',
    fxCursor: 'Cursor',
    visVisible: 'Visible',
    visLocked: 'Locked',
    delete: 'Delete',
    multiPasteNote: (n: number) => `No per-channel editing for multi-selection: copy the state patch on one element, then paste the whole patch onto the ${n} selected elements (one transaction, one undo to revert).`,
    clipboardNote: (source: string, state: string) => `Clipboard: the “${state}” patch from ${source}`,
    clipboardNoteFull: (source: string, state: string) => `Clipboard: the “${state}” patch from ${source} (paste replaces this state’s channels on the target wholesale)`,
    clipboardEmpty: 'Clipboard is empty: select a single element that already has a state patch, then press “Copy”.',
    pasteToMany: (state: string, n: number) => `Paste the “${state}” patch onto ${n} elements`,
    pasteSimple: 'Paste onto selected elements',
    noText: 'States are not previewed on canvas (they would fight selection and dragging); hover effects are visible on the preview or publish page (ADR-0062).',
    fontColorLabel: 'Text color',
    backgroundLabel: 'Background',
    strokeLabel: 'Stroke',
    shadowX: 'Shadow X',
    shadowY: 'Shadow Y',
    blur: 'Blur',
    spread: 'Spread',
    shadowColorLabel: 'Shadow color',
    opacityLabel: 'Opacity',
    notSet: 'Not set',
    clearChannelTitle: 'Clear this channel (the generator emits reset classes)',
    clearStrokeTitle: 'Clear the stroke channel',
    clearEffectsTitle: 'Clear the effects channel',
    clearOpacityTitle: 'Clear the opacity override',
    dropStateTitle: (state: string) => `Delete the ${state} state patch`,
    copyPatchTitleReady: (state: string) => `Copy the whole “${state}” patch`,
    copyPatchTitleEmpty: (state: string) => `“${state}” has no patch yet — nothing to copy`,
    copyPatchButton: (state: string) => `Copy “${state}” patch`,
    pastePatchTitleReady: (source: string, state: string) => `Paste the “${state}” patch from ${source} (whole-channel replace)`,
    pastePatchTitleEmpty: 'Clipboard is empty: select one element with a state patch and copy first',
    pastePatchButton: (state?: string) => (state ? `Paste the “${state}” patch` : 'Paste patch'),
    bgAria: (state: string) => `${state} state · background color`,
    strokeWidthAria: (state: string) => `${state} state · stroke width`,
    strokeColorAria: (state: string) => `${state} state · stroke color`,
    shadowColorAria: (state: string) => `${state} state · shadow color`,
    opacityAria: (state: string) => `${state} state · opacity`,
    nodeNameAria: 'Element name',
    pageNodes: (n: number) => `${n} nodes`,
    resolvedSize: (viewport: string, rw: number, rh: number) => `${viewport} resolves to ${rw} × ${rh}`,
    breakpointRootNote: (rw: number, pageWidth: number, pageHeight: number) =>
      `This tier’s root width comes from the breakpoint (${rw}px), not from the model — switching viewports only changes the projection; the model stays ${pageWidth} × ${pageHeight}. So the breakpoint panel edits elements, not the root frame.`,
    dsCounts: (tokens: number, components: number, assets: number) =>
      `${tokens} tokens · ${components} components · ${assets} assets`,
    dsSelectionHint: 'Select a canvas element and this switches to the properties editor.',
    mixedLabel: 'Mixed',
    hugTitle: 'hug: hug the content',
    fillTitle: 'fill: fill the parent',
    follows: 'Follow',
    defaultValue: 'Default',
    uploadImageShort: 'Replace image',
    addImage: '+ Image',
    addColor: '+ Color',
    noFills: 'No fills',
    imageAsset: (id: string) => `Image ${id}`,
    imageAssetMissing: 'Image asset is not in this project’s asset list',
    imageFitAria: 'Image fill mode',
    removeFillTitle: 'Remove this fill layer',
    layerFillAria: (n: number) => `Fill color of layer ${n}`,
    bindTokenTitle: 'Bind token',
    bindGlyph: 'Token',
    noMatchingTokens: 'No tokens of this type',
    alignItems: [
      { id: 'left', short: 'L', full: 'Left' },
      { id: 'hcenter', short: 'C', full: 'Center horizontally' },
      { id: 'right', short: 'R', full: 'Right' },
      { id: 'top', short: 'T', full: 'Top' },
      { id: 'vcenter', short: 'M', full: 'Center vertically' },
      { id: 'bottom', short: 'B', full: 'Bottom' },
    ],
    alignTitle: (full: string) => `Align: ${full} (applies to absolutely-positioned parents only)`,
    bpLead: 'Rules from a narrower tier cascade up (mobile → all, tablet → desktop and wide). Every key you write really changes this tier’s projection:',
    bpLead2: 'Writes equal to the inherited value are clipped — they take no slot in the undo stack.',
    mixedParen: ' (mixed)',
    changesCount: (n: number) => ` (${n} changes)`,
    backToDesign: 'Back to design size',
    tierReadPrefix: (label: string) => `${label} tier: `,
    impactMixed: (n: number) => `${n} selected elements report inconsistent channel counts`,
    impactChanged: (n: number) => `${n} projection ${n === 1 ? 'change' : 'changes'}`,
    impactInheritedSuffix: ' (all coming from a narrower tier’s rule — this tier has none of its own, so its clear key only appears once this tier writes one)',
    impactNoOp: 'This tier’s rule changes no projection — it collides with the design value and the narrower tier’s cascade (an empty override written by an AI recipe or the code view — remove it with the button below)',
    noRules: 'No rules yet',
    canvasShownDesign: ' · canvas shown at design size (not this preview tier)',
    canvasShownTier: (viewport: string) => ` · canvas shown at ${viewport} tier`,
    outsideMixed: 'The badge counts a few keys this editor has no input slot for (written by the code view or an AI recipe, or this element can’t change them) — they differ per element here. ',
    outsideMixedTail: 'Press “Clear this tier” below and they will be deleted together.',
    outsideSome: (n: number, keys: string) =>
      `${n} projection${n === 1 ? '' : 's'} have no input slot: ${keys} — written by the “Code” section or an AI recipe (or this element can’t change them). “Clear this tier” deletes them together.`,
    clearTierAll: (name: string) => `Clear all overrides on ${name}`,
    channelRowReadout: (value: string, design: string) => `This tier ${value} · Design ${design}`,
    choiceTitle: (label: string) => `This tier lays out as ${label}`,
    clearTierChannelTitle: (label: string) => `Clear this tier’s ${label} override`,
  },
} as const;

/** 触发一次图片上传的文件选择器：选中即走 studio 的上传事务，选完清空以便重选同一文件 */
function ImageUploadButton({ nodeId, label, busy }: { nodeId: string; label: string; busy: string }) {
  const { assetBusy } = useStudio();
  return (
    <label
      className={cn('pp-uploadLabel', assetBusy && 'pp-busy')}
      data-asset-upload={nodeId}
    >
      {assetBusy ? busy : label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="pp-hidden"
        disabled={assetBusy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void studio.uploadImageAsFill(nodeId, file);
        }}
      />
    </label>
  );
}

const MIXED = Symbol('mixed');

/** §6 右面板：选中元素的属性分区，每个字段可绑定 token */
export function PropertiesPanel({ locale = 'zh' }: { locale?: Locale }) {
  const state = useStudioReady();
  const c = COPY[locale];
  const page = state.page;
  const ids = state.selection;

  if (!page) return null;

  if (!ids.length) return <PageProperties locale={locale} />;

  const nodes = ids.map((id) => page.nodes[id]).filter((n): n is DesignNode => Boolean(n));
  if (!nodes.length) return null;

  const read = <T,>(path: string): T | typeof MIXED => {
    const first = getByPath(nodes[0] as unknown as Record<string, unknown>, path) as T;
    return nodes.every((n) => JSON.stringify(getByPath(n as unknown as Record<string, unknown>, path)) === JSON.stringify(first))
      ? first
      : MIXED;
  };
  const write = (path: string, value: unknown) => studio.setProps(ids, path, value);

  const tokensOfType = (types: Token['type'][]) => state.document.tokens.filter((t) => types.includes(t.type));

  return (
    <div className="pp-scrollCol">
      <div className="pp-headBordered">
        <p className="pp-faint12">{nodes.length > 1 ? c.multiSelected(nodes.length) : c.summarySingle(nodes[0]!.type, nodes[0]!.name)}</p>
        {nodes.length === 1 ? (
          <NodeNameField key={nodes[0]!.id} node={nodes[0]!} locale={locale} />
        ) : null}
      </div>

      <Section title={c.secSizeTitle}>
        <div className="pp-grid2">
          <SizeField label={c.sizeWidth} axis="width" locale={locale} value={read<number | 'hug' | 'fill'>('size.width')} mixed={read('size.width') === MIXED} onSet={(v) => write('size.width', v)} />
          <SizeField label={c.sizeHeight} axis="height" locale={locale} value={read<number | 'hug' | 'fill'>('size.height')} mixed={read('size.height') === MIXED} onSet={(v) => write('size.height', v)} />
          <NumberField label={c.posX} value={read<number>('position.x')} locale={locale} onSet={(v) => write('position.x', v)} disabled={!nodes.every((n) => studio.canFreeMove(n.id))} hint={c.posXHint} />
          <NumberField label={c.posY} value={read<number>('position.y')} locale={locale} onSet={(v) => write('position.y', v)} disabled={!nodes.every((n) => studio.canFreeMove(n.id))} />
        </div>
      </Section>

      <Section title={c.secLayoutTitle}>
        <SelectField
          label={c.layoutMode}
          locale={locale}
          value={read<string>('layout.mode')}
          options={c.layoutModes.map((m) => ({ value: m.value, label: m.label }))}
          onSet={(v) => write('layout.mode', v)}
        />
        <div className="pp-grid2">
          <NumberField label={c.layoutGap} value={read<number>('layout.gap')} locale={locale} onSet={(v) => write('layout.gap', v)} bind={{ types: ['dimension', 'number'], path: 'layout.gap', write }} read={read} tokens={tokensOfType(['dimension', 'number'])} />
          {read<string>('layout.mode') === 'grid' ? (
            <NumberField label={c.layoutColumns} value={read<number>('layout.columns')} locale={locale} onSet={(v) => write('layout.columns', Math.max(1, Math.round(v)))} />
          ) : null}
        </div>
        <PaddingGrid read={read} write={write} tokens={tokensOfType(['dimension', 'number'])} locale={locale} />
        <div className="pp-grid2">
          <SelectField
            label={c.layoutJustify}
            locale={locale}
            value={read<string>('layout.justify')}
            options={['start', 'center', 'end', 'space-between', 'space-around', 'space-evenly'].map((v) => ({ value: v, label: v }))}
            onSet={(v) => write('layout.justify', v)}
          />
          <SelectField
            label={c.layoutItems}
            locale={locale}
            value={read<string>('layout.items')}
            options={['start', 'center', 'end', 'stretch', 'baseline'].map((v) => ({ value: v, label: v }))}
            onSet={(v) => write('layout.items', v)}
          />
        </div>
        <CheckField label={c.clipContent} checked={read<boolean>('layout.clipContent') === true} onSet={(v) => write('layout.clipContent', v)} />
      </Section>

      {nodes.some((n) => n.typography) ? (
        <Section title={c.secTextTitle}>
          <TextField label={c.textContent} value={read<string>('text')} locale={locale} onSet={(v) => write('text', v)} textarea />
          <div className="pp-grid2">
            <NumberField label={c.tyFontSize} value={read<number>('typography.fontSize')} locale={locale} onSet={(v) => write('typography.fontSize', v)} bind={{ types: ['dimension', 'number'], path: 'typography.fontSize', write }} read={read} tokens={tokensOfType(['dimension', 'number'])} />
            <NumberField label={c.tyFontWeight} value={read<number>('typography.fontWeight')} locale={locale} onSet={(v) => write('typography.fontWeight', v)} />
            <NumberField label={c.tyLineHeight} value={read<number>('typography.lineHeight')} locale={locale} step={0.1} onSet={(v) => write('typography.lineHeight', v)} />
            <NumberField label={c.tyLetterSpacing} value={read<number>('typography.letterSpacing')} locale={locale} step={0.1} onSet={(v) => write('typography.letterSpacing', v)} />
          </div>
          <SelectField
            label={c.tyAlign}
            locale={locale}
            value={read<string>('typography.align')}
            options={['left', 'center', 'right', 'justify'].map((v) => ({ value: v, label: v }))}
            onSet={(v) => write('typography.align', v)}
          />
          <SelectField
            label={c.tyFontFamily}
            locale={locale}
            value={read<string>('typography.fontFamily')}
            options={[...tokensOfType(['fontFamily']).map((t) => ({ value: makeTokenRef(t.key), label: t.key })), { value: 'Inter, sans-serif', label: 'Inter' }]}
            onSet={(v) => write('typography.fontFamily', v)}
          />
          {nodes.some((n) => n.type === 'button' || n.type === 'input') ? (
            <SelectField
              label={c.tyColor}
              locale={locale}
              value={read<string>('typography.color') ?? ''}
              options={tokensOfType(['color']).map((t) => ({ value: makeTokenRef(t.key), label: t.key }))}
              onSet={(v) => write('typography.color', v)}
            />
          ) : null}
          <SelectField
            label={c.tyTextWrap}
            locale={locale}
            value={read<string>('style.textWrap')}
            options={['wrap', 'nowrap', 'truncate', 'truncate-2', 'truncate-3'].map((v) => ({ value: v, label: v }))}
            onSet={(v) => write('style.textWrap', v)}
          />
        </Section>
      ) : null}

      <Section title={c.secFillTitle}>
        <FillList nodes={nodes} read={read} write={write} tokens={state.tokens} mode={state.activeMode} colorTokens={tokensOfType(['color'])} locale={locale} />
        <div className="pp-grid2">
          <NumberField label={c.fillCornerRadius} value={read<number>('style.cornerRadius.topLeft')} locale={locale} onSet={(v) => studio.setProps(ids, 'style.cornerRadius', { topLeft: v, topRight: v, bottomRight: v, bottomLeft: v })} bind={{ types: ['dimension', 'number'], path: 'style.cornerRadius.topLeft', write }} read={read} tokens={tokensOfType(['dimension', 'number'])} />
          <NumberField label={c.fillStrokeWidth} value={read<number>('style.strokes.0.width')} locale={locale} onSet={(v) => write('style.strokes.0.width', v)} />
        </div>
      </Section>

      <Section title={c.secEffectsTitle}>
        <div className="pp-grid2">
          <NumberField label={c.fxOpacity} value={read<number>('style.opacity')} locale={locale} step={0.05} onSet={(v) => write('style.opacity', Math.min(1, Math.max(0, v)))} />
          <NumberField label={c.fxRotation} value={read<number>('style.rotation')} locale={locale} onSet={(v) => write('style.rotation', v)} />
        </div>
        <SelectField
          label={c.fxCursor}
          locale={locale}
          value={read<string>('style.cursor')}
          options={['default', 'pointer', 'text', 'grab'].map((v) => ({ value: v, label: v }))}
          onSet={(v) => write('style.cursor', v)}
        />
      </Section>

      <Section title={c.secStatesTitle}>
        {nodes.length === 1 ? (
          <StateEditor node={nodes[0]!} write={write} tokens={state.tokens} mode={state.activeMode} colorTokens={tokensOfType(['color'])} locale={locale} />
        ) : (
          <div className="pp-col2">
            <p className="pp-faint12">{c.multiPasteNote(nodes.length)}</p>
            {state.statesClipboard ? (
              <p className="pp-faint11" data-states-clipboard-note>
                {c.clipboardNote(state.statesClipboard.sourceName, stateLabel(state.statesClipboard.state, locale))}
              </p>
            ) : (
              <p className="pp-faint11" data-states-clipboard-empty>
                {c.clipboardEmpty}
              </p>
            )}
            <button
              type="button"
              disabled={!state.statesClipboard}
              onClick={() => {
                if (state.statesClipboard) studio.pasteStates(nodes.map((n) => n.id));
              }}
              className={cn('pp-ghostBtn', state.statesClipboard ? 'pp-ghostReady' : 'pp-ghostIdle')}
              data-state-paste-batch={nodes.length}
            >
              {state.statesClipboard
                ? c.pasteToMany(stateLabel(state.statesClipboard.state, locale), nodes.length)
                : c.pasteSimple}
            </button>
          </div>
        )}
      </Section>

      <Section title={c.secBreakpointsTitle}>
        <ResponsiveSection nodes={nodes} locale={locale} />
      </Section>

      <Section title={c.secVisibilityTitle}>
        <div className="pp-grid2">
          {nodes.length === 1 ? (
            <>
              <CheckField label={c.visVisible} checked={nodes[0]!.visible} onSet={(v) => studio.setVisible(nodes[0]!.id, v)} />
              <CheckField label={c.visLocked} checked={nodes[0]!.locked} onSet={(v) => studio.setLocked(nodes[0]!.id, v)} />
            </>
          ) : null}
        </div>
        <div className="pp-rowMt2">
          <button type="button" onClick={() => studio.deleteSelection()} className="pp-dangerGhost">
            {c.delete}
          </button>
          <AlignMenu onAlign={(edge) => studio.alignSelection(edge)} disabled={nodes.length < 2} locale={locale} />
        </div>
      </Section>
    </div>
  );
}

/**
 * §14 断点规则的人工入口（ADR-0069 欠的那一寸）。
 *
 * 这条链以前只有两个写入方：AI 配方与代码视图的变体类，面板只读地显示"tablet 下为 W×H"。
 * 这里让作者自己写：**一次一个通道、一条可撤销事务**（§150），写下去的每个键都会真的
 * 改变那一档的投影（等于原值的写入被 `responsive-editor` 剪掉，不占撤销栈，§159）。
 *
 * 点断点那一格**同时把画布切到那一档**：`store.resolveFor` 的缓存键含 viewport（store.ts:403），
 * 换档就重解布局，所以这里改的键在画布上当场可见——预览用的就是发布页那一份 `resolveLayout`，
 * 不是第二套渲染（ADR-0063）。
 *
 * 根画框不在这张面板的管辖范围：图层列表面从根的**孩子**起（`flattenLayers` 的
 * `pushChildren(root, 0)`，layers-flat.ts:45，且 Ctrl+A 也显式排掉根，CanvasStage.tsx:272），
 * 画布上点根画框是取消选择（`hitNode.id === layout.rootId`），
 * 所以这一节永远只拿到可编辑的元素。根那一档的宽由断点给出、不读模型，
 * 那条事实由 `packages/creative-model/test/layout.test.ts` 的「视口宽度压过 modelRoot」钉住，
 * 界面上的披露在「页面」那一节（`PageProperties`）。
 */
function ResponsiveSection({ nodes, locale }: { nodes: DesignNode[]; locale: Locale }) {
  const state = useStudioReady();
  const c = COPY[locale];
  const [bp, setBp] = useState<BreakpointName>(() => (state.viewport === 'design' ? 'tablet' : state.viewport));
  // 数字输入走草稿+失焦提交：一路打字不该产生一路可撤销事务（与状态编辑器里的颜色同一口径）
  const [drafts, setDrafts] = useState<Record<string, string | undefined>>({});
  const ids = nodes.map((n) => n.id);

  const mixedOf = <T,>(pick: (node: DesignNode) => T): T | typeof MIXED => {
    const first = pick(nodes[0]!);
    return nodes.every((n) => JSON.stringify(pick(n)) === JSON.stringify(first)) ? first : MIXED;
  };
  /**
   * position（`position.x/y`）那两格只有父级在这一档是自由定位才摆出来（`none`/`stack`）：
   * 父级把这一档翻成横排/竖排后，子节点已在流里，画布读不到 `left/top`，两个输入口摆了只是谎
   * （§159）。
   */
  const parentCtx = (node: DesignNode) => ({ parent: state.page?.nodes?.[node.parentId ?? ''] ?? null });
  const parentOf = (node: DesignNode) => parentCtx(node).parent;
  /** 面板要跟文档走的判据只有一份：fontFamily 型 token 现读，impact/outsidePanel/名册全用它 */
  const documentTokens = state.document?.tokens ?? [];
  const impactOf = (breakpoint: BreakpointName) =>
    mixedOf((n) => responsiveImpactOf(n, breakpoint, parentOf(n), documentTokens));
  const impact = impactOf(bp);
  /** 徽标数的是模型里所有组，面板只摆得出真能改的那几格——差出来的那些键要说出来，不然"改 3 处"里
   *  有 2 处对着空白的行，作者会以为面板坏了（§159：界面说的话要跟画布/访客看得见的对得上） */
  const outsideOf = mixedOf((n) => responsiveImpactDetailOf(n, bp, parentOf(n), documentTokens).outsidePanel);
  const hasAnyRule = nodes.some((n) => hasResponsiveRule(n, bp));

  const pickBreakpoint = (next: BreakpointName) => {
    setBp(next);
    setDrafts({});
    // 画布跟着编辑的那一档走：改完当场看得见，不必再去顶栏切一次
    studio.setViewport(next);
  };

  const commitNumber = (channel: ResponsiveChannel, raw: string | undefined) => {
    setDrafts({ ...drafts, [channel]: undefined });
    if (raw === undefined || raw.trim() === '') return;
    const next = Number(raw);
    if (Number.isFinite(next)) studio.setResponsiveValue(ids, bp, channel, next);
  };

  // 通道值可能是数字、关键字（hug/fill）、布尔、排布名，或**绑到 token 的引用对象**——
  // 显示一律 JSON 化，不做"数字才算数"的假设（那会把 token 绑定的尺寸读成 undefined）
  const rowValue = (channel: ResponsiveChannel): unknown =>
    mixedOf((n) => projectedValueOf(n, bp, channel) as never);

  const hasOverride = (channel: ResponsiveChannel) =>
    nodes.some((n) => responsiveChannelsOf(n, bp).includes(channel));

  const textOf = (value: unknown): string =>
    value === undefined ? c.defaultValue : typeof value === 'string' ? value : JSON.stringify(value);
  /** 布尔两端的说法由通道自己给（`visible` 是隐藏/显示，`layout.reverse` 是正序/反向）；按 locale 取 */
  const boolLabels = (spec: ChannelSpec): readonly [string, string] => toggleLabelsFor(spec, locale);
  /** 读数用中文说法（显示/隐藏、竖排/横排），模型里的原值仍是 `visible` / `vertical` */
  /**
   * 静态 choice 用 spec 自己的名单；`font-family-tokens` 那一格从**文档现有的** fontFamily 型 token
   * 现读——文档里没有这个型 token 时这格本来就不摆出来（appliesTo 收起）。
   */
  const choicesOf = (spec: ChannelSpec): readonly ResponsiveChoice[] | undefined => {
    if (spec.choicesFrom === 'font-family-tokens') {
      return (state.document?.tokens ?? [])
        .filter((token: Token) => token.type === 'fontFamily')
        .map((token) => ({ value: `{${token.key}}`, label: token.key }));
    }
    return choicesFor(spec, locale);
  };
  const labelOf = (spec: ChannelSpec, value: unknown): string => {
    if (value === MIXED) return c.mixedLabel;
    if (typeof value === 'boolean') return boolLabels(spec)[value ? 1 : 0];
    return choicesOf(spec)?.find((choice) => choice.value === value)?.label ?? textOf(value);
  };
  /** 「设计」那一边的读数也要按多选算：两个节点的设计值不一样时说"混合"，
   *  而不是拿 `nodes[0]` 那个数冒充整批（§159：界面不能说出模型里没有的值） */
  const designOf = (spec: ChannelSpec): string => {
    const value = mixedOf((n) => designValueOf(n, spec.id) as never);
    return labelOf(spec, value);
  };

  /**
   * 行的名册由内核定：只摆**这个节点、这一档真能改**的那几格（`appliesTo`）。
   * 摆一个按下去什么都改不了的输入口，作者只会以为面板坏了（§159）。
   * 多选取**交集**——不能对着一个不认这格的元素写这一格。
   * 位置（`position.x/y`）那两格只有父级在这一档是自由定位才摆出来（`none`/`stack`）：
   * 父级把这一档翻成横排/竖排后，子节点已在流里，画布读不到 `left/top`，两个输入口摆了只是谎
   * （§159）。
   * 字族那一格还要**文档里真有 fontFamily 型 token**——静态名单给不出这个判据。
   */
  const specs = RESPONSIVE_CHANNELS.filter((spec) =>
    nodes.every((n) => spec.appliesTo(n, bp, { parent: parentOf(n), tokens: documentTokens })),
  );

  const renderChannelRow = (spec: ChannelSpec) => {
    const value = rowValue(spec.id);
    const draft = drafts[spec.id];
    const numeric = typeof value === 'number' ? String(value) : '';
    return (
      <div key={spec.id} className="pp-flex2">
        <span className="pp-rowKey14">{channelLabel(spec, locale)}</span>

        {spec.widget === 'choice'
          ? choicesOf(spec)?.map((choice) => (
              <button
                key={choice.value}
                type="button"
                title={c.choiceTitle(choice.label)}
                onClick={() => studio.setResponsiveValue(ids, bp, spec.id, choice.value)}
                className={cn('pp-segBtn', value === choice.value ? 'pp-segOn' : 'pp-segOff')}
                data-responsive-choice={`${spec.id}:${choice.value}`}
              >
                {choice.label}
              </button>
            ))
          : null}

        {spec.widget === 'toggle'
          ? [true, false].map((want) => (
              <button
                key={String(want)}
                type="button"
                onClick={() => studio.setResponsiveValue(ids, bp, spec.id, want)}
                className={cn('pp-segWide', value === want ? 'pp-segOn' : 'pp-segOff')}
                data-responsive-toggle={`${spec.id}:${want}`}
              >
                {boolLabels(spec)[want ? 1 : 0]}
              </button>
            ))
          : null}

        {spec.widget === 'size' || spec.widget === 'number' ? (
          <input
            type="number"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={draft ?? numeric}
            placeholder={value === MIXED ? c.mixedLabel : typeof value === 'string' ? value : c.follows}
            // 这一行左边有字（`spec.label`），但那是一颗 `<span>`，读屏拿不到它；名字必须写在控件上
            aria-label={channelLabel(spec, locale)}
            onChange={(e) => setDrafts({ ...drafts, [spec.id]: e.target.value })}
            onBlur={() => commitNumber(spec.id, draft)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="pp-w20Input"
            data-responsive-input={spec.id}
          />
        ) : null}

        {spec.widget === 'size'
          ? (['hug', 'fill'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                title={kind === 'hug' ? c.hugTitle : c.fillTitle}
                onClick={() => studio.setResponsiveValue(ids, bp, spec.id, kind)}
                className={cn('pp-segBtn', value === kind ? 'pp-segOn' : 'pp-segOffQuiet')}
                data-responsive-size-kind={`${spec.id}:${kind}`}
              >
                {kind === 'hug' ? 'H' : 'F'}
              </button>
            ))
          : null}

        <span className="pp-mono11truncate" data-responsive-channel={spec.id}>
          {c.channelRowReadout(labelOf(spec, value), designOf(spec))}
          {spec.group === 'size' ? ` (${spec.key})` : ''}
        </span>

        {hasOverride(spec.id) ? (
          <button
            type="button"
            onClick={() => studio.clearResponsiveChannel(ids, bp, spec.id)}
            className="pp-linkDanger"
            title={c.clearTierChannelTitle(channelLabel(spec, locale))}
            data-responsive-clear={spec.id}
          >
            ×
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="pp-col2" data-responsive-editor data-responsive-breakpoint={bp}>
      <p className="pp-faint11">
        {c.bpLead}
        {c.bpLead2}
      </p>

      <div className="pp-wrap1" data-responsive-breakpoints>
        {viewportOptions(locale).map((option) => {
          const optionImpact = impactOf(option.id);
          const on = option.id === bp;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => pickBreakpoint(option.id)}
              className={cn('pp-segWide', on ? 'pp-segOn' : 'pp-segOff')}
              data-breakpoint-tab={option.id}
              data-breakpoint-impact={optionImpact === MIXED ? 'mixed' : optionImpact}
              aria-pressed={on}
            >
              {option.label}
              {optionImpact === MIXED ? c.mixedParen : optionImpact > 0 ? c.changesCount(optionImpact) : ''}
            </button>
          );
        })}
        {state.viewport !== 'design' ? (
          <button
            type="button"
            onClick={() => studio.setViewport('design')}
            className="pp-chip11hover"
            data-responsive-back-to-design
          >
            {c.backToDesign}
          </button>
        ) : null}
      </div>

      <p className="pp-ink12" data-responsive-reading>
        {c.tierReadPrefix(viewportOptions(locale).find((o) => o.id === bp)?.label ?? bp)}
        {impact === MIXED
          ? c.impactMixed(nodes.length)
          : impact > 0
            ? `${c.impactChanged(impact)}${hasAnyRule ? '' : c.impactInheritedSuffix}`
            : hasAnyRule
              ? c.impactNoOp
              : c.noRules}
        {state.viewport === 'design' ? c.canvasShownDesign : c.canvasShownTier(breakpointLabel(state.viewport as BreakpointName, locale))}
      </p>

      {outsideOf === MIXED ? (
        <p className="pp-faint11" data-responsive-outside="mixed">
          {c.outsideMixed}
          {c.outsideMixedTail}
        </p>
      ) : outsideOf.length ? (
        <p className="pp-mono11" data-responsive-outside={String(outsideOf.length)}>
          {c.outsideSome(outsideOf.length, outsideOf.join(' · '))}
        </p>
      ) : null}

      {specs.map(renderChannelRow)}

      <button
        type="button"
        disabled={!hasAnyRule}
        onClick={() => studio.dropResponsiveRule(ids, bp)}
        className={cn('pp-ghostBtn', hasAnyRule ? 'pp-ghostDangerReady' : 'pp-ghostIdle')}
        data-responsive-drop-rule={bp}
      >
        {c.clearTierAll(viewportOptions(locale).find((o) => o.id === bp)?.label.split(' ')[0] ?? bp)}
      </button>
    </div>
  );
}

/**
 * §124 交互状态编辑器（ADR-0062「下一片的事」）：状态补丁从此不只有代码视图一个入口。
 *
 * 画布不预览状态（编辑面 hover 会干扰选择与拖拽，ADR-0062）——这里只把补丁写进模型，
 * 移上指针的效果去预览或发布页看。面板上说清这件事，不让人以为改了没生效（§159）。
 * 每个通道一次写入 = 一个可撤销事务（§149）；整通道替换，"清除"即写空数组，
 * 由生成器发射重置类（hover:bg-none 等，ADR-0062）。
 */
function StateEditor({
  node,
  write,
  tokens,
  mode,
  colorTokens,
  locale,
}: {
  node: DesignNode;
  write: (path: string, value: unknown) => void;
  tokens: ReturnType<typeof useStudio>['tokens'];
  mode: string | null;
  colorTokens: Token[];
  locale: Locale;
}) {
  const [active, setActive] = useState<NodeState>('hover');
  const c = COPY[locale];
  // 颜色输入沿用 FillList 的草稿+失焦提交：拖动取色轮不产生一串可撤销事务
  const [drafts, setDrafts] = useState<{ fill?: string; stroke?: string; shadow?: string }>({});
  const { statesClipboard } = useStudio();
  const patch = node.states?.[active];
  const isText = node.type === 'text';
  const solid = patch?.fills?.find((p) => p.kind === 'solid' && p.visible !== false);
  const fillColor = solid && solid.kind === 'solid' ? solid.color : undefined;
  const stroke = (patch?.strokes ?? []).find((s) => s.visible !== false);
  const strokeSolid = stroke?.paints.find((p) => p.kind === 'solid' && p.visible !== false);
  const strokeColor = strokeSolid && strokeSolid.kind === 'solid' ? strokeSolid.color : undefined;
  const shadow = (patch?.effects ?? []).find((e) => e.kind === 'drop-shadow' || e.kind === 'inner-shadow');
  const shadowColor = shadow && 'color' in shadow ? shadow.color : undefined;
  const hexOf = (value: ColorValue | undefined): string => {
    const hex = resolveColor(value, tokens, mode);
    return /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000';
  };

  const setFills = (color: ColorValue) => write(`states.${active}.fills`, [{ kind: 'solid', color }]);
  const setStroke = (width: number, color: ColorValue) =>
    write(`states.${active}.strokes`, [{ paints: [{ kind: 'solid', color }], width, position: 'inside' }]);
  const setShadow = (params: { offsetX: number; offsetY: number; blur: number; spread: number; color: ColorValue }) =>
    write(`states.${active}.effects`, [{ kind: 'drop-shadow', ...params }]);
  const clearOpacity = () => {
    const next = { ...(node.states ?? {}) };
    const current = { ...(next[active] ?? {}) };
    delete current.opacity;
    next[active] = current;
    write('states', next);
  };
  const dropState = () => {
    const next = { ...(node.states ?? {}) };
    delete next[active];
    write('states', next);
  };

  return (
    <div className="pp-col2">
      <div className="pp-wrap1">
        {NODE_STATES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setActive(s);
              setDrafts({});
            }}
            className={cn('pp-segWide', s === active ? 'pp-segOn' : 'pp-segOff')}
            data-state-tab={s}
          >
            {stateLabel(s, locale)}
          </button>
        ))}
      </div>
      <p className="pp-faint11">{c.noText}</p>

      <div className="pp-wrapCenter1">
        <button
          type="button"
          onClick={() => studio.copyStates(node.id, active)}
          disabled={!patch || !Object.keys(patch).length}
          title={patch && Object.keys(patch).length ? c.copyPatchTitleReady(stateLabel(active, locale)) : c.copyPatchTitleEmpty(stateLabel(active, locale))}
          className={cn('pp-ghostBtnSm', patch && Object.keys(patch).length ? 'pp-ghostReady' : 'pp-ghostIdle')}
          data-state-copy={active}
        >
          {c.copyPatchButton(stateLabel(active, locale))}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!statesClipboard) return;
            studio.pasteStates([node.id]);
            setActive(statesClipboard.state);
            setDrafts({});
          }}
          disabled={!statesClipboard}
          title={
            statesClipboard
              ? c.pastePatchTitleReady(statesClipboard.sourceName, stateLabel(statesClipboard.state, locale))
              : c.pastePatchTitleEmpty
          }
          className={cn('pp-ghostBtnSm', statesClipboard ? 'pp-ghostReady' : 'pp-ghostIdle')}
          data-state-paste="single"
        >
          {c.pastePatchButton(statesClipboard ? stateLabel(statesClipboard.state, locale) : undefined)}
        </button>
      </div>
      {statesClipboard ? (
        <p className="pp-faint11" data-states-clipboard-note>
          {c.clipboardNoteFull(statesClipboard.sourceName, stateLabel(statesClipboard.state, locale))}
        </p>
      ) : null}

      <div className="pp-flex2">
        <span className="pp-rowKey14">{isText ? c.fontColorLabel : c.backgroundLabel}</span>
        <input
          type="color"
          value={drafts.fill ?? hexOf(fillColor)}
          onChange={(e) => setDrafts({ ...drafts, fill: e.target.value })}
          onBlur={() => {
            if (drafts.fill) setFills(drafts.fill);
            setDrafts({ ...drafts, fill: undefined });
          }}
          className="pp-swatchBtn"
          aria-label={c.bgAria(stateLabel(active, locale))}
          data-state-fill={active}
        />
        <span className="pp-mono11truncate">{fillColor === undefined ? c.notSet : typeof fillColor === 'string' ? fillColor : resolveColor(fillColor, tokens, mode)}</span>
        <span data-state-fill-bind={active}>
          <TokenBindButton active={isTokenRef(fillColor)} tokens={colorTokens} onPick={(key) => setFills(makeTokenRef(key))} locale={locale} />
        </span>
        <button type="button" onClick={() => write(`states.${active}.fills`, [])} className="pp-linkDanger" title={c.clearChannelTitle} data-state-fill-clear={active}>
          ×
        </button>
      </div>

      <div className="pp-flex2">
        <span className="pp-rowKey14">{c.strokeLabel}</span>
        <input
          type="number"
          min={0}
          step={0.5}
          value={stroke?.width ?? 1}
          onChange={(e) => setStroke(Number(e.target.value), (strokeColor ?? '#ffffff') as ColorValue)}
          onKeyDown={(e) => e.stopPropagation()}
          className="pp-w16Input"
          aria-label={c.strokeWidthAria(stateLabel(active, locale))}
          data-state-stroke-width={active}
        />
        <input
          type="color"
          value={drafts.stroke ?? hexOf(strokeColor)}
          onChange={(e) => setDrafts({ ...drafts, stroke: e.target.value })}
          onBlur={() => {
            if (drafts.stroke) setStroke(stroke?.width ?? 1, drafts.stroke);
            setDrafts({ ...drafts, stroke: undefined });
          }}
          className="pp-swatchBtn"
          aria-label={c.strokeColorAria(stateLabel(active, locale))}
          data-state-stroke-color={active}
        />
        <button type="button" onClick={() => write(`states.${active}.strokes`, [])} className="pp-linkDanger" title={c.clearStrokeTitle} data-state-stroke-clear={active}>
          ×
        </button>
      </div>

      <div className="pp-grid2gap1">
        <NumberField
          label={c.shadowX}
          locale={locale}
          value={shadow && 'offsetX' in shadow ? shadow.offsetX ?? 0 : 0}
          onSet={(v) => setShadow({ offsetX: v, offsetY: shadow && 'offsetY' in shadow ? shadow.offsetY ?? 0 : 0, blur: shadow && 'blur' in shadow ? shadow.blur ?? 0 : 0, spread: shadow && 'spread' in shadow ? shadow.spread ?? 0 : 0, color: (shadowColor ?? '#000000') as ColorValue })}
        />
        <NumberField
          label={c.shadowY}
          locale={locale}
          value={shadow && 'offsetY' in shadow ? shadow.offsetY ?? 0 : 0}
          onSet={(v) => setShadow({ offsetX: shadow && 'offsetX' in shadow ? shadow.offsetX ?? 0 : 0, offsetY: v, blur: shadow && 'blur' in shadow ? shadow.blur ?? 0 : 0, spread: shadow && 'spread' in shadow ? shadow.spread ?? 0 : 0, color: (shadowColor ?? '#000000') as ColorValue })}
        />
        <NumberField
          label={c.blur}
          locale={locale}
          value={shadow && 'blur' in shadow ? shadow.blur ?? 0 : 0}
          onSet={(v) => setShadow({ offsetX: shadow && 'offsetX' in shadow ? shadow.offsetX ?? 0 : 0, offsetY: shadow && 'offsetY' in shadow ? shadow.offsetY ?? 0 : 0, blur: v, spread: shadow && 'spread' in shadow ? shadow.spread ?? 0 : 0, color: (shadowColor ?? '#000000') as ColorValue })}
        />
        <NumberField
          label={c.spread}
          locale={locale}
          value={shadow && 'spread' in shadow ? shadow.spread ?? 0 : 0}
          onSet={(v) => setShadow({ offsetX: shadow && 'offsetX' in shadow ? shadow.offsetX ?? 0 : 0, offsetY: shadow && 'offsetY' in shadow ? shadow.offsetY ?? 0 : 0, blur: shadow && 'blur' in shadow ? shadow.blur ?? 0 : 0, spread: v, color: (shadowColor ?? '#000000') as ColorValue })}
        />
      </div>
      <div className="pp-flex2">
        <span className="pp-rowKey14">{c.shadowColorLabel}</span>
        <input
          type="color"
          value={drafts.shadow ?? hexOf(shadowColor)}
          onChange={(e) => setDrafts({ ...drafts, shadow: e.target.value })}
          onBlur={() => {
            if (drafts.shadow) setShadow({ offsetX: shadow && 'offsetX' in shadow ? shadow.offsetX ?? 0 : 0, offsetY: shadow && 'offsetY' in shadow ? shadow.offsetY ?? 0 : 0, blur: shadow && 'blur' in shadow ? shadow.blur ?? 0 : 0, spread: shadow && 'spread' in shadow ? shadow.spread ?? 0 : 0, color: drafts.shadow });
            setDrafts({ ...drafts, shadow: undefined });
          }}
          className="pp-swatchBtn"
          aria-label={c.shadowColorAria(stateLabel(active, locale))}
          data-state-shadow-color={active}
        />
        <button type="button" onClick={() => write(`states.${active}.effects`, [])} className="pp-linkDanger" title={c.clearEffectsTitle} data-state-effects-clear={active}>
          ×
        </button>
      </div>

      <div className="pp-flex2">
        <span className="pp-rowKey14">{c.opacityLabel}</span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={patch?.opacity ?? node.style.opacity}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) write(`states.${active}.opacity`, Math.min(1, Math.max(0, next)));
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className="pp-w20Input"
          aria-label={c.opacityAria(stateLabel(active, locale))}
          data-state-opacity={active}
        />
        <button type="button" onClick={clearOpacity} className="pp-linkDanger" title={c.clearOpacityTitle} data-state-opacity-clear={active}>
          ×
        </button>
      </div>

      <button
        type="button"
        onClick={dropState}
        className="pp-dangerOutline"
        data-state-drop={active}
      >
        {c.dropStateTitle(stateLabel(active, locale))}
      </button>
    </div>
  );
}

function NodeNameField({ node, locale }: { node: DesignNode; locale: Locale }) {
  const [value, setValue] = useState(node.name);
  const c = COPY[locale];
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value.trim() && value !== node.name && studio.rename(node.id, value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className="pp-mt1Input13"
      aria-label={c.nodeNameAria}
      data-prop="name"
    />
  );
}

function PageProperties({ locale }: { locale: Locale }) {
  const state = useStudioReady();
  const c = COPY[locale];
  const page = state.page;
  if (!page) return null;
  const usedTokens = state.document.tokens.length;
  const root = state.layout.nodes[state.layout.rootId];
  const rw = root ? Math.round(root.width) : page.width;
  const rh = root ? Math.round(root.height) : page.height;
  const responsive = rw !== page.width || rh !== page.height;
  return (
    <div className="pp-emptyCol">
      <Section title={c.secPageTitle}>
        <p className="pp-ink12">{page.name}</p>
        <p className="pp-faintTop12">
          {page.width} × {page.height} · {c.pageNodes(Object.keys(page.nodes).length)}
        </p>
        {responsive ? (
          <p className="pp-faintTop12" data-page-resolved-size>
            {c.resolvedSize(state.viewport, rw, rh)}
          </p>
        ) : null}
        {state.viewport !== 'design' ? (
          <p className="pp-faintTop12" data-page-root-width-from-breakpoint>
            {c.breakpointRootNote(rw, page.width, page.height)}
          </p>
        ) : null}
      </Section>
      <Section title={c.secDesignSystemTitle}>
        <p className="pp-faint12">
          {c.dsCounts(usedTokens, state.document.components.length, state.document.assets.length)}
        </p>
        <p className="pp-faintMt2">{c.dsSelectionHint}</p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pp-headBorderedRoomy">
      <h3 className="pp-sectionTitle">{title}</h3>
      <div className="pp-col2">{children}</div>
    </section>
  );
}

interface FieldProps<T> {
  label: string;
  value: T | typeof MIXED;
  onSet: (value: T) => void;
  disabled?: boolean;
  hint?: string;
  locale: Locale;
}

function NumberField(
  props: FieldProps<number> & {
    step?: number;
    bind?: { types: Token['type'][]; path: string; write: (path: string, value: unknown) => void };
    read?: (path: string) => unknown;
    tokens?: Token[];
  },
) {
  const { value, onSet, bind, read, tokens, label, disabled, hint, step = 1, locale } = props;
  const c = COPY[locale];
  const path = bind?.path;
  const boundKey = path && read ? (isTokenRef(read(path)) ? tokenRefKey(read(path)) : null) : null;
  return (
    <label className="pp-col1" title={hint}>
      <span className="pp-row1faint">
        {label}
        {boundKey ? <span className="pp-codeChip">{boundKey}</span> : null}
      </span>
      <span className="pp-row1">
        <input
          type="number"
          step={step}
          disabled={disabled}
          value={value === MIXED ? '' : Number.isFinite(Number(value)) ? Number(value) : ''}
          placeholder={value === MIXED ? c.mixedLabel : undefined}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) onSet(next);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className="pp-wfullInput12"
          data-prop={path ?? label}
        />
        {bind && tokens ? <TokenBindButton active={Boolean(boundKey)} tokens={tokens} onPick={(key) => bind.write(bind.path, makeTokenRef(key))} locale={locale} /> : null}
      </span>
    </label>
  );
}

function TextField(props: FieldProps<string> & { textarea?: boolean }) {
  const { label, value, onSet, textarea, disabled } = props;
  const cls = 'pp-wfullInput12';
  return (
    <label className="pp-col1">
      <span className="pp-faint12">{label}</span>
      {textarea ? (
        <textarea
          rows={3}
          disabled={disabled}
          value={value === MIXED ? '' : (value ?? '')}
          onChange={(e) => onSet(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          className={cn(cls, 'pp-resizeNone')}
          data-prop="text"
        />
      ) : (
        <input
          disabled={disabled}
          value={value === MIXED ? '' : (value ?? '')}
          onChange={(e) => onSet(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          className={cls}
        />
      )}
    </label>
  );
}

function SelectField(props: FieldProps<string> & { options: { value: string; label: string }[] }) {
  const { label, value, options, onSet, disabled, locale } = props;
  const c = COPY[locale];
  return (
    <label className="pp-col1">
      <span className="pp-faint12">{label}</span>
      <select
        disabled={disabled}
        value={value === MIXED ? '' : value}
        onChange={(e) => onSet(e.target.value)}
        className="pp-chip12"
        data-prop={label}
      >
        {value === MIXED ? <option value="">{c.mixedLabel}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SizeField(props: {
  label: string;
  axis: 'width' | 'height';
  value: number | 'hug' | 'fill' | typeof MIXED;
  mixed: boolean;
  onSet: (value: number | 'hug' | 'fill') => void;
  locale: Locale;
}) {
  const { label, value, onSet, axis, locale } = props;
  const c = COPY[locale];
  const numeric = typeof value === 'number';
  return (
    <label className="pp-col1">
      <span className="pp-faint12">{label}</span>
      <span className="pp-row1">
        <input
          type="number"
          value={numeric ? value : ''}
          placeholder={value === MIXED ? c.mixedLabel : typeof value === 'string' ? value : undefined}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) onSet(next);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className="pp-wfullInput12"
          data-prop={`size.${axis}`}
        />
        <button type="button" title={c.hugTitle} onClick={() => onSet('hug')} className={cn('pp-segBtn', value === 'hug' ? 'pp-segOn' : 'pp-segOffQuiet')}>
          H
        </button>
        <button type="button" title={c.fillTitle} onClick={() => onSet('fill')} className={cn('pp-segBtn', value === 'fill' ? 'pp-segOn' : 'pp-segOffQuiet')}>
          F
        </button>
      </span>
    </label>
  );
}

function CheckField({ label, checked, onSet }: { label: string; checked: boolean; onSet: (v: boolean) => void }) {
  return (
    <label className="pp-row2ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onSet(e.target.checked)}
        className="pp-checkBrand"
      />
      {label}
    </label>
  );
}

function PaddingGrid(props: {
  read: (path: string) => unknown;
  write: (path: string, value: unknown) => void;
  tokens: Token[];
  locale: Locale;
}) {
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  return (
    <div className="pp-grid4">
      {sides.map((side) => (
        <NumberField
          key={side}
          label={side[0]!.toUpperCase()}
          value={(props.read(`layout.padding.${side}`) as number) ?? 0}
          onSet={(v) => props.write(`layout.padding.${side}`, v)}
          read={props.read}
          tokens={props.tokens}
          locale={props.locale}
          bind={{ types: ['dimension', 'number'], path: `layout.padding.${side}`, write: props.write }}
        />
      ))}
    </div>
  );
}

function FillList(props: {
  nodes: DesignNode[];
  read: (path: string) => unknown;
  write: (path: string, value: unknown) => void;
  tokens: ReturnType<typeof useStudio>['tokens'];
  mode: string | null;
  colorTokens: Token[];
  locale: Locale;
}) {
  const { nodes, read, write, colorTokens, locale } = props;
  const c = COPY[locale];
  const { assetError, assetNotice, assetContext } = useStudio();
  const fills = (nodes[0]?.style.fills ?? []).slice(0, 3);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const removeAt = (index: number) =>
    write('style.fills', nodes[0]!.style.fills.filter((_, i) => i !== index));

  const body = !fills.length ? (
    <span className="pp-faint12">{c.noFills}</span>
  ) : (
    fills.map((paint, index) => {
      if (paint.kind === 'image') {
        const url = assetContext.assetUrl(paint.assetId);
        return (
          <div key={index} className="pp-col1" data-fill-image={index}>
            <div className="pp-flex2">
              <span className="pp-swatchSlot">
                {url ? (
                  <img src={url} alt="" className="pp-cover" />
                ) : (
                  <span className="pp-micro">?</span>
                )}
              </span>
              <span className="pp-mono11truncate">
                {url ? c.imageAsset(paint.assetId.slice(0, 8)) : c.imageAssetMissing}
              </span>
              <select
                value={paint.fit ?? 'cover'}
                onChange={(e) => write(`style.fills.${index}.fit`, e.target.value)}
                aria-label={c.imageFitAria}
                className="pp-smallChipPlain"
                data-fill-fit={index}
              >
                {c.fits.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => removeAt(index)} className="pp-linkDanger" title={c.removeFillTitle}>
                ×
              </button>
            </div>
            <div className="pp-padL10">
              <ImageUploadButton nodeId={nodes[0]!.id} label={c.uploadImageShort} busy={c.uploadBusy} />
            </div>
          </div>
        );
      }
      const path = `style.fills.${index}.color`;
      const current = read(path);
      const bound = isTokenRef(current) ? tokenRefKey(current) : null;
      // 交给 resolveColor 的是原值（带花括号的引用），不是剥掉花括号的裸 key：
      // resolveValue 只认 `{a.b}` 形态，喂裸 key 它原样返回，色标会永远显示成黑的。
      const hex = resolveColor(current as ColorValue | undefined, props.tokens, props.mode);
      const value = draft[index] ?? (typeof current === 'string' ? current : hex);
      return (
        <div key={index} className="pp-flex2">
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000'}
            onChange={(e) => {
              setDraft({ ...draft, [index]: e.target.value });
            }}
            onBlur={() => {
              const next = draft[index];
              if (next) write(path, next);
              setDraft({ ...draft, [index]: '' });
            }}
            className="pp-swatchBtn"
            aria-label={c.layerFillAria(index + 1)}
            data-prop={path}
          />
          <span className="pp-mono11truncate">{bound ? `{${bound}}` : value}</span>
          <TokenBindButton active={Boolean(bound)} tokens={colorTokens} onPick={(key) => write(path, makeTokenRef(key))} locale={locale} />
          <button
            type="button"
            onClick={() => removeAt(index)}
            className="pp-linkDanger"
            title={c.removeFillTitle}
          >
            ×
          </button>
        </div>
      );
    })
  );

  return (
    <div className="pp-col2">
      {body}
      <div className="pp-flex2">
        <button
          type="button"
          onClick={() => write('style.fills', [{ kind: 'solid', color: '#8b5cf6' }, ...((nodes[0]?.style.fills as unknown[]) ?? [])])}
          className="pp-chip12ink"
        >
          {c.addColor}
        </button>
        <ImageUploadButton nodeId={nodes[0]!.id} label={c.addImage} busy={c.uploadBusy} />
      </div>
      {assetError ? (
        <p className="pp-chipDanger" data-asset-error>
          {assetError}
        </p>
      ) : null}
      {assetNotice && !assetError ? (
        <p className="pp-chip11" data-asset-notice>
          {assetNotice}
        </p>
      ) : null}
    </div>
  );
}

function TokenBindButton({ active, tokens, onPick, locale }: { active: boolean; tokens: Token[]; onPick: (key: string) => void; locale: Locale }) {
  const [open, setOpen] = useState(false);
  const c = COPY[locale];
  return (
    <span className="pp-rel">
      <button
        type="button"
        title={c.bindTokenTitle}
        onClick={() => setOpen((v) => !v)}
        className={cn('pp-segBtn', active ? 'pp-segOn' : 'pp-segOff')}
        data-token-bind
      >
       {c.bindGlyph}
      </button>
      {open ? (
        <span className="pp-popMenu">
          {tokens.length ? (
            tokens.map((token) => (
              <button
                key={token.key}
                type="button"
                onClick={() => {
                  onPick(token.key);
                  setOpen(false);
                }}
                className="pp-menuItemFull"
              >
                {token.key}
              </button>
            ))
          ) : (
            <span className="pp-menuItem12">{c.noMatchingTokens}</span>
          )}
        </span>
      ) : null}
    </span>
  );
}

function AlignMenu({ onAlign, disabled, locale }: { onAlign: (edge: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => void; disabled: boolean; locale: Locale }) {
  const c = COPY[locale];
  const items = c.alignItems as readonly { id: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'; short: string; full: string }[];
  return (
    <span className={cn('pp-grow', disabled && 'pp-dim')}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={disabled}
          title={c.alignTitle(item.full)}
          onClick={() => onAlign(item.id)}
          className="pp-smallChip"
        >
          {item.short}
        </button>
      ))}
    </span>
  );
}
