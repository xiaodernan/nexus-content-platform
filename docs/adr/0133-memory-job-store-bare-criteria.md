# ADR-0133：MemoryJobStore 裸单测——MQ 候选① 原话"零判据"的一处要修正的读数

- 状态：已采纳（2026-11-11，§SC-56，承接 §ADR-0126/0127/0132 的 "MQ 候选①"）
- 关联：`apps/ai-service/src/ai_service/jobs.py`（`MemoryJobStore`）、`tests/test_jobs.py`（间接覆盖层）、
  `tests/test_memory_job_store.py`（本片新增）、ADR-0132/0128（同一 "消息队列的合理运用" 路线）
- 触发（user 本轮点名）：**消息队列的合理运用 + 系统层级合理性**。

## 背景

内存后端是 ai-service 的默认开发兜底——不配置 `NEXUS_REDIS_URL` 时所有提交与轮询都落在这个 dict+list 上。
ADR-0126/0127 的 "仍欠" 里白纸黑字写着："MQ 候选①（ai-service `MemoryJobStore` 零判据）"。

**本片先做的是读码定性，而不是写判据**：

- `test_jobs.py` 通过 HTTP+worker 间接落了一条链路：submit → 领队 → 真执行
  （容量 1 不并发、redis 后端二台读同一作业、queued 被取消即终态等），约 21 条——**不是零**。
- **零判据的是 `store` 本体**：FIFO、`_purge` 淘汰边界、counts 迁移、
  取消标志与作业本体分离（ADR-0087 钉下的 "worker 的整份 save 不许抹取消请求" 竞态）、
  `claim` 跳过已落终态、多副本提示语的存续——今天全靠读代码判断。

## 决定

1. **不改生产代码，只补裸判据**（本片 172 行判据、零实现行变更）。
2. 裸打 store（`ai_service.jobs.MemoryJobStore`），不经 HTTP 与 worker；
   同步测试 + stdlib `asyncio.run` 包装，不引入 pytest-asyncio 新依赖，**不碰**
   `NEXUS_REDIS_URL` / 机器时钟以外的外部状态。
3. 判据覆盖：FIFO 领队、counts 迁移、`_purge` 淘汰最旧终结
   （`max_jobs=3` × 5 件完成后入 2 件 → 淘汰 4 件最旧，保留最新 + 新件）、
   排队装载不被淘汰、queued 取消即终态 + `claim` 跳过、worker save 不抹取消标志、
   完成后追加取消终态不覆盖、未知作业诚实、payload 原样到 claim、
   `note` 自报"多副本/重启即失"（篡改防篡改）、TERMINAL 词表一致。
4. **本 ADR 同时修正候选①原话**：原写"零判据"不确数——精确说法是
   "间接覆盖 21 条走通、store 本体 0 条 → 本片补 11 条补齐"。

## 后果与证据

- 新增 `apps/ai-service/tests/test_memory_job_store.py`，**11/11 passed**（0.32s）；
  全套 **88/88**（77 + 11）在同一 env 下全绿（Redis=6380 opt-in）。
- 生产代码零改动——"裸判据钉住已有语义"而非"捏造新行为"。
- 内存后端"多副本提示语"从此有测试守护：如果有人把 note 改成
  "立刻重启不丢"那样的谎话，`test_memory_backend_note_admits_multi_replica_blindness` 会直接红。

## 诚实边界

- 本机内存态测不出的两件事（不假报）：①`gcp_memory_store` 在 `Memory limit` 下真 OOM 的表现
  ②多 worker 竞争同一 `_pending` list 的调度——asyncio 单事件循环里不存在真并发，
  并发判据由 TestWorkerConcurrency（HTTP 层）或 Redis 后端覆盖。
- `_purge` 淘汰语义以末次 `enqueue` 为界——不是后台计时器，别指望它准点；
  本片把"触发时机 = enqueue 前"写成判据而不是假装"满了就清"。
- 内存后端本就是单机开发兜底；多副本正确答案是 "配置 Redis"（否则永远看不见对方）——
  判据钉的是 "note 必须说实话"，不是这件事变得正确。
- 未动 README/execute.sh/docker-compose 任何环境变量或配置文档。

## 仍欠

- 内存后端走完毕业条款（何时才能让 memory 成为 CI 默认干掉 Redis flag）——另立片，要测干净窗口；
- RedisJobStore 的裸判据（本片只覆盖 memory）——Redis 裸测有 6380 opt-in 通路，下一片接；
- Worker 取消检查点粒度（`is_cancel_requested` 调用密度）——这次没动、判据没打。
