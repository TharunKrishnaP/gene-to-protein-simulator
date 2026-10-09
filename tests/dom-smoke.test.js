/*
 * DOM smoke test - no browser required.
 *
 * Loads the real browser scripts into a tiny fake DOM + Canvas 2D context,
 * boots the app, then drives the UI (recipe load, kitchen step, apply a
 * mutation) to catch runtime errors that pure-logic tests cannot.
 *
 * Run with:  node --test
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function makeClassList() {
  const set = new Set();
  return {
    add(...c) { c.forEach((x) => set.add(x)); },
    remove(...c) { c.forEach((x) => set.delete(x)); },
    contains(c) { return set.has(c); },
    toggle(c, force) {
      const on = force === undefined ? !set.has(c) : !!force;
      if (on) set.add(c); else set.delete(c);
      return on;
    }
  };
}

function makeCtx() {
  const target = {
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    measureText() { return { width: 10 }; }
  };
  return new Proxy(target, {
    get(t, p) { return p in t ? t[p] : function () {}; },
    set(t, p, v) { t[p] = v; return true; }
  });
}

class FakeElement {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.classList = makeClassList();
    this.listeners = {};
    this._text = '';
    this._html = '';
    this.width = 0;
    this.height = 0;
    this.checked = false;
    this.value = '4';
    this.parentNode = null;
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this._html = ''; this.children = []; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this._text = ''; this.children = []; }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener() {}
  setAttribute(k, v) { this[k] = v; }
  getAttribute(k) { return this[k]; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { width: 900, height: 340, left: 0, top: 0, right: 900, bottom: 340 }; }
  getContext() { if (!this._ctx) this._ctx = makeCtx(); return this._ctx; }
  focus() {}
  click() { (this.listeners.click || []).forEach((fn) => fn({ currentTarget: this, target: this })); }
}

function setupDom() {
  const byId = new Map();
  const documentStub = {
    readyState: 'complete',
    createElement(tag) { return new FakeElement(tag); },
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, new FakeElement('div'));
      return byId.get(id);
    },
    querySelector() { return null; },
    addEventListener() {},
    removeEventListener() {}
  };

  // Mirror the static preset buttons that JS reads straight from index.html.
  const presets = documentStub.getElementById('mutationPresets');
  ['silent', 'missense', 'nonsense', 'start-loss', 'stop-loss', 'random'].forEach((p) => {
    const btn = new FakeElement('button');
    btn.dataset.preset = p;
    btn.textContent = p;
    presets.appendChild(btn);
  });

  const rafQueue = [];
  let rafId = 0;

  const windowStub = {
    document: documentStub,
    devicePixelRatio: 1,
    requestAnimationFrame(cb) { rafQueue.push(cb); return ++rafId; },
    cancelAnimationFrame() {}
  };
  // The modules attach to globalThis, so make window === globalThis.
  globalThis.window = globalThis;
  globalThis.document = documentStub;
  globalThis.devicePixelRatio = 1;
  globalThis.requestAnimationFrame = windowStub.requestAnimationFrame;
  globalThis.cancelAnimationFrame = windowStub.cancelAnimationFrame;

  return {
    byId,
    document: documentStub,
    drain(frames) {
      for (let i = 0; i < frames; i++) {
        const batch = rafQueue.splice(0, rafQueue.length);
        const ts = 1000 + i * 16;
        batch.forEach((cb) => cb(ts));
      }
    }
  };
}

test('browser app boots, renders and handles a mutation without errors', () => {
  const dom = setupDom();

  const files = [
    'src/data/codons.js',
    'src/core/genetics.js',
    'src/data/recipes.js',
    'src/fold/folding.js',
    'src/ui/draw.js',
    'src/ui/kitchen.js',
    'src/ui/plate.js',
    'src/ui/mutation.js',
    'src/app.js' // boots the app on load
  ];
  for (const file of files) {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInThisContext(code, { filename: file });
  }

  const GTP = globalThis.GTP;
  assert.ok(GTP, 'GTP namespace exists');
  for (const mod of ['codons', 'genetics', 'recipes', 'folding', 'draw', 'KitchenView', 'PlateView', 'MutationSandbox']) {
    assert.ok(GTP[mod], 'module GTP.' + mod + ' loaded');
  }

  // Render a few animation frames.
  dom.drain(4);

  const recipeList = dom.byId.get('recipeList');
  assert.equal(recipeList.children.length, 70, 'all recipes listed');
  assert.ok(dom.byId.get('recipeFilters').children.length >= 7, 'recipe filters built');

  const dish = dom.byId.get('kitchenDish');
  assert.match(dish.textContent, /Insulin/, 'first recipe auto-loaded');

  const readout = dom.byId.get('sequenceReadout');
  assert.ok(readout.children.length > 0, 'sequence readout populated');

  const mutationStrand = dom.byId.get('mutationStrand');
  assert.ok(mutationStrand.children.length > 0, 'mutation strand populated');

  // Edit a base directly: click base 0, then pick G (AUG -> GUG, start-loss).
  mutationStrand.children[0].click();
  assert.ok(!dom.byId.get('mutationPicker').classList.contains('hidden'), 'picker opened on select');
  const palette = dom.byId.get('mutationPalette');
  palette.children[3].click(); // G — applies immediately
  dom.drain(3);

  const result = dom.byId.get('mutationResult');
  assert.match(result.innerHTML, /badge/, 'mutation verdict rendered');
  assert.ok(dom.byId.get('diffView').innerHTML.length > 0, 'protein diff rendered');
  assert.doesNotMatch(dom.byId.get('mutLabel').textContent, /waiting/, 'mutant fold shown after apply');
  assert.equal(dom.byId.get('mutationTray').children.length, 1, 'one pending edit chip');
  assert.notEqual(dom.byId.get('impactBar').style.width, '0%', 'impact meter filled');
  assert.ok(dom.byId.get('mutStats').innerHTML.length > 0, 'mutant stats rendered');

  // Stack a second edit at a different base.
  const tile = mutationStrand.children[3];
  const wtBase = tile.textContent.toUpperCase().replace('T', 'U');
  let pickIdx = 0;
  for (let i = 0; i < palette.children.length; i++) {
    if (palette.children[i].dataset.base !== wtBase) { pickIdx = i; break; }
  }
  tile.click();
  palette.children[pickIdx].click();
  dom.drain(2);
  assert.equal(dom.byId.get('mutationTray').children.length, 2, 'two stacked edit chips');

  // Undo removes the most recent edit.
  dom.byId.get('btn-undo-mutation').click();
  dom.drain(1);
  assert.equal(dom.byId.get('mutationTray').children.length, 1, 'undo drops a chip');

  // Mutagenize burst adds several random edits at once.
  dom.byId.get('btn-mutagenize').click();
  dom.drain(1);
  assert.ok(dom.byId.get('mutationTray').children.length >= 2, 'mutagenize stacks edits');
  assert.match(dom.byId.get('mutationResult').innerHTML, /badge/, 'combined verdict rendered');

  // Insert the edit(s) into the gene and confirm they propagate.
  dom.byId.get('btn-commit-mutation').click();
  dom.drain(4);
  assert.match(dish.textContent, /mutated/, 'committed mutation updates the dish');
  assert.match(dom.byId.get('mutLabel').textContent, /inserted/, 'inserted mutant image stays visible');

  // One-click preset mutation still works after the commit.
  const presets = dom.byId.get('mutationPresets');
  assert.ok(presets.children.length >= 5, 'preset buttons present');
  presets.children[0].click();
  dom.drain(3);
  assert.match(dom.byId.get('mutationResult').innerHTML, /badge/, 'preset mutation rendered');
  assert.equal(dom.byId.get('mutationTray').children.length, 1, 'preset adds a chip');

  // Clearing edits empties the tray.
  dom.byId.get('btn-reset-mutation').click();
  dom.drain(1);
  assert.equal(dom.byId.get('mutationTray').children.length, 0, 'clear empties the tray');

  // Drive the kitchen a step and re-render.
  dom.byId.get('btn-kstep').click();
  dom.drain(3);

  // Load a different recipe via a card click.
  recipeList.children[2].click();
  dom.drain(4);
  assert.match(dish.textContent, /Collagen/, 'clicking a recipe card loads it');
});
