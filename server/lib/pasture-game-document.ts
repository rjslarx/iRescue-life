import { readFile } from 'node:fs/promises';
import path from 'node:path';

let documentPromise: Promise<string> | undefined;

/** Private server assets, never mounted as a public static directory.
 * Returned only after authorization. No donor identity or credentials are embedded.
 * The parent MUST use sandbox="allow-scripts" without allow-same-origin.
 */
export function pastureGameDocument(): Promise<string> {
  if (!documentPromise) {
    documentPromise = buildDocument().catch(error => {
      documentPromise = undefined;
      throw error;
    });
  }
  return documentPromise;
}

async function buildDocument() {
  const root = path.resolve(process.cwd(), 'server/games/pasture-run');
  let html = await readFile(path.join(root, 'index.html'), 'utf8');
  const css = await readFile(path.join(root, 'css/style.css'), 'utf8');
  html = html.replace('<link rel="stylesheet" href="css/style.css" />', `<style>${css}</style>`);
  for (const name of ['sound', 'textures', 'game']) {
    const js = await readFile(path.join(root, `js/${name}.js`), 'utf8');
    html = html.replace(`<script src="js/${name}.js"></script>`, `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
  }
  // No network calls, forms, plugins, popups or access to the parent origin.
  const policy = "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'";
  return html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer">`);
}
