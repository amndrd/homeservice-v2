// Curseur qui suit la souris, repris tel quel du site immersif (homeservice-immersive/web/js/cursor.js), lui-même
// repris du site Harborview (app/main.js, sans GSAP ni jQuery) : un anneau rejoint le
// pointeur avec un léger retard, et son contour se remplit avec la progression dans la page (depuis 3 h, dans le
// sens des aiguilles d'une montre). Le curseur du système reste affiché au centre. Seulement avec une souris, sur
// un écran de plus de 991 px (comme l'original).
(() => {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 992px)');
  const wrap = document.getElementById('cursor');
  if (!wrap) return;
  const cursor = wrap.querySelector('.cursor');
  const main = wrap.querySelector('.cursor-main');
  const circle = wrap.querySelector('.cursor-outline circle');
  const circ = 2 * Math.PI * parseFloat(circle.getAttribute('r'));
  circle.style.strokeDasharray = circ;
  circle.style.strokeDashoffset = circ;

  const FOLLOW = 0.15;                      // part de l'écart rattrapée à chaque image (à 60 images/s)
  const mouse = { x: 0, y: 0 }, pos = { x: 0, y: 0 };
  let ticking = false, shown = false, last = 0, lastRatio = -1;

  function progress() {
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const r = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (r !== lastRatio) { lastRatio = r; circle.style.strokeDashoffset = circ * (1 - r); }
  }
  function place() { main.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`; }
  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
    last = now;
    const k = 1 - Math.pow(1 - FOLLOW, dt * 60);   // même retard quelle que soit la fréquence de l'écran
    pos.x += (mouse.x - pos.x) * k;
    pos.y += (mouse.y - pos.y) * k;
    place();
    if (Math.hypot(mouse.x - pos.x, mouse.y - pos.y) < 0.1) { ticking = false; last = 0; return; }
    requestAnimationFrame(tick);
  }
  function onMove(e) {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (!shown) {                           // première apparition : directement sous le pointeur
      shown = true;
      pos.x = mouse.x; pos.y = mouse.y;
      place();
      progress();
      cursor.classList.add('active');
    }
    if (!ticking) { ticking = true; requestAnimationFrame(tick); }
  }
  function onScroll() { if (shown) progress(); }
  function onLeave() { shown = false; cursor.classList.remove('active'); }

  function enable(on) {
    const m = on ? 'addEventListener' : 'removeEventListener';
    window[m]('mousemove', onMove, { passive: true });
    window[m]('scroll', onScroll, { passive: true });
    window[m]('resize', onScroll, { passive: true });
    document.documentElement[m]('mouseleave', onLeave);
    if (!on) onLeave();
  }
  enable(fine.matches);
  fine.addEventListener('change', (e) => enable(e.matches));
})();
