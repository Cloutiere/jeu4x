<script lang="ts">
  /**
   * Panneau de l'unité sélectionnée (L5) : caractéristiques, ordre courant,
   * actions contextuelles (Hold, FoundCity, Attaque, brouillon de déplacement).
   * Le client ne calcule aucune règle : les boutons reflètent ce que l'état
   * filtré autorise ; la validation finale reste serveur.
   */
  import { CITY_DEFENSE_BONUS, FORTIFY_DEFENSE_BONUS, MIN_CITY_DISTANCE, BUILDINGS, TERRAINS, RESOURCES, RESOURCE_UNKNOWN, SPY_STEAL_GOLD_PCT, combatOdds, effectiveStrength, hexDistanceW, isWonderObsolete, landCombatBonus, neighborsW, unitType, wonderAttackBonusEmpireOf, allKnownTechs, explorerGoldInjectionForEra, eraOfPlayer, civIdOf } from '@game/rules';
  import type { Order, SpyActionKind } from '@game/shared';
  import type { GameClient, GameView } from '../lib/gameClient.js';
  import { myEngineId, ordersEditable, unitAtHex, cityAtHex, enterableKnown } from '../lib/render/interaction.js';
  import { consumeEffectLabel, settleEffectLabel, greatPersonLabel, SPY_ACTION_LABELS } from '../lib/labels.js';
  import type { UiState } from '../lib/render/ui.js';

  interface Props {
    view: GameView;
    ui: UiState;
    client: GameClient;
    onCancelDraft(): void;
    /** CORRECTIFS-SELECTION · M2 : annulation UNIFIÉE (ordre soumis + brouillon UI purgés ensemble). */
    onCancelOrder(unitId: string): void;
    onConfirmDraft?(): void;
    onCenterUnit(unitId: string): void;
    /** EMBARQUEMENT-PROGRAMME · D3-A : sélection de la cargaison depuis le navire. */
    onSelectUnit?(unitId: string): void;
    /** 7m · R-139 : arme le mode ciblage d'ICBM (toute case cliquée devient
     *  une cible pressentie, confirmée par modale côté page avant l'ordre). */
    onArmNuke?(unitId: string): void;
    onCancelNuke?(): void;
  }

  let { view, ui, client, onCancelDraft, onCancelOrder, onConfirmDraft, onCenterUnit, onSelectUnit, onArmNuke, onCancelNuke }: Props = $props();

  const unit = $derived(view.state && ui.selectedUnitId ? view.state.units[ui.selectedUnitId] : null);
  const mine = $derived(!!unit && unit.owner === myEngineId(view));
  const editable = $derived(ordersEditable(view));
  const stats = $derived(unit ? unitType(unit.type) : null);
  const draftHere = $derived(ui.draft && unit && ui.draft.unitId === unit.id ? ui.draft : null);

  /** 7i · D5 · R-64 (rév.) : la case du colon porte-t-elle une ressource
   *  connue ? Fonder la DÉTRUIT définitivement — avertissement avant l'ordre. */
  const resourceOnTile = $derived.by(() => {
    if (!unit || !view.state) return null;
    const tile = view.state.map[`${unit.q},${unit.r}`];
    if (!tile?.resource) return null;
    return tile.resource === RESOURCE_UNKNOWN ? 'une ressource (identité non révélée)' : (RESOURCES[tile.resource]?.name ?? tile.resource);
  });
  const currentOrder = $derived(
    unit ? view.orders.find((o) => 'unitId' in o && o.unitId === unit.id) ?? null : null,
  );

  /** DEPLACEMENT-PLANIFIE · R-158 (D5) : ordre de déplacement (simple ou
   *  composite) de l'unité sélectionnée — support du bouton multi-étapes. */
  const moveOrder = $derived(
    currentOrder && (currentOrder.type === 'Move' || currentOrder.type === 'MultiStep') ? currentOrder : null,
  );
  const isFoundAtArrival = $derived(moveOrder?.type === 'MultiStep' && moveOrder.final === 'foundCity');

  /** R-158 : convertit l'ordre de déplacement courant en composite
   *  « déplacer puis fonder » (même chemin, action finale foundCity). */
  function foundAtArrival(): void {
    if (!unit || !moveOrder) return;
    client.submitOrder({ type: 'MultiStep', unitId: unit.id, path: moveOrder.path, final: 'foundCity' });
  }

  /** R-158 : retirer l'action finale (revient à un déplacement simple). */
  function removeFoundAtArrival(): void {
    if (!unit || !moveOrder) return;
    client.submitOrder({ type: 'Move', unitId: unit.id, path: moveOrder.path });
  }

  /** Cibles d'attaque : UNITÉS ennemies VISIBLES adjacentes (état filtré).
   * Une ville vide adjacente ne se « combat » pas : on y entre (R-57/R-65). */
  const attackTargets = $derived.by(() => {
    if (!unit || !mine || !stats?.canAttack || !editable || !view.state) return [];
    return neighborsW(unit, view.state!.mapWidth)
      .map((h) => {
        const enemyUnit = unitAtHex(view.state!, h);
        if (!enemyUnit || enemyUnit.owner === unit.owner) return null;
        return { hex: h, label: enemyUnit.id };
      })
      .filter((t): t is { hex: { q: number; r: number }; label: string } => t !== null);
  });

  /** Villes ennemies adjacentes sans unité visible → entrée (capture/assaut). */
  const cityEntries = $derived.by(() => {
    if (!unit || !mine || !editable || !view.state) return [];
    return neighborsW(unit, view.state!.mapWidth)
      .map((h) => {
        const occupied = unitAtHex(view.state!, h);
        const city = occupied ? null : cityAtHex(view.state!, h);
        if (!city || city.owner === unit.owner) return null;
        return { hex: h, label: city.id };
      })
      .filter((t): t is { hex: { q: number; r: number }; label: string } => t !== null);
  });

  function enterCity(target: { q: number; r: number }): void {
    if (!unit) return;
    client.submitOrder({ type: 'Move', unitId: unit.id, path: [target] });
  }

  function orderLabel(o: Order): string {
    switch (o.type) {
      case 'Move':
        return `Déplacement (${o.path.length} case${o.path.length > 1 ? 's' : ''})`;
      case 'MultiStep':
        return o.final === 'foundCity'
          ? `Multi-étapes (R-158) : 1. déplacer (${o.path.length} case${o.path.length > 1 ? 's' : ''}) → 2. fonder`
          : `Déplacement (${o.path.length} case${o.path.length > 1 ? 's' : ''})`;
      case 'Attack':
        return `Attaque en (${o.target.q},${o.target.r})`;
      case 'FoundCity':
        return 'Fonder une ville';
      case 'Hold':
        return 'Tenir la position';
      case 'Fortify':
        return 'Fortifier';
      case 'FormArmy':
        return 'Formation d\'armée';
      case 'SetProduction':
        return 'Production';
      case 'SetWorkedTile':
        return o.tile ? `Citoyen vers (${o.tile})` : 'Citoyen retiré';
      case 'InstallPerson':
        return `Installation (Settle) dans ${o.cityId}`;
      case 'GreatPersonAction':
        return o.action === 'settle' ? `Installation (Settle) dans ${o.cityId}` : `Utilisation (Consume) — ${o.cityId}`;
      case 'RushBuy':
        return `Achat instantané dans ${o.cityId}`;
      case 'SpyMission':
        return `Mission d'espionnage : ${o.cityId} (vol de GP)`;
      case 'Launch':
        return `☢️ Lancement d'ICBM sur (${o.target.q},${o.target.r}) — irréversible`;
      case 'SpyAction':
        return `Espionnage : ${SPY_ACTION_LABELS[o.action] ?? o.action} → ${o.cityId}`;
      default:
        return 'Ordre';
    }
  }

  function submitAttack(target: { q: number; r: number }): void {
    if (!unit) return;
    client.submitOrder({ type: 'Attack', unitId: unit.id, target });
  }

  /** R-64/T-09 : une ville CONNUE (état filtré) à distance < T-09 interdit la fondation. */
  const cityTooClose = $derived.by(() => {
    if (!unit || !view.state) return false;
    return Object.values(view.state.cities).some((c) => hexDistanceW(c, unit, view.state!.mapWidth) < MIN_CITY_DISTANCE);
  });

  /** 7f · R-115 : villes AMIES sur la case du GP ou adjacentes — installation
   *  définitive (+1 jalon culturel, le GP est consommé).
   *  7k · C3 (veto d'Erik du 04/09) : UN SEUL GP d'un même type par ville —
   *  la ville cible expose `already` pour désactiver le bouton Settle. */
  const installTargets = $derived.by(() => {
    if (!unit || !mine || !editable || !view.state || !stats?.greatPerson) return [];
    return Object.values(view.state.cities)
      .filter((c) => c.owner === unit.owner && hexDistanceW(c, unit, view.state!.mapWidth) <= 1)
      .map((c) => ({ id: c.id, already: c.settledGreatPersons.includes(unit.type) }));
  });

  /** 7j · R-126 : Settle — installation permanente dans la cité hôte. */
  function installIn(cityId: string): void {
    if (!unit) return;
    client.submitOrder({ type: 'GreatPersonAction', action: 'settle', unitId: unit.id, cityId });
  }

  /** 7l · Bloc 5 · R-126 : l'Explorateur/Industriel est ACTIVÉ — injection
   *  d'or fixe par ère (50/100/200/400 — economy.json, source unique moteur). */
  const explorerInjection = $derived.by(() => {
    if (!unit || unit.type !== 'explorateur' || !view.state) return null;
    // 7n · R-147 : ère persistée du joueur (compage de techs).
    return explorerGoldInjectionForEra(eraOfPlayer(view.state.players[unit.owner]));
  });

  /** 7j · R-126 : Consume — effet massif immédiat, le GP disparaît. */
  function consumeIn(cityId: string): void {
    if (!unit) return;
    client.submitOrder({ type: 'GreatPersonAction', action: 'consume', unitId: unit.id, cityId });
  }

  /** 7g · R-117 : infos de transport — le navire sélectionné porte-t-il une
   *  cargaison ? L'unité sélectionnée est-elle embarquée ? */
  // EMBARQUEMENT-PROGRAMME · D7 : capacité infinie — la pile à bord se lit
  // par `aboard` (le champ `cargo` ne garde que le premier passager).
  const passagers = $derived(
    unit && view.state
      ? Object.values(view.state.units).filter((u) => u.aboard === unit.id)
      : [],
  );
  const cargoUnit = $derived(
    unit && unit.cargo && view.state ? view.state.units[unit.cargo] ?? null : null,
  );
  const transportUnit = $derived(
    unit && unit.aboard && view.state ? view.state.units[unit.aboard] ?? null : null,
  );

  /** 7g · R-117 : cases de DÉBARQUEMENT de la cargaison — terrestres libres
   *  adjacentes au transport (mêmes contraintes que le moteur). */
  const disembarkTiles = $derived.by(() => {
    if (!unit || !cargoUnit || !view.state) return [];
    return neighborsW(unit, view.state!.mapWidth).filter(
      (h) => enterableKnown(view.state!, cargoUnit, h) && !unitAtHex(view.state!, h),
    );
  });

  function disembark(hex: { q: number; r: number }): void {
    if (!cargoUnit) return;
    client.submitOrder({ type: 'Move', unitId: cargoUnit.id, path: [hex] });
  }

  /** 7g · R-119 : villes ENNEMIES VISIBLES adjacentes — mission de vol de GP
   *  (l'espion n'entre jamais dans la ville : il agit depuis sa case). */
  const spyTargets = $derived.by(() => {
    if (!unit || !mine || !editable || !view.state || !stats?.spy) return [];
    return neighborsW(unit, view.state!.mapWidth)
      .map((h) => {
        const city = cityAtHex(view.state!, h);
        if (!city || city.owner === unit.owner) return null;
        return { cityId: city.id, hex: h };
      })
      .filter((t): t is { cityId: string; hex: { q: number; r: number } } => t !== null);
  });

  function stealFrom(cityId: string): void {
    if (!unit) return;
    client.submitOrder({ type: 'SpyMission', unitId: unit.id, cityId, mission: 'stealGreatPerson' });
  }

  // 7m · R-142/R-144 : l'espion sélectionné est-il EN VILLE ? Garnison (ville
  // amie — contre-espionnage) ou infiltration (ville ennemie — menu R-143).
  const spyCity = $derived.by(() => {
    if (!unit || !view.state || !stats?.spy) return null;
    return Object.values(view.state.cities).find((c) => c.q === unit.q && c.r === unit.r) ?? null;
  });
  const garrisonCity = $derived(spyCity && unit && spyCity.owner === unit.owner ? spyCity : null);
  const infiltratedCity = $derived(spyCity && unit && spyCity.owner !== unit.owner ? spyCity : null);

  // 7m · R-143.4 🔶 : cibles de « Détruire un bâtiment » — non-Palais (les
  // merveilles ne sont pas des bâtiments). Le choix du tireur est obligatoire.
  let buildingChoice = $state('');
  const sabotageTargets = $derived(infiltratedCity ? infiltratedCity.buildings.filter((b) => b !== 'palais') : []);
  // 7m · R-143.5 : une fortification est-elle annulable (défenseur fortifié) ?
  const fortificationTarget = $derived.by(() => {
    if (!infiltratedCity || !view.state) return false;
    return Object.values(view.state.units).some(
      (u) => u.owner === infiltratedCity.owner && !unitType(u.type).spy && u.q === infiltratedCity.q && u.r === infiltratedCity.r && u.fortified,
    );
  });

  /** 7m · R-143 : soumet une action d'espionnage (cible : la ville infiltrée). */
  function spyAction(action: SpyActionKind): void {
    if (!unit || !infiltratedCity) return;
    const building = action === 'destroyBuilding' ? (buildingChoice || sabotageTargets[0]) : undefined;
    client.submitOrder({ type: 'SpyAction', unitId: unit.id, cityId: infiltratedCity.id, action, ...(building ? { buildingId: building } : {}) });
  }

  /**
   * 7h · R-125 · Oracle : pré-confirmation de combat avec l'issue exacte
   * (🔶 simple) — probabilité de toucher par round p = S_att²/(S_att²+S_def²)
   * (même formule que le moteur, §7.4). Actif si l'empire contrôle l'Oracle
   * (non obsolète — Religion, R-110). Interprétation : le tir seedé reste à
   * la résolution ; l'UI affiche les probabilités exactes et le vainqueur
   * attendu.
   */
  const oracleActive = $derived.by(() => {
    const id = myEngineId(view);
    if (!id || !view.state) return false;
    // 7k · M1/R-128 : obsolescence GLOBALE — l'Oracle meurt si QUI QUE CE SOIT
    // découvre la Religion (union des techs de toutes les civilisations).
    const allTechs = allKnownTechs(view.state);
    return Object.values(view.state.cities).some(
      (c) => c.owner === id && c.wonders.includes('oracle_de_delphes') && !isWonderObsolete('oracle_de_delphes', allTechs),
    );
  });

  const attackPreviews = $derived.by(() => {
    if (!oracleActive || !unit || !stats || !view.state) return new Map<string, number>();
    const me = view.state.players[unit.owner]!;
    const allTechs = allKnownTechs(view.state); // M1/R-128 : union pour Himeji
    const cities = Object.values(view.state.cities);
    const effects = { ...(me.government ? { landAttackBonus: undefined } : {}) };
    void effects;
    const preview = new Map<string, number>();
    for (const t of attackTargets) {
      const defender = view.state.units[t.label];
      if (!defender) continue;
      const dStats = unitType(defender.type);
      const tile = view.state.map[`${t.hex.q},${t.hex.r}`];
      const terrainBonus = tile ? TERRAINS[tile.terrain]?.defenseBonus ?? 0 : 0;
      const city = cities.find((c) => c.q === t.hex.q && c.r === t.hex.r && c.owner === defender.owner);
      let cityBonus = 0;
      if (city) for (const b of city.buildings) cityBonus += BUILDINGS[b]?.cityDefenseBonus ?? 0;
      const sAtt =
        effectiveStrength(stats.attack, unit.veteran) +
        wonderAttackBonusEmpireOf(cities, unit.owner, allTechs) +
        landCombatBonus({ landAttackBonus: 1 }, { aquatic: stats.aquatic }, 'attack') *
          (me.government === 'fondamentalisme' ? 1 : 0);
      const sDef =
        effectiveStrength(
          dStats.defense,
          defender.veteran,
          terrainBonus + (defender.fortified ? FORTIFY_DEFENSE_BONUS : 0) + cityBonus,
        ) +
        landCombatBonus({ landDefenseBonus: 1 }, { aquatic: dStats.aquatic }, 'defense') *
          (view.state.players[defender.owner]?.government === 'fondamentalisme' ? 1 : 0);
      preview.set(t.label, combatOdds(sAtt, sDef));
    }
    return preview;
  });
