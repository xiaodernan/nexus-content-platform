'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §144 NO LOCK-IN 的反向那一寸：作者带走的那份 zip 得能**装回来**。
 *
 * 放在主页的项目区而不是 Studio 顶栏——导入的结果是一个**新项目**，
 * 不是往当前这个项目里追加东西。导出那颗按钮才属于某个项目。
 *
 * 三条纪律：
 * - **每一个数字都来自服务端回执**。包里有几份文档、几张图进了库、多少个代码文件被忽略、
 *   这次导出发生在什么时候——客户端解一遍 zip 就能"自己数出来"的那些话，恰恰是错了也没人知道的。
 * - **拒收要把 `issues` 逐条列出来**。`reason` 只说"清单与包内容对不上"，
 *   少了那几行路径就无从下手；只显第一句等于把证据扔了（与资产上传同一口径）。
 * - **少了几张图不算失败，但要点名**。资产进不了库（超限、不是受支持的位图、配额满）时项目已经在了，
 *   这时报"导入完成"就是谎话；每一张的形状与原因摊开列出来。
 */

interface Success {
  projectId: string;
  name: string;
  kind: string;
  counts: { design: number; assets: number; storyboard: number; character: number };
  codeFilesIgnored: number;
  assetFailures: { path: string; reason: string }[];
  storyboardNotes: string[];
  characterNotes: string[];
  exportedAt: string;
  bytes: { zip: number; extracted: number };
}

/** 服务端答的每一个状态都留原样：界面对 415「不是这个格式的包」和 400「表单填错了」说的话必须不同 */
interface Refused {
  status: number;
  reason: string;
  issues: string[];
}

function kilobytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function ImportPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Success | null>(null);
  const [refused, setRefused] = useState<Refused | null>(null);

  const run = async (file: File): Promise<void> => {
    setBusy(true);
    setDone(null);
    setRefused(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/projects/import', { method: 'POST', headers: csrfHeaders(), body: form });
      const body = (await res.json().catch(() => null)) as
        | (Partial<Success> & Partial<Refused> & { ok?: boolean; message?: string })
        | null;
      if (!res.ok || body?.ok !== true || !body.projectId || !body.name) {
        const reason = body?.reason ?? body?.message ?? `导入失败（HTTP ${res.status}）`;
        // 回执读不出来时把状态码一起说出去：401/403/413/415 是四件不同的事，混成一句"失败了"就查不下去
        setRefused({ status: res.status, reason, issues: body?.issues ?? [] });
        return;
      }
      setDone({
        projectId: body.projectId,
        name: body.name,
        kind: body.kind ?? '',
        counts: { design: body.counts?.design ?? 0, assets: body.counts?.assets ?? 0, storyboard: body.counts?.storyboard ?? 0, character: body.counts?.character ?? 0 },
        codeFilesIgnored: body.codeFilesIgnored ?? 0,
        assetFailures: body.assetFailures ?? [],
        storyboardNotes: body.storyboardNotes ?? [],
        characterNotes: body.characterNotes ?? [],
        exportedAt: body.exportedAt ?? '',
        bytes: { zip: body.bytes?.zip ?? 0, extracted: body.bytes?.extracted ?? 0 },
      });
      // 新项目要出现在上面的列表里：那份列表是服务端读的，不刷新就看不到自己刚装回来的项目
      router.refresh();
    } finally {
      setBusy(false);
      // 允许连着选同一个文件：不清 value 的话 onChange 不会再触发
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="mt-[var(--nexus-space-4)] rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] p-[var(--nexus-space-4)]" data-import-root>
      <p className="mb-1 text-[var(--nexus-font-size-13)] text-fg-2">导入一份导出过的包</p>
      <p className="mb-[var(--nexus-space-3)] text-11 text-fg-3" data-import-hint>
        只收本平台「导出」产出的 zip（包里有 <span className="font-mono">.nexus/manifest.json</span>）。
        导入的结果是<strong className="text-fg-2">一个新项目</strong>，页面与资产都会换号，不会改动你现有的任何项目。
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="application/zip,.zip"
        disabled={busy}
        aria-label="选择要导入的 zip 包"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void run(file);
        }}
        className="text-12 text-fg-2 file:mr-2 file:rounded-[var(--nexus-radius-sm)] file:border-0 file:bg-bg-2 file:px-2 file:py-1 file:text-12 disabled:opacity-40"
        data-import-file
      />
      {busy ? <p className="mt-2 text-11 text-fg-3" data-import-busy>正在核对清单并写入新项目…</p> : null}

      {done ? (
        <div className="mt-[var(--nexus-space-3)] rounded-[var(--nexus-radius-sm)] bg-bg-2 p-2" data-import-receipt>
          <p className="text-11 text-fg-1">
            已导入为项目{' '}
            <a href={`/studio/${done.projectId}`} className="text-accent-2-ink underline" data-import-open={done.projectId}>
              {done.name}
            </a>
            <span className="ml-2 font-mono text-11 text-fg-3">
              {done.kind} · 整包 {kilobytes(done.bytes.zip)} · 解压后 {kilobytes(done.bytes.extracted)}
            </span>
          </p>
          <p className="mt-1 text-11 text-fg-3" data-import-composition>
            进了库：设计文档 {done.counts.design} 份 · 资产 {done.counts.assets} 张
            {done.counts.storyboard ? ` · 分镜 ${done.counts.storyboard} 份` : ''}
            {done.counts.character ? ` · 角色 ${done.counts.character} 位` : ''}
            {done.codeFilesIgnored > 0 ? ` · 包里的 ${done.codeFilesIgnored} 个代码文件没有入库（代码是那份文档的投影，§16）` : ''}
            {done.exportedAt ? ` · 源包导出于 ${done.exportedAt}` : ''}
          </p>
          {done.assetFailures.length ? (
            <ul className="mt-1 text-11 text-warn" data-import-asset-failures>
              <li>有 {done.assetFailures.length} 张资产没能进库，项目已经在了，但下面这几张图会断着：</li>
              {done.assetFailures.map((f) => (
                <li key={`${f.path}-${f.reason}`} className="font-mono text-11">
                  · {f.path}：{f.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {done.storyboardNotes.length ? (
            <ul className="mt-1 text-11 text-fg-3" data-import-storyboard-notes>
              {done.storyboardNotes.map((note, index) => (
                <li key={`${index}-${note}`}>· {note}</li>
              ))}
            </ul>
          ) : null}
          {done.characterNotes.length ? (
            <ul className="mt-1 text-11 text-warn" data-import-character-notes>
              {done.characterNotes.map((note, index) => (
                <li key={`${index}-${note}`}>· {note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {refused ? (
        <div className="mt-[var(--nexus-space-3)] rounded-[var(--nexus-radius-sm)] bg-bg-2 p-2" data-import-refused>
          <p className="text-11 text-danger" data-import-refusal-reason>
            没收这份包（HTTP {refused.status}）：{refused.reason}
          </p>
          {refused.issues.length ? (
            <ul className="mt-1 font-mono text-11 text-fg-3" data-import-refusal-issues>
              {refused.issues.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-11 text-fg-3">服务端没给逐条细节，只有上面那一句。</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
