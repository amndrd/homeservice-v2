# HomeService BXL — v2

Deuxième version du site HomeService BXL : une version **non immersive** de
[homeservice-immersive](https://github.com/amndrd/homeservice-immersive) (le site en 3D temps réel).
Les éléments du site immersif y sont repris un à un, adaptés à un site classique.

## Déjà en place

- **Navbar** reprise du site immersif : logo (accueil), À propos, Services, Fonctionnement, Zone, Contact,
  sélecteur de langue (FR / EN / NL) et bouton « Devis gratuit » (page de création de devis).
- **Transition entre les pages** : le voile bleu encre frappé du logo monte du bas de l'écran, au bord rongé
  comme le vide du site immersif, couvre l'écran pendant le changement de page, puis sort par le haut
  (`js/veil.js`, WebGL sans dépendance). La page suivante est préparée d'avance pour un passage sans à-coup.

## Structure

| Dossier | Contenu |
|---|---|
| `*.html` | Les pages (contenu à venir) |
| `css/style.css` | Navbar, voile des transitions |
| `js/veil.js` | Navigation et transition entre les pages |
| `js/i18n.js` | Langue du site |

## Lancer le site

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```
