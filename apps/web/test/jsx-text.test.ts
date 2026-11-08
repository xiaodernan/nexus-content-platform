import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 结构门：界面文案里不许漏出 markdown 的 `**粗体**`。
 *
 * 这一条是被同一个 bug 撞了两次才加的。JSX 的文本不是 markdown——`**模板骨架**`
 * 在页面上就是**字面的两个星号**，而它在编辑器里看起来完全像"已经加粗了"，
 * 所以代码评审与截图都容易滑过去。第一次是 §54 的游戏图（当时的处理是"截图核对长相时发现并删掉"），
 * 第二次是 §133 改档位那一段（`**可以改自己**`）与世界面板空态（`**模板骨架**`）——
 * 两次都靠人眼，第三次不该还靠人眼。
 *
 * 为什么扫源码而不是渲染结果：渲染要起浏览器，而这一条的判据在**文本**里，
 * 不必为了"页面上有没有星号"去点开每一个面板。
 *
 * 假阳性的处理：先把注释抹成空格（**保留换行**，这样报出来的行号与原文一致），
 * 再要求粗体内容里不含 `/`——否则 `'**\/*.ts'` 这种 glob 连着写两个就会被当成粗体
 * （`\*\*` + `内容` + `\*\*` 会跨过中间那一截匹配上）。不含 `/` 把 glob 挡在外面，
 * 而真正漏出来的粗体文案里出现斜杠的概率可以忽略。
 */

const SRC_DIR = join(import.meta.dirname, '..', 'src');

/** 所有 .tsx 源文件。非 .tsx 不看：这个 bug 只发生在 JSX 文本里 */
function tsxSources(): { path: string; lines: string[] }[] {
  const out: { path: string; lines: string[] }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!full.endsWith('.tsx')) continue;
      const raw = readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
      // 注释抹成等长空格、保留换行：行号与原文对齐，报错才指得到地方
      const blanked = raw
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(^|\s)\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
      out.push({ path: full.slice(SRC_DIR.length).replaceAll('\\', '/'), lines: blanked.split('\n') });
    }
  };
  walk(SRC_DIR);
  return out;
}

const BOLD = /\*\*([^*\n/]{1,40})\*\*/;

describe('结构门：JSX 文案里不许漏出 markdown 粗体', () => {
  it('扫到的 .tsx 文件里确实有东西（空集不能绿成"干净"）', () => {
    expect(tsxSources().length, `${SRC_DIR} 下一个 .tsx 都没有，下面那条是在比空集`).toBeGreaterThanOrEqual(30);
  });

  it('没有一处把 `**粗体**` 当文案写进 JSX', () => {
    const offenders: string[] = [];
    for (const file of tsxSources()) {
      file.lines.forEach((line, index) => {
        const hit = line.match(BOLD);
        if (hit) offenders.push(`${file.path}:${index + 1} → ${hit[0]}`);
      });
    }
    expect(
      offenders,
      '这些地方在页面上会原样显示两个星号（要用 <strong> 或干脆去掉强调）：\n' + offenders.join('\n'),
    ).toEqual([]);
  });
});
