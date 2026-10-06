# Cahier des charges — profondeur du hero

État au 7 octobre 2026. Ce document résume le travail de profondeur sur le hero (l'îlot 3D de l'accueil) : ce qui a été demandé, ce qui a été fait, comment c'est réglé et ce qui reste à faire. Il sert à reprendre le travail là où il s'est arrêté.

## Contexte et règles

- **Objectif** : donner de la profondeur et de la vie au hero sans ajouter de contenu. La direction est « la vie qui sort du vide » : un matin de printemps frais et lumineux.
- **Méthode** : une étape à la fois. Chaque étape est montrée (captures et mesures) et validée avant de passer à la suivante.
- **Ordinateur uniquement** : la version téléphone n'aura pas de 3D. Les effets sont actifs si `desktop` vaut vrai dans `js/hero.js`.
- **Événements rares et discrets** : on les remarque, on ne s'y habitue pas.
- **Le blanc de la page reste pur** : aucun halo ni voile sur la page. Chaque effet a été vérifié pixel par pixel au-dessus de l'îlot, avec une différence de 0.
- **Ne pas redessiner un élément existant sans le demander** (par exemple, les aigrettes gardent le modèle de l'îlot).
- **Commits et push** uniquement sur demande. Un push sur `main` déploie automatiquement sur https://homeservice-test.vercel.app.
- **Refusé** : papillons qui réagissent à la souris, ombre des papillons sur le titre, allers-retours des abeilles hors de l'îlot.

## Les 7 étapes

Les réglages sont des constantes en tête de section dans `js/hero.js`.

### 1. Aigrettes qui s'échappent — validée

Toutes les 9 à 18 s, une ou deux aigrettes de l'îlot se détachent des fleurs. Elles montent, passent devant la description ou le titre (parfois près de l'écran, jamais à moins d'environ 4 m), puis sortent par le haut. Elles gardent le modèle et la matière de l'îlot (`Gabarit · aigrette`).

- Réglages : `ESCAPE`

### 2. Ombre des papillons — validée (îlot uniquement)

Les papillons projettent leur ombre sous le soleil de la scène. Elle est découpée comme les ailes (matériaux de profondeur avec la texture d'aile, dans `js/papillons.js`) et bat avec elles. L'ombre sur le titre a été essayée, puis retirée à la demande.

### 3. Rafales de vent et pétales — validée

Toutes les 22 à 38 s, un front de rafale traverse l'îlot dans le sens de la brise (`uGust`, dans le vent des matériaux) : l'herbe se couche, puis se relève. Quand le front passe, 4 à 6 pétales aux couleurs des fleurs s'envolent en virevoltant, passent pour certains devant le texte et sortent du côté du vent.

- Réglages : `RAFALE`, `PETAL_COLORS`

### Intermède : flore et buissons refaits — validé

**Fleurs** : 10 espèces dans `blender/scripts/flore.py` : coquelicot, bleuet, marguerite, bouton d'or, lavande, églantine, campanule, trèfle, pissenlit et myosotis. Elles ont des tiges courbes, des feuilles, des pétales en dégradé et des cœurs en relief.

**Herbe** : touffes de brins courbés et graminées.

**Buissons** : trois variétés, feuillu, à baies et fleuri, avec des feuilles en écailles.

**Remplacement dans l'îlot**, aux mêmes places :
- `remplace_flore.py` crée l'objet `Îlot · Flore` (fleurs ×1,35, tiges ×0,78, brins ×1,6) ;
- `remplace_buissons.py` remplace `Îlot · Buissons`.

**Planches de présentation** : `planche_flore.py`, `planche_buissons.py`.

**Couleurs** : sous l'éclairage AgX, les jaunes blanchissent. Il faut prendre des jaunes tirant sur le vert (par exemple `#d8c400`).

**Poids** : le modèle du site (`models/ilot.glb`) pèse environ 5,4 Mo.

### 4. Abeilles qui butinent — validée

**Modèle** : `js/abeilles.js`. Abeille domestique réaliste, ambre doré à bandes brun sombre, ailes claires repliées une fois posée.

**Fleurs** : `blender/scripts/tetes.py` relève la place et la couleur de chaque fleur dans `Îlot · Flore` (propriété `tetes`, filtrée à l'export). Le site lit ces données.

**Comportement** : trois abeilles.
- Elles restent fidèles à une couleur de fleur pendant leur tournée.
- Elles vont de fleur voisine en fleur voisine, plutôt vers l'avant, sans revenir sur une fleur récente ni prendre celle d'une autre abeille.
- Elles inspectent la fleur en vol stationnaire et en refusent environ une sur cinq.
- Elles se posent pour butiner, puis changent de coin au bout de 8 à 14 fleurs.
- Elles ne quittent jamais l'îlot.
- Elles survolent les objets : hauteur de passage calculée à partir des boîtes des objets du tas, plus une répulsion. Les fleurs placées sous un objet sont exclues.
- Leur cap suit la trajectoire, pas le zigzag, avec un virage limité ; posées, elles oscillent autour de leur cap.

**Réglages** : `BEE`

### 5. Lumière du matin (rai) — validée

**Faisceau** : un cône dans l'axe du spot `Rai` de `hero.blend`, en lumière ajoutée multipliée par l'alpha de la toile, donc rien sur la page. Il est plus dense au cœur, se dissout vers le haut et se fond près du sol (pas de bord net). Une brume dérive à l'intérieur. Il se lève dès le début de l'apparition de l'îlot.

**Pollen** : il brille quand il traverse le faisceau (dans `pollenMat`).

**Réglages** : `SHAFT`

### 6. Voile de brume sur le fond — validée

**Principe** : perspective atmosphérique avec `scene.fog`, vers la couleur de la page. Le voile commence 0,5 m au-delà du centre de l'îlot et atteint 30 % au bord du fond.

**Point technique** : le sol remultiplie son alpha après `fog_fragment`, sinon la page serait colorée.

**Réglages** : `MIST`

### 7. Profondeur de champ légère — en cours, à valider

**Principe** : la scène est rendue hors écran, telle qu'elle s'affiche, avec sa profondeur. Un flou de mise au point la recompose ensuite (48 échantillons, en couleurs prémultipliées).
- **Mise au point** sur le centre de l'îlot.
- **Fond** à peine adouci (1 à 2 px), **avant** presque net.
- **Éléments très proches** (papillons, aigrettes, pétales) franchement flous, jusqu'à 12 px.
- **Le flou de l'îlot ne déborde jamais sur la page** : seuls les éléments très proches y étalent un peu de flou.

**Points techniques** :
- Hors écran, three ne fait ni le mappage des tons ni la conversion sRGB, et n'inclut pas leurs fonctions. Elles sont ajoutées au code commun des matériaux (`hs_AgXToneMapping`, avec notre look et l'exposition en constante), et les chunks `tonemapping_fragment` et `colorspace_fragment` sont forcés.
- Le pollen et le rai, qui n'utilisent pas ces chunks, restent identiques.

**Vérifié** :
- Sans flou, l'image hors écran est identique au rendu direct.
- La page n'est pas touchée par le flou de l'îlot.
- Le fond est légèrement adouci, l'avant net et le bord net.

**Pas encore vérifié** :
- Le flou d'un papillon qui passe tout près de l'écran (trop lent à capturer sans carte graphique). À regarder en vrai.
- Les performances sur une machine modeste (48 échantillons par pixel).

**Réglages** : `DOF`. Pour désactiver le flou, mettre `dofOn` à faux.

## Reprise

1. Recharger http://localhost:8000/ (serveur sans cache). Le modèle est versionné dans `js/hero.js` (`MODEL = 'models/ilot.glb?v=…'`) : changer la version à chaque export.
2. Valider l'étape 7 en mouvement : flou des papillons proches, intensité du flou du fond, fluidité.
3. Ensuite, au choix : ajustements fins, ou retour aux autres sections du site, que l'utilisatrice reprend une par une (la page s'arrête pour l'instant après l'À propos).

## Chaîne Blender (pour modifier l'îlot)

`blender/hero.blend` est la scène à jour. Pour la faire évoluer, on lance les scripts sur une copie, dans cet ordre :

1. `plat.py`
2. `caisse.py`
3. `panneau.py`
4. `remplace_flore.py`
5. `remplace_buissons.py`
6. `tetes.py`
7. l'export : `Blender -b copie.blend --python blender/scripts/export_web.py`
