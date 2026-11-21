/**
 * §CTX-TIER · 分层上下文前缀门（2026-11-20）
 *
 * 守两件事：
 * 1. 数据复核路由只能用轻量身份前缀（~0.4K token），不再无谓挂 171K token 的大典正文；
 * 2. 真正问典的链路仍然挂字节稳定的全量 SYSTEM_PROMPT——不能被这次优化顺手削掉。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  canonIdentityPrelude,
  canonPrelude,
  CANON_IDENTITY_MAX_CHARS,
} from '../src/lib/canonPrefix';
import { SYSTEM_PROMPT } from '../src/lib/bibleAsk';

const LABEL = { zh: '--- 复核对象：平台实测指标 ---', en: '--- Subject: measured platform metrics ---' };

describe('§CTX-TIER 轻量身份前缀', () => {
  it('远小于契约上限，且与 265K 大典前缀不同一个量级', () => {
    const zh = canonIdentityPrelude('zh', LABEL);
    const en = canonIdentityPrelude('en', LABEL);
    expect(zh.length).toBeLessThan(CANON_IDENTITY_MAX_CHARS);
    expect(en.length).toBeLessThan(CANON_IDENTITY_MAX_CHARS);
    expect(zh.length).toBeLessThan(SYSTEM_PROMPT.length / 100);
    expect(en.length).toBeLessThan(SYSTEM_PROMPT.length / 100);
  });

  it('同一 locale 逐字节稳定（KV 前缀可复用）', () => {
    expect(canonIdentityPrelude('zh', LABEL)).toBe(canonIdentityPrelude('zh', LABEL));
    expect(canonIdentityPrelude('en', LABEL)).toBe(canonIdentityPrelude('en', LABEL));
    expect(canonIdentityPrelude('zh', LABEL)).not.toBe(canonIdentityPrelude('en', LABEL));
  });

  it('两种语言各自成篇：不中英夹杂', () => {
    const zh = canonIdentityPrelude('zh', LABEL);
    const en = canonIdentityPrelude('en', LABEL);
    expect(zh).toContain('纪律：');
    expect(zh).not.toContain('Rules:');
    expect(en).toContain('Rules:');
    expect(en).not.toContain('纪律：');
  });

  it('数字纪律与「数据不足」 guard 都在', () => {
    expect(canonIdentityPrelude('zh', LABEL)).toContain('不编造数字');
    expect(canonIdentityPrelude('zh', LABEL)).toContain('数据不足');
    expect(canonIdentityPrelude('en', LABEL)).toContain('no invented numbers');
    expect(canonIdentityPrelude('en', LABEL)).toContain('insufficient data');
  });

  it('payloadLabel 只按 locale 取一个，不泄漏另一语言', () => {
    const label = { zh: '中文标签', en: 'ENGLISH LABEL' };
    expect(canonIdentityPrelude('zh', label)).toContain('中文标签');
    expect(canonIdentityPrelude('zh', label)).not.toContain('ENGLISH LABEL');
    expect(canonIdentityPrelude('en', label)).toContain('ENGLISH LABEL');
    expect(canonIdentityPrelude('en', label)).not.toContain('中文标签');
  });
});

describe('§CTX-TIER 路由分流', () => {
  const DATA_REVIEW_ROUTES = [
    'app/api/admin/observer/digest/route.ts',
    'app/api/ai/deep-read/route.ts',
    'app/api/discover/interest/route.ts',
    'app/api/editor-note/route.ts',
    'app/api/marketplace/picks/route.ts',
    'app/api/notifications/digest/route.ts',
    'app/api/pulse/review/route.ts',
  ];

  it.each(DATA_REVIEW_ROUTES)('%s 只用轻量前缀，不再挂全量大典', (rel) => {
    const src = readFileSync(resolve(__dirname, '../src', rel), 'utf-8');
    expect(src).toContain('canonIdentityPrelude');
    expect(src).not.toMatch(/\bcanonPrelude\b/);
  });

  it('问典链路仍保留全量前缀（cut 没有误伤）', () => {
    expect(canonPrelude('zh', LABEL)).toContain(SYSTEM_PROMPT);
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(200_000);
  });
});
