const cookie = require('cookie');

const CONNECTIONS_COOKIE = 'dcerno_connections';
const ACTIVE_COOKIE = 'dcerno_active';
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  maxAge: TEN_DAYS_MS,
};

function readConnections(req) {
  const raw = req.cookies?.[CONNECTIONS_COOKIE];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readActiveId(req) {
  return req.cookies?.[ACTIVE_COOKIE] || null;
}

function writeConnections(res, connections) {
  res.cookie(CONNECTIONS_COOKIE, JSON.stringify(connections), cookieOptions);
}

function writeActiveId(res, id) {
  if (id) {
    res.cookie(ACTIVE_COOKIE, id, cookieOptions);
  } else {
    res.clearCookie(ACTIVE_COOKIE);
  }
}

function publicView(connections, activeId) {
  return {
    connections: connections.map(({ id, ip }) => ({ id, ip })),
    activeId,
  };
}

function getActiveConnection(req) {
  const activeId = readActiveId(req);
  if (!activeId) return null;
  const connections = readConnections(req);
  return connections.find((c) => c.id === activeId) || null;
}

// For the WebSocket upgrade path, which runs before Express's cookie-parser
// middleware has a chance to run on the raw HTTP request.
function getActiveConnectionFromHeader(cookieHeader) {
  const parsed = cookie.parse(cookieHeader || '');
  const activeId = parsed[ACTIVE_COOKIE];
  if (!activeId) return null;
  const raw = parsed[CONNECTIONS_COOKIE];
  if (!raw) return null;
  try {
    const connections = JSON.parse(raw);
    if (!Array.isArray(connections)) return null;
    return connections.find((c) => c.id === activeId) || null;
  } catch {
    return null;
  }
}

module.exports = {
  readConnections,
  readActiveId,
  writeConnections,
  writeActiveId,
  publicView,
  getActiveConnection,
  getActiveConnectionFromHeader,
};
