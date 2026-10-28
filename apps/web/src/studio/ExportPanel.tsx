'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { saveBlob } from '@/lib/download';
import { useStudioReady } from './store';

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
    <div className="relative" data-export-root>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-export-open
        className="rounded-[var(--nexus-radius-sm)] px-[var(--nexus-space-3)] py-1 text-13 text-fg-2 hover:bg-bg-2"
      >
        导出
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[70] w-[360px] rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-strong)] bg-bg-1 p-[var(--nexus-space-3)] shadow-2xl">
          <p className="mb-2 font-mono text-12 text-fg-3">§144 导出这个项目</p>
          <div className="mb-[var(--nexus-space-3)] flex flex-col gap-1">
            {PARTS.map((part) => (
              <label key={part.id} className="flex cursor-pointer items-start gap-2 text-12" data-export-part={part.id}>
                <input
                  type="checkbox"
                  checked={picked[part.id]}
                  onChange={() => setPicked((prev) => ({ ...prev, [part.id]: !prev[part.id] }))}
                  className="mt-[3px]"
                />
                <span>
                  <span className="text-fg-1">{part.label}</span>
                  <span className="block text-11 text-fg-3">{part.hint}</span>
                </span>
              </label>
            ))}
          </div>

          {receipt ? (
            <div className="mb-[var(--nexus-space-3)] rounded-[var(--nexus-radius-sm)] bg-bg-2 p-2" data-export-receipt>
              <p className="text-11 text-fg-1">
                已下载 {receipt.filename}（{kilobytes(receipt.bytes)}）
              </p>
              {receipt.counts ? (
                <p className="mt-1 text-11 text-fg-3" data-export-composition>
                  包内：{composition(receipt.counts) ?? '一个文件也没有（README 之外是空的）'}
                </p>
              ) : (
                <p className="mt-1 text-11 text-fg-3" data-export-composition>
                  服务端没给构成回执，这里只报字节数。
                </p>
              )}
              {receipt.missing ? (
                <p className="mt-1 text-11 text-warn-ink" data-export-missing>
                  有 {receipt.missing} 个资产在存储里取不回来了，它们没进包，包里的 README.txt 写了名字。
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="mb-2 text-11 text-danger-ink" data-export-error>
              {error}
            </p>
          ) : null}

          <ul className="mb-[var(--nexus-space-3)] space-y-[2px]">
            <li className="text-11 text-fg-3" data-export-limit>
              · 导的是当前这一版：历史快照、分支、撤销栈、知识索引与对话都不在这份包里，它们还在项目里。
            </li>
            <li className="text-11 text-fg-3" data-export-limit>
              · 包里的 README.txt 会写清有什么、按什么生成的、以及哪些资产没取回来。
            </li>
          </ul>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !chosen.length}
              onClick={() => void run()}
              data-export-run
              className={cn(
                'rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-accent-fg disabled:opacity-50',
              )}
            >
              {busy ? '打包中…' : `导出 ${chosen.join('+') || '（没勾东西）'}`}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="ml-auto text-11 text-fg-3 hover:text-fg-1">
              收起
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
