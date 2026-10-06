/**
 * HANDOFF-CHRONIQUES — journal joueur UNIFIÉ « Chroniques » (tranche 1).
 * Remplace Historique.svelte (toasts client) + Journal.svelte (événements
 * bruts) : UNE entrée lisible par événement notable, 7 catégories à icônes
 * filtrables (D2), ZÉRO coordonnée — localisation par noms (D3), merveilles
 * adverses masquées à la nation (D4), artefact adverse = rumeur sans lieu
 * (D4), UNE entrée par combat avec issue et pertes (D5), groupé par tour,
 * plafond 500 FIFO et persistance locale par partie (D7).
 *
 * Zéro gameplay : présentation seule. Moteur/serveur/protocole intouchés —
 * le flux consommé est celui déjà filtré fog par le serveur.
 */
import { writable } from 'svelte/store';
import type { GameEvent } from '@game/shared';
import { BUILDINGS, TECHS, UNIT_TYPES, WONDERS, hexDistanceW, SANS_WRAP } from '@game/rules';
import type { Hex } from '@game/rules';
import { artefactEffectLabel, civName, greatPersonLabel, hutRewardLabel } from './labels.js';

// ---------------------------------------------------------------------------
// Catégories (D2)
// ---------------------------------------------------------------------------

export type Categorie = 'combats' | 'empire' | 'decouvertes' | 'merveilles' | 'artefacts' | 'menaces' | 'monde';

export const CATEGORIES: Array<{ id: Categorie; icone: string; label: string }> = [
  { id: 'combats', icone: '⚔', label: 'Combats' },
  { id: 'empire', icone: '🏛', label: 'Empire' },
  { id: 'decouvertes', icone: '🔬', label: 'Découvertes' },
  { id: 'merveilles', icone: '👑', label: 'Merveilles' },
  { id: 'artefacts', icone: '🗿', label: 'Artefacts' },
  { id: 'menaces', icone: '💥', label: 'Menaces' },
  { id: 'monde', icone: '🕊', label: 'Monde' },
];

/** Plafond de la Chronique (D7) — FIFO, les plus anciennes entrées éjectées. */
export const CHRONIQUE_MAX = 500;

export interface EntreeChronique {
  /** Identifiant unique et stable (clé de each Svelte + persistance). */
  id: string;
  tour: number;
  cat: Categorie;
  texte: string;
  ton: 'good' | 'bad' | 'info';
  /** Case connue/visible pour recentrage (D3) — null = entrée NON cliquable. */
  hex: Hex | null;
  /** Case de combat — clic = ouverture du rapport RAPPORT-ENGAGEMENT (D5). */
  combatHex: Hex | null;
}

/**
 * Contexte de résolution des noms (D3) — fourni par Game.svelte (état + nom
 * de joueur + vision). Toutes les fonctions restent pures.
 */
export interface ContexteChronique {
  /** engineId du joueur qui lit la Chronique. */
  moi: string;
  /** Nom affiché d'un joueur (nom humain/bot, déjà lisible). */
  nomJoueur: (id: string) => string;
  /** civId d'un joueur (nommer la nation adverse — « Les Espagnols »). */
  civDe: (id: string) => string | null;
  /** Ville connue par id (nom affiché, D3 — jamais l'id brut si évitable). */
  ville: (cityId: string) => { nom: string; q: number; r: number; owner: string } | null;
  /** Villes connues (miennes + visibles) pour la localisation « près de X ». */
  villes: () => Array<{ nom: string; q: number; r: number; owner: string }>;
  /** Unité par id (pré-état d'abord — les détruites n'existent plus). */
  unite: (unitId: string) => { type: string; owner: string } | null;
  /** Case actuellement visible (vision du joueur). */
  visible: (hex: Hex) => boolean;
}

// ---------------------------------------------------------------------------
// Aides de nommage (D3 — zéro coordonnée)
// ---------------------------------------------------------------------------

/** Nom fr d'un type d'unité (id brut en dernier recours — états migrés). */
function nomTypeUnite(typeId: string): string {
  return UNIT_TYPES[typeId]?.name ?? typeId;
}

/** Nom fr d'un bâtiment / merveille / tech (id brut en dernier recours). */
function nomBuilding(id: string): string {
  return BUILDINGS[id]?.name ?? id;
}
function nomWonder(id: string): string {
  return WONDERS[id]?.name ?? id;
}
function nomTech(id: string): string {
  return TECHS[id]?.name ?? id;
}

