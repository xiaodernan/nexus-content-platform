import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SavingsCard } from '../apps/web/src/components/SavingsCard';
import type { SavingsSummary } from '../apps/web/src/lib/savings';

const none: SavingsSummary = {
  cachedTokens: 0, tokensIn: 0, hitRate: null, turns: 0,
  realTurns: 0, demoTurns: 0, legacyRows: 0, savedShare: null,
};

const hot: SavingsSummary = {
  cachedTokens: 20842, tokensIn: 28240, hitRate: 0.738,
  turns: 3, realTurns: 3, demoTurns: 0, legacyRows: 253, savedShare: 0.738,
};

for (const [label, savings] of [['empty', none], ['hot', hot]] as const) {
  const html = renderToStaticMarkup(React.createElement(SavingsCard, { savings }));
  const hooks = [...html.matchAll(/data-savings-[a-z]+="/g)].map((m) => m[0]);
  const sv = [...html.matchAll(/sv-[a-zA-Z-]+/g)].map((m) => m[0]);
  console.log('=== ' + label + ' ===');
  console.log('hooks:', hooks.join(' '));
  console.log('sv classes:', [...new Set(sv)].join(' '));
  console.log('bytes:', html.length);
  console.log(html);
  console.log();
}
process.exit(0);
