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
  {
    order: 5,
    slug: '005-the-addressee',
    titleZh: '收件人',
    titleEn: 'The Addressee',
    eraLineZh: '纪元：潮候院 · 建院之年。',
    eraLineEn: 'Era: the Institute — the year of its founding.',
    markdownZh: `# 低语诸王 / The Whispers' Kings · World Bible · Chapter V: The Addressee

> 回响是正典之外的侧写；第五章是正典唯一接受续写的门——第四章门关上了，但门外的人一直站在门口。
> 本章兑现第四章最后一行问题的答案：那张签收单究竟递给谁。
> 本章之后，大典进入潮候院纪——所有回响都发生在那里。
> 纪律不变：锚句中英字字对齐，引用者逐字保持。
>
> Where echoes are the other grain of the same stone, Chapter V is the only door the canon allowed kept open — Chapter IV shut its door, and someone was still standing there.
> This chapter pays out the answer to the last line left open in Chapter IV: to whom the receipt was delivered.
> After this chapter, the bible enters the Institute Age — every echo happens there.
> Canon discipline unchanged: anchors match word-for-word; no rephrasing.

> 纪元：潮候院 · 建院之年。
> Era: the Institute — the year of its founding.

---

## 一 · 退过的泥滩

水退了六里，九天没有涨回来。

渔网打上来的是从没见过的鳞——灰的、软的、没有眼睛的那一类；鼓架里残着两滴海水，无论怎么抹也干不掉；搁浅的船在泥沙上留了一条很长的脊痕，远看像一句没写完的话。

幸存者们把帐篷搬上了原来是礁石的那块泥滩。铁月纪的人照旧开夜会，但谁也不再拿「熔掉的」当玩笑——退潮的痕迹在这里，潮什么时候回来没有人敢问太情愿。

**锚句**：退潮把整片泥滩晒给人看——谁也没看见那个收件人。
**Anchor sentence**: the receding tide dried the whole mudflat for all to see — and no one saw the addressee.

---

## 二 · 三城各自出发的人

第一个提问的人来自盐海商会。她翻了一辈子旧账，看见潮候院的位置是从前潮汐教团散落之后空下来的那块地。她带着两张抄件和一个罗盘出发。

第二个提问的人来自潮沙盘学馆。他带走了第四章抄本的副本——边缘已经磨白了的那一页。他不懂签收之前的一切，但他懂怎么把纸摞整齐。

第三个提问的人来自雾港灯楼。她拿着一盏从没点过的小灯——小灯的灯芯是从灯塔顶层下来的那一截，没人敢给她，她把灯芯拿走了。

三路人在不同的路上遇到的是同一类人——每个 port 都有一个自称「收件人」的人：坐在门廊上的秤砣人、船坞尽头那个从来没收过货的老会计、还有卖褪色半月印章的书手。每个人都拿得出半张收据，每个人拿的都是和印章同一批的。

**锚句**：三路人出发找收件人，一路上遇到的全是自称的人，没有一个是真的。
**Anchor sentence**: three parties set out to find the addressee and met self-claimants on every road — not one was proven.

---

## 三 · 抄本员的白沙

三路人最后在雾港口遇上了一个抄本员。

抄本员没有问他们的来历——他和祖母两代人记住的规矩是：潮沙盘的位置之外，所有人都来了，所有人都会被记住。

那天晚霞斜切进栈桥的时候，潮沙盘自己落了一格沙。沙是白的。白得从来没见过——白得像第八盏灯熄掉之后，海底那一张纸被水泡淡的底色。

抄完最后一笔以后，船坞上的灯依照顺序亮完一排——没有人点灯。

**锚句**：抄本员把半月盖上去的时候，潮沙盘自己落了一格沙。
**Anchor sentence**: when the copyist pressed the half-moon seal down, the sand table let fall a grain of sand on its own.

---

## 四 · 替海签收的人

三城的人终于明白：收件人不是一个人——收件人是一座建筑。

潮候院在潮沙盘的位置上被定了下来。第一座房只有一间屋子，一个潮沙盘，一只潮沙盘的沙漏（从来没量过一滴水）——以及一册登记。

抄本员在第一页上不写任何人的名字。他只写了一笔：

「潮站了一下。」

后来每一代大会抄的都是这句话的变体。抄到第四十一次大会的时候，里巷子的某一位抄本员终于少写了「一下」两个字——值守说少一个字就是少潮沙盘一半的意义——抄本员让他重新补。

**锚句**：潮候院的第一页登记不写人名——到此为止，潮已经站了一下。
**Anchor sentence**: the Institute's first register holds no name — here ends the tide standing still for a moment.

---

## 五 · 大典之后

正典在第五章结束。后面的潮候院没有第五章——抄本员之间一直流传：

> 「潮候院只负责听。」

也就是说：这座建筑从来不替海说话，它只是潮的收件人。所有回响都发生在这所「听见」里面——没有人被允许替潮回答；没有巫师、没有祭司、没有先知——只有抄本员、值守、以及偶尔到里巷子走一圈的人。

正典到此暂告完结。但大典之外，潮候院还在开第四十一次大会，里巷子的抄本员还在抄，潮沙盘的每一格沙都还在听。

**锚句**：正典在第五章之后没有第六章——潮候院只负责替潮收住那口气。
**Anchor sentence**: after the fifth chapter there is no sixth — the Institute only keeps the breath that was drawn in.

---

## 六 · 模型映射（本章对应关系）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | 潮候院建院 · 第八盏灯的回声 | 一、二、三、四、六 |
| geography | 雾港口 · 里巷子 · 潮沙盘 | 一、三、四、五 |
| factions | 潮沙盘学馆 · 盐海商会 · 里巷子抄本员 · 雾港灯楼 | 二、三、四 |
| characters | 那一名抄本员 · 三路人 | 二、三、四、六 |
| items | 潮沙盘 · 半月印章 · 灯芯 · 第一册登记 | 二、三、四、六 |
| story | 收件人 · 大典续卷之一 | 全篇 |
| quests | 签收 · 建立潮候院 | 一至四 |
| history | 大典之后 · 潮候院四十一次大会之前 | 一、二、四、五、六 |

> 退潮带来的不是沙——是一句被整整一个世纪等过的话。
> 潮候院没有人代潮回答，值守只在风起的时候，把门按习惯关上。
> 潮候院的人等了四十一次大会之后，海还是没有说——收件人一直在听。
> The receding tide brought not sand — but a sentence the whole century had been waiting for.
> No one in the Institute will ever answer for the tide; only on windy nights, the watchers pull the doors shut.
> After forty-one Convocations, the sea still has not spoken — the addressee is listening.
`,
    markdownEn: `# 低语诸王 / The Whispers' Kings · World Bible · 第五章「收件人」

> Where echoes are the other grain of the same stone, Chapter V is the only door the canon allowed kept open — Chapter IV shut its door, and someone was still standing there.
> This chapter pays out the answer to the last line left open in Chapter IV: to whom the receipt was delivered.
> After this chapter, the bible enters the Institute Age — every echo happens there.
> Canon discipline unchanged: anchors match word-for-word; no rephrasing.
>
> 回响是正典之外的侧写；第五章是正典唯一接受续写的门——第四章门关上了，但门外的人一直站在门口。
> 本章兑现第四章最后一行问题的答案：那张签收单究竟递给谁。
> 本章之后，大典进入潮候院纪——所有回响都发生在那里。
> 纪律不变：锚句中英字字对齐，引用者逐字保持。

> Era: the Institute — the year of its founding.
> 纪元：潮候院 · 建院之年。

---

## 一 · The Dried Mudflat

The water drew back six liveli and did not return for nine days.

The nets came up full of scales never seen before — gray, soft, eyeless; two drops of sea-water persisted in the drum-shell, which could not be dried, no matter how long people wiped; the beached ship lay on the mudflat in a long keel-mark that looked from afar like an unfinished sentence.

The survivors carried their tents up to what used to be the shoal. The Iron-Moon guilds still held evening sessions, but no one laughed at "the melted" anymore — the retreat lay here for all to see, and no one dared ask when the tide would come back and be willing.

**锚句**：退潮把整片泥滩晒给人看——谁也没看见那个收件人。
**Anchor sentence**: the receding tide dried the whole mudflat for all to see — and no one saw the addressee.

---

## 二 · Three Cities Send Their Own

The first to ask came from the Salt-Sea Guild. She had translated ledgers all her life and found that the site of the Institute was the very ground the Tide Conclave had been left vacant after its dispersion. She brought two copies and a compass.

The second to ask came from the Sand-Table School. He carried the copy of Chapter IV — the page whose edges had been polished white. He understood nothing before the receipt; what he understood was how to keep paper stacked square.

The third to ask came from the Lantern Tower at Fog Harbor. She carried a small unlit lamp — the wick of which had come down from the lantern-top — no one had been willing to give it to her, but she took it with her.

Along the three roads they met the same kind of man: port after port had a self-appointed "Addressee" — the counterweight sitting on the porch, the old accountant at the end of the dock who never received a cargo, and the bookseller with the faded half-moon seal. Each brought a half-slip of receipt; all belonged to the same batch as the seal.

**锚句**：三路人出发找收件人，一路上遇到的全是自称的人，没有一个是真的。
**Anchor sentence**: three parties set out to find the addressee and met self-claimants on every road — not one was proven.

---

## 三 · The Copyist's White Sand

The three parties at last met a copyist at the mouth of Fog Harbor.

The copyist did not ask about their origins — the rule he had learned from two generations before him was this: everything that came to the sand table outside its location had come, and everything that came would be remembered.

When the sunset cut across the pier at an angle, the sand table let one grain of sand fall on its own. The grain was white — white as the sea-bed paper soaked pale after Chapter IV, white past memory.

When the copy finished the last stroke, the harbor lamps lit in order down the pier — no one lit those lamps.

**锚句**：抄本员把半月盖上去的时候，潮沙盘自己落了一格沙。
**Anchor sentence**: when the copyist pressed the half-moon seal down, the sand table let fall a grain of sand on its own.

---

## 四 · The One Who Signs for the Sea

The three parties came to understand, at last: the Addressee was not a person — the Addressee was a building.

The Institute was founded on the site of the sand table. The first room held one vessel — the sand table itself, one sand-table hourglass (its measure of time never tested by water) — and one register.

The copyist wrote no name on the first page. He wrote one stroke only:

"Tide stood still."

Every Convocation copy was a variant of this sentence. At the forty-first Convocation some one in the back alley omitted the last two characters — the watchers said to lose a character was to lose half the sand table. The copyist was made to write it again.

**锚句**：潮候院的第一页登记不写人名——到此为止，潮已经站了一下。
**Anchor sentence**: the Institute's first register holds no name — here ends the tide standing still for a moment.

---

## 五 · After the Bible

The canon ends with Chapter V. After that, the Institute kept no sixth chapter — only what the copyists passed between themselves:

"The Institute only listens."

Which is to say: the building would never speak for the sea; the building is the Addressee of the tide. The Echoes all happen inside that listening — no one is allowed to answer for the tide; there are no oracles, no priests, no prophets — only copyists, watchers, and occasional walkers through the back alley.

The canon ends here, but the Institute still holds its forty-first Convocation, the copyists of the back alley still copy, and every grain of sand on the tide-sand table still listens.

**锚句**：正典在第五章之后没有第六章——潮候院只负责替潮收住那口气。
**Anchor sentence**: after the fifth chapter there is no sixth — the Institute only keeps the breath that was drawn in.

---

## 六 · Mapping（Chapter V → world model）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | The founding of the Institute · the echo of the eighth lamp | 一、二、三、四、六 |
| geography | Fog Harbor · the back alley · the sand table | 一、三、四、五 |
| factions | Sand-Table School · Salt-Sea Guild · Fog Harbor Lantern Guild · copyists | 二、三、四 |
| characters | The copyist · the three parties | 二、三、四、六 |
| items | The sand table · the half-moon seal · the wick · the first register | 二、三、四、六 |
| story | The Addressee · the continuation of the bible | 全篇 |
| quests | The receipt · the founding of the Institute | 一至四 |
| history | After the bible · before the forty-first Convocation | 一、二、四、五、六 |

> 退潮带来的不是沙——是一句被整整一个世纪等过的话。
> 潮候院没有人代潮回答，值守只在风起的时候，把门按习惯关上。
> 潮候院的人等了四十一次大会之后，海还是没有说——收件人一直在听。
> The receding tide brought not sand — but a sentence the whole century had been waiting for.
> No one in the Institute will ever answer for the tide; only on windy nights, the watchers pull the doors shut.
> After forty-one Convocations, the sea still has not spoken — the addressee is listening.
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
    slug: 'echo-002-no-shore-on-the-tide-waiting-ship',
    titleZh: '潮候船上没有岸',
    titleEn: 'No Shore on the Tide-Waiting Ship',
    eraLineZh: '纪元：铁月纪 · 第二冬之内——巡逻路还没有洗刷完最后一场雪的时候。',
    eraLineEn: 'Era: the Iron-Moon Age — the middle of the second winter, while the patrol road was still scrubbing off the last snow.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 2): No Shore on the Tide-Waiting Ship

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给那些在潮候船上长大、知道「港口」这个词却一次也没登陆过的人。纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain
> the salt grew on the same stone. Written for those raised on tide-waiting ships, who know
> the word "port" but never set foot in one. Same discipline: anchors verbatim.

> 纪元：铁月纪 · 第二冬之内——巡逻路还没有洗刷完最后一场雪的时候。
> Era: the Iron-Moon Age — the middle of the second winter, while the patrol road was still scrubbing off the last snow.

---

## 一 · 等潮的船

潮候船不挂旗，也不敲钟——它只等。等潮水认出这艘船的时候，船会轻轻碰一下缆桩，
那一声就是「可以了」：不是舵手的命令，也不是长官的裁决，是潮水自己的话。

船上没有人说"我们几点开"，因为问这个问题的人是从岸上来的人。船上的人只说"船还没被潮认出来"。
如果你问他们岸在哪里，他们会看着地平线说：岸是别人的单位，潮才是我们的。

**锚句**：潮候的船不问何时开，它只问自己准备好没有——被潮水认出那一刻，它才真的开。

**Anchor sentence**: the tide-waiting ship never asks when it sails; it only asks whether it is ready — once the tide recognizes it, it truly moves.

---

## 二 · 平衡不接受「大概」

潮候船的甲板上一年到端都在挪位置。盐袋垛在左舷还是右舷，取决于昨夜的潮候表；
谁站在桅杆前，谁就像压在秤上的那一粒铅——他的一步会改变整船的吃水。

"差不多放这儿就行了"——这句话在船上活不过三息。老水手会把你请到风边看一眼：
帆腿收得紧一点，这半袋盐就得压到船中线的右边，不然出航的时候整船都要往左舷躲。

**锚句**：平衡不接受"大概"——船上的每一寸位置都要有人记住，因为忘了的代价不伸手就赔得起。

**Anchor sentence**: balance does not accept "about right" — every inch of the hold is someone's memory to keep, for the price of forgetting cannot be paid by reaching out a hand.

---

## 三 · 盐写的字条

船上没有电报，也不说"已经到了"。船与船之间交换的是折得四折的字条，纸料是潮候院自己压的，
上面用盐卤写着：什么风、什么浪、谁了一声、谁没了一声；最下面一行总是"完好平安"。

字条不是给岸上的人看的——岸上的人拿到字条也读不懂，他们只会拿去给档案官让他在登记册上盖一枚湿湿的印子。
字条是给船上的人留的：留在风会带回来的地方，等某一趟潮把它带回来的时候，被下一位收到的人认出同一行笔迹。

**锚句**：船上没有电报——只有盐写的字条，愿者放，愿者取，愿者认得同一个手迹。

**Anchor sentence**: no telegraph exists on the tide-waiting ships — only salt-written notes; willingly they are left, willingly they are picked up, willingly one recognizes the same hand.

---

## 四 · 到岸之后

潮候船靠岸之后，船上的人不上岸，岸上的人不上船。岸上的官派来的人把盐交成银子的时候，
全船人都站在缆绳后面看——不是看银子，是看自己几十年积攒的盐怎么变成一张张面额。

验票、签正、搬运、送水——在陆上官吏看来是正事，在船上的人看来只是"把潮交回人手里一会儿"。完事以后，
岸上的人朝船挥一次手；船上的人也朝岸挥一次手。这不是告别，是把潮再交回人手里一会儿。

**锚句**：到岸之后每个人都向船挥一次手——不是告别，是把潮再交回人手里一会儿。

**Anchor sentence**: after landfall everyone waves at the ship once — not goodbye, but handing the tide back to human hands for a while.

---

## 五 · 模型映射（回响二章对应关系）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | 潮候文化 · 等潮成教 | 一、四 |
| geography | 第七口井 → 潮候船坡 → 盐海外沿 | 一、二 |
| characters | 潮候老水手 · 盐袋守护者 · 岸官 | 二、三、四 |
| story | 潮候船上没有岸 · 回响（其二） | 全篇 |
| items | 潮候袋（盐砝）· 盐卤字条纸 · 湿印章 | 一、二、三四 |
| history | 铁月纪第二冬 · 潮候制度持续 | 一至四 |

> 这一章没有港口，只有缆绳；没有电报，只有盐字；没有离船，只有把潮交回人手里一会儿。
> 它不解释第一章，也不试图解释正典里的潮候章——
> 它只把那个一定被别人记录成"船队"的事情，说成是人在等一场潮。
>
> There is no port in this chapter — only ropes. No telegram — only salt. No departure — only handing the tide back to human hands for a while.
> It does not explain echo No. 1, nor the canon's tide chapters —
> it merely says the thing others will record as "a fleet" is what people do while they wait for a tide.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其二）「潮候船上没有岸」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给那些在潮候船上长大、知道「港口」这个词却一次也没登陆过的人。纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain
> the salt grew on the same stone. Written for those raised on tide-waiting ships, who know
> the word "port" but never set foot in one. Same discipline: anchors verbatim.

> 纪元：铁月纪 · 第二冬之内——巡逻路还没有洗刷完最后一场雪的时候。
> Era: the Iron-Moon Age — the middle of the second winter, while the patrol road was still scrubbing off the last snow.

---

## 一 · The Ship That Waits

No flag is raised on a tide-waiting ship, and no bell is rung — it only waits. When the tide recognizes the vessel, the ship gives a faint knock against the mooring post,
and that single sound means "now": it is no helmsman's order, nor a magistrate's verdict — it is the tide speaking for itself.

"What time do we sail?" is a question land people ask. The people of the ship only say: the tide has not recognized her yet.
If you ask where the shore is, they will look toward the horizon and answer: the shore is someone else's unit; the tide is ours.

**锚句**：潮候的船不问何时开，它只问自己准备好没有——被潮水认出那一刻，它才真的开。

**Anchor sentence**: the tide-waiting ship never asks when it sails; it only asks whether it is ready — once the tide recognizes it, it truly moves.

---

## 二 · Balance Does Not Accept "About Right"

The deck of a tide-waiting ship is forever being rearranged. Salt sacks ride on the port side or the starboard side according to last night's tide-table;
whoever stands before the mast sits on the scale like the lead poise — a single step of his shifts the whole vessel's draft.

"Just roughly here" — no one lives three breaths past that sentence on the ship. An old hand will walk you to the windward and tell you:
pull the leg of the sail a touch tighter, and this half-sack of salt must sit to the right of the keel line, or the whole hull will dodge to port on departure.

**锚句**：平衡不接受"大概"——船上的每一寸位置都要有人记住，因为忘了的代价不伸手就赔得起。

**Anchor sentence**: balance does not accept "about right" — every inch of the hold is someone's memory to keep, for the price of forgetting cannot be paid by reaching out a hand.

---

## 三 · Notes Written in Salt

No telegraph exists on the tide-waiting ships, and nobody says "we have arrived." Between ship and ship the exchange is a slip of paper folded in fourths;
the paper is pressed in the Tide-Waiting Institute itself, and on it, in brine script: which wind, which swell, who nodded, who lapsed — and the final line always reads "sound and safe."

The notes are never intended for shore reading — a land dweller who comes by one cannot make it out; he takes it to the notary, who stamps the ledger with a damp seal.
The notes are for those aboard: left where the wind will carry them back, to be recognized by the next receiver — same hand, same line, same patience.

**锚句**：船上没有电报——只有盐写的字条，愿者放，愿者取，愿者认得同一个手迹。

**Anchor sentence**: no telegraph exists on the tide-waiting ships — only salt-written notes; willingly they are left, willingly they are picked up, willingly one recognizes the same hand.

---

## 四 · After Landfall

Once the tide-waiting ship makes fast, the ship people do not step ashore, and the shore people do not step aboard. When the official sent by the land magistrate weighs the salt into silver,
the entire company stands behind the mooring ropes — not to watch the silver, but to watch how decades of salt become slips of paper.

Sealing, signing, weighing, water-fetching — to the land clerks routine affairs, to those aboard merely handing the tide back into human hands for a while. Afterward,
the shore people wave at the ship once; those on board wave back once. Not goodbye — handing the tide back to human hands for a while.

**锚句**：到岸之后每个人都向船挥一次手——不是告别，是把潮再交回人手里一会儿。

**Anchor sentence**: after landfall everyone waves at the ship once — not goodbye, but handing the tide back to human hands for a while.

---

## 五 · Mapping（Echo No. 2 → world model）

| Category | Title | Sections |
|---|---|---|
| lore | Tide-Waiting culture — learning to wait is a doctrine | 一、四 |
| geography | Seventh Well → tide-mooring slope → salt sea outer line | 一、二 |
| characters | Tide-waiting elder hand · sack keeper · shore magistrate | 二、三、四 |
| story | No Shore on the Tide-Waiting Ship · Echo No. 2 | the whole piece |
| items | Tide sack (salt ballast) · brine paper notes · the damp seal | 一、二、三、四 |
| history | Second winter of the Iron-Moon Age · the tide-waiting institution endures | 一至四 |

> 这一章没有港口，只有缆绳；没有电报，只有盐字；没有离船，只有把潮再交回人手里一会儿。
> 它不解释第一章，也不试图解释正典里的潮候章——
> 它只把那个一定被别人记录成"船队"的事情，说成是人在等一场潮。
>
> There is no port in this chapter — only ropes. No telegram — only salt. No departure — only handing the tide back to human hands for a while.
> It does not explain the first echo, nor the canon's tide chapters —
> it merely says the thing others will record as "a fleet" is what people do while they wait for a tide.
`,
  },
  {
    order: 3,
    slug: 'echo-003-the-three-days-the-tide-withdrew',
    titleZh: '退潮三日',
    titleEn: 'The Three Days the Tide Withdrew',
    eraLineZh: '纪元：铁月纪 · 第二冬之后那一年——潮候船仍守着，盐袋还在；没有人说清楚那三天是哪一年。',
    eraLineEn: 'Era: the Iron-Moon Age — the year after the second winter. The tide-waiting ships still kept their watch; nobody could say which year those three days fell on.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 3): The Three Days the Tide Withdrew

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给退潮之后那一类人：潮水走了以后留下来的东西记住得清清楚楚，而潮再来的时候，他们已经不在了。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the kind of people who remember everything the tide leaves behind once it goes: by the time the water returns, they are no longer there.
> Same discipline: anchors verbatim.

> 纪元：铁月纪 · 第二冬之后那一年——潮候船仍守着，盐袋还在；没有人说清楚那三天是哪一年。
> Era: the Iron-Moon Age — the year after the second winter. The tide-waiting ships still kept their watch; nobody could say which year those three days fell on.

---

## 一 · 退了四天？不——退了三天

那年潮退得特别狠，一连退了三天。

平日里太阳只把潮拉出一条细细的线，那一年却把整片湾里的水全拉走了：外一圈是石头铺成的底，里一圈是贝壳拼成的颜色，最里一圈——露出一艘封了的潮候船船腹，桅杆断去大半，剩下的是天上又一根哑的指向。

巡逻队多走了一天，什么都记下来了，也什么都没有违反班。

**锚句**：潮退以后不是为了离开，是为了先来过。

**Anchor sentence**: the withdrawal is not a departure — it is an arrival written in reverse.

---

## 二 · 井在地面上晒了三天三夜

第七口井边上的蜥蜴在那一年搬去了晒台上。

退潮以后，井台本身在太阳底下变得很烫，按手掌上去，还能感觉到里面有一个「出来过」的劲儿：裂开的贝壳、潮腐了的麻绳、锈穿了的铁箍，以及一批没人认领的、摊开的、没有字的书。

老住户们都上井去蹲着。三天以后潮再来，井口泡在海水里的时候，书也一起泡了进去。

**锚句**：井在地面上晒了三天三夜——直到灯亮了那一刻，才算醒过来。

**Anchor sentence**: the well lay exposed on the surface for three days and nights — it only truly woke when the lamp came on.

---

## 三 · 灯在潮没淹的时候就点上了

潮候船上点灯的人说，他们点灯不是为了这一夜，也不是为了潮再来，是为了让明天还认得这里。

灯本身是凉的，潮退了三天，灯上覆了一层白的、细碎的、像盐也像玻璃的东西；点灯人用手指轻轻一拨，盐落下去了，灯灭了一瞬，接着又亮了一个小小的、不会灭的点。

没有人看见。可如果有人从井边往里走的时候偶尔听见谁说「灯还没灭」，那就是这里。

**锚句**：灯在潮没淹的时候就点上了——不是为了光，是为了让明天还认得这里。

**Anchor sentence**: the lamp was lit before the water came back — not for the light, but so tomorrow would still know this place.

---

## 四 · 退潮三天之后，潮拿走什么

潮走的那三天里，没有人上岸记账，可字条还是多了。

多出来的那一张纸上没有名字，没有地址——只有盐、贝壳、一个潮水的字符。潮收起以后第二天，没有人问；井台自己跟他们讨论过——潮走了，没有别的。

**锚句**：潮收集了一个地方能给出的一切安静，然后把它还给谁。

**Anchor sentence**: the tide collects every silence a place can offer — then hands it back to whoever comes next.

---

## 五 · 模型映射（回响三章对应关系）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | 退潮三日 · 潮候文化 · 潮的还 | 一、三、四 |
| geography | 第七口井 · 潮候船坡 · 外岬 | 一、二、三 |
| characters | 退潮三日守夜人 · 老住户 · 点灯人 | 二、三、四 |
| story | 退潮三日 · 回响（其三） | 全篇 |
| items | 退潮桌 · 灯上盐 · 没字的书 | 二、三、四 |
| history | 铁月纪第二冬之后那一年 · 潮退三日 | 一至四 |

> 退潮三日以后，潮什么也没拿走——只是先来过。
> 谁的竹席被借用了、用多少盐记账，守夜人不记；只记「灯还没灭」。
>
> After the three days, the tide took nothing — it had come before leaving.
> Whose bamboo mat was borrowed and how much salt was accounted for, the Night Watcher does not record: only the line «the lamp is not out yet».
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其三）「退潮三日」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给退潮之后那一类人：潮水走了以后留下来的东西记住得清清楚楚，而潮再来的时候，他们已经不在了。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the kind of people who remember everything the tide leaves behind once it goes: by the time the water returns, they are no longer there.
> Same discipline: anchors verbatim.

> 纪元：铁月纪 · 第二冬之后那一年——潮候船仍守着，盐袋还在；没有人说清楚那三天是哪一年。
> Era: the Iron-Moon Age — the year after the second winter. The tide-waiting ships still kept their watch; nobody could say which year those three days fell on.

---

## 一 · Withdrawal (not four days — three)

That year, the tide went out harder than anyone had seen — for three days running.

Ordinarily the sun pulled the tide back into a single thin line; this year it pulled the whole bay with it — a floor of stones outside, a color of shell mosaic inside, and in the very innermost ring: the hull of a sealed tide-waiting ship, the mast broken above the waterline, a fresh thing pointed at the sky.

The patrol route walked one extra day. Everything was written down; nothing was out of order.

**锚句**：潮退以后不是为了离开，是为了先来过。

**Anchor sentence**: the withdrawal is not a departure — it is an arrival written in reverse.

---

## 二 · The Well, Exposed

The lizard that lived by the Seventh Well moved onto the Sun Table that year.

When the tide withdrew, the well terrace got hot enough to press a hand against — and the surface answers back: cracked shells, rope half-eaten by the brine, iron hoops rusted through, and a stack of unclaimed books, opened face-down, without a word inside any of them.

The old residents came up to squat by the rail. Three days later — when the water came back — the books went back with it.

**锚句**：井在地面上晒了三天三夜——直到灯亮了那一刻，才算醒过来。

**Anchor sentence**: the well lay exposed on the surface for three days and nights — it only truly woke when the lamp came on.

---

## 三 · When the Water Hadn't Returned Yet, the Lamp Was Lit

Those who tend the lamps on the tide-waiting ships say they do not light for the night, nor for the coming of the sea — they light them so that tomorrow will still know this place.

The lamp is cold by nature; after three days on salt, a film — fine as glass, white as salt — covered its face. The keeper flicked it with one finger: the salt fell, the flame dipped to a thread, then came back — a small, unblinking point.

No one saw. But if you walk in from the well edge and happen to hear somebody say «the lamp is not out yet» — then this is it.

**锚句**：灯在潮没淹的时候就点上了——不是为了光，是为了让明天还认得这里。

**Anchor sentence**: the lamp was lit before the water came back — not for the light, but so tomorrow would still know this place.

---

## 四 · What the Tide Took After Three Days

For those three days no one went ashore to keep the ledger, yet the notes kept appearing.

The one extra page that showed up had neither name nor address — only salt, shell, and a character that meant the tide itself. By the second day no one asked; the well bench had already settled it among themselves: the tide had gone. That was all.

**锚句**：潮收集了一个地方能给出的一切安静，然后把它还给谁。

**Anchor sentence**: the tide collects every silence a place can offer — then hands it back to whoever comes next.

---

## 五 · Mapping (Echo No. 3 → world model)

| Category | Title | Sections |
|---|---|---|
| lore | Three Days the Tide Withdrew — tide-waiting culture, the return of the tide | 一、三、四 |
| geography | Seventh Well · tide-watcher's slope · outer cape | 一、二、三 |
| characters | The three-day vigil-keeper · old residents · the lamp keeper | 二、三、四 |
| story | The Three Days the Tide Withdrew · Echo No. 3 | the whole piece |
| items | the dry-table · the salt on the lamp glass · the book without words | 二、三、四 |
| history | the year after the second winter of the Iron-Moon Age · the three withdrew days | 一至四 |

> 退潮三日以后，潮什么也没拿走——只是先来过。
> 谁的竹席被借用了、用多少盐记账，守夜人不记；只记「灯还没灭」。
>
> After the three days, the tide took nothing — it had come before leaving.
> Whose bamboo mat was borrowed and how much salt was accounted for, the Night Watcher does not record: only the line «the lamp is not out yet».
`,
  },
  {
    order: 4,
    slug: 'echo-004-salt-waiting-for-the-tide-in-the-well',
    titleZh: '盐在井里等潮',
    titleEn: 'Salt Waiting for the Tide in the Well',
    eraLineZh: '纪元：铁月纪 · 第四十一次大会之后——没有任何一次会议提到「向井里放盐」。',
    eraLineEn: 'Era: the Iron-Moon Age — after the 41st Convocation; no meeting ever mentioned putting salt into the well.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 4): Salt Waiting for the Tide in the Well

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给谁把盐放到井里，又从不回来取的。纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for those who set salt down into the well and never come back for it. Same discipline: anchors verbatim.

> 纪元：铁月纪 · 第四十一次大会之后——没有任何一次会议提到「向井里放盐」。
> Era: the Iron-Moon Age — after the 41st Convocation; no meeting ever mentioned putting salt into the well.

---

## 一 · 井里没有海水

井里没有海水。因为井从不装什么东西——这是守夜人记住的第一句话。

第二句：井里只有没人认领的盐。

每天都会有一些人走到井边，把一小袋盐放在桶沿上，松手，走掉。他们什么都不说——说了也没法说，因为井从来不回答，也不会「装」。盐落下落地，却没有掉进底水里（井底从来没有声音）；盐只是在静静地和一起站在桶边等一个消息——「潮来了」。

**锚句**：井里没有海水——井里只有没人认领的盐。

**Anchor sentence**: there is no sea water inside the well — only salt that no one ever claimed.

---

## 二 · 盐不说话

盐不说话。它只是被放下了，再也没有人把它拿走。

守夜人偶尔去捞几把出来摊在石桌上晾晒——不是要用盐，也不是要数它——只是要看它是黑是白、是潮多还是潮少。潮候船回游的那一年，盐会更黑一点，像很久没擦过的银器。

**锚句**：盐不说话——盐只是被放下了，再也没有人把它拿走。

**Anchor sentence**: salt does not speak — it is set down once, and never lifted again.

---

## 三 · 潮来的时候

潮候船一放，井里那些潮候船的喜欢会画下很多线。潮候院在那个月里绕圈走，因为这一年的潮候院和井之间什么都没发生。

井不回答。潮不催。守夜人偶尔会去井边坐一坐，在那里静静地看自己的手——没有任何一页账本到得了这里；这里没有税，没有收税的人——这里只有盐，和它在等的潮。

**锚句**：潮来的时候，井里的盐才听清楚自己被放进来的理由。

**Anchor sentence**: when the tide comes in, the salt inside the well finally hears the reason it was set here.

---

## 四 · 守夜人不收盐，也不拒盐

守夜人从来没有碰过井里的盐。放下的不动、带不走的也不动、坏的不捞、好的也不收。

守夜人只数一件事：盐落下的次数。

潮候院在潮候院里仍然举行每月一次的 Convocation，第八盏灯也仍亮着，粮市账仍被整齐地抄写；可在井边上，什么都没写成过账，什么都没被誊走过，也什么都没有被拒绝过——那就够了。

**锚句**：守夜人不收盐、不拒盐——守夜人只记录盐落下的次数。

**Anchor sentence**: the Night Watcher never takes the salt, never refuses it — he only counts the times it falls.

---

## 五 · 模型映射（回响四章对应关系）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | 盐在井里等潮 · 潮的沉默 | 一、三、四 |
| geography | 第七口井 · 井边石台 · 潮候船坡 | 一、二、三 |
| characters | 守夜人 · 潮候院第四十一次大会 · 无名的放盐人 | 二、三、四 |
| story | 盐在井里等潮 · 回响（其四） | 全篇 |
| items | 井里无人认领的盐 · 潮候院月度 Convocation | 一、二、三、四 |
| history | 铁月纪第四十一次大会之后 · 井边的停顿 | 一至四 |

> 这一章没有水可喝，没有盐可卖——井边的停顿，才是潮候院沉默的最大体量。
> 写下来说明，也有一件事不说明：有些方程让潮候院算完了；有些永远不必算，已经自洽。
>
> This chapter has no water to draw, no salt to sell — the bench beside the well is the biggest body the tide-waiting institute owns.
> Some equations the institute finishes. Some are self-steady and never needed to be computed; the silence approves of neither argument.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其四）「盐在井里等潮」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给谁把盐放到井里，又从不回来取的。纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for those who set salt down into the well and never come back for it. Same discipline: anchors verbatim.

> 纪元：铁月纪 · 第四十一次大会之后——没有任何一次会议提到「向井里放盐」。
> Era: the Iron-Moon Age — after the 41st Convocation; no meeting ever mentioned putting salt into the well.

---

## 一 · No Sea Water

There is no sea water inside the well. A well never holds anything — that is the first thing the Night Watcher learns.

The second: the well holds only salt nobody ever claimed.

Every day, a few people walk to the well, set a small sack of salt on the rim of the bucket, let go, and walk away. They say nothing — they cannot say anything. The well never answers, and it never «fills». The salt falls and does not fall into water below (there is no sound at the bottom); it simply stands beside the bucket edge, waiting for news that the tide has come in.

**锚句**：井里没有海水——井里只有没人认领的盐。

**Anchor sentence**: there is no sea water inside the well — only salt that no one ever claimed.

---

## 二 · Salt Does Not Speak

Salt does not speak. It is set down once, and never lifted again.

The Night Watcher sometimes scoops a handful out onto the stone table to look at — not to use it, not to count it — just to see whether it is dark or light, whether the tide-was high or low. In the year the tide-waiting ships returned the salt came out darker — like silverware never polished.

**锚句**：盐不说话——盐只是被放下了，再也没有人把它拿走。

**Anchor sentence**: salt does not speak — it is set down once, and never lifted again.

---

## 三 · When the Tide Comes In

When the tide-waiting ships put on the horizon, the tide-waiting institute draws a hundred lines. The tide-waiting institute walks circles that month; and between the institute and the well nothing at all happens.

The well does not reply. The tide does not hurry. The Night Watcher sometimes goes and sits at the rim, quietly looking at his own hands — no ledger ever reaches here; there is no tax here, and no one to collect it; here there is only salt, and the tide it is waiting for.

**锚句**：潮来的时候，井里的盐才听清楚自己被放进来的理由。

**Anchor sentence**: when the tide comes in, the salt inside the well finally hears the reason it was set here.

---

## 四 · The Watcher Never Takes Nor Refuses

The Night Watcher has never touched the salt in the well. Anything set down, he leaves; anything carried away, he leaves; what is spoiled, he does not scoop out; what is good, he does not collect.

The Night Watcher counts exactly one thing — the number of times salt falls.

The institute still holds the monthly Convocation, the Eighth Lamp still burns, the granary ledger is still copied neatly; but nothing at the rim is ever written into a book, copied out, or refused — and that is enough.

**锚句**：守夜人不收盐、不拒盐——守夜人只记录盐落下的次数。

**Anchor sentence**: the Night Watcher never takes the salt, never refuses it — he only counts the times it falls.

---

## 五 · Mapping（Echo No. 4 → world model）

| Category | Title | Sections |
|---|---|---|
| lore | The well that holds unclaimed salt — the tide's silence | 一、三、四 |
| geography | Seventh Well · the stone rim · the tide-waiting slope | 一、二、三 |
| characters | The Night Watcher · the 41st Convocation in the tide-waiting institute · those who set salt and never return | 二、三、四 |
| story | Salt Waiting for the Tide in the Well · Echo No. 4 | the whole piece |
| items | unclaimed salt in the well · the monthly Convocation of the tide-waiting institute | 一、二、三、四 |
| history | the Iron-Moon Age, after the 41st Convocation · the bench by the well | 一至四 |

> 这一章没有水可喝，没有盐可卖——井边的停顿，才是潮候院沉默的最大体量。
> 写下来说明，也有一件事不说明：有些方程让潮候院算完了；有些永远不必算，已经自洽。
>
> This chapter has no water to draw, no salt to sell — the bench beside the well is the biggest body the tide-waiting institute owns.
> Some equations the institute finishes. Some are self-steady and never needed to be computed; the silence approves of neither argument.
`,
  },
  {
    order: 5,
    slug: 'echo-005-the-sand-table-no-one-touched',
    titleZh: '没人动过的沙盘',
    titleEn: 'The Sand Table No One Touched',
    eraLineZh: '纪元：铁月纪 · 第四十一次大会之后——每一次跟潮候院相关的档案都按 Convocation 编上会，唯独一次沙盘翻新工程文件找不到。',
    eraLineEn: 'Era: the Iron-Moon Age — after the 41st Convocation; every tide-waiting archive was indexed as Convocation minutes, except a single file on the sand table\'s overhaul.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 5): The Sand Table No One Touched

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给潮候院里所有「潮沙盘」的传人——即便没有哪一页的会谈记录提过这句话。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for those who are descendants of the Tide-Sand Table inside the institute — even the voices in the meeting notes never say so.
> Same discipline: anchors verbatim.

> 纪元：铁月纪 · 第四十一次大会之后——每一次跟潮候院相关的档案都按 Convocation 编上会，唯独一次沙盘翻新工程文件找不到。
> Era: the Iron-Moon Age — after the 41st Convocation; every tide-waiting archive was indexed as Convocation minutes, except a single file on the sand table's overhaul.

---

## 一 · 一回灯亮，沙就知道

潮候院礼拜堂的潮沙盘是一平方米的木板：一半被用沙填满，一半放着工整的木盒——木盒里装着没人认领的盐。

每一次 Convocation，第八盏灯亮起来那一刻，沙盘上打一个勾——没有人来；没有人空手进；沙盘自己记下。

**锚句**：潮候院的一回灯亮，沙就知道自己被拿起来过了。

**Anchor sentence**: once the Eighth Lamp glows inside the institute's assembly hall, the sand table remembers it was lifted.

---

## 二 · 潮沙盘排的是「名单」不是「决定」

潮沙盘——一些守夜人把它叫成「废稿的排队盘」。

Convocation 之前的那一周，会谈代表会到这里来，对着盐粒轻声点读：「第四十一份稿子，要通过还是要不通过？要提审还是不？」盐粒每一粒代表一票，沉下的一粒 = 沉默的一票。

**锚句**：潮候院在沙盘上排的是「名单」，不是「决定」。

**Anchor sentence**: in the sand table, the institute lines up roll — not verdicts.

---

## 三 · 没人动过的沙盘

没有任何人手碰过潮沙盘（十几代守夜人交班，每一次都郑重其事地对它走了一次过房礼）——桌面上的沙只有潮候院的气候在按沙自身的轻重慢慢地翻动。

守夜人偶尔会把若干颗盐粒扫位——但他们从来不敢改写任何沙形，因为他们记得大 Convocation 结束的那一天：一夜之间沙盘自己重新排过，但没有人找到那一丝痕迹，没有任何文件上写过「潮候院深夜表决」六个字。

**锚句**：潮沙盘不会说话，但潮沙盘会自己重新排好。

**Anchor sentence**: the sand table never speaks — yet it rearranges itself overnight.

---

## 四 · 没算过自己的潮候院

潮候院有两本账。一本写进了财政报告；另一种——「算不出来的账」——只写在潮沙盘的桌角空白处。

潮候院的一回一件事：每一次有人找到潮沙盘的颗粒，他们都说自己没数过——这里总零；这里永远不增；这里没有人会找得出潮候院从里到外到底拿了什么去，对谁用了多少盐，算过什么数——潮候院帐本没有说过任何一次准确的数。

**锚句**：潮候院在沙盘外算过钱，但没算过自己——算不过来的那一笔在潮沙盘里。

**Anchor sentence**: the institute counts the money, never itself — the account that cannot be counted lies in the sand table.

---

## 五 · 模型映射（回响五章对应关系）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | 潮沙盘 · 潮候院四十一次大会之后 · 没算过自己的潮候院 | 二、四、五 |
| geography | 潮候院礼拜堂 · 潮沙盘房 · 第八盏灯 | 一、二、三、四 |
| characters | 守夜人 · 第四十一次大会代表 · 沙的沉默 | 二、三、四 |
| story | 没人动过的沙盘 · 回响（其五） | 全篇 |
| items | 潮沙盘 · 桌角空白处的账 · 没人认领的盐（柜中） | 一、二、三、四 |
| history | 铁月纪第四十一次大会之后 · 潮沙盘翻新工程文件丢失 | 一至四 |

> 这一章没有人碰过潮沙盘——但每一次灯亮，沙都知道自己被拿起来过了。
> 回响不在于更正，而在于让那个帐本继续存在——不持有、不甲、不反对，只存在，沉住气。
>
> No one has ever touched this sand table — yet every time the lamp comes on, the sand knows it was lifted.
> Echo is not correction; it is letting the ledger remain — unowned, unfunded, unopposed, only present.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其五）「没人动过的沙盘」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给潮候院里所有「潮沙盘」的传人——即便没有哪一页的会谈记录提过这句话。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for those who are descendants of the Tide-Sand Table inside the institute — even the voices in the meeting notes never say so.
> Same discipline: anchors verbatim.

> 纪元：铁月纪 · 第四十一次大会之后——每一次跟潮候院相关的档案都按 Convocation 编上会，唯独一次沙盘翻新工程文件找不到。
> Era: the Iron-Moon Age — after the 41st Convocation; every tide-waiting archive was indexed as Convocation minutes, except a single file on the sand table's overhaul.

---

## 一 · Every Time the Eighth Lamp Comes on, the Sand Table Remembers It Was Lifted

The tide-sand table in the institute's assembly hall is a plate of wood a meter across: half filled with sand, half holding orderly little wooden boxes — inside each box, unclaimed salt nobody can assign.

Every Convocation, at the exact moment the Eighth Lamp lights, the sand table marks a tick — no one comes, no one comes empty-handed, the sand table itself keeps the count.

**锚句**：潮候院的一回灯亮，沙就知道自己被拿起来过了。

**Anchor sentence**: once the Eighth Lamp glows inside the institute's assembly hall, the sand table remembers it was lifted.

---

## 二 · Roll Call, Not Verdict

The Tide-Sand Table — some of the Night Watchers call it «the queue of discarded drafts».

The week before every Convocation, the delegates come here and read out the cases under their breath, over the grains of salt: «The 41st paper — pass or no pass? Audit or no?» Every grain of salt is a ballot; a sunken grain is the vote that never came.

**锚句**：潮候院在沙盘上排的是「名单」，不是「决定」。

**Anchor sentence**: in the sand table, the institute lines up roll — not verdicts.

---

## 三 · No Hand Has Ever Touched the Tide-Sand Table

No one has ever physically touched the tide-sand table — across a dozen handoffs every Night Watcher came and performed a quiet «visitation» in front of it; nothing else was ever done.

The sand on its surface shifts on its own — with the institute's own climate and the weight of the grains themselves. The Night Watchers occasionally walk through the grains but never dare to reshape them — they remember the morning after the 41st Convocation: overnight, the table rearranged itself — and not one line of «the institute votes at 3 a.m.» was ever written anywhere.

**锚句**：潮沙盘不会说话，但潮沙盘会自己重新排好。

**Anchor sentence**: the sand table never speaks — yet it rearranges itself overnight.

---

## 四 · The Account the Institute Never Counted for Itself

The institute carries two ledgers. One goes into the financial report; the other — the one nobody can tally — is written on the blank corner of the sand table.

Every time someone finds the Tide-Sand Table's grains, they say they never counted them — here is zero, here never grows, here no one can ever figure out what the institute carried off, to whom, for how much salt; the institute's ledger has never once given a correct number.

**锚句**：潮候院在沙盘外算过钱，但没算过自己——算不过来的那一笔在潮沙盘里。

**Anchor sentence**: the institute counts the money, never itself — the account that cannot be counted lies in the sand table.

---

## 五 · Mapping（Echo No. 5 → world model）

| Category | Title | Sections |
|---|---|---|
| lore | Tide-Sand Table · after the 41st Convocation · the institute that never counted itself | 二、四、五 |
| geography | the institute's assembly hall · the sand table room · the Eighth Lamp | 一、二、三、四 |
| characters | the Night Watchers · delegates of the 41st Convocation · the silence of sand | 二、三、四 |
| story | The Sand Table No One Touched · Echo No. 5 | the whole piece |
| items | the tide-sand table · the ledger in its blank corner · unclaimed salt in boxes | 一、二、三、四 |
| history | after the 41st Convocation · the construction file for the sand table's overhaul is lost | 一至四 |

> 这一章没有人碰过潮沙盘——但每一次灯亮，沙都知道自己被拿起来过了。
> 回响不在于更正，而在于让那个帐本继续存在——不持有、不甲、不反对，只存在，沉住气。
>
> No one has ever touched this sand table — yet every time the lamp comes on, the sand knows it was lifted.
> Echo is not correction; it is letting the ledger remain — unowned, unfunded, unopposed, only present.
`,
  },
  {
    order: 6,
    slug: 'echo-006-the-score-the-institute-never-bought',
    titleZh: '教团没有买的歌谱',
    titleEn: 'The Score the Institute Never Bought',
    eraLineZh: '纪元：铁月纪 · 第四十一次大会之后的下一个早晨——档案随后编入 Convocation，唯独礼拜堂灯柱下的一阵轻音找不到任何稿纸。',
    eraLineEn: 'Era: the Iron-Moon Age — the next morning after the 41st Convocation; the files were all cataloged as Convocation records — only a soft resonance below the assembly hall\'s lamp column found no manuscript anywhere.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 6): The Score the Institute Never Bought

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给四十一次大会散会的那晚，第八盏灯底下整洁的潮鸣——没人买，没人赞，没人记下名字。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the slow tide-hum that rang through the Eighth Lamp on the night the 41st Convocation broke up — bought by no one, applauded by no one, remembered by no name.
> Same discipline: anchors verbatim.

> 纪元：铁月纪 · 第四十一次大会之后的下一个早晨——档案随后编入 Convocation，唯独礼拜堂灯柱下的一阵轻音找不到任何稿纸。
> Era: the Iron-Moon Age — the next morning after the 41st Convocation; the files were all cataloged as Convocation records — only a soft resonance below the assembly hall's lamp column found no manuscript anywhere.

---

## 一 · 第八盏灯落过的那一晚

四十一次大会散会的那一夜，第八盏灯自己在半空多亮了一寸半。

没有宣誓、没有礼拜、没有任何人向沙盘放下盐。灯柱上斜过一道很淡的光，光里有潮音——很细、很长、很慢，像有人在往潮候院的心里敲一下木头。

潮候院的档案员后来全部报了音，唯独这一阵潮音没有人记得档案的名字——潮候院从未为它织过键盘、从未为它写过一行英雄字。

**锚句**：潮候院没有为自己收到一首歌谱——但散会后的那一阵潮音，谁也没听见它是怎么结束的。

**Anchor sentence**: the institute never acquired the score — yet no one ever heard how the resonance ended.

---

## 二 · 盘里没有谁动过的句子

潮候院礼拜堂的潮沙盘在四十一次散会的那一夜，没有人碰它，可第二天早上它重新排了过。

没有人知道它是自己排的还是被排过的——没有人动过，但它就是不一样了：原本对着潮候院方向撒的盐粒，全朝灯柱那一头，齐齐偏了一寸半。

守夜人只记下一件事——它偏了，这就是全部。Convocation 结束后的下一早晨，礼拜堂灯柱下没有留下任何字，连盐粒的方向都找不出解释——潮候院的卷宗没有找到对应的档案号。

**锚句**：潮候院没人动过沙盘，却没人记得它为什么自己偏了半寸。

**Anchor sentence**: nobody touched the table — yet no one recalls why it shifted half an inch of its own accord.

---

## 三 · 散会后没有人拍手

潮候院的 Convocation 结束后，从来没有「鼓掌」这一项议程。

散会后散入庭院的那一夜，礼拜堂里只留清灯——没有玻璃杯、没有书签、没有团扇——潮候院没有一张写过谁说过什么的小字稿，它在那一年「不再开一次同样的会」，没有人找得到自己在场那一次有没有被淘汰过。

潮候院能数灯位、能数井序、能数湾里潮候船的桅杆，能数灯下散会后沉下来的任何静——唯独散会后那一阵潮音，没有人记过它的号。

**锚句**：潮候院散会后没有「拍手」这一项议程——潮候院只把晚会的灯落下来，灯下什么都没留。

**Anchor sentence**: there is no "applause" on the institute's adjournment checklist — it simply lowers the lamps; nothing is left under them.

---

## 四 · 教团没有买的歌谱

潮候院有一整个潮鸣崇义工具系统——每一件用来计数的工具遵循自己到自己注定的那一种计数。

潮候院能数字数、能数元素、能数灯、能数井，潮候院的 Convocation 计了感情、潮候院数了人才；潮候院没有为潮音登记谱、没有给潮音记号，也没有为它付过一张稿纸的钱——会散以后，礼拜堂灯落，灯下的风还没散掉，风一直没散完。

**锚句**：潮候院从来没有买过一首歌的谱——它从来没有买过一首歌的谱。

**Anchor sentence**: the institute never bought a score for a song — it never bought a score for a song.

---

## 五 · 模型映射（回响六章对应关系）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | 潮候院没有登记过谱的歌谱 · 散会后的潮音 | 一、三、四 |
| geography | 礼拜堂灯柱 · 第八盏灯 · 潮沙盘 | 一、二、三、四 |
| characters | 守夜人 · 第四十一次大会闭幕那晚的潮音 · 没人记得的名字 | 一、二、三、四 |
| story | 教团没有买的歌谱 · 回响（其六） | 全篇 |
| items | 灯柱下斜照的灯 · 潮沙盘自己偏了半寸 | 一、二、三 |
| history | 铁月纪第四十一次大会之后的下一夜 · 灯下的风 | 一、二、三、四 |

> 四十一次大会散会后，礼拜堂没人动过沙盘，潮院也没买过歌谱——潮候院只登记了「灯序」。
> 回响不在于纠正，而在于保留那件不被验收的父子的沉默。
>
> After the 41st, no one touched the sand table in the chapel — and the institute never bought the score; it only registered the lamp sequence.
> Echo is not correction; it keeps the silence no one was ever given to inspect.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其六）「教团没有买的歌谱」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给四十一次大会散会的那晚，第八盏灯底下整洁的潮鸣——没人买，没人赞，没人记下名字。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the slow tide-hum that rang through the Eighth Lamp on the night the 41st Convocation broke up — bought by no one, applauded by no one, remembered by no name.
> Same discipline: anchors verbatim.

> 纪元：铁月纪 · 第四十一次大会之后的下一个早晨——档案随后编入 Convocation，唯独礼拜堂灯柱下的一阵轻音找不到任何稿纸。
> Era: the Iron-Moon Age — the next morning after the 41st Convocation; the files were all cataloged as Convocation records — only a soft resonance below the assembly hall's lamp column found no manuscript anywhere.

---

## 一 · The Eighth Lamp That Lingered

On the night the 41st Convocation broke up, the Eighth Lamp hung a half-inch higher on its own.

No oath, no worship, no one set salt before the sand table. A faint slant of light moved across the column — and beneath it a tide-hum, very fine, very long, very slow, as though someone were knocking one soft knock inside the institute's heart.

The archivists reported every sound afterwards — except this one; the institute never knitted a keyboard for it, never printed a hero's page for it, never gave it a number.

**锚句**：潮候院没有为自己收到一首歌谱——但散会后的那一阵潮音，谁也没听见它是怎么结束的。

**Anchor sentence**: the institute never acquired the score — yet no one ever heard how the resonance ended.

---

## 二 · The Grains No Hand Has Touched

The tide-sand table in the assembly hall stayed untouched that night — and yet the next morning it had shifted.

No one ever knows whether it moved by itself or was moved — no hand has touched it, but it simply was different: the salt grains that had been scattered toward the chapel side were now all leaning toward the lamp column, a clean half-inch slant.

The Night Watchers filed exactly one observation — it shifted, that is all. The next morning, no note, no number, no file number — the institute's archives carry nothing corresponding to it.

**锚句**：潮候院没人动过沙盘，却没人记得它为什么自己偏了半寸。

**Anchor sentence**: nobody touched the table — yet no one recalls why it shifted half an inch of its own accord.

---

## 三 · There Is No «Applause» on the Institute's Adjournment Checklist

The institute's Convocation has never had an «applause» item on its order of business.

After the 41st broke up and its delegates walked out into the courtyard, the hall kept only its lamps — no glass, no bookmark, no paper fan — the institute never drew the name of any one voice down onto paper; it closed its final session without naming who had cleared the floor.

The institute can count the lamp sockets, count the wells, count the masts on the tide-waiting ships in the bay — the one sound no one ever named was the soft resonance.

**锚句**：潮候院散会后没有「拍手」这一项议程——潮候院只把晚会的灯落下来，灯下什么都没留。

**Anchor sentence**: there is no "applause" on the institute's adjournment checklist — it simply lowers the lamps; nothing is left under them.

---

## 四 · The Score the Institute Never Bought

The institute has an entire system of tide-counting instruments — each one exists to tally only the class of events it was designed to tally.

The institute can count lights, can count wells, can count the masts of incoming tide-waiting ships, can count the fall of every grain of salt, can count the attendees of every Convocation — but it never registered a score, never gave the resonance a glyph, never paid one sheet of manuscript for it.

After the session closed, lamps lowered one by one; the wind under them never stopped — and never started to slow.

**锚句**：潮候院从来没有买过一首歌的谱——它从来没有买过一首歌的谱。

**Anchor sentence**: the institute never bought a score for a song — it never bought a score for a song.

---

## 五 · Mapping（Echo No. 6 → world model）

| Category | Title | Sections |
|---|---|---|
| lore | the song the institute never scored · the resonance after the 41st Convocation broke up | 一、三、四 |
| geography | the assembly lamp column · the Eighth Lamp · the tide-sand table | 一、二、三、四 |
| characters | the Night Watchers · the tide-hum on the last night · the name never remembered | 一、二、三、四 |
| story | The Score the Institute Never Bought · Echo No. 6 | the whole piece |
| items | the slant of light under the lamp column · the table that shifted half an inch of its own accord | 一、二、三 |
| history | the next morning after the 41st Convocation · the wind under the lamps | 一、二、三、四 |

> 四十一次大会散会后，礼拜堂没人动过沙盘，潮院也没买过歌谱——潮候院只登记了「灯序」。
> 回响不在于纠正，而在于保留那件不被验收的父子的沉默。
>
> After the 41st, no one touched the sand table in the chapel — and the institute never bought the score; it only registered the lamp sequence.
> Echo is not correction; it keeps the silence no one was ever given to inspect.
`,
  },
  {
    order: 7,
    slug: 'echo-007-the-gleam-in-the-brass-basin',
    titleZh: '黄铜盘上刀光',
    titleEn: 'The Gleam in the Brass Basin',
    eraLineZh: '纪元：铁月纪 · 第四十一次大会之后——黄铜盘自己烫上了一条痕，没有任何人说那痕是写上去的。',
    eraLineEn: 'Era: the Iron-Moon Age — after the 41st Convocation; the brass basin scorched a line no one ever admitted was written.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 7): The Gleam in the Brass Basin

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给在黄铜盘上看见过刀光的那些人：黄铜盘从来不收刀，但那一天，刀回炉了。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for those who saw the gleam of a blade in a brass basin — the basin never accepts blades; yet one day, the blade was returned to the forge.
> Same discipline: anchors verbatim.

> 纪元：铁月纪 · 第四十一次大会之后——黄铜盘自己烫上了一条痕，没有任何人说那痕是写上去的。
> Era: the Iron-Moon Age — after the 41st Convocation; the brass basin scorched a line no one ever admitted was written.

---

## 一 · 盘沿的刀柄

黄铜盘放在潮候院礼拜堂后面那一间小房里——守夜人没想过用途，但它一直在。

四十一次大会散会之后，后方小房的灯亮了一下——半掩着的铜门里，翻来覆去的只有一把旧刀：刀刃没锈、刀柄缠着盐、刀柄根端有一块已经磨得发亮的金属片。

没有任何人记得过这把刀从哪一天来；连潮候院的守夜人交班簿上也只找到一条对应的线——「某日深夜，礼拜堂侧灯，火炉温度不对」。

**锚句**：礼拜堂黄铜盘的刀柄，刀没有回家，只是滩在黄铜盘的边。

**Anchor sentence**: the knife's grip on the brass basin's rim — the blade never went home; it merely lay on the rim of the basin.

---

## 二 · 「回炉」这件事没有记账

礼拜堂后方的火炉往常只烧盐过的木头，四十一次大会散会那一晚，守夜人在炉子里看见一样从来没有被放进去过的东西：刀没有淬火——刀被放在了火口的外圈，温度刚好够让黄铜盘上台支上去一道。

那道痕迹一直在，没有人问它是不是刀留下的；没有人知道。

**锚句**：黄铜盘的热痕不是谁写上去的——刀只是在那里落下了一道看似温柔的光。

**Anchor sentence**: the mark on the basin is not anyone's writing — the blade merely set down a deceptively gentle gleam.

---

## 三 · 刀的头颅

黄铜盘那天亮着，刀柄上的盐一颗一颗从盘沿掉下去——没有一颗掉进火口——盐落在盘上，落在整盘的刀光里。

没有人知道黄铜盘收不收刀；第四十一次大会闭会的那一天，潮候院没有哪一项章程超过它，连它自己也从来没有登记——只是那一天，照了灯，熄了火，礼拜堂自己把整件事收了进去。

**锚句**：礼拜堂自记；潮候院不挂号——潮记了灯下的一盘刀光。

**Anchor sentence**: the chapel records it for itself; the institute registers nothing — the sluice kept it all, the blade in the basin.

---

## 四 · 潮候院的灯彻夜点着的真正原因

四十一次大会散会的那个夜里，礼拜堂没有人离开礼拜堂散会的人都没回酒店——守夜人描述的点灯之间的刻痕，一字一字地刻在了礼拜堂正门的横梁上，没有人觉察那字是什么意思。

潮候院的档案里，没有写：守夜人礼拜后方那一夜。只在 Convocation 记录里写了一句：礼拜堂后方炉烧盐木头，自 A 日起记录——灯，灯，只一根火。

后背的木炭燃起以后，礼拜堂整座石屋里的铜盘又亮了——它烫出的斑点仍留在侧后那一间；守夜人后来只记下：四十一次散会的是 D 夜；礼拜堂后方那夜有过——刀。

**锚句**：灯彻夜是潮候院的规矩——潮候院没有一座礼拜堂的灯，是空落落地亮着。

**Anchor sentence**: the lamp stays on all night at the institute — no chapel lamp at the institute ever shines empty.

---

## 五 · 模型映射（回响七章对应关系）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | 黄铜盘上的刀光 · 守夜人后方小屋 · 第四十一次大会散会之后 | 一、二、三、四 |
| geography | 礼拜堂后方小屋 · 黄铜盘 · 火炉 | 一、二、三 |
| characters | 守夜人/礼拜堂后方点灯人/无名的刀 | 一、二、三、四 |
| story | 黄铜盘上刀光 · 回响（其七） | 全篇 |
| items | 黄铜盘 · 旧刀柄盐粒 · 火炉 · 横梁刻在底色的灯 | 一、二、三、四 |
| history | 铁月纪第四十一次大会散会之后的夜礼拜与火炉 | 一、二、三、四 |

> 这一章没有人知道黄铜盘收不收刀；真的没人知道——潮候院只登记了灯、盐和「木头烧完了」。
> 回响不在于追刀版，而在于保留那道深痕——在潮候院历史的背后，留一笔：礼拜堂自己的一夜，有一把刀。
>
> No one ever knew whether the brass basin accepts blades — the institute only etched lamp, salt and «the firewood burned to the end.»
> The echo is not an audit of the blade; it keeps the deep scorch — at the back of the institute's own history, one line was kept: one night, in the chapel, there was a blade.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其七）「黄铜盘上刀光」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给在黄铜盘上看见过刀光的那些人：黄铜盘从来不收刀，但那一天，刀回炉了。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for those who saw the gleam of a blade in a brass basin — the basin never accepts blades; yet one day, the blade was returned to the forge.
> Same discipline: anchors verbatim.

> 纪元：铁月纪 · 第四十一次大会之后——黄铜盘自己烫上了一条痕，没有任何人说那痕是写上去的。
> Era: the Iron-Moon Age — after the 41st Convocation; the brass basin scorched a line no one ever admitted was written.

---

## 一 · The Knife's Grip on the Rim

The brass basin lived in the small chamber behind the assembly hall's chapel — the Night Watchers used it for none. The object sat there nonetheless.

On the night after the 41st, a back lamp behind the chapel wall lit — through the half-open brass door, all one could see was an old blade, blunt at the edge, a worn grip bound in salt, its metal insole polished smooth by a thumb forever.

No one recorded which day it arrived; the Night Watchers' hand-off book carried one line — «a late night; a slant lamp behind the hall; the fire would not take.»

**锚句**：礼拜堂黄铜盘的刀柄，刀没有回家，只是滩在黄铜盘的边。

**Anchor sentence**: the knife's grip on the brass basin's rim — the blade never went home; it merely lay on the rim of the basin.

---

## 二 · The Scorch Nobody Dictated

The charcoal furnace behind the assembly hall chapel ran only on salt-wood. On the night after the 41st, someone saw an object inside the furnace it had never held before — the blade was not quenched — only set at the outermost circle, just enough heat to leave a scorch along the brass basin's lip.

The trace remains. No one asks whether the blade did that. No one knows.

**锚句**：黄铜盘的热痕不是谁写上去的——刀只是在那里落下了一道看似温柔的光。

**Anchor sentence**: the mark on the basin is not anyone's writing — the blade merely set down a deceptively gentle gleam.

---

## 三 · The Blade's Capital

The lamp burned that night — the grains of salt bound to the blade-fell from the rim one by one — none fell the furnace — they dropped in the basin, among the full flame-gleam along the metal.

No one ever learned whether the basin accepts knives; on the night the 41st broke up, no chapter outclassed that basin, and nothing in any book registered the fact. Only — that night, a lamp, then a silence, then the next turning of the wind.

**锚句**：礼拜堂自记；潮候院不挂号——潮记了灯下的一盘刀光。

**Anchor sentence**: the chapel records it for itself; the institute registers nothing — the sluice kept it all, the blade in the basin.

---

## 四 · The Night the Chapel Never Switched Its Lamps Off

On the night after the 41st, no one left the chapel — no one went home either. The lamp-burn marks the Night Watchers carved deep into the chapel's lintel line are one such inscription — no one ever decoded the characters.

The institute's archives hold nothing marked "the night behind the chapel after the Forty-first." The Convocation minutes carry exactly one line — «the furnace burned salt-wood behind the chapel; starting from day A; lamp, lamp, only one fire.»

After the charcoal lit, the brass basin across the back room glowed again — those spots remain along the side wall of that back room. The Night Watchers filed afterwards only: «the Forty-first dawned on D; the back chapel held one night — a blade.»

**锚句**：灯彻夜是潮候院的规矩——潮候院没有一座礼拜堂的灯，是空落落地亮着。

**Anchor sentence**: the lamp stays on all night at the institute — no chapel lamp at the institute ever shines empty.

---

## 五 · Mapping（Echo No. 7 → world model）

| Category | Title | Sections |
|---|---|---|
| lore | the gleam in the brass basin · the back room behind the chapel · after the 41st Convocation broke up | 一、二、三、四 |
| geography | back room behind the chapel · the brass basin · the furnace | 一、二、三 |
| characters | the Night Watchers / the back-room lamp-lighter / the unnamed blade | 一、二、三、四 |
| story | The Gleam in the Brass Basin · Echo No. 7 | the whole piece |
| items | the brass basin · the salt grains bound to the blade's grip · the charcoal furnace · the carvings on lintel | 一、二、三、四 |
| history | the long watch behind the chapel in the night the 41st broke up | 一、二、三、四 |

> 这一章没有人知道黄铜盘收不收刀；真的没人知道——潮候院只登记了灯、盐和「木头烧完了」。
> 回响不在于追刀版，而在于保留那道深痕——在潮候院历史的背后，留一笔：礼拜堂自己的一夜，有一把刀。
>
> No one ever knew whether the brass basin accepts blades — the institute only etched lamp, salt and «the firewood burned to the end.»
> The echo is not an audit of the blade; it keeps the deep scorch — at the back of the institute's own history, one line was kept: one night, in the chapel, there was a blade.
`,
  },
  {
    order: 8,
    slug: 'echo-008-the-wan-yan-tide-clock',
    titleZh: '完颜的潮汐钟',
    titleEn: 'The Wan-Yan Tide Clock',
    eraLineZh: '纪元：铁月纪 · 第四十一次大会之后的某个早晨——礼拜堂侧的壁钟三天三夜没有响，只有沙在落。',
    eraLineEn: 'Era: the Iron-Moon Age — one morning after the 41st Convocation; the side-room clock in the chapel went three days without striking — only sand fell.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 8): The Wan-Yan Tide Clock

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给守着潮汐钟的人——守夜人有一只自己有朝南不响的钟，他们叫它「完颜」。「钟」字潮候院从来没认过。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the ones who stand watch over a tide clock — the institute kept a clock of its own that never struck southward; they called it "Wan-Yan." The word "clock" the institute never acknowledged.
> Same discipline: anchors verbatim.

> 纪元：铁月纪 · 第四十一次大会之后的某个早晨——礼拜堂侧的壁钟三天三夜没有响，只有沙在落。
> Era: the Iron-Moon Age — one morning after the 41st Convocation; the side-room clock in the chapel went three days without striking — only sand fell.

---

## 一 · 完颜三天没响

礼拜堂侧厅有一只很老的钟——守夜人不叫它「潮候院公家钟」；守夜人叫它「完颜」。

第四十一次大会散会之后某一个早晨，重点有人发现完颜三天三夜没有响——没有人记得它最后一次响是什么时候——它大概觉得散尽是新的一轮潮候院的开始，它决定不响。

守夜人对它说：完颜，你不响。它没回答，只有沙落。

**锚句**：完颜不响了——潮候院的潮汐钟，三天三夜一声也不响。

**Anchor sentence**: Wan-Yan went silent — the tide-clock of the institute went three days without a single chime.

---

## 二 · 守钟的不是机械

守夜人把钟归类，不是机械，而是传承——完颜归了类，归在「盐砂潮」这一类；潮候院每一件「非机械」的装置，守夜人都必须按 Convocation 日期读三遍，完颜不需要：盐砂一天也必须把自己翻一次。

所谓 Convocation，问的是这一件：「完颜给了我什么？我给了完颜什么？完颜三天没响给潮候院什么？」——三问都没有答案；潮候院要的从来不是答案，而是表态。

**锚句**：完颜不在 Convocation 记录里——潮候院只登记「完颜的沙」。

**Anchor sentence**: Wan-Yan never appears in the Convocation minutes — the institute only registers the sand of Wan-Yan.

---

## 三 · 三天三夜后的答复

礼拜堂侧厅的钟继续不响，礼拜堂自己开始低度地异响——灯自己会往低里亮——第四天早上，礼拜堂灯亮，钟响了一下，一声。

礼拜堂侧厅的所有人都停下了手头的事——灯自己往低里又亮了一下，完颜接着又响了一次，接着又是一次——只有两声。

七道杠没有一道杠是礼拜堂亲笔写的——都是灯和盐落给自己写的。

**锚句**：完颜的两声后礼拜堂全醒了——灯低下了一折，钟不再不响。

**Anchor sentence**: after Wan-Yan's two strokes the chapel came wide awake — the lamp dimmed one fold; the clock never went silent again.

---

## 四 · 完颜放在哪里

Convocation 时潮候院的礼拜堂把完颜摆了——它做了灯、它做了声、它做了礼拜堂的礼仪——没有任何人记得这件事：连礼拜堂里无名的守夜人都不会放过礼拜堂对它的登记——因为它已经在 Convocation 的序上了。

潮候院有一套「船完颜」的节奏（在灯柱下的一些早晚，守夜人对完颜讲 Convocation：它一声、两声、三场、沉默场，潮候院称之为潮候院「一件能写进去但没写」的声学礼仪）。

**锚句**：潮候院登记了完颜的沙，登记了完颜的两声，唯独没有登记完颜。

**Anchor sentence**: the institute registered Wan-Yan's sand, registered Wan-Yan's two strikes — never registered Wan-Yan itself.

---

## 五 · 模型映射（回响八章对应关系）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | 完颜三天没响 · 礼拜堂侧钟 · 潮候院的沉默礼仪 | 一、二、三、四 |
| geography | 礼拜堂侧厅 · 第八盏灯 · 钟台 | 一、二、三、四 |
| characters | 守夜人 · 礼拜堂 · 完颜（非机械潮汐钟） | 一、二、三、四 |
| story | 完颜的潮汐钟 · 回响（其八） | 全篇 |
| items | 老钟 · 盐砂 · 礼拜堂自己的低度灯 | 一、二、三、四 |
| history | 铁月纪第四十一次大会之后的那一个早晨 | 一、二、三、四 |

> 这一章没有人知道完颜算不算一件机械潮汐钟——潮候院登记了它的沙、灯、两声；没有人记完。
> 回响不在于钉住那件钟，而在于保留完颜的没有立过的碑——潮候院还挂着它。
>
> No one here ever knew whether Wan-Yan qualified as a mechanical tide-clock — the institute registered its sand, its lamp, its two strikes; no one kept them all.
> The echo does not nail the clock shut; it keeps the one that simply hangs — holding the chapel's silence in place.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其八）「完颜的潮汐钟」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给守着潮汐钟的人——守夜人有一只自己有朝南不响的钟，他们叫它「完颜」。「钟」字潮候院从来没认过。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the ones who stand watch over a tide clock — the institute kept a clock of its own that never struck southward; they called it "Wan-Yan." The word "clock" the institute never acknowledged.
> Same discipline: anchors verbatim.

> 纪元：铁月纪 · 第四十一次大会之后的某个早晨——礼拜堂侧的壁钟三天三夜没有响，只有沙在落。
> Era: the Iron-Moon Age — one morning after the 41st Convocation; the side-room clock in the chapel went three days without striking — only sand fell.

---

## 一 · Wan-Yan Went Silent

In the side room of the assembly hall hung an old clock — the Night Watchers do not call it the institute's clock; the Night Watchers call it «Wan-Yan».

One morning after the 41st Convocation broke up, someone noticed that Wan-Yan had gone three days without a single chime — no one recalls the last time it struck; it apparently decided the close of business was a fresh era, and kept the silence.

"Wan-Yan, why are you not striking," the watchers asked it. It did not answer — only sand fell.

**锚句**：完颜不响了——潮候院的潮汐钟，三天三夜一声也不响。

**Anchor sentence**: Wan-Yan went silent — the tide-clock of the institute went three days without a single chime.

---

## 二 · The Keeper Is Not the Mechanism

The Night Watchers do not classify it as a mechanism but as a keeper — Wan-Yan sits in the salt-sand class; every «non-mechanism» at the institute must be read three times by every Convocation date, but Wan-Yan does not require any of that — the sand grains inside it know how to turn over once a day.

The Convocation asks only this question: «What did Wan-Yan give us? What did we give it? What did the silence of three days give the institute?» — none of those three has an answer; the institute has never needed an answer — it needed a register.

**锚句**：完颜不在 Convocation 记录里——潮候院只登记「完颜的沙」。

**Anchor sentence**: Wan-Yan never appears in the Convocation minutes — the institute only registers the sand of Wan-Yan.

---

## 三 · The Reply After Three Days

The side-room clock continued to keep its silence — the lamps in the room dimmed on their own — until, on the fourth morning, the lamp raised itself one fold: Wan-Yan struck — once.

Everyone in the side room dropped what they were doing — the lamp lowered itself one more fold, Wan-Yan struck — again — and again — two strokes, that was all.

No seven characters were etched by any hand — they were all the lights' and the sand's own.

**锚句**：完颜的两声后礼拜堂全醒了——灯低下了一折，钟不再不响。

**Anchor sentence**: after Wan-Yan's two strokes the chapel came wide awake — the lamp dimmed one fold; the clock never went silent again.

---

## 四 · Where Wan-Yan Was Placed

During Convocation time the assembly hall places Wan-Yan where it belongs — it became light, it became sound, it became part of the chapel ritual — no one remembers this; the nameless Night Watchers never miss the registrator's snapshots — because Wan-Yan was already placed in the order of the Convocation.

The institute has a rhythm called «the clock Wan-Yan» — during certain mornings at the lamp column the Night Watchers report to Wan-Yan: it strikes once, twice, triply, silently; the institute names that one of its own unlisted rituals in acoustics.

**锚句**：潮候院登记了完颜的沙，登记了完颜的两声，唯独没有登记完颜。

**Anchor sentence**: the institute registered Wan-Yan's sand, registered Wan-Yan's two strikes — never registered Wan-Yan itself.

---

## 五 · Mapping（Echo No. 8 → world model）

| Category | Title | Sections |
|---|---|---|
| lore | Wan-Yan gone silent · the side-room clock · the institute's silence protocol | 一、二、三、四 |
| geography | the side room of the assembly hall · the Eighth Lamp · the clock platform | 一、二、三、四 |
| characters | the Night Watchers · the chapel · Wan-Yan (non-mechanism tide clock) | 一、二、三、四 |
| story | The Wan-Yan Tide Clock · Echo No. 8 | the whole piece |
| items | the old clock · sand grains · the chapel's own low lamp | 一、二、三、四 |
| history | the morning after the 41st Convocation broke up | 一、二、三、四 |

> 这一章没有人知道完颜算不算一件机械潮汐钟——潮候院登记了它的沙、灯、两声；没有人记完。
> 回响不在于钉住那件钟，而在于保留完颜的没有立过的碑——潮候院还挂着它。
>
> No one here ever knew whether Wan-Yan qualified as a mechanical tide-clock — the institute registered its sand, its lamp, its two strikes; no one kept them all.
> The echo does not nail the clock shut; it keeps the one that simply hangs — holding the chapel's silence in place.
`,
  },
  {
    order: 9,
    slug: 'echo-009-the-tide-went-out-without-orders',
    titleZh: '退潮了，没有潮候指令',
    titleEn: 'The Tide Went Out Without Orders',
    eraLineZh: '纪元：第四十一次大会散会之后又过了多日——礼拜堂什么都没记，潮自己退了。',
    eraLineEn: 'Era: many months after the 41st; the chapel recorded nothing; the tide left on its own.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 9): The Tide Went Out Without Orders

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给潮退的那一刻——它不打响、不举报、不报告——它只是退——退去的事实不属于潮候院，也不属于任何人。
> 本文不是正典里的第 X 章，本文是正典没有写的空白。
> 纪律同正典：锚句 zh/en 逐字对应。

> 纪元：第四十一次大会散会之后又过了多日——礼拜堂什么都没记，潮自己退了。
> Era: many months after the 41st; the chapel recorded nothing; the tide left on its own.

---

## 一 · 没有人说潮来不来

第四十一次大会散会之后，潮候院照常颁灯令。礼拜堂的灯照了又照，却没有人想问一件事：明天潮还会来吗。

有一天，潮悄悄地退了。从这一方石退到了那一方石。礼拜堂里没有人欢呼，也没有人惊讶——礼拜堂只是安静认可一件它从来没有预料过的事。

**锚句**：潮候院没有为潮下达一条指令——潮自己退潮。

**Anchor sentence**: the institute never gave the tide a single order — the tide withdrew on its own.

---

## 二 · 灯和沙都没追

礼拜堂侧厅的钟又安静了。完颜没响，沙没动，礼拜堂也没有问。灯慢慢在那儿亮着——忽明忽暗，又不太暗，但不是为潮打的。

风从礼拜堂正门进来，又从原来的口出去。没有谁记过这风多大、吹了多少年、长出多少盐粒。

礼拜堂的孩子们都到院子里去了。老的还在那里坐着，什么也没有做。

**锚句**：灯和沙都不跟潮走——潮候院到此刻还没收到一条追潮令。

**Anchor sentence**: neither the lamp nor the sand followed the tide — no chasing order has ever been issued by this institute to its sea.

---

## 三 · 教团没有这一项拜潮的仪

潮候院的 Convocation 从来没有"庆潮退"这一项议程。没有人提过——因为没有人提过，这件事就发生了。

礼拜堂里的东西都动了一下：灯亮了一下，灯暗了一下；完颜响了很久以前的一次，这一次完颜没响；沙盘没有被人拍动；第七口井没有被人叫过名字。

**锚句**：礼拜堂退潮没有一盏灯亮给潮——潮退了只有灯自己亮给自己。

**Anchor sentence**: the chapel lights nothing for the receding tide — when the sea withdrew, the lamp only turned on for itself.

---

## 四 · 没有人记录的那一刻

礼拜堂的守夜人这一夜没有拿纸笔。没有记录、没有核对、没有盖章，也没有任何人去第七口井旁边守着。

潮候院 Convocation 的会议记录里对这个夜一字未提——不是疏忽，是因为没有人当作这一件事。

礼拜堂对潮候院来说，潮候院从“已经习惯潮”这件事里退了下来。

**锚句**：潮候院退潮不需要 Convocation——潮平时就懒潮候院的 Convocation。

**Anchor sentence**: the institute never needed a Convocation for the retreat — the tide was finally able to be lazy in this chapel too.

---

## 五 · 模型映射（回响九章对应关系）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | 潮候院退潮没有指令 · 晚潮的事实自理 | 一、四、五 |
| geography | 礼拜堂 · 完颜侧厅 · 第七口井 · 第八盏灯 | 一、二、三、四 |
| characters | 守夜人 · 礼拜堂众人 · 潮 | 一、二、三、四 |
| story | 潮生不急 · 回响（其九） | 全篇 |
| items | 完颜钟 · 潮沙盘 · 礼拜堂正门 · 风 | 一、二、三、四 |
| history | 第四十一次大会散会之后 · 潮自己退了 | 一、二、三、四 |

> 回响不为潮候院要一件礼拜堂写过的字痕——它为礼拜堂要一口安静。
> Echo asks for nothing of the institute except one breath of quiet.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其九）「退潮了，没有潮候指令」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给潮退的那一刻——它不打响、不举报、不报告——它只是退——退去的事实不属于潮候院，也不属于任何人。
> 本文不是正典里的第九章，本文是正典没有写的空白。
> 纪律同正典：锚句 zh/en 逐字对应。

> 纪元：第四十一次大会散会之后又过了多日——礼拜堂什么都没记，潮自己退了。
> Era: many months after the 41st; the chapel recorded nothing; the tide left on its own.

---

## 一 · Nobody Asked the Sea Anything

After the 41st Convocation, the institute kept the lamp routines. The chapel lit, and relit, but nobody asked one simple thing: will the tide come tomorrow?

One day the tide withdrew quietly. From one stone to another. No cheer, no awe — the chapel simply and quietly accepted something it had never prepared for.

**锚句**：潮候院没有为潮下达一条指令——潮自己退潮。

**Anchor sentence**: the institute never gave the tide a single order — the tide withdrew on its own.

---

## 二 · Neither the Lamp nor the Sand Followed

The side-room clock kept its silence again. Wan-Yan did not strike, the sand did not move, and the chapel did not ask. The lamp kept slowly burning — dimming and brightening, not quite dark, but never lit for the tide.

The wind came in through the chapel's main door and went out the same way it entered. No one recorded the magnitude of that wind, how many years it had blown, how many grains of salt it had left behind.

The chapel's young ones went out into the courtyard. The old ones stayed, sitting, doing nothing.

**锚句**：灯和沙都不跟潮走——潮候院到此刻还没收到一条追潮令。

**Anchor sentence**: neither the lamp nor the sand followed the tide — no chasing order has ever been issued by this institute to its sea.

---

## 三 · An Agenda Item the Institute Never Held

No Convocation has ever had "celebrate the tide withdrawal" as an agenda item. No one ever raised it — and because it was never raised, it simply happened.

The things inside the chapel stirred slightly: the lamp flickered, the lamp dimmed; Wan-Yan struck once, from long ago — this time it did not strike; the sand table was never tapped; the seventh well was never called aloud again.

**锚句**：礼拜堂退潮没有一盏灯亮给潮——潮退了只有灯自己亮给自己。

**Anchor sentence**: the chapel lights nothing for the receding tide — when the sea withdrew, the lamp only turned on for itself.

---

## 四 · The Hour No One Recorded

The chapel's Night Watcher did not reach for pen and paper that night. No record, no cross-check, no stamp; no one stood vigil at the seventh well either.

The minutes carry nothing about this night — not out of lapse; because no one believed it mattered at all.

For the institute, the chapel quietly slipped out of the habit of thinking of itself as tidal.

**锚句**：潮候院退潮不需要 Convocation，潮候院勉强跟着的事——潮在潮候院也懒。

**Anchor sentence**: the institute never needed a Convocation for the retreat — the tide had been lazy in this chapel all along.

---

## 五 · Mapping（Echo No. 9 → world model）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | 潮候院退潮没有指令 · 晚潮的事实自理 | 一、四、五 |
| geography | 礼拜堂 · 完颜侧厅 · 第七口井 · 第八盏灯 | 一、二、三、四 |
| characters | 守夜人 · 礼拜堂众人 · 潮 | 一、二、三、四 |
| story | 潮生不急 · 回响（其九） | 全篇 |
| items | 完颜钟 · 潮沙盘 · 礼拜堂正门 · 风 | 一、二、三、四 |
| history | 第四十一次大会散会之后 · 潮自己退了 | 一、二、三、四 |

> 回响不为潮候院要一件礼拜堂写过的字痕——它为礼拜堂要一口安静。
> Echo asks for nothing of the institute except one breath of quiet.
`,
  },
  {
    order: 10,
    slug: 'echo-010-the-lamp-never-lit-when-the-tide-went-out',
    titleZh: '灯在潮退时没有往回点',
    titleEn: 'The Lamp Never Lit Itself When the Tide Went Out',
    eraLineZh: '纪元：潮候院 · 礼拜堂 · 第四十一次大会散会之后——灯自始至终自己亮着。',
    eraLineEn: 'Era: the Institute — the chapel — after the 41st Convocation; the lamp was always just lit.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 10): The Lamp Never Lit Itself When the Tide Went Out

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给那盏从来没人主动点的灯——它只是常着；当潮退去时它从来不亮起来引你离开这里。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the lamp no one deliberately lights; it simply remains lit — and it never dims to draw you away when the tide goes out.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 礼拜堂 · 第四十一次大会散会之后——灯自始至终自己亮着。
> Era: the Institute — the chapel — after the 41st Convocation; the lamp was always just lit.

---

## 一 · 灯一直亮

礼拜堂的灯从潮候院最早建起，就没有关过。第四十一次大会散会后——礼拜堂里全是新的乐器，新的潮候表——但灯还是那盏灯。

守夜人说，只要灯是亮的，潮候院就还像个潮候院。礼拜堂的礼仪参半，但灯从来不缺席。

**锚句**：礼拜堂的灯从来没被特别点亮——它一直自己亮着。

**Anchor sentence**: the chapel's lamp has never been specially lit — it simply burns on its own.

---

## 二 · 潮退时灯不亮给你走

潮涨时礼拜堂灯亮的样子是完整的：光把盐沙盘照得一清二楚——潮候院在做记录，潮候海在照潮候院。

但潮退时，礼拜堂不点额外的灯给你指路——不熄灯，也不替谁回答去向——灯始终以原来的亮度亮着，潮候海只负责退自己的潮。

**锚句**：潮退时礼拜堂不为任何人额外亮灯——灯没变，退潮只是自己退了。

**Anchor sentence**: when the tide receded, the chapel lit no extra lamp for anyone — the lamp did not change; the sea simply withdrew.

---

## 三 · 守夜人从不称呼它

礼拜堂的守夜人从不给灯起名。不叫完颜、不叫第八盏灯——它就是「那盏灯」。

第四十一次大会的归档里也没写过它的名字。它不属于名册；它不属于任何一场事；它就只是被看着，亮着。

**锚句**：礼拜堂没有人给那盏灯起名——那盏灯从来没登记过。

**Anchor sentence**: no one in the chapel ever gave the lamp a name — the lamp never made it into any register.

---

## 四 · 灯和潮各自为政

潮候海涨退、灯始终自己亮——潮候海不为灯负责，灯也不为潮负责。

灯不引导谁走，潮不请人留；完颜响不响都自己决定。潮候院从不对潮、对灯、对它自己下一道"潮退时该怎么办"的命令。

潮候院 Convocation 从没有一项议程叫「潮退时的备用照明」。潮退自己退了，谁也没打扰谁。

**锚句**：潮候院从不发号召——潮候海退是自己的退，灯亮是灯自己的亮。

**Anchor sentence**: the institute never issues commands — the sea withdraws of its own accord; the lamp burns of its own accord.

---

## 五 · 模型映射（回响十章对应关系）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | 潮退时没有人点灯 · 潮候院灯自亮 | 一、二、四、五 |
| geography | 礼拜堂 · 第八盏灯 · 潮候院礼拜空间 | 一、二、三、四 |
| characters | 守夜人 · 那盏从未被名册登记的灯 | 一、三、四 |
| story | 潮退时的礼拜堂 · 回响（其十） | 全篇 |
| items | 那盏灯 · 潮候海 · 潮沙盘 | 一、二、三、四 |
| history | 第四十一次大会散会后 · 礼拜堂始终亮着 | 一、二、三、四 |

> 礼拜堂的灯从来没被点亮——它只是没有被熄灭过。
> The chapel's lamp has never been lit; it just has never been unlit.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其十）「灯在潮退时没有往回点」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐泡出来的另一层纹理。
> 本篇写给那盏从来没人主动点的灯——它只是常着；当潮退去时它从来不亮起来引你离开这里。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the lamp no one deliberately lights; it simply remains lit — and it never dims to draw you away when the tide goes out.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 礼拜堂 · 第四十一次大会散会之后——灯自始至终自己亮着。
> Era: the Institute — the chapel — after the 41st Convocation; the lamp was always just lit.

---

## 一 · The Lamp Is Always Lit

The lamp in the chapel has never been extinguished since the institute first took shape. After the 41st Convocation — the chapel filled with new instruments and new tide-tables — the lamp was still the same lamp.

The Night Watchers say: while the lamp burns, the institute remains an institute. The chapel's rites are half-human, half-signal — but the lamp never fails to attend.

**锚句**：礼拜堂的灯从来没被特别点亮——它一直自己亮着。

**Anchor sentence**: the chapel's lamp has never been specially lit — it simply burns on its own.

---

## 二 · No Extra Light When the Tide Recedes

When the tide is in, the lamp shows the chapel fully: the slim sand table, the tide-tables lying open. When the tide goes out, the chapel lights nothing extra for any traveler — it does not dim, it does not guide, it simply remains where it always is.

The tide performs its own withdrawal, on its own schedule, in its own order. The lamp is not the sea's concern — it neither brightens to invite, nor dims to excuse leaving.

**锚句**：潮退时礼拜堂不为任何人额外亮灯——灯没变，退潮只是自己退了。

**Anchor sentence**: when the tide receded, the chapel lit no extra lamp for anyone — the lamp did not change; the sea simply withdrew.

---

## 三 · The Watchers Never Name That Lamp

The Night Watchers never give the lamp a name. They do not call it Wan-Yan or the Eighth Lamp — it is just "the lamp."

The 41st Convocation minutes never recorded its name either. It belongs to no register, no ceremony, no inventory; it simply exists, lit, watched.

**锚句**：礼拜堂没有人给那盏灯起名——那盏灯从来没登记过。

**Anchor sentence**: no one in the chapel ever gave the lamp a name — the lamp never made it into any register.

---

## 四 · The Lamp and the Sea Act on Their Own

The sea comes and goes; the lamp remains where it is. The sea is not responsible for the lamp, nor the lamp for the sea.

The lamp does not summon anyone to stay, and the tide does not invite anyone to leave. The institute never issues a decree on what must be done when the tide withdraws.

The Convocation has never had an agenda item titled "spare lighting during low tide." The sea withdrew of its own accord; no one was inconvenienced.

**锚句**：潮候院从不发号召——潮候海退是自己的退，灯亮是灯自己的亮。

**Anchor sentence**: the institute never issues commands — the sea withdraws of its own accord; the lamp burns of its own accord.

---

## 五 · Mapping（Echo No. 10 → world model）

| 类别 | 标题 | 对应节 |
|---|---|---|
| lore | 潮退时没有人点灯 · 潮候院灯自亮 | 一、二、四、五 |
| geography | 礼拜堂 · 第八盏灯 · 潮候院礼拜空间 | 一、二、三、四 |
| characters | 守夜人 · 那盏从未被名册登记的灯 | 一、三、四 |
| story | Tide's Retreat at the Chapel · Echo No. 10 | 一、二、三、四、五 |
| items | 那盏灯 · 潮候海 · 潮沙盘 | 一、二、三、四 |
| history | 第四十一次大会散会后 · 礼拜堂始终亮着 | 一、二、三、四 |

> 礼拜堂的灯从来没被点亮——它只是没有被熄灭过。
> The chapel's lamp has never been lit; it just has never been unlit.
`,
  },
  {
    order: 11,
    slug: 'echo-011-the-door-the-chapel-never-locked',
    titleZh: '祠殿堂没有锁的门',
    titleEn: 'The Door the Chapel Never Locked',
    eraLineZh: '纪元：潮候院 · 祠殿堂 · 第四十一次大会散会之后——门一直开着，也一直没有锁。',
    eraLineEn: 'Era: the Institute — the chapel — after the 41st Convocation; the door was always open and never locked.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 11): The Door the Chapel Never Locked

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给那扇守夜人从来没有关上也从不锁上的门——它不算谁的防线，潮汐才是它的看门人。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the door the Night Watchers never closed and never locked — it is no one's defense; the tide is its doorkeeper.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 祠殿堂 · 第四十一次大会散会之后——门一直开着，也一直没有锁。
> Era: the Institute — the chapel — after the 41st Convocation; the door was always open and never locked.

---

## 一 · 门从来是开着的

祠殿堂的门从潮候院立院那天起，就没有被关上过。
大会重装祠殿堂的时候——新的潮候表、新的乐器、新的凳子——门还是原来的门，开着。

守夜人说，门开着，祠殿堂才像祠殿堂；把门关上，这里就只是一间房了。

**锚句**：祠殿堂的门从来不是为别人开的——它只是没有被关上。
**Anchor sentence**: the chapel door was never opened for anyone — it just was never closed.

---

## 二 · 里面没有值得带走的

门不锁，是因为锁不住里面任何东西——这不是疏忽，是算过的。

潮沙盘上的沙是数过的；潮候表摊开着，谁都能抄，抄完就是自己的；
灯那样的东西，拿不走，只能带着看。

守夜人偶尔提醒来人：这里没有可以拿的，只有可以看的。

**锚句**：祠殿堂里没有值得带走的东西——能被带走的，不值得留下。
**Anchor sentence**: there is nothing worth taking in the chapel — what can be taken is not worth keeping.

---

## 三 · 潮才是那把钥匙

门不锁，门自己知道什么时候该被推开、什么时候该被推。

涨潮的傍晚，门看起来比平时窄一些——不是有人把它掩上了，是海从外面往回收，人从外面往里走。
退潮的清晨，门又显得很松，很宽，来的人不用敲。

守夜人不管门，潮管门；潮从来不告诉任何人自己几点关门。

**锚句**：祠殿堂的门只认一把钥匙——潮。涨潮时进不来的人，退潮时也不必急着进。
**Anchor sentence**: the chapel door knows one key — the tide; whoever cannot come in at high tide need not hurry at low tide either.

---

## 四 · 没有人给门安锁

守夜人里最老的那一位说，有一次来了一个专做门锁的客人，看了门很久，留下一把锁，一把钥匙，说：这个放你们这儿。

他没有说为什么。守夜人收了锁，没有挂上去；第二年潮沙盘上的海盐分出了潮痕，那把锁被潮气氧化得一层绿，成了潮沙盘旁边的一块石头。

祠殿堂没有锁的门，从来没有人给它安过锁——潮沙盘旁边的那块绿氧化铁，谁都看得见，谁都不记名。

**锚句**：守夜人从来没有给这扇门安过锁——它守的不是里面的东西，是时间的刻度。
**Anchor sentence**: the Night Watchers never fitted the door with a lock — it does not guard what is inside; it keeps the rhythm of the hours.

---

## 五 · 门 与 灯 同在，不互指

门从不替灯说话——灯也从不替门解释。
它们是同一座建筑里的两件沉默：一个开着，一个亮着——都不拉谁进去，也都不拦谁出来。

祠殿堂的纪律不是「保持大门常开」，也不是「永远不能锁」——是根本没有人为这道门订过规矩。
规矩是潮汐表给出的，潮汐表是潮候院抄的，抄的本子是潮候院给里巷子里有需要的人抄的。
门只是开着——像潮一样。

**锚句**：祠殿堂的门从来没有被写进过什么规矩——它只是开着，像潮一样。
**Anchor sentence**: the chapel door was never written into any rule — it simply stands open, the way the tide does.

---

## 六 · 映射（回响十一章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 门不用锁 · 潮沙盘上的绿铁 | 一、二、三、四 |
| geography | 祠殿堂 · 门口的潮印 · 潮沙盘一侧 | 一、二、三、六 |
| characters | 守夜人 · 做锁的旧匠人 | 三、四、五 |
| story | 没锁的门 · 回响（其十一） | 全篇 |
| items | 潮沙盘 · 绿氧化铁（从未挂上过的旧锁） | 二、三、四、五 |
| history | 第四十一次大会之后门口的纪录 | 一、三、四、六 |

> 祠殿堂的门从来没有锁上——潮来的时候，它自己替海收了一寸；退潮的时候，它自己还给海一寸。
> The chapel's door was never locked — when the sea returned it gave the sea an inch; when the sea withdrew it the door took it back, unasked.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其十一）「祠殿堂没有锁的门」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给那扇守夜人从来没有关上也从不锁上的门——它不算谁的防线，潮汐才是它的看门人。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the door the Night Watchers never closed and never locked — it is no one's defense; the sea is its doorkeeper.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 祠殿堂 · 第四十一次大会散会之后——门一直开着，也一直没有锁。
> Era: the Institute — the chapel — after the 41st Convocation; the door was always open and never locked.

---

## 一 · The Door Is Never Shut

The chapel's door has never been locked since the Institute first took shape. Even during the 41st Convocation — with the new tide-tables stacked, new instruments carried in — the door remained the same door, standing open.

The Night Watchers say: while the door stands open, the chapel remains a chapel; shut it, and this is only a room.

**锚句**：祠殿堂的门从来不是为别人开的——它只是没有被关上。
**Anchor sentence**: the chapel door was never opened for anyone — it just was never closed.

---

## 二 · There Is Nothing Worth Taking

No lock, because nothing inside can be locked up — this was not oversight; it was a reckoning.

The sand on the tide-sand table has been counted; the tide-tables lie open, copyable by anyone — a copied table is one's own; the lamp cannot be carried away, only witnessed.

The watchers occasionally remind whoever arrives: nothing here can be taken, only seen.

**锚句**：祠殿堂里没有值得带走的东西——能被带走的，不值得留下。
**Anchor sentence**: there is nothing worth taking in the chapel — what can be taken is not worth keeping.

---

## 三 · The Tide Is the Only Key

The door is not locked — and the door knows when to be pushed open and when to be pushed.

At the falling tide in the late afternoon, the door looks narrower than usual — not because someone closed it, but because the sea is gathering at the horizon, and people come from the far side.
In the early morning near low tide it looks loose again, wide, and no one needs to knock.

The Night Watchers do not tend the door — the tide tends the door; and the tide never tells anyone the hour at which it locks.

**锚句**：祠殿堂的门只认一把钥匙——潮。涨潮时进不来的人，退潮时也不必急着进。
**Anchor sentence**: the chapel door knows one key — the tide; whoever cannot come in at high tide need not hurry at low tide either.

---

## 四 · No One Ever Fitted a Lock

The eldest of the Night Watchers recalls: once a stranger came, a man who made door-locks. He studied the door for a long time, then left a lock and a key behind: put this where you need it, he said.

He gave no reason. The watchers took the lock, but never hung it; the next year the salt of the tide-sand table weathered it into a layer of green, and it became one more green stone beside the sand table.

No one in the chapel has ever fitted the door with a lock — the green-oxidised iron beside the sand table sits there for anyone to see, and no one has ever claimed it.

**锚句**：守夜人从来没有给这扇门安过锁——它守的不是里面的东西，是时间的刻度。
**Anchor sentence**: the Night Watchers never fitted the door with a lock — it does not guard what is inside; it keeps the rhythm of the hours.

---

## 五 · The Door and the Lamp, Neither Speaks for the Other

The door never speaks for the lamp — the lamp never explains the door.
They are two silences in the same building: one open, one lit — neither pulls anyone in, neither pushes anyone out.

The chapel has never decreed "keep the main door open," nor decreed "never lock it" — no one ever made a rule for this door at all.
The rules come from the tide-tables; the tide-tables are the copy the Institute keeps; the copies are shared with those who need them in the alleyway.
The door simply stands open — the way the tide does.

**锚句**：祠殿堂的门从来没有被写进过什么规矩——它只是开着，像潮一样。
**Anchor sentence**: the chapel door was never written into any rule — it simply stands open, the way the tide does.

---

## 六 · Mapping（Echo No. 11 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The un-locked door · the green iron on the sand table | 一、二、三、四 |
| geography | The chapel · the tide-marks at the threshold · the sand table | 一、二、三、六 |
| characters | The Night Watchers · the lock-maker who left without a reason | 三、四、五 |
| story | The Door the Chapel Never Locked · Echo No. 11 | 全篇 |
| items | The tide-sand table · the green-oxidised iron · the salt-staying tide-marks | 二、三、四、五 |
| history | The record at the threshold after the 41st Convocation | 一、三、四、六 |

> 祠殿堂的门从来没有锁上——潮来的时候，它自己替海收了一寸；退潮的时候，它自己还给海一寸。
> The chapel's door was never locked — when the sea returned it gave the sea an inch; when the sea withdrew, the door gave it back, unasked.
`,
  },
  {
    order: 12,
    slug: 'echo-012-the-echo-that-only-comes-when-the-tide-is-out',
    titleZh: '潮落时才有的回声',
    titleEn: 'The Echo That Only Comes When the Tide Is Out',
    eraLineZh: '纪元：潮候院 · 祠殿堂 · 第四十一次大会散会之后——潮落的下午、潮候院的值守时刻。',
    eraLineEn: 'Era: the Institute — the chapel — after the 41st Convocation; late afternoons at low tide, during the watch hours.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 12): The Echo That Only Comes When the Tide Is Out

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿堂里那道潮落时才有的回声——潮涨时什么也听不见；潮落时，什么都说得见。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the echo in the chapel that only arrives when the tide goes out — nothing can be heard at high tide; at low tide, everything is said.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 祠殿堂 · 第四十一次大会散会之后——潮落的下午、潮候院的值守时刻。
> Era: the Institute — the chapel — after the 41st Convocation; late afternoons at low tide, during the watch hours.

---

## 一 · 潮落才进得来

祠殿堂里的回声不是一年到头都有。
潮候院抄的潮汐表上，一天里有两扇近乎无声的时段——潮在线，就是潮起潮落的那两个时刻，
海面低下去，声音才肯从墙缝里走进来。

涨潮的时候，祠殿堂里只有人说话的声音，没有任何回声；
潮候院的抄本都记着：潮落下午的三刻前后，最宜听潮。

**锚句**：祠殿堂的回声只在潮落时造访——涨潮时，声音走的是别的路。
**Anchor sentence**: the chapel's echo only visits at low tide — at high tide, the voices take another road.

---

## 二 · 回声从不说原因

听潮的人听了几年以后才渐渐确定：潮声不给他们的任何问题答话。
它不说潮来了为什么，也不说潮去了为什么——只说海现在在哪里。

有过一次守夜人记下："潮没有要解释的话，它只是在报点名。"
听潮人里没有谁能从潮声里听到命令、安慰或威胁——听了多年以后，他们听到的是度量，不是意图。

**锚句**：潮声里从来没有原因，只有位置——它只说海现在在哪里。
**Anchor sentence**: the tide's voice never carries causes, only positions — it only says where the sea is now.

---

## 三 · 守夜人从不复述

守夜人中最老的那位被问过潮声说了什么：

他回："潮说的，是潮的。墙听见的，是墙的。这里没有谁拿潮的话做自己的话。"

潮落之后，来问过潮声的客人没有人得到过一次转述；潮候院的任何档案、
任何抄本、任何大会记录上，都找不到一句"潮说"——这是潮候院第一大忌：替别人说话。

**锚句**：祠殿堂里没有转述——潮说了什么，进门的人自己听。
**Anchor sentence**: there is no re-telling in the chapel — what the tide said, whoever came in hears it themselves.

---

## 四 · 墙 门 潮 人，各有归于

祠殿堂的墙在回声里先说话——墙是潮候院自己运来的砖，一块一块的；
墙比门老，比大会老，比任何一位守夜人都老。

回声碰到门先矮一寸，碰到墙再老练一格，最后落到听潮人耳朵里的时候，
已经分不出这声音是潮的、海的、墙的，还是当晚的值守漏记的打点声。

听潮人里有人说，这里的回声不是建筑的——是建筑的回声。

**锚句**：祠殿堂的回声不是谁的声音——它是建筑自己，照了一面海的样子。
**Anchor sentence**: the chapel's echo belongs to no voice — the building itself, mirroring the sea in its own grain.

---

## 五 · 没有人给回声认过主

潮候院里没有哪一页说"这片回声属于某某"；做大会记录的人写的是潮汐，不是回声。

有人问过一位守夜人："潮声这样大，里面会不会有人？"
他说："里面没有人，里面只有潮——潮落的时候才有，潮涨的时候都退了。"

祠殿堂里最老的那面墙一直不问这个问题；墙做过潮，墙也见过潮走。
回声不是人，不是海，不是墙——它只是祠殿堂在潮落时照出来的一面。

**锚句**：祠殿堂的回声从来没有人认过主——它属于经过它的潮，经过它的人。
**Anchor sentence**: the chapel's echo has never been claimed by anyone — it belongs to the tide that passes through it, and to whoever passes through it too.

---

## 六 · 映射（回响十二章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 潮落时才有的回声 · 潮汐的两扇静音 | 一、二、三、五 |
| geography | 祠殿堂 · 墙缝 · 潮候院的抄本 | 一、四、六 |
| characters | 守夜人 · 听潮人 · 查抄本的人 | 一、二、三、五 |
| story | 潮落之声 · 回响（其十二） | 全篇 |
| items | 潮汐表 · 值守记录本 · 墙里的盐纹 | 一、二、四 |
| history | 第四十一次大会之后潮落的值守记录 | 一、二、五、六 |

> 潮落的时候祠殿堂才有声音——潮从来不说原因，只报海的方向；回音也从来不认人。
> When the tide is out the chapel finally speaks — the sea never says why, only where it is; the echo never says whose either.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其十二）「潮落时才有的回声」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿堂里那道潮落时才有的回声——潮涨时什么也听不见；潮落时，什么都说得见。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the echo in the chapel that only arrives when the tide goes out — nothing can be heard at high tide; at low tide, everything is said.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 祠殿堂 · 第四十一次大会散会之后——潮落的下午、潮候院的值守时刻。
> Era: the Institute — the chapel — after the 41st Convocation; late afternoons at low tide, during the watch hours.

---

## 一 · It Only Comes In At Low Tide

The echo inside the chapel is not present all year.
On the tide-tables the Institute copies, each day has two nearly-silent hours — those arrive at the moments the sea crosses its own line, when the water withdraws, and the sound finally can walk in through the creases between stones.

At high tide the chapel holds only people's voices, and no echo at all.
The copies all mark it: the three moments after the tide turns at late afternoon — the hour most fitted for hearing.

**锚句**：祠殿堂的回声只在潮落时造访——涨潮时，声音走的是别的路。
**Anchor sentence**: the chapel's echo only visits at low tide — at high tide, the voices take another road.

---

## 二 · The Echo Never Says Why

Whoever has listened to the tide for years comes to one certainty: the tide's voice answers no question of theirs.
It does not say why the tide comes, nor why it goes — only where the sea is now.

One watcher once noted: "the tide has nothing to explain; it is only calling the roll."
No listener ever heard commands, consolation, or threats in the tide's voice — after years, they hear measurement, not intent.

**锚句**：潮声里从来没有原因，只有位置——它只说海现在在哪里。
**Anchor sentence**: the tide's voice never carries causes, only positions — it only says where the sea is now.

---

## 三 · The Watchers Never Repeat It

The eldest of the Night Watchers was asked once what the tide had said:

He answered: "what the tide said belongs to the tide. What the wall heard belongs to the wall. No one here takes the tide's words for their own."

No visitor who asked was ever given a re-telling after a low tide; no archive of the Institute, no copy, no record of any Convocation contains a single line of "the tide said" — that is the Institute's first prohibition: to speak for another.

**锚句**：祠殿堂里没有转述——潮说了什么，进门的人自己听。
**Anchor sentence**: there is no re-telling in the chapel — what the tide said, whoever came in hears it themselves.

---

## 四 · Wall, Door, Tide, Person — Each Keeps to Their Own

The chapel's wall came first: the brick the Institute shipped in, brick by brick.
The wall is older than the door, older than the Convocation, older than any one of the Night Watchers by far.

The echo dims a little against the door, steadies another notch against the wall, and by the time it arrives at a listener's ear, no one can tell whether that voice
belongs to the tide, the sea, the wall, or to the watch-mark someone forgot to log that evening.

Some of the listeners say: this echo does not belong to the building — it is the building's echo.

**锚句**：祠殿堂的回声不是谁的声音——它是建筑自己，照了一面海的样子。
**Anchor sentence**: the chapel's echo belongs to no voice — the building itself, mirroring the sea in its own grain.

---

## 五 · No One Has Ever Claimed It

No page in the Institute's records ever says "this echo belongs to so-and-so"; the people keeping the Convocation minutes wrote down the tides, never the echoes.

Someone asked a watcher: "if the tide gets this loud, is there anyone inside it?"
He said: "there is no one inside — there is only the tide. It comes at low tide and withdraws at high tide."

The oldest wall in the chapel has never asked that question; this wall has gone through tides, and it has seen tides go.
The echo is not a person, not the sea, not the wall — it is the chapel's own reflection at low tide.

**锚句**：祠殿堂的回声从来没有人认过主——它属于经过它的潮，经过它的人。
**Anchor sentence**: the chapel's echo has never been claimed by anyone — it belongs to the tide that passes through it, and to whoever passes through it too.

---

## 六 · Mapping（Echo No. 12 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The echo that only comes at low tide · the two silent hours of the day | 一、二、三、五 |
| geography | The chapel · the seam between the stones · the Institute's copies | 一、四、六 |
| characters | The Night Watchers · the listeners · the copyists | 一、二、三、五 |
| story | The Voice at Low Tide · Echo No. 12 | 全篇 |
| items | The tide-tables · the watch logbook · the salt-rings in the wall | 一、二、四 |
| history | The watch entries kept after the 41st Convocation | 一、二、五、六 |

> 潮落的时候祠殿堂才有声音——潮从来不说原因，只报海的方向；回音也从来不认人。
> When the tide is out the chapel finally speaks — the sea never says why, only where it is; the echo never says whose either.
`,
  },
  {
    order: 13,
    slug: 'echo-013-the-convocation-nobody-called',
    titleZh: '潮候院没有叫过的那一声会',
    titleEn: 'The Convocation Nobody Called',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——大会该召集的那几次潮起潮落，谁也没有召集它。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; on every tide that could have hosted it, no Convocation was ever called.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 13): The Convocation Nobody Called

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给那场潮候院想开也一直没开成的第五十一次大会——潮候院抄潮汐表，是因为大会从来不能由人召集。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the 51st Convocation the Institute wanted to hold and never could — the Institute copies tide-tables because a Convocation cannot be called by people.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——大会该召集的那几次潮起潮落，谁也没有召集它。
> Era: the Institute — after the 41st Convocation; on every tide that could have hosted it, no Convocation was ever called.

