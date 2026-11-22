import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadWorld } from '@/server/domain/worlds';
import { listCharacters } from '@/server/domain/characters';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { getLocale, type Locale } from '@/lib/i18n';
import { buildQuestBoard, THIN_BODY_LIMIT, type WorldQuestKind } from '@/lib/worldQuests';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '世界委托 · NEXUS',
  description: '每天从世界真值里挑三件可以动手的事——没有编出来的任务，没有假进度，做完一件就真的从板上消失。',
};

/**
 * 「世界委托」——/world/<id>/quests。
 *
 * 与 /integrity 的分工：体检单是「全部指标摊开」，委托板是「今天先做哪三件」。
 * 数字与体检同口径（同一批真表字段 / buildChronicle / buildWorldNetwork），
 * 所以两页永远不会互相矛盾。零 provider、零写库、零随机；同一天同一世界同一组委托。
 */

const TARGET: Record<WorldQuestKind, (projectId: string) => string> = {
  skeleton: (id) => `/world/${id}/codex`,
  thin: (id) => `/world/${id}/codex`,
  untagged: (id) => `/world/${id}/chronicle`,
  'order-clash': (id) => `/world/${id}/chronicle`,
  unresolved: (id) => `/world/${id}/constellation`,
  isolated: (id) => `/world/${id}/network`,
  'cut-vertex': (id) => `/world/${id}/network`,
  'empty-palette': (id) => `/studio/${id}`,
};

interface QuestCopy {
  title: string;
  line: (n: number) => string;
  steps: readonly string[];
  action: string;
}

interface QuestCopyBlock {
  kicker: string;
  title: string;
  lede: string;
  footnote: string;
  dayLabel: (day: string) => string;
  todayKicker: string;
  todayLede: string;
  todayEmpty: string;
  restTitle: string;
  restLede: string;
  restEmpty: string;
  closedTitle: string;
  closedLede: string;
  closedEmpty: string;
  notStartedTitle: string;
  notStartedLede: string;
  samplePrefix: string;
  emptyTitle: string;
  emptyCopy: (name: string) => string;
  emptyLink: string;
  emptyLoadTitle: string;
  emptyLoadCopy: (name: string) => string;
  emptyLoadLink: string;
  backGraph: string;
  openIntegrity: string;
  openNetwork: string;
  quests: Record<WorldQuestKind, QuestCopy>;
}

