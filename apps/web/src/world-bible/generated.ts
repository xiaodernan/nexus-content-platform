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
    slug: '005-letters-never-posted',
    titleZh: '远信',
    titleEn: 'Letters Never Posted',
    eraLineZh: '纪元：铁月纪的尾声 · 第四十一次会议之后。',
    eraLineEn: 'Era: the close of the Iron-Moon Age · after the forty-first convocation.',
    markdownZh: `# The Whispers' Kings / The Whispers' Kings · World Bible · Chapter V: Letters Never Posted

> 大典第四章自称"终卷"，却又把续写权交给每个到潮沙盘读过的人——这一章就是那笔未完成签收的行动。
> 第五章不是续作，是收信的延长：它不接 Oath IV 的刀，只接没人去接的那一叠信。
> 正典纪律不变：锚句中英字字对齐，引用者逐字保持。
>
> Chapter IV called itself the final volume — then handed the pen to everyone who came through the table.
> This is that trespass, carried out in slow motion: not a sequel, another day of the mail that will not go.
> Canon discipline is unchanged — anchor sentences match word-for-word; no rephrasing.

> 纪元：铁月纪的尾声 · 第四十一次会议之后。
> Era: the close of the Iron-Moon Age · after the forty-first convocation.

---

## 一 · 立在灯底下的远信匣

铁月纪最后几次涨潮时，海灯底下立起一只远信匣。匣身用旧船板钉成，投口向着陆地，锁孔却朝海。没有人记得是谁把它搬来，也没有人记得该由谁开锁。账房在簿上添了一行，写明其所在，不写其来处。

灯一亮，就有人走近它。

他们不总带着信。有的人只把手放进衣襟，按一按那张折过多次的纸；有的人站到灯灭，才转身回去。偶尔有人投下一封，听见纸落在木底，便像听见门后有人应声。夜里涨潮，匣脚泡在水中，锁孔里积着盐。天明时，来人仍照旧站在灯下。

远方的人开始寄信。寄信的路却没有因此变短。海灯照得见信匣，照不见海那边的收信人。每一封信落下之前，都先在手里停过一夜；有些停到纸边发软，有些停到写信的人不再来。

账房把未取的信记作在匣，把未投的信记作未成。两项之间没有路，只有灯影。

**锚句**：灯亮时，匣前有人。
**Anchor sentence**: when the lamp is lit, someone stands before the box.

---

## 二 · 第八盏灯的信

第八盏灯这天终于有了自己的一封信。

那天没有风，灯焰却偏向海面。信从匣底取出时，纸上没有署名，也没有日期。封口压着潮汐教团全会的四道印：一方在左，一方在右，两方叠在折缝上。印泥未干，纸已吸饱海气。

账房不肯把它列作来信。收件人栏空着，送信人栏也空着。有人说它属于灯，有人说它属于开会的人。守灯者没有开口，只把信放到第八盏灯的底座上。灯影落在四道印上，像四扇关不严的门。

会后，众人各自带走了自己的副本，唯独这封没有副本。印章的边缘压穿纸背，背面也留着四道浅痕。收件人没有来认领。第八盏灯照常点燃，照常熄灭，底座上的信没有挪动。

往后的账页上，仍有空栏。账房每次翻到这一页，都把纸角压平，不在空处落笔。

**锚句**：四印之下，没有姓名。
**Anchor sentence**: beneath the four seals, no name.

---

## 三 · 信绳

信绳起初只是新缆。海堤修补之后，送来的缆绳短而硬，表面留着船钉磨过的白痕。有人把它穿过信匣侧面的环，给投信的人留一段握手的地方。后来，绳子从环上解下，又系回去；结法换了三次，名字却留下了。

送信人教人系绳。他不教结要多紧，只教绳头先绕过腕，再绕过信封。信若未能投出，手一松，绳便牵着人退回灯下；信若已经落入匣中，绳仍系在腕上，须等灯灭后才能解开。有人照做，有人把绳剪短，藏进袖口。

旧账里有《灯绳记》。那时的绳连着灯，也连着守灯的人；绳断，灯下便不再有人替谁守夜。如今，绳从灯旁牵到信匣，灯没有被牵走，写信的人却学会把自己拴在信上。

潮水来时，新缆在石环间轻轻摩擦。守堤人听见那声音，便知道有人试过一次，又没有投信。绳上留下盐，结里没有信。

**锚句**：绳系住手，不系住路。
**Anchor sentence**: the rope ties the hand, not the road.

---

## 四 · 收讫与不收讫

收讫与不收讫，各有一笔账。

账房看见封口完整，便写"收讫"；看见信纸未出匣，便写"不收讫"。他不问信中写了什么，也不问那道印是为谁盖的。纸送到他的桌上，便从海边的账转到账房的账。墨水干了，账页合上，信仍在原处。

收件人不认印。他说印不是写给他的，信也没有叫他的名字。他将信推回桌心，手指留在纸缘，没有再碰。到夜里，他把空栏夹在一册旧账中，第二天又来问那封信是否已经寄出。

送信人说，他已送到匣前。他不说投递，也不说完成。那日他站在第八盏灯下，腕上没有绳，掌心却有一道浅红。账房要他按印，他没有按。收件人要他作证，他也没有作证。

三种人围着同一张纸，各自说了一个词：收讫、不收讫、送到。纸上仍没有署名。潮水退下去时，三人的影子留在桌边，谁也没有把信带走。

**锚句**：三人各记一笔，无人认领。
**Anchor sentence**: three people, three ledgers — no one claims it.

---

## 五 · 最后一封信的人

最后一封信接收的人，是海堤最北端唯一活着的守夜人。

信送到时，堤上的灯已经熄了。他在门内听见敲击，开门后只看见一段绳，绳头夹着信封。送信人不在堤上，海面也没有船。守夜人解下绳，把信带进屋，放在守夜簿旁边。屋里只有一盏油灯，火舌低得照不全纸面。

信上没有称呼，也没有印。守夜人没有拆封。他先记下收到的时刻，随后划掉那一行；又在同一处写下"未收"。墨迹穿过纸背，落到下一页。那一夜他照常巡堤，每到一盏灯下便停一会儿，等远处有无回声。

清晨，海堤尽头没有人来换班。他回屋，信封仍在簿旁，绳压住封口。桌上多了一道潮痕，恰好穿过他划掉的字。他把守夜簿合上，没有把信放入匣中，也没有把它丢进火里。

此后，北端仍有人值夜。簿上不再写姓名，只写灯数。

**锚句**：他收下信，没有拆开。
**Anchor sentence**: he took the letter; he never opened it.

---

## 六 · 铁月纪的尾声，与后铁

铁月纪在一张未填完的账页上结束。潮汐教团第四十一次会议之后，旧纪年没有立刻撤下。账房照旧记潮，守灯者照旧点灯，远方的人照旧把信拿到海边。寄出与否，仍取决于那只手在灯下停多久。

后铁到来时，远信匣没有被收走。它曾靠在壁炉边，匣底留下烧黑的木屑；后来有人把它挪到大门口。锁孔朝向海，投口朝向陆地，匣身没有换板。门每开一次，风便把灰吹进匣内。有人扫去灰，有人不扫。

大门外的路不通向邮站，只通向堤岸。灯一亮，仍有人从路上走来。他们把信握在衣襟里，站到门前，听屋内的钟响。偶尔有纸落入匣底。更多时候，来人转身离开，信还贴在胸口。

账房把新纪年的第一行留给收件人。那一栏没有字。门内的匣没有移动，门外的潮水照常涨落。后来的人查账，只能查到它还在，不见哪一封真正到达。

**锚句**：匣未收走，门已成岸。
**Anchor sentence**: the box was never taken away; the gate had become the shore.

---

## 模型映射（第五章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 远信匣 · 四道印 · 信绳 · 收讫与不收讫 | 三、四 |
| geography | 雾港 · 海灯 · 海堤最北端 · 大门口 | 一、三、四、五、六 |
| factions | 雾港灯人 · 潮汐教团 · 账房 · 送信人 | 一至六 |
| characters | 账房 · 送信人 · 收件人 · 守夜人 · 守灯者 | 一至六 |
| items | 远信匣 · 新缆 · 守夜簿 · 印章 · 守夜绳 | 一至六 |
| story | 雾港 · 第八盏灯 · 第五章·远信 | 全篇 |
| history | 铁月纪的尾声 · 后铁 | 一至六 |

> 谜没有第二封信。谜是第一封落下时落进了木底的那一个回声。
> 谜没有拆开。谜只允许灯记住，谁在门前站了多久。
>
> The mystery hides no second letter; it hides the echo of the first as it landed.
> The mystery does not open; it only lets the lamp register how long someone stood there.
`,
    markdownEn: `# 低语诸王 / The Whispers' Kings · World Bible · 第五章「远信」

> Chapter IV called itself the final volume — then handed the pen to everyone who came through the table.
> This is that trespass, carried out in slow motion: not a sequel, another day of the mail that will not go.
> Canon discipline is unchanged — anchor sentences match word-for-word; no rephrasing.
>
> 大典第四章自称“终卷”，却又把续写权交给每个到潮沙盘读过的人——这一章就是那笔未完成签收的行动。
> 第五章不是续作，是收信的延长：它不接 Oath IV 的刀，只接没人去接的那一叠信。
> 正典纪律不变：锚句中英字字对齐，引用者逐字保持。

> Era: the close of the Iron-Moon Age · after the forty-first convocation.
> 纪元：铁月纪的尾声 · 第四十一次会议之后。

---

## I · The Letters-Box Set Under the Lamp-Foot

In the last spring-tides of the Iron-Moon Age, a letters-box was set under the sea lamp. Its boards had been stripped from a wreck and nailed together by hand; the slot faced the land, yet the lock-eye faced the sea. Nobody remembered who had carried it there, nor who was to open it. The bursar added one line to the ledger — where it now stood, and nothing of where it came from.

When the lamp was lit, someone would come to it.

Not all of them carried letters. Some only set a hand to their chests — feeling a paper folded too many times already. Some stood until the lamp went out, then turned away. Every so often a letter dropped, and they listened to it land — like a voice answering from the far side of the door. At night, the tide rose over the box foot, and salt gathered in the lock-eye. By morning, the lamplight had them back.

Far-off people began to post letters; the road refused to shrink. The lamp shed light on the box, never across the water. In the instant before a letter dropped, every hand paused a night — some letters softened at the corners; some never made it out again.

The bursar logged undelivered letters as *in box*, unsent letters as *never*. Between the two columns there was no road — only the lamplight lying there.

**Anchor sentence**: when the lamp is lit, someone stands before the box.
**锚句**：灯亮时，匣前有人。

---

## II · A Letter for the Eighth Lamp

On that day, the Eighth Lamp finally received its letter.

No wind moved — yet the flame leaned out to sea. Drawn out from under the box boards, the page carried no sender, no date. Its seal pressed down with the four marks of the whole Conclave: one on the left, one on the right, two stacked on the fold. The wax was barely set; the paper had already drunk its share of salt air.

The bursar would not list it among incoming mail. The receipt column stayed blank; the sender column stayed blank. Some said the letter belonged to the lamp, others held it belonged to those who sat in the meeting. The lamp-warden did not speak — she laid it on the Eighth Lamp's base, and the lamplight fell across the four wax marks — like four doors with warped frames.

After the meeting, everyone carried their copy; this one was the only without a copy. The edges of the seal cut through the backing paper; four shallow tracks showed on its reverse. No one came to claim it. The lamp lit on schedule, died on schedule, and the letter on the base never moved.

On the ledger page afterwards, there was room for the same blank cell. The bursar pressed the page corners flat when he came to it — and never wrote the empty line.

**Anchor sentence**: beneath the four seals, no name.
**锚句**：四印之下，没有姓名。

---

## III · The Letter-Rope

The letter-rope began as new mooring line. After the dyke was repaired, the lines arrived short and hard; their surfaces still bore the white scars of boat nails. Somebody threaded one through the box's side eye — leaving enough run of line for the posting hand to hold. The rope was off and on again three times; the knots it carried were retied — its name stuck.

The courier taught people how to bind it. He would not teach about tightness. He taught: pass the line over the wrist first, then around the letter-packet. If the letter never made it to the box, the hand had only to open — and the line would draw someone back toward the lamp. If the letter was already inside, the line still ran around the wrist, and could not be undone until the lamp died. Some wore it through the wrist as taught; others clipped the rope short and hid it under their sleeves.

In the old-book chest lay *The Lamp-Rope Memoir* — in that one, the line bound the lamp to the lamp-watcher; when the rope snapped, the lamp stood alone on the dyke, and nobody stayed to watch. Now the rope ran from the lamp to the box instead — the lamp unneeded, the letter-writers bound to the letter.

When the tide came in, the new line scuffed against the stone eyelets. The dyke-keeper heard it and knew someone had tried — again, and not dropped. Salt stayed on the rope. Knots kept no letters.

**Anchor sentence**: the rope ties the hand, not the road.
**锚句**：绳系住手，不系住路。

---

## IV · Received and Never Received

Two ledgers were kept side by side: *received*, and *never received*.

The bursar saw the seal whole, and entered *received*; saw the band still intact, and entered *not received*. He asked nothing of the paper's contents, nothing of whose authority the four stamps were. Once it reached his desk, a letter crossed from the sea-ledger to the bursar's ledger. The ink dried, the pages closed, and the letter itself remained where it had been.

The recipient never accepted any seal. He said the seal was not for him; the letter had never called his name. He pushed it back into the middle of the table — one finger kept on its edge, never to touch it again. At night he folded the blank cell into an old ledger; the next morning he came back and asked if the letter had been posted.

The courier said he had delivered the letter to the box. He would not say *posted*, nor *complete*. On the day, he stood beneath the Eighth Lamp, no rope on his wrist, a shallow red line across his palm. The bursar ordered him to stamp; he did not. The recipient asked him to witness; he did not witness.

Three people, one paper between them — one word each: *received*, *never received*, *delivered*. The page held no sender. As the tide withdrew, three shadows lingered on the table; not one took the letter.

**Anchor sentence**: three people, three ledgers — no one claims it.
**锚句**：三人各记一笔，无人认领。

---

## V · The One Who Would Receive the Last Letter

The receiver of the last letter was the only living night-watchman at the far north end of the sea dyke.

The letter was delivered by a knock at the door after the lamps had gone out. He opened to a segment of line — a letter packet bound to its tail. The courier was not on the dyke; the sea held no boat. The watchman unthreaded the line and brought the letter inside, laying it next to the night-watch book. One oil lamp burned indoors; the flame stood so low it could not fill the page with light.

The envelope carried no greeting, no mark from any seal. The watchman did not open it. He entered the hour of receipt — then struck it out; on the same line he wrote *unreceipted* — the ink went through the back alighting on the page after it. That night he walked his round; at each lamp he lingered a little — listening for an echo from afar.

At daybreak, no one came to relieve him at the dyke's end. He returned to his room to find the envelope still propped against the book; the line lay across the opening. On the table there sat a damp tidal streak that crossed his struck-out words exactly. He shut the book; he did not place the letter in the box, nor throw it into the fire.

Since then there have always been watchmen at the far end. The book no longer lists names — only the count of the lamps.

**Anchor sentence**: he took the letter; he never opened it.
**锚句**：他收下信，没有拆开。

---

## VI · Late Iron-Moon · the Days After Iron

The Iron-Moon Age closed on the page of an unfinished ledger. After the forty-first meeting, the old year was not dismantled at once. The bursar kept his tide-ledgers; the lamp-watchers kept their lamps; the people kept carrying their letters to the sea. Whether a letter went through depended on how long that hand lingered below the flame.

As the days after iron took root, the letters-box was never pulled down. It had leaned against a hearth; soot blackened its bottom rails; later somebody carried it to the gate mouth. The slot faced the land, the lock-eye faced the sea, boards never replaced. Each time the gate swung open, the wind whatever came through it blew ash over the slot's inside. Some swept it out; some didn't.

The road from the gate ends at the dyke — it does not lead to any mail waystation. When the lamp is lit, someone still walks it. They hold letters against their chests and stand before the door listening for the clock indoors. Occasionally one slips down into the box. More often they turn away with the letter still pressed to their hearts.

The bursar left the first line of the new year for the recipient. That cell was left blank. The box inside the door stayed where it was; the tide outside rose and fell on schedule. Later archivists could prove only the box itself still stood in place; they could not prove that any letter had ever arrived.

**Anchor sentence**: the box was never taken away; the gate had become the shore.
**锚句**：匣未收走，门已成岸。

---

## Model mapping (Chapter V)

| Category | Title | Corresponds to |
|---|---|---|
| lore | The Letters-Box · the Four Seals · the Letter-Rope · Received / Never Received | III, IV |
| geography | The Mist Harbor · the Lamps · the Dyke's North End · the Gate Mouth | I, III, IV, V, VI |
| factions | The Lamp-Watchers · the Tide Congregation · the Bursar · the Couriers | I–VI |
| characters | The Bursar · the Courier · the Recipient · the Watchman · the Lamp-Warden | I–VI |
| items | The Letters-Box · the New Mooring · the Night-Watch Book · the Seal · the Rope | I–VI |
| story | The Mist Harbor · the Eighth Lamp · Chapter V · Letters Never Posted | whole |
| history | The close of the Iron-Moon Age · the days after iron | I–VI |

> The mystery hides no second letter; it hides the echo of the first as it landed.
> The mystery does not open; it only lets the lamp register how long someone stood there.
>
> 谜没有第二封信。谜是第一封落下时落进了木底的那一个回声。
> 谜没有拆开。谜只允许灯记住，谁在门前站了多久。
`,
  },
  {
    order: 6,
    slug: '006-the-final-seal',
    titleZh: '最后的签收',
    titleEn: 'The Final Seal',
    eraLineZh: '纪元：铁月纪的尾声 · 远信之后。',
    eraLineEn: 'Era: the close of the Iron-Moon Age · after the letters.',
    markdownZh: `# The Whispers' Kings · World Bible · Final Chapter: The Final Seal

> 正典在此收束：潮汐教团的正典、远信与第九叩在这一章里合拢。
> 本章不引入新设定，只按正典的既有账回写闭环；续写权仍留给你的手。
> 正典纪律不变：锚句中英字字对齐，引用者逐字保持。
>
> The canon closes here: the Tide Congregation, the letters, and the ninth knock all meet in this chapter.
> This chapter invents no new lore; it writes the loop back onto the existing ledger. The pen stays yours.
> Canon discipline is unchanged — anchor sentences match word-for-word; no rephrasing.

> 纪元：铁月纪的尾声 · 远信之后。
> Era: the close of the Iron-Moon Age · after the letters.

---

## 一 · 最后的落潮

第四十一次会议散席时，港里的钟还没响。桌上留着一张空白收据，边角压着盐块。没人碰它。窗外的潮水退了半里，露出旧桩、断缆和几只翻白的船。

潮汐教团按例核账。水位、船数、灯油、亡者的名字，一项项抄进册里。最后一项写着"潮先行"，后面没有数目。书记员把这一栏留空，像留下一只未封口的信袋。

海继续往外退。它退过外港，退过防波堤，退到地图上没有标记的泥地。人们这才看见，潮早在许多年前就从账上走了。留下的只是每月一次的水声，是照旧抄写的涨落，是所有人仍按时缴纳的那笔债。

没人问债欠给谁。问了也没有收据可开。

那张空白收据从桌上取下，交给下一班书记员。纸上没有署名，只有一道潮痕，从右上角斜斜划过，抵在空栏之前。

**锚句**：潮先走，账才开始。
**Anchor sentence**: the tide leaves first; only then does the ledger open.

---

## 二 · 最后一个收件人

最北端的守夜人第一次来到港口，是在退潮后的第三日。他没有船，也没有随行的人。沿岸的人认得他的灯，却从未见过灯下的人。

他走进港门时，手里提着一只旧灯罩。玻璃裂了一道，里面没有灯芯。守门人问他来收什么。他说，收一件送了很久的东西。守门人又问，凭据呢。他把空灯罩放在桌上，没有回答。

潮汐教团的席位仍按旧次序摆着。守夜人的位置在末席，桌牌已经发黑，字迹被盐侵去一半。他没有坐下，只看了一遍每张桌牌，像在核对一封封寄错的信。

有人要他报上姓名。他说，名字早在北端写过。那边没有人替他留副本。书记员请他再说一次，他只把灯罩往前推了一寸。

港里仍有人等着签收。桌边的人看着他，仿佛只要他坐下，收件人就会有一个可供抄录的形状。

他没有坐。

**锚句**：收件人到了，空位仍在。
**Anchor sentence**: the recipient arrives — the empty seat remains.

---

## 三 · 他打开的那本账

守夜人从衣内取出一本薄账。封皮没有题名，边缘被海水泡硬。书记员接过时，手指上留下了白盐。他翻开第一页，见到的却是自己的字。

第四十二次会议原簿已经抄过三遍。新本里每一行都齐整，连空白也按页数留下。唯独旧页不在档案里。有人说旧页潮湿，有人说旧页失火，也有人说它从未入库。三种说法都盖了印。

守夜人把旧账摊在桌上。上面的字没有被水冲淡。第四十一次会议的末尾，记着一笔：潮先把账交给港口，港口把账交给教团，教团把账交给无人。后面还写着一行小字：若无人签收，来者即为收件人。

新本没有这一行。抄录的人把它删了，又把删去的空隙补成了会议日期。每一次重抄，都是为了让那条路不再通向任何人。

书记员问，旧页为何还在。守夜人把账翻到末尾。纸背上有一道浅痕，像有人曾用笔尖停在那里，迟迟没有落下。

**锚句**：旧页没有失踪。
**Anchor sentence**: the old page never disappeared.

---

## 四 · 第八盏灯最后一次开灯

港里有八盏灯。前七盏照过栈桥、仓门、外港和议席。第八盏在潮汐教团的旧楼顶上，常年不亮。每次会议结束，守灯人都要在簿上写明灯芯未动。

那夜，守夜人取出灯罩里的裂玻璃，放在桌上。守灯人先拿起火石，手停在灯芯旁。她没有点。她看向书记员。书记员看着那本旧账。账页没有翻动。

先点灯的是最年轻的抄写员。他从会议桌下找到一截灯芯，剪短，放进第八盏灯里。火石擦过两次，第三次才有火。火光映在他手背上，照出一条旧伤。

守灯人看着他，像看着一个终于落到纸上的字。抄写员转过头，看着守夜人。守夜人看着灯，没有看任何人。

随后，众人彼此看了一遍。没人说灯是谁点的，也没人把这个名字记进簿里。第八盏灯照亮旧楼的窗，窗外没有潮水，只有露出的海床。

**锚句**：灯亮时，无人替它作证。
**Anchor sentence**: when the lamp lit, no one vouched for it.

---

## 五 · 他留下的那一笔签收

守夜人把旧账推到桌子中央。书记员拿来收据，仍是第四十一次会议后留下的那张。纸面干燥，盐痕已结成薄壳。签名栏空着，旁边备有印泥和一枚教团旧印。

守夜人没有拿笔。书记员说，收件人须画押。守夜人说，纸上没有他的名字。书记员回答，名字可以补。他说，补上的名字只归那张纸。

桌边的人逐一看着他。守灯人没有移开目光。抄写员低头看着自己的手。书记员把笔放在收据上，笔尖朝向空栏，像一支没有归处的针。

守夜人伸出食指，在盐痕上按了一下。没有留下指纹，只有一处微湿。水很快渗进纸里，越过签名栏，停在"收件人"三个字下方。

他说："契有其形，签有其心。"

书记员把这句话记进账里，没有加上引号。收据仍未画押。那道湿痕却在纸面留下了边界，像一处刚刚合拢的岸。

**锚句**：不画押，也算签收。
**Anchor sentence**: no mark was made — and it counts as received.

---

## 六 · 潮沙盘最后一个旋钮

潮汐教团把沙盘抬进旧楼。盘面画着港口、北端和退到尽头的海。九个旋钮排在盘沿，旧制规定，会议结束后须按九下，最后一下一直由缺席者代行。

第四十二次会议没有人宣读议程。守夜人站在沙盘旁，手指落在第一个旋钮上。他没有按。抄写员问，谁来按。守夜人看向守灯人。守灯人看向书记员。书记员看向那张未画押的收据。

最后是书记员把手放上旋钮。他按了九下。每一下都转过半圈，沙盘上的线便退去一截。港口缩小，北端露出，八盏灯成了八个没有名字的点。

第九下之后，盘面没有显出新的海岸。沙从边缘落下，堆在桌脚。众人看见盘底刻着旧页上没有抄入新本的那句话：账已交还，勿再转寄。

守夜人收起旧账，提起裂了玻璃的灯罩。第八盏灯还亮着。没有人说它该亮到何时。港门敞开，外面没有潮声。

书记员在最后一栏写下：已收。没有写收件人的名字。

**锚句**：第九下，账止于此。
**Anchor sentence**: at the ninth turn, the account rests.

---

## 模型映射（末章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 末潮 · 空位 · 旧页 · 若无人签收，来者即为收件人 | 一至六 |
| geography | 雾港 · 海床 · 旧楼 · 北端 · 港口 | 一至六 |
| factions | 潮汐教团 · 守灯人 · 书记员 · 最北端的守夜人 | 一至六 |
| characters | 守夜人 · 守灯人 · 书记员 · 抄写员 | 一至六 |
| items | 空白收据 · 旧账 · 第八盏灯 · 沙盘 · 灯罩裂玻璃 | 一至六 |
| story | 雾港 · 第八盏灯 · 末章·最后的签收 | 全篇 |
| history | 铁月纪的尾声 · 远信之后 · 第四十二次会议永未召集 | 一至六 |

> 潮先走，账才开始；潮再来，账才永远合不上。
> 签收从不是握笔的事——是潮向海投下一叠寄不走的信。
>
> The tide left first, so the ledger could finally open; the tide returns, so it never closes for good.
> A signature was never a matter of pen and ink — it was the tide posting a stack of mail the sea never accepted.
`,
    markdownEn: `# 低语诸王 / The Whispers' Kings · World Bible · 末章「最后的签收」

> The canon closes here: the Tide Congregation, the letters, and the ninth knock all meet in this chapter.
> This chapter invents no new lore; it writes the loop back onto the existing ledger. The pen stays yours.
> Canon discipline is unchanged — anchor sentences match word-for-word; no rephrasing.
>
> 正典在此收束：潮汐教团的正典、远信与第九叩在这一章里合拢。
> 本章不引入新设定，只按正典的既有账回写闭环；续写权仍留给你的手。
> 正典纪律不变：锚句中英字字对齐，引用者逐字保持。

> Era: the close of the Iron-Moon Age · after the letters.
> 纪元：铁月纪的尾声 · 远信之后。

---

## I · The Last Ebb

When the forty-first meeting broke up, the harbor bell had not rung. On the table lay a blank receipt, a lump of salt still weighing down its corner. Nobody touched it. Beyond the windows, the tide had dropped half a li, laying bare old piles, snapped hawsers and the white bellies of overturned boats.

The Tide Congregation audited the books as usual. Water levels, hull counts, lamp oil, the names of the dead — item by item into the roll. The last entry read *the tide went first*; after it, no figure. The clerk left that cell blank, like an unsealed letter.

The sea kept withdrawing. It passed the outer harbor, passed the breakwater, and stopped at mud flats no map would record. Only then did the people see: the tide had departed the books years before. What remained was the monthly sound of surf; the same entries copied again and again; the debt everyone still paid on time.

Nobody asked whom the debt was owed to. Even if anyone had asked — there was no receipt to issue.

The blank receipt was lifted from the table and given to the next clerk. No sender, no date; only a tide-marked streak slanting over the corner, ending at the blank cell.

**Anchor sentence**: the tide leaves first; only then does the ledger open.
**锚句**：潮先走，账才开始。

---

## II · The Last Receiver

The night-watchman from the far north end first entered the harbor on the third day after the ebb. He had no boat, no companions. The people along the shore knew his lamp — but none had ever seen the person under it.

As he stepped through the gate, he carried an old lampshade in hand. One pane of its glass was cracked; inside, no wick. The gatekeeper asked what he had come to receive. He said — something that had been posted a long time. The gatekeeper asked for his warrant. He set the empty shade on the desk, and gave no answer.

The Congregation's seats still stood in their old order. The watchman's stood at the very tail; his name-plate blackened, salt gnawing away half the characters. He did not sit — he only read each plate once through, like checking letters one by one that had been mislaid.

Someone asked his name. He said, his name had been written at the far end a long time ago; up there, nobody kept a copy for him. The clerk asked him to say it again — he only pushed the shade one inch further across the desk.

The harbor still waited for a signature. Those at the table stared as if his sitting down would give the receiver an outline fit for transcription.

He did not sit.

**Anchor sentence**: the recipient arrives — the empty seat remains.
**锚句**：收件人到了，空位仍在。

---

## III · The Book He Opened

From inside his coat the watchman drew a slim book. Its cover carried no title; seawater had stiffened the edges. When the clerk took it up, salt came away on his fingertips. He opened the first page — and found his own handwriting.

The original minutes of the forty-second meeting had been copied three times over. In each new volume, every line stood straight — even the blanks preserved their page count. Only the old page never reached the archive. Some said it was damp; some said it had burned; some said it had never entered the vault. Each story wore a stamp.

The watchman spread the old book out. Its letters were not washed away. At the foot of the forty-first meeting's record ran a line: *The tide hands the books to the harbor; the harbor hands them to the Congregation; the Congregation hands them to no one.* Below, a smaller line: *If no one signs to receive, the comer shall be the recipient.*

The new volumes did not have that line. The copyists struck it out — then filled the space with the meeting's date. Each recopy was a way to make the path no longer lead to anyone.

The clerk asked why the old page was still with them. The watchman turned to the last sheet; a shallow groove tracked along the back — as if a pen nib had paused there and never descended.

**Anchor sentence**: the old page never disappeared.
**锚句**：旧页没有失踪。

---

## IV · The Eighth Lamp Lit One Last Time

The harbor had eight lamps. The first seven threw light over wharf, warehouse, outer harbor and council floor. The eighth stood on the roof of the old Congregation hall — and never lit. Each meeting ended with the lamp-warden entering in the register: wick never touched.

That night, the watchman unpacked the shade's cracked pane onto the desk. The lamp-warden took up the flint and stopped by the wick. She did not strike. She looked to the clerk. The clerk looked at the old book. Its pages did not turn.

The first to light was the youngest copyist. From beneath the conference table, he found a length of wick, trimmed it, and laid it into the Eighth's chamber. The flint sparked twice — fire on the third. Its light fell across the back of his hand, revealing an old scar.

The lamp-warden watched him, as if he were a word finally set on paper. The copyist turned his head toward the watchman. The watchman looked at the lamp, and at no one.

Then everyone looked at everyone else. Nobody said the lamp was lit by anyone, and no such name was entered in the register. The Eighth threw its glow over the old hall's windows; beyond them no tide remained — only an exposed sea-bed.

**Anchor sentence**: when the lamp lit, no one vouched for it.
**锚句**：灯亮时，无人替它作证。

---

## V · The Signature He Made

The watchman pushed the old book to the center of the table. The clerk brought out the receipt — the same one left behind after the forty-first meeting. Its surface had dried; the salt rose had set into a thin shell. The signature cell stood blank; beside it sat a dish of seal paste and the Congregation's old seal.

The watchman took up no pen. The clerk said the recipient must set a hand to it. The watchman said the paper carried no name of his. The clerk answered that a name could be added. He said — that the added name would belong only to that paper.

The tableful of faces turned to him one by one. The lamp-warden never lowered her gaze. The copyist studied his own hands. The clerk laid the pen down on the receipt — its nib toward the blank cell, like an unhomed needle.

The watchman extended his first finger and pressed it once onto the salt crust. No fingerprint surfaced — only one moist mote. The water drank through the paper, crossed the signature cell, and stopped over the words *the recipient*.

He said: "A contract has its form; a signature has its heart."

The clerk entered the sentence in the ledger; no quotation marks were used. The receipt was still not signed. Yet the wet streak marked the paper with a boundary — like a shore just come to a close.

**Anchor sentence**: no mark was made — and it counts as received.
**锚句**：不画押，也算签收。

---

## VI · The Ninth Turn of the Sand Table

The Tide Congregation carried the sand table back into the old hall. Its surface showed the harbor, the north end, and the withdrawing sea. Nine knobs stood along the rim. By the old rule, the meeting ends with nine turns; the last one was always carried out by the absent.

No agenda was read aloud for the forty-second meeting. The watchman stood at the table's side; his fingers rested on the first knob. He did not turn it. The copyist asked who would. The watchman looked to the lamp-warden. The lamp-warden looked to the clerk. The clerk looked at the unsigned receipt.

In the end, it was the clerk who set his hand on the knob. He turned it nine times. Each turn swept half a round, and each round the lines on the face receded a notch. The harbor shrank away, the north end opened, and the eight lamps became eight unnamed points.

After the ninth, no new coast emerged. Sand fell from the rim, piling at the table foot. And there it was, cut into the base: the line that the old page kept, and the new volumes always skipped — *the account is returned; it is posted no more.*

The watchman gathered the old book and lifted the cracked lampshade. The Eighth was still burning. Nobody said when it would go out. The harbor gate stood wide; beyond it, no sound of tide.

The clerk set down the last entry: *received*. He did not write the recipient's name.

**Anchor sentence**: at the ninth turn, the account rests.
**锚句**：第九下，账止于此。

---

## Model mapping (final chapter)

| Category | Title | Corresponds to |
|---|---|---|
| lore | The Last Ebb · the Empty Seat · the Old Page · if no one receives, the comer receives | I–VI |
| geography | The Mist Harbor · the Sea-bed · the Old Hall · the North End · the Gate | I–VI |
| factions | The Tide Congregation · the Lamp-Warden · the Clerk · the Night-Watchman | I–VI |
| characters | The Watchman · the Lamp-Warden · the Clerk · the Copyist | I–VI |
| items | The Blank Receipt · the Old Book · the Eighth Lamp · the Sand Table · the Broken Shade | I–VI |
| story | The Mist Harbor · the Eighth Lamp · final chapter · The Final Seal | whole |
| history | The close of the Iron-Moon Age · after the letters · the forty-second meeting that never was | I–VI |

> The tide left first, so the ledger could finally open; the tide returns, so it never closes for good.
> A signature was never a matter of pen and ink — it was the tide posting a stack of mail the sea never accepted.
>
> 潮先走，账才开始；潮再来，账才永远合不上。
> 签收从不是握笔的事——是潮向海投下一叠寄不走的信。
`,
  },
  {
    order: 7,
    slug: '007-ashes-before-the-lamp',
    titleZh: '灯前灰',
    titleEn: 'Ashes Before the Lamp',
    eraLineZh: '纪元：铁月纪之后 · 灰棚之前。',
    eraLineEn: 'Era: after the Iron-Moon Age · before the grey cover was laid.',
    markdownZh: `# The Whispers' Kings · World Bible · Chapter VII: Ashes Before the Lamp

> 正典在此继续写下去：世界没有结束，灯也没有熄灭。
> 第七章的视角不再在海上看—它回到了教团门口的那三块石阶上。
> 本章正典纪律不变：锚句中英字字对齐，引用者逐字保持。
>
> The canon continues here: the world did not end; the lamp did not go out.
> Chapter VII no longer watches the sea — it settles at the three steps before the Conclave's door.
> Canon discipline is unchanged — anchor sentences match word-for-word; no rephrasing.

> 纪元：铁月纪之后 · 灰棚之前。
> Era: after the Iron-Moon Age · before the grey cover was laid.

---

## 一 · 灰前一个孩子

潮汐教团门前，旧灯篓放在灰处。灯灭之后四十年，它才来。没有人问是谁搬来的。篓底沾着盐，篾条断了三根，提手上缠着一截褪色的红绳。红绳打了死结，没人解。

孩子睡在灯篓前一丈。那夜潮退得很低，石阶露出黑色的缝，水在缝里没有声音。孩子把鞋并在门槛外，鞋尖朝向海。身上没有牌子，也没有写着姓名的布片。脸朝墙，手藏在袖里，像是怕惊动谁。

天亮时，守门的人来扫灰。他绕过孩子，把扫帚伸进灯篓下，扫出一只死蚝壳。孩子没有醒。又过一夜，门前的人换了一班，鞋仍并在那里，灰落在鞋帮上。没有人把他抱走，也没有人替他盖布。等候的人把脚往后挪，给孩子留下半步宽的空处。

墙上贴着一张海报。纸被潮气泡软，四角贴得很牢。上面原有字，雨水把字洗得只剩几道黑痕。那是世上最安静的一张海报；风从门洞穿过时，它没有响。孩子在它下面睡去，睡得没有声息。第三日，扫灰的人又来了，扫帚停在鞋前，停了很久，最后只扫走台阶边的盐。

**锚句**：灰先记住了孩子。
**Anchor sentence**: the ash learned the child first.

---

## 二 · 商人家族的门面

商人家族的门面向着教团，窗板擦过油，门环每隔三日抛一次。账房坐在柜台里，柜台上有一道刀痕，从左角直通木纹。他不许人用布盖住它，说账目要有一道不能擦去的地方。

每到退潮，他便取出灯芯，一根一根数。先数新芯，再数旧芯；数过的搁在右边，未数的搁在左边。两边一样长，颜色却不同。柜台外的人问他数了多少，他只说数到这里。没人追问"这里"是哪一处。

家族的账册按年立卷，封面不写年份，只写潮向。旧卷的边缘起了盐，翻页时会落白屑。账房把屑扫进一只铜盒，盒上刻着一行字：欠灯芯三百年。字刻得浅，像是不想让来人看见。

门外的灰渐厚，商人们仍把鞋底擦净才进门。他们谈价时压低声音，谈到灯篓便停口，像是有一位顾客站在门边，等着他们报数。账房每天核一次灯芯，核到日落，便合上账册。合页落下时，柜台那道刀痕仍露在外面。

有一年，家主把一捆新芯送进教团。账房没有记作捐赠，也没有记作售出。他在空白处画了一条竖线，又将这条线抄进下一册。此后每册都有一条，越抄越细，最后细得像芯头未燃时那一道白。

**锚句**：账不替灯作证。
**Anchor sentence**: the ledger does not testify for the lamp.

---

## 三 · 守夜人最后一次巡检

守夜人最后一次巡检，是在潮汐教团门前的石阶还没有全被灰盖住的时候。他带着一盏手提灯，沿墙摸过门钉，摸过窗缝，最后停在旧灯篓前。篓里的火早已灭了四十年，篓沿却留着一圈黑亮的油痕。

他没有熄灯。

巡检簿上写着：灯未熄，因无火可灭。下一行被水浸开，墨迹散成一团。有人问他为何不把灯取下，他说取下来就要报废；有人问为何不添油，他说油账不在他手里。之后便没人再问。

那盏灯挂在门内，灯罩蒙尘，芯子短得看不见。每当夜潮涨到第三阶，灯腹里便有一点红，像一粒埋在灰中的炭。守夜人用指背碰过灯座，温度不高，也不冷。他把手收回来，没有在簿上写"燃"。

油从何处来，没人见他添过。灯芯为何不尽，也没人见它长过。灯罩里的火不向外吐烟，只把光留在玻璃内侧；每次巡检，守夜人都用袖口擦一次玻璃，擦完便在门边坐下。天亮时，他把灯放回原处，交班，不交钥匙。

最后一夜，他把巡检簿摊在膝上。潮声过门，簿页翻到空白处。他写了一个"未"，停笔，把后面的字留给接班的人。那人没有来。天色发白时，守夜人将笔搁在灯座下，自己走进灰里，再没有回来。

**锚句**：他没有替火收尾。
**Anchor sentence**: he did not see the fire to its end.

---

## 四 · 旧机子

旧机子藏在教团地窖，外壳上钉着一片船板。船板的年轮从孔洞里露出来，孔洞共有九个。机子上有一个沙盘，盘内堆着细灰，灰面平得像退潮后的滩。

每次机子启动，先响八下。第一下从底座来，第二下从墙里来；到第八下，门外的人会抬头。第九下总不响。机针停在刻痕边，沙盘中间便多一道浅沟，像有人用指甲划过。

后来有人发现，沙盘被挑过一根针。针极细，弯在最底层，颜色与灰相近。没有人承认动过它。机房看守按章登记，把那根针写作"异物"，又将它放回原处。次日，机子响了八下，仍不响第九下。

从那以后，等候的人开始在八下之间记时。有人数潮，有人数门钉，有人用指头压住掌心。第九下之后，沙盘不再起沟，只有一层薄灰向左移，移得不够远，无法算作方向。

账房曾来取机子的铜片。他站在沙盘边，数了八次，没有伸手。走时把门关好，门锁落下两声。锁声与机声不同，没人把它记进巡检簿。

**锚句**：第九下欠在盘底。
**Anchor sentence**: the ninth beat was never paid into the sand.

---

## 五 · 灰最里层

灰最里层有一块布，裹在床垫外面。布边磨成细线，缝口朝里，像是曾有人把什么塞进去，又不愿它露出来。扫灰的人先扫到布，便停手；后来换了扫灰的人，也都停手。

布上没有花纹，只有四道折痕。折痕交在正中，压出一块暗色。有人说那是水迹，有人说是油。没有人拿水洗，也没有人送去验。它就留在灰里，像一笔尚未入册的数。

教团门前的床垫原本属于守夜人。退役那年，他把它搬出门，放在灯篓旁，说屋里潮。三天后，床垫不见了，只剩这块布。人们在灰里找过床脚，没找到。也有人说床垫从未在这里，守夜人只是带着布走过。

某个退潮的清早，布的一角翻起。底下露出一小截发白的线头，缠着一点黑灰。孩子的鞋还在原处，海报也没有响。账房从门里望见布角，数到三，便低头继续数芯。守门的人重新扫地，把布角压回灰中，没有碰它。

之后每逢涨潮，灰面会塌下一寸。布总留在里面，不上浮，也不再下沉。潮水退去，门前仍有人等。没人知道他们等的是布、火，还是那块布裹着的床垫。

**锚句**：最里层不记姓名。
**Anchor sentence**: the deepest layer never keeps a name.

---

## 六 · 那天的账终于合上了

那天没有风。商人家族的账房把门面上的油布撤下，柜台刀痕露了出来。门外的灰一直铺到台阶底，旧灯篓在灰中斜着，提手断了一边。等候的人站成两列，没有人领头。

账房取出三百年的账册，一册一册放在柜台上。册页之间夹着盐屑、短芯、巡检簿的残页，还有一片烧黑的纸。纸上没有字，边缘整齐，像是从一张完整的账单上裁下的。他没有把这些东西另作清点，只把册子按潮向排好。

守门的人把门内那盏灯摘下，放在柜台尽头。玻璃没有破，灯芯仍短。没人往里添油。最后一册打开时，账房将一根未燃的芯放在末页，芯头朝向门外。然后他合上册子，手掌压住封面，直到页角不再翘起。

门前的人没有散。灯没有自己燃起来，也没有永远亮着。灯腹里那点红熄了，玻璃上留下一个小小的黑圈。灰落进灯篓，填到篾条的断口；水从石阶漫上来，绕过孩子的鞋，绕过那块布，退回海中。

三百年账册合上的声音很轻。账房在封面写下"第八盏灯"，不写日期，也不写欠数。随后他把笔放回柜台刀痕旁，关了门。门外仍有人等，等着那只旧灯篓里再有火，或从此没有。

**锚句**：三百年账终于合上。
**Anchor sentence**: the three-hundred-year account closes at last.

---

## 模型映射（第七章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 灰棚 · 账册 · 旧灯篓 · 灯芯三百年 | 一至六 |
| geography | 潮汐教团 · 门外的灰棚 · 商人家族 · 地窖 | 一至六 |
| factions | 守夜人 · 商人家族 · 教团 · 扫灰的人 | 一至六 |
| characters | 孩子 · 账房 · 守夜人 · 看门人 | 一至六 |
| items | 灯篓 · 账册 · 灯芯 · 红绳 · 沙盘 · 布 | 一至六 |
| story | 雾港 · 第八盏灯前灰棚 · 第七章 | 全篇 |
| history | 铁月纪之后 · 灰棚前 | 一至六 |

> 账要合，火要灭；雨要下，盐要化。
> 灰不说话——它只替灯保管剩下的。
>
> The ledger must close, the flame must die; the rain must fall, the salt must melt.
> Ash does not speak — it only holds what the lamp leaves behind.
`,
    markdownEn: `# 低语诸王 · 世界大典 第七章「灯前灰」

> The canon continues here: the world did not end; the lamp did not go out.
> Chapter VII no longer watches the sea — it settles at the three steps before the Conclave's door.
> Canon discipline is unchanged — anchor sentences match word-for-word; no rephrasing.
>
> 正典在此继续写下去：世界没有结束，灯也没有熄灭。
> 第七章的视角不再在海上看—它回到了教团门口的那三块石阶上。
> 本章正典纪律不变：锚句中英字字对齐，引用者逐字保持。

> Era: after the Iron-Moon Age · before the grey cover was laid.
> 纪元：铁月纪之后 · 灰棚之前。

---

## I · The Child Before the Ash

Before the Conclave's door, the old basket lay in the ash. Forty years after the lamp died, it had come. Nobody knew who had set it there. Its foot was salted; three withes were broken; a faded red cord wound the handle. The red cord bore a death knot; no one ever undid it.

A child slept one pace from the basket. That night the tide had withdrawn low — bare black seams of stone showed between the steps, water run silent inside them. The child set his shoes side by side outside the threshold, toes pointed at the sea. No card; no name-cloth on him. Face to the wall, hands buried in sleeves, as if afraid to disturb someone.

By morning, the door-sweeper came to clear ash. He walked around the child; drove his broom under the basket, pried up a dead oyster shell; the child did not wake. Again the next night the shift changed; the shoes stayed put; ash gathered on their cuffs. Nobody carried the child away; nobody laid a cloth over him. The waiting ones drew their feet back, leaving half a pace of clear space.

On the wall hung a poster. Paper gone soft with damp, its four corners tacked fast. The letters had been washed away by rain, leaving only driftings of dark; the paper of it would never sound in the wind; the child slept beneath it without a sigh. On the third day the sweeper came again; his broom hovered above the shoes; they did not move — only the salt at the edges was swept away.

**Anchor sentence**: the ash learned the child first.
**锚句**：灰先记住了孩子。

---

## II · The Face of the Merchant House

The merchant house's shopfront faced the Conclave; its shutters oiled bright; the knocker cast every third day. The bursar sat in the counter; a single engraved stroke crossed the wood diagonally from one side. He would not let a cloth cover it; a ledger must have one place that cannot be wiped clean.

At every ebb he drew out wicks, one by one. First the fresh ones, then the used ones; his right hand received what was counted, his left what remained. Both heaps the same length — different colour. People at the counter asked how many he had counted; he answered only with where he had stopped. Nobody asked again.

The house bound its ledgers by tide — the cover bore no year, only the tide-line. At the edges of old volumes salt crusted; pages shed white dust. The bursar brushed the dust into a brass box, and on the box ran one line: three hundred years of wicks owed. The engraving was shallow; it was not meant to greet a visitor's gaze.

Outside, the ash thickened; the merchants still wiped their soles before they came in. When they bargained they lowered their voices; turning to the basket, they stopped mid-sentence — as if a figure stood waiting at the door, awaiting a count. Every day the bursar checked the wicks once; he finished at sundown; he shut the ledger; the clasp fell — the engraved stroke was left by the side.

Once, the head of the house sent a bundle of fresh wicks into the Conclave. The bursar did not register them as donation nor as sale. He drew one vertical line in the margin — and copied it forward into every ledger thereafter. Each ledger grew the stroke thinner, until the last one was fine as the white tip of an unlit wick.

**Anchor sentence**: the ledger does not testify for the lamp.
**锚句**：账不替灯作证。

---

## III · The Night-Watchman's Last Inspection

The last inspection happened while the steps before the Conclave's door were not yet wholly under ash. The watchman carried a mantle-lantern; he passed along the wall touching nail-heads, slid his hand along window seams; finally stood before the old basket. The fire inside it had been out forty years; along its rim a dark streak of oil remained.

He had not blown it out.

Into his inspection roll he wrote: the lamp did not go out — there was no fire to put out. The following line was bled by damp; the ink scattered into a bloom. Someone asked why he did not take the lamp down; he said it would then become salvage. Someone asked why he did not refill the oil; he said the oil-account was not in his keeping. After that, nobody asked.

The lamp hung inside the door; dust filmed its shade; the wick so short it could hardly be seen. Each time the tide bore the nightwater up the third step, a small red point lingered deep inside the belly of the lamp, like a buried ember. The watchman touched the base with the back of his hand — neither warm enough nor cold enough. He did not enter the word "burning" anywhere in the register.

Where the oil came from, nobody had seen him pour. Why the wick never finished, nobody had seen it grow. The light inside did not smoke; it stayed wrapped in the glass; each inspection he wiped the glass with his sleeve; once done, he would sit by the door a while. By morning he put the lamp back in its place; handed over the shift; did not pass any keys.

The last night, he settled the roll on his knee. The tide-sound came into the doorway; the page turned into a blank. He wrote one character — 未 — there stopped, leaving the rest of the word for whoever took the next shift. They never came. By dawn, the watchman laid the quill on the lamp stand; walked into the ash; he never came back.

**Anchor sentence**: he did not see the fire to its end.
**锚句**：他没有替火收尾。

---

## IV · The Old Machine

The contraption lived in the Conclave's cellar; it was padded with a panel from an old hull. Between its breathing holes, the ring marked the plank's age — nine holes in all. At its top lay a sand-tray, evenly spread with fine ash, the face level as a flatland left behind by ebb.

Each time it started, eight knocks came out — the first from the footstall; the second from within the wall; at the eighth, people outside raised their heads. The ninth never came. The needle stopped beside the gauge; a shallow groove opened in the sand, as if a fingernail had been drawn through.

Later, somebody found had been picked. An extra pin — thin as wire — bent at the lowest layer, grey-on-grey. Nobody claimed having moved it. The cellar-keeper filed it as "foreign matter," then set it back in the sand. The next day, eight knocks again — and no ninth.

After that, the waiters counted intervals between knocks. Some counted the tide; some counted the door-nails; others pressed their knuckles into their palms. After the ninth never came, the sand ceased to groove; only a slow drift shifted to the left — not enough to figure a direction.

The bursar once came to fetch a brass fitting. He stood over the sand-tray, counted eight; he did not reach in. As he left, he locked; the lock came home twice; the sound was not the sound of the machine; nobody logged that either.

**Anchor sentence**: the ninth beat was never paid into the sand.
**锚句**：第九下欠在盘底。

---

## V · The Innermost Layer of the Ash

Deep inside the ash lay a length of cloth wrapped around a mattress. The selvedges had worn to threads; seams turned inward — as if someone had tucked something inside without meaning to let it show. Sweepers who reached the cloth stopped; those who followed stopped too.

The cloth bore no pattern — only four folds crossing at its centre, pressing a dark patch between. Some said it was water; some said oil. Nobody washed it; nobody sent it for testing; it remained under the ash, like a figure never entered in any ledger.

The mattress by the Conclave's door had belonged to the watchman. The year he retired, he dragged it out, leaned it against the basket; said the rooms were damp. Three days later, the mattress was gone — only the cloth remained. People searched the ash for the corners; none. Others said the mattress had never been there — only that the man carried the cloth.

One ebbing dawn the corner lifted; beneath showed a pale thread wound with a little black ash. The child's shoes still stood by the threshold; the poster stayed silent. From inside, the bursar saw the corner and counted three, then dropped back to counting wicks. The sweeper re-swept; pressed the corner back into the ash; did not touch it.

After that, the ash subsided an inch at every tide. The cloth remained hidden; it did not float; it did not sink. The tide left; the door stayed watched; whether they were holding out for the cloth, the flame, or the mattress beneath — nobody knew.

**Anchor sentence**: the deepest layer never keeps a name.
**锚句**：最里层不记姓名。

---

## VI · The Day the Book Finally Closed

There was no wind that day. The bursar of the merchant house took down the oil-cloth that had covered the shopfront — the engraved stroke on the counter showed again. Ash lay thick across the steps; the old basket sat leaning in it, one side of its handle broken. Watchers formed two ranks; no one led.

From the house he carried out three hundred years of ledgers — one volume after another — and set them along the counter in tide sequence. Between their leaves were salt dust, short stubs of wick, torn pages from inspection rolls, and a blackened slip of paper, edge cut straight. He did not inventory them again; only set them in order.

The doorkeeper took the lamp from inside and laid it at the far end of the counter. The glass was unbroken; the wick was still short. Nobody fed oil. At the last page, the bursar laid down an unlit wick on the final leaf — its head toward the door — and shut the ledger, pressing his palm against the cover until the corners lay flat.

The watchers did not disperse. The lamp neither blazed nor died for good. A single faint red point dissolved in the belly of the shade; above the glass a small dark ring. Ash fell into the basket; it filled up to the broken withe — and the water lifted itself across the steps; passed around the child's shoes; moved past the cloth; and withdrew again toward the sea.

The sound of closing was very faint. The bursar inscribed on the cover: the Eighth Lamp — no date, no debt. Then he set the quill by the engraved mark, and shut the door. Outside, someone waited — whether for another fire in the old basket, or for its forever absence.

**Anchor sentence**: the three-hundred-year account closes at last.
**锚句**：三百年账终于合上。

---

## Model mapping (Chapter VII)

| Category | Title | Corresponds to |
|---|---|---|
| lore | Ashes Before the Lamp · Wicks Owed for Three Hundred Years · the Old Machine · the Innermost Cloth | III–VI |
| geography | The Mist Harbor · the Conclave · the Merchant House · the Cellar | I–VI |
| factions | The Northern Night-Watchman · the Merchant House · the Tide Conclave · Sweepers | I–VI |
| characters | The Child · the Bursar · the Night-Watchman · the Doorkeeper | I–VI |
| items | The Basket · the Ledgers · the Wicks · the Red Cord · the Sand Table · the Cloth | I–VI |
| story | The Mist Harbor · the Ash Before the Lamp · Chapter VII | whole |
| history | After the Iron-Moon Age · Before the Grey Cover Was Laid | I–VI |

> The ledger must close, the flame must die; the rain must fall, the salt must melt.
> Ash does not speak — it only holds what the lamp leaves behind.
>
> 账要合，火要灭；雨要下，盐要化。
> 灰不说话——它只替灯保管剩下的。
`,
  },
  {
    order: 8,
    slug: '008-after-the-ash',
    titleZh: '灰后',
    titleEn: 'After the Ash',
    eraLineZh: '纪元：铁月纪之后 · 灰棚之前。',
    eraLineEn: 'Era: after the Iron-Moon Age · before the grey cover was laid.',
    markdownZh: `# The Whispers' Kings · World Bible · Chapter VIII: After the Ash

> 正典没有结束——它只是合上了一本账。
> 第八章写账合之后的第三天：门没有开，灰有了去处，世界继续。
> 本章正典纪律不变：锚句中英字字对齐，引用者逐字保持。
>
> The canon did not end — it only closed a ledger.
> Chapter VIII writes the third day after: the door stayed shut, the ash found its way, the world went on.
> Canon discipline is unchanged — anchor sentences match word-for-word; no rephrasing.

> 纪元：铁月纪之后 · 灰棚之前。
> Era: after the Iron-Moon Age · before the grey cover was laid.

---

## 一 · 门外的第三天

账合上的第三天，门外的人仍在等。

门没有开。门缝里没有灯，也没有脚步。有人把耳朵贴上去，听见的只有自己的呼吸。有人把带来的水放在门边，水面落了灰，没人擦。

潮汐照常。涨时，水到石阶第三道；退时，留下细盐。等候的人日日看那道盐线，像看一笔未完的账。没有人替他们记下是谁先来，谁先走。门前的空处一日比一日宽，脚印被潮气抹平，又被新脚印压住。

第三日的午后，有人敲了一次门。声音短，像指节碰上空木匣。里面没有答复。那人把手收回袖中，继续等到天黑。

天黑之后，门仍关着。门外的人分成几处坐下，谁也没有把灯提到门前。

**锚句**：门未开，潮未停。
**Anchor sentence**: the door stayed shut; the tide did not.

---

## 二 · 灰被分走的日子

第四日，有人带来布袋。

他没有向门内请示，也没有向门外的人告知。他用一块薄木片，从墙根刮起灰，装了半袋，系好袋口，放进车里。车轮压过石缝时，灰从袋眼漏出，一路落到码头。

第二天，又有人来。她拿的是陶罐，装得很少，只够盖住罐底。她把罐口封住，抱在胸前走了。后来有人用铁盒，有人用旧鞋，有人把灰装进折起的纸里。各自带走一份，各自记得份量。

没有人禁止。也没有人允许。

守门的老人站在台阶边，手里握着一串钥匙。他没问袋子里是什么，也没替任何人开路。有人经过时向他点头，他点回去。落在台阶上的灰被鞋底带走，留下一条条浅痕。

那几日，门外不再只有等候的人。来的人拿走灰，留下容器的印子。夜里潮气上来，印子变软。第二天，新的容器又压在同一处。

**锚句**：灰有去处，无人作主。
**Anchor sentence**: the ash had a destination; no one gave the order.

---

## 三 · 孩子的名字念完了

那个孩子坐在窗下，膝上摊着纸。

纸上已经写了七个名字。第八处空着，空处被指腹磨得发亮。孩子每天把七个名字念一遍，念到最后，就停住。没人替他填字。有人问过，他摇头，把纸折好，压在枕头下面。

今天，孩子把纸取出来。

他念第一个名字，窗外有人挑水经过。念到第三个名字时，屋檐滴下一串水。第七个名字落下后，屋里静了一会儿。孩子没有合纸，也没有抬头。他把空着的那一处念完了。

那声音不大，门外的人没有听见。窗台上的空盏里落进一粒灰，滚到盏底。

孩子把纸折回原样，放在枕下。那一夜，他没有再念。

翌日，纸上仍是七个字。第八处没有添笔，只有一道浅浅的凹痕，像曾有人用力写过。

**锚句**：空处今日有声。
**Anchor sentence**: the empty space spoke today.

---

## 四 · 最后一趟潮水

水退得比以往都远。

先露出石阶尽头，再露出旧桩的根。泥地开裂，裂缝里留着鱼骨、断绳和一枚锈钉。更远处有一道黑线，平日只在风暴后出现；这回它停在众人眼前，直到暮色落下也没有被水盖住。

有人沿着湿地走过去，弯腰捡起一片碎碗。有人站在岸上，没有下脚。退潮带来的腥气压着盐味，吹过门前时，门板仍旧不动。

孩子也到了岸边。他把那张纸揣在衣内，手指按着第八处凹痕。没有人问他念了什么。远处一只空船搁在泥上，船底朝天，绳索垂着。

夜里，水没有按时回来。

岸边的人各自回家。有人留下一盏灯，火芯烧到尽头，黑烟贴着潮湿的墙散开。第二天水才漫上来，把裂缝填满，把鱼骨推回暗处。

**锚句**：水退得远，岸记得住。
**Anchor sentence**: the tide withdrew far; the shore remembered.

---

## 五 · 空盏留给谁

账房关门后，空盏和浅口碟还在窗台上。

盏口朝上，碟沿缺了一角。没人收起它们，也没人把灰倒进去。早晨有盐雾落在盏底，午后风吹进窗缝，把几粒尘推到碟边。入夜后，窗台黑下来，盏与碟只剩两道轮廓。

有人来问，空盏留给谁。

守门的老人看了一眼，没有答。问话的人也没有再问。他把一段麻绳放在窗下，转身走了。绳子被潮气浸湿，贴着墙根蜷起来。

后来，一个女人把半袋灰放到窗边。她没有倒进盏里，只将袋口折好，压在浅口碟旁。清晨，她回来取走袋子。碟面留下一圈灰痕，像一只未合拢的手。

盏里仍然是空的。

**锚句**：空盏不替谁等。
**Anchor sentence**: the empty bowl waits for no one.

---

## 六 · 下一本账开始了

带灰回家的人，把袋子放在门边。

有人将灰分进几只小罐，贴上日期；有人把袋子搁在桌角，没有动；有人把灰撒进院里的泥土，之后洗净双手。没有两份相同，也没有人核对。

一个男人取出空白册子，坐到窗下。他在第一页写下自己的名字，又写当天的潮时、袋子的重量，以及屋里还有几个人。写到末尾，他停笔听了一会儿。屋外有人搬动木桶，桶沿磕在石阶上。

他没有写门内的人，也没有写第八盏灯。

第二页空着。那一夜，册子没有合上。早晨的盐雾落进纸纹，墨迹没有散开。

门前仍有人等。有人不再等。潮水涨过石阶，又退回旧线。窗台上的盏与碟没有移动，灰袋在各家的门边结出潮气。

下一本账从一行日子开始。写账的人没有抬头。

**锚句**：世上仍有未记之数。
**Anchor sentence**: the world still holds unwritten figures.

---

## 模型映射（第八章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 灰后 · 灰袋 · 孩子的纸 · 空盏与浅口碟 | 一至六 |
| geography | 潮汐教团 · 门廊 · 石阶 · 码头 · 账房窗台 | 一至六 |
| factions | 守门人 · 候门的人 · 带灰回家的人 | 一至六 |
| characters | 孩子 · 守门老人 · 带灰的人 | 一至六 |
| items | 账册 · 布袋与容器 · 孩子的纸 · 空盏与浅口碟 · 空册子 | 一至六 |
| story | 雾港 · 账合之后 · 第八章 | 全篇 |
| history | 铁月纪之后 · 灰棚之前 | 一至六 |

> 灰散了，世界没有散场；
> 下一本账，从一行日子开始。
>
> The ash has scattered, and the world has not dispersed;
> the next ledger begins with a single line of days.
`,
    markdownEn: `# 低语诸王 · 世界大典 第八章「灰后」

> The canon did not end — it only closed a ledger.
> Chapter VIII writes the third day after: the door stayed shut, the ash found its way, the world went on.
> Canon discipline is unchanged — anchor sentences match word-for-word; no rephrasing.
>
> 正典没有结束——它只是合上了一本账。
> 第八章写账合之后的第三天：门没有开，灰有了去处，世界继续。
> 本章正典纪律不变：锚句中英字字对齐，引用者逐字保持。

> Era: after the Iron-Moon Age · before the grey cover was laid.
> 纪元：铁月纪之后 · 灰棚之前。

---

## I · The Third Day Outside the Door

On the third day after the ledger closed, the people outside the door were still waiting.

The door did not open. No light came through the seam, no footsteps behind it. Someone pressed an ear to the wood and heard nothing but their own breath. Someone set a bowl of water by the door; ash settled on the surface, and no one wiped it clean.

The tide kept its hours. The water climbed the third step; on its way back it left a line of fine salt. The waiting watched that line the way one watches an unfinished column of figures. No one recorded who had come first, or who had left first. The bare patch of ground before the door widened by the day — footprints smoothed away by the damp, then pressed in again by new ones.

On the third afternoon, someone knocked once. The sound was short, as if a knuckle had tapped an empty wooden box. No answer came from within. The knocker drew their sleeves over their hands and kept waiting until dark.

After dark, the door still stood shut. The waiting settled into small groups, and not one of them thought to carry a lamp to the door.

**Anchor sentence**: the door stayed shut; the tide did not.
**锚句**：门未开，潮未停。

---

## II · The Days the Ash Was Divided

On the fourth day, someone came with a cloth bag.

They asked permission neither of those inside nor of those outside. With a thin wooden scraper they gathered the ash from the wall-foot, filled half a bag, tied its mouth, and set it on the cart. When the wheels crossed the stone seams, ash sifted through the weave and littered the road to the pier.

The next day, another came — this one with a clay jar, holding very little, hardly enough to cover the bottom. They sealed its mouth and carried it against their chest all the way home. Then came someone with a tin box, someone with an old shoe, someone with ash folded into paper. Each carried away one portion, and each remembered its weight.

No one forbade it. No one allowed it, either.

The old doorkeeper stood at the step, a bunch of keys in his fist. He did not ask what the bags held, and he did not clear anyone's way. Those who passed gave him a nod; he nodded back. Carried away on shoe-soles, the ash left faint traces across the steps.

In those days, the doorstep no longer held only the waiting. Those who took ash left the pale outlines of their containers behind. At night, the damp softened the outlines; by morning, new containers pressed the same spots.

**Anchor sentence**: the ash had a destination; no one gave the order.
**锚句**：灰有去处，无人作主。

---

## III · The Boy Finishes the Name

The boy sat beneath the window, a sheet of paper across his knees.

Seven names were written there already. The eighth space stood empty, polished bright by his thumb. Every day the boy read the seven names aloud, and stopped at the end. No one offered to fill it in for him. Once, when someone asked, he shook his head, folded the paper, and set it under his pillow.

Today, he took the sheet out.

He read the first name; someone outside passed with a water-pole. At the third name, a string of water dripped from the eaves. When the seventh name fell, the room went quiet for a moment. The boy did not close the paper, nor raise his head. He read the empty place to its end.

The sound was small. Those outside the door did not hear it. A single grain of ash drifted onto the empty bowl on the sill and rattled to its base.

The boy folded the paper as before and set it under the pillow. That night, he did not read it again.

The next day, the seven names remained on the sheet. The eighth space carried no added stroke — only a shallow dent, as if someone had pressed very hard with a pen.

**Anchor sentence**: the empty space spoke today.
**锚句**：空处今日有声。

---

## IV · The Last Tide

The water drew back farther than it ever had.

First it uncovered the end of the steps, then the roots of the old piling-posts. The mud split open, and the cracks held fishbones, a snapped rope, and a rusted nail. Farther out, a black line appeared — one that surfaced only after storms. This time it stopped in plain sight, and even at dusk it had not been covered again.

Someone walked out onto the wet flat and bent to pick up a shard of bowl. Someone else stood on the shore and did not step down. The stench of the retreat pressed against the salt wind; when it passed the door, the door-board stayed motionless.

The boy walked down to the shore too, the sheet inside his coat, one finger holding the dent in the eighth space. Nobody asked him what he had read. Out on the flat, an abandoned boat rested keel-up in the mud, its mooring-rope dangling.

That night, the water did not come back on time.

Each of the people on the shore went home. Someone left a lamp burning; its wick burned down to the end, and the black smoke clung to the damp wall before fading. Only the next day did the water climb back, fill the cracks, and push the fishbones into the dark again.

**Anchor sentence**: the tide withdrew far; the shore remembered.
**锚句**：水退得远，岸记得住。

---

## V · Who Does the Empty Bowl Belong To

After the bursar shut the door, the empty bowl and the shallow saucer were left on the sill.

The bowl faced upward; the saucer's rim had lost a chip. No one cleared them away, and no one poured ash into them. Morning brought salt-mist onto the bowl's floor; the afternoon wind slipped through the window-seam and pushed a few grains of dust to the saucer's edge. When night fell, the sill went dark, and bowl and saucer remained only as two outlines.

Someone came to ask: who does the empty bowl belong to?

The old doorkeeper looked at it, and did not answer. The asker did not press further. They left a length of hempen rope beneath the window and went back the way they had come. The rope drank the damp and curled against the wall-foot.

Later, a woman set half a bag of ash by the window. She did not pour it into the bowl — only folded the bag's mouth and settled it beside the saucer. In the morning, she came back and took the bag away. On the saucer's face, a ring of ash remained, like the shape of a hand that had never closed.

The bowl stayed empty.

**Anchor sentence**: the empty bowl waits for no one.
**锚句**：空盏不替谁等。

---

## VI · The Next Ledger Begins

The ones who carried ash home set their bags by their own doors.

Some divided the ash into small jars and pasted dates onto them; some left the bag on the corner of a table, untouched; some scattered it over the soil of the yard and washed their hands afterwards. No two portions were alike, and no one tallied them against each other.

A man took out a blank ledger and sat beneath his own window. On the first page he wrote his own name, then that day's tide-hour, the weight of the bag, and how many were alive in the house. Near the end, he stopped to listen. Outside, someone shifted a wooden tub; the rim clicked against the steps.

He did not write the ones inside the door, nor the eighth lamp.

The second page stayed blank. That night, the ledger did not close. In the morning, salt-mist settled into the grain of the paper; the ink did not run.

Before the door, people still waited. Some no longer did. The tide climbed the steps, then withdrew to its old line. The bowl and the saucer on the sill had not moved; at every threshold, the ash-bags shone with damp.

The next ledger began with a single line of days. The one writing it did not look up.

**Anchor sentence**: the world still holds unwritten figures.
**锚句**：世上仍有未记之数。

---

## Model mapping (Chapter VIII)

| Category | Title | Corresponds to |
|---|---|---|
| lore | After the Ash · the Ash-Bag · the Boy's Paper · the Empty Bowl and Saucer | I–VI |
| geography | The Tide Conclave · the Threshold · the Steps · the Pier · the Sill | I–VI |
| factions | The Doorkeeper · the Waiting Ones · the Ones Who Took Ash Home | I–VI |
| characters | The Boy · the Old Doorkeeper · the Ash-Carriers | I–VI |
| items | The Ledger · Cloth Bags and Vessels · the Boy's Paper · the Bowl and Saucer · the Blank Ledger | I–VI |
| story | The Mist Harbor · After the Ledger Closed · Chapter VIII | whole |
| history | After the Iron-Moon Age · Before the Grey Cover Was Laid | I–VI |

> The ash has scattered, and the world has not dispersed;
> the next ledger begins with a single line of days.
>
> 灰散了，世界没有散场；
> 下一本账，从一行日子开始。
`,
  },
  {
    order: 9,
    slug: '009-ash-carried-home',
    titleZh: '带灰回家',
    titleEn: 'Ash Carried Home',
    eraLineZh: '纪元：铁月纪之后 · 灰棚之前。',
    eraLineEn: 'Era: after the Iron-Moon Age · before the grey cover was laid.',
    markdownZh: `# The Whispers' Kings · World Bible · Chapter IX: Ash Carried Home

> 正典没有结束——第八章里被人带走的灰，在这些人家的日常里生了根。
> 本章写一个带灰回家的人家：不是神话，是柴米油盐。
> 本章正典纪律不变：锚句中英字字对齐，引用者逐字保持。
>
> The canon did not end — the ash carried out in Chapter VIII has taken root in these households.
> This chapter writes one of them: not myth, but rice and salt.
> Canon discipline is unchanged — anchor sentences match word-for-word; no rephrasing.

> 纪元：铁月纪之后 · 灰棚之前。
> Era: after the Iron-Moon Age · before the grey cover was laid.

---

## 一 · 五天

他把布袋放在门边，袋口朝墙，底下垫着一块旧瓦。那天灶里还有火，妻子正淘米，水从盆沿漫出来，流到门槛前。她用鞋底擦了擦，没有挪袋子。

头一天，风从河口来，吹翻门外的竹筛，吹落屋檐下两根干草。布袋没有倒。第二天风又来，盐碱地上的尘贴着墙走，袋角只动了一下。

第三天，孩子出门时跨过它，鞋跟碰在袋上。孩子回头看了一眼。他父亲在井边洗手，水滴落进井圈，没说话。

第四天，屋里缺柴，妻子从门边拖过柴捆，木头擦着袋面过去。她停了一下，把柴抱进灶间。袋子仍在原处。

第五天，风停了。门边留下半圈灰，像潮退后未干的水线。袋子在那儿过了五天。风来了，它没有倒；人没有动它。

**锚句**：五日，袋未入门。
**Anchor sentence**: five days, and the bag had not entered the house.

---

## 二 · 开袋

第六天早饭后，妻子先开袋。

她要扫门边。布袋挡着扫帚，袋口的绳结又被潮气浸硬了。她把扫帚靠在墙上，拿剪刀剪断绳子。父亲那时正在屋后劈柴，听见剪刀合拢的声音，手里的斧头落在木墩上。

妻子没有叫他。她把袋口翻开，里面的灰贴着布，结成几块，细处从缝眼漏出来。她取来一只旧瓷碗，先盛出表面的一层。没有扬起烟，只在碗沿落下一圈暗痕。

孩子站在灶间门口，手里还捏着半块饼。妻子说，把门关上。孩子关了门，仍站着。

父亲进屋时，袋口已经摊平。他看了看袋底，又看妻子的手。她指甲缝里有灰，便在围裙上擦了一下。桌上放着昨夜剩的咸鱼，鱼皮朝上，没人先动。

**锚句**：开袋的是掌家的人。
**Anchor sentence**: it was the one who kept the house who opened the bag.

---

## 三 · 称灰

家里的秤挂在梁上，秤钩锈着。父亲取下来，用袖口擦过秤杆，又把一只空布兜挂上去。

他们把灰称成七份，每份一斤。秤砣每次落定，妻子便用手指拢住布兜口。孩子坐在板凳上数，数到第五份时漏了一次，父亲让他从头数。

第七份称完，袋底还剩一些。妻子把它倒在瓷碗里，灰铺开，浅浅压住碗底。她又称了一遍，秤杆没有平。那点灰不够一斤，也没有另装一份。

七只布兜排在桌上，口都扎紧。它们的重量一样，落在桌板上的声音却不一样。父亲把秤收回梁下。妻子把剩灰盖起来，瓷碗放在灶边，离盐罐很远。

孩子问，少的那一点算什么。没人答。锅里的水开了，壶盖响了三声，妻子起身添柴。

**锚句**：七份足斤，余灰无数。
**Anchor sentence**: seven full measures; what remained had no number.

---

## 四 · 孩子的两次触碰

孩子惦记袋子的重量。

第一回是开袋前。他趁大人去井边，走到门口，把手放在袋面上。布上有风干后的硬褶。他往下按了按，袋子陷进去一点，像装着一盆湿土。手拿开时，掌心是干的。他在裤腿上擦了两下，回屋吃饭。

第二回是称灰后。那天他帮父亲提水，水桶碰着门槛，溅湿了他的袖口。他又到门边，碰了碰那只已经空下来的布袋。袋子比先前轻，贴着地，布边沾了水。他把手伸进去，摸到一层薄灰。掌心湿了，灰粘在指纹里，洗了两遍还在。

父亲看见他洗手，没有问。孩子把手藏在桌下，吃完一碗粥。那晚他睡得晚，听见院门开合，听见井绳回到木轴上，也听见母亲把空袋叠了起来。

**锚句**：两次触碰，手各不同。
**Anchor sentence**: two touches; two different hands.

---

## 五 · 灰的去处

次日，妻子把一份灰撒进院里的菜畦。

她用旧筛子筛开结块的部分，灰落在翻过的土上。父亲提来一桶水，绕着菜根慢慢浇。小白菜还没长齐，叶上有泥点。妻子没有把灰撒得很厚，剩下的收进碗里，放回灶边。

邻居来借针，看见桌上另一份，问能不能埋进枕头底下。妻子把布兜递给她。邻居没说要埋什么，也没说埋多久，只把布兜塞进篮子，压在一块补衣布下。

还有两份没人拿。父亲把一份放在屋角，母亲把一份放在门内的矮柜上。她没有动它们。孩子坐在院里，看灰落在菜畦，看风把一片菜叶翻过去。那只碗里的余灰始终盖着。

饭是粟米粥，鱼是前日的剩鱼。吃完后，母亲刷锅，父亲收绳，孩子把桌上的灰印擦掉。屋里留下几道浅痕，沿着木纹，擦不净。

**锚句**：灰跟着各自的手走了。
**Anchor sentence**: the ash went where each hand carried it.

---

## 六 · 第二袋灰

屋里还留着第二袋灰。

它在门内，靠着米缸，袋口系着原来的绳。没人称它，也没人把它挪到桌上。母亲每日取米，手臂从袋边经过；父亲夜里关门，门板离袋角只差半掌。

孩子有时盯着它看。袋面没有新的褶，绳结也没有松。一次他问，这一袋什么时候开。父亲正把灶门里的火拨拢，没抬头。母亲在筛米，米粒落进盆里，细响不断。

后来孩子不问了。家里照常添柴、淘米、补衣。雨水从屋檐滴到门外，落在那块旧瓦旁。第一袋留下的布被洗净，晾在墙上，边角仍有灰色。

第二袋仍靠着米缸。没人说它要开，也没人说它不开。每日有人经过，每日都要关门。

**锚句**：第二袋仍在家中。
**Anchor sentence**: the second bag is still in the house.

---

## 模型映射（第九章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 灰袋 · 瓷碗余灰 · 七只布兜 · 秤与梁 | 一至六 |
| geography | 一户人家 · 门边 · 院里菜畦 · 灶间 | 一至六 |
| factions | 一户人家（父亲·妻子·孩子） | 一至六 |
| characters | 父亲 · 妻子 · 孩子 · 邻居 | 一至六 |
| items | 布袋 · 瓷碗 · 秤 · 旧筛子 · 粟米 · 咸鱼 | 一至六 |
| story | 灰后 · 带灰回家 · 第九章 | 全篇 |
| history | 铁月纪之后 · 灰棚之前 | 一至六 |

> 灰进了人家，就入了烟火；
> 计数的是斤两，秤不了的是沉默。
>
> When the ash entered a household, it entered the smoke and heat of it;
> the scale weighs pounds — it cannot weigh silence.
`,
    markdownEn: `# 低语诸王 · 世界大典 第九章「带灰回家」

> The canon did not end — the ash carried out in Chapter VIII has taken root in these households.
> This chapter writes one of them: not myth, but rice and salt.
> Canon discipline is unchanged — anchor sentences match word-for-word; no rephrasing.
>
> 正典没有结束——第八章里被人带走的灰，在这些人家的日常里生了根。
> 本章写一个带灰回家的人家：不是神话，是柴米油盐。
> 本章正典纪律不变：锚句中英字字对齐，引用者逐字保持。

> Era: after the Iron-Moon Age · before the grey cover was laid.
> 纪元：铁月纪之后 · 灰棚之前。

---

## I · Five Days

He set the cloth bag by the door, mouth toward the wall, an old roof-tile beneath its foot. The stove was lit that day; his wife was rinsing rice, the water running over the basin's edge to the threshold. She wiped it with the side of her shoe, and did not move the bag.

The first day, the wind came down from the river mouth — upending the bamboo sieve in the doorway, scattering two wisps of straw from the eaves. The bag did not fall. The second day, the wind returned, salt-dust creeping along the wall; the bag's corner only shifted once.

On the third day, the boy stepped over it on his way out, his heel grazing the cloth. He turned to look back. His father was at the well, washing his hands; the drops fell into the well's rim; he said nothing.

On the fourth day, with wood running short, the wife dragged the wood-bundle past the door, the logs brushing the bag's face. She paused, then carried the wood into the kitchen. The bag stayed where it had been set.

On the fifth day, the wind stopped. A half-ring of ash remained by the door, like an uncured tide-line left on the shore. Five days the bag had sat there. Wind had come, and it had not fallen; people had passed, and it had not been moved.

**Anchor sentence**: five days, and the bag had not entered the house.
**锚句**：五日，袋未入门。

---

## II · Opening the Bag

On the sixth day, after breakfast, his wife opened it first.

She meant to sweep the doorway. The bag blocked her broom; the knot on its mouth had gone stiff with damp. She leaned the broom against the wall and took the scissors to the cord. Her husband was in the back splitting wood; he heard the blades close, and the axe dropped onto the chopping block.

She did not call him. She folded back the bag's mouth; the ash inside had settled into blocks along the cloth, the fine bits slipping through the weave. She took an old porcelain bowl and scooped the outermost layer. No smoke rose; only a dark ring left along the bowl's edge.

The boy stood at the kitchen door, half a flatbread still in his hand. His wife said: shut the door. The boy shut it, and stayed where he was.

When the husband came in, the bag's mouth was already spread flat. He looked at the bottom of the bag, then at his wife's hands. Ash lodged beneath her fingernails; she wiped them once across her apron. On the table sat the last of last night's salted fish, skin upward; no one reached for it.

**Anchor sentence**: it was the one who kept the house who opened the bag.
**锚句**：开袋的是掌家的人。

---

## III · The Weighing

The scale hung from a beam, its hook rusted. The husband took it down, wiped the beam with his sleeve, then hung an empty cloth pouch from it.

They weighed the ash into seven portions, one jin each. As the weight settled each time, his wife gathered the pouch's mouth with her fingers. The boy sat on a stool and counted; at the fifth portion he lost count, and his father had him begin again.

When the seventh portion was weighed, some ash remained at the bottom of the bag. She poured it into the porcelain bowl, the ash spreading shallow across its base. She weighed it once more; the beam would not level. Not enough for a portion — it was not portioned out again.

The seven pouches stood on the table, their mouths tied. Their weight was the same, yet the sound each made on the table-board was not. The husband carried the scale back up into its beam. The wife covered what remained, and set the bowl beside the stove — far from the salt jar.

The boy asked: what does the little that's left count as? No one answered. The water in the pot came to a boil; the lid knocked three times; his wife rose to add wood.

**Anchor sentence**: seven full measures; what remained had no number.
**锚句**：七份足斤，余灰无数。

---

## IV · The Boy's Two Touches

The boy kept thinking about the bag's weight.

The first time was before the bag was opened. While the adults were at the well, he went to the doorway and set his hand against the bag's face. The cloth bore hard ridges where the wind had dried it. He pressed down; the bag yielded a little, as if it held a basin of wet soil. When he lifted his hand, his palm was dry. He wiped it twice on his trouser-leg, and went back in to eat.

The second time was after the weighing. That day he had helped his father carry water; the bucket had clipped the threshold, splashing his sleeve. He went to the doorway again and touched the now-emptied bag. It was lighter than before; it lay flat against the ground, its hem darkened with water. He pushed his hand inside, and found a faint film of ash. His palm came out wet; the ash had settled into the lines of his fingers, and would not wash away after two rinses.

His father saw him washing his hands and did not ask. The boy kept his hands beneath the table until the bowl of gruel was gone. That night he stayed wakeful late — listening to the courtyard gate open and close, to the well-rope returning to its windlass, to his mother folding the empty bag.

**Anchor sentence**: two touches; two different hands.
**锚句**：两次触碰，手各不同。

---

## V · Where the Ash Went

The next day, the wife scattered one portion across the vegetable beds in the yard.

She ran the old sieve through the clods first, letting the ash fall onto the turned soil. Her husband brought a pail of water and poured slowly around the roots of the greens. The mustard sprouts had not yet filled out; mud speckled their leaves. She did not spread the ash thickly; what remained she gathered into the bowl and carried back to the stove side.

A neighbor came to borrow a needle, and saw another portion on the table; she asked whether she might bury it beneath her pillow. The wife passed the pouch across. The neighbor did not say what she meant to bury, nor for how long; she only pressed the pouch into her basket, beneath a patch of quilt-cloth.

Two portions remained, untouched. The father set one at the far corner of the house; the mother set one on the low cabinet inside the door. Neither of them moved them. The boy sat in the yard, watching the ash settle on the beds, watching the wind turn a leaf. The bowl of what remained stayed covered.

Dinner was millet gruel and the salted fish of the day before. After, his mother scoured the pot, his father coiled the rope, the boy wiped the grey prints from the table. The house kept a few faint traces along the grain of the wood; they would not come out.

**Anchor sentence**: the ash went where each hand carried it.
**锚句**：灰跟着各自的手走了。

---

## VI · The Second Bag

A second bag of ash remained in the house.

It stood inside the door, leaning against the rice-jar, its mouth still tied with the original cord. No one weighed it; no one carried it to the table. Every day his mother reached for rice, her arm passed by the bag's edge; every night his father shut the door, the door-board no more than half a palm from the bag's corner.

The boy sometimes watched it. No new ridges marked the cloth; the knot had not loosened. Once he asked when this one would be opened. His father was raking the fire in the stove, and did not look up. His mother was sifting rice; the grains fell into the basin, a fine continual whisper.

In time the boy stopped asking. The household went on as before — wood added to the stove, rice rinsed, clothes mended. Rain dripped from the eaves onto the old roof-tile by the door. The cloth of the first bag was washed and hung on the wall, its edge still greyed.

The second bag leaned against the rice-jar still. No one said it would be opened; no one said it would not. Every day someone passed it; every day the door was shut.

**Anchor sentence**: the second bag is still in the house.
**锚句**：第二袋仍在家中。

---

## Model mapping (Chapter IX)

| Category | Title | Corresponds to |
|---|---|---|
| lore | The Ash-Bag · the Bowl of Remnant Ash · the Seven Pouches · the Scale and the Beam | I–VI |
| geography | One Household · the Doorway · the Yard-Beds · the Kitchen | I–VI |
| factions | One Household (the father · the wife · the boy) | I–VI |
| characters | The Father · the Wife · the Boy · the Neighbor | I–VI |
| items | The Bag · the Bowl · the Scale · the Old Sieve · the Millet · the Salted Fish | I–VI |
| story | After the Ash · Taking the Ash Home · Chapter IX | whole |
| history | After the Iron-Moon Age · Before the Grey Cover Was Laid | I–VI |

> When the ash entered a household, it entered the smoke and heat of it;
> the scale weighs pounds — it cannot weigh silence.
>
> 灰进了人家，就入了烟火；
> 计数的是斤两，秤不了的是沉默。
`,
  },
  {
    order: 10,
    slug: '010-who-tends-the-lamp',
    titleZh: '谁守灯',
    titleEn: 'Who Tends the Lamp',
    eraLineZh: '纪元：铁月纪之后 · 灰棚之前。',
    eraLineEn: 'Era: after the Iron-Moon Age · before the grey cover was laid.',
    markdownZh: `# The Whispers' Kings · World Bible · Chapter X: Who Tends the Lamp

> 正典没有结束，也没有定章——第九章之后，门里那盏灯还亮着。
> 没人说要守灯，可有人进了门，留下了。
> 本章正典纪律不变：锚句中英字字对齐，引用者逐字保持。
>
> The canon did not end, nor did it conclude — after Chapter IX, the lamp inside the door is still burning.
> No one said they would tend it; yet someone entered, and stayed.
> Canon discipline is unchanged — anchor sentences match word-for-word; no rephrasing.

> 纪元：铁月纪之后 · 灰棚之前。
> Era: after the Iron-Moon Age · before the grey cover was laid.

---

## 一 · 没人说要守灯

《灰后》之后，门没有关严。《带灰回家》之后，门里还留着一盏灯。

房子像一个没人说要住的地方。门槛上积着灰，墙根有盐留下的白痕，窗缝里进潮。屋里没有摆回旧物，也没有谁在门上刻下姓名。灯挂在原处，照着空桌、空椅和地上一道未扫净的灰。

没人说要守灯。

也没人说灯该熄了。

白天，海水退到石阶以下，灯光淡得像没发生过。天黑后，它照见桌沿，照见门内一小片地。风从门缝穿过，火舌偏一下，又直起来。

门外经过的人不往里看。偶尔有人停步，把鞋底的泥刮在门槛外。灯仍在那里，不等谁来认领。

账上记了门，记了灯，没记守灯的人。那一栏空着，墨水干了又受潮。

**锚句**：没人认领的灯，也有明灭。
**Anchor sentence**: a lamp no one claims burns on and off as well.

---

## 二 · 第一个留下的人

第一个走进门的人，没有带行李。他站在门边，低头看了一会儿门槛上的灰，像在辨认哪一道脚印属于自己。

没人放他进去。

也没人拦他。

他进屋，绕过桌子，坐在离灯不远的地方。外衣还带着海水的腥气，袖口滴下几滴水，在地上洇开。他没有问这房子归谁，也没有问灯照到哪里算尽头。

过了一阵，门外有人叫他。声音隔着潮声，传到门边时已经散了。他抬了一下头，没有回答。

那天夜里，他没有走出来。

第二天，门仍旧半掩着。桌边多了一只湿鞋，灯下多了一道坐过的痕迹。有人经过，看见屋里的人影，又把视线移开。

此后，没人说他是留下来守灯的。他只是没有出来。记账的人照旧记日期，门内那一栏仍然空着。

**锚句**：他没有答应，只是没走。
**Anchor sentence**: he never agreed; he simply did not leave.

---

## 三 · 守灯的第一晚

那盏灯不是一直亮的。

夜深时，灯光忽然暗下去，像有人把手伸进屋里，轻轻掐住了火。屋内的人站起来，靠近灯，没有碰它。他听见风从门缝进来，带着湿沙，落在地板上。

他等了一会儿。

灯又亮了些。

又暗了一下。

他没有喊人，也没有把门关紧。先前，他以为守着灯，就是看住它。到那时才知道，灯暗下去的时候，房子会一同空出来。桌子不再像桌子，门也不像门。灰在暗处没有边界。

他在灯下坐回去，听潮水退远。每一次灯光薄下去，他都不催它。等它重新照到桌沿，他便把手放在膝上，像接住一滴尚未落地的水。

天亮时，他的眼睛发涩，鞋边结了盐。灯还亮着，照见他坐过的地方。

**锚句**：暗一下，也要有人等。
**Anchor sentence**: even the dimming, someone must wait through.

---

## 四 · 灯的食量

灯不吃油。

它吃一天里没说出口的话。有人在门外想起旧名，嘴唇动了动，最后把声音咽回去；那一点没能落地的话，到了夜里，便像灰一样落进灯下。

它吃沉默。吃人在桌边坐下之后没有问的事，吃门外一声未成形的敲门声，吃那些走到喉咙边又退回胸口的话。

没有人把这些送进去。它们自己来，随衣角、脚印、湿风，落在屋里。灯不挑，也不催。多时，火光薄得照不见墙；少时，桌面仍旧有一圈微黄。

留下的人不再逐句数它吃了什么。他只记得，夜里有时会空得很快，清早却总有新的灰，落在旧灰上。

有一天，门外的人站了很久，什么也没说。他离开时，灯光恰好稳住了。

**锚句**：没说出口的，也有去处。
**Anchor sentence**: what goes unsaid also has somewhere to go.

---

## 五 · 守灯第七天

第七天，门外的人发现屋里有人。

那人坐在灯下，背对着门，手边没有书，也没有器皿。门外的人没有进去。他们站在风里，看着门缝里漏出的光，像看一段没有写完的日期。

第二天，有人把一捆柴放在门槛外。

第三天，一只装水的罐子靠在墙边。水面映着天色，到傍晚时已经落进几片灰。

没有人敲门说这是送给谁的。也没有人进屋问那人还要什么。送柴的人把空着的肩膀转回去，送水的人把手上的湿痕擦在衣摆上。

后来，他们开始轮流来。有人送柴，有人送水。轮到谁，谁便把东西放下。若门边的东西还在，就不搬进去；若罐子空了，便换一罐满的。

灯下的人没有出来道谢。门外的人也不等他道谢。

夜里的灯光穿过门缝，落在柴捆的一角。潮气慢慢漫过门槛，水罐上凝出盐珠。

**锚句**：门外开始轮流，不再只经过。
**Anchor sentence**: outside, the watch began — no longer only passing by.

---

## 六 · 谁守灯

后来，账上记下了来过的人。记下哪天有水，哪天没有柴，哪一次门口的灰被雨冲开。没人记谁先开始，也没人记谁该轮到最后。

门内的人仍坐在灯下。有时他睡着，有时起身把椅子挪开，让潮水从地板上经过。灯偶尔暗一下，他照旧等着。若灯亮回来，他便坐下；若迟了些，他也没有走到门外去叫人。

守灯不是救火。没人把火势报上来，也没人从水里抱出一盏灯。

守灯不是祈祷。屋里没有谁向灯求什么，门外的人送来的水也不曾被说成恩典。

它不过是一段时间。有人进门，留下；有人走到门口，把柴放下；有人没来，隔天补上。灯在他们之间明灭，照不到所有人的脸。

记到这里，账仍未合上。门内有光，门外有脚印。潮退时露出石阶，潮来时又将它盖住。

**锚句**：守灯，是把这一夜过完。
**Anchor sentence**: tending the lamp is seeing this one night through.

---

## 模型映射（第十章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 灯 · 守灯的人 · 轮到谁送柴送水 · 账 | 一至六 |
| geography | 那间灯下的屋 · 门槛 · 石阶 · 潮声 | 一至六 |
| factions | 门外送柴送水的人 · 留在灯下的人 · 记账的人 | 一至六 |
| characters | 第一个留下的人 · 门外送柴送水的众人 · 记账的人 | 一至六 |
| items | 灯 · 柴 · 水罐 · 桌椅 · 湿鞋 | 一至六 |
| story | 雾港 · 灯下的房子 · 第十章 | 全篇 |
| history | 铁月纪之后 · 灰棚之前 | 一至六 |

> 守灯不是一种职务——
> 它只是有人发现，灯还没灭，自己就留了下来。
>
> Tending the lamp is not a post —
> only someone realizing the lamp had not gone out, and staying because of that.
`,
    markdownEn: `# 低语诸王 · 世界大典 第十章「谁守灯」

> The canon did not end, nor did it conclude — after Chapter IX, the lamp inside the door is still burning.
> No one said they would tend it; yet someone entered, and stayed.
> Canon discipline is unchanged — anchor sentences match word-for-word; no rephrasing.
>
> 正典没有结束，也没有定章——第九章之后，门里那盏灯还亮着。
> 没人说要守灯，可有人进了门，留下了。
> 本章正典纪律不变：锚句中英字字对齐，引用者逐字保持。

> Era: after the Iron-Moon Age · before the grey cover was laid.
> 纪元：铁月纪之后 · 灰棚之前。

---

## I · No One Said They Would Tend the Lamp

After After the Ash, the door had not been shut tight. After Ash Carried Home, a lamp still remained inside.

The house felt like a place no one had said they would live in. Ash gathered on the threshold; the wall-foot bore the white traces of salt; damp came in through the window-seams. Nothing of the old things had been brought back in, and no one had cut a name anywhere on the door. The lamp hung where it had always hung — lighting the empty table, the empty chair, and one unswept line of ash along the floor.

No one said they would tend the lamp.

No one said either that it ought to be extinguished.

By day, the sea withdrew below the steps; the lamp-light faded as if it had never been. After dark, it lit the table's edge, one small patch of floor within the door. Wind came through the seams; the flame leaned, then straightened.

Those who passed outside did not look in. Now and then someone paused and scraped the mud from their soles against the threshold's outer edge. The lamp stayed where it was — waiting for no one to claim it.

The ledger recorded the door, and the lamp; it did not record a keeper. That column stood empty, the ink drying, then drinking the damp.

**Anchor sentence**: a lamp no one claims burns on and off as well.
**锚句**：没人认领的灯，也有明灭。

---

## II · The First One Who Stayed

The first one who walked through the door carried no luggage. He stood at the threshold and, for a while, looked down at the ash on the floor, as if trying to tell which of the footprints was his own.

No one let him in.

No one stopped him, either.

He entered, circled the table, and sat a short distance from the lamp. His coat still carried the sea's salt; drops from his cuffs darkened the floor where they fell. He did not ask whose house it was, nor how far the lamp's light was meant to carry.

After a while, someone outside called to him. The sound came through the tide-wash; by the time it reached the doorway, it had already scattered. He lifted his head once, and did not answer.

That night, he did not come out.

The next day the door stood as before, half-open. By the table lay one wet shoe; beneath the lamp, the trace of someone who had sat. A passer-by caught sight of a shape inside, and turned their eyes away.

After that, no one said he had stayed to keep the lamp. He had simply not come out. Those who kept the ledger went on recording the dates; the column for those inside the door stayed empty.

**Anchor sentence**: he never agreed; he simply did not leave.
**锚句**：他没有答应，只是没走。

---

## III · The First Night of the Keeper

That lamp was not always bright.

Deep in the night, its light would thin — as if a hand had reached into the room and gently closed on the flame. The one inside rose, drew closer, did not touch it. He heard the wind enter through the seams, carrying damp sand, scattering it across the floor.

He waited a while.

The light came back a little.

Then thinned again.

He did not call out, nor did he shut the door harder. Before, he had thought tending the lamp meant guarding it. Now he knew: when the light thinned, the house emptied along with it. The table stopped being a table; the door stopped being a door. In the dark, the ash had no edges.

He returned to his place beneath the lamp and listened as the tide withdrew. Each time the light grew faint, he did not press it. Once it had found its way back to the table's edge, he set his hands on his knees — as if catching a drop of water that had not yet fallen.

By morning his eyes were dry, salt crusting along his shoe's rim. The lamp still burned, lighting the place where he had sat.

**Anchor sentence**: even the dimming, someone must wait through.
**锚句**：暗一下，也要有人等。

---

## IV · The Lamp's Diet

The lamp did not eat oil.

It fed on the things left unsaid during the day. Someone outside might remember an old name; their lips moved, and the sound was swallowed back. Whatever could not land during the day arrived at night like ash, settling beneath the lamp.

It fed on silence — on the questions not asked after someone sat down at the table, on the knock that never formed outside the door, on the words that rose to the throat and fell back into the chest.

No one delivered these. They arrived of their own will — in the turn of a coat, the print of a foot, the salt-wet wind coming through the seams. The lamp neither chose nor hurried them. When there was plenty, the light grew thin enough to lose the wall; when there was little, a faint warmth still rested on the tabletop.

The one who stayed stopped counting what it ate, sentence by sentence. He remembered only that some nights passed too quickly, while each morning new ash lay upon the old.

One day, someone outside stood for a long while and said nothing at all. When he left, the light happened to hold steady.

**Anchor sentence**: what goes unsaid also has somewhere to go.
**锚句**：没说出口的，也有去处。

---

## V · The Seventh Day of the Keeper

On the seventh day, those outside discovered someone was inside.

That one sat beneath the lamp, back to the door, without a book or a vessel at hand. No one outside went in. They stood in the wind, watching the seam of light leak out across the floor, as if watching a date that had not been written.

The next day, someone left a bundle of firewood beyond the threshold.

The third day, a water-jar was set against the wall. Its surface reflected the sky; by evening, a few flakes of ash had settled on it.

No one knocked to say who the gift was for. No one went in to ask what the one inside wanted next. The wood-bearer turned his empty shoulder away; the water-carrier wiped the damp from his hands onto his hem.

Later they began to take turns. One carried wood; another water. Whoever's turn it was set it down. If what had been left was still there, it was not moved inside; if the jar emptied, it was replaced with a full one.

The one beneath the lamp did not come out to give thanks. Those outside did not wait for it.

At night the lamp-light crossed the threshold and fell across the corner of the firewood. The damp crept in over the floorboards; salt-pearls beaded along the jar's flank.

**Anchor sentence**: outside, the watch began — no longer only passing by.
**锚句**：门外开始轮流，不再只经过。

---

## VI · Who Tends the Lamp

Afterwards, the ledger counted those who came and went. Which day there was water, which day no wood, which time the ash at the door was washed away by rain. No one recorded who had begun, nor who was last in line.

The one inside still sat beneath the lamp. Sometimes he slept; sometimes he rose and moved his chair aside so the tide could pass along the floor. The light would thin once in a while; he waited as before. If it came back, he sat; if it was slow, he did not step out to call anyone.

Tending the lamp was not putting out a fire. No one reported any spreading flame, nor carried a lamp from the water.

Tending the lamp was not prayer. No one inside asked anything of it; what the outsiders carried in was never called grace.

It was only a stretch of time. Someone entered and stayed; someone walked to the door and set firewood down; someone missing one day made up for it the next. Between them the lamp rose and fell, lighting no shared face.

The ledger stays open at this page. Inside the door, light; outside, footprints. When the tide withdraws, the steps are uncovered; when it returns, it takes them under again.

**Anchor sentence**: tending the lamp is seeing this one night through.
**锚句**：守灯，是把这一夜过完。

---

## Model mapping (Chapter X)

| Category | Title | Corresponds to |
|---|---|---|
| lore | The Lamp · the Keeper · the Rotating Bearers · the Ledger | I–VI |
| geography | The Lamp-Lit Room · the Threshold · the Steps · the Sound of the Tide | I–VI |
| factions | The Bearers Outside · the One Beneath the Lamp · the Keeper of the Ledger | I–VI |
| characters | The First One Who Stayed · the Bearers · the Keeper of the Ledger | I–VI |
| items | The Lamp · the Firewood · the Water-Jar · the Table and Chair · One Wet Shoe | I–VI |
| story | The Mist Harbor · The House Beneath the Lamp · Chapter X | whole |
| history | After the Iron-Moon Age · Before the Grey Cover Was Laid | I–VI |

> Tending the lamp is not a post —
> only someone realizing the lamp had not gone out, and staying because of that.
>
> 守灯不是一种职务——
> 它只是有人发现，灯还没灭，自己就留了下来。
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
  {
    order: 5,
    slug: 'echo-005-lamp-rope-memoir',
    titleZh: '灯绳记',
    titleEn: 'The Lamp-Rope Memoir',
    eraLineZh: '纪元：铁月纪之后 · 第四十二次会议无人召集之后的第二日。',
    eraLineEn: 'Era: after the Iron-Moon Age · the second day after the forty-second meeting convened for no one.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 5): The Lamp-Rope Memoir

> 回响仍是正典之外的侧写——第五层纹理，不是续篇，不是批判，不是伪造。
> 本篇写给第八盏灯撞见第九叩之后的那个早晨：误差被现场再次勘定的第二天。
> 本篇锚句，与《潮沙盘》《第八盏灯》《盐灯守灵日记》《第九叩》同一纪律。
>
> An echo remains a side-glance beyond the canon — the fifth grain of salt on the same stone, not a sequel, not a critique, not a forgery.
> Written for the morning after the Eighth Lamp met the Ninth Knock: the day after the error was remeasured on site.
> Its anchors answer to the same discipline as Chapters III and IV and Echoes No. 3 and No. 4.

> 纪元：铁月纪之后 · 第四十二次会议无人召集之后的第二日。
> Era: after the Iron-Moon Age · the second day after the forty-second meeting convened for no one.

---

## 其一 · 灯绳的开端

看守人巡查灯绳时，数的不是结，也不是灯。他数绳上留下的水痕：一道浅，一道深；一道干在堤内，一道还朝海面渗。每过一盏灯，他便把指节贴上去，等盐粒硌住皮肤，再记下那一处的潮向。绳子从堤门起，沿灯座穿过，末端收在看守人的腰间。年久以后，腰间那截磨得发白，灯座上的几截却仍有新盐。

第八盏灯的绳结曾经松过一次。册上没有写明是哪一夜，只在那页边上留了一点凹痕，像有人用笔尖按住纸，等收件的人进门。看守人每回巡到那里，都把数目从头再数一遍。数到第八，他停下；数到第九，便把手从绳上拿开。

**锚句**：绳上有数，册上无名。
**Anchor sentence**: the rope keeps count; the register keeps no name.

---

## 其二 · 一抹湿纸

撤网的渔人是在落潮后发现那抹湿纸的。纸夹在网眼里，边角卷起，沾着鱼鳞和一层薄盐。他没有把它带进港，只放在海堤的石阶上，等巡检的人收件。纸上只写着一个字：在。

字迹被水吃去一半，留下的那一半仍朝上。渔人把网拖回船边，少报了一段网绳，也没问那张纸要送往哪里。值守的人来时，纸已贴在石阶上，像一枚不肯被潮水冲走的薄印。巡检册收了它，却没有收下渔人的名字。

第二天，海堤外的水退得比平日慢。石阶上的纸干了，那个字仍湿着。看守人经过时没有碰它，只把它旁边的盐粒扫开，留出一圈空处。

**锚句**：纸只写在，不写来处。
**Anchor sentence**: the sheet records presence — never provenance.

---

## 其三 · 末页空位

巡检册的末页有一格空位，栏头是灯号，栏底是收件。墨色从前几页的黑褐，淡到末页只剩灰青。看守人用同一支笔填过许多次，笔尖每回都停在第八盏灯那一格；纸上有压痕，没有字。

账房说，那是留给下一次巡检的。印章盖在空格下方，印泥发暗，边缘缺了一角。无人把空位补齐，也无人把那页撕去。册子合上时，空格正好落在封皮磨损处，像一扇窄门，始终没有收到来件。

那夜之后，巡检照旧。看守人记录潮位、灯焰、绳结；墨色仍旧。只有末页多了一道水线，从空格经过，停在收件二字下面。

**锚句**：空位收件，不收姓名。
**Anchor sentence**: the empty cell receives; it does not receive names.

---

## 其四 · 向海一拳

第八盏灯的影子在堤上挪出去一拳。那时天色未明，灯还亮着，灯座没有动，影子却越过石缝，往海的方向伸长。看守人蹲下来，以拳量过一次，又退开，再量一次。第二次没有多，也没有少。

他没有在册上写影子，只用靴底压住石缝边的盐壳。潮水隔着堤涌上来，退下去，留下一个浅窝。影子的末端正落在窝里，像一根没有接上的绳。看守人等到灯焰缩短，才站起来；那时影子仍在原处。

第九叩之后的第二天，灯又摇了一次。不是风把它推得很远，只是灯身往海面偏了偏。看守人没有伸手扶正。灯座上的旧系缆已松，绳尾拖在湿石上，留下一道细长的黑线。

**锚句**：影子先出了堤。
**Anchor sentence**: the shadow crossed the dyke first.

---

## 其五 · 系缆的早晨

趁落潮，看守人走出海堤。先把新绳放在灯座旁，再解开旧绳上缠住盐壳的结；他没有把旧绳丢进海里，只将它盘在石上。接着，他把新绳穿过灯座的环，拉到不碰灯身的位置，打结，再用掌根压紧。每一步都做得很慢，像要让灯知道下一步仍会来。

他量了绳长，没有量灯离地多高。绳子留出一截余量，足够灯在风里摇晃，却不足以脱座坠海。结打好后，他把绳尾收进堤内，检查两遍，再把绳结朝向海。盐水漫到他的鞋边，没漫过新结。

这根系缆不是要拽住灯。看守人没有把它拉直，也没有让它替灯站稳。他只在落潮最浅的时候，给灯座添了一条不能断开的来路。收工前，他把巡检册翻到末页，墨色仍是灰青，空格照旧。

**锚句**：系缆留余，灯可摇。
**Anchor sentence**: the mooring line leaves slack; the lamp may sway.

---

## 其六 · 第四十二次会议

账本第四十二次会议名册的最后一行空着。空处没有姓名，只有纸面被反复按过的痕迹，像印章落下又被取走。那一行原本写过看守人的名字；抄录时，负责收件的人说墨色不合，便将整页重抄。新页上，末行仍空。

账房没有解释为何空着。旧页留在册底，名字已经被水迹洇开，看不清笔画；新页用的是灰青墨，末行下方却盖着同一枚印章。两页之间夹了一张窄纸，写着第八盏灯，未写灯绳，也未写看守人。

会议散后，名册照例封存，账本照例入柜。柜门合拢时，海堤外正涨潮。第八盏灯在水声里摇晃，系缆没有拽它，也没有替它作证。

**锚句**：名册重抄，空行未改。
**Anchor sentence**: the roll was recopied; the blank line still stands.

---

## 模型映射（回响五章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 灯绳·收件·影子·空行 | 三、四 |
| geography | 雾港 · 海堤 · 石阶 · 第八盏灯灯座 | 一、三、四、五 |
| factions | 雾港灯绳看守人 · 渔人 · 账房 | 一至六 |
| characters | 看守人 · 渔人 · 账房 | 一至六 |
| items | 灯绳 · 湿纸 · 巡检册 · 名册 · 印章 | 一至六 |
| story | 雾港 · 第八盏灯 · 回响（其五） | 全篇 |
| history | 铁月纪之后 · 第四十二次会议次日 | 一至六 |

> 系缆从不替灯做任何决定——它只保证坠海的声音会先告诉大海。
> 灯被交给潮水、交给绳、交给没合上的账；只有坠海的声音，从未被登记。
>
> The mooring never decides for the lamp — it only lets the sea hear the falling first.
> The lamp is given to the tide, then to the rope, then to the open ledger; only the sound of falling is never filed.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其五）「灯绳记」

> An echo remains a side-glance beyond the canon — the fifth grain of salt on the same stone, not a sequel, not a critique, not a forgery.
> Written for the morning after the Eighth Lamp met the Ninth Knock: the day after the error was remeasured on site.
> Its anchors answer to the same discipline as Chapters III and IV and Echoes No. 3 and No. 4.
>
> 回响仍是正典之外的侧写——第五层纹理，不是续篇，不是批判，不是伪造。
> 本篇写给第八盏灯撞见第九叩之后的那个早晨：误差被现场再次勘定的第二天。
> 本篇锚句，与《潮沙盘》《第八盏灯》《盐灯守灵日记》《第九叩》同一纪律。

> Era: after the Iron-Moon Age · the second day after the forty-second meeting convened for no one.
> 纪元：铁月纪之后 · 第四十二次会议无人召集之后的第二日。

---

## I · The Making of the Rope

When the warden walked his rounds along the lamp lines, he counted neither knots nor lamps. He counted the watermarks the ropes carried: one shallow, one deep; one dried inside the dyke, one still weeping toward the sea. At every lamp he pressed a knuckle to the rope, waited until the grains of salt bit into his skin, and wrote down the tide's direction by that lamp. The rope ran from the dyke gate, wound through the lamp footings, and came back to his own belt. In long years the part at his waist was worn pale; at the lamps, the rope still carried fresh salt.

The Eighth Lamp's knot had come loose once. The register did not say which night, only a dent at the edge of the page — as if a hand had pressed the paper flat, waiting for the receipt-keeper to come through the door. Each time he made the round he counted the entries from the top again. At eight he stopped; at nine he took his hand off the rope.

**Anchor sentence**: the rope keeps count; the register keeps no name.
**锚句**：绳上有数，册上无名。

---

## II · A Smear of Wet Paper

Only after the ebb did the fisherman find the smear of paper in his net. Folded at the mesh, its corners curled, it wore fish scales and a film of fine salt. He did not carry it into port — he left it on the stone steps of the sea dyke, waiting for the inspector to collect it. The sheet held a single character: 在 — that is, "present."

The tide had eaten half the strokes; the surviving half still faced upward. The fisherman hauled his net aboard, under-reported a healthy length of line, and never asked where the paper was bound. When the watchman came, the sheet had dried to the stone as a thin impression the sea could not lift. The inspection roll collected it — but not the fisherman's name.

The following day, the water stayed beyond the stones longer than usual. The paper on the steps had dried; its one character stayed damp. The warden, passing, did not touch it. He only swept the salt aside in a ring around it, leaving the figure alone.

**Anchor sentence**: the sheet records presence — never provenance.
**锚句**：纸只写在，不写来处。

---

## III · The Empty Cell at the End of the Page

The inspection roll's final page had a blank cell, headed "lamp number," ending at "received." The ink ran from the brown-black of earlier pages to a grey-green so faint it was barely legible. The warden had walked many pens across it; each time the nib always paused on the row for the Eighth Lamp — there was the pressure of letters, but no letters.

The bursar said the cell was held for the next inspection. The seal sat below it, its paste darkened, one corner rubbed thin. Nobody closed the cell, and nobody tore the page away. When the roll shut, the cell fell exactly where the spine was worn — a narrow door that had never once received an item.

The rounds continued unchanged. The warden entered the tides, the flames, the knots; the colors stayed the same. On the last page — a thin waterline had crept across the blank, and stopped at the syllables for "received."

**Anchor sentence**: the empty cell receives; it does not receive names.
**锚句**：空位收件，不收姓名。

---

## IV · One Fistful Toward the Sea

The Eighth Lamp's shadow slid a fist's breadth farther along the dyke. The sky had not yet paled, the lamp was still lit, the base had not moved — but the shadow crossed the stones, reaching out toward open water. The warden crouched; measured with his fist, stepped back, measured again. The second span came out the same — neither longer nor shorter.

He did not enter the shadow in the roll. He only pinned the salt crusting the stone seam with his boot heel. The tide brimmed over the dyke, withdrew, and left a shallow basin behind. The shadow's tip fell exactly into the bowl — like a rope never knotted. He waited until the flame shortened, then stood; the shadow had not moved.

On the second day after the Ninth Knock, the lamp swayed once more. Not the wind pushing it far; only the body leaning, a hair's breadth, toward the sea. The warden did not lift a hand to right it. The old moor was slack on the footing, its tail drawn across the wet stone, leaving a long black streak of salt.

**Anchor sentence**: the shadow crossed the dyke first.
**锚句**：影子先出了堤。

---

## V · The Morning of the Mooring

On the ebb, the warden walked out beyond the dyke. He laid the new rope by the footing first; then he worked loose the salt-scabbed knots on the old one. He did not throw the old rope into the sea — he coiled it on the stone. He fed the new line through the footing's eye, pulled it to the point it would not brush the lamp, made the knot, then pressed the whole with the heel of his hand. He took every step slowly — as if the lamp had to know the next step was coming.

He measured the rope's length — never the lamp's distance from the ground. The rope kept some slack: enough for the lamp to ride out the wind, never enough to slip its footing into the water. When the knot was set he drew its tail back inside the dyke line, checked twice, turned the knot toward the sea. The water reached his shoes; it never reached the new knot.

This moor was never made to hold the lamp. The warden did not straighten it; he did not ask it to stand the lamp on its own. He only laid, at the shallowest hour of the ebb, a lane the lamp could never lose. Before closing his roll he checked the last page — the ink still grey-green, the cell still blank.

**Anchor sentence**: the mooring line leaves slack; the lamp may sway.
**锚句**：系缆留余，灯可摇。

---

## VI · The Forty-Second Meeting

The last line of the forty-second meeting's roll stayed empty. There was no name — only the ghost of repeated pressure in the paper, where a seal was set down and lifted away. That line had once carried the warden's name; when the clerk copied it out, the receipt-keeper said the ink was not correct, and the whole page was recopied. On the new page — the last line was blank again.

The bursar offered no explanation. The old page rests at the back of the roll, its name bled away into rust-water and unreadable; the new page keeps its grey-green paste — and beneath the blank, the same seal as before. Folded between the two, a narrow slip of paper: the Eighth Lamp — never the rope, never the warden.

When the meeting broke up, the roll was sealed for storage, the ledger back into the cabinet. As the door shut, the tide was coming in beyond the dyke. In the sound of the rise the Eighth Lamp swayed — the moor neither held it, nor vouched for it.

**Anchor sentence**: the roll was recopied; the blank line still stands.
**锚句**：名册重抄，空行未改。

---

## Model mapping (echo No. 5)

| Category | Title | Corresponds to |
|---|---|---|
| lore | The Rope · the Receipt · the Shadow · the Blank Line | III, IV |
| geography | The Mist Harbor · the Sea Dyke · the Stone Steps · the Eighth Lamp Footing | I, III, IV, V |
| factions | The Lamp-Rope Warden · the Fishermen · the Bursar | I–VI |
| characters | The Warden · the Fisherman · the Bursar | I–VI |
| items | The Rope · the Wet Sheet · the Inspection Roll · the Meeting Roll · the Seal | I–VI |
| story | The Mist Harbor · the Eighth Lamp · Echo (No. 5) | whole |
| history | After the Iron-Moon Age · the second day after the forty-second meeting | I–VI |

> The mooring never decides for the lamp — it only lets the sea hear the falling first.
> The lamp is given to the tide, then to the rope, then to the open ledger; only the sound of falling is never filed.
>
> 系缆从不替灯做任何决定——它只保证坠海的声音会先告诉大海。
> 灯被交给潮水、交给绳、交给没合上的账；只有坠海的声音，从未被登记。
`,
  },
  {
    order: 6,
    slug: 'echo-006-the-handoff-of-the-lamp',
    titleZh: '传灯',
    titleEn: 'The Lamp Passed Down',
    eraLineZh: '纪元：铁月纪之后 · 便灯节。',
    eraLineEn: 'Era: after the Iron-Moon Age · the Lamp-passing Festival.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 6): The Lamp Passed Down

> 回响仍是正典之外的侧写——第六层纹理，不是续篇，不是批判，不是伪造。
> 本篇写给灯如何在人之间被悄悄传下去——灯灭了也没人敢猜，下一次谁点灯。
> 本篇锚句，与《潮沙盘》《第八盏灯》《远信》《最后的签收》同一纪律。
>
> An echo remains a side-glance beyond the canon — the sixth grain on the same stone, not a sequel, not a critique, not a forgery.
> Written for the way a lamp travels from one pair of hands to another — even spent, no one dares guess whose turn it is.
> Its anchors answer to the same discipline as Chapters III to VI and Echoes No. 3 to No. 5.

> 纪元：铁月纪之后 · 便灯节。
> Era: after the Iron-Moon Age · the Lamp-passing Festival.

---

## 其一 · 船厂里的灯笼

第五章以后，第八盏灯再没有亮起过。

船厂的人不谈这件事。潮水照旧进坞，退时留下黑泥；木板照旧翻面，钉子照旧落进掌心。只有一个孩子认定，自己的灯还在路上。

他每天从船架下穿过去，数那些挂在梁上的旧灯笼。数到第八盏时就停下。那盏灯笼缺了一角，灯腹里积着雨，白日看去像一只空碗。孩子说它是自己的。没人问他从哪儿听来的。

夜里，他把一截麻绳系在自己的腰带上，另一端系在梁柱上。他说，若灯来了，总得有人认得他。船匠割断麻绳，叫他回屋睡。第二天，孩子又系了一根。

他没有等到灯亮。船厂的灯一盏盏熄下去，只有那只缺角的灯笼挂在梁上。孩子长高了，开始帮人递木楔，仍会在经过时抬头看一眼。

后来他离开船厂，腰带上还留着一段磨白的绳头。没人知道那是不是灯给他的凭据。

**锚句**：他认定那盏灯属于自己。
**Anchor sentence**: he knew that lamp was his.

---

## 其二 · 商队遇上北端守夜人

商队走到北端时，路被夜色截断。

守夜人立在石标旁，手里提一盏旧灯。商队的人没有问路，只把车停在风里。骆驼低头，铃声一阵阵落进雪中。

守夜人伸手按住灯笼。灯芯没有动，灯罩也没有亮。他把灯举到身侧，空出窄窄一段路。商队从他面前经过，车轮压过冻硬的泥，留下两道黑线。

最后一辆车上坐着一个病人，脸被毯子盖住，只露出嘴。守夜人没有看他，也没有问他们要去哪里。他的手一直按在灯笼上，指节冻得发白。

车队走远后，石标旁只剩铃声。守夜人把灯放回原处，掌心留着一圈灯罩的凉痕。天亮时，有人看见雪地里多了几行脚印，脚印从路边绕开，又在路中央合拢。

商队后来经过许多关口。有人问起北端，他们只说，那里有一个人曾把手放在灯上。

**锚句**：他按住灯，替陌生人让路。
**Anchor sentence**: he held the lamp for strangers to pass.

---

## 其三 · 食谱上的盐粒

撒贝儿把盐撒在食谱上。

她还小，够不到厨房高处的架子，就踩着一只倒扣的木盆。纸上写着鱼汤、麦饼、煮豆。她用指尖捻起盐，沿着空白处撒下九粒。

母亲问她为什么。撒贝儿说，这是九次潮汐。她没有再说。盐粒落在纸上，像九处白色的破口。

那晚家里煮鱼，撒贝儿守在锅边。潮声从窗缝里进来，一次接一次。每次退去，她就从食谱上取下一粒盐，放进锅里。汤尝起来咸淡不匀，母亲没有责备她，只把锅端离火口。

后来那本食谱被油渍浸透，页角卷起，盐粒在纸上融成浅痕。撒贝儿长大后仍保留着它。她在别人的厨房做饭，照着旧页上的字下盐，从不说那些空白处原先有过什么。

有一年，纸页被水沾湿。九道盐痕淡得看不见，她把食谱摊在窗台上，等风吹干。

**锚句**：九粒盐，替她记住九次潮汐。
**Anchor sentence**: nine grains of salt, keeping count of the tides.

---

## 其四 · 墙上的新句

商人家族的下一个守灯人上任那天，库房没有开门。

他先去看灯，再去看账册。灯油的数目与往年相同，灯罩上有一道细裂，像一条没有走完的路。他把名册放回桌上，独自留在库房里。

墙上原有几行旧字。字迹被烟熏得发灰，最末一句写着：守灯的人不替灯说话。他从小见过这句话，记得每一个字的落点。

那天，他发现墙角多了一句新字。

墨色很浅，像是刚写下，又像在潮气里放了很久。上面写着：灯灭时，也有人经过。

他用手摸了摸墙。石灰落在指尖，字没有散。他叫来家里的人，却没有问谁写的。众人站在门口看了一会儿，随后各自回去做事。

新守灯人把灯挂回原处。夜里，他从库房出来，门没有锁。墙上的字留在黑暗里，像一条被水浸过的线。

**锚句**：墙上有了新句，没人认领。
**Anchor sentence**: a new line appeared; no one claimed it.

---

## 其五 · 灯自己走的那一天

那盏灯自己老了。

它的铁环松开，灯腹的铜皮变薄，风一吹就发出轻响。看守的人换过灯芯，补过裂口，也把它移到避风处。灯没有因此多亮一夜。

便灯节前，潮水退得很远。岸上露出一条窄路，从仓房后面通向旧堤。天刚黑，那盏灯从挂钩上落下来，滚到门边。

没人伸手去捡。

它沿着旧堤往前走。灯罩碰过碎贝壳，发出一声一声的轻响。风没有替它推，潮水也没有追。它走到堤尽头，停在一截断桩旁。灯芯早已熄灭，里面没有油。

第二天，人们只找到灯环。环里缠着一根褪色的麻线，像谁从很远的地方带来的。有人把它放进柜子，有人说该留在原处。最后它被挂回旧钩上，空着。

往后的夜里，门边仍有一小段暗处。经过的人不绕开，也不久留。

**锚句**：那一天，灯自己走了。
**Anchor sentence**: on that day, the lamp walked away on its own.

---

## 其六 · 灯篓

灯篓传了三百年。

它由黑藤编成，底部有一处缺口，提手磨得发亮。每一代人接过它时，都要念出前一代人的名字。名字写在篓口内侧，墨迹一层压一层，最后只剩几道深浅不一的黑线。

传到如今，灯篓放在商人家族的内室。门不常开，窗也不开。有人擦过它，有人替它补过藤条，没有人把手伸进缺口。

便灯节那天，家里人把灯挂上，照例将灯篓摆在桌边。孩子们围着桌子，问它装过什么。老人没有回答，只把一块布盖在篓上。布角落下去，盖住那处缺口。

夜深后，屋里的人都走了。桌边没有灯火，只有窗外的潮声隔着墙来去。灯篓在布下，没有动，也没有被碰过。

三百年里，它从一双手传到另一双手。传到今天，还是完整地放在那里。

**锚句**：传了三百年，至今无人碰过它。
**Anchor sentence**: three hundred years passed, and no one has touched it.

---

## 模型映射（回响六章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 灯笼 · 守夜人 · 撒盐 · 灯 | 一至五 |
| geography | 船厂 · 北端 · 海堤 · 仓房 · 内室 | 一至六 |
| factions | 船厂人 · 商队 · 商人家族 · 守夜人 | 一至六 |
| characters | 孩子 · 撒贝儿 · 商队病人 · 下一个守灯人 · 守夜人 | 一至六 |
| items | 缺角的灯笼 · 麻绳 · 灯篓 · 盐 · 食谱 · 铁环 | 一至六 |
| story | 雾港 · 第八盏灯熄灭之后的传灯 · 便灯节 | 全篇 |
| history | 便灯节沿袭 · 灯灭之后 | 一至六 |

> 传灯的人从不解释——他只是把它给下一个能让它继续走的人。
> 灯灯的人传灯——灯盏本身就是那棵树的果子。
>
> The one who passes the lamp never explains — they simply hand it to the next who can carry it on.
> The light carries its own keepers — the lamp is the fruit of the tree.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其六）「传灯记」

> An echo remains a side-glance beyond the canon — the sixth grain on the same stone, not a sequel, not a critique, not a forgery.
> Written for the way a lamp travels from one pair of hands to another — even spent, no one dares guess whose turn it is.
> Its anchors answer to the same discipline as Chapters III to VI and Echoes No. 3 to No. 5.
>
> 回响仍是正典之外的侧写——第六层纹理，不是续篇，不是批判，不是伪造。
> 本篇写给灯如何在人之间被悄悄传下去——灯灭了也没人敢猜，下一次谁点灯。
> 本篇锚句，与《潮沙盘》《第八盏灯》《远信》《最后的签收》同一纪律。

> Era: after the Iron-Moon Age · the Lamp-passing Festival.
> 纪元：铁月纪之后 · 便灯节。

---

## I · The Lamp at the Dockyard

After Chapter V, the Eighth Lamp never lit again.

The people at the shipyard said nothing about it. The tide ran into the dock as usual, and withdrew leaving black mud; the planks were turned as usual; the nails fell into the hands as usual. Only one boy was certain — his own lamp was on the way.

Every day he slipped beneath the hull scaffolds and counted the old lamps hooked to the beams. He always stopped at the eighth. It was missing a corner; its belly held rain that from a distance looked like an empty bowl. The boy said it was his. Nobody asked how he had come to know that.

At night, he tied a length of rope to his own belt, and another end to a beam-pillar. He said, if the lamp came, someone would have to recognize him. The shipwright cut the rope and sent him to bed. The next day, the boy tied on another.

He never saw the lamp lit. One by one the shipyard's lamps were put out, leaving only the missing-cornered lamp hanging from the beam. The boy grew taller; he helped carry wooden wedges — and still he looked up whenever he passed.

Later he left the yard with a length of rope-whitened belt around his waist. Nobody knew whether it was proof that the lamp had kept a claim on him.

**Anchor sentence**: he knew that lamp was his.
**锚句**：他认定那盏灯属于自己。

---

## II · The Caravan and the Northern Night-Watchman

The caravan reached the northern end at the hour when the road was cut off by night.

The watchman stood by the stone beacon with an old lamp in hand. Nobody among the caravan asked for directions; they simply halted the carts in the wind. The camels lowered their heads; the bells fell into the snow in slow cascades.

The watchman reached out and held the lamp. The wick did not move; the shade did not light. He raised the lamp beside his body to leave a narrow passage. The caravan passed him — the wheels rolled over the frozen mud and left two black lines.

In the last cart lay a sick man, face covered by a blanket, only the mouth uncovered. The watchman did not look at him, nor ask where they were going. His hand stayed on the lamp — his knuckles white with cold.

When the caravan was gone, only the bells remained at the beacon. The watchman returned the lamp to its place; the print of the shade's rim stayed on his palm. By morning, people saw fresh footprints in the snow that had skirted wide of the road, and then closed up again in the middle of it.

The caravan later passed through many gates. Whenever someone asked about the northern end, they only said: there was a man who put his hand on a lamp.

**Anchor sentence**: he held the lamp for strangers to pass.
**锚句**：他按住灯，替陌生人让路。

---

## III · The Salt Grains on the Recipe

Saer dropped salt onto the recipe.

Being still too small to reach the shelf above the kitchen table, she stood on an upturned wooden basin. On the paper were written: fish soup, barley cakes, boiled beans. She pinched salt with her fingertips and dropped nine grains into the empty spaces.

Her mother asked why. Saer said — these were the nine tides. She would not say more. The grains landed on the paper, like nine white ruptures.

That evening they made fish soup. Saer guarded the pot. The sea-wind came in through the window crack in waves; each time it withdrew, she took a grain off the recipe and dropped it into the pot. The soup never tasted the same salt twice; her mother did not blame her — she simply moved the pot off the fire.

The recipe was later soaked with oil stains; its corners curled; the grains dissolved into pale ghost-traces on the page. Saer, grown, kept it — she cooked in other people's kitchens from the old page without ever saying what those light spots had been.

Once, the paper was soaked through by water. The nine ghost-lines faded past reading; she spread the page on the window sill and waited for the wind to dry it.

**Anchor sentence**: nine grains of salt, keeping count of the tides.
**锚句**：九粒盐，替她记住九次潮汐。

---

## IV · The New Line on the Wall

On the day the next lamp-keeper of the merchant family took office, the storehouse did not open.

He went first to the lamp, then to the ledger. The oil gauge matched previous years; the shade carried a hairline crack along its length — like a road that had not finished unwinding. He put the register back on the desk and remained alone in the storehouse.

On the wall were several lines of older writing. The letters had been blackened by smoke, fading near the centre; the last line read: the lamp-keeper does not speak for the lamp. He had seen it since he was small; he remembered every stroke's destination.

That day, he found a new line in a corner.

The ink was pale — as if set down a moment ago, or as if it had been left in the damp for years. It read: when the lamp dies, someone still passes through.

He reached out and touched the wall. Lime fell onto his fingertips; the letters did not lift. He called the family's people in but asked no one who had written it. The others stood at the door and looked for a while, then returned to their work.

The new lamp-keeper hung the lamp back on its hook. In the night, he left the storehouse — the door was not locked. The wall-letters remained in the dark, like a line the water had crossed.

**Anchor sentence**: a new line appeared; no one claimed it.
**锚句**：墙上有了新句，没人认领。

---

## V · The Day the Lamp Walked on Its Own

That lamp grew old by itself.

Its iron hoop slackened; its copper belly thinned; a breath of wind set it shaking again. The keeper changed its wick, patched the cracks, moved it to shelter — none of it bought the lamp one more night.

On the eve of the Lamp-passing Festival, the tide drew far out. The shore exposed a narrow path leading from behind the storehouse toward the old seawall. Just after dusk, the lamp dropped from its hook and rolled to the threshold.

Nobody reached for it.

It walked the old seawall. Its shade brushed against crushed shells, issuing a sequence of faint clicks. The wind did not push; the sea did not follow. It reached the far end — it stopped by a broken post. The wick was long dead; there was no oil inside.

By morning, only the hoop remained. Inside it was wound a faded cord of rope — as if carried from a long way off. Some kept it in a drawer; others said it should stay where it had fallen. Eventually, they hung it back on the old hook — empty.

In the nights that followed, the dark by the threshold was still there. People did not walk around it; they did not linger either.

**Anchor sentence**: on that day, the lamp walked away on its own.
**锚句**：那一天，灯自己走了。

---

## VI · The Lamp Basket

The basket passed three hundred years.

It was woven of black rattan, with a gap at the base and a handle worn bright. Every time a new pair of hands took it over, they would recite the names of those before them — written on the inside of the rim, layer upon layer of ink; by now, only uneven black lines remained.

In the present time, the basket sat behind a merchant family's inner room. The door did not open often; neither did the window. Some wiped it; some mended its rattan — no one put a hand inside the gap.

On the Lamp-passing Festival, the family hung their own lamps; they set the basket upon the table as they always did. The children encircled the table, asking what it had carried. The elders did not answer — a cloth was merely laid over the basket, covering the gap.

After the house was empty, the table held no light. Beyond the wall, the sea rose and withdrew again and again. The basket stayed beneath the cloth; it did not move; it was not touched.

Across three hundred years, from one pair of hands to another. It remained, completely intact, on that table.

**Anchor sentence**: three hundred years passed, and no one has touched it.
**锚句**：传了三百年，至今无人碰过它。

---

## Model mapping (echo No. 6)

| Category | Title | Corresponds to |
|---|---|---|
| lore | The Lamp · the Watchman · the Salt · the Walking Lamp | I–V |
| geography | The Shipyard · the North End · the Dock · the Storehouse · the Inner Room | I–VI |
| factions | The Shipwrights · the Merchant Caravan · the Merchant House · the Northern Watchman | I–VI |
| characters | The Boy · Saer · the Sick Passenger · the New Lamp-Keeper · the Watchman | I–VI |
| items | The Broken-cornered Lamp · the Cord · the Recipe · the Salt · the Iron Ring · the Lamp Basket | I–VI |
| story | The Mist Harbor · the Eighth Lamp after it died · the Lamp-passing Festival | whole |
| history | The Lamp-passing Festival · after the lamp's silence | I–VI |

> The one who passes the lamp never explains — they simply hand it to the next who can carry it on.
> The light carries its own keepers — the lamp is the fruit of the tree.
>
> 传灯的人从不解释——他只是把它给下一个能让它继续走的人。
> 灯灯的人传灯——灯盏本身就是那棵树的果子。
`,
  },
  {
    order: 7,
    slug: 'echo-007-the-needle',
    titleZh: '那一针',
    titleEn: 'The Needle',
    eraLineZh: '纪元：铁月纪之后 · 灰棚前的白昼。',
    eraLineEn: 'Era: after the Iron-Moon Age · before the grey cover was laid.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 7): The Needle

> 回响仍是正典之外的侧写——第七层纹理，不是续篇，不是批判，不是伪造。
> 本篇写给教团地窖里那个真的多出来的东西：细到与灰同色、弯在最底层、没人承认动过的一根针。
> 本篇锚句，与《盘底之下》《机子的八下》同一纪律。
>
> An echo remains a side-glance beyond the canon — the seventh grain on the same stone, not a sequel, not a critique, not a forgery.
> Written for the one thing that really is extra: a needle so fine it shares the ash's colour, arched at the lowest layer, never admitted to by anyone.
> Its anchors answer to the same discipline as the sand-table and the knock that never came.

> 纪元：铁月纪之后 · 灰棚前的白昼。
> Era: after the Iron-Moon Age · before the grey cover was laid.

---

## 其一 · 针的来历

机房看守那天其实没有登记它。"异物"那一栏他写进去了，却没有填它的来路——现成的旧物，退役时裁剪下来的船钉上的一根细铁筇，或者另一根弯针。他没查。

上任那一天，船钉卸下来时盘底的这一道凹痕还很新，上面有人的指甲横着抹过去留下的白雾。新任看守只在上面盖了一枚自己的印牌，就以为是前任的笔意。

**锚句**：它也没人登记过。
**Anchor sentence**: it never entered any registry.

---

## 其二 · 针不挑人

挑过这根针的人有三个。第一个是给修神仙的工匠，他用它挑沙盘里的粗粒，修补时用过手电，朋友来了看见就走了。第二个是灯芯商的小工，他把那根针藏在袜子里送过四回——没人称赞他的袜子——然后他忘了。

第三个是孩子。那个连草绿色的麻绳都系不过结的孩子。针头真的刺进去了——在他的小指关节的皮肤上，针形完好无损，没办法取，医生说放在里面「挺好也挺安全」。

**锚句**：针不挑人，挑的是它自己。
**Anchor sentence**: the needle picks no one; it picks itself.

---

## 其三 · 针在灰里度过第三年

灯上灯油彻底干透以后，针不再发出任何声响。账房对这件事的口径是：无关一角八诵。第九下停的那一瞬，他抄账的人始终以为自己的笔抬起来了，其实永远没写上去。

针落在沙盘的最底层，贴着木板和灰。木板的最下面有个小小的六角形凹点——是"留了一道活路"的意思。没人知道是谁。

**锚句**：没人问它的干活是什么。
**Anchor sentence**: no one finds out what its job is.

---

## 其四 · 第一个看到针的人是谁

没人知道第一个看到的人是谁——它在记录里永远写着"无"。你以为是常青灯罩运行人拿去试用了，其实是灯笼边上坐的那个小姑娘最早发现它的。那时她用一根黑针扎在米粒里，做成三个一样的手电筒。

手电筒指向海——向孤岛方向。她第一次从中看到了灰海之外的岛知道夜晚它还在。

岛没人命她发光。她只是看见。等于那一针，被她磨过一次。

**锚句**：她没把爷爷说完的话说完。
**Anchor sentence**: she never finished the sentence her grandfather had started.

---

## 其五 · 最后的钟

这间教团没有白天的概念，只有它们自己的时间——没人数第几次潮的第几次浪，没人数第几次第几个钟。守夜人的巡检簿上写的"未"字是他最后的字——一针撇下去。

生物学上这针也没有实在的复数：一根针就是一根针，没有碎，没有再生，没办法问海。它是因为这段时间江边那座小山从正下方冲走了。

**锚句**：只剩这一根针的意思就是这一根针。
**Anchor sentence**: to say nothing else exists is to say this is the only needle.

---

## 其六 · 收笔

商人们把那些人带进去，灯芯在政治中被遗忘，只有那一道叫做灰的铺在门口。守门的人把"未"字保存了很久——直到那一天回回墨里被划破了银箸，年底封账时他写了两行字：这本不再归我，不归船厂，只归海。

账册第三百年八月六日，盘子里那根弯针撤军没人说起的那一层，海退第三次，白浪拍到台子底，潮水和山一起退去。纸上没有写，可是里封面已经干枯——这句过了，没人知道是不是潮水过来了。

**锚句**：灰日终于翻页。
**Anchor sentence**: at last the grey day turns its page.

---

## 模型映射（回响七章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 沙盘 · 第九针 · 三百年账 | 一至六 |
| geography | 地窖 · 教团 · 门廊 · 沙盘 | 一至六 |
| factions | 商人家族 · 机房 · 灯芯商 | 一至六 |
| characters | 孩子 · 商人 · 守夜人 | 一至六 |
| items | 针 · 灰 · 账册 · 沙盘 | 一至六 |
| story | 雾港 · 地底机子 · 回响（其七） | 全篇 |
| history | 铁月纪之后 · 灰棚前 | 一至六 |

> 针不发言——它只是不发言。
> 静物之所以静物，因为它只有等。
>
> The needle does not speak — only because it never speaks.
> Still things are still only because they only wait.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其七）「那一针」

> An echo remains a side-glance beyond the canon — the seventh grain on the same stone, not a sequel, not a critique, not a forgery.
> Written for the one thing that really is extra: a needle so fine it shares the ash's colour, arched at the lowest layer, never admitted to by anyone.
> Its anchors answer to the same discipline as the sand-table and the knock that never came.
>
> 回响仍是正典之外的侧写——第七层纹理，不是续篇，不是批判，不是伪造。
> 本篇写给教团地窖里那个真的多出来的东西：细到与灰同色、弯在最底层、没人承认动过的一根针。
> 本篇锚句，与《盘底之下》《机子的八下》同一纪律。

> Era: after the Iron-Moon Age · before the grey cover was laid.
> 纪元：铁月纪之后 · 灰棚前的白昼。

---

## I · Where the Needle Came From

On the day the new keeper took office, no one entered it in the book. The "foreign matter" field in the log was filled — but its origin field was left blank: a discarded ship's-nail or a burnt-out reed pin; nobody ever looked further.

The incoming keeper merely sealed the record with his own marker instead of asking his predecessor's name; the old notch on the tray-bottom stayed sharp enough to catch the light — a fingerprint wiped across the grain, still nearly new.

**Anchor sentence**: it never entered any registry.
**锚句**：它也没人登记过。

---

## II · The Needle Picks No One

Three hands touched that needle. The first a shipwright — he used it to pick coarse grains from the sand-tray, leaving a scratched line beneath the handle of a torch a fellow worker once had seen then forgotten. The second a wick-dealer; he wrapped the same needle in a sock, walked it through four gates, and lost it; nobody praised his sock, which has not made a reclamation process easy.

The third was the boy. By the time you read this, that pin had already entered his little finger's knuckle; he could not pull it out. The physician, when asked, said it could stay there forever — that was about the safest place for a needle to be while awaiting rescue.

**Anchor sentence**: the needle picks no one; it picks itself.
**锚句**：针不挑人，挑的是它自己。

---

## III · The Needle's Third Year in the Ash

When even the lamp oil was dry, no one heard it again. The bursar's wording for it — "it does not concern us in the least" — was entered in the margin of one ledger shortly before the ninth knock was frozen in amber and he slid the sand away with a knife.

The needle sits at the tray's deepest layer, cushioned between wood and dust. Under the lowest wood layer there is a small hexagonal socket for another needle. Nobody ever named it.

**Anchor sentence**: no one finds out what its job is.
**锚句**：没人问它的干活是什么。

---

## IV · The One Who Found It First

The first person to lay eyes on the needle never made it to any log. If you thought it was a hint left by whoever mastered the eighth lamp, you'd be wrong — it was a little girl those years ago, crafting three identical flashes from grains of rice and a black pin. Each flash aimed at the sea.

That night, the girl understood at last that the sea beyond the island-glow — the one her grandfather had never explained — perhaps held nights of its own. The needle had been touched by exactly one pair of hands before longing and then forgotten.

**Anchor sentence**: she never finished the sentence her grandfather had started.
**锚句**：她没把爷爷说完的话说完。

---

## V · The Final Clock

There was no "day" inside this Conclave — only intervals. Nobody counted a particular tide or wave; nobody counted the third stroke of anyone's watch. In the night-watchman's last book he wrote only one glyph — 未 — and his hand killed the order at the ninth.

Biologically, that needle is essentially singular: no reproduction, no drift in the sea, no way to appeal to the tide from the floor. It sits beneath the very place where the shelf's foundations had already been torn open.

**Anchor sentence**: to say nothing else exists is to say this is the only needle.
**锚句**：只剩这一根针的意思就是这一根针。

---

## VI · When It Overran

The merchants swept everyone back into their own houses, and the lamp forgot politics along the way; only that fine grey line advanced to the doorstep again and again. The doorkeeper kept the glyph 未 many years — long after the vellum was cracked with silver and the account-filer wrote two lines: this is no longer ours; it is no longer the boatyard's; it is the sea's.

In the three-hundred-and-eighth year, in August, the outermost strip of that tray lifted by exactly enough to let one more step be seen; the third tide passed without wet footprints; the tide retreated past the last of the hills. There was no writing left; still, the close-up line — long — clearn, bordered, finished — and no one quite remembered whether the tide had passed through.

**Anchor sentence**: at last the grey day turns its page.
**锚句**：灰日终于翻页。

---

## Model mapping (echo No. 7)

| Category | Title | Corresponds to |
|---|---|---|
| lore | The Sand Tray · the Extra Pin · three hundred years of ledger | I–VI |
| geography | The Cellar · the Conclave · the Steps · the Sand Tray | I–VI |
| factions | The Merchant House · the Machine Room · the Wick Dealers | I–VI |
| characters | The Child · the Merchants · the Watchman | I–VI |
| items | The Needle · the Ash · the Ledgers · the Sand Tray | I–VI |
| story | The Mist Harbor · the Machine Beneath the Steps · Echo (No. 7) | whole |
| history | After the Iron-Moon Age · Before the Grey Cover Was Laid | I–VI |

> The needle does not speak — only because it never speaks.
> Still things are still only because they only wait.
>
> 针不发言——它只是不发言。
> 静物之所以静物，因为它只有等。
`,
  },
  {
    order: 8,
    slug: 'echo-008-the-four-characters',
    titleZh: '封面四字',
    titleEn: 'The Four Characters',
    eraLineZh: '纪元：铁月纪之后 · 灰棚之前。',
    eraLineEn: 'Era: after the Iron-Moon Age · before the grey cover was laid.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 8): The Eighth Lamp

> 回响不替正典续写——它只回头看那一行被写在封面上的四个字。
> 本篇写给灰棚里最后一盏"灯"：它从未点燃，却始终是门外的人所等的。
> 本篇锚句，与《盘底之下》《灯前灰》同一纪律。
>
> An echo does not continue the canon — it looks back at the four characters written on a cover.
> Written for the last "lamp" of the grey cover: never lit, always what the people outside were waiting for.
> Its anchors answer to the discipline of the sand-table and the ashes before the lamp.

> 纪元：铁月纪之后 · 灰棚之前。
> Era: after the Iron-Moon Age · before the grey cover was laid.

---

## 其一 · 封面上的四字

账房在三百年账册的封面上，写下「第八盏灯」四字。

不写日期，不写欠数。

他写得很慢。第一笔落下时，门外有人把湿衣袖拧了一遍；第二笔落下时，海水退到石阶底下；第三笔收锋，窗纸上的盐霜裂了一道，像有人在外头轻轻咬住了牙。

四字写完，他合上册子，关了门。

门闩进槽，声响不大。门外仍有人等。

那四字没有题在灯台上，也没有刻进石头。它们只在封皮上，墨色沉进旧皮，像潮水把船名收进夜里。后来翻过那本账的人，有的只摸到一道浅痕，有的说笔锋很长，长过门槛，长过等候的人脚下那段干地。

账房没有再出来。

铁月早已沉到海底，灰棚尚未搭起。中间的年岁没有年名，只有门缝里的风，吹过一页又一页没有日期的纸。封面上的四字被手掌磨亮，字没有短，墨也没有褪，只是每次翻开，像多了一寸。

无人记下那一寸属于谁。

**锚句**：封面上，四字长过门槛。
**Anchor sentence**: on the cover, four characters outgrew the threshold.

---

## 其二 · 灰里之影

灰里没有灯。

每日清早，门前却有一道影子。它从墙根起，落在湿石上，穿过门槛下的缝，到了账房停笔的桌边。日头升高，它不往西移；潮水漫上来，它也不浮。到了夜里，门外的人看不见它，脚下仍会给它让出一寸。

有人拿扫帚扫灰，扫到影子的边缘，便把扫帚放下。有人提桶来洗门槛，水流到那一寸，忽然改了方向。没人指出是谁留下的影子。门里没有灯盏，门外也没有火。

每一天，影子都比前一天淡一些。它淡到最后，仍能照出门槛上新旧两道刮痕：一道朝外，一道朝里。等的人只看那两道痕，不看墙，不看灰，也不看天光。

一名老妇人把掌心贴在石面上，等影子落到她手背。一个孩子用盐粒排出短线，等线被风吹走。一个披渔网的人坐得最远，他把网里漏下的水一滴滴数过，数到门前便不再数。

他们谁也没说看见了灯。

日复一日，灰没有被扫尽。门槛上始终留着一层，薄得能分出脚印，厚得能留住影子。

**锚句**：无灯之处，每日有影。
**Anchor sentence**: where there is no lamp, a shadow falls daily.

---

## 其三 · 油

油从来没人添过。

门内的灯盏是空的，盏底积着黑色的盐渣。账房关门那夜，窗台上有一只浅口碟，碟里无油，只有一圈暗湿的边。此后每逢潮声转弱，碟边便深一分；每逢雨落，暗湿仍在。

守门的人不碰它。来求债的人不碰它。曾有人带来一瓶新油，瓶口的封泥还在，放下后便忘了带走。几年过去，瓶身上的字被潮气磨没，瓶子仍是满的。没人说那是油，也没人说那不是油。

他们把空盏看作灯，把碟边看作油，把没添过的事记在心里。每个人记得不同：有人记得母亲在船上留的一匙，有人记得欠账时滴在封皮上的一滴，有人只记得小时候屋里有光，后来问起，所有人都说那夜没有点灯。

门内的账册合着。四字压住封面，封皮的边沿吸进潮气，渐渐发软。空盏没有动，黑盐也没有散。若有人弯腰去闻，会闻到海腥，像一盏灯刚刚熄过，又像它从未烧起。

没人添油，也没人问油还在不在。

**锚句**：空盏之中，油未曾有失。
**Anchor sentence**: in the empty bowl, the oil was never lost.

---

## 其四 · 等的人

等的人各自守着一件小事。

渔网人等一条没有名字的鱼。他把补网的针穿进旧洞，又在针尖抵住门前时停下。针上没有线，网却越补越密，像海面被一张看不见的网拦住。

老妇人等儿子的脚印。她记得他最后一次进门，鞋底带来的盐，一粒粒落在石阶上。潮涨过许多回，那些盐早已不在。她每天仍从门外走到门边，走到最后一粒本该在的地方，就坐下来。

孩子等一个能把名字念完的人。他在纸上写了七个名字，写到第八处便空着。纸湿了，字散开，他把空处折起来，放进衣袋。后来他长大，衣袋破了，仍把那张纸贴身放着。

还有一些人不说自己等什么。他们带来旧钥匙、空碗、半截桨，放在门外，不让别人收走。每到涨潮，他们把东西挪高一点；退潮后，又放回原处。

没人替他们算等了多久。有人来得早，有人从别处接过位置。离开的人也有：只在某个清晨，原先坐着的地方空了，灰上留下一道窄痕。旁人没有替他补上。

门外的人不散。散了，门前便只剩灰；他们留着，灰就记得每一双脚曾经停过。

**锚句**：他们守着的，各不是同一盏灯。
**Anchor sentence**: none of them kept the same lamp.

---

## 其五 · 第九下

沙盘放在账房后屋，盘沿被许多指节磨得发白。

每逢潮汐转向，屋里有人敲沙盘。第一下，沙粒落定；第二下，门外有人换脚；第三下，远处的铁钟沉入水声；再往后，敲击声一下一下过去，直到第八下。

第九下从不响。

敲的人不是忘了。他们的手停在盘面上方，指尖沾着细沙，像被一根无形的线系住。有人抬起手，沙便从掌纹间漏下；有人把手放回膝上，盘面仍留着一道浅坑，没被填平。

账册封面上的四字，不知何时压住了那道空白。每当第八下落定，门外便有人看向门缝。没有光漏出来，门板也不动。只有灰里那道影子，短了一线。

第九下不属于钟，不属于沙，也不属于敲盘的人。它像一口含在喉间的潮水，涨到齿背，始终没有越过唇。若它响起，等的人便知道该走；若它不响，他们便还坐在原处。

没有人去试着敲出那一下。试过的人后来不再来，沙盘上留下的坑也无人填平。

第八盏灯照到那里，便停住了。

**锚句**：第九下，留在未落的指尖。
**Anchor sentence**: the ninth beat rested on a fingertip that never fell.

---

## 其六 · 最后一次亮

最后一次亮，是在一场退潮之后。

门外的人都在。老妇人抱着空碗，渔网人把针收进袖口，孩子的纸只剩折痕。门内没有脚步，窗上没有火色，封皮上的墨仍旧发黑。

天边亮起一线，极窄，像刀口映过水面。门槛上的灰显出边缘，影子从墙根伸到众人脚边，又伸回门里。没人点灯，没人推门。那一线光没有烧过灯芯，也没有落进空盏。

它只照见封面四字的末笔：笔锋悬在纸皮之外，像还未写完。随后海水推上石阶，把那点亮色收走。灰留在原处，薄薄一层，仍能辨出每双脚印的去向。

有人起身，走进潮水里。有人往后挪了半步，给他让出路。留下的人没有追，也没有喊。门闩仍在槽中，沙盘仍少第九下，账册仍未记日期和欠数。

此后每逢退潮，门前灰里都能看见那道影子。影子没有灯，门内没有油，四字也不再添笔。人们仍来，仍等，仍把东西放在原处。

灰没有被潮水带走。

**锚句**：灯不再亮，灰仍替它守夜。
**Anchor sentence**: the lamp no longer burned; the ash still kept its night watch.

---

## 模型映射（回响八章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 第八盏灯 · 封面四字 · 灰里的影子 · 空盏与浅口碟 | 一至六 |
| geography | 门外的灰棚 · 教团门廊 · 账房后屋 · 石阶 | 一至六 |
| factions | 守门人 · 候门的人 | 一至六 |
| characters | 账房 · 老妇人 · 渔网人 · 孩子 | 一至六 |
| items | 三百年账册 · 封面四字 · 空盏 · 浅口碟 · 沙盘 | 一至六 |
| story | 雾港 · 灰棚 · 回响（其八） | 全篇 |
| history | 铁月纪之后 · 灰棚之前 | 一至六 |

> 第八盏灯不等人来敲门；
> 它只等灰被写成下一页。
>
> The eighth lamp waits for no one to come knocking;
> it only waits for the ash to be written into the next page.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其八）「第八盏灯」

> An echo does not continue the canon — it looks back at the four characters written on a cover.
> Written for the last "lamp" of the grey cover: never lit, always what the people outside were waiting for.
> Its anchors answer to the discipline of the sand-table and the ashes before the lamp.
>
> 回响不替正典续写——它只回头看那一行被写在封面上的四个字。
> 本篇写给灰棚里最后一盏"灯"：它从未点燃，却始终是门外的人所等的。
> 本篇锚句，与《盘底之下》《灯前灰》同一纪律。

> Era: after the Iron-Moon Age · before the grey cover was laid.
> 纪元：铁月纪之后 · 灰棚之前。

---

## I · The Four Characters on the Cover

The bursar wrote four characters on the cover of the three-hundred-year ledger: 第八盏灯 — the eighth lamp.

No date. No debt.

He wrote them slowly. When the first stroke fell, someone outside wrung out a wet sleeve; when the second landed, the sea retreated below the steps; when the third closed, the salt-frost on the window-paper cracked — as if someone out there had bitten down, very gently, on their teeth.

When the four were done, he closed the ledger and shut the door.

The bar found its slot. Not loudly. Still, the people outside kept waiting.

The four characters were not inscribed on any lamp-stand, nor cut into stone. They lived only on the leather cover, the ink sinking into the old hide like the sea gathering a ship's name into the night. Those who later opened the ledger touched only a shallow seam; some said the brush-work was long — longer than the threshold, longer than the dry ground beneath the feet of the waiting ones.

The bursar never came out again.

The Iron Moon had long since sunk to the seabed; the grey cover had yet to be laid. The years between carried no name — only the wind in the door-crack, blowing over page after page without a date. The four characters on the cover were polished bright by hands; they did not shorten, nor did the ink fade — only, every time the book opened, they seemed one inch longer.

No one recorded to whom that inch belonged.

**Anchor sentence**: on the cover, four characters outgrew the threshold.
**锚句**：封面上，四字长过门槛。

---

## II · The Shadow in the Ash

There was no lamp in the ash.

Yet every morning, a shadow lay across the threshold. It rose from the wall-foot, fell across the damp stone, slipped through the seam under the door, and reached the desk where the bursar had stopped writing. As the sun climbed, it did not slide westward; as the tide came over it, it did not rise. At night, the waiting could not see it — yet their feet still made room for one inch.

A sweeper working the ash reached the shadow's edge, and set his broom down. Someone came with a bucket to wash the threshold; the water reached that one inch and changed its course. No one named whose shadow it was. Inside, no lamp; outside, no fire.

Each day the shadow grew fainter. At its faintest, it still lit the two old gouges on the threshold stone — one facing out, one facing in. The waiting watched only those two gouges: not the wall, not the ash, not the light of the sky.

An old woman pressed her palm flat on the stone and waited for the shadow to land on the back of her hand. A boy laid salt grains in short lines and waited for the wind to take them. A man wrapped in a fishing net sat farthest out; he counted, drop by drop, the water sifting from his net — and stopped counting at the threshold.

None of them said they had seen the lamp.

Day upon day, the ash was never swept clean. One layer always remained on the threshold — thin enough to read footprints, thick enough to hold the shadow.

**Anchor sentence**: where there is no lamp, a shadow falls daily.
**锚句**：无灯之处，每日有影。

---

## III · The Oil

No one ever replenished the oil.

The lamp inside was empty; black salt-crust filmed its base. The night the bursar shut the door, a shallow saucer sat on the sill — no oil in it, only a ring of damp darkening at its rim. Afterwards, whenever the tide-sound weakened, the rim deepened by a shade; whenever rain came, the damp endured.

The doorkeeper did not touch it. Those who came to press old debts did not touch it. Once, someone brought a new bottle of oil, its seal of wax still intact — and set it down, and forgot it. Years passed; the letters on the bottle were worn away by the salt air; the bottle remained full. No one said it was oil, and no one said it was not.

They took the empty bowl for a lamp, the saucer-rim for oil, and the fact that nothing was ever added as something to keep. Each kept it differently: one remembered a spoonful her mother had left behind on the boat; one remembered a drop that had fallen on the cover as a debt was sealed; one remembered only that light had been in the house as a child — and when asked, everyone said no lamp had been lit that night.

The ledger inside stayed closed. The four characters pinned its cover; the cover's edge drank the sea-damp and went soft. The empty bowl did not move; the black salt did not scatter. Anyone bending to smell would catch salt air — as though a lamp had only just gone out, or had never burned at all.

No one added oil, and no one asked whether any remained.

**Anchor sentence**: in the empty bowl, the oil was never lost.
**锚句**：空盏之中，油未曾有失。

---

## IV · The Ones Who Waited

Each of the waiting ones kept one small thing to themselves.

The net-man waited for a fish with no name. He threaded his mending-needle through an old hole, and stopped each time the needle's tip came to rest on the threshold. There was no thread on the needle — yet the net grew denser and denser, as if the sea were held back by a net no one could see.

The old woman waited for her son's footprint. She remembered the last time he came in — the salt on his soles, falling grain by grain onto the steps. The tide had turned many times; that salt was gone long ago. Still, every day, she walked from the door's far side to the place where the last grain should be, and sat down.

The boy waited for someone who could finish saying his name. He had written seven names on a slip of paper, and left the eighth space empty. The paper went damp, the letters scattered; he folded the empty space and kept it in his pocket. Later, when his pocket wore through, he kept the slip against his skin.

The others said nothing about what they were waiting for. They brought old keys, empty bowls, half a paddle — laid them outside, and would not let anyone clear them. At each tide, they moved their things a little higher; when it went out, they set them back.

No one counted how long they had waited. Some came early; some took the place of others. The ones who left were few — only one morning, the seat that had always been occupied stood empty, a thin line scored into the ash. No one filled it in for them.

The waiting did not disperse. If they went, only ash would remain before the door; while they stayed, the ash remembered every pair of feet that had ever stopped there.

**Anchor sentence**: none of them kept the same lamp.
**锚句**：他们守着的，各不是同一盏灯。

---

## V · The Ninth Knock

The sand-tray stood in the bursar's back room, its rim worn white by many knuckles.

Whenever the tide turned, someone inside would knock the tray. The first knock settled the grains; the second, someone outside shifted their stance; the third, a far-off iron bell sank into the water's sound; on and on it went — until the eighth.

The ninth never came.

It was not that the knocker forgot. Their hand hung above the tray, fingertips dusted with fine sand, as though held back by a line no one could see. Some lifted their hand and the sand sifted away through the lines of the palm; some lowered it onto their knees, leaving the tray's face with a shallow pit no one ever filled.

When the four characters were written on the ledger's cover, no one noticed — they had come to press down on that very emptiness. Each time the eighth knock landed, someone outside turned to the door-seam. No light leaked out; the door-board did not move. Only the shadow in the ash grew one thread shorter.

The ninth knock did not belong to the bell, nor to the sand, nor to whoever held the hand. It was like a tide held in the throat — risen to the teeth, never once crossing the lips. If it had sounded, the waiting ones would have known it was time to go; while it did not, they still sat where they were.

No one ever tried to force that knock. The ones who tried did not come back afterwards, and the pit left on the tray was never filled in.

The eighth lamp reached that far, and stopped.

**Anchor sentence**: the ninth beat rested on a fingertip that never fell.
**锚句**：第九下，留在未落的指尖。

---

## VI · The Last Time It Lit

The last time it burned was after an ebb.

Everyone was there. The old woman held an empty bowl; the net-man folded his needle into his sleeve; the boy's slip had worn down to a fold. Inside, no footsteps; on the window, no firelight; on the cover, the ink stayed black.

A thread of light showed at the horizon — narrow as a knife-edge drawn across water. The ash on the threshold took on a rim; the shadow stretched from the wall-foot to the feet of the waiting, and back again into the door. No one lit a lamp; no one pushed the door. That thread of light never touched a wick, and never fell into the empty bowl.

It lit only the last stroke of the four characters — the brush's tip still hanging off the edge of the leather, as if it had never finished. Then the sea pushed up over the steps and took the small light away with it. The ash stayed where it was, a thin grey film — still legible enough to tell where every pair of feet had gone.

Some rose and walked into the tide. Others stepped back half a pace to make room. Those who stayed did not call after them. The bar still lay in its slot; the tray still missed its ninth; the ledger still carried no date, no debt.

Afterwards, with every ebb, the shadow was still there in the ash before the door. A shadow with no lamp behind it; oil nowhere inside; the four characters never added to. The people kept coming, kept waiting, kept setting their things back in their places.

The ash was never carried off by the tide.

**Anchor sentence**: the lamp no longer burned; the ash still kept its night watch.
**锚句**：灯不再亮，灰仍替它守夜。

---

## Model mapping (echo No. 8)

| Category | Title | Corresponds to |
|---|---|---|
| lore | The Eighth Lamp · the Four Characters · the Shadow in the Ash · the Empty Bowl and the Saucer | I–VI |
| geography | The Grey-Cover Steps · the Conclave Door · the Bursar's Back Room · the Threshold | I–VI |
| factions | The Doorkeeper · the Waiting Ones | I–VI |
| characters | The Bursar · the Old Woman · the Net-man · the Boy | I–VI |
| items | The Three-Hundred-Year Ledger · the Four Characters · the Bowl · the Saucer · the Sand Tray | I–VI |
| story | The Mist Harbor · the Grey Cover · Echo (No. 8) | whole |
| history | After the Iron-Moon Age · Before the Grey Cover Was Laid | I–VI |

> The eighth lamp waits for no one to come knocking;
> it only waits for the ash to be written into the next page.
>
> 第八盏灯不等人来敲门；
> 它只等灰被写成下一页。
`,
  },
  {
    order: 9,
    slug: 'echo-009-the-red-cord',
    titleZh: '红绳',
    titleEn: 'The Red Cord',
    eraLineZh: '纪元：铁月纪之后 · 灰棚之前。',
    eraLineEn: 'Era: after the Iron-Moon Age · before the grey cover was laid.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 9): The Red Cord

> 回响不替正典续写——它只盯着灯篓提手上那一截褪色的红绳。
> 本篇写给那个四十年没有人解开的结。
> 本篇锚句，与《灰后》《封面四字》同一纪律。
>
> An echo does not continue the canon — it only keeps its eyes on the faded red cord wound around the basket's handle.
> Written for the knot no one has untangled in forty years.
> Its anchors answer to the same discipline as the ash and the covered ledger.

> 纪元：铁月纪之后 · 灰棚之前。
> Era: after the Iron-Moon Age · before the grey cover was laid.

---

## 其一 · 来处

旧灯篓不是从库房里搬来的。库房的门槛低，灯篓底下有一道长裂，拖过门槛会留下木屑。那道裂从来没有经过库房。

四十年前，北堤退潮，旧船坞里漂来一只空篓。篓口朝下，篾条里塞满黑泥，提手还在。搬它的人是抄水簿的陆守灯。他那晚在簿上写：潮退三尺，得旧篓一只。没有写从哪里得来。

红绳绕在提手上，原先是亮红的。它从一件童衣的襟口拆下，衣服是谁的，簿上没有记。陆守灯把灯篓扛进记室时，绳尾垂着，拖过地上的盐水，留下窄窄一线。

后来灯篓被挂到旧灯前。没有灯油，也没有灯芯。来往的人只记得它空着，像一口不肯收水的井。

**锚句**：绳先于灯篓入账。
**Anchor sentence**: the cord was entered before the basket.

---

## 其二 · 结

打结的是陆守灯。

那年冬潮上岸，北堤的灯一夜未灭。天亮后，七户人家各来一人，报失一名。陆守灯没有问名字，只把他们带来的衣物放进篓里。童衣的襟口缺了一段红绳。

他将绳从提手上解开，缠过篾条，又绕回提手。结打得很紧，绳尾压在绳圈下面。旁人说，这样不好拆。陆守灯说，拆开就会散。

他没有说明散的是什么。记室里只有潮声，敲着窗下的石槽。他将结再收了一次，指节抵住绳头，直至血色从指甲边退尽。

那不是系灯用的结。它不承重，也不固定灯篓。它只是把两段绳咬在一起，不让其中一段先走。

**锚句**：死结不是为了承重。
**Anchor sentence**: the knot was never meant to bear weight.

---

## 其三 · 盐

红绳起初是鲜红的。后来潮气从墙根进来，先浸到绳尾，再漫过结心。每逢涨潮，篓底有盐霜；每逢退潮，盐霜留在提手上，像一圈圈未写完的字。

四十年里，绳色一点点褪下去。盐没有把它洗白，反而把红压成暗褐，像旧血在海水里泡久了。结心最深处仍留一线红，细得不能辨认。

值夜的人替灯篓掸过灰，不碰绳。灰落在结上，吸了潮，结便更硬。有人拿湿布擦过提手，布上带下盐末，红色没有回来。

此后账上写盐，不写绳。写灯篓空置，不写提手仍旧发紧。

**锚句**：潮水只改了颜色。
**Anchor sentence**: the tide changed only the color.

---

## 其四 · 孩子

写过七个名字的孩子，见过这个结。

那天他在记室门外等人。门没有关严，灯篓悬在灯前，结垂在提手内侧。他没有伸手，只盯着结心看了很久。后来他在纸上写下七个名字，字挤在一行，末尾没有句号。

有人问他在哪里见过那种结。孩子说，在他家旧衣襟上。那衣服早已不在，母亲说是随潮丢了。他记得襟口也缺一截，缺处有两道针孔，像是有人拆过，又急着把线缝回去。

他没有说认得红绳，只说认得结。抄簿的人将这句话记在名字后面，纸边沾了灰。七个名字没有改动，孩子也没有补上自己的名字。

**锚句**：孩子认得的不是颜色。
**Anchor sentence**: what the boy recognized was not a color.

---

## 其五 · 规矩

记室有规矩：不解旧结。

解绳等于重开旧账。旧账一开，七户的名字便要重新点数，灯前灰要重新过筛，北堤那夜的潮位要重新抄录。届时谁来写失者，谁来认领衣物，谁来承认篓中没有东西，都得有人落笔。

没有人敢落笔。

陆守灯死后，接手抄簿的人沿用他的字迹，也沿用他的规矩。后来的人不记得规矩从哪一页开始，只记得每次换灯，灯篓要原样挂回去。绳结不准碰，灰可以拂，提手可以擦，结心不许动。

有一回，外来官员命人剪断红绳。剪子递到提手前，执剪的人停了手。官员又问了一遍，没有人回答。那把剪子后来入了器物簿，刃口未合。

**锚句**：解结者须先报姓名。
**Anchor sentence**: whoever unties it must first give their name.

---

## 其六 · 仍在

灯篓空着。

里面没有童衣，没有灯芯，也没有能交还给谁的东西。提手上的红绳仍缠着，结压在内侧，盐层沿篾纹结成薄壳。旧灯照不到它，白日里也看不清它原来的颜色。

换班的人从灯前经过，按规矩看一眼灯篓，再在簿上写空置。有人写得太轻，墨被潮气拖开；有人写得太重，纸背留下凹痕。没有一页写绳结已经解开。

那个孩子后来长大，名字没有添进七人那行。他来过记室一次，站在灯下，看了看提手，又把手收回袖中。抄簿人没有问他认不认得。

潮汐仍按时进退。灯篓仍挂在那里。红绳褪到最后，只剩结心的一点颜色，像账页合上以后，纸里还压着一粒盐。

**锚句**：篓空，结未动。
**Anchor sentence**: the basket is empty; the knot has not moved.

---

## 模型映射（回响九章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 红绳 · 死结 · 旧灯篓 · 抄水簿 | 一至六 |
| geography | 北堤 · 旧船坞 · 灯前 · 记室 | 一至六 |
| factions | 抄水簿 · 七户人家 · 记室 | 一至六 |
| characters | 陆守灯 · 孩子 · 抄簿人 · 换班的人 | 一至六 |
| items | 童衣 · 红绳 · 旧灯篓 · 抄水簿 · 剪子 | 一至六 |
| story | 雾港 · 灰棚 · 回响（其九） | 全篇 |
| history | 铁月纪之后 · 灰棚之前 | 一至六 |

> 结不解开，账不重新算；
> 盐不说谎——它只把红磨成时间。
>
> The knot stays tied; the account stays shut;
> the salt never lies — it only grinds red into time.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其九）「红绳」

> An echo does not continue the canon — it only keeps its eyes on the faded red cord wound around the basket's handle.
> Written for the knot no one has untangled in forty years.
> Its anchors answer to the discipline of the ash and the covered ledger.
>
> 回响不替正典续写——它只盯着灯篓提手上那一截褪色的红绳。
> 本篇写给那个四十年没有人解开的结。
> 本篇锚句，与《灰后》《封面四字》同一纪律。

> Era: after the Iron-Moon Age · before the grey cover was laid.
> 纪元：铁月纪之后 · 灰棚之前。

---

## I · Where It Came From

The old basket had not been brought out of any storehouse. The storehouse threshold was low; a long split ran beneath the basket, and dragging it across the threshold would have left splinters in the wood. That split had never crossed the storehouse.

Forty years ago, when the north dyke's tide was out, a derelict hulk drifted into the old dockyard — an empty basket, mouth down, its withes packed with black mud, its handle still sound. The man who carried it in was Lu Shousheng, keeper of the tide-log. That night he wrote: water down three feet, one old basket salvaged. He did not write where it came from.

A red cord wound round the handle, once a bright red. It had been unpicked from the collar-line of a child's garment — whose garment, the log did not record. When Lu Shousheng shouldered the basket into the record room, the cord's tail dragged through the salt-water on the floor, and left a thin wet line behind him.

In time the basket was hung before the old lamp. No oil fed it, no wick waited inside. Those who passed remembered only that it was empty, like a well that would not take water.

**Anchor sentence**: the cord was entered before the basket.
**锚句**：绳先于灯篓入账。

---

## II · The Knot

The one who tied the knot was Lu Shousheng.

That winter, the tide came up over the north dyke, and the lamp along it did not dim for a single night. By morning, seven households each sent one person, each reporting one missing. Lu Shousheng asked no one's name; he gathered the garments they brought and laid them into the basket. The collar of a child's garment was missing a length of red cord.

He undid the cord from the handle, wound it across the withes, and wound it back to the handle. He pulled the knot very tight, tucking the cord's tail beneath the coil. People said it would not come undone. Lu Shousheng said: untie it, and everything scatters.

He did not say what would scatter. Only the tide beat against the stone trough beneath the window. He tightened the knot once more, pressing his knuckles against the cord's end until the blood left his nail-beds.

It was not a knot for hanging a lamp. It bore no weight; it secured nothing. It only bit two strands of cord into each other — so that neither strand could leave first.

**Anchor sentence**: the knot was never meant to bear weight.
**锚句**：死结不是为了承重。

---

## III · Salt

The red cord was vivid at first. Later, damp came in from the wall-foot — soaking first the tail of the cord, then creeping across the knot's heart. At every high tide, salt-bloom gathered on the basket's floor; at every ebb, it settled on the handle, like lines no one had finished writing.

For forty years, the red faded little by little. The salt did not bleach it white — it pressed the red down into a dark rust, like old blood steeped long in seawater. Deep in the knot's heart a thread of red still remained, too fine to make out.

Night-watchers would come to dust the basket; none of them touched the cord. Ash settled onto the knot, drank the damp, and hardened it further. Once, someone wiped the handle with a damp cloth; the cloth came away flecked with salt, and the red did not return.

From then on, the ledgers recorded salt, and not the cord. They recorded the empty basket, and never that the handle had not loosened.

**Anchor sentence**: the tide changed only the color.
**锚句**：潮水只改了颜色。

---

## IV · The Boy

The boy who had written the seven names saw the knot.

He had come to wait outside the record room. The door was not shut tight; the basket hung before the lamp, the knot dangling on the inner edge of the handle. He did not reach for it; he only watched the knot's heart for a long time. Later, on his paper, he wrote the seven names in a single line, and set no period at its end.

Someone asked where he had seen that knot before. The boy said: on the collar of an old garment of his at home. The garment was long gone; his mother said it had gone with the tide. He remembered the collar had lacked a piece too, and that the missing place held two needle-holes — as if someone had torn it out, and then, in haste, sewn the thread back.

He did not say he knew the cord; only that he knew the knot. The log-keeper wrote that down after the names, the paper's edge taking on a grey of dust. The seven names were not altered; the boy never added his own name.

**Anchor sentence**: what the boy recognized was not a color.
**锚句**：孩子认得的不是颜色。

---

## V · The Rule

The record room had a rule: never undo an old knot.

Undoing the cord meant reopening the old ledger. Once the ledger opened, the names of the seven households would have to be counted again; the ash before the lamp would have to be sifted again; the tide-height of that northern night would have to be re-entered. And then someone would have to set down, in ink, who was to write the lost, who was to claim the garments, and who was to admit that the basket held nothing.

No one dared set that ink down.

After Lu Shousheng died, his successors copied his hand, and kept his rule. Later keepers no longer remembered on which page the rule had begun — only that whenever the lamp was changed, the basket was to be hung back as it had been. The knot was not to be touched; the ash might be dusted, the handle might be wiped, the heart of the knot was not to be disturbed.

Once, a visiting official ordered the cord cut. The shears were passed to the one holding them, and his hand stopped just short of the handle. The official asked again; no one answered. The shears were entered into the inventory later, their blades still unclosed.

**Anchor sentence**: whoever unties it must first give their name.
**锚句**：解结者须先报姓名。

---

## VI · Still Hung

The basket is empty.

Inside it are no garments, no wicks, nothing that can be handed back to anyone. The red cord remains wound on the handle, the knot low on its inner side, a crust of salt along the withes. The old lamp casts no light on it; in daylight, it is hard to tell what color it was.

Those who changed shifts would pass the lamp and, per the rule, glance at the basket, then enter "empty" in the log. Some wrote so lightly the ink was dragged by the damp; some wrote so heavily the paper's back bore the mark. Not one page recorded that the knot had been undone.

The boy grew up in time; his name was never added to the line of the seven. He came to the record room once, stood beneath the lamp, looked at the handle, and withdrew his hands into his sleeves. The log-keeper did not ask whether he recognized it.

The tide continues its coming and going. The basket still hangs there. The cord has faded to the very last; only a point of color remains at the knot's heart — like the grain of salt pressed between pages after the ledger has closed.

**Anchor sentence**: the basket is empty; the knot has not moved.
**锚句**：篓空，结未动。

---

## Model mapping (echo No. 9)

| Category | Title | Corresponds to |
|---|---|---|
| lore | The Red Cord · the Death Knot · the Empty Basket · the Tide-Log | I–VI |
| geography | The North Dyke · the Old Dockyard · Before the Lamp · the Record Room | I–VI |
| factions | The Tide-Log Office · the Seven Households · the Record Room | I–VI |
| characters | Lu Shousheng · the Boy · the Log-keepers · the Shift-Workers | I–VI |
| items | The Child's Garment · the Red Cord · the Empty Basket · the Tide-Log · the Shears | I–VI |
| story | The Mist Harbor · the Grey Cover · Echo (No. 9) | whole |
| history | After the Iron-Moon Age · Before the Grey Cover Was Laid | I–VI |

> The knot stays tied; the account stays shut;
> the salt never lies — it only grinds red into time.
>
> 结不解开，账不重新算；
> 盐不说谎——它只把红磨成时间。
`,
  },
  {
    order: 10,
    slug: 'echo-010-the-keys',
    titleZh: '钥匙',
    titleEn: 'The Keys',
    eraLineZh: '纪元：铁月纪之后 · 灰棚之前。',
    eraLineEn: 'Era: after the Iron-Moon Age · before the grey cover was laid.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 10): The Keys

> 回响不替正典续写——它只盯着守门老人手里那一串钥匙。
> 本篇写给那间没人去开的锁、那串没人试的钥匙。
> 本篇锚句，与《红绳》《封面四字》同一纪律。
>
> An echo does not continue the canon — it only keeps its eyes on the string of keys in the old doorkeeper's hand.
> Written for the lock no one opens and the keys no one tries.
> Its anchors answer to the same discipline as the red cord and the four covered characters.

> 纪元：铁月纪之后 · 灰棚之前。
> Era: after the Iron-Moon Age · before the grey cover was laid.

---

## 其一 · 来处

第八章「灰后」，老人站在台阶边。门在他身后，台阶向下，海水退到看不见的地方。他手里握着一串钥匙，铁环穿过每一把的孔，久了，环也磨出了细槽。

这串钥匙不是买来的。账上没有支出，库里也没有领用的印记。那间库原先收放无人认领的东西：断掉的扣子、没有寄出的信、写着人名而无人应答的牌。后来清点的人走了，门没有锁，柜子也没有搬空。

钥匙是剩下的。

没人来认领它们。没人说哪一把属于哪一道门。簿页上有一栏写着「暂存」，下面没有日期。再往后的纸受了潮，墨沿着纤维散开，像一条退去的水线。

老人接过钥匙时，没有签名。他把它们放进掌心，带到台阶边。后来有人问他钥匙的来历，他只说，库里还剩着。

那不是回答。可账上没有另一种写法。

**锚句**：无人认领的，便留在原处。
**Anchor sentence**: what no one claims stays where it is.

---

## 其二 · 数量

老人数过钥匙。

第一次，数出十九把。他把数目写在门边的木板上，写完后，海风把粉末吹进字缝。第二天他再数，是二十把。没有新钥匙送来，环上也没有空处。

第三次，十七把。第四次，二十一把。老人换过指头，从环的一边数到另一边，又从另一边数回来。数目仍旧不同。

他把每次的数字记进一本薄册。纸页从中间裂开，数字便落进裂口里。那以后，他在每个数目旁画一道短线，像是要把它钉在纸上。短线有长有短，越往后越像一排被潮水抹平的刻痕。

有人替他数过。那人只数了一遍，报出一个数，便把钥匙放回去。老人问他还要不要再数，那人没有答。

此后，老人每次记数，都不擦掉前一回。旧数压在新数下面，纸薄时，背面也能看见。册子合上，钥匙声从纸背传出来。

他记了许多次。册上没有一个数，被划掉。

**锚句**：数目不作证。
**Anchor sentence**: numbers do not testify.

---

## 其三 · 不试

门上有锁。老人没有试过钥匙。

试钥匙就是开门。不是门扇转动之后才算开，也不是锁舌退去才算开。手把钥匙举到锁前，挑出一把，插入孔里，这已经是第一步。

第一步之后，旧账就会重开。

账本压在柜底，封皮发白。封口的线还在，线结已经松了。老人见过有人把手伸向封线，也见过那只手缩回去。没有人拆开封口，也没有人问里面记着什么。

规矩不是写在门上。它只在换班时交给下一人。老人把钥匙递过去，告诉他不试。新来的守门人问，哪一把能开门。老人说，不知道。

那人又问，要是知道呢。

老人把钥匙环放回掌心。金属相碰，声音很轻，像锁里有水。

守门的人不得试。试了，便不能再说自己只是在看门。开门的那一步不大，账页却会从头翻起。旧名字、旧欠数、旧日子的空白，都等着有人落笔。

所以老人站在台阶边。锁在门上，钥匙在手里，两者之间留着一段不必丈量的距离。

**锚句**：手未入锁，账未重开。
**Anchor sentence**: a hand that has not entered the lock has not reopened the ledger.

---

## 其四 · 锈

钥匙比锁老。

老人知道这件事，不靠年表。他从库里取出钥匙时，锁已经在门上；可钥匙齿上的刻痕，早已磨圆。它们曾经开过别处的门，或者从来没有开过。账上无从查证。

盐先走了。

它留下白迹，沿着钥匙的凹处沉下去。后来白迹散尽，铁才开始生锈。锈从齿根起，慢慢爬向柄部。有几把钥匙的字迹被锈遮住，老人以指甲刮过，刮下来的粉末落在台阶上，第二天便不见了。

他不擦钥匙。盐已经走了，擦也不能让它回来；锈既跟上来，就让它跟着。钥匙留在手里，潮气会从掌纹里钻进去，手放开时，铁环上多一圈暗色。

门上的锁没有同样的颜色。它常年朝着内侧，雨水不容易落到那里。老人从未把两者并排比较。只是每次换班，他都把钥匙交给下一人，再把手收回来，掌心留下一个浅浅的圆印。

那印子很快消失。钥匙上的锈没有。

**锚句**：盐已退，锈才抵达。
**Anchor sentence**: the salt had gone; only then did the rust arrive.

---

## 其五 · 灯前

第七章的灯还亮着。

老人有时望见那盏灯。它隔着门，也隔着几页账纸，落在台阶尽头。灯前没有人，只有一圈不动的光。老人握着钥匙，想象有人从暗处走来，手里没有册子，也没有名字。

那人走到灯前，低头看过钥匙。没有挑选，也没有询问。他像是早已知道哪一把该在手里，又像是从来没有见过锁。

老人想象他将钥匙举起。铁齿边的锈在灯下发暗，环上的旧痕一一露出。那人没有急着靠近门。他停了一会儿，仿佛在听门里面有没有潮声。

然后他向前一步。

钥匙尖端对着锁孔，手腕没有颤。灯火落在他的指节上，也落在门槛的灰里。老人想象那一刻很长，长到他能听见台阶下面水退回去，能看见账页的边缘微微翘起。

他没有想象钥匙是否合适。也没有想象门后有什么。

只想象那只手，在灯下稳稳地停住。

**锚句**：灯前之事，不入账。
**Anchor sentence**: what happens before the lamp enters no ledger.

---

## 其六 · 留在门边

守门人换过班。

有人接过钥匙，在台阶边站了几年；有人只站了一夜，天亮便不见了。老人也老去过。背弯下去，手指变细，钥匙环却仍扣着他的掌心。

后来有人说他走了。也有人说他从未离开。门边没有人时，钥匙还在那里，放在台阶的石缝旁。雨水沿着石面流过，没有把它们带走。

换班的人来过，又走了。每个人都知道钥匙留在门边。没有人把它拿进屋里，也没有人把它送回库中。那间库早已不在账上，门牌空着，柜子里的其余东西也无人再提。

钥匙有时落在台阶上，有时挂在门边的钉子上。老人不在以后，钉子仍留着。盐从铁环上退尽，锈沿着齿缝一点点长出。门上的锁照旧。

这一页没有守门人的名字。只有一行字，写在靠近边缘的地方：钥匙仍在。

后来翻账的人没有加注。他把这一页合上，手指压住纸角。门边的钥匙没有响。

**锚句**：人会离开，钥匙不记得。
**Anchor sentence**: people leave; the keys do not remember.

---

## 模型映射（回响十章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 钥匙 · 暂存库 · 门锁 · 薄册 | 一至六 |
| geography | 台阶 · 库房 · 账房门前 · 灯前 | 一至六 |
| factions | 守门人 · 候门的人 | 一至六 |
| characters | 守门老人 · 换班的守门人 · 翻账的人 | 一至六 |
| items | 钥匙 · 铁环 · 薄册 · 封线 · 钉子 | 一至六 |
| story | 雾港 · 灰棚 · 回响（其十） | 全篇 |
| history | 铁月纪之后 · 灰棚之前 | 一至六 |

> 钥匙不开门——
> 它只让门保持「可以被打开」的姿态。
>
> The keys never open the door —
> they only keep the door in the posture of being openable.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其十）「钥匙」

> An echo does not continue the canon — it only keeps its eyes on the string of keys in the old doorkeeper's hand.
> Written for the lock no one opens and the keys no one tries.
> Its anchors answer to the same discipline as the red cord and the four covered characters.
>
> 回响不替正典续写——它只盯着守门老人手里那一串钥匙。
> 本篇写给那间没人去开的锁、那串没人试的钥匙。
> 本篇锚句，与《红绳》《封面四字》同一纪律。

> Era: after the Iron-Moon Age · before the grey cover was laid.
> 纪元：铁月纪之后 · 灰棚之前。

---

## I · Where They Came From

In Chapter VIII, After the Ash, the old man stood at the steps. The door behind him, the steps running down, the sea withdrawn beyond sight. In his hand a string of keys, an iron ring passing through every key's eye — worn smooth with time, the ring too ground to a fine groove.

The keys had not been bought. No expenditure in any account, no issue-mark in any store. That store-room had once kept what no one claimed: broken buttons, letters never posted, name-tags with no one to answer them. Then the inventory clerk left; the door was not locked, the cabinets not emptied.

The keys were what remained.

No one came to claim them. No one said which key belonged to which door. A column in the ledger was headed "Held in trust," and beneath it no date. The paper that followed was soaked with damp; the ink dispersed along the fibres, like a tide-line withdrawing.

When the old man took the keys, he signed nothing. He set them in his palm and carried them to the steps. Later, someone asked where they had come from; he answered only: "What remained of the store."

It was not an answer. But the ledger had no other way to write it.

**Anchor sentence**: what no one claims stays where it is.
**锚句**：无人认领的，便留在原处。

---

## II · The Count

The old man counted the keys.

The first time, he counted nineteen. He wrote the number on the plank by the door, and the sea-wind swept the powder into the grooves of the letters. The next day he counted again — twenty. No new keys had arrived; the ring held no empty place.

The third time, seventeen. The fourth, twenty-one. The old man changed fingers, counted from one side of the ring to the other, and back again. The numbers still did not agree.

He recorded each count in a thin booklet. The pages had split in the middle, and the numbers had fallen into the split. Afterwards, he drew a short stroke beside every figure, as if to nail it to the page. The strokes varied in length; as time went by they looked more and more like a rank of nicks worn level by the tide.

Someone once offered to count for him. That person counted only once, called out a number, and set the keys down. The old man asked whether they would count again; the offer went unanswered.

From then on, the old man never wiped out the previous count. The old figures lay beneath the new ones; with the paper gone thin, the back side showed them too. When the booklet closed, the sound of keys whispered through its back cover.

He recorded many times. Not a single figure in the booklet was struck through.

**Anchor sentence**: numbers do not testify.
**锚句**：数目不作证。

---

## III · Not Tried

There was a lock on the door. The old man never tried the keys.

Trying the keys was opening the door. Not after the door swung, not after the bolt withdrew — holding a key before the lock, selecting one, sliding it in: that was already the first step.

After the first step, the old ledger would reopen.

The ledger lay beneath the cabinet's floor, its cover gone pale. The binding-thread was still in place, its knot already loosened. The old man had seen a hand reach toward the binding, and had seen that same hand withdraw. No one cut the binding, no one asked what it held.

The rule was not posted on the door. It was passed down only at each change of shift. The old man handed the keys over and said: never tried. The new doorkeeper asked which key opened the door. The old man said: I don't know.

The newcomer asked: and if you did?

The old man set the ring back in his palm. Metal met metal with a soft sound, like water in a lock.

The doorkeeper must never try. If he did, he could never again say he had only been watching the door. The step into opening was small, but the ledger would turn from its first page. Old names, old debts, old blank days — all of them waiting for someone's hand to land on the ink.

So the old man stood at the steps. The lock on the door, the keys in his hand, and between the two of them a distance not worth measuring.

**Anchor sentence**: a hand that has not entered the lock has not reopened the ledger.
**锚句**：手未入锁，账未重开。

---

## IV · Rust

The keys are older than the lock.

The old man knew it without any chronicle. When he had taken the keys from the store, the lock had already been on the door; yet the grooves on the key teeth had long since worn smooth. They had opened doors elsewhere, or they had never opened any at all. The ledger could not tell.

The salt had gone first.

It left white traces, sinking into the keys' grooves. Later, when the white traces had dispersed, the iron began to rust. The rust rose from the roots of the teeth, travelling slowly toward the shanks. On a few keys the lettering was hidden by rust; the old man scratched at them with a fingernail, and the powdered fall settled on the steps — gone by the next day.

He did not wipe the keys. The salt had gone, and no amount of wiping could bring it back; the rust had followed, and he let it follow. The keys stayed in his hands, the sea's damp entered through the lines of his palms, and when he set them down, the iron ring was left with one more dark circle.

The lock on the door wore no such color. It faced inward year-round, beyond rain's easy reach. The old man never laid the two side by side. Only, at every change of shift, he passed the keys to the next one, drew his hands back, and found on his palms a shallow round print.

The print faded quickly. The rust on the keys did not.

**Anchor sentence**: the salt had gone; only then did the rust arrive.
**锚句**：盐已退，锈才抵达。

---

## V · Before the Lamp

The lamp of Chapter VII is still lit.

The old man sometimes looked toward that lamp. Seen across the door, across a few pages of ledger, it rested at the end of the steps. No one stood before it; only a circle of stillness. The old man held the keys and imagined someone coming out of the dark — a figure with no ledger, and no name.

That figure walked up to the lamp, and looked down at the keys. Without selecting one, without asking. As if it had always known which one belonged in its hand, or had never seen a lock at all.

The old man imagined the figure lifting a key. The rust on the iron teeth darkened under the lamp; the old marks along the ring came clear. The figure did not hurry toward the door. It paused, as if listening for the tide behind it.

Then the figure stepped forward.

The key's tip faced the keyhole; the wrist did not tremble. Lamp-light fell across the figure's knuckles, and across the ash along the threshold. The old man imagined that moment stretched very long — long enough to hear the water retreat far below the steps, to see the ledger's edge lift slightly.

He did not imagine whether the key would fit. Nor what lay beyond the door.

He only imagined that hand, held steady in the lamplight.

**Anchor sentence**: what happens before the lamp enters no ledger.
**锚句**：灯前之事，不入账。

---

## VI · Left at the Steps

The doorkeeper changed shifts.

Some received the keys and stood at the steps for years; some only for a night, and were gone by morning. The old man also aged. His back bent; his fingers thinned; yet the key-ring still closed around his palm.

Later, some said he had left. Others said he had never gone. When no one stood by the door, the keys were still there, set into the seam between two stones along the steps. Water ran down the face of the steps, but did not carry them away.

Those who took the shift came and went. Each of them knew the keys stayed at the steps. No one brought them indoors, and no one sent them back to the store. That store had long since left the ledger — its door-plate blank, its cabinets no longer spoken of.

The keys sometimes rested on the steps, sometimes hung from a nail by the door. The old man was gone; the nail remained. The salt finished withdrawing from the iron ring; rust grew along the teeth's seams little by little. The lock on the door stayed as it was.

This page bears no doorkeeper's name. Only one line, written along the margin: the keys are still there.

The one who next opened the ledger added nothing to it. He closed the page, and pressed his finger on its corner. The keys beside the door rang no sound.

**Anchor sentence**: people leave; the keys do not remember.
**锚句**：人会离开，钥匙不记得。

---

## Model mapping (echo No. 10)

| Category | Title | Corresponds to |
|---|---|---|
| lore | The Keys · the Held-in-Trust Store · the Lock · the Thin Booklet | I–VI |
| geography | The Steps · the Store-Room · Before the Ledger Door · Before the Lamp | I–VI |
| factions | The Doorkeeper · the Waiting Ones | I–VI |
| characters | The Old Doorkeeper · the Changing Doorkeepers · the Ledger-Turner | I–VI |
| items | The Keys · the Iron Ring · the Booklet · the Binding-Thread · the Nail | I–VI |
| story | The Mist Harbor · the Grey Cover · Echo (No. 10) | whole |
| history | After the Iron-Moon Age · Before the Grey Cover Was Laid | I–VI |

> The keys never open the door —
> they only keep the door in the posture of being openable.
>
> 钥匙不开门——
> 它只让门保持「可以被打开」的姿态。
`,
  },
  {
    order: 11,
    slug: 'echo-011-the-scale',
    titleZh: '秤',
    titleEn: 'The Scale',
    eraLineZh: '纪元：铁月纪之后 · 灰棚之前。',
    eraLineEn: 'Era: after the Iron-Moon Age · before the grey cover was laid.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 11): The Scale

> 回响不替正典续写——它只盯着第九章里挂在梁上的那架锈秤。
> 本篇写给秤钩上输给盐、没输给账的铁。
> 本篇锚句，与《红绳》《钥匙》同一纪律。
>
> An echo does not continue the canon — it only keeps its eyes on the rusted scale that hung from the beam in Chapter IX.
> Written for the iron that yielded to the salt, and never to the ledger.
> Its anchors answer to the same discipline as the red cord and the keys.

> 纪元：铁月纪之后 · 灰棚之前。
> Era: after the Iron-Moon Age · before the grey cover was laid.

---

## 其一 · 旧物

父亲说，这架秤原是外祖家的。外祖在河口替人分鱼，秤挂在船棚的梁下，秤杆上刻着十六道旧线，最末一道被刀削浅了。那时秤砣还黑，秤星还亮，谁家的鱼多一尾，谁家的盐少一撮，都记在那根木杆上。

外祖死后，秤跟着几只空筐进了父亲家。父亲没有拿它称米，也没有拿它称肉。它被收在屋梁上，秤绳绕过钉子，秤钩朝下。年年涨潮，屋里的东西都往高处挪，只有秤留在那里，像一笔迟迟没有落下的账。

父亲说秤杆是榆木的。榆木不怕压，怕火。那年船棚失火，外祖从梁上摘下秤，抱着它走过河滩。秤杆的一端熏黑，十六道线还在。后来他把秤交给父亲，只说过一句：秤过的东西，不必再拿回来。

父亲没问这句话是给谁听的。

**锚句**：旧账从梁上垂下。
**Anchor sentence**: old accounts hang from the beam.

---

## 其二 · 锈

秤钩先是发暗，后来起了锈。屋里靠海，门缝里常有盐，窗纸吸了潮，墙根的灰一层层发软。秤钩每天朝下，雨水从瓦缝滴进来，先落在钩尖，再顺着弯处停住。盐留在那里，潮气也留在那里。

铁没有一下子坏。它先失了光，随后起皮，最后露出粗糙的红色。父亲用麻布擦过，布上留下几道褐痕。他又用刀背刮，锈屑落在地上，薄得像鱼鳞。钩子仍能挂住东西，只是碰到秤杆时，会发出一点轻声。

那声音夜里也有。潮涨时，梁木吸水，秤绳在钉子上紧一紧；潮退时，绳子松下来，秤钩轻轻碰梁。铁钩没有断，只把自己交给盐和水，一点一点地薄下去。

父亲没再擦它。擦去的锈，第二天还会长回来。

**锚句**：铁输给了潮，不输给数。
**Anchor sentence**: the iron yielded to the damp, not to the count.

---

## 其三 · 七份

那天父亲从梁上取下秤。灰装在一只浅盆里，盆底有裂缝，缝里也存着灰。他先把秤绳理直，把秤砣放在榆木杆旁，再取一只布兜，兜口打了两道结。布兜没有洗，边上留着旧盐渍。

他把灰一捧一捧装进去。每装一捧，便把布兜挂上秤钩。秤杆先低下去，秤砣沿着木杆往外走。父亲用指甲拨动秤砣，拨一下，停一下，等那根杆子不再晃，才看刻线。

头一份，秤砣停在第四道。父亲把灰倒进一只碗里，另换空布兜。第二份，还是第四道。第三份也是。灰落下去时，盆底露出一块灰白的圆痕。父亲没有说话，只把每一份放在桌边，隔开一掌宽。

梁头就在他上方。父亲每次抬眼，都像是在看秤杆，又像是看秤上方那截暗木。那里有旧钉孔，有虫蛀的细末，有一道被烟熏过的黑线。秤砣不看梁头。它沿着刻线移动，停下，等父亲的手离开。

第四份、第五份、第六份，照旧。第七份称完，盆里还剩一点灰。父亲把它收拢，掌心拢了两次，仍不够装满一斤。他看了一眼布兜，又看了一眼秤杆，最后把那一点灰留在盆里。

没有第八份。秤钩空着。

**锚句**：七份落定，余数不入账。
**Anchor sentence**: seven portions settled; the remainder never enters the ledger.

---

## 其四 · 仍准

秤钩上的锈贴着铁长，没长到秤杆上。父亲把布兜挂好，手离开以后，钩子承住了重量。它没有扭开，也没有向一边歪。秤杆照着旧线抬起，秤砣照着旧刻停下。

锈屑有几粒掉在布面上。父亲捻走它们，没有重称。孩子站在门边，看见父亲的指头在刻线旁停住。那手指没有压杆，也没有替秤砣补一分。杆的一端微微下沉，另一端从梁头的暗影里露出来。

秤钩有锈，秤绳有潮，秤杆上有旧火留下的黑。可钩子挂着布兜，砣子压住刻度，木杆便把两头的轻重交在一条线上。铁锈只薄了铁，没有挪动刻线。它能吃掉钩尖，不能替一斤多出一钱，也不能把少的补齐。

父亲把一份灰放进碗中。秤杆空下来，慢慢回平。那一刻，锈钩仍朝下，像一枚已经盖过的印。

**锚句**：锈不改秤的判决。
**Anchor sentence**: rust does not change the scale's verdict.

---

## 其五 · 记数

孩子替父亲记过一次数。没有纸，他便用手指在桌沿上划。第一道，第二道，第三道。他每划完一道，就看一只碗。碗口蒙着灰，碗底还干净。七道以后，桌沿留着七条浅痕。

他也记住了秤砣停在哪里。第四道，靠近那处被刀削浅的刻线。秤砣停住时，尾端有一点向下，父亲没有去扶。孩子看见秤砣的黑色，也看见木杆上的白灰。两种颜色挨在一起，谁也没有盖过谁。

盆里那点余灰，他没有记成第八份。父亲把它收在盆边，手掌挡着门缝里吹来的风。灰很轻，掌心一松，便沿着盆底散开。孩子数过碗，又数过桌沿上的痕，最后把手指停在第七道之后。

这件事后来没有人问他。父亲也没有说他记得对不对。孩子长大以后，仍记得那一次：秤砣停在第四道；盆里还剩一点；桌沿上有七条浅痕，没画第八条。

**锚句**：少下的那一份，也有数。
**Anchor sentence**: even the portion that falls short has its count.

---

## 其六 · 梁上

称完以后，父亲把秤杆上的灰擦掉。秤砣放回原处，秤绳绕过梁下的钉子，锈钩朝着地面。他站在凳上，把秤挂高了一点，免得门开时碰到。梁木受了重量，响了一声，随后不响了。

余灰留在浅盆里。父亲拿一只倒扣的碗盖住它，碗底没有擦干净，边缘压住盆沿。屋里潮，盆壁起了一圈水汽。灰在盖下慢慢凉下来，颜色从白变成暗灰。没有人挪动那只碗。

夜里潮水进到石阶，又从石阶退回去。梁上的秤没有动，空钩仍挂着。门口的盐粒被脚踩碎，落进木缝。第二天，盆还在原处，碗也还盖着。父亲出门时没有看它，回家时没有揭开。

后来屋梁换过一次，旧钉留下一个黑孔。秤被挂到旁边，木杆更旧，刻线更浅。那半碗余灰没有人问起，也没有人拿来补秤。灰在盖下结住，等到盆沿裂开，仍没人称它。

**锚句**：挂回梁上，账仍未合。
**Anchor sentence**: hung back on the beam; the account still has not closed.

---

## 模型映射（回响十一章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 锈秤 · 榆木杆 · 七份灰 · 余灰 · 桌沿的七道痕 | 一至六 |
| geography | 河口船棚 · 父亲的屋梁 · 门槛 · 石阶 | 一至六 |
| factions | 一个人家 | 一至六 |
| characters | 父亲 · 孩子 · 外祖（回忆） | 一至六 |
| items | 榆木秤 · 秤砣 · 浅盆 · 倒扣的碗 | 一至六 |
| story | 灰后 · 带灰回家 · 回响（其十一） | 全篇 |
| history | 铁月纪之后 · 灰棚之前 | 一至六 |

> 秤没有说「够了」；
> 它只把每一份过完，就回梁上。
>
> The scale never said "enough";
> it only weighed every portion, then went back to the beam.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其十一）「秤」

> An echo does not continue the canon — it only keeps its eyes on the rusted scale that hung from the beam in Chapter IX.
> Written for the iron that yielded to the salt, and never to the ledger.
> Its anchors answer to the same discipline as the red cord and the keys.
>
> 回响不替正典续写——它只盯着第九章里挂在梁上的那架锈秤。
> 本篇写给秤钩上输给盐、没输给账的铁。
> 本篇锚句，与《红绳》《钥匙》同一纪律。

> Era: after the Iron-Moon Age · before the grey cover was laid.
> 纪元：铁月纪之后 · 灰棚之前。

---

## I · The Old Thing

His father said the scale had come down from the grandfather's house. At the river's mouth the grandfather had divided fish for other people; the scale hung beneath the boat-shed's beam, the beam's wood incised with sixteen worn lines, the last of them pared shallow by a knife. In those days the weight was black, the star-lines bright; any extra tail on one house's fish, any one grain fewer of salt in another's pile, all of it was kept on that wooden beam.

After the grandfather died, the scale came into the father's house with a few empty baskets. He never used it to weigh rice or meat. It went up onto the beam, the rope passed over a nail, the hook facing down. Each year the tide came in, and everything in the house was moved higher; only the scale stayed where it was, like an account long pending.

The father said the beam was elm. Elm does not fear weight, only fire. The year the boat-shed burned, the grandfather reached up, unshipped the scale, and carried it across the flats. One end of the beam was scorched; the sixteen lines were still there. Later he passed the scale to the father with a single sentence: once something has been weighed, it need not come back for it.

The father never asked to whom that sentence had been addressed.

**Anchor sentence**: old accounts hang from the beam.
**锚句**：旧账从梁上垂下。

---

## II · Rust

First the hook dulled, then the rust bloomed on it. The house stood close to the sea; salt came through the door-seam, the window-paper drank the damp, and the wall-foot ash went soft layer on layer. Day after day the hook faced down; water dripped from the tile-seams, first onto its tip, then along its curve and into stillness. The salt stayed there, and the damp stayed with it.

The iron did not fail at once. It lost its shine first, then scaled over, and finally yielded a rough red. The father wiped it with hemp cloth; brown streaks marked the cloth. He also scraped it with a knife's back; rust-flakes fell to the floor, thin as fish-scales. The hook still held weight, only brushing the beam with a light sound when it swung against it.

That sound came in the night as well. When the tide rose, the beam-wood drank, the rope pulled taut against the nail; when it withdrew, the rope eased, and the hook touched the beam softly. The hook had not broken; it had simply given itself to salt and water, growing thinner by the season.

The father no longer wiped it. The rust he wiped away grew back by the next day.

**Anchor sentence**: the iron yielded to the damp, not to the count.
**锚句**：铁输给了潮，不输给数。

---

## III · Seven Portions

That day the father took the scale down from the beam. The ash lay in a shallow basin; its base had split, and ash filled the split as well. He first straightened the rope, set the weight beside the elm beam, then took a cloth pouch, the mouth of which was tied in two knots. The pouch had not been washed; the edge still kept traces of old salt.

He filled it handful by handful. Each time the pouch went onto the hook, the beam dipped, and the weight travelled outward along the wood. The father moved the weight with his fingernail — one nudge, one pause, waiting until the beam's sway had settled before he read the line.

The first portion settled at the fourth line. The father poured the ash into a bowl, then switched for an empty pouch. The second portion — also the fourth line. The third likewise. When the ash went down, a pale round scar showed along the basin's bottom. The father said nothing; he set each portion on the table, a palm apart.

The beam's end was directly above him. Every time the father raised his eyes, he seemed to be looking at the scale's beam, or at the stretch of dark wood above it — where old nail-holes nested, where the paths of beetles left fine dust, where a black line had been left by fire. The weight paid no attention to the beam-end. It travelled along its lines, and stopped, and waited for the father's hand to leave.

The fourth, the fifth, the sixth — the same. When the seventh was weighed, a little ash still remained in the basin. The father gathered it, cupped his palm over it twice, yet still it would not fill a full jin. He looked at the pouch, then at the beam, and at last left that little ash in the basin.

There was no eighth portion. The hook hung empty.

**Anchor sentence**: seven portions settled; the remainder never enters the ledger.
**锚句**：七份落定，余数不入账。

---

## IV · Still True

The rust on the hook grew against the iron; it had not climbed the beam. The father hung the pouch, and once his hand had left, the hook bore the weight. It did not twist open, nor list to one side. The beam rose according to its old lines; the weight stopped according to its old marks.

A few grains of rust fell onto the cloth. The father pinched them away; he did not weigh again. The boy at the door watched his father's fingers halt beside the line. They did not press the beam; they did not make up a grain for the weight. One end of the beam sank a little; the other emerged from the darkness above.

The hook was rusted, the rope was damp, the beam carried the black left by the old fire. Yet the hook held the pouch, the weight pressed the line, and the wooden beam delivered the two ends' difference across a single line. Rust had thinned only the iron; it had not shifted the marks. It could erode the hook's tip, but it could not give one jin one grain more — nor could it supply what was missing.

The father put one portion of ash into the bowl. The beam lifted free, and slowly came back to level. In that moment, the rusted hook still pointed down, like a seal already set.

**Anchor sentence**: rust does not change the scale's verdict.
**锚句**：锈不改秤的判决。

---

## V · The Counting

The boy once kept the tally for his father. No paper — he drew the lines with a fingernail along the table's edge. First line, second line, third line. After each line he looked at a bowl. The bowl's mouth was filmed with ash, its base still clean. After the seventh line, seven faint grooves remained along the table's edge.

He also remembered where the weight had stopped. At the fourth line, beside the one line that had been pared shallow. When the weight came to rest, its tail ended a little low; the father did not steady it. The boy saw the black of the weight and the white dust on the beam; the two colours lay side by side, and neither covered the other.

The little remainder in the basin — he did not record it as an eighth portion. His father gathered it at the basin's edge, his palm shielding it from the wind through the door-seam. The ash was very light; the palm loosened, and it scattered thin across the basin's base. The boy numbered the bowls, numbered the grooves along the table's edge, and last of all rested his finger after the seventh.

No one ever asked him about it afterwards. His father never told him whether he had counted right. Long after, the boy still remembered that day: the weight settled at the fourth line; a little remained in the basin; the table's edge held seven grooves — and never an eighth.

**Anchor sentence**: even the portion that falls short has its count.
**锚句**：少下的那一份，也有数。

---

## VI · The Beam Again

Once everything had been weighed, the father wiped the ash from the beam. He put the weight back where it had been, the rope wound again over the nail beneath the beam, the rusted hook facing down. He stood on the stool and hung the scale a little higher, out of the way of the opening door. The beam-wood took the weight and sounded once, and afterwards sounded no more.

The remainder-ash lay in the shallow basin. The father laid an overturned bowl on top of it; the bowl's base was not wiped clean, its rim pressing shut over the basin. The room was damp; a ring of mist rose along the basin's wall. Beneath the cover, the ash cooled slowly, its colour shifting from white to dark grey. No one moved that bowl.

At night the sea came in over the steps and went back again. The scale above did not move; the hook hung empty. Grains of salt by the door were crushed underfoot, falling into the wood-joints. The next day the basin stood where it had been, the bowl still covered. The father went out without looking at it; he came home without lifting it.

Later, the beam was replaced; the old nail left behind a black hole. The scale was hung beside it, the beam more worn, the lines fainter. Of that half-bowl of remnant ash, no one asked again, and no one used it to balance the scale. The ash under the cover had hardened; when the basin's rim finally split, still no one weighed it.

**Anchor sentence**: hung back on the beam; the account still has not closed.
**锚句**：挂回梁上，账仍未合。

---

## Model mapping (echo No. 11)

| Category | Title | Corresponds to |
|---|---|---|
| lore | The Rusted Scale · the Elm Beam · the Seven Portions · the Remainder · the Seven Grooves on the Table's Edge | I–VI |
| geography | The River-Mouth Boathouse · the Beam in the Father's House · the Threshold · the Steps | I–VI |
| factions | One household | I–VI |
| characters | The Father · the Boy · the Grandfather (in memory) | I–VI |
| items | The Elm Scale · the Weight · the Shallow Basin · the Overturned Bowl | I–VI |
| story | After the Ash · Ash Carried Home · Echo (No. 11) | whole |
| history | After the Iron-Moon Age · Before the Grey Cover Was Laid | I–VI |

> The scale never said "enough";
> it only weighed every portion, then went back to the beam.
>
> 秤没有说「够了」；
> 它只把每一份过完，就回梁上。
`,
  },
  {
    order: 12,
    slug: 'echo-012-the-bowl',
    titleZh: '碗',
    titleEn: 'The Bowl',
    eraLineZh: '纪元：铁月纪之后 · 灰棚之前。',
    eraLineEn: 'Era: after the Iron-Moon Age · before the grey cover was laid.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 12): The Bowl

> 回响不替正典续写——它只盯着第九章里那只盛灰的旧瓷碗。
> 本篇写给盖住余灰之后，两只碗之间那条细暗缝。
> 本篇锚句，与《秤》《钥匙》同一纪律。
>
> An echo does not continue the canon — it only keeps its eyes on the old porcelain bowl that held the ash in Chapter IX.
> Written for the thin dark seam between the two bowls that closed over the remnant.
> Its anchors answer to the same discipline as the scale and the keys.

> 纪元：铁月纪之后 · 灰棚之前。
> Era: after the Iron-Moon Age · before the grey cover was laid.

---

## 其一 · 来处

那只碗原先不在这间屋里。

它从外祖母家的灶间来。那家拆掉时，桌板先抬走，柜子留到最后。妻子把碗从柜底取出，碗里有一层陈年的面粉，擦净后，才看见白釉发青。没有人记得它是哪一年烧的，也没人说得清它原本属于谁。旧账上只写着：瓷一只，留。

搬进这间屋时，碗沿已经磕过两处。一处在靠近柄似的宽边，豁口浅，手指掠过只会停一下；另一处在正对门的地方，缺得深，釉皮往里卷，像一粒被咬下的盐。妻子洗碗时，总把那处转向墙。后来她不再转了。

碗底有一道旧黑线，洗不去。每逢添水，线便从釉下浮出来，像潮退后留在石上的痕迹。它不妨碍盛饭，也不漏。家里没有人把它放进破瓷堆。它一直在灶边，口朝上，等着下一次被拿起。

**锚句**：旧物没有姓氏。
**Anchor sentence**: old things have no surname.

---

## 其二 · 两道裂

碗口那道裂，不是磕碰留下的。它从深处生出来，细细一线，穿过釉面，在缺口旁停住。妻子用指甲试过，裂缝不进指甲。她把碗放到耳边，什么也没听见。

盆底也有一道缝。盆是搪瓷的，边缘掉了漆，缝藏在盆心偏外的地方。水用到半盆，缝便暗下去；水倒空，灰又慢慢显出来。两道裂不挨着，家里却总把它们放在一处：碗在盆边，盆在窗下。

灰进了缝，便不肯出来。

妻子用湿布擦盆，布过一遍，缝里还是有灰；再过一遍，灰似乎更深。她没用针去挑，也没把盆拿到外头倒扣。那条缝挨着底，像是从底下来的。碗口的裂也是这样，顺着烧成时留下的细纹，往釉里藏。灰落上去，不响；水经过，也不响。

此后，每次扫屋，盆底总留一层薄灰。碗沿也有。她把它们当作旧物的分量，没有逐次清点。灶火熄了，屋里仍有灰。门开时，外头的潮气进来，缝却没有合上。

**锚句**：裂处留灰。
**Anchor sentence**: the crack keeps ash.

---

## 其三 · 盛灰

那日秤完了，妻子把旧瓷碗从灶边拿下来。

她没有先擦碗，也没有把碗放到干净处。屋里扫过一遍，桌面仍有灰。她用一张折起的纸，沿着桌面刮过，将表面的一层收起来。纸的边缘很快发软，她的手停得稳，没有把下头的旧灰一并刮起。

她先盛表面的一层灰。

灰落进碗里，轻得听不见。她的手从桌面移到碗口，纸角对着碗内，灰便顺着那道裂落下去。没有扬起烟。只在碗沿落了一圈暗痕，贴着旧釉，经过两处磕碰，又在最深的缺口旁断开。

她把纸折好，放回原处。那圈暗痕留在碗沿，像盐水干后的一道边。碗里只有薄薄一层，遮不住底下黑线。妻子端着它，没叫人让路，也没有把碗举高。她走得很慢，灰没有滑向一边。

盆还在窗下。盆底那道缝里，旧灰未动。她把碗搁在桌角，碗口朝上，等着屋里的事办完。后来秤盘收起，秤砣放回抽屉，纸上的数没有留在桌上。

**锚句**：灰没有惊动屋子。
**Anchor sentence**: the ash did not disturb the house.

---

## 其四 · 盖下

余灰倒进瓷碗时，窗外正涨潮。

妻子把纸上的余灰倒完，又把盆底积着的一点刮起，一并送进碗里。纸角沿着碗内转过半圈，碰到裂缝时停了一下。灰填住碗底的黑线，也盖住最深的磕口。她没有把碗装满，仍留出一截白釉，露在灰上。

之后，她拿来另一只碗，倒扣在瓷碗上。两只碗的口沿相接，碰出一声钝响。上面的碗颜色更白，底部有一圈褐印，像旧水退到边沿。她对齐两只碗，没有压紧。裂开的那处留在外面，正对着盆底那道缝。

那几日，水汽从盆壁起来。屋里潮，桌脚发软，窗纸贴着木框。灰凉下来，先是表面不再松动，后来连边缘也沉住。倒扣的碗盖在上面，碗底沾了水汽，又慢慢干了。没有水滴落下。

没人挪动那只碗。

它在桌上待着，旁边的饭碗照常拿起，盆也照常用。人经过时会绕开桌角，不碰上面的碗。潮气退了又来，碗与碗之间没有亮光，只有一条细细的暗线，从口沿走到最深的缺口。灰在里面，一日一日凉下去。

**锚句**：盖下无声。
**Anchor sentence**: beneath the cover, no sound.

---

## 其五 · 手

孩子是在一个早晨摸到碗沿的。

他先摸到上面那只碗的底，手掌贴着褐印，停了一会儿。碗没有动。他低下头，看见两只碗相扣的地方露出一圈旧釉，灰不在外面，白也不在外面。桌面边有一小道水迹，已经干了。

他不敢掀开。

手指沿着口沿往前，碰到瓷碗的磕碰处，便压在那里。那处缺口比别处深，边缘磨得圆了，仍能按出一点凹陷。孩子把力气放轻，又放重。指腹压在磕碰处，像压住一道不再发声的门。

他没有问碗里是什么。妻子站在灶旁，把水倒进锅里。水声盖过了屋里的其余声响。孩子听见锅底碰到灶沿，手指仍压在那处缺口上，直到指尖发白。

后来他松手，碗没有移位。碗沿留下一个浅浅的指印，潮气没把它留下多久。孩子离开桌边，绕过盆，脚底没有踩到灰。那道裂仍在两只碗之间，细得像没有开过。

**锚句**：手停在旧缺处。
**Anchor sentence**: the hand stops at the old chip.

---

## 其六 · 沉默

屋梁换过之后，桌子也移过位置。

旧梁抬下时，木屑落到地上，没人扫进碗里。新梁安好，屋顶压实，雨声便不再从梁缝里漏下来。桌角挪近墙边，上面的两只碗没有分开。妻子用布擦桌，擦到碗旁便收手。盆底的缝仍在窗下，里面也存着灰。

碗内的灰在盖下结住了。

它不再浮，不再跟着屋里走动。那只倒扣的碗压着它，褐印朝上，瓷面无缺。下头的旧碗仍有两处磕碰，口沿那道裂没有合拢。灰结在里面，贴住碗底，也贴住那道细缝。桌子偶尔受潮，碗沿起一圈暗色；等风干，暗色便退回釉里。

有人来过，问桌上的两只碗要不要收走。妻子说不用。来人没有伸手。屋里只剩梁木的气味，窗外的潮水进退，盆壁干了又湿。没人称它，也没人揭开它。数目留在旧纸上，碗没有进秤。

后来那张纸不见了。桌上的碗还在。灰在盖下结牢，裂口没有再长，磕碰处也没有补釉。屋梁压住屋顶，瓷碗压住灰。碗守住了沉默。

**锚句**：未揭之物不入账。
**Anchor sentence**: what remains unrevealed enters no ledger.

---

## 模型映射（回响十二章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 旧瓷碗 · 裂缝 · 盆底的搪瓷盆 · 盖下的余灰 | 一至六 |
| geography | 一个普通人家的灶间 · 窗下 · 桌角 · 石阶 | 一至六 |
| factions | 一户人家 | 一至六 |
| characters | 妻子 · 孩子 | 一至六 |
| items | 旧瓷碗 · 倒扣的碗 · 搪瓷盆 · 折纸 · 裂缝 | 一至六 |
| story | 灰后 · 带灰回家 · 回响（其十二） | 全篇 |
| history | 铁月纪之后 · 灰棚之前 | 一至六 |

> 碗不揭开——
> 它只是继续盛着沉默，直到没人再问为什么。
>
> The bowl is never lifted —
> it only holds the silence a little longer, until no one asks why.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其十二）「碗」

> An echo does not continue the canon — it only keeps its eyes on the old porcelain bowl that held the ash in Chapter IX.
> Written for the thin dark seam between the two bowls that closed over the remnant.
> Its anchors answer to the same discipline as the scale and the keys.
>
> 回响不替正典续写——它只盯着第九章里那只盛灰的旧瓷碗。
> 本篇写给盖住余灰之后，两只碗之间那条细暗缝。
> 本篇锚句，与《秤》《钥匙》同一纪律。

> Era: after the Iron-Moon Age · before the grey cover was laid.
> 纪元：铁月纪之后 · 灰棚之前。

---

## I · Where It Came From

The bowl had not started in this house.

It had come from the grandmother's kitchen. When that house was torn down, the table-boards went first; the cupboards stayed until last. The wife drew the bowl from beneath the cabinet; a layer of aged flour coated it; once wiped clean, the white glaze showed green. No one remembered the year it had been fired, or whose it had been before. The old ledger said only: one porcelain piece, kept.

When it arrived in this house, the bowl's rim already bore two chips. One lay near the wide edge that seemed almost a handle — shallow, the finger passing over it with only a pause. The other faced the door full on — deeper, the glaze curling inward, like a grain of salt bitten through. When the wife washed dishes, she turned that side toward the wall. Later, she stopped turning it.

The bowl's base carried an old black line that no wiping could lift. Fill the bowl with water, and the line surfaced from beneath the glaze, like the tide-mark left on stone after the sea has withdrawn. It did not hinder meals; it did not leak. No one in the house put it among the broken porcelain. It stayed at the stove's side, mouth upward, waiting for its next turn to be lifted.

**Anchor sentence**: old things have no surname.
**锚句**：旧物没有姓氏。

---

## II · Two Cracks

The crack along the mouth had not come from chipping. It had grown from within — a fine thread through the glaze, stopping beside the deeper chip. The wife tried it with a fingernail; the crack admitted no nail. She held the bowl to her ear; she heard nothing.

The basin's base held a seam as well. The basin was enamel, its edges shed of paint; the seam hid within the inner floor, a little off-centre. Filled to half, the seam went dark; emptied, the ash surfaced again. The two cracks did not touch each other — yet in the house they were always kept together: the bowl beside the basin, the basin beneath the window.

Ash found its way into the seam and would not come out.

The wife wiped the basin with a damp cloth — one pass, the seam still held ash; another, the ash seemed deeper. She did not pick at it with a needle; she did not turn the basin over outdoors. The seam lay close against the base, as if it had come from underneath. The crack on the bowl ran the same way — following the fine thread left from the firing, retreating into the glaze. Ash settled on it without a sound; water passed over it without a sound.

After that, each time the house was swept, a thin film of ash remained in the basin's floor. The bowl's rim kept some as well. She took these as the weight of old things; she never tallied them one by one. The stove's fire died, yet ash remained in the house. When the door opened, the damp came in from outside — the seam did not close.

**Anchor sentence**: the crack keeps ash.
**锚句**：裂处留灰。

---

## III · The Serving

That day, once the weighing had finished, the wife took the old porcelain bowl down from beside the stove.

She did not wash it first, nor set it on a clean place. The house had already been swept; the table still held ash. She took a folded sheet of paper, worked along the table's surface, and gathered the outermost layer in. The paper's edge soon went soft; her hand remained steady, and she did not sweep the older dust beneath up with it.

She served the surface-layer of ash first.

The ash fell into the bowl without a sound. Her hand moved from the table to the bowl's mouth; the paper's corner angled inward; the ash followed the crack downward. No smoke rose. Only a dark ring along the rim, clinging to the old glaze, crossing two chips and breaking off beside the deepest one.

She folded the paper away and set it back in its place. The dark ring remained along the rim, like the edge salt-water leaves behind when it dries. The bowl held only a thin layer, scarcely hiding the black line beneath. She carried it, asking no one to make way, never lifting it high. She walked slowly; the ash did not slip to one side.

The basin stayed beneath the window. The old ash in its seam had not moved. She set the bowl at the table's corner, mouth up, and waited for the house's business to finish. Later the scale-pan was put away, the weight returned to the drawer; the numbers on the paper did not stay on the table.

**Anchor sentence**: the ash did not disturb the house.
**锚句**：灰没有惊动屋子。

---

## IV · Beneath the Cover

When the remnant ash was poured into the porcelain bowl, the tide outside was rising.

The wife emptied everything from the paper, then scraped what had pooled at the basin's floor and sent it along with the rest. The paper's corner turned half a circle inside the bowl's wall, stopping once at the crack. The ash filled the black line at the base, and covered the deepest chip as well. She did not fill the bowl to the brim; a span of white glaze remained, rising above the ash.

Then she took another bowl and set it mouth-down over the porcelain one. The two rims met with a dull note. The upper bowl was whiter; its base carried a ring of brown, like old water withdrawn to the edge. She aligned the two bowls without pressing. The cracked place was left outward, facing the seam in the basin's floor.

Those days, mist rose from the basin's walls. The room was damp; the table-legs went soft; the window-paper clung to its frame. The ash cooled — first the surface loosened no more; in time, even the edges settled in place. The overturned bowl lay on top of it; its base drank the damp, then dried again. No drops fell.

No one moved that bowl.

It stayed on the table; beside it, the rice bowl was lifted as usual, the basin used as usual. People going past skirted the table's corner, not touching the upper bowl. The damp came and went; no light shone between the two bowls — only a thin dark seam, running from the rim to the deepest chip. Within, the ash cooled day by day.

**Anchor sentence**: beneath the cover, no sound.
**锚句**：盖下无声。

---

## V · The Hand

The boy touched the rim of the bowl one morning.

He first laid his palm against the upper bowl's base, staying against the brown ring a moment. The bowl did not move. He bent his head and saw, in the place where the two bowls embraced, a ring of old glaze — ash not outside, white not outside. A thin dry line of water ran along the table's edge, already dry.

He did not dare lift it.

His fingers travelled along the rim, and came to the chip on the porcelain bowl, and pressed there. That chip ran deeper than the others; its edges were worn round, yet still gave under pressure. The boy let his strength soften, then let it firm. His fingertip pressed the chip the way one presses a door that no longer sounds.

He did not ask what was inside. The wife was at the stove, pouring water into the pot. The water's sound covered everything else in the room. The boy heard the pot's base knock against the stove's edge; his fingers kept their place on the chip until they whitened at the tips.

Afterwards he let go. The bowl had not shifted. A faint fingerprint marked the rim; the damp did not keep it long. The boy left the table's side, passing around the basin, his soles not touching the ash. The crack remained between the two bowls, fine as a door never opened.

**Anchor sentence**: the hand stops at the old chip.
**锚句**：手停在旧缺处。

---

## VI · The Silence

After the beam was replaced, the table was moved as well.

When the old beam was lifted down, wood-dust spilled across the floor; no one swept it into the bowl. The new beam went up, the roof pressed tight, and rain no longer leaked down through the seams. The table's corner drew nearer the wall; the two bowls on it were not parted. The wife wiped the table with a cloth; when she reached the bowls, she drew her hand back. The basin's seam remained beneath the window, still holding its ash.

Within the bowl, the ash had set beneath its cover.

It no longer floated, no longer travelled with the room. The overturned bowl pressed on it, the brown ring facing up, its surface whole. The old bowl beneath still carried two chips; the crack at its rim had not closed. The ash set within it, against the base, against the fine seam. Whenever the table drank the damp, a dark ring rose along the rim; when the air dried again, it retreated into the glaze.

Someone once came by, and asked whether the two bowls on the table were to be taken away. The wife said there was no need. The visitor did not reach for them. The house kept the smell of new beam-wood, the sea's coming and going through the door; the basin's wall dried, then drank, then dried again. No one weighed it; no one uncovered it. The numbers remained on the old paper; the bowl never went to the scale.

Later the paper was gone. The bowls remained on the table. The ash under the cover had set fast; the crack had not grown; the chips had not been mended. The beam bore the roof; the porcelain bore the ash. The bowl kept its silence.

**Anchor sentence**: what remains unrevealed enters no ledger.
**锚句**：未揭之物不入账。

---

## Model mapping (echo No. 12)

| Category | Title | Corresponds to |
|---|---|---|
| lore | The Old Bowl · the Crack · the Enamel Basin · the Covered Remnant | I–VI |
| geography | One household's kitchen · the Window-side · the Table-corner · the Steps | I–VI |
| factions | One household | I–VI |
| characters | The Wife · the Boy | I–VI |
| items | The Old Porcelain Bowl · the Overturned Bowl · the Enamel Basin · the Folded Paper · the Crack | I–VI |
| story | After the Ash · Ash Carried Home · Echo (No. 12) | whole |
| history | After the Iron-Moon Age · Before the Grey Cover Was Laid | I–VI |

> The bowl is never lifted —
> it only holds the silence a little longer, until no one asks why.
>
> 碗不揭开——
> 它只是继续盛着沉默，直到没人再问为什么。
`,
  },
  {
    order: 13,
    slug: 'echo-013-the-threshold',
    titleZh: '门槛',
    titleEn: 'The Threshold',
    eraLineZh: '纪元：铁月纪之后 · 灰棚之前。',
    eraLineEn: 'Era: after the Iron-Moon Age · before the grey cover was laid.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 13): The Threshold

> 回响不替正典续写——它只盯着那道安静了几章的门槛。
> 柴放在门槛外，水送到门槛外，灰被雨冲开，脚印没人抹掉。
> 本篇写给门内灯火与门外潮声之间，唯一不必被看守的东西。
> 本篇锚句，与《碗》《秤》同一纪律。
>
> An echo does not continue the canon — it only keeps its eyes on the threshold that has kept quiet through all these chapters.
> Firewood set beyond it, water left beside it, ash scattered by rain, no footprints wiped away.
> Written for the one thing between the lamp inside and the tide outside that does not need keeping.
> Its anchors answer to the same discipline as the bowl and the scale.

> 纪元：铁月纪之后 · 灰棚之前。
> Era: after the Iron-Moon Age · before the grey cover was laid.

---

## 其一 · 木头

门槛的木头没有来处。

账上不记它的价，也不记谁把它锯成如今的宽窄。它横在那里，木纹里留着一条旧水线，像潮退后没有带走的盐。有人说它原先是树，根在灰棚后面的湿地里；也有人说那块地从来没有树，只在雨后露出一段黑木，日子久了，便被当作门槛。

没人替它作证。木头不曾开口，也没有被问过。

它的两端抵着墙根。墙换过几次，泥灰一层覆一层，门槛没有动。每逢修墙，搬石的人绕过它，像绕过一笔已经结清、却仍留在册上的旧账。

风从门缝进来，先刮过木纹，再进屋。屋里的人只记得风，没记得木头。门槛受着来去的风，年久处起了毛刺，刺尖朝着谁，它也不挑。

后来有人把灯挂在门内。灯光落到木头上，分成两截，一截暖，一截暗。门槛在两截之间，没有取其中一截。

**锚句**：它没有出生的年月。
**Anchor sentence**: it has no year of birth.

---

## 其二 · 未定

门槛不说里外。

它只认脚步还没有落定的时候。人站在门前，鞋底沾着泥，手里握着话，或什么也没握。那一刻，他还不是屋里的人，也不是门外的人。门槛只托住他的重量，等重量自己决定往哪边去。

有人在上面停了很久。有人只把一只脚放下，另一只仍留在地上。也有人隔着门缝看灯，直到灯芯缩短，才转身离开。门槛没有把他们算作来过，也没有把他们算作未曾来过。

雨后，木头吸饱了水，表面发暗。旱时，它裂开细缝，缝里落进灰、盐、鞋底磨下来的碎屑。那些东西没有内外之分，只有新旧之别。脚步经过，旧的压进木纹，新的覆在上面。

记账的人也曾站在这里。他手里有一册薄账，封皮被灯油浸出黑边。他没有跨进来，只把账往门内递。接账的人没问他为何不进；他也没问账上为何少了一行。

那一刻两个人都没有决定。门槛承住他们，一如承住门板的重量。

**锚句**：它只记脚步未定时。
**Anchor sentence**: it remembers only the moment a foot has not yet landed.

---

## 其三 · 柴与水

柴总放在门槛外。

送柴的人不敲门。他把捆扎好的枯枝搁下，绳结朝上，免得雨水积在里面。做完这些，他便走，脚印从木头边绕开。门内有人听见柴枝轻碰地面，等了片刻，才开门搬进来。

灯下的账不出门。

账本压着一块石头，纸页有潮气，墨迹在边角洇开。上面写柴的斤两，也写送来时的日子；不写是谁弯腰放下，也不写谁隔门听见。那些字留在灯下，像一排不肯移位的钉子。

门槛先收。

它先受住柴捆落地时的一震，先沾上绳纤维落下的毛，先挨那点从枯枝上抖下来的尘。屋里的人后来把柴搬走，门外的地仍留着压痕。每次送柴，压痕换一个方向，旧的便浅一些，却没有全退。

送水的人也不敲门。

水桶放在柴捆旁，桶沿有盐白的结痕。桶底贴地时，水面颤一下。那人松开提绳，手指在衣襟上擦过，转身离去。屋里的人开门取水，木桶提起时，门槛上会留一道短短的湿印。

账上不写湿印。灯下只添一笔水的数目。

门槛收下桶底的冷，也收下柴枝的刺。它从不把东西搬进屋，也不把东西推出去。每一样都由后来的人拿走，或留到天亮。

**锚句**：门槛先收，账留在灯下。
**Anchor sentence**: the threshold takes it first; the ledger stays under the lamp.

---

## 其四 · 雨

雨冲过门槛几次，没人记全。

最初那年，雨从屋檐落下来，沿着门外的灰地走，冲出一条窄沟。灰散开，露出下面的泥。有人在沟边踩过，脚印半陷半浮，像写了一行看不清的字。

后来又下雨。旧沟被水填平，灰从高处流下来，重新覆住低处。水退后，灰结成薄壳，边缘起皱。门槛没有替谁擦去脚印。那些印子留着，后来被雨打散，又在别处凝回来。

有一场雨落了整夜。水从门板下面挤进来，沿木纹爬了一寸，又退回去。门内有人拿布堵门缝，没有擦门槛。第二天，潮痕还在，灰棚里的人照常点灯，照常把账摊开。

雨水冲过门槛，也冲过门外的柴灰。灰开了，散在沟沿；天晴之后，风把它送回墙根。再下一场雨，它又被冲开。这样几次，没人说得清灰是从哪里来，也没人说得清它为何回来。

只有脚印不曾被门槛抹掉。

它们被水削薄，被灰盖住，被后来的人踩乱。木头仍托着每一道留下的重量，不替谁作证，也不替谁脱身。

**锚句**：雨能冲灰，不能销账。
**Anchor sentence**: rain can scatter ash; it cannot cancel the ledger.

---

## 其五 · 出门的人

有人从里面跨出来。

那天灯还亮着，账本没有合上。屋里没有人送他，门外也没有人等他。他在门槛上停了半息，像是在听雨；其实那日没有雨，只有屋檐滴下隔夜的水。

他把脚放到门外，鞋底踩进灰里。门槛没有拦他。也没有替他留住里面的暖。他走向潮地，沿着一条没有名字的路去。有人后来见过他在河口，也有人说他往北去了。两种说法都没有记进账。

没人问他去做什么。

没人送他。

门关上时，灯影缩回屋内，门槛上只剩一道浅浅的灰痕。过了几日，送水的人把桶放在原处，桶底压住那道痕。再过几日，桶被取走，灰痕仍在那里，已经认不出属于谁。

门内的人没有提起那个离开的人。门外的人也没有提起。账本上仍留着未填满的一栏，墨水干了，纸面起皱。灯照着那一栏，没有把它照成答案。

门槛记得鞋底落下时的轻重。除此之外，它不记去处。

**锚句**：他走了，无人替他作别。
**Anchor sentence**: he went; no one bade him farewell.

---

## 其六 · 门槛在灯下

门槛在灯下，也在门外。

灯照到它靠里的一半，另一半受着夜里的潮气。天亮时，两边都覆着灰；天黑后，两边都留着冷。它不因光线而靠近屋里，也不因雨水而离开门外。

灰棚里没有别的东西能这样留着。柴要看守，水要看守，灯要续油，账本要压石。门槛不用守。没人把它搬走，没人把它藏起，也没人替它关门。

它守住自己。

墙根松过，门轴坏过，棚顶漏过。修补的人把泥抹在门槛两端，留下两块新白。风吹旧了那层白，木头仍横在那里。后来有人把一张窄凳放在门边，凳脚磨出四个浅坑；凳子搬走后，坑里积灰。门槛没有多问一件东西为何来、为何去。

夜深时，门里的人睡着，门外的潮声退远。门板合着，灯火未灭。门槛夹在两者之间，承住一夜的静，也承住明日尚未决定的脚步。

账还摊在灯下。柴仍会送来，水仍会放在门外。雨会再落，灰会再散，脚印会留下。门槛不替谁收尾。

它在那里，直到下一只脚停住。

**锚句**：它守住自己，便无人守它。
**Anchor sentence**: it keeps itself; so no one keeps it.

---

## 模型映射（回响十三章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 门槛 · 灯 · 柴与水 · 账 | 一至六 |
| geography | 灰棚 · 门槛 · 门外潮地 · 门内灯下 | 一至六 |
| factions | 屋内 · 屋外送柴送水的人 | 一至六 |
| characters | 门里的人 · 送柴送水的众人 · 记账的人 | 一至六 |
| items | 木头门槛 · 柴捆 · 水桶 · 账本 · 灯 | 一至六 |
| story | 雾港 · 灰棚 · 回响（其十三） | 全篇 |
| history | 铁月纪之后 · 灰棚之前 | 一至六 |

> 门槛不说哪一边了更远——
> 它只把每一步都留在自己的木纹里。
>
> The threshold does not say which side is farther —
> it only keeps every step within its grain.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其十三）「门槛」

> An echo does not continue the canon — it only keeps its eyes on the threshold that has kept quiet through all these chapters.
> Firewood set beyond it, water left beside it, ash scattered by rain, no footprints wiped away.
> Written for the one thing between the lamp inside and the tide outside that does not need keeping.
> Its anchors answer to the same discipline as the bowl and the scale.
>
> 回响不替正典续写——它只盯着那道安静了几章的门槛。
> 柴放在门槛外，水送到门槛外，灰被雨冲开，脚印没人抹掉。
> 本篇写给门内灯火与门外潮声之间，唯一不必被看守的东西。
> 本篇锚句，与《碗》《秤》同一纪律。

> Era: after the Iron-Moon Age · before the grey cover was laid.
> 纪元：铁月纪之后 · 灰棚之前。

---

## I · The Wood

The wood of the threshold has no origin.

No ledger records its price, nor who cut it to its present width. It lies there; its grain holds one old watermark, like the salt the tide forgot to take away. Some say it had once been a tree, its roots in the wet ground behind the grey cover; others say there was never a tree there — only, after rain, a stretch of black wood showing, which in time was taken for a threshold.

No one speaks for it. The wood never spoke, nor was it ever asked.

Its two ends press against the wall-foot. The wall has been replaced several times; mud and lime laid one layer upon another — the threshold did not move. Each time the wall was repaired, the stone-bearers went around it, as one goes around an old account settled long ago — yet still carried on the books.

The wind enters through the door-seam, brushing the grain first, then the room. Those inside remember the wind, never the wood. The threshold receives the coming and going of the wind; in the places worn by years it grew splinters — toward whom they point, it does not choose.

Later, someone hung the lamp inside the door. Its light fell upon the wood and split in two — one side warm, one side dark. The threshold lay between the two and took neither.

**Anchor sentence**: it has no year of birth.
**锚句**：它没有出生的年月。

---

## II · Undecided

The threshold does not speak of inside or out.

It knows only the moment a step has not yet settled. A person stands before the door, mud on their soles, words in their hand, or nothing at all. That instant, they are neither inside nor outside. The threshold bears only their weight, and waits for the weight to decide for itself which way to go.

Some stood on it for a long while. Some placed only one foot down, the other still on the ground. Others looked at the lamp through the seam until the wick shortened, then turned away. The threshold counted them neither as having visited nor as never having visited.

After rain, the wood drank its fill; its surface darkened. In drought it cracked into fine lines; into the lines fell ash, salt, the dust ground from shoe-soles. These things made no distinction between inside and out — only between the new and the old. Feet passed; the old pressed into the grain, the new lay upon it.

The keeper of the ledger once stood here as well. In his hand was a thin book, its cover steeped dark by lamp-oil. He did not step across; he only passed the book inside. The one who reached for it did not ask why he stayed out; nor did he ask why one line of the ledger was missing.

In that moment, neither had decided. The threshold bore them, as it bore the weight of the door itself.

**Anchor sentence**: it remembers only the moment a foot has not yet landed.
**锚句**：它只记脚步未定时。

---

## III · Firewood and Water

The firewood was always set beyond the threshold.

Those who brought it did not knock. They set down the bundle of dry branches, knot up, so the rain would not pool inside. Then they left; their footprints curved around the wood. From within, someone heard the branches brush the ground, waited a while, then opened the door and carried them in.

The ledger beneath the lamp did not leave the house.

A stone held the ledger down; damp steeped the pages; ink bled at the corners. It recorded the weight of firewood, and the date it arrived; not who bent to lay it down, not who heard it through the door. Those words remained beneath the lamp, like a row of nails refusing to shift.

The threshold took it in first.

It bore the first jolt of the bundle striking earth, the first thread-fibres dropping from the knot, the first dust shaken from the branches. Later, those inside carried the wood away; outside, the ground kept the press-marks. Each delivery left them in a new direction; the old ones faded in time, though never wholly gone.

Those who brought water did not knock either.

The bucket sat beside the firewood, its rim crusted white with salt. As its base touched the ground, the water trembled. The bearer let go of the rope, wiped their fingers on their hem, and turned away. When those inside came out to draw it up, lifting the bucket left upon the threshold a short damp mark.

The ledger recorded no damp mark. Beneath the lamp, only the water's tally was added.

The threshold received the cold of the bucket's base, and the splinters of the firewood. It never carried anything in, nor pushed anything out. Whatever arrived was either taken in by later hands, or left until morning.

**Anchor sentence**: the threshold takes it first; the ledger stays under the lamp.
**锚句**：门槛先收，账留在灯下。

---

## IV · Rain

How many times rain has washed the threshold, no one has counted in full.

The first such year, rain came down from the eaves and ran along the ash outside the door, cutting a narrow channel. The ash scattered; the mud beneath showed through. Someone crossed at its edge; half of each print sank, half floated — like a line of characters no one could quite read.

It rained again later. The old channel filled; ash flowed down from above and covered the low places once more. After the water withdrew, the ash set into a thin crust, its edges puckered. The threshold wiped no footprint away for anyone. Those prints stayed; later they were scattered by rain and settled again elsewhere.

One rain fell through the whole night. Water forced its way in beneath the door-board, crept one inch along the grain, then withdrew. Inside, someone pressed a cloth against the seam — the threshold they did not wipe. The next day the damp-marks remained; in the grey cover, people lit the lamp as usual and opened the ledger as usual.

Rain washed the threshold, and the ash beyond it as well. The ash opened, scattered along the channel's edge; once the sky cleared, the wind carried it back to the wall-foot. Yet another rain, and it was scattered again. So many times it happened that no one could say where the ash came from, nor why it always returned.

Only the footprints were never wiped away by the threshold.

Water thinned them; ash covered them; later feet confused them. The wood still bore each lingering weight — bearing witness for no one, and releasing no one.

**Anchor sentence**: rain can scatter ash; it cannot cancel the ledger.
**锚句**：雨能冲灰，不能销账。

---

## V · The One Who Left

Someone crossed from the inside out.

That day the lamp still burned, and the ledger had not closed. No one inside sent him off; no one outside waited for him. He paused on the threshold for half a breath, as if listening for rain — though that day held no rain, only the drip of overnight water from the eaves.

He set his foot beyond the door, his sole pressing into the ash. The threshold did not stop him. Nor did it hold back the warmth of what was inside. He walked toward the tidal flats, following a road without a name. Someone later saw him at the river-mouth; others said he had gone north. Neither version entered the ledger.

No one asked what he went to do.

No one saw him off.

When the door closed, the lamplight drew back inside; on the threshold remained one shallow line of ash. A few days later, the water-bearer set the bucket down in its accustomed place, its base pressing over that line. Later still, when the bucket was taken up, the line was still there — no longer recognizable as anyone's.

The one inside did not speak of the one who had gone. Nor did those outside. In the ledger remained an unfilled column; the ink had dried, the page had puckered. The lamp fell on that column — and did not make of it an answer.

The threshold remembered the weight of each landing sole. Beyond that, it kept no record of where anyone went.

**Anchor sentence**: he went; no one bade him farewell.
**锚句**：他走了，无人替他作别。

---

## VI · Beneath the Lamp

The threshold lies beneath the lamp, and beyond the door.

The lamp reaches its inner half; the other half receives the night's damp. By day, both halves carry ash; by dark, both halves hold cold. It does not drift toward the room for the light, nor abandon the door for the rain.

Nothing else in the grey cover can keep itself this way. Firewood requires watching; water requires watching; the lamp requires oil; the ledger requires its stone. The threshold requires no watching. No one carries it away, no one hides it, no one shuts the door for it.

It keeps itself.

The wall-foot has loosened; the door-pin has broken; the roof has leaked. The menders smeared mud along the threshold's two ends, leaving two fresh white patches. Wind wore that white away; the wood still lies across. Later someone set a narrow bench by the door, its legs wearing four shallow pits; the bench was moved away; the pits gathered ash. The threshold asked nothing of why things came, or why they went.

Deep in the night, those inside sleep; beyond the door, the tide-sound withdraws. The door-board rests shut; the lamplight has not died. The threshold lies between the two, bearing one night of stillness — and the still-undecided steps of tomorrow.

The ledger lies open beneath the lamp. Firewood will arrive; water will be set beyond the door. Rain will fall again; ash will scatter again; footprints will remain. The threshold closes no column for anyone.

It is there, until the next foot pauses.

**Anchor sentence**: it keeps itself; so no one keeps it.
**锚句**：它守住自己，便无人守它。

---

## Model mapping (echo No. 13)

| Category | Title | Corresponds to |
|---|---|---|
| lore | The Threshold · the Lamp · Firewood and Water · the Ledger | I–VI |
| geography | The Grey Cover · the Threshold · the Tidal Flats Beyond · Beneath the Lamp | I–VI |
| factions | Those Inside · the Firewood and Water Bearers Outside | I–VI |
| characters | The One Inside · the Bearers Outside · the Keeper of the Ledger | I–VI |
| items | The Wooden Threshold · the Firewood · the Bucket · the Ledger · the Lamp | I–VI |
| story | The Mist Harbor · the Grey Cover · Echo (No. 13) | whole |
| history | After the Iron-Moon Age · Before the Grey Cover Was Laid | I–VI |

> The threshold does not say which side is farther —
> it only keeps every step within its grain.
>
> 门槛不说哪一边了更远——
> 它只把每一步都留在自己的木纹里。
`,
  },
] as const;
