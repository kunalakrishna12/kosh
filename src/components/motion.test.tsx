// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTween } from './motion';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('useTween', () => {
  let frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    frames = [];
    (HTMLElement.prototype as unknown as { animate: () => void }).animate = () => {};
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('glides from the old values to the new ones, and leaves gaps as gaps', async () => {
    const seen: number[][] = [];
    function Probe({ v }: { v: number[] }) {
      seen.push(useTween(v, 1000));
      return null;
    }
    const root = createRoot(document.createElement('div'));
    await act(async () => root.render(<Probe v={[0, 100, NaN]} />));
    expect(seen.at(-1)).toEqual([0, 100, NaN]);
    await act(async () => root.render(<Probe v={[100, 0, NaN]} />));
    expect(seen.at(-1)).toEqual([0, 100, NaN]); // still the old shape until the first frame
    const step = async (ms: number) =>
      act(async () => {
        const due = frames;
        frames = [];
        due.forEach((f) => f(ms));
      });
    await step(500);
    const mid = seen.at(-1)!;
    expect(mid[0]).toBeCloseTo(50);
    expect(mid[1]).toBeCloseTo(50);
    expect(mid[2]).toBeNaN();
    await step(1000);
    expect(seen.at(-1)).toEqual([100, 0, NaN]);
    expect(frames.length).toBe(0);
  });
});
