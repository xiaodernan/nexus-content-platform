"""latency_meter 的契约：窗口有界、错误计数、百分位正确（ADR 0126）。"""
from ai_service.latency_meter import LatencyMeter


def test_empty_window_reports_zeros_but_counts_calls() -> None:
    meter = LatencyMeter()
    meter.record(1.5, failed=False)
    snap = meter.snapshot()
    assert snap["calls"] == 1
    assert snap["errors"] == 0
    assert snap["window"] == 1
    assert snap["p50_ms"] == 1500.0
    assert snap["p95_ms"] == 1500.0
    assert snap["max_ms"] == 1500.0
    assert snap["avg_ms"] == 1500.0


def test_errors_and_percentiles_nearest_rank() -> None:
    meter = LatencyMeter(window=100)
    for _ in range(50):
        meter.record(1.0, failed=False)
    for _ in range(45):
        meter.record(2.0, failed=False)
    for _ in range(5):
        meter.record(10.0, failed=True)
    snap = meter.snapshot()
    assert snap["calls"] == 100
    assert snap["errors"] == 5
    assert snap["window"] == 100
    # nearest-rank: p50 -> sample 50 -> 1.0s ; p95 -> sample 95 -> 2.0s ; max -> 10s
    assert snap["p50_ms"] == 1000.0
    assert snap["p95_ms"] == 2000.0
    assert snap["max_ms"] == 10000.0
    assert snap["avg_ms"] == round((50 * 1.0 + 45 * 2.0 + 5 * 10.0) / 100 * 1000, 1)


def test_window_is_capped() -> None:
    meter = LatencyMeter(window=10)
    for i in range(50):
        meter.record(float(i), failed=False)
    snap = meter.snapshot()
    assert snap["calls"] == 50
    assert snap["window"] == 10
    assert snap["max_ms"] == 49000.0


def test_non_finite_samples_are_ignored() -> None:
    meter = LatencyMeter()
    meter.record(float("nan"), failed=False)
    meter.record(-1.0, failed=False)
    meter.record(0.25, failed=False)
    snap = meter.snapshot()
    assert snap["calls"] == 3
    assert snap["window"] == 1
    assert snap["p50_ms"] == 250.0
