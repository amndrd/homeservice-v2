// Avant / après (index.html, .avant-apres) : deux images superposées dans un rectangle aux coins arrondis ; l'« après »
// est découpée à droite d'une barre verticale. Au survol, la barre suit la souris sans qu'on clique, en douceur (elle
// rattrape le pointeur avec un amorti, image par image) ; la souris partie, elle revient lentement au milieu. Au doigt,
// on la fait glisser ; au clavier, les flèches la déplacent (un curseur de plage invisible, pour l'accessibilité).
// Images : images/avant-apres/avant.webp et apres.webp ; tant qu'elles manquent, deux aplats (gris, vert d'eau).
(() => {
  const box = document.querySelector('.ba');
  if (!box) return;
  const range = box.querySelector('.ba__range');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // [raideur du suivi (1/s : plus haut, plus vif), raideur du retour au milieu, marge aux bords (part de la largeur)]
  const EASE = { follow: 9, home: 3, edge: 0.02 };
  let cur = 0.5, target = 0.5, stiff = EASE.follow, raf = 0, last = 0;

  // les images : une image absente laisse son aplat
  for (const img of box.querySelectorAll('.ba__layer img')) {
    const layer = img.closest('.ba__layer');
    if (img.complete && img.naturalWidth) layer.classList.add('has-img');
    img.addEventListener('load', () => layer.classList.add('has-img'));
    img.addEventListener('error', () => img.remove());
  }

  function paint() {
    box.style.setProperty('--pos', `${(cur * 100).toFixed(3)}%`);
    range.value = String(Math.round(cur * 100));
  }
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    cur += (target - cur) * (reduced ? 1 : 1 - Math.exp(-dt * stiff));
    if (Math.abs(target - cur) < 1e-4) cur = target;
    paint();
    if (cur !== target) raf = requestAnimationFrame(frame);
  }
  function go(x, k) {
    target = Math.min(1 - EASE.edge, Math.max(EASE.edge, x));
    stiff = k;
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  const at = (e) => { const r = box.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
  // souris : la barre suit sans clic ; au doigt : elle suit le glissé
  box.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || e.buttons) go(at(e), EASE.follow);
  });
  box.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') go(at(e), EASE.follow); });
  box.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') go(0.5, EASE.home); });
  range.addEventListener('input', () => go(+range.value / 100, EASE.follow));
  paint();
})();
