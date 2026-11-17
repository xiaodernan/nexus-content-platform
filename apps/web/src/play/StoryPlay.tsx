'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  playtestStory,
  storyInitial,
  storyStep,
  type StoryPlan,
  type StoryPlaytestReport,
  type StoryState,
} from '@nexus/game-model';
import type { Locale } from '@/lib/i18n';

/** 双语：每行 UI 文案按 locale 选一份（不中英混排） */
const STORY_TXT = {
  zh: {
    blockedTitle: '这一段开不了场',
    progressSuffix: ' 段 · 共 ',
    progressTail: ' 段可读',
    progressHead: '走过 ',
    restart: '从头开始',
    noStart: '没有起点',
    repeatNote: '这是第 {n} 次走到这一段：对话之间有环，模型里没有防回头的约束。',
    emptyNote: '作者没给这一段写正文（对话实体的「设计说明」是空的）。这里不替你补一句。',
    ending: '这一段没有指向别的对话，走到这里就停了——没有"结局画面"这种东西，只是没有下一段。',
    unreadableName: '（读不到名字）',
    playtestTitle: '自动查一遍（Playtest）',
    playtestRun: '查可达性',
    reachableStatsHead: '可达 ',
    endings: '停点 ',
    emptyTexts: '空正文 ',
    unreachableHead: ' · 走不到：',
    notRunYet: '还没查。这一步按引用连线算「连不连得到」，不需要人点，也不需要模型或 provider。',
    notesTitle: '这条管线如实说明的 {n} 件事',
  },
  en: {
    blockedTitle: 'This segment cannot start',
    progressHead: 'Walked ',
    progressSuffix: ' segment(s) · of ',
    progressTail: ' readable',
    restart: 'Start over',
    noStart: 'No starting segment',
    repeatNote: 'This is your {n}th visit to this segment: the dialogues loop, and the model has no anti-backtracking constraint.',
    emptyNote: 'The author never wrote a body for this segment (the dialogue entity’s design note is empty). This view will not invent one for you.',
    ending: 'This segment points at no other dialogue, so the conversation simply stops here — there is no "ending screen", there is just no next segment.',
    unreadableName: '(name unreadable)',
    playtestTitle: 'Auto-check (Playtest)',
    playtestRun: 'Check reachability',
    reachableStatsHead: 'Reachable ',
    endings: 'Landings ',
    emptyTexts: 'Empty bodies ',
    unreachableHead: ' · Unreachable: ',
    notRunYet: 'Not checked yet. This step counts "can the choices reach it" along the reference links — no tapping, no model, no provider needed.',
    notesTitle: 'What this pipeline honestly notes ({n})',
  },
} as const satisfies Record<Locale, Record<string, string>>;

/**
 * §51 的 Interactive Story / Visual Novel 走的那条投影：`compileStory` 排出来的段落与选择，
 * 这里只负责"点一句跳到下一句"。
 *
 * 三条边界都同时写在界面上，不只写在注释里（§159）：
 * - **正文一个字都不生成**。作者没写设计说明的那一段，这里就照实说"作者没写正文"，
 *   不给一句场面话——给一句听起来就像这条管线会写小说。
 * - **选项只有模型里有的那些**：一条对话指向别的对话才是选项，没有"回主线""存档"这种
 *   §54 里不存在的东西。
 * - **环不藏**：走过第二次的段落会标出来。§54 没有防环字段，播放器替作者发明一条
 *   不许回头的规矩，就等于改了这份设计。
 */
