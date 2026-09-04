/**
 * design.js — Langage visuel « Réseau » v2 (prototype vraie 3D, décision d'Erik du 04/09).
 *
 * Principes (documentés dans « Refonte Cybernétique… » § Langage visuel des tuiles) :
 *  - chaque tuile affiche son POTENTIEL de rendement ; seul l'ACTIF est allumé ;
 *  - trois pictogrammes d'une même couleur néon : bus de données = Nourriture Ⓝ,
 *    microprocesseur = Cycles CPU Ⓟ, barrette RAM = Commerce Ⓒ ;
 *  - l'identité du terrain se lit par la teinte du substrat (variantes cyberpunk
 *    marquées) et par l'élévation (eau plus basse, colline +1, montagne +2).
 *
 * Ce module fournit la SPEC déclarative des 8 terrains, les peintres de substrat
 * (textures de face) et les placements de glyphes. Le rendu 3D vit dans tuiles3d.js.
 */
window.CyberTiles = (function () {
  'use strict';

  // Couleur UNIQUE des glyphes (bus/CPU/RAM) — la forme distingue la ressource.
  const NEON = 0x3DFFCE;
  const NEON_CSS = '#3DFFCE';

  /**
   * Spec des 8 terrains.
   *  elev    : hauteur du plateau (niveau de base = 0 ; eau négative)
   *  detail  : style de détail du substrat (peintre)
   *  glyphe  : { type:'bus'|'cpu'|'ram'|'mixte', total, actifs, batiment }
   *            — « mixte » (eau) : ram.total toujours allumées + bus soumis au Port.
   */
  const TERRAINS = {
    prairie: {
      nom: 'Secteur Mémoire Flux', origine: 'Prairie',
      haut: '#1E6B58', bas: '#0D382E', elev: 0, detail: 'grille',
      glyphe: { type: 'bus', total: 2, actifs: 2, batiment: null },
    },
    plaine: {
      nom: 'Cluster de Données', origine: 'Plaine',
      haut: '#5E6B2F', bas: '#2A3319', elev: 0, detail: 'grille',
      glyphe: { type: 'bus', total: 3, actifs: 1, batiment: 'grenier' },
    },
    foret: {
      nom: "Matrice d'Algorithmes Bruts", origine: 'Forêt',
      haut: '#134B33', bas: '#08251A', elev: 0, detail: 'stries',
      glyphe: { type: 'cpu', total: 2, actifs: 2, batiment: null },
    },
    colline: {
      nom: 'Nœud de Processeurs', origine: 'Colline',
      haut: '#2B5570', bas: '#12293B', elev: 0.30, detail: 'hachure',
      glyphe: { type: 'cpu', total: 3, actifs: 1, batiment: 'atelier' },
    },
    montagne: {
      nom: 'Noyau Quantique Solide', origine: 'Montagne',
      haut: '#4A3E6E', bas: '#221B38', elev: 0.62, detail: 'facettes',
      glyphe: { type: 'cpu', total: 5, actifs: 1, batiment: 'extracteur' },
    },
    desert: {
      nom: 'Bus à Bruit Statique', origine: 'Désert',
      haut: '#75582B', bas: '#382912', elev: 0, detail: 'bruit',
      glyphe: { type: 'ram', total: 3, actifs: 1, batiment: 'multiplexeur' },
    },
    mer: {
      nom: 'Réseau Sub-Éthéré (Fibre)', origine: 'Mer',
      haut: '#14526B', bas: '#082938', elev: -0.40, detail: 'ondes',
      glyphe: { type: 'mixte', ram: 2, bus: 1, actifsRam: 2, actifsBus: 0, batiment: 'passerelle' },
    },
    ocean: {
      nom: 'Réseau Sub-Éthéré profond', origine: 'Océan',
      haut: '#0E3450', bas: '#061A2A', elev: -0.40, detail: 'ondes',
      glyphe: { type: 'mixte', ram: 2, bus: 1, actifsRam: 2, actifsBus: 0, batiment: 'passerelle' },
    },
  };

  /** Bâtiments qui allument le potentiel résiduel. */
  const BATIMENTS = {
    grenier: { nom: 'Buffer Mémoire (Grenier)', effet: 'Plaine : 1 → 3 bus' },
    atelier: { nom: "Moteur d'Accélération (Atelier)", effet: 'Colline : 1 → 3 CPU' },
    extracteur: { nom: 'Extracteur Quantique (Mine de fer)', effet: 'Montagne : 1 → 5 CPU' },
    multiplexeur: { nom: 'Multiplexeur (Comptoir)', effet: 'Désert : 1 → 3 RAM' },
    passerelle: { nom: 'Passerelle Optique (Port)', effet: 'Eau : bus de données allumé' },
  };

  // ------------------------------------------------------------------
  // Carte de démonstration (37 tuiles, rayon 3) — coupe géologique :
  // montagnes à l'arrière, collines puis forêts, bandes fertiles,
  // désert, littoral et océan à l'avant. Clé = r, valeur = q croissant.
  // ------------------------------------------------------------------
  const RAYON = 3;
  const CARTE = {
    '-3': ['montagne', 'montagne', 'colline', 'colline'],
    '-2': ['montagne', 'colline', 'colline', 'foret', 'foret'],
    '-1': ['colline', 'foret', 'foret', 'foret', 'plaine', 'prairie'],
    '0': ['foret', 'plaine', 'plaine', 'prairie', 'prairie', 'desert', 'mer'],
    '1': ['plaine', 'prairie', 'prairie', 'desert', 'mer', 'mer'],
    '2': ['prairie', 'desert', 'mer', 'mer', 'ocean'],
    '3': ['mer', 'ocean', 'ocean', 'ocean'],
  };

  /** Terrain d'une case axiale (null si hors carte). */
  function terrainDe(q, r) {
    const ligne = CARTE[String(r)];
    if (!ligne) return null;
    const i = q - Math.max(-RAYON, -r - RAYON);
    return ligne[i] || null;
  }

  /** Itère les 37 cases : cb(q, r, typeTerrain). */
  function chaqueCase(cb) {
    for (let r = -RAYON; r <= RAYON; r++) {
      for (let q = Math.max(-RAYON, -r - RAYON); q <= Math.min(RAYON, -r + RAYON); q++) {
        const t = terrainDe(q, r);
        if (t) cb(q, r, t);
      }
    }
  }

  // ------------------------------------------------------------------
  // RNG seedé + variantes (2 par terrain, stables)
  // ------------------------------------------------------------------
  const SEED = 20260904;
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function variantOf(q, r) {
    const rnd = mulberry32(SEED ^ (q * 73856093) ^ (r * 19349663));
    return Math.floor(rnd() * 2);
  }

  /** Assombrit une couleur hex '#RRGGBB' d'un facteur f (0..1). */
  function assombrir(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * f);
    const g = Math.round(((n >> 8) & 255) * f);
    const b = Math.round((n & 255) * f);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /** Assombrit '#RRGGBB' d'un facteur f et retourne un entier 0xRRGGBB (Three.js). */
  function foncerInt(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * f);
    const g = Math.round(((n >> 8) & 255) * f);
    const b = Math.round((n & 255) * f);
    return (r << 16) | (g << 8) | b;
  }

  // ------------------------------------------------------------------
  // Peintre de substrat — face supérieure d'une tuile (hexagone pointy-top
  // inscrit, R = size/2). Détails très discrets (SPEC-ART §3.4 : lisible à 0,5×).
  // ------------------------------------------------------------------
  function hexPath(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = ((60 * i + 30) * Math.PI) / 180;
      const x = cx + r * Math.cos(a);
      const y = cy - r * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function roundRect(ctx, x, y, w, h, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function paintSubstrat(ctx, size, typeTerrain, variante) {
    const t = TERRAINS[typeTerrain];
    const R = size / 2, cx = R, cy = R;
    const rnd = mulberry32(SEED + variante * 7919 + typeTerrain.length * 131);

    ctx.save();
    hexPath(ctx, cx, cy, R - 1);
    ctx.clip();

    // substrat : lumière haut-gauche
    const g = ctx.createLinearGradient(cx - R * 0.8, cy - R, cx + R * 0.6, cy + R);
    g.addColorStop(0, t.haut);
    g.addColorStop(1, t.bas);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    // détails par terrain, tous très discrets
    ctx.strokeStyle = 'rgba(190,255,240,0.07)';
    ctx.fillStyle = 'rgba(190,255,240,0.08)';
    ctx.lineWidth = Math.max(1, size * 0.004);
    const detail = t.detail;
    if (detail === 'grille') {
      ctx.beginPath();
      for (let i = 1; i < 6; i++) {
        const p = -R + (i * size) / 6;
        ctx.moveTo(cx + p, 0); ctx.lineTo(cx + p, size);
        ctx.moveTo(0, cy + p); ctx.lineTo(size, cy + p);
      }
      ctx.stroke();
    } else if (detail === 'stries') {
      // rangées de code verticales (forêt)
      ctx.beginPath();
      for (let i = 0; i < 14; i++) {
        const p = -R + (i * size) / 14 + rnd() * 4;
        ctx.moveTo(cx + p, 0); ctx.lineTo(cx + p, size);
      }
      ctx.stroke();
    } else if (detail === 'hachure') {
      // hachures 45° (colline)
      ctx.beginPath();
      for (let i = -8; i < 9; i++) {
        const p = i * size / 9;
        ctx.moveTo(cx + p - R, cy + R); ctx.lineTo(cx + p + R, cy - R);
      }
      ctx.stroke();
    } else if (detail === 'facettes') {
      // fractures anguleuses (montagne)
      for (let i = 0; i < 5; i++) {
        let x = cx + (rnd() - 0.5) * size * 0.8, y = cy + (rnd() - 0.5) * size * 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 3; s++) {
          x += (rnd() - 0.5) * size * 0.5;
          y += (rnd() - 0.5) * size * 0.5;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else if (detail === 'bruit') {
      // speckles « bruit statique » (désert)
      for (let i = 0; i < 42; i++) {
        const x = cx + (rnd() - 0.5) * size * 0.92, y = cy + (rnd() - 0.5) * size * 0.92;
        ctx.fillRect(x, y, size * 0.012, size * 0.012);
      }
    } else if (detail === 'ondes') {
      // longues lignes de flux (eau)
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const y = cy - R * 0.7 + (i * size) / 7 + rnd() * 6;
        ctx.moveTo(cx - R * 0.75, y);
        ctx.lineTo(cx + R * 0.75, y + (rnd() - 0.5) * 5);
      }
      ctx.stroke();
    }

    // contour « plateau de jeu » + liseré haut-gauche
    hexPath(ctx, cx, cy, R - 1);
    ctx.strokeStyle = '#04121E';
    ctx.lineWidth = Math.max(2, size * 0.016);
    ctx.stroke();
    ctx.beginPath();
    [30, 90, 150].forEach((deg, i) => {
      const a = (deg * Math.PI) / 180;
      const x = cx + (R - 3.5) * Math.cos(a), y = cy - (R - 3.5) * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = 'rgba(150,255,230,0.13)';
    ctx.lineWidth = Math.max(1.2, size * 0.008);
    ctx.stroke();

    ctx.restore();
  }

  function faceCanvas(px, typeTerrain, variante) {
    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    paintSubstrat(c.getContext('2d'), px, typeTerrain, variante);
    return c;
  }

  // ------------------------------------------------------------------
  // Placements de glyphes (coordonnées locales, tuile R = 1).
  // ------------------------------------------------------------------
  /** Voies de bus : n lanes parallèles à l'axe X (longueur 1,6). */
  function voiesBus(n) {
    if (n === 1) return [0];
    if (n === 2) return [-0.25, 0.25];
    if (n === 3) return [-0.4, 0, 0.4];
    return Array.from({ length: n }, (_, i) => -0.4 + (0.8 * i) / (n - 1));
  }

  /** Empreintes des microprocesseurs : [x, z] selon le total. */
  function empreintesCpu(n) {
    if (n === 1) return [[0, 0]];
    if (n === 2) return [[-0.25, 0], [0.25, 0]];
    if (n === 3) return [[0, 0.24], [-0.27, -0.17], [0.27, -0.17]];
    // quincunx (montagne, n=5)
    return [[0, 0], [-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]];
  }

  /** Emplacements des barrettes RAM : [x, z]. */
  function slotsRam(n, zOffset) {
    const z = zOffset || 0;
    if (n === 2) return [[-0.24, z], [0.24, z]];
    return [[-0.36, z], [0, z], [0.36, z]];
  }

  return {
    NEON, NEON_CSS, SEED, RAYON, CARTE, TERRAINS, BATIMENTS,
    terrainDe, chaqueCase, mulberry32, variantOf, assombrir, foncerInt,
    hexPath, roundRect, paintSubstrat, faceCanvas,
    voiesBus, empreintesCpu, slotsRam,
  };
})();
