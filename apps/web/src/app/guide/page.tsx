import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '使用指南 · User Guide — NEXUS',
  description: 'NEXUS 平台的中文·English 双语说明书：5 分钟上手、功能地图、游戏玩法、常见问答。',
};

/**
 * 用户指南 / User Guide —— 这一宇宙用户打开后第一个应该看的页。
 * 全面真实：路线都是仓库里真的存在的页面；游戏规则与我在 Studio/game2d 里读懂的一致；
 * 不做任何虚假"功能清单"。
 */

const COPY: Record<Locale, { kicker: string; title: string; lede: string; sections: { heading: string; body: string[] }[] }> = {
  zh: {
    kicker: '用户指南',
    title: '三分钟看懂 NEXUS · 十五分钟玩起来',
    lede: '这不是一份帮助文档，是一册工具说明书——告诉你这里的每一项能力是什么、怎么用。中英都可，随你喜欢。',
    sections: [
      {
        heading: '① 这个平台是什么？',
        body: [
          'NEXUS 是一个 AI Universe Studio——把你说出口的想法装配成设计模型，再变成真的可以打开的网站、游戏、视频与世界。',
          '创建一个项目 → 在 Project 里画设计稿 → 用 AI 辅助改成你想要的样子 → 导出 / 发布 / 玩里面的游戏。',
          '它不是"AI 写代码的玩具"：所有 AI 的改动都走可撤销的 Command 栈；所有素材都是你项目自己的素材；DEMO MODE 常驻提醒——未接真 provider 之前不假装已经能做。',
        ],
      },
      {
        heading: '② 5 分钟快速上手',
        body: [
          '注册 → 点"新建项目"→ 给项目起个名字 → 自动到 Studio（左栏面板 + 中央画布 + 右面板）。',
          '在 Studio 顶栏右侧点 "+" 新建一个页；从左侧选组件放上画布；在右栏改属性。',
          '对着 AI 说一句话：例如 "把标题改成 72px"。⌘K 可以打开命令面板直接跳转任意路径；Ctrl+K 也行（Mac 用 ⌘K）。',
          '改完后 Ctrl+S 保存（或顶栏的"保存"按钮）；今日最好用的键盘：Ctrl+Z / Ctrl+Shift+Z / 方向键微移 / Shift+方向键按 8px 网格移动。',
          '点顶栏"发布"把项目放进广场——别人才能看见。',
        ],
      },
      {
        heading: '③ 功能地图（点进去就是那个页面）',
        body: [
          '/discover 广场（热门/最新/ trending / 我关注的）· /marketplace 组件/模板/资产市场 · /blocks 积木库 · /search 全站搜索',
          '/studio/<project> 项目主场：画布/图层/设计系统/3D · /world/<id> 走进这个世界（3D 步行）· /world/<id>/digest 世界速览 · /world/<id>/constellation 人物关系星图 · /world/<id>/codex 设定集（纸面投影）· /world/<id>/chronicle 编年 · /world/<id>/ephemeris 世界切片',
          '/credits 我的额度 · /tasks 任务账本 · /api-tokens API 令牌 · /analytics 我作品的数据 · /notifications 收件箱 · /ship 交付日志 · /about-nexus 关于',
          '/admin/* 平台管理台（role=admin）：审核台、pricing、dead-letter、ai-cache、audit、observability、users、pricing、rate-limit 等',
        ],
      },
      {
        heading: '④ 游戏怎么玩',
        body: [
          '棋盘游戏（/game/<id>）：WASD 或方向键移动；空格键攻击；收集钻石（道具），避开方形（敌人）。',
          '完成探索后进入的下一关由游戏设计系统（@nexus/game-model）决定——你上一关走到的坐标会影响这一关敌人的初始位置。',
          'RPG 冒险（/game/<id>?view=rpg）：WASD/方向键走路，靠近 NPC 按空格/Enter 开始对话；对话选项用上下箭头选中、空格确认；对话完的决定会写进你的世界档案。',
          '每局游戏都有"检查点"可以回退到上一步；失败了也不丢进度。',
          '这些游戏是用你项目里的设计系统/角色生成的——不是玩家看到成品，是项目自己长出来的玩法。',
        ],
      },
      {
        heading: '⑤ 额度 & DEMO MODE 是什么？',
        body: [
          '每个免费账户每月有 AI 额度。真用 DeepSeek/GPT-6-sol 这样的真 provider 会扣真额度；没配真 provider 时会显示 DEMO MODE 标识——系统仍然能走通流程，只是出的东西是确定性模拟出来的"看起来像 AI 做的东西"，不是真模型的作品。',
          '/credits 页面可以实时看消费账单：每次 AI 调用都记 token in/out/model/latency/cost——任何一笔都是真的数字，不是演出来的。',
          '看到"缓存命中率"这个词：它反映 provider 端的 prefix cache 复用率——同一个前缀的下一次调用如果命中了，就免费少数 token；不命中也不证明你做错了，只证明分布器把你的请求放到了一个新分片。',
        ],
      },
      {
        heading: '⑥ 常见问答',
        body: [
          'Q：为什么我按了个按钮，整页空白了？A：这是 DEMO MODE 的特性——未配置 provider 时，生成路径不写真实代码；等到你配置了 wkapi.pro 并跑通真实调用，那些页就"亮"了。',
          'Q：缓存命中率低是我的问题吗？A：不是——你在看的是 provider 端的 KV 分布片分配；把同一 lane 打满 6–10 次大概率出现 1 次未命中；可以在 /admin/ai-cache（admin）看自己的使用账。',
          'Q：怎么让别人看到我的作品？A：顶栏发布→填标题→发布；发布后自动进广场/市场；发布前作品是私密的。',
          'Q：数据安全吗？A：所有 AI 改动都进审计账本、可撤销 Command；公开作品随时可撤回。',
        ],
      },
    ],
  },
  en: {
    kicker: 'User Guide',
    title: 'Three minutes to understand NEXUS · Fifteen to start playing',
    lede: 'This is not just a help page — it is the manual: what every capability is, how to use it. Switch language anytime with the top-right toggle.',
    sections: [
      {
        heading: '① What is this thing?',
        body: [
          'NEXUS is an AI Universe Studio — a place where your spoken intent becomes a design model, then real websites, games, videos and worlds that actually open.',
          'Create a project → lay out the design → let AI assist → export / publish / play the games inside.',
          'Not an "AI toy": every AI change goes through a revocable Command stack; every asset is yours; DEMO MODE is a standing badge — unconfigured providers are never faked as live.',
        ],
      },
      {
        heading: '② Five minutes to hands-on',
        body: [
          'Sign up → "New project" → name it → you land in Studio (left panel + canvas + right panel).',
          'Create a page (top bar "+"), drop components from the left, tweak on the right.',
          'Say one sentence to the AI: e.g. "make the title 72px". Press Cmd/Ctrl+K to jump anywhere via the command palette.',
          'Ctrl/Cmd+S to save (or the Save button top-right). The keys to learn: Ctrl+Z / Ctrl+Shift+Z / arrows to nudge / Shift+arrows to snap 8px.',
          'Publish from the top bar — then others can see it.',
        ],
      },
      {
        heading: '③ Feature map (click a path, land on the page)',
        body: [
          '/discover feed · /marketplace components/templates/assets · /blocks library · /search global search',
          '/studio/<project> studio · /world/<id> walk this world (3D) · /world/<id>/digest world digest · /world/<id>/constellation character graph · /world/<id>/codex paper tome · /world/<id>/chronicle timeline · /world/<id>/ephemeris 360-day page',
          '/credits your quota · /tasks task ledger · /api-tokens API tokens · /analytics your stats · /notifications inbox · /ship ship log · /about-nexus about',
          '/admin/* admin console (role=admin): moderation, pricing, dead-letters, ai-cache, audit, observability, users, rate-limit, etc.',
        ],
      },
      {
        heading: '④ How games work here',
        body: [
          'Board game (/game/<id>): WASD or arrows to move; Space to attack; collect diamonds; avoid squares.',
          'Next stage difficulty is decided by @nexus/game-model — your previous coordinates influence the next enemy placements.',
          'RPG adventure (/game/<id>?view=rpg): WASD/arrows to walk; Space/Enter near an NPC to talk; pick options with arrows + Space; choices write into the world file.',
          'Each play has checkpoints you can revert to; no run loses your progress.',
          'These games are generated from your project’s own design system/cast — not a finished product; your project grows its own play.',
        ],
      },
      {
        heading: '⑤ Quota & what DEMO MODE means',
        body: [
          'Every free account has an AI quota. Real providers consume real quota; without one you see the DEMO MODE badge — the flow still completes, but the output is deterministic simulation, not a real model’s work.',
          '/credits shows the live ledger: every AI call records tokens in/out, model, latency, cost. All real numbers.',
          'About "cache-hit rate": it measures the provider’s prefix-KV hit rate. Same prefix sequence hitting twice means fewer tokens consumed; a miss is not proof of error — the distributor may have placed your request on a cold shard.',
        ],
      },
      {
        heading: '⑥ Frequently asked questions',
        body: [
          'Q: why did the page go blank? A: DEMO MODE short-circuit — no provider configured, so generation can’t write real code. Configure wkapi.pro to make those pages "light up".',
          'Q: is low cache-hit-rate my fault? A: No — it’s the provider’s KV-shard lottery. Over 6–10 identical prefix lanes expect ~1 cold shard; admins can see their per-lane bills at /admin/ai-cache.',
          'Q: how do others see my work? A: top-bar Publish → fill title → publish; before publishing it stays private.',
          'Q: is my data safe? A: every AI edit is in the audit ledger, revocable Command; public works recallable anytime.',
        ],
      },
    ],
  },
};