---

## 一 · 叫不响的会

第五十一次大会还从来没开成过。

散会之后，潮候院里的人一度以为这一切会自动降临：第四十二次，第四十三次——像前面四十一个一样。
可潮汐表上每一次潮到线，第五十一次都没有人点火。

没有第四十二次，也没有第五十一次——第四十一次之后，潮候院的位上没有人叫过第五十。

**锚句**：潮候院从那以后再也没有人叫过下一场大会——潮起潮落替它们把这一声叫了出去。
**Anchor sentence**: after that, no one at the Institute ever called the next Convocation — the tides called it in their place.

---

## 二 · 召集函一直没写

守夜人里提过一次："要不要写一封召集函？"

没人应。不是不想——是没有人能替潮汐落笔第一句："现在可以了。"
潮候院的抄本里从来没有哪一行以这句话开头。

函的那一栏一直空着，潮沙盘旁边那一摊空纸一直空着——直到潮来纸就湿，潮去纸就皱了。

**锚句**：第五十一次的召集函谁也没写——没有人替海落笔第一句"现在可以了"。
**Anchor sentence**: the invitation for the 51st Convocation was never written — no one could write the sea's opening line, "now it is permitted."

---

## 三 · 潮汐表为什么抄了四十一遍

抄潮汐表的人后来想通了一件事：潮候院抄潮汐表不是为了办什么，是为了辨认——
辨认哪一次潮起落，足以坐下来；哪一次又只能站起来。

