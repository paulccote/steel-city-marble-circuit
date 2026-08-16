import type { PowerupType } from '../game/types';

/**
 * Every icon is inline SVG drawn from path data. Nothing here loads a font or
 * an image file, which keeps the whole UI in one bundle and means icons stay
 * crisp at any DPI and inherit `currentColor` from whatever slot they sit in.
 */

const NS = 'http://www.w3.org/2000/svg';

function svg(paths: string, opts: { fill?: boolean; width?: number } = {}): SVGElement {
  const root = document.createElementNS(NS, 'svg');
  root.setAttribute('viewBox', '0 0 24 24');
  root.setAttribute('aria-hidden', 'true');
  root.classList.add('icon');
  root.innerHTML = paths;
  if (opts.fill) {
    root.setAttribute('fill', 'currentColor');
    root.setAttribute('stroke', 'none');
  } else {
    root.setAttribute('fill', 'none');
    root.setAttribute('stroke', 'currentColor');
    root.setAttribute('stroke-width', String(opts.width ?? 2));
    root.setAttribute('stroke-linecap', 'round');
    root.setAttribute('stroke-linejoin', 'round');
  }
  return root;
}

/**
 * Powerup icons. Each one is a picture of what the powerup *does* to the
 * marble, not an abstract badge, because the held-powerup slot is read in
 * peripheral vision at speed.
 */
export const POWERUP_ICON: Record<PowerupType, () => SVGElement> = {
  // A bolt: raw forward shove.
  superSpeed: () => svg('<path d="M13.5 2 5 13.2h5.2L9.6 22 19 10.4h-5.4z"/>', { fill: true }),

  // Marble leaving the ground under a fat arrow.
  superJump: () =>
    svg(
      '<path d="M12 2.5 18 9h-3.4v5.5H9.4V9H6z" fill="currentColor" stroke="none"/>' +
        '<circle cx="12" cy="19.5" r="2.6"/><path d="M5 22.5h14"/>',
    ),

  // Two rebounds off a floor line: the shape of a bouncing ball's path.
  superBounce: () =>
    svg('<path d="M2 20c2.6-9 6-9 8.6 0"/><path d="M10.6 20c2.4-7.4 5.4-7.4 7.8 0"/><path d="M2 21.6h20"/><circle cx="6" cy="6" r="2.2" fill="currentColor" stroke="none"/>'),

  // A coil spring under a plate: impacts get eaten.
  shockAbsorber: () =>
    svg('<path d="M6 3h12"/><path d="M8 6.5h8l-8 3 8 3-8 3h8"/><path d="M6 21h12"/>'),

  // Rotor blades seen from above with a hub.
  gyrocopter: () =>
    svg(
      '<path d="M12 12 3.5 8.2c-1.4-.6-1-2.7.5-2.9L12 4.2"/>' +
        '<path d="M12 12l8.5 3.8c1.4.6 1 2.7-.5 2.9L12 19.8"/>' +
        '<circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M12 19.8V22"/>',
    ),

  // A small marble swelling into a big one.
  megaMarble: () =>
    svg('<circle cx="13" cy="13" r="8.2"/><circle cx="6" cy="6" r="2.6" fill="currentColor" stroke="none"/><path d="M4.5 12.5 2.5 21.5l9-2"/>'),
};

