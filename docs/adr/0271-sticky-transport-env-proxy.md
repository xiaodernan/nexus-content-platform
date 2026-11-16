# ADR-0271：StickyPromptCacheTransport 静默丢弃机器代理的根治（本仓双代理教训）

## 状态

已实现、探测通过（probe:cache **ALL PASS**）、424 passed（ai-service 全绿）。

## 背景 / 症状

ws46@户此前两次报告：「调用时缓存命中率很低，而且一直显示非流」——在线的 L1 直连腿 200、
但服务内（L2）`/v1/ai/run` 的真实调用稳定收到上游 403（"本站不对您所在的国家及地区进行商业服务"），
而我们自己 curl/httpx 直连同一 endpoint 200。症状与环境严格一致：本机 aizzz.xyz 必须经 Clash Verge
（127.0.0.1:7897）出网——你提供给网关的东西，网才能呈出来。

## 根因（唯一真凶、机制级）

`StickyPromptCacheTransport` 是 provider 唯一共同出站点，它把 "POST chat/completions" 的 body 里
注入 `prompt_cache_key`。它按设计把**真实网络行为交给内层 transport**，而内层默认是
`httpx.HTTPTransport()`。**`httpx.HTTPTransport()` 不读环境变量**——env 代理只在 *Client 自建 transport*
时由 httpx 兜底生效；自定义 transport 一接管，`HTTP(S)_PROXY` 直接消失，出口变成直连 → 上游按国家
拦截 → 401/403（走的还是正确的 key、正确的 model、正确的 agent prompt）。

**症状迷雾：** 服务侧把一切 4xx 都映射为「provider 拒绝了凭据（401/403）」——一层对，一层以为是 key 问题；
实际上 key 完全正确。L1 探针不走这条粘性 transport（它是 plain httpx），所以它一直 200，这也加剧了
「为什么外面通、里面不通」的迷惑。

**"非流"的一半真相：** 本机 aizzz.xyz + Clash Verge 节点上 SSE 流式直接 SSL EOF；本机 provider 早已被
正确地钉在 `NEXUS_LLM_STREAM=0`（ADR-0269 的记账），所以用户看到的"非流"是对的记账，不是回归。
（"流式命中率好"只在上一个 provider wkapi.pro 成立。）

## 决定

`StickyPromptCacheTransport` 的默认内层改为 `_env_proxy_transport()`：
- 读 `HTTPS_PROXY` / `HTTP_PROXY`（小写也兼容）；
- 有合法代理 → `httpx.HTTPTransport(proxy=代理)`（httpx 0.28.1 已验证接受 URL 字符串）；
- 没有 / 非法代理 → 退回直连 `httpx.HTTPTransport()`（与导入前默认行为零差异，不静默伪造成功）。
- NO_PROXY 不管：出站的是外部 provider，不是 localhost 代理链。

## 验证

- `npm run probe:cache`（aizzz.xyz / gpt-6.1-terra / 真 key，真机器）：
  - L1 cold 0 → warm 4992（provider 侧前缀缓存约 95.5% 命中）；
  - L2（/v1/ai/run）：call#1 cold 0（4.6s）→ call#2 命中 Redis CachedLlm 完全回放（6707/6707 cached，200ms）；
    - 诚实分账：call#2 的 100% 命中是**应用级 completion cache**（精确匹配 (model, system, user, json_mode)）的回放，不是 provider 侧前缀缓存；
    - provider 侧前缀缓存数据来自 L1 那两次真机调用。两个账分开记，不合并。
- ai-service 424 passed / 18 skipped（live legs 跳过，不伪装网络腿）；sticky 模块 18 passed + 2 新门
  （`test_env_proxy_transport_honored` / `test_env_proxy_transport_plain_without_env`）。
- 收益是用户点名的「大幅提高缓存命中率 + token 利用效率」：服务内真实长 prompt 现在真正走 warm 通道了。

## 后果

- 任何机器只要有 `HTTP(S)_PROXY`，AI service 自启动（`dev-ai.sh` 已同步 source 这两类代理变量）就自动用上；
  没代理的机器不受任何影响（直连回退）。
- 下一个被请求时先 `probe:cache` 复读一次再写完成态；不相信「看起来真的通了」。
- 延伸教训（doctrine）：自定义 `Transport` / `Client` 绕过 httpx 的 trust_env 兜底，接管 transport 的任何一层
  都必须显式回答「代理从哪来、NO_PROXY 对不对、失败降级落到哪」——这一条写回 ADR-0127 的粘性路由族作为补充
  （ADR-0127 的 sticky_cache_key 仍然关键，它是「通道本地前缀缓存」的唯一路由信号；但「流量进网」的代理
  是单独一件事，两件不能混）。
