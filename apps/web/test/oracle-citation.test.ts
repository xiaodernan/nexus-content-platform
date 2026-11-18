import { describe, expect, it } from 'vitest';
import { verifyAnchorCitation } from '../src/server/domain/oracleCitation';

/**
 * §TIDE-ORACLE-VERIFY · 潮汐预言的引文自检：
 * - cited：正典锚句逐字出现（引用是允许的，且必须逐字）
 * - declined：「典籍里没有 / not in the canon」——正典没写的诚实拒答
 * - not-cited：自由作答（不冒充引经据典）
 * 判定不看模型自报，只看字符串归一化对齐。锚句取自正典第一章原文（验证与其字节一致）
 */

describe('verifyAnchorCitation', () => {
  it('cited：回答逐字包含正典锚句', () => {
    const answer = '潮说：船队不敢回航，是因为回航意味着日蚀又要来。别问下一步怎么走，典籍没写下一步。';
    const result = verifyAnchorCitation(answer);
    expect(result.clause).toBe('cited');
    if (result.clause === 'cited') {
      expect(result.anchors.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('cited：锚句外面有引号、书名号，归一化后仍能对齐', () => {
    const answer = '潮给你一句「船队不敢回航，是因为回航意味着日蚀又要来。」——别追问下一步。';
    expect(verifyAnchorCitation(answer).clause).toBe('cited');
  });

  it('cited：英文锚句小写化后仍能对齐', () => {
    const answer = 'The tide reminds you: THE FLEET DARES NOT TURN HOME, BECAUSE TURNING HOME MEANS THE ECLIPSE IS COMING AGAIN. ask nothing more.';
    expect(verifyAnchorCitation(answer).clause).toBe('cited');
  });

  it('declined：典籍里没有（各书写体）都算诚实的潮', () => {
    expect(verifyAnchorCitation('典籍里没有。潮不能替你编。').clause).toBe('declined');
    expect(verifyAnchorCitation('典籍里没写。潮不能替你编。').clause).toBe('declined');
    expect(verifyAnchorCitation('典籍里没有写。抬头看潮。').clause).toBe('declined');
    expect(verifyAnchorCitation('Not in the canon — the tide will not invent what it has not seen.').clause).toBe('declined');
  });

  it('not-cited：近义转述不是引用（不冒充引经据典）', () => {
    const answer = '潮看见了一件新鲜事：一队船夫不肯掉头回家，因为他们怕再见到日食坠落。';
    expect(verifyAnchorCitation(answer).clause).toBe('not-cited');
  });

  it('not-cited：空字符串与纯标点都按未引用处理', () => {
    expect(verifyAnchorCitation('').clause).toBe('not-cited');
    expect(verifyAnchorCitation('……？！').clause).toBe('not-cited');
  });
});
