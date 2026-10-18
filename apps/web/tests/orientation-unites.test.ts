/**
 * ORIENTATION-UNITES · D3 (décisions d'Erik du 17/10) — table des faces
 * natives : purement affichage, testée contre les ids réels de units.json
 * (toute clé de FACES_NATIVES doit être un type existant ; tout type avec art
 * cuit devrait y figurer — les manquants tombent sur le défaut « gauche »).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACES_NATIVES, faceDroiteParDefaut, flipUnite, faceGaucheAffichee } from '../src/lib/render/orientation-unites.js';
import { directionOrientante } from '@game/rules';

const unitsJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../packages/rules/src/data/units.json', import.meta.url)), 'utf8'),
) as Record<string, { id: string }>;
const TOUS_IDS = Object.keys(unitsJson);

describe('FACES_NATIVES · table D3', () => {
  it('toutes les clés sont des types réels de units.json', () => {
    for (const type of Object.keys(FACES_NATIVES)) {
      expect(TOUS_IDS, `type inconnu dans la table : ${type}`).toContain(type);
    }
  });

  it('toute unité avec art PROPRE (unite_<id>.png) figure dans la table (couverture D3)', () => {
    const artDir = fileURLToPath(new URL('../public/art/', import.meta.url));
    const avecArt = TOUS_IDS.filter((id) => existsSync(join(artDir, `unite_${id}.png`)));
    const manquants = avecArt.filter((id) => !(id in FACES_NATIVES));
    expect(manquants, `types avec art sans face native consignée : ${manquants.join(', ')}`).toEqual([]);
  });

  it('faceDroiteParDefaut : défaut = gauche (false), présent = valeur de la table', () => {
    expect(faceDroiteParDefaut('type-inexistant')).toBe(false);
    expect(faceDroiteParDefaut('croiseur')).toBe(true);
    expect(faceDroiteParDefaut('canon')).toBe(false);
  });

  it('flipUnite : retourné ssi la direction voulue ≠ face native de l\'art', () => {
    // Art regardant à DROITE + unité regardant à gauche → flip.
    expect(flipUnite('croiseur', true)).toBe(true);
    // Art à droite + unité à droite → pas de flip.
    expect(flipUnite('croiseur', false)).toBe(false);
    // Art à gauche + unité à gauche → pas de flip.
    expect(flipUnite('canon', true)).toBe(false);
    // Art à gauche + unité à droite → flip.
    expect(flipUnite('canon', false)).toBe(true);
    // Champ absent (création, reprise d'ancienne partie) = droite.
    expect(flipUnite('canon', undefined)).toBe(true);
    expect(flipUnite('croiseur', undefined)).toBe(false);
  });
});

describe('faceGaucheAffichee · orientation DÈS LA PLANIFICATION (retour Erik 18/10)', () => {
  const W = 40;
  const unit = { q: 5, r: 5, faceGauche: undefined };

  it('ordre programmé vers l\'Est → droite IMMÉDIATEMENT (avant résolution)', () => {
    expect(faceGaucheAffichee(unit, [{ q: 6, r: 5 }], W, directionOrientante)).toBe(false);
  });

  it('ordre programmé vers l\'Ouest → gauche IMMÉDIATEMENT', () => {
    expect(faceGaucheAffichee(unit, [{ q: 4, r: 5 }], W, directionOrientante)).toBe(true);
  });

  it('le PREMIER pas du chemin fait foi (multi-cases)', () => {
    expect(faceGaucheAffichee(unit, [{ q: 5, r: 4 }, { q: 4, r: 4 }], W, directionOrientante)).toBe(true);
  });

  it('sans ordre (annulé, consommé) : retour à l\'état résolu', () => {
    expect(faceGaucheAffichee({ q: 5, r: 5, faceGauche: true }, null, W, directionOrientante)).toBe(true);
    expect(faceGaucheAffichee({ q: 5, r: 5, faceGauche: true }, [], W, directionOrientante)).toBe(true);
  });

  it('chemin tronqué par le fog (case inconnue) : orientation du premier pas VISIBLE', () => {
    // Le chemin de l'aperçu est tronqué — son premier pas reste un voisin.
    expect(faceGaucheAffichee(unit, [{ q: 6, r: 4 }], W, directionOrientante)).toBe(false);
  });
});
