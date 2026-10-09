/*
 * Phase 1 - Recipe Book (genomic database)
 * ---------------------------------------------------------------------------
 * Each recipe is stored as its protein (amino-acid) sequence and reverse
 * translated into a valid coding DNA strand. Reverse translation guarantees
 * every recipe translates back to the intended dish.
 *
 * Dual-target (browser global + Node require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./codons.js'));
  } else {
    root.GTP = root.GTP || {};
    root.GTP.recipes = factory(root.GTP.codons);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (codons) {
  'use strict';

  // One canonical codon per amino acid (standard human-ish codon choices).
  var PREFERRED_CODONS = {
    A: 'GCT', R: 'CGT', N: 'AAT', D: 'GAT', C: 'TGT', Q: 'CAA', E: 'GAA',
    G: 'GGT', H: 'CAT', I: 'ATT', L: 'CTT', K: 'AAA', M: 'ATG', F: 'TTT',
    P: 'CCT', S: 'TCT', T: 'ACT', W: 'TGG', Y: 'TAT', V: 'GTT', '*': 'TAA'
  };

  // Codon -> amino acid (DNA alphabet) for quick lookups.
  function codonFor(aa) {
    var codon = PREFERRED_CODONS[aa];
    if (!codon) throw new Error('No preferred codon for "' + aa + '"');
    return codon;
  }

  /** Protein (one-letter) -> coding DNA (5'->3'), start + stop included. */
  function reverseTranslate(protein, map) {
    var table = map || PREFERRED_CODONS;
    var out = '';
    String(protein || '').toUpperCase().split('').forEach(function (aa) {
      if (aa === '*' || aa === ' ') return;
      var codon = table[aa];
      if (!codon) throw new Error('No preferred codon for "' + aa + '"');
      out += codon;
    });
    if (out.slice(-3) !== 'TAA' && out.slice(-3) !== 'TAG' && out.slice(-3) !== 'TGA') {
      out += 'TAA'; // give every recipe a clean STOP
    }
    return out;
  }

  var RECIPES = [
    {
      id: 'insulin',
      emoji: '\uD83E\uDE78', // 🩸
      name: 'Insulin (A chain)',
      cuisine: 'Metabolic',
      accent: '#f472b6',
      description: 'A tiny hormone that lets sugar into cells. Small, cysteine-rich and full of disulfide bonds.',
      protein: 'MGIVEQCCTSICSLYQLENYCN'
    },
    {
      id: 'hemoglobin',
      emoji: '\uD83E\uDE78', // 🩸
      name: 'Hemoglobin (β fragment)',
      cuisine: 'Oxygen delivery',
      accent: '#ef4444',
      description: 'The oxygen taxi of the blood. A long chain that cradles an iron-containing heme group.',
      protein: 'MVHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQ'
    },
    {
      id: 'collagen',
      emoji: '\uD83E\uDDB4', // 🦴
      name: 'Collagen (helix)',
      cuisine: 'Structural',
      accent: '#fbbf24',
      description: 'The body\'s scaffolding. Gly-Pro-Pro repeats twist into a triple helix — nature\'s braided rope.',
      protein: 'MGPPGPPGPPGPPGPPGPPGPPGPPGPPG'
    },
    {
      id: 'glucagon',
      emoji: '\u26A1', // ⚡
      name: 'Glucagon',
      cuisine: 'Metabolic',
      accent: '#f59e0b',
      description: 'Insulin\'s opposite number: it tells the liver to release glucose when you\'re hungry.',
      protein: 'MHSQGTFTSDYSKYLDSRRAQDFVQWLMNT'
    },
    {
      id: 'oxytocin',
      emoji: '\uD83D\uDC96', // 💖
      name: 'Oxytocin',
      cuisine: 'Signalling',
      accent: '#c084fc',
      description: 'A nine-amino-acid messenger with a ring — small enough to fold almost instantly.',
      protein: 'MCYIQNCPLG'
    },
    {
      id: 'melittin',
      emoji: '\uD83D\uDC1D', // 🐝
      name: 'Melittin (bee venom)',
      cuisine: 'Defence',
      accent: '#22d3ee',
      description: 'A membrane-busting peptide. Charged at one end, greasy at the other — a classic amphipathic fold.',
      protein: 'MGIGAVLKVLTTGLPALISWIKRKRQQ'
    },
    {
      id: 'myoglobin',
      emoji: '\uD83E\uDD69', // 🥩
      name: 'Myoglobin',
      cuisine: 'Oxygen storage',
      accent: '#dc2626',
      description: 'The muscle\'s oxygen reservoir — a globin cousin of hemoglobin that hoards oxygen for hard work.',
      protein: 'MGLSDGEWQLVLNVWGKVEADIPGHGQEVLIRLFKGHPETL'
    },
    {
      id: 'keratin',
      emoji: '\uD83D\uDC87', // 💇
      name: 'Keratin',
      cuisine: 'Structural',
      accent: '#a16207',
      description: 'Hair and nail building blocks — long coiled-coil ropes packed with serine, glycine and cysteine.',
      protein: 'MSRQSSVSFRSGGSRSFSTASAITPSVSRTSFTSVSRSGGGGGGGGFGRRRQ'
    },
    {
      id: 'spider-silk',
      emoji: '\uD83D\uDD78', // 🕸
      name: 'Spider silk (spidroin)',
      cuisine: 'Structural',
      accent: '#94a3b8',
      description: 'Stronger than steel by weight: repetitive glycine/alanine blocks stack into stiff beta-sheet crystals.',
      protein: 'MAAAAAAAAAGPGASGPGASGPGASGPGASGPGASGPGAS'
    },
    {
      id: 'amyloid-beta',
      emoji: '\uD83E\uDDE0', // 🧠
      name: 'Amyloid-β (Aβ42)',
      cuisine: 'Misfolding',
      accent: '#8b5cf6',
      description: 'The plaque-forming peptide of Alzheimer\'s — greasy and sticky, it would rather clump than fold cleanly.',
      protein: 'MDAEFRHDSGYEVHHQKLVFFAEDVGSNKGAIIGLMVGGVVIA'
    },
    {
      id: 'enkephalin',
      emoji: '\uD83D\uDC8A', // 💊
      name: 'Enkephalin',
      cuisine: 'Signalling',
      accent: '#f472b6',
      description: 'A five-amino-acid opioid peptide — a tiny neuromodulator your own body makes for pain relief.',
      protein: 'MYGGFM'
    },
    {
      id: 'thaumatin',
      emoji: '\uD83C\uDF6C', // 🍬
      name: 'Thaumatin (sweet protein)',
      cuisine: 'Dessert',
      accent: '#22d3ee',
      description: 'One of the sweetest proteins known — a natural sweetener thousands of times sweeter than sugar.',
      protein: 'MATFEVRNCSYTVWAAASKGDAALDAGGRQLNSGESWTINV'
    },

    // ------------------------------------------------ Metabolic & hormones
    {
      id: 'leptin', emoji: '🍔', name: 'Leptin', cuisine: 'Metabolic', accent: '#38bdf8',
      description: 'The satiety hormone — fat cells release it to tell your brain you are full.',
      protein: 'MVPIQKVQDDTKTLIKTIVTRINDISHTQSVSSKQKVTGLD'
    },
    {
      id: 'adiponectin', emoji: '🧈', name: 'Adiponectin', cuisine: 'Metabolic', accent: '#f59e0b',
      description: 'A fat-derived hormone that makes muscle burn fuel and keeps blood sugar in check.',
      protein: 'MLLGAVLLLWLGPGHDQETTTQGPGVLLPLPKGACTGWMAGIPG'
    },
    {
      id: 'erythropoietin', emoji: '🩸', name: 'Erythropoietin (EPO)', cuisine: 'Metabolic', accent: '#ef4444',
      description: 'The kidney\'s signal to build more red blood cells — the original blood-doping molecule.',
      protein: 'MGVHECPAWLWLLLSLLSLPLGLPVLGAPPRLICDSRVLERYLLEAKEAENITTGCAE'
    },
    {
      id: 'growth-hormone', emoji: '📏', name: 'Growth hormone', cuisine: 'Metabolic', accent: '#22c55e',
      description: 'A pituitary giant that tells bones and tissues to grow. One of the first drugs made by bacteria.',
      protein: 'MFPTIPLSRLFDNAMLRAHRLHQLAFDTYQEFEEAYIPKEQKYSFLQNPQTSLCFSESIPTPSNR'
    },
    {
      id: 'vasopressin', emoji: '💧', name: 'Vasopressin (ADH)', cuisine: 'Metabolic', accent: '#38bdf8',
      description: 'The water-saving hormone — a tiny ring peptide that tells the kidneys to hold onto water.',
      protein: 'MCYFQNCPRG'
    },
    {
      id: 'somatostatin', emoji: '🛑', name: 'Somatostatin', cuisine: 'Metabolic', accent: '#a78bfa',
      description: 'The universal "stop" signal that switches off many other hormones at once.',
      protein: 'MAGCKNFFWKTFTSC'
    },
    {
      id: 'calcitonin', emoji: '🦴', name: 'Calcitonin', cuisine: 'Metabolic', accent: '#fbbf24',
      description: 'A thyroid peptide that lowers blood calcium and slows bone breakdown.',
      protein: 'MCGNLSTCMLGTYTQDFNKFHTFPQTAIGVGAP'
    },
    {
      id: 'ghrelin', emoji: '🍽️', name: 'Ghrelin', cuisine: 'Metabolic', accent: '#f97316',
      description: 'The "hunger hormone" from the stomach — the lunch bell of your endocrine system.',
      protein: 'MGSSFLSPEHQRVQQRKESKKPPAKLQPR'
    },
    {
      id: 'amylin', emoji: '🍰', name: 'Amylin (IAPP)', cuisine: 'Metabolic', accent: '#f472b6',
      description: 'Co-released with insulin to slow digestion — and a misfolding troublemaker in diabetes.',
      protein: 'MKCNTATCATQRLANFLVHSSNNFGAILSSTNVGSNTY'
    },
    {
      id: 'c-peptide', emoji: '🔗', name: 'C-peptide', cuisine: 'Metabolic', accent: '#94a3b8',
      description: 'The connector snipped out of pro-insulin — a stable marker of how much insulin you make.',
      protein: 'MEAEDLQVGQVELGGGPGAGSLQPLALEGSLQ'
    },
    {
      id: 'cytochrome-c', emoji: '⚡', name: 'Cytochrome c', cuisine: 'Metabolic', accent: '#fbbf24',
      description: 'A heme protein that shuttles electrons in the power plants of the cell.',
      protein: 'MGDVEKGKKIFIMKCSQCHTVEKGGKHKTGPNLHGLFGRKTGQAPGYSYTAANKNKGIIWGEDTLMEYLENP'
    },

    // ------------------------------------------------ Oxygen & transport
    {
      id: 'neuroglobin', emoji: '🧠', name: 'Neuroglobin', cuisine: 'Oxygen storage', accent: '#dc2626',
      description: 'A globin in the brain that hoards oxygen for neurons — a close cousin of myoglobin.',
      protein: 'MERPEPELIRQSWRAVSRSPLEHGTVLFARLFALEPDLLPLFQYNCRQFS'
    },
    {
      id: 'cytoglobin', emoji: '🫁', name: 'Cytoglobin', cuisine: 'Oxygen storage', accent: '#ef4444',
      description: 'A widely spread globin that carries oxygen inside many tissues and helps handle stress.',
      protein: 'MEPKPHLIPHEVEQDESWFSLLPSLPAPAPGPGPGLPRPEPQPLGLALLALLLLPLPLLLLRAAGSQAVP'
    },
    {
      id: 'ferritin', emoji: '🧲', name: 'Ferritin', cuisine: 'Transport', accent: '#38bdf8',
      description: 'A hollow iron-storage ball — the body\'s safe deposit box for toxic iron atoms.',
      protein: 'MSSQIRQNYSTDVEAAVNSLVNLYLQASYTYLSLGFYFDRDDVA'
    },
    {
      id: 'transferrin', emoji: '🚚', name: 'Transferrin', cuisine: 'Transport', accent: '#22d3ee',
      description: 'The iron delivery van of the bloodstream, docking at cells that need the metal.',
      protein: 'MRLAVGALLVCAVLGLCLAVPDKTVRWCAVSEHEATKCQSFRDHM'
    },
    {
      id: 'serum-albumin', emoji: '🧫', name: 'Serum albumin', cuisine: 'Transport', accent: '#cbd5e1',
      description: 'The most abundant blood protein — a molecular taxi for hormones, drugs and fatty acids.',
      protein: 'MKWVTFISLLFLFSSAYSRGVFRRDAHKSEVAHRFKDLGEENFKALVLIA'
    },

    // ------------------------------------------------ Structural & muscle
    {
      id: 'actin', emoji: '💪', name: 'Actin', cuisine: 'Structural', accent: '#7dd3fc',
      description: 'The most abundant protein in most cells — it builds the cables that let cells move.',
      protein: 'MDDDIAALVVDNGSGMCKAGFAGDDAPRAVFPSIVGRPRHQGVMVGMGQKDSYVGDEAQSKRGILTLKYP'
    },
    {
      id: 'myosin', emoji: '🦵', name: 'Myosin', cuisine: 'Structural', accent: '#94a3b8',
      description: 'The molecular motor that grabs actin and yanks it — every muscle twitch starts here.',
      protein: 'MEEEMNFLNDLQAQLEAERQRLQELQERLAALEQARAQLQQLQAQLKEQRAQLQ'
    },
    {
      id: 'tubulin', emoji: '🧵', name: 'Tubulin', cuisine: 'Structural', accent: '#a78bfa',
      description: 'Bricks that snap together into microtubules — the cell\'s highways and skeleton.',
      protein: 'MREIVHIQAGQCGNQIGAKFWEVISDEHGIDPTGTYHGDSDLQLDRISVYYNEATGGKYVPR'
    },
    {
      id: 'elastin', emoji: '🪢', name: 'Elastin', cuisine: 'Structural', accent: '#fbbf24',
      description: 'The rubber band of your body — stretchy repeats that let skin and lungs snap back.',
      protein: 'MAGLTAAAPRPGVLLLLLSILHPGQVPGVGVPGVGVPGVGVPGVGVPGVGVPGVGVPGVG'
    },
    {
      id: 'fibroin', emoji: '🐛', name: 'Fibroin (silkworm silk)', cuisine: 'Structural', accent: '#e5e7eb',
      description: 'The silk a silkworm spins — Gly-Ala repeats that stack into tough beta-sheet crystals.',
      protein: 'MSASAGSGAGAGAGSGAGAGSGAGAGSGAGAGSGAGAGSGAGAGSGAGAGSGAGAGSGAG'
    },
    {
      id: 'fibrin', emoji: '🩹', name: 'Fibrin', cuisine: 'Structural', accent: '#f87171',
      description: 'The protein mesh that forms a scab — it self-assembles into a clot when you bleed.',
      protein: 'MFSMRIVCLVLSVVGTAWTADSGEGDFLAEGGGVRGPRVVERHQ'
    },
    {
      id: 'titin', emoji: '🫀', name: 'Titin', cuisine: 'Structural', accent: '#f43f5e',
      description: 'The largest protein in the human body, a spring inside every muscle sarcomere.',
      protein: 'MTTQAPTFTQPLQSVVVRPELSPTKFAQDLEVKKSFYSKHFNQLQSTKEL'
    },
    {
      id: 'lamin', emoji: '🧬', name: 'Lamin', cuisine: 'Structural', accent: '#8b5cf6',
      description: 'A fibrous net just inside the nucleus that keeps your genome neatly packed.',
      protein: 'MEMGTSQPARATRSGAQASSTPLSPTRITRLQEKEDLQELNDRLAVYIDKVRSLETENSALQLQVTER'
    },

    // ------------------------------------------------ Defence & immunity
    {
      id: 'lysozyme', emoji: '🥚', name: 'Lysozyme', cuisine: 'Defence', accent: '#fef08a',
      description: 'The enzyme in tears and egg white that chews holes in bacterial walls.',
      protein: 'MKALIVLGLVLLSVTVQGKVFERCELARTLKRLGMDGYRGISLANWMCLAKW'
    },
    {
      id: 'defensin', emoji: '🛡️', name: 'Defensin (HNP-1)', cuisine: 'Defence', accent: '#34d399',
      description: 'A tiny, disulfide-armoured antibiotic peptide that punctures microbial membranes.',
      protein: 'MRTLAILAAILLVALQAQAACYCRIPACIAGERRYGTCIYQGRLWAFCC'
    },
    {
      id: 'll37', emoji: '⚔️', name: 'LL-37 (cathelicidin)', cuisine: 'Defence', accent: '#22c55e',
      description: 'A positively charged human antibiotic peptide — soap for the immune system.',
      protein: 'MLLGDFFRKSKEKIGKEFKRIVQRIKDFLRNLVPRTES'
    },
    {
      id: 'lactoferrin', emoji: '🥛', name: 'Lactoferrin', cuisine: 'Defence', accent: '#bfdbfe',
      description: 'An iron-sequestering protein in milk and tears that starves invading bacteria.',
      protein: 'MKLIPLVLLFALGALGLCLAAPRKNVRWCTISQPEWFKCRRWQWRMKKLG'
    },
    {
      id: 'interferon-alpha', emoji: '📡', name: 'Interferon-α', cuisine: 'Defence', accent: '#60a5fa',
      description: 'The cell\'s alarm call that tells neighbours to raise antiviral shields.',
      protein: 'MALTFALLVALLVLSCKSSCSVGCDLPQTHSLGSRRTLMLLAQMRKISLFSCLKDRHDFGFPQEEFGNQFQKAE'
    },
    {
      id: 'interleukin-2', emoji: '📣', name: 'Interleukin-2', cuisine: 'Defence', accent: '#f472b6',
      description: 'A growth signal that rallies T-cells to multiply and fight.',
      protein: 'MYRMQLLSCIALSLALVTNSAPTSSSTKKTQLQLEHLLLDLQMILNGINNYKNPKLTRMLTFKFY'
    },
    {
      id: 'tnf-alpha', emoji: '🔥', name: 'TNF-α', cuisine: 'Defence', accent: '#f97316',
      description: 'A double-edged inflammatory signal — great against germs, bad in excess.',
      protein: 'MSTESMIRDVELAEEALPKKTGGPQGSRRCLFLSLFSFLIVAGATTLFCLLHFGVIGPQREEFPRDLSLISPLAQAVRSS'
    },

    // ------------------------------------------------ Signalling & neuropeptides
    {
      id: 'substance-p', emoji: '⚡', name: 'Substance P', cuisine: 'Signalling', accent: '#c084fc',
      description: 'An eleven-amino-acid messenger of pain signals and inflammation.',
      protein: 'MRPKPQQFFGLM'
    },
    {
      id: 'beta-endorphin', emoji: '😌', name: 'β-endorphin', cuisine: 'Signalling', accent: '#a78bfa',
      description: 'Your built-in painkiller — the "runner\'s high" peptide.',
      protein: 'MYGGFMTSEKSQTPLVTLFKNAIIKNAYKKGE'
    },
    {
      id: 'dynorphin', emoji: '💫', name: 'Dynorphin', cuisine: 'Signalling', accent: '#8b5cf6',
      description: 'A potent natural opioid that tunes mood, stress and pain.',
      protein: 'MYGGFLRRIRPKLKWDNQKRYGGFLRRQFKVVT'
    },
    {
      id: 'neuropeptide-y', emoji: '🍕', name: 'Neuropeptide Y', cuisine: 'Signalling', accent: '#f59e0b',
      description: 'A 36-amino-acid brain peptide that turns up appetite and calms anxiety.',
      protein: 'MYPSKPDNPGEDAPAEDMARYYSALRHYINLITRQRY'
    },
    {
      id: 'bradykinin', emoji: '💥', name: 'Bradykinin', cuisine: 'Signalling', accent: '#ef4444',
      description: 'A nine-amino-acid peptide that widens blood vessels and makes bee stings hurt.',
      protein: 'MRPPGFSPFR'
    },
    {
      id: 'orexin', emoji: '☕', name: 'Orexin', cuisine: 'Signalling', accent: '#22d3ee',
      description: 'The wakefulness peptide — lose your orexin cells and you get narcolepsy.',
      protein: 'MNLPSTKVSWAAVTLLLLLLLLPPALLSSGAAAQPLPDCCRQKTCSCRLYELLHGAG'
    },
    {
      id: 'cgrp', emoji: '🤕', name: 'CGRP', cuisine: 'Signalling', accent: '#fb7185',
      description: 'A headache peptide — the target of the new migraine-blocking drugs.',
      protein: 'MACDTATCVTHRLAGLLSRSGGVVKNNFVPTNVGSKAF'
    },
    {
      id: 'vip', emoji: '🎫', name: 'VIP', cuisine: 'Signalling', accent: '#38bdf8',
      description: 'Vasoactive intestinal peptide — a nervous-system messenger that relaxes smooth muscle.',
      protein: 'MHSDAVFTDNYTRLRKQMAVKKYLNSILN'
    },

    // ------------------------------------------------ Enzymes & catalysts
    {
      id: 'trypsin', emoji: '✂️', name: 'Trypsin', cuisine: 'Enzymes', accent: '#f59e0b',
      description: 'A digestive scissors that snips proteins at lysine and arginine.',
      protein: 'MNPLLILTFVAAALAAPFDDDDKIVGGYNCEENSVPYQVSLNSGYHFCGGSLINEQWVVSAGHCYKSRIQVRLGEH'
    },
    {
      id: 'pepsin', emoji: '🍳', name: 'Pepsin', cuisine: 'Enzymes', accent: '#f97316',
      description: 'The stomach\'s acid-powered protein shredder.',
      protein: 'MKWLLLLGLVALSECIMYKVPLIRKKSLRRTLSERGLLKDFLKKHNLNPARKYFPQWEAPTLVDEQPLENY'
    },
    {
      id: 'catalase', emoji: '🧼', name: 'Catalase', cuisine: 'Enzymes', accent: '#34d399',
      description: 'A peroxide-busting enzyme — the bubbles in a hydrogen-peroxide wound.',
      protein: 'MADSRDPASDQMQHWKEQRAAQKADVLTTGAGNPVGDKLNVITVGPRGPLLVQDVVFTDEMAHFDRERIPERVVHAK'
    },
    {
      id: 'sod1', emoji: '🦸', name: 'Superoxide dismutase (SOD1)', cuisine: 'Enzymes', accent: '#22d3ee',
      description: 'A copper-zinc antioxidant that defuses dangerous superoxide radicals.',
      protein: 'MATKAVCVLKGDGPVQGIINFEQKESNGPVKVWGSIKGLTEGLHGFHVHEFGDNTAGCTSAGPHFNPLSRKHGGPKDEERH'
    },
    {
      id: 'rubisco', emoji: '🌿', name: 'Rubisco', cuisine: 'Enzymes', accent: '#22c55e',
      description: 'The most abundant enzyme on Earth — it fixes carbon dioxide into sugar.',
      protein: 'MSPQTETKASVGFKAGVKEYKLTYYTPEYETKDTDILAAFRVTPQPGVPPEEAGAAVAAESSTGTWTTVWTDGLTSLDRYKGRCY'
    },
    {
      id: 'carbonic-anhydrase', emoji: '🫧', name: 'Carbonic anhydrase', cuisine: 'Enzymes', accent: '#60a5fa',
      description: 'One of the fastest enzymes known — it interconverts CO₂ and bicarbonate for breathing.',
      protein: 'MSHHWGYGKHNGPEHWHKDFPIAKGERQSPVDIDTHTAKYDPSLKPLSVSYDQATSLRILNNGHAFNVEFDDSQDKAVL'
    },

    // ------------------------------------------------ Prions & misfolding
    {
      id: 'prion-protein', emoji: '🧟', name: 'Prion protein (PrP)', cuisine: 'Misfolding', accent: '#a16207',
      description: 'A protein that can flip into a self-spreading shape — the agent of mad cow disease.',
      protein: 'MANLGCWMLVLFVATWSDLGLCKKRPKPGGWNTGGSRYPGQGSPGGNRYPPQGGGGWGQPHGGGWGQPHGGGWGQPHGGGW'
    },
    {
      id: 'tau', emoji: '🧶', name: 'Tau', cuisine: 'Misfolding', accent: '#8b5cf6',
      description: 'A microtubule stabiliser that tangles into knots in Alzheimer\'s brains.',
      protein: 'MVQINKKLDLSNVQSKCGSKDNIKHVPGGGSVQIVYKPVDLSKVTSKCGSLGNIHHKPGGGQ'
    },
    {
      id: 'huntingtin', emoji: '🎯', name: 'Huntingtin (polyQ)', cuisine: 'Misfolding', accent: '#f43f5e',
      description: 'A brain protein with a glutamine repeat — too many Qs and it clumps.',
      protein: 'MATLEKLMKAFESLKSFQQQQQQQQQQQQQQQQQQPQPPPPPPPPPPPPPQLPQPPPQAQPLLPQPQPPPPPPPPPPGPA'
    },
    {
      id: 'alpha-synuclein', emoji: '🌀', name: 'α-synuclein', cuisine: 'Misfolding', accent: '#7c3aed',
      description: 'A greasy neuronal protein whose clumps mark Parkinson\'s disease.',
      protein: 'MDVFMKGLSKAKEGVVAAAEKTKQGVAEAAGKTKEGVLYVGSKTKEGVVHGVATVAEKTKEQVTNVGGAVVTGVTAVAQKTV'
    },
    {
      id: 'transthyretin', emoji: '🫀', name: 'Transthyretin', cuisine: 'Misfolding', accent: '#f59e0b',
      description: 'A thyroid-hormone carrier that can misfold and stiffen the heart.',
      protein: 'MASHRLLLLCLAGLVFVSEAGPTGTGESKCPLMVKVLDAVRGSPAINVAVHVFRKAADDTWEPFASGKTSESGELHGLTTEEEFVEGIYKVE'
    },

    // ------------------------------------------------ Food & sweet
    {
      id: 'brazzein', emoji: '🍭', name: 'Brazzein', cuisine: 'Food', accent: '#f472b6',
      description: 'A tiny West-African berry protein that tastes intensely sweet.',
      protein: 'MDQDCCKKVYENYPVSKCQLANQCNYDCKLDKHARSGECFYDEKRNLQCICDYCEY'
    },
    {
      id: 'monellin', emoji: '🍬', name: 'Monellin', cuisine: 'Food', accent: '#22d3ee',
      description: 'A sweet protein from the serendipity berry — thousands of times sweeter than sugar.',
      protein: 'MGEWEIIDIGPFTQNLGKFAVDEENKIGQYGRLTFNKVIRPCMKKTIYEENE'
    },
    {
      id: 'miraculin', emoji: '✨', name: 'Miraculin', cuisine: 'Food', accent: '#a78bfa',
      description: 'The miracle berry protein that makes sour things taste sweet.',
      protein: 'MVLFFVLLLPSFTSAEKKEEKKENKQVVKEEEEKENGVLVNSQGNKEALQKVKQLKKGVKED'
    },
    {
      id: 'ovalbumin', emoji: '🥚', name: 'Ovalbumin', cuisine: 'Food', accent: '#fef9c3',
      description: 'The main protein of egg white — a storage protein that coagulates when you fry an egg.',
      protein: 'MGSIGAASMEFCFDVFKELKVHHANENIFYCPIAIMSALAMVYLGAKDSTRTQINKVVRFDKLPGFGDSIEAQ'
    },

    // ------------------------------------------------ Bioluminescence
    {
      id: 'gfp', emoji: '🟢', name: 'Green fluorescent protein', cuisine: 'Bioluminescence', accent: '#22c55e',
      description: 'The jellyfish protein that glows green and lit up modern biology.',
      protein: 'MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTFSYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDD'
    },
    {
      id: 'luciferase', emoji: '🪲', name: 'Firefly luciferase', cuisine: 'Bioluminescence', accent: '#facc15',
      description: 'The enzyme that makes fireflies flash by lighting up luciferin.',
      protein: 'MEDAKNIKKGPAPFYPLEDGTAGEQLHKAMKRYALVPGTIAFTDAHIEVNITYAEYFEMSVRLAEAMKRYGLNTNHRIVVCSENSLQFFMPVLGALFIGVAVAPANDIYNERELLNSMNI'
    },

    // ------------------------------------------------ Toxins
    {
      id: 'ricin', emoji: '☠️', name: 'Ricin (A chain)', cuisine: 'Toxins', accent: '#ef4444',
      description: 'A castor-bean enzyme that shuts down ribosomes — one of the deadliest plant poisons.',
      protein: 'MIFPKQYPIINFTTAGATVQSYTNFIRAVRGRLTTGADVRHEIPVLPNRVGLPINQRFILVELSNHAELSVTLALDVTNAYVVGYRAGNSAYFFHPDNQED'
    },
    {
      id: 'conotoxin', emoji: '🐚', name: 'Conotoxin', cuisine: 'Toxins', accent: '#06b6d4',
      description: 'A cone-snail venom peptide that jams nerve channels — now a source of painkillers.',
      protein: 'MCKQGFQKYECCKGSKCSRLMYDCCTGSCRSGKC'
    }
  ];

  /** A recipe plus its lazily-computed DNA. */
  function getRecipe(id) {
    var base = RECIPES.filter(function (r) { return r.id === id; })[0];
    return base ? withDNA(base) : null;
  }

  function withDNA(recipe) {
    if (!recipe.dna) {
      recipe = Object.assign({}, recipe, { dna: reverseTranslate(recipe.protein) });
    }
    return recipe;
  }

  function allRecipes() {
    return RECIPES.map(withDNA);
  }

  return {
    PREFERRED_CODONS: PREFERRED_CODONS,
    RECIPES: RECIPES,
    codonFor: codonFor,
    reverseTranslate: reverseTranslate,
    getRecipe: getRecipe,
    allRecipes: allRecipes
  };
});
