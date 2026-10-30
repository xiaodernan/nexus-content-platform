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
  type Paint,
  type Token,
} from '@nexus/design-model';
import { cn } from '@/lib/cn';
import { resolveColor } from './render';
import { STATE_LABELS } from './state-labels';
import {
  VIEWPORT_OPTIONS,
} from './viewer-params';
import {
  designValueOf,
  hasResponsiveRule,
  responsiveChannelsOf,
  responsiveImpactDetailOf,
  responsiveImpactOf,
  projectedValueOf,
  type ResponsiveChannel,
} from './responsive-editor';
import { studio, useStudio, useStudioReady } from './store';

const FITS: { value: NonNullable<Extract<Paint, { kind: 'image' }>['fit']>; label: string }[] = [
  { value: 'cover', label: '覆盖' },
  { value: 'contain', label: '包含' },
  { value: 'fill', label: '拉伸' },
  { value: 'tile', label: '平铺' },
];

/** 触发一次图片上传的文件选择器：选中即走 studio 的上传事务，选完清空以便重选同一文件 */
function ImageUploadButton({ nodeId, label }: { nodeId: string; label: string }) {
  const { assetBusy } = useStudio();
  return (
    <label
      className={cn(
        'shrink-0 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12 text-fg-2',
        assetBusy ? 'cursor-wait opacity-50' : 'cursor-pointer hover:bg-bg-3',
      )}
      data-asset-upload={nodeId}
    >
      {assetBusy ? '上传中…' : label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
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

const LAYOUT_MODES = [
  { value: 'none', label: '绝对定位' },
  { value: 'vertical', label: '纵向自动布局' },
  { value: 'horizontal', label: '横向自动布局' },
  { value: 'grid', label: '网格' },
  { value: 'wrap', label: '换行' },
  { value: 'stack', label: '堆叠' },
] as const;

const MIXED = Symbol('mixed');

/** §6 右面板：选中元素的属性分区，每个字段可绑定 token */
export function PropertiesPanel() {
  const state = useStudioReady();
  const page = state.page;
  const ids = state.selection;

  if (!page) return null;

  if (!ids.length) return <PageProperties />;

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
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <div className="border-b border-[var(--nexus-color-border-subtle)] px-[var(--nexus-space-3)] py-[var(--nexus-space-2)]">
        <p className="text-12 text-fg-3">{nodes.length > 1 ? `${nodes.length} 个元素（属性写入将广播到全部选中）` : `${nodes[0]!.type} · ${nodes[0]!.name}`}</p>
        {nodes.length === 1 ? (
          <NodeNameField key={nodes[0]!.id} node={nodes[0]!} />
        ) : null}
      </div>

      <Section title="尺寸与位置">
        <div className="grid grid-cols-2 gap-[var(--nexus-space-2)]">
          <SizeField label="宽" axis="width" value={read<number | 'hug' | 'fill'>('size.width')} mixed={read('size.width') === MIXED} onSet={(v) => write('size.width', v)} />
          <SizeField label="高" axis="height" value={read<number | 'hug' | 'fill'>('size.height')} mixed={read('size.height') === MIXED} onSet={(v) => write('size.height', v)} />
          <NumberField label="X" value={read<number>('position.x')} onSet={(v) => write('position.x', v)} disabled={!nodes.every((n) => studio.canFreeMove(n.id))} hint="父级为自动布局时位置由布局决定" />
          <NumberField label="Y" value={read<number>('position.y')} onSet={(v) => write('position.y', v)} disabled={!nodes.every((n) => studio.canFreeMove(n.id))} />
        </div>
      </Section>

      <Section title="布局">
        <SelectField
          label="模式"
          value={read<string>('layout.mode')}
          options={LAYOUT_MODES.map((m) => ({ value: m.value, label: m.label }))}
          onSet={(v) => write('layout.mode', v)}
        />
        <div className="grid grid-cols-2 gap-[var(--nexus-space-2)]">
          <NumberField label="间距" value={read<number>('layout.gap')} onSet={(v) => write('layout.gap', v)} bind={{ types: ['dimension', 'number'], path: 'layout.gap', write }} read={read} tokens={tokensOfType(['dimension', 'number'])} />
          {read<string>('layout.mode') === 'grid' ? (
            <NumberField label="列数" value={read<number>('layout.columns')} onSet={(v) => write('layout.columns', Math.max(1, Math.round(v)))} />
          ) : null}
        </div>
        <PaddingGrid read={read} write={write} tokens={tokensOfType(['dimension', 'number'])} />
        <div className="grid grid-cols-2 gap-[var(--nexus-space-2)]">
          <SelectField
            label="主轴"
            value={read<string>('layout.justify')}
            options={['start', 'center', 'end', 'space-between', 'space-around', 'space-evenly'].map((v) => ({ value: v, label: v }))}
            onSet={(v) => write('layout.justify', v)}
          />
          <SelectField
            label="交叉轴"
            value={read<string>('layout.items')}
            options={['start', 'center', 'end', 'stretch', 'baseline'].map((v) => ({ value: v, label: v }))}
            onSet={(v) => write('layout.items', v)}
          />
        </div>
        <CheckField label="裁剪超出内容" checked={read<boolean>('layout.clipContent') === true} onSet={(v) => write('layout.clipContent', v)} />
      </Section>

      {nodes.some((n) => n.typography) ? (
        <Section title="文字">
          <TextField label="内容" value={read<string>('text')} onSet={(v) => write('text', v)} textarea />
          <div className="grid grid-cols-2 gap-[var(--nexus-space-2)]">
            <NumberField label="字号" value={read<number>('typography.fontSize')} onSet={(v) => write('typography.fontSize', v)} bind={{ types: ['dimension', 'number'], path: 'typography.fontSize', write }} read={read} tokens={tokensOfType(['dimension', 'number'])} />
            <NumberField label="字重" value={read<number>('typography.fontWeight')} onSet={(v) => write('typography.fontWeight', v)} />
            <NumberField label="行高" value={read<number>('typography.lineHeight')} step={0.1} onSet={(v) => write('typography.lineHeight', v)} />
            <NumberField label="字距" value={read<number>('typography.letterSpacing')} step={0.1} onSet={(v) => write('typography.letterSpacing', v)} />
          </div>
          <SelectField
            label="对齐"
            value={read<string>('typography.align')}
            options={['left', 'center', 'right', 'justify'].map((v) => ({ value: v, label: v }))}
            onSet={(v) => write('typography.align', v)}
          />
          <SelectField
            label="字体"
            value={read<string>('typography.fontFamily')}
            options={[...tokensOfType(['fontFamily']).map((t) => ({ value: makeTokenRef(t.key), label: t.key })), { value: 'Inter, sans-serif', label: 'Inter' }]}
            onSet={(v) => write('typography.fontFamily', v)}
          />
          {nodes.some((n) => n.type === 'button' || n.type === 'input') ? (
            <SelectField
              label="字色"
              value={read<string>('typography.color') ?? ''}
              options={tokensOfType(['color']).map((t) => ({ value: makeTokenRef(t.key), label: t.key }))}
              onSet={(v) => write('typography.color', v)}
            />
          ) : null}
          <SelectField
            label="换行"
            value={read<string>('style.textWrap')}
            options={['wrap', 'nowrap', 'truncate', 'truncate-2', 'truncate-3'].map((v) => ({ value: v, label: v }))}
            onSet={(v) => write('style.textWrap', v)}
          />
        </Section>
      ) : null}

      <Section title="填充与描边">
        <FillList nodes={nodes} read={read} write={write} tokens={state.tokens} mode={state.activeMode} colorTokens={tokensOfType(['color'])} />
        <div className="grid grid-cols-2 gap-[var(--nexus-space-2)]">
          <NumberField label="圆角" value={read<number>('style.cornerRadius.topLeft')} onSet={(v) => studio.setProps(ids, 'style.cornerRadius', { topLeft: v, topRight: v, bottomRight: v, bottomLeft: v })} bind={{ types: ['dimension', 'number'], path: 'style.cornerRadius.topLeft', write }} read={read} tokens={tokensOfType(['dimension', 'number'])} />
          <NumberField label="描边" value={read<number>('style.strokes.0.width')} onSet={(v) => write('style.strokes.0.width', v)} />
        </div>
      </Section>

      <Section title="效果">
        <div className="grid grid-cols-2 gap-[var(--nexus-space-2)]">
          <NumberField label="透明度" value={read<number>('style.opacity')} step={0.05} onSet={(v) => write('style.opacity', Math.min(1, Math.max(0, v)))} />
          <NumberField label="旋转" value={read<number>('style.rotation')} onSet={(v) => write('style.rotation', v)} />
        </div>
        <SelectField
          label="光标"
          value={read<string>('style.cursor')}
          options={['default', 'pointer', 'text', 'grab'].map((v) => ({ value: v, label: v }))}
          onSet={(v) => write('style.cursor', v)}
        />
      </Section>

      <Section title="交互状态（§124）">
        {nodes.length === 1 ? (
          <StateEditor node={nodes[0]!} write={write} tokens={state.tokens} mode={state.activeMode} colorTokens={tokensOfType(['color'])} />
        ) : (
          <div className="flex flex-col gap-[var(--nexus-space-2)]">
            <p className="text-12 text-fg-3">
              多选时不做逐通道编辑：在一个元素上复制状态补丁，再整份贴给选中的 {nodes.length} 个元素（一次事务，撤销一次全回去）。
            </p>
            {state.statesClipboard ? (
              <p className="text-11 text-fg-3" data-states-clipboard-note>
                剪贴板：{state.statesClipboard.sourceName} 的「{STATE_LABELS[state.statesClipboard.state]}」补丁
              </p>
            ) : (
              <p className="text-11 text-fg-3" data-states-clipboard-empty>
                剪贴板为空：先单选一个已有状态补丁的元素，点「复制」。
              </p>
            )}
            <button
              type="button"
              disabled={!state.statesClipboard}
              onClick={() => {
                if (state.statesClipboard) studio.pasteStates(nodes.map((n) => n.id));
              }}
              className={cn(
                'rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-12',
                state.statesClipboard ? 'text-fg-2 hover:bg-bg-2' : 'cursor-not-allowed text-fg-3 opacity-50',
              )}
              data-state-paste-batch={nodes.length}
            >
              {state.statesClipboard
                ? `粘贴「${STATE_LABELS[state.statesClipboard.state]}」补丁到 ${nodes.length} 个元素`
                : '粘贴到选中元素'}
            </button>
          </div>
        )}
      </Section>

      <Section title="断点（§14）">
        <ResponsiveSection nodes={nodes} />
      </Section>

      <Section title="状态">
        <div className="grid grid-cols-2 gap-[var(--nexus-space-2)]">
          {nodes.length === 1 ? (
            <>
              <CheckField label="可见" checked={nodes[0]!.visible} onSet={(v) => studio.setVisible(nodes[0]!.id, v)} />
              <CheckField label="锁定" checked={nodes[0]!.locked} onSet={(v) => studio.setLocked(nodes[0]!.id, v)} />
            </>
          ) : null}
        </div>
        <div className="mt-[var(--nexus-space-2)] flex gap-[var(--nexus-space-2)]">
          <button type="button" onClick={() => studio.deleteSelection()} className="flex-1 rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-12 text-danger-ink">
            删除
          </button>
          <AlignMenu onAlign={(edge) => studio.alignSelection(edge)} disabled={nodes.length < 2} />
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
 * 那条事实由 `packages/design-model/test/layout.test.ts` 的「视口宽度压过 modelRoot」钉住，
 * 界面上的披露在「页面」那一节（`PageProperties`）。
 */
function ResponsiveSection({ nodes }: { nodes: DesignNode[] }) {
  const state = useStudioReady();
  const [bp, setBp] = useState<BreakpointName>(() => (state.viewport === 'design' ? 'tablet' : state.viewport));
  // 数字输入走草稿+失焦提交：一路打字不该产生一路可撤销事务（与状态编辑器里的颜色同一口径）
  const [drafts, setDrafts] = useState<Record<string, string | undefined>>({});
  const ids = nodes.map((n) => n.id);

  const mixedOf = <T,>(pick: (node: DesignNode) => T): T | typeof MIXED => {
    const first = pick(nodes[0]!);
    return nodes.every((n) => JSON.stringify(pick(n)) === JSON.stringify(first)) ? first : MIXED;
  };
  const impactOf = (breakpoint: BreakpointName) => mixedOf((n) => responsiveImpactOf(n, breakpoint));
  const impact = impactOf(bp);
  /** 徽标数的是模型里所有组，面板只有四格输入口——差出来的那些键要说出来，不然"改 3 处"里
   *  有 2 处对着空白的行，作者会以为面板坏了（§159：界面说的话要跟画布/访客看得见的对得上） */
  const outsideOf = mixedOf((n) => responsiveImpactDetailOf(n, bp).outsidePanel);
  const hasAnyRule = nodes.some((n) => hasResponsiveRule(n, bp));

  const pickBreakpoint = (next: BreakpointName) => {
    setBp(next);
    setDrafts({});
    // 画布跟着编辑的那一档走：改完当场看得见，不必再去顶栏切一次
    studio.setViewport(next);
  };

  const commitNumber = (channel: ResponsiveChannel, key: string) => {
    const raw = drafts[key];
    setDrafts({ ...drafts, [key]: undefined });
    if (raw === undefined || raw.trim() === '') return;
    const next = Number(raw);
    if (Number.isFinite(next)) studio.setResponsiveValue(ids, bp, channel, next);
  };

  // 通道值可能是数字、关键字（hug/fill）、布尔，或**绑到 token 的引用对象**——
  // 显示一律 JSON 化，不做"数字才算数"的假设（那会把 token 绑定的尺寸读成 undefined）
  const rowValue = (channel: ResponsiveChannel): unknown =>
    mixedOf((n) => projectedValueOf(n, bp, channel) as never);

  const hasOverride = (channel: ResponsiveChannel) =>
    nodes.some((n) => responsiveChannelsOf(n, bp).includes(channel));

  const textOf = (value: unknown): string =>
    value === undefined ? '默认' : typeof value === 'string' ? value : JSON.stringify(value);
  /** 「设计」那一边的读数也要按多选算：两个节点的设计值不一样时说"混合"，
   *  而不是拿 `nodes[0]` 那个数冒充整批（§159：界面不能说出模型里没有的值） */
  const designOf = (channel: ResponsiveChannel): string => {
    const value = mixedOf((n) => designValueOf(n, channel) as never);
    return value === MIXED ? '混合' : textOf(value);
  };

  return (
    <div className="flex flex-col gap-[var(--nexus-space-2)]" data-responsive-editor data-responsive-breakpoint={bp}>
      <p className="text-11 text-fg-3">
        窄一档的规则会带到更宽的档（手机→全部、平板→桌面与宽屏）。写下去的每一个键都会真的改变那一档的投影：
        等于原值的写入会被剪掉，不占撤销栈。
      </p>

      <div className="flex flex-wrap gap-1" data-responsive-breakpoints>
        {VIEWPORT_OPTIONS.map((option) => {
          const optionImpact = impactOf(option.id);
          const on = option.id === bp;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => pickBreakpoint(option.id)}
              className={cn('rounded-[var(--nexus-radius-sm)] px-2 py-1 text-11', on ? 'bg-brand text-accent-fg' : 'bg-bg-2 text-fg-3 hover:text-fg-1')}
              data-breakpoint-tab={option.id}
              data-breakpoint-impact={optionImpact === MIXED ? 'mixed' : optionImpact}
              aria-pressed={on}
            >
              {option.label}
              {optionImpact === MIXED ? '（混合）' : optionImpact > 0 ? `（改 ${optionImpact} 处）` : ''}
            </button>
          );
        })}
        {state.viewport !== 'design' ? (
          <button
            type="button"
            onClick={() => studio.setViewport('design')}
            className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-11 text-fg-3 hover:text-fg-1"
            data-responsive-back-to-design
          >
            回设计尺寸
          </button>
        ) : null}
      </div>

      <p className="text-12 text-fg-2" data-responsive-reading>
        {VIEWPORT_OPTIONS.find((o) => o.id === bp)?.label} 这一档：
        {impact === MIXED
          ? `选中的 ${nodes.length} 个元素改的通道数不一致`
          : impact > 0
            ? `改 ${impact} 处投影${
                hasAnyRule ? '' : '（都来自更窄那一档的规则：这一档自己没有规则，清除键要等这一档写了才出现）'
              }`
            : hasAnyRule
              ? '这一档的规则一处投影都没改——它跟设计值和更窄档的继承撞上了（AI 配方或代码视图写进来的空覆盖，按下面那颗清掉）'
              : '还没有规则'}
        · 画布按{state.viewport === 'design' ? '设计尺寸（不在预览这一档）' : ` ${state.viewport} 档`}呈现
      </p>

      {outsideOf === MIXED ? (
        <p className="text-11 text-fg-3" data-responsive-outside="mixed">
          徽标里还有几个面板没有输入口的键，各元素不同——按下面那颗「清掉这一档」会连着它们一起删。
        </p>
      ) : outsideOf.length ? (
        <p className="font-mono text-11 text-fg-3" data-responsive-outside={String(outsideOf.length)}>
          其中 {outsideOf.length} 处面板没有输入口：{outsideOf.join(' · ')}——它们由「代码」那一节或 AI
          配方写进来，「清掉这一档」会连着它们一起删。
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-12 text-fg-2">显示</span>
        {(['visible', 'hidden'] as const).map((kind) => {
          const want = kind === 'visible';
          const current = rowValue('visible');
          return (
            <button
              key={kind}
              type="button"
              onClick={() => studio.setResponsiveValue(ids, bp, 'visible', want)}
              className={cn(
                'rounded-[var(--nexus-radius-sm)] px-2 py-1 text-11',
                current === want ? 'bg-brand text-accent-fg' : 'bg-bg-2 text-fg-3 hover:text-fg-1',
              )}
              data-responsive-visible={kind}
            >
              {want ? '显示' : '隐藏'}
            </button>
          );
        })}
        <span className="min-w-0 flex-1 truncate font-mono text-11 text-fg-3" data-responsive-channel="visible">
          {rowValue('visible') === MIXED ? '混合' : `这一档 ${rowValue('visible') ? '显示' : '隐藏'} · 设计 ${designOf('visible')}`}
        </span>
        {hasOverride('visible') ? (
          <button
            type="button"
            onClick={() => studio.clearResponsiveChannel(ids, bp, 'visible')}
            className="px-1 text-12 text-fg-3 hover:text-danger-ink"
            title="清除这一档的显示覆盖"
            data-responsive-clear="visible"
          >
            ×
          </button>
        ) : null}
      </div>

      {(['size.width', 'size.height'] as const).map((channel) => {
        const axis = channel === 'size.width' ? 'width' : 'height';
        const current = rowValue(channel);
        return (
          <div key={channel} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-12 text-fg-2">{channel === 'size.width' ? '宽' : '高'}</span>
            <input
              type="number"
              min={0}
              value={drafts[channel] ?? (typeof current === 'number' ? String(current) : '')}
              placeholder={current === MIXED ? '混合' : typeof current === 'string' ? current : '跟随'}
              onChange={(e) => setDrafts({ ...drafts, [channel]: e.target.value })}
              onBlur={() => commitNumber(channel, channel)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              className="w-20 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12"
              data-responsive-input={channel}
            />
            {(['hug', 'fill'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                title={kind === 'hug' ? 'hug：贴合内容' : 'fill：填满父级'}
                onClick={() => studio.setResponsiveValue(ids, bp, channel, kind)}
                className={cn(
                  'rounded-[var(--nexus-radius-sm)] px-[5px] py-1 text-11',
                  current === kind ? 'bg-brand text-accent-fg' : 'bg-bg-2 text-fg-3',
                )}
                data-responsive-size-kind={`${channel}:${kind}`}
              >
                {kind === 'hug' ? 'H' : 'F'}
              </button>
            ))}
            <span className="min-w-0 flex-1 truncate font-mono text-11 text-fg-3" data-responsive-channel={channel}>
              这一档 {current === MIXED ? '混合' : textOf(current)} · 设计 {designOf(channel)}
              {` (${axis})`}
            </span>
            {hasOverride(channel) ? (
              <button
                type="button"
                onClick={() => studio.clearResponsiveChannel(ids, bp, channel)}
                className="px-1 text-12 text-fg-3 hover:text-danger-ink"
                title={`清除这一档的${channel === 'size.width' ? '宽' : '高'}覆盖`}
                data-responsive-clear={channel}
              >
                ×
              </button>
            ) : null}
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-12 text-fg-2">透明度</span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={drafts.opacity ?? (typeof rowValue('style.opacity') === 'number' ? String(rowValue('style.opacity')) : '')}
          placeholder={rowValue('style.opacity') === MIXED ? '混合' : '跟随'}
          onChange={(e) => setDrafts({ ...drafts, opacity: e.target.value })}
          onBlur={() => commitNumber('style.opacity', 'opacity')}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="w-20 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12"
          data-responsive-input="style.opacity"
        />
        <span className="min-w-0 flex-1 truncate font-mono text-11 text-fg-3" data-responsive-channel="style.opacity">
          这一档 {rowValue('style.opacity') === MIXED ? '混合' : textOf(rowValue('style.opacity'))} · 设计{' '}
          {designOf('style.opacity')}
        </span>
        {hasOverride('style.opacity') ? (
          <button
            type="button"
            onClick={() => studio.clearResponsiveChannel(ids, bp, 'style.opacity')}
            className="px-1 text-12 text-fg-3 hover:text-danger-ink"
            title="清除这一档的透明度覆盖"
            data-responsive-clear="style.opacity"
          >
            ×
          </button>
        ) : null}
      </div>

      <button
        type="button"
        disabled={!hasAnyRule}
        onClick={() => studio.dropResponsiveRule(ids, bp)}
        className={cn(
          'rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-12',
          hasAnyRule ? 'text-danger-ink hover:bg-bg-2' : 'cursor-not-allowed text-fg-3 opacity-50',
        )}
        data-responsive-drop-rule={bp}
      >
        清掉{VIEWPORT_OPTIONS.find((o) => o.id === bp)?.label.split(' ')[0]}这一档的全部覆盖
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
}: {
  node: DesignNode;
  write: (path: string, value: unknown) => void;
  tokens: ReturnType<typeof useStudio>['tokens'];
  mode: string | null;
  colorTokens: Token[];
}) {
  const [active, setActive] = useState<NodeState>('hover');
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
    <div className="flex flex-col gap-[var(--nexus-space-2)]">
      <div className="flex flex-wrap gap-1">
        {NODE_STATES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setActive(s);
              setDrafts({});
            }}
            className={cn('rounded-[var(--nexus-radius-sm)] px-2 py-1 text-11', s === active ? 'bg-brand text-accent-fg' : 'bg-bg-2 text-fg-3 hover:text-fg-1')}
            data-state-tab={s}
          >
            {STATE_LABELS[s]}
          </button>
        ))}
      </div>
      <p className="text-11 text-fg-3">画布不预览状态（避免干扰选择与拖拽）；移上指针的效果去预览或发布页看（ADR-0062）。</p>

      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => studio.copyStates(node.id, active)}
          disabled={!patch || !Object.keys(patch).length}
          title={patch && Object.keys(patch).length ? `复制「${STATE_LABELS[active]}」的整份补丁` : `「${STATE_LABELS[active]}」还没有补丁，没有可复制的通道`}
          className={cn(
            'rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11',
            patch && Object.keys(patch).length ? 'text-fg-2 hover:bg-bg-2' : 'cursor-not-allowed text-fg-3 opacity-50',
          )}
          data-state-copy={active}
        >
          复制「{STATE_LABELS[active]}」补丁
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
              ? `粘贴 ${statesClipboard.sourceName} 的「${STATE_LABELS[statesClipboard.state]}」补丁（整通道覆盖）`
              : '剪贴板为空：先选一个已有状态补丁的元素复制'
          }
          className={cn(
            'rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11',
            statesClipboard ? 'text-fg-2 hover:bg-bg-2' : 'cursor-not-allowed text-fg-3 opacity-50',
          )}
          data-state-paste="single"
        >
          粘贴{statesClipboard ? `「${STATE_LABELS[statesClipboard.state]}」` : ''}补丁
        </button>
      </div>
      {statesClipboard ? (
        <p className="text-11 text-fg-3" data-states-clipboard-note>
          剪贴板：{statesClipboard.sourceName} 的「{STATE_LABELS[statesClipboard.state]}」补丁（粘贴会整份覆盖目标这个状态的通道）
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-12 text-fg-2">{isText ? '字色' : '背景'}</span>
        <input
          type="color"
          value={drafts.fill ?? hexOf(fillColor)}
          onChange={(e) => setDrafts({ ...drafts, fill: e.target.value })}
          onBlur={() => {
            if (drafts.fill) setFills(drafts.fill);
            setDrafts({ ...drafts, fill: undefined });
          }}
          className="h-7 w-8 shrink-0 cursor-pointer rounded-[var(--nexus-radius-sm)] bg-transparent p-0"
          data-state-fill={active}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-11 text-fg-3">{fillColor === undefined ? '未设置' : typeof fillColor === 'string' ? fillColor : resolveColor(fillColor, tokens, mode)}</span>
        <span data-state-fill-bind={active}>
          <TokenBindButton active={isTokenRef(fillColor)} tokens={colorTokens} onPick={(key) => setFills(makeTokenRef(key))} />
        </span>
        <button type="button" onClick={() => write(`states.${active}.fills`, [])} className="px-1 text-12 text-fg-3 hover:text-danger-ink" title="清除该通道（生成器发射重置类）" data-state-fill-clear={active}>
          ×
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-12 text-fg-2">描边</span>
        <input
          type="number"
          min={0}
          step={0.5}
          value={stroke?.width ?? 1}
          onChange={(e) => setStroke(Number(e.target.value), (strokeColor ?? '#ffffff') as ColorValue)}
          onKeyDown={(e) => e.stopPropagation()}
          className="w-16 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12"
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
          className="h-7 w-8 shrink-0 cursor-pointer rounded-[var(--nexus-radius-sm)] bg-transparent p-0"
          data-state-stroke-color={active}
        />
        <button type="button" onClick={() => write(`states.${active}.strokes`, [])} className="px-1 text-12 text-fg-3 hover:text-danger-ink" title="清除描边通道" data-state-stroke-clear={active}>
          ×
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1">
        <NumberField
          label="阴影 X"
          value={shadow && 'offsetX' in shadow ? shadow.offsetX ?? 0 : 0}
          onSet={(v) => setShadow({ offsetX: v, offsetY: shadow && 'offsetY' in shadow ? shadow.offsetY ?? 0 : 0, blur: shadow && 'blur' in shadow ? shadow.blur ?? 0 : 0, spread: shadow && 'spread' in shadow ? shadow.spread ?? 0 : 0, color: (shadowColor ?? '#000000') as ColorValue })}
        />
        <NumberField
          label="阴影 Y"
          value={shadow && 'offsetY' in shadow ? shadow.offsetY ?? 0 : 0}
          onSet={(v) => setShadow({ offsetX: shadow && 'offsetX' in shadow ? shadow.offsetX ?? 0 : 0, offsetY: v, blur: shadow && 'blur' in shadow ? shadow.blur ?? 0 : 0, spread: shadow && 'spread' in shadow ? shadow.spread ?? 0 : 0, color: (shadowColor ?? '#000000') as ColorValue })}
        />
        <NumberField
          label="模糊"
          value={shadow && 'blur' in shadow ? shadow.blur ?? 0 : 0}
          onSet={(v) => setShadow({ offsetX: shadow && 'offsetX' in shadow ? shadow.offsetX ?? 0 : 0, offsetY: shadow && 'offsetY' in shadow ? shadow.offsetY ?? 0 : 0, blur: v, spread: shadow && 'spread' in shadow ? shadow.spread ?? 0 : 0, color: (shadowColor ?? '#000000') as ColorValue })}
        />
        <NumberField
          label="扩散"
          value={shadow && 'spread' in shadow ? shadow.spread ?? 0 : 0}
          onSet={(v) => setShadow({ offsetX: shadow && 'offsetX' in shadow ? shadow.offsetX ?? 0 : 0, offsetY: shadow && 'offsetY' in shadow ? shadow.offsetY ?? 0 : 0, blur: shadow && 'blur' in shadow ? shadow.blur ?? 0 : 0, spread: v, color: (shadowColor ?? '#000000') as ColorValue })}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-12 text-fg-2">阴影色</span>
        <input
          type="color"
          value={drafts.shadow ?? hexOf(shadowColor)}
          onChange={(e) => setDrafts({ ...drafts, shadow: e.target.value })}
          onBlur={() => {
            if (drafts.shadow) setShadow({ offsetX: shadow && 'offsetX' in shadow ? shadow.offsetX ?? 0 : 0, offsetY: shadow && 'offsetY' in shadow ? shadow.offsetY ?? 0 : 0, blur: shadow && 'blur' in shadow ? shadow.blur ?? 0 : 0, spread: shadow && 'spread' in shadow ? shadow.spread ?? 0 : 0, color: drafts.shadow });
            setDrafts({ ...drafts, shadow: undefined });
          }}
          className="h-7 w-8 shrink-0 cursor-pointer rounded-[var(--nexus-radius-sm)] bg-transparent p-0"
          data-state-shadow-color={active}
        />
        <button type="button" onClick={() => write(`states.${active}.effects`, [])} className="px-1 text-12 text-fg-3 hover:text-danger-ink" title="清除效果通道" data-state-effects-clear={active}>
          ×
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-12 text-fg-2">透明度</span>
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
          className="w-20 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12"
          data-state-opacity={active}
        />
        <button type="button" onClick={clearOpacity} className="px-1 text-12 text-fg-3 hover:text-danger-ink" title="清除透明度覆盖" data-state-opacity-clear={active}>
          ×
        </button>
      </div>

      <button
        type="button"
        onClick={dropState}
        className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-12 text-danger-ink"
        data-state-drop={active}
      >
        删除{STATE_LABELS[active]}状态补丁
      </button>
    </div>
  );
}

function NodeNameField({ node }: { node: DesignNode }) {
  const [value, setValue] = useState(node.name);
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value.trim() && value !== node.name && studio.rename(node.id, value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className="mt-1 w-full rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-13"
      data-prop="name"
    />
  );
}

function PageProperties() {
  const state = useStudioReady();
  const page = state.page;
  if (!page) return null;
  const usedTokens = state.document.tokens.length;
  const root = state.layout.nodes[state.layout.rootId];
  const rw = root ? Math.round(root.width) : page.width;
  const rh = root ? Math.round(root.height) : page.height;
  const responsive = rw !== page.width || rh !== page.height;
  return (
    <div className="flex h-full min-h-0 flex-col gap-[var(--nexus-space-4)] overflow-auto p-[var(--nexus-space-3)]">
      <Section title="页面">
        <p className="text-12 text-fg-2">{page.name}</p>
        <p className="mt-1 text-12 text-fg-3">
          {page.width} × {page.height} · {Object.keys(page.nodes).length} 个节点
        </p>
        {responsive ? (
          <p className="mt-1 text-12 text-fg-3" data-page-resolved-size>
            {state.viewport} 下为 {rw} × {rh}
          </p>
        ) : null}
        {state.viewport !== 'design' ? (
          <p className="mt-1 text-12 text-fg-3" data-page-root-width-from-breakpoint>
            这一档的根宽由断点给出（{rw}px），不是模型里的那个数——换视口只改投影，
            模型仍是 {page.width} × {page.height}。所以断点面板编辑的是元素，根画框不在其中。
          </p>
        ) : null}
      </Section>
      <Section title="Design System 概览">
        <p className="text-12 text-fg-3">
          {usedTokens} 个 token · {state.document.components.length} 个组件 · {state.document.assets.length} 个资产
        </p>
        <p className="mt-2 text-12 text-fg-3">选中画布元素后，这里会切换成属性编辑器。</p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[var(--nexus-color-border-subtle)] px-[var(--nexus-space-3)] py-[var(--nexus-space-3)]">
      <h3 className="mb-[var(--nexus-space-2)] font-mono text-12 uppercase tracking-[.12em] text-fg-3">{title}</h3>
      <div className="flex flex-col gap-[var(--nexus-space-2)]">{children}</div>
    </section>
  );
}

interface FieldProps<T> {
  label: string;
  value: T | typeof MIXED;
  onSet: (value: T) => void;
  disabled?: boolean;
  hint?: string;
}

function NumberField(
  props: FieldProps<number> & {
    step?: number;
    bind?: { types: Token['type'][]; path: string; write: (path: string, value: unknown) => void };
    read?: (path: string) => unknown;
    tokens?: Token[];
  },
) {
  const { value, onSet, bind, read, tokens, label, disabled, hint, step = 1 } = props;
  const path = bind?.path;
  const boundKey = path && read ? (isTokenRef(read(path)) ? tokenRefKey(read(path)) : null) : null;
  return (
    <label className="flex flex-col gap-1" title={hint}>
      <span className="flex items-center gap-1 text-12 text-fg-3">
        {label}
        {boundKey ? <span className="rounded bg-bg-3 px-1 font-mono text-11 text-fg-2">{boundKey}</span> : null}
      </span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          step={step}
          disabled={disabled}
          value={value === MIXED ? '' : Number.isFinite(Number(value)) ? Number(value) : ''}
          placeholder={value === MIXED ? '混合' : undefined}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) onSet(next);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className="w-full min-w-0 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12 disabled:opacity-40"
          data-prop={path ?? label}
        />
        {bind && tokens ? <TokenBindButton active={Boolean(boundKey)} tokens={tokens} onPick={(key) => bind.write(bind.path, makeTokenRef(key))} /> : null}
      </span>
    </label>
  );
}

function TextField(props: FieldProps<string> & { textarea?: boolean }) {
  const { label, value, onSet, textarea, disabled } = props;
  const cls = 'w-full rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12';
  return (
    <label className="flex flex-col gap-1">
      <span className="text-12 text-fg-3">{label}</span>
      {textarea ? (
        <textarea
          rows={3}
          disabled={disabled}
          value={value === MIXED ? '' : (value ?? '')}
          onChange={(e) => onSet(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          className={cn(cls, 'resize-none')}
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
  const { label, value, options, onSet, disabled } = props;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-12 text-fg-3">{label}</span>
      <select
        disabled={disabled}
        value={value === MIXED ? '' : value}
        onChange={(e) => onSet(e.target.value)}
        className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12"
        data-prop={label}
      >
        {value === MIXED ? <option value="">混合</option> : null}
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
}) {
  const { label, value, onSet, axis } = props;
  const numeric = typeof value === 'number';
  return (
    <label className="flex flex-col gap-1">
      <span className="text-12 text-fg-3">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={numeric ? value : ''}
          placeholder={value === MIXED ? '混合' : typeof value === 'string' ? value : undefined}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) onSet(next);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className="w-full min-w-0 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12"
          data-prop={`size.${axis}`}
        />
        <button type="button" title="hug：贴合内容" onClick={() => onSet('hug')} className={cn('rounded-[var(--nexus-radius-sm)] px-[5px] py-1 text-11', value === 'hug' ? 'bg-brand text-accent-fg' : 'bg-bg-2 text-fg-3')}>
          H
        </button>
        <button type="button" title="fill：填满父级" onClick={() => onSet('fill')} className={cn('rounded-[var(--nexus-radius-sm)] px-[5px] py-1 text-11', value === 'fill' ? 'bg-brand text-accent-fg' : 'bg-bg-2 text-fg-3')}>
          F
        </button>
      </span>
    </label>
  );
}

function CheckField({ label, checked, onSet }: { label: string; checked: boolean; onSet: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-12 text-fg-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onSet(e.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--nexus-color-brand)]"
      />
      {label}
    </label>
  );
}

function PaddingGrid(props: {
  read: (path: string) => unknown;
  write: (path: string, value: unknown) => void;
  tokens: Token[];
}) {
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  return (
    <div className="grid grid-cols-4 gap-1">
      {sides.map((side) => (
        <NumberField
          key={side}
          label={side[0]!.toUpperCase()}
          value={(props.read(`layout.padding.${side}`) as number) ?? 0}
          onSet={(v) => props.write(`layout.padding.${side}`, v)}
          read={props.read}
          tokens={props.tokens}
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
}) {
  const { nodes, read, write, colorTokens } = props;
  const { assetError, assetNotice, assetContext } = useStudio();
  const fills = (nodes[0]?.style.fills ?? []).slice(0, 3);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const removeAt = (index: number) =>
    write('style.fills', nodes[0]!.style.fills.filter((_, i) => i !== index));

  const body = !fills.length ? (
    <span className="text-12 text-fg-3">无填充</span>
  ) : (
    fills.map((paint, index) => {
      if (paint.kind === 'image') {
        const url = assetContext.assetUrl(paint.assetId);
        return (
          <div key={index} className="flex flex-col gap-1" data-fill-image={index}>
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-8 shrink-0 place-items-center overflow-hidden rounded-[var(--nexus-radius-sm)] bg-bg-2">
                {url ? (
                  <img src={url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-9 text-fg-3">?</span>
                )}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-11 text-fg-3">
                {url ? `图片 ${paint.assetId.slice(0, 8)}` : '图片资产不在本项目清单'}
              </span>
              <select
                value={paint.fit ?? 'cover'}
                onChange={(e) => write(`style.fills.${index}.fit`, e.target.value)}
                aria-label="图片填充方式"
                className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-1 py-1 text-11 text-fg-2"
                data-fill-fit={index}
              >
                {FITS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => removeAt(index)} className="px-1 text-12 text-fg-3 hover:text-danger-ink" title="移除该填充层">
                ×
              </button>
            </div>
            <div className="pl-10">
              <ImageUploadButton nodeId={nodes[0]!.id} label="换一张图" />
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
        <div key={index} className="flex items-center gap-2">
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
            className="h-7 w-8 shrink-0 cursor-pointer rounded-[var(--nexus-radius-sm)] bg-transparent p-0"
            data-prop={path}
          />
          <span className="min-w-0 flex-1 truncate font-mono text-11 text-fg-3">{bound ? `{${bound}}` : value}</span>
          <TokenBindButton active={Boolean(bound)} tokens={colorTokens} onPick={(key) => write(path, makeTokenRef(key))} />
          <button
            type="button"
            onClick={() => removeAt(index)}
            className="px-1 text-12 text-fg-3 hover:text-danger-ink"
            title="移除该填充层"
          >
            ×
          </button>
        </div>
      );
    })
  );

  return (
    <div className="flex flex-col gap-[var(--nexus-space-2)]">
      {body}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => write('style.fills', [{ kind: 'solid', color: '#8b5cf6' }, ...((nodes[0]?.style.fills as unknown[]) ?? [])])}
          className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12 text-fg-2"
        >
          + 颜色
        </button>
        <ImageUploadButton nodeId={nodes[0]!.id} label="+ 图片" />
      </div>
      {assetError ? (
        <p className="rounded-[var(--nexus-radius-sm)] bg-danger/10 px-2 py-1 text-11 text-danger-ink" data-asset-error>
          {assetError}
        </p>
      ) : null}
      {assetNotice && !assetError ? (
        <p className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-11 text-fg-3" data-asset-notice>
          {assetNotice}
        </p>
      ) : null}
    </div>
  );
}

function TokenBindButton({ active, tokens, onPick }: { active: boolean; tokens: Token[]; onPick: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button
        type="button"
        title="绑定 token"
        onClick={() => setOpen((v) => !v)}
        className={cn('rounded-[var(--nexus-radius-sm)] px-[5px] py-1 text-11', active ? 'bg-brand text-accent-fg' : 'bg-bg-2 text-fg-3 hover:text-fg-1')}
        data-token-bind
      >
       链
      </button>
      {open ? (
        <span className="absolute right-0 top-6 z-50 block max-h-[220px] w-[180px] overflow-auto rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-1 shadow-panel">
          {tokens.length ? (
            tokens.map((token) => (
              <button
                key={token.key}
                type="button"
                onClick={() => {
                  onPick(token.key);
                  setOpen(false);
                }}
                className="block w-full truncate rounded-[var(--nexus-radius-sm)] px-2 py-1 text-left text-12 text-fg-1 hover:bg-bg-2"
              >
                {token.key}
              </button>
            ))
          ) : (
            <span className="block px-2 py-1 text-12 text-fg-3">没有匹配类型的 token</span>
          )}
        </span>
      ) : null}
    </span>
  );
}

function AlignMenu({ onAlign, disabled }: { onAlign: (edge: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => void; disabled: boolean }) {
  const items: { id: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'; label: string }[] = [
    { id: 'left', label: '左' },
    { id: 'hcenter', label: '水平居中' },
    { id: 'right', label: '右' },
    { id: 'top', label: '上' },
    { id: 'vcenter', label: '垂直居中' },
    { id: 'bottom', label: '下' },
  ];
  return (
    <span className={cn('flex flex-1 gap-1', disabled && 'opacity-40')}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={disabled}
          title={`对齐：${item.label}（仅绝对定位父级生效）`}
          onClick={() => onAlign(item.id)}
          className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-[5px] py-1 text-11 text-fg-2 hover:bg-bg-3"
        >
          {item.label[0]}
        </button>
      ))}
    </span>
  );
}
