// SSR render probe for /world/<id>/ephemeris engine: deterministic output with fixture nodes.
(async () => {
  const { buildEphemeris } = await import('../apps/web/src/lib/ephemeris.ts');
  const FIX = [
    { id: 'a', kind: 'lore', title: '创世黑雨', body: '天下三日无光。雨里没有水只有炭灰——灰尘落满了白灯区的每一片檐。' },
    { id: 'b', kind: 'story', title: '钟楼', body: '钟楼顶上有人喊出一声——擦——撞——倒——天亮了。' },
    { id: 'c', kind: 'items', title: '怀表', body: '三块怀表往返三次——问时间时这块更准。' },
  ];
  const entries = buildEphemeris(FIX);
  console.log('entries:', JSON.stringify(entries, null, 2));
  console.log('days count:', new Set(entries.map((e) => e.day)).size);
  console.log('kind labels:', JSON.stringify(entries.map((e) => e.kindLabel)));
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
