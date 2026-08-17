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
      //
      // The layout, though, is now a course rather than a lattice. Setts on a
      // lattice line up in both axes, and a plaza built from that is a
      // chequerboard: every joint continues to the horizon, every cell is the
      // same size, and the only thing that varies is a random tone per cell —
      // which is high-frequency noise, not structure. Real Belgian block runs
      // in courses of unequal-width stones, so the cross joints stagger and the
      // eye is left with one legible direction to track instead of two
      // competing ones. Widths are renormalised to fill the tile exactly, so
      // the run still wraps.
      const n = 9;
      const cell = size / n;
      ctx.fillStyle = C('#221d18', '#1e1e1e');
      ctx.fillRect(0, 0, size, size);
      for (let row = 0; row < n; row++) {
        const widths: number[] = [];
        let total = 0;
        for (let i = 0; i < n; i++) {
          const w = 0.74 + rng() * 0.52;
          widths.push(w);
          total += w;
        }
        for (let i = 0; i < n; i++) widths[i] *= size / total;
        const phase = rng() * size;
        // A course is one batch of stone, so its value carries along the whole
        // run. That is the frequency the old version was missing: per-sett
        // random value averages to a flat field at ten metres, while a course
        // stays a band you can still see — and a band is what tells you which
        // way the paving, and therefore the platform, runs.
        const courseWarm = rng() < 0.42;
        const courseL = 0.84 + rng() * 0.3;
        const courseHue = (rng() - 0.5) * 0.04;
        // Every third course is laid against a wider joint. It costs nothing
        // and it puts a mark every 0.66 units — near enough to the marble's own
        // width to be the ruler the eye measures the floor against.
        const jointY = row % 3 === 0 ? cell * 0.095 : cell * 0.05;
        let x = phase;
        for (let i = 0; i < n; i++) {
          const w = widths[i];
          const cx = x + w / 2;
          const cy = row * cell + cell / 2;
          x += w;
          const hw = w / 2 - cell * 0.055;
          const hh = cell / 2 - jointY;
          const round = cell * 0.16;
          const rot = (rng() - 0.5) * 0.1;
          // Pittsburgh setts are dark grey granite with warm brown ones mixed
          // through. Anything lighter than this drifts to pastel under a key
          // light that already puts lit faces near clipping. Most of a course
          // is one type, with the odd stone from the other batch — a course of
          // one colour reads as a painted stripe, a random mix as static.
          const warm = rng() < 0.85 ? courseWarm : !courseWarm;
          // Deliberately narrow. Sett-to-sett value swings are the shimmer:
          // they are a pixel or two wide at any distance worth looking at, so
          // they never resolve into anything, they just crawl. The variety has
          // been moved up to the course and up again to the macro map, both of
          // which are large enough to survive the mip chain.
          const jitter = 0.965 + rng() * 0.07;
          const base = warm
            ? vary('#6b5236', courseHue + (rng() - 0.5) * 0.02, 0.78 + rng() * 0.24, courseL * jitter)
            : vary('#66686b', courseHue + (rng() - 0.5) * 0.03, 0.6 + rng() * 0.4, courseL * jitter);
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
              bevelStone(ctx, hw, hh, cell * 0.13, base, shade(base, 1.18), shade(base, 0.55));
              // Quarry grain, so a sett reads as stone rather than plastic.
              ctx.globalAlpha = 0.14;
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
      // Half the grain the setts used to carry. Per-texel noise on a surface
      // seen mostly at a grazing angle never resolves; it only crawls through
      // the mip chain as the camera moves.
      grain(8);
      break;
    }

    case 'concrete': {
      // A sixth darker than it was. Measured on the Incline, a sunlit concrete
      // platform came out at 196 of 255 — within a few levels of clipping,
      // where the joints below have no room left to read and nothing standing
      // on it can separate from it either. Poured concrete is a mid grey; it
      // only looked white because the key light here is hard.
      ctx.fillStyle = C('#a6a397', '#8a8a8a');
      ctx.fillRect(0, 0, size, size);
      blotches(ctx, size, 46, C('#848175', '#6d6d6d'), size * 0.16, 0.28, rng);
      blotches(ctx, size, 22, C('#c4c1b6', '#b4b4b4'), size * 0.11, 0.24, rng);
      // Expansion joints: the only hard edge on an otherwise soft surface, and
      // the thing that gives a big slab a sense of scale. Two grades of them,
      // because one was not enough — a tile is seven world units here, so a
      // single cross put a mark every 3.6 units and the Mount Washington steps
      // came out as an unbroken pale field with nothing in it to judge where a
      // tread ended. The quarter joints bring that down to 1.8 units, close
      // enough to the marble's own width to be read as a scale.
      const joint = (w: number, at: number[], color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = w * S;
        ctx.beginPath();
        for (const f of at) {
          ctx.moveTo(0, size * f);
          ctx.lineTo(size, size * f);
          ctx.moveTo(size * f, 0);
          ctx.lineTo(size * f, size);
        }
        ctx.stroke();
      };
      joint(2, [0.25, 0.75], C('#a2a094', '#5a5a5a'));
      joint(3.5, [0.5], C('#7c7a6f', '#303030'));
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
      // Two crossed sets of crests rather than one. A single set of parallel
      // streaks on a ground plane all converge on the vanishing point, and a
      // surface whose lines converge reads as a wall you are looking down —
      // which is exactly what the river under the bridge was doing.
      //
      // Drawn per pixel from wrapping sines: the old version had a top-to-
      // bottom gradient, which cannot wrap, so every tile boundary showed as a
      // hard step across the middle of the river.
      const img = ctx.getImageData(0, 0, size, size);
      // The albedo barely moves. Water has one colour; what varies over it is
      // the light it throws back, and that comes from the normal map and the
      // Fresnel in builder.ts. Painting the waves into the colour instead gave
      // a two-tone mottle that read as mud under a warm sun — and levels tint
      // this plane to their own river, so a dark base comes out as tar.
      const deep = new THREE.Color(C('#2a6d88', '#000000'));
      const crest = new THREE.Color(C('#3d849f', '#ffffff'));
      const TAU = Math.PI * 2;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const v = y / size;
          // Long swell along one axis, shorter chop across it, and a fine
          // third set at an angle so no direction dominates for long.
          let h =
            Math.sin(TAU * (3 * u + Math.sin(TAU * 2 * v) * 0.07)) * 0.38 +
            Math.sin(TAU * (5 * v + Math.sin(TAU * 3 * u) * 0.08)) * 0.28 +
            Math.sin(TAU * (7 * u + 4 * v)) * 0.19 +
            Math.sin(TAU * (11 * v - 6 * u)) * 0.15;
          h = Math.max(0, Math.min(1, h * 0.5 + 0.5));
          const i = (y * size + x) * 4;
          if (mode === 'albedo') {
            // Crests catch the sky and troughs go to the river's own colour;
            // the sharpening keeps the bright edge thin, the way a wave does.
            const t = Math.pow(h, 1.7);
            img.data[i] = clamp255((deep.r + (crest.r - deep.r) * t) * 255);
            img.data[i + 1] = clamp255((deep.g + (crest.g - deep.g) * t) * 255);
            img.data[i + 2] = clamp255((deep.b + (crest.b - deep.b) * t) * 255);
          } else {
            const g2 = clamp255(h * 255);
            img.data[i] = g2;
            img.data[i + 1] = g2;
            img.data[i + 2] = g2;
          }
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      break;
    }

    case 'glass': {
      // A curtain wall drawn at building scale: with a tile every eight world
      // units, eight panes across puts a window at about a metre, which is
      // still five pixels wide on a tower a hundred units out. Twelve panes
      // mipped away to a flat tint at that range, which is exactly why the
      // skyline read as painted slabs rather than as buildings.
      const n = 8;
      const cell = size / n;
      // A storey is a band of glass over a solid spandrel, not a square. That
      // horizontal beat is what the eye counts to decide a distant box is
      // forty floors of building; a square grid of equal cells is a
      // chequerboard whichever colours it is painted in.
      const glazing = cell * 0.58;
      ctx.fillStyle = C('#16202f', '#2a2a2a');
      ctx.fillRect(0, 0, size, size);
      for (let y = 0; y < n; y++) {
        // The spandrel: the concrete edge of the floor slab, in shadow.
        ctx.fillStyle = C('#0b1220', '#3c3c3c');
        ctx.fillRect(0, y * cell + glazing, size, cell - glazing);
        for (let x = 0; x < n; x++) {
          const px = x * cell + 2 * S;
          const py = y * cell + 2 * S;
          const w = cell - 4 * S;
          const h2 = glazing - 3 * S;
          // Glass mirrors the sky, so a wall grades from bright at the top of
          // the building to dark where it reflects the ground. Per-pane
          // variance rides on that grade rather than replacing it. Kept
          // gentle: the grade repeats with the tile, and a steep one would
          // band the tower into stripes every eight units.
          const sky = 1.14 - (y / n) * 0.3;
          const lit = 0.82 + rng() * 0.38;
          const warm = rng() < 0.035;
          const g2 = ctx.createLinearGradient(px, py, px, py + h2);
          if (warm) {
            g2.addColorStop(0, C('#d8b166', '#d8d8d8'));
            g2.addColorStop(1, C('#8a6a30', '#c0c0c0'));
          } else {
            const v = sky * lit;
            g2.addColorStop(0, C(shade('#6f9fc6', v * 1.15), '#e8e8e8'));
            g2.addColorStop(1, C(shade('#22456a', v), '#c8c8c8'));
          }
          ctx.fillStyle = g2;
          ctx.fillRect(px, py, w, h2);
        }
      }
      // Piers every four bays, so the wall has vertical structure too.
      ctx.fillStyle = C('#39485c', '#6a6a6a');
      for (let x = 0; x < n; x += 4) ctx.fillRect(x * cell - 2.5 * S, 0, 6 * S, size);
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

// -------------------------------------------------------- macro variation
/**
 * A tiling texture can only ever say what happens inside one tile. Past that
 * it repeats, and a plaza built from a 2-unit tile repeats twenty times before
 * it reaches the far kerb — which is why our cobble read as wallpaper. These
 * maps carry the frequencies a tile cannot: drainage falls, wear paths,
 * patched repairs, damp streaks. They are multiplied over the albedo in world
 * space (see builder.ts), at tens of units per repeat, so the pattern the eye
 * picks up is far larger than the pattern it can trace back to a tile.
 *
 * Mid grey is the identity: the shader doubles the sample, so 0.5 leaves the
 * surface exactly as drawn.
 */
export type MacroKind = 'paving' | 'stone' | 'green' | 'metal' | 'city';

const MACRO_SIZE = 256;

/**
 * Value noise on a periodic lattice. Periodic is the whole point — a macro map
 * with a visible seam is worse than no macro map, because the seam is a hard
 * line at exactly the scale the eye is scanning for.
 */
function periodicNoise(seed: number, cells: number) {
  const g = new Float32Array(cells * cells);
  const rng = makeRng(seed);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const at = (x: number, y: number) =>
    g[(((y % cells) + cells) % cells) * cells + (((x % cells) + cells) % cells)];
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const fx = x * cells;
    const fy = y * cells;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fade(fx - x0);
    const ty = fade(fy - y0);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
}

function drawMacro(kind: MacroKind): HTMLCanvasElement {
  const size = MACRO_SIZE;
  const { canvas, ctx } = makeCanvas(size);
  const seed = hashSeed(`macro:${kind}`);
  const n2 = periodicNoise(seed, 2);
  const n4 = periodicNoise(seed ^ 0x51, 4);
  const n8 = periodicNoise(seed ^ 0x9e37, 8);
  const n16 = periodicNoise(seed ^ 0x2545, 16);
  const img = ctx.createImageData(size, size);
  const field = new Float32Array(size * size);
  const tints = new Float32Array(size * size);

  // A soft line at `at`, measured the short way round the tile so it wraps.
  const ridge = (v: number, at: number, width: number) => {
    let d = Math.abs(((v - at) % 1) + 1) % 1;
    if (d > 0.5) d = 1 - d;
    return Math.exp(-(d * d) / (width * width));
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const fbm = n4(u, v) * 0.5 + n8(u, v) * 0.32 + n16(u, v) * 0.18;
      // Warp every straight feature by the coarse octave, so a channel reads
      // as a fall in the paving rather than as a ruled line.
      const wu = u + (n4(u + 0.31, v) - 0.5) * 0.06;
      const wv = v + (n4(u, v + 0.71) - 0.5) * 0.06;
      let t = 0.5;
      let warm = 1;

      switch (kind) {
        case 'paving': {
          t = 0.5 + (fbm - 0.5) * 0.58;
          // Bays. Real paving is laid in courses about ten units across, each
          // course a slightly different batch, with a joint between them — and
          // that grid, not the stones, is what the eye uses to judge the size
          // of a plaza. Nothing at tile scale can supply it.
          //
          // The batch step used to be ±10%, which measured out as a field that
          // was flat to within a couple of levels of grey over a whole plaza —
          // present in the data, invisible on screen. Real batches of stone are
          // further apart than that, and this is the one frequency in the whole
          // material that is large enough to survive distance.
          const bu = wu * 3;
          const bv = wv * 3;
          const bay = Math.floor(bu) * 7 + Math.floor(bv) * 13;
          t *= 0.8 + (Math.abs(bay * 2654435761) % 97) / 97 * 0.42;
          // Wide, because narrow is invisible: the ground is seen at a grazing
          // angle, where a pixel's footprint covers a metre or more of it and
          // anything thinner than that is averaged out by the mip chain long
          // before it reaches the screen. Everything here is a metre across at
          // the least.
          const joint = (f: number) => {
            const d = Math.min(f - Math.floor(f), 1 - (f - Math.floor(f)));
            return Math.exp(-(d * d) / 0.017);
          };
          t -= 0.5 * Math.max(joint(bu), joint(bv));
          // A patched repair: flatter and lighter than what is around it.
          if (n2(u, v) > 0.66) t = t * 0.45 + 0.34 + (fbm - 0.5) * 0.1;
          // Two drainage falls, crossing.
          t -= 0.42 * ridge(wv, 0.46, 0.055) + 0.32 * ridge(wu, 0.19, 0.045);
          // The wear path down the middle of the traffic: polished lighter.
          t += 0.22 * ridge(wv + (n2(u, v) - 0.5) * 0.14, 0.78, 0.12);
          warm = 1 + (n8(u + 0.5, v) - 0.5) * 0.06;
          break;
        }
        case 'stone': {
          // Weathering: damp runs down the wall and dirt gathers in patches.
          t = 0.5 + (fbm - 0.5) * 0.5;
          const streak = n8(u * 1.0, v * 0.12);
          t -= Math.max(0, streak - 0.55) * 0.55;
          t += Math.max(0, n4(u + 0.2, v * 0.5) - 0.62) * 0.4;
          break;
        }
        case 'green': {
          // Mown stripes first — a big lawn is read by its bands — then dry
          // patches and the worn line where everybody walks.
          const stripe = Math.sin(u * Math.PI * 2 * 4) * 0.5 + 0.5;
          t = 0.5 + (stripe - 0.5) * 0.09 + (fbm - 0.5) * 0.4;
          const dry = Math.max(0, n4(u + 0.6, v + 0.2) - 0.58);
          t += dry * 0.5;
          warm = 1 + dry * 0.5;
          t -= 0.22 * ridge(wu + (n2(u, v) - 0.5) * 0.2, 0.35, 0.05);
          break;
        }
        case 'metal': {
          // Grime collects in long runs along a girder, not in blobs.
          const run = n8(u * 0.15, v) * 0.6 + n16(u * 0.3, v) * 0.4;
          t = 0.5 + (run - 0.5) * 0.45;
          t -= Math.max(0, n4(u * 0.4, v) - 0.6) * 0.35;
          break;
        }
        case 'city': {
          // Whole-building variation: the towers are one texture, and without
          // this every one of them is the same value as its neighbour.
          t = 0.5 + (n2(u, v) - 0.5) * 0.6 + (n8(u, v) - 0.5) * 0.14;
          warm = 1 + (n4(u, v) - 0.5) * 0.12;
          break;
        }
      }

      // Asymmetric on purpose. The key light puts a lit surface close to
      // clipping, so anything the macro map brightens is thrown away by the
      // display, and only what it darkens survives to be seen.
      field[y * size + x] = Math.max(0.15, Math.min(0.78, t));
      tints[y * size + x] = warm;
    }
  }

  // Recentre on mid grey. The shader treats 0.5 as identity, so a field that
  // averages anything else would quietly darken or lift every surface it is
  // applied to — and the tone of these surfaces was tuned without it.
  let mean = 0;
  for (const f of field) mean += f;
  mean /= field.length;
  for (let i = 0; i < field.length; i++) {
    const t = Math.max(0.1, Math.min(0.95, field[i] + (0.5 - mean)));
    const warm = tints[i];
    img.data[i * 4] = clamp255(t * warm * 255);
    img.data[i * 4 + 1] = clamp255(t * 255);
    img.data[i * 4 + 2] = clamp255(t * (2 - warm) * 255);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function getMacroMap(kind: MacroKind): THREE.Texture {
  const key = `#macro:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  // No colour space conversion: these are multipliers, not colours, and 0.5
  // has to survive the round trip as exactly 0.5 or every surface shifts.
  const tex = finish(new THREE.CanvasTexture(drawMacro(kind)), false);
  cache.set(key, tex);
  return tex;
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

/**
 * Surfaces with no relief worth faking; a normal map on these is wasted work.
 * Water is not among them any more: a mirror-flat plane reflects one uniform
 * sky and answers the key light nowhere, which is why the river had no
 * highlight and read as painted card.
 */
const FLAT: ReadonlySet<TextureName> = new Set<TextureName>(['glass', 'ice', 'yellowRamp']);

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
  water: 1.5,
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
 * The marble's own skin. It is on screen for every frame of the game, so it
 * gets its own hand-tuned texture rather than a flat colour.
 *
 * Redrawn for contrast rather than for prettiness. Two critics measured the old
 * one at a mean of 139 against a walkway at 120 — nineteen levels apart, in the
 * same blue-grey family — and it disappeared.
 *
 * The floors of the six levels were then measured: they run from 26 (Kennywood's
 * creosoted deck) to 196 (a sunlit concrete platform on the Incline), and most
 * of them cluster between 80 and 160. A mid-value ball is inside that cluster
 * wherever it goes, which is exactly what went wrong; a dark ball trades the
 * pale floors for the dark ones. The way out is not a value at all — it is the
 * pair. The body is taken as light as it can go without the sunlit side
 * clipping into a featureless disc, which beats every floor below 160 outright,
 * and the near-black rim shell in level.ts covers the handful of floors that are
 * lighter still. Between them there is no surface in the game the marble can sit
 * on and disappear.
 *
 * So: a pearl body with a deep cobalt swirl, rather than a cobalt body with a
 * pale swirl. The swirl is what the eye tracks as the ball spins, and it has to
 * be the dark element for the same reason the ball is the light one.
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

  ctx.fillStyle = '#f7fbff';
  ctx.fillRect(0, 0, w, h);

  // Fewer, thinner bands than before, so most of the ball stays pearl. The old
  // set covered the canvas twice over and the base colour never showed, which
  // is how a marble ends up being one averaged value however many colours went
  // into it.
  for (let i = 0; i < 18; i++) {
    const y = rng() * h;
    const amp = 10 + rng() * 34;
    const thick = 6 + rng() * 22;
    const light = rng();
    ctx.strokeStyle =
      light > 0.62 ? '#8fd6ff' : light > 0.34 ? '#1c5cb0' : light > 0.14 ? '#ffffff' : '#0a1f45';
    ctx.globalAlpha = 0.4 + rng() * 0.45;
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

  // One deep cobalt ribbon wound right round the ball. Thirty unbroken pixels
  // of it is the only feature that survives the marble being forty pixels
  // across at the far end of a level, and it is what turns the spin into
  // something you can see rather than a shimmer.
  ctx.strokeStyle = '#123a86';
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 30;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-10, h * 0.42);
  for (let x = 0; x <= w + 10; x += 10) {
    ctx.lineTo(x, h * 0.42 + Math.sin((x / w) * Math.PI * 2) * h * 0.2);
  }
  ctx.stroke();
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
 * The marble's contact shadow: a soft dark disc laid on the ground under it.
 *
 * The sun's own shadow map already casts a shadow, but it lands wherever the
 * sun happens to be — often behind the marble and out of frame — so it does
 * nothing to tie the ball to the floor. This one is always directly underneath.
 * It does two jobs at once: it stops the marble reading as a sticker floating
 * over the paving, and it darkens the few pixels of floor that immediately
 * surround the silhouette, which is precisely where the separation is measured.
 *
 * White with a falling alpha rather than a black-to-transparent gradient: the
 * material tints it, so the same texture can serve any shade.
 */
export function getContactShadowTexture(): THREE.Texture {
  const hit = cache.get('#contact');
  if (hit) return hit;
  const size = 128;
  const { canvas, ctx } = makeCanvas(size);
  const half = size / 2;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  // Nearly solid out to a third of the radius, then a long tail. A shadow with
  // a hard edge reads as a painted disc; one that is all tail reads as grime.
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.34, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.42)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set('#contact', tex);
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
