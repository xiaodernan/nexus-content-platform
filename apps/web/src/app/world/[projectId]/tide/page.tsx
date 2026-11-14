import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { getLocale } from '@/lib/i18n';
import { buildTide, EROSION_BODY_LIMIT, TIDE_PRESSURE_KINDS, type TidePressureKind } from '@/lib/tide';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '世界潮汐 · NEXUS',
  description: '作者声明的扰模如何压向世界——五种扰模各司其职；以下数字全部从你的落笔节点算出的真值。',
};

/**
 * 「世界潮汐」——作者声明的扰模如何压向这个世界（v710 §B）。中英双语（v722）：
 * 文案全部来自下方的 COPY 双语字典（locale 由 cookie 的 NEXUS_LOCALE 决定）。
 *
 * 诚实边界：2026-11-14 起（v721–v722）：世界文档带有可选的 `pressures`（作者声明的扰模，见 ADR-0267）——
 * Studio 世界面板底部的「潮汐扰模」段里写了一条，本页声明区就自动亮成「已声明」投影；
 * 没写过的话，声明区如实空白并指出声明从哪来。本页没有任何「发生了」的叙事：每个数字都是真演算；
 * severity（1 要闻 / 2 季节 / 3 纪元）是作者的着墨，不参与任何计数。只有项目作者可见。
 */

interface RuleCopy {
  label: string;
  rule: string;
}

const RULE_COPY: Record<'zh' | 'en', Record<TidePressureKind, RuleCopy>> = {
  zh: {
    drought: { label: '干亢', rule: 'title+body 命中水词典（海/河/雨/tide…）——干旱不会遍布全图，只压住与水有关的地方' },
    progeny: { label: '繁衍', rule: 'kind ∈ 生物/人物/势力 且命中繁衍词典（幼/卵/孵/spawn…）——新生只长在会生的枝上' },
    inflation: { label: '通胀', rule: 'kind ∈ 物品/势力 一律暴露，不认词典——价格不会凭空跳过某一代商人' },
    erosion: { label: '寂蚀', rule: `body 长度 < ${EROSION_BODY_LIMIT} 字的一切落笔节点——薄的纸先破` },
    murmur: { label: '潮声', rule: 'kind ∈ 故事/历史 且命中传闻词典（风声/谣/whisper…）——谣言走叙事线' },
  },
  en: {
    drought: { label: 'Drought', rule: 'title/body water-lexicon hit (sea/river/rain/tide…) — drought spans only where water speaks' },
    progeny: { label: 'Progeny', rule: 'kind ∈ creatures/characters/factions AND progeny-lexicon (spawn/hatch/birth…) — life grows only on life\'s branch' },
    inflation: { label: 'Inflation', rule: 'kind ∈ items/factions face it wholesale, no lexicon — price never skips a generation of merchants' },
    erosion: { label: 'Erosion', rule: `body < ${EROSION_BODY_LIMIT} chars (any authored node) — thin paper tears first` },
    murmur: { label: 'Murmur', rule: 'kind ∈ story/history AND rumor-lexicon (rumor/whisper/hearsay…) — news travels the narrative line' },
  },
};

const COPY = {
  zh: {
    kicker: 'TIDE',
    title: '世界潮汐',
    lede: (n: number) => `作者声明的扰模如何压向这个世界——五种扰模各司其职、各守一规；下面全部数字都是当下从你落笔的 ${n} 篇文档里算出的真值。`,
    footnote: '仅作者可见 · 零 provider · severity（1 要闻 / 2 季节 / 3 纪元）不参与任何计数',
    emptyTitle: '潮汐打不开——世界读不出来',
    emptyCopy: (name: string) => `「${name}」的世界文档现在读不到，所以这里不画任何数字。先去 Studio 检查世界面板，世界确定能读再回来。`,
    emptyLink: '回到 Studio 的世界面板 →',
    emptyDeclPrompt: '这份世界文档里还没有扰模声明——去 Studio 世界面板底部的「潮汐扰模」里写一条，这里就会亮（severity 1 要闻 / 2 季节 / 3 纪元，不参与计数）。引擎本身已经可以构建、可以单测——下方「若声明」是对今天这份文档的真预演。',
    emptyDeclZero: '声明数组是空的——一条扰模都没写。写一条就亮。',
    declPanelKicker: '作者声明',
    declNodesSuffix: '个节点',
    declSeverity: (s: number) => `severity ${s}`,
    previewKicker: '若声明 · 机制预演',
    hitsSuffix: '篇',
    zeroHits: '暂无命中——这本世界里还没有落水、幼、账、薄、谣',
    kindBreakdown: '命中构成',
    footBack: '← 回到世界图',
    footDigest: '世界速览 →',
    footCodex: '设定集 →',
  },
  en: {
    kicker: 'TIDE',
    title: 'World Tide',
    lede: (n: number) => `How the declared pressures press on this world — five pressures, five standing rules; every number below is the real count from your ${n} authored nodes at this moment.`,
    footnote: 'Author-only · zero provider · severity (1 brief / 2 season / 3 era) never enters any count',
    emptyTitle: 'Tide can’t open — the world document won’t load',
    emptyCopy: (name: string) => `「${name}」’s world document can’t be read right now, so nothing here pretends to a count. Head back to the Studio world panel, confirm the world loads, then come back.`,
    emptyLink: 'Back to the Studio world panel →',
    emptyDeclPrompt: 'This world document has no declared pressures yet — write one in the “World Tide” panel at the bottom of the Studio world panel, and this section lights up (severity 1 brief / 2 season / 3 era, never a counting input). The engine itself already builds and unit-test green — “If declared” below is the real preview against today’s document.',
    emptyDeclZero: 'The pressures array is empty — declare a single one and it lights up.',
    declPanelKicker: 'Author-declared',
    declNodesSuffix: ' nodes',
    declSeverity: (s: number) => `severity ${s}`,
    previewKicker: 'If declared · mechanism preview',
    hitsSuffix: ' entries',
    zeroHits: 'No hits yet — no water-stretch, spawns, ledgers, thin pages or rumor threads in this world',
    kindBreakdown: 'By kind',
    footBack: '← Back to the world',
    footDigest: 'World digest →',
    footCodex: 'Codex →',
  },
} as const;

