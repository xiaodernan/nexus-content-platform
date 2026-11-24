import { describe, expect, it } from 'vitest';
import { auditStructure, parseModelIssues, renderAuditSection } from './i18n-audit.mts';

const section = (heading: string, body = ['Body']) => ({ heading, body });

describe('auditStructure', () => {
  it('accepts a complete bilingual pair', () => {
    expect(auditStructure([section('① Platform')], [section('① Platform', ['English body'])])).toEqual([]);
  });

  it('reports CJK text inside the English section', () => {
    expect(auditStructure([section('① Platform')], [section('① Platform', ['English 中文'])])).toEqual([
      { id: 'section-1', side: 'en', reason: '英文文案残留 CJK 字符：中' },
    ]);
  });

  it('reports paragraph-count drift instead of letting later paragraphs shift silently', () => {
    expect(auditStructure(
      [section('① Platform', ['第一段', '第二段'])],
      [section('① Platform', ['First paragraph'])],
    )).toContainEqual({
      id: 'section-1',
      side: 'en',
      reason: '正文段落数量不一致：zh=2，en=1',
    });
  });

  it('renders every paragraph for the explicit full-text model audit', () => {
    expect(renderAuditSection(section('① Platform', ['第一段', '第二段']))).toBe(
      '① Platform\n[1] 第一段\n[2] 第二段',
    );
  });

  it('reports ordinal, emptiness, duplicate and population defects', () => {
    const issues = auditStructure(
      [section('① Platform'), section('① Platform', [])],
      [section('② Platform')],
    );
    expect(issues.map((entry) => entry.reason)).toEqual(expect.arrayContaining([
      '章节数量不一致：zh=2，en=1',
      '章节序号不一致：zh=①，en=②',
      '章节标题或正文为空',
      '章节标题重复：① Platform',
    ]));
  });
});

describe('parseModelIssues', () => {
  it('accepts fenced JSON with a valid issue', () => {
    expect(parseModelIssues('```json\n{"issues":[{"id":"s1","side":"en","reason":"missing name"}]}\n```')).toEqual([
      { id: 's1', side: 'en', reason: 'missing name' },
    ]);
  });

  it('treats malformed model output as an audit infrastructure failure', () => {
    expect(() => parseModelIssues('not json')).toThrow('模型输出不是合法 JSON');
    expect(() => parseModelIssues('{"issues":[{"id":"s1","side":"other","reason":"bad"}]}')).toThrow('不符合 id/side/reason 契约');
  });
});
