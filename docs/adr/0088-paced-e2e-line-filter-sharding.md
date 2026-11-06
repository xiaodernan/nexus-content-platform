# ADR-0088： paced e2e 的跑法——不改闸、不等我猜的数、一次只发起我点得到的那几条

- 状态：已接受（2026-11-06，§SEC 第四十片）
- 相关：`docs/adr/0070-forwarded-ip-take-rightmost-trusted-hop.md`（按 IP 的闸取可信链右端 ⇒ 本机全部浏览器用例共用一个桶）、
  `docs/adr/0076-rate-limit-async-and-observability.md`、`docs/adr/0081-rate-limit-redis-bucket-key-ceiling.md`、
  `docs/ENVIRONMENT.md`（「建项目也有限流」那两条是本片的算式来源）、`docs/adr/0087`（上一片，同一族"账要闭合、界面不认字"的纪律）

## 背景

`e2e/studio.spec.ts` 从来没有一次全绿过。逐字的历史读数是：2026-11-05 那次后台整份跑 =
**18 passed / 37 failed**，37 条同一成因——`createProjectNamed` 收到 **HTTP 429**、
界面上写「建项目太频繁了，稍后再试」，helper 把服务端算好的 `retryAfterMs` 原样报出来（那次是「还要等 41 分钟」）。
这不是回归，是**名额**：

- `POST /api/projects` 按 IP 限 **20 次/小时**（`apps/web/src/app/api/projects/route.ts` 的 `ipWriteGate('projects/create', …)`）；
- 这一份文件有 **57 条用例、59 处建项目调用**（逐字：`createProject(page,` 57 + `createProjectNamed(page,` 1 +
  `createProject(visitor,` 1；`:2828 §132 拉黑与屏蔽`那一条建两次 ⇒ 59 > 57）；
- 整个 `e2e/` 目录 **21 个文件共 98 处**建项目（`docs/ENVIRONMENT.md` 逐文件列表）。
  本片初稿写的"84 处"是 `grep -c` 按**行**数的（一行两次就少算一次），ENVIRONMENT 那次核对的口径又只认
  第一实参写 `page` 的调用——**两个都是下限，不是实况**；补记按 occurrence 口径重新量过（98）。
- 本机 `docs/ENVIRONMENT.md` 早写着这两个桶是**一台机器一个**：Next 在 `x-forwarded-for` 缺席时拿 socket 地址填，
  本机没有反代，所以浏览器用例全部落在同一个 `::1` 上（并行会话也在这个桶里）。

于是"跑一遍 studio"这件事在本机的真实成本是 **≥ 57 ÷ 20 ≈ 2.85 小时**，与代码无关，是闸的算术。
本片不改闸，改的是**跑法**与**跑法的仪器**。

## 选项

1. **为测试放宽那道闸**（把 limit 调大、或给 e2e 一个 env 开关）。
   否。§SECURITY 的防批量建号，且是本仓库反复钉过的红线（"不要为了跑测试放宽服务端那两道闸"）。
2. **合成身份绕开按 IP 的桶**（写 `x-forwarded-for` 或 `Forwarded: for=` 造多个桶）。
   否，而且要写进文档让人看见为什么否：那条头是**客户端可写**的，本仓库第 26 片（ADR-0070）专门把它从
   左端换成可信链右端，就是因为"任何人加一行头就换一个新桶"会让这两道闸空转。
   测试自己写这一行头去躲闸，**和攻击者的用法一字不差**——那是伪造身份躲开一道安全控制，与放宽同罪。
3. **把 57 条拆成多份文件，好让 Playwright 的 `--shard` 生效**。
   否。理由见下面"决定 1"里那句实测：`--shard` 按**文件**分配，所以单文件确实拆不开——但为此
   把一份共用同一套 helper 的 57 条切成五个文件，是**为了测量工具改产品结构**；那五个文件之后
   每个都要重复 import、重复 fixture，而产品并没有因此多出任何东西。
