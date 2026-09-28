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
import { TERRAINS, UNIT_TYPES, TECHS, canSetProduction, hexDistance } from '@game/rules';
import { condenserEtat, sitesFondation, ciblesAttaque } from './condense.mjs';

/** Traduit la config questions.json en questions SDK. */
export function construireQuestions(config) {
  const q = {};
  for (const [cle, spec] of Object.entries(config.questions)) {
    if (spec.primitive === 'choice') {
      q[cle] = { instructions: spec.instructions, criteria: spec.criteria, type: 'choice' };
    } else if (spec.primitive === 'score') {
      q[cle] = { instructions: spec.instructions, criteria: spec.criteria, type: 'score' };
    } else {
      q[cle] = { instructions: spec.instructions, type: 'noul' };
    }
  }
  return q;
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
 * }}
 */
export async function tourJev(client, config, etatFiltre, moi) {
  const condense = condenserEtat(etatFiltre, moi);
  const questions = construireQuestions(config);
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

  // 1. Garde de confiance globale → repli bot complet (doc : < 0,65).
  if (!posture || (posture.confidence ?? 0) < seuils.confianceMin) {
    sortie.repli = true;
    return sortie;
  }

  const moiP = etatFiltre.players?.[moi];
  const techs = moiP?.techsUnlocked ?? [];
  const mesUnites = Object.values(etatFiltre.units ?? {}).filter((u) => u.owner === moi && !u.aboard);
  const mesVilles = Object.values(etatFiltre.cities ?? {}).filter((v) => v.owner === moi);
  const capitale = mesVilles.find((v) => v.capital) ?? mesVilles[0] ?? null;

  // 2. Posture → production de la capitale (candidats validés par canSetProduction).
  if (capitale && (posture.choice === 'militaire' || posture.choice === 'economique')) {
    const item =
      posture.choice === 'militaire' ? meilleurAttaquantDisponible(techs) : colonProductible(techs);
    if (item && canSetProduction({ kind: 'unit', id: item.id }, techs, capitale.buildings ?? [], moiP?.civId)) {
      const ordre = { type: 'SetProduction', cityId: capitale.id, item: { kind: 'unit', id: item.id } };
      sortie.ordres.push(ordre);
      sortie.attentes.push({ genre: 'production', cityId: capitale.id, item: `${ordre.item.kind}:${ordre.item.id}` });
    }
  }

  // 3. Tech → recherche de la tech disponible la moins chère (action immédiate).
  if (posture.choice === 'tech') {
    const dispo = Object.values(TECHS)
      .filter((t) => !(moiP?.techsUnlocked ?? []).includes(t.id) && (t.prereqs ?? []).every((p) => (moiP?.techsUnlocked ?? []).includes(p)))
      .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id))[0];
    if (dispo) {
      sortie.actions.push({ type: 'SetResearch', techId: dispo.id });
      sortie.attentes.push({ genre: 'recherche', techId: dispo.id, joueur: moi });
    }
  }

  // 4. Fortifier → toutes les unités de combat proches de nos villes.
  if (posture.choice === 'fortifier') {
    for (const u of mesUnites) {
      if (!(UNIT_TYPES[u.type]?.canAttack ?? false)) continue;
      const presDe = mesVilles.some((v) => hexDistance(u, v) <= 2);
      if (!presDe) continue;
      sortie.ordres.push({ type: 'Fortify', unitId: u.id });
      sortie.attentes.push({ genre: 'fortifier', unitId: u.id });
    }
  }

  // 5. Fondation (Noul ≥ seuil) → le colon vers le meilleur site candidat.
  if (fonder >= seuils.fonderMin) {
    const colon = mesUnites.find((u) => UNIT_TYPES[u.type]?.canFoundCity);
    const sites = sitesFondation(etatFiltre, moi);
    if (colon && sites.length > 0) {
      const site = sites[0];
      if (site.distance === 0) {
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
