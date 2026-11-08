/**
 * CIVS-NEUTRES-LOBBY · L1/L2 — la civ neutre (R-147, « Sans civilisation »)
 * devient SÉLECTIONNABLE au lobby (hôte, bot/Jev, jointure, config 5 sièges)
 * sans jamais entrer dans un tirage aléatoire (D2 — test verrou).
 *
 * Le duel miroir neutre vs neutre des duels de test d'Erik est LE parcours
 * d'acceptation : deux camps sans trait, agressivité au défaut canon.
 */
import { describe, expect, it, vi } from 'vitest';

// E2E lobby : mêmes marges que lobby-5.test.ts (génération procédurale).
vi.setConfig({ testTimeout: 90_000 });
import { configPartieErreur, configPartieDefaut } from '@game/shared';
import type { ConfigPartie } from '@game/shared';
import { CIVILIZATIONS, NEUTRAL_CIV, estCivSelectionnable } from '@game/rules';
import { adminDump, createGame } from './helpers.js';

const CIVS = Object.keys(CIVILIZATIONS.civs).sort();

describe('CIVS-NEUTRES-LOBBY · la neutre sélectionnable', () => {
  it('verrou D2 : la neutre N\'EST PAS dans le registre des 16 canon — le pool de tous les tirages aléatoires', () => {
    // Tous les tirages (solo 1v1, 5 sièges, StartGame) lisent
    // Object.keys(CIVILIZATIONS.civs) : tant que la neutre n'y figure pas,
    // elle ne peut JAMAIS être tirée au hasard.
    expect(CIVILIZATIONS.civs[NEUTRAL_CIV]).toBeUndefined();
    expect(CIVS).toHaveLength(16);
    expect(CIVS).not.toContain(NEUTRAL_CIV);
  });

  it('estCivSelectionnable : neutre et 16 canon admises, inconnue refusée', () => {
    expect(estCivSelectionnable(NEUTRAL_CIV)).toBe(true);
    for (const c of CIVS) expect(estCivSelectionnable(c)).toBe(true);
    expect(estCivSelectionnable('inconnue')).toBe(false);
    expect(estCivSelectionnable('')).toBe(false);
  });

  it('config 5 sièges : neutre admise sur un siège ; DEUX sièges peuvent la porter (miroir)', () => {
    const une = configPartieDefaut(CIVS[0]);
    une.sieges[1]!.civId = NEUTRAL_CIV;
    expect(configPartieErreur(une)).toBeNull();

    const deux = configPartieDefaut(CIVS[0]);
    deux.sieges[1]!.civId = NEUTRAL_CIV;
    deux.sieges[2]!.civId = NEUTRAL_CIV;
    expect(configPartieErreur(deux)).toBeNull();

    const mixte = configPartieDefaut(NEUTRAL_CIV);
    mixte.sieges[1]!.civId = CIVS[0];
    expect(configPartieErreur(mixte)).toBeNull();

    // Une civ inconnue reste refusée (comportement inchangé).
    const mauvaise = configPartieDefaut('inconnue');
    expect(configPartieErreur(mauvaise)).toMatch(/inconnue/);
  });

  it('e2e duel miroir neutre vs neutre : la partie démarre, les DEUX camps portent la neutre, aucun trait canon', async () => {
    const code = await createGame(
      { id: 'hostneutre', name: 'hostneutre' },
      {
        mapId: 'procedural-40',
        turnTimerMinutes: null,
        isPublic: false,
        playerCount: 2,
        solo: true,
        civId: NEUTRAL_CIV,
        botCivId: NEUTRAL_CIV,
      },
    );
    const dump = await adminDump(code);
    expect(dump.meta!.status).toBe('active');
    expect(dump.meta!.players).toHaveLength(2);
    for (const p of dump.meta!.players) {
      expect(p.civId).toBe(NEUTRAL_CIV);
      // Aucun trait canon ne doit transpirer (ex. caravanesPlus50 égyptien).
      expect(JSON.stringify(p)).not.toMatch(/caravanesPlus50|sciencePlus/);
    }
    // L'état moteur existe : les deux camps ont leur capitale de fondée.
    const joueurs = Object.keys(dump.state?.players ?? {});
    expect(joueurs.length).toBeGreaterThanOrEqual(2);
  });

  it('e2e duel : le défaut SANS choix de civs reste intact (hôte neutre de fait, bot tiré parmi les 16)', async () => {
    const code = await createGame(
      { id: 'hostduel0', name: 'hostduel0' },
      { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, playerCount: 2, solo: true },
    );
    const dump = await adminDump(code);
    expect(dump.meta!.status).toBe('active');
    const hote = dump.meta!.players.find((p) => !p.bot)!;
    const bot = dump.meta!.players.find((p) => p.bot)!;
    expect(hote.civId ?? NEUTRAL_CIV).toBe(NEUTRAL_CIV);
    expect(CIVS).toContain(bot.civId!); // tirage historique — jamais la neutre
  });

  it('e2e config 5 sièges : deux sièges neutres démarrent', async () => {
    const cfg = configPartieDefaut(NEUTRAL_CIV) as ConfigPartie;
    cfg.sieges[1]!.civId = NEUTRAL_CIV;
    const code = await createGame(
      { id: 'host5n', name: 'host5n' },
      { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, config: cfg },
    );
    const dump = await adminDump(code);
    expect(dump.meta!.status).toBe('waiting');
    expect(dump.meta!.players[0]!.civId).toBe(NEUTRAL_CIV);
    const porte = (dump.meta!.settings!.config as ConfigPartie).sieges.filter((s) => s.civId === NEUTRAL_CIV);
    expect(porte).toHaveLength(2);
  });
});
