import { z } from 'zod';

/**
 * UUID 形状校验——**只此一处**。
 *
 * 从路由进来的 id 大多是路径参数（`[projectId]`、`[assetId]`、`[caseId]`…），
 * Next 只保证它们是字符串。一个 `not-a-uuid` 直进 `eq(id, …)` 时，
 * Postgres 抛的是 `invalid input syntax for type uuid`（22P02）——
 * 于是"这个东西不存在"在界面上变成了 500。域函数把形状不对的 id 当成
 * "查不到"（返回 null / false / `{ ok: false }`），路由侧就只剩 404 / 409
 * 这一种说法：与 v1 项目详情同一口径（"不在这一枚凭据的人名下，或者已被删除——
 * 两者都给同一个答案"，没有"存在但不给你看"那种可分辨的差别，§159）。
 *
 * 资产域此前自己抄了一份正则（assets.ts 的 `UUID_SHAPE`）；那份在这里统一，
 * 免得两处形状各说各话。**2026-10-24 又发现三份手抄的正则**
 * （`api/avatar/[userId]/[file]`、`domain/analytics.ts`、`domain/analytics-agent.ts`），
 * 一并收回到这里。
 *
 * 与手抄正则的实际差别（拿 zod 4.6.5 实测，不是猜的）：**只在第四组第一位**——
 * zod 要求它是 `8/9/a/b`（RFC 4122 的变体位），手抄的那份收任何十六进制。
 * 另外 zod 额外放行全 0 与全 f 两个特例。版本位（第三组第一位）两边都不管。
 * 用 2000 个 `crypto.randomUUID()` 对拍：**0 处分歧**——真实 id 两种都认。
 * 被 zod 挡下的那几位恰好是"长得像 UUID 但不是 UUID"的输入，
 * 本来就该按不存在处理，所以合并是行为等价且更严一点。
 */
const UuidSchema = z.string().uuid();

export function isUuid(value: string): boolean {
  return UuidSchema.safeParse(value).success;
}
