/**
 * Condensé d'état pour Jev (HANDOFF-JEV-POC D6) — « fetch precisely, judge
 * cheaply » (directive n°2 du doc TypeSafe). Entrée : l'état FILTRÉ fog
 * (getFilteredState) de la nation ; sortie : un objet JSON ≤ ~2000 jetons.
 * Zéro arithmétique laissée au modèle : distances, tris et valeurs sont
 * précalculés ici (directive n°2 : exclure l'arithmétique du modèle).
 */
import { hexDistance, MIN_CITY_DISTANCE, TERRAINS, UNIT_TYPES } from '@game/rules';

const RAYON_MENACE = 5;
const MAX_CANDIDATS = 5;

function valeurTerrain(tile) {
  if (!tile) return 0;
  const t = TERRAINS[tile.terrain];
  if (!t || !t.passable) return 0;
  return (t.yields?.food ?? 0) + (t.yields?.production ?? 0) + (t.yields?.commerce ?? 0);
}

/** Sites de fondation viables : terre passable, à ≥ MIN_CITY_DISTANCE de
 * TOUTE ville connue, triés par valeur (décroissante) puis distance (croissante). */
export function sitesFondation(etatFiltre, moi) {
  const villes = Object.values(etatFiltre.cities ?? {});
  const colonnes = Object.values(etatFiltre.units ?? {}).filter(
    (u) => u.owner === moi && UNIT_TYPES[u.type]?.canFoundCity,
  );
  if (colonnes.length === 0) return [];
  const sites = [];
  for (const [cle, tile] of Object.entries(etatFiltre.map ?? {})) {
    const [q, r] = cle.split(',').map(Number);
    const valeur = valeurTerrain(tile);
    if (valeur <= 0) continue;
    let ok = true;
    for (const v of villes) {
      if (hexDistance({ q, r }, { q: v.q, r: v.r }) < MIN_CITY_DISTANCE + 1) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const colon = colonnes.reduce((a, b) =>
      hexDistance({ q, r }, { q: a.q, r: a.r }) <= hexDistance({ q, r }, { q: b.q, r: b.r }) ? a : b,
    );
    sites.push({ case: cle, q, r, valeur, distance: hexDistance({ q, r }, { q: colon.q, r: colon.r }) });
  }
  sites.sort((a, b) => b.valeur - a.valeur || a.distance - b.distance || a.case.localeCompare(b.case));
  return sites.slice(0, MAX_CANDIDATS);
}

/** Cibles d'attaque visibles : unités et villes ennemies, triées par distance
 * croissante depuis la meilleure unité de combat amie. */
export function ciblesAttaque(etatFiltre, moi) {
  const attaquants = Object.values(etatFiltre.units ?? {}).filter(
    (u) => u.owner === moi && (UNIT_TYPES[u.type]?.canAttack ?? false) && !u.aboard,
  );
  if (attaquants.length === 0) return [];
  const base = attaquants.reduce((a, b) =>
    (UNIT_TYPES[a.type]?.attack ?? 0) * a.hp >= (UNIT_TYPES[b.type]?.attack ?? 0) * b.hp ? a : b,
  );
  const cibles = [];
  for (const u of Object.values(etatFiltre.units ?? {})) {
    if (u.owner === moi || u.aboard) continue;
    cibles.push({ case: `${u.q},${u.r}`, q: u.q, r: u.r, genre: 'unite', type: u.type, distance: hexDistance(base, u) });
  }
  for (const v of Object.values(etatFiltre.cities ?? {})) {
    if (v.owner === moi) continue;
    cibles.push({ case: `${v.q},${v.r}`, q: v.q, r: v.r, genre: 'ville', type: v.capital ? 'capitale' : 'ville', distance: hexDistance(base, v) });
  }
  cibles.sort((a, b) => a.distance - b.distance || a.case.localeCompare(b.case));
  return cibles.slice(0, MAX_CANDIDATS);
}

export function condenserEtat(etatFiltre, moi) {
  const joueurs = etatFiltre.players ?? {};
  const me = joueurs[moi];
  const autres = Object.entries(joueurs).filter(([id]) => id !== moi);
  const mesVilles = Object.values(etatFiltre.cities ?? {}).filter((v) => v.owner === moi);
  const mesUnites = Object.values(etatFiltre.units ?? {}).filter((u) => u.owner === moi && !u.aboard);
  const ennemiesVisibles = Object.values(etatFiltre.units ?? {}).filter((u) => u.owner !== moi && !u.aboard);
  const villesEnnemuesVisibles = Object.values(etatFiltre.cities ?? {}).filter((v) => v.owner !== moi);

  const menaces = ennemiesVisibles
    .map((u) => ({
      distanceVilleLaPlusProche: Math.min(...mesVilles.map((v) => hexDistance(u, v)), 99),
      type: u.type,
    }))
    .filter((m) => m.distanceVilleLaPlusProche <= RAYON_MENACE)
    .sort((a, b) => a.distanceVilleLaPlusProche - b.distanceVilleLaPlusProche)
    .slice(0, MAX_CANDIDATS);

  const condense = {
    tour: etatFiltre.turn,
    empire: {
      or: me?.treasury ?? 0,
      science: me?.science ?? 0,
      ratioScience: me?.scienceRatio ?? 0.5,
      regime: me?.government ?? null,
      era: me?.era ?? null,
      techsConnues: me?.techsUnlocked?.length ?? 0,
      rechercheEnCours: me?.researching ?? null,
      villes: mesVilles.map((v) => ({
        id: v.id,
        case: `${v.q},${v.r}`,
        pop: v.pop,
        capitale: v.capital,
        production: v.production ? `${v.production.item.kind}:${v.production.item.id}` : null,
        batiments: v.buildings?.length ?? 0,
      })),
      unites: mesUnites.map((u) => ({
        type: u.type,
        case: `${u.q},${u.r}`,
        pv: `${u.hp}/${UNIT_TYPES[u.type]?.hpMax ?? '?'}`,
        pm: u.mp,
        fortifiee: u.fortified,
      })),
    },
    monde: {
      ennemisVisibles: ennemiesVisibles.map((u) => ({ type: u.type, case: `${u.q},${u.r}` })),
      villesEnnemuesVisibles: villesEnnemuesVisibles.map((v) => ({
        civ: joueurs[v.owner]?.civId ?? v.owner,
        case: `${v.q},${v.r}`,
        capitale: v.capital,
      })),
      rivaux: autres.map(([id, p]) => ({ civ: p.civId, era: p.era, techsConnues: p.techsUnlocked?.length ?? 0 })),
    },
    menaces,
    candidats: {
      fondation: sitesFondation(etatFiltre, moi),
      attaque: ciblesAttaque(etatFiltre, moi),
    },
  };
  return condense;
}
