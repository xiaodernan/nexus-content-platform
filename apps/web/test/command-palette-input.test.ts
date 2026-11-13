import { describe, expect, it } from 'vitest';
import { clampActive, isPaletteHotkey, moveActive, PALETTE_KEY } from '@/lib/command-palette/input';
import { shouldShowChip } from '@/lib/command-palette/placement';

/**
 * §CP-1 命令面板的**输入语义**——纯函数那一寸。
 *
 * 这一片的两条判据都来自"抢键"这个具体风险：
 *
 * 1. **纯 Ctrl+K 在可编辑控件里必须放手**。macOS 的文本框（以及不少 Linux 输入框）把它
 *    绑成"删到行尾"；网页抢走它 = 用户打字时被删掉一段。这是 `lib/keyboard.ts` 那条
 *    「焦点在输入控件里，键入属于用户」纪律的直接推论，不是新发明。
 * 2. **⌘K 例外**：macOS 文本控件里 ⌘K 没有原生含义，而"正在写东西时想跳走"恰恰是
 *    命令面板最常见的用法，所以它照开。
 *
 * 还有一组 `moveActive` 的绕行判据：命令面板是一眼能扫完的短列表，两端回绕比停住快；
 * 而 `length===0` 必须给出 -1（"没得选"），不能拿 0 去索引空数组。
 */
describe('§CP-1 isPaletteHotkey', () => {
  it('触发键常量是 k（与 GitHub / Linear / VS Code 一致）', () => {
    expect(PALETTE_KEY).toBe('k');
  });

  it('⌘K 永远开——包括焦点在输入框里', () => {
    const editable = { tagName: 'INPUT' } as unknown as EventTarget;
    expect(isPaletteHotkey({ key: 'k', metaKey: true })).toBe(true);
    expect(isPaletteHotkey({ key: 'k', metaKey: true, target: editable })).toBe(true);
  });

  it('纯 Ctrl+K 在非编辑区开，在可编辑控件里放手（Emacs 删到行尾）', () => {
    expect(isPaletteHotkey({ key: 'k', ctrlKey: true })).toBe(true);
    const input = { tagName: 'INPUT' } as unknown as EventTarget;
    const textarea = { tagName: 'TEXTAREA' } as unknown as EventTarget;
    const contentEditable = { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget;
    expect(isPaletteHotkey({ key: 'k', ctrlKey: true, target: input })).toBe(false);
    expect(isPaletteHotkey({ key: 'k', ctrlKey: true, target: textarea })).toBe(false);
    expect(isPaletteHotkey({ key: 'k', ctrlKey: true, target: contentEditable })).toBe(false);
  });

  it('大小写都认（CapsLock / Shift 不该让热键失灵）', () => {
    expect(isPaletteHotkey({ key: 'K', metaKey: true })).toBe(true);
    expect(isPaletteHotkey({ key: 'K', ctrlKey: true })).toBe(true);
  });

  it('带 Alt 的一律不认（桌面环境 / 输入法级快捷键不该被网页吞）', () => {
    expect(isPaletteHotkey({ key: 'k', altKey: true })).toBe(false);
    expect(isPaletteHotkey({ key: 'k', altKey: true, metaKey: true })).toBe(false);
  });

  it('别的键、以及一个修饰键都不带的裸 k 都不认', () => {
    expect(isPaletteHotkey({ key: 'j', metaKey: true })).toBe(false);
    expect(isPaletteHotkey({ key: 'k' })).toBe(false);
  });
});

describe('§CP-1 moveActive / clampActive', () => {
  it('向下走到底回到第一条，向上走过头落到最后一条', () => {
    expect(moveActive(4, 1, 5)).toBe(0);
    expect(moveActive(0, -1, 5)).toBe(4);
  });

  it('当前没有选中项（-1）时：往下给第一条，往上给最后一条', () => {
    expect(moveActive(-1, 1, 5)).toBe(0);
    expect(moveActive(-1, -1, 5)).toBe(4);
  });

  it('列表为空时给 -1，不拿 0 去索引空数组', () => {
    expect(moveActive(0, 1, 0)).toBe(-1);
    expect(clampActive(0, 0)).toBe(-1);
  });

  it('clamp 只夹上界，不把 -1 变成 0（"没选中"是个合法状态）', () => {
    expect(clampActive(9, 5)).toBe(4);
    expect(clampActive(-1, 5)).toBe(-1);
    expect(clampActive(2, 5)).toBe(2);
  });
});

describe('§CP-1 shouldShowChip', () => {
  it('普通页面挂胶囊', () => {
    expect(shouldShowChip('/')).toBe(true);
    expect(shouldShowChip('/discover')).toBe(true);
    expect(shouldShowChip('/admin/gateway')).toBe(true);
    expect(shouldShowChip('/n/someone/my-work')).toBe(true);
  });

  it('画布 / 全幅沉浸页不挂（左下角是工具位，热键仍可用）', () => {
    expect(shouldShowChip('/studio')).toBe(false);
    expect(shouldShowChip('/studio/abc123')).toBe(false);
    expect(shouldShowChip('/game/p1')).toBe(false);
    expect(shouldShowChip('/world/p1')).toBe(false);
    expect(shouldShowChip('/preview/p1')).toBe(false);
  });

  it('**按路径段比**，不误伤同前缀的普通页：`/studio-notes` 照挂', () => {
    expect(shouldShowChip('/studio-notes')).toBe(true);
    expect(shouldShowChip('/games')).toBe(true);
    expect(shouldShowChip('/worldbuilding')).toBe(true);
  });

  it('pathname 缺失时按"挂"处理：少挂一次少一个入口，多挂一次最多挡像素', () => {
    expect(shouldShowChip(null)).toBe(true);
    expect(shouldShowChip(undefined)).toBe(true);
    expect(shouldShowChip('')).toBe(true);
  });
});
