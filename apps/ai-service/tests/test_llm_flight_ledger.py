"""LLM 省钱账本门（v698 / ADR 0130；关闭 ADR 0128 仍欠 ② + ADR 0129 仍欠 ②）。

被测对象：`Registry.llm_flight_state()`、`metrics.render_llm_metrics()`、
`/healthz` 的 `llmFlight` 字段、`/metrics` 的 Prometheus 文本。

最要紧的诚实边界（本片所有判据都围绕它）：
- **coalesced ≠ cache hit**：合并省下的是一次重复调用，不是缓存命中；
  Prometheus 里必须是两个独立 family，绝不允许把 coalesced 加进 hits 去粉饰命中率。
- **两层 flight 分别计账、绝不相加**：`local.real_calls` 是"本地 leader 执行下一层"
  的次数，装了跨进程层时下一层可能只是 peek；真 provider 调用以
  `distributed.real_calls` 为准。若实现把两层相加造"总省了多少"，门必须红。
- **未启用就报 0，不编造流量**：`cache=None` / `flight=None` 时只发 `*_enabled 0`。
- **进程内、重启清零**：HELP 与文件头写明不是集群 SLO。

门纪律：判据纯函数单一真值（真组件路径 / 正向对照臂 / 变异臂共用）；
`render_llm_metrics` 是纯函数，门直接对拍字符串；真组件退化臂把 app 的渲染器
换掉，证明 `/metrics` 真的走的是被测纯函数而不是另一份手抄。
"""
from __future__ import annotations

import math
from typing import Any

import pytest
from fastapi.testclient import TestClient

from ai_service import app as app_module
from ai_service.app import create_app
from ai_service.completion_cache import CachedLlm, LlmCompletionCache
from ai_service.config import Settings
from ai_service.distributed_flight import CompositeFlight, DistributedSingleFlight
from ai_service.metrics import render_llm_metrics
from ai_service.providers.registry import Registry
from ai_service.single_flight import SingleFlight
from conftest import FakeProvider
from test_health import _validate

CACHE_ON = {
    "enabled": True, "backend": "redis", "hits": 12, "misses": 5,
    "stores": 5, "stores_failed": 1, "evictions": 0, "hit_rate": 12 / 17,
    "shared": True, "degraded": False, "namespace": "nexus:llmc",
}
FLIGHT_ON = {
    "enabled": True,
    "mode": "local+redis",
    "local": {"leaders": 4, "joined": 9, "coalesced": 9,
              "failures": 1, "timeouts": 2, "real_calls": 6},
    "distributed": {"leaders": 4, "joined": 2, "coalesced": 2,
                    "timeouts": 1, "self_served": 1, "lock_failures": 1,
                    "marker_failures": 0, "peek_misses": 1, "real_calls": 5},
    "provider_calls": 5,
    "note": "process-local counters",
}
LATENCY = {"calls": 5, "errors": 1, "window": 5, "avg_ms": 2100.0,
           "p50_ms": 2000.0, "p95_ms": 4000.0, "max_ms": 4200.0}


# ── 文本解析（测试侧工具，不改生产）────────────────────────────────────────

def _parse(text: str) -> dict[str, Any]:
    samples: dict[str, float] = {}
    helps: set[str] = set()
    types: set[str] = set()
    sample_lines = 0
    for line in text.splitlines():
        if line.startswith("# HELP "):
            helps.add(line.split(" ", 3)[2])
        elif line.startswith("# TYPE "):
            types.add(line.split(" ", 3)[2])
        elif line.strip() and not line.startswith("#"):
            name = line.split("{", 1)[0].split(" ", 1)[0]
            samples[name] = float(line.rsplit(" ", 1)[1])
            sample_lines += 1
    finite = all(math.isfinite(v) for v in samples.values())
    return {
        "samples": samples,
        "helps": helps,
        "types": types,
        "sample_lines": sample_lines,
        "finite": finite,
        "families_documented": set(samples) <= (helps | types) and helps == types,
        "process_local_disclaimer": "NOT fleet-wide" in text and "process-local" in text,
        "text": text,
    }


