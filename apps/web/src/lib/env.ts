import type { CapabilityStatus } from '@nexus/schemas';

/**
 * Provider 凭据只从进程环境读取（本地开发放 `.env.local`，部署由平台注入）。
 * 绝不复用 IDE 运行时凭据，也不把 key 写进仓库（§80 / docs/SECURITY.md）。
 */
const TEXT_KEYS = ['NEXUS_OPENAI_API_KEY', 'NEXUS_ANTHROPIC_API_KEY', 'NEXUS_GOOGLE_GEMINI_API_KEY'];
const IMAGE_KEYS = ['NEXUS_IMAGE_API_KEY', 'NEXUS_OPENAI_API_KEY'];
const VIDEO_KEYS = ['NEXUS_VIDEO_API_KEY'];

export interface AiCapabilities {
  text: CapabilityStatus;
  image: CapabilityStatus;
  video: CapabilityStatus;
  /** UI 必须在 false 时常驻 DEMO MODE 标识（§160） */
  live: boolean;
}

function hasAny(names: string[]): boolean {
  return names.some((name) => {
    const value = process.env[name];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

export function getAiCapabilities(): AiCapabilities {
  const text = hasAny(TEXT_KEYS);
  const image = hasAny(IMAGE_KEYS);
  const video = hasAny(VIDEO_KEYS);
  return {
    text: text ? 'real' : 'demo',
    image: image ? 'real' : 'demo',
    video: video ? 'real' : 'demo',
    live: text,
  };
}

export function isDemoMode(): boolean {
  return !getAiCapabilities().live;
}
