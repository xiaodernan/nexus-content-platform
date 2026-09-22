import type { FsWriteLike } from './durability.js';
import type { ToolRegistry } from './registry.js';
import type { ToolSpec } from './types.js';

/**
 * M2 v28 (§63 'test', ADR 0016 amendment 28): the `test.run` seam made first-class.
 * Until now every host hand-rolled its own one-shot verify tool; a TestRunner is a
 * PORT. The default implementation executes host-registered in-process PREDICATES over
 * a file snapshot — it spawns no subprocess and never runs a real test suite (§9 and
 * ADR 0013: real runners live behind the exec-sandbox design). The engine label is
 * carried in every report (§60: nothing here may masquerade as `npm test` output).
 */
export interface TestPredicate {
  name: string;
  /** Return null/undefined to pass; a returned string IS the failure message, verbatim. */
  check: (files: Record<string, string>) => string | null | undefined;
}

export interface TestFailure {
  name: string;
  message: string;
}

export interface TestReport {
  engine: string;
  ok: boolean;
  total: number;
  passed: number;
  failures: TestFailure[];
  detail: string;
}

export interface TestRunner {
  name: string;
  /** `only` runs the single predicate with that exact name; a miss yields total 0. */
  run(only?: string): TestReport;
}

/**
 * Deterministic evaluation: predicates run in name order (a stable sort keeps the
 * FIRST registration winning on duplicate names), and a predicate that THROWS counts
 * as a failure (`threw: …`) instead of crashing the run.
 */
export function runPredicates(engine: string, predicates: TestPredicate[], files: Record<string, string>, only?: string): TestReport {
  const sorted = [...predicates].sort((a, b) => a.name.localeCompare(b.name));
  const pack: TestPredicate[] = [];
  const seen = new Set<string>();
  for (const p of sorted) {
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    pack.push(p);
  }
  const selected = only === undefined ? pack : pack.filter((p) => p.name === only);
  const failures: TestFailure[] = [];
  for (const p of selected) {
    try {
      const message = p.check(files);
      if (typeof message === 'string') failures.push({ name: p.name, message });
    } catch (e) {
      failures.push({ name: p.name, message: `threw: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  const total = selected.length;
  const passed = total - failures.length;
  const scope = only === undefined ? '' : ` (only ${only})`;
  const vacuous = total === 0 ? ' — vacuous: no predicate ran' : '';
  return {
    engine,
    ok: failures.length === 0 && total > 0,
    total,
    passed,
    failures,
    detail: `${engine}: ${passed}/${total} passed${scope}${vacuous}${failures.length > 0 ? ` · failing: ${failures.map((f) => f.name).join(', ')}` : ''}`,
  };
}

export function predicateRunner(
  engine: string,
  predicates: TestPredicate[],
  files: () => Record<string, string> = () => ({}),
): TestRunner {
  return {
    name: engine,
    run: (only) => runPredicates(engine, predicates, files(), only),
  };
}

export const TEST_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'test.run',
    description: 'Run the host-registered in-process test predicates; output carries a structured, engine-labelled report (no subprocesses).',
    permissions: ['exec'],
    args: [{ name: 'only', type: 'string' }],
  },
];

/**
 * Registers `test.run` as the orchestrator's verification tool. The output keeps the
 * `{ ok, detail }` shape the §63 loop reads, plus the full `report` the v28 outcome
 * journals. An `only` filter that matches nothing is an ERROR, not a vacuous pass.
 */
export function registerTestTools(registry: ToolRegistry, runner: TestRunner): ToolRegistry {
  for (const spec of TEST_TOOL_SPECS) {
    registry.register(spec, (args) => {
      const only = args.only === undefined ? undefined : String(args.only);
      const report = runner.run(only);
      if (only !== undefined && report.total === 0) throw new Error(`no test predicate named "${only}"`);
      return { ok: report.ok, detail: report.detail, report };
    });
  }
  return registry;
}

/* ---- durable verdicts (mirrors the ledger/evaluation JSONL pattern) ---- */

export function formatTestLine(report: TestReport): string {
  return JSON.stringify(report);
}

/** Append one report; the seam has no native append, so the file is rewritten whole. */
export function appendTestReport(fsLike: FsWriteLike, file: string, report: TestReport): void {
  let existing = '';
  try {
    existing = fsLike.readFileSync(file, 'utf8');
  } catch {
    existing = '';
  }
  const dir = file.slice(0, file.lastIndexOf('/'));
  if (dir && dir !== file) fsLike.mkdirSync(dir, { recursive: true });
  fsLike.writeFileSync(file, (existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`) + formatTestLine(report) + '\n', 'utf8');
}

/** Read the log; `last` keeps only the trailing N well-formed records. */
export function loadTestReports(
  fsLike: { readFileSync(p: string, e: 'utf8'): string },
  file: string,
  last?: number,
): { reports: TestReport[]; malformed: number } {
  let text: string;
  try {
    text = fsLike.readFileSync(file, 'utf8');
  } catch {
    return { reports: [], malformed: 0 };
  }
  const reports: TestReport[] = [];
  let malformed = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      malformed++;
      continue;
    }
    const r = raw as Partial<TestReport>;
    if (typeof r.engine !== 'string' || typeof r.ok !== 'boolean' || typeof r.total !== 'number' || !Array.isArray(r.failures)) {
      malformed++;
      continue;
    }
    reports.push(r as TestReport);
  }
  return { reports: last === undefined ? reports : reports.slice(-last), malformed };
}
