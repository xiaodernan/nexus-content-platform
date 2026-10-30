'use client';

import { useEffect, useState } from 'react';
import type { HealthReport } from '@nexus/design-model';
import { runHealthJob, type HealthJob, type HealthRequest, type HealthResponse } from '@/lib/health-job';

/**
 * §147：体检的客户端外壳——一个页面上只养一个 worker，所有读者（左侧常驻的健康栏、
 * 发布弹层）共用它。两处各自 `new Worker` 会让同一份文档在主线程上克隆两遍、
 * 在两条线程上各算一遍，而它们本来就该读到同一个数。
 *
 * 三条纪律：
 * 1. **来源必须可分辨**：读数带 `source`（`worker` / `sync`），界面把它写进 `data-health-source`。
 *    没有 Worker、worker 崩了、或探针把运行期开关关掉时，退回同步路——数一样，但来源照实写，
 *    不许把"主线程上算的"说成"后台算的"。
 * 2. **只有最新的那份算数**：每次作业带自增 id，新作业进来就把旧的回调摘掉；
 *    迟到的答复找不到回调，直接丢弃。不这样做的话，连续编辑时先发的那份可能后到，
 *    界面就会把旧文档的体检结果显示成"当前"。
 * 3. **回到同步不算兜底成功**：worker 报错时同步再算一次（同一份 `runHealthJob`），
 *    但这份读数的来源是 `sync`，界面据此照实标。
 *
 * 运行期开关 `globalThis.__NEXUS_HEALTH_WORKER__ = false` 只给 A/B 探针用：
 * 同一个构建里量"开 / 关"两档，免得换构建把负载也换掉（与 `store.ts` 那条增量开关同一条规矩）。
 */

export type HealthSource = 'worker' | 'sync';

export interface HealthReading {
  report: HealthReport;
  source: HealthSource;
  /** 报告本身算了多少毫秒：worker 值是后台线程里的自计时，sync 值是主线程上的自计时 */
  computeMs: number;
  /** 每算出一份新报告 +1，探针据此等"这一次重算真的落地了" */
  seq: number;
}

interface WorkerSlot {
  worker: Worker | null;
  broken: boolean;
  nextId: number;
  pending: Map<number, (response: HealthResponse) => void>;
}

const slot: WorkerSlot = { worker: null, broken: false, nextId: 1, pending: new Map() };

function workerAllowed(): boolean {
  if (typeof Worker === 'undefined') return false;
  return (globalThis as { __NEXUS_HEALTH_WORKER__?: boolean }).__NEXUS_HEALTH_WORKER__ !== false;
}

function workerOrNull(): Worker | null {
  if (!workerAllowed()) return null;
  if (slot.worker) return slot.worker;
  if (slot.broken) return null;
  try {
    // 这个形状是打包器的静态约定（webpack / Turbopack 都认 `new URL(..., import.meta.url)`）：
    // 把路径写成变量就不会被打成独立 chunk，worker 会在页面主 bundle 里被再执行一遍。
    const worker = new Worker(new URL('./health-worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<HealthResponse>) => {
      const done = slot.pending.get(event.data.id);
      if (!done) return; // 迟到的答复：那份作业已经被后来的编辑取代
      slot.pending.delete(event.data.id);
      done(event.data);
    });
    worker.addEventListener('error', () => {
      // 崩一次就永久走同步路：反复重建 worker 只会让每次编辑都先失败一次再回退
      slot.broken = true;
      const broken = slot.worker;
      slot.worker = null;
      broken?.terminate();
      for (const [id, done] of slot.pending) done({ id, error: 'health worker 崩了' });
      slot.pending.clear();
    });
    slot.worker = worker;
    return worker;
  } catch {
    // 某些环境（SSR/测试/被禁用的 Worker）构造就抛：当作没有 worker，不要让它冒到组件树
    slot.broken = true;
    return null;
  }
}

/**
 * 跑一份体检作业。`job` 为 null 或 `enabled` 为 false 时不算、不出读数
 * （发布弹层合着时就是这一档：门禁读数只在打开时才需要）。
 *
 * 返回 `{ reading, pending }`：`pending` 为真表示"正在算"，界面必须把它显示出来，
 * 不许把上一份读数当作当前值静默展示。
 */
export function useHealthReport(job: HealthJob | null, enabled = true): {
  reading: HealthReading | null;
  pending: boolean;
} {
  const [reading, setReading] = useState<HealthReading | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!enabled || !job) {
      setReading(null);
      setPending(false);
      return;
    }
    let cancelled = false;
    const land = (report: HealthReport, source: HealthSource, computeMs: number) => {
      if (cancelled) return;
      setReading((prev) => ({ report, source, computeMs, seq: (prev?.seq ?? 0) + 1 }));
      setPending(false);
    };
    const fallback = () => {
      const started = performance.now();
      // 同步路就是原来的行为：算不出来会在这一行抛出（与没有 worker 时的旧实现一致），
      // 不在这里吞掉异常——吞掉就等于让界面停在上一份读数上假装没事。
      land(runHealthJob(job), 'sync', performance.now() - started);
    };

    const worker = workerOrNull();
    if (!worker) {
      fallback();
      return () => {
        cancelled = true;
      };
    }

    const id = slot.nextId++;
    slot.pending.set(id, (response) => {
      if ('report' in response) land(response.report, 'worker', response.computeMs);
      else fallback();
    });
    setPending(true);
    try {
      worker.postMessage({ id, document: job.document, layouts: job.layouts } satisfies HealthRequest);
    } catch {
      slot.pending.delete(id);
      // postMessage 的结构化克隆失败（文档里有不可克隆的东西）：同样退回同步路
      fallback();
    }
    return () => {
      cancelled = true;
      slot.pending.delete(id);
    };
  }, [job, enabled]);

  return { reading, pending };
}
