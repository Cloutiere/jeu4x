<script lang="ts">
  /**
   * Menu de ville (L5) : population, production courante + progression,
   * choix Guerrier/Colon (SetProduction), annulation. File unique (R-62).
   */
  import { unitType } from '@game/rules';
  import type { Order } from '@game/shared';
  import type { GameClient, GameView } from '../lib/gameClient.js';
  import { myEngineId, ordersEditable } from '../lib/render/interaction.js';
  import type { UiState } from '../lib/render/ui.js';

  function isSetProduction(o: Order): o is Extract<Order, { type: 'SetProduction' }> {
    return o.type === 'SetProduction';
  }

  interface Props {
    view: GameView;
    ui: UiState;
    client: GameClient;
  }

  let { view, ui, client }: Props = $props();

  const city = $derived(view.state && ui.selectedCityId ? view.state.cities[ui.selectedCityId] : null);
  const mine = $derived(!!city && city.owner === myEngineId(view));
  const editable = $derived(ordersEditable(view));
  const prodOrder = $derived(
    city
      ? view.orders.find(
          (o): o is Extract<Order, { type: 'SetProduction' }> => isSetProduction(o) && o.cityId === city.id,
        ) ?? null
      : null,
  );
  const prodItem = $derived(city?.production ? unitType(city.production.item) : null);
  const prodRatio = $derived(
    city && city.production && prodItem ? Math.max(0, Math.min(1, city.production.progress / prodItem.cost)) : 0,
  );
  const gold = $derived(city ? view.state?.players[city.owner]?.gold ?? 0 : 0);

  function setProduction(item: string): void {
    if (!city) return;
    client.submitOrder({ type: 'SetProduction', cityId: city.id, item });
  }
</script>

<section class="panel">
  <h2>Ville</h2>
  {#if !city}
    <p class="hint">Cliquez sur une ville de la carte.</p>
  {:else}
    <div class="rows">
      <span class="title">{city.id}{city.capital ? ' — Capitale' : ''}</span>
      <span>Population <strong>{city.pop}</strong></span>
      {#if mine}<span>Trésor du joueur : {gold} or</span>{:else}<span class="enemy">Ennemie — {city.owner}</span>{/if}
    </div>

    {#if !mine}
      <p class="hint">Ville ennemie visible (lecture seule).</p>
    {:else}
      <div class="prod">
        {#if city.production}
          <span>Production : <strong>{prodItem?.name ?? city.production.item}</strong></span>
          <div class="bar"><div class="fill" style:width={`${prodRatio * 100}%`}></div></div>
          <span class="hint">{city.production.progress} / {prodItem?.cost ?? '?'} points</span>
        {:else}
          <span class="hint">Aucune production en file.</span>
        {/if}
        {#if prodOrder}<span class="hint">(changement en attente : {prodOrder.item})</span>{/if}
      </div>
      <div class="btns">
        <button type="button" disabled={!editable} onclick={() => setProduction('guerrier')}>Guerrier (10)</button>
        <button type="button" disabled={!editable} onclick={() => setProduction('colon')}>Colon (20)</button>
        {#if prodOrder}
          <button type="button" disabled={!editable} onclick={() => city && client.cancelCityOrder(city.id)}>Annuler</button>
        {/if}
      </div>
    {/if}
  {/if}
</section>

<style>
  .panel { border: 1px solid #3a4148; border-radius: 8px; padding: 0.7rem 0.85rem; background: #1d242b; }
  h2 { margin: 0 0 0.4rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; color: #9aa7b2; }
  .rows { display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0.4rem; }
  .title { font-weight: 700; }
  .enemy { color: #ef9a9a; }
  .prod { display: flex; flex-direction: column; gap: 0.2rem; margin: 0.3rem 0; }
  .bar { height: 8px; background: #12161a; border-radius: 4px; overflow: hidden; border: 1px solid #3a4148; }
  .fill { height: 100%; background: #f0c419; }
  .hint { margin: 0.15rem 0; color: #8b98a5; font-size: 0.82rem; }
  .btns { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.4rem 0; }
  button { padding: 0.35rem 0.7rem; cursor: pointer; border-radius: 6px; border: 1px solid #46525c; background: #27313a; color: inherit; }
  button:disabled { opacity: 0.45; cursor: default; }
</style>
