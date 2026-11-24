"""2026-11-19 的历史探针：经 Clash 7897 测 prompt_cache_key / KV 命中。

§192 证据入册说明（2026-11-23）：
  * 原文件把 API key 明文硬编码在第 16 行——密钥不进版本库，改成环境变量注入。
  * 上游 API 已于 2026-11-23 因成本关闭，脚本不再可跑；这里保留**原始探针形状**
    作为历史证据，不伪造任何返回。没有 NEXUS_API_KEY 时直接报错退出。
  * 模型名 `gpt-6.1-sol` 是当时的真实取值，不是笔误，作为历史事实保留。
"""
import httpx, sys, time, json, hashlib, os

DIGEST_PATH = 'apps/ai-service/src/ai_service/canon_digest.txt'
API_KEY_ENV = 'NEXUS_API_KEY'

def main():
    api_key = os.environ.get(API_KEY_ENV, '').strip()
    if not api_key:
        print(f'SKIP · 本探针需要环境变量 {API_KEY_ENV}（密钥不进版本库）。'
              '上游 API 已于 2026-11-23 关闭，历史读数见 docs/CURRENT-STATE.md。')
        return 2
    digest = open(DIGEST_PATH, 'r', encoding='utf-8').read()
    print('digest chars:', len(digest))
    system = digest
    questions = ['问典：《Salt Lamp Vigil Diary》里那盏盐灯谁在守？用中文答一句。']
    for i, q in enumerate(questions, start=1):
        body = {'model': 'gpt-6.1-sol', 'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': q}]}
        try:
            t0 = time.time()
            client = httpx.Client(proxy='http://127.0.0.1:7897', timeout=400.0)
            r = client.post('https://api.aizzz.xyz/v1/chat/completions',
                            headers={'Authorization': 'Bearer ' + api_key,
                                     'content-type': 'application/json',
                                     'prompt_cache_key': 'nexus-' + hashlib.sha256(digest.encode('utf-8')).hexdigest()[:16]},
                            json=body)
            ms = int((time.time() - t0) * 1000)
            if r.status_code == 200:
                data = r.json()
                u = data.get('usage', {})
                pt = u.get('prompt_tokens') or 0
                cached = (u.get('prompt_tokens_details') or {}).get('cached_tokens')
                completion = u.get('completion_tokens') or 0
                print(f'call#{i}: status=200  ms={ms}  tokensIn={pt}  cached={cached}  completion={completion}')
                print('  response preview:', (data['choices'][0].get('message') or {}).get('content', '')[:200])
            else:
                print(f'call#{i}: status={r.status_code} body={r.text[:200]}')
        except Exception as e:
            print(f'call#{i}: ERR {type(e).__name__} {str(e)[:300]}')

if __name__ == '__main__':
    sys.exit(main() or 0)
