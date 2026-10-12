// Le hero sur téléphone (et tout écran sans souris), en images fixes : les objets des services posés autour du titre,
// sans 3D ni mouvement (le défilement reste léger, et le modèle de l'îlot n'est pas téléchargé). Chaque image est un
// objet de l'îlot rendu une fois dans sa pose, sur fond transparent (js/herofloat.js : renderSprites, lancé avec
// ?sprites dans l'adresse), puis réduit ; ceux du fond ont leur flou déjà dans l'image. Ils arrivent une seule fois, à
// l'ouverture de la page (css : html.intro). Au défilement, la profondeur se lit comme dans la version 3D : ceux de
// devant montent plus vite que la page, ceux du fond descendent (PARALLAX : la part du défilement) ; seuls les deux
// calques se décalent (une transformation, sans repeindre les images), et seulement tant que le hero est à l'écran.
// [image (images/hero-mobile/), calque, centre (part de la largeur, de la hauteur du hero), largeur de l'image (part
//  de la largeur de l'écran : la taille de l'objet / SPRITE.fill)]
const ITEMS = [
  ['front-00.webp', 'front', 0.1, 0.12, 0.9667],   // échelle
  ['front-01.webp', 'front', 0.84, 0.15, 0.5667],  // plante
  ['front-02.webp', 'front', 0.52, 0.2, 0.3667],   // marteau
  ['front-03.webp', 'front', 0.02, 0.33, 0.4333],  // seau
  ['front-04.webp', 'front', 1, 0.68, 0.5333],     // caisse à outils
  ['front-05.webp', 'front', 0.02, 0.69, 0.4333],  // sac de courses
  ['front-06.webp', 'front', 0.17, 0.87, 0.7],     // tondeuse
  ['front-07.webp', 'front', 0.85, 0.88, 0.6667],  // carton ouvert
  ['back-08.webp', 'back', 0.3, 0.3, 0.4333],      // diable
  ['back-09.webp', 'back', 0.74, 0.31, 0.4],       // chaise
  ['back-10.webp', 'back', 0.3, 0.7, 0.6667],      // râteau
  ['back-11.webp', 'back', 0.72, 0.72, 0.2667],    // colis
  ['back-12.webp', 'back', 0.6, 0.06, 0.2833],     // sac poubelle
  ['back-13.webp', 'back', 0.52, 0.8, 0.25],       // pot renversé
  ['back-14.webp', 'back', 0.14, 0.5, 0.2833],     // pulvérisateur
  ['back-15.webp', 'back', 0.9, 0.46, 0.4333],     // taille-haie
];

const PARALLAX = { front: 0.25, back: 0.35 };

export function staticHero(host) {
  document.documentElement.classList.add('heroFloat', 'heroStatic');
  for (const layer of ['back', 'front']) {
    const box = document.createElement('div');
    box.className = `scene__${layer}`;
    box.setAttribute('aria-hidden', 'true');
    ITEMS.filter((it) => it[1] === layer).forEach(([src, , x, y, w], k) => {
      const img = new Image();
      img.src = `images/hero-mobile/${src}`;
      img.alt = '';
      img.decoding = 'async';
      img.style.cssText = `left:${(x * 100).toFixed(2)}%;top:${(y * 100).toFixed(2)}%;width:${(w * 100).toFixed(2)}%;`
        + `--d:${(0.35 + k * 0.07).toFixed(2)}s`;
      box.append(img);
    });
    host.append(box);
  }
  const front = host.querySelector('.scene__front'), back = host.querySelector('.scene__back');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let raf = 0;
  const paint = () => {
    raf = 0;
    const y = Math.max(0, -host.getBoundingClientRect().top);
    if (y > host.offsetHeight * 1.5) return;        // hors de l'écran : plus rien à décaler
    front.style.transform = `translate3d(0, ${(-PARALLAX.front * y).toFixed(1)}px, 0)`;
    back.style.transform = `translate3d(0, ${(PARALLAX.back * y).toFixed(1)}px, 0)`;
  };
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(paint); }, { passive: true });
  paint();
}
