/**
 * Adapter Jev (HANDOFF-JEV-POC D4/D5) — « Jev décide, le code exécute ».
 *
 * Une requête par tour (dispersion spéculative, 1 appel) portant les 4
 * questions de questions.json. Le harnais fournit TOUT l'arithmétique
 * (candidats pré-calculés dans le condensé) ; Jev tranche ; la traduction
 * en ordres est revalidée par le moteur à la résolution.
 *
 * Routage à seuil (confidence-gated, doc TypeSafe) : confidence < 0,65 →
 * repli bot complet pour CE tour. Ordre illégal → il est compté comme rejeté
 * après résolution (mesure clé du POC) ; le plan de base reste celui du bot,
 * que Jev ne fait qu'OVERRIDE par domaine (production capitale, colon,
 * attaquant) — donc un refus moteur retombe naturellement sur le plan bot.
 */
import { TERRAINS, UNIT_TYPES, canSetProduction, hexDistance } from '@game/rules';
import { condenserEtat, gainNetSite, sitesFondation, ciblesAttaque } from './condense.mjs';

const condenserGain = gainNetSite;

/** Traduit la config questions.json en questions SDK. Les specs marquées
 * `criteresDynamiques` reçoivent leurs critères depuis le condensé du tour
 * (candidats de production réels / techs réellement disponibles — les ids
 * changent chaque tour). Une question dynamique sans candidat n'est PAS
 * envoyée (critère vide = question indécidable, directive n°3). */
export function construireQuestions(config, condense = null) {
  const q = {};
  for (const [cle, spec] of Object.entries(config.questions)) {
    if (spec.criteresDynamiques) {
      const cles =
        spec.criteresDynamiques === 'candidatsProduction'
          ? (condense?.candidats?.productionCapitale ?? []).map((c) => c.cle)
          : spec.criteresDynamiques === 'techs'
            ? (condense?.empire?.recherche?.candidates ?? []).map((t) => t.id)
            : [];
      if (cles.length === 0) continue;
      const criteria = Object.fromEntries(cles.map((c) => [c, descriptionCle(spec, c, condense)]));
      q[cle] = { instructions: spec.instructions, criteria, type: 'choice' };
    } else if (spec.primitive === 'choice') {
      q[cle] = { instructions: spec.instructions, criteria: spec.criteria, type: 'choice' };
    } else if (spec.primitive === 'score') {
      q[cle] = { instructions: spec.instructions, criteria: spec.criteria, type: 'score' };
    } else {
      q[cle] = { instructions: spec.instructions, type: 'noul' };
    }
  }
  return q;
}

/** Description lisible d'un critère dynamique (littéral strict, directive n°1 :
 * pas d'arithmétique — les tours estimés sont précalculés dans le condensé). */
function descriptionCle(spec, cle, condense) {
  if (spec.criteresDynamiques === 'candidatsProduction') {
    const c = (condense?.candidats?.productionCapitale ?? []).find((x) => x.cle === cle);
    if (!c) return cle;
    const genre = c.colon ? 'un colon (fonde une ville)' : c.attaque > 0 ? 'une unité de combat' : 'un bâtiment';
    return `${genre} — coût ${c.cout} marteaux, environ ${c.toursEst} tour(s) de production`;
  }
  const t = (condense?.empire?.recherche?.candidates ?? []).find((x) => x.id === cle);
  return t ? `Technologie — coût ${t.cout} fioles` : cle;
}

function voisins(q, r) {
  return [
    [q, r - 1],
    [q - 1, r],
    [q - 1, r + 1],
    [q, r + 1],
    [q + 1, r],
    [q + 1, r - 1],
  ];
}

function cleOccupeeParAllie(etat, moi, cle) {
  for (const u of Object.values(etat.units ?? {})) {
    if (u.owner === moi && !u.aboard && `${u.q},${u.r}` === cle) return true;
  }
  return false;
}

/** Un pas vers la cible : voisin praticable qui réduit la distance (le chemin
 * multi-tours est reprogrammé chaque tour — simple et toujours légal en forme). */
