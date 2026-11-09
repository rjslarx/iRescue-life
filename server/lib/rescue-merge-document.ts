import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ShufflePet } from './rescue-shuffle-document';

export async function rescueMergeDocument(pets: ShufflePet[]): Promise<string> {
  const root = path.resolve(process.cwd(), 'server/games/rescue-merge');
  const [html, css, script] = await Promise.all([
    readFile(path.join(root, 'index.html'), 'utf8'),
    readFile(path.join(root, 'styles.css'), 'utf8'),
    readFile(path.join(root, 'app.js'), 'utf8'),
  ]);
  const data = JSON.stringify(pets).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const policy = "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js; style-src 'unsafe-inline'; img-src https: data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'";
  return html
    .replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer">`)
    .replace('<link rel="stylesheet" href="styles.css" />', `<style>${css}</style>`)
    .replace('<script src="./app.js"></script>', `<script>window.INITIAL_PETS = ${data};\n${script.replace(/<\/script/gi, '<\\/script')}</script>`);
}
