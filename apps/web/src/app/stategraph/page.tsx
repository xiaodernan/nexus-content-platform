import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, type Locale } from '@/lib/i18n';
import { StategraphTry } from '@/components/StategraphTry';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === 'zh'
    ? {
        title: 'StateGraph · AI 调用的状态图 — NEXUS',
        description: 'LangGraph StateGraph 在 NEXUS 的真实落点：validate → check_provider → build_prefix → call_llm → cache_read → parse_and_release → assemble，任一节点失败即直通 END；公开只读试跑按钮，真 provider、真 header（x-nexus-orchestration: stategraph）、真计量。',
      }
    : {
        title: 'StateGraph · the state graph behind the AI call — NEXUS',
        description: 'Where LangGraph StateGraph really runs in NEXUS: validate → check_provider → build_prefix → call_llm → cache_read → parse_and_release → assemble, with any failed node going straight to END; a public read-only live probe with a real provider, a real header (x-nexus-orchestration: stategraph) and real metering.',
      };
}

/**
 * cont. 169 · `/stategraph` —— StateGraph 不再只是说明书里的一段话。
 *
 * 这个页面回答三个问题：
 *  1. 图长什么样？—— 7 个节点、条件边、失败直通 END（与 /v1/ai/run 同契约、同顺序）
 *  2. 为什么值得做？—— 可读 / 可测 / 可替换；LangGraph 编译一次复用
 *  3. 能不能亲眼看一眼？—— 下面的公开试跑按钮，真 provider + 真 header + 真计量
 *
 * 纪律：
 *  - 页面只读、无用户输入；试跑固定 critique + dryRun + fast
 *  - 失败如实展示（409/429/502/503 原样呈现），绝不包装成成功
 *  - 不宣称任何 SLA；数字来自当下这次调用的回执，不是承诺
 */

const COPY: Record<
  Locale,
  {
    kicker: string;
    title: string;
    lede: string;
    nodesTitle: string;
    nodesNote: string;
    nodes: readonly { name: string; role: string; fail: string }[];
    edgesTitle: string;
    edgesNote: string;
    whyTitle: string;
    why: readonly { head: string; body: string }[];
    whereTitle: string;
    whereNote: string;
    where: readonly { label: string; value: string }[];
    footNote: string;
    footStamp: string;
  }
