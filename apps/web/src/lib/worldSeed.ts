/**
 * 种子世界：从任意字符串确定性地长出一个九类齐全的起始篇章。
 * 零 provider、零随机、零写库；同一 seed 永远同一片土地。
 *
 * 诚实边界：这是**程序生成的起始骨架**，不是作者写的史实，也不是模型新写的设定。
 * 所有条目互相引用同一批名词（地名/势力/角色/生物/物品都从 seed 里同一次抽取），
 * 所以读起来是一片连贯的土地，而不是九段互不相干的模板话。
 */
import type { ImportedWorld } from './worldExport';

const ERAS = ['灰灯纪', '潮候纪', '盐火纪', '白砾纪', '磨盘纪', '断潮纪'];
const GEO = ['盐道', '白砾原', '断潮崖', '回声滩', '石磨谷', '灰灯坡'];
const FACTIONS = ['潮候院', '磨石会', '灯下人', '数潮司', '盐道盟', '候潮堂'];
const CHARACTERS = ['提灯者阿盐', '数潮人石九', '磨盘守夜人', '哑婆潮生', '拾盐少年', '断崖信使'];
const CREATURES = ['盐蛾', '石磨兽', '潮痕螈', '灰灯狐', '衔石鸟', '白砾鼬'];
const ITEMS = ['潮痕石', '灰灯芯', '磨盘齿', '退潮铃', '盐纹牌', '候潮表'];
const QUESTS = ['找回失落的潮表', '把灯芯送过盐道', '替磨石会数一夜潮', '取回崖下的盐纹牌', '给衔石鸟指路', '重刻断潮的碑'];
const STORIES = ['第一盏灯', '第三步的脚印', '磨盘停下那一刻', '盐道尽头的答问', '没写完的名字', '退潮后的来客'];

/** 本地 FNV-1a：只用来从 seed 取词，不是安全哈希。 */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function pick(list: readonly string[], seed: number, salt: number): string {
  return list[(hash32(`${seed}|${salt}`) % list.length)]!;
}

export function generateSeedChapter(seed: string): ImportedWorld {
  const base = hash32(seed.trim() || '无名之地');
  const era = pick(ERAS, base, 1);
  const geo = pick(GEO, base, 2);
  const faction = pick(FACTIONS, base, 3);
  const character = pick(CHARACTERS, base, 4);
  const creature = pick(CREATURES, base, 5);
  const item = pick(ITEMS, base, 6);
  const quest = pick(QUESTS, base, 7);
  const story = pick(STORIES, base, 8);

  return {
    name: `种子世界 · ${seed.trim().slice(0, 24) || '无名之地'}`,
    summary: `一片从「${seed.trim() || '无名之地'}」长出的起始土地：${geo}、${faction}与${era}。以下是程序生成的骨架，等你来改写。`,
    entries: [
      {
        kind: 'lore', title: `${era}·潮谓`,
        body: `人们说潮声里藏着尚未写下的名字。${geo}的石缝每逢退潮便渗出盐，老人管这叫「${item}」的预兆。`,
        era, memory: '咸味贴着舌根。',
      },
      {
        kind: 'history', title: '断潮之岁',
        body: `${faction}在那一年把记时的石磨搬上${geo}，从此「${era}」从磨盘的转数里开始计数。`,
        era, order: 0, memory: '石磨转动时，地面微微发颤。',
      },
      {
        kind: 'geography', title: geo,
        body: `${geo}路面泛白，石缝积盐；${creature}只在退潮后的第三步留下脚印。`,
        era, order: 1, memory: '白光刺得人睁不开眼。',
      },
      {
        kind: 'factions', title: faction,
        body: `${faction}以老石磨记时，门人每日沿${geo}走一趟，把潮位刻在${item}上。`,
        era, order: 2, memory: '磨盘声在雾里传得很远。',
      },
      {
        kind: 'characters', title: character,
        body: `${character}是${faction}里唯一听得懂${creature}叫声的人，常在${geo}尽头坐着。`,
        era, order: 3, memory: '那叫声像有人在很远的地方喊名字。',
      },
      {
        kind: 'creatures', title: creature,
        body: `${creature}只在${geo}的第三步出现；${character}说它不是兽，是一段没被写完的记忆。`,
        era, order: 4, memory: '它走过的石缝是凉的。',
      },
      {
        kind: 'items', title: item,
        body: `${item}是${faction}记潮的凭据，磨盘每转一圈，石面就多一道潮痕。`,
        era, order: 5, memory: '握在手里比看上去沉。',
      },
      {
        kind: 'quests', title: quest,
        body: `${quest}：沿${geo}找回一枚被潮水带走的${item}，交还${faction}。`,
        era, order: 6, memory: '潮水退去时，脚印正好第三行。',
      },
      {
        kind: 'story', title: story,
        body: `${story}：${character}第一次在${geo}听见${creature}时，${faction}的磨盘正停在「${era}」的第三圈。`,
        era, order: 7, memory: '那一刻，盐味忽然变得很轻。',
      },
    ],
  };
}
