import { LocalTokenBagRerankerProvider, LOCAL_RERANKER_MODEL } from '../../apps/web/src/server/ai/embedding.ts';
import { EvalRecorder } from '../lib/recorder.ts';
import type { EvalSuite } from '../types.ts';

/**
 * §85 · §93 — the deterministic local token-bag reranker.
 *
 * Same discipline as DEMO MODE (§159/§160): this is a CONVENIENCE, not a cross-encoder that
 * understands meaning — it re-orders the retrieval stage's candidates by token-overlap cosine.
 * The gate asserts exactly that: determinism, the reranker-vs-rest ranking on the cases the
 * algorithm can answer, never a model-quality claim.
 */
export const localRerankerSuite: EvalSuite = {
  name: 'local-reranker',
  dimension: '代码正确性 / 检索自洽（§93 local token-bag rerank）',
  needsDatabase: false,

  async run() {
    const rec = new EvalRecorder();
    const provider = new LocalTokenBagRerankerProvider();

    const DOCUMENTS: Array<{ id: string; text: string }> = [
      { id: 'design', text: '设计文档 画布 节点 排版 组件 设计令牌 布局 栅格系统 视觉稿' },
      { id: 'game', text: '游戏设计 技能 数值 平衡 副本 关卡 怪物 AI 战斗 规则' },
      { id: 'video', text: '视频剪辑 分镜 镜头 台词 剧本 转场 时间轴 素材 渲染 输出' },
      { id: 'world', text: '世界构建 背景 势力 地理 地图 种族 神话 历史 编年' },
      { id: 'code', text: '代码 实现 编译 语法 AST 运行时 模块 写入 类型 推断' },
      { id: 'character', text: '角色对话 情绪 性格 关系 弧光 语气 记忆 创作 设定' },
      { id: 'export', text: '导出打包 构建 管道 产物 分发 压缩 清单 版本 快照' },
      { id: 'asset', text: '资产管理 图片 文件 上传 存储 配额 对象命名 元数据' },
    ];
    const QUERIES: Array<{ q: string; want: string }> = [
      { q: '画布布局的栅格系统', want: 'design' },
      { q: '关卡与数值平衡', want: 'game' },
      { q: '分镜镜头的顺序', want: 'video' },
      { q: '势力与地理的编年', want: 'world' },
      { q: '类型推断与运行时', want: 'code' },
      { q: '角色的弧光与语气', want: 'character' },
      { q: '导出时的清单与分发', want: 'export' },
      { q: '资产的存储与命名', want: 'asset' },
    ];

    console.log(`\n== Local token-bag reranker（§93）· 载体=确定性本地重排 · ${DOCUMENTS.length} 个语料文档 · ${QUERIES.length} 个查询 ==`);

    // ── 契约面：provider 自报家门 ───────────────────────────────────────────────────────
    rec.structural('models() names exactly the model this suite runs against', provider.models().length === 1 && provider.models()[0] === LOCAL_RERANKER_MODEL, LOCAL_RERANKER_MODEL);

    // ── 确定性：同输入两次重排，逐位相等 ────────────────────────────────────────────────
    const runs = await Promise.all([
      ...QUERIES.map(({ q }) => provider.rerank({ model: LOCAL_RERANKER_MODEL, query: q, documents: DOCUMENTS.map((d) => d.text) })),
      ...QUERIES.map(({ q }) => provider.rerank({ model: LOCAL_RERANKER_MODEL, query: q, documents: DOCUMENTS.map((d) => d.text) })),
    ]);
    const firstHalf = runs.slice(0, QUERIES.length);
    const secondHalf = runs.slice(QUERIES.length);
    const twice = firstHalf.every((r, i) => r.scores.length === secondHalf[i]!.scores.length && r.scores.every((x, j) => x === secondHalf[i]!.scores[j]));
    rec.structural('determinism: the same (query, documents) reranks to the identical scores', twice, 1);

    // ── 结构性：每个文档都拿到一个 score ──
    let countsOk = true;
    for (const r of firstHalf) if (r.scores.length !== DOCUMENTS.length) countsOk = false;
    rec.structural('every document gets exactly one score', countsOk, DOCUMENTS.length);

    // ── 空输入：0 分而不是崩溃 ──
    const empty = await provider.rerank({ model: LOCAL_RERANKER_MODEL, query: '', documents: DOCUMENTS.map((d) => d.text) });
    rec.structural('the empty query scores every document 0, never NaN', empty.scores.every((x) => x === 0), 0);

    // ── 空文档列表 ──
    const noDocs = await provider.rerank({ model: LOCAL_RERANKER_MODEL, query: 'x', documents: [] });
    rec.structural('the empty document list yields the empty score list', noDocs.scores.length === 0, 0);

    // ── 重排自洽：目标文档必须在 top-2 之间 ──
    let hits = 0;
    for (let i = 0; i < QUERIES.length; i++) {
      const { q, want } = QUERIES[i]!;
      const scored = firstHalf[i]!.scores.map((s, j) => ({ id: DOCUMENTS[j]!.id, score: s })).sort((a, b) => b.score - a.score);
      const top1 = scored[0]!;
      const top2 = scored[1]!;
      const ok = top1.id === want || top2.id === want;
      if (ok) hits += 1;
      rec.structural(`query ${q.slice(0, 10)}… → ${want} in the top-2`, ok, `top1=${top1.id} top2=${top2.id}`);
    }
    rec.structural(`relevant doc in top-2 == 8 / 8 (${hits}/${QUERIES.length})`, hits === QUERIES.length, hits);

    // ── 阅读序：任何 score 都有限 ──
    rec.structural('all scores are finite numbers', firstHalf.every((r) => r.scores.every(Number.isFinite)), 1);

    return rec;
  },
};
