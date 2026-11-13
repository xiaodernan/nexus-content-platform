import { readCostLedger, clampWindowHours } from '../apps/web/src/server/domain/costLedger';

const hours = clampWindowHours(Number(process.argv[2] ?? 24 * 30));
const ledger = await readCostLedger(hours);
console.log(`windowHours = ${ledger.windowHours}  windowStart = ${ledger.windowStart}`);
console.log(`rows        = ${ledger.rows}`);
console.log(`totalUsd    = ${ledger.totalUsd}`);
console.log(`totalTokensIn = ${ledger.totalTokensIn}`);
console.log(`totalCachedTokens = ${ledger.totalCachedTokens}`);
for (const r of ledger.byBasis) {
  console.log(`  basis ${r.basis}`.padEnd(22), `n=${r.n}`, `sumUsd=${r.sumUsd}`, `avgUsd=${r.avgUsd}`, `tokensIn=${r.sumTokensIn}`, `cached=${r.sumCachedTokens}`, `share=${r.cachedSharePct}%`);
}
for (const m of ledger.byModel) {
  console.log(`  model ${m.provider}/${m.model}`.padEnd(40), `n=${m.n}`, `sumUsd=${m.sumUsd}`, `configured=${m.configuredRows}`, `unknown=${m.unknownRows}`);
}
process.exit(0);
