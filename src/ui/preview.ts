import type { Block, LevelDef, TextureName, Vec3 } from '../game/types';

/**
 * Level preview drawn straight from the level definition as a top-down plan.
 *
 * The obvious alternative — rendering the real scene to an offscreen target —
 * costs a full level build per thumbnail, which is exactly the hitch we are
 * trying to hide in level select. A plan view is instant, needs no assets, and
 * tells the player something a screenshot does not: the shape of the route and
 * where the gems are.
 */

const TEXTURE_COLOR: Record<TextureName, string> = {
  concrete: '#8d939b',
  brick: '#8c4f3c',
  cobblestone: '#6e747b',
  steel: '#98a2ad',
  steelPainted: '#4b7395',
  grass: '#54924c',
  water: '#2d6e9f',
  asphalt: '#4a4f56',
  glass: '#7fb6d6',
  wood: '#8d6b44',
  rust: '#93583a',
  ice: '#bfe6f5',
  sandstone: '#b09b73',
  yellowRamp: '#e0b52a',
  incline: '#c0392b',
};

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** XZ footprint of a block, already rotated and translated into world space. */
function footprint(b: Block): { x: number; z: number; w: number; d: number; yaw: number } {
  const [x, , z] = b.pos;
  const yaw = b.rot?.[1] ?? 0;
  switch (b.kind) {
    case 'box':
    case 'ramp': {
      // A roll about Z or X foreshortens the plan-view footprint; the incline's
      // track bed is the obvious case where ignoring it would overstate reach.
      const w = b.size[0] * Math.abs(Math.cos(b.rot?.[2] ?? 0));
      const d = b.size[2] * Math.abs(Math.cos(b.rot?.[0] ?? 0));
      return { x, z, w, d, yaw };
    }
    case 'cylinder':
      return { x, z, w: b.radius * 2, d: b.radius * 2, yaw };
    case 'arc': {
      const r = b.radius + b.width / 2;
      return { x, z, w: r * 2, d: r * 2, yaw };
    }
  }
}

