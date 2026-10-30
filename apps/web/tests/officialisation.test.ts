/**
 * OFFICIALISATION (Erik 30/10) — logique PURE du bouton « ✍ Officieliser… »
 * sur les bulles de Zii : éligibilité (D1 — intention ∈ {demandePaix, offre},
 * jamais sur mes propres bulles ni sur un message humain) et section mise en
 * avant dans la NegociationModale (demandePaix en guerre → paix ; sinon
 * techs). Zii ne propose JAMAIS d'accord (R-190) : le bouton ne fait
 * qu'ouvrir l'UI existante.
 */
import { describe, expect, it } from 'vitest';
import type { ChatMessageData } from '@game/shared';
import { INTENTIONS_OFFICIELISABLES, officielisable, sectionSuggeree } from '../src/lib/officialisation.js';

const bulle = (over: Partial<ChatMessageData> = {}): ChatMessageData => ({
  partie: 'ABC123',
  tour: 3,
  auteur: 'p2',
  canal: 'p1',
  texte: '…',
  horodatage: 1,
  ...over,
});

describe('OFFICIALISATION · officielisable (D1)', () => {
  it('bouton PRÉSENT ⇔ intention éligible posée par le serveur', () => {
    for (const intention of INTENTIONS_OFFICIELISABLES) {
      expect(officielisable(bulle({ intentionPercue: intention }), 'p1')).toBe(true);
    }
  });

  it('bouton ABSENT sur salutation / question / autre / menace (non éligibles)', () => {
    for (const intention of ['salutation', 'question', 'autre', 'menace']) {
      expect(officielisable(bulle({ intentionPercue: intention }), 'p1')).toBe(false);
    }
    expect(officielisable(bulle({}), 'p1')).toBe(false); // salutation : pas d'intention du tout
  });

  it('bouton ABSENT sur MES bulles et sur un message humain (jamais d’intention)', () => {
    expect(officielisable(bulle({ intentionPercue: 'demandePaix', auteur: 'p1' }), 'p1')).toBe(false);
    expect(officielisable(bulle({}), 'p1')).toBe(false); // humain↔humain : intentionPercue jamais posée
  });
});

describe('OFFICIALISATION · sectionSuggeree (D1)', () => {
  it('demandePaix EN guerre → section « Proposer la paix »', () => {
    expect(sectionSuggeree('demandePaix', true)).toBe('paix');
  });
  it('demandePaix HORS guerre → section « Échanger des technologies »', () => {
    expect(sectionSuggeree('demandePaix', false)).toBe('techs');
  });
  it('offre → section technologies (paix comme en guerre)', () => {
    expect(sectionSuggeree('offre', false)).toBe('techs');
    expect(sectionSuggeree('offre', true)).toBe('techs');
  });
});
