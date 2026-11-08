/**
 * 运行时可用性声明：structuredClone 在 Node 17+ / 现代浏览器均为内建。
 * 本包 `types: []` 不引入 DOM/Node 全局，故在此声明所需最小面。
 */
declare function structuredClone<T>(
  value: T,
  options?: { transfer?: unknown[] },
): T;
