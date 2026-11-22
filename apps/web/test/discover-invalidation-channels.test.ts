import { describe, expect, it } from 'vitest';
import { DISCOVER_INVALIDATE_CHANNEL, parseInvalidationFrame as parseViewers } from '../src/server/domain/invalidation-bus';
import {
  DISCOVER_INVALIDATION_CHANNEL,
  parseInvalidationFrame as parseEpoch,
} from '../src/server/cache/discoverInvalidation';

/**
 * §CACHE / §SC-44 · 两条失效总线不能共用频道（2026-11-21）。
 *
 * 线上真日志：`[discover-invalidation] redis 失效帧不合契 … {"v":1,"origin":…,"viewerIds":[],"global":true}`——
 * viewer 帧被 epoch 总线的 parser 当坏帧丢；反过来 epoch 帧也会被 viewer parser 丢。
 * 两边互不污染状态，但每笔发布都刷警告、白烧 JSON.parse，而且哪天有一边放宽形状就会串台。
 * 这道门钉的是「频道名不同 + 两种帧只被自己的 parser 接受」。
 */
describe('发现页失效总线频道隔离', () => {
  it('两条总线频道不同（共用 v1 是历史 bug，不许回退）', () => {
    expect(DISCOVER_INVALIDATE_CHANNEL).not.toBe(DISCOVER_INVALIDATION_CHANNEL);
  });

  it('viewer 帧只被 viewer parser 接受，epoch 帧只被 epoch parser 接受', () => {
    const viewerFrame = JSON.stringify({ v: 1, origin: 'a', viewerIds: [], global: true });
    const epochFrame = JSON.stringify({ v: 1, origin: 'a', at: 1, nonce: 42 });
    expect(parseViewers(viewerFrame)).not.toBeNull();
    expect(parseEpoch(viewerFrame)).toBeNull();
    expect(parseEpoch(epochFrame)).not.toBeNull();
    expect(parseViewers(epochFrame)).toBeNull();
  });
});
