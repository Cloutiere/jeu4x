<script lang="ts">
  /**
   * MENU-VILLE (décisions d'Erik du 13/09) — menu DÉDIÉ de la vue ville
   * (double-clic). Contenu EXACT (handoff §M3 — rien d'autre à l'écran) :
   *  1. nom de la ville (VilleN — compteur par joueur) ;
   *  2. nourriture : +X/tour + tours avant la prochaine population
   *     (`toursAvantCroissance` — ALIGNEMENT-CROISSANCE, seuils 10 × pop) ;
   *  3. production : marteaux/tour, item courant (nom + icône) et tours restants ;
   *  4. sciences produites par cette ville ET or produit par cette ville ;
   *  5. or total de la civilisation (trésorerie R-134) ;
   *  6. liste des bâtiments existants ;
   *  7. choix de production par type : onglets unités / bâtiments / merveilles
   *     (mêmes règles moteur — optionsUnites/optionsBatiments/wonderProductionIssue,
   *     garde-fous affichés comme dans CityPanel).
   * Ce composant NE remplace PAS CityPanel.svelte (carte du monde, en l'état).
   * Zéro gameplay nouveau : les ordres SetProduction/SetWorkedTile existants.
   */
  import { unitType, BUILDINGS, WONDERS, tileYield, tileKeyOf, workRadiusOf, conversionGains, interiorCitizenFor, interiorCountOf, allKnownTechs, cityGoldMultOf, empireGoldMultOf, settledGpMultiplier, toursAvantCroissance, populationCap, isWonderObsolete, wonderProductionIssue, eraOfPlayer, civIdOf, neighbors, isWaterTerrain } from '@game/rules';
  import { civName } from '../lib/labels.js';
  import type { ProductionItem } from '@game/rules';
  import type { Order } from '@game/shared';
  import type { GameClient, GameView } from '../lib/gameClient.js';
  import { myEngineId, ordersEditable, effectiveWorkedTiles } from '../lib/render/interaction.js';
  import { optionsUnites, optionsBatiments, tileEffectLabel } from '../lib/productionMenu.js';

  interface Props {
    view: GameView;
    client: GameClient;
    cityId: string;
    onClose(): void;
  }

  let { view, client, cityId, onClose }: Props = $props();

  const city = $derived(view.state?.cities[cityId] ?? null);
  const mine = $derived(!!city && city.owner === myEngineId(view));
  const editable = $derived(ordersEditable(view));
  const engine = $derived(myEngineId(view));

  // ---- 1. Nom (nom porté — VilleN ou table de civ — fallback id) ----------
  const displayName = $derived(city ? (city.name ?? city.id) : '');

  // ---- Rendements de la ville (état effectif — miroir CityPanel) ----------
  const eff = $derived(city && view ? effectiveWorkedTiles(view, city) : { tiles: [] as string[], assigns: [], unassigns: [] });
  const allTechs = $derived(view.state ? allKnownTechs(view.state) : ([] as string[]));

  function centerYields(pop: number, workedCount: number): { food: number; production: number; commerce: number } {
    const tier = interiorCitizenFor(pop);
    const interior = interiorCountOf(pop, workedCount);
    const p = city && view.state ? view.state.players[city.owner] : undefined;
    const civ = p && p.civId !== 'neutre' ? { civId: p.civId, era: p.era } : undefined;
    const base = city && view.state
      ? tileYield(view.state.map, city.buildings, tileKeyOf(city), p?.techsUnlocked ?? [], city.wonders, allTechs, civ)!
      : { food: 0, production: 0, commerce: 0 };
    return {
      food: base.food,
      production: base.production + interior * tier.production,
      commerce: base.commerce + tier.commerce + interior * tier.commerce,
    };
  }

  const yields = $derived.by(() => {
    if (!city || !view.state) return null;
    const t = { ...centerYields(city.pop, eff.tiles.length) };
    for (const key of eff.tiles) {
      const y = tileYield(view.state.map, city.buildings, key, view.state.players[city.owner]?.techsUnlocked ?? [], city.wonders, allTechs);
      if (!y) continue;
      t.food += y.food;
      t.production += y.production;
      t.commerce += y.commerce;
    }
    return t;
  });

  // ---- 2. Nourriture : +X/tour + tours avant la prochaine population ------
  const foodSurplus = $derived(yields ? yields.food : 0);
  const growthReduction = $derived.by(() => {
    if (!city) return 0;
    let reduction = 0;
    for (const b of city.buildings) reduction = Math.max(reduction, BUILDINGS[b]?.growthThresholdReduction ?? 0);
    return reduction;
  });
  const growthEta = $derived(
    city ? toursAvantCroissance(city.pop, city.foodStored, foodSurplus, growthReduction) : null,
  );
  const atPopulationCap = $derived(!!city && city.pop >= populationCap());

  // ---- 3. Production : marteaux/tour, item courant, tours restants --------
  const prodPerTurn = $derived.by(() => {
    if (!city || !view.state) return 0;
    let raw = centerYields(city.pop, eff.tiles.length).production;
    for (const key of eff.tiles) {
      const y = tileYield(view.state.map, city.buildings, key, view.state.players[city.owner]?.techsUnlocked ?? [], city.wonders, allTechs);
      if (y) raw += y.production;
    }
    let factoryMult = 1;
    for (const b of city.buildings) factoryMult = Math.max(factoryMult, BUILDINGS[b]?.productionMult ?? 1);
    return Math.floor(raw * factoryMult * (1 + 0.25 * (city.pop - 1)));
  });
  const prodItem = $derived(city?.production?.item ?? null);
  function itemCost(item: ProductionItem): number {
    return item.kind === 'unit' ? unitType(item.id).cost : (BUILDINGS[item.id]?.cost ?? Infinity);
  }
  function itemName(item: ProductionItem): string {
    return item.kind === 'unit' ? unitType(item.id).name : (BUILDINGS[item.id]?.name ?? item.id);
  }
  function itemIcon(item: ProductionItem): string {
    return item.kind === 'unit' ? '/art/icone_production.png' : '/art/icone_production.png';
  }
  const prodRatio = $derived(
    city && city.production && prodItem ? Math.max(0, Math.min(1, city.production.progress / itemCost(prodItem))) : 0,
  );
  const prodEta = $derived(
    city && city.production && prodItem && prodPerTurn > 0
      ? Math.ceil((itemCost(prodItem) - city.production.progress) / prodPerTurn)
      : null,
  );
  const prodOrder = $derived(
    city
      ? (view.orders.find((o): o is Extract<Order, { type: 'SetProduction' }> => o.type === 'SetProduction' && o.cityId === city.id) ?? null)
      : null,
  );

  // ---- 4. Sciences et or produits par CETTE ville (conversion R-90) -------
  function gainsFor(commerce: number): { gold: number; science: number } {
    const base = conversionGains(commerce, city!.conversion, city!.buildings);
    const mult = city && view.state
      ? cityGoldMultOf(city.wonders, allTechs) *
        empireGoldMultOf(Object.values(view.state.cities), city.owner, allTechs) *
        settledGpMultiplier(city, 'explorateur')
      : 1;
    return { gold: Math.round(base.gold * mult), science: base.science };
  }
  const gains = $derived(yields && city ? gainsFor(yields.commerce) : null);

  // ---- 5. Or total de la civilisation (trésorerie R-134) ------------------
  const treasury = $derived(
    city && view.state ? (view.state.players[city.owner]?.treasury ?? 0) : 0,
  );

  // ---- 7. Choix de production — onglets unités / bâtiments / merveilles ---
  const techsUnlocked = $derived(
    view.state && engine ? view.state.players[engine]?.techsUnlocked ?? [] : ([] as string[]),
  );
  const cityCoastal = $derived.by(() => {
    if (!city || !view.state) return false;
    return neighbors(city).some((h) => {
      const t = view.state!.map[`${h.q},${h.r}`]?.terrain;
      return !!t && isWaterTerrain(t);
    });
  });

  interface ProdOption {
    item: ProductionItem;
    name: string;
    cost: number;
    effect: string;
    unlocked: boolean;
    requires: string | null;
    eta: number | null;
  }

  const menuCtx = $derived.by(() => {
    if (!city) return null;
    return {
      techsUnlocked,
      buildings: city.buildings ?? [],
      civId: cityCivId,
      coastal: cityCoastal,
      prodPerTurn,
    };
  });
  const cityCivId = $derived(city && view.state ? civIdOf(view.state.players[city.owner]) : 'neutre');
  const cityEra = $derived(city && view.state ? eraOfPlayer(view.state.players[city.owner]) : 'ancienne');
  const cityCivLabel = $derived(cityCivId === 'neutre' ? '' : civName(cityCivId));

  const unitOptions = $derived.by(() => {
    if (!menuCtx) return [] as ProdOption[];
    return optionsUnites(menuCtx) as ProdOption[];
  });
  const buildingOptions = $derived.by(() => {
    if (!menuCtx) return [] as ProdOption[];
    return optionsBatiments(menuCtx) as ProdOption[];
  });
  const wonderOptions = $derived.by(() => {
    if (!city || !view.state || !engine) return [];
    const player = view.state.players[engine];
    const ownCities = Object.values(view.state.cities).filter((c) => c.owner === engine);
    const ctx = {
      techsUnlocked,
      allTechsUnlocked: allTechs,
      worldWondersBuilt: [...new Set(Object.values(view.state.cities).flatMap((c) => c.wonders))].sort(),
      empireWondersBuilt: ownCities.flatMap((c) => c.wonders),
      empireWondersInProduction: ownCities
        .filter((c) => c.id !== city.id && c.production?.item.kind === 'wonder')
        .map((c) => (c.production!.item as { kind: 'wonder'; id: string }).id),
      cultureMilestones: player?.cultureMilestones ?? 0,
      treasury: player?.treasury ?? 0,
    };
    const options: ProdOption[] = [];
    for (const w of Object.values(WONDERS)) {
      if (w.implemented === false) continue;
      const issue = wonderProductionIssue(w.id, ctx);
      const eta = issue === null && prodPerTurn > 0 ? Math.ceil((w.cost ?? 0) / prodPerTurn) : null;
      options.push({
        item: { kind: 'wonder', id: w.id },
        name: w.name,
        cost: w.cost ?? 0,
        effect: w.effect ?? '',
        unlocked: issue === null,
        requires: issue,
        eta,
      });
    }
    return options;
  });

  let onglet = $state<'unites' | 'batiments' | 'merveilles'>('unites');
  // Retour d'Erik : ne montrer QUE ce qui est constructible maintenant —
  // technologie découverte (et garde-fous moteur : accès mer, uniques de
  // civ, exclusivité mondiale, jalons ONU…). Rien de verrouillé à l'écran.
  const optionsOnglet = $derived(
    (onglet === 'unites' ? unitOptions : onglet === 'batiments' ? buildingOptions : wonderOptions).filter(
      (opt) => opt.unlocked,
    ),
  );

  function setProduction(item: ProductionItem): void {
    if (!city || !editable) return;
    client.submitOrder({ type: 'SetProduction', cityId: city.id, item });
  }

  function hideImg(e: Event): void {
    (e.currentTarget as HTMLElement | null)?.style.setProperty('display', 'none');
  }
