import type { Locale } from './i18n';

/**
 * §HINT-1 · 教学说明的真值（Teaching hints — the single source）。
 *
 * 用户第五点：「主界面给各种按键和操作加上附带的教学说明，方便用户理解」。
 * 现实是：Studio 的主操作栏（CommandBar）里十四个控件**一个都没有**说明——
 * 「执行」「Fast」「Balanced」「让模型读一遍」「批准并交回编辑区」这些词，
 * 对第一次进 Studio 的人全是黑话，而它们恰好是最需要解释的那几个。
 *
 * 为什么不写在组件里：
 * - 组件各写各的，久了就出现两种说法（同一个按钮在命令栏说「交给队列」，
 *   在说明书里说「异步执行」），用户得自己翻译；
 * - 门无从检查：「这行文案到底有没有讲清它做什么」不是能自动判的事，
 *   但「这句说明是不是来自这一份字典、中英各有一份、够长、没夹语言」能判。
 *
 * 所以：**每一句教学说明都必须出自这张表**，并且中英各一份。
 * `apps/web/test/hint-coverage-behavior.test.ts` 是它的门——控件漏了说明会红，
 * 字典里出现死条目（谁都没用）也会红。
 *
 * 写法约定（门会查）：
 * - zh 必含汉字，en 必零汉字、零全角标点（§八 不中英夹杂）；
 * - 每一句都要说清「它做什么 / 按下去会发生什么」，不许只写一个词；
 * - 句子是给第一次用的人看的：说后果，不说术语。
 */
