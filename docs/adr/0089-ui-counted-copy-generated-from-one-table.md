# ADR-0089：界面里那些"数出来的话"由表拼出来——件数、名单、解释不许各有一份

- 状态：已接受（2026-11-07，§SEC 第四十二片）
- 相关：`docs/adr/0088-paced-e2e-line-filter-sharding.md`（本片补的是它「没牙 6」那一格）、
  `docs/adr/0014-credits-are-derived-and-only-one-plan-axis-bites.md`（"哪几格真会拦人"这份账的来历）、
  `docs/adr/0082-rate-limit-driver-readout-ui.md`（同一族纪律：界面不认字，只照读）

## 背景

`/credits` 上有一段话专门负责让人相信"表格上的上限是真会拦人的"：

```
§133 点名的五件事今天全都有真的拦截方（aiUsage、storage、generation、publishing、teamCollaboration）：
额度为 0 时生成会被挡下（AI 任务与成片渲染各有一道门），存储写满时新的素材会被拒绝…
```

它整句手写在 `apps/web/src/app/credits/page.tsx` 里，只有括号里那份名单是 `{ENFORCED_PLAN_AXES.join('、')}`。
于是同一件事有三份写法：**件数（"五"）是手抄的、名单是数组、逐格解释又是手抄的**。
第四十片补记刚用臂 P1 证明过数组那半有牙（从 `ENFORCED_PLAN_AXES` 摘掉一格，用例红），
但那一格同时暴露了没牙的那半：**摘掉数组里的一格，页面那句"五件事"不会跟着改口**。
这一页说谎的代价不小——用户据此决定要不要相信"额度用尽会被挡下"。

## 选项

1. **只加一条静态门**：门盯着页面里不许出现"点名的五件事"这种写死的件数。
   否。它只拦得住"写死五"这一种写法，改成"写死六"或换措辞就绕过去了；而且它拦的是症状，
   真正的问题是这句话有三个写入方。
2. **把解释也写进 `ENFORCED_PLAN_AXES`（数组元素变成对象）**。
   否。那个数组今天被 `credits.test.ts` 用来钉"两列合起来一格不多一格不少"，
   把它从字符串列表改成对象列表会让那条已有的门一起变形，改动面比需要的也大。
3. **名单与解释各自留在域里，句子由一个纯函数拼，页面只照读**（选定）。
   件数、名单、逐格解释全部来自同一份入参；页面里不再有任何一个手抄的数字。

## 决定

1. **`ENFORCED_PLAN_AXE_WHY: Record<EnforcedPlanAxis, string>`**（`apps/web/src/server/domain/credits.ts`）。
   键类型取自 `ENFORCED_PLAN_AXES`，所以**加一格忘了写解释是编译错误**（臂 V2 逐字：
   `error TS2741: Property 'apiRateLimit' is missing in type '{ aiUsage: … }' but required in type 'Record<… | "apiRateLimit", string>'`）。
   这一格比运行时门更早响，而且不需要有人跑起来才生效。
2. **`planEnforcementReadout(enforced = ENFORCED_PLAN_AXES, unenforced = UNENFORCED_PLAN_AXES)`** 是那句话的唯一写法。
   入参**故意可以换**：测试传四格进去，句子必须改口说"4 件事"，那一格的名字与解释都不再出现。
   为什么强调这一点：一个忽略入参、把件数写死的实现照样能让"页面照读"那条门绿——
   臂 V1 就是拿这个形状验的（写死 `5` ⇒ 2 条用例红）。
3. **页面只留 `{planEnforcementReadout()}`**，并配两条静态门（读 `page.tsx` 源码）：
   `[data-credits-enforced]` 那一段落里不许出现 `§133`（句子只能来自函数），
   整个文件不许出现 `点名的\s*[0-9一二三四五六七八九十]+\s*件事` 或任何一条旧解释的原话。
   静态门是本仓库既有惯例（`api-response.test.ts` / `jsx-text.test.ts` 等都读源码），不是新发明。
