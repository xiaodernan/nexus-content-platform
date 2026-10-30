import { runHealthJob, type HealthRequest, type HealthResponse } from '@/lib/health-job';

/**
 * §147 的体检 worker。只做一件事：收到文档 → 跑 `runHealthJob` → 把报告回过去。
 *
 * 这里刻意不 `/// <reference lib="webworker" />`：那份 lib 与 DOM lib 同名符号冲突
 * （`self` / `addEventListener` 在两边都有声明），在这个已经引 DOM 的工程里加进来会让
 * 整个 apps/web 的 tsc 红。所以只把用得到的两三个方法按形状声明出来——
 * worker 真正需要的接口就这么点，不必把整份 webworker 类型表搬进来。
 */
const scope = globalThis as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<HealthRequest>) => void): void;
  postMessage(message: HealthResponse): void;
};

scope.addEventListener('message', (event) => {
  const request = event.data;
  try {
    const started = performance.now();
    const report = runHealthJob(request);
    scope.postMessage({ id: request.id, report, computeMs: performance.now() - started });
  } catch (error) {
    // 算不出来就照实报错，让主线程退回同步路再试一次；不编一份"空的通过报告"
    scope.postMessage({
      id: request.id,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
  }
});
