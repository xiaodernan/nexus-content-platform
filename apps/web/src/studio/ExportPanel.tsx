'use client';

import { useState } from 'react';
import { saveBlob } from '@/lib/download';
import { useStudioReady } from './store';
import { usePopoverDismiss } from './use-popover-dismiss';

/**
 * §144 NO LOCK-IN：把项目**交回作者手里**的那个按钮。
 *
 * 原文给的四件事里，export design / export code / export assets 是同一个动作的三种勾选，
 * 所以这里是一个入口而不是三个入口（`delete account` 是另一格，见 ROADMAP）。
 *
 * 三条纪律：
 * - **回执上的数字来自服务端**（`x-nexus-export-receipt`）。客户端要数包里有几个文件就得自己解一遍 zip，
 *   而"导出完成"这句话不能等到那时才敢说；拿不到回执就只报字节数，不补一个看起来对的构成（§159）。
 * - **缺了资产要说出来**。库里有一行、存储里的字节却取不回来，这种事会发生（本地驱动被清过、
 *   S3 凭据换过）；默默少几个文件比明说少几个更糟——那时作者已经拿着 zip 走人了。
 * - **限度写在旁边**。导的是当前这一版投影：历史快照、分支、撤销栈、知识索引、对话都不在里面。
 */

const PARTS = [
  { id: 'design', label: '设计文档', hint: '这份项目当前那一版的模型本身（design model 是唯一真值，§16）' },
  { id: 'code', label: '生成的代码', hint: '由那份文档确定性投影出来的文件，不是另存的一份真相' },
  { id: 'assets', label: '上传的资产', hint: '你自己传进来的图片等原始字节' },
  { id: 'storyboard', label: '分镜', hint: '§40-42 的分镜文档；镜头的参考帧与成片按 id 引用 assets/ 里的字节' },
  { id: 'character', label: '角色档案', hint: '§46 的角色设定；世界归属不随包走，导入时挂到新项目自己的世界上' },
] as const;

type Part = (typeof PARTS)[number]['id'];

/** 弹层与触发键的绑定：`aria-controls` 指的必须是真存在的 id，两边共用这一个常量。 */
const EXPORT_PANEL_ID = 'nexus-export-panel';

interface Receipt {
  bytes: number;
  filename: string;
  counts: Partial<Record<Part, number>> | null;
  missing: number | null;
}

/** content-disposition 有两种写法：优先 UTF-8 那一版（项目名通常是中文） */
function downloadName(header: string | null): string {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header ?? '');
  const raw = encoded?.[1];
  if (raw) {
    try {
      return decodeURIComponent(raw);
    } catch {
      return 'nexus-export.zip';
    }
  }
  const plain = /filename="([^"]*)"/i.exec(header ?? '');
  return plain?.[1] || 'nexus-export.zip';
}

/** 回执头读不出来就回 null——那一刻界面只报字节数，不猜构成 */
function parseReceipt(header: string | null): Pick<Receipt, 'counts' | 'missing'> {
  if (!header) return { counts: null, missing: null };
  try {
    const parsed = JSON.parse(header) as { counts?: unknown; missing?: unknown };
    const counts = parsed.counts;
    if (typeof counts !== 'object' || counts === null) return { counts: null, missing: null };
    const only = Object.fromEntries(
      PARTS.map((p) => p.id).map((id) => [id, (counts as Record<string, unknown>)[id]]).filter(([, n]) => typeof n === 'number'),
    ) as Partial<Record<Part, number>>;
    return { counts: only, missing: typeof parsed.missing === 'number' ? parsed.missing : null };
  } catch {
    return { counts: null, missing: null };
  }
}

function kilobytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function ExportPanel() {
  const state = useStudioReady();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Record<Part, boolean>>({ design: true, code: true, assets: true, storyboard: true, character: true });
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { rootRef, triggerRef } = usePopoverDismiss(open, setOpen);

  const chosen = PARTS.filter((p) => picked[p.id]).map((p) => p.id);

  const run = async () => {
    if (!chosen.length) {
      setError('至少勾一样：什么都不导的包是不存在的。');
      return;
    }
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const res = await fetch(`/api/projects/${state.projectId}/export?parts=${chosen.join(',')}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? `导出失败（HTTP ${res.status}）`);
        return;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const filename = downloadName(res.headers.get('content-disposition'));
      // 回收对象 URL 的时机只写在 @/lib/download 那一处（三处下载共用一份实现）
      saveBlob(filename, new Blob([bytes], { type: 'application/zip' }));
      setReceipt({ bytes: bytes.byteLength, filename, ...parseReceipt(res.headers.get('x-nexus-export-receipt')) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导出失败');
    } finally {
      setBusy(false);
    }
  };

  /** 只数真的进了包的那几档；一个都没进就说"没有"，不写"0 个"（§159） */
  const composition = (counts: Receipt['counts']): string | null => {
    if (!counts) return null;
    const said = PARTS.filter((p) => counts[p.id]).map((p) => `${p.label} ${counts[p.id]}`).join(' · ');
    return said || null;
  };

  return (
    <div ref={rootRef} className="pb-rel" data-export-root>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? EXPORT_PANEL_ID : undefined}
        data-export-open
        className="pb-ghostBig"
      >
        导出
      </button>

      {open ? (
        <div
          id={EXPORT_PANEL_ID}
          role="region"
          aria-label="导出与下载"
          data-export-panel
          className="pb-popPanel360"
        >
          <p className="pb-monoMt2">§144 导出这个项目</p>
          <div className="pb-col">
            {PARTS.map((part) => (
              <label key={part.id} className="pb-pickRow" data-export-part={part.id}>
                <input
                  type="checkbox"
                  checked={picked[part.id]}
                  onChange={() => setPicked((prev) => ({ ...prev, [part.id]: !prev[part.id] }))}
                  className="pb-mt3px"
                />
                <span>
                  <span className="pb-ink1">{part.label}</span>
                  <span className="pb-faintBlock">{part.hint}</span>
                </span>
              </label>
            ))}
          </div>

          {/* §85（第三十七片）：回执是"点完之后才出现"的一整块，键盘用户看不见它出现。
              `role="status"` 让它被读屏播报一次（不是 `alert`：打包成功不该抢当前朗读）。 */}
          {receipt ? (
            <div
              role="status"
              className="pb-block"
              data-export-receipt
            >
              <p className="pb-ink1">
                已下载 {receipt.filename}（{kilobytes(receipt.bytes)}）
              </p>
              {receipt.counts ? (
                <p className="sb-faintMt1" data-export-composition>
                  包内：{composition(receipt.counts) ?? '一个文件也没有（README 之外是空的）'}
                </p>
              ) : (
                <p className="sb-faintMt1" data-export-composition>
                  服务端没给构成回执，这里只报字节数。
                </p>
              )}
              {receipt.missing ? (
                <p className="cp-warnMt1" data-export-missing>
                  有 {receipt.missing} 个资产在存储里取不回来了，它们没进包，包里的 README.txt 写了名字。
                </p>
              ) : null}
            </div>
          ) : null}

          {/* 失败是"动作没成"：`alert` 会打断当前朗读，这正是这条消息该有的重量 */}
          {error ? (
            <p role="alert" className="pb-dangerMb2" data-export-error>
              {error}
            </p>
          ) : null}

          <ul className="pb-listMt1">
            <li className="sb-faint11" data-export-limit>
              · 导的是当前这一版：历史快照、分支、撤销栈、知识索引与对话都不在这份包里，它们还在项目里。
            </li>
            <li className="sb-faint11" data-export-limit>
              · 包里的 README.txt 会写清有什么、按什么生成的、以及哪些资产没取回来。
            </li>
          </ul>

          <div className="wd-row2">
            <button
              type="button"
              disabled={busy || !chosen.length}
              onClick={() => void run()}
              data-export-run
              className="pb-runBtn"
            >
              {busy
                ? '打包中…'
                : `导出 ${chosen.map((id) => PARTS.find((p) => p.id === id)!.label).join('+') || '（没勾东西）'}`}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="pb-closeBtn">
              收起
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
