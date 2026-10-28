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
export function StoryPlay({ plan, onComplete }: { plan: StoryPlan; onComplete?: () => void }) {
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
      <div className="rounded-lg border border-[var(--nexus-color-border-subtle)] p-4" data-story="blocked">
        <h2 className="text-13 font-semibold">这一段开不了场</h2>
        <ul className="mt-2 flex flex-col gap-1">
          {plan.blockers.map((blocker) => (
            <li key={blocker} className="text-12 text-danger-ink" data-story-blocker>
              {blocker}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-story-play>
      <div className="flex flex-wrap items-center gap-2 text-11 text-fg-3">
        <span data-story-progress>
          走过 {state.trail.length} 段 · 共 {plan.beats.length} 段可读
        </span>
        <button type="button" onClick={restart} className="px-2 py-0.5 text-11 underline" data-story-restart>
          从头开始
        </button>
      </div>

      <article className="rounded-lg border border-[var(--nexus-color-border-subtle)] p-4" data-story-beat={beat?.id ?? 'none'}>
        <h2 className="text-[var(--nexus-font-size-21)] font-semibold" data-story-name>
          {beat?.name ?? '没有起点'}
        </h2>
        {repeats > 1 ? (
          <p className="text-11 text-[var(--nexus-color-warn)]" data-story-repeat>
            这是第 {repeats} 次走到这一段：对话之间有环，模型里没有防回头的约束。
          </p>
        ) : null}
        {beat?.textEmpty ? (
          <p className="mt-2 text-12 text-fg-3" data-story-text-empty>
            作者没给这一段写正文（对话实体的「设计说明」是空的）。这里不替你补一句。
          </p>
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-13 leading-6" data-story-text>
            {beat?.text}
          </p>
        )}

        {beat && beat.choices.length ? (
          <div className="mt-3 flex flex-col gap-1.5" data-story-choices>
            {beat.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => go(choice.id)}
                className="rounded border border-[var(--nexus-color-border-subtle)] px-3 py-1.5 text-left text-12 hover:border-[var(--nexus-color-border-strong)]"
                data-story-choice={choice.to}
              >
                {choice.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-12 text-fg-3" data-story-ending>
            这一段没有指向别的对话，走到这里就停了——没有"结局画面"这种东西，只是没有下一段。
          </p>
        )}
      </article>

      <div className="text-11 text-fg-3" data-story-trail>
        {state.trail.map((id, index) => `${index + 1}. ${byId.get(id)?.name ?? '（读不到名字）'}`).join(' → ')}
      </div>

      {/* §53 对话管线的"自动跑一遍"：查可达性，不是跑走法——按钮的话与报告的限度一起显示 */}
      <section className="rounded border border-[var(--nexus-color-border-subtle)] p-3">
        <div className="flex items-center gap-3">
          <h3 className="text-12 font-semibold text-fg-1">自动查一遍（Playtest）</h3>
          <button
            type="button"
            onClick={() => setReport(playtestStory(plan))}
            className="rounded bg-bg-2 px-2 py-1 text-11"
            data-playtest-run
          >
            查可达性
          </button>
        </div>
        {report ? (
          <>
            <p className="mt-2 text-11 text-fg-3" data-playtest-story-stats>
              可达 {report.reachable}/{report.total} · 停点 {report.reachableEndings} · 空正文 {report.reachableEmptyText}
              {report.unreachableNames.length ? ` · 走不到：${report.unreachableNames.slice(0, 5).join('、')}` : ''}
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {report.findings.map((line) => (
                <li key={line} className="text-11 text-fg-2" data-playtest-finding>
                  · {line}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-11 text-fg-3" data-playtest-limits>
              {report.limits.join(' ')}
            </p>
          </>
        ) : (
          <p className="mt-1 text-11 text-fg-3">
            还没查。这一步按引用连线算「连不连得到」，不需要人点，也不需要模型或 provider。
          </p>
        )}
      </section>

      <details className="text-11 text-fg-3" data-story-notes>
        <summary className="cursor-pointer">这条管线如实说明的 {plan.notes.length} 件事</summary>
        <ul className="mt-1 flex flex-col gap-1 pl-4">
          {plan.notes.map((note) => (
            <li key={note} className="list-disc">
              {note}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
