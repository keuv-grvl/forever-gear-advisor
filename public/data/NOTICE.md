# Données de Forever Gear Advisor

Les fichiers de ce dossier sont générés par les scripts de `scripts/` et distribués sous la
**GNU General Public License v3.0** (voir `LICENSE` à côté de ce fichier). Le code de l'application,
hors de ce dossier, est sous licence MIT.

| Fichier | Contenu | Source |
|---|---|---|
| `weights.json` | Poids de stats par spé et tranche de niveau | [Polestar](https://github.com/fitzforge/polestar), `docs/gear-weights.md` (commit `aafd6e4`), GPL-3.0 |
| `items.json` | Objets équipables WoW Forever : stats, niveaux, slot, restrictions | API Blizzard WoW Forever (namespace `static-forever-eu`) et équipement observé sur des personnages (API profil Forever) |
| `sources.json` | Pour chaque objet : recettes (métier, réactifs), quêtes et vendeurs | Recettes : API Blizzard WoW Forever. Quêtes : [forever-db](https://github.com/fitzforge/polestar/tree/next/forever-db) de Polestar, release `data-v2026.11.2`, GPL-3.0 (ses sources sont créditées dans son `NOTICE.md`). Vendeurs : [forever-db](https://github.com/foreverfraddons/forever-db) de fatedfr, GPL-3.0 (ses sources et leurs licences sont listées dans son `LICENSE-DATA.txt`) ; seuls les PNJ attestés par une source Forever sont gardés |
| `i18n/<langue>.json` | Noms d'objets, de quêtes, de sous-types d'objet, de métiers et de factions dans les langues de l'app (de, es, fr, it, pt, ru, ko, cn, tw) | API Blizzard WoW Forever (réponses sans locale, toutes langues) |

Les noms d'objets, de quêtes et les autres données de jeu restent la propriété de Blizzard Entertainment.
World of Warcraft et les noms associés sont des marques de Blizzard Entertainment. Ce projet n'est affilié
ni à Blizzard Entertainment ni aux projets cités.