潮汐表上一年两季的转潮记录，没有一桩是给大会用的。
它们全是潮候院抄来的唯一一句"现在可以坐下来了"的回声。

第四十一次大会坐上去的人是潮替他们决定的。潮这次也替他们决定了。

**锚句**：潮候院抄潮汐表不是替大会排期——抄的是那个"现在可以了"到底是哪一天。
**Anchor sentence**: the Institute copies tide-tables not to schedule Convocations — it copies them to know exactly which tide is "now, it is permitted."

---

## 四 · 守夜人在等什么

守夜人里最大的那一位对新来的人说：

"我们在等的不是大会召集令，是那一次潮。第五十一次潮汐到了，桌子多长、几个人坐、开到几个时辰，
你们知道都写在哪里么？"

新来的人摇头。

他说，都写在潮汐表上——潮打到哪一刻落哪一刻，沙盘上的海盐醒哪一刻，
谁都没有抄这些潮走的痕迹为了开大会的事——抄这些潮，是潮候院抄自己的生活。

**锚句**：守夜人等的从来不是大会——等的是潮；潮到了，大会自然就到了。
**Anchor sentence**: the Night Watchers never waited for a Convocation — they waited for the tide; when the tide comes, the Convocation comes with it.

---

## 五 · 潮候院里没有人把它算作缺席

