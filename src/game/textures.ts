import * as THREE from 'three';
import type { TextureName } from './types';

/**
 * Procedural textures. Everything is drawn to a canvas at load time so the
 * game ships as one bundle with no image requests — which is what keeps the
 * first level playable within a second of opening the page.
 *
 * Every tiling surface is drawn twice from the same seeded shape code: once
 * for colour and once for height, which the normal map is derived from. A
 * flat-lit box of stone reads as painted cardboard; a bumped one catches the
 * key light and gives the scene the relief the reference has.
 */

const cache = new Map<string, THREE.Texture>();

const ALBEDO_SIZE = 512;
/** Height only feeds a normal map, so half resolution is invisible and free. */
const HEIGHT_SIZE = 256;

type Mode = 'albedo' | 'height';
type Rng = () => number;

function makeCanvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { canvas: c, ctx: c.getContext('2d')! };
}

/** Deterministic per-texture RNG, so the colour and height passes agree. */
function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(name: string) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

function noise(ctx: CanvasRenderingContext2D, size: number, amount: number, rng: Rng) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    d[i] = clamp255(d[i] + n);
    d[i + 1] = clamp255(d[i + 1] + n);
    d[i + 2] = clamp255(d[i + 2] + n);
  }
  ctx.putImageData(img, 0, 0);
}

function shade(hex: string, mul: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(mul);
  return `#${c.getHexString()}`;
}

/** Nudge a colour's hue and saturation, for per-stone / per-brick variety. */
function vary(hex: string, hueShift: number, satMul: number, lightMul: number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(
    (hsl.h + hueShift + 1) % 1,
    Math.min(1, hsl.s * satMul),
    Math.max(0, Math.min(1, hsl.l * lightMul)),
  );
  return `#${c.getHexString()}`;
}

/**
 * Draws a shape at every wrapped position it straddles, so nothing is cut off
 * at the tile seam. Seams are the single loudest tell that a texture repeats.
 */
function wrapped(size: number, x: number, y: number, r: number, fn: (x: number, y: number) => void) {
  const xs = x < r ? [x, x + size] : x > size - r ? [x, x - size] : [x];
  const ys = y < r ? [y, y + size] : y > size - r ? [y, y - size] : [y];
  for (const px of xs) for (const py of ys) fn(px, py);
}

