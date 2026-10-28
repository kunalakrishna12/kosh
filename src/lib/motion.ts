/**
 * Kosh's motion, built on the browser's Web Animations API (no animation library).
 * Everything here is decoration: it never changes layout or content, it leaves no
 * inline styles behind, and it does nothing when the system asks for reduced motion.
 */

export const EASE = {
  /** Fast start, long soft landing: entrances. */
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  /** A touch of overshoot: dialogs and pops. */
  back: 'cubic-bezier(0.34, 1.45, 0.64, 1)',
  /** Accelerating away: exits. */
  in: 'cubic-bezier(0.5, 0, 0.75, 0)',
};

export function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Whether animating is possible and wanted (jsdom and reduced motion both say no). */
export function canAnimate(el?: Element | null): el is HTMLElement {
  return !!el && typeof (el as HTMLElement).animate === 'function' && !reducedMotion();
}

/** Fade elements up into place one after another. */
export function rise(els: Element[], { y = 18, scale = 0.985, stagger = 0.05, delay = 0, duration = 0.7 } = {}) {
  els.forEach((el, i) => {
    if (!canAnimate(el)) return;
    el.animate(
      [
        { opacity: 0, transform: `translateY(${y}px) scale(${scale})` },
        { opacity: 1, transform: 'none' },
      ],
      { duration: duration * 1000, delay: (delay + i * stagger) * 1000, easing: EASE.out, fill: 'backwards' },
    );
  });
}

/** The same, sideways: for menus and sidebars. */
export function slideIn(els: Element[], { x = -8, stagger = 0.025, delay = 0 } = {}) {
  els.forEach((el, i) => {
    if (!canAnimate(el)) return;
    el.animate([{ opacity: 0, transform: `translateX(${x}px)` }, { opacity: 1, transform: 'none' }], {
      duration: 450,
      delay: (delay + i * stagger) * 1000,
      easing: EASE.out,
      fill: 'backwards',
    });
  });
}

/**
 * Count the first number in an element up from zero to what it already says,
 * keeping its currency sign, grouping, decimals and suffix (₹9.7L, 6.2 mo, +₹2.9L).
 * Only the text node's value changes, and if React rewrites it mid-way we stop.
 */
export function countUp(el: Element, { duration = 1.1, delay = 0 } = {}) {
  if (!canAnimate(el)) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Text | null = null;
  while (walker.nextNode()) {
    if (/\d/.test(walker.currentNode.nodeValue ?? '')) {
      node = walker.currentNode as Text;
      break;
    }
  }
  if (!node) return;
  const text = node.nodeValue!;
  const m = /\d[\d,]*(\.\d+)?/.exec(text);
  if (!m) return;
  const target = Number(m[0].replace(/,/g, ''));
  if (!Number.isFinite(target) || target === 0) return;
  const decimals = m[1] ? m[1].length - 1 : 0;
  // Indian grouping (12,34,567) when the number shows it. Below a lakh both groupings look the same.
  const indian = /,\d\d,/.test(m[0]);
  const fmt = new Intl.NumberFormat(indian ? 'en-IN' : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: m[0].includes(','),
  });
  const before = text.slice(0, m.index);
  const after = text.slice(m.index + m[0].length);
  const textNode = node;
  let last = text;
  const start = performance.now() + delay * 1000;
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const frame = (now: number) => {
    if (textNode.nodeValue !== last) return; // React changed it: leave the new value alone.
    const t = Math.min(1, Math.max(0, (now - start) / (duration * 1000)));
    last = t >= 1 ? text : before + fmt.format(target * ease(t)) + after;
    textNode.nodeValue = last;
    if (t < 1) requestAnimationFrame(frame);
  };
  last = before + fmt.format(0) + after;
  textNode.nodeValue = last;
  requestAnimationFrame(frame);
}

/** The blocks of a page, in reading order: grids and stacks of cards are opened up into their cards. */
function blocks(root: Element): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of Array.from(root.children) as HTMLElement[]) {
    const container = el.classList.contains('grid') || el.classList.contains('stack');
    if (container && el.querySelector(':scope > .card, :scope > .stack, :scope > div > .card')) out.push(...blocks(el));
    else out.push(el);
  }
  return out;
}

/** A new page arrives: its cards rise in a wave, rows follow, and the big numbers count up. */
export function enterPage(page: HTMLElement | null) {
  if (!canAnimate(page)) return;
  const fold = window.innerHeight + 40;
  const visible = blocks(page)
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.height > 0 && r.top < fold)
    .sort((a, b) => Math.round(a.r.top / 24) - Math.round(b.r.top / 24) || a.r.left - b.r.left)
    .map(({ el }) => el)
    .slice(0, 16);
  rise(visible, { y: 22, stagger: 0.055 });
  const rows = Array.from(page.querySelectorAll('.list > .tx, .list > .secret, .stack > .row'))
    .filter((el) => el.getBoundingClientRect().top < fold)
    .slice(0, 14);
  rise(rows, { y: 10, scale: 1, stagger: 0.03, delay: 0.18, duration: 0.55 });
  page.querySelectorAll('.hero-total, .pocket-v, .stat-v').forEach((el, i) => {
    if (el.getBoundingClientRect().top < fold) countUp(el, { delay: 0.05 + Math.min(i, 8) * 0.04 });
  });
}