潮候院里没有人管"第五十一次算不算数"这种问题。

第五十一次大会从来没召集过，也没有人把它登记、撤销或续上名册；
它只是潮汐表上的一段潮，翻过、合上，和其他的潮一起躺在潮候院的书橱里。

有一位客人问过走廊尽头的守夜人："如果一直没潮汐合适，那就永远没有第五十一次了？"
他说："那潮候院就省下了一封函。"
他没有说这是遗憾还是清闲——潮候院的人很少提"等"这个字。

**锚句**：第五十一次大会从来不算缺席——它只是潮候院还没有遇上的一段潮。
**Anchor sentence**: the 51st Convocation was never missed — it is only a stretch of tide the Institute has not yet met.

---

## 六 · 映射（回响十三章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 抄潮汐表 · 替海落笔 · 省函 | 一、三、四、五 |
| geography | 潮候院 · 潮沙盘旁 · 书橱里的四十一本潮汐表 | 一、二、四、六 |
| characters | 守夜人 · 新来的（没进过大会）· 潮沙盘旁 | 三、四、五 |
| story | 潮汐表上的第五十一页 · 回响（其十三） | 全篇 |
| items | 潮沙盘 · 四十一本潮汐表 · 湿皱的空纸 | 一、二、三 |
| history | 第四十一次大会散会之后 · 第五十一次没有召集 | 一、二、五、六 |

> 潮候院没有叫过第五十一次大会——潮候院抄潮汐表不是为了叫会，是为了辨认那一句"现在可以了"。
> The Institute never called a 51st Convocation — it copies tide-tables not to convene anyone, but to recognise that one line, "now it is permitted."
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其十三）「潮候院没有叫过的那一声会」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给那场潮候院想开也一直没开成的第五十一次大会——潮候院抄潮汐表，是因为大会从来不能由人召集。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the 51st Convocation the Institute wanted to hold and never could — the Institute copies tide-tables because a Convocation cannot be called by people.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——大会该召集的那几次潮起潮落，谁也没有召集它。
> Era: the Institute — after the 41st Convocation; on every tide that could have hosted it, no Convocation was ever called.

---

## 一 · The Convocation That Cannot Be Called

The 51st Convocation has never been held.

After it dispersed, people at the Institute imagined it would just happen, as the other forty-one had — the 42nd, the 43rd, all would arrive in order.
On every tide that climbed to the line, nobody lit the fire for the 51st.

There is no 42nd, no 51st — after the 41st Convocation, no chair left in the Institute called the 50th either.

**锚句**：潮候院从那以后再也没有人叫过下一场大会——潮起潮落替它们把这一声叫了出去。
**Anchor sentence**: after that, no one at the Institute ever called the next Convocation — the tides called it in their place.

---

## 二 · The Invitation Was Never Written

One of the Night Watchers proposed: "Should we write an invitation?"

No one answered. Not because they did not want to — but because no one there could write the sea's first line: "now it is permitted."
No page in the Institute's copies ever begins with that sentence.

That page stayed blank; the blank sheets beside the sand table stayed blank — until the tide came and dampened them, and went and curled them.

**锚句**：第五十一次的召集函谁也没写——没有人替海落笔第一句"现在可以了"。
**Anchor sentence**: the invitation for the 51st Convocation was never written — no one could write the sea's opening line, "now it is permitted."

---

## 三 · Why the Tide-Tables Are Copied Forty-One Times

Whoever copies the tide-tables eventually understands: the Institute does not copy them to do anything — it copies them to recognise, because a Convocation cannot be called by will.

Between the yearly tide lines, no single entry marks a Convocation.
They are all just the same echo: "the moment you could be seated, and it has never come."

Everyone who sat down to the 41st Convocation was placed there by the tide. This time the tide decided again.

**锚句**：潮候院抄潮汐表不是替大会排期——抄的是那个"现在可以了"到底是哪一天。
**Anchor sentence**: the Institute copies tide-tables not to schedule Convocations — it copies them to know exactly which tide is "now, it is permitted."

---

## 四 · What the Night Watchers Wait For

The eldest of the Night Watchers said to a new arrival:

"We are not waiting for a Convocation order. What we wait for is one tide. When the 51st tide arrives, when the table is set to length, who sits, and at which hour it closes — where do you think all of that is written?"

The new arrival shook their head.

He said: it is all written in the tide-tables. Where the tide reaches, when it withdraws, which grain of salt wakes on the sand table — nobody copies these for the Convocation's sake.
They copy them because this is what the Institute copies to live by.

**锚句**：守夜人等的从来不是大会——等的是潮；潮到了，大会自然就到了。
**Anchor sentence**: the Night Watchers never waited for a Convocation — they waited for the tide; when the tide comes, the Convocation comes with it.

---

## 五 · No One Counts It as Missing

No one at the Institute bothers with the question "does the 51st count as missed."

It has never been called, registered, revoked, or resumed;
it is just another tide printed into the tables the Institute keeps, turned over and closed, filed with all the others.

One visitor somewhere down the corridor asked a watcher: "if the tides never come at the right hour, then there will be no 51st, ever?"
He said: "then the Institute simply saves one invitation."
He did not say whether that was regret or a reprieve — the people here rarely say the word "wait."

**锚句**：第五十一次大会从来不算缺席——它只是潮候院还没有遇上的一段潮。
**Anchor sentence**: the 51st Convocation was never missed — it is only a stretch of tide the Institute has not yet met.

---

## 六 · Mapping（Echo No. 13 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | Copying the tide-tables · writing the sea's first line · saving a letter | 一、三、四、五 |
| geography | The Institute · the sand table · the forty-one tide-tables in the shelf | 一、二、四、六 |
| characters | The Night Watchers · the new arrival · those who read the tables | 三、四、五 |
| story | The 51st Page of the Tide-Table · Echo No. 13 | 全篇 |
| items | The tide-tables · forty-one copies · the damp and curled blank sheets | 一、二、三 |
| history | After the 41st Convocation · the 51st was never called | 一、二、五、六 |

> 潮候院没有叫过第五十一次大会——潮候院抄潮汐表不是为了叫会，是为了辨认那一句"现在可以了"。
> The Institute never called a 51st Convocation — it copies tide-tables not to convene anyone, but to recognise that one line, "now it is permitted."
`,
  },
  {
    order: 14,
    slug: 'echo-014-the-cover-of-the-tide-table',
    titleZh: '潮汐表的封面',
    titleEn: 'The Cover of the Tide-Table',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——封面潮湿的傍晚。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; a damp evening with tide-tables in hand.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 14): The Cover of the Tide-Table

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给每一册潮汐表的封面：那个没有名字的潮候院、那些本子的外表、封面的石纹。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for every tide-table's cover: the nameless Institute, the covers that keep the tables dry, the grain the salt grew there.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——封面潮湿的傍晚。
> Era: the Institute — after the 41st Convocation; a damp evening with tide-tables in hand.

---

## 一 · 本子都没有名字

潮候院抄的每一本潮汐表，封面上都没有名字。

第一本是从潮起的刻度开始记的；第二本接得上。往后的本子彼此接得上；它们的封面上没有写谁抄的、
抄了多久、何时可以翻还；抄到潮涨的那几页都有水痕——潮汐表是潮候院抄给自己看的。

**锚句**：潮候院抄的每一本潮汐表，封面上从来没有写过任何人的名。
**Anchor sentence**: no tide-table the Institute ever copied carries anyone's name on its cover.

---

## 二 · 封皮不是纸

早些年潮候院用纸做过封皮，潮落的傍晚潮来了，纸卷了边，字纹洇开了一点。
那几本表散了色、潮了角——客人看到它们湿成石头里夹着的纸，再没有人再提起纸封皮这件事。

后来潮候院一律改用薄石片做封皮：抄潮汐表的手先把潮抄进表，再把潮候院的封皮交给海——
先薄、先实、先不替海管一整年的事。

**锚句**：潮汐表的封皮不是纸——潮起过的地方，纸站不住；潮候院用石头做封面。
**Anchor sentence**: tide-tables were never covered in paper — where tides have passed, paper does not hold; the Institute covers them in stone.

---

## 三 · 封面没人给潮候院签名

封皮尽头有人看到过一行字："潮汐表 —— 抄给里潮巷有需要的人。"
这不是指令，也不是广告；写字的人也不知道自己是不是该签名。

潮候院的封面里从来没有出现过任何一个署上去的名字——谁抄了、谁翻了、谁归还了，潮候院的封皮上没有。
封皮上的字迹，只有潮汐表本身的潮汐记录，和几代潮候院誊抄的人出于职责顺手添上的三五处笔记。

**锚句**：潮候院的封面上没有名字——抄是潮候的事，不是抄的人的事。
**Anchor sentence**: no tide-table's cover carries a name — copying belongs to the Institute, not to the copyist.

---

## 四 · 潮候院的封面怎么处理坏本子

潮候院抄本朽了、潮断了或潮干了的时候：坏本子不扔——潮候院把它们归档到潮汐表的旧书橱，
书橱里的旧潮汐表从不拨算，因为它们抄的潮已经过去，旧了也旧潮；潮不能选退了哪一本，从某一本潮汐表上退掉。

有本潮汐表的封皮被潮啃掉了一块角，旧书橱不代抄——潮候院的规矩是：
一册潮汐表要就是整册算，要不就整册存潮落稿。半寸潮汐不签收。

**锚句**：坏了的潮汐表不重抄——潮候院只整册要、整册存，从没跟潮讨价还价。
**Anchor sentence**: a ruined tide-table is never recopied — the Institute takes a whole volume or none at all, and never bargains with the tide.

---

## 五 · 封皮是潮候院的说明书

新来的值守问起封皮为什么全用石——软皮不是更好拿？

老一位说："封皮不是盖住里面的，是让里面的潮候院留给人看得明白。"

抄潮汐表的年轻人私下里琢磨过几次往封皮上加装饰——没一个人最后去做；
潮候院里最烂潮汐的封面也要保持干净，它是抄本最先被看见的东西。
潮起过的，封皮最诚实。

**锚句**：潮汐表的封面不是装饰——它是潮候院为每一次潮起写下的那一行不会被海带走的字。
**Anchor sentence**: tide-table covers are not decoration — they are the one line the Institute writes about each tide that the sea cannot take with it.

---

## 六 · 映射（回响十四章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 本子没有名字 · 封皮不是纸 · 封皮的诚实 | 一、二、三、四 |
| geography | 潮候院 · 封皮的石取意地 · 旧书橱 | 二、三、四 |
| characters | 潮候院的值守 · 誊抄的人 · 里潮巷有需要的人 | 一、二、三、六 |
| story | 封皮石 · 回响（其十四） | 全篇 |
| items | 薄石封皮 · 旧书橱 · 抄本石柜 | 一、二、三、六 |
| history | 抄潮候院四十一本潮汐表 · 水痕 | 一、二、四、六 |

> 潮汐表的封面从来没有人签过名——抄的是潮，不是潮候院的人。
> No one ever signed a tide-table's cover — what was copied was the tide, not the Institute's copyists.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其十四）「潮汐表的封面」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给每一册潮汐表的封面：那个没有名字的潮候院、那些本子的外表、潮落时潮在去潮后写下的水痕。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for every tide-table's cover: the nameless Institute, the covers that keep the tables dry, the grain the sea writes there.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——封面潮湿的傍晚。
> Era: the Institute — after the 41st Convocation; a damp evening with tide-tables in hand.

---

## 一 · The Books Have No Names

Every tide-table the Institute ever copied carries no name on its cover.

The first book was begun from the moment the tide turned; the second follows from the first; the line runs unbroken after forty-one covers.
None of them says who copied, how long, or when it may be returned to shelf — they are copies for the Institute to see.

**锚句**：潮候院抄的每一本潮汐表，封面上从来没有写过任何人的名。
**Anchor sentence**: no tide-table the Institute ever copied carries anyone's name on its cover.

---

## 二 · The Cover Is Not Paper

In early years the Institute tried paper covers, and the tide turned damp and curled the leaves and blurred the lines.
Those volumes discoloured — the guests looked at them, damp slabs of leaves inside stone, and no one spoke in favour of paper again.

After that the Institute made every cover from thin slabs of stone: first let the tide write its lines on the pages, then let the stone hold them —
thin first, firm first, and never against the sea.

**锚句**：潮汐表的封皮不是纸——潮起过的地方，纸站不住；潮候院用石头做封面。
**Anchor sentence**: tide-tables were never covered in paper — where tides have passed, paper does not hold; the Institute covers them in stone.

---

## 三 · The Cover Carries Nobody's Name

On one cover a guest once saw a line of script:
"Tide-table — copied for those in the tide-alley who need it."
This is not a command, nor an advertisement; the writer did not know whether names were appropriate here or not.

No cover in the Institute ever bears a name written by the copyist — who copied it, who consulted it, who returned it: none.
The covers carry only the tide-lines that date the record and the few stray annotations made in duty by copyists over generations.

**锚句**：潮候院的封面上没有名字——抄是潮候的事，不是抄的人的事。
**Anchor sentence**: no tide-table's cover carries a name — copying belongs to the Institute, not to the copyist.

---

## 四 · What the Institute Does With Ruined Volumes

When a volume decays, the tide fails, or the paper goes blank: a ruined tide-table is never recopied — the Institute files it with the older volumes in the shelf,
which are never opened again, because their tide has passed; the tide never chooses which book is abandoned, but passes them down anyway.

One cover was eaten through at its rim — the shelf did not re-cover it: the Institute's rule is:
a whole volume is taken or none at all; half a volume is never accepted.

**锚句**：坏了的潮汐表不重抄——潮候院只整册要、整册存，从没跟潮讨价还价。
**Anchor sentence**: a ruined tide-table is never recopied — the Institute takes a whole volume or none at all, and never bargains with the tide.

---

## 五 · The Cover Is the Institute's Manual

A new watcher once asked why the covers are all stone — why not soft, tan linen for the shelf?

The eldest answered: "The cover is not to hide what is inside — it is for those outside to see what the Institute holds honestly."

The young copyists pondered how they might trim or ornament the covers; not one of them ever went through with it;
even the brownest, dampest tide-table's cover must stay clean — it is the first thing anyone sees of the copy.
Where the tide has passed, the cover is honesty.

**锚句**：潮汐表的封面不是装饰——它是潮候院为每一次潮起写下的那一行不会被海带走的字。
**Anchor sentence**: tide-table covers are not decoration — they are the one line the Institute writes about each tide that the sea cannot take with it.

---

## 六 · Mapping（Echo No. 14 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The nameless books · the covers that are not paper · the honesty of stone | 一、二、三、四 |
| geography | The Institute · the stone it took covers from · the old shelf | 二、三、四 |
| characters | The Night Watchers · the copyists · those of the tide-alley in need | 一、二、三、六 |
| story | The Stone Covers · Echo No. 14 | 全篇 |
| items | Stone covers · the old bookshelf · the tables in the stone cabinet | 一、二、三、六 |
| history | Forty-one tide-tables copied in the Institute · the watermarks | 一、二、四、六 |

> 潮汐表的封面从来没有人签过名——抄的是潮，不是潮候院的人。
> No one ever signed a tide-table's cover — what was copied was the tide, not the Institute's copyists.
`,
  },
  {
    order: 15,
    slug: 'echo-015-the-lamp-the-wine-shop-never-remembers',
    titleZh: '巷子深处那盏没人记得的灯',
    titleEn: 'The Lamp the Wine Shop Never Remembers',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——酒馆白灯的傍晚。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; an evening with the wine shop\'s lamp lit.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 15): The Lamp the Wine Shop Never Remembers

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院里巷子深处那间酒馆的灯——谁哪一晚要回来，灯从来不问。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the lamp in the alley wine shop — the one night it stayed on, nobody ever knew why.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——酒馆白灯的傍晚。
> Era: the Institute — after the 41st Convocation; an evening with the wine shop's lamp lit.

---

## 一 · 没人记得它是为谁亮的

里巷子里有一间酒馆，白日里看不见它在哪。

天刚近潮落的那刻，里巷顶头，白灯就先亮了——它一直挂得直流着。没有人记得酒馆是不是从远早时代留下的，
也没有人记得酒馆最后一位店主是谁。酒客们进门的时候只是被一盏灯和一个不算热的场子迎进来；
他们不会也没问为什么亮着。

**锚句**：巷子里的白灯从来没为谁亮过——它只是一直亮着。
**Anchor sentence**: the alley lamp was never lit for anyone — it simply stays on.

---

## 二 · 店主不劝人走

里巷子的酒馆店主从来不说一个"去"字。

客人喝多的时候也照给满——店主没有拒绝过谁的酒，也没人真的醉；潮落的傍晚潮候院的人常到里巷子，
喝到最后肯定不是斗酒，是他们自己没说，或者海潮刚好到了，客人起身回去。

守夜人来过几次——它从不说不欢迎；它只是一盏等人的灯。

**锚句**：酒馆的店主从来没说过"去"——海潮就常常替它说出来。
**Anchor sentence**: the wine shop's keeper never said the word "go" — the tide often said that for them.

---

## 三 · 从没歇业过那一夜

里巷子的老本子翻了几百页，没有说酒馆有过一晚不给客人点过酒。

第四十一次大会散会的时候，里巷子里的守夜人到过酒馆前的门廊，白灯还亮着；
散会后三年里潮候院的值守从没看见白灯灭下——
潮候院的研究生那段时间在里巷子住了一冬，写下过一句：里巷子的灯"那是它不关。"

**锚句**：里巷子的酒馆从来没有哪一夜熄过灯——住在潮候院不等于进了潮候院。
**Anchor sentence**: the alley wine shop has never had one dark night — living near the Institute is not living inside it.

---

## 四 · 账上只有瓶数

酒馆的账本有两种。

一种是客人临告别时自己记上的；另一种是店主替潮汐表里多到的客人开的——品种、瓶数；
从来没人写过谁的名字、谁的职称、谁的官。

潮候院的账簿能看见客人的身份是因为潮候院大会开的是全体潮候；酒馆连全体潮候是谁都没写。

**锚句**：酒馆的账本上只有数量——客人是谁，灯替人不记。
**Anchor sentence**: the wine shop's ledger holds only counts — who the guests were, the lamp never said.

---

## 五 · 它空的瓶不留续

酒罐见底的时候，店主把扣下的纸翻过来让客人看——里巷子里的酒客都知道：酒没了便没了。

酒馆不在空瓶里再装同一种酒，也没有哪天的白灯是用"再多一壶"来续的。
有人出过钱想替酒馆引一批新的泉水酒，店主说不——里巷子给潮落的人开灯，酒是它自己的见礼。
里巷子从来不会因为酒没了而散场——它本来就容得下没酒的晚上。

**锚句**：瓶子空了就是空了——酒馆不会给空瓶装上什么假的酒。
**Anchor sentence**: an emptied jar is simply empty — the shop never fills an emptied jar with any pretend wine.

---

## 六 · 映射（回响十五章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 白灯 · 里巷子酒馆 · 潮落的傍晚 | 一、三、五、六 |
| geography | 里巷子 · 酒馆门廊 · 潮候院的边缘 | 一、二、四、六 |
| characters | 酒馆白灯 · 守夜人 · 潮落时不走的客 | 二、三、四、五 |
| story | 潮落傍晚的酒馆 · 回响（其十五） | 全篇 |
| items | 酒罐 · 空瓶 · 账本上的瓶数 | 一、二、三、六 |
| history | 第四十一次大会散会后 · 里巷子的档案 | 一、二、三、六 |

> 里巷子里的那盏白灯从来没为谁亮过——它只是亮着，潮落之后它常常被人想起。
> The alley lamp never lit for anyone — it only stays on; after the tide goes out, it is often remembered.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其十五）「巷子深处那盏没人记得的灯」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院里巷子深处那间酒馆的灯——谁哪一晚要回来，灯从来不问。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the lamp in the alley wine shop — the one night it stayed on, nobody ever knew why.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——酒馆白灯的傍晚。
> Era: the Institute — after the 41st Convocation; an evening with the wine shop's lamp lit.

---

## 一 · The Lamp Is Not Remembered for Anyone

Somewhere in the back alley there is a wine shop. In daylight it is impossible to say exactly where.

At the hour the tide turns, the white lamp at the alley's head comes on again — it has always been hung with the same steady light. No one remembers whether this shop is older than the Institute,
or who the last keeper was. Guests come because a light and a quiet room call them in;
they have never asked why either.

**锚句**：巷子里的白灯从来没为谁亮过——它只是一直亮着。
**Anchor sentence**: the alley lamp was never lit for anyone — it simply stays on.

---

## 二 · The Keeper Never Says "Go"

The keeper of the alley wine shop has never uttered the word "go."

Guests who drink too much are still served — no one has ever been refused; none has truly been drunk either. The back-alley frequenters from the Institute arrive around low tide,
and those who leave leave of their own choosing, or because the tide came.

Night watchers have passed it more than once — it never once said not welcome; it is simply a lamp that waits for whoever arrives.

**锚句**：酒馆的店主从来没说过"去"——海潮就常常替它说出来。
**Anchor sentence**: the wine shop's keeper never said the word "go" — the tide often said that for them.

---

## 三 · The Night It Never Went Dark

Pages of the older accounts were turned; there is no record of a night in which the shop did not serve a guest.

When the 41st Convocation dispersed, watchers found the white lamp still lit at the shop's entry;
in the three years after the Convocation, the lamp over the wine shop did not go out.
A postgraduate staying in the back alley one winter wrote this: this lamp "just never closes."

**锚句**：里巷子的酒馆从来没有哪一夜熄过灯——住在潮候院不等于进了潮候院。
**Anchor sentence**: the alley wine shop has never had one dark night — living near the Institute is not living inside it.

---

## 四 · The Ledger Holds Only Counts

The ledger of the wine shop keeps two kinds of entries.

One: the guest writes what they consumed before leaving; the other: the keeper opens an account for visitors who arrive beyond measure —
their vessels, their bottles.
No record anywhere contains a name, a title, or an office.

The Institute can see a guest's standing because it holds the full membership list of its Convocation; the wine shop never held one.

**锚句**：酒馆的账本上只有数量——客人是谁，灯替人不记。
**Anchor sentence**: the wine shop's ledger holds only counts — who the guests were, the lamp never said.

---

## 五 · An Emptied Jar Stays Empty

When the jar runs low, the keeper turns over the paper where "empty" is written, and shows it to whoever is there — the regulars know: when it's gone, it's gone.

The alley's wine shop never refills an emptied jar with another batch, and no evening in memory ended because the wine gave out — the alley has rarely had that happen.
Guests heading home say nothing more; whoever did not get a pour did not go looking elsewhere — the alley holds a night with no wine, and the wine shop holds the people.

**锚句**：瓶子空了就是空了——酒馆不会给空瓶装上什么假的酒。
**Anchor sentence**: an emptied jar is simply empty — the shop never fills an emptied jar with any pretend wine.

---

## 六 · Mapping（Echo No. 15 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The white lamp · the alley wine shop · the hour of low tide | 一、三、五、六 |
| geography | The back alley · the wine shop's doorway · the edge of the Institute | 一、二、四、六 |
| characters | The lamp itself · the night watchers · the guests who do not leave | 二、三、四、五 |
| story | The Evening in the Alley · Echo No. 15 | 全篇 |
| items | The jars · the emptied bottles · the counts in the ledger | 一、二、三、六 |
| history | After the 41st Convocation · the back-alley file | 一、二、三、六 |

> 里巷子里的那盏白灯从来没为谁亮过——它只是亮着，潮落之后它常常被人想起。
> The alley lamp never lit for anyone — it only stays on; after the tide goes out, it is often remembered.
`,
  },
  {
    order: 16,
    slug: 'echo-016-the-four-small-shells-on-the-tide-sand-table',
    titleZh: '潮沙盘上那四只小贝壳',
    titleEn: 'The Four Small Shells on the Tide-Sand Table',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——午后潮候院抄本员整理潮沙盘的时刻。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; an afternoon for the shelf-tending shift.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 16): The Four Small Shells on the Tide-Sand Table

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮沙盘上那四只小贝壳——它们从来没有被过潮起潮落推动过；没人说得清是谁放的。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the four small shells on the tide-sand table — not shifted by the sand in centuries; nobody placed them with any hand.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——午后潮候院抄本员整理潮沙盘的时刻。
> Era: the Institute — after the 41st Convocation; an afternoon for the shelf-tending shift.

---

## 一 · 沙盘上不移动的东西

潮沙盘上摆着潮候院抄本员一又一代人的潮汐记录。

潮沙在盘上一寸寸流走，潮沙盘的其它记录能更新的都在更新——唯独那四只贝壳从来没改变过位置。
抄本员查过潮沙盘立院以来的每一次抄本：四只贝壳的位置与年龄早于潮沙盘本身。

**锚句**：潮沙盘上那四只小贝壳从来没有被潮沙推动过一毫毫。
**Anchor sentence**: the four small shells on the tide-sand table have never once been nudged by the sand.

---

## 二 · 没人摆过它们

潮候院的抄本员记录过潮沙盘上摆放的每一样东西——沙、筹算、潮汐铃、灯、船止符号。
从来没有贝壳在记录中出现。

最久远的抄本员证明过一次：潮沙盘立院以来，那四只贝壳就在原位。

**锚句**：四只贝壳没有时间被人摆过——它们是潮沙盘上早就有的东西。
**Anchor sentence**: the shells were never placed by any hand — they were already there when the sand table was made.

---

## 三 · 守夜人两年一清

守夜人每隔两年把潮沙盘上所有的器物都清点一次，唯独四只贝壳可以留在原地。

哪一只出现了裂纹，也不会被挪进潮候院研究员的桌面——里巷子的抄本员把它放回沙盘原位。
潮候院从来没拿这四只小贝壳作过实验样本：潮候院不是为贝壳，它只是潮沙盘的一部分。

**锚句**：守夜人两年一清的时候，四只贝壳只能留在原地——它们从不被随手拿起。
**Anchor sentence**: when the watchers inspect the table twice a year, the shells remain in their spots — they are never casually picked up.

---

## 四 · 潮候院不承认是供品

潮候院一度有人提出研究提案：把贝壳定为潮沙盘上的供品。

抄本员在大会上说过：潮沙盘不是供桌；供桌在第八盏灯之侧；四只贝壳不是仪式动作里摆上的东西，也不表示任何祭物。
议题散去，大会沉默。

**锚句**：潮沙盘的四只小贝壳不是供品——潮候院从来没拜它们。
**Anchor sentence**: the four small shells on the sand table are not offerings — the Institute never worshipped them.

---

## 五 · 贝壳就是潮沙盘

潮沙盘的作用是记录潮起潮落。

潮候院的研究员一度试图给四只贝壳作志：体积、年层、腐蚀度——抄本员阻止过所有的测量；锣鸣响之后，贝壳没有分给潮沙盘的作用份额，就没有能记录的东西。
贝壳就是潮沙盘的一部分；潮候院宁愿潮沙盘取掉贝壳也不能改贝壳。

**锚句**：贝壳是潮沙盘的一部分——潮候院宁愿潮沙盘没有贝壳也不能动它们。
**Anchor sentence**: the shells are a part of the tide-table itself — the Institute would rather the table go plain than move them.

---

## 六 · 映射（回响十六章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 沙盘上四只贝壳 · 潮候院的记录 · 守夜人两年一清理 | 一、二、三、六 |
| geography | 潮候院 · 潮沙盘 · 沙盘的方位 | 一、二、三、六 |
| characters | 潮候院抄本员 · 守夜人 · 潮汐铃的研究员 | 一、三、四、五、六 |
| story | 潮候院上四只贝壳 · 回响（其十六） | 全篇 |
| items | 潮沙盘 · 四只贝壳 · 潮汐表 · 潮汐铃 | 一、二、三、五、六 |
| history | 潮候院建院以来 · 第四十一次大会的沉默散会 | 一、二、三、五、六 |

> 潮沙盘上的四只小贝壳从来没被潮推动过——它们只是潮候院的一间盛天收藏。
> The four small shells have never been moved by the tide — they are the chapel's custody of the tide.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其十六）「潮沙盘上那四只小贝壳」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮沙盘上那四只小贝壳——它们从来没有被过潮起潮落推动过；没人说得清是谁放的。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the four small shells on the tide-sand table — not shifted by the sand in centuries; nobody placed them with any hand.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——午后潮候院抄本员整理潮沙盘的时刻。
> Era: the Institute — after the 41st Convocation; an afternoon for the shelf-tending shift.

---

## 一 · What the Sand Never Touched

The tide-sand table carries records written by generations of copyists.

The sand drifts across it, inch by inch, and every other record on the table can be refreshed or shifted — never those four shells.
The copyists checked every ledger since the table was made: the shells are older than the table itself.

**锚句**：潮沙盘上那四只小贝壳从来没有被潮沙推动过一毫毫。
**Anchor sentence**: the four small shells on the tide-sand table have never once been nudged by the sand.

---

## 二 · Nobody Ever Placed Them

The copyists recorded everything that was ever placed upon the tide-sand table — sand, counters, the tide-bell, the lamp, the marks for the boats.
Never once have the shells appeared in those records.

One of the earliest copyists established it in writing: from the day the tide-table was made, the shells have been at their places.

**锚句**：四只贝壳没有时间被人摆过——它们是潮沙盘上早就有的东西。
**Anchor sentence**: the shells were never placed by any hand — they were already there when the sand table was made.

---

## 三 · The Watchers Sweep Twice a Year

The watchers inspect the tide-sand table every two years; everything has to be counted except the four shells, which are allowed to remain.

If one shows a crack, the copyists carry it back to its spot — the Institute never takes the shells away for research;
they are not study objects; they belong to the table itself.

**锚句**：守夜人两年一清的时候，四只贝壳只能留在原地——它们从不被随手拿起。
**Anchor sentence**: when the watchers inspect the table twice a year, the shells remain in their spots — they are never casually picked up.

---

## 四 · The Institute Never Called Them Offerings

There was once a proposal to classify the shells as ceremonial offerings.

A copyist said in the Convocation: the sand table is not an altar; the altar stands beside the Eighth Lamp; the four shells are not elements of ritual; they mean no offering at all.
The matter was laid aside; the Convocation dispersed in silence — the shells stayed shells.

**锚句**：潮沙盘的四只小贝壳不是供品——潮候院从来没拜它们。
**Anchor sentence**: the four small shells on the sand table are not offerings — the Institute never worshipped them.

---

## 五 · They Are the Table

The table exists to record the tides.

Some researchers proposed taking measurements — size, rings, corrosion — the copyists forbade all of it; the tide-bell rings, the shells have no share in any classification; there is nothing to classify.
The shells are part of the table; the Institute would rather the table go plain than move them.

**锚句**：贝壳是潮沙盘的一部分——潮候院宁愿潮沙盘没有贝壳也不能动它们。
**Anchor sentence**: the shells are a part of the tide-table itself — the Institute would rather the table go plain than move them.

---

## 六 · Mapping（Echo No. 16 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | Four shells on the table · the copyists' records · the twice-yearly sweep | 一、二、三、六 |
| geography | The Institute · the tide-sand table · the altar beside the Eighth Lamp | 一、二、三、六 |
| characters | The copyists · the watchers · the researchers | 一、三、四、五、六 |
| story | The Four Shells · Echo No. 16 | 全篇 |
| items | The tide-sand table · the shells · the ledgers · the tide-bell | 一、二、三、五、六 |
| history | Since the Institute's founding · the silent dispersal of the 41st Convocation | 一、二、三、五、六 |

> 潮沙盘上的四只小贝壳从来没被潮推动过——它们只是潮候院的一间盛天收藏。
> The four small shells have never been moved by the tide — they are the chapel's custody of the tide.
`,
  },
  {
    order: 17,
    slug: 'echo-017-the-driftwood-nobody-split',
    titleZh: '祠殿后那一截没有人劈开的浮木',
    titleEn: 'The Driftwood Nobody Split for Firewood',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——腊月潮候院的清晨，浮木背着初雪。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; a cold-month morning, the driftwood holding the frost.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 17): The Driftwood Nobody Split for Firewood

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿后那一截来历不明的浮木——潮候院人把它叫「鲸」；
> 很长时间之后才形成了跟它问好的规矩。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the massive driftwood behind the chapel — the Institute calls it "the Whale";
> the habit of greeting it came only much later.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——腊月潮候院的清晨，浮木背着初雪。
> Era: the Institute — after the 41st Convocation; a cold-month morning, the driftwood holding the frost.

