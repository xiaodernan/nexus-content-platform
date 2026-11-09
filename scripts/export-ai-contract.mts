import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONTRACT_EXPORTS, renderContract } from '@nexus/schemas/contract';
import { COMMUNITY_POLICY_FILE, renderCommunityPolicy } from '@nexus/schemas/community-policy';
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

/**
 * §SC-17 社区策略的**值**文档：java-domain-service 把它打进 jar 后运行期读，
 * 于是"什么算被挡住 / 拒绝时说哪句话"在 TS 与 JVM 两边只有一处字面量。
 */
writeFileSync(outDir + COMMUNITY_POLICY_FILE, renderCommunityPolicy(), 'utf8');
console.log(`contracts/${COMMUNITY_POLICY_FILE}（社区策略值文档，JVM 侧共用）`);
