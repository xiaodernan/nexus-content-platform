import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONTRACT_EXPORTS, renderContract } from '@nexus/schemas/contract';
import { AI_REQUEST_FIXTURE_FILE, renderAiRequestFixture } from './ai-request-fixture';

/** 把 zod 契约导出为 JSON Schema，供 ai-service（Python）运行期校验（docs/ARCHITECTURE.md 边界纪律 4） */
const outDir = fileURLToPath(new URL('../contracts/', import.meta.url));

mkdirSync(outDir, { recursive: true });
for (const { file } of CONTRACT_EXPORTS) {
  writeFileSync(outDir + file, renderContract(file), 'utf8');
  console.log(`contracts/${file}`);
}

/**
 * 顺带导出一份**真的**装配出来的 AiRequest 给 Python 侧当夹具。
 * 构造过程与"这份文件必须和代码同步"两件事都在 `scripts/ai-request-fixture.ts` 与
 * `apps/web/test/contract-fixture.test.ts` 里，别在这里手抄。
 */
writeFileSync(outDir + 'fixtures/ai-request-with-index.json', renderAiRequestFixture(), 'utf8');
console.log(`${AI_REQUEST_FIXTURE_FILE}（含 designIndex + codeDigest，无 document）`);
