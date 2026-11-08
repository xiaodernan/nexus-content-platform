import { z } from 'zod';
import {
  AiChatRequestSchema,
  AiChatResponseSchema,
  AiErrorSchema,
  AiJobAcceptedSchema,
  AiJobStatusResponseSchema,
  AiRequestSchema,
  AiResponseSchema,
  DesignPatchSchema,
  HealthResponseSchema,
  RealtimeEventSchema,
  ScreenshotRequestSchema,
  ScreenshotResponseSchema,
} from './index';

/**
 * web（TS/zod）与 ai-service（Python）共用一份契约（docs/ARCHITECTURE.md 边界纪律 4）。
 * zod 是唯一权威定义；`scripts/export-ai-contract.mts` 把这里列出的条目导出成 JSON Schema，
 * Python 侧运行期按导出的文件校验，测试再保证仓库里的文件没有漂移。
 *
 * io:'input' 允许缺省字段走 default；io:'output' 要求返回时字段齐全。
 */
export const CONTRACT_EXPORTS: { file: string; schema: z.ZodType; io: 'input' | 'output' }[] = [
  { file: 'ai-request.schema.json', schema: AiRequestSchema, io: 'input' },
  { file: 'ai-response.schema.json', schema: AiResponseSchema, io: 'output' },
  { file: 'ai-chat-request.schema.json', schema: AiChatRequestSchema, io: 'input' },
  { file: 'ai-chat-response.schema.json', schema: AiChatResponseSchema, io: 'output' },
  { file: 'ai-error.schema.json', schema: AiErrorSchema, io: 'output' },
  { file: 'ai-job-accepted.schema.json', schema: AiJobAcceptedSchema, io: 'output' },
  { file: 'ai-job-status.schema.json', schema: AiJobStatusResponseSchema, io: 'output' },
  { file: 'design-patch.schema.json', schema: DesignPatchSchema, io: 'input' },
  { file: 'health.schema.json', schema: HealthResponseSchema, io: 'output' },
  { file: 'screenshot-request.schema.json', schema: ScreenshotRequestSchema, io: 'input' },
  { file: 'screenshot-response.schema.json', schema: ScreenshotResponseSchema, io: 'output' },
  { file: 'realtime-event.schema.json', schema: RealtimeEventSchema, io: 'output' },
];

export function renderContract(file: string): string {
  const entry = CONTRACT_EXPORTS.find((e) => e.file === file);
  if (!entry) throw new Error(`未登记的契约文件 ${file}`);
  return `${JSON.stringify(z.toJSONSchema(entry.schema, { target: 'draft-2020-12', io: entry.io, unrepresentable: 'any' }), null, 2)}\n`;
}