</script>

<section class="panel">
  <h2>Unité</h2>
  {#if !unit}
    <p class="hint">Cliquez sur une unité de la carte.</p>
  {:else}
    <div class="rows">
      <span class="title">{stats?.name ?? unit.type}{unit.veteran ? ' ★' : ''}{unit.isArmy ? ' (armée)' : ''}</span>
      {#if stats?.isRanged}<span class="ranged" title="R-59 : attaque depuis sa case, sans avancer, sans riposte de mêlée">🎯 À distance</span>{/if}
      {#if stats?.aquatic}
        <span class="naval" title="R-117 : navigue sur {stats.navalAccess === 'ocean' ? 'la côte ET l\'océan' : 'la côte seule'}{stats.cargoCapacity ? ` — transporte ${stats.cargoCapacity} unité terrestre` : ''}">
          ⚓ Naval ({stats.navalAccess === 'ocean' ? 'côte + océan' : 'côte'}){stats.cargoCapacity ? ` — cargaison ${cargoUnit ? '1/1' : '0/1'}` : ''}
        </span>
      {/if}
      {#if unit.aboard}<span class="naval" title="R-117 : l'unité est à bord — donnez un Move vers une case terrestre libre pour débarquer">🚢 À bord de {unit.aboard}</span>{/if}
      {#if unit.fortified}<span class="fortified" title="Bonus défensif de fortification (R-33)">🛡 Fortifié</span>{/if}
      {#if stats?.spy && garrisonCity}<span class="fortified" title="R-144 : contre-espionnage — un espion en garnison déclenche un duel contre tout espion ennemi">🕵 Garnison ({garrisonCity.id}) — contre-espionnage</span>{/if}
      {#if stats?.spy && infiltratedCity}<span class="enemy" title="R-143 : infiltration — le menu d'actions est ouvert ci-dessous">🕵 Infiltré dans {infiltratedCity.id}</span>{/if}
      {#if !mine}<span class="enemy">Ennemi — {unit.owner}</span>{/if}
      {#if mine}
        <!-- UI-JEU-T2 · D3 : PV en barre à compartiments (même langage que la
             barre 3 vies du canvas et le popover RAPPORT-ENGAGEMENT). -->
        <span class="pv-ligne">
          <span class="pv barre" aria-hidden="true">
            {#each Array(stats?.hpMax ?? 3) as _, i (i)}
              <span class="cellule" class:pleine={i < unit.hp} class:perte={i >= unit.hp}></span>
            {/each}
          </span>
          <span class="pv-texte" class:blesse={unit.hp < (stats?.hpMax ?? 3)}>PV {unit.hp}/{stats?.hpMax ?? '?'}</span>
        </span>
        <span>PM <strong>{unit.mp}</strong> / {stats?.movement ?? '?'}</span>
        {#if unit.order}<span class="frozen">Chemin gelé : {unit.order.type}</span>{/if}
      {/if}
    </div>

    {#if !mine}
      <p class="hint">Unité ennemie visible (lecture seule).</p>
    {:else}
      {#if currentOrder}<p class="order">Ordre : {orderLabel(currentOrder)}</p>{/if}

      {#if draftHere}
        <p class="hint">Clic droit sur une case : destination du déplacement (chemin complet soumis) · Clic droit MAINTENU : préview multi-tours, relâcher sur la case = confirmer · Clic droit hors case valide : annulation.</p>
      {:else if editable}
        <p class="hint">Clic gauche : sélectionner (re-clic : désélectionner) · Clic droit : destination de l'unité sélectionnée — la tuile visée s'entoure au survol, maintenez le clic droit pour la préview multi-tours (1)(2) et relâchez pour confirmer.</p>
      {/if}
      <div class="btns">
        <button type="button" disabled={!editable} onclick={() => unit && client.submitOrder({ type: 'Hold', unitId: unit.id })}>
          Tenir la position
        </button>
        {#if unit.fortified}
          <!-- ENGAGEMENT R-175 : la fortification est durable — elle persiste
               tant que l'unité demeure sur sa case (même en mêlée). Elle ne
               peut plus être annulée par ordre : seul un déplacement la perd. -->
          <span class="fortified" title="ENGAGEMENT R-175 : fortification durable — conservée tant que l'unité demeure sur cette case (même en mêlée), perdue si elle bouge.">🛡 Fortification durable</span>
        {:else if unit.stabilized}
          <!-- ENGAGEMENT R-174 : seule une unité STABILISÉE (seule sur sa case en fin du tour précédent) peut se fortifier. -->
          <button type="button" disabled={!editable} title="ENGAGEMENT R-174/R-175 : fortification durable (+25 %) — conservée tant que l'unité demeure sur sa case, même en mêlée ; perdue si elle bouge." onclick={() => unit && client.submitOrder({ type: 'Fortify', unitId: unit.id })}>
            Fortifier
          </button>
        {:else}
          <span class="fortified" title="ENGAGEMENT R-174 : une case instable (plusieurs unités, ou arrivée ce tour) ne permet pas de se fortifier — laissez l'unité seule sur sa case un tour.">Instable — fortification indisponible</span>
        {/if}
        {#if stats?.canFoundCity}
          {#if resourceOnTile}
            <p class="found-warning" title="R-64 (rév., 7i D5) : la ressource sous la ville serait effacée du jeu">
              ⚠ Fonder ici détruirait DÉFINITIVEMENT {resourceOnTile} — préférez une case voisine.
            </p>
          {/if}
          <button
            type="button"
            disabled={!editable || cityTooClose}
            title={cityTooClose ? `Une ville connue est à distance < ${MIN_CITY_DISTANCE} (T-09) — déplacez le colon.` : resourceOnTile ? 'La ressource de cette case sera détruite (R-64 rév.)' : 'Fonde une ville (pop initiale selon l\'ère — R-64 rév.)'}
            onclick={() => unit && client.submitOrder({ type: 'FoundCity', unitId: unit.id })}
          >
            Fonder une ville
          </button>
          {#if moveOrder && !isFoundAtArrival}
            <!-- DEPLACEMENT-PLANIFIE · R-158 (D5) : déplacement(s) PUIS fondation
                 dans le même tour, dans la limite des PM. Si les PM manquent au
                 terme du chemin, la fondation est annulée et le mouvement conservé. -->
            <button
              type="button"
              class="primary"
              disabled={!editable}
              title="Ordre multi-étapes (R-158) : le colon exécute son déplacement puis fonde — dans la limite de ses PM ; PM insuffisants → fondation annulée, mouvement conservé."
              onclick={foundAtArrival}
            >
              1. Déplacer ({moveOrder.path.length} case{moveOrder.path.length > 1 ? 's' : ''}) → 2. Fonder
            </button>
          {:else if isFoundAtArrival}
            <button
              type="button"
              disabled={!editable}
              title="Retire la fondation à l'arrivée — conserve le déplacement simple (R-158)."
              onclick={removeFoundAtArrival}
            >
              Ne pas fonder à l'arrivée
            </button>
          {/if}
        {/if}
        {#if currentOrder}
          <button type="button" disabled={!editable} onclick={() => unit && onCancelOrder(unit.id)}>
            Annuler l'ordre
          </button>
        {/if}
      </div>
      {#if attackTargets.length > 0}
        {#if oracleActive}<p class="oracle-note">🔮 Oracle (R-125) : l'issue exacte du combat est révélée — % de toucher par round, vainqueur attendu marqué ✓.</p>{/if}
        <div class="btns">
          {#each attackTargets as t (t.hex.q + ',' + t.hex.r)}
            <button
              type="button"
              class="danger"
              disabled={!editable}
              title={stats?.isRanged ? 'Attaque à distance (R-59) : vous restez sur votre case' : undefined}
              onclick={() => submitAttack(t.hex)}
            >
              {stats?.isRanged ? 'Tirer sur' : 'Attaquer'} {t.label} ({t.hex.q},{t.hex.r}){#if oracleActive && attackPreviews.has(t.label)}<span class="odds"> — {Math.round((attackPreviews.get(t.label) ?? 0) * 100)} %/round{#if (attackPreviews.get(t.label) ?? 0) >= 0.5} ✓{/if}</span>{/if}
            </button>
          {/each}
        </div>
      {/if}
      {#if cityEntries.length > 0}
        <div class="btns">
          {#each cityEntries as t (t.hex.q + ',' + t.hex.r)}
            <button type="button" disabled={!editable} onclick={() => enterCity(t.hex)}>
              Entrer dans la ville {t.label} ({t.hex.q},{t.hex.r})
            </button>
          {/each}
        </div>
      {/if}
      {#if installTargets.length > 0}
        <!-- 7j · R-126 : dialogue Consume/Settle — le jalon est déjà compté à
             l'obtention ; les effets reportés v1 sont grisés « reporté ». -->
        <div class="btns">
          {#each installTargets as t (t.id)}
            <button
              type="button"
              class="primary"
              disabled={!editable || t.already}
              title={t.already
                ? `C3 (7k) : un ${greatPersonLabel(unit.type)} est déjà installé dans ${t.id} — un seul GP d'un même type par ville ; choisissez une autre ville ou Consume.`
                : `R-126 : installation permanente — ${settleEffectLabel(unit.type)}`}
              onclick={() => installIn(t.id)}
            >
              {t.already ? `${greatPersonLabel(unit.type)} déjà installé dans ${t.id}` : `Installer dans ${t.id} (Settle — ${settleEffectLabel(unit.type)})`}
            </button>
            {#if unit.type === 'explorateur'}
              <!-- 7l · Bloc 5 : injection d'or ACTIVE — montant selon l'ère. -->
              <button
                type="button"
                class="danger"
                disabled={!editable}
                title="R-126 : effet massif immédiat, le GP disparaît — {explorerInjection} or versés à la trésorerie (R-134)"
                onclick={() => consumeIn(t.id)}
              >
                Utiliser maintenant (Consume — +{explorerInjection} or à la trésorerie)
              </button>
            {:else if consumeEffectLabel(unit.type)}
              <button
                type="button"
                class="danger"
                disabled={!editable}
                title="R-126 : effet massif immédiat, le GP disparaît"
                onclick={() => consumeIn(t.id)}
              >
                Utiliser maintenant (Consume — {consumeEffectLabel(unit.type)})
              </button>
            {:else}
              <button type="button" disabled title="Effet reporté : flip culturel (territoire, en suspens)">
                Consume — reporté (territoire)
              </button>
            {/if}
          {/each}
        </div>
      {/if}
      {#if spyTargets.length > 0}
        <div class="btns">
          {#each spyTargets as t (t.cityId)}
            <button
              type="button"
              class="danger"
              disabled={!editable}
              title="R-119 : vol d'un Personnage illustre installé — la victime perd 1 jalon, vous en gagnez 1 ; l'espion est consommé. L'échec (rien à voler) est sans frais."
              onclick={() => stealFrom(t.cityId)}
            >
              Mission : voler un GP — {t.cityId}
            </button>
          {/each}
        </div>
      {/if}
      {#if stats?.strategic}
        <!-- 7m · R-138/R-139 : l'ICBM ne se produit pas — elle se LANCE.
             La confirmation explicite est une modale côté page (irréversible). -->
        {#if ui.nukeArmed === unit.id}
          <p class="nuke-armed">☢️ CIBLAGE ACTIF — cliquez une case visible de la carte pour désigner la cible.</p>
          <div class="btns">
            <button type="button" onclick={() => onCancelNuke?.()}>Annuler le ciblage</button>
          </div>
        {:else}
          <div class="btns">
            <button
              type="button"
              class="danger"
              disabled={!editable}
              title="R-139 : portée globale, missile consommé — INTERDIT sous Démocratie (R-140) ; frappe = −1 jalon culturel sauf Despotisme (🔶 R-140)"
              onclick={() => onArmNuke?.(unit.id)}
            >
              ☢️ Lancer l'ICBM…
            </button>
          </div>
        {/if}
      {/if}
      {#if infiltratedCity && mine}
        <!-- 7m · R-143 : menu d'actions d'espionnage (extension du panneau) —
             toute action hostile exécutée consomme l'espion ; une action sans
             cible valable échoue sans frais (espion survit) ; « Partir
             discrètement » est toujours sans risque. -->
        <h3 class="spy-title">Actions d'espionnage — {infiltratedCity.id}</h3>
        <div class="btns">
          <button type="button" class="danger" disabled={!editable} title="R-143.1 : {Math.round(SPY_STEAL_GOLD_PCT * 100)} % de la trésorerie adverse (arrondi au plus proche) — la victime est notifiée du montant" onclick={() => spyAction('stealGold')}>
            Voler de l'or ({Math.round(SPY_STEAL_GOLD_PCT * 100)} % de la trésorerie)
          </button>
          <button type="button" class="danger" disabled={!editable} title="R-143.2 : un GP « en attente de choix » présent est transféré à votre capitale (aucun jalon ne varie)" onclick={() => spyAction('kidnapGreatPerson')}>
            Enlever un Personnage illustre
          </button>
          <button type="button" class="danger" disabled={!editable || !infiltratedCity.production} title={infiltratedCity.production ? 'R-143.3 : les marteaux investis du projet en cours sont remis à zéro (la réserve C7 est épargnée)' : 'Aucune production en cours — échec sans frais'} onclick={() => spyAction('sabotageProduction')}>
            Saboter la production
          </button>
          {#if sabotageTargets.length > 0}
            <label class="pick">
              Bâtiment :
              <select bind:value={buildingChoice}>
                <option value="" disabled>Choisir…</option>
                {#each sabotageTargets as b (b)}<option value={b}>{BUILDINGS[b]?.name ?? b}</option>{/each}
              </select>
            </label>
            <button type="button" class="danger" disabled={!editable || !buildingChoice} title="R-143.4 🔶 : détruit le bâtiment choisi (non-Palais ; les merveilles sont épargnées)" onclick={() => spyAction('destroyBuilding')}>
              Détruire un bâtiment
            </button>
          {/if}
          <button type="button" class="danger" disabled={!editable || !fortificationTarget} title={fortificationTarget ? 'R-143.5 : annule la fortification (R-33) du défenseur' : 'Aucun défenseur fortifié — échec sans frais'} onclick={() => spyAction('destroyFortifications')}>
            Détruire les fortifications
          </button>
          <button type="button" class="primary" disabled={!editable} title="R-143.6 : reposition sur une case adjacente libre — l'espion N'EST PAS consommé" onclick={() => spyAction('leave')}>
            Partir discrètement
          </button>
        </div>
        <p class="hint">R-144 : si un espion ennemi est en garnison, un duel précède toute action hostile (50 % isolé vs isolé 🔶) — sans garnison, succès automatique.</p>
      {/if}
      {#if passagers.length > 0}
        <p class="hint">🚢 Charge ({passagers.length}) — cliquez un passager pour le sélectionner, puis clic droit sur une case terrestre LIBRE adjacente au navire (ou à un pas de son chemin programmé) = « débarque ici ».</p>
        <div class="btns">
          {#each passagers as p (p.id)}
            <button
              type="button"
              class="primary"
              disabled={!editable || !onSelectUnit}
              title="EMBARQUEMENT-PROGRAMME · D3-A : sélectionner la cargaison depuis le navire"
              onclick={() => onSelectUnit?.(p.id)}
            >
              {p.type} ({p.id}){ui.selectedUnitId === p.id ? ' ✓' : ''}
            </button>
          {/each}
        </div>
      {/if}
      {#if cargoUnit}
        <p class="hint">Débarquement immédiat de {cargoUnit.type} ({cargoUnit.id}) — D4 : le tour de l'unité est TERMINÉ après un débarquement (ni poursuite, ni attaque).</p>
        {#if disembarkTiles.length > 0}
          <div class="btns">
            {#each disembarkTiles as h (h.q + ',' + h.r)}
              <button
                type="button"
                class="primary"
                disabled={!editable}
                title="R-117 (rev. EMBARQUEMENT-PROGRAMME · D4) : débarquement — l'unité termine son tour sur la case cible"
                onclick={() => disembark(h)}
              >
                Débarquer en ({h.q},{h.r})
              </button>
            {/each}
          </div>
        {:else}
          <p class="hint">Aucune rive libre adjacente — avancez le navire.</p>
        {/if}
      {/if}
      <button type="button" class="link" onclick={() => unit && onCenterUnit(unit.id)}>Centrer la caméra (F)</button>
    {/if}
  {/if}
</section>

<style>
  /* UI-JEU-T2 · D3 — habillage AAA de la colonne de droite (tokens
     LOBBY-PREMIUM : or-sur-sombre, serif des titres, ombres douces —
     mêmes tokens que la barre T1 et RapportCombat). Structure et
     interactions inchangées (D1). */
  .panel {
    border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.25));
    border-radius: 10px;
    padding: 0.7rem 0.85rem;
    background: linear-gradient(180deg, #241f16 0%, #1b1712 100%);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(201, 162, 39, 0.08);
  }
  h2 {
    margin: 0 0 0.5rem;
    font-family: var(--serif-or, Georgia, serif);
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--or-clair, #e8c96a);
    border-bottom: 1px solid transparent;
    border-image: linear-gradient(90deg, transparent, var(--or, #c9a227), transparent) 1;
    padding-bottom: 0.3rem;
  }
  .rows { display: flex; flex-direction: column; gap: 0.22rem; margin-bottom: 0.45rem; }
  .title {
    font-family: var(--serif-or, Georgia, serif);
    font-size: 1.02rem;
    letter-spacing: 0.04em;
    color: var(--texte, #e9e4d3);
  }
  /* PV en compartiments (barre 3 vies — RAPPORT-ENGAGEMENT). */
  .pv-ligne { display: flex; align-items: center; gap: 0.45rem; margin: 0.1rem 0; }
  .pv { display: inline-flex; gap: 2px; background: #14120d; padding: 2px; border-radius: 3px; border: 1px solid rgba(201, 162, 39, 0.2); }
  .cellule { width: 1.15rem; height: 0.45rem; border-radius: 1px; background: #33302a; display: inline-block; }
  .cellule.pleine { background: var(--or-clair, #e8c96a); box-shadow: 0 0 4px rgba(232, 201, 106, 0.35); }
  .cellule.perte { background: #a8382c; }
  .pv-texte { font-size: 0.78rem; color: var(--texte-doux, #b6ad93); }
  .pv-texte.blesse { color: #f0a8a0; }
  .ranged { color: #ce93d8; font-weight: 600; font-size: 0.85rem; }
  .naval { color: #81d4fa; font-weight: 600; font-size: 0.85rem; }
  .enemy { color: #ef9a9a; }
  .frozen { color: #ffcc80; font-size: 0.85rem; }
  .fortified { color: #90caf9; font-weight: 600; font-size: 0.85rem; }
  .order {
    margin: 0.3rem 0;
    color: var(--or-clair, #e8c96a);
    font-size: 0.9rem;
    background: rgba(201, 162, 39, 0.08);
    border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.25));
    border-radius: 6px; padding: 0.2rem 0.5rem;
  }
  .hint { margin: 0.25rem 0; color: var(--texte-doux, #b6ad93); font-size: 0.8rem; opacity: 0.85; }
  .btns { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.4rem 0; }
  button {
    padding: 0.35rem 0.7rem; cursor: pointer; border-radius: 6px;
    border: 1px solid var(--panneau-bord, rgba(201, 162, 39, 0.55));
    background: rgba(201, 162, 39, 0.08);
    color: var(--texte, #e9e4d3);
    font-size: 0.84rem;
  }
  button:hover:enabled { border-color: var(--or-clair, #e8c96a); box-shadow: 0 0 8px rgba(201, 162, 39, 0.3); }
  button:disabled { opacity: 0.45; cursor: default; }
  button.primary { background: rgba(201, 162, 39, 0.22); border-color: var(--or, #c9a227); color: var(--or-clair, #e8c96a); }
  button.danger { background: rgba(138, 58, 48, 0.28); border-color: #8a3a30; color: #f0a8a0; }
  button.danger:hover:enabled { border-color: #c96a5a; box-shadow: 0 0 8px rgba(138, 58, 48, 0.5); }
  button.link { background: none; border: none; color: var(--or-clair, #e8c96a); text-decoration: underline; padding: 0.2rem 0; font-size: 0.82rem; }
  button.link:hover { box-shadow: none; }
  .odds { color: var(--or-clair, #e8c96a); font-size: 0.8rem; }
  .oracle-note { color: #ce93d8; font-size: 0.8rem; margin: 0.2rem 0; }
  .found-warning { color: #ffcc80; font-size: 0.78rem; margin: 0.2rem 0; }
  .nuke-armed { color: #ffb74d; font-weight: 600; font-size: 0.85rem; margin: 0.25rem 0; }
  .spy-title {
    margin: 0.5rem 0 0.1rem;
    font-family: var(--serif-or, Georgia, serif);
    font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em;
    color: #ce93d8;
  }
  .pick { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.85rem; }
  .pick select {
    background: rgba(10, 16, 27, 0.95); color: var(--texte, #e9e4d3);
    border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.25));
    border-radius: 5px; padding: 0.3rem;
  }
</style>
