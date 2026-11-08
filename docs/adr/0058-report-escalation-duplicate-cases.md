# ADR-0058：举报升级案的并发重复——记下来，等产品对"同 publication 多案"表态再修

## 背景

`fileReport`（`server/domain/moderation.ts`）在举报落库后还有一步"升级"：
举报类别命中三条硬红线之一（`minor_safety` / `intimate_nonconsensual` / `impersonation`）
时，若该 publication 没有未结案的复核案，就 `recordScan` 建一条 `review` 案（§131/§132）。

这一步是**读—改—写**：先 `select` 未结案，没有再 `insert`。而 `moderation_cases`
**没有任何唯一索引**。于是两个举报同时到达（双击举报、两个标签页、两个举报人）
且都没有未结案时，两边的 select 都看不见对方，都走到 insert——
同一个 publication 下出现**两条未结的复核案**。

2026-10-23 的并发审计（#170-#175 一族）扫到这一处，确认它是真竞态，
但**决定只记录不修**，理由如下。

## 选项

1. **给 `moderation_cases` 加部分唯一索引**（`publication_id where resolved_at is null`）：
   副作用是真的——同一个 publication 发布新版本时，机检带着**新的 findings** 走
   `recordScan`，会被旧未结案挡住（insert 撞唯一索引）：要么整条扫描丢结果，
   要么得给"已结案/未结案"设计一套合并语义。而"同一 publication 同时有两个未结案"
   在人工流程里**并不是错误状态**：两个举报人可能举报的是不同类别、不同版本。
   用一把库约束去消灭一个合法的业务状态，是把同步问题换成了正确性问题。
2. **把读—改—写收进项目写锁**（ADR-0016 的 `lockProjectWrites`，与 #175 同一手法）：
   能消除窗口，且 advisory lock 在同事务内可重入，不会与 #167 发布链路里的锁嵌套死锁。
   但 `recordScan` 是**机检与举报共用的入口**——发布链路的每一次机检都会经过它，
   加锁意味着所有并发发布/举报在这把锁上排队；换来的是"少一条审核员要多看一眼的
   重复行"，不是防数据损坏（重复案不丢 findings、不丢举报行，`abuseReports` 照旧一人一行）。
3. **记下来不修**：重复案的后果是审核队列里多一行同 publication 的待审，
   人工裁决时自然会发现是同一件事。代价可见、可恢复、不破坏数据。

## 决定

**选 3**。竞态本身写进本ADR与 ROADMAP，不假装它不存在；
真正的修法等一个产品决定：**"同一个 publication 允许多少条并行未结案"**——
如果答案永远是 1，选项 1/2 的正确形态（含新版本 findings 的合并语义）才能定；
如果答案允许多条，那今天的形态就是对的，本 ADR 归档为"已评估、非缺陷"。

在拿到那个决定之前，新代码**不许**给 `moderation_cases` 加唯一索引——
那会有上面第 1 条的真实副作用。

## 后果

- 举报升级在并发下可能产生重复未结案；审核员看到的两行是同一件事，裁决一行即可。
- `abuseReports`（一人一举报）不受影响，它有 `marketplace_reports_unique_reporter_item`
  一族的部分唯一索引兜着（#172 同族修法）。
- 若产品决定"一个 publication 只一条未结案"，回来按选项 1/2 修，并补测试钉住
  "新版发布的 findings 不被旧未结案挡掉"。
