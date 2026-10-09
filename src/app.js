/*
 * App controller - wires Phase 1 (genetics) to Phase 2/3/4 (UI).
 * Browser only.
 */
(function (root) {
  'use strict';

  var GTP = root.GTP || {};
  var genetics = GTP.genetics;
  var recipes = GTP.recipes;
  var codons = GTP.codons;

  var allRecipes = [];

  var state = {
    activeRecipeId: null,
    recipeName: '',
    recipeFilter: 'All',
    mutationCount: 0,
    builder: '',      // mRNA in the prep counter
    sequence: '',     // cooked sequence
    protein: null,
    readoutSpans: []
  };

  var els = {};
  var kitchen, plate, mutation;

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ------------------------------------------------------------------ init
  function init() {
    els = {
      recipeList: $('recipeList'),
      recipeFilters: $('recipeFilters'),
      basePalette: $('basePalette'),
      strandTrack: $('strandTrack'),
      strandCount: $('strandCount'),
      strandHint: $('strandHint'),
      btnBackspace: $('btn-backspace'),
      btnClear: $('btn-clear'),
      btnCook: $('btn-cook'),
      kitchenDish: $('kitchenDish'),
      kitchenCodon: $('kitchenCodon'),
      btnKplay: $('btn-kplay'),
      btnKstep: $('btn-kstep'),
      btnKreset: $('btn-kreset'),
      kitchenSpeed: $('kitchenSpeed'),
      speedReadout: $('speedReadout'),
      kitchenProgress: $('kitchenProgress'),
      sequenceReadout: $('sequenceReadout'),
      foldStats: $('foldStats'),
      foldLegend: $('foldLegend'),
      proteinInfo: $('proteinInfo'),
      btnFoldReplay: $('btn-fold-replay'),
      plateRotate: $('plateRotate'),
      plateLabels: $('plateLabels'),
      btnSample: $('btn-sample')
    };

    allRecipes = recipes.allRecipes();
    buildRecipeFilters();
    renderRecipeList('All');
    buildPrepPalette();
    buildLegend();

    kitchen = new GTP.KitchenView($('kitchenCanvas'), {
      speed: sliderToSpeed(els.kitchenSpeed.value),
      onAdvance: onKitchenAdvance,
      onComplete: onKitchenComplete,
      onStatus: onKitchenStatus,
      onFraction: onKitchenFraction
    });
    updateSpeedReadout(sliderToSpeed(els.kitchenSpeed.value));

    plate = new GTP.PlateView($('plateCanvas'), {
      autoRotate: true,
      labels: false,
      onStats: onFoldStats
    });

    mutation = new GTP.MutationSandbox({
      els: {
        strand: $('mutationStrand'),
        strandShell: $('mutationStrandShell'),
        picker: $('mutationPicker'),
        palette: $('mutationPalette'),
        presets: $('mutationPresets'),
        tray: $('mutationTray'),
        impact: $('impactBar'),
        impactLabel: $('impactLabel'),
        posLabel: $('mutationPosLabel'),
        count: $('mutationCount'),
        commitBtn: $('btn-commit-mutation'),
        undoBtn: $('btn-undo-mutation'),
        resetBtn: $('btn-reset-mutation'),
        mutagenBtn: $('btn-mutagenize'),
        result: $('mutationResult'),
        wtCanvas: $('wtCanvas'),
        mutCanvas: $('mutCanvas'),
        wtLabel: $('wtLabel'),
        mutLabel: $('mutLabel'),
        wtStats: $('wtStats'),
        mutStats: $('mutStats'),
        diff: $('diffView')
      },
      getSequence: function () { return state.sequence; },
      onCommit: commitMutation
    });

    bindControls();

    // Boot with the first recipe.
    loadRecipe(recipes.allRecipes()[0], { autoplay: true });
  }

  // ----------------------------------------------------------- recipe list
  function buildRecipeFilters() {
    var cuisines = [];
    allRecipes.forEach(function (r) {
      if (cuisines.indexOf(r.cuisine) === -1) cuisines.push(r.cuisine);
    });
    var row = els.recipeFilters;
    row.innerHTML = '';
    ['All'].concat(cuisines).forEach(function (c) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (c === 'All' ? ' active' : '');
      chip.textContent = c;
      chip.dataset.filter = c;
      chip.addEventListener('click', function () {
        Array.prototype.forEach.call(row.children, function (x) { x.classList.toggle('active', x === chip); });
        renderRecipeList(c);
      });
      row.appendChild(chip);
    });
  }

  function renderRecipeList(filter) {
    state.recipeFilter = filter || 'All';
    var list = els.recipeList;
    list.innerHTML = '';
    allRecipes.filter(function (r) {
      return state.recipeFilter === 'All' || r.cuisine === state.recipeFilter;
    }).forEach(function (recipe) {
      var protein = genetics.translate(recipe.dna);
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'recipe-card';
      card.dataset.id = recipe.id;
      card.innerHTML =
        '<span class="emoji">' + recipe.emoji + '</span>' +
        '<span>' +
          '<span class="rc-name">' + escapeHtml(recipe.name) + '</span>' +
          '<span class="rc-meta">' + escapeHtml(recipe.cuisine) + ' · ' + protein.length + ' aa</span>' +
          '<span class="rc-desc">' + escapeHtml(recipe.description) + '</span>' +
        '</span>';
      card.addEventListener('click', function () { loadRecipe(recipe, { autoplay: true }); });
      list.appendChild(card);
    });
    markActiveRecipe(state.activeRecipeId);
  }

  function markActiveRecipe(id) {
    Array.prototype.forEach.call(els.recipeList.children, function (c) {
      c.classList.toggle('active', c.dataset.id === id);
    });
  }

  function loadRecipe(recipe, opts) {
    opts = opts || {};
    if (!recipe) return;
    state.activeRecipeId = recipe.id;
    state.mutationCount = 0;
    state.builder = genetics.toMRNA(recipe.dna);
    state.recipeName = recipe.emoji + '  ' + recipe.name;
    markActiveRecipe(recipe.id);
    renderPrep();
    cook({ autoplay: opts.autoplay });
    mutation.setCount(0);
  }

  /** Commit a sandbox mutation into the real gene, so edits accumulate. */
  function commitMutation(mutantSeq) {
    var prevSeq = state.sequence;
    state.mutationCount = (state.mutationCount || 0) + 1;
    state.builder = mutantSeq;
    state.activeRecipeId = null;
    state.recipeName = baseDishName(state.recipeName) + '  (mutated)';
    markActiveRecipe(null);
    renderPrep();
    cook({ autoplay: false });
    // Keep the comparison visible: show what was just inserted instead of
    // resetting the mutant pane back to "waiting…".
    mutation.showApplied(prevSeq, mutantSeq, state.mutationCount);
  }

  function baseDishName(name) {
    return String(name || '🧪  Custom dish').replace(/\s*\(mutated\)\s*$/, '');
  }

  // ------------------------------------------------------------ prep counter
  function buildPrepPalette() {
    ['A', 'U', 'C', 'G'].forEach(function (base) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'base-btn base-' + base;
      b.textContent = base;
      b.addEventListener('click', function () { appendBase(base); });
      els.basePalette.appendChild(b);
    });
  }

  function appendBase(base) {
    state.builder += base;
    state.activeRecipeId = null;
    state.recipeName = '🧪  Custom dish';
    markActiveRecipe(null);
    renderPrep();
  }

  function renderPrep() {
    var track = els.strandTrack;
    track.innerHTML = '';
    for (var i = 0; i < state.builder.length; i++) {
      var base = state.builder[i];
      var tile = document.createElement('div');
      tile.className = 'base-tile t-' + base + (i % 3 === 0 ? ' codon-start' : '');
      tile.textContent = base;
      track.appendChild(tile);
    }
    els.strandCount.textContent = state.builder.length + ' nt  ·  ' + Math.floor(state.builder.length / 3) + ' codons';
    els.strandHint.className = 'hint';
    els.strandHint.textContent = prepHint(state.builder);
  }

  function prepHint(seq) {
    if (!seq.length) return 'Start with AUG (the START codon).';
    if (seq.slice(0, 3) !== 'AUG') return 'Tip: real genes begin with AUG (Methionine).';
    if (seq.length % 3 !== 0) return 'Bases must come in threes — ' + (seq.length % 3) + ' extra base(s) will be ignored.';
    var p = genetics.translate(seq);
    if (!p.complete) return 'No STOP codon yet — the chef will cook to the end of the strand.';
    return 'Ready to cook: ' + p.length + ' amino acids. Press “Cook this gene”.';
  }

  // ---------------------------------------------------------------- cooking
  function cook(opts) {
    opts = opts || {};
    if (!state.builder.length) {
      els.strandHint.className = 'hint err';
      els.strandHint.textContent = 'Nothing to cook — add some nucleotides first.';
      return;
    }
    state.sequence = state.builder;
    state.protein = genetics.translate(state.builder);

    kitchen.load(state.protein);
    plate.load(state.protein.residues, { seed: seedFromString(state.sequence) });
    mutation.setSequence(state.sequence);

    els.kitchenDish.textContent = state.recipeName || '🧪  Custom dish';
    els.kitchenCodon.textContent = state.protein.length + ' amino acids · ' + (state.protein.complete ? 'STOP found' : 'no STOP');
    renderSequenceReadout();
    renderProteinInfo();

    if (opts.autoplay) kitchen.play();
    else updatePlayButton(kitchen.status);
  }

  function renderSequenceReadout() {
    var out = els.sequenceReadout;
    out.innerHTML = '';
    state.readoutSpans = [];
    var codonsList = state.protein.codons;
    var stopIdx = state.protein.stop ? state.protein.stop.index : -1;

    for (var i = 0; i < codonsList.length; i++) {
      var codon = codonsList[i];
      var aa = codons.CODON_TABLE[codon.replace(/T/g, 'U')];
      var label = aa === '*' ? 'STOP' : (aa && codons.AMINO_ACIDS[aa] ? codons.AMINO_ACIDS[aa].code3 : '?');
      var span = document.createElement('span');
      span.className = 'codon';
      span.innerHTML = escapeHtml(codon) + ' <span class="aa">' + escapeHtml(label) + '</span>';
      if (i === stopIdx) span.classList.add('done');
      out.appendChild(span);
      state.readoutSpans.push(span);
    }
    if (!codonsList.length) out.innerHTML = '<span class="muted">No codons.</span>';
  }

  function highlightReadout(consumed) {
    for (var i = 0; i < state.readoutSpans.length; i++) {
      var cls = 'codon';
      if (i < consumed) cls += ' done';
      else if (i === consumed) cls += ' current';
      state.readoutSpans[i].className = cls;
    }
  }

  function onKitchenAdvance(info) {
    highlightReadout(info.consumed);
    var meta = info.residue;
    els.kitchenCodon.textContent = info.codon + ' → ' + (meta ? meta.code3 + ' (' + meta.name + ')' : '');
  }

  function onKitchenComplete(info) {
    highlightReadout(state.protein.stop ? state.protein.stop.index + 1 : state.protein.codons.length);
    if (info && info.stop) {
      els.kitchenCodon.textContent = 'STOP codon reached — dish is ready to plate 🍽️';
    } else {
      els.kitchenCodon.textContent = 'End of strand — dish is ready to plate 🍽️';
    }
    els.kitchenProgress.style.width = '100%';
    updatePlayButton('done');
  }

  function onKitchenStatus(status) {
    updatePlayButton(status);
  }

  function onKitchenFraction(f) {
    els.kitchenProgress.style.width = Math.round(f * 100) + '%';
  }

  function updatePlayButton(status) {
    if (!els.btnKplay) return;
    if (status === 'running') els.btnKplay.textContent = '⏸ Pause';
    else if (status === 'done') els.btnKplay.textContent = '▶ Cook again';
    else els.btnKplay.textContent = '▶ Play';
  }

  // ---------------------------------------------------------------- plate
  function renderProteinInfo() {
    var p = state.protein;
    var pct = Math.round(p.hydrophobicFraction * 100);
    var charge = p.netCharge;
    els.proteinInfo.innerHTML =
      '<div><strong>' + escapeHtml(state.recipeName || 'Custom dish') + '</strong></div>' +
      '<div class="muted">' + p.length + ' residues · ' + pct + '% hydrophobic · net charge ' +
        (charge > 0 ? '+' : '') + charge +
        (p.stop ? ' · STOP ' + p.stop.codon : ' · no STOP') + '</div>' +
      '<div class="seq">' + escapeHtml(p.fullSequence || '—') + '</div>';
  }

  function onFoldStats(s) {
    els.foldStats.innerHTML =
      stat('Residues', s.length) +
      stat('Fold radius', s.rg.toFixed(1)) +
      stat('Hydrophobic', Math.round(s.hydro * 100) + '%');
  }

  function stat(k, v) {
    return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>';
  }

  function buildLegend() {
    var items = [
      ['#22c55e', 'Hydrophobic'],
      ['#7dd3fc', 'Polar / hydrophilic'],
      ['#3b82f6', 'Positively charged'],
      ['#ef4444', 'Negatively charged'],
      ['#111827', 'STOP']
    ];
    els.foldLegend.innerHTML = items.map(function (it) {
      return '<span class="item"><span class="dot" style="background:' + it[0] + '"></span>' + it[1] + '</span>';
    }).join('');
  }

  // ------------------------------------------------------------- controls
  function bindControls() {
    els.btnBackspace.addEventListener('click', function () {
      state.builder = state.builder.slice(0, -1);
      state.activeRecipeId = null;
      state.recipeName = '🧪  Custom dish';
      markActiveRecipe(null);
      renderPrep();
    });

    els.btnClear.addEventListener('click', function () {
      state.builder = '';
      state.activeRecipeId = null;
      state.recipeName = '🧪  Custom dish';
      markActiveRecipe(null);
      renderPrep();
    });

    els.btnCook.addEventListener('click', function () {
      state.mutationCount = 0;
      cook({ autoplay: true });
      mutation.setCount(0);
    });

    els.btnKplay.addEventListener('click', function () { kitchen.toggle(); });
    els.btnKstep.addEventListener('click', function () { kitchen.step(); });
    els.btnKreset.addEventListener('click', function () { kitchen.reset(); highlightReadout(0); });
    els.kitchenSpeed.addEventListener('input', function () {
      var s = sliderToSpeed(els.kitchenSpeed.value);
      kitchen.setSpeed(s);
      updateSpeedReadout(s);
    });

    els.btnFoldReplay.addEventListener('click', function () { plate.replay(); });
    els.plateRotate.addEventListener('change', function () { plate.setAutoRotate(els.plateRotate.checked); });
    els.plateLabels.addEventListener('change', function () { plate.setLabels(els.plateLabels.checked); });

    els.btnSample.addEventListener('click', function () {
      var all = recipes.allRecipes();
      var pick = all[Math.floor(Math.random() * all.length)];
      loadRecipe(pick, { autoplay: true });
    });
  }

  function seedFromString(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // The slider is an "1–10" effort dial; map it to a relaxed 0.5–5 codons/sec
  // so the default (3) cooks at an easy 1.5 codons per second.
  function sliderToSpeed(level) {
    var s = Number(level) / 2;
    if (!isFinite(s) || s <= 0) s = 1.5;
    return Math.max(0.5, Math.round(s * 10) / 10);
  }

  function updateSpeedReadout(s) {
    if (els.speedReadout) els.speedReadout.textContent = s.toFixed(1) + ' /s';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