export default async function TidePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const [world, project] = await Promise.all([loadWorld(projectId), loadDocument(projectId)]);
  if (!project) notFound();

  const locale = await getLocale();
  const copy = COPY[locale];
  const ruleCopy = RULE_COPY[locale];

  const worldOk = world && world.ok ? world.document : null;
  const nodes = worldOk ? worldOk.nodes : [];
  const totalAuthored = nodes.filter((node) => node.body.trim().length > 0).length;

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
      label: ruleCopy[kind].label,
      severity: 2 as const,
    })),
  );
  const byKindCount = (byKind: Record<string, number>) =>
    Object.entries(byKind).map(([kind, n]) => `${kind} ${n}`).join(' · ');

  if (!worldOk) {
    return (
      <main className="td-empty" data-tide-empty>
        <h1 className="td-emptyTitle">{copy.emptyTitle}</h1>
        <p className="td-emptyCopy">{copy.emptyCopy(project.name)}</p>
        <Link href={`/studio/${projectId}`} className="td-emptyLink" data-tide-empty-studio>
          {copy.emptyLink}
        </Link>
      </main>
    );
  }

  return (
    <main className="td-root" data-tide-root>
      <header className="td-hero">
        <p className="td-kicker" data-tide-kicker>{copy.kicker} · {project.name}</p>
        <h1 className="td-title">{copy.title}</h1>
        <p className="td-lede" data-tide-lede>{copy.lede(totalAuthored)}</p>
        <p className="td-footnote" data-tide-footnote>{copy.footnote}</p>
      </header>

      <section className="td-panel" aria-label={copy.declPanelKicker} data-tide-panel>
        <p className="td-panelKicker">{copy.declPanelKicker}</p>
        {declared === null ? (
          <p className="td-panelNote" data-tide-decl-empty>{copy.emptyDeclPrompt}</p>
        ) : declared.declared === 0 ? (
          <p className="td-panelNote" data-tide-decl-empty>{copy.emptyDeclZero}</p>
        ) : (
          <>
            {declared.effects.map((effect) => (
              <div key={effect.pressureId} className="td-ruleRow" data-tide-decl={effect.pressureId}>
                <p className="td-ruleLabel">{effect.label}<span className="td-ruleKind">{effect.kind}</span></p>
                <p className="td-ruleCounts">
                  {effect.hits}{copy.declNodesSuffix} · {copy.declSeverity(effect.severity)}
                  {effect.hits > 0 ? ` · ${byKindCount(effect.byKind)}` : ''}
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

      <section className="td-rules" aria-label={copy.previewKicker} data-tide-rules>
        <p className="td-panelKicker">{copy.previewKicker}</p>
        <ul className="td-ruleList">
          {TIDE_PRESSURE_KINDS.map((kind) => {
            const effect = preview.effects.find((entry) => entry.kind === kind)!;
            const rule = ruleCopy[kind];
            return (
              <li key={kind} className="td-ruleRow" data-tide-rule={kind}>
                <div className="td-ruleHead">
                  <p className="td-ruleLabel">{rule.label}<span className="td-ruleKind">{kind}</span></p>
                  <p className="td-ruleHits" data-tide-rule-hits={kind}>{effect.hits}{copy.hitsSuffix}</p>
                </div>
                <p className="td-ruleCopy">{rule.rule}</p>
                <p className="td-ruleKinds" data-tide-rule-kinds={kind}>
                  {effect.hits > 0 ? `${copy.kindBreakdown}：${byKindCount(effect.byKind)}` : copy.zeroHits}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="td-foot" data-tide-foot>
        <Link className="am-linkImplicit" href={`/world/${projectId}`} data-tide-back-graph>{copy.footBack}</Link>
        <Link className="td-footLink" href={`/world/${projectId}/digest`} data-tide-open-digest>{copy.footDigest}</Link>
        <Link className="td-footLink" href={`/world/${projectId}/codex`} data-tide-open-codex>{copy.footCodex}</Link>
      </footer>
    </main>
  );
}