/** « ton Guerrier » (moi) / « Guerrier de Bot 1 » / « Barbare ». */
function nomUniteAvecOwner(unitId: string, ctx: ContexteChronique): string {
  const u = ctx.unite(unitId);
  if (!u) return unitId;
  if (u.owner === ctx.moi) return `ton ${nomTypeUnite(u.type)}`;
  if (u.owner === 'barbare') return `Barbare (${nomTypeUnite(u.type)})`;
  return `${nomTypeUnite(u.type)} de ${ctx.nomJoueur(u.owner)}`;
}

/** Nom de NATION (D4) — « les Espagnols » : nom de civ, sinon nom de joueur. */
function nomNation(playerId: string, ctx: ContexteChronique): string {
  const civ = ctx.civDe(playerId);
  if (civ && civ !== 'neutre') return civName(civ);
  return ctx.nomJoueur(playerId);
}

/** Nom de PEUPLE (formulation D4 « Les Espagnols ont trouvé une relique ») —
 *  canon = nom de civ (« Espagne »), forme plurielle par table ; repli :
 *  nom de joueur avec verbe au singulier (le texte s'adapte alors). */
const PEUPLES: Record<string, string> = {
  amerique: 'Américains',
  arabie: 'Arabes',
  azteques: 'Aztèques',
  chine: 'Chinois',
  egypte: 'Égyptiens',
  angleterre: 'Anglais',
  france: 'Français',
  allemagne: 'Allemands',
  grece: 'Grecs',
  inde: 'Indiens',
  japon: 'Japonais',
  mongolie: 'Mongols',
  rome: 'Romains',
  russie: 'Russes',
  espagne: 'Espagnols',
  zoulous: 'Zoulous',
};

/** « Les Espagnols ont… » (peuple) ou « Bot a… » (joueur) — sujet de phrase. */
function sujetNation(playerId: string, ctx: ContexteChronique): { sujet: string; pluriel: boolean } {
  const civ = ctx.civDe(playerId);
  if (civ && civ !== 'neutre' && PEUPLES[civ]) return { sujet: `Les ${PEUPLES[civ]}`, pluriel: true };
  return { sujet: nomNation(playerId, ctx), pluriel: false };
}

/**
 * Localisation D3 « près de VilleN » : la ville la plus proche connue
 * (mienne ou visible) dans un rayon de 4. '' si rien de nommable.
 */
function presDe(hex: Hex, ctx: ContexteChronique): string {
  let meilleure: { nom: string; d: number } | null = null;
  for (const v of ctx.villes()) {
    // Localisation cosmétique 🔶 : distance plate (le wrap ne change le nommage qu'à la couture).
    const d = hexDistanceW(hex, { q: v.q, r: v.r }, SANS_WRAP);
    if (d <= 4 && (meilleure === null || d < meilleure.d)) meilleure = { nom: v.nom, d };
  }
  return meilleure ? ` près de ${meilleure.nom}` : '';
}

/** Case cliquable (D3) : récente, connue ET visible — sinon null. */
function hexCliquable(hex: Hex | undefined, ctx: ContexteChronique): Hex | null {
  if (!hex || !ctx.visible(hex)) return null;
  return hex;
}

// ---------------------------------------------------------------------------
// Table de mapping (§3) — data-driven, un case unique.
// ---------------------------------------------------------------------------

/** Types exclus (bruit, §3) — ne produisent JAMAIS d'entrée directe. */
const EXCLUS: ReadonlySet<string> = new Set(['Move', 'TurnResolved', 'CombatExchange', 'PopulationGrew']);

/** Causes de destruction rattachées à un COMBAT (agrégation D5). */
const CAUSES_COMBAT: ReadonlySet<string> = new Set(['combat', 'collision', 'capture', 'sunk']);

/**
 * Événements → entrées de Chronique. PURE. Les échanges (CombatExchange) sont
 * agrégés dans l'entrée du combat de leur case (D5) ; exclus (§3) silencieux.
 * `tour` : tour affiché (tour courant de la vue à l'arrivée des événements).
 */