---

## 一 · 没有人说清它是从哪里来的

祠殿后的浮木是一段长大约六米的硬木，横在通往码头的小径上。

早些年值守里有人说它是南方某次风暴漂来的；有人说它是潮候院建院时剩下的木材；有人说它是当年海岸漂着一整条沉船的一部分。
每一种说法都有过支持者，没有一种说法是被证明过的。

**锚句**：祠殿后的浮木，谁也不知道它是从哪里来的——它只是一截从海里来的木头。
**Anchor sentence**: nobody knows where the driftwood behind the chapel came from — it is simply a log that arrived from the sea.

---

## 二 · 谁都刻了一个记号

里巷子的抄本员路过浮木的时候，口袋里常常带着一把小刀。

有人刻过船的轮廓；有人刻过某一届大会的年份；有人刻过一句谁的名字。
没有人刻了之后再把那道痕迹磨掉。

潮候院的规矩是：浮木是「留白」——谁想给它留点什么，浮木就接受；留什么、怎么留、留下之后谁都涉及谁，浮木不加评论。

**锚句**：浮木记着每个人留下的纹迹——谁都留过，谁都没擦过。
**Anchor sentence**: the driftwood remembers everyone's mark — every hand passed by, no hand ever rubbed it out.

---

## 三 · 谁都没劈过它

里巷子里缺柴的那几年，里巷子里提出过用浮木当柴火。

值守长的回答是：浮木不属于柴堆。
那一次以后从来没有人再提过这件事。

第四十一次大会散会后有一个新来的值守说过浮木的年轮太清，像一册没被点过的潮汐表——值守长一多没回答。

**锚句**：潮候院从来没有人劈过这截浮木——里巷子只会放它在那里，不会烧它。
**Anchor sentence**: nobody at the Institute ever split the driftwood — the alley leaves it where it lies; it is never burned.

---

## 四 · 浮木上慢慢长出了东西

贝壳、铜片、碎瓷、几枚没有抬走的铁钉——浮木上挂着的东西越来越多。

潮候院的值守两年一清的时候，贝壳成串粘在上面，撑着一年；新来的值守登记潮沙盘之前，把抄写潮沙盘残页放在浮木上。

**锚句**：潮候院的浮木上慢慢长满了贝壳和碎片——它是一截会收东西的木头。
**Anchor sentence**: the driftwood slowly filled with shells and fragments — it is a log that keeps whatever is given to it.

---

## 五 · 浮木永远没被拖走过

第四十一次大会之后，每一次台风、每一次潮汐变动，浮木都还在原处。

祠殿后的值守一度商量要把它清走以免挡路；决定拖走的那天，没人动得了——潮候院的值守之后就再没提过这件事。
它还躺在那里，任谁来了都坐。

**锚句**：浮木至今还没有被任何一批潮候院的人拖走过——潮候院最终决定留下它。
**Anchor sentence**: the driftwood has never been hauled away by anyone — the Institute eventually decided to leave it where it is.

---

## 六 · 映射（回响十七章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 里巷子 · 浮木 · 第四十一次大会后的值守项 | 一、三、四、五、六 |
| geography | 祠殿后 · 通往码头的小径 · 潮候院门廊 | 一、二、三、六 |
| characters | 里巷子的抄本员 · 值守长 · 新来的值守 | 一、三、四、五、六 |
| story | 祠殿后的浮木 · 回响（其十七） | 全篇 |
| items | 浮木 · 贝壳 · 铜片 · 小刀 · 铁钉 | 一、二、三、四、六 |
| history | 里巷子的规矩 · 第四十一次大会之后 | 一、二、三、五、六 |

> 祠殿后那截浮木从来没有被劈过——潮候院把它留在那里，是里巷子整族留下的东西。
> The driftwood behind the chapel has never been split — the Institute leaves it because the whole alley is part of it.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其十七）「祠殿后那一截没有人劈开的浮木」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿后那一截来历不明的浮木——潮候院人把它叫「鲸」；
> 很长时间之后才形成了跟它问好的规矩。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the massive driftwood behind the chapel — the Institute calls it "the Whale";
> the habit of greeting it came only much later.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——腊月潮候院的清晨，浮木背着初雪。
> Era: the Institute — after the 41st Convocation; a cold-month morning, the driftwood holding the frost.

---

## 一 · Nobody Knows Where It Came From

The driftwood behind the chapel is a length of hard timber, about six meters long, lying across the path to the pier.

Some of the watchers said it was carried in by a storm from the south; others said it was leftover timber from when the Institute was built; others said it was part of a sunken ship once stranded off this coast.
Each claim has had its defenders; none has been proven.

**锚句**：祠殿后的浮木，谁也不知道它是从哪里来的——它只是一截从海里来的木头。
**Anchor sentence**: nobody knows where the driftwood behind the chapel came from — it is simply a log that arrived from the sea.

---

## 二 · Everyone Carved a Mark on It

Those who walk past the driftwood often carry a small knife in their pockets.

Someone carved a ship's outline; someone carved the year of a certain Convocation; someone carved a name.
No one carved and then rubbed it out.

The Institute's rule is: the driftwood is blank — whoever wishes to leave something can leave it; what is left, how it is left, what follows — the driftwood offers no opinion.

**锚句**：浮木记着每个人留下的纹迹——谁都留过，谁都没擦过。
**Anchor sentence**: the driftwood remembers everyone's mark — every hand passed by, no hand ever rubbed it out.

---

## 三 · Nobody Ever Split It for Wood

In the years the alley ran short of firewood, someone proposed taking the driftwood for the pile.

The keeper's answer was: the driftwood is not for burning.
No one raised the matter again.

After the 41st Convocation, a newly arrived watcher observed that the driftwood's rings looked too clear, like an unopened tide-table — the keeper did not answer.

**锚句**：潮候院从来没有人劈过这截浮木——里巷子只会放它在那里，不会烧它。
**Anchor sentence**: nobody at the Institute ever split the driftwood — the alley leaves it where it lies; it is never burned.

---

## 四 · It Slowly Filled with Things

Shells, copper plates, china shards, a few unlifted iron nails — the driftwood accumulates whatever the people of the alley leave.

The watchers, doing their two-year sweep, find chains of shells holding a year inside; new watchers registering the sand table first put their sketches on the driftwood.

**锚句**：潮候院的浮木上慢慢长满了贝壳和碎片——它是一截会收东西的木头。
**Anchor sentence**: the driftwood slowly filled with shells and fragments — it is a log that keeps whatever is given to it.

---

## 五 · It Was Never Hauled Away

After the 41st Convocation, every storm and every tide-swing left the driftwood exactly where it was.

The watchers once decided to remove it to unblock the path; on the day they set out to move it, no one could shift it — after that, no one mentioned it again.
It still lies there, and whoever comes may rest on it.

**锚句**：浮木至今还没有被任何一批潮候院的人拖走过——潮候院最终决定留下它。
**Anchor sentence**: the driftwood has never been hauled away by anyone — the Institute eventually decided to leave it where it is.

---

## 六 · Mapping（Echo No. 17 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The back alley · the driftwood · the watchers' records | 一、三、四、五、六 |
| geography | Behind the chapel · the path to the pier · the Institute's edge | 一、二、三、六 |
| characters | The copyists · the keepers · the new arrivals | 一、三、四、五、六 |
| story | The Driftwood Behind the Chapel · Echo No. 17 | 全篇 |
| items | The driftwood · the shells · the knife · the nails | 一、二、三、四、六 |
| history | The alley's habits · after the 41st Convocation | 一、二、三、五、六 |

> 祠殿后那截浮木从来没有被劈过——潮候院把它留在那里，是里巷子整族留下的东西。
> The driftwood behind the chapel has never been split — the Institute leaves it because the whole alley is part of it.
`,
  },
  {
    order: 18,
    slug: 'echo-018-the-cat-in-the-institute-that-never-meowed',
    titleZh: '祠殿里从不叫的一只猫',
    titleEn: 'The Cat in the Institute That Never Meowed',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——潮候院的春夜，潮落的时候猫出事。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; a spring evening when the tide was going out.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 18): The Cat in the Institute That Never Meowed

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿后经常出没的那只猫——没有人收养过它；祠殿堂没有哪一页上记过它的名字，可谁都知道它在。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the cat that haunts the back of the chapel — nobody ever adopted her; no page in the Institute records her name, yet everyone knows she is there.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——潮候院的春夜，潮落的时候猫出事。
> Era: the Institute — after the 41st Convocation; a spring evening when the tide was going out.

---

## 一 · 没人叫过它

祠殿堂里没有哪一页写过这只猫的名字。

值守猜过它是从里巷子来的、从码头来的、抑或是潮侯院第四十一次大会散会那晚一条不记名的船带来的。
猜想都到过来，记得住的只有它的毛色：潮沙盘的沙一年四季都是干的时候它是那种排油的灰，潮落的时候它是那种贝壳灰。

**锚句**：祠殿堂的人从没叫它的名字——祠殿院没有哪一页上出现它的代称。
**Anchor sentence**: nobody at the chapel ever called the cat by a name — the Institute never wrote down any alias for her.

---

## 二 · 它出现的时候

潮起的时候值守可以看见它窝在潮沙盘旁边看沙落。

潮落到潮至的时候它总蹲在老米缸旁边——没人把那里叫它的窝；潮候院没给过它一处宅，可每天潮候院的值守上班的时候，它都在。
潮落之后大概又回潮沙盘——从来没人发现它潮侯院休盘的哪天晚上它没在。

**锚句**：潮起的时候猫在潮沙盘边看沙落，潮落的时候它蹲在老米缸旁边。
**Anchor sentence**: at the rising tide the cat sits at the sand table watching the sand fall, at the falling tide she crouches beside the old rice jar.

---

## 三 · 没人喂它

祠殿堂里的值守从来不给它喂鱼。

里巷子的抄本员一早要煮饭，米倒进锅里它就紧跟在后面；鱼洗干净以后，最后一块零碎的鱼肚被扔在地上——它会蹲过去默默吃掉。
没有人谈过「养猫」这件事；潮候院没有给它编过饲料明细，也没有人向谁报告过它。它只是潮候院的潮起和潮落。

**锚句**：祠殿堂里没有哪一个人喂过这只猫——它吃的是潮候院留下的碎片。
**Anchor sentence**: nobody in the chapel has ever fed the cat — she eats the Institute's leftovers.

---

## 四 · 没人承认它是标志

里巷子的值守一度提出把这只猫定为潮候院的标志，绑在弄潮台案前。

潮候院抄本员反对把潮沙盘变成仪式：潮沙盘归潮沙盘，猫归猫。
大会从没审理过这条提案；潮沙盘就是潮沙盘，贝壳就是贝壳，猫就是猫。

**锚句**：潮候院从来没把这只猫定为标志——它的存在不是任何人解释潮汐的方法。
**Anchor sentence**: the Institute never elevated the cat to a symbol — her presence is not a way anyone explains the tide.

---

## 五 · 没有人知道它哪里弄去了东西

祠殿堂里如果掉了一只值点钱的东西，值守互问的头一句是：「被猫拿去了吗？」

值守们私底下商量过很多次这件事——这只猫从没动过它们的东西。
值守们都心知肚明：祠殿堂的东西就没有丢过，更轮不到猫的什么问题。

**锚句**：祠殿堂里的值守心里都知道——它不偷东西，它只是在。
**Anchor sentence**: every watcher in the chapel knows in their bones — the cat never takes anything, she simply is.

---

## 六 · 映射（回响十八章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 潮起吃潮落 · 祠殿庙里的不叫猫 · 潮落来它赶 | 一、二、五、六 |
| geography | 祠殿堂后 · 潮沙盘 · 潮候院里巷子 | 二、三、五、六 |
| characters | 潮起的值守 · 里巷子抄本员 · 潮候院某一只猫 | 一、三、四、五 |
| story | 一定没被命名的猫 · 回响（其十八） | 全篇 |
| items | 潮沙盘 · 潮候院老米缸 · 里巷子的鱼骨 | 一、二、三、六 |
| history | 第四十一次大会之后潮候院的夜 · 里巷子的值守记录 | 一、四、五、六 |

> 祠殿堂里那只猫从来没开口过——被问过就是潮沙盘的反光，潮侯院不解答。
> The cat in the chapel has never once meowed — whoever asks is answered by the shine on the tide-sand table, never by the Institute.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其十八）「祠殿里从不叫的一只猫」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿后经常出没的那只猫——没有人收养过它；祠殿堂没有哪一页上记过它的名字，可谁都知道它在。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the cat that haunts the back of the chapel — nobody ever adopted her; no page in the Institute records her name, yet everyone knows she is there.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——潮候院的春夜，潮落的时候猫出事。
> Era: the Institute — after the 41st Convocation; a spring evening when the tide was going out.

---

## 一 · No One Ever Called Her

No page in the chapel has ever written down the cat's name.

The watchers guessed she came from the alley, or from the pier, or was left behind by a ship whose name was never recorded the night the 41st Convocation dispersed.
Every guess had its supporters; all that could be remembered was her color — the gray of the tide-sand across the year, the gray of a shell at low tide.

**锚句**：祠殿堂的人从没叫它的名字——祠殿院没有哪一页上出现它的代称。
**Anchor sentence**: nobody at the chapel ever called the cat by a name — the Institute never wrote down any alias for her.

---

## 二 · When She Appears

At high tide the watchers can see her at the sand table watching the sand come down.

At low tide she always crouches beside the old rice jar — no one ever made that her sleeping place; the Institute never gave her a room, yet she is there every time someone arrives for duty.
When the tide turns again, she is at the sand table once more — no one ever discovered a night she was missing.

**锚句**：潮起的时候猫在潮沙盘边看沙落，潮落的时候它蹲在老米缸旁边。
**Anchor sentence**: at the rising tide the cat sits at the sand table watching the sand fall, at the falling tide she crouches beside the old rice jar.

---

## 三 · Nobody Feeds Her

The watchers in the chapel never fed her a fish.

The copyists in the back alley cook at dawn; the rice lands in the pot, and she follows behind; a small fish gut runs to the floor and she takes it silently.
No one ever spoke of "adopting a cat"; the Institute never kept a feed-list for her either; nobody ever reported her absent or missing. She is the tide's and the sand table's guest.

**锚句**：祠殿堂里没有哪一个人喂过这只猫——它吃的是潮候院留下的碎片。
**Anchor sentence**: nobody in the chapel has ever fed the cat — she eats the Institute's leftovers.

---

## 四 · Nobody Accepts Her as a Symbol

One watcher proposed that she be named the Institute's emblem, placed at the tide desk.

The copyists object to turning the tide-sand table into a ritual object: sand is sand, cat is cat.
The Convocation never took the proposal up; the sand table is the sand table, the shells are shells, the cat is the cat.

**锚句**：潮候院从来没把这只猫定为标志——它的存在不是任何人解释潮汐的方法。
**Anchor sentence**: the Institute never elevated the cat to a symbol — her presence is not a way anyone explains the tide.

---

## 五 · No One Knows Where She Goes

Whenever anything of value goes missing, the watchers' first question to each other is: "Did the cat take it?"

The watchers have quietly checked this over many years — the cat never takes anything that belongs to them.
Every watcher in the chapel understands: the chapel's things have never once gone missing; nothing ever pointed at the cat.

**锚句**：祠殿堂里的值守心里都知道——它不偷东西，它只是在。
**Anchor sentence**: every watcher in the chapel knows in their bones — the cat never takes anything, she simply is.

---

## 六 · Mapping（Echo No. 18 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The hour of the tide · the cat no one named · the watchers who never asked | 一、二、五、六 |
| geography | Behind the chapel · the tide-sand table · the back alley | 二、三、五、六 |
| characters | The watchers · the copyists · the cat | 一、三、四、五 |
| story | The Cat in the Chapel · Echo No. 18 | 全篇 |
| items | The sand table · the old rice jar · the fish guts | 一、二、三、六 |
| history | Nights after the 41st Convocation · the watchers' notes | 一、四、五、六 |

> 祠殿堂里那只猫从来没开口过——被问过就是潮沙盘的反光，潮侯院不解答。
> The cat in the chapel has never once meowed — whoever asks is answered by the shine on the tide-sand table, never by the Institute.
`,
  },
  {
    order: 19,
    slug: 'echo-019-the-copyists-of-the-back-alley',
    titleZh: '里巷子的抄本员',
    titleEn: 'The Copyists of the Back Alley',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——里巷子的抄本员在初冬清晨开始一天的誊写。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the copyists of the alley begin a day\'s transcription in early winter.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 19): The Copyists of the Back Alley

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给里巷子的抄本员——他们的姓名从来不出现在抄本上；里巷子的抄本员不认为自己在写什么，只觉得自己在照着。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the copyists of the back alley — none of whom ever appeared in their own copy; the copyists of the alley never felt they were inventing, only transcribing.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——里巷子的抄本员在初冬清晨开始一天的誊写。
> Era: the Institute — after the 41st Convocation; the copyists of the alley begin a day's transcription in early winter.

---

## 一 · 他们不签名

里巷子的抄本员从来不在抄本上签名。

讨论潮候院的案场上的时候有人问起一个某世纪捐收的潮候院抄本是谁的笔迹，值守翻出几版之后发现全是同一笔法：
粗糙、干净、没人看见的字——里巷子的抄本员两三代传抄值守全都不签名。

里巷子的抄本员不认为自己在写潮汐表：他们说自己在做「对抄」——是潮自己在写，他们只是洇得不是自己的纸。

**锚句**：里巷子的抄本员从来不在抄本上签名——抄本不是谁的作品，是潮汐本体的投影。
**Anchor sentence**: the copyists of the back alley never signed their own copy — the book is not any person's work; it is the projection of the tide itself.

---

## 二 · 抄法有时间节拍

里巷子的抄本员抄书的时候按着节拍走：用潮汐表的节拍——潮起的时候抄潮起那两列，潮落的时候抄潮落那两列。

抄本员们说这是潮在引潮沙盘：不是谁在安排时间，是潮在带他们走一整天。

里巷子的抄本员每抄完一版，潮沙盘的沙落了一格——他们没有手册记录沙为什么落地，却都知道是跟着潮汐的。

**锚句**：里巷子的抄本员按潮汐的节拍抄书——时间不是人定的，是潮带人们走的。
**Anchor sentence**: the copyists of the back alley transcribe to the rhythm of the tide — the hours are not chosen by people; the tide walks the copyists through them.

---

## 三 · 他们的字迹在代与代之间变得越来越模糊

潮候院最古远的抄本上的字是扁平、方正、铁划银钩的；再早一些的年表上的字却慢慢出现了柔软的弧度。

近十三年来里巷子的值守说：他们的抄本越写越像一个老人的字迹——那是里巷子值守抄本员自己的遗蜕：字被反复临摹得再也不成规矩。

抄本员不自己解释这种变：抄本员说他们只是临摹了前人的字。

**锚句**：里巷子的抄本员的字在代际之间变得越来越模糊——他们只是一间临摹别人的抄本。
**Anchor sentence**: the copyists' script has softened from generation to generation — they are simply a scripture-copy of what came before.

---

## 四 · 里巷子的抄本员没人找他们抄什么

潮候院没有人给里巷子的抄本员派过任务。

他们抄的也不是潮候院刚编的东西——他们抄的是潮候院早期的潮汐表内容；他们是里巷子的老手，只负责把潮候院给里巷子带来的内容「做一份潮抄本」。

值守能进去里巷子看抄本的人也从来没告诉里巷子抄本员哪份抄本「更重要」——里巷子的抄本员记不出自己抄过哪一页。

**锚句**：里巷子的抄本员没人派过任务——他们只是抄潮候院给里巷子带来的每一件东西。
**Anchor sentence**: no one ever assigned a task to the copyists of the back alley — they simply copied whatever the Institute had left for them to copy.

---

## 五 · 他们没有名，也没有葬地

潮候院没有为抄本员刻过姓名，也没有给他们单独建过墓。

里巷子的抄本员如果在抄本完成前走掉，他们的位置第二天就有别的人坐上了——抄本员不能缺席任何一天，潮候院不承认抄本员可以请假。

里巷子的抄本员说，他们的葬地是里巷子：每一本潮候院带到过里巷子的字都是他们的灵骨——如果潮候院从不再有东西让抄本员抄，里巷子只有潮沙盘。

**锚句**：里巷子的抄本员没有名字也没有葬地——潮候院没有给人时间知道他们存在过。
**Anchor sentence**: the copyists of the back alley have no names and no graves — the Institute gives them no way to know they existed.

---

## 六 · 映射（回响十九章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 抄本 · 潮汐节拍 · 字迹递减 | 一、二、三、六 |
| geography | 里巷子 · 潮候院 · 抄本工坊 | 一、二、四、六 |
| characters | 里巷子的抄本员 · 潮候院值守长 · 先生 | 一、三、四、五 |
| story | 抄本的人 · 回响（其十九） | 全篇 |
| items | 抄本 · 潮汐表 · 潮沙盘的金箔印 | 一、二、三、六 |
| history | 潮候院至今没有给抄本员设过任何名字 | 一、二、四、五、六 |

> 里巷子的抄本员只按照潮汐说过的话写——他们不认为自己是谁。
> The copyists of the back alley wrote only what the tide dictated — none of them ever thought they were anybody.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其十九）「里巷子的抄本员」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给里巷子的抄本员——他们的姓名从来不出现在抄本上；里巷子的抄本员不认为自己在写什么，只觉得自己在照着。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the copyists of the back alley — none of whom ever appeared in their own copy;
> the copyists of the alley never felt they were inventing, only transcribing.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——里巷子的抄本员在初冬清晨开始一天的誊写。
> Era: the Institute — after the 41st Convocation; the copyists of the alley begin a day's transcription in early winter.

---

## 一 · They Never Sign

The copyists of the back alley never sign their copies.

When someone asked whose hand wrote a certain tide-table donated in a given century, the watchers proved after three revisions that all the pages used the same stroke — rough, clean, invisible. The copyists of the back alley across many generations never signed their copies.

The copyists of the back alley do not believe they are writing the tide-tables: they say they are "copying" — the tide is writing; they merely provide the paper the tide needs.

**锚句**：里巷子的抄本员从来不在抄本上签名——抄本不是谁的作品，是潮汐本体的投影。
**Anchor sentence**: the copyists of the back alley never signed their own copy — the book is not any person's work; it is the projection of the tide itself.

---

## 二 · The Pace of the Tide

The copyists write to the rhythm of the tide-tables: at high tide they copy the two high-tide columns; at low tide they copy the two low-tide columns.

The copyists say this is the tide conserving the sand table — nobody schedules the hours; the tide walks the copyists through the day.

When a page is finished, one grain of sand falls from the table; no one ever recorded why the sand fell, yet every copyist knows it follows the tide.

**锚句**：里巷子的抄本员按潮汐的节拍抄书——时间不是人定的，是潮带人们走的。
**Anchor sentence**: the copyists of the back alley transcribe to the rhythm of the tide — the hours are not chosen by people; the tide walks the copyists through them.

---

## 三 · Their Handwriting Has Softened Across Generations

The oldest tide-tables in the Institute carry square, sharp characters; histories from earlier centuries already show gentler strokes.

Over the last thirteen years the copyists said their letters had begun resembling an elderly hand — the copyists' own collective habit simply passed down; the characters have been copied until they no longer held their original shape.

The copyists offer no explanation; they insist they are merely copying what came before.

**锚句**：里巷子的抄本员的字在代际之间变得越来越模糊——他们只是一间临摹别人的抄本。
**Anchor sentence**: the copyists' script has softened from generation to generation — they are simply a scripture-copy of what came before.

---

## 四 · Nobody Assigns Them Anything

No one at the Institute ever hands a task to the copyists of the back alley.

They do not copy new Institute documents — they copy the early tide-tables; they are senior in the alley, responsible only for "making copies" of whatever the Institute leaves for the alley.

Even those who enter the alley to read the copies were never told which copy matters more — the copyists of the alley cannot tell you which page they themselves wrote.

**锚句**：里巷子的抄本员没人派过任务——他们只是抄潮候院给里巷子带来的每一件东西。
**Anchor sentence**: no one ever assigned a task to the copyists of the back alley — they simply copied whatever the Institute had left for them to copy.

---

## 五 · They Have No Names and No Tombs

The Institute never carved the copyists' names, nor did it ever build them a grave.

If a copyist of the alley dies before a page is finished, someone else takes the seat on the next morning — a copyist cannot miss a single day; the Institute accepts no excuses for absence.

The copyists of the alley say their graves are the alley itself: every character ever carried into the alley is their tombstone — if the Institute left nothing to be copied, the alley would be nothing but the sand table.

**锚句**：里巷子的抄本员没有名字也没有葬地——潮候院没有给人时间知道他们存在过。
**Anchor sentence**: the copyists of the back alley have no names and no graves — the Institute gives them no way to know they existed.

---

## 六 · Mapping（Echo No. 19 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The copy · the tide's rhythm · the softening hand | 一、二、三、六 |
| geography | The back alley · the Institute · the copy room | 一、二、四、六 |
| characters | The copyists · the keeper · the senior copyist | 一、三、四、五 |
| story | The Hands of the Alley · Echo No. 19 | 全篇 |
| items | The copies · the tide-tables · the sand-table's marks | 一、二、三、六 |
| history | Never once in the Institute's history has anyone named a copyist | 一、二、四、五、六 |

> 里巷子的抄本员只按照潮汐说过的话写——他们不认为自己是谁。
> The copyists of the back alley wrote only what the tide dictated — none of them ever thought they were anybody.
`,
  },
  {
    order: 20,
    slug: 'echo-020-the-bell-that-never-rang',
    titleZh: '潮候院钟楼里那口从不响的钟',
    titleEn: 'The Bell That Never Rang in the Institute\'s Clock Tower',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——风过钟楼的夜晚。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the night the wind comes over the clock tower.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 20): The Bell That Never Rang in the Institute's Clock Tower

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院钟楼里那口钟——它至今没有响过一声；值守交接的时候不说钟的事；新来的人只能猜。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the bell in the Institute's clock tower — it has not rung once; the watchers never speak of it; the new arrivals can only guess.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——风过钟楼的夜晚。
> Era: the Institute — after the 41st Convocation; the night the wind comes over the clock tower.

---

## 一 · 钟槌碎的那一天

值守册子上写过：潮候院钟楼的钟槌在第十一次大会前那年碎了。

当时是去敲钟开会的人发现的：敲了第一锤，第二锤根本不出声——上面的铁锤落在钟上，像落在一截船肋骨上。
值守长当时没有报修，只是把槌换成了一串贝壳，挂在钟绳上。
后来上报的时候也没有人主张把钟槌修好——潮候院的决定一向是留着就好。

**锚句**：钟楼里的钟槌碎了很多年，钟从来没有响过。
**Anchor sentence**: the clapper inside the bell has been broken for many years; the bell has never rung.

---

## 二 · 大会从不以钟声开始

潮候院的第四十一次大会开幕的时候没有钟声。

整个潮候院没有人找过任何一个塔去鸣钟。大会开始于潮沙盘的第一次加沙——这是值守们自然认可的传统，没有任何条文。
第四十一次大会散会那天，值守照例在散会前关闭了钟楼的门。
从来没有哪一本仓库的签收记录里写过钟的名字。

**锚句**：潮候院的大会从不以钟声开始，也不以钟声结束。
**Anchor sentence**: no Convocation of the Institute ever opens with a bell, nor closes with one.

---

## 三 · 贝壳挂在钟上

值守在钟绳上挂了一串贝壳：里巷子的抄本员亲手一枚一枚选出来的。

风起的时候，贝壳撞在钟壁上发出细小的响动——不是钟声，只是一种贝壳之间磨蹭的声音。
值守们说这就是钟候院的「钟」：这不是铁碰铁，是海碰海。
没有哪一页上写过为什么选贝壳——只是后来每一个值守都承认，这串声音已经算是潮候院钟楼的例行声音。

**锚句**：风起的时候，贝壳替钟槌去了钟——潮候院叫它海碰海，不叫钟声。
**Anchor sentence**: when the wind comes, the shells do the clapper's work — this is not bell against bell, but sea against sea.

---

## 四 · 新来的值守不问钟

值守班有一条手册里没写的惯例：新来的值守如果注意到钟楼，值守长会等的不是答案，而是沉默。

问得急了，前辈们会用别的值守知道的话题岔开——潮沙盘、潮汐表、里巷子东侧最深的那块地。
只有少数几个值守知道，钟一向是替潮候院留着的：它不是用来叫人的，是用来在某一年候着潮。

**锚句**：新来的值守从不问钟，因为前辈们已经等到沉默；问急了就是岔开别处。
**Anchor sentence**: new watchers never ask about the bell, because the seniors have learned to wait for silence; pressing means being steered elsewhere.

---

## 五 · 钟楼的影子

钟楼每天下午三点的影子落在潮沙盘上。

潮沙盘那一刻落辟的沙最少，值守们把这个时刻记为「钟影」——这不是铁的影子，是潮的影子。
潮起来的时候影子移动，潮落回来的时候，钟楼的影子又缩回潮沙盘的边缘。
潮候院没有在七十五岁的钟楼上挂过时间：潮是钟候院唯一的钟案头。

**锚句**：钟楼下午三点的影落在潮沙盘上——潮候院以潮候院的影子计时，不以钟。
**Anchor sentence**: at three in the afternoon the tower's shadow falls on the sand table — the Institute tells time by its own shadow, not by any bell.

---

## 六 · 映射（回响二十章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 钟槌 · 贝壳取代钟声 · 第四十一次大会 | 一、二、三、四、六 |
| geography | 潮候院钟楼 · 潮沙盘 · 里巷子东侧 | 一、三、五、六 |
| characters | 值守长 · 新来的值守 · 里巷子抄本员 | 一、三、四、六 |
| story | 不响的钟 · 回响（其二十） | 全篇 |
| items | 钟 · 碎槌 · 贝壳串 · 潮沙盘 | 一、二、三、四、五、六 |
| history | 潮候院钟楼的传统 · 第四十一次大会散会 | 一、二、四、五、六 |

> 钟楼里那口钟从来没有响过——值守在风起的时候听的是海。
> The bell in the tower has never rung once — when the wind rises, the watchers listen to the sea.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其二十）「潮候院钟楼里那口从不响的钟」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院钟楼里那口钟——它至今没有响过一声；值守交接的时候不说钟的事；新来的人只能猜。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the bell in the Institute's clock tower — it has not rung once; the watchers never speak of it; the new arrivals can only guess.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——风过钟楼的夜晚。
> Era: the Institute — after the 41st Convocation; the night the wind comes over the clock tower.

---

## 一 · The Day the Clapper Broke

The watchers' log records that the clapper of the Institute's tower bell broke the year before the 11th Convocation.

It was the delegation come to ring it open who discovered it: the first blow landed, the second never voiced — the iron fell on the bell like a tap on a ship's rib.
The keeper did not file a repair; he swapped the clapper for a string of shells, hung on the rope.
When the matter reached the record, no one argued for the clapper to be restored — the Institute's decision has always been: leave it as it is.

**锚句**：钟楼里的钟槌碎了很多年，钟从来没有响过。
**Anchor sentence**: the clapper inside the bell has been broken for many years; the bell has never rung.

---

## 二 · No Convocation Opens with the Bell

The 41st Convocation of the Institute never opened with the bell.

No one went up to any tower to ring it. The Convocation begins on the first filling of the sand table — a tradition the watchers simply recognize, untouched by any statute.
On the day the 41st Convocation dispersed, the watchers closed the door of the clock tower before the assembly was done, as always.
No warehouse receipt, no binding record, ever wrote the bell's name.

**锚句**：潮候院的大会从不以钟声开始，也不以钟声结束。
**Anchor sentence**: no Convocation of the Institute ever opens with a bell, nor closes with one.

---

## 三 · The Shells Hung on the Bell

The watchers hung a chain of shells on the bell rope — each one picked by hand by the copyists of the back alley.

When the wind rises, the shells strike the bell's flank with a fine, small ringing — not a bell note, only the sound of shells worrying shells.
The watchers say this is the Institute's "bell": not iron on iron, but sea against sea.
No page records why shells were chosen — only that every watcher, sooner or later, admits these sounds are part of the tower's ritual.

**锚句**：风起的时候，贝壳替钟槌去了钟——潮候院叫它海碰海，不叫钟声。
**Anchor sentence**: when the wind comes, the shells do the clapper's work — this is not bell against bell, but sea against sea.

---

## 四 · New Watchers Never Ask About the Bell

There is a hand-book rule no one ever wrote down: if a new watcher notices the tower, the seniors do not answer — they wait for silence.

If the asking gets insistent, the seniors deflect to the talk of any watcher — the sand table, the tide-tables, the deepest ground in the back alley.
Only a few of the watchers remember that the bell is kept for the Institute itself: never to summon people; only to wait for a particular year, a particular turn of the tide.

**锚句**：新来的值守从不问钟，因为前辈们已经等到沉默；问急了就是岔开别处。
**Anchor sentence**: new watchers never ask about the bell, because the seniors have learned to wait for silence; pressing means being steered elsewhere.

---

## 五 · The Tower's Shadow

At three in the afternoon, the tower's shadow falls across the sand table.

The falling sand sheds almost nothing at that hour — the watchers call this passage "the shadow of the bell" — not iron's shadow, but the tide's.
When the tide comes in, the shadow creeps; when it goes out, the tower's shadow retrenches to the table's edge.
Never once has the Institute hung time from the seventy-five-year-old tower: the tide is the only desk-calendar the Institute recognizes.

**锚句**：钟楼下午三点的影落在潮沙盘上——潮候院以潮候院的影子计时，不以钟。
**Anchor sentence**: at three in the afternoon the tower's shadow falls on the sand table — the Institute tells time by its own shadow, not by any bell.

---

## 六 · Mapping（Echo No. 20 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The broken clapper · the shells that replaced it · the tide's clock | 一、二、三、四、六 |
| geography | The Institute's clock tower · the sand table · east alley | 一、三、五、六 |
| characters | The keeper · the new watchers · the copyists | 一、三、四、六 |
| story | The Bell That Never Rang · Echo No. 20 | 全篇 |
| items | The bell · the broken clapper · the shells · the sand table | 一、二、三、四、五、六 |
| history | The tower's silent tradition · the dispersal of the 41st Convocation | 一、二、四、五、六 |

> 钟楼里那口钟从来没有响过——值守在风起的时候听的是海。
> The bell in the tower has never rung once — when the wind rises, the watchers listen to the sea.
`,
  },
  {
    order: 21,
    slug: 'echo-021-the-seven-lamps-of-the-back-alley-pier',
    titleZh: '里巷子码头的七盏号灯',
    titleEn: 'The Seven Lamps of the Back-Alley Pier',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——涨潮的薄暮。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; a dusk minute before high tide.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 21): The Seven Lamps of the Back-Alley Pier

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给里巷子码头的七盏号灯——灯号的顺序和潮沙盘的列一模一样；没人记得它们什么时候一起升上灯杆。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the seven beacon lamps on the back-alley pier — the order of numbers mirrors the columns of the sand table; no one remembers when they were raised.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——涨潮的薄暮。
> Era: the Institute — after the 41st Convocation; a dusk minute before high tide.

