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
] as const;
