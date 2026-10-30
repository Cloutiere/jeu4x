# REPORT-OFFICIALISATION — Du dialogue Zii aux accords formels

**Mission** : HANDOFF-OFFICIALISATION (Erik 30/10) — brancher le dialogue Zii sur la modale de négociation T2, sans toucher au moteur. État de départ : `b0f8481` (ZII-FLASH-LITE, glm-4.5-flash).

## 1. Livré

### L2 — Fil serveur minimal (intention portée par la bulle)
- `packages/shared/src/index.ts` : `ChatMessageData` gagne deux champs OPTIONNELS `intentionPercue?: string` et `ton?: string` — posés UNIQUEMENT par `publierMessageZii` quand Zii répond (jamais sur un message humain, jamais sur une salutation). Donnée légère portée par le message canon CHAT-SOCLE existant : zéro nouvelle clé de storage, zéro champ moteur, `schemaVersion` 28 inchangée.
- `apps/server/src/game.ts` : `publierMessageZii(canal, texte, intentionPercue?, ton?)` ; `ziiRepondre` passe `r.intentionPercue`/`r.ton` de `ResultatReponseZii`. AUCUN changement au décodeur, aux replis, à la liste blanche, au budget (périmètre interdit respecté).

### L1/L3 — Client (le cœur)
- `apps/web/src/lib/officialisation.ts` (NOUVEAU, pur) : `INTENTIONS_OFFICIELISABLES` = {`demandePaix`, `offre`} ; `officielisable(m, monEngineId)` — le bouton n'apparaît que si le serveur a posé une intention éligible sur la bulle (donc uniquement face à une nation bot — un message humain n'en porte jamais, R-190/humain↔humain respectés) ; `sectionSuggeree(intention, enGuerre)` — `demandePaix` en guerre → `paix`, hors guerre → `techs` ; `offre` → `techs` (D1).
- `apps/web/src/components/Chat.svelte` : bouton discret « ✍ Officieliser… » sous la bulle (tooltip « Conclure un accord formel avec [dirigeant] », style pill cohérent avec les bulles accent — D5), callback `onOfficieliser(engineId, intention)`.
- `apps/web/src/components/NegociationModale.svelte` : prop optionnelle `sectionSuggeree?: 'paix' | 'techs'` — section mise en avant (bordure or) ; comportement inchangé sinon.
- `apps/web/src/pages/Game.svelte` : `officieliserDepuisChat` réutilise le MÊME état `negociationCible` (L3 — zéro modale dupliquée) + `negociationSection` ; cible résolue depuis `adversairesDetail` (nom/enGuerre/defeated canon).

## 2. Tests (test-first sur la logique pure, e2e sur le fil)
- Serveur (`tests/zii-v1.test.ts`, +1 = 26 zii / 388 server / 20 jev-port verts) : e2e SANS clé — « Je demande la paix, Jev. » → `intentionDe` = `demandePaix` → la bulle de repli porte `intentionPercue: 'demandePaix'` dans ChatHistory ; **test négatif** : aucun message HUMAIN ne porte `intentionPercue`/`ton`, la bulle de repli n'a pas de `ton` (liste blanche inchangée).
- Web (`tests/officialisation.test.ts`, +6 = 712 verts) : bouton présent ⇔ intention éligible ; ABSENT sur `salutation`/`question`/`autre`/`menace` ; ABSENT sur mes bulles ; mapping de section (paix en guerre, techs sinon).
- Suites complètes : server **388/388**, jev-port **20/20**, rules **1101/1101**, web **712/712**, svelte-check **0 erreur**, typechecks server/web/rules/shared **verts**.

## 3. Vérification GUI (wrangler 8787 + Vite 5174, partie solo vs Jev)
Captures `dev-logs/captures-officialisation/` (AVANT commit — règle d'Erik) :
1. `01-bulle-officieliser.png` — Zii (GLM réel, glm-4.5-flash) répond à « Je demande la paix, Jev. » : bulle porte `intentionPercue: 'demandePaix'`, `ton: 'courtois'` (vérifié dans le JSON du ChatMessage) + bouton « ✍ Officieliser… » visible sous la bulle ;
2. `02-modale-preciblee.png` — UN clic → `NegociationModale` pré-ciblée « Négocier — Jev 🤖 », section « 🕊 Proposer la paix » surlignée or (guerre déclarée au préalable) ;
3. `03-reponse-paix.png` — « Proposer la paix (+N or) » → réponse du bot en direct (`PeaceOfferRefused` vu par le WS/Snapshot — la modale se ferme, la grille seedée répond).

**Deux clics depuis la bulle jusqu'à la proposition** (critère 1) : bouton → « Proposer la paix ».

## 4. 🔶 Écart consigné — PeaceAccepted non obtenu en GUI local
Le critère L4 demandait « conclure la paix réellement (PeaceAccepted en Chronique) ». La proposition passe de bout en bout et le bot répond en direct, mais la réponse locale a été `PeaceOfferRefused` :
- via la modale, `goldOffer` est TOUJOURS défini (curseur) → grille `deciderPaixNegociee` : le prix du bot (prixPaixBase 15 × fierté × rapport de forces) dépasse la trésorerie du joueur au démarrage ;
- le joueur démarre COLON et le spawn est INTÉRIEUR (sonde BFS : aucune tuile côtière joignable) → **0 or/tour** (économie commerce eau/désert — mémoire `economie-commerce-eau-desert`), la compensation est inatteignable en ≤ 15 tours ;
- la paix sèche (sans compensation, `deciderPaix` à `dureeMin` ≈ 12 + distance × facteur) demanderait ~20+ tours de guerre sans bataille — hors fenêtre de vérification locale (piège workerd ~10 tours, consigné).
C'est la grille canon du moteur (PÉRIMÈTRE INTERDIT — non modifiée, conformément au handoff). `PeaceAccepted`/`PeaceCompensated` restent prouvés par les tests moteur existants (rules/diplomatie + server/diplomatie-t2). **La conclusion réelle d'une paix via le bouton reste à la validation à l'œil d'Erik** (une partie où il a de l'or ou une guerre traînante).

## 5. Pièges consignés
- `TurnResult` n'a PAS de `lastEvents` (c'est `events`) et `Snapshot` porte `missedEvents` — le verdict paix se lit dans `events`/`missedEvents` ou dans `state.diplomacy.war`.
- Une salutation de début (sans intention) peut partager le canal Général : filtrer les bulles Zii par `intentionPercue !== undefined` dans les tests, pas par auteur seul.
- Zii répond dans le canal du message (Général compris) : le bouton naît sur n'importe quelle bulle éligible, la cible étant résolue par `auteur` côté Game.svelte.
- Le spawn procédural est intérieur profond (sonde : 0 site côtier accessible) — toute vérification locale qui dépend de l'or doit en tenir compte.

## 6. Déploiement / fin de session
- Commit + push de la tranche (CI = Deploy). `schemaVersion` 28 INCHANGÉE, zéro storage nouveau, zéro secret committé (`.dev.vars` jamais touché).
- 🔶 À l'œil Erik : libellé « ✍ Officieliser… » (D5), la surlignature or de la section suggérée, le geste complet en partie réelle (paix conclue).
- Suite de la file : itération 4 Jev (fin de partie).