export const HINTS = {
  // ── Studio 底部 AI 命令栏 ────────────────────────────────────────────────────────────
  'studio.command.run': {
    zh: '把这句话交给 AI 去改画布：它先出执行计划，再落成一笔事务；整笔可以 Ctrl+Z 撤销。',
    en: 'Hand this sentence to the AI to change the canvas: it plans first, then lands one transaction; Ctrl+Z undoes the whole thing.',
  },
  'studio.command.mode.fast': {
    zh: 'Fast 档：出得最快、token 最省，适合改字号、挪位置这类小改动。',
    en: 'Fast tier: quickest and cheapest in tokens — good for small edits like a font size or a position nudge.',
  },
  'studio.command.mode.balanced': {
    zh: 'Balanced 档（默认）：速度与质量折中，大多数改稿用这一档就够。',
    en: 'Balanced tier (the default): a middle ground between speed and quality — enough for most edits.',
  },
  'studio.command.mode.reasoning': {
    zh: 'Reasoning 档：模型会先推演再动手，适合结构性改动；更慢，也更贵。',
    en: 'Reasoning tier: the model thinks it through before acting — for structural changes; slower and pricier.',
  },
  'studio.command.examples': {
    zh: '点一下把这句话填进输入框，不会直接执行——改完再按「执行」。',
    en: 'Click to drop this sentence into the input box; it does not run by itself — press Run when ready.',
  },
  'studio.command.plan': {
    zh: '展开或收起这次请求的执行计划：模型打算改哪几处、按什么顺序。',
    en: 'Expand or collapse the plan for this request: what the model intends to change and in which order.',
  },
  'studio.command.explain': {
    zh: '让模型先读一遍这份待审批的结果，说清它要改什么；批不批仍然由你决定。',
    en: 'Have the model read this pending result and say what it wants to change; approving is still your call.',
  },
  'studio.command.approve': {
    zh: '批准这份结果并交回编辑区：补丁会写进工作区，整笔可以 Ctrl+Z 撤销。',
    en: 'Approve this result and send it back to the editor: the patches enter the workspace; Ctrl+Z undoes the whole transaction.',
  },
  'studio.command.reject': {
    zh: '放弃这份结果：画布不会被改动，该发生的删除也不会发生。',
    en: 'Discard this result: the canvas stays untouched and nothing gets deleted.',
  },
  'studio.command.cancel': {
    zh: '取消还在跑的这次作业：已经交回的补丁不会撤回来，未落的也不会再落。',
    en: 'Cancel the job that is still running: patches already returned stay, and pending ones will not land.',
  },
  'studio.command.undo': {
    zh: '撤销刚才这一笔 AI 事务（与 Ctrl+Z 同一条栈）：对话、画布、分镜一起回退。',
    en: 'Undo the last AI transaction (the same stack as Ctrl+Z): the chat, the canvas and the storyboard all roll back.',
  },
  'studio.command.async': {
    zh: '异步作业：交给 AI Service 的队列执行，不挂住这次请求；状态与结果靠回来问。',
    en: 'Async job: run through the AI Service queue without blocking this request; status and result are polled for.',
  },
  'studio.command.review': {
    zh: '让 AI 自查一遍：多花 1–3 次调用，审稿 Agent 会核对每项诉求有没有真的落到补丁里，漏了就重做一次。',
    en: 'Double-check with AI: costs 1–3 extra calls — a reviewer checks that every request landed in the patch and redoes it if something was missed.',
  },
  'studio.command.assign': {
    zh: '点名交给哪一位 Agent：名册来自库里的 agents 表；不点名就按这次请求的意图走。',
    en: 'Name the agent to hand this to: the roster comes from the agents table in the library; unnamed runs follow the request intent.',
  },

  // ── 两枚只读的读数徽章（它们也是教学：数字不解释就没人敢看） ──────────────────────
  'studio.cache.badge': {
    zh: '命中的是输入 token（前缀缓存）：缓存那一段仍然计费，只是打折。',
    en: 'Hits mean input tokens (prefix cache). The cached segment is still billed, only at a discount.',
  },
  'studio.lane.badge': {
    zh: '这一趟真走的编排车道：stategraph = LangGraph 状态图（七节点）；lane-a = 顺序执行。由服务端响应头判定，客户端不猜。',
    en: 'The orchestration lane this run actually took: stategraph = LangGraph state graph (seven nodes); lane-a = sequential run. Decided by the server response header — never guessed client-side.',
  },

  // ── 命令面板 ────────────────────────────────────────────────────────────────────────
  'studio.palette.open': {
    zh: '命令面板：输入命令或页面名直接跳过去（Ctrl+K / ⌘K）。',
    en: 'Command palette: type a command or a page name to jump there (Ctrl+K / ⌘K).',
  },

  // ── Studio 顶栏 ────────────────────────────────────────────────────────────────────
  'studio.topbar.rail': {
    zh: '展开 / 收起左侧面板：图层 · Agent · 历史 · 设计系统……',
    en: 'Open / close the side panel: layers · agent · history · design system…',
  },
  'studio.topbar.rename': {
    zh: '点一下可以改项目名：改完按 Enter 生效，按 Esc 取消。',
    en: 'Click to rename the project: press Enter to keep it, Esc to cancel.',
  },
  'studio.topbar.themeMode': {
    zh: '选这个项目用哪一套主题：设计系统的 token 从默认主题还是自定义模式取值。',
    en: 'Choose which theme set this project uses: whether the design-system tokens come from the default theme or a custom mode.',
  },
  'studio.topbar.help': {
    zh: '打开说明书：这一册里是这个平台是什么、怎么用、怎么玩，中英都在里面。',
    en: 'Open the manual: what this platform is, how to use it and how to play — in both languages.',
  },
  'studio.topbar.preview': {
    zh: '只读预览：把这个项目跑起来给你看，但改不动——发布前先看看它长什么样。',
    en: 'Read-only preview: runs the project for you to look at, but edits do not land — check it before you publish.',
  },
  'studio.topbar.grid': {
    zh: '对齐网格：打开后拖动元素会按 8px 网格吸附，Ctrl+G 可以随时收起。',
    en: 'Alignment grid: with it on, dragged elements snap to an 8px grid; Ctrl+G turns it off again.',
  },
  'studio.topbar.undo': {
    zh: '撤销上一笔编辑：画布、图层、分镜与对话一起回退；Ctrl+Z 是同一条撤销栈。',
    en: 'Undo the last edit: canvas, layers, storyboard and chat roll back together; Ctrl+Z uses the same undo stack.',
  },
  'studio.topbar.redo': {
    zh: '重做刚撤销的那一笔编辑：画布、图层、分镜与对话一起恢复；Ctrl+Shift+Z 是同一条重做栈。',
    en: 'Redo the edit you just undid: canvas, layers, storyboard and chat return together; Ctrl+Shift+Z uses the same redo stack.',
  },
} as const;

export type HintId = keyof typeof HINTS;

/** 取一句教学说明。locale 决定语言；两种语言都必须写全（门会查）。 */
export function hint(id: HintId, locale: Locale): string {
  return HINTS[id][locale];
}
