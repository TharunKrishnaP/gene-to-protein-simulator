/*
 * Phase 3 - Simplified folding physics
 * ---------------------------------------------------------------------------
 * A tiny 3D bead-chain simulator. Each bead is an amino acid with:
 *   - backbone springs             (keeps neighbours bonded)
 *   - excluded volume              (beads cannot overlap)
 *   - hydrophobic attraction       (greasy beads clump + collapse to the core)
 *   - solvation                   (hydrophilic beads seek the water outside)
 *   - charge interaction          (opposites attract, likes repel)
 *
 * Deterministic: a seeded PRNG drives the initial jitter, so identical input
 * always produces identical folds (which makes the tests meaningful).
 *
 * Dual-target (browser global + Node require).
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.GTP = root.GTP || {};
    root.GTP.folding = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULTS = {
    seed: 12345,
    restLength: 10,   // backbone bond length
    beadRadius: 4.2,  // excluded-volume radius
    dt: 0.1,
    damping: 0.85,
    kBackbone: 2.0,
    kExclude: 6.0,
    kHydro: 1.1,
    kCharge: 60,
    kSolvent: 1.6,
    kCore: 0.9,
    hydroCutoff: 70,
    maxForce: 60,
    maxSpeed: 9
  };

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function defaults(residue) {
    return {
      aa: residue.aa || 'X',
      code3: residue.code3 || (residue.aa || 'X'),
      category: residue.category || 'hydrophobic',
      hydro: typeof residue.hydro === 'number' ? residue.hydro : 0,
      charge: typeof residue.charge === 'number' ? residue.charge : 0,
      color: residue.color || '#94a3b8',
      isStart: !!residue.isStart
    };
  }

  function isHydrophobic(residue) { return residue.hydro > 0.5; }
  function isHydrophilic(residue) { return residue.hydro < -0.5; }

  /**
   * Build a chain of beads. Residues are amino-acid-like objects; missing
   * properties fall back to neutral defaults.
   */
  function createChain(residues, options) {
    var opts = Object.assign({}, DEFAULTS, options || {});
    var rng = mulberry32(opts.seed);
    var n = residues.length;
    var beads = residues.map(function (residue, i) {
      var r = defaults(residue);
      // Start as a loose 3D helix (an "unfolded" chain).
      var angle = i * 0.9;
      var x = (i - (n - 1) / 2) * opts.restLength * 0.5;
      var y = Math.cos(angle) * opts.restLength;
      var z = Math.sin(angle) * opts.restLength;
      // Seeded jitter so no two chains start identically-perfect.
      x += (rng() - 0.5) * 0.4;
      y += (rng() - 0.5) * 0.4;
      z += (rng() - 0.5) * 0.4;
      return {
        index: i,
        aa: r.aa, code3: r.code3, category: r.category,
        hydro: r.hydro, charge: r.charge, color: r.color, isStart: r.isStart,
        x: x, y: y, z: z, vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: 0
      };
    });

    function centerOfMass() {
      var c = { x: 0, y: 0, z: 0 };
      if (!beads.length) return c;
      beads.forEach(function (b) { c.x += b.x; c.y += b.y; c.z += b.z; });
      c.x /= beads.length; c.y /= beads.length; c.z /= beads.length;
      return c;
    }

    function radiusOfGyration() {
      var c = centerOfMass();
      var sum = 0;
      beads.forEach(function (b) {
        var dx = b.x - c.x, dy = b.y - c.y, dz = b.z - c.z;
        sum += dx * dx + dy * dy + dz * dz;
      });
      return beads.length ? Math.sqrt(sum / beads.length) : 0;
    }

    function bounds() {
      var b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
      beads.forEach(function (p) {
        b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
        b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y);
        b.minZ = Math.min(b.minZ, p.z); b.maxZ = Math.max(b.maxZ, p.z);
      });
      return b;
    }

    function computeForces() {
      beads.forEach(function (b) { b.fx = 0; b.fy = 0; b.fz = 0; });

      for (var i = 0; i < beads.length; i++) {
        var a = beads[i];
        for (var j = i + 1; j < beads.length; j++) {
          var b = beads[j];
          var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
          var d2 = dx * dx + dy * dy + dz * dz;
          var d = Math.sqrt(Math.max(d2, 0.0001));
          var ux = dx / d, uy = dy / d, uz = dz / d;
          var fx = 0, fy = 0, fz = 0;

          if (j === i + 1) {
            // Harmonic backbone spring.
            var fb = opts.kBackbone * (d - opts.restLength);
            fx = fb * ux; fy = fb * uy; fz = fb * uz;
          } else {
            // Excluded volume (soft sphere).
            var minD = opts.beadRadius * 2;
            if (d < minD) {
              var fe = opts.kExclude * (minD - d);
              fx -= fe * ux; fy -= fe * uy; fz -= fe * uz;
            }
            // Hydrophobic attraction.
            if (isHydrophobic(a) && isHydrophobic(b) && d < opts.hydroCutoff) {
              var strength = opts.kHydro * (a.hydro + b.hydro) / 2;
              var falloff = 1 - d / opts.hydroCutoff;
              fx += strength * falloff * ux;
              fy += strength * falloff * uy;
              fz += strength * falloff * uz;
            }
            // Electrostatic interaction: opposites attract, likes repel.
            if (a.charge !== 0 && b.charge !== 0) {
              var fq = opts.kCharge * a.charge * b.charge / Math.max(d2, 4);
              fx -= fq * ux; fy -= fq * uy; fz -= fq * uz;
            }
          }
          a.fx += fx; a.fy += fy; a.fz += fz;
          b.fx -= fx; b.fy -= fy; b.fz -= fz;
        }
      }

      // Core / solvent fields relative to the centre of mass.
      var c = centerOfMass();
      beads.forEach(function (b) {
        var dx = b.x - c.x, dy = b.y - c.y, dz = b.z - c.z;
        var d = Math.sqrt(Math.max(dx * dx + dy * dy + dz * dz, 0.0001));
        var ux = dx / d, uy = dy / d, uz = dz / d;
        if (isHydrophobic(b)) {
          var inward = opts.kCore * Math.min(b.hydro, 4.5) / 4.5;
          b.fx -= ux * inward; b.fy -= uy * inward; b.fz -= uz * inward;
        } else if (isHydrophilic(b)) {
          var outward = opts.kSolvent * Math.min(-b.hydro, 4.5) / 4.5;
          b.fx += ux * outward; b.fy += uy * outward; b.fz += uz * outward;
        }
        // Clamp total force for numerical stability.
        var mag = Math.sqrt(b.fx * b.fx + b.fy * b.fy + b.fz * b.fz);
        if (mag > opts.maxForce) {
          var s = opts.maxForce / mag;
          b.fx *= s; b.fy *= s; b.fz *= s;
        }
      });
      return beads;
    }

    function step(dt) {
      var h = dt == null ? opts.dt : dt;
      computeForces();
      beads.forEach(function (b) {
        b.vx = (b.vx + b.fx * h) * opts.damping;
        b.vy = (b.vy + b.fy * h) * opts.damping;
        b.vz = (b.vz + b.fz * h) * opts.damping;
        var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
        if (sp > opts.maxSpeed) {
          var s = opts.maxSpeed / sp;
          b.vx *= s; b.vy *= s; b.vz *= s;
        }
        b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
      });
    }

    function run(steps, dt) {
      for (var k = 0; k < steps; k++) step(dt);
      return this;
    }

    return {
      beads: beads,
      options: opts,
      computeForces: computeForces,
      step: step,
      run: run,
      centerOfMass: centerOfMass,
      radiusOfGyration: radiusOfGyration,
      bounds: bounds
    };
  }

  /** Rotate + perspective-project a 3D point into 2D screen space. */
  function project3D(point, view) {
    var rotY = view.rotY || 0, rotX = view.rotX || 0;
    var camZ = view.camZ || 420, scale = view.scale || 1;

    var cy = Math.cos(rotY), sy = Math.sin(rotY);
    var x1 = point.x * cy + point.z * sy;
    var z1 = -point.x * sy + point.z * cy;

    var cx = Math.cos(rotX), sx = Math.sin(rotX);
    var y2 = point.y * cx - z1 * sx;
    var z2 = point.y * sx + z1 * cx;

    var persp = camZ / (camZ + z2);
    return { x: x1 * persp * scale, y: y2 * persp * scale, depth: z2, scale: persp };
  }

  function distance(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  return {
    DEFAULTS: DEFAULTS,
    mulberry32: mulberry32,
    createChain: createChain,
    project3D: project3D,
    distance: distance
  };
});
