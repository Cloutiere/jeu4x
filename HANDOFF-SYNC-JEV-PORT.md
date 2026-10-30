# HANDOFF-SYNC-JEV-PORT — Resynchroniser la copie serveur du harnais v4 (déployer les deux missions bloquées)

**Contexte Erik 29/10.** Deux missions parallèles se sont entrelacées : JEV-CONTACT-GUERRE (sableuse, `42246c5`) a fait évoluer le harnais en v4 (`delaiGuerreApresRencontre`, `rencontreTour`, `provocations`), CHAT-SOCLE (serveur, `17c467b`) a porté la copie v3. Les **4 tests croisés** de `apps/server/tests-jev/jev-port.test.ts` échouent en CI sur les deux Deploys (copie questions ≠ harnais ; condensé diplomatie ≠ harnais). Les contenus des deux missions sont BONS — seule la jonction est désynchronisée. **Rien n'est en prod depuis `a8920ef`.**

## 1. Préalables

- Lire `apps/server/tests-jev/jev-port.test.ts` (les 4 échecs CI : copie questions-joueur.json, condensé bloc diplomatie, construireQuestionsJoueur, avec memo), la source de vérité `sableuse/questions-joueur.json` (v4) et `sableuse/src/condense.mjs` (rencontreTour/provocations), `REPORT-JEV-CONTACT-GUERRE.md` (la sémantique v4 : rencontre par vision fog, délai 10 tours, arc).
- ⚠ **Leçon de cette collision** (à consigner au rapport) : deux sessions parallèles sur des territoires joints par des tests croisés doivent REJOUER la suite serveur COMPLÈTE (jev-port compris) avant tout push.

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — La v4 est la vérité** : la copie serveur (`questions-joueur.json` + fixtures de condensé + tout ce que les tests croisés mirent) est alignée sur le harnais v4 EXACT — pas l'inverse, aucune retouche de sémantique (rencontre/délai/arc intouchés).
- **D2 — Vérification croisée inchangée** : les tests croisés restent ce qu'ils sont (leur rôle de garde est validé par cet incident — les renforcer si trivial, sinon intacts).

## 3. Mission

- **L1** : synchroniser la copie serveur sur v4 (les 4 tests au vert en local).
- **L2** : rejouer COMPLÈTES les suites server ET sableuse (les deux paquets), typecheck 4/4.
- **L3 — commit + push** (un seul commit de sync), vérifier Deploy VERT et prod à jour (hash de bundle), mini-rapport `REPORT-SYNC-JEV-PORT.md` (leçon d'entrelacement consignée).

## 4. Critères d'acceptation

Deploy vert sur `main`, prod contenant CHAT-SOCLE et le port v4 (les deux missions finally déployées), suites complètes vertes.

## 5. Périmètre interdit

Toute sémantique v4 ou chat ; tout calibrage ; `schemaVersion`.

## 6. Fin de session

Mini-rapport, arrêt, remise de la main.