export const ICON = {
  play: () => svg('<path d="M6 3.5 20.5 12 6 20.5z"/>', { fill: true }),
  back: () => svg('<path d="M15 4 7 12l8 8"/>'),
  left: () => svg('<path d="M15 4 7 12l8 8"/>'),
  right: () => svg('<path d="M9 4l8 8-8 8"/>'),
  gear: () =>
    svg(
      '<circle cx="12" cy="12" r="3.4"/>' +
        '<path d="M12 1.8v3M12 19.2v3M22.2 12h-3M4.8 12h-3M19.2 4.8l-2.1 2.1M6.9 17.1l-2.1 2.1M19.2 19.2l-2.1-2.1M6.9 6.9 4.8 4.8"/>',
    ),
  keyboard: () =>
    svg('<rect x="1.8" y="5.5" width="20.4" height="13" rx="2"/><path d="M6 9.5h.01M10 9.5h.01M14 9.5h.01M18 9.5h.01M6 13h.01M18 13h.01M8.5 16.2h7"/>'),
  restart: () =>
    svg('<path d="M20 5.5v5h-5"/><path d="M19.4 10.5A8 8 0 1 0 20 15.4"/>'),
  list: () => svg('<path d="M4 6.5h16M4 12h16M4 17.5h16"/>'),
  trophy: () =>
    svg('<path d="M7 3.5h10v5a5 5 0 0 1-10 0z"/><path d="M7 5H4.2v1.6A3.4 3.4 0 0 0 7.6 10M17 5h2.8v1.6A3.4 3.4 0 0 1 16.4 10"/><path d="M12 13.5V17M8.5 20.5h7"/>'),
  clock: () => svg('<circle cx="12" cy="12" r="9"/><path d="M12 6.8V12l3.4 2.2"/>'),
  gem: () =>
    svg('<path d="M12 1.6 22 8.4 12 22.4 2 8.4z"/>', { fill: true }),
  volume: () =>
    svg('<path d="M4 9.2h3.4L12 5v14l-4.6-4.2H4z"/><path d="M16 9a4.4 4.4 0 0 1 0 6M18.8 6a8.4 8.4 0 0 1 0 12"/>'),
  mute: () => svg('<path d="M4 9.2h3.4L12 5v14l-4.6-4.2H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>'),
  mouse: () => svg('<rect x="6.5" y="2.2" width="11" height="19.6" rx="5.5"/><path d="M12 6.2v3.6"/>'),
  sparkle: () =>
    svg('<path d="M12 2.5 14 9l6.5 2-6.5 2-2 6.5-2-6.5L3.5 11 10 9z"/>', { fill: true }),
  close: () => svg('<path d="M5.5 5.5l13 13M18.5 5.5l-13 13"/>'),
};

/**
 * The KABLAM wordmark.
 *
 * This is SVG rather than styled HTML text for one reason: an HTML gradient
 * wordmark has to use `background-clip: text`, and `text-shadow` paints *above*
 * the element background — so the black outline copies bury the gradient and
 * the word renders as a black silhouette that disappears against any dark
 * backdrop. SVG's `paint-order` puts the stroke under the fill by contract, so
 * the gold always survives, and a stroke plus a dark halo means the word holds
 * over bright sky and dark brick alike.
 *
 * `textLength` pins the width, so a machine without Arial Black still lays the
 * wordmark out in exactly the same box.
 */
export function wordmark(): SVGElement {
  const root = document.createElementNS(NS, 'svg');
  root.setAttribute('viewBox', '0 0 640 132');
  root.setAttribute('preserveAspectRatio', 'xMinYMid meet');
  root.setAttribute('aria-label', 'Kablam');
  root.classList.add('wordmark');
  root.innerHTML = `
    <defs>
      <linearGradient id="kbl-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff7d6"/>
        <stop offset="0.38" stop-color="#ffc82e"/>
        <stop offset="0.60" stop-color="#c98607"/>
        <stop offset="0.80" stop-color="#ffd85f"/>
        <stop offset="1" stop-color="#fff0b4"/>
      </linearGradient>
    </defs>
    <text x="14" y="110" textLength="612" lengthAdjust="spacingAndGlyphs"
          font-family="Arial Black, Arial Bold, Helvetica Neue, Impact, sans-serif"
          font-size="130" font-weight="900"
          paint-order="stroke" stroke="#04060a" stroke-width="17" stroke-linejoin="round"
          fill="url(#kbl-fill)">KABLAM</text>`;
  return root;
}

/** The three rivers meeting at the Point — the mark on the title screen. */
export function riversMark(): SVGElement {
  const root = document.createElementNS(NS, 'svg');
  root.setAttribute('viewBox', '0 0 120 44');
  root.setAttribute('aria-hidden', 'true');
  root.classList.add('rivers-mark');
  root.innerHTML = `
    <defs>
      <linearGradient id="riv" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffd34d"/><stop offset="1" stop-color="#c98a06"/>
      </linearGradient>
    </defs>
    <path d="M2 4 L46 30 L58 42 L70 30 L118 4" fill="none" stroke="url(#riv)" stroke-width="4"
          stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>
    <path d="M14 4 L52 26 M106 4 L68 26" fill="none" stroke="url(#riv)" stroke-width="2"
          stroke-linecap="round" opacity="0.55"/>
    <circle cx="58" cy="42" r="0" fill="none"/>`;
  return root;
}
