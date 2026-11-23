# §HINT-2 · 可访问教学气泡真实验收（2026-11-24）

## 结论

六个主界面的教学说明从原生 `title` 升级为共享 `TeachingHint`。静态文案仍只有
`apps/web/src/lib/hintCopy.ts` 一份真值（25 条中英说明）；键盘、鼠标与触屏都有真实浏览器
凭证，ARIA 描述与可见气泡分离，Escape 不抢画布键位，气泡跟随可视视口并受可用空间约束。

本轮没有调用外部模型 API。浏览器用例拦截 `**/api/ai/**`，两条验收的调用清单均为空；
页面继续显示 `DEMO MODE`。

## 实现与门

- `apps/web/src/components/TeachingHint.tsx`
  - 克隆真实控件，注入 `aria-describedby` / `data-teaching-hint-trigger`，清除 `title`；
  - 常驻隐藏 `role="tooltip"`，可见气泡用 body portal 且 `aria-hidden="true"`；
  - focus / mouse hover / 非 mouse pointer-down 打开，外部 pointer-down 与 blur 收起；
  - Escape 只在提示根内有焦点时接管；
  - 使用 `visualViewport` 的 offset/size 定位，按上下空间选边并夹紧宽高。
- `apps/web/src/lib/hintCopy.ts`：25 条静态说明，中英各一份；没有组件内第二份字典。
- `apps/web/src/studio/TopBar.tsx`：撤销/重做有历史时才挂动态气泡；英文省略仍是中文的
  实时历史标签；断点标签经 `viewportOptions(locale)`。
- `apps/web/src/studio/CommandBar.tsx`：三个表单控件的隐藏 tooltip 移出原生 `<label>`，
  改用外置 `label htmlFor`，避免污染可访问名称。
- `apps/web/test/hint-coverage-behavior.test.ts`：覆盖、接线、双语、豁免、组件契约与视觉门。
- `apps/web/test/command-bar-visual-style.test.ts`：SHA `9b9848554975b5c46c2645e1626954aad8dff4153a4fc99f5cc57dd0c4aff541`。
- `apps/web/test/studio-topbar-visual-style.test.ts`：SHA `f78d66181274a38032af07388bc5b937e288c4c36ddbe5609a1bf3f4e0856e47`。

## 运行环境

- 工作树：`D:\nexus-sync-20261124`，分支 `consolidate/main-20261124`。
- Web：隔离树 app-local Next 16.4.6 webpack，`http://localhost:3101`；不碰主工作区 3100。
- 浏览器：系统 Chrome，Playwright 根配置 `workers: 1`、`channel: 'chrome'`。
- 用例：`e2e/teaching-hints.spec.ts`，真实注册/项目夹具与真实 Studio DOM。
- 认证复用测试夹具 cookie；没有读取或记录任何 GitHub/model API 凭据。

## 复现命令

```bash
# 先在与 3101 对应的隔离工作树启动 @nexus/web（app-local Next，webpack）
# 浏览器用例通过 NEXUS_WEB_URL 指向该实例
NEXUS_WEB_URL=http://localhost:3101 npx playwright test e2e/teaching-hints.spec.ts --workers=1

# 选择器从原生 title 迁到稳定 aria-keyshortcuts 后，重跑三条真实行为回归
NEXUS_WEB_URL=http://localhost:3101 npx playwright test \
  e2e/components-panel.spec.ts e2e/image-studio.spec.ts e2e/studio.spec.ts --workers=1

npm run test:main -- \
  apps/web/test/hint-coverage-behavior.test.ts \
  apps/web/test/command-bar-visual-style.test.ts \
  apps/web/test/studio-topbar-visual-style.test.ts

npx tsc -p apps/web/tsconfig.json --noEmit
npx tsc -p e2e/tsconfig.json --noEmit

npx eslint \
  apps/web/src/components/TeachingHint.tsx \
  apps/web/src/components/CommandPalette.tsx \
  apps/web/src/lib/hintCopy.ts \
  apps/web/src/studio/CommandBar.tsx \
  apps/web/src/studio/TopBar.tsx \
  apps/web/test/hint-coverage-behavior.test.ts \
  apps/web/test/studio-topbar-visual-style.test.ts \
  apps/web/test/command-bar-visual-style.test.ts \
  e2e/teaching-hints.spec.ts e2e/components-panel.spec.ts \
  e2e/image-studio.spec.ts e2e/studio.spec.ts
```

## 实测结果

| 检查 | 结果 |
| --- | --- |
| 相关 Vitest | **3 files / 35 tests passed** |
| 文档证据门 | **1 file / 5 tests passed** |
| `verify:record-encoding` | exit 0，4281 个受检文件 **0 chargeable lines** |
| `verify:evidence-census` | exit 0，140 个证据模块闭环，**132/132 arms matched** |
| `teaching-hints.spec.ts` | **2 passed in 36.0s** |
| 迁移选择器后的三组行为回归 | **3 passed in 1.0m** |
| `tsc -p apps/web/tsconfig.json --noEmit` | exit 0 |
| `tsc -p e2e/tsconfig.json --noEmit` | exit 0 |
| 目标文件 ESLint | exit 0 |
| 生成接口拦截清单 | 两条用例均为 `[]` |

三组行为回归分别是：

