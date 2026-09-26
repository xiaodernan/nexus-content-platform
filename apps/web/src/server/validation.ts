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

/**
 * 整份文档的节点上限。
 *
 * 这里原来挡的是**单页**（`MAX_NODES_PER_PAGE = 4000`，没有 ADR、没有用例引用）。那道门两头都不成立：
 * ① 它没约束住它想约束的东西——`DocumentEnvelope` 允许 64 页，所以 25.6 万节点的文档照样存得进去，
 *    一页 5000 反而不行；
 * ② 它正好把 §146 要的最高档挡在门外：2026-09-27 拿浏览器压测脚本真打 `PUT /api/projects/[id]`，
 *    单页 10000 节点回的是 `400 页面 Home 节点数超过上限 4000`。
 *    而模型层基准早就把 10000 节点写进过一页（`docs/PERFORMANCE.md`），集成测试那条
 *    "一个页面 8000 个节点仍然存得下来"走的是 `saveDocument`、绕过了这道门——所以这条绿从来没测过用户实际走的路径。
 *
 * 改成按整份文档计，数值取 §146 最高档（10000）的两倍：顶档必须过，还要留一倍余量给真实项目
 * （一页 10000 实测：首帧 1.76–1.81s、属性写入到画布 583–763ms、JS 堆峰值 145–161MB，
 *  口径 `prod-adr0015`，见 `docs/PERFORMANCE.md`）。
 * 要再往上走（30k+）得先做完结构共享与增量保存，那时再改这个数并留一条新的测量记录。
 */
export const MAX_NODES_PER_DOCUMENT = 20_000;

/** 返回人类可读的拒绝原因；成功时返回强转后的文档 */
export function parseDocument(body: unknown): { ok: true; document: DesignDocument } | { ok: false; issues: string[] } {
  const parsed = DocumentEnvelope.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`),
    };
  }
  const nodeCount = parsed.data.pages.reduce((sum, page) => sum + Object.keys(page.nodes).length, 0);
  if (nodeCount > MAX_NODES_PER_DOCUMENT) {
    return {
      ok: false,
      issues: [`整份文档 ${nodeCount} 个节点，超过上限 ${MAX_NODES_PER_DOCUMENT}`],
    };
  }
  const document = parsed.data as unknown as DesignDocument;
  const errors = validateDocument(document).filter((i) => i.severity === 'error');
  if (hasErrors(errors)) {
    return { ok: false, issues: errors.map((i) => `${i.code}: ${i.message}`) };
  }
  return { ok: true, document };
}
