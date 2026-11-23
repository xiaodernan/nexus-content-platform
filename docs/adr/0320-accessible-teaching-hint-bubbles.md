# ADR 0320 · 教学说明用共享可访问气泡，不再依赖原生 `title`

日期：2026-11-24 · 状态：已采纳 · 关联：§HINT-2（`docs/ROADMAP.md`）、
`apps/web/src/components/TeachingHint.tsx`、`apps/web/src/lib/hintCopy.ts`、
`apps/web/test/hint-coverage-behavior.test.ts`、`e2e/teaching-hints.spec.ts`

## 背景

§HINT-1 把六个主界面的教学说明收成一份字典，并给控件补上原生 `title`。它解决了
「说明散在多处」与「有些按钮根本没有说明」，但没有解决「说明是否读得到」：

- 键盘用户聚焦按钮时，浏览器不保证展示原生 `title`；
- 触屏用户没有稳定的 hover，原生 `title` 基本不可达；
- `title` 不是可靠的控件描述，屏幕阅读器支持也不一致；
- Studio 的 Escape 既要关气泡，也要清画布选择，全局监听很容易抢掉既有键位。

六个主界面是首页 / 广场 / 观察站 / Studio 顶栏 / Studio 命令栏 / 命令面板。上一片留下的
共享气泡欠账必须在视觉门禁、双语纯度与单一真值约束下补上，不能靠再写一份组件内文案解决。

## 选项

1. **继续用原生 `title`，只给控件补 `tabIndex`**。改动最小，但触屏仍不可达，
   `aria-label` 也不是教学描述，且不会改变屏幕阅读器读到的事实。否决。
2. **引入第三方 tooltip/popover 库**。能少写定位与 ARIA，但会新增依赖、主题与 bundle 成本，
   仍要处理 portal、visualViewport、Escape 作用域和本项目 token/forced-colors 约束。
   这一片没有需要第三方才有的能力，否决。
3. **自建一个薄的 `TeachingHint` 包装组件**（采纳）。它只克隆真实控件、管理开关与定位，
   不改业务事件，不拥有第二份文案；visible bubble 与 assistive description 分离。

## 决定

- **静态真值不变**：`@/lib/hintCopy`，当前 25 条，中英各一份。`TeachingHint` 接收
  `hintId + locale` 或明确的动态 `text + locale`，不接任意内联字典。
- **真实控件仍是主体**：`cloneElement` 注入 `aria-describedby` 与
  `data-teaching-hint-trigger`，并把 `title` 清成 `undefined`。`TopButton` 等包装组件必须
  透传这些属性，不能只转发自己认识的几个 prop。
- **两种描述载体**：常驻、视觉隐藏的 `role="tooltip"` 与控件通过 `aria-describedby` 关联；
  可见气泡用 body portal 渲染并标 `aria-hidden="true"`，避免屏幕阅读器把同一句读两遍。
  隐藏 tooltip 不嵌进原生 `<label>`，否则会污染控件的可访问名称；三个表单控件改用外置
  `label htmlFor`。
- **不占布局**：`.hint-anchor { display: contents }`，原 flex/grid 子项关系不变。可见气泡
  `position: fixed`，避免被画布或滚动容器裁剪。
- **三种打开方式**：focus capture、mouse pointer-enter、非 mouse pointer-down。触屏等非鼠标
  操作钉住气泡，外部 pointer-down 收起；mouse leave 延迟收起，气泡自身 hover 可取消延迟；
  blur 离开根后收起并重置 dismissed 标记，使下一次键盘聚焦能重新打开。
- **Escape 有作用域**：只有 `document.activeElement` 在提示根内才阻止默认与冒泡，并把焦点
  留在触发器。焦点在外时仍关闭自己的浮层，但不截断 Studio 画布的 Escape。
- **定位读可视视口**：使用 `window.visualViewport` 的 offset/width/height，按触发器上下
  可用空间选边；两侧都放不下时选较大一侧。气泡宽高按可用空间夹紧，内部可滚动，并监听
  window 与 visualViewport 的 resize/scroll 重新定位。
- **动态说明守边界**：撤销/重做仅有历史时挂气泡，静态后果与 store 实时操作名合并；
  无历史不挂空说明。断点标签经 `viewportOptions(locale)`；英文界面遇到仍是中文的历史
  命令标签时省略该细节，不机翻、不把汉字拼进英文。
- **门跟着行为改**：覆盖门要求静态说明 lexical 落在 `<TeachingHint>` 内，不接受残留
  `title={hint(...)}`；组件契约钉 ARIA、焦点、pointer、Escape 作用域、visualViewport 与限高；
  token/forced-colors 门保留。CommandBar 与 TopBar 的字节 SHA 因真实可访问性行为变化重钉，
  旧值与理由写在测试注释里。

## 后果

- 键盘与触屏用户有了稳定的教学入口，辅助技术有常驻描述；原生 `title` 不再承担关键信息。
- 没有新增第三方依赖，样式仍走项目 token，forced-colors 有系统色回退。
- 每个打开的气泡都有 portal 与定位监听；数量受同时聚焦/悬停的少量控件限制，不引入全局
  tooltip 管理器。真人的屏幕阅读器走查仍未做，不能把 ARIA 结构正确说成完整可用性认证。
- 这一片只覆盖六个主界面。属性 / 图层 / 资产 / 故事板 / 角色等面板内部各自的教学 `title`
  尚未收编，后续要迁移时继续使用同一组件与字典，不另起一套。
- 外部模型 API 按用户要求关闭；实现与验收不调用 provider。页面继续显示 `DEMO MODE`。

## 证据

- `apps/web/test/hint-coverage-behavior.test.ts` + CommandBar/TopBar 视觉门：
  **3 files / 35 tests passed**。
- `e2e/teaching-hints.spec.ts`，系统 Chrome、单 worker、隔离树 3101：
  **2 passed in 36.0s**；桌面 1280×800 中文与移动端 CSS 390×844 英文，
  另测 390×300 窄视口；生成接口拦截清单为空。
- 迁移选择器后的行为回归（components-panel / image-studio / studio）：
  **3 passed in 1.0m**。
- web/e2e TypeScript 检查退出 0；目标文件 ESLint 退出 0。
- 截图与完整诚实边界：`docs/evidence/studio/teaching-hints-accessible-2026-11-24.md`。