> = {
  zh: {
    kicker: 'StateGraph · LangGraph 状态图',
    title: 'AI 调用的状态图',
    lede: 'NEXUS 的 AI 编排不是一个黑盒函数：它被编译成一张显式的 StateGraph —— 七个节点、两条条件边的分叉、任何一步失败都沿着图走向 END，返回与 /v1/ai/run 逐字节同构的契约。这一页讲清楚它长什么样、为什么这样设计、以及怎么当场按一下按钮看到真的一回。',
    nodesTitle: '七个节点 · 一次请求的完整旅程',
    nodesNote: '节点之间传递的是同一个 DesignGraphState（payload / registry / status / body / stages / model / stable_digest / completion / reply）。每个节点只写它负责的那几个键；其余原样透传。',
    nodes: [
      { name: 'validate', role: '按 contracts/ai-request.schema.json 校验请求体（Web/服务端同一 zod 定义导出的 JSON Schema）。', fail: '校验失败 → status=400 → 条件边直通 END' },
      { name: 'check_provider', role: '按 modelClass（fast / balanced / reasoning…）查 registry：这个档位有没有对应的在册 provider。', fail: '没在册或档位不支持 → status=503 → 直通 END' },
      { name: 'build_prefix', role: '装配 provider 看到的系统前缀与用户上下文（§CACHE-2：稳定前缀 + 易变后缀），计算 stable_digest（sha16）并喂给 cache telemetry。', fail: '无失败分支（本地计算；异常即整体 500）' },
      { name: 'call_llm', role: '经 StickyPromptCacheTransport 调真 provider（gpt-6.2-sol，走 HTTPS_PROXY 环境代理），温度由模型类决定。', fail: 'provider 抛错/超时 → status=502（retryable）→ 直通 END' },
      { name: 'cache_read', role: '把 provider 回执里的 cached_tokens / tokens_in 记入 cache telemetry（prefix / upstream / provider 三本账，分账不合并）。', fail: '无失败分支（telemetry 只读回执；缺字段即如实记 cache-not-reported）' },
      { name: 'parse_and_release', role: '解析模型输出的 JSON，逐 patch 按 design-patch.schema.json 校验；不合格的 patch 直接拒整组。', fail: '解析失败 / patch 不符契约 → status=502 → 直通 END' },
      { name: 'assemble', role: '按 ai-response.schema.json 组装最终响应（plans / patches / usage / approvals），dryRun 时强制不落盘并标注预演。', fail: '自组装响应不符契约 → status=500（内部错误，不泄漏细节）' },
    ],
    edgesTitle: '条件边只有一处形态：失败即 END',
    edgesNote: 'validate / check_provider / call_llm / parse_and_release 四个节点各带一条条件边 _needs_review：status ≥ 400 → END，否则继续。build_prefix、cache_read、assemble 是无条件边。图的每一条边都对应真实的一次分支，而不是 try/catch 的另一块注释。',
    whyTitle: '为什么值得做这张图',
    why: [
      { head: '可读', body: '主循环不再是一个 300 行的大函数：每个节点单职责、可单测、日志里直接印出 validate -> check_provider -> … 的完整旅程（ai-service 的 stategraph stages 日志一行即是一次调用）。' },
      { head: '可测', body: 'apps/ai-service/tests/test_stategraph.py 共 8 个用例：happy path 200、编译后的节点顺序、dryRun 抑制 patches、无 provider 503、坏载荷 400、破坏性 op 触发审批挂起、非 JSON 输出 502、坏 patch 502。' },
      { head: '可替换', body: '节点只是函数；换 provider、换缓存策略、换持久化，都不动图的结构。业务代码不 import 任何 SDK —— registry 注入一切。' },
      { head: '同一契约', body: '图产生的响应与 /v1/ai/run 逐字节同构（同一 ai-response.schema.json）；区别只在执行结构是 LangGraph 编译的图，外加一个响应头 x-nexus-orchestration: stategraph 作为公开标记。' },
      { head: '失败是走出来的，不是 catch 出来的', body: '任何节点失败，图沿条件边直达 END，response 里带着该节点写下的 status/body —— 调用方看到的是 400/502/503 中的一个真实答案，而不是一个 200 包着的残骸。' },
    ],
    whereTitle: '它现在坐在哪里',
    whereNote: '源码是唯一真值；下面的每一条都能在仓库里直接搜到。',
    where: [
      { label: '路由（API）', value: 'POST /v1/ai/design-graph（ai-service :3200；经 web 同源转发为 /api/stategraph）' },
      { label: '源文件', value: 'apps/ai-service/src/ai_service/stategraph.py（build_design_graph / run_design_stategraph）' },
      { label: '响应头', value: 'x-nexus-orchestration: stategraph —— 图真实执行的唯一公开标记，失败时同样返回' },
      { label: '测试', value: 'apps/ai-service/tests/test_stategraph.py · 8 用例全绿' },
      { label: '说明书章节', value: '/guide →「AI 对话框的那头在干什么（StateGraph 小节）」' },
      { label: '首次编译', value: '首次触发会编译 LangGraph（约数十秒），之后进程内复用已编译的图' },
      { label: '对话车道（cont.254）', value: 'POST /v1/ai/chat-graph — 角色对话与潮汐预言默认走同一张图：mirror 七节点（chat_stategraph.py），响应与 /v1/ai/chat 逐字节同构（AiChatResponse）；`x-nexus-orchestration: stategraph` 同样回声；逃生门 NEXUS_AI_CHAT_ORCHESTRATION=lane-a' },
    ],
    footNote: '试跑按钮调用的是与生产相同的编排图，仅把意图固定为 critique + dryRun + fast。provider 未就绪时按 409 如实拒绝；限流 6 次 / 10 分钟 / IP。',
    footStamp: 'cont. 169 · StateGraph 公开只读落点',
  },
  en: {
    kicker: 'StateGraph · LangGraph state graph',
    title: 'The state graph behind the AI call',
    lede: 'NEXUS AI orchestration is not a 300-line black box: it is compiled into an explicit StateGraph — seven nodes, conditional branches, and any failure falls straight to END with a response byte-identical to /v1/ai/run. This page shows what it looks like, why it is built this way, and how to press the button and watch the real thing happen.',
    nodesTitle: 'Seven nodes · the full journey of one request',
    nodesNote: 'Nodes pass around one shared DesignGraphState (payload / registry / status / body / stages / model / stable_digest / completion / reply). Each node writes only the keys it owns; everything else flows through untouched.',
    nodes: [
      { name: 'validate', role: 'Validates the body against contracts/ai-request.schema.json (the same zod source of truth exported to JSON Schema).', fail: 'Bad payload → status=400 → conditional edge to END' },
      { name: 'check_provider', role: 'Resolves modelClass (fast / balanced / reasoning…) against the registry — is there an in-house provider for this tier?', fail: 'No provider for the tier → status=503 → straight to END' },
      { name: 'build_prefix', role: 'Assembles the stable system prefix + volatile suffix (§CACHE-2), computes stable_digest (sha16) and feeds cache telemetry.', fail: 'No failure branch (pure local computation; unexpected exceptions surface as 500)' },
      { name: 'call_llm', role: 'Calls the real provider through StickyPromptCacheTransport (gpt-6.2-sol, via HTTPS_PROXY); sampling decided by model class.', fail: 'Provider error/timeout → status=502 (retryable) → straight to END' },
      { name: 'cache_read', role: 'Records cached_tokens / tokens_in from the provider receipt into cache telemetry (prefix / upstream / provider — three ledgers, never merged).', fail: 'No failure branch (telemetry reads the receipt; absent fields are logged as cache-not-reported)' },
      { name: 'parse_and_release', role: 'Parses the model JSON and validates every patch against design-patch.schema.json; one bad patch rejects the whole batch.', fail: 'Unparseable output / contract-violating patch → status=502 → straight to END' },
      { name: 'assemble', role: 'Builds the final response against ai-response.schema.json (plans / patches / usage / approvals); dryRun forces no-write and labels the rehearsal.', fail: 'Self-assembled response violating the contract → status=500 (internal, no detail leaked)' },
    ],
    edgesTitle: 'One shape of conditional edge: failure means END',
    edgesNote: 'validate / check_provider / call_llm / parse_and_release each carry the same conditional edge, _needs_review: status ≥ 400 → END, otherwise continue. build_prefix, cache_read and assemble are unconditional edges. Every branch in the graph is a real fork — not a comment next to a try/catch.',
    whyTitle: 'Why this graph is worth having',
    why: [
      { head: 'Legible', body: 'The main loop is no longer one long function: single-responsibility nodes, unit-testable in isolation, with the full journey printed into the logs as one line — validate -> check_provider -> … (ai-service logs stategraph stages per call).' },
      { head: 'Testable', body: 'apps/ai-service/tests/test_stategraph.py — 8 cases: happy-path 200, compiled node order, dryRun suppressing patches, missing provider 503, invalid payload 400, destructive op parks for approval, non-JSON reply 502, bad-patch 502.' },
      { head: 'Replaceable', body: 'Nodes are just functions; swapping a provider, a cache policy or a persistence layer never moves the graph’s shape. Business code imports no SDK — the registry injects everything.' },
      { head: 'One contract', body: 'The graph’s response is byte-identical to /v1/ai/run (same ai-response.schema.json); the only difference is the execution structure — a compiled LangGraph — plus the public marker header x-nexus-orchestration: stategraph.' },
      { head: 'Failure is walked, not caught', body: 'When any node fails the graph follows its conditional edge to END, carrying exactly the status/body that node wrote — the caller sees a real 400/502/503 answer, never a 200-wrapped carcass.' },
    ],
    whereTitle: 'Where it sits right now',
    whereNote: 'The source is the single source of truth; every line below can be greped in the repo.',
    where: [
      { label: 'Route (API)', value: 'POST /v1/ai/design-graph (ai-service :3200; fronted same-origin by /api/stategraph)' },
      { label: 'Source file', value: 'apps/ai-service/src/ai_service/stategraph.py (build_design_graph / run_design_stategraph)' },
      { label: 'Marker header', value: 'x-nexus-orchestration: stategraph — the only public proof the graph ran, returned on failures too' },
      { label: 'Tests', value: 'apps/ai-service/tests/test_stategraph.py · 8 cases green' },
      { label: 'Guide section', value: '/guide → “What is at the other end of the AI dialog (the StateGraph section)”' },
      { label: 'First compile', value: 'The first call compiles the LangGraph (tens of seconds); the compiled graph is then reused in-process' },
      { label: 'Chat lane (cont.254)', value: 'POST /v1/ai/chat-graph — character chat and Tide-Oracle ride the same graph by default: mirror seven nodes (chat_stategraph.py), byte-identical to /v1/ai/chat (AiChatResponse); `x-nexus-orchestration: stategraph` echoes too; escape hatch NEXUS_AI_CHAT_ORCHESTRATION=lane-a' },
    ],
    footNote: 'The try button invokes the same production graph with intent fixed to critique + dryRun + fast. When no provider is configured it refuses with 409 — honestly; rate limit 6 runs / 10 min / IP.',
    footStamp: 'cont. 169 · the public read-only home of the StateGraph',
  },
};

