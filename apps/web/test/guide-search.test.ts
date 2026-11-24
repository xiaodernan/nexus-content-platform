import { describe, expect, it } from 'vitest';
import { GUIDE_COPY } from '../src/lib/guideCopy';
import { searchGuideSections } from '../src/lib/guideSearch';

describe('内置说明书本地检索', () => {
  it('空查询返回原顺序的完整目录副本', () => {
    const sections = GUIDE_COPY.zh.sections;
    const all = searchGuideSections(sections, '  \n\t ');
    expect(all).toEqual(sections);
    expect(all).not.toBe(sections);
  });

  it('按标题或正文做不区分大小写的字面匹配', () => {
    const sections = [
      { heading: '① Save', body: ['Use Cmd/Ctrl+S.'] },
      { heading: '② Publish', body: ['Choose Public, Unlisted or Private.'] },
    ];
    expect(searchGuideSections(sections, 'save')).toEqual([sections[0]]);
    expect(searchGuideSections(sections, 'UNLISTED')).toEqual([sections[1]]);
  });

  it('统一全角、空白与大小写，但不做语义猜测', () => {
    const sections = [{ heading: '保存', body: ['Ctrl S 保存当前设计。'] }];
    expect(searchGuideSections(sections, 'ＳＡＶＥ')).toEqual([]);
    expect(searchGuideSections(sections, '保存')).toEqual([sections[0]]);
    expect(searchGuideSections(sections, '怎么让别人看到')).toEqual([]);
  });

  it('中英真实字典都能找到发布与撤销说明', () => {
    expect(searchGuideSections(GUIDE_COPY.zh.sections, '发布').length).toBeGreaterThan(0);
    expect(searchGuideSections(GUIDE_COPY.en.sections, 'publish').length).toBeGreaterThan(0);
    expect(searchGuideSections(GUIDE_COPY.zh.sections, '撤销').length).toBeGreaterThan(0);
    expect(searchGuideSections(GUIDE_COPY.en.sections, 'undo').length).toBeGreaterThan(0);
  });

  it('未知词返回空数组，短词与清空搜索能恢复结果', () => {
    const sections = GUIDE_COPY.en.sections;
    expect(searchGuideSections(sections, 'qwerty-no-such-guide-entry')).toEqual([]);
    expect(searchGuideSections(sections, 'save').length).toBeGreaterThan(0);
    expect(searchGuideSections(sections, '')).toEqual(sections);
  });

  it('不改输入章节，也不跨查询缓存结果', () => {
    const sections = Object.freeze([
      Object.freeze({ heading: 'One', body: Object.freeze(['alpha beta']) }),
    ]);
    const before = JSON.stringify(sections);
    expect(searchGuideSections(sections, 'alpha')).toHaveLength(1);
    expect(searchGuideSections(sections, 'gamma')).toEqual([]);
    expect(JSON.stringify(sections)).toBe(before);
  });
});
