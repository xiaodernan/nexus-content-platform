import type { EvalCheckResult } from '../types.ts';

/**
 * suite 里随手记 check 的小抄。
 *
 * 不做短路（fail-fast）：一个 suite 里前五条全红、第六条才是根因的情况很常见，
 * 收集完一轮一起报，比看到第一条红就停更有用。
 */
export class EvalRecorder {
  readonly checks: EvalCheckResult[] = [];
  readonly notMeasured: string[] = [];

  check(name: string, ok: boolean, detail = ''): boolean {
    this.checks.push({ name, ok, detail });
    return ok;
  }

  /** 结构不变式：名字里说清"哪一个数不对"，detail 带上实读数 */
  structural(name: string, ok: boolean, actual: string | number): boolean {
    return this.check(name, ok, `actual=${String(actual)}`);
  }

  /** 记一条"这次没测"——打印时单独列，不混进 checks */
  skip(reason: string): void {
    this.notMeasured.push(reason);
  }
}