export function entreesChronique(events: GameEvent[], ctx: ContexteChronique, tour: number): EntreeChronique[] {
  const out: EntreeChronique[] = [];
  let sousSeq = 0;
  // id dérivé du seq MOTEUR (stable au rechargement — les missedEvents
  // rejoués régénèrent les mêmes ids, dédoublonnés au pousser).
  const pousser = (cat: Categorie, texte: string, ton: 'good' | 'bad' | 'info', seq: number | null, hex: Hex | null = null, combatHex: Hex | null = null): void => {
    out.push({ id: seq !== null ? `e${seq}` : `c${tour}-${sousSeq++}`, tour, cat, texte, ton, hex, combatHex });
  };

  // Agrégation des combats (D5) : UNE entrée par case de combat. Clé "q,r"
  // → participants, pertes, replis. Attack ouvre le groupe ; UnitDestroyed
  // (cause combat), Retreat et Captured le rejoignent.
  const combats = new Map<string, { hex: Hex; seq: number; attaques: Array<{ a: string; d: string }>; pertes: string[]; replis: string[] }>();
  const groupeCombat = (hex: Hex, seq: number) => {
    const cle = `${hex.q},${hex.r}`;
    let g = combats.get(cle);
    if (!g) {
      g = { hex, seq, attaques: [], pertes: [], replis: [] };
      combats.set(cle, g);
    }
    return g;
  };

  for (const ev of events) {
    if (EXCLUS.has(ev.type)) continue;
    switch (ev.type) {
      // -------------------------------------------------------------
      // ⚔ Combats (agrégés D5)
      // -------------------------------------------------------------
      case 'Attack':
        groupeCombat(ev.at, ev.seq).attaques.push({ a: ev.attackerId, d: ev.defenderId });
        break;
      case 'UnitDestroyed':
        if (CAUSES_COMBAT.has(ev.cause)) groupeCombat(ev.at, ev.seq).pertes.push(nomUniteAvecOwner(ev.unitId, ctx));
        // cause 'nuke'/'mission' : couvert par CityNuked / SpyMission.
        break;
      case 'Retreat':
        groupeCombat(ev.from, ev.seq).replis.push(nomUniteAvecOwner(ev.unitId, ctx));
        break;
      case 'Captured':
        groupeCombat(ev.at, ev.seq).pertes.push(`${nomUniteAvecOwner(ev.unitId, ctx)} capturée`);
        break;
      case 'MeleeResolved': {
        const g = groupeCombat(ev.at, ev.seq);
        for (const r of ev.results) {
          if (r.role === 'loser') g.pertes.push(nomUniteAvecOwner(r.unitId, ctx));
        }
        break;
      }
      case 'CityCaptured': {
        const ville = ctx.ville(ev.cityId);
        const nom = ville?.nom ?? ev.cityId;
        const sac = ev.plunder ? ` — sac de ville : ${ev.plunder.toLocaleString('fr-FR')} or pillés` : '';
        pousser('combats', `${nom} est prise par ${nomNation(ev.toOwner, ctx)}${sac}`, ev.fromOwner === ctx.moi ? 'bad' : 'info', ev.seq, hexCliquable(ev.at, ctx), hexCliquable(ev.at, ctx));
        if (ev.fromOwner === ctx.moi) pousser('menaces', `${nom} vient de tomber aux mains de ${nomNation(ev.toOwner, ctx)} !`, 'bad', ev.seq, null);
        break;
      }
      case 'VillageDestroyed':
        pousser('combats', `Camp barbare détruit par ${nomNation(ev.byPlayer, ctx)}${presDe(ev.at, ctx)}`, ev.byPlayer === ctx.moi ? 'good' : 'info', ev.seq, hexCliquable(ev.at, ctx), hexCliquable(ev.at, ctx));
        break;
      case 'VillageLooted':
        pousser('combats', `Camp barbare pillé par ${nomNation(ev.byPlayer, ctx)}${presDe(ev.at, ctx)} : ${hutRewardLabel(ev.reward)}`, ev.byPlayer === ctx.moi ? 'good' : 'info', ev.seq, hexCliquable(ev.at, ctx), hexCliquable(ev.at, ctx));
        break;
      case 'CityRazed':
        pousser('menaces', `${ctx.ville(ev.cityId)?.nom ?? ev.cityId} est RASÉE par les barbares`, ev.owner === ctx.moi ? 'bad' : 'info', ev.seq, hexCliquable(ev.at, ctx));
        break;
      case 'NukeLaunched':
        if (ev.outcome === 'detonated') pousser('combats', `☢️ ${nomNation(ev.owner, ctx)} a lancé une frappe nucléaire${presDe(ev.target, ctx)} !`, ev.owner === ctx.moi ? 'info' : 'bad', ev.seq);
        else if (ev.outcome === 'intercepted') pousser('combats', `☢️ ICBM interceptée par une Défense SDI${presDe(ev.at, ctx)} !`, 'good', ev.seq);
        else if (ev.outcome === 'blocked') pousser('combats', `☢️ ICBM bloquée par la Grande Muraille`, 'good', ev.seq);
        // 'refused' : rien à chroniquer (ordre refusé, déjà toasté côté tireur).
        break;
      case 'CityNuked':
        pousser('combats', `☢️ ${ctx.ville(ev.cityId)?.nom ?? ev.cityId} frappée : population ${ev.popAfter}, ${ev.buildingsDestroyed.length} bâtiment(s) détruit(s)`, ev.owner === ctx.moi ? 'bad' : 'info', ev.seq, hexCliquable(ev.at, ctx));
        if (ev.owner === ctx.moi) pousser('menaces', `${ctx.ville(ev.cityId)?.nom ?? ev.cityId} vient de subir une frappe nucléaire !`, 'bad', ev.seq, null);
        break;

      // -------------------------------------------------------------
      // 🏛 Empire (les miennes seulement — §3)
      // -------------------------------------------------------------
      case 'CityFounded':
        if (ev.owner === ctx.moi) pousser('empire', `${ctx.ville(ev.cityId)?.nom ?? ev.cityId} est fondée${ev.capital ? ' — capitale !' : ''}`, 'good', ev.seq, hexCliquable(ev.at, ctx));
        break;
      case 'UnitProduced':
        if (ev.owner === ctx.moi) pousser('empire', `${nomTypeUnite(ev.unitType)} produit à ${ctx.ville(ev.cityId)?.nom ?? ev.cityId}`, 'info', ev.seq, hexCliquable(ev.at, ctx));
        break;
      case 'BuildingCompleted':
        if (ev.owner === ctx.moi) pousser('empire', `${nomBuilding(ev.building)} achevé à ${ctx.ville(ev.cityId)?.nom ?? ev.cityId}`, 'good', ev.seq, hexCliquable(ev.at, ctx));
        break;
      case 'RushBuy':
        if (ev.owner === ctx.moi) pousser('empire', `Achat immédiat à ${ctx.ville(ev.cityId)?.nom ?? ev.cityId} : ${nomWonder(ev.item.id)}/${nomBuilding(ev.item.id)}/${nomTypeUnite(ev.item.id)} pour ${ev.cost.toLocaleString('fr-FR')} or`, 'info', ev.seq);
        break;
      case 'HammerSalvage':
        if (ev.owner === ctx.moi) pousser('empire', `Un rival a achevé ${ev.wonder ? nomWonder(ev.wonder) : 'une merveille'} ! ${ev.amount} marteaux en réserve à ${ctx.ville(ev.cityId)?.nom ?? ev.cityId}`, 'info', ev.seq);
        break;
      case 'Embark':
        if (ev.owner === ctx.moi) pousser('empire', `${nomUniteAvecOwner(ev.unitId, ctx)} embarque à bord de ${nomUniteAvecOwner(ev.transportId, ctx)}`, 'info', ev.seq, hexCliquable(ev.at, ctx));
        break;
      case 'Disembark':
        if (ev.owner === ctx.moi) pousser('empire', `${nomUniteAvecOwner(ev.unitId, ctx)} débarque${presDe(ev.at, ctx)}`, 'info', ev.seq, hexCliquable(ev.at, ctx));
        break;
      case 'ArrivanteRegularisee':
        if (ev.owner === ctx.moi) pousser('empire', `${nomUniteAvecOwner(ev.unitId, ctx)} (arrivante) relogée — la case de ville était occupée par une amie`, 'info', ev.seq);
        break;
      case 'UnitsUpgraded':
        if (ev.player === ctx.moi) pousser('empire', `Atelier de Léonard : ${ev.upgrades.length} unité(s) mise(s) à niveau (${ev.upgrades.map((u) => `${nomTypeUnite(u.from)} → ${nomTypeUnite(u.to)}`).join(', ')})`, 'good', ev.seq);
        break;
      case 'ArmyFormed':
        if (ev.owner === ctx.moi) pousser('empire', `Armée formée${presDe(ev.at, ctx)}`, 'good', ev.seq, hexCliquable(ev.at, ctx));
        break;
      case 'PopulationConsumed':
        if (ev.owner === ctx.moi) pousser('empire', `${ctx.ville(ev.cityId)?.nom ?? ev.cityId} : la production de ${nomTypeUnite(ev.byUnitType)} consomme des citoyens (population ${ev.pop})`, 'info', ev.seq);
        break;

      // -------------------------------------------------------------
      // 🔬 Découvertes
      // -------------------------------------------------------------
      case 'TechResearched':
        if (ev.player === ctx.moi) pousser('decouvertes', `Technologie complétée : ${nomTech(ev.tech)} — déblocages disponibles !`, 'good', ev.seq);
        else { const s2 = sujetNation(ev.player, ctx); pousser('decouvertes', `${s2.sujet} ${s2.pluriel ? 'découvrent' : 'découvre'} ${nomTech(ev.tech)}`, 'info', ev.seq); }
        break;
      case 'FirstDiscovered':
        if (ev.player === ctx.moi) pousser('decouvertes', `Premier découvrir (${nomTech(ev.tech)}) : ${ev.label}${ev.greatPerson ? ` — ${greatPersonLabel(ev.greatPerson)} rejoint votre empire !` : ''}`, 'good', ev.seq);
        else { const s2 = sujetNation(ev.player, ctx); pousser('decouvertes', `${s2.sujet} ${s2.pluriel ? 'découvrent' : 'découvre'} en premier ${nomTech(ev.tech)}`, 'info', ev.seq); }
        break;
      case 'EraChanged':
        pousser('decouvertes', ev.player === ctx.moi ? `Votre empire entre dans l'ère ${nomEre(ev.era)}` : (() => { const s2 = sujetNation(ev.player, ctx); return `${s2.sujet} ${s2.pluriel ? 'entrent' : 'entre'} dans l'ère ${nomEre(ev.era)}`; })(), ev.player === ctx.moi ? 'good' : 'info', ev.seq);
        break;
      case 'GreatPersonSpawned':
        pousser('decouvertes', `${greatPersonLabel(ev.unitType)} apparaît à ${ctx.ville(ev.cityId)?.nom ?? ev.cityId} (${nomNation(ev.owner, ctx)})${ev.canal ? ` — GP de ${ev.canal}` : ''}`, ev.owner === ctx.moi ? 'good' : 'info', ev.seq, ev.owner === ctx.moi ? hexCliquable(ev.at, ctx) : null);
        break;
      case 'InstallPerson':
        if (ev.owner === ctx.moi) pousser('decouvertes', `${greatPersonLabel(ev.unitType)} s'installe à ${ctx.ville(ev.cityId)?.nom ?? ev.cityId}`, 'good', ev.seq, hexCliquable(ev.at, ctx));
        break;
      case 'GreatPersonConsumed':
        if (ev.player === ctx.moi) pousser('decouvertes', `${greatPersonLabel(ev.unitType)} CONSOMMÉ : ${ev.effect}`, 'info', ev.seq);
        else { const s2 = sujetNation(ev.player, ctx); pousser('decouvertes', `${s2.sujet} ${s2.pluriel ? 'consomment' : 'consomme'} un ${greatPersonLabel(ev.unitType)}`, 'info', ev.seq); }
        break;
      case 'GreatPersonStolen':
        pousser('decouvertes', `GP VOLÉ ! ${nomNation(ev.victim, ctx)} perd un Personnage installé au profit de ${nomNation(ev.thief, ctx)}`, ev.victim === ctx.moi ? 'bad' : ev.thief === ctx.moi ? 'good' : 'info', ev.seq);
        break;
      case 'GreatPersonKidnapped':
        pousser('decouvertes', `GP ENLEVÉ ! ${greatPersonLabel(ev.gpType)} transféré de ${nomNation(ev.victim, ctx)} à ${nomNation(ev.thief, ctx)}`, ev.victim === ctx.moi ? 'bad' : ev.thief === ctx.moi ? 'good' : 'info', ev.seq);
        break;
      case 'CultureMilestone':
        if (ev.player === ctx.moi && ev.delta > 0) pousser('decouvertes', `${ev.delta > 0 ? '+' : ''}${ev.delta} jalon culturel (${ev.reason === 'cultureLevel' ? 'palier de culture' : ev.reason === 'wonderBuilt' ? 'merveille construite' : ev.reason === 'wonderCaptured' ? 'merveille capturée' : ev.reason === 'wonderLost' ? 'merveille perdue' : 'frappe nucléaire'}) — total ${ev.total}/20`, 'good', ev.seq);
        break;
      case 'EconomyMilestone':
        if (ev.player === ctx.moi) pousser('decouvertes', `Palier économique — ${ev.threshold.toLocaleString('fr-FR')} or : ${ev.label} !`, 'good', ev.seq);
        else if (ev.reward === 'worldBank') pousser('decouvertes', `${sujetNation(ev.player, ctx).sujet} ont débloqué la Banque mondiale… (victoire économique)`, 'bad', ev.seq);
        break;
      case 'Launch':
        pousser('decouvertes', ev.player === ctx.moi ? 'Vaisseau spatial lancé !' : `${sujetNation(ev.player, ctx).sujet} ont lancé leur Vaisseau spatial…`, ev.player === ctx.moi ? 'good' : 'bad', ev.seq);
        break;

      // -------------------------------------------------------------
      // 👑 Merveilles (toutes nations — adverse masquée à la nation, D4)
      // -------------------------------------------------------------
      case 'WonderCompleted':
        if (ev.owner === ctx.moi) pousser('merveilles', `Merveille achevée : ${nomWonder(ev.wonder)} à ${ctx.ville(ev.cityId)?.nom ?? ev.cityId} (+1 jalon)`, 'good', ev.seq, hexCliquable(ev.at, ctx));
        else { const s2 = sujetNation(ev.owner, ctx); pousser('merveilles', `${s2.sujet} ${s2.pluriel ? 'ont' : 'a'} achevé la merveille ${nomWonder(ev.wonder)}`, 'info', ev.seq); }
        break;
      // MERVEILLE-EXCLUSIVITE-PUBLIQUE (Erik 05/10, volet 3) : un ordre de
      // production refusé à la résolution est ANNONCÉ (plus d'évaporation
      // muette — file vide sans explication).
      case 'ProductionRefused':
        if (ev.owner === ctx.moi) {
          const nom = ev.item.kind === 'wonder' ? nomWonder(ev.item.id) : ev.item.kind === 'building' ? nomBuilding(ev.item.id) : nomTypeUnite(ev.item.id);
          pousser('empire', `Ordre refusé : ${nom} n'a pas pu être programmé à ${ctx.ville(ev.cityId)?.nom ?? ev.cityId} — ${ev.reason}`, 'bad', ev.seq);
        }
        break;

      // -------------------------------------------------------------
      // ORDRES-UNITES (décisions d'Erik du 06/10)
      // -------------------------------------------------------------
      case 'UnitSold':
        if (ev.owner === ctx.moi) pousser('empire', `${nomTypeUnite(ev.unitType)} (${ev.unitId}) vendue — +${ev.amount.toLocaleString('fr-FR')} or (50 % du coût de production)`, 'info', ev.seq, hexCliquable(ev.at, ctx));
        break;
      case 'SellRefused':
        if (ev.owner === ctx.moi) pousser('empire', `Vente refusée (${ev.unitId}) — ${ev.reason === 'abord' ? 'unité à bord d\'un transport' : ev.reason === 'cargo' ? 'le transport porte une cargaison' : 'l\'unité a combattu ce tour'}`, 'bad', ev.seq);
        break;
      case 'HealCompleted':
        if (ev.owner === ctx.moi) pousser('empire', `${nomUniteAvecOwner(ev.unitId, ctx)} a retrouvé tous ses PV — soin terminé`, 'good', ev.seq, hexCliquable(ev.at, ctx));
        break;
      case 'HealRefused':
        if (ev.owner === ctx.moi) pousser('empire', `Soin refusé (${nomUniteAvecOwner(ev.unitId, ctx)}) — territoire ennemi (anneaux culturels)`, 'bad', ev.seq, hexCliquable(ev.at, ctx));
        break;
      case 'SleepWoke':
        if (ev.owner === ctx.moi) pousser('menaces', `${nomUniteAvecOwner(ev.unitId, ctx)} réveillée — un ennemi est devenu visible`, 'info', ev.seq, hexCliquable(ev.at, ctx));
        break;

      // -------------------------------------------------------------
      // 🗿 Artefacts (mien : effet + lieu ; autre : rumeur SANS lieu, D4)
      // -------------------------------------------------------------
      case 'ArtifactActivated':
        if (ev.byPlayer === ctx.moi) pousser('artefacts', `Artefact « ${ev.name} » activé${presDe(ev.at, ctx)} — ${artefactEffectLabel(ev.effect, ev)}`, 'good', ev.seq, hexCliquable(ev.at, ctx));
        else { const s2 = sujetNation(ev.byPlayer, ctx); pousser('artefacts', `${s2.sujet} ${s2.pluriel ? 'ont' : 'a'} trouvé une relique…`, 'info', ev.seq); }
        break;

      // -------------------------------------------------------------
      // 💥 Menaces
      // -------------------------------------------------------------
      case 'BarbarianSpawned':
        pousser('menaces', `Un barbare sort d'un village${presDe(ev.at, ctx)}`, 'bad', ev.seq, hexCliquable(ev.at, ctx));
        break;
      case 'SpyMission':
        pousser('menaces', ev.owner === ctx.moi
          ? (ev.outcome === 'success' ? `Votre espion a réussi sa mission à ${ctx.ville(ev.cityId)?.nom ?? ev.cityId} !` : `Mission d'espionnage échouée à ${ctx.ville(ev.cityId)?.nom ?? ev.cityId}`)
          : `Un espion de ${nomNation(ev.owner, ctx)} a opéré à ${ctx.ville(ev.cityId)?.nom ?? ev.cityId}`, ev.owner === ctx.moi ? (ev.outcome === 'success' ? 'good' : 'info') : 'bad', ev.seq);
        break;
      case 'SpyAction':
        pousser('menaces', ev.owner === ctx.moi
          ? (ev.outcome === 'success' ? `Votre espion a exécuté une action à ${ctx.ville(ev.cityId)?.nom ?? ev.cityId}` : `Action d'espionnage sans effet à ${ctx.ville(ev.cityId)?.nom ?? ev.cityId}`)
          : `Sabotage à ${ctx.ville(ev.cityId)?.nom ?? ev.cityId} — un espion de ${nomNation(ev.owner, ctx)} a frappé`, ev.owner === ctx.moi ? (ev.outcome === 'success' ? 'good' : 'info') : 'bad', ev.seq);
        break;
      case 'SpyDuel':
        pousser('menaces', `Duel d'espions à ${ctx.ville(ev.cityId)?.nom ?? ev.cityId} — ${nomNation(ev.winner, ctx)} l'emporte`, ev.winner === ctx.moi ? 'good' : 'info', ev.seq);
        break;
      case 'GoldStolen':
        pousser('menaces', `OR VOLÉ ! ${nomNation(ev.victim, ctx)} perd ${ev.amount.toLocaleString('fr-FR')} or au profit de ${nomNation(ev.thief, ctx)}`, ev.victim === ctx.moi ? 'bad' : ev.thief === ctx.moi ? 'good' : 'info', ev.seq);
        break;
      case 'SpyBuildingDestroyed':
        pousser('menaces', `SABOTAGE ! ${nomBuilding(ev.building)} détruit à ${ctx.ville(ev.cityId)?.nom ?? ev.cityId} par un espion de ${nomNation(ev.thief, ctx)}`, ev.victim === ctx.moi ? 'bad' : ev.thief === ctx.moi ? 'good' : 'info', ev.seq);
        break;
      case 'ResourceDestroyed':
        if (ev.owner === ctx.moi) pousser('menaces', `Une ressource (${ev.resource}) est détruite${presDe(ev.at, ctx)} (ville fondée dessus)`, 'info', ev.seq);
        break;
      case 'UnitExpelled':
      case 'UnitDispersed':
        if (ev.owner === ctx.moi) pousser('menaces', `${nomUniteAvecOwner(ev.unitId, ctx)} relogée — la pile amie se disperse${presDe(ev.to, ctx)}`, 'info', ev.seq);
        break;

      // -------------------------------------------------------------
      // 🕊 Monde
      // -------------------------------------------------------------
      case 'PlayerDefeated':
        pousser('monde', `${nomNation(ev.player, ctx)} est ÉLIMINÉ${ev.byPlayer ? ` par ${nomNation(ev.byPlayer, ctx)}` : ''}${ev.cause === 'capitalCaptured' ? ' (capitale capturée)' : ev.cause === 'capitalRazed' ? ' (capitale rasée par les barbares)' : ev.cause === 'forfeit' ? ' (forfait)' : ' (anéantie)'}`, ev.player === ctx.moi ? 'bad' : 'info', ev.seq);
        break;
      case 'GovernmentChanged':
        pousser('monde', ev.player === ctx.moi
          ? (ev.anarchy ? 'Changement de gouvernement — ANARCHIE pendant 1 tour.' : `Nouveau gouvernement adopté sans Anarchie.`)
          : `${sujetNation(ev.player, ctx).sujet} ${sujetNation(ev.player, ctx).pluriel ? 'adoptent' : 'adopte'} un nouveau régime`, ev.player === ctx.moi && ev.anarchy ? 'bad' : ev.player === ctx.moi ? 'good' : 'info', ev.seq);
        break;
      case 'DiplomaticIncident':
        pousser('monde', `Incident diplomatique entre ${nomNation(ev.between[0], ctx)} et ${nomNation(ev.between[1], ctx)}`, 'info', ev.seq);
        break;
      case 'Victory':
        pousser('monde', `VICTOIRE de ${nomNation(ev.winner, ctx)} (${nomMotifVictoire(ev.reason)})`, ev.winner === ctx.moi ? 'good' : 'bad', ev.seq);
        break;
      case 'HutOpened':
        if (ev.byPlayer === ctx.moi) pousser('monde', `Hutte ouverte : ${hutRewardLabel(ev.reward)}`, 'good', ev.seq, hexCliquable(ev.at, ctx));
        break;
      case 'BootyGold':
        if (ev.player === ctx.moi) pousser('monde', `Butin : +${ev.amount} or`, 'good', ev.seq);
        break;

      // Types sans entrée (sécurité — nouveaux types moteur : silencieux).
      default:
        break;
    }
  }

  // Les entrées de combat agrégées sont insérées en tête (ordre de parcours).
  let i = 0;
  const finales: EntreeChronique[] = [];
  for (const g of combats.values()) {
    const morceaux: string[] = [];
    if (g.attaques.length > 0) {
      const a = nomUniteAvecOwner(g.attaques[0]!.a, ctx);
      const d = nomUniteAvecOwner(g.attaques[0]!.d, ctx);
      morceaux.push(`${a} attaque ${d}`);
    }
    for (const p of g.pertes) morceaux.push(`${p}`);
    for (const r of g.replis) morceaux.push(`${r} se replie`);
    if (morceaux.length === 0) continue;
    const pertesMoi = g.pertes.some((p) => p.startsWith('ton '));
    const ennemiDetruit = g.pertes.some((p) => p.startsWith('Barbare') || p.includes(' de '));
    const hexC = hexCliquable(g.hex, ctx);
    finales.push({
      id: `e${g.seq}`,
      tour,
      cat: 'combats',
      texte: `Combat${presDe(g.hex, ctx)} — ${morceaux.join(' ; ')}`,
      ton: pertesMoi ? 'bad' : ennemiDetruit ? 'good' : 'info',
      hex: hexC,
      combatHex: hexC,
    });
  }
  return [...finales, ...out];
}

