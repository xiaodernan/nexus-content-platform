# ADR-0300 · ai-service 默认模型统一到 gpt-6.2-sol（2026-11-21）

## 状态

已接受（2026-11-21）

## 背景

用户反复明示：「模型名一律用 gpt-6.2-sol」。运行期 `.env` 确实把四个文本档
（fast/balanced/reasoning/vision）都指向 `gpt-6.2-sol`（`https://api.aizzz.xyz/v1`），
真机证据也确认 `capability=real`。但代码里 `apps/ai-service/src/ai_service/config.py`
的 `DEFAULT_MODELS` 仍是过期值：

```python
{"fast": "gpt-4o-mini", "balanced": "gpt-4o", "reasoning": "gpt-4o", "vision": "gpt-4o", ...}
```

这是「只在 .env 在场时才对」的脆弱配置：干净环境、新部署、或任何忘记设 env 的调用方
会静默打一个网关上不存在的旧模型，然后拿到失败或错误回退。默认值必须与用户指定的
当前模型一致，才是「一律」的真正落地。

## 选项

A. 只改 `.env`。否——已经对了；问题是默认兜底没对。
B. 改 `DEFAULT_MODELS` 四档为 `gpt-6.2-sol`，并加门锁死。采用。
C. 连 base URL 默认也改成 aizzz.xyz。否——base URL 是部署配置，运行期已由
   `NEXUS_OPENAI_BASE_URL` 正确注入；改默认会把一个付费网关写进代码兜底，任何
   没配 env 的测试/工具都可能误发真实请求烧 token。保持 `api.openai.com/v1` 默认
   （同样需要 key 才可用），把地址交回配置层。这不是遗漏，是费用安全边界。

## 决定

1. `DEFAULT_MODELS` 的 fast/balanced/reasoning/vision 四档默认全部改为 `gpt-6.2-sol`；
   embedding 档保留 provider 默认（该网关无 embedding 模型，用 `NEXUS_MODEL_EMBEDDING=none` 显式 opt-out）。
2. 在 `tests/test_provider_model_inventory.py` 加两条门：
   - 四档默认必须等于 `gpt-6.2-sol`；
   - 默认值里不得残留任何 `gpt-4o` 家族名。
3. 门钉「当前模型常量」，不钉死字面散落各处；将来正当换模型只改一处常量。

## 门禁（实测）

- `pytest test_provider_model_inventory.py test_config_no_proxy.py -q` → **15 passed**（含 2 条新门）。
- 全量 `pytest apps/ai-service/tests -q` → **476 passed / 18 skipped / 0 failed**。
- 本机 venv 重建过（`/tmp` 跨会话被清）：`python -m venv /tmp/nexus-ai-venv` +
  经 Clash 7897 代理 `pip install -r apps/ai-service/requirements.txt`。

## 后果

### 变好的事

- 「模型名一律 gpt-6.2-sol」在代码默认值层面成立，不再依赖 .env 侥幸。
- 新部署 / 干净环境的默认行为正确；测试门防止旧家族名回潮。

### 边界

- base URL 默认未改（见选项 C），地址仍由部署配置注入。
- `pricing.py` 文档示例里的 gpt-4o/gpt-6-sol 是价格表格式说明，不是运行时默认值，未动。
- 本增量不改任何价格表内容（无内置默认价，成本照旧报 unknown）。

## 相关

- `apps/ai-service/src/ai_service/config.py`（DEFAULT_MODELS）
- `apps/ai-service/tests/test_provider_model_inventory.py`（默认模型门）
- ADR 0296（会话级缓存车道，同样确认当前模型 gpt-6.2-sol）
