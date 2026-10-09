/*
 * Phase 1 - Core genetics engine
 * ---------------------------------------------------------------------------
 * Pure, UI-free logic:
 *   clean()            - normalise a raw sequence
 *   toMRNA()           - DNA -> mRNA
 *   transcribe()       - alias of toMRNA (T -> U)
 *   splitCodons()      - chunk a strand into 3-letter tokens
 *   translate()        - mRNA/DNA -> amino-acid chain (protein)
 *   mutateBase()       - swap a single base (Phase 4 sandbox)
 *   analyzeMutation()  - wild-type vs mutant protein + classification
 *   classifyMutation() - silent / missense / nonsense / start-loss / stop-loss
 *
 * Dual-target (browser global + Node require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../data/codons.js'));
  } else {
    root.GTP = root.GTP || {};
    root.GTP.genetics = factory(root.GTP.codons);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (codons) {
  'use strict';

  var AMINO_ACIDS = codons.AMINO_ACIDS;
  var CODON_TABLE = codons.CODON_TABLE;
  var DNA_CODON_TABLE = codons.DNA_CODON_TABLE;
  var START = codons.START_CODON; // 'AUG'

  /** Strip whitespace/numbers/junk and upper-case the sequence. */
  function clean(seq) {
    return String(seq == null ? '' : seq)
      .toUpperCase()
      .replace(/[^ACGTU]/g, '');
  }

  /** True when a string uses the RNA alphabet. */
  function isRNA(seq) {
    return /U/.test(String(seq || '').toUpperCase());
  }

  /** DNA -> mRNA (all thymine becomes uracil). */
  function toMRNA(seq) {
    return clean(seq).replace(/T/g, 'U');
  }

  // The concept calls this "transcription"; keep both names.
  var transcribe = toMRNA;

  /** Split a strand into complete 3-letter codons; the leftover is returned too. */
  function splitCodons(seq) {
    var s = clean(seq);
    var list = [];
    for (var i = 0; i + 3 <= s.length; i += 3) list.push(s.slice(i, i + 3));
    return { codons: list, remainder: s.slice(list.length * 3), sequence: s };
  }

  function makeResidue(codon, aa, index) {
    var meta = AMINO_ACIDS[aa] || AMINO_ACIDS.X;
    return {
      index: index,
      codon: codon,
      aa: aa,
      code3: meta.code3,
      name: meta.name,
      category: meta.category,
      hydro: meta.hydro,
      charge: meta.charge,
      color: meta.color,
      isStart: codon === START
    };
  }

  /**
   * Translate a DNA or mRNA strand, reading strictly in triplets from the 5' end.
   * Stops at the first STOP codon. Returns a rich protein object.
   */
  function translate(seq) {
    var source = clean(seq);
    var rna = source.replace(/T/g, 'U');
    var parts = splitCodons(rna);
    var residues = [];
    var stop = null;
    var startFound = false;
    var sawUnknown = false;

    for (var i = 0; i < parts.codons.length; i++) {
      var codon = parts.codons[i];
      var letter = CODON_TABLE[codon];
      if (letter === undefined) {
        letter = 'X';
        sawUnknown = true;
      }
      if (!startFound && codon === START) startFound = true;
      if (letter === '*') {
        stop = { codon: codon, index: i };
        break;
      }
      residues.push(makeResidue(codon, letter, residues.length));
    }

    var oneLetter = residues.map(function (r) { return r.aa; }).join('');
    var threeLetter = residues.map(function (r) { return r.code3; }).join('-');

    return {
      input: source,
      mrna: rna,
      codons: parts.codons,
      remainder: parts.remainder,
      residues: residues,
      stop: stop,
      startFound: startFound,
      hasUnknown: sawUnknown,
      fullSequence: oneLetter,
      threeLetter: threeLetter,
      length: residues.length,
      complete: !!stop,
      // Convenience: net charge & fraction hydrophobic (used by the UI).
      netCharge: residues.reduce(function (s, r) { return s + r.charge; }, 0),
      hydrophobicFraction: residues.length
        ? residues.filter(function (r) { return r.category === 'hydrophobic'; }).length / residues.length
        : 0
    };
  }

  // ---------------------------------------------------------------------------
  // Phase 4 - point mutations
  // ---------------------------------------------------------------------------

  /**
   * Swap one base. Keeps the strand's existing alphabet (DNA stays DNA, RNA stays RNA).
   * @throws {RangeError} if the position is out of bounds.
   * @throws {TypeError}  if the replacement is not a nucleotide.
   */
  function mutateBase(seq, position, newBase) {
    var original = clean(seq);
    var rnaInput = isRNA(original);
    var arr = original.split('');
    var idx = Number(position);
    if (!Number.isInteger(idx) || idx < 0 || idx >= arr.length) {
      throw new RangeError('Position ' + position + ' is outside the strand (0..' + (arr.length - 1) + ')');
    }
    var base = String(newBase || '').toUpperCase();
    if (!/^[ACGTU]$/.test(base)) {
      throw new TypeError('Replacement must be one of A, C, G, T or U');
    }

    // Match the channel's alphabet.
    var normalised = rnaInput ? base.replace(/T/g, 'U') : base.replace(/U/g, 'T');
    arr[idx] = normalised;

    var result = arr.join('');
    return rnaInput ? result.replace(/T/g, 'U') : result.replace(/U/g, 'T');
  }

  var MUTATION_TYPES = {
    none: {
      label: 'No change',
      tone: 'neutral',
      blurb: 'The sequence is identical — the same dish comes out of the kitchen.'
    },
    silent: {
      label: 'Silent mutation',
      tone: 'good',
      blurb: 'A base changed, but the codon still cooks the same amino acid. Tastes identical.'
    },
    missense: {
      label: 'Missense mutation',
      tone: 'warn',
      blurb: 'A different ingredient is swapped in, so the dish folds into a new shape.'
    },
    nonsense: {
      label: 'Nonsense mutation',
      tone: 'bad',
      blurb: 'A premature STOP codon appears — the chef stops early and the dish is ruined.'
    },
    'start-loss': {
      label: 'Start-loss mutation',
      tone: 'bad',
      blurb: 'The START (AUG) signal is destroyed, so the chef never begins cooking.'
    },
    'stop-loss': {
      label: 'Stop-loss mutation',
      tone: 'warn',
      blurb: 'The STOP signal is gone, so the chef keeps cooking past the recipe end.'
    }
  };

  /** Compare a wild-type and mutant protein, returning the mutation class. */
  function classifyMutation(wt, mut) {
    if (wt.mrna === mut.mrna) return 'none';

    var wtStop = wt.stop ? wt.stop.index : Infinity;
    var mutStop = mut.stop ? mut.stop.index : Infinity;

    if (wt.startFound && !mut.startFound) return 'start-loss';
    if (mutStop < wtStop) return 'nonsense';
    if (wtStop !== Infinity && mutStop === Infinity) return 'stop-loss';

    var sameProtein = mut.fullSequence === wt.fullSequence;
    if (sameProtein && mutStop === wtStop) return 'silent';
    return 'missense';
  }

  /** Indexes where the two proteins differ in amino acid (or existence). */
  function diffResidues(wt, mut) {
    var changed = [];
    var n = Math.max(wt.length, mut.length);
    for (var i = 0; i < n; i++) {
      var a = wt.residues[i] ? wt.residues[i].aa : null;
      var b = mut.residues[i] ? mut.residues[i].aa : null;
      if (a !== b) changed.push({ index: i, from: a, to: b });
    }
    return changed;
  }

  /**
   * Full mutation analysis for the sandbox: returns both proteins, the mutant
   * strand, the classification, a human blurb and the list of changed positions.
   */
  function analyzeMutation(seq, position, newBase) {
    var original = clean(seq);
    var mutantSeq = mutateBase(original, position, newBase);
    var wt = translate(original);
    var mut = translate(mutantSeq);
    var type = classifyMutation(wt, mut);
    return {
      position: Number(position),
      from: original[Number(position)],
      to: mutantSeq[Number(position)],
      originalSeq: original,
      mutantSeq: mutantSeq,
      wildType: wt,
      mutant: mut,
      type: type,
      meta: MUTATION_TYPES[type],
      changed: diffResidues(wt, mut)
    };
  }

  /**
   * Analyse any number of point edits at once (the sandbox lets you stack them).
   * A single edit returns exactly the same rich shape as analyzeMutation().
   *
   * @param {string} seq  DNA or mRNA
   * @param {Array<{position:number, base:string}>} edits
   */
  function analyzeEdits(seq, edits) {
    var list = (edits || [])
      .filter(function (e) { return e && Number.isInteger(Number(e.position)); })
      .map(function (e) { return { position: Number(e.position), base: String(e.base).toUpperCase() }; })
      .sort(function (a, b) { return a.position - b.position; });
    if (!list.length) return null;

    if (list.length === 1) {
      var single = analyzeMutation(seq, list[0].position, list[0].base);
      single.edits = list;
      single.editCount = 1;
      single.multi = false;
      return single;
    }

    var original = clean(seq);
    var mutantSeq = original;
    for (var i = 0; i < list.length; i++) {
      mutantSeq = mutateBase(mutantSeq, list[i].position, list[i].base);
    }
    var wt = translate(original);
    var mut = translate(mutantSeq);
    var type = classifyMutation(wt, mut);
    return {
      originalSeq: original,
      mutantSeq: mutantSeq,
      wildType: wt,
      mutant: mut,
      type: type,
      meta: MUTATION_TYPES[type],
      changed: diffResidues(wt, mut),
      edits: list,
      editCount: list.length,
      multi: true
    };
  }

  /** Fraction of aligned residues that are identical (0..1). */
  function proteinIdentity(wt, mut) {
    var n = Math.max(wt.length, mut.length);
    if (!n) return 1;
    var same = 0;
    for (var i = 0; i < n; i++) {
      var a = wt.residues[i] ? wt.residues[i].aa : null;
      var b = mut.residues[i] ? mut.residues[i].aa : null;
      if (a === b) same++;
    }
    return same / n;
  }

  /**
   * A 0..100 "how disruptive is this?" score for the sandbox's impact meter.
   * Weighs residue changes, length change, charge shift and start/stop damage.
   */
  function mutationImpact(wt, mut, changed) {
    var n = (changed || []).length;
    var maxLen = Math.max(wt.length, mut.length, 1);
    var score = 0;

    // How much of the chain is altered (relative, so short chains aren't unfairly low).
    score += Math.min(55, Math.round((n / maxLen) * 55 * 1.5));
    // Relative length shift (truncation / extension).
    score += Math.min(20, Math.round((Math.abs(wt.length - mut.length) / maxLen) * 20 * 1.5));
    // Charge wobble.
    score += Math.min(8, Math.abs((wt.netCharge || 0) - (mut.netCharge || 0)) * 3);
    // The categorical disasters.
    if (wt.fullSequence[0] === 'M' && mut.fullSequence[0] !== 'M') score += 20; // start lost
    if (wt.stop && !mut.stop) score += 15;                                       // stop lost
    if (wt.stop && mut.stop && mut.length < wt.length) score += 20;              // premature stop

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Find a single-base change that produces a chosen mutation class.
   * Used by the sandbox's one-click "quick mutation" buttons. Each candidate is
   * re-checked with classifyMutation so the preset always demonstrates its label.
   *
   * @param {string} seq  DNA or mRNA
   * @param {'silent'|'missense'|'nonsense'|'start-loss'|'stop-loss'|'random'} type
   * @param {function():number} [rng]  returns 0..1 (defaults to first match)
   * @returns {{position:number, base:string}|null}
   */
  function findMutationForClass(seq, type, rng) {
    var s = toMRNA(seq);
    var candidates = [];
    var codonCount = Math.floor(s.length / 3);
    var BASES = 'ACGU';

    for (var ci = 0; ci < codonCount; ci++) {
      var start = ci * 3;
      var codon = s.slice(start, start + 3);
      var current = CODON_TABLE[codon];
      for (var p = 0; p < 3; p++) {
        for (var bi = 0; bi < 4; bi++) {
          var b = BASES[bi];
          if (b === codon[p]) continue;
          var nc = codon.slice(0, p) + b + codon.slice(p + 1);
          var na = CODON_TABLE[nc];
          var pos = start + p;

          if (type === 'random') { candidates.push({ position: pos, base: b }); continue; }
          if (type === 'silent' && na === current && current !== '*') candidates.push({ position: pos, base: b });
          if (type === 'missense' && na !== current && na !== '*' && current !== '*') candidates.push({ position: pos, base: b });
          if (type === 'nonsense' && na === '*' && current !== '*') candidates.push({ position: pos, base: b });
          if (type === 'start-loss' && ci === 0 && codon === START && nc !== START) candidates.push({ position: pos, base: b });
          if (type === 'stop-loss' && current === '*' && na !== '*') candidates.push({ position: pos, base: b });
        }
      }
    }

    var verified = [];
    for (var k = 0; k < candidates.length; k++) {
      var c = candidates[k];
      try {
        if (type === 'random' || analyzeMutation(seq, c.position, c.base).type === type) verified.push(c);
      } catch (e) { /* position invalid for this strand; skip */ }
    }
    if (!verified.length) return null;
    var r = rng ? rng() : 0;
    var idx = Math.floor(r * verified.length) % verified.length;
    return verified[idx];
  }

  return {
    clean: clean,
    isRNA: isRNA,
    toMRNA: toMRNA,
    transcribe: transcribe,
    splitCodons: splitCodons,
    translate: translate,
    mutateBase: mutateBase,
    classifyMutation: classifyMutation,
    diffResidues: diffResidues,
    analyzeMutation: analyzeMutation,
    analyzeEdits: analyzeEdits,
    proteinIdentity: proteinIdentity,
    mutationImpact: mutationImpact,
    findMutationForClass: findMutationForClass,
    MUTATION_TYPES: MUTATION_TYPES
  };
});
