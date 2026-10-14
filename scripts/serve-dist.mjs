#!/usr/bin/env node
// Static server with SPA fallback for the Expo web export (apps/mobile/dist).
// Usage: node scripts/serve-dist.mjs [dir=apps/mobile/dist] [port=3000]
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? 'apps/mobile/dist');
const port = Number(process.argv[3] ?? 3000);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let file = join(dir, normalize(decodeURIComponent(url.pathname)));
  if (!file.startsWith(dir)) file = join(dir, 'index.html');
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serve-dist: http://localhost:${port} → ${dir}`));