4. **`--grep` 按标题点名**。可行的替代，但标题里有 `（）§` 与正则元字符，且两条标题可能互为前缀
   （本文件里就有 `@smoke studio slice: …` 这种公共前缀），转义与误点的面积比行号大。
5. **一次发起我点得到的那几条 + 照服务端给的数等**（选定）。
   仪器只做三件事：列出用例、按下标分段、用**行号 filter** 逐条点名；片间隔的是**服务端自己算的分钟数**。

## 决定

1. **分片不用 `--shard`，用行号 filter 自己点名**。
   这一条是被一次**假成功**逼出来的：上一版脚本按 `--shard=i/5` 跑，`--list` 逐字读回来是

   ```
   shard 1/5: 57 条
   shard 2/5: 0 条
   shard 3/5: 0 条
   shard 4/5: 0 条
   shard 5/5: 0 条
   ```

   Playwright 的 shard 以**文件**为单位分配，一份文件不可能拆开 ⇒ 名义上五片，实际第一片装着全部 57 条去撞闸，
   后四片各跑了一次"我这边没用例"的空跑。若没人去 `--list` 验一次口径，这五片里会出现四行绿而一条用例都没跑。
   现在：`--list --reporter=list` 把 `studio.spec.ts:85:5 › …` 这种行解析成 `{line, title}`，按下标连续切成 N 段，
   每段以位置参数 `e2e/studio.spec.ts:85 e2e/studio.spec.ts:100 …` 发起。
   **多个位置 filter 是并集**这一点单独验过：三条 filter ⇒ `Total: 3 tests in 1 file`。
   行号取的是 `--list` 报出来的**声明行**，Playwright 把一行映射到"该行或之前最近的声明"，
   所以声明行本身点中的恰是那一条（`e2e/studio.spec.ts:40` 这种非声明行点不到任何用例，正是它没有语义的证明）。
2. **两本账同口供：这一片发起的条数 == Playwright 自己那句 `Running N tests`**。
   `claimed === null`（那句读不到）**也算红**。原来写成 `claimed !== null && claimed !== group.length`，
   等于"解析不到就当对得上"——换 reporter、Playwright 改措辞、输出被截断，这一格会静默失明，
   而它要拦的恰恰是最危险的那种红：**exit=0、passed 数字也齐，看着全绿，实际有几条从未被发起过**。
3. **等多久由服务端那句决定**。撞闸时 helper 那句话里带 `还要等 X 分钟`（服务端按滑动窗口算的
   `retryAfterMs`），脚本照 `max(cooldownMin, X + 1)` 睡，并把这句原话端出来。
   没撞就照 `--cooldown-min` 等。上一版无论撞不撞都睡死 61 分钟，而文件头自称"等的是服务端算出来的那个数"——
   那句话原来**不成立**，现在成立。
4. **一次只跑一份 Playwright，并且锁在 `--list` 之前拿**。
   锁的意义是"这个工作区里同时只有一份 Playwright 在动"，而 `--list` 本身也是一次 Playwright 启动：
   顺序反了，第二份会先做完列举再撞死在锁上，那时它已经动过工作区。
   `--list` 与每一片都带自己的 `--output`：Playwright 启动会先清它的 output 目录，那次清是**递归**的，
   默认那棵 `test-results/` 条目一多就被沙箱的批量删除守卫挡下（`docs/ENVIRONMENT.md` 有整节），
   指到脚本自己的目录既绕开守卫，也不去动并行会话正在用的那棵。
   被锁挡住的那一份**不删别人的锁**（臂 A1 验）。
