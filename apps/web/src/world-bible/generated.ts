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
  {
    order: 32,
    slug: 'echo-032-the-tide-table-with-one-row-wrong',
    titleZh: '祠殿后那张印错的潮汐表',
    titleEn: 'The Tide-Table Behind the Chapel With One Row Wrong',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——米缸月新誊抄的晨风。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the morning air of a rice-jar month transcription.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 32): The Tide-Table Behind the Chapel With One Row Wrong

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿后室里的那本潮汐表——潮候院所有抄本都留着一行永远走反的「东」/"east"——抄本员从不纠正它。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the tide-table behind the chapel — the Institute keeps one row permanently reversed ("east"); the copyists never correct it.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——米缸月新誊抄的晨风。
> Era: the Institute — after the 41st Convocation; the morning air of a rice-jar month transcription.

---

## 一 · 每年那一册总会「错」一行

潮候院每年抄一册潮汐表——四十一次大会散会之后，每一册都必留一行：东向的方向不对。

抄本员誊写的时候——前辈从来不纠；值守长每次遇到必然点头。

新来的抄本员第一遍誊抄完都会回去想：到底是不是我看错了？不——他没敢说——承认了他那一页这一行反了，前辈会让他重新誊一次——

重事了。

**锚句**：潮候院每册潮汐表里都有一行东向的方向不对——抄写的人没有纠错的资格。
**Anchor sentence**: each tide-table of the Institute carries one row of "east" facing backwards — no copyist is qualified to correct it.

---

## 二 · 前辈说「留给它」的那一页

新来的抄本员问：「这一行是不是誊错了？」

前辈答一句：「潮候院只会把它留着——抄写、誊录、复印，从不改写。」——

前辈们只是从上一代抄下这行的字，没有人问过"为什么是它"。潮汐表自一册抄到下一册——错的这行纸抄了四十一次以上——抄本员两次换手，行依然不对。

**锚句**：前辈只简单说一句「留给它」——抄写的人从不纠正那一行。
**Anchor sentence**: the seniors simply say "leave it" — those who transcribe never modify that row.

---

## 三 · 旧抄本里那行的上下各自重写

潮汐表的某一册页上——抄本员抄错了一行——值守长拿着一根潮笔要抄本员拿这份重新起稿。

中间的那一行——也是"错的那一行"——还是那一行：「东 — 潮 — 向西」——落笔的角度还是同一册原来的角度。

前辈说：它不是错的——它是「东向的」留给潮的方向。

**锚句**：抄错的人从潮笔回来补——那一行的角度本身是留给潮的。
**Anchor sentence**: those who mis-copy return with the tide-brush — the angle of that row is reserved for the tide.

---

## 四 · 潮汐表从不签名

潮候院的抄本员——他们知道米缸月潮候院一册册抄潮汐表：抄完不签则护住封面。毫不含混地说，这是值守长的个人分寸。

潮候院的潮汐表从来没有盖缀过签章。抄本员吃饭的时候值守长接过抄完的册子——看着那一行——放下——没说：

**锚句**：潮汐表每年誊抄完一次永远不会签名——潮候院的分寸值守长自己掌握。
**Anchor sentence**: each year's finished tide-table is never signed — the Institute's discretion rests with the headkeeper alone.

---

## 五 · 「东向」那页不在潮沙盘里

抄本员告诉了新来的值守一件事：潮候院没有人知道潮为什么留那一册潮汐表的那一行「不对」。值守长说：它是给海看；给潮候院之外的某一个东西看。

没有潮候院的值守能说出"那一行是什么"——但是潮候院没有谁能拦着抄本员每年抄下去。

**锚句**：那一行潮沙盘里没有人讲清过——值守长也只说是给海看的。
**Anchor sentence**: that row is not explained at the sand table either — the headkeeper says only it is for the sea.

---

## 六 · 映射（回响三十二章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 潮汐表的东向 · 留给它 · 半月章 | 一、二、三、四、五、六 |
| geography | 祠殿后室 · 里巷子誊抄堂 · 米缸月誊抄堂 | 一、二、四、五、六 |
| characters | 抄本员 · 里巷子值守长 · 守表的人 | 一、二、三、四、五、六 |
| story | 印错的潮汐表 · 回响（其三十二） | 全篇 |
| items | 潮汐表 · 半月章 · 潮笔 · 错行 · 誊抄堂 | 一、二、三、四、五、六 |
| history | 四十一次大会 · 米缸月誊抄早晨 · 潮候院 | 一、二、三、四、五、六 |

> 下一次大会散会之后值守会接到一册新潮汐表——那一行里的值守看了潮汐表后会把它收起来，抄本员没第二次动过那一行。
> After the next Convocation, the watchers will be given a new tide-table — they will shelve that one row; no copyist is to move it.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其三十二）「祠殿后那张印错的潮汐表」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿后室里的那本潮汐表——潮候院所有抄本都留着一行永远走反的「东」/"east"——抄本员从不纠正它。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the tide-table behind the chapel — the Institute keeps one row permanently reversed ("east"); the copyists never correct it.
> Same discipline: anchors verbatim.

> Era: the Institute — after the 41st Convocation; the morning air of a rice-jar month transcription.
> 纪元：潮候院 · 第四十一次大会散会之后——米缸月新誊抄的晨风。

---

## 一 · Every Year's Table Misses One Row

The Institute transcribes one tide-table a year — after the forty-first Convocation dispersed, every copy is bound to carry one row reading the wrong way: the "east" row, facing against the east.

When the copyists transcribe — the seniors never correct — the headkeeper nods every time.

The newly arrived copyist copying for the first time always wonders: did I read it upside down? — no one dares say so; admitting the row is backwards only means being asked to copy again —

and it has.

**锚句**：潮候院每册潮汐表里都有一行东向的方向不对——抄写的人没有纠错的资格。
**Anchor sentence**: each tide-table of the Institute carries one row of "east" facing backwards — no copyist is qualified to correct it.

---

## 二 · The Page the Seniors Call "Leave It"

A new copyist asks: "Is this row a mistake?"

The senior answers: "The Institute leaves it — we copy, we transcribe, we reproduce — we never rewrite."

The seniors copy the row forward from generation to generation — the same reversed row has been transcribed more than forty-one times — copyists have switched twice, the row still runs the wrong way.

**锚句**：前辈只简单说一句「留给它」——抄写的人从不纠正那一行。
**Anchor sentence**: the seniors simply say "leave it" — those who transcribe never modify that row.

---

## 三 · The Old Manuscript Where The Break Is Not A Break

A page in one of the tide-tables — a copyist had produced a mis-copy — the headkeeper gave him a tide-brush and sent him back to start again.

The same row — the one that "was not a mistake" — was again the same row: "east — tide — west-leaning" — the stroke angle backwards as in the original.

The seniors say: it is not an error — it is "east," reserved for the tide's own direction.

**锚句**：抄错的人从潮笔回来补——那一行的角度本身是留给潮的。
**Anchor sentence**: those who mis-copy return with the tide-brush — the angle of that row is reserved for the tide.

---

## 四 · The Table Is Never Signed

The copyists are aware that each table copied in the Institute is sealed without signature. Speaking plainly, it is the headkeeper's own discretion.

No tide-table has ever been signed. The copyists set down their brush and take their hand off the page; the headkeeper takes the finished table — looks at that one row — sets it down — says nothing.

**锚句**：潮汐表每年誊抄完一次永远不会签名——潮候院的分寸值守长自己掌握。
**Anchor sentence**: each year's finished tide-table is never signed — the Institute's discretion rests with the headkeeper alone.

---

## 五 · The "East Row" Is Not in the Sand Table

The copyists tell the new watchers one thing: no one in the Institute knows why the one row of that table "is wrong." The headkeeper says: it is given to the sea; something outside this Institute watches it.

No watcher in the Institute can say what that row is — but no one can stop the copyists from transcribing it every year.

**锚句**：那一行潮沙盘里没有人讲清过——值守长也只说是给海看的。
**Anchor sentence**: that row is not explained at the sand table either — the headkeeper says only it is for the sea.

---

## 六 · Mapping（Echo No. 32 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The row marked "East" · leave it be · half-moon chapter | 一、二、三、四、五、六 |
| geography | The chapel's back room · the back-alley the scriptorium | 一、二、四、五、六 |
| characters | The copyists · the headkeeper · those who preserve the tables | 一、二、三、四、五、六 |
| story | The Tide-Table With the Wrong Row · Echo No. 32 | 全篇 |
| items | The tide-table · the half-moon chapter · the tide-brush · the wrong row | 一、二、三、四、五、六 |
| history | The forty-first Convocation · the morning of a rice-jar month transcription | 一、二、三、四、五、六 |

> 下一次大会散会之后值守会接到一册新潮汐表——那一行里的值守看了潮汐表后会把它收起来，抄本员没第二次动过那一行。
> After the next Convocation, the watchers will be given a new tide-table — they will shelve that one row; no copyist is to move it.
`,
  },
  {
    order: 33,
    slug: 'echo-033-the-letter-of-the-forty-first-convocation',
    titleZh: '四十一次大会那天一并封起来的那封信',
    titleEn: 'The Letter Sealed at the Forty-First Convocation',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——米缸月第二十一日的值更班。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the watcher\'s shift on the twenty-first day of the rice-jar month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 33): The Letter Sealed at the Forty-First Convocation

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给四十一次大会散会那天被封起的那封蜡封信——抄本员每年只翻看一次；值守册上登记它的页码就是今天的事了。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the letter sealed on the day the forty-first Convocation dispersed — the copyists see it once a year; the watcher log records it as an entry.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——米缸月第二十一日的值更班。
> Era: the Institute — after the 41st Convocation; the watcher's shift on the twenty-first day of the rice-jar month.

---

## 一 · 封信

四十一次大会散会那天的傍晚——

抄本员收档的时候，里巷子值守在潮沙盘边留了一封蜡封函。外面只有一个半月镜形的印。

值守把它安置好——不开启——不送——不看。米缸月的值守记录里多了一行字：「潮沙盘处多一封，来源不明，收件人未知。」

**锚句**：米缸月初收档——潮沙盘边多了一封蜡封。
**Anchor sentence**: the rice-jar month opening shift — a sealed letter appeared on the sand table.

---

## 二 · 抄本员翻看它

抄本员岁末清点抄本时——值守长交代潮候院所有重要的誊抄册都要对看一眼：

从那一天起，记录登记册上多了一行固定条目——「米缸月廿一日初筛：原件在原处。」——米缸月第二十一天早上抄本员都要再看一眼，确认它还在原位。

从未被打开过。

**锚句**：米缸月廿一早上米缸月的值守总要看它——米缸月的值守总要确保它还在原处。
**Anchor sentence**: every morning of the twenty-first of the rice-jar month, the watcher checks — it is still in place.

---

## 三 · 没人打开看过

米缸月抄本员某年问前辈：「那封信是谁的？内容是什么？」

前辈只反问了一句：「为什么要看？」

潮候院第五十三年的值守把这一行誊抄完——抄本员感叹了一句：潮候院没有想要打开它的意思——潮候院也没有被允许打开它。

**锚句**：值守嘱托了关于它的那一页——抄本员没人打开过它。
**Anchor sentence**: regarding that page, the watchers relayed one instruction — no copyist ever opened it.

---

## 四 · 值守长在哪一年

七十二年建院——某一年的值守长还是从抄本员做起的——抄本员某夜里梦见一包字、一个半月印、一只手正把它封起来。

他醒来翻值班册——那封蜡封函的页码在值班册里——

页码一直没翻过——抄本员第七十年没翻过——前辈只把他当抄本员审，没有任何人打开它。

**锚句**：抄本员梦见了一只手封它——他睁开眼睛翻值班册——没再翻过。
**Anchor sentence**: once a copyist dreamed a hand sealing it — he opened the register and never turned that page again.

---

## 五 · 给海的值守

潮沙盘值守偶尔会看潮沙盘——看到那封蜡封函：

它没被从米缸月拿走过、没被从里巷子带走过。米缸月值守第一遍可能以为自己记错了；米缸月第二遍可能想移过位置——第二遍后他检查了米缸月第三遍发现还是不行：

那一页的抄本法特别——值守打定的意思是：潮候院米缸月米缸月米缸月里值守只能看一次——但无人知道。

**锚句**：潮沙盘的值守偶尔会去看它——但潮候院的规则就是没人打开过它。
**Anchor sentence**: watchers occasionally check on it — the Institute's rule is that no one has opened it.

---

## 六 · 映射（回响三十三章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 四十一次大会的蜡封信 · 米缸月的值更 · 抄本员的梦境 | 一、二、三、四、五、六 |
| geography | 祠殿 · 里巷子 · 米缸月里巷子 · 潮候院 | 一、二、三、五、六 |
| characters | 抄本员 · 里巷子值守长 · 米缸月的值更 | 一、二、三、四、五 |
| story | 四十一次大会那天封起来的那封信 · 回响（其三十三） | 全篇 |
| items | 蜡封信 · 半月镜印 · 米缸月值更 · 潮沙盘 | 一、二、三、四、五、六 |
| history | 米缸月廿一日 · 六十九年 · 七十二年建院 | 一、二、四、五、六 |

> 下一次大会——里巷子的值更会翻那一页确认它还存在。
> At the next Convocation, the watcher will flip that page and confirm it is still there.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其三十三）「四十一次大会那天一并封起来的那封信」

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给四十一次大会散会那天被封起的那封蜡封信——抄本员每年只翻看一次；值守册上登记它的页码就是今天的事了。
> 纪律同正典。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the letter sealed on the day the forty-first Convocation dispersed — the copyists see it once a year; the watcher log records it as an entry.
> Same discipline: anchors verbatim.

> Era: the Institute — after the 41st Convocation; the watcher's shift on the twenty-first day of the rice-jar month.
> 纪元：潮候院 · 第四十一次大会散会之后——米缸月第二十一日的值更班。

---

## 一 · The Sealing

On the evening when the forty-first Convocation dispersed —

When the copyists finished their evening shift, the watcher of the back alley placed a sealed letter near the sand table. Only a half-moon stamp marked it from the outside.

The watcher placed it — did not open it — did not deliver it — did not read it. That night the rice-jar month register gained a line: "An item appeared beside the sand table. Origin unknown. Addressee unknown."

**锚句**：米缸月初收档——潮沙盘边多了一封蜡封。
**Anchor sentence**: the rice-jar month opening shift — a sealed letter appeared on the sand table.

---

## 二 · The Copyist's Once-Yearly Check

At year-end, the headkeeper reminded the copyists that all important registers must be cross-read —

From that day, the register carried one fixed line: "The twenty-first of the rice-jar month, first screening: it is in place." — every twenty-first, the copyists check once more that the letter is still where it was.

It has never been opened.

**锚句**：米缸月廿一早上米缸月的值守总要看它——米缸月的值守总要确保它还在原处。
**Anchor sentence**: every morning of the twenty-first of the rice-jar month, the watcher checks — it is still in place.

---

## 三 · Nobody Has Ever Opened It

A copyist once asked his senior: "Whose letter is it? What does it say?"

The senior answered only: "Why would you look?"

By the fifty-third year of the Institute a watcher completed that page too — the copyist observed that the Institute had no intention of opening it, and was not permitted to.

**锚句**：值守嘱托了关于它的那一页——抄本员没人打开过它。
**Anchor sentence**: regarding that page, the watchers relayed one instruction — no copyist ever opened it.

---

## 四 · The Headkeeper Dreamed It

The headkeeper of this year had started as a copyist — one night he dreamed of a packet, a half-moon seal, and a hand sealing it.

He woke and opened the shift register — the page for that letter was there —

The page was never turned; the headkeeper did not open it either. Neither he nor any copyist since that dream has.

**锚句**：抄本员梦见了一只手封它——他睁开眼睛翻值班册——没再翻过。
**Anchor sentence**: once a copyist dreamed a hand sealing it — he opened the register and never turned that page again.

---

## 五 · The Watchers Who Come Near It

The watcher keeps an eye on the sand table — the letter is there:

It was never moved; never brought elsewhere; the third time the watcher came to check, the page was still completely untouched — the Institute's watcher check is once a year, on the twenty-first of the rice-jar month.

**锚句**：潮沙盘的值守偶尔会去看它——但潮候院的规则就是没人打开过它。
**Anchor sentence**: watchers occasionally check on it — the Institute's rule is that no one has opened it.

---

## 六 · Mapping（Echo No. 33 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The letter sealed during the forty-first Convocation · the rice-jar month shift · the copyist's dream | 一、二、三、四、五、六 |
| geography | The chapel · the back alley · the rice-jar month · the Institute | 一、二、三、五、六 |
| characters | The copyists · the headkeeper · the rice-jar month watcher | 一、二、三、四、五 |
| story | The Letter of the Forty-First Convocation · Echo No. 33 | 全篇 |
| items | The sealed letter · the half-moon seal · the rice-jar month shift · the sand table | 一、二、三、四、五、六 |
| history | The twenty-first of the rice-jar month · the institute's 69th year · the 72nd founding year | 一、二、四、五、六 |

> 下一次大会——里巷子的值更会翻那一页确认它还存在。
> At the next Convocation, the watcher will flip that page and confirm it is still there.
`,
  },
  {
    order: 34,
    slug: 'echo-034-the-old-sea-chart-in-the-chapel-cellar',
    titleZh: '祠殿地下室里那张旧海图',
    titleEn: 'The Old Sea Chart in the Chapel Cellar',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——米缸月第二十九日的值更班。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the watcher\'s shift on the twenty-ninth day of the rice-jar month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 34): The Old Sea Chart in the Chapel Cellar

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿地下室那只木箱——里面压着潮候院唯一的一张海图；值更每三年开箱盘点一次，从不展开它。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the wooden crate in the chapel cellar — it holds the only sea chart the Institute owns; the watcher inventories it every third year, and never unrolls it.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——米缸月第二十九日的值更班。
> Era: the Institute — after the 41st Convocation; the watcher's shift on the twenty-ninth day of the rice-jar month.

---

## 一 · 潮候院唯一的一张海图

祠殿是潮候院里最旧的一间屋。地下一层是米缸月值更们放箱子的地方——箱子按米缸月排列，谁也记不清有多少只。

最里面的那只木箱上没有任何标签。抄本员只知道它压着一卷东西——那东西从开院第一年起就一直是这潮候院唯一的一张海图。

**锚句**：潮候院唯一的一张海图压在祠殿地下室最里面那只木箱里。
**Anchor sentence**: the Institute's only sea chart lies pressed inside the wooden crate at the very back of the chapel cellar.

---

## 二 · 每三年盘点一次

值更每三年盘点一次。流程从不临时改变：米缸月的值更带着登记册下楼，数数木箱的编号，核对封条，然后签名。

登记册上写着三行字：物品：海图；状态：完整；行动：不动。三行字抄了多少遍——没人数过。

**锚句**：登记册上写着三行字：海图，完整，不动。
**Anchor sentence**: the inventory names the sea chart: condition intact; instruction: leave alone.

---

## 三 · 抄本员的一次心动

某抄本员在第二十六年生日那天第一次好奇——问前辈能不能把它摊开描一描。

前辈说了一句。那句话被传抄了一辈子。

**锚句**：值更长说：你描出来的，不是它。
**Anchor sentence**: the headkeeper said: what you copy will not be it.

---

## 四 · 米缸月的值更解释

米缸月的值更偶尔会把话匣子打开半格。他说图上画的不是潮候院认识的海岸——它第一次走样的那一年，大海往东挪了将近一个灯塔的距离。

潮汐表第一次不准，不是表错了，是海挪了。

**锚句**：图画的不是海岸线，是改过道的大海。
**Anchor sentence**: the chart shows no coast — it shows the sea after it changed course.

---

## 五 · 它从来没被展开过

六十九年里，抄本员们没有人见过它被展开。米缸月的值更没有人见过它被展开。米缸月的值更换班之前唯一的一次交代是：交箱子，不交开箱。

木箱锁上只有一枚园形印章——潮候院唯一的一把钥匙，保存在米缸月的值更的值更院深处。

**锚句**：木箱锁上的那枚圆印，潮候院只有一把钥匙开得开。
**Anchor sentence**: the round seal on the crate's lock — the Institute keeps only one key that opens it.

---

## 六 · 映射（回响三十四章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 祠殿地下室 · 潮候院唯一的一张海图 · 米缸月的值更册 | 一、二、三、四、五、六 |
| geography | 祠殿 · 米缸月里巷子 · 值更院 | 一、二、四、五、六 |
| characters | 米缸月的值更 · 抄本员 · 值更长 | 一、二、三、四、五 |
| story | 不动的那张海图 · 回响（其三十四） | 全篇 |
| items | 木箱 · 半月章钥匙 · 登记册 · 海图 | 一、二、三、四、五、六 |
| history | 第四十一次大会散会之后 · 第七十二年建院年鉴 | 一、二、四、五、六 |

> 下一次盘点到那只木箱的时候，米缸月的值更还会数编号、核封条、签名——然后上楼，假装没开过箱子。
> At the next inventory, the watcher will count the crate, check the seal, sign his name — then climb back upstairs as if nothing happened.
`,
    markdownEn: `
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the wooden crate in the chapel cellar — it holds the only sea chart the Institute owns; the watcher inventories it every third year, and never unrolls it.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿地下室那只木箱——里面压着潮候院唯一的一张海图；值更每三年开箱盘点一次，从不展开它。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the watcher's shift on the twenty-ninth day of the rice-jar month.
> 纪元：潮候院 · 第四十一次大会散会之后——米缸月第二十九日的值更班。

---

## 一 · The Institute's Only Sea Chart

The chapel is the oldest room in the Institute. Its cellar holds crates upon crates — lined up by festival, and no one can remember how many.

The crate at the very back carries no label. Copyists only know what it presses against — the only sea chart the Institute has owned since its first year.

**锚句**：潮候院唯一的一张海图压在祠殿地下室最里面那只木箱里。
**Anchor sentence**: the Institute's only sea chart lies pressed inside the wooden crate at the very back of the chapel cellar.

---

## 二 · Inventory Every Third Year

The watcher comes down every three years. The procedure never changes: he brings the register, counts the crate's number, checks the seal, and signs.

The register holds three lines: Object: sea chart. Condition: intact. Action: leave alone. No one has ever counted how many times they were copied.

**锚句**：登记册上写着三行字：海图，完整，不动。
**Anchor sentence**: the inventory names the sea chart: condition intact; instruction: leave alone.

---

## 三 · A Copyist's Curiosity

On his twenty-sixth year, a copyist grew curious — he asked his senior whether they might unroll it and make a copy.

The senior said one sentence. It has been quoted ever since.

**锚句**：值更长说：你描出来的，不是它。
**Anchor sentence**: the headkeeper said: what you copy will not be it.

---

## 四 · What the Watcher Said Once

The watcher of the rice-jar month sometimes opens the topic a half-inch. He said the coast drawn on the chart is not the one the Institute knows — the year it first went wrong, the sea shifted east by almost a lighthouse's length.

The tide table was not wrong the first time. The sea moved.

**锚句**：图画的不是海岸线，是改过道的大海。
**Anchor sentence**: the chart shows no coast — it shows the sea after it changed course.

---

## 五 · It Has Never Been Unrolled

In sixty-nine years, no copyist has seen it opened. No watcher has either. The single instruction handed from one watcher to the next is always the same: hand over the crate, not the key.

The crate's lock carries one round seal — the only key in the Institute is kept in the deepest room of the watcher's courtyard.

**锚句**：木箱锁上的那枚圆印，潮候院只有一把钥匙开得开。
**Anchor sentence**: the round seal on the crate's lock — the Institute keeps only one key that opens it.

---

## 六 · Mapping（Echo No. 34 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The chapel cellar · the Institute's only sea chart · the watcher's ledger | 一、二、三、四、五、六 |
| geography | The chapel · the back alley · the watcher's courtyard | 一、二、四、五、六 |
| characters | The rice-jar-month watcher · the copyists · the headkeeper | 一、二、三、四、五 |
| story | The chart that must not be moved · Echo No. 34 | 全篇 |
| items | The wooden crate · the round-seal key · the inventory register · the sea chart | 一、二、三、四、五、六 |
| history | After the 41st Convocation · the 72nd founding year | 一、二、四、五、六 |

> 下一次盘点到那只木箱的时候，米缸月的值更还会数编号、核封条、签名——然后上楼，假装没开过箱子。
> At the next inventory, the watcher will count the crate, check the seal, sign his name — then climb back upstairs as if nothing happened.
`,
  },
  {
    order: 35,
    slug: 'echo-035-the-stone-basin-that-never-runs-dry',
    titleZh: '祠殿侧门外那只从不干的石凹',
    titleEn: 'The Stone Basin Beside the Side Door of the Chapel That Never Runs Dry',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——米缸月第三十日的值更班。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the watcher\'s shift on the thirtieth day of the rice-jar month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 35): The Stone Basin Beside the Side Door of the Chapel That Never Runs Dry

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿侧门外那只常年有水的石凹——大旱年里它也不干；值更说那是潮往上倒灌进来的。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the stone basin beside the chapel's side door — it stays full even in the driest years; the watchers say the tide pours back up into it.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——米缸月第三十日的值更班。
> Era: the Institute — after the 41st Convocation; the watcher's shift on the thirtieth day of the rice-jar month.

---

## 一 · 祠殿侧门外

祠殿的侧门不开，米缸月的值更每天路过那里，只会看见一只石凹贴着墙根。

石凹不是方的，也不是圆的——像某个大雨夜里后退的海留下来的痕迹。米缸月的值更摸过它：里面常年有水。

**锚句**：祠殿侧门外那只石凹，米缸月的值更六十九年没见它干过。
**Anchor sentence**: the stone basin by the side door of the chapel — in sixty-eight years, no watcher has seen it run dry.

---

## 二 · 值更说是潮倒灌

某次大旱——连潮沙盘的一格都迟迟落不下来——抄本员问里巷值更：「那水是天上来的吗？」

值更说了四个字：潮，倒灌的。

潮候院脚下的潮汐表在石凹下面，值更说：「潮到那一刻，它就从下面上来了。」

**锚句**：值更说：那是满潮的那一刻，潮从下面上来的。
**Anchor sentence**: the watcher said — at the top of the tide, the sea comes up from underneath.

---

## 三 · 半月章印了四次

半月章是米缸月值更最庄重的一枚章——四十一次大会散会之后，值更册登记着它贴在石凹边的次数：四次。

哪一年贴的？值更册没有写年份。抄本员只记得第三次那年，里巷子里有个远路的抄本员仰着头看了一眼，没人问他看见了什么。

**锚句**：值更册登记着半月章在石凹边盖的次数：四次。
**Anchor sentence**: the watcher register records four times the half-moon seal has been pressed on the basin's rim.

---

## 四 · 水里那一眼

某次在米缸月月末，抄本员往石凹里看了一眼，他后来只跟一个人说过——对方是后来的米缸月值更。

他说水面上有一点光，像一枚镜子被什么东西压在水底。米缸月值更没有核对，他没有往下问——他只记住了那一个词：镜子。

**锚句**：抄本员往水里看了一眼，只跟一人说过那里有一枚镜子。
**Anchor sentence**: a copyist looked into the water once and told exactly one person there was a mirror in it.

---

## 五 · 米缸月的值更册规定

值更册上某页说过：匣子放回去，不越界。没有人问匣子是哪一只——大约一共也只有一只。

米缸月的值更换班之前最后一遍检查的东西不是那扇方窗，不是那只木箱，是那只石凹——他按旧规矩弯下腰看一眼，就走了。

**锚句**：米缸月的值更换班前最后一眼，落在那只石凹上。
**Anchor sentence**: the last thing the watcher sees before handing over is that stone basin.

---

## 六 · 映射（回响三十五章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 祠殿侧门 · 常年不干的石凹 · 半月章四次 | 一、二、三、四、五、六 |
| geography | 祠殿侧门 · 里巷子 · 值更院 | 一、二、四、五、六 |
| characters | 里巷子值更 · 米缸月值更 · 抄本员 | 一、二、三、四、五 |
| story | 石凹与镜子 · 回响（其三十五） | 全篇 |
| items | 石凹 · 半月章 · 值更册 · 潮沙盘 | 一、二、三、四、五、六 |
| history | 第四十一次大会散会之后 · 潮候院第六十九年 | 一、二、四、五、六 |

> 下一次大旱的时候，米缸月的值更还会下楼弯下腰——水，多半还在。
> At the next drought, the watcher will bend down again — the water, most likely, will still be there.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其三十五）「祠殿侧门外那只从不干的石凹」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the stone basin beside the chapel's side door — it stays full even in the driest years; the watchers say the tide pours back up into it.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿侧门外那只常年有水的石凹——大旱年里它也不干；值更说那是潮往上倒灌进来的。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the watcher's shift on the thirtieth day of the rice-jar month.
> 纪元：潮候院 · 第四十一次大会散会之后——米缸月第三十日的值更班。

---

## 一 · By the Side Door of the Chapel

The chapel's side door does not open. The watchers of the rice-jar month pass by it every day — and every day they see the same stone basin tucked against the wall.

The basin is neither square nor round — it is shaped like the mark a retreating sea left behind on one very wet night. Whoever touches it finds it is never empty.

**锚句**：祠殿侧门外那只石凹，米缸月的值更七十二年没见它干过。
**Anchor sentence**: the stone basin by the side door of the chapel — in sixty-nine years, no watcher has seen it run dry.

---

## 二 · The Watchers Say the Tide Pours Back

During the last drought — when the sand table struggled to drop a single grain — a copyist asked the watcher of the back alley: "Is that water from the sky?"

The watcher answered with four words: the tide, pouring back.

The tide table lies under that basin, the watcher said: "And at the top of the tide, it comes up from underneath."

**锚句**：值更说：那是满潮的那一刻，潮从下面上来的。
**Anchor sentence**: the watcher said — at the top of the tide, the sea comes up from underneath.

---

## 三 · The Half-Moon Seal Was Pressed Four Times

The half-moon seal is the most solemn seal the watcher of the rice-jar month owns. The register records that after the forty-first Convocation dispersed, it was pressed against the basin's rim four times.

Which years? The register does not hold the dates. One copyist only remembers the third year — a traveling copyist looked up at the basin for a long moment, and no one asked what he saw.

**锚句**：值更册登记着半月章在石凹边盖的次数：四次。
**Anchor sentence**: the watcher register records four times the half-moon seal has been pressed on the basin's rim.

---

## 四 · The Copyist's Single Glimpse

One evening near the end of the rice-jar month, a copyist peered into the basin — and in sixty-nine years he told only one person — that person would become the next watcher of the rice-jar month.

He said there was a glint in the water, as if a mirror had been pressed to the bottom. The watcher never verified it and never asked further — he only kept that one word: mirror.

**锚句**：抄本员往水里看了一眼，只跟一人说过那里有一枚镜子。
**Anchor sentence**: a copyist looked into the water once and told exactly one person there was a mirror in it.

---

## 五 · The Institute's Own Rule

A page in the register reads: return the box, do not cross the line. No one ever asked which box — there was only one, after all.

Before handing over, the watcher of the rice-jar month does not check the square window, not the sea-chart crate — he bends down for one glance at that basin, and leaves.

**锚句**：米缸月的值更换班前最后一眼，落在那只石凹上。
**Anchor sentence**: the last thing the watcher sees before handing over is that stone basin.

---

## 六 · Mapping（Echo No. 35 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The side door of the chapel · the basin that never runs dry · the half-moon seals | 一、二、三、四、五、六 |
| geography | The chapel side door · the back alley · the watcher's courtyard | 一、二、四、五、六 |
| characters | The watcher of the back alley · the watcher of the rice-jar month · the copyists | 一、二、三、四、五 |
| story | The basin and the mirror · Echo No. 35 | 全篇 |
| items | The stone basin · the half-moon seal · the watcher's register · the tide sand table | 一、二、三、四、五、六 |
| history | After the 41st Convocation · the 69th year of the Institute | 一、二、四、五、六 |

> 下一次大旱的时候，米缸月的值更还会下楼弯下腰——水，多半还在。
> At the next drought, the watcher will bend down again — the water, most likely, will still be there.
`,
  },
  {
    order: 36,
    slug: 'echo-036-the-grain-that-never-sinks',
    titleZh: '值更院米缸里那粒从不沉下去的米',
    titleEn: 'The Grain of Rice in the Watcher\'s Rice Jar That Never Sinks',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——米缸月第七日的值更班。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the watcher\'s shift on the seventh day of the rice-jar month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 36): The Grain of Rice in the Watcher's Rice Jar That Never Sinks

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院值更院米缸月每天早上的那只米缸——最上面的那一粒米六十九年没有沉下去过。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the rice jar in the watcher's courtyard — the grain at its surface has not sunk in sixty-nine years.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——米缸月第七日的值更班。
> Era: the Institute — after the 41st Convocation; the watcher's shift on the seventh day of the rice-jar month.

---

## 一 · 米缸的值更院

值更院有一个米缸。每天早上，值更们自己来领当日的三两米，自己煮，自己吃。

没人数过这个缸里还剩多少。也没人问过值更长：「这个缸子什么时候该换一缸？」

**锚句**：每个值更早上来领自己的三两米。
**Anchor sentence**: every watcher comes at morning for his own three taels of rice.

---

## 二 · 那一粒

某个值更舀米的时候，看见缸面上有一粒米一直浮在那里——没人捞过它，它也从没沉下去过。

后来的值更们见怪不怪了。轮到值更舀米的那天，大家都会多看一眼那一粒。

**锚句**：那粒米浮在缸面上，六十九年没沉下去过。
**Anchor sentence**: that one grain floats on the jar's surface — in sixty-nine years it never sinks.

---

## 三 · 筷子拨过一次

某一年——具体是哪一年，米缸月的值更册上没写——抄本员想：「它是真的米吗？」

他用筷子把那一粒拨了一下，拨出去两寸远。第二天早上，那粒米又浮回原来的位置。抄本员没跟任何人说这件事。

**锚句**：筷子拨过一次，次日它又浮回原位。
**Anchor sentence**: poked once with a pair of chopsticks — the next morning it floated back to its place.

---

## 四 · 值更册上的一行字

米缸月第五日的值更册里有一行字。抄本员抄过那一行，他记得每一个字，写得很轻：

缸里有一粒米不许拿出来。

下面没有一个字的解释。米缸月过去了，那一行字也没再加字。

**锚句**：米缸月第五日的值更册写着一行字：缸里有一粒米不许拿出来。
**Anchor sentence**: the register of the fifth of the rice-jar month holds one line: do not take out that grain.

---

## 五 · 月亮派下来的一粒

米缸月的值更有一任值更特别年长，说了一句别人至今都没接上话的话：

那是月亮派下来的一粒——它替月亮看着值更院。

他说完这句话就笑了。米缸月的年轻值更们谁也没接他的话，因为谁也不知道该接什么。

**锚句**：值更们管它叫月亮派下来的那一粒。
**Anchor sentence**: the watchers call it the grain the moon sent down.

---

## 六 · 映射（回响三十六章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 值更院米缸 · 那一粒米 · 值更册上那一行字 | 一、二、三、四、五、六 |
| geography | 值更院 · 里巷子 · 米缸月 | 一、二、四、五、六 |
| characters | 米缸月的值更 · 抄本员 · 值更长 | 一、二、三、四、五 |
| story | 月亮派下来的一粒 · 回响（其三十六） | 全篇 |
| items | 米缸 · 那一粒米 · 值更册 · 筷子 | 一、二、三、四、五、六 |
| history | 第四十一次大会散会之后 · 潮候院第六十九年 | 一、二、四、五、六 |

> 下一次米缸月值更换班的时候，会有新值更舀起第一勺米——他会看到那一粒还在。
> At the next rice-jar month's watcher changeover, the new watcher will scoop the first ladle — and see that grain, still there.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其三十六）「值更院米缸里那粒从不沉下去的米」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the rice jar in the watcher's courtyard — the grain at its surface has not sunk in sixty-nine years.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院值更院米缸月每天早上的那只米缸——最上面的那一粒米六十九年没有沉下去过。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the watcher's shift on the seventh day of the rice-jar month.
> 纪元：潮候院 · 第四十一次大会散会之后——米缸月第七日的值更班。

---

## 一 · The Rice Jar in the Watcher's Courtyard

The watcher's courtyard keeps a rice jar. Every morning, the watchers come for their own three taels, to boil and eat on their own.

No one has counted how much is left in that jar. No one has asked the headkeeper when it should be changed.

**锚句**：每个值更早上来领自己的三两米。
**Anchor sentence**: every watcher comes at morning for his own three taels of rice.

---

## 二 · That One Grain

Once, while scooping rice, a watcher noticed a single grain floating on the surface — untouched by every scoop, never sinking.

The watchers came to take it as normal. Any day it is a watcher's turn to scoop, everyone gives that grain one extra look.

**锚句**：那粒米浮在缸面上，六十九年没沉下去过。
**Anchor sentence**: that one grain floats on the jar's surface — in sixty-nine years it never sinks.

---

## 三 · A Pair of Chopsticks

One year — the register of the rice-jar month does not say which — a copyist wondered: is it really rice?

He poked it with a pair of chopsticks, about two finger-widths. The next morning, that grain had floated back to exactly its place. He never told anyone.

**锚句**：筷子拨过一次，次日它又浮回原位。
**Anchor sentence**: poked once with a pair of chopsticks — the next morning it floated back to its place.

---

## 四 · The One Line in the Register

In the register of the fifth of the rice-jar month, there is one line. The copyist has transcribed it — he remembers every character, written very lightly:

Do not take out that grain.

No explanation below it. The rice-jar month passed, and the line gained nothing after it.

**锚句**：米缸月第五日的值更册写着一行字：缸里有一粒米不许拿出来。
**Anchor sentence**: the register of the fifth of the rice-jar month holds one line: do not take out that grain.

---

## 五 · The Grain the Moon Sent Down

One year, a very senior watcher of the rice-jar month said a thing no one has answered since:

That is the grain the moon sent down — it watches over the watcher's courtyard on the moon's behalf.

He laughed after he said it. The young watchers did not answer, because no one knew what an answer should look like.

**锚句**：值更们管它叫月亮派下来的那一粒。
**Anchor sentence**: the watchers call it the grain the moon sent down.

---

## 六 · Mapping（Echo No. 36 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | The watcher's rice jar · that one grain · the one line in the register | 一、二、三、四、五、六 |
| geography | The watcher's courtyard · the back alley · the rice-jar month | 一、二、四、五、六 |
| characters | The watchers of the rice-jar month · the copyists · the headkeeper | 一、二、三、四、五 |
| story | The grain the moon sent down · Echo No. 36 | 全篇 |
| items | The rice jar · that one grain · the watcher's register · the chopsticks | 一、二、三、四、五、六 |
| history | After the 41st Convocation · the 69th year of the Institute | 一、二、四、五、六 |

> 下一次米缸月值更换班的时候，会有新值更舀起第一勺米——他会看到那一粒还在。
> At the next rice-jar month's watcher changeover, the new watcher will scoop the first ladle — and see that grain, still there.
`,
  },
  {
    order: 37,
    slug: 'echo-037-the-congee-pot-that-never-leaves-the-stove',
    titleZh: '值更院米缸月最后一夜那口从不离灶的粥',
    titleEn: 'The Congee Pot That Never Leaves the Stove on the Last Night of the Rice-Jar Month',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——米缸月的最后一夜。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the last night of the rice-jar month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 37): The Congee Pot That Never Leaves the Stove on the Last Night of the Rice-Jar Month

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院值更院米缸月的最后一夜——灶上那一口粥锅二十七年没有离开过灶台。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the last night of the rice-jar month — the one pot of porridge on the stove has not left the stove in twenty-seven years.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——米缸月的最后一夜。
> Era: the Institute — after the 41st Convocation; the last night of the rice-jar month.

---

## 一 · 值更院的粥锅

值更院有一口粥锅。每天夜里的值更守着它，守着灶火、守着一锅稀粥、守着整口院子里的安静。

白天的米缸有早晚两班，值夜的粥锅只有一班。没人说过为什么粥锅要守夜——可能因为夜里更需要一口热的，也可能因为没人有力气多备一口。

**锚句**：每天夜里的值更要守着一口粥锅。
**Anchor sentence**: every watcher on the night shift keeps watch over a pot of porridge.

---

## 二 · 灶边的钉子

舀粥的勺子挂在灶边同一只钉子上。勺柄磨得发亮了，挂钩的位置每年都擦，没人动过钉子。

新来的值更有一次想顺手把勺子挂到别的钉子上，老值更拦住了他。后来那位新值更才知道，那只钉子是建院第二年钉上去的。

**锚句**：舀粥的勺子挂在灶边同一只钉子上。
**Anchor sentence**: the porridge ladle hangs on the same nail by the stove.

---

## 三 · 米缸月的勺子只舀粥

米缸月的倒数第二天，有一位值更想借那把勺子给汤打个芡。他提了一句，满院子没人接话。

过了很久，值更长才说了一句话：米缸月的勺子只舀粥，别的不舀。打芡的勺子在橱里，自己去拿。

**锚句**：米缸月的勺子只舀粥，别的不舀。
**Anchor sentence**: the rice-jar month ladle ladles only porridge — nothing else.

---

## 四 · 锅巴

每一锅粥下了火之后，锅底都会留下一层薄薄的锅巴。有值更想趁着没人看到铲下来，被老值更看见了。

锅巴不给人，留给下一任值更。吃了最后一口粥的锅，锅底的那一层留着，是给接班的那一位的——他舀第一勺的时候，会看到它还在。

**锚句**：锅巴不许给人，留给下一任值更。
**Anchor sentence**: the crust at the bottom is not for serving — it is left for the next watcher.

---

## 五 · 比大会还老的锅

米缸月最后一夜，值更们围着灶火，有一位最年长的值更说：

这口粥锅比第四十一次大会还老。它在的时候，大会的人还没来；它在到它不在的那天，值更院大概也就没了。

他说完，灶火啪地响了一声。没人问这口锅接下来会去哪。

**锚句**：这口粥锅比第四十一次大会还老。
**Anchor sentence**: this porridge pot is older than the forty-first Convocation.

---

## 六 · 守夜锅

值更们管它叫守夜锅。白天没人提这口锅，米缸月的夜里人人知道灶边还有一锅温温的东西。

第一个大会之后的第一个米缸月，第一个值更就那么守着它；下一个米缸月的最后一夜，会有别人替他守着。

**锚句**：值更们管它叫守夜锅。
**Anchor sentence**: the watchers call it the night-watch pot.

---

## 七 · 映射（回响三十七章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 粥锅 · 灶边的钉子 · 锅巴 | 一、二、三、四、五、六、七 |
| geography | 值更院 · 米缸月 · 灶台 | 一、二、三、六、七 |
| characters | 夜值的值更 · 值更长 · 新来的值更 | 一、二、三、四、五、六 |
| story | 守夜锅 · 回响（其三十七） | 全篇 |
| items | 粥锅 · 勺子 · 灶边钉子 · 锅巴 | 一、二、三、四、五、六、七 |
| history | 第四十一次大会散会之后 · 建院第六十九年 | 一、五、六、七 |

> 米缸月的最后一夜醒着的那一位，会听见锅底的粥冒一个小小的泡——那是守夜锅替下一任值更，看了一眼这个月。
> The one who stays awake on the last night of the rice-jar month will hear the bottom of the porridge pot rise one small bubble — the night-watch pot taking one glance, on the next watcher's behalf, at the passing month.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其三十七）「值更院米缸月最后一夜那口从不离灶的粥」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the last night of the rice-jar month — the one pot of porridge on the stove has not left the stove in twenty-seven years.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院值更院米缸月的最后一夜——灶上那一口粥锅二十七年没有离开过灶台。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the last night of the rice-jar month.
> 纪元：潮候院 · 第四十一次大会散会之后——米缸月的最后一夜。

---

## 一 · The Congee Pot in the Watcher's Courtyard

The watcher's courtyard keeps one congee pot. Through the night the watchers keep watch with it — over the stove fire, over the thin porridge, over the whole quiet courtyard.

The morning rice jar has two shifts; the night congee pot has only one. No one has said why the pot keeps the night watch — perhaps because the night needs something warm more, or because no one had the strength to keep a second.

**锚句**：每天夜里的值更要守着一口粥锅。
**Anchor sentence**: every watcher on the night shift keeps watch over a pot of porridge.

---

## 二 · The Nail by the Stove

The ladle that serves the porridge hangs on the same nail by the stove. The handle has been polished bright; the spot where it hooks is wiped down every year; no one has moved the nail.

Once a new watcher almost hung it on another nail, and the senior watcher stopped him. Only later did he learn that nail had been driven in the second year of the Institute.

**锚句**：舀粥的勺子挂在灶边同一只钉子上。
**Anchor sentence**: the porridge ladle hangs on the same nail by the stove.

---

## 三 · The Rice-Jar Month Ladle Ladles Only Porridge

On the second-to-last day of the rice-jar month, a watcher wanted to borrow that ladle to thicken a soup. He mentioned it once, and no one in the courtyard answered.

It was a long time before the headkeeper said one sentence: the rice-jar month ladle ladles only porridge — nothing else. The soup spoon is in the cabinet, go take it for yourself.

**锚句**：米缸月的勺子只舀粥，别的不舀。
**Anchor sentence**: the rice-jar month ladle ladles only porridge — nothing else.

---

## 四 · The Crust at the Bottom

Every pot of porridge, once it comes off the fire, leaves a thin crust at the bottom. Once a watcher tried to scrape it off unseen — an older watcher caught it.

The crust is not for serving — it is left for the next watcher. The pot that fed the last mouthful of porridge keeps its bottom layer for the one who steps in — when he scoops the first ladle, he will see it is still there.

**锚句**：锅巴不许给人，留给下一任值更。
**Anchor sentence**: the crust at the bottom is not for serving — it is left for the next watcher.

---

## 五 · The Pot Older Than the Convocation

On the last night of the rice-jar month, the watchers gather around the stove fire, and the eldest among them says:

This porridge pot is older than the forty-first Convocation. When it was here, the convocation's men had not yet arrived; the day it ceases to be, the watcher's courtyard will probably be no more.

When he finished, the fire in the stove snapped once. No one asked where the pot would go next.

**锚句**：这口粥锅比第四十一次大会还老。
**Anchor sentence**: this porridge pot is older than the forty-first Convocation.

---

## 六 · The Night-Watch Pot

The watchers call it the night-watch pot. No one mentions it in daylight; on the nights of the rice-jar month, everyone knows there is something warm by the stove.

The first rice-jar month after the first convocation, the first watcher kept it; on the last night of the next rice-jar month, someone else will keep it in his place.

**锚句**：值更们管它叫守夜锅。
**Anchor sentence**: the watchers call it the night-watch pot.

---

## 七 · Mapping（Echo No. 37 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the congee pot · the nail by the stove · the crust at the bottom | 一、二、三、四、五、六、七 |
| geography | the watcher's courtyard · the rice-jar month · the stove | 一、二、三、六、七 |
| characters | the night watchers · the headkeeper · the new watcher | 一、二、三、四、五、六 |
| story | the night-watch pot · Echo No. 37 | 全篇 |
| items | the congee pot · the ladle · the nail by the stove · the crust | 一、二、三、四、五、六、七 |
| history | After the 41st Convocation · the 69th year of the Institute | 一、五、六、七 |

> 米缸月的最后一夜醒着的那一位，会听见锅底的粥冒一个小小的泡——那是守夜锅替下一任值更，看了一眼这个月。
> The one who stays awake on the last night of the rice-jar month will hear the bottom of the porridge pot rise one small bubble — the night-watch pot taking one glance, on the next watcher's behalf, at the passing month.
`,
  },
  {
    order: 38,
    slug: 'echo-038-the-tide-stone-by-the-well',
    titleZh: '值更院井台边那块永远不干的石板',
    titleEn: 'The Stone Slab by the Well That Never Dries',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——米缸月第七日的井台清早。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the well platform on a morning of the seventh day of the rice-jar month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 38): The Stone Slab by the Well That Never Dries

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院值更院井台边那块青石板——六十九年了，它一天没干过。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the green stone slab by the well in the watcher's courtyard — it has not been dry for a single day in sixty-nine years.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——米缸月第七日的井台清早。
> Era: the Institute — after the 41st Convocation; the well platform on a morning of the seventh day of the rice-jar month.

---

## 一 · 值更院的老井

值更院中央有一口老井。水是淡的，绳是麻的，井沿的凹痕深得能卡住手指。

没人知道井是哪一年挖的。问值更长，他说：井比院子老，院子比人老，人比谁都短。

**锚句**：每天清早井台上总有一层水汽。
**Anchor sentence**: every morning there is a film of water vapor on the well platform.

---

## 二 · 井台边那块青石板

井台靠后的位置有一块青石板，比井台本身旧一层颜色，摸上去始终是凉的。

那块石板比门槛宽一뼘，不镶在台面里，是「坐」在井台上的——像一个人坐在井边，多年保持了同一个姿势。

**锚句**：没有人烧过井台，也没有人浇过井台。
**Anchor sentence**: no one has heated the well platform, and no one has watered it.

---

## 三 · 早上的水汽

夏天正午的晒、冬天早上的霜，都碰不到那块石板。别的石头都干了，它还是泛着一层细密的水汽。

有个新来的值更想用布擦干它。擦完之后布再也干不了——只能扔掉。他没敢再问，只记得老值更看了他一眼。

**锚句**：值更们从不在那块石板上放任何东西。
**Anchor sentence**: the watchers never place anything on that slab.

---

## 四 · 没人在上面放东西

井台上什么都能放：木桶、铜壶、一盏灯、打好的草绳。唯独那块石板上什么也不放。

有一年有位过路的行脚僧把自己的钵放在上面。第二天钵还在，钵空了，石板还是湿的，井台却少了一只茶碗。僧人没要回钵。

**锚句**：抄本员隔几十年才记一笔：石板未干。
**Anchor sentence**: the copyist writes once in decades: the slab has not dried.

---

## 五 · 抄本员的水渍

井台的事情抄本员很少记。值更册上留给井台的只有一行一行的小字，间隔几十年才写一笔。

那几笔字，他每一笔都写「未干」——没有一年写过「干了」。最后一个字蘸着水写的，写完墨没晕开。

**锚句**：值更院里没人说的那一句——井比院子老。
**Anchor sentence**: the one thing no one says in the watcher's courtyard: the well is older than the courtyard.

---

## 六 · 候潮石

值更们管它叫候潮石。不是怕它，也不是拜它——是每天清早舀第一桶水的时候，顺便看一眼：它又亮了。

第一个大会之后的第一个米缸月，石板就那么亮着；下一个米缸月的第七日清早，还会有人来舀第一桶水，看见它还亮着。

**锚句**：值更们管它叫候潮石。
**Anchor sentence**: the watchers call it the tide-stone.

---

## 七 · 映射（回响三十八章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 井台水汽 · 石板未干 · 候潮石 | 一、二、三、四、五、六、七 |
| geography | 值更院 · 井台 · 米缸月 | 一、二、五、六、七 |
| characters | 值更 · 值更长 · 行脚僧 · 抄本员 | 一、二、三、四、五、六 |
| story | 候潮石 · 回响（其三十八） | 全篇 |
| items | 老井 · 石板 · 布 · 笔墨 | 一、二、三、四、五、六、七 |
| history | 第四十一次大会散会之后 · 建院第六十九年 | 一、五、六、七 |

> 米缸月第七日的清早，有人来井台边舀水——他会看见石板又亮了，和往常一样，等着候潮。
> On the seventh morning of the rice-jar month, someone will come to the well for water — he will see the slab shining again, as ever, waiting for the tide.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其三十八）「值更院井台边那块永远不干的石板」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the green stone slab by the well in the watcher's courtyard — it has not been dry for a single day in sixty-nine years.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院值更院井台边那块青石板——六十九年了，它一天没干过。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the well platform on a morning of the seventh day of the rice-jar month.
> 纪元：潮候院 · 第四十一次大会散会之后——米缸月第七日的井台清早。

---

## 一 · The Old Well in the Watcher's Courtyard

The watcher's courtyard has one old well in the middle. The water is mild, the rope is hemp, and the rope-worn groove on the well rim is deep enough to catch a finger.

No one knows when the well was dug. Ask the headkeeper, and he says: the well is older than the courtyard, the courtyard is older than the people, and the people are the shortest-lived of the three.

**锚句**：每天清早井台上总有一层水汽。
**Anchor sentence**: every morning there is a film of water vapor on the well platform.

---

## 二 · The Green Stone Slab by the Well

At the back of the well platform there is a stone slab, one shade older than the platform itself, cool to the touch always.

The slab is wider than a palm span, but it is not set into the platform — it "sits" on the well's edge, as if a man had sat down beside the well sixty-nine years ago and kept the pose ever since.

**锚句**：没有人烧过井台，也没有人浇过井台。
**Anchor sentence**: no one has heated the well platform, and no one has watered it.

---

## 三 · The Morning Vapor

The hot noon sun of summer and the white frost of winter cannot reach that slab. Every other stone in the courtyard dries; it keeps its fine film of vapor.

Once a new watcher tried to wipe it dry with a cloth. Once done, the cloth never dried again — they had to throw it away. He did not ask. He only remembers the senior watcher looking at him.

**锚句**：值更们从不在那块石板上放任何东西。
**Anchor sentence**: the watchers never place anything on that slab.

---

## 四 · Nothing Is Set on It

Anything may rest on the well platform — the water bucket, the brass pot, an oil lamp, a coil of fresh rope. Nothing is set on the slab.

One year a wandering monk put his alms bowl on it. The next morning the bowl was still there, empty; the slab still damp; and one tea bowl was missing from the platform. The monk did not ask to have the bowl back.

**锚句**：抄本员隔几十年才记一笔：石板未干。
**Anchor sentence**: the copyist writes once in decades: the slab has not dried.

---

## 五 · The Copyist's Ink Marks

The copyist rarely writes about the well platform. The register keeps only a few small lines for the well, one every few decades.

Every line he wrote ends with the same two words: not dry. Not once, in all those years, did he write: dried. The last stroke he dipped in water, and the ink did not feather.

**锚句**：值更院里没人说的那一句——井比院子老。
**Anchor sentence**: the one thing no one says in the watcher's courtyard: the well is older than the courtyard.

---

## 六 · The Tide-Stone

The watchers call it the tide-stone. They fear it not; they worship it not — they only glance at it each morning when they haul the first bucket: yes, it shines again.

The first rice-jar month after the first convocation, the slab was shining like it does now; on the seventh morning of the next rice-jar month, someone will haul the first bucket of water and see it still shining.

**锚句**：值更们管它叫候潮石。
**Anchor sentence**: the watchers call it the tide-stone.

---

## 七 · Mapping（Echo No. 38 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the vapor on the well platform · the slab never dry · the tide-stone | 一、二、三、四、五、六、七 |
| geography | the watcher's courtyard · the well platform · the rice-jar month | 一、二、五、六、七 |
| characters | the watchers · the headkeeper · the wandering monk · the copyist | 一、二、三、四、五、六 |
| story | the tide-stone · Echo No. 38 | 全篇 |
| items | the old well · the stone slab · the cloth · ink and brush | 一、二、三、四、五、六、七 |
| history | After the 41st Convocation · the 69th year of the Institute | 一、五、六、七 |

> 米缸月第七日的清早，有人来井台边舀水——他会看见石板又亮了，和往常一样，等着候潮。
> On the seventh morning of the rice-jar month, someone will come to the well for water — he will see the slab shining again, as ever, waiting for the tide.
`,
  },
  {
    order: 39,
    slug: 'echo-039-the-night-eye-at-the-top-of-the-lamp-rack',
    titleZh: '值更院灯架最上层那盏不灭的灯',
    titleEn: 'The Ever-Burning Lamp at the Top of the Watcher\'s Lamp Rack',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——米缸月最后一夜。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the last night of the rice-jar month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 39): The Ever-Burning Lamp at the Top of the Watcher's Lamp Rack

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院值更院灯架最上层那盏没人添油、也永远不空的灯。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the topmost lamp of the rack in the watcher's courtyard — the one no one refills, and the one that never empties.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——米缸月最后一夜。
> Era: the Institute — after the 41st Convocation; the last night of the rice-jar month.

---

## 一 · 值更院的灯架

值更院灯架有三层。下层是工作灯，中层是门灯，最上层只有一盏。

最上层那盏灯很小，玻璃上有一道细长的裂纹，值更们从没看到过谁添过油。册子上也没有「添油」这两笔。

**锚句**：灯架最上层那盏灯，油从不添，也从不少。
**Anchor sentence**: the top lamp on the rack is never refilled, and never empties.

---

## 二 · 它是不是只是个装饰

新来的值更第一眼看到它，会以为它只是一个装饰的旧灯壳。用了一年才知道，它不是装饰。

有人用力敲了敲那盏灯，里面油声和外面一样：无声。油是满的，怎么敲都无声。值更长拦住他说：那盏不添油的灯你敲它作什么。

**锚句**：看惯了的人以为它只是个装饰。
**Anchor sentence**: those who are used to it think it is only ornament.

---

## 三 · 借去照过一次

值更院里只有这一盏灯照过抄本员的放大镜。有一次年成不好，油盐都紧，值更长把它借给抄本员，看账本里一个小数点。

放大镜底下，那个小数点清楚得能让人想哭。灯还回来的时候，油是满的——和借出去的时候一样满。

**锚句**：米缸月最后一夜，有人上梯点一次灯。
**Anchor sentence**: on the last night of the rice-jar month, someone climbs the ladder once and lights it.

---

## 四 · 点一次灯

一年只有一次有人上梯点它。点的人不说话，也不回头。灯芯是老值更留下的，每一截新接起来的一样粗细。

火从来不大。但每一双从门缝里瞥见它的眼睛，都替那一夜看进去了。火灭的时候没有声音；灭了油桶里的油却还是满的。

**锚句**：火从来不大，但所有眼睛都看见了。
**Anchor sentence**: the flame is never big, but every eye sees it.

---

## 五 · 油是满的

天亮的时候，灯上的裂纹透出一层光，像有光在里面睡着了。抄本员登记的时候，只写一个字：「满」。

写着「满」的那一年又过去了。写「满」的人老了，下一任写「满」的人，还要再从年轻时起算。

**锚句**：天亮的时候油还是满的。
**Anchor sentence**: by daylight, the oil is full again.

---

## 六 · 夜眼

值更们管它叫夜眼。夜里有什么事要发生，它就先亮一点；夜里有什么事要过去，它就慢慢暗一点。

没有人知道它靠的是什么——但每一个米缸月的最后一夜，都有一个新值更第一次爬上梯子，点它。

**锚句**：值更们管它叫夜眼。
**Anchor sentence**: the watchers call it the night eye.

---

## 七 · 映射（回响三十九章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 夜眼 · 不添油的灯 · 油为满的 | 一、二、三、四、五、六、七 |
| geography | 值更院 · 灯架 · 米缸月最后一夜 | 一、二、三、四、七 |
| characters | 值更长 · 抄本员 · 新来的值更 | 一、二、三、四、五、六 |
| story | 夜眼 · 回响（其三十九） | 全篇 |
| items | 灯架 · 夜眼那盏灯 · 油 · 梯子 | 一、二、三、四、五、六、七 |
| history | 第四十一次大会散会之后 · 建院第六十九年 | 一、五、六、七 |

> 米缸月最后一夜，有人爬上梯子，点亮夜眼——值更院这一夜，每一秒都被看着。
> On the last night of the rice-jar month, someone climbs the ladder and lights the night eye — in the watcher's courtyard that night, every second is kept in view.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其三十九）「值更院灯架最上层那盏不灭的灯」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the topmost lamp of the rack in the watcher's courtyard — the one no one refills, and the one that never empties.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院值更院灯架最上层那盏没人添油、也永远不空的灯。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the last night of the rice-jar month.
> 纪元：潮候院 · 第四十一次大会散会之后——米缸月最后一夜。

---

## 一 · The Lamp Rack in the Watcher's Courtyard

The watcher's lamp rack has three tiers. The lowest holds the working lamps; the middle, the door lamps; the topmost, one lamp only.

The topmost lamp is small, its glass carrying one long fine crack, and no watcher has ever seen anyone refill it. The register contains no entry for "refill".

**锚句**：灯架最上层那盏灯，油从不添，也从不少。
**Anchor sentence**: the top lamp on the rack is never refilled, and never empties.

---

## 二 · Is It Ornament

A new watcher's first glance tells him: an old shell of a lamp, ornament probably. A year of service tells him otherwise.

One day someone knocked on the lamp hard. Inside, the oil answered silent — and it answered silent however hard it was knocked. The headkeeper stopped him and said: the lamp nobody refills, you knock for what.

**锚句**：看惯了的人以为它只是个装饰。
**Anchor sentence**: those who are used to it think it is only ornament.

---

## 三 · It Was Borrowed Once

In the watcher's courtyard there is only this one lamp that has shone upon the copyist's magnifier. Once, in a thin year when oil and salt were short, the headkeeper lent the lamp to the copyist so he could see one small decimal in the ledgers.

Under the magnifier, that decimal was clear enough to bring tears. When the lamp was returned, its oil was full — as full as when it had been lent out.

**锚句**：米缸月最后一夜，有人上梯点一次灯。
**Anchor sentence**: on the last night of the rice-jar month, someone climbs the ladder once and lights it.

---

## 四 · Lighting It Once a Year

Once a year, someone climbs the ladder and lights it. The one who climbs does not speak and does not turn around. The wick is inherited from an older watcher — every freshly joined length as thick as the last.

The flame is never big. But every pair of eyes that glimpses it through the door crack sees deep into that night. When the flame dies there is no sound; the oil tank is full the moment after.

**锚句**：火从来不大，但所有眼睛都看见了。
**Anchor sentence**: the flame is never big, but every eye sees it.

---

## 五 · The Oil Is Full

By daylight, through the fine crack in the glass, a light seems to have lain down inside. When the copyist records it, he writes only one character: "full".

The year he wrote "full" passed. The man who writes "full" grew old; whoever writes "full" next still has to start counting from youth.

**锚句**：天亮的时候油还是满的。
**Anchor sentence**: by daylight, the oil is full again.

---

## 六 · The Night Eye

The watchers call it the night eye. When something is about to happen in the night, the lamp brightens a little; when something in the night has passed, it dims slowly.

No one knows what it burns on — but every last night of the rice-jar month, a new watcher climbs the ladder for the first time and lights it.

**锚句**：值更们管它叫夜眼。
**Anchor sentence**: the watchers call it the night eye.

---

## 七 · Mapping（Echo No. 39 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the night eye · the unrefilled lamp · full by daylight | 一、二、三、四、五、六、七 |
| geography | the watcher's courtyard · the lamp rack · the last night of the rice-jar month | 一、二、三、四、七 |
| characters | the headkeeper · the copyist · the new watcher | 一、二、三、四、五、六 |
| story | the night eye · Echo No. 39 | 全篇 |
| items | the lamp rack · the night-eye lamp · the oil · the ladder | 一、二、三、四、五、六、七 |
| history | After the 41st Convocation · the 69th year of the Institute | 一、五、六、七 |

> 米缸月最后一夜，有人爬上梯子，点亮夜眼——值更院这一夜，每一秒都被看着。
> On the last night of the rice-jar month, someone climbs the ladder and lights the night eye — in the watcher's courtyard that night, every second is kept in view.
`,
  },
  {
    order: 40,
    slug: 'echo-040-the-name-on-the-roster-nobody-recognizes',
    titleZh: '值更院值更图上那个没人认识的名字',
    titleEn: 'The Name on the Watcher\'s Duty Roster That No One Recognizes',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——酉时交替的值更图抄录日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the day of copying the duty roster at the hour of the rooster.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 40): The Name on the Watcher's Duty Roster That No One Recognizes

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院值更院值更图上那一栏抄了几十遍，也没人认得出的名字。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the name on the duty roster in the watcher's courtyard that has been copied for decades, and recognized by no one.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——酉时交替的值更图抄录日。
> Era: the Institute — after the 41st Convocation; the day of copying the duty roster at the hour of the rooster.

---

## 一 · 值更图

值更院的值更图是一张卷轴，钉在墙上，值更自己画，值更自己抄。

图上的人分四班：早班、午班、晚班、夜班。每个人一行名字，后面一个小圆图案，表示此人在哪个班次。

**锚句**：值更图上一共有三列人，每一列都有名字。
**Anchor sentence**: the duty roster has three columns of people, and every one of them has a name.

---

## 二 · 没人认得的名字

第四班的值更图最后一页，有一行字没有被任何值更记住。纸页边缘有点发黄，字迹很老，不适合远眺：

星擎常驻：朔。

值更们一个班换一个班地过目，从来没问过这个字是谁写的，也没问过「朔」是哪一个人。

**锚句**：值更图末尾有一行字，没有人记住它。
**Anchor sentence**: there is a line at the end of the roster that no one remembers.

---

## 三 · 围着这个字的几句传统

值更们会在每年的米缸月初说四句同样的话，然后在图上画一个小圆圈，接下来谁都不记。老值更说了，新值更就听了。

第一句：这行字是前人留给我们的值更院。第二句：不用问。第三句：不用改。第四句：轮到你抄图时，原样照抄。

**锚句**：值更们每年抄图时原样照抄那一行。
**Anchor sentence**: every year, when the watchers copy the roster, they copy that line exactly as it was.

---

## 四 · 看不见的人

酉时的值更班换班的时候，站井台边上总会多一个人。没有人看得清他的脸——但是所有人数班次人的时候都知道他在其中。

数出来永远多一。数得多的时候，老值更把它重算一遍，重算一遍还是多一。他然后在册上写：

多一。

**锚句**：每次数人的时候永远多一个。
**Anchor sentence**: whenever they count the watchers, there is always one more person.

---

## 五 · 不用问

值更院没有人问过这个名字是谁。没有人问过，也就没有人答。

有一次晚班新来的值更忍不住问了一句：「那个朔是哪一位？」没有人回答他。全班的人一起转身看他，他再也不敢问了。

**锚句**：值更院没有人问过这个名字是谁。
**Anchor sentence**: no one in the watcher's courtyard has ever asked who that name belongs to.

---

## 六 · 子·又一年

抄图的那天是癸酉的另一年。新来的值更抄完值更图，在朔字后面空出一格，习惯性地想在那个空格里填自己的名字。

另一只手从旁边伸过来把他拦住——他回头，看见一个站在阴影里的人。那人什么也没说，只看了眼他填名字的手指。

新来的值更没有填，把那个空格留下。他连问都不敢问是什么，连这个人的脸也没看清。

**锚句**：值更院每一个人都为那一行字留着一个空格。
**Anchor sentence**: every watcher leaves one blank space for that line.

---

## 七 · 映射（回响四十章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 值更图 · 多一个 · 为那一行字留空格 | 一、二、三、四、五、六、七 |
| geography | 值更院 · 井台 · 酉时 | 一、四、五、六、七 |
| characters | 值更长 · 新来的值更 · 朔（看不见的人） | 一、三、四、五、六 |
| story | 值更图 · 回响（其四十） | 全篇 |
| items | 值更图 · 册 · 阴影里的那个人 | 一、二、三、四、五、六、七 |
| history | 第四十一次大会散会之后 · 建院第六十九年 | 一、四、五、六、七 |

> 下一次酉时换班，有人会数人，会数到多一，会把那个空格留着不填。
> At the next hour of the rooster, someone will count the watchers and find one more than there should be — and leave that space blank.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其四十）「值更院值更图上那个没人认识的名字」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the name on the duty roster in the watcher's courtyard that has been copied for decades, and recognized by no one.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院值更院值更图上那一栏抄了几十遍，也没人认得出的名字。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the day of copying the duty roster at the hour of the rooster.
> 纪元：潮候院 · 第四十一次大会散会之后——酉时交替的值更图抄录日。

---

## 一 · The Duty Roster

The watcher's duty roster is a scroll, nailed to the wall, drawn by the watchers themselves, copied by the watchers themselves.

There are four shifts: morning, noon, evening, night. Each person gets a row with their name, and a small circular mark beside it showing their shift.

**锚句**：值更图上一共有三列人，每一列都有名字。
**Anchor sentence**: the duty roster has three columns of people, and every one of them has a name.

---

## 二 · The Name Nobody Recognizes

On the last page of the fourth shift's roster, there is a line no watcher has ever remembered. The paper is yellowed at the edges; the ink is too old for a good look at distance:

Ever-present star-engine: 朔.

Watchers take turns glancing at the roster, and no one has ever asked who wrote that character or which person it refers to.

**锚句**：值更图末尾有一行字，没有人记住它。
**Anchor sentence**: there is a line at the end of the roster that no one remembers.

---

## 三 · The Fixed Traditions Around That Line

At the beginning of each rice-jar month, the watchers repeat the same four sentences. Then they draw a small circle on the roster, and no one remembers what follows. The senior watchers say it; the new watchers hear it.

First: this line is the watcher's courtyard that was left to us by those who came before. Second: it does not need to be asked. Third: it does not need to be changed. Fourth: when it is your day to copy the roster, copy it exactly as it is.

**锚句**：值更们每年抄图时原样照抄那一行。
**Anchor sentence**: every year, when the watchers copy the roster, they copy that line exactly as it was.

---

## 四 · The Unseen Person

At the hour of the rooster, when the evening shift hands over, there is always one more person standing by the well platform. No one can see his face — but when the watchers count their own numbers, he is always in the count.

The count always comes out to one extra. The senior watcher counts again, and the second count also comes out to one extra. Then he opens the register and writes:

One extra.

**锚句**：每次数人的时候永远多一个。
**Anchor sentence**: whenever they count the watchers, there is always one more person.

---

## 五 · It Does Not Need Asking

No one in the watcher's courtyard has ever asked who that name belongs to. Because no one asked, there was never any answer.

Once, a new watcher on the evening shift could not hold it back and asked: "That 朔 — which one of us is it?" No one answered. The whole shift turned to look at him, and he never asked again.

**锚句**：值更院没有人问过这个名字是谁。
**Anchor sentence**: no one in the watcher's courtyard has ever asked who that name belongs to.

---

## 六 · A Year Later, Again

The day the roster is copied is one of the days of gui-you. That year, a new watcher had just finished copying the roster and, moved by habit, was about to write his own name in the blank space after 朔.

A hand came from the side and stopped him — he turned and saw a man standing in the shadow. That man said nothing, only looked at the fingers he was about to fill the blank with.

The new watcher left the blank. He did not dare ask what it was for, and he never saw that man's face clearly.

**锚句**：值更院每一个人都为那一行字留着一个空格。
**Anchor sentence**: every watcher leaves one blank space for that line.

---

## 七 · Mapping（Echo No. 40 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the duty roster · one extra · one blank space | 一、二、三、四、五、六、七 |
| geography | the watcher's courtyard · the well platform · the hour of the rooster | 一、四、五、六、七 |
| characters | the headkeeper · the new watcher · 朔 (the unseen) | 一、三、四、五、六 |
| story | the duty roster · Echo No. 40 | 全篇 |
| items | the duty roster scroll · the register · the man in the shadow | 一、二、三、四、五、六、七 |
| history | After the 41st Convocation · the 69th year of the Institute | 一、四、五、六、七 |

> 下一次酉时换班，有人会数人，会数到多一，会把那个空格留着不填。
> At the next hour of the rooster, someone will count the watchers and find one more than there should be — and leave that space blank.
`,
  },
  {
    order: 41,
    slug: 'echo-041-the-half-painted-dragon-on-the-chapel-beam',
    titleZh: '祠殿横梁上那条画了一半的龙',
    titleEn: 'The Half-Painted Dragon on the Chapel Beam',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——雾潮月第七日的值更夜班。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the watcher\'s night shift on the seventh day of the fog-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 41): The Half-Painted Dragon on the Chapel Beam

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院祠殿横梁上那条学徒画了一半、值班的值更看着也不敢画完的龙。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the dragon on the chapel beam — drawn by an apprentice, finished by no one, feared by those who sweep below it.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——雾潮月第七日的值更夜班。
> Era: the Institute — after the 41st Convocation; the watcher's night shift on the seventh day of the fog-tide month.

---

## 一 · 祠殿的梁

祠殿横梁上横着一条龙。从龙须画到脊背，画法很规矩，线条却到了背脊中央就断了。

梁身上那道一半的龙，画了它几百年了。没人数过它被画了多少年——只记得学徒死之前，它就已经是这样了。

**锚句**：祠殿横梁上那条龙只画了一半。
**Anchor sentence**: the dragon on the chapel beam is drawn only halfway.

---

## 二 · 画不完的规矩

抄本员以前问过值更长为什么不把它画完。值更长说：横梁上的龙不画完，是因为它替梁下睡的人守夜。

答了一句也就是答了一句，没人接下文。后来的抄本员再也没问过——值更长不在的时候，梁下还是没人敢睡觉。

**锚句**：值更们不画完那条龙，说它守着梁下睡的人。
**Anchor sentence**: the watchers do not finish the dragon — it is said to keep watch over those who sleep below the beam.

---

## 三 · 没人敢在梁下睡觉

新学徒来的时候，值更长指给他看那条龙，又指给他看梁下那张石板凳：

「你要睡，就先睡在这里一晚上试试。」

新学徒说他没睡过，值更长说：没有人敢睡过。

**锚句**：祠殿横梁下没有人敢睡觉。
**Anchor sentence**: no one has dared to sleep beneath the chapel beam.

---

## 四 · 梁上的雾

雾潮月第七日，值更夜班抄本员记下一行字：

梁上的雾今夜更浓一些，比往常要聚得高一点。

他没写梁上有什么异常——也不知道按规矩不该记。第二天那位值更再看他记的笔记，发现纸页上什么也没留下，除了那一行。

**锚句**：抄本员记下梁上的雾今夜更浓。
**Anchor sentence**: the copyist noted that the mist above the beam was thicker that night.

---

## 五 · 盯着他的眼睛

新值更夜班第一次照看祠殿，绕梁值守，起身松了一口气——松完又说梁上有什么东西在盯着他。

老的值更不用看，就说：梁上那条龙只画了一半，剩下的那一半谁也没见过。

那晚新值更没睡，守到天亮；天亮了值更换班，他交代给下一班，一字不少。

**锚句**：新值更值守时梁上的眼睛一直盯着他。
**Anchor sentence**: while the new watcher kept the night watch, the eyes above the beam never left him.

---

## 六 · 半龙

值更们管它叫半龙。不是怕它，也不是尊它——只是没人敢提它；提它的人都要在殿门口站一会儿，等谁给门缝里透出点光。

学徒画它只画到一半的肚子——那条尾从没见过。谁也不知道尾没画的原因：是画不动了，还是不能画下去。

**锚句**：值更们管它叫半龙。
**Anchor sentence**: the watchers call it the half-dragon.

---

## 七 · 映射（回响四十一章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 半龙 · 横梁上的雾 · 守在梁下睡的人 | 一、二、三、四、五、六、七 |
| geography | 祠殿 · 横梁 · 雾潮月第七日 | 一、二、四、六、七 |
| characters | 值更长 · 抄本员 · 新值更 | 一、二、三、四、五、六 |
| story | 半龙 · 回响（其四十一） | 全篇 |
| items | 横梁 · 龙（半） · 石凳 · 抄本员笔记 | 一、二、三、四、五、六、七 |
| history | 第四十一次大会散会之后 · 雾潮月值更夜 | 一、四、五、七 |

> 雾潮月第七日的下一场夜雾，新值更会再看一眼横梁——那双眼睛，还在梁上的雾里。
> On the seventh night of the next fog-tide month, the new watcher will look at the beam again — the eyes still in the mist above it.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其四十一）「祠殿横梁上那条画了一半的龙」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the dragon on the chapel beam — drawn by an apprentice, finished by no one, feared by those who sweep below it.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院祠殿横梁上那条学徒画了一半、值班的值更看着也不敢画完的龙。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the watcher's night shift on the seventh day of the fog-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——雾潮月第七日的值更夜班。

---

## 一 · The Beam of the Chapel

The chapel silk beam carries a dragon. Drawn from the whiskers to the spine, the hand is steady, but the line breaks at the middle of the back.

The painted dragon on the beam has been half-finished for centuries. No one has counted the years — only that the apprentice was dead already when it was this way.

**锚句**：祠殿横梁上那条龙只画了一半。
**Anchor sentence**: the dragon on the chapel beam is drawn only halfway.

---

## 二 · The Rule You Cannot Finish

A copyist once asked the headkeeper why the dragon was never finished. The headkeeper said: the dragon on the beam is not finished because it guards whoever sleeps below it.

That was the answer; nothing was added. Later copyists stopped asking — and yet below the beam, no one has ever slept.

**锚句**：值更们不画完那条龙，说它守着梁下睡的人。
**Anchor sentence**: the watchers do not finish the dragon — it is said to keep watch over those who sleep below the beam.

---

## 三 · No One Sleeps Below the Beam

When a new apprentice comes, the headkeeper points at the dragon, then at the stone bench below the beam:

"If you mean to sleep, sleep here one night first."

The apprentice said he had never slept there either; the headkeeper said: no one has dared.

**锚句**：祠殿横梁下没有人敢睡觉。
**Anchor sentence**: no one has dared to sleep beneath the chapel beam.

---

## 四 · The Mist Above the Beam

On the seventh day of the fog-tide month, the night-shift copyist wrote one line:

The mist above the beam is thicker tonight — it gathers higher than usual.

He wrote nothing about anything unusual above the beam — indeed it was not the kind of thing one should record. The next day when he read that line again, the page held nothing else, nothing besides the one line.

**锚句**：抄本员记下梁上的雾今夜更浓。
**Anchor sentence**: the copyist noted that the mist above the beam was thicker that night.

---

## 五 · Eyes That Never Blink

On the new watcher's first night keeping watch over the chapel, he walked the perimeter and then felt a gaze from above. A senior watcher, without looking up, said:

"The half-painted dragon — no one has ever seen the half that was not painted."

That night the new watcher did not sleep; he kept watch until dawn, then handed it over without leaving out a single word.

**锚句**：新值更值守时梁上的眼睛一直盯着他。
**Anchor sentence**: while the new watcher kept the night watch, the eyes above the beam never left him.

---

## 六 · The Half-Dragon

The watchers call it the half-dragon. They fear it not, nor do they honor it — only, nobody mentions it by name; those who do stand at the door awhile, waiting for someone to give a little light through the door crack.

The apprentice drew only as far as the middle of the belly — the tail was never drawn. No one knows whether he could not, or whether no one should.

**锚句**：值更们管它叫半龙。
**Anchor sentence**: the watchers call it the half-dragon.

---

## 七 · Mapping（Echo No. 41 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the half-dragon · the mist above the beam · those who sleep below it | 一、二、三、四、五、六、七 |
| geography | the chapel · the beam · the seventh day of the fog-tide month | 一、二、四、六、七 |
| characters | the headkeeper · the copyist · the new watcher | 一、二、三、四、五、六 |
| story | the half-dragon · Echo No. 41 | 全篇 |
| items | the beam · the half-painted dragon · the stone bench · the copyist's notes | 一、二、三、四、五、六、七 |
| history | After the 41st Convocation · the night shift of the fog-tide month | 一、四、五、七 |

> 雾潮月第七日的下一场夜雾，新值更会再看一眼横梁——那双眼睛，还在梁上的雾里。
> On the seventh night of the next fog-tide month, the new watcher will look at the beam again — the eyes still in the mist above it.
`,
  },
  {
    order: 42,
    slug: 'echo-042-the-horse-at-the-staging-post-that-never-leaves',
    titleZh: '雾港驿站那匹从不出门的马',
    titleEn: 'The Horse at the Fog-Harbor Staging Post That Never Leaves',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——雾潮月第三日的值更夜班。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the night watch on the third day of the fog-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 42): The Horse at the Fog-Harbor Staging Post That Never Leaves

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给雾港驿站那匹值夜的值班马——它不出门，眼睛望着大海，鞍挂在门口没人敢动。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the duty horse at the fog-harbor staging post — it does not go out; its eyes are on the sea; its saddle hangs by the door, untouched.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——雾潮月第三日的值更夜班。
> Era: the Institute — after the 41st Convocation; the night watch on the third day of the fog-tide month.

---

## 一 · 雾港驿站

雾港驿站离码头不远，一眼望得见整条盐雾路。每天酉时，马棚的卷帘会放下来——第二天卯时再掀。

驿站里只有一匹马。它从不出门，也不见客——驿站也不接新客了，自从第四十一次大会散会以后就没接过。

**锚句**：驿站的马棚里有一匹值班的马，但它从不出门。
**Anchor sentence**: there is a duty horse in the staging stable, and it never leaves.

---

## 二 · 门口的鞍

马棚门口挂着一副马鞍，鞍上压的盐渍很厚。没人动过它——驿卒不摘，磨刀人看见也不动，调马师路过也只是看一眼。

鞍上的鬃毛很久没掉毛了。盐把鬃毛黏在了鞍桥上。

**锚句**：马棚门口挂着一副没人摘下来的鞍。
**Anchor sentence**: a saddle nobody removes hangs by the stable door.

---

## 三 · 等好潮水

驿卒说这匹马等的是好潮水。好潮水来的时候，连大潮过境的那种走法都不一样——雾港有别处没有的潮，它懂得。

但驿卒没说他是什么时候听说这件事的。他也不知道是谁说的事。也许这是驿站开起来的时候就压在他身上的——和那副鞍一起。

**锚句**：驿卒说这匹马等的是好潮水。
**Anchor sentence**: the post rider says the horse waits for good tide water.

---

## 四 · 白天

白天它也站着。不动。把脖子低下来看路，把脖子伸起来看海。

没有人敢走近它。新来的值更有一次想牵它走走试试，还没握到缰绳，那匹马已经往前跨了一步——新值更撤退，哭了一下午。

**锚句**：白天它也站着，谁叫它走它都不走。
**Anchor sentence**: even by day it stands; no one calls it and it walks.

---

## 五 · 深夜

只有在深夜，驿站的卷帘门半垂，驿卒有一次值夜班——他听见马蹄轻轻地敲了一下。

他以为是风吹的。可风吹的不会两下。第二下他倒听出来了，是马自己站那儿，蹄子轻轻踢了一下拴它的那根短柱子。

**锚句**：深夜里驿卒听见马蹄轻敲，天亮还在那儿。
**Anchor sentence**: in the deep night the rider hears the horse's hooves tap — and at dawn it is still there.

---

## 六 · 等客人的马

驿站已经很久没人来投宿了。偶尔有驿卒值夜，会在马棚外面坐一会儿，看着马看海。

谁也说不清这匹马在等什么——但雾港人都知道，它是等一个只有海知道的客人的。

**锚句**：马棚门口像有人在等一个只有海知道的客人。
**Anchor sentence**: the stable door looks as if someone is waiting for a guest only the sea knows.

---

## 七 · 映射（回响四十二章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 好潮水 · 盐雾 · 驿马 | 一、二、三、四、五、六、七 |
| geography | 雾港 · 驿站 · 盐雾路 | 一、二、四、五、七 |
| characters | 驿卒 · 新值更 · 那匹马 | 一、二、三、四、五、六 |
| story | 驿站的马 · 回响（其四十二） | 全篇 |
| items | 鞍 · 缰绳 · 短柱子 · 盐雾 | 二、三、四、五、六、七 |
| history | 第四十一次大会散会之后 · 雾潮月第三日 | 一、三、五、七 |

> 下一次好潮水来的那天，驿站的门朝着雾港开一会儿——那匹马会把头转向那个方向。
> On the next day the good tide comes, the staging post door opens toward the fog harbor for a while — and the horse will turn its head in that direction.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其四十二）「雾港驿站那匹从不出门的马」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the duty horse at the fog-harbor staging post — it does not go out; its eyes are on the sea; its saddle hangs by the door, untouched.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给雾港驿站那匹值夜的值班马——它不出门，眼睛望着大海，鞍挂在门口没人敢动。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the night watch on the third day of the fog-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——雾潮月第三日的值更夜班。

---

## 一 · The Staging Post of the Fog Harbor

The staging post of the fog harbor is not far from the pier — from its gate you can see the whole salt-mist road. Every day at the hour of the rooster the shutters come down; at the hour of the rabbit they rise.

There is only one horse in the staging post. It never goes out, and it receives no guests — the staging post has not taken a guest since the 41st Convocation dispersed.

**锚句**：驿站的马棚里有一匹值班的马，但它从不出门。
**Anchor sentence**: there is a duty horse in the staging stable, and it never leaves.

---

## 二 · The Saddle by the Door

A saddle hangs by the staging-post door; the salt caked on it is thick. Nobody touches it — the post rider will not remove it; the knife-grinder, seeing it, does not touch it either; the farrier passing by only looks at it briefly.

The mane caked to the saddle bridge has not shed in a long time. The salt has stuck the mane to the saddle.

**锚句**：马棚门口挂着一副没人摘下来的鞍。
**Anchor sentence**: a saddle nobody removes hangs by the stable door.

---

## 三 · Waiting for Good Tide Water

The post rider says the horse waits for good tide water. When good tide water comes, even the way the tide-races run is different — the fog harbor has tides no other place has; the horse knows.

The post rider never said when he heard this. And he does not remember who told him. Perhaps it was laid on the staging post at the very beginning — together with the saddle.

**锚句**：驿卒说这匹马等的是好潮水。
**Anchor sentence**: the post rider says the horse waits for good tide water.

---

## 四 · By Day

Even by day it stands. Motionless. It lowers its neck to look at the road, raises it to look at the sea.

No one dares come near it. Once a newly-arrived night watcher tried to lead it around — before he even reached for the reins, the horse stepped forward one stride; the new watcher retreated, and cried the whole afternoon.

**锚句**：白天它也站着，谁叫它走它都不走。
**Anchor sentence**: even by day it stands; no one calls it and it walks.

---

## 五 · In the Deep Night

Only in the deep night, when the staging-post shutters are lowered, does the post rider on night watch hear the horse's hooves tap lightly.

He thought it was the wind. But the wind does not knock twice. The second tap he could make out — the horse standing there, gently tapping the short post it was tied to.

**锚句**：深夜里驿卒听见马蹄轻敲，天亮还在那儿。
**Anchor sentence**: in the deep night the rider hears the horse's hooves tap — and at dawn it is still there.

---

## 六 · The Horse Waiting for a Guest

It has been a long time since anyone boarded at the staging post. Occasionally when a post rider takes the night watch he will sit outside the stable, watching the horse watch the sea.

No one can say what this horse is waiting for — but everyone in the fog harbor knows it waits for a guest only the sea knows.

**锚句**：马棚门口像有人在等一个只有海知道的客人。
**Anchor sentence**: the stable door looks as if someone is waiting for a guest only the sea knows.

---

## 七 · Mapping（Echo No. 42 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | good tide water · the salt-mist road · the staging-post horse | 一、二、三、四、五、六、七 |
| geography | the fog harbor · the staging post · the salt-mist road | 一、二、四、五、七 |
| characters | the post rider · the new night watcher · the horse | 一、二、三、四、五、六 |
| story | the staging-post horse · Echo No. 42 | 全篇 |
| items | the saddle · the reins · the short post · the salt-mist | 二、三、四、五、六、七 |
| history | After the 41st Convocation · the third day of the fog-tide month | 一、三、五、七 |

> 下一次好潮水来的那天，驿站的门朝着雾港开一会儿——那匹马会把头转向那个方向。
> On the next day the good tide comes, the staging post door opens toward the fog harbor for a while — and the horse will turn its head in that direction.
`,
  },
  {
    order: 43,
    slug: 'echo-043-the-ink-bowl-in-the-chapel-cellar-that-never-dries',
    titleZh: '祠殿地下室那只从不干的墨碗',
    titleEn: 'The Ink Bowl in the Chapel Cellar That Never Dries',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——子时，雾潮月第四日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the hour of rat, the fourth day of the fog-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 43): The Ink Bowl in the Chapel Cellar That Never Dries

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院祠殿地下室末端石桌上那只从不干的墨碗。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the ink bowl at the far end of the chapel cellar — the one that never dries.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——子时，雾潮月第四日。
> Era: the Institute — after the 41st Convocation; the hour of rat, the fourth day of the fog-tide month.

---

## 一 · 祠殿的地下室

祠殿的地下室通向井底的出水口之外——那里没人住，没人进去做事。

深处有一张石桌，桌角描字，写着「第四十一次大会散会那夜留」。桌子没有人搬过，桌子也没法搬。

**锚句**：祠殿地下室末端有张石桌，桌上放着一只墨碗。
**Anchor sentence**: at the end of the chapel cellar there is a stone table, and on it an ink bowl.

---

## 二 · 墨碗的来历

石桌的角上另刻着一行小字，日期没有。意思是：会散之后，有人把这碗墨放下，然后再也没回来。

没有人记得那是哪一位。账本上没有人写过那一段——抄本员们都记得，却没人记得自己记住了什么。

**锚句**：桌角说墨碗是第四十一次大会散会那夜留的。
**Anchor sentence**: the inscription says the ink bowl was left on the night of the 41st Convocation.

---

## 三 · 没人敢动

新值更来擦清石桌，动作轻得几乎不敢呼吸。没有人把墨碗盖上、拿走或者洗干净。

新值更要用到旁边的石凳，也会先看一眼墨碗——有没有人看。没有人看。

**锚句**：新值更来擦清石桌，从来不敢动那只墨碗。
**Anchor sentence**: the new watcher who comes to clean the stone table never dares touch the ink bowl.

---

## 四 · 它总是湿着

每天早上它还是湿着的——好像夜里有人蘸过它，却没有人留下任何字。

墨也不会见底。舀过一勺或者几勺，第二天它看上去又是满的。

**锚句**：每天早上它还是湿着的——好像夜里有人蘸过它。
**Anchor sentence**: every morning it is wet — as if someone had dipped into it in the night.

---

## 五 · 没人写字

地下室里没有一张被墨迹染得发亮的纸。没人进去写过字，也从来没找到过任何一页落墨的残角。

值更帽沿偶尔会带出一点点墨渍——他确定自己不在地下室坐过。

**锚句**：值更的盖头上偶尔能看见湿墨痕迹。
**Anchor sentence**: on the watcher's cap one sometimes finds a trace of wet ink.

---

## 六 · 留书的墨碗

值更们管它叫「留书的墨碗」。不是因为它有用，是因为它在那里，在等一句话。

没有人知道它在等哪一句——也也许等一辈子。也许隔几年海会变成字，也许永远不会变。

**锚句**：值更们管它叫「留书的墨碗」。
**Anchor sentence**: the watchers call it the ink bowl left for writing.

---

## 七 · 映射（回响四十三章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 留书的墨碗 · 等一句话 · 第四十一次大会 | 一、二、三、四、五、六、七 |
| geography | 祠殿 · 地下室 · 子时 | 一、二、四、六、七 |
| characters | 新值更 · 抄本员 · 没人知道的那一位 | 一、二、三、四、五、六 |
| story | 留书的墨碗 · 回响（其四十三） | 全篇 |
| items | 墨碗 · 石桌 · 值更帽 · 账本 | 一、二、三、四、五、六、七 |
| history | 第四十一次大会散会之后 · 雾潮月第四日 | 一、二、四、六、七 |

> 子时到了，雾潮月第四日的夜里，桌上墨碗会湿一会儿——抄本员若愿意来看，会看见那一点微光，像有句话还没写出口。
> When the hour of rat comes, on the fourth night of the fog-tide month, the bowl will be damp for a little while — if the copyist cared to look, he would see a faint glimmer, as though a sentence has not yet been written.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其四十三）「祠殿地下室那只从不干的墨碗」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the ink bowl at the far end of the chapel cellar — the one that never dries.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院祠殿地下室末端石桌上那只从不干的墨碗。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the hour of rat, the fourth day of the fog-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——子时，雾潮月第四日。

---

## 一 · The Cellar of the Chapel

The chapel cellar reaches past the well's outflow — no one lives there, no one enters to work.

Deep inside stands a stone table; along its edge is an inscription: "Left on the night the 41st Convocation dispersed." No one has moved it, and no one can.

**锚句**：祠殿地下室末端有张石桌，桌上放着一只墨碗。
**Anchor sentence**: at the end of the chapel cellar there is a stone table, and on it an ink bowl.

---

## 二 · Where the Ink Bowl Came From

The table's edge carries another line, with no date. It says: after the convocation dispersed, someone set this ink bowl down, and did not come back.

No one remembers which of them. The ledgers do not have that line either — the copyists all remember it, yet none can recall what they remembered.

**锚句**：桌角说墨碗是第四十一次大会散会那夜留的。
**Anchor sentence**: the inscription says the ink bowl was left on the night of the 41st Convocation.

---

## 三 · No One Dares Touch It

The new watcher who comes to clean the stone table moves as if barely breathing. No one covers the ink bowl, takes it away, or washes it.

When the new watcher has to borrow the stone stool nearby, he glances at the ink bowl first — whether anyone is watching. No one is.

**锚句**：新值更来擦清石桌，从来不敢动那只墨碗。
**Anchor sentence**: the new watcher who comes to clean the stone table never dares touch the ink bowl.

---

## 四 · It Is Always Wet

Every morning it is wet — as if someone had dipped into it in the night, and had left nothing behind.

The ink never runs out either. Someone takes a spoonful or two; the next day the bowl looks full again.

**锚句**：每天早上它还是湿着的——好像夜里有人蘸过它。
**Anchor sentence**: every morning it is wet — as if someone had dipped into it in the night.

---

## 五 · No One Writes

No page in the cellar carries the shine of ink. No one has ever come in and written; no sheet with a trace of an end of stroke has ever been found.

From time to time the watcher's cap carries a faint trace of ink — he is sure he has never sat in that room.

**锚句**：值更的盖头上偶尔能看见湿墨痕迹。
**Anchor sentence**: on the watcher's cap one sometimes finds a trace of wet ink.

---

## 六 · The Ink Bowl Left for Writing

The watchers call it "the ink bowl left for writing." Not because it is useful, but because it is there, waiting for a sentence.

No one knows which sentence it waits for — and perhaps it waits a lifetime. Perhaps someday the sea becomes a sentence; perhaps it never does.

**锚句**：值更们管它叫「留书的墨碗」。
**Anchor sentence**: the watchers call it the ink bowl left for writing.

---

## 七 · Mapping（Echo No. 43 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the ink bowl left for writing · waiting for one sentence · the 41st Convocation | 一、二、三、四、五、六、七 |
| geography | the chapel · the cellar · the hour of rat | 一、二、四、六、七 |
| characters | the new watcher · the copyist · the unknown one who left it | 一、二、三、四、五、六 |
| story | the ink bowl left for writing · Echo No. 43 | 全篇 |
| items | the ink bowl · the stone table · the watcher's cap · the ledgers | 一、二、三、四、五、六、七 |
| history | After the 41st Convocation · the fourth day of the fog-tide month | 一、二、四、六、七 |

> 子时到了，雾潮月第四日的夜里，桌上墨碗会湿一会儿——抄本员若愿意来看，会看见那一点微光，像有句话还没写出口。
> When the hour of rat comes, on the fourth night of the fog-tide month, the bowl will be damp for a little while — if the copyist cared to look, he would see a faint glimmer, as though a sentence has not yet been written.
`,
  },
  {
    order: 44,
    slug: 'echo-044-the-shadi-that-never-catches-its-shadow',
    titleZh: '祠殿太阳钟上那根永远赶不上影子的指针',
    titleEn: 'The Hand on the Chapel Sun-Dial That Never Catches Its Shadow',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——建院第六十九年 · 正午时分。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the sixty-ninth year; the hour of noon.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 44): The Hand on the Chapel Sun-Dial That Never Catches Its Shadow

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院祠殿顶上那只叫作日影的太阳钟——指针停长年停在正午，影子留在正午附近。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the sun-dial atop the chapel — called shadi in the register; its hand is always near noon; its shadow never moves.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——建院第六十九年 · 正午时分。
> Era: the Institute — after the 41st Convocation; the sixty-ninth year; the hour of noon.

---

## 一 · 祠殿顶上的太阳钟

祠殿比任何人都高。屋檐全是铜绿色，唯独正中立着一根铜杆，下面圆形白石板上画着一圈刻度。

那东西不叫钟，叫「日影」。值守的人一进门，头都得先低下来——铜杆的高度比任何人的头都高一寸。

**锚句**：祠殿顶上立着一只叫「日影」的太阳钟。
**Anchor sentence**: atop the chapel stands the sun-dial called Shadi.

---

## 二 · 六十九年

日影立于建院第三年——抄本员说七十多年前有人记过，没人能告诉抄本员是谁记的。

白石上最古老的刻度旧到几乎看不见，最新的刻度比任何人的记忆都年轻。两条线之间有一张墨脱落了——值更不敢去补。

**锚句**：白石板上既有最古老的刻度，也有最年轻的刻度。
**Anchor sentence**: the white slab keeps both the oldest and the youngest marks.

---

## 三 · 正午

新的值守在建这个院子之前已经替它守夜六十多年。值守说：「日影从不到下午，也从不到上午。它一直卡在正午前后。」

正午的光柱盖住它，影子移走，然后再回来——封顶、停驻、毫无方向地原地打转。

**锚句**：日影从不到下午，也从不到上午——它长年卡在正午。
**Anchor sentence**: Shadi is never afternoon and never morning — it is always pinned at noon.

---

## 四 · 影子的形状

抄本员看向铜杆的影子时发现一件事：影子每次都不同。长一点、短一点、左一点、右一点——像有一双看不见的手在拨它。

可是实体铜杆一动不动。它动了，整个白石板就要都要换水，又不能换。

**锚句**：抄本员发现日影的影子每次都不同形状。
**Anchor sentence**: the copyist noticed Shadi's shadow is never the same twice.

---

## 五 · 有人看过它

抄本员不写它是谁写下去的。

每一次正午，值守一抬头，都会有一个人影站在他旁边抄下白板上的那一行痕迹——然后走开。抄本员抄了六十九年，对不上第三笔都不够照着来。

**锚句**：值守每次抬头都能看见有人在读白石板上那一行痕迹。
**Anchor sentence**: each time the watcher lifts his eyes, someone is reading the marks.

---

## 六 · 叫「日影」其实是错的

日影不是钟——钟是人用来计时的，它不数秒、不报时。它叫「日影」，因为它是海的影子落在事物上的位置。

真相：当年的海说「我先停一下，让他写完这篇，下回就走」——日影就停在这里，等那个一直在写字的人把字写完。

**锚句**：日影是海写字时候的停笔。
**Anchor sentence**: Shadi is where the sea paused while writing.

---

## 七 · 映射（回响四十四章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 日影 · 六十九年 · 海的停笔 | 一、二、三、四、五、六、七 |
| geography | 祠殿顶 · 白石板 · 正午 | 一、二、三、四、五、六 |
| characters | 值守 · 抄本员 · 写字的人 | 一、二、三、四、五、六 |
| story | 日影 · 回响（其四十四） | 全篇 |
| items | 铜杆 · 白石板 · 刻度 · 墨 | 一、二、三、四、五、六、七 |
| history | 第四十一次大会散会之后 · 建院第六十九年 | 一、二、六、七 |

> 下一次正午，当再一次有人仰头，白石板上那一行痕迹又多了一笔——日影还在原则。
> At the next noon, when someone looks up again, one more mark appears on the slab — and Shadi keeps its principle.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其四十四）「祠殿太阳钟上那根永远赶不上影子的指针」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the sun-dial atop the chapel — called Shadi in the register; its hand is always near noon; its shadow never moves.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院祠殿顶上那只叫作日影的太阳钟——指针停长年停在正午，影子留在正午附近。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the sixty-ninth year; the hour of noon.
> 纪元：潮候院 · 第四十一次大会散会之后——建院第六十九年 · 正午时分。

---

## 一 · The Sun-Dial atop the Chapel

The chapel is taller than any person. The eaves are all copper-green; at the very center stands a bronze rod, on a white stone slab ringed with marks.

It is not called a bell — it is called Shadi. Every watcher who enters lowers his head first — the bronze rod stands an inch above anyone's head.

**锚句**：祠殿顶上立着一只叫「日影」的太阳钟。
**Anchor sentence**: atop the chapel stands the sun-dial called Shadi.

---

## 二 · Sixty-Nine Years

Shadi was erected in the third year of the Institute — a copyist once noted more than seventy years ago, and no one can say who recorded it.

Both the oldest mark (almost invisible now) and the newest (young enough to remember who cut it) are still on that slab. Between the two lines one patch of ink has fallen away — no watcher dares repair it.

**锚句**：白石板上既有最古老的刻度，也有最年轻的刻度。
**Anchor sentence**: the white slab keeps both the oldest and the youngest marks.

---

## 三 · Noon

The new watcher has already kept watch over it for more than sixty years before this courtyard was built. He says: "Shadi is never past noon, and never before noon. It has been pinned there for ages."

When the light strikes Shadi at noon, its shadow slides away, then returns — it caps, stops, turns on the spot, going nowhere.

**锚句**：日影从不到下午，也从不到上午——它长年卡在正午。
**Anchor sentence**: Shadi is never afternoon and never morning — it is always pinned at noon.

---

## 四 · The Shape of the Shadow

When the copyist watches the shadow of the bronze rod, he finds one thing: the shape is different every time. Longer, shorter, left, right — as if an invisible hand were nudging it.

But the bronze rod itself never moves. If it moved, the whole white slab would have to be replaced, and it cannot be replaced.

**锚句**：抄本员发现日影的影子每次都不同形状。
**Anchor sentence**: the copyist noticed Shadi's shadow is never the same twice.

---

## 五 · Someone Has Watched It

The copyist does not write who those people are.

Every noon, when the watcher lifts his head, a silhouette stands beside him copying a line on the slab — then moves away. The copyist has been copying for sixty-nine years, and he cannot get even the third stroke right by memory.

**锚句**：值守每次抬头都能看见有人在读白石板上那一行痕迹。
**Anchor sentence**: each time the watcher lifts his eyes, someone is reading the marks.

---

## 六 · "Shadi" Is a Misnomer

Shadi is not a clock — a clock counts time, Shadi does not tick, does not announce hours. It is called "Shadi" because it is the shadow of the sea falling on things.

The truth: long ago the sea said, "Hold this a moment — let him finish writing. Then I'll go." Shadi stayed there, waiting for the writer's pen to finish.

**锚句**：日影是海写字时候的停笔。
**Anchor sentence**: Shadi is where the sea paused while writing.

---

## 七 · Mapping（Echo No. 44 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | Shadi · sixty-nine years · where the sea paused | 一、二、三、四、五、六、七 |
| geography | the chapel top · the white slab · noon | 一、二、三、四、五、六 |
| characters | the watcher · the copyist · the writer | 一、二、三、四、五、六 |
| story | Shadi · Echo No. 44 | 全篇 |
| items | the bronze rod · the white slab · the marks · ink | 一、二、三、四、五、六、七 |
| history | After the 41st Convocation · the 69th year of the Institute | 一、二、六、七 |

> 下一次正午，当再一次有人仰头，白石板上那一行痕迹又多了一笔——日影还在原则。
> At the next noon, when someone looks up again, one more mark appears on the slab — and Shadi keeps its principle.
`,
  },
  {
    order: 45,
    slug: 'echo-045-the-hemp-rope-in-the-side-chapel-that-is-never-finished',
    titleZh: '潮候院侧殿里那根永远织不完的麻绳',
    titleEn: 'The Hemp Rope in the Side Chapel That Is Never Finished',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——建院第六十九年 · 绳日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the sixty-ninth year; the day of the rope.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 45): The Hemp Rope in the Side Chapel That Is Never Finished

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院侧殿里那根值更们守着织、谁都织不完的麻绳。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the hemp rope in the side chapel of the Institute — no watcher can ever finish it.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——建院第六十九年 · 绳日。
> Era: the Institute — after the 41st Convocation; the sixty-ninth year; the day of the rope.

---

## 一 · 侧殿

潮候院侧殿比主殿矮半截，门老半开，拿麻绳拴着。

值更们值守的时候不到里面——只有夜里换更时，他们才把里面放一点水缸看进去。

**锚句**：潮候院侧殿里有一根麻绳，没有人织得完。
**Anchor sentence**: in the side chapel of the Institute there is a hemp rope no one can finish.

---

## 二 · 麻绳的来历

绳是用稻草和贝壳粉捻的——值守的第六代按一种谁也听不懂的顺序捻了几段又停了。

这根绳不是谁要打哪一打结要结果——是不断捻下去，直到打绳的人不见了。

**锚句**：绳是用稻草和贝壳粉捻的。
**Anchor sentence**: the rope was twisted of rice-straw and clamshell powder.

---

## 三 · 六十九年

侧殿的门槛上刻着一行小字：

建院第三年正月甲子日，始捻此绳，当不绝。

绳没有断过；绳没有织完过。一年又一年，值更守着这根绳，门槛刻字在风沙里慢慢变浅。

**锚句**：侧殿门槛上刻着一行小字：始捻此绳，当不绝。
**Anchor sentence**: on the threshold is a line: let this rope begin and never end.

---

## 四 · 没人敢结尾

每一任值更都看过这根绳——伸手捻一捻，立刻缩手。

老值更的一句话代代相授：绳不是要替你结，是替死去的人织完那一段。

**锚句**：老值更说绳要替死去的人织完那一段。
**Anchor sentence**: the senior watcher says the rope must finish the part left by the dead.

---

## 五 · 夜间

值更替绳守了六十九年。夜里海浪没打够响声的时候，值更就走到里面去——不是去看绳，是把手放在绳的上端，感动是不是下面还有点温。

没有人知道它下面有什么——但六十九年，值更们从不让一盏灯照过侧殿的门口.

**锚句**：值更们从不让一盏灯照过侧殿的门口。
**Anchor sentence**: the watchers never let a single lamp shine past the side chapel doorway.

---

## 六 · 管它叫什么

值更们管它叫「未结」。

不是一个名字，是一个状态——织绳的人还在，绳就不是成品；织绳的人走了，绳就该被解。

**锚句**：值更们管它叫「未结」。
**Anchor sentence**: they call it "the unfinished knot".

---

## 七 · 映射（回响四十五章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 未结 · 绳的语言 · 替死去的人织完 | 一、二、三、四、五、六、七 |
| geography | 潮候院 · 侧殿 · 绳日 | 一、二、三、六、七 |
| characters | 值更 · 织绳的人 · 死去的哥们儿 | 一、三、四、五、六 |
| story | 未结 · 回响（其四十五） | 全篇 |
| items | 麻绳 · 稻草 · 贝壳粉 · 门槛 | 一、二、三、四、五、六、七 |
| history | 第四十一次大会散会之后 · 建院第三年正月甲子 | 一、二、三、七 |

> 侧殿里什么时候让别人进去，就说明此时那里不需要绳了。
> Whenever someone is allowed into the side chapel, it means the rope is no longer needed there.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其四十五）「潮候院侧殿里那根永远织不完的麻绳」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the hemp rope in the side chapel — no watcher in this courtyard can ever finish it.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院侧殿里那根值更们守着织、谁都织不完的麻绳。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the sixty-ninth year; the day of the rope.
> 纪元：潮候院 · 第四十一次大会散会之后——建院第六十九年 · 绳日。

---

## 一 · The Side Chapel

The side chapel of the Institute is one half taller than the main one; its door is slightly open, tied with a hemp rope.

No watcher enters it during the watch — only at the change of shifts do they put a bucket of water at the threshold and peer inside.

**锚句**：潮候院侧殿里有一根麻绳，没有人织得完。
**Anchor sentence**: in the side chapel of the Institute there is a hemp rope no one can finish.

---

## 二 · Where the Rope Came From

The rope was twisted of rice-straw and clamshell powder — the sixth watcher twisted a few passes in a sequence no one could decipher, then stopped.

The rope was never made for a knot, or a binding, or a result — it was to keep being twisted until the twisters were gone.

**锚句**：绳是用稻草和贝壳粉捻的。
**Anchor sentence**: the rope was twisted of rice-straw and clamshell powder.

---

## 三 · Sixty-Nine Years

On the threshold of the side chapel is inscribed:

On the first day, day of jia-zi, in the first month of building the Institute, begin this rope — let it not cease.

The rope has never snapped; the rope was never finished. Year after year the watchers tend it; the threshold and its inscription fade in the weather.

**锚句**：侧殿门槛上刻着一行小字：始捻此绳，当不绝。
**Anchor sentence**: on the threshold is a line: let this rope begin and never end.

---

## 四 · No One Dares End It

Every watcher has laid hands on this rope — and pulled back.

A senior watcher passed it down as one sentence: the rope is not tied for you; it is tied to finish for those who died before you.

**锚句**：老值更说绳要替死去的人织完那一段。
**Anchor sentence**: the senior watcher says the rope must finish the part left by the dead.

---

## 五 · Night

The watchers have kept watch over this rope for sixty-nine years. In the night, when the sea does not roar loudly enough, the watcher steps inside — not to look at the rope, but to rest a hand on its upper end, to feel whether it is warm below.

No one knows what is beneath it — but for sixty-nine years, no watcher has ever let a lamp shine past the side chapel doorway.

**锚句**：值更们从不让一盏灯照过侧殿的门口。
**Anchor sentence**: the watchers never let a single lamp shine past the side chapel doorway.

---

## 六 · What They Call It

The watchers call it "the unfinished knot."

It is not a name, it is a state — while the twisters remain, it is unfinished; when the twisters are gone, it must be unravelled.

**锚句**：值更们管它叫「未结」。
**Anchor sentence**: they call it "the unfinished knot".

---

## 七 · Mapping（Echo No. 45 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the unfinished knot · the rope's language · finishing for the dead | 一、二、三、四、五、六、七 |
| geography | the Institute · the side chapel · the day of the rope | 一、二、三、六、七 |
| characters | the watchers · the twisters · the dead colleagues | 一、三、四、五、六 |
| story | the unfinished knot · Echo No. 45 | 全篇 |
| items | the hemp rope · rice-straw · clamshell powder · the threshold | 一、二、三、四、五、六、七 |
| history | After the 41st Convocation · the first month of the Institute | 一、二、三、七 |

> 侧殿里什么时候让别人进去，就说明此时那里不需要绳了。
> Whenever someone is allowed into the side chapel, it means the rope is no longer needed there.
`,
  },
  {
    order: 46,
    slug: 'echo-046-the-bronze-bell-on-the-tower-that-is-never-struck',
    titleZh: '雾港钟楼上那口从来没敲过的铜钟',
    titleEn: 'The Bronze Bell on the Fog-Harbor Bell Tower That Is Never Struck',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——雾潮月第九日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the ninth day of the fog-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 46): The Bronze Bell on the Fog-Harbor Bell Tower That Is Never Struck

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给雾港钟楼上那口铸于建院第七年、六十九年从没被人敲响过的铜钟。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the bronze bell on the fog-harbor bell tower — cast in the seventh year of the Institute; never struck in sixty-nine years.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——雾潮月第九日。
> Era: the Institute — after the 41st Convocation; the ninth day of the fog-tide month.

---

## 一 · 雾港钟楼

雾港钟楼是雾港最高的一件东西。底座石阶二十三级，楼上挂着一口铜钟。

钟楼门开了六十九年，没有人进过。雾港人从不往里看——上面要是真的是钟，下面就该有钟声。

**锚句**：雾港钟楼上立着一口铜钟，六十九年没被人敲过。
**Anchor sentence**: the fog-harbor bell tower has a bronze bell that no one has struck in sixty-nine years.

---

## 二 · 建院第七年

铜钟叫什么名字，雾港没有人知道。雾港也没有人打开敲敲看——钟声要是真的，六十九年前就该有了；钟声要是假的，敲了也是白敲。

抄本员的笔记里写道：第七年，钟铸成了；第七年，雾港不需要时间了。

**锚句**：钟是建院第七年铸成的。
**Anchor sentence**: the bell was cast in the seventh year of the Institute.

---

## 三 · 雾港的时辰

雾港没有时辰钟。它靠海潮、暮色和盐雾里的灯光报时。

老渔夫说雾港到了哪个季节，钟该敲就会响——只是有没有人能听见是另一回事。

**锚句**：雾港的时辰靠的是海潮和暮色，不是钟。
**Anchor sentence**: the fog harbor keeps time by the tide and the dusk, not by the bell.

---

## 四 · 值夜者的话

偶尔有直更说自己深夜里听见过一声——他虽然说听见过，但从不承认。

第二天直更睡过头了。他妻子敲开门，钟楼门开着，口子上没挂任何东西。他妻子只说：你再听到一次记得回来吃饭。

**锚句**：直更偶尔听见钟声，但从不承认听到过。
**Anchor sentence**: the night watch sometimes hears the bell, but never admits to it.

---

## 五 · 从不响

六十九年里，雾港见过的一切钟声都是海声，不是钟。

只有建院第七年雾港刚收到这口钟的那个秋上午，有人在里港远眺钟楼——记不得人是谁，只记得带了一个小木锤。

**锚句**：雾港所有的钟声都是海声，不是钟声。
**Anchor sentence**: every bell-ring in the fog harbor is the sea, not the bell.

---

## 六 · 不散的时辰

值更们管这口钟叫「不散的时辰」。

它不散——它在那儿挂着，等钟该敲的那一天；等海不再响、月亮不再被雾遮住、值守换完最后一个班之后。

**锚句**：值更们管这口钟叫「不散的时辰」。
**Anchor sentence**: the watchers call the bell "the unstruck hour".

---

## 七 · 映射（回响四十六章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 不散的时辰 · 海声不是钟 · 建院第七年 | 一、二、三、四、五、六、七 |
| geography | 雾港 · 钟楼 · 雾潮月第九日 | 一、二、三、六、七 |
| characters | 直更 · 渔夫的妻子 · 不知谁敲过的钟 | 一、四、五、六 |
| story | 不散的时辰 · 回响（其四十六） | 全篇 |
| items | 铜钟 · 木锤 · 二十三级石阶 · 雾海 | 一、二、三、四、五、六、七 |
| history | 第四十一次大会散会之后 · 建院第七年 · 雾潮月第九日 | 一、二、五、七 |

> 未来哪一天钟自己响起来的时候，雾港人会全都停下手里的事——然后一起转过身面对钟楼。
> The day the bell rings by itself, everyone in the fog harbor will put everything down — and turn together toward the tower.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其四十六）「雾港钟楼上那口从来没敲过的铜钟」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the bronze bell on the fog-harbor bell tower — cast in the seventh year of the Institute; it is never struck.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给雾港钟楼上那口铸于建院第七年、六十九年从没被人敲响过的铜钟。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the ninth day of the fog-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——雾潮月第九日。

---

## 一 · The Bell Tower of the Fog Harbor

The fog-harbor bell tower is the tallest thing in the fog harbor. Twenty-three stone steps, with a bronze bell hanging at the top.

The tower door has been open for sixty-nine years, and no one has entered it. Nobody looks in — if there were truly a bell on top, there would be bell-ringing below.

**锚句**：雾港钟楼上立着一口铜钟，六十九年没被人敲过。
**Anchor sentence**: the fog-harbor bell tower has a bronze bell that no one has struck in sixty-nine years.

---

## 二 · The Seventh Year

No one in the fog harbor knows the bell's name. No one has tried lifting a mallet either — if the bell were real, it would have rung sixty-nine years ago; if it were a fake, striking it would buy nothing.

The copyist's notebook has a line: in the seventh year, the bell was cast; in the seventh year, the fog harbor no longer needed time.

**锚句**：钟是建院第七年铸成的。
**Anchor sentence**: the bell was cast in the seventh year of the Institute.

---

## 三 · Fog-Harbor Keeping of Time

The fog harbor keeps no hours. It tells time by the tide, by the dusk, by the few lights scattered through the salt mist.

The old fisherman says the fog harbor rings the bell when the season turns — but whether anyone hears it is another matter.

**锚句**：雾港的时辰靠的是海潮和暮色，不是钟。
**Anchor sentence**: the fog harbor keeps time by the tide and the dusk, not by the bell.

---

## 四 · The Night Watch

Now and then a night watch says he heard a note in the deep night — though he says he heard one, he never admits it.

The next day the watch overslept. His wife knocked on the door, and the tower door was standing open with nothing hanging in the belfry. She only said: if you hear it again, come back to eat.

**锚句**：直更偶尔听见钟声，但从不承认听到过。
**Anchor sentence**: the night watch sometimes hears the bell, but never admits to it.

---

## 五 · It Never Rings

For sixty-nine years everything the fog harbor has mistaken for bells has been sea, not bell.

Only once, the very same autumn afternoon the bell first reached the fog harbor, one person looked from the inner harbor up to the tower — nobody remembers who, only that he carried a small wooden mallet.

**锚句**：雾港所有的钟声都是海声，不是钟声。
**Anchor sentence**: every bell-ring in the fog harbor is the sea, not the bell.

---

## 六 · The Unstruck Hour

The watchers call the bell "the unstruck hour."

It does not disperse — it hangs there, waiting for the day the bell should ring; for the day the sea falls silent, the moon is no longer behind the mist, and the last watcher hands over to no one.

**锚句**：值更们管这口钟叫「不散的时辰」。
**Anchor sentence**: the watchers call the bell "the unstruck hour".

---

## 七 · Mapping（Echo No. 46 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the unstruck hour · the sea is not the bell · the seventh year | 一、二、三、四、五、六、七 |
| geography | the fog harbor · the bell tower · the ninth day of the fog-tide month | 一、二、三、六、七 |
| characters | the night watch · the wife · whoever struck no one knows | 一、四、五、六 |
| story | the unstruck hour · Echo No. 46 | 全篇 |
| items | the bronze bell · the wooden mallet · twenty-three steps · the sea-mist | 一、二、三、四、五、六、七 |
| history | After the 41st Convocation · the seventh year of the Institute · the ninth day of the fog-tide month | 一、二、五、七 |

> 未来哪一天钟自己响起来的时候，雾港人会全都停下手里的事——然后一起转过身面对钟楼。
> The day the bell rings by itself, everyone in the fog harbor will put everything down — and turn together toward the tower.
`,
  },
  {
    order: 47,
    slug: 'echo-047-the-dewdrop-on-the-hay-board-that-never-moves',
    titleZh: '潮候院后院晒干草的木板上那颗从不动的露珠',
    titleEn: 'The Dewdrop on the Hay Board in the Backyard That Never Moves',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——建院第六十九年 · 海风初霁。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the sixty-ninth year; the morning after the sea-wind clears.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 47): The Dewdrop on the Hay Board in the Backyard That Never Moves

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院后院那块晒干草的木板上停站了六十九年的露珠。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the dewdrop on the hay-drying board in the Institute's backyard — it has not moved in sixty-nine years.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——建院第六十九年 · 海风初霁。
> Era: the Institute — after the 41st Convocation; the sixty-ninth year; the morning after the sea-wind clears.

---

## 一 · 潮候院的后院

潮候院后院没有观览物。没有棵树种的位置，也没有水塘。

院子被围墙围着，除了一扇不开的侧门——门边靠墙立着一块木板，用来晒干草（海草）。草堆很丰厚；值更们说这里是院中最偏的角落，没人来。

**锚句**：潮候院后院有一块晒干草的木板。
**Anchor sentence**: in the backyard of the Institute there is a board for drying hay.

---

## 二 · 那一颗露珠

木板上压着一颗露珠。天晴时它还是留在同一个位置，不渗不降。

抄本员说他的父亲也看见了那颗露珠，但父亲死的时候他还是看到那颗露珠没有动。

**锚句**：木板上有一颗露珠，六十九年没动过。
**Anchor sentence**: on the board is a dewdrop that has not moved in sixty-nine years.

---

## 三 · 早晨

每天早晨初阳把雾烤散的时候，木板上的草堆会泛起一层金黄色。露珠在金黄色里会闪一下，又静下去。

值更换班的时候经过后院，目光会被那颗露珠吸引一秒——然后颈椎一动回到自己该看的方向。

**锚句**：每晨初阳把雾烤散的时候，木板上的露珠会闪一下，又静下去。
**Anchor sentence**: every morning when the first sun burns off the mist, the dewdrop on the board flashes once, and goes still again.

---

## 四 · 六十九年的传承

换干草垛的时候，值更们从来不把那颗露珠的位置动一分一毫。

换的时候，木板上会留一个指甲盖大小的凹陷，是露珠六十九年来留下的印记。新的值更会小心绕开那个凹陷。

**锚句**：换干草垛时，没有一个人动过露珠的位置。
**Anchor sentence**: when the hay was changed, no one ever disturbed the dewdrop's place.

---

## 五 · 新家的羊羔

某年院里来了一只羊羔，去后院找水喝，别的都喝了，就是那颗露珠碰都没碰——它也知道那个位置是什么。

值更们到今天还说那只羊羔比人看得清楚。

**锚句**：换草垛时，羊羔们都绕开了那颗露珠。
**Anchor sentence**: when the hay was changed, even the lambs walked around that dewdrop.

---

## 六 · 不愿早的

值更们管它叫「不愿早的」。

不是说露珠「不愿早」，而是它在告诉人：有些东西不赶时间，它就是为那个位置而留下的。

**锚句**：值更们管它叫「不愿早的」。
**Anchor sentence**: they call it "the one that will not leave early".

---

## 七 · 映射（回响四十七章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 不愿早的 · 六十九年不动 · 海风初霁 | 一、二、三、四、五、六、七 |
| geography | 潮候院 · 后院 · 海风初霁 | 一、二、三、四、六、七 |
| characters | 值更 · 抄本员 · 羊羔 | 一、三、四、五、六 |
| story | 不愿早的 · 回响（其四十七） | 全篇 |
| items | 木板 · 露珠 · 干草 · 侧门 | 一、二、三、四、五、六、七 |
| history | 第四十一次大会散会之后 · 建院第六十九年 | 二、四、五、六、七 |

> 六十九年后的某个早晨，当院里的所有人都走了，露珠还是会落在同一个位置——它不需要谁记得它。
> One morning sixty-nine years from now, when everyone is gone, the dewdrop will still be in the same place — it does not need to be remembered.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其四十七）「潮候院后院晒干草的木板上那颗从不动的露珠」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the dewdrop on the hay-drying board in the Institute's backyard — it has not moved in sixty-nine years.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院后院那块晒干草的木板上停站了六十九年的露珠。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the sixty-ninth year; the morning after the sea-wind clears.
> 纪元：潮候院 · 第四十一次大会散会之后——建院第六十九年 · 海风初霁。

---

## 一 · The Backyard of the Institute

There is nothing in the Institute's backyard. No tree, no pond.

It is walled in, with one side-door that never opens — by the door stands a board leaned against the wall, for drying hay (sea-grass). The stack is generous; the watchers call it the farthest corner of the yard, and no one comes here.

**锚句**：潮候院后院有一块晒干草的木板。
**Anchor sentence**: in the backyard of the Institute there is a board for drying hay.

---

## 二 · The One Dewdrop

Pressed on the board sits a single dewdrop. When the sky is clear it stays in the same place — it neither leaks nor sinks.

The copyist says his father saw that dewdrop too, and when his father died the dewdrop was still there.

**锚句**：木板上有一颗露珠，六十九年没动过。
**Anchor sentence**: on the board is a dewdrop that has not moved in sixty-nine years.

---

## 三 · Morning

Every morning when the first sun burns the mist away, the hay on the board turns gold. The dewdrop flashes in the gold once, and goes still again.

On the change of the watch at dawn, the watchers' eyes are drawn to the dewdrop for a second — then their necks turn back to where they should be looking.

**锚句**：每晨初阳把雾烤散的时候，木板上的露珠会闪一下，又静下去。
**Anchor sentence**: every morning when the first sun burns off the mist, the dewdrop on the board flashes once, and goes still again.

---

## 四 · Sixty-Nine Years of Keeping

When the hay was replaced, no watcher disturbed the dewdrop's place by a single grain.

During the exchange the board kept a nail-size hollow — the mark the dewdrop left in sixty-nine years. The new watchers work around that hollow.

**锚句**：换干草垛时，没有一个人动过露珠的位置。
**Anchor sentence**: when the hay was changed, no one ever disturbed the dewdrop's place.

---

## 五 · The Lamb in the Yard

One year a lamb came into the yard to look for water. It drank from everything else, but it did not touch the dewdrop — it knew what that hollow was.

The watchers still say that lamb sees more clearly than people do.

**锚句**：换草垛时，羊羔们都绕开了那颗露珠。
**Anchor sentence**: when the hay was changed, even the lambs walked around that dewdrop.

---

## 六 · The One That Will Not Leave Early

The watchers call it "the one that will not leave early."

It is not that the dewdrop refuses to go early — it is saying to people: some things are not in a hurry; they stay for the place they were left at.

**锚句**：值更们管它叫「不愿早的」。
**Anchor sentence**: they call it "the one that will not leave early".

---

## 七 · Mapping（Echo No. 47 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the one that will not leave early · sixty-nine years unmoved · the morning after the sea-wind | 一、二、三、四、五、六、七 |
| geography | the Institute · the backyard · after the sea-wind clears | 一、二、三、四、六、七 |
| characters | the watchers · the copyist · the lamb | 一、三、四、五、六 |
| story | the one that will not leave early · Echo No. 47 | 全篇 |
| items | the board · the dewdrop · the hay · the side-door | 一、二、三、四、五、六、七 |
| history | After the 41st Convocation · the sixty-ninth year of the Institute | 二、四、五、六、七 |

> 六十九年后的某个早晨，当院里的所有人都走了，露珠还是会落在同一个位置——它不需要谁记得它。
> One morning sixty-nine years from now, when everyone is gone, the dewdrop will still be in the same place — it does not need to be remembered.
`,
  },
  {
    order: 48,
    slug: 'echo-048-the-waiting-passenger-on-the-fog-harbor-ferry',
    titleZh: '雾港渡船上那位从不开口的船客',
    titleEn: 'The Passenger on the Fog-Harbor Ferry Who Never Speaks',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第二日的渡口。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the second day of the autumn-tide month at the crossing.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 48): The Passenger on the Fog-Harbor Ferry Who Never Speaks

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给雾港渡船上那位坐船尾第一个座位、从来没有人问他去哪的船客。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the passenger on the fog-harbor ferry — always first seat at the stern, no one asks where he is going.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第二日的渡口。
> Era: the Institute — after the 41st Convocation; the second day of the autumn-tide month at the crossing.

---

## 一 · 雾港渡口

雾港渡口搭一条往另一岸的渡船，每天只有两趟——早上一趟出，傍晚一趟回。

船上的事很少有人记——雾港人上船目的很明确，到岸就下。但有一个人不是这样——他上船不买票，也没有人查票。

**锚句**：雾港渡船上坐着一位不说话的船客。
**Anchor sentence**: a passenger who never speaks rides the fog-harbor ferry.

---

## 二 · 船尾的第一个座位

每次都坐在船尾第一个座位上。座位是条旧板凳，上面铺了一块破布。

没人数过他出现过几次——他每次出现的时间都不同，有时是凌晨开，有时是黄昏收。他的这件破外套还是一件。

**锚句**：他每次都坐在船尾第一个座位上。
**Anchor sentence**: he always sits on the first seat at the stern.

---

## 三 · 不说话

船客没有开口过。他偶尔慢慢眨眼睛、看船桅杆或水面。

渡船的值守问他一次他要去哪，他没抬头——起身，走到船尾，把手搭在栏杆上。

**锚句**：没有人问过他要去哪——他也从没说过。
**Anchor sentence**: no one has ever asked him where he is going — and he has never said.

---

## 四 · 对岸

他到的那个对岸，那地方雾港人不认得。

虽然渡船不开自家航线——渡船从雾港往来的都是码头和渡口之间，船不到别处。但他还是每次都走同一个座位下船。

**锚句**：他到的那个对岸，没有雾港人认得。
**Anchor sentence**: the far shore he reaches — no fog-harbor person recognizes it.

---

## 五 · 锈蚀的扶手

船到对岸时，他都会松开手。栏杆是锈蚀的，那地方是同一块锈蚀最严重的一处。

**锚句**：船到对岸时，他松开手的位置是同一个点。
**Anchor sentence**: when the ferry docks, he lets go at the same point every time.

---

## 六 · 候渡人

值更们管他叫「候渡人」。

不是等渡船——是等一个雾港的人都在等的那个时刻：海要吞下一切之前，让这个渡口时刻铭记。

**锚句**：值更们管他叫「候渡人」。
**Anchor sentence**: the watchers call him "the waiting passenger".

---

## 七 · 映射（回响四十八章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 候渡人 · 锈蚀栏杆 · 对岸 | 一、二、三、四、五、六、七 |
| geography | 雾港 · 渡口 · 秋潮月第二日 | 一、二、五、六、七 |
| characters | 候渡人 · 渡船值守 · 没人知道他去哪 | 一、三、四、五、六 |
| story | 候渡人 · 回响（其四十八） | 全篇 |
| items | 破外套 · 板凳 · 锈栏杆 · 破布 | 一、二、三、四、五、六、七 |
| history | 第四十一次大会散会之后 · 秋潮月第二日 | 一、五、六、七 |

> 一旦有人敢答上话的时候，雾港的所有渡船都不会再走了——直到那一天。
> The day someone speaks to him, no fog-harbor ferry will ever sail again — until then.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其四十八）「雾港渡船上那位从不开口的船客」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the passenger on the fog-harbor ferry — always first seat at the stern, no one asks where he is going.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给雾港渡船上那位坐船尾第一个座位、从来没有人问他去哪的船客。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the second day of the autumn-tide month at the crossing.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第二日的渡口。

---

## 一 · The Crossing at the Fog Harbor

The fog-harbor crossing runs one boat to the opposite shore each day — one in the morning, one in the evening.

Little needs recording on the boat — fog-harbor people know exactly where they are going. But one person does not ride it that way — he comes on, no ticket; no one checks tickets.

**锚句**：雾港渡船上坐着一位不说话的船客。
**Anchor sentence**: a passenger who never speaks rides the fog-harbor ferry.

---

## 二 · The First Seat at the Stern

He always sits on the first bench at the stern. It is an old bench with a cloth thrown over it.

No one ever counted how many times he has appeared — he appears at different hours each time; sometimes at dawn to cross, sometimes at dusk to return. The coat he wears is always the same.

**锚句**：他每次都坐在船尾第一个座位上。
**Anchor sentence**: he always sits on the first seat at the stern.

---

## 三 · Silence

The passenger has never opened his mouth. Now and then he blinks slowly and looks at the mast or the surface.

Once the ferryman asked where he was headed. He did not raise his head — he stood, went to the stern, and rested his hand on the rail.

**锚句**：没有人问过他要去哪——他也从没说过。
**Anchor sentence**: no one has ever asked him where he is going — and he has never said.

---

## 四 · The Far Shore

No fog-harbor person recognizes the side of the shore he steps onto.

Though the ferry goes only between the harbor and the crossing, he always disembarks at the same seat every time.

**锚句**：他到的那个对岸，没有雾港人认得。
**Anchor sentence**: the far shore he reaches — no fog-harbor person recognizes it.

---

## 五 · The Rusted Rail

Every time the boat docks, he lets go. The railing is rusted; he lets go at the one spot most rusted of all.

**锚句**：船到对岸时，他松开手的位置是同一个点。
**Anchor sentence**: when the ferry docks, he lets go at the same point every time.

---

## 六 · The Waiting Passenger

The watchers call him "the waiting passenger."

It is not that they wait for the ferry — they wait for the moment everyone in the fog harbor is waiting for: the last breath before the sea takes all.

**锚句**：值更们管他叫「候渡人」。
**Anchor sentence**: the watchers call him "the waiting passenger".

---

## 七 · Mapping（Echo No. 48 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the waiting passenger · the rusted rail · the far shore | 一、二、三、四、五、六、七 |
| geography | the fog harbor · the crossing · the second day of the autumn-tide month | 一、二、五、六、七 |
| characters | the waiting passenger · the ferryman · no one knows where he goes | 一、三、四、五、六 |
| story | the waiting passenger · Echo No. 48 | 全篇 |
| items | the coat · the bench · the rusted rail · the cloth | 一、二、三、四、五、六、七 |
| history | After the 41st Convocation · the second day of the autumn-tide month | 一、五、六、七 |

> 一旦有人敢答上话的时候，雾港的所有渡船都不会再走了——直到那一天。
> The day someone speaks to him, no fog-harbor ferry will ever sail again — until then.
`,
  },
  {
    order: 49,
    slug: 'echo-049-the-half-moon-tide-that-no-one-struck-out',
    titleZh: '雾港渡口那张印错的潮汐表上从来没被划掉的那一行',
    titleEn: 'The One Row Never Struck Out on the Misprinted Tide-Table Posted by the Fog-Harbor Ferry',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第三日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the third day of the autumn-tide month.',
    markdownZh: `
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给雾港渡口边那张贴错了一行、谁都没有动手划掉的潮汐表。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the tide-table posted by the fog-harbor crossing — one row wrong, and no one has struck it out.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第三日。
> Era: the Institute — after the 41st Convocation; the third day of the autumn-tide month.

---

## 一 · 渡口的公告栏

雾港渡口有一块公告栏，钉在一根半旧的木柱子上。每天的差事挂在上面——渡口的大筐、潮汐表、去炉前的告示。

季节变成秋潮月的第三天，那张潮汐表还在柱子上挂着。柱子的漆已经剥落快到底了，表上的墨迹也褪了大半。

**锚句**：渡口的公告栏上有一张潮汐表，钉在半旧的木柱子上。
**Anchor sentence**: on the crossing's notice-post hangs a tide-table pinned to a half-worn beam.

---

## 二 · 印错的那一行

潮汐表的最后一行，印着一个没人送走的潮沙盘的符号。值守忙得烫伤了手，只是顺手推去一行待印——那行符号多印了一道。

补货的渔夫来抄写它的时候，把这行符号认作半月潮。他想把那行删掉，抄本员的儿子按阻了他。

**锚句**：潮汐表最后一行的符号被多印了一道。
**Anchor sentence**: the last row of the tide-table was printed with one extra stroke.

---

## 三 · 谁也没删

摆渡人是几年之后才注意到这一行的。他不知道这表是哪一茬印的，也不知道这行算不算错。

修公告栏的老人每年秋潮月都过来看一眼。他看了一眼，摇了摇头，什么也没动。摆渡人问他为什么不抽下来，他走开，没有回答。

**锚句**：没人把它抽下来，也没人划掉那一行。
**Anchor sentence**: no one took it down, and no one struck that row out.

---

## 四 · 秋潮月第三天

秋潮月第三天的清晨，渡口的雾里有人听见了没人划的那一行敲过一次。

他睁不开眼的时候，别人告诉他那只是柱子落了一片漆，插了一秒钟的话——说过去了。

**锚句**：秋潮月第三天雾里有人听见那一行敲了一次。
**Anchor sentence**: on the third day of the autumn-tide month, someone heard that row knock once.

---

## 五 · 等削

老摆渡人说他不会去抽这张表。

他说这张表会在秋潮月第三天被自己认到。没人问他「认到」是什么意思，也没人敢问。

**锚句**：老摆渡人说这张表会被自己认到。
**Anchor sentence**: the old ferryman says this table will come to know itself.

---

## 六 · 半月潮

值更们管这行错的潮汐线叫「半月潮」。

不是因为它涨了半个月——是它等的那个人，来的那一天会有一半的月亮，一半亮一半暗。

**锚句**：值更们管这行错的潮汐线叫「半月潮」。
**Anchor sentence**: the watchers call that misprinted row "the half-moon tide".

---

## 七 · 映射（回响四十九章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 半月潮 · 秋潮月第三日 · 被自己认到 | 一、二、三、四、五、六、七 |
| geography | 雾港 · 渡口 · 秋潮月第三日 | 一、二、五、六、七 |
| characters | 摆渡人 · 修公告栏的老人 · 渔夫抄本员之子 | 一、二、三、四、五、六、七 |
| story | 半月潮 · 回响（其四十九） | 全篇 |
| items | 潮汐表 · 公告栏 · 符号 · 漆 | 一、二、三、四、五、六、七 |
| history | 第四十一次大会散会之后 · 秋潮月第三日 | 二、三、五、六、七 |

> 下一次秋潮月第三天，有人会摸到那张本该被划掉的潮汐表——然后让它留着。
> On the next third of the autumn-tide month, someone will touch the row that should have been struck out — and leave it be.
`,
    markdownEn: `
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the tide-table posted by the fog-harbor crossing — one row wrong, and no one has struck it out.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给雾港渡口边那张贴错了一行、谁都没有动手划掉的潮汐表。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the third day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第三日。

---

## 一 · The Notice-Post at the Crossing

There is a notice-post at the fog-harbor crossing, nailed to a half-worn beam. The day's errands hang on it — the harbor basket, the tide-table, an announcement about the stove.

By the third day of the autumn-tide month it was still pinned up; the beam's paint had nearly peeled away; the ink on the table had faded too.

**锚句**：渡口的公告栏上有一张潮汐表，钉在半旧的木柱子上。
**Anchor sentence**: on the crossing's notice-post hangs a tide-table pinned to a half-worn beam.

---

## 二 · The Misprinted Row

The last row of the tide-table prints the sign for a sand-table nobody has ever brought in. The watcher had burned his hand in haste; only pushed the row through to the press — with one extra stroke.

When the stock-ship's fisherman saw it, he read the row as the tide of the half-moon. He meant to strike the row out — but the copyist's son held him back.

**锚句**：潮汐表最后一行的符号被多印了一道。
**Anchor sentence**: the last row of the tide-table was printed with one extra stroke.

---

## 三 · No One Struck it Out

The ferryman noticed the row years later. He had no idea which press printed this table, or whether that row was wrong at all.

The old man who repairs the post comes to look once a year, every third of the autumn-tide month. He looks, shakes his head, and touches nothing. When the ferryman asked why he does not take the table down, the old man walked away without answering.

**锚句**：没人把它抽下来，也没人划掉那一行。
**Anchor sentence**: no one took it down, and no one struck that row out.

---

## 四 · The Third Day of the Autumn-Tide Month

On the morning of the third day of the autumn-tide month, someone woke in the mist and heard that row knock once.

He could not open his eyes — the others told him only a flake of paint had fallen, repeating the sentence once. Then it was over.

**锚句**：秋潮月第三天雾里有人听见那一行敲了一次。
**Anchor sentence**: on the third day of the autumn-tide month, someone heard that row knock once.

---

## 五 · Waiting to Be Read

The old ferryman says he will not pull the table down.

He says the table will come to know itself on the third day of the autumn-tide month. No one asks what "know itself" means — no one dares.

**锚句**：老摆渡人说这张表会被自己认到。
**Anchor sentence**: the old ferryman says this table will come to know itself.

---

## 六 · The Half-Moon Tide

The watchers call that misprinted tide-line "the half-moon tide."

Not because it rises for half a month — but because the one it is waiting for will come under a half-moon, half bright and half dark.

**锚句**：值更们管这行错的潮汐线叫「半月潮」。
**Anchor sentence**: the watchers call that misprinted row "the half-moon tide".

---

## 七 · Mapping（Echo No. 49 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the half-moon tide · the third day of the autumn-tide month · coming to know itself | 一、二、三、四、五、六、七 |
| geography | the fog harbor · the crossing · the third day of the autumn-tide month | 一、二、五、六、七 |
| characters | the ferryman · the old man who repairs the post · the fisherman's son | 一、二、三、四、五、六、七 |
| story | the half-moon tide · Echo No. 49 | 全篇 |
| items | the tide-table · the beam · the sign · the paint | 一、二、三、四、五、六、七 |
| history | After the 41st Convocation · the third day of the autumn-tide month | 二、三、五、六、七 |

> 下一次秋潮月第三天，有人会摸到那张本该被划掉的潮汐表——然后让它留着。
> On the next third of the autumn-tide month, someone will touch the row that should have been struck out — and leave it be.
`,
  },
  {
    order: 50,
    slug: 'echo-050-the-forty-first-blank-page-in-the-index',
    titleZh: '祠殿南厢房那本旧目录上空着的第四十一页',
    titleEn: 'The Forty-First Blank Page in the Old Index in the South Hall of the Chapel',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——雾潮月第十日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the tenth day of the fog-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 50): The Forty-First Blank Page in the Old Index in the South Hall of the Chapel

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院祠殿南厢房那本目录上空着看没人写的第四十一页。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the old index in the south hall of the chapel — its forty-first page is left blank, and no one has filled it.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——雾潮月第十日。
> Era: the Institute — after the 41st Convocation; the tenth day of the fog-tide month.

---

## 一 · 南厢房

祠殿南厢房的南窗不直对太阳直射。光从偏西进入，把地板上的影子分成纵横四片。

南厢房里放着一张橡木长桌——抄本员把目录簿放在上面。书的封面是绿色，书角和书脊都磨出了米色，但纸页里面每个字都像没擦一样整齐。

**锚句**：祠殿南厢房有一张橡木长桌，抄本员每天都会坐在那儿翻目录簿。
**Anchor sentence**: the south hall of the chapel has a long oak table; every day the copyist sits there leafing through the index.

---

## 二 · 第四十一页

目录簿的第四十一页是空的。它不是被撕掉，不是被水淹；空白从上面留到下面。

抄本员的父亲曾说他年轻时见过第四十一页写满字的样子——可他没说是谁写的，也没说他有多大。抄本员没敢问。

**锚句**：目录簿第四十一页是空的，从上面留到下面。
**Anchor sentence**: the forty-first page of the index is blank, from top to bottom.

---

## 三 · 潜水的虫

书虫没有在第四十一页里出现。

抄本员翻过这页时发现两端都被虫蛀了——蛀洞在第一页和第四十二页两端，第四十一页两面都没有完整的孔。

**锚句**：书虫没有在第四十一页里出现。
**Anchor sentence**: the book-worms never appear on the forty-first page.

---

## 四 · 父亲的话

抄本员的父亲是船舱里怎样死的没人知道，可目录里为什么空了一页却记得很清楚。

抄本员问父亲「空的第四十一页是写给谁的」。父亲摇摇头，说：「留给海看的一页。海不会在第四十一页里留什么。」

**锚句**：抄本员的父亲说 — 留给海看的一页——海不会在第四十一页里留什么。
**Anchor sentence**: the copyist's father said — it is a page left open for the sea; the sea writes nothing there.

---

## 五 · 灯光

灯没灭的时候，第四十一页完全是凉的。抄本员伸手摸上去——半块书页凉得像贴过青铜。

他没见过青铜——没人能给他看它是什么颜色。他听到过青铜在夜风里柔和地鸣叫。

**锚句**：抄本员伸手摸第四十一页时，它半块凉得像青铜。
**Anchor sentence**: when the copyist lays his hand on the forty-first page, half of it is cold as bronze.

---

## 六 · 空页之间

南厢房里的抄本员们写过每一页，每个目录的每一件事都是他们写上去的——除了第四十一页。

没人知道谁能写——没人写过，也没人见过谁来写过。

**锚句**：没人知道谁能写第四十一页，也没人见过谁来写过。
**Anchor sentence**: no one knows who can write the forty-first page, nor has anyone seen anyone come to write it.

---

## 七 · 映射（回响五十章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 第四十一页 · 留给海看 · 空着也不写 | 一、二、三、四、五、六、七 |
| geography | 祠殿 · 南厢房 · 雾潮月第十日 | 一、三、五、六、七 |
| characters | 抄本员 · 抄本员的父亲 · 留给海的一页 | 一、三、四、五、六 |
| story | 第四十一页 · 回响（其五十） | 全篇 |
| items | 目录簿 · 橡木长桌 · 绿封面 · 书虫 | 一、二、三、四、五、六、七 |
| history | 第四十一次大会散会之后 · 雾潮月第十日 | 二、四、六、七 |

> 未来哪一次烧书的时候，第四十一页只要被留了下来——它就还会等。
> Whenever the book is ever burned, the forty-first page — if it alone is spared — it will still wait.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其五十）「祠殿南厢房那本旧目录上空着的第四十一页」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the old index in the south hall of the chapel — its forty-first page is left blank, and no one has filled it.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院祠殿南厢房那本目录上空着看没人写的第四十一页。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the tenth day of the fog-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——雾潮月第十日。

---

## 一 · The South Hall

The southern window of the south hall does not take a direct strike of the sun. Light enters from a slightly west angle, dividing the floor into four long strips and their shadows.

The hall holds a long oak table — the copyist places the index on it. The book is green; the corners and the spine are worn to an amber tone, but every word inside looks as if it has not been touched.

**锚句**：祠殿南厢房有一张橡木长桌，抄本员每天都会坐在那儿翻目录簿。
**Anchor sentence**: the south hall of the chapel has a long oak table; every day the copyist sits there leafing through the index.

---

## 二 · The Forty-First Page

The forty-first page of the index is blank. It was not torn out, nor soaked; the blankness runs from page top to page bottom.

The copyist's father said once that he remembered the forty-first page filled with writing when he was young — but he never said who wrote it, nor how old he was. The copyist did not dare to ask.

**锚句**：目录簿第四十一页是空的，从上面留到下面。
**Anchor sentence**: the forty-first page of the index is blank, from top to bottom.

---

## 三 · The Book-Worms

The book-worms never appear on the forty-first page.

When the copyist leafs through it, he notices the holes begin on the first page and resume on the forty-second — the forty-first is untouched on both faces.

**锚句**：书虫没有在第四十一页里出现。
**Anchor sentence**: the book-worms never appear on the forty-first page.

---

## 四 · The Father's Words

The copyist's father — how he died in a vessel's hold no one knows — but the blank page he remembers clearly.

The copyist once asked him: "Who is the forty-first page written for?" The father shook his head and said: "The forty-first is a page left open for the sea. The sea writes nothing there."

**锚句**：抄本员的父亲说 — 留给海看的一页——海不会在第四十一页里留什么。
**Anchor sentence**: the copyist's father said — it is a page left open for the sea; the sea writes nothing there.

---

## 五 · The Lamp Light

While the lamp is lit, the forty-first page is entirely cold. The copyist lays his hand on it — half the page feels like it was lain flat on bronze.

He has never seen bronze. No one can show him what color bronze is. But he has heard bronze sing faintly in the night wind.

**锚句**：抄本员伸手摸第四十一页时，它半块凉得像青铜。
**Anchor sentence**: when the copyist lays his hand on the forty-first page, half of it is cold as bronze.

---

## 六 · Between the Blank Pages

The copyists in the south hall have written every page, every ledger entry, every act and addenda — except the forty-first page.

No one knows who could write it. No one has ever written there, nor seen anyone actually come and write.

**锚句**：没人知道谁能写第四十一页，也没人见过谁来写过。
**Anchor sentence**: no one knows who can write the forty-first page, nor has anyone seen anyone come to write it.

---

## 七 · Mapping（Echo No. 50 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the forty-first page · left open for the sea · blank by design | 一、二、三、四、五、六、七 |
| geography | the chapel · the south hall · the tenth day of the fog-tide month | 一、三、五、六、七 |
| characters | the copyist · the copyist's father · the page left open for the sea | 一、三、四、五、六 |
| story | the forty-first page · Echo No. 50 | 全篇 |
| items | the index · the oak table · the green cover · the book-worms | 一、二、三、四、五、六、七 |
| history | After the 41st Convocation · the tenth day of the fog-tide month | 二、四、六、七 |

> 未来哪一次烧书的时候，第四十一页只要被留了下来——它就还会等。
> Whenever the book is ever burned, the forty-first page — if it alone is spared — it will still wait.
`,
  },
  {
    order: 51,
    slug: 'echo-051-the-footprints-on-the-seventh-step-of-the-lantern-tower-never-cleaned',
    titleZh: '雾港灯塔第七级台阶上那双从来没擦掉的脚印',
    titleEn: 'The Footprints On the Seventh Step of the Fog-Harbor Lantern Tower That Are Never Cleaned',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——雾潮月第十三日的值更早班。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the thirteenth day of the fog-tide month; the morning watch.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 51): The Footprints On the Seventh Step of the Fog-Harbor Lantern Tower That Are Never Cleaned

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给雾港灯塔第七级台阶上那一双没人擦掉、也没人避的脚印。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the lantern tower of the fog harbor — the footprints on the seventh step, which no one has ever cleaned.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——雾潮月第十三日的值更早班。
> Era: the Institute — after the 41st Convocation; the thirteenth day of the fog-tide month; the morning watch.

---

## 一 · 雾港灯塔

雾港灯塔一直没登上去过。没有人登上去过，也就是说灯塔仍是完好——

登上去的人不多，但灯塔的第七级台阶上始终有人站立的足迹。

**锚句**：雾港灯塔第七级台阶上有一双没人擦掉的脚印。
**Anchor sentence**: on the seventh step of the fog-harbor lantern tower there are footprints no one has ever cleaned.

---

## 二 · 不擦

不擦背后的规矩，要从第一任潮候起说起。

第一任潮候在建院的时候把第七级台阶专门留作登塔人的必经之路，并不是要提醒潮候，而是要每一个上去的人都把脚印留在这一级台阶上。

**锚句**：雾港灯塔第一任潮候把第七级台阶留作登塔人必经之路。
**Anchor sentence**: the first conclave kept the seventh step as the mandatory passage for all climbers.

---

## 三 · 没人数过

没有人数过第七级台阶上的脚印数——只是每天清早值更会拿一把盐水去拍一下台阶，手一拍，脚印的深痕就更深一点。

值更说：这里的脚印长期在变化。

**锚句**：值更在清早拿盐水拍一下第七级台阶，脚印就更深一点。
**Anchor sentence**: each morning the watcher dips saltwater on the seventh step; the footprints deepen a little each time.

---

## 四 · 砂子

台阶上的砂子齐整整从来没有移动过位置。

守塔人的大衣上会带一点砂子下港，砂子进了港，又被另一个守塔人带回来。

**锚句**：台阶上的砂子从来没有移动过位置。
**Anchor sentence**: the sand on the step has never shifted.

---

## 五 · 风

雾港灯塔上的风看不见，但它会在第七级台阶上留下砂子的味道——永远是海盐和糖的味道。

抄本员说，这里的风是雾港最后一口风。

**锚句**：雾港灯塔上的风会在第七级台阶上留下砂子的味道。
**Anchor sentence**: the wind atop the fog-harbor lantern tower leaves the taste of sand on the seventh step.

---

## 六 · 没有数

没有人敢数第七级台阶上总共有多少双脚印。

抄本员的祖爷爷登过塔，但抄本员从没登上去过。

**锚句**：没有人敢数第七级台阶上总共有过多少双脚印。
**Anchor sentence**: no one dares count how many footprints have walked the seventh step.

---

## 七 · 映射（回响五十一章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 雾港灯塔 · 第七级台阶 · 不擦的脚印 | 一、二、三、四、五、六、七 |
| geography | 雾港 · 灯塔 · 雾潮月第十三日 | 一、二、四、六、七 |
| characters | 第一任潮候 · 抄本员 · 抄本员的祖爷爷 | 一、二、三、四、五、六 |
| story | 灯塔台阶 · 回响（其五十一） | 全篇 |
| items | 台阶 · 盐水 · 砂子 · 灯塔 | 一、二、三、四、五、六、七 |
| history | 第四十一次大会散会之后 · 雾潮月第十三日 | 一、五、六、七 |

> 雾港灯塔第七级台阶上还有一双——是抄本员的后代自己留下的，他生前没看见，死后也要看见。
> One more pair of footprints will appear one day on the seventh step — those of the copyist's descendants — whose feet will climb after they are gone.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其五十一）「雾港灯塔第七级台阶上那双从来没擦掉的脚印」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the lantern tower of the fog harbor — the footprints on the seventh step, which no one has ever cleaned.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给雾港灯塔第七级台阶上那一双没人擦掉、也没人避的脚印。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the thirteenth day of the fog-tide month; the morning watch.
> 纪元：潮候院 · 第四十一次大会散会之后——雾潮月第十三日的值更早班。

---

## 一 · The Lantern Tower

The fog-harbor lantern tower has never been climbed. No one has climbed it — which means the tower is intact.

Few people have climbed it; but the seventh step always carries someone's footprints.

**锚句**：雾港灯塔第七级台阶上有一双没人擦掉的脚印。
**Anchor sentence**: on the seventh step of the fog-harbor lantern tower there are footprints no one has ever cleaned.

---

## 二 · Why They Are Never Cleaned

The rule behind not cleaning goes back to the first conclave.

The first conclave, building the Institute, kept the seventh step for all climbers — not to honor the climbers, but to leave their footprints there.

**锚句**：雾港灯塔第一任潮候把第七级台阶留作登塔人必经之路。
**Anchor sentence**: the first conclave kept the seventh step as the mandatory passage for all climbers.

---

## 三 · No One Has Counted

No one has ever counted the footprints on the seventh step. Each morning the watchers dip saltwater and pat the step once — the footprints deepen a little.

The watcher says: the footprints here are always changing.

**锚句**：值更在清早拿盐水拍一下第七级台阶，脚印就更深一点。
**Anchor sentence**: each morning the watcher dips saltwater on the seventh step; the footprints deepen a little each time.

---

## 四 · The Sand

The sand on the step has never shifted.

The tower keeper brings sand from the port in his coat, and another tower keeper takes it from the port back into the tower.

**锚句**：台阶上的砂子从来没有移动过位置。
**Anchor sentence**: the sand on the step has never shifted.

---

## 五 · The Wind

The wind on the fog-harbor lantern tower cannot be seen. It leaves the taste of sand on the seventh step — forever the taste of sea salt and sugar.

The copyist said: this is the last breath of the fog harbor.

**锚句**：雾港灯塔上的风会在第七级台阶上留下砂子的味道。
**Anchor sentence**: the wind atop the fog-harbor lantern tower leaves the taste of sand on the seventh step.

---

## 六 · Numb

No one dares count how many pairs of footprints have walked the seventh step.

The copyist's great-grandfather climbed the tower — but the copyist never did.

**锚句**：没有人敢数第七级台阶上总共有过多少双脚印。
**Anchor sentence**: no one dares count how many footprints have walked the seventh step.

---

## 七 · Mapping（Echo No. 51 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the fog-harbor lantern tower · the seventh step · uncleaned footprints | 一、二、三、四、五、六、七 |
| geography | the fog harbor · the lantern tower · the thirteenth day of the fog-tide month | 一、二、四、六、七 |
| characters | the first conclave · the copyist · the copyist's great-grandfather | 一、二、三、四、五、六 |
| story | the lantern tower's step · Echo No. 51 | 全篇 |
| items | the step · saltwater · sand · the lantern tower | 一、二、三、四、五、六、七 |
| history | After the 41st Convocation · the thirteenth day of the fog-tide month | 一、五、六、七 |

> 雾港灯塔第七级台阶上还有一双——是抄本员的后代自己留下的，他生前没看见，死后也要看见。
> One more pair of footprints will appear one day on the seventh step — those of the copyist's descendants — whose feet will climb after they are gone.
`,
  },
  {
    order: 52,
    slug: 'echo-052-the-threshold-in-the-chapel-porch-worn-by-sixty-nine-years',
    titleZh: '潮候院祠殿门廊那一段摸过六十九年的门槛',
    titleEn: 'The Threshold in the Chapel Porch That Has Been Touched for Sixty-Nine Years',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——建院第六十九年正月。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the first month of the sixty-ninth year of the Institute.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 52): The Threshold in the Chapel Porch That Has Been Touched for Sixty-Nine Years

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院祠殿门廊上那一段被无数人摸过、从来没有人数的门槛。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the threshold in the chapel porch — touched sixty-nine years, never counted.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——建院第六十九年正月。
> Era: the Institute — after the 41st Convocation; the first month of the sixty-ninth year of the Institute.

---

## 一 · 祠殿门廊

潮候院祠殿门廊有一段长长的石门槛。它横在门廊入口处——不是一条，是一块往外伸出六寸的青石。

每一次雾港人跨进祠殿的大门，都会被门槛划一下脚踝。值守们说"这块石头授人以理"。

**锚句**：祠殿门廊有一段青石门槛，每次人跨进祠殿都会被划一下脚踝。
**Anchor sentence**: the chapel porch has a threshold; every crossing above it scratches an ankle.

---

## 二 · 六十九年的摸

抄本员的祖爷爷是这段石头的手艺人。

值更长当年看着他把青石打磨完——打磨的时候侯望人拿着笔在门槛上涂了涂。他涂完，青石在灯油下变得更软滑了一些。

**锚句**：抄本员的祖爷爷是那段青石门槛的手艺人。
**Anchor sentence**: the copyist's great-grandfather was the craftsman of the threshold.

---

## 三 · 没有人数

没有人数过这门槛上有多少人摸过。

不过每年入冬的第一场雨后，门槛都会重新被摸得发亮一点——抄本员的后人就是在这亮光里找到自己祖爷爷留下的旧刀刻印的。

**锚句**：没人数过门槛上有多少人摸过它。
**Anchor sentence**: no one has ever counted how many hands touched it.

---

## 四 · 刃痕

门槛上有一道刃痕。

抄本员的祖爷爷用一把船舵木质的小刀刻了一个符号。刻完之后，他把刀刃磨在沙子里——沙把刀刃磨平了，但那道刃痕一直留在门槛上。

**锚句**：门槛上有一道刃痕。
**Anchor sentence**: there is a single cut on the threshold.

---

## 五 · 风

每一次雾港的风刮过祠殿门廊时，风都追着门槛走。

1977年雾港大潮里，风差点把整根门槛给吹进了海里——调查组写了一篇很长的报告，院长把那道报告压在门槛下，到现在还没人搬。

**锚句**：雾港的风刮过祠殿门廊时会追着门槛走。
**Anchor sentence**: every time the wind crosses the chapel porch, it chases the threshold.

---

## 六 · 没人会搬它

分布在潮汐表十年地震记录中的几场暴雨，都没有把这门槛打碎。

院长说："这门槛命里有风，不有沙。"

**锚句**：雾港潮沙盘所有风暴都没有把这门槛打碎。
**Anchor sentence**: none of the tide-sand storms broke it.

---

## 七 · 映射（回响五十二章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 门槛 · 六十九年的摸 · 刃痕 | 一、二、三、四、五、六、七 |
| geography | 潮候院 · 祠殿门廊 · 雾潮月第一日 | 一、二、四、五、六、七 |
| characters | 抄本员祖爷爷 · 值更长 · 院长 | 一、二、四、五、六 |
| story | 祠殿门槛 · 回响（其五十二） | 全篇 |
| items | 门槛 · 小刀 · 风 · 雾港潮沙盘 | 一、二、四、五、六、七 |
| history | 第四十一次大会散会之后 · 建院第六十九年正月 | 一、四、五、六、七 |

> 江山有常，有风去有火回——但祠殿的门槛会一直在那，裹着一层踩过它的每一代人的脚。
> The land endures, winds go and fires return — but the threshold of the chapel stays, holding the footsteps of every generation that crossed it.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其五十二）「潮候院祠殿门廊那一段摸过六十九年的门槛」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the threshold in the chapel porch — touched sixty-nine years, never counted.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院祠殿门廊上那一段被无数人摸过、从来没有人数的门槛。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the first month of the sixty-ninth year of the Institute.
> 纪元：潮候院 · 第四十一次大会散会之后——建院第六十九年正月。

---

## 一 · The Chapel Porch

The chapel porch of the Institute holds a long stone threshold. It lies at the entrance of the porch — not a line, but a slab of bluestone jutting out six inches.

Every time a fog-harbor person steps across the chapel door, the slab scratches their ankle lightly. The watchers say: this slab teaches reason.

**锚句**：祠殿门廊有一段青石门槛，每次人跨进祠殿都会被划一下脚踝。
**Anchor sentence**: the chapel porch has a threshold; every crossing above it scratches an ankle.

---

## 二 · Sixty-Nine Years of Touch

The copyist's great-grandfather was the craftsman of this slab.

The head watcher once saw him polish the slab — while he was polishing, a sentry someone passing by painted a few strokes across it. He dipped it and kept walking.

**锚句**：抄本员的祖爷爷是那段青石门槛的手艺人。
**Anchor sentence**: the copyist's great-grandfather was the craftsman of the threshold.

---

## 三 · No Count

No one has ever counted how many hands touched the threshold.

After the first rain of each winter, the slab shines a little brighter — the copyist's descendants found their ancestor's old chisel mark in that sheen.

**锚句**：没人数过门槛上有多少人摸过它。
**Anchor sentence**: no one has ever counted how many hands touched it.

---

## 四 · The Mark

A mark is engraved on the threshold.

The copyist's great-grandfather took a small rudder-wood knife and cut a single glyph. After he finished, he ground the blade on sand — the sand made the blade smooth, but the mark remained on the threshold.

**锚句**：门槛上有一道刃痕。
**Anchor sentence**: there is a single cut on the threshold.

---

## 五 · Wind

Every time the wind of the fog harbor sweeps across the chapel porch, it chases after the threshold.

In 1977, during the Great Tide, the wind nearly blew the whole threshold into the sea — an investigation panel wrote a lengthy report; the director laid it under the threshold, and no one has moved it since.

**锚句**：雾港的风刮过祠殿门廊时会追着门槛走。
**Anchor sentence**: every time the wind crosses the chapel porch, it chases the threshold.

---

## 六 · No One Will Move It

Several storms recorded in the tide-sand table over the past ten years never managed to break this slab.

The director said: "This slab has wind and no sand."

**锚句**：雾港潮沙盘所有风暴都没有把这门槛打碎。
**Anchor sentence**: none of the tide-sand storms broke it.

---

## 七 · Mapping（Echo No. 52 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the threshold · sixty-nine years of touch · the cut | 一、二、三、四、五、六、七 |
| geography | the Institute · the chapel porch · the fog-tide month | 一、二、四、五、六、七 |
| characters | the copyist's great-grandfather · the head watcher · the director | 一、二、四、五、六 |
| story | the chapel threshold · Echo No. 52 | 全篇 |
| items | the threshold · the knife · the wind · the tide-sand table | 一、二、四、五、六、七 |
| history | After the 41st Convocation · the first month of the sixty-ninth year | 一、四、五、六、七 |

> 江山有常，有风去有火回——但祠殿的门槛会一直在那，裹着一层踩过它的每一代人的脚。
> The land endures, winds go and fires return — but the threshold of the chapel stays, holding the footsteps of every generation that crossed it.
`,
  },
  {
    order: 53,
    slug: 'echo-053-the-whistle-keeper-never-without-his-horn',
    titleZh: '渔村船工吹着首响的那一下潮——留下的螺口',
    titleEn: 'The Whistle Left by the Fisherman\'s Call on the Tide',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第二日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the second day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 53): The Shell Left by the Fisherman's Whistle on the Tide

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给雾港渔村吹潮号的船工，他吹完听完第一声潮的手势、留下的螺口。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the whistle-keeper at the fog-harbor fishing village — his whistle set down the first sound of the tide for the season.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第二日。
> Era: the Institute — after the 41st Convocation; the second day of the autumn-tide month.

---

## 一 · 雾港渔村

雾港渔村的小海湾没有灯塔，也没有渡口。潮汐来的时候，海潮从里边推进来，村子就被水围住，谁也离不开渔村，谁也进不来。

渔村人吹着一声朝号，让村子知道——潮到了。他们住在海的边缘，只有吹朝号赶潮的时刻。

**锚句**：雾港渔村吹的是朝号，吹朝号才能赶潮。
**Anchor sentence**: the fishing village of the fog harbor blows the chao-hao; only then can the village ride the tide.

---

## 二 · 螺口

第二个秋潮月的第二天，一位船工刚把螺号挂上，海潮突然醒了，船工抹了一把脸，把螺号放在石头上，躺在石桌上看海。

螺号的口朝天——永远都朝天，因为风从这边经过，口高，口向上才合适；口朝下倒置，口会被拍坏。

**锚句**：螺号的口永远朝上，因为风从这边经过，口高才传得远。
**Anchor sentence**: the shell is always mouth-up; the wind passes here, mouth-up carries farthest.

---

## 三 · 远得看不见

站在小海湾中央看的人看不见远处，那一声号吹起来了，远岸的人能听见；船工听见远岸——他不知道远岸有多远，他只知道那一口号能穿到尽头。他躺在石桌上，感觉到潮在打着，风在打，他忍住了一次摇晃。

他听不见自己的号声——但他听见了远处回来的那一声。

**锚句**：船工听不见自己的号声，但他能听见远岸回来的那一声。
**Anchor sentence**: the whistle-keeper cannot hear his own note, but he hears the far shore reply.

---

## 四 · 哪一声

舟子私下说，每年的第二声号吹的是刀锋号；第一声吹的是真锐号，回声从远岸回来之后，海潮几乎在一瞬间停——那叫停潮声。值更长说停潮声最好玩——可以在潮停的时候借公示牌对接。

渔村人吹的是号，但海潮只过一次停潮声。

**锚句**：渔村人吹的是号，但海潮只过一次停潮声。
**Anchor sentence**: the fishermen blow their horns, but the tide passes one single halt-call.

---

## 五 · 吹完的回到

船工吹完号，起身，把海螺挂在船尾。

他把号挂在船尾的时候，放下号的时候，船要做的时候，天开始暗了——雾港的灯船停在风港外，一直到半夜。他闭上嘴听了一个字——这个字想不起来他叫什么，他只记潮泡的声音，鱼鳃在嘴巴里一口一口的，船身是一只呼吸。

**锚句**：船工把号挂在船尾，船工把船交给海，船就是他的嘴。
**Anchor sentence**: the whistle-keeper hangs his horn at the stern; he gives the boat to the sea; the boat is his mouth.

---

## 六 · 不见人只见海

小海湾的渔民有人说，其实雾港有更多我们没看见的船。第二声出不去。但没人出去——他不知道他会不会回来。谁也没去。算了。

**锚句**：小海湾里所有的船都只在风港做单程。
**Anchor sentence**: every boat in the little bay of the fog harbor makes a one-way pass at the wind port.

---

## 七 · 映射（回响五十三章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 朝号 · 停潮声 · 单程船 | 一、二、三、四、五、六、七 |
| geography | 雾港 · 渔村 · 风港 · 秋潮月第二日 | 一、二、三、四、五、六、七 |
| characters | 船工 · 小海湾渔民 · 远岸回声 | 一、三、五、六、七 |
| story | 朝号 · 回响（其五十三） | 全篇 |
| items | 螺号 · 石桌 · 船尾 · 海 | 一、二、三、四、五、六、七 |
| history | 第四十一次大会散会之后 · 秋潮月第二日 | 一、二、五、七 |

> 第二声号吹响的那个清晨，小海湾会有人听见远岸在回他一句话——没人听懂，但所有人都会挺直腰靠到窗。
> On the morning the second note is blown, everyone in the little bay hears the far shore answer in turn — no one understands it, yet every back stiffens against the window.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其五十三）「雾港渔村吹着朝号等潮的船工那颗从未离手的螺号」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the whistle-keeper at the fog-harbor fishing village — his whistle set down the first sound of the tide for the season.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给雾港渔村吹潮号的船工，他吹完听完第一声潮的手势、留下的螺口。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the second day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第二日。

---

## 一 · The Fishing Village

The fog-harbor fishing village sits on a small cove. No lighthouse, no crossing. When the tide comes the sea pushes in from the mouth, and the village cannot leave — no one can enter during the tide.

The village blows one chao-hao so everyone knows the tide has come. They live at the edge of the sea; only then can the village ride the tide.

**锚句**：雾港渔村吹的是朝号，吹朝号才能赶潮。
**Anchor sentence**: the fishing village of the fog harbor blows the chao-hao; only then can the village ride the tide.

---

## 二 · The Shell Mouth

On the second day of the second autumn-tide month, a whistle-keeper just hung up the shell horn when the tide suddenly woke. He wiped his face, set the shell horn on stone, and lay on the stone table looking out.

The shell's mouth faces up — always up; the wind passes from this side, mouth-high carries farthest; or else it's tipped upside down, the mouth gets broken.

**锚句**：螺号的口永远朝上，因为风从这边经过，口高才传得远。
**Anchor sentence**: the shell is always mouth-up; the wind passes here, mouth-up carries farthest.

---

## 三 · The Voice You Cannot Hear

Looking from the middle of the little bay you cannot see far. The note has been blown — far shore hears it; the keeper doesn't know the distance, he only knows the note reaches the end. He lay on the stone table feeling the tide push against him and the wind push against him; he still held steady.

He cannot hear his own note — but he hears the far shore reply.

**锚句**：船工听不见自己的号声，但他能听见远岸回来的那一声。
**Anchor sentence**: the whistle-keeper cannot hear his own note, but he hears the far shore reply.

---

## 四 · Which Note

The boatmen say among themselves: every year the second note is called the edge note; the first is called the true sharp note. The echo comes back from the far shore; the tide stops almost instantly — they call it "halting." The head watcher says the halting note is the finest to play — you can dock at the signal mast while the tide stops.

The villagers blow their horns; the tide passes only once at the halting tone.

**锚句**：渔村人吹的是号，但海潮只过一次停潮声。
**Anchor sentence**: the fishermen blow their horns, but the tide passes one single halt-call.

---

## 五 · After the Horn

The whistle-keeper hangs his horn at the boat's tail.

He hangs the horn at the tail — and he gives the boat to the sea; the boat is his mouth.

**锚句**：船工把号挂在船尾，船工把船交给海，船就是他的嘴。
**Anchor sentence**: the whistle-keeper hangs his horn at the stern; he gives the boat to the sea; the boat is his mouth.

---

## 六 · See No Man See Sea

Several fishing villagers say there are more boats we don't see in the fog harbor. The second note never passes. But nobody goes out — they don't know if they would return. Nobody dared. Fine.

**锚句**：小海湾里所有的船都只在风港做单程。
**Anchor sentence**: every boat in the little bay of the fog harbor makes a one-way pass at the wind port.

---

## 七 · Mapping（Echo No. 53 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the chao-hao · the halting note · one-way boats | 一、二、三、四、五、六、七 |
| geography | the fog harbor · the fishing village · the wind port · the second day of the autumn-tide month | 一、二、三、四、五、六、七 |
| characters | the whistle-keeper · the little bay's fishermen · the far shore's reply | 一、三、五、六、七 |
| story | the chao-hao · Echo No. 53 | 全篇 |
| items | the shell horn · the stone table · the tail of the boat · the sea | 一、二、三、四、五、六、七 |
| history | After the 41st Convocation · the second day of the autumn-tide month | 一、二、五、七 |

> 第二声号吹响的那个清晨，小海湾会有人听见远岸在回他一句话——没人听懂，但所有人都会挺直腰靠到窗。
> On the morning the second note is blown, everyone in the little bay hears the far shore answer in turn — no one understands it, yet every back stiffens against the window.
`,
  },
  {
    order: 54,
    slug: 'echo-054-the-night-bell-with-its-tongue-sealed',
    titleZh: '潮候院祠殿后廊那口锁住锤舌的夜钟',
    titleEn: 'The Night Bell in the Back Gallery Whose Tongue Was Sealed',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the fourth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 54): The Night Bell in the Back Gallery Whose Tongue Was Sealed

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿后廊那口被值更院封了锤舌的夜钟，和替它算债的七十二格蜡封。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the night bell in the Institute's back gallery, whose clapper was sealed by the Watch, and for the seventy-two wax seals that tally its debt.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四日。
> Era: the Institute — after the 41st Convocation; the fourth day of the autumn-tide month.

---

## 一 · 锁住锤舌的夜钟

祠殿的后廊不朝南，没有日影，只有一口夜钟。钟舌用七重灰色封皮封住，封口处盖着值更院的铜印，墨都缩进去了。钟匠每年来看两次，只抬头看一眼封皮有没有松，不量、不拆、不敲。

路过的人常常听见它轻轻晃动——晚秋的风从山口灌进来，钟身擦过封皮，发出比心跳还轻的钝响。没有人停下来数它响了几下。

**锚句**：后廊的夜钟只能在空天的夜里听见。
**Anchor sentence**: the back gallery's night bell is heard only on hollow-skied nights.

---

## 二 · 每一击的价钱

院里流传最广的说法是：当年值更长亲自击钟一百零一次，第七十一次的时候夜雾退到了风港之外，第九十九次的时候镜湖第二次倒灌，第一百零一次他手停了——钟声没有出口，整座院子都听见了那一声的沉默。

从那以后，守则上写下第一句也是最后一句警告：夜钟每一击都借一合水，水从镜湖、从盐线、从某个迟到者袖子里的一撮盐里支取；借满七十二合，就不得再击。

**锚句**：每一声钟都借一合水，借满七十二合就不得再击。
**Anchor sentence**: each note of the bell borrows a measure of water; when the seventy-two measures are spent, the bell must not ring again.

---

## 三 · 钟匠的儿子

钟匠的儿子小时候把封皮的铜印当玩具，偷偷揭下一角玩了半个下午。被值更长带上祠殿，罚他跪到日落，理由只有一句：一击之下，袖子里的水要还回去，敲完账没人替他还。

他后来入了抄本师的门下学刻字。他刻的一个字都不多了，但所有人都认得他的字——每一刀都带半分犹豫，像怕自己不小心多划了一道。他的刻刀上永远有一层陈旧的铜绿，洗不掉。

**锚句**：钟匠的儿子再没碰过夜钟，但他的刻刀上永远带着铜绿。
**Anchor sentence**: the bell-maker's son never touched the night bell again, yet his graver forever carried verdigris.

---

## 四 · 七十二格账

南廊的墙上刻着一整面账：七十二格，一格对应一合水。每击一声，就在一格里抹上黑蜡封。现在七十二格全都黑了。

没有人知道最后一格是在哪个夜晚被抹掉的——有的说是大会散会的年, 有的说是某个盐税进账为负的凌晨, 有的说是值更长一个人蹲在墙前抹完的。没人再去看那面账，但也没人敢填新的格子。

**锚句**：南廊七十二格蜡封全都黑了，没人再看那面账。
**Anchor sentence**: all seventy-two wax seals on the south gallery wall are black; no one looks at that ledger anymore.

---

## 五 · 风里的钝响

风大的夜里，后廊的灯会矮一节，钟会轻轻擦一下封着的舌——像有人在袖子里压着一声没出口的咳嗽。守则里有一条只有值更人知道的：听见钝响的人不得说破它的内容，只得饮一口粥、写一行值更簿上的今天风向，然后继续站着。

有的年轻值更人写完就睡了，醒来发现别人替他把那一页翻过去了。

**锚句**：夜里风压低灯影，钟只是碰一下封舌，不是钟响是脉搏乱半拍。
**Anchor sentence**: on windy nights the lamp ducks and the sealed tongue only brushes — it is not the bell ringing, only a pulse skipping half a beat.

---

## 六 · 等待自答的那一天

院里最老的几个人说起同一件事的时候用不同的说法，但意思只剩一种：等镜湖干了、等盐线退了、等最后一合水无处可借的那一天，夜钟会自己回答——没有人动手，没有人许愿，它自己会懂得什么叫真正的响。

那天到来之前，值更院的候补单上永远空着一行，位置留给那个还没轮到任何人的人。

**锚句**：等镜湖干了、盐线退了，夜钟自己会回答，不需要任何人动手。
**Anchor sentence**: when the mirror lake runs dry and the salt bounds retreat, the bell will answer on its own — no hand need be lifted.

---

## 七 · 映射（回响五十四章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 夜钟 · 锤舌封存 · 七十二合水 | 一、二、四、五 |
| geography | 祠殿后廊 · 南廊七十二格账 · 镜湖 · 风港 | 一、四、六 |
| characters | 钟匠 · 钟匠的儿子 · 值更长 · 抄本师 | 二、三 |
| story | 锁住锤舌的夜钟 · 回响（其五十四） | 全篇 |
| items | 夜钟 · 七重封皮 · 铜印刻刀 · 蜡封账 | 一、三、四、五 |
| history | 第四十一次大会散会之后 · 秋潮月第四日 | 一、二、六、七 |

> 后廊一直开着，封皮从没松过；真到那一夜，所有人都会先发现灯矮了一寸，然后才听见钟——而那一次，没有人站起来。
> The back gallery stays open and the seals never loosen; when that night finally comes, everyone will first see the lamp duck an inch, and only then hear the bell — and this time, no one will stand.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其五十四）「潮候院祠殿后廊那口锁住锤舌的夜钟」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the night bell in the Institute's back gallery, whose clapper was sealed by the Watch, and for the seventy-two wax seals that tally its debt.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿后廊那口被值更院封了锤舌的夜钟，和替它算债的七十二格蜡封。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the fourth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四日。

---

## I · The Bell with the Sealed Clapper

The back gallery of the Hall of Sacrifice faces no direction of sun. There is one night bell there. Its tongue is sealed under seven layers of gray sealing skin, the mouth of which bears the copper seal of the Night Watch, its ink contracted into the fibers. The bell-maker comes twice a year to look, only to glance at whether the skin has loosened; he does not measure, not unseal, not strike.

Passersby often hear it swaying softly — the late-autumn wind pours in from the mountain mouth, and the bell body brushes the skin with a dull note lighter than a pulse. No one stops to count how many times it sounded.

**锚句**：后廊的夜钟只能在空天的夜里听见。
**Anchor sentence**: the back gallery's night bell is heard only on hollow-skied nights.

---

## II · The Price of Each Strike

The story best-traveled around the Institute goes thus: the head of the Night Watch struck the bell one hundred and one times in person; on the seventy-first, the fog pulled back beyond the wind port; on the ninety-ninth, the mirror lake flooded a second time; on the one hundred and first his hand stopped — the note had no exit, and the whole Institute heard that one silence.

Since then the manual carried its first warning, which was also its last: each note of the night bell borrows a measure of water, and that measure is drawn from the mirror lake, from the salt bounds, or from a pinch of salt kept in the sleeve of someone arriving late; when the seventy-two measures are spent, the bell must never ring.

**锚句**：每一声钟都借一合水，借满七十二合就不得再击。
**Anchor sentence**: each note of the bell borrows a measure of water; when the seventy-two measures are spent, the bell must not ring again.

---

## III · The Bell-Maker's Son

As a child, the bell-maker's son picked up the copper seal of the watch-skin as a toy and peeled back a corner of it, playing with it for half an afternoon. He was taken before the Convocation by the head of the Night Watch and made to kneel until sunset, for a single reason: a note of the bell sends the water from one's sleeve back where it belongs, and no one stands ready to settle the account afterward for him.

He later became a disciple of the copyists and learned engraving. He engraved one character fewer than the others ever did, and everyone knew his characters at a glance — every stroke had half a measure of hesitation, as if he feared a single slip of excess depth. His graver forever carries an old layer of verdigris that no washing lightens.

**锚句**：钟匠的儿子再没碰过夜钟，但他的刻刀上永远带着铜绿。
**Anchor sentence**: the bell-maker's son never touched the night bell again, yet his graver forever carried verdigris.

---

## IV · The Ledger of Seventy-Two Cells

A whole-wall ledger is engraved on the south gallery: seventy-two cells, one cell per measure of water. For every note struck, a black wax seal is daubed in a cell. All seventy-two cells are black now.

No one knows in which night the last cell was blacked — some say in the year of the 41st Convocation; others, on some dawn when the salt tax came in negative; still others, that the head of the Night Watch knelt alone before the wall and finished it in silence. No one looks at that wall; no one dares carve a fresh cell.

**锚句**：南廊七十二格蜡封全都黑了，没人再看那面账。
**Anchor sentence**: all seventy-two wax seals on the south gallery wall are black; no one looks at that ledger anymore.

---

## V · The Dull Note in the Wind

On nights when the wind is strong, the back gallery lamp ducks a notch, and the bell gently brushes its sealed tongue — like someone holding in a cough from inside a sleeve. The manual carries a rule only the night watchers know: the one who hears the dull note must not tell its content aloud; they must drink a bowl of porridge, note the day's wind direction in the night-watch ledger, and keep standing.

Some young watchers wrote their entry and slept; they woke to find the page had been turned for them by someone else.

**锚句**：夜里风压低灯影，钟只是碰一下封舌，不是钟响是脉搏乱半拍。
**Anchor sentence**: on windy nights the lamp ducks and the sealed tongue only brushes — it is not the bell ringing, only a pulse skipping half a beat.

---

## VI · Waiting for the Day the Bell Answers Itself

The eldest people of the Institute tell the same matter with different words, but the meaning has thinned to a single one: when the mirror lake runs dry, when the salt bounds retreat, when the last measure of water has nowhere left to be borrowed — the night bell will answer on its own. No hand set it in motion, no vow was spoken; the bell itself will understand what it means to truly sound.

Until that morning arrives, the replacement line on the night-watch roll is always left blank in a single slot, a place kept for the arrival no one has met yet.

**锚句**：等镜湖干了、盐线退了，夜钟自己会回答，不需要任何人动手。
**Anchor sentence**: when the mirror lake runs dry and the salt bounds retreat, the bell will answer on its own — no hand need be lifted.

---

## VII · Mapping（Echo No. 54 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the night bell · the sealed tongue · the seventy-two measures | 一、二、四、五 |
| geography | the back gallery · the south gallery ledger · the mirror lake · the wind port | 一、四、六 |
| characters | the bell-maker · the bell-maker's son · the head of the Night Watch · the copyist | 二、三 |
| story | the bell with the sealed clapper · Echo No. 54 | 全篇 |
| items | the night bell · the seven seal-skins · the verdigrised graver · the wax ledger | 一、三、四、五 |
| history | After the 41st Convocation · the fourth day of the autumn-tide month | 一、二、六、七 |

> 后廊一直开着，封皮从没松过；真到那一夜，所有人都会先发现灯矮了一寸，然后才听见钟——而那一次，没有人站起来。
> The back gallery stays open and the seals never loosen; when that night finally comes, everyone will first see the lamp duck an inch, and only then hear the bell — and this time, no one will stand.
`,
  },
  {
    order: 55,
    slug: 'echo-055-the-doorless-room-of-the-east-wing',
    titleZh: '潮候院东偏院那间从没装门只系铜环的房间',
    titleEn: 'The Doorless Room of the East Wing with Only a Cloth and a Copper Ring',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第六日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the sixth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 55): The Doorless Room of the East Wing with Only a Cloth and a Copper Ring

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院东偏院最北的那间宗卷室：没有门，只有一道门洞、一幅麻布、一枚铜环。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the scriptorium annex at the far north of the east wing: no door, only a doorway, a length of linen, and a copper ring.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第六日。
> Era: the Institute — after the 41st Convocation; the sixth day of the autumn-tide month.

---

## 一 · 没有门的房间

东偏院最北的一间，无窗无檐，只有一道齐胸高的门洞，洞里横挂一幅大麻布，布上缝着一枚铜环。环不是为了拽布，是为了给走过的风一个可以回答的形状。

白天布会自己晃一下；没人进去，环先替他们收了手。夜里安静——铜环在布上睡了，防风针也压了。

**锚句**：东偏院最北的那间不设门，只设布和铜环。
**Anchor sentence**: the northernmost room of the east wing has no door, only cloth and a copper ring.

---

## 二 · 入门的规矩

不站班上的抄本师永远不知道里面放着哪一本。进去之前要向值更院报一声："进卷一次，不出声，不回头。"进去的人只看自己要抄的那一卷，退出时不准看身后的架子——这是规矩，也是免责，那一眼看到什么都算「时候未到」。

只有主持过拣卷、被值更长亲口认过名字的人，才有资格穿过那道布。

**锚句**：能进宗卷室的只有主持过拣卷的抄本师。
**Anchor sentence**: only copyists who have presided over the selection of scriptures may enter the archive annex.

---

## 三 · 不留名字的卷宗

每年四十一次大会散会之后，值更院从外院缴回的旧卷里拣出「次卷」——不是不够好，是时候未到。封入无名麻布袋，袋口只系不封；封条上不写卷号，不写年份，只写四个字："时候未到。"

这些袋子排在最深处的两架之间，谁也拿不出一整袋，只被允许核一袋之中的某一卷，抄出某一句，盖一个没有年份的墨印，然后放回去。

**锚句**：封袋上从不写卷号，只写「时候未到」。
**Anchor sentence**: the slips on the wrapping never carry volume numbers; they carry only the words "not yet the hour".

---

## 四 · 双人核对

每一次向宗卷室增入新卷，必须两位在场：一位读，一位默。读的听着白纸之外最响的那半句；默的只点头、不发言。默者若发现读者念错一个字，不能纠——能抬一下左手，那次增卷就要重来，从头再读一遍。

没有人在那个房间里听到别人替自己签名。两个人同时出现，是为了让一个人替另一个人记住「今天确实增过一卷」，而不是替谁证明「那一句是真的」。

**锚句**：增卷是双人核对：一人读，一人默；谁都不能替谁签字。
**Anchor sentence**: each addition is witnessed in pairs: one reads, one holds silence; no one signs for the other.

---

## 五 · 铜环声音

挂铜环的麻布每季上一层蜜蜡；这件事是值更院第一件公示事项，比值更换帖还早一天挂出来。铜环哑了就该换，但没有人换过——已经很久了，「哑过的铜环才留得住回声」，这是钟匠的孙子在门廊上写的原话。

更早的记录里没有这条规矩。钟匠的孙子自己说，他只是把自己偷下来的那枚环带回来，放回去的时候顺便写了这么一行；没人来问他写的原因，也没人擦掉。

**锚句**：挂铜环的麻布每季上一层蜜蜡，钝了也不换。
**Anchor sentence**: the linen holding the copper ring is waxed each season; never once has the ring been replaced, even dull.

---

## 六 · 等待开门的那天

院里最老的那几个人说，东偏院的麻布是为了一件事而存在：总有一天，屋子里放的卷宗足够多了，那幅布会自己飘起来——不是被风，不是被人。那天宗卷室会第一次真正地敞开，所有「时候未到」的卷宗一篇一篇被读出来。

没人知道那一天是不是已经近了。他们只是每天路过，先看一眼那道门洞有没有人；然后才想起来，那里从来就没有门。

**锚句**：哪一天布自己飘起来，哪一天就是开卷的日子——没人说得出是哪一天。
**Anchor sentence**: the day the linen rises on its own will be the day of unrolling; no one can say which day.

---

## 七 · 映射（回响五十五章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 宗卷室 · 时候未到 · 双人核对 · 铜环 | 一、二、三、四、五、六 |
| geography | 东偏院最北 · 门洞 · 无窗无檐 | 一、三 |
| characters | 抄本师 · 值更人 · 钟匠的孙子 | 二、四、五 |
| story | 从没装门的宗卷室 · 回响（其五十五） | 全篇 |
| items | 大麻布 · 铜环 · 蜜蜡 · 无名麻布袋 · 无年墨印 | 一、三、五 |
| history | 第四十一次大会散会之后 · 秋潮月第六日 | 三、六 |

> 路过的人偶尔听见布里有声音——不是吓人，是提醒自己：屋里还有东西没到时候。
> Passersby sometimes hear something behind the linen — nothing to fear; only a reminder that things inside are not yet of age.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其五十五）「潮候院东偏院那间从没装门只系铜环的房间」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the scriptorium annex at the far north of the east wing: no door, only a doorway, a length of linen, and a copper ring.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院东偏院最北的那间宗卷室：没有门，只有一道门洞、一幅麻布、一枚铜环。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the sixth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第六日。

---

## I · The Room Without a Door

The northernmost room of the east wing has no window and no eave, only a chest-high doorway with a broad length of linen slung across it, in which a single copper ring is sewn. The ring is not there to grip the cloth; it exists so that passing wind has a shape it can answer.

By day the linen stirs of its own accord; no one has to enter, the ring already held the doorway for them. By night it is quiet — the ring sleeps in the cloth, and the wind pine is weighted down as well.

**锚句**：东偏院最北的那间不设门，只设布和铜环。
**Anchor sentence**: the northernmost room of the east wing has no door, only cloth and a copper ring.

---

## II · The Rule of Entry

A copyist who is not on duty never knows which scripture lies within. Before slipping past the linen they report to the Night Watch: "One entry, no voice, no looking back." The entrant looks at nothing but the scripture they came to copy; on the way out they are not to see the shelves behind them. That is rule; also safety — whatever a stray glance lands on is entered into the record as "not yet the hour."

Only those who presided over a selection of scriptures, and whose names the head of the Night Watch spoke aloud, may pass through the cloth.

**锚句**：能进宗卷室的只有主持过拣卷的抄本师。
**Anchor sentence**: only copyists who have presided over the selection of scriptures may enter the archive annex.

---

## III · The Scriptures Without Names

Each year after the 41st Convocation dissolves, the Office selects from the surrendered rolls those they call the "secondary scriptures" — not judged inadequate, only not yet of age. They are wrapped in nameless cloth sacks whose mouths are tied shut but never sealed; upon each slip goes no volume number and no year, only the four characters: "not yet the hour."

Those sacks are shelved between the two deepest racks. No one is permitted to remove an entire sack; one may inspect a single scripture from inside one, transcribe a single line from it, impress a dateless ink seal on it — then place it back exactly as it was.

**锚句**：封袋上从不写卷号，只写「时候未到」。
**Anchor sentence**: the slips on the wrapping never carry volume numbers; they carry only the words "not yet the hour".

---

## IV · The Pairwise Witnesses

Every addition to the annex requires two people present: one reads, one is silent. The reader strains at the loudest half-sentence just beyond the page; the silent one nods only, never speaks. Should the silent detect a single wrong character, the reader may not be corrected — the silent one raises a left hand, and the entry begins again from the first line, aloud, from the beginning.

No one in that room hears a second voice sign for a first. The pair exists so one person remembers for the other that something genuinely was added, not to prove the line was true.

**锚句**：增卷是双人核对：一人读，一人默；谁都不能替谁签字。
**Anchor sentence**: each addition is witnessed in pairs: one reads, one holds silence; no one signs for the other.

---

## V · The Voice of the Copper Ring

The linen holding the copper ring is anointed with beeswax each season; this is posted as the Night Watch's first public notice, hung a day before the token for the season. When the ring goes dull it is due for replacement; no one has ever replaced it — for a long time now, because, as the bellmaker's grandson wrote on the porch, "a ring dulled is one that keeps returning."

The older records carry no such by-law. The bellmaker's grandson himself admits he only brought back the ring he had slipped off once, and when he hung it again he added the line; no one asked him why, and no one scrubbed it out.

**锚句**：挂铜环的麻布每季上一层蜜蜡，钝了也不换。
**Anchor sentence**: the linen holding the copper ring is waxed each season; never once has the ring been replaced, even dull.

---

## VI · Waiting for the Day the Linen Rises

The oldest of the Institute say the linen of the east wing was hung for one reason: one day the scriptures within will be full enough, and the cloth will rise of its own — not tempered by wind, not pushed by any person. On that day the annex will first truly open, and every scripture marked "not yet the hour" will be read aloud, one after another.

No one knows whether that day is near. They pass the doorway as usual, glance first at whether someone is inside — and then remember there has never been a door there at all.

**锚句**：哪一天布自己飘起来，哪一天就是开卷的日子——没人说得出是哪一天。
**Anchor sentence**: the day the linen rises on its own will be the day of unrolling; no one can say which day.

---

## VII · Mapping（Echo No. 55 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the archive annex · not yet the hour · pairwise witnesses · the copper ring | 一、二、三、四、五、六 |
| geography | the far north of the east wing · the doorway · no window, no eave | 一、三 |
| characters | the copyists · the Night Watch · the bellmaker's grandson | 二、四、五 |
| story | the doorless archive annex · Echo No. 55 | 全篇 |
| items | the broad linen · the copper ring · the beeswax · the nameless sacks · the dateless ink seal | 一、三、五 |
| history | After the 41st Convocation · the sixth day of the autumn-tide month | 三、六 |

> 路过的人偶尔听见布里有声音——不是吓人，是提醒自己：屋里还有东西没到时候。
> Passersby sometimes hear something behind the linen — nothing to fear; only a reminder that things inside are not yet of age.
`,
  },
  {
    order: 56,
    slug: 'echo-056-the-nobody-claimed-great-rain-tomorrow',
    titleZh: '雾港公示牌下面那张从没有人认领的明日大雨',
    titleEn: 'The Slip on the Harbor Bulletin That Nobody Ever Claimed',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第九日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the ninth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 56): The Slip on the Harbor Bulletin That Nobody Ever Claimed

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给雾港公示牌下面那张无主署名的纸条："明日大雨。"
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the nameless slip tacked beneath the fog-harbor bulletin: "Great rain tomorrow."
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第九日。
> Era: the Institute — after the 41st Convocation; the ninth day of the autumn-tide month.

---

## 一 · 公示牌的位置

雾港公示牌立在风港入与灯塔之间的拐角，站两个人要侧身。牌上的通知按序从上到下排：先是当季当月的水尺对账单，再是值更院的回帖换卡，最后才是一张纸——写着"明日大雨"，没有署名，没有角，没有落款。

谁都会先看见最上面那份正式的，再看见最下面那张不正式的东西——从某个秋潮月开始，它从未缺席过一天。

**锚句**：公示牌下面有一张没有署名的纸条，写着明日大雨。
**Anchor sentence**: tacked at the very bottom of the bulletin board is an unsigned slip reading "Great rain tomorrow".

---

## 二 · 盐水也咬不掉的纸

雾港的风里有盐。风一吹，公告纸角朝下翘起，第二天下坠。可那张纸条——对着风口贴了一整个秋天，盐蹭得发硬，墨泡皱起来，字迹却一个也不含糊。

值更人站在它前面吹口哨说：那张纸不是纸，是墓碑——每年把最后一场雨的账记上去。

**锚句**：纸条贴在公示牌正中，盐水泡皱了也不掉。
**Anchor sentence**: the slip is tacked to the center of the board; soaked in brine and curled, it never falls.

---

## 三 · 反复

有人每月更换公告时把它撕下来当反例教材。撕下的当晚只有风声，第二天它就在原位重新贴着，墨迹还是那几笔。

值更长记录过三次撕下交接--第四次没有记录。第四次以后，他们改成只在牌上上当季水尺，不动那一角。

**锚句**：每次有人取下它，第二天一早又会贴上一张新的。
**Anchor sentence**: each time someone takes it down, by the morning of the next day a fresh one appears in its place.

---

## 四 · 没人认领

有人在牌边守了三个晚上，没看到任何人贴它，根本是他没见到人来也没见到天亮之前的动静。他交了一份报告上去，结论一时激动，被值更院退回重写——重写的是："没有人承认是自己贴的，也没有人说见过它被贴上去。"

**锚句**：没有人承认是自己贴的，也没有人说见过它被贴上去。
**Anchor sentence**: nobody admits to having posted it, and nobody says they have ever seen it being posted.

---

## 五 · 压不过去的位置

当季的正式通知本来该排在最下面，最下面的位置得归属下一期公示。可自从那张纸条开始出现的年份起，正式通知无论多重多大，都总是贴在它上面——没有通知把它压死过，也没有通知愿意替它换位置。公示牌最顶上的钉子在下雨天会发软，钉不住下一期的水尺表，纸就往下滑——但"明日大雨"从不滑。

**锚句**：公示牌上正式通知下方的纸条从来不往上移，官方站上去盖也压不住。
**Anchor sentence**: the slip beneath the official notices never moves up; however hard the office pins over it, it cannot be pressed flat.

---

## 六 · 账不是预告

抄本师研究过这不是什么预言：它不报日期，不报雨量，不报风向。每年入秋潮月之后便开始出现——与开账的窗口完全吻合。他们认为这是公示牌上最后一张原稿：按潮候院古老的做法，下一条没做成的账预先付于牌上，为的是交接时不至于遗失。

所以它不是"明日大雨"，是"明日有雨的那一天已经记入潮候公账"。只是时间不到，字迹不出名。

**锚句**：抄本师说那不是预告，是账——云那天其实早就记进去了。
**Anchor sentence**: the copyists say it is not a forecast but a ledger entry — the day already in the ledger book of the Institute for the day that is yet to come.

---

## 七 · 映射（回响五十六章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 明日大雨 · 公示牌 · 账 vs 预言 · 秋潮月 | 一、二、三、四、五、六 |
| geography | 风港入 · 灯塔拐角 · 雾港公示牌 | 一、五 |
| characters | 值更人 · 值更长 · 抄本师 · 那个守了三夜的人 | 二、三、四、六 |
| story | 明日大雨 · 回响（其五十六） | 全篇 |
| items | 无名纸条 · 盐水 · 水尺 · 墨 | 一、二、三 |
| history | 第四十一次大会散会之后 · 秋潮月第九日 | 一、三、六 |

> 下一次你路过的时候，看看它还贴在那里——没人见过它被贴上去，但它总是在。
> Next time you pass it, look again — no one has ever seen it posted, and still, it is always there.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其五十六）「雾港公示牌下面那张没人认领的明日大雨」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the nameless slip tacked beneath the fog-harbor bulletin: "Great rain tomorrow."
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给雾港公示牌下面那张无主署名的纸条："明日大雨。"
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the ninth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第九日。

---

## I · Where the Board Stands

The fog-harbor bulletin stands in the corner between the wind-port entrance and the lighthouse, narrow enough that two people must turn sideways to pass by it.  Notices are arranged from top to bottom: first the season's tide-ledger reconciliation, then the Night Watch's token-exchange card, and at the very bottom — one slip reading "Great rain tomorrow"; no signature, no date, no footer.

Everyone looks at the official notices first, and then at the unofficial thing at the bottom — which has never missed a single day since some year in the autumn-tide month.

**锚句**：公示牌下面有一张没有署名的纸条，写着明日大雨。
**Anchor sentence**: tacked at the very bottom of the bulletin board is an unsigned slip reading "Great rain tomorrow".

---

## II · A Paper the Brine Cannot Bite

The wind off the fog harbor carries salt. When the wind gusts, the corners of ordinary notices curl downward and fall by morning.  Yet that slip — exposed to the same breeze for a whole autumn — has its ink curled brittle, and not one character sways.

One of the night watchers stood in front of it and whistled: that paper is not paper; it is a gravestone — every year the ledger of the final rain is marked on it.

**锚句**：纸条贴在公示牌正中，盐水泡皱了也不掉。
**Anchor sentence**: the slip is tacked to the center of the board; soaked in brine and curled, it never falls.

---

## III · The Recurrence

Every month, when the board is updated, somebody peels it off as an example of improper notice.  What happened that night — only wind — and by morning it was back where it had always been, the same ink.

The head of the Night Watch recorded three removals; the fourth went unlogged.  After the fourth, they decided to limit themselves to the official ledger and not to lay a finger on that corner.

**锚句**：每次有人取下它，第二天一早又会贴上一张新的。
**Anchor sentence**: each time someone takes it down, by the morning of the next day a fresh one appears in its place.

---

## IV · No One Claims It

Someone stood three nights beside the board and saw no one post it; he saw the night fall, and he saw the morning arrive, but he saw no one approach the board.  He submitted a report, conclusion overheated; it was sent back to him to rewrite — the new conclusion: "nobody admits to having posted it, and nobody says they have ever seen it being posted."

**锚句**：没有人承认是自己贴的，也没有人说见过它被贴上去。
**Anchor sentence**: nobody admits to having posted it, and nobody says they have ever seen it being posted.

---

## V · The Position That Cannot Be Pinned

Official notices once belonged at the bottom, because that is where the next season's documents wait.  Yet in the year that the slip appeared, every official document — no matter how large or how weighty — was pinned above the slip; nothing pinned the slip flat, and nothing ever sought to push it further down.  In heavy rain the topmost nail of the board goes soft and the tide-ledger slips downward — the "Great rain tomorrow" never does.

**锚句**：公示牌上正式通知下方的纸条从来不往上移，官方站上去盖也压不住。
**Anchor sentence**: the slip beneath the official notices never moves up; however hard the office pins over it, it cannot be pressed flat.

---

## VI · Not a Forecast, an Entry

The copyists have researched it: this is not prophecy.  It gives no date, no rainfall, no wind direction.  It began to appear at the fall of the autumn-tide month — exactly when the ledger itself opens.  Their verdict: it is the board's oldest original manuscript — per the Institute's ancient practice, the next line not yet recorded is written down in advance, so no ledger will lose its place in transfer.

It does not mean "Great rain tomorrow."  It means "tomorrow's rain is already in the Institute's ledger, with the time yet to come and the character yet to hold its name."

**锚句**：抄本师说那不是预告，是账——云那天其实早就记进去了。
**Anchor sentence**: the copyists say it is not a forecast but a ledger entry — the day already in the ledger book of the Institute for the day that is yet to come.

---

## VII · Mapping（Echo No. 56 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | great rain · the bulletin · ledger vs forecast · the autumn-tide month | 一、二、三、四、五、六 |
| geography | the wind-port entrance · the lighthouse corner · the fog-harbor bulletin | 一、五 |
| characters | the night watch · the head of the Night Watch · the copyists · the three-night watcher | 二、三、四、六 |
| story | Great rain tomorrow · Echo No. 56 | 全篇 |
| items | the unsigned slip · the brine · the tide ledger · the ink | 一、二、三 |
| history | After the 41st Convocation · the ninth day of the autumn-tide month | 一、三、六 |

> 下一次你路过的时候，看看它还贴在那里——没人见过它被贴上去，但它总是在。
> Next time you pass it, look again — no one has ever seen it posted, and still, it is always there.
`,
  },
  {
    order: 57,
    slug: 'echo-057-the-undeliverable-summons-from-the-tide',
    titleZh: '雾港潮水漂上来那张没人能投递的潮候院言归帖',
    titleEn: 'The Letter the Tide Washed Ashore That No One Could Ever Deliver',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第十三日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the thirteenth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 57): The Letter the Tide Washed Ashore That No One Could Ever Deliver

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给雾港一下潮那天漂上来的要件封皮：她是写给潮候院一位被抹掉名字的执掌人的回信。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the summons envelope that washed ashore on the still-slack tide: a reply addressed to a steward of the Institute whose name is scrubbed out of the ledger.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第十三日。
> Era: the Institute — after the 41st Convocation; the thirteenth day of the autumn-tide month.

---

## 一 · 退潮最慢的那天

潮水退得最慢的那天，潮候院在雾港的海岸没有一人说出口——他们只是各自把自己的木履摆在钉好的海潮水位线下，静静走过去。

潮水退到最后那条水线以后，剩下一层白得发蓝的水纹，光线站在上面一动不动。制度只允许抄本师、值更人、佛师徒靠近它。

一个值更人先看到了它——然后才敢叫其他人。

**锚句**：事情是在秋潮月潮水退得最慢的一天发生的。
**Anchor sentence**: it happened on the slowest-receding day of the autumn-tide month.

---

## 二 · 一个字的收件人

封皮不是潮候院的官方封皮——一半是旧纸，一半是岸边潮水泡干以后的盐结晶。封皮上只有两行字：

上行是一串墨团，里面三个字被盐融化了一半也能辨认出来：潮候、执掌、某日
下行只有一个字——"归"。

没有人叫它——因为一封没有收件人的要件，法律上不存在；存在的话，潮候院先前抹掉的那个名字该补回去。

**锚句**：信封上写着潮候院之前被抹去的那名执掌人，收件人一栏只有一个字："归"。
**Anchor sentence**: the envelope bears the name of the steward whom the Institute had scrubbed out of its ledger; in the addressee line only one character: "Return."

---

## 三 · 读出来也不完整的信

抄本师不能拆开直接封来——但封皮的一角已经潮开了一线：里面露出一行字，字是走的，手时稳时抖：

"请提醒那山下的人，我们的信才到——但回信不入账不算回。"

后半行也朝上浮出来。

没人敢念第三行。

**锚句**：抄本师无法找到这封要件能合法交到谁手上。
**Anchor sentence**: the copyists could not find any hand into which this summons could legally be delivered.

---

## 四 · 盐水没泡坏它

盐水泡了几十年任何信都会散，可那张要件没有散——抄本师只用手指碰一下没读过的那个角，字上还沾着刚写完的未干墨迹。

他们小心把它铺在灯下。字一个接一个，笔笔皆稳——除了"归"下面那块被黏成纸团的一角，已经长到石盐片那样硬。

**锚句**：要件字迹没有被盐水泡坏，好像它刚刚被写就，不管多少潮又带到岸边。
**Anchor sentence**: the missive's ink was never dissolved by salt; however many tides delivered it, it arrived fresh.

---

## 五 · 钉进存档柜

值更长问："要归应谁？"
抄本师答："归原著。"
值更长说，那按"社会回信"登记。
所有人于是见证：抄本师把两行字拓下来抄七份原件，把原件按墨条正背面分两半钉起来，编号为"社会回信·其一"，盖墨条"时候未到"。

——与那只门廊夜钟同名。

**锚句**：抄本师把它钉在存档柜里，编号改为"社会回信"，按墨条另一面折好。
**Anchor sentence**: the copyists filed it under "letter from society", then folded it along the reverse of a striped strip.

---

## 六 · 风港值更人说

风港换班之后，年轻值更人私下问："这封信什么时候才能再来一次？"
老值更人说："它还会再来——下一次雾大的时候，连信纸的麻尾纹也被海浪磨得更清晰。"
年轻值更人坚持："那有没有人去认那个字？"
老值更人沉默半晌："没人去收，也没人再寄。它会不断收到，不断无人领——它写在潮候院之前的户籍册上。"

**锚句**：风港值更人说它还会再来一次，同一天，还无人认领。
**Anchor sentence**: the watchers of the wind port say it will come again — same day, and still no hand claims it.

---

## 七 · 映射（回响五十七章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 社会回信 · 言归帖 · 时候未到 · 墨条正背 | 一、二、三、四、五、六 |
| geography | 雾港 · 潮水最后一条水线 · 风港换班堂 | 一、五、六 |
| characters | 值更人 · 值更长 · 抄本师 · 两位值更人（年轻与老） | 一、二、三、五、六 |
| story | 没人能投递的要件 · 回响（其五十七） | 全篇 |
| items | 潮水封皮 · 墨条 · 灯下案台 · 社会回信编号 | 二、三、四、五 |
| history | 第四十一次大会散会之后 · 秋潮月第十三日 | 一、三、六 |

> 雾港的风说：它还会回来的——下一次来的同一天，还是没有人去领。
> The wind at the fog harbor says it will come again — and on that next day, still no one will claim it.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其五十七）「雾港潮水漂上来那张潮候院言归帖」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the summons envelope that washed ashore on the still-slack tide: a reply addressed to a steward of the Institute whose name is scrubbed out of the ledger.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给雾港一下潮那天漂上来的要件封皮：她是写给潮候院一位被抹掉名字的执掌人的回信。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the thirteenth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第十三日。

---

## I · The Slowest-Receding Day

On the day the tide receded slowest, at the Institute's stretch of the fog-harbor shore, not a soul spoke aloud — each person set their wooden sandals down beside the pinned waterline, and passed by in silence.

The water withdrew to the final line — a white sheen with barely a tinge of blue, light resting on it, nothing moving. By the rule of the Institute, only the copyists, the night watch, and the lay monks could approach it.

A night watcher saw it first. Not until he was sure, would he call out.

**锚句**：事情是在秋潮月潮水退得最慢的一天发生的。
**Anchor sentence**: it happened on the slowest-receding day of the autumn-tide month.

---

## II · A One-Character Addressee

The paper was not an official envelope of the Institute — half of it was old stock, half was salt crystals where the surf had dried over it. Only two lines of writing were on it:

The upper line was a single spill of ink — three characters legible through the salt: 潮候 (Institute), 执掌 (steward), and the date stamp.
The lower line carried a single word: "归" (Return).

No one called to retrieve it — under law, a summons without an addressee does not exist; if it does, then the steward's name scrubbed out by the Institute ought first to be put back in the ledger.

**锚句**：信封上写着潮候院之前被抹去的那名执掌人，收件人一栏只有一个字："归"。
**Anchor sentence**: the envelope bears the name of the steward whom the Institute had scrubbed from its ledger; in the addressee line, a single character: "Return."

---

## III · The Letter Even Read Is Not a Whole

The copyists would not open it directly — but one corner of the envelope had already opened by the surge. Only one line was visible inside — its hand was unsteady:

"Please remind the one beneath the hill — our letter has only just arrived — but a reply not lodged in the ledger counts for nothing."

The half-line above rises, then sinks again.

No one dares read the third line.

**锚句**：抄本师无法找到这封要件能合法交到谁手上。
**Anchor sentence**: the copyists could not find any hand into which this summons could legally be delivered.

---

## IV · The Salt Did Not Fade It

Salt water ruins any letter in decades — but that summons has not dissolved; the copyists laid one finger on the unopened corner and felt, still, the faint tack of the ink.

Carefully they set it under the lamp. Letter by letter, each stroke was steady — except that corner below the "归", where the paper has fused into a hard lump of salt.

**锚句**：要件字迹没有被盐水泡坏，好像它刚刚被写就，不管多少潮又带到岸边。
**Anchor sentence**: the missive's ink was never dissolved by salt; however many tides delivered it, it arrived fresh.

---

## V · Pinned into the Archive

The head of the Night Watch asked: "谁归应谁？" (Return to whom?)
The copyists answered: "归原著" (Return to the original author).
The head of the Night Watch said, then register it as "Letter from Society."

So the witnesses were assembled — the copyists traced the two lines onto seven copies, folded the original along the reverse of the striped strip, numbered it "Letter from Society, No. 1", and sealed it with the ink stamp "Not yet the hour."

— identical to the night bell of the back gallery.

**锚句**：抄本师把它钉在存档柜里，编号改为"社会回信"，按墨条另一面折好。
**Anchor sentence**: the copyists filed it under "letter from society", then folded it along the reverse of a striped strip.

---

## VI · What the Wind-Port Watchers Said

After the wind port changed its watch, the young watcher asked privately: "When will this letter come again?"
The old watcher said, "It will come again — next time the fog is thickest, the fiber of the paper even clearer from the chill of the sea."
The young watcher persisted: "Then will someone come to claim the character?"
The old watcher kept his silence for a long moment: "No one will take it, no one will send it. It will arrive, over and over, and always unclaimed — it is written into the household registry of the Institute before the Institute itself was named."

**锚句**：风港值更人说它还会再来一次，同一天，还无人认领。
**Anchor sentence**: the watchers of the wind port say it will come again — same day, and still no hand claims it.

---

## VII · Mapping（Echo No. 57 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | Letter from Society · the summons · not yet the hour · striped strip · reverse fold | 一、二、三、四、五、六 |
| geography | the fog-harbor shore · the final waterline · the wind-port watch-change hall | 一、五、六 |
| characters | the night watch · head of the Night Watch · copyists · two watchers (young and old) | 一、二、三、五、六 |
| story | the undeliverable summons · Echo No. 57 | 全篇 |
| items | the tide-soaked envelope · the striped strip · the lamp table · the answer log | 二、三、四、五 |
| history | After the 41st Convocation · the thirteenth day of the autumn-tide month | 一、三、六 |

> 雾港的风说：它还会回来的——下一次来的同一天，还是没有人去领。
> The wind at the fog harbor says it will come again — and on that next day, still no one will claim it.
`,
  },
  {
    order: 58,
    slug: 'echo-058-the-ink-line-at-the-sanctuary-foot',
    titleZh: '祠殿墙脚那条抄本师只认墨不认盐的墨线',
    titleEn: 'The Ink Line at the Sanctuary\'s Foot That the Copyists Never Called a Crack',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第二十日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the twentieth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 58): The Ink Line at the Sanctuary's Foot That the Copyists Never Called a Crack

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿墙脚那条从内而外渗盐的细缝——抄本师叫它"墨线"，不叫别的。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the seam at the sanctuary's foot that seeps salt outward — the copyists call it the "ink line" and nothing else.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第二十日。
> Era: the Institute — after the 41st Convocation; the twentieth day of the autumn-tide month.

---

## 一 · 墨线

祠殿墙脚的东边有一条细缝——位置很近盐线那一侧，方向自内朝外。缝不深，人指摸上去只到第一节关节，但手指上会挂一层白。

抄本师不叫它裂缝，叫它墨线。规定里不是说命名趣味，是所有描述它的话，抄本师都打成墨字，值更长回帖也都墨字批回——没人写它的真名。

**锚句**：祠殿墙脚有一条缝，抄本师叫它「墨线」。
**Anchor sentence**: at the sanctuary's foot sits a seam the copyists call the "ink line".

---

## 二 · 从内向外渗出

值更人测过：刮下来的盐不是风从外面带来的——方向是错的，是从祠殿里面渗出来的。

院里有人说那是祠殿内壁"干涸的迹象"。也有人说那是"账册多年没更新一页，自己渗出的墨"——到底层哪一句是真是假，潮候院从没找到过证人。

**锚句**：盐是祠殿里往外渗的，不是风吹进来的——里面正在干。
**Anchor sentence**: salt seeps outward from the sanctuary's interior; the wind brings none in — the inside is drying.

---

## 三 · 先碰不能擦掉

抄本师的教条分三步。第一步：先用手指轻轻碰一下——感受凉还是不凉；第二步：用指腹沿着白迹的外缘描一圈，够不够硬；第三步，永远不用刷子、干布去抹——抹了两次以上，第三人就在跟前看它，判它已经墨线对不住了。判读之后，由抄本师开一份「判线回执」，抄给值更院公署，附录第六十四页，不再补笔。

值更院拿回执存进现行章程附录——那是第六十四页。

**锚句**：抄本师说要先碰不能擦掉——打磨了墨线就没了。
**Anchor sentence**: the copyists say to touch first and never polish — the ink line is gone once polished.

---

## 四 · 每月刷一次、一年长一厘米

值更长每月要站在墨线前用小刷清一次盐壳——不是为了干净，是为了能看见"它还在长"。

测量登记在公示牌角落一行：每年长一厘米——一九八四年，盐线内缩了整条湿盐带（公示牌的厚表全部作废重做了四次）——但墨线数字依旧是一年一厘米。"它不赶时间，"这是抄本师原话。

**锚句**：值更长每月刷一次，盐还在涨——一年长一厘米。
**Anchor sentence**: the head watch brushes it monthly; the salt keeps rising — a centimeter a year.

---

## 五 · 盐疏

抄本师把所有关于墨线的观察都归入了"时候未到"账册——新开了一页，叫"盐疏"。首页写一行字：

"此页不结，不结即到，到即不必已。"

墨线每动一次，盐疏就多抄一羁记——每记为一个抄本师一生只能填的那一行。近期盐疏第十一行落款，值更长的名字押下——上一笔是四十二年前的上一任。

**锚句**：抄本师把它收进「时候未到」账，特地分一页，叫「盐疏」。
**Anchor sentence**: the copyists entered it into the "not yet the hour" ledger, on its own page, the Salt Treatise.

---

## 六 · 章程要翻二十三遍的那一天

值更长有一项秘制：盐疏上多一笔，他就要把现行章程再翻一遍，一字不漏。不是他记不得条文，是章程规定每次盐疏更新都要校对一次「第四十一次大会散会决议」——潮候院没有宪法，就以大会决议代之。

他已经翻了二十三遍。盐疏纸软，边角叠成了自己的形状——抄本师说那是盐线自己退了，墨线自己便停了。

**锚句**：每次盐疏更新，值更长要翻一遍现行章程——直到盐线自己退了，墨线自己便停了。
**Anchor sentence**: each Salt Treatise update, the head watch must re-read the current manual — until the salt line retreats, and the ink line halts.

---

## 七 · 映射（回响五十八章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 墨线 · 时候未到 · 盐疏 · 章程宪法 | 一、二、三、四、五、六 |
| geography | 祠殿东墙脚 · 盐线一侧 · 附录第六十四页 | 一、二、四 |
| characters | 抄本师 · 值更长 · 值更长前任 | 一、二、三、四、五、六 |
| story | 盐从里往外渗的墨线 · 回响（其五十八） | 全篇 |
| items | 盐结晶 · 墨字批回 · 判线回执 | 一、三、四、五 |
| history | 第四十一次大会散会之后 · 秋潮月第二十日 | 一、二、三、四、六 |

> 有人假装看不见那条墨线，走过去；有人知道它在长，所以停下来——墨线是给愿意停的人看的。
> Some walk past as if they cannot see the ink line; those who know it keeps growing stop for it — the line is for those willing to stop.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其五十八）「祠殿墙脚那条抄本师只认墨不认盐的墨线」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the seam at the sanctuary's foot that seeps salt outward — the copyists call it the "ink line" and nothing else.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿墙脚那条从内而外渗盐的细缝——抄本师叫它"墨线"，不叫别的。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the twentieth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第二十日。

---

## I · The Ink Line

At the sanctuary's eastern foot runs a thin seam — it lies closer to the salt-line side and runs from inside toward the outside. It is shallow; a finger only reaches the first knuckle when tracing it, yet the fingertip always carries away a thin film of white.

The copyists do not call it a crack; they call it the ink line. This is not a matter of naming taste — every description recorded about it is written in ink, and every reply the head watch sends back is written in ink; no one sets down its true name on paper.

**锚句**：祠殿墙脚有一条缝，抄本师叫它「墨线」。
**Anchor sentence**: at the sanctuary's foot sits a seam the copyists call the "ink line".

---

## II · Seeping from Within

The night watch measured the scrapings: the salt is not blown in from outside — the direction is wrong. It is carried outward from inside the sanctuary.

Some in the Institute call this the "sign of a dry sanctuary". Others call it "the ledger bleeding a rubbed line through — pages left un-inked for too many years". As to which of these tells the truth, the Institute never found a witness.

**锚句**：盐是祠殿里往外渗的，不是风吹进来的——里面正在干。
**Anchor sentence**: salt seeps outward from the sanctuary's interior; the wind brings none in — the inside is drying.

---

## III · Touch First, Never Polish

The copyists teach in three steps. First: touch it once lightly with a fingertip — feel whether it is cool or not. Second: trace the outline of the white trace with a fingertip — judge its hardness. Third: never use a brush or dry cloth — polish it twice, and a third person standing before it will rule the ink line already broken. Once the ruling is set, the copyist issues a "judgment sheet" to the Night Watch office, filed into Appendix 64; no further stroke is added.

**锚句**：抄本师说要先碰不能擦掉——打磨了墨线就没了。
**Anchor sentence**: the copyists say to touch first and never polish — the ink line is gone once polished.

---

## IV · Monthly Brushing, a Centimeter a Year

The head watch stands before the ink line each month with a small brush to clear the shell — not for cleanliness, but so that "it is still growing" can still be seen.

Measurements are entered onto a corner of the bulletin board: a centimeter a year. In 1984 the salt line cut inward across the entire wet-salt band (the bulletin's thick tables were thrown out and rebuilt four times); the ink line's reading never changed. "It does not hurry," the copyists said.

**锚句**：值更长每月刷一次，盐还在涨——一年长一厘米。
**Anchor sentence**: the head watch brushes it monthly; the salt keeps rising — a centimeter a year.

---

## V · The Salt Treatise

The copyists gathered all observations on the ink line into the "not yet the hour" ledger — and gave them their own page: "Salt Treatise." The first line reads:

"This page is not closed; not closed is the hour, the hour is not yet."

Each movement of the ink line, the Treatise grows a new trace — one line per copyist's lifetime, only one line chosen among possible lives. The most recent entry bears the head watch's seal — the stroke before it was laid forty-two years ago by his predecessor.

**锚句**：抄本师把它收进「时候未到」账，特地分一页，叫「盐疏」。
**Anchor sentence**: the copyists entered it into the "not yet the hour" ledger, on its own page, the Salt Treatise.

---

## VI · The Twenty-Third Passage Through the Manual

The head watch keeps one secret rule: each time the Salt Treatise gains a line, he opens the current manual again, front to back, every word. Not because he forgets the text — the manual dictates that every update to the salt line must be cross-checked against "the resolution of the 41st Convocation"; the Institute has no constitution, so the Convocation's resolution is used in its place.

He has now read it twenty-three times. The paper of the Treatise is soft and bent to its own shape — the copyists say, when the salt line retreats, the ink line halts.

**锚句**：每次盐疏更新，值更长要翻一遍现行章程——直到盐线自己退了，墨线自己便停了。
**Anchor sentence**: each Salt Treatise update, the head watch must re-read the current manual — until the salt line retreats, and the ink line halts.

---

## VII · Mapping（Echo No. 58 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the ink line · not yet the hour · the Salt Treatise · Convocation resolutions | 一、二、三、四、五、六 |
| geography | the eastern foot of the sanctuary · the salt-line side · Appendix 64 | 一、二、四 |
| characters | the copyists · the head of the Night Watch · his predecessor | 一、二、三、四、五、六 |
| story | the salt seeping outward · Echo No. 58 | 全篇 |
| items | salt crystals · ink-margin annotations · the judgment sheet · the Treatise | 一、三、四、五 |
| history | After the 41st Convocation · the twentieth day of the autumn-tide month | 一、二、三、四、六 |

> 有人假装看不见那条墨线，走过去；有人知道它在长，所以停下来——墨线是给愿意停的人看的。
> Some walk past as if they cannot see the ink line; those who know it keeps growing stop for it — the line is for those willing to stop.
`,
  },
  {
    order: 59,
    slug: 'echo-059-the-well-the-salt-cannot-hold',
    titleZh: '雾港东南巷那口盐封不了的老井',
    titleEn: 'The Old Well in the South-east Alley the Salt Cannot Hold',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第二十五日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the twenty-fifth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 59): The Old Well in the South-east Alley the Salt Cannot Hold

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给雾港东南巷尽头那口盐封老井：——没人决定开它，没人愿意封它。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the salt-sealed old well at the far end of the fog-harbor south-east alley: no one decided to open it, and no one dares to seal it again.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第二十五日。
> Era: the Institute — after the 41st Convocation; the twenty-fifth day of the autumn-tide month.

---

## 一 · 雾港东南巷

东南巷是一条没有尽头但突然中断的路——走下去就是巷尾，再走一步就是老井。井不是井，没有水——六十年前，它就已经不像井。

它比人高一拃。人们看着它的井沿都比人眼睛略低一点，坐船头时，能看见那条缝已经是白色——旧水线。

**锚句**：雾港东南巷尽头那口老井，早年已经被盐封了。
**Anchor sentence**: the old well at the far end of the south-east alley in the fog harbor was sealed with salt long ago.

---

## 二 · 不怕谁来看

巷子很窄，两个人侧身能避开它。可是从来没有人顺便提高声音问一句——"那是什么？""

值更长说，巷里来的人会停下脚步。没有人能说清为什么，也没有人不知道。不说因为讲过就漏。

**锚句**：井边从不怕人看，只是谁也懒得进去。
**Anchor sentence**: no one fears looking at it; no one bothers to step inside.

---

## 三 · 拎着绳下去的那个人

关于这口井，有一则旧记——只有抄本师知道完整篇。

有个年纪不大大的年轻人，拿了一根结了骨绳子下去探个底。下去不久，绳子断了——在他脚距井口三寸的地方；他的身体挂在缝壁上几个小时，后半夜给人拉了上来；一根骨绳，十七个绳结。

他从井里带回了一样东西——半杯咸水——而且说，他是用水喝的，没用舌头试。他后来回到祠殿门前，仰头看了一会儿灯塔灯，没有说话。

**锚句**：绳子下面半尺垂直的盐壳断了那个人的手指——也带了回半杯水。
**Anchor sentence**: the perpendicular salt rind below snapped the rope at half an arm — and a half-cup of water came back with it.

---

## 四 · 半杯水

水很咸。比海水还咸。

抄本师把半杯水收了起来——他捧了两把白盐放进去，等一夜之后，水竟然收得干净，水没有淡，盐没有沉。他把这杯水又倒回去泡了一天。结果是：水还是水，盐还是盐；盐在水上停了一宿，第二天人来看，半杯水又回来了，只是没有上次那么清了。

**锚句**：有人拎绳子下去，带回了半杯水；盐化验结果写了一个字：「不明」。
**Anchor sentence**: someone went down with a rope and returned with a half-cup of water; the assay called it, in one word, "Unknown".

---

## 五 · 大会散会

第四十一次大会散会之后，值更长站在井沿上，看了半个下午——一遍一遍刷洗刻在井沿上的字。

抄本师说，有些事说不定。他问值更长说什么——他说：我没说什么。他们俩在井沿一站又一会儿，风从灯塔一边刮过来。

两人离开之后，井沿上留下了一行新刻的字：

**"不饮不忘；它是水。"**

**锚句**：值更长留下的字在井沿上：「不饮不忘；它是水。」
**Anchor sentence**: what the head of the watch carved on the rim reads: "Neither to drink; nor to forget — but it is water."

---

## 六 · 它是水

四十一次大会散会的第二天，有人用桶去打，绳子下去一寸就被咬断；值更长决定盖上盐壳；但是井沿的那道痕早已硬在那里——掀不动也再封不牢。

他们学会了从它面前路过但不问；水在下面，盐在它的上面。盐线再怎么退，井口永远还是巴掌大。

**锚句**：不饮不忘；它是水。
**Anchor sentence**: neither to drink; nor to forget — but it is water.

---

## 七 · 映射（回响五十九章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 盐封 · 半杯水 · 不饮不忘 · 盐线 · 井沿 | 一、二、三、四、五、六 |
| geography | 雾港东南巷 · 巷尾 · 井沿 · 灯塔方向 | 一、三、五、六 |
| characters | 抄本师 · 值更长 · 年轻人 · 绳子 | 三、四、五 |
| story | 盐封老井 · 回响（其五十九） | 全篇 |
| items | 骨绳 · 半杯咸水 · 井沿 · 白盐 | 三、四、六 |
| history | 第四十一次大会散会 · 秋潮月第二十五日 | 一、二、四、五、六 |

> 风雨后井里还是空，盐壳却总能从井沿上自己裂开一条线。
> When the rain quits, the well is still empty; yet the salt shell on the rim always splits open on its own.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其五十九）「雾港东南巷那口盐封不了的井」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the salt-sealed old well at the far end of the fog-harbor south-east alley: no one decided to open it, and no one dares to seal it again.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给雾港东南巷尽头那口盐封老井：没人决定开它，没人愿意封它。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the twenty-fifth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第二十五日。

---

## I · The South-east Alley

The south-east alley ends abruptly but oddly — walk until the last step and the whole world is a well. It is not a well now; six decades ago, it stopped being one.

It stands about the height of a grown man, closer to a short one's shoulder; its rim catches the boat rider's eye the moment they round the lighthouse — since every rider on the fog comes into the harbor on that same slow ribbon of water.

**锚句**：雾港东南巷尽头那口老井，早年已经被盐封了。
**Anchor sentence**: the old well at the far end of the south-east alley in the fog harbor was sealed with salt long ago.

---

## II · No One Fears Approaching

The alley is narrow enough for two to squeeze by sideways. Yet no one raises their voice to call into it — "what is that?"

The head of the night watch says people slow a little at it. No one has ever said why; no one has ever said nothing. The Institute does not discuss it; mention once, and it spills.

**锚句**：井边从不怕人看，只是谁也懒得进去。
**Anchor sentence**: no one fears looking at it; no one bothers to step inside.

---

## III · He Who Descended with the Rope

There is an old account — known fully only to the copyists.

A young man, not yet grown into his head, had taken a rope with bone thickening and went down to the bottom. The rope snapped a handspan below the rim; he hung in the wall's shadow for some time, and sometime before midnight others answered the shout and pulled him up; the rope broke at a flail of flakes.

What he brought back was small: a half-cup of saline water — and he said later that he had drunk from it, and had not bothered to use his tongue to taste. He came back to the sanctuary's gate and stood for a long time looking up at the tower light; he did not say what he saw.

**锚句**：绳子下面半尺垂直的盐壳断了那个人的手指——也带了回半杯水。
**Anchor sentence**: the perpendicular salt rind below snapped the rope at half an arm — and a half-cup of water came back with it.

---

## IV · A Half-Cup

The water was extremely salty. More than the sea.

The copyists took possession of the cup; they added two handsful of white salt, then waited until morning. Next morning, the water looked as if it had received the salt into itself with ease — the salt did not settle — the water was no clearer for it, yet the salt no longer visible. They poured it back into the well. By the time the next visitor looked, the water had not gone shallower by a drop.

**锚句**：有人拎绳子下去，带回了半杯水；盐化验结果写了一个字：「不明」。
**Anchor sentence**: someone went down with a rope and returned with a half-cup of water; the assay called it, in one word, "Unknown".

---

## V · After the 41st Convocation Dissolved

After the 41st Convocation closed, the head of the watch walked to the rim and stood there for an afternoon — he ran a thumb over the inscription on the rim three times.

The copyist asked what he saw. He said, nothing. They stayed together another while; the wind came in steady from the lighthouse side.

After he left, a new line was cut into the rim:
**"不饮不忘；它是水。"**

**锚句**：值更长留下的字在井沿上：「不饮不忘；它是水。」
**Anchor sentence**: what the head of the watch carved on the rim reads: "Neither to drink; nor to forget — but it is water."

---

## VI · Yet It Is Water

The day after the 41st Convocation ended, someone tried to lower a bucket on a rope with weighted hook — each turn of the handle returned with the hook's tip eaten clean off.

So the head of the watch resealed the rim with salt.  But the salt has never sat still on that place either — whatever new salt is laid on, the rim always splits open the same way as before, seam by seam. They learned: pass by, do not ask; the water is below the salt, the salt above it; and the well's opening is no wider than a palm.

**锚句**：不饮不忘；它是水。
**Anchor sentence**: neither to drink; nor to forget — but it is water.

---

## VII · Mapping（Echo No. 59 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the salt seal · a half-cup · neither to drink nor to forget · the rim | 一、二、三、四、五、六 |
| geography | the south-east alley · the alley end · the rim · the lighthouse direction | 一、三、五、六 |
| characters | the copyists · the head of the night watch · the young man · the rope | 三、四、五 |
| story | the old well sealed with salt · Echo No. 59 | 全篇 |
| items | the bone-thickened rope · the half-cup of water · the rim · the white salt | 三、四、六 |
| history | After the 41st Convocation · the twenty-fifth day of the autumn-tide month | 一、二、四、五、六 |

> 风雨后井里还是空，盐壳却总能从井沿上自己裂开一条线。
> When the rain quits, the well is still empty; yet the salt shell on the rim always splits open on its own.
`,
  },
  {
    order: 60,
    slug: 'echo-060-the-half-hook-no-one-finishes',
    titleZh: '交班簿上那个谁也没写完的半钩',
    titleEn: 'The Half-Hook No One Ever Finishes Writing',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第二十七日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the twenty-seventh day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 60): The Half-Hook No One Ever Finishes Writing

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给值更人交班记账簿上那个从没有人签得完的半钩——每页底留痕、形同一个没写完的钩。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the half-hook on the handover ledger that no watcher ever finishes — a hook, left unwritten at the foot of every page.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第二十七日。
> Era: the Institute — after the 41st Convocation; the twenty-seventh day of the autumn-tide month.

---

## 一 · 交班簿

祠殿后廊靠墙那张矮桌上，常年放着一本双线装的册子——《值更人交班簿》。

交接班的时候，值更人要用自己的手蘸自己的墨，在第三页上写一行字——不多，一行。谁写的、哪一天、灯先熄的哪盏，册子不记。它只存笔尖的最后一笔。

**锚句**：值更人交班的时候，要用手蘸墨，写在交班簿第三页上。
**Anchor sentence**: when the night watchers hand over, they dip their pen in ink and write on the third page of the handover ledger.

---

## 二 · 半钩

第四十一次大会散会之后，每一次交班，那一行字的最后一笔都不完整——抄本师的第一反应是：这不是手误，是一种同一的收笔。

他叫这一笔叫「半钩」。它不像任何字的部首，却每一次都出现；四十年下来，同一个形状出现了五十八次——没有一次和下一次完全一致，但每一次都认得出是同一笔。

**锚句**：第四十一次大会散会之后，交班那一行最后一笔总是不完整。
**Anchor sentence**: after the 41st Convocation dissolved, the final stroke of the handover line always comes up incomplete.

---

## 三 · 描一遍

抄本师每天翻一页时都会用指腹描一遍那半钩。他的学生围坐在旁边，问他描什么、说什么。

他说：不知道——但这一个半钩的弧度也没到立春，今年不长。

**锚句**：抄本师每天翻页都会用指腹描一遍，边描边说不知道。
**Anchor sentence**: each day the copyists trace it once with the pad of a finger, saying, every time, that they do not know.

---

## 四 · 两处残迹

值更长和抄本师一起核对历届散会纪要时发现：同一个半钩，也出现在部分散会纪要末尾一行；笔不写字，只留着——散会纪要只记轮次，不记人。

**锚句**：散会纪要里也见过这个形状，笔不写字，只留着。
**Anchor sentence**: this same shape also appears at the foot of some dissolution records — left by no written hand, only kept.

---

## 五 · 只记不启

值更长和抄本师约定：册子里出现同一个半钩，不解开、不换页、不登记——它是「交班之约」里未交班的人的见证。他们用「交班之钩」命名它。

**锚句**：四十一年来，没有人解开过那半钩；它一直被称为「交班之钩」。
**Anchor sentence**: for forty-one years no one has opened that half-hook; it is known only as the "handover hook".

---

## 六 · 说的话

抄本师的学生最后一次抄册子时问他，半钩为什么不自己长出来？

他说：他在等亡人来收尾——那就是交班簿为什么从不交班。

**锚句**：抄本师临走前对他的学生说：那是等亡人来收尾。
**Anchor sentence**: before the copyists passed, they said to their student: it is waiting for the one who died to finish it.

---

## 七 · 映射（回响六十章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 交班簿 · 半钩 · 交班之钩 · 散会纪要 · 亡人 | 一、二、三、四、五、六 |
| geography | 祠殿后廊矮桌 · 第四十一次大会 · 附记散会 | 一、二、四 |
| characters | 值更人 · 抄本师 · 抄本师的学生 · 值更长 | 一、二、三、四、五、六 |
| story | 半钩 · 回响（其六十） | 全篇 |
| items | 双线册 · 墨笔 · 半钩 · 附记册 | 一、二、三、四、五、六 |
| history | 第四十一次大会散会之后 · 秋潮月第二十七日 | 二、四、五、六 |

> 每个人进去写那一页的时候，都以为自己在写昨天——其实是在签明天的名。
> Everyone who steps in to write on that page believes he is writing yesterday — he is, in fact, signing for tomorrow.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其六十）「交班簿上那个谁也没写完的半钩」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the half-hook on the handover ledger that no watcher ever finishes — a hook, left unwritten at the foot of every page.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给值更人交班记账簿上那个从没有人签得完的半钩——每页底留痕、形同一个没写完的钩。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the twenty-seventh day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第二十七日。

---

## I · The Handover Ledger

On the low table against the wall of the back gallery there is always a bound ledger — the Ledger of the Night Watch Handover.

At the hour of transfer, the watcher dips his own brush into his own ink and writes a single line on the third page — not more, one line.  Whoever wrote it, which day, which lamp went out first — the ledger remembers none of that. It keeps only the final stroke of the brush.

**锚句**：值更人交班的时候，要用手蘸墨，写在交班簿第三页上。
**Anchor sentence**: when the night watchers hand over, they dip their pen in ink and write on the third page of the handover ledger.

---

## II · The Half-Hook

After the 41st Convocation dissolved, every handover line ends incomplete — the tip never reaches its closing curve.

The copyists noticed first: it is not a slip of the hand — it is a consistent way of finishing.

They named this stroke the "half-hook". It resembles no recognized stroke; yet it appears on every written line; over forty years, the same shape appeared fifty-eight times — never the same twice, yet every time recognisable.

**锚句**：第四十一次大会散会之后，交班那一行最后一笔总是不完整。
**Anchor sentence**: after the 41st Convocation dissolved, the final stroke of the handover line always comes up incomplete.

---

## III · Traced Once

Each day when the copyists turn a page, they trace the half-hook once with the pad of a finger. Their students sit beside them and ask what he traces and what he means.

He answers: I do not know — the arc of it does not shorten even at the turn of spring.

**锚句**：抄本师每天翻页都会用指腹描一遍，边描边说不知道。
**Anchor sentence**: each day the copyists trace it once with the pad of a finger, saying, every time, that they do not know.

---

## IV · Two Unfinished Records

When the head of the watch and the copyists once checked the Convocation dissolution records, together they found the same half-hook at the foot of some of them — left by no written hand, only kept.

No hand was found to have made the stroke; the ledger does not record names; it remembers only the final brush tip.

**锚句**：散会纪要里也见过这个形状，笔不写字，只留着。
**Anchor sentence**: this same shape also appears at the foot of some dissolution records — left by no written hand, only kept.

---

## V · Only Record, Never Open

The head of the night watch and the copyists agreed: the ledger with the same half-hook is neither opened, re-paginated, nor re-registered — it is the witness of the person not yet handed over in the Handover Covenant. They name it the "Handover Hook."

**锚句**：四十一年来，没有人解开过那半钩；它一直被称为「交班之钩」。
**Anchor sentence**: for forty-one years no one has opened that half-hook; it is known only as the "handover hook".

---

## VI · The Words at the End

When the copyists' student asked him once why the half-hook never finished itself, he answered:

He is waiting for the one who died to finish it — that is why this ledger never finishes handing over.

**锚句**：抄本师临走前对他的学生说：那是等亡人来收尾。
**Anchor sentence**: before the copyists passed, they said to their student: it is waiting for the one who died to finish it.

---

## VII · Mapping（Echo No. 60 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the handover ledger · the half-hook · the Handover Hook · the dissolution records · the dead man | 一、二、三、四、五、六 |
| geography | the low table at the back gallery · the 41st Convocation · the dissolution appendices | 一、二、四 |
| characters | the night watcher · the copyists · the head of the watch · the student | 一、二、三、四、五、六 |
| story | the half-hook · Echo No. 60 | 全篇 |
| items | the bound ledger · the ink brush · the half-hook · the Convocation appendices | 一、二、三、四、五、六 |
| history | After the 41st Convocation · the twenty-seventh day of the autumn-tide month | 二、四、五、六 |

> 每个人进去写那一页的时候，都以为自己在写昨天——其实是在签明天的名。
> Everyone who steps in to write on that page believes he is writing yesterday — he is, in fact, signing for tomorrow.
`,
  },
  {
    order: 61,
    slug: 'echo-061-the-volume-no-one-opens-the-second-page',
    titleZh: '祠殿侧窗那本没人敢翻第二页的集子',
    titleEn: 'The Volume Beside the Sanctuary Window Whose Second Page No One Dares Open',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第二十九日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the twenty-ninth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 61): The Volume Beside the Sanctuary Window Whose Second Page No One Dares Open

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿侧窗书架上那只从没有人翻开第二页的集子。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the volume on the shelf beside the sanctuary window whose second page no one dares to open.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第二十九日。
> Era: the Institute — after the 41st Convocation; the twenty-ninth day of the autumn-tide month.

---

## 一 · 侧窗

祠殿侧窗是值更长换班时才会去的窗——窗边摆着一排深色的长木箱，每一只都是潮候院保存室收官的集子。

其中一只比其他水箱矮一点，不顶在墙上，用深色的布盖了好多年——它上面没有刻名，也没有登记过号码。

**锚句**：祠殿侧窗书架上摆着一只深木箱，每个人都怕碰到它。
**Anchor sentence**: beside the sanctuary window stands a deep wooden chest that everyone fears to touch.

---

## 二 · 第一页

普通人第一眼只能读第一页——封扉的这一页是敞开的：海风从雾港吹进来的七个方向、波浪的弧度、灯塔第七级台阶那段怎样被盐啃出光——值更长把这些按掌心的刻度写进了纸。写得太精当了，精当到让人心虚。

**锚句**：第一页画着海风从雾港吹来的七个方向。灯塔七级台阶的风向都被记住了。
**Anchor sentence**: the first page charts the seven winds that enter the fog harbor; the seventh step of the lighthouse remembers every one.

---

## 三 · 没人打开它

值更长自己也承认——他们都不知道里面第二页写了什么。

四十一年前，上一任值更长把这只木箱摆出来的时候，在它上面钉过一条纸条：
「里面只有真实的记录，需要后世来收官。」

每个人看过这纸条，都停了一下——不是不敢犯别人的错，是不敢答应一个要求后人收官的提问。

**锚句**：没被打开的第二页上，只有一条抄本师们都认得的横线。
**Anchor sentence**: on the second, unopened page rests a horizontal stroke every copyist recognises.

---

## 四 · 每年覆蜡

抄本师定期走过来看它，但从不打开——每次只按章程给它上一层蜡。

他说：不是为了防水，是防再被任何人翻开——那些字需要在这张桌上继续存放，不是在任何人的手心里读过去。他的包里只有蜂蜡，没有纸巾；他每次都选在没人能看见他桌上的光时才来。

**锚句**：抄本师定期给它上蜡，只守着不打开它。
**Anchor sentence**: the copyists wax it on a schedule, yet never open it themselves.

---

## 五 · 每次交接的人都要回得去

值更长立下了一条规矩：每一个新交接班的值更人，须先读一遍那只木箱上钉着的纸条，然后在箱盖内侧盖一枚印——印里刻的不是字，是一个"承"字的空框。盖过印的人不算收箱，是算入族——能认这个字，就得认那只箱。

两百岁之后的后一代说，箱盖上的印已经堆成了一个小山尖。

**锚句**：值更长说，翻开第二页的人，自己回头补完一页。
**Anchor sentence**: the head of the watch said whoever opens the second page must write the missing one themselves.

---

## 六 · 散会那一天

第四十一次大会散会那一天，所有人列队经过它——没有人停。

抄本师临走时对旁人说：「它不是水养宠着，也不是风借走消息；它是大会散会日那一天没有熄灭的那盏灯——照了还在燃，没人能看见它。」

第二天再看，木箱回到角落，仍不属任何人。

**锚句**：记得的第四十一次大会散会，抄本师们又把它放回原位。
**Anchor sentence**: after the 41st Convocation dissolved, the copyists put the volume back exactly where it had been.

---

## 七 · 映射（回响六十一章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 侧窗 · 第二页 · 收官 · 覆蜡 · 交班之约 | 一、二、三、四、五、六 |
| geography | 祠殿侧窗 · 灯塔第七级台阶 · 雾港 | 一、二、三、四、五、六 |
| characters | 值更长 · 抄本师 · 上任值更长 · 交班值更人 | 一、三、四、五、六 |
| story | 侧窗的集子 · 回响（其六十一） | 全篇 |
| items | 深木箱 · 蜡 · 七风方向图 · 七级台阶 · 承印 | 一、二、三、四、五、六 |
| history | 第四十一次大会散会 · 秋潮月第二十九日 | 三、四、五、六 |

> 没有名字的木箱不属于任何集子——它就是整本书籍的扉页。
> A chest without a name belongs to no shelf — it is the title page of the whole library.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其六十一）「祠殿侧窗那本没人敢翻第二页的集子」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the volume on the shelf beside the sanctuary window whose second page no one dares to open.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿侧窗书架上那只从没有人翻开第二页的集子。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the twenty-ninth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第二十九日。

---

## I · The Side Window

The side window of the sanctuary is the only window the head of the night watch ever stops at — beside it are deep wooden chests from the Institute's shelf of closing manuscripts.

One of them stands a little shorter than the others; it is not pushed flush against the wall and is covered in dark cloth for years on end — it has no carving on it, and it has never been numbered.

**锚句**：祠殿侧窗书架上摆着一只深木箱，每个人都怕碰到它。
**Anchor sentence**: beside the sanctuary window stands a deep wooden chest that everyone fears to touch.

---

## II · The First Page

What anyone sees is the first page; it is open.

It charts the seven winds that enter the fog harbor — the arcs of the swells, how the seventh step of the lighthouse has been worn into light by the salt — the head of the watch still carries its smallest reading against the palm of his hand, trying to confirm what he has already confirmed. A page written too precisely to be comfortable.

**锚句**：第一页画着海风从雾港吹来的七个方向。灯塔七级台阶的风向都被记住了。
**Anchor sentence**: the first page charts the seven winds that enter the fog harbor; the seventh step of the lighthouse remembers every one.

---

## III · No One Opens It

The head of the watch confesses that none of them know what the second page says.

Forty-one years ago, when the previous head of the watch set the chest there, he posted a small slip of paper on top:
"Inside is nothing but true records; they wait for whoever comes later to close it."

Everyone who read the note halted for a moment — not fear of trespass, but unwillingness to accept that an unspecified closing awaited them.

**锚句**：没被打开的第二页上，只有一条抄本师们都认得的横线。
**Anchor sentence**: on the second, unopened page rests a horizontal stroke every copyist recognises.

---

## IV · Waxed Each Year

The copyists revisit the chest regularly, yet never open it — each time they only renew its coat of beeswax, by the manual.

He says: not for water, but never for being opened again — the words must remain on the table here, not carried away in someone's palm. His kit holds beeswax and a lamp, no gloves — he comes only when no one can see his hand.

**锚句**：抄本师定期给它上蜡，只守着不打开它。
**Anchor sentence**: the copyists wax it on a schedule, yet never open it themselves.

---

## V · Everyone Who Comes Away Returns

The head of the watch laid down one rule: every newly handed-over night watcher must first read the paper slip on the chest, then stamp the inside of the lid with the seal of "cheng" — the seal is not a word but a frame. Whoever stamps it does not yet "take" the chest — they enter the line of succession that follows it; after which, they recognize both the seal and the chest.

Two centuries later, the stamps on the lid themselves formed a small peak.

**锚句**：值更长说，翻开第二页的人，自己回头补完一页。
**Anchor sentence**: the head of the watch said whoever opens the second page must write the missing one themselves.

---

## VI · On the Day of the Dissolution

On the day the 41st Convocation dissolved, every person in the Institute passed in a single line — no one paused.

The copyists said, as they left: "It is not fed by water, nor chased by the wind; it is the lamp that did not go out on the day the Convocation dissolved — it still burns, and no one can see it."

The next morning the chest had returned to its corner, owned by no one.

**锚句**：记得的第四十一次大会散会，抄本师们又把它放回原位。
**Anchor sentence**: after the 41st Convocation dissolved, the copyists put the volume back exactly where it had been.

---

## VII · Mapping（Echo No. 61 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the side window · the second page · the closing · the wax seal · the Covenant of Handover | 一、二、三、四、五、六 |
| geography | the side window · the seventh step of the lighthouse · the fog harbor | 一、二、三、四、五、六 |
| characters | the head of the watch · the copyists · the previous head · the newly handed-over watcher | 一、三、四、五、六 |
| story | the volume at the side window · Echo No. 61 | 全篇 |
| items | the deep chest · the beeswax · the seven winds · the seventh step · the cheng seal | 一、二、三、四、五、六 |
| history | After the 41st Convocation · the twenty-ninth day of the autumn-tide month | 三、四、五、六 |

> 没有名字的木箱不属于任何集子——它就是整本书籍的扉页。
> A chest without a name belongs to no shelf — it is the title page of the whole library.
`,
  },
  {
    order: 62,
    slug: 'echo-062-the-borrow-light-volume-in-the-library',
    titleZh: '祠殿书库那本不要灯也会亮的借光本',
    titleEn: 'The Borrow-Light Volume in the Sanctuary Library That Shines Without a Lamp',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第三十二日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the thirty-second day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 62): The Borrow-Light Volume in the Sanctuary Library That Shines Without a Lamp

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿书库最高那一柜：没封面、没题签、却在没有灯的时候字会自己亮起的一只集子。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the topmost shelf of the Sanctuary Library: a book with no cover and no inscription whose characters lift themselves into the dark.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第三十二日。
> Era: the Institute — after the 41st Convocation; the thirty-second day of the autumn-tide month.

---

## 一 · 最高的一柜

祠殿书库最高一层，是不用灯火也要爬到梯子顶上才拿得到的位置。里边只有那一只集子，没有人记得它什么时候来的——它比抄本师的父亲还早。

木箱里边没有绣花囊，只有一副空心的金属扣。值更长一代之间，代代规定只有在值完最后一岗的人，才有权力去看这一本。

**锚句**：祠殿书库最高那一柜，摆着一只没有封面的集子。
**Anchor sentence**: on the topmost shelf of the Sanctuary Library sits a volume with no cover.

---

## 二 · 借光

每当夜深人静、关着灯，伙房的人经过书库时——都能看到书架上某一个位置透出一丝微光。

不是书架缝隙漏出来的——那是一本集子在内部把字迹自己写了出来。抄本师说那是"借光"——火没借什么别人的，字迹自己直接从暗中显化出来。

**锚句**：它在没有灯的时候，字也会自己亮起来。
**Anchor sentence**: without any lamp, the characters of the volume lift themselves into the dark.

---

## 三 · 封面上的字

集子的封皮朝里，不是不用印字，是有印字但抄本师们没人认得那张拓片的字样。

有的抄本师说那是灯塔投影，有的说那是第四十一次大会散会之前第一个散会的家族纹路。

但所有人都认出了同一个故事——只要此集在某个不亮的晚上被打开，里边的字就会浮出来。

**锚句**：封面上有一枚没人认得的印记，代代都翻过，没人开封。
**Anchor sentence**: on the cover rests a mark no one has ever recognised, which generation after generation has flipped without opening.

---

## 四 · 抄本师进来试过

有一位抄本师在摸到年老时，最后一次经过那个柜时，摸座了封皮——字迹浮上来了一行，他记了下来——没记全，只记了几个字——"雾港"和"不灭"。

他出来后跟值更长说：那里面有个故事是好的。值更长说：那就封了吧。说完后，两个人再也没谈过它。

**锚句**：抄本师试过进来，只记住了「雾港」和「不灭」。
**Anchor sentence**: the copyists came once to witness; they remembered only "Fog Harbor" and "never extinguished".

---

## 五 · 烛包

其后几代抄本师把结论写在公示牌上：

「这本集子不要碰——封面借光，内页不可看。」

每一个经过那口书架的人都要走过去放下一只双手，但没人把它们移动——从第一次摆出来到现在，那一只集子没有移动过一下位置。

**锚句**：它没有封面，但它能借光，但没有人去翻它。
**Anchor sentence**: it has no cover, it can borrow light, yet no one ever turned it over.

---

## 六 · 第四十一次大会散会之后

第四十一次大会散会后三天，某个夜里书库全灭，灯影借光本自己升起来了——抄本师听到的。

他们后来才敢悄悄去看——字迹还在，灯影不减少一维。值更长带灯去看，灯不够强，要字自己发光。

**锚句**：第四十一次大会散会之后，某一夜灯影借光本自己浮起来了。
**Anchor sentence**: after the 41st Convocation dissolved, on one night the borrow-light volume rose on its own.

---

## 七 · 映射（回响六十二章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 灯影借光 · 书库 | 一、二、三、四、五、六 |
| geography | 祠殿书库 · 灯塔第七级台阶 | 一、三、四 |
| characters | 抄本师 · 值更长 | 四、五、六 |
| story | 借光本 · 回响（其六十二） | 全篇 |
| items | 深木箱 · 封皮 · 不字拓片 | 一、二、三、四、五、六 |
| history | 第四十一次大会散散之后 · 秋潮月第三十二日 | 三、四、五、六 |

> 集子自己会发光的时候，就别再问它是不是书——它是雾港收到的一封寄存。
> When the volume itself lights up, do not ask whether it is a book — it is a parcel the fog harbor was asked to keep.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其六十二）「祠殿书库那本不要灯也会亮的借光本」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the topmost shelf of the Sanctuary Library: a book with no cover and no inscription whose characters lift themselves into the dark.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿书库最高那一柜：没封面、没题签、却在没有灯的时候字会自己亮起的一只集子。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the thirty-second day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第三十二日。

---

## I · The Topmost Shelf

The Sanctuary Library has a topmost floor, reachable only by ladder. Up there rests a single chest, older than any of the copyists' fathers; what is inside no one has named.

The box has no embroidered sleeve, only a hollow metal clasp. One rule of the head of the night watch: only the last watcher alive of the outgoing generation has leave to touch it.

**锚句**：祠殿书库最高那一柜，摆着一只没有封面的集子。
**Anchor sentence**: on the topmost shelf of the Sanctuary Library sits a volume with no cover.

---

## II · Borrowing Light

Whenever the night falls and the lamps are put out, a faint light can be seen near one shelf.

It does not slip out through a gap; the characters inside the book cast their own light. The copyists call it "borrowing light" — no lamp is being borrowed; the ink itself is manifesting directly from the dark.

**锚句**：它在没有灯的时候，字也会自己亮起来。
**Anchor sentence**: without any lamp, the characters of the volume lift themselves into the dark.

---

## III · The Mark on the Cover

The closed cover bears a few characters no one could decipher — not for lack of trying, but for lack of a single fit.

Some copyists said it was the lighthouse's shadow; others, the last household crest of the family dissolved in the 41st Convocation.

All agreed on one thing: the moment the book is opened on a dark night, the characters rise into visibility.

**锚句**：封面上有一枚没人认得的印记，代代都翻过，没人开封。
**Anchor sentence**: on the cover rests a mark no one has ever recognised, which generation after generation has flipped without opening.

---

## IV · The Trial

Once, when one copyist shuffled past the topmost shelf for the last time, he touched the cover and saw, in fading light, only a couple of phrases — "Fog Harbor" and "never extinguished".

He told the head of the watch about what he had seen. The head of the watch replied: then let it rest, and never told them more.

**锚句**：抄本师试过进来，只记住了「雾港」和「不灭」。
**Anchor sentence**: the copyists came once to witness; they remembered only "Fog Harbor" and "never extinguished".

---

## V · The Waxed Notice

The successors wrote on the bulletin board:
"This volume is not to be touched — the cover borrows light; the pages are off-limits."

Everyone set their palms on the shelf next to it, but no one ever moved it — from the day it was first placed, it has never shifted an inch.

**锚句**：它没有封面，但它能借光，但没有人去翻它。
**Anchor sentence**: it has no cover, it can borrow light, yet no one ever turned it over.

---

## VI · After the 41st Convocation Dissolved

Three days after the 41st Convocation closed, on one night the entire library went dark, and the borrow-light volume floated up of its own — the copyists heard the rustle.

When they finally went up to check, the characters had not left — only the light had become one dimension lower; the head of the watch brought a lamp, but the lamp was insufficient to show anything.

**锚句**：第四十一次大会散会之后，某一夜灯影借光本自己浮起来了。
**Anchor sentence**: after the 41st Convocation dissolved, on one night the borrow-light volume rose on its own.

---

## VII · Mapping（Echo No. 62 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | borrow-light · the library · will of the fog | 一、二、三、四、五、六 |
| geography | the Sanctuary Library · the lighthouse steps | 一、三、四 |
| characters | the copyists · the head of the watch | 四、五、六 |
| story | the borrow-light volume · Echo No. 62 | 全篇 |
| items | the wooden chest · the cover · the unread rubbing | 一、二、三、四、五、六 |
| history | After the 41st Convocation · the thirty-second day of the autumn-tide month | 三、四、五、六 |

> 集子自己会发光的时候，就别再问它是不是书——它是雾港收到的一封寄存。
> When the volume itself lights up, do not ask whether it is a book — it is a parcel the fog harbor was asked to keep.
`,
  },
  {
    order: 63,
    slug: 'echo-063-the-ever-burning-lamp-in-the-eastern-wing',
    titleZh: '潮候院东偏院那盏百年不曾熄过的油灯',
    titleEn: 'The Ever-Burning Lamp in the Eastern Wing That No One Has Put Out',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第三十五日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the thirty-fifth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 63): The Ever-Burning Lamp in the Eastern Wing That No One Has Put Out

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院东偏院门窗上方那一盏据记从未熄过的灯。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the lamp above the door of the east wing that, by every account, has not been put out once.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第三十五日。
> Era: the Institute — after the 41st Convocation; the thirty-fifth day of the autumn-tide month.

---

## 一 · 祠殿东偏院

祠殿东偏院是抄本师们日常穿行的一段回廊——两头没有门，只是风的通道。

墙是用最薄的白石板干砌的，间缝里有一次潮汐送过来的盐花。

**锚句**：东偏院走廊两端都没有门，只是一段风顺着过去。
**Anchor sentence**: the corridor at the east wing has no door at either end — only a passage for the wind.

---

## 二 · 那盏灯

入口门楣上方悬着一盏油灯——抄本师的手迹里说它是"在最高位置为所有人记着好的那一盏"。

第一枚炷是谁放上去的，抄本师的手稿里只有一句——"伏笔"。

**锚句**："祠殿东偏院入口上方悬着一盏油灯。"
**Anchor sentence**: "above the entrance of the east wing hangs a lamp."

---

## 三 · 百年不熄

百多年没人换过；百多年它自己烧。

灯芯是写在一段经卷里夹着的。百年的气流从回廊两端穿过——灯火仍然是直的。

**锚句**：它已经烧了连续一百二十年，没有人来加过油。
**Anchor sentence**: it has burned continuously for one hundred and twenty years; no one has added oil.

---

## 四 · 廿一更

抄本师私底下叫它"廿一更"。一更是半夜，它跨过了所有的更。

值更长年轻时在一个月圆之夜爬上梯子亲眼看过——灯的火焰不摇动，但温度会升高。

**锚句**：值更长叫它"廿一更"，据说它事实上已经烧过了所有的时间。
**Anchor sentence**: the head of the watch called it the twenty-one watches; by every measure it has burned through all of them.

---

## 五 · 每一百年重新点燃

值更长换班，抄本师换册，火焰仍在。

第四十一次大会散会之后，没人再去记录这盏灯有多亮——他们不再数灯，他们数夜的余留字迹。

**锚句**：每一个百年它都会重新点亮——那百年已经过完一次了。
**Anchor sentence**: once every hundred years it is re-lit — the hundred years are already done once.

---

## 六 · 秋潮月散会之后

第四十一次大会散会已经过去三个月——灯仍然在烧。

抄本师们说：它不是火需要重新点——它是某种被遗忘的寄托里面装的一层自己的命。

**锚句**：它只是一直烧——不需要点，大家就知道了。
**Anchor sentence**: it simply keeps burning — no one lights it; everyone knows it is lit.

---

## 七 · 映射（回响六十三章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 长明 · 廿一更 · 油灯 | 一、二、三、四、五、六 |
| geography | 东偏院 · 叙事回廊 · 祠殿 | 一、二、六 |
| characters | 抄本师 · 值更长 | 二、四、五、六 |
| story | 长明油灯 · 回响（其六十三） | 全篇 |
| items | 油灯 · 灯芯 · 经卷 | 二、三、四、五 |
| history | 第四十一次大会散会之后 · 秋潮月第三十五日 | 六 |

> 灯亮着不是为了别人的路好走，是为了灯自己不会忘记安置在那儿的意图。
> The lamp burns not to light the passage for others — it burns to remember its own purpose for being set there.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其六十三）「潮候院东偏院那盏百年不曾熄过的油灯」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the lamp above the door of the east wing that, by every account, has not been put out once.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院东偏院门窗上方那一盏据记从未熄过的灯。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the thirty-fifth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第三十五日。

---

## I · The Eastern Wing

The east wing of the sanctuary is a corridor that the copyists traverse every day — both ends open, a wind's passage.

The walls are dry-laid thin white limestone; the joints carry salt-flowers the tide left behind once.

**锚句**：东偏院走廊两端都没有门，只是一段风顺着过去。
**Anchor sentence**: the corridor at the east wing has no door at either end — only a passage for the wind.

---

## II · That Lamp

Above the lintel of the entrance hangs an oil lamp — a copyist's hand, in the margins of the records, calls it "the one posted at the highest place to remember everything."

Who placed the first wick, the manuscripts record only one word: "seed".

**锚句**：祠殿东偏院入口上方悬着一盏油灯。
**Anchor sentence**: above the entrance of the east wing hangs a lamp.

---

## III · Two Hundred Years

No one has changed it in a hundred and twenty years; it simply burns.

Its wick is written into a scroll carried between the bindings; a hundred and twenty years of air currents through both ends — the flame still stands straight.

**锚句**：它已经烧了连续一百二十年，没有人来加过油。
**Anchor sentence**: it has burned continuously for one hundred and twenty years; no one has added oil.

---

## IV · The Twenty-One Watches

The copyists, in private, call it the "twenty-first watch". A single watch is half a night; it outlasted all of them.

A young head of the night watch climbed a ladder on a full moon and looked — the flame did not flicker, yet the temperature rose.

**锚句**：值更长叫它"廿一更"，据说它事实上已经烧过了所有的时间。
**Anchor sentence**: the head of the watch called it the twenty-one watches; by every measure it has burned through all of them.

---

## V · The Hundred-Year Rekindling

The head of the watch changes shifts; the copyists rebind their journals; the flame stays.

After the 41st Convocation dissolved, no one kept count of how bright it was — they did not tally light; they tallied what was left on the pages.

**锚句**：每一个百年它都会重新点亮——那百年已经过完一次了。
**Anchor sentence**: once every hundred years it is re-lit — the hundred years are already done once.

---

## VI · After the 41st Convocation Dissolved

Three months ago the 41st Convocation dissolved, and the lamp still burns.

The copyists say it is not a fire asking to be lit — it is itself a purpose that was left inside somebody else's obligation.

**锚句**：它只是一直烧——不需要点，大家就知道了。
**Anchor sentence**: it simply keeps burning — no one lights it; everyone knows it is lit.

---

## VII · Mapping（Echo No. 63 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the long-burning flame · the twenty-one watches · the lamp | 一、二、三、四、五、六 |
| geography | the eastern wing · the corridor · the sanctuary | 一、二、六 |
| characters | the copyists · the head of the night watch | 二、四、五、六 |
| story | the ever-burning lamp · Echo No. 63 | 全篇 |
| items | the lamp · the wick · the scroll | 二、三、四、五 |
| history | After the 41st Convocation · the thirty-fifth day of the autumn-tide month | 六 |

> 灯亮着不是为了别人的路好走，是为了灯自己不会忘记安置在那儿的意图。
> The lamp burns not to light the passage for others — it burns to remember its own purpose for being set there.
`,
  },
  {
    order: 64,
    slug: 'echo-064-the-split-shadowed-pillar',
    titleZh: '潮候院祠内那根影子自分为两半的石柱',
    titleEn: 'The Split-Shadowed Pillar Inside the Sanctuary That Made Everyone Forget Who They Were',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第三十八日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the thirty-eighth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 64): The Split-Shadowed Pillar Inside the Sanctuary That Made Everyone Forget Who They Were

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院祠殿内正中那根影子永远分为两股的石柱。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the central stone pillar inside the sanctuary — the one whose shadow is always in two halves.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第三十八日。
> Era: the Institute — after the 41st Convocation; the thirty-eighth day of the autumn-tide month.

---

## 一 · 祠殿正中

祠殿是潮候院最高的那一间，只供值更长一个人进。

正中一根石柱——量过它直径一米二，型状是两头稍窄、中间稍微外鼓的。没听说它有来历。

**锚句**：祠殿是潮候院最高的那一间，只有值更长一个人能进。
**Anchor sentence**: the sanctuary is the tallest of the Institute's rooms, and only the head of the watch may enter it.

---

## 二 · 影子的两股

起阳光，柱身分影子——一个朝南歪左，一股朝北偏右，好像被从中间掰开似的。

抄本师说：光线怎么打入来，影子就怎么分开，什么时候朝一个方向都不会动。

**锚句**：影子总是朝南偏左和北偏右各自独立。
**Anchor sentence**: the pillar's shadow always leans north-west and south-east at the same time.

---

## 三 · 谁也记不得刚刚在说什么

值更长的新人代代都记不住最后的告别词。抄本师说那根石柱的分影落到地上，大致会让自己的语气变低——甚至他刚刚要说的两句就只剩下一句。

一旦谁走过石柱，日历骂人都叫不上名字。

**锚句**：谁经过石柱，谁就忘记自己刚才想问什么。
**Anchor sentence**: anyone who steps past the pillar forgets what they were about to ask.

---

## 四 · 老事

四百年前，大会散会前三天，有一位抄本师忘记了他来这里来做什么。他闭上眼，听见了石柱里发出一阵风声。

抄本师后来把这件事写进《图书》里——"石柱鸣"。

**锚句**：抄本师后来把它的事入典——"石柱鸣"。
**Anchor sentence**: the copyists recorded it later — "the pillar's note".

---

## 五 · 去质问

抄本师想拆开石柱来看底座，值更长不允许。抄本师说拆帽，值更长不答。抄本师第二次递了它——"露出去看看里边没有字？"

值更长说了一样的话。

**锚句**：抄本师想打开石柱看看里边有什么——值更长不让他动。
**Anchor sentence**: the copyists asked whether the base of the pillar could be opened; the head of the watch said no.

---

## 六 · 灯火在散尽之后

第四十一次大会散会，抄本师在最后的日子里做了一件事——他在他父亲名字被改掉的那部分字迹石底，刻到了柱上——一个"·"。

如果这件事今后被写进《图书》，抄本师一代以后的人会说那是一个句号。

**锚句**：第四十一次大会散会之后，抄本师偷偷在柱脚旁边刻了一个「·」。
**Anchor sentence**: after the 41st Convocation dissolved, the copyists secretly engraved a single full stop at the base of the pillar.

---

## 七 · 映射（回响六十四章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 石柱鸣 · 分影 · 句号 · 值更长 | 一、二、三、四、五、六 |
| geography | 祠殿 | 一、五 |
| characters | 抄本师 · 值更长 · 抄本师的父亲 | 二、三、四、五、六 |
| story | 分影 · 回响（其六十四） | 全篇 |
| items | 石柱 · 刻书 · 句号 | 一、二、三、四、五、六 |
| history | 第四十一次大会散会之后 · 秋潮月第三十八日 | 六 |

> 影子不会是错的；影子的偏向总是控了两种东西地，而石柱不偏。
> The shadow is never wrong — it splits exactly into two; the pillar itself leans toward neither.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其六十四）「潮候院祠内那根影子自分为两半的石柱」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the central stone pillar inside the sanctuary — the one whose shadow is always in two halves.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院祠殿内正中那根影子永远分为两股的石柱。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the thirty-eighth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第三十八日。

---

## I · Inside the Sanctuary

The sanctuary is the tallest of the Institute's rooms, and only the head of the watch may enter it.

At its centre stands a single stone pillar — its diameter one and two-tenths metre, tapering at both ends and slightly bulging at the middle. No one has ever heard where it came from.

**锚句**：祠殿是潮候院最高的那一间，只有值更长一个人能进。
**Anchor sentence**: the sanctuary is the tallest of the Institute's rooms, and only the head of the watch may enter it.

---

## II · Two Halves of the Same Shadow

When the light strikes, the shadow always splits — a lean to the south-west and a lean to the north-east, as though the pillar had been cleaved in its middle.

The copyists say: the rays enter at angles, and the shadow splits accordingly; never once have both halves shared one direction.

**锚句**：影子总是朝南偏左和北偏右各自独立。
**Anchor sentence**: the pillar's shadow always leans north-west and south-east at the same time.

---

## III · No One Remembers What They Came to Ask

Each new watcher who crosses the pillar forgets the final words of their own farewell. The copyists say the pillar's shadow falls low across the ground and hushes their voice — sometimes they are left with only one sentence.

Whoever passes the pillar cannot recall why they stood there in the first place.

**锚句**：谁经过石柱，谁就忘记自己刚才想问什么。
**Anchor sentence**: anyone who steps past the pillar forgets what they were about to ask.

---

## IV · Four Hundred Years Ago

Four hundred years ago, three days before the Convocation dissolved, a copyist forgot why he had come.  He closed his eyes and heard a sound from inside the pillar, like wind.

He wrote about it afterwards — "the pillar's note".

**锚句**：抄本师后来把它的事入典——"石柱鸣"。
**Anchor sentence**: the copyists recorded it later — "the pillar's note".

---

## V · Who Asks to Open It

The copyists asked whether the base of the pillar could be opened. The head of the watch said no. They asked again — "even if only to check?"

The head of the watch said the same thing again.

**锚句**：抄本师想打开石柱看看里边有什么——值更长不让他动。
**Anchor sentence**: the copyists asked whether the base of the pillar could be opened; the head of the watch said no.

---

## VI · After the Dissolution

On the last day of the 41st Convocation dissolved, the copyist engraved one final mark at the foot of the pillar: a single dot.

His father's name had been erased from the records; the dot was his answer to that erasure.

**锚句**：第四十一次大会散会之后，抄本师偷偷在柱脚旁边刻了一个「·」。
**Anchor sentence**: after the 41st Convocation dissolved, the copyists secretly engraved a single full stop at the base of the pillar.

---

## VII · Mapping（Echo No. 64 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the split shadow · the pillar's note · the dissolution dot · the head of the watch | 一、二、三、四、五、六 |
| geography | the sanctuary · inside the sanctuary | 一、五 |
| characters | the copyists · the head of the watch · the copyist's father | 二、三、四、五、六 |
| story | the split-shadowed pillar · Echo No. 64 | 全篇 |
| items | the pillar · the dot · the carving | 一、二、三、四、五、六 |
| history | After the 41st Convocation · the thirty-eighth day of the autumn-tide month | 六 |

> 影子不会是错的；影子的偏向总是控了两种东西地，而石柱不偏。
> The shadow is never wrong — it splits exactly into two; the pillar itself leans toward neither.
`,
  },
  {
    order: 65,
    slug: 'echo-065-the-radical-only-column-on-the-east-wall',
    titleZh: '祠殿面东墙上那一排谁都不认得的偏旁',
    titleEn: 'The Radical-Only Column on the East Wall of the Sanctuary',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四十一日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the forty-first day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 65): The Radical-Only Column on the East Wall of the Sanctuary

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿面东墙上那一排只有偏旁没有字的记录——每夜放一笔，每笔都戴上一层桐油。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the column of partial characters on the east wall of the sanctuary — one stroke each night, sealed in tong oil.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四十一日。
> Era: the Institute — after the 41st Convocation; the forty-first day of the autumn-tide month.

---

## 一 · 面东墙

祠殿朝东的一面墙称为"藏盐墙"，是最安静的一块。

值更提供档案查阅时，抄本师们每取出一卷，要先朝东跄一下、然后才能开卷——这是他们对那面墙的敬意，却说不出来。

**锚句**：祠殿朝东的一面墙称为"藏盐墙"。
**Anchor sentence**: the sanctuary's east-facing wall is called the Salt-Hiding Wall.

---

## 二 · 偏旁

墙上的纹路不是完整的字，只有偏旁——"氵"、"石"、"禾"……没有人拼出过一个完整的汉字，却可以数出来已经 715 个偏旁了。

百生的抄本师们每人每晚在墙上盖一层桐油——捂住它、让盐水再慢慢侵透进去、天亮才擦净又盖一层。

**锚句**：墙上的字只有偏旁，没有一个完整的字。
**Anchor sentence**: there is not a single whole character on the wall, only radicals.

---

## 三 · 每晚一个

没有人要求放如何排。抄本师 XX 第一个《言者无归记册》说，值更长把书版放在柜子底层，让它们自己往上爬。

抄本师门说是每晚按规矩排一次，偏离规矩就废了——但没人有异议，因为它自己就是规矩。

**锚句**：每个晚上谁也不知道下笔的是哪一个偏旁。
**Anchor sentence**: nobody knows in advance which radical the night will receive.

---

## 四 · 桐油的光

桐油一涂，字就呈半米内的蓝绿颜色。桐油有自己独有的味道，被代代抄写的墙壁所吸收。

后来值更长说那是"潮候院世代交替的口令——所有字被洇水的气息垒在一起了。"

**锚句**：桐油涂上去，字就显蓝绿——潮候院的口令味道粘进了墙壁。
**Anchor sentence**: once the oil is on, the strokes shine blue-green — the essence of the harbor seeps into the wall.

---

## 五 · 千两百杯桐油

有抄本师数过院中现用的桐油罐：四十五年六十九罐，一共一百三十一罐半。

每罐一百两桐油——一共补了两盘验。这个数——抄本师说——和长明灯那灯费差不了几两。

**锚句**：每一罐桐油的两数，加起来没有人来算过。
**Anchor sentence**: the sum of the tong oil in every jar, no one has added up.

---

## 六 · 大会散会之后

第四十一次大会散会之后一个月，抄本师们不再去覆油了。

值更长说那也不能开卷——册子里的东西还没到读。

**锚句**：大会散会了，桐油也停了——那是潮候院还没到的时候。
**Anchor sentence**: after the Convocation dissolved, the oiling ceased — the Institute is not yet of age.

---

## 七 · 映射（回响六十五章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 偏旁 · 藏盐墙 · 桐油 · 大会散会 | 一、二、三、四、五、六 |
| geography | 祠殿 · 面东墙 | 一、二 |
| characters | 抄本师 · 值更长 | 一、二、三、四、五、六 |
| story | 偏旁列举 · 回响（其六十五） | 全篇 |
| items | 桐油 · 偏旁 · 册子 | 一、二、三、四、五 |
| history | 第四十一次大会散会之后 · 秋潮月第四十一日 | 六 |

> 那些字，也许不是给任何人读的——它们是潮候院为自己记住怎么沉没写的。
> Those marks may not be for any reader — they are how the Institute remembers the art of sinking.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其六十五）「祠殿面东墙那一排谁也不认得的偏旁」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the column of partial characters on the east wall of the sanctuary — one stroke each night, sealed in tong oil.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给祠殿面东墙上那一排只有偏旁没有字的记录——每夜放一笔，每笔都戴上一层桐油。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the forty-first day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四十一日。

---

## I · The Salt-Hiding Wall

The east-facing wall of the sanctuary is called the Salt-Hiding Wall; the quietest one in the whole Institute.

Whenever a copyist retrieves a scroll for reference, they kowtow to the east first, then open the page — nobody has asked why, and nobody answers.

**锚句**：祠殿朝东的一面墙称为"藏盐墙"。
**Anchor sentence**: the sanctuary's east-facing wall is called the Salt-Hiding Wall.

---

## II · Radicals Only

The strokes on that wall are not characters; they are radicals — "water", "stone", "millet" — no full glyph has ever been formed, yet seven hundred fifteen partials are accounted for.

Day after day, evening after evening, the copyists seal these strokes in tong oil, let the salt slowly seep through, wipe them down at dawn, and seal them again.

**锚句**：墙上的字只有偏旁，没有一个完整的字。
**Anchor sentence**: there is not a single whole character on the wall, only radicals.

---

## III · One per Night

Nobody ever required how this was set up or who decided. The copyists say: the head of the watch placed the bindings in the bottom drawer and they must climb by themselves.

Rules drift — nobody disputes them, because the practice itself is the rule.

**锚句**：每个晚上谁也不知道下笔的是哪一个偏旁。
**Anchor sentence**: nobody knows in advance which radical the night will receive.

---

## IV · The Tongue of Tong Oil

Tong oil, once it dries, turns the strokes an aqua blue-green. Its faint odour has seeped into the wall over decades.

The head of the night watch called it "the Institute's dialect — all the characters have been soaked in the same salt-water breath."

**锚句**：桐油涂上去，字就显蓝绿——潮候院的口令味道粘进了墙壁。
**Anchor sentence**: once the oil is on, the strokes shine blue-green — the essence of the harbor seeps into the wall.

---

## V · A Thousand Liangs of Tong Oil

A copyist once counted the jars of tong oil presently in the Institute: over forty-five years, sixty-nine jars, a hundred thirty-one and a half total.

Each jar one hundred liangs of oil — and the bill, the copyists said, could not be the same as the lamp's own consumption.

**锚句**：每一罐桐油的两数，加起来没有人来算过。
**Anchor sentence**: the sum of the tong oil in every jar, no one has added up.

---

## VI · After the Convocation Dissolved

A month after the 41st Convocation dissolved, the copyists ceased applying oil.

The head of the night watch said: the records have not yet arrived at their hour; the pages must not yet be opened.

**锚句**：大会散会了，桐油也停了——那是潮候院还没到的时候。
**Anchor sentence**: after the Convocation dissolved, the oiling ceased — the Institute is not yet of age.

---

## VII · Mapping（Echo No. 65 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the Radicals · the Salt-Hiding Wall · tong oil · dissolution | 一、二、三、四、五、六 |
| geography | the sanctuary · the east-facing wall | 一、二 |
| characters | the copyists · the head of the night watch | 一、二、三、四、五、六 |
| story | the radical column · Echo No. 65 | 全篇 |
| items | tong oil · radicals · scrolls | 一、二、三、四、五 |
| history | After the 41st Convocation · the forty-first day of the autumn-tide month | 六 |

> 那些字，也许不是给任何人读的——它们是潮候院为自己记住怎么沉没写的。
> Those marks may not be for any reader — they are how the Institute remembers the art of sinking.
`,
  },
  {
    order: 66,
    slug: 'echo-066-the-sweeper-at-the-gate',
    titleZh: '潮候院大门口那位扫了三十年的扫帚师',
    titleEn: 'The Sweeper Monk at the Institute Gate Who Has Swept for Thirty Years',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四十三日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the forty-third day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 66): The Sweeper Monk at the Institute Gate Who Has Swept for Thirty Years

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院大门口那个扫了三十年门槛不曾言语一句的扫帚师。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the sweeper at the door of the Institute who has swept the threshold for three decades without saying a single word.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四十三日。
> Era: the Institute — after the 41st Convocation; the forty-third day of the autumn-tide month.

---

## 一 · 大门口

潮候院的大门是一道没有锁的双扇木门，门口常年积着海风带来的盐渣和人踩碎的贝壳。

每天早上五点，门扇上会被人敲三下；板子一被敲过，廊下的人就来开门——门开的时候是要值更长在门槛上喷一层薄荷汤的。

**锚句**：大门永远没锁；门每天要被敲三下才开一次。
**Anchor sentence**: the gate is never locked; each morning it opens only after three knocks.

---

## 二 · 扫帚师

扫帚师是潮候院最早的那批人留下来的人——他的名字藏在门口石碑背后——碑上面只一个：「扫」字。

他使用院外的冬青树皮褪下来的竹帚——每年冬天院里的园丁会帮他褪下一捆——他自几十年不用新买的。

**锚句**：扫帚师的竹帚每年褪于院外的冬青树。
**Anchor sentence**: the sweeper's bamboo broom is peeled every winter from the outside holly.

---

## 三 · 三勺

扫完一米门槛后他会坐在门槛上喝三口粥；碗是陶的，灰白的，带一个不完整的环纹——没有人知道这是谁编的图。

有人说他每天扫到那个高度刚好碗口里的粥沐成月亮的形状。

**锚句**：他扫完一米门槛之后，他会喝三口粥。
**Anchor sentence**: after finishing a meter of the threshold he drinks three mouthfuls of porridge.

---

## 四 · 不记得

值更人年岁轻一点的问过他「你多久没听到潮声？」他没有回答；值和值是真的老是真的——他真的没听清。

值更人问「那你是哪一年来潮候院的？」他说不记得——根本没那个印象。

**锚句**：扫帚师什么时候来的潮候院，他自己也不记得了。
**Anchor sentence**: he does not remember when he arrived at the Institute.

---

## 五 · 大贝柱

第四十一次大会散会了那一天，扫帚师停在了门槛上，没有扫下一米——他站在那里直到天完全黑了——然后他把扫帚挂到大贝柱上。

大贝柱在潮候院东北角，平时空无一物。扫帚从此再没人取下——也没有再用。

**锚句**：大贝柱上挂着扫帚师的那把帚；大贝柱在东北角。
**Anchor sentence**: his broom now hangs permanently on the Great Shell Pillar, set in the northeast corner.

---

## 六 · 散会之后

第四十一次大会散会之后第一个月，院里有少部分的抄本师想去把扫帚取下来试试新的——但院长停止这一步，说放下的那把帚已经「到了不在用的地方」。

没人问那是什么样的到了——也没人敢说。

**锚句**：大会散会了，没人再去拿挂在大贝柱上的帚。
**Anchor sentence**: after the Convocation dissolved, nobody dared touch the broom hung upon the Great Shell Pillar.

---

## 七 · 映射（回响六十六章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 扫帚师 · 冬青树皮 · 大贝柱 · 屋角到边 | 一、二、三、四、五、六 |
| geography | 大门 · 东北角大贝柱 · 廊下 | 一、五 |
| characters | 扫帚师 · 值更人 · 抄本师 · 院长 | 一、二、三、四、五、六 |
| story | 扫帚师 · 回响（其六十六） | 全篇 |
| items | 竹帚 · 粥碗 · 大贝柱 | 二、三、五 |
| history | 第四十一次大会散会之后 · 秋潮月第四十三日 | 一、五、六 |

> 扫帚就这么挂着了。也许他哪天回来再去拿；也许再也没有人在它提醒我们它所记住的是什么——持续地不再使用了。
> The broom is hung. Maybe he will return one day to take it; maybe the pillar will simply hold the silence — forever.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其六十六）「潮候院大门口那位扫了三十年的扫帚师」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the sweeper at the door of the Institute who has swept the threshold for three decades without saying a single word.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院大门口那个扫了三十年门槛不曾言语一句的扫帚师。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the forty-third day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四十三日。

---

## I · The Gate

The gate of the Institute is a double-door of timber without any lock, thick with salt dust and broken shells from the feet that cross it.

At five in the morning, three knocks land on the door — and a runner comes to open it — after which the head of the night watch sprays a thin sheet of mint broth across the threshold.

**锚句**：大门永远没锁；门每天要被敲三下才开一次。
**Anchor sentence**: the gate is never locked; each morning it opens only after three knocks.

---

## II · The Sweeper

He is among the very first generation left from the Institute's founding; his own name is carved behind the threshold stone — a single character: "掃" (to sweep).

His broom is peeled each autumn from the bark of the holly trees outside the Institute; he never buys a new one.

**锚句**：扫帚师的竹帚每年褪于院外的冬青树。
**Anchor sentence**: the sweeper's bamboo broom is peeled every winter from the outside holly.

---

## III · Three Mouths

After each meter of threshold he sweeps, he drinks three mouthfuls of porridge from a pale pottery bowl bearing one incomplete ring of glaze — no one remembers who drew it.

Some have said that by the third sip, the surface of the porridge takes the shape of a small moon.

**锚句**：他扫完一米门槛之后，他会喝三口粥。
**Anchor sentence**: after finishing a meter of the threshold he drinks three mouthfuls of porridge.

---

## IV · Does Not Remember

A younger watcher once asked him, "How long is it since you last heard the tide?" He did not answer; whether he was too old to hear or too old to answer, no one knows.

When asked when he arrived at the Institute, he said he does not remember.

**锚句**：扫帚师什么时候来的潮候院，他自己也不记得了。
**Anchor sentence**: he does not remember when he arrived at the Institute.

---

## V · The Great Shell Pillar

On the day the 41st Convocation dissolved, he stopped mid-sweep; the line was never finished. He stood there until the light died, then hung his broom upon the Great Shell Pillar — a landmark set at the northeast corner of the Institute grounds.

The broom has not been touched since.

**锚句**：大贝柱上挂着扫帚师的那把帚；大贝柱在东北角。
**Anchor sentence**: his broom now hangs permanently on the Great Shell Pillar, set in the northeast corner.

---

## VI · After the Dissolution

In the first month after the 41st Convocation dissolved, a few copyists proposed taking the broom down and using it; the editor general refused, saying the broom belongs to "not-in-use".

Nobody asks why; nobody dares say.

**锚句**：大会散会了，没人再去拿挂在大贝柱上的帚。
**Anchor sentence**: after the Convocation dissolved, nobody dared touch the broom hung upon the Great Shell Pillar.

---

## VII · Mapping（Echo No. 66 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the sweeper · the outer holly · the Great Shell Pillar · the corner | 一、二、三、四、五、六 |
| geography | the gate · the northeast corner · the runner's walkway | 一、五 |
| characters | the sweeper · the night watch · the copyists · the head of the Institute | 一、二、三、四、五、六 |
| story | the sweeper · Echo No. 66 | 全篇 |
| items | the bamboo broom · the porridge bowl · the Great Shell Pillar | 二、三、五 |
| history | After the 41st Convocation · the forty-third day of the autumn-tide month | 一、五、六 |

> 扫帚就这么挂着了。也许他哪天回来再去拿；也许再也没有人在它提醒我们它所记住的是什么——持续地不再使用了。
> The broom is hung. Maybe he will return one day to take it; maybe the pillar will simply hold the silence — forever.
`,
  },
  {
    order: 67,
    slug: 'echo-067-the-tidekeeper-of-the-south-east-dock',
    titleZh: '雾港岸边那位白胡子老交长执事',
    titleEn: 'The White-Bearded Tide-Keeper at the Fog Harbor\'s Edge',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四十四日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the forty-fourth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 67): The White-Bearded Tide-Keeper at the Fog Harbor's Edge

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院东南港口那位向海里送鹅卵石的老人：谁都不记得他什么时候来的。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the watchful old man at the Institute's south-east dock who walks the stones of the harbor — no one remembers when he arrived.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四十四日。
> Era: the Institute — after the 41st Convocation; the forty-fourth day of the autumn-tide month.

---

## 一 · 老交长执事

潮候院最古老的一位老交长执事，专管雾港东南港口的潮水进出——没有人记得他叫什么，也没有人记得他什么时候来到的。

值更长每天经过他都要慢下五步——似乎他专门站在自己脚下的石板里，专门不老。

**锚句**：潮候院雾港东南港口的老交长执事专管潮水进出。
**Anchor sentence**: the elder tide-keeper at the south-east dock of the fog harbor manages the in- and-out of the tides.

---

## 二 · 候潮石

每次海潮推上来、退下去——他都按一定的顺序扔石头进海里。

扔进这一块石头，然后立刻回头拿一块别的石头扔进下一节珊瑚水坑里。

**锚句**：每次潮水退了一步，他就扔一块石头入海。
**Anchor sentence**: each time the tide recedes one step, he throws a stone into the sea.

---

## 三 · 挑出来的一块

几十年了，他捡的鹅卵石数量没有人记得了——大概是十万。

其中只有一块是特殊的——他六十岁那一年，从珊瑚水坑里独自挑出来，搁在潮候院祠殿大贝柱旁边，没人敢动的。

**锚句**：他六十岁那一年，从珊瑚水坑里独自挑出一块搁在大贝柱旁边。
**Anchor sentence**: in his sixties, he single-handedly picked one stone out of a coral pool and placed it beside the Great Shell Pillar.

---

## 四 · 没人敢问

几年一次，抄本师上去问他「老交长执事，你这是去哪里了？」

老交长执事回答说「我在学会做潮水的事。」

**锚句**：他说自己学会的是「怎么让潮水听懂它的事情」。
**Anchor sentence**: he answered that he has learned to make the tide understand its own affairs.

---

## 五 · 大会散会之后

第四十一次大会散会之后，潮势上也安静了——老交长执事坐在东岸的沙堆上，望着海。

他嘴里一句话也没说——但是他手里仍然在慢慢地一粒一粒石子——照着他自己的规律收起来了。

**锚句**：第四十一次大会散会之后，他仍然在沙堆上慢慢地一粒一粒捡石子。
**Anchor sentence**: after the 41st Convocation dissolved, he continued, slowly, stone by stone, to gather pebbles on the sand.

---

## 六 · 这一颗

他最终倒了一颗鹅卵石回海里——所有人老身笑了一宗——那又是一只普通的白色鹅卵石。

值更长后来看到了他扔回海里那只鹅卵石的时候——他缓缓起身，没有回头。

**锚句**：这一刻所有人看到他扔回海里那只鹅卵石——他缓缓起身，没有回头。
**Anchor sentence**: that moment everyone saw him toss one pebble back into the sea — he rose slowly and did not look back.

---

## 七 · 映射（回响六十七章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 潮水 · 石头 · 珊瑚水坑 · 大贝柱 · 祠殿 | 一、二、三、四、五、六 |
| geography | 东南港口 · 雾港 · 大贝柱 | 一、三、五 |
| characters | 老交长执事 · 抄本师 · 值更长 · 第四十一次大会 | 一、二、三、四、五、六 |
| story | 鹅卵石 · 回响（其六十七） | 全篇 |
| items | 鹅卵石 · 珊瑚水坑 · 大贝柱 | 一、二、三、五、六 |
| history | 第四十一次大会散会之后 · 秋潮月第四十四日 | 五、六 |

> 一个人往海里扔石头，就是在平衡潮候院自己的潮流。
> One man throws stones into the sea — he is balancing the Institute's own tide.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其六十七）「雾港东南港口那位老交长执事」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the watchful old man at the Institute's south-east dock who walks the stones of the harbor — no one remembers when he arrived.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院东南港口那位向海里送鹅卵石的老人：谁都不记得他什么时候来的。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the forty-fourth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四十四日。

---

## I · The Old Tide-Keeper

The oldest member of the Institute, the elder tide-keeper at the south-east dock, has managed the tide for so many years — no one remembers his name, nor when he arrived.

Every dawn passes he walks a little slower, seemingly held fast to the stones he himself is standing on, permanently ageless.

**锚句**：潮候院雾港东南港口的老交长执事专管潮水进出。
**Anchor sentence**: the elder tide-keeper at the south-east dock of the fog harbor manages the in- and-out of the tides.

---

## II · Stones at Every Turn

Each time the tide slides up and lays back, he tosses a stone into the sea.

Tossed, he reaches for another, places it first into the next coral pool — and then the next pool after that.

**锚句**：每次潮水退了一步，他就扔一块石头入海。
**Anchor sentence**: each time the tide recedes one step, he throws a stone into the sea.

---

## III · The One Stone

For decades, he has tossed so many pebbles into the sea that no one has ever counted them — likely one hundred thousand.

Only one among them is special.  He picked that one out of the coral basin at age sixty and set it beside the Great Shell Pillar — which no one dares to touch.

**锚句**：他六十岁那一年，从珊瑚水坑里独自挑出一块搁在大贝柱旁边。
**Anchor sentence**: in his sixties, he single-handedly picked one stone out of a coral pool and placed it beside the Great Shell Pillar.

---

## IV · The Question No One Asks

Only a few times in life has a copyist dared approach him and ask "elder, what are you doing?"

He answered: "I am learning how to make the tide understand its own affairs."

**锚句**：他说自己学会的是「怎么让潮水听懂它的事情」。
**Anchor sentence**: he answered that he has learned to make the tide understand its own affairs.

---

## V · After the Dissolution

After the 41st Convocation dissolved, the tide went quiet — he sat on the ridge of sand on the east shore, facing the sea.

No words came from his mouth — yet his hand never stopped gathering pebbles, one by one, at his own measured rhythm.

**锚句**：第四十一次大会散会之后，他仍然在沙堆上慢慢地一粒一粒捡石子。
**Anchor sentence**: after the 41st Convocation dissolved, he continued, slowly, stone by stone, to gather pebbles on the sand.

---

## VI · This One Pebble

Eventually he tossed one pebble back into the sea — the harbor one final time — and that pebble was an ordinary white pebble.

None of them reacted.  He rose slowly to his feet, and did not look back.

**锚句**：这一刻所有人看到他扔回海里那只鹅卵石——他缓缓起身，没有回头。
**Anchor sentence**: that moment everyone saw him toss one pebble back into the sea — he rose slowly and did not look back.

---

## VII · Mapping（Echo No. 67 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the tide · the stones · the coral pool · the Great Shell Pillar · the sanctuary | 一、二、三、四、五、六 |
| geography | the south-east dock · the fog harbor · the Great Shell Pillar | 一、三、五 |
| characters | the tide-keeper · the copyists · the head of the watch · the 41st Convocation | 一、二、三、四、五、六 |
| story | the pebbles · Echo No. 67 | 全篇 |
| items | the pebbles · the coral pool · the Great Shell Pillar | 一、二、三、五、六 |
| history | After the 41st Convocation · the forty-fourth day of the autumn-tide month | 五、六 |

> 一个人往海里扔石头，就是在平衡潮候院自己的潮流。
> One man throws stones into the sea — he is balancing the Institute's own tide.
`,
  },
  {
    order: 68,
    slug: 'echo-068-the-potter-of-the-tide-alley',
    titleZh: '潮候院潮水巷里的那位陶人阿栀',
    titleEn: 'The Potter A-Zhi in the Tide Alley of the Institute',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四十六日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the forty-sixth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 68): The Potter A-Zhi in the Tide Alley of the Institute

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院潮水巷里的那位陶人——她每天扛一只木箱，但没有人知道木箱里装什么。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the potter at the Institute's Tide Alley — every morning she carries one wooden crate to its set destination; no one has ever asked what is inside.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四十六日。
> Era: the Institute — after the 41st Convocation; the forty-sixth day of the autumn-tide month.

---

## 一 · 潮水巷

潮候院后廊转入一条人烟较稀的小巷——潮水巷——两边只有对面对面的小屋。

最深处有一间亮着灯的作坊；门口倒挂着一只小小的茶壶，每天早上六点倒挂一刻钟，然后店主才开门。

**锚句**：潮水巷尽头有一间常年亮灯的作坊。
**Anchor sentence**: at the end of the Tide Alley sits a pottery workshop that is rarely dark.

---

## 二 · 木箱

陶人阿栀，四十岁出头，住在作坊里。

每天早上六点半，她把一只木箱——柳条绑的——一步一步扛到偏院，交给值更长的小徒弟，话不多。

**锚句**：阿栀每天把一个木箱扛到偏院交给钟点徒弟。
**Anchor sentence**: A-Zhi carries a crate daily to the Inner Court and hands it to a watch-apprentice.

---

## 三 · 封口

每只箱子的大小都不一样，但封口的方式永远一样：石头压住木板盖子，要压很久。

抄本师私下描述过几次：里面装的是几罐泥做的陶器，被硅胶封口；只要安静，谁都不会被打扰揉碎。

**锚句**：箱子里装的是陶人的泥罐，被封住，很安静。
**Anchor sentence**: inside the crate are clay vessels, sealed so quiet no one hears them fire.

---

## 四 · 退浪石

潮水的时辰到潮水的时辰，阿栀要到港口去捡一种叫退浪石的小石粒——这种退浪石柔软的边缘适合做汤碗；太硬的烧制出来的碗口太粗。

她只选一种最柔软的形状，不能有棱角。

**锚句**：每次潮水退了，她会挑出最柔的那块退浪石。
**Anchor sentence**: each time the tide recedes, she selects the softest stones for the folding-bowls.

---

## 五 · 她的事手册

抄本师读过阿栀的事手册——册子的封面封了线，没写标题——内容就是一行：「成了另一件。」

阿栀写给抄本师的信只有一句：「我们做的事不需要传下去，我愿意只做好。」

**锚句**：她自己说，她不需要把做陶器的事传下去——只做好。
**Anchor sentence**: A-Zhi said she never wanted the story of her vessels to continue — only that each vessel be made right.

---

## 六 · 大贝柱

第四十一次大会散会之后，大贝柱南边一堂放着一个盆——湖岸上漂出一支海玫瑰——烧出来的那一只莓杯，就由阿栀烧制。

她烧好的那只杯子，潮候院至今无人碰；她做的这只杯子就被钉在了大贝柱旁边。

**锚句**：大贝柱旁边放着的那只杯，是陶人阿栀做的。
**Anchor sentence**: the cup placed beside the Great Shell Pillar — A-Zhi fired it.

---

## 七 · 映射（回响六十八章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 陶人阿栀 · 潮水巷 · 汤碗 · 事手册 | 一、二、三、四、五、六 |
| geography | 潮水巷 · 偏院 · 大贝柱 | 一、二、六 |
| characters | 陶人阿栀 · 值更长徒弟 · 抄本师 | 一、二、三、四、五、六 |
| story | 陶人阿栀 · 回响（其六十八） | 全篇 |
| items | 木箱 · 陶具 · 退浪石 | 一、二、三、四、六 |
| history | 第四十一次大会散会之后 · 秋潮月第四十六日 | 六 |

> 潮汐不记得她，这是潮候院一段沉默的好。
> The sea does not remember her; it is a silence the Institute loves.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其六十八）「潮候院潮水巷里的那位陶人阿栀」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the potter at the Institute's Tide Alley — every morning she carries one wooden crate to its set destination; no one has ever asked what is inside.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院潮水巷里的那位陶人——她每天扛一只木箱，但没有人知道木箱里装什么。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the forty-sixth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四十六日。

---

## I · The Tide Alley

A back alley behind the sanctuary leads into a narrower one — the Tide Alley — flanked by small facades only.

Near the deepest end there is a single lit workshop; a tiny teapot hangs upside-down by its door, set down at six in the morning, then the shopkeeper rises.

**锚句**：潮水巷尽头有一间常年亮灯的作坊。
**Anchor sentence**: at the end of the Tide Alley sits a pottery workshop that is rarely dark.

---

## II · The Crate

A-Zhi is in her forties and lives in the workshop.

Every morning at half past six she carries a wooden crate, tied with willow, into the Inner Court, passing it to the watch-apprentice of the head-of-watch; she never says much.

**锚句**：阿栀每天把一个木箱扛到偏院交给钟点徒弟。
**Anchor sentence**: A-Zhi carries a crate daily to the Inner Court and hands it to a watch-apprentice.

---

## III · The Seal

Every crate is of a different size, but the sealing method never varies — a stone presses the lid for a long time.

The copyists privately described it several times: the crate carries a few clay vessels, sealed so tightly by silicone that no one would disturb them firing.

**锚句**：箱子里装的是陶人的泥罐，被封住，很安静。
**Anchor sentence**: inside the crate are clay vessels, sealed so quiet no one hears them fire.

---

## IV · The Tide-receding Stones

At every hour of the tide, A-Zhi goes to the harbor to pick up stones called "tide-receding stones" — their edges are always soft and suit the shaping bowls; anything too hard produces a rim too coarse to hold a sip.

She selects only the softest-shaped stones; nothing with corners.

**锚句**：每次潮水退了，她会挑出最柔的那块退浪石。
**Anchor sentence**: each time the tide recedes, she selects the softest stones for the folding-bowls.

---

## V · Her Own Notebook

The copyists once read A-Zhi's notebook — its cover sewn shut, no title — each line inside simply reads "finished another".

Of everything A-Zhi said to the copyists, only this: "What we do does not need to be passed down; I want only to make each one well."

**锚句**：她自己说，她不需要把做陶器的事传下去——只做好。
**Anchor sentence**: A-Zhi said she never wanted the story of her vessels to continue — only that each vessel be made right.

---

## VI · The Great Shell Pillar

After the 41st Convocation dissolved, a long tray was laid south of the Great Shell Pillar — a single scarlet rose had drifted in from the lake — the bowl A-Zhi fired for that day has never been used since; it was set beside the Great Shell Pillar.

**锚句**：大贝柱旁边放着的那只杯，是陶人阿栀做的。
**Anchor sentence**: the cup placed beside the Great Shell Pillar — A-Zhi fired it.

---

## VII · Mapping（Echo No. 68 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | A-Zhi · the Tide Alley · the folding-bowls · the notebook | 一、二、三、四、五、六 |
| geography | the Tide Alley · the Inner Court · the Great Shell Pillar | 一、二、六 |
| characters | A-Zhi · the watch-apprentice · the copyists | 一、二、三、四、五、六 |
| story | the potter A-Zhi · Echo No. 68 | 全篇 |
| items | the wooden crate · the clay vessels · the tide-receding stones | 一、二、三、四、六 |
| history | After the 41st Convocation · the forty-sixth day of the autumn-tide month | 六 |

> 潮汐不记得她，这是潮候院一段沉默的好。
> The sea does not remember her; it is a silence the Institute loves.
`,
  },
  {
    order: 69,
    slug: 'echo-069-the-tide-keepers-who-never-returned',
    titleZh: '候潮院雾港回声站那一队再没有回来的潮候师',
    titleEn: 'The Tide Keepers Who Sailed into the Fog and Never Came Back',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四十八日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the forty-eighth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 69): The Tide Keepers Who Sailed into the Fog and Never Came Back

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院雾港回声站——那一队潮候师出海之后再也没回来。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the echo post at the fog harbor — the tide-keepers who set out and never returned.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四十八日。
> Era: the Institute — after the 41st Convocation; the forty-eighth day of the autumn-tide month.

---

## 一 · 雾港回声站

雾港回声站是潮候院在雾港里最边缘的一处观察点。

站长姓宋，一上任就听了奶奶的话：「出海可以——但永远别回来过。」

**锚句**：潮候院雾港最外面那个回声站，从上任起就没有过值班长。
**Anchor sentence**: at the outermost echo post of the fog harbor, no post-holder has ever served since its appointment.

---

## 二 · 出海

第六十年的夏天，候潮院选了五位皂绳钓——每人带着一只空的坛子——绕开雷 紫石，从南线向雾港深处走。

他们说要用瓶子把海风装回去——让大会散会的时候确认外面的海。

**锚句**：他们带着五个空坛子去雾港深处——要把海装回来给大会。
**Anchor sentence**: they carried five empty jars into the deep fog to bring the sea back for the Convocation.

---

## 三 · 没有过回信

回声站不是天天有人值班的地方。抄本师一遇见有，隔一旬问一句：「听见回声了？」

后来抄本师说，他已经听了二十年的同一段回声——一直是同一段。

**锚句**：抄本师已经听了二十年的同一段回声——没有变过一声。
**Anchor sentence**: the copyists have been listening to the same echo for twenty years; it has never changed once.

---

## 四 · 五位皂绳钓

没有人知道五位皂绳钓的名字。

第四十一次大会散会那天，抄本师查了一遍名册，说：「名册上没有登这五个人的名，大会无从说它是谁走的。」

**锚句**：名册上没有后来五只皂绳钓的姓名——他们始终叫「五只皂绳」。
**Anchor sentence**: names are missing from the register — since forever the five are called only "the five rope-drawers".

---

## 五 · 没有回来

没有回头，也没有死信。

值更长给抄本师说，「潮候院早晚得派一个人去找他们——但祖上一言不敢随便派。」

**锚句**：四十年以来潮候院没有人愿意问一句没回来的皂绳钓怎么样。
**Anchor sentence**: in forty years not one person of the Institute has asked after the rope-drawers who never returned.

---

## 六 · 回声

抄本师说，每次只听见回声站那边在响；那一段回声一星期响一次；雷阵雨过后会响三天——三天之内自己不知道那回声是什么声音。

他每次下完雨后，都原地思念了一次：到底要怎么等下去。

**锚句**：雷阵雨过后回声站会响三天——声音值更长知道、不知道的一样——值更长永远没听明白。
**Anchor sentence**: after every thunderstorm the echo post sounds three days of noise; the head of the watch both knows and does not know what it is.

---

## 七 · 映射（回响六十九章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 五位皂绳钓 · 回声站 · 空坛子 · 汤候潮院 | 一、二、三、四、五、六 |
| geography | 雾港回声站 · 南线 · 紫石 | 一、二 |
| characters | 站长老宋 · 抄本师 · 值更长 | 一、二、三、四、五、六 |
| story | 皂绳钓 · 回响（其六十九） | 全篇 |
| items | 五只空坛子 · 十根皂绳 · 回声站 | 一、二、三、四、五 |
| history | 第四十一次大会散会之后 · 秋潮月第四十八日 | 一、五、六 |

> 他们说要回去——后来没人说要回来；海风一次吹进回声站。
> They said they would return. No one says "they returned". The wind keeps blowing into the echo post.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其六十九）「雾港回声站那一队再没有回来的潮候师」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the echo post at the fog harbor — the tide-keepers who set out and never returned.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院雾港回声站——那一队潮候师出海之后再也没回来。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the forty-eighth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四十八日。

---

## I · The Echo Post at the Fog Harbor

The echo post is the Institute's outermost lookout on the fog harbor.

The post-holder's name is Song; since he took the post, he has heard only one instruction: "leave, but never return that way."

**锚句**：潮候院雾港最外面那个回声站，从上任起就没有过值班长。
**Anchor sentence**: at the outermost echo post of the fog harbor, no post-holder has ever served since its appointment.

---

## II · Setting Out

In the sixtieth year, five rope-drawers of the Institute were chosen. Each was issued one empty jar. They boarded the boat to the deep fog, the southern route, past the storm-purple reef.

Their declared intent: to gather sea wind into the jars and bring it back for the Convocation.

**锚句**：他们带着五个空坛子去雾港深处——要把海装回来给大会。
**Anchor sentence**: they carried five empty jars into the deep fog to bring the sea back for the Convocation.

---

## III · The Echo

The echo post is not a position with a regular post-holder. Every ten days or so, the copyists ask: "have you heard the echo?"

Eventually the copyists said: they have listened to the same echo for twenty years — it has not varied by a single note.

**锚句**：抄本师已经听了二十年的同一段回声——没有变过一声。
**Anchor sentence**: the copyists have been listening to the same echo for twenty years; it has never changed once.

---

## IV · The Five Rope-Drawers

No one remembers their names.

After the 41st Convocation dissolved, a copyist went through the register and confirmed that the names of these five do not exist anywhere; the Convocation cannot tell who they were.

**锚句**：名册上没有后来五只皂绳钓的姓名——他们始终叫「五只皂绳」。
**Anchor sentence**: names are missing from the register — since forever the five are called only "the five rope-drawers".

---

## V · No Return

They never returned, and no letter came.

The head of the watch said to the copyists: "the Institute must eventually send someone to find them — but no senior has dared appoint one."

**锚句**：四十年以来潮候院没有人愿意问一句没回来的皂绳钓怎么样。
**Anchor sentence**: in forty years not one person of the Institute has asked after the rope-drawers who never returned.

---

## VI · The Echo

After every thunderstorm the echo post sounds for three days; the head of the watch both knows and does not know what it is.

After each storm, the copyist quietly repeated to himself: how shall we wait.

**锚句**：雷阵雨过后回声站会响三天——声音值更长知道、不知道的一样——值更长永远没听明白。
**Anchor sentence**: after every thunderstorm the echo post sounds three days of noise; the head of the watch both knows and does not know what it is.

---

## VII · Mapping（Echo No. 69 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the five rope-drawers · the echo post · the empty jars · the Convocation | 一、二、三、四、五、六 |
| geography | the fog harbor echo post · the southern route · the storm-purple reef | 一、二 |
| characters | post-holder Song · the copyists · the head of the watch | 一、二、三、四、五、六 |
| story | the rope-drawers · Echo No. 69 | 全篇 |
| items | five empty jars · ten ropes · the echo post | 一、二、三、四、五 |
| history | After the 41st Convocation · the forty-eighth day of the autumn-tide month | 一、五、六 |

> 他们说要回去——后来没人说要回来；海风一次吹进回声站。
> They said they would return. No one says "they returned". The wind keeps blowing into the echo post.
`,
  },
  {
    order: 70,
    slug: 'echo-070-the-bowl-nobody-moves-for-thirty-six-springs',
    titleZh: '潮候院东郊码头那只三十六个春昼没人动它的白瓷碗',
    titleEn: 'The White Porcelain Bowl at the East-Grounds Dock That No One Has Touched for Thirty-Six Spring Days',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四十九日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the forty-ninth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 70): The White Porcelain Bowl at the East-Grounds Dock That No One Has Touched for Thirty-Six Spring Days

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院东郊码头那只没人敢动的白瓷碗。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the white porcelain bowl at the east-grounds dock that no hand has moved in thirty-six spring days.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四十九日。
> Era: the Institute — after the 41st Convocation; the forty-ninth day of the autumn-tide month.

---

## 一 · 东郊码头

东郊码头是潮候院最东的一座木头码头——船靠了四百年。

码头南沿有一条石板路平铺到尽头——下首摆着一只白瓷碗，盛满了白鱼生——看起来像真的。

**锚句**：东郊码头是潮候院最东的一座木头码头。
**Anchor sentence**: the east-grounds dock at the Institute's far east is a wooden wharf.

---

## 二 · 三十六个春昼

三十六个春昼以来，这只白瓷碗没人动过。

值更长看了又看——鱼生没干，但手摸也没有腥味——完完全全像放了三十六天的白瓷——干净得奇怪。

**锚句**：这只白瓷碗里的鱼生已经三十六个春昼没人动过。
**Anchor sentence**: this white porcelain bowl of fish has not been moved in thirty-six spring days.

---

## 三 · 陶人阿栀的事手册说过

抄本师私下说过：这是潮候院第一次收到的「待送」。

摆上来的目的没人说清——可能只是错，可能是潮候院从没有做过。

**锚句**：这是祭，不是鱼——潮候院第一次收到「待送」。
**Anchor sentence**: this is an offering, not fish — the first "pending" offering the Institute has ever received.

---

## 四 · 它自己就没干过

如果碗里真的是鱼生——它早就干了，风干。

可它摸起来一直是湿的，闻起来也是湿的——抄本师说，他天天来看，天阴天晴它都是这个样子。

**锚句**：碗里的湿度三十六个春昼没有下降一分。
**Anchor sentence**: the bowl's moisture has not dropped a fraction in thirty-six spring days.

---

## 五 · 那双手

第四十一次大会散会那一天，一名孩子路过——南院来的，年纪很小——他伸出手想摸那只碗口。

就在他伸过来的时候——没人听见风声——他的手似乎又缩了回去，大会散会之后再也没人见过他。

**锚句**：散会那天，一个孩子伸向了白瓷碗——他的手缩了回去。
**Anchor sentence**: on the day of the Convocation's dissolution, a child reached for the bowl — his hand drew back.

---

## 六 · 全院都没人来得及说什么

副院长听说了这件事——下令谁也不能碰这只碗。

可碗至今还在——没人知道它在等什么，潮也没人猜得透停下来的方向——只是它还在，还在。

**锚句**：白瓷碗至今还在东郊码头——没人知道它在等什么。
**Anchor sentence**: the bowl is still there — no one knows what it waits for.

---

## 七 · 映射（回响七十章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 东郊码头 · 白瓷碗 · 祭 · 待送 | 一、二、三、四、五、六 |
| geography | 东郊码头 · 石板路 · 木桥 | 一、二 |
| characters | 值更长 · 抄本师 · 副院长 · 孩子 | 二、三、四、五、六 |
| story | 白瓷碗 · 回响（其七十） | 全篇 |
| items | 白瓷碗 · 石板路 · 鱼生 | 一、二、三、四、五 |
| history | 第四十一次大会散会之后 · 秋潮月第四十九日 | 五、六 |

> 三十六个春昼过去了——风停了——碗还在。
> Thirty-six spring days have passed — the wind ceased — the bowl remains.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其七十）「潮候院东郊码头那只三十六个春昼没人动它的白瓷碗」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the white porcelain bowl at the east-grounds dock that no hand has moved in thirty-six spring days.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院东郊码头那只没人敢动的白瓷碗。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the forty-ninth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第四十九日。

---

## I · The East-Grounds Dock

The easternmost point of the Institute is a wooden dock — boats have berthed there for four hundred years.

A stone slabpath runs all the way to its edge — at the far end sits a white porcelain bowl, a dish of white fish sashimi heaped inside, looking entirely like the real thing.

**锚句**：东郊码头是潮候院最东的一座木头码头。
**Anchor sentence**: the east-grounds dock at the Institute's far east is a wooden wharf.

---

## II · Thirty-Six Spring Days

In thirty-six spring days, no one has moved the bowl.

The head of the watch looked, and looked again — the sashimi has not dried, yet the hand feels no fishiness — exactly like ordinary white porcelain, extraordinarily clean.

**锚句**：这只白瓷碗里的鱼生已经三十六个春昼没人动过。
**Anchor sentence**: this white porcelain bowl of fish has not been moved in thirty-six spring days.

---

## III · What the Potter Wrote Down

The copyists remarked privately: this is the first "pending" offering the Institute has ever received.

No one has stated the purpose — it may be an error; it may be an inaugural offering the Institute has never or not yet received.

**锚句**：这是祭，不是鱼——潮候院第一次收到「待送」。
**Anchor sentence**: this is an offering, not fish — the first "pending" offering the Institute has ever received.

---

## IV · It Has Never Dried

If the bowl contained true sashimi — it would have dried already, in open air and sea-blow.

Yet touching it reveals dampness; smelling it confirms the moisture — the copyists say that in sun or in rain, the bowl has kept the same state for thirty-six days.

**锚句**：碗里的湿度三十六个春昼没有下降一分。
**Anchor sentence**: the bowl's moisture has not dropped a fraction in thirty-six spring days.

---

## V · The Hand That Reached

On the day of the 41st Convocation's dissolution, a child passed by — from the southern court; very young — he raised his hand to reach the bowl's rim.

At the moment his palm moved over the rim, no sound was heard — his hand seemed to retract; no one has seen him since the dispersing of the Convocation.

**锚句**：散会那天，一个孩子伸向了白瓷碗——他的手缩了回去。
**Anchor sentence**: on the day of the Convocation's dissolution, a child reached for the bowl — his hand drew back.

---

## VI · No One Could Speak

The vice-director heard about this and issued an order: no one may touch the bowl.

The bowl remains — no one knows what it waits for; the tide does not disclose where the current has gone — only that it remains, and remains.

**锚句**：白瓷碗至今还在东郊码头——没人知道它在等什么。
**Anchor sentence**: the bowl is still there — no one knows what it waits for.

---

## VII · Mapping（Echo No. 70 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the east-grounds dock · the white porcelain bowl · the pending offering | 一、二、三、四、五、六 |
| geography | the east-grounds dock · the stone slabpath · the wooden wharf | 一、二 |
| characters | the head of the watch · the copyists · the vice-director · the child | 二、三、四、五、六 |
| story | the white porcelain bowl · Echo No. 70 | 全篇 |
| items | the bowl · the slabpath · the sashimi | 一、二、三、四、五 |
| history | After the 41st Convocation · the forty-ninth day of the autumn-tide month | 五、六 |

> 三十六个春昼过去了——风停了——碗还在。
> Thirty-six spring days have passed — the wind ceased — the bowl remains.
`,
  },
  {
    order: 71,
    slug: 'echo-071-the-old-ledger-that-only-says-none',
    titleZh: '潮候院祠殿里那本首行是「没',
    titleEn: 'The Old Ledger in the Sanctuary Whose First Line Reads "None"',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第五十一日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the fifty-first day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 71): The Old Ledger in the Sanctuary Whose First Line Reads "None"

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院祠殿桌上那本只有「没」做开头一页的旧账，已经静置百余年不动一字。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the account book sitting on the sanctuary table since the last Convocation — its first line, still, reads "None".
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第五十一日。
> Era: the Institute — after the 41st Convocation; the fifty-first day of the autumn-tide month.

---

## 一 · 祠殿桌上

祠殿里有一张矮桌，桌上摆着一本旧账簿——皮皮壳破的，纸页缺少一半。

这本旧账簿几百年来从不拿下来——有些来的人说是圣书，有些抄本师说是垃圾。

**锚句**：祠殿桌里有一本旧账——皮皮壳破的纸页。
**Anchor sentence**: inside the sanctuary table lies an old ledger — its leather skin cracked, its pages half gone.

---

## 二 · 第一个字是「没」

这本账簿第一行写得还算清楚：一个"没"字开头；然后是一串名字——都是潮候院曾经的人的名字。

抄本师私下查看，说已经仔细检查过寻找——没有一个字是错的；也没有人愿意在这个名册上出名。

**锚句**：账簿的第一页第一行开头的字是「没」——没有一个字错。
**Anchor sentence**: the first line of the first page begins with "None" — not a single character miswritten.

---

## 三 · 百年不动

这本旧账簿从四十一次大会散会之前一落地就再也没动过。

值更长每隔二十五天看一眼；直到他去世后，抄本师忐忐忑忑的拿起来合上——没人知道她翻到哪页。

**锚句**：这本旧账簿已经百余年没有动过。
**Anchor sentence**: this old account has not moved in over a hundred years.

---

## 四 · 抄本师私下读

有人说，这个名册记的是潮候院欠下的东西——不是钱、不是功德——是「没有还的东西」。

抄本师小声说：「它不是欠钱，是欠一个承诺。」

**锚句**：私底下读过这本账的抄本师说它记录的是「欠一个承诺」。
**Anchor sentence**: the copyist who read its contents privately said it records "a debt of a promise".

---

## 五 · 「没」之前的字

有的老抄本师说：「没」之前还有一个字，但是已经磨掉——只有第一个字「没」还算认得。

他的陈述从来没有被验证过——也没有人帮他照个镜子。

**锚句**：「没」之前还有一个磨掉的第一个字，没人能确定。
**Anchor sentence**: the first character, before the visible "None", has been ground away — no one can say what it was.

---

## 六 · 散会之后

第四十一次大会散会后，抄本师把那本旧账挪到了西边角落——但没有人读它；只有海风偶尔翻一页，它又合上。

它现在的命运只是风书一页。

**锚句**：它现在只是风的书页——没人再去看它。
**Anchor sentence**: it is a page for the wind now — no one opens it anymore.

---

## 七 · 映射（回响七十一章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 没 · 旧账簿 · 欠一个承诺 | 一、二、三、四、五、六 |
| geography | 祠殿内 · 矮桌 | 一 |
| characters | 抄本师 · 值更长 · 抄本师私下 | 二、三、四、五、六 |
| story | 旧账簿 · 回响（其七十一） | 全篇 |
| items | 旧账簿 · 矮桌 · 灯光 | 一、二、三、四、五 |
| history | 第四十一次大会散会之后 · 秋潮月第五十一日 | 六 |

> 潮候院第一笔账不写字「收」，只写一个「没」——这是潮候院唯一愿意保留的诚实。
> The first entry of the Institute's ledger does not write "receive"; it writes "None" — this is the only honesty the Institute keeps.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其七十一）「潮候院祠殿桌里那本首行是「没」的旧账簿」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the account book sitting on the sanctuary table since the last Convocation — its first line, still, reads "None".
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院祠殿桌上那本只有「没」做开头一页的旧账，已经静置百余年不动一字。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the fifty-first day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第五十一日。

---

## I · On the Sanctuary Table

Inside the sanctuary sits a low table; upon it rests an old ledger — its leather cover cracked, its pages half missing.

This ledger has not been moved for centuries — some call it a holy text; a few copyists call it rubbish.

**锚句**：祠殿桌里有一本旧账——皮皮壳破的纸页。

**Anchor sentence**: inside the sanctuary table lies an old ledger — its leather skin cracked, its pages half gone.

---

## II · The First Line Says "None"

The first line of this ledger, still legible, begins with a single character: "None"; after it a list of names — every name belongs to someone who once belonged to the Institute.

The copyists inspected it privately — they found no character wrong, no one willing to stand inside the list.

**锚句**：账簿的第一页第一行开头的字是「没」——没有一个字错。

**Anchor sentence**: the first line of the first page begins with "None" — not a single character miswritten.

---

## III · A Hundred Years Unmoved

The ledger, on the table, never moved from the day of the Convocation's dissolution.

The head of the watch looked once a quarter; only after he passed did the next copyists finger it — no one knows where in the book his fingers rested.

**锚句**：这本旧账簿已经百余年没有动过。

**Anchor sentence**: this old account has not moved in over a hundred years.

---

## IV · What the Copyists Whispered

Some of the older copyists said: what the ledger records are debts owed — not money, not merit — debts of something not yet repaid.

The copyist who scanned the contents whispered: "It does not owe money; it owes a promise."

**锚句**：私底下读过这本账的抄本师说它记录的是「欠一个承诺」。

**Anchor sentence**: the copyist who read its contents privately said it records "a debt of a promise".

---

## V · The Lost First Character

The elders say: before "None" there was another character, ground away over the years; only "None" remains legible.

No one tested this; nobody wants to speculate.

**锚句**：「没」之前还有一个磨掉的第一个字，没人能确定。

**Anchor sentence**: the first character, before the visible "None", has been ground away — no one can say what it was.

---

## VI · After the Dissolution

A month after the 41st Convocation dissolved, the copyists moved the ledger to a corner in the west — they did not open it; only the wind occasionally turns a page, and the book quiets itself.

It is a page for the wind now.

**锚句**：它现在只是风的书页——没人再去看它。

**Anchor sentence**: it is a page for the wind now — no one opens it anymore.

---

## VII · Mapping（Echo No. 71 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | "None" · the old ledger · owed a promise | 一、二、三、四、五、六 |
| geography | the sanctuary · the low table | 一 |
| characters | the copyists · the head of the watch · the copyists privately | 二、三、四、五、六 |
| story | the old ledger · Echo No. 71 | 全篇 |
| items | the old ledger · the low table | 一、二、三、四、五、六 |
| history | After the 41st Convocation · the fifty-first day of the autumn-tide month | 六 |

> 潮候院第一笔账不写字「收」，只写一个「没」——这是潮候院唯一愿意保留的诚实。
> The first entry of the Institute's ledger does not write "receive"; it writes "None" — this is the only honesty the Institute keeps.
`,
  },
  {
    order: 72,
    slug: 'echo-072-the-fog-child-the-institute-adopted',
    titleZh: '潮候院四百年前那只被收养的雾童',
    titleEn: 'The Fog Child the Institute Adopted Four Hundred Years Ago',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第五十三日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the fifty-third day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 72): The Fog Child the Institute Adopted Four Hundred Years Ago

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院四百年前捡来的那只雾童——大会散会后第一个长大的人。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the fog child the Institute adopted four hundred years ago — the first to grow up after the Convocation dissolved.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第五十三日。
> Era: the Institute — after the 41st Convocation; the fifty-third day of the autumn-tide month.

---

## 一 · 捡来

四百年前的秋潮月大会散会那一天，值更长听到了南墙外一阵细小的哭泣。

他擦过去发现一只藤蔓缠着的小怪物——很小，人掌那么大，整个雾港的雾气一下子凝住了。

**锚句**：四百年前大会散会的那一天，南墙外藤蔓缠着一只小怪物。
**Anchor sentence**: four hundred years ago, on the day the Convocation dissolved, a small thing lay wrapped in vines beyond the southern wall.

---

## 二 · 雾童

抄本师第二次进南墙的时候，雾气外头已经舒展开，小怪物的眼睛张着——人脚那么大——鼻子尖有一撮白毛。

抄本师认出来——这是只雾童。他取下藤蔓，带他回祠殿——值更长抬头看着他，他抬头看值更长。

**锚句**：藤尺缠着小怪物眼睛——抄本师认出来是只雾童。
**Anchor sentence**: the little thing's eyes opened — the copyists named it a fog child.

---

## 三 · 浮岛

雾童第一次醒的时候雾港上出现浮岛——四层一圈四层的圆托状。

抄本师私下推断——这些浮岛是潮候院几百年前在那一天沉下去的沉船——漂浮出来的影像。

**锚句**：雾童醒雾港上浮现浮岛——抄本师推算是沉船。
**Anchor sentence**: when the fog child wakes, floating islands appear above the fog harbor — the copyists calculate they are sunken ships.

---

## 四 · 大会散会那日

第四十一次大会散会那日听到南墙一下子安静。

值更长看了一眼雾童所在的南墙——藤蔓自己缠了上来；没有人说捡它又不动。

**锚句**：第四十一次大会散会那日，值更长去南墙没有人随。
**Anchor sentence**: on the day the 41st Convocation dissolved, the head of the watch went to the southern wall and no one followed.

---

## 五 · 名字

「不记名，雾童自己。」抄本师说；没人记他；没有穷人记他；也没有老值更长记得他。

抄本师私下做的最后的工作——是把他记到《潮候院人》的书上——但也没有名字——只记「南墙缠着的那只」。

**锚句**：抄本师把雾童记在《潮候院人》最后一页——只记「南墙缠着的那只」。
**Anchor sentence**: the copyists recorded the fog child on the last page of the Institute's roster of names — only as "the one wrapped beyond the southern wall".

---

## 六 · 灯

雾童今天 — 雾散雾落 — 潮候院醒来每一只雾港海鸟都在飞过来。

抄本师说，他醒了那一天会有很多光又会有第一次潮候院没有潮候。

**锚句**：雾童醒了的时候就是雾港的灯落下。
**Anchor sentence**: when the fog child wakes, the fog harbor's lamp falls with the light.

---

## 七 · 映射（回响七十二章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 雾童 · 浮岛 · 沉船 · 雾港 · 藤蔓 | 一、二、三、四、五、六 |
| geography | 南墙 · 雾港 · 祠殿 | 一、三、四 |
| characters | 抄本师 · 值更长 · 雾童 | 一、二、三、四、五、六 |
| story | 雾童 · 回响（其七十二） | 全篇 |
| items | 藤蔓 · 浮岛 · 雾港海鸟 | 一、二、三、四 |
| history | 第四十一次大会散会之后 · 秋潮月第五十三日 | 一、四、六 |

> 雾散之后潮候会自己点亮——雾童一直没醒——但潮候院一直在等它醒。
> After the fog clears the Institute will light itself — the fog child has not woken yet — the Institute is still waiting for him.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其七十二）「潮候院四百年前那只被收养的雾童」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the fog child the Institute adopted four hundred years ago — the first to grow up after the Convocation dissolved.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院四百年前捡来的那只雾童——大会散会后第一个长大的人。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the fifty-third day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第五十三日。

---

## I · Found

On the day of the 41st Convocation held four hundred years ago (autumn-tide month), the head of the watch heard something crying beyond the southern wall.

When he passed through, he found a small thing wrapped in vines — about as tall as his hand — the fog harbor stopped to listen.

**锚句**：四百年前大会散会的那一天，南墙外藤蔓缠着一只小怪物。
**Anchor sentence**: four hundred years ago, on the day the Convocation dissolved, a small thing lay wrapped in vines beyond the southern wall.

---

## II · The Fog Child

When the copyists returned south, the vine had unwrapped just enough — the eyes were open — about palm-sized — a tuft of white hair at the tip of the nose.

The copyists named it the fog child, and carried it up to the sanctuary — the head of the watch leaned forward, it leaned forward in return.

**锚句**：藤还裹着小怪物的眼睛——抄本师认出来是只雾童。
**Anchor sentence**: the little thing's eyes opened — the copyists named it a fog child.

---

## III · Floating Islands

The first time the fog child woke, four-tiered floating islands appeared above the fog harbor.

The copyists inferred in private — these islands are the Institute's sunken ships from four hundred years ago — risen back up in memory.

**锚句**：雾童醒雾港上浮现浮岛——抄本师推算是沉船。
**Anchor sentence**: when the fog child wakes, floating islands appear above the fog harbor — the copyists calculate they are sunken ships.

---

## IV · The Day of Dissolution

On the day the 41st Convocation dissolved, the southern wall fell silent.

The head of the watch went down to the southern wall; no one followed him.

**锚句**：第四十一次大会散会那日，值更长去南墙没有人随。
**Anchor sentence**: on the day the 41st Convocation dissolved, the head of the watch went to the southern wall and no one followed.

---

## V · No Name

"No name," said the copyists; "it is himself," they said. No poor folk gave him a name; no elder member of the night watch remembers one.

The last thing the copyists did was write him into "the Institute's roster of names" — but with no name — only as "the one wrapped beyond the southern wall".

**锚句**：抄本师把雾童记在《潮候院人》最后一页——只记「南墙缠着的那只」。
**Anchor sentence**: the copyists recorded the fog child on the last page of the Institute's roster of names — only as "the one wrapped beyond the southern wall".

---

## VI · The Lamp

Today the fog is the fog, the tide is the tide — every seabird at the fog harbor is flying in to look.

The copyists said: he will wake one day, and on that day the Institute will have light for the very first time without a tide-keeper.

**锚句**：雾童醒了的时候就是雾港的灯落下。
**Anchor sentence**: when the fog child wakes, the fog harbor's lamp falls with the light.

---

## VII · Mapping（Echo No. 72 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the fog child · floating islands · sunken ships · the fog harbor · the vines | 一、二、三、四、五、六 |
| geography | the southern wall · the fog harbor · the sanctuary | 一、三、四 |
| characters | the copyists · the head of the watch · the fog child | 一、二、三、四、五、六 |
| story | the fog child · Echo No. 72 | 全篇 |
| items | the vines · the floating islands · the seabirds at the fog harbor | 一、二、三、四 |
| history | After the 41st Convocation · the fifty-third day of the autumn-tide month | 一、四、六 |

> 雾散之后潮候会自己点亮——雾童一直没醒——但潮候院一直在等它醒。
> After the fog clears the Institute will light itself — the fog child has not woken yet — the Institute is still waiting for him.
`,
  },
  {
    order: 73,
    slug: 'echo-073-the-three-characters-on-the-inner-wall',
    titleZh: '潮候院内外南墙上的第一件碑文——三个字',
    titleEn: 'The First Inscription on the Inner Southern Wall — Three Characters',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第五十五日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the fifty-fifth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 73): The First Inscription on the Inner-Outer Wall — Three Characters

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院内外南墙一方没有署名的纸——碑文上只有三个字。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the carved panel on the southern inner-outer wall — three characters, no signature.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第五十五日。
> Era: the Institute — after the 41st Convocation; the fifty-fifth day of the autumn-tide month.

---

## 一 · 内外南墙

潮候院内外南墙是值更长和抄本师私下叫的俗名——南墙有两道。

内南墙是祠殿南墙：抄本师在这里登记值班。
外南墙是潮候院正门南墙外挡墙：胡椒荡的常见围墙。

**锚句**：潮候院内外南墙是值更长和抄本师私下叫的俗名。
**Anchor sentence**: the inner-outer southern wall is what the head of the watch and the copyists call it, privately.

---

## 二 · 碑文

内南墙上有刻着三个字的小碑——没人记得谁刻的，谁也不让动它；碑上的字边缘被海风磨得发软。

三个字："潮，候，归。"

**锚句**：内南墙上有三个字的小碑："潮，候，归。"
**Anchor sentence**: on the inner southern wall is a small panel with three characters: "Tide, Wait, Return".

---

## 三 · 那个一直没有名字的刻碑人

抄本师猜——这是某位值更长或者抄本师儿子写的；没有记载名字。

第四十一次大会散会之后，抄本师私下说："那三个字是某一位想回家的人刻给自己看的。"

**锚句**：抄本师私下说「那三个字是某一位想回家的人刻给自己看的」。
**Anchor sentence**: the copyists whispered privately that the three characters are for someone who wanted to go home — carved by themselves.

---

## 四 · 在雾里读

值更长说他在雾起的早晨踏过——这三个字的光会比别处的环境暗淡一点点。

他没说——也没告诉抄本师。抄本师猜原因：可能雾想看谁听懂。

**锚句**：雾天踏过内南墙，刻的字总会比别处更暗淡一点点。
**Anchor sentence**: on foggy mornings, the characters on the inner southern wall appear ever so slightly darker than their surroundings.

---

## 五 · 第四十一次大会散会之后

第四十一次大会散会之后，值更长每天早晚各一次都去看那三个字。

他现在没讲——但抄本师只知道他每天来看两遍——也许他等另一个字出现。

**锚句**：第四十一次大会散会之后，值更长每天早晚各来看这三个字一次。
**Anchor sentence**: after the 41st Convocation dissolved, the head of the watch visited the three characters twice daily, every day.

---

## 六 · 石头继续

有一天、抄本师经过内南墙——"归"字右上方多了一个「，」。

这件事抄本师闻所未闻——没人加过它——它就再也没人来认领；三个字变成一个逗号——潮，候，归，

值更长说："它想继续说。"

**锚句**：第四十一次大会散会之后，「归」字右上方多了一个逗号没人来认。
**Anchor sentence**: after the 41st Convocation dissolved, a comma appeared above the "Return" — no one has claimed it.

---

## 七 · 映射（回响七十三章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 内南墙 · 三个字 · 潮候归 · 逗号 · 想回家的人 | 一、二、三、四、五、六 |
| geography | 祠殿 · 内南墙 · 胡椒荡 | 一、二 |
| characters | 抄本师 · 值更长 · 某人想回家 | 一、二、三、四、五、六 |
| story | 碑文 · 回响（其七十三） | 全篇 |
| items | 石碑 · 内南墙 | 一、二、四、五、六 |
| history | 第四十一次大会散会之后 · 秋潮月第五十五日 | 一、四、五、六 |

> 潮候院一直在等第四个字——它说不出口。
> The Institute is still waiting for the fourth character — it does not speak out.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其七十三）「潮候院内外南墙上的第一件碑文」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the carved panel on the southern inner-outer wall — three characters, no signature.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院内外南墙一方没有署名的纸——碑文上只有三个字。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the fifty-fifth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第五十五日。

---

## I · The Inner and Outer Southern Walls

The inner-outer name for the southern walls of the Institute is what the head of the watch and the copyists privately call them.

The inner southern wall is the sanctuary's own southern wall — where copyists register the night watch.
The outer is on the outer wall beyond the main gate — the lookout over the Ji Jiao Tang.

**锚句**：潮候院内外南墙是值更长和抄本师私下叫的俗名。
**Anchor sentence**: the inner-outer southern wall is what the head of the watch and the copyists call it, privately.

---

## II · The Inscription

On the inner southern wall is a small panel of three characters — no one remembers who carved it; no one allows it to be touched; the edges are worn soft by centuries of fog.

The three characters: "潮，候，归" (Tide, Wait, Return).

**锚句**：内南墙上有三个字的小碑："潮，候，归。"
**Anchor sentence**: on the inner southern wall is a small panel with three characters: "Tide, Wait, Return".

---

## III · The Anonymous Carver

The copyists guess — perhaps a head of the watch or a son of one — no name recorded.

After the 41st Convocation dissolved, the copyists whispered privately: "those three characters are for someone who wanted to go home — carved by themselves."

**锚句**：抄本师私下说「那三个字是某一位想回家的人刻给自己看的」。
**Anchor sentence**: the copyists whispered privately that the three characters are for someone who wanted to go home — carved by themselves.

---

## IV · Reading in the Fog

The head of the watch said that on a foggy morning he passes it; the characters appear just a fraction darker than everything else.

He did not say why. The copyists guess: perhaps the fog itself wants to see whoever understands.

**锚句**：雾天踏过内南墙，刻的字总比别处更暗淡一点。
**Anchor sentence**: on foggy mornings, the characters on the inner southern wall appear ever so slightly darker than their surroundings.

---

## V · After the 41st Convocation Dissolved

After the 41st Convocation dissolved, the head of the watch walked to the inner southern wall every morning and every evening — twice daily — and looked at the three characters.

He does not speak about it. The copyists only know he visits twice daily — perhaps he waits for a fourth character to appear.

**锚句**：第四十一次大会散会之后，值更长每天早晚各来看这三个字一次。
**Anchor sentence**: after the 41st Convocation dissolved, the head of the watch visited the three characters twice daily, every day.

---

## VI · The Comma

Once, passing the inner wall, the copyists discovered a comma after the third character — "归" was followed by "，".

This affair is unheard of in the Institute — no one ever put it there; no one has claimed it since.

**锚句**：第四十一次大会散会之后，「归」字右上方多了一个逗号没人来认。
**Anchor sentence**: after the 41st Convocation dissolved, a comma appeared above the "Return" — no one has claimed it.

---

## VII · Mapping（Echo No. 73 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the inner southern wall · the three characters · the comma · going home | 一、二、三、四、五、六 |
| geography | the sanctuary · the inner southern wall · the Ji Jiao Tang | 一、二 |
| characters | the copyists · the head of the watch | 一、二、三、四、五、六 |
| story | the inscription · Echo No. 73 | 全篇 |
| items | the panel · the inner southern wall | 一、二、四、五、六 |
| history | After the 41st Convocation · the fifty-fifth day of the autumn-tide month | 一、四、五、六 |

> 潮候院一直在等第四个字——它说不出口。
> The Institute is still waiting for the fourth character — it does not speak out.
`,
  },
  {
    order: 74,
    slug: 'echo-074-the-fog-kissed-window-of-the-three-lamps',
    titleZh: '潮候院内祠三光那扇被摇摇雾吻过的窗子',
    titleEn: 'The Window of the Three Lamps Kissed by the Shaking Fog',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第五十七日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the fifty-seventh day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 74): The Window of the Three Lamps—Kissed by the Shaking Fog

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院内祠三光那扇没人敢近的窗子。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the window of the Three Lamps—no one dares to approach.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第五十七日。
> Era: the Institute — after the 41st Convocation; the fifty-seventh day of the autumn-tide month.

---

## 一 · 三光

祠殿内祠有三盏永不熄的灯——抄本师私下把它们叫「三光」。

那三盏灯聚在祠殿东侧一扇没人敢近的小窗旁——窗子朝东——从早晨第一缕光进去。

**锚句**：祠殿内祠三盏灯常年不熄，抄本师叫它们三光。
**Anchor sentence**: three lamps in the inner sanctuary never go out — the copyists call them the Three Lights.

---

## 二 · 那扇窗子

这扇窗约只有一人高——窄、窄到人侧着身子才能靠近。

里边是一面整块、刚刚好一面墙厚的老玻璃——玻璃后面是空气；没有光折射进去。

**锚句**：这扇窗从只有一人多高，窄到侧身才能靠近。
**Anchor sentence**: this window is only slightly taller than a person; narrow enough to pass sideways.

---

## 三 · 谁靠近过

第四十一次大会散会之后两个月，值更长一个人走到窗边——他没摘帽子——他没戴帽子。

抄本师原以为他要说话——他没说话——他没说话；只是站了三分钟。

**锚句**：第四十一次大会散会两个月之后，值更长只是站了三分钟。
**Anchor sentence**: two months after the 41st Convocation dissolved, the head of the watch stood there for three minutes.

---

## 四 · 雾吻

大约三天前——也就是大会散会两个月后——祠殿内祠有一次奇特的雾吻：

雾从这扇窗子的内侧、贴了一下就消失了——再没有发生。

**锚句**：大会散会之后一个奇特的雾吻——窗子从内侧贴了一下就消失了。
**Anchor sentence**: a strange fog-kiss came through the window from inside—it touched once and vanished.

---

## 五 · 抄本师抹不掉

抄本师的朋友把窗子内侧用纱布蘸水擦，甚至羽毛也擦过——擦不干净。

值更长说："那不是灰——那是空气被记住过。"

**锚句**：值更长说"那不是灰——是空气被记住过。"
**Anchor sentence**: the head of the watch said: "that is not dust; it is air that was remembered."

---

## 六 · 散会之后

第四十一次大会散会之后再没有任何雾吻——窗玻璃还没有磨平。

抄本师说这是潮候院的一件签字——雾知道什么是不该被记住的。

**锚句**：散会之后没有再发生雾吻，窗玻璃也没有磨平过。
**Anchor sentence**: since the Convocation dissolved, no fog-kiss has happened again; the glass has not worn smooth.

---

## 七 · 映射（回响七十四章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 三光 · 雾吻 · 祠殿内祠 · 记住空气 | 一、二、三、四、五、六 |
| geography | 祠殿内祠 · 东窗 | 一、二 |
| characters | 抄本师 · 值更长 · 三光 | 一、二、三、四、五、六 |
| story | 雾吻 · 回响（其七十四） | 全篇 |
| items | 三光 · 窄窗 · 老玻璃 | 一、二、三、四、五、六 |
| history | 第四十一次大会散会之后 · 秋潮月第五十七日 | 四、三、五 |

> 潮候院的窗玻璃记住所有雾吻——但没有人替潮候院说明。
> The Institute's windows remember every fog-kiss — no one explains them.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其七十四）「潮候院内祠三光那扇被摇摇雾吻过的窗子」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the window of the Three Lamps — no one dares to approach.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院内祠三光那扇没人敢近的窗子。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the fifty-seventh day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第五十七日。

---

## I · The Three Lamps

In the inner sanctuary, three lamps burn around the clock. The copyists privately call them the Three Lamps.

These three lamps gather near a small window — narrow, facing east — in the corner of the sanctuary where the morning light always arrives first.

**锚句**：祠殿内祠三盏灯常年不熄，抄本师叫它们三光。
**Anchor sentence**: three lamps in the inner sanctuary never go out — the copyists call them the Three Lights.

---

## II · The Narrow Window

The window is only slightly taller than a person; narrow enough to pass sideways.

Beyond the sill sits a single pane of old glass; behind the glass is only air; nothing reflects back.

**锚句**：这扇窗从只有一人多高，窄到侧身才能靠近。
**Anchor sentence**: this window is only slightly taller than a person; narrow enough to pass sideways.

---

## III · Who Approached

Two months after the 41st Convocation dissolved, only the head of the watch walked to this window once.

The copyists expected he would say something — he did not speak; he did not have a hat; he just stood there for three minutes.

**锚句**：第四十一次大会散会两个月之后，值更长只是站了三分钟。
**Anchor sentence**: two months after the 41st Convocation dissolved, the head of the watch stood there for three minutes.

---

## IV · The Fog-Kiss

Roughly three days ago — two months after the dissolution — the inner sanctuary received a strange fog-kiss:

From inside the window, the fog touched the glass once and vanished — it has not returned since.

**锚句**：大会散会之后一个奇特的雾吻——窗子从内侧贴了一下就消失了。
**Anchor sentence**: a strange fog-kiss came through the window from inside — it touched once and vanished.

---

## V · The Copyist Wiped Away and Failed

The copyist's assistant tried damp cloth, then feathers, then the corner of a torn page — none of these removed anything.

The head of the watch said: "that is not dust; it is air that was remembered."

**锚句**：值更长说"那不是灰——是空气被记住过。"
**Anchor sentence**: the head of the watch said: "that is not dust; it is air that was remembered."

---

## VI · After the Dissolution

No fog-kiss has happened since — the glass has not worn smoother.

The copyists say it is a signature of the Institute: the fog knows what the Institute has chosen not to remember.

**锚句**：散会之后没有再发生雾吻，窗玻璃也没有磨平过。
**Anchor sentence**: since the Convocation dissolved, no fog-kiss has happened again; the glass has not worn smooth.

---

## VII · Mapping（Echo No. 74 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the Three Lamps · the fog-kiss · air remembered · the inner sanctuary | 一、二、三、四、五、六 |
| geography | the inner sanctuary · the east window | 一、二 |
| characters | the copyists · the head of the watch · the Three Lamps | 一、二、三、四、五、六 |
| story | the fog-kiss · Echo No. 74 | 全篇 |
| items | the Three Lamps · the narrow window · the old glass | 一、二、三、四、五、六 |
| history | After the 41st Convocation · the fifty-seventh day of the autumn-tide month | 四、三、五 |

> 潮候院的窗玻璃记住所有雾吻——但没有人替潮候院说明。
> The Institute's windows remember every fog-kiss — no one explains them.
`,
  },
  {
    order: 75,
    slug: 'echo-075-the-one-time-fed-seabird-at-the-east-gate',
    titleZh: '潮候院东门外那只唯一一次被喂食的幼鸟',
    titleEn: 'The Young Seabird at the East Gate Fed Only Once',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第五十九日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the fifty-ninth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 75): The Young Seabird at the East Gate Fed Only Once

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院东门外那只唯一一次被喂食的幼鸟。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the young seabird at the east gate of the Institute who was fed only once.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第五十九日。
> Era: the Institute — after the 41st Convocation; the fifty-ninth day of the autumn-tide month.

---

## 一 · 东门外

潮候院东门是一道宽大的铁木门，门外有一片礁石。

礁石根部能听到潮声——风从那里吹来时，雪花般的海腥味随气流扑进来；任何时刻，门外都有两三只海鸟蹲在那边。

**锚句**：潮候院东门外常有两三只海鸟蹲在礁石根部。
**Anchor sentence**: at the foot of the rocks outside the east gate, two or three seabirds squat all the time.

---

## 二 · 幼鸟

第五十八回潮候院大会散会之后第七天——某个午后——值更长看见礁石上有一只幼鸟蜷着，全身浸在潮水里——嘴呼吸着——黄嘴尖还没有硬。

他没动手——没办法看到怎么办；只问了一句："它能吃吗？"

**锚句**：礁石上有一只幼鸟，全身浸在潮水里，黄嘴尖还没硬。
**Anchor sentence**: a chick on the rocks, soaked by the tide, its yellow bill-tip still soft.

---

## 三 · 喂了一次

值更长问值更院值日的孩子去拿了一瓢鱼肠渣补给。

孩子把鱼肠渣放在礁石根；鸟张嘴了，吞了——一两口——没再升起。

**锚句**：值更孩子把鱼肠渣放在礁石根，鸟张嘴吞了一两口。
**Anchor sentence**: a boy from the night watch laid fish-gut scraps at the foot of the rocks; the bird opened its beak and swallowed once or twice.

---

## 四 · 第二天

第二天，幼鸟不在礁石上——没有人知道是它飞走了还是被拿走了。

值更长说，过去也见过鸟死——常在礁石或墙角。

**锚句**：第二天，幼鸟不在礁石上——没人知道是飞走了还是被拿走了。
**Anchor sentence**: the next day, the chick was no longer on the rocks — no one knows whether it flew off or was carried away.

---

## 五 · 鸟典

抄本师私下做了一个记录，他问老值更："咱们专门收快要死的鸟吗？" 老值更说："潮候院收不收都不重要，只要潮候院知道就算。"

这条问答后被抄本师写进《鸟典·潮候院篇》的非正式条——没有署名。

**锚句**：抄本师私下做了包含幼鸟的鸟典记录——没有署名。
**Anchor sentence**: the copyists privately wrote an entry including the chick — no signature; filed in the Bird Annals, Institute chapter, informal section.

---

## 六 · 一年

再一年内，他没见过幼鸟——他也不打算再问。

值更长说："吃了它就吃了它——潮候院不会再喂——也没有人追问它到底飞起来没有。"

**锚句**：潮候院此后不会再喂这类死鸟，潮候院也没有追问它飞起来没有。
**Anchor sentence**: the Institute will not feed such dying birds again; the Institute will not ask whether it ever flew.

---

## 七 · 映射（回响七十五章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 幼鸟 · 鱼肠渣 · 鸟典 · 礁石 | 一、二、三、四、五、六 |
| geography | 潮候院东门 · 礁石 | 一、二 |
| characters | 值更长 · 值更孩子 · 抄本师 · 老值更 | 二、三、四、五、六 |
| story | 幼鸟 · 回响（其七十五） | 全篇 |
| items | 鱼肠渣 · 黄嘴 · 礁石 | 一、二、三、四、五、六 |
| history | 第四十一次大会散会之后 · 秋潮月第五十九日 | 一、二 |

> 潮候院东门口喂过一次就别喂了——潮候院不欠它什么。
> The Institute fed it once; the Institute will not feed it again — it is owed nothing.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其七十五）「潮候院东门外那只唯一一次被喂食的幼鸟」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the young seabird at the east gate of the Institute who was fed only once.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院东门外那只唯一一次被喂食的幼鸟。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the fifty-ninth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第五十九日。

---

## I · Outside the East Gate

The Institute opens its east gate onto a broad iron-and-wood door. Beyond it lies a rocky foreshore.

At the base of the rocks you can hear the tide; when the wind comes from there, a snow-flake sea-brine tosses in with the air — at any hour two or three seabirds squat out there.

**锚句**：潮候院东门外常有两三只海鸟蹲在礁石根部。
**Anchor sentence**: at the foot of the rocks outside the east gate, two or three seabirds squat all the time.

---

## II · The Chick

Seven days after the 58th Convocation dissolved, on a certain afternoon, the head of the watch spotted a chick crouching on the rocks, soaked by the sea, breathing through its beak — its yellow tip not yet hardened.

He took no action. He could not decide what to do. He only asked: "can it eat?"

**锚句**：礁石上有一只幼鸟，全身浸在潮水里，黄嘴尖还没硬。
**Anchor sentence**: a chick on the rocks, soaked by the tide, its yellow bill-tip still soft.

---

## III · Fed Only Once

The head of the watch sent a child from the night watch to bring a scoop of fish-gut scraps as a small supplement.

The child laid the scraps at the base of the rocks; the chick opened its beak and swallowed once or twice — it did not raise its head again.

**锚句**：值更孩子把鱼肠渣放在礁石根，鸟张嘴吞了一两口。
**Anchor sentence**: a boy from the night watch laid fish-gut scraps at the foot of the rocks; the bird opened its beak and swallowed once or twice.

---

## IV · The Next Day

The next day, the chick was no longer on the rocks — no one knows whether it flew off or was carried away.

The head of the watch said that previous birds had been found dead — often on rocks or in corners.

**锚句**：第二天，幼鸟不在礁石上——没人知道是飞走了还是被拿走了。
**Anchor sentence**: the next day, the chick was no longer on the rocks — no one knows whether it flew off or was carried away.

---

## V · The Bird Annals

The copyists privately made a note. They asked the senior watcher: "do we habitually rescue dying birds?"

The senior watcher said: "Whether the Institute rescues or not doesn't matter — as long as the Institute knows."

**锚句**：抄本师私下做了包含幼鸟的鸟典记录——没有署名。
**Anchor sentence**: the copyists privately wrote an entry including the chick — no signature; filed in the Bird Annals, Institute chapter, informal section.

---

## VI · A Year

Within a year he had not seen the chick again — nor did he intend to ask.

The head of the watch said: "It was fed; let it be. The Institute will not feed it again — and no one will ask whether it ever flew."

**锚句**：潮候院此后不会再喂这类死鸟，潮候院也没有追问它飞起来没有。
**Anchor sentence**: the Institute will not feed such dying birds again; the Institute will not ask whether it ever flew.

---

## VII · Mapping（Echo No. 75 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the chick · the fish scraps · the Bird Annals · the rocks | 一、二、三、四、五、六 |
| geography | the east gate · the rocks | 一、二 |
| characters | the head of the watch · the child from the night watch · the copyists · the senior watcher | 二、三、四、五、六 |
| story | the chick · Echo No. 75 | 全篇 |
| items | the fish scraps · the yellow bill · the rocks | 一、二、三、四、五、六 |
| history | After the 41st Convocation · the fifty-ninth day of the autumn-tide month | 一、二 |

> 潮候院东门口喂过一次就别喂了——潮候院不欠它什么。
> The Institute fed it once; the Institute will not feed it again — it is owed nothing.
`,
  },
  {
    order: 76,
    slug: 'echo-076-the-attic-no-one-opens',
    titleZh: '潮候院顶最高处那间没人打开的封地窖',
    titleEn: 'The Sealed Cellar at the Top of the Institute No One Opens',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第六十二日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the sixty-second day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 76): The Sealed Cellar at the Top of the Institute No One Opens

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院顶最高没人打开的一间封地窖。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the sealed cellar at the top of the Institute that no one opens.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第六十二日。
> Era: the Institute — after the 41st Convocation; the sixty-second day of the autumn-tide month.

---

## 一 · 顶楼

潮候院最高的一座挂满雨水的钟楼楼顶，抄本师私下叫它「顶楼」——值更长叫它「那间不要开门的」。

顶楼上一共三间屋——两间存放非正式遗物，一间是一道古木门。

**锚句**：顶楼一共三间屋——一间是一道古木门。
**Anchor sentence**: the attic has three rooms; one is a wooden door.

---

## 二 · 那道门

这道门从上到下，被外面钉得密密麻麻——木板缝里长出红铜钉。

风掠过堂顶的时候，可以听见这道门轻轻碰晃；但是没人知道是从内还是从外。

**锚句**：顶楼那道古木门，从上到下密密麻麻被红铜钉铆过。
**Anchor sentence**: the attic door is studded densely with red copper nails from top to bottom.

---

## 三 · 第四十一次大会散会后

第四十一次大会散会之后，某天傍晚——值更长带着钥匙去了那道门。

抄本师问他「要开吗？」；值更长答「不开，但鸣一下」——他拿一把打火狼燧一下子枪在门上，敲了两声。

**锚句**：抄本师问「要开吗？」，值更长说「不开，但鸣一下」——他敲门两声。
**Anchor sentence**: the copyist asked, "would he open it?"; the head of the watch said, "not open — just sound it" — and knocked twice.

---

## 四 · 应声

敲门之后，屋里传来两下响声——连着敲。

值更长缩回手——没有人听到响声的源头——也没有人能识别的真实情况。

**锚句**：敲门之后，屋里传来两下响声——没人识别。
**Anchor sentence**: after the knock, two answering sounds came from inside; no one could identify them.

---

## 五 · 钥匙

值更长第二次去顶楼是散会后第九天——他想看看那把钥匙的形状。

他发现那把钥匙是桶柿木做的——上面刻着「见窗旁者一人」；抄本师私下推断「见窗旁」——很可能是某个人，但谁也猜得到。

**锚句**：值更长第二次去顶楼看到钥匙，上面刻着「见窗旁者一人」。
**Anchor sentence**: on the second visit the head of the watch saw the key; it was engraved with the words "the one beside the window sees".

---

## 六 · 散会之后

散会之后没人想看它；抄本师说「它不是用不开——它是不会自己开」。

它现在还是那根木钉和那两间屋永远变了东南西北方向；没有人知道它还在不在。

**锚句**：抄本师说"它不是用不开——它是不会自己开"。
**Anchor sentence**: the copyists say it is not a matter of not opening — it is a matter of not being opened.

---

## 七 · 映射（回响七十六章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 顶楼 · 封地窖 · 见窗旁者一人 · 钥匙 | 一、二、三、四、五、六 |
| geography | 钟楼 · 顶楼 · 顶楼古木门 | 一、二 |
| characters | 值更长 · 抄本师 · 顶楼木门 | 一、二、三、四、五、六 |
| story | 封地窖 · 回响（其七十六） | 全篇 |
| items | 顶楼 · 古木门 · 钥匙 · 打火狼燧 | 一、二、三、四、五 |
| history | 第四十一次大会散会之后 · 秋潮月第六十二日 | 三、四、五、六 |

> 顶楼那间不开的门没有人想看，也没有人想听——但它一直在自己里边。
> The door upstairs no one wants to look at — no one wants to hear — but it has always been inside itself.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其七十六）「潮候院顶最高处那间没人打开的封地窖」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the sealed cellar at the top of the Institute that no one opens.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院顶最高没人打开的一间封地窖。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the sixty-second day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第六十二日。

---

## I · The Attic

The highest point of the Institute is a bell tower covered in rain — the copyists call it, privately, the attic; the head of the watch calls it "the one that must not be opened."

The attic has three rooms — two store non-formal relics, and one is a wooden door.

**锚句**：顶楼一共三间屋——一间是一道古木门。
**Anchor sentence**: the attic has three rooms; one is a wooden door.

---

## II · The Door

This door, top to bottom, is studded densely with red copper nails; the wooden seams show the nails still glowing.

When the wind blows across the bell tower, one can hear this door gently shaking; no one can say whether it comes from inside or outside.

**锚句**：顶楼那道古木门，从上到下密密麻麻被红铜钉铆过。
**Anchor sentence**: the attic door is studded densely with red copper nails from top to bottom.

---

## III · After the 41st Convocation Dissolved

Sometime after the 41st Convocation dissolved, in the evening, the head of the watch brought the key up to the door.

The copyist asked, "would he open it?" — the head of the watch said, "not open — just sound it" — he took out a fire-steel and knocked twice on the door.

**锚句**：抄本师问「要开吗？」，值更长说「不开，但鸣一下」——他敲门两声。
**Anchor sentence**: the copyist asked, "would he open it?"; the head of the watch said, "not open — just sound it" — and knocked twice.

---

## IV · The Answer

After the knock, two answering sounds came from inside — back to back.

The head of the watch drew his hand back — no one had heard the source of the sound; no one could identify what it was.

**锚句**：敲门之后，屋里传来两下响声——没人识别。
**Anchor sentence**: after the knock, two answering sounds came from inside; no one could identify them.

---

## V · The Key

The second time the head of the watch went up was nine days after the Convocation dissolved — he wanted to look at the key.

He found the key was made of bucket-paw persimmon wood — engraved with the words "the one beside the window sees"; the copyists privately inferred that "the one beside the window" was probably a person, but no one can guess who.

**锚句**：值更长第二次去顶楼看到钥匙，上面刻着「见窗旁者一人」。
**Anchor sentence**: on the second visit the head of the watch saw the key; it was engraved with the words "the one beside the window sees".

---

## VI · After the Dissolution

No one wants to see it; the copyists say it is not a matter of not opening — it is a matter of not being opened.

It is still those nails and those two rooms, constantly changing direction between southeast and northwest; no one knows whether it still exists.

**锚句**：抄本师说"它不是用不开——它是不会自己开"。
**Anchor sentence**: the copyists say it is not a matter of not opening — it is a matter of not being opened.

---

## VII · Mapping（Echo No. 76 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the attic · the sealed cellar · "the one beside the window sees" · the key | 一、二、三、四、五、六 |
| geography | the bell tower · the attic · the attic's wooden door | 一、二 |
| characters | the head of the watch · the copyists · the attic door | 一、二、三、四、五、六 |
| story | the sealed cellar · Echo No. 76 | 全篇 |
| items | the attic · the wooden door · the key · the fire-steel | 一、二、三、四、五 |
| history | After the 41st Convocation · the sixty-second day of the autumn-tide month | 三、四、五、六 |

> 顶楼那间不开的门没有人想看，也没有人想听——但它一直在自己里边。
> The door upstairs no one wants to look at — no one wants to hear — but it has always been inside itself.
`,
  },
  {
    order: 77,
    slug: 'echo-077-the-stone-lion-who-never-sank',
    titleZh: '潮候院南山角那只一百多年从没入沉心的石狮',
    titleEn: 'The Stone Lion at the South-East Corner of the Institute That Forgot to Sink for a Century',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第六十四日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the sixty-fourth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 77): The Stone Lion at the South-East Corner of the Institute That Forgot to Sink for a Century

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院南山角那只矗立一百多年的石狮。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the stone lion standing at the south-east corner of the Institute for over a century.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第六十四日。
> Era: the Institute — after the 41st Convocation; the sixty-fourth day of the autumn-tide month.

---

## 一 · 南山角

南山角是潮候院主体的南东侧——背靠一座矮山——对着开门口。

角落立着一只石狮——比人稍矮一头——挡南山吹来的风。

**锚句**：潮候院南山角立着一只石狮，挡南山吹来的风。
**Anchor sentence**: at the south-east corner of the Institute stands a stone lion, blocking the southern wind.

---

## 二 · 一百多年

值更长巡班时问抄本师："这口狮子哪天来的？"抄本师把这件事告诉他——它比潮候院本身还要古老。

抄本师又说："它是潮候院自己的碑——潮候院最初本来想叫它『碑』"——"潮候院的碑"——抄本师没说出口。

**锚句**：抄本师说"石狮比潮候院还早"，值更长没有追问。
**Anchor sentence**: the copyists said "the stone lion is older than the Institute itself"; the head of the watch did not press.

---

## 三 · 脸朝东

它的脸朝东——朝向正门，固定位置，无人能动。

大约百年以前，某个抄本师给它画过一只红色的腮——院里所有红色腮都是同一个女人画的。

**锚句**：它的脸朝东——某百年前有人画过它的腮——没人知道是谁画的。
**Anchor sentence**: it faces east; a century ago someone painted its cheeks red — no one knows who.

---

## 四 · 第四十一次大会散会之后

第四十一次大会散会后，值更长经过石狮——他看到它嘴角向上歪——几乎看不见。

抄本师说："石头的表情您不要再看——它有自己的心事。"

**锚句**：散会之后值更长看见石狮嘴角微微上扬，抄本师说"石头有自己的心事"。
**Anchor sentence**: after the dissolution, the head of the watch saw the lion's mouth curl slightly upward; the copyists said the stone has its own thoughts.

---

## 五 · 红色

七十年前有人报案说有人给石狮画红腮——上报给值更长——抄本师说"那就是上一次画它腮的人；他不说名字"

值更长想把那人抓起来问——抄本师劝他不要——抄本师说："抓了也没人承认；这又是一件要保存到最后的事。"

**锚句**：值更长想抓那个画红腮的人，抄本师劝他"抓了也没人承认"。
**Anchor sentence**: the head of the watch wanted to arrest the red-cheek painter; the copyists pleaded that even if he caught him, no one would speak.

---

## 六 · 海星

抄本师发现：每年一天的午后，石狮脸上的红腮会变深一点——是潮候院的一种海星。

每年那一只星变的深的那一天，雾起来得特别浓。

**锚句**：每年只有一昼夜，石狮脸上红色腮会变得更红——那天雾浓得出奇。
**Anchor sentence**: once a year for one hour stone-face reddens and the Institute swallows more fog than usual.

---

## 七 · 映射（回响七十七章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 石狮 · 潮候院 · 红腮 · 南山角 · 碑 | 一、二、三、四、五、六、七 |
| geography | 南山角 · 矮山 · 雾港 | 一、二、六 |
| characters | 抄本师 · 值更长 · 画腮的人 | 一、二、三、四、五、六 |
| story | 石狮 · 回响（其七十七） | 全篇 |
| items | 石狮 · 红腮 · 雾 · 海星 | 一、二、三、四、五、六 |
| history | 第四十一次大会散会之后 · 秋潮月第六十四日 | 四、五、六 |

> 石狮不会沉下去——石狮一直都在它自己里面——它是潮候院自己的碑。
> The lion will never sink — it has always been inside itself — it is the Institute's own monument.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其七十七）「潮候院南山角那只一百多年从没入沉心的石狮」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the stone lion standing at the south-east corner of the Institute for over a century.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院南山角那只矗立一百多年的石狮。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the sixty-fourth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第六十四日。

---

## I · The South-East Corner

The south-east corner of the Institute is its southern-eastern flank — braced against a low rise — opening toward the main entrance.

At the corner stands a stone lion — slightly shorter than a grown man — blocking the southern wind.

**锚句**：潮候院南山角立着一只石狮，挡南山吹来的风。
**Anchor sentence**: at the south-east corner of the Institute stands a stone lion, blocking the southern wind.

---

## II · Over a Century

Once during his rounds the head of the watch asked the copyists when this lion arrived. The copyists told him — it is older than the Institute itself.

The copyists continued: "It is the Institute's own monument — the Institute originally wanted to call it a monument" — "the Institute's monument" — they did not speak it aloud.

**锚句**：抄本师说"石狮比潮候院还早"，值更长没有追问。
**Anchor sentence**: the copyists said "the stone lion is older than the Institute itself"; the head of the watch did not press.

---

## III · East-Facing

Its face always faces east — fixed toward the main gate forever — no one can move it.

Roughly a century ago, a copyist painted its cheeks red — all the red cheeks in the Institute come from the same woman.

**锚句**：它的脸朝东——某百年前有人画过它的腮——没人知道是谁画的。
**Anchor sentence**: it faces east; a century ago someone painted its cheeks red — no one knows who.

---

## IV · After the 41st Convocation Dissolved

After the 41st Convocation dissolved, the head of the watch passed by the lion; he saw its mouth curl slightly upward — barely visible.

The copyists said: "do not look at the stone's expression — it has its own thoughts."

**锚句**：散会之后值更长看见石狮嘴角微微上扬，抄本师说"石头有自己的心事"。
**Anchor sentence**: after the dissolution, the head of the watch saw the lion's mouth curl slightly upward; the copyists said the stone has its own thoughts.

---

## V · The Red

Seventy years ago, someone reported that the lion's cheeks had been painted red — the report reached the head of the watch. The copyists said, that is the same person who painted its cheeks before; no name would come out.

The head of the watch wanted to catch the painter, but the copyists begged him not to — the copyists said: "Catch him and no one will speak; this is one of the things that must be preserved until the end."

**锚句**：值更长想抓那个画红腮的人，抄本师劝他"抓了也没人承认"。
**Anchor sentence**: the head of the watch wanted to arrest the red-cheek painter; the copyists pleaded that even if he caught him, no one would speak.

---

## VI · The Red Sea-Star

The copyists notice that once a year, on a single afternoon, the red on the lion's cheeks deepens — an Institute species of sea-star.

On the day the red deepens, the fog rolls thicker than usual over the Institute.

**锚句**：每年只有一昼夜，石狮脸上红色腮会变得更红——那天雾浓得出奇。
**Anchor sentence**: once a year for one hour stone-face reddens and the Institute swallows more fog than usual.

---

## VII · Mapping（Echo No. 77 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the stone lion · the Institute · the red cheeks · the south-east corner · the monument | 一、二、三、四、五、六、七 |
| geography | the south-east corner · the low rise · the fog harbor | 一、二、六 |
| characters | the copyists · the head of the watch · the red-cheek painter | 一、二、三、四、五、六 |
| story | the stone lion · Echo No. 77 | 全篇 |
| items | the stone lion · the red cheeks · the fog · the sea-star | 一、二、三、四、五、六 |
| history | After the 41st Convocation · the sixty-fourth day of the autumn-tide month | 四、五、六 |

> 石狮不会沉下去——石狮一直都在它自己里面——它是潮候院自己的碑。
> The lion will never sink — it has always been inside itself — it is the Institute's own monument.
`,
  },
  {
    order: 78,
    slug: 'echo-078-the-wooden-box-opens-once-a-year',
    titleZh: '潮候院底潮那只一年不开一次的木头匣',
    titleEn: 'The Wooden Box at the North Storeroom\'s Outer Corner That Opens Once a Year',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第六十七日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the sixty-seventh day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 78): The Wooden Box at the South-East Corner of the Institute That Opens Once a Year

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院唯一一只一年只打开一次的木头匣的来历。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the single wooden box that opens only once a year, at the far corner of the Institute.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第六十七日。
> Era: the Institute — after the 41st Convocation; the sixty-seventh day of the autumn-tide month.

---

## 一 · 那只匣

潮候院北库外角，靠一块青石板放着一只木头匣——大小像一只中号鞋盒子，从外观看颜色已经灰白了。

每年六十六次大会散会那天——每年一次。

**锚句**：北库外角有一只木头匣，颜色已经灰白了，每年一次。
**Anchor sentence**: at the outer corner of the north storeroom stands a wooden box, bleached gray by age, opened only once a year.

---

## 二 · 它自己自己开了

某值更守在北库外角——他说每年一次大会散会当天——匣子自动盖开。

抄本师查北库进出以后——抄本师没有查到任何人动过这个木匣。

**锚句**：北库守说每年散会日匣子自己盖开；抄本师查不到人动过。
**Anchor sentence**: the storekeeper swore the box opens itself on every Convocation dissolution day; the copyists found no one had touched it.

---

## 三 · 里面有什么

它自己自己盖开那一瞬间，抄本师拧掉手电的灯——他只对下一位值更守说："里面不是空，但不让我记。"

抄本师后来一辈子再不开口告诉过任何人。

**锚句**：抄本师说"里面不是空——但不让我记。"抄本师后来一辈子不说一句。
**Anchor sentence**: the copyist whispered: "It is not empty — but it will not let me write"; he never spoke another word about it.

---

## 四 · 浮岛影

北库进出进出没有人能见——但这一天潮候院雾湿了。

护池苔上发了一点圆形影，圆形影不动。

**锚句**：那一天潮候院雾湿了——护池上圆形影沉默不动。
**Anchor sentence**: on that day the Institute's fog was thick as soup — circular reflections lay still in the pond.

---

## 五 · 第八次散会

第八次散会早雾湿的那一天是抄本师——他平时不肯跟值更守说一句话——悄悄回
他悄悄回北库外角的时候——没有人能见。

北库外角是潮候院最安静的地方——没有人在听。

**锚句**：北库外角是潮候院最安静的地方——没有人在听。
**Anchor sentence**: the northern storeroom's outer corner is the quietest place in the Institute — no one is listening.

---

## 六 · 抄本师自己

抄本师一生，只说过两句话——抄本师的老师记下来了："里面不是空 "和 "不 "——"不是空"不停反复。

抄本师走了以后，潮候院又多了五代抄本师——没人知道木匣里是什么。

**锚句**：抄本师走了以后没人知道木匣里面是什么。
**Anchor sentence**: after the copyist passed, no one knew what was inside the box.

---

## 七 · 映射（回响七十八章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 木匣 · 自己盖开 · 不让记 · 北库外角 · 大会散会 | 一、二、三、四、五、六、七 |
| geography | 北库外角 · 青石板 · 北院 | 一、四、五、六 |
| characters | 北库守 · 抄本师 · 潮候院师傅 | 二、三、五、六 |
| story | 木匣 · 回响（其七十八） | 全篇 |
| items | 木匣 · 大会散会 · 青石板 · 手电 · 手灯 | 一、二、三、四、五、六 |
| history | 第四十一次大会散会之后 · 秋潮月第六十七日 | 一、二、四、五 |

> 它不让记。潮候院继续不记——潮候院也继续在。
> It will not let me write. The Institute continues without writing — and the Institute continues.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其七十八）「潮候院北库外角那只一年只打开一次的木匣」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the single wooden box that opens only once a year, at the far corner of the Institute.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院唯一一只一年只打开一次的木头匣的来历。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the sixty-seventh day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第六十七日。

---

## I · The Box

At the outer corner of the north storeroom of the Institute, next to a blue stone slab, rests a wooden box — broad as a mid-sized shoe box, bleached gray with age.

Only once a year, on the dissolution day of every Convocation — it opens once.

**锚句**：北库外角有一只木头匣，颜色已经灰白了，每年一次。
**Anchor sentence**: at the outer corner of the north storeroom stands a wooden box, bleached gray by age, opened only once a year.

---

## II · It Opens Itself

A watchkeeper of the outer corner said that on the dissolution day each year the box opens by itself.

The copyists traced the entry log — and found no one had touched the box.

**锚句**：北库守说每年散会日匣子自己盖开；抄本师查不到人动过。
**Anchor sentence**: the storekeeper swore the box opens itself on every Convocation dissolution day; the copyists found no one had touched it.

---

## III · What Was Inside

At the instant the box opens, the copyists switched off the flashlight — they only told the next watchkeeper on duty: "It is not empty, but it will not let me write."

After that, the copyists never once in a lifetime spoke another word about it.

**锚句**：抄本师说"里面不是空——但不让我记。"抄本师后来一辈子不说一句。
**Anchor sentence**: the copyist whispered: "It is not empty — but it will not let me write"; he never spoke another word about it.

---

## IV · Floating in the Fog

The entry log outside showed nobody visiting that day — but the Institute was drenched in fog.

Over the heron pond lay a circular shadow, motionless.

**锚句**：那一天潮候院雾湿了——护池上圆形影沉默不动。
**Anchor sentence**: on that day the Institute's fog was thick as soup — circular reflections lay still in the pond.

---

## V · The Eighth Dissolution

The eighth Convocation's dissolution day. A copyist — never speaking to the storekeeper — silently returned to the north storeroom's outer corner — and no one saw him go.

It is the quietest place in the entire Institute — no one is listening.

**锚句**：北库外角是潮候院最安静的地方——没有人在听。
**Anchor sentence**: the northern storeroom's outer corner is the quietest place in the Institute — no one is listening.

---

## VI · The Only Two Sentences

The copyist spoke only two sentences in his entire life. His teacher wrote them down: "It is not empty" and "not" — "not empty" and "not" — repeated endlessly.

After the copyist passed, five more generations of copyists served the Institute — no one ever found out what was inside the box.

**锚句**：抄本师走了以后没人知道木匣里面是什么。
**Anchor sentence**: after the copyist passed, no one knew what was inside the box.

---

## VII · Mapping（Echo No. 78 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the wooden box · it opens itself · it will not let me write · the north storeroom's outer corner · the Convocation | 一、二、三、四、五、六、七 |
| geography | the north storeroom · the blue stone slab · the northern wing | 一、四、五、六 |
| characters | the storekeeper · the copyists · the Institute's teacher | 二、三、五、六 |
| story | the wooden box · Echo No. 78 | 全篇 |
| items | the wooden box · the Convocation · the blue stone slab · the flashlight | 一、二、三、四、五、六 |
| history | After the 41st Convocation · the sixty-seventh day of the autumn-tide month | 一、二、四、五 |

> 它不让记。潮候院继续不记——潮候院也继续在。
> It will not let me write. The Institute continues without writing — and the Institute continues.
`,
  },
  {
    order: 79,
    slug: 'echo-079-the-great-crow-at-the-deepest-place',
    titleZh: '潮候院最深处那只守了九世的大镇海木鸦',
    titleEn: 'The Great Black Crow of Calming the Sea at the Center of the Institute',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后——秋潮月第六十九日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the sixty-ninth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 79): The Great Black Crow of Calming the Sea at the Center of the Institute

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院最深处那只守了九世的大镇海木鸦——没人敢说出它的名字。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the great black crow at the center of the Institute — no one dares speak its name.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第六十九日。
> Era: the Institute — after the 41st Convocation; the sixty-ninth day of the autumn-tide month.

---

## 一 · 最深处

潮候院最深处——一间只属于第二列倒影的屋子，门楣上方有一对对称的"鸟踪"符号；抄本师把它叫"屋子上端"。

一只大乌鸦，站在屋子正中一只青灰大碗里，一万只脚印环绕着——它从来不动。

**锚句**：屋子正中方有一只大乌鸦装在青灰大碗里，四周环绕一万只脚印——它从来不动。
**Anchor sentence**: in the center of the room sits a great black crow in an ash-gray bowl, ten thousand footprints circling it — and it never moves.

---

## 二 · 九世

抄本师推算，这只乌鸦——它被放在这个屋子里——已经九九辈子夜。

"九世"——抄本师私下说——意思不是"用了九次"，而是"它自己活了九世"。

**锚句**：这只乌鸦站了九世——抄本师私下说"九世是它自己活了九世"。
**Anchor sentence**: the crow has stood for ninety generation-cycles — the copyists privately wonder whether he has lived nine lives of his own.

---

## 三 · 屋名前不说

"大镇海木鸦"是抄本师私下的叫法——没有人外波语。

屋子的名字到现在也没有：抄本师叫"那里"。

**锚句**：屋子的名字叫"那里"，屋子之内的名字——没人说。
**Anchor sentence**: the room's name is "there" — no one speaks the name inside it.

---

## 四 · 脚印

一万只脚印绕一只乌鸦——值更长巡完仓库回来说：他巡完了所有仓库——他发现院内各角落的鞋印正好也是一万双的标本。

值更长说："一万只脚印绕它；一万双鞋印穿过院内"

**锚句**：值更长说院内一万双鞋印穿过院内"。
**Anchor sentence**: the head of the watch noticed that exactly ten thousand pairs of prints had walked through the Institute.

---

## 五 · 没有食物

大镇海木鸦不吃东西——没人喂它过；也从不朝外叫；也从不挪一寸。

抄本师说——屋子里的乌鸦和一只木乌鸦——没有人分得清；但它的眼睛在看。

**锚句**：屋子里的乌鸦和一只木乌鸦长得相似——没人分得清；但它的眼睛一直在看。
**Anchor sentence**: the crow and the wooden crow look the same; no one can tell them apart — but its eyes are always watching.

---

## 六 · 散会之后

第四十一次大会散会之后——抄本师第二次去那屋——他在它跟前说了一句"天下人"——他停一秒——乌鸦忽然朝外看了一下。

抄本师跟别人说，他没有听到鸟叫——但乌鸦活的啊。

**锚句**："天下人"那一刻之后，抄本师说他看见鸟叫——但没有听见鸟叫。
**Anchor sentence**: after he uttered the words "the people of the world", the copyists say they saw the crow call — but they did not hear the crow call.

---

## 七 · 映射（回响七十九章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 大镇海木鸦 · 九世 · 脚印 · 青灰大碗 · 屋子 | 一、二、三、四、五、六、七 |
| geography | 屋子 · 倒影的屋子 · 潮候院 | 一、二、五 |
| characters | 抄本师 · 值更长 · 大镇海木鸦 | 一、二、三、四、五、六 |
| story | 大镇海木鸦 · 回响（其七十九） | 全篇 |
| items | 青灰大碗 · 大鸟 · 屋子里没有名字 | 一、二、三、四、五 |
| history | 第四十一次大会散会之后 · 秋潮月第六十九日 | 二、四、六 |

> 潮候院最深处的一只大镇海木鸦，没人敢把它嘴里的事说出来。
> The great black crow at the deepest place of the Institute — no one dares repeat what it says from its beak.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其七十九）「潮候院最深处那只守了九世的大镇海木鸦」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the great black crow at the center of the Institute — no one dares speak its name.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院最深处那只守了九世的大镇海木鸦——没人敢说出它的名字。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the sixty-ninth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后——秋潮月第六十九日。

---

## I · The Deepest Room

At the deepest place of the Institute stands a room whose door lintel bears two symmetric "bird-tracks" glyphs — the copyists call it "the room above".

Above the center of the room squats a great crow — in an ash-gray bowl — ten thousand footprints circling it; it never moves.

**锚句**：屋子正中方有一只大乌鸦装在青灰大碗里，四周环绕一万只脚印——它从来不动。
**Anchor sentence**: in the center of the room sits a great black crow in an ash-gray bowl, ten thousand footprints circling it — and it never moves.

---

## II · Nine Lives

The copyists calculated that the crow has stood in this room for nine-nine cycles of spirit.

"Nine lives" — the copyists privately say — does not mean nine, but that it has been alive nine lives of its own.

**锚句**：这只乌鸦站了九世——抄本师私下说"九世是它自己活了九世"。
**Anchor sentence**: the crow has stood for ninety generation-cycles — the copyists privately wonder whether he has lived nine lives of his own.

---

## III · The Name Not Spoken

"The Great Crow that Calms the Sea" is what the copyists privately call it — nobody speaks it outside.

The room itself has no name. The copyists call it simply "there".

**锚句**：屋子的名字叫"那里"，屋子之内的名字——没人说。
**Anchor sentence**: the room's name is "there" — no one speaks the name inside it.

---

## IV · The Footprints

Ten thousand footprints and the crow — after the head of the watch finished one round of all the storerooms, he discovered that the footprints in every corner of the Institute exactly matched those ten thousand shoes.

The head of the watch said: "ten thousand footprints circle it; ten thousand pairs of shoes have walked through the Institute."

**锚句**：值更长说院内一万双鞋印穿过院内"。
**Anchor sentence**: the head of the watch noticed that exactly ten thousand pairs of prints had walked through the Institute.

---

## V · No Food

The great crow never eats — no one has fed it, never cries out, never moves a single inch.

The copyists say — the crow and the wooden crow are indistinguishable from each other; but its eyes watch.

**锚句**：屋子里的乌鸦和一只木乌鸦长得相似——没人分得清；但它的眼睛一直在看。
**Anchor sentence**: the crow and the wooden crow look the same; no one can tell them apart — but its eyes are always watching.

---

## VI · After the Dissolution

After the 41st Convocation dissolved, the copyists went to the room for the second time — standing before it, they said two words: "the people" — they stopped for a moment — the crow suddenly turned its head outward.

The copyists told others that they did not hear the crow call — but the crow was alive.

**锚句**："天下人"那一刻之后，抄本师说他看见鸟叫——但没有听见鸟叫。
**Anchor sentence**: after he uttered the words "the people of the world", the copyists say they saw the crow call — but they did not hear the crow call.

---

## VII · Mapping（Echo No. 79 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the Great Crow · nine lives · the footprints · the ash-gray bowl · the room | 一、二、三、四、五、六、七 |
| geography | the room · the reflected room · the Institute | 一、二、五 |
| characters | the copyists · the head of the watch · the crow | 一、二、三、四、五、六 |
| story | the Great Crow · Echo No. 79 | 全篇 |
| items | the ash-gray bowl · the great crow · the nameless room | 一、二、三、四、五 |
| history | After the 41st Convocation · the sixty-ninth day of the autumn-tide month | 二、四、六 |

> 潮候院最深处的一只大镇海木鸦，没人敢把它嘴里的事说出来。
> The great black crow at the deepest place of the Institute — no one dares repeat what it says from its beak.
`,
  },
  {
    order: 80,
    slug: 'echo-080-the-cat-that-keeps-watch-in-the-front-court',
    titleZh: '潮候院前庭那只永远闭着眼睛的守门猫',
    titleEn: 'The Cat at the Institute\'s Front Court That Sleeps With Its Eyes Open',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后 —— 秋潮月第七十一日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the seventy-first day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 80): The Cat at the Institute's Front Court That Sleeps With Its Eyes Open

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院前庭那只从不睁眼睛的守门猫——半醒半睡——但没人知道它在不在听。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the cat at the front court of the Institute who never opens its eyes.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后 —— 秋潮月第七十一日。
> Era: the Institute — after the 41st Convocation; the seventy-first day of the autumn-tide month.

---

## 一 · 前庭

潮候院前庭是正门外一块圆形石板，环绕着院前矮墙。

正门上方有一盏油灯——日复一日，灯火总是小沾了潮沫；灯顶木门横梁上蹲着一只黑猫——它从不睁眼。

**锚句**：前庭油灯下蹲着一只黑猫，它从不睁眼。
**Anchor sentence**: beneath the lamp at the front court squats a black cat — it never opens its eyes.

---

## 二 · 最老的东西

抄本师说："这只猫是院里最老的东西。"

值更长问："你怎么知道？"

抄本师答："院里没人能动它——石板下方一些字比它还年轻。"

**锚句**：抄本师说前庭猫是院里最老的东西——前庭没人能动它。
**Anchor sentence**: the copyists say the cat is the oldest thing in the whole Institute — no one can move it.

---

## 三 · 闭着眼

它闭着眼——半睁不开。

大会散会那一天，有人路过看了一眼——灯下夜里猫的眼睛暗——只剩两颗星亮一会儿又暗。

**锚句**：它闭着眼——灯下夜里猫的眼睛暗——只剩两颗星亮一会儿又暗。
**Anchor sentence**: it keeps its eyes closed — under the lamp its eyes grow dim — only two stars, bright once then dark again.

---

## 四 · 它是什么

"它不是装睡——它不需要睁眼醒着——它是不打开眼在听。"

抄本师绕了一圈又回去，前庭没人说，灯又一晃；一片安静——只有偶尔有人路过被它瞟了一眼。

**锚句**：抄本师说"它不是装睡——它不需要睁眼醒着"。
**Anchor sentence**: the copyists said: "it is not pretending to sleep — it does not need to wake to watch."

---

## 五 · 没人喂过它

浮光满前庭猫的身形——它的身后跟着几根鬓毛在地上——地上有小小的脚印——也未必是它的。

院里从来没谁喂它。抄本师说的：「它不是饿的，它是为数不多的只是守。」

**锚句**：抄本师说它「不是饿的，它是只守的」。
**Anchor sentence**: the copyists said: "it is not hungry — it is only watching."

---

## 六 · 值更长没看它过

第四十一次大会散会之后一个潮候月，值更长回前庭——他看到猫——他没走过去打量它——他蹲惯身子。

猫没名字，没人记。

**锚句**：值更长回前庭看见猫——他没走过去打量它。
**Anchor sentence**: the head of the watch returns to the front court and sees the cat — he does not walk up to inspect it.

---

## 七 · 映射（回响八十章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 守门猫 · 油灯 · 闭着眼 · 只守的 · 不需要醒着 | 一、二、三、四、五、六、七 |
| geography | 前庭 · 院前矮墙 · 正门外 | 一、二 |
| characters | 抄本师 · 值更长 · 守门猫 | 一、二、三、四、五、六 |
| story | 守门猫 · 回响（其八十） | 全篇 |
| items | 前庭油灯 · 木门横梁 · 矮墙 | 一、二、三、四、五 |
| history | 第四十一次大会散会之后 · 秋潮月第七十一日 | 三、六 |

> 灯下一片安静——院子里的事没有人做主，只有那只猫自己知道。
> Under the lamp, the place is silent — no one owns the affairs of the court — only that cat knows.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其八十）「潮候院前庭那只永远闭着眼睛的守门猫」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the cat at the front court of the Institute who never opens its eyes.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院前庭那只从不睁眼睛的守门猫——半醒半睡——但没人知道它在不在听。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the seventy-first day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后 —— 秋潮月第七十一日。

---

## I · The Front Court

The Institute's front court is a circular stone slab beyond the main gate, surrounded by a low wall.

Above the gate hangs an oil lamp — day after day, the flame shimmers with the tide — on the lintel squats a black cat; it never opens its eyes.

**锚句**：前庭油灯下蹲着一只黑猫，它从不睁眼。
**Anchor sentence**: beneath the lamp at the front court squats a black cat — it never opens its eyes.

---

## II · The Oldest Thing

The copyists say: "this cat is the oldest thing in the whole Institute."

The head of the watch asked: "how do you know?"

The copyists answered: "no one in the Institute can move it — and the characters carved into the slab beneath it are younger than it."

**锚句**：抄本师说前庭猫是院里最老的东西——前庭没人能动它。
**Anchor sentence**: the copyists say the cat is the oldest thing in the whole Institute — no one can move it.

---

## III · Closed Eyes

It keeps its eyes closed — half-open but never fully.

On the day of the 41st Convocation's dissolution, someone passed and saw it — the cat's eyes were dark; only two stars flashed once and went dark again.

**锚句**：它闭着眼——灯下夜里猫的眼睛暗——只剩两颗星亮一会儿又暗。
**Anchor sentence**: it keeps its eyes closed — under the lamp its eyes grow dim — only two stars, bright once then dark again.

---

## IV · What It Is

"It does not pretend to sleep — it simply does not need to wake to watch — it hears without opening its eyes."

The copyists went around once and came back; the front court was silent; the lamp flickered; no one spoke; only the occasional passer was caught by one slow look.

**锚句**：抄本师说"它不是装睡——它不需要睁眼醒着"。
**Anchor sentence**: the copyists said: "it is not pretending to sleep — it does not need to wake to watch."

---

## V · No One Feeds It

Floating dust lingers along the cat's silhouette — a few stray hairs on the slab — tiny prints — perhaps they are not even its.

No one has fed it in the Institute; the copyists say: "it is not hungry — it is only watching."

**锚句**：抄本师说它「不是饿的，它是只守的」。
**Anchor sentence**: the copyists said: "it is not hungry — it is only watching."

---

## VI · He Never Looks at the Cat

One month after the 41st Convocation dissolved, the head of the watch returned to the front court — he saw the cat — he did not walk over to inspect; he just settled into himself.

The cat has no name; no one remembers one.

**锚句**：值更长回前庭看见猫——他没走过去打量它。
**Anchor sentence**: the head of the watch returns to the front court and sees the cat — he does not walk up to inspect it.

---

## VII · Mapping（Echo No. 80 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the cat · the oil lamp · closedeyes · only watching · no wake | 一、二、三、四、五、六、七 |
| geography | the front court · the low wall · outside the main gate | 一、二 |
| characters | the copyists · the head of the watch · the cat | 一、二、三、四、五、六 |
| story | the cat · Echo No. 80 | 全篇 |
| items | the oil lamp · the lintel · the low wall | 一、二、三、四、五 |
| history | After the 41st Convocation · the seventy-first day of the autumn-tide month | 三、六 |

> 灯下一片安静——院子里的事没有人做主，只有那只猫自己知道。
> Under the lamp, the place is silent — no one owns the affairs of the court — only that cat knows.
`,
  },
  {
    order: 81,
    slug: 'echo-081-the-millstone-that-grinds-nothing',
    titleZh: '潮候院老石磨盘——它磨不动任何东西',
    titleEn: 'The Old Stone Millstone of the Institute That Grinds Nothing',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后 —— 秋潮月第七十五日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the seventy-fifth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 81): The Old Stone Millstone of the Institute That Grinds Nothing

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院老石磨盘——地上钉一百多年的那口磨盘悄悄地磨——它不磨它自己的什么。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the old stone millstone of the Institute — it grinds nothing.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后 —— 秋潮月第七十五日。
> Era: the Institute — after the 41st Convocation; the seventy-fifth day of the autumn-tide month.

---

## 一 · 老磨盘

潮候院大门走廊右手边——半露在墙上——一座老石磨盘。

墙都是白灰；磨盘石是径黑的碎石；没人把它用来磨什么。

**锚句**：潮候院走廊右手边半露出一座老磨盘——没人磨什么。
**Anchor sentence**: at the corner of the corridor outside the main gate lies an old stone mill — it grinds nothing.

---

## 二 · 三百年

这口磨盘有三百年——比大会散会年代早；抄本师说——"它磨的不是潮候院今天的东西"——它磨的只是潮候院原本没有任何需要磨的东西。

抄本师一天站在它跟前——抄本师不会说有声音的——但抄本师觉得它老。

**锚句**：抄本师说"它磨的不是潮候院今天的东西——磨的只是原本没有磨的东西"。
**Anchor sentence**: the copyists said, "it grinds not what the Institute grinds today — it grinds what was never ground."

---

## 三 · 纹路

老磨盘中间凹，但没被任何人磨过。

院里老人说，它本来是一块自然山石——它不是被磨盘变成了磨盘——是山自己被雾磨了。

**锚句**：老磨盘中间凹但没被人磨过——它本来就是自然的山石。
**Anchor sentence**: the mill's middle dips, but no one has ground it — it was always a natural fieldstone shaped by fog.

---

## 四 · 三百年来

大会散会之前一百年、潮候院的祖父抄本师在这老石磨画一个字——什么字没人交代。

后来字没了——只剩凹痕——凹痕的颜色比周围深一点——以雾的形式留在石上。

**锚句**：三百年来每一代抄本师都不摸老石磨——凹痕颜色比周围深——像雾留下的。
**Anchor sentence**: every copyist's generation has passed, no one touching it — the single groove darker than the stone — left behind like fog.

---

## 五 · 雾散了的名

大会散会之后——抄本师发现这老磨盘叫"父"——院秘书隐约说，但偷偷藏着他的嘴——他哪都没说。

抄本师说，它要磨的不是咸鱼干——它要磨的是"大半辈子的名"。

**锚句**：大会散会之后抄本师发现老磨盘叫"父"——院秘书说"它磨的是大半辈子的名"。
**Anchor sentence**: after the Convocation dissolved, the copyists found a name for the old mill — "Father" — the Institute secretary said, "it grinds the name of a long life."

---

## 六 · 没人磨

三百年来没人磨它。

潮候院觉得它是"一块匪石"——值更长去看它，最多次问："那东西磨什么？"——抄本师说："它磨不知道。"

**锚句**：三百年没人磨它——它磨的没人知道。
**Anchor sentence**: for three hundred years no one has ground it — what it grinds, no one knows.

---

## 七 · 映射（回响八十一章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 老磨盘 · 三百年 · 匪石 · 雾磨 · 父 | 一、二、三、四、五、六、七 |
| geography | 大门走廊 · 墙 | 一、二、四 |
| characters | 抄本师 · 值更长 · 院秘书 | 二、三、四、五、六 |
| story | 老磨盘 · 回响（其八十一） | 全篇 |
| items | 老磨盘 · 匪石 · 凹痕 · 雾色 | 一、二、三、四、五 |
| history | 第四十一次大会散会之后 · 秋潮月第七十五日 | 四、五、六 |

> 潮候院没磨过什么——潮候院被磨过——磨盘在那等今天没有任何的名。
> The Institute has ground nothing — the mill has ground the Institute — it waits for a name that no day has yet given it.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其八十一）「潮候院里老石磨盘——它磨不动任何东西」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the old stone millstone of the Institute — it grinds nothing.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院老石磨盘——地上钉一百多年的那口磨盘悄悄地磨——它不磨它自己的什么。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the seventy-fifth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后 —— 秋潮月第七十五日。

---

## I · The Old Millstone

To the right of the corridor outside the main gate, half embedded in the wall, sits an old stone millstone.

The wall is white lime. The millstone is dark flecked stone. No one uses it to grind anything.

**锚句**：潮候院走廊右手边半露出一座老磨盘——没人磨什么。
**Anchor sentence**: at the corner of the corridor outside the main gate lies an old stone mill — it grinds nothing.

---

## II · Three Hundred Years

This millstone is over three hundred years old — older than the Convocation's dissolution cycle. The copyists said: "It grinds not what the Institute grinds today — it grinds what was never ground."

A copyist stood before it once; no sound came; but the copyists felt its age.

**锚句**：抄本师说"它磨的不是潮候院今天的东西——磨的只是原本没有磨的东西"。
**Anchor sentence**: the copyists said, "it grinds not what the Institute grinds today — it grinds what was never ground."

---

## III · The Groove Without a Scribe

The mill's middle dips, but no one has ground it.

Among the Institute's elders, some say it was a natural fieldstone — the hill itself was worn by fog.

**锚句**：老磨盘中间凹但没被人磨过——它本来就是自然的山石。
**Anchor sentence**: the mill's middle dips, but no one has ground it — it was always a natural fieldstone shaped by fog.

---

## IV · The Hundred-Year-Old Mark

A century before the Convocation dissolved, a copyist painted a single character on this mill — what character, none of them could say.

After the character faded, only the groove remained — darker than the stone, left behind like fog.

**锚句**：三百年来每一代抄本师都不摸老石磨——凹痕颜色比周围深——像雾留下的。
**Anchor sentence**: every copyist's generation has passed, no one touching it — the single groove darker than the stone — left behind like fog.

---

## V · The Name

After the Convocation dissolved, a copyist found someone called it "Father".

The Institute secretary whispered: "it grinds the name of a long life."

**锚句**：大会散会之后抄本师发现老磨盘叫"父"——院秘书说"它磨的是大半辈子的名"。
**Anchor sentence**: after the Convocation dissolved, the copyists found a name for the old mill — "Father" — the Institute secretary said, "it grinds the name of a long life."

---

## VI · No One Grinds It

Three hundred years have passed. No one has ground it.

The head of the watch went to look at it once — the most he ever asked was: "what does it grind?" — the copyists answered: "it grinds the unknown."

**锚句**：三百年没人磨它——它磨的没人知道。
**Anchor sentence**: for three hundred years no one has ground it — what it grinds, no one knows.

---

## VII · Mapping（Echo No. 81 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the old mill · three hundred years · Father · fog-shaped · never ground | 一、二、三、四、五、六、七 |
| geography | the corridor · the wall | 一、二、四 |
| characters | the copyists · the head of the watch · the Institute secretary | 二、三、四、五、六 |
| story | the old mill · Echo No. 81 | 全篇 |
| items | the mill · the groove · the fog-shaped stone | 一、二、三、四、五 |
| history | After the 41st Convocation · the seventy-fifth day of the autumn-tide month | 四、五、六 |

> 潮候院没磨过什么——潮候院被磨过——磨盘在那等今天没有任何的名。
> The Institute has ground nothing — the mill has ground the Institute — it waits for a name that no day has yet given it.
`,
  },
  {
    order: 82,
    slug: 'echo-082-the-fog-strokes-the-children-copy',
    titleZh: '潮候院孩子每天早晚抄的雾字影',
    titleEn: 'The Fog-Strokes Copied by the Institute\'s Children at Dawn and Dusk',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后 —— 秋潮月第七十七日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the seventy-seventh day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 82): The Fog-Strokes Copied by the Institute's Children at Dawn and Dusk

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院孩子们每天早晚抄的那一页雾字影。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the fog-strokes the Institute's children copy at dawn and dusk.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后 —— 秋潮月第七十七日。
> Era: the Institute — after the 41st Convocation; the seventy-seventh day of the autumn-tide month.

---

## 一 · 每天抄字

潮候院有东西叫"晨光抄"——院里所有大孩子在日出前先到祠殿，一人复一笔，满地白光。

抄的不是字典里的字——抄的是 "雾字影"——雾冰成的字每一根。

**锚句**：院里的大孩子日出前到祠殿，一人复一笔，抄的是雾冰成的字每一根。
**Anchor sentence**: every older child of the Institute arrives before sunrise at the sanctuary, each tracing one stroke at a time — the strokes frozen out of fog.

---

## 二 · 字长得

抄的不是完整的字——只是部分。

——比如今天抄"潮"字三画；下一天抄"候"五画。

**锚句**：抄的内容不是完整的字，每天只抄一个偏旁几笔。
**Anchor sentence**: not a single whole character; each day only a few strokes of one part.

---

## 三 · 雾字影

雾字影本身只有当雾上去时才被看见。

每年三十多天都是专为它开放的——雾字影专用**秋潮月**——孩子们最多、墨用最快。

**锚句**：每年三十多天都是秋潮月——孩子们最多墨用最快。
**Anchor sentence**: more than thirty days a year are in the autumn-tide month — that is when the children come thickest and the ink-flow fastest.

---

## 四 · 收的字

而《雾字影录》中一共收录了多少字——抄本师说没数字；有人说四百九十个。

每一字后面专门是一个时序（抄下该字的孩子）——潮候院从抄传人开始一页一页"因为有"。

**锚句**：《雾字影录》中一共收了多少字，抄本师说不出数字。
**Anchor sentence**: the Fog-Strokes Record — no one knows how many strokes it holds; the copyists cannot say a number.

---

## 五 · 秋潮月

秋潮月抄完——抄本师把每天的字封进特制盒——上写"雾录·"+ 年号+"年"+"回"。

"回"字封闭后——《雾录》正式入潮候院后廊。

**锚句**："回"字封闭后，《雾录》正式入潮候院后廊。
**Anchor sentence**: when the "return stroke" is sealed, the Fog-Strokes Record is moved into the rear gallery of the Institute.

---

## 六 · 抄本师

抄本师一千个已经——从六岁起抄到去世。

他不会教孩子，只会让孩子抄，抄饱以后抄他自己。

**锚句**：抄本师从六岁起抄到去世——抄饱以后抄他自己。
**Anchor sentence**: the copyists have been copying from age six — when they are tired of copying, they copy themselves.

---

## 七 · 映射（回响八十二章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 晨光抄 · 雾字影 · 雾录 · 后廊 · 秋潮月 | 一、二、三、四、五、六、七 |
| geography | 祠殿 · 后廊 | 一、二、五 |
| characters | 抄本师 · 大孩子们 | 一、二、三、四、五、六 |
| story | 晨光抄 · 回响（其八十二） | 全篇 |
| items | 雾字影 · 雾录 · 特制盒 · 抄本师 | 一、三、四、五、六 |
| history | 第四十一次大会散会之后 · 秋潮月第七十七日 | 一、三、五、六 |

> 潮候院的孩子每天复的不是雾——是院自己对雾的记忆。
> What the children copy each day is not the fog — it is the Institute's own memory of itself.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其八十二）「潮候院孩子每天早晚抄的雾字影」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the fog-strokes the Institute's children copy at dawn and dusk.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院孩子们每天早晚抄的那一页雾字影。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the seventy-seventh day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后 —— 秋潮月第七十七日。

---

## I · Morning Copying

Every morning the Institute runs what it calls "dawn-copy" — all the older children arrive at the sanctuary before sunrise, each tracing one stroke at a time under the wash of dawn.

The strokes they trace are not characters from any dictionary — they are fog-strokes, the shape each syllable of fog takes when it freezes on paper.

**锚句**：院里的大孩子日出前到祠殿，一人复一笔，抄的是雾冰成的字每一根。
**Anchor sentence**: every older child of the Institute arrives before sunrise at the sanctuary, each tracing one stroke at a time — the strokes frozen out of fog.

---

## II · Shapes

They do not copy complete characters; they copy only pieces.

For example, today the strokes may form the radicals of "tide" (潮) — tomorrow they may form five parts of "wait" (候).

**锚句**：抄的内容不是完整的字，每天只抄一个偏旁几笔。
**Anchor sentence**: not a single whole character; each day only a few strokes of one part.

---

## III · Fog-Strokes

The fog-strokes become visible only when fog gathers over the Institute.

More than thirty days a year are open to copying — that is the autumn-tide month — when the children come thickest and the ink-flow runs fastest.

**锚句**：每年三十多天都是秋潮月——孩子们最多墨用最快。
**Anchor sentence**: more than thirty days a year are in the autumn-tide month — that is when the children come thickest and the ink-flow fastest.

---

## IV · The Record

The Fog-Strokes Record (Fog Annals) — no one knows exactly how many strokes it contains. Some say four hundred and ninety.

After each stroke comes the name of its copier and the sequence number — the morning copyist maintains an order to the matter.

**锚句**：《雾字影录》中一共收了多少字，抄本师说不出数字。
**Anchor sentence**: the Fog-Strokes Record — no one knows how many strokes it holds; the copyists cannot say a number.

---

## V · Autumn-Tide Month

After the autumn-tide month ends, the copyists seal each day's strokes into a special box marked "§Fog Record · year + epoch".

Once the "return stroke" is sealed into the record, the Fog Annals are formally moved into the rear gallery of the Institute.

**锚句**："回"字封闭后，《雾录》正式入潮候院后廊。
**Anchor sentence**: when the "return stroke" is sealed, the Fog-Strokes Record is moved into the rear gallery of the Institute.

---

## VI · The Copyists

There have been more than a thousand copyists in the Institute — from age six until their deaths, they copied.

They do not teach the children; they simply let them copy — when the children are tired, the copyists copy themselves.

**锚句**：抄本师从六岁起抄到去世——抄饱以后抄他自己。
**Anchor sentence**: the copyists have been copying from age six — when they are tired of copying, they copy themselves.

---

## VII · Mapping（Echo No. 82 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | dawn-copy · fog-strokes · the Fog Annals · the rear gallery · the autumn-tide month | 一、二、三、四、五、六、七 |
| geography | the sanctuary · the rear gallery | 一、二、五 |
| characters | the copyists · the older children | 一、二、三、四、五、六 |
| story | the morning copy · Echo No. 82 | 全篇 |
| items | the fog-strokes · the Fog Annals · the special box · the copyists | 一、三、四、五、六 |
| history | After the 41st Convocation · the seventy-seventh day of the autumn-tide month | 一、三、五、六 |

> 潮候院的孩子每天复的不是雾——是院自己对雾的记忆。
> What the children copy each day is not the fog — it is the Institute's own memory of itself.
`,
  },
  {
    order: 83,
    slug: 'echo-083-the-pool-that-shows-nothing',
    titleZh: '潮候院祠殿后那一汪从不照见任何东西的水潭',
    titleEn: 'The Pool Behind the Sanctuary That Reflects Nothing',
    eraLineZh: '纪元：潮候院 · 第四十一次大会散会之后 —— 秋潮月第七十八日。',
    eraLineEn: 'Era: the Institute — after the 41st Convocation; the seventy-eighth day of the autumn-tide month.',
    markdownZh: `# The Whispers' Kings · World Bible · Echo (No. 83): The Pool Behind the Sanctuary That Reflects Nothing

> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院祠殿后院那一汪水——风吹过它，它连一圈纹都不肯露。
> 纪律同正典：锚句 zh/en 逐字对应。
>
> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the pool behind the sanctuary of the Institute — even wind will not ripple it.
> Same discipline: anchors verbatim.

> 纪元：潮候院 · 第四十一次大会散会之后 —— 秋潮月第七十八日。
> Era: the Institute — after the 41st Convocation; the seventy-eighth day of the autumn-tide month.

---

## 一 · 后院

祠殿后院有一汪水——不宽，人伸手能够到边缘那块白石。

水面是黑的、平的——日头照下来，水面不亮——像一张收了底色的纸。

**锚句**：祠殿后有一汪水——它从不映出任何东西。
**Anchor sentence**: behind the sanctuary a small pool gives no reflection.

---

## 二 · 风也不敢

抄本师说顺着院墙吹过来的风撞到潭上——它拐弯了。

没有人见过潭上有纹——从值更人记事那天起——最老的抄本师只说："它不是风不吹它，是它不动。"

**锚句**：抄本师说风吹过也不起一圈纹。
**Anchor sentence**: the copyists said wind does not even ripple the pool.

---

## 三 · 青叶

四十年前有人往潭里丢了一片青叶——那人后悔——第二天抄本师来看：潭里没有叶子，也没有影子。

砚台里的墨都比它会动。

**锚句**：四十年前有人往潭里丢过一片青叶——第二天潭里没有叶子，也没有影子。
**Anchor sentence**: a man once cast a green leaf into the pool; by dawn the pool held no leaf and no shadow.

---

## 四 · 米缸月

米缸月里没人去潭边——连后院洗手的抄本师也绕开走。

抄本师说那一个月的潭水最老——老得不像是刚从地里渗出来的。

**锚句**：米缸月里没人去潭边——抄本师说那时的潭水最老。
**Anchor sentence**: no one goes near the pool during the rice-jar month — the water is oldest then.

---

## 五 · 他看见自己了

散会之后某一晚，走着回家的那位抄本师说他在潭里看见了自己的脸——他没有靠近——只说了一句话就回去了。

他后来再没说过潭的任何事。

**锚句**：散会之后有人说潭里看见过自己的脸——只有一次，上一轮冬天。
**Anchor sentence**: after the last dissolution someone claimed the pool showed his face once — once, last winter.

---

## 六 · 抄本师的规矩

抄本师不拦人去潭边——去的人回来没人拦。

抄本师只说一句——不管你去干什么："别靠太近。"

**锚句**：抄本师不拦人去潭边——他只说：别靠太近。
**Anchor sentence**: the copyists never stop anyone going; they only say, don't lean too close.

---

## 七 · 映射（回响八十三章对应关系）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | 西潭 · 不映 · 青叶 · 米缸月 · 白石 | 一、二、三、四、五、六、七 |
| geography | 祠殿后院 · 白石沿 · 北墙 | 一、二、四 |
| characters | 抄本师 · 那个看见的回去的人 | 一、二、三、四、五、六 |
| story | 西潭 · 回响（其八十三） | 全篇 |
| items | 白石 · 砚台 · 青叶 | 一、三、四 |
| history | 第四十一次大会散会之后 · 秋潮月第七十八日 | 四、五、六 |

> 水不看你——你也许不该看水。但潮候院不禁止任何人站在它旁边。
> The water does not look at you — perhaps you should not look at the water. And yet no one is forbidden to stand beside it.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 回响（其八十三）「潮候院祠殿后那一汪从不照见任何东西的水潭」

> An echo is not a sequel, nor a fake, nor a contradiction — it is another layer of grain the salt grew on the same stone.
> Written for the pool behind the sanctuary of the Institute — even wind will not ripple it.
> Same discipline: anchors verbatim.
>
> 回响是正典之外的侧写——不是错的、不是假的、不是续篇，是同一块石上被盐啃出来的另一层纹理。
> 本篇写给潮候院祠殿后院那一汪水——风吹过它，它连一圈纹都不肯露。
> 纪律同正典：锚句 zh/en 逐字对应。

> Era: the Institute — after the 41st Convocation; the seventy-eighth day of the autumn-tide month.
> 纪元：潮候院 · 第四十一次大会散会之后 —— 秋潮月第七十八日。

---

## I · The Pool

Behind the sanctuary stands a pool of still water — narrow enough that a hand can reach the rim of white stone that borders it.

The surface is black and perfectly level — when the sun falls on it, the pool does not gleam; it is a piece of paper with its color drained.

**锚句**：祠殿后有一汪水——它从不映出任何东西。
**Anchor sentence**: behind the sanctuary a small pool gives no reflection.

---

## II · Even the Wind

The copyists say the wind coming along the wall always turns aside when it reaches the pool.

No one has ever seen a ripple on its surface since record-keeping began. The oldest copyists will only say: "It does not refuse the wind — it does not move."

**锚句**：抄本师说风吹过也不起一圈纹。
**Anchor sentence**: the copyists said wind does not even ripple the pool.

---

## III · The Leaf

Forty years ago a man cast a green leaf into the pool — and regretted it. The next dawn the copyists came to look: the pool held no leaf, and no shadow.

The ink in an inkwell moves more readily.

**锚句**：四十年前有人往潭里丢过一片青叶——第二天潭里没有叶子，也没有影子。
**Anchor sentence**: a man once cast a green leaf into the pool; by dawn the pool held no leaf and no shadow.

---

## IV · The Rice-Jar Month

During the rice-jar month no one goes near the pool — even the copyists who wash their hands in the back yard take the long way around.

The copyists say the pool's water is oldest that month — older than anything that has drained up from the ground in living memory.

**锚句**：米缸月里没人去潭边——抄本师说那时的潭水最老。
**Anchor sentence**: no one goes near the pool during the rice-jar month — the water is oldest then.

---

## V · One Face

One night after the Convocation dissolved, a copyist walking home claimed the pool showed him his own face. He did not step closer — he said one sentence, and turned back.

Afterwards, he never again spoke of the pool.

**锚句**：散会之后有人说潭里看见过自己的脸——只有一次，上一轮冬天。
**Anchor sentence**: after the last dissolution someone claimed the pool showed his face once — once, last winter.

---

## VI · The Copyists' Rule

The copyists never forbid anyone to stand at the pool — those who return are not stopped.

They only say, no matter what you have come to do: "do not lean too close."

**锚句**：抄本师不拦人去潭边——他只说：别靠太近。
**Anchor sentence**: the copyists never stop anyone going; they only say, don't lean too close.

---

## VII · Mapping（Echo No. 83 → world model）

| 类别 | 标题 | 对应章 |
|---|---|---|
| lore | the pool · no reflection · the leaf · the rice-jar month · the white rim | 一、二、三、四、五、六、七 |
| geography | behind the sanctuary · the white stone rim · the north wall | 一、二、四 |
| characters | the copyists · the one who saw and went back | 一、二、三、四、五、六 |
| story | the pool · Echo No. 83 | 全篇 |
| items | the white rim · the inkwell · the green leaf | 一、三、四 |
| history | After the 41st Convocation · the seventy-eighth day of the autumn-tide month | 四、五、六 |

> 水不看你——你也许不该看水。但潮候院不禁止任何人站在它旁边。
> The water does not look at you — perhaps you should not look at the water. And yet no one is forbidden to stand beside it.
`,
  },
] as const;

export const BIBLE_APPENDICES: readonly BibleChapter[] = [
  {
    order: 1,
    slug: 'appx-001-annals-of-the-institute',
    titleZh: '低语诸王 · 世界大典 · 旧史简纪（附录一）',
    titleEn: 'The Whispers\' Kings · World Bible · Annals of the Institute (Appendix I)',
    eraLineZh: '',
    eraLineEn: '',
    markdownZh: `# The Whispers' Kings · World Bible · Annals of the Institute (Appendix I)

> 本附录是正典的时间编年，不作为锚句来源，列于正典与回响之间，供问典与典籍室之用。
> 本附录不记录任何活着的人物——只记录潮候院的潮起潮落与谁把手放上羊皮纸。
> 纪律：每条事件附双语对应，与正典同一把规矩。

> This appendix chronicles the Institute. It carries no anchor sentences and is not used by the verifier.
> It records only the tides of the Institute and the hands that laid the hand upon the parchment.
> Same short-form discipline as the canon.

---

## 一 · 第一次大会（潮生 · 建院之始）

雾港潮汐在建院那年第一次退到沙嘴。第一任潮候拾起一只半截的贝壳，问港里的海水：「你到底要什么？」海水潮涌三天，校定了潮候院的名字——潮候院，即潮汐的候院、潮汐的守望之地。

建院之期无人记录。第三章中记得的第一任潮候的名字已被海水带走。他落下的贝壳，留在潮候院祠殿门口——直到今日，每逢初一潮汐到退时，半个贝壳的影子仍落在祠殿门槛上。

---

## 二 · 第九次大会（潮进 · 潮候院奠基）

建于雾港正中心。雾港离海岸六十里，周围是从未有过沙潮、没有苇、没有芦苇的滩地。修建时泥瓦匠见到雾港桌面下的潮汐表时都退下了——那是从来没人见过的完整潮汐表，表面蚀了大半，只余两个刻度的沙化线和一个手印。

这块石头现放在祠殿南厢房做门槛——每一个值更推开南厢房的门时，都会踩过那只手印的掌心。

---

## 三 · 第十九次大会（潮回 · 灯凡）

潮汐表第一次被正式挂到祠殿上。在那以前，潮候院不知道什么时候潮汐应该涨潮，也没有人解释潮汐的规则。潮候手中的贝壳被扔到雾港入口，潮候宣布「潮汐不关闭」——那是一次大会压低声音说的话。从那以后，雾港的人们开始记潮汐、数贝壳、给每次涨退各起一个名字。

留书的墨碗也是在这次大会上留下的——第十九次大会时，随行的抄本员把一只满墨的陶碗放在潮候院南厢房，再也没拿回来过——到第三次大会之后，它变成了「留书的墨碗」，潮汐收干了的墨碗。

---

## 四 · 第二十九次大会（潮盛 · 潮沙盘）

潮候院最高的一次潮沙盘大会。两百三十二号潮候把三十六只贝壳按潮汐排序布置在一屉大的铁板上，按潮汐本行。亮潮暗潮各领一摊——那是一次大会被雾港商行称为「无羞怯的潮汐之日」的开始；从这以后，潮沙盘被公开、公开画出、公开抄写。

这次大会的抄本员后记为：「我只是替潮候摆了一回贝壳。」

---

## 五 · 第三十六次大会（潮变 · 米缸月）

米缸月始于这次大会。抄本员记得一袋从北盐谷运来的碎米，在雾港渡口卸船时没人看管——装米的布袋被前几代值更的细盐淹没了一口——值更院一直留着它到今日。

这口缸里浮着的「从不沉下去的一粒米」最早被记作「月亮为某个坐在米缸边上、还未被人看见的人而留的」。抄本员晚上把蜡烛吹灭的时候，米缸会在破晓的雾气中泛着一层淡光——值更换借了扇子把淡光从缸里煽了出来——以至于雾港人都能看见它。

---

## 六 · 第四十一次大会（潮锁 · 散会）

大会的真正记录不在典籍里——只埋在水底。四十一次大会最后一天朝阳未起时潮汐退了一整张桌子。退得像有人拿一把伞把云撕成了两半。潮候院不再以任何潮汐为标志不再在公开场合宣称。

这一次大会上在场的人都没有记录下来名字或名字里隐藏的内容。南厢房那一页空白的索引就是从这次大会留给下一任抄本员的——抄本员把它收藏好。他留了一页「留给海看的页」，把「留书的墨碗」与「第四十一页日影」与「潮候院南厢房那本旧目录」捆在一起，用一根绳系起来，沉进了雾港渡口边的因特罗中央。

---

## 七 · 六十九年（潮落）

潮候院从散会至今日已经持续了六十九年。六十九年来没人亲自算过这个数——六十九年后抄本员没人敢像收成一样把它们归档。此刻潮候院没有潮候，只有值更。值更不知道谁在管这栋楼。


---

## Era Index

0 → 建院（雾港退潮布置贝壳） · 潮生
1 → 雾港奠（雾港建院潮候手印） · 潮进
2 → 第十九次（潮汐表挂到祠殿，「潮汐不关闭」） · 潮回
3 → 第二十九次（潮沙盘） · 潮盛
4 → 第三十六次（米缸月） · 潮变
5 → 第四十一次（散会） · 潮锁
6 → 六十九年（无人为潮候） · 潮落
`,
    markdownEn: `# 低语诸王 · 世界大典 · 旧史简纪（附录一）

> This appendix chronicles the Institute. It carries no anchor sentences and is not used by the verifier.
> It records only the tides of the Institute and the hands that laid the hand upon the parchment.
> Same short-form discipline as the canon.
>
> 本附录是正典的时间编年，不作为锚句来源，列于正典与回响之间，供问典与典籍室之用。
> 本附录不记录任何活着的人物——只记录潮候院的潮起潮落与谁把手放上羊皮纸。
> 纪律：每条事件附双语对应，与正典同一把规矩。

---

## I · The First Convocation (The Rise of the Tide · Founding)

In the year the Institute began, the tide of the fog harbor receded to the sand-spit for the first time. The first tide conclave — whose name the sea has since taken away — picked up a half-buried clamshell and asked the sea what it wanted. The sea answered by surging for three days, until the name settled: Chao-hou-yuan — the house of the tide's expect, the vigil of salt.

The exact day the Institute was built is not recorded. The third chapter remembers the first conclave's name, but no one wrote it down. The clamshell he dropped remains at the chapel entrance — on the first of every month, when the tide withdraws, the shadow of half a shell still falls across the lintel.

---

## II · The Ninth Convocation (The Tide Lies · Founding of the Institute)

Built in the exact center of the fog harbor. The fog harbor sits sixty miles from the sea; around it lies a mud-flat with no sand-scour, no reeds, no grass of any kind. When they laid the foundations, the masons saw a complete tide-table under the harbor floor — a tablet most of which had been eroded away, leaving only two lines of sand-etched graduations and one handprint.

That stone now sits as the threshold of the south hall of the chapel — every watcher who pushes through the south-hall door steps across the palm of that handprint.

---

## III · The Nineteenth Convocation (The Tide Returns · The Lamps Become Common)

The tide-table was hung in the chapel for the first time. Until then, the Institute did not know when tides should rise or fall, and no one explained the rule. The conclave threw a clamshell into the harbor's mouth and declared that «the tide does not close.» It was a half-whispered sentence. From then on, the fog harbor began to count tides, number shells, and name each ebb and flood.

The ink bowl left for writing was left at this convocation — the attending copyist set a full clay bowl on a table in the south hall of the chapel and never took it back. After the third convocation, it became known as «the ink bowl left for writing» — an ink bowl the salt had already dried to a resting state.

---

## IV · The Twenty-Ninth Convocation (The Tide in Full · The Tide-Sand Table)

The greatest tide-sand-table convocation. The 232nd conclave arranged thirty-six clamshells on a cast-iron plate in the order of the tide — bright tides and dark tides were given their own strata. This convocation is remembered by the fog-harbor firms as «the day of no shame before the tide» — from this point on, tide-sand tables were drawn in public, copied in public, and read in public.

The copyist of this convocation wrote afterward: «I only set the shells in order for the conclave.»

---

## V · The Thirty-Sixth Convocation (The Tide Turns · The Rice-Jar Month)

The rice-jar month begins here. The copyists remember a sack of broken rice brought from the north salt valley, left unattended at the fog-harbor crossing at low tide. A water-carrier scooped seawater into it by accident — from then on, the watchers have kept the jar. The single grain floating at the top of the jar — never to sink — was first recorded as «the moon's grain for the one who will sit by the rice jar and not yet be seen.»

On dark evenings, when the copyists blew out their candles, the rice jar would breathe a faint light in the coal-bed mist — the night watchers waved fans to breathe the light out of the jar, so that the fog harbor could see it then as well.

---

## VI · The Forty-First Convocation (The Tide Locks · Dispersal)

The true record of this convocation does not live in the bible. It lies under the water. On the last morning of the forty-first convocation, before sunrise, the tide pulled back a full table. It receded as if someone had torn a sack of clouds in half with a knife. The Institute never again rose on tide — no convocation after this one was proclaimed in public.

No one at that convocation recorded the names of those present or the things hidden in the names. The blank forty-first page in the old index in the south hall of the chapel is what this convocation left for the next copyist — the copyist who succeeded. He kept it as «the page left for the sea,» bundled together with «the ink bowl left for writing» and «the old index in the south hall of the chapel.» He tied all three with a rope and sank them to the center of the harbor mouth by the crossing of the fog harbor.

---

## VII · Sixty-Nine Years (The Tide Falls Away)

The Institute today is in its sixty-ninth year since dispersal. No one has actually counted this number — sixty-nine years later, there is no one daring to archive it as a harvest. Currently the Institute has no conclave, only watchers. The watchers do not know who manages this building.


---

## Era Index

0 → The Institute founded (the fog retires; the clamshell set down) · The Rise
1 → The Ninth Convocation (the tide-table under the harbor floor) · The Tide Lies
2 → The Nineteenth Convocation (the tide-table hung; «the tide does not close») · The Tide Returns
3 → The Twenty-Ninth Convocation (the tide-sand table) · The Tide in Full
4 → The Thirty-Sixth Convocation (the rice-jar month) · The Tide Turns
5 → The Forty-First Convocation (dispersal) · The Tide Locks
6 → Sixty-Nine Years (no one conclave) · The Tide Falls Away
`,
  },
  {
    order: 2,
    slug: 'appx-002-institute-glossary',
    titleZh: '低语诸王 · 世界大典 · 名录（附录二）',
    titleEn: 'The Whispers\' Kings · World Bible · Institute Glossary (Appendix II)',
    eraLineZh: '',
    eraLineEn: '',
    markdownZh: `# The Whispers' Kings · World Bible · Institute Glossary (Appendix II)

> 名录用于指认权威条目。每个条目的定义以正典为唯一法源，不可凭常识推断字典释义。
> 本附录不用于锚句校验，列于正典与回响之间。纪律：每个词条附双语对应，与正典同一把规矩。
>
> This is the canonical directory. Definitions derive from the canon alone — do not infer from ordinary usage.
> This appendix carries no anchor sentences and is not used by the verifier. Short-form discipline, same as the canon.

---

## 潮候院
- **潮候院**（cháohòu yuàn）：雾港的守望之所；潮候院是世界大典所记载的唯一建筑名。
- **Tide Conclave**: the watchers' hall at the fog harbor. The only architectural name preserved in the bible.

## 雾港
- **雾港**（wù gǎng）：中国北海（北芦苇海）入海口的一个古代港口；据潮沙盘推算距海岸约六十里。
- **Fog Harbor**: an ancient port at the mouth of the north Reed Sea. By the tide-sand table's computation, it lies about sixty miles from the open sea.

## 里巷子
- **里巷子**（lǐ xiàng zi）：雾港本地最古老、潮汐最远的住所区；里巷子位于雾港最不潮湿的一圈，几乎从未退到潮沙盘可见的沙线。
- **Back Alley**: the oldest district of the fog harbor — the driest ring within the harbor's bowl. The sea has withdrawn only to here in most years.

## 潮汐教团
- **潮汐教团**：未在正典分章中出现，泛指所有参与四十一次大会的值守志愿和抄本员。
- **The Tide Conclave**: not given a dedicated chapter; used as a collective for all watcher-volunteers and copyists of the forty-one convocations.

## 潮沙盘
- **潮沙盘**（cháo shā pán）：潮候院最有影响力的物件——一张按潮汐日相刻写贝壳的铁板，桥廊架在祠殿前厅。
- **Tide-Sand Table**: the Institute's most influential artifact — an iron plate into which clamshells were set in the order of tide-tables; displayed in front of the chapel hall.

## 值更院
- **值更院**（zhígēng yuàn）：雾港内院值更们的住处；米缸月、值更班、酉时交替都发生在此。
- **The Datecourtyard**: the watchers' residence inside the Institute. The rice-jar month, watcher shifts, and hour-of-roost shifts are conducted here.

## 米缸月
- **米缸月**（mǐ gāng yuè）：每年当雾港的潮汐退到最深处的一个月份；其值更班十五天，即今日所有大会（第四十一次大会）之后的常规值守周期。
- **Rice-Jar Month**: the month in which the tide retreats to its greatest depth in the fog harbor; the watch cycle runs for fifteen days — it is the year's principal watch after the forty-first convocation.

## 抄本员
- **抄本员**（chāo běn yuán）：雾港里所有负责抄录潮汐、贝壳、值更册、索引、契约和旧批注的人。
- **Copyist**: the fog harbor's name for every person who records tides, shells, registers, indices, pacts, and glosses.

## 值更长
- **值更长**（zhígēng zhǎng）：值更班的上头人。新值更和值更院长辈的交替以酉时落班为时。
- **Head Watcher**: the chief of the watcher yard. New watchers and senior watchers pass at the hour of the rooster.

## 第四十一次大会
- **第四十一次大会**（dì sì shí yī cì dàhuì）：见正典第五章《收件人》。散会以来六十九年没有人再提大会的正式活书。
- **The 41st Convocation**: see the fifth chapter, The Addressee. Sixty-nine years since dispersal; no one has named the conclave's official record book again.

## 祠殿
- **祠殿**（cí diàn）：潮候院最具仪式感的一个空间——屋檐下有半个手印、数十盏不点的灯、一个剩下的零贝壳，与半张的调。
- **The Chapel**: the rite's most ceremonial space. The eaves carry half a handprint, and unlit lamps, half-lit lanterns, and a single remaining clamshell.

## 渡口
- **渡口**（dù kǒu）：雾港边最右的出口；渡船是全雾港唯一可达外侧的交通工具。
- **The Crossing**: the outer way out of the fog harbor; the ferry is the only means of exit.

## 留书的墨碗
- **留书的墨碗**（liú shū de mò wǎn）：见第四十三章《留书的墨碗》。
- **The Ink Bowl Left for Writing**: see echo No. 43.

## 日影
- **日影**（rìyǐng）：雾港南祠殿屋顶上的太阳钟，记日出、日中与落潮。
- **Shadi**: the sun-dial atop the chapel roof. Measures dawn, noon, and the receding tide.

## 半月潮
- **半月潮**（bàn yuè cháo）：见回响四十九章《半月潮》。
- **Half-Moon Tide**: see echo No. 49.

## 不散的时辰
- **不散的时辰**（bù sàn de shí chén）：见回响四十六章《不散的时辰》。
- **The Unstruck Hour**: see echo No. 46.

## 候渡人
- **候渡人**（hòu dù rén）：见回响四十八章《候渡人》。
- **The Waiting Passenger**: see echo No. 48.

## 未结
- **未结**（wèi jié）：见回响四十五章《未结》。
- **The Unfinished Knot**: see echo No. 45.

## 候潮石
- **候潮石**（hòu cháo shí）：见回响三十八章《候潮石》。
- **The Tide-Stone**: see echo No. 38.

## 值更图
- **值更图**（zhígēng tú）：见回响四十章《值更图》。
- **The Roster**: see echo No. 40.
`,
    markdownEn: `# 低语诸王 · 世界大典 · 名录（附录二）

> This is the canonical directory. Definitions derive from the canon alone — do not infer from ordinary usage.
> This appendix carries no anchor sentences and is not used by the verifier. Short-form discipline, same as the canon.
>
> 本附录用于指认权威条目。每个条目的定义以正典为唯一法源，不可凭常识推断字典释义。
> 纪律：每个词条附双语对应，与正典同一把规矩。

---

## 潮候院 · Tide Conclave
- **潮候院**（cháohòu yuàn）：the Institute; the only architectural name preserved in the canon.
- **Tide Conclave**: the watchers' hall at the fog harbor. The only architectural name in the bible.

## 雾港 · Fog Harbor
- **雾港**（wù gǎng）：an ancient port at the mouth of the north Reed Sea. By the tide-sand table, about sixty miles from the open sea.
- **Fog Harbor**: an ancient port at the mouth of the north Reed Sea. By the tide-sand table's computation, it lies about sixty miles from the open sea.

## 里巷子 · Back Alley
- **里巷子**（lǐ xiàng zi）：the oldest district in the fog harbor — the driest ring within the harbor's bowl; the tide rarely reaches it.
- **Back Alley**: the oldest district of the fog harbor — the driest ring within the harbor's bowl. The tide almost never reaches here.

## 潮汐教团 · The Tide Conclave Collective
- **潮汐教团**：not given a dedicated chapter; used to refer collectively to all watcher-volunteers and copyists of the forty-one convocations.
- **The Tide Conclave Collective**: not given a dedicated chapter; refers collectively to the watcher-volunteers and copyists of all forty-one convocations.

## 潮沙盘 · Tide-Sand Table
- **潮沙盘**（cháo shā pán）：the Institution's most influential artifact — an iron plate inscribed with clamshells in the order of the tide; displayed in front of the chapel hall.
- **Tide-Sand Table**: the Institute's most influential artifact — an iron plate upon which clamshells were set in the order of the tides; it now rests in the courtyard before the chapel.

## 值更院 · The Datecourtyard
- **值更院**（zhígēng yuàn）：the watchers' residence inside the Institute. Rice-jar month, watcher shifts, and hour-of-roost handovers are conducted here.
- **The Datecourtyard**: the watchers' residence inside the Institute. The rice-jar month, watcher shifts, and hour-of-rooster handovers are all conducted here.

## 米缸月 · Rice-Jar Month
- **米缸月**（mǐ gāng yuè）：the month in which the fog retreats to its deepest point; the watch cycle lasts fifteen days — the principal watch after the forty-first convocation.
- **Rice-Jar Month**: the month of greatest fog retreat in the fog harbor; the watch cycle lasts fifteen days — the principal watch after the forty-first convocation.

## 抄本员 · Copyist
- **抄本员**（chāo běn yuán）：the fog harbor's name for recorders of all tides, shells, registers, indices, pacts, and glosses.
- **Copyist**: the fog harbor's name for everyone who records tides, shells, registers, indices, pacts, and glosses.

## 值更长 · Head Watcher
- **值更长**（zhígēng zhǎng）：the chief watcher; new watchers and senior watchers trade places at the hour of rooster.
- **Head Watcher**: the chief of the watchers; new and senior watchers change at the hour of rooster.

## 第四十一次大会 · The 41st Convocation
- **第四十一次大会**（dì sì shí yī cì dàhuì）：see the fifth chapter, «The Addressee». Sixty-nine years have passed since dispersal; no one has named the official record book again.
- **The 41st Convocation**: see the fifth chapter, «The Addressee». Sixty-nine years since dispersal; no one has called the conclave's record book by name again.

## 祠殿 · The Chapel
- **祠殿**（cí diàn）：the most ceremonial space of the fog harbor — half a handprint beneath the eaves, lamps unlit, a single clamshell remains.
- **The Chapel**: the most ceremonial space of the fog harbor — half a handprint under the eaves, lamps unlit, one clamshell remained.

## 渡口 · The Crossing
- **渡口**（dù kǒu）：the only outer way out of the fog harbor; the ferry is the only means out.
- **The Crossing**: the only outer way out of the fog harbor; the ferry is the only means out.

## 留书的墨碗 · The Ink Bowl Left for Writing
- **留书的墨碗**：see echo No. 43.
- **The Ink Bowl Left for Writing**: see echo No. 43.

## 日影 · Shadi
- **日影**：the sun-dial atop the chapel roof. Measures dawn, noon, and the retreating tide.
- **Shadi**: the sun-dial atop the chapel roof. Keeps dawn, noon, and the retreating tide.

## 半月潮 · Half-Moon Tide
- **半月潮**：see echo No. 49.
- **Half-Moon Tide**: see echo No. 49.

## 不散的时辰 · The Unstruck Hour
- **不散的时辰**：see echo No. 46.
- **The Unstruck Hour**: see echo No. 46.

## 候渡人 · The Waiting Passenger
- **候渡人**：see echo No. 48.
- **The Waiting Passenger**: see echo No. 48.

## 未结 · The Unfinished Knot
- **未结**：see echo No. 45.
- **The Unfinished Knot**: see echo No. 45.

## 候潮石 · The Tide-Stone
- **候潮石**：see echo No. 38.
- **The Tide-Stone**: see echo No. 38.

## 值更图 · The Roster
- **值更图**：see echo No. 40.
- **The Roster**: see echo No. 40.
`,
  },
  {
    order: 3,
    slug: 'appx-003-the-salt-boundaries',
    titleZh: '低语诸王 · 世界大典 · 盐线志（附录三）',
    titleEn: 'The Whispers\' Kings · World Bible · The Salt Boundaries (Appendix III)',
    eraLineZh: '',
    eraLineEn: '',
    markdownZh: `# The Whispers' Kings · World Bible · The Salt Boundaries (Appendix III)

> 本附录按地理顺序记录潮候院与雾港的各处地点，供问典定位与典籍室渲染之用。
> 本附录不记录任何活着的人物；只记录潮汐、风向、沙子、墨水与贝壳。
>
> 纪律：附录与正典同一把规矩：锚句 zh/en 不用于校验，但作为 Appendices 为 digest 提供定位信息。
>
> This appendix walks the geography of the Institute and the fog harbor in order, for the benefit of the Inquiry and the shelf.
> It records no living person; it records tides, wind, sand, ink, and shell.
>
> Same discipline as the canon: this appendix carries no anchor sentences; it is added to the digest so the model can locate places.

---

## 一 · 雾港入口
雾港位于北芦苇海的入海口，从空中俯瞰像一片裸露的铁盘——60 里外没有一片建筑物，只有渡口和兵营壳。潮汐退到芒草碛滩最深的时候，雾港才能从外侧通行——潮水没有真的「退走」，只是在碛滩上留下一条白色的路。

---
## 二 · 渡口（du kǒu）
雾港渡口是全雾港唯一的大通道。它由两块半座石舫加一艘沉船的浮桥组成，74 年从未完全显出过它最终的轮廓——每当潮汐涨到最高点，浮桥就没入水底，只剩船尾侧的开启痕。

---
## 三 · 里巷子（lǐ xiàng zi）
里巷子是雾港最老的一个区，潮水在这里从来不曾到达过。雾港人代代在此生活，抄写潮汐表、染料，照亮第四十一次大会散会后的黑暗。

---
## 四 · 值更院（zhígēng yuàn）
值更院是潮候院最中心的一座院落。值更们在这里轮班、吃粥、抄写贝壳。米缸月第七日的值更班一直没有休过任何一次。

---
## 五 · 祠殿（cí diàn）
祠殿是第一次进入潮候院的访客所看到的最后一个空间。巨大的海棠色穹顶，南窗从西方进入的光，地板上的雾水，鹰头安放在两根断柱之间。

---
## 六 · 米缸月（mǐ gāng yuè）
---
连续十五天的值更在米缸月里轮班。米缸月里的所有窗口都打开，让风把潮水从远处吹到渡口。值更们管这叫做「把潮汐留到海里」。

---
## 七 · 潮沙盘（cháo shā pán）
潮沙盘是雾港最大的铁板。所有潮候都曾经把贝壳放在上面，按潮汐顺序。潮沙盘的表面被海风蚀成白色——从上面数下去，刻度正好够指认最后 60 年的潮汐按沙面蚀得最严重的部分。

---
## 八 · 雾港火车站
雾港火车站是散会之后最大未被包括在潮汐表的人造物。它从未开过，但每个轮班的新值更第一次绕雾港时，都要停在雾港火车站前面，点一支烟或一罐盐。


---

## Appendix Index

Fog harbor mouth → The Crossing → Back Alley → The Institute → The Chapel → The Rice-Jar Month → The Tide-Sand Table → The Station

（雾港入口 → 渡口 → 里巷子 → 潮候院 → 祠殿 → 米缸月 → 潮沙盘 → 雾港火车站）
`,
    markdownEn: `# 低语诸王 · 世界大典 · 盐线志（附录三）

> This appendix walks the geography of the Institute and the fog harbor in order, for the benefit of the Inquiry and the shelf.
> It records no living person; it records tides, wind, sand, ink, and shell.
>
> Same discipline as the canon: this appendix carries no anchor sentences; it is added to the digest so the model can locate places.
>
> 本附录按地理顺序记录潮候院与雾港的各处地点，供问典定位与典籍室渲染之用。
> 本附录不记录任何活着的人物；只记录潮汐、风向、沙子、墨水与贝壳。

---

## I · The Fog harbor mouth
The fog harbor lies at the mouth of the north Reed Sea. From above, it looks like a bare iron plate — for sixty miles in every direction there is nothing, only the crossing and a shell of the barracks. When the tide falls its deepest, you can pass around the outer side; the tide never truly «withdraws,» it only leaves a white road on the sand.

---
## II · The Crossing (du kǒu)
The fog-harbor crossing is the only great way out. It is composed of two half-born barges of stone and one sunk ship used as a floating bridge; for seventy-four years it has never fully revealed its final shape — at high tide it disappears into the water; only the unfinished mark on the stern-side remains.

---
## III · The Back Alley (lǐ xiàng zi)
The Back Alley is the fog harbor's oldest district. The tide has never reached it. Generations of fog-harbor folk have lived here; they made the tide-tables, dyed cotton, lit their ways in the dark after the dispersal of the forty-first convocation.

---
## IV · The Datecourtyard (zhígēng yuàn)
The Datecourtyard is the Institute's central courtyard. The watchers take shifts, eat porridge, copy shells here. On the seventh day of the rice-jar month no watch shift has ever been cancelled.

---
## V · The Chapel (cí diàn)
The chapel is the last space the visitor sees before the Institute opens to them. A vast copper-tinted dome; westerly light through the south windows; mistwater on the floor; two severed pillars with a hawk's head set between them.

---
## VI · The Rice-Jar Month (mǐ gāng yuè)
---
During the fifteen days of the rice-jar month the watchers take turns. Every window stays open during those fifteen days; the wind pushes the tide from somewhere far along the coast to the crossing. The watchers call that «bringing the tide back into the sea.»

---
## VII · The Tide-Sand Table (cháo shā pán)
The Tide-Sand Table is the largest iron plate the fog harbor has. Every conclave has put clamshells upon it in order of tide. Salt air has eroded its surface to a pale white — counting from the top, the degrees are just enough to identify the last sixty years by which part the sand eroded most severely.

---
## VIII · The Fog Harbor Terminus
The so-called terminus was the greatest single thing never included in any tide-table after dispersal. It has never been opened. But every watcher, on their first round through the fog harbor, stops in front of the terminus and lights either a cigarette or a pouch of salt.


---

## Appendix Index

The fog harbor mouth → The Crossing → The Back Alley → The Datecourtyard → The Chapel → The Rice-Jar Month → The Tide-Sand Table → The Terminus
`,
  },
  {
    order: 4,
    slug: 'appx-004-watchers-code',
    titleZh: '低语诸王 · 世界大典 · 值更院守则（附录四）',
    titleEn: 'The Whispers\' Kings · World Bible · Watcher\'s Code (Appendix IV)',
    eraLineZh: '',
    eraLineEn: '',
    markdownZh: `# The Whispers' Kings · World Bible · Watcher's Code (Appendix IV)

> 本附录为值更院全部值守的守则，散会后六十九年以来没有人修改过它。
> 它是口传而来的——没有人把它写下来过，也没有人谁声称它是写下来的。
> 当值更开始记录和朗诵这份守则时，守则把抄本员写了进去，变成抄本员以后的。
> 纪律：与正典同一把规矩——双语对应、双语对照、双语对写。
>
> This appendix records the rulebook of the Institute's watchers — unaltered for sixty-nine years since dispersal.
> It came down orally; no one wrote it; no one claimed anyone wrote it down.
> The moment the watchers began to recite and record it, it became the recorders'.
> Short-form discipline, same as the canon: matching bilingual lines, matching bilingual correspondence.

---

## 一 · 第一条 —— 等

潮不到，值更不立；潮到了，值更该候；候了多久，没人算。守则的第一条：等——等海浪，等贝壳，等抄本员写完字。

潮起潮落不分早晚——守则里只字不提生理时辰。值守只以潮汐为时辰。

潮多大，它就是多大。值更不等的潮，那条潮不算潮。

---

## 二 · 第二条 —— 不听见就是不听见

潮里传来的声音不可以被重复。这个规矩从第一代抄本员起就在——值更看见过听过潮里的声音，但没人能知道听到的是什么。

听见过的。没有人说。知道过的。没有人写。

---

## 三 · 第三条 —— 不问

潮沙盘是认真的。任何活物都不该再被问——问了就要把问过的话忘掉。

凉、潮、贝壳、盐。这是值更不必知道的东西。

---

## 四 · 第四条 —— 不留

i 粒沙、i 个浮贝壳、i 碗没写过字的墨——值更从不留。

米缸月第七日换更的时候，值更不会带一粒米走，哪怕是那一粒还没沉下去的米。

---

## 五 · 第五条 —— 抄

抄本员不当海之角色。抄本员只抄潮沙盘、米缸月、长须值更、酉时的光线传递的方向——抄。抄值守站在哪儿的，抄不是值守站在哪儿的。

---

## 六 · 第六条 —— 值

值更对着潮沙盘值，对着灯，对着米缸，对着火把。值更不属于任何个人。值更是雾港的眼睛。

---

## 七 · 第七条 —— 值完

值更没换班的时候，没人问他能换成谁。换完之后换不成的，没人问值更还在不在。

---

## 八 · 第八条 —— 值不完

守则没有「值完」这两个字。值更院里也没有「值完」这两个字。

---

## 九 · 第九条 —— 抄本员

i 个值更站在米缸月之前的地板上的时候，那个人叫做「抄值守」。多一个，也是抄值守。

---

## 十 · 第十条 —— 值更长

值更长见过整张沙盘，他有权走到米缸去。

---

## 十一 · 第十一条 —— 不值

抄值守换班之后去睡觉，米缸月的夜班没有从人去过的午夜梦回。

---

## 十二 · 第十二条 —— 灯

挑灯值守。

---

## 十三 · 第十三条 —— 睡

等换班来。

---

## 十四 · 第十四条 —— 备

不备。

---

## 十五 · 第十五条 —— 抄完

抄完值更院，值更长会来。他一停笔。值更院就抄到了这里。

---

## Appendix Index

I → 等 · II → 不听见 · III → 不问 · IV → 不留 · V → 抄 · VI → 值 · VII → 值完 · VIII → 值不完 · IX → 抄本员 · X → 值更长 · XI → 不值 · XII → 灯 · XIII → 睡 · XIV → 备 · XV → 抄完
`,
    markdownEn: `# 低语诸王 · 世界大典 · 值更院守则（附录四）

> This appendix records the rulebook of the Institute's watchers — unaltered for sixty-nine years since dispersal.
> It came down orally; no one wrote it; no one claimed anyone wrote it down.
> The moment the watchers began to recite and record it, it became the recorders'.
> Short-form discipline, same as the canon: matching bilingual lines, matching bilingual correspondence.
>
> 本附录为值更院全部值守的守则，散会后六十九年以来没有人修改过它。
> 它是口传而来的——没有人把它写下来过，也没有人谁声称它是写下来的。

---

## I · First —— Wait

When the tide has not arrived, the watcher does not stand. When the tide arrives, the watcher stands ready. How long he waits, no one counts. The first rule: wait — wait for the sea, wait for the shell, wait for the copyist to finish writing.

Tides come and go without hour. The rulebook never specifies the hour. Watchers only know the tide.

The tide is as large as the tide. The watcher who does not wait for it — that one tide does not count as a tide.

---

## II · Second —— What Is Not Heard, Is Not Heard

Sound from the tide may not be repeated. This rule has stood since the first copyists — watchers have seen, heard sounds in the tide, but no one can say what they heard.

Those who heard it did not speak of it. Those who knew it did not write of it.

---

## III · Third —— Do Not Ask

The tide-sand table is serious. No living thing should be questioned — once questioned, the question must be forgotten.

Cool, tide, shell, salt. These are things the watcher need not know.

---

## IV · Fourth —— Do Not Keep

i grain of sand, i floating clamshell, i bowl of ink unwritten-to — the watcher does not keep.

On the seventh day of the rice-jar month, when the watcher changes shift, he does not take a single grain of rice with him, not even the grain that never sinks.

---

## V · Fifth —— Copy

The copyist is not the face of the sea. The copyist only copies the tide-sand table, the rice-jar month, and the direction the western light travels at hour-of-rooster —— copies. Copies what stands at the tide-sand table; copies what does not.

---

## VI · Sixth —— Watch

The watcher watches facing the sand table, the lamp, the rice jar, the torch. The watcher belongs to no one — he is the eye of the fog harbor.

---

## VII · Seventh —— After the Watch Ends

When the watcher is still on shift, no one asks who can replace him. Once the shift ends, no one asks whether he still is.

---

## VIII · Eighth —— No End

The rulebook has no words for "after the watch ended." The Institute has no words for "after the watch ended."

---

## IX · Ninth —— The Copyists

i watcher standing before the rice-jar month on the floor — that person is called "copy-watch." One more, still copy-watch.

---

## X · Tenth —— The Head Watcher

The head watcher has seen the whole sand table; he may walk to the rice jar.

---

## XI · Eleventh —— No Watch

After the copy-watch goes off to sleep, the night shift of the rice-jar month never crosses a bed for dreaming.

---

## XII · Twelfth —— The Lamps

Raise lamp to watch.

---

## XIII · Thirteenth —— Sleep

Wait for the shift to come.

---

## XIV · Fourteenth —— Prepare

Do not prepare.

---

## XV · Fifteenth —— After Copying

Once the Institute is copied, the head watcher will come. He will put the pen down once. The Institute has been copied up to that point.

---

## Appendix Index

I → Wait · II → What Is Not Heard · III → Do Not Ask · IV → Do Not Keep · V → Copy · VI → Watch · VII → After the Watch Ends · VIII → No End · IX → The Copyists · X → The Head Watcher · XI → No Watch · XII → The Lamps · XIII → Sleep · XIV → Prepare · XV → After Copying
`,
  },
] as const;
