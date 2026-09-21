import { describe, expect, it } from 'vitest';
import { createDocument, resolveLayout, TokenStore, type ResolvedNode } from '@nexus/design-model';
import { nodeStyle } from '@/studio/render';

/**
 * 模型 → CSS 投影的契约：fills 对 text 是字色、对 button 是背景。
 * 这条契约一旦漂移，画布和预览就会各说各话（§16）。
 */
const document = createDocument('投影测试', 'website');
const page = document.pages.find((p) => p.id === document.activePageId)!;
const layout = resolveLayout(page);
const tokens = new TokenStore(document.tokens);

function byName(name: string): ResolvedNode {
  const entry = Object.values(layout.nodes).find((n) => n.node.name === name);
  if (!entry) throw new Error(`starter page 缺少节点 ${name}`);
  return entry;
}

describe('nodeStyle', () => {
  it('paints a button fill as background and reads its label color from typography', () => {
    const style = nodeStyle(byName('Primary CTA'), { tokens, mode: null });
    expect(style.backgroundColor).toBe('#7c5cff');
    expect(style.color).toBe('#ffffff');
  });

  it('keeps a bordered ghost button transparent', () => {
    const style = nodeStyle(byName('Secondary CTA'), { tokens, mode: null });
    expect(style.backgroundColor).toBeUndefined();
    expect(style.color).toBe('#eef2ff');
  });

  it('uses fills[0] as the text color, never as a background', () => {
    const style = nodeStyle(byName('Headline'), { tokens, mode: null });
    expect(style.color).toBe('#eef2ff');
    expect(style.backgroundColor).toBeUndefined();
  });

  it('resolves colors through the active mode', () => {
    const dark = nodeStyle(byName('Primary CTA'), { tokens, mode: null }).backgroundColor;
    const light = nodeStyle(byName('Primary CTA'), { tokens, mode: 'light' }).backgroundColor;
    expect(dark).toBe('#7c5cff');
    expect(light).toBe('#5b3df5');
  });
});
