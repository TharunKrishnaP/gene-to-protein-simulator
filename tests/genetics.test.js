/*
 * Phase 1 tests - run with:  node --test
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const codons = require('../src/data/codons.js');
const genetics = require('../src/core/genetics.js');
const recipes = require('../src/data/recipes.js');

test('codon table contains all 64 mRNA codons', () => {
  assert.equal(Object.keys(codons.CODON_TABLE).length, 64);
  // Every codon is 3 letters drawn from the RNA alphabet.
  for (const codon of Object.keys(codons.CODON_TABLE)) {
    assert.match(codon, /^[ACGU]{3}$/);
  }
});

test('amino-acid degeneracy matches the standard genetic code', () => {
  const counts = {};
  for (const aa of Object.values(codons.CODON_TABLE)) counts[aa] = (counts[aa] || 0) + 1;
  assert.equal(counts.L, 6); // Leu
  assert.equal(counts.S, 6); // Ser
  assert.equal(counts.R, 6); // Arg
  for (const aa of ['A', 'G', 'P', 'T', 'V']) assert.equal(counts[aa], 4);
  for (const aa of ['I', '*']) assert.equal(counts[aa], 3);
  for (const aa of ['M', 'W']) assert.equal(counts[aa], 1);
});

test('AUG is the start/methionine codon and the three STOP codons are correct', () => {
  assert.equal(codons.CODON_TABLE.AUG, 'M');
  assert.equal(codons.START_CODON, 'AUG');
  for (const stop of ['UAA', 'UAG', 'UGA']) assert.equal(codons.CODON_TABLE[stop], '*');
  assert.deepEqual(codons.STOP_CODONS, ['UAA', 'UAG', 'UGA']);
});

test('DNA codon table mirrors the RNA table with T instead of U', () => {
  assert.equal(codons.DNA_CODON_TABLE.ATG, 'M');
  assert.equal(codons.DNA_CODON_TABLE.TAA, '*');
  assert.equal(Object.keys(codons.DNA_CODON_TABLE).length, 64);
});

test('transcription converts T to U and cleans the input', () => {
  assert.equal(genetics.toMRNA('atg cgt tga'), 'AUGCGUUGA');
  assert.equal(genetics.transcribe('ATGCGT'), 'AUGCGU');
  assert.equal(genetics.clean('5-atg-cgt!'), 'ATGCGT');
});

test('splitCodons groups in triplets and reports the remainder', () => {
  const { codons: list, remainder } = genetics.splitCodons('ATGGCTAA');
  assert.deepEqual(list, ['ATG', 'GCT']);
  assert.equal(remainder, 'AA');
});

test('translation reads triplets and stops at the first STOP codon', () => {
  const p = genetics.translate('ATGGCTTAA');
  assert.equal(p.mrna, 'AUGGCUUAA');
  assert.deepEqual(p.codons, ['AUG', 'GCU', 'UAA']);
  assert.equal(p.fullSequence, 'MA');
  assert.equal(p.length, 2);
  assert.equal(p.stop.index, 2);
  assert.equal(p.stop.codon, 'UAA');
  assert.equal(p.complete, true);
  assert.equal(p.startFound, true);
  assert.equal(p.residues[0].isStart, true);
  assert.equal(p.residues[1].code3, 'Ala');
});

test('translation reports an incomplete strand with no stop', () => {
  const p = genetics.translate('ATGGCT'); // no stop codon
  assert.equal(p.complete, false);
  assert.equal(p.fullSequence, 'MA');
});

test('silent mutation: same amino-acid sequence, same dish', () => {
  // GCT (Ala) -> GCC (Ala)
  const res = genetics.analyzeMutation('ATGGCTTAA', 5, 'C');
  assert.equal(res.mutantSeq, 'ATGGCCTAA');
  assert.equal(res.wildType.fullSequence, res.mutant.fullSequence);
  assert.equal(res.type, 'silent');
  assert.equal(res.changed.length, 0);
});

test('missense mutation: a swapped ingredient changes the chain', () => {
  // GCT (Ala) -> CCT (Pro)
  const res = genetics.analyzeMutation('ATGGCTTAA', 3, 'C');
  assert.equal(res.wildType.fullSequence, 'MA');
  assert.equal(res.mutant.fullSequence, 'MP');
  assert.equal(res.type, 'missense');
  assert.equal(res.changed[0].from, 'A');
  assert.equal(res.changed[0].to, 'P');
});

test('nonsense mutation: a premature STOP truncates the dish', () => {
  // TAT (Tyr) -> TAA (Stop)
  const res = genetics.analyzeMutation('ATGTATTAA', 5, 'A');
  assert.equal(res.wildType.fullSequence, 'MY');
  assert.equal(res.mutant.fullSequence, 'M');
  assert.equal(res.mutant.stop.index, 1);
  assert.equal(res.type, 'nonsense');
});

test('start-loss mutation destroys the AUG start signal', () => {
  // ATG -> ATA (Ile, not a start)
  const res = genetics.analyzeMutation('ATGGCTTAA', 2, 'A');
  assert.equal(res.type, 'start-loss');
  assert.equal(res.mutant.startFound, false);
});

test('stop-loss mutation removes the STOP signal', () => {
  // TAA (Stop) -> TAT (Tyr), so translation runs off the end
  const res = genetics.analyzeMutation('ATGGCTTAA', 8, 'T');
  assert.equal(res.wildType.complete, true);
  assert.equal(res.mutant.complete, false);
  assert.equal(res.mutant.fullSequence, 'MAY');
  assert.equal(res.type, 'stop-loss');
});

test('mutateBase preserves the strand alphabet and validates input', () => {
  // DNA in -> DNA out (U becomes T)
  assert.equal(genetics.mutateBase('ATGGCTTAA', 0, 'U'), 'TTGGCTTAA');
  // RNA in -> RNA out (T becomes U)
  assert.equal(genetics.mutateBase('AUGGCUUAA', 0, 'T'), 'UUGGCUUAA');
  assert.throws(() => genetics.mutateBase('ATGGCTTAA', 99, 'A'), RangeError);
  assert.throws(() => genetics.mutateBase('ATGGCTTAA', 0, 'Z'), TypeError);
});

test('every recipe reverse-translates into a valid protein', () => {
  for (const recipe of recipes.allRecipes()) {
    assert.ok(recipe.dna, recipe.id + ' has DNA');
    assert.equal(recipe.dna.slice(0, 3), 'ATG', recipe.id + ' starts with ATG');
    const protein = genetics.translate(recipe.dna);
    assert.equal(protein.fullSequence, recipe.protein, recipe.id + ' round-trips');
    assert.equal(protein.complete, true, recipe.id + ' ends with a STOP');
    assert.equal(protein.startFound, true, recipe.id + ' has a start codon');
  }
});

test('reverseTranslate maps each amino acid to a codon and appends STOP', () => {
  assert.equal(recipes.reverseTranslate('M'), 'ATGTAA');
  assert.equal(recipes.reverseTranslate('MA*'), 'ATGGCTTAA');
});

test('findMutationForClass returns a verified mutation for every class', () => {
  const seq = recipes.getRecipe('hemoglobin').dna;
  for (const type of ['silent', 'missense', 'nonsense', 'start-loss', 'stop-loss']) {
    const pick = genetics.findMutationForClass(seq, type, () => 0.3);
    assert.ok(pick, type + ' should have a candidate');
    assert.ok(pick.position >= 0 && pick.position < seq.length, type + ' position in range');
    assert.equal(genetics.analyzeMutation(seq, pick.position, pick.base).type, type, type + ' is verified');
  }
});

test('findMutationForClass random always changes the protein, and reports impossibility', () => {
  const pick = genetics.findMutationForClass('ATGGCTTAA', 'random', () => 0.5);
  assert.ok(pick);
  const changed = genetics.mutateBase('ATGGCTTAA', pick.position, pick.base);
  assert.notEqual(changed, 'ATGGCTTAA');
  // A single ATG codon can never be mutated into a STOP.
  assert.equal(genetics.findMutationForClass('ATG', 'nonsense'), null);
});

test('the recipe book has a healthy spread of recipes and cuisines', () => {
  const all = recipes.allRecipes();
  assert.ok(all.length >= 12, 'at least a dozen recipes');
  const cuisines = new Set(all.map((r) => r.cuisine));
  assert.ok(cuisines.size >= 6, 'several cuisines for filtering');
  const ids = new Set(all.map((r) => r.id));
  assert.equal(ids.size, all.length, 'recipe ids are unique');
});

test('analyzeEdits matches analyzeMutation for a single edit', () => {
  const stacked = genetics.analyzeEdits('ATGGCTTAA', [{ position: 3, base: 'C' }]);
  const direct = genetics.analyzeMutation('ATGGCTTAA', 3, 'C');
  assert.equal(stacked.type, direct.type);
  assert.equal(stacked.mutantSeq, direct.mutantSeq);
  assert.equal(stacked.multi, false);
  assert.equal(stacked.editCount, 1);
});

test('analyzeEdits stacks multiple edits and classifies the combined result', () => {
  // pos5 T->A is silent (GCT->GCA, both Ala); pos8 A->T removes the STOP.
  const res = genetics.analyzeEdits('ATGGCTTAA', [
    { position: 8, base: 'T' },
    { position: 5, base: 'A' }
  ]);
  assert.equal(res.multi, true);
  assert.equal(res.editCount, 2);
  assert.equal(res.mutantSeq, 'ATGGCATAT');
  assert.equal(res.mutant.fullSequence, 'MAY');
  assert.equal(res.type, 'stop-loss');
  const identity = genetics.proteinIdentity(res.wildType, res.mutant);
  assert.ok(identity > 0.6 && identity < 0.7, 'two of three residues match, got ' + identity);
});

test('analyzeEdits returns null when there is nothing to apply', () => {
  assert.equal(genetics.analyzeEdits('ATGGCTTAA', []), null);
  assert.equal(genetics.analyzeEdits('ATGGCTTAA', undefined), null);
});

test('mutationImpact: silent is 0 and a premature STOP outranks a missense', () => {
  const silent = genetics.analyzeMutation('ATGGCTTAA', 5, 'A');
  assert.equal(genetics.mutationImpact(silent.wildType, silent.mutant, silent.changed), 0);

  const missense = genetics.analyzeMutation('ATGGCTTAA', 3, 'C'); // Ala -> Pro
  const m = genetics.mutationImpact(missense.wildType, missense.mutant, missense.changed);

  const nonsense = genetics.analyzeMutation('ATGTATTAA', 5, 'A'); // Tyr -> STOP
  const n = genetics.mutationImpact(nonsense.wildType, nonsense.mutant, nonsense.changed);

  assert.ok(n > m, 'nonsense (' + n + ') should outrank missense (' + m + ')');
  assert.ok(n >= 55, 'a premature STOP is severe, got ' + n);
});

test('proteinIdentity is 1 for identical chains and lower when residues differ', () => {
  const wt = genetics.translate('ATGGCTTAA');      // M A
  const same = genetics.translate('ATGGCCTAA');    // M A (silent)
  assert.equal(genetics.proteinIdentity(wt, same), 1);
  const diff = genetics.translate('ATGTATTAA');    // M Y
  assert.equal(genetics.proteinIdentity(wt, diff), 0.5);
});
