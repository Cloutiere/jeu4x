/**
 * Score d'empire à horizon fixe (HANDOFF-JEV-V4 D3) — la métrique du
 * classement des 16 civs. Calcul PUR sur l'état final du moteur :
 *   score = villes×W1 + population×W2 + techs complétées×W3
 *           + merveilles×W4 + trésorerie/W5
 * Pondérations data-driven (config.score de questions.json, défauts
 * 10/2/30/100/10). Le score NE REMPLACE PAS les victoires : il classe les
 * parties non décidées au plafond.
 */

/** Défauts simples (identiques à config.score de questions.json). */
export const POIDS_DEFAUT = { villes: 10, pop: 2, techs: 30, merveilles: 100, divTresorerie: 10 };

/**
 * Score d'un joueur sur l'état final.
 * @returns {{ total: number, composantes: { villes, pop, techs, merveilles, tresorerie } }}
 */
export function scoreEmpire(etat, playerId, poids = POIDS_DEFAUT) {
  const p = poids ?? POIDS_DEFAUT;
  const villes = Object.values(etat.cities ?? {}).filter((c) => c.owner === playerId);
  const pop = villes.reduce((s, c) => s + (c.pop ?? 0), 0);
  const techs = etat.players?.[playerId]?.techsUnlocked?.length ?? 0;
  // Une merveille par ville au plus (city.wonder — R-129 : non bâtie ailleurs).
  const merveilles = villes.reduce((s, c) => s + (c.wonder ? 1 : 0), 0);
  const tresorerie = Math.max(0, etat.players?.[playerId]?.treasury ?? 0);
  const total =
    villes.length * p.villes +
    pop * p.pop +
    techs * p.techs +
    merveilles * p.merveilles +
    Math.floor(tresorerie / Math.max(1, p.divTresorerie));
  return {
    total,
    composantes: { villes: villes.length, pop, techs, merveilles, tresorerie },
  };
}
