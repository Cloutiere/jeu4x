# HANDOFF-CONFIRMATION-GUERRE — Banc de confirmation : le fix de confiance en condition réelle

**Statut : prêt — NON LANCÉ.** Micro-mission de confirmation, ZÉRO code. Le fix `seuils.confianceGuerreSterile = 0,3` (GUERRE-VIVANTE `868452e`) est prouvé en tests : le banc a montré 512 choix `paix` écrasés par la gate générique 0,5 (confidences 0,35-0,48) — il attend sa preuve en condition réelle, comme le correctif D-B bis avant lui.

## Protocole (défauts tranchés — déjà votés)

- **3 parties vanilla longues** (`--vanilla --plafond 600`), les 3 seeds où la guerre muette a survécu au banc guerre-vivante : **3947827986** (partie 2 : 583 tours sans combat — LE cas), **3802591813** (partie 4 : 303 tours sans combat malgré 129 échanges), **214915776** (partie 5 : 191 tours) ;
- **Budget ≤ 0,60 $** ; sonde crédits avant de lancer ; arrêt sur 402 réel ; banc via tsx, mètre `analyse-vanilla.py` (+ le mètre de stérilité GUERRE-VIVANTE).

## Critères (mesurables)

1. **La partie 2 finit** (victoire quelconque, ou la guerre se conclut : paix acceptée au transcript OU combats) — plus de 583 tours de vide ;
2. **Les jugements `guerreSterile` tirent** : au moins un choix `paix`/`assauts` au transcript avec confidence < 0,5 qui est HONORÉ (le fix visible) ;
3. **Non-régression** : les 3 parties restent gagnables par Jev (victoires ou guerre menée), expansion ≥ 4 ;
4. **Comparaison chiffrée** avant/après (mêmes seeds, même mètre) : tours de guerre sans combat, paix conclues, combats — tableau dans le rapport.

## Périmètre interdit

ZÉRO changement de code ou de data — si un résultat surprend, le consigner chiffré et remettre la main (verdict Erik), ne pas retoucher. Jamais de secret ni de fichier non tracké d'Erik.

## Fin de session

Rapport `REPORT-CONFIRMATION-GUERRE.md` (à la racine, court : le tableau, les transcripts des jugements honorés) + arrêt. À l'acceptation du pilot : chapitre guerre clos, Erik joue contre le Jev complet (option B), puis le backlog (conquête par direction, oscillation de marche bot, zapping de voie, miroir JvJ, atelier voix).