const COPY: Record<Locale, QuestCopyBlock> = {
  zh: {
    kicker: 'COMMISSIONS',
    title: '世界委托',
    lede: '每天从你的世界真值里挑三件可以动手的事——没有编出来的任务，没有假进度；做完一件，它就真的从板上消失。',
    footnote: '仅作者可见 · 数字来自 worlds / characters 真表 · 今日委托由世界 id 与日期决定 · 零 provider · 零写库',
    dayLabel: (day: string) => `委托日 ${day}`,
    todayKicker: '今日委托',
    todayLede: '这三件由世界 id 与日期共同决定：同一天回来还是同一组，跨天自然换一批。',
    todayEmpty: '今天没有委托——这个世界现在没有可查的缺口。',
    restTitle: '其余可做的事',
    restLede: '轮转在今天三件之后的缺口。计数同样是真的。',
    restEmpty: '今天挑中的三件就是全部待办——其余的项都已经了结。',
    closedTitle: '已经了结',
    closedLede: '这些项现在计数为零——不是被隐藏，是真的没有缺口了。',
    closedEmpty: '还没有任何一项真正了结。',
    notStartedTitle: '还没有可做的东西',
    notStartedLede: '这些项对应的人群/关系还不存在，所以不当作完成。',
    samplePrefix: '例如',
    emptyTitle: '这个世界还没有一行字',
    emptyCopy: (name: string) =>
      `「${name}」的世界文档是空的，所以委托板没有可派的活。先去 Studio 落下第一条——世界面板、画布或设定集都行。`,
    emptyLink: '去 Studio 落第一条 →',
    emptyLoadTitle: '委托板打不开——世界读不出来',
    emptyLoadCopy: (name: string) =>
      `「${name}」的世界文档现在读不到，所以这里不画任何委托。先去 Studio 检查世界面板，世界确定能读再回来。`,
    emptyLoadLink: '回到 Studio 的世界面板 →',
    backGraph: '← 回到世界图',
    openIntegrity: '世界体检 →',
    openNetwork: '万象脉络 →',
    quests: {
      skeleton: {
        title: '给空页落笔',
        line: (n: number) => `还有 ${n} 个条目只在名册上占了一行，正文仍是空白。`,
        steps: ['打开设定集，点开任意一张空页。', '写下第一段正文——一句也算。', '保存后回来，这一项的计数会真的减少。'],
        action: '去设定集 →',
      },
      thin: {
        title: '把短注写厚',
        line: (n: number) => `还有 ${n} 条落笔记录短于 ${THIN_BODY_LIMIT} 字，像一句没写完的旁注。`,
        steps: ['去设定集按标题找到它。', '补上地点、时间，或一个人的反应。', `过 ${THIN_BODY_LIMIT} 字后它就不再是薄节点。`],
        action: '去设定集 →',
      },
      untagged: {
        title: '把条目放回时间里',
        line: (n: number) => `还有 ${n} 条故事或历史没有归到任何纪元，悬在时间外面。`,
        steps: ['打开编年史，找到「未标纪元」那一档。', '给条目填一个纪元名——你世界自己的名字。', '填完它就会回到正确的那一行。'],
        action: '去编年 →',
      },
      'order-clash': {
        title: '排开撞号的两行',
        line: (n: number) => `有 ${n} 条故事/历史与同纪元的另一条用了同一个序号。`,
        steps: ['打开编年史，找同一纪元里并排的两行。', '改掉其中一条的序号（order）。', '同一序号只剩一行，撞号就消失。'],
        action: '去编年 →',
      },
      unresolved: {
        title: '把失踪的名字接回来',
        line: (n: number) => `有 ${n} 条人物关系指向一个不在名册上的名字。`,
        steps: ['打开人物星图，看「未上图」的清单。', '要么创建那个人物，要么把指向改成真实存在的名字。', '名字接上后，它会成为星图上的一条线。'],
        action: '去星图 →',
      },
      isolated: {
        title: '给孤岛接一条线',
        line: (n: number) => `有 ${n} 个条目在万象脉络里没有任何关系，像一座孤岛。`,
        steps: ['打开万象脉络，找到「孤岛」清单。', '在 Studio 的世界面板里给它加一条关系。', '接上以后，它会进入枢纽榜与势力团的计算。'],
        action: '去万象脉络 →',
      },
      'cut-vertex': {
        title: '给关节留一条旁路',
        line: (n: number) => `有 ${n} 个条目是整张关系网的关节：它们一缺席，网就会裂开。`,
        steps: ['打开万象脉络，看「关节」面板。', '在两个原本只通过它相连的条目之间加一条直接关系。', '旁路出现后，它就不再是唯一的桥。'],
        action: '去万象脉络 →',
      },
      'empty-palette': {
        title: '给人物一支自己的颜色',
        line: (n: number) => `有 ${n} 位人物还没有自己的调色盘，星图上只能借世界的颜色。`,
        steps: ['打开 Studio 的人物面板。', '给这个人物填一个视觉标识色。', '回到星图，他的星心会用自己的颜色亮起来。'],
        action: '去 Studio →',
      },
    },
  },
  en: {
    kicker: 'COMMISSIONS',
    title: 'World commissions',
    lede: 'Three things worth doing, drawn from your world’s measured gaps each day — no invented tasks, no fake progress. Finish one and it really leaves the board.',
    footnote: 'Author-only · numbers from worlds / characters · today’s picks seeded by world id + date · zero provider · zero writes',
    dayLabel: (day: string) => `Commission day ${day}`,
    todayKicker: 'Today’s commissions',
    todayLede: 'These three are decided by the world id and the date together: the same day returns the same set, a new day rotates it.',
    todayEmpty: 'No commissions today — this world has no measurable gap right now.',
    restTitle: 'Also worth doing',
    restLede: 'Gaps that follow today’s three in the rotation. The counts are just as real.',
    restEmpty: 'Today’s three are the whole list — every other item is settled.',
    closedTitle: 'Settled',
    closedLede: 'These counters are at zero — not hidden, simply no gap left.',
    closedEmpty: 'Nothing has been truly settled yet.',
    notStartedTitle: 'Nothing to act on yet',
    notStartedLede: 'The people or relationships behind these do not exist yet, so they are not counted as done.',
    samplePrefix: 'e.g.',
    emptyTitle: 'This world has no lines yet',
    emptyCopy: (name: string) =>
      `「${name}」’s world document is empty, so the board has nothing to hand out. Write the first entry in Studio — the world panel, the canvas, or the codex all work.`,
    emptyLink: 'Open Studio and write the first entry →',
    emptyLoadTitle: 'The board can’t open — the world won’t load',
    emptyLoadCopy: (name: string) =>
      `「${name}」’s world document can’t be read right now, so no commissions are drawn here. Check the Studio world panel, confirm the world loads, then come back.`,
    emptyLoadLink: 'Back to the Studio world panel →',
    backGraph: '← Back to the world map',
    openIntegrity: 'World checkup →',
    openNetwork: 'World network →',
    quests: {
      skeleton: {
        title: 'Put words on a blank page',
        line: (n: number) => `${n} ${n === 1 ? 'entry holds' : 'entries hold'} a line in the register and nothing else — the body is still blank.`,
        steps: ['Open the codex and pick any blank page.', 'Write the first paragraph — one sentence counts.', 'Save and come back; this counter really drops.'],
        action: 'Open the codex →',
      },
      thin: {
        title: 'Thicken the short notes',
        line: (n: number) => `${n} authored ${n === 1 ? 'entry is' : 'entries are'} under ${THIN_BODY_LIMIT} characters, like a note that stopped mid-sentence.`,
        steps: ['Find it by title in the codex.', 'Add a place, a time, or one person’s reaction.', `Past ${THIN_BODY_LIMIT} characters it stops being thin.`],
        action: 'Open the codex →',
      },
      untagged: {
        title: 'Put entries back into time',
        line: (n: number) => `${n} story or history ${n === 1 ? 'entry hangs' : 'entries hang'} outside every era.`,
        steps: ['Open the chronicle and find the “Unmarked era” shelf.', 'Give the entry an era name — your world’s own word.', 'It returns to the right row.'],
        action: 'Open the chronicle →',
      },
      'order-clash': {
        title: 'Separate the colliding rows',
        line: (n: number) => `${n} story/history ${n === 1 ? 'entry shares' : 'entries share'} an order number with another entry in the same era.`,
        steps: ['Open the chronicle and find the two rows side by side.', 'Change one of the order numbers.', 'One row per number — the collision is gone.'],
        action: 'Open the chronicle →',
      },
      unresolved: {
        title: 'Bring the missing names back',
        line: (n: number) => `${n} relationship ${n === 1 ? 'points' : 'relationships point'} at a name that is not in the register.`,
        steps: ['Open the character graph and read the “not on the map” list.', 'Either create that character, or point at a name that exists.', 'Once it resolves, it becomes a line on the map.'],
        action: 'Open the character graph →',
      },
      isolated: {
        title: 'Run a line to the island',
        line: (n: number) => `${n} ${n === 1 ? 'entry has' : 'entries have'} no relationships at all in the network — an island.`,
        steps: ['Open the world network and find the “islands” list.', 'Add one relationship in the Studio world panel.', 'It then enters the hub and clique calculations.'],
        action: 'Open the world network →',
      },
      'cut-vertex': {
        title: 'Leave the joint a bypass',
        line: (n: number) => `${n} ${n === 1 ? 'entry is a' : 'entries are'} joint${n === 1 ? '' : 's'} of the whole network: remove one and the web splits.`,
        steps: ['Open the world network and read the “joints” panel.', 'Add a direct relationship between two entries that only connect through it.', 'With the bypass in place it is no longer the only bridge.'],
        action: 'Open the world network →',
      },
      'empty-palette': {
        title: 'Give the character a colour of their own',
        line: (n: number) => `${n} ${n === 1 ? 'character has' : 'characters have'} no palette, so the map can only lend them the world’s colour.`,
        steps: ['Open the character panel in Studio.', 'Give the character a visual identity colour.', 'Back on the map, their heart lights in their own colour.'],
        action: 'Open Studio →',
      },
    },
  },
};

