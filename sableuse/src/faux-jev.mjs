/**
 * FAUX client Jev local, déterministe, zéro appel réseau (HANDOFF-JEV-POC D8).
 * Sert au développement du sérialiseur et aux tests : même interface que le
 * SDK (`systemOne({state, questions})`), réponses plausibles dérivées du hash
 * de l'état transmis — rejouable seed par seed, ne consomme JAMAIS le budget.
 */

function fnv1a(chaine) {
  let h = 0x811c9dc5;
  for (let i = 0; i < chaine.length; i++) {
    h ^= chaine.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function creerFauxJev({ graine = 42 } = {}) {
  return {
    /** Compteur d'appels (les tests vérifient le zéro appel réseau à part). */
    appels: 0,
    async systemOne({ state, questions }) {
      this.appels += 1;
      const rng = mulberry32(fnv1a(JSON.stringify(state)) ^ graine);
      const answers = {};
      // Menace : détectée naïvement dans le condensé (les réponses « plausibles »
      // suffisent — ce client sert à tester le harnais, pas la stratégie).
      const menaces = Array.isArray(state?.menaces) ? state.menaces : [];
      const menaceNiveau = menaces.length === 0 ? 0 : Math.min(3, menaces[0]?.distanceVilleLaPlusProche ?? 3);
      const attaquantsAmis = (state?.empire?.unites ?? []).length;
      for (const [cle, q] of Object.entries(questions ?? {})) {
        if (q.type === 'choice') {
          const cles = Object.keys(q.criteria);
          let choix;
          if (cles.includes('economique') || cles.includes('militaire')) {
            // posture : choix plausible selon la menace détectée
            choix = menaceNiveau >= 2 && cles.includes('militaire') ? 'militaire' : cles.includes('economique') ? 'economique' : cles[0];
          } else if (cles.some((c) => c.startsWith('unit:') || c.startsWith('building:'))) {
            // produire : colon si dispo sinon premier item, unité de combat si menace
            const combat = cles.find((c) => c.startsWith('unit:') && menaceNiveau >= 2);
            choix = combat ?? cles.find((c) => c.includes('colon')) ?? cles[0];
          } else if (q.criteria && Object.values(q.criteria).some((d) => typeof d === 'string' && d.startsWith('Technologie'))) {
            // rechercher : la moins chère (première — les candidates sont pré-triées)
            choix = cles[0];
          } else {
            choix = cles[Math.floor(rng() * cles.length)];
          }
          const confiance = 0.7 + rng() * 0.25;
          const probabilities = Object.fromEntries(cles.map((c) => [c, c === choix ? confiance : ((1 - confiance) / Math.max(1, cles.length - 1))]));
          answers[cle] = { type: 'choice', choice: choix, confidence: confiance, probabilities };
        } else if (q.type === 'score') {
          const n = q.criteria.length - 1;
          const score = Math.min(n, menaceNiveau);
          answers[cle] = {
            type: 'score',
            score,
            confidence: 0.75,
            legend: Object.fromEntries(q.criteria.map((c, i) => [String(i), c])),
            probabilities: Object.fromEntries(q.criteria.map((_, i) => [String(i), i === score ? 0.7 : 0.3 / Math.max(1, n)])),
          };
        } else {
          // Noul : fonder s'il y a des candidats et au moins une ville ; attaquer si menace forte.
          const reponse =
            cle === 'fonder'
              ? (state?.candidats?.fondation?.length ?? 0) > 0 && attaquantsAmis > 0
                ? 0.75 + rng() * 0.2
                : 0.3 + rng() * 0.2
              : menaceNiveau >= 2 && (state?.candidats?.attaque?.length ?? 0) > 0
                ? 0.85
                : 0.3 + rng() * 0.2;
          answers[cle] = { type: 'noul', noul: Number(reponse.toFixed(2)) };
        }
      }
      return { model: 'faux-jev', answers, usage: { input_tokens: Math.ceil(JSON.stringify({ state, questions }).length / 4) } };
    },
  };
}
