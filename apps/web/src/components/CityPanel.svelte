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
  import { unitType, UNIT_TYPES, BUILDINGS, WONDERS, TECHS, tileYield, tileKeyOf, workRadiusOf, conversionGains, RESOURCES, RESOURCE_UNKNOWN, CULTURE, cultureGains, greatPersonThresholdFor, wonderProductionIssue, empirePerCityBonus, neighbors, isWaterTerrain, growthThresholdFor, toursAvantCroissance, interiorCitizenFor, interiorCountOf, populationCap, allKnownTechs, cityGoldMultOf, empireGoldMultOf, isWonderObsolete, rushBuyCostOf, isRushForbidden, productionItemCostOf, eraOfPlayer, civIdOf, activeTraitsOf, effectsFor } from '@game/rules';
  import { optionsUnites, optionsBatiments, tileEffectLabel } from '../lib/productionMenu.js';
  import { greatPersonLabel, settleEffectLabel } from '../lib/labels.js';
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

  /** 7l · R-135 : achat instantané — coût (rushBuyCostOf, source unique) et
   *  éligibilité d'affichage (interdits ONU/Banque mondiale, trésorerie,
   *  case de ville libre pour les unités — le moteur revalide tout). */
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
  function itemCost(item: ProductionItem): number {
    return item.kind === 'unit' ? unitType(item.id).cost : (BUILDINGS[item.id]?.cost ?? Infinity);
  }

  const prodItem = $derived(city?.production?.item ?? null);
  const prodRatio = $derived(
    city && city.production && prodItem ? Math.max(0, Math.min(1, city.production.progress / itemCost(prodItem))) : 0,
  );
  const player = $derived(city ? view.state?.players[city.owner] ?? null : null);

  /** Cumuls de la ville : centre gratuit (socle garanti 1N/1P/1C — R-66
   *  rév. 06/09 ; tranche R-60bis au-dessus du socle) + Σ cases travaillées.
   *  7k · R-132 : les merveilles portent des bonus par terrain (Cie des
   *  Indes — océan), obsolescence évaluée sur l'union (M1/R-128). */
  const yields = $derived.by(() => {
    if (!city || !view.state) return null;
    const t = { ...centerYields(city.pop, city.workedTiles.length) };
    for (const key of city.workedTiles) {
      const y = tileYield(view.state.map, city.buildings, key, view.state?.players[city.owner]?.techsUnlocked ?? [], city.wonders, allTechs);
      if (!y) continue;
      t.food += y.food;
      t.production += y.production;
      t.commerce += y.commerce;
    }
    return t;
  });

  /** ALIGNEMENT-CROISSANCE (13/09) : AUCUN citoyen ne consomme — le surplus
   *  alimentaire = la nourriture produite. */
  const foodSurplus = $derived(yields ? yields.food : 0);


  /** R-90/R-88 : répartition or/science selon la conversion de la ville (source unique moteur).
   *  7k · R-132 : Foire de Troyes (cité) et Internet (empire) multiplient la part OR — MAX (R-88 🔶). */
  function gainsFor(commerce: number): { gold: number; science: number } {
    const base = conversionGains(commerce, city!.conversion, city!.buildings);
    // 7l · C10 : cumul Troyes/Internet MULTIPLICATIF (×4) — miroir moteur.
    const mult = city && view.state
      ? cityGoldMultOf(city.wonders, allTechs) *
        empireGoldMultOf(Object.values(view.state.cities), city.owner, allTechs)
      : 1;
    return { gold: Math.round(base.gold * mult), science: base.science };
  }
  const gains = $derived(yields && city ? gainsFor(yields.commerce) : null);
  /** 7l · R-134 : or DIRECT versé à la trésorerie par les ressources
   *  Gemmes/Or travaillées (canon — accessible selon la tech). */
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

  /** Production par tour de la ville (miroir Phase C : raw × Usine × (1 + 0,25×(pop−1)), R-63 🔶 + 7e + citoyens intérieurs 7i). */
  const prodPerTurn = $derived.by(() => {
    if (!city || !view.state) return 0;
    let raw = centerYields(city.pop, city.workedTiles.length).production; // case de ville (0 — A3) + intérieurs
    for (const key of city.workedTiles) {
      const y = tileYield(view.state.map, city.buildings, key, view.state?.players[city.owner]?.techsUnlocked ?? [], city.wonders, allTechs);
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

  /** R-63 (rév. 13/09) : jauge de croissance — surplus alimentaire (aucune
   *  consommation) vs seuil de la table growth.json (10 × pop actuelle) ;
   *  plafond 31. */
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
  /** Helper PUR du moteur (growth.ts — réutilisable par le futur MENU-VILLE) :
   *  tours avant croissance au rythme du surplus courant. */
  const growthEta = $derived(
    city && growthThreshold > 0 && city.foodStored < growthThreshold
      ? toursAvantCroissance(city.pop, city.foodStored, foodSurplus, growthReductionUi())
      : null,
  );
  function growthReductionUi(): number {
    if (!city) return 0;
    let reduction = 0;
    for (const b of city.buildings) reduction = Math.max(reduction, BUILDINGS[b]?.growthThresholdReduction ?? 0);
    return reduction;
  }

  /** R-60 : rayon de travail courant (Tribunal → 2). */
  const workRadius = $derived(city ? workRadiusOf(city.buildings) : 1);

  /** 7f · R-113/R-114 : culture par tour de la ville + jauge vers le GP
   *  (seuil T-27, ×2 à chaque GP obtenu par l'empire).
   *  7k · M1/R-128 : l'obsolescence des merveilles (Stonehenge, Magna Carta,
   *  Théâtre) est évaluée sur l'UNION des techs de toutes les civilisations.
   *  EXPANSION-CULTURELLE (M1, cohérence UI) : les effets de RÉGIME
   *  (Monarchie ×2 Palais, Communisme Temples = 0) sont passés comme au
   *  moteur (effectsFor — source unique, miroir turn.ts) et la part Palais
   *  révisée min(pop, cap) est reflétée d'office via cultureGains. */
  const culturePerTurn = $derived.by(() => {
    if (!city || !view.state || !engine) return 0;
    const empireBonus = empirePerCityBonus(view.state, engine);
    const govEffects = effectsFor(view.state.players[city.owner]!);
    return cultureGains(city, empireBonus.culture, allTechs, govEffects);
  });
  /**
   * RETRAIT-GP-ACCUMULATEURS (décision d'Erik du 14/09) : les jauges des GP
   * à rendement (R-123 — accumulateurs `gpAccum*`, seuil T-30) sont
   * SUPPRIMÉES. La jauge restante est celle du canal CULTURE (paliers T-27).
   */

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
  // GP-CULTURE-EVENEMENTS (D1, décision d'Erik du 13/09) : la jauge est celle
  // de la CIVILISATION — cumul EMPIRE (Σ des city.cultureCumulee, jamais
  // soustrait) vers le PROCHAIN palier T-27 (index = player.culturePaliers).
  const culturePaliers = $derived(view.state && engine ? view.state.players[engine]?.culturePaliers ?? 0 : 0);
  const cultureEmpire = $derived.by(() => {
    if (!view.state || !engine) return 0;
    let total = 0;
    for (const c of Object.values(view.state.cities)) {
      if (c.owner === engine) total += c.cultureCumulee;
    }
    return total;
  });
  const gpThreshold = $derived(greatPersonThresholdFor(culturePaliers));
  const cultureRatio = $derived(Math.max(0, Math.min(1, cultureEmpire / gpThreshold)));

  const techsUnlocked = $derived(
    view.state && engine ? view.state.players[engine]?.techsUnlocked ?? [] : ([] as string[]),
  );
  /** 7k · M1/R-128 : obsolescence GLOBALE — l'union des techs de toutes les
   *  civilisations (l'état filtré expose les techsUnlocked de tous). */
  const allTechs = $derived(view.state ? allKnownTechs(view.state) : ([] as string[]));

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

  // CORRECTIFS-SOLO 1 : options d'unités/bâtiments extraites dans
  // `lib/productionMenu.ts` — producibilité par `canSetProduction` (même
  // source que le serveur et le bot, R-87) ; ICBM jamais listée (R-138).
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

  const unitOptions = $derived.by(() => {
    if (!menuCtx) return [] as ProdOption[];
    return optionsUnites(menuCtx) as ProdOption[];
  });

  // 7n · R-145 : civ du propriétaire de la ville (menus + tooltips traits).
  const cityCivId = $derived(city && view.state ? civIdOf(view.state.players[city.owner]) : 'neutre');
  const cityEra = $derived(city && view.state ? eraOfPlayer(view.state.players[city.owner]) : 'ancienne');
  // 7n · R-145 : traits ACTIFS de la ville (tooltips — inactifs grisés).
  const cityTraits = $derived(cityCivId === 'neutre' ? [] : activeTraitsOf({ civId: cityCivId, era: cityEra }));

  const buildingOptions = $derived.by(() => {
    if (!menuCtx) return [] as ProdOption[];
    return optionsBatiments(menuCtx) as ProdOption[];
  });

  /**
   * 7f · R-116 (rév. 7k) : merveilles implémentées. Le verrouillage complet
   * (exclusivité MONDIALE R-129, jalons de l'ONU, obsolescence GLOBALE R-128
   * via l'union des techs) passe par wonderProductionIssue — même validation
   * que le moteur.
   */
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
      treasury: player?.treasury ?? 0, // 7l · R-137 : condition DYNAMIQUE de la Banque mondiale
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

  /** ALIGNEMENT-CROISSANCE : rendement du CENTRE-VILLE — via tileYield
   *  (source unique moteur : la case de ville rapporte 0/0/0, socle R-66
   *  abrogé) + tranche démographique et citoyens intérieurs (R-60bis). */
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

  /** Cumuls anticipés : les tiles attendues après résolution (miroir des ordres). */
  function projectedYields(tiles: string[]): { food: number; production: number; commerce: number } {
    if (!city || !view.state) return { food: 0, production: 0, commerce: 0 };
    const t = { ...centerYields(city.pop, tiles.length) };
    const st = view.state;
    for (const key of tiles) {
      const y = tileYield(st.map, city.buildings, key, st.players[city.owner]?.techsUnlocked ?? [], city.wonders, allTechs);
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
      {@const shownGains = gainsFor(shown.commerce)}
      <div class="yields" class:projected={hasPending}>
        <span title="Nourriture par tour"><img src="/art/icone_nourriture.png" alt="N" onerror={hideImg} /> {shown.food}</span>
        <span title="Production par tour"><img src="/art/icone_production.png" alt="P" onerror={hideImg} /> {shown.production}</span>
        <span title="Commerce par tour"><img src="/art/icone_commerce.png" alt="C" onerror={hideImg} /> {shown.commerce}</span>
        {#if mine}
          <span class="split" title="Conversion du commerce (R-90/R-88 — {city.conversion === 'gold' ? 'or' : 'science'})">
            → <img src="/art/icone_or.png" alt="or" onerror={hideImg} /> {shownGains.gold}
            / <img src="/art/icone_science.png" alt="science" onerror={hideImg} /> {shownGains.science}
            {#if directGold > 0}
              + {directGold} or direct (Gemmes/Or — R-134)
            {/if}
          </span>
        {/if}
      </div>
      {#if hasPending}<p class="hint pending-note">▲ valeurs projetées (réassignation en attente)</p>{/if}
      <p class="hint center-floor" title="ALIGNEMENT-CROISSANCE : la case de ville ne produit RIEN (0 N / 0 P / 0 C) — la ville vit par ses citoyens (travaillés ou intérieurs, R-60/R-60bis).">Case de ville : aucun rendement — la ville vit par ses citoyens</p>
      {#if mine}
        <!-- R-63 (rév. 13/09) : aucune consommation — le surplus = la récolte -->
        <p
          class="food-line"
          class:deficit={foodSurplus < 0}
          title="R-63 (rév. 13/09) : les citoyens ne consomment AUCUNE nourriture — toute la récolte alimente la réserve de croissance"
        >
          Nourriture : <strong>{foodSurplus > 0 ? '+' : ''}{foodSurplus}</strong> /tour
          (aucune consommation)
          {#if foodSurplus <= 0}<span class="warn"> (aucun surplus — croissance à l'arrêt)</span>{/if}
        </p>
        <div class="gauge" title="Croissance (R-63 rév. 13/09) : surplus vs seuil de la table growth.json (10 × population actuelle : {city.pop} → {10 * city.pop})">
          <span class="lab"><img src="/art/icone_nourriture.png" alt="" onerror={hideImg} /> {city.foodStored} / {growthThreshold}</span>
          <div class="bar"><div class="fill growth-fill" style:width={`${growthRatio * 100}%`}></div></div>
          <span class="eta">{atPopulationCap ? 'Plafond (31)' : growthEta !== null ? `${growthEta} tour${growthEta > 1 ? 's' : ''}` : foodSurplus <= 0 ? '—' : ''}</span>
        </div>
        <div class="gauge" title="Culture de la CIVILISATION (GP-CULTURE-EVENEMENTS · D1/D6, 13/09) : cumul EMPIRE des cultures de villes (jamais soustrait) — chaque palier T-27 franchi = +1 événement culturel ET 1 Grand Personnage (ville la plus cultivée)">
          <span class="lab"><img src="/art/icone_culture.png" alt="" onerror={hideImg} /> Palier {culturePaliers + 1} : {cultureEmpire} / {gpThreshold}</span>
          <div class="bar"><div class="fill culture-fill" style:width={`${cultureRatio * 100}%`}></div></div>
          <span class="eta">{culturePerTurn} culture/tour (cette ville)</span>
        </div>
        {#if city.settledGreatPersons.length > 0}
          <p class="settled-gps" title="7j · R-126 : GP INSTALLÉS — multiplicateurs permanents de rendement de cette cité">
            GP installés :
            {#each city.settledGreatPersons as gpCls, i (i)}
              <span class="chip" title="{settleEffectLabel(gpCls)}">{greatPersonLabel(gpCls)} — {settleEffectLabel(gpCls)}</span>
            {/each}
          </p>
        {/if}
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
                <!-- 7k · M1/R-128 : le badge « obsolète » suit l'obsolescence GLOBALE
                     (tech connue par N'IMPORTE QUELLE civilisation) — jalon conservé. -->
                <span class="wonder" class:obsolete={isWonderObsolete(w, allTechs)} title="{WONDERS[w]?.effect ?? w}{isWonderObsolete(w, allTechs) ? ' — OBSOLÈTE (effet retiré, jalon et culture conservés — R-128)' : ''}">
                  {WONDERS[w]?.name ?? w}{isWonderObsolete(w, allTechs) ? ' · obsolète' : ''}
                </span>
              {/each}
            </div>
          </div>
        {/if}
        {#if mine && city.pendingSalvage > 0}
          <!-- 7l · C7 · R-130 (rév.) : réserve de marteaux PERMANENTE — elle
               finance le projet choisi (bâtiment/merveille au coût couvert,
               unités en série) et ne se dissipe JAMAIS. -->
          <p class="salvage" title="R-130 rév. C7 : un rival a achevé une merveille que cette ville construisait — les marteaux investis forment une réserve PERMANENTE qui finance votre prochain projet (jusqu'à épuisement ; surplus conservé).">
            ⚒ {city.pendingSalvage} marteaux en réserve — choisissez un projet : ils financeront la production (réserve permanente, jamais dissipée).
          </p>
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
          {#if rush && mine}
            <!-- 7l · R-135 : achat instantané — coût = marteaux restants ×
                 facteur d'ère × réductions (source unique moteur/UI). Grisé si
                 trésorerie insuffisante, item interdit (ONU/Banque mondiale) ou
                 pose impossible (case de ville occupée — unité). -->
            <button
              type="button"
              class="rush"
              class:locked={!rush.allowed}
              disabled={!editable || !rush.allowed}
              title={rush.reason ?? `Acheter ${itemName(prodItem)} immédiatement pour ${rush.cost} or (marteaux restants × facteur d'ère — R-135)`}
              onclick={() => rushNow()}
            >
              ⚡ Acheter maintenant pour {rush.cost ?? '—'} or
              {#if !rush.allowed}<span class="fx"> — {rush.reason}</span>{/if}
            </button>
          {/if}
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
  .wonder { padding: 0.15rem 0.5rem; border-radius: 999px; border: 1px solid #b8863c; background: #3c3222; font-size: 0.8rem; color: #ffd54f; }
  .wonder.obsolete { opacity: 0.55; border-style: dashed; color: #a89880; }
  .salvage { margin: 0.2rem 0; color: #ffe082; font-size: 0.84rem; font-weight: 600; }
  .rush { margin-top: 0.35rem; padding: 0.4rem 0.7rem; border-radius: 6px; border: 1px solid #b8863c; background: #332b1e; color: #ffd54f; font-weight: 600; cursor: pointer; }
  .rush:disabled, .rush.locked { opacity: 0.55; cursor: default; }
  .rush .fx { font-weight: 400; color: #b08d5a; font-size: 0.78rem; }
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
