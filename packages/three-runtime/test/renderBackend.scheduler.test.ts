/**
 * Direct coverage for `defaultFrameScheduler` (packages/three-runtime/src/renderBackend.ts).
 *
 * The PRODUCTION default frame scheduler (what `start()` uses when a host injects nothing) was the
 * one seam never exercised: every headless test injects `manualFrameScheduler` for determinism, so
 * the rAF-or-timer fallback and its request/cancel contract were never asserted. Per house
 * discipline an untested pure branch *is* the next increment.
 *
 * This package runs in the default (node) vitest environment — no `requestAnimationFrame` global —
 * so `defaultFrameScheduler()` deterministically selects the ~16 ms timer branch.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultFrameScheduler } from '../src/renderBackend.js';

describe('defaultFrameScheduler', () => {
  afterEach(() => vi.useRealTimers());

  it('selects the timer branch in a non-browser (node) environment — never a guess', () => {
    // node has no requestAnimationFrame/cancelAnimationFrame globals
    expect(typeof requestAnimationFrame).toBe('undefined');
    expect(defaultFrameScheduler().kind).toBe('timer');
  });

  it('request schedules the callback for the next frame, not synchronously', () => {
    vi.useFakeTimers();
    const s = defaultFrameScheduler();
    let ran = 0;
    const h = s.request(() => {
      ran += 1;
    });
    // A usable cancel handle. (In Node setTimeout returns a Timeout OBJECT, not a number;
    // the scheduler's `number` return type is a browser-era cast — assert the CONTRACT, not
    // the runtime shape, which differs by host.)
    expect(h).toBeDefined();
    expect(ran).toBe(0); // not run inline
    vi.advanceTimersByTime(16);
    expect(ran).toBe(1);
  });

  it('cancel prevents the scheduled callback from firing', () => {
    vi.useFakeTimers();
    const s = defaultFrameScheduler();
    let ran = false;
    const h = s.request(() => {
      ran = true;
    });
    s.cancel(h);
    vi.advanceTimersByTime(1000);
    expect(ran).toBe(false);
  });
});
