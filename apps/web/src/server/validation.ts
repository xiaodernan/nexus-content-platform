import { z } from 'zod';
import { validateDocument, hasErrors, type DesignDocument } from '@nexus/design-model';

/**
 * HTTP 边界的入站校验。设计模型的权威形状在 @nexus/design-model 的 TS 类型里，
 * 这里只做"能不能安全落库"的最小约束（大小、类型、必需字段），
 * 结构一致性（孤儿节点、环、重复 id）交给 validateDocument —— 不静默修数据（§159）。
 */

const record = z.record(z.string(), z.unknown());

export const DocumentEnvelope = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(120),
  activePageId: z.string().min(1),
  pages: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1).max(120),
        rootId: z.string().min(1),
        nodes: z.record(z.string(), record),
        width: z.number().int().min(1).max(20000),
        height: z.number().int().min(1).max(40000),
        backgroundColor: z.unknown().optional(),
        meta: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(64),
  components: z.array(record).max(512),
  tokens: z.array(record).max(2000),
  assets: z.array(record).max(2000),
  variables: z.array(record).max(2000),
  activeMode: z.string().nullable().optional(),
  brandKit: z.unknown().optional(),
  visualDna: z.unknown().optional(),
  metadata: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
    modes: z.array(z.string()),
  }),
});

export const MAX_NODES_PER_PAGE = 4000;

/** 返回人类可读的拒绝原因；成功时返回强转后的文档 */
export function parseDocument(body: unknown): { ok: true; document: DesignDocument } | { ok: false; issues: string[] } {
  const parsed = DocumentEnvelope.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`),
    };
  }
  for (const page of parsed.data.pages) {
    if (Object.keys(page.nodes).length > MAX_NODES_PER_PAGE) {
      return { ok: false, issues: [`页面 ${page.name} 节点数超过上限 ${MAX_NODES_PER_PAGE}`] };
    }
  }
  const document = parsed.data as unknown as DesignDocument;
  const errors = validateDocument(document).filter((i) => i.severity === 'error');
  if (hasErrors(errors)) {
    return { ok: false, issues: errors.map((i) => `${i.code}: ${i.message}`) };
  }
  return { ok: true, document };
}
