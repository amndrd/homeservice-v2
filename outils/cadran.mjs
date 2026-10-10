// Les chiffres du cadran (troisième chiffre, 24 h, creusé dans le mur : js/statsmur.js) : leurs contours, tirés de la
// police du site (fonts/manrope-800.typeface.json), écrits dans js/cadran.js. Usage, depuis ce dossier :
// node cadran.mjs (une fois ; à relancer seulement pour changer de police ou de chiffres).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const font = new Font(JSON.parse(readFileSync(join(site, 'fonts/manrope-800.typeface.json'), 'utf8')));
const TEXTS = ['0', '6', '12', '18'], STEPS = 6;
const r = (v) => Math.round(v * 1e4) / 1e4;
const out = {};
for (const t of TEXTS) {
  // à la hauteur 1 (celle d'un chiffre), centré
  const shapes = font.generateShapes(t, 1);
  const polys = shapes.map((s) => {
    const { shape, holes } = s.extractPoints(STEPS);
    return [shape, ...holes].map((ring) => {
      const pts = ring.map((p) => [p.x, p.y]);
      if (pts.length > 1 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 1e-6) pts.pop();
      return pts;
    });
  });
  const all = polys.flat(2);
  const x0 = Math.min(...all.map((p) => p[0])), x1 = Math.max(...all.map((p) => p[0]));
  const y0 = Math.min(...all.map((p) => p[1])), y1 = Math.max(...all.map((p) => p[1]));
  const h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  out[t] = polys.map((rings) => rings.map((ring) => ring.map(([x, y]) => [r((x - cx) / h), r((y - cy) / h)])));
}
writeFileSync(join(site, 'js/cadran.js'), [
  "// Les chiffres du cadran (troisième chiffre, 24 h, creusé dans le mur : js/statsmur.js), en Manrope 800 : pour",
  "// chacun, ses polygones (un contour, puis ses trous), centrés, à la hauteur 1. Écrit par outils/cadran.mjs.",
  `export const CHIFFRES = ${JSON.stringify(out)};`, ''].join('\n'));
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.map((p) => p.map((q) => q.length))])));
