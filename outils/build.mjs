// Construction du site : ce que le navigateur charge est produit ici à partir des sources (lisibles, commentées).
// - js/hero.js et ses modules (papillons, abeilles, chiffres) + three.js et ses chargeurs → un seul fichier js/hero.min.js,
//   minifié, sans les parties de three.js inutilisées (plus de CDN : tout vient du site) ;
// - le décodeur Draco de three.js → js/draco/ (servi par le site) ;
// - les autres scripts et la feuille de style → *.min.js, style.min.css ;
// - les versions (?v=…) des fichiers dans index.html, et celles du modèle et des images du hero du téléphone dans
//   hero.min.js, sont tirées de leur
//   contenu : un fichier modifié change d'adresse, le navigateur le recharge ; inchangé, il le garde en cache
//   (vercel.json : cache d'un an).
// Usage, depuis ce dossier : npm install (une fois), puis npm run build — à relancer après chaque modification
// (scripts, feuille de style ou nouvel export du modèle).
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seo } from './seo.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..');
const three = join(here, 'node_modules', 'three');
const version = (f) => createHash('sha256').update(readFileSync(join(site, f))).digest('hex').slice(0, 10);
// les images du hero du téléphone (js/herostatic.js) : leur version aussi, sinon une image refaite reste en cache
const sprites = Object.fromEntries(readdirSync(join(site, 'images/hero-mobile')).filter((f) => f.endsWith('.webp'))
  .map((f) => [f, version(`images/hero-mobile/${f}`)]));

// le hero : un petit point d'entrée (js/entree.js → hero.min.js) qui pose le hero du téléphone tout de suite, et le
// reste (js/hero.js et three.js) en morceau à part, chargé ensuite (js/chunks/, nom tiré du contenu : cache sûr)
rmSync(join(site, 'js/chunks'), { recursive: true, force: true });
const heroBuild = await build({
  entryPoints: [{ in: join(site, 'js/entree.js'), out: 'hero.min' }],
  outdir: join(site, 'js'), splitting: true, chunkNames: 'chunks/[name]-[hash]', metafile: true,
  bundle: true, minify: true, format: 'esm', target: 'es2020', legalComments: 'none',
  alias: { 'three/addons': join(three, 'examples/jsm'), three: join(three, 'build/three.module.js') },
  define: { __MODEL__: JSON.stringify(`models/ilot.glb?v=${version('models/ilot.glb')}`),
    __STATS__: JSON.stringify(`models/services.glb?v=${version('models/services.glb')}`),
    __MONDES__: JSON.stringify(`models/minimondes.glb?v=${version('models/minimondes.glb')}`),
    __SPRITES__: JSON.stringify(sprites) },
  logLevel: 'info',
});

mkdirSync(join(site, 'js/draco'), { recursive: true });
for (const f of ['draco_decoder.wasm', 'draco_wasm_wrapper.js'])
  copyFileSync(join(three, 'examples/jsm/libs/draco/gltf', f), join(site, 'js/draco', f));

// la langue et ses traductions (js/langues.js) : un seul fichier
await build({ entryPoints: [join(site, 'js/i18n.js')], outfile: join(site, 'js/i18n.min.js'), bundle: true, format: 'iife',
  minify: true, target: 'es2020', legalComments: 'none', logLevel: 'info' });
for (const f of ['veil', 'apropos', 'avantapres', 'surmesure', 'faq', 'cta', 'footer', 'reserver'])
  await build({ entryPoints: [join(site, `js/${f}.js`)], outfile: join(site, `js/${f}.min.js`), minify: true,
    target: 'es2020', legalComments: 'none', logLevel: 'info' });
// la zone d'intervention et ses données (un seul fichier)
await build({ entryPoints: [join(site, 'js/zone.js')], outfile: join(site, 'js/zone.min.js'), bundle: true, format: 'iife',
  minify: true, target: 'es2020', legalComments: 'none', logLevel: 'info' });
for (const f of ['style', 'reserver'])
  await build({ entryPoints: [join(site, `css/${f}.css`)], outfile: join(site, `css/${f}.min.css`), minify: true,
    logLevel: 'info' });

// les versions dans les pages : l'accueil, et la page de réservation d'un appel
const pages = {
  'index.html': ['js/hero.min.js', 'js/veil.min.js', 'js/i18n.min.js', 'js/apropos.min.js', 'js/avantapres.min.js',
    'js/surmesure.min.js', 'js/faq.min.js', 'js/footer.min.js', 'js/cta.min.js', 'js/zone.min.js', 'css/style.min.css', 'models/ilot.glb'],
  'reserver.html': ['js/veil.min.js', 'js/i18n.min.js', 'js/reserver.min.js', 'css/style.min.css', 'css/reserver.min.css'],
};
for (const [p, files] of Object.entries(pages)) {
  const page = join(site, p);
  let html = readFileSync(page, 'utf8');
  for (const f of files) {
    const re = new RegExp(`${f.replace(/\./g, '\\.')}\\?v=[\\w-]+`, 'g');
    if (!re.test(html)) throw new Error(`${f} absent de ${p}`);
    html = html.replace(re, `${f}?v=${version(f)}`);
  }
  if (p === 'index.html') {                         // le morceau du hero (nom tiré de son contenu), préchargé sur ordinateur
    const chunk = Object.keys(heroBuild.metafile.outputs).map((f) => f.split('/js/').pop()).find((f) => /^chunks\/hero-.*\.js$/.test(f));
    if (!/js\/chunks\/hero-[\w]+\.js/.test(html)) throw new Error('préchargement du morceau du hero absent de index.html');
    html = html.replace(/js\/chunks\/hero-[\w]+\.js/, `js/${chunk}`);
  }
  writeFileSync(page, html);
  console.log(`${p} : versions à jour`);
}

// le référencement : en-têtes des pages, pages néerlandaises, robots.txt, sitemap.xml (outils/seo.mjs)
seo(site);
