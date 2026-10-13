import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { Lobby } from './rooms.ts';

const PORT = Number(process.env.PORT ?? 3000);
const DIST = path.resolve('dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200).end('ok');
    return;
  }
  let file = path.join(DIST, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404).end('Run `npm run build` first, or use `npm run dev`.');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const lobby = new Lobby();
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => lobby.connect(ws));

// Keep connections alive through proxies.
setInterval(() => {
  for (const ws of wss.clients) ws.ping();
}, 25_000);

server.listen(PORT, () => console.log(`Multicatan server on http://localhost:${PORT}`));
