require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const { WebSocketServer } = require('ws');

const { ConnectionManager } = require('./connectionManager');
const {
  readConnection,
  writeConnection,
  publicView,
  getActiveConnection,
  getActiveConnectionFromHeader,
} = require('./connections');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

const connectionManager = new ConnectionManager();

app.get('/api/dev-defaults', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.json({ apiKey: isProd ? null : process.env.TELEVIC_API_KEY || null });
});

app.get('/api/connection', (req, res) => {
  res.json(publicView(readConnection(req)));
});

// Also used to edit the single connection in place: any field left blank
// keeps its existing value, so the settings modal can change just the IP
// (or just rotate the key) without re-entering everything.
app.put('/api/connection', async (req, res) => {
  const existing = readConnection(req);
  const ip = (req.body?.ip || '').trim() || existing?.ip;
  const apiKey = (req.body?.apiKey || '').trim() || existing?.apiKey;

  if (!ip || !apiKey) {
    return res.status(400).json({ error: 'IP address and API key are required.' });
  }

  try {
    await connectionManager.testConnection(ip, apiKey);
  } catch (err) {
    return res.status(502).json({ error: `Could not connect to the unit: ${err.message}` });
  }

  const connection = { ip, apiKey };
  writeConnection(res, connection);
  res.json(publicView(connection));
});

app.get('/api/seats', async (req, res) => {
  const active = getActiveConnection(req);
  if (!active) return res.status(400).json({ error: 'No connection configured.' });

  try {
    const seats = await connectionManager.getSeats(active.ip, active.apiKey);
    res.json({ seats });
  } catch (err) {
    res.status(502).json({ error: `Failed to fetch seats: ${err.message}` });
  }
});

app.put('/api/seats/:seat/mic', async (req, res) => {
  const active = getActiveConnection(req);
  if (!active) return res.status(400).json({ error: 'No connection configured.' });

  const seatNumber = Number(req.params.seat);
  const { on } = req.body || {};
  if (!Number.isInteger(seatNumber) || typeof on !== 'boolean') {
    return res.status(400).json({ error: 'Seat must be an integer and the mic state must be true or false.' });
  }

  try {
    await connectionManager.setMicrophone(active.ip, active.apiKey, seatNumber, on);
    res.status(204).end();
  } catch (err) {
    res.status(502).json({ error: `Failed to set microphone: ${err.message}` });
  }
});

app.get('/api/seats/sensitivity', async (req, res) => {
  const active = getActiveConnection(req);
  if (!active) return res.status(400).json({ error: 'No connection configured.' });

  try {
    const values = await connectionManager.getAllSensitivities(active.ip, active.apiKey);
    res.json({ values });
  } catch (err) {
    res.status(502).json({ error: `Failed to fetch sensitivities: ${err.message}` });
  }
});

app.get('/api/seats/:seat/sensitivity', async (req, res) => {
  const active = getActiveConnection(req);
  if (!active) return res.status(400).json({ error: 'No connection configured.' });

  const seatNumber = Number(req.params.seat);
  if (!Number.isInteger(seatNumber)) {
    return res.status(400).json({ error: 'Seat must be an integer.' });
  }

  try {
    const value = await connectionManager.getSensitivity(active.ip, active.apiKey, seatNumber);
    res.json({ value });
  } catch (err) {
    res.status(502).json({ error: `Failed to fetch sensitivity: ${err.message}` });
  }
});

app.put('/api/seats/:seat/sensitivity', async (req, res) => {
  const active = getActiveConnection(req);
  if (!active) return res.status(400).json({ error: 'No connection configured.' });

  const seatNumber = Number(req.params.seat);
  const { value } = req.body || {};
  if (!Number.isInteger(seatNumber) || !Number.isInteger(value) || value < -12 || value > 12) {
    return res
      .status(400)
      .json({ error: 'Seat must be an integer and sensitivity must be a whole number from -12 to 12.' });
  }

  try {
    await connectionManager.setSensitivity(active.ip, active.apiKey, seatNumber, value);
    res.status(204).end();
  } catch (err) {
    res.status(502).json({ error: `Failed to set sensitivity: ${err.message}` });
  }
});

app.post('/api/seats/all-off', async (req, res) => {
  const active = getActiveConnection(req);
  if (!active) return res.status(400).json({ error: 'No connection configured.' });

  try {
    await connectionManager.turnOffMicrophones(active.ip, active.apiKey);
    res.status(204).end();
  } catch (err) {
    res.status(502).json({ error: `Failed to turn off microphones: ${err.message}` });
  }
});

app.post('/api/seats/all-off-except-chair', async (req, res) => {
  const active = getActiveConnection(req);
  if (!active) return res.status(400).json({ error: 'No connection configured.' });

  try {
    await connectionManager.turnOffMicrophones(active.ip, active.apiKey, { exceptRoles: ['chairperson'] });
    res.status(204).end();
  } catch (err) {
    res.status(502).json({ error: `Failed to turn off microphones: ${err.message}` });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') {
    socket.destroy();
    return;
  }

  const active = getActiveConnectionFromHeader(req.headers.cookie);
  if (!active) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.dcernoConnection = active;
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', async (ws) => {
  const { ip, apiKey } = ws.dcernoConnection;
  try {
    const unsubscribe = await connectionManager.subscribe(ip, apiKey, ws);
    ws.on('close', unsubscribe);
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: err.message }));
    ws.close();
  }
});

server.listen(PORT, () => {
  console.log(`D-Cerno dashboard listening on port ${PORT}`);
});
