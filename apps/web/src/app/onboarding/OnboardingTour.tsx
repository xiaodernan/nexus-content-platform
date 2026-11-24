'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Locale } from '@/lib/i18n';

type StepKey = 'think' | 'create' | 'studio' | 'save' | 'publish' | 'discover' | 'tide';

const STEPS: Record<Locale, { key: StepKey; title: string; body: string[]; cta: string; href: string }[]> = {
  zh: [
    {
      key: 'think',
      title: '① 先想清楚一句话',
      body: ['想一个自己也想打开的网站、游戏或页面。越具体越好，例如「夏茶老师的 plum tea 一页店铺」。', '这一步不用写代码，也不用先读文档。'],
      cta: '用好这一句，去首页',
      href: '/',
    },
    {
      key: 'create',
      title: '② 建一个项目',
      body: ['在首页「项目」区域填一个名字、选择类型，点「创建」。', '创建后会进入这个项目自己的 Studio；如果还没有项目，先在这里建一个。'],
      cta: '去首页创建',
      href: '/',
    },
    {
      key: 'studio',
      title: '③ 在 Studio 里画画布',
      body: ['从左栏把组件拖上画布；选中元素后，在右侧属性面板改标题、字号或颜色。', '不会怎么弄？点顶栏「帮助」打开内置说明书；F1 只能在说明书已经打开时关闭它。'],
      cta: '从首页打开一个项目',
      href: '/',
    },
    {
      key: 'save',
      title: '④ 保存这次修改',
      body: ['改完画布按 Ctrl/⌘+S，保存当前设计；顶栏的「有未保存改动」消失后，这次保存才算完成。', '保存不等于创建命名快照。要留一个可回溯的版本，请在历史面板里创建快照。'],
      cta: '回 Studio 按 Ctrl/⌘+S',
      href: '/',
    },
    {
      key: 'publish',
      title: '⑤ 发布出去',
      body: ['在顶栏打开发布面板，选择「公开」「仅链接」或「私有」，再点「发布」。', '通过门禁后，公开作品会进入 /discover；选择「取消发布」可以马上收回公开链接。'],
      cta: '去 /discover 看看',
      href: '/discover',
    },
    {
      key: 'discover',
      title: '⑥ 找到自己的第一枚作品',
      body: ['在 /discover 点「按关键词搜全平台」，或用公开主页 /u/<handle> 找回自己的作品。', '这里没有「我发布的」筛选；找不到时先确认作品已经公开，而且没有被人工拒绝。'],
      cta: '去 /ship 看交付记录',
      href: '/ship',
    },
    {
      key: 'tide',
      title: '⑦ 可选：配好真实 provider 后再走潮汐',
      body: ['/tidewatch 只有在已配置且可用的真实 provider 下才会请求大模型、检索典籍锚句并核验引用；当前 API 关闭时页面明确显示不可用，不把本地内容冒充模型生成。', '世界状态保存在本机 localStorage；口令 123 只负责解锁入口，不是模型能力。'],
      cta: '查看 /tidewatch（需真实 provider）',
      href: '/tidewatch',
    },
  ],
  en: [
    {
      key: 'think',
      title: '1 · One sentence, thought through',
      body: ['Pick a website, game or page you would actually open yourself — e.g. “Aunt Lin’s plum-tea single-page shop”.', 'No code and no documentation required for this step.'],
      cta: 'Use that sentence on the home page',
      href: '/',
    },
    {
      key: 'create',
      title: '2 · Create the project',
      body: ['On the home page, name the project, choose its type and press “Create”.', 'That opens the project’s own Studio. If you have no project yet, create one here first.'],
      cta: 'Go home and create',
      href: '/',
    },
    {
      key: 'studio',
      title: '3 · Draw the canvas in Studio',
      body: ['Drag a component from the left rail onto the canvas; select it and edit its title, type or color in the right inspector.', 'Need help? Open the in-app manual from “Help” in the top bar. F1 closes that manual only after it is already open.'],
      cta: 'Open a project from the home page',
      href: '/',
    },
    {
      key: 'save',
      title: '4 · Save this edit',
      body: ['Press Ctrl/⌘+S to save the current design. The top bar’s “unsaved changes” notice clears only after the save succeeds.', 'Saving is not the same as creating a named snapshot. Use the history panel when you need a restorable version.'],
      cta: 'Ctrl/⌘+S inside Studio',
      href: '/',
    },
    {
      key: 'publish',
      title: '5 · Publish it',
      body: ['Open Publish in the top bar, choose Public, Unlisted or Private, then press “Publish”.', 'Once the gates pass, public work appears on /discover. “Unpublish” revokes the public link immediately.'],
      cta: 'Open /discover',
      href: '/discover',
    },
    {
      key: 'discover',
      title: '6 · Find your first work again',
      body: ['Use “Search by keyword across the platform” on /discover, or open your public profile at /u/<handle>.', 'There is no “published by me” filter here. If nothing appears, check that the work is public and has not been rejected by moderation.'],
      cta: 'See the ship log at /ship',
      href: '/ship',
    },
    {
      key: 'tide',
      title: '7 · Optional: Tidewatch needs a real provider',
      body: ['Only with a configured, available real provider does /tidewatch request a model, retrieve canon anchors and verify quotations. While the API is closed, the page explicitly says unavailable instead of presenting local content as model output.', 'World state stays in this browser’s localStorage. Passphrase 123 unlocks the route; it does not supply model capability.'],
      cta: 'View /tidewatch (real provider required)',
      href: '/tidewatch',
    },
  ],
};

