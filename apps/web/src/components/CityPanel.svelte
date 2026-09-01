<script lang="ts">
  /**
   * Menu de ville (Phase 6 L3) : cumuls Nourriture / Production / Commerce
   * (+ or/science après répartition R-61), jauge de croissance (R-63),
   * liste des citoyens avec leur case (clic sur la carte = réassignation,
   * R-60), bâtiments possédés (R-66) et menu de production unités + bâtiments.
   * File unique (R-62), progression conservée.
   */
  import { unitType, BUILDINGS, tileYield, workRadiusOf } from '@game/rules';
  import type { ProductionItem } from '@game/rules';
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

  function itemName(item: ProductionItem): string {
    return item.kind === 'unit' ? unitType(item.id).name : (BUILDINGS[item.id]?.name ?? item.id);
  }
  function itemCost(item: ProductionItem): number {
    return item.kind === 'unit' ? unitType(item.id).cost : (BUILDINGS[item.id]?.cost ?? Infinity);
  }

  const prodItem = $derived(city?.production?.item ?? null);
  const prodRatio = $derived(
    city && city.production && prodItem ? Math.max(0, Math.min(1, city.production.progress / itemCost(prodItem))) : 0,
  );
  const player = $derived(city ? view.state?.players[city.owner] ?? null : null);

  /** Cumuls de la ville : centre gratuit + Σ cases travaillées + bonus bâtiments (R-60/R-66). */
  const yields = $derived.by(() => {
    if (!city || !view.state) return null;
    const t = { food: 2, production: 1, commerce: 1 }; // case de ville (R-60)
    for (const key of city.workedTiles) {
      const y = tileYield(view.state.map, city.buildings, key);
      if (!y) continue;
      t.food += y.food;
      t.production += y.production;
      t.commerce += y.commerce;
    }
    return t;
  });
  const goldPerTurn = $derived(
    yields && player ? yields.commerce - Math.floor(yields.commerce * player.scienceRatio) : 0,
  );
  const sciencePerTurn = $derived(yields && player ? Math.floor(yields.commerce * player.scienceRatio) : 0);

  /** R-63 : jauge de croissance — nourriture accumulée / seuil 10 × pop. */
  const growthThreshold = $derived(city ? 10 * city.pop : 0);
  const growthRatio = $derived(city ? Math.max(0, Math.min(1, city.foodStored / growthThreshold)) : 0);

  /** R-60 : rayon de travail courant (Tribunal → 2). */
  const workRadius = $derived(city ? workRadiusOf(city.buildings) : 1);

  /**
   * Réassignations en attente (retour immédiat) : les ordres SetWorkedTile
   * soumis pour cette ville, appliqués en miroir de ce que fera le moteur —
   * assignation (case libre), échange (ville pleine) ou désassignation (le
   * dernier citoyen de la liste est retiré).
   */
  const pending = $derived.by(() => {
    if (!city || !view.state) return { assigns: [] as string[], unassigns: 0, effective: 0, toAssign: 0, tiles: [] as string[] };
    const orders = view.orders.filter(
      (o): o is Extract<Order, { type: 'SetWorkedTile' }> => o.type === 'SetWorkedTile' && o.cityId === city.id,
    );
    const tiles = [...city.workedTiles];
    const assigns: string[] = [];
    let unassigns = 0;
    for (const o of orders) {
      if (o.tile === null) {
        unassigns += 1;
        tiles.pop(); // même règle que le moteur : le dernier assigné part
      } else if (!tiles.includes(o.tile)) {
        if (tiles.length < city.pop) {
          tiles.push(o.tile);
          assigns.push(o.tile);
        } else {
          // échange : remplace la case la moins intéressante (miroir moteur)
          const ranked = tiles
            .map((key) => ({ key, y: tileYield(view.state!.map, city.buildings, key) }))
            .sort(
              (a, b) =>
                (a.y?.food ?? 0) - (b.y?.food ?? 0) ||
                (a.y?.production ?? 0) - (b.y?.production ?? 0) ||
                (a.y?.commerce ?? 0) - (b.y?.commerce ?? 0),
            );
          const worst = ranked[0]!.key;
          tiles[tiles.indexOf(worst)] = o.tile;
          assigns.push(o.tile);
        }
      }
    }
    const effective = Math.min(city.pop, tiles.length);
    return { assigns, unassigns, effective, toAssign: city.pop - effective, tiles };
  });

  /** Items de production disponibles : unités v1 + bâtiments non possédés (R-66). */
  const productionOptions = $derived.by(() => {
    const options: Array<{ item: ProductionItem; name: string; cost: number; effect: string }> = [
      { item: { kind: 'unit', id: 'guerrier' }, name: unitType('guerrier').name, cost: unitType('guerrier').cost, effect: '1/1/1' },
      { item: { kind: 'unit', id: 'colon' }, name: unitType('colon').name, cost: unitType('colon').cost, effect: 'Fonde une ville' },
    ];
    for (const b of Object.values(BUILDINGS)) {
      options.push({
        item: { kind: 'building', id: b.id },
        name: b.name,
        cost: b.cost,
        effect: b.workRadiusBonus > 0 ? 'Rayon de travail 1 → 2' : tileEffectLabel(b),
      });
    }
    return options;
  });

  function tileEffectLabel(b: (typeof BUILDINGS)[string]): string {
    const parts: string[] = [];
    if (b.tileBonus!.food) parts.push(`+${b.tileBonus!.food} N`);
    if (b.tileBonus!.production) parts.push(`+${b.tileBonus!.production} P`);
    if (b.tileBonus!.commerce) parts.push(`+${b.tileBonus!.commerce} C`);
    return `${parts.join(' ')} par ${TERRAIN_NAMES[b.tileBonus!.terrain] ?? b.tileBonus!.terrain}`;
  }

  const TERRAIN_NAMES: Record<string, string> = {
    plaine: 'plaine',
    colline: 'colline',
    montagne: 'montagne',
    desert: 'désert',
    eau: 'mer',
  };

  /** Icône optionnelle : masquée silencieusement si l'asset est absent. */
  function hideImg(e: Event): void {
    (e.currentTarget as HTMLElement | null)?.style.setProperty('display', 'none');
  }

  /** Cumuls anticipés : les tiles attendues après résolution (miroir des ordres). */
  function projectedYields(tiles: string[]): { food: number; production: number; commerce: number } {
    const t = { food: 2, production: 1, commerce: 1 }; // case de ville (R-60)
    if (!view.state || !city) return t;
    for (const key of tiles) {
      const y = tileYield(view.state.map, city.buildings, key);
      if (!y) continue;
      t.food += y.food;
      t.production += y.production;
      t.commerce += y.commerce;
    }
    return t;
  }

  function setProduction(item: ProductionItem): void {
    if (!city) return;
    client.submitOrder({ type: 'SetProduction', cityId: city.id, item });
  }
