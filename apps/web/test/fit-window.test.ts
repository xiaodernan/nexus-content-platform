/**
 * 公开作品页「适应窗口」接线门：移动端审计量到 390 下首屏只见 27%、
 * 要平移 1082px——Studio 有这颗按钮而公开页没有，这里把它接上。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const comp = readFileSync(join(process.cwd(), 'apps/web/src/components/FitWindowLink.tsx'), 'utf8');
const controls = readFileSync(join(process.cwd(), 'apps/web/src/studio/ViewerControls.tsx'), 'utf8');

describe('FitWindowLink · 公开页适应窗口', () => {
  it('SSR 安全：初值 1、挂载后量视口，并用同一套 viewerHref 写 URL', () => {
    expect(comp).toContain("'use client'");
    expect(comp).toContain('useState(1)');
    expect(comp).toContain('useEffect(() =>');
    expect(comp).toContain('fitZoom(designWidth');
    expect(comp).toContain('window.innerWidth');
    expect(comp).toContain('viewerHref(base, query');
    expect(comp).toContain('router.push(');
  });

  it('保留普通 <a> 语义：修饰键/中键不拦截', () => {
    expect(comp).toContain('e.button !== 0');
    expect(comp).toContain('e.metaKey');
    expect(comp).toContain('e.ctrlKey');
  });

  it('中英各自一句，带教学 title', () => {
    expect(comp).toContain("label: '适应窗口'");
    expect(comp).toContain("label: 'Fit window'");
    expect(comp).toContain('title={c.title}');
  });

  it('ViewerControls 把设计宽度传进去，按钮落在缩放档那一排', () => {
    expect(controls).toContain('<FitWindowLink');
    expect(controls).toContain('designWidth={page.width}');
    expect(controls).toContain('data-viewer-zoom-options');
  });
});
