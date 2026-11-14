# ADR-0154：静态判据锚真实代码而非含注释全文——把 FE-9 的 `code` 纪律推广到同批 4 份门面门

- 日期：2026-11-12
- 状态：Accepted
- 关联：ADR-0148/§159（完成度口径诚实）、ADR-0151（FE-9 首抓此类假绿）、ADR-0147/0153（A11Y-2 判据自身修实）、ADR-0123（FE 门面六红线）

## 背景 / 坐实缺口

FE-9 变异臂曾抓到一次**判据假绿**：诚实文案门锚整份 `not-found.tsx`（含顶部 JSDoc），删掉正文诚实旁注后，注释里的同义词仍让门通过——门守的是"文件含某词"，不是"渲染出来的代码含某词"。当时修法是去块注释得 `code`、语义门全改锚 `code`，并记下教训「**变异臂是判据自身的验伪器**」。

同批早期门面判据（FE-6 公开作品 / FE-7 试玩 / FE-8 分镜 / profile 作者页）仍是旧口径：`const page = readFileSync(...)`，虽有 `cssNoComments` 但只对 CSS 用，所有**语义门**（结构钩子 `page.includes`、读路径/诚实文案 `expect(page).toContain`、类名提取 `pagePbClasses(page)`、计数门 `page.match(/getPublishedPage\(/g)`、层优先级 `page.matchAll`）全锚含 JSDoc 的 `page` 全文。另有 `forced-colors-style.test.ts` 的零 hex / 零 token 门用含注释原文 `globals` 截 forced 块。

按「先证伪伪优化」纪律，**不凭代码长得像就改**，先用真变异臂证明旧门确实假绿。

## 证伪：旧门假绿（真变异铁证）

以 FE-7 试玩页为样本做变异：把正文真实调用 `getPublishedPage(path)` 改成不存在的 `resolveVisiblePage(path)`（破坏读路径复用），同时在 JSDoc 把 ``复用 `getPublishedPage` `` 补成 ``复用 `getPublishedPage(path)` ``（与门断言同形）。结果：**旧门 rc=0，10/10 全绿**——"守住读路径"门被注释同形字样喂绿，删掉的真实调用没被抓。假绿坐实，C 片不是伪优化。

另以 `forced-colors` 块**内部注释**塞 `#abcdef` 做变异：旧 `:142` 零 hex 门把注释里的 hex 当生产代码报红（rc=1）——这是**假红**（合规代码被误判违规，会把注释示例色算成新颜色）。注：注释塞在 `@media` 起点**之前**不触发（search 定位 `@media` 本身、不含前置注释），只有塞进块**内部**才戳中，故定性为"能被喂红、当前未既成"的隐患，不夸大。

## 决策：语义门锚 `code`，hex/token 门锚 `clean`

1. **4 份门面门各加 `const code = cssNoComments(page)`**（去块注释），把所有语义门改锚 `code`：
   - 结构钩子门 `code.includes(h)`；
   - 读路径/诚实文案/SEO/渲染路径门 `expect(code, …)`；
   - 类名提取 `pageXxClasses(code)`（防注释里的类名字样被误提取）；
   - FE-6 的 React cache 去重计数门 `code.match(/getPublishedPage\(/g)`——改锚后注释凑数不再生效，只数 generateMetadata + 正文两处**真实调用**；
   - 层优先级门 `code.matchAll(/className=…/)`。
2. **`forced-colors-style.test.ts`** 的 `:144/:150` 由 `globals.slice(search(...))` 改为 `clean.slice(...)`（文件顶部已有去注释的 `clean`），使注释里的 hex / `var(--nexus-*)` 不再误报，而**生产规则**里的仍被抓。

**零产品行为改动**：本片只动 5 个测试文件，不含任何 `apps/web/src/**` 或 `globals.css` 产品字节（所有变异臂当场恢复、md5 对齐基线）。

## 验电矩阵（变异臂是判据自身的验伪器）

每臂当场备份 + md5 断言变异真发生 + 恢复后 md5 核验，红绿只认 vitest 退出码：

| 臂 | 变异 | 期望 | 实测 |
| --- | --- | --- | --- |
| play | 删正文 `getPublishedPage(path)` + JSDoc 补同形 | 读路径门红（旧门此处假绿） | rc=1，`expected '…' to contain 'getPublishedPage(path)'` |
| storyboard | 正文"不是视频"改"不是影片" + JSDoc 补同词 | 诚实边界门红 | rc=1，`to contain '不是视频'` |
| published | 删一处真实 `getPublishedPage` 调用 | 计数门红（注释凑数失效） | rc=1，`expected 1 to be greater than or equal to 2` |
| profile | 删正文 `<BlockControl/>` | 组件门红 | rc=1，`to contain '<BlockControl'` |
| forced 臂 B | forced 块**内部注释**塞 `#abcdef` | **转绿**（假红消除） | rc=0，9/9 |
| forced 臂 C | forced **生产声明**真塞 `#abcdef` | **仍红**（门有牙） | rc=1，`expected [ '#abcdef' ] to deeply equal []` |

恢复 md5 全对齐基线（play `afbe4e00…`、storyboard `a23ecfb3…`、published `99408a88…`、profile `f7b7e244…`、globals `ae6a71ac…`）。终态 5 份全绿。

## 验证

- **5 份加固判据各自全绿**：forced-colors 9/9、play 10/10、storyboard 10/10、published 11/11、profile 8/8。
- **静态零遗漏**：grep 确认 4 份里 `expect(page` / `page.includes(` / `page.matchAll(` / `Classes(page)` 语义引用 **0 处残留**（仅剩注释/路径字面量里的 "page" 字样）。
- **横向回归**：`style-tokens` 全局 TSX 扫描 **24/24**；`not-found` + `disclosure-controls` + `control-names` **22/22**。
- **工程门**：eslint 5 文件单进程一次检查 **RC=0 零告警**（`for` 循环逐文件冷启动在 34 node 进程下 300s 超时，改单进程加载一次 flat config 后通过）；`tsc -p apps/web --noEmit` **RC=0**。SIGTERM/超时按纪律不算绿也不算红，未 skip hook、未放水。
- **未 push**（长期纪律）。

## 诚实边界 / 仍欠

1. 本片是**判据加固**，零产品行为改动、零新功能；价值在于把"门守真实代码"从 FE-9 一处推广到同批，堵住注释喂绿/喂红两类洞。
2. 未穷举其余全部 `apps/web/test/*style*.test.ts`（本片聚焦 FE-6/7/8 + profile + forced-colors 这批同构旧口径）；其它门若仍有锚全文语义门，留待将来同类变异臂触发时另立片，不臆断全库已净。
3. `forced-colors` 的注释喂红**当前未既成**（现有注释无 hex/nexus token/@media 字面量），本片属防未来加固；已用变异臂证明它能被喂红且修实后消除。
4. 真读屏器听读 / FE hover 逐帧看图 / 真库真 Redis 全套与墙钟实测仍待干净窗口；未 push。

## 协作注记

开工 HEAD `5c2a9297`（并行会话 §SC-74/75 已前移，本片纯 `apps/web/test/**` 5 个测试文件与并行 `services/**` 正交，无实时编辑残留）。精确 stage 只列本片 5 测试文件 + ADR + 三处文档，避开 `services/**` / `pom.xml` / gitignored 归档 / 临时脚本；文档只追加不 rewrite。详见 ROADMAP / CURRENT-STATE。