export function pasVers(etat, moi, unite, cible) {
  const options = voisins(unite.q, unite.r)
    .map(([q, r]) => ({ q, r, cle: `${q},${r}`, tuile: etat.map?.[`${q},${r}`] }))
    .filter((o) => o.tuile && TERRAINS[o.tuile.terrain]?.passable)
    .filter((o) => !cleOccupeeParAllie(etat, moi, o.cle))
    .filter((o) => hexDistance(o, cible) < hexDistance(unite, cible))
    .sort((a, b) => hexDistance(a, cible) - hexDistance(b, cible));
  return options[0] ?? null;
}

/** Meilleur type d'attaquant productible (tech débloquée, hors GP). */
function meilleurAttaquantDisponible(techsUnlocked) {
  return Object.values(UNIT_TYPES)
    .filter((t) => (t.canAttack ?? false) && !t.greatPerson && (t.tech == null || techsUnlocked.includes(t.tech)))
    .sort((a, b) => b.attack - a.attack || a.cost - b.cost || a.id.localeCompare(b.id))[0] ?? null;
}

function colonProductible(techsUnlocked) {
  return Object.values(UNIT_TYPES)
    .filter((t) => t.canFoundCity && (t.tech == null || techsUnlocked.includes(t.tech)))
    .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id))[0] ?? null;
}

/** Estimation du nombre de jetons (~4 caractères/jeton — assez juste pour le budget). */
export function estimeJetons(objet) {
  return Math.ceil(JSON.stringify(objet).length / 4);
}

/**
 * Un tour de décision Jev.
 * @returns {{
 *   condense, questions, reponses, repli, plate, latenceMs, jetonsEntree,
 *   ordres: Order[],            // overrides traduits (à fusionner sur le plan bot)
 *   actions: Array,             // actions immédiates traduites
 *   attentes: Array,            // vérifications post-résolution pour compter les rejets
 *   erreur: string|null
 * }} — `memo` (dernier argument) est la mémoire inter-tours du harnais :
 *   le choix `rechercher` y est maintenu jusqu'à complétion (D2).
 */
