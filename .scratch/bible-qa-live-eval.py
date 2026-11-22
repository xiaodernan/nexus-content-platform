import httpx, json, re, time, sys, hashlib

DIGEST_PATH = 'apps/ai-service/src/ai_service/canon_digest.txt'
RUNS_PER_QUESTION = 1

digest = open(DIGEST_PATH, 'r', encoding='utf-8').read()

# extract anchors (zh + en)
anchors = re.findall(r'\*\*锚句\*\*：\s*([^\n]+)', digest) + re.findall(r'\*\*Anchor sentence\*\*:\s*([^\n]+)', digest)
print('anchors extracted:', len(anchors))
print('digest chars:', len(digest))

QUESTIONS = [
    '问典：潮候院是什么地方？用中文答三句。',
    '问典：《盐灯守灵日记》里那盏盐灯谁在守？用中文答一句。',
    '问典：第四十一次大会散会之后发生了什么？用中文答两句。',
    '问典：世界大典为什么要锚句？用中文答两句。',
    '问典：沉香巷里那只桥每天只看什么？用中文答一句。',
    '问典：回廊尽头那只谜箱的谜面答案是什么？用中文答一句。',
    '问典：第九十九个数是什么意思？用中文答两句。',
    '问典：西门门岗上那位账房先生只认什么？用中文答一句。',
    '问典：祠殿风里那张圆桌留了几把椅子？用中文答一句。',
    '问典：低语诸王这个世界大典纪录的是什么？用中文答两句。',
    '问典：盐灯熄灭了怎么办？用中文答一句。',
    '问典：值更册里从没有写过的事是什么？用中文答一句。',
]

def overlap_ratio(answer: str) -> dict:
    """计算回答是否复用了锚句（逐字子串 ≥ 10 字符即算中）。返回三类计数与最长重合。"""
    longest = 0
    hits = []
    seen = set()
    for i, a in enumerate(anchors):
        a_clean = a.strip()
        if len(a_clean) < 10:
            continue
        # 找共同前缀/后缀/任意 10 字子串：保守做法——找答案里出现的最长锚句子串
        lo, found = 0, ''
        for L in (16, 12, 10):
            for s in range(0, max(1, len(a_clean) - L + 1)):
                seg = a_clean[s:s + L]
                if seg in answer and len(seg) > longest:
                    longest = len(seg)
                    found = seg
                    lo = L
                    break
            if longest >= lo:
                break
        if longest >= 10 and i not in seen:
            hits.append((i, found))
            seen.add(i)
    return {'longest': longest, 'hits': hits[:5]}

payload_path = '.scratch/bible-ask-live-eval-answers.json'
results = []
total_ms = 0
with httpx.Client(timeout=400.0) as c:
    for i, q in enumerate(QUESTIONS, start=1):
        body = {
            'requestId': f'eval-{i:02d}-' + hashlib.sha256(q.encode()).hexdigest()[:8],
            'system': digest,
            'user': q,
            'modelClass': 'balanced',
        }
        t0 = time.time()
        r = c.post('http://127.0.0.1:8001/v1/ai/chat', json=body)
        ms = int((time.time() - t0) * 1000)
        total_ms += ms
        out = {'q': q, 'status': r.status_code, 'ms': ms}
        if r.status_code == 200:
            d = r.json()
            text = d.get('text', '')
            u = d.get('usage', {})
            ov = overlap_ratio(text)
            out.update({
                'model': d.get('model'),
                'tokensIn': u.get('tokensIn'),
                'cachedTokens': u.get('cachedTokens'),
                'cacheReported': u.get('cacheReported'),
                'text': text,
                'longestVerbatimOverlap': ov['longest'],
                'anchorHits': ov['hits'],
            })
        else:
            out['body'] = r.text[:300]
        results.append(out)
        print(f"[{i:02d}] {r.status_code} {ms:>6}ms cached={out.get('cachedTokens')} verbatimHits={len(out.get('anchorHits', []))} overlap={out.get('longestVerbatimOverlap')} · {str(q)[:30]}")

with open(payload_path, 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

ok = sum(1 for r_ in results if r_['status'] == 200)
err = sum(1 for r_ in results if r_['status'] != 200)
anchored = sum(1 for r_ in results if r_.get('longestVerbatimOverlap', 0) >= 10)
total_cached = sum(r_.get('cachedTokens') or 0 for r_ in results)
total_in = sum(r_.get('tokensIn') or 0 for r_ in results)
print()
print(f'== summary ==')
print(f'ok={ok} err={err} · verbatim-anchored≥10字：{anchored}/{ok} 题 · 累计 tokensIn={total_in} cached={total_cached} ({(100*total_cached/total_in if total_in else 0):.1f}%) · total {total_ms}ms')