1. 组件面板「存为组件 → 删除 → 撤销把定义与实例链接一起带回来」；
2. Image Studio「DEMO 角标可见、一次点击一个事务、额度页面看得见那一笔」；
3. Studio「select, edit a property, undo, autosave」。

## 桌面读数（1280×800，中文，dark）

- 从 `<body>` 真实按 Tab 走到 `[data-ai-input]`，气泡打开；隐藏 tooltip 与可见气泡文本一致。
- Escape 收起气泡且焦点留在输入框；Shift+Tab 再 Tab 回来可重新打开。
- Tab 到执行按钮，气泡文本等于 `HINTS['studio.command.run'].zh`。
- 三个表单控件 `[data-ai-agent]` / `[data-ai-async]` / `[data-ai-review]` 的可访问名称
  仍等于各自 `<label>` 文本，隐藏 tooltip 没有并进名称。
- 悬停网格按钮打开 `studio.topbar.grid`；焦点在 `.sp-wordmark` 时按 Escape，
  `defaultPrevented === false`，画布选择正常清空——提示没有截断既有 Escape。
- 外部点击项目名后网格气泡收起；Escape 取消重命名，不留下输入框。
- 删除真实文本节点后，撤销气泡包含静态后果与实时「删除元素」；撤销恢复节点，
  重做再次删除，随后撤销恢复，节点用稳定 `data-node-id` 断言，不用会漂移的 `.first()`。
- 首页命令面板入口同样通过 Tab 聚焦并读出 `studio.palette.open`。

截图：`docs/evidence/studio/teaching-hints-desktop-zh.png`

- PNG：1280×800，97,245 bytes；
- SHA-256：`798e0375a338ff38895410b83cc4799e1f0814a70f51eab633fc187276f38835`；
- 目验：中文输入说明在命令框上方，文字完整、不压住触发器；Studio 中文外壳一致，
  `DEMO MODE` 可见。

## 移动端读数（CSS 390×844，英文，dark，touch）

- `html lang="en"`；真实 tap 输入框打开气泡，动态英文说明含 `Enter` 且零 CJK。
- 气泡矩形在 390×844 内，且不与触发器重叠。
- tap 画布外部区域，气泡收起。
- 真实 tap 选择文本节点并删除；撤销/重做气泡等于英文静态说明，零 CJK——历史命令标签
  仍是中文，英文气泡按边界省略该细节，不机翻。
- 视口改成 390×300 后再次 tap 输入框，气泡仍在视口内且不压住触发器。

截图：`docs/evidence/studio/teaching-hints-mobile-en.png`

- PNG：780×1688（deviceScaleFactor 2；CSS 视口 390×844），83,028 bytes；
- SHA-256：`89e3d018f43e4b1321de1b517da3d469998e70287333f66170a3e17886284cbe`；
- 目验：英文输入说明完整、零汉字；顶栏断点读作 `Mobile 375` / `Tablet 768` /
  `Desktop 1280` / `Wide 1536`；气泡在屏内，`DEMO MODE` 可见。画布里的中文是项目内容，
  不是 UI 文案泄漏。

## 过程中遇到并已处理的失败

- 桌面删除断言一度用 `[data-node-type="text"]).first()`，删除成功后它指向下一颗剩余文本，
  得到「还有 1 颗」的假红。改成先取稳定 `data-node-id` 再按 id 断言，并显式等选择手柄出现。
- 移动端删除一度不生效：AI 输入框仍有焦点，全局 Delete 被当作打字忽略。测试先 blur
  当前活动元素再按 Delete；这是夹具焦点问题，不是删除功能回归。
- Escape 作用域测试一度聚焦 `[data-project-name]`，它自己也有教学气泡，第一个 Escape
  正确关闭的是聚焦中的气泡。改用无提示的 `.sp-wordmark` 作为外部焦点对照。
- 一次全串行复跑在首页撞到 Next dev 的瞬时 `Runtime SyntaxError: Invalid or unexpected token`，
  当次直接请求 3101 仍为 HTTP 200；下一轮完整串行复跑通过。没有把这次未定位的 dev/HMR
  异常写成已修复的产品缺陷。
- `npm run test:e2e` 包装命令此前遇到过 Playwright Node 安装目录启动异常；本轮使用
  `npx playwright test` 直接调用并完成真浏览器验收，未绕过任何 git hook。
- 最终证据普查先红在一条并轨前遗留的过期行：`verify:record-encoding` 标着 2026-11-20，
  但证明脚本已在 `a228a58b`（2026-11-23）改过。按今天重跑的 **12.5 s / 0 chargeable lines**
  更新该行后，record-encoding 与 evidence census 均退出 0；没有把旧测量冒充成新字节的读数。

## 诚实边界

- 只覆盖六个主界面；面板内部各自的教学 `title` 尚未全站并入这份字典。
- 自动化验证了 ARIA 关联、键盘/触屏、Escape 作用域与气泡几何，但没有真人屏幕阅读器
  （NVDA/JAWS/VoiceOver）走查，不宣称完整可用性认证。
- 本轮没有跑整树 Vitest / Java / Docker integration；结论只覆盖上述列出并真跑的门。
- 外部模型 API 按用户要求关闭，零调用；Image Studio 回归走本地确定性 DEMO 路径。
