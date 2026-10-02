<script lang="ts">
  /**
   * MENU-VILLE-QUEUE · D3 (demande d'Erik du 02/10) — PANNEAU DE VILLE À
   * GAUCHE, ouvert au clic simple sur une ville (sélection inchangée côté
   * droit — la colonne T2 reste telle quelle). Contenu = celui de l'ancien
   * CityView (vue ville zoomée, DORMANTE depuis cette mission — voir
   * CityView.svelte) restylé AAA (tokens LOBBY-PREMIUM, miroir T1/T2/
   * RapportCombat), AUGMENTÉ de la FILE D'ATTENTE DE PRODUCTION :
   *  - cliquer un item des onglets l'AJOUTE EN QUEUE (QueueProduction — D1) ;
   *  - la croix RETIRE n'importe quel rang (RemoveFromQueue — la tête entamée
   *    rend ses marteaux à la réserve R-130) ;
   *  - les flèches ↑↓ RÉORDONNENT la file d'attente (ReorderQueue — la tête,
   *    entamée, ne bouge pas) ;
   *  - ETA par rang (production séquentielle, marteaux/tour effectifs).
   * Le rush-buy s'applique à la TÊTE (R-135, inchangé). La profondeur est
   * data-driven (FILE_PRODUCTION_PROFONDEUR du moteur).
   * Zéro gameplay nouveau : les ordres existants, la file se programme comme
   * la production actuelle (même contrat de résolution).
   */
  import { unitType, BUILDINGS, WONDERS, tileYield, tileKeyOf, workRadiusOf, conversionGains, interiorCitizenFor, interiorCountOf, allKnownTechs, cityGoldMultOf, empireGoldMultOf, settledGpMultiplier, toursAvantCroissance, populationCap, isWonderObsolete, wonderProductionIssue, eraOfPlayer, civIdOf, neighbors, isWaterTerrain, cultureGains, empirePerCityBonus, effectsFor, rushBuyCostOf, isRushForbidden, eraRushFactorForEra, RESOURCES, RESOURCE_UNKNOWN, FILE_PRODUCTION_PROFONDEUR, cultureRessourcesTravaillees, civToutesRessources } from '@game/rules';
  import type { ProductionItem } from '@game/rules';
  import type { GameClient, GameView } from '../lib/gameClient.js';
  import { myEngineId, ordersEditable, effectiveWorkedTiles } from '../lib/render/interaction.js';
  import { civName, greatPersonLabel, settleEffectLabel } from '../lib/labels.js';
  import { optionsUnites, optionsBatiments, tileEffectLabel } from '../lib/productionMenu.js';
  import { jaugeCroissance, jaugeFrontiereCulturelle, jaugeProduction, toursAvantSeuil } from '../lib/jauges.js';
  import { fileEffective } from '../lib/fileProduction.js';

  interface Props {
    view: GameView;
    client: GameClient;
    cityId: string;
    onFermer(): void;
  }

  let { view, client, cityId, onFermer }: Props = $props();

  const city = $derived(view.state?.cities[cityId] ?? null);
  const mine = $derived(!!city && city.owner === myEngineId(view));
  const editable = $derived(ordersEditable(view));
  const engine = $derived(myEngineId(view));

  // ---- Nom (nom porté — VilleN ou table de civ — fallback id) -------------
  const displayName = $derived(city ? (city.name ?? city.id) : '');

  // ---- Rendements de la ville (état effectif — miroir CityView) ----------
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

  // ---- Nourriture ---------------------------------------------------------
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

  // ---- Production : marteaux/tour -----------------------------------------
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
  function itemCost(item: ProductionItem): number {
    return item.kind === 'unit' ? unitType(item.id).cost : (BUILDINGS[item.id]?.cost ?? Infinity);
  }
  function itemName(item: ProductionItem): string {
    return item.kind === 'unit' ? unitType(item.id).name : (BUILDINGS[item.id]?.name ?? item.id);
  }

  // ---- FILE EFFECTIVE (D1/D2) : état + brouillons, miroir du moteur -------
  const file = $derived(city ? fileEffective(view, city.id, FILE_PRODUCTION_PROFONDEUR) : { rangs: [], mine: false, profondeur: FILE_PRODUCTION_PROFONDEUR });
  const filePleine = $derived(file.rangs.length >= file.profondeur);

  /** ETA par rang : production séquentielle — reste de la tête, puis coûts
   *  cumulés (miroir de la consommation moteur). */
  const etas = $derived.by(() => {
    if (!file || prodPerTurn <= 0) return file.rangs.map(() => null);
    const out: (number | null)[] = [];
    let cumul: number | null = null;
    for (const [i, rang] of file.rangs.entries()) {
      const cout = itemCost(rang.item);
      if (!Number.isFinite(cout)) {
        out.push(null);
        continue;
      }
      cumul = (cumul ?? 0) + (i === 0 ? cout - rang.progress : cout);
      out.push(Math.ceil(cumul / prodPerTurn));
    }
    return out;
  });

  // ---- Rush-buy (R-135) — TÊTE uniquement, inchangé ------------------------
  const rush = $derived.by(() => {
    if (!city || !mine || !view.state) return null;
    const tete = file.rangs[0] ?? null;
    if (!tete) return null;
    const cityVue = city.production ? city : { ...city, production: { item: tete.item, progress: 0 } };
    const cost = rushBuyCostOf(view.state, cityVue);
    if (cost === null) {
      return isRushForbidden(tete.item)
        ? { cost: null, allowed: false, reason: 'achat interdit (merveille de victoire — R-135)' }
        : null;
    }
    const player = view.state.players[city.owner];
    const treasury = player?.treasury ?? 0;
    if (treasury < cost) return { cost, allowed: false, reason: `trésorerie insuffisante (${treasury} or)` };
    if (view.orders.some((o) => o.type === 'RushBuy' && o.cityId === city.id)) {
      return { cost, allowed: false, reason: 'achat déjà programmé ce tour (1 achat/ville/tour — R-135)' };
    }
    if (tete.item.kind === 'unit') {
      const occupied = Object.values(view.state.units).some(
        (u) => u.aboard === null && u.q === city.q && u.r === city.r,
      );
      if (occupied) return { cost, allowed: false, reason: 'case de ville occupée (pose impossible)' };
    }
    return { cost, allowed: true, facteur: eraRushFactorForEra(eraOfPlayer(player)), reason: null };
  });
  function rushNow(): void {
    if (!city || !rush?.allowed) return;
    client.submitOrder({ type: 'RushBuy', cityId: city.id });
  }

  // ---- Sciences & or (conversion R-90) -------------------------------------
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
  const conversionEditable = $derived(view.status === 'active' && view.phase === 'orders');
  function toggleConversion(): void {
    if (!city || !mine) return;
    client.setConversion(city.id, city.conversion === 'gold' ? 'science' : 'gold');
  }
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

  // ---- Frontière culturelle -------------------------------------------------
  const frontiere = $derived(city ? jaugeFrontiereCulturelle(city.cultureCumulee) : { anneaux: 0, prochainSeuil: null as number | null, ratio: 0, plafond: false });
  const culturePerTurn = $derived.by(() => {
    if (!city || !view.state || !engine) return 0;
    const empireBonus = empirePerCityBonus(view.state, engine);
    const govEffects = effectsFor(view.state.players[city.owner]!);
    // CULTURE-RESSOURCES (décisions d'Erik du 02/10) : + la culture DIRECTE
    // des ressources culturelles travaillées (Encens +2, Soie +3 — miroir du
    // moteur, même accessibilité R-93).
    const joueurVille = view.state.players[city.owner];
    const cultureRess = cultureRessourcesTravaillees(
      view.state.map,
      city.workedTiles,
      joueurVille?.techsUnlocked ?? [],
      civToutesRessources(joueurVille),
    );
    return cultureGains(city, empireBonus.culture, allTechs, govEffects) + cultureRess;
  });
  const frontiereEta = $derived(
    city && frontiere.prochainSeuil !== null ? toursAvantSeuil(city.cultureCumulee, frontiere.prochainSeuil, culturePerTurn) : null,
  );

  const treasury = $derived(
    city && view.state ? (view.state.players[city.owner]?.treasury ?? 0) : 0,
  );

  // ---- Onglets constructible ----------------------------------------------
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

  const cityCivId = $derived(city && view.state ? civIdOf(view.state.players[city.owner]) : 'neutre');
  const cityCivLabel = $derived(cityCivId === 'neutre' ? '' : civName(cityCivId));

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
  const optionsOnglet = $derived(
    (onglet === 'unites' ? unitOptions : onglet === 'batiments' ? buildingOptions : wonderOptions).filter(
      (opt) => opt.unlocked,
    ),
  );

  // ---- Actions de file (D1) -------------------------------------------------
  /** Clic d'un item des onglets : AJOUT EN QUEUE (plus de remplacement). */
  function ajouterALaFile(item: ProductionItem): void {
    if (!city || !editable || filePleine) return;
    client.submitOrder({ type: 'QueueProduction', cityId: city.id, item });
  }
  /** Croix : retrait du rang `i` de la file AFFICHÉE (0 = tête — salvage R-130). */
  function retirerDeLaFile(i: number): void {
    if (!city || !editable) return;
    client.submitOrder({ type: 'RemoveFromQueue', cityId: city.id, index: i });
  }
  /** Flèches : réordonner la file d'ATTENTE (indices moteur décalés de 1). */
  function reordonner(i: number, delta: -1 | 1): void {
    if (!city || !editable) return;
    client.submitOrder({ type: 'ReorderQueue', cityId: city.id, from: i - 1, to: i - 1 + delta });
  }

  function hideImg(e: Event): void {
    (e.currentTarget as HTMLElement | null)?.style.setProperty('display', 'none');
  }
