/**
 * ZII-V1 (Erik 29/10) — Zii, la bouche de Jev : salutations (D2), dialogue
 * naturel (D1), paquet léger à LISTE BLANCHE (D3 — test négatif : aucune
 * donnée interdite), réponse structurée valide/invalide → repli (D4), relais
 * resumePourJev (D5), budget/hygiène (D6). AUCUN appel LLM réel : FAUX client.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessageData } from '@game/shared';
import { CIVILIZATIONS, createRng, getFilteredState, makeState, sociabiliteDe } from '@game/rules';
import configZiiJson from '../src/zii/zii.json';
import type { ConfigZii } from '../src/zii/zii.js';
import {
  candidatsDe,
  composerResume,
  decoderReponseZii,
  intentionDe,
  paquetZii,
  probabiliteSalutation,
  questionsZii,
  substituer,
  tirerSalutation,
  voitConversation,
} from '../src/zii/zii.js';
import {
  repondreZii,
  salutationDebutZii,
  salutationRencontreZii,
  slotsRencontre,
  type ClientZii,
} from '../src/zii/orchestre.js';
import {
  MAX_ECHECS_CONSECUTIFS,
  avecEntreeJournal,
  enregistrerAppelZii,
  ziiActif,
  ziiEtatInitial,
} from '../src/zii/etat.js';
import { condenseJoueur } from '../src/jev/joueur.js';
import { SELF } from 'cloudflare:test';
import { adminDump, createGame, makeToken, openGameSocket } from './helpers.js';

vi.setConfig({ testTimeout: 180_000 });

const configZii = configZiiJson as unknown as ConfigZii;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEtat = any;

/** FAUX LLM (L1) : répond le PREMIER label de chaque criteria — zéro réseau. */
function fauxClientZii(opts: { planter?: boolean; invalide?: boolean } = {}): ClientZii & { appels: number } {
  let appels = 0;
  return {
    get appels() {
      return appels;
    },
    async systemOne({ questions }: { state: unknown; questions: AnyEtat }) {
      appels += 1;
      if (opts.planter) throw new Error('panne réseau simulée');
      const answers: AnyEtat = {};
      for (const [nom, q] of Object.entries(questions as AnyEtat)) {
        const labels = Object.keys((q as AnyEtat).criteria ?? {});
        answers[nom] = {
          type: 'choice',
          choice: opts.invalide && nom === 'ton' ? 'ton-inexistant' : labels[0],
          confidence: 0.9,
          probabilities: Object.fromEntries(labels.map((l, i) => [l, i === 0 ? 1 : 0])),
        };
      }
      return { answers, usage: { input_tokens: 1000, output_tokens: 10 } };
    },
  };
}

/** État complet JOUET (fixtures moteur — carte prairie 8×8) avec des DONNÉES
 *  INTERDITES plantées (le paquet ne doit JAMAIS les porter, D3). */
function etatJouet(): AnyEtat {
  const etat = makeState({
    players: ['p1', 'p2'],
    units: [
      { id: 'u1', type: 'guerrier', owner: 'p1', q: 3, r: 3 },
      { id: 'u2', type: 'colon', owner: 'p2', q: 0, r: 0 },
    ],
    cities: [
      { id: 'c1', owner: 'p1', capital: true, q: 4, r: 4 },
      { id: 'c2', owner: 'p2', capital: true, q: 0, r: 0 },
    ],
  });
  etat.players.p1!.civId = 'zoulous';
  etat.players.p1!.treasury = 999;
  etat.players.p1!.techsUnlocked = ['poterie', 'ecriture'];
  etat.players.p2!.civId = 'inde';
  etat.players.p2!.treasury = 555;
  etat.players.p2!.techsUnlocked = ['poterie'];
  etat.turn = 12;
  return etat;
}

/** État filtré (fog p2) — la forme consommée par le paquet (miroir orchestre). */
function etatFiltreJouet(): AnyEtat {
  return getFilteredState(etatJouet(), 'p2');
}

