import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTRACT_EXPORTS, renderContract } from '../src/contract';

/**
 * ai-service（Python）按 `contracts/*.json` 校验报文，因此这些文件必须与 zod 定义逐字节一致。
 * 改了 schema 就重新跑 `npm run contract:export`。
 */
describe('contracts/ 导出', () => {
  it('登记了全部跨端契约', () => {
    expect(CONTRACT_EXPORTS.map((e) => e.file)).toEqual([
      'ai-request.schema.json',
      'ai-response.schema.json',
      'ai-error.schema.json',
      'ai-job-accepted.schema.json',
      'ai-job-status.schema.json',
      'design-patch.schema.json',
      'health.schema.json',
      'screenshot-request.schema.json',
      'screenshot-response.schema.json',
      'realtime-event.schema.json',
    ]);
  });

  for (const { file } of CONTRACT_EXPORTS) {
    it(`${file} 与 zod 定义一致`, () => {
      const onDisk = readFileSync(fileURLToPath(new URL(`../../../contracts/${file}`, import.meta.url)), 'utf8');
      expect(onDisk).toBe(renderContract(file));
    });
  }
});
