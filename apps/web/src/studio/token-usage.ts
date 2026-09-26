import { collectTokenRefs, type DesignDocument } from '@nexus/design-model';

/**
 * §12 设计系统面板的"有多少节点在引用它"（§147 顺手把它从 O(节点数 × token 数) 降下来）。
 *
 * 为什么单独放一个文件而不是留在组件里：这段算法有**语义**要钉住，
 * 而组件里那段是算不出单测的。语义有两条：
 *
 * 1. **一个节点多次引用同一个 token 只算一次**（面板上写的是"N 处引用"，
 *    指的是"有 N 个节点在用它"，不是"N 个字段提到过它"）。
 * 2. **只认样式类字段里的绑定**，不认节点名字或正文里出现的 `"{color.primary}"`。
 *    旧实现把整个节点 `JSON.stringify` 一遍再拿每个 token 去 `includes`，
 *    于是"名字里写了 `{color.primary}`"也会被算成引用——而 lint 不这么认为。
 *    现在两处共用 `collectTokenRefs`（与 lint / health / 目录同一套算法），
 *    同一个模型的投影不再各说各话（§16）。
 *
 * 组件那一路保持旧的字符串扫描：`ComponentDefinition` 不是节点形状，`collectTokenRefs` 收不了它，
 * 而组件数量少，代价可以接受。
 */
export function tokenUsage(document: DesignDocument): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);

  for (const page of document.pages) {
    for (const node of Object.values(page.nodes)) {
      // collectTokenRefs 每个 key 只返回一次，正好对上"一个节点只算一次"
      for (const key of collectTokenRefs(node)) bump(key);
    }
  }

  for (const component of document.components) {
    const serialized = JSON.stringify(component);
    for (const token of document.tokens) {
      // 绑定写的是 "{color.primary}" 这种花括号引用，不是裸 key
      if (serialized.includes(`"{${token.key}}"`)) bump(token.key);
    }
  }

  return counts;
}
