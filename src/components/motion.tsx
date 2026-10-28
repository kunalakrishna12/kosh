import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { reducedMotion } from '../lib/motion';

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
