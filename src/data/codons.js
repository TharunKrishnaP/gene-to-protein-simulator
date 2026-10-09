/*
 * Phase 1 - Codon Lookup Engine (data layer)
 * -------------------------------------------------
 * The standard genetic code: 64 mRNA codons -> 20 amino acids + STOP.
 * Also carries the physical/chemical properties used later by the folding
 * simulation (Phase 3) and the mutation sandbox (Phase 4).
 *
 * This file is dual-target:
 *   - Browser: loaded as a classic <script> and attaches to window.GTP.codons
 *   - Node:    `require('./codons.js')` returns the module (for tests)
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.GTP = root.GTP || {};
    root.GTP.codons = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Amino acid metadata.
  //   hydro  = Kyte–Doolittle hydropathy index (+ hydrophobic, - hydrophilic)
  //   charge = net charge at physiological pH (~7.4)
  // ---------------------------------------------------------------------------
  var AMINO_ACIDS = {
    A: { code1: 'A', code3: 'Ala', name: 'Alanine',       category: 'hydrophobic', hydro:  1.8, charge:  0, color: '#78d64b' },
    R: { code1: 'R', code3: 'Arg', name: 'Arginine',      category: 'positive',    hydro: -4.5, charge: +1, color: '#3b82f6' },
    N: { code1: 'N', code3: 'Asn', name: 'Asparagine',    category: 'polar',       hydro: -3.5, charge:  0, color: '#60a5fa' },
    D: { code1: 'D', code3: 'Asp', name: 'Aspartate',     category: 'negative',    hydro: -3.5, charge: -1, color: '#ef4444' },
    C: { code1: 'C', code3: 'Cys', name: 'Cysteine',      category: 'polar',       hydro:  2.5, charge:  0, color: '#f59e0b' },
    Q: { code1: 'Q', code3: 'Gln', name: 'Glutamine',     category: 'polar',       hydro: -3.5, charge:  0, color: '#2dd4bf' },
    E: { code1: 'E', code3: 'Glu', name: 'Glutamate',     category: 'negative',    hydro: -3.5, charge: -1, color: '#dc2626' },
    G: { code1: 'G', code3: 'Gly', name: 'Glycine',       category: 'hydrophobic', hydro: -0.4, charge:  0, color: '#9ca3af' },
    H: { code1: 'H', code3: 'His', name: 'Histidine',     category: 'positive',    hydro: -3.2, charge: +1, color: '#8b5cf6' },
    I: { code1: 'I', code3: 'Ile', name: 'Isoleucine',    category: 'hydrophobic', hydro:  4.5, charge:  0, color: '#4ade80' },
    L: { code1: 'L', code3: 'Leu', name: 'Leucine',       category: 'hydrophobic', hydro:  3.8, charge:  0, color: '#22c55e' },
    K: { code1: 'K', code3: 'Lys', name: 'Lysine',        category: 'positive',    hydro: -3.9, charge: +1, color: '#2563eb' },
    M: { code1: 'M', code3: 'Met', name: 'Methionine',    category: 'hydrophobic', hydro:  1.9, charge:  0, color: '#fb923c' },
    F: { code1: 'F', code3: 'Phe', name: 'Phenylalanine', category: 'hydrophobic', hydro:  2.8, charge:  0, color: '#ec4899' },
    P: { code1: 'P', code3: 'Pro', name: 'Proline',       category: 'hydrophobic', hydro: -1.6, charge:  0, color: '#b45309' },
    S: { code1: 'S', code3: 'Ser', name: 'Serine',        category: 'polar',       hydro: -0.8, charge:  0, color: '#7dd3fc' },
    T: { code1: 'T', code3: 'Thr', name: 'Threonine',     category: 'polar',       hydro: -0.7, charge:  0, color: '#34d399' },
    W: { code1: 'W', code3: 'Trp', name: 'Tryptophan',    category: 'hydrophobic', hydro: -0.9, charge:  0, color: '#a855f7' },
    Y: { code1: 'Y', code3: 'Tyr', name: 'Tyrosine',      category: 'polar',       hydro: -1.3, charge:  0, color: '#facc15' },
    V: { code1: 'V', code3: 'Val', name: 'Valine',        category: 'hydrophobic', hydro:  4.2, charge:  0, color: '#16a34a' },
    '*': { code1: '*', code3: 'Stop', name: 'Stop',        category: 'stop',        hydro:  0,   charge:  0, color: '#111827' },
    X: { code1: 'X', code3: 'Xaa', name: 'Unknown',        category: 'unknown',     hydro:  0,   charge:  0, color: '#6b7280' }
  };

  // ---------------------------------------------------------------------------
  // The 64 mRNA codons (U replaces T).
  // ---------------------------------------------------------------------------
  var CODON_TABLE = {
    // U
    UUU: 'F', UUC: 'F', UUA: 'L', UUG: 'L',
    UCU: 'S', UCC: 'S', UCA: 'S', UCG: 'S',
    UAU: 'Y', UAC: 'Y', UAA: '*', UAG: '*',
    UGU: 'C', UGC: 'C', UGA: '*', UGG: 'W',
    // C
    CUU: 'L', CUC: 'L', CUA: 'L', CUG: 'L',
    CCU: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
    CAU: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
    CGU: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
    // A
    AUU: 'I', AUC: 'I', AUA: 'I', AUG: 'M',
    ACU: 'T', ACC: 'T', ACA: 'T', ACG: 'T',
    AAU: 'N', AAC: 'N', AAA: 'K', AAG: 'K',
    AGU: 'S', AGC: 'S', AGA: 'R', AGG: 'R',
    // G
    GUU: 'V', GUC: 'V', GUA: 'V', GUG: 'V',
    GCU: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
    GAU: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
    GGU: 'G', GGC: 'G', GGA: 'G', GGG: 'G'
  };

  // DNA-flavoured table (T instead of U).
  var DNA_CODON_TABLE = {};
  Object.keys(CODON_TABLE).forEach(function (codon) {
    DNA_CODON_TABLE[codon.replace(/U/g, 'T')] = CODON_TABLE[codon];
  });

  var START_CODON = 'AUG';
  var STOP_CODONS = ['UAA', 'UAG', 'UGA'];

  // Nucleotide display metadata (shared by every visualisation).
  var BASES = {
    A: { color: '#f87171', name: 'Adenine',  kind: 'purine' },
    U: { color: '#fbbf24', name: 'Uracil',   kind: 'pyrimidine' },
    T: { color: '#f59e0b', name: 'Thymine',  kind: 'pyrimidine' },
    C: { color: '#60a5fa', name: 'Cytosine', kind: 'pyrimidine' },
    G: { color: '#4ade80', name: 'Guanine',  kind: 'purine' }
  };

  var CATEGORY_LABELS = {
    hydrophobic: 'Hydrophobic',
    polar: 'Hydrophilic (polar)',
    positive: 'Positively charged',
    negative: 'Negatively charged',
    stop: 'Stop signal',
    unknown: 'Unknown'
  };

  return {
    AMINO_ACIDS: AMINO_ACIDS,
    CODON_TABLE: CODON_TABLE,
    DNA_CODON_TABLE: DNA_CODON_TABLE,
    START_CODON: START_CODON,
    STOP_CODONS: STOP_CODONS,
    BASES: BASES,
    CATEGORY_LABELS: CATEGORY_LABELS
  };
});
