// La carte « Sur mesure » (index.html, .sur) : la carte holographique noire de la section « licence » du site
// Harborview (Projets/Harborview/assets/license-card.js, lui-même repris de heroui.pro), seule, sans l'éventail ni
// sa navigation, et posée à l'horizontale. Le comportement au survol est repris à l'identique :
//   - la position du pointeur en pour-cent de la carte, bornée à [0, 100] et arrondie ;
//   - la rotation vaut ∓(position − 50) / 3.5, soit ±14,3° dans les coins ;
//   - le halo de brillance suit le pointeur, ses fonds vont plus vite que lui : 37 + x/100 × 26 et 33 + y/100 × 34 ;
//   - la carte grossit de 5 %, l'opacité de la brillance (et de l'ombre) passe de 0 à 1 ;
//   - le texte dérive de rotation / 1.8 (px), en sens inverse sur y ;
//   - deux ressorts : { raideur 180, amortissement 28 } à l'aller, { 120, 22 } au retour (plus mous).
// La boucle ne tourne que lorsqu'une valeur n'est pas au repos et que la carte est à l'écran.
(() => {
  const wrap = document.querySelector('.sur-card');
  if (!wrap) return;
  const rot = wrap.querySelector('.sur-card__rotator');
  const id = wrap.querySelector('.sur-card__id'), meta = wrap.querySelector('.sur-card__meta');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const VERS = { k: 180, c: 28 }, RETOUR = { k: 120, c: 22 };
  const DIV = 3.5, PARA = 18 / 10, REPOS = 0.01, DT_MAX = 1 / 30;
  const borne = (v, a, b) => (v < a ? a : v > b ? b : v);

  // un ressort amorti, masse 1 (l'équation de Framer Motion, intégrée à la main)
  class Ressort {
    constructor(v0) { this.v = v0; this.cible = v0; this.vit = 0; this.ress = RETOUR; }
    pas(dt) {
      const d = this.v - this.cible;
      if (Math.abs(d) < REPOS && Math.abs(this.vit) < REPOS) { this.v = this.cible; this.vit = 0; return false; }
      this.vit += (-this.ress.k * d - this.ress.c * this.vit) * dt;
      this.v += this.vit * dt;
      return true;
    }
  }
  const rotY = new Ressort(0), rotX = new Ressort(0), ptrX = new Ressort(50), ptrY = new Ressort(50),
    lueur = new Ressort(0), fondX = new Ressort(50), fondY = new Ressort(50), echelle = new Ressort(1);
  const toutes = [rotY, rotX, ptrX, ptrY, lueur, fondX, fondY, echelle];
  let running = false, frame = 0, dernier = 0, envue = true;

  function viser(ress, liste) {
    for (const r of toutes) r.ress = ress;
    for (const [r, v] of liste) r.cible = v;
    lancer();
  }
  function bouge(e) {
    const r = rot.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const nx = borne(Math.round(100 / r.width * (e.clientX - r.left)), 0, 100);
    const ny = borne(Math.round(100 / r.height * (e.clientY - r.top)), 0, 100);
    viser(VERS, [[rotY, -((nx - 50) / DIV)], [rotX, (ny - 50) / DIV], [ptrX, nx], [ptrY, ny], [lueur, 1],
      [fondX, 37 + nx / 100 * 26], [fondY, 33 + ny / 100 * 34], [echelle, 1.05]]);
  }
  function quitte() {
    viser(RETOUR, [[rotY, 0], [rotX, 0], [ptrX, 50], [ptrY, 50], [lueur, 0], [fondX, 50], [fondY, 50], [echelle, 1]]);
  }
  function peindre() {
    wrap.style.setProperty('--sur-x', `${ptrX.v.toFixed(2)}%`);
    wrap.style.setProperty('--sur-y', `${ptrY.v.toFixed(2)}%`);
    wrap.style.setProperty('--sur-bg-x', `${fondX.v.toFixed(2)}%`);
    wrap.style.setProperty('--sur-bg-y', `${fondY.v.toFixed(2)}%`);
    wrap.style.setProperty('--sur-opacity', lueur.v.toFixed(3));
    wrap.style.transform = `scale(${echelle.v.toFixed(4)})`;
    rot.style.transform = `rotateX(${rotX.v.toFixed(3)}deg) rotateY(${rotY.v.toFixed(3)}deg)`;
    const dx = (rotY.v / PARA).toFixed(2), dy = (-rotX.v / PARA).toFixed(2);
    id.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px) translateZ(1rem)`;
    meta.style.transform = `translateX(-50%) translate(${dx}px, ${dy}px) translateZ(1rem)`;
  }
  function tick(t) {
    const dt = dernier ? Math.min((t - dernier) / 1000, DT_MAX) : 1 / 60;
    dernier = t;
    let vivant = false;
    for (const r of toutes) if (r.pas(dt)) vivant = true;
    peindre();
    if (vivant && envue) frame = requestAnimationFrame(tick);
    else { running = false; dernier = 0; }
  }
  function lancer() {
    if (running || reduced || !envue) { if (reduced) peindre(); return; }
    running = true; dernier = 0;
    frame = requestAnimationFrame(tick);
  }

  wrap.addEventListener('mousemove', (e) => { if (!reduced) bouge(e); });
  wrap.addEventListener('mouseleave', quitte);
  new IntersectionObserver(([e]) => {
    envue = e.isIntersecting;
    if (envue) lancer(); else { cancelAnimationFrame(frame); running = false; }
  }, { rootMargin: '20% 0px' }).observe(wrap);
  peindre();
})();
