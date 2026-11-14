/**
 * §CP-1 命令面板的命令表。**纯数据 + 类型**，不含任何行为。
 *
 * ## 为什么管理台不进这张表（一条有代价的决定）
 *
 * `/admin/*` 的路径是内部拓扑：一味求快把它们写进来，等于把"我们有哪些运维面"
 * 编进**公开的客户端 bundle**——任何人下载 JS 都能读到，而管理台本身是 role=admin
 * 才进得去的。本仓对这条边界的口径一直是「不外泄内部读数」（ADR-0076/0085 一路下来
 * 每次在 page/route 上都写了同一句），命令面板凭什么例外？所以：**不写**。
 * 管理员照样走得到管理台——每一张 `/admin/*` 页里都有 `AdminNav` 那一栏。
 *
 * 代价如实记：管理员少了一个「⌘K 直接跳死信巡检」的便利。这个代价换的是
 * "客户端 bundle 不成为权限地图"，值得。
 *
 * ## 为什么 `action` 是字符串而不是函数
 *
 * 这张表要能被纯函数与单测整份读一遍（唯一 id、href 形状、分组合法性）。
 * 把函数塞进来会让"表"变成"模块"，测试就得把 React 与浏览器 API 一起拖进来。
 * 动作的实现在组件里按 `action` 名分派，表只负责**声明有哪些动作**。
 */

/** 面板里的分组。顺序即渲染顺序：先去哪儿，再看什么，最后才做动作。 */
export type PaletteGroup = 'go' | 'view' | 'act';

export const GROUP_ORDER: readonly PaletteGroup[] = ['go', 'view', 'act'];

export const GROUP_LABEL: Record<PaletteGroup, string> = {
  go: '前往',
  view: '查看',
  act: '动作',
};

/** 三个不跳走、就地生效的动作。实现在 `CommandPalette.tsx`。 */
export type PaletteAction = 'toggle-theme' | 'copy-link' | 'scroll-top';

interface PaletteCommandBase {
  /** 全表唯一。也用作 `<li id>` 的后缀（`aria-activedescendant` 指它）。 */
  id: string;
  label: string;
  group: PaletteGroup;
  /** 同义词 / 英文名 / 路径片段。命中关键词**不高亮标题**（标题里找不到那些字符）。 */
  keywords?: readonly string[];
}

export interface PaletteNavCommand extends PaletteCommandBase {
  kind: 'nav';
  href: string;
}

export interface PaletteActionCommand extends PaletteCommandBase {
  kind: 'action';
  action: PaletteAction;
}

export type PaletteCommand = PaletteNavCommand | PaletteActionCommand;

/**
 * 十六格。刻意**不**把 Studio / 项目页写进来：它们要 `projectId`，
 * 写死一个假 id 只会得到 404，写成一个"先选项目"的中间态又会让面板里出现
 * 一栏没有终点的入口。项目的入口在首页与发现页，那两条已经在表里。
 */
export const PALETTE_COMMANDS: readonly PaletteCommand[] = [
  { kind: 'nav', id: 'home', label: '首页', group: 'go', href: '/', keywords: ['home', 'index', 'nexus', '开始'] },
  { kind: 'nav', id: 'discover', label: '发现', group: 'go', href: '/discover', keywords: ['discover', 'explore', 'trending', '热门', '逛逛'] },
  { kind: 'nav', id: 'search', label: '搜索', group: 'go', href: '/search', keywords: ['search', 'find', 'query', '查找', '检索'] },
  { kind: 'nav', id: 'ship', label: '交付日志', group: 'go', href: '/ship', keywords: ['ship', 'changelog', 'log', '日志', '发布', '更新', '进展', '刊物'] },
  { kind: 'nav', id: 'about', label: '关于 NEXUS', group: 'go', href: '/about-nexus', keywords: ['about', 'story', 'why', '原则', '关于', '为什么', '我们是谁'] },
  { kind: 'nav', id: 'blocks', label: '积木库', group: 'go', href: '/blocks', keywords: ['blocks', 'block', '组件', '素材', '积木'] },
  { kind: 'nav', id: 'marketplace', label: '市场', group: 'go', href: '/marketplace', keywords: ['market', 'marketplace', 'store', '商店', '市集'] },
  { kind: 'nav', id: 'analytics', label: '创作数据', group: 'view', href: '/analytics', keywords: ['analytics', 'stats', 'insights', '统计', '数据', '曲线'] },
  { kind: 'nav', id: 'notifications', label: '通知', group: 'view', href: '/notifications', keywords: ['notifications', 'inbox', '消息', '提醒', '铃'] },
  { kind: 'nav', id: 'credits', label: '额度', group: 'view', href: '/credits', keywords: ['credits', 'quota', 'usage', '用量', '余额', '点数'] },
  { kind: 'nav', id: 'api-tokens', label: 'API 令牌', group: 'view', href: '/api-tokens', keywords: ['tokens', 'token', 'api', 'key', 'secret', '密钥', '令牌'] },
  { kind: 'nav', id: 'profile', label: '我的主页', group: 'view', href: '/u', keywords: ['profile', 'me', 'account', '个人', '主页'] },
  { kind: 'nav', id: 'purchases', label: '我的购买', group: 'view', href: '/marketplace/purchases', keywords: ['purchases', 'orders', '已购', '订单'] },
  { kind: 'nav', id: 'earnings', label: '我的收益', group: 'view', href: '/marketplace/earnings', keywords: ['earnings', 'revenue', 'income', '收入', '赚'] },
  { kind: 'nav', id: 'reports', label: '举报工单', group: 'view', href: '/marketplace/reports', keywords: ['reports', 'tickets', '工单', '举报'] },
  { kind: 'action', id: 'toggle-theme', label: '切换主题', group: 'act', action: 'toggle-theme', keywords: ['theme', 'dark', 'light', '暗', '浅色', '深色'] },
  { kind: 'action', id: 'copy-link', label: '复制当前页链接', group: 'act', action: 'copy-link', keywords: ['copy', 'url', 'link', '链接', '分享'] },
  { kind: 'action', id: 'scroll-top', label: '回到顶部', group: 'act', action: 'scroll-top', keywords: ['top', 'scroll', '顶部', '最上'] },
];

/**
 * 按分组切成渲染用的块，组内保持传入顺序（空组自动消失）。
 *
 * 分组键由调用方给：组件那边拿到的是**排过序的 `Ranked<>` 包装**（`{item, score, ranges}`），
 * 分组键在 `entry.item.group` 上。让这个函数自己知道"怎么从包装里掏 group"会把
 * 面板的渲染形状焊进数据层；给一个取值函数则两边都不用为对方变形。
 */
export function groupOf<T>(
  commands: readonly T[],
  keyOf: (command: T) => PaletteGroup,
): { group: PaletteGroup; items: T[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    items: commands.filter((command) => keyOf(command) === group),
  })).filter((block) => block.items.length > 0);
}