4. **浏览器侧再钉一层"自洽"**：e2e 从界面文本里同时读出**件数**与**括号里点名的格子数**，要求两者相等。
   这一条不在用例里抄任何数组——它读的是页面自己端出来的那句话。
   臂 V4（把 `enforced.join('、')` 改成 `enforced.slice(0, 4).join('、')`，件数仍由数组拼）逐字红：
   `Error: 句子里写的是 5 件事，括号里点名了 4 格（aiUsage、storage、generation、publishing）`。
5. **数字用阿拉伯数字**（"5 件事"而不是"五件事"）。
   同一句里"另外 N 格"本来就是 `{length}` 拼出来的阿拉伯数字；混着写会让"哪个是生成的"这件事变模糊。

## 后果

- 那句话现在只有一个写入方：域里那两份表。改表 → 句子跟着改；改句子 → 只能改表。
- 代价是页面少了一点"随手改文案"的自由：想改措辞得去 `ENFORCED_PLAN_AXE_WHY`，
  而那里的键类型会逼着每格都有解释。这是本片想要的方向。
- **仍然没牙的那格**（如实记）：`ENFORCED_PLAN_AXE_WHY` 里每格那句解释**本身**对不对，没有任何门能验。
  它说的是"拦截方长什么样"，真值在 `refusalFor*` 那几道门里；今天靠的是 `credits-enforcement.integration.test.ts`
  逐道门验行为，而不是验那句话的措辞。把解释与门函数再钉一层（比如每格带上"拦截方是哪个函数"并由测试 import 它）
  是下一片的活，本片不假装已经做了。
- 另一格：`UNENFORCED_PLAN_AXES` 是非空时那句尾里的数字同样由入参拼，但今天它是空数组，
  所以那条分支只有单测覆盖（传 `['apiRateLimit']` 进去），界面上没有真读数。

## 见证（逐字）

- 单测：`apps/web/test/credits-enforced-copy.test.ts` **8 passed**；连同 `credits.test.ts` +
  `credits.integration.test.ts` ⇒ **44 passed (3 files)**。
- 浏览器：`@smoke §134 跑一次生成 → 额度页少 1 点…` **1 passed (4.5s)**（本机 3100，`--workers=1`），
  并新增元素截图 `screenshots/credits-enforced-copy.png`（那句话自己的图，不是整页）。
- 恢复后重跑同一条：**1 passed (6.8s)**；`grep -rn "MUT " apps/web/src` ⇒ `0`，
  `credits.ts` / `page.tsx` 的 `md5sum` 回到臂前基线（`0890c293a169bcfec2256806004e836e` / `ca2ba8288568e0ae61e89b067055fc6f`）。

## 臂表

| 臂 | 摘掉什么 | 逐字红 | 恢复后 |
| --- | --- | --- | --- |
| V1 | 把件数写死成 `5`（忽略入参） | `expected '§133 点名的 5 件事…' to contain '§133 点名的 4 件事'` + `expected false to be true` ⇒ **2 failed** | 8 passed |
| V2 | 给 `ENFORCED_PLAN_AXES` 加一格 `apiRateLimit`（不写解释） | `error TS2741: Property 'apiRateLimit' is missing …`（tsc）+ **5 failed**（含 `credits.test.ts` 那条"两列合起来一格不多一格不少"）；同时句子自己改口成"6 件事"——证明拼装的正是入参 | tsc 无输出、34 passed |
| V3 | 页面里把那句话再抄一遍 | 静态门 **2 failed**：`expected 'data-credits-enforced>…' not to contain '§133'`、`expected 'import Link…' not to match /点名的\s*[0-9一二三四五六七八九十]+\s*件事/` | 8 passed |
| V4 | 名单只点前四格、件数仍由数组拼 | e2e：`Error: 句子里写的是 5 件事，括号里点名了 4 格（aiUsage、storage、generation、publishing）` ⇒ **1 failed** | 1 passed (4.5s) |
