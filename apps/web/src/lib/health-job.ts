import { analyzeHealth, type DesignDocument, type HealthReport, type ResolvedLayout } from '@nexus/design-model';

/**
 * §147：体检（`analyzeHealth`）是一件可以整个搬出主线程的纯作业——
 * 输入只有文档与已解好的几何，输出只有报告，中间不碰 DOM、不读 store。
 *
 * 这份文件是**唯一的作业入口**：worker（`studio/health-worker.ts`）与没有 Worker 时的
 * 同步回退都调 `runHealthJob`。两边同源，读数才可能逐项相等；
 * 如果两处各写一段 `analyzeHealth(...)` 的参数拼装，早晚会在某个可选参数上分家
 * （2026-10-27 记的那次 `layouts` 复用就是这样被复跑抓出来的）。
 */
export interface HealthJob {
  document: DesignDocument;
  /**
   * 已解析的几何，按 pageId 索引。**只有 design 视口解出来的那份才可信**
   * （断点视口是按断点宽度裁过的，喂给门禁会把响应式换行的尺寸当设计尺寸判）——
   * 这个判断留在调用方，见 `HealthPanel.tsx` / `PublishPanel.tsx` 里那两处注释。
   */
  layouts?: Record<string, ResolvedLayout>;
}

/** worker 报文：请求带一个自增 id，答复按同 id 回，迟到的那份在客户端丢掉 */
export interface HealthRequest extends HealthJob {
  id: number;
}

export type HealthResponse =
  | { id: number; report: HealthReport; computeMs: number }
  | { id: number; error: string };

/** 算一份体检报告。worker 与同步回退共用这一条路（§159：不许两份实现各说一套）。 */
export function runHealthJob(job: HealthJob): HealthReport {
  return analyzeHealth(job.document, job.layouts ? { layouts: job.layouts } : undefined);
}
