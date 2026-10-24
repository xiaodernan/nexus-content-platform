import { describe, expect, it } from 'vitest';
import {
  createDocument,
  resolveLayout,
  TokenStore,
  type DesignNode,
  type ResolvedNode,
} from '@nexus/design-model';
import { stateStyleSheetFor } from '@/studio/state-styles';
import { apiAssetUrl } from '@/studio/assets';

/**
 * §124 状态层的只读投影（ADR-0062 part ③）。
 * 核心验收：差量 + !important（越过内联基础样式）、无状态返空串、
 * 基础态有而状态态显式清空的通道必须发射 CSS_RESET。
 */

function sheetFor(mutate: (node: DesignNode) => void): { sheet: string; nodeId: string } {
  const document = createDocument('状态层测试', 'website');
  const page = document.pages.find((p) => p.id === document.activePageId)!;
  const target = Object.values(page.nodes).find((n) => n.name === 'Primary CTA')!;
  mutate(target);
  const tokens = new TokenStore(document.tokens);
  const layout = resolveLayout(page, { tokens, mode: null });
  const nodes: ResolvedNode[] = layout.paintOrder
    .map((id) => layout.nodes[id])
    .filter((r): r is ResolvedNode => Boolean(r));
  return {
    sheet: stateStyleSheetFor(nodes, { tokens, mode: null, assets: { assetUrl: apiAssetUrl } }),
    nodeId: target.id,
  };
}

describe('stateStyleSheetFor（§124 状态层只读投影）', () => {
  it('hover fills → 差量规则，且带 !important 越过内联基础样式', () => {
    const { sheet, nodeId } = sheetFor((node) => {
      node.states = { hover: { fills: [{ kind: 'solid', color: '#123456' }] } };
    });
    expect(sheet).toBe(`[data-node-id="${nodeId}"]:hover { background-color: #123456 !important }`);
  });

  it('没有状态节点的页面：空串，一个字符都不产出（反向对照）', () => {
    const { sheet } = sheetFor(() => {});
    expect(sheet).toBe('');
  });

  it('补丁与基础态完全一致：不发射空规则', () => {
    const { sheet } = sheetFor((node) => {
      node.states = { hover: { fills: [{ kind: 'solid', color: '#6b4ff0' }] } };
    });
    expect(sheet).toBe('');
  });

  it('opacity 补丁 → opacity 差量', () => {
    const { sheet, nodeId } = sheetFor((node) => {
      node.states = { hover: { opacity: 0.5 } };
    });
    expect(sheet).toBe(`[data-node-id="${nodeId}"]:hover { opacity: 0.5 !important }`);
  });

  it('loading 状态用 [data-state="loading"] 属性选择器（不是伪类）', () => {
    const { sheet, nodeId } = sheetFor((node) => {
      node.states = { loading: { opacity: 0.5 } };
    });
    expect(sheet).toBe(`[data-node-id="${nodeId}"][data-state="loading"] { opacity: 0.5 !important }`);
  });

  it('显式清空 fills：基础态有背景 → 重置 background-color: transparent', () => {
    const { sheet, nodeId } = sheetFor((node) => {
      node.states = { hover: { fills: [] } };
    });
    expect(sheet).toContain('background-color: transparent !important');
    expect(sheet.startsWith(`[data-node-id="${nodeId}"]:hover`)).toBe(true);
  });

  it('显式清空 effects：基础态有投影 → 重置 box-shadow: none', () => {
    const { sheet } = sheetFor((node) => {
      node.style.effects = [
        { kind: 'drop-shadow', offsetX: 0, offsetY: 8, blur: 24, spread: 0, color: 'rgba(0,0,0,0.32)' },
      ];
      node.states = { hover: { effects: [] } };
    });
    expect(sheet).toContain('box-shadow: none !important');
  });

  it('text 节点显式清空 fills：字色重置为 inherit', () => {
    const document = createDocument('状态层测试', 'website');
    const page = document.pages.find((p) => p.id === document.activePageId)!;
    const headline = Object.values(page.nodes).find((n) => n.name === 'Headline')!;
    headline.states = { hover: { fills: [] } };
    const tokens = new TokenStore(document.tokens);
    const layout = resolveLayout(page, { tokens, mode: null });
    const nodes = layout.paintOrder.map((id) => layout.nodes[id]!).filter(Boolean);
    const sheet = stateStyleSheetFor(nodes, { tokens, mode: null });
    expect(sheet).toBe(`[data-node-id="${headline.id}"]:hover { color: inherit !important }`);
  });

  it('多个状态各出一条规则，且只含差量属性（不重播 position/font 等未变属性）', () => {
    const { sheet, nodeId } = sheetFor((node) => {
      node.states = {
        hover: { fills: [{ kind: 'solid', color: '#111111' }] },
        active: { opacity: 0.9 },
      };
    });
    const lines = sheet.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(`[data-node-id="${nodeId}"]:hover { background-color: #111111 !important }`);
    expect(lines[1]).toBe(`[data-node-id="${nodeId}"]:active { opacity: 0.9 !important }`);
    expect(sheet).not.toContain('position');
    expect(sheet).not.toContain('font');
  });
});