5. **两种发起形状，按需要选**：
   - `--only i`：**一片一次、不睡**。坏一片只坏一片，适合"人守着按窗口发"的跑法。
   - `--from k`：**从第 k 片起连跑到尾**，片间睡 `--cooldown-min`（撞了闸改睡服务端那句给的数）。
     把一片降到**1 条用例**（`--shards 57`）再配 `--cooldown-min 3`，睡的就是闸自己的补名额速率
     （20 次/小时 ⇒ 每 3 分钟吐一个），这是这台机器上"57 条全绿"的**墙钟下界**：约 2.9 小时，
     与代码无关。被打断也从 `--from` 续跑，不必整晚重来。
   为什么不做成"一片里塞 12 条 + 睡 61 分钟"：那也停在 2.9 小时的下界上（5 片 × 12 条要 4 个窗口），
   却把 Chromium 的一次偶发退出放大成"这一片剩下的 8 条没跑"。2026-11-06 实测：
   一次连跑在第 4 条上被 `code=3221225794`（0xC0000409，本机 1.85GB 空闲下的 worker fast-fail）打断，
   后面四片跟着没跑。片越小，一次仪器故障影响的用例越少。
6. **`--plan`：先把切法打出来再跑**。分片器本身要能被单独验一次，否则第一次知道切错的代价是整晚的窗口。
   它同时报"合计 N 条、行号互不重复"——重复行号意味着一条用例被两片各跑一次，
   而那正是"57 条全绿"里最容易被数字掩盖的形状。
   （补记 2026-11-07：这里原来只在**每组内部**查重复，所以"同一条用例被相邻两片各点一次"报不出来——
   `duplicateLines` 改成对**整表**查，`--plan` 现在三个数一起报：`合计 57 条（列出 57 条）` / `漏 0 条` /
   `同行号 0 个`，任一不为 0 就 `exit=1`。）
7. **输出边跑边落盘**（`spawnSync` → `spawn`）。一片跑 4–20 分钟，而 `spawnSync` 只在结束时一次性写文件：
   期间日志是空的，"这一片是慢还是已经死了"只能靠猜。汇总口径一字未变（仍从完整文本现读）。
8. **`expect.timeout` 从 5 秒抬到 20 秒**（`playwright.config.ts`）。这是**仪器的节拍**，不是产品的性能承诺：
   抬它的证据是两条 @smoke 在 5 秒边界上红，而 DOM 里写着 `处理中…`、面板按钮全 `[disabled]`（请求还在飞），
   热身后同一条 15.1 秒过；本机慢的两台原因是 on-demand 编译与 Postgres 跑在 Docker bind mount 上
   （`docs/ENVIRONMENT.md` 记过）。性能另有账：`npm run perf:browser` 与 `scripts/*-cost.mts`，**不靠这个旋钮说话**。
9. **闸与回归分得开**：一片红了，先看日志里有没有那句"建项目被服务端拒了"。有 ⇒ 窗口没等够；
   没有 ⇒ 按真回归处理。这条判据只在**界面上真有那句话**时成立，所以它依赖 `createProjectNamed`
   把 POST 的答复原样接住（第 27 片补的那半句），而不是自己数退出码。

## 后果

- studio 那 57 条第一次有可能跑到全绿，代价是**约 3 小时的墙钟**，而且这 3 小时里名额还要和并行会话分。
  这笔账要写在文档里，否则下一个人在自己的机器上跑一次全红，会以为产品坏了。
- 跑法变成"一条命令 + 一个可读的半成品"：`<out>/paced-summary.md` 逐片记 `exit / passed / failed / skipped`
  与两本账的读数，中途被打断也留得下证据。
- 分片按下标连续切段，**不按用时均衡**：一片的长短取决于段里恰好有几条慢用例。
  选了简单可审计的形状，放弃复杂但没必要的形状。
- 行号 filter 有一个真实代价：**改过 `e2e/studio.spec.ts` 之后行号会漂**。
  脚本每次跑前重新 `--list`，所以同一次调用内不会错；跨调用（今天记的 `:85`、明天去查）只是可读性下降，
  因为日志里同时写了标题。