export default async function StategraphPage() {
  const locale = (await getLocale()) as Locale;
  const c = COPY[locale];
  return (
    <main className="sg-root" data-stategraph-root data-stategraph-locale={locale}>
      <header className="sg-hero">
        <p className="sg-kicker">{c.kicker}</p>
        <h1 className="sg-title">{c.title}</h1>
        <p className="sg-lede">{c.lede}</p>
      </header>

      <section className="sg-section" data-stategraph-section="nodes">
        <h2 className="sg-sectionTitle">{c.nodesTitle}</h2>
        <p className="sg-sectionNote">{c.nodesNote}</p>
        <ol className="sg-nodes">
          {c.nodes.map((node, index) => (
            <li key={node.name} className="sg-node">
              <span className="sg-nodeIndex">{index + 1}</span>
              <div className="sg-nodeBody">
                <code className="sg-nodeName">{node.name}</code>
                <p className="sg-nodeRole">{node.role}</p>
                <p className="sg-nodeFail">{node.fail}</p>
              </div>
            </li>
          ))}
        </ol>
        <h3 className="sg-edgesTitle">{c.edgesTitle}</h3>
        <p className="sg-sectionNote">{c.edgesNote}</p>
      </section>

      <section className="sg-section" data-stategraph-section="why">
        <h2 className="sg-sectionTitle">{c.whyTitle}</h2>
        <ul className="sg-why">
          {c.why.map((item) => (
            <li key={item.head} className="sg-whyItem">
              <strong className="sg-whyHead">{item.head}</strong>
              <span className="sg-whyBody">{item.body}</span>
            </li>
          ))}
        </ul>
      </section>

      <StategraphTry locale={locale} />

      <section className="sg-section" data-stategraph-section="where">
        <h2 className="sg-sectionTitle">{c.whereTitle}</h2>
        <p className="sg-sectionNote">{c.whereNote}</p>
        <ul className="sg-where">
          {c.where.map((item) => (
            <li key={item.label} className="sg-whereItem">
              <span className="sg-whereLabel">{item.label}</span>
              <code className="sg-whereValue">{item.value}</code>
            </li>
          ))}
        </ul>
        <p className="sg-whereFoot">
          <Link className="sg-whereLink" href="/guide">/guide</Link>
          <Link className="sg-whereLink" href="/observatory">/observatory</Link>
          <Link className="sg-whereLink" href="/pulse">/pulse</Link>
        </p>
      </section>

      <footer className="sg-foot">
        <p className="sg-footNote">{c.footNote}</p>
        <p className="sg-footStamp">{c.footStamp}</p>
      </footer>
    </main>
  );
}
