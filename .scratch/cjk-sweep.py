import os
import re
import sys

# 扫描 apps/web/src/locale 模式之外的可疑中文混用：en 模板中是否出现中文（模板字面场景）。
CJK = re.compile(r'[一-鿿]')
root = 'apps/web/src'
en_fields = re.compile(r"^\s*en:\s*\{?|en:\s*'[^']*$|en:\s*\"", re.S)

hits = []
for dirpath, dirs, files in os.walk(root):
    if 'node_modules' in dirpath or 'world-bible' in dirpath:
        continue
    for f in files:
        if not f.endswith(('.tsx', '.ts')):
            continue
        p = os.path.join(dirpath, f)
        try:
            s = open(p, encoding='utf-8-sig', errors='replace').read()
        except Exception:
            continue
        # 找出包含 en: { 或 en: 的行范围
        lines = s.split('\n')
        current_en = 0
        for i, ln in enumerate(lines):
            if re.search(r"\ben:\s*\{", ln) or re.search(r"\ben:\s*'", ln):
                current_en += 1
                continue
            if current_en and (re.search(r"\bzh:\s*\{", ln) or re.search(r"^\s*\},\s*$", ln)):
                current_en -= 1
                continue
            if current_en and CJK.search(ln):
                hits.append((p, i + 1, ln.strip()[:110]))
for p, ln, txt in hits:
    print(f'{p}:{ln}: {txt}')
print(f'\ntotal suspicious CJK-in-en spots: {len(hits)}')
