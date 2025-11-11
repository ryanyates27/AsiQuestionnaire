// run: node dev-check.mjs
import { engineFilesOk, embedAll, chatWithContext } from './electron/BundledAIService.js';

console.log('files ok?', engineFilesOk());   // expect true

const v = await embedAll('hello world');     // should return [Float32Array]
console.log('embed dim:', v[0].length);

const sys = 'You answer concisely.';
const usr = 'Say "ready" if you can read context.';
console.log(await chatWithContext(sys, usr));
