import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = path.dirname(fileURLToPath(import.meta.url));
await Promise.all(['', 'photorealistic'].map(async (style) => build({
  entryPoints: [path.join(directory, style, 'app.ts')],
  outfile: path.join(directory, style, 'app.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
})));
console.log('Classic and photorealistic Rescue Vend machines bundled.');
