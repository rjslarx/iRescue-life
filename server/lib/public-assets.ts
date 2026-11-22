import express, { type Express } from 'express';
import path from 'node:path';
import fs from 'node:fs';

// Only Vite's content-addressed public files can receive immutable caching.
// Mount before sessions/tenant resolution so these responses never set cookies.
export function servePublicAssets(app: Express, directory: string) {
  const staticAssets = express.static(directory, {
    index: false,
    redirect: false,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  });
  app.use('/assets', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const filename = req.path.slice(1);
    if (!/^[\w.-]+-[\w-]{8,}\.(js|css|svg|png|jpe?g|webp|gif|avif|ico|woff2?|ttf|otf|mp4|webm|mp3|wav)$/i.test(filename)) {
      return res.status(404).set('Cache-Control', 'no-store').end();
    }
    if (!fs.existsSync(path.join(directory, filename))) {
      return res.status(404).set('Cache-Control', 'no-store').end();
    }
    res.vary('Accept-Encoding');
    const encoding = req.acceptsEncodings('br', 'gzip', 'identity');
    const suffix = encoding === 'br' ? '.br' : encoding === 'gzip' ? '.gz' : '';
    const originalUrl = req.url;
    if (suffix && fs.existsSync(path.join(directory, filename + suffix))) {
      res.type(path.extname(filename));
      res.set('Content-Encoding', encoding as string);
      req.url = `/${filename}${suffix}`;
    }
    staticAssets(req, res, error => {
      req.url = originalUrl;
      if (error) return next(error);
      res.status(404).set('Cache-Control', 'no-store').end();
    });
  });
}
