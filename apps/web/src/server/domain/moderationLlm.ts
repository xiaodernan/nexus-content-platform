import { walkDocument, type DesignDocument } from '@nexus/creative-model';
import type { ModerationScan } from '@nexus/schemas';
import {
  MODERATION_LLM_SYSTEM,
  augmentScan,
  buildModerationPrompt,
  parseModerationReply,
} from '@/lib/llm-moderation';
import { chatWithCharacter } from '../ai/client';
import { MODERATION_RULES_VERSION, scanPublication, type AssetProvenance } from './moderation';

/**
 * §MOD-1 · 机检之后的 LLM 上下文二段研判（接线层）。
 *
 * 纪律（与 moderationAssist 一致）：只补"需人工看的线索"，不裁决、不撤内容、不写 approved。
 * 机检的 blocked 是确定性红线，模型碰不到；模型线索最多把 clear 升到 review。
 * 任何失败（provider 不可用 / 坏形状 / 异常）都原样返回机检 scan——增强不是门。
 */

export function llmModerationEnabled(env: { NEXUS_MODERATION_LLM?: string; NODE_ENV?: string } = process.env): boolean {
  const flag = (env.NEXUS_MODERATION_LLM ?? '').trim();
  if (flag === '1') return true;
  if (flag === '0') return false;
  return env.NODE_ENV !== 'test'; // 生产开、测试关：现有审核集成判据断言 clear/blocked，测试机可能连着真 provider
}

/** 抽出来复用 moderation.ts 的可见文本口径：node.text 与 node.alt，只算访客看得见的。 */
export function visibleTextsOf(document: DesignDocument): string[] {
  const out: string[] = [];
  walkDocument(document, (node) => {
    for (const v of [node.text, node.alt]) {
      if (typeof v === 'string' && v.trim()) out.push(v.trim());
    }
  });
  return out;
}

/**
 * 增强版扫描：机检照常跑（同步、确定性），然后由模型补上下文线索。
 * chat 可注入，便于用假 chat 钉住 real/fallback 四条分支。
 */
export async function scanPublicationWithLlm(
  document: DesignDocument,
  assets: AssetProvenance[],
  chat: typeof chatWithCharacter = chatWithCharacter,
): Promise<{ scan: ModerationScan; llmUsed: boolean; llmFindings: number }> {
  const scan = scanPublication(document, assets);
  if (!llmModerationEnabled()) return { scan, llmUsed: false, llmFindings: 0 };

  const visible = visibleTextsOf(document);
  if (!visible.length) return { scan, llmUsed: false, llmFindings: 0 };

  try {
    const result = await chat({
      requestId: `moderation-llm-${Date.now().toString(36)}`,
      system: MODERATION_LLM_SYSTEM,
      user: buildModerationPrompt(visible),
      modelClass: 'balanced',
    });
    if (!result.ok) return { scan, llmUsed: false, llmFindings: 0 };
    const findings = parseModerationReply(result.response.text, visible);
    if (!findings.length) return { scan, llmUsed: true, llmFindings: 0 };
    return { scan: augmentScan(scan, findings), llmUsed: true, llmFindings: findings.length };
  } catch {
    // 增强不是门：模型这次没成，机检结果原样交付
    return { scan, llmUsed: false, llmFindings: 0 };
  }
}

/** 给复核队列/面板显示用的规则版本标签：机检版本 + 是否叠了 LLM 研判层。 */
export function rulesVersionWithLlm(llmUsed: boolean): string {
  return llmUsed ? `${MODERATION_RULES_VERSION}+llm` : MODERATION_RULES_VERSION;
}
