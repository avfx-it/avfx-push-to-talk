const cookie = require('cookie');

const CONNECTION_COOKIE = 'dcerno_connection';
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  maxAge: TEN_DAYS_MS,
};

function parseConnection(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.ip && parsed.apiKey ? parsed : null;
  } catch {
    return null;
  }
}

function readConnection(req) {
  return parseConnection(req.cookies?.[CONNECTION_COOKIE]);
}

function writeConnection(res, connection) {
  res.cookie(CONNECTION_COOKIE, JSON.stringify(connection), cookieOptions);
}

function clearConnection(res) {
  res.clearCookie(CONNECTION_COOKIE);
}

function publicView(connection) {
  return { ip: connection?.ip || null };
}

function getActiveConnection(req) {
  return readConnection(req);
}

// For the WebSocket upgrade path, which runs before Express's cookie-parser
// middleware has a chance to run on the raw HTTP request.
function getActiveConnectionFromHeader(cookieHeader) {
  const parsed = cookie.parse(cookieHeader || '');
  return parseConnection(parsed[CONNECTION_COOKIE]);
}

module.exports = {
  readConnection,
  writeConnection,
  clearConnection,
  publicView,
  getActiveConnection,
  getActiveConnectionFromHeader,
};
