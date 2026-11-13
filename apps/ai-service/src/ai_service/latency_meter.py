"""Process-local LLM latency meter (ADR 0126).

Honest bounds (the same honesty rule as completion_cache.py):
- process-local: counters zero on restart; never claimed to be global or durable
- fixed ring of the most recent 1024 completed round-trips: p50/p95/max/avg are
  exact over that window, not over "all time"
- a "call" is one provider round-trip (`Registry.llm.complete`), sync dials included;
  errors counts 502-class outcomes (provider exception or unparseable emission)
"""
from __future__ import annotations

import math
import threading
from collections import deque


class LatencyMeter:
    def __init__(self, window: int = 1024) -> None:
        self._lock = threading.Lock()
        self._samples: deque[float] = deque(maxlen=window)
        self.calls = 0
        self.errors = 0

    def record(self, seconds: float, *, failed: bool) -> None:
        with self._lock:
            self.calls += 1
            if failed:
                self.errors += 1
            if math.isfinite(seconds) and seconds >= 0:
                self._samples.append(seconds)

    def snapshot(self) -> dict[str, float | int]:
        with self._lock:
            ordered = sorted(self._samples)
            n = len(ordered)

            def pct(p: float) -> float:
                if n == 0:
                    return 0.0
                idx = max(0, min(n - 1, math.ceil(p * n) - 1))
                return ordered[idx]

            total = sum(ordered)
            return {
                "calls": self.calls,
                "errors": self.errors,
                "window": n,
                "avg_ms": round((total / n) * 1000, 1) if n else 0.0,
                "p50_ms": round(pct(0.50) * 1000, 1),
                "p95_ms": round(pct(0.95) * 1000, 1),
                "max_ms": round((ordered[-1] if n else 0.0) * 1000, 1),
            }


LLM_LATENCY = LatencyMeter()
