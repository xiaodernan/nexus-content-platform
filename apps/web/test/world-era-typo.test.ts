import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 2026-11-21 真错别字门：世界四张面把「纪元」写成了形近的「纶元」（24 处，全是用户看得见的字）。
 * 这是用户点名的"系统性修错别字"里少数真命中的一处；门钉的是字面，防止改文案时又写回去。
 */
const ROOT = process.cwd();
const FILES = [
  'apps/web/src/components/ChronicleView.tsx',
  'apps/web/src/app/world/[projectId]/codex/page.tsx',
  'apps/web/src/app/world/[projectId]/digest/page.tsx',
  'apps/web/src/app/world/[projectId]/integrity/page.tsx',
];

describe('世界四张面：纪元不写作纶元', () => {
  for (const rel of FILES) {
    it(rel, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      expect(src).not.toContain('纶元');
      expect(src.length).toBeGreaterThan(100);
    });
  }
});