# ── 判据（单一真值）───────────────────────────────────────────────────────

def _judge_ledger_matches_truth(obs: dict[str, Any]) -> None:
    """读数必须逐项等于输入真值；不虚报命中、不把两层相加、不造集群 SLO。"""
    s = obs["samples"]
    cache, flight = obs["cache"], obs["flight"]
    assert obs["finite"] is True, "非有限数值混进了 Prometheus"
    assert obs["families_documented"] is True, "每个 family 都要有 HELP/TYPE"
    assert obs["process_local_disclaimer"] is True, "必须写明进程内、非集群 SLO"
    assert s["nexus_llm_cache_enabled"] == (1 if cache else 0)
    assert s["nexus_llm_flight_enabled"] == (1 if flight else 0)
    if cache:
        assert s["nexus_llm_cache_hits_total"] == cache["hits"], \
            "hits 被 coalesced 污染了：合并不是缓存命中"
        assert s["nexus_llm_cache_misses_total"] == cache["misses"]
        assert s["nexus_llm_cache_stores_failed_total"] == cache["stores_failed"]
        assert s["nexus_llm_cache_hit_rate"] == pytest.approx(cache["hit_rate"])
    if flight:
        local, dist = flight["local"], flight["distributed"]
        assert s["nexus_llm_flight_local_coalesced_total"] == local["coalesced"]
        assert s["nexus_llm_flight_local_timeouts_total"] == local["timeouts"]
        assert s["nexus_llm_flight_distributed_coalesced_total"] == dist["coalesced"]
        assert s["nexus_llm_flight_distributed_lock_failures_total"] == dist["lock_failures"]
        assert s["nexus_llm_flight_distributed_peek_misses_total"] == dist["peek_misses"]
        assert s["nexus_llm_provider_calls_total"] == flight["provider_calls"], \
            "真调用数必须取自最后接触 provider 的那一层"
        assert s["nexus_llm_provider_calls_total"] != local["real_calls"] + dist["real_calls"], \
            "两层相加了：local.real_calls 不是真 provider 调用"
    assert s["nexus_llm_latency_calls_total"] == obs["latency"]["calls"]


def _judge_disabled_layers_report_zero(obs: dict[str, Any]) -> None:
    """未启用：只报 enabled 0，绝不发看起来像"有流量"的 counter。"""
    s = obs["samples"]
    assert s["nexus_llm_cache_enabled"] == 0
    assert s["nexus_llm_flight_enabled"] == 0
    assert s["nexus_llm_provider_calls_total"] == 0
    assert not any(k.startswith("nexus_llm_cache_hits") for k in s)
    assert not any("coalesced" in k for k in s)
    assert obs["process_local_disclaimer"] is True


def _judge_label_escaping(obs: dict[str, Any]) -> None:
    """标签里的引号/换行必须转义，不能注入伪造成另一行样本。"""
    assert obs["escaped_quote_present"] is True, "引号没被转义"
    assert obs["no_injected_newline"] is True, "换行注入伪造成了新样本行"
    assert obs["sample_lines"] == obs["expected_sample_lines"], \
        "标签注入凭空多出/少了一行样本"


def _judge_health_flight_shape(obs: dict[str, Any]) -> None:
    assert obs["llm_flight"] is not None, "装了 flight 却报 null"
    f = obs["llm_flight"]
    assert f["enabled"] is True
    assert f["mode"] == obs["expected_mode"]
    assert (f["distributed"] is not None) == obs["expect_distributed"]
    if obs["expect_distributed"]:
        assert f["provider_calls"] == f["distributed"]["real_calls"], \
            "装了跨进程层还拿 local.real_calls 当真调用数"
    else:
        assert f["provider_calls"] == f["local"]["real_calls"]
    assert "coalesced is not a cache hit" in f["note"]