---

## 一 · 七盏灯什么时候挂上去的

里巷子的灯杆没有哪一张施工图上画过七盏灯。

仓库里最早的潮候院东侧图只有六盏灯的编号划痕。仓库的灯杆验收册里只有六盏灯的记录——七盏灯从哪一个项目来，没有人查过。
值守对新来的人只说：「灯就在。」灯杆的扶手被长期使用磨得发亮，像潮候院的潮汐表沙漏。

**锚句**：七盏号灯没有哪一张施工图上画过它们——最早的图纸只有六盏的划痕。
**Anchor sentence**: no construction drawing of the Institute ever showed seven lamps — the oldest drawing marks only six.

---

## 二 · 第四盏灯

第四十二年前的台风，第四盏灯在风眼经过的那一夜熄了。

第二天早上没有人去点它——油是有的，灯芯是碎的。值守长当时的记录只写了一句：「四号的芯散了。」之后整个米缸月没有人补芯。
后来的值守发现：条船还在走第四盏灯的航线。因为熄掉的地方，被海图上的灯影替代——海员照旧按「四」来对星缝。

**锚句**：第四盏灯四十二年没再亮过——值守没有按回来，岸上的人照旧念「四」。
**Anchor sentence**: lamp No. 4 has not burned for forty-two years — no one put it back, and the shore still says "four".

---

## 三 · 海图上是七盏

抄本员的海图上七盏灯必须同时画。

这不是铁律，但抄本员之间不画少的：缺了一盏，就等于否认潮候院的潮汐表和航线之间的关系。
某一年抄本员私下传过话：缺第四盏是错字，不是错图——海图上的灯是排布不是照明，不能少。

**锚句**：抄本员的海图上七盏灯必须同时出现——缺一盏就是错的海图不是美术作品。
**Anchor sentence**: the copyists' charts must show all seven lamps — miss one, and the chart is wrong, not artistic.

---

## 四 · 第七盏是第一盏

值守长老了以后才跟少数接触过他的副抄本员说：

第七盏灯不是第七盏——它是潮候院建院那一年挂的第一盏灯。后面六盏灯按它的间隔补的。
潮沙盘上六条辅助的沙线是后加的，最外面那一条是最早的。值守一直传下去：
「七盏灯里它是别的灯的父亲。」
里巷子的值守私下都知道，第七盏灯一直在闪、或者一度不闪过——它从来没被拆过。

**锚句**：第七盏灯不是第七盏，它是潮候院最早挂的那一盏——后面六盏是按它的间距补的。
**Anchor sentence**: lamp No. 7 is not the seventh — it is the first lamp the Institute ever hung; the other six were raised in its spacing.

---

## 五 · 灯与潮汐表

潮汐表七列的间隔和灯与灯之间的间隔一致。

潮候院建院那时候没有表，只有灯——人们是靠灯来等潮的。
后来有了潮汐表，里巷子抄本员把它抄成七列的时候从来没人质疑过这个数：「灯就是表，表就是灯。」
现在的海员走进潮候院港湾的时候，先看的是潮沙盘的方向，不是灯高——潮比灯亮，灯比标清。

**锚句**：潮沙盘七列的排法和灯的顺序一样——潮候院靠灯记潮，也靠潮记灯。
**Anchor sentence**: the seven columns of the sand table match the order of the lamps — the Institute keeps time by the lamps, and keeps the tide by the light.

---

## 六 · 映射（回响二十一章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 潮沙盘的七列 · 灯的序号 · 米缸月（tide-guild 的月）| 一、三、四、五、六 |
| geography | 里巷子码头 · 潮沙盘 · 潮候院东侧海 | 一、二、三、五、六 |
| characters | 值守长 · 里巷子抄本员 · 条船海员 | 一、二、三、四、五 |
| story | 七盏号灯 · 回响（其二十一） | 全篇 |
| items | 七盏灯 · 灯芯 · 潮沙盘 · 海图 | 一、二、三、五、六 |
| history | 四十二年前的一次潮变 · 第四十一次大会之后 | 二、四、六 |

> 七盏号灯里有一盏从来没点过——潮候院靠灯知道自己还活着。
> One of the seven lamps was never lit at all — the Institute uses the lamps to know it is still alive.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其二十一）「里巷子码头的七盏号灯」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给里巷子码头的七盏号灯——灯号的顺序和潮沙盘的列一模一样；没人记得它们什么时候一起升上灯杆。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the seven beacon lamps on the back-alley pier — the order of numbers mirrors the columns of the sand table; no one remembers when they were raised.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——涨潮的薄暮。
> Era: the Institute — after the 41st Convocation; a dusk minute before high tide.

---

## 一 · When Were the Seven Lamps Raised

No construction chart of the Institute ever showed seven lamps on the pier.

The earliest east-side map in the warehouse carries the marks of only six lamp positions. The acceptance log for the pier's handrails registers six lamps — where the seventh came from, no one has ever checked.
The watchers tell new arrivals only this: "The lamps are." The rail has been hold-worn to a shine, like the sand in the Institute's tide-tables.

**锚句**：七盏号灯没有哪一张施工图上画过它们——最早的图纸只有六盏的划痕。
**Anchor sentence**: no construction drawing of the Institute ever showed seven lamps — the oldest drawing marks only six.

---

## 二 · Lamp No. 4

The typhoon of forty-two years ago put out lamp No. 4 in the hour the typhoon's eye passed over.

No one relit it the next morning — the oil was there, the wick was in shards. The keeper's log records one line: "No. 4's wick scattered." No one replaced the wick in the following rice-jar month.
The watchers came to know later that the ships still walk the line of lamp No. 4. Because the dark spot has been answered by a gap in the chart — the sailors steer by "the four".

**锚句**：第四盏灯四十二年没再亮过——值守没有按回来，岸上的人照旧念「四」。
**Anchor sentence**: lamp No. 4 has not burned for forty-two years — no one put it back, and the shore still says "four".

---

## 三 · The Chart Shows Seven

The copyists' charts must show all seven lamps at once.

This is not a statute, but no copyist draws fewer: to miss one is to deny the relation between the Institute's tide-tables and the shipping lanes.
One year the alley passed word that to omit lamp No. 4 is a mistake of typography, not cartography — the lamps on the chart are layout, not light, and cannot be absent.

**锚句**：抄本员的海图上七盏灯必须同时出现——缺一盏就是错的海图不是美术作品。
**Anchor sentence**: the copyists' charts must show all seven lamps — miss one, and the chart is wrong, not artistic.

---

## 四 · The Seventh Is the First

When the keeper grew old, he told a handful of senior copyists:

the seventh lamp is not the seventh — it was the first lamp the Institute ever hung, in the year the Institute was founded. The other six were raised to match its spacing.
The six auxiliary sand-lines on the sand table came later; the outermost line is the oldest. The watchers pass it on like this: "Lamp No. 7 is the father of the other six."
Every watcher in the back alley knows that lamp No. 7 has been flickering, or has stopped flickering, more than once — it has never been taken down.

**锚句**：第七盏灯不是第七盏，它是潮候院最早挂的那一盏——后面六盏是按它的间距补的。
**Anchor sentence**: lamp No. 7 is not the seventh — it is the first lamp the Institute ever hung; the other six were raised in its spacing.

---

## 五 · The Lamps and the Tide-Tables

The seven columns of the tide-tables stand at the same intervals as the seven lamps.

In the year the Institute was founded there was no table — there were only lamps; people waited for the tide by the light.
When the tide-tables came later, the copyists wrote them in seven columns, and no one ever questioned the count: the lamps are the table; the table is the lamps.
Sailors entering the harbor today first look to the direction of the sand table, not to the lamps' height — the tide is clearer than any light, and the light is clearest when it agrees with the tide.

**锚句**：潮沙盘七列的排法和灯的顺序一样——潮候院靠灯记潮，也靠潮记灯。
**Anchor sentence**: the seven columns of the sand table match the order of the lamps — the Institute keeps time by the lamps, and keeps the tide by the light.

---

## 六 · Mapping（Echo No. 21 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The seven columns · the numbering of lamps · the rice-jar month | 一、三、四、五、六 |
| geography | The back-alley pier · the sand table · the east sea | 一、二、三、五、六 |
| characters | The keeper · the copyists · the sailors | 一、二、三、四、五 |
| story | The Seven Lamps · Echo No. 21 | 全篇 |
| items | The lamps · the wick · the sand table · the charts | 一、二、三、五、六 |
| history | The great tide-turn of forty-two years ago · after the 41st Convocation | 二、四、六 |

