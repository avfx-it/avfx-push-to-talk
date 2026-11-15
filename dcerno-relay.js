#!/usr/bin/env node
// Serves index.html and forwards its /api/* calls to the D-Cerno unit, so the
// unit doesn't need CORS headers. Run: node dcerno-relay.js  (Node 18+)

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const PAGE = path.join(__dirname, 'index.html');
const UNIT_TIMEOUT_MS = 70000;

// Only private LAN addresses are allowed, so the relay can't be used as an open proxy.
function isPrivateIp(ip) {
  const octets = ip.split('.').map(Number);
  if (octets.some(n => n > 255)) return false;

  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254)
  );
}

// The page sends the unit's address as "ip:port" in the X-Dcerno-Target header.
function parseTarget(header) {
  const match = String(header || '').match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/);
  if (!match) return null;

  const [, host, port] = match;
  if (!isPrivateIp(host)) return null;

  return { host, port: Number(port) };
}

function servePage(res) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  fs.createReadStream(PAGE).pipe(res);
}

function forwardToUnit(req, res, target) {
  const headers = { ...req.headers, host: `${target.host}:${target.port}` };
  delete headers['x-dcerno-target'];

  const upstream = http.request(
    { host: target.host, port: target.port, path: req.url, method: req.method, headers },
    unitRes => {
      res.writeHead(unitRes.statusCode, unitRes.headers);
      unitRes.pipe(res);
    }
  );

  upstream.setTimeout(UNIT_TIMEOUT_MS, () => upstream.destroy());

  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });

  // If the browser closes the page, drop the long-poll to the unit too.
  res.on('close', () => {
    if (!res.writableEnded) upstream.destroy();
  });

  req.pipe(upstream);
}

function handleRequest(req, res) {
  if (req.url === '/' || req.url === '/index.html') {
    return servePage(res);
  }

  if (!req.url.startsWith('/api/')) {
    res.writeHead(404);
    return res.end();
  }

  const target = parseTarget(req.headers['x-dcerno-target']);
  if (!target) {
    res.writeHead(400);
    return res.end('Bad or non-LAN X-Dcerno-Target');
  }

  forwardToUnit(req, res, target);
}

http.createServer(handleRequest).listen(PORT, () => {
  console.log(`D-Cerno relay + dashboard on http://localhost:${PORT}`);
});
