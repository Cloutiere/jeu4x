<script lang="ts">
  /**
   * Page de partie (Phase 3) : carte PixiJS (GameCanvas), barre supérieure,
   * panneaux unité/ville, journal, playback des événements (L4) et overlays
   * (résolution, victoire, toasts). La vue « état brut » reste accessible
   * (repliable) — outil de référence ; le mode reveal est sur #/debug/<code>.
   *
   * Playback (L4) : rejoue les événements reçus (TurnResult ET
   * Snapshot.missedEvents après reconnexion — §3.4-4). Un Snapshot purge
   * d'abord l'animation en cours (l'état reçu est l'autorité) via le hook
   * onMessage, appelé AVANT la mise à jour de la vue.
   */
  import { onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import type { GameEvent } from '@game/shared';
  import type { GameState } from '@game/shared';
  import type { Hex } from '@game/rules';
  import { CULTURE, GOVERNMENTS, TECHS, WONDERS, angkorEligibleWonders, conversionGains, cityGoldMultOf, empireGoldMultOf, settledGpMultiplier, nextEconomyMilestone, allKnownTechs, interiorCitizenFor, activeTraitsOf, blocagesFinDeTour, libelleBlocageFinDeTour } from '@game/rules';
  import { civName, civLeader } from '../lib/labels.js';
  import { createGameClient } from '../lib/gameClient.js';
  import type { GameClient, GameView } from '../lib/gameClient.js';
  import { createUiState, selectNothing, createVueVille } from '../lib/render/ui.js';
  import type { UiStore } from '../lib/render/ui.js';
  import { Playback } from '../lib/render/playback.js';
  import { rightClickAction, annulationOrdre, unitsWithoutOrders, myEngineId } from '../lib/render/interaction.js';
  import type { ClickAction } from '../lib/render/interaction.js';
  import { unexecutedOrders } from '../lib/feedback.js';
  import { replayPair, cloneEtatReplay, appliquerEvenement } from '../lib/replay.js';
  import { config, rendu3dAutorise, bascule3dAutorisee } from '../lib/config.js';
  import GameCanvas from '../lib/render/GameCanvas.svelte';
  import UnitPanel from '../components/UnitPanel.svelte';
  import CityView from '../components/CityView.svelte';
  import ResearchPanel from '../components/ResearchPanel.svelte';
  import Journal from '../components/Journal.svelte';
  import Historique from '../components/Historique.svelte';
  import { pushHistory, resetHistory } from '../lib/eventHistory.js';
  import GovernmentPanel from '../components/GovernmentPanel.svelte';

  let { code }: { code: string } = $props();

  let lastReplayedSeq = -1;
  const playback = new Playback();

  // 7h · R-122 : les techs de GOUVERNEMENT (invitation du conseiller —
  // bascule sans Anarchie pendant le tour qui suit leur complétion).
  const GOVERNMENT_TECHS = Object.values(GOVERNMENTS)
    .map((g) => g.tech)
    .filter((t): t is string => !!t);
  const GOVERNMENT_TECH_NAMES: Record<string, string> = Object.fromEntries(
    Object.values(GOVERNMENTS)
      .filter((g) => g.tech)
      .map((g) => [g.tech as string, g.name]),
  );

  // Toasts d'erreur réseau/ordres + annonces culturelles 7f (ONU disponible /
  // suspendue) — les toasts d'événements viennent du playback.
  const toasts = playback.toasts;
  let errorToasts = $state<Array<{ id: number; text: string; kind: 'good' | 'bad' | 'info' }>>([]);
  let errorToastId = 1;
  // RESOLUTION-DEPLACEMENTS §4 : tout toast affiché alimente l'historique
  // d'événements persistant du menu de droite (zéro gameplay — présentation).
  function pushErrorToast(text: string, kind: 'good' | 'bad' | 'info' = 'bad'): void {
    pushHistory(text, kind, get(view)?.turn ?? 0);
    const id = errorToastId++;
    errorToasts = [...errorToasts, { id, text, kind }];
    setTimeout(() => {
      errorToasts = errorToasts.filter((t) => t.id !== id);
    }, 5000);
  }
  let dernierToastVu = 0;
  resetHistory(); // une partie = un historique (la SPA survit au changement de partie)
  onDestroy(
    toasts.subscribe((list) => {
      for (const t of list) {
        if (t.id <= dernierToastVu) continue;
        dernierToastVu = t.id;
        pushHistory(t.text, t.kind, get(view)?.turn ?? 0);
      }
    }),
  );

  const client: GameClient = createGameClient(code, {
    onMessage(message) {
      // Resync/reconnexion : le snapshot reçu prime sur toute animation.
      // REPLAY-RESOLUTION (L2) : un Snapshot purge aussi la paire (fait dans
      // gameClient) — la relecture en cours cesse, l'état reçu est l'autorité.
      if (message.type === 'Snapshot') terminerReplay();
      // REPLAY-RESOLUTION (D1) : un nouveau TurnResult remplace la paire —
      // la relecture en cours est quittée (elle portait l'ancien tour).
      if (message.type === 'TurnResult') terminerReplay();
      // Polish Phase 5 : un ordre écarté par le moteur à la résolution est
      // signalé (le hook voit les ordres d'AVANT la mise à jour de la vue).
      if (message.type === 'TurnResult') {
        const previous = get(view).orders;
        for (const f of unexecutedOrders(previous, message.events, message.state)) {
          pushErrorToast(`Ordre non exécuté (${f.unitId}) : ${f.label}`);
        }
      }
    },
  });
  onDestroy(() => client.close());

  const view = client.view;
  const status = client.status;
  const error = client.error;
  const ui: UiStore = createUiState();
  onDestroy(() => selectNothing(ui));

  // ---------------------------------------------------------------------
  // MENU-VILLE (décisions d'Erik du 13/09) — état de VUE VILLE (client
  // uniquement, jamais dans l'état du GameDO). Double-clic sur une ville =
  // zoom incliné + tuiles + menu dédié (CityView) ; tous les menus actuels
  // disparaissent et les actions de carte sont inaccessibles. Sortie :
  // bouton fermer, Échap ou double-clic hors de la ville — retour animé.
  // ---------------------------------------------------------------------
  const vueVille = createVueVille();
  onDestroy(() => vueVille.set(null));
  function entrerVueVille(cityId: string): void {
    selectNothing(ui); // plus aucune sélection unité/ville pendant la vue
    vueVille.set(cityId);
  }
  function sortirVueVille(): void {
    vueVille.set(null);
  }
  const vueVilleActive = $derived($vueVille !== null);

  // Lien vers le mode reveal (#/debug) — jamais dans un build de production.
  const devMode = import.meta.env.DEV;

  /** Icône optionnelle : masquée silencieusement si l'asset est absent. */
  function hideImg(e: Event): void {
    (e.currentTarget as HTMLElement | null)?.style.setProperty('display', 'none');
  }

  /** 7l · Commerce de base des terrains (miroir §2 — GPT d'affichage ;
   *  le commerce du centre-ville suit la tranche démographique — R-60bis). */
  const TERRAIN_COMMERCE: Record<string, number> = {
    prairie: 0,
    plaine: 0,
    foret: 0,
    colline: 0,
    montagne: 0,
    desert: 1,
    eau: 2,
    ocean: 2,
    ville: 0, // ALIGNEMENT-CROISSANCE : la case de ville ne rapporte rien
  };

  // Rejouer tout événement fraîchement ajouté au journal (dédoublonné par seq
  // côté réducteur — cf. gameClient.ts). 7f : annonces ONU disponible /
  // suspendue au passage du seuil de jalons (R-116).
  let lastMilestones = -1;
  const unsubReplay = view.subscribe((v) => {
    const target = CULTURE.milestonesTarget;
    const pid = myEngineId(v);
    const player = pid && v.state ? v.state.players[pid] : null;
    if (player) {
      const m = player.cultureMilestones;
      if (lastMilestones >= 0 && lastMilestones < target && m >= target) {
        pushErrorToast('Nations Unies disponibles ! 20 jalons culturels atteints — construisez-les pour la victoire culturelle.', 'good');
      }
      if (lastMilestones >= target && m < target) {
        const unEnChantier = pid && v.state
          ? Object.values(v.state.cities).some((c) => c.owner === pid && c.production?.item.kind === 'wonder' && c.production.item.id === 'nations_unies')
          : false;
        if (unEnChantier) pushErrorToast('Nations Unies SUSPENDUES — jalons sous 20 (marteaux conservés).', 'bad');
      }
      lastMilestones = m;
    }
    if (v.events.length === 0) return;
    const fresh = v.events.filter((e) => e.seq > lastReplayedSeq);
    if (fresh.length === 0) return;
    lastReplayedSeq = fresh[fresh.length - 1]!.seq;
    // 7h · R-122/R-124 : annonces conseiller (tech de gouvernement),
    // changement de régime et lancement du vaisseau.
    for (const e of fresh) {
      if (e.type === 'TechResearched' && e.player === pid && GOVERNMENT_TECHS.includes(e.tech)) {
        const regime = GOVERNMENT_TECH_NAMES[e.tech] ?? e.tech;
        pushErrorToast(`Conseiller : ${e.tech} découverte — adoptez ${regime} SANS Anarchie (menu Gouvernement).`, 'good');
      }
      if (e.type === 'GovernmentChanged') {
        pushErrorToast(
          e.anarchy
            ? 'Changement de gouvernement — ANARCHIE pendant 1 tour (rendements à zéro).'
            : 'Nouveau gouvernement adopté sans Anarchie.',
          e.anarchy ? 'bad' : 'good',
        );
      }
      if (e.type === 'Launch') {
        pushErrorToast(
          e.player === pid ? 'Vaisseau spatial lancé !' : `${nomJoueur(e.player)} a lancé son Vaisseau spatial…`,
          e.player === pid ? 'good' : 'bad',
        );
      }
      if (e.type === 'EconomyMilestone' && e.player === pid) {
        // 7l · R-136 : palier économique franchi — annonce (récompense appliquée).
        pushErrorToast(`Palier économique ${e.threshold.toLocaleString('fr-FR')} or : ${e.label} !`, 'good');
      }
      if (e.type === 'EconomyMilestone' && e.reward === 'worldBank' && e.player !== pid) {
        pushErrorToast(`${nomJoueur(e.player)} a débloqué la Banque mondiale… (victoire économique)`, 'bad');
      }
      // 7m · R-139/C13 : frappe nucléaire — annonce différenciée tireur/victime.
      if (e.type === 'NukeLaunched' && e.outcome === 'detonated') {
        pushErrorToast(
          e.owner === pid ? 'Votre frappe nucléaire a détoné — vos adversaires sont prévenus (pénalité de jalon 🔶).' : `☢️ Une ICBM de ${nomJoueur(e.owner)} a détoné sur nos positions !`,
          e.owner === pid ? 'info' : 'bad',
        );
      }
      if (e.type === 'NukeLaunched' && e.outcome === 'intercepted' && e.owner !== pid) {
        pushErrorToast('Missile intercepté par notre Défense SDI ! (R-141)', 'good');
      }
      if (e.type === 'CityNuked' && e.owner === pid) {
        pushErrorToast(`☢️ ${e.cityId} a été frappée : population ${e.popAfter}, ${e.buildingsDestroyed.length} bâtiment(s) détruit(s).`, 'bad');
      }
    }
    playback.enqueue(fresh);
  });

  // ---------------------------------------------------------------------
  // Actions (L3) : décision de clic pure → ordres soumis au serveur.
  // ---------------------------------------------------------------------

  let canvasApi: { centerOnHex(hex: Hex): void; centerOnUnit(unitId: string): void } | null = $state(null);

  // 7m · R-139 : ciblage d'ICBM — `nukeArmed` vit dans l'UiState (le clic
  // carte produit alors un `nukeTarget`) ; la cible pressentie attend la
  // confirmation explicite (modale) avant l'ordre `Launch` (irréversible).
  const nukeArmed = $derived($ui.nukeArmed ?? null);
  let nukePending = $state<Hex | null>(null);
  function armNuke(unitId: string): void {
    ui.set({ selectedUnitId: unitId, selectedCityId: null, draft: null, nukeArmed: unitId });
    nukePending = null;
  }
  function cancelNuke(): void {
    ui.update((u) => ({ ...u, nukeArmed: null }));
    nukePending = null;
  }
  function confirmNuke(): void {
    const unitId = get(ui).nukeArmed;
    if (unitId && nukePending) {
      client.submitOrder({ type: 'Launch', unitId, target: { q: nukePending.q, r: nukePending.r } });
    }
    cancelNuke();
  }
  /** Avertissement SDI : la cible pressentie est-elle une ville visible à SDI ? */
  const nukeSdiWarning = $derived.by(() => {
    if (!nukePending || !$view.state) return null;
    const city = Object.values($view.state.cities).find((c) => c.q === nukePending!.q && c.r === nukePending!.r);
    return city && city.buildings.includes('sdi')
      ? `⚠ ${city.id} est protégée par une Défense SDI — interception GARANTIE si la ville est visée (R-141). Cibler une case ADJACENTE contourne le bouclier… et frappe son rayon.`
      : null;
  });

  function handleAction(action: ClickAction): void {
    switch (action.kind) {
      case 'selectUnit':
        // CORRECTIFS-SELECTION (schéma d'Erik du 08/09) : le clic gauche
        // SÉLECTIONNE UNIQUEMENT — aucun brouillon armé, la programmation
        // passe par le clic droit (destination).
        ui.set({ selectedUnitId: action.unitId, selectedCityId: null, draft: null });
        break;
      case 'selectCity':
        ui.set({ selectedUnitId: null, selectedCityId: action.cityId, draft: null });
        break;
      case 'deselect':
        selectNothing(ui);
        break;
      case 'moveDraft':
        // Clic droit = DESTINATION du déplacement : chemin complet soumis.
        client.submitOrder({ type: 'Move', unitId: action.unitId, path: action.path });
        break;
      case 'cancelOrder':
        // Clic droit sans destination valide : purge unifiée (M2).
        handleCancelOrder(action.unitId);
        break;
      case 'setWorkedTile':
        client.submitOrder({ type: 'SetWorkedTile', cityId: action.cityId, tile: action.tile });
        break;
      case 'nukeTarget':
        // 7m · R-139 : cible pressentie — la confirmation reste à l'écran.
        nukePending = action.hex;
        break;
      case 'none':
        break;
    }
  }

  function confirmDraft(): void {
    const d = get(ui).draft;
    if (!d || d.path.length === 0) return;
    client.submitOrder({ type: 'Move', unitId: d.unitId, path: d.path });
    // Le brouillon reste armé (vide) sur la même unité : enchaîner un autre
    // ordre de déplacement ne demande pas de re-sélection.
    ui.update((u) => ({ ...u, draft: { unitId: d.unitId, path: [] } }));
  }

  /**
   * Clic droit (CORRECTIFS-SELECTION — schéma d'Erik du 08/09) : avec une
   * unité amie sélectionnée, le clic droit est la DESTINATION du déplacement
   * (chemin complet soumis) ; sans destination valide, il annule l'ordre
   * courant de l'unité (purge unifiée M2).
   */
  function handleRightClick(hex: Hex): void {
    // 7m · R-139 : ciblage ICBM armé — le clic droit reste le ciblage.
    if (get(ui).nukeArmed) return;
    handleAction(rightClickAction(get(view), get(ui), hex));
  }

  // ---------------------------------------------------------------------
  // Fin de tour : confirmation si des unités n'ont aucun ordre (Phase 5 L1).
  // ---------------------------------------------------------------------

  let showIdleDialog = $state(false);
  let idleUnits = $state<Array<{ id: string; label: string; pos: string }>>([]);
  // 7l · C7 · R-130 (rév.) : villes avec une RÉSERVE de marteaux sans projet —
  // le joueur DOIT choisir un projet (dialogue forcé, miroir « unités sans ordre »).
  let salvageCities = $state<Array<{ id: string; amount: number }>>([]);

  // ---------------------------------------------------------------------
  // 7o · R-154 : choix ANGKOR WAT (artefact activé — merveille gratuite au
  // choix : édifice + ville). Modale auto-ouverte tant qu'un droit est en
  // attente ; « Décider plus tard » la referme (le droit subsiste).
  // ---------------------------------------------------------------------

  let angkorWonder = $state<string | null>(null);
  let angkorCity = $state<string | null>(null);
  let angkorDismissed = $state(false);

  function myAngkorPending(v: GameView | null, pid: string | null): boolean {
    return !!v?.state && !!pid && v.state.pendingArtefactChoices.some((c) => c.player === pid);
  }

  function confirmAngkor(): void {
    if (!angkorWonder || !angkorCity) return;
    client.chooseWonder(angkorCity, angkorWonder);
    angkorDismissed = true;
    angkorWonder = null;
    angkorCity = null;
  }

  function requestEndTurn(): void {
    const v = get(view);
    // FIN-DE-TOUR-PRODUCTION (18/09) : même prédicat que le serveur —
    // impossible d'envoyer un EndTurn bloqué (production/recherche manquantes,
    // résiduels compris : réserve C7, scienceStored d'une hutte recherche).
    const id = myEngineId(v);
    const blocages = v.state && id ? blocagesFinDeTour(v.state, id, v.orders) : [];
    if (blocages.length > 0) {
      for (const b of blocages) pushErrorToast(libelleBlocageFinDeTour(v.state!, b), 'bad');
      return;
    }
    const ids = unitsWithoutOrders(v);
    const salvage =
      v.state && myEngineId(v)
        ? Object.values(v.state.cities)
            .filter((c) => c.owner === myEngineId(v) && c.pendingSalvage > 0 && !c.production)
            .map((c) => ({ id: c.id, amount: c.pendingSalvage }))
        : [];
    if (ids.length === 0 && salvage.length === 0) {
      client.endTurn();
      return;
    }
    if (!v.state) {
      client.endTurn();
      return;
    }
    idleUnits = ids.map((id) => {
      const u = v.state!.units[id]!;
      return { id, label: u.type, pos: `(${u.q},${u.r})` };
    });
    salvageCities = salvage;
    showIdleDialog = true;
  }

  function confirmEndTurn(): void {
    showIdleDialog = false;
    client.endTurn();
  }

  /**
   * CORRECTIFS-SELECTION · M2 — annulation UNIFIÉE (une seule voie de purge) :
   * Échap, le clic sur le panneau ou toute autre voie passent ici. Le
   * brouillon UI ET l'ordre soumis de la même unité partent ENSEMBLE —
   * sinon l'un des deux pools de rendu laissait une flèche orpheline
   * (le corps sans la pointe, ou l'inverse).
   */
  function cancelDraft(): void {
    const d = get(ui).draft;
    if (d) {
      const { ordreExistant } = annulationOrdre(get(view), get(ui), d.unitId);
      ui.update((u) => ({ ...u, draft: null }));
      if (ordreExistant) client.cancelOrderFor(d.unitId);
      return;
    }
    ui.update((u) => ({ ...u, draft: null }));
  }

  /** « Annuler l'ordre » (panneau unité) — même purge unifiée que cancelDraft. */
  function handleCancelOrder(unitId: string): void {
    const { ordreExistant, draft } = annulationOrdre(get(view), get(ui), unitId);
    ui.update((u) => ({ ...u, draft }));
    if (ordreExistant) client.cancelOrderFor(unitId);
  }

  // ---------------------------------------------------------------------
  // REPLAY-RESOLUTION (D3/D4) — mode relecture du dernier tour résolu.
  // L'état RENDU devient un état dérivé (clone du pré-résolution) sur lequel
  // le playback applique les événements AU FUR ET À MESURE ; l'état
  // autoritaire du store n'est jamais muté. Pan/zoom restent libres, clic =
  // accélérer, Échap/bouton = quitter (retour immédiat à l'état réel).
  // ---------------------------------------------------------------------
  let etatReplay = $state<GameState | null>(null);
  let replayActif = $state(false);

  function demarrerReplay(): void {
    const paire = get(replayPair);
    if (!paire || playbackActive || replayActif) return;
    selectNothing(ui); // aucune sélection pendant la relecture
    vueVille.set(null); // la vue ville n'a pas de sens sur le pré-état
    const etat = cloneEtatReplay(paire.statePre);
    playback.reset();
    // Chaque événement rejoué applique son effet AU CLONE (sprite détruit à
    // l'événement, drapeau de ville, PV) — surcouche D3.
    playback.onEvenement = (ev) => appliquerEvenement(etat, ev);
    etatReplay = etat;
    replayActif = true;
    playback.enqueue(paire.events);
  }

  /** Quitter la relecture (fin de file, Échap, bouton, nouveau tour, resync). */
  function terminerReplay(): void {
    if (!replayActif && etatReplay === null) {
      playback.onEvenement = null;
      return;
    }
    playback.reset();
    playback.onEvenement = null;
    etatReplay = null;
    replayActif = false;
  }

  // Fin de file → retour automatique à l'état réel (D4) — onPlaybackActive
  // bascule à false quand la file d'événements est épuisée.
  function onPlaybackActiveChange(active: boolean): void {
    playbackActive = active;
    if (!active && replayActif) terminerReplay();
  }

  // ---------------------------------------------------------------------
  // Dérivés d'affichage
  // ---------------------------------------------------------------------

  let playbackActive = $state(false);
  const busy = $derived($view.phase === 'resolving' || playbackActive);

  // Phase 6 L3 : overlay des rendements N/P/C — cycle 3 états (Phase 7b) :
  // 0 masqué → 1 affiché → 2 affiché SANS villes/armées (lire les rendements
  // sous les entités) → 0.
  // Chantier V1 (L3) : rendu 3D du terrain (option B hybride) — flag de repli
  // DÉFAUT DÉSACTIVÉ (rendu 2D conservé jusqu'à l'acceptation visuelle d'Erik).
  // Pivot du 11/09 : le 3D est mis de côté derrière le DRAPEAU UNIQUE
  // `config.rendu3d` (lib/config.ts) — à false : bouton non rendu, préférence
  // locale ignorée (le jeu force le 2D), bascule inerte. À true : historique.
  let rendu3d = $state(
    typeof localStorage !== 'undefined' && rendu3dAutorise(localStorage.getItem('rendu3d')),
  );
  function basculerRendu3d(): void {
    if (!bascule3dAutorisee()) return;
    rendu3d = !rendu3d;
    localStorage.setItem('rendu3d', rendu3d ? '1' : '0');
  }

  let yieldMode = $state<0 | 1 | 2>(0);
  const showYields = $derived(yieldMode > 0);
  const hideEntities = $derived(yieldMode === 2);
  function cycleYields(): void {
    yieldMode = ((yieldMode + 1) % 3) as 0 | 1 | 2;
  }

  // Phase 7a : menu de choix technologique (R-85).
  let showResearch = $state(false);
  // 7h · R-121/R-122 : menu de gouvernement + bandeau d'Anarchie.
  let showGovernment = $state(false);
  const myGovernment = $derived.by(() => {
    const id = myEngineId($view);
    return (id && $view.state ? $view.state.players[id]?.government : null) ?? 'despotisme';
  });
  const myInAnarchy = $derived.by(() => {
    const id = myEngineId($view);
    const p = id && $view.state ? $view.state.players[id] : null;
    return !!p && typeof p.anarchyUntil === 'number' && $view.turn < p.anarchyUntil;
  });

  // 7n · R-145 : badge civilisation + ÈRE (compage — R-147) du joueur, civ
  // adverse PUBLIQUE (canon) et traits actifs (tooltips — traits inactifs
  // mentionnés, R-146).
  const ERA_LABELS: Record<string, string> = {
    ancienne: 'Ère Ancienne',
    medievale: 'Ère Médiévale',
    industrielle: 'Ère Industrielle',
    moderne: 'Ère Moderne',
  };
  const eraLabel = (era: string): string => ERA_LABELS[era] ?? era;
  const myCivId = $derived.by(() => {
    const id = myEngineId($view);
    return (id && $view.state ? $view.state.players[id]?.civId : null) ?? 'neutre';
  });
  const myEra = $derived.by(() => {
    const id = myEngineId($view);
    return (id && $view.state ? $view.state.players[id]?.era : null) ?? 'ancienne';
  });
  const myCivTraits = $derived(myCivId === 'neutre' ? [] : activeTraitsOf({ civId: myCivId, era: myEra }));
    const myCivTooltip = $derived.by(() => {
    if (myCivId === 'neutre') return 'Partie sans civilisation (7n : choix au lobby)';
    const lines = [`${civName(myCivId)} (${civLeader(myCivId)})`];
    for (const t of myCivTraits) lines.push(`${t.inactif ? '○ (inactif) ' : '• '}${t.label}`);
    return lines.join(String.fromCharCode(10));
  });
  // CARTE-MULTI : nom lisible d'un joueur (humain « Alice », bot « Bot 3 »)
  // — civ affichée quand connue. Retombe sur l'id brut (états migrés).
  function nomJoueur(engineId: string): string {
    const info = $view.players.find((x) => x.engineId === engineId);
    const civ = $view.state?.players[engineId]?.civId ?? 'neutre';
    if (!info) return civ !== 'neutre' ? civName(civ) : engineId;
    return civ !== 'neutre' ? `${info.name} (${civName(civ)})` : info.name;
  }
  const oppCivId = $derived.by(() => {
    const id = myEngineId($view);
    const other = id && $view.state ? Object.keys($view.state.players).find((p) => p !== id) : null;
    return (other && $view.state ? $view.state.players[other]?.civId : null) ?? 'neutre';
  });
  // CARTE-MULTI : suffixe du bandeau — « Adversaire : X » à 2 sièges
  // (inchangé), « Adversaires : X · Y · Z » à 3+ (une entrée par joueur).
  const adversairesBadge = $derived.by(() => {
    const id = myEngineId($view);
    if (!id || !$view.state) return '';
    const others = Object.keys($view.state.players).filter((p) => p !== id).sort();
    if (others.length === 0) return '';
    const label = others.length === 1 ? 'Adversaire' : 'Adversaires';
    const noms = others
      .map((p) => {
        const info = $view.players.find((x) => x.engineId === p);
        const civ = $view.state!.players[p]?.civId ?? 'neutre';
        const base = civName(civ);
        // Bots : « Bot 3 : civ » — humains : la civ seule (lisibilité).
        return info?.bot ? `${info.name} : ${base}` : base;
      })
      .join(' · ');
    return ` · ${label} : ${noms}`;
  });

  // 7l · R-134 : trésorerie + GPT net (somme des villes focus Or — miroir du
  // moteur : conversion R-90 × Troyes/Internet C10 × Settle Explorateur) et
  // progression vers le prochain palier économique (R-136).
  const myTreasury = $derived.by(() => {
    const v = $view;
    const id = myEngineId(v);
    return id && v.state ? (v.state.players[id]?.treasury ?? 0) : 0;
  });
  const myEconomy = $derived.by(() => {
    const v = $view;
    const id = myEngineId(v);
    const player = id && v.state ? v.state.players[id] : null;
    if (!player || !v.state) return { treasury: 0, gpt: 0, next: null as ReturnType<typeof nextEconomyMilestone> };
    const allTechs = allKnownTechs(v.state);
    const empireMult = empireGoldMultOf(Object.values(v.state.cities), id!, allTechs);
    let gpt = 0;
    for (const c of Object.values(v.state.cities)) {
      if (c.owner !== id) continue;
      // Miroir exact du moteur (cityEconomyInputs) : la case de ville rapporte
      // 0 (ALIGNEMENT-CROISSANCE — socle R-66 abrogé) + tranche démographique
      // (R-60bis — 0 sous pop 7) + 1 C par citoyen intérieur Vendeur+.
      const tier = interiorCitizenFor(c.pop);
      const interior = Math.max(0, c.pop - c.workedTiles.length);
      let commerce = tier.commerce * (1 + interior);
      for (const key of c.workedTiles) {
        const y = v.state.map[key];
        if (!y) continue;
        commerce += TERRAIN_COMMERCE[y.terrain] ?? 0;
      }
      const raw = conversionGains(commerce, c.conversion, c.buildings);
      gpt += Math.round(raw.gold * cityGoldMultOf(c.wonders, allTechs) * empireMult * settledGpMultiplier(c, 'explorateur'));
    }
    return { treasury: player.treasury, gpt, next: nextEconomyMilestone(player.economyMilestonesClaimed ?? 0) };
  });

  // GP-CULTURE-EVENEMENTS · D6/D7 (décisions d'Erik du 13/09) : jalons
  // culturels = PALIERS T-27 de culture de civilisation + MERVEILLES
  // contrôlées — les GP n'y touchent JAMAIS (R-126 abrogée).
  const MILESTONES_TARGET = CULTURE.milestonesTarget;
  const myCulture = $derived.by(() => {
    const v = $view;
    const id = myEngineId(v);
    const p = id && v.state ? v.state.players[id] : null;
    const ownCities = id && v.state ? Object.values(v.state.cities).filter((c) => c.owner === id) : [];
    const wonderCount = ownCities.reduce((acc, c) => acc + c.wonders.length, 0);
    const paliers = p?.culturePaliers ?? 0;
    const milestones = p?.cultureMilestones ?? 0;
    return { milestones, wonderCount, paliers };
  });
  const milestonesDetail = $derived(
    `Jalons culturels (GP-CULTURE-EVENEMENTS · D6/D7 : chaque palier de culture de civilisation franchi compte +1, chaque merveille contrôlée compte +1 — les GP n’y comptent PLUS, R-126 abrogée) — ${myCulture.paliers} palier(s) de culture + ${myCulture.wonderCount} merveille(s) contrôlée(s) — ${MILESTONES_TARGET} requis pour les Nations Unies (R-116/R-131)`,
  );
  const myResearch = $derived.by(() => {
    const v = $view;
    const id = myEngineId(v);
    const p = id && v.state ? v.state.players[id] : null;
    if (!p) return { tech: null as string | null, progress: 0, cost: 0, stored: 0 };
    const tech = p.researching ? TECHS[p.researching] ?? null : null;
    return {
      tech: p.researching,
      progress: p.researching ? p.scienceProgress[p.researching] ?? 0 : 0,
      cost: tech?.cost ?? 0,
      stored: p.scienceStored ?? 0,
    };
  });
  const myResearchRatio = $derived(myResearch.cost > 0 ? Math.min(1, myResearch.progress / myResearch.cost) : 0);

  // FIN-DE-TOUR-PRODUCTION (18/09) : blocages de fin de tour — le bouton
  // « Fin de tour » est désactivé avec la liste des blocages (libellés
  // pédagogiques partagés avec le rejet serveur). Phase « orders » uniquement.
  const myBlocages = $derived.by(() => {
    const v = $view;
    const id = myEngineId(v);
    if (!v.state || !id || v.phase !== 'orders' || v.status !== 'active' || v.locked) return [];
    return blocagesFinDeTour(v.state, id, v.orders);
  });
  const myBlocagesLabel = $derived(myBlocages.map((b) => libelleBlocageFinDeTour($view.state!, b)).join('\n'));
  const myName = $derived.by(() => {
    const v = $view;
    return v.players.find((p) => p.id === v.playerId)?.name ?? '';
  });

  // 7h · R-124 : composants du Vaisseau spatial contrôlés par le joueur
  // (dérivés des bâtiments des villes — source unique moteur).
  const SHIP_COMPONENTS = $derived.by(() => {
    const engine = myEngineId($view);
    const built = new Set<string>(
      engine && $view.state
        ? Object.values($view.state.cities)
            .filter((c) => c.owner === engine)
            .flatMap((c) => c.buildings)
        : [],
    );
    const defs: Array<[string, string]> = [
      ['vaisseau_habitation', 'Habitation (400)'],
      ['vaisseau_support_vie', 'Support de vie (120)'],
      ['vaisseau_carburant', 'Carburant (80)'],
      ['vaisseau_propulsion', 'Propulsion (200)'],
    ];
    return defs.map(([cid, name]) => ({ id: cid, name, built: built.has(cid) }));
  });

  const victoryEvent = $derived.by(() => {
    const v = $view;
    for (let i = v.events.length - 1; i >= 0; i--) {
      const e = v.events[i]!;
      if (e.type === 'Victory') return e as GameEvent & { type: 'Victory' };
    }
    return null;
  });
  const showVictory = $derived(!!$view.state?.winner);

  // Toasts d'erreur réseau (déjà déclarés en tête : pushErrorToast).
  const unsubError = error.subscribe((e) => {
    if (!e) return;
    pushErrorToast(e);
    error.set(null);
  });

  onDestroy(() => {
    unsubReplay();
    unsubError();
  });
</script>

<main class="game">
  <header class="bar">
    <a href="#/lobby">← Lobby</a>
    <strong>Partie {code}</strong>
    {#if !vueVilleActive}
    <span>Tour <strong>{$view.turn}</strong></span>
    <span class="chip" class:resolving={$view.phase === 'resolving'}>{$view.phase === 'resolving' ? 'Résolution…' : 'Ordres'}</span>
    {#if $view.state}
      <button
        type="button"
        class="civbadge"
        title={myCivTooltip}
        onclick={() => (showGovernment = !showGovernment)}
      >
        <span class="civname">{civName(myCivId)}</span>
        <span class="eraname">{eraLabel(myEra)}{adversairesBadge}</span>
      </button>
    {/if}
    <span class="res" title="Trésorerie d'empire (R-134) — zéro entretien ; + GPT net des villes focus Or (R-90)">
      <img src="/art/icone_or.png" alt="Or" onerror={hideImg} />
      {myEconomy.treasury.toLocaleString('fr-FR')}
      <span class="gpt" class:negative={myEconomy.gpt < 0}>(+{myEconomy.gpt}/tour)</span>
    </span>
    {#if myEconomy.next}
      <span
        class="res milestone"
        title="Prochain palier économique (R-136) — {myEconomy.next.label}"
      >
        Palier {myEconomy.next.threshold.toLocaleString('fr-FR')} or : {Math.min(100, Math.round((myEconomy.treasury / myEconomy.next.threshold) * 100))}%
      </span>
    {/if}
    <span class="res" title={milestonesDetail}>
      <img src="/art/icone_culture.png" alt="Jalons culturels" onerror={hideImg} />
      {myCulture.milestones}/{MILESTONES_TARGET}
    </span>
    <button type="button" class="gov" class:anarchy={myInAnarchy} title="Gouvernement (R-121/R-122)" onclick={() => (showGovernment = !showGovernment)}>
      <img src="/art/icone_gouvernement.png" alt="Gouvernement" onerror={hideImg} />
      {GOVERNMENTS[myGovernment]?.name ?? myGovernment}
    </button>
    <button type="button" class="research" title="Choix technologique (R-85)" onclick={() => (showResearch = !showResearch)}>
      <img src="/art/icone_science.png" alt="Science" onerror={hideImg} />
      {#if myResearch.tech}
        {TECHS[myResearch.tech]?.name ?? myResearch.tech}
        <span class="minibar"><span class="minifill" style:width={`${myResearchRatio * 100}%`}></span></span>
        {myResearch.progress}/{myResearch.cost}
      {:else if myResearch.stored > 0}
        <em class="reserve">Choisir… ({myResearch.stored} en attente)</em>
      {:else}
        Recherche
      {/if}
    </button>
    <span class="net net-{$status}">{$status}</span>
    {#if $view.locked}<span class="chip locked">Verrouillé</span>{/if}
    <button
      type="button"
      class="primary"
      class:blocage={myBlocages.length > 0}
      disabled={$view.locked || $view.phase !== 'orders' || $view.status !== 'active' || myBlocages.length > 0}
      title={myBlocages.length > 0 ? myBlocagesLabel : 'Terminer le tour (verrouillage des ordres)'}
      onclick={requestEndTurn}
    >
      {myBlocages.length > 0 ? `Fin de tour bloquée (${myBlocages.length})` : 'Fin de tour'}
    </button>
    <button type="button" onclick={() => client.resync()}>Resync</button>
    <button
      type="button"
      class:active-toggle={showYields}
      title="Rendements N/P/C sur les cases — 3e clic : masquer villes et armées pour les lire (Phase 7b)"
      onclick={cycleYields}
    >
      Rendements{yieldMode === 1 ? ' ✓' : yieldMode === 2 ? ' (seuls)' : ''}
    </button>
    {#if config.rendu3d}
      <button
        type="button"
        class:active-toggle={rendu3d}
        title="Rendu 3D du terrain (chantier V1 — le rendu 2D reste disponible : ce bouton est un flag de repli)"
        onclick={basculerRendu3d}
      >
        3D
      </button>
    {/if}
    {#if devMode}<a href={`#/debug/${code}`}>Debug</a>{/if}
    {/if}
    {#if vueVilleActive}<span class="chip">Vue ville — Échap ou double-clic hors de la ville pour sortir</span>{/if}
  </header>

  {#if $view.status === 'waiting'}
    <div class="center">
      <p class="waiting">En attente des autres joueurs…</p>
      <p>Lien d'invitation : <code>/#/join/{code}</code> — ou lancez le bot : <code>pnpm --filter @game/server bot -- {code} Bot</code></p>
    </div>
  {:else if !$view.state}
    <div class="center"><p>Chargement de l'état…</p></div>
  {:else}
    <div class="body">
      <div class="map-area">
        <GameCanvas
          {client}
          {ui}
          {playback}
          {showYields}
          {hideEntities}
          mode3d={rendu3d}
          onAction={handleAction}
          onRightClick={handleRightClick}
          onCancelDraft={cancelDraft}
          onReady={(api) => (canvasApi = api)}
          onPlaybackActive={onPlaybackActiveChange}
          vueVilleId={$vueVille}
          onEnterVueVille={entrerVueVille}
          onExitVueVille={sortirVueVille}
          {etatReplay}
          {replayActif}
          onExitReplay={terminerReplay}
        />
        {#if vueVilleActive && $view.state}
          <!-- MENU-VILLE : le menu dédié de la vue ville (les autres menus
               disparaissent pendant la vue — FUSION-MENU-VILLE : CityPanel
               est supprimé, la vue ville EST le menu de ville). -->
          <CityView view={$view} {client} cityId={$vueVille!} onClose={sortirVueVille} />
        {/if}
        {#if showIdleDialog}
          <div class="victory idle-dialog">
            {#if idleUnits.length > 0}
              <h2>Unités sans ordre</h2>
              <p>Ces unités n'ont aucun ordre pour ce tour :</p>
              <ul>
                {#each idleUnits as u (u.id)}
                  <li><strong>{u.id}</strong> — {u.label} {u.pos}</li>
                {/each}
              </ul>
            {/if}
            {#if salvageCities.length > 0}
              <h2>Récupération de marteaux (7l · C7)</h2>
              <p>Ces villes détiennent des marteaux récupérés — choisissez un projet, la réserve financeront la production (réserve permanente, jamais dissipée) :</p>
              <ul>
                {#each salvageCities as c (c.id)}
                  <li><strong>{c.id}</strong> — {c.amount} marteaux en réserve</li>
                {/each}
              </ul>
            {/if}
            <div class="btns">
              <button type="button" class="primary-btn" onclick={confirmEndTurn}>Finir le tour quand même</button>
              <button type="button" onclick={() => (showIdleDialog = false)}>Revenir aux ordres</button>
            </div>
          </div>
        {/if}
        {#if nukePending && nukeArmed}
          <!-- 7m · R-139 : confirmation EXPLICITE du lancement (action irréversible). -->
          <div class="victory idle-dialog nuke-dialog">
            <h2>☢️ Lancer l'ICBM ?</h2>
            <p>
              Cible : <strong>({nukePending.q},{nukePending.r})</strong> —
              <strong>cette action est IRRÉVERSIBLE</strong> : un seul missile par partie (R-138),
              le rayon détruit TOUTES les unités autour de la cible (C13.4).
            </p>
            {#if nukeSdiWarning}<p class="nuke-warn">{nukeSdiWarning}</p>{/if}
            <p class="nuke-hint">
              R-140 : lancement INTERDIT sous Démocratie (refus, missile conservé) ;
              chaque détonation coûte 1 jalon culturel 🔶 — sauf sous Despotisme.
            </p>
            <div class="btns">
              <button type="button" class="primary-btn" onclick={confirmNuke}>Confirmer le lancement</button>
              <button type="button" onclick={cancelNuke}>Annuler</button>
            </div>
          </div>
        {/if}
        {#if myAngkorPending($view, myEngineId($view)) && !angkorDismissed}
          <!-- 7o · R-154 : Angkor Wat — choix de la merveille ET de la ville. -->
          <div class="victory idle-dialog angkor-dialog">
            <h2>🏛️ Angkor Wat — une Merveille gratuite !</h2>
            <p>
              L'artefact activé construit <strong>immédiatement</strong> la Merveille de votre choix
              dans une de vos villes (coût ignoré — R-154). Les Merveilles déjà bâties, obsolètes,
              ou à condition de victoire ne sont pas proposées.
            </p>
            <div class="angkor-cols">
              <div>
                <h3>Merveille</h3>
                <ul class="angkor-list">
                  {#each angkorEligibleWonders($view.state) as w (w)}
                    <li>
                      <button type="button" class:selected={angkorWonder === w} onclick={() => (angkorWonder = w)} title={WONDERS[w]?.effect ?? w}>
                        {WONDERS[w]?.name ?? w}
                      </button>
                    </li>
                  {/each}
                </ul>
              </div>
              <div>
                <h3>Ville</h3>
                <ul class="angkor-list">
                  {#each Object.values($view.state.cities).filter((c) => c.owner === myEngineId($view)).sort((a, b) => (a.capital === b.capital ? (a.id < b.id ? -1 : 1) : a.capital ? -1 : 1)) as c (c.id)}
                    <li>
                      <button type="button" class:selected={angkorCity === c.id} onclick={() => (angkorCity = c.id)}>
                        {c.id}{c.capital ? ' — capitale' : ''} ({c.q},{c.r})
                      </button>
                    </li>
                  {/each}
                </ul>
              </div>
            </div>
            <div class="btns">
              <button type="button" class="primary-btn" disabled={!angkorWonder || !angkorCity} onclick={confirmAngkor}>Construire la Merveille</button>
              <button type="button" onclick={() => (angkorDismissed = true)}>Décider plus tard</button>
            </div>
          </div>
        {/if}
        {#if busy}
          <div class="banner">
            {#if $view.phase === 'resolving'}Résolution du tour…{:else}Relecture du tour — clic sur la carte pour accélérer{/if}
          </div>
        {/if}
        {#if myInAnarchy}
          <div class="anarchy-banner">⚔️ ANARCHIE — marteaux, fioles, or et culture à zéro ce tour (R-122)</div>
        {/if}
        {#if showVictory}
          <div class="victory">
            <h1>{victoryEvent?.winner === myEngineId($view) ? 'Victoire !' : 'Défaite…'}</h1>
            <p>
              {victoryEvent
                ? `Vainqueur : ${nomJoueur(victoryEvent.winner)} — motif : ${
                    victoryEvent.reason === 'forfeit'
                      ? 'forfait'
                      : victoryEvent.reason === 'culture'
                        ? 'culturelle (Nations Unies achevées — R-116)'
                        : victoryEvent.reason === 'science'
                          ? 'scientifique (Vaisseau spatial lancé — R-124)'
                          : victoryEvent.reason === 'economique'
                            ? 'économique (Banque mondiale — 20 000 or, R-137)'
                            : victoryEvent.reason === 'razedCapital'
                              ? 'capitale rasée'
                              : 'domination (capitale capturée)'
                  }`
                : `Vainqueur : ${$view.state?.winner ?? '?'}`}
            </p>
            <a class="primary-btn" href="#/lobby">Retour au lobby</a>
          </div>
        {/if}
      </div>

      <!-- MENU-VILLE : pendant la vue ville, la colonne de droite disparaît
           ENTIÈREMENT (retour d'Erik : aucun panneau vide) — la carte prend
           toute la largeur et le panneau de ville flottant EST l'interface. -->
      {#if !vueVilleActive}
      <aside class="side">
        {#if myName}<p class="me">Vous jouez : <strong>{myName}</strong></p>{/if}
        <UnitPanel view={$view} ui={$ui} {client} onCancelDraft={cancelDraft} onCancelOrder={handleCancelOrder} onConfirmDraft={confirmDraft} onCenterUnit={(id) => canvasApi?.centerOnUnit(id)} onArmNuke={armNuke} onCancelNuke={cancelNuke} />
        {#if $view.state && myEngineId($view) && SHIP_COMPONENTS.some((c) => c.built)}
          <!-- RESOLUTION-DEPLACEMENTS §4 : la section « Course à l'espace »
               n'apparaît qu'à la PREMIÈRE complétion d'un composant du
               vaisseau (data-driven : bâtiments des villes — R-124). -->
          <section class="ship" aria-label="Vaisseau spatial">
            <h3>Vaisseau spatial (victoire scientifique — R-124)</h3>
            <ul>
              {#each SHIP_COMPONENTS as comp (comp.id)}
                <li class:done={comp.built}>
                  {comp.built ? '✅' : '⬜'} {comp.name}
                </li>
              {/each}
            </ul>
            {#if SHIP_COMPONENTS.every((c) => c.built)}
              <p class="ready">4/4 composants — lancement !</p>
            {:else}
              <p class="shiphint">Construisez les 4 composants (tech Vol spatial) dans vos villes.</p>
            {/if}
          </section>
        {/if}
        <Historique />
        <!-- REPLAY-RESOLUTION (D4) : relecture du dernier tour résolu.
             Indisponible sans paire mémorisée (reconnexion/chargement : le
             pré-état n'existe pas localement — L2, défaut sûr). -->
        <button
          type="button"
          class="replay-btn"
          class:active-toggle={replayActif}
          disabled={!$replayPair || playbackActive}
          title={$replayPair
            ? 'Rejouer le dernier tour résolu, depuis les positions d\u2019origine (clic = accélérer, Échap = quitter)'
            : 'Relecture indisponible : l\u2019état d\u2019avant résolution n\u2019est pas mémorisé (démarrage, reconnexion ou rechargement de la page)'}
          onclick={replayActif ? terminerReplay : demarrerReplay}
        >
          {replayActif ? '⏹ Quitter la relecture (Échap)' : '⟲ Rejouer la résolution'}
        </button>
        <Journal view={$view} onCentrerHex={(hex) => canvasApi?.centerOnHex(hex)} />
        <details class="raw">
          <summary>État brut (debug)</summary>
          <pre>{JSON.stringify($view.state, null, 2)}</pre>
        </details>
      </aside>
      {/if}
    </div>
  {/if}

  {#if showResearch && $view.state}
    <ResearchPanel view={$view} {client} onClose={() => (showResearch = false)} />
  {/if}

  {#if showGovernment && $view.state}
    <GovernmentPanel view={$view} {client} onClose={() => (showGovernment = false)} />
  {/if}

  <div class="toasts" role="status">
    {#each $toasts as t (t.id)}
      <div class="toast {t.kind}">{t.text}</div>
    {/each}
    {#each errorToasts as t (t.id)}
      <div class="toast {t.kind}">{t.text}</div>
    {/each}
  </div>
</main>

<style>
  main.game { display: flex; flex-direction: column; height: 100vh; font-family: system-ui, sans-serif; color: #e3e8ec; background: #10151a; }
  .bar { display: flex; gap: 0.9rem; align-items: center; flex-wrap: wrap; border-bottom: 2px solid #2c353d; padding: 0.45rem 0.9rem; background: #171e24; }
  .bar a { color: #7fb3ff; }
  .chip { padding: 0.1rem 0.55rem; border-radius: 999px; border: 1px solid #3c4a55; font-size: 0.8rem; background: #1f2a33; }
  .chip.resolving { border-color: #8d6e63; background: #332a24; }
  .chip.locked { border-color: #7a5b3c; background: #2e251c; }
  .research { display: inline-flex; align-items: center; gap: 0.35rem; }
  .research img { width: 16px; height: 16px; }
  .research .minibar { display: inline-block; width: 4rem; height: 7px; background: #12161a; border: 1px solid #3a4148; border-radius: 4px; overflow: hidden; }
  .research .minifill { display: block; height: 100%; background: #6fa3b8; }
  .research .reserve { color: #ffe082; font-style: normal; }
  .gov { display: inline-flex; align-items: center; gap: 0.35rem; }
  .gov img { width: 16px; height: 16px; }
  .gov.anarchy { border-color: #a35b45; background: #3a2420; }
  .anarchy-banner { position: absolute; top: 3.2rem; left: 50%; transform: translateX(-50%); background: #3a2420e6; border: 1px solid #a35b45; padding: 0.4rem 1rem; border-radius: 999px; font-size: 0.9rem; font-weight: 600; color: #ffab91; }
  .ship { border: 1px solid #3a4148; border-radius: 8px; padding: 0.6rem 0.8rem; background: #1d242b; }
  .ship h3 { margin: 0 0 0.35rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; color: #9aa7b2; }
  .ship ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.88rem; }
  .ship li.done { color: #81c784; }
  .ship .ready { color: #81c784; font-weight: 600; margin: 0.3rem 0 0; }
  .ship .shiphint { color: #8b98a5; font-size: 0.8rem; margin: 0.3rem 0 0; }
  .civbadge {
    display: flex; flex-direction: column; align-items: flex-start; gap: 0;
    border: 1px solid #7fc79a; border-radius: 6px; background: #1d2b21;
    color: var(--fg, #e8e8e8); padding: 0.15rem 0.5rem; cursor: pointer; font: inherit;
  }
  .civbadge .civname { font-weight: 700; font-size: 0.8rem; }
  .civbadge .eraname { font-size: 0.68rem; color: #9db8a6; }
  .net { font-size: 0.8rem; color: #8b98a5; }
  .gpt { font-size: 0.78rem; color: #a5d6a7; font-weight: 400; }
  .gpt.negative { color: #ef9a9a; }
  .milestone { font-size: 0.8rem; color: #ffd54f; font-weight: 400; }
  .res { display: inline-flex; align-items: center; gap: 0.25rem; font-weight: 600; }
  .res img { width: 18px; height: 18px; vertical-align: middle; }
  .net-open { color: #81c784; }
  .net-connecting { color: #ffd54f; }
  .net-closed { color: #e57373; }
  button { padding: 0.35rem 0.8rem; cursor: pointer; border-radius: 6px; border: 1px solid #46525c; background: #27313a; color: inherit; }
  button:disabled { opacity: 0.45; cursor: default; }
  button.primary { background: #2e5e3f; border-color: #3c7a52; }
  button.primary.blocage { background: #5c3a20; border-color: #a3703c; color: #ffcc80; }
  .body { display: flex; flex: 1; min-height: 0; }
  .map-area { position: relative; flex: 1; min-width: 0; }
  .side { width: 350px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.6rem; padding: 0.6rem; border-left: 2px solid #2c353d; background: #141a20; }
  .me { margin: 0; font-size: 0.85rem; color: #9aa7b2; }
  .banner { position: absolute; top: 0.7rem; left: 50%; transform: translateX(-50%); background: #000000cc; padding: 0.4rem 1rem; border-radius: 999px; font-size: 0.9rem; pointer-events: none; }
  .victory { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.8rem; background: #000000b8; text-align: center; }
  .victory h1 { font-size: 2.4rem; margin: 0; }
  .idle-dialog { justify-content: center; background: #000000a8; z-index: 5; }
  .idle-dialog h2 { margin: 0; }
  .idle-dialog ul { text-align: left; max-height: 40vh; overflow: auto; }
  .idle-dialog .btns { display: flex; gap: 0.6rem; }
  .idle-dialog button { padding: 0.4rem 1rem; border-radius: 6px; border: 1px solid #46525c; background: #27313a; color: inherit; cursor: pointer; }
  .nuke-dialog h2 { color: #ffb74d; }
  .angkor-dialog { max-width: 760px; }
  .angkor-cols { display: flex; gap: 1.2rem; justify-content: center; }
  .angkor-list { list-style: none; margin: 0; padding: 0; max-height: 42vh; overflow: auto; display: flex; flex-direction: column; gap: 0.25rem; }
  .angkor-list button { padding: 0.3rem 0.7rem; border-radius: 6px; border: 1px solid #46525c; background: #27313a; color: inherit; cursor: pointer; width: 100%; text-align: left; }
  .angkor-list button.selected { border-color: #d9a93f; background: #3a3222; color: #ffd479; }
  .nuke-warn { color: #ef9a9a; font-weight: 600; max-width: 34rem; }
  .nuke-hint { color: #8b98a5; font-size: 0.82rem; max-width: 34rem; }
  .primary-btn { background: #2e5e3f; border: 1px solid #3c7a52; padding: 0.5rem 1.2rem; border-radius: 6px; color: inherit; text-decoration: none; }
  .center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.4rem; text-align: center; }
  .waiting { font-size: 1.2rem; }
  .toasts { position: fixed; right: 1rem; top: 3.2rem; display: flex; flex-direction: column; gap: 0.4rem; z-index: 10; max-width: 22rem; }
  .toast { padding: 0.45rem 0.8rem; border-radius: 6px; font-size: 0.88rem; box-shadow: 0 2px 8px #00000080; }
  .toast.info { background: #24404f; }
  .toast.good { background: #2c4a33; }
  .toast.bad { background: #54262a; }
  .raw summary { cursor: pointer; color: #8b98a5; font-size: 0.82rem; }
  .raw pre { max-height: 18rem; overflow: auto; font-size: 0.68rem; color: #93a1ad; }
</style>
