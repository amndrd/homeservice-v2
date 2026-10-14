// Le point d'entrée du hero (construit en js/hero.min.js par outils/build.mjs).
// Sur téléphone (et tout écran sans souris), le hero n'est que des images fixes (js/herostatic.js) : elles sont posées
// tout de suite, sans attendre three.js. Le reste (three.js, l'îlot, les chiffres, les mini-mondes des services : js/hero.js,
// un morceau à part, ~770 Ko) n'est chargé qu'une fois la page affichée — il ne retarde plus son ouverture.
// Sur ordinateur, l'îlot 3D est le hero : tout est chargé aussitôt, comme avant.
import { staticHero } from './herostatic.js';

const desktop = matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)').matches;   // = js/hero.js
const sprites = location.search.includes('sprites');    // l'outil d'export des images du téléphone : il lui faut la 3D
if (!desktop && !sprites) {
  staticHero(document.getElementById('hero-scene'));
  window.__heroStatic = true;
  window.__heroReady = true;
  queueMicrotask(() => window.dispatchEvent(new Event('hero:ready')));
  const suite = () => setTimeout(() => import('./hero.js'), 0);
  if (document.readyState === 'complete') suite();
  else addEventListener('load', suite, { once: true });
} else {
  import('./hero.js');
}
