const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const httpServer = createServer(app);

// Serve built client in production
if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '../client/dist');
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}
const io = new Server(httpServer, { cors: { origin: '*' } });

const rooms = new Map();

const ROLES = ['bass', 'lead', 'melody', 'drums'];
const ROLE_COLORS = { bass: '#6C63FF', lead: '#FF6B6B', melody: '#4ECDC4', drums: '#FF9F43' };
const SECONDS_PER_BAR = 2; // 120 BPM, 4 beats, 2 seconds

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function emptyGrid() {
  return Array.from({ length: 8 }, () => Array(16).fill(false));
}

function cloneGrid(grid) {
  return grid ? grid.map(row => [...row]) : emptyGrid();
}

function sanitizeRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    config: room.config,
    currentBar: room.currentBar,
    players: Object.values(room.players),
    bars: room.bars,
  };
}

function findRoom(socketId) {
  for (const room of rooms.values()) {
    if (room.players[socketId]) return room;
  }
  return null;
}

function clearTimer(room) {
  if (room.timer) {
    clearInterval(room.timer);
    clearTimeout(room.timer);
    room.timer = null;
  }
}

function assignRole(room) {
  const counts = Object.fromEntries(ROLES.map(r => [r, 0]));
  Object.values(room.players).forEach(p => counts[p.role]++);
  return ROLES.reduce((a, b) => counts[a] <= counts[b] ? a : b);
}

function startPainting(room) {
  clearTimer(room);
  room.phase = 'painting';

  room.doneSet = new Set();

  // Seed each player's grid from their previous bar, or empty for bar 0
  const prevBar = room.currentBar > 0 ? room.bars[room.currentBar - 1] : null;
  room.liveGrids = {};
  for (const id of Object.keys(room.players)) {
    room.liveGrids[id] = prevBar?.[id] ? cloneGrid(prevBar[id].grid) : emptyGrid();
  }

  // startingGrids is keyed by player ID so each client can find their own
  const startingGrids = {};
  for (const [id, grid] of Object.entries(room.liveGrids)) {
    startingGrids[id] = cloneGrid(grid);
  }

  io.to(room.code).emit('phase-change', {
    phase: 'painting',
    currentBar: room.currentBar,
    totalBars: room.config.totalBars,
    duration: room.config.paintDuration,
    startingGrids,
  });

  let remaining = room.config.paintDuration;
  room.timer = setInterval(() => {
    remaining--;
    io.to(room.code).emit('timer-tick', { remaining });
    if (remaining <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      startListening(room);
    }
  }, 1000);
}

function startListening(room) {
  clearTimer(room);
  room.phase = 'listening';

  // Snapshot: bars[barIndex][playerId] = { grid, role }
  const snapshot = {};
  for (const [id, grid] of Object.entries(room.liveGrids)) {
    const player = room.players[id];
    if (player) snapshot[id] = { grid: cloneGrid(grid), role: player.role };
  }
  room.bars[room.currentBar] = snapshot;

  const listenDuration = (room.currentBar + 1) * SECONDS_PER_BAR + 4;

  io.to(room.code).emit('phase-change', {
    phase: 'listening',
    currentBar: room.currentBar,
    totalBars: room.config.totalBars,
    bars: room.bars,
    duration: listenDuration,
  });

  room.timer = setTimeout(() => {
    room.timer = null;
    advance(room);
  }, listenDuration * 1000);
}

function advance(room) {
  clearTimer(room);
  if (room.currentBar >= room.config.totalBars - 1) {
    room.phase = 'finished';
    io.to(room.code).emit('phase-change', { phase: 'finished', bars: room.bars });
  } else {
    room.currentBar++;
    startPainting(room);
  }
}

io.on('connection', (socket) => {
  socket.on('create-room', ({ playerName, config = {} }) => {
    const code = generateCode();
    const room = {
      code,
      hostId: socket.id,
      phase: 'lobby',
      config: {
        totalBars: Math.max(1, Math.min(12, config.totalBars || 6)),
        paintDuration: Math.max(15, Math.min(180, config.paintDuration || 60)),
      },
      currentBar: 0,
      bars: [],
      liveGrids: {},
      players: {},
      timer: null,
    };
    const player = { id: socket.id, name: playerName, role: ROLES[0], color: ROLE_COLORS[ROLES[0]], isHost: true };
    room.players[socket.id] = player;
    rooms.set(code, room);
    socket.join(code);
    socket.emit('room-created', { roomCode: code, player, room: sanitizeRoom(room) });
  });

  socket.on('join-room', ({ roomCode, playerName }) => {
    const code = (roomCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) { socket.emit('error', { message: 'Room not found. Check the code.' }); return; }
    if (room.phase !== 'lobby') { socket.emit('error', { message: 'Game already in progress.' }); return; }

    const role = assignRole(room);
    const player = { id: socket.id, name: playerName, role, color: ROLE_COLORS[role], isHost: false };
    room.players[socket.id] = player;
    socket.join(code);
    socket.emit('room-joined', { roomCode: code, player, room: sanitizeRoom(room) });
    socket.to(code).emit('player-joined', { player });
  });

  socket.on('update-config', ({ totalBars, paintDuration }) => {
    const room = findRoom(socket.id);
    if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;
    if (totalBars != null) room.config.totalBars = Math.max(1, Math.min(12, totalBars));
    if (paintDuration != null) room.config.paintDuration = Math.max(15, Math.min(180, paintDuration));
    io.to(room.code).emit('config-updated', { config: room.config });
  });

  socket.on('start-game', () => {
    const room = findRoom(socket.id);
    if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;
    startPainting(room);
  });

  socket.on('canvas-update', ({ grid }) => {
    const room = findRoom(socket.id);
    if (!room || room.phase !== 'painting') return;
    const player = room.players[socket.id];
    if (!player) return;
    room.liveGrids[socket.id] = grid;
    socket.to(room.code).emit('canvas-update', { playerId: socket.id, grid });
  });

  socket.on('player-done', () => {
    const room = findRoom(socket.id);
    if (!room || room.phase !== 'painting') return;
    room.doneSet.add(socket.id);
    const doneCount = room.doneSet.size;
    const totalCount = Object.keys(room.players).length;
    io.to(room.code).emit('player-done', { playerId: socket.id, doneCount, totalCount });
    if (doneCount >= totalCount) {
      clearInterval(room.timer);
      room.timer = null;
      startListening(room);
    }
  });

  socket.on('disconnect', () => {
    const room = findRoom(socket.id);
    if (!room) return;
    room.doneSet?.delete(socket.id);
    delete room.players[socket.id];
    const remaining = Object.values(room.players);
    // If everyone still connected already pressed done, end early
    if (room.phase === 'painting' && remaining.length > 0 &&
        room.doneSet && remaining.every(p => room.doneSet.has(p.id))) {
      clearInterval(room.timer);
      room.timer = null;
      startListening(room);
      return;
    }
    if (remaining.length === 0) { clearTimer(room); rooms.delete(room.code); return; }
    let newHostId;
    if (room.hostId === socket.id) {
      room.hostId = remaining[0].id;
      remaining[0].isHost = true;
      newHostId = room.hostId;
    }
    io.to(room.code).emit('player-left', { playerId: socket.id, newHostId });
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`MusicBox server on :${PORT}`));
