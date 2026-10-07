// Construction du site : ce que le navigateur charge est produit ici à partir des sources (lisibles, commentées).
// - js/hero.js et ses modules (papillons, abeilles) + three.js et ses chargeurs → un seul fichier js/hero.min.js,
//   minifié, sans les parties de three.js inutilisées (plus de CDN : tout vient du site) ;
// - le décodeur Draco de three.js → js/draco/ (servi par le site) ;
// - les autres scripts et la feuille de style → *.min.js, style.min.css ;
// - les versions (?v=…) des fichiers dans index.html, et celle du modèle dans hero.min.js, sont tirées de leur
//   contenu : un fichier modifié change d'adresse, le navigateur le recharge ; inchangé, il le garde en cache
//   (vercel.json : cache d'un an).
// Usage, depuis ce dossier : npm install (une fois), puis npm run build — à relancer après chaque modification
// (scripts, feuille de style ou nouvel export du modèle).
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..');
const three = join(here, 'node_modules', 'three');
const version = (f) => createHash('sha256').update(readFileSync(join(site, f))).digest('hex').slice(0, 10);

await build({
  entryPoints: [join(site, 'js/hero.js')],
  outfile: join(site, 'js/hero.min.js'),
  bundle: true, minify: true, format: 'esm', target: 'es2020', legalComments: 'none',
  alias: { 'three/addons': join(three, 'examples/jsm'), three: join(three, 'build/three.module.js') },
  define: { __MODEL__: JSON.stringify(`models/ilot.glb?v=${version('models/ilot.glb')}`) },
  logLevel: 'info',
});

mkdirSync(join(site, 'js/draco'), { recursive: true });
for (const f of ['draco_decoder.wasm', 'draco_wasm_wrapper.js'])
  copyFileSync(join(three, 'examples/jsm/libs/draco/gltf', f), join(site, 'js/draco', f));

for (const f of ['veil', 'i18n', 'apropos'])
  await build({ entryPoints: [join(site, `js/${f}.js`)], outfile: join(site, `js/${f}.min.js`), minify: true,
    target: 'es2020', legalComments: 'none', logLevel: 'info' });
await build({ entryPoints: [join(site, 'css/style.css')], outfile: join(site, 'css/style.min.css'), minify: true,
  logLevel: 'info' });

// les versions dans index.html
const page = join(site, 'index.html');
let html = readFileSync(page, 'utf8');
for (const f of ['js/hero.min.js', 'js/veil.min.js', 'js/i18n.min.js', 'js/apropos.min.js', 'css/style.min.css',
  'models/ilot.glb']) {
  const re = new RegExp(`${f.replace(/\./g, '\\.')}\\?v=[\\w-]+`, 'g');
  if (!re.test(html)) throw new Error(`${f} absent de index.html`);
  html = html.replace(re, `${f}?v=${version(f)}`);
}
writeFileSync(page, html);
console.log('index.html : versions à jour');
