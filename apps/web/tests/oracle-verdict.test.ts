/**
 * ORACLE-VERDICT · L2 (canon Erik 09/11, Chemin B) — côté client.
 * Partie pure (lib/oracle.ts : cadence, table des verdicts, libellés canon)
 * + câblage UnitPanel/GameCanvas/gameClient (verdict SEULEMENT si l'Oracle
 * est actif, plus aucun pourcentage).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cleOracle,
  demanderPrediction,
  enregistrerPrediction,
  libelleVerdict,
  predictionsBataille,
  purgePrediction,
} from '../src/lib/oracle.js';
import type { GameClient, GameView } from '../src/lib/gameClient.js';
import { initialView } from '../src/lib/gameClient.js';

function clientEspion(): { client: GameClient; envois: Array<{ attaquant: string; cible: { q: number; r: number } }> } {
  const envois: Array<{ attaquant: string; cible: { q: number; r: number } }> = [];
  const client = { predireBataille: (attaquant: string, cible: { q: number; r: number }) => envois.push({ attaquant, cible }) } as unknown as GameClient;
  return { client, envois };
}

function vue(turn: number): GameView {
  return { ...initialView('TEST'), turn };
}

describe('ORACLE-VERDICT · cadence (D2 : une prédiction par planning, pas de spam)', () => {
  beforeEach(() => purgePrediction());

  it('une même bataille (tour, attaquant, cible) n\'est demandée qu\'UNE fois', () => {
    const { client, envois } = clientEspion();
    for (let i = 0; i < 20; i++) demanderPrediction(client, vue(5), 'u1', { q: 2, r: 3 });
    expect(envois).toHaveLength(1);
  });

  it('une autre cible ou un autre tour = nouvelle demande ; la purge ré-arme', () => {
    const { client, envois } = clientEspion();
    demanderPrediction(client, vue(5), 'u1', { q: 2, r: 3 });
    demanderPrediction(client, vue(5), 'u1', { q: 2, r: 4 });
    demanderPrediction(client, vue(6), 'u1', { q: 2, r: 3 });
    expect(envois).toHaveLength(3);
    purgePrediction();
    demanderPrediction(client, vue(6), 'u1', { q: 2, r: 3 });
    expect(envois).toHaveLength(4);
  });
});

describe('ORACLE-VERDICT · table des verdicts et libellés canon', () => {
  beforeEach(() => purgePrediction());

  it('le verdict reçu est rangé par (attaquant, cible) ; purge au tour résolu', () => {
    enregistrerPrediction('u1', { q: 2, r: 3 }, 'victoire');
    enregistrerPrediction('u1', { q: 4, r: 4 }, 'defaite');
    expect(get(predictionsBataille)[cleOracle('u1', { q: 2, r: 3 })]).toBe('victoire');
    expect(get(predictionsBataille)[cleOracle('u1', { q: 4, r: 4 })]).toBe('defaite');
    purgePrediction();
    expect(get(predictionsBataille)).toEqual({});
  });

  it('libellés canon VICTOIRE / DÉFAITE ; refus ou absence = rien', () => {
    expect(libelleVerdict('victoire')).toBe('VICTOIRE');
    expect(libelleVerdict('defaite')).toBe('DÉFAITE');
    expect(libelleVerdict('refus')).toBeNull();
    expect(libelleVerdict(undefined)).toBeNull();
  });
});

describe('ORACLE-VERDICT · câblage', () => {
  const panneau = readFileSync(resolve(import.meta.dirname, '../src/components/UnitPanel.svelte'), 'utf8');
  const canvas = readFileSync(resolve(import.meta.dirname, '../src/lib/render/GameCanvas.svelte'), 'utf8');
  const client = readFileSync(resolve(import.meta.dirname, '../src/lib/gameClient.ts'), 'utf8');

  it('UnitPanel : les pourcentages sont supprimés (plus de combatOdds ni de %/round)', () => {
    expect(panneau).not.toContain('combatOdds');
    expect(panneau).not.toContain('%/round');
  });

  it('UnitPanel : verdict affiché SEULEMENT si l\'Oracle est actif (gate partagée oracleActif)', () => {
    expect(panneau).toContain('oracleActif(view.state, id)');
    expect(panneau).toMatch(/function verdictPour[\s\S]*if \(!oracleActive \|\| !unit\) return null;/);
    expect(panneau).toContain('demanderPrediction(client, view, unit.id, t.hex)');
  });

  it('préview vivante : demande au survol d\'un ennemi visible, Oracle actif, mêlée seulement', () => {
    expect(canvas).toMatch(/ennemiVise && stateSurvol && scene\.myId && scene\.view && !unitType\(unit\.type\)\.isRanged && oracleActif\(stateSurvol, scene\.myId\)/);
    expect(canvas).toContain('🔮 Oracle : ${verdict}');
  });

  it('gameClient : la réponse privée BattlePrediction alimente la table, un tour résolu la purge', () => {
    expect(client).toContain("handle.send({ type: 'PredictBattle', attaquant, cible })");
    expect(client).toContain('enregistrerPrediction(message.attaquant');
    expect(client).toMatch(/message\.type === 'TurnResult' \|\| message\.type === 'Snapshot' \|\| message\.type === 'OrderAck'\) purgePrediction\(\)/);
  });
});
