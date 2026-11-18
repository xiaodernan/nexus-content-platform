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
  '005-远信': '005-the-distant-letter',
  '006-最后的签收': '006-the-last-signing',
  '007-灯前灰': '007-ash-before-the-lamp',
  '008-灰后': '008-after-the-grey',
  '009-带灰回家': '009-taking-the-grey-back-home',
  '010-谁守灯': '010-who-keeps-the-lamp',
  '011-灯下的账': '011-the-ledger-under-the-lamp',
  '012-潮来的时候': '012-when-the-tide-comes',
  '013-誊写': '013-the-fair-copy',
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
  'E36-值更院米缸里那粒从不沉下去的米': 'echo-036-the-grain-that-never-sinks',
  'E37-值更院米缸月最后一夜那口从不离灶的粥': 'echo-037-the-congee-pot-that-never-leaves-the-stove',
  'E38-值更院井台边那块永远不干的石板': 'echo-038-the-tide-stone-by-the-well',
  'E39-值更院灯架最上层那盏不灭的灯': 'echo-039-the-night-eye-at-the-top-of-the-lamp-rack',
  'E40-值更院值更图上那个没人认识的名字': 'echo-040-the-name-on-the-roster-nobody-recognizes',
  'E41-祠殿横梁上那条画了一半的龙': 'echo-041-the-half-painted-dragon-on-the-chapel-beam',
  'E42-雾港驿站那匹从不出门的马': 'echo-042-the-horse-at-the-staging-post-that-never-leaves',
  'E43-祠殿地下室那只从不干的墨碗': 'echo-043-the-ink-bowl-in-the-chapel-cellar-that-never-dries',
  'E44-祠殿日影那根永远赶不上影子的指针': 'echo-044-the-shadi-that-never-catches-its-shadow',
  'E45-潮候院侧殿里那根永远织不完的麻绳': 'echo-045-the-hemp-rope-in-the-side-chapel-that-is-never-finished',
  'E46-雾港钟楼上那口从没被敲过的铜钟': 'echo-046-the-bronze-bell-on-the-tower-that-is-never-struck',
  'E47-潮候院后院晒干草的木板上那颗从不动的露珠': 'echo-047-the-dewdrop-on-the-hay-board-that-never-moves',
  'E48-雾港渡船上那位从不开口的船客': 'echo-048-the-waiting-passenger-on-the-fog-harbor-ferry',
  'E49-雾港渡口那张印错的潮汐表上从来没被划掉的那一行': 'echo-049-the-half-moon-tide-that-no-one-struck-out',
  'E50-祠殿南厢房那本旧目录上空着的第四十一页': 'echo-050-the-forty-first-blank-page-in-the-index',
  'E51-雾港灯塔第七级台阶上那双从来没擦掉的脚印': 'echo-051-the-footprints-on-the-seventh-step-of-the-lantern-tower-never-cleaned',
  'E52-潮候院祠殿门廊那一段摸过六十九年的门槛': 'echo-052-the-threshold-in-the-chapel-porch-worn-by-sixty-nine-years',
  'E53-雾港渔村吹着朝号等潮的船工那颗从未离手的螺号': 'echo-053-the-whistle-keeper-never-without-his-horn',
  'E54-潮候院祠殿后廊那口锁住锤舌的夜钟': 'echo-054-the-night-bell-with-its-tongue-sealed',
  'E55-潮候院东偏院那间从没装门只系铜环的房间': 'echo-055-the-doorless-room-of-the-east-wing',
  'E56-雾港公示牌下面那张没人认领的明日大雨': 'echo-056-the-nobody-claimed-great-rain-tomorrow',
  'E57-雾港潮水漂上来那张潮候院言归帖': 'echo-057-the-undeliverable-summons-from-the-tide',
  'E58-潮候院祠殿墙脚那条抄本师只认墨不认盐的墨线': 'echo-058-the-ink-line-at-the-sanctuary-foot',
  'E59-雾港东南巷那口盐封不了的井': 'echo-059-the-well-the-salt-cannot-hold',
  'E60-值更人交班那本双线册里从没谁签写完的半钩': 'echo-060-the-half-hook-no-one-finishes',
  'E61-祠殿侧窗那本没人敢翻第二页的集子': 'echo-061-the-volume-no-one-opens-the-second-page',
  'E62-祠殿书库那本不用灯也会亮的借光本': 'echo-062-the-borrow-light-volume-in-the-library',
  'E63-潮候院东偏院那盏百年不曾熄过的油灯': 'echo-063-the-ever-burning-lamp-in-the-eastern-wing',
  'E64-潮候院祠内那根影子自分为两半的石柱': 'echo-064-the-split-shadowed-pillar',
  'E65-祠殿面东墙那一排谁也不认得的偏旁': 'echo-065-the-radical-only-column-on-the-east-wall',
  'E66-潮候院大门口那位扫了三十年的扫帚师': 'echo-066-the-sweeper-at-the-gate',
  'E67-雾港东南港口那位老交长执事': 'echo-067-the-tidekeeper-of-the-south-east-dock',
  'E68-潮候院潮水巷里的那位陶人阿栀': 'echo-068-the-potter-of-the-tide-alley',
  'E69-雾港回声站那一队再没有回来的潮候师': 'echo-069-the-tide-keepers-who-never-returned',
  'E70-潮候院东郊码头那只三十六个春昼没人动它的白瓷碗': 'echo-070-the-bowl-nobody-moves-for-thirty-six-springs',
  'E71-潮候院祠殿桌里那本首行是「没」的旧账簿': 'echo-071-the-old-ledger-that-only-says-none',
  'E72-潮候院四百年前那只被收养的雾童': 'echo-072-the-fog-child-the-institute-adopted',
  'E73-潮候院内外南墙上的第一件碑文': 'echo-073-the-three-characters-on-the-inner-wall',
  'E74-潮候院内祠三光那扇被摇摇雾吻过的窗子': 'echo-074-the-fog-kissed-window-of-the-three-lamps',
  'E75-潮候院东门外那只唯一一次被喂食的幼鸟': 'echo-075-the-one-time-fed-seabird-at-the-east-gate',
  'E76-潮候院顶最高处那间没人打开的封地窖': 'echo-076-the-attic-no-one-opens',
  'E77-潮候院南山角那只一百多年从没入沉心的石狮': 'echo-077-the-stone-lion-who-never-sank',
  'E78-潮候院北库外角那只一年只打开一次的木匣': 'echo-078-the-wooden-box-opens-once-a-year',
  'E79-潮候院最深处那只守了九世的大镇海木鸦': 'echo-079-the-great-crow-at-the-deepest-place',
  'E80-潮候院前庭那只永远闭着眼睛的守门猫': 'echo-080-the-cat-that-keeps-watch-in-the-front-court',
  'E81-潮候院里老石磨盘-它磨不动任何东西': 'echo-081-the-millstone-that-grinds-nothing',
  'E82-潮候院孩子每天早晚抄的雾字影': 'echo-082-the-fog-strokes-the-children-copy',
  'E83-潮候院祠殿后那一汪从不照见任何东西的水潭': 'echo-083-the-pool-that-shows-nothing',
  'E84-潮候院祠殿碾房角落那口从不生锈的旧铁锅': 'echo-084-the-pot-that-never-rusts',
  'E85-潮候院祠殿屋脊上那对永远不孵蛋的铜斑鸽': 'echo-085-the-bronze-pigeons-on-the-ridge',
  'E86-潮候院东厢那根永远不凉的火箸': 'echo-086-the-tongs-that-never-go-cold',
  'E87-潮候院祠殿东山脚下那条从没人见过也走不到的暗河': 'echo-087-the-hidden-river-no-one-has-reached',
  'E88-灯芯札记': 'echo-088-notes-on-the-wick',
  'E89-盐灯守灵日记': 'echo-089-the-salt-lamp-vigil-diary',
  'E90-第九叩': 'echo-090-the-ninth-knock',
  'E91-灯绳记': 'echo-091-the-lamp-rope-memoir',
  'E92-传灯记': 'echo-092-the-passing-of-the-lamp',
  'E93-那一针': 'echo-093-that-one-stitch',
  'E94-封面四字': 'echo-094-four-characters-on-the-cover',
  'E95-红绳': 'echo-095-the-red-thread',
  'E96-钥匙': 'echo-096-the-key',
  'E97-秤': 'echo-097-the-scale',
  'E98-碗': 'echo-098-the-bowl',
  'E99-门槛': 'echo-099-the-threshold',
  'E100-柴': 'echo-100-the-kindling',
  'E101-灰坑': 'echo-101-the-ash-pit',
  'E102-最后一栏': 'echo-102-the-last-column',
  'E103-蜡封': 'echo-103-the-wax-seal',
  'E104-最后一夜': 'echo-104-the-last-night',
  'E105-雨从东边来': 'echo-105-the-rain-from-the-east',
  'E106-第一个名字': 'echo-106-the-first-name',
  'E107-没人誊的那一页': 'echo-107-the-untranscribed-page',
  'E108-半粒盐': 'echo-108-half-a-grain-of-salt',
  'E109-第四十二次会': 'echo-109-the-forty-second-convocation',
  'E110-灰封': 'echo-110-the-grey-binding',
  'E111-灰炉': 'echo-111-the-grey-hearth',
  'E112-第四十三次会': 'echo-112-the-forty-third-convocation',
  'E113-潮候院后墙不修的那一道裂痕': 'echo-113-the-wall-crack-no-one-repairs',
  'E114-潮候院西厢灯下那本永远翻到第四十二页的账': 'echo-114-the-ledger-forever-on-page-forty-two',
  'E115-潮候院北库那只永远积着尘的旧铜熨斗': 'echo-115-the-copper-iron-nobody-uses',
  'E116-潮候院北长廊每次大会散会就多一盏的灯': 'echo-116-the-colonnade-lamp-that-multiplies',
  'E117-雾港第九潮汐表上那行谁也划不掉的日期': 'echo-117-the-ninth-tide-almanac',
  'E118-退潮之后': 'echo-118-after-the-tide',
  'E119-潮信': 'echo-119-the-tide-letter',
  'E120-第四十四次会': 'echo-120-the-forty-fourth-convocation',
  'E121-靠门的椅子': 'echo-121-the-chair-nearest-the-door',
  'E122-借椅子': 'echo-122-the-borrowed-chair',
  'E123-潮的名字': 'echo-123-the-name-of-the-tide',
  'E124-旧册子里的名字': 'echo-124-the-name-in-the-old-ledger',
  'E125-潮起来的时候': 'echo-125-the-hour-the-tide-rose',
  'E126-潮候院后院那棵永不长叶的海棠': 'echo-126-the-crabapple-that-never-leaves',
  'E127-潮候院档案室最底层那本永远找不到的第十二册': 'echo-127-the-twelfth-volume-she-never-finds',
  'E128-潮候院里那只从不停的小鼓': 'echo-128-the-little-drum-that-never-stops',
  'E129-潮候院祠殿檐下那根永远不得响的木牌': 'echo-129-the-wooden-plaque-that-decides',
  'E130-潮候院后院那棵永远讲潮落的老榕': 'echo-130-the-banyan-that-tells-of-the-ebb',
  'E131-门开了一整夜': 'echo-131-the-door-stood-open-all-night',
  'E132-潮候院里那件永远等不到主人的蓑衣': 'echo-132-the-rain-cape-that-never-came-home',
  'E133-潮候院东院那棵从不下果的沉香树': 'echo-133-the-agarwood-that-bloomed-once',
  'E134-潮候院里那箱只装坏表的箱子': 'echo-134-the-box-of-broken-watches',
  'E135-潮候院里那只永远看向潮汐表的废风向标': 'echo-135-the-rusted-wind-vane-pointing-at-the-tide-table',
  'E136-潮候院东厢那口只听不说话的青铜井': 'echo-136-the-bronze-well-that-listens-never-speaks',
  'E137-潮候院祠殿里那把只在散会时有人坐的木椅': 'echo-137-the-nameless-chair-of-the-dissolution',
  'E138-潮候院祠殿外墙上那一行字里唯一写错的字': 'echo-138-the-one-wrong-character-on-the-chapel-wall',
  'E139-潮候院天台上那只只望雾港的望远镜': 'echo-139-the-telescope-that-watches-the-fog-harbor',
  'E140-潮候院抄本室里那盏从不熄灭的灯': 'echo-140-the-lamp-that-never-goes-out',
  'E141-潮候院门岗那本只记未入的访客籍': 'echo-141-the-book-of-the-never-admitted',
};

