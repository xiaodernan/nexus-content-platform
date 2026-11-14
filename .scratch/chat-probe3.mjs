const base = 'http://127.0.0.1:3200';
const r = await fetch(`${base}/v1/ai/chat`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    requestId: 'chat-probe-once-3',
    system: '你是 NEXUS 的角色「小纳」，说话简洁友好。',
    user: '你好。',
    modelClass: 'balanced',
  }),
});
console.log('HTTP', r.status);
console.log((await r.text()).slice(0, 600));
