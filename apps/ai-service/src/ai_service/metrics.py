"""ai-service 的 Prometheus 文本读数（v698 / ADR 0130）。

只暴露**本进程**已经真实记到的账：完成缓存 hits/misses、provider 往返延迟、
进程内 / 跨进程 single-flight 的合并与降级计数。六条诚实边界：

1. **不虚报命中**：`coalesced` 与 `hits` 是两个独立 family，绝不把合并算进缓存命中率。
2. **两层 flight 分开列**：`local` 的 real_calls 是"本地 leader 执行下一层"的次数，
   装了跨进程层时不等价于真 provider 调用；真调用数取自 `distributed.real_calls`。
   绝不把两层相加造一个"总省了多少"的假总数。
3. **未启用就报 0 而不是编造计数**：`cache=None` / `flight=None` 时只发
   `*_enabled 0`，不发任何看起来像"有流量"的 counter。
4. **进程内、重启清零**：HELP 文本与文件头都写明不是集群 SLO、不是持久账本。
5. **纯函数**：`render_llm_metrics` 只吃 dict、只产字符串，不读全局、不发网络，
   门可以直接对拍。
6. **标签转义**：服务名 / 后端 / 命名空间都按 Prometheus 规则转义，
   不让换行或引号注入伪造成另一行样本（计网侧的输入校验）。

非有限数值（NaN/Inf）显式抛 ValueError，不当成 0 静默吞掉（ADR 0114）。
"""
from __future__ import annotations

import math
from typing import Any

_HEADER = (
    "# NEXUS ai-service LLM ledger — process-local counters, reset on restart.\n"
    "# These are NOT fleet-wide SLOs: each replica reports only its own counters.\n"
    "# coalesced is a saved duplicate call, NOT a cache hit. The two flight layers\n"
    "# are reported separately and never summed.\n"
)

Sample = tuple[dict[str, str], int | float]


def _escape(value: Any) -> str:
    """Prometheus label 值转义：反斜杠 / 双引号 / 换行，顺序不能反。"""
    return str(value).replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _labels(pairs: dict[str, str]) -> str:
    if not pairs:
        return ""
    inner = ",".join(f'{k}="{_escape(v)}"' for k, v in sorted(pairs.items()))
    return "{" + inner + "}"


def _number(value: int | float) -> str:
    if isinstance(value, bool):
        raise ValueError("布尔不是计量值：不要把 True/False 当 1/0 发到 Prometheus")
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError("非有限数值不得静默当成 0：账本会悄悄失真")
    if value < 0:
        raise ValueError("账本计数不得为负")
    return str(value)


def _emit(lines: list[str], name: str, help_text: str, kind: str, samples: list[Sample]) -> None:
    lines.append(f"# HELP {name} {help_text}")
    lines.append(f"# TYPE {name} {kind}")
    for labels, value in samples:
        lines.append(f"{name}{_labels(labels)} {_number(value)}")


def _coerce(source: dict[str, Any] | None, key: str, default: int | float) -> int | float:
    raw = (source or {}).get(key, default) or default
    # True/False 不是计量值：bool 是 int 的子类，int(True)=1 会把"开关"悄悄记成一次调用。
    if isinstance(raw, bool):
        raise ValueError("布尔不是计量值：不要把 True/False 当 1/0 发到 Prometheus")
    return raw


def _int(source: dict[str, Any] | None, key: str) -> int:
    return int(_coerce(source, key, 0))


def _num(source: dict[str, Any] | None, key: str) -> float:
    return float(_coerce(source, key, 0.0))


def render_llm_metrics(
    *,
    service: str,
    cache: dict[str, Any] | None,
    flight: dict[str, Any] | None,
    latency: dict[str, Any] | None,
) -> str:
    """把 /healthz 同一份真值渲染成 Prometheus 文本；纯函数，不读全局。"""
    lines: list[str] = [_HEADER.rstrip("\n")]
    _emit(lines, "nexus_ai_service_info", "Static labels for this ai-service process.",
          "gauge", [({"service": service}, 1)])

    _emit(lines, "nexus_llm_cache_enabled", "1 if an application-level completion cache is wired.",
          "gauge", [({}, 1 if cache else 0)])
    if cache:
        labels = {"backend": str(cache.get("backend", "unknown"))}
        for name, key in (
            ("hits", "hits"), ("misses", "misses"), ("stores", "stores"),
            ("stores_failed", "stores_failed"), ("evictions", "evictions"),
        ):
            _emit(lines, f"nexus_llm_cache_{name}_total",
                  f"Process-local completion-cache {name}; reset on restart.",
                  "counter", [(labels, _int(cache, key))])
        _emit(lines, "nexus_llm_cache_hit_rate",
              "Process-local completion-cache hit rate over recorded requests.",
              "gauge", [(labels, _num(cache, "hit_rate"))])

    lat = latency or {}
    _emit(lines, "nexus_llm_latency_calls_total",
          "Real provider round-trips recorded by this process (cache replays excluded).",
          "counter", [({}, _int(lat, "calls"))])
    _emit(lines, "nexus_llm_latency_errors_total",
          "Failed provider round-trips recorded by this process.",
          "counter", [({}, _int(lat, "errors"))])
    for name in ("window", "avg_ms", "p50_ms", "p95_ms", "max_ms"):
        kind = "gauge"
        _emit(lines, f"nexus_llm_latency_{name}",
              f"Process-local latency {name} over the most recent ring buffer.",
              kind, [({}, _num(lat, name))])

    _emit(lines, "nexus_llm_flight_enabled", "1 if single-flight coalescing is wired.",
          "gauge", [({}, 1 if flight else 0)])
    provider_calls = 0
    if flight:
        mode = str(flight.get("mode", "local"))
        local = flight.get("local") or {}
        distributed = flight.get("distributed") or {}
        for name in ("leaders", "joined", "coalesced", "failures", "timeouts", "real_calls"):
            _emit(lines, f"nexus_llm_flight_local_{name}_total",
                  f"In-process single-flight {name}; leaders/real_calls count executions of the next layer.",
                  "counter", [({"mode": mode}, _int(local, name))])
        if distributed:
            for name in ("leaders", "joined", "coalesced", "timeouts", "self_served",
                         "lock_failures", "marker_failures", "peek_misses", "real_calls"):
                _emit(lines, f"nexus_llm_flight_distributed_{name}_total",
                      f"Cross-process single-flight {name}; real_calls is the honest provider-call count.",
                      "counter", [({"mode": mode}, _int(distributed, name))])
        # 真调用只认"最后接触 provider 的那一层"，绝不相加（ADR 0129 账本口径）。
        provider_calls = _int(distributed, "real_calls") if distributed else _int(local, "real_calls")
    _emit(lines, "nexus_llm_provider_calls_total",
          "Real LLM provider calls made by this process; cache hits and coalesced followers excluded.",
          "counter", [({}, provider_calls)])
    return "\n".join(lines) + "\n"
