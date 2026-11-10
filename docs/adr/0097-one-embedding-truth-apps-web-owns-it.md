# ADR-0097：embedding 只留一份真值——owner 是 `apps/web`，不是 Java 侧的第二套实现
- 状态：已接受（2026-11-10）
- 相关：`apps/web/src/server/ai/embedding.ts`、`apps/web/src/server/ai/vector-store.ts`、
  `apps/web/src/server/domain/knowledge.ts`、`apps/web/test/knowledge-local.integration.test.ts`、
  `docs/ROADMAP.md`（`- [~] pgvector RAG（hybrid retrieval + rerank）（§49/93）`）、
  提交 `eb8187a8`（SC-17：社区策略收进 `packages/schemas`／第二个写入方落地之前先只留一份真值）

## 背景

ROADMAP 上 `- [~] pgvector RAG（hybrid retrieval + rerank）（§49/93）` 一直挂着，备注写着"只差真实 embedding provider"。
而**这个仓库里其实已经有一份完整的本地实现**（`apps/web` 侧）：

| 事实 | 位置 |
|---|---|
| 本地 embedding provider（token-bag，FNV-1a 分桶，**1536 维**） | `apps/web/src/server/ai/embedding.ts` → `LocalTokenBagEmbeddingProvider` |
| 本地 reranker provider（**§93 明确要求的那一件**） | 同上 → `LocalTokenBagRerankerProvider` |
| provider 选择（`NEXUS_EMBEDDING_PROVIDER=local` / `NEXUS_RERANKER_PROVIDER=local`，opt-in） | 同上 → `getEmbeddingProvider()` / `getRerankerProvider()` |
| 向量库检索（hybrid 路径） | `apps/web/src/server/ai/vector-store.ts` → `VectorStore.search()` |
| 知识分块与统计 | `apps/web/src/server/domain/knowledge.ts` → `knowledge_chunks.embedded` |

也就是说 §49/§93 剩下的不是"没有实现"，而是"**没有生产 provider**"（要 key）。

在这种情况下，另起一套 Java 侧 embedding 栈是**第二个写入方**，而且是更弱的那一个：
768 维 vs 1536 维、哈希分桶 vs token-bag、Spring bean 注入 vs env 驱动的工厂函数、且**没有 reranker**。
§93 要求的是 reranking，这套没有。

## 选项

1. **保留 Java 侧并行实现**：两条真值（"文本怎么变成向量"有两个答案）、两套 provider 选择机制、两套维度约定。
   否——这正是 `eb8187a8`（SC-17）刚在社区策略上拆掉的那个形状。
2. **让 Java 侧调用 TS 侧**：Java 服务是独立运行时、独立数据库（`services/README.md` 写明 `nexus-api` 自己拥有
   PostgreSQL），跨进程去调一个 web 进程内的函数，是把"一份真值"换成"一份真值 + 一条运行时耦合"。否。
3. **撤回 Java 侧 embedding 栈，把力气花在 §49/§93 真正缺的那一件**（选定）：
   - 唯一真值留在 `apps/web`；
   - Java 侧不留同名概念的第二份实现；
   - 本仓库其它地方要用 embedding，走 `apps/web` 那一个 owner。

## 决定

- **撤回** `services/nexus-api` 侧的 embedding 相关改动：
  - 删除新建的 `EmbeddingService.java`、`EmbeddingProvider.java`、`EmbeddingServiceImpl.java`、
    `DefaultHashBasedProvider.java`、`OpenAiEmbeddingProvider.java`、`SentenceTransformersProvider.java`；
  - `PublishedProject.java`（`embedding_vector` 列 + getter）、`PublishedProjectRepository.java`
    （`findByEmbeddingVectorOrderByEmbeddingSimilarity`）、`SearchService.java`（`EmbeddingService` 注入 +
    `searchByVector()`）三处回退到 HEAD。
- 撤回的理由不止是"重复"，还有两条**硬缺陷**（这三处从未被编译过——`mvn test` 只在 `services/java-domain-service`
  跑过，`services/nexus-api` 没跑）：
  1. **JPQL 非法**：`ORDER BY (SELECT SUM(p2.embeddingVector[i] * :queryVector[i]) FROM UNNEST(ARRAY[1..768]) …)`
     里的 `p2` 是未定义别名、`i` 未定义、`UNNEST` 不是 JPQL。Spring Data 在**启动期**校验 `@Query`，
     这个服务会直接起不来。
  2. **编译不过**：`SearchService` 调 `findByEmbeddingVectorOrderByEmbeddingSimilarity(queryVector, new PageRequest(...))`，
     而仓储方法签名是 `(double[], int limit, int offset)`。
  留着它等于交一份"看着像 RAG、跑不起来、还盖住真值"的代码——§159 禁止的形状。
- **保留并加强** `apps/web` 那份真值：`apps/web/test/knowledge-local.integration.test.ts` 里原本
  `LocalTokenBagRerankerProvider` 是**未使用的导入**（整仓 lint 唯一一条真错误）。修法不是删掉导入，
  而是把它变成**更强的断言**：光有 `models()` 含 `LOCAL_RERANKER_MODEL` 不够——那证明不了 opt-in 选中的
  **就是**本地那一支（别的 provider 也可能报同一个模型名）。于是改成 `toBeInstanceOf(LocalTokenBagRerankerProvider)`
  与 `toBeInstanceOf(LocalTokenBagEmbeddingProvider)`。

## 后果与证据

- `git status services/nexus-api/` 还原后为空：该服务回到 HEAD 状态，无残留的"第二份真值"。
- `services/nexus-api` 的 Maven 构建与测试在本 ADR 落地后重跑（结果见提交说明）。
- 整仓 lint 的那条真错误消失，且断言变强：现在证明的是**实例身份**，不只是模型名。
- §49/§93 的进度不再靠"多写一套 provider"推进，而是回到它真正缺的地方：**生产 embedding provider**（要 key）
  与 §93 要求的 reranker 在生产路径上的落地。
