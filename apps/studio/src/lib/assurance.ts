/**
 * M7 Stage B — verified assurance 的客户端类型边界（预设计，受 ADR 0018 阻塞）。
 *
 * 纯前端，不引入 fetch、localStorage、session 或任何服务端依赖。不生成 `verified`：
 * 客户端永远只贴 `unsigned-local` 的 claim（见 `currentAccount` / `accounts.ownerClaim`）。
 * 这个模块只定义“客户端将来会读到什么，以及如何把它渲染成页面上的文字”，这样 ADR 0018
 * 一合并、服务端开始下发 `verified` assurance，这里只需接线，无需重新设计。
 *
 * 与 ADR 0018 §60 一致：无 signedIn 徽章、无会话、无 cookie，客户端不自行签发 `verified`。
 */

export type Assurance = 'unsigned-local' | 'verified';

/** 客户端认得的 assurance 值。Stage B 实施时，服务端开始下发 'verified'，客户端这里已准备好。 */
export const KNOWN_ASSURANCES: ReadonlySet<Assurance> = new Set(['unsigned-local', 'verified']);

/** 判断一条 assurance 是否在客户端认可的集合里（防御性读取，服务端可能下发未知值）。 */
export function isKnownAssurance(value: unknown): value is Assurance {
  return typeof value === 'string' && KNOWN_ASSURANCES.has(value as Assurance);
}

/** 把一个 publication 的作者信息渲染成 `by <handle> · <assurance>` 这一行。owner 为 null 时不渲染。
 *  与 explore.ts / artifact.ts 保持同一套转义规则：caller-controlled handle 不得原样插入。
 */
export function renderOwnerLine(
  owner: { handle: string; assurance: Assurance } | null,
  escape: (text: string) => string,
): string | null {
  if (!owner) return null;
  return `by ${escape(owner.handle)} · ${owner.assurance}`;
}

/** `/explore` / `/p/{id}` 上的作者行：assurance === 'verified' 时带 verified 标记，样式由 CSS 层决定。 */
export function renderOwnerLineWithBadge(
  owner: { handle: string; assurance: Assurance } | null,
  escape: (text: string) => string,
): string | null {
  if (!owner) return null;
  const badge = owner.assurance === 'verified' ? ' (verified)' : '';
  return `by ${escape(owner.handle)} · ${owner.assurance}${badge}`;
}