"""ADR-0312 · requirements.txt 必须纯 ASCII，否则换台机器就装不上。

2026-11-23 实测到的断裂：`bash infra/dev-ai.sh` 在这台中文 Windows 上直接死在 pip 里，
`UnicodeDecodeError: 'gbk' codec can't decode byte 0x84 in position 109`；脚本是
`set -euo pipefail`，所以死在读依赖这一步，uvicorn 根本没起来，3200 端口空响。
代码一行没错——错的是一行 UTF-8 中文注释。

门不能只钉"字节小于 0x80"这一条形式判据；它得说清楚被保护的性质是什么，
并且证明判据真咬得住。所以三臂各自独立：
1. 字节级判据（机器无关的规则本身）；
2. 性质：用 GBK 解出来的文本必须和用 UTF-8 解出来的一模一样（这才是"换机器不炸"的定义）；
3. 牙：拿当年那份中文注释重演一次，逼它真的解码失败——门要是抓不住原事故，门就是装饰。
"""

from __future__ import annotations

from pathlib import Path

REQUIREMENTS = Path(__file__).resolve().parents[1] / "requirements.txt"

#: pip 在没有 BOM、也没有 PEP263 coding 行时用的正是这个位置（见 ADR-0312 选项 B）。
LOCALE_STANDIN = "cp936"


def _raw() -> bytes:
    return REQUIREMENTS.read_bytes()


def _decode(data: bytes, encoding: str) -> str:
    """复刻 pip `req_file.py` 里 `auto_decode(f.read())` 的无 BOM 分支。

    不直接 import pip 的内部函数：那是钉在一个第三方实现的私有细节上，升级就散。
    """
    return data.decode(encoding)


def test_requirements_is_pure_ascii() -> None:
    """判据本体：一个字节都不能 >= 0x80。"""
    offenders = [(i, b) for i, b in enumerate(_raw()) if b >= 0x80]
    assert offenders == [], f"requirements.txt 第 {offenders[:5]} 处有非 ASCII 字节，pip 会按机器 locale 解码"


def test_gbk_and_utf8_agree_on_the_pinned_list() -> None:
    """被保护的性质：不管 locale 是 CP936 还是 UTF-8，读到的依赖清单必须是同一份。

    这条比第 1 臂更接近事故本身——它问的是"两台机器会不会装出两个不同的环境"。
    """
    data = _raw()
    assert _decode(data, LOCALE_STANDIN) == _decode(data, "utf-8")


def test_a_cjk_comment_would_actually_break_cp936() -> None:
    """牙：证明上面那条判据抓得住原事故，而不是碰巧通过。

    这里不读 git 历史（提交一次之后 HEAD 里就换新文件了，臂会自灭），
    而是把当年那行中文注释按 UTF-8 编码重演一遍——事故的形状，不是事故的引用。
    """
    reproduced = "# §162 Redis backend 的作业队列实现。\n".encode("utf-8")
    try:
        reproduced.decode(LOCALE_STANDIN)
    except UnicodeDecodeError:
        return
    raise AssertionError("重演失败：这行中文在 CP936 下竟然能解码，那么本门的判据保护不了任何东西")


def test_every_line_is_a_pin_and_each_pin_is_the_installed_version() -> None:
    """纯 ASCII 化是一次重写，重写有改坏格式的风险，改坏了不会报错——只会到运行时炸 import。

    判据不抄清单（抄一份进来就成了每次加依赖都要改的门），用两份独立真值：
    形状——非注释行只能是 `name==version`；来源——`importlib.metadata`，
    它读的是这个 venv 里真正装着的发行版，文件写错了名字或写了个本机没有的版本都会红。
    """
    from importlib import metadata

    lines = [line.strip() for line in _raw().decode("ascii").splitlines() if line.strip()]
    requirements = [line for line in lines if not line.startswith("#")]
    assert requirements, "清单空了——一个依赖都没有的 requirements 等于没装环境"

    for line in requirements:
        name, separator, version = line.partition("==")
        assert separator == "==", f"{line} 不是固定版本"
        assert version and version[0].isdigit(), f"{line} 版本号形状不对"
        assert metadata.version(name) == version, f"{line} 与本机 venv 实际装的版本不一致"
