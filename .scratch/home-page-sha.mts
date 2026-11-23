import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** 与 apps/web/test/home-visual-style.test.ts 的 maskLiterals/stripClassNames 逐字一致 */
function maskLiterals(expr: string): string {
  let out = '';
  let i = 0;
  while (i < expr.length) {
    const c = expr[i]!;
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      out += q; i++;
      let staticSegStarted = false;
      while (i < expr.length) {
        if (expr[i] === '\\') { out += expr[i]! + (expr[i + 1] ?? ''); i += 2; continue; }
        if (q === '`' && expr[i] === '$' && expr[i + 1] === '{') {
          out += '${'; i += 2;
          let d = 1;
          let inner = '';
          while (i < expr.length && d > 0) {
            const cc = expr[i]!;
            if (cc === "'" || cc === '"' || cc === '`') {
              const iq = cc; inner += cc; i++;
              while (i < expr.length) {
                if (expr[i] === '\\') { inner += expr[i]! + (expr[i + 1] ?? ''); i += 2; continue; }
                if (expr[i] === iq) { inner += iq; i++; break; }
                inner += expr[i]!; i++;
              }
              continue;
            }
            if (cc === '{') d++;
            else if (cc === '}') { d--; if (d === 0) { inner += cc; i++; break; } }
            inner += cc; i++;
          }
          out += maskLiterals(inner);
          staticSegStarted = false;
          continue;
        }
        if (expr[i] === q) { out += q; i++; break; }
        if (!staticSegStarted) { out += '@'; staticSegStarted = true; }
        i++;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}

function stripClassNames(src: string): string {
  const s = src.replace(/\r\n/g, '\n');
  let out = '';
  let i = 0;
  for (;;) {
    const k = s.indexOf('className=', i);
    if (k < 0) { out += s.slice(i); break; }
    out += s.slice(i, k + 'className='.length);
    let j = k + 'className='.length;
    while (s[j] === ' ') { out += s[j]!; j++; }
    if (s[j] === '"' || s[j] === "'") {
      const q = s[j]!;
      const e = s.indexOf(q, j + 1);
      out += q + '@' + q;
      j = e + 1;
    } else if (s[j] === '{') {
      let depth = 0;
      let q = j;
      let expr = '';
      for (; q < s.length; q++) {
        const c = s[q]!;
        if (c === "'" || c === '"' || c === '`') {
          const strQ = c; expr += c; q++;
          while (q < s.length) {
            if (s[q] === '\\') { expr += s[q]! + (s[q + 1] ?? ''); q += 2; continue; }
            if (s[q] === strQ) { expr += strQ; q++; break; }
            expr += s[q]!; q++;
          }
          q--; continue;
        }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { expr += c; q++; break; } }
        expr += c;
      }
      out += '{' + maskLiterals(expr.slice(1, -1)) + '}';
      j = q;
    } else { out += s[j]!; j++; }
    i = j;
  }
  return out;
}

const page = readFileSync('apps/web/src/app/page.tsx', 'utf8');
console.log('STRIP_CLASS_SHA256:', createHash('sha256').update(stripClassNames(page).trimEnd()).digest('hex'));
