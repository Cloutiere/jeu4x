#!/usr/bin/env node
/**
 * JEV-ESCORTE · SONDE RAFFINÉE (canon Erik 12/11 : « (a)+(c) accepter +
 * sonde raffinée ») — compte des VIOLATIONS de règle, pas des pertes.
 *
 * Reconstruction déterministe du cycle de vie depuis les journaux JSONL
 * (événements moteur complets — AUCUNE partie nouvelle, coût 0 $) :
 *   1. ids d'unités RECYCLÉS dédupliqués — le compte suit le cycle de vie
 *      d'UN colon : UnitProduced(colon, p1) → sorties de ville → mort/
 *      capture/fondation ferme le cycle ; un id réapparu appartient à une
 *      NOUVELLE vie (écrasée à sa production) ;
 *   2. captures EN VILLE exclues — un colon jamais sorti que la canon
 *      veut en ville ; sa mort est un échec de DÉFENSE (hors périmètre
 *      escort — consigné, pas compté) ;
 *   3. tué par un ennemi INCONNU au moment de la décision — limite fog
 *      documentée (indévaluable par construction — consigné, pas compté).
 *      « Connu » = l'ennemi était à portée de vision d'une entité p1 dans
 *      le snapshot du tour (visionRadius unité 2, VISION_RADIUS_CITY 3 —
 *      même tables que le moteur ; approximation : bonus de terrain
 *      ignorés), testé au tour de SORTIE et au tour de la jambe fatale —
 *      la décision précède les résolutions du même tour.
 *
 * Violation = colon SUR ROUTE tué par un ennemi CONNU à l'un de ces deux
 * tours (le veto aurait dû le tenir ou le rappeler).
 *
 *   npx tsx bancs/joueur-escorte/sonde-escorte-raffinee.mjs [dossier]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UNIT_TYPES, VISION_RADIUS_CITY, hexDistanceW } from '@game/rules';

const dossier = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), 'journaux');
const SIEGE_JEV = 'p1';
const RAYON_DEFAUT = 2;

let totaux = { violations: 0, pertesEnVille: 0, pertesRouteFog: 0, fondations: 0 };
const details = [];

function visiblePourJev(snapshot, cible, largeur) {
  for (const u of snapshot.units.values()) {
    if (u.owner !== SIEGE_JEV) continue;
    const rayon = UNIT_TYPES[u.type]?.visionRadius ?? RAYON_DEFAUT;
    if (hexDistanceW(u, cible, largeur) <= rayon) return true;
  }
  for (const c of snapshot.cities.values()) {
    if (c.owner !== SIEGE_JEV) continue;
    if (hexDistanceW(c, cible, largeur) <= VISION_RADIUS_CITY) return true;
  }
  return false;
}

function analyser(fichier) {
  const lignes = readFileSync(join(dossier, fichier), 'utf8').split('\n').filter(Boolean);
  let largeur = 40;
  const units = new Map(); // id → { owner, type, q, r }
  const cities = new Map(); // id → { owner, q, r }
  const colons = new Map(); // id → { etat: 'en-ville'|'sorti', sortieTour, idFonde }
  const snapshots = new Map(); // tour → { units, cities } (état À LA DÉCISION)
  let tour = 0;
  const compte = { violations: [], pertesEnVille: [], pertesRouteFog: [], fondations: 0 };

  const poser = (id, owner, type, q, r) => units.set(id, { owner, type, q, r });
  const tileVilleP1 = (q, r) =>
    [...cities.values()].some((c) => c.owner === SIEGE_JEV && c.q === q && c.r === r);
  const suivreColon = (id) => {
    const u = units.get(id);
    if (!u) return;
    colons.set(id, { etat: tileVilleP1(u.q, u.r) ? 'en-ville' : 'sorti', sortieTour: null });
  };

  for (const ligne of lignes) {
    let e;
    try {
      e = JSON.parse(ligne);
    } catch {
      continue;
    }
    if (e.type === 'meta') {
      largeur = e.carte?.largeur ?? largeur;
      continue;
    }
    if (e.type === 'tour') {
      tour = e.tour;
      // Snapshot À LA DÉCISION : état avant les résolutions du tour.
      snapshots.set(tour, {
        units: new Map([...units.entries()].map(([k, v]) => [k, { ...v }])),
        cities: new Map([...cities.entries()].map(([k, v]) => [k, { ...v }])),
      });
      continue;
    }
    const ev = e.evenement;
    if (!ev) continue;
    const t = ev.type;
    if (t === 'UnitProduced') {
      poser(ev.unitId, ev.owner, ev.unitType, ev.at.q, ev.at.r);
      // Id recyclé : une NOUVELLE vie écrase l'ancienne entrée de suivi.
      if (ev.owner === SIEGE_JEV && ev.unitType === 'colon') suivreColon(ev.unitId);
    } else if (t === 'Move' || t === 'Retreat' || t === 'UnitExpelled') {
      const u = units.get(ev.unitId);
      if (u) {
        if (t === 'UnitExpelled') {
          u.q = ev.to.q;
          u.r = ev.to.r;
        } else {
          u.q = ev.to.q;
          u.r = ev.to.r;
        }
        const c = colons.get(ev.unitId);
        if (c && u.owner === SIEGE_JEV && c.etat === 'en-ville' && !tileVilleP1(u.q, u.r)) {
          c.etat = 'sorti';
          c.sortieTour = tour;
        }
      }
    } else if (t === 'BarbarianSpawned') {
      poser(ev.unitId, ev.owner, 'guerrier', ev.at.q, ev.at.r);
    } else if (t === 'ArmyFormed') {
      const chef = units.get(ev.unitId);
      if (chef) {
        chef.q = ev.at.q;
        chef.r = ev.at.r;
        for (const m of ev.memberIds) {
          const mu = units.get(m);
          if (mu) {
            mu.q = ev.at.q;
            mu.r = ev.at.r;
          }
        }
      }
    } else if (t === 'CityFounded') {
      cities.set(ev.cityId, { owner: ev.owner, q: ev.at.q, r: ev.at.r });
      if (ev.owner === SIEGE_JEV) compte.fondations++;
      if (ev.byUnitId && colons.has(ev.byUnitId)) colons.delete(ev.byUnitId); // cycle fermé — fondé, pas perdu
    } else if (t === 'CityCaptured') {
      const c = cities.get(ev.cityId);
      if (c) c.owner = ev.toOwner;
    } else if (t === 'UnitDestroyed') {
      if (ev.owner === SIEGE_JEV && colons.has(ev.unitId)) {
        const suivi = colons.get(ev.unitId);
        const u = units.get(ev.unitId);
        const tuileVille = u ? tileVilleP1(u.q, u.r) : false;
        // Tueur : byUnitId, sinon l'ennemi SUR la case (capture par entrée).
        let tueur = ev.byUnitId ? units.get(ev.byUnitId) : null;
        if (!tueur) {
          for (const x of units.values()) {
            if (x.owner !== SIEGE_JEV && x.q === u?.q && x.r === u?.r) {
              tueur = x;
              break;
            }
          }
        }
        if (suivi.etat === 'en-ville' || tuileVille) {
          compte.pertesEnVille.push({ id: ev.unitId, tour, at: ev.at, cause: ev.cause });
        } else {
          const snapSortie = suivi.sortieTour != null ? snapshots.get(suivi.sortieTour) : null;
          const snapFatale = snapshots.get(tour);
          const connu =
            (tueur && snapSortie && visiblePourJev(snapSortie, tueur, largeur)) ||
            (tueur && snapFatale && visiblePourJev(snapFatale, tueur, largeur));
          const entree = { id: ev.unitId, tour, sortieTour: suivi.sortieTour, at: ev.at, cause: ev.cause, tueur: ev.byUnitId ?? null, connu: !!connu };
          if (connu) compte.violations.push(entree);
          else compte.pertesRouteFog.push(entree);
        }
        colons.delete(ev.unitId); // cycle fermé
      }
      units.delete(ev.unitId);
    } else if (t === 'Captured' && ev.outcome === 'destroyed') {
      // la mort suit en UnitDestroyed — rien ici (déjà déduite).
    }
  }
  return compte;
}

const fichiers = readdirSync(dossier).filter((f) => f.endsWith('.jsonl'));
for (const f of fichiers) {
  const c = analyser(f);
  totaux.violations += c.violations.length;
  totaux.pertesEnVille += c.pertesEnVille.length;
  totaux.pertesRouteFog += c.pertesRouteFog.length;
  totaux.fondations += c.fondations;
  console.log(`${f} : fondations ${c.fondations}, violations ${c.violations.length}, en-ville ${c.pertesEnVille.length}, route-fog ${c.pertesRouteFog.length}`);
  for (const v of [...c.violations, ...c.pertesRouteFog]) console.log(`   ${v.id} tour ${v.tour} (sortie t${v.sortieTour}) cause ${v.cause} tueur ${v.tueur} — ${v.connu ? 'VIOLATION' : 'fog'}`);
}

console.log('\n=== SONDE RAFFINÉE JEV-ESCORTE ===');
console.log(`VIOLATIONS du canon (colon sur route, tueur connu) : ${totaux.violations}  — critère : 0`);
console.log(`Pertes en ville (défense, hors périmètre)          : ${totaux.pertesEnVille}`);
console.log(`Pertes sur route par ennemi hors vision (fog)      : ${totaux.pertesRouteFog}`);
console.log(`Fondations p1 (total ${fichiers.length} parties)               : ${totaux.fondations} (${(totaux.fondations / Math.max(1, fichiers.length)).toFixed(2)}/partie)`);
process.exit(totaux.violations === 0 ? 0 : 1);
