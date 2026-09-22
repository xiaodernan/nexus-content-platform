import { describe, expect, it } from 'vitest';
import { createDocument, resolveLayout, TokenStore, type DesignNode, type ResolvedNode } from '@nexus/design-model';
import { nodeStyle } from '@/studio/render';
import { apiAssetUrl, fitToBackgroundRepeat, fitToBackgroundSize } from '@/studio/assets';

/**
 * 模型 → CSS 投影的契约：fills 对 text 是字色、对 button 是背景。
 * 这条契约一旦漂移，画布和预览就会各说各话（§16）。
 */
const document = createDocument('投影测试', 'website');
const page = document.pages.find((p) => p.id === document.activePageId)!;
const layout = resolveLayout(page);
const tokens = new TokenStore(document.tokens);
const assets = { assetUrl: apiAssetUrl };

function byName(name: string): ResolvedNode {
  const entry = Object.values(layout.nodes).find((n) => n.node.name === name);
  if (!entry) throw new Error(`starter page 缺少节点 ${name}`);
  return entry;
}

/** 造一个只改 fills 的节点，避免依赖 starter page 的具体内容 */
function withFills(base: ResolvedNode, fills: DesignNode['style']['fills']): ResolvedNode {
  return { ...base, node: { ...base.node, style: { ...base.node.style, fills } } };
}

describe('nodeStyle', () => {
  it('paints a button fill as background and reads its label color from typography', () => {
    const style = nodeStyle(byName('Primary CTA'), { tokens, mode: null });
    expect(style.backgroundColor).toBe('#6b4ff0');
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
    expect(dark).toBe('#6b4ff0');
    expect(light).toBe('#5b3df5');
  });
});

describe('nodeStyle · image paint（§38/§182）', () => {
  const base = byName('Primary CTA');

  it('projects an image paint into background-image via the injected resolver', () => {
    const style = nodeStyle(withFills(base, [{ kind: 'image', assetId: 'asset-1' }]), {
      tokens,
      mode: null,
      assets,
    });
    expect(style.backgroundImage).toBe('url("/api/assets/asset-1/file")');
    expect(style.backgroundSize).toBe('cover');
    expect(style.backgroundRepeat).toBe('no-repeat');
  });

  it('drops an image paint when no resolver is supplied, instead of rendering a broken url', () => {
    const style = nodeStyle(withFills(base, [{ kind: 'image', assetId: 'asset-1' }]), { tokens, mode: null });
    expect(style.backgroundImage).toBeUndefined();
    expect(style.backgroundColor).toBeUndefined();
  });

  it('drops an image paint when the resolver returns null (missing asset)', () => {
    const style = nodeStyle(withFills(base, [{ kind: 'image', assetId: 'gone' }]), {
      tokens,
      mode: null,
      assets: { assetUrl: () => null },
    });
    expect(style.backgroundImage).toBeUndefined();
  });

  it('maps fit onto background-size / repeat', () => {
    const fitOf = (fit: 'cover' | 'contain' | 'fill' | 'tile') =>
      nodeStyle(withFills(base, [{ kind: 'image', assetId: 'a', fit }]), { tokens, mode: null, assets });
    expect(fitOf('contain').backgroundSize).toBe('contain');
    expect(fitOf('fill').backgroundSize).toBe('100% 100%');
    expect(fitOf('tile').backgroundSize).toBe('auto');
    expect(fitOf('tile').backgroundRepeat).toBe('repeat');
  });

  it('keeps color and image layers both, even though url() is not a gradient', () => {
    // 旧实现用 l.includes('gradient') 分类：url(...) 不含 gradient，会被误判成纯色层而丢掉图片。
    const style = nodeStyle(
      withFills(base, [
        { kind: 'image', assetId: 'asset-9' },
        { kind: 'solid', color: '#102030' },
      ]),
      { tokens, mode: null, assets },
    );
    expect(style.backgroundImage).toBe('url("/api/assets/asset-9/file")');
    expect(style.backgroundColor).toBe('#102030');
  });

  it('stacks multiple image layers in model order (fills[0] on top)', () => {
    const style = nodeStyle(
      withFills(base, [
        { kind: 'image', assetId: 'top' },
        { kind: 'image', assetId: 'bottom' },
      ]),
      { tokens, mode: null, assets },
    );
    // CSS 先写的在上 → 模型 fills[0] 必须写在前
    expect(style.backgroundImage).toBe('url("/api/assets/top/file"), url("/api/assets/bottom/file")');
  });

  it('keeps a gradient over an image', () => {
    const style = nodeStyle(
      withFills(base, [
        { kind: 'image', assetId: 'photo' },
        { kind: 'gradient', type: 'linear', stops: [{ at: 0, color: '#000000' }, { at: 1, color: '#ffffff' }] },
      ]),
      { tokens, mode: null, assets },
    );
    expect(style.backgroundImage).toBe(
      'url("/api/assets/photo/file"), linear-gradient(180deg, #000000 0.0%, #ffffff 100.0%)',
    );
  });

  it('skips an explicitly hidden image paint', () => {
    const style = nodeStyle(withFills(base, [{ kind: 'image', assetId: 'asset-1', visible: false }]), {
      tokens,
      mode: null,
      assets,
    });
    expect(style.backgroundImage).toBeUndefined();
  });
});

describe('asset fit projection', () => {
  it('maps every fit deterministically', () => {
    expect(fitToBackgroundSize('cover')).toBe('cover');
    expect(fitToBackgroundSize(undefined)).toBe('cover');
    expect(fitToBackgroundRepeat('cover')).toBe('no-repeat');
  });
});
