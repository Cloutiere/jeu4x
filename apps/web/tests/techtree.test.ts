/**
 * HANDOFF-TECHTREE · L1 (test-first) — données d'affichage de l'arbre
 * technologique plein écran. Rév. 05/10 (retour d'Erik) : JAMAIS de flèche
 * vers la gauche — la colonne d'une tech est strictement À DROITE de tous
 * ses prérequis (col = max(col prereqs) + 1) ; les techs peuvent être
 * reportées sous une bande d'ère ultérieure (répartition équitable, renommage
 * des ères possible). Aucun changement moteur/serveur.
 */
import { describe, expect, it } from 'vitest';
import { TECHS, ERA_ORDER } from '@game/rules';
import {
  PLACEMENT,
  BANDES_AFFICHAGE,
  SURCHARGE_ERA_AFFICHAGE,
  aImageTech,
  imageTech,
  imageTechFallback,
  eraAffichageDe,
  colonneDe,
  etatTech,
  etatsTechs,
  toursRestants,
  libellesDebloques,
  prerequisManquants,
  eraDeColonne,
  integrityMapping,
} from '../src/lib/techtree.js';

const JOUEUR_NEUF = { techsUnlocked: [], researching: null };

describe('flot de gauche à droite (retour Erik 05/10)', () => {
  it('colonne(tech) STRICTEMENT à droite de chaque prérequis', () => {
    for (const [id, t] of Object.entries(TECHS)) {
      for (const p of t.prereqs) {
        expect(colonneDe(id), `${id} ← ${p}`).toBeGreaterThan(colonneDe(p));
      }
    }
  });

  it('racines (sans prérequis) en colonne 0', () => {
    for (const [id, t] of Object.entries(TECHS)) {
      if (t.prereqs.length === 0) expect(colonneDe(id), id).toBe(0);
    }
  });

  it('l’exemple d’Erik : Alphabet (col 0) → Écriture en col 1', () => {
    expect(colonneDe('alphabet')).toBe(0);
    expect(colonneDe('ecriture')).toBe(1);
  });

  it('colonne calculée = max(colonnes des prérequis) + 1', () => {
    for (const [id, t] of Object.entries(TECHS)) {
      if (t.prereqs.length === 0) continue;
      const attendu = Math.max(...t.prereqs.map((p) => colonneDe(p))) + 1;
      expect(colonneDe(id), id).toBe(attendu);
    }
  });
});

describe('bandes d’ère (répartition équitable, report possible)', () => {
  it('les bandes sont contiguës, couvrent toutes les colonnes, dans l’ordre ERA_ORDER', () => {
    expect(BANDES_AFFICHAGE.map((b) => b.era)).toEqual([...ERA_ORDER]);
    let attendu = 0;
    for (const b of BANDES_AFFICHAGE) {
      expect(b.derniereCol).toBeGreaterThanOrEqual(attendu);
      attendu = b.derniereCol + 1;
    }
    expect(attendu - 1).toBe(Math.max(...Object.values(PLACEMENT).map((p) => p.col)));
  });

  it('répartition équitable : ~12 techs par bande (écart max ≤ 6)', () => {
    const parBande = new Map(BANDES_AFFICHAGE.map((b) => [b.era, 0]));
    for (const id of Object.keys(TECHS)) {
      parBande.set(eraAffichageDe(id), (parBande.get(eraAffichageDe(id)) ?? 0) + 1);
    }
    const counts = [...parBande.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(6);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(Object.keys(TECHS).length);
  });

  it('eraAffichageDe = bande de la colonne (une surcharge gagne toujours)', () => {
    for (const id of Object.keys(TECHS)) {
      expect(eraAffichageDe(id)).toBe(eraDeColonne(colonneDe(id)));
    }
    expect(Object.keys(SURCHARGE_ERA_AFFICHAGE)).toEqual([]);
  });

  it('une tech peut être reportée sous une ère MOTEUR ultérieure (affichage ≠ moteur possible)', () => {
    const reportes = Object.keys(TECHS).filter((id) => eraAffichageDe(id) !== TECHS[id]!.era);
    expect(reportes.length).toBeGreaterThan(0); // le flot de dépendances déplace forcément des techs
  });
});

describe('mapping complet (D5/D6)', () => {
  it('intégrité : 46/46 placées, aucune collision, colonnes cohérentes', () => {
    expect(integrityMapping()).toEqual([]);
  });

  it('placement = 46 techs, une position par carte', () => {
    expect(Object.keys(PLACEMENT).sort()).toEqual(Object.keys(TECHS).sort());
  });

  it('rangées sans collision par colonne', () => {
    const vues = new Map<string, string>();
    for (const [id, p] of Object.entries(PLACEMENT)) {
      const cle = `${p.col}:${p.row}`;
      expect(vues.has(cle) ? `collision ${cle} : ${vues.get(cle)} vs ${id}` : null).toBeNull();
      vues.set(cle, id);
    }
  });
});

describe('états des cartes (D2 — mêmes règles moteur)', () => {
  it('joueur neuf : racines disponibles, le reste verrouillé', () => {
    const etats = etatsTechs(JOUEUR_NEUF);
    expect(etats['alphabet']).toBe('disponible');
    expect(etats['poterie']).toBe('disponible');
    expect(etats['ecriture']).toBe('verrouillee');
    expect(etats['poudre_a_canon']).toBe('verrouillee');
  });

  it('recherche en cours → en_cours (prime sur disponible)', () => {
    expect(etatTech({ techsUnlocked: [], researching: 'alphabet' }, 'alphabet')).toBe('en_cours');
  });

  it('tech débloquée → acquise', () => {
    const etats = etatsTechs({ techsUnlocked: ['alphabet'], researching: null });
    expect(etats['alphabet']).toBe('acquise');
    expect(etats['ecriture']).toBe('disponible');
  });
});

describe('cartes (D4) — coûts, tours estimés, débloqués en noms', () => {
  it('tours restants estimés à la science courante', () => {
    expect(toursRestants(30, 0, 10)).toBe(3);
    expect(toursRestants(30, 25, 10)).toBe(1);
    expect(toursRestants(30, 0, 0)).toBeNull();
  });

  it('débloqués = libellés FR (jamais les ids bruts)', () => {
    const labels = libellesDebloques(TECHS['alphabet']!);
    expect(labels).toContain('Bibliothèque');
    expect(labels.some((l) => l === 'bibliotheque')).toBe(false);
  });

  it('prérequis manquants = noms FR des techs non débloquées', () => {
    const m = prerequisManquants(TECHS['code_des_lois']!, []);
    expect(m).toEqual(TECHS['code_des_lois']!.prereqs.map((p) => TECHS[p]!.name).sort());
  });
});

describe('images (D6) — recuites d’Erik + fallback', () => {
  it('43 techs avec image d’Erik', () => {
    expect(Object.keys(TECHS).filter(aImageTech).length).toBe(43);
  });

  it('techs sans image → fallback icône consigné', () => {
    for (const id of ['corporation', 'acier', 'electricite']) {
      expect(aImageTech(id)).toBe(false);
      expect(imageTech(id)).toBe(imageTechFallback());
    }
  });

  it('fonds d’ère 16:9 recuits', () => {
    expect(BANDES_AFFICHAGE.every((b) => b.fond.startsWith('/art/techtree/era_'))).toBe(true);
  });
});
