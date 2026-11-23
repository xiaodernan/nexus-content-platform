import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const redact = (s: string): string =>
  s
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
const page = readFileSync('apps/web/src/app/bible/ask/page.tsx', 'utf8');
const comp = readFileSync('apps/web/src/components/BibleAsk.tsx', 'utf8');
console.log('page:', createHash('sha256').update(redact(page)).digest('hex'));
console.log('comp:', createHash('sha256').update(redact(comp)).digest('hex'));
