<script lang="ts">
  /**
   * MENU-VILLE (décisions d'Erik du 13/09) — menu DÉDIÉ de la vue ville
   * (double-clic). Contenu EXACT (handoff §M3 — rien d'autre à l'écran) :
   *  1. nom de la ville (VilleN — compteur par joueur) ;
   *  2. nourriture : +X/tour + jauge verte réserve/seuil (10 × pop, R-63)
   *     + tours avant la prochaine population (`toursAvantCroissance`) ;
   *  3. production : marteaux/tour, item courant (nom + icône), jauge
   *     marteaux/coût + tours restants (FUSION-MENU-VILLE : barre portée) ;
   *  4. sciences produites par cette ville ET or produit par cette ville ;
   *  5. or total de la civilisation (trésorerie R-134) ;
   *  6. liste des bâtiments existants ;
   *  7. choix de production par type : onglets unités / bâtiments / merveilles
   *     (mêmes règles moteur — optionsUnites/optionsBatiments/wonderProductionIssue,
   *     garde-fous affichés comme dans CityPanel).
   * FUSION-MENU-VILLE (décisions d'Erik du 14/09) : CityPanel est SUPPRIMÉ
   * (clic simple = sélection muette) — ses bons éléments migrent ICI : jauge
   * de FRONTIÈRE CULTURELLE de la ville (R-162 — le palier T-27 de la
   * civilisation vit au menu d'empire, retour d'Erik du 15/09), contrôle de
   * conversion R-90 INTERACTIF
   * (portage obligatoire — seul point de réglage), flux RushBuy (R-135),
   * réserve de marteaux (R-130), GP installés, tooltip ALIGNEMENT. Les chips
   * citoyens ne se portent PAS (la carte et la vue ville font le travail).
   * Zéro gameplay nouveau : les ordres SetProduction/SetWorkedTile/
   * SetConversion/RushBuy existants.
   */
  import { unitType, BUILDINGS, WONDERS, tileYield, tileKeyOf, workRadiusOf, conversionGains, interiorCitizenFor, interiorCountOf, allKnownTechs, cityGoldMultOf, empireGoldMultOf, settledGpMultiplier, toursAvantCroissance, populationCap, isWonderObsolete, wonderProductionIssue, eraOfPlayer, civIdOf, neighbors, isWaterTerrain, cultureGains, empirePerCityBonus, effectsFor, rushBuyCostOf, isRushForbidden, RESOURCES, RESOURCE_UNKNOWN } from '@game/rules';
  import { civName, greatPersonLabel, settleEffectLabel } from '../lib/labels.js';
  import type { ProductionItem } from '@game/rules';
  import type { Order } from '@game/shared';
  import type { GameClient, GameView } from '../lib/gameClient.js';
  import { myEngineId, ordersEditable, effectiveWorkedTiles } from '../lib/render/interaction.js';
  import { optionsUnites, optionsBatiments, tileEffectLabel } from '../lib/productionMenu.js';
  import { jaugeCroissance, jaugeFrontiereCulturelle, jaugeProduction, toursAvantSeuil } from '../lib/jauges.js';

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
  const growth = $derived(
    city ? jaugeCroissance(city.pop, city.foodStored, growthReduction) : { seuil: 0, ratio: 0, plafond: false },
  );
  const growthEta = $derived(
    city && !growth.plafond && city.foodStored < growth.seuil
      ? toursAvantCroissance(city.pop, city.foodStored, foodSurplus, growthReduction)
      : null,
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
  const prodRatio = $derived(
    city && city.production && prodItem ? jaugeProduction(city.production.progress, itemCost(prodItem)) : 0,
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

  // FUSION-MENU-VILLE — portage du flux RushBuy (R-135) : CityPanel était le
  // SEUL endroit où le joueur pouvait acheter instantanément — le flux est
  // porté, pas perdu. Coût et éligibilité = sources uniques moteur.
  const rush = $derived.by(() => {
    if (!city || !mine || !city.production || !view.state) return null;
    const cost = rushBuyCostOf(view.state, city);
    if (cost === null) {
      return isRushForbidden(city.production.item)
        ? { cost: null, allowed: false, reason: 'achat interdit (merveille de victoire — R-135)' }
        : null;
    }
    const player = view.state.players[city.owner];
    const treasury = player?.treasury ?? 0;
    if (treasury < cost) return { cost, allowed: false, reason: `trésorerie insuffisante (${treasury} or)` };
    if (city.production.item.kind === 'unit') {
      const occupied = Object.values(view.state.units).some(
        (u) => u.aboard === null && u.q === city.q && u.r === city.r,
      );
      if (occupied) return { cost, allowed: false, reason: 'case de ville occupée (pose impossible)' };
    }
    return { cost, allowed: true, reason: null };
  });
  function rushNow(): void {
    if (!city || !rush?.allowed) return;
    client.submitOrder({ type: 'RushBuy', cityId: city.id });
  }

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

  // R-90 INTERACTIF (FUSION-MENU-VILLE — portage obligatoire) : CityPanel
  // était le seul endroit où le joueur pouvait basculer or ⇄ science —
  // même ordre SetConversion, même sémantique moteur (action immédiate,
  // modifiable en phase ordres même verrouillé).
  const conversionEditable = $derived(view.status === 'active' && view.phase === 'orders');
  function toggleConversion(): void {
    if (!city || !mine) return;
    client.setConversion(city.id, city.conversion === 'gold' ? 'science' : 'gold');
  }

  // R-134 : or DIRECT versé par les ressources Gemmes/Or travaillées.
  const directGold = $derived.by(() => {
    if (!city || !view.state) return 0;
    const techs = view.state.players[city.owner]?.techsUnlocked ?? [];
    let total = 0;
    for (const key of city.workedTiles) {
      const res = view.state.map[key]?.resource;
      const data = res && res !== RESOURCE_UNKNOWN ? RESOURCES[res] : undefined;
      if (data?.directGold && (!data.revealedByTech || techs.includes(data.revealedByTech))) total += data.directGold;
    }
    return total;
  });

  // ---- Culture (retour d'Erik du 15/09) — la barre de la ville montre la
  // progression de sa frontière CULTURELLE (R-162 : anneaux aux seuils
  // 10/100/1 000/10 000, plafond 5). Le PALIER T-27 (civilisation) a quitté
  // la vue ville : il vit dans le menu d'empire (GovernmentPanel).
  const frontiere = $derived(city ? jaugeFrontiereCulturelle(city.cultureCumulee) : { anneaux: 0, prochainSeuil: null as number | null, ratio: 0, plafond: false });
  const culturePerTurn = $derived.by(() => {
    if (!city || !view.state || !engine) return 0;
    const empireBonus = empirePerCityBonus(view.state, engine);
    const govEffects = effectsFor(view.state.players[city.owner]!);
    return cultureGains(city, empireBonus.culture, allTechs, govEffects);
  });
  const frontiereEta = $derived(
    city && frontiere.prochainSeuil !== null ? toursAvantSeuil(city.cultureCumulee, frontiere.prochainSeuil, culturePerTurn) : null,
  );

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
        <!-- FUSION-MENU-VILLE : barre verte (style de l'ancien CityPanel) —
             réserve vs seuil 10 × pop actuelle (R-63, jaugeCroissance pur). -->
        <div class="gauge" title="Croissance (R-63) : réserve vs seuil 10 × population actuelle ({city.pop} → {growth.seuil}) — les citoyens ne consomment AUCUNE nourriture">
          <span class="lab"><img src="/art/icone_nourriture.png" alt="" onerror={hideImg} /> {city.foodStored} / {growth.seuil}</span>
          <div class="bar"><div class="fill growth-fill" style:width={`${growth.ratio * 100}%`}></div></div>
        </div>
        <p class="hint center-floor" title="ALIGNEMENT-CROISSANCE : la case de ville ne produit RIEN (0 N / 0 P / 0 C) — la ville vit par ses citoyens (travaillés ou intérieurs, R-60/R-60bis).">Case de ville : aucun rendement — la ville vit par ses citoyens</p>
      </section>

      <!-- Culture (retour d'Erik du 15/09) : progression de la FRONTIÈRE
           culturelle de CETTE ville (R-162), même concept visuel que la
           nourriture — taux, ETA du prochain anneau, avancement/total. -->
      <section class="block cult">
        <h2>Frontière culturelle de la ville</h2>
        <p class="big">
          <img src="/art/icone_culture.png" alt="" onerror={hideImg} />
          {culturePerTurn > 0 ? '+' : ''}{culturePerTurn} culture /tour
        </p>
        <p class="eta">
          {#if frontiere.plafond}
            Tous les anneaux culturels sont acquis ({frontiere.anneaux})
          {:else if frontiereEta !== null}
            Prochain anneau dans <strong>{frontiereEta} tour{frontiereEta > 1 ? 's' : ''}</strong>
          {:else}
            Prochain anneau — culture à l'arrêt
          {/if}
        </p>
        <div class="gauge" title="Frontière culturelle (R-162) : la culture CUMULÉE de cette ville franchit les seuils 10 / 100 / 1 000 / 10 000 — chaque seuil = +1 anneau (liseré autour de la zone cultivée au 1er, bande d'extension d'une case par anneau ensuite), plafond 5 anneaux. Visual-only (phase 1).">
          {#if frontiere.plafond}
            <span class="lab"><img src="/art/icone_culture.png" alt="" onerror={hideImg} /> {city.cultureCumulee} (plafond)</span>
          {:else}
            <span class="lab"><img src="/art/icone_culture.png" alt="" onerror={hideImg} /> {city.cultureCumulee} / {frontiere.prochainSeuil}</span>
          {/if}
          <div class="bar"><div class="fill culture-fill" style:width={`${frontiere.ratio * 100}%`}></div></div>
        </div>
      </section>

      <!-- 3. Production -->
      <section class="block prod">
        <h2>Production</h2>
        <p class="big">
          <img src="/art/icone_production.png" alt="" onerror={hideImg} />
          {prodPerTurn} marteaux /tour
        </p>
        {#if city.production && prodItem}
          <p class="eta">
            {#if prodEta !== null}
              {itemName(prodItem)} dans <strong>{prodEta} tour{prodEta > 1 ? 's' : ''}</strong>
            {:else}
              {itemName(prodItem)} — aucun marteau/tour, chantier à l'arrêt
            {/if}
          </p>
          <!-- Concept d'Erik : logo + avancement / total -->
          <div class="gauge">
            <span class="lab"><img src="/art/icone_production.png" alt="" onerror={hideImg} /> {city.production.progress} / {itemCost(prodItem)}</span>
            <div class="bar"><div class="fill" style:width={`${prodRatio * 100}%`}></div></div>
          </div>
        {:else}
          <p class="eta">Aucune production en file.</p>
          {#if mine && (prodPerTurn > 0 || city.pendingSalvage > 0)}
            <!-- FIN-DE-TOUR-PRODUCTION (18/09) : la ville bloque la fin de tour
                 tant qu'aucun projet n'est sélectionné (marteaux/tour > 0 ou
                 réserve C7 en attente). -->
            <p class="eta bloquee">
              ⚠ Fin de tour bloquée — sélectionnez une production
              {city.pendingSalvage > 0 ? `(${city.pendingSalvage} marteaux en réserve, C7)` : `(${prodPerTurn} marteaux/tour)`}.
            </p>
          {/if}
        {/if}
        {#if prodOrder}<p class="eta pending">Changement en attente : {itemName(prodOrder.item)}</p>{/if}
        {#if mine && rush}
          <!-- FUSION-MENU-VILLE : flux RushBuy porté de CityPanel (R-135) —
               c'était le seul point d'entrée de l'achat instantané. -->
          <button
            type="button"
            class="rush"
            class:locked={!rush.allowed}
            disabled={!editable || !rush.allowed}
            title={rush.reason ?? (prodItem ? `Acheter ${itemName(prodItem)} immédiatement pour ${rush.cost} or (marteaux restants × facteur d'ère — R-135)` : 'Achat instantané (R-135)')}
            onclick={() => rushNow()}
          >
            ⚡ Acheter maintenant pour {rush.cost ?? '—'} or
            {#if !rush.allowed}<span class="fx"> — {rush.reason}</span>{/if}
          </button>
        {/if}
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
        {#if directGold > 0}<p class="eta">+ {directGold} or direct (Gemmes/Or — R-134)</p>{/if}
        {#if mine}
          <!-- FUSION-MENU-VILLE (portage obligatoire) : le contrôle de
               conversion R-90 était le seul réglage perdu avec CityPanel —
               même ordre SetConversion, même sémantique moteur. -->
          <button
            type="button"
            class="conversion"
            disabled={!conversionEditable}
            title="R-90 : le commerce est converti en totalité en or ou en science (R-88 : la Bibliothèque ajoute sa science). Action immédiate."
            onclick={toggleConversion}
          >
            Convertit le commerce en : <strong>{city.conversion === 'gold' ? 'Or' : 'Science'}</strong>
            <span class="swap">⇄</span>
          </button>
        {/if}
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
              <span class="chip wonder" class:obsolete={isWonderObsolete(w, allTechs)} title="{WONDERS[w]?.effect ?? w}{isWonderObsolete(w, allTechs) ? ' — OBSOLÈTE (effet retiré, jalon et culture conservés — R-128)' : ''}">
                {WONDERS[w]?.name ?? w}{isWonderObsolete(w, allTechs) ? ' · obsolète' : ''}
              </span>
            {/each}
          </div>
        {/if}
        {#if city.settledGreatPersons.length > 0}
          <div class="chips">
            {#each city.settledGreatPersons as gpCls, i (i)}
              <span class="chip gp" title="{settleEffectLabel(gpCls)}">{greatPersonLabel(gpCls)} — {settleEffectLabel(gpCls)}</span>
            {/each}
          </div>
        {/if}
        {#if mine && city.pendingSalvage > 0}
          <!-- R-130 rév. C7 : réserve de marteaux PERMANENTE (porté de CityPanel). -->
          <p class="eta salvage">⚒ {city.pendingSalvage} marteaux en réserve — choisissez un projet : ils financeront la production (réserve permanente, jamais dissipée).</p>
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
  /* Retour d'Erik du 15/09 : les plaquettes s'empilent UNE par ligne
     (nourriture, frontière culturelle, production, sciences & or). */
  .grid { display: grid; grid-template-columns: 1fr; gap: 0.5rem; }
  .block { border: 1px solid #2c353d; border-radius: 8px; padding: 0.5rem 0.6rem; background: #1d242b; }
  .bat, .choix { grid-column: 1 / -1; }
  .big { margin: 0.1rem 0; font-size: 1.02rem; font-weight: 700; display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
  .big img, .item img { width: 16px; height: 16px; }
  .sep { color: #46525c; }
  .eta { margin: 0.15rem 0 0; color: #a5d6a7; font-size: 0.82rem; }
  .eta.pending { color: #ffe082; }
  .eta.bloquee { color: #ffab91; font-weight: 600; }
  .item { margin: 0.2rem 0 0.15rem; display: flex; align-items: center; gap: 0.3rem; font-size: 0.9rem; }
  /* BARRES-CITYVIEW (retour d'Erik du 15/09) : sans largeur propre ni flex,
     la piste se repliait à 0 (seules ses bordures restaient visibles — le
     résidu « | ») et le remplissage en % n'avait rien à remplir. La piste
     prend tout l'espace à côté du compteur ; le remplissage garde la couleur
     de la ressource (vert nourriture / violet culture / ocre production). */
  .bar { flex: 1 1 auto; min-width: 5rem; height: 8px; background: #12161a; border-radius: 4px; overflow: hidden; border: 1px solid #3a4148; }
  .fill { height: 100%; background: #f0c419; }
  .gauge { display: flex; align-items: center; gap: 0.5rem; margin: 0.35rem 0 0.1rem; }
  .gauge .lab { font-size: 0.8rem; color: #8b98a5; white-space: nowrap; display: inline-flex; align-items: center; gap: 0.25rem; }
  .gauge img { width: 14px; height: 14px; }
  .growth-fill { background: #81c784; }
  .culture-fill { background: #ba68c8; }
  .hint { margin: 0.15rem 0 0; color: #8b98a5; font-size: 0.78rem; }
  .conversion { display: block; width: 100%; margin-top: 0.45rem; padding: 0.4rem 0.6rem; text-align: left; border-radius: 6px; border: 1px solid #46525c; background: #27313a; color: inherit; cursor: pointer; }
  .conversion:disabled { opacity: 0.55; cursor: default; }
  .conversion .swap { float: right; color: #ffd54f; }
  .rush { margin-top: 0.35rem; padding: 0.4rem 0.7rem; border-radius: 6px; border: 1px solid #b8863c; background: #332b1e; color: #ffd54f; font-weight: 600; cursor: pointer; }
  .rush:disabled, .rush.locked { opacity: 0.55; cursor: default; }
  .rush .fx { font-weight: 400; color: #b08d5a; font-size: 0.78rem; }
  .chip.gp { border-color: #7e57c2; background: #322a45; color: #d1c4e9; }
  .salvage { color: #ffe082; font-weight: 600; }
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