export default async function GuidePage() {
  const locale = await getLocale();
  const copy = COPY[locale];
  return (
    <main className="gd-root" data-guide-root data-guide-locale={locale}>
      <header className="gd-hero">
        <p className="gd-kicker">{copy.kicker}</p>
        <h1 className="gd-title">{copy.title}</h1>
        <p className="gd-lede">{copy.lede}</p>
        <nav className="gd-toc" aria-label={locale === 'zh' ? '目录' : 'TOC'}>
          {copy.sections.map((section) => (
            <a key={section.heading} href={`#${section.heading.slice(2)}`} className="gd-tocLink">{section.heading}</a>
          ))}
        </nav>
      </header>
      {copy.sections.map((section) => (
        <section key={section.heading} id={section.heading.slice(2)} className="gd-section" aria-label={section.heading} data-guide-section={section.heading.slice(2)}>
          <h2 className="gd-sectionTitle">{section.heading}</h2>
          {section.body.map((para, i) => (
            <p key={i} className="gd-para">{para}</p>
          ))}
        </section>
      ))}
      <footer className="gd-foot">
        <Link className="am-linkImplicit" href="/about-nexus">← {locale === 'zh' ? '关于 NEXUS' : 'About NEXUS'}</Link>
        <Link className="am-linkImplicit" href="/discover">{locale === 'zh' ? '去广场 →' : 'Go to /discover →'}</Link>
      </footer>
    </main>
  );
}
