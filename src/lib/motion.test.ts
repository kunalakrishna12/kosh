// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countUp } from './motion';

describe('countUp', () => {
  let frames: FrameRequestCallback[] = [];
  let now = 0;
  beforeEach(() => {
    frames = [];
    now = 0;
    // jsdom has no animations; pretend it does, and drive frames by hand.
    (HTMLElement.prototype as unknown as { animate: () => void }).animate = () => {};
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  });
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const run = (ms: number) => {
    now = ms;
    const due = frames;
    frames = [];
    due.forEach((f) => f(ms));
  };
  const el = (text: string) => {
    const d = document.createElement('div');
    d.textContent = text;
    return d;
  };

  it.each(['₹30,56,461', '+₹2.9L', '6.2 mo', '-₹40,418', '$12,345.67', '₹1,00,000'])('starts at zero and ends on exactly %s', (text) => {
    const d = el(text);
    countUp(d, { duration: 1 });
    expect(d.textContent).not.toBe(text);
    run(500);
    run(1000);
    expect(d.textContent).toBe(text);
  });

  it('keeps Indian grouping on the way up', () => {
    const d = el('₹30,56,461');
    countUp(d, { duration: 1 });
    run(400);
    expect(d.textContent).toMatch(/^₹\d{1,2},\d\d,\d{3}$/);
  });

  it('stops if the app changes the number mid-way', () => {
    const d = el('₹500');
    countUp(d, { duration: 1 });
    d.firstChild!.nodeValue = '₹900';
    run(1000);
    expect(d.textContent).toBe('₹900');
  });
});