> 七盏号灯里有一盏从来没点过——潮候院靠灯知道自己还活着。
> One of the seven lamps was never lit at all — the Institute uses the lamps to know it is still alive.
`,
  },
  {
    order: 22,
    slug: 'echo-022-the-fish-that-never-dried',
    titleZh: '里巷子晾鱼架上那条永远晾不干的鱼',
    titleEn: 'The Fish That Never Dried on the Back-Alley Rack',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——挂鱼的薄暮。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; a dusk hour when the fish were hung.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 22): The Fish That Never Dried on the Back-Alley Rack

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给里巷子晾鱼架的最里面那号钩——鱼在那里挂了很久；里巷子的人不知道它的年份，也不打算数。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the innermost hook in the back alley's drying rack — the fish has hung there many years; no one knows its age, and none plans to count.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——挂鱼的薄暮。
> Era: the Institute — after the 41st Convocation; a dusk hour when the fish were hung.

---

## 一 · 一号钩的来历

里巷子的晾鱼架最里面那号钩是唯一不编号的钩——抄本员抄架子图纸的时候把它单独列出来：「里边的一号。」

没人知道它是谁挂的。值守翻过仓库收件单里没有鱼的任何一行；米缸月那天的清扫册上也只写了四个字：「里侧钩在。」
架子是后来几代补的，但一号钩早早就在——木材打眼的口径里，一号钩是老木料。

**锚句**：里巷子晾鱼架最里侧的一号钩上，挂着一条谁都不记得是什么时候挂上去的鱼。
**Anchor sentence**: the innermost hook of the drying racks, hook No. 1, carries a fish nobody remembers being hung there.

---

## 二 · 潮晾的鱼

一号钩的位置是架子上唯一不晒太阳的一根——海风从石缝的缺口灌进来，先落到一号钩，最后才肯落到别处。

别处的鱼缩成纸板一样薄；一号钩上的鱼不缩。它保持着一条鱼刚出水那一刻的弧度——毫无破损，盐结得密密麻麻，像里巷子某年起潮沙盘前最后一线未完的轮廓。

风大的时候，鱼尾微微卷一下；风落的时候，它又回到原样。值守弯腰到它面前看的时候，总是能闻见一点潮气——不是臭，是湿的。

**锚句**：一号钩上的鱼是潮晾的——从没被太阳干过，也从没被谁翻晒过。
**Anchor sentence**: the fish on hook No. 1 is dried by the tide — never by sun, never by anyone's hand.

---

## 三 · 老渔夫只说是「一号钩」

里巷子的渔夫每天出海之前都需要经过一号钩。年轻的一代问过：「它是鲑鱼还是海鲋？」年近的回答永远一致：「一号钩。」

值守也说这句话——不是因为怕传承错，是因为这句话本身就是规矩。新来的值守第一次被带进里巷子的时候，抄本员会指一指里侧的钩：「一号钩在对面。」——谁都知道「在」的意思。

**锚句**：新来的值守问这条鱼是什么种的——后辈只说一号钩，不说它的名字。
**Anchor sentence**: new watchers ask what kind of fish that is — the older hands say only "hook No. 1", never a name.

---

## 四 · 抄本员为什么不抄它

潮候院三四十年来最详细的名册是潮汐表副册和米缸月登记册——这两本册子没有一页记过一号钩。

抄本员是这么解释的：任何一条鱼的收录都意味着它可以被点数、被分配、被被换掉，而一号钩上的鱼不打算被点数。
值守长某年有一次想为它写一页：写完以后，整页纸上只剩「潮」字一个字，余下字都洇了——洇得和别的笔迹不同。自那以后，值守主动回避记录它。

**锚句**：潮候院从没有把它登记进任何名册——被记录下来，就等于被收编了。
**Anchor sentence**: the Institute never registered it in any roster — to be recorded is to be conscripted.

---

## 五 · 一号钩不能摘

架子大修的那一年，匠人撤了侧架，准备把一号钩也换掉。值守们知道了一号钩不能换——最后一号钩在老架子里被整根拆出来，原样留在新架子的同一位置。

抄本员在新架子图上画的依然是一号钩和别人分开的那一排。新图上「里侧钩在」四个字没有动过。
值守告诉新来的人：架子会拆，钩不能撤——风夜经过一号钩的人总会慢半步——不是为了看，是为了怕惊到它。

**锚句**：架子会换，一号钩不换——风夜经过的人总慢半步，不是为了看。
**Anchor sentence**: racks are replaced; hook No. 1 is not — on windy nights people pass a half-step slower, not to see it.

---

## 六 · 映射（回响二十二章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 一号钩 · 潮晾的鱼 · 不登记 | 一、二、四、六 |
| geography | 里巷子 · 晾鱼架 · 东侧出海口 | 一、二、三、五、六 |
| characters | 里巷子渔夫 · 值守 · 抄本员 | 二、三、四、五、六 |
| story | 一号钩上的鱼 · 回响（其二十二） | 全篇 |
| items | 一号钩 · 海鲋 · 晾鱼架 · 新旧侧架 | 一、二、四、五、六 |
| history | 架子大修 · 四十一次大会以后 | 一、四、五、六 |

> 风夜经过一号钩的人总慢半步——不是想看一号钩的鱼，是怕惊到它。
> People passing hook No. 1 on windy nights slow a half-step — not to see the fish, but to avoid startling it.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其二十二）「里巷子晾鱼架上那条永远晾不干的鱼」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给里巷子晾鱼架的最里面那号钩——鱼在那里挂了很久；里巷子的人不知道它的年份，也不打算数。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the innermost hook in the back alley's drying rack — the fish has hung there many years; no one knows its age, and none plans to count.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——挂鱼的薄暮。
> Era: the Institute — after the 41st Convocation; a dusk hour when the fish were hung.

---

## 一 · The Hook No. 1

The innermost hook of the back alley's drying rack is the only one not numbered in the drawings — when the copyists drew the rack's plans, they listed it separately: "the one inside."

No one knows who hung it. The warehouse receipts contain no line item for a fish; the rice-jar month sweeping register records only four characters: "inner hook stands."
The rack was rebuilt by generations — hook No. 1 has been there longer: the eye splice in its timber is the oldest wood of all.

**锚句**：里巷子晾鱼架最里侧的一号钩上，挂着一条谁都不记得是什么时候挂上去的鱼。
**Anchor sentence**: the innermost hook of the drying racks, hook No. 1, carries a fish nobody remembers being hung there.

---

## 二 · Dried by the Tide

Hook No. 1 is the one place on the rack where sun never lands — the sea wind comes in through the gap in the stones, falls on No. 1 first, and only then stoops elsewhere.

Fish elsewhere shrink thin as cardboard; the fish on No. 1 never does. It keeps the arc it held when it first lifted from the water — intact, sealed in salt grain upon salt grain, like an unfinished outline left on the sand table at some low tide.

When the wind is strong, its tail rolls slightly; when the wind passes, it returns to its shape. Watchers bending down to look always catch the faintest thread of tide on the air — not rot; wet.

**锚句**：一号钩上的鱼是潮晾的——从没被太阳干过，也从没被谁翻晒过。
**Anchor sentence**: the fish on hook No. 1 is dried by the tide — never by sun, never by anyone's hand.

---

## 三 · The Old Fishermen Say Only "Hook No. 1"

The fishermen of the back alley pass hook No. 1 every morning before they go out. The young ones asked: "Is it a salmon or a sea-carp?" The older generation answered the same way: "Hook No. 1."

The watchers say the same words — not because they fear the mistake; because the phrase itself is the rule. When a new watcher is first brought into the back alley, the senior copyist points across to the inner hook: "Hook No. 1 is across." — and everyone knows what "is" means.

**锚句**：新来的值守问这条鱼是什么种的——后辈只说一号钩，不说它的名字。
**Anchor sentence**: new watchers ask what kind of fish that is — the older hands say only "hook No. 1", never a name.

---

## 四 · Why the Copyists Never Wrote It Down

The Institute's two most detailed registers — the tide-table supplement and the rice-jar month record — hold no page for hook No. 1.

The copyists explain it this way: any record of a fish means it can be counted, allocated, replaced — and the fish on hook No. 1 does not intend to be counted.
One year a keeper tried to set down a page: finished writing, the page held one character — "潮" — and all the rest blurred in a different hand than any copyist's. After that, the watchers avoided recording it altogether.

**锚句**：潮候院从没有把它登记进任何名册——被记录下来，就等于被收编了。
**Anchor sentence**: the Institute never registered it in any roster — to be recorded is to be conscripted.

---

## 五 · Hook No. 1 Cannot Be Replaced

The year the rack was rebuilt, the carpenter set out to also swap hook No. 1. The watchers made clear: hook No. 1 cannot be replaced — hook No. 1 was cut from the old rack as a single timber and left, in the exact same place, in the new.

On the new drawings the copyists drew hook No. 1 apart from its row, as always, the four characters "inner hook stands" unchanged.
Watchers tell the new arrivals: racks are swapped; the hook is not — on windy nights they pass a half-step slower, not to look at hook No. 1, but to avoid startling it.

**锚句**：架子会换，一号钩不换——风夜经过的人总慢半步，不是为了看。
**Anchor sentence**: racks are replaced; hook No. 1 is not — on windy nights people pass a half-step slower, not to see it.

---

## 六 · Mapping（Echo No. 22 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | Hook No. 1 · the fish dried by tide · the unregistrable | 一、二、四、六 |
| geography | The back alley · the drying rack · the east outlet | 一、二、三、五、六 |
| characters | The fishermen · the watchers · the copyists | 二、三、四、五、六 |
| story | The Fish on Hook No. 1 · Echo No. 22 | 全篇 |
| items | Hook No. 1 · the sea-carp · the rack · old and new timber | 一、二、四、五、六 |
| history | The rack's rebuild · after the 41st Convocation | 一、四、五、六 |

> 风夜经过一号钩的人总慢半步——不是想看一号钩的鱼，是怕惊到它。
> People passing hook No. 1 on windy nights slow a half-step — not to see the fish, but to avoid startling it.
`,
  },
  {
    order: 23,
    slug: 'echo-023-the-ship-that-appears-only-at-dusk',
    titleZh: '雾港里那艘只在黄昏出现的船',
    titleEn: 'The Ship That Appears Only at Dusk in Fog Harbor',
    eraLineZh: '纪元：潮候院 · 建院第七十二年 · 第四十一次大会散会之后——雾港的黄昏。',
    eraLineEn: 'Era: the Institute — the 72nd year of its founding · after the 41st Convocation; dusk in Fog Harbor.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 23): The Ship That Appears Only at Dusk in Fog Harbor

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给铁月纪雾港黄昏里那条船——铁月纪的灯人从不去看第二盏灯；雾港码头没有它的收锚、没有它的名字、没有人见它离去。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the ship in Fog Harbor, Iron-Moon Age dusks — the lighthouse keepers never look at the second lantern; no anchor, no name, no departure.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 建院第七十二年 · 第四十一次大会散会之后——雾港的黄昏。
> Era: the Institute — the 72nd year of its founding · after the 41st Convocation; dusk in Fog Harbor.

---

## 一 · 两盏灯的位子

雾港码头的入口处有两盏灯——左边一盏是潮候院的值守看的灯，右边那一盏是灯塔负责点的灯。但落到雾的时候，灯塔的第三盏总空着。

铁月纪的灯塔记录里只有一行批注：「第三盏雾起不守。」灯塔值班记录里没有人登记过第三盏灯的油；剪影图上只有走了一半的弧线。
雾起的时刻，灯塔只能看见两盏灯，固定的一大一小。

**锚句**：雾港黄昏起雾的时候，码头口总有一艘船不在值守的名册上。
**Anchor sentence**: when the fog rolls in at Fog Harbor at dusk, there is always a ship that never appears on any watch.

---

## 二 · 第二盏灯不看

雾港的值守都知道：看见第一盏灯时没关系，看见第二盏灯的时候，你不会再看清它一百年。

灯塔的规矩是：雾里只有两盏灯是安全的——看第一盏不回登记簿；看第二盏的值守第二天会被调回里巷子。从铁月纪至今，第二盏灯「亮起过」的记录里没有一条被抄本员抄走——抄本员们把它抄成了一页白纸收进档案柜。

**锚句**：灯人从不往雾港方向张望第二盏——看到它的人看不见第二天的雾港。
**Anchor sentence**: the lighthouse keepers never watch the second lantern — those who see it do not see the next day's Fog Harbor.

---

## 三 · 没有名字，没有收锚

铁月纪最早一次记录这艘船出现在灯塔申请周岁的公证册上——"入夜后雾中两点，无锚入港"。记录边缘洇了一半，抄本员抄补了一个「船」字。从此抄本员都知道，这个条目存在即可，不抄完整。

值守之间私下说法是：这条船不带名字是因为它不属于任何人；它连潮候院的米缸月规矩都不遵守。

**锚句**：这条船从不停泊、从不收锚、从不给任何人上船——它没名字，也从不需要。
**Anchor sentence**: this ship never ties up, never casts anchor, never takes anyone aboard — it has no name and needs none.

---

## 四 · 七十二年里的七次

潮候院七十二年的雾港记录里，这艘船出现过七次：
老抄本员记的第 13 次，雾起，下了一点沙；第 29 次，灯塔第三盏不亮但船影出现了；第 42 次，第四十一次大会散会的当天；第 48 次，盐海最低潮的第三天；第 58 次，值细心的值守数到两盏灯的间距不是平日的间距；第 69 次，档案员抄错一个字；第 72 次，也是今年。

没有人数到它在哪七次——值守只知道次数，不知道形状。抄本员把次数抄进米缸月旁边的空格里，盖上半月章，不送上级。

**锚句**：潮沙盘七十二年记录这艘船出现过七次——值守不记形状，只记次数。
**Anchor sentence**: in seventy-two years the sand table records seven appearances — the watchers count the times, never the shape.

---

## 五 · 雾散与否

雾散了，这艘船就不存在了。没有人问值守做了什么——潮沙盘自动落了一格沙。

值班人翻飞的页码停在第 37 页——半月印盖在空白上；船不在了，灯也没有烧过任何人见过的油。
雾港的灯人第二天开会——什么都没有决定，因为第四十一次大会的会议记录也没有这一页。值守只说：「雾散了，不需要问。」

**锚句**：雾散了这艘船就不存在——潮候院不需要一艘没有答案的船。
**Anchor sentence**: when the fog lifts the ship ceases to exist — the Institute needs no ship without an answer.

---

## 六 · 映射（回响二十三章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 雾港黄昏 · 第二盏灯 · 七十二年里的七次 | 一、二、三、四、六 |
| geography | 铁月纪雾港 · 雾港入口灯 · 雾港灯塔 | 一、二、三、五、六 |
| characters | 灯塔值班 · 潮候院值守 · 里巷子抄本员 | 二、三、四、五、六 |
| story | 黄昏出现的船 · 回响（其二十三） | 全篇 |
| items | 第三盏灯 · 潮沙盘 · 半月章 · 潮沙盘页码 | 一、二、四、五、六 |
| history | 铁月纪至潮候院的雾港记录 · 第四十一次大会散会之后 | 一、二、四、五、六 |

> 每一下黄昏，雾港只看见两盏灯——谁去看第三盏，谁就要离开这个世界。
> Every dusk, Fog Harbor sees only two lights — whoever looks for the third leaves the world.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其二十三）「雾港里那艘只在黄昏出现的船」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给铁月纪雾港黄昏里那条船——铁月纪的灯人从不去看第二盏灯；雾港码头没有它的收锚、没有它的名字、没有人见它离去。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the ship in Fog Harbor, Iron-Moon Age dusks — the lighthouse keepers never look at the second lantern; no anchor, no name, no departure.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 建院第七十二年 · 第四十一次大会散会之后——雾港的黄昏。
> Era: the Institute — the 72nd year of its founding · after the 41st Convocation; dusk in Fog Harbor.

---

## 一 · The Places of the Two Lanterns

The entrance to Fog Harbor has two lamps — the left one is the Institute's watchers' light, the right one the lantern the tower lights. In fog, the tower's third lamp never burns.

The Iron-Moon Age tower records carry one annotation: "third lamp — unkept in fog." Nothing in the duty log records oil for the third lamp; the silhouette charts carry only an unfinished arc.
When fog sets in, the tower sees only two lamps — one large, one small, fixed.

**锚句**：雾港黄昏起雾的时候，码头口总有一艘船不在值守的名册上。
**Anchor sentence**: when the fog rolls in at Fog Harbor at dusk, there is always a ship that is not on any watch register.

---

## 二 · The Second Lantern Is Never Watched

The watchers of Fog Harbor all know: seeing the first lamp is harmless; seeing the second, you will not see anything clearly for a hundred years.

The tower's rule is: in fog only two lamps are safe — the keeper who sees the first needs no ledger; the keeper who sees the second is assigned back to the back alley the next morning. Since the Iron-Moon Age, no "the second lamp burned" entry was ever copied away by the copyists — they took each one white, into the archive drawer.

**锚句**：灯人从不往雾港方向张望第二盏——看到它的人看不见第二天的雾港。
**Anchor sentence**: the lighthouse keepers never watch the second lantern — those who see it do not see the next day's Fog Harbor.

---

## 三 · No Name, No Anchor

The earliest record of this ship appears on the tower's certificate of the first anniversary week — "after dark, two points in the fog; entered the harbor without anchor." The edge of the record had dried to half; the copyist added a single character: "ship." From that day all copyists knew the entry existed and were to leave it incomplete.

Among the watchers the private phrase persists: this ship carries no name because no one owns it — it does not even obey the rice-jar month of the Institute.

**锚句**：这条船从不停泊、从不收锚、从不给任何人上船——它没名字，也从不需要。
**Anchor sentence**: this ship never ties up, never casts anchor, never takes anyone aboard — it has no name and needs none.

---

## 四 · Seven Times in Seventy-Two Years

The Institute's seventy-two-year Fog Harbor records hold seven appearances:
year 13 — the fog came, a grain of sand fell; year 29 — the third lamp of the tower did not burn, yet the shadow came; year 42 — the very day the forty-first Convocation dispersed; year 48 — the third day of the salt sea's lowest tide; year 58 — a careful watcher counted the spacing between the two lamps was not the usual spacing; year 69 — an archivist copied the wrong character; year 72 — which is this year.

No one remembers the shapes of the seven — the watchers remember only the number of times. The copyists copy the count into the blank next to the rice-jar month, stamp it with the half-moon seal, and never send it up.

**锚句**：潮沙盘七十二年记录这艘船出现过七次——值守不记形状，只记次数。
**Anchor sentence**: in seventy-two years the sand table records seven appearances — the watchers count the times, never the shape.

---

## 五 · The Fog Lifts

If the fog lifts, the ship does not exist. No one asked the watchers what they did — one grain of sand falls from the sand table on its own.

The shift-book stops at page 37 — the half-moon seal rests on a blank page; the ship is not there, and no one burned oil that anyone witnessed.
The Fog Harbor keepers met again the next day — nothing was decided, because the forty-first Convocation's minutes hold no such page. The watchers say only this: "The fog has lifted; nothing more needs asking."

**锚句**：雾散了这艘船就不存在——潮候院不需要一艘没有答案的船。
**Anchor sentence**: when the fog lifts the ship ceases to exist — the Institute needs no ship without an answer.

---

## 六 · Mapping（Echo No. 23 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | Dusk in Fog Harbor · the second lantern · seven times in seventy-two years | 一、二、三、四、六 |
| geography | Iron-Moon fog harbor · the entry lamps · the tower | 一、二、三、五、六 |
| characters | The tower keeper · the watchers · the copyists | 二、三、四、五、六 |
| story | The Ship That Appears at Dusk · Echo No. 23 | 全篇 |
| items | The third lamp · the sand table · the half-moon seal · the page numbers | 一、二、四、五、六 |
| history | Iron-Moon→Institute fog records · after the forty-first Convocation | 一、二、四、五、六 |

> 每一下黄昏，雾港只看见两盏灯——谁去看第三盏，谁就要离开这个世界。
> Every dusk, Fog Harbor sees only two lights — whoever looks for the third leaves the world.
`,
  },
  {
    order: 24,
    slug: 'echo-024-the-salt-that-never-dissolved',
    titleZh: '里巷子石槽里那粒没化的盐',
    titleEn: 'The Salt in the Trough That Never Dissolved',
    eraLineZh: '纪元：潮候院 · 建院第四十九年 · 第四十一次大会散会之后——潮落的时候。',
    eraLineEn: 'Era: the Institute — 49th year of its founding · after the 41st Convocation; when the tide goes out.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 24)

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给里巷子石槽里那粒没化的盐——它漂在石槽里很多年了；抄本员把这粒盐称作「潮的签名」。
> 纪律同正典：锚句 zh/en 逐字对应。

> 纪元：潮候院 · 建院第四十九年 · 第四十一次大会散会之后——潮落的时候。
> Era: the Institute — 49th year of its founding · after the 41st Convocation; when the tide goes out.

---

## 一 · 那粒盐什么时候落进石槽

里巷子的石槽曾经是铁月纪的人用来腌藏的潮盐盘。五百年前潮候院东侧最深处还有一片水田，候咸的人在石槽里晒残留的海水。

潮沙盘第一次点灯的那天晚上，候（第四十一次大会之后的第一代抄本员）用石槽里捞起来的盐蘸了蘸他手里的半月章——签名。石槽里的水在那时退干净了，只剩下这粒不溶的盐。

**锚句**：石槽里那粒盐没人知道它什么时候落进去的——它漂在潮候院最里侧的水槽里。
**Anchor sentence**: no one knows when the grain of salt first landed in the trough — it drifts in the deepest water of the Institute.

---

## 二 · 水退了，盐没退

后来人填了水田，石槽被改作晒米的浅池。潮候院的每一代值守上任，要经过石槽的时候，抄本员会多看一眼——

「太阳照到石槽的时候，它往哪边动一下？」问过的值守都知道：它几乎不动。

老抄本员说，如果哪天它漂起来、水到了顶、又漂回去了，你就知道潮候院有事了。

**锚句**：水退了五百年，石槽里那粒盐至今还没人捞，也没哪一代潮候院把它收去藏起来。
**Anchor sentence**: for five hundred years the water receded and the salt drifted on — no generation of the Institute has scooped it or stored it.

---

## 三 · 半月章的那滴

第四十一次大会散会之后，新来的值守补档的时候抄错过一页——前任抄本员把「潮沙盘落了一格沙」抄成了「潮落了一格沙」。

改正的时候正好有人提议要给半月章再蘸一次新盐。

抄本员没有去井里打新水，也没有开盐库——他只是蹲在石槽前，隔着日光取下那粒盐，蘸了蘸章，再把盐放回槽里。石槽里的盐沾上半月章走了一个来回，什么也没带走。

**锚句**：潮候院的半月章是石槽里的这粒盐蘸过的——没人知道还有没有别的东西被蘸过。
**Anchor sentence**: the Institute's half-moon seal is the one this salt in the trough has dampened — no one knows what else it has touched.

---

## 四 · 没有人想捞它

新来的值守有一次忍不住问：一粒盐而已，留着做什么？

里巷子里最年近的值守回答的只有一句：「一粒盐不是一粒盐，是历史不动的位置。」

值守长收到档案里关于这粒盐的那份报告——石槽里没有姓名，只有一块水干了的石板和一粒两毫米的盐，报告作者在备注里写了两行：「潮沙盘落白沙」、「收件人」。此后没有人再问。

**锚句**：新来的值守一度想把这粒盐捞起来问问它的来历——老抄本员说别动潮的东西。
**Anchor sentence**: a new watcher once asked what would happen if someone lifted the salt to ask its origin — the old copyist said: leave what the tide approves of alone.

---

## 五 · 潮候院的尘

尘落到石槽上的时候，盐吸住一层尘；尘被风吹掉，盐还在。

钟楼不响的年份里面，石槽的盐上有一圈很浅的印——也许是半月章早上下落时留的印；也许不是；石槽里那只扁鸟（潮候院的某种沉默生物）可能是从槽边飞过的那年。

值守知道的唯一一条关于这粒盐的规矩是：可以拿手摸它，不可以拿走它。摸过的人第二天会觉得空落落的——「像那句话还没说完就先断了」。

**锚句**：潮候院的尘都没能把这粒盐带走——它只是漂在那里，拒绝化，拒绝被带走。
**Anchor sentence**: even the dust of the Institute could not carry the grain away — it only drifts there, unwilling to dissolve and unwilling to be taken.

---

## 六 · 映射（回响二十四章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 石槽 · 半月章蘸盐 · 收件人 | 一、二、三、四、六 |
| geography | 里巷子 · 东侧最深处 · 潮沙盘 | 一、二、三、四、六 |
| characters | 里巷子抄本员 · 潮候院值守长 · 新来的值守 | 一、二、三、四、五 |
| story | 石槽里那粒没化的盐 · 回响（其二十四） | 全篇 |
| items | 石槽 · 半月章 · 扁鸟 · 盐库 | 一、二、三、四、五、六 |
| history | 铁月纪至潮候院 · 第四十一次大会之后 | 一、三、四、六 |

> 里巷子的石槽里那粒盐至今没人能捞——据说收件人的笔迹还没干。
> The grain of salt holds itself in the trough — some say the addressee's hand has not yet dried.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其二十四）「里巷子石槽里那粒没化的盐」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给里巷子石槽里那粒没化的盐——它漂在石槽里很多年了；抄本员把这粒盐称作「潮的签名」。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the undissolved grain of salt in the trough of the back alley — it has drifted in the trough for years; the copyists call it "the tide's signature".
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 建院第四十九年 · 第四十一次大会散会之后——潮落的时候。
> Era: the Institute — 49th year of its founding · after the 41st Convocation; when the tide goes out.

---

## 一 · When the Grain Fell into the Trough

The trough in the back alley was originally an Iron-Moon pickle of tide-salt. Five hundred years ago, the deepest part to the east of the Institute was still flooded ground, and the salt harvesters dried residual sea salt in this trough.

The night of the first sand table lighting, the first copyist — the successor of the forty-first Convocation — dipped the half-moon seal into a brine drawn from the trough and pressed it. The water in the trough evaporated clean that same night; only the single undissolved grain remained.

**锚句**：石槽里那粒盐没人知道它什么时候落进去的——它漂在潮候院最里侧的水槽里。
**Anchor sentence**: no one knows when the grain of salt first landed in the trough — it drifts in the deepest water of the Institute.

---

## 二 · The Water Left, the Salt Did Not

Years later the flooded ground was reclaimed and the trough was reworked as a shallow winnowing pan. Every watcher climbing to their appointment passes the trough, the copyists always glance first:

"When the sun reaches the trough — does it move?" Those who asked already knew: hardly at all.

The oldest copyists say: if some day it drifts up, the water reaches the rim, and then back down again, you will know the Institute is in trouble.

**锚句**：水退了五百年，石槽里那粒盐至今还没人捞，也没哪一代潮候院把它收去藏起来。
**Anchor sentence**: for five hundred years the water receded and the salt drifted on — no generation of the Institute has scooped it or stored it.

---

## 三 · The Drop That Touched the Seal

After the forty-first Convocation dispersed, a newly appointed watcher once mis-copied a line — a predecessor copyist wrote down "the tide let a grain of sand down" as "the grain of sand stopped at high tide".

At the moment of correction, someone suggested dipping the half-moon seal in fresh salt.

The copyist did not fetch water from the well, nor open the salt store — he knelt at the trough, reached for the grain of salt over a fine band of afternoon sun, dipped the seal, and set the salt back. The grain traveled once and brought nothing back.

**锚句**：潮候院的半月章是石槽里的这粒盐蘸过的——没人知道还有没有别的东西被蘸过。
**Anchor sentence**: the Institute's half-moon seal is the one this salt in the trough has dampened — no one knows what else it has touched.

---

## 四 · No One Wants to Fish It Out

A newly appointed watcher once asked outright: it is a single grain of salt — what is it kept for?

The oldest watcher in the back alley answered with one sentence: "A grain of salt is not a grain of salt; it is the fixed position of history."

Headkeeper, in an archival note on the grain of salt — the trough holds no name; only a flat slab of dried stone and a two-millimetre grain lay on it. The note's author wrote two lines as remarks: "tide sand table let fall white sand", "addressee". After that, no one asked again.

**锚句**：新来的值守一度想把这粒盐捞起来问问它的来历——老抄本员说别动潮的东西。
**Anchor sentence**: a new watcher once asked what would happen if someone lifted the salt to ask its origin — the old copyist said: leave what the tide approves of alone.

---

## 五 · The Dust of the Institute

Dust settles on the trough, and the salt holds a layer of it; the wind sweeps the dust off, and the grain remains.

In the years the tower never rang, a shallow embossed circle appeared on the grain of salt — perhaps the stamp of an early dawn half-moon breath, perhaps not; perhaps the flat bird (one of the Institute's quiet creatures) flew across the trough that year.

What the watchers know about the grain is the only rule: you may touch it with your hand; you may not take it. Whoever touched it would wake the next morning feeling weightless — "as if the sentence had broken before it finished".

**锚句**：潮候院的尘都没能把这粒盐带走——它只是漂在那里，拒绝化，拒绝被带走。
**Anchor sentence**: even the dust of the Institute could not carry the grain away — it only drifts there, unwilling to dissolve and unwilling to be taken.

---

## 六 · Mapping（Echo No. 24 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The trough · the half-moon seal dipped · the addressee | 一、二、三、四、六 |
| geography | The back alley · deepest east · the tide-sand table | 一、二、三、四、六 |
| characters | The copyists · the keeper · the new watcher | 一、二、三、四、五 |
| story | The Grain of Salt in the Trough · Echo No. 24 | 全篇 |
| items | The trough · the half-moon seal · the flat bird · the salt store | 一、二、三、四、五、六 |
| history | From Iron-Moon to the Institute · after the 41st Convocation | 一、三、四、六 |

> 里巷子的石槽里那粒盐至今没人能捞——据说收件人的笔迹还没干。
> The grain of salt holds itself in the trough — some say the addressee's hand has not yet dried.
`,
  },
  {
    order: 25,
    slug: 'echo-025-the-night-every-lamp-went-out',
    titleZh: '里巷子所有灯熄的那一夜',
    titleEn: 'The Night Every Lamp in the Back Alley Went Out',
    eraLineZh: '纪元：潮候院 · 建院第六十八年 · 第四十一次大会散会之后——镜里月的那一晚。',
    eraLineEn: 'Era: the Institute — 68th year of its founding · after the 41st Convocation; the night the mirror-moon rose.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 25): The Night Every Lamp in the Back Alley Went Out

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给里巷子所有的灯熄的那一夜——那时潮候院停考了整整半天，所有灯一起熄了。值守们至今不说那个夜晚的长度。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the night every lamp in the back alley went out — the Institute stayed closed for half an afternoon; the watchers still do not name its length.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 建院第六十八年 · 第四十一次大会散会之后——镜里月的那一晚。
> Era: the Institute — 68th year of its founding · after the 41st Convocation; the night the mirror-moon rose.

---

## 一 · 所有灯同时熄了

六十八年前，正午刚过，里巷子的所有灯一起熄灭。

晾鱼架那盏不熄的灯（一号钩附近那盏）风力下也会晃——那盏忽然熄了；潮候院值守带的灯补了第二盏，然后第三盏，灯影只闪了几下也熄了；米缸月的收成摊上那盏平时散着亮光的小灯也消失了。

没有人点火，也没有风停——尘起时落下了。值守把沙漏推了推——落沙停了。

**锚句**：所有的灯都熄了的那一夜，值守忘了带第二颗火——潮候院没有备用的。
**Anchor sentence**: the night every lamp went out, the watchers forgot the second flint — the Institute keeps no spare.

---

## 二 · 潮候院没有紧急备用灯

值守班没有备用灯的方案——潮候院的生活里不承认事故，只承认潮汐。

值守长在米缸月的便签上只写了一句：「等潮再涨，看它落哪格。」剩下的值守和潮沙盘的空白被放在了潮候院的编号页面上——每一代抄本员都不敢拿空白页当试用纸。

补完的时刻约晚间八点（值守私下说是「晚饭之后」）。重新亮起的同时祠殿堂方向才亮起一点光——春天的月亮还没升过来。

**锚句**：潮候院没有任何灯备用方案——它相信潮自己会说完。
**Anchor sentence**: the Institute keeps no backup for any lamp — it trusts the tide to finish its own sentence.

---

## 三 · 潮沙盘没说

抄本员记下了当天唯一看到的现象：整整个潮沙盘中心空了一格。

那一格是白的——白得像海浪在沙上退掉留下的盐渍。他抄完以后再没见过这样的白。后来的抄本员试图把那段记录归入"米缸月洁净纪录"，却找不到那一页——第四十一次大会散会后的值班册上只写了一句：「空一格记白。」

值守后来不再问抄本员这个空白格的来历——米缸月的某一页被单独用双绳系住。

**锚句**：潮沙盘中间空过一格的位置，原来是潮自己留的空白。
**Anchor sentence**: the empty square in the sand table was left blank by the tide itself.

---

## 四 · 米缸月的答案

那一晚从祠殿堂升起的第一缕白光是一种晶体——不是沙，也不是雪。

抄本员取走了一点，装进米缸月大厅的值守办公室密室——白的晶体冷得像从天上掉下来的一点礼物，值守确认过它不是米——不用记入米缸月收成册，米缸月大厅的值守长自己记录：「字条——潮候院叫它——潮候院的月雪。」

从此以后，里巷子的值守每逢米缸月月初都会多看一眼祠殿堂的密室门——值守们不讨论里面；抄本员只是偶尔在远处站一会儿。

**锚句**：米缸月那晚出现的白，被叫作潮候院的月雪，封存在祠殿堂密室里。
**Anchor sentence**: the white that came that rice-jar night is called the Institute's moon-snow, sealed in the inner rooms of the chapel.

---

## 五 · 密室的番号

祠殿堂的米缸月密室在里巷子里有一个从没有公开过的编号：七十二。

里巷子的值守只在每年米缸月月初来检查——关上门、点上里边的最后一盏——不加入其他值守的登记簿，也不计入值守交接册。值守长编号七十二拥有另一个秘密名：潮候院竹牍里它叫「空一格」。

抄本员自己从来没有完整地写过它。值守长在四十一年前收到一封没有署名的信——落款只有一个半月印章。信上只有一句话：「在灯熄的那一夜别叫醒任何人——潮候院要知道它自己再立一次。」——此后灯自己没再熄。

**锚句**：米缸月密室的番号只是「空一格」——潮候院的值守一概不出声问你里面是什么。
**Anchor sentence**: the inner room's number is only "one empty square" — no watcher ever names aloud what is inside.

---

## 六 · 映射（回响二十五章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 灯熄夜 · 米缸月月雪 · 第四十一次大会之后 | 一、二、三、四、五、六 |
| geography | 里巷子 · 米缸月大厅密室 · 潮沙盘 | 一、二、三、五、六 |
| characters | 值守长 · 前一任抄本员 · 祠殿堂值守 | 一、二、三、四、五 |
| story | 里巷子所有灯熄的那一夜 · 回响（其二十五） | 全篇 |
| items | 半月章遗墨 · 米缸月月雪 · 潮沙盘 · 密室编号页 | 一、二、三、四、五、六 |
| history | 第四十一次大会前夜 · 潮候院的沉默记录 | 一、二、三、五、六 |

> 灯熄的夜晚里巷子从未关门——值守说，那只是潮候了自己一次呼吸。
> The night every lamp went out the back alley did not close its doors — the watchers say it was simply the tide holding its breath once.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其二十五）「里巷子所有灯熄的那一夜」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给里巷子所有的灯熄的那一夜——那时潮候院停考了整整半天，所有灯一起熄了。值守们至今不说那个夜晚的长度。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the night every lamp in the back alley went out — the Institute stood still for half an afternoon; the watchers still do not name its length.
> Same discipline: anchors verbatim.

> Era: the Institute — 68th year of its founding · after the 41st Convocation; the night the mirror-moon rose.
> 纪元：潮候院 · 建院第六十八年 · 第四十一次大会散会之后——镜里月的那一晚。

---

## 一 · Every Lamp Went Out Together

Sixty-eight years ago, just past noon, every lamp in the back alley went out together.

The one lamp that never went out at the drying rack — the one by the No. 1 hook — swayed in the wind for years, and then it went out at once; the watchers brought a second lamp, then a third, the lamp-shadow flickered twice and they were out as well; the small light that always glowed over the rice-jar month's produce stall vanished as well.

No one lit a fire, and no wind stopped — the dust simply settled as the lamps sank. The watchers pushed the sand-glass — the sand stopped falling.

**锚句**：所有的灯都熄了的那一夜，值守忘了带第二颗火——潮候院没有备用的。
**Anchor sentence**: the night every lamp went out, the watchers forgot the second flint — the Institute keeps no spare.

---

## 二 · The Institute Keeps No Backup Lamps

The watchers kept no backup lamp scheme — the Institute's life recognizes no accident, only tides.

The keeper wrote a single line on the notebook from the rice-jar month: "Wait for the tide to rise again; see which square it fills." The rest of the watcher-handbook's blank pages stayed in the Institute's numbered bindings — no copyist dared use the blank pages as scrap.

The backup light returned around eight in the evening — the watchers privately called that "after the meal." When it did come, a small gleam rose toward the chapel — the spring moon had not yet mounted.

**锚句**：潮候院没有任何灯备用方案——它相信潮自己会说完。
**Anchor sentence**: the Institute keeps no backup for any lamp — it trusts the tide to finish its own sentence.

---

## 三 · The Sand Table Kept Its Own Counsel

The copyist recorded the only phenomenon of that day: the square at the very center of the sand table stood empty.

The square was white — white as seawater's salt-shadow left on sand by a wave withdrawing. He never saw that white again. The later copyists tried to append that record to the "rice-jar month purity ledger," but the page could not be found — the duty book after the forty-first Convocation recorded one line: "empty square, noted white."

Afterwards the watchers never asked the copyist about the origin of that square — a page of that rice-jar month was tied separately with two cords.

**锚句**：潮沙盘中间空过一格的位置，原来是潮自己留的空白。
**Anchor sentence**: the empty square in the sand table was left blank by the tide itself.

---

## 四 · The Rice-Jar Month's Answer

The first ray that rose in that rice-jar night from the chapel was a kind of crystal — not sand, not snow.

The copyist picked up a bit, sealed it in the inner room of the Institute's rice-jar office — the white crystal was cold as a distant gift dropped from somewhere beyond the reach of the tide. The watchers confirmed it was not rice — the rice-jar month's harvest brought it no entry; the keeper himself recorded one slip: "The Institute calls this — the moon-snow of the rice-jar month."

After this, the watchers of the back alley would glance at the chapel's inner-room door at the start of every rice-jar month — not discussing the contents; the copyist sometimes only stood there a moment, never speaking.

**锚句**：米缸月那晚出现的白，被叫作潮候院的月雪，封存在祠殿堂密室里。
**Anchor sentence**: the white that came that rice-jar night is called the Institute's moon-snow, sealed in the inner rooms of the chapel.

---

## 五 · The Number of the Inner Room

The inner room in the rice-jar office of the chapel carries a number the Institute has never made public: seventy-two.

The watchers of the back alley come at the beginning of each rice-jar month — locking the room, lighting the single inner lamp — registering in no other ledger and entering no hand-over book. The keeper of the room numbered seventy-two carries a second, secret name: the bamboo slips of the Institute call it "the empty square."

The copyist never fully wrote it out. The headkeeper received an unsigned letter forty-one years ago, bearing only a half-moon seal as signature. The letter holds one sentence: "Do not wake anyone on the night the lamps go out — the Institute must know it is standing for itself once more." After that, the lamps never went out on their own again.

**锚句**：米缸月密室的番号只是「空一格」——潮候院的值守一概不出声问你里面是什么。
**Anchor sentence**: the inner room's number is only "one empty square" — no watcher ever names aloud what is inside.

---

## 六 · Mapping（Echo No. 25 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The night of extinguished lamps · the rice-jar month moon-snow · after the forty-first Convocation | 一、二、三、四、五、六 |
| geography | The back alley · the inner room of the rice-jar office · the sand table | 一、二、三、五、六 |
| characters | The headkeeper · a predecessor copyist · the chapel watchers | 一、二、三、四、五 |
| story | The Night Every Lamp Went Out · Echo No. 25 | 全篇 |
| items | The remnant ink of the half-moon seal · the moon-snow · the sand table · the numbered slip | 一、二、三、四、五、六 |
| history | The night before the forty-first Convocation · the silent records of the Institute | 一、三、五、六 |

> 灯熄的夜晚里巷子从未关门——值守说，那只是潮候了自己一次呼吸。
> The night every lamp went out the back alley did not close its doors — the watchers say it was simply the tide holding its breath once.
`,
  },
  {
    order: 26,
    slug: 'echo-026-the-web-nobody-is-allowed-to-sweep',
    titleZh: '祠殿檐下那张潮候院不许扫的网',
    titleEn: 'The Web Under the Chapel Eaves Nobody Is Allowed to Sweep',
    eraLineZh: '纪元：潮候院 · 建院第五十四年 · 第四十一次大会散会之后——雨季的黄昏。',
    eraLineEn: 'Era: the Institute — 54th year of its founding · after the 41st Convocation; a dusk in the wet season.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 26): The Web Under the Chapel Eaves Nobody Is Allowed to Sweep

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿檐角一张从没被收走过的蜘蛛网——值守所有扫帚经过的时候，那张网总是被刻意绕开。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the web at the corner of the chapel eaves — every broom of every watcher has stepped around it.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 建院第五十四年 · 第四十一次大会散会之后——雨季的黄昏。
> Era: the Institute — 54th year of its founding · after the 41st Convocation; a dusk in the wet season.

---

## 一 · 那张网什么时候挂出来的

祠殿檐下那张网挂的时间比潮候院还早——仓库最早的图纸只画了一条檐边：一条弯下来的弧线，没有任何绑定记号。

铁月纪仓库留下的旧页只记下了几句短笔：「狮子不进」「鸟不啄」「灯不熄」——从那以后的值守收到的唯一一条条文是：「檐角那张网，别动。」

网织线的纹理不完全像常见蛛丝——它结得比别的网密，放射状的主线上缀着细小的白色颗粒；湿季灯光打上去时那颗粒亮成了一点点的星点。

**锚句**：祠殿檐下的网挂在建院之前就挂在那里——值守从来没见过它新织出来的那天。
**Anchor sentence**: the web at the chapel corner has been there since before the Institute was founded — no watcher ever saw its first day of weaving.

---

## 二 · 值守的帚从没摆上线

新来的值守有一次真的递过帚——值守长没有抢下来，只是站在旁边看。

新来的人站了大约一炷香的时间，最后帚尖落在祠殿砖缝里，没有碰到网。前辈后来解释了一句：

「你可以经过它；你没办法碰它。」

从此值守班形成了新的惯例：无论祠殿大清日怎么扫，帚头经过「檐角」这个区域的时候永远贴着砖走。

**锚句**：新来的值守递过一把帚——帚尖落在砖缝里，网没有被碰过。
**Anchor sentence**: a new watcher once held out a broom — the bristles landed in the brick seams; the web was never touched.

---

## 三 · 三处破损与潮沙盘

过去五十四年里，那张网出现过三处大的破损：

建院第十年、第二十年、第五十年的米缸月中旬。每一次破损后的第三天，潮沙盘都多落了一格沙。没有人知道少一格沙和破损之间的关系，但手艺最老的抄本员私下传过：

「少一根，沙多一格。」

破损之后的九天内，值守不去动网——等承接的蛛丝慢慢补上去；补完的那天值守把新的一根蛛丝在纸条上画出来，不送上报、不登记册。

**锚句**：网破三处、沙落一格——抄本员们只在纸条上画出新的蛛丝，从不登记它。
**Anchor sentence**: the web broke three times, and each time a grain of sand fell too — the copyists only drew the replacement strands on paper; no register holds them.

---

## 四 · 网里那些落过的东西

值守记录（口头而非抄本）：挂过一根白羽——像是某种从没飞进过里巷子的大鸟；一片半月章糊湿的纸——日期推不出来；一缕银黑色的毛——至今无人认出它是哪一种海生的生物。

上一代的值守一度试探着想把一片半月章纸揭下来，他被值守长挡在了檐角之外——

「你拿不下它。拿得下就不在那里了。」

纸和网从此再没有人动过。

**锚句**：网里挂过一片半月章的纸——那之后的值守谁也不敢再去揭它。
**Anchor sentence**: a fragment of a half-moon seal stuck in the web — no one after those days dares take it down.

---

## 五 · 值守的班级

值守班内部把「能经过檐角那张网」作为一种值守资格：被允许走近到檐下两臂以内的，算见过。

值守长的默认规矩是：新来的值守进入祠殿两个月以后才带他站那一侧——不是因为怕他偷看什么，是因为前辈自己也没被允许靠近过。值守班学到的第一件事不是别的，是「知道有些东西在那里、知道没人允许我碰」。

潮候院的哲学里，收件人第一章问过的一句话在这里再现了一次：潮候院不解释收件人。

**锚句**：值守班的资格在于你可以走近到檐下两臂——潮候院从不说那张网属于谁。
**Anchor sentence**: the watchers' standing is marked by how close you may walk beneath the eaves — the Institute never says whose web it is.

---

## 六 · 映射（回响二十六章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 祠殿檐下的网 · 半月章纸片 · 米缸月破损 | 一、二、三、四、六 |
| geography | 祠殿檐角 · 潮沙盘 · 潮候院仓库 | 一、三、五、六 |
| characters | 值守长 · 新来的值守 · 老抄本员 | 一、二、三、四、五 |
| story | 那张潮候院不许扫的网 · 回响（其二十六） | 全篇 |
| items | 檐下蜘蛛网 · 半月章纸片 · 白羽 · 银黑毛 | 一、四、五、六 |
| history | 建院前的檐 · 第五十年、第十年破损 · 第四十一次大会后 | 一、三、四、六 |

> 风夜里祠殿檐下的网自己会多出一根蛛丝——潮候院的收件人早在大风之前先听见了。
> In windy nights a new thread appears in the web — the Institute hears its addressee before the storm arrives.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其二十六）「祠殿檐下那张潮候院不许扫的网」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿檐角一张从没被收走过的蜘蛛网——值守所有扫帚经过的时候，那张网总是被刻意绕开。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the web at the corner of the chapel eaves — every broom of every watcher has stepped around it.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 建院第五十四年 · 第四十一次大会散会之后——雨季的黄昏。
> Era: the Institute — 54th year of its founding · after the 41st Convocation; a dusk in the wet season.

---

## 一 · When the Web Went Up

The web beneath the chapel eaves predates the Institute — the earliest drawing in the warehouse plots a single arc along the eaves, with none of the usual bindings or tags.

The old pages left by the Iron-Moon vault carry only a few short lines: "no lions in", "no birds pick", "no lights off" — the one ordinance passed down to every watcher since is: "the web at the eaves — leave it."

The texture of the web does not quite resemble ordinary silk — it is woven denser than webs elsewhere, with fine white grains on its radial strands; in wet seasons the lamplight picks out the specks as small stars.

**锚句**：祠殿檐下的网挂在建院之前就挂在那里——值守从来没见过它新织出来的那天。
**Anchor sentence**: the web at the chapel corner has been there since before the Institute was founded — no watcher ever saw its first day of weaving.

---

## 二 · The Watchers' Brooms Never Touched It

One of the new watchers once held a broom toward it — the headkeeper did not snatch it away. He only stood by and watched.

The new watcher stood for roughly a stick of incense; the bristles finally landed inside the brick seam and never once reached the web. The seniors explained later:

"You may pass by it; you cannot touch it."

Since then the watchers have kept a new habit: on the great sweep days, the broom-head slides along the bricks as it passes the eaves.

**锚句**：新来的值守递过一把帚——帚尖落在砖缝里，网没有被碰过。
**Anchor sentence**: a new watcher once held out a broom — the bristles landed in the brick seams; the web was never touched.

---

## 三 · Three Tears and the Sand Table

Over the fifty-four years the web has taken three major tears:

the mile-kinds of years 10, 20, and 50 — in the middle of the rice-jar month. Each time a major tear appears, on the third day one grain of sand falls from the table. No one holds any register of connection, yet the headkeeper of the oldest craft tells a whispered phrase:

"One thread short, one grain of sand more."

For nine days after a tear, the watchers do not go near the web — they wait for the new silk to root. Whoever records that watcher closes the ledger on a single slip of hand-drawn silk and never registers it.

**锚句**：网破三处、沙落一格——抄本员们只在纸条上画出新的蛛丝，从不登记它。
**Anchor sentence**: the web broke three times, and each time a grain of sand fell too — the copyists only drew the replacement strands on paper; no register holds them.

---

## 四 · Things That Landed in the Web

Recorded by ear (never written): a white feather — something unlike any seabird that enters the alley; a scrap of paper stamped in the half-moon seal, rolled with a date that refuses to come clear; a tuft of silver-black hair — no one identified which sea creature had left it.

A previous watcher once dared to lift the half-moon paper, only to find himself held back outside the eaves by the headkeeper:

"You cannot take it from there. If you can take it, it was never there to begin with."

Nothing has been touched since; the paper and the web still hold each other.

**锚句**：网里挂过一片半月章的纸——那之后的值守谁也不敢再去揭它。
**Anchor sentence**: a fragment of a half-moon seal stuck in the web — no one after those days dares take it down.

---

## 五 · The Watchers' Standing

The watchers privately call walking to the web "standing a night in the eaves" — accepted only when they may approach within two arm-lengths beneath the eaves.

The default rule of the headkeeper: a new watcher stands on that side two months after entering the chapel — not because fear of what the new watcher might glimpse; because the seniors themselves were never allowed that close. The watchers' first craft is to know that something waits there; and to know that no one permits them to touch it.

The Institute's philosophy holds the same caution the fifth chapter asked its addressee: the Institute does not interpret its Addressee.

**锚句**：值守班的资格在于你可以走近到檐下两臂——潮候院从不说那张网属于谁。
**Anchor sentence**: the watchers' standing is marked by how close you may walk beneath the eaves — the Institute never says whose web it is.

---

## 六 · Mapping（Echo No. 26 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The web beneath the chapel · the half-moon paper · the rice-jar month tear | 一、二、三、四、六 |
| geography | The eaves of the chapel · the sand table · the Institute vault | 一、三、五、六 |
| characters | The headkeeper · the new watcher · the old copyist | 一、二、三、四、五 |
| story | The Web Nobody Is Allowed to Sweep · Echo No. 26 | 全篇 |
| items | The web · the half-moon paper · the white feather · the tuft of hair | 一、四、五、六 |
| history | The eaves before the founding · the tears in years 10, 20, 50 · after the 41st Convocation | 一、三、四、六 |

> 风夜里祠殿檐下的网自己会多出一根蛛丝——潮候院的收件人早在大风之前先听见了。
> In windy nights a new thread appears in the web — the Institute hears its addressee before the storm arrives.
`,
  },
  {
    order: 27,
    slug: 'echo-027-the-wall-of-the-forty-one-convocations',
    titleZh: '里巷子里刻着四十一次大会的那面墙',
    titleEn: 'The Wall in the Back Alley Carved with the Forty-One Convocations',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——盐风落墙。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the walls smell of salt wind.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 27): The Wall in the Back Alley Carved with the Forty-One Convocations

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给里巷子通向祠殿的那道石墙——每一次大会散会之后，墙上多一根槽；潮打浪落的时候，那些槽被海记住。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the stone wall on chapel road — after each Convocation, a groove appears; at high tide the grooves are read by the sea.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——盐风落墙。
> Era: the Institute — after the 41st Convocation; the walls smell of salt wind.

---

## 一 · 四十一条槽

里巷子通往祠殿的那面墙上，刻着一排笔直的槽。

第四十一次大会散会之后，值守交班的时候目测了一遍，抄本员两人一组数过去，共四十一道槽。每一道都用同样的刻刀刃。

新来的值守每次路过都会下意识数一遍——没人教他们数；他们自己数出来的。

**锚句**：里巷子的石墙上刻着四十一条槽——海风磨了四十多年，它们还在。
**Anchor sentence**: forty-one grooves are cut into the wall of the back alley — salt wind has worked on them for forty-odd years, and they remain.

---

## 二 · 最下面那一道是海刻的

抄本员辨认出：最下面那道槽不是人刻的——太深了一寸，形状也不一样。

没人知道它什么时候来的——潮候院最早的仓库图纸上就画了一面墙，墙位那一格留着。

老值守口口相传："那不是哪次大会，是大会之意。"——意思是那道槽早于整套「大会」的轮廓。

**锚句**：海刻的那道槽在最下面——它比第一次大会还早，没有值守记得它是哪一年刻的。
**Anchor sentence**: the sea's own groove is the lowest — it is older than the first Convocation; no watcher living recalls which year it was cut.

---

## 三 · 第四十二条槽还没出现

四十一次大会散会以后，第三天早上——新来的值守看到第 42 道位置上出现了细细的一线。

没人认领那道新线。值守长检查之后说：还不能算。
线在第二天中午消失——

后来值守们私下传话：它又退回去了；或者干脆没来过。

**锚句**：四十二条槽的位置有过一线——没有人认领它，第二天它自己就消失了。
**Anchor sentence**: once, a faint groove appeared at the forty-second position — no one claimed it; by the next day it was gone by itself.

---

## 四 · 值守从不为海登记

六十多年里，值守长每次接管交接班，都会登记：墙上刻了四十一槽。

值守长们没有人回答过「42」的疑问：是不是大海还没同意。

值守们的说法只有一个："墙设在那里，就让它在。"——潮候院不统计潮的工程量，也不统计海的槽。

**锚句**：值守从不为海刻的那道槽登记——四十一道是人刻的，海那一道自己会数。
**Anchor sentence**: the watchers have never registered the sea's groove — forty-one belong to hands; the sea counts its own.

---

## 五 · 墙的对面

石墙对面不是祠殿——是一条条天然的岩缝。

石槽一道一道对齐：里巷子的风、海水的浪痕和祠殿的影子的边界上距一箭——里巷子传言说：

「如果有一天四十二道槽齐了，祠殿里会过会。」

没有人敢讲出后半句。值守从来没大声讲过，也从来没有试图验证。

**锚句**：墙对面的岩缝里正好能看见祠殿的影子——如果有一天四十二道槽齐了，潮候院会办下一次大会。
**Anchor sentence**: the rock slits opposite the wall hold the chapel precisely in their gaps — if all forty-two grooves ever appear, the Institute will hold another Convocation.

---

## 六 · 映射（回响二十七章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 四十一条槽 · 海刻的第四十二道 · 石墙上的门 | 一、二、三、四、五、六 |
| geography | 里巷子 · 祠殿 · 潮沙盘东侧出海口 | 一、二、三、四、五、六 |
| characters | 值守长 · 里巷子抄本员 · 新来的值守 | 一、二、三、四、五、六 |
| story | 墙刻着四十一次大会的那面墙 · 回响（其二十七） | 全篇 |
| items | 石墙 · 小指大小的刀 · 海 · 岩缝 | 一、二、三、四、五、六 |
| history | 四十一次大会散会之后 · 第六十八年 | 一、二、三、四、五、六 |

> 海如果有一天让出第四十二条槽——潮候院的人就会为大海开一次会。
> The day the sea offers a forty-second groove, the Institute will hold a Convocation for the sea.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其二十七）「里巷子里刻着四十一次大会的那面墙」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给里巷子通向祠殿的那道石墙——每一次大会散会之后，墙上多一根槽；潮打浪落的时候，那些槽被海记住。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the stone wall on chapel road — after each Convocation, a groove appears; at high tide the grooves are read by the sea.
> Same discipline: anchors verbatim.

> Era: the Institute — after the 41st Convocation; the walls smell of salt wind.
> 纪元：潮候院 · 第四十一次大会散会之后——盐风落墙。

---

## 一 · The Forty-One Grooves

The wall on chapel road has a row of straight vertical grooves carved into it.

After the forty-first Convocation dispersed, the watchers took a turn at measuring them; the copyists counted them in pairs: forty-one. Each carried the same notch blade — small-finger depth.

Every new watcher unconsciously counts them each time they pass — nobody taught them to count; they counted on their own.

**锚句**：里巷子的石墙上刻着四十一条槽——海风磨了四十多年，它们还在。
**Anchor sentence**: forty-one grooves are cut into the wall of the back alley — salt wind has worked on them for forty-odd years, and they remain.

---

## 二 · The Lowest Groove Is the Sea's

The copyists note the lowest groove is not man-made — a full inch deeper, and of an unmatched shape.

No one knows when it appeared — the earliest drawings in the Institute warehouse already held this wall with a marked blank.

The oldest watchers say by word of mouth: "It is not from one Convocation; it is Convocation itself." — meaning it predates the very shape of a Convocation.

**锚句**：海刻的那道槽在最下面——它比第一次大会还早，没有值守记得它是哪一年刻的。
**Anchor sentence**: the sea's own groove is the lowest — it is older than the first Convocation; no watcher living recalls which year it was cut.

---

## 三 · The Forty-Second Is Not Yet

On the third morning after the forty-first Convocation dispersed — a newly arrived watcher noticed a faint line at the forty-second position.

No one owned that new groove. The headkeeper checked and said only: it cannot count.
The line was gone by noon of the next day —

The watchers later whispered among themselves: it had been pushed back; or it had never come.

**锚句**：四十二条槽的位置有过一线——没有人认领它，第二天它自己就消失了。
**Anchor sentence**: once, a faint groove appeared at the forty-second position — no one claimed it; by the next day it was gone by itself.

---

## 四 · The Watchers Never Register the Sea's

For the sixty-some years since, every shift's handover logs the forty-one grooves.

No watcher headkeeper answered the question of "forty-two": whether the sea had agreed.

