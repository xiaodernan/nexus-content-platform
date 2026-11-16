#!/usr/bin/env node
/**
 * 生成 `apps/web/src/world-bible/generated.ts`（典籍室快照）。
 *
 * 来源只认 `docs/world-bible/`：
 *   `NNN-<zh-title>.md`  —— 中文正典
 *   `NNN-<zh-title>.en.md` —— 英文译本（verify-world-bible-anchors.mts 保证成对 ≥4 锚句）
 *
 * 纪律：
 * - 快照是生成产物，禁止手改；`npm run verify:bible-snapshot` 字节比对超廉保证一致。
 * - 正文只剥掉以 `# ` 开头的首个大标题行（页面自己渲染标题），其余一字不动。
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = process.cwd();
const BIBLE_DIR = join(ROOT, 'docs', 'world-bible');
const OUT = join(ROOT, 'apps', 'web', 'src', 'world-bible', 'generated.ts');

interface ChapterOut {
  order: number;
  slug: string;
  titleZh: string;
  titleEn: string;
  eraLineZh: string;
  eraLineEn: string;
  markdownZh: string;
  markdownEn: string;
}

/**
 * 网页 slug（纯 ASCII）——URL 里不放中文，避免编码/copy-paste 灾难。
 * 新章节必须在这里登记，否则生成器红；不允许中文 slug 静默溜进路由里。
 */
const WEB_SLUGS: Record<string, string> = {
  '001-潮汐教团的余烬': '001-last-ember-of-the-tide-conclave',
  '002-潮汐教团的第四十一次会议': '002-the-forty-first-convocation',
  '003-潮沙盘': '003-the-tide-sand-table',
  '004-第八盏灯': '004-the-eighth-lamp',
  '005-远信': '005-letters-never-posted',
  '006-最后的签收': '006-the-final-seal',
  '007-灯前灰': '007-ashes-before-the-lamp',
  '008-灰后': '008-after-the-ash',
  '009-带灰回家': '009-ash-carried-home',
};

/** 回响网页 slug（E0N，番外，正典之外），同纪律登记 */
const ECHO_WEB_SLUGS: Record<string, string> = {
  'E01-巡逻路札记': 'echo-001-patrol-road-notes',
  'E02-灯芯札记': 'echo-002-lamp-wick-notes',
  'E03-盐灯守灵日记': 'echo-003-salt-lamp-vigil-diary',
  'E04-第九叩': 'echo-004-ninth-knock',
  'E05-灯绳记': 'echo-005-lamp-rope-memoir',
  'E06-传灯记': 'echo-006-the-handoff-of-the-lamp',
  'E07-那一针': 'echo-007-the-needle',
  'E08-封面四字': 'echo-008-the-four-characters',
  'E09-红绳': 'echo-009-the-red-cord',
  'E10-钥匙': 'echo-010-the-keys',
  'E11-秤': 'echo-011-the-scale',
  'E12-碗': 'echo-012-the-bowl',
};

const ECHOES_DIR = join(ROOT, 'docs', 'world-bible', 'echoes');

function parseTitleZh(line: string): string {
  const m = /「(.+?)」/.exec(line);
  if (!m) throw new Error(`无法从中文章首行解析标题：${line}`);
  return m[1]!;
}

function parseTitleEn(line: string): string {
  const i = line.lastIndexOf(': ');
  if (i < 0) throw new Error(`无法从英文译本首行解析标题：${line}`);
  return line.slice(i + 2).trim();
}

function parseEraZh(lines: string[]): string {
  const line = lines.find((l) => l.startsWith('> 纪元'));
  if (!line) throw new Error('缺少「> 纪元：…」行');
  return line.replace(/^>\s*/, '');
}

function parseEraEn(lines: string[]): string {
  const line = lines.find((l) => l.startsWith('> Era:'));
  if (!line) throw new Error('missing "> Era: …" line');
  return line.replace(/^>\s*/, '');
}

/** 正文 = 去掉首个 `# ` 标题行之后的全部内容（含空行，规范化为 LF）。 */
function body(lines: string[]): string {
  const idx = lines.findIndex((l) => l.startsWith('# '));
  const rest = idx === -1 ? lines : lines.slice(idx + 1);
  return rest.join('\n').replace(/\r\n/g, '\n');
}

function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

const files = readdirSync(BIBLE_DIR).filter((f) => f.endsWith('.md'));
const zhFiles = files.filter((f) => !f.endsWith('.en.md')).sort();
if (zhFiles.length === 0) {
  console.error('world-bible 目录里没有中文正典 .md 文件');
  process.exit(1);
}