</script>

<section class="panel">
  <h2>Ville</h2>
  {#if !city}
    <p class="hint">Cliquez sur une ville de la carte. Ville sélectionnée : cliquez une case pour y assigner un citoyen.</p>
  {:else}
    <div class="rows">
      <span class="title">{city.id}{city.capital ? ' — Capitale' : ''}</span>
      <span>
        Population <strong>{city.pop}</strong> —
        {#if pending.unassigns > 0 || pending.assigns.length > 0}
          <strong>{pending.effective}</strong> assigné(s) après résolution
          {#if pending.toAssign > 0}<em class="to-assign"> · {pending.toAssign} citoyen(s) à assigner</em>{/if}
        {:else}
          {city.workedTiles.length} citoyen(s) assigné(s)
        {/if}
        · rayon {workRadius}
      </span>
      {#if !mine}<span class="enemy">Ennemie — {city.owner}</span>{/if}
    </div>

    {#if yields && pending.tiles.length !== city.workedTiles.length}
      {@const projected = projectedYields(pending.tiles)}
      <div class="yields projected" title="Cumuls anticipés (réassignations en attente appliquées)">
        <span><img src="/art/icone_nourriture.png" alt="N" onerror={hideImg} /> {projected.food}</span>
        <span><img src="/art/icone_production.png" alt="P" onerror={hideImg} /> {projected.production}</span>
        <span><img src="/art/icone_commerce.png" alt="C" onerror={hideImg} /> {projected.commerce}</span>
        {#if mine}
          <span>
            → <img src="/art/icone_or.png" alt="or" onerror={hideImg} /> {projected.commerce - Math.floor(projected.commerce * (player?.scienceRatio ?? 0.5))} /
            <img src="/art/icone_science.png" alt="science" onerror={hideImg} /> {Math.floor(projected.commerce * (player?.scienceRatio ?? 0.5))}
          </span>
        {/if}
      </div>
    {/if}

    {#if yields}
      <div class="yields">
        <span title="Nourriture par tour"><img src="/art/icone_nourriture.png" alt="N" onerror={hideImg} /> {yields.food}</span>
        <span title="Production par tour"><img src="/art/icone_production.png" alt="P" onerror={hideImg} /> {yields.production}</span>
        <span title="Commerce par tour"><img src="/art/icone_commerce.png" alt="C" onerror={hideImg} /> {yields.commerce}</span>
        {#if mine}
          <span title="Répartition du commerce (curseur science/or, R-61)">
            → <img src="/art/icone_or.png" alt="or" onerror={hideImg} /> {goldPerTurn} /
            <img src="/art/icone_science.png" alt="science" onerror={hideImg} /> {sciencePerTurn}
          </span>
        {/if}
      </div>
      {#if mine}
        <div class="growth" title="Croissance : seuil 10 × pop (R-63)">
          <div class="bar"><div class="fill growth-fill" style:width={`${growthRatio * 100}%`}></div></div>
          <span class="hint">Croissance : {city.foodStored} / {growthThreshold} nourriture</span>
        </div>
      {/if}
    {/if}

    {#if mine && (city.workedTiles.length > 0 || pending.assigns.length > 0)}
      <div class="citizens">
        <span class="hint">
          Citoyens (clic sur une case de la carte pour réassigner){#if pending.assigns.length > 0 || pending.unassigns > 0} — <em class="pending-note">réassignation en attente</em>{/if} :
        </span>
        <div class="tiles">
          {#each pending.tiles as key (key)}
            <button
              type="button"
              class="tile"
              class:pending={pending.assigns.includes(key)}
              disabled={!editable}
              title={pending.assigns.includes(key) ? `Assignation en attente — annuler (${key})` : `Désassigner (${key})`}
              onclick={() => client.submitOrder({ type: 'SetWorkedTile', cityId: city.id, tile: null })}
            >({key})</button>
          {/each}
          {#if pending.toAssign > 0}
            <span class="tile free">+ {pending.toAssign} citoyen(s) à assigner</span>
          {/if}
        </div>
      </div>
    {/if}

    {#if city.buildings.length > 0}
      <div class="buildings">
        <span class="hint">Bâtiments :</span>
        <div class="btns">
          {#each city.buildings as b (b)}
            <span class="building">{BUILDINGS[b]?.name ?? b}</span>
          {/each}
        </div>
      </div>
    {/if}

    {#if !mine}
      <p class="hint">Ville ennemie visible (lecture seule).</p>
    {:else}
      <div class="prod">
        {#if city.production && prodItem}
          <span>Production : <strong>{itemName(prodItem)}</strong></span>
          <div class="bar"><div class="fill" style:width={`${prodRatio * 100}%`}></div></div>
          <span class="hint">{city.production.progress} / {itemCost(prodItem)} points</span>
        {:else}
          <span class="hint">Aucune production en file.</span>
        {/if}
        {#if prodOrder}<span class="hint">(changement en attente : {itemName(prodOrder.item)})</span>{/if}
      </div>
      <div class="btns">
        {#each productionOptions as opt (opt.item.kind + ':' + opt.item.id)}
          <button
            type="button"
            disabled={!editable}
            title={opt.effect}
            onclick={() => setProduction(opt.item)}
          >{opt.name} ({opt.cost})</button>
        {/each}
        {#if city.production}
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
  .yields { display: flex; flex-wrap: wrap; gap: 0.7rem; align-items: center; font-weight: 600; margin: 0.25rem 0; }
  .yields img { width: 16px; height: 16px; vertical-align: middle; }
  .growth { margin: 0.25rem 0 0.35rem; }
  .prod { display: flex; flex-direction: column; gap: 0.2rem; margin: 0.3rem 0; }
  .bar { height: 8px; background: #12161a; border-radius: 4px; overflow: hidden; border: 1px solid #3a4148; }
  .fill { height: 100%; background: #f0c419; }
  .growth-fill { background: #81c784; }
  .citizens { margin: 0.3rem 0; }
  .tiles { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.2rem; }
  .tile { font-size: 0.78rem; padding: 0.15rem 0.45rem; }
  .tile.pending { border-style: dashed; border-color: #ffd54f; color: #ffe082; }
  .tile.free { border-style: dashed; border-color: #81c784; color: #a5d6a7; cursor: default; padding: 0.15rem 0.55rem; border-radius: 6px; border-width: 1px; background: #1d242b; }
  .to-assign { color: #a5d6a7; font-style: normal; font-weight: 600; }
  .pending-note { color: #ffe082; font-style: normal; }
  .yields.projected { opacity: 0.75; }
  .buildings { margin: 0.3rem 0; }
  .building { padding: 0.15rem 0.5rem; border-radius: 999px; border: 1px solid #3c7a52; background: #243b2b; font-size: 0.8rem; }
  .hint { margin: 0.15rem 0; color: #8b98a5; font-size: 0.82rem; }
  .btns { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.4rem 0; }
  button { padding: 0.35rem 0.7rem; cursor: pointer; border-radius: 6px; border: 1px solid #46525c; background: #27313a; color: inherit; }
  button:disabled { opacity: 0.45; cursor: default; }
</style>
