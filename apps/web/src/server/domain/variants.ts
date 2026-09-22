import {
  buildConcepts,
  mergeConceptDocuments,
  type DesignDocument,
} from '@nexus/design-model';
import { loadDocument } from './projects';
import { createVariantBranch, listBranches, type BranchMeta } from './branches';
import { readSnapshot } from './snapshots';

/**
 * §29 多方案生成。一条方案 = 一条分支 + 那份方案的文档（落在分支的 head 上）。
 *
 * 为什么不另立"变体表"：§28 已经规定方向是分支线，§27 规定历史是快照。
 * 再造一套并行状态就有两处会漂移的地方——生成、比较、采纳、回到历史全部走同一套原语。
 *
 * 生成时工作区不动（advanceWorkspace=false）：候选是给人挑的，不是自动采纳。
 */

export interface VariantEntry {
  branch: BranchMeta;
  snapshotId: string;
  label: string | null;
  /** 这个方向改了什么（结构 + 视觉语言），画在卡片上 */
  description: string | null;
  document: DesignDocument;
}

export interface VariantActor {
  createdById?: string | null;
}

export type VariantResult<T> =
  | { ok: true; value: T; notes: string[] }
  | { ok: false; reason: string };

/** 分支名撞车时加序号：重复点"生成 4 个方案"要能再来一组，而不是报错 */
function freeName(base: string, taken: Set<string>): { name: string; renamed: boolean } {
  if (!taken.has(base)) return { name: base, renamed: false };
  for (let i = 2; i <= 20; i += 1) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return { name: candidate, renamed: true };
  }
  return { name: base, renamed: true };
}

async function toEntry(projectId: string, branch: BranchMeta): Promise<VariantEntry | null> {
  if (!branch.headSnapshotId) return null;
  const head = await readSnapshot(projectId, branch.headSnapshotId);
  if (!head) return null;
  return {
    branch,
    snapshotId: head.id,
    label: head.label,
    description: head.summary,
    document: head.document,
  };
}

/** 所有有 head 的分支都能并排比较：main 上的当前方向也在里面 */
export async function listVariants(projectId: string): Promise<VariantEntry[]> {
  const branches = await listBranches(projectId);
  const entries = await Promise.all(branches.map((branch) => toEntry(projectId, branch)));
  return entries.filter((entry): entry is VariantEntry => !!entry);
}

export async function generateVariants(
  projectId: string,
  input: { count?: number } & VariantActor,
): Promise<VariantResult<VariantEntry[]>> {
  const current = await loadDocument(projectId);
  if (!current) return { ok: false, reason: '项目不存在或还没有设计文档' };
  const count = Math.max(1, Math.min(4, Math.round(input.count ?? 4)));
  const specs = buildConcepts(current, count);
  const taken = new Set((await listBranches(projectId)).map((b) => b.name));
  const notes: string[] = [];
  const created: VariantEntry[] = [];
  for (const spec of specs) {
    const { name, renamed } = freeName(spec.branchName, taken);
    taken.add(name);
    if (renamed) notes.push(`${spec.branchName} 已经存在，这条记作 ${name}。`);
    const branch = await createVariantBranch(projectId, {
      name,
      document: spec.document,
      label: `生成方案 ${spec.letter}（${spec.structureLabel} · ${spec.languageLabel}）`,
      summary: `结构：${spec.structureLabel} · 视觉：${spec.languageLabel} · ${spec.notes.length ? '部分改动未生效' : '全部改动已落地'}`,
      createdById: input.createdById,
    });
    if (!branch) {
      notes.push(`方案 ${spec.letter} 没能落成分支（${name} 已存在）。`);
      continue;
    }
    const entry = await toEntry(projectId, branch);
    if (!entry) {
      notes.push(`方案 ${spec.letter} 的分支建了但 head 快照没读到。`);
      continue;
    }
    for (const note of spec.notes) notes.push(`方案 ${spec.letter}：${note}`);
    created.push(entry);
  }
  if (!created.length) return { ok: false, reason: notes.join('；') || '没有生成任何方案' };
  return { ok: true, value: created, notes };
}

/** §29 "Combine A's layout with C's visual style"：结构取自一条分支，视觉取自另一条 */
export async function mergeVariants(
  projectId: string,
  input: { layoutBranchId: string; visualBranchId: string; name?: string | null } & VariantActor,
): Promise<VariantResult<VariantEntry>> {
  const branches = await listBranches(projectId);
  const layoutBranch = branches.find((b) => b.id === input.layoutBranchId);
  const visualBranch = branches.find((b) => b.id === input.visualBranchId);
  if (!layoutBranch) return { ok: false, reason: '布局来源分支不存在' };
  if (!visualBranch) return { ok: false, reason: '视觉来源分支不存在' };
  const layout = await toEntry(projectId, layoutBranch);
  const visual = await toEntry(projectId, visualBranch);
  if (!layout) return { ok: false, reason: `「${layoutBranch.name}」还没有可用作布局的快照` };
  if (!visual) return { ok: false, reason: `「${visualBranch.name}」还没有可用作视觉的快照` };

  // 不传 name：合出来的那条方向沿用项目名，改名是另一件事（分支名已经说明了它是谁）
  const { document, notes } = mergeConceptDocuments(layout.document, visual.document);
  const taken = new Set(branches.map((b) => b.name));
  const requested = (input.name ?? '').trim();
  const base = requested || `mix-${shortName(layoutBranch.name)}-${shortName(visualBranch.name)}`;
  if (!/^[0-9A-Za-z_\u4e00-\u9fa5][0-9A-Za-z._\-\u4e00-\u9fa5]{0,39}$/.test(base)) {
    return { ok: false, reason: '方案名只能包含字母、数字、下划线、点、连字符或中文，且不超过 40 个字符' };
  }
  const { name, renamed } = freeName(base, taken);
  if (renamed) notes.push(`${base} 已经存在，这条记作 ${name}。`);
  const branch = await createVariantBranch(projectId, {
    name,
    document,
    label: `合成方案 ${name}（${layoutBranch.name} 布局 + ${visualBranch.name} 视觉）`,
    summary: `布局：${layoutBranch.name} · 视觉：${visualBranch.name}`,
    createdById: input.createdById,
  });
  if (!branch) return { ok: false, reason: `已经有叫 ${name} 的分支` };
  const entry = await toEntry(projectId, branch);
  if (!entry) return { ok: false, reason: '合成分支建了但 head 快照没读到' };
  return { ok: true, value: entry, notes };
}

function shortName(name: string): string {
  return name.replace(/^concept-/, '').slice(0, 8) || 'x';
}
