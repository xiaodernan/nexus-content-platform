"""并轨用：把 origin/master 的 Echo 211–215 整体后移两位 → 213–217。

为什么：main 线在它们前面多了两篇（E210 半枚潮印、E211 合到第四十二道上），
main 的 E210《第四十三道》已改号为 E212，于是 master 的 E211–E215 与 main 撞号。
按叙事顺序（浅痕 → 半枚潮印 → 第四十二道 → 第四十三道 → 新痕不占第四十四道 → …）
整体后移两位，正文里的「写给 E2xx 之后」与「同 E206–E2xx」同步 +2。
"""
import io
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ECHOES = os.path.join(ROOT, 'docs', 'world-bible', 'echoes')

CN = {
    211: '二百一十一', 212: '二百一十二', 213: '二百一十三', 214: '二百一十四',
    215: '二百一十五', 216: '二百一十六', 217: '二百一十七',
}


def renumber(old: int, new: int) -> None:
    names = [n for n in os.listdir(ECHOES) if n.startswith(f'E{old}-')]
    assert len(names) == 2, (old, names)
    for name in sorted(names, reverse=True):
        dst = name.replace(f'E{old}-', f'E{new}-', 1)
        subprocess.run(['git', 'mv', os.path.join(ECHOES, name), os.path.join(ECHOES, dst)], check=True)
    prev_old, prev_new = old - 1, new - 1
    for name in sorted(names):
        path = os.path.join(ECHOES, name.replace(f'E{old}-', f'E{new}-', 1))
        text = io.open(path, encoding='utf-8').read()
        before = text
        # 1) 前驱引用：写给 E{old-1} 之后 → 写给 E{new-1} 之后
        text = text.replace(f'Written after E{prev_old}:', f'Written after E{prev_new}:')
        # 2) 纪元范围：同 E206–E{old-1} → 同 E206–E{new-1}
        text = text.replace(f'E206–E{prev_old}', f'E206–E{prev_new}')
        # 3) 中文标题的「其二百一十一」
        text = text.replace(f'其{CN[old]}', f'其{CN[new]}')
        # 4) 英文标题的 (No. 211)
        text = text.replace(f'(No. {old})', f'(No. {new})')
        assert text != before, path
        io.open(path, 'w', encoding='utf-8', newline='\n').write(text)
        print(f'E{old} → E{new}: {os.path.basename(path)}')


for old in (215, 214, 213, 212, 211):
    renumber(old, old + 2)
