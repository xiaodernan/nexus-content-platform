'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Locale } from '@/lib/i18n';

/**
 * §OV-1 上手漫游「6 步走完从一句话到一个作品」——客户端状态机：
 * - 步内不走网络、不打分、不计数（§159）；只做「你说你做完了」的记录；
 * - 进度存 localStorage（站看无痕 / 换浏览器 = 重走，这是诚实的新局，不是「丢进度」）；
 * - 每步「开始这一步 →」指向的是**真页面**；open 但不保证你的账号能做完所有步——出门看现网，好坏如实。
 */

type StepKey = 'think' | 'create' | 'studio' | 'snap' | 'publish' | 'discover';

const STEPS: Record<Locale, { key: StepKey; title: string; body: string[]; cta: string; href: string }[]> = {
  zh: [
    {
      key: 'think',
      title: '① 先想清楚一句话',
      body: ['想一个自己也想打开的网站/游戏/页面。越具体越好，例如「夏茶老师的 plum tea 一页店铺」。', '这一步不用写代码、不用看文档。'],
      cta: '用好这一句，开始',
      href: '/',
    },
    {
      key: 'create',
      title: '② 建一个项目',
      body: ['回到首页，「项目」区域填一个名字、类型选「网站」，点「创建」。', '创建完就落到这个项目自己的 Studio 里——没有第二步扭回来。'],
      cta: '去首页创建',
      href: '/',
    },
    {
      key: 'studio',
      title: '③ 在 Studio 里画画布',
      body: ['左栏把组件拖上画布；画布上点一下选中元素，右侧属性面板改标题字号/颜色；顶栏「网格」按钮切换吸附辅助。', '不会怎么弄？顶栏「帮助」按钮（或按 F1）整册说明书就在眼前。'],
      cta: '打开 Studio（任意项目）',
      href: '/',
    },
    {
      key: 'snap',
      title: '④ 存一个快照',
      body: ['改完画布按 Ctrl/⌘+S——这会落一个快照（不一定是「版本史」，但有历史位置、可回溯）。', '顶栏中间会显示「有未保存改动」——看见它消失，就放心了。'],
      cta: '回 Studio 按 Ctrl/⌘+S',
      href: '/',
    },
    {
      key: 'publish',
      title: '⑤ 发布出去',
      body: ['顶栏右上「发布」：填好标题/可见性，点发布；你的项目就在 /discover 里「公开在跑的作品」区出现。', '取消发布随时可以，再点「撤回」就回到私密。'],
      cta: '打开 /discover 看看',
      href: '/discover',
    },
    {
      key: 'discover',
      title: '⑥ 找得到自己的第一枚作品',
      body: ['在 /discover 里用自己的名字搜一遍，或者在「我发布的」筛选方向找回你的项目。', '下一步就是发布第二个——然后你会发现，从这一步开始你其实已经在路上了。'],
      cta: '去 /ship 看交付记录',
      href: '/ship',
    },
  ],
  en: [
    {
      key: 'think',
      title: '1 · One sentence, thought through',
      body: ['Pick a page you would actually open yourself — e.g. "Aunt Lin’s plum-tea single-page shop".', 'No code, no docs, no exam.'],
      cta: 'Start with that sentence',
      href: '/',
    },
    {
      key: 'create',
      title: '2 · Create the project',
      body: ['Back on the home page: name it, choose “Website”, press “Create”.', 'That lands you inside the project’s own Studio — no detour.'],
      cta: 'Go home and create',
      href: '/',
    },
    {
      key: 'studio',
      title: '3 · Draw the canvas in Studio',
      body: ['Drag a component from the left rail onto the canvas; click the canvas and tweak type/color in the right inspector.', 'Don’t know what to do? Hit “Help” in the top bar (or F1) for the in-product manual.'],
      cta: 'Open Studio (any project)',
      href: '/',
    },
    {
      key: 'snap',
      title: '4 · Take a snapshot',
      body: ['After edits: Ctrl/⌘+S — that persists a snapshot. The top bar will stop showing “unsaved changes” once it lands.', 'Reopen it later from the history panel.'],
      cta: 'Ctrl/⌘+S inside Studio',
      href: '/',
    },
    {
      key: 'publish',
      title: '5 · Publish it',
      body: ['Top bar → “Publish”: give it a title and visibility, then publish. Your work now floats into the public feed on /discover.', 'Rollback anytime: “Unpublish” sets it back to private.'],
      cta: 'Open /discover',
      href: '/discover',
    },
    {
      key: 'discover',
      title: '6 · Find your first work again',
      body: ['Search your handle on /discover or filter “published by me” to find the run.', 'Onward from here — your second publish is on the rails.'],
      cta: 'See the ship log at /ship',
      href: '/ship',
    },
  ],
};

const STORAGE_KEY = 'nexus-onboarding-done';

export function OnboardingTour({ locale = 'zh' }: { locale?: Locale }) {
  const steps = STEPS[locale];
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [opened, setOpened] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setDone(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      // 隐私模式 / 无存储 —— 当前会话内继续，不假装记忆过
    }
  }, []);

  const toggleDone = (key: string) => {
    setDone((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 静默会话内记忆——§159 不假装已持久化到别处
      }
      return next;
    });
  };

  const reset = () => {
    setDone({});
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  };

  const completedCount = useMemo(() => steps.filter((s) => done[s.key]).length, [done, steps]);
  const ratio = completedCount / steps.length;

  return (
    <section className="obv-tour" aria-label={locale === 'zh' ? '上手漫游' : 'Onboarding tour'} data-onboarding-tour>
      <div className="obv-progressRow">
        <div className="obv-progressBar" data-onboarding-progress-bar><span className="obv-progressFill" style={{ width: `${Math.round(ratio * 100)}%` }} /></div>
        <span className="obv-progressText" data-onboarding-progress-text>{completedCount} / {steps.length}</span>
      </div>
      <ol className="obv-stepList" data-onboarding-steps>
        {steps.map((step) => {
          const isDone = Boolean(done[step.key]);
          return (
            <li key={step.key} className={`obv-stepCard${isDone ? ' obv-stepDone' : ''}`} data-onboarding-step={step.key}>
              <div className="obv-stepHead">
                <span className="obv-stepTick" aria-hidden="true">{isDone ? '✓' : '○'}</span>
                <h2 className="obv-stepTitle">{step.title}</h2>
              </div>
              {step.body.map((line, i) => <p key={i} className="obv-stepBody">{line}</p>)}
              <div className="obv-stepActions">
                <a className="obv-stepCta" href={step.href} data-onboarding-cta onClick={() => setOpened((p) => ({ ...p, [step.key]: true }))}>
                  {step.cta} →
                </a>
                <button type="button" className="obv-stepToggle" onClick={() => toggleDone(step.key)} data-onboarding-done aria-pressed={isDone}>
                  {isDone ? (locale === 'zh' ? '我做完了 ✓' : 'Done ✓') : (locale === 'zh' ? '我做完了' : 'Done')}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <button type="button" className="obv-reset" onClick={reset} data-onboarding-reset>
        {locale === 'zh' ? '重来（清除本地进度）' : 'Start over'}
      </button>
    </section>
  );
}
