"""§AILIVE-1 真实 provider 接通的**三层可复检判据**（脱敏，可入 CI）。

Run:  python scripts/probe-provider.py [--service http://127.0.0.1:3200]

三层真链路，一层比一层贴近生产（任一层失败 → 非 0 退出，绝不假绿 §159）：
  L1  direct provider chat/completions + response_format=json_object
      —— 只验 endpoint/key/model 真能用，不依赖 ai-service 启动；断言 JSON mode 真返回对象。
  L2  ai-service /healthz —— capability=real、llm provider status=real。
  L3  ai-service /v1/ai/run（dryRun）+ /v1/ai/chat
      —— 生产式链路真生成，断言契约字段 + usage.demoMode=false + 真 model 回显。

配置从进程 env 读，缺省回落 apps/ai-service/.env（被 .gitignore 隔离）：
  NEXUS_OPENAI_API_KEY / NEXUS_OPENAI_BASE_URL / NEXUS_MODEL_BALANCED
  NEXUS_AI_SERVICE_URL（L2/L3 目标，默认 http://127.0.0.1:3200）

**绝不打印 key**：只输出 model / status / tokens / latency / 断言 PASS-FAIL。
无 key → exit 2；L1 网络错 → exit 3；L1 契约违约 → exit 4；
L2/L3 不可达 → exit 5；L2/L3 契约违约 → exit 6。加 --direct-only 只跑 L1。
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys
import time

# 中文 Windows / 非 UTF-8 终端下别让 GBK 爆掉 😊 之类的 provider 真回显字（非关键字节直接丢掉也可接受）
try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
except Exception:
    pass

# 显式环境变量优先；缺省回落到 apps/ai-service/.env（本地开发文件，.gitignore 隔离）。
_here = os.path.dirname(os.path.abspath(__file__))
_dot_env = os.path.normpath(os.path.join(_here, "..", "apps", "ai-service", ".env"))


def _load_dotenv(path: str) -> None:
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            key, sep, value = line.partition("=")
            if sep and key.strip().startswith(("NEXUS_", "AI_SERVICE_")):
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(_dot_env)

KEY = os.environ.get("NEXUS_OPENAI_API_KEY")
BASE = os.environ.get("NEXUS_OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
MODEL = os.environ.get("NEXUS_MODEL_BALANCED", "gpt-4o")
SERVICE = os.environ.get("NEXUS_AI_SERVICE_URL", "http://127.0.0.1:3200").rstrip("/")

_fail = lambda code, msg: (print(f"FAIL: {msg}", file=sys.stderr), sys.exit(code))
_pass = lambda msg: print(f"PASS: {msg}")

if not KEY:
    _fail(2, "NEXUS_OPENAI_API_KEY not found in env or apps/ai-service/.env "
             "(fill apps/ai-service/.env, see apps/ai-service/.env.example)")

import httpx  # noqa: E402  —— 无 key 时上面已退出，不加载网络栈

_provider_headers = {"authorization": f"Bearer {KEY}", "content-type": "application/json"}


def l1_direct_provider() -> None:
    """只验 provider 本身：JSON mode 真返回一个对象、model 真回显、usage 真有 token。"""
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": "You reply only in JSON."},
            {"role": "user", "content": 'Reply with exactly this JSON object: {"ok": true, "origin": "nexus probe"}'},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    started = time.perf_counter()
    try:
        r = httpx.post(f"{BASE}/chat/completions", headers=_provider_headers, json=body, timeout=90)
    except httpx.HTTPError as exc:
        _fail(3, f"L1 provider 网络失败：{exc.__class__.__name__}")
    elapsed = (time.perf_counter() - started) * 1000
    if r.status_code in (401, 403):
        _fail(4, f"L1 provider 拒绝凭据（HTTP {r.status_code}）——检查 NEXUS_OPENAI_API_KEY")
    if r.status_code != 200:
        _fail(4, f"L1 provider 非 200：HTTP {r.status_code}")
    try:
        payload = r.json()
        content = payload["choices"][0]["message"]["content"]
        parsed = json.loads(content)  # JSON mode 必须真返回可解析对象（拒纯文本/markdown 围栏）
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        _fail(4, f"L1 provider 响应违约（非 JSON 对象）：{exc.__class__.__name__} · body={r.text[:200]}")
    usage = payload.get("usage") or {}
    if not (isinstance(parsed, dict) and parsed.get("ok") is True):
        _fail(4, f"L1 JSON mode 语义漂移：期望 ok=true，得到 {content[:120]!r}")
    if not (usage.get("prompt_tokens") or 0) or not (usage.get("completion_tokens") or 0):
        _fail(4, "L1 usage 缺 token 计数（无法证明真实计费调用）")
    print(f"  L1 direct provider: model={payload.get('model')} · {elapsed:.0f}ms · "
          f"tokens={usage['prompt_tokens']}/{usage['completion_tokens']} · json={json.dumps(parsed, ensure_ascii=False)}")
    _pass("L1 direct provider chat/completions + JSON mode 真通")


def l2_healthz() -> None:
    try:
        r = httpx.get(f"{SERVICE}/healthz", timeout=10)
    except httpx.HTTPError as exc:
        _fail(5, f"L2 ai-service /healthz 不可达（{exc.__class__.__name__}）——"
                f"先起 uvicorn ai_service.app:app，或 --direct-only 只验 L1")
    if r.status_code != 200:
        _fail(6, f"L2 /healthz 非 200：HTTP {r.status_code}")
    try:
        payload = r.json()
    except ValueError:
        _fail(6, "L2 /healthz 非 JSON")
    if payload.get("capability") != "real":
        _fail(6, f"L2 capability 应 real，得到 {payload.get('capability')!r}（provider 没真接通）")
    llm = [p for p in payload.get("providers", []) if p.get("kind") == "llm"]
    if not llm or llm[0].get("status") != "real":
        _fail(6, f"L2 llm provider 应 real，得到 {[p.get('status') for p in llm]}")
    print(f"  L2 healthz: capability=real · llm models={llm[0].get('models')} · queue={payload.get('queue', {}).get('backend')}")
    _pass("L2 ai-service capability=real + llm provider real")


def l3_run_and_chat() -> None:
    run_body = {
        "requestId": "probe-live-run",
        "intent": "critique",
        "prompt": "用一句话说明 WCAG AA 正文文本的最低对比度要求。",
        "modelClass": "balanced",
        "dryRun": True,
        "context": {"projectId": "probe-live"},
    }
    started = time.perf_counter()
    try:
        r = httpx.post(f"{SERVICE}/v1/ai/run", headers={"content-type": "application/json"},
                       json=run_body, timeout=120)
    except httpx.HTTPError as exc:
        _fail(5, f"L3 /v1/ai/run 不可达：{exc.__class__.__name__}")
    run_ms = (time.perf_counter() - started) * 1000
    if r.status_code != 200:
        _fail(6, f"L3 /v1/ai/run 非 200：HTTP {r.status_code} · body={r.text[:200]}")
    try:
        run = r.json()
        usage = run["usage"]
    except (ValueError, KeyError) as exc:
        _fail(6, f"L3 /v1/ai/run 契约违约：缺 usage / 非 JSON（{exc.__class__.__name__}）")
    if run.get("capability") != "real" or usage.get("demoMode") is not False:
        _fail(6, f"L3 /v1/ai/run 必须 capability=real 且 demoMode=false，"
                f"得到 capability={run.get('capability')!r} demoMode={usage.get('demoMode')!r}")
    if not usage.get("model") or not (usage.get("tokensIn") or 0):
        _fail(6, "L3 /v1/ai/run usage 缺真 model / token 计数")
    print(f"  L3 run: model={usage['model']} · {run_ms:.0f}ms · "
          f"tokens={usage['tokensIn']}/{usage['tokensOut']} · patches={len(run.get('patches') or [])} · demoMode=false")

    chat_body = {
        "requestId": "probe-live-chat",
        "system": "你是 NEXUS 的角色「小纳」，说话简洁友好。",
        "user": "一句话介绍你自己。",
        "modelClass": "balanced",
    }
    started = time.perf_counter()
    try:
        r = httpx.post(f"{SERVICE}/v1/ai/chat", headers={"content-type": "application/json"},
                       json=chat_body, timeout=120)
    except httpx.HTTPError as exc:
        _fail(5, f"L3 /v1/ai/chat 不可达：{exc.__class__.__name__}")
    chat_ms = (time.perf_counter() - started) * 1000
    if r.status_code != 200:
        _fail(6, f"L3 /v1/ai/chat 非 200：HTTP {r.status_code} · body={r.text[:200]}")
    try:
        chat = r.json()
        usage = chat["usage"]
    except (ValueError, KeyError) as exc:
        _fail(6, f"L3 /v1/ai/chat 契约违约（{exc.__class__.__name__}）")
    if chat.get("capability") != "real" or usage.get("demoMode") is not False:
        _fail(6, f"L3 /v1/ai/chat 必须 capability=real 且 demoMode=false，"
                f"得到 capability={chat.get('capability')!r} demoMode={usage.get('demoMode')!r}")
    if not (chat.get("text") or "").strip():
        _fail(6, "L3 /v1/ai/chat 返回空 text（不能冒充真生成）")
    print(f"  L3 chat: model={usage['model']} · {chat_ms:.0f}ms · "
          f"tokens={usage['tokensIn']}/{usage['tokensOut']} · text={chat['text'][:60]!r} · demoMode=false")
    _pass("L3 ai-service /v1/ai/run + /v1/ai/chat 真生成，契约齐 + demoMode=false")


def main() -> None:
    global SERVICE
    ap = argparse.ArgumentParser(description="§AILIVE-1 真实 provider 三层可复检判据（脱敏）")
    ap.add_argument("--service", default=SERVICE, help="ai-service 地址（默认读 NEXUS_AI_SERVICE_URL）")
    ap.add_argument("--direct-only", action="store_true", help="只跑 L1（不依赖 ai-service 启动）")
    args = ap.parse_args()
    SERVICE = args.service.rstrip("/")

    print(f"[§AILIVE-1] real-provider probe · base={BASE} · model={MODEL} · key=***")
    l1_direct_provider()
    if not args.direct_only:
        l2_healthz()
        l3_run_and_chat()
    print("[§AILIVE-1] ALL PASS —— 真 provider 三层链路接通（非 mock，脱敏，可复检）")


if __name__ == "__main__":
    main()