</script>

<aside class="panneau-ville" aria-label="Panneau de ville">
  <header>
    <div>
      <h1>{displayName}</h1>
      <span class="sub">
        {#if city?.capital}Capitale · {/if}
        {#if cityCivLabel}{cityCivLabel} · {/if}
        population {city?.pop ?? '—'} · rayon {city ? workRadiusOf(city.buildings) : '—'}
      </span>
    </div>
    <button type="button" class="fermer" title="Fermer le panneau (Échap)" onclick={onFermer}>✕</button>
  </header>

  {#if !city}
    <p class="ligne-douce">Ville introuvable.</p>
  {:else}
    <!-- FILE D'ATTENTE (D1) — en tête de panneau -->
    <section class="bloc file" aria-label="File de production">
      <h2>File de production <span class="compte">{file.rangs.length} / {file.profondeur}</span></h2>
      {#if file.rangs.length === 0}
        <p class="ligne-douce">File vide — cliquez un item ci-dessous pour le programmer.</p>
        {#if mine && (prodPerTurn > 0 || city.pendingSalvage > 0)}
          <p class="alerte">⚠ Fin de tour bloquée — sélectionnez une production
            {city.pendingSalvage > 0 ? `(${city.pendingSalvage} marteaux en réserve, C7)` : `(${prodPerTurn} marteaux/tour)`}.
          </p>
        {/if}
      {:else}
        <ol class="rangs">
          {#each file.rangs as rang, i (i + ':' + rang.item.kind + ':' + rang.item.id)}
            <li class="rang" class:tete={i === 0}>
              <span class="rang-no">{i + 1}</span>
              <div class="rang-corps">
                <span class="rang-nom">{itemName(rang.item)}</span>
                {#if i === 0 && rang.progress > 0}
                  <span class="rang-jauge" title="Marteaux engagés (tête entamée — R-62)">
                    <span class="barre"><span class="rempli" style:width={`${jaugeProduction(rang.progress, itemCost(rang.item)) * 100}%`}></span></span>
                    <span class="rang-meta">{rang.progress} / {itemCost(rang.item)} marteaux</span>
                  </span>
                {/if}
                <span class="rang-meta">
                  {#if etas[i] !== null && etas[i] !== undefined}dans {etas[i]} tour{etas[i]! > 1 ? 's' : ''}{:else}à l'arrêt{/if}
                  {#if i === 0 && mine && rush}<span class="sep-dot">·</span>{/if}
                </span>
              </div>
              {#if mine}
                <span class="rang-actions">
                  {#if i > 1}
                    <button type="button" class="fleche" disabled={!editable} title="Monter dans la file" onclick={() => reordonner(i, -1)}>↑</button>
                  {/if}
                  {#if i > 0 && i < file.rangs.length - 1}
                    <button type="button" class="fleche" disabled={!editable} title="Descendre dans la file" onclick={() => reordonner(i, 1)}>↓</button>
                  {/if}
                  <button type="button" class="croix" disabled={!editable} title={i === 0 ? 'Retirer (les marteaux engagés retournent en réserve — R-130)' : 'Retirer de la file'} onclick={() => retirerDeLaFile(i)}>✕</button>
                </span>
              {/if}
            </li>
          {/each}
        </ol>
        {#if filePleine}<p class="ligne-douce">File pleine ({file.profondeur} — profondeur data-driven).</p>{/if}
        {#if mine && rush}
          <button
            type="button"
            class="rush"
            class:bloque={!rush.allowed}
            disabled={!editable || !rush.allowed}
            title={rush.reason ?? `Acheter ${itemName(file.rangs[0]!.item)} immédiatement pour ${rush.cost} or (marteaux restants × facteur d'ère ×${rush.facteur ?? 2} — R-135, TÊTE de file)`}
            onclick={rushNow}
          >
            ⚡ Acheter « {itemName(file.rangs[0]!.item)} » pour {rush.cost ?? '—'} or
            {#if !rush.allowed}<span class="fx"> — {rush.reason}</span>{/if}
          </button>
        {/if}
      {/if}
    </section>

    <div class="separateur"></div>

    <!-- Nourriture -->
    <section class="bloc">
      <h2>Nourriture</h2>
      <p class="grand">
        <img src="/art/icone_nourriture.png" alt="" onerror={hideImg} />
        {foodSurplus > 0 ? '+' : ''}{foodSurplus} /tour
      </p>
      <p class="ligne">
        {#if atPopulationCap}
          Plafond de population atteint
        {:else if growthEta !== null}
          Prochaine population dans <strong>{growthEta} tour{growthEta > 1 ? 's' : ''}</strong>
        {:else}
          Aucun surplus — croissance à l'arrêt
        {/if}
      </p>
      <div class="jauge" title="Croissance (R-63) : réserve vs seuil 10 × population actuelle ({city.pop} → {growth.seuil})">
        <span class="etiq"><img src="/art/icone_nourriture.png" alt="" onerror={hideImg} /> {city.foodStored} / {growth.seuil}</span>
        <div class="barre"><div class="rempli croissance" style:width={`${growth.ratio * 100}%`}></div></div>
      </div>
    </section>

    <!-- Frontière culturelle -->
    <section class="bloc">
      <h2>Frontière culturelle</h2>
      <p class="grand">
        <img src="/art/icone_culture.png" alt="" onerror={hideImg} />
        {culturePerTurn > 0 ? '+' : ''}{culturePerTurn} culture /tour
      </p>
      <p class="ligne">
        {#if frontiere.plafond}
          Tous les anneaux culturels sont acquis ({frontiere.anneaux})
        {:else if frontiereEta !== null}
          Prochain anneau dans <strong>{frontiereEta} tour{frontiereEta > 1 ? 's' : ''}</strong>
        {:else}
          Prochain anneau — culture à l'arrêt
        {/if}
      </p>
      <div class="jauge" title="Frontière culturelle (R-162) : seuils 10 / 100 / 1 000 / 10 000 — +1 anneau par seuil, plafond 5.">
        {#if frontiere.plafond}
          <span class="etiq">{city.cultureCumulee} (plafond)</span>
        {:else}
          <span class="etiq">{city.cultureCumulee} / {frontiere.prochainSeuil}</span>
        {/if}
        <div class="barre"><div class="rempli culture" style:width={`${frontiere.ratio * 100}%`}></div></div>
      </div>
    </section>

    <!-- Sciences & or -->
    <section class="bloc">
      <h2>Sciences & or de la ville</h2>
      <p class="grand">
        <img src="/art/icone_science.png" alt="" onerror={hideImg} />
        {gains?.science ?? 0} sciences /tour
        <span class="sep">·</span>
        <img src="/art/icone_or.png" alt="" onerror={hideImg} />
        {gains?.gold ?? 0} or /tour
      </p>
      {#if directGold > 0}<p class="ligne">+ {directGold} or direct (Gemmes/Or — R-134)</p>{/if}
      {#if mine}
        <button
          type="button"
          class="choix-ligne"
          disabled={!conversionEditable}
          title="R-90 : le commerce est converti en totalité en or ou en science (R-88 : la Bibliothèque ajoute sa science). Action immédiate."
          onclick={toggleConversion}
        >
          Convertit le commerce en : <strong>{city.conversion === 'gold' ? 'Or' : 'Science'}</strong>
          <span class="echange">⇄</span>
        </button>
      {/if}
      <p class="ligne-douce">Trésorerie : {treasury.toLocaleString('fr-FR')} or</p>
    </section>

    <!-- Bâtiments -->
    <section class="bloc">
      <h2>Bâtiments ({city.buildings.length})</h2>
      {#if city.buildings.length > 0}
        <div class="chips">
          {#each city.buildings as b (b)}
            <span class="chip" title={BUILDINGS[b]?.effect ?? tileEffectLabel(BUILDINGS[b] ?? ({} as never))}>{BUILDINGS[b]?.name ?? b}</span>
          {/each}
        </div>
      {:else}
        <p class="ligne-douce">Aucun bâtiment.</p>
      {/if}
      {#if city.wonders.length > 0}
        <div class="chips">
          {#each city.wonders as w (w)}
            <span class="chip merveille" class:obsolete={isWonderObsolete(w, allTechs)} title="{WONDERS[w]?.effect ?? w}{isWonderObsolete(w, allTechs) ? ' — OBSOLÈTE (R-128)' : ''}">
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
        <p class="reserve">⚒ {city.pendingSalvage} marteaux en réserve — ils financeront la production (réserve permanente R-130).</p>
      {/if}
    </section>

    <!-- Choix de production — onglets (clic = AJOUT EN QUEUE, D1) -->
    {#if mine}
      <section class="bloc choix">
        <h2>Programmer la production</h2>
        <div class="onglets" role="tablist">
          <button type="button" role="tab" class:active={onglet === 'unites'} aria-selected={onglet === 'unites'} onclick={() => (onglet = 'unites')}>Unités</button>
          <button type="button" role="tab" class:active={onglet === 'batiments'} aria-selected={onglet === 'batiments'} onclick={() => (onglet = 'batiments')}>Bâtiments</button>
          <button type="button" role="tab" class:active={onglet === 'merveilles'} aria-selected={onglet === 'merveilles'} onclick={() => (onglet = 'merveilles')}>Merveilles</button>
        </div>
        <div class="options">
          {#each optionsOnglet as opt (opt.item.kind + ':' + opt.item.id)}
            <button
              type="button"
              class="opt"
              disabled={!editable || filePleine}
              title={filePleine ? `File pleine (${file.profondeur})` : `Ajouter à la file — ${opt.effect}`}
              onclick={() => ajouterALaFile(opt.item)}
            >
              <b>{opt.name} ({opt.cost})</b>
              <span class="fx">{opt.effect}</span>
              {#if opt.eta !== null}<span class="tours">· {opt.eta} tour{opt.eta > 1 ? 's' : ''}</span>{/if}
              <span class="plus">＋</span>
            </button>
          {/each}
          {#if optionsOnglet.length === 0}<p class="ligne-douce">Rien à proposer dans cet onglet.</p>{/if}
        </div>
      </section>
    {:else}
      <p class="ligne-douce">Ville ennemie — lecture seule.</p>
    {/if}
  {/if}
</aside>

<style>
  /* MENU-VILLE-QUEUE · D3 : panneau À GAUCHE (~350 px, miroir de la colonne
     de droite T2), langage AAA LOBBY-PREMIUM (or-sur-sombre, serif) — mêmes
     tokens que la barre T1, l'UnitPanel T2 et RapportCombat. */
  .panneau-ville {
    position: absolute;
    left: 0.6rem;
    top: 4.6rem;
    bottom: 0.6rem;
    width: min(350px, 92vw);
    overflow-y: auto;
    background: var(--panneau, rgba(13, 20, 32, 0.88));
    border: 1px solid var(--panneau-bord, rgba(201, 162, 39, 0.55));
    border-radius: 10px;
    /* MENU-VILLE-QUEUE (retour d'Erik) : la minimap s'efface quand le
       panneau est ouvert (Game.svelte) — le panneau reprend toute la
       hauteur, plus besoin de rembourrage anti-chevauchement. */
    padding: 0.8rem 0.9rem;
    z-index: 6;
    color: var(--texte, #e9e4d3);
    box-shadow: 0 6px 24px #000000a0;
  }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.4rem; }
  h1 { margin: 0; font-family: var(--serif-or, Georgia, serif); font-size: 1.3rem; color: var(--or-clair, #e8c96a); letter-spacing: 0.02em; }
  .sub { color: var(--texte-doux, #b6ad93); font-size: 0.78rem; }
  .fermer { padding: 0.25rem 0.6rem; border-radius: 6px; border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.25)); background: transparent; color: var(--texte-doux, #b6ad93); cursor: pointer; font-size: 0.9rem; }
  .fermer:hover { color: var(--or-clair, #e8c96a); border-color: var(--or, #c9a227); }
  h2 { margin: 0 0 0.3rem; font-family: var(--serif-or, Georgia, serif); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--or-clair, #e8c96a); }
  .bloc { border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.25)); border-radius: 8px; padding: 0.5rem 0.6rem; background: var(--rangee, rgba(16, 26, 42, 0.82)); margin-bottom: 0.5rem; }
  .separateur { border-top: 1px solid transparent; border-image: linear-gradient(90deg, transparent, var(--or, #c9a227), transparent) 1; margin: 0.15rem 0 0.55rem; }
  .grand { margin: 0.1rem 0; font-size: 1rem; font-weight: 700; display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
  .grand img { width: 16px; height: 16px; }
  .sep { color: var(--or-sombre, #8a6d1a); }
  .ligne { margin: 0.15rem 0 0; color: var(--texte-doux, #b6ad93); font-size: 0.8rem; }
  .ligne-douce { margin: 0.15rem 0 0; color: var(--texte-doux, #b6ad93); font-size: 0.78rem; }
  .alerte { margin: 0.3rem 0 0; color: #ffab91; font-weight: 600; font-size: 0.8rem; }
  .reserve { margin: 0.3rem 0 0; color: var(--or-clair, #e8c96a); font-weight: 600; font-size: 0.8rem; }

  /* File d'attente (D1) */
  .file .compte { float: right; color: var(--texte-doux, #b6ad93); font-family: system-ui, sans-serif; }
  .rangs { list-style: none; margin: 0.2rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
  .rang { display: flex; align-items: center; gap: 0.45rem; padding: 0.35rem 0.45rem; border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.25)); border-radius: 8px; background: var(--panneau, rgba(13, 20, 32, 0.88)); }
  .rang.tete { border-color: var(--or, #c9a227); }
  .rang-no { font-family: var(--serif-or, Georgia, serif); color: var(--or-clair, #e8c96a); font-weight: 700; min-width: 1.1rem; text-align: center; }
  .rang-corps { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 0.1rem; }
  .rang-nom { font-size: 0.86rem; font-weight: 600; }
  .rang-meta { color: var(--texte-doux, #b6ad93); font-size: 0.74rem; display: inline-flex; align-items: center; gap: 0.3rem; }
  .sep-dot { color: var(--or-sombre, #8a6d1a); }
  .rang-actions { display: flex; gap: 0.2rem; }
  .fleche, .croix { padding: 0.15rem 0.35rem; border-radius: 5px; border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.25)); background: transparent; color: var(--texte-doux, #b6ad93); cursor: pointer; font-size: 0.72rem; }
  .fleche:hover:not(:disabled) { color: var(--or-clair, #e8c96a); border-color: var(--or, #c9a227); }
  .croix:hover:not(:disabled) { color: #ffab91; border-color: #b3654a; }
  .fleche:disabled, .croix:disabled { opacity: 0.45; cursor: default; }

  /* Jauges / barres (concept d'Erik : compteur + avancement / total) */
  .jauge { display: flex; align-items: center; gap: 0.5rem; margin: 0.35rem 0 0.1rem; }
  .jauge .etiq { font-size: 0.78rem; color: var(--texte-doux, #b6ad93); white-space: nowrap; display: inline-flex; align-items: center; gap: 0.25rem; }
  .jauge img { width: 14px; height: 14px; }
  .barre { flex: 1 1 auto; min-width: 4rem; height: 8px; background: #0a0f18; border-radius: 4px; overflow: hidden; border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.25)); }
  .rempli { display: block; height: 100%; background: var(--or, #c9a227); }
  .rang-jauge { display: flex; align-items: center; gap: 0.4rem; }
  .rang-jauge .barre { flex: 1 1 auto; height: 6px; }
  .rang-jauge .rempli { background: var(--or-clair, #e8c96a); }
  .rempli.croissance { background: #81c784; }
  .rempli.culture { background: #ba68c8; }

  .choix-ligne { display: block; width: 100%; margin-top: 0.45rem; padding: 0.4rem 0.6rem; text-align: left; border-radius: 6px; border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.25)); background: transparent; color: var(--texte, #e9e4d3); cursor: pointer; }
  .choix-ligne:disabled { opacity: 0.55; cursor: default; }
  .choix-ligne .echange { float: right; color: var(--or-clair, #e8c96a); }
  .rush { margin-top: 0.45rem; width: 100%; padding: 0.4rem 0.7rem; border-radius: 6px; border: 1px solid var(--or, #c9a227); background: linear-gradient(180deg, rgba(201, 162, 39, 0.22), rgba(201, 162, 39, 0.1)); color: var(--or-clair, #e8c96a); font-weight: 600; cursor: pointer; }
  .rush:disabled, .rush.bloque { opacity: 0.55; cursor: default; }
  .rush .fx { font-weight: 400; color: var(--texte-doux, #b6ad93); font-size: 0.76rem; }

  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.2rem 0; }
  .chip { padding: 0.15rem 0.5rem; border-radius: 999px; border: 1px solid rgba(129, 199, 132, 0.5); background: rgba(36, 59, 43, 0.8); font-size: 0.78rem; }
  .chip.merveille { border-color: var(--or, #c9a227); background: rgba(60, 50, 34, 0.85); color: var(--or-clair, #e8c96a); }
  .chip.obsolete { opacity: 0.55; border-style: dashed; }
  .chip.gp { border-color: #7e57c2; background: #322a45; color: #d1c4e9; }

  /* Onglets constructible — clic = AJOUT EN QUEUE (D1) */
  .onglets { display: flex; gap: 0.3rem; margin: 0.3rem 0; }
  .onglets button { padding: 0.28rem 0.85rem; border-radius: 999px; border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.25)); background: transparent; color: var(--texte-doux, #b6ad93); cursor: pointer; font-size: 0.8rem; }
  .onglets button.active { border-color: var(--or, #c9a227); background: rgba(201, 162, 39, 0.14); color: var(--or-clair, #e8c96a); font-weight: 700; }
  .options { display: grid; grid-template-columns: 1fr; gap: 0.35rem; margin: 0.3rem 0; }
  .opt { position: relative; text-align: left; padding: 0.38rem 1.6rem 0.38rem 0.55rem; border-radius: 8px; border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.25)); background: var(--panneau, rgba(13, 20, 32, 0.88)); color: var(--texte, #e9e4d3); cursor: pointer; display: flex; flex-direction: column; gap: 0.08rem; }
  .opt:hover:not(:disabled) { border-color: var(--or, #c9a227); }
  .opt b { font-size: 0.84rem; }
  .opt .fx { color: var(--texte-doux, #b6ad93); font-size: 0.72rem; }
  .opt .tours { color: var(--or-clair, #e8c96a); font-size: 0.72rem; }
  .opt .plus { position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); color: var(--or-clair, #e8c96a); font-weight: 700; }
  .opt:disabled { opacity: 0.5; cursor: default; }
</style>
