# ROADMAP, WoW Forever Gear Advisor

> Document de contexte pour les sessions Claude. À lire en premier, à tenir à jour en fin de session.
> Dernière mise à jour : 2026-11-25 (phases 1 et 2)

## Objectif

Webapp qui charge le personnage WoW Forever d'un joueur (équipement, spé), puis indique **quels objets améliorer** et **où les obtenir** (craft, donjon/boss, quête, HV), quel que soit son niveau. Pas de design poussé : l'utilité d'abord.

## Stack et déploiement

- Vue 3 + Vite + TypeScript, dépôt GitHub, déploiement Vercel (`main` = prod, chaque branche = URL de preview).
- Environnement de dev : `.devcontainer/` (Node 24, Vercel CLI, `npm ci` au démarrage). Node n'est pas installé dans le WSL hôte, il faut travailler dans le conteneur. Secrets en local : `vercel link` puis `vercel env pull .env.local` (ignoré par git via `*.local`).
- Pas de vrai backend. Le dossier `/api` (fonctions serverless Vercel) sert uniquement de proxy vers Blizzard : `api/character.ts` (profil + équipement + spés en un appel), code partagé dans `api/_lib/` (le `_` empêche Vercel d'en faire une fonction). Imports en `.js` dans `api/` (Vercel compile le TS).
- En dev local, Vite redirige `/api` vers la prod (`vite.config.ts`, surcharge possible via `API_TARGET`).
- **Le client secret Blizzard ne doit jamais atteindre le navigateur** : variables d'environnement Vercel uniquement, jamais commité. Ni le token : le proxy le garde côté serveur.
- Les variables `BLIZZARD_*` sont de type *Sensitive* (Production + Preview) : `vercel env pull` ne les récupère pas. Pour un script local (phase 3), il faudra les fournir autrement.
- Les previews sont protégées (Vercel Authentication) : les tester avec `vercel curl <url>` (un secret « Protection Bypass for Automation » a été ajouté au projet pour ça).

## Quotas Vercel (plan Hobby, gratuit)

Par mois : 1 M d'invocations de fonctions, 4 h de CPU actif, 10 Go de Fast Origin Transfer, 100 Go de Fast Data Transfer. Par jour : 100 déploiements (chaque push en est un).

- Un seul appel `/api` par action utilisateur, réponses allégées (`slim`) et cache CDN (`s-maxage`).
- Données lourdes en JSON statiques (CDN), jamais générées par une fonction.
- Grouper les commits avant de pousser.

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

## Décisions d'architecture

1. **Données statiques générées au build** : un script Node (lancé en local avec les identifiants) produit des JSON livrés avec l'app (`public/data/`). Seul le profil du personnage est appelé en live.
   - `items.json` : stats, slot, niveau requis, type d'armure, qualité.
   - `sources.json` : par objet, ses sources (`craft`, `drop`, `quest`, `vendor`).
   - `weights.json` : poids de stats par classe/spé.
2. **Détection de la spé** : arbre de talents avec le plus de points dans `/specializations`.
3. **Scoring** : `score = Σ(stat × poids[spé][stat]) + armes (DPS/vitesse)`. Gain d'un slot = `score(meilleur candidat) − score(équipé)`. Résultat trié par gain décroissant ; slot vide = gain maximal.
4. **Candidats** : niveau requis ≤ niveau du perso (et pas trop bas), type d'armure/arme utilisable par la classe, restrictions de classe/faction. Option « à anticiper » : jusqu'à +5 niveaux.
5. **Liens Wowhead** pour creuser : `https://www.wowhead.com/forever/item={id}` (patterns `/forever/npc=` et `/forever/item=` confirmés ; à vérifier pour quest, zone). **Liens sortants uniquement, ne pas scraper Wowhead.**

## Sources de données externes pour le loot

À auditer avant usage (format, couverture, **licence**) :

- `fitzforge/polestar` : Codex (donjons, boss, loot, quêtes, rares), données avec `LICENSE-DATA.txt`. Piste n°1.
- `cmangos/classic-db` (GPL v3) : base Vanilla 1.12, approximative pour Forever. Piste n°2.
- AtlasLoot / Questie : données Lua d'addons, dernier recours.
- Wowhead propose un Gear Planner Forever : s'en inspirer pour les poids, mettre un lien « ouvrir dans le Gear Planner ».

Toujours afficher la provenance d'une info de source, et garder le lien Wowhead comme référence.

## Plan d'action

**Phase 0, fait :** hello world Vue/TS, push GitHub, déploiement Vercel, previews par branche.

**Phase 1, accès Blizzard**

- [x] Créer le client sur develop.battle.net, ajouter `BLIZZARD_CLIENT_ID` / `BLIZZARD_CLIENT_SECRET` dans Vercel (Production + Preview).
- [x] Fonction `/api/character` avec cache du token (pas de `/api/token` : le token ne doit pas sortir du serveur).
- [x] Champ de saisie `prenom-nom` (normalisation), affichage du profil de base, URL partageable `?c=…&r=…`.

**Phase 2, personnage**

- [x] Équipement par slot avec stats, qualité, lien Wowhead.
- [x] Détection de la spé et de la classe.

**Phase 3, données statiques**

- [ ] Script `scripts/build-data.ts` : items via `search/item`, recettes via métiers → recettes, index inversé `objet → recette`.
- [ ] Sortie dans `public/data/*.json`, versionnée ou régénérée via un script npm documenté.

**Phase 4, moteur de recommandation**

- [ ] `weights.json` pour une première classe/spé, puis étendre aux 27 arbres.
- [ ] Filtrage des candidats, calcul du gain par slot, tri et affichage des améliorations.

**Phase 5, sources**

- [ ] Afficher craft (réactifs, métier du perso) et prix HV.
- [ ] Intégrer le loot de boss/donjon et les récompenses de quêtes après audit des dépôts (voir plus haut).
- [ ] Liens Wowhead : objet, boss, donjon, quête.

**Phase 6, finitions**

- [ ] Cache local (localStorage/IndexedDB) du profil et des données.
- [ ] Gestion d'erreurs (404 perso, région, token expiré).
- [ ] Tests unitaires du scoring.

## Règles de travail pour les sessions Claude

- L'API et les données Forever changent vite : **revérifier la doc et les endpoints** avant de s'appuyer sur une hypothèse.
- Ne jamais mettre de secret dans le code ou dans un fichier commité.
- Petits commits, une branche par fonctionnalité, tester la preview Vercel.
- Cocher les cases ci-dessus et noter ici les décisions et surprises à chaque fin de session.

## Questions ouvertes

- Format et licence exacts des données Polestar / CMaNGOS.
- Par quelle classe/spé commencer pour les premiers poids de stats ?
- Pattern d'URL Wowhead Forever pour item, quête et zone.
