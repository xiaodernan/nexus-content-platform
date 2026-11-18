#!/usr/bin/env node
/**
 * 生成 canon digest 文本（ai-service 发 provider 的字节级系统前缀）。
 *
 * 唯一真值：`apps/web/src/lib/bibleAsk.ts` 的 `SYSTEM_PROMPT`（世界大典 digest 的唯一构造点，
 * digest 本身来自 docs/world-bible/ —见 gen:bible-snapshot）。
 *
 * 产物（都提交入库）：
 *   apps/ai-service/src/ai_service/canon_digest.txt    —— SYSTEM_PROMPT 原文（UTF-8，LF）
 *   apps/ai-service/src/ai_service/canon_digest.sha256 —— 该文本的 sha256（pytest 校验漂移）
 *
 * 纪律：
 * - 任何一边漂移 → apps/ai-service/tests/test_canon_digest.py 红（§159：宁可红，不可假装一致）
 * - 数字与字节只认这里的实际读数，禁止手改产物（同 generated.ts 的纪律）
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { SYSTEM_PROMPT } from '../apps/web/src/lib/bibleAsk.ts';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'apps', 'ai-service', 'src', 'ai_service');
const TXT = join(OUT_DIR, 'canon_digest.txt');
const SHA = join(OUT_DIR, 'canon_digest.sha256');

const sha = createHash('sha256').update(SYSTEM_PROMPT, 'utf8').digest('hex');
mkdirSync(dirname(OUT_DIR), { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(TXT, SYSTEM_PROMPT, 'utf8');
writeFileSync(SHA, `${sha}\n`, 'utf8');
console.log(`✓ canon digest → ${TXT}`);
console.log(`  chars=${SYSTEM_PROMPT.length} sha256=${sha}`);