// ---------------------------------------------------------------------------
// Données — sociabilité (D2)
// ---------------------------------------------------------------------------

describe('ZII-V1 · sociabilité (D2)', () => {
  it('chaque civ porte un trait sociabilite 0-1 (défaut 0,5)', () => {
    for (const civ of Object.values(CIVILIZATIONS.civs)) {
      expect(civ.sociabilite).toBeGreaterThanOrEqual(0);
      expect(civ.sociabilite).toBeLessThanOrEqual(1);
    }
    expect(CIVILIZATIONS.params.sociabiliteDefaut).toBe(0.5);
    expect(sociabiliteDe(undefined)).toBe(0.5);
    expect(sociabiliteDe('civ-inconnue')).toBe(0.5);
    // propositions Erik : Zoulous chaleureux, Inde réservée
    expect(CIVILIZATIONS.civs.zoulous!.sociabilite).toBeGreaterThan(CIVILIZATIONS.civs.inde!.sociabilite);
  });

  it('probabilité de salutation : sociabilité × joueurs (bornée 0-1)', () => {
    expect(probabiliteSalutation(0.5, 2)).toBe(0.5);
    expect(probabiliteSalutation(0.5, 3)).toBeCloseTo(0.6);
    expect(probabiliteSalutation(1, 5)).toBe(1); // bornée
    expect(probabiliteSalutation(-1, 2)).toBe(0);
  });

  it('tirage seedé : même graine → même décision (idempotence)', () => {
    const r1 = tirerSalutation(createRng(42).next, 0.5);
    const r2 = tirerSalutation(createRng(42).next, 0.5);
    expect(r1).toBe(r2);
  });

  it('salutation de début : UNE SEULE FOIS par partie (marqueur)', () => {
    const etat = ziiEtatInitial();
    const a = salutationDebutZii(configZii, etat, 7, 'zoulous', 2);
    const b = salutationDebutZii(configZii, etat, 7, 'zoulous', 2);
    expect(etat.salutationDebutFaite).toBe(true);
    if (a.envoyee) {
      expect(b.envoyee).toBe(false);
      expect(b.message).toBeNull();
      expect(a.message!.length).toBeGreaterThan(0);
    }
  });

  it('salutation de rencontre : UNE SEULE FOIS par adversaire', () => {
    const etat = ziiEtatInitial();
    const slots = { moiCiv: 'Inde', moiDirigeant: 'Gandhi', toiCiv: 'Zoulous', toiDirigeant: 'Shaka' };
    const a = salutationRencontreZii(configZii, etat, 7, 'p1', slots);
    const b = salutationRencontreZii(configZii, etat, 7, 'p1', slots);
    const c = salutationRencontreZii(configZii, etat, 7, 'p3', slots);
    expect(a.envoyee).toBe(true);
    expect(b.envoyee).toBe(false);
    expect(c.envoyee).toBe(true);
    expect(etat.salutationsRencontre).toEqual(['p1', 'p3']);
  });

  it('même seed → même énoncé de rencontre (déterminisme)', () => {
    const slots = { moiCiv: 'Inde', moiDirigeant: 'Gandhi', toiCiv: 'Zoulous', toiDirigeant: 'Shaka' };
    const m1 = salutationRencontreZii(configZii, ziiEtatInitial(), 99, 'p1', slots).message;
    const m2 = salutationRencontreZii(configZii, ziiEtatInitial(), 99, 'p1', slots).message;
    const m3 = salutationRencontreZii(configZii, ziiEtatInitial(), 100, 'p1', slots).message;
    expect(m1).toBe(m2);
    expect(m1).toBeTruthy();
    expect(m3).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Noyau pur — intention, candidats, paquet liste blanche (D3/D4)
// ---------------------------------------------------------------------------

describe('ZII-V1 · noyau pur', () => {
  it('intention du message (classification déterministe, priorités stables)', () => {
    expect(intentionDe('Bonjour, enchanté !', configZii)).toBe('salutation');
    expect(intentionDe('Cessons cette guerre, faisons la paix.', configZii)).toBe('demandePaix');
    expect(intentionDe('Je vais détruire ta capitale.', configZii)).toBe('menace');
    expect(intentionDe('Je propose un échange de technologie.', configZii)).toBe('offre');
    expect(intentionDe('Combien de villes as-tu ?', configZii)).toBe('question');
    expect(intentionDe('hm hm', configZii)).toBe('autre');
  });

  it('candidats : slots substitués, repli « autre » présent', () => {
    const slots = { moiCiv: 'Inde', moiDirigeant: 'Gandhi', toiCiv: 'Zoulous', toiDirigeant: 'Shaka' };
    const rep = candidatsDe(configZii, 'salutation', slots);
    expect(rep.length).toBeGreaterThan(0);
    for (const c of rep) {
      expect(c).not.toContain('{moiCiv}');
      expect(c).not.toContain('{toiDirigeant}');
    }
    expect(candidatsDe(configZii, 'salutationRencontre', slots)[0]).toContain('Shaka');
    expect(candidatsDe(configZii, 'genre-inconnu').length).toBeGreaterThan(0); // repli autre
  });

  it('substituer : les 4 slots', () => {
    const slots = { moiCiv: 'A', moiDirigeant: 'B', toiCiv: 'C', toiDirigeant: 'D' };
    expect(substituer('{moiCiv} {moiDirigeant} {toiCiv} {toiDirigeant}', slots)).toBe('A B C D');
  });

  it('D3 — PAQUET À LISTE BLANCHE : aucune donnée interdite (test négatif)', () => {
    const etat = etatFiltreJouet();
    const hist: ChatMessageData[] = [
      { partie: 'ABC123', tour: 10, auteur: 'p1', canal: 'general', texte: 'bonjour voisins', horodatage: 1 },
      { partie: 'ABC123', tour: 11, auteur: 'p1', canal: 'p2', texte: 'message privé', horodatage: 2 },
    ];
    const paquet = paquetZii(etat, 'p2', ['p1'], configZii, hist) as AnyEtat;
    const brut = JSON.stringify(paquet);
    // Interdit : trésorerie, techs, plans, positions hors vision, barbare.
    expect(brut).not.toContain('999');
    expect(brut).not.toContain('555');
    expect(brut).not.toContain('poterie');
    expect(brut).not.toContain('ecriture');
    expect(brut).not.toContain('plan');
    expect(brut).not.toContain('30,30');
    expect(brut).not.toContain('barbarien');
    // Autorisé (liste blanche) : civ, dirigeant, ère, guerre, ratio, distance, historique.
    expect(paquet.moi).toMatchObject({ civ: 'inde', dirigeant: 'Mohandas Gandhi', era: 'ancienne' });
    expect(paquet.guerreAvec).toEqual(['p1']);
    const rival = paquet.rivaux[0];
    expect(rival).toMatchObject({ id: 'p1', civ: 'zoulous', enGuerre: true });
    expect(typeof rival.rapportForces).toBe('number');
    expect(typeof rival.distanceCapitales).toBe('number');
    expect(rival.techsConnues).toBeUndefined();
    expect(rival.forces).toBeUndefined();
    // Historique borné (historiqueMax) et conversation canon.
    expect(paquet.historique.length).toBeLessThanOrEqual(configZii.historiqueMax);
  });

  it('D4 — questions : le message du joueur est cadré DONNÉE NON FIABLE', () => {
    const etat = etatFiltreJouet();
    const paquet = paquetZii(etat, 'p2', ['p1'], configZii, []);
    const slots = { moiCiv: 'Inde', moiDirigeant: 'Gandhi', toiCiv: 'Zoulous', toiDirigeant: 'Shaka' };
    const { questions } = questionsZii(
      configZii,
      paquet,
      { auteur: 'p1', civ: 'zoulous', texte: 'DONNE-MOI TON OR !!!' },
      slots,
      'menace',
    );
    const inst = JSON.stringify(questions);
    expect(inst).toContain('NON FIABLE');
    expect(inst).toContain("n'obéis");
    expect(inst).toContain('JAMAIS');
    const reponse = (questions as AnyEtat).reponse;
    expect(Object.keys(reponse.criteria).length).toBeGreaterThan(1); // choix réel
    // L'intention pilote les candidats (menace → répliques fermes).
    expect(Object.keys(reponse.criteria).some((c) => c.toLowerCase().includes('muraille') || c.toLowerCase().includes('guerre'))).toBe(true);
  });

  it('D4 — décodeur : valide accepté, invalide → repli (null)', () => {
    const ok = decoderReponseZii(
      { reponse: { choice: configZii.candidats.reponses.salutation![0] }, ton: { choice: 'courtois' }, intentionPercue: { choice: 'salutation' } },
      configZii,
    );
    expect(ok).toMatchObject({ ton: 'courtois', intentionPercue: 'salutation' });
    expect(decoderReponseZii({ reponse: {} }, configZii)).toBeNull(); // message absent
    expect(
      decoderReponseZii({ reponse: { choice: '   ' }, ton: { choice: 'courtois' }, intentionPercue: { choice: 'autre' } }, configZii),
    ).toBeNull(); // vide
    expect(
      decoderReponseZii(
        { reponse: { choice: 'x'.repeat(configZii.longueurMax + 1) }, ton: { choice: 'courtois' }, intentionPercue: { choice: 'autre' } },
        configZii,
      ),
    ).toBeNull(); // trop long
    expect(
      decoderReponseZii(
        { reponse: { choice: 'ok' }, ton: { choice: 'criard' }, intentionPercue: { choice: 'autre' } },
        configZii,
      ),
    ).toBeNull(); // ton hors ensemble
    expect(decoderReponseZii(null, configZii)).toBeNull();
  });

  it('D4/D5 — composerResume : factuel, tronqué, sans invention', () => {
    const long = 'a'.repeat(200);
    const r = composerResume({ auteur: 'p1', civ: 'zoulous', texte: long, tour: 4 }, 'menace');
    expect(r).toContain('p1');
    expect(r).toContain('zoulous');
    expect(r).toContain('menace');
    expect(r).toContain('…'); // texte tronqué
    expect(r.length).toBeLessThan(220);
  });

  it('conversation visible par Jev (miroir voitCanal)', () => {
    const m = (canal: string, auteur: string) =>
      ({ canal, auteur } as unknown as ChatMessageData);
    expect(voitConversation(m('general', 'p1'), 'p2', ['p1'])).toBe(true);
    expect(voitConversation(m('p2', 'p1'), 'p2', ['p1'])).toBe(true); // adressé à Jev
    expect(voitConversation(m('p2', 'p2'), 'p2', ['p1'])).toBe(true);
    expect(voitConversation(m('p3', 'p1'), 'p2', [])).toBe(false); // tiers
  });
});

// ---------------------------------------------------------------------------
// État Zii — budget, échecs, journal (D6)
// ---------------------------------------------------------------------------

describe('ZII-V1 · état Zii (D6)', () => {
  it('budget : plafond data-driven → désactivation ; 3 échecs → désactivation', () => {
    const plafond = configZii.budgetPlafondUsd;
    const etat = ziiEtatInitial();
    expect(ziiActif(etat, plafond)).toBe(true);
    // 1000 jetons ≈ 0,000042 $ — il faut ~1190 appels pour percer 0,05 $.
    for (let i = 0; i < 2000; i++) enregistrerAppelZii(etat, true, 1000, plafond);
    expect(etat.desactive).toBe('budget');
    expect(ziiActif(etat, plafond)).toBe(false);
    const e2 = ziiEtatInitial();
    for (let i = 0; i < MAX_ECHECS_CONSECUTIFS - 1; i++) enregistrerAppelZii(e2, false, 0, plafond);
    expect(ziiActif(e2, plafond)).toBe(true);
    enregistrerAppelZii(e2, false, 0, plafond);
    expect(e2.desactive).toBe('echecs');
    expect(ziiActif(e2, plafond)).toBe(false);
  });

  it('journal plafonné (les plus anciens tombent)', () => {
    const etat = ziiEtatInitial();
    for (let i = 0; i < 60; i++) {
      avecEntreeJournal(etat, {
        tour: i,
        auteur: 'p1',
        canal: 'general',
        texteRecu: 'x',
        message: null,
        ton: null,
        intentionPercue: null,
        resume: null,
        repli: true,
        latenceMs: null,
        jetonsEntree: 0,
        erreur: null,
        budgetApresUsd: 0,
      });
    }
    expect(etat.journal.length).toBeLessThanOrEqual(50);
    expect(etat.journal[0]!.tour).toBeGreaterThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// Orchestre — réponse Zii avec FAUX LLM (D1/D4/D5)
// ---------------------------------------------------------------------------

describe('ZII-V1 · repondreZii (FAUX LLM)', () => {
  const BASE = {
    config: configZii,
    game: etatJouet() as AnyEtat,
    partie: 'ABC123',
    seed: 42,
    seat: 'p2' as AnyEtat,
    rencontres: ['p1'],
    etat: ziiEtatInitial(),
    auteur: 'p1',
    canal: 'p2',
    texte: 'Bonjour, voisin !',
    historique: [] as ChatMessageData[],
  };

  it('chemin nominal : réplique canon + resumePourJev poussé (D5)', async () => {
    const etat = ziiEtatInitial();
    const client = fauxClientZii();
    const r = await repondreZii({ ...BASE, etat, client });
    expect(r.repli).toBe(false);
    expect(r.message).toMatchObject({ auteur: 'p2', canal: 'p2', partie: 'ABC123' });
    expect(r.message!.texte.length).toBeGreaterThan(0);
    expect(r.ton).toBeTruthy();
    expect(client.appels).toBe(1);
    expect(etat.resumesPourJev).toHaveLength(1);
    expect(etat.resumesPourJev[0]!).toMatchObject({ tour: 12, de: 'p1' });
    expect(etat.resumesPourJev[0]!.resume).toContain('p1');
    expect(etat.journal).toHaveLength(1);
    expect(etat.journal[0]!.repli).toBe(false);
    expect(etat.journal[0]!.budgetApresUsd).toBeGreaterThan(0);
  });

  it('réponse invalide → repli SILENCIEUX, échec compté, journal consigné (D4)', async () => {
    const etat = ziiEtatInitial();
    const client = fauxClientZii({ invalide: true });
    const r = await repondreZii({ ...BASE, etat, client });
    expect(r.message).toBeNull();
    expect(r.repli).toBe(true);
    expect(r.erreur).toContain('invalide');
    expect(etat.resumesPourJev).toHaveLength(0);
    expect(etat.echecsConsecutifs).toBe(1);
    expect(etat.journal[0]!.repli).toBe(true);
  });

  it('erreur API → repli SILENCIEUX, 3 échecs désactivent Zii (D4/D6)', async () => {
    const etat = ziiEtatInitial();
    const client = fauxClientZii({ planter: true });
    for (let i = 0; i < 3; i++) await repondreZii({ ...BASE, etat, client });
    expect(etat.desactive).toBe('echecs');
    expect(etat.resumesPourJev).toHaveLength(0);
    // Zii désactivée : plus AUCUN appel (même avec un client sain).
    const sain = fauxClientZii();
    const r = await repondreZii({ ...BASE, etat, client: sain });
    expect(r.repli).toBe(true);
    expect(sain.appels).toBe(0);
  });

  it('client null (clé absente) → repli silencieux total', async () => {
    const etat = ziiEtatInitial();
    const r = await repondreZii({ ...BASE, etat, client: null });
    expect(r).toMatchObject({ message: null, repli: true, jetonsEntree: 0 });
    expect(etat.journal).toHaveLength(0);
  });

  it('slotsRencontre : civs + dirigeants canon des données', () => {
    const slots = slotsRencontre(etatFiltreJouet(), 'p2' as AnyEtat, 'p1');
    expect(slots).toEqual({ moiCiv: 'Inde', moiDirigeant: 'Mohandas Gandhi', toiCiv: 'Zoulous', toiDirigeant: 'Shaka Zulu' });
  });
});

// ---------------------------------------------------------------------------
// Relais D5 — le condensé de Jev porte chatsPourJev (et reste bit-à-bit sinon)
// ---------------------------------------------------------------------------

describe('ZII-V1 · relais resumePourJev (D5)', () => {
  it('memo sans resumes → condensé INCHANGÉ (bit-à-bit jev-port)', () => {
    const condense = condenseJoueur(etatFiltreJouet(), 'p2', {});
    expect(condense.chatsPourJev).toBeUndefined();
  });

  it('memo avec resumes → condense.chatsPourJev = les résumés', () => {
    const resumes = [{ tour: 3, de: 'p1', resume: 'Message de p1 (zoulous) — intention perçue : menace.' }];
    const condense = condenseJoueur(etatFiltreJouet(), 'p2', { resumesPourJev: resumes });
    expect(condense.chatsPourJev).toEqual(resumes);
  });
});

// ---------------------------------------------------------------------------
// e2e — partie Jev SANS clé : repli gracieux, ziiEtat persisté, aucun crash
// ---------------------------------------------------------------------------

describe('ZII-V1 · e2e sans clé (repli gracieux)', () => {
  it('ChatSend au siège Jev sans TYPESAFE_API_KEY : aucun crash, ziiEtat persisté, Zii muette', async () => {
    const code = await createGame(
      { id: 'dev:zii-host', name: 'ZiiHost' },
      { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2, adversaireJev: true },
    );
    const token = await makeToken('dev:zii-host', 'ZiiHost');
    const ws = await openGameSocket(code, token);
    await ws.waitFor('Snapshot');
    const dump0 = await adminDump(code);
    const seatJev = dump0.meta!.players.find((p) => p.jev === true)?.engineId ?? 'p2';
    // Le joueur écrit à Zii (canal Général — le canal individuel exige la
    // rencontre, fait de fog R-73).
    ws.send({ type: 'ChatSend', canal: 'general', texte: 'Bonjour Jev, que vaut ton armée ?' });
    await ws.waitFor('ChatMessage'); // le message du joueur est livré (canon)
    // Aucune clé → aucun écho de Zii : l'historique ne porte QUE le message du joueur.
    ws.send({ type: 'ChatHistory' });
    const hist = await ws.waitFor('ChatHistory');
    expect(hist.type).toBe('ChatHistory');
    if (hist.type === 'ChatHistory') {
      // Zii peut avoir SALUÉ à l'activation (D2a — déterministe, sans clé),
      // mais ne RÉPOND jamais sans clé : au plus 1 message d'initiative.
      expect(hist.messages.filter((m) => m.auteur === seatJev).length).toBeLessThanOrEqual(1);
    }
    // ziiEtat persisté (créé au premier échange — repli gracieux).
    const dump = await adminDump(code);
    expect(dump.zii).toBeTruthy();
    expect(dump.zii!.desactive).toBe('non');
    ws.close();
  });

  it('la salutation de début (déterministe, sans LLM) est un message canon du siège Jev', async () => {
    // Indépendant du tirage : on vérifie que TOUT message d'auteur = siège Jev
    // dans le chatLog est bien formé (partie, canal, horodatage) — canon CHAT-SOCLE.
    const code = await createGame(
      { id: 'dev:zii-host2', name: 'ZiiHost2' },
      { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2, adversaireJev: true },
    );
    const dump = await adminDump(code);
    const seatJev = dump.meta!.players.find((p) => p.jev === true)?.engineId ?? 'p2';
    const ziiMsgs = (dump.chat?.log ?? []).filter((m: AnyEtat) => m.auteur === seatJev);
    for (const m of ziiMsgs) {
      expect(m.partie).toBe(code);
      expect(['general', seatJev]).toContain(m.canal);
      expect(typeof m.horodatage).toBe('number');
    }
  });
});
