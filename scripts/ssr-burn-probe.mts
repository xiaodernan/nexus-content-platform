// @ts-nocheck
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CreditsBurnCard } from '../apps/web/src/components/CreditsBurnCard';
import type { BurnProjection } from '../apps/web/src/lib/burn-projection';

const projecting: BurnProjection = {
  verdict: 'projecting',
  series: [3, 2, 2, 1, 3, 2, 2, 1, 2, 1, 3, 2, 1, 1, 2, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1],
  days: 30,
  activeDays: 9,
  totalBurned: 54,
  avgPerDay: 1.8,
  slopePerDay: -0.42,
  daysUntilEmpty: 17,
  exhaustDate: '2026-12-01',
};

const noBurn: BurnProjection = { ...projecting, verdict: 'no-burn', daysUntilEmpty: null, exhaustDate: null, slopePerDay: 0.12 };
const insufficient: BurnProjection = { ...projecting, verdict: 'insufficient-data', daysUntilEmpty: null, exhaustDate: null, activeDays: 2 };

for (const [label, projection] of [['projecting', projecting], ['no-burn', noBurn], ['insufficient', insufficient]] as const) {
  const html = renderToStaticMarkup(React.createElement(CreditsBurnCard, { projection, balance: 31 }));
  const hooks = [...html.matchAll(/data-burn-[a-z]+="?/g)].map((m) => m[0]);
  const classes = [...html.matchAll(/bn-[A-Za-z0-9-]+/g)].map((m) => m[0]);
  console.log('=== ' + label + ' ===');
  console.log('hooks:', [...new Set(hooks)].join(' '));
  console.log('bn classes:', [...new Set(classes)].join(' '));
  console.log('bytes:', html.length);
  console.log('has raw hex:', /#[0-9a-fA-F]{3,8}\b/.test(html));
  console.log('has var() hex refs:', /var\(--nexus-color-brand\)/.test(html));
  console.log();
}
process.exit(0);
