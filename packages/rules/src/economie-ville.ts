/**
 * BANDE-DETAIL (décisions Erik 07/10, D4) — économie de ville à COMPOSANTES
 * NOMMÉES : une seule source pour le gain net de nourriture et les
 * marteaux/tour (+ leurs composantes), partagée moteur/UI. La ville du
 * moteur reste `cityEconomyInputs` (turn.ts — Phase C complète : Anarchie,
 * bonus empire, gouvernements) ; ce helper en est le MIROIR d'affichage
 * (mêmes formules que PanneauVille / bande-ville.rendementsVille) : les
 * infobulles de la bannière expliquent les chiffres SANS les recalculer
 * autrement. Pur (ne mute jamais l'état).
 */
import { BUILDINGS } from './data.js';
import { tileYield } from './economy.js';
import { interiorCitizenFor, interiorCountOf } from './growth.js';
import { tileKeyOf } from './hex.js';
import type { City, GameState } from './state.js';

/** Composantes nommées de l'économie courante d'une ville. */
export interface EconomieVilleDetail {
  /** Nourriture produite par tour (centre-ville + tuiles travaillées). */
  recolte: number;
  /** Consommation de nourriture — 0 : la consommation 7i D1 est abrogée
   *  (surplus = nourriture produite) ; le champ reste nommé pour la ligne
   *  de calcul des infobulles (« récolte − consommation »). */
  consommation: number;
  /** gainNet = recolte − consommation. */
  gainNet: number;
  /** Production BRUTE (avant multiplicateurs) : centre-ville + tuiles
   *  travaillées + citoyens intérieurs. */
  prodBrut: number;
  /** Multiplicateur bâtiments/merveilles (Usine ×2…) — 1 sans bonus. */
  bonusBatimentsMult: number;
  /** Nom du bâtiment portant le meilleur multiplicateur, `null` si ×1. */
  bonusBatimentsNom: string | null;
  /** Bonus de population 1 + 0,25 × (pop − 1) (R-63 🔶). */
  bonusPopMult: number;
  /** Marteaux/tour finaux — ⌊prodBrut × bonusBatimentsMult × bonusPopMult⌋. */
  prodPerTurn: number;
}

/** `civOrPlayer` : même contrat que tileYield — l'UI passe { civId, era },
 *  le moteur passe le joueur (contextes R-149). */
export function economieVilleDetail(
  state: GameState,
  city: City,
  workedTiles: readonly string[],
  allTechs: readonly string[] = [],
): EconomieVilleDetail {
  const p = state.players[city.owner];
  const civ = p && p.civId !== 'neutre' ? { civId: p.civId, era: p.era } : undefined;
  const techs = p?.techsUnlocked ?? [];
  const tier = interiorCitizenFor(city.pop);
  const interior = interiorCountOf(city.pop, workedTiles.length);
  const base =
    tileYield(state.map, city.buildings, tileKeyOf(city), techs, city.wonders, allTechs, civ) ??
    { food: 0, production: 0, commerce: 0 };
  let recolte = base.food;
  let brut = base.production;
  for (const key of workedTiles) {
    const y = tileYield(state.map, city.buildings, key, techs, city.wonders, allTechs);
    if (!y) continue;
    recolte += y.food;
    brut += y.production;
  }
  brut += interior * tier.production;
  let bonusBatimentsMult = 1;
  let bonusBatimentsNom: string | null = null;
  for (const b of city.buildings) {
    const mult = BUILDINGS[b]?.productionMult ?? 1;
    if (mult > bonusBatimentsMult) {
      bonusBatimentsMult = mult;
      bonusBatimentsNom = BUILDINGS[b]?.name ?? b;
    }
  }
  const bonusPopMult = 1 + 0.25 * (city.pop - 1);
  return {
    recolte,
    consommation: 0,
    gainNet: recolte,
    prodBrut: brut,
    bonusBatimentsMult,
    bonusBatimentsNom,
    bonusPopMult,
    prodPerTurn: Math.floor(brut * bonusBatimentsMult * bonusPopMult),
  };
}
