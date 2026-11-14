import { describe, expect, it } from 'vitest';
import {
  groupOf,
  GROUP_LABEL,
  GROUP_ORDER,
  PALETTE_COMMANDS,
  type PaletteGroup,
} from '@/lib/command-palette/commands';

/**
 * §CP-1 命令表的不变式——**纯数据那一寸**。
 *
 * 这一片最重要的是第 3 条：**管理台路径不许进这张表**。
 * 命令表会随客户端 bundle 发到每一个访客的浏览器里，而 `/admin/*` 是 role=admin
 * 才进得去的内部拓扑。写进来省的那一次跳转，代价是把"我们有哪些运维面"印在公开 JS 上。
 * 代价与理由记在 `commands.ts` 顶部；这条判据保证它不会在某次"顺手加个快捷入口"里被悄悄破掉。
 */
describe('§CP-1 命令表', () => {
  it('十六格，id 与 label 都不重复', () => {
    expect(PALETTE_COMMANDS).toHaveLength(19);
    const ids = PALETTE_COMMANDS.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
    const labels = PALETTE_COMMANDS.map((command) => command.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('导航项的 href 是以 / 开头的站内路径', () => {
    for (const command of PALETTE_COMMANDS) {
      if (command.kind !== 'nav') continue;
      expect(command.href.startsWith('/'), `${command.id} 的 href 不是站内路径`).toBe(true);
      expect(command.href.includes(' '), `${command.id} 的 href 里有空格`).toBe(false);
    }
  });

  it('**没有一条指向 /admin**：客户端 bundle 不是权限地图', () => {
    for (const command of PALETTE_COMMANDS) {
      if (command.kind !== 'nav') continue;
      expect(command.href.startsWith('/admin'), `${command.id} 把管理台路径写进了公开 bundle`).toBe(false);
    }
  });

  it('动作项的 action 都是已知的三个之一（表只声明，实现另在）', () => {
    const known = new Set(['toggle-theme', 'copy-link', 'scroll-top']);
    for (const command of PALETTE_COMMANDS) {
      if (command.kind !== 'action') continue;
      expect(known.has(command.action), `${command.id} 声明了没人实现的动作 ${command.action}`).toBe(true);
    }
    // 反过来：三个动作都得有入口，否则等于悄悄下线了一个功能
    const declared = PALETTE_COMMANDS.filter((command) => command.kind === 'action').map((command) => command.action);
    expect(new Set(declared)).toEqual(known);
  });

  it('每一条都至少有一个关键词（中文界面 + 英文/路径同义词，两边都能敲到）', () => {
    for (const command of PALETTE_COMMANDS) {
      expect(command.keywords?.length ?? 0, `${command.id} 没有关键词`).toBeGreaterThan(0);
    }
  });

  it('分组只用 GROUP_ORDER 里那三档，且每一档都有中文标题', () => {
    const legal = new Set<PaletteGroup>(GROUP_ORDER);
    for (const command of PALETTE_COMMANDS) {
      expect(legal.has(command.group), `${command.id} 的分组 ${command.group} 不在 GROUP_ORDER 里`).toBe(true);
    }
    for (const group of GROUP_ORDER) {
      expect(GROUP_LABEL[group].length).toBeGreaterThan(0);
    }
  });
});

describe('§CP-1 groupOf', () => {
  it('按 GROUP_ORDER 切块、组内保持传入顺序、空组消失、总数守恒', () => {
    const blocks = groupOf(PALETTE_COMMANDS, (command) => command.group);
    expect(blocks.map((block) => block.group)).toEqual(['go', 'view', 'act']);
    expect(blocks.reduce((sum, block) => sum + block.items.length, 0)).toBe(PALETTE_COMMANDS.length);
    // 组内顺序 = 声明顺序（第一条 go 就是首页）
    expect(blocks[0]!.items[0]!.id).toBe('home');
  });

  it('空输入给空数组（不吐三个空块）', () => {
    expect(groupOf([], (command: { group: PaletteGroup }) => command.group)).toEqual([]);
  });

  it('取值函数在包装对象上也成立（组件传的是 Ranked<>，group 在 item 上）', () => {
    const wrapped = PALETTE_COMMANDS.slice(0, 3).map((item) => ({ item, score: 1, ranges: [] }));
    const blocks = groupOf(wrapped, (entry) => entry.item.group);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.group).toBe('go');
    expect(blocks[0]!.items.map((entry) => entry.item.id)).toEqual(['home', 'discover', 'search']);
  });
});
