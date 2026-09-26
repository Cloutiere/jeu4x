/**
 * LOBBY-5 · L1 — validateur de la ConfigPartie (forme structurée à 5 sièges).
 *
 * Le validateur est LA porte d'entrée de toute création/modification de
 * partie nouvelle forme : toute forme invalide est refusée avec un message
 * clair (même contrat que `orderShapeError` — piège qui a coûté une phase).
 */
import { describe, expect, it } from 'vitest';
import { CIVILIZATIONS } from '@game/rules';
import { CLES_PALETTES4, configPartieErreur, configPartieDefaut, premierePaletteLibre, resoutConflitsPalettes } from '@game/shared';

const civ = CIVILIZATIONS.civs['rome'] ? 'rome' : Object.keys(CIVILIZATIONS.civs)[0]!;

function valide(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sieges: [
      { type: 'humain', paletteId: 'bleu-saphir', civId: civ },
      { type: 'bot', paletteId: 'rouge-royal' },
      { type: 'bot', paletteId: 'vert-emeraude' },
      { type: 'bot', paletteId: 'jaune-dor' },
      { type: 'bot', paletteId: 'cuivre-ardent' },
    ],
    civsAleatoires: false,
    topographie: 'archipel',
    ...overrides,
  };
}

describe('ConfigPartie · validateur', () => {
  it('accepte une config valide (5 sièges, palettes distinctes, civs valides)', () => {
    expect(configPartieErreur(valide())).toBeNull();
  });

  it('refuse non-objet / champs manquants', () => {
    expect(configPartieErreur(null)).toMatch(/config/i);
    expect(configPartieErreur('x')).toMatch(/config/i);
    expect(configPartieErreur({})).toMatch(/sieges/i);
  });

  it('refuse un nombre de sièges ≠ 5', () => {
    const c = valide();
    (c.sieges as unknown[]).pop();
    expect(configPartieErreur(c)).toMatch(/5/);
  });

  it('refuse type de siège inconnu', () => {
    const c = valide({ sieges: [
      { type: 'humain', paletteId: 'bleu-saphir' },
      { type: 'zombie', paletteId: 'rouge-royal' },
      { type: 'bot', paletteId: 'vert-emeraude' },
      { type: 'bot', paletteId: 'jaune-dor' },
      { type: 'bot', paletteId: 'cuivre-ardent' },
    ] });
    expect(configPartieErreur(c)).toMatch(/siège 2|siège/i);
  });

  it('refuse palette inconnue (source : accents.json factions4)', () => {
    const c = valide();
    (c.sieges as Array<{ paletteId: string }>)[3]!.paletteId = 'rose-fluo';
    expect(configPartieErreur(c)).toMatch(/couleur|palette/i);
  });

  it('refuse deux sièges à la même palette', () => {
    const c = valide();
    (c.sieges as Array<{ paletteId: string }>)[3]!.paletteId = 'bleu-saphir';
    expect(configPartieErreur(c)).toMatch(/déjà prise|doublon|couleur/i);
  });

  it('refuse civ inconnue et civs en doublon (mode manuel)', () => {
    const c = valide();
    (c.sieges as Array<{ civId?: string }>)[1]!.civId = 'atlantide';
    expect(configPartieErreur(c)).toMatch(/civilisation/i);
    const c2 = valide();
    (c2.sieges as Array<{ civId?: string }>)[1]!.civId = civ;
    expect(configPartieErreur(c2)).toMatch(/déjà|doublon/i);
  });

  it('exige au moins un siège humain', () => {
    const c = valide();
    (c.sieges as Array<{ type: string }>)[0]!.type = 'bot';
    expect(configPartieErreur(c)).toMatch(/humain/i);
  });

  it('mode aléatoire : les civId de sièges sont ignorés (config acceptée)', () => {
    const c = valide({ civsAleatoires: true });
    (c.sieges as Array<{ civId?: string }>)[1]!.civId = civ; // doublon sans importance
    expect(configPartieErreur(c)).toBeNull();
  });

  it('refuse topographie inconnue (liste data-driven TOPOGRAPHIES)', () => {
    expect(configPartieErreur(valide({ topographie: 'trou-noir' }))).toMatch(/topographie/i);
  });

  it('les 7 palettes d\'accents.json sont toutes acceptables', () => {
    expect(CLES_PALETTES4).toHaveLength(6);
    const sieges = CLES_PALETTES4.slice(0, 5).map((paletteId, i) => ({ type: i === 0 ? 'humain' : 'bot', paletteId }));
    expect(configPartieErreur({ sieges, civsAleatoires: false, topographie: 'archipel' })).toBeNull();
  });

  it('configPartieDefaut : hôte siège 1, bots ailleurs, palettes par défaut distinctes', () => {
    const defaut = configPartieDefaut(civ);
    expect(configPartieErreur(defaut)).toBeNull();
    expect(defaut.sieges[0]).toMatchObject({ type: 'humain', civId: civ });
    expect(new Set(defaut.sieges.map((s) => s.paletteId)).size).toBe(5);
  });
});

describe('ConfigPartie · règle des couleurs humain/bot (retour Erik 25/09)', () => {
  it("un humain qui prend la couleur d'un bot dépossède ce bot — réaffectation à la première palette libre", () => {
    const c = valide() as unknown as ReturnType<typeof configPartieDefaut>;
    // l'hôte (humain) prend le Cuivre Ardent du siège 5 (bot)
    (c.sieges[0] as { paletteId: string }).paletteId = 'cuivre-ardent';
    const resolue = resoutConflitsPalettes(c);
    expect((resolue.sieges[0] as { paletteId: string }).paletteId).toBe('cuivre-ardent');
    const palettes = resolue.sieges.map((s) => (s as { paletteId: string }).paletteId);
    expect(new Set(palettes).size).toBe(5); // plus aucun doublon
    // sièges 2-4 inchangés ; le siège 5 reçoit la première palette libre
    expect(palettes[1]).toBe('rouge-royal');
    expect(palettes[4]).toBe('bleu-saphir'); // le bleu libéré par l'hôte
    expect(configPartieErreur(resolue)).toBeNull();
  });

  it("deux bots en doublon (bug constaté dans l'UI) sont aussi résolus", () => {
    const c = valide() as unknown as ReturnType<typeof configPartieDefaut>;
    (c.sieges[1] as { paletteId: string }).paletteId = 'vert-emeraude'; // doublon bot/bot
    const resolue = resoutConflitsPalettes(c);
    const palettes = resolue.sieges.map((s) => (s as { paletteId: string }).paletteId);
    expect(new Set(palettes).size).toBe(5);
  });

  it("les humains gardent leur couleur ; priorité dans l'ordre des sièges", () => {
    const c = configPartieDefaut(null);
    c.sieges[0]!.type = 'humain';
    c.sieges[1]!.type = 'humain';
    const resolue = resoutConflitsPalettes(c);
    expect(resolue.sieges[0]!.paletteId).toBe('bleu-saphir');
    expect(resolue.sieges[1]!.paletteId).toBe('rouge-royal');
  });

  it('première palette libre : priorité à ordre_joueurs4 puis les autres', () => {
    expect(premierePaletteLibre(new Set(['bleu-saphir', 'rouge-royal', 'vert-emeraude', 'jaune-dor', 'cuivre-ardent']))).toBe('ardoise');
    expect(premierePaletteLibre(new Set([...CLES_PALETTES4]))).toBeNull();
  });
});
