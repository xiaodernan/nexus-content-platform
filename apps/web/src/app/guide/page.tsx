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
        heading: '② 新手快速演示·第一次跑通',
        body: [
          '注册 → 点"新建项目"→ 起个名字 → 自动进 Studio（左栏面板 + 中央画布 + 右检视器）。',
          '在 Studio 画布上选中一个元素（鼠标或 Tab 都行）→ 顶栏点"新建页"加一页，或从左栏把组件拖上来。',
          '对 AI 说一句话就行（例："把标题换成 72px 的衬线字"）——每次 AI 产出都是一个可以 ⌘Z 撤销的 Command；没有 provider 时它不假装做了，会挂 DEMO MODE。',
          '⌘K（或 Ctrl K）打开命令面板——输入项目名或任意页面关键词（如 "发布" 或 "ship"），Enter 直接跳。',
          'Ctrl S（Mac ⌘S）保存；按 "?" 键呼出键盘速览卡——真实清单（⌘K 面板、Ctrl Z / Ctrl Y、方向键微移、Shift+方向键 8px 网格、Ctrl+A 全选、Ctrl+G 网格、Delete 删除）。',
          'Ctrl G 显示或隐藏对齐网格；方向键微移 1px、Shift+方向键 8px 网格、Delete 删除选中。',
          '做完一切后先 Ctrl S 保存，再点顶栏"发布"把项目投进广场——别人才能在 /discover 发现它；此前只属于你自己。',
          '下一站：/ship 看这次交付的每日日志；换真 provider 之后同一条流水线产出真东西。',
          '卡住了？按 ? 键读一遍速览卡，或先看 /guide 里 ④ 游戏怎么玩、⑤ 额度 & DEMO MODE。',
        ],
      },
      {
        heading: '③ 功能地图（点进去就是那个页面）',
        body: [
          '/discover 广场（热门/最新/ trending / 我关注的）· /marketplace 组件/模板/资产市场 · /blocks 积木库 · /search 全站搜索',
          '/studio/<project> 项目主场：画布/图层/设计系统/3D · /world/<id> 走进这个世界（3D 步行）· /world/<id>/digest 世界速览 · /world/<id>/tide 世界潮汐 · /world/<id>/constellation 人物关系星图 · /world/<id>/codex 设定集（纸面投影）· /world/<id>/chronicle 编年 · /world/<id>/ephemeris 世界切片',
          '/credits 我的额度 · /tasks 任务账本 · /api-tokens API 令牌 · /analytics 我作品的数据 · /notifications 收件箱 · /ship 交付日志 · /about-nexus 关于',
          '/admin/* 平台管理台（role=admin）：审核台、pricing、dead-letter、ai-cache、audit、observability、users、pricing、rate-limit 等',
        ],
      },
      {
        heading: '④ 游戏怎么玩',
        body: [
          '动作面（/game/<id>）：WASD 或方向键移动；空格攻击；右上角 HUD 会实时显示 生命、时间、场上敌人数、拾取计数（物品 x/y）、发现量 与 激活量——把一张图完整走完再看结算。',
          '失败了就重来：失败的结果画面上「重新开始」按钮可以一键重开，键盘上也绑了空格键；每一局固定、检查点不跨盘。',
          '下一段的敌人布局由游戏设计系统（@nexus/game-model）接上一局的落点决定——你走到哪里、没走到哪里，下一盘的敌人就按那个坐标长出来。',
          'RPG 冒险（/game/<id>?view=rpg）：WASD/方向键走，靠近 NPC 按空格/Enter 开始对话；上下箭头选选项、空格确认；对话的决定会写进你的世界档案。',
          '这些游戏是项目自己长出来的：棋盘、敌人、数值全来自你项目里的设计系统/角色，没有"看价目表定死的成品"——Studio 里改数，下一盘就按新数跑。',
          '诚实说明书：游戏本体没有云存档、没有自动保存点——每一局独立结算，交了卷就没有下一盘继承你的 HP。',
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
          'Q：为什么我按了个按钮，整页空白了？A：这是 DEMO MODE 的特性——未配置 provider 时，生成路径不写真实代码；等到你在环境变量里配置好真实 provider 并跑通第一次真实调用，那些页就"亮"了。',
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
        heading: '② New here? A 2-minute first run-through',
        body: [
          'Sign up → "New project" → give it a name → you land in Studio (left panel + canvas + right inspector).',
          'In Studio, select something on the canvas (mouse or Tab) → hit "New page" in the top bar, or drag components from the left onto the canvas.',
          'Say one sentence to the AI (e.g. "make the title 72px serif") — every AI turn lands as a Command you can undo with Cmd/Ctrl+Z; no provider configured ⇒ no pretend magic, the DEMO MODE badge shows.',
          'Press Cmd/Ctrl+K to open the command palette — type a project name or any path keyword ("publish", "ship", "tide") and Enter jumps straight there.',
          'Cmd/Ctrl+S to save; press "?" to pull the speed-cheat card on screen — the whole real list (⌘K palette, Ctrl+Z / Ctrl+Y, arrow nudges, Shift+arrows 8px grid, Ctrl+A select, Ctrl+G grid, Delete).',
          'Ctrl/Cmd+G toggles the alignment grid; arrow keys nudge 1px, Shift+arrows 8px, Delete removes the selection.',
          'When it is right: Cmd/Ctrl+S to save, then Publish from the top bar — your project lands on /discover; before that it stays yours alone.',
          'Next stop: /ship to see the daily delivery log; once a real provider is wired, the same pipeline produces the real stuff.',
          'Stuck? Press ? to read the cheatsheet, or jump back to section ④ (games) / ⑤ (quota & DEMO MODE) right here.',
        ],
      },
      {
        heading: '③ Feature map (click a path, land on the page)',
        body: [
          '/discover feed · /marketplace components/templates/assets · /blocks library · /search global search',
          '/studio/<project> studio · /world/<id> walk this world (3D) · /world/<id>/digest world digest · /world/<id>/tide world tide · /world/<id>/constellation character graph · /world/<id>/codex paper tome · /world/<id>/chronicle timeline · /world/<id>/ephemeris 360-day page',
          '/credits your quota · /tasks task ledger · /api-tokens API tokens · /analytics your stats · /notifications inbox · /ship ship log · /about-nexus about',
          '/admin/* admin console (role=admin): moderation, pricing, dead-letters, ai-cache, audit, observability, users, rate-limit, etc.',
        ],
      },
      {
        heading: '④ How games work here',
        body: [
          'Action surface (/game/<id>): WASD or arrow keys to move; Space to attack. The HUD shows health, time, live enemies, pickups (items x/y), discoveries and activations — finish the map before judging, not by health alone.',
          'Dead? Restart: the “Restart” button on the outcome screen re-runs (Space also bound); runs are self-contained, no cross-run checkpoints.',
          'Next stage layout is decided by @nexus/game-model from where you ended — your previous coordinates seed the next enemy placements.',
          'RPG adventure (/game/<id>?view=rpg): WASD/arrows to walk; Space/Enter near an NPC to talk; pick options with arrows + Space; dialogue choices write into your world file (visible in the character panel).',
          'These games grow from YOUR project: boards, enemies and numbers come from your own design system/cast — not a pre-baked product; tweak numbers in Studio and the next run plays by them.',
          'Honesty note: the game itself has no cloud save and no auto checkpoints — every run settles independently; once you wipe-screen out, there is no carrying HP forward.',
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
          'Q: why did the page go blank? A: DEMO MODE short-circuit — no provider configured, so generation can’t write real code. Configure the real provider endpoint in the environment to make those pages "light up".',
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
