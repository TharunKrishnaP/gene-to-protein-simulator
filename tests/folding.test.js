/*
 * Phase 3 tests - run with:  node --test
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const folding = require('../src/fold/folding.js');

const hydro = (aa = 'L') => ({ aa, code3: 'Leu', category: 'hydrophobic', hydro: 3.8, charge: 0, color: '#22c55e' });
const plus = () => ({ aa: 'K', code3: 'Lys', category: 'positive', hydro: 0, charge: +1, color: '#2563eb' });
const minus = () => ({ aa: 'D', code3: 'Asp', category: 'negative', hydro: 0, charge: -1, color: '#ef4444' });
const neutral = () => ({ aa: 'G', code3: 'Gly', category: 'hydrophobic', hydro: 0, charge: 0, color: '#9ca3af' });

test('chain exposes the expected shape and methods', () => {
  const chain = folding.createChain([hydro(), hydro(), hydro()]);
  assert.equal(chain.beads.length, 3);
  assert.equal(typeof chain.step, 'function');
  assert.equal(typeof chain.run, 'function');
  assert.ok(chain.radiusOfGyration() > 0);
});

test('folding is deterministic for a given seed', () => {
  const build = () => folding.createChain([hydro(), plus(), minus(), hydro(), neutral()], { seed: 7 }).run(120);
  const a = build();
  const b = build();
  a.beads.forEach((bead, i) => {
    assert.equal(bead.x, b.beads[i].x);
    assert.equal(bead.y, b.beads[i].y);
    assert.equal(bead.z, b.beads[i].z);
  });
});

test('a hydrophobic chain collapses (radius of gyration shrinks)', () => {
  const chain = folding.createChain(Array.from({ length: 14 }, () => hydro()));
  const before = chain.radiusOfGyration();
  chain.run(400);
  const after = chain.radiusOfGyration();
  assert.ok(after < before * 0.85, `expected collapse: ${before.toFixed(1)} -> ${after.toFixed(1)}`);
});

function placeOnLine(chain) {
  // Relaxed backbone (10 apart) so only the charge term acts on bead 0.
  chain.beads.forEach((bead, i) => { bead.x = i * 10; bead.y = 0; bead.z = 0; bead.vx = 0; bead.vy = 0; bead.vz = 0; });
  return chain;
}

test('opposite charges attract each other', () => {
  const chain = placeOnLine(folding.createChain([plus(), neutral(), minus()]));
  chain.computeForces();
  assert.ok(chain.beads[0].fx > 0, 'positive bead should be pulled toward the negative bead');
});

test('like charges repel each other', () => {
  const chain = placeOnLine(folding.createChain([plus(), neutral(), plus()]));
  chain.computeForces();
  assert.ok(chain.beads[0].fx < 0, 'positive bead should be pushed away from the other positive bead');
});

test('the backbone keeps neighbouring beads bonded', () => {
  const chain = folding.createChain(Array.from({ length: 6 }, () => hydro()), { restLength: 10 });
  chain.run(200);
  for (let i = 0; i + 1 < chain.beads.length; i++) {
    const d = folding.distance(chain.beads[i], chain.beads[i + 1]);
    assert.ok(d > 2 && d < 30, `bond ${i} length ${d.toFixed(1)} should stay bounded`);
  }
});

test('project3D returns finite screen coordinates', () => {
  const p = folding.project3D({ x: 10, y: -5, z: 30 }, { rotY: 0.4, rotX: 0.2, scale: 1.5 });
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.depth));
  assert.ok(p.scale > 0);
});