- **98 处**建项目在整个 e2e 目录里（补记按 occurrence 口径重新量过；初稿那个"84"与 ENVIRONMENT 那个"97"都是下限）
  ⇒ **整目录一次跑全绿需要 ≥5 个窗口**。
  补记后 studio 那一份已经跑到底（57 条每条有读数），其余 20 个建项目的文件按同样算法待排（见"仍欠"）。

## 见证（逐字读数）

分片口径（`--list`，`e2e/studio.spec.ts`）：

```
Total: 57 tests in 1 file
shard 1/5: 57 条 / shard 2/5: 0 条 / shard 3/5: 0 条 / shard 4/5: 0 条 / shard 5/5: 0 条   ← 旧跑法（--shard）
```

行号 filter 是并集：

```
npx playwright test "e2e/studio.spec.ts:85" "e2e/studio.spec.ts:100" "e2e/studio.spec.ts:139" --list
  [chrome] › studio.spec.ts:85:5 › @smoke studio slice renders the model on canvas with DEMO MODE visible
  [chrome] › studio.spec.ts:100:5 › @smoke studio slice: select, edit a property, undo, autosave
  [chrome] › studio.spec.ts:139:5 › @smoke studio slice: server snapshot is created and restored through the database
Total: 3 tests in 1 file
```

`--plan` 的切法（5 片）：

```
[paced] … 共 57 条用例，切成 5 片（12/12/12/12/9 条）
合计 57 条，行号互不重复（切法按下标连续分段，一条用例只会被一条行号 filter 发起）
```

第 1 片（12 条，声明行 85…802）：

```
Running 12 tests using 1 worker
  12 passed (3.9m)
- 2026-11-05 20:18:54 片 1/5（发起 12 条，Playwright 报 12 条）：exit=0，passed=12 failed=0 skipped=0｜12 passed (3.9m)
```

服务端自己那句名额（同一次窗口内两次独立读数，互相咬合）：

```
20:25:10 … （还要等 23 分钟）        → 最老一条在 20:48 到期
20:32:55 … 服务端自己算的：还要等 **15 分钟** ⇒ 这一片至少 16 分钟后重发   → 同一个 20:48
```

滴跑到底（补记 2026-11-07；`--shards 57 --from 1 --cooldown-min 3`，`.scratch/pw-paced-drip/paced-summary.md` 共 57 行）。
时间戳是 UTC（那一份跑在旧 `stamp()` 下、没带 `Z`；补记后 `stamp()` 补上了 `Z`——本机 UTC+8，读错的代价是 8 小时）：

```
- 2026-11-05 20:49:27 片 1/57（发起 1 条，Playwright 报 1 条）：exit=0，passed=1 failed=0 skipped=0｜1 passed (6.2s)
…
- 2026-11-05 22:37:18 片 34/57（发起 1 条，Playwright 报 1 条）：exit=1，passed=0 failed=1 skipped=0｜1 failed
- 2026-11-05 23:04:19 片 42/57（发起 1 条，Playwright 报 1 条）：exit=0，passed=0 failed=0 skipped=1｜1 skipped
- 2026-11-05 23:31:31 片 50/57（发起 1 条，Playwright 报 1 条）：exit=1，passed=0 failed=1 skipped=0｜1 failed
- 2026-11-05 23:35:02 片 51/57（发起 1 条，Playwright 报 1 条）：exit=1，passed=0 failed=1 skipped=0｜1 failed
- 2026-11-05 23:54:27 片 57/57（发起 1 条，Playwright 报 1 条）：exit=0，passed=1 failed=0 skipped=0｜1 passed (9.1s)
```

