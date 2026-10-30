// Serwer sygnalizacyjny WebRTC: paruje ekran (display) z telefonem (cam) w "pokojach"
// i przekazuje między nimi wiadomości SDP/ICE. Obraz z kamery NIE przechodzi przez serwer,
// idzie bezpośrednio między urządzeniami (P2P).
import http from 'node:http';
import os from 'node:os';
import { randomInt } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.SIGNAL_PORT ?? 8787);
const MAX_MESSAGE_BYTES = 64 * 1024;
const MAX_MESSAGES_PER_10S = 600;
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bez 0/O, 1/I
const ROOM_RE = /^[A-Z0-9]{6}$/;

/** @type {Map<string, { display: WebSocket | null, cam: WebSocket | null, createdAt: number }>} */
const rooms = new Map();

function newRoomCode() {
  for (let i = 0; i < 50; i++) {
    let code = '';
    for (let j = 0; j < 6; j++) code += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error('Nie udało się wygenerować kodu pokoju');
}

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
    }
  }
  // Prywatne adresy z typowych sieci domowych na początek listy
  const score = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3);
  return out.sort((a, b) => score(a.address) - score(b.address));
}

function send(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/lan') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ addresses: lanAddresses() }));
    return;
  }
  if (req.url === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.room = null;
  ws.role = null;
  ws.msgCount = 0;
  ws.windowStart = Date.now();
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    const now = Date.now();
    if (now - ws.windowStart > 10_000) {
      ws.windowStart = now;
      ws.msgCount = 0;
    }
    if (++ws.msgCount > MAX_MESSAGES_PER_10S) {
      ws.close(1008, 'rate limit');
      return;
    }

    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'create': {
        if (ws.role) return;
        const wanted = typeof msg.room === 'string' ? msg.room.toUpperCase() : null;
        const code = wanted && ROOM_RE.test(wanted) && !rooms.has(wanted) ? wanted : newRoomCode();
        rooms.set(code, { display: ws, cam: null, createdAt: now });
        ws.room = code;
        ws.role = 'display';
        send(ws, { type: 'created', room: code });
        break;
      }
      case 'join': {
        if (ws.role) return;
        const code = typeof msg.room === 'string' ? msg.room.toUpperCase().trim() : '';
        const room = rooms.get(code);
        if (!room || !room.display) {
          send(ws, { type: 'error', code: 'room-not-found', message: 'Nie ma takiego pokoju. Sprawdź kod na ekranie.' });
          return;
        }
        if (room.cam && room.cam !== ws) {
          // Nowy telefon zastępuje poprzedni (np. po odświeżeniu strony)
          send(room.cam, { type: 'error', code: 'replaced', message: 'Inny telefon połączył się z tym ekranem.' });
          room.cam.role = null;
          room.cam.close(4000, 'replaced');
        }
        room.cam = ws;
        ws.room = code;
        ws.role = 'cam';
        send(ws, { type: 'joined', room: code });
        send(room.display, { type: 'peer-joined' });
        send(ws, { type: 'ready' });
        break;
      }
      case 'signal': {
        const room = ws.room ? rooms.get(ws.room) : null;
        if (!room) return;
        const peer = ws.role === 'display' ? room.cam : room.display;
        send(peer, { type: 'signal', data: msg.data });
        break;
      }
      default:
        break;
    }
  });

  ws.on('close', () => {
    const room = ws.room ? rooms.get(ws.room) : null;
    if (!room) return;
    if (ws.role === 'display' && room.display === ws) {
      send(room.cam, { type: 'peer-left' });
      rooms.delete(ws.room);
    } else if (ws.role === 'cam' && room.cam === ws) {
      room.cam = null;
      send(room.display, { type: 'peer-left' });
    }
  });
});

// Heartbeat: zrywa martwe połączenia (np. uśpiony telefon)
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 15_000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`[sig] Serwer sygnalizacyjny na porcie ${PORT}`);
  for (const a of lanAddresses()) console.log(`[sig] Adres w sieci lokalnej (${a.name}): ${a.address}`);
});
