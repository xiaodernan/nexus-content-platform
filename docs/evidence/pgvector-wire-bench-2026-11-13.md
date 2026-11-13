# §49/§93 pgvector wire bench — 2026-11-13

关联：`scripts/pgvector-wire-bench.mts` · ADR-0194（RAG 语料索引 hybrid 落地） · `apps/web/src/server/db/schema.ts`（`knowledge_chunks.embedding vector(1536)` + `knowledge_chunks_embedding_idx` HNSW/vector_cosine_ops） · wkapi.pro `/v1/models` 实测（2026-11-13：4 chat models, **无 embedding**）

> **先说清楚这件事的前人约定**：§49 RAG 混合检索（tsvector 全文 + 子串 + 词覆盖 + RRF-ish 确定性融合 + 规则重排）早已落地并过真库集成测试；embedding 列因 wkapi.pro 不提供 embedding 模型而一直 null（`vectorAvailable: false` 诚实降级）。本次 wire bench **不是替你用 embedding 回答问题**——wkapi.pro 没有 embedding 模型，这一点没有改变。本次补的是：**工程上 NEXUS 已经决定用 HNSW+cosine_ops，并且实测它在这台机器上花多少钱、快多少。**

## 方法（可复现）

```
npx tsx scripts/pgvector-wire-bench.mts 10000
npx tsx scripts/pgvector-wire-bench.mts 30000
```

- 环境：本机 `nexus-postgres`（docker, 宿主 55433，pgvector 0.8.6 · HNSW · `maintenance_work_mem=64MB`）
- 数据：**合成随机向量**（1536 维，mulberry32 确定性种子——每次运行字节一致，任何机器可复现）——**标注：合成数据，不承载语义；只回答"索引/IO 尺寸与查询价格"，不回答"检索质量"**
- scratch 表 `nexus_bench_vector_wire_<N>`，用完即 DROP（psql `to_regclass` 复核两行均 NULL）

## 实测数据（原始字节）

| rows | insert | HNSW build | index size | top-20 ANN p50 | p95 | max | Seq Scan p50 (enable_indexscan=off) |
|---|---|---|---|---|---|---|---|
| 10 000 | 10.7 s | 27.1 s | 78 MiB (81 928 192 B) | 5.30 ms | 6.11 ms | 12.93 ms | 57.13 ms |
| 30 000 | 25.3 s | 424.7 s | 234 MiB (245 768 192 B) | 8.04 ms | 13.21 ms | 14.99 ms | 217.25 ms（max 486.89 ms） |

观察：

1. **ANN top-20 始终在个位数毫秒**——30k 行 p95 只有 13ms；Seq Scan 下限 217ms，**27× 优势**。NEXUS 现在的默认路径（HNSW cosine）是正确的默认。
2. **`maintenance_work_mem=64MB` 不足以为 1536 维 HNSW 高效建图**。Postgres 直接打 WARN（§SC-PG）：`hnsw graph no longer fits into maintenance_work_mem after 9755 tuples. Building will take significantly more time.` 30k 档建图代价 424.7s（插入只 25.3s）。**生产部署的显式杠杆**：`maintenance_work_mem ≥ 1GB`（本机 2.4GB 空闲不宜常开，超出本次 bench 范围，仅记录建议）。
3. **索引体积**：78 MiB / 10k、234 MiB / 30k——vector 1536 按 4B×1536 ≈ 6KB/行，符合预期（57.6MB 原数据 + HNSW 开销 1.4×）。

## 诚实边界

- **合成随机向量**——近邻距离分布与真实语料不同；p50 毫秒级是索引性能，不保证任何语义回召率。
- 没跑过 100k+（本机 16GB、空闲 ~2.4GB，不值得压垮机器；pgvector 文档量级结论一致）。
- `knowledge_chunks` 真表未动；所有 bench 在 scratch 表上；测完 `to_regclass` 复核为 NULL。
- **wkapi.pro 没有 embedding 模型**——embedding 列继续 null；`vectorAvailable: false` 语义不变。
- 应用侧连接池、RLS、VACUUM 频率、autovacuum 对 HNSW 维护成本的影响未测。
- ANN 的 `ef_construction` / `M` 默认（16/64）没调；没证最优配置，只证"默认可用、比 Seq Scan 快一个数量级"。
