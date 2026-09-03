<script lang="ts">
  /**
   * Menu de ville — refonte Phase 7b (maquette RAPPORT-PROPOSITION §4.2) :
   * tableau de bord en 4 blocs — identité, rendements (jauges + durées en
   * tours), citoyens (clic carte = réassignation, R-60), production à deux
   * niveaux (item courant + choix catégorisés unités/bâtiments, verrouillés
   * en fin de section, R-87). Conversion or/science par ville (R-90) via
   * SetConversion (action immédiate). R-88 : la Bibliothèque modifie la
   * conversion (libellés issus de conversionGains, source unique moteur/UI).
   */
  import { unitType, UNIT_TYPES, BUILDINGS, WONDERS, TECHS, tileYield, workRadiusOf, isProducible, isUnitObsolete, conversionGains, RESOURCES, RESOURCE_UNKNOWN, CULTURE, cultureGains, greatPersonThresholdFor, yieldGpThresholdFor, wonderProductionIssue, empirePerCityBonus, neighbors, isWaterTerrain, growthThresholdFor, interiorCitizenFor, interiorCountOf, populationCap } from '@game/rules';
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
  /** Conversion = action immédiate : modifiable en phase ordres, même verrouillé. */
  const conversionEditable = $derived(view.status === 'active' && view.phase === 'orders');

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

  /** Cumuls de la ville : centre gratuit (7i · R-66 rév. : commerce de
   *  tranche) + Σ cases travaillées + citoyens intérieurs (7i · R-60bis). */
  const yields = $derived.by(() => {
    if (!city || !view.state) return null;
    const tier = interiorCitizenFor(city.pop);
    const interior = interiorCountOf(city.pop, city.workedTiles.length);
    const t = { food: 2, production: Math.max(1, 1) + interior * tier.production, commerce: tier.commerce + interior * tier.commerce };
    for (const key of city.workedTiles) {
      const y = tileYield(view.state.map, city.buildings, key, view.state?.players[city.owner]?.techsUnlocked ?? []);
      if (!y) continue;
      t.food += y.food;
      t.production += y.production;
      t.commerce += y.commerce;
    }
    return t;
  });

  /** 7i · D1 : surplus alimentaire = récolte − population (cœur pédagogique). */
  const foodSurplus = $derived(yields && city ? yields.food - city.pop : 0);


  /** R-90/R-88 : répartition or/science selon la conversion de la ville (source unique moteur). */
  const gains = $derived(
    yields && city ? conversionGains(yields.commerce, city.conversion, city.buildings) : null,
  );

  /** Production par tour de la ville (miroir Phase C : raw × Usine × (1 + 0,25×(pop−1)), R-63 🔶 + 7e + citoyens intérieurs 7i). */
  const prodPerTurn = $derived.by(() => {
    if (!city || !view.state) return 0;
    const tier = interiorCitizenFor(city.pop);
    const interior = interiorCountOf(city.pop, city.workedTiles.length);
    let raw = 1 + interior * tier.production; // case de ville (min 1 P — R-66 rév.) + intérieurs
    for (const key of city.workedTiles) {
      const y = tileYield(view.state.map, city.buildings, key, view.state?.players[city.owner]?.techsUnlocked ?? []);
      if (y) raw += y.production;
    }
    let factoryMult = 1;
    for (const b of city.buildings) factoryMult = Math.max(factoryMult, BUILDINGS[b]?.productionMult ?? 1);
    return Math.floor(raw * factoryMult * (1 + 0.25 * (city.pop - 1)));
  });
  const prodEta = $derived(
    city && city.production && prodItem && prodPerTurn > 0
      ? Math.ceil((itemCost(prodItem) - city.production.progress) / prodPerTurn)
      : null,
  );

  /** 7i · D1/D2 · R-63 (rév.) : jauge de croissance — surplus alimentaire vs
   *  seuil de la table growth.json (population cible, 🔶) ; plafond 31. */
  const atPopulationCap = $derived(!!city && city.pop >= populationCap());
  const growthThreshold = $derived.by(() => {
    if (!city) return 0;
    let reduction = 0;
    for (const b of city.buildings) reduction = Math.max(reduction, BUILDINGS[b]?.growthThresholdReduction ?? 0);
    return growthThresholdFor(city.pop, reduction) ?? 0;
  });
  const growthRatio = $derived(
    city && growthThreshold > 0 ? Math.max(0, Math.min(1, city.foodStored / growthThreshold)) : 0,
  );
  const growthEta = $derived(
    city && foodSurplus > 0 && growthThreshold > 0 && city.foodStored < growthThreshold
      ? Math.ceil((growthThreshold - city.foodStored) / foodSurplus)
      : null,
  );

  /** R-60 : rayon de travail courant (Tribunal → 2). */
  const workRadius = $derived(city ? workRadiusOf(city.buildings) : 1);

  /** 7f · R-113/R-114 : culture par tour de la ville + jauge vers le GP
   *  (seuil T-27, ×2 à chaque GP obtenu par l'empire). */
  const culturePerTurn = $derived.by(() => {
    if (!city || !view.state || !engine) return 0;
    const empireBonus = empirePerCityBonus(view.state, engine);
    return cultureGains(city, empireBonus.culture, view.state.players[engine]?.techsUnlocked ?? []);
  });
  const gpThreshold = $derived.by(() => {
    if (!view.state || !engine) return CULTURE.greatPersonThresholdBase;
    return greatPersonThresholdFor(view.state.players[engine]?.greatPersonsObtained ?? 0);
  });
  const cultureRatio = $derived(city ? Math.max(0, Math.min(1, city.cultureStored / gpThreshold)) : 0);

  /**
   * 7h · R-123 : jauges des GP à rendement (or / science / production) —
   * accumulateurs par ville, seuil T-30 (×2 par GP du même type obtenu).
   * Au plus un GP par ville et par tour (culture prioritaire — R-123).
   */
  const YIELD_GAUGES: Array<{ key: 'gpAccumGold' | 'gpAccumScience' | 'gpAccumProd'; type: 'mogul' | 'scientifique' | 'ingenieur'; label: string; icon: string }> = [
    { key: 'gpAccumScience', type: 'scientifique', label: 'GP Scientifique', icon: '/art/icone_science.png' },
    { key: 'gpAccumGold', type: 'mogul', label: 'GP Mogul', icon: '/art/icone_or.png' },
    { key: 'gpAccumProd', type: 'ingenieur', label: 'GP Ingénieur', icon: '/art/icone_production.png' },
  ];
  const gpYieldGauges = $derived.by(() => {
    if (!city || !view.state || !engine) return [];
    const byType = view.state.players[engine]?.greatPersonsByType ?? {};
    return YIELD_GAUGES.map((g) => {
      const threshold = yieldGpThresholdFor(g.type, byType);
      const stored = city[g.key] ?? 0;
      return { ...g, threshold, stored, ratio: Math.max(0, Math.min(1, stored / threshold)) };
    });
  });

  /**
   * Réassignations en attente (retour immédiat) : les ordres SetWorkedTile
   * soumis pour cette ville, appliqués en miroir de ce que fera le moteur —
   * assignation (case libre ET citoyen disponible) ou désassignation (le
   * dernier citoyen de la liste est retiré). Ville pleine : l'assignation
   * est ignorée (désassigner d'abord — règle d'Erik).
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
      } else if (!tiles.includes(o.tile) && tiles.length < city.pop) {
        tiles.push(o.tile);
        assigns.push(o.tile);
      }
      // case déjà travaillée par la ville, ou ville pleine : ignoré (miroir moteur)
    }
    const effective = Math.min(city.pop, tiles.length);
    return { assigns, unassigns, effective, toAssign: city.pop - effective, tiles };
  });
  const hasPending = $derived(pending.unassigns > 0 || pending.assigns.length > 0);
  /** 7i · D4 · R-60bis : citoyens intérieurs — tranche et rendement courants. */
  const tierYields = $derived(city ? interiorCitizenFor(city.pop) : { label: '', production: 0, commerce: 0 });
  const tierLabel = $derived(tierYields.label);
  const interiorCount = $derived(city ? interiorCountOf(city.pop, pending.effective) : 0);

  /**
   * Items de production : unités 7a + bâtiments — FILTRÉS par déblocage
   * (R-87) : tech débloquée ou null, et item implémenté (Espion/Galère
   * exclus — données seules). Verrouillé = grisé avec « Requiert : <tech> ».
   * Refonte 7b : sections Unités / Bâtiments, débloqués d'abord (maquette §4.2).
   */
  const engine = $derived(myEngineId(view));
  const techsUnlocked = $derived(
    view.state && engine ? view.state.players[engine]?.techsUnlocked ?? [] : ([] as string[]),
  );

  /** 7g · R-117 : la ville est-elle côtière (adjacente à une case d'eau de
   *  l'état filtré) ? Condition de production des unités navales. */
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

  function optionFor(item: ProductionItem, name: string, cost: number, effect: string, tech: string | null, requires: string | null = null): ProdOption {
    // 7e : producibilité complète — tech, implémentation, obsolescence,
    // prérequis de bâtiment (Banque exige un Marché…). Palais : fixed.
    const unlocked = isProducible({ tech: tech ?? null, requiresBuilding: requires ?? undefined }, techsUnlocked, city?.buildings ?? []);
    let requiresLabel: string | null = null;
    if (tech && !techsUnlocked.includes(tech)) requiresLabel = TECHS[tech]?.name ?? tech;
    if (requires && !(city?.buildings ?? []).includes(requires)) {
      requiresLabel = requiresLabel ? `${requiresLabel} + ${BUILDINGS[requires]?.name ?? requires}` : (BUILDINGS[requires]?.name ?? requires);
    }
    return {
      item,
      name,
      cost,
      effect,
      unlocked,
      requires: requiresLabel,
      eta: unlocked && prodPerTurn > 0 ? Math.ceil(cost / prodPerTurn) : null,
    };
  }

  const unitOptions = $derived.by(() => {
    const options: ProdOption[] = [];
    for (const u of Object.values(UNIT_TYPES)) {
      if (u.implemented === false) continue; // Caravane, aériens, ICBM : pas proposés (7h+)
      if (u.greatPerson) continue; // 7f · R-114 : les GP ne sortent JAMAIS des files
      // 7e · R-110 : les unités obsolètes sont retirées du menu (CivRev).
      if (isUnitObsolete(u.id, techsUnlocked)) continue;
      const effect = u.id === 'colon'
        ? `Fonde une ville (consomme ${u.populationCost ?? 0} population)`
        : u.aquatic
          ? `${u.attack}/${u.defense}/${u.movement} — naval (${u.navalAccess === 'ocean' ? 'côte + océan' : 'côte seule'})${u.cargoCapacity ? ' · transporte 1 unité terrestre' : ''}`
          : u.isRanged
            ? `${u.attack}/${u.defense}/${u.movement} — à distance`
            : `${u.attack}/${u.defense}/${u.movement}`;
      const opt = optionFor({ kind: 'unit', id: u.id }, u.name, u.cost, effect, u.tech ?? null);
      if (u.aquatic) {
        // 7g · R-117 : une unité navale exige une ville côtière (accès mer).
        if (!cityCoastal) {
          opt.unlocked = false;
          opt.requires = 'Requiert : accès à la mer';
          opt.eta = null;
        }
      }
      options.push(opt);
    }
    return sortUnlockedFirst(options);
  });

  /**
   * 7f · R-116 : merveilles implémentées (Stonehenge, Colosse, Jardins + ONU).
   * Le verrouillage complet (unicité d'empire, jalons de l'ONU, obsolescence)
   * passe par wonderProductionIssue — même validation que le moteur.
   */
  const wonderOptions = $derived.by(() => {
    if (!city || !view.state || !engine) return [];
    const player = view.state.players[engine];
    const ownCities = Object.values(view.state.cities).filter((c) => c.owner === engine);
    const ctx = {
      techsUnlocked,
      empireWondersBuilt: ownCities.flatMap((c) => c.wonders),
      empireWondersInProduction: ownCities
        .filter((c) => c.id !== city.id && c.production?.item.kind === 'wonder')
        .map((c) => (c.production!.item as { kind: 'wonder'; id: string }).id),
      cultureMilestones: player?.cultureMilestones ?? 0,
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

  const buildingOptions = $derived.by(() => {
    const options: ProdOption[] = [];
    for (const b of Object.values(BUILDINGS)) {
      if (b.fixed || b.implemented === false) continue; // Palais, composants du Vaisseau
      if (city && city.buildings.includes(b.id)) continue; // déjà construit (R-66)
      if (b.replaces && city && city.buildings.includes(b.replaces)) continue; // remplacé (R-111)
      const effect = [
        b.workRadiusBonus > 0 ? 'Rayon de travail 1 → 2' : (b.effect ?? tileEffectLabel(b)),
        b.replaces ? `remplace ${BUILDINGS[b.replaces]?.name ?? b.replaces}` : null,
        b.requiresBuilding ? `requiert ${BUILDINGS[b.requiresBuilding]?.name ?? b.requiresBuilding}` : null,
      ].filter((s): s is string => s !== null).join(' — ');
      options.push(optionFor({ kind: 'building', id: b.id }, b.name, b.cost, effect, b.tech ?? null, b.requiresBuilding ?? null));
    }
    return sortUnlockedFirst(options);
  });

  function sortUnlockedFirst(options: ProdOption[]): ProdOption[] {
    return [...options].sort((a, b) => (a.unlocked === b.unlocked ? 0 : a.unlocked ? -1 : 1));
  }

  /** Libellé d'effet d'un bâtiment à bonus de terrain (tileBonus peut être null — crash 7a corrigé). */
  function tileEffectLabel(b: (typeof BUILDINGS)[string]): string {
    if (!b.tileBonus) return b.effect ?? 'Effet à venir';
    const parts: string[] = [];
    if (b.tileBonus.food) parts.push(`+${b.tileBonus.food} N`);
    if (b.tileBonus.production) parts.push(`+${b.tileBonus.production} P`);
    if (b.tileBonus.commerce) parts.push(`+${b.tileBonus.commerce} C`);
    return `${parts.join(' ')} par ${TERRAIN_NAMES[b.tileBonus.terrain] ?? b.tileBonus.terrain}`;
  }

  const TERRAIN_NAMES: Record<string, string> = {
    plaine: 'plaine',
    colline: 'colline',
    montagne: 'montagne',
    desert: 'désert',
    eau: 'mer',
    ocean: 'océan',
  };

  /** Nom de la ressource posée sur une case (R-91/R-92) — tooltip. Le
   *  marqueur « inconnue » est libellé explicitement (identité masquée). */
  function resourceLabel(key: string): string {
    const res = view.state?.map[key]?.resource;
    if (!res) return '';
    return res === RESOURCE_UNKNOWN ? 'Ressource inconnue' : (RESOURCES[res]?.name ?? res);
  }

  /** Icône optionnelle : masquée silencieusement si l'asset est absent. */
  function hideImg(e: Event): void {
    (e.currentTarget as HTMLElement | null)?.style.setProperty('display', 'none');
  }

  /** Cumuls anticipés : les tiles attendues après résolution (miroir des ordres). */
  function projectedYields(tiles: string[]): { food: number; production: number; commerce: number } {
    const t = { food: 2, production: 1, commerce: 1 }; // case de ville (R-60)
    if (!view.state || !city) return t;
    const tier = interiorCitizenFor(city.pop);
    const interior = interiorCountOf(city.pop, tiles.length);
    t.production = 1 + interior * tier.production;
    t.commerce = tier.commerce + interior * tier.commerce;
    for (const key of tiles) {
      const y = tileYield(view.state.map, city.buildings, key, view.state?.players[city.owner]?.techsUnlocked ?? []);
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

  /** R-90 : bascule la conversion or ⇄ science (action immédiate). */
  function toggleConversion(): void {
    if (!city) return;
    client.setConversion(city.id, city.conversion === 'gold' ? 'science' : 'gold');
  }
</script>

<section class="panel">
  <h2>Ville</h2>
  {#if !city}
    <p class="hint">Cliquez sur une ville de la carte. Ville sélectionnée : cliquez une case pour y assigner un citoyen.</p>
  {:else}
    <!-- 1. Identité -->
    <div class="rows">
      <span class="title">
        {city.id}
        {#if city.capital}<span class="capital">Capitale</span>{/if}
        {#if !mine}<span class="enemy">Ennemie — {city.owner}</span>{/if}
      </span>
      <span>
        Population <strong>{city.pop}</strong>
        {#if mine}
          —
          {#if hasPending}
            <strong>{pending.effective}</strong> assigné(s) après résolution
            {#if pending.toAssign > 0}<em class="to-assign"> · {pending.toAssign} citoyen(s) à assigner</em>{/if}
          {:else}
            {city.workedTiles.length} citoyen(s) assigné(s)
          {/if}
          · rayon {workRadius}
        {/if}
      </span>
    </div>

    <!-- 2. Rendements + jauges (projeté si réassignation en attente) -->
    {#if yields}
      {@const shown = hasPending ? projectedYields(pending.tiles) : yields}
      {@const shownGains = conversionGains(shown.commerce, city.conversion, city.buildings)}
      <div class="yields" class:projected={hasPending}>
        <span title="Nourriture par tour"><img src="/art/icone_nourriture.png" alt="N" onerror={hideImg} /> {shown.food}</span>
        <span title="Production par tour"><img src="/art/icone_production.png" alt="P" onerror={hideImg} /> {shown.production}</span>
        <span title="Commerce par tour"><img src="/art/icone_commerce.png" alt="C" onerror={hideImg} /> {shown.commerce}</span>
        {#if mine}
          <span class="split" title="Conversion du commerce (R-90/R-88 — {city.conversion === 'gold' ? 'or' : 'science'})">
            → <img src="/art/icone_or.png" alt="or" onerror={hideImg} /> {shownGains.gold}
            / <img src="/art/icone_science.png" alt="science" onerror={hideImg} /> {shownGains.science}
          </span>
        {/if}
      </div>
      {#if hasPending}<p class="hint pending-note">▲ valeurs projetées (réassignation en attente)</p>{/if}
      {#if mine}
        <!-- 7i · D1 · R-63 (rév.) : la consommation de nourriture, cœur pédagogique -->
        <p
          class="food-line"
          class:deficit={foodSurplus < 0}
          title="R-63 (rév.) : chaque citoyen consomme 1 nourriture par tour — seul le surplus alimente la réserve de croissance"
        >
          Nourriture : {shown.food} récoltée − {city.pop} citoyen{city.pop > 1 ? 's' : ''} =
          <strong>{foodSurplus > 0 ? '+' : ''}{foodSurplus}</strong> /tour
          {#if foodSurplus < 0}<span class="warn"> (déficit — croissance à l'arrêt)</span>{/if}
        </p>
        <div class="gauge" title="Croissance (7i · D2) : surplus vs seuil de la table growth.json (population cible {city.pop + 1})">
          <span class="lab"><img src="/art/icone_nourriture.png" alt="" onerror={hideImg} /> {city.foodStored} / {growthThreshold}</span>
          <div class="bar"><div class="fill growth-fill" style:width={`${growthRatio * 100}%`}></div></div>
          <span class="eta">{atPopulationCap ? 'Plafond (31)' : growthEta !== null ? `${growthEta} tour${growthEta > 1 ? 's' : ''}` : foodSurplus <= 0 ? '—' : ''}</span>
        </div>
        <div class="gauge" title="Culture (R-113) : +Palais / +Temples·Cathédrales × population — Personnage illustre au seuil (T-27, ×2 par GP obtenu)">
          <span class="lab"><img src="/art/icone_culture.png" alt="" onerror={hideImg} /> {city.cultureStored} / {gpThreshold}</span>
          <div class="bar"><div class="fill culture-fill" style:width={`${cultureRatio * 100}%`}></div></div>
          <span class="eta">{culturePerTurn} culture/tour</span>
        </div>
        {#each gpYieldGauges as g (g.type)}
          <div class="gauge" title="{g.label} (R-123) : accumulateur de la ville — seuil T-30 (×2 par GP du même type obtenu)">
            <span class="lab"><img src={g.icon} alt="" onerror={hideImg} /> {g.stored} / {g.threshold}</span>
            <div class="bar"><div class="fill gp-fill" style:width={`${g.ratio * 100}%`}></div></div>
            <span class="eta">{g.label}</span>
          </div>
        {/each}
      {/if}
    {/if}

    <!-- 3. Citoyens + conversion -->
    {#if mine}
      <div class="block">
        <h3>Citoyens — clic carte = assigner / désassigner</h3>
        {#if city.workedTiles.length > 0 || pending.assigns.length > 0}
          <div class="tiles">
            {#each pending.tiles as key (key)}
              <button
                type="button"
                class="tile"
                class:pending={pending.assigns.includes(key)}
                disabled={!editable}
                title={pending.assigns.includes(key) ? `Assignation en attente — annuler (${key})` : `Désassigner (${key})${resourceLabel(key) ? ` — ${resourceLabel(key)}` : ''}`}
                onclick={() => client.submitOrder({ type: 'SetWorkedTile', cityId: city.id, tile: null })}
              >({key})</button>
            {/each}
            {#if pending.toAssign > 0}
              <span class="tile free">+ {pending.toAssign} citoyen(s) à assigner</span>
            {/if}
          </div>
        {:else}
          <p class="hint">Aucun citoyen assigné — cliquez une case sur la carte.</p>
        {/if}
        <!-- 7i · D4 · R-60bis : citoyens intérieurs au centre-ville -->
        {#if interiorCount > 0}
          <p class="hint interior" title="R-60bis : les citoyens non affectés au terrain travaillent au centre-ville — rendement par tranche démographique (growth.json)">
            <strong>{interiorCount}</strong> citoyen{interiorCount > 1 ? 's' : ''} intérieur{interiorCount > 1 ? 's' : ''} au centre-ville :
            <strong>{tierLabel}</strong> (+{tierYields.production} P{tierYields.commerce > 0 ? `, +${tierYields.commerce} C` : ''} chacun)
          </p>
        {/if}
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
      </div>
    {/if}

    <!-- 4. Bâtiments + merveilles possédés -->
    {#if city.buildings.length > 0}
      <div class="block">
        <h3>Bâtiments</h3>
        <div class="btns">
          {#each city.buildings as b (b)}
            <span class="building" title={BUILDINGS[b]?.effect ?? tileEffectLabel(BUILDINGS[b] ?? ({} as never))}>{BUILDINGS[b]?.name ?? b}</span>
          {/each}
        </div>
      </div>
    {/if}
    {#if city.wonders.length > 0}
      <div class="block">
        <h3>Merveilles (+1 jalon chacune)</h3>
        <div class="btns">
          {#each city.wonders as w (w)}
            <span class="wonder" title={WONDERS[w]?.effect ?? w}>{WONDERS[w]?.name ?? w}</span>
          {/each}
        </div>
      </div>
    {/if}

    <!-- 5. Production (ville amie uniquement) -->
    {#if !mine}
      <p class="hint">Ville ennemie visible (lecture seule).</p>
    {:else}
      <div class="block">
        <h3>Production en cours</h3>
        {#if city.production && prodItem}
          <div class="prodcur">
            <span class="name">{itemName(prodItem)}</span>
            <div class="bar"><div class="fill" style:width={`${prodRatio * 100}%`}></div></div>
            <span class="eta-p">
              {city.production.progress} / {itemCost(prodItem)}
              {#if prodEta !== null}— {prodEta} tour{prodEta > 1 ? 's' : ''}{/if}
            </span>
          </div>
        {:else}
          <p class="hint">Aucune production en file.</p>
        {/if}
        {#if prodOrder}<p class="hint">(changement en attente : {itemName(prodOrder.item)})</p>{/if}

        <h3>Produire — unités</h3>
        <div class="queue">
          {#each unitOptions as opt (opt.item.kind + ':' + opt.item.id)}
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
              {#if opt.eta !== null}<span class="turns"> · {opt.eta} tour{opt.eta > 1 ? 's' : ''}</span>{/if}
            </button>
          {/each}
        </div>

        <h3>Produire — bâtiments</h3>
        <div class="queue">
          {#each buildingOptions as opt (opt.item.kind + ':' + opt.item.id)}
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
              {#if opt.eta !== null}<span class="turns"> · {opt.eta} tour{opt.eta > 1 ? 's' : ''}</span>{/if}
            </button>
          {/each}
        </div>

        <h3>Produire — merveilles (7f)</h3>
        <div class="queue">
          {#each wonderOptions as opt (opt.item.kind + ':' + opt.item.id)}
            <button
              type="button"
              class="opt wonder-btn"
              class:locked={!opt.unlocked}
              disabled={!editable || !opt.unlocked}
              title={opt.unlocked ? opt.effect : (opt.requires ?? 'verrouillée')}
              onclick={() => setProduction(opt.item)}
            >
              <b>{opt.name} ({opt.cost})</b>
              <span class="fx">{opt.unlocked ? opt.effect : (opt.requires ?? 'verrouillée')}</span>
              {#if opt.eta !== null}<span class="turns"> · {opt.eta} tour{opt.eta > 1 ? 's' : ''}</span>{/if}
            </button>
          {/each}
        </div>
        {#if city.production}
          <button type="button" class="cancel" disabled={!editable} onclick={() => city && client.cancelCityOrder(city.id)}>Annuler la production</button>
        {/if}
      </div>
    {/if}
  {/if}
</section>

<style>
  .panel { border: 1px solid #3a4148; border-radius: 8px; padding: 0.7rem 0.85rem; background: #1d242b; }
  h2 { margin: 0 0 0.4rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; color: #9aa7b2; }
  h3 { margin: 0.55rem 0 0.3rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: #9aa7b2; }
  .rows { display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0.45rem; }
  .title { font-weight: 700; display: flex; align-items: center; gap: 0.45rem; }
  .capital { color: #ffd54f; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; }
  .enemy { color: #ef9a9a; font-size: 0.8rem; text-transform: none; letter-spacing: 0; }
  .block { border-top: 1px solid #2c353d; padding-top: 0.3rem; margin-top: 0.35rem; }
  .yields { display: flex; flex-wrap: wrap; gap: 0.7rem; align-items: center; font-weight: 600; margin: 0.25rem 0; }
  .yields img { width: 16px; height: 16px; vertical-align: middle; }
  .yields .split { margin-left: auto; font-weight: 400; color: #a8b4be; }
  .yields.projected { opacity: 0.85; }
  .projected-note, .pending-note { margin: 0.1rem 0; color: #ffe082; font-size: 0.78rem; }
  .gauge { display: flex; align-items: center; gap: 0.5rem; margin: 0.35rem 0; }
  .gauge .lab { font-size: 0.8rem; color: #8b98a5; white-space: nowrap; display: inline-flex; align-items: center; gap: 0.25rem; }
  .gauge img { width: 14px; height: 14px; }
  .bar { height: 8px; background: #12161a; border-radius: 4px; overflow: hidden; border: 1px solid #3a4148; flex: 1; }
  .fill { height: 100%; background: #f0c419; }
  .growth-fill { background: #81c784; }
  .culture-fill { background: #ba68c8; }
  .gp-fill { background: #b39ddb; }
  .wonder { padding: 0.15rem 0.5rem; border-radius: 999px; border: 1px solid #b8863c; background: #3c3222; font-size: 0.8rem; color: #ffd54f; }
  .opt.wonder-btn { border-color: #8d6e3c; background: #332b1e; }
  .eta { font-size: 0.8rem; color: #a5d6a7; white-space: nowrap; }
  .prodcur { display: flex; align-items: center; gap: 0.55rem; }
  .prodcur .name { font-weight: 700; }
  .eta-p { font-size: 0.8rem; color: #ffd54f; white-space: nowrap; }
  .tiles { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.2rem; }
  .tile { font-size: 0.78rem; padding: 0.15rem 0.45rem; }
  .tile.pending { border-style: dashed; border-color: #ffd54f; color: #ffe082; }
  .tile.free { border-style: dashed; border-color: #81c784; color: #a5d6a7; cursor: default; padding: 0.15rem 0.55rem; border-radius: 6px; border-width: 1px; background: #1d242b; }
  .to-assign { color: #a5d6a7; font-style: normal; font-weight: 600; }
  .conversion { display: block; width: 100%; margin-top: 0.45rem; padding: 0.4rem 0.6rem; text-align: left; }
  .conversion .swap { float: right; color: #ffd54f; }
  .buildings { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .building { padding: 0.15rem 0.5rem; border-radius: 999px; border: 1px solid #3c7a52; background: #243b2b; font-size: 0.8rem; }
  .hint { margin: 0.15rem 0; color: #8b98a5; font-size: 0.82rem; }
  .food-line { margin: 0.15rem 0; color: #a5d6a7; font-size: 0.84rem; }
  .food-line.deficit { color: #ef9a9a; }
  .food-line .warn { color: #ef9a9a; font-style: italic; }
  .interior { color: #b39ddb; }
  .btns { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.4rem 0; }
  .queue { display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: 0.4rem; margin: 0.35rem 0 0.5rem; }
  .opt { text-align: left; padding: 0.4rem 0.55rem; border-radius: 8px; border: 1px solid #46525c; background: #27313a; color: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 0.1rem; }
  .opt b { font-size: 0.84rem; }
  .opt .fx { color: #8b98a5; font-size: 0.74rem; }
  .opt .turns { color: #ffd54f; font-size: 0.74rem; }
  .opt.locked { opacity: 0.55; cursor: default; }
  .opt.locked .fx { color: #b08d5a; }
  .opt:disabled { opacity: 0.55; cursor: default; }
  .cancel { margin-top: 0.3rem; padding: 0.35rem 0.7rem; cursor: pointer; border-radius: 6px; border: 1px solid #46525c; background: #27313a; color: inherit; }
  .cancel:disabled { opacity: 0.45; cursor: default; }
</style>