export default async function QuestsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const [roster, world, project] = await Promise.all([
    listCharacters(projectId),
    loadWorld(projectId),
    loadDocument(projectId),
  ]);
  if (!project) notFound();

  const locale = await getLocale();
  const c = COPY[locale];

  if (!world || !world.ok) {
    return (
      <main className="wq-empty" data-quests-empty>
        <h1 className="wq-emptyTitle">{c.emptyLoadTitle}</h1>
        <p className="wq-emptyCopy">{c.emptyLoadCopy(project.name)}</p>
        <Link href={`/studio/${projectId}`} className="wq-emptyLink" data-quests-empty-studio>
          {c.emptyLoadLink}
        </Link>
      </main>
    );
  }

  const board = buildQuestBoard({
    projectId,
    document: world.document,
    characters: roster.items,
  });

  const renderQuest = (kind: WorldQuestKind, count: number, samples: { id: string; label: string }[]) => {
    const quest = c.quests[kind];
    return (
      <article key={kind} className="wq-card" data-quests-card={kind} aria-label={quest.title}>
        <h3 className="wq-cardTitle">{quest.title}</h3>
        <p className="wq-cardLine">{quest.line(count)}</p>
        <ol className="wq-steps">
          {quest.steps.map((step) => (
            <li key={step} className="wq-step">{step}</li>
          ))}
        </ol>
        {samples.length > 0 ? (
          <p className="wq-samples">
            <span className="wq-samplesLabel">{c.samplePrefix}</span>
            {samples.map((sample) => (
              <span key={sample.id} className="wq-sample" data-quests-sample>{sample.label}</span>
            ))}
          </p>
        ) : null}
        <Link className="wq-cardLink" href={TARGET[kind](projectId)} data-quests-go={kind}>{quest.action}</Link>
      </article>
    );
  };

  return (
    <main className="wq-root" data-quests-root>
      <header className="wq-hero">
        <p className="wq-kicker" data-quests-kicker>{c.kicker} · {project.name}</p>
        <h1 className="wq-title">{c.title}</h1>
        <p className="wq-lede" data-quests-lede>{c.lede}</p>
        <p className="wq-footnote" data-quests-footnote>{c.footnote}</p>
        <p className="wq-day" data-quests-day>{c.dayLabel(board.day)}</p>
      </header>

      {board.emptyWorld ? (
        <section className="wq-emptyWorld" data-quests-empty-world>
          <h2 className="wq-sectionTitle">{c.emptyTitle}</h2>
          <p className="wq-emptyCopy">{c.emptyCopy(project.name)}</p>
          <Link href={`/studio/${projectId}`} className="wq-cardLink" data-quests-empty-world-studio>
            {c.emptyLink}
          </Link>
        </section>
      ) : (
        <>
          <section className="wq-today" data-quests-today aria-label={c.todayKicker}>
            <div className="wq-sectionHead">
              <h2 className="wq-sectionTitle">{c.todayKicker}</h2>
              <p className="wq-sectionLede">{c.todayLede}</p>
            </div>
            {board.focus.length === 0 ? (
              <p className="wq-sectionEmpty" data-quests-today-empty>{c.todayEmpty}</p>
            ) : (
              <div className="wq-grid">
                {board.focus.map((entry) => renderQuest(entry.kind, entry.count, entry.samples))}
              </div>
            )}
          </section>

          <section className="wq-rest" data-quests-rest aria-label={c.restTitle}>
            <div className="wq-sectionHead">
              <h2 className="wq-sectionTitle">{c.restTitle}</h2>
              <p className="wq-sectionLede">{c.restLede}</p>
            </div>
            {board.rest.length === 0 ? (
              <p className="wq-sectionEmpty" data-quests-rest-empty>{c.restEmpty}</p>
            ) : (
              <ul className="wq-rows">
                {board.rest.map((entry) => {
                  const quest = c.quests[entry.kind];
                  return (
                    <li key={entry.kind} className="wq-row" data-quests-row={entry.kind}>
                      <span className="wq-rowCount">{entry.count}</span>
                      <span className="wq-rowTitle">{quest.title}</span>
                      <span className="wq-rowLine">{quest.line(entry.count)}</span>
                      <Link className="wq-rowLink" href={TARGET[entry.kind](projectId)} data-quests-row-go={entry.kind}>
                        {quest.action}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="wq-closed" data-quests-closed aria-label={c.closedTitle}>
            <div className="wq-sectionHead">
              <h2 className="wq-sectionTitle">{c.closedTitle}</h2>
              <p className="wq-sectionLede">{c.closedLede}</p>
            </div>
            {board.closed.length === 0 ? (
              <p className="wq-sectionEmpty" data-quests-closed-empty>{c.closedEmpty}</p>
            ) : (
              <p className="wq-closedList">
                {board.closed.map((entry) => (
                  <span key={entry.kind} className="wq-closedItem" data-quests-closed-item={entry.kind}>
                    {c.quests[entry.kind].title}
                  </span>
                ))}
              </p>
            )}
          </section>

          {board.notStarted.length > 0 ? (
            <section className="wq-notstarted" data-quests-not-started aria-label={c.notStartedTitle}>
              <div className="wq-sectionHead">
                <h2 className="wq-sectionTitle">{c.notStartedTitle}</h2>
                <p className="wq-sectionLede">{c.notStartedLede}</p>
              </div>
              <p className="wq-closedList">
                {board.notStarted.map((entry) => (
                  <span key={entry.kind} className="wq-notStartedItem" data-quests-notstarted-item={entry.kind}>
                    {c.quests[entry.kind].title}
                  </span>
                ))}
              </p>
            </section>
          ) : null}
        </>
      )}

      <footer className="wq-foot" data-quests-foot>
        <Link className="am-linkImplicit" href={`/world/${projectId}`} data-quests-back-graph>{c.backGraph}</Link>
        <Link className="wq-footLink" href={`/world/${projectId}/integrity`} data-quests-open-integrity>{c.openIntegrity}</Link>
        <Link className="wq-footLink" href={`/world/${projectId}/network`} data-quests-open-network>{c.openNetwork}</Link>
      </footer>
    </main>
  );
}
