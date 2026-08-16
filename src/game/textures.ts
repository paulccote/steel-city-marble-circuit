import * as THREE from 'three';
import type { TextureName } from './types';

/**
 * Procedural textures. Everything is drawn to a canvas at load time so the
 * game ships as one bundle with no image requests — which is what keeps the
 * first level playable within a second of opening the page.
 */

const cache = new Map<string, THREE.Texture>();

function makeCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { canvas: c, ctx: c.getContext('2d')! };
}

function noise(ctx: CanvasRenderingContext2D, size: number, amount: number, alpha = 0.08) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] = clamp(d[i] + n);
    d[i + 1] = clamp(d[i + 1] + n);
    d[i + 2] = clamp(d[i + 2] + n);
  }
  ctx.putImageData(img, 0, 0);
  void alpha;
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Soft blotches, for weathering and dirt. */
function blotches(
  ctx: CanvasRenderingContext2D,
  size: number,
  count: number,
  color: string,
  maxR: number,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * maxR + 2;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function bricks(ctx: CanvasRenderingContext2D, size: number, rows: number, base: string, mortar: string) {
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, size, size);
  const h = size / rows;
  const w = h * 2.2;
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 ? w / 2 : 0;
    for (let x = -w; x < size + w; x += w) {
      // Vary each brick so the wall does not read as a repeating tile.
      const shade = 0.82 + Math.random() * 0.36;
      ctx.fillStyle = shadeColor(base, shade);
      ctx.fillRect(x + offset + 1, r * h + 1, w - 2, h - 2);
    }
  }
}

function shadeColor(hex: string, mul: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(mul);
  return `#${c.getHexString()}`;
}