function nomEre(era: string): string {
  switch (era) {
    case 'ancienne': return 'Ancienne';
    case 'medievale': return 'Médiévale';
    case 'industrielle': return 'Industrielle';
    case 'moderne': return 'Moderne';
    default: return era;
  }
}

function nomMotifVictoire(reason: string): string {
  switch (reason) {
    case 'domination': return 'domination (capitale capturée)';
    case 'forfeit': return 'forfait';
    case 'razedCapital': return 'capitale rasée';
    case 'culture': return 'culturelle (Nations Unies)';
    case 'science': return 'scientifique (Vaisseau spatial)';
    case 'economique': return 'économique (Banque mondiale)';
    default: return reason;
  }
}

// ---------------------------------------------------------------------------
// Store + persistance locale par partie (D7)
// ---------------------------------------------------------------------------

export const chronique = writable<EntreeChronique[]>([]);

/** Stockage sûr (tests/SSR : repli mémoire si localStorage absent). */
const stockage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> =
  typeof localStorage !== 'undefined' ? localStorage : memoire();

function memoire(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

let cleStockage: string | null = null;

/** Charge la Chronique d'une partie (rechargement de page — D7). */
export function chargerChronique(code: string): void {
  cleStockage = `chronique:${code}`;
  try {
    const brut = stockage.getItem(cleStockage);
    chronique.set(brut ? (JSON.parse(brut) as EntreeChronique[]) : []);
  } catch {
    chronique.set([]);
  }
}

function persister(list: EntreeChronique[]): void {
  if (!cleStockage) return;
  try {
    stockage.setItem(cleStockage, JSON.stringify(list));
  } catch {
    /* quota dépassé : la Chronique reste en mémoire pour la session */
  }
}

/** Ajoute des entrées (FIFO, plafond CHRONIQUE_MAX — D7) + persistance. */
export function pousserEntrees(entrees: EntreeChronique[]): void {
  if (entrees.length === 0) return;
  chronique.update((list) => {
    // Dédoublonnage par id (rechargement : les missedEvents rejoués
    // régénèrent les mêmes entrées — même id seq, on ignore).
    const existants = new Set(list.map((x) => x.id));
    const nouvelles = entrees.filter((e) => !existants.has(e.id));
    if (nouvelles.length === 0) return list;
    const next = [...list, ...nouvelles];
    const plafonnees = next.length > CHRONIQUE_MAX ? next.slice(next.length - CHRONIQUE_MAX) : next;
    persister(plafonnees);
    return plafonnees;
  });
}

/** Entrée « info » issue d'un toast utile (refus d'ordre, conseiller — D1). */
export function pousserInfo(texte: string, ton: 'good' | 'bad' | 'info', tour: number): void {
  pousserEntrees([{ id: `t${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, tour, cat: 'monde', texte, ton, hex: null, combatHex: null }]);
}

/** Vidage (nouvelle partie / tests). */
export function resetChronique(): void {
  chronique.set([]);
  if (cleStockage) {
    try {
      stockage.removeItem(cleStockage);
    } catch {
      /* ignorer */
    }
  }
}

/** Purge la clé mémorisée (changement de partie sans reset explicite). */
export function oublierCleChronique(): void {
  cleStockage = null;
}
