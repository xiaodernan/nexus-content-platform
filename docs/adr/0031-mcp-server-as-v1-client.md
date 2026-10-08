# ADR-0031: MCP server 是公开 API v1 的外部客户端，不是一条特权通道

日期：2026-10-07 ｜ 状态：已接受

## 背景

§188（M8）要求 MCP、外部 Agent、公开 API 三样。到 2026-09-30 为止公开 API v1 已有四片
（只读三条 + PATCH 设计补丁 + 凭据级访问账 + 编码协商），MCP 半边一直是空的。

## 选项

1. **MCP server 作为 v1 的外部客户端**（已选）：独立进程 `apps/mcp-server`，stdio 传输，
   只打 `{NEXUS_BASE_URL}/api/v1/*` + Bearer token，不 import apps/web、不连业务库。
2. MCP 处理器长在 Next.js 路由里（Streamable HTTP 挂在 `/api/mcp`）：平台内嵌。
3. MCP server 直连业务库/领域层：特权通道。

## 决定

选 1。理由：

- **三道门自动继承**：token 鉴权、scope（projects:read / design:read / design:write）、
  凭据级访问账——MCP 调用就是 v1 调用，账本里记的也是同一条，不需要第二套。
- **架构上它就是外部 Agent**（§16 的反面成立：外部程序要读的就是设计文档本体）。
  它对平台能做的事不多不少恰好是 v1 给的，天然回答"外部 Agent 能干什么"。
- 不碰 v1 的四条拒法（approval_required / ops_skipped / document_rejected / project_not_found），
  工具只是把平台的应答原样带回给模型。
- 无需为 MCP 在 web 进程里维持长连接状态；stdio 是本地 MCP 客户端（Claude Desktop、
  Qoder、Cursor 等）的标准接入方式。

## 后果

- 平台没起（或 BASE_URL 配错）时，工具返回 `NEXUS 平台不可达…` 的 isError 文本；
  凭据错返回 401 原文。MCP server 本身对平台不可用性无能为力，这是**特性**：
  它不缓存、不旁路、不替平台做决定。
- 四个工具（list_projects / get_project / get_design / patch_design）与 v1 端点一一对应；
  v1 以后加端点时同步加工具，工具面就是 v1 的镜像。
- 每次写（patch_design）= Studio 历史里一条记录（§149/§151 的既有一条路），
  外部 Agent 的改动在界面上可见、可撤销。
- 限制：stdio 只适合本机场景；要托管给远端 Agent 时需要另外的 Streamable HTTP
  入口（那时挂的仍然是 v1，不用改工具层）。

## 验证

- `apps/mcp-server/test/mcp.test.ts`（7 条）：对真本地 HTTP 后端量——tools/list 恰好四个、
  Bearer 头在、PATCH body 原样透传、404/401 变 isError 且错误码留在文本里、
  传输不可达是另一条错误路径。
- stdio 冒烟（两臂）：真进程 `initialize` 报 `serverInfo.name === "nexus"` + `tools/list` 四个；
  缺 `NEXUS_API_TOKEN` 退出码 1 且 stderr 说出哪里签发凭据。

## 后续（2026-10-09）

"v1 以后加端点时同步加工具"这句承诺兑现了第一轮：v1 加了 `POST /api/v1/projects` 与
`DELETE /api/v1/projects/<id>`（`projects:write` scope，迁移 0027），工具面同日 4→6
（`nexus_create_project` / `nexus_delete_project`）。`callV1` 的方法面放宽到 GET/POST/PATCH/DELETE，
其余架构决定不动。测试 7→11 条（新增的四条仍是对真本地 HTTP 后端量：body 透传、平台 400
进 isError 文本、查询串里中文确认词编码后逐字对上、确认词不对不动库）；stdio 真进程冒烟
`tools/list` 恰好六个。


## 第二轮后续（2026-10-09）

v1 加了 `POST /api/v1/projects/<id>/publish`（`publish:write`，迁移 0028），工具面同日 7→8
（`nexus_publish`）。**v1 只收 unlisted / private**：public 一律 400——§131 的机检与人工裁决
在人的路径上，§74 把公开发布列在必须人工审批的清单，凭据背后没有人可批。这条策略落在
`ApiPublishRequestSchema` 的枚举与端点的话里，MCP 工具层照抄同一放行范围（inputSchema 就
进不了平台）。private 走 `publishProject`（回执同一份 shape、行留着）而不是界面的
`unpublishProject`（删行）——两处故意不同的选择都写在路由注释里。
