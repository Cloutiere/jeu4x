<script lang="ts">
  /**
   * Panneau de l'unité sélectionnée (L5) : caractéristiques, ordre courant,
   * actions contextuelles (Hold, FoundCity, Attaque, brouillon de déplacement).
   * Le client ne calcule aucune règle : les boutons reflètent ce que l'état
   * filtré autorise ; la validation finale reste serveur.
   */
  import { CITY_DEFENSE_BONUS, FORTIFY_DEFENSE_BONUS, MIN_CITY_DISTANCE, BUILDINGS, TERRAINS, RESOURCES, RESOURCE_UNKNOWN, combatOdds, effectiveStrength, hexDistance, isWonderObsolete, landCombatBonus, neighbors, unitType, wonderAttackBonusEmpireOf } from '@game/rules';
  import type { Order } from '@game/shared';
  import type { GameClient, GameView } from '../lib/gameClient.js';
  import { myEngineId, ordersEditable, unitAtHex, cityAtHex, enterableKnown } from '../lib/render/interaction.js';
  import { consumeEffectLabel, settleEffectLabel } from '../lib/labels.js';
  import type { UiState } from '../lib/render/ui.js';

  interface Props {
    view: GameView;
    ui: UiState;
    client: GameClient;
    onCancelDraft(): void;
    onConfirmDraft?(): void;
    onCenterUnit(unitId: string): void;
  }

  let { view, ui, client, onCancelDraft, onConfirmDraft, onCenterUnit }: Props = $props();

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

  /** Cibles d'attaque : UNITÉS ennemies VISIBLES adjacentes (état filtré).
   * Une ville vide adjacente ne se « combat » pas : on y entre (R-57/R-65). */
  const attackTargets = $derived.by(() => {
    if (!unit || !mine || !stats?.canAttack || !editable || !view.state) return [];
    return neighbors(unit)
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
    return neighbors(unit)
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
      case 'SpyMission':
        return `Mission d'espionnage : ${o.cityId} (vol de GP)`;
    }
  }

  function submitAttack(target: { q: number; r: number }): void {
    if (!unit) return;
    client.submitOrder({ type: 'Attack', unitId: unit.id, target });
  }

  /** R-64/T-09 : une ville CONNUE (état filtré) à distance < T-09 interdit la fondation. */
  const cityTooClose = $derived.by(() => {
    if (!unit || !view.state) return false;
    return Object.values(view.state.cities).some((c) => hexDistance(c, unit) < MIN_CITY_DISTANCE);
  });

  /** 7f · R-115 : villes AMIES sur la case du GP ou adjacentes — installation
   *  définitive (+1 jalon culturel, le GP est consommé). */
  const installTargets = $derived.by(() => {
    if (!unit || !mine || !editable || !view.state || !stats?.greatPerson) return [];
    return Object.values(view.state.cities)
      .filter((c) => c.owner === unit.owner && hexDistance(c, unit) <= 1)
      .map((c) => ({ id: c.id }));
  });

  /** 7j · R-126 : Settle — installation permanente dans la cité hôte. */
  function installIn(cityId: string): void {
    if (!unit) return;
    client.submitOrder({ type: 'GreatPersonAction', action: 'settle', unitId: unit.id, cityId });
  }

  /** 7j · R-126 : Consume — effet massif immédiat, le GP disparaît. */
  function consumeIn(cityId: string): void {
    if (!unit) return;
    client.submitOrder({ type: 'GreatPersonAction', action: 'consume', unitId: unit.id, cityId });
  }

  /** 7g · R-117 : infos de transport — le navire sélectionné porte-t-il une
   *  cargaison ? L'unité sélectionnée est-elle embarquée ? */
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
    return neighbors(unit).filter(
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
    return neighbors(unit)
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
    const techs = view.state.players[id]?.techsUnlocked ?? [];
    return Object.values(view.state.cities).some(
      (c) => c.owner === id && c.wonders.includes('oracle_de_delphes') && !isWonderObsolete('oracle_de_delphes', techs),
    );
  });

  const attackPreviews = $derived.by(() => {
    if (!oracleActive || !unit || !stats || !view.state) return new Map<string, number>();
    const me = view.state.players[unit.owner]!;
    const techs = me.techsUnlocked ?? [];
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
        wonderAttackBonusEmpireOf(cities, unit.owner, techs) +
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
      {#if !mine}<span class="enemy">Ennemi — {unit.owner}</span>{/if}
      {#if mine}
        <span>PV <strong>{unit.hp}</strong> / {stats?.hpMax ?? '?'}</span>
        <span>PM <strong>{unit.mp}</strong> / {stats?.movement ?? '?'}</span>
        {#if unit.order}<span class="frozen">Chemin gelé : {unit.order.type}</span>{/if}
      {/if}
    </div>

    {#if !mine}
      <p class="hint">Unité ennemie visible (lecture seule).</p>
    {:else}
      {#if currentOrder}<p class="order">Ordre : {orderLabel(currentOrder)}</p>{/if}

      {#if draftHere}
        <!-- Phase 5 L1 : le chemin est soumis automatiquement (tracé gauche pas à
             pas ou clic droit sur la destination) — plus de bouton « Valider ». -->
        <p class="hint">Chemin soumis automatiquement — cliquez des cases pour l'étendre, clic droit ailleurs pour l'annuler.</p>
      {:else if editable}
        <p class="hint">Clic gauche : tracer pas à pas · Clic droit sur une case : chemin complet soumis d'un coup.</p>
      {/if}
      <div class="btns">
        <button type="button" disabled={!editable} onclick={() => unit && client.submitOrder({ type: 'Hold', unitId: unit.id })}>
          Tenir la position
        </button>
        {#if unit.fortified}
          <!-- R-33 : tout autre ordre annule la fortification — Hold = « ne plus fortifier ». -->
          <button type="button" disabled={!editable} title="Annule la fortification (un Hold suffit — R-33)" onclick={() => unit && client.submitOrder({ type: 'Hold', unitId: unit.id })}>
            Ne plus fortifier
          </button>
        {:else}
          <button type="button" disabled={!editable} title="Bonus défensif permanent (+25 %) tant qu'aucun autre ordre n'est donné (R-33)" onclick={() => unit && client.submitOrder({ type: 'Fortify', unitId: unit.id })}>
            Fortifier
          </button>
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
        {/if}
        {#if currentOrder}
          <button type="button" disabled={!editable} onclick={() => unit && client.cancelOrderFor(unit.id)}>
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
              disabled={!editable}
              title="R-126 : installation permanente — {settleEffectLabel(unit.type)}"
              onclick={() => installIn(t.id)}
            >
              Installer dans {t.id} (Settle — {settleEffectLabel(unit.type)})
            </button>
            {#if consumeEffectLabel(unit.type)}
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
              <button type="button" disabled title="Effet reporté : flip culturel (territoire, en suspens) / injection d'or (trésorerie, phase 7l)">
                Consume — reporté (7l / territoire)
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
      {#if cargoUnit}
        <p class="hint">🚢 Charge : {cargoUnit.type} ({cargoUnit.id}) — débarquez-le ci-dessous ou via un Move terrestre.</p>
        {#if disembarkTiles.length > 0}
          <div class="btns">
            {#each disembarkTiles as h (h.q + ',' + h.r)}
              <button
                type="button"
                class="primary"
                disabled={!editable}
                title="R-117 : débarquement — coût 1 PM, la cargaison reprend sa marche ensuite"
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
  .panel { border: 1px solid #3a4148; border-radius: 8px; padding: 0.7rem 0.85rem; background: #1d242b; }
  h2 { margin: 0 0 0.4rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; color: #9aa7b2; }
  .rows { display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0.4rem; }
  .title { font-weight: 700; }
  .ranged { color: #ce93d8; font-weight: 600; font-size: 0.85rem; }
  .naval { color: #81d4fa; font-weight: 600; font-size: 0.85rem; }
  .enemy { color: #ef9a9a; }
  .frozen { color: #ffcc80; font-size: 0.85rem; }
  .fortified { color: #90caf9; font-weight: 600; font-size: 0.85rem; }
  .order { margin: 0.25rem 0; color: #ffe082; font-size: 0.9rem; }
  .hint { margin: 0.25rem 0; color: #8b98a5; font-size: 0.82rem; }
  .btns { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.4rem 0; }
  button { padding: 0.35rem 0.7rem; cursor: pointer; border-radius: 6px; border: 1px solid #46525c; background: #27313a; color: inherit; }
  button:disabled { opacity: 0.45; cursor: default; }
  button.primary { background: #2e5e3f; border-color: #3c7a52; }
  button.danger { background: #5e2e2e; border-color: #7a3c3c; }
  button.link { background: none; border: none; color: #7fb3ff; text-decoration: underline; padding: 0.2rem 0; font-size: 0.82rem; }
  .odds { color: #ffe082; font-size: 0.8rem; }
  .oracle-note { color: #ce93d8; font-size: 0.8rem; margin: 0.2rem 0; }
  .found-warning { color: #ffcc80; font-size: 0.78rem; margin: 0.2rem 0; }
</style>
