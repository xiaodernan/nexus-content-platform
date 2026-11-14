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
] as const;
