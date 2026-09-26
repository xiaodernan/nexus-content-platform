'use client';

import { useMemo, useState } from 'react';
import type { StoryPlan } from '@nexus/game-model';

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
export function StoryPlay({ plan }: { plan: StoryPlan }) {
  const byId = useMemo(() => new Map(plan.beats.map((beat) => [beat.id, beat])), [plan]);
  const [currentId, setCurrentId] = useState<string | null>(plan.startId);
  /** 走过的顺序（含重复）：面包屑与"第 N 次走到这里"都从这份算 */
  const [path, setPath] = useState<string[]>(plan.startId ? [plan.startId] : []);

  const beat = currentId ? byId.get(currentId) ?? null : null;
  const repeats = beat ? path.filter((id) => id === beat.id).length : 0;

  const go = (to: string) => {
    setCurrentId(to);
    setPath((prev) => [...prev, to]);
  };
  const restart = () => {
    setCurrentId(plan.startId);
    setPath(plan.startId ? [plan.startId] : []);
  };

  if (!plan.playable) {
    return (
      <div className="rounded-lg border border-[var(--nexus-color-border-subtle)] p-4" data-story="blocked">
        <h2 className="text-13 font-semibold">这一段开不了场</h2>
        <ul className="mt-2 flex flex-col gap-1">
          {plan.blockers.map((blocker) => (
            <li key={blocker} className="text-12 text-danger" data-story-blocker>
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
          走过 {path.length} 段 · 共 {plan.beats.length} 段可读
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
                onClick={() => go(choice.to)}
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
        {path.map((id, index) => `${index + 1}. ${byId.get(id)?.name ?? '（读不到名字）'}`).join(' → ')}
      </div>

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
