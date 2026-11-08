/**
 * §85 评测能力 suites 的公共类型。
 *
 * 为什么要有这个文件：AGENTS.md §85 写的 `evals/` 按能力分套件，而仓库里评测目前
 * 以 `scripts/eval-baseline.mts` 一个脚本活着——它能跑、读数在 EVALUATION.md 里，
 * 但它不是一份**结构**：后来的人想加一项（比如 §69 的 Code Index），没有可照抄的形状。
 * 这个文件把那个形状定下来：suite 有名字、有 §85 维度、有 checks、有 notMeasured。
 *
 * 三条纪律（与评测基线同口径）：
 * 1. **不断言阈值**——数字写进 EVALUATION.md 由人比对；结构不变式失败才非零退出。
 * 2. **不说谎**——没测的写进 notMeasured，不写进 checks。
 * 3. **真实路径**——能走真函数就走真函数（codegen / index / parser），夹具只是输入。
 */

/** 一项 check 的结果：名字要能让人看了就知道哪一条断了 */
export interface EvalCheckResult {
  name: string;
  ok: boolean;
  /** 期望/实测各说一句；PASS 的 detail 留作读数，不删 */
  detail: string;
}

export interface EvalSuiteResult {
  /** 套件名，kebab-case；`--suite` 用它过滤 */
  suite: string;
  /** §85 维度，原话写（design accuracy / code correctness / …） */
  dimension: string;
  /** 需要真库吗——需要的话 `npm run evals` 会跳过并提示，不跑空 */
  needsDatabase: boolean;
  checks: EvalCheckResult[];
  /** 明确没测的；打印给用户看，不混进 checks */
  notMeasured: string[];
  durationMs: number;
}

export interface EvalSuite {
  readonly name: string;
  readonly dimension: string;
  readonly needsDatabase: boolean;
  run(): Promise<Omit<EvalSuiteResult, 'suite' | 'dimension' | 'needsDatabase' | 'durationMs'>>
    | Omit<EvalSuiteResult, 'suite' | 'dimension' | 'needsDatabase' | 'durationMs'>;
}

/** 结果行里 failures 的便捷读法 */
export function failedChecks(result: EvalSuiteResult): EvalCheckResult[] {
  return result.checks.filter((check) => !check.ok);
}