**53 绿 + 1 跳 + 3 红，57 行两本账全对上，全程零 429**。那 1 跳是 `studio.spec.ts:3226 §163 断线重开`，
它自己写着 `test.skip(!process.env.NEXUS_REALTIME_MAX_LIFETIME_MS, …)`，与 §163 实时通道那支互斥——
不是滴跑漏了它，是那一格要的是**一个运行前提**。
三条红的都是"用例认旧说法"（`:2364 相关度排序` / `:4029 只有` / `:4087 toBeDisabled`），
逐字红文、根因提交与修法见 `docs/ROADMAP.md`「第四十片补记」——**这一族红此前从未被看见过**，
因为每次整份跑都死在 429 上、走不到那三行。滴跑的价值就在这句：名额算对了，红才只是红。

## 臂表（每条都验过"能红"，也验过恢复后能绿）

| 臂 | 摘掉什么 | 逐字红 |
| --- | --- | --- |
| A1 锁 | 已有活锁（pid 2932，就是 3100 那台 dev server 的 pid）时再发起一份 | `[paced] 中止：已经有一份 paced 跑在跑（pid 2932，…）` + `exit=1`；**被挡住的那份没有删别人的锁**（`cat paced.lock` 仍是 `2932`），且中止发生在 `--list` 之前 |
| A2 空枚举 | `--spec "e2e/studio.spec.ts:99999"`（点不到任何用例） | `[paced] 中止：--list 没从 … 列出任何用例（exit=1）。宁可不跑，也不要发起 N 片空跑然后报"全绿"` 附 `Total: 0 tests in 0 files`；中止后 `paced.lock` 被释放（`ls` ⇒ No such file） |
| A3 两本账 | `claimed !== group.length` 改成 `… !== group.length + 1` | Playwright 那边 `exit=0 1 passed (10.8s)`，paced 仍报 `⚠ 这一片**发起了 1 条，Playwright 报 "Running 1 tests"** —— 两边对不上` ⇒ `1 片红`、脚本 `exit=1`。恢复后同一条 `1 passed (12.1s)` ⇒ `全绿`、`exit=0` |
| A4 读不到那句 | 正则 `/Running (\d+) test/g` → `/RunningX …/` | `exit=0 1 passed (14.4s)` 仍判红：`⚠ 这一片的输出里**没有 "Running N tests" 那一句**` + `这一片 exit=0 但对账没过：按仪器故障处理` ⇒ 脚本 `exit=1`。恢复后 `1 passed (13.8s)` ⇒ `全绿`、`exit=0` |
| A5 撞闸与回归分开 | 无（自然形状）：窗口满时发起一条 | `这一片里有**被限流拒了**的建项目（建项目被服务端拒了）——那是窗口没等够，不是产品回归` + 服务端那句分钟数；**这一条 0 名额消耗**（被拒的那一次不占桶） |
| A6 行号 filter 的语义 | 非声明行 `e2e/studio.spec.ts:40` 与真声明行 `:4087` 一起当 filter | `Total: 1 test in 1 file` —— 只有声明行点得到，`:40` 点不到任何用例（这同时是"决定 1"里那句映射规则的证据） |

A3/A4 是**变异臂**：改完跑一次看它红，改回来再跑一次看它绿，两次读数都抄在上面。
`grep -c "MUT " scripts/e2e-paced.mts` ⇒ `0`（变异没留在树里）。

### 补记的臂（2026-11-07）：修好的断言凭什么说它有牙

滴跑抓到的那三条红改完以后，"是不是把断言改成迁就现状"只有臂能回答。**产品侧**各摘一次（P＝product）：

| 臂 | 摘掉什么 | 逐字红 |
| --- | --- | --- |
| P1 | `ENFORCED_PLAN_AXES` 去掉最后一格 `teamCollaboration` | `Expected substring: "teamCollaboration"`（额度页那条逐格念名字的用例叫） |
| P2 | `SEARCH_ORDER_METHOD` 删"不看词频"那半句 | `Expected substring: "不看词频"` |
| P3 | 删掉搜索结果页 `[data-search-method]` 那一行 | `[data-search-method] … Expected substring: "组内按相关度排"` |
| P4 | `ExportPanel` 去掉 `!chosen.length` 那个禁用条件 | `Error: 一格都没勾还是发了 1 次导出请求 / Expected: 2, Received: 3` |

