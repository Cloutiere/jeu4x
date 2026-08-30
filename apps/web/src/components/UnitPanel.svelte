<script lang="ts">
  /**
   * Panneau de l'unité sélectionnée (L5) : caractéristiques, ordre courant,
   * actions contextuelles (Hold, FoundCity, Attaque, brouillon de déplacement).
   * Le client ne calcule aucune règle : les boutons reflètent ce que l'état
   * filtré autorise ; la validation finale reste serveur.
   */
  import { neighbors, unitType } from '@game/rules';
  import type { Order } from '@game/shared';
  import type { GameClient, GameView } from '../lib/gameClient.js';
  import { myEngineId, ordersEditable, unitAtHex, cityAtHex } from '../lib/render/interaction.js';
  import type { UiState } from '../lib/render/ui.js';

  interface Props {
    view: GameView;
    ui: UiState;
    client: GameClient;
    onCancelDraft(): void;
    onConfirmDraft(): void;
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

  /** Cibles d'attaque : entités ennemies VISIBLES adjacentes (état filtré). */
  const attackTargets = $derived.by(() => {
    if (!unit || !mine || !stats?.canAttack || !editable || !view.state) return [];
    return neighbors(unit)
      .map((h) => {
        const enemyUnit = unitAtHex(view.state!, h);
        const enemyCity = enemyUnit ? null : cityAtHex(view.state!, h);
        const owner = enemyUnit?.owner ?? enemyCity?.owner ?? null;
        if (!owner || owner === unit.owner) return null;
        return { hex: h, label: enemyUnit ? `${enemyUnit.id}` : `ville ${enemyCity!.id}` };
      })
      .filter((t): t is { hex: { q: number; r: number }; label: string } => t !== null);
  });

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
      case 'FormArmy':
        return 'Formation d\'armée';
      case 'SetProduction':
        return 'Production';
    }
  }

  function submitAttack(target: { q: number; r: number }): void {
    if (!unit) return;
    client.submitOrder({ type: 'Attack', unitId: unit.id, target });
  }
</script>

<section class="panel">
  <h2>Unité</h2>
  {#if !unit}
    <p class="hint">Cliquez sur une unité de la carte.</p>
  {:else}
    <div class="rows">
      <span class="title">{stats?.name ?? unit.type}{unit.veteran ? ' ★' : ''}{unit.isArmy ? ' (armée)' : ''}</span>
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
        <div class="btns">
          <button type="button" class="primary" disabled={draftHere.path.length === 0 || !editable} onclick={onConfirmDraft}>
            Valider le déplacement ({draftHere.path.length})
          </button>
          <button type="button" disabled={!editable} onclick={onCancelDraft}>Annuler le brouillon</button>
        </div>
      {:else}
        {#if editable}
          <p class="hint">Cliquez des cases adjacentes praticables pour tracer un déplacement.</p>
        {/if}
        <div class="btns">
          <button type="button" disabled={!editable} onclick={() => unit && client.submitOrder({ type: 'Hold', unitId: unit.id })}>
            Tenir la position
          </button>
          {#if stats?.canFoundCity}
            <button type="button" disabled={!editable} onclick={() => unit && client.submitOrder({ type: 'FoundCity', unitId: unit.id })}>
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
              <button type="button" class="danger" disabled={!editable} onclick={() => submitAttack(t.hex)}>
                Attaquer {t.label} ({t.hex.q},{t.hex.r})
              </button>
            {/each}
          </div>
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
  .enemy { color: #ef9a9a; }
  .frozen { color: #ffcc80; font-size: 0.85rem; }
  .order { margin: 0.25rem 0; color: #ffe082; font-size: 0.9rem; }
  .hint { margin: 0.25rem 0; color: #8b98a5; font-size: 0.82rem; }
  .btns { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.4rem 0; }
  button { padding: 0.35rem 0.7rem; cursor: pointer; border-radius: 6px; border: 1px solid #46525c; background: #27313a; color: inherit; }
  button:disabled { opacity: 0.45; cursor: default; }
  button.primary { background: #2e5e3f; border-color: #3c7a52; }
  button.danger { background: #5e2e2e; border-color: #7a3c3c; }
  button.link { background: none; border: none; color: #7fb3ff; text-decoration: underline; padding: 0.2rem 0; font-size: 0.82rem; }
</style>
