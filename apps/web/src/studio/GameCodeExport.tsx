'use client';

import { useState } from 'react';
import { useGame } from './gameStore';

/**
 * §52 最后一格（Code）的界面出口：把**库里那份游戏设计**投影成一份拿得走的产物。
 *
 * 四件事刻意这么做：
 * 1. **只读**：这个按钮只调 `GET /api/projects/<id>/game/code`，不写库——产物是设计的投影（§16），
 *    设计改一个数重新生成就是新的字节，所以没有"保存产物"这一步，也没有"覆盖你上一份"的问题。
 * 2. **限度随产物一起念出来**（CODEGEN_LIMITS 原样显示）：产物是引擎的**转写**、不是"平台正在跑的那一套"；
 *    §81 这一格不 eval、不起子进程、不联网。只报"成功"而不报这三句，界面就在替产品撒谎。
 * 3. **下载走 Blob**：产物文件由浏览器自己落盘。zip 打包那一格还没接，所以这里一个个下，
 *    并且界面上说清"打包下载是后面一格"，不假装有。
 * 4. **屏上欠着写的时候不让点**：这一格读的是库里那一份，不是组件里那份。
 *    刚点完「创建游戏骨架」时 PUT 还在飞，这时候生成要么拿到旧设计，要么把已经在屏上的设计
 *    说成"还没有游戏设计"——那句谎就是这么产生的（e2e 里第一次命中它就是这么来的）。
 */

interface GeneratedFile {
  path: string;
  contents: string;
  mime: string;
  origin: unknown;
}

interface CodeOutput {
  ok: boolean;
  files: GeneratedFile[];
  notes: string[];
  bytes: number;
  limits: string[];
}

/** 浏览器里落盘一个产物文件（Blob + 一次性 <a download>） */
function saveOne(path: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = path;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function GameCodeExport({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<CodeOutput | null>(null);
  const { saveState } = useGame();
  const behindLibrary = saveState === 'dirty' || saveState === 'saving';

  async function generate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/game/code`);
      const text = await res.text();
      if (!res.ok) {
        const body = JSON.parse(text) as { message?: string };
        setError(body.message ?? `生成失败（HTTP ${res.status}）`);
        setOutput(null);
        return;
      }
      setOutput(JSON.parse(text) as CodeOutput);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setOutput(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4" data-game-code>
      <h3 className="font-mono text-11 uppercase tracking-wide text-fg-3">可玩产物（§52 Code）</h3>
      <p className="mt-1 text-11 leading-relaxed text-fg-3" data-game-code-note>
        把库里这份设计投影成一份自包含的 HTML 页面：设计文档是唯一真值，产物只是它的一个投影。
        改完设计重新生成一次就是新的字节，所以这里不保存、也不覆盖任何东西。
      </p>
      <button
        type="button"
        onClick={() => void generate()}
        disabled={busy || behindLibrary}
        data-game-code-run
        className="mt-2 rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11 text-fg-2 hover:bg-bg-2 disabled:opacity-50"
      >
        {busy ? '生成中…' : '生成可玩产物'}
      </button>

      {behindLibrary ? (
        <p className="mt-2 text-11 leading-relaxed text-fg-3" data-game-code-behind>
          {saveState === 'saving' ? '库里那份正在写' : '屏上还有改动没写进库'}
          ：产物读的是库里那一份，现在点会拿到旧的设计。等它写完，或点上面的「保存到库」。
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 text-11 leading-relaxed text-danger" data-game-code-error>
          {error}
        </p>
      ) : null}

      {output ? (
        <div className="mt-2" data-game-code-output>
          <p className="text-11 text-fg-2" data-game-code-bytes={output.bytes}>
            {output.files.length} 个文件 · 共 {output.bytes} 字节
          </p>

          {output.notes.length > 0 ? (
            <ul className="mt-1 list-disc pl-4 text-11 leading-relaxed text-fg-3" data-game-code-findings>
              {output.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}

          <ul className="mt-2 flex flex-wrap gap-1" data-game-code-files>
            {output.files.map((file) => (
              <li key={file.path}>
                <button
                  type="button"
                  onClick={() => saveOne(file.path, file.contents, file.mime)}
                  data-game-code-file={file.path}
                  className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 font-mono text-11 text-fg-2 hover:bg-bg-3"
                >
                  {file.path}
                </button>
              </li>
            ))}
          </ul>

          {output.limits.length > 0 ? (
            <ul className="mt-2 list-disc pl-4 text-11 leading-relaxed text-fg-3" data-game-code-limits>
              {output.limits.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 text-11 leading-relaxed text-fg-3">
            打包成一个 zip 下载是后面一格，现在一个个下。
          </p>
        </div>
      ) : null}
    </section>
  );
}
