# ADR-0121：clear 必须让在途加载的回写作废——generation token 堵住"清空被复活"

- 状态：Accepted
- 日期：2026-11-11
- 相关：ADR-0112（`BoundedCache` 有界 TTL/LRU/singleflight）、ADR-0113（发现页按 viewer 分键）、§SC 第四十九片

## 背景：一个声明了却没兑现的 clear 语义

`server/gateway/cache.ts` 的 `BoundedCache` 是网关取数客户端的进程内缓存底座（TTL + LRU + singleflight，ADR-0112）。它的 `clear()` 对外承诺"清空缓存 + 计数归零"：

```ts
clear(): void {
  this.map.clear();
  this.inflight.clear();
  this.counters.hits = 0; /* misses / evictions / loads 同样归零 */
}
```

但 `getOrLoad` 的 singleflight 让"清空"与"在途加载"能并发交错，露出一道真实的正确性裂缝：

1. leader 调 `getOrLoad(k, loader)`，`inflight.set(k, load)`、`loads++`，`fromLoad` 里 `await load` 挂起（loader 还没回）；
2. 此刻 `clear()` 执行：`map` 空、`inflight` 空、`counters` 全归零；
3. loader 随后 resolve，`fromLoad` 继续走到 `this.set(k, value)`——**把一条值写回刚被清空的 map**。

结果：调用者刚请求"清空"，缓存却凭空多出一条 `size=1`；而 `loads` 已被归零、这一条是清空的 in-flight 写的、没再 `loads++`，读数变成 `size=1 / loads=0` **自相矛盾的假账**。若 leader 有多个同键 follower，它们也 `await` 同一个旧 promise、各自 `set` 一次，进一步刷 LRU 顺序。

**范围诚实交代**：`clear()` 的唯一生产入口是 `client.ts` 的 `clearCache()`，而全仓检索确认 `clearCache` 目前**零调用点**（没有 UI 按钮、没有 route 调它）。所以这是一个**底座 latent 正确性债，不是正在发生的事故**。但它违背了 `clear` 公开语义、且 `BoundedCache` 是复用底座（发现页缓存也 `new BoundedCache`，只是其 test reset 走"重建实例"而非 `clear`，故不受此 bug、也不受本修复影响）——趁早补齐比将来某个调用者踩到便宜得多。这与 ADR-0117/0120 的纪律并行：**不是等事故，而是把"声明与实现分叉"的地方钉死**。

## 决定：单调 generation token 作废旧世代的回写

给实例加一个单片程内单调的整数 `generation`，`clear()` 时 +1；每次 `getOrLoad` 在同步段捕获当前 `gen`，交给 `fromLoad`；`fromLoad` 在 `await load` 之后、写 `map` **之前**比对世代：

```ts
const gen = this.generation;          // getOrLoad 同步段，leader / follower 都捕获
if (running) return this.fromLoad(key, running, gen);
const load = Promise.resolve().then(loader);
this.inflight.set(key, load);
this.counters.loads += 1;
return this.fromLoad(key, load, gen);

// fromLoad
const value = await load;
if (genAtStart !== this.generation) {
  return { value, ageMs: 0, storedAt: this.clock(), expired: false }; // 只交值、不落库
}
return this.set(key, value);
```

### 关键取舍：值照常交回调用者，只是不写缓存

生成 token 挡的是**回写**，不是**这次加载的结果**。"等这一发的调用者"要的是那份数据本身，而它在 loader resolve 那一刻是真的（当时确实查到了），不能因为中途有人 clear 就把它变成 `undefined` 或抛错——那会凭空制造一次读失败。故 `genAtStart !== generation` 分支走"交值、不 set、不增计数"：`ageMs: 0 / expired: false`（刚算出来的新鲜值），但 `map` 保持清空、`counters` 保持归零。**缓存一致性与调用者正确性同时成立。**

### 为什么 `finally` 不计世代也安全（一处刻意不改）

`fromLoad` 的 `finally` 用 `if (this.inflight.get(key) === load) this.inflight.delete(key)` 清在途标记。有人会想"这里也该判 gen"——不必，且判了反而错：

- 若这一发**没被 clear**：`inflight.get(key) === load` 成立，精确清掉自己（保留失败后可重试的语义）；
- 若这一发**被 clear 过**：`clear()` 已 `inflight.clear()`，`inflight.get(key)` 要么是 `undefined`、要么是 **clear 之后同键新发起的那一发的 promise**（≠ 旧的 `load`）——两种情况 `=== load` 都为假，**不会误删新一发**。

关键竞态判据 `§SC-49 旧 leader 的 finally 不误删 clear 之后同键新发起的那一发` 用可控 deferred 精确制造"旧一发在途 → clear → 同键新一发在途 → resolve 旧的"，断言新的 `inFlight` 不被动、能正常完成并写入。这是所有 generation 方案里最易被写错成"finally 里加 gen 判断、结果把新一发删掉"的一处，用判据焊死。

### 为什么 generation 只在 clear 时 +1、且不持久化

它只解决**同一 `BoundedCache` 实例内、clear 与在途之间的竞态**，不是跨实例的版本向量，也不是 `discover-cache` 的 `globalGen`/`globalEpoch`（那两个是跨 reset 保留、管隐私/内容新鲜度的水位线，ADR-0113/0116）。进程内单调整数足够，零 IO、零新依赖、零跨实例协调。

## 后果：零生产行为变化

- 清空的语义被真正兑现：clear 返回后不会再有任何旧结果写进来，`size=0 / loads=0` 自洽；
- 未清空的正常路径完全不变：`set` 照写、singleflight 照合并、TTL/LRU 照淘汰；
- loader 的返回值与异常传播都不变（值照交、失败照抛，只是失败本就不写缓存）；
- 不碰 `db`、不碰网络、不碰 `discover-cache`、不改任何公开类型。判据全部零网络、可控 deferred + 注入 `now`，不靠 sleep。

## 验证（不粉饰）

判据净增 **+5**，全部落 `gateway-pure.test.ts`：

1. leader 在途 clear：值 42 照交、但 `size=0 / loads=0 / inFlight=0`，不复活假账；
2. follower 与 leader 同属旧世代一起被挡：两调用者都拿 7、`map` 仍空、`loads=0`；
3. 失败 loader 在途 clear：异常 `db down mid-clear` 原样传、不写回、不钉在途，clear 后新一发仍能加载；
4. 正常 clear 路径不回归：无在途时清空后重填照常写、计数重来；
5. **旧 leader 的 finally 不误删 clear 后同键新一发**：新一发 `inFlight` 保持、正常完成并写入。

**首跑真信号（判据自检，没放过）**：判据 2 首版在同步段断言 `loaderCalls===1` 红了——`getOrLoad` 用 `Promise.resolve().then(loader)` 把 loader 推到微任务，同步断言时它还没执行（实际 0）。这是**判据时序写错、不是实现 bug**：改用同步 `++` 的 `stats().loads` 验 singleflight（可靠），并在断言 loader 调用次数前 `await Promise.resolve()` 让出一次微任务。修正后 gateway 两组（`gateway-pure` + `gateway-client`）**37 passed**。

- `npx tsc -p apps/web/tsconfig.json --noEmit` **EXIT=0**；
- discover-cache 回归 + 横向门 3 文件 **90 passed**（含 `style-tokens` 24/24，零新增颜色 token）；
- 全仓 vitest 数字见 ROADMAP §SC 第四十九片回填。
