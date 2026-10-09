/*
 * Phase 2 - The Ribosome Kitchen
 * ---------------------------------------------------------------------------
 * An animated "Ribosome Chef" slides along the mRNA strand three bases at a
 * time. Each codon pops a coloured amino-acid bead onto a growing chain. A
 * STOP codon ends the cook.
 *
 * Browser only.
 */
(function (root) {
  'use strict';

  var GTP = root.GTP = root.GTP || {};
  var D = GTP.draw;

  var TILE = 30;
  var GAP = 6;
  var STEP = TILE + GAP;

  function KitchenView(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.speed = opts.speed || 2; // codons per second (relaxed default)
    this.onAdvance = opts.onAdvance || function () {};
    this.onComplete = opts.onComplete || function () {};
    this.onStatus = opts.onStatus || function () {};
    this.onFraction = opts.onFraction || function () {};

    this.protein = null;
    this.mrna = '';
    this.codons = [];
    this.stopIndex = 0;
    this.emitted = [];
    this.index = 0;
    this.progress = 0;
    this.status = 'idle';
    this.scrollOffset = 0;
    this._stopped = false;
    this._last = 0;
    this._t = 0;

    this._tick = this._tick.bind(this);
    this._raf = root.requestAnimationFrame(this._tick);
  }

  KitchenView.prototype.load = function (protein) {
    this.protein = protein;
    this.mrna = protein.mrna;
    this.codons = protein.codons;
    this.stopIndex = protein.stop ? protein.stop.index : protein.codons.length;
    this.emitted = [];
    this.index = 0;
    this.progress = 0;
    this.status = 'idle';
    this._stopped = false;
    this.scrollOffset = 0;
    this.onStatus(this.status);
    this.onFraction(0);
  };

  KitchenView.prototype.isRunning = function () { return this.status === 'running'; };

  KitchenView.prototype.play = function () {
    if (!this.protein) return;
    if (this.status === 'done') this.reset();
    this.status = 'running';
    this.onStatus(this.status);
  };

  KitchenView.prototype.pause = function () {
    if (this.status === 'running') {
      this.status = 'paused';
      this.onStatus(this.status);
    }
  };

  KitchenView.prototype.toggle = function () {
    if (this.status === 'running') this.pause();
    else this.play();
  };

  /** Advance exactly one codon. */
  KitchenView.prototype.step = function () {
    if (!this.protein || this.status === 'done') return;
    if (this.status === 'running') { this.status = 'paused'; this.onStatus(this.status); }
    this.progress = 0;
    this._consume();
    this._fraction();
  };

  KitchenView.prototype.reset = function () {
    if (this.protein) this.load(this.protein);
  };

  KitchenView.prototype.setSpeed = function (v) { this.speed = Math.max(0.5, Number(v) || 2); };

  KitchenView.prototype._fraction = function () {
    if (!this.protein) return;
    var total = Math.max(1, this.stopIndex);
    var f = Math.min(1, (this.index + Math.min(this.progress, 1)) / total);
    this.onFraction(f);
  };

  KitchenView.prototype._emitBead = function (residue) {
    this.emitted.push({ kind: 'aa', residue: residue, k: this.emitted.length, t: 0, codon: residue.codon });
  };

  KitchenView.prototype._emitStop = function (codon) {
    this.emitted.push({ kind: 'stop', codon: codon || 'UAA', k: this.emitted.length, t: 0 });
  };

  KitchenView.prototype._consume = function () {
    if (this.status === 'done') return;

    if (this.index < this.stopIndex) {
      var residue = this.protein.residues[this.index];
      if (residue) {
        this._emitBead(residue);
        this.onAdvance({
          consumed: this.index + 1,
          index: this.index,
          total: this.stopIndex,
          residue: residue,
          codon: this.codons[this.index]
        });
      }
      this.index++;
    }

    if (this.index >= this.stopIndex) {
      if (this.protein.stop && !this._stopped) {
        this._emitStop(this.protein.stop.codon);
        this._stopped = true;
      }
      this.status = 'done';
      this.onStatus(this.status);
      this.onComplete({ stop: this.protein.stop, residues: this.stopIndex });
    }
  };

  KitchenView.prototype._tick = function (ts) {
    this._raf = root.requestAnimationFrame(this._tick);
    if (!this._last) this._last = ts;
    var dt = Math.min((ts - this._last) / 1000, 0.05);
    this._last = ts;
    this._t += dt;

    if (this.status === 'running' && this.protein) {
      this.progress += dt * this.speed;
      var guard = 0;
      while (this.progress >= 1 && this.status === 'running' && guard++ < 12) {
        this.progress -= 1;
        this._consume();
      }
      this._fraction();
    }

    for (var i = 0; i < this.emitted.length; i++) {
      var b = this.emitted[i];
      if (b.t < 1) b.t = Math.min(1, b.t + dt * 4.5);
    }

    this._render();
  };

  // --------------------------------------------------------------- rendering
  KitchenView.prototype._trackX = function (baseIndex) {
    return 18 + baseIndex * STEP - this.scrollOffset;
  };

  KitchenView.prototype._render = function () {
    var fit = D.fitCtx(this.canvas);
    var ctx = fit.ctx, w = fit.w, h = fit.h;
    if (w < 10 || h < 10) return;

    ctx.clearRect(0, 0, w, h);

    // Counter surface.
    var bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(30,41,66,0.35)');
    bg.addColorStop(1, 'rgba(8,12,24,0.55)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    if (!this.protein) {
      ctx.fillStyle = 'rgba(148,163,184,0.7)';
      ctx.font = '14px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Pick a recipe or build a strand to start cooking…', w / 2, h / 2);
      return;
    }

    var trackY = h - 46;
    this._updateScroll(w);

    // --- chain area slots -------------------------------------------------
    var beadR = 11;
    var cols = Math.max(1, Math.floor((w - 40) / 27));
    var slotOf = function (k) {
      var col = k % cols, rowv = Math.floor(k / cols);
      return { x: 20 + col * 27 + 13, y: 34 + rowv * 30 };
    };

    // faint empty slots for the whole protein
    ctx.globalAlpha = 0.5;
    for (var s = 0; s < this.stopIndex; s++) {
      var slot = slotOf(s);
      ctx.beginPath();
      ctx.arc(slot.x, slot.y, beadR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // --- mRNA track -------------------------------------------------------
    var BASES = (GTP.codons && GTP.codons.BASES) || {};
    var currentCodon = Math.min(this.index, this.codons.length - 1);

    var g, x0, cw;
    for (g = 0; g < this.codons.length; g++) {
      x0 = this._trackX(g * 3) - 4;
      cw = STEP * 3 - GAP + 8;
      if (x0 > w || x0 + cw < 0) continue;
      var fill = 'rgba(255,255,255,0.03)';
      if (g < this.index) fill = 'rgba(52,211,153,0.10)';
      else if (g === currentCodon && this.status !== 'done') fill = 'rgba(251,146,60,0.26)';
      if (this.protein.stop && g === this.stopIndex) fill = 'rgba(248,113,113,0.18)';
      D.roundRect(ctx, x0, trackY - 5, cw, TILE + 10, 10);
      ctx.fillStyle = fill;
      ctx.fill();
    }

    var rna = this.mrna;
    for (var i = 0; i < rna.length; i++) {
      var x = this._trackX(i);
      if (x + TILE < 0 || x > w) continue;
      var base = rna[i];
      var meta = BASES[base] || { color: '#94a3b8' };
      D.drawBaseTile(ctx, x, trackY, TILE, base, meta.color, base);
    }

    // --- emitted beads and stop marker -----------------------------------
    var chefCenter = {
      x: this._trackX(currentCodon * 3) + STEP * 1.5 - GAP / 2,
      y: trackY - 58
    };
    chefCenter.x = D.clamp(chefCenter.x, 30, w - 30);

    for (var e = 0; e < this.emitted.length; e++) {
      var item = this.emitted[e];
      var target = slotOf(item.k);
      var tt = item.t;
      var ex = D.lerp(chefCenter.x, target.x, tt);
      var ey = D.lerp(chefCenter.y, target.y, tt) - Math.sin(tt * Math.PI) * 40;
      if (item.kind === 'aa') {
        D.sphere(ctx, ex, ey, beadR * (0.5 + 0.5 * tt), item.residue.color, { stroke: 'rgba(0,0,0,0.35)' });
        if (tt > 0.85) {
          ctx.fillStyle = 'rgba(226,238,255,0.85)';
          ctx.font = '9px "Cascadia Code", Consolas, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(item.residue.code3, target.x, target.y + beadR + 2);
        }
      } else {
        ctx.beginPath();
        ctx.arc(ex, ey, beadR * (0.5 + 0.5 * tt), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(17,24,39,0.95)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(248,113,113,0.9)';
        ctx.stroke();
        if (tt > 0.6) {
          ctx.fillStyle = '#fca5a5';
          ctx.font = '8px "Cascadia Code", Consolas, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText('STOP', target.x, target.y + beadR + 2);
        }
      }
    }

    // --- chef -------------------------------------------------------------
    drawChef(ctx, chefCenter.x, trackY - 8, 0.82, this.status, this._t);

    // current codon label
    if (this.codons[currentCodon]) {
      var codon = this.codons[currentCodon];
      var aa = GTPlookupAA(codon);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = '700 12px "Cascadia Code", Consolas, monospace';
      ctx.fillStyle = '#ffd9ac';
      ctx.fillText(codon + (aa ? '  →  ' + aa : ''), chefCenter.x, trackY - 92);
    }

    // read head marker
    var rx = this._trackX(currentCodon * 3) - 4;
    ctx.strokeStyle = 'rgba(251,146,60,0.9)';
    ctx.lineWidth = 2;
    D.roundRect(ctx, rx, trackY - 7, STEP * 3 - GAP + 10, TILE + 14, 11);
    ctx.stroke();
  };

  KitchenView.prototype._updateScroll = function (w) {
    var totalBases = this.mrna.length;
    var totalWidth = totalBases * STEP + 36;
    var centerBase = Math.min(this.index, Math.max(0, this.codons.length - 1)) * 3 + 1.5;
    var target = 18 + centerBase * STEP - w / 2;
    var max = Math.max(0, totalWidth - w);
    target = D.clamp(target, 0, max);
    this.scrollOffset += (target - this.scrollOffset) * 0.12;
    if (Math.abs(target - this.scrollOffset) < 0.4) this.scrollOffset = target;
  };

  function GTPlookupAA(codon) {
    if (!GTP.codons) return '';
    var letter = GTP.codons.CODON_TABLE && GTP.codons.CODON_TABLE[codon.replace(/T/g, 'U')];
    if (!letter) return '';
    if (letter === '*') return 'STOP';
    var meta = GTP.codons.AMINO_ACIDS[letter];
    return meta ? meta.code3 : letter;
  }

  function drawChef(ctx, x, baseY, s, status, t) {
    var bob = Math.sin(t * 5) * 1.8;
    ctx.save();
    ctx.translate(x, baseY + bob);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 6 * s, 20 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // hat
    ctx.fillStyle = '#f8fafc';
    D.roundRect(ctx, -17 * s, -36 * s, 34 * s, 15 * s, 6 * s);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-12 * s, -38 * s, 9 * s, 0, Math.PI * 2);
    ctx.arc(0, -43 * s, 11 * s, 0, Math.PI * 2);
    ctx.arc(12 * s, -38 * s, 9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(203,213,225,0.6)';
    ctx.fillRect(-15 * s, -24 * s, 30 * s, 3 * s);

    // head
    ctx.fillStyle = '#fcd9b6';
    ctx.beginPath();
    ctx.arc(0, -13 * s, 13 * s, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    var blink = (Math.sin(t * 1.7) > 0.97) ? 0.25 : 1;
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.ellipse(-4.6 * s, -15 * s, 1.9 * s, 1.9 * s * blink, 0, 0, Math.PI * 2);
    ctx.ellipse(4.6 * s, -15 * s, 1.9 * s, 1.9 * s * blink, 0, 0, Math.PI * 2);
    ctx.fill();

    // smile
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1.6 * s;
    ctx.beginPath();
    ctx.arc(0, -10 * s, 4.6 * s, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.stroke();

    // apron / body
    ctx.fillStyle = '#e2e8f0';
    D.roundRect(ctx, -16 * s, -3 * s, 32 * s, 17 * s, 7 * s);
    ctx.fill();
    ctx.fillStyle = '#fb923c';
    D.roundRect(ctx, -9 * s, 2 * s, 18 * s, 10 * s, 4 * s);
    ctx.fill();

    // status sparkle
    if (status === 'running') {
      ctx.fillStyle = 'rgba(251,146,60,0.9)';
      ctx.beginPath();
      ctx.arc(16 * s, -30 * s + Math.sin(t * 8) * 2, 2.4 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  GTP.KitchenView = KitchenView;
})(typeof window !== 'undefined' ? window : this);
