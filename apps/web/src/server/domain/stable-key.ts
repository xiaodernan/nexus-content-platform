/**
 * 键顺序无关、且与 JSON 序列化语义一致的规范化字符串。
 *
 * 两个来源都会造成「看起来不同、其实相同」：jsonb 不保留对象键顺序（它按长度 + 字节重排），
 * 而重建文档时会给缺省字段填 `undefined`——这种字段落库时会被丢弃。
 * 拿 `JSON.stringify` 直接比会把「没改动」判成「有改动」：轻则每次恢复多写一条无意义的安全快照（§27），
 * 重则增量保存把整份文档当成「全变了」重写一遍。
 *
 * 同一件事只有一处实现：快照的 `documentsMatch` 与增量保存的 `diffByKey` 都用它。
 */
export function stableKey(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableKey(record[key])}`)
    .join(',')}}`;
}
