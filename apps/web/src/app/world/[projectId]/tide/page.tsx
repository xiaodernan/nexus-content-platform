import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { buildTide, EROSION_BODY_LIMIT, TIDE_PRESSURE_KINDS, type TidePressureKind } from '@/lib/tide';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '世界潮汐 · NEXUS',
  description: '作者声明的扰模如何压向世界——五种扰模各司其职；以下数字全部从你的落笔节点算出的真值。',
};

/**
 * 「世界潮汐」——作者声明的扰模如何压向这个世界（v710 §B）。
 *
 * 诚实边界：
 * - 2026-11-14 起（v721）：世界文档带有可选的 `pressures`（作者声明的扰模，见 ADR-0267）——
 *   Studio 世界面板底部的「潮汐扰模」段里写了一条，本页声明区就自动亮成「已声明」投影；
 *   没写过的话，声明区如实空白并指出声明从哪来。
 * - 本页没有任何「发生了」的叙事：每个数字都是真演算（kind 过滤 + 词典命中 + 长度阈值）；
 *   severity（1 要闻 / 2 季节 / 3 纪元）是作者的着墨，不参与任何计数。
 * - 只有项目作者可见。
 */

const RULE_COPY: Record<TidePressureKind, { label: string; rule: string }> = {
  drought: { label: '干亢', rule: 'title+body 命中水词典（海/河/雨/tide…）——干旱不会遍布全图，只压住与水有关的地方' },
  progeny: { label: '繁衍', rule: 'kind ∈ 生物/人物/势力 且命中繁衍词典（幼/卵/孵/spawn…）——新生只长在会生的枝上' },
  inflation: { label: '通胀', rule: 'kind ∈ 物品/势力 一律暴露，不认词典——价格不会凭空跳过某一代商人' },
  erosion: { label: '寂蚀', rule: `body 长度 < ${EROSION_BODY_LIMIT} 字的一切落笔节点——薄的纸先破` },
  murmur: { label: '潮声', rule: 'kind ∈ 故事/历史 且命中传闻词典（风声/谣/whisper…）——谣言走叙事线' },
};

export default async function TidePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const [world, project] = await Promise.all([loadWorld(projectId), loadDocument(projectId)]);
  if (!project) notFound();

  const worldOk = world && world.ok ? world.document : null;
  const nodes = worldOk ? worldOk.nodes : [];
  const totalAuthored = nodes.filter((node) => node.body.trim().length > 0).length;

  // 声明投影：文档没带 pressures（从没声明过）→ null，声明区如实空白并指路；
  // 带了就照 severity/kind 原样进 buildTide 真演算，不给兜底、不给假数
  const declaredRaw = (worldOk as { pressures?: unknown } | null)?.pressures;
  const declared = Array.isArray(declaredRaw)
    ? buildTide(nodes, declaredRaw as { id: string; kind: string; label: string; severity: number }[])
    : null;

  // 机制预演（always real）：五个扰模各自当下能压住多少个节点
  const preview = buildTide(
    nodes,
    TIDE_PRESSURE_KINDS.map((kind) => ({
      id: `preview-${kind}`,
      kind,
      label: RULE_COPY[kind].label,
      severity: 2 as const,
    })),
  );
  const byKindOf = kindBreakdown;

  if (!worldOk) {
    return (
      <main className="td-empty" data-tide-empty>
        <h1 className="td-emptyTitle">潮汐打不开——世界读不出来</h1>
        <p className="td-emptyCopy">
          「{project.name}」的世界文档现在读不到，所以这里不画任何数字。先去 Studio 检查世界面板，世界确定能读再回来。
        </p>
        <Link href={`/studio/${projectId}`} className="td-emptyLink" data-tide-empty-studio>
          回到 Studio 的世界面板 →
        </Link>
      </main>
    );
  }

  return (
    <main className="td-root" data-tide-root>
      <header className="td-hero">
        <p className="td-kicker" data-tide-kicker>TIDE · {project.name}</p>
        <h1 className="td-title">世界潮汐</h1>
        <p className="td-lede" data-tide-lede>
          作者声明的扰模如何压向这个世界——五种扰模各司其职、各守一规；下面全部数字都是当下从你落笔的 {totalAuthored} 篇文档里算出的真值。
        </p>
        <p className="td-footnote" data-tide-footnote>仅作者可见 · 零 provider · severity（1 要闻 / 2 季节 / 3 纪元）不参与任何计数</p>
      </header>

      <section className="td-panel" aria-label="作者声明" data-tide-panel>
        <p className="td-panelKicker">作者声明</p>
        {declared === null ? (
          <p className="td-panelNote" data-tide-decl-empty>
            这份世界文档里还没有扰模声明——去 Studio 世界面板底部的「潮汐扰模」里写一条，这里就会亮（severity 1 要闻 / 2 季节 / 3 纪元，不参与计数）。
            引擎本身已经可以构建、可以单测——下方「若声明」是对今天这份文档的真预演。
          </p>
        ) : declared.declared === 0 ? (
          <p className="td-panelNote" data-tide-decl-empty>
            声明数组是空的——一条扰模都没写。写一条就亮。
          </p>
        ) : (
          <>
            {declared.effects.map((effect) => (
              <div key={effect.pressureId} className="td-ruleRow" data-tide-decl={effect.pressureId}>
                <p className="td-ruleLabel">{effect.label}<span className="td-ruleKind">{effect.kind}</span></p>
                <p className="td-ruleCounts">
                  {effect.hits} 个节点 · severity {effect.severity}
                  {effect.hits > 0 ? ` · ${kindBreakdown(effect.byKind)}` : ''}
                </p>
              </div>
            ))}
            {declared.invalid.map((item) => (
              <p key={`${item.pressureId}-${item.reason}`} className="td-invalid" data-tide-invalid={item.pressureId}>
                ⚠ {item.pressureId}：{item.reason}
              </p>
            ))}
          </>
        )}
      </section>

      <section className="td-rules" aria-label="五种扰模与真预演" data-tide-rules>
        <p className="td-panelKicker">若声明 · 机制预演</p>
        <ul className="td-ruleList">
          {TIDE_PRESSURE_KINDS.map((kind) => {
            const effect = preview.effects.find((entry) => entry.kind === kind)!;
            const copy = RULE_COPY[kind];
            return (
              <li key={kind} className="td-ruleRow" data-tide-rule={kind}>
                <div className="td-ruleHead">
                  <p className="td-ruleLabel">{copy.label}<span className="td-ruleKind">{kind}</span></p>
                  <p className="td-ruleHits" data-tide-rule-hits={kind}>{effect.hits} 篇</p>
                </div>
                <p className="td-ruleCopy">{copy.rule}</p>
                <p className="td-ruleKinds" data-tide-rule-kinds={kind}>
                  {effect.hits > 0 ? `命中构成：${byKindOf(effect.byKind)}` : '暂无命中——这本世界里还没有落水、幼、账、薄、谣'}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="td-foot" data-tide-foot>
        <Link className="am-linkImplicit" href={`/world/${projectId}`} data-tide-back-graph>← 回到世界图</Link>
        <Link className="td-footLink" href={`/world/${projectId}/digest`} data-tide-open-digest>世界速览 →</Link>
        <Link className="td-footLink" href={`/world/${projectId}/codex`} data-tide-open-codex>设定集 →</Link>
      </footer>
    </main>
  );
}

/** 声明投影的 byKind 展示位（kind → 计数链表，用 · 分隔）。 */
function kindBreakdown(byKind: Record<string, number>): string {
  return Object.entries(byKind).map(([kind, n]) => `${kind} ${n}`).join(' · ');
}
