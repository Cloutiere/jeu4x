/**
 * MENU-VILLE-QUEUE · D1/D2 — file de production EFFECTIVE côté client.
 *
 * Les opérations de file (QueueProduction / RemoveFromQueue / ReorderQueue)
 * sont des ordres de RÉSOLUTION : le panneau doit montrer la file telle que
 * le moteur la constituera (état + brouillons de CE joueur, dans l'ordre de
 * soumission — même sémantique de commandes que `applyQueueOps` du moteur,
 * miroir d'`effectiveWorkedTiles` pour les tuiles travaillées).
 */
import { BUILDINGS, FILE_PRODUCTION_PROFONDEUR, UNIT_TYPES, WONDERS } from '@game/rules';
import type { CityId, ProductionItem } from '@game/rules';
import type { Order } from '@game/shared';
import type { GameView } from './gameClient.js';
import { myEngineId } from './render/interaction.js';

/** Un rang de la file AFFICHÉE (tête avec sa progression, puis attente). */
export interface RangFile {
  item: ProductionItem;
  /** Progression de marteaux (la tête uniquement — les items d'attente
   *  ne sont jamais entamés). */
  progress: number;
}

export interface FileEffective {
  /** File AFFICHÉE : index 0 = tête (production courante). */
  rangs: RangFile[];
  /** La ville est-elle à moi (file modifiable) ? */
  mine: boolean;
  /** Profondeur max data-driven (FILE_PRODUCTION_PROFONDEUR du moteur). */
  profondeur: number;
}

/** Coût en marteaux d'un item de file — les TROIS kinds : unité (unitType),
 *  bâtiment (BUILDINGS) et MERVEILLE (WONDERS — le panneau affichait
 *  « Infinity » pour elles, MERVEILLE-COUT-FILE Erik 05/10). null si l'item
 *  est inconnu des données (repli honnête côté UI). Pur. */
export function coutItem(item: ProductionItem): number | null {
  if (item.kind === 'unit') return UNIT_TYPES[item.id]?.cost ?? null;
  if (item.kind === 'wonder') return WONDERS[item.id]?.cost ?? null;
  return BUILDINGS[item.id]?.cost ?? null;
}

/** Nom affiché d'un item de file — mêmes TROIS tables que `coutItem` (sans
 *  elle, une merveille tombait sur son id brut : « stonehenge »). Pur. */
export function nomItem(item: ProductionItem): string {
  if (item.kind === 'unit') return UNIT_TYPES[item.id]?.name ?? item.id;
  if (item.kind === 'wonder') return WONDERS[item.id]?.name ?? item.id;
  return BUILDINGS[item.id]?.name ?? item.id;
}

/** Applique les brouillons d'opérations de file d'une ville — MÊME sémantique
 *  que le moteur (turn.ts `applyQueueOps`) : commandes dans l'ordre, chaque
 *  opération voit le résultat de la précédente ; indices sur la file AFFICHÉE
 *  pour RemoveFromQueue, sur la file d'ATTENTE pour ReorderQueue. Pur. */
export function fileEffective(view: GameView, cityId: CityId, profondeur: number = FILE_PRODUCTION_PROFONDEUR): FileEffective {
  const city = view.state?.cities[cityId] ?? null;
  if (!city) return { rangs: [], mine: false, profondeur };
  // Rangs locaux (copies — jamais l'état du store).
  let tete: RangFile | null = city.production ? { item: { ...city.production.item }, progress: city.production.progress } : null;
  let attente: ProductionItem[] = (city.queue ?? []).map((i) => ({ ...i }));
  for (const order of view.orders) {
    if (!('cityId' in order) || order.cityId !== cityId) continue;
    if (order.type === 'SetProduction') {
      // Forme historique : remplace la tête, vide la file (miroir moteur).
      tete = { item: { ...order.item }, progress: tete?.progress ?? 0 };
      attente = [];
    } else if (order.type === 'QueueProduction') {
      if (tete === null) tete = { item: { ...order.item }, progress: 0 };
      else if (1 + attente.length < profondeur) attente = [...attente, { ...order.item }];
    } else if (order.type === 'RemoveFromQueue') {
      const i = order.index;
      if (!Number.isInteger(i) || i < 0 || i > attente.length) continue;
      if (i === 0 && tete) {
        tete = attente.length > 0 ? { item: attente[0]!, progress: 0 } : null;
        attente = attente.slice(1);
      } else {
        attente = attente.filter((_, k) => k !== i - 1);
      }
    } else if (order.type === 'ReorderQueue') {
      const { from, to } = order;
      if (!Number.isInteger(from) || !Number.isInteger(to) || from === to || from < 0 || to < 0 || from >= attente.length || to >= attente.length) continue;
      const next = [...attente];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      attente = next;
    }
  }
  const rangs: RangFile[] = tete ? [tete, ...attente.map((item) => ({ item, progress: 0 }))] : attente.map((item) => ({ item, progress: 0 }));
  const moteur = myEngineId(view);
  return { rangs, mine: city.owner !== null && city.owner === moteur, profondeur };
}
