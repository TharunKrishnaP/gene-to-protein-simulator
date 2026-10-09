/*
 * Shared Canvas 2D drawing helpers (browser only).
 */
(function (root) {
  'use strict';

  var GTP = root.GTP = root.GTP || {};

  function fitCtx(canvas) {
    var dpr = root.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h, dpr: dpr };
  }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function hexToRgb(hex) {
    var h = String(hex || '#888').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgba(hex, alpha) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
  }

  /** amt > 0 lightens toward white, amt < 0 darkens toward black (-1..1). */
  function shade(hex, amt) {
    var c = hexToRgb(hex);
    var t = amt > 0 ? 255 : 0;
    var p = Math.abs(amt);
    return 'rgb(' +
      Math.round(lerp(c.r, t, p)) + ',' +
      Math.round(lerp(c.g, t, p)) + ',' +
      Math.round(lerp(c.b, t, p)) + ')';
  }

  /** A shaded sphere bead, used for amino acids. */
  function sphere(ctx, x, y, r, color, opts) {
    opts = opts || {};
    var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.42, r * 0.12, x, y, r * 1.05);
    g.addColorStop(0, shade(color, 0.55));
    g.addColorStop(0.5, color);
    g.addColorStop(1, shade(color, -0.45));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    if (opts.stroke) {
      ctx.lineWidth = opts.strokeWidth || 1.5;
      ctx.strokeStyle = opts.stroke;
      ctx.stroke();
    }
    if (opts.glow) {
      ctx.save();
      ctx.globalAlpha = opts.glowAlpha == null ? 0.5 : opts.glowAlpha;
      ctx.shadowColor = color;
      ctx.shadowBlur = r * 1.6;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }
  }

  function drawBaseTile(ctx, x, y, size, base, color, label) {
    roundRect(ctx, x, y, size, size, size * 0.24);
    var g = ctx.createLinearGradient(x, y, x, y + size);
    g.addColorStop(0, shade(color, 0.18));
    g.addColorStop(1, shade(color, -0.22));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.font = '700 ' + Math.round(size * 0.5) + 'px "Cascadia Code", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label || base, x + size / 2, y + size / 2 + 1);
  }

  GTP.draw = {
    fitCtx: fitCtx,
    roundRect: roundRect,
    clamp: clamp,
    lerp: lerp,
    rgba: rgba,
    shade: shade,
    sphere: sphere,
    drawBaseTile: drawBaseTile
  };
})(typeof window !== 'undefined' ? window : this);
