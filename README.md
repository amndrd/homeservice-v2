# HomeService BXL — v2

Deuxième version du site HomeService BXL : une version **non immersive** de
[homeservice-immersive](https://github.com/amndrd/homeservice-immersive) (le site en 3D temps réel).
Les éléments du site immersif y sont repris un à un, adaptés à un site classique.

## Déjà en place

- **Navbar** reprise du site immersif : logo (accueil), À propos, Services, Fonctionnement, Zone, Contact,
  sélecteur de langue (FR / EN / NL) et bouton « Devis gratuit » (page de création de devis).
- **Écran de chargement** repris du site immersif (fond noir, logo blanc, cercle qui tourne), à l'arrivée sur le site
  seulement, jusqu'à ce que la page soit prête ; il s'efface en fondu, la navbar descend du haut de l'écran, puis le
  titre et la description de l'accueil montent l'un après l'autre (`css/style.css`, `js/veil.js`).
- **Une seule page** : la navbar fait défiler jusqu'à chaque section (la section à l'écran y est allumée). Au
  défilement, le vert du site monte du bas de l'écran et le remplit, avec le bord rongé du voile des onglets (sans le
  logo). À 80 %, l'À propos arrive et reste fixe le temps de ses apparitions, reprises du site immersif : les mots
  s'allument un à un, la photo s'ouvre derrière le bord du vide ; puis il défile sur le vert, et la section suivante
  glisse dessus (`js/flood.js`).
- **Transition (changement de langue)** : le voile bleu encre frappé du logo monte du bas de l'écran, au bord rongé
  comme le vide du site immersif, couvre l'écran pendant le changement de page, puis sort par le haut
  (`js/veil.js`, WebGL sans dépendance). La page suivante est préparée d'avance pour un passage sans à-coup.
- **Hero de l'accueil** : en haut, centrés, le titre et la description de l'écran titre du site immersif (« Besoin
  d'un coup de main ? ») ; dessous, en grand dans la moitié basse de l'écran, l'îlot des cinq services en 3D temps
  réel (`js/hero.js`, three.js), qui sort du blanc de la page avec un bord net. À chaque arrivée, le vide blanc le révèle : l'îlot est déjà là,
  et le blanc se retire depuis le centre avec le même bord ondulé que le voile des onglets et le vide du site
  immersif (même bruit), à travers le sol, les plantes et les objets (environ 4 s ; réglages `REVEAL`). Présenté comme les dioramas de la section Services du site immersif : caméra fixe en
  légère plongée, îlot de trois quarts qui tourne lentement sur lui-même ; on l'attrape pour le faire tourner autour de la verticale
  (il garde un peu d'élan) ou le basculer (lâché, il revient à plat). L'îlot vit
  comme dans Blender, un matin de printemps : prairie fleurie aux couleurs vives, herbe qui ondule au vent, pollen
  doré, aigrettes, papillons (animations coupées si l'utilisateur les réduit). Le modèle `models/ilot.glb` est exporté de
  `blender/hero.blend` par `blender/scripts/export_web.py`.

## Structure

| Dossier | Contenu |
|---|---|
| `index.html` | Le site entier, sur une seule page : accueil, à propos, services, fonctionnement, zone, contact, devis |
| `a-propos.html`, `services.html`… | Anciennes adresses : elles mènent à leur section de `index.html` |
| `css/style.css` | Navbar, voile des transitions |
| `js/veil.js` | Navigation et transition entre les pages |
| `js/i18n.js` | Langue du site |
| `js/hero.js` | Scène 3D du hero de l'accueil |
| `models/ilot.glb` | L'îlot exporté de Blender (Draco) |
| `js/flood.js` | Le vert du défilement, du hero à l'À propos |
| `images/teampic.webp` | Photo de l'équipe (À propos) |
| `blender/` | Scène du hero et scripts (îlot, objets, export web) |

## Lancer le site

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```
