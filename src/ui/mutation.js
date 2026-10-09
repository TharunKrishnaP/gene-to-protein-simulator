/*
 * Phase 4 - Mutation Sandbox (interactive workbench)
 * ---------------------------------------------------------------------------
 * Interactions:
 *   - Click any base to open an inline A/U/C/G picker; picking a base previews
 *     the edit instantly (no separate "apply" step).
 *   - Stack as many edits as you like. Every edit is kept in a "pending edits"
 *     tray, badged on the strand, and classified on its own.
 *   - One-click "quick mutations": silent / missense / nonsense / start-loss /
 *     stop-loss / random. Plus a "Mutagenize" burst that drops several random
 *     edits at once.
 *   - Live readout: combined verdict, protein diff, per-residue tooltips, an
 *     impact meter and a side-by-side fold comparison with per-protein stats.
 *   - Keyboard: ← → move, Shift+←/→ jump a codon, A/U/C/G (or T) mutate,
 *     Delete/Backspace revert, Enter insert, Z undo, R random.
 *   - "Insert into gene" commits the whole stack, then the applied before/after
 *     comparison stays visible.
 *
 * Browser only.
 */
(function (root) {
  'use strict';

  var GTP = root.GTP = root.GTP || {};
  var genetics = GTP.genetics;

  var PRESET_META = {
    silent: { label: 'Silent', hint: 'same amino acid, same fold' },
    missense: { label: 'Missense', hint: 'different amino acid' },
    nonsense: { label: 'Nonsense', hint: 'premature STOP' },
    'start-loss': { label: 'Start-loss', hint: 'destroys the START codon' },
    'stop-loss': { label: 'Stop-loss', hint: 'loses the STOP codon' },
    random: { label: 'Random', hint: 'any single base swap' }
  };

  var SHORT_TYPE = {
    none: 'no-op',
    silent: 'silent',
    missense: 'missense',
    nonsense: 'nonsense',
    'start-loss': 'start-loss',
    'stop-loss': 'stop-loss'
  };

  function MutationSandbox(opts) {
    this.els = opts.els;
    this.getSequence = opts.getSequence || function () { return ''; };
    this.onCommit = opts.onCommit || function () {};

    this.seq = '';
    this.edits = [];        // [{position, base}] in the strand's alphabet (RNA)
    this.selectedIndex = null;
    this.selectedBase = null;
    this.current = null;    // analyzeEdits() result for the whole stack
    this.lastAdded = null;  // position of the most recent edit (for undo)

    this.wtPlate = new GTP.PlateView(this.els.wtCanvas, { autoRotate: true });
    this.mutPlate = new GTP.PlateView(this.els.mutCanvas, { autoRotate: true });

    this._buildPalette();
    this._buildPresets();
    this._bind();
  }

  // ------------------------------------------------------------- structure
  MutationSandbox.prototype._buildPalette = function () {
    var self = this;
    var palette = this.els.palette;
    palette.innerHTML = '';
    ['A', 'U', 'C', 'G'].forEach(function (base) {
      var b = document.createElement('button');
      b.className = 'base-btn base-' + base;
      b.type = 'button';
      b.textContent = base;
      b.dataset.base = base;
      b.addEventListener('click', function () { self._pickBase(base); });
      palette.appendChild(b);
    });
  };

  MutationSandbox.prototype._buildPresets = function () {
    var self = this;
    var row = this.els.presets;
    if (!row) return;
    Array.prototype.forEach.call(row.children, function (btn) {
      btn.addEventListener('click', function () { self.applyPreset(btn.dataset.preset); });
    });
  };

  MutationSandbox.prototype._bind = function () {
    var self = this;
    this.els.commitBtn.addEventListener('click', function () { self.commit(); });
    this.els.resetBtn.addEventListener('click', function () { self.clearPreview(); });
    if (this.els.undoBtn) this.els.undoBtn.addEventListener('click', function () { self.undoLast(); });
    if (this.els.mutagenBtn) this.els.mutagenBtn.addEventListener('click', function () { self.mutagenize(3); });
    document.addEventListener('keydown', function (e) { self._onKey(e); });
  };

  // --------------------------------------------------------------- sequence
  MutationSandbox.prototype.setSequence = function (seq) {
    this.seq = genetics.toMRNA(seq);
    this.edits = [];
    this.lastAdded = null;
    this._renderStrand();
    this.clearPreview();
    this._updatePosLabel();

    var wt = genetics.translate(this.seq);
    this.els.wtLabel.textContent = summarise(wt);
    this.wtPlate.load(wt.residues, { seed: 4242 });
    renderMiniStats(this.els.wtStats, wt);

    // Invite the first edit.
    if (this.seq.length) this._selectIndex(0);
  };

  MutationSandbox.prototype.setCount = function (n) {
    if (!this.els.count) return;
    this.els.count.textContent = n ? (n + ' edit' + (n === 1 ? '' : 's') + ' applied') : '';
  };

  MutationSandbox.prototype._renderStrand = function () {
    var self = this;
    var track = this.els.strand;
    track.innerHTML = '';
    for (var i = 0; i < this.seq.length; i++) {
      var base = this.seq[i];
      var tile = document.createElement('div');
      var codon = codonAt(this.seq, i);
      var aa = lookUpAA(codon);
      tile.className = 'base-tile t-' + base + ' selectable' + (i % 3 === 0 ? ' codon-start' : '');
      tile.textContent = base;
      tile.dataset.index = i;
      tile.title = tileTooltip(this.seq, i);
      tile.addEventListener('click', function (ev) {
        self._selectIndex(Number(ev.currentTarget.dataset.index));
      });
      track.appendChild(tile);
    }
  };

  /** Repaint selected + pending badges from state (keeps badges across clicks). */
  MutationSandbox.prototype._paintTiles = function () {
    var self = this;
    Array.prototype.forEach.call(this.els.strand.children, function (t) {
      var i = Number(t.dataset.index);
      t.classList.toggle('selected', i === self.selectedIndex);
      var edit = self._editAt(i);
      t.classList.toggle('changed', !!edit);
      if (edit) t.dataset.proposed = normaliseForPalette(edit.base);
      else delete t.dataset.proposed;
    });
  };

  MutationSandbox.prototype._editAt = function (index) {
    for (var i = 0; i < this.edits.length; i++) {
      if (this.edits[i].position === index) return this.edits[i];
    }
    return null;
  };

  MutationSandbox.prototype._selectIndex = function (idx) {
    if (idx == null || idx < 0 || idx >= this.seq.length) return;
    this.selectedIndex = idx;
    this.selectedBase = null;
    clearPaletteSelection(this.els.palette);
    this._paintTiles();
    this._updatePosLabel();
    var tile = this.els.strand.children[idx];
    if (tile) this._showPicker(tile);
  };

  MutationSandbox.prototype._moveSelection = function (delta) {
    if (this.selectedIndex == null) return;
    var next = Math.max(0, Math.min(this.seq.length - 1, this.selectedIndex + delta));
    this._selectIndex(next);
  };

  // --------------------------------------------------------------- picker
  MutationSandbox.prototype._showPicker = function (tile) {
    var picker = this.els.picker;
    if (!picker) return;
    picker.classList.remove('hidden');
    var shell = this.els.strandShell;
    var track = this.els.strand;
    var shellW = shell && shell.clientWidth ? shell.clientWidth : 0;
    var left = (tile.offsetLeft || 0) - (track.scrollLeft || 0);
    var top = (tile.offsetTop || 0) - (track.scrollTop || 0) + (tile.offsetHeight || 30) + 6;
    if (shellW) left = Math.min(left, Math.max(0, shellW - 186));
    picker.style.left = left + 'px';
    picker.style.top = top + 'px';
  };

  MutationSandbox.prototype._hidePicker = function () {
    if (this.els.picker) this.els.picker.classList.add('hidden');
  };

  MutationSandbox.prototype._pickBase = function (base) {
    if (this.selectedIndex == null) return;
    this.selectedBase = normaliseForPalette(base);
    Array.prototype.forEach.call(this.els.palette.children, function (btn) {
      btn.classList.toggle('selected', btn.dataset.base === normaliseForPalette(base));
    });
    this._setEdit(this.selectedIndex, this.selectedBase);
    this._recompute();
    this._updatePosLabel();
  };

  /** Add / replace / remove the pending edit at a position (RNA alphabet). */
  MutationSandbox.prototype._setEdit = function (index, base) {
    var wtBase = normaliseForPalette(this.seq[index]);
    var clean_ = normaliseForPalette(base);

    if (clean_ === wtBase) { // picking the original base reverts this edit
      this._removeEdit(index);
      if (this.lastAdded === index) this.lastAdded = null;
      return;
    }
    var existing = this._editAt(index);
    if (existing) existing.base = clean_;
    else this.edits.push({ position: index, base: clean_ });
    this.lastAdded = index;
  };

  MutationSandbox.prototype._removeEdit = function (index) {
    this.edits = this.edits.filter(function (e) { return e.position !== index; });
    if (this.lastAdded === index) this.lastAdded = null;
  };

  MutationSandbox.prototype._updatePosLabel = function () {
    var el = this.els.posLabel;
    if (!el) return;
    if (this.selectedIndex == null) { el.textContent = '—'; return; }
    var i = this.selectedIndex;
    var base = this.seq[i];
    var codon = codonAt(this.seq, i);
    var aa = lookUpAA(codon);
    var text = base + ' @ ' + i + '  ·  codon ' + codon + (aa ? ' (' + aa + ')' : '');
    var edit = this._editAt(i);
    if (edit) {
      var changed = replaceBase(this.seq, i, edit.base);
      var newCodon = codonAt(changed, i).replace(/T/g, 'U');
      var newAA = lookUpAA(newCodon);
      text += '  →  ' + edit.base + ' (' + newCodon + (newAA ? ' ' + newAA : '') + ')';
    }
    el.textContent = text;
  };

  // ---------------------------------------------------------------- actions
  MutationSandbox.prototype.applyPreset = function (type) {
    if (!PRESET_META[type]) return;
    var pick = genetics.findMutationForClass(this.seq, type, Math.random);
    if (!pick) {
      this.els.result.innerHTML = '<p class="hint err">No “' + PRESET_META[type].label +
        '” mutation is possible in this sequence.</p>';
      return;
    }
    this._selectIndex(pick.position);
    this._pickBase(pick.base);
  };

  MutationSandbox.prototype.mutagenize = function (n) {
    n = Math.max(1, Number(n) || 3);
    for (var k = 0; k < n; k++) {
      var pick = genetics.findMutationForClass(this.seq, 'random', Math.random);
      if (!pick) break;
      this._setEdit(pick.position, normaliseForPalette(pick.base));
    }
    this.selectedBase = null;
    clearPaletteSelection(this.els.palette);
    this._recompute();
  };

  MutationSandbox.prototype.undoLast = function () {
    if (!this.edits.length) return;
    var pos = this.lastAdded;
    if (pos == null || !this._editAt(pos)) {
      pos = this.edits[this.edits.length - 1].position;
    }
    this._removeEdit(pos);
    this._recompute();
  };

  /** Recompute the whole stack and refresh every readout. */
  MutationSandbox.prototype._recompute = function () {
    this._paintTiles();

    if (!this.edits.length) {
      this.current = null;
      this._renderEmpty();
      return;
    }

    var res = genetics.analyzeEdits(this.seq, this.edits);
    this.current = res;

    renderResult(this.els.result, res);
    renderDiff(this.els.diff, res);
    renderTray(this.els.tray, this.seq, this.edits, this);
    renderImpact(this.els.impact, this.els.impactLabel, res);

    this.els.wtLabel.textContent = summarise(res.wildType);
    this.wtPlate.load(res.wildType.residues, { seed: 4242 });
    renderMiniStats(this.els.wtStats, res.wildType);

    var highlight = {};
    res.changed.forEach(function (c) { highlight[c.index] = true; });
    this.els.mutLabel.textContent = summarise(res.mutant);
    this.mutPlate.load(res.mutant.residues, { highlight: highlight, seed: 4242 });
    renderMiniStats(this.els.mutStats, res.mutant);

    var noChange = res.type === 'none';
    this.els.commitBtn.disabled = noChange;
    this.els.commitBtn.textContent = noChange ? '✓ No change to insert' : '✓ Insert into gene';
  };

  MutationSandbox.prototype._renderEmpty = function () {
    if (this.els.result) {
      this.els.result.innerHTML = '<p class="muted">Click a base above, then choose a replacement — or hit a quick mutation. Stack as many edits as you like.</p>';
    }
    if (this.els.diff) this.els.diff.innerHTML = '';
    if (this.els.mutLabel) this.els.mutLabel.textContent = 'waiting…';
    if (this.els.commitBtn) {
      this.els.commitBtn.disabled = true;
      this.els.commitBtn.textContent = '✓ Insert into gene';
    }
    renderTray(this.els.tray, this.seq, this.edits, this);
    renderImpact(this.els.impact, this.els.impactLabel, null);
    renderMiniStats(this.els.mutStats, null);
    this.mutPlate.load([], { warmup: 0 });
  };

  MutationSandbox.prototype.commit = function () {
    if (!this.current || this.current.type === 'none') return;
    this.onCommit(this.current.mutantSeq);
  };

  MutationSandbox.prototype.clearPreview = function () {
    this.edits = [];
    this.lastAdded = null;
    this.current = null;
    this.selectedIndex = null;
    this.selectedBase = null;
    clearPaletteSelection(this.els.palette);
    this._paintTiles();
    this._renderEmpty();
    this._hidePicker();
    this._updatePosLabel();
  };

  /**
   * Called after a mutation is committed to the gene: keep the before/after
   * comparison on screen so the inserted mutant image stays visible (instead
   * of the pane resetting to "waiting…").
   */
  MutationSandbox.prototype.showApplied = function (beforeSeq, afterSeq, count) {
    var before = genetics.translate(beforeSeq);
    var after = genetics.translate(afterSeq);

    this.els.wtLabel.textContent = summarise(before) + '  ·  before';
    this.wtPlate.load(before.residues, { seed: 4242 });
    renderMiniStats(this.els.wtStats, before);

    var diffs = genetics.diffResidues(before, after);
    var highlight = {};
    diffs.forEach(function (c) { highlight[c.index] = true; });
    this.els.mutLabel.textContent = summarise(after) + '  ·  inserted';
    this.mutPlate.load(after.residues, { highlight: highlight, seed: 4242 });
    renderMiniStats(this.els.mutStats, after);

    if (this.els.result) {
      this.els.result.innerHTML =
        '<span class="badge good"><span class="tag">✅</span>Inserted into gene</span>' +
        '<p class="blurb">The edit' + (count === 1 ? '' : 's') + ' are now part of the recipe (' +
          before.length + ' aa → ' + after.length +
          ' aa). Pick another base above to stack more changes, or load a recipe to start fresh.</p>' +
        '<div class="mutation-meta">edit #' + count + ' committed to the gene</div>';
    }
    if (this.els.diff) {
      renderDiff(this.els.diff, { wildType: before, mutant: after, changed: diffs });
    }
    renderImpact(this.els.impact, this.els.impactLabel, { wildType: before, mutant: after, changed: diffs });

    this.edits = [];
    this.current = null;
    if (this.els.commitBtn) {
      this.els.commitBtn.disabled = true;
      this.els.commitBtn.textContent = '✓ Insert into gene';
    }
    renderTray(this.els.tray, this.seq, this.edits, this);
    this.setCount(count);
  };

  MutationSandbox.prototype._onKey = function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    var key = e.key || '';
    var upper = key.length === 1 ? key.toUpperCase() : '';

    if (key === 'ArrowRight') { this._moveSelection(e.shiftKey ? 3 : 1); stop(e); }
    else if (key === 'ArrowLeft') { this._moveSelection(e.shiftKey ? -3 : -1); stop(e); }
    else if (key === 'Enter') { this.commit(); stop(e); }
    else if (key === 'Backspace' || key === 'Delete') {
      if (this.selectedIndex != null) { this._removeEdit(this.selectedIndex); this._recompute(); }
      stop(e);
    } else if (upper === 'Z') { this.undoLast(); }
    else if (upper === 'R') { this.applyPreset('random'); }
    else if (upper === 'T') { this._pickBase('U'); }
    else if (upper === 'A' || upper === 'U' || upper === 'C' || upper === 'G') { this._pickBase(upper); }
  };

  // --------------------------------------------------------------- helpers
  function stop(e) { if (e.preventDefault) e.preventDefault(); }

  function normaliseForPalette(base) { return String(base).toUpperCase().replace(/T/g, 'U'); }

  function replaceBase(seq, index, base) {
    return seq.slice(0, index) + base + seq.slice(index + 1);
  }

  function codonAt(seq, pos) {
    var start = Math.floor(pos / 3) * 3;
    return seq.slice(start, start + 3);
  }

  function clearPaletteSelection(palette) {
    if (!palette) return;
    Array.prototype.forEach.call(palette.children, function (b) { b.classList.remove('selected'); });
  }

  function lookUpAA(codon) {
    if (!codon || codon.length < 3) return '';
    var letter = GTP.codons.CODON_TABLE[codon.replace(/T/g, 'U')];
    if (!letter) return '';
    if (letter === '*') return 'STOP';
    var meta = GTP.codons.AMINO_ACIDS[letter];
    return meta ? meta.code3 : letter;
  }

  function tileTooltip(seq, i) {
    var base = seq[i];
    var codon = codonAt(seq, i).replace(/T/g, 'U');
    var letter = GTP.codons.CODON_TABLE[codon];
    var meta = letter && GTP.codons.AMINO_ACIDS[letter];
    var parts = ['Base ' + base + ' at position ' + i, 'Codon ' + codon];
    if (letter === '*') parts.push('STOP codon');
    else if (meta) parts.push(meta.code3 + ' · ' + meta.name + ' (' + meta.category + ')');
    parts.push('Click to edit this base');
    return parts.join('\n');
  }

  function summarise(protein) {
    if (!protein.length) return 'empty chain';
    var bits = [protein.length + ' aa'];
    if (!protein.complete) bits.push('no STOP');
    else if (protein.length > 1) bits.push('STOP');
    return protein.fullSequence.slice(0, 18) + (protein.length > 18 ? '…' : '') + '  ·  ' + bits.join(', ');
  }

  function renderMiniStats(el, protein) {
    if (!el) return;
    if (!protein) { el.innerHTML = ''; return; }
    var pct = Math.round(protein.hydrophobicFraction * 100);
    var charge = protein.netCharge;
    el.innerHTML =
      '<span>' + protein.length + ' aa</span>' +
      '<span>' + pct + '% hydro</span>' +
      '<span>net ' + (charge > 0 ? '+' : '') + charge + '</span>';
  }

  function renderResult(el, res) {
    if (!el) return;
    var meta = res.meta || {};
    var icon = { good: '✅', warn: '⚠️', bad: '⛔', neutral: '•' }[meta.tone] || '•';
    var metaLine;

    if (res.multi) {
      var identity = Math.round(genetics.proteinIdentity(res.wildType, res.mutant) * 100);
      metaLine = res.editCount + ' edits · ' + res.wildType.length + ' aa → ' + res.mutant.length +
        ' aa · ' + identity + '% identical';
    } else {
      var before = codonAt(res.originalSeq, res.position).replace(/T/g, 'U');
      var after = codonAt(res.mutantSeq, res.position).replace(/T/g, 'U');
      metaLine = 'base ' + escapeHtml(normaliseForPalette(res.from)) + ' → ' + escapeHtml(normaliseForPalette(res.to)) +
        ' at position ' + res.position + '  ·  codon ' + escapeHtml(before) + ' → ' + escapeHtml(after) +
        '  ·  ' + res.wildType.length + ' aa → ' + res.mutant.length + ' aa';
    }

    el.innerHTML =
      '<span class="badge ' + (meta.tone || 'neutral') + '">' +
        '<span class="tag">' + icon + '</span>' + escapeHtml(meta.label || res.type) +
        (res.editCount > 1 ? 's' : '') +
      '</span>' +
      '<p class="blurb">' + escapeHtml(meta.blurb || '') + '</p>' +
      '<div class="mutation-meta">' + metaLine + '</div>';
  }

  function renderDiff(el, res) {
    if (!el) return;
    var changed = {};
    res.changed.forEach(function (c) { changed[c.index] = true; });
    var out = '<div><span class="same">wild type </span><span class="same">' +
      escapeHtml(res.wildType.fullSequence || '(empty)') + '</span></div>';
    var mutLine = '';
    for (var i = 0; i < res.mutant.fullSequence.length; i++) {
      var ch = res.mutant.fullSequence[i];
      var from = res.wildType.fullSequence[i];
      var title = from === ch ? '' : (' title="' + escapeHtml('position ' + i + ': ' + (from || '—') + ' → ' + ch) + '"');
      mutLine += '<span class="' + (changed[i] ? 'diff' : 'same') + '"' + title + '>' + escapeHtml(ch) + '</span>';
    }
    if (!res.mutant.fullSequence.length) mutLine = '<span class="same">(empty)</span>';
    out += '<div><span class="same">mutant    </span>' + mutLine;
    if (res.mutant.stop && res.mutant.length < res.wildType.length) {
      out += ' <span class="diff-marker">✂ STOP</span>';
    }
    out += '</div>';
    el.innerHTML = out;
  }

  function renderTray(el, seq, edits, self) {
    if (!el) return;
    el.innerHTML = '';
    if (!edits || !edits.length) {
      el.innerHTML = '<span class="muted small">No edits yet — click a base to start stacking.</span>';
      return;
    }
    edits.slice().sort(function (a, b) { return a.position - b.position; }).forEach(function (e) {
      var single = genetics.analyzeMutation(seq, e.position, e.base);
      var tone = (single.meta && single.meta.tone) || 'neutral';
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'edit-chip tone-' + tone;
      chip.dataset.position = e.position;
      chip.title = 'Edit at position ' + e.position + ': ' + normaliseForPalette(seq[e.position]) +
        ' → ' + normaliseForPalette(e.base) + ' (' + (single.meta ? single.meta.label : single.type) +
        ') — click to select';
      chip.innerHTML =
        '<span class="ec-base">' + escapeHtml(normaliseForPalette(seq[e.position])) + '→' + escapeHtml(normaliseForPalette(e.base)) + '</span>' +
        '<span class="ec-pos">@' + e.position + '</span>' +
        '<span class="ec-type">' + escapeHtml(SHORT_TYPE[single.type] || single.type) + '</span>';
      chip.addEventListener('click', function () { self._selectIndex(e.position); });
      el.appendChild(chip);
    });
  }

  function impactTier(score) {
    if (score < 10) return 'benign';
    if (score < 30) return 'modest';
    if (score < 55) return 'moderate';
    if (score < 80) return 'severe';
    return 'catastrophic';
  }

  function renderImpact(el, labelEl, res) {
    var score = res ? genetics.mutationImpact(res.wildType, res.mutant, res.changed) : 0;
    var tier = impactTier(score);
    if (el) {
      el.style.width = score + '%';
      el.dataset.tier = tier;
      el.dataset.score = score;
    }
    if (labelEl) {
      labelEl.textContent = res ? (tier + ' · ' + score + '/100') : '—';
      labelEl.dataset.tier = tier;
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  GTP.MutationSandbox = MutationSandbox;
})(typeof window !== 'undefined' ? window : this);
