# Forever Gear Advisor

Webapp pour **WoW Forever** : charge un personnage (équipement, spé) et indique quels objets améliorer
et comment les obtenir (quête, craft), à son niveau.

En ligne : https://forever-gear-advisor.vercel.app/ (par exemple `?c=helga-tartine&r=eu`).

## Fonctionnement

- Le navigateur appelle `/api/character` (fonction Vercel), qui interroge l'API Blizzard avec un token
  gardé côté serveur.
- Les données d'objets sont des JSON statiques dans `public/data/`, générés en local et servis par le CDN.
- Le score d'un objet est la somme de ses stats pondérées par les poids de la spé (Polestar), au niveau
  du personnage ; le gain est l'écart avec l'objet porté.

Contexte, décisions et pièges de l'API : [docs/ROADMAP.md](docs/ROADMAP.md).

## Développement

Dans le devcontainer (Node 24) :

```sh
npm run dev      # Vite ; /api est redirigé vers la prod (API_TARGET pour une autre URL)
npm run build    # vérification TypeScript + build
```

### Régénérer les données

```sh
npm run data:weights   # public/data/weights.json depuis Polestar (commit figé dans le script)
npm run data:items     # public/data/items.json et sources.json (API Blizzard Forever + forever-db)
```

`data:items` lit les identifiants Blizzard dans `.env.blizzard.local` (non versionné) :

```
BLIZZARD_CLIENT_ID=...
BLIZZARD_CLIENT_SECRET=...
```

Optionnel : `scripts/seeds.local.json` (non versionné) liste des persos et des guildes dont l'équipement
complète la base, pour les objets absents de l'API statique :

```json
{ "characters": ["prenom-nom"], "guilds": ["nom-de-guilde"] }
```

Les réponses de l'API sont gardées dans `.cache/` : une relance ne refait que les appels manquants.

## Licences

- Code : MIT (`LICENSE`).
- Données (`public/data/`) : GPL-3.0, voir `public/data/NOTICE.md` pour les sources.
