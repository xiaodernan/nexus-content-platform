import type { DesignDocument, Page } from './types';

/**
 * §167 "interactive" 这一种分享方式的最小运行时语义：
 * **点了就换页**（`trigger: 'click'` + `action: 'navigate'` + target 是本文档里另一页）。
 *
 * 之所以只认这一种，是因为公开页今天真能做对的只有它：
 * 悬浮、提交、状态切换、弹窗、动画都要一套运行时状态机，半套比没有更糟——
 * 用户会以为"设计稿里写了"就等于"公开页会跑"（§159）。
 *
 * 判定放在模型层（而不是页面里现写一遍）：公开页、上报路由、分析页三处要对"什么叫终点"
 * 给出同一个答案，抄三份迟早漂。
 */

/** 页面上一个"点了会换页"的节点：nodeId → 目标页 */
export type NavigateTargets = Record<string, string>;

function pageById(document: DesignDocument, pageId: string): Page | null {
  return document.pages.find((page) => page.id === pageId) ?? null;
}

/**
 * 这一页上所有能换页的节点。
 *
 * 三条不收：
 * 1. target 不是本文档里的另一页（断链 / 自指）——点下去哪儿也不去，不是一条"下一跳"；
 * 2. 一个节点挂了多条跳转时只取第一条（公开页没有让访客选的界面，取第一条是承诺，不是猜内容）；
 * 3. 非 click 或非 navigate 的交互（悬浮 / 弹窗 / 状态）——那不在今天的运行时里。
 */
export function navigateTargetsOnPage(document: DesignDocument, pageId: string): NavigateTargets {
  const page = pageById(document, pageId);
  if (!page) return {};
  const targets: NavigateTargets = {};
  for (const node of Object.values(page.nodes)) {
    for (const interaction of node.interactions ?? []) {
      if (interaction.trigger !== 'click' || interaction.action !== 'navigate') continue;
      const target = interaction.target;
      if (typeof target !== 'string' || target === pageId) continue;
      if (!pageById(document, target)) continue;
      targets[node.id] = target;
      break;
    }
  }
  return targets;
}

/** 这一份文档里有没有任何一条真能走通的点击跳页 */
export function hasClickNavigation(document: DesignDocument): boolean {
  return document.pages.some((page) => Object.keys(navigateTargetsOnPage(document, page.id)).length > 0);
}

/**
 * 一页是不是**互动流程**的终点：这一份文档真的有可走通的点击跳页，这一页存在，
 * 且它自己没有任何能换页的节点。
 *
 * 静态文档里的任何一页都**不是**终点：没有流程可走通，把"最后一页"说成终点
 * 会让上报路由接受一份根本没交互的作品（§159）。
 * 而"从落地页直接看到终点页不算走通"这件事由客户端"本次会话至少换过一次页"的标记把住
 * （服务端只验证终点本身，不替客户端编一段走过的历史）。
 */
export function isTerminalInteractivePage(document: DesignDocument, pageId: string): boolean {
  if (!pageById(document, pageId)) return false;
  if (!hasClickNavigation(document)) return false;
  return Object.keys(navigateTargetsOnPage(document, pageId)).length === 0;
}