四条都在恢复后绿（`md5` 复原 + 三条各 `1 passed`：`17:35:22Z 片 34/57`、`17:35:51Z 片 50/57`、`17:36:09Z 片 51/57`）。
P4 那条同时是"先数行为、再看按钮灰没灰"这个顺序的证据：**行为断言红了，说明它真的在数请求**；
若只留 `toBeDisabled()`，P4 那种改动会让用例先撞在按钮上，请求发了几次永远没人问。

**单测侧**（U，`scripts/test/e2e-paced-core.test.mts` 16 条，喂逐字 `--list` 原文）：

| 臂 | 摘掉什么 | 逐字红 |
| --- | --- | --- |
| U1 | `partition` 改成按行号倒序切段 | `1 failed`：`expected [ { line: 4759, …(1) }, …(56) ] to deeply equal [ { line: 85, …(1) }, …(56) ]` ——**段的长短那几格全绿**，只有"连续分段"这一格叫 |
| U2 | 摘掉"一条都没列出来就抛" | `2 failed`：`expected [Function] to throw an error` ×2（空枚举 + 带 exit 码那两格） |
| U3 | `claimedTally` 取第一行而不是最后一行 | `1 failed`：`expected 4 to be 8`（多 project 各报一行的形状） |
| U4 | `tallyMismatch` 回到 `claimed !== null && …` | `1 failed`：`expected false to be true`（"读不到那句"这一格静默失明） |
| U5 | 摘掉 `Math.max(cooldownMin, …)` | `1 failed`：`expected 24 to be 61`（下界那一格） |

每臂跑完立刻从备份还原：`grep -c "MUT " scripts/lib/e2e-paced-core.mts` ⇒ `0`，
`md5sum` 回到 `e3f0dc524efb9112dbb2dea72402a060`，还原后重跑 ⇒ **16 passed**。

## 没牙的格子

1. **按下标连续分段不管用例长短**：段与段的"建项目次数"均匀（这正是分段要保证的），
   但**墙钟时长**不均匀——一条 2 分钟的用例落在哪片，哪片就慢。没有读数会说这件事。
2. **`Running N tests` 的解析绑在 list reporter 的措辞上**。A4 让它"读不到就红"，
   但 Playwright 若把这句话改成同样含数字、不同含法的新措辞，仍会被 `claimed !== group.length` 抓到——
   真正抓不到的是"它一次报多行而我只取最后一行"那种多 project 形状：`playwright.config.ts` 现在只有一个 project，
   加第二个 project 时这里要改成**求和**，今天没有门拦着这个改动。
3. **锁只挡 paced 自己**。并行会话直接 `npx playwright test` 不受这把锁约束，
   所以她那一轮的建项目会吃掉同一个 `::1` 桶的名额；签名就是这一片里冒出 429，脚本会把那句原样端出来。
4. **`--cooldown-min` 与 limit 数字都是手抄的**。产品里那道闸是 `ipWriteGate('projects/create', 20, 3_600_000)`，
   脚本注释写"20 次/小时/IP"；哪天 limit 改了，脚本不会跟着改，只会表现为"撞闸更频繁"或"等得没必要"。
   ~~没有一条门把两处钉在一起（要钉得让服务端把那两处数字端进 `/api/admin/rate-limit`，见"仍欠"）。~~
   **已还（2026-11-06，§SEC 第四十一片）**：数字收进 `IP_RATE_RULES`（唯一真值），
   `rate-limit-rules.test.ts` 钉住 `projects/create = 20 / 3_600_000`；admin 端点与表盘端出这张表。
   **还没还的那半**：脚本读的仍是自己那个 `--cooldown-min` 数字，没有去端点现取——
   表与脚本之间那条线今天靠人（下一片决定"读哪一格、什么时候读"）。
