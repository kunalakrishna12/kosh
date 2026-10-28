import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { canAnimate, reducedMotion } from '../lib/motion';

/**
 * A heading whose letters rise into place, word by word, each word masked so the
 * letters come up from under a line. Remount it (a new key) to play it again.
 */
export function SplitTitle({ text }: { text: string }) {
  let i = 0;
  const words = text.split(' ');
  return (
    <span className="split">
      {words.map((w, wi) => (
        <span key={wi}>
          <span className="word">
            {[...w].map((c, ci) => (
              <span key={ci} className="ch" style={{ '--i': i++ } as CSSProperties}>
                {c}
              </span>
            ))}
          </span>
          {wi < words.length - 1 && ' '}
        </span>
      ))}
    </span>
  );
}

/**
 * The highlight behind the selected item of a menu or switch, gliding from the old
 * item to the new one instead of jumping. Place it inside the menu (which must be
 * position: relative); `selector` finds the selected item, `watch` is what changes.
 */
export function SlidingPill({ selector, watch, className = '' }: { selector: string; watch: unknown; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  useLayoutEffect(() => {
    const pill = ref.current;
    const box = pill?.parentElement;
    if (!pill || !box) return;
    const place = (glide: boolean) => {
      const target = box.querySelector<HTMLElement>(selector);
      if (!target?.offsetWidth) {
        pill.style.opacity = '0';
        return;
      }
      // Layout offsets, not screen positions: they ignore an item that is mid-animation.
      let x = 0;
      let y = 0;
      let el: HTMLElement | null = target;
      while (el && el !== box) {
        x += el.offsetLeft;
        y += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      pill.style.transition = glide && placed.current && !reducedMotion() ? '' : 'none';
      pill.style.opacity = '1';
      pill.style.width = `${target.offsetWidth}px`;
      pill.style.height = `${target.offsetHeight}px`;
      pill.style.transform = `translate(${x}px, ${y}px)`;
      placed.current = true;
    };
    place(true);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => place(false));
    ro.observe(box);
    return () => ro.disconnect();
  }, [selector, watch]);
  return <span ref={ref} className={`slide-pill ${className}`} aria-hidden />;
}

/** Smooth in, smooth out: for morphing a chart from its old shape to its new one. */
const easeInOut = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2);

/**
 * Numbers that glide to new values instead of jumping: give it the target values,
 * render what it returns. NaN passes through untouched (a gap in a chart).
 * The first render shows the target at once; charts draw themselves in separately.
 */
export function useTween(target: number[], duration = 850): number[] {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const frame = useRef(0);
  const sig = target.join(',');
  useEffect(() => {
    const prev = from.current;
    if (prev.join(',') === sig) return;
    cancelAnimationFrame(frame.current);
    if (prev.length !== target.length || !canAnimate(document.body)) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const k = easeInOut(t);
      const v = target.map((x, i) => (Number.isFinite(prev[i]) && Number.isFinite(x) ? prev[i] + (x - prev[i]) * k : x));
      from.current = v;
      setShown(v);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
    // `sig` stands for `target`'s contents; a new array with the same numbers is no change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return shown.length === target.length ? shown : target;
}
