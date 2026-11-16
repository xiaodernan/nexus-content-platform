'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

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
 *
 * 双语（2026-11-15）：locale 由 RSC 透传（默认 zh），COPY 中英一辞两字面，数据照实渲染。
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

const COPY: Record<Locale, {
  failedReason: (status: string) => string;
  title: string;
  chooseLabel: string;
  busy: string;
  imported: string;
  wholeZip: string;
  extracted: string;
  composition: (design: number, assets: number, storyboard: number, character: number, codeIgnored: number) => string;
  compositionOthers: (design: number, assets: number, storyboard: number, character: number, codeIgnored: number, exportedAt: string) => string;
  assetFailuresTitle: (n: number) => string;
  issuesNoDetail: string;
  refused: (status: number, reason: string) => string;
}> = {
  zh: {
    failedReason: (status) => `导入失败（HTTP ${status}）`,
    title: '导入一份导出过的包',
    chooseLabel: '选择要导入的 zip 包',
    busy: '正在核对清单并写入新项目…',
    imported: '已导入为项目',
    wholeZip: '整包',
    extracted: '解压后',
    composition: (design, assets, storyboard, character, codeIgnored) =>
      `进了库：设计文档 ${design} 份 · 资产 ${assets} 张` +
      (storyboard ? ` · 分镜 ${storyboard} 份` : '') +
      (character ? ` · 角色 ${character} 位` : '') +
      (codeIgnored > 0 ? ` · 包里的 ${codeIgnored} 个代码文件没有入库（代码是那份文档的投影，§16）` : ''),
    compositionOthers: (design, assets, storyboard, character, codeIgnored, exportedAt) =>
      `进了库：设计文档 ${design} 份 · 资产 ${assets} 张` +
      (storyboard ? ` · 分镜 ${storyboard} 份` : '') +
      (character ? ` · 角色 ${character} 位` : '') +
      (codeIgnored > 0 ? ` · 包里的 ${codeIgnored} 个代码文件没有入库（代码是那份文档的投影，§16）` : '') +
      (exportedAt ? ` · 源包导出于 ${exportedAt}` : ''),
    assetFailuresTitle: (n) => `有 ${n} 张资产没能进库，项目已经在了，但下面这几张图会断着：`,
    issuesNoDetail: '服务端没给逐条细节，只有上面那一句。',
    refused: (status, reason) => `没收这份包（HTTP ${status}）：${reason}`,
  },
  en: {
    failedReason: (status) => `Import failed (HTTP ${status})`,
    title: 'Import a previously exported archive',
    chooseLabel: 'Choose the zip to import',
    busy: 'Checking the manifest and writing the new project…',
    imported: 'Imported as project',
    wholeZip: 'bundle',
    extracted: 'extracted',
    composition: (design, assets, storyboard, character, codeIgnored) =>
      `In the library: ${design} design document(s) · ${assets} asset(s)` +
      (storyboard ? ` · ${storyboard} storyboard(s)` : '') +
      (character ? ` · ${character} character(s)` : '') +
      (codeIgnored > 0 ? ` · ${codeIgnored} code file(s) not taken in (code is a projection of that document, §16)` : ''),
    compositionOthers: (design, assets, storyboard, character, codeIgnored, exportedAt) =>
      `In the library: ${design} design document(s) · ${assets} asset(s)` +
      (storyboard ? ` · ${storyboard} storyboard(s)` : '') +
      (character ? ` · ${character} character(s)` : '') +
      (codeIgnored > 0 ? ` · ${codeIgnored} code file(s) not taken in (code is a projection of that document, §16)` : '') +
      (exportedAt ? ` · source bundle exported at ${exportedAt}` : ''),
    assetFailuresTitle: (n) => `${n} asset(s) could not enter the library — the project is in already, but these images will render broken:`,
    issuesNoDetail: 'The server gave no per-item details — only the line above.',
    refused: (status, reason) => `Refused (HTTP ${status}): ${reason}`,
  },
};

function kilobytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function ImportPanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
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
        const reason = body?.reason ?? body?.message ?? c.failedReason(String(res.status));
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
    <div className="ip-root" data-import-root>
      <p className="ip-title">{c.title}</p>
      <p className="ip-hint" data-import-hint>
        {locale === 'zh' ? '只收本平台「导出」产出的 zip（包里有 ' : 'Only zips produced by this platform’s Export (containing '}
        <span className="ip-mono">.nexus/manifest.json</span>
        {locale === 'zh' ? '）。导入的结果是' : '). The import creates '}
        <strong className="ip-strongInk">{locale === 'zh' ? '一个新项目' : 'a new project'}</strong>
        {locale === 'zh'
          ? '，页面与资产都会换号，不会改动你现有的任何项目。'
          : ' — pages and assets get fresh identities, and nothing of yours is modified.'}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="application/zip,.zip"
        disabled={busy}
        aria-label={c.chooseLabel}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void run(file);
        }}
        className="ip-file"
        data-import-file
      />
      {busy ? <p className="ip-busyNote" data-import-busy>{c.busy}</p> : null}

      {done ? (
        <div className="ip-receipt" data-import-receipt>
          <p className="ip-strongNote">
            {c.imported}{' '}
            <a href={`/studio/${done.projectId}`} className="ip-inlineLink" data-import-open={done.projectId}>
              {done.name}
            </a>
            <span className="ip-metaMono">
              {done.kind} · {c.wholeZip} {kilobytes(done.bytes.zip)} · {c.extracted} {kilobytes(done.bytes.extracted)}
            </span>
          </p>
          <p className="ip-note" data-import-composition>
            {done.exportedAt
              ? c.compositionOthers(done.counts.design, done.counts.assets, done.counts.storyboard, done.counts.character, done.codeFilesIgnored, done.exportedAt)
              : c.composition(done.counts.design, done.counts.assets, done.counts.storyboard, done.counts.character, done.codeFilesIgnored)}
          </p>
          {done.assetFailures.length ? (
            <ul className="ip-warnList" data-import-asset-failures>
              <li>{c.assetFailuresTitle(done.assetFailures.length)}</li>
              {done.assetFailures.map((f) => (
                <li key={`${f.path}-${f.reason}`} className="ip-mono11">
                  · {f.path}：{f.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {done.storyboardNotes.length ? (
            <ul className="ip-hintList" data-import-storyboard-notes>
              {done.storyboardNotes.map((note, index) => (
                <li key={`${index}-${note}`}>· {note}</li>
              ))}
            </ul>
          ) : null}
          {done.characterNotes.length ? (
            <ul className="ip-warnList" data-import-character-notes>
              {done.characterNotes.map((note, index) => (
                <li key={`${index}-${note}`}>· {note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {refused ? (
        <div className="ip-receipt" data-import-refused>
          <p className="ip-error" data-import-refusal-reason>
            {c.refused(refused.status, refused.reason)}
          </p>
          {refused.issues.length ? (
            <ul className="ip-issuesList" data-import-refusal-issues>
              {refused.issues.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          ) : (
            <p className="ip-note">{c.issuesNoDetail}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