</script>

<aside class="cityview" aria-label="Vue ville">
  <header>
    <div>
      <!-- 1. Nom de la ville -->
      <h1>{displayName}</h1>
      <span class="sub">
        {#if city?.capital}Capitale · {/if}
        {#if cityCivLabel}{cityCivLabel} · {/if}
        population {city?.pop ?? '—'} · rayon {city ? workRadiusOf(city.buildings) : '—'} ({city ? 3 * workRadiusOf(city.buildings) * (workRadiusOf(city.buildings) + 1) : '—'} cases cultivables)
      </span>
    </div>
    <button type="button" class="close" title="Fermer la vue ville (Échap)" onclick={onClose}>✕ Fermer</button>
  </header>

  {#if !city}
    <p>Ville introuvable.</p>
  {:else}
    <div class="grid">
      <!-- 2. Nourriture -->
      <section class="block food">
        <h2>Nourriture</h2>
        <p class="big">
          <img src="/art/icone_nourriture.png" alt="" onerror={hideImg} />
          {foodSurplus > 0 ? '+' : ''}{foodSurplus} /tour
        </p>
        <p class="eta">
          {#if atPopulationCap}
            Plafond de population atteint
          {:else if growthEta !== null}
            Prochaine population dans <strong>{growthEta} tour{growthEta > 1 ? 's' : ''}</strong>
          {:else}
            Aucun surplus — croissance à l'arrêt
          {/if}
        </p>
      </section>

      <!-- 3. Production -->
      <section class="block prod">
        <h2>Production</h2>
        <p class="big">
          <img src="/art/icone_production.png" alt="" onerror={hideImg} />
          {prodPerTurn} marteaux /tour
        </p>
        {#if city.production && prodItem}
          <p class="item">
            <img src={itemIcon(prodItem)} alt="" onerror={hideImg} />
            <strong>{itemName(prodItem)}</strong> — {city.production.progress}/{itemCost(prodItem)}
            {#if prodEta !== null}· {prodEta} tour{prodEta > 1 ? 's' : ''}{/if}
          </p>
          <div class="bar"><div class="fill" style:width={`${prodRatio * 100}%`}></div></div>
        {:else}
          <p class="eta">Aucune production en file.</p>
        {/if}
        {#if prodOrder}<p class="eta pending">Changement en attente : {itemName(prodOrder.item)}</p>{/if}
      </section>

      <!-- 4. Sciences + or de CETTE ville -->
      <section class="block sci">
        <h2>Sciences & or de la ville</h2>
        <p class="big">
          <img src="/art/icone_science.png" alt="" onerror={hideImg} />
          {gains?.science ?? 0} sciences /tour
          <span class="sep">·</span>
          <img src="/art/icone_or.png" alt="" onerror={hideImg} />
          {gains?.gold ?? 0} or /tour
        </p>
        <p class="eta">Conversion du commerce : {city.conversion === 'gold' ? 'or' : 'science'} (R-90)</p>
      </section>

      <!-- 5. Trésorerie de la civilisation -->
      <section class="block tresor">
        <h2>Trésorerie de la civilisation</h2>
        <p class="big">
          <img src="/art/icone_or.png" alt="" onerror={hideImg} />
          {treasury.toLocaleString('fr-FR')} or
        </p>
      </section>

      <!-- 6. Bâtiments existants -->
      <section class="block bat">
        <h2>Bâtiments ({city.buildings.length})</h2>
        {#if city.buildings.length > 0}
          <div class="chips">
            {#each city.buildings as b (b)}
              <span class="chip" title={BUILDINGS[b]?.effect ?? tileEffectLabel(BUILDINGS[b] ?? ({} as never))}>{BUILDINGS[b]?.name ?? b}</span>
            {/each}
          </div>
        {:else}
          <p class="eta">Aucun bâtiment.</p>
        {/if}
        {#if city.wonders.length > 0}
          <div class="chips">
            {#each city.wonders as w (w)}
              <span class="chip wonder" class:obsolete={isWonderObsolete(w, allTechs)} title="{WONDERS[w]?.effect ?? w}">
                {WONDERS[w]?.name ?? w}{isWonderObsolete(w, allTechs) ? ' · obsolète' : ''}
              </span>
            {/each}
          </div>
        {/if}
      </section>
    </div>

    <!-- 7. Choix de production — onglets -->
    {#if mine}
      <section class="block choix">
        <h2>Choix de production</h2>
        <div class="tabs" role="tablist">
          <button type="button" role="tab" class:active={onglet === 'unites'} aria-selected={onglet === 'unites'} onclick={() => (onglet = 'unites')}>Unités</button>
          <button type="button" role="tab" class:active={onglet === 'batiments'} aria-selected={onglet === 'batiments'} onclick={() => (onglet = 'batiments')}>Bâtiments</button>
          <button type="button" role="tab" class:active={onglet === 'merveilles'} aria-selected={onglet === 'merveilles'} onclick={() => (onglet = 'merveilles')}>Merveilles</button>
        </div>
        <div class="queue">
          {#each optionsOnglet as opt (opt.item.kind + ':' + opt.item.id)}
            <button
              type="button"
              class="opt"
              class:locked={!opt.unlocked}
              disabled={!editable || !opt.unlocked}
              title={opt.unlocked ? opt.effect : `Requiert : ${opt.requires}`}
              onclick={() => setProduction(opt.item)}
            >
              <b>{opt.name} ({opt.cost})</b>
              <span class="fx">{opt.unlocked ? opt.effect : `Requiert : ${opt.requires}`}</span>
              {#if opt.eta !== null}<span class="turns">· {opt.eta} tour{opt.eta > 1 ? 's' : ''}</span>{/if}
            </button>
          {/each}
          {#if optionsOnglet.length === 0}<p class="eta">Rien à proposer dans cet onglet.</p>{/if}
        </div>
        {#if city.production}
          <button type="button" class="cancel" disabled={!editable} onclick={() => city && client.cancelCityOrder(city.id)}>Annuler la production</button>
        {/if}
      </section>
    {:else}
      <p class="eta">Ville ennemie — lecture seule.</p>
    {/if}
  {/if}
</aside>

<style>
  .cityview {
    position: absolute;
    right: 0.6rem;
    top: 0.6rem;
    bottom: 0.6rem;
    width: min(430px, 92vw);
    overflow-y: auto;
    background: #161d24f2;
    border: 1px solid #3a4148;
    border-radius: 10px;
    padding: 0.8rem 0.9rem;
    z-index: 6;
    font-family: system-ui, sans-serif;
    color: #e3e8ec;
    box-shadow: 0 6px 24px #000000a0;
  }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.5rem; }
  h1 { margin: 0; font-size: 1.25rem; }
  .sub { color: #9aa7b2; font-size: 0.8rem; }
  .close { padding: 0.3rem 0.7rem; border-radius: 6px; border: 1px solid #46525c; background: #27313a; color: inherit; cursor: pointer; }
  h2 { margin: 0 0 0.25rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: #9aa7b2; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .block { border: 1px solid #2c353d; border-radius: 8px; padding: 0.5rem 0.6rem; background: #1d242b; }
  .bat, .choix { grid-column: 1 / -1; }
  .big { margin: 0.1rem 0; font-size: 1.02rem; font-weight: 700; display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
  .big img, .item img { width: 16px; height: 16px; }
  .sep { color: #46525c; }
  .eta { margin: 0.15rem 0 0; color: #a5d6a7; font-size: 0.82rem; }
  .eta.pending { color: #ffe082; }
  .item { margin: 0.2rem 0 0.15rem; display: flex; align-items: center; gap: 0.3rem; font-size: 0.9rem; }
  .bar { height: 8px; background: #12161a; border-radius: 4px; overflow: hidden; border: 1px solid #3a4148; }
  .fill { height: 100%; background: #f0c419; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.2rem 0; }
  .chip { padding: 0.15rem 0.5rem; border-radius: 999px; border: 1px solid #3c7a52; background: #243b2b; font-size: 0.8rem; }
  .chip.wonder { border-color: #b8863c; background: #3c3222; color: #ffd54f; }
  .chip.obsolete { opacity: 0.55; border-style: dashed; }
  .tabs { display: flex; gap: 0.3rem; margin: 0.3rem 0; }
  .tabs button { padding: 0.3rem 0.9rem; border-radius: 999px; border: 1px solid #46525c; background: #27313a; color: inherit; cursor: pointer; }
  .tabs button.active { border-color: #d9a93f; background: #3a3222; color: #ffd479; font-weight: 700; }
  .queue { display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: 0.4rem; margin: 0.3rem 0; }
  .opt { text-align: left; padding: 0.4rem 0.55rem; border-radius: 8px; border: 1px solid #46525c; background: #27313a; color: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 0.1rem; }
  .opt b { font-size: 0.84rem; }
  .opt .fx { color: #8b98a5; font-size: 0.74rem; }
  .opt .turns { color: #ffd54f; font-size: 0.74rem; }
  .opt.locked { opacity: 0.55; cursor: default; }
  .opt:disabled { opacity: 0.55; cursor: default; }
  .cancel { margin-top: 0.2rem; padding: 0.3rem 0.7rem; border-radius: 6px; border: 1px solid #46525c; background: #27313a; color: inherit; cursor: pointer; }
</style>
