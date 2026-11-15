/**
 * §BIBLE-1 世界大典正文渲染器（典籍室 · `/bible/*`）。
 *
 * 只认世界大典自己那一小撮语法（正典文件是受控输入、非用户输入）：
 *   `## ` h2 · `### ` h3 · `> ` 引用块（连续） · `|` 表格 · `1. ` 有序清单 · `- ` 无序清单 ·
 *   `---` 分隔线 · 空行分段 · 行内 `**加粗**` 与 `` `code` ``。
 * 其它一切按普通段落渲染。**不要扩展成通用 markdown 解析器**——正典要的就是可预测、
 * 可钉死的视觉，不是"九十种没见过的输入连上都能画"。
 *
 * 锚句与翻译成对靠的是 `verify-world-bible-anchors.mts`，不是这里。
 */

type InlinePiece = { kind: 'text' | 'strong' | 'code'; text: string };

/** 粗体标记——集中在常量里，避免页面代码四散星号（结构门：连续两个星号只许出现在这里） */
const BOLD_MARK = '**';

function inlinePieces(text: string): InlinePiece[] {
  const out: InlinePiece[] = [];
  for (const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
    if (!part) continue;
    if (part.startsWith(BOLD_MARK) && part.endsWith(BOLD_MARK) && part.length > 4) {
      out.push({ kind: 'strong', text: part.slice(2, -2) });
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      out.push({ kind: 'code', text: part.slice(1, -1) });
    } else {
      out.push({ kind: 'text', text: part });
    }
  }
  return out;
}

export function BibleInline({ text }: { text: string }) {
  const pieces = inlinePieces(text);
  return (
    <>
      {pieces.map((p, i) =>
        p.kind === 'strong' ? (
          <strong key={i} className="bb-strong">{p.text}</strong>
        ) : p.kind === 'code' ? (
          <code key={i} className="bb-code">{p.text}</code>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

type Block =
  | { type: 'heading2'; text: string }
  | { type: 'heading3'; text: string }
  | { type: 'quote'; lines: string[] }
  | { type: 'olist'; items: string[] }
  | { type: 'ulist'; items: string[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'hr' }
  | { type: 'para'; lines: string[] };

function flushPara(lines: string[], out: Block[]): void {
  if (lines.length) out.push({ type: 'para', lines: [...lines] });
  lines.length = 0;
}

function parseTableCells(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isTableSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

export function parseBibleMarkdown(markdown: string): Block[] {
  const out: Block[] = [];
  const para: string[] = [];

  let quote: string[] | null = null;
  let olist: string[] | null = null;
  let ulist: string[] | null = null;
  let table: string[][] | null = null;

  const flushAll = () => {
    flushPara(para, out);
    if (quote) { out.push({ type: 'quote', lines: quote }); quote = null; }
    if (olist) { out.push({ type: 'olist', items: olist }); olist = null; }
    if (ulist) { out.push({ type: 'ulist', items: ulist }); ulist = null; }
    if (table) {
      // 首行表头；中间的分隔行（---）丢弃；其余为数据行
      const header = table[0]!;
      const rows = table.slice(1).filter((row) => !isTableSeparator(row));
      out.push({ type: 'table', header, rows });
      table = null;
    }
  };

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd();

    if (line.trim() === '') {
      flushAll();
      continue;
    }
    if (/^-{3,}$/.test(line.trim())) {
      flushAll();
      out.push({ type: 'hr' });
      continue;
    }
    if (line.startsWith('## ')) {
      flushAll();
      out.push({ type: 'heading2', text: line.slice(3).trim() });
      continue;
    }
    if (line.startsWith('### ')) {
      flushAll();
      out.push({ type: 'heading3', text: line.slice(4).trim() });
      continue;
    }
    if (line.startsWith('> ')) {
      flushPara(para, out);
      if (!quote) quote = [];
      // 相邻引用行合并为一句/一段；每行一个 <p>
      quote.push(line.slice(2).trim());
      continue;
    }
    if (line.startsWith('|')) {
      flushPara(para, out);
      if (quote) { out.push({ type: 'quote', lines: quote }); quote = null; }
      if (!table) table = [];
      table.push(parseTableCells(line));
      continue;
    }
    const olMatch = /^\d+\.\s+(.+)$/.exec(line.trim());
    if (olMatch) {
      flushPara(para, out);
      if (!olist) olist = [];
      olist.push(olMatch[1]!.trim());
      continue;
    }
    const ulMatch = /^-\s+(.+)$/.exec(line.trim());
    if (ulMatch) {
      flushPara(para, out);
      if (!ulist) ulist = [];
      ulist.push(ulMatch[1]!.trim());
      continue;
    }
    para.push(line);
  }
  flushAll();
  return out;
}

export function BibleMarkdown({ markdown, tableRegionAria }: { markdown: string; tableRegionAria: string }) {
  const blocks = parseBibleMarkdown(markdown);
  return (
    <div className="bb-article">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading2':
            return <h2 key={i} className="bb-h2"><BibleInline text={block.text} /></h2>;
          case 'heading3':
            return <h3 key={i} className="bb-h3"><BibleInline text={block.text} /></h3>;
          case 'quote':
            return (
              <blockquote key={i} className="bb-quote">
                {block.lines.map((l, j) => <p key={j} className="bb-quoteLine"><BibleInline text={l} /></p>)}
              </blockquote>
            );
          case 'olist':
            return (
              <ol key={i} className="bb-list" start={1}>
                {block.items.map((item, j) => <li key={j} className="bb-listItem"><BibleInline text={item} /></li>)}
              </ol>
            );
          case 'ulist':
            return (
              <ul key={i} className="bb-list bb-listDash">
                {block.items.map((item, j) => <li key={j} className="bb-listItem"><BibleInline text={item} /></li>)}
              </ul>
            );
          case 'table':
            return (
              <div key={i} className="bb-tableRegion" role="region" aria-label={tableRegionAria} tabIndex={0}>
                <table className="bb-table">
                  <thead>
                    <tr>{block.header.map((h, j) => <th key={j} className="bb-th"><BibleInline text={h} /></th>)}</tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((cell, k) => <td key={k} className="bb-td"><BibleInline text={cell} /></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'hr':
            return <hr key={i} className="bb-hr" aria-hidden="true" />;
          case 'para':
            return (
              <p key={i} className="bb-p">
                {block.lines.map((l, j) => (
                  <span key={j}>
                    {j > 0 && ' '}
                    <BibleInline text={l} />
                  </span>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}

/** 锚句提取（阅读页底部"锚句速览"用）：正典 md 里 `**锚句**` / `**Anchor sentence**` 各自成行。 */
export function extractAnchors(markdownZh: string, markdownEn: string): ReadonlyArray<{ zh: string; en: string }> {
  const collect = (md: string, re: RegExp) => {
    const out: string[] = [];
    for (const l of md.split('\n')) {
      const m = re.exec(l);
      if (m) out.push(m[1]!.trim());
    }
    return out;
  };
  const zh = collect(markdownZh, /^\*\*锚句\*\*[:：]?\s*(.+)$/);
  const en = collect(markdownEn, /^\*\*Anchor sentence\*\*[:：]?\s*(.+)$/);
  const n = Math.min(zh.length, en.length);
  const out: Array<{ zh: string; en: string }> = [];
  for (let i = 0; i < n; i++) out.push({ zh: zh[i]!, en: en[i]! });
  return out;
}
