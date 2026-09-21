'use client';

import { useState } from 'react';
import {
  getByPath,
  isTokenRef,
  makeTokenRef,
  tokenRefKey,
  toHex,
  type DesignNode,
  type Token,
} from '@nexus/design-model';
import { cn } from '@/lib/cn';
import { studio, useStudio, useStudioReady } from './store';

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
          <button type="button" onClick={() => studio.deleteSelection()} className="flex-1 rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-12 text-danger">
            删除
          </button>
          <AlignMenu onAlign={(edge) => studio.alignSelection(edge)} disabled={nodes.length < 2} />
        </div>
      </Section>
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
        <button type="button" title="hug：贴合内容" onClick={() => onSet('hug')} className={cn('rounded-[var(--nexus-radius-sm)] px-[5px] py-1 text-11', value === 'hug' ? 'bg-brand text-bg-0' : 'bg-bg-2 text-fg-3')}>
          H
        </button>
        <button type="button" title="fill：填满父级" onClick={() => onSet('fill')} className={cn('rounded-[var(--nexus-radius-sm)] px-[5px] py-1 text-11', value === 'fill' ? 'bg-brand text-bg-0' : 'bg-bg-2 text-fg-3')}>
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
  const fills = (nodes[0]?.style.fills ?? []).slice(0, 3);
  const [draft, setDraft] = useState<Record<number, string>>({});
  if (!fills.length) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-12 text-fg-3">无填充</span>
        <button
          type="button"
          onClick={() => write('style.fills', [{ kind: 'solid', color: '#8b5cf6' }, ...((nodes[0]?.style.fills as unknown[]) ?? [])])}
          className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12 text-fg-2"
        >
          + 颜色
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[var(--nexus-space-2)]">
      {fills.map((paint, index) => {
        const path = `style.fills.${index}.color`;
        const current = read(path);
        const bound = isTokenRef(current) ? tokenRefKey(current) : null;
        const hex = bound ? toHex(String(props.tokens.resolveValue(bound, props.mode)) ?? '#000') : toHex((current as never) ?? '#000');
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
              onClick={() => write('style.fills', nodes[0]!.style.fills.filter((_, i) => i !== index))}
              className="px-1 text-12 text-fg-3 hover:text-danger"
              title="移除该填充层"
            >
              ×
            </button>
          </div>
        );
      })}
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
        className={cn('rounded-[var(--nexus-radius-sm)] px-[5px] py-1 text-11', active ? 'bg-brand text-bg-0' : 'bg-bg-2 text-fg-3 hover:text-fg-1')}
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
