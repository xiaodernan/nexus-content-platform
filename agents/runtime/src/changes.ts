/**
 * M2 v7 (§25 structured handoffs over real code): pure change-set machinery.
 * No child_process, no git binary — we produce unified diffs a human can review and apply
 * externally, which is the honest substitute for a "git commit tool" (§60). All functions
 * are deterministic string→data transforms except the injected-fs ledger in `ledger.ts`.
 */
export type OpType = 'ctx' | 'add' | 'del';

export interface LineOp {
  type: OpType;
  text: string;
}

export interface FilePatch {
  path: string;
  ops: LineOp[];
  added: number;
  removed: number;
}

export interface ChangeSet {
  runId: string;
  files: FilePatch[];
}

const LCS_CELL_BUDGET = 4_000_000;

/** Line-level LCS diff. Oversized inputs degrade to a whole-file replace rather than explode. */
export function computeFilePatch(path: string, before: string, after: string): FilePatch {
  const a = before === '' ? [] : before.split('\n');
  const b = after === '' ? [] : after.split('\n');
  let ops: LineOp[];
  if (a.length * b.length > LCS_CELL_BUDGET) {
    ops = [...a.map((text) => ({ type: 'del' as const, text })), ...b.map((text) => ({ type: 'add' as const, text }))];
  } else {
    ops = lcsOps(a, b);
  }
  return {
    path,
    ops,
    added: ops.filter((o) => o.type === 'add').length,
    removed: ops.filter((o) => o.type === 'del').length,
  };
}

function lcsOps(a: string[], b: string[]): LineOp[] {
  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const ops: LineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'ctx', text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: 'del', text: a[i]! });
      i++;
    } else {
      ops.push({ type: 'add', text: b[j]! });
      j++;
    }
  }
  while (i < n) ops.push({ type: 'del', text: a[i++]! });
  while (j < m) ops.push({ type: 'add', text: b[j++]! });
  return ops;
}

/** Replay a patch; every consumed context/deletion line must match or it throws. */
export function applyPatch(before: string, patch: FilePatch): string {
  const lines = before === '' ? [] : before.split('\n');
  const out: string[] = [];
  let cursor = 0;
  for (const op of patch.ops) {
    if (op.type === 'add') {
      out.push(op.text);
    } else {
      const have = lines[cursor];
      if (have !== op.text) throw new Error(`patch does not apply at line ${cursor + 1} of ${patch.path}`);
      cursor++;
      if (op.type === 'ctx') out.push(op.text);
    }
  }
  if (cursor !== lines.length) throw new Error(`patch consumed only ${cursor}/${lines.length} lines of ${patch.path}`);
  return out.join('\n');
}

export function inversePatch(patch: FilePatch): FilePatch {
  const ops = patch.ops.map<LineOp>((o) => (o.type === 'add' ? { type: 'del', text: o.text } : o.type === 'del' ? { type: 'add', text: o.text } : o));
  return { path: patch.path, ops, added: patch.removed, removed: patch.added };
}

/** Diff of two `path → content` snapshots; only changed paths appear ('' = created/removed end). */
export function createChangeSet(runId: string, before: Record<string, string>, after: Record<string, string>): ChangeSet {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const files: FilePatch[] = [];
  for (const path of paths) {
    const b = before[path] ?? '';
    const a = after[path] ?? '';
    if (b !== a) files.push(computeFilePatch(path, b, a));
  }
  return { runId, files };
}

/** Git-style unified diff with `context` lines of surrounding context per hunk. */
export function formatUnifiedDiff(patch: FilePatch, context = 3): string {
  const out: string[] = [`--- a/${patch.path}`, `+++ b/${patch.path}`];
  const hunks = splitHunks(patch.ops, context);
  for (const h of hunks) {
    const oldStart = h.beforeLine;
    const newStart = h.afterLine;
    const oldLen = h.ops.filter((o) => o.type !== 'add').length;
    const newLen = h.ops.filter((o) => o.type !== 'del').length;
    out.push(`@@ -${oldStart},${oldLen} +${newStart},${newLen} @@`);
    for (const op of h.ops) {
      const prefix = op.type === 'add' ? '+' : op.type === 'del' ? '-' : ' ';
      out.push(prefix + op.text);
    }
  }
  return out.join('\n') + '\n';
}

interface Hunk {
  ops: LineOp[];
  beforeLine: number;
  afterLine: number;
}

function splitHunks(ops: LineOp[], context: number): Hunk[] {
  const changeIdx = ops.map((o, i) => (o.type === 'ctx' ? -1 : i)).filter((i) => i >= 0);
  if (changeIdx.length === 0) return [];
  const groups: { start: number; end: number }[] = [];
  for (const idx of changeIdx) {
    const last = groups[groups.length - 1];
    if (last && idx - last.end <= 2 * context) last.end = idx;
    else groups.push({ start: idx, end: idx });
  }
  return groups.map(({ start, end }) => {
    const from = Math.max(0, start - context);
    const to = Math.min(ops.length - 1, end + context);
    let beforeLine = 1;
    let afterLine = 1;
    for (let i = 0; i < from; i++) {
      if (ops[i]!.type !== 'add') beforeLine++;
      if (ops[i]!.type !== 'del') afterLine++;
    }
    return { ops: ops.slice(from, to + 1), beforeLine, afterLine };
  });
}
