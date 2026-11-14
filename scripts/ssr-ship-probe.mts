import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ShipPage from '../apps/web/src/app/ship/page';

const html = renderToStaticMarkup(React.createElement(ShipPage));
const hooks = [...html.matchAll(/data-ship-[a-z-]+="?/g)].map((m) => m[0]);
const classes = [...html.matchAll(/\bsh-[a-zA-Z-]+\b/g)].map((m) => m[0]);
console.log('bytes:', html.length);
console.log('hooks:', [...new Set(hooks)].join(' '));
console.log('commit count:', (html.match(/累计提交/g) ?? []).length, 'entries shown:', (html.match(/data-ship-entry/g) ?? []).length);
console.log('ADRs:', (html.match(/ADR 决策/g) ?? []).length, 'services:', (html.match(/Java 服务/g) ?? []).length);
console.log('html head:', html.slice(0, 600));
process.exit(0);
