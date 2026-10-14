// Avant / après (index.html, .avant-apres) : un carrousel de chantiers, chacun une paire « Avant » | « Après ». La piste
// défile à l'horizontale (au doigt, on glisse d'un chantier à l'autre ; sinon les flèches) ; dessous, la barre de
// progression suit le défilement, le compteur dit où l'on est.
// Les vidéos sont muettes, en boucle, sans commandes : chacune ne joue que lorsqu'elle est à l'écran (son chantier
// affiché et la section visible), repart du début à chaque retour, et ne se télécharge qu'à l'approche de la section
// (preload="none" : d'ici là, son affiche). Avec « réduire les animations », elles restent sur leur affiche.
(() => {
  const ch = document.querySelector('.ch');
  if (!ch) return;
  const piste = ch.querySelector('.ch__piste');
  const chantiers = [...piste.querySelectorAll('.ch__chantier')];
  const [prec, suiv] = ch.querySelectorAll('.ch__nav button');
  const barre = ch.querySelector('.ch__progres');
  const compte = ch.querySelector('.ch__compte b');
  const n = chantiers.length;
  const deux = (i) => String(i).padStart(2, '0');
  ch.querySelector('.ch__compte span').textContent = deux(n);
  if (n < 2) ch.querySelector('.ch__bas').hidden = true;

  // la position : 0 au premier chantier, n - 1 au dernier (fractionnaire pendant le glissé)
  const position = () => {
    const max = piste.scrollWidth - piste.clientWidth;
    return max > 0 ? (piste.scrollLeft / max) * (n - 1) : 0;
  };
  function peint() {
    const p = position(), i = Math.round(p);
    barre.style.setProperty('--p', ((p + 1) / n).toFixed(4));
    compte.textContent = deux(i + 1);
    prec.disabled = i <= 0;
    suiv.disabled = i >= n - 1;
  }
  piste.addEventListener('scroll', peint, { passive: true });
  addEventListener('resize', peint);
  for (const b of [prec, suiv]) b.addEventListener('click', () => {
    const i = Math.min(n - 1, Math.max(0, Math.round(position()) + Number(b.dataset.step)));
    piste.scrollTo({ left: chantiers[i].offsetLeft - piste.offsetLeft, behavior: 'smooth' });
  });
  peint();

  // les médias : leurs adresses attendent dans data-* (index.html) ; elles sont posées quand la section approche (à un
  // écran près), le téléphone recevant ses versions en 560 px (srcset des images, <source media> des vidéos, affiche)
  const petit = matchMedia('(max-width: 760px)');
  let arme = false;
  function armer() {
    if (arme) return;
    arme = true;
    for (const img of piste.querySelectorAll('img[data-src]')) {
      img.srcset = img.dataset.srcset;
      img.src = img.dataset.src;
    }
    for (const v of piste.querySelectorAll('video')) {
      v.poster = (petit.matches && v.dataset.posterMobile) || v.dataset.poster;
      for (const so of v.querySelectorAll('source[data-src]')) so.src = so.dataset.src;
      v.load();                                    // il relit ses sources (preload none : rien n'est téléchargé)
    }
  }
  new IntersectionObserver((entries, o) => {
    if (entries.some((e) => e.isIntersecting)) { o.disconnect(); armer(); }
  }, { rootMargin: '100% 0px' }).observe(ch);

  // les vidéos : chacune repart du début à chaque fois qu'elle revient à l'écran, tourne en boucle tant qu'elle y est,
  // et se met en pause ailleurs. Si le navigateur l'arrête de lui-même (onglet caché, économie d'énergie, mémoire
  // tampon vide…), elle est relancée dès que possible.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const videos = [...piste.querySelectorAll('video')];
  const visibles = new Set();
  const lance = (v) => { armer(); if (v.paused) v.play().catch(() => {}); };
  const vue = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting) {
        if (!visibles.has(v)) { visibles.add(v); v.currentTime = 0; }
        lance(v);
      } else {
        visibles.delete(v);
        v.pause();
      }
    }
  }, { threshold: 0.4 });
  for (const v of videos) {
    v.muted = true;                                // iOS : la lecture automatique n'est permise que muette
    v.addEventListener('pause', () => { if (visibles.has(v) && !document.hidden) setTimeout(() => lance(v), 200); });
    v.addEventListener('ended', () => { if (visibles.has(v)) { v.currentTime = 0; lance(v); } });
    vue.observe(v);
  }
  // la section approche : toutes les vidéos se chargent, pour qu'un changement de chantier démarre aussitôt
  new IntersectionObserver((entries, o) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    o.disconnect();
    armer();
    for (const v of videos) { v.preload = 'auto'; if (v.readyState === 0 && !visibles.has(v)) v.load(); }
  }, { rootMargin: '100% 0px' }).observe(ch);
  // retour sur l'onglet, ou premier geste (iOS en économie d'énergie refuse la lecture sans geste) : on relance
  document.addEventListener('visibilitychange', () => { if (!document.hidden) visibles.forEach(lance); });
  for (const ev of ['touchend', 'click']) document.addEventListener(ev, () => visibles.forEach(lance), { passive: true });
})();
