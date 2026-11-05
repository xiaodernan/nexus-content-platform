/**
 * 线路失败的原因词表（§163 / 第三十九片）。
 *
 * 单独一个文件、谁都不 import，理由不是"整洁"：这本账由 `redisBus.ts` 写、由 `bus.ts` 的
 * 报文类型约束、由测试逐字断言，三处要的是**同一批字**。放在任何一处里，另外两处就得反向依赖它，
 * 而依赖一绕圈，"新增一格"就会变成"改一个文件顺带改三个 import 顺序"。
 */

/**
 * `countWireError` 的第一个参数只能是这几个字，界面上照原样印出来。
 *
 * 为什么要钉成闭合词表而不是随手一句中文：这本账唯一的作用是让运维分辨"该去看 Redis、
 * 该去看发帧的那段代码，还是该去看订阅配置"，而这句话能不能被机器判，取决于**字有没有漂**。
 * 同一个意思写成两种说法（`投递` / `发送失败`），按原因的账就碎成两行各说一半，总数还是对的。
 */
export const WIRE_ERROR_REASONS = [
  /** 发布连接自己报错（ioredis 的 `error` 事件） */
  '发布连接',
  /** 订阅连接自己报错 */
  '订阅连接',
  /** 构造时等发布连接 ready 没等到——`ready` 落定成 false 的那条路 */
  '发布连接未就绪',
  /** 构造时 `subscribe(WIRE_CHANNEL)` 抛了：线路根本没订上 */
  '订阅线路',
  /** `subscribe()` 的回执不是数字：认不出形状就算"没订上"，不猜 */
  '订阅回执形状不认识',
  /** 订阅连接上收到了**别的线路名**的帧：正常配置下永远为 0，非 0 就等于有人改错了订阅集合 */
  '线路名不认识',
  /** 帧序列化失败（内部生产者给了个 stringify 不了的东西） */
  '帧序列化',
  /** `publish` 到线路上失败：本机那半边已经送达，跨机那一半丢了 */
  '投递',
  /** 线路上的字节不是 JSON */
  '收到的帧不是 JSON',
  /** 是 JSON 但不合 `RealtimeWireFrameSchema` */
  '收到的帧不合契约',
] as const;

export type WireErrorReason = (typeof WIRE_ERROR_REASONS)[number];

/** 一本闭合的账：词表里每一格都在，没出过事的就是 0 */
export function emptyWireErrorLedger(): Record<WireErrorReason, number> {
  return Object.fromEntries(WIRE_ERROR_REASONS.map((reason) => [reason, 0])) as Record<WireErrorReason, number>;
}