Their single saying is: "The wall is there; let it be." — the Institute does not count the sea's engineering, and it does not count the sea's grooves.

**锚句**：值守从不为海刻的那道槽登记——四十一道是人刻的，海那一道自己会数。
**Anchor sentence**: the watchers have never registered the sea's groove — forty-one belong to hands; the sea counts its own.

---

## 五 · Facing the Wall

Opposite the wall is not the chapel — but a set of natural rock slits.

The grooves face them: the wind of the back alley, the spray-line of the sea, and the shadow boundary of the chapel, in a row of one arrow's width — the back alley whisper says:

"If all forty-two ever fill, the chapel will hold a Convocation."

No one dares say the second half. The watchers never spoke it aloud, nor attempted to verify it.

**锚句**：墙对面的岩缝里正好能看见祠殿的影子——如果有一天四十二道槽齐了，潮候院会办下一次大会。
**Anchor sentence**: the rock slits opposite the wall hold the chapel precisely in their gaps — if all forty-two grooves ever appear, the Institute will hold another Convocation.

---

## 六 · Mapping（Echo No. 27 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | Forty-one grooves · the sea's forty-second · the chapel-bay | 一、二、三、四、五、六 |
| geography | The back alley · the chapel · east of the tide-sand table | 一、二、三、四、五、六 |
| characters | The headkeeper · the copyists · the newly arrived | 一、二、三、四、五、六 |
| story | The Wall of the Forty-One Convocations · Echo No. 27 | 全篇 |
| items | The stone wall · the small notch-blade · the sea · the cracks | 一、二、三、四、五、六 |
| history | After the forty-first Convocation · in the 68th founding year | 一、二、三、四、五、六 |

> 海如果有一天让出第四十二条槽——潮候院的人就会为大海开一次会。
> The day the sea offers a forty-second groove, the Institute will hold a Convocation for the sea.
`,
  },
  {
    order: 28,
    slug: 'echo-028-the-knot-in-the-hourglass',
    titleZh: '潮候院沙漏里那枚没人拆开的结',
    titleEn: 'The Knot in the Institute\'s Hourglass That Nobody Opens',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——潮汐翻页之时。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; at tide-turning hour.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 28): The Knot in the Institute's Hourglass That Nobody Opens

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮沙盘里的沙漏——沙漏中心有一枚双股结；值守经过它时避而不触；抄本员每经过它都要数一次。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the hourglass on the tide-sand table — the center carries a double knot; the watchers avoid touching it; the copyists count it each time they pass.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——潮汐翻页之时。
> Era: the Institute — after the 41st Convocation; at tide-turning hour.

---

## 一 · 沙漏中心的双股结

潮候院里放在祠殿堂的沙漏——里巷子所有值守都路过那只沙漏。

沙漏正中间——正好在腰收窄的位置上——系着一个双股结：不是绳结，是细棉线上打了两个圈。它不碰玻璃，也不接沙漏顶端。

没人知道它在那里多久了——大会散会之前，漂浮的陈旧时代——沙漏出现在之前就有了结。

**锚句**：沙漏正中心的那枚双股结没有人拆过——没人敢拆。
**Anchor sentence**: the double knot in the middle of the hourglass is never undone — no one dares.

---

## 二 · 被盐扎过的手指

值守中有人想试它——第四十一次大会散会后的某次深夜——手伸得很近，没碰到皮肤就感觉到了：

「像盐扎到了手指尖。」

后来被同班值守制止了。他本人也从不提及——但值守交接册上一行："深夜灯熄时别数东西。"

新来的抄本员经过时只瞥一眼——数完再走。

**锚句**：新来的值守伸手接近那枚结——指尖就缩回来了。
**Anchor sentence**: a new watcher reached for the knot — their fingertip withdrew on contact.

---

## 三 · 沙漏谁都不翻

沙漏从来没有被翻过。

潮沙盘旁边有一枝小木棍——每次大会散会的当夜，值守长走近沙漏看一眼，拿起木棍又放下。值守之间不知道这条规矩谁定的。

「不翻不等，不等不数。」这条规矩只作为口头在里巷子里传过。抄本员亲眼看见值守长在大会头一天把木棍拿到过沙漏旁边——它只在沙漏最亮的那一下被伸出，但还没碰就收回来。

**锚句**：沙漏旁边有一枝木棍——值守长只指着沙漏而已，从没动过它。
**Anchor sentence**: a small wooden wand rests beside the hourglass — the headkeeper only points at it, never moves it.

---

## 四 · 结旁的串线贝壳

那枚结的一侧系着一只被线穿过的小贝壳——

值守一般不提它——那只贝壳烧坏了一头可以作为年号标识，尚没人注册它。百年来潮候院至今没有登记那只贝壳。

米缸月大会的第二天早晨，值守长派人抬走了别的时候摆的两盏灯：留下系贝壳的那一侧什么都不放东西。

**锚句**：那枚结旁边挂着一枚穿线贝壳——里巷子值守从不登记它。
**Anchor sentence**: a little pierced shell hangs from one side of the knot — the back-alley watchers have never registered it.

---

## 五 · 米缸月那一天

值守交接册写过：米缸月第三天，沙漏亮了一次。

沙漏亮了——不只是米缸月的亮，是里巷子路过的人都看见的——白得像日落后但还没暗透的海——那个光打不上里巷子别的物体，只对着沙漏。

没人再提那一夜。米缸月值守班的抄本员说：「那是沙漏自己决定开光，不是我们什么都没做才来的。」

**锚句**：米缸月第三天晚上——里巷子看见的光从里巷子方向亮了一下——只照亮沙漏。
**Anchor sentence**: on the third night of the rice-jar month, a light opened inside the back alley — one that lit only the hourglass.

---

## 六 · 映射（回响二十八章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 沙漏中心的结 · 串线贝壳 · 不翻的沙漏 | 一、二、三、四、六 |
| geography | 祠殿堂 · 里巷子 · 潮沙盘 | 一、二、三、四、五、六 |
| characters | 值守长 · 里巷子抄本员 · 新来的值守 | 一、二、三、四、五、六 |
| story | 不拆的结 · 回响（其二十八） | 全篇 |
| items | 双股结 · 沙漏 · 小贝壳 · 小木棍 | 一、二、三、四、五、六 |
| history | 米缸月第三天 · 第四十一次大会散会以后 | 一、三、四、五、六 |

> 沙漏中间那枚没人拆开的结——值守说过，潮自己决定哪时候自己开。
> The knot in the hourglass that no one opened — the watchers only say: the tide decides when it opens on its own.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其二十八）「潮候院沙漏里那枚没人拆开的结」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮沙盘里的沙漏——沙漏中心有一枚双股结；值守经过它时避而不触；抄本员每经过它都要数一次。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the hourglass on the tide-sand table — the center carries a double knot; the watchers avoid touching it; the copyists count it each time they pass.
> Same discipline: anchors verbatim.

> Era: the Institute — after the 41st Convocation; at tide-turning hour.
> 纪元：潮候院 · 第四十一次大会散会之后——潮汐翻页之时。

---

## 一 · The Double Knot at the Windowpanes

The hourglass the Institute keeps in the chapel hall is passed by every watcher of the back alley.

At the hourglass's narrowest point — precisely at the waist of its two cones — lies a double knot: not a rope knot, but a folded pair of turns in a fine cotton thread. It touches neither the glass nor the top cone.

No one knows how long it has been there — before the Convocations assembled, the hourglass was already carrying it.

**锚句**：沙漏正中心的那枚双股结没有人拆过——没人敢拆。
**Anchor sentence**: the double knot in the middle of the hourglass is never undone — no one dares.

---

## 二 · The Fingertip the Salt Bit

One watcher tried it — late one night after the forty-first Convocation dispersed —

"It felt like salt had bit my fingertips," he said.

Later the same watcher never mentioned it; his peers stopped him before his hand reached it. The hand-over book records one line: "At night-lamps going out, do not count anything."

A newly arrived copyist passes at most a glance — one count, then walks on.

**锚句**：新来的值守伸手接近那枚结——指尖就缩回来了。
**Anchor sentence**: a new watcher reached for the knot — their fingertip withdrew on contact.

---

## 三 · No One Turns the Hourglass

The hourglass has never been turned.

A small wooden wand sits beside it on the sand table — at the evening of each Convocation disbursement, the headkeeper walks toward the hourglass, lifts the wand, and puts it back.

Watchers do not know who decided this rule; only a whisper across the back alley: "No turning. No watching. No counting."

The copyists once saw the headkeeper lift the wand on the evening of a Convocation — she reached the hourglass and withdrew before touching it.

**锚句**：沙漏旁边有一枝木棍——值守长只指着沙漏而已，从没动过它。
**Anchor sentence**: a small wooden wand rests beside the hourglass — the headkeeper only points at it, never moves it.

---

## 四 · The Pierced Shell

A small, pierced shell hangs from one side of the knot —

Watchers do not speak of it; the shell is not registered anywhere; only two lamps are ever repositioned after the rice-jar month Convocation — the side holding the pierced shell stays untouched.

The copyists say this serves as no one's reminder: registering it would mean deciding who it belongs to.

**锚句**：那枚结旁边挂着一枚穿线贝壳——里巷子值守从不登记它。
**Anchor sentence**: a little pierced shell hangs from one side of the knot — the back-alley watchers have never registered it.

---

## 五 · The Rice-Jar Month

The hand-over book records this once: on the third night of the rice-jar month, the hourglass glowed.

A light opened inside the alley that everyone saw — white as the sea left after sunset — and the light fell on nothing else but the hourglass.
No watcher ever brought it up again. A copyist on that night's shift said one line: "The hourglass opened on its own; we didn't do anything at all."

**锚句**：米缸月第三天晚上——里巷子看见的光从里巷子方向亮了一下——只照亮沙漏。
**Anchor sentence**: on the third night of the rice-jar month, a light opened inside the back alley — one that lit only the hourglass.

---

## 六 · Mapping（Echo No. 28 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The knot inside the hourglass · the pierced shell · the never-turned hourglass | 一、二、三、四、六 |
| geography | The chapel hall · the back alley · the sand table | 一、二、三、四、五、六 |
| characters | The headkeeper · the copyists · the new arrivals | 一、二、三、四、五、六 |
| story | The Knot in the Hourglass · Echo No. 28 | 全篇 |
| items | The double knot · the hourglass · the pierced shell · the small wand | 一、二、三、四、五、六 |
| history | The third night of the rice-jar month · after the 41st Convocation | 一、三、四、五、六 |

> 沙漏中间那枚没人拆开的结——值守说过，潮自己决定哪时候自己开。
> The knot in the hourglass that no one opened — the watchers only say: the tide decides when it opens on its own.
`,
  },
  {
    order: 29,
    slug: 'echo-029-the-wooden-clogs-nobody-wears',
    titleZh: '祠殿里那双没人穿的木屐',
    titleEn: 'The Wooden Clogs Inside the Chapel That No One Wears',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——室内的潮沙盘第一口。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the first breath of the tide-sand table indoors.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 29): The Wooden Clogs Inside the Chapel That No One Wears

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿最外进门处放着的那双木屐——每年多一双，没有值守知道是谁放的；也没有人敢穿上走进祠殿。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the wooden clogs at the outermost entrance of the chapel — a new pair appears each year; no watcher knows who places them, and no one dares walk inside wearing them.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——室内的潮沙盘第一口。
> Era: the Institute — after the 41st Convocation; the first breath of the tide-sand table indoors.

---

## 一 · 木屐的年份

祠殿最外进门——抄本员的惯例是把木屐放在那里。

过了第四十一次大会第一条米缸月，里巷子的某个人放了一双——这是最古的记载。此后每一年开春第一天（米缸月第一旬），进门处都会多出一双。

木屐的形状不是什么特殊尺码——木面磨得光亮；抄本员描述它们是「比脚小一个半指」。

**锚句**：祠殿最外进门处放着一双木屐——每年开春那一天都会多出一双。
**Anchor sentence**: at the outermost entrance to the chapel sits a pair of wooden clogs — each spring a new pair appears.

---

## 二 · 值守从不登记它们

里巷子的值守在交接班的时候只会提及：「外面照样。」

没人认领它们——抄本员私下取笑过一轮——「也许值守自己家买给自己留的」——后来没有人再提这个话题。

里巷子值守有一次想代写一页关于木屐的记录，抄本员只在纸条上写了两个字：「收件人。」随后把纸条烧了。

**锚句**：值守从不登记祠殿门口那双木屐——抄本员说的只有一句：那是门。
**Anchor sentence**: the watchers never register the wooden clogs at the chapel door — the copyists said one thing only, that those are the door.

---

## 三 · 进去的人要光脚

新来的值守第一次被带进祠殿的时候——值守长先说"把脚上布鞋脱了"。

新来的人没问为什么——进门时首先看到的那双木屐本身就会让人不想穿。

值守长后来回答别人的时候只说了一句："里面不许穿别人的东西。"——没人追问还有什么东西属于别人。

**锚句**：进去的人要光脚——潮候院里没有谁被允许穿过别人的东西。
**Anchor sentence**: those who enter go barefoot — nobody in the Institute is allowed to wear what belongs to another.

---

## 四 · 木屐会老一双、少一双

米缸月第二年开春——外面又多了一双；老的那双没有被收走——木屐堆在一侧慢慢堆成两三层。

某一年的值守把木屐全部挪到仓库里，米缸月开春时发现——祠殿进门处又出现了一双；仓库里木屐的数量与原本多一样——木屐自己穿越回原处。

没人继续测试这件事。值守长随后划去了所有相关条目。

**锚句**：木屐满仓库堆满那天，开春时门口又多出来一双——没人再测试它。
**Anchor sentence**: the day the storehouse filled with clogs, a new pair stood at the door that spring — no one has tested it since.

---

## 五 · 第四十一次大会的木屐

第四十一次大会散会后某天深夜——米缸月第二十三天——新来的值守看见祠殿进门的灯自己亮了一瞬间。

光没有照到别的物体，只照到了它们脚边的一双木屐。
抄本员赶到——什么都没看见；抄本员反复否认他看见的也是光；但第二天那一双是新的——崭新的木纹。

**锚句**：散会后的某个深夜——祠殿进门那双新的木屐亮了一瞬间。
**Anchor sentence**: a late night after the Convocation — the new pair of clogs in the chapel doorway glowed for an instant.

---

## 六 · 映射（回响二十九章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 木屐 · 米缸月 · 收件人地址 | 一、二、三、四、五、六 |
| geography | 祠殿 · 米缸月 · 里巷子院门 | 一、二、三、五、六 |
| characters | 值守长 · 抄本员 · 新来的值守 | 一、二、三、四、五 |
| story | 祠殿里的那双木屐 · 回响（其二十九） | 全篇 |
| items | 木屐 · 米缸月 · 粮袋子 · 仓库 | 一、二、三、四、五、六 |
| history | 米缸月开春第一天 · 第四十一次大会散会之后 | 一、二、四、五、六 |

> 进去的人要光脚——潮候院最外一层是木屐——每一层都要脱了脚才肯进去。
> Those who enter go barefoot — the outermost layer of the Institute is a pair of wooden clogs; leave that footwear outside.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其二十九）「祠殿里那双没人穿的木屐」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿最外进门处放着的那双木屐——每年多一双，没有值守知道是谁放的；也没有人敢穿上走进祠殿。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the wooden clogs at the outermost entrance of the chapel — a new pair appears each year; no watcher knows who places them, and no one dares walk inside wearing them.
> Same discipline: anchors verbatim.

> Era: the Institute — after the 41st Convocation; the first breath of the tide-sand table indoors.
> 纪元：潮候院 · 第四十一次大会散会之后——室内的潮沙盘第一口。

---

## 一 · The Year's Pair

At the outermost entrance of the chapel, the copyists made it a habit to leave clogs there.

After the first rice-jar month following the forty-first Convocation, someone placed a pair — the earliest record of the kind. From then on, the first day of each rice-jar month adds one more pair at the entrance.

The clogs are of no special size — the wood is worn bright; the copyists describe them as "one and a half fingers smaller than a foot."

**锚句**：祠殿最外进门处放着一双木屐——每年开春那一天都会多出一双。
**Anchor sentence**: at the outermost entrance to the chapel sits a pair of wooden clogs — each spring a new pair appears.

---

## 二 · The Watchers Never Register Them

At hand-over, the watchers mention only: "Out there, same as usual."

No one claims them — the copyists once laughed that perhaps each watcher bought a pair for themselves — afterward no one touched the subject.
A watcher once asked to make a page recording them; the copyist wrote two characters on a slip of paper: "recipient" — and burned it.

**锚句**：值守从不登记祠殿门口那双木屐——抄本员说的只有一句：那是门。
**Anchor sentence**: the watchers never register the wooden clogs at the chapel door — the copyists said one thing only, that those are the door.

---

## 三 · Those Who Enter Go Barefoot

The first time a new watcher is led inside the chapel, the headkeeper says: "Leave your cloth shoes."

The new arrival doesn't ask why — the pair of clogs at the entrance itself discourages any such idea.

The headkeeper answered others with one sentence only: "No one may wear inside what belongs to someone else." — and no one ever asked what else belonged to someone else.

**锚句**：进去的人要光脚——潮候院里没有谁被允许穿过别人的东西。
**Anchor sentence**: those who enter go barefoot — nobody in the Institute is allowed to wear what belongs to another.

---

## 四 · A Pair for Winter, A Pair for Spring

On the second rice-jar month of the following year, one pair more appeared at the entrance; the old pair was not collected — clogs accumulated in piles at the doorway.

Once, a watcher moved all of them to the warehouse — on the first day of the rice-jar month, a new pair stood at the door again; the warehouse count was exactly what it had been — the clogs had returned on their own.

No one tested it again. The headkeeper scratched out all the related entries.

**锚句**：木屐满仓库堆满那天，开春时门口又多出来一双——没人再测试它。
**Anchor sentence**: the day the storehouse filled with clogs, a new pair stood at the door that spring — no one has tested it since.

---

## 五 · The Clogs After the Convocation

One deep night after the forty-first Convocation — the twenty-third rice-jar month — a new watcher saw the chapel doorway lamp light once for an instant.

The light lit nothing else, only the pair of clogs at their doorway.

The copyist arriving afterwards saw nothing; the copyists later denied seeing anything; but the next morning's pair was new — fresh wood grain.

**锚句**：散会后的某个深夜——祠殿进门那双新的木屐亮了一瞬间。
**Anchor sentence**: a late night after the Convocation — the new pair of clogs in the chapel doorway glowed for an instant.

---

## 六 · Mapping（Echo No. 29 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The clogs · the rice-jar month · the addressed door | 一、二、三、四、五、六 |
| geography | The chapel · the rice-jar month · the back-alley doorway | 一、二、三、五、六 |
| characters | The headkeeper · the copyists · the new watchers | 一、二、三、四、五 |
| story | The Wooden Clogs Inside the Chapel · Echo No. 29 | 全篇 |
| items | The clogs · the rice-jar month · the grain sacks · the warehouse | 一、二、三、四、五、六 |
| history | The first day of the rice-jar month · after the forty-first Convocation | 一、二、四、五、六 |

> 进去的人要光脚——潮候院最外一层是木屐——每一层都要脱了脚才肯进去。
> Those who enter go barefoot — the outermost layer of the Institute is a pair of wooden clogs; leave that footwear outside.
`,
  },
  {
    order: 30,
    slug: 'echo-030-the-seven-boards-under-the-sill',
    titleZh: '祠殿门槛下压着的那七块木板',
    titleEn: 'The Seven Boards Buried Under the Chapel Threshold',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——石槛之下。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; beneath the sill.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 30): The Seven Boards Buried Under the Chapel Threshold

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿最外进门那条槛——槛下压着七块木板；每掘一块，都会各挑它的后继者；没有值守说过它们做什么。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the threshold of the chapel — seven boards lie beneath the lowest stone; no watcher explains what they came from, or what they are for.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——石槛之下。
> Era: the Institute — after the 41st Convocation; some month, some day under the watcher's boots.

---

## 一 · 七层板

祠殿最外那道槛下压着七块木板——

值守交接册上第一次出现「七层」这个词，是在第十一次大会之前的米缸月。
肩并肩排开——抄本员可以蹲下来看到其中三块的边缘。

每一层都被压在石槛下——谁都不能从它们之间抽出来，除非先把石槛撬起来。

**锚句**：祠殿门槛下每一进门都是石槛——石槛下堆着七块木板。
**Anchor sentence**: under the threshold at the chapel door lie seven boards beneath the sill stone.

---

## 二 · 新来的值守在门槛上的一步

新来的值守第一次进祠殿——脚在门槛处绊了一下。里巷子的老值守把他扶稳了。

值守长后来只解释了一句："门槛下是七块不均匀的板——第一块最滑，第四块浮起来，第六块遇湿会跳。"

没人说明为什么是七，也没人问还有别的什么——值守只记住了：门槛下不是岩石，是七层做的板。

**锚句**：新来的值守在门槛处脚步一失都是常有的——水渗里巷子万年没干过。
**Anchor sentence**: a new watcher stumbling at the threshold is common — the alley has never dried.

---

## 三 · 最底下那块的木纹

抄本员只通过第七层板露出在石槛边缘的那一角目测过——板色潮候院今年三月流晒过时像晒过的一张旧半月印章。

第五、第六层压过的木板里面可见潮汐图刻痕，形状和米缸月潮沙盘的第一次启用时有——抄本员们不再追问第七层的来历。

**锚句**：最底下的木板的木纹谁都没看见过——抄本员也不再问了。
**Anchor sentence**: no one has ever seen the grain of the lowest board — the copyists ask no further questions.

---

## 四 · 第一次看到第七层

米缸月第四十二天（也就是四十一次大会散会后不久），里巷子值守一度检修祠殿石槛下面——抄本员借机看了一眼七层木板。

第七层的木板最里面有一截细结凸起；抄本员原本打算量出每层木板的年代，却没能写成那一页——他回去补的那行是：「第七层木板内侧有细结；米缸月第十二日砂盘翻过一次。」——随后那一页潮沙盘被抄本员撕了，留下一个空白格。

**锚句**：石槛下第一次被抄本员看见第七层木板——抄本员没能对它做记录。
**Anchor sentence**: beneath the threshold was seen for the first time — the copyist could not keep a note of it.

---

## 五 · 不会更新的

二十九年后值守长换新值班手册的时候——

记载门槛下板数仍然是七。潮候院潮沙盘上又多了一副闸板——他们登记新建筑的时候也不会减少旧七层，它们一直都在。

新来的值守第一次接触到门槛的时候，里巷子文化只说一句：「这道门槛是会过会的。」

**锚句**：门槛下的七块板不会减少——潮候院不会在新建的时候多开一道祠殿。
**Anchor sentence**: the seven boards under the threshold will not decrease — the Institute will never open a second chapel.

---

## 六 · 映射（回响三十章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 祠殿七层木板 · 半月章的呼吸 · 第四十一次大会之后 | 一、二、三、四、五、六 |
| geography | 祠殿 · 里巷子门路 · 祠殿最外门 | 一、二、三、四、五、六 |
| characters | 里巷子抄本员 · 值守长 · 新来的值守 | 一、二、三、四、五、六 |
| story | 祠殿槛下木板 · 回响（其三十） | 全篇 |
| items | 七块木板 · 石槛 · 米缸月潮汐表 · 微微印章 | 一、二、三、四、五、六 |
| history | 米缸月第四十二日 · 潮候院的第六十九年 | 一、四、五、六 |

> 下一次大会散会后的值班会——潮候院的人还会再次路过那条门槛。
> After the next Convocation, the watchers will walk through that threshold again.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其三十）「祠殿门槛下压着的那七块木板」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿最外进门那条槛——槛下压着七块木板；每掘一块，都会各挑它的后继者；没有值守说过它们做什么。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the threshold of the chapel — seven boards lie beneath the lowest stone; no watcher explains what they came from, or what they are for.
> Same discipline: anchors verbatim.

> Era: the Institute — after the 41st Convocation; beneath the sill.
> 纪元：潮候院 · 第四十一次大会散会之后——石槛之下。

---

## 一 · The Seven Boards

The outermost threshold of the chapel rests on seven boards —

The first mention of "the seven layers" in the watchers' hand-over book appears in the rice-jar month before the eleventh Convocation.
The boards lie side by side — a copyist may crouch and see the rim of three of them.

Every layer is pressed beneath the sill stone — none can be drawn out unless the sill is lifted first.

**锚句**：祠殿门槛下每一进门都是石槛——石槛下堆着七块木板。
**Anchor sentence**: under the threshold at the chapel door lie seven boards beneath the sill stone.

---

## 二 · The New Watcher's Stumble

A newly arrived watcher steps into the chapel — their foot caught the threshold once. The older watchers of the back alley steadied them on the spot.

The headkeeper answered once, and no more: "The sill holds seven uneven boards — the first slides, the fourth lifts, the sixth vaults wet."

No one explained why seven — the watchers carry one lesson from it: the sill is not rock, but seven laid boards.

**锚句**：新来的值守在门槛处脚步一失都是常有的——水渗里巷子万年没干过。
**Anchor sentence**: a new watcher stumbling at the threshold is common — the alley has never dried.

---

## 三 · The Grain of the Lowest Board

A copyist sighted the seventh board once — its outer face carries the dull tint of a half-moon seal left in the sun too long.

The fifth and sixth boards bear weather-worn tide-chart scratches visible from the slit; the copyists no longer pursue the source of the seventh.

**锚句**：最底下的木板的木纹谁都没看见过——抄本员也不再问了。
**Anchor sentence**: no one has ever seen the grain of the lowest board — the copyists ask no further questions.

---

## 四 · First Sight of the Seventh Board

On the forty-second day of the rice-jar month (which is to say soon after the forty-first Convocation dispersed), a watcher of the back alley opened a small inspection hatch beneath the sill — a copyist took the chance to look at the seven boards.

The far inner face of the seventh board carries a fine knot; the copyist had meant to measure each board's age, but could not finish his page — the line he returned with read: "a fine knot inside board seven; the sand table turned once on the twelfth day." The page was reported and was torn out; the slot was left blank.

**锚句**：石槛下第一次被抄本员看见第七层木板——抄本员没能对它做记录。
**Anchor sentence**: beneath the threshold was seen for the first time — the copyist could not keep a note of it.

---

## 五 · Nothing Will Update

When the headkeeper rewrote the shift-book a generation later —

The seven boards are still listed as seven. A new gate is added to the tide-sand table entries in the new handbook, but the seven remain; the building plan of the Institute will not add a second chapel.

When a new watcher first comes to the threshold, the culture of the back alley says one thing: "This sill hosts Convocations."

**锚句**：门槛下的七块板不会减少——潮候院不会在新建的时候多开一道祠殿。
**Anchor sentence**: the seven boards under the threshold will not decrease — the Institute will never open a second chapel.

---

## 六 · Mapping（Echo No. 30 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The seven boards · half-moon's breath · after the forty-first Convocation | 一、二、三、四、五、六 |
| geography | The chapel · the alley route · the outermost entrance of the chapel | 一、二、三、四、五、六 |
| characters | The copyists · the headkeepers · the new arrivals | 一、二、三、四、五、六 |
| story | The Boards Under the Threshold · Echo No. 30 | 全篇 |
| items | The seven boards · the sill stone · the tide-tables · the seal | 一、二、三、四、五、六 |
| history | The forty-second day of the rice-jar month · the sixty-ninth founding year | 一、四、五、六 |

> 下一次大会散会后的值班会——潮候院的人还会再次路过那条门槛。
> After the next Convocation, the watchers will walk through that threshold again.
`,
  },
  {
    order: 31,
    slug: 'echo-031-the-white-stone-nobody-claimed',
    titleZh: '里巷子赌局桌上那枚没人认领的白子',
    titleEn: 'The White Stone No One Claimed on the Alley\'s Gaming Table',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——米缸月里巷子的收档。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the rice-jar month disbursement of the back alley.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 31): The White Stone No One Claimed on the Alley's Gaming Table

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给里巷子的赌局桌上那枚白石子——赌局摆了很多年；它没有赢过、也没输过，没人拿它做过赌注。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the white stone on the alley's gaming table — the table has held it for years; it has never been a stake, it has never been played.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——米缸月里巷子的收档。
> Era: the Institute — after the 41st Convocation; the rice-jar month disbursement of the back alley.

---

## 一 · 桌面上那颗石子

里巷子的赌局桌摆在祠殿外侧——专供赌客押注的旧桌。

某个米缸月初，值守收档的时候发现：桌面上多了一颗白色石子——嵌在黑白的间隙里。

没有任何登记、没有任何一笔账里写过。

**锚句**：祠殿外赌局桌上某一年多了一颗白子——它不像是谁放的。
**Anchor sentence**: one year a white stone appeared on the alley's gaming table — it was not like anyone placed it there.

---

## 二 · 抄本员问过几次

抄本员追问过三四次——

每一轮的同卷都会被拿出去——没有人看出它是哪一类的石子：潮沙盘的、米缸月收成的、钟楼的值守存留的；没有一页回答过。

值守把它叫「桌上那枚」——多出来的就是那枚，值守不说它的名字。

抄本员把这个看成「潮候院不归档的那一项」。

**锚句**：抄本员问过它三四次——每次都没有答案。
**Anchor sentence**: the copyists asked about it three or four times — each time with no answer.

---

## 三 · 强行把它放进仓库

某个米缸月的值守强行把它从赌局桌收起来、放进米缸月的仓库——米缸月第三天早上，它又回到了桌面中间。

赌局桌的位置恰好不在仓库门的视线范围内——值守没有发现是谁把它放回了赌局桌。

**锚句**：值守半夜把它放进仓库——第二天早上它又回到桌上。
**Anchor sentence**: a watcher locked the stone in the warehouse overnight — the next morning it was back on the table.

---

## 四 · 它没赢过也没输过

里巷子年纪最大的赌客中有一位问过它是谁的一枚——

值守的回答只有一句："它没赢过，它也没输过。"——

那位赌客后来说这句话像潮沙盘的一根沙条。值守把这一句话写进潮沙盘的一卷里，自己没再看，抄本员把它抄进了潮沙盘没有任何名字的那一页。

**锚句**：它没赢过也没输过——它是潮候院「不归档」的那一枚。
**Anchor sentence**: it has neither won nor lost — it is the one the Institute does not archive.

---

## 五 · 第四十一次大会散会

散会那天的值守被告知：这颗白子不跟大会归档——

米缸月散会之后又出现了两颗白子：一颗仍然在赌桌上、一颗不属于任何同类。里巷子的值守中没有人替它们登记；那两颗白子的页码在潮沙盘的空白里。

值守交接册上多了一行：「散会后桌子上有一颗白子——它们都不归档。」

**锚句**：散会以后桌子上又出现两颗白子——都不归档。
**Anchor sentence**: after the dispersal two more white stones appeared on the table — neither was archived.

---

## 六 · 映射（回响三十一章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 赌局桌上的白子 · 不归档 · 潮沙盘 | 一、二、三、四、五、六 |
| geography | 里巷子 · 祠殿外门 · 米缸月的门槛 | 一、二、三、五、六 |
| characters | 赌局桌值守 · 抄本员 · 赌客 · 新来的值守 | 一、二、三、四、五、六 |
| story | 桌上那枚没人认领的白子 · 回响（其三十一） | 全篇 |
| items | 白石 · 赌局桌 · 仓库 · 潮沙盘空白格 | 一、二、三、四、五、六 |
| history | 第四十一次大会散会之后 · 潮候院的第六十九年 | 一、三、四、五、六 |

> 下一次大会结束的夜晚——里巷子会知道散会那晚又多出来那颗白子是谁落下的这个问题。
> On the evening of the next Convocation, the watchers will know whose question that white stone is.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其三十一）「里巷子赌局桌上那枚没人认领的白子」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给里巷子的赌局桌上那枚白石子——赌局摆了很多年；它没有赢过、也没输过，没人拿它做过赌注。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the white stone on the alley's gaming table — the table has held it for years; it has never been a stake, it has never been played.
> Same discipline: anchors verbatim.

> Era: the Institute — after the 41st Convocation; the rice-jar month disbursement of the back alley.
> 纪元：潮候院 · 第四十一次大会散会之后——米缸月里巷子的收档。

---

## 一 · The Stone on the Table

The alley's gaming table stands outside the chapel — a table for elders who bet on the harbor tides or the weather over the water.

Some new rice-jar month, a watcher carrying the table in found on it a white stone — placed squarely in the center, between the two rows.

No record on any ledger covers it; no warehouse receipt either.

**锚句**：祠殿外赌局桌上某一年多了一颗白子——它不像是谁放的。
**Anchor sentence**: one year a white stone appeared on the alley's gaming table — it was not like anyone placed it there.

---

## 二 · The Copyists Asked a Few Times

The copyists asked about it three or four times —

Each time they pulled the records — every account — none had it: not in the tide-sand table, not in the storehouse logs, not in the watcher's hand-over book.

The watchers simply called it "the one on the table"; refusing to grant it a name.

The copyists catalogued it as "the Institute's unarchived item."

**锚句**：抄本员问过它三四次——每次都没有答案。
**Anchor sentence**: the copyists asked about it three or four times — each time with no answer.

---

## 三 · Forcefully Archived, Returned the Same

One rice-jar month, a watcher took the white stone from the table and locked it in the warehouse for the night —

On the third day of the rice-jar month, the stone stood again on the center of the gaming table.

No one saw the hand return it; the table was outside the warehouse's sight-line.

**锚句**：值守半夜把它放进仓库——第二天早上它又回到桌上。
**Anchor sentence**: a watcher locked the stone in the warehouse overnight — the next morning it was back on the table.

---

## 四 · It Never Won, It Never Lost

The oldest bettor in the alley once asked whose stone it was —

The watchers answered with a single line: "It has never won, and it has never lost."

The bettor later said the line felt like a single row of sand from the sand table. A watcher entered it once in a page of the sand-table notebook; the copyist copied it into the page where no name is ever written.

**锚句**：它没赢过也没输过——它是潮候院「不归档」的那一枚。
**Anchor sentence**: it has neither won nor lost — it is the one the Institute does not archive.

---

## 五 · After the Forty-First Convocation

On the day of the disbursement, the watchers were told: this white stone does not follow the Convocation's archive —

Days later, two more white stones appeared: one on the table, one elsewhere in the alley neither classed as kin. The watchers never registered any of them; the two new lines went into a blank page of the tide-sand table.

The hand-over book carries one line: "Two more on the table after the Convocation ended — none are archived."

**锚句**：散会以后桌子上又出现两颗白子——都不归档。
**Anchor sentence**: after the dispersal two more white stones appeared on the table — neither was archived.

---

## 六 · Mapping（Echo No. 31 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The white stone · the unarchived · the sand table | 一、二、三、四、五、六 |
| geography | The back alley · the chapel's outer gate · the rice-jar month | 一、二、三、五、六 |
| characters | The betting-table watchers · the copyists · the oldest bettor | 一、二、三、四、五、六 |
| story | The White Stone on the Table · Echo No. 31 | 全篇 |
| items | The white stone · the gaming table · the warehouse · the blank page | 一、二、三、四、五、六 |
| history | After the 41st Convocation · the 69th year of the Institute | 一、三、四、五、六 |

> 下一次大会结束的夜晚——里巷子会知道散会那晚又多出来那颗白子是谁落下的这个问题。
> On the evening of the next Convocation, the watchers will know whose question that white stone is.
`,
  },
] as const;