export function StoryPlay({ plan, onComplete, locale = 'zh' }: { plan: StoryPlan; onComplete?: () => void; locale?: Locale }) {
  const T = STORY_TXT[locale];
  const byId = useMemo(() => new Map(plan.beats.map((beat) => [beat.id, beat])), [plan]);
  // 播放语义在模型层（`storyInitial` / `storyStep`）：产物里那段 `NexusStory` 是同一组函数的转写，
  // 不是另一套规则。这里只留 React 的那一份状态容器（§16：唯一真值不在组件里）。
  const [state, setState] = useState<StoryState>(() => storyInitial(plan));
  // §53：对话管线没有"走法"，能确定回答的是"点不点得到"——按引用连线算可达性（报告见下）
  const [report, setReport] = useState<StoryPlaytestReport | null>(null);

  const beat = state.beatId ? byId.get(state.beatId) ?? null : null;
  const repeats = beat ? state.visited[beat.id] ?? 0 : 0;

  // §168：走到一个结局就算"通关"（对话管线的通关就是玩到了一个结局），
  // 而且**只报一次**：同一个访客在一个版本上只记一次，重头再走一遍不重复报。
  const completed = useRef(false);
  useEffect(() => {
    if (!onComplete || completed.current) return;
    if (!beat?.ending) return;
    completed.current = true;
    onComplete();
  }, [beat?.ending, beat?.id, onComplete]);

  const go = (choiceId: string) => {
    setState((prev) => storyStep(plan, prev, choiceId));
  };
  const restart = () => {
    setState(storyInitial(plan));
  };

  if (!plan.playable) {
    return (
      <div className="st-card" data-story="blocked">
        <h2 className="pk-h2">{T.blockedTitle}</h2>
        <ul className="g2-mt2col">
          {plan.blockers.map((blocker) => (
            <li key={blocker} className="pp-danger12" data-story-blocker>
              {blocker}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="g2-col3" data-story-play>
      <div className="st-hudRow">
        <span data-story-progress>
          {T.progressHead}
          {state.trail.length}
          {T.progressSuffix}
          {plan.beats.length}
          {T.progressTail}
        </span>
        <button type="button" onClick={restart} className="st-restartBtn" data-story-restart>
          {T.restart}
        </button>
      </div>

      <article className="st-card" data-story-beat={beat?.id ?? 'none'}>
        <h2 className="st-title" data-story-name>
          {beat?.name ?? T.noStart}
        </h2>
        {repeats > 1 ? (
          <p className="st-warnNote" data-story-repeat>
            {T.repeatNote.replace('{n}', String(repeats))}
          </p>
        ) : null}
        {beat?.textEmpty ? (
          <p className="st-emptyNote" data-story-text-empty>
            {T.emptyNote}
          </p>
        ) : (
          <p className="st-body" data-story-text>
            {beat?.text}
          </p>
        )}

        {beat && beat.choices.length ? (
          <div className="st-choices" data-story-choices>
            {beat.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => go(choice.id)}
                className="st-choiceBtn"
                data-story-choice={choice.to}
              >
                {choice.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="st-endingNote" data-story-ending>
            {T.ending}
          </p>
        )}
      </article>

      <div className="g2-note" data-story-trail>
        {state.trail.map((id, index) => `${index + 1}. ${byId.get(id)?.name ?? T.unreadableName}`).join(' → ')}
      </div>

      {/* §53 对话管线的"自动跑一遍"：查可达性，不是跑走法——按钮的话与报告的限度一起显示 */}
      <section className="g2-well">
        <div className="g2-wellRow">
          <h3 className="g2-h3">{T.playtestTitle}</h3>
          <button
            type="button"
            onClick={() => setReport(playtestStory(plan, locale))}
            className="g2-smallBtn"
            data-playtest-run
          >
            {T.playtestRun}
          </button>
        </div>
        {report ? (
          <>
            <p className="g2-mt2Note" data-playtest-story-stats>
              {T.reachableStatsHead}
              {report.reachable}/{report.total} · {T.endings}
              {report.reachableEndings} · {T.emptyTexts}
              {report.reachableEmptyText}
              {report.unreachableNames.length
                ? `${T.unreachableHead}${report.unreachableNames.slice(0, 5).join(locale === 'en' ? ', ' : '、')}`
                : ''}
            </p>
            <ul className="g2-mt2col">
              {report.findings.map((line) => (
                <li key={line} className="g2-hint2" data-playtest-finding>
                  · {line}
                </li>
              ))}
            </ul>
            <p className="g2-mt2Note" data-playtest-limits>
              {report.limits.join(' ')}
            </p>
          </>
        ) : (
          <p className="g2-mt1Note">{T.notRunYet}</p>
        )}
      </section>

      <details className="g2-note" data-story-notes>
        <summary className="st-summary">{T.notesTitle.replace('{n}', String(plan.notes.length))}</summary>
        <ul className="st-notesList">
          {plan.notes.map((note) => (
            <li key={note} className="st-bullet">
              {note}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
