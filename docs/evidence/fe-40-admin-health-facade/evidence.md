# §FE-40 · `/admin/health` 健康总览 `.hd-` 门面化——验收记录

## 这次做了什么

管理台补回缺失的一张脸：`/admin/health`（server-side 聚合：AI healthz capability · java actuator/health UP · gateway actuator/health UP · Redis PING · Postgres SELECT 1），`/api/admin/health` 的只读快照；页面粉 `.hd-*` 门面族（ok/bad 两态、纯色 dot + 中性 verdict 文案、mono detail）。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                  → TSC_EXIT=0
npx vitest run apps/web/test/admin-health-aggregate.test.ts  → 4 passed
npx vitest run apps/web/test/admin-health-visual-style.test.ts → 12 passed
npx vitest run apps/web/test/admin-home-style.test.ts        → 10 passed（11 处重钉）
npx vitest run apps/web/test/admin-hub-visual-style.test.ts  → 15 passed（12 入口 + 两 redact 常量重钉）
npx eslint <8 文件> --max-warnings=0                        → ESLINT_EXIT=0
```

## 线上守门（401 只读锚）

```
$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3100/api/admin/health
401            # 未登录/未鉴权，门关着、行为对
```

## 边界（如实）

- 非浏览器截图未做（本会话不连 desktop browser）。整页 HTML/ARIA/下划线未目视。
- REDIS/PG 探针在此环境里实启实灭、内存池 max=1（与 dev 一致）。
  NEXUS_GATEWAY_HEALTH_URL 默认 8091（本机实况），部署到其它环境需另设；
  当时实测 8081/8091 通只是这台的占位，evidence 记录的是 2026-11-13 实景译本。