const chapters: ChapterOut[] = zhFiles.map((zh, i) => {
  const en = zh.replace(/\.md$/, '.en.md');
  if (!files.includes(en)) {
    console.error(`✗ ${zh} 缺少英文译本 ${en}`);
    process.exit(1);
  }
  const zhLines = readFileSync(join(BIBLE_DIR, zh), 'utf8').replace(/\r\n/g, '\n').split('\n');
  const enLines = readFileSync(join(BIBLE_DIR, en), 'utf8').replace(/\r\n/g, '\n').split('\n');
  const order = Number(zh.slice(0, 3));
  if (!Number.isInteger(order) || order !== i + 1) {
    console.error(`✗ ${zh} 的序号 prefix 不是 ${i + 1}（文件名须 NNN-）`);
    process.exit(1);
  }
  const fileSlug = zh.replace(/\.md$/, '');
  const webSlug = WEB_SLUGS[fileSlug];
  if (!webSlug) {
    console.error(`✗ ${zh} 没有登记网页 slug（在 gen-bible-snapshot.mts 的 WEB_SLUGS 里加一行）`);
    process.exit(1);
  }
  return {
    order,
    slug: webSlug,
    titleZh: parseTitleZh(zhLines[0]!),
    titleEn: parseTitleEn(enLines[0]!),
    eraLineZh: parseEraZh(zhLines),
    eraLineEn: parseEraEn(enLines),
    markdownZh: body(zhLines),
    markdownEn: body(enLines),
  };
});

/** 回响 title 从 EN 首行取": "之后的部分；回响中文章首行有"回响（其N）「title」"，抓最后一个「」 */
function echoOrder(file: string): number {
  const m = /^E(\d{2})-/.exec(file);
  if (!m) throw new Error(`回响文件名须以 E0N- 开头：${file}`);
  return Number(m[1]);
}

const echoes: ChapterOut[] = [];
if (existsSync(ECHOES_DIR)) {
  const echoFiles = readdirSync(ECHOES_DIR).filter((f) => f.endsWith('.md'));
  const zhEchoes = echoFiles.filter((f) => !f.endsWith('.en.md')).sort();
  for (const zh of zhEchoes) {
    const en = zh.replace(/\.md$/, '.en.md');
    if (!echoFiles.includes(en)) {
      console.error(`✗ echoes/${zh} 缺少英文译本 ${en}`);
      process.exit(1);
    }
    const zhLines = readFileSync(join(ECHOES_DIR, zh), 'utf8').replace(/\r\n/g, '\n').split('\n');
    const enLines = readFileSync(join(ECHOES_DIR, en), 'utf8').replace(/\r\n/g, '\n').split('\n');
    const webSlug = ECHO_WEB_SLUGS[zh.replace(/\.md$/, '')];
    if (!webSlug) {
      console.error(`✗ echoes/${zh} 没有登记网页 slug（在 gen-bible-snapshot.mts 的 ECHO_WEB_SLUGS 里加一行）`);
      process.exit(1);
    }
    echoes.push({
      order: echoOrder(zh),
      slug: webSlug,
      titleZh: parseTitleZh(zhLines[0]!),
      titleEn: parseTitleEn(enLines[0]!),
      eraLineZh: parseEraZh(zhLines),
      eraLineEn: parseEraEn(enLines),
      markdownZh: body(zhLines),
      markdownEn: body(enLines),
    });
  }
}

const emitEntries = (entries: readonly ChapterOut[]): string[] =>
  entries.map(
    (c) => `  {
    order: ${c.order},
    slug: '${c.slug}',
    titleZh: '${c.titleZh.replace(/'/g, "\\'")}',
    titleEn: '${c.titleEn.replace(/'/g, "\\'")}',
    eraLineZh: '${c.eraLineZh.replace(/'/g, "\\'")}',
    eraLineEn: '${c.eraLineEn.replace(/'/g, "\\'")}',
    markdownZh: \`${esc(c.markdownZh)}\`,
    markdownEn: \`${esc(c.markdownEn)}\`,
  },`,
  );

const out = [
  '// 低语诸王 · 世界大典快照 —— 由 scripts/gen-bible-snapshot.mts 生成，禁止手改。',
  '// docs/world-bible/ 是唯一真值；npm run verify:bible-snapshot 保证两边字节一致。',
  '',
  'export interface BibleChapter {',
  '  readonly order: number;',
  '  readonly slug: string;',
  '  readonly titleZh: string;',
  '  readonly titleEn: string;',
  '  readonly eraLineZh: string;',
  '  readonly eraLineEn: string;',
  '  readonly markdownZh: string;',
  '  readonly markdownEn: string;',
  '}',
  '',
  'export const BIBLE_CHAPTERS: readonly BibleChapter[] = [',
  ...emitEntries(chapters),
  '] as const;',
  '',
  'export const BIBLE_ECHOES: readonly BibleChapter[] = [',
  ...emitEntries(echoes),
  '] as const;',
  '',
].join('\n');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out, 'utf8');
console.log(`✓ generated ${OUT}（${chapters.length} 章 · ${echoes.length} 回响）`);
