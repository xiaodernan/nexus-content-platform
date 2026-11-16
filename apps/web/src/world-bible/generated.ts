// 低语诸王 · 世界大典快照 —— 由 scripts/gen-bible-snapshot.mts 生成，禁止手改。
// docs/world-bible/ 是唯一真值；npm run verify:bible-snapshot 保证两边字节一致。

export interface BibleChapter {
  readonly order: number;
  readonly slug: string;
  readonly titleZh: string;
  readonly titleEn: string;
  readonly eraLineZh: string;
  readonly eraLineEn: string;
  readonly markdownZh: string;
  readonly markdownEn: string;
}

export const BIBLE_CHAPTERS: readonly BibleChapter[] = [
  {
    order: 1,
    slug: '001-last-ember-of-the-tide-conclave',
    titleZh: '潮汐教团的余烬',
    titleEn: 'The Last Ember of the Tide Conclave',
    eraLineZh: '纪元：灰烬纪（The Ash Age）· 位于灰灯纪（The Grey-Lamp Age）之后、铁月纪（The Iron-Moon Age）之前。',
    eraLineEn: 'Era: the Ash Age — after the Grey-Lamp Age, before the Iron-Moon Age.',
    markdownZh: `# 低语诸王 / The Whispers' Kings · World Bible · Chapter I: The Last Ember of the Tide Conclave

> 作者署名的一章正典。写给 \`低语诸王\` 这一世界的作者与读者：凡引用本章的条目，应保持锚句的逐字一致——
> 锚句用于导航以外的所有用途（检索、评测锚点、读者信手定位）都依赖它的唯一性。
> / A canonical chapter authored for the world “The Whispers' Kings”. Any entry citing it must keep the anchor sentence word-for-word; navigation aside, every use (retrieval, evaluation anchors, reader bookmarks) relies on its uniqueness.

> 纪元：灰烬纪（The Ash Age）· 位于灰灯纪（The Grey-Lamp Age）之后、铁月纪（The Iron-Moon Age）之前。
> Era: the Ash Age — after the Grey-Lamp Age, before the Iron-Moon Age.

---

## 一 · 火种

盐海没有鱼，只有沉船的路标。威廉·罢汀说的一句话被潮汐教团刻在了潮汐室的门楣上：「我们敬的不是海，是海还没说完的话。」

第七次日蚀落下那天，王城投降了。城里所有的灯都亮着，就像在等一场本来已经结束的葬礼。只有潮门「聆潮汐」还被关着，教团里没人回来过，门上的盐霜长得比城墙的霉斑还快。

九年后，守夜人撞见了一个从没见过的孩子蹲在汐台边上看海。孩子说他在数浪，数到一百零九浪时停了下来，说：「海今天少说了一句。」

她按自己的习惯先问了路——不问姓名，先问他能把哪条巡逻路的记忆说出来。孩子答不上来，却把雾港灯人的故事一字不漏地背了一遍：雾港的灯人每晚点亮三百盏灯，等一支从不回航的船队。背完之后他说，船队不是没回航，是不敢回航——因为回航意味着日蚀又要来了，而教团没有再点七次灯的胆子。

守夜人没有追问。她记得她记得的所有巡逻路，包括不存在的那条；那条路的尽头是月亮桥，而月亮桥从来只说话给活人听。

**锚句**：船队不敢回航，是因为回航意味着日蚀又要来。

**Anchor sentence**: the fleet dares not turn home, because turning home means the eclipse is coming again.

---

## 二 · 潮汐教团七席

灰灯纪末，潮汐教团立了七席：望潮（潮汐台首席）、辨潮（听潮人）、引潮（潮汐室规制官）、留潮（航海帐务）、定潮（定价与粮）、验潮（质变检验）、迎潮（海外联络）。

铁月纪初，海盗式的谈判家花了十个月把七席拆成了一个空壳：教团不签自己的名字，只留下一句「海还没说完的话」当签讫。

孩子口中的「潮汐教团余烬」就是这个壳——一把仍然定期出席汐台的座位，一屋子盐霜，一本缺了第四十一次会议记录的会册。他能说出会册里第六次会议的每一个字：那一夜，教团决定不再等日蚀的第八次。

后来有人问教团到底等的是什么。会册里只有一段很短的回忆，既像一条感官刻痕，又像一条判词：

> 盐味酸了——那是七日蚀的老味道。手指摸不到线，心里却知道它就在桌子上。

**锚句**：会册里第六次会议，教团决定不再等日蚀的第八次。

**Anchor sentence**: at the sixth convocation, the Conclave resolved never to wait for an eighth eclipse.

---

## 三 · 七口井

盐海从不回蓝天。海水份量上升时，盐霜会在沉船上长出一个「七口井」一样的形状——每一口都是一条没回来的船的船娘的遗世之物。

第七口，是最大的。镇上的老人都回避它，孩子们却很喜欢在那里玩。有一年孩子们发现第七口井里有一段从没见过的骨——海潮把它推上来，骨头是人的，却没有任何一件武器、衣物或护身符的残余。

孩子的父母把骨头交给了教团。教团的人看了很久，说它不是骸骨，是一条完整的句子——一句海还没说完的话，硬挤成了人形。

从那以后，没有人再往第七口井扔石子练胆子。

**锚句**：第七口井里推上来的不是骸骨，是一句海还没说完的话，硬挤成了人形。

**Anchor sentence**: what washed up from the seventh well was not a skeleton but a sentence the sea had not finished, squeezed into the shape of a person.

---

## 四 · 镜鳗

盐海深处有一种鳗。它们不游，只浮——浮在日蚀后的黑光里，身上每一片鳞都是一面小镜子。谁第一次见到它的当晚，你第二天就会照见自己想照的那件事，不附加任何条件。

守夜人自己从没见过镜鳗，但她记得有人问过她：「你想照见什么？」她想了很久，说出的其实不是答案，是一句：

> 盐海其实是一片打翻的镜子。

后来守夜人才知道，所有问过这个问题的人，都以为自己在问路。

**锚句**：盐海其实是一片打翻的镜子。

**Anchor sentence**: the salt sea is in fact one great overturned mirror.

---

## 五 · 汐台的七件事

教团余烬里流传七句关于汐台的话，每一句都配一条规矩：

1. 潮汐室不翻新。旧的盐霜不能洗，只能补。
2. 七口井有问就有答，但没有人有义务回答。
3. 不点第四盏灯。雾港灯人只点三百盏，少一盏都不算数。
4. 不等第八次日蚀。这不是迷信，是会册里的决定。
5. 不回航。要回来的人自己会回来。
6. 不收骸骨。收骸骨 = 宣布有人不会回来。
7. 不替海说话。

孩子背出了第四条，并补充说：会册里还写着，第八次日蚀不会来——因为第七次日蚀是教团自己制造的。

这一条从未得到旁证。它留给后世争论，而守夜人把这句话记进了巡逻路。

**锚句**：第八次日蚀不会来——因为第七次日蚀是教团自己制造的。

**Anchor sentence**: there will be no eighth eclipse — because the seventh eclipse was the Conclave’s own doing.

---

## 六 · 给铁月纪的信

潮汐教团余烬没有写下完整的终局。他们只留了一封信，贴在潮汐室里，收信人是铁月纪。

信上说：我们不判你们怎样活过接下来的日子，也不保佑你们经过盐海时不沉船；我们只保证，当你们抬头看见月亮桥说话的时候，它说的一定是你们祖父那一代人说过、却从未被人相信的那句：

> 海还没说完的话，要由活人来收尾。

孩子听完这封信，把自己所有的东西都扔进了汐台。他对守夜人说：「他们教我的潮汐，本来就不教给会反悔的人。」

后来，汐台多了一件事：每天早一只海鸥站在七口井的边上，不飞走，直到每一粒盐霜都记住了这一年的风。

**锚句**：海还没说完的话，要由活人来收尾。

**Anchor sentence**: the sentence the sea has not finished must be finished by the living.

---

## 七 · 这一章在模型里的影子

（写给世界观作者：本章对应的 world-node 映射，便于在 \`低语诸王\` 项目里照相落地。）

| 类别 | 标题 | 与本章对应 |
|---|---|---|
| lore | 潮汐教团余烬 | 第二节、第五节、第六节 |
| geography | 汐台 · 七口井 | 第三节 |
| characters | 守夜人 | 全篇（记忆回声素材：盐味酸了——那是七日蚀的老味道） |
| creatures | 镜鳗 | 第四节 |
| items | 会册第六卷 | 第二节（digest：第六次会议的决定） |
| quests | 教团的第四十一次会议 | 待续（卷二线索） |
| story | 潮汐教团的余烬 | 本章正典全文 |
| factions | 潮汐室 | 第一节、第二节 |
| history | 第七次日蚀 · 王城投降 | 第一节 |

> 本章作为正典不会被任何机器翻译器改写。中译本只读机读，英译本只读译本；
> 两个版本讲的是同一个故事，用的是同一批锚句。
>
> This chapter is canonical and is not to be rephrased by any machine translator.
> The Chinese is the source of meaning; the English carries the same anchors word-for-word.
`,
    markdownEn: `# 低语诸王 · 世界大典 第一章「潮汐教团的余烬」

> A canonical chapter authored for the world “The Whispers' Kings”. Any entry citing it must
> keep the anchor sentence word-for-word; navigation aside, every use (retrieval, evaluation
> anchors, reader bookmarks) relies on its uniqueness.
> / 作者署名的一章正典。写给 \`低语诸王\` 这一世界的作者与读者：凡引用本章的条目，应保持锚句的逐字一致——锚句用于导航以外的所有用途（检索、评测锚点、读者信手定位）都依赖它的唯一性。

> Era: the Ash Age — after the Grey-Lamp Age, before the Iron-Moon Age.
> 纪元：灰烬纪（The Ash Age）· 位于灰灯纪（The Grey-Lamp Age）之后、铁月纪（The Iron-Moon Age）之前。

---

## I · Kindling

The salt sea has no fish, only the road signs of wrecks. The words William Batten left behind were carved into the lintel of the tide hall by the Tide Conclave: “We do not worship the sea; we worship the words the sea has not finished.”

The day the seventh eclipse fell, the capital surrendered. Every light in the city burned on, as if waiting for a funeral that had already finished. Only the tide door “Listening to the Tide” was still shut, no one from the Conclave had come back through it, and the salt frost on the door grew faster than the mould on the walls.

Nine years later, the Night Watcher found a child she had never seen, crouched at the edge of the tide platform, watching the sea. The child said he was counting waves; when he reached one hundred and nine, he stopped and said: “The sea is missing a sentence today.”

She asked for his road first — as was her habit: not his name, but which memory of a patrol road he could repeat. He couldn't say. Instead he recited the story of the fog-harbour lamp lighters word for word: each night they lit three hundred lamps, waiting for a fleet that never turned home. When he finished, he added that the fleet had not failed to return — it dared not. To turn home meant the eclipse was bound to come again, and the Conclave no longer had the courage to light seven lamps.

The Night Watcher did not press him. She remembered every road she had walked, including the one that does not exist; at its end stands the Moon Bridge, and the Moon Bridge only speaks to the living.

**Anchor sentence**: the fleet dares not turn home, because turning home means the eclipse is coming again.

**锚句**：船队不敢回航，是因为回航意味着日蚀又要来。

---

## II · The Seven Seats

At the close of the Grey-Lamp Age, the Tide Conclave established seven seats: Watching the Tide (chair of the tide platform), Distinguishing the Tide (the tide-listener), Guiding the Tide (the keeper of the tide hall's rules), Keeping the Tide (harbor dues and accounts), Fixing the Tide (prices and grain), Verifying the Tide (assayer of goods), and Welcoming the Tide (overseas contact).

At the dawn of the Iron-Moon Age, a pirate-like negotiator spent ten months hollowing the seven seats into a shell: the Conclave no longer signed its own name, leaving only the words “the sea's unfinished words” as the seal.

What the child called “the last ember of the Tide Conclave” is that shell — a seat that still attends the tide platform on schedule, a room of salt frost, a minutes book missing the record of its forty-first convocation. He could recite every word of the sixth convocation in that book: that night, the Conclave decided it would never wait for the eighth eclipse.

Later someone asked what, exactly, the Conclave had been waiting for. The minutes carry only one very short passage, half sensory grain, half verdict:

> The salt tasted sour — that is the old taste of the seven eclipses. Fingers could not find the line, yet the heart knew it was there on the table.

**Anchor sentence**: at the sixth convocation, the Conclave resolved never to wait for an eighth eclipse.

**锚句**：会册里第六次会议，教团决定不再等日蚀的第八次。

---

## III · The Seven Wells

The salt sea never gives back a blue sky. When the seawater rises, salt frost will grow over the wrecks into the shape of seven wells — each one the relic of a ship-wife who never came home.

The seventh is the largest. The elders of the town avoid it; the children love to play there. One year the children found a bone in the seventh well completely unlike any they had ever seen — the tide had pushed it up, and though it was human, no blade, cloth or talisman was left with it.

The child's parents handed the bone to the Conclave. The Conclave people looked at it for a long time, then said it was not a skeleton but a complete sentence — a sentence the sea had not finished, squeezed into the shape of a person.

From then on, no one threw stones into the seventh well to prove their courage.

**Anchor sentence**: what washed up from the seventh well was not a skeleton but a sentence the sea had not finished, squeezed into the shape of a person.

**锚句**：第七口井里推上来的不是骸骨，是一句海还没说完的话，硬挤成了人形。

---

## IV · The Mirror Eel

Deep in the salt sea lives an eel. They do not swim; they float — floating in the dark light after the eclipse, every scale on their bodies a small mirror. Whoever sees one for the first time at night will, the next day, see reflected the thing they most want to see — no conditions attached.

The Night Watcher never saw a mirror eel herself, but she remembered someone asking her: “What would you want to see reflected?” She thought for a long time, and what came out was not an answer but a sentence:

> The salt sea is in fact one great overturned mirror.

Only later did the Night Watcher learn that everyone who had been asked that question believed they had been asking for directions.

**Anchor sentence**: the salt sea is in fact one great overturned mirror.

**锚句**：盐海其实是一片打翻的镜子。

---

## V · The Seven Things of the Tide Platform

Seven words about the tide platform circulate among the Conclave's embers; each is bound to one rule:

1. The tide hall is never renovated. Old salt frost cannot be washed, only patched.
2. The seven wells answer when asked, but no one owes an answer.
3. Do not light the fourth lamp. The fog-harbour lighters light three hundred; one fewer does not count.
4. Do not wait for the eighth eclipse. This is not superstition; it is a decision recorded in the minutes.
5. Do not turn home. Those who must return will return on their own.
6. Do not collect bones. To collect bones is to declare that someone will not return.
7. Do not speak for the sea.

The child recited the fourth, then added: the minutes also say the eighth eclipse will never come — because the seventh eclipse was the Conclave's own doing.

This was never corroborated. It is left for the ages to argue; the Night Watcher entered it into her patrol road.

**Anchor sentence**: there will be no eighth eclipse — because the seventh eclipse was the Conclave’s own doing.

**锚句**：第八次日蚀不会来——因为第七次日蚀是教团自己制造的。

---

## VI · The Letter to the Iron-Moon Age

The last ember of the Tide Conclave never wrote down a complete ending. They left only one letter, pinned to the tide hall; the addressee was the Iron-Moon Age.

It said: We do not judge how you live the days to come, nor do we bless you not to sink when you pass the salt sea; we promise only this — when you look up and see the Moon Bridge speaking, what it says is bound to be the sentence your grandfathers and their own generation said, yet never believed:

> The sentence the sea has not finished must be finished by the living.

When the child finished hearing it, he threw everything he owned into the tide platform. He told the Night Watcher: “What the Conclave taught me about the tide was never meant for those who would change their minds.”

Some time later, the tide platform gained one thing more: every morning a seagull stood at the edge of the seventh well, and would not fly, until every grain of salt frost had remembered the year's wind.

**Anchor sentence**: the sentence the sea has not finished must be finished by the living.

**锚句**：海还没说完的话，要由活人来收尾。

---

## VII · This Chapter's Shadow in the Model

(For the world's authors: the mapping between this chapter and the world nodes, so it can be landed in the \`低语诸王\` project as-is.)

| Kind | Title | Where |
|---|---|---|
| lore | The Last Ember of the Tide Conclave | II, V, VI |
| geography | Tide Platform · the Seven Wells | III |
| characters | The Night Watcher | all (memory echo: the salt tastes sour — that is the old taste of the seven eclipses) |
| creatures | The Mirror Eel | IV |
| items | Volume Six of the Minutes | II (digest: the resolution of the sixth convocation) |
| quests | The Forty-First Convocation | to follow (Chapter II) |
| story | The Last Ember of the Tide Conclave | the whole chapter, canonical |
| factions | The Tide Hall | I, II |
| history | The Seventh Eclipse · the Surrender of the Capital | I |

> This chapter is canonical and is not to be rephrased by any machine translator.
> The Chinese is the source of meaning; the English carries the same anchors word-for-word.
>
> 本章作为正典不会被任何机器翻译器改写。中译本只读机读，英译本只读译本；
> 两个版本讲的是同一个故事，用的是同一批锚句。
`,
  },
  {
    order: 2,
    slug: '002-the-forty-first-convocation',
    titleZh: '潮汐教团的第四十一次会议',
    titleEn: 'The Forty-First Convocation',
    eraLineZh: '纪元：灰烬纪末 · 铁月纪前夜。',
    eraLineEn: 'Era: the tail of the Ash Age, the eve of the Iron-Moon Age.',
    markdownZh: `# 低语诸王 / The Whispers' Kings · World Bible · Chapter II: The Forty-First Convocation

> 低语诸王正典第二章。接续第一章「潮汐教团的余烬」之谜题：会册里少了第四十一次会议的记录。
> 本章是第一章里"教团没有再点七次灯的胆子"的下文。
> 正典纪律同上章：锚句中英字字对齐，不经任何改写；任何引用本章的条目保持它原样。
>
> This is the second canonical chapter, answering the question chapter 1 left open —
> the missing minutes of the forty-first convocation. Canon discipline is unchanged:
> anchor sentences match word-for-word across languages; no rephrasing, no machine pass.

> 纪元：灰烬纪末 · 铁月纪前夜。
> Era: the tail of the Ash Age, the eve of the Iron-Moon Age.

---

## 一 · 名单上的空格

潮汐室里所有的名字都用盐砂书写——因为盐会融化，名字就不长久。只有教务册和会册是用石墨刻的，石墨不融化，也抹不掉。

第四十一次会议的名单上有一个空格。在七席的位置上，谁都有一个座位，谁都有一块刻过的石板；只有那个字位空着——不是被磨掉，是从来没有雕。

会册第六卷的封面印章是潮汐教团的标志：一个半月，一个波浪，一根灯芯。印章底下有一行很小很小的字，没人说得出它的来历。有人说它是灰灯纪最后一个执笔人写的临别。有人说它是海写的，石墨拒绝再刻，所以字只能是那个人临摹下来的。

守夜人被调进潮汐室的那天晚上，盐砂下得正大。她把手伸进灯里取了光，照书页时发现那行小字变了：它变成了一句完整的话——

> 第四十一次会议是海开的，不是人开的。

**锚句**：第四十一次会议是海开的，不是人开的。

**Anchor sentence**: the forty-first convocation was held by the sea, not by men.

---

## 二 · 第四十一页

会册没有第四十一页，但潮汐室的地砖下有第四十一页——板面上凿着一句：

> 海说：不要再记这本账了。它再也还不清了。

这不是人的话。人不会写"它再也还不清了"这种话——欠账的是人，海不会替人写结论。教团内部传阅过几种读法：第一种说这是某一席的临终自白；第二种说这是海真正的声音；第三种最简单，说整本会册本来就是当年七个人互相交代一件不能互相交代的事的纪实。

守夜人把板面拓下来，缝在巡逻路里。她没问任何人——照守夜人的习惯，说的话没人问完之前，都不能算数。

后来，公告栏上多了一个贴条："从今往后，这段巡逻路不用了。它没人走，也没人记得住。"

**锚句**：海说：不要再记这本账了，它再也还不清了。

**Anchor sentence**: the sea said: stop keeping this ledger, it will never balance.

---

## 三 · 镜碎了

守夜人第三次在第七口井附近迷路时，机关已经松动——多年没有人改过井边石刻，门闩是松着的。她故意推开井盖，循着石壁滑下去。

井底不湿。井底是干的，像某种多年没人接近的骨灰盒。正中央放着一面镜子，镜面上覆着盐霜，镜框是淡灰色的灯焰形状。这镜子不是人放的；镜框的边缘已经长成了石头，像井本来就是把镜子给放进去的。

守夜人看见自己了。她没动，但镜子里的她眨了两次眼——她没有。

镜子碎了一瞬间，没有响声。碎成几百片落在井底，每一片都叫一个不同的名字。她听见一个名字像她、却比她更久远的某个女人用很老很老的气音叫出了几个字：

> 记住的第七条灯芯没有熄灭。

**锚句**：记住的第七条灯芯没有熄灭。

**Anchor sentence**: the seventh wick of memory never went out.

---

## 四 · 守夜人的回信

她没有把这些告诉任何人。她只做了一件她唯一该做的事：沿着巡逻路走了一趟，这条路里有好几段是她不知道的。

走到盐海的尽头，她看见月亮桥站在海面中间。桥上没人，桥身灰得要融进海水里——月亮桥的材质从来都不是木头或石头，是什么别的东西。守夜人照惯例轻声说："月亮桥。"

桥答了她。

桥答了她说："你叫我的名字。"——这不是守夜人问的话，但桥第一次自己先说话。桥说："海让我去守夜人门口等你。它说，有人总会跟着它来。"

守夜人在桥头站了很久，接着回家，把所有的石板全部搬回了潮汐室。她把拓好的第四十一页缝回了会册第六卷的封面背面，让封面不再是封面——是整本会册里唯一没有被人补刻过的一页。

她在扉页写了一个很小的字："还没写完。"

**锚句**：海让月亮桥去守夜人门口等她。

**Anchor sentence**: the sea asked the Moon Bridge to wait at the Night Watcher's door.

---

## 五 · 会册的背面

潮汐室从此多了一道锁：任何时候，只有那块空着的席位还能打开会册的门。钥匙挂在潮汐室的门上，所有人都能摸得到，没人会去拿。

铁月纪的第一批遗址考据到这里时，带回了一张潮汐室的平面图。图上画着七席、四口（另外三口井已经被风沙掩埋）、一道门、一把从来没人带走的钥匙。图纸的背面还有一行文字，没人看得出它写在哪一年：

> 会册从来不是会的。海是账的债主。

这行字是铁月纪最完整的一句话。它不需要解释——每一个没被海要过债的人都能读懂它。

**锚句**：会册从来不是会的，海是账的债主。

**Anchor sentence**: the minutes were never the conclave's; the sea is the creditor.

---

## 六 · 铁月纪的第一个冬天（卷三引线）

铁月纪的第一批幸存者活过了第一个冬天，并开始互相交换一个不见于会册的印象：

> 每一种海风都有一个缺口——第七次日蚀之后的每一阵风，都把尘土吹向同一块地界。白天看不见的那块地界，晚上会发光。

他们叫那块地界"潮沙盘"。它不在图上。没有人知道潮沙盘下面是不是还有第八个人——也没有人敢去挖。

孩子告诉守夜人：他会在那个沙盘上去找一扇门。不是去开门，是去问它——是不是有人可以不去寄那封信。

守夜人没拦他，也没鼓励他。她只记得她父亲留下的一句话——"守夜人的职责不是阻止任何人开门，是记住门关上之前最后一眼看见的东西"。

**锚句**：每一种海风都有一个缺口，第七次日蚀之后的每一阵风，都把尘土吹向同一块地界。
**Anchor sentence**: every sea-wind has a gap — since the seventh eclipse every wind has blown dust to the same patch of ground.

---

## 七 · 模型映射（本章对应关系）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | 第四十一次会议 | 一、二 |
| geography | 汐台 · 潮汐室 · 月亮桥 · 潮沙盘（铁月纪引线） | 一、四、六 |
| factions | 潮汐教团 · 七席 | 一、五 |
| characters | 守夜人 · 孩子 | 三、四、六 |
| items | 会册第六卷（背面） · 拓本 | 二、三 |
| story | 潮汐教团的第四十一次会议 | 全篇 |
| quests | 找到潮沙盘 · 那扇门 | 六（卷三引线） |

> 本章与第一章锚句共同构成低语诸王大典的两扇门：
> 第一扇问"海叫什么"，第二扇问"谁在还"。
> 下一章，轮到铁月纪答。
>
> Together these two chapters are the twin doors of the Whispers' Kings bible:
> the first asks what the sea is called; the second asks who pays.
> The Iron-Moon Age answers next.
`,
    markdownEn: `# 低语诸王 · 世界大典 第二章「潮汐教团的第四十一次会议」

> This is the second canonical chapter, answering the question chapter 1 left open —
> the missing minutes of the forty-first convocation. Canon discipline is unchanged:
> anchor sentences match word-for-word across languages; no rephrasing, no machine pass.
>
> 低语诸王正典第二章。接续第一章「潮汐教团的余烬」之谜题：会册里少了第四十一次会议的记录。本章是第一章里"教团没有再点七次灯的胆子"的下文。正典纪律同上章：锚句中英字字对齐，不经任何改写；任何引用本章的条目保持它原样。

> Era: the tail of the Ash Age, the eve of the Iron-Moon Age.
> 纪元：灰烬纪末 · 铁月纪前夜。

---

## I · The Blank on the Roster

Every name in the tide hall is written in salt sand — salt dissolves, so no name lasts. Only the registry of duties and the minutes are carved in graphite; graphite does not melt and cannot be rubbed out.

On the roster for the forty-first convocation there is one blank. Every one of the seven seats has a chair, every one its carved slate; only that one position was left empty — not ground off, never carved at all.

The seal on the cover of Volume Six of the minutes is the Conclave's emblem: a half-moon, a wave, a lamp wick. Under the seal runs a line of the smallest text, which no one could attribute. Some said it was the parting words of the last clerk of the Grey-Lamp Age. Some said the sea had written it, that graphite had refused to carve any further, and the letters were all that person could copy.

The night the Night Watcher was transferred into the tide hall, the salt sand fell hard. She held her hands into the lamp, took its light, and when she bent it onto the page she found the little line had changed: it had become one complete sentence —

> The forty-first convocation was held by the sea, not by men.

**Anchor sentence**: the forty-first convocation was held by the sea, not by men.

**锚句**：第四十一次会议是海开的，不是人开的。

---

## II · The Forty-First Page

The minutes have no forty-first page, but under the tiles of the tide hall there is a forty-first page — cut into the slab:

> The sea said: stop keeping this ledger, it will never balance.

No one's words. A man would not write "it will never balance" — the debtor is a man; the sea does not render verdicts for men. Several readings circulated: that it was the dying confession of one seat; that it was the sea's true voice; that simplest of readings — the whole minutes were no more than the record of seven people entrusting one another with a thing not meant to be entrusted.

The Night Watcher took a rubbing of the slab and sewed it into her patrol road. She asked no one; as was the Night Watcher's habit, nothing anyone said counted until it was finished being said.

Some time later a slip appeared on the notice board: "from now on, this stretch of patrol road is retired. It had no walkers, and no one could remember it."

**Anchor sentence**: the sea said: stop keeping this ledger, it will never balance.

**锚句**：海说：不要再记这本账了，它再也还不清了。

---

## III · The Mirror Breaks

The third time the Night Watcher lost her way around the seventh well, the mechanism was already loose — no one had touched the stone carving by the well in years, the latch sat slack. She deliberately pushed open the well cover and slid down along the wall.

The bottom was not wet. It was dry, like some bone-box no one had approached for years. In the exact centre sat a mirror, its face filmed with salt frost, its frame a pale-gray lamp-flame shape. It had not been placed there by people; the rim of the frame had grown into the stone, as if the well had been purpose-built to set the mirror into it.

The Night Watcher saw herself. She did not move, yet the woman in the mirror blinked twice — she had not.

The mirror broke in the space of a heartbeat, and made no sound. Hundreds of shards fell into the well bottom, and each shard called a different name. She heard one that sounded like her — only far older, far more patient — a woman with a breath like rust, saying:

> The seventh wick of memory never went out.

**Anchor sentence**: the seventh wick of memory never went out.

**锚句**：记住的第七条灯芯没有熄灭。

---

## IV · The Night Watcher's Reply

She told no one. She did one thing only, the one she should have done: she walked the patrol road one more time — and the road had stretches she had never known.

At the far end of the salt sea she saw the Moon Bridge standing in the middle of the water. No one was on it; the bridge had gone the color of the water itself, about to dissolve. The bridge's materials were never wood or stone, but something else. The Night Watcher said, by habit, softly: "Moon Bridge."

The bridge answered her.

It said: "You called my name." Not the sentence the Night Watcher had been going to ask, but the first time the bridge had ever spoken first. It said: "The sea asked me to wait at the Night Watcher's door. It said someone would follow it there."

The Night Watcher stood on the bridgehead for a long time, then went home and carried every slab back to the tide hall. She sewed the rubbing of the forty-first page to the back of Volume Six's cover — so the cover was no longer a cover — only the one page in the whole book no one had ever carved over again.

On the flyleaf she wrote one very small word: "unfinished."

**Anchor sentence**: the sea asked the Moon Bridge to wait at the Night Watcher's door.

**锚句**：海让月亮桥去守夜人门口等她。

---

## V · The Back of the Minutes

From then on the tide hall gained one more lock: at any time, only that empty seat could open its door. The key hangs on the hall's door, where anyone can reach it — no one ever does.

The first ruins survey in the Iron-Moon Age came back with a floor plan of the tide hall: seven seats, four wells (the other three were buried by wind and sand long ago), one door, and a key never lifted from its nail. On the back of the floor plan ran a line no one could date:

> The minutes were never the conclave's; the sea is the creditor.

That line is the most complete sentence the Iron-Moon Age owns. It needs no annotation — every person the sea has not yet collected from can read it.

**Anchor sentence**: the minutes were never the conclave's; the sea is the creditor.

**锚句**：会册从来不是会的，海是账的债主。

---

## VI · The First Winter of the Iron-Moon Age (hook for Chapter III)

The first Iron-Moon survivors lasted the first winter, and began to trade, among themselves, one impression that appears nowhere in the minutes:

> Every sea-wind has a gap — since the seventh eclipse every wind has blown dust to the same patch of ground. The patch is invisible by day; at night it glows.

They named the patch the tide-sand table. It is on no map. No one knows whether under the tide-sand table lies an eighth person — and no one dares dig.

The child told the Night Watcher: he would go to that table and look for a door. Not to push it open — to ask whether anyone may choose not to send the letter.

The Night Watcher neither stopped him nor encouraged him. She only kept her father's words — “the Night Watcher's duty is not to stop anyone opening a door; it is to remember the last thing seen before the door closed.”

**Anchor sentence**: every sea-wind has a gap — since the seventh eclipse every wind has blown dust to the same patch of ground.

**锚句**：每一种海风都有一个缺口，第七次日蚀之后的每一阵风，都把尘土吹向同一块地界。

---

## VII · This Chapter's Shadow in the Model

| Kind | Title | Where |
|---|---|---|
| lore | The Forty-First Convocation | I, II |
| geography | Tide Platform · the Tide Hall · the Moon Bridge · the tide-sand table (hook for Chapter III) | I, IV, VI |
| factions | The Tide Conclave · the Seven Seats | I, V |
| characters | The Night Watcher · the child | III, IV, VI |
| items | Volume Six of the Minutes (back) · rubbing | II, III |
| story | The Forty-First Convocation | the whole chapter, canonical |
| quests | Find the tide-sand table · the door | VI (hook for Chapter III) |

> Together these two chapters are the twin doors of the Whispers' Kings bible:
> the first asks what the sea is called; the second asks who pays.
> The Iron-Moon Age answers next.
>
> 本章与第一章锚句共同构成低语诸王大典的两扇门：
> 第一扇问"海叫什么"，第二扇问"谁在还"。
> 下一章，轮到铁月纪答。
`,
  },
  {
    order: 3,
    slug: '003-the-tide-sand-table',
    titleZh: '潮汐教团的潮沙盘',
    titleEn: 'The Tide-Sand Table',
    eraLineZh: '纪元：铁月纪 · 第一个冬天结束之后。',
    eraLineEn: 'Era: the Iron-Moon Age — after the close of the first winter.',
    markdownZh: `# 低语诸王 / The Whispers' Kings · World Bible · Chapter III: The Tide-Sand Table

> 低语诸王正典第三章。第二章在铁月纪幸存者的口中留下一块地——尘沙吹向同一块地界，
> 夜里会发光。本章接着它走：谁寄了信、谁该收尾、收完以后铁月纪还有没有风。
> 正典纪律不变：锚句中英字字对齐，引用者逐字保持；任何一字不改。
>
> This is the third canonical chapter. Chapter II left behind the patch of ground the survivors whispered about —
> a dust-born light no map ever held. This chapter follows it: who carried the letter, who closed the ledger,
> and what remains of the Iron-Moon wind once the ending is done. Canon discipline is unchanged:
> anchor sentences match word-for-word across languages; no rephrasing, no machine pass.

> 纪元：铁月纪 · 第一个冬天结束之后。
> Era: the Iron-Moon Age — after the close of the first winter.

---

## 一 · 听见风的骨头

铁月纪的第一个冬天过去了。幸存者沿着废墟一点一点往回走，身上没有一张图——第七次日蚀之后，潮沙盘的方向一直在移动；旧图说它在荒原三日之外，灰烬纪的新风说，它就在白天看不见的那块地界里。

送信人跟着最后一批人出发时，怀里把那封铁月纪遗信贴得很紧——油纸、盐封，封签从没裂过。沿路几乎每个人都劝他把它烧了：烧掉它，往后做个好好的铁月纪人。送信人只摇头。他不会再背任何别人塞给他的话。

他第一个看见潮沙盘的那一晚，风忽然站住了。

荒原没有边，只有一片黑金色的光，像一口倒扣在地平线上的锅盖。它方圆不到一箭之地，表面是玻璃——不是玻璃，是第七次日蚀时落下的雷把尘沙直接熔成的一张桌面。满大荒的尘土、黄沙、灰烬，最后都被风推回这口锅盖上。从灰灯纪末到灰烬纪再到铁月纪，几十年的尘土都在上面，却没有一粒被踏过。

百步之外，他闻到一种极远的盐味——酸的，和巡逻路里那一口"盐味酸了"的东西一样，不是海盐。是另一种会随记忆变质的盐。

**锚句**：潮沙盘上没有路，只有一个还没被回答的问句。

**Anchor sentence**: on the tide-sand table there is no road, only one unanswered question.

---

## 二 · 门问

送信人在锅盖近旁放出第一晚的篝火时，门就出现了——它本来就在那里。

锅盖中央立着一扇门，单独一扇石框，淡灰、近白，和第七口井深处的镜框同一种颜色。石框里面没有门——只有灰。不是风沙，也不是空白，是一面摇曳的灰色海：浪从四面八方推进石框，又从四面八方退回去，却从来不跑进荒原。

浪的另一头，月亮桥亮得极淡，纤细得能穿过的礁石缝隙都看不见。桥的尽头没有岸。

他伸出手去摸石框。门没有声音，却在耳骨后面响了：

**锚句**：门问：你以为你欠我什么，还是你以为我欠你？

**Anchor sentence**: the door asked: do you think you owe me, or do you think I owe you?

送信人站在篝火里，先是笑，后来沉默了很久。他想过很多读法——欠的是盐钱，欠的是船，欠的是把雾港灯人的第四盏灯点出来，欠的是替教团再点七次灯……可走出潮沙盘之前，他脑子里最清楚的那一句对白其实从来没被自己说出来过。

他终于说出口的时候，稳稳的：

**锚句**：我欠你一句海还没说完的话。

**Anchor sentence**: I owe you a sentence the sea has not finished.

---

## 三 · 桥上的女人

石框问了第二个问题——不是问话，是出价。

**海要收尾**，那就留下；**他要把话带回去**，那就把门关上。它不要他献祭什么。门从没说过"留下来"是什么意思，也没有给它报个价。

送信人没有回答。他只是把手掌按在石框上——也没想清楚要做什么。手没入了石面，像伸进了温水。石框以内的灰色海一下子开阔了，浪头推翻石框上沿，露出了一整片夜空那样宽阔的水面。

月亮桥上走过来一个身影。

走得不快，也不慢。灰油布大衣，白得发黑；头发上全是盐，一抖都不会再掉下去。那不是教团里任何一个席位的样子。那个人的步伐很怪：每一步，桥面上的石板都会往后挪一格；每一步，石板后面都会有一点淡掉，像桥在从脚下慢慢退回海面。

守夜人在远处的瞭望塔上，用她看尽潮汐的老眼睛盯住了两个点：她认识的、一生没走近过的那个身影；和孩子。
她没有嘶喊，没有动手。这是她父亲留给她的唯一一句话：

> 守夜人的职责不是阻止任何人开门，是记住门关上之前最后一眼看见的东西。

**锚句**：门关上之前，守夜人看见月亮桥上有一个人站着。

**Anchor sentence**: before the door closed, the Night Watcher saw someone standing on the Moon Bridge.

---

## 四 · 一封一无所有的信

送信人在潮沙盘边过了一个夜晚。

篝火烧到了脚踝那么高，他才意识到自己一夜没怎么眨眼。夜很深的时候，怀里的遗信——第三天以来第一次——像一个熟透的果子塌软下来。他取出来，解开盐封。

纸是空白的。

不是因为字迹被海泡没了，也不是因为被火舔过。是因为从第七次日蚀那一晚起，那句话从来就没写下来过。教团余烬只是贴了一张宣布：接收者会自己到场，并自己说出那句话。

送信人按住了自己的嘴唇。

他不知道下一秒钟会不会来。石框里的浪一次退比一次急，月亮桥停在了远处——桥上的身影也停住了：两条腿悬在桥面之上的空气里，没有再往前、也没有回头。

他跪了下去。他不知道自己是不是该跪；也不知道自己下一秒还想不想活在有风的海边。他想起巡逻路里那句"盐味酸了——那是七日蚀的老味道"，慢慢把气呼出来，像很久以前蹲在汐台边上数浪的那个孩子。

> 我们还欠着你。

**锚句**：纸没有字——那一句，从来就没有写下来过。

**Anchor sentence**: the paper had no words — that sentence was never written down.

轰然而静。盐海安静了，第七口井深处的那面镜子，从此再没能回映出任何人的脸。

**锚句**：海借他的喉咙说：我们还欠着你。

**Anchor sentence**: the sea borrowed his throat and said: we still owe you.

---

## 五 · 灯芯

潮沙盘的表面从此彻底暗了下来。

铁月纪的幸存者在秋里同来，在锅盖的中央发现了一件新东西：一块半人高的石，柱状，无字。石的切面上嵌着一根灯芯——同雾港灯里那种一样，一根干掉的棉絮芯。没油、没火、没火苗；而围在它周围褐色玻璃里的尘土，不知何时烧成了一枚小小的碗。

他们回来时只带走了一个说法：

> 灯没点。但没有人再敢说，那里什么都没有。

孩子没再回去。盘边少了一夜的篝火，多了一串不属于任何人的足迹。他没说再见，也没能说出。灰色的海没有再露过一眼。

守夜人后来把这段记在巡逻路最后一页：

> 雨落下来，尘土不出声了。他站在石后面，看着我的方向，却没有朝我说再见的样子。

雾港灯人每年只点三百盏；七口井深处的镜子也只碎过一次。世界上的账快清完了——剩下的账还压在七口井边，压在潮汐室里，压在巡逻路的最后一页里。

**锚句**：第八盏灯还没有人点，但有人记得它的位置。

**Anchor sentence**: the eighth lamp has not been lit, but someone remembered where it stood.

---

## 六 · 还完之后（卷四引线）

铁月纪第一、第二冬都过去了。潮沙盘少了光亮，铁月纪却多了一种昼长夜短的生物习性：人们知道了海会关门、会等人，就不再把自己的船开进没有灯的海湾。

送信人没有回来，雾港的灯却开始缺一盏。缺少的那一盏，本来应该点在哪一座塔？

孩子留下的那根灯芯没有在潮沙盘石上熄灭，也没有点亮。它只是躺在那里，像一句话的拔脚——记忆还在，字已经没有了。铁月纪的代代船王开始在航海之前把灯芯带上：不是为了点它，是为了记住有七盏灯熄在哪里，还有一盏永远不用再等。

铁月纪第二冬，一枚商队的印章被卖到了海盗集市上：一个半月、一个波浪、一根灯芯。印章背面刻着一句——所有人都以为它是一句古老的问候：

> 它见过灯点起来的时候吗？

没有答案。那是本章最无法答的一句问话，也是卷四的线头。

---

## 七 · 模型映射（本章对应关系）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | 潮沙盘的问句 · 收尾 · 遗信 | 一、二、四 |
| geography | 潮沙盘（黑金色玻璃原野）· 月亮桥 · 潮沙盘石灯 | 一、三、五 |
| factions | 教团余烬 · 铁月纪幸存者 · 铁月纪船王 | 一、六 |
| characters | 送信人（孩子长大）· 桥上人（无名）· 守夜人 | 二、三、五 |
| items | 铁月纪遗信 · 盐封 · 灯芯（第八盏） | 一、四、五 |
| story | 潮汐教团的潮沙盘 | 全篇 |
| quests | 收尾 · 第八盏灯 | 六（卷四引线） |
| history | 铁月纪第一冬 · 遗信抵达 · 铁月纪船王航线 | 一、六 |

> 大典的三扇门，第一扇问"海叫什么"，第二扇问"谁在还"，第三扇问"还完之后怎么办"。
> 卷四的灯，将由下一个去到潮沙盘的人决定点不点。
>
> The bible has three doors: the first asks what the sea is called;
> the second asks who pays; the third asks what happens once the ledger closes.
> The fourth chapter's lamp waits on whoever walks to the tide-sand table next.
`,
    markdownEn: `# 低语诸王 · 世界大典 第三章「潮汐教团的潮沙盘」

> This is the third canonical chapter. Chapter II left behind the patch of ground the survivors whispered about —
> a dust-born light no map ever held. This chapter follows it: who carried the letter, who closed the ledger,
> and what remains of the Iron-Moon wind once the ending is done. Canon discipline is unchanged:
> anchor sentences match word-for-word across languages; no rephrasing, no machine pass.
>
> 低语诸王正典第三章。第二章在铁月纪幸存者的口中留下一块地——尘沙吹向同一块地界，夜里会发光。本章接着它走：谁寄了信、谁该收尾、收完以后铁月纪还有没有风。正典纪律不变：锚句中英字字对齐，引用者逐字保持；任何一字不改。

> Era: the Iron-Moon Age — after the close of the first winter.
> 纪元：铁月纪 · 第一个冬天结束之后。

---

## I · The Bones of the Wind

The first winter of the Iron-Moon Age had passed. The survivors walked back along the ruins, step by step, and not one of them had a map — since the seventh eclipse the tide-sand table's direction had been drifting; the old charts said it lay three days beyond the waste, while the new wind of the Ash Age said it hid in the patch of ground you cannot see by day.

When the letter-bearer left with the last party, he pressed the Iron-Moon letter close to his chest — oiled paper, sealed with salt; the seal had not cracked once. Almost everyone along the way urged him to burn it: burn the letter, then go be an ordinary Iron-Moon person. The letter-bearer only shook his head. He would no longer hold words anyone else threaded onto his back.

The first night he saw the tide-sand table, the wind stopped.

The waste has no edge — only a sheet of black-gold light, like a wok lid turned over on the skyline. It spans less than one li across, its surface a glass — not glass but a plaque the lightning of the seventh eclipse melted straight from the dust. Every particle of dust, ash and sand in the great waste had been pushed by the wind onto this lid; decades of dust had accumulated — Ash Age, Iron-Moon Age — and not a grain of it had been stepped on.

A hundred paces out, he smelled a very distant salt — sour, the same one the patrol road remembered as “the salt tastes sour”, not sea salt. Another kind of salt, a salt that sours as memories turn.

**Anchor sentence**: on the tide-sand table there is no road, only one unanswered question.

**锚句**：潮沙盘上没有路，只有一个还没被回答的问句。

---

## II · The Question the Door Asks

The letter-bearer lit the first night's camp near the table, and the door was there — it had always been there.

At the centre of the lid stood a doorway: a lean stone frame, pale grey to near white, the same grey as the mirror frame at the bottom of the seventh well. It was only a frame — no door — filled with grey. Not dust and not blank; a rocking grey sea: waves pressing toward the frame from every side, then drawing back from every side, yet never once running into the waste.

Beyond the waves, the Moon Bridge shone very, very faint, slender enough to disappear into a crack in the reef. Its far end had no shore.

He reached out and touched the frame. The door made no sound, but it rang behind the bone in his ear:

**Anchor sentence**: the door asked: do you think you owe me, or do you think I owe you?

**锚句**：门问：你以为你欠我什么，还是你以为我欠你？

The letter-bearer stood in the firelight — first he laughed, then he fell silent from very deep down. He had imagined every reading — debt for salt, debt for ships, debt for lighting the lighthouse's fourth lamp, debt for lighting seven lights for the Conclave again — but before he could say anything the plainest thought in his head had never once been said out loud.

When he finally said it, it came out steady:

**Anchor sentence**: I owe you a sentence the sea has not finished.

**锚句**：我欠你一句海还没说完的话。

---

## III · The Woman on the Bridge

The frame asked one more thing — not a question but a bid.

**If the sea was to close the book, he stayed; if he was to carry the words back, he pushed the door shut.** It asked nothing to be offered as tribute. It never said what staying meant, nor did it name a price.

The letter-bearer did not answer. He only laid his palm on the frame — he hadn't decided what to do. His hand passed into the stone as though into warm water. Inside the frame the grey sea suddenly opened, the wave-crests cresting the frame's top, revealing a sheet of pale water as vast as night.

A figure came across the Moon Bridge.

Not fast, not slow. A grey oilskin coat, white gone black; her hair was all salt — shaking it would not shed a grain. Not one of the seats of the Conclave. Her gait was strange: each step, the slate underfoot shifted one plank; each step, a little of the plank behind her faded — as if the bridge were slowly sinking back into the sea under her feet.

Far away, in the watchtower, the Night Watcher kept her eyes trained on the two points she had spent her life learning to count: a shape she had long recognized without ever having come close to it; and the child.
She said nothing, and she did not move. This was the one sentence her father left her —

> The Night Watcher's duty is not to stop anyone opening a door; it is to remember the last thing seen before the door closed.

**Anchor sentence**: before the door closed, the Night Watcher saw someone standing on the Moon Bridge.

**锚句**：门关上之前，守夜人看见月亮桥上有一个人站着。

---

## IV · A Letter That Contains Nothing

The letter-bearer spent one night beside the tide-sand table.

The camp fire had burned down to ankle height before he realized he had not blinked at all. Deep in the night, the Iron-Moon letter lying over his heart — for the first time since he had set out — sagged like a fruit going to seed. He unbound the salt-sealed paper.

The paper was blank.

Not because the sea had soaked the writing away, nor because fire had licked it. Because from the night of the seventh eclipse, that sentence had never been set down. The last ember of the Conclave only pinned up a notice: the receiver would come of their own accord, and of their own accord speak the sentence.

The letter-bearer pressed his hands against his lips.

He had no idea whether the next second would come. The waves inside the frame drew back faster and faster; the Moon Bridge stood very still — the figure standing on it, too, stopped: one leg hung in the air above the deck, unmoving forward, unturning back.

He closed his hands and called up the words his patrol road knew — "the salt tasted sour — that is the old taste of the seven eclipses." Slowly he let the breath out, steady as a child once crouched by the tide platform counting waves:

> We still owe you.

**Anchor sentence**: the paper had no words — that sentence was never written down.

**锚句**：纸没有字——那一句，从来就没有写下来过。

A crash, then hush. The sea went quiet. The mirror at the bottom of the seventh well never showed another face again.

**Anchor sentence**: the sea borrowed his throat and said: we still owe you.

**锚句**：海借他的喉咙说：我们还欠着你。

---

## V · The Wick

From that day on, the surface of the tide-sand table stayed dark.

That autumn, the Iron-Moon survivors came to the spot again, and found at the centre of the lid one new thing: a stone waist-high, without a word on it. Set into its cut face was a wick — the same kind the fog-harbour lighthouse used, a twist of dried cotton. Not oil, not fire, no flame; yet the dust around it had, at some unknown time, been fused into a small shallow bowl.

They left with one sentence only:

> The lamp is not lit. But no one dares say anymore that there is nothing there.

The child never went back. A night of campfire was missing from the table's edge — as was the footprint of anyone who would come again. He said nothing before leaving, nor could he. The grey sea never showed itself again.

The Night Watcher put this to the last page of her patrol road:

> Rain came down, and the dust made no sound. He stood behind the stone and looked in my direction — with no expression that said goodbye.

The fog-harbour lighthouse never kindles more than three hundred lamps; the mirror in the seventh well broke only once. The books of the world are nearly all settled now — what remains weighs on the seventh well, in the tide hall, on the last page of the patrol road.

**Anchor sentence**: the eighth lamp has not been lit, but someone remembered where it stood.

**锚句**：第八盏灯还没有人点，但有人记得它的位置。

---

## VI · After the Ending (hook for Chapter IV)

The first and second winters of the Iron-Moon Age both passed. The tide-sand table no longer glowed, yet the Iron-Moon Age gained one new habit for ordering its days and nights: once people knew that the sea would close its door, and would wait for a person, they never again set their ships into a harbour without a light.

The letter-bearer never returned, yet the fog-harbour lighthouse began from then on to lack one lamp. Which tower was meant to carry the missing light?

The wick the child left behind neither died on the stone at the table nor burned. It only lay there, like the severed stem of a sentence — memory still lived; the words were already gone. From generation to generation, Iron-Moon ship kings began to tie the wick to their charters before they set sail — not to light it, but to remember where seven lamps went out, and that one more never needed to wait again.

In the second winter of the Iron-Moon Age, a merchant caravan's seal was put up at the pirate market: a half-moon, a wave, a lamp wick. On the back of the seal was carved a line — everyone assumed it was an old greeting:

> Did it ever see the lamps lit?

No answer. That is the one question this chapter cannot answer, and the thread of Chapter IV.

---

## VII · This Chapter's Shadow in the Model

| Kind | Title | Where |
|---|---|---|
| lore | The question in the tide-sand table · closing the ledger · the letter | I, II, IV |
| geography | The tide-sand table (black-gold glass waste) · the Moon Bridge · the stone-lamp in the tide-sand table | I, III, V |
| factions | The last ember of the Conclave · the Iron-Moon survivors · the Iron-Moon ship kings | I, VI |
| characters | The letter-bearer (the child, grown) · the figure on the bridge (nameless) · the Night Watcher | II, III, V |
| items | The Iron-Moon letter · its salt seal · the wick (the eighth lamp) | I, IV, V |
| story | The Tide-Sand Table | the whole chapter, canonical |
| quests | Closing the ledger · the eighth lamp | VI (hook for Chapter IV) |
| history | The first winter of the Iron-Moon Age · the arrival of the letter · the routes of the Iron-Moon ship kings | I, VI |

> The bible has three doors: the first asks what the sea is called;
> the second asks who pays; the third asks what happens once the ledger closes.
> The fourth chapter's lamp waits on whoever walks to the tide-sand table next.
>
> 大典的三扇门，第一扇问"海叫什么"，第二扇问"谁在还"，第三扇问"还完之后怎么办"。
> 卷四的灯，将由下一个去到潮沙盘的人决定点不点。
`,
  },
  {
    order: 4,
    slug: '004-the-eighth-lamp',
    titleZh: '第八盏灯',
    titleEn: 'The Eighth Lamp',
    eraLineZh: '纪元：铁月纪 · 春融之后。',
    eraLineEn: 'Era: the Iron-Moon Age — after the thaw.',
    markdownZh: `# 低语诸王 / The Whispers' Kings · World Bible · Chapter IV: The Eighth Lamp

> 低语诸王正典第四章·终卷。第三章留下了一根没点的灯芯、一行没人敢回答的问话、
> 以及一个不曾离开桌边的身影。本章兑现它们：灯终于亮回来了。
> 本章之后，大典的四扇门全部关闭，正典由此暂告完结——续写权留给每一位到潮沙盘读过的人。
> 正典纪律不变：锚句中英字字对齐，引用者逐字保持。
>
> This is the fourth canonical chapter — the final volume. Chapter III left behind an unlit wick,
> a question no one dared answer, and a figure who never left the table's edge.
> This chapter settles them: the lamp is lit, and at last the books close.
> Canon discipline is unchanged — anchor sentences match word-for-word; no rephrasing.

> 纪元：铁月纪 · 春融之后。
> Era: the Iron-Moon Age — after the thaw.

---

## 一 · 先从问题开始

铁月纪的春融之后，商队把那枚印章从货堆深处翻出来——一件没有人买得起也没有人用得起的旧物。它已经转手四回：从灰烬纪的废船，到海盗集市，到一户没有子供的铁月商人，再到这次押过盐海湾的柜子。印章的正面刻的是一个半月、一个波浪、一根灯芯；印章背面只有一句：

> 它见过灯点起来的时候吗？

四回转手，四遍释读：老船夫当它是海盗的黑话；海盗说它是潮汐教团余烬留下的遗物；商人说它是一笔没人记得的旧账；柜子里的鼹书记员说，它是一张收件单——缺签名。

买货的不是船王，是一个不富裕的书手。他把货单拍在柜台上，对商人说了四个字：这是一份活儿。

商人说：活儿要问海权，书手没有这个资格。

书手笑了笑，把印章揣进腰包里：我的祖母说过，债不管鞋大不大，债主只看你肯不肯开门。商人不笑了。要是这债压根没人出现，海怎么知道收件人是谁？

书手临摹了七份货单，然后说：交给我。

**锚句**：它见过灯点起来的时候吗？

**Anchor sentence**: did it ever see the lamp alight?

---

## 二 · 没人记得灯芯从何而来

书手往荒原的深处走了九天。第七夜他见到了一扇倒扣在地平线上的黑金色玻璃——潮沙盘。它在夜里（而不是白天）发光——因为它压根不是在发光，是在承光。

幸存者告诉他：那里是一片被熔掉的玻璃。在第七次蚀的那一夜里，教团点燃了一盏不该点的灯；海从那天起停止了喘息。幸存者总说「熔掉的」而不是「掉了」——因为没人愿意承认，有一座城市就这样被干掉的。

书手走到百步之外就停住了。他看见了三件事：桌面的圆心处有一盏灯芯（雾港灯人手里那种棉絮扭捻的式样），桌边有一面沉得很慢的海，以及海和桌边之间，一个不曾离开过的身影：

是那个叫「送信人」的孩子。没人见过他睡过觉，也没人见过他回过头——他站着的轮廓，比雾港任何一盏灯标记的轮廓都长一点。

书手在他们互相看见对方的一瞬间，感到了自己腰包里那枚印章的重量：他发现那种感受在别处叫害怕——在潮沙盘上，那叫「认识」。

守夜人在瞭望塔上用最后一眼看完他的背影消失在潮汐的亮光里。四十年来，她看过这条荒原上最孤独的三种身影：挂着盐框的那一位、停着的那一位、以及她自己这位。她只记下了那句必须留给下一个人的话：

> 不是我们阻止谁开门的问题，是我们必须先记住门关上之前最后一眼看见的是什么。

**锚句**：灯不是用来照的，是用来记住黑有多黑。

**Anchor sentence**: the lamp is not for seeing by; it is to remember how dark the dark was.

---

## 三 · 火、潮与签收

书手在潮沙盘的坡面上走进时，脚底发出的不是沙的声音——是一口被锁了很久的海，终于呼出了气。他没有喊，也没有给海名。只是没有任何一条路可以选：他先蹲下，再伸出手，最后把手掌放到灯芯上——只要稳住，只要记住：他不是教团，他只是一个脚下没有退路的读者。

他点火的动作，跟六十年前教团不可言说的动作一模一样。不是号角，不是军令状，不是开门——只是明火。

每一位雾港灯人都看见了同一件事：三百盏灯同时亮了一次——不是排灯仪式，而是斜出顺序的那一批旧灯复了照：潮汐教团熄掉的那三百盏灯，由明火再一次点亮的，是那一次——也就是第八盏。海抽了一口气——

盐海做了几十年来没有过的事：它退了。它退回去的那一刻，潮声像一束光被拉成了线——先近后远，最后抵达了最后一页。

**锚句**：海没有催，海只是等。

**Anchor sentence**: the sea never urged; the sea only waited.

---

## 四 · 旧灯的吐息

灯火从灯芯落到桌面时没有声音。三百盏灯同时亮了一次——每一盏都清楚自己属于从前——然后同时暗掉。书手站在潮沙盘上后退了一步——手松开了。

他看见了沉在海底的那个教团——每一枚入海的器具，每一件被教团留在盐里的书本——每一枚被盐包住的器物。幸存者后来说，它看见的不是石——是一张抢救下来的纸：潮沙盘的坡面被熔成了一页。

书手盯着那一页。两种字迹同时浮现，一行先后：

> 收到。

左边那一行，只教团的直接继承人才读得出来——那是一句被改写过的「不替海说话」；右边那一行，人间一直读得懂——签收。海收到了，而且海允许再补一句。

书手把印章盖在那一行字下面。

它吻合。

**锚句**：书手点燃那根芯的时候，七盏旧灯从沙里站了起来。

**Anchor sentence**: when the clerk lit the wick, the seven old lamps stood up from the sand.

---

## 五 · 余烬之后

雾港灯人从此不再怵光——他们说：船夫一上船，先贴一块褪色的半月印章贴在胸前——不必是信念，只是一张签收。

潮沙盘第二天暗了下来——不是熄灭，是透完。桌面只留得下一缕细烬，颜色像被盐泡淡了的黄昏。他没有再回去，也没有人再见过他。他只把随身的油纸包连同那段沉默留在了船上；船长从此拒绝接受任何与潮汐有关的委托。

守夜人在巡逻路最后一页写下：「它见过灯的。」她父亲从没教过她这句话，是今夜从塔上学来的。

**锚句**：最后一页上只有两个字：收到。

**Anchor sentence**: the last page carries only two words: Received.

---

## 六 · 铁月纪之后

- 后来的铁月纪没有了债主。每一个船夫上船时胸前会贴一枚褪色的半月印章——不是信仰，是一张签收。
- 潮汐室里的第六卷被搬进博物厅最远的采光格——今天看得见的字只剩下「海还没——」三个字，其余的字自己消失了。
- 雾港的第四盏灯没有再亮。雾港灯人从不拿它见过的第一天开玩笑。
- 幸存者开夜会时仍然带灯——因为灯总是有的，只是没人再忘记门关上的那一刻最后看见的是什么。

**锚句**：之后的铁月纪没有了债，只剩下灯。

**Anchor sentence**: afterward, the Iron-Moon Age had no more debts, only the lamp.

---

## 七 · 模型映射（本章对应关系）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | 第八盏灯 · 收尾 | 一、三、四、五 |
| geography | 潮沙盘 · 荒原 · 雾港 · 铁月港 | 二、三、五 |
| factions | 潮汐教团余烬（全散）· 雾港灯人 · 铁月纪商人 | 一、三、五 |
| characters | 书手（签收的守候人）· 送信人 · 守夜人 | 二、三、五 |
| items | 商人印章（签单）· 灯芯（C第八盏）· 六卷会册 | 一、四、五 |
| story | 第八盏灯 · 大典终卷 | 全篇 |
| quests | 签收 · 点亮第八盏灯 | 一（卷四） |
| history | 七次日蚀的前夜 · 还亮年代的开始 | 三、六 |

> 大典的四扇门全都关上了。
> 第一扇门问海叫什么，第二扇门问谁在还，第三扇门问还完之后怎么办，第四扇门只亮起来一件事：灯已经点过了。
> 还有续写，不在这一本里——潮汐室里没有门，但每个读完的人都在门口站过。
>
> All four doors of the bible are closed now.
> The first asked what the sea is called; the second asked who pays;
> the third asked what happens after the ledger closes;
> the fourth only let one thing out: the lamp has been lit.
> The sequel is not in this book — it begins with whoever reads it.
`,
    markdownEn: `# 低语诸王 · 世界大典 第四章「第八盏灯」

> This is the fourth canonical chapter — the final volume. Chapter III left behind an unlit wick,
> a question no one dared answer, and a figure who never left the table's edge.
> This chapter settles them: the lamp is lit, and at last the books close.
> The bible ends here; what comes next belongs to whoever reads at the tide-sand table.
> Canon discipline is unchanged — anchor sentences match word-for-word; no rephrasing.
>
> 低语诸王正典第四章·终卷。第三章留下了一根没点的灯芯、一行没人敢回答的问话、以及一个不曾离开桌边的身影。本章兑现它们：灯终于亮回来了。本章之后，大典的四扇门全部关闭，正典由此暂告完结——续写权留给每一位到潮沙盘读过的人。正典纪律不变：锚句中英字字对齐，引用者逐字保持。

> Era: the Iron-Moon Age — after the thaw.
> 纪元：铁月纪 · 春融之后。

---

## I · Start With the Question

After the thaw of the Iron-Moon Age, the caravan pulled the seal out of the deepest part of the hold — a thing no one could have bought and no one could have used. It had passed through four pairs of hands: from a wreck in the Ash Age, to a pirate market, to a childless Iron-Moon merchant, into this chest at last. The front of the seal bore a half-moon, a wave and a lamp wick; the back carried a single line:

> Did it ever see the lamp alight?

Four hands, four readings. Old pilots mistook it for pirate cant; the pirates said it was the last ember of the Tide Conclave's belongings; the merchant said it was an unpaid account no one remembered; the seal-keeper at the chest said no — it was a shipping receipt, missing its signature.

The one who bought it was not a ship captain, nor a ship king, but an unremarkable clerk. He slapped the bill of lading on the counter and pronounced four words of his own: this is a job.

The merchant said: to receive a debt from the sea you need sea rights; a dock clerk has none.

The clerk smiled, slipped the seal into his belt, and answered: my grandmother taught me that a debt does not care how big your feet are — the collector only cares whether you open the door. The merchant stopped smiling. If this debt concerns no one, how would the sea know who to give the receipt to?

The clerk made seven copies of the bill of lading, and said: leave it to me.

**Anchor sentence**: did it ever see the lamp alight?

**锚句**：它见过灯点起来的时候吗？

---

## II · No One Remembers Where the Wick Came From

The clerk walked nine days into the waste. On the seventh night he saw the black-gold glass overturned on the horizon — the tide-sand table. It had borne no dust and been tracked by no steps since the eclipse; it glowed by night, not by day — for it did not shine at all; it carried light.

The survivors had told him: that was a field of glass the eclipse had fused whole. The night of the seventh eclipse, the Conclave lit one lamp that never should have been lit; since then the sea had stopped breathing. Survivors always said fused, never fallen — because no one would have admitted a city could end that way.

The clerk stopped a hundred paces from the table. He saw three things: at the centre of the tabletop lay a wick (the same twisted-cotton kind the fog-harbour lighthouse keeps in its drawer at the shore station); at its edge lay a sea that sank very slowly; and between the sea and the tabletop stood a figure who had never left —

the boy called the letter-bearer. No one had ever seen him sleep; no one had ever seen him turn around. Standing there, his outline ran longer than any lighthouse silhouette in the fog harbour.

In the instant they noticed each other, the clerk felt the weight of the seal in his belt — that feeling went by the name of fear elsewhere, but on the tide-sand table it was called recognition.

From the watchtower the Night Watcher watched his back vanish into the table's light. In all her life she had kept count of three lone silhouettes on that waste: the one with the salt yoke; the one who stopped mid-crossing; and herself. She recorded only the words to leave for whoever came next:

> We were never charged with stopping doors. We are charged with remembering the last thing seen before the door closed.

**Anchor sentence**: the lamp is not for seeing by; it is to remember how dark the dark was.

**锚句**：灯不是用来照的，是用来记住黑有多黑。

---

## III · Fire, Tide and the Receipt

As the clerk stepped onto the tabletop, the ground beneath him did not sound like sand — it sounded like a sea that had been locked for a long time, finally letting its breath out. He did not shout. He gave the sea no name. There were simply no roads left to choose: he knelt, he stretched out his right hand, and at last he laid his palm on the wick — steady it, he told himself: he was not the Conclave; he was a reader who had nowhere else to kneel.

The motion with which he struck the flame was unmistakably the same one the Conclave had spent one night refusing to admit. Not a horn, not a warrant, not a door — just flame.

Each of the fog-harbour lighthouse keepers saw the same thing at the same moment: all three hundred lamps lit at once. This was no sequential lighting — it was the old order of the wrong lamps turning sideways, the very same three hundred lamps the Conclave had extinguished, finally relit with one flame, the eighth. The sea took a breath in —

the sea did what it had not done for a lifetime: it drew back. As it did, the tide-sound stretched into a line — near first, then farther, until it reached the last page.

**Anchor sentence**: the sea never urged; the sea only waited.

**锚句**：海没有催，海只是等。

---

## IV · The Old Lamps Breathe

When the flame fell from the wick onto the tabletop, there was no sound. All three hundred lamps flared once at the same moment — each lamp aware that it belonged to an earlier time — then went dark together. The clerk took one step back from the table; his hand came loose.

He saw the sunken Conclave at the bottom of the sea — every instrument thrown overboard, every book the Conclave had left behind in the salt — every thing the salt had wrapped close. The survivors would say afterward: what he saw was not stone but a rescued page, the tabletop fused into a single sheet.

The clerk stared at the page. Two hands appeared at once, one line behind the other:

> Received.

The left line only the Conclave's direct heir could read — a rewritten version of “do not speak for the sea.” The right line, man had always known how to read: a receipt. The sea had taken delivery, and the sea permitted one more line.

The clerk pressed the seal under both.

It fit.

**Anchor sentence**: when the clerk lit the wick, the seven old lamps stood up from the sand.

**锚句**：书手点燃那根芯的时候，七盏旧灯从沙里站了起来。

---

## V · After the Ember

From that day the fog-harbour lighthouse keepers stopped fearing light — each boarding ship began to pin a faded half-moon seal on its chest; it was not faith, it was a receipt.

The tide-sand table went dark the next day — not out, just through. Only a thin thread of ash remained on the tabletop, the color of dusk washed pale by salt. The clerk never went back, and no one ever saw him again. He left his oil-paper wrapping and that silence aboard the ship; the captain refused from then on to take on any assignment related to tides.

On the last page of the patrol road the Night Watcher wrote: “It has seen the lamp.” Her father had never taught her that sentence; she had learned it off the tower that same night.

**Anchor sentence**: the last page carries only two words: Received.

**锚句**：最后一页上只有两个字：收到。

---

## VI · After the Iron-Moon Age

- The Iron-Moon Age held no more creditors. Every boarding ship now pins a faded half-moon seal to its chest — not as faith, but as a receipt.
- Volume Six of the minutes was moved to the farthest cabinet in the museum hall; only “the sea has not —” remains legible — the other characters faded of their own.
- The fog-harbour lighthouse never relit its fourth lamp. The keepers never joked about the day it went out.
- The survivors still gather by lamp — because the lamps are never scarce; what no longer happens is forgetting what was seen last before the door closed.

**Anchor sentence**: afterward, the Iron-Moon Age had no more debts, only the lamp.

**锚句**：之后的铁月纪没有了债，只剩下灯。

---

## VII · This Chapter's Shadow in the Model

| Kind | Title | Where |
|---|---|---|
| lore | The Eighth Lamp · closing the ledger | I, III, IV, V |
| geography | The tide-sand table · the waste · the fog harbour · the Iron-Moon harbour | II, III, V |
| factions | The last ember of the Conclave (spent) · the fog-harbour lighthouse · the Iron-Moon merchant | I, III, V |
| characters | The clerk (the appointed keeper) · the letter-bearer · the Night Watcher | II, III, V |
| items | The merchant's seal (the receipt) · the wick (the eighth lamp) · Volume Six of the minutes | I, IV, V |
| story | The Eighth Lamp · finale | the whole chapter, canonical |
| quests | Receiving the debt · lighting the eighth lamp | I, IV |
| history | The eve of the seventh eclipse · the beginning of the Alight years | III, VI |

> All four doors of the bible are closed now.
> The first asked what the sea is called; the second asked who pays;
> the third asked what happens after the ledger closes;
> the fourth only let one thing out: the lamp has been lit.
> The sequel is not in this book — it begins with whoever reads it.
>
> 大典的四扇门全都关上了。
> 第一扇门问海叫什么，第二扇门问谁在还，第三扇门问还完之后怎么办，第四扇门只亮起来一件事：灯已经点过了。
> 还有续写，不在这一本里——潮汐室里没有门，但每个读完的人都在门口站过。
`,
  },
] as const;

