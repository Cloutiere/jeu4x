/**
 * HANDOFF-TECHTREE · L1 (test-first) — données d'affichage de l'arbre
 * technologique plein écran : mapping complet 46/46 (D5/D6), ère d'affichage
 * indépendante de l'ère moteur (D3), états des cartes (D2, règles moteur
 * intactes), débloqués en noms (D4), fallback image manquante (D6).
 * Aucun changement moteur/serveur.
 */
import { describe, expect, it } from 'vitest';
import { TECHS, ERA_ORDER } from '@game/rules';
import {
  PLACEMENT,
  ERAS_AFFICHAGE,
  COLONNES_PAR_ERA,
  aImageTech,
  imageTech,
  imageTechFallback,
  eraAffichageDe,
  etatTech,
  etatsTechs,
  toursRestants,
  libellesDebloques,
  prerequisManquants,
  eraDeColonne,
  integrityMapping,
  SURCHARGE_ERA_AFFICHAGE,
} from '../src/lib/techtree.js';

const JOUEUR_NEUF = { techsUnlocked: [], researching: null };

describe('mapping complet (D5/D6)', () => {
  it('toutes les techs moteur sont placées, aucune tech inconnue', () => {
    expect(integrityMapping()).toEqual([]);
  });

  it('placement = 46 techs, une position par carte, aucune collision', () => {
    expect(Object.keys(PLACEMENT).sort()).toEqual(Object.keys(TECHS).sort());
  });

  it('chaque tech est placée dans une colonne de SON ère d’affichage', () => {
    for (const [id, pos] of Object.entries(PLACEMENT)) {
      expect(eraDeColonne(pos.col), id).toBe(eraAffichageDe(id));
    }
  });

  it('les bandes d’ère couvrent ERA_ORDER dans l’ordre', () => {
    expect(ERAS_AFFICHAGE.map((e) => e.era)).toEqual([...ERA_ORDER]);
    expect(ERAS_AFFICHAGE.every((e) => e.fond.startsWith('/art/techtree/era_'))).toBe(true);
  });
});

describe('ère d’affichage vs ère moteur (D3 — zéro gameplay)', () => {
  it('défaut : ère moteur (aucune surcharge à l’arrivée)', () => {
    expect(Object.keys(SURCHARGE_ERA_AFFICHAGE)).toEqual([]);
    for (const [id, t] of Object.entries(TECHS)) expect(eraAffichageDe(id)).toBe(t.era);
  });

  it('une surcharge change la colonne SANS toucher techs.json', () => {
    expect(TECHS['alphabet']!.era).toBe('ancienne');
    // la surcharge est un simple objet de données : le moteur n’en dépend pas
    expect('era' in PLACEMENT).toBe(false);
    expect(TECHS['alphabet']!.cost).toBeDefined();
  });

  it('les colonnes par ère sont disjointes et couvrent toutes les colonnes placées', () => {
    const toutes = new Set(Object.values(PLACEMENT).map((p) => p.col));
    const parEra = new Set(Object.values(COLONNES_PAR_ERA).flat());
    expect(toutes).toEqual(parEra);
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

  it('tech débloquée → acquise, même si prérequis lointains', () => {
    const etats = etatsTechs({ techsUnlocked: ['alphabet'], researching: null });
    expect(etats['alphabet']).toBe('acquise');
    expect(etats['ecriture']).toBe('disponible');
    expect(etats['code_des_lois']).toBe('verrouillee');
  });

  it('recherche en cours → en_cours (prime sur disponible)', () => {
    expect(etatTech({ techsUnlocked: [], researching: 'alphabet' }, 'alphabet')).toBe('en_cours');
  });

  it('techs débloquées par état, cohérentes avec availableTechs moteur', () => {
    const joueur = { techsUnlocked: ['alphabet', 'poterie'], researching: 'ecriture' };
    const etats = etatsTechs(joueur);
    expect(etats['ecriture']).toBe('en_cours');
    for (const [id, e] of Object.entries(etats)) {
      if (e === 'disponible' || e === 'en_cours') {
        expect(joueur.techsUnlocked.includes(id)).toBe(false);
      }
      if (e === 'acquise') expect(joueur.techsUnlocked).toContain(id);
    }
  });
});

describe('cartes (D4) — coûts, tours estimés, débloqués en noms', () => {
  it('tours restants estimés à la science courante (plafond 1, null sans science)', () => {
    expect(toursRestants(30, 0, 10)).toBe(3);
    expect(toursRestants(30, 25, 10)).toBe(1);
    expect(toursRestants(30, 0, 0)).toBeNull();
  });

  it('débloqués = libellés FR (jamais les ids bruts)', () => {
    const labels = libellesDebloques(TECHS['alphabet']!);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels).toContain('Bibliothèque');
    expect(labels.some((l) => l === 'bibliotheque')).toBe(false);
  });

  it('prérequis manquants = noms FR des techs non débloquées', () => {
    const m = prerequisManquants(TECHS['code_des_lois']!, []);
    expect(m).toEqual(TECHS['code_des_lois']!.prereqs.map((p) => TECHS[p]!.name).sort());
    expect(prerequisManquants(TECHS['code_des_lois']!, ['ecriture', 'alphabet'])).toEqual([]);
  });
});

describe('images (D6) — recuites d’Erik + fallback', () => {
  it('44 sources consommées : 43 techs avec image d’Erik', () => {
    const avec = Object.keys(TECHS).filter(aImageTech);
    expect(avec.length).toBe(43);
  });

  it('techs sans image (corporation, acier, electricite) → fallback icône consigné', () => {
    for (const id of ['corporation', 'acier', 'electricite']) {
      expect(aImageTech(id)).toBe(false);
      expect(imageTech(id)).toBe(imageTechFallback());
    }
  });

  it('tech avec image → fichier recuit au nom d’id propre (pas le nom de source)', () => {
    expect(imageTech('poterie')).toBe('/art/techtree/tech_poterie.jpg'); // source potery.jpeg
    expect(imageTech('theorie_atomique')).toBe('/art/techtree/tech_theorie_atomique.jpg'); // source « atomic theory.jpeg »
  });
});
