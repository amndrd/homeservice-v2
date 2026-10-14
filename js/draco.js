// Un seul décodeur Draco pour tout le site (l'îlot, les mini-mondes des services, les chiffres) : son module wasm
// n'est téléchargé et compilé qu'une fois (chaque DRACOLoader avait le sien, chargé en double sur téléphone).
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export const draco = new DRACOLoader().setDecoderPath('js/draco/');