export async function tourJev(client, config, etatFiltre, moi, memo = {}) {
  const condense = condenserEtat(etatFiltre, moi);
  const questions = construireQuestions(config, condense);
  const seuils = config.seuils;
  const sortie = {
    condense,
    questions,
    reponses: null,
    repli: false,
    plate: false,
    latenceMs: null,
    jetonsEntree: 0,
    ordres: [],
    actions: [],
    attentes: [],
    erreur: null,
  };

  const t0 = Date.now();
  let reponse;
  try {
    reponse = await client.systemOne({ state: condense, questions });
  } catch (e) {
    sortie.erreur = String(e?.message ?? e);
    sortie.repli = true;
    sortie.latenceMs = Date.now() - t0;
    return sortie;
  }
  sortie.latenceMs = Date.now() - t0;
  sortie.jetonsEntree = reponse?.usage?.input_tokens ?? estimeJetons({ state: condense, questions });
  sortie.reponses = reponse.answers;

  const ans = reponse.answers;
  const posture = ans.posture;
  const menace = ans.menace?.score ?? 0;
  const fonder = ans.fonder?.noul ?? 0;
  const attaquer = ans.attaquer?.noul ?? 0;

  // Distribution plate sur la Choice = état insuffisant (directive n°3) —
  // signal consigné au journal ; la décision reste soumise au seuil de confiance.
  const probs = Object.values(posture?.probabilities ?? {});
  if (probs.length > 1 && probs.every((p) => Math.abs(p - 1 / probs.length) < 0.02)) sortie.plate = true;

  // 1. Routage à seuil PAR DOMAINE (v2) : chaque question porte son propre
  //    seuil (produire/rechercher = confianceChoixMin ; fonder/attaquer =
  //    noulMin ; posture ne pilote plus que fortifier). La posture indécise
  //    ne jette plus les décisions de domaine confiantes — c'est le routage
  //    confidence-gated par question du doc TypeSafe. Pour une config v1
  //    (sans questions dynamiques), la posture garde son rôle de garde
  //    global du POC : confidence < seuil → repli bot intégral.
  const configV1 = !config.questions.produire;
  if (!posture || (posture.confidence ?? 0) < seuils.confianceMin) {
    sortie.repli = true;
    if (configV1) return sortie;
  }

  const moiP = etatFiltre.players?.[moi];
  const techs = moiP?.techsUnlocked ?? [];
  const mesUnites = Object.values(etatFiltre.units ?? {}).filter((u) => u.owner === moi && !u.aboard);
  const mesVilles = Object.values(etatFiltre.cities ?? {}).filter((v) => v.owner === moi);
  const capitale = mesVilles.find((v) => v.capital) ?? mesVilles[0] ?? null;

  // 2. Production de la capitale. v2 : la question `produire` (Choice parmi
  //    les candidats réels, coûts compris) tranche ; sinon repli v1 : la
  //    posture choisit colon/meilleur attaquant.
  if (capitale) {
    const produire = ans.produire;
    const confianceProduire = produire?.confidence ?? 0;
    const candidatValide =
      produire?.choice &&
      (condense.candidats.productionCapitale ?? []).some((c) => c.cle === produire.choice) &&
      confianceProduire >= (seuils.confianceChoixMin ?? seuils.confianceMin);
    if (candidatValide) {
      const [kind, id] = produire.choice.split(':');
      if (canSetProduction({ kind, id }, techs, capitale.buildings ?? [], moiP?.civId)) {
        const ordre = { type: 'SetProduction', cityId: capitale.id, item: { kind, id } };
        sortie.ordres.push(ordre);
        sortie.attentes.push({ genre: 'production', cityId: capitale.id, item: `${kind}:${id}` });
      }
    } else if (!produire && (posture.choice === 'militaire' || posture.choice === 'economique')) {
      const item =
        posture.choice === 'militaire' ? meilleurAttaquantDisponible(techs) : colonProductible(techs);
      if (item && canSetProduction({ kind: 'unit', id: item.id }, techs, capitale.buildings ?? [], moiP?.civId)) {
        const ordre = { type: 'SetProduction', cityId: capitale.id, item: { kind: 'unit', id: item.id } };
        sortie.ordres.push(ordre);
        sortie.attentes.push({ genre: 'production', cityId: capitale.id, item: `${ordre.item.kind}:${ordre.item.id}` });
      }
    }
  }

  // 3. Recherche TENUE (v2, D2) : le choix mémorisé est maintenu jusqu'à sa
  //    complétion (le harnais re-émet SetResearch chaque tour pour garder le
  //    dernier mot sur le bot, qui retire au hasard) — contrairement au bot
  //    seul, Jev ne change pas de tech en cours de route. Une NOUVELLE
  //    réponse n'est honorée que si aucune tech n'est tenue ou tenue finie.
  const techTenue = memo.techRecherche;
  const tenueIncomplete = techTenue && !techs.includes(techTenue);
  if (tenueIncomplete) {
    sortie.actions.push({ type: 'SetResearch', techId: techTenue });
    sortie.attentes.push({ genre: 'recherche', techId: techTenue, joueur: moi });
  } else {
    const chercher = ans.rechercher;
    if (
      chercher?.choice &&
      (condense.empire.recherche?.candidates ?? []).some((t) => t.id === chercher.choice) &&
      (chercher.confidence ?? 1) >= (seuils.confianceChoixMin ?? seuils.confianceMin)
    ) {
      memo.techRecherche = chercher.choice;
      sortie.actions.push({ type: 'SetResearch', techId: chercher.choice });
      sortie.attentes.push({ genre: 'recherche', techId: chercher.choice, joueur: moi });
    }
  }

  // 4. Fortifier (posture, avec sa propre garde de confiance) → toutes les
  //    unités de combat proches de nos villes.
  if (posture.choice === 'fortifier' && (posture.confidence ?? 0) >= seuils.confianceMin) {
    for (const u of mesUnites) {
      if (!(UNIT_TYPES[u.type]?.canAttack ?? false)) continue;
      const presDe = mesVilles.some((v) => hexDistance(u, v) <= 2);
      if (!presDe) continue;
      sortie.ordres.push({ type: 'Fortify', unitId: u.id });
      sortie.attentes.push({ genre: 'fortifier', unitId: u.id });
    }
  }

  // 5. Fondation (Noul ≥ seuil) → le colon vers le meilleur site candidat.
  //    v3 : tri par gainNet (rendements/tour estimés), sites à gainNet ≤ 0
  //    refusés — fonder un site non rentable n'est pas une décision.
  if (fonder >= seuils.fonderMin) {
    const colon = mesUnites.find((u) => UNIT_TYPES[u.type]?.canFoundCity);
    const echouees = memo.casesFondationEchouees ?? new Set();
    const sites = sitesFondation(etatFiltre, moi)
      .map((s) => ({ ...s, gainNet: s.gainNet ?? condenserGain(etatFiltre, moi, s) }))
      .filter((s) => s.gainNet > 0)
      .filter((s) => !echouees.has(s.case))
      .sort((a, b) => b.gainNet - a.gainNet || a.distance - b.distance);
    if (colon && sites.length > 0) {
      const site = sites[0];
      // v3.1 : la case du colon elle-même peut être liste noire (ville ennemie
      // invisible fondée sous nos pieds) — on ne re-tente JAMAIS FoundCity
      // dessus, on marche vers le site suivant.
      const caseColon = `${colon.q},${colon.r}`;
      const fondable = site.distance === 0 && !echouees.has(caseColon);
      if (fondable) {
        sortie.ordres.push({ type: 'FoundCity', unitId: colon.id });
        sortie.attentes.push({ genre: 'fondation', unitId: colon.id, case: `${colon.q},${colon.r}` });
      } else {
        const pas = pasVers(etatFiltre, moi, colon, { q: site.q, r: site.r });
        if (pas) {
          sortie.ordres.push({ type: 'Move', unitId: colon.id, path: [{ q: pas.q, r: pas.r }] });
          sortie.attentes.push({ genre: 'mouvement', unitId: colon.id, attendu: pas.cle });
        }
      }
    }
  }

  // 6. Attaque (Noul ≥ seuil ET menace ≥ seuil) → meilleure unité vers cible 0.
  if (attaquer >= seuils.attaquerMin && menace >= seuils.menaceMin) {
    const cibles = ciblesAttaque(etatFiltre, moi);
    const attaquant = mesUnites
      .filter(
        (u) =>
          (UNIT_TYPES[u.type]?.canAttack ?? false) &&
          !sortie.ordres.some((o) => o.unitId === u.id),
      )
      .sort(
        (a, b) =>
          (UNIT_TYPES[b.type]?.attack ?? 0) * b.hp - (UNIT_TYPES[a.type]?.attack ?? 0) * a.hp || a.id.localeCompare(b.id),
      )[0];
    if (attaquant && cibles.length > 0) {
      const cible = { q: cibles[0].q, r: cibles[0].r };
      if (hexDistance(attaquant, cible) === 1) {
        sortie.ordres.push({ type: 'Attack', unitId: attaquant.id, target: cible });
        sortie.attentes.push({ genre: 'attaque', unitId: attaquant.id, cible: cibles[0].case });
      } else {
        const pas = pasVers(etatFiltre, moi, attaquant, cible);
        if (pas) {
          sortie.ordres.push({ type: 'Move', unitId: attaquant.id, path: [{ q: pas.q, r: pas.r }] });
          sortie.attentes.push({ genre: 'mouvement', unitId: attaquant.id, attendu: pas.cle });
        }
      }
    }
  }

  // Repli (métrique journal) : AUCUN domaine n'a été traduit cette tour.
  sortie.repli = sortie.ordres.length === 0 && sortie.actions.length === 0;

  return sortie;
}

/** Fusionne les overrides Jev sur le plan bot : un ordre Jev REMPLACE TOUS les
 * ordres bot de même sujet (le bot peut émettre deux SetProduction pour la
 * même ville — le dernier gagne côté moteur) ; les autres ordres bot sont
 * conservés. */
export function fusionnerPlan(ordresBot, ordresJev, actionsBot, actionsJev) {
  let ordres = [...ordresBot];
  for (const o of ordresJev) {
    const sujet = o.unitId ?? o.cityId;
    ordres = ordres.filter((b) => (b.unitId ?? b.cityId) !== sujet);
    ordres.push(o);
  }
  const actions = [...actionsBot];
  for (const a of actionsJev) {
    const idx = actions.findIndex((b) => b.type === a.type);
    if (idx >= 0) actions[idx] = a;
    else actions.push(a);
  }
  return { ordres, actions };
}
