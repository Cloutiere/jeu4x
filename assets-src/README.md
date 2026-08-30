# /assets-src — Sources d'art du jeu

Les fichiers d'art ne sont **pas bloquants** : la Phase 3 rend le jeu avec des
placeholders générés à l'exécution. L'art réel remplace ensuite les placeholders
fichier par fichier.

- **Spécification complète : [SPEC-ART.md](./SPEC-ART.md)** (dimensions, ratios,
  nommage, liste par priorité, checklist de réception) — le contrat à respecter.
- `exports/` : PNG finaux chargés par le jeu (seuls fichiers lus par le code).
- `sources/` : fichiers de travail (jamais chargés par le jeu).
- `LICENSES.md` : provenance + licence de chaque fichier (obligatoire).
