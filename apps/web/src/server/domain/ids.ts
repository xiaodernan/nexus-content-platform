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
 * 免得两处形状各说各话。zod 的 uuid 校验是 RFC 4122 的形状，比手抄的严一点点
 * （版本位与变体位），真实 id（`defaultRandom()`）两种都认——严的那几位
 * 恰好是"长得像 UUID 但不是 UUID"的输入，本来就该按不存在处理。
 */
const UuidSchema = z.string().uuid();

export function isUuid(value: string): boolean {
  return UuidSchema.safeParse(value).success;
}
