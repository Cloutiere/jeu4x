<script lang="ts">
  /**
   * Panneau de l'unité sélectionnée (L5) : caractéristiques, ordre courant,
   * actions contextuelles (Hold, FoundCity, Attaque, brouillon de déplacement).
   * Le client ne calcule aucune règle : les boutons reflètent ce que l'état
   * filtré autorise ; la validation finale reste serveur.
   */
  import { MIN_CITY_DISTANCE, hexDistance, neighbors, unitType } from '@game/rules';
  import type { Order } from '@game/shared';
  import type { GameClient, GameView } from '../lib/gameClient.js';
  import { myEngineId, ordersEditable, unitAtHex, cityAtHex } from '../lib/render/interaction.js';
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
</script>

<section class="panel">
  <h2>Unité</h2>
  {#if !unit}
    <p class="hint">Cliquez sur une unité de la carte.</p>
  {:else}
    <div class="rows">
      <span class="title">{stats?.name ?? unit.type}{unit.veteran ? ' ★' : ''}{unit.isArmy ? ' (armée)' : ''}</span>
      {#if stats?.isRanged}<span class="ranged" title="R-59 : attaque depuis sa case, sans avancer, sans riposte de mêlée">🎯 À distance</span>{/if}
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
          <button
            type="button"
            disabled={!editable || cityTooClose}
            title={cityTooClose ? `Une ville connue est à distance < ${MIN_CITY_DISTANCE} (T-09) — déplacez le colon.` : undefined}
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
        <div class="btns">
          {#each attackTargets as t (t.hex.q + ',' + t.hex.r)}
            <button
              type="button"
              class="danger"
              disabled={!editable}
              title={stats?.isRanged ? 'Attaque à distance (R-59) : vous restez sur votre case' : undefined}
              onclick={() => submitAttack(t.hex)}
            >
              {stats?.isRanged ? 'Tirer sur' : 'Attaquer'} {t.label} ({t.hex.q},{t.hex.r})
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
</style>
