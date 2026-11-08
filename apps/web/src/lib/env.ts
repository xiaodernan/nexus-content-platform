import type { CapabilityStatus, HealthResponse } from '@nexus/schemas';
import { fetchAiServiceHealth } from '@/server/ai/client';

/**
 * Provider 能力判定（§160 DEMO MODE 标识的真值来源）。
 *
 * 关键边界（docs/SECURITY.md「密钥与配置」）：**web 进程永不持有 provider key**。
 * 早期版本靠"web 环境里有没有 key"来判断是否走真实链路，既违背该边界，也会在
 * "ai-service 有 key 但 web 没有"时误判成 DEMO。现在改为向 ai-service 的 /healthz
 * 询问它自己的 provider 就绪状态——key 只活在 ai-service 进程里。
 *
 * 拿不到 ai-service（未启动 / 不可达）时如实回落到 'demo'，绝不编造真实状态（§159）。
 */
export interface AiCapabilities {
  text: CapabilityStatus;
  image: CapabilityStatus;
  video: CapabilityStatus;
  /** UI 必须在 false 时常驻 DEMO MODE 标识（§160） */
  live: boolean;
}

/**
 * @param prefetched 可选：调用方已经拿到的 /healthz 结果，避免同一次渲染里重复探测。
 *   传 null 表示"探测过但不可达"，与"没探测（undefined）"区分开。
 */
export async function getAiCapabilities(prefetched?: HealthResponse | null): Promise<AiCapabilities> {
  const health = prefetched === undefined ? await fetchAiServiceHealth() : prefetched;
  const statusOf = (kind: string): CapabilityStatus =>
    health?.providers.find((p) => p.kind === kind)?.status === 'real' ? 'real' : 'demo';
  // 文本链路以 ai-service 汇总的 capability 为准（llm provider 就绪即 real）。
  const text: CapabilityStatus = health?.capability === 'real' ? 'real' : 'demo';
  // 图像 / 视频 provider 属于 M2 / M5，本里程碑恒为 demo（health 里若出现 real 才升级）。
  const image = statusOf('image');
  const video = statusOf('video');
  return { text, image, video, live: text === 'real' };
}

export async function isDemoMode(): Promise<boolean> {
  return !(await getAiCapabilities()).live;
}
