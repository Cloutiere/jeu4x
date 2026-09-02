/**
 * Phase 6c — Outil de labo : comptage des ressources par type et par terrain.
 *
 * Demande d'Erik (handoff 6c) : il inspectera personnellement la PRÉSENCE de
 * chaque ressource sur les cartes générées — le panneau du labo #/progen
 * s'appuie sur ce comptage pur. Toutes les ressources de resources.json
 * figurent au tableau, y compris à ZÉRO (une absence est exactement ce que
 * l'inspection doit révéler). Pur, déterministe : tris (id) / (terrain) croissants.
 */
import { RESOURCES } from '../data.js';
import { tileKeyOf } from '../hex.js';
import type { LoadedMap } from '../map.js';

export interface ResourceCountRow {
  id: string;
  name: string;
  /** Nombre de poses par terrain (seuls les terrains réellement porteurs —
   *  au moins une pose sur la carte — sont listés). */
  byTerrain: Record<string, number>;
  total: number;
}

export interface ResourceTerrainCounts {
  /** Une ligne par ressource connue (tri (id) croissant), zéros inclus. */
  byId: ResourceCountRow[];
  /** Toutes ressources confondues, par terrain (tri (terrain) croissant). */
  byTerrain: Record<string, number>;
  total: number;
}

/** Compte les poses de ressources de `map` par id de ressource et par terrain. */
export function countResourcesByTerrain(map: LoadedMap): ResourceTerrainCounts {
  const perId = new Map<string, Map<string, number>>();
  for (const id of Object.keys(RESOURCES).sort()) perId.set(id, new Map());
  for (const r of map.resources) {
    const per = perId.get(r.id);
    if (!per) continue; // id inconnu : hors données (parseMap valide déjà)
    const t = map.terrain[tileKeyOf({ q: r.q, r: r.r })];
    if (!t) continue;
    per.set(t, (per.get(t) ?? 0) + 1);
  }
  const byTerrain: Record<string, number> = {};
  let total = 0;
  const byId: ResourceCountRow[] = [...perId.entries()].map(([id, per]) => {
    const rowByTerrain: Record<string, number> = {};
    let rowTotal = 0;
    for (const [t, n] of [...per.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      rowByTerrain[t] = n;
      byTerrain[t] = (byTerrain[t] ?? 0) + n;
      rowTotal += n;
    }
    total += rowTotal;
    return { id, name: RESOURCES[id]!.name, byTerrain: rowByTerrain, total: rowTotal };
  });
  return { byId, byTerrain, total };
}
