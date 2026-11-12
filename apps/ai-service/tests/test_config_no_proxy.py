"""环境里的 NO_PROXY 写法不该决定服务起不起得来（§AILIVE-3 实测撞到的）。"""

from __future__ import annotations

import os

import httpx
import pytest

from ai_service.config import load_settings, sanitize_no_proxy


def test_ipv6_literal_in_no_proxy_is_stripped_but_scope_survives() -> None:
    env = {"NO_PROXY": "localhost,.localhost,127.0.0.1,127.0.0.0/8,[::1],::1"}
    changed = sanitize_no_proxy(env)
    assert env["NO_PROXY"] == "localhost,.localhost,127.0.0.1,127.0.0.0/8,::1,::1"
    assert changed and changed[0][0] == "NO_PROXY"
    # 主机名、通配域、CIDR 段都原样保留：只动方括号这一种写法
    assert "127.0.0.0/8" in env["NO_PROXY"]


def test_clean_value_is_left_alone_and_reported_as_unchanged() -> None:
    env = {"NO_PROXY": "localhost,127.0.0.1", "no_proxy": ""}
    assert sanitize_no_proxy(env) == []
    assert env["NO_PROXY"] == "localhost,127.0.0.1"


def test_lowercase_key_is_covered_too() -> None:
    env = {"no_proxy": "[::1],localhost"}
    sanitize_no_proxy(env)
    assert env["no_proxy"] == "::1,localhost"


def test_the_real_failure_mode_without_the_fix(monkeypatch: pytest.MonkeyPatch) -> None:
    """这一臂钉的是"为什么需要这个函数"：httpx 见到 [::1] 会在构造 Client 时就抛。

    不这样写的话，测试只证明我们自己那半逻辑；这一臂证明对面确实会炸，
    于是清洗不是防御性装饰，而是把导入期的 InvalidURL 挡在门外。
    """
    monkeypatch.setenv("NO_PROXY", "localhost,[::1]")
    with pytest.raises(httpx.InvalidURL) as excinfo:
        httpx.Client(base_url="https://api.example/v1", transport=None)
    assert "Invalid port" in str(excinfo.value)


def test_load_settings_leaves_a_usable_environment_for_httpx(monkeypatch: pytest.MonkeyPatch) -> None:
    """清洗发生在建 provider 之前：这条臂走真实顺序，最后真的构造一个 Client。"""
    monkeypatch.setenv("NO_PROXY", "localhost,.localhost,127.0.0.1,127.0.0.0/8,[::1],::1")
    monkeypatch.setenv("NEXUS_OPENAI_API_KEY", "sk-test-value")
    monkeypatch.setenv("NEXUS_OPENAI_BASE_URL", "https://api.example/v1")
    settings = load_settings()  # environ=None → 走真 os.environ，触发清洗
    assert settings.openai_api_key == "sk-test-value"
    assert "[" not in os.environ["NO_PROXY"]
    client = httpx.Client(base_url=settings.openai_base_url, timeout=1.0)  # 清洗没生效就在这里炸
    # httpx 对无 path 的 base_url 补尾随斜杠——实际出站 URL 仍是这台主机/这份路径；
    # 钉的是“构造成功且 host 没变”，不是 httpx 的字符串形式
    assert str(client.base_url) == "https://api.example/v1/"
    assert settings.openai_api_key == "sk-test-value"
    client.close()


def test_explicit_environ_snapshot_is_not_mutated() -> None:
    """传进来的 environ 是调用方的现场（测试常用），不该被顺手改掉。"""
    snapshot = {"NO_PROXY": "[::1]", "NEXUS_OPENAI_API_KEY": "sk-test-value"}
    load_settings(snapshot)
    assert snapshot["NO_PROXY"] == "[::1]"
