# ADR 0312 · requirements.txt 只准写 ASCII：pip 用机器 locale 解码它

日期：2026-11-23
状态：已采纳
相关：ADR 0311（成本账的两种黑）、`infra/dev-ai.sh`、README「重启 = `bash infra/dev-ai.sh`」

## 背景

按 §COST-2 收尾要读第五本账，需要 ai-service 起着。照 README 那行跑：

```
$ bash infra/dev-ai.sh
UnicodeDecodeError: 'gbk' codec can't decode byte 0x84 in position 109
```

脚本第 24 行 `pip install -q -r requirements.txt` 直接死，而 `set -euo pipefail`
让它在 `exec uvicorn` **之前**就退出——端口 3200 空响，`/healthz` 拿不到任何东西。
代码一行没错，错的是一份 UTF-8 中文注释。

根因不在我们代码里，在 pip 的读法上（本机 `.venv` 的 pip 24.0，`_internal/utils/encoding.py:20-36`，
调用点 `_internal/req/req_file.py:551`）：

```python
for bom, encoding in BOMS:            # 没有 BOM
    ...
for line in data.split(b"\n")[:2]:    # 前两行没有 coding 声明
    ...
return data.decode(locale.getpreferredencoding(False) or sys.getdefaultencoding())
```

也就是：`requirements.txt` **没有**「UTF-8 默认」这回事。中文 Windows 上
`locale.getpreferredencoding(False)` 是 `cp936`，UTF-8 写下的三字节中文不是合法的 GBK 序列，
于是装依赖这一步变成解码异常。同一份文件在英文 Linux 上一直好好的——这正是最坏的一类缺陷：
只在某个 locale 上坏，而那个 locale 恰好是本机的主力开发机。

## 选项

**A. 什么都不做，靠人记住。**
约束只存在于口头。下一个往注释里写中文的人（包括未来的我）不会收到任何提示。

**B. 文件首行加 `# -*- coding: utf-8 -*-`。**
pip 那个 PEP263 分支真的支持，改动一个字节就够。但两条代价：①它只保证 pip 这一条读径，
别的工具（编辑器、脚本、人）仍按各自 locale 读；②它把「内容随便写」的口子留着，
而本仓库已经实测到编辑工具会**静默改写全角标点**——依赖一行声明来兜住整份文件的可移植性，
不如让文件根本没有非 ASCII 字节。

**C. 在 `dev-ai.sh` 里设 `PYTHONUTF8=1`。**
能治，但爆炸半径不对：它改的是整个解释器的默认编码，ai-service 里任何按默认编码读文件的代码
都会跟着变；而且手敲 `pip install -r` 的人不经过这个脚本，事故照旧。为了一个文件的读法去改
解释器全局，方向反了。

**D. 文件只写 ASCII，并钉一道字节级的门。**（选它）

## 决定

D。`apps/ai-service/requirements.txt` 全部内容（含注释）字节值必须 < 0x80。

门在 `apps/ai-service/tests/test_requirements_ascii.py`，四臂各管一件事，不做重复劳动：

1. **判据本体**——逐字节找 `>= 0x80`，红的时候直接报出偏移，不用人去 hexdump；
2. **被保护的性质**——同一份字节用 `cp936` 解出来的文本必须与用 `utf-8` 解出来的**完全相等**。
   这才是「换机器不炸」的定义，比「字节小于 0x80」更接近事故；
3. **牙**——把当年那行中文注释按 UTF-8 重演一遍，逼它在 `cp936` 下真的抛
   `UnicodeDecodeError`。这一臂不读文件，所以它永远绿；它的作用是：如果哪天 Python 或编码表变了，
   导致「非 ASCII 会炸」这个前提不再成立，第 1、2 臂就成了装饰，而这一臂先红。**它不复制清单，
   复制的是事故的形状**；
4. **重写没弄坏依赖**——非注释行必须仍是 `name==version`，且每个 pin 等于本机 venv
   实际装着的版本（`importlib.metadata`）。判据取自第三方发行元数据而不是抄一份表进测试，
   所以加依赖不用改门，写错包名或写了本机没有的版本一定会红。

## 后果

- `bash infra/dev-ai.sh` 恢复可用：`pip install -q -r requirements.txt` 在 `locale=cp936`
  上实测通过，服务起到 `Application startup complete`，`/healthz` 返回 `capability: real`。
  验证走的是崩溃那一步本身，没有为了一个注释重启整个服务。
- **第一次修复其实没修干净，是门抓出来的。** 我把它改成「ASCII only」并记下重启成功，
  但注释里留着 `§162`。`§` 的 UTF-8 是 `0xC2 0xA7`，而这**恰好是合法的 GBK 双字节序列**——
  于是 pip 不再报错，只是解出另一个字符。也就是说那份文件当时是「靠运气不炸」，
  不是「按设计不炸」；再补一个三字节的中文就回到原事故。第 1 臂当场红了两次：
  一次抓到原来的 `§162`，一次抓到我为解释这个坑而写进注释的字面 `§`。
  这个「说明为什么不能写 `§` 的注释本身含 `§`」正是本 ADR 值得留下的一条。
- 注释里从此只能提「section sign」，不能印那个字符。
- 同一类 hazard 仍然存在但**不在本片范围**：任何 `open()` 不传 `encoding=` 的代码都有
  locale 依赖。本片只管 `requirements.txt` 这一条已被实测打断的路径，不顺手做全仓审计
  （那需要另一份决策和另一道门）。
- 门跟着 `npm run test:ai-service` 跑，不需要新脚本、新 CI job。
