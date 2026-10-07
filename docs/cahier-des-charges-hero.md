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
- **Refusé** : papillons qui réagissent à la souris, ombre des papillons sur le titre, allers-retours des abeilles hors de l'îlot, profondeur de champ (flou).

## Les 7 étapes

Les réglages sont des constantes en tête de section dans `js/hero.js`.

### 1. Aigrettes qui s'échappent — validée

Toutes les 9 à 18 s, une ou deux aigrettes de l'îlot se détachent des fleurs. Elles montent, passent devant la description ou le titre (parfois près de l'écran, jamais à moins d'environ 4 m), puis sortent par le haut. Elles gardent le modèle et la matière de l'îlot (`Gabarit · aigrette`).

- Réglages : `ESCAPE`

### 2. Ombre des papillons — validée (îlot uniquement)

Les papillons projettent leur ombre sous le soleil de la scène. Elle est découpée comme les ailes (matériaux de profondeur avec la texture d'aile, dans `js/papillons.js`) et bat avec elles. L'ombre sur le titre a été essayée, puis retirée à la demande.

### 3. Rafales de vent et pétales — validée

Toutes les 22 à 38 s, un front de rafale traverse l'îlot dans le sens de la brise (`uGust`, dans le vent des matériaux) : l'herbe se couche, puis se relève. Quand le front atteint une fleur qui s'effeuille, un ou deux pétales s'en détachent, à sa place et du côté où souffle le vent : la base se soulève d'abord, puis le pétale part. Il passe parfois devant le texte et sort du côté du vent.

**Pétales par espèce** (refaits le 7 octobre, cohérents avec la flore) : chaque pétale reprend la forme de `flore.py` (mesures, creux, courbure, échancrure, franges, dégradé de couleur), et chaque espèce a son envol.
- Coquelicot : grand pétale de soie froissé avec la tache noire à la base ; il ondule et culbute lentement.
- Églantine : pétale en cœur, blanc à la base et rose au bord ; il se balance comme une feuille morte.
- Marguerite : languette blanche qui tourne vite sur sa longueur (peu visible sur la page, comme la fleur).
- Bouton d'or : petite coupe brillante qui tourne sur elle-même, creux en bas.
- Bleuet : fleuron en entonnoir frangé qui vole comme un volant, en tournant sur son axe.
- Lavande, pissenlit, myosotis, campanule et trèfle ne s'effeuillent pas.

Pour savoir quelle fleur est où, `tetes.py` reconnaît maintenant l'espèce de chaque fleur d'après sa palette (dix espèces au lieu de six couleurs). Les abeilles restent donc fidèles à une vraie espèce.

- Réglages : `RAFALE`, `PETALE` (forme, chances de s'effeuiller, nombre, allure, envol)

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

**Fleurs** : `blender/scripts/tetes.py` relève la place et l'espèce de chaque fleur dans `Îlot · Flore` (propriété `tetes`, filtrée à l'export). Le site lit ces données.

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

**Poussière du rai** (7 octobre, remplace le pollen doré, jugé gênant : « des petites boules jaunes qui flottent ») : de fins grains clairs qui n'existent que dans le bas du faisceau, là où il passe devant l'îlot. Ils dérivent à peine et scintillent par éclats. Rendus comme le rai (lumière ajoutée × alpha de la toile) : rien sur la page. Réglages : `DUST`.

**Réglages** : `SHAFT`

### 6. Voile de brume sur le fond — validée

**Principe** : perspective atmosphérique avec `scene.fog`, vers la couleur de la page. Le voile commence 0,5 m au-delà du centre de l'îlot et atteint 30 % au bord du fond.

**Point technique** : le sol remultiplie son alpha après `fog_fragment`, sinon la page serait colorée.

**Réglages** : `MIST`

### 7. Profondeur de champ légère — refusée, retirée

Un flou de mise au point (net au centre de l'îlot, fond adouci, éléments très proches flous) a été essayé le 6 octobre, puis retiré le 7 octobre à la demande : « je n'aime pas ». Le rendu est revenu au rendu direct de three.js, sans image hors écran. Le plan des sept étapes est donc terminé.

## Reprise

1. Recharger http://localhost:8000/ (serveur sans cache). Le site charge des fichiers construits : après toute modification, `cd outils && npm run build` (les versions se mettent à jour seules).
2. Ensuite, au choix : ajustements fins, ou retour aux autres sections du site, que l'utilisatrice reprend une par une (la page s'arrête pour l'instant après l'À propos).

## Chaîne Blender (pour modifier l'îlot)

`blender/hero.blend` est la scène à jour. Pour la faire évoluer, on lance les scripts sur une copie, dans cet ordre :

1. `plat.py`
2. `caisse.py`
3. `panneau.py`
3 bis. `tondeuse.py` (la tondeuse reposée sur ses quatre roues, 7 octobre)
4. `remplace_flore.py`
5. `remplace_buissons.py`
6. `tetes.py`
7. l'export : `Blender -b copie.blend --python blender/scripts/export_web.py`
8. l'optimisation et la construction du site : `cd outils && npm run modele && npm run build`