function blotches(
  ctx: CanvasRenderingContext2D,
  size: number,
  count: number,
  color: string,
  maxR: number,
  alpha: number,
  rng: Rng,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = rng() * maxR + size * 0.01;
    wrapped(size, x, y, r, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * A cut stone centred on the origin: flat on top with a bevelled rim. For
 * colour the rim is lit from the upper left; for height every rim falls away,
 * which is what the normal map needs.
 */
function bevelStone(
  ctx: CanvasRenderingContext2D,
  hw: number,
  hh: number,
  bevel: number,
  top: string,
  upper: string,
  lower: string,
) {
  ctx.fillStyle = top;
  ctx.fillRect(-hw, -hh, hw * 2, hh * 2);
  const b = bevel;
  const quad = (pts: number[][], fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  };
  quad([[-hw, -hh], [hw, -hh], [hw - b, -hh + b], [-hw + b, -hh + b]], upper);
  quad([[-hw, -hh], [-hw + b, -hh + b], [-hw + b, hh - b], [-hw, hh]], upper);
  quad([[-hw, hh], [-hw + b, hh - b], [hw - b, hh - b], [hw, hh]], lower);
  quad([[hw, -hh], [hw, hh], [hw - b, hh - b], [hw - b, -hh + b]], lower);
}

/** A lit dome over a shape: bright toward the key light, dark at the rim. */
function domeFill(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  bright: string,
  dark: string,
) {
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
  g.addColorStop(0, bright);
  g.addColorStop(0.55, bright);
  g.addColorStop(1, dark);
  return g;
}

function drawSurface(name: TextureName, size: number, mode: Mode): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size);
  const rng = makeRng(hashSeed(name));
  const S = size / 512; // every layout constant below is authored at 512
  // Colour in the albedo pass, height in the height pass. Same shapes, so the
  // normal map lands exactly on the feature it belongs to.
  const C = (albedo: string, height: string) => (mode === 'albedo' ? albedo : height);
  // Height gets much less grain than colour: the Sobel below multiplies it,
  // and per-pixel grit in a normal map shows up as crawling sparkle.
  const grain = (amount: number) => noise(ctx, size, mode === 'albedo' ? amount : amount * 0.3, rng);

  switch (name) {
    case 'brick': {
      const rows = 8;
      const h = size / rows;
      const w = h * 2;
      ctx.fillStyle = C('#cbbda8', '#3a3a3a');
      ctx.fillRect(0, 0, size, size);
      for (let r = 0; r < rows; r++) {
        const offset = r % 2 ? w / 2 : 0;
        for (let x = -w; x < size + w; x += w) {
          const bx = x + offset + 3 * S;
          const by = r * h + 3 * S;
          const bw = w - 6 * S;
          const bh = h - 6 * S;
          // Fired clay is never one colour: vary hue as well as value or the
          // wall reads as a printed pattern.
          const base = vary('#b03f26', (rng() - 0.5) * 0.05, 0.75 + rng() * 0.5, 0.8 + rng() * 0.45);
          const g = ctx.createLinearGradient(bx, by, bx, by + bh);
          g.addColorStop(0, C(shade(base, 1.16), '#ffffff'));
          g.addColorStop(0.35, C(base, '#efefef'));
          g.addColorStop(1, C(shade(base, 0.72), '#bdbdbd'));
          ctx.fillStyle = g;
          ctx.fillRect(bx, by, bw, bh);
        }
      }
      if (mode === 'albedo') {
        blotches(ctx, size, 26, '#3a1a10', size * 0.09, 0.16, rng);
        blotches(ctx, size, 12, '#e6d3b8', size * 0.05, 0.12, rng);
      }
      grain(20);
      break;
    }

    case 'cobblestone': {
      // Nine setts across the tile, not six. Measured off the rendered frame:
      // six put a sett at 73px against a 108px marble near the camera and
      // larger than the marble at the bottom of the screen, which read as a
      // floor of eggs. Nine puts it at 0.22 units — just over half the
      // marble's width — and lands the tile at 256px per world unit, which is
      // 1:1 with screen pixels at the marble's depth.
      const n = 9;
      const cell = size / n;
      ctx.fillStyle = C('#221d18', '#1e1e1e');
      ctx.fillRect(0, 0, size, size);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const cx = x * cell + cell / 2 + (rng() - 0.5) * cell * 0.1;
          const cy = y * cell + cell / 2 + (rng() - 0.5) * cell * 0.1;
          // Setts are laid tight: the joint is a dark line, not a moat.
          const hw = cell * (0.46 + rng() * 0.02);
          const hh = cell * (0.45 + rng() * 0.02);
          const round = cell * 0.16;
          const rot = (rng() - 0.5) * 0.14;
          // Pittsburgh setts are dark grey granite with warm brown ones mixed
          // through. Anything lighter than this drifts to pastel under a key
          // light that already puts lit faces near clipping.
          const warm = rng() < 0.4;
          const base = warm
            ? vary('#735839', (rng() - 0.5) * 0.03, 0.7 + rng() * 0.5, 0.82 + rng() * 0.3)
            : vary('#66686b', (rng() - 0.5) * 0.05, 0.5 + rng() * 0.8, 0.82 + rng() * 0.32);
          // Drawn from a pre-rolled list so the colour and height passes stay
          // in step: wrapped() may run its body up to four times, and pulling
          // from the RNG inside it would desync the two.
          const spots = Array.from({ length: 22 }, () => [rng(), rng(), rng()]);
          wrapped(size, cx, cy, Math.max(hw, hh) + 2 * S, (px, py) => {
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(rot);
            roundRectPath(ctx, -hw, -hh, hw * 2, hh * 2, round);
            ctx.clip();
            // Flat on top with a quick bevel at the rim: a cut sett, not a
            // pebble. The radial dome is what made these read as eggs.
            if (mode === 'albedo') {
              bevelStone(ctx, hw, hh, cell * 0.13, base, shade(base, 1.2), shade(base, 0.5));
              // Quarry grain, so a sett reads as stone rather than plastic.
              ctx.globalAlpha = 0.18;
              for (const [sx, sy, tone] of spots) {
                ctx.fillStyle = tone > 0.5 ? '#ffffff' : '#000000';
                ctx.fillRect(-hw + sx * hw * 2, -hh + sy * hh * 2, 1.8 * S, 1.8 * S);
              }
              ctx.globalAlpha = 1;
            } else {
              bevelStone(ctx, hw, hh, cell * 0.13, '#ffffff', '#8e8e8e', '#8e8e8e');
            }
            ctx.restore();
          });
        }
      }
      if (mode === 'albedo') blotches(ctx, size, 20, '#171310', cell * 1.1, 0.18, rng);
      grain(14);
      break;
    }

    case 'concrete': {
      ctx.fillStyle = C('#c2bfb2', '#8a8a8a');
      ctx.fillRect(0, 0, size, size);
      blotches(ctx, size, 46, C('#9b988c', '#6d6d6d'), size * 0.16, 0.28, rng);
      blotches(ctx, size, 22, C('#e2dfd2', '#b4b4b4'), size * 0.11, 0.24, rng);
      // Expansion joints: the only hard edge on an otherwise soft surface, and
      // the thing that gives a big slab a sense of scale.
      ctx.strokeStyle = C('#8b887c', '#3c3c3c');
      ctx.lineWidth = 3 * S;
      ctx.beginPath();
      ctx.moveTo(0, size / 2);
      ctx.lineTo(size, size / 2);
      ctx.moveTo(size / 2, 0);
      ctx.lineTo(size / 2, size);
      ctx.stroke();
      grain(16);
      break;
    }

    case 'asphalt': {
      ctx.fillStyle = C('#33363a', '#7a7a7a');
      ctx.fillRect(0, 0, size, size);
      blotches(ctx, size, 60, C('#1d1f22', '#4a4a4a'), size * 0.1, 0.35, rng);
      // Aggregate. Bright chips are what keep tarmac from going to flat black.
      for (let i = 0; i < 900; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const r = (0.7 + rng() * 1.8) * S;
        ctx.fillStyle = C(shade('#9aa0a6', 0.6 + rng() * 0.8), '#e0e0e0');
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      grain(22);
      break;
    }

    case 'steel': {
      ctx.fillStyle = C('#7f8b98', '#9a9a9a');
      ctx.fillRect(0, 0, size, size);
      // Brushed vertical grain plus rivet rows: the language of Pittsburgh's
      // truss bridges.
      for (let x = 0; x < size; x += 2 * S) {
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = C(rng() > 0.5 ? '#b3bfcb' : '#535d68', rng() > 0.5 ? '#b0b0b0' : '#888888');
        ctx.fillRect(x, 0, 2 * S, size);
      }
      ctx.globalAlpha = 1;
      // Plate seams, so a long girder does not read as one endless ribbon.
      ctx.fillStyle = C('#404a55', '#5a5a5a');
      ctx.fillRect(0, size / 2 - 2 * S, size, 4 * S);
      const step = size / 4;
      for (let y = step / 2; y < size; y += step) {
        for (let x = step / 2; x < size; x += step / 2) {
          const r = 5 * S;
          wrapped(size, x, y, r + 2 * S, (px, py) => {
            ctx.fillStyle =
              mode === 'albedo'
                ? domeFill(ctx, px, py, r, '#c6d2de', '#454e58')
                : domeFill(ctx, px, py, r, '#ffffff', '#7a7a7a');
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      }
      grain(10);
      break;
    }

    case 'steelPainted': {
      // Aztec gold, the colour of the Three Sisters bridges.
      ctx.fillStyle = C('#f0a81c', '#9a9a9a');
      ctx.fillRect(0, 0, size, size);
      blotches(ctx, size, 22, C('#b06f0c', '#8c8c8c'), size * 0.11, 0.3, rng);
      blotches(ctx, size, 14, C('#ffd76a', '#ababab'), size * 0.08, 0.28, rng);
      ctx.fillStyle = C('#a4690f', '#6a6a6a');
      ctx.fillRect(0, size / 2 - 2 * S, size, 4 * S);
      const step = size / 4;
      for (let y = step / 2; y < size; y += step) {
        for (let x = step / 2; x < size; x += step / 2) {
          const r = 5 * S;
          wrapped(size, x, y, r + 2 * S, (px, py) => {
            ctx.fillStyle =
              mode === 'albedo'
                ? domeFill(ctx, px, py, r, '#ffd67c', '#9c6408')
                : domeFill(ctx, px, py, r, '#ffffff', '#7a7a7a');
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      }
      grain(10);
      break;
    }

    case 'rust': {
      ctx.fillStyle = C('#a4552a', '#8e8e8e');
      ctx.fillRect(0, 0, size, size);
      blotches(ctx, size, 70, C('#5e2b11', '#5c5c5c'), size * 0.13, 0.32, rng);
      blotches(ctx, size, 44, C('#e08a3c', '#c0c0c0'), size * 0.09, 0.3, rng);
      blotches(ctx, size, 18, C('#2f1608', '#3e3e3e'), size * 0.06, 0.35, rng);
      grain(26);
      break;
    }

    case 'grass': {
      ctx.fillStyle = C('#2f7d2a', '#7c7c7c');
      ctx.fillRect(0, 0, size, size);
      blotches(ctx, size, 26, C('#1d5a1c', '#5e5e5e'), size * 0.17, 0.4, rng);
      blotches(ctx, size, 20, C('#63b23c', '#a8a8a8'), size * 0.13, 0.35, rng);
      ctx.lineWidth = 1.4 * S;
      for (let i = 0; i < 6000; i++) {
        const x = rng() * size;
        const y = rng() * size;
        ctx.strokeStyle =
          mode === 'albedo'
            ? vary('#57ad34', (rng() - 0.5) * 0.05, 0.7 + rng() * 0.6, 0.6 + rng() * 0.8)
            : shade('#ffffff', 0.5 + rng() * 0.5);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rng() - 0.5) * 5 * S, y - rng() * 8 * S);
        ctx.stroke();
      }
      grain(14);
      break;
    }

    case 'water': {
      const g = ctx.createLinearGradient(0, 0, 0, size);
      g.addColorStop(0, C('#2a7fa0', '#909090'));
      g.addColorStop(1, C('#14556e', '#707070'));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = C('#bfeaf7', '#ffffff');
      for (let i = 0; i < 140; i++) {
        ctx.lineWidth = (1 + rng() * 2) * S;
        ctx.beginPath();
        const y = rng() * size;
        ctx.moveTo(0, y);
        for (let x = 0; x <= size; x += 16 * S) {
          ctx.lineTo(x, y + Math.sin(x * 0.025 + i) * 4 * S);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }

    case 'glass': {
      // Twelve panes across rather than four. These towers sit on the horizon,
      // and four big squares read as a gameplay checkerboard; a fine grid mips
      // down to a soft tint and stays where it belongs, in the backdrop.
      const n = 12;
      const cell = size / n;
      // Dark mullions, and dark overall: the curtain wall is a silhouette
      // first. The old near-white panes were the brightest thing in the frame.
      ctx.fillStyle = C('#10192a', '#2a2a2a');
      ctx.fillRect(0, 0, size, size);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const px = x * cell + 1.5 * S;
          const py = y * cell + 1.5 * S;
          const w = cell - 3 * S;
          // Panes catch the sky at different angles, and a few floors are lit
          // from inside; that variance is what makes a wall read as glass.
          const lit = rng();
          const warm = rng() < 0.06;
          const g2 = ctx.createLinearGradient(px, py, px, py + w);
          if (warm) {
            g2.addColorStop(0, C('#a98a4e', '#d8d8d8'));
            g2.addColorStop(1, C('#6a5326', '#c0c0c0'));
          } else {
            const v = 0.4 + lit * 0.75;
            g2.addColorStop(0, C(shade('#4b7ba4', v * 1.2), '#e8e8e8'));
            g2.addColorStop(1, C(shade('#20415f', v), '#c8c8c8'));
          }
          ctx.fillStyle = g2;
          ctx.fillRect(px, py, w, w);
        }
      }
      // A spandrel band every few floors, so the tower has horizontal
      // structure instead of one undifferentiated grid.
      ctx.fillStyle = C('#0d1420', '#404040');
      for (let y = 0; y < n; y += 4) ctx.fillRect(0, y * cell, size, cell * 0.3);
      grain(10);
      break;
    }

    case 'wood': {
      const planks = 4;
      const ph = size / planks;
      ctx.fillStyle = C('#2e1c0d', '#2a2a2a');
      ctx.fillRect(0, 0, size, size);
      for (let p = 0; p < planks; p++) {
        const y0 = p * ph + 2 * S;
        const ph2 = ph - 4 * S;
        const base = vary('#95602c', (rng() - 0.5) * 0.03, 0.75 + rng() * 0.5, 0.82 + rng() * 0.4);
        const g = ctx.createLinearGradient(0, y0, 0, y0 + ph2);
        g.addColorStop(0, C(shade(base, 1.14), '#f2f2f2'));
        g.addColorStop(0.5, C(base, '#ffffff'));
        g.addColorStop(1, C(shade(base, 0.78), '#d0d0d0'));
        ctx.fillStyle = g;
        ctx.fillRect(0, y0, size, ph2);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y0, size, ph2);
        ctx.clip();
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 1.5 * S;
        for (let i = 0; i < 26; i++) {
          ctx.strokeStyle = C(rng() > 0.5 ? '#4a2c12' : '#c99356', rng() > 0.5 ? '#b8b8b8' : '#ffffff');
          const y = y0 + rng() * ph2;
          const amp = rng() * 3 * S;
          ctx.beginPath();
          ctx.moveTo(0, y);
          for (let x = 0; x <= size; x += 12 * S) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * amp);
          ctx.stroke();
        }
        ctx.restore();
      }
      grain(16);
      break;
    }

    case 'ice': {
      ctx.fillStyle = C('#a9e2f7', '#c0c0c0');
      ctx.fillRect(0, 0, size, size);
      blotches(ctx, size, 34, C('#ffffff', '#ffffff'), size * 0.18, 0.45, rng);
      blotches(ctx, size, 20, C('#5aa8cc', '#8a8a8a'), size * 0.13, 0.3, rng);
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 2 * S;
      ctx.strokeStyle = C('#ffffff', '#ffffff');
      for (let i = 0; i < 22; i++) {
        ctx.beginPath();
        ctx.moveTo(rng() * size, rng() * size);
        ctx.lineTo(rng() * size, rng() * size);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }

    case 'sandstone': {
      const rows = 4;
      const h = size / rows;
      const w = h * 2;
      ctx.fillStyle = C('#8a7148', '#3a3a3a');
      ctx.fillRect(0, 0, size, size);
      for (let r = 0; r < rows; r++) {
        const offset = r % 2 ? w / 2 : 0;
        for (let x = -w; x < size + w; x += w) {
          const bx = x + offset + 4 * S;
          const by = r * h + 4 * S;
          const base = vary('#dcbc86', (rng() - 0.5) * 0.03, 0.7 + rng() * 0.5, 0.86 + rng() * 0.3);
          const g = ctx.createLinearGradient(bx, by, bx, by + h);
          g.addColorStop(0, C(shade(base, 1.1), '#ffffff'));
          g.addColorStop(1, C(shade(base, 0.78), '#c6c6c6'));
          ctx.fillStyle = g;
          ctx.fillRect(bx, by, w - 8 * S, h - 8 * S);
        }
      }
      blotches(ctx, size, 26, C('#9c8050', '#8e8e8e'), size * 0.1, 0.18, rng);
      grain(18);
      break;
    }

    case 'yellowRamp': {
      ctx.fillStyle = C('#ffc60a', '#c8c8c8');
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = C('#1a1a1a', '#ffffff');
      // Chevrons, so the player reads "grip and go" at a glance.
      const step = size / 2;
      for (let y = -size; y < size * 2; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size / 2, y + step * 0.5);
        ctx.lineTo(size, y);
        ctx.lineTo(size, y + step * 0.28);
        ctx.lineTo(size / 2, y + step * 0.78);
        ctx.lineTo(0, y + step * 0.28);
        ctx.closePath();
        ctx.fill();
      }
      if (mode === 'albedo') blotches(ctx, size, 16, '#8a6a00', size * 0.07, 0.14, rng);
      break;
    }

    case 'incline': {
      // Cable-car red with plank shadows, for the Duquesne Incline cars.
      const planks = 6;
      const ph = size / planks;
      ctx.fillStyle = C('#4d100e', '#2c2c2c');
      ctx.fillRect(0, 0, size, size);
      for (let p = 0; p < planks; p++) {
        const y0 = p * ph + 2 * S;
        const base = vary('#c8302a', (rng() - 0.5) * 0.02, 0.85 + rng() * 0.3, 0.88 + rng() * 0.28);
        const g = ctx.createLinearGradient(0, y0, 0, y0 + ph - 4 * S);
        g.addColorStop(0, C(shade(base, 1.18), '#ffffff'));
        g.addColorStop(1, C(shade(base, 0.75), '#c4c4c4'));
        ctx.fillStyle = g;
        ctx.fillRect(0, y0, size, ph - 4 * S);
      }
      // Cream trim line, the detail that makes the car read as a vehicle.
      ctx.fillStyle = C('#f4e3c0', '#e8e8e8');
      ctx.fillRect(0, size * 0.5 - 5 * S, size, 10 * S);
      grain(14);
      break;
    }
  }
  return canvas;
}

/** Sobel a height field into a tangent-space normal map. */
function normalFromHeight(height: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const size = height.width;
  const src = height.getContext('2d')!.getImageData(0, 0, size, size).data;
  const { canvas, ctx } = makeCanvas(size);
  const out = ctx.createImageData(size, size);
  const at = (x: number, y: number) =>
    src[((((y % size) + size) % size) * size + (((x % size) + size) % size)) * 4] / 255;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Sobel rather than a plain difference: it averages across three rows,
      // which keeps per-pixel canvas noise from becoming visible sparkle.
      const dx =
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
          at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * strength;
      const dy =
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
          at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * strength;
      // flipY on the texture means canvas +y is texture -v, so dy needs no flip.
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out.data[i] = (-dx / len) * 127.5 + 127.5;
      out.data[i + 1] = (dy / len) * 127.5 + 127.5;
      out.data[i + 2] = (1 / len) * 127.5 + 127.5;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

/** Surfaces with no relief worth faking; a normal map on these is wasted work. */
const FLAT: ReadonlySet<TextureName> = new Set<TextureName>(['water', 'glass', 'ice', 'yellowRamp']);

/** How much the derived normal map bends the light, per surface. */
const NORMAL_STRENGTH: Partial<Record<TextureName, number>> = {
  cobblestone: 2.6,
  brick: 1.8,
  steel: 1.6,
  steelPainted: 1.6,
  wood: 1.1,
  sandstone: 1.4,
  concrete: 0.8,
  asphalt: 0.9,
  rust: 1.0,
  grass: 0.9,
  incline: 0.9,
};

function finish(tex: THREE.Texture, srgb: boolean) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function getTexture(name: TextureName): THREE.Texture {
  const hit = cache.get(name);
  if (hit) return hit;
  const tex = finish(new THREE.CanvasTexture(drawSurface(name, ALBEDO_SIZE, 'albedo')), true);
  cache.set(name, tex);
  return tex;
}

export function getNormalMap(name: TextureName): THREE.Texture | null {
  if (FLAT.has(name)) return null;
  const key = `${name}#n`;
  const hit = cache.get(key);
  if (hit) return hit;
  const height = drawSurface(name, HEIGHT_SIZE, 'height');
  const tex = finish(
    new THREE.CanvasTexture(normalFromHeight(height, NORMAL_STRENGTH[name] ?? 1)),
    false,
  );
  cache.set(key, tex);
  return tex;
}

// ------------------------------------------------------------------ specials

/**
 * Equirectangular environment: sky gradient, a horizon haze band, ground, and
 * a bright sun disc. The sun disc is the point — a gradient alone gives the
 * marble a soft grey sheen, while a hot spot gives it the moving highlight
 * that makes it read as a polished sphere.
 */
export function makeEnvMap(
  renderer: THREE.WebGLRenderer,
  opts: { top: string; horizon: string; ground: string; sun: string; sunHeight: number },
): THREE.Texture {
  const w = 512;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, opts.top);
  g.addColorStop(0.42, opts.horizon);
  g.addColorStop(0.5, opts.horizon);
  g.addColorStop(0.56, opts.ground);
  g.addColorStop(1, shade(opts.ground, 0.65));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const sy = h * (0.5 - Math.max(-0.9, Math.min(0.9, opts.sunHeight)) * 0.5);
  const sx = w * 0.3;
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.42);
  glow.addColorStop(0, opts.sun);
  glow.addColorStop(0.12, opts.sun);
  glow.addColorStop(0.4, 'rgba(255,255,255,0.25)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

/**
 * The marble's own skin: a swirled blue-white glass ball. It is on screen for
 * every frame of the game, so it gets its own hand-tuned texture rather than
 * a flat colour.
 */
export function makeMarbleTexture(): THREE.Texture {
  const hit = cache.get('#marble');
  if (hit) return hit;
  const w = 512;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const rng = makeRng(0x9e3779b9);

  ctx.fillStyle = '#1d6fb8';
  ctx.fillRect(0, 0, w, h);

  // Broad bands first, then finer swirls on top: the same way a real swirled
  // glass marble layers, and it keeps the pattern readable while spinning.
  for (let i = 0; i < 26; i++) {
    const y = rng() * h;
    const amp = 10 + rng() * 34;
    const thick = 8 + rng() * 40;
    const light = rng();
    ctx.strokeStyle =
      light > 0.62 ? '#ffffff' : light > 0.32 ? '#8ddcf5' : '#0d4c8c';
    ctx.globalAlpha = 0.35 + rng() * 0.45;
    ctx.lineWidth = thick;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const phase = rng() * 6.28;
    ctx.moveTo(-10, y);
    for (let x = 0; x <= w + 10; x += 12) {
      ctx.lineTo(x, y + Math.sin(x * 0.012 + phase) * amp);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Bright flecks so the surface has something to catch the eye as it spins.
  for (let i = 0; i < 260; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 1 + rng() * 5;
    const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
    gg.addColorStop(0, 'rgba(255,255,255,0.85)');
    gg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  cache.set('#marble', tex);
  return tex;
}

/**
 * The face of a start or end pad: concentric rings and radial spokes, in the
 * pad's colour. Drawn rather than modelled because the pad has to read from
 * directly above at a glance and geometry that thin would z-fight.
 */
export function makePadTexture(key: string, rim: string, glyph: string): THREE.Texture {
  const cached = cache.get(`#pad:${key}`);
  if (cached) return cached;
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  const half = size / 2;

  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0, '#20242b');
  g.addColorStop(0.72, '#171a20');
  g.addColorStop(1, '#0c0e12');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = rim;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(half, half, half * 0.86, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(half, half, half * 0.64, 0, Math.PI * 2);
  ctx.stroke();

  // Radial spokes, echoing the sunburst on the reference pad.
  ctx.fillStyle = glyph;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(half * 0.22, -half * 0.05);
    ctx.lineTo(half * 0.6, -half * 0.02);
    ctx.lineTo(half * 0.6, half * 0.02);
    ctx.lineTo(half * 0.22, half * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const inner = ctx.createRadialGradient(half, half, 0, half, half, half * 0.24);
  inner.addColorStop(0, glyph);
  inner.addColorStop(1, rim);
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(half, half, half * 0.2, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(`#pad:${key}`, tex);
  return tex;
}

/** A soft additive disc, shared by every gem and powerup halo. */
export function getGlowTexture(): THREE.Texture {
  const hit = cache.get('#glow');
  if (hit) return hit;
  const size = 128;
  const { canvas, ctx } = makeCanvas(size);
  const half = size / 2;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set('#glow', tex);
  return tex;
}