const ECHOES_DIR = join(ROOT, 'docs', 'world-bible', 'echoes');
const APPENDICES_DIR = join(ROOT, 'docs', 'world-bible', 'appendices');
const APP_SLUGS: Record<string, string> = {
  '001-annals-of-the-institute': 'appx-001-annals-of-the-institute',
  '002-institute-glossary': 'appx-002-institute-glossary',
  '003-the-salt-boundaries': 'appx-003-the-salt-boundaries',
  '004-watchers-code': 'appx-004-watchers-code',
};

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
  const m = /^E(\d{2,3})-/.exec(file);
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

/** Appendices: same shape as chapters but not routed; order from 1; no anchor lines. */
const appendices: ChapterOut[] = [];
if (existsSync(APPENDICES_DIR)) {
  const appFiles = readdirSync(APPENDICES_DIR).filter((f) => f.endsWith('.md'));
  const zhApps = appFiles.filter((f) => !f.endsWith('.en.md')).sort();
  let appOrder = 0;
  for (const zh of zhApps) {
    appOrder += 1;
    const en = zh.replace(/\.md$/, '.en.md');
    if (!appFiles.includes(en)) {
      console.error(`✗ appendices/${zh} 缺少英文译本 ${en}`);
      process.exit(1);
    }
    const zhLines = readFileSync(join(APPENDICES_DIR, zh), 'utf8').replace(/\r\n/g, '\n').split('\n');
    const enLines = readFileSync(join(APPENDICES_DIR, en), 'utf8').replace(/\r\n/g, '\n').split('\n');
    const appSlug = APP_SLUGS[zh.replace(/\.md$/, '')];
    if (!appSlug) {
      console.error(`✗ appendices/${zh} 没有登记 slug（在 gen-bible-snapshot.mts 的 APP_SLUGS 里加一行）`);
      process.exit(1);
    }
    const appTitleZh = (() => {
      const first = zhLines.find((l) => l.startsWith('# '));
      return first ? first.replace(/^#\s*/, '').trim() : zh.replace(/\.md$/, '');
    })();
    const appTitleEn = (() => {
      const first = enLines.find((l) => l.startsWith('# '));
      return first ? first.replace(/^#\s*/, '').trim() : zh.replace(/\.md$/, '');
    })();
    const eraZh = zhLines.find((l) => l.startsWith('> 纪元：'));
    const eraEn = enLines.find((l) => l.startsWith('> Era:'));
    appendices.push({
      order: appOrder,
      slug: appSlug,
      titleZh: appTitleZh,
      titleEn: appTitleEn,
      eraLineZh: (eraZh ?? '').replace(/^>\s*/, '').trim(),
      eraLineEn: (eraEn ?? '').replace(/^>\s*/, '').trim(),
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
  'export const BIBLE_APPENDICES: readonly BibleChapter[] = [',
  ...emitEntries(appendices),
  '] as const;',
  '',
].join('\n');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out, 'utf8');
console.log(`✓ generated ${OUT}（${chapters.length} 章 · ${echoes.length} 回响 · ${appendices.length} 附录）`);
