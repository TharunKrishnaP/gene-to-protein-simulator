# 🧬 Gene-to-Protein Kitchen

An interactive **Gene-to-Protein cooking simulator**. The ribosome is an automated
kitchen appliance: it reads an mRNA recipe three bases at a time and snaps coloured
amino-acid beads onto a growing chain, which then folds into a 3D "dish".

Built with **vanilla JavaScript + Canvas 2D**, with **zero dependencies** and **no
build step**. It runs offline by double-clicking `index.html` (or serve it locally).

---

## Quick start

Just open `index.html` in a browser. That's it.

Optionally, serve it over HTTP (handy on some browsers / for the dev console):

```bash
node server.js
# -> http://localhost:3000
```

Run the test suite (Node's built-in runner, no installs):

```bash
node --test
```

---

## The four phases (and where they live)

### Phase 1 — Core logic & codon lookup engine
> Data modelling with no UI dependencies.

| File | What it does |
| --- | --- |
| `src/data/codons.js` | Maps all **64 mRNA codons** to their amino acids and STOP signals, plus amino-acid chemistry (charge, Kyte–Doolittle hydropathy, colour). |
| `src/core/genetics.js` | `transcribe()` (T→U), `splitCodons()`, `translate()`, and the mutation engine (`mutateBase`, `classifyMutation`, `analyzeMutation`, plus multi-edit `analyzeEdits`, `proteinIdentity` and `mutationImpact`). |
| `src/data/recipes.js` | The **Recipe Book** — **70 dishes across 13 cuisines** (Metabolic, Oxygen delivery, Oxygen storage, Transport, Structural, Signalling, Defence, Enzymes, Misfolding, Food, Dessert, Bioluminescence, Toxins), each reverse-translated into valid coding DNA. Filter the list by cuisine. |
| `tests/genetics.test.js` | Verifies the 64 codons, degeneracy, start/stop, translation, all mutation classes and recipe round-trips. |

### Phase 2 — Cooking interface & visual assembly
> The interactive UI.

| File | What it does |
| --- | --- |
| `index.html` / `styles/main.css` | Layout: Recipe Book, Prep Counter, Ribosome Kitchen, Plate, Mutation Sandbox. |
| `src/ui/kitchen.js` | The animated **Ribosome Chef** that steps along the mRNA 3 bases at a time and pops out amino-acid beads onto a growing chain (Play / Step / Reset / Speed). |
| `src/ui/draw.js` | Shared Canvas 2D helpers (spheres, base tiles, rounded rects, colour maths). |
| `src/app.js` | Wires the prep counter + recipe book to the kitchen, plate and sandbox. |

### Phase 3 — Simplified 3D folding physics
> Visual feedback for molecular interactions.

| File | What it does |
| --- | --- |
| `src/fold/folding.js` | A deterministic 3D bead-chain simulator: backbone springs, excluded volume, **hydrophobic collapse**, solvation and **charge attraction/repulsion**, plus a perspective projection. |
| `src/ui/plate.js` | Renders the chain on a Canvas 2D "plate" with depth-sorted, shaded spheres and an auto-rotating camera. |
| `tests/folding.test.js` | Proves hydrophobic chains collapse, opposite charges attract, like charges repel, bonds stay bounded, and folds are deterministic. |

### Phase 4 — Mutation sandbox & error simulation
> Interactive biology experimentation.

| File | What it does |
| --- | --- |
| `src/ui/mutation.js` | A mutation **workbench**. Click any base to open an inline **A/U/C/G picker** and preview the change instantly; **stack as many edits as you like** (each shows in a pending-edit tray and is badged on the strand). Use the **Quick mutations** buttons (silent / missense / nonsense / start-loss / stop-loss / random), the **☢️ Mutagenize** burst, or the keyboard (`← →` move, `Shift+←/→` jump a codon, `A/U/C/G` mutate, `Delete` revert, `Enter` insert, `Z` undo, `R` random). Watch the combined verdict, the protein diff, per-residue tooltips, the **impact meter** and **side-by-side folds with per-protein stats**, then **Insert into gene** to commit the whole stack — the before/after comparison stays on screen. |

**Every mutation is auto-classified:** silent (same dish), missense (altered folding), nonsense (premature STOP → truncated dish), or the start-loss / stop-loss edge cases. The preset buttons are backed by `genetics.findMutationForClass()`, which re-checks each candidate with the real classifier so a button always demonstrates its label. Stacked edits are combined by `genetics.analyzeEdits()`, and the 0–100 disruption score comes from `genetics.mutationImpact()`.

---

## Project structure

```
.
├── index.html              # the whole app
├── server.js               # optional zero-dependency static server
├── styles/main.css
├── src/
│   ├── data/
│   │   ├── codons.js       # Phase 1 – genetic code + chemistry
│   │   └── recipes.js      # Phase 1 – recipe book
│   ├── core/
│   │   └── genetics.js     # Phase 1 – transcription / translation / mutation
│   ├── fold/
│   │   └── folding.js      # Phase 3 – folding physics + projection
│   ├── ui/
│   │   ├── draw.js         # Canvas helpers
│   │   ├── kitchen.js      # Phase 2 – ribosome chef
│   │   ├── plate.js        # Phase 3 – folding renderer
│   │   └── mutation.js     # Phase 4 – mutation sandbox
│   └── app.js              # controller
└── tests/
    ├── genetics.test.js
    └── folding.test.js
```

## How it fits together

```
DNA --transcribe--> mRNA --splitCodons--> codons --translate--> amino acids
                                                                     |
                                              folding physics (3D)   v
                                                            folded "dish"
```

Every source file is **dual-target**: loaded as a classic `<script>` it attaches to
`window.GTP`, and in Node it can be `require()`d so the pure logic is unit-testable
without a DOM.
