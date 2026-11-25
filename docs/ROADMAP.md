# ROADMAP, WoW Forever Gear Advisor

> Document de contexte pour les sessions Claude. À lire en premier, à tenir à jour en fin de session.
> Dernière mise à jour : 2026-11-25 (phases 1 à 4, sources quêtes et craft)

## Objectif

Webapp qui charge le personnage WoW Forever d'un joueur (équipement, spé), puis indique **quels objets améliorer** et **où les obtenir** (quête, craft), quel que soit son niveau. Pas de design poussé : l'utilité d'abord.

**Règle n°1 : données WoW Forever uniquement.** Jamais Classic Era, Classic, retail, cMaNGOS/VMaNGOS, ni repli « vanilla » : Forever a rééquilibré beaucoup d'objets (Boulder Pads, Belt of Arugal… n'ont pas les mêmes stats qu'en Era). Une donnée absente en Forever s'affiche comme inconnue. **Pas de drops** (décision du 2026-11-25) : leurs données ouvertes mêlent des bases Classic. **Vendeurs autorisés** (assouplissement du même jour, à la demande de l'utilisateur) : base de fatedfr, PNJ attestés par une source Forever seulement.

## Stack et déploiement

- Vue 3 + Vite + TypeScript, dépôt GitHub, déploiement Vercel (`main` = prod, chaque branche = URL de preview).
- Environnement de dev : `.devcontainer/` (Node 24, Vercel CLI, `npm ci` au démarrage). Node n'est pas installé dans le WSL hôte, il faut travailler dans le conteneur. Secrets en local : `vercel link` puis `vercel env pull .env.local` (ignoré par git via `*.local`).
- Pas de vrai backend. Le dossier `/api` (fonctions serverless Vercel) sert uniquement de proxy vers Blizzard : `api/character.ts` (profil + équipement + spés + quêtes + noms des membres de la guilde en une invocation), `api/prices.ts` (prix HV, cache 6 h), code partagé dans `api/_lib/` (le `_` empêche Vercel d'en faire une fonction). Imports en `.js` dans `api/` (Vercel compile le TS).
- En dev local, Vite redirige `/api` vers la prod (`vite.config.ts`, surcharge possible via `API_TARGET`).
- **Le client secret Blizzard ne doit jamais atteindre le navigateur** : variables d'environnement Vercel uniquement, jamais commité. Ni le token : le proxy le garde côté serveur.
- Les variables `BLIZZARD_*` sont de type *Sensitive* (Production + Preview) : `vercel env pull` ne les récupère pas. Les scripts locaux lisent `.env.blizzard.local` (client Blizzard dédié, rempli à la main, ignoré par git, à révoquer quand l'implémentation est stable).
- Les previews sont protégées (Vercel Authentication) : les tester avec `vercel curl <url>` (un secret « Protection Bypass for Automation » a été ajouté au projet pour ça).

## Quotas Vercel (plan Hobby, gratuit)

Par mois : 1 M d'invocations de fonctions, 4 h de CPU actif, 10 Go de Fast Origin Transfer, 100 Go de Fast Data Transfer. Par jour : 100 déploiements (chaque push en est un).

- Un seul appel `/api` par action utilisateur, réponses allégées (`slim`) et cache CDN (`s-maxage`).
- Données lourdes en JSON statiques (CDN), jamais générées par une fonction.
- Grouper les commits avant de pousser.

## Licences

Code sous MIT (`LICENSE`). Données de `public/data/` sous GPL-3.0 (`public/data/LICENSE`, sources dans `public/data/NOTICE.md`), parce qu'elles dérivent de Polestar (poids) et de forever-db (quêtes). Choix de l'utilisateur, 2026-11-25.

## Faits sur l'API Blizzard Forever (source : wowdb.dev/forever-api, vérifiée le 2026-11-23 et le 2026-11-25)

- Pas de realms : personnage identifié par `prenom-nom`, en minuscules avec un tiret (`ada-brightwood`). Sinon 404.
- Namespaces : `profile-forever-{region}`, `static-forever-{region}`, `dynamic-forever-{region}`. Régions : us, eu, kr, tw.
- Un token d'application suffit (OAuth client credentials, valable 24 h). Client créé sur develop.battle.net.
- Utiles : `/profile/wow/character/{name}`, `/equipment`, `/specializations`, `/professions` ; `/data/wow/item/{id}`, `/data/wow/search/item`, `/data/wow/profession/...`, `/data/wow/recipe/{id}` ; prix HV via `/data/wow/ruleset/{id}/auctions/...`.
- **Manques** : `creature`, `spell` en 404 ; journal des donjons vide. L'API ne donne donc **ni drops ni récompenses de quêtes**.
- Hôte : `https://{region}.api.blizzard.com`, token : `https://oauth.battle.net/token` (confirmé en EU).
- Rulesets : 1 PvP, 2 Normal, 3 RP, 15 RP-PvP. Le profil renvoie le ruleset du perso.
- Forme des données (confirmée) : `equipped_items[]` avec `slot.type`, `quality.type`, `level.value`, `requirements.level.value`, `item_subclass`, `inventory_type.type` (`TWOHWEAPON`…), `stats[]` (`is_equip_bonus`), `weapon.dps`/`attack_speed` (ms). `specialization_groups[].specializations[].spent_points`.
- Perso de test : `helga-tartine`, EU, PvP (chamane naine, niv. 38, Amélioration).
- **Champs non garantis** : seuls `item`, `slot`, `name` sont sûrs sur un objet équipé. `pal-ouffette` (EU, paladin 36) n'a `level` (niveau d'objet) sur **aucun** objet, ni `equipped_item_level` dans son profil. Le scoring ne doit pas dépendre du niveau d'objet du profil : le compléter via `items.json` (phase 3).
- Stats vues : `STAMINA`, `STRENGTH`, `INTELLECT`, `SPIRIT`, `ATTACK_POWER`, `SPELL_POWER`, `DEFENSE`, résistances, et des bonus conditionnels (« Attack Power Vs Beasts »). Certains types finissent par une virgule (`BONUS_STAT_ATTACK_POWER_VS_BEAST,`) ; « +X à toutes les résistances » arrive **sans** `type`.
- **Ratings, pas des %** : « +14 Critical Strike » = l'ancien « +1 % crit ». Pour 1 % : crit 14, toucher 10, hâte 10, expertise 10, pénétration d'armure 10, esquive 12, parade 15, blocage 5 ; défense par point. Identique à tous les niveaux (client Forever `gametables/combatratings`, d'après Polestar). Codé dans `src/lib/scoring.ts`.
- **L'API statique est partielle** : `/data/wow/item/{id}` (namespace `static-forever-eu`) ne connaît que ~40 % des objets portés par nos persos de test (32/81). Il manque surtout des objets de quête et de donjon, et les objets propres à Forever (ids 27xxxx). Le client Forever (`ItemSparse`) a le même sous-ensemble : les autres arrivent sans doute par hotfix serveur. D'où l'ajout des objets observés sur des persos (`scripts/seeds.local.json`).
- La recherche `/data/wow/search/item` plafonne à 10 pages de 100 : paginer par plage d'id (`orderby=id&id=[N,]`). Le paramètre `id=3020` seul ne marche pas.
- `required_level` vaut 0 pour ~30 % des objets, et **1** pour des objets Forever de haut niveau (variante de Sulfuras 289295, niveau d'objet 45). Les deux sont traités comme « inconnu ». Niveau d'accès `al` dans `items.json` = niveau requis, sinon niveau min. de la quête qui le donne, sinon niveau d'objet − 5 (écart constaté sur les objets Forever : Enduring Cap 33/28, Boulder Pads 41/36), marqué estimé (`ale`).
- Objets écartés : noms de test (`QATest`, `Testing`, `[PH]`, `Bland Dagger`…), objets aux stats incohérentes avec leur niveau (Restored Wand : niveau 1, 44,7 DPS, probablement à niveau variable), objets à suffixe aléatoire observés (« of the Owl » : stats propres à l'exemplaire).
- Recettes : `/data/wow/profession/{id}` → `skill_tiers` → `/skill-tier/{id}` → `categories[].recipes` → `/data/wow/recipe/{id}` (objet fabriqué, réactifs ; **pas** de niveau de compétence). 2 494 recettes.
- Règles d'équipement (`src/lib/rules.ts`) : celles de Classic, vérifiées sur 252 objets portés par 17 persos Forever. **Écart Forever** : les voleurs portent des haches à une main (Greater Scythe of the Tiger, voleur 43).

## Décisions d'architecture

1. **Données statiques générées au build** : un script Node (lancé en local avec les identifiants) produit des JSON livrés avec l'app (`public/data/`). Seul le profil du personnage est appelé en live.
   - `items.json` : stats, slot, niveau requis, type d'armure, qualité.
   - `sources.json` : par objet, ses sources (`craft`, `quest`).
   - `weights.json` : poids de stats des 27 spés, niveaux 10 à 60, tirés de Polestar (`scripts/build-weights.ts`, commit figé).
2. **Détection de la spé** : arbre de talents avec le plus de points dans `/specializations`.
3. **Scoring** (`src/lib/scoring.ts`) : `score = Σ(stat / rating par 1 % × poids) + armure × poids + DPS × poids`. Poids de la tranche Polestar du niveau (moins de 25, 25-39, 40-49, 50-59, 60). `SPELL_POWER` compte en dégâts et en soins ; une arme en main gauche compte pour moitié (règle Polestar). Gain = score du candidat − score de l'objet porté ; slot vide = gain maximal.
4. **Candidats** (`src/lib/recommend.ts`) : niveau d'accès ≤ niveau du perso (+5 avec « Anticiper »), portable par la classe à ce niveau, faction. Option « type d'armure principal » (cochée par défaut) : mailles pour un paladin ≥ 40, etc. Anneaux et bijoux : une ligne par emplacement ; le plus faible (un emplacement vide d'abord) reçoit les meilleurs candidats, l'autre les suivants (sans le premier choix du faible s'il est unique). Armes : comparaison d'ensembles (2M seule contre main droite + main gauche).
5. **Liens Wowhead** pour creuser : `https://www.wowhead.com/forever/item={id}` et `/forever/quest={id}` (confirmés, ainsi que `/forever/npc=`). **Liens sortants uniquement, ne pas scraper Wowhead.**
6. **Pas de SQLite côté navigateur** (question du 2026-11-25) : 6 500 objets, 1,2 Mo (166 Ko gzip) ; le moteur calcule un perso en moins de 10 ms en JS. sql.js (WASM ~1 Mo) pèserait plus que les données. À reconsidérer pour le script de build si on croise beaucoup plus de sources.
7. **Cache du script** : `.cache/blizzard/` (une réponse par URL), durée de vie 7 jours, et ménage en fin de génération réussie (tout fichier non utilisé est supprimé). Taille stable ~50 Mo.

## Sources de données externes (audit du 2026-11-25)

- **Polestar** (`fitzforge/polestar`, GPL-3.0) : utilisé pour les **poids** (`docs/gear-weights.md`) et les **quêtes** via sa base `forever-db/` (releases `data-v*`, tables `quest`, `quest_reward` ; données Forever de QuestieDB). Sa table `item` n'a que les noms (pas de stats). Son `item_source` (drops) n'est pas utilisé (pas de drops) ; le loot des boss qu'il tire d'AtlasLoot reste local chez eux, non redistribué.
- **forever-db de fatedfr** (`foreverfraddons/forever-db`, addon CurseForge « forever-db », GPL-3.0, release `latest` refaite 2×/jour) : très complet (drops de boss avec taux, vendeurs, quêtes, 32 279 objets du client Forever sans stats), 72/81 objets portés avec une source. **Utilisé pour les vendeurs seulement** (`vend` + `nfac` : faction amicale A/H/AH) : un objet dont tous les vendeurs sont de l'autre faction n'est plus proposé (Advisor's Gnarled Staff = Horde, Lorekeeper's Staff = Alliance, mêmes stats ; le client Forever ne les restreint pas, seul le vendeur le fait). Drops non utilisés : ses liens mêlent VMaNGOS/cMaNGOS/pfQuest sans provenance par entrée. **Piège** : dans `src`, le bit k est la k-ième source passée à `tools/merge.py` dans leur workflow (`client, questie, att, vmangos, cmangos, pfquest, legacy, spf, terrain`), **pas** l'ordre de `meta.sourceList`. Un premier décodage selon `meta.sourceList` était faux (corrigé le 2026-11-25) ; le script vérifie maintenant qu'aucun objet d'id Forever (≥ 250000) n'a de bit Classic, et s'arrête sinon. `src` n'existe que pour les entités (item, npc, obj, quest) : on garde les vendeurs dont le PNJ a un bit Forever (client, questie, att, legacy, spf).
- Aussi utilisé pour les **récompenses de quêtes** absentes de Polestar (`rew`), quand le lien vient forcément d'une source Forever : la quête **ou** l'objet n'a aucun bit Classic (une base Classic ne peut pas lier une quête à un objet qu'elle ne connaît pas). Ex. Khan Jehn (93128) → Abandoned Ferocity ; Arathi Armbands (270080, objet Forever) donné par une quête vanilla. 394 objets. Faction et classes de la quête reprises de la table `quest` de Polestar.
- **Objets non disponibles** : un objet propre à Forever (aucun bit Classic) qu'AllTheThings ne référence pas (bit `att`) et qui n'a aucune source connue est écarté (340 objets, ex. Quick Strike Ring 288927, que Wowhead dit « not available to players » ; Hidden Helm/Cloak). Validation : les 69 objets Forever portés par la guilde de test sont tous dans ATT. Les objets observés sur un perso sont toujours gardés.
- Audit du 2026-11-25 (6 persos de test, 440 propositions) : 79 % avec source ; après l'exclusion des objets non disponibles, 88 % (21 objets sans source : 15 drops, 5 sans aucune source, 1 quête vanilla). Sans source : 22 drops (exclus par règle ; 15 d'entre eux sont des drops forcément Forever, objet inconnu des bases Classic), 13 objets sans aucune source connue, 1 quête vanilla (lien possiblement Classic).
- L'API Forever donne la **réputation requise** (`requirements.reputation` : faction, niveau 0-7), ex. Highlander's Leather Girdle → The League of Arathor, Honoré. Stockée dans `items.json` (`rep`) et affichée. Elle manque pour 108 récompenses des intendants du Goulet des Chanteguerres (Lorekeeper's Staff, signalé par l'utilisateur) : le client Forever (`ItemSparse.MinReputation`) a le rang mais pas la faction (`MinFactionID` 0) ; faction prise de l'intendant qui vend l'objet (Silverwing → Silverwing Sentinels, Warsong → Warsong Outriders), par camp quand les deux le vendent (`rep[2]` = faction Horde). Sur les 243 objets où l'API et le client ont tous deux la réputation, le rang est identique.
- **Tables du client Forever** (exports CSV de wago.tools, produit `wowf`, dernière build, cache `.cache/wago/<build>/`, `scripts/wago.ts`) : validées par l'utilisateur le 2026-11-25. `ItemSparse` n'a que ~19 400 objets (le serveur envoie les autres au jeu), dont les 6 069 de l'API : niveaux identiques, armure calculée identique sur 4 169 armures, dégâts identiques sauf armes de lanceur de sorts (DPS réduit, drapeaux `Flags_4` 0x100/0x200).
- **Écartés** : namespace Classic Era (`static-classic1x`, stats fausses pour Forever), cMaNGOS/VMaNGOS, Wowhead (pas de scraping).

Toujours afficher la provenance d'une info de source, et garder le lien Wowhead comme référence.

## Plan d'action

**Phase 0, fait :** hello world Vue/TS, push GitHub, déploiement Vercel, previews par branche.

**Phase 1, accès Blizzard**

- [x] Créer le client sur develop.battle.net, ajouter `BLIZZARD_CLIENT_ID` / `BLIZZARD_CLIENT_SECRET` dans Vercel (Production + Preview).
- [x] Fonction `/api/character` avec cache du token (pas de `/api/token` : le token ne doit pas sortir du serveur).
- [x] Saisie région puis nom (« Helga Tartine », « helga tartine » ou « helga-tartine », normalisés), affichage du profil de base, URL partageable `?c=…&r=…` en forme canonique.
- [x] Autocomplétion sans requête dédiée : l'API n'a pas de recherche de perso ; on retient dans le navigateur (localStorage) les persos consultés et les membres de leur guilde, renvoyés par `/api/character` (un appel Blizzard de plus, même invocation Vercel).

**Phase 2, personnage**

- [x] Équipement par slot avec stats, qualité, lien Wowhead.
- [x] Détection de la spé et de la classe.

**Phase 3, données statiques**

- [x] `scripts/build-data.ts` (`npm run data:items`) : objets via `search/item` + fiches, objets observés sur des persos, recettes, quêtes forever-db. 6 479 objets, 2 776 avec source (1 279 craft, 1 511 quête).
- [x] `scripts/build-weights.ts` (`npm run data:weights`). Sorties versionnées dans `public/data/`.

**Phase 4, moteur de recommandation**

- [x] `weights.json` pour les 27 spés (Polestar).
- [x] Filtrage des candidats, gain par slot, affichage (`Recommendations.vue`), choix de la spé, options « Anticiper » et « type d'armure principal », infobulles.
- [x] Tri par gain ou par emplacement (ordre de la fiche personnage) ; meilleure option affichée, deux autres repliées ; préférences gardées dans le navigateur.
- [x] Effets d'objet en vert, comme en jeu : tableau d'équipement (stats `is_equip_bonus` de l'API, sauf l'Esprit rangé avec les stats de base sur demande de l'utilisateur, puis « Equipé / Utiliser ») et options proposées (`sp`, traduits dans `public/data/i18n/*.json` → `effects`), avec « non compté dans le score ». Compter certains effets (ex. Rage of the Storm : +10 % Frappe-tempête) reste à voir au cas par cas.

**Phase 5, sources**

- [x] Craft (métier, réactifs en infobulle), quêtes (lien Wowhead, niveau, faction et classe filtrées), vendeurs (lien Wowhead du PNJ, faction filtrée), réputation requise. 4 331 objets sur 6 150 ont une source. Un objet dont toutes les sources sont réservées à une autre faction ou classe n'est pas proposé.
- [x] Filtre par origine : quêtes, quêtes de donjon ou raid (type de quête du client, table `quest` de forever-db Polestar : 81 donjon, 62 raid), craft, vendeurs, réputation (décochée : écarte tout objet qui demande une réputation), source inconnue. Les drops de donjon restent absents (décision « pas de drops »).
- [x] Réputations du perso (`/reputations` dans `/api/character`, sans locale : nom anglais, rang, points) : à côté d'une réputation requise, « atteint » ou « tu es Neutre (285/3000), encore 20 715 points » (demande de l'utilisateur, pour juger de l'effort).
- [x] Faction des quêtes d'après leurs races et leurs prérequis (`qx` de QuestieDB Forever, via fatedfr : masque de races, prérequis « tous » et « un parmi » ; un prérequis qui contredit la quête est ignoré). Signalé par l'utilisateur : Abandoned Ferocity (Khan Jehn, sans faction) demande Checking Things Out, quête de la Horde. 14 récompenses concernées. Races Skyborne de Forever sur les bits 32 (Alliance) et 33 (Horde) des masques.
- [x] Quêtes du perso (`/quests`, `/quests/completed`, dans `/api/character`) : récompenses d'une quête terminée retirées (sauf `repeatable` de forever-db), quête en cours signalée.
- [x] Origine « Butin lié quand équipé » : objet non BoP sans autre source (binding de l'API Forever ; aucune donnée de drop Classic).
- [x] Prix HV : `api/prices.ts` (`/data/wow/ruleset/{id}/auctions/{maison}`, namespace dynamic). Un ruleset a 15 maisons (Alliance, Horde, Blackwater ×5, sans enchère commune : groupes de royaumes a priori) et l'API ne dit pas laquelle sert un perso : prix = médiane des minimums des maisons de la faction. 5 dumps de ~13 Mo, ~2 s, ~0,8 s CPU ; cache CDN 6 h. Objets à suffixe : clé `objet:suffixe` (~29 000 combinaisons, réponse ~750 Ko, ~200 Ko compressée).
- [x] Objets à stats aléatoires (« of the Whale », `scripts/random-items.ts` → `public/data/random.json`, `src/lib/random.ts`). Suffixe = liste de bonus du client (`ItemBonus` type 5 nom, type 2 stat + part en 1/10000) ; stat = arrondi(`RandPropPoints`[niveau d'objet][qualité][emplacement] × part / 10000) ; vérifié sur les 18 objets à suffixe portés par les persos de test (contrôle bloquant dans `data:items`). L'API Forever ne connaît pas ces objets (404) et le client n'a la fiche que de 93 : pour les 1 480 autres, qualité, niveaux et noms de fatedfr (option validée par l'utilisateur ; identiques au client sur les 102 objets comparables ; niveau d'objet manquant = niveau requis + 5, vrai pour 1 480/1 510), 14 noms débarrassés d'un suffixe collé. Armes écartées (vitesse inconnue, suffixes de lanceur de sorts qui changent le DPS). Seules les combinaisons en vente à l'HV sont proposées (origine « Butin lié quand équipé »). Noms traduits : base (fatedfr) + suffixe (client), ordre « base suffixe », « suffixe base » en coréen, collé en chinois (vérifié sur les noms de l'API).
- [x] Métiers du perso (`/professions` dans `/api/character` : id, compétence, recettes connues) : un craft lié quand ramassé d'un métier que le perso n'a pas n'est plus une source accessible (signalé par l'utilisateur : Defender's Leather Helm proposé à une herboriste/alchimiste) ; un craft lié quand équipé reste proposé, marqué « à faire fabriquer » (prix HV s'il est en vente). Pour son propre métier : « recette connue » ou « à apprendre » (`rid` = id de recette de l'API = `SkillLineAbility.ID` du client).
- [ ] Compétence requise d'une recette : ni l'API ni le client ne l'ont (`SkillLineAbility` n'a que les seuils jaune et gris, `MinSkillLineRank` vaut 1).
- [ ] Plus d'objets observés : élargir `seeds.local.json` (autres guildes) pour couvrir les objets absents de l'API statique.

**Phase 6, finitions**

- [x] Un seul tableau « Équipement » (`GearTable.vue`, demande de l'utilisateur) : recherche, récap perso, puis une ligne par emplacement avec l'objet porté (stats et effets), son score et le meilleur score possible (gain entre parenthèses, barre de progression) ; tri par gain ou par emplacement. Les options d'un emplacement (3 au plus) s'affichent sur clic, en retrait sous l'objet porté. Au-dessus du tableau, le score total (somme des scores portés) face au total possible ; armes : meilleure combinaison comptée une fois (2M seule ou main droite + main gauche). Niveaux d'objet, niveau requis et type retirés de l'affichage.

- [x] Langues de Wowhead (en, de, es, fr, it, pt, ru, ko, cn, tw), menu en haut à droite : textes de l'interface (`src/i18n/`), noms du jeu (`public/data/i18n/`, API Forever toutes langues ; PNJ en anglais, l'API Forever n'a pas `creature`), locale de `/api/character`, liens Wowhead `/forever/<langue>/`. La logique n'utilise que des ids et des types (classe par id, spés demandées sans locale : nom anglais + libellé).
- [x] ~~Sources de poids au choix~~ : prototype avec les poids de Forever Leveling BiS (vitesse d'arme, poids par configuration d'armes pour Amélioration), essayé puis abandonné le 2026-11-25 sur décision de l'utilisateur : pour un conseiller de leveling, les poids Polestar suffisent. La copie des poids de cet addon demande de toute façon une permission écrite de son auteur.
- [x] Autocomplétion du nom (`NameInput.vue`, demande de l'utilisateur, option « historique lisible ») : liste à nous au lieu du `<datalist>` du navigateur, ouverte au clic ou à la frappe, rubriques « Récemment consultés » et « Guilde … », chaque mot tapé doit commencer un mot du nom (sans casse ni accents), ↑ ↓ Entrée Échap, « Effacer l'historique ». Toujours aucune requête : l'API Forever ne permet ni de chercher ni de lister des persos (recherche, classements, index de guildes : 404). Piste écartée pour l'instant : un index partagé alimenté par les rosters (stockage externe).
- [x] URL d'un perso : `/eu/helga-tartine` (demande de l'utilisateur), sans le ruleset (la région et le nom suffisent, l'API donne le ruleset). Précédent / Suivant du navigateur, anciens liens `?c=…&r=…` convertis, réécriture vers `index.html` dans `vercel.json` (hors `/api`, `/data`, `/assets`).
- [ ] Cache local (localStorage/IndexedDB) du profil et des données.
- [ ] Gestion d'erreurs (404 perso, région, token expiré).
- [ ] Tests unitaires du scoring et des règles (aujourd'hui vérifiés par scripts ad hoc sur les persos de test).
- [ ] Afficher les stats non pondérées ignorées (résistances, bonus « contre les Bêtes »).

## Règles de travail pour les sessions Claude

- L'API et les données Forever changent vite : **revérifier la doc et les endpoints** avant de s'appuyer sur une hypothèse.
- Ne jamais mettre de secret dans le code ou dans un fichier commité.
- Petits commits, une branche par fonctionnalité, tester la preview Vercel.
- Cocher les cases ci-dessus et noter ici les décisions et surprises à chaque fin de session.

## Questions ouvertes

- Pourquoi `pal-ouffette` n'a aucun niveau d'objet dans l'API ? Hypothèse : perso connecté récemment (08:10 UTC le jour du test, les autres la veille), profil partiel. À revérifier après déconnexion.
- Les objets Forever à `required_level` 1 et niveau d'objet élevé (27xxxx–28xxxx) sont-ils à niveau variable ? Si oui, leurs stats statiques ne sont pas celles que le joueur obtiendra.
- Le rating de critique / toucher compte-t-il aussi pour les sorts en Forever ? (supposé oui : libellé générique « Critical Strike »).
