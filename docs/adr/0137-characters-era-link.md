# ADR 0137 — 人物 ↔ 编年同纪元互链（v706）

- 状态：ACCEPTED（2026-11-14）
- 范围：`packages/schemas`（CharacterProfileSchema 加 activeEra）+ `packages/world-model/character.ts`
  （CharacterProfile 加 activeEra）+ Studio CharacterPanel 文本域 + ConstellationPanel 徽章 +
  ChronicleView 人类 chips + `/world/<id>/chronicle` server load roster

## 背景

「世界」的三个视角（3D / 星图 / 年表）存在但互相看不见：人物不知道自己处在哪一段纪年，年表看不到那
条故事属于哪些人。v704 / v705 把两侧都搭好了，但它们之间没有一根线。

## 决定

1. ** CharacterProfile 加 `activeEra?: string`（可选、≤ 80 字）**：可省、旧行兼容（zod 同字段 optional）。
2. **Chronicle 卡片渲染"在场人物"**：若某角色的 activeEra 恰等于卡片所在纪元，chip 渲染该角色名，
   `data-chronicle-character` 标识 id；href 指向 `/world/<projectId>/constellation?character=<id>`，
   与星图互链不另建新页。
3. **零新增表、零新增写入路径**：ActiveEra 存角色档案（既有写入路径），chronicle 端只读。
4. **不强制填写**：没填的角色既不画 chip、也不报错——世界不是填空题。

## 验证（本机，真实数据）

- tsc 0；对涉及文件直查 eslint 0。
- `constellation.test.ts` / `chronicle.test.ts` / `world.test.ts` 共 29/29 通过。
- **端到端**（fixture 项目 constellation+mwg35nri = "星图 MWG35NRI"）：
  - `GET /world/f7ec6716.../chronicle` 200 OK
  - 两个 `data-chronicle-era`（灰灯纪）出现，两个 `data-chronicle-present` 出现
    （守夜人 + 苍雪主席）
  - 截图确认 chip 渲染与排版正常
- 新增文件：next.config/test 无回归；`contract:export` 无变化（这些不是跨端 contract）。

## 仍欠（诚实记录）

1. 没有"activeEra 可点选世界存在的纪元"——目前 Studio 是自由文本，写错字不报错（只渲染失配）。
2. 星图详情侧不显示该角色当前处在哪个纪元——可以再加一行，但本切片保持版面克制。
3. `?character=` 暂未被 constellation 端读取自动选中——只是锚点链接，选中高亮留给下一刀。
