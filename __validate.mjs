import { build } from 'vite';
import path from 'node:path';
import fs from 'node:fs';

const root = '/Users/paulcote/marblekablam';
const out = '/private/tmp/claude-501/-Users-paulcote-marblekablam/480379cb-b7d8-4ad5-ae01-fa9f9ec86ca9/scratchpad/dist';
const entry = path.join(root, 'src/levels/__validate_entry.ts');
fs.writeFileSync(entry, `export { LEVELS } from './index';\n`);

await build({
  root,
  logLevel: 'error',
  build: {
    outDir: out,
    emptyOutDir: true,
    lib: { entry, formats: ['es'], fileName: 'levels' },
    rollupOptions: { external: ['three'] },
  },
});
fs.unlinkSync(entry);

const { LEVELS } = await import(path.join(out, 'levels.js'));

let fail = 0;
const bad = (m) => { console.log('  !! ' + m); fail++; };

for (const L of LEVELS) {
  const gems = L.entities.filter(e => e.kind === 'gem');
  const starts = L.entities.filter(e => e.kind === 'startPad');
  const ends = L.entities.filter(e => e.kind === 'endPad');
  const killY = L.killY ?? -60;
  console.log(`\n${L.id.padEnd(16)} blocks=${String(L.blocks.length).padStart(4)} gems=${String(gems.length).padStart(2)} par=${L.parTime/1000}s gold=${(L.goldTime??0)/1000}s killY=${killY} diff=${L.difficulty}`);

  if (gems.length < 8 || gems.length > 20) bad(`gem count ${gems.length} outside 8..20`);
  if (L.blocks.length > 2500) bad(`block count ${L.blocks.length} over budget`);
  if (starts.length !== 1) bad(`${starts.length} start pads`);
  if (ends.length !== 1) bad(`${ends.length} end pads`);
  if (!(L.goldTime < L.parTime)) bad('gold time not under par');
  if (L.spawn.pos[1] <= killY) bad('spawn below killY');

  // Collidable axis-aligned boxes, for a crude support check.
  const solids = L.blocks.filter(b => !b.noCollide && b.kind === 'box' && (!b.rot || (b.rot[0]===0&&b.rot[2]===0)));
  const supported = (p, tol) => solids.some(b => {
    const yaw = b.rot ? b.rot[1] : 0;
    const dx = p[0]-b.pos[0], dz = p[2]-b.pos[2];
    const c = Math.cos(-yaw), s = Math.sin(-yaw);
    const lx = dx*c + dz*s, lz = -dx*s + dz*c;
    const top = b.pos[1] + b.size[1]/2;
    return Math.abs(lx) <= b.size[0]/2 + 0.3 && Math.abs(lz) <= b.size[2]/2 + 0.3
        && p[1] - top <= tol && p[1] - top >= -0.35;
  });

  const floaters = gems.filter(g => !supported(g.pos, 2.2));
  console.log(`  gems with no axis-aligned floor within 2.2 below: ${floaters.length}` +
    (floaters.length ? ' -> ' + floaters.map(g=>g.pos.map(v=>+v.toFixed(1)).join(',')).join(' | ') : ''));

  for (const g of gems) if (g.pos[1] < killY + 1) bad(`gem at ${g.pos} at/below killY`);
  for (const e of [...starts, ...ends]) {
    if (!supported(e.pos, 1.0)) console.log(`  pad ${e.kind} at ${e.pos.map(v=>+v.toFixed(1))} has no axis-aligned floor (may be arc/ramp)`);
  }

  const texOk = new Set(['concrete','brick','cobblestone','steel','steelPainted','grass','water','asphalt','glass','wood','rust','ice','sandstone','yellowRamp','incline']);
  for (const b of L.blocks) if (b.texture && !texOk.has(b.texture)) bad(`bad texture ${b.texture}`);
}
console.log(fail ? `\nFAILURES: ${fail}` : '\nALL STRUCTURAL CHECKS PASS');
