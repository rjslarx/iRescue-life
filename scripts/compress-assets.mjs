import { readdir, readFile, writeFile } from 'node:fs/promises';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import path from 'node:path';

// Build-time compression avoids per-request CPU and never touches API/HTML.
const directory = path.resolve('dist/public/assets');
for (const file of await readdir(directory)) {
  if (!/\.(js|css|svg)$/.test(file)) continue;
  const contents = await readFile(path.join(directory, file));
  await Promise.all([
    writeFile(path.join(directory, `${file}.br`), brotliCompressSync(contents, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 9 },
    })),
    writeFile(path.join(directory, `${file}.gz`), gzipSync(contents, { level: 9 })),
  ]);
}
