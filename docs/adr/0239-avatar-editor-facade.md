# ADR-0239：§FE-86 `AvatarEditor.tsx` `.ae-` 门面化——§60 头像上传

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-85 · `apps/web/test/avatar-editor-visual-style.test.ts` · `docs/evidence/fe-86-avatar-editor-facade/evidence.md`

## 背景

§60 头像：选文件→上传→立刻显示新头像；页面上必须写明"剥掉了哪些元数据段"（EXIF GPS/机型）——头像是全站少数任何人不登录都能看到的图。摘掉回到 null 首字母，不造默认图。

## 决定

1. 新增 `.ae-*` 门面族（globals.css，`.tt-fab` 之后）：`ae-root/ae-img/ae-fallback/ae-col/ae-row/ae-file/ae-btn/ae-hint/ae-note`；`file:` 变体 → `.ae-file::file-selector-button`（合法选择器，非原子）。
2. **零行为恒等门**（redact）：`beeff385…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：client + csrf/router 进门 · `data-avatar-*` 全钩守恒 · 字面类全 ae-* · 零裸 Tailwind（`::file-selector-button` 合法） · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- `accept="image/png,image/jpeg,image/webp,image/gif"` 与"按文件头判定"文案保留；
- 连续选同一文件的 `inputRef.value = ''` 语义保留；
- 48px 头像圆用 `3rem`（h-12/w-12 字节级等）；
- fallback 的"无"（不造默认头像）语义保留。

## 后果

`AvatarEditor` 加入门面矩阵。§60 账号面门面化推进。
