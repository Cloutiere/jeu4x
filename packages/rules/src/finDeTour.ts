/**
 * FIN-DE-TOUR-PRODUCTION — blocages de fin de tour (spécification d'Erik du
 * 18/09). Le joueur NE PEUT PAS finaliser son tour s'il laisse des capacités
 * sans emploi :
 *  - PRODUCTION : une ville qui génère des marteaux (production/tour > 0) OU
 *    qui porte un résiduel de marteaux (réserve permanente C7
 *    `pendingSalvage`) doit avoir une production sélectionnée ;
 *  - RECHERCHE : si le joueur produit de la science (science/tour > 0) OU a
 *    des points de recherche non utilisés (`scienceStored` — bonus de hutte,
 *    réserve R-85) il doit avoir une recherche sélectionnée.
 *
 * R-134 (confirmée par Erik le 18/09) : le SURPLUS de recherche à la
 * complétion reste converti 1:1 en or — il ne devient JAMAIS un résiduel. Le
 * résiduel de fin de tour est exclusivement la réserve `scienceStored` (science
 * accumulée sans tech choisie, ex. une hutte dont le bonus est des points de
 * recherche) — un tour peut donc se terminer avec des points en réserve, mais
 * seulement APRÈS sélection d'une recherche.
 *
 * Le prédicat est PUR et déterministe : consommé par l'UI (bouton « Fin de
 * tour » désactivé + libellés) ET par la validation serveur du EndTurn
 * (source unique). Le blocage est PRÉ-résolution (phase « orders »).
 */
import { TECHS, prereqsMet } from './techs.js';
import type { CityId, GameState, Order, PlayerId } from './state.js';
import { allKnownTechs } from './state.js';
import { cityEconomyInputs } from './turn.js';

export type BlocageFinDeTour =
  | { kind: 'production'; cityId: CityId; reason: string }
  | { kind: 'recherche'; reason: string; points: number };

/**
 * Arbre de recherche ÉPUISÉ : plus aucune technologie disponible (non
 * débloquée ET prérequis satisfaits) — le blocage recherche est levé.
 */
export function arbreRechercheEpuise(player: { techsUnlocked: string[] }): boolean {
  for (const tech of Object.values(TECHS)) {
    if (!player.techsUnlocked.includes(tech.id) && prereqsMet(tech, player.techsUnlocked)) return false;
  }
  return true;
}

/**
 * Prédicat pur : liste des blocages de fin de tour du joueur (ordre
 * déterministe — villes par id croissant R-81, recherche en dernier).
 * `orders` : les BROUILLONS d'ordres du joueur (SetProduction/SetWorkedTile ne
 * sont appliqués qu'à la résolution — un SetProduction en file débloque déjà
 * sa ville, miroir de l'aperçu UI). Sans blocage, le EndTurn est libre (les
 * unités sans ordre restent régies par le dialogue UI existant, hors moteur).
 */
export function blocagesFinDeTour(st: GameState, playerId: PlayerId, orders: readonly Order[] = []): BlocageFinDeTour[] {
  const player = st.players[playerId];
  if (!player) return [];
  const blocages: BlocageFinDeTour[] = [];
  const allTechs = allKnownTechs(st);
  const myCities = Object.values(st.cities)
    .filter((c) => c.owner === playerId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const city of myCities) {
    const productionEnFile =
      !!city.production || orders.some((o) => o.type === 'SetProduction' && o.cityId === city.id);
    if (productionEnFile) continue; // une production sélectionnée débloque la ville
    const inputs = cityEconomyInputs(st, city, allTechs);
    if (inputs.production > 0) {
      blocages.push({ kind: 'production', cityId: city.id, reason: `${inputs.production} marteaux/tour` });
    } else if (city.pendingSalvage > 0) {
      blocages.push({ kind: 'production', cityId: city.id, reason: `${city.pendingSalvage} marteaux en réserve (C7)` });
    }
    // Ville à 0 marteaux sans réserve : jamais bloquée.
  }
  if (!player.researching) {
    const scienceParTour = myCities.reduce((sum, c) => sum + cityEconomyInputs(st, c, allTechs).science, 0);
    const residuel = player.scienceStored ?? 0;
    if ((scienceParTour > 0 || residuel > 0) && !arbreRechercheEpuise(player)) {
      blocages.push({
        kind: 'recherche',
        reason:
          residuel > 0
            ? `${residuel} point(s) de recherche en attente`
            : `${scienceParTour} science/tour sans technologie sélectionnée`,
        points: residuel,
      });
    }
  }
  return blocages;
}

/**
 * Libellé pédagogique d'un blocage (UI + rejet serveur — même texte).
 * Exemples : « Ville1 : sélectionnez une production (5 marteaux/tour) »,
 * « Recherche : sélectionnez une technologie (+20 points en attente) ».
 */
export function libelleBlocageFinDeTour(st: GameState, blocage: BlocageFinDeTour): string {
  if (blocage.kind === 'production') {
    const city = st.cities[blocage.cityId];
    const name = city?.name ?? blocage.cityId;
    return `${name} : sélectionnez une production (${blocage.reason})`;
  }
  return `Recherche : sélectionnez une technologie (+${blocage.points} points en attente — ${blocage.reason})`;
}

/** Liste formatée pour le rejet serveur du EndTurn bloqué. */
export function formatBlocagesFinDeTour(st: GameState, blocages: BlocageFinDeTour[]): string {
  return `fin de tour bloquée — ${blocages.map((b) => libelleBlocageFinDeTour(st, b)).join(' ; ')}`;
}