# ── 纯渲染器门（恒跑）─────────────────────────────────────────────────────

def _render(*, cache=None, flight=None, latency=None, service="nexus-ai-service") -> dict[str, Any]:
    text = render_llm_metrics(service=service, cache=cache, flight=flight,
                              latency=latency if latency is not None else LATENCY)
    parsed = _parse(text)
    parsed.update({"cache": cache, "flight": flight, "latency": latency if latency is not None else LATENCY})
    return parsed


def test_renderer_reports_the_honest_ledger():
    _judge_ledger_matches_truth(_render(cache=CACHE_ON, flight=FLIGHT_ON))


def test_disabled_layers_report_zero_not_fabricated_traffic():
    _judge_disabled_layers_report_zero(_render())


def test_non_finite_and_negative_values_are_rejected():
    for bad in (float("nan"), float("inf"), -1):
        with pytest.raises(ValueError):
            render_llm_metrics(service="s", cache=None, flight=None,
                               latency={**LATENCY, "p50_ms": bad})
    with pytest.raises(ValueError, match="布尔"):
        render_llm_metrics(service="s", cache=None, flight=None,
                           latency={**LATENCY, "calls": True})


def test_label_values_are_escaped_not_injected():
    evil = 'redis"\nnexus_fake_metric 999'
    baseline_lines = _render(cache={**CACHE_ON, "backend": "redis"},
                             flight=FLIGHT_ON)["sample_lines"]
    text = render_llm_metrics(service="s", cache={**CACHE_ON, "backend": evil},
                              flight=FLIGHT_ON, latency=LATENCY)
    _judge_label_escaping({
        "escaped_quote_present": 'redis\\"' in text,
        "no_injected_newline": "\nnexus_fake_metric 999" not in text,
        "sample_lines": _parse(text)["sample_lines"],
        "expected_sample_lines": baseline_lines,
    })


# ── 真组件：Registry 账本 / /healthz / /metrics ────────────────────────────

class _StubRedis:
    """够 DistributedSingleFlight 构造用的最小 client（本门不发真请求）。"""

    def set(self, name, value, *, nx=False, ex=None):
        return True

    def get(self, name):
        return None


def _registry_with_flight(*, distributed: bool) -> Registry:
    cache = LlmCompletionCache(ttl_s=60.0)
    inner = FakeProvider("{}")
    if distributed:
        remote = DistributedSingleFlight(
            _StubRedis(), peek=cache.get, namespace="nexus:test:ledger",
            wait_timeout_s=1.0, poll_interval_s=0.1, lease_s=2.0,
        )
        flight: Any = CompositeFlight(SingleFlight(wait_timeout_s=1.0), remote)
    else:
        flight = SingleFlight(wait_timeout_s=1.0)
    return Registry(Settings(), llm=CachedLlm(inner, cache, flight=flight))


def _drive(registry: Registry, inner: CachedLlm, calls: int = 3) -> None:
    for _ in range(calls):
        inner.complete(model="m", system="s", user="u")


@pytest.mark.parametrize("distributed,expected_mode", [(False, "local"), (True, "local+redis")])
def test_healthz_flight_state_matches_contract(distributed: bool, expected_mode: str):
    registry = _registry_with_flight(distributed=distributed)
    _drive(registry, registry.llm)
    client = TestClient(create_app(Settings(), registry=registry))
    body = client.get("/healthz").json()
    _validate("health.schema.json", body)
    _judge_health_flight_shape({
        "llm_flight": body["llmFlight"],
        "expected_mode": expected_mode,
        "expect_distributed": distributed,
    })