5. ~~**脚本没有单测**。`listTests` / `partition` 是纯函数，本可以进 vitest；~~
   ~~本仓库对 `scripts/*.mts` 的既有惯例是"自见证运行器"（`--plan` + 上面的臂表就是它的见证），本片随惯例。~~
   **已还（2026-11-07 补记）**：纯函数拆进 `scripts/lib/e2e-paced-core.mts`（不许 import `node:fs`/`child_process`），
   `scripts/test/e2e-paced-core.test.mts` **16 passed**，喂的是逐字落盘的 `--list` 原文而不是手造样例——
   这一条改的是"措辞漂移要等到第二天早上才知道"那一格：现在 Playwright 换含法，`npx vitest run` 几毫秒就叫。
   臂见上面 U1–U5。
6. **额度页那五格的名字是数组、后面那句解释是手写的**。补记里的用例逐格念 `ENFORCED_PLAN_AXES` 的名字，
   念的是数组本身；而 `[data-credits-enforced]` 那句"§133 点名的五件事今天全都有真的拦截方"里的
   **数字"五"和整句解释都不由数组拼出来**。今天这五格确实全有拦截方，所以话是真的；
   但摘掉一格时页面不会跟着改口（P1 臂红的是**用例**，不是页面）——要钉死得让那句话也由数组生成，
   并给"格子数 ≠ 句子里的数字"留一条门。本片只把它写明，没做。

## 仍欠

1. ~~**本片只把 studio 一份跑到底**。~~ **studio 这一份已经跑到底（2026-11-07 补记）**：57 条用例每一条都有自己的
   读数（53 绿 + 1 条要运行前提的跳 + 3 条红→修→绿）。**但"一次调用 57 条全绿"这个读数今天还没有**——
   三条红的复跑是那三次单独调用（`--only 34/50/51`），把它们并回一条命令要再滴一遍（≈3 小时墙钟）。
   整个 `e2e/` 有 98 处建项目 ⇒ 全站一次全绿仍需 ≥5 个窗口，
   而且各文件的用例数不同（`e2e/a11y-opened.spec.ts` 9 条、`e2e/storyboard.spec.ts` 12 条但只建 2 个项目）。
   "哪些文件根本不需要 paced"那半**已还**（23 个文件零建项目，列表在 `docs/ENVIRONMENT.md`）；
   还欠的是照同一把尺子把其余 20 个建项目的文件滴一遍。
2. **红片的自动重发**。现在 `--only i` 是人来重发的；撞闸的片可以在同一次调用里按服务端那句自己重排队。
   没做的原因不是难，是要先把"重发几次"这条定下来——自动重发会把"这一片真的红了"混进"等名额"里。
3. **让形状门认服务端那两个数字**（没牙 4）：`/api/admin/rate-limit` 现在端的是驱动、键前缀、上界与 `bucketsTracked`，
   不含每条规则的 `limit/window`。~~补上以后，脚本可以现读 limit 自己算该切几片，`--shards` 那格就不再是手抄的。~~
   **已还（2026-11-06，§SEC 第四十一片）**：全部 IP 窗口闸的 `limit/windowMs` 收进 `IP_RATE_RULES`
   （`apps/web/src/server/security/rateLimit.ts`，唯一真值；13 处调用点不再传数字）；
   `/api/admin/rate-limit` 现在整表端出 `rules`，admin 表盘直接渲染这张装法表，
   `rate-limit-rules.test.ts` 把 11 条钉住。paced 脚本还没接它自算切法——这一步留给下一片，
   决定它读哪一格、什么时候读。
4. **`docs/ENVIRONMENT.md` 那节"Playwright e2e 在本机跑不起来"已经过期**：它结论写着"这台机器上 e2e 这一路
   暂时不可用"，而本片（以及此前多片）在同一台机器上跑通了 Playwright——守卫只挡"清那棵超阈值的 `test-results/`"，
   带自己的 `--output` 就绕开了。该片随本片改写，别再留一句与事实相反的话。
