/*
 * Phase 3 - Plating & Folding view
 * ---------------------------------------------------------------------------
 * Renders a live 3D bead-chain (simulated by folding.js) onto a Canvas 2D
 * "plate". Uses painter's-algorithm depth sorting, perspective projection and
 * an auto-rotating camera.
 *
 * Browser only.
 */
(function (root) {
  'use strict';

  var GTP = root.GTP = root.GTP || {};
  var D = GTP.draw;
  var folding = GTP.folding;

  function PlateView(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.opts = Object.assign({
      autoRotate: true,
      labels: false,
      beadRadius: 4.4,
      onStats: null
    }, opts);

    this.chain = null;
    this.residues = [];
    this.highlight = {};
    this.view = { rotY: 0, rotX: -0.35, camZ: 460, scale: 6 };
    this._scaleReady = false;
    this._last = 0;
    this._t = 0;
    this._frame = 0;

    this._tick = this._tick.bind(this);
    this._raf = root.requestAnimationFrame(this._tick);
  }

  PlateView.prototype.load = function (residues, options) {
    options = options || {};
    this.residues = residues || [];
    this.highlight = options.highlight || {};
    this.chain = folding.createChain(this.residues, {
      seed: options.seed == null ? 12345 : options.seed,
      beadRadius: this.opts.beadRadius
    });
    this.chain.run(options.warmup == null ? 170 : options.warmup);
    this._scaleReady = false;
    this.view.rotY = 0;
  };

  PlateView.prototype.replay = function () {
    if (!this.residues.length) return;
    this.load(this.residues, { highlight: this.highlight, seed: (Math.random() * 1e9) | 0 });
  };

  PlateView.prototype.setAutoRotate = function (v) { this.opts.autoRotate = !!v; };
  PlateView.prototype.setLabels = function (v) { this.opts.labels = !!v; };

  PlateView.prototype._tick = function (ts) {
    this._raf = root.requestAnimationFrame(this._tick);
    if (!this._last) this._last = ts;
    var dt = Math.min((ts - this._last) / 1000, 0.05);
    this._last = ts;
    this._t += dt;

    if (this.chain && this.chain.beads.length) {
      this.chain.step(0.06); // keep settling gently
      if (this.opts.autoRotate) this.view.rotY += dt * 0.35;
      this.view.rotX = -0.35 + Math.sin(this._t * 0.25) * 0.16;
    }

    this._render();

    this._frame++;
    if (this.opts.onStats && this._frame % 12 === 0) this._emitStats();
  };

  PlateView.prototype._emitStats = function () {
    if (!this.chain) return;
    var beads = this.chain.beads;
    var hydro = beads.filter(function (b) { return b.hydro > 0.5; }).length;
    var charge = beads.reduce(function (s, b) { return s + b.charge; }, 0);
    this.opts.onStats({
      length: beads.length,
      rg: this.chain.radiusOfGyration(),
      hydro: beads.length ? hydro / beads.length : 0,
      charge: charge
    });
  };

  PlateView.prototype._render = function () {
    var fit = D.fitCtx(this.canvas);
    var ctx = fit.ctx, w = fit.w, h = fit.h;
    if (w < 10 || h < 10) return;

    ctx.clearRect(0, 0, w, h);

    var bg = ctx.createRadialGradient(w / 2, h * 0.35, 20, w / 2, h * 0.5, Math.max(w, h));
    bg.addColorStop(0, 'rgba(38,52,84,0.55)');
    bg.addColorStop(1, 'rgba(6,10,20,0.7)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // The plate.
    var plateY = h * 0.78;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(w / 2, plateY, Math.min(w, 340) * 0.42, Math.min(w, 340) * 0.12, 0, 0, Math.PI * 2);
    var pg = ctx.createLinearGradient(0, plateY - 40, 0, plateY + 40);
    pg.addColorStop(0, 'rgba(226,232,240,0.14)');
    pg.addColorStop(1, 'rgba(226,232,240,0.03)');
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(226,232,240,0.22)';
    ctx.stroke();
    ctx.restore();

    if (!this.chain || !this.chain.beads.length) {
      ctx.fillStyle = 'rgba(148,163,184,0.75)';
      ctx.font = '14px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No protein on the plate yet.', w / 2, h / 2);
      return;
    }

    var beads = this.chain.beads;
    var cx = w / 2, cy = h * 0.46;

    // Auto-fit the camera to the chain.
    var com = this.chain.centerOfMass();
    var maxR = 1;
    for (var i = 0; i < beads.length; i++) {
      var dx = beads[i].x - com.x, dy = beads[i].y - com.y, dz = beads[i].z - com.z;
      maxR = Math.max(maxR, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    var desired = D.clamp((Math.min(w, h) * 0.42) / (maxR + this.opts.beadRadius), 1.5, 14);
    if (!this._scaleReady) { this.view.scale = desired; this._scaleReady = true; }
    else this.view.scale += (desired - this.view.scale) * 0.06;

    var view = {
      rotY: this.view.rotY,
      rotX: this.view.rotX,
      camZ: this.view.camZ,
      scale: this.view.scale
    };

    // Project all beads.
    var projected = beads.map(function (b) {
      var p = folding.project3D(b, view);
      return { bead: b, x: cx + p.x, y: cy + p.y, depth: p.depth, persp: p.scale };
    });

    // Build a depth-sorted draw list (bonds + beads).
    var items = [];
    for (var k = 0; k < projected.length; k++) {
      var pr = projected[k];
      items.push({ type: 'bead', depth: pr.depth, pr: pr });
      if (k > 0) {
        var a = projected[k - 1];
        items.push({ type: 'bond', depth: (a.depth + pr.depth) / 2, a: a, b: pr });
      }
    }
    items.sort(function (p, q) { return q.depth - p.depth; });

    ctx.lineCap = 'round';
    for (var m = 0; m < items.length; m++) {
      var it = items[m];
      if (it.type === 'bond') {
        var avg = (it.a.persp + it.b.persp) / 2;
        ctx.beginPath();
        ctx.moveTo(it.a.x, it.a.y);
        ctx.lineTo(it.b.x, it.b.y);
        ctx.lineWidth = Math.max(2, 5.5 * avg * view.scale * 0.55);
        ctx.strokeStyle = D.rgba(it.a.bead.color, 0.55);
        ctx.stroke();
      } else {
        var p2 = it.pr;
        var r = D.clamp(this.opts.beadRadius * p2.persp * view.scale, 2.5, 46);
        D.sphere(ctx, p2.x, p2.y, r, p2.bead.color, {
          stroke: this.highlight[p2.bead.index] ? '#fbbf24' : 'rgba(0,0,0,0.35)',
          strokeWidth: this.highlight[p2.bead.index] ? 3 : 1
        });
        if (this.opts.labels && r > 8) {
          ctx.fillStyle = 'rgba(237,244,255,0.9)';
          ctx.font = Math.round(Math.min(11, r * 0.8)) + 'px "Cascadia Code", Consolas, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p2.bead.code3.slice(0, 3), p2.x, p2.y);
        }
      }
    }

    // Hydrophobic-core hint: a soft ring around the centre of mass.
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(20, this.chain.radiusOfGyration() * view.scale), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  GTP.PlateView = PlateView;
})(typeof window !== 'undefined' ? window : this);