function boundsOf(def: LevelDef): Bounds {
  const b: Bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const add = (x: number, z: number, rx: number, rz: number) => {
    b.minX = Math.min(b.minX, x - rx);
    b.maxX = Math.max(b.maxX, x + rx);
    b.minZ = Math.min(b.minZ, z - rz);
    b.maxZ = Math.max(b.maxZ, z + rz);
  };

  // Scenery is deliberately excluded: rivers and skylines run for hundreds of
  // units and would shrink the actual course to a smear in the middle.
  for (const blk of def.blocks) {
    if (blk.noCollide) continue;
    const f = footprint(blk);
    const c = Math.abs(Math.cos(f.yaw));
    const s = Math.abs(Math.sin(f.yaw));
    add(f.x, f.z, (f.w * c + f.d * s) / 2, (f.w * s + f.d * c) / 2);
  }
  for (const e of def.entities) add(e.pos[0], e.pos[2], 1, 1);

  if (!isFinite(b.minX)) return { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
  return b;
}

export function drawLevelMap(canvas: HTMLCanvasElement, def: LevelDef) {
  const cssW = canvas.clientWidth || 320;
  const cssH = canvas.clientHeight || 200;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  // Backing: a faint blueprint grid so an empty corner still reads as "map".
  const sky = ctx.createLinearGradient(0, 0, 0, cssH);
  sky.addColorStop(0, '#141b24');
  sky.addColorStop(1, '#0b0f15');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cssW, cssH);

  const b = boundsOf(def);
  const pad = 14;
  const spanX = Math.max(b.maxX - b.minX, 1);
  const spanZ = Math.max(b.maxZ - b.minZ, 1);
  const scale = Math.min((cssW - pad * 2) / spanX, (cssH - pad * 2) / spanZ);
  const ox = (cssW - spanX * scale) / 2 - b.minX * scale;
  const oz = (cssH - spanZ * scale) / 2 - b.minZ * scale;
  const px = (x: number) => ox + x * scale;
  const pz = (z: number) => oz + z * scale;

  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 1;
  const grid = 10 * scale;
  if (grid > 6) {
    ctx.beginPath();
    for (let x = px(Math.ceil(b.minX / 10) * 10); x < cssW; x += grid) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, cssH);
    }
    for (let z = pz(Math.ceil(b.minZ / 10) * 10); z < cssH; z += grid) {
      ctx.moveTo(0, Math.round(z) + 0.5);
      ctx.lineTo(cssW, Math.round(z) + 0.5);
    }
    ctx.stroke();
  }

  // Height range, used to shade the plan so climbs read as lighter.
  let minY = Infinity;
  let maxY = -Infinity;
  for (const blk of def.blocks) {
    if (blk.noCollide) continue;
    minY = Math.min(minY, blk.pos[1]);
    maxY = Math.max(maxY, blk.pos[1]);
  }
  const ySpan = Math.max(maxY - minY, 1);

  const drawBlock = (blk: Block, alpha: number) => {
    const f = footprint(blk);
    const color = TEXTURE_COLOR[blk.texture ?? 'concrete'] ?? '#8d939b';
    const lift = (blk.pos[1] - minY) / ySpan;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px(f.x), pz(f.z));
    // Three's +Y rotation and canvas's rotation run opposite ways once Z is
    // drawn as the canvas Y axis, so the yaw has to be negated here.
    ctx.rotate(-f.yaw);
    ctx.fillStyle = color;
    // Higher ground is lit more strongly, which is the only depth cue a plan
    // view gets.
    ctx.globalAlpha = alpha * (0.55 + lift * 0.45);
    if (blk.kind === 'arc') {
      // Canvas angles run the same way the arc builder sweeps them (x = cos,
      // z = sin), so the sweep maps across without a sign flip.
      ctx.beginPath();
      ctx.arc(0, 0, blk.radius * scale, Math.min(0, blk.angle), Math.max(0, blk.angle));
      ctx.lineWidth = Math.max(1, blk.width * scale);
      ctx.strokeStyle = color;
      ctx.stroke();
    } else if (blk.kind === 'cylinder') {
      ctx.beginPath();
      ctx.arc(0, 0, (f.w / 2) * scale, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect((-f.w / 2) * scale, (-f.d / 2) * scale, f.w * scale, f.d * scale);
    }
    ctx.restore();
  };

  for (const blk of def.blocks) if (blk.noCollide) drawBlock(blk, 0.18);
  for (const blk of def.blocks) if (!blk.noCollide) drawBlock(blk, 1);

  // Entities on top, in the colours they have in the world.
  const dot = (p: Vec3, r: number, fill: string, glow?: string) => {
    ctx.beginPath();
    ctx.arc(px(p[0]), pz(p[2]), r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 8;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
  };

  for (const e of def.entities) {
    switch (e.kind) {
      case 'gem':
        dot(e.pos, 2.4, '#ff3fc8', 'rgba(255,63,200,0.9)');
        break;
      case 'powerup':
        dot(e.pos, 3, '#ffd34d', 'rgba(255,211,77,0.8)');
        break;
      case 'timeTravel':
        dot(e.pos, 3, '#7fe6ff', 'rgba(127,230,255,0.8)');
        break;
      case 'hazard':
        dot(e.pos, 2.6, '#ff5a3c');
        break;
      case 'startPad':
        ring(ctx, px(e.pos[0]), pz(e.pos[2]), 6, '#5ce08a');
        break;
      case 'endPad':
        ring(ctx, px(e.pos[0]), pz(e.pos[2]), 6, '#4db6ff');
        break;
      default:
        break;
    }
  }

  // Vignette, so the map sits inside its frame instead of running to the edge.
  const vig = ctx.createRadialGradient(cssW / 2, cssH / 2, cssH * 0.25, cssW / 2, cssH / 2, cssH * 0.8);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, cssW, cssH);
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;
}
