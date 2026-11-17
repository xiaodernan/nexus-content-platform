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
  '005-收件人': '005-the-addressee',
};

/** 回响网页 slug（E0N，番外，正典之外），同纪律登记 */
const ECHO_WEB_SLUGS: Record<string, string> = {
  'E01-巡逻路札记': 'echo-001-patrol-road-notes',
  'E02-潮候船上没有岸': 'echo-002-no-shore-on-the-tide-waiting-ship',
  'E03-退潮三日': 'echo-003-the-three-days-the-tide-withdrew',
  'E04-盐在井里等潮': 'echo-004-salt-waiting-for-the-tide-in-the-well',
  'E05-没人动过的沙盘': 'echo-005-the-sand-table-no-one-touched',
  'E06-教团没有买的歌谱': 'echo-006-the-score-the-institute-never-bought',
  'E07-黄铜盘上刀光': 'echo-007-the-gleam-in-the-brass-basin',
  'E08-完颜的潮汐钟': 'echo-008-the-wan-yan-tide-clock',
  'E09-潮生不急': 'echo-009-the-tide-went-out-without-orders',
  'E10-灯在潮退时没有往回点': 'echo-010-the-lamp-never-lit-when-the-tide-went-out',
  'E11-祠殿堂没有锁的门': 'echo-011-the-door-the-chapel-never-locked',
  'E12-潮落时才有的回声': 'echo-012-the-echo-that-only-comes-when-the-tide-is-out',
  'E13-潮候院没有叫过的那一声会': 'echo-013-the-convocation-nobody-called',
  'E14-潮汐表的封面': 'echo-014-the-cover-of-the-tide-table',
  'E15-巷子深处那盏没人记得的灯': 'echo-015-the-lamp-the-wine-shop-never-remembers',
  'E16-潮沙盘上那四只小贝壳': 'echo-016-the-four-small-shells-on-the-tide-sand-table',
  'E17-祠殿后那一截没有人劈开的浮木': 'echo-017-the-driftwood-nobody-split',
  'E18-祠殿里从不叫的一只猫': 'echo-018-the-cat-in-the-institute-that-never-meowed',
  'E19-里巷子的抄本员': 'echo-019-the-copyists-of-the-back-alley',
  'E20-潮候院钟楼里那口从不响的钟': 'echo-020-the-bell-that-never-rang',
  'E21-里巷子码头的七盏号灯': 'echo-021-the-seven-lamps-of-the-back-alley-pier',
  'E22-里巷子晾鱼架上那条永远晾不干的鱼': 'echo-022-the-fish-that-never-dried',
  'E23-雾港里那艘只在黄昏出现的船': 'echo-023-the-ship-that-appears-only-at-dusk',
  'E24-里巷子石槽里那粒没化的盐': 'echo-024-the-salt-that-never-dissolved',
  'E25-里巷子所有灯熄的那一夜': 'echo-025-the-night-every-lamp-went-out',
  'E26-祠殿檐下那张潮候院不许扫的网': 'echo-026-the-web-nobody-is-allowed-to-sweep',
  'E27-里巷子里刻着四十一次大会的那面墙': 'echo-027-the-wall-of-the-forty-one-convocations',
  'E28-潮候院沙漏里那枚没人拆开的结': 'echo-028-the-knot-in-the-hourglass',
  'E29-祠殿里那双没人穿的木屐': 'echo-029-the-wooden-clogs-nobody-wears',
  'E30-祠殿门槛下压着的那七块木板': 'echo-030-the-seven-boards-under-the-sill',
  'E31-里巷子赌局桌上那枚没人认领的白子': 'echo-031-the-white-stone-nobody-claimed',
  'E32-祠殿后那张印错的潮汐表': 'echo-032-the-tide-table-with-one-row-wrong',
  'E33-四十一次大会那天一并封起来的那封信': 'echo-033-the-letter-of-the-forty-first-convocation',
  'E34-祠殿地下室里那张旧海图': 'echo-034-the-old-sea-chart-in-the-chapel-cellar',
  'E35-祠殿侧门外那只从不干的石凹': 'echo-035-the-stone-basin-that-never-runs-dry',
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
