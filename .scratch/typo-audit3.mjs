import { readFileSync } from 'node:fs';
const files = ['apps/web/src/lib/guideCopy.ts', 'apps/web/src/app/page.tsx', 'apps/web/src/studio/CommandBar.tsx'];
const lines = [];
for (const f of files) {
  for (const [i, l] of readFileSync(f, 'utf8').split('\n').entries()) {
    if (/[\u4e00-\u9fff]/.test(l) && /(['"`]|\>)[^'"`]*[\u4e00-\u9fff]/.test(l)) lines.push(`${f.split('/').pop()}:${i + 1} ${l.trim().slice(0, 130)}`);
  }
}
const chunks = [];
let cur = '';
for (const l of lines) { if ((cur + l).length > 3400) { chunks.push(cur); cur = ''; } cur += l + '\n'; }
if (cur) chunks.push(cur);
const system = '中文校对员。只找确凿错别字（形近/音近写错）。输出 JSON 数组 [{"original":"逐字片段","fixed":"正确片段"}]，没有就 []。不要围栏。';
for (const [idx, sample] of chunks.entries()) {
  const r = await fetch('http://127.0.0.1:3200/v1/ai/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId: 'typo-audit3-' + idx + '-' + Date.now(), system, user: sample, modelClass: 'balanced' }),
  });
  const o = await r.json();
  console.log('CHUNK', idx, 'status', r.status, 'chars', sample.length);
  console.log(o.text || JSON.stringify(o).slice(0, 300));
}