export const BIBLE_ECHOES: readonly BibleChapter[] = [
  {
    order: 1,
    slug: 'echo-001-patrol-road-notes',
    titleZh: '巡逻路札记',
    titleEn: 'Notes from the Patrol Road',
    eraLineZh: '纪元：铁月纪 · 第二冬之后。',
    eraLineEn: 'Era: the Iron-Moon Age — after the second winter.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 1): Notes from the Patrol Road

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给守夜人之后出生、从没见过盐海、却仍认得巡逻路的孩子们。纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain
> the salt grew on the same stone. Written for those born after the Night Watcher, who never
> saw the salt sea but still know the patrol road. Same discipline: anchors verbatim.

> 纪元：铁月纪 · 第二冬之后。
> Era: the Iron-Moon Age — after the second winter.

---

## 一 · 没有路标

巡逻路沿盐海外沿走了整整一百四十石——一石就是一趟海边围栏（沿路不数步数、只数轮到谁巡夜）。张哥说巡逻路是条路；他母亲说巡逻路是一夜一夜交班的方式；孩子们猜它是坨石头在纸上划了条不能越的线。三种说法都对。

每三个月，它自己洗刷一次去年留下的痕：不是风，是盐；不是盐，是这条路从来不排除偷偷把它自己擦得一干二净。守夜人只知道「留下」和「没被留下」两种方式；没有「没记上」这一种，因为巡逻路的纸上一直不给人机会说。

**锚句**：巡逻路没有路标——它每三个月自己洗刷一次去年留下的痕。

**Anchor sentence**: the patrol road has no signs — every three months it scrubs the past year's marks away by itself.

---

## 二 · 海鸥不说

第七口井边没有护栏，因为挖井的人选择相信：会飞的才值得看。

每位来过的赛金子海鸥——不是神使，也不是海的嘴，只是一个活着要活下去的鸟——每天站在井的石沿上。牠不告诉别人风什么时候来。牠只是站着。守夜人说：海鸥不告诉你何时起风，它只是站在井边，静静看。

**锚句**：海鸥不告诉你何时起风，它只是站在井边，静静看。

**Anchor sentence**: the gull never tells you when the wind is coming; it just stands by the well, quietly watching.

---

## 三 · 档案里没有「日常」两个字

余烬阁的书架上全是大写「大事记」——七口井的生期、王城的败约、教团的七次灯——没有一个守夜人见过「日常」两个字被单独刻出来，就像没有人会把呼吸单独列进账本。

后来孩子发现，档案里那些被称为「日常」的条目，每一行都是不日常写成的日常：某年某月某日有暴风，然后某人在暴风下继续走完了路。那就是全部。没有人写下一句「这一天他还活着」——因为其中的每一行对它的记账人来说，都是有生以来最平静的日常。

**锚句**：档案里从没有过「日常」两个字——都是不日常写成的日常。

**Anchor sentence**: the archives never held the word "ordinary" — everything in them was the extraordinary, written in the tense of the ordinary.

---

## 四 · 记住与忘掉

铁月纪的每一任守夜人被教过两句话：

忘掉的盐不会让任何人不再看见海；
记住的盐也不会让海再揭大名。

而巡逻路自身——从来不对谁效命。在它面前，只有两种重量：记住多的那一边总是更沉一点，忘掉多的那一边总是更轻一点。守夜人说，薄薄的那一边不欠任何人、但也没有回应可言。沉的那一边——时间沉过了它，它也只能继续走。没有选择，只有记忆。

**锚句**：记住的东西会变重，忘掉的东西会变轻——巡逻路什么都没选，它只是继续走。

**Anchor sentence**: what is remembered grows heavier; what is forgotten grows lighter — the patrol road chose neither; it just kept walking.

---

## 五 · 模型映射（回响一章对应关系）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | 巡逻路没有路标 · 海鸥站在第七口井边 | 一、二 |
| geography | 第七口井 · 余烬阁 · 盐海外沿 | 一、二、三 |
| characters | 守夜人 · 张哥（铁月纪第一批孩子）· 海鸥 | 一、二、四 |
| story | 巡逻路札记 · 回响（其一） | 全篇 |
| items | 巡逻路 · 余烬阁记账纸 | 一、三 |
| history | 铁月纪第二冬之后的日常 | 一至四 |

> 回响里没有人名、没有年份，只有盐与手——也只有盐与手，足够一百多石的交班。
> 它不接第二章也不接第三章。它只是潮里压过的一页，被偶尔潮回来访的孩子发现。
>
> An echo carries no year and no name — only salt and hands, enough for a hundred stones' worth of night shifts.
> It follows no chapter, it answers to none. Just a page the tide pressed long ago — found by whoever comes back for it.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其一）「巡逻路札记」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain
> the salt grew on the same stone. Written for those born after the Night Watcher, who never
> saw the salt sea but still know the patrol road. Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。本篇写给守夜人之后出生、从没见过盐海、却仍认得巡逻路的孩子们。纪律同正典。

> Era: the Iron-Moon Age — after the second winter.
> 纪元：铁月纪 · 第二冬之后。

---

## I · No Signs

The patrol road runs one hundred and forty stone along the outer edge of the salt sea — a stone is one stretch of fencing along the shore (you do not count steps along this road; you count whose turn it is). Zhangge said the road was a way; his mother said the road was the way watch was handed over; the children guessed it was a rock that had been dragged across the paper as a boundary. All three were right.

Every three months it scrubs the past year's marks away by itself. Not the wind — the salt. Not the salt — the road has never once ruled out the possibility of wiping its own slate clean. The Night Watcher only knows two states: left, or not left. There is no "not recorded" — because the paper of the patrol road never permitted anyone the space for it.

**Anchor sentence**: the patrol road has no signs — every three months it scrubs the past year's marks away by itself.

**锚句**：巡逻路没有路标——它每三个月自己洗刷一次去年留下的痕。

---

## II · The Gull Stays Quiet

There is no railing at the seventh well, because the digger chose to believe: only what can fly is worth watching.

Every arriving gull — not a messenger, not the sea's mouth, only a bird doing its bird-work of staying alive — stands on the stone rim of the well. It never tells anyone when the wind is coming. It just stands there. The Night Watcher said: the gull never tells you when the wind is coming; it just stands by the well, quietly watching.

**Anchor sentence**: the gull never tells you when the wind is coming; it just stands by the well, quietly watching.

**锚句**：海鸥不告诉你何时起风，它只是站在井边，静静看。

---

## III · No Page Carries the Word "Ordinary"

On the shelves of the Ember Archive everything is marked "Grand Events" — the seventh convocation's seven lamps, the fall of the capital, the seven wells' birth — yet no one had ever seen the word "ordinary" carved by itself, as if no one would ever file a breath into a ledger.

Later the children found that everything called "ordinary" in the archive was only the extraordinary, written down as ordinary days: on such-and-such a day a storm came, and someone kept walking through it. That was all. No one appended "and he went on" — because to the ones keeping the record, each of those rows was the calmest ordinary of their lives.

**Anchor sentence**: the archives never held the word "ordinary" — everything in them was the extraordinary, written in the tense of the ordinary.

**锚句**：档案里从没有过「日常」两个字——都是不日常写成的日常。

---

## IV · Remembering and Forgetting

Every Night Watcher of the Iron-Moon Age was taught these two words:

The salt forgotten cannot stop anyone else from seeing the sea;
the salt remembered cannot call the sea by its name again.

And the patrol road itself — it served no one. On its surface only two kinds of weight remain: the heavier end of remembering, and the lighter end of forgetting. The Night Watcher said: the thinner end is indebted to no one, yet it answers to no one either. The heavier end — time has sunk into it, and it can only keep walking. No choices, only memory.

**Anchor sentence**: what is remembered grows heavier; what is forgotten grows lighter — the patrol road chose neither; it just kept walking.

**锚句**：记住的东西会变重，忘掉的东西会变轻——巡逻路什么都没选，它只是继续走。

---

## V · This Echo's Shadow in the Model

| Kind | Title | Where |
|---|---|---|
| lore | The road with no signs · the gull at the seventh well | I, II |
| geography | The seventh well · the Ember Archive · the outer edge of the salt sea | I, II, III |
| characters | The Night Watcher · Zhangge (first children of the Iron-Moon Age) · the gull | I, II, IV |
| story | Notes from the Patrol Road · Echo No. 1 | the whole thing |
| items | The patrol road · Ember Archive ledger paper | I, III |
| history | Ordinary days after the second winter of the Iron-Moon Age | all |

> An echo carries no year and no name — only salt and hands, enough for a hundred stones' worth of night shifts.
> It follows no chapter, it answers to none. Just a page the tide pressed long ago — found by whoever comes back for it.
>
> 回响里没有人名、没有年份，只有盐与手——也只有盐与手，足够一百多石的交班。
> 它不接第二章也不接第三章。它只是潮里压过的一页，被偶尔潮回来访的孩子发现。
`,
  },
  {
    order: 2,
    slug: 'echo-002-lamp-wick-notes',
    titleZh: '灯芯札记',
    titleEn: 'Notes from the Lamp Wick',
    eraLineZh: '纪元：铁月纪 · 第二冬之后。',
    eraLineEn: 'Era: the Iron-Moon Age — after the second winter.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 2): Notes from the Lamp Wick

> 回响仍是正典之外的侧写——第三层纹理，不是续篇，不是批判，不是伪造。
> 本篇写给雾港灯还没缺那一盏、铁月纪之后的少年。它不替任何一盏灯命名。
> 本篇引用的锚句，与《潮沙盘》《第八盏灯》同一纪律。
>
> An echo is not a continuation, a critique, nor a forgery — another grain of salt on the same stone.
> Written for the young who lived after the Iron-Moon winters, while Mist-Port's lamps were still short one.
> Anchors follow the same discipline as Chapters III and IV: verbatim, never rephrased.

> 纪元：铁月纪 · 第二冬之后。
> Era: the Iron-Moon Age — after the second winter.

---

## 一 · 不是纸，是一张还没寄出的纸

送信人的名字从前是小人问的，后来再也没有人问过；铁月纪的最后一页上也没有。纸不是字，纸只是一种被按住的沉默。

"写没写"是个错误的问题。那不是纸没写，是纸等了那么久，等到它不是读给某一个人了——它是读给盐海本身的。盐海从来不替送信人签收文件，也不替书手记账。它只收；它收得很慢，但从来没退过单。

港尾那位几乎一辈子没等过的老船夫说，每一个版本的潮沙盘都藏有同一种心情：把一句话写下来，只有复印机做得最利索；把一句话记住，只有盐做得最彻底。

**锚句**：收件单上从来没有人签收过——它一直在等第一个肯伸手的人。
**Anchor sentence**: no one ever signed for the receipt — it has been waiting for the first hand willing to reach out.

---

## 二 · 印章经过四只手

印章正面刻着一个半月、一个波浪和一根灯芯；背面只有一句话：它见过灯点起来的时候吗？四只手接过它，四只手都愣过一秒：老船夫把它当作海盗的黑话；海盗把它当作潮汐教团余烬的遗物；铁月商人把它当作一笔没人记得的旧账；鼹鼠书记员把它当作一张收件单——缺签名。

四种释读，没有一种是错的，也没有一种是全对的。没读懂的都不是因为没识字，而是因为缺了一份对手——印章不是谜，它只是**没看过就拒绝相信灯会亮**。

印章到书手手里的时候，它的四种释读都没有消失。它只是不再是一个需要被翻译的人影了，它变成了一件事的具体形状：一件古老却仍暗暗运转着的事。

**锚句**：印章经过四只手，每只手都以为报完了账。
**Anchor sentence**: the stamp passed through four hands, each sure it had just closed an account.

---

## 三 · 雾港第四盏灯

雾港灯的规则是世代传下来的：每个灯班只负责复看一盏灯，复看不是为了看灯亮，是为了记住灯没亮。

每一班灯，都会在第一个冬末之后留一个名字。第四盏灯的人的名字留在纸上，而第四盏灯却从没按时亮过。后来三盏灯是的事情量力而为，最亮的一班把它留到了最后一刻；最后一刻到了，他不肯点。现在没有人再要他圆第四盏的故事了，他也不再圆。

盐海两岸的人不再问第四盏亮没亮，他们只问能不能看到第八盏灯。第四盏的缺席，已经从失望变成了一种长明：它永远在测量着某一件事——某件尚未被签收的事——还欠着多少。

**锚句**：雾港第四盏灯没有按时点——它一直等一个不肯认账的人。
**Anchor sentence**: the fourth lamp of Mist-Port never lights on schedule; it has always waited for one who would not sign for it.

---

## 四 · 书手没有见过自己

书手把货单拍在柜台上那次，商人只看到一个读不懂货单的穷光蛋。不富裕的书手做了六个月的苦力，他挣到的钱不够买一盏灯芯。他根本不在意买不买得起：

他关心的是，这枚印章的主人是谁。没有人告诉过他。也没有人能告诉他。国王没告诉他；雾港灯人没告诉他；潮汐余烬没告诉他。他只知道，他怕印章里那句话被认出他自己——

**锚句**：书手没见自己——他把货单拍在柜台上，海就知道收件人是谁。
**Anchor sentence**: the copyist never saw his debt — he slapped the manifest on the counter, and the sea knew who had read it.

---

## 五 · 模型映射（回响二章对应关系）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | 印章 · 收件单 · 第八盏灯 | 一、二、三 |
| geography | 雾港 · 潮沙盘（印章的出发点） · 荒原灰海 | 一至五 |
| factions | 铁月商人 · 雾港灯人 · 海盗集市 · 潮汐教团余烬 | 二、三、四 |
| characters | 送信人 · 书手 · 雾港灯班（守夜人） | 一、四、五 |
| items | 铁月纪遗信 · 印章 · 第八盏灯灯芯 · 货单 | 一、二、四 |
| story | 第八盏灯 · 灯芯札记 · 回响（其二） | 全篇 |
| history | 铁月纪的第二冬之后 | 一至五 |

> 回响从不回答。它只负责把光压进灯里，然后让那一点光，等。
> 签收从来不是一个人的事——它是整份正典的事。
>
> An echo never answers. It does only what it can: press light into the lamp,
> and let that little light wait. Signing, too, is never one person's — it is
> the whole canon's affair.
`,
    markdownEn: `
> An echo is not a continuation, a critique, nor a forgery — another grain of salt on the same stone.
> Written for the young who lived after the Iron-Moon winters, while Mist-Port's lamps were still short one.
> Anchors follow the same discipline as Chapters III and IV: verbatim, never rephrased.

> Era: the Iron-Moon Age — after the second winter.
> 纪元：铁月纪 · 第二冬之后。

---

## One · Not paper, an undelivered letter

The courier's name belonged to the early chapters; nobody asked after it again, and it was never written in the last page either. Paper is not ink. Paper is only a silence being held.

“Did he write it?” is the wrong question. It was never the paper that failed to contain the words — it was the paper that had waited so long, it was no longer addressed to any one person at all; it was addressed to the salt sea itself. The salt sea never signs for receipts, and nobody keeps a ledger for it. It only gathers. It gathers slowly, but it has never returned a single parcel.

The oldest figure in Mist-Port who had never once waited for anything said: every version of the tide-sand table hides the same kind of longing — writing a sentence down, a copyist does that best; remembering a sentence, only salt does that completely.

**Anchor sentence**: no one ever signed for the receipt — it has been waiting for the first hand willing to reach out.
**锚句**：收件单上从来没有人签收过——它一直在等第一个肯伸手的人。

---

## Two · The stamp, four hands

The stamp on the front carried a half-moon, one wave and one lamp-wick; on the back, one single line: did it ever see the lamp alight? Four pairs of hands received it, and four pairs paused for one second. To the old boatman it read like pirates' cant; to the pirates, like a relic left behind by the Tide Conclave's last remnants; to the Iron-Moon merchant, like an old debt nobody could name; to the mole-clerk, like a receipt waiting to be countersigned.

Four readings, none of them wrong, none of them fully right. Each mistook the stamp not because of literacy, but because of the missing counterpart — it was never a riddle. It was always **a refusal to believe the lamp would light until it had been seen**.

By the time the stamp reached the copyist, none of the four readings had vanished. It had simply stopped being a person to be translated; it had become the specific shape of a thing: an old event, still dimly running.

**Anchor sentence**: the stamp passed through four hands, each sure it had just closed an account.
**锚句**：印章经过四只手，每只手都以为报完了账。

---

## Three · The fourth lamp at Mist-Port

The rule of the Mist-Port lamps passed down through generations was simple: every lamp-crew is charged with watching over exactly one lamp, and watching over does not mean watching it lit — it means remembering it not lit.

Each crew, after the first winter, also carried one name away. The fourth lamp's name was written somewhere; the fourth lamp never lit on schedule. Later crews did what they could, and the brightest of them said: the last word about the fourth lamp belongs to the one who refused to light it, and I refuse to write it.

The people on both shores of the salt sea stopped asking whether the fourth lamp had lit; they asked only whether the eighth lamp could be seen. The absence of the fourth had stopped being a disappointment and become a long arrangement: a permanent instrument measuring exactly how much still awaited signature for that one question.

**Anchor sentence**: the fourth lamp of Mist-Port never lights on schedule; it has always waited for one who would not sign for it.
**锚句**：雾港第四盏灯没有按时点——它一直等一个不肯认账的人。

---

## Four · The copyist never saw his debt

The copyist slapped the manifest onto the counter and the merchant saw a laughable creature ask for a trade. For six months the copyist sweated and starved — he did not earn enough to buy a lamp-wick. He did not care:

What he cared about, was who this stamp had been owed to. Nobody told him, and nobody could. The king never told him; the Mist-Port lamp crews never told him; the Conclave's last remnants never told him. He only understood one thing — that he was afraid the stamp would recognise him as the one it had been owed to all along.

**Anchor sentence**: the copyist never saw his debt — he slapped the manifest on the counter, and the sea knew who had read it.
**锚句**：书手没见自己——他把货单拍在柜台上，海就知道收件人是谁。

---

## Five · Model map (Echo No. 2 correlation)

| Kind | Title | Section |
|---|---|---|
| lore | 印章 · 收件单 · 第八盏灯 | I, II, III |
| geography | 雾港 · 潮沙盘 · 荒原灰海 | I–V |
| factions | 铁月商人 · 雾港灯人 · 海盗集市 · 潮汐教团余烬 | II, III, IV |
| characters | 送信人 · 书手 · 雾港灯班（守夜人） | I, IV, V |
| items | 铁月纪遗信 · 印章 · 第八盏灯灯芯 · 货单 | I, II, IV |
| story | 第八盏灯 · 灯芯札记 · 回响（其二） | whole text |
| history | 铁月纪的第二冬之后 | I–V |

> An echo never answers. It does only what it can: press light into the lamp,
> and let that little light wait. Signing, too, is never one person's — it is
> the whole canon's affair.
> 回响从不回答。它只负责把光压进灯里，然后让那一点光，等。
> 签收从来不是一个人的事——它是整份正典的事。
`,
  },
  {
    order: 3,
    slug: 'echo-003-salt-lamp-vigil-diary',
    titleZh: '盐灯守灵日记',
    titleEn: 'The Salt-Lamp Vigil Diary',
    eraLineZh: '纪元：铁月纪之后 · 第八盏灯的守夜时刻。',
    eraLineEn: 'Era: after the Iron-Moon Age — the vigil hour of the Eighth Lamp.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 3): The Salt-Lamp Vigil Diary

> 回响仍是正典之外的侧写——第三层纹理，不是续篇，不是批判，不是伪造。
> 本篇写给雾港灯缺了那一盏、第八盏灯第一次被允许看见自己的夜晚之后的每一个人。
> 本篇引用的锚句，与《潮沙盘》《第八盏灯》同一纪律。
>
> An echo is not a continuation, a critique, nor a forgery — another grain of salt on the same stone.
> Written for everyone after the night the Eighth Lamp was first allowed to see itself.
> Anchors follow the same discipline as Chapters III and IV: verbatim, never rephrased.

> 纪元：铁月纪之后 · 第八盏灯的守夜时刻。
> Era: after the Iron-Moon Age — the vigil hour of the Eighth Lamp.

---

## 一 · 守灵的人没有名字

正典里从来没写过守灵人的名字。不是因为没人知道——是因为知道的人一个接一个地死去了，最后只有灯知道。灯认得他的手：补风罩的手势、理灯芯的节奏、把盐撒进灯油的那层薄薄的样子，比任何登记册都准。

他睡在灯下，醒在灯下，吃在灯下。镇上的人叫他"那个不睡觉的"——这不是外号，是体重计上没有姓氏的那一栏。盐风洗掉了他脸上所有能让他被认出的轮廓，只留下两样东西：指甲缝里的灯油痕，和每天清晨往灯座上拍掉的一层盐霜。

日记是他自己撕的灯下旧纸，边角泡过盐水，干了之后硬得像珊瑚。每一页只写一句话——多一句都会被他用潮汐擦掉。

**锚句**：守灵人没有名字——灯认得他的手，不认得他的名。
**Anchor sentence**: the vigil-keeper has no name — the lamp knows his hand, not his name.

---

## 二 · 第八盏灯的第几夜

他不数年。年数太大，装不进一盏灯里；手上的炭火一熄，"年"就塌成了一堆没人收的灰。他只数夜——一夜、十夜、九十九夜、第四百夜。数着数着就不数了，因为夜和夜之间也不再有可以按的缝。

每一夜他只写一句："今天盐的味道比昨天淡。"或是："今天第八盏灯的芯比昨天直。"或是："今天有人站在海堤上看了很久，但没有签。"

第四百夜之后，他的笔迹不再变老——老的是盐：纸的边角一层一层地往里吃，像有人在帮他把多余的话反复揉薄。

**锚句**：守灵人不数年——他数夜；每一夜都是盐的一粒。
**Anchor sentence**: the vigil-keeper does not count years — he counts nights; every night is a grain of salt.

---

## 三 · 潮走了，心没走

别人看见他在灯下打盹，没人敢叫醒他；叫醒他等于替他签收一样东西，而他这辈子没替任何人签过收。

潮汐从没替他过夜。潮汐走了，盐滩是湿的；他合上眼，盐滩是亮的。港口的钟打了几下，他都当作是灯在说话——不是在吵醒他，是在和他一起蹲下来，看那张一直摊在海面上、没有人敢合上的白纸。

他做的事只有一件：等着。等的东西他不写；写了就等于点名，而点名等于答应回答。

**锚句**：日记没有结尾——每一夜都只是盐落在盐上。
**Anchor sentence**: the diary has no ending — every night is only salt falling on salt.

---

## 四 · 灯芯与盐灯

雾港的八盏灯里，前七盏为活人亮，第八盏为回声亮。前七盏烧的油是鲸油与菜籽，第八盏烧的是"没人替它们认领的那一份"——每一盏失去光的那天早晨剩下的半盏灯芯，被守灵人收起来，一层一层铺进第八盏灯的腹里。

他照顾前七盏像照顾病人，照顾第八盏像照顾一封没寄出的信。第八盏不接受安慰，不接受哀悼，不接受纪念——它只接受一种燃料：没人愿意承认自己失去过光的那些夜。

有人问他灯什么时候亮，他说："等一封信先决定寄出。"没人听懂；他也没打算让人听懂。盐的逻辑不需要观众，只需要一个肯替它守夜的人。

**锚句**：第八盏灯不为悲伤而亮——它只为一个还没回来的人亮。
**Anchor sentence**: the Eighth Lamp does not light for grief — it lights only for the one who has not come back.

---

## 五 · 收件单的那一整本

日记最后一页的背面，压着四样东西：一枚被四只手摸过的印章、一本没写完的货单、一碗干透的盐灯油、和一枚没有署名的收件章。

守灵人没给自己留一句话。他只在一张没有日期的纸上写："今天按了——灯没亮，海先回答了。"

他做的整本书，没有一页替他签收。它们不是要被人读的——他知道客栈里只有三种人会翻这本日记：海盗、账房、和赶路赶错了方向的旅客。

**锚句**：一本日记没写完——它替整份正典收着尾。
**Anchor sentence**: the diary was never finished — it signs the whole canon in on its behalf.

---

## 六 · 续页

第二年开春，镇上的人重新找到那盏灯。灯还亮着，芯还直，盐的颜色比去年白。日记摊在灯架上，最后一页画着一根笔直的灯芯——这是守灵人留给世人的唯一一页图。

纸上没有字。照字典的读法，这一页是空的；照港口的读法，这一页是唯一写满的那一页：笔直的芯等于"承诺还没被违约"，一盏仍在燃烧的灯等于"只要还有人愿意守夜，收件就永远不会关闭"。

雾港的八盏灯里，只有第八盏灯没熄过。它不欠任何人光；它欠的是一个能被写进收件单的结局——而它一直拒绝让这个结局被签走。

**锚句**：守灵日记没有最后一页——盐会再湿，手会再拿起笔。
**Anchor sentence**: the vigil diary has no last page — salt will dampen again, and the hand will pick up the pen again.

---

## 七 · 模型映射（回响三章对应关系）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | 第八盏灯的燃料 · 收件章 · 防雨的收件体系 | 四、五 |
| geography | 雾港 · 灯座 · 海堤 · 潮滩 | 三、四 |
| factions | 雾港灯人 · 铁月商人 · 海盗 · 账房 | 二、四、五 |
| characters | 守灵人 · 海盗 · 账房 · 第八盏灯 | 一至六 |
| items | 灯下旧纸 · 灯油 · 收件章 · 第八盏灯芯 | 一、二、四、五 |
| story | 第八盏灯 · 守灵人 · 回响（其三） | 全篇 |
| history | 铁月纪之后 · 第八盏灯的守夜时刻 | 一至六 |

> 日记没有最后一页——盐会再湿，手会再拿起笔。
> 守灵不是替海签收——守灵是让海知道，还有人在按住那张纸不让它被风翻走。
>
> The diary has no final page — salt will dampen again, and the hand will pick up the pen again.
> The vigil is not a signature on behalf of the sea — it is making sure the sea knows,
> that someone is holding the paper down so the wind cannot turn it over.
`,
    markdownEn: `
> An echo is not a continuation, a critique, nor a forgery — another grain of salt on the same stone.
> Written for everyone after the night the Eighth Lamp was first allowed to see itself.
> Anchors follow the same discipline as Chapters III and IV: verbatim, never rephrased.

> Era: after the Iron-Moon Age — the vigil hour of the Eighth Lamp.
> 纪元：铁月纪之后 · 第八盏灯的守夜时刻。

---

## One · The vigil-keeper has no name

The canon never recorded the vigil-keeper's name. Not because nobody knew — because one by one, the ones who knew died, and in the end only the lamp knew. The lamp knew his hand: the gesture of refitting the chimney glass, the rhythm of trimming the wick, the thin smear of salt pressed into old lamp oil — far surer than any ledger.

He slept beneath the lamp, woke beneath it, ate beneath it. The town called him the one who does not sleep — not a nickname; just the unchecked box where a surname should be. The salt wind had rinsed every contour from his face, leaving only two things: the stains of lamp grease in his fingernails, and the salt rime he swept from the pedestal every dawn.

His diary was made from old paper torn from beneath the lamp, the edges soaked in brine until they dried as hard as coral. Each page carried exactly one line — one more, and he erased it with the ebb tide.

**Anchor sentence**: the vigil-keeper has no name — the lamp knows his hand, not his name.
**锚句**：守灵人没有名字——灯认得他的手，不认得他的名。

---

## Two · Which night of the Eighth Lamp

He never counted years. Years are too large to fit inside one lamp; once the coal burned out beneath his hand, "years" collapsed into a heap of ash nobody comes to collect. He counted nights — one night, ten nights, ninety-nine nights, the four hundredth night. Eventually he stopped counting at all, because one night and the next no longer had a seam that could be pressed apart.

Each night he wrote exactly one line:

"the salt tasted paler today," or "the wick of the Eighth stood straighter today," or "someone stood on the breakwater a long time today — but no one signed."

After the four hundredth night, his hand did not age — it was the paper that aged. The edges were eaten inward, layer by layer, as if someone were patiently folding his surplus words thinner and thinner.

**Anchor sentence**: the vigil-keeper does not count years — he counts nights; every night is a grain of salt.
**锚句**：守灵人不数年——他数夜；每一夜都是盐的一粒。

---

## Three · The tide has gone; the hand has not

When people saw him napping beneath the lamp, nobody dared wake him; waking him would have meant signing for something on his behalf, and he had never signed for anyone.

The tide never stayed with him over night. The tide withdrew; the salt flats were damp. When he closed his eyes, the salt flats shone. The harbor clock struck however many times it struck; he counted all of them as the lamp speaking — not waking him, but sitting down beside him, to look together at the white page nobody dares fold up on the surface of the sea.

He did one single thing: he waited. He never wrote what he was waiting for; writing it would have meant naming it, and naming it would have meant consenting to answer.

**Anchor sentence**: the diary has no ending — every night is only salt falling on salt.
**锚句**：日记没有结尾——每一夜都只是盐落在盐上。

---

## Four · Wick and salt lamp

Of the eight lamps of Mist-Port, seven burn for the living, and the Eighth burns for echoes. The first seven are fed whale oil and rapeseed; the Eighth is fed what nobody will claim — the half-wicks left behind the morning each of the other lamps lost its light, gathered and layered, one upon another, into the belly of the Eighth.

He cared for the first seven as for the sick; he cared for the Eighth as for an undelivered letter. The Eighth accepts no consolation, no mourning, no remembrance — it accepts only one fuel: the nights in which no one would admit they had lost their light.

When someone asked when the lamp would light, he answered: "When a letter first agrees to be sent." Nobody understood; he never intended anyone to. Salt does not ask its audience to understand, it asks only for one person willing to keep its vigil.

**Anchor sentence**: the Eighth Lamp does not light for grief — it lights only for the one who has not come back.
**锚句**：第八盏灯不为悲伤而亮——它只为一个还没回来的人亮。

---

## Five · The whole book of receipts

On the back of the last page of the diary, he pressed four things in place: the stamp passed from hand to hand four times, an unfinished manifest, a bowl of dried salt-lamp oil, and a receiving-seal that bore no name.

The vigil-keeper left no message for himself. On a sheet without a date he wrote only: "I pressed it today — the lamp did not answer, the first to reply was the sea."

Not a single page of his book signs itself away. They were never meant to be read — he knew three kinds of people would leaf through this diary in a room without him: pirates, ledger-keepers, and travelers who set out in the wrong direction and had nowhere else to stop.

**Anchor sentence**: the diary was never finished — it signs the whole canon in on its behalf.
**锚句**：一本日记没写完——它替整份正典收着尾。

---

## Six · The next page

When the town rediscovered the lamp the following spring, it was still alight — the wick still straight, the salt whiter than last year. The diary lay open on the lamp-rack, and its final page held one drawing: a perfectly straight wick. It was the only image the vigil-keeper left for the world.

There were no words on that page. By the reading of dictionaries, this page was empty; by the reading of the port, this is the one page completely full: a straight wick means the promise has not yet broken, and a lamp still burning means the receipt can never be closed — as long as somebody is still willing to keep the vigil.

Of the eight lamps of Mist-Port, only the Eighth has never gone dark. It owes no one light; what it owes is an ending written onto a receipt — and it refuses, stubbornly, to let that ending be signed away by anyone.

**Anchor sentence**: the vigil diary has no last page — salt will dampen again, and the hand will pick up the pen again.
**锚句**：守灵日记没有最后一页——盐会再湿，手会再拿起笔。

---

## Seven · Model mapping (what Echo No. 3 maps onto)

| Category | Title | Sections |
|---|---|---|
| lore | The fuel of the Eighth Lamp · the receiving-seal · the rain-proof system of receipts | IV, V |
| geography | Mist-Port · the lamp pedestal · the breakwater · the salt flats | III, IV |
| factions | The Mist-Port lampers · the Iron-Moon merchants · pirates · ledger-keepers | II, IV, V |
| characters | The vigil-keeper · pirates · ledger-keepers · the Eighth Lamp | I–VI |
| items | Lamp-tended paper · lamp oil · the receiving-seal · the wick of the Eighth | I, II, IV, V |
| story | The Eighth Lamp · the vigil-keeper · Echo No. 3 | All |
| history | After the Iron-Moon Age · the vigil hour of the Eighth Lamp | I–VI |

> The diary has no final page — salt will dampen again, and the hand will pick up the pen again.
> The vigil is not a signature on behalf of the sea — it is making sure the sea knows,
> that someone is holding the paper down so the wind cannot turn it over.
`,
  },
  {
    order: 4,
    slug: 'echo-004-ninth-knock',
    titleZh: '第九叩',
    titleEn: 'The Ninth Knock',
    eraLineZh: '纪元：铁月纪之后 · 第四十二次会议无人召集的那一年。',
    eraLineEn: 'Era: after the Iron-Moon Age · the year the forty-second meeting convened for no one.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 4): The Ninth Knock

> 回响仍是正典之外的侧写——第四层纹理，不是续篇，不是批判，不是伪造。
> 本篇写给雾港的第九下叩击：八盏灯都认得它，没有一盏承认拥有它。
> 本篇锚句，与《潮沙盘》《第八盏灯》《盐灯守灵日记》同一纪律。
>
> An echo remains a side-glance beyond the canon — the fourth grain of salt on the same stone, not a sequel, not a critique, not a forgery.
> Written for the ninth knock over the mist harbor, which every lamp knows and no lamp admits.
> Its anchors answer to the same discipline as Chapters III and IV and Echo No. 3.

> 纪元：铁月纪之后 · 第四十二次会议无人召集的那一年。
> Era: after the Iron-Moon Age · the year the forty-second meeting convened for no one.

---

## 其一 · 沙盘上的第九个旋钮

潮汐教团第四十一次会议散后，沙盘仍留在厅中。海岸用细盐铺成，河口压着一枚黑印，八盏灯的位置各插一根铜针。记录员逐项核对收件单，纸边受潮，名字洇成灰线。有人说，沙盘上原有九个旋钮；有人说，旋钮只是用来校正潮向，不该计数。没有人把这两句话写进会议纪要。

第二天，守盘人发现盐岸多出一圈浅痕，像潮水退后留下的环。痕迹正中有个凹处，容得下一枚旋钮。库房的器物账没有第九件，借出栏却多了一枚指印，盖在空白的日期上。守盘人用袖口擦去盐末，凹处仍在。雾从窗缝进来，吹动账页，翻到末页时，纸上有九个墨点，最末一个尚未干透。

会后有人取走沙盘，送往海堤内侧的旧档房。送件人只收到了八枚印章。收件单上却记着九件，最后一件写作"旋钮"，后面没有数量。档房看守拒绝签收，直到夜潮漫过门槛。那时，门内的沙盘转了一格，八根铜针齐齐朝向港外。

**锚句**：盐岸留着多出的空位。
**Anchor sentence**: the salt shore keeps the extra hollow.

---

## 其二 · 没有人坐的第九把椅子

会议厅有八把椅子，靠墙另有一把，椅背朝着窗。每逢潮汐教团开会，书记都要在这把椅子前放一张收件单，写上日期，再压一方印章。没有人坐下，也没有人挪开它。椅脚下的地板有一圈深色，像盐水经年浸过木纹，擦也擦不净。

第四十一次会议记录写着八名到席者。末行却多出一个逗号，后面空了半页。书记问过主持者，主持者把墨水瓶盖好，说那是印章压出的痕。于是书记重抄一份，逗号仍在。到散会时，椅面留下浅浅的凹陷，仿佛有人刚刚起身。窗外海堤上没有脚印，门闩也未曾响过。

此后，雾港每逢大潮，守夜人都要将这把椅子搬到厅门外。椅背朝海，椅面放着一册账本，记每盏灯的燃油与更换日期。八盏灯的账目逐年累积，唯独末页总是潮湿，纸上有一道竖痕，从页首直落页脚。搬椅的人说，那不是水迹；他不肯说是什么。

第四十二次会议无人召集。椅子仍在门外，收件单上印着"已到"，印泥未干。书记没有落笔。夜里，海堤上传来一声木头轻响，像椅脚在石面上挪了一寸。第二日，八把椅子各自向后退了一寸，空出的地方正对着门口。

**锚句**：空席不等于无人。
**Anchor sentence**: an empty seat is not the same as no one.

---

## 其三 · 烛台上的第九格

旧厅的烛台只刻了八格，按八盏灯的次序排开。每次会议，书记点烛，记录员记下火芯长短，守门人收走滴蜡，连同收件单一并入账。蜡落在格里，凝成硬壳，像潮退后留在石缝里的盐。没人准许擦掉旧蜡，理由没有写进规条。

第四十一次会议那晚，最后一支烛燃到尽头，烛台上却亮着九处。多出的那格在正中，细得像刀口。书记拿尺量过，说是铜面裂纹；守门人用指甲划过，指甲上没有铜屑。记录员把九处火光记作八处，写到"八"字时，笔尖折断。桌上的蜡油流过会议章，凝住了印文中的"潮"字。

此后，烛台由档房保管。灯房每月送来灯芯，收件单上仍写八根；库房账本却每月少一根。看守从不追问，只在交接时数烛台上的格。八格之外，那道细痕渐渐变深，像有火在铜背后缓慢烧着。大潮涨至海堤顶端时，旧厅的窗纸映出九团光，天亮后，烛台仍冷。

有一回，书记把烛台送到海边，想让盐水封住裂纹。浪只打湿了底座，九格之中的那一格仍干。回程时，他在账本上添了一行："照例归还。"字迹下方有一圈圆印，印泥从纸背透出来，像烛焰留下的暗红。

**锚句**：第九格不受风吹。
**Anchor sentence**: the ninth cell feels no wind.

---

## 其四 · 报纸上被印圆角擦掉的第九个脚注

雾港的报纸每天三更印刷，港务、灯油、潮位和失踪的货物各占一栏。第四十一次会议之后，报馆收到一张匿名校样，纸上列着八盏灯的修缮记录，末尾另有第九个脚注。脚注写得很短，只说某盏灯罩内侧有叩痕，叩痕共九道。校对员读完，把纸送进印房。

第二天发行的报纸上，脚注不见了。空处被一枚圆角印章盖住，边沿压得整齐，像潮水专挑纸页的一角退去。印章没有署名，印文也磨损得看不清。报馆查过印泥，颜色与教团会议所用相同；查过印章簿，登记的八枚都在柜中。馆长把校样收进抽屉，锁好，又在账本里记下"纸张短缺一页"。

此后每逢大潮，脚注都会重现一次。它先出现在排版纸上，继而在送印前被擦掉；有时留下半个"九"字，有时只剩一条湿痕。圆角印章总比校样先到，放在版台边，印面朝下。没人敢翻看。报馆的送件人将当日报纸送到各处，收件单上写着八份，门房却总要他确认第九份是否交付。

那份报纸不在任何订户名下。它被夹在账本里，纸边泛咸，日期空白，折痕朝着港口。海风把最后一页掀起时，圆角缺口正对着海堤上的八盏灯。

**锚句**：删去的字仍占一栏。
**Anchor sentence**: the struck-out line still holds its column.

---

## 其五 · 第九个客人到来之前

雾港的客栈在大潮前关门，门板上挂着收件单，记来客姓名、房号、离港时辰。掌柜只备八间房，账本上也只有八行。第四十一次会议以后，他每逢潮汛便多摆一只杯子，杯口朝向窗外。杯底压着盐粒，没人碰它。掌柜说，那是旧账未清，不是留客。

大潮将至的夜晚，海堤上先起雾，随后港口的铁链一节节绷紧。客栈门前没有车，也没有脚印。掌柜照例抄写八间房的收件单，写到末尾，笔尖却在纸上停了很久。烛台映着账页，八行之间渗出一行浅水印。那行没有姓名，没有房号，只有一处圆印，边沿缺了一个角。

守夜人说，客人来前总会有人敲门。掌柜答，敲门声属于送信的，不属于客人。两人争到半夜，门外仍静。只有窗缝里进来的潮气，将桌上的纸一张张贴住。账本合不上，封皮在湿气里弯曲，像海堤外侧一段低矮的岸。

天亮时，杯子仍是空的，杯底的盐却化了。掌柜把它倒进废水桶，桶里传来一声轻响，像有东西落在水底。收件单上多了一道掌纹，指节处压得最深。掌柜没有添房，也没有添名，只把门牌翻到背面，留出一块未写的木头。

**锚句**：门开之前，账已记妥。
**Anchor sentence**: before the door opens, the ledger is already settled.

---

## 其六 · 第九下叩击响起的那一刻

大潮抵达海堤时，八盏灯都已点亮。守灯人沿堤巡过一遍，逐盏查灯油、灯芯、灯罩上的封条，再在账本上盖印。雾贴着石面行来，吞掉堤外的浪声。第九盏灯没有灯柱，也没有灯室；灯房的库存簿从未登记过它。守灯人仍在巡查单末尾留下一格，格子窄，刚好容下一枚印章。

第一下叩击响起时，海面平了。第二下响起时，港里的船绳同时绷紧。第三至第八下，守灯人没有抬头，只将每一下记进账本，墨色越来越淡。灯罩上传来的声音贴着铜皮，不重，却让封条一寸寸发白。没有人站在灯下。远处的报馆熄了排字灯，客栈关紧门，旧厅那把空椅子在风中向前挪了半寸。

第九下落下时，海堤上的印章裂开。印泥渗进石缝，像一滴盐水被压进账页。雾港八盏灯一齐暗了片刻，随后重新亮起。灯罩内侧留下九道叩痕，最末一道没有铜屑，只有一小片潮湿的纸。守灯人把纸取下，纸上没有字，收件栏却盖着"已收"。

天将亮时，潮退到堤脚。守灯人核对灯数，仍是八盏；核对账目，仍有九行。记录簿最后一页被海风翻起，空白处压着一枚圆角印章。无人认领，也无人收回。大潮依期而来，账页没有合上。

**锚句**：第九下，记在无人名下。
**Anchor sentence**: the ninth knock is entered under no one's name.

---

## 模型映射（回响四章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 第九叩 · 沙盘第九旋钮 · 圆角印章 | 三、四 |
| geography | 雾港 · 海堤 · 旧档房 · 报馆 · 客栈 · 旧厅 | 一、三、四、五 |
| factions | 潮汐教团 · 守灯人 · 报馆 · 客栈 | 一至五 |
| characters | 守盘人 · 书记 · 守夜人 · 掌柜 · 守灯人 | 一至六 |
| items | 沙盘 · 第九把椅子 · 烛台 · 收件单 · 圆角印章 | 一至六 |
| story | 雾港 · 第九叩 · 回响（其四） | 全篇 |
| history | 铁月纪之后 · 第四十二次会议无人召集 | 一至六 |

> 事情不多，九样也许不是数字——是潮水退时少还给海的那一格。
> 九下叩击从不请求应答——它只请求被记入一册永远合不上的账。
>
> Nine is not a number the sea ever counted in — it is the one cell the tide never returns.
> The ninth knock never asks for an answer — it asks only to be entered into a ledger that never closes.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其四）「第九叩」

> An echo remains a side-glance beyond the canon — the fourth grain of salt on the same stone, not a sequel, not a critique, not a forgery.
> Written for the ninth knock over the mist harbor, which every lamp knows and no lamp admits.
> Its anchors answer to the same discipline as Chapters III and IV and Echo No. 3.
>
> 回响仍是正典之外的侧写——第四层纹理，不是续篇，不是批判，不是伪造。
> 本篇写给雾港的第九下叩击：八盏灯都认得它，没有一盏承认拥有它。
> 本篇锚句，与《潮沙盘》《第八盏灯》《盐灯守灵日记》同一纪律。

> Era: after the Iron-Moon Age · the year the forty-second meeting convened for no one.
> 纪元：铁月纪之后 · 第四十二次会议无人召集的那一年。

---

## I · The Ninth Dial on the Sand Table

After the forty-first meeting of the Tide Congregation broke up, the sand table was left in the hall. The shore was laid in fine salt, the river mouth pressed down with a black seal, and eight copper needles marked where the eight lamps belonged. The recorder went down the receipt form line by line; the paper edges had drawn damp, and the names had bled to gray strokes. Some said the sand table had always had nine dials; some said dials were only for correcting the tide's heading, and that there was nothing to count. Neither sentence was written into the minutes.

The next day, the keeper of the sand table found a fresh ring of shallow scratches in the salt shore — like the ring a tide leaves on retreating. The hollow at its center was the size of one dial. The stores ledger said there was no ninth item; the loan column bore a new fingerprint over a blank date. The keeper brushed the salt off with his sleeve. The hollow stayed. The fog came in through the window seam, worrying the ledger pages, and on the last one there were nine drops of ink, the last of them not yet dry.

Later the table was carried off to the old archive room behind the sea dyke. The messenger was given only eight seals. The receipt form listed nine items; the last one read "dial", with no count after it. The archive keeper refused to sign for it, until the night tide licked over the threshold. Then, inside, the sand table turned one notch — and all eight copper needles pointed out to harbor waters.

**Anchor sentence**: the salt shore keeps the extra hollow.
**锚句**：盐岸留着多出的空位。

---

## II · The Ninth Chair Nobody Sat In

The meeting hall has eight chairs, and one more against the wall, its back to the window. Whenever the Tide Congregation met, the clerk set a receipt form before that chair, dated it, and pressed a seal onto it. Nobody sat in it, and nobody moved it. The boards beneath the chair legs bore a dark circle, as if salt water had steeped the grain there for years and would not scrub away.

The minutes of the forty-first meeting list eight attendees. The last line carries a stray comma, and the page after it is left half blank. The clerk asked the chairperson; the chairperson capped the inkwell and said the mark was where the seal had pressed. The clerk wrote the minutes out again. The comma had returned. At adjournment, the chair seat held a shallow dent, as though someone had only just risen from it. Beyond the window the sea dyke held no footprints; the door latch had not stirred.

After that, whenever the big tide came to the mist harbor, the vigil-keeper dragged the chair outside to the door. Its back faced the sea; on the seat lay a ledger recording each lamp's oil consumption and service dates. The eight lamps' accounts grew thicker year by year, except the last one, which was always damp, and bore a single vertical stroke from its head to its foot. The one who carried the chair said it was not a water line. He never said what it was.

The forty-second meeting was never called. The chair stayed outside the door; the receipt form on the seat was stamped "received", and the seal paste had not dried. The clerk never did write the minutes. In the night, a wooden knock came along the sea dyke — like a chair leg shifting an inch over stone. By morning, the eight chairs inside the hall had each retreated an inch, and the place they had vacated faced the doorway exactly.

**Anchor sentence**: an empty seat is not the same as no one.
**锚句**：空席不等于无人。

---

## III · The Ninth Notch in the Candelabra

The candelabra in the old hall was engraved with only eight notches, laid out in the order of the eight lamps. At every meeting, the clerk lit the candles; the recorder tallied wick lengths; the doorkeeper swept up the dripped wax and filed it with the receipt form. The wax pooled in the notches, hardening into crusts — like salt left in stone cracks by the ebbing tide. Nobody was permitted to scrape old wax away, and the reason was never set down in the rules.

On the night of the forty-first meeting, the last candle burned down — and nine flames burned at the candelabra. The ninth notch sat in the middle, fine as a knife's edge. The clerk measured it with a rule and said it was a crack in the copper surface; the doorkeeper drew his fingernail across it and came away without copper flecks. The recorder logged nine flames as eight, and at the character for "eight" his pen snapped. Wax ran across the meeting seal on the desk and froze into the character for "tide" in the imprint.

After that, the candelabra was kept in the archive room. The lamp room delivered wicks monthly; the receipt form still read eight wicks — and the stores ledger lost one every month. The keeper never pursued the matter. He only counted the candelabra's notches at hand-over. Beyond the eight, the fine line kept deepening, as if a flame were slowly burning through the copper from behind. When the big tide rose to the crest of the sea dyke, the old hall's paper windows cast nine points of light; by daylight, the candelabra was still cold.

Once the clerk carried it down to the shore, meaning to seal the crack with saltwater. The wave wetted only the foot; of the nine notches, one stayed dry. On the way home he entered a line in the ledger: "Returned as usual." Beneath the characters lay a round seal impression, and the seal paste bled through the back of the page like a dark red the flame had kept.

**Anchor sentence**: the ninth cell feels no wind.
**锚句**：第九格不受风吹。

---

## IV · The Ninth Footnote the Printer's Corner-Seal Erased

The mist harbor's newspaper was printed every third watch of the night: harbor affairs, lamp oil, tide levels, and the cargo gone missing, each claiming a column. After the forty-first meeting, the printing house received an anonymous proof listing the repair log of the eight lamps — and at the foot of it, a ninth footnote. It said only that on the inside of a certain lamp shade there were nine knock-marks, and that there were nine of them. The proofreader read it, and sent the sheet into the press room.

In the paper that shipped next morning, the footnote was gone. The space where it had been was covered by a corner-round seal, its edge pressed down as cleanly as a tide retreats from one corner of a sheet. The seal bore no name, and the imprint was worn past reading. The printing house checked its seal pastes: the color matched the Congregation's meeting paste. It checked its seal rolls: all eight registered were in their drawer. The manager filed the proof in a drawer, locked it, and wrote in the ledger, "one sheet short of paper."

Ever after, every big tide brought the footnote back. It appeared first on the typesetting sheet, then was struck out before the sheet went to press; sometimes half a "nine" survived, sometimes only a damp line. The corner-round seal always arrived ahead of the proof, left on the edge of the typesetting table, face down. Nobody dared turn it. The office runner circulated the day's papers door to door; the receipt form showed eight copies, and the doorkeeper always made him confirm whether the ninth had been delivered.

That paper is not subscribed by anyone. It sits wrapped in the ledger, its edges salt-white, its date blank, its fold facing the harbor. When the sea wind lifts the last page, the corner-round notch points squarely at the eight lamps along the sea dyke.

**Anchor sentence**: the struck-out line still holds its column.
**锚句**：删去的字仍占一栏。

---

## V · Before the Ninth Guest Arrives

The mist harbor's inn closed its doors ahead of every big tide. A receipt form hung on the door, listing guests' names, room numbers and hours of departure. The keeper never stocked more than eight rooms, and his ledger had only eight lines. After the forty-first meeting, at every flood tide he set down one extra cup, its rim facing the window. Salt crusted the bottom; no one ever touched it. He said it was an old account still open — not a place held for a guest.

On the night before the big tide, fog rose first along the sea dyke, then the harbor's iron chains drew taut link by link. No cart stood before the inn, and there were no footprints. The keeper wrote out the eight receipt forms as usual; on the last sheet his pen stopped for a long time. The candelabra threw the ledger pages into relief, and between the eight lines a faint waterline seeped through. It bore no name, no room — only a round seal, one corner worn away.

The vigil-keeper said a knock at the door always precedes a guest. The innkeeper answered that knocking belongs to messengers, not guests. They argued till midnight; the door stayed silent. The tide damp that crept in through the window seam pasted every sheet on the table down flat. The ledger would not close; its cover curled in the wet, like a low bend of shore beyond the sea dyke.

By daybreak the cup stood empty — its salt was gone. The keeper tipped it into the slop bucket, and the bucket answered with a faint, settled thud, as though something had reached the bottom. The receipt form on the last page carried a palm print, pressed deepest at the knuckles. He did not add a room, nor a name; he simply flipped the room sign over and left that bare piece of wood unwritten.

**Anchor sentence**: before the door opens, the ledger is already settled.
**锚句**：门开之前，账已记妥。

---

## VI · The Moment the Ninth Knock Falls

As the big tide reached the sea dyke, all eight lamps had been lit. The lamp-warden walked the dyke with the lamp log, checking oil, wicks and the paper seal pasted inside each lampshade, then stamping his seal into the ledger. Fog came up the stones and swallowed the surf beyond. The Ninth Lamp has no pillar, no chamber; the lamp room's stores never registered it. Yet the warden still left a final box at the end of his inspection line — barely wide enough for one seal.

At the first knock, the sea surface went flat. At the second, every ship's hawser in the harbor drew taut at once. From the third to the eighth, the warden did not raise his head; he entered each beat into the ledger, the ink paling as it went. The sound on the lampshades sat against the copper skin — not heavy, but it paled their seals a finger at a time. Nobody stood beneath the lamps. Off across the harbor the printing house darkened its type-setting lamps; the inn shut its door fast; in the old hall the empty chair slid half an inch closer to the sea.

At the ninth knock, the seal on the sea dyke split in two. The paste bled down the stone seam, like a drop of saltwater pressed into a ledger. The eight lamps of the mist harbor dipped dark all at once — then lit again. Inside their shades, nine knock-marks remained; the last of them left no brass flecks, only a small wet scrap of paper. The warden drew it out; it held no words — but the receipt column was stamped "received".

As the light came up, the tide drew back down to the dyke foot. The warden counted the lamps: still eight; checked the books: still nine lines. The last page of the inspection log was lifted by the sea wind; in the blank it pressed down a corner-round seal. No one claimed it, and no one asked to take it. The big tide kept its appointment; the ledger never closed.

**Anchor sentence**: the ninth knock is entered under no one's name.
**锚句**：第九下，记在无人名下。

---

## Model mapping (echo No. 4)

| Category | Title | Corresponds to |
|---|---|---|
| lore | The Ninth Knock · the Ninth Dial · the Corner-Round Seal | III, IV |
| geography | The Mist Harbor · the Sea Dyke · the Archive Room · the Printing House · the Inn · the Old Hall | I, III, IV, V |
| factions | The Tide Congregation · the Lamp-Warden · the Printing House · the Inn | I–V |
| characters | The Keeper of the Sand Table · the Clerk · the Vigil-Keeper · the Innkeeper · the Lamp-Warden | I–VI |
| items | The Sand Table · the Ninth Chair · the Candelabra · the Receipt Form · the Corner-Round Seal | I–VI |
| story | The Mist Harbor · The Ninth Knock · Echo (No. 4) | whole |
| history | After the Iron-Moon Age · Forty-Second Meeting never convened | I–VI |

> Nine is not a number the sea ever counted in — it is the one cell the tide never returns.
> The ninth knock never asks for an answer — it asks only to be entered into a ledger that never closes.
>
> 事情不多，九样也许不是数字——是潮水退时少还给海的那一格。
> 九下叩击从不请求应答——它只请求被记入一册永远合不上的账。
`,
  },
] as const;
