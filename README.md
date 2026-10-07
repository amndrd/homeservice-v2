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
- **Une seule page, sur le blanc** : la navbar fait défiler jusqu'à chaque section (la section à l'écran y est
  allumée). Sur ordinateur, au défilement, le hero reste en place : les objets des services décollent d'eux-mêmes,
  les légers d'abord, les lourds ensuite, et font chacun un seul trajet, du sol jusqu'au-dessus de l'écran : ils
  montent, s'écartent un peu et tournent lentement sur eux-mêmes, puis poursuivent dans la même direction en prenant
  de la vitesse, en se balançant à leur rythme. Leur ombre de soleil les suit dans le sens de la lumière, et sous eux
  le ciel est masqué selon leur silhouette vue de dessus ; de la terre tombe de la brouette, des brins d'herbe restent
  accrochés dessous, des pétales et des aigrettes montent avec eux. Une fois les objets en l'air, le vide reprend
  l'îlot et le titre — l'apparition jouée à l'envers, même bord ondulé (le titre, en HTML, est recouvert par la scène,
  qui peint la couleur de la page là où le vide l'a repris) ; les objets ralentissent un peu le temps qu'il passe.
  Puis l'À propos monte juste en dessous, et les objets sortent par le haut en passant devant lui (réglages `LIFT`,
  `PATH`, `HOVER`, `EXIT`, `SKY`, `RISE`, `CRUMBS`, `BLADES` de `js/hero.js`). Sur téléphone et en mouvement
  réduit, le hero défile simplement, l'îlot avec lui.
- **Le papillon guide** (ordinateur) : l'un des papillons de l'îlot, turquoise et rose, accompagne la page. Ce n'est
  pas une animation au défilement : à chaque image, il regarde l'écran et décide (`js/hero.js` : `GUIDE`, `BEHAVE`,
  `GESTURE`, `PATH_LAND`, `SHADOW`). Il quitte l'îlot quand les objets décollent, vole parmi eux en les évitant, n'est
  pas repris par le vide ; quand l'À propos arrive, il va se poser sur le dernier mot. À partir de là, la page est son
  sol : il vole au-dessus d'elle, et son ombre portée (sa silhouette, projetée selon la lumière) montre sa hauteur ;
  posé, il est à plat, vu de dessus, collé à la page. Il vit sa vie même quand on ne défile plus : de longs repos
  (postures d'ailes, pivots, quelques pas, frémissements), des vols variés (saut, patrouille, exploration du texte,
  escapade hors de l'écran), des poses en chemin, sur un mot ou sur le blanc, au bout d'une courbe d'approche ; il se
  redresse pour se poser, claque des ailes pour décoller, s'enfuit devant le curseur. En remontant jusqu'à l'îlot, il
  rentre chez lui. La page lui dit où en est la lecture et où il peut se poser (`js/apropos.js` : `window.hsPage`).
- **À propos** : une section de la page, reprise du site immersif : le texte dans la colonne de gauche, ses mots
  s'allument un à un, dans l'ordre de lecture, pendant qu'il traverse le milieu de l'écran, la partie en couleur passe au vert (`js/apropos.js`). La photo
  de l'équipe (colonne de droite) est retirée pour l'instant ; le script sait encore l'ouvrir derrière le bord du vide.
  Tout en bas, l'image « en construction » annonce la suite (clin d'œil provisoire).
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
| `css/style.css` | Navbar, voile des transitions (source : le site charge `style.min.css`) |
| `js/veil.js` | Navigation et transition entre les pages |
| `js/i18n.js` | Langue du site |
| `js/hero.js` | Scène 3D du hero de l'accueil (source : le site charge `hero.min.js`, avec three.js) |
| `models/ilot.glb` | L'îlot exporté de Blender, optimisé (Draco, texture WebP) |
| `js/draco/` | Décodeur Draco de three.js, servi par le site |
| `fonts/manrope-*.woff2` | La police Manrope (fichiers de Google Fonts), servie par le site |
| `outils/` | Construction : scripts minifiés, versions des fichiers, optimisation du modèle |
| `vercel.json`, `.vercelignore` | Cache d'un an des fichiers versionnés ; ce qui n'est pas mis en ligne |
| `js/apropos.js` | Du hero à l'À propos, au défilement : la course, l'À propos (mots, photo) |
| `images/teampic.webp` | Photo de l'équipe (À propos) |
| `blender/` | Scène du hero et scripts (îlot, objets, export web) |

## Lancer le site

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Construire (après chaque modification)

Le site charge des fichiers **construits** à partir des sources : `js/hero.min.js` (hero.js, papillons.js,
abeilles.js et three.js en un seul fichier minifié), `js/*.min.js`, `css/style.min.css`. Leurs versions (`?v=…`
dans `index.html`, et celle du modèle) sont tirées de leur contenu : un fichier modifié est rechargé par les
navigateurs, les autres restent en cache.

```bash
cd outils
npm install          # une fois
npm run build        # après chaque modification d'un script ou de la feuille de style
npm run modele       # après chaque export de l'îlot depuis Blender (puis npm run build)
```

`npm run modele` allège `models/ilot.glb` sans changer le rendu : géométrie réencodée en Draco (encodeur
officiel, même précision), texture du sol en WebP sans perte. Il ne s'applique qu'à un export de Blender (un
modèle déjà optimisé n'est pas retraité). Demande `cwebp` (`brew install webp`).
