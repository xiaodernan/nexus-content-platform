import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONTRACT_EXPORTS, renderContract } from '@nexus/schemas/contract';

/** 把 zod 契约导出为 JSON Schema，供 ai-service（Python）运行期校验（docs/ARCHITECTURE.md 边界纪律 4） */
const outDir = fileURLToPath(new URL('../contracts/', import.meta.url));

mkdirSync(outDir, { recursive: true });
for (const { file } of CONTRACT_EXPORTS) {
  writeFileSync(outDir + file, renderContract(file), 'utf8');
  console.log(`contracts/${file}`);
}