function draw(name: TextureName): HTMLCanvasElement {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);

  switch (name) {
    case 'brick': {
      bricks(ctx, size, 10, '#8f4a35', '#c9beb2');
      blotches(ctx, size, 40, '#2b1a12', 30, 0.18);
      noise(ctx, size, 22);
      break;
    }
    case 'cobblestone': {
      ctx.fillStyle = '#40434a';
      ctx.fillRect(0, 0, size, size);
      const cell = size / 8;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const jx = (Math.random() - 0.5) * 3;
          const jy = (Math.random() - 0.5) * 3;
          const shade = 0.7 + Math.random() * 0.6;
          ctx.fillStyle = shadeColor('#7b7f88', shade);
          ctx.beginPath();
          const cx = x * cell + cell / 2 + jx;
          const cy = y * cell + cell / 2 + jy;
          ctx.ellipse(cx, cy, cell * 0.44, cell * 0.4, Math.random(), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      noise(ctx, size, 26);
      break;
    }
    case 'concrete': {
      ctx.fillStyle = '#9a9a95';
      ctx.fillRect(0, 0, size, size);
      blotches(ctx, size, 60, '#6f6f6b', 40, 0.25);
      blotches(ctx, size, 20, '#c8c8c2', 30, 0.2);
      noise(ctx, size, 20);
      break;
    }
    case 'asphalt': {
      ctx.fillStyle = '#3a3b3d';
      ctx.fillRect(0, 0, size, size);
      blotches(ctx, size, 70, '#252628', 26, 0.3);
      blotches(ctx, size, 30, '#55575a', 18, 0.25);
      noise(ctx, size, 26);
      break;
    }
    case 'steel': {
      ctx.fillStyle = '#6f7479';
      ctx.fillRect(0, 0, size, size);
      // Brushed vertical grain plus rivet rows: the language of Pittsburgh's
      // truss bridges.
      for (let x = 0; x < size; x += 2) {
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = Math.random() > 0.5 ? '#8b9096' : '#585d62';
        ctx.fillRect(x, 0, 1, size);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#4c5155';
      for (let y = 16; y < size; y += 64) {
        for (let x = 16; x < size; x += 32) {
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#878c92';
          ctx.beginPath();
          ctx.arc(x - 0.8, y - 0.8, 1.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#4c5155';
        }
      }
      noise(ctx, size, 14);
      break;
    }
    case 'steelPainted': {
      // Aztec gold, the colour of the Three Sisters bridges.
      ctx.fillStyle = '#e2a72e';
      ctx.fillRect(0, 0, size, size);
      blotches(ctx, size, 30, '#a8761a', 26, 0.28);
      blotches(ctx, size, 14, '#f6cd6a', 22, 0.22);
      ctx.fillStyle = '#b4831f';
      for (let y = 16; y < size; y += 64) {
        for (let x = 16; x < size; x += 32) {
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      noise(ctx, size, 12);
      break;
    }
    case 'rust': {
      ctx.fillStyle = '#8a4c28';
      ctx.fillRect(0, 0, size, size);
      blotches(ctx, size, 80, '#5a2d14', 34, 0.3);
      blotches(ctx, size, 40, '#c07840', 24, 0.25);
      noise(ctx, size, 28);
      break;
    }
    case 'grass': {
      ctx.fillStyle = '#3f6b33';
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 4000; i++) {
        ctx.strokeStyle = shadeColor('#5c9445', 0.6 + Math.random() * 0.8);
        ctx.beginPath();
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 3, y - Math.random() * 4);
        ctx.stroke();
      }
      noise(ctx, size, 16);
      break;
    }
    case 'water': {
      const g = ctx.createLinearGradient(0, 0, 0, size);
      g.addColorStop(0, '#2f5d6e');
      g.addColorStop(1, '#1d3f4e');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      ctx.globalAlpha = 0.16;
      for (let i = 0; i < 120; i++) {
        ctx.strokeStyle = '#a9d8e8';
        ctx.lineWidth = 1 + Math.random();
        ctx.beginPath();
        const y = Math.random() * size;
        ctx.moveTo(0, y);
        for (let x = 0; x <= size; x += 16) {
          ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 2);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'glass': {
      ctx.fillStyle = '#2b4a63';
      ctx.fillRect(0, 0, size, size);
      const cell = size / 8;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          ctx.fillStyle = shadeColor('#4d7ea6', 0.6 + Math.random() * 0.8);
          ctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
        }
      }
      break;
    }
    case 'wood': {
      ctx.fillStyle = '#7b5433';
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 60; i++) {
        ctx.globalAlpha = 0.14;
        ctx.strokeStyle = Math.random() > 0.5 ? '#4e331d' : '#a3754a';
        ctx.lineWidth = 1 + Math.random() * 3;
        ctx.beginPath();
        const y = Math.random() * size;
        ctx.moveTo(0, y);
        for (let x = 0; x <= size; x += 12) ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 3);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#3d2715';
      ctx.lineWidth = 2;
      for (let y = 0; y < size; y += size / 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
      noise(ctx, size, 16);
      break;
    }
    case 'ice': {
      ctx.fillStyle = '#bfe4f0';
      ctx.fillRect(0, 0, size, size);
      blotches(ctx, size, 40, '#ffffff', 40, 0.4);
      blotches(ctx, size, 20, '#7fb6cc', 30, 0.25);
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#ffffff';
      for (let i = 0; i < 18; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * size, Math.random() * size);
        ctx.lineTo(Math.random() * size, Math.random() * size);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'sandstone': {
      ctx.fillStyle = '#c2a678';
      ctx.fillRect(0, 0, size, size);
      bricksOverlay(ctx, size);
      blotches(ctx, size, 40, '#8f754c', 28, 0.2);
      noise(ctx, size, 18);
      break;
    }
    case 'yellowRamp': {
      ctx.fillStyle = '#f0c419';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#1c1c1c';
      // Chevrons, so the player reads "grip and go" at a glance.
      for (let y = -size; y < size * 2; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size / 2, y + 32);
        ctx.lineTo(size, y);
        ctx.lineTo(size, y + 18);
        ctx.lineTo(size / 2, y + 50);
        ctx.lineTo(0, y + 18);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'incline': {
      // Cable-car red with plank shadows, for the Duquesne Incline cars.
      ctx.fillStyle = '#8d2b26';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#6d1f1b';
      for (let y = 0; y < size; y += 32) ctx.fillRect(0, y, size, 3);
      blotches(ctx, size, 24, '#3d100e', 24, 0.2);
      noise(ctx, size, 14);
      break;
    }
  }
  return canvas;
}

function bricksOverlay(ctx: CanvasRenderingContext2D, size: number) {
  ctx.strokeStyle = 'rgba(90,70,45,0.5)';
  ctx.lineWidth = 2;
  const h = size / 6;
  const w = h * 2;
  for (let r = 0; r < 6; r++) {
    const offset = r % 2 ? w / 2 : 0;
    ctx.beginPath();
    ctx.moveTo(0, r * h);
    ctx.lineTo(size, r * h);
    ctx.stroke();
    for (let x = -w; x < size + w; x += w) {
      ctx.beginPath();
      ctx.moveTo(x + offset, r * h);
      ctx.lineTo(x + offset, (r + 1) * h);
      ctx.stroke();
    }
  }
}

export function getTexture(name: TextureName): THREE.Texture {
  const hit = cache.get(name);
  if (hit) return hit;
  const tex = new THREE.CanvasTexture(draw(name));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(name, tex);
  return tex;
}

/** A cloned texture with its own repeat, since repeat is per-texture. */
export function getTextureScaled(name: TextureName, repeatX: number, repeatY: number): THREE.Texture {
  const key = `${name}:${repeatX.toFixed(3)}:${repeatY.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = getTexture(name).clone();
  tex.needsUpdate = true;
  tex.repeat.set(repeatX, repeatY);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  cache.set(key, tex);
  return tex;
}

/** Environment map for the marble: a cheap sky/ground gradient cube. */
export function makeEnvMap(renderer: THREE.WebGLRenderer, top: string, bottom: string): THREE.Texture {
  const { canvas, ctx } = makeCanvas(128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, top);
  g.addColorStop(0.5, '#ffffff');
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}