const STORAGE_KEY = 'nexus-onboarding-done';

function parseDone(raw: string): Record<string, boolean> {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const keys = new Set<string>(STEPS.zh.map((step) => step.key));
  return Object.fromEntries(
    Object.entries(parsed).filter(([key, value]) => keys.has(key) && typeof value === 'boolean'),
  ) as Record<string, boolean>;
}

export function OnboardingTour({ locale = 'zh' }: { locale?: Locale }) {
  const steps = STEPS[locale];
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setDone(parseDone(raw));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  }, []);

  const toggleDone = (key: string) => {
    const next = { ...done, [key]: !done[key] };
    setDone(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  };

  const reset = () => {
    setDone({});
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  };

  const completedCount = useMemo(() => steps.filter((step) => done[step.key]).length, [done, steps]);
  const ratio = completedCount / steps.length;
  const progressLabel = locale === 'zh' ? '本地自检进度' : 'Local self-check progress';
  const doneLabel = locale === 'zh' ? '标记已完成' : 'Mark done';

  return (
    <section className="obv-tour" aria-label={locale === 'zh' ? '上手漫游' : 'Onboarding tour'} data-onboarding-tour>
      <div className="obv-progressRow" aria-label={progressLabel}>
        <div className="obv-progressBar" data-onboarding-progress-bar><span className="obv-progressFill" style={{ width: `${Math.round(ratio * 100)}%` }} /></div>
        <span className="obv-progressText" data-onboarding-progress-text>{completedCount} / {steps.length}</span>
      </div>
      {!storageAvailable ? (
        <p className="obv-storageNote" data-onboarding-storage-unavailable>
          {locale === 'zh'
            ? '本机存储不可用：勾选只在本次页面会话中保留，不会假装已持久化。'
            : 'Local storage is unavailable: checkmarks last only for this page session and are not presented as persisted.'}
        </p>
      ) : null}
      <ol className="obv-stepList" data-onboarding-steps>
        {steps.map((step) => {
          const isDone = Boolean(done[step.key]);
          return (
            <li key={step.key} className={`obv-stepCard${isDone ? ' obv-stepDone' : ''}`} data-onboarding-step={step.key}>
              <div className="obv-stepHead">
                <span className="obv-stepTick" aria-hidden="true">{isDone ? '✓' : '○'}</span>
                <h2 className="obv-stepTitle">{step.title}</h2>
              </div>
              {step.body.map((line, index) => <p key={index} className="obv-stepBody">{line}</p>)}
              <div className="obv-stepActions">
                <a className="obv-stepCta" href={step.href} data-onboarding-cta>
                  {step.cta} →
                </a>
                <button
                  type="button"
                  className="obv-stepToggle"
                  onClick={() => toggleDone(step.key)}
                  data-onboarding-done
                  aria-label={`${doneLabel}: ${step.title}`}
                  aria-pressed={isDone}
                  title={progressLabel}
                >
                  {isDone ? (locale === 'zh' ? '已标记 ✓' : 'Marked ✓') : doneLabel}
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
