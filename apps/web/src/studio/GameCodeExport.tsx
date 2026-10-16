'use client';

import { useState } from 'react';
import { useGame } from './gameStore';

/**
 * §52 最后一格（Code）的界面出口：把**库里那份游戏设计**投影成一份拿得走的产物。
 *
 * 五件事刻意这么做：
 * 1. **只读**：这个按钮只调 `GET /api/projects/<id>/game/code`，不写库——产物是设计的投影（§16），
 *    设计改一个数重新生成就是新的字节，所以没有"保存产物"这一步，也没有"覆盖你上一份"的问题。
 * 2. **限度随产物一起念出来**（CODEGEN_LIMITS 原样显示）：产物是引擎的**转写**、不是"平台正在跑的那一套"；
 *    §81 这一格不 eval、不起子进程、不联网。只报"成功"而不报这三句，界面就在替产品撒谎。
 * 3. **下载走 Blob**：产物文件由浏览器自己落盘。两种拿法都在：一个个下，或者「打包成一个 zip」
 *    走 `.../game/code/zip`——那一路读的是**同一道闸口**（同一个 404/500 判定、同一份库里设计），
 *    所以包里的 `plan.json` 与屏幕上这一份逐字节相同，界面上不重新数文件（包里的文件数与字节数来自响应头回执）。
 * 4. **屏上欠着写的时候不让点**：这一格读的是库里那一份，不是组件里那份。
 *    刚点完「创建游戏骨架」时 PUT 还在飞，这时候生成要么拿到旧设计，要么把已经在屏上的设计
 *    说成"还没有游戏设计"——那句谎就是这么产生的（e2e 里第一次命中它就是这么来的）。
 * 5. **这一型与产物那条链对不上时把它说出来**（`kindNote`）：产物只有一条链（`compileGame` 排的 2D 俯视计划），
 *    而 §51 的八型里视觉小说/互动故事/RPG 原型在平台上跑的是别的管线。那句话来自 `codeKindReadings()`
 *    读 `compileForKind` 与状态表，界面不自己判断——面板判断一遍就会和分派点说两套话。
 *    对得上时它是 `null`，界面上就一个字都不印：恒真的警告和恒无的警告一样没人信。
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
  /** 这份设计标的那一型在平台上走哪条管线（`compileForKind` 的读数，不是界面猜的） */
  kindPipeline: string | null;
  /** 与产物那条链不一致时才有话；一致时是 null，界面上就不许印一句空警告 */
  kindNote: string | null;
}

/** 浏览器里落盘一份字节（Blob + 一次性 <a download>） */
function saveBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function saveOne(path: string, contents: string, mime: string): void {
  saveBlob(path, new Blob([contents], { type: mime }));
}

/**
 * 从服务端的 `content-disposition` 里取文件名：真名走 RFC 5987 的 `filename*`（带中文），
 * `filename` 那一份是 ASCII 兜底。界面不自己编一个名字——包名由服务端那一格决定（设计名里带斜杠时
 * 客户端拼出来的名字就带着斜杠进了下载目录）。
 */
function nameFromDisposition(header: string | null): string | null {
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header ?? '')?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8);
    } catch {
      // 服务端只发 encodeURIComponent 的结果，走到这里说明头被改坏了；落到 ASCII 那一份
    }
  }
  return /filename="([^"]*)"/i.exec(header ?? '')?.[1] ?? null;
}

export function GameCodeExport({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<CodeOutput | null>(null);
  /** 打包那一路的回执（服务端自己数的文件数与字节数），下载完显示 */
  const [packaged, setPackaged] = useState<string | null>(null);
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

  async function packAndDownload(): Promise<void> {
    setZipping(true);
    setError(null);
    setPackaged(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/game/code/zip`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? `打包失败（HTTP ${res.status}）`);
        return;
      }
      const blob = await res.blob();
      const name = nameFromDisposition(res.headers.get('content-disposition')) ?? 'nexus-game.zip';
      saveBlob(name, blob);
      // 回执不是界面数出来的：它来自服务端那一格数完再写进头里的值
      const receipt = res.headers.get('x-nexus-code-receipt');
      if (receipt) {
        const parsed = JSON.parse(receipt) as { files: number; zipBytes: number; artifactBytes: number };
        setPackaged(`已下载 ${name} · 包里 ${parsed.files} 个文件 · zip ${parsed.zipBytes} 字节（产物 ${parsed.artifactBytes} 字节，store 不压缩）`);
      } else {
        setPackaged(`已下载 ${name}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setZipping(false);
    }
  }

  return (
    <section className="mt-4" data-game-code>
      <h3 className="font-mono text-11 uppercase tracking-wide text-fg-3">可玩产物（§52 Code）</h3>
      <p className="mt-1 text-11 leading-relaxed text-fg-3" data-game-code-note>
        把库里这份设计投影成一份自包含的 HTML 页面：设计文档是唯一真值，产物只是它的一个投影。
        改完设计重新生成一次就是新的字节，所以这里不保存、也不覆盖任何东西。
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy || behindLibrary}
          data-game-code-run
          className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11 text-fg-2 hover:bg-bg-2 disabled:opacity-50"
        >
          {busy ? '生成中…' : '生成可玩产物'}
        </button>
        <button
          type="button"
          onClick={() => void packAndDownload()}
          disabled={busy || zipping || behindLibrary}
          data-game-code-zip
          className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11 text-fg-2 hover:bg-bg-2 disabled:opacity-50"
        >
          {zipping ? '打包中…' : '打包成一个 zip 下载'}
        </button>
      </div>

      {packaged ? (
        <p className="mt-2 text-11 leading-relaxed text-fg-2" data-game-code-packaged>
          {packaged}
        </p>
      ) : null}

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

          {output.kindNote ? (
            <p className="mt-1 rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-11 leading-relaxed text-amber-100" data-game-code-kind>
              {output.kindNote}
            </p>
          ) : null}

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
          <p className="mt-2 text-11 leading-relaxed text-fg-3" data-game-code-perfile>
            上面这些按钮一个个存；整份拿走用「打包成一个 zip 下载」，那一路读的仍是库里这份设计。
          </p>
        </div>
      ) : null}
    </section>
  );
}
