import fs from 'node:fs';
const p = 'docs/LONG_TERM_PLAN.md';
let t = fs.readFileSync(p, 'utf8');
const item = fs.readFileSync('.nexus-tmp/item167.txt', 'utf8').replace(/\r/g, '').replace(/\n$/, '');

const old = '**5 条越过了这个被写下的界**：305、303、303、302、302 个 UTF-8 字节（各 300 字符）';
const neu = '**7 条越过了这个被写下的界**：305、303、303、302、302、302、301 个 UTF-8 字节（各 300 字符；v566 用同一个读取器复核，实为 7 条，见 addendum 540）';
let hits = 0;
for (let i = t.indexOf(old); i >= 0; i = t.indexOf(old, i + 1)) hits++;
if (hits !== 1) throw new Error('expected exactly one occurrence of the 5-count sentence, saw ' + hits);
t = t.split(old).join(neu);

const lines = t.split('\n');
const i = lines.findIndex((l) => l.startsWith('166. ~~'));
if (i < 0) throw new Error('item 166 line not found');
lines.splice(i + 1, 0, item);
fs.writeFileSync(p, lines.join('\n'), 'utf8');

const chk = fs.readFileSync(p, 'utf8');
console.log('CR', (chk.match(/\r/g) || []).length);
console.log('FFFD', chk.split('').filter((c) => c === String.fromCharCode(0xfffd)).length);
console.log('has167', chk.includes('167. ~~**v566'));
console.log('fixed166', chk.includes('**7 条越过了这个被写下的界**'));
console.log('fullwidth intact', (chk.match(/，/g) || []).length > 100, '， count');
console.log('line after 167 starts with 31.', chk.split('\n')[chk.split('\n').findIndex((l) => l.startsWith('167. ~~')) + 1].slice(0, 6));