def test_metrics_endpoint_renders_the_same_truth_as_healthz():
    registry = _registry_with_flight(distributed=True)
    _drive(registry, registry.llm)
    client = TestClient(create_app(Settings(), registry=registry))
    response = client.get("/metrics")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    parsed = _parse(response.text)
    truth = registry.llm_flight_state()
    assert parsed["samples"]["nexus_llm_flight_enabled"] == 1
    assert parsed["samples"]["nexus_llm_provider_calls_total"] == truth["provider_calls"]
    assert parsed["samples"]["nexus_llm_flight_local_coalesced_total"] == truth["local"]["coalesced"]
    _judge_ledger_matches_truth({**parsed, "cache": registry.llm_cache_state(),
                                 "flight": truth,
                                 "latency": {"calls": parsed["samples"]["nexus_llm_latency_calls_total"]}})


def test_default_no_flight_reports_null_and_zero():
    client = TestClient(create_app(Settings(), registry=Registry(Settings())))
    body = client.get("/healthz").json()
    _validate("health.schema.json", body)
    assert body["llmFlight"] is None
    parsed = _parse(client.get("/metrics").text)
    _judge_disabled_layers_report_zero(parsed)


def test_arm_real_component_without_the_renderer_goes_red(monkeypatch):
    """把 app 的渲染器退化成"永远报 0"，/metrics 的账本必须被判据判红。"""
    registry = _registry_with_flight(distributed=True)
    _drive(registry, registry.llm)
    monkeypatch.setattr(
        app_module, "render_llm_metrics",
        lambda **kwargs: "# HELP nope x\n# TYPE nope gauge\nnexus_llm_flight_enabled 0\n",
    )
    client = TestClient(create_app(Settings(), registry=registry))
    parsed = _parse(client.get("/metrics").text)
    parsed["cache"] = registry.llm_cache_state()
    parsed["flight"] = registry.llm_flight_state()
    parsed["latency"] = {"calls": 0}
    with pytest.raises(AssertionError):
        _judge_ledger_matches_truth(parsed)


# ── 恒跑变异臂：证明判据有牙 ──────────────────────────────────────────────

def _good_obs() -> dict[str, Any]:
    return _render(cache=CACHE_ON, flight=FLIGHT_ON)


def test_arm_coalesced_inflating_cache_hits_goes_red():
    obs = _good_obs()
    obs["samples"]["nexus_llm_cache_hits_total"] += obs["flight"]["local"]["coalesced"]
    with pytest.raises(AssertionError, match="合并不是缓存命中"):
        _judge_ledger_matches_truth(obs)


def test_arm_summing_the_two_flight_layers_goes_red():
    obs = _good_obs()
    obs["samples"]["nexus_llm_provider_calls_total"] = (
        obs["flight"]["local"]["real_calls"] + obs["flight"]["distributed"]["real_calls"]
    )
    with pytest.raises(AssertionError):
        _judge_ledger_matches_truth(obs)


def test_arm_missing_process_local_disclaimer_goes_red():
    obs = _good_obs()
    obs["process_local_disclaimer"] = False
    with pytest.raises(AssertionError, match="进程内"):
        _judge_ledger_matches_truth(obs)


def test_arm_non_finite_goes_red():
    obs = _good_obs()
    obs["finite"] = False
    with pytest.raises(AssertionError):
        _judge_ledger_matches_truth(obs)


def test_arm_disabled_but_fabricated_traffic_goes_red():
    obs = _render()
    obs["samples"]["nexus_llm_cache_hits_total"] = 99.0
    obs["samples"]["nexus_llm_flight_local_coalesced_total"] = 99.0
    with pytest.raises(AssertionError):
        _judge_disabled_layers_report_zero(obs)


def test_arm_label_injection_goes_red():
    with pytest.raises(AssertionError, match="换行注入"):
        _judge_label_escaping({"escaped_quote_present": True,
                               "no_injected_newline": False,
                               "sample_lines": 11, "expected_sample_lines": 10})


def test_arm_correct_observations_are_green():
    """正向对照：判据不惩罚正确实现（ADR 0094 X4）。"""
    _judge_ledger_matches_truth(_good_obs())
    _judge_disabled_layers_report_zero(_render())
