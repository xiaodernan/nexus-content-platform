import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDocument, generateProject } from '../../../packages/design-model/src';
import { AiRequestSchema } from '../../../packages/schemas/src';
import { AI_REQUEST_FIXTURE_FILE, renderAiRequestFixture } from '../../../scripts/ai-request-fixture';

/**
 * 这份夹具是 Python 侧 `test_prompt.py` 唯一的"真实长上下文"输入。
 * 它必须由装配代码产出、并且和仓库里那份字节相同 —— 否则跨语言的防漂移就退化成"两边各自演化"：
 * TS 侧改了目录字段，导出的夹具不重跑，Python 测试照样对着旧形状全绿。
 */
describe('contracts/fixtures/ai-request-with-index.json', () => {
  const onDisk = readFileSync(fileURLToPath(new URL(`../../../${AI_REQUEST_FIXTURE_FILE}`, import.meta.url)), 'utf8');

  it('和当前代码算出来的那份字节相同（改了装配就要重跑 npm run contract:export）', () => {
    expect(onDisk).toBe(renderAiRequestFixture());
  });

  it('同一份输入两次构建字节相同，夹具不会凭空产生 diff', () => {
    expect(renderAiRequestFixture()).toBe(renderAiRequestFixture());
  });

  it('是合法的 AiRequest，而且线上没有整份文档（§68）', () => {
    const request = AiRequestSchema.parse(JSON.parse(onDisk));
    expect(request.context.document).toBeUndefined();
    expect(onDisk).not.toContain('"document"');
    // 模型能看到的是这两份目录
    expect(request.context.designIndex?.totals.pages).toBeGreaterThan(0);
    expect(request.context.codeDigest?.files.length).toBeGreaterThan(0);
  });

  it('代码摘要里只有目录，没有一个字符的正文（§69 后半截仍未做）', () => {
    const digest = JSON.parse(onDisk).context.codeDigest as { files: Record<string, unknown>[] };
    expect(digest.files.length).toBeGreaterThan(0);
    for (const file of digest.files) {
      expect(file).not.toHaveProperty('content');
      expect(file).not.toHaveProperty('contents');
      expect(file).not.toHaveProperty('body');
      expect(file).not.toHaveProperty('source');
    }
    // 先证明"正文里确实有这句"，再说"夹具里没有"——只断言后半句会是一条永远为真的空检查
    const generated = generateProject(createDocument('契约夹具'), {})
      .map((file) => file.contents)
      .join('\n');
    expect(generated).toContain('export function');
    expect(onDisk).not.toContain('export function');
  });
});
