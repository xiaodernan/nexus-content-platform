import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, type DesignNode } from '@nexus/design-model';
import { StudioStore } from '../src/studio/store';

/**
 * §124 × ADR-0062 part ⑤ 的续：状态补丁的复制 / 批量应用。
 *
 * 面板此前只能逐节点逐通道改状态，同一份 hover 补丁要贴到三个元素就得手抄三次。
 * 剪贴板是**视图态**（不落库、不进撤销栈），粘贴是**一条命令**（§149）：
 * 多选一次贴全部、撤销一次全回去。这里钉四件事——空补丁不复制、整通道覆盖、
 * 粘贴只动目标且用的是复制那一刻的值、以及撤销确实只回滚这一贴。
 */

function installFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: unknown, init?: { method?: string }) => {
      const method = init?.method ?? 'GET';
      const json = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload });
      if (method === 'PATCH' || method === 'PUT') return json({ ok: true, savedAt: '2026-10-25T00:00:00.000Z' });
      if (String(_input).includes('/snapshots')) return json({ snapshots: [], branches: [] });
      if (String(_input).includes('/publication')) return json({ publication: null });
      if (String(_input).includes('/annotations')) return json({ annotations: [] });
      return json({ document: createDocument('状态剪贴板', 'website') });
    }),
  );
}

async function readyStudio(): Promise<StudioStore> {
  const studio = new StudioStore();
  await studio.load('p1');
  return studio;
}

function nodeNamed(studio: StudioStore, name: string): DesignNode {
  const page = studio.getSnapshot().page!;
  const node = Object.values(page.nodes).find((n) => n.name === name);
  if (!node) throw new Error(`起手页里找不到 ${name}`);
  return node;
}

function hoverPatch(studio: StudioStore, id: string) {
  return studio.getSnapshot().page!.nodes[id]!.states?.hover;
}

const HOVER = { fills: [{ kind: 'solid', color: '#22d3ee' }], opacity: 0.5 } as const;

beforeEach(() => {
  vi.unstubAllGlobals();
  installFetch();
});

describe('§124 状态补丁的复制与批量应用', () => {
  it('空补丁不复制：剪贴板保持为空，如实返回 false（粘贴入口据此禁用）', async () => {
    const studio = await readyStudio();
    const cta = nodeNamed(studio, 'Primary CTA');

    expect(studio.copyStates(cta.id, 'hover')).toBe(false);
    expect(studio.getSnapshot().statesClipboard).toBeNull();

    // 「有状态名、没通道」也是空补丁（清掉最后一个通道后就会留下 {}），不该能复制
    studio.setProps([cta.id], 'states.hover', {});
    expect(studio.copyStates(cta.id, 'hover')).toBe(false);
    expect(studio.getSnapshot().statesClipboard).toBeNull();

    // 没有剪贴板时粘贴什么也不做，也不该凭空多出一条撤销记录
    const undoDepth = studio.getSnapshot().history.length;
    expect(studio.pasteStates([cta.id])).toBe(0);
    expect(studio.getSnapshot().history.length).toBe(undoDepth);
  });

  it('复制 → 粘贴：补丁整份落到目标节点，源节点不动，剪贴板记着它从哪来', async () => {
    const studio = await readyStudio();
    const cta = nodeNamed(studio, 'Primary CTA');
    const headline = nodeNamed(studio, 'Headline');
    studio.setProps([cta.id], 'states.hover', HOVER);

    expect(studio.copyStates(cta.id, 'hover')).toBe(true);
    const clip = studio.getSnapshot().statesClipboard!;
    expect(clip).toMatchObject({ state: 'hover', sourceNodeId: cta.id, sourceName: 'Primary CTA' });
    expect(clip.patch).toEqual(HOVER);

    expect(studio.pasteStates([headline.id])).toBe(1);
    expect(hoverPatch(studio, headline.id)).toEqual(HOVER);
    // 源节点原样：复制/粘贴不是"剪切"
    expect(hoverPatch(studio, cta.id)).toEqual(HOVER);
  });

  it('整通道覆盖：目标原有的别的通道被这份补丁整份替换（ADR-0062 withState）', async () => {
    const studio = await readyStudio();
    const cta = nodeNamed(studio, 'Primary CTA');
    const headline = nodeNamed(studio, 'Headline');
    studio.setProps([cta.id], 'states.hover', { opacity: 0.5 });
    studio.setProps([headline.id], 'states.hover', {
      strokes: [{ paints: [{ kind: 'solid', color: '#ffffff' }], width: 3, position: 'inside' }],
    });
    studio.copyStates(cta.id, 'hover');

    studio.pasteStates([headline.id]);
    expect(hoverPatch(studio, headline.id)).toEqual({ opacity: 0.5 });
    expect(hoverPatch(studio, headline.id)?.strokes).toBeUndefined();
  });

  it('多选一次贴 = 一条命令：撤销一次全部回滚，源节点自己的补丁还在', async () => {
    const studio = await readyStudio();
    const cta = nodeNamed(studio, 'Primary CTA');
    const headline = nodeNamed(studio, 'Headline');
    const body = nodeNamed(studio, 'Subhead');
    studio.setProps([cta.id], 'states.hover', HOVER);
    studio.copyStates(cta.id, 'hover');

    expect(studio.pasteStates([headline.id, body.id])).toBe(2);
    expect(hoverPatch(studio, headline.id)).toEqual(HOVER);
    expect(hoverPatch(studio, body.id)).toEqual(HOVER);

    studio.undo();
    expect(hoverPatch(studio, headline.id)).toBeUndefined();
    expect(hoverPatch(studio, body.id)).toBeUndefined();
    expect(hoverPatch(studio, cta.id)).toEqual(HOVER);
  });

  it('剪贴板停在复制那一刻：之后改源节点，再贴出来的是旧值而不是源节点现在的值', async () => {
    const studio = await readyStudio();
    const cta = nodeNamed(studio, 'Primary CTA');
    const headline = nodeNamed(studio, 'Headline');
    const subhead = nodeNamed(studio, 'Subhead');
    studio.setProps([cta.id], 'states.hover', HOVER);
    studio.copyStates(cta.id, 'hover');

    // 复制之后源节点改成别的值：剪贴板记的仍是复制时的补丁
    studio.setProps([cta.id], 'states.hover', { opacity: 0.9 });
    expect(studio.getSnapshot().statesClipboard!.patch).toEqual(HOVER);

    studio.pasteStates([headline.id]);
    studio.pasteStates([subhead.id]);
    expect(hoverPatch(studio, headline.id)).toEqual(HOVER);
    expect(hoverPatch(studio, subhead.id)).toEqual(HOVER);
    expect(hoverPatch(studio, cta.id)).toEqual({ opacity: 0.9 });
  });
});
