'use client';

import { useState } from 'react';
import { saveBlob } from '@/lib/download';
import type { Locale } from '@/lib/i18n';
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
 * 双语（v742）：locale 由 TopBar 透传；zh 原文原样保留，en 逐句对应。
 */

const COPY = {
  zh: {
    heading: '§144 导出这个项目',
    trigger: '导出',
    ariaLabel: '导出与下载',
    pickAtLeast: '至少勾一样：什么都不导的包是不存在的。',
    failureHttp: (status: number) => `导出失败（HTTP ${status}）`,
    failurePlain: '导出失败',
    downloaded: (filename: string, kilobytes: string) => `已下载 ${filename}（${kilobytes}）`,
    packageEmpty: '一个文件也没有（README 之外是空的）',
    noReceipt: '服务端没给构成回执，这里只报字节数。',
    inPackage: (said: string) => `包内：${said}`,
    missingAssets: (n: number) =>
      `有 ${n} 个资产在存储里取不回来了，它们没进包，包里的 README.txt 写了名字。`,
    limitProjection:
      '导的是当前这一版：历史快照、分支、撤销栈、知识索引与对话都不在这份包里，它们还在项目里。',
    limitReadme: '包里的 README.txt 会写清有什么、按什么生成的、以及哪些资产没取回来。',
    packaging: '打包中…',
    nothingPicked: '（没勾东西）',
    exportPrefix: '导出 ',
    collapse: '收起',
    partLabels: {
      design: '设计文档',
      code: '生成的代码',
      assets: '上传的资产',
      storyboard: '分镜',
      character: '角色档案',
    } as Record<Part, string>,
    partHints: {
      design: '这份项目当前那一版的模型本身（design model 是唯一真值，§16）',
      code: '由那份文档确定性投影出来的文件，不是另存的一份真相',
      assets: '你自己传进来的图片等原始字节',
      storyboard: '§40-42 的分镜文档；镜头的参考帧与成片按 id 引用 assets/ 里的字节',
      character: '§46 的角色设定；世界归属不随包走，导入时挂到新项目自己的世界上',
    } as Record<Part, string>,
  },
  en: {
    heading: '§144 Export this project',
    trigger: 'Export',
    ariaLabel: 'Export and download',
    pickAtLeast: 'Pick at least one part: a package that exports nothing exists not.',
    failureHttp: (status: number) => `Export failed (HTTP ${status})`,
    failurePlain: 'Export failed',
    downloaded: (filename: string, kilobytes: string) => `Downloaded ${filename} (${kilobytes})`,
    packageEmpty: 'No files at all (empty apart from README)',
    noReceipt: 'The server gave no composition receipt; only bytes are reported.',
    inPackage: (said: string) => `In the package: ${said}`,
    missingAssets: (n: number) =>
      `${n} assets could not be retrieved from storage; they are not in the package, and README.txt in the package names them.`,
    limitProjection:
      'This is the current version only: historical snapshots, branches, the undo stack, the knowledge index and dialogues are not in this package — they remain in the project.',
    limitReadme: 'README.txt in the package lists what is in it, what generated it, and which assets went missing.',
    packaging: 'Packaging…',
    nothingPicked: '(nothing picked)',
    exportPrefix: 'Export ',
    collapse: 'Collapse',
    partLabels: {
      design: 'Design document',
      code: 'Generated code',
      assets: 'Uploaded assets',
      storyboard: 'Storyboard',
      character: 'Character profiles',
    } as Record<Part, string>,
    partHints: {
      design: 'The current model of this project (the design model is the single source of truth, §16)',
      code: 'Files deterministically projected from that document — not another saved copy of the truth',
      assets: 'Raw bytes of the images you uploaded',
      storyboard: 'The §40–42 storyboard document; reference frames and rushes reference assets/ bytes by id',
      character: 'The §46 character designs; world attachments follow nothing — importing mounts them on the new project’s own world',
    } as Record<Part, string>,
  },
} as const;

type Part = 'design' | 'code' | 'assets' | 'storyboard' | 'character';

/** PARTS 的 id 顺序是唯一的；label/hint 走 COPY（§144 导出这个项目的双语门面）。 */
const PART_IDS = ['design', 'code', 'assets', 'storyboard', 'character'] as const satisfies readonly Part[];

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
      PART_IDS.map((id) => [id, (counts as Record<string, unknown>)[id]]).filter(([, n]) => typeof n === 'number'),
    ) as Partial<Record<Part, number>>;
    return { counts: only, missing: typeof parsed.missing === 'number' ? parsed.missing : null };
  } catch {
    return { counts: null, missing: null };
  }
}

function kilobytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function ExportPanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const state = useStudioReady();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Record<Part, boolean>>({ design: true, code: true, assets: true, storyboard: true, character: true });
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { rootRef, triggerRef } = usePopoverDismiss(open, setOpen);

  const chosen = PART_IDS.filter((id) => picked[id]);

  const run = async () => {
    if (!chosen.length) {
      setError(c.pickAtLeast);
      return;
    }
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const res = await fetch(`/api/projects/${state.projectId}/export?parts=${chosen.join(',')}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? c.failureHttp(res.status));
        return;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const filename = downloadName(res.headers.get('content-disposition'));
      // 回收对象 URL 的时机只写在 @/lib/download 那一处（三处下载共用一份实现）
      saveBlob(filename, new Blob([bytes], { type: 'application/zip' }));
      setReceipt({ bytes: bytes.byteLength, filename, ...parseReceipt(res.headers.get('x-nexus-export-receipt')) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : c.failurePlain);
    } finally {
      setBusy(false);
    }
  };

  /** 只数真的进了包的那几档；一个都没进就说"没有"，不写"0 个"（§159） */
  const composition = (counts: Receipt['counts']): string | null => {
    if (!counts) return null;
    const said = PART_IDS.filter((id) => counts[id]).map((id) => `${c.partLabels[id]} ${counts[id]}`).join(' · ');
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
        {c.trigger}
      </button>

      {open ? (
        <div
          id={EXPORT_PANEL_ID}
          role="region"
          aria-label={c.ariaLabel}
          data-export-panel
          className="pb-popPanel360"
        >
          <p className="pb-monoMt2">{c.heading}</p>
          <div className="pb-col">
            {PART_IDS.map((id) => (
              <label key={id} className="pb-pickRow" data-export-part={id}>
                <input
                  type="checkbox"
                  checked={picked[id]}
                  onChange={() => setPicked((prev) => ({ ...prev, [id]: !prev[id] }))}
                  className="pb-mt3px"
                />
                <span>
                  <span className="pb-ink1">{c.partLabels[id]}</span>
                  <span className="pb-faintBlock">{c.partHints[id]}</span>
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
              <p className="pb-ink1">{c.downloaded(receipt.filename, kilobytes(receipt.bytes))}</p>
              {receipt.counts ? (
                <p className="sb-faintMt1" data-export-composition>
                  {c.inPackage(composition(receipt.counts) ?? c.packageEmpty)}
                </p>
              ) : (
                <p className="sb-faintMt1" data-export-composition>
                  {c.noReceipt}
                </p>
              )}
              {receipt.missing ? (
                <p className="cp-warnMt1" data-export-missing>
                  {c.missingAssets(receipt.missing)}
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
              · {c.limitProjection}
            </li>
            <li className="sb-faint11" data-export-limit>
              · {c.limitReadme}
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
                ? c.packaging
                : `${c.exportPrefix}${chosen.map((id) => c.partLabels[id]).join('+') || c.nothingPicked}`}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="pb-closeBtn">
              {c.collapse}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
