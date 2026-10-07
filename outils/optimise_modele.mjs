// Allège models/ilot.glb après l'export de Blender (blender/scripts/export_web.py), sans changer ce qu'on voit :
// 1. la géométrie est réencodée avec l'encodeur Draco officiel (méthode edgebreaker, la plus compacte), à la même
//    précision que l'export de Blender (position 14 bits, normale 10, UV 12, couleur 10, souplesse 12) : environ
//    40 % plus léger. Les sommets sont requantifiés (écarts de quelques centièmes de millimètre) : au plus quelques
//    pixels isolés en bordure de feuillage changent, à l'œil rien ;
// 2. la texture du sol passe en WebP sans perte (blender/scripts/optimise_glb.py : pixels visibles identiques).
// Usage, depuis ce dossier : npm run modele   — puis npm run build (la version du modèle change avec son contenu).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const model = join(site, 'models/ilot.glb');
const before = statSync(model).size;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
// une seule fois par export : réencoder un modèle déjà passé ici le requantifierait encore (le générateur se lit
// dans le fichier : glTF-Transform le remplace à la lecture)
const raw = readFileSync(model);
const generator = JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)).toString()).asset.generator || '';
if (!/Blender/.test(generator)) {
  console.log(`déjà optimisé (${generator}) : rien à faire`);
  process.exit(0);
}
const doc = await io.read(model);
doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({
  method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER, encodeSpeed: 0, decodeSpeed: 0,
  quantizationBits: { POSITION: 14, NORMAL: 10, TEXCOORD: 12, COLOR: 10, GENERIC: 12 },
});
await io.write(model, doc);
console.log(`géométrie réencodée : ${(before / 1024) | 0} Ko → ${(statSync(model).size / 1024) | 0} Ko`);

execFileSync('python3', [join(site, 'blender/scripts/optimise_glb.py'), model], { stdio: 'inherit' });
